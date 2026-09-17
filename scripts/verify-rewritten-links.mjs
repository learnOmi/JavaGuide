/**
 * 验证改写后的本地路径在 dev server 上是否可达(只读)。
 * 用法: node scripts/verify-rewritten-links.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(
  readFileSync(join(__dirname, "tmp", "self-link-rewrite-report.json"), "utf8"),
);

const BASE = "http://127.0.0.1:8080";
const targets = [...new Set(report.changes.map((c) => c.target))];
const bad = [];
let ok = 0;

for (const t of targets) {
  const path = t.split(/[#?]/)[0];
  try {
    const res = await fetch(BASE + path, {
      method: "HEAD",
      redirect: "follow",
    });
    if (res.status === 200) ok++;
    else bad.push({ target: t, status: res.status });
  } catch (e) {
    bad.push({ target: t, status: "ERR " + e.message });
  }
}

console.log(`目标总数: ${targets.length}, 可达: ${ok}, 异常: ${bad.length}`);
for (const b of bad) console.log("  ", b.status, b.target);
