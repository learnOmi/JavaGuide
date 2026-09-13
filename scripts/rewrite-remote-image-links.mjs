/**
 * 将 md 中的远程图片链接替换为本地绝对路径引用（/assets/images/...）。
 * 依赖 scripts/tmp/remote-images.json 中的 refs（每条含 file/url/raw/line）。
 *
 * 替换策略（与下载脚本 download-remote-images.mjs 的 localRelPath 完全一致）：
 *   - 跳过：host 为 API_HOSTS、URL 带 token= / &e= 签名、无法解析路径
 *   - 目标本地路径 = /assets/images/{host}/<path 各段清洗>
 *   - 支持 markdown 图片与 <img src="..."> 两种形式；只替换 URL 部分，alt/包裹链接保留
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(__dirname, "tmp", "remote-images.json"), "utf8"),
);
const refs = Array.isArray(manifest.refs) ? manifest.refs : [];
const docsRoot = join(__dirname, "..", "docs");

const API_HOSTS = new Set(["api.star-history.com"]);

function shouldSkip(url) {
  const host = new URL(url).host;
  if (API_HOSTS.has(host)) return true;
  if (/token=/i.test(url)) return true;
  if (/\be=\d+&/.test(url)) return true;
  return false;
}

function sanitizeSegment(seg) {
  return (
    seg.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/^\.+|\.+$/g, "") || "_"
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
  if (segments.length === 0) return null;
  return join(u.host, ...segments);
}

/** 把文件里所有远程图片 URL 替换为本地路径，返回修改统计 */
function rewriteFile(abs, fileRel) {
  const lines = readFileSync(abs, "utf8").split("\n");
  const originals = refs.filter((r) => r.file === fileRel);
  if (originals.length === 0) return { changes: 0 };

  // url -> 本地替换串
  const urlToLocal = new Map();
  for (const r of originals) {
    if (shouldSkip(r.url)) continue;
    const rel = localRelPath(r.url);
    if (!rel) continue;
    const local = "/assets/images/" + rel.split("\\").join("/");
    urlToLocal.set(r.url, local);
  }

  let changes = 0;
  const outLines = lines.map((line) => {
    let changed = 0;
    let newLine = line;
    for (const [url, local] of urlToLocal) {
      // 仅替换以该 url 结尾的直接引用（含可能的闭合 )
      if (newLine.includes(url)) {
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newLine = newLine.replace(new RegExp(escaped, "g"), local);
        changed += 1;
      }
    }
    changes += changed;
    return newLine;
  });

  if (changes > 0) {
    writeFileSync(abs, outLines.join("\n"), "utf8");
  }
  return { changes };
}

let totalFiles = 0;
let totalChanges = 0;
const byFile = {};

// 仅对 manifest 中出现过远程图片的文件做写操作
const affectedFiles = [...new Set(refs.map((r) => r.file))];
for (const fileRel of affectedFiles) {
  const r = rewriteFile(join(docsRoot, fileRel.split("/").join("\\")), fileRel);
  if (r.changes > 0) {
    totalFiles += 1;
    totalChanges += r.changes;
    byFile[fileRel] = r.changes;
  }
}

console.log("重写文件数:", totalFiles);
console.log("URL 替换总次数:", totalChanges);
writeFileSync(
  join(__dirname, "tmp", "rewrite-report.json"),
  JSON.stringify(byFile, null, 2),
  "utf8",
);
console.log("报告已写入 scripts/tmp/rewrite-report.json");
