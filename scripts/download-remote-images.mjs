/**
 * 将 docs 中所有远程图片下载到本地并替换为本地绝对路径引用。
 *
 * 逻辑：
 *  1. 读取 scripts/tmp/remote-images.json 的唯一 URL 清单
 *  2. 过滤跳过：
 *       - host 属于动态图表 API（api.star-history.com）
 *       - URL 带签名鉴权（含 token= 或 &e= ，多为过期临时签名）
 *  3. 对可下载 URL 逐个：
 *       - 目标本地路径 = docs/.vuepress/public/assets/images/{host}/<url.pathname 解码后各段清理非法字符>
 *       - 下载（保留原 URL query 以命中水印/缩略图处理），写文件前建好父目录
 *       - 记录 成功/失败（含 HTTP 状态）
 *  4. 写回报告 scripts/tmp/download-report.json
 *
 * 用法：node scripts/download-remote-images.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(__dirname, "tmp", "remote-images.json"), "utf8"),
);
const destRoot = join(
  __dirname,
  "..",
  "docs",
  ".vuepress",
  "public",
  "assets",
  "images",
);

/** 动态图表 API host 集合 */
const API_HOSTS = new Set(["api.star-history.com"]);

/** 判断 URL 是否应跳过（签名 token / 动态 API） */
function shouldSkip(url) {
  const host = new URL(url).host;
  if (API_HOSTS.has(host)) return true;
  // 带 token / 临时签名参数（多为过期临时 URL）
  if (/token=/i.test(url)) return true;
  if (/\be=\d+&/.test(url) && /https?:/i.test(url)) return true;
  return false;
}

/** Windows 非法文件名部分 -> 下划线 */
function sanitizeSegment(seg) {
  // 先保留扩展名中的点，其它非法字符替换
  return (
    seg.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/^\.+|\.+$/g, "") || "_"
  );
}

/** 由 URL 解析出本地目标相对路径（不含 /assets/images/ 前缀，含 host） */
function localRelPath(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  let pathname = decodeURIComponent(u.pathname);
  if (!pathname.startsWith("/")) pathname = "/" + pathname;
  // 先剔除空段与 "." 段，再对非空段做清洗，避免空段被 sanitize 成 "_"
  const segments = pathname
    .split("/")
    .filter((s) => s !== "" && s !== ".")
    .map((s) => sanitizeSegment(s))
    .filter((s) => s !== "");
  if (segments.length === 0) return null;
  return join(u.host, ...segments);
}

// ---------- 下载 ----------
async function download(url, destAbs) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 javaguide-local-image-fetcher" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(destAbs), { recursive: true });
  writeFileSync(destAbs, buf);
  return buf.length;
}

const uniqueUrls = new Set(
  Array.isArray(manifest.refs) ? manifest.refs.map((r) => r.url) : [],
);
const skipped = [];
const todo = [];

for (const u of uniqueUrls) {
  if (shouldSkip(u)) {
    skipped.push(u);
    continue;
  }
  const rel = localRelPath(u);
  if (!rel) {
    skipped.push(u);
    continue;
  }
  todo.push({ url: u, rel, destAbs: join(destRoot, rel) });
}

console.log(
  "唯一 URL:",
  uniqueUrls.length,
  " 可下载:",
  todo.length,
  " 跳过:",
  skipped.length,
);
skipped.slice(0, 15).forEach((s) => console.log("  [skip]", s));

// 已存在则跳过（实现增量续传）
let hit = 0;
const pending = todo.filter((t) => {
  if (existsSync(t.destAbs)) {
    hit += 1;
    return false;
  }
  return true;
});
console.log("已存在(跳过续传):", hit, " 待下载:", pending.length);

// 并发下载（串行防限流，但可改 concurrency）
const success = [];
const failed = [];
const concurrency = Number(process.env.CONC) || 6;
const queue = [...pending];
let workers = 0;

function runWorker() {
  while (workers < concurrency && queue.length) {
    const item = queue.shift();
    workers += 1;
    download(item.url, item.destAbs)
      .then((bytes) => {
        success.push({ url: item.url, rel: item.rel, bytes });
        process.stdout.write(".");
      })
      .catch((err) => {
        failed.push({
          url: item.url,
          rel: item.rel,
          error: String(err.message || err),
        });
        process.stdout.write("x");
      })
      .finally(() => {
        workers -= 1;
        runWorker();
      });
  }
  if (workers === 0 && queue.length === 0) finish();
}

function finish() {
  console.log("\n下载完成. 成功:", success.length, " 失败:", failed.length);
  writeFileSync(
    join(__dirname, "tmp", "download-report.json"),
    JSON.stringify({ skipped, success, failed, total: todo.length }, null, 2),
    "utf8",
  );
  if (failed.length) {
    console.log("\n失败清单（前 30）:");
    failed
      .slice(0, 30)
      .forEach((f) => console.log(`  ${f.url}  =>  ${f.error}`));
  }
}

runWorker();
