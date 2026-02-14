# Studio `api_v1` 动态密钥改造方案（基于当前 Nest 后端实际代码）

<!-- cspell:words ECDH HKDF HMAC hmac spki -->

> 更新时间：2026-02-13  
> 调研范围：`docs/api/*` + `apps/server/src/*` + `apps/studio/src/api_v1/*`  
> 目标：在**不引入 Redis 等新中间件**前提下，落地“动态密钥 + 一次性请求证明 + 应用层加密”。

---

## 0. 先说结论（结合现状后的调整）

上一版“`/security/relay` 全量代理路由”方案理论可行，但和当前后端结构耦合不理想（会影响现有控制器、Swagger、审计追踪路径）。

基于现有代码，推荐改为：

1. **保留现有所有业务路由不变**（`/auth`、`/documents`、`/blocks`...）。
2. 新增 **安全通道握手接口**（放在现有 `security` 模块下）。
3. 用 **中间件 + 现有全局拦截器/过滤器增强** 实现：
   - 入站解密
   - 防重放校验
   - 出站加密（成功/失败统一）
4. 防重放使用 **数据库唯一约束**，不依赖 Redis。

---

## 1. 当前后端实际约束（调研结论）

## 1.1 全局行为

- API 前缀：`/api/v1`（`main.ts` + `app.config.ts`）。
- 全局 `ValidationPipe` 已开启（白名单+类型转换）。
- 全局响应包装：`TransformInterceptor`，统一输出 `{ success, data }`。
- 全局异常格式：`HttpExceptionFilter`，统一输出 `{ success:false, error:{...} }`。
- 审计：`SecurityModule` 里有全局 `AuditLogInterceptor`（基于 `@AuditLog`）。

## 1.2 认证与会话

- JWT + refresh token 已完整实现（`auth.service.ts`）。
- 已有 `sessions` 表与 `Session` 实体，可复用 `sessionId/userId` 关联。

## 1.3 路由现实

- 现有业务路由约 48 条（openapi）。
- 存在文件流接口：
  - `POST /assets/upload`（multipart）
  - `GET /assets/:assetId/file`（`StreamableFile`）

=> 说明：**JSON 接口可先全加密，文件接口分阶段处理最稳妥**。

---

## 2. 改造目标（本版）

1. Studio 的 `api_v1` 默认走动态密钥通道（可灰度开关）。
2. JSON 请求/响应全密文（应用层），并防重放。
3. 一次性请求证明：`reqId + nonce + ts + HMAC`。
4. 不改业务 Controller 的 DTO 与 Service 逻辑。
5. 兼容现有 `TransformInterceptor`、`HttpExceptionFilter`、`AuditLogInterceptor`。

---

## 3. 总体设计（兼容现有路由版）

```text
1) 登录拿 JWT
2) POST /security/channel/init -> 建立 secure channel（ECDH）
3) 业务请求仍走原 URL（如 /documents/:docId）
   - Header 带 channel + nonce + ts + sig
   - Body/Query 为密文封包
4) 服务端中间件解密并还原 req.body / req.query
5) 业务逻辑正常执行
6) 响应在拦截器/过滤器阶段再加密返回
```

---

## 4. 协议设计（v1）

## 4.1 握手接口

### `POST /api/v1/security/channel/init`（需 JWT）

请求：

```json
{
  "clientPublicKey": "base64(spki)",
  "clientRandom": "base64(16B)",
  "deviceId": "web-uuid"
}
```

响应：

```json
{
  "channelId": "sch_xxx",
  "serverPublicKey": "base64(spki)",
  "serverRandom": "base64(16B)",
  "expiresAt": "2026-02-13T12:00:00.000Z",
  "serverTime": 1739448000000,
  "cipherSuite": "ECDH_P256+HKDF_SHA256+AES_256_GCM+HMAC_SHA256"
}
```

派生：

- `sharedSecret = ECDH(P-256)`
- `master = HKDF(sharedSecret, clientRandom + serverRandom, "api-v1-secure")`
- `encKey`（AES-256-GCM）+ `macKey`（HMAC-SHA256）

## 4.2 业务请求头

- `x-sec-enabled: 1`
- `x-sec-channel-id: sch_xxx`
- `x-sec-req-id: uuid`
- `x-sec-nonce: base64(16B)`
- `x-sec-ts: 1739448000123`
- `x-sec-sig: base64(hmac)`
- `x-sec-kv: v1`

## 4.3 业务请求体（JSON）

```json
{
  "v": 1,
  "iv": "base64(12B)",
  "ciphertext": "base64(...)"
}
```

明文载荷：

```json
{
  "body": { "...": "..." },
  "query": { "...": "..." }
}
```

签名串（建议）：

```text
method + "\n" + path + "\n" + reqId + "\n" + nonce + "\n" + ts + "\n" + iv + "\n" + ciphertext
```

## 4.4 响应体（成功/失败同构）

```json
{
  "v": 1,
  "iv": "base64(12B)",
  "ciphertext": "base64(...)",
  "sig": "base64(hmac)"
}
```

> 明文内容仍是现有标准结构（`{success,data}` 或 `{success:false,error}`）。

---

## 5. 后端设计（Nest，贴合当前结构）

## 5.1 模块落位

直接在现有 `src/modules/security` 下扩展：

```text
security/
  secure-channel.controller.ts
  secure-channel.service.ts
  secure-crypto.service.ts
  secure-replay.service.ts
  dto/
    init-secure-channel.dto.ts
  middleware/
    secure-transport.middleware.ts
```

并在 `security.module.ts` 注册中间件（对目标路由生效）。

## 5.2 新增数据表（无 Redis）

### 1) `secure_channels`

字段建议：

