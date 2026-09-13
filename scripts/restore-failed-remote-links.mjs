/**
 * 恢复：把下载失败(404)却被重写成本地的图片引用还原为远程 URL。
 * 数据源：scripts/tmp/download-report.json 的 failed 清单（url）。
 * 目标：本地 ref = /assets/images/{localRelPath(url)}，将其替换回 url。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, "..", "docs");
const report = JSON.parse(
  readFileSync(join(__dirname, "tmp", "download-report.json"), "utf8"),
);

function sanitizeSegment(seg) {
  return (
    seg.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/^\.+|\.+$/g, "") || seg
  );
}
function localRelPath(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let pathname = decodeURIComponent(u.pathname);
  if (!pathname.startsWith("/")) pathname = "/" + pathname;
  const segments = pathname
    .split("/")
    .filter((s) => s !== "" && s !== ".")
    .map((s) => sanitizeSegment(s))
    .filter((s) => s !== "");
  if (!segments.length) return null;
  return join(u.host, ...segments);
}

// 构造 本地ref -> 远程url 映射（仅 failed）
const localToRemote = new Map();
for (const f of report.failed || []) {
  const rel = localRelPath(f.url);
  if (!rel) continue;
  const local = "/assets/images/" + rel.split("\\").join("/");
  // 若该路径本地已存在，说明有同名文件成功落在别处，不覆盖 —— 此处本地必不存在
  localToRemote.set(local, f.url);
}

import { readdirSync } from "node:fs";
function collectMd(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".vuepress" || e.name === "node_modules") continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) collectMd(abs).forEach((f) => out.push(f));
    else if (/\.mdx?$/i.test(e.name)) out.push(abs);
  }
  return out;
}

let restored = 0;
for (const abs of collectMd(docsRoot)) {
  let text = readFileSync(abs, "utf8");
  let changed = 0;
  for (const [local, remote] of localToRemote) {
    if (text.includes(local)) {
      const escaped = local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // 本地 ref 后可能带结尾括号 ) 或直接结尾；替换精确匹配的 ref 串
      const re = new RegExp(escaped.replace(/\./g, "\\."), "g");
      text = text.replace(re, remote);
      changed += 1;
    }
  }
  if (changed) {
    writeFileSync(abs, text, "utf8");
    restored += changed;
    console.log("还原", abs.slice(docsRoot.length), "x", changed);
  }
}
console.log("共还原替换:", restored);
