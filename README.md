# InfiniteDoc

InfiniteDoc 是一个面向**超大文档场景**的文档系统。  
立意是「**无限文档**」——文档长度不设限，支持超大规模内容的编辑、管理与发布展示。

## 项目定位

- **@infinitedoc/studio**：文档创作与管理端（React + Vite）
- **@infinitedoc/publish**：已发布文档展示端（Nuxt）
- **@infinitedoc/server**：后端 API 服务（NestJS + PostgreSQL）

> 当前仓库已采用 pnpm workspaces 管理，后续会逐步抽离共享模块到 `packages/`。

## 仓库结构

```text
.
├─ apps/
│  ├─ studio/       # @infinitedoc/studio
│  ├─ publish/      # @infinitedoc/publish（Nuxt 展示端）
│  └─ server/       # @infinitedoc/server（Nest API）
├─ packages/        # 共享模块预留（types/api/utils 等）
├─ docs/
├─ package.json
└─ pnpm-workspace.yaml
```

## 快速开始（根目录）

```bash
pnpm install

# 默认启动 Studio
pnpm dev

# 分别启动
pnpm dev:studio
pnpm dev:publish
pnpm dev:server

# 同时启动三个子项目
pnpm dev:all

# 若你使用 npm，也可直接执行
npm run dev:studio
```

## 构建与检查

```bash
# 全量
pnpm build
pnpm lint
pnpm lint:strict
pnpm format:check
pnpm spellcheck

# 分项目
pnpm build:studio
pnpm build:publish
pnpm build:server
pnpm lint:studio
pnpm lint:publish
pnpm lint:server

pnpm --filter @infinitedoc/studio build
pnpm --filter @infinitedoc/publish build
pnpm --filter @infinitedoc/server build
```

## 代码检查（ESLint）

仓库在根目录统一维护企业级 ESLint Flat Config（`eslint.config.mjs`）：

- 基础规则：`@eslint/js` + `typescript-eslint`
- React 规则：`react-hooks` + `react-refresh`（用于 studio）
- Vue 规则：`eslint-plugin-vue`（用于 publish）
- 与 Prettier 对齐：`eslint-config-prettier`

## 代码格式化（Prettier）

仓库在根目录统一维护 Prettier 配置（`.prettierrc.json` + `.prettierignore`），并配合
`.editorconfig` 统一缩进与换行规则：

```bash
# 执行格式化
pnpm format

# 仅检查格式（CI 推荐）
pnpm format:check

# CI 场景（不依赖本地缓存）
pnpm format:check:ci
```

## 拼写检查（CSpell）

```bash
# 本地（带缓存）
pnpm spellcheck

# CI（不依赖缓存）
pnpm spellcheck:ci
```

## 下一步

- 按优先级逐步抽离共享模块（`types` → `api-client` → `utils`）
- 保持 studio / publish 独立构建、独立发布
