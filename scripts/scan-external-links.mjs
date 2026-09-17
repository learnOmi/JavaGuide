/**
 * 扫描 docs 下所有 .md 文件,提取外链文章/资源链接清单(只读,不改文件)。
 * 用法: node scripts/scan-external-links.mjs
 * 输出: scripts/tmp/external-links.json
 *
 * 覆盖: 行内链接 [text](url)、引用式链接 [text][ref] / [ref][] / [ref],
 *       自动链接 <https://...>。
 * 排除: 图片类资源、javaguide.cn 站内自引用、github.com/Snailclimb/JavaGuide。
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

/** 图片扩展名(去 query/hash 后判定) */
const IMAGE_RE =
  /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif|apng|heic|webp2?)(?:[?#].*)?$/i;
/** 站内自引用(域名精确匹配) */
const SELF_HOSTS = new Set(["javaguide.cn", "www.javaguide.cn"]);
/** 本仓库自身 GitHub 地址(仓库根或任意子路径) */
const SELF_GITHUB_RE = /^github\.com[/]Snailclimb[/]JavaGuide(?:\/|$)/i;

/** 外链初步分类规则(按顺序匹配,命中即归类) */
const CATEGORY_RULES = [
  {
    name: "official-docs",
    test: (u) =>
      /(^|\.)(oracle\.com|spring\.io|dev\.mysql\.com|redis\.io|docs\.github\.com|developer\.mozilla\.org|nodejs\.org|reactjs\.org|kubernetes\.io|docker\.com|apache\.org|elastic\.co|openjdk\.org|adoptium\.net|ibm\.com|microsoft\.com|learn\.microsoft\.com|json\.org|datatracker\.ietf\.org|w3\.org|rfc-editor\.org|github\.io|gitee\.io|gitcode\.io|aliyun\.com|tencent\.com|huawei\.com|baidubce\.com|qiniu\.com)$/i.test(
        u.host,
      ) || /\/docs\//i.test(u.pathname),
  },
  {
    name: "tech-article",
    test: (u) =>
      /(juejin\.cn|csdn\.net|cnblogs\.com|zhihu\.com|medium\.com|dzone\.com|baeldung\.com|segmentfault\.com|infoq\.cn|oschina\.net|mp\.weixin\.qq\.com|helloworld\.net|liuyang\.website|pdai\.tech|xiaolincoding\.com|doocs\.github\.io|crossoverjie\.top|mayikt\.com|soulmachine\.github\.io|notfound9\.github\.io|ethan\.wiki|javaboy\.org|funtl\.com|yuque\.com|github\.com|gitee\.com|gitcode\.com|51cto\.com|sohu\.com|163\.com|qq\.com|baijiahao\.baidu\.com|toutiao\.com|jianshu\.com|jdon\.com|codenotes\.top|javadoop\.com|lrwinx\.github\.io|ityouknow\.com|yonyou\.com)/i.test(
        u.host,
      ),
  },
  {
    name: "wiki",
    test: (u) =>
      /(wikipedia\.org|baike\.baidu\.com|zh\.wikisource|wikiwiki|fandom)/i.test(
        u.host,
      ),
  },
  {
    name: "video",
    test: (u) =>
      /(youtube\.com|youtu\.be|bilibili\.com|player\.bilibili\.com|vimeo\.com)/i.test(
        u.host,
      ),
  },
  { name: "other", test: () => true },
];

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

/** 从单行文本提取 markdown 链接候选(行内/引用式/自动链接),返回 {type, text, url} 列表 */
function extractLinkCandidates(line) {
  const out = [];
  let m;

  // 行内链接 [text](url "title")
  const inlineRe = /\[([^\]]*)\]\((\S+?)(?:\s+["'][^"']*["'])?\)/g;
  while ((m = inlineRe.exec(line)) !== null) {
    if (/^https?:\/\//i.test(m[2]))
      out.push({ type: "inline", text: m[1], url: m[2] });
  }

  // 引用式用法 [text][ref] / [ref][] / [ref]
  const refUseRe = /\[([^\]]*)\]\[([^\]]*)\]/g;
  while ((m = refUseRe.exec(line)) !== null) {
    out.push({ type: "refuse", text: m[1], ref: m[2] || m[1] });
  }

  // 自动链接 <https://...>
  const autoRe = /<(https?:\/\/[^>\s]+)>/g;
  while ((m = autoRe.exec(line)) !== null) {
    out.push({ type: "auto", text: "", url: m[1] });
  }
  return out;
}

/** 收集引用式链接定义 [id]: url (通常出现在文末) */
function extractRefDefinitions(content) {
  const defs = {};
  const defRe = /^\[([^\]]+)\]:\s*(\S+)/gm;
  let m;
  while ((m = defRe.exec(content)) !== null) {
    if (/^https?:\/\//i.test(m[2])) defs[m[1]] = m[2];
  }
  return defs;
}

