/**
 * 阶段1: 将 javaguide.cn 站内自引用改写为本地路径(仅改 markdown 链接语法,不动图片/前置元数据)。
 * 用法:
 *   node scripts/rewrite-self-links.mjs          # dry-run,输出报告不写文件
 *   node scripts/rewrite-self-links.mjs --apply  # 实际改写
 * 输出: scripts/tmp/self-link-rewrite-report.json
 */
import {
  readdirSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, "..", "docs");
const APPLY = process.argv.includes("--apply");

/** 已知失效路径纠正表(线上旧路径 → 本地实际路径) */
const STALE_FIX = {
  "/ai-coding/claudecode-commands.html":
    "/ai-coding/practices/claudecode-commands.html",
  "/ai-coding/claudecode-tips.html":
    "/ai-coding/practices/claudecode-tips.html",
  "/ai-coding/programmer-essential-skills.html":
    "/ai-coding/practices/programmer-essential-skills.html",
  "/distributed-system/rpc/http&rpc.html":
    "/distributed-system/rpc/rpc-intro.html",
};

/** 非知识文档,保留外链 */
const KEEP_EXTERNAL = new Set(["/feed.json", "/article/", "/404.html"]);

/** javaguide.cn 页面路径 → 本地相对 md 是否存在 */
function resolveLocalPath(pathname) {
  if (pathname === "/" || pathname === "") return "/";
  if (STALE_FIX[pathname]) return STALE_FIX[pathname];
  if (KEEP_EXTERNAL.has(pathname)) return null;

  // 目录形式 /books/ → docs/books/README.md
  if (pathname.endsWith("/")) {
    const rel = pathname.slice(1, -1);
    if (rel && existsSync(join(docsRoot, rel, "README.md"))) return pathname;
    return null;
  }
  // 页面形式 /foo/bar.html → docs/foo/bar.md
  if (pathname.endsWith(".html")) {
    const rel = pathname.slice(1).replace(/\.html$/, "");
    if (rel && existsSync(join(docsRoot, `${rel}.md`))) return pathname;
    return null;
  }
  return null;
}

/** 收集所有 md 文件 */
function collectMdFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".vuepress" || entry.name === "node_modules") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) collectMdFiles(abs).forEach((f) => out.push(f));
    else if (/\.mdx?$/i.test(entry.name)) out.push(abs);
  }
  return out;
}

const SELF_HOSTS = new Set(["javaguide.cn", "www.javaguide.cn"]);
const changes = [];
const keptExternal = [];
const skipped = [];

const files = collectMdFiles(docsRoot);
for (const abs of files) {
  const fileRel = abs
    .slice(docsRoot.length + 1)
    .split(sep)
    .join("/");
  const content = readFileSync(abs, "utf8");
  const lines = content.split("\n");
  let modified = false;

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    const rewriteUrl = (url, style) => {
      let u;
      try {
        u = new URL(url);
      } catch {
        return url;
      }
      if (!SELF_HOSTS.has(u.host)) return url;
      const localPath = resolveLocalPath(u.pathname);
      if (localPath === null) {
        keptExternal.push({ file: fileRel, line: lineNo, url, style });
        return url;
      }
      const target = `${localPath}${u.search}${u.hash}`;
      changes.push({
        file: fileRel,
        line: lineNo,
        style,
        url,
        target,
      });
      return target;
    };

    // 行内链接 [text](url "title") — 标题组必须为捕获组,否则 replace 回调第3参是 offset
    const inlineRe =
      /\[([^\]]*)\]\((https?:\/\/[^)\s]+?)(\s+["'][^"']*["'])?\)/g;
    line = line.replace(inlineRe, (full, text, url, title) => {
      const newUrl = rewriteUrl(url, "inline");
      if (newUrl === url) return full;
      modified = true;
      return `[${text}](${newUrl}${title ?? ""})`;
    });

    // 自动链接 <https://...> → 改写为内联链接 [<原URL>](<本地路径>),保留可见文本
    const autoRe = /<(https?:\/\/[^>\s]+)>/g;
    line = line.replace(autoRe, (full, url) => {
      const newUrl = rewriteUrl(url, "autolink");
      if (newUrl === url) return full;
      modified = true;
      return `[${url}](${newUrl})`;
    });

    if (modified) lines[i] = line;
  });

  if (modified) {
    if (APPLY) writeFileSync(abs, lines.join("\n"), "utf8");
  } else {
    skipped.push(fileRel);
  }
}

const report = {
  apply: APPLY,
  totalChanges: changes.length,
  keptExternal: keptExternal.length,
  changes,
  keptExternalList: keptExternal,
};
const tmp = join(__dirname, "tmp");
if (!existsSync(tmp)) mkdirSync(tmp, { recursive: true });
writeFileSync(
  join(tmp, "self-link-rewrite-report.json"),
  JSON.stringify(report, null, 2),
  "utf8",
);

console.log(`模式: ${APPLY ? "APPLY(已写入)" : "DRY-RUN(未写入)"}`);
console.log("改写总数:", changes.length);
console.log("保留外链:", keptExternal.length);
console.log("\n按目标路径统计:");
const byTarget = {};
for (const c of changes) byTarget[c.target] = (byTarget[c.target] || 0) + 1;
Object.entries(byTarget)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30)
  .forEach(([t, c]) => console.log(`  ${c}  ${t}`));
console.log("\n保留外链清单:");
for (const k of keptExternal) console.log(`  ${k.file}:${k.line}  ${k.url}`);
