/**
 * 扫描 docs 下所有 .md 文件,提取远程图片链接清单(只读,不改文件)。
 * 用法: node scripts/scan-remote-images.mjs
 * 输出: scripts/tmp/remote-images.json
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

/** 递归收集 docs 下所有 .md 文件 */
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

/** 从文本行提取远程图片引用(markdown + <img>) */
function extractRefs(line, lineNo, fileRel, out) {
  const mdRe = /!\[([^\]]*)\]\((\S+?)(?:\s+["'][^"']*["'])?\)/g;
  const imgRe = /<img[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = mdRe.exec(line)) !== null) {
    const url = m[2];
    if (/^https?:\/\//i.test(url))
      out.push({ file: fileRel, line: lineNo, raw: m[0], url, alt: m[1] });
  }
  while ((m = imgRe.exec(line)) !== null) {
    const url = m[1];
    if (/^https?:\/\//i.test(url))
      out.push({ file: fileRel, line: lineNo, raw: m[0], url, alt: "" });
  }
}

const files = collectMdFiles(docsRoot);
const refs = [];
for (const abs of files) {
  const fileRel = abs
    .slice(docsRoot.length + 1)
    .split(sep)
    .join("/");
  const lines = readFileSync(abs, "utf8").split("\n");
  lines.forEach((line, i) => extractRefs(line, i + 1, fileRel, refs));
}

const remoteRefs = refs.filter((r) => /^https?:\/\//i.test(r.url));
const uniqueUrls = [...new Set(remoteRefs.map((r) => r.url))];

const byHost = {};
for (const u of uniqueUrls) {
  const host = new URL(u).host;
  byHost[host] = (byHost[host] || 0) + 1;
}

const data = {
  totalFiles: files.length,
  totalRefs: remoteRefs.length,
  uniqueUrls: uniqueUrls.length,
  byHost,
  refs: remoteRefs,
};

const tmp = join(__dirname, "tmp");
if (!existsSync(tmp)) mkdirSync(tmp, { recursive: true });
writeFileSync(
  join(tmp, "remote-images.json"),
  JSON.stringify(data, null, 2),
  "utf8",
);

console.log("md 文件数:", data.totalFiles);
console.log("远程图片引用总次数:", data.totalRefs);
console.log("去重唯一 URL 数:", data.uniqueUrls);
for (const [host, c] of Object.entries(byHost)) console.log(`  ${host}: ${c}`);
console.log("\n示例前 20:");
data.refs
  .slice(0, 20)
  .forEach((r) => console.log(`  ${r.file}:${r.line}  ${r.url}`));
