# Document Engine API 使用说明

本引擎为块级文档模型，支持版本、排序、快照与 diff，适合在前端/后端以同一接口操作。核心入口：`DocumentEngine`，存储接口：`Storage`（内置 `InMemoryStorage` 供 demo/测试）。

## 安装依赖
```bash
pnpm install
```
（依赖：`diff-match-patch`，已在项目中。）

## 快速开始
```ts
import { DocumentEngine } from "./engine";
import { InMemoryStorage } from "./storage";

const engine = new DocumentEngine(new InMemoryStorage(), { snapshotEvery: 5 });

// 创建文档（自动建 root block 和 docVer=1）
await engine.createDocument({ docId: "doc1", title: "Demo", createdBy: "u1" });

// 添加块（插在 root 末尾）
const { block } = await engine.createBlock({
  docId: "doc1",
  type: "paragraph",
  createdBy: "u1",
  payload: { schema: { type: "paragraph", ver: 1 }, body: { richText: { format: "md+", source: "Hello" } } },
});

// 更新内容（产生新的 block_version + docVer）
await engine.updateBlockContent({
  docId: "doc1",
  blockId: block._id,
  updatedBy: "u2",
  payload: { schema: { type: "paragraph", ver: 1 }, body: { richText: { format: "md+", source: "Hello world" } } },
});

// 获取渲染树（按 parentId + sortKey）
const tree = await engine.getRenderedTree("doc1");

// 查看 doc 版本列表
const docVers = await engine.listDocVersions("doc1");

// diff 两个 docVer
const diff = await engine.diffDocVersions("doc1", 1, docVers[0].docVer);
```

## 主要类型
- `DocumentMeta`：文档元信息（_id, title, head, publishedHead, rootBlockId, status, visibility…）
- `BlockIdentity`：块身份（_id, docId, type, latestVer, created/updated/deleted metadata）
- `BlockVersion`：块版本（parentId, sortKey, indent, collapsed, payload{schema/attrs/body}, hash, plainText, refs）
- `DocRevision`：文档版本记录（docVer, patches[{blockId, from, to}], message, branch, opSummary）
- `DocSnapshot`：快照（blockVersionMap）
- `RenderNode`：渲染树节点（id, ver, type, parentId, sortKey, indent, collapsed, payload, plainText, children）

## Storage 接口
`Storage` 定义了 get/save 文档、块、块版本、doc 版本、快照的方法，可替换为数据库实现。`InMemoryStorage` 为内存实现，API 与接口一致。

## DocumentEngine 构造
```ts
new DocumentEngine(storage: Storage, opts?: { snapshotEvery?: number });
```
- `snapshotEvery`：每多少个 docVer 自动创建快照（默认 50，0 表示关闭）。

## API 详解

### 文档
- `createDocument({ docId, title, createdBy, workspaceId? })`  
  创建文档并自动创建 root block（type:"root"，root 指向自己），生成初始 docVer=1。

- `getDocument(docId)` -> `DocumentMeta | null`

- `updateDocumentMeta(docId, updatedBy, patch)` -> `DocumentMeta`  
  支持 patch: `title | status | visibility | publishedHead`（publishedHead 不可超过 head）。

### 块（Block）
- `createBlock({ docId, type, createdBy, parentId?, afterBlockId?, beforeBlockId?, payload, indent?, createVersion? })`  
  在 parent 下按 `sortKey` 插入；未指定 parent 默认 root；传 after/before 控制位置。返回 `{ block, version }`。
  
  - `createVersion`：默认 `true`。
    - `true`：立即生成 doc revision（docVer +1）。
    - `false`：仅写入块 identity/version，并将变更累积到引擎内存中的 pending 队列，需后续调用 `commitPending()` 才会生成 doc revision。

- `updateBlockContent({ docId, blockId, updatedBy, payload, createVersion? })` -> `BlockVersion`  
  生成新版本并更新 block.latestVer。
  
  - `createVersion=true`（默认）：立即提交 doc revision。
  - `createVersion=false`：累积到 pending 队列，等待 `commitPending()`。

- `moveBlock({ docId, blockId, movedBy, toParentId, afterBlockId?, beforeBlockId?, indent?, createVersion? })` -> `BlockVersion`  
  变更 parent/sortKey/indent，生成新版本。
  
  - `createVersion=true`（默认）：立即提交 doc revision。
  - `createVersion=false`：累积到 pending 队列，等待 `commitPending()`。

