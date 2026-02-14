const PRETTIER_FILE_RE =
  /\.(js|jsx|ts|tsx|mjs|cjs|cts|mts|vue|css|scss|less|html|json|md|yml|yaml)$/i;
const ESLINT_FILE_RE = /\.(js|jsx|ts|tsx|mjs|cjs|cts|mts|vue)$/i;
const CSPELL_FILE_RE = /\.(js|jsx|ts|tsx|mjs|cjs|cts|mts|vue|md)$/i;

const normalizePath = (file) => file.replaceAll("\\", "/");
const quoteFile = (file) => `"${file}"`;

const chunkFiles = (files, size) => {
  const chunks = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
};

const buildChunkCommands = (baseCommand, files, chunkSize) => {
  if (files.length === 0) {
    return [];
  }

  return chunkFiles(files, chunkSize).map(
    (chunk) => `${baseCommand} ${chunk.map(quoteFile).join(" ")}`,
  );
};

export default {
  // 单一入口，避免多个 glob 并发导致的资源竞争/SIGKILL。
  "*": (stagedFiles) => {
    const files = stagedFiles.map(normalizePath);

    const prettierFiles = files.filter((file) => PRETTIER_FILE_RE.test(file));
    const eslintFiles = files.filter((file) => ESLINT_FILE_RE.test(file));
    const cspellFiles = files.filter((file) => CSPELL_FILE_RE.test(file));

    return [
      // 1) 先格式化（分批，防止超长命令）
      ...buildChunkCommands("prettier --write", prettierFiles, 40),

      // 2) 再 eslint（开启缓存并分批，降低 pre-commit 压力）
      ...buildChunkCommands("eslint --fix --cache --cache-strategy content", eslintFiles, 15),

      // 3) 最后拼写检查（分批，且允许文件不存在时跳过）
      ...buildChunkCommands(
        "cspell lint --no-progress --gitignore --no-must-find-files",
        cspellFiles,
        20,
      ),
    ];
  },
};
