# 安全通道（Dynamic Key + 应用层加密）设计与使用指南

> 适用范围：`apps/server`（Nest 后端）
>
> 文档目标：解释本次“动态密钥安全通道”增强的架构设计、实现细节、落地方式、运维手册与扩展路线。

## 1. 为什么要做这次增强

在仅依赖 HTTPS + JWT 的模式下，业务报文仍然是可读 JSON（到达服务端时为明文对象），难以满足以下诉求：

1. 对关键业务参数做额外的应用层保密与防篡改。
2. 抵御重放攻击（同一请求包反复提交）。
3. 在不改现有业务 Controller/Service 的前提下增强安全能力。
4. 兼容现有全局响应包装、异常过滤器、审计日志体系。

因此本次设计采用“**保留原路由 + 增加安全通道层**”方式，而不是新增 relay 转发网关。

---

## 2. 目标与边界

## 2.1 目标

- 增加握手接口：`POST /api/v1/security/channel/init`。
- JSON 接口支持：入站解密、验签、防重放、出站加密。
- 支持灰度：`enabled` / `force` 双开关。
- 保持业务层无感：Controller/Service 继续收明文 `req.body` / `req.query`。

## 2.2 当前边界（一期）

- `multipart/form-data`（如上传）不做 payload 加密。
- `StreamableFile`（如文件下载）不做 payload 加密。
- 防重放使用 PostgreSQL 唯一约束，不引入 Redis。

---

## 3. 架构总览

```text
客户端(Studio api_v1)
   │
   │ 1) JWT 登录
   │ 2) /security/channel/init (ECDH)
   │
   ▼
SecureTransportMiddleware
   - 读取 x-sec-* 头
   - 校验时间窗
   - 防重放入库（unique）
   - HMAC 验签
   - AES-GCM 解密
   - 回填 req.body / req.query
   - 挂载 req.secureContext
   │
   ▼
业务 Controller / Service（无感）
   │
   ├─ TransformInterceptor
   │    - 先包装 { success, data }
   │    - 若 req.secureContext 存在，则加密后返回
   │
   └─ HttpExceptionFilter
        - 统一错误结构
        - 若 req.secureContext 存在，则加密错误包
```

---

## 4. 协议与密码学设计

## 4.1 握手阶段

- 算法套件：`ECDH_P256 + HKDF_SHA256 + AES_256_GCM + HMAC_SHA256`
- 输入：
  - `clientPublicKey`：`base64(spki)`
  - `clientRandom`：`base64(16B)`
- 过程：
  1. 服务端生成临时 ECDH 密钥对（P-256）
  2. 计算 `sharedSecret`
  3. `master = HKDF(sharedSecret, clientRandom + serverRandom, "api-v1-secure")`
  4. `encKey = master[0..31]`，`macKey = master[32..63]`

## 4.2 密钥落库方式（KEK 包裹）

为避免明文通道密钥入库：

- 使用环境变量 `SECURE_KEK_BASE64`（32B）作为 KEK。
- 将 `{ encKey, macKey }` 通过 `AES-256-GCM` 包裹后存入：
  - `key_cipher`
  - `key_iv`
  - `key_tag`

这使得数据库泄漏时，攻击者无法直接得到通道明文密钥（仍需 KEK）。

## 4.3 请求签名串

签名材料：

```text
method + "\n" + path + "\n" + reqId + "\n" + nonce + "\n" + ts + "\n" + iv + "\n" + ciphertext
```

- `sig = base64(HMAC_SHA256(macKey, signMaterial))`
- 服务端使用 `timingSafeEqual` 比较签名，避免时序侧信道。

---

## 5. 数据模型

## 5.1 `secure_channels`

职责：保存通道元数据与 KEK 包裹后的 key material。

关键字段：

- `channel_id`（唯一）
- `user_id`
- `session_id`（可空，尝试绑定 JWT 对应会话）
- `key_cipher/key_iv/key_tag`
- `status`（`active|closed|expired`）
- `expires_at`
- `last_activity_at`

## 5.2 `secure_replay_guard`

职责：防重放。

唯一约束：

- `unique(channel_id, req_id)`
- `unique(channel_id, nonce)`

