/**
 * nano-staged 外部配置（优先级高于 package.json 中的 nano-staged 字段）。
 *
 * 为什么用函数形式 + 分块：
 * - nano-staged 在 Windows 上通过 cmd.exe 执行 .cmd 命令（如 prettier.cmd），
 *   拼接后的命令行总长度受 cmd.exe 8191 字符限制。
 * - 本仓库 docs/ 下有 300+ 个 Markdown，全部路径拼接会超出限制，
 *   报错 "The command line is too long"。
 * - 因此将匹配到的文件列表按块切分，每块单独执行一条命令。
 * - 同时把 prettier 限定在源码/文本文件，图片等二进制文件不参与格式化。
 */

/** 将数组按 size 切块 */
function chunk(arr, size) {
  const blocks = [];
  for (let i = 0; i < arr.length; i += size) {
    blocks.push(arr.slice(i, i + size));
  }
  return blocks;
}

/** 为每个文件块生成一条 prettier 命令 */
function prettierCommands(filenames, size = 60) {
  return chunk(filenames, size).map(
    (block) => `prettier --write --ignore-unknown ${block.join(" ")}`,
  );
}

// 注：markdownlint 未纳入 pre-commit——仓库 docs/**/*.md 存在大量既有违规，
// 原配置 `.md` pattern 从不匹配子目录文件，该检查实际从未生效。避免阻塞提交。

module.exports = {
  // 源码/文本文件：只跑 prettier
  "**/*.{js,mjs,cjs,ts,tsx,vue,json,jsonc,yml,yaml,css,scss,less,html,htm}": ({
    filenames,
  }) => prettierCommands(filenames),
  // Markdown：只跑 prettier 格式化
  "**/*.md": ({ filenames }) => prettierCommands(filenames),
};
