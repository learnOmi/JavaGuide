/**
 * 精确校验：对 manifest.refs 中每个未跳过的远程图片引用，验证其本地文件是否已存在。
 * 判定逻辑与下载/重写完全一致（localRelPath + shouldSkip），避免正则截断误报。
 * 输出缺失清单（若有）。
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, "..", "docs");
const publicRoot = join(docsRoot, ".vuepress", "public", "assets");
const manifest = JSON.parse(
  readFileSync(join(__dirname, "tmp", "remote-images.json"), "utf8"),
);
const refs = Array.isArray(manifest.refs) ? manifest.refs : [];

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

let checked = 0,
  missing = 0;
const missingList = [];
const unique = new Set();
for (const r of refs) {
  if (shouldSkip(r.url)) continue;
  const rel = localRelPath(r.url);
  if (!rel) continue;
  checked += 1;
  const target = join(publicRoot, "images", rel);
  if (!existsSync(target)) {
    if (!unique.has(r.url)) {
      unique.add(r.url);
      missing += 1;
      missingList.push({ url: r.url, target });
    }
  }
}
console.log("应本地化的唯一引用数(校验):", checked);
console.log("真实缺失数:", missing);
missingList.forEach((m) => console.log("  MISS", m.url, " => ", m.target));