判定逻辑：

- 首次写入成功 => 非重放
- 违反唯一约束（PG `23505`）=> 重放请求，拒绝

---

## 6. 服务端实现拆分

## 6.1 `SecureCryptoService`

职责：

- ECDH/HKDF 派生
- KEK 包裹与解包
- 请求解密/响应加密封装

特点：

- KEK 未配置或长度非法时，直接抛服务端配置错误。
- 解包失败统一转为 `SECURE_DECRYPT_FAILED`。

## 6.2 `SecureChannelService`

职责：

- 初始化通道并持久化
- 通道有效性校验（状态 + 过期）
- 基于通道实体构造 `SecureRequestContext`
- 按最小频率更新 `last_activity_at`

## 6.3 `SecureReplayService`

职责：

- 入站时写 `secure_replay_guard`
- 捕获唯一冲突并转换为 `SECURE_REPLAY_DETECTED`
- 周期性惰性清理过期记录

## 6.4 `SecureTransportMiddleware`

职责（入站安全网关）：

1. 识别 `x-sec-enabled`。
2. `force=true` 时，非白名单接口拒绝明文请求。
3. 解析 `x-sec-*` 头并校验。
4. 校验 `ts` 时间窗（`SECURE_CLOCK_SKEW_MS`）。
5. 防重放写库（唯一约束）。
6. 验签（HMAC）。
7. 解密封包，回填 `req.body` / `req.query`。
8. 挂载 `req.secureContext` 供出站加密使用。

---

## 7. 出站统一加密

## 7.1 成功响应

`TransformInterceptor` 现在行为：

1. 先产出标准结构 `{ success: true, data }`
2. 若存在 `req.secureContext`，再加密为：

```json
{
  "v": 1,
  "iv": "base64(12B)",
  "ciphertext": "base64(...)",
  "sig": "base64(hmac)"
}
```

## 7.2 异常响应

`HttpExceptionFilter` 现在行为：

1. 先生成标准错误结构 `{ success:false, error:{...} }`
2. 若存在 `req.secureContext`，同样封包加密返回
3. 若加密失败，记录日志并回退明文错误（避免请求悬挂）

---

## 8. 配置项说明（`.env`）

| 变量                         | 说明                               | 默认              |
| ---------------------------- | ---------------------------------- | ----------------- |
| `SECURE_CHANNEL_ENABLED`     | 是否启用安全通道能力               | `false`           |
| `SECURE_CHANNEL_FORCE`       | 是否强制非白名单 JSON 接口必须加密 | `false`           |
| `SECURE_CHANNEL_TTL_SECONDS` | 通道有效期（秒）                   | `1800`            |
| `SECURE_CLOCK_SKEW_MS`       | 允许客户端时间偏差                 | `60000`           |
| `SECURE_REPLAY_TTL_SECONDS`  | 防重放记录有效期（秒）             | `120`             |
| `SECURE_KEK_BASE64`          | KEK（32 字节 Base64）              | 空                |
| `SECURE_OPEN_PATHS`          | 白名单路径（支持 `:param`）        | 见 `.env.example` |

---

## 9. 新增接口说明

## `POST /api/v1/security/channel/init`

- 鉴权：JWT（`Authorization: Bearer ...`）
- 入参：

```json
{
  "clientPublicKey": "base64(spki)",
  "clientRandom": "base64(16B)",
  "deviceId": "web-uuid"
}
```

- 出参：

```json
{
  "success": true,
  "data": {
    "channelId": "sch_xxx",
    "serverPublicKey": "base64(spki)",
    "serverRandom": "base64(16B)",
    "expiresAt": "2026-02-14T08:00:00.000Z",
    "serverTime": 1760000000000,
    "cipherSuite": "ECDH_P256+HKDF_SHA256+AES_256_GCM+HMAC_SHA256"
  }
}
```

---

## 10. 错误码与安全事件

## 10.1 错误码

- `SECURE_7001` `SECURE_CHANNEL_INVALID`
- `SECURE_7002` `SECURE_CHANNEL_EXPIRED`
- `SECURE_7003` `SECURE_TIMESTAMP_INVALID`
- `SECURE_7004` `SECURE_SIGNATURE_INVALID`
- `SECURE_7005` `SECURE_REPLAY_DETECTED`
- `SECURE_7006` `SECURE_DECRYPT_FAILED`

