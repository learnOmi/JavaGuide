/**
 * 技术文章类外链 → 本地文档主题匹配(只读,生成候选清单)。
 * 用法: node scripts/match-article-links.mjs
 * 输出: scripts/tmp/article-match-candidates.json
 *
 * 策略:
 * 1. 将 github/gitee/gitcode 仓库链接归为 "repo" 类(非文章,保留外链)
 * 2. 其余文章链接按链接文字提取关键词,与本地文档 H1/文件名做子串匹配
 * 3. 输出: 强匹配(本地唯一命中)与待人工确认清单
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = join(__dirname, "..", "docs");
const manifest = JSON.parse(
  readFileSync(join(__dirname, "tmp", "external-links.json"), "utf8"),
);

/** 收集本地所有 md 文件的标题与文件名 */
function collectLocalDocs(dir, base) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".vuepress" || entry.name === "node_modules") continue;
    const abs = join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      collectLocalDocs(abs, rel).forEach((d) => out.push(d));
    } else if (/\.mdx?$/i.test(entry.name)) {
      const content = readFileSync(abs, "utf8");
      const title =
        content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
        content.match(/^title:\s*(.+)$/m)?.[1]?.trim() ||
        "";
      out.push({ rel, title, file: rel });
    }
  }
  return out;
}

const localDocs = collectLocalDocs(docsRoot, "");

/** 从链接文字提取关键词(中文词 + 英文词),去除通用词 */
function extractKeywords(text) {
  if (!text) return [];
  const cleaned = text
    .replace(/《|》|【|】|「|」|"|"|'|`|#|:|：/g, " ")
    .replace(/[（）()]/g, " ");
  const cn = cleaned.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const en = cleaned.match(/[A-Za-z][A-Za-z0-9_.-]{1,}/g) || [];
  const stopWords = new Set([
    "什么是",
    "为什么",
    "如何",
    "怎么",
    "介绍",
    "详解",
    "总结",
    "对比",
    "区别",
    "常见",
    "问题",
    "解决方案",
    "使用",
    "实现",
    "文章",
    "深入",
    "分析",
    "推荐",
    "详解",
    "JavaGuide",
    "java",
    "项目",
    "框架",
    "面试",
    "整理",
    "核心",
    "概念",
    "学习",
    "完整",
    "从零",
    "到",
    "入门",
  ]);
  const words = [...cn, ...en]
    .map((w) => w.toLowerCase())
    .filter((w) => !stopWords.has(w) && w.length >= 2);
  return [...new Set(words)];
}

/** 本地文档是否命中某关键词(标题或文件路径) */
function localMatchesKeywords(doc, keywords) {
  const haystack =
    `${doc.title} ${doc.rel.replace(/\.mdx?$/, "")}`.toLowerCase();
  return keywords.filter((k) => haystack.includes(k));
}

const articles = {};
for (const r of manifest.refs) {
  if (r.category !== "tech-article") continue;
  if (!articles[r.url]) {
    articles[r.url] = { url: r.url, text: r.text, count: 0, files: [] };
  }
  articles[r.url].count++;
  if (!articles[r.url].files.includes(r.file))
    articles[r.url].files.push(r.file);
}

const repoHosts = /^(github\.com|gitee\.com|gitcode\.com|gitlab\.com)$/;
const results = { repo: [], article: [] };

for (const a of Object.values(articles)) {
  const host = new URL(a.url).host;
  if (repoHosts.test(host)) {
    results.repo.push(a);
    continue;
  }
  const keywords = extractKeywords(a.text);
  const matched = [];
  if (keywords.length) {
    for (const doc of localDocs) {
      const hits = localMatchesKeywords(doc, keywords);
      if (hits.length >= 2 || (hits.length === 1 && keywords.length <= 2)) {
        matched.push({ file: doc.file, title: doc.title, hits });
      }
    }
  }
  results.article.push({ ...a, keywords, matched });
}

// 强匹配: 本地唯一命中且命中数>=2
const strong = results.article.filter(
  (a) => a.matched.length === 1 && a.matched[0].hits.length >= 2,
);
const needReview = results.article.filter((a) => a.matched.length > 1);
const noMatch = results.article.filter((a) => a.matched.length === 0);

const output = {
  summary: {
    repoLinks: results.repo.length,
    articleLinks: results.article.length,
    strongMatch: strong.length,
    multiMatch: needReview.length,
    noMatch: noMatch.length,
  },
  strong,
  needReview,
  noMatch: noMatch.map(({ url, text, count, files }) => ({
    url,
    text,
    count,
    files,
  })),
};

writeFileSync(
  join(__dirname, "tmp", "article-match-candidates.json"),
  JSON.stringify(output, null, 2),
  "utf8",
);

console.log("仓库类(保留外链):", results.repo.length);
console.log("文章类总数:", results.article.length);
console.log("强匹配(唯一命中):", strong.length);
console.log("多候选(需确认):", needReview.length);
console.log("无匹配:", noMatch.length);
console.log("\n=== 强匹配示例(前 30) ===");
strong
  .slice(0, 30)
  .forEach((a) =>
    console.log(
      `  [${a.count}] ${(a.text || "").slice(0, 36)} => ${a.matched[0].file} (${a.matched[0].hits.join("/")})`,
    ),
  );
console.log("\n=== 多候选示例(前 20) ===");
needReview
  .slice(0, 20)
  .forEach((a) =>
    console.log(
      `  [${a.count}] ${(a.text || "").slice(0, 36)} => ${a.matched.map((m) => `${m.file}(${m.hits.length})`).join(", ")}`,
    ),
  );