- `deleteBlock({ docId, blockId, deletedBy, createVersion? })`  
  逻辑删除（标记 isDeleted=true）。
  
  - `createVersion=true`（默认）：立即生成 doc revision。
  - `createVersion=false`：记录为 pending（用于批量提交场景）。对接后端时服务端可能仍会强制删除立即生成版本，以服务端行为为准。

- `updateBlockAuthor({ docId, blockId, updatedBy, setCreatedBy? })` -> `BlockIdentity`  
  变更作者元数据，生成 doc revision（无版本变更）。

### 排序 & 结构
- `computeSortKey(docId, parentId, afterBlockId, beforeBlockId)`（内部使用）：基于当前 doc state 计算可插入的 sortKey。
- SortKey 工具（独立导出）：
  - `between(a, b)` 生成 a 与 b 之间的 key（支持无限插入）
  - `firstKey()` 初始中间值
  - `after(key)` 追加
  - `before(key)` 生成较小 key

### 版本 / 状态
- `getDocState(docId, docVer?)` -> `{ docId, docVer, rootBlockId, blockVersionMap }`  
  回放 revisions（可从最近快照起）得到目标 docVer 的 blockVersionMap。

- `getRenderedTree(docId, docVer?)` -> `RenderNode`  
  按 parentId + sortKey 组装树；若缺失版本/循环将返回占位节点防御。

- `listDocVersions(docId, limit=50)` -> `DocRevision[]`
- `listBlockVersions(blockId)` -> `BlockVersion[]`

- `createSnapshot(docId, docVer, createdBy?)` -> `DocSnapshot`  
  手动创建快照（自动快照由 `snapshotEvery` 控制）。

### Diff
- `diffDocVersions(docId, fromDocVer, toDocVer)` -> `{ from, to, changedBlocks }`  
  基于 doc state 版本映射进行差异分析。

- `diffBlockVersions(a: BlockVersion, b: BlockVersion)` (来自 `diff.ts`)  
  返回 `{ moved, structureChanged, contentChanged, textDiff (HTML) }`，其中 `textDiff` 基于 `plainText` 的 diff-match-patch。

- `flattenTree(renderNode)` -> `RenderNode[]` 深度优先展开，便于调试/显示。

## Payload/Hash/PlainText 约定
- 内容使用 Markdown+：`payload.body.richText = { format: "md+", source: string, ast?: any }`
- 自定义块：`type: "custom:xxx"`，`payload.schema.type` 同步。
- `plainText`：由 `extractPlainText` 从 payload 提取（优先 richText.source，否则 body.text）。
- `hash`：对 payload + 结构字段（parentId, sortKey, indent, collapsed）进行同步哈希（demo 用 FNV32，服务器可替换为真正 SHA256）。

## 渲染树占位/容错
- 若缺失 block 版本：返回 `custom:missing` 占位节点。
- 若检测到循环：返回 `custom:cycle` 占位节点，避免无限递归。

## 替换存储
实现 `Storage` 接口即可接入数据库（推荐对 docId/blockId/parentId 建索引）。保持 API 兼容即可无缝替换 `InMemoryStorage`。

## 常见用法示例片段
```ts
// 将块插入某兄弟之后
await engine.createBlock({
  docId: "doc1",
  type: "paragraph",
  createdBy: "u1",
  parentId: "root_doc1",
  afterBlockId: "b_prev",
  payload: { schema: { type: "paragraph", ver: 1 }, body: { richText: { format: "md+", source: "Insert after" } } },
});

// 移动块到另一父节点并调整 indent
await engine.moveBlock({
  docId: "doc1",
  blockId: "b_x",
  movedBy: "u2",
  toParentId: "b_newParent",
  beforeBlockId: "b_target",
  indent: 2,
});

// 获取指定 docVer 的渲染树
const treeAt3 = await engine.getRenderedTree("doc1", 3);

// block 版本 diff
const versions = await engine.listBlockVersions("b_x");
const diffBlock = diffBlockVersions(versions[0], versions[versions.length - 1]);

// 手动创建快照
await engine.createSnapshot("doc1", 10, "u_admin");
```

## 调试建议
- 开发期可使用 `InMemoryStorage`；接入后端时先替换 `Storage` 的 get/save 方法并复用 DocumentEngine。
- 若排序异常，可打印 siblings 的 sortKey 列表并使用 `between` 校验。
- 若 docVer 回放耗时长，可降低 `snapshotEvery` 或在热点版本手动创建快照。