## 10.2 安全事件

- `SECURE_CHANNEL_INIT`
- `SECURE_REPLAY_BLOCKED`
- `SECURE_SIGNATURE_INVALID`
- `SECURE_DECRYPT_FAILED`

这些事件统一进入现有 `security_logs`，便于复用当前审计查询链路。

---

## 11. 与现有系统能力的关系

## 11.1 与审计日志

中间件在业务执行前完成解密，`AuditLogInterceptor` 拿到的仍是明文业务字段，不需要改现有审计实现。

## 11.2 与限流

限流仍走 `RuntimeConfigModule` + `ThrottlerGuard`，与安全通道正交。

- 推荐运维顺序：先启用 `enabled=true` 灰度，再逐步 `force=true`。

## 11.3 与上传/下载

`multipart` 与 `StreamableFile` 处于一期豁免范围，依赖 JWT + 白名单策略。

---

## 12. 灰度上线建议

1. **阶段 A（观察）**：`enabled=true, force=false`
   - Studio 仅部分用户启用 secure
   - 观察签名失败率、重放拦截率、握手成功率

2. **阶段 B（扩大）**：扩大 secure 客户端覆盖率

3. **阶段 C（强制）**：`force=true`
   - 保留必要白名单（登录、刷新、上传、下载、握手）

4. **阶段 D（收敛）**：按实际流量进一步缩小白名单

---

## 13. 运维排障手册

## 13.1 常见问题

### Q1: `SECURE_TIMESTAMP_INVALID`

- 客户端系统时间偏差过大
- 解决：校时（NTP）或临时放宽 `SECURE_CLOCK_SKEW_MS`

### Q2: `SECURE_SIGNATURE_INVALID`

- 签名串字段顺序不一致
- path 带 query 或不带 query 规则不一致
- Base64 编码不一致（URL-safe 与标准 Base64 混用）

### Q3: `SECURE_REPLAY_DETECTED`

- 客户端重试错误复用 `reqId`/`nonce`
- 解决：每次请求都生成新的 `reqId + nonce`

### Q4: `SECURE_DECRYPT_FAILED`

- 客户端/服务端 `encKey` 不一致
- 握手之后通道失效但客户端未续建
- `SECURE_KEK_BASE64` 配置错误导致服务端无法正确解包

---

## 14. 安全性说明（务实版）

- 安全通道不是“绝对不可攻击”，但可显著提高攻击成本。
- 抢先发送（race）仍有理论窗口；通过 `reqId+nonce+ts+短时效+签名` 已将风险压缩到可控区间。
- 强烈建议：
  1. 继续保留 HTTPS
  2. 生产环境使用高熵 KEK（密钥平台注入）
  3. 增加安全日志告警策略

---

## 15. 下一步演进（建议）

1. 将 `secure.*` 配置接入 Runtime Config Center（做到在线调参）。
2. 增加通道主动关闭接口与会话联动失效策略。
3. 为文件上传/下载增加分片加密方案（第二阶段）。
4. 为 secure 指标建立 Prometheus 维度：
   - 握手成功率
   - 验签失败率
   - 重放拦截率
   - 解密失败率

---

## 16. 本次改造影响清单（代码层）

- 新增配置：`secure.config.ts`
- 新增实体：`SecureChannel`、`SecureReplayGuard`
- 新增迁移：`CreateSecureTransportTables`
- 新增服务/控制器/中间件：
  - `SecureCryptoService`
  - `SecureChannelService`
  - `SecureReplayService`
  - `SecureChannelController`
  - `SecureTransportMiddleware`
- 改造：
  - `SecurityModule`（注册中间件与服务）
  - `AppModule`（实体注册）
  - `TransformInterceptor`（安全出站加密）
  - `HttpExceptionFilter`（安全错误加密）
  - `main.ts`（CORS 允许 `x-sec-*` 头）

> 至此，一期“动态密钥安全通道”已经形成可灰度、可回退、可扩展的基础能力。