/** 分类判定 */
function classify(urlStr) {
  const u = new URL(urlStr);
  for (const rule of CATEGORY_RULES) {
    if (rule.test(u)) return rule.name;
  }
  return "other";
}

const files = collectMdFiles(docsRoot);
const refs = [];
const excluded = [];

for (const abs of files) {
  const fileRel = abs
    .slice(docsRoot.length + 1)
    .split(sep)
    .join("/");
  const content = readFileSync(abs, "utf8");
  const lines = content.split("\n");
  const defs = extractRefDefinitions(content);

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    for (const cand of extractLinkCandidates(line)) {
      if (cand.type === "refuse") {
        const url = defs[cand.ref];
        if (url) {
          refs.push({
            file: fileRel,
            line: lineNo,
            raw: line.trim(),
            text: cand.text,
            url,
            style: "reference",
          });
        }
        continue;
      }
      refs.push({
        file: fileRel,
        line: lineNo,
        raw: line.trim(),
        text: cand.text,
        url: cand.url,
        style: cand.type === "auto" ? "autolink" : "inline",
      });
    }
  });
}

/** 过滤: 仅保留 http(s) 外链,图片排除;自引用/自仓库单独成章(本地化候选) */
const kept = [];
const selfHostRefs = [];
const selfGithubRefs = [];
const byHost = {};
for (const r of refs) {
  const u = new URL(r.url);
  const isImage = IMAGE_RE.test(r.url);
  const isSelfHost = SELF_HOSTS.has(u.host);
  const isSelfGithub = SELF_GITHUB_RE.test(u.host + u.pathname);
  if (isImage) {
    excluded.push({
      file: r.file,
      line: r.line,
      url: r.url,
      reason: "image",
    });
    continue;
  }
  if (isSelfHost) {
    selfHostRefs.push({ ...r, host: u.host, pathname: u.pathname });
    continue;
  }
  if (isSelfGithub) {
    selfGithubRefs.push({ ...r, host: u.host, pathname: u.pathname });
    continue;
  }
  kept.push({
    ...r,
    host: u.host,
    pathname: u.pathname,
    category: classify(r.url),
  });
  byHost[u.host] = (byHost[u.host] || 0) + 1;
}

const uniqueUrls = [...new Set(kept.map((r) => r.url))];
const byCategory = {};
for (const u of uniqueUrls) {
  const c = classify(u);
  byCategory[c] = (byCategory[c] || 0) + 1;
}

const selfHostUnique = [...new Set(selfHostRefs.map((r) => r.url))];
const selfGithubUnique = [...new Set(selfGithubRefs.map((r) => r.url))];

const data = {
  totalFiles: files.length,
  totalRefs: kept.length,
  uniqueUrls: uniqueUrls.length,
  byHost: Object.fromEntries(
    Object.entries(byHost).sort((a, b) => b[1] - a[1]),
  ),
  byCategory,
  selfHost: {
    count: selfHostRefs.length,
    uniqueUrls: selfHostUnique.length,
    refs: selfHostRefs,
  },
  selfGithub: {
    count: selfGithubRefs.length,
    uniqueUrls: selfGithubUnique.length,
    refs: selfGithubRefs,
  },
  excluded: {
    count: excluded.length,
    byReason: excluded.reduce((acc, e) => {
      acc[e.reason] = (acc[e.reason] || 0) + 1;
      return acc;
    }, {}),
    samples: excluded.slice(0, 50),
  },
  refs: kept,
};

const tmp = join(__dirname, "tmp");
if (!existsSync(tmp)) mkdirSync(tmp, { recursive: true });
writeFileSync(
  join(tmp, "external-links.json"),
  JSON.stringify(data, null, 2),
  "utf8",
);

console.log("md 文件数:", data.totalFiles);
console.log("外链引用总次数:", data.totalRefs);
console.log("去重唯一 URL 数:", data.uniqueUrls);
console.log("分类统计:", data.byCategory);
console.log(
  "站内自引用(javaguide.cn):",
  data.selfHost.count,
  " 自仓库(github):",
  data.selfGithub.count,
);
console.log("排除(图片):", data.excluded.count, data.excluded.byReason);
console.log("\n按域名 Top 20:");
Object.entries(data.byHost)
  .slice(0, 20)
  .forEach(([host, c]) => console.log(`  ${host}: ${c}`));
console.log("\n示例前 30:");
data.refs
  .slice(0, 30)
  .forEach((r) =>
    console.log(`  ${r.file}:${r.line}  [${r.text}] ${r.url} (${r.category})`),
  );
