/** @type {import('cz-git').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  parserPreset: {
    parserOpts: {
      headerPattern: /^(\p{Extended_Pictographic}\s+)?(\w+)(\([\w\-./]+\))?:\s(.+)$/u,
      headerCorrespondence: ["emoji", "type", "scope", "subject"],
    },
  },
  rules: {
    // @see: https://commitlint.js.org/#/reference-rules
    "footer-leading-blank": [1, "always"],
    "header-max-length": [2, "always", 108],
    "subject-empty": [2, "never"],
    "type-empty": [2, "never"],
    "subject-case": [0],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
        "wip",
        "workflow",
        "types",
        "release",
      ],
    ],
  },

  prompt: {
    useEmoji: true,
    emojiAlign: "left",
    types: [
      { value: "feat", name: "✨ 新功能: 新增功能", emoji: "✨" },
      { value: "fix", name: "🐛 修复: 修复缺陷", emoji: "🐛" },
      { value: "docs", name: "📚 文档: 更新文档", emoji: "📚" },
      { value: "style", name: "🎨 样式: 格式调整（不影响代码运行）", emoji: "🎨" },
      { value: "refactor", name: "📦 重构: 代码重构（不新增功能也不修复 bug）", emoji: "📦" },
      { value: "perf", name: "🚀 性能: 提升性能", emoji: "🚀" },
      { value: "test", name: "🧪 测试: 添加测试", emoji: "🧪" },
      { value: "build", name: "🏗️ 构建: 构建系统或依赖变更", emoji: "🏗️" },
      { value: "ci", name: "🤖 CI: 持续集成相关", emoji: "🤖" },
      { value: "chore", name: "🔧 工具: 杂项/脚手架/辅助工具", emoji: "🔧" },
      { value: "revert", name: "⏪ 回滚: 回滚之前的提交", emoji: "⏪" },
      { value: "wip", name: "🚧 WIP: 临时提交（未完成）", emoji: "🚧" },
      { value: "workflow", name: "🔁 流程: 开发流程/脚本调整", emoji: "🔁" },
      { value: "types", name: "🧩 类型: 类型定义调整", emoji: "🧩" },
      { value: "release", name: "🏷️ 发布: 版本发布相关", emoji: "🏷️" },
    ],
    //   打开“前缀选择菜单”
    issuePrefixes: [
      { value: "Closes", name: "Closes: 合并到默认分支后自动关闭 Issue（如 #123）" },
      { value: "Refs", name: "Refs: 仅关联 Issue/PR（不自动关闭）" },

      { value: "Docs", name: "Docs: 相关文档/资料链接（设计/PRD/ADR/迁移指南）" },
      { value: "Video", name: "Video: 相关视频/录屏/会议回放链接" },

      {
        value: "Co-authored-by",
        name: "Co-authored-by: 标记共同作者（GitHub 会在提交/PR里展示协作者；格式 Name <email>）",
      },
    ],
    // 是否允许自定义前缀/跳过前缀
    allowCustomIssuePrefix: true,
    allowEmptyIssuePrefix: true,

    // monorepo 常用 scope（保留你的原有项 + 加了 studio/publish/docs/ci）
    scopes: [
      "root",
      "studio",
      "publish",
      "server",
      "frontend",
      "components",
      "utils",
      "docs",
      "ci",
      "config",
    ],
    allowCustomScopes: true,

    // 保持“精简提交流程”：不强制写 body/footer/breaking
    skipQuestions: [],

    messages: {
      type: "📌 请选择提交类型:",
      scope: "🎯 请选择影响范围 (可选):",
      subject: "📝 请简要描述更改:",
      body: "🔍 详细描述 (可选):",
      footerPrefix: "🏷️ 请选择 footer 前缀 (如: Refs / Closes / Co-authored-by / Docs):",
      footerPrefixesSelect: "🏷️ 选择 footer 前缀（可选）:",
      customFooterPrefix: "✍️ 输入自定义 footer 前缀:",
      footer: "🔗 填写 footer 内容 (可选，可多行；用于关联 Issue/资料链接/协作者等):",
      breaking: "💥 是否包含破坏性变更 (BREAKING CHANGE)? (如有请描述影响与迁移方式):",
      confirmCommit: "✅ 确认提交?",
    },
  },
};
