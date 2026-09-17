/**
 * 分析外链清单中可本地化的部分(只读)。
 * 用法: node scripts/analyze-external-links.mjs
 * 输出: scripts/tmp/external-links-analysis.json
 *
 * 分析项:
 * 1. javaguide.cn 自引用 → 目标本地文档是否存在(html 路径 → docs 下对应 md)
 * 2. github.com/Snailclimb/JavaGuide 自仓库链接 → 目标本地文件是否存在
 * 3. 技术文章类 URL 去重清单,便于后续主题匹配
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, "..", "docs");
const manifest = JSON.parse(
  readFileSync(join(__dirname, "tmp", "external-links.json"), "utf8"),
);

/** javaguide.cn 页面路径 → 本地 md 文件可能位置 */
function javaguidePathToLocal(pathname) {
  if (pathname === "/" || pathname === "") return "/index.html";
  if (pathname.endsWith("/")) pathname += "index.html";
  if (!pathname.endsWith(".html")) return null;
  // 去 query/hash 已在上层处理
  const rel = pathname.replace(/^\/+/, "").replace(/\.html$/, "");
  return `${rel}.md`;
}

function localFileExists(relMd) {
  const abs = join(docsRoot, relMd);
  return existsSync(abs);
}

const selfHostRefs = manifest.selfHost?.refs ?? [];
const selfGithubRefs = manifest.selfGithub?.refs ?? [];

// --- javaguide.cn 分析 ---
const jhByPath = {};
for (const r of selfHostRefs) {
  const u = new URL(r.url);
  const key = u.pathname;
  jhByPath[key] = jhByPath[key] || { count: 0, files: new Set(), url: r.url };
  jhByPath[key].count++;
  jhByPath[key].files.add(r.file);
}
const jhResult = Object.entries(jhByPath).map(([path, v]) => {
  const localRel = javaguidePathToLocal(path);
  const exists = localRel ? localFileExists(localRel) : false;
  return {
    path,
    count: v.count,
    exists,
    localRel,
    sampleFile: [...v.files][0],
    url: v.url,
  };
});

// --- github 自仓库分析 ---
const ghByPath = {};
for (const r of selfGithubRefs) {
  const u = new URL(r.url);
  let key = u.pathname;
  // 只关心指向 docs 内文件的 blob/raw 链接
  const m = key.match(
    /^\/(?:Snailclimb\/JavaGuide\/)?(blob|raw)\/([^/]+)\/(.+)$/i,
  );
  if (m) key = `${m[1]}|${m[2]}|${m[3]}`;
  ghByPath[key] = ghByPath[key] || { count: 0, files: new Set(), url: r.url };
  ghByPath[key].count++;
  ghByPath[key].files.add(r.file);
}
const ghResult = Object.entries(ghByPath).map(([path, v]) => {
  let localRel = null;
  let exists = false;
  const m = path.match(/^(blob|raw)\|[^|]+\|(.+)$/);
  if (m) {
    let rel = m[2].replace(/^docs\//, "");
    if (rel.endsWith(".md") || rel.endsWith(".mdx")) {
      localRel = rel;
      exists = localFileExists(rel);
    } else {
      // 非 md 文件,检查 docs 下对应文件
      localRel = rel;
      exists = existsSync(join(docsRoot, rel));
    }
  }
  return {
    path,
    count: v.count,
    exists,
    localRel,
    sampleFile: [...v.files][0],
    url: v.url,
  };
});

// --- 技术文章去重清单 ---
const articleUrls = {};
for (const r of manifest.refs) {
  if (r.category !== "tech-article") continue;
  if (!articleUrls[r.url]) {
    articleUrls[r.url] = { url: r.url, text: r.text, count: 0, files: [] };
  }
  articleUrls[r.url].count++;
  if (!articleUrls[r.url].files.includes(r.file))
    articleUrls[r.url].files.push(r.file);
}
const articleList = Object.values(articleUrls).sort(
  (a, b) => b.count - a.count,
);

const result = {
  selfHost: {
    totalRefs: selfHostRefs.length,
    uniquePaths: jhResult.length,
    exists: jhResult.filter((x) => x.exists).length,
    missing: jhResult.filter((x) => !x.exists).length,
    detail: jhResult.sort((a, b) => b.count - a.count),
  },
  selfGithub: {
    totalRefs: selfGithubRefs.length,
    uniquePaths: ghResult.length,
    detail: ghResult.sort((a, b) => b.count - a.count),
  },
  articles: {
    total: articleList.length,
    list: articleList,
  },
};

writeFileSync(
  join(__dirname, "tmp", "external-links-analysis.json"),
  JSON.stringify(result, null, 2),
  "utf8",
);

console.log("=== javaguide.cn 自引用 ===");
console.log("引用数:", selfHostRefs.length, " 唯一路径:", jhResult.length);
console.log(
  "目标本地存在:",
  jhResult.filter((x) => x.exists).length,
  " 缺失:",
  jhResult.filter((x) => !x.exists).length,
);
console.log("缺失路径:");
jhResult
  .filter((x) => !x.exists)
  .forEach((x) => console.log(`  [${x.count}] ${x.path} <- ${x.sampleFile}`));
console.log("\n=== github 自仓库 ===");
console.log("引用数:", selfGithubRefs.length, " 唯一路径:", ghResult.length);
console.log(
  "指向 docs 内 blob/raw 且本地存在的:",
  ghResult.filter((x) => x.exists).length,
);
console.log("\n=== 技术文章类唯一 URL 数:", articleList.length);
console.log("Top 30 按引用次数:");
articleList
  .slice(0, 30)
  .forEach((a) =>
    console.log(
      `  [${a.count}] [${(a.text || "").slice(0, 40)}] ${a.url.slice(0, 110)}`,
    ),
  );