- `channel_id`（唯一）
- `user_id`
- `session_id`（可空，关联现有 `sessions.sessionId`）
- `key_cipher`（对称包裹后的 key material）
- `key_iv`
- `key_tag`
- `device_id`
- `status`（active/closed/expired）
- `expires_at`
- `last_activity_at`
- `created_at`

### 2) `secure_replay_guard`

字段建议：

- `channel_id`
- `req_id`
- `nonce`
- `expire_at`
- `created_at`

唯一约束：

- `unique(channel_id, req_id)`
- `unique(channel_id, nonce)`

> 通过数据库唯一约束实现跨实例防重放；定时清理过期记录。

## 5.3 请求处理顺序

`SecureTransportMiddleware`（入站）：

1. 检查 `x-sec-enabled`。
2. 读取 channel，检查过期。
3. 校验 `ts` 时间窗（默认 ±60s）。
4. 插入 `secure_replay_guard`（若唯一冲突 => 重放）。
5. 验签（HMAC）。
6. 解密，回填 `req.body` / `req.query`。
7. 将 `req.secureContext` 挂载到 request。

业务 Controller/Service 正常执行（无感）。

`TransformInterceptor`（出站增强）：

- 若 `req.secureContext` 存在，则把标准成功响应再加密后返回。
- `StreamableFile` 维持现状（不加密，见分期策略）。

`HttpExceptionFilter`（出错增强）：

- 若 `req.secureContext` 存在，错误响应也按安全封包加密。

## 5.4 与审计日志的兼容

- 因中间件已提前解密，`AuditLogInterceptor` 拿到的是明文业务字段，不破坏现有审计逻辑。
- 新增安全事件记录（复用 `SecurityService.logEvent`）：
  - `SECURE_CHANNEL_INIT`
  - `SECURE_REPLAY_BLOCKED`
  - `SECURE_SIGNATURE_INVALID`
  - `SECURE_DECRYPT_FAILED`

## 5.5 错误码补充

在现有 `ErrorCode` 基础上新增：

- `SECURE_7001` `SECURE_CHANNEL_INVALID`
- `SECURE_7002` `SECURE_CHANNEL_EXPIRED`
- `SECURE_7003` `SECURE_TIMESTAMP_INVALID`
- `SECURE_7004` `SECURE_SIGNATURE_INVALID`
- `SECURE_7005` `SECURE_REPLAY_DETECTED`
- `SECURE_7006` `SECURE_DECRYPT_FAILED`

---

## 6. 前端设计（Studio `api_v1`）

## 6.1 改造点（集中）

- `apps/studio/src/api_v1/client.ts`：axios 请求/响应拦截器。
- 新增：
  - `secureCrypto.ts`
  - `secureSession.ts`
  - `secureTransport.ts`

## 6.2 请求侧

1. 非加密开关：走原逻辑。
2. 加密开关开启：
   - 自动确保 channel 可用（初始化/续期）。
   - JSON 请求封包加密。
   - 注入 `x-sec-*` 头并签名。
3. `multipart/form-data` 暂不做 payload 加密（一期先签名+JWT）。

## 6.3 响应侧

- 识别安全封包 -> 验签 -> 解密 -> 恢复原 `{success,data}` 结构 -> 继续 `unwrap`。

## 6.4 前端环境变量

- `VITE_API_SECURE_ENABLED=true`
- `VITE_API_SECURE_FORCE=false`（握手失败是否降级）
- `VITE_API_SECURE_SKEW_MS=60000`

---

## 7. 文件上传/下载策略（分期）

## 一期（本次）

- `/assets/upload`、`/assets/:assetId/file` 不做 payload 加密。
- 仍走 JWT + 可选签名头（防篡改）。

## 二期

- 文件分片加密上传（前端 AES-GCM 分片，后端存密文）。
- 下载流式解密（视性能再评估）。

---

## 8. 实施计划（可直接排期）

### M1：后端通道能力（2~3 天）

- 新增 `secure_channels` / `secure_replay_guard` 实体+迁移。
- `channel/init` 打通（ECDH+HKDF+入库）。

### M2：中间件与出站加密（2~4 天）

- `SecureTransportMiddleware` 入站解密+防重放。
- 改造 `TransformInterceptor` / `HttpExceptionFilter` 支持安全输出。

### M3：前端 `api_v1` 改造（2~3 天）

- channel 管理 + 请求签名 + 响应解密。
- `ApiTest` 页面增加 secure 开关与调试信息。

### M4：灰度与加固（1~2 天）

- 按环境灰度启用。
- 指标与日志观察后再 `force=true`。

---

## 9. 验收清单

- [ ] JSON 接口在 secure 开启后全部可用。
- [ ] 重放同一 `reqId` 或 `nonce` 被拒绝。
- [ ] 改动密文 1 bit 会失败（验签或解密失败）。
- [ ] 过期 channel 可自动续建。
- [ ] token refresh 后 channel 自动重建。
- [ ] 关闭 secure 开关可完整回退旧链路。

---

## 10. 风险与现实说明

1. “一次性 token 被偷也没用”不是绝对，仍有**抢先发送**窗口（race）。
2. 通过 `reqId+nonce+ts+签名+短时效` 可把风险压到可接受范围。
3. 无 Redis 但使用数据库唯一约束，已可满足多实例防重放。
4. 路由路径本身（如 `/documents/:docId`）仍是可见元数据；若追求“路径也隐藏”，需再上 relay 模式（二阶段评估）。

---

## 11. 本次建议落地版本（最小可行）

先做以下组合并上线灰度：

1. `POST /security/channel/init`
2. JSON 接口入站解密 + 出站加密
3. DB 防重放唯一约束
4. Studio `api_v1` 开关化接入

这版最贴合你当前 Nest 架构，改动集中、可回退、可迭代。
