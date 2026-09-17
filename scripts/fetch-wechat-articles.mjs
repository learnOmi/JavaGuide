/**
 * 抓取作者(Snailclimb)公众号知识类文章并转换为 Markdown。
 * 用法: node scripts/fetch-wechat-articles.mjs
 * 输出: scripts/tmp/fetched/<key>.md (原始转换结果,供人工审查后落盘 docs)
 *
 * 渲染模型:
 *  - 块级元素(p/h1-6/ul/ol/li/blockquote/pre/table/hr/div/section/figure)
 *  - 容器(div/section/figure)子节点按文档序分组: 连续内联节点合并为一段, 块级节点递归渲染
 *  - 内联: strong/b/em/i/code/a/img/span/font/br/s/del/u/sup/sub/small
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "tmp", "fetched");
mkdirSync(OUT, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const ARTICLES = [
  {
    key: "sql-30-tips",
    url: "https://mp.weixin.qq.com/s?__biz=Mzg2OTA0Njk0OA==&mid=2247486461&idx=1&sn=60a22279196d084cc398936fe3b37772&chksm=cea24436f9d5cd2c1c87049ed15ccf6f88275419c7dbe542406166a703b27d0f3ecf2af901f8&token=999884676&lang=zh_CN#rd",
  },
  {
    key: "kafka-spring-boot",
    url: "https://mp.weixin.qq.com/s?__biz=Mzg2OTA0Njk0OA==&mid=2247486269&idx=2&sn=ec00417ad641dd8c3d145d74cafa09ce&chksm=cea244f6f9d5cde0c8eb233fcc4cf82e11acd06446719a7af55230649863a3ddd95f78d111de&token=1633957262&lang=zh_CN#rd",
  },
  {
    key: "java-naming",
    url: "https://mp.weixin.qq.com/s?__biz=Mzg2OTA0Njk0OA==&mid=2247486449&idx=1&sn=c3b502529ff991c7180281bcc22877af&chksm=cea2443af9d5cd2c1c87049ed15ccf6f88275419c7dbe542406166a703b27d0f3ecf2af901f8&token=999884676&lang=zh_CN#rd",
  },
  {
    key: "restcontroller-vs-controller",
    url: "https://mp.weixin.qq.com/s?__biz=Mzg2OTA0Njk0OA==&mid=2247485544&idx=1&sn=3cc95b88979e28fe3bfe539eb421c6d8&chksm=cea247a3f9d5ceb5e324ff4b8697adc3e828ecf71a3468445e70221cce768d1e722085359907&token=1725092312&lang=zh_CN#rd",
  },
  {
    key: "springboot-read-config",
    url: "https://mp.weixin.qq.com/s?__biz=Mzg2OTA0Njk0OA==&mid=2247486181&idx=2&sn=10db0ae64ef501f96a5b0dbc4bd78786&chksm=cea2452ef9d5cc384678e456427328600971180a77e40c13936b19369672ca3e342c26e92b50&token=816772476&lang=zh_CN#rd",
  },
  {
    key: "springboot-exception-handling",
    url: "https://mp.weixin.qq.com/s?__biz=Mzg2OTA0Njk0OA==&mid=2247485568&idx=2&sn=c5ba880fd0c5d82e39531fa42cb036ac&chksm=cea2474bf9d5ce5dcbc6a5f6580198fdce4bc92ef577579183a729cb5d1430e4994720d59b34&token=2133161636&lang=zh_CN#rd",
  },
  {
    key: "springboot-global-exception",
    url: "https://mp.weixin.qq.com/s?__biz=Mzg2OTA0Njk0OA==&mid=2247486379&idx=2&sn=48c29ae65b3ed874749f0803f0e4d90e&chksm=cea24460f9d5cd769ed53ad7e17c97a7963a89f5350e370be633db0ae8d783c3a3dbd58c70f8&token=1054498516&lang=zh_CN#rd",
  },
];

/* ---------------- HTML 迷你解析 ---------------- */
function tokenize(html) {
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<[^>]+>|[^<]+/g;
  let m;
  while ((m = re.exec(html))) {
    const t = m[0];
    if (t.startsWith("<!--")) continue;
    if (t.startsWith("<")) {
      if (/^<\/[a-zA-Z0-9]/.test(t)) {
        const tag = t.match(/^<\/([a-zA-Z0-9]+)/)[1].toLowerCase();
        tokens.push({ type: "close", tag });
      } else if (/^<[a-zA-Z][^>]*>$/.test(t)) {
        const tag = t.match(/^<([a-zA-Z0-9]+)/)[1].toLowerCase();
        const attrs = {};
        const attrRe = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
        let am;
        while ((am = attrRe.exec(t))) attrs[am[1]] = am[2];
        const selfClose = /\/>$/.test(t);
        tokens.push({ type: "open", tag, attrs, selfClose });
      }
    } else {
      tokens.push({ type: "text", content: t });
    }
  }
  return tokens;
}

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
  "tfoot",
  "hr",
  "br",
  "figure",
  "figcaption",
]);
const INLINE_TAGS = new Set([
  "span",
  "font",
  "strong",
  "b",
  "em",
  "i",
  "code",
  "a",
  "img",
  "u",
  "s",
  "del",
  "sup",
  "sub",
  "small",
]);

function buildTree(tokens) {
  const root = { tag: "#root", children: [] };
  const stack = [root];
  for (const tok of tokens) {
    if (tok.type === "open") {
      const node = {
        tag: tok.tag,
        attrs: tok.attrs,
        children: [],
        selfClose: tok.selfClose,
      };
      stack[stack.length - 1].children.push(node);
      if (
        !tok.selfClose &&
        (BLOCK_TAGS.has(tok.tag) || INLINE_TAGS.has(tok.tag))
      ) {
        stack.push(node);
      }
    } else if (tok.type === "close") {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tok.tag) {
          stack.length = i;
          break;
        }
      }
    } else {
      stack[stack.length - 1].children.push({
        tag: "#text",
        content: tok.content,
      });
    }
  }
  return root;
}

/* ---------------- 实体解码 ---------------- */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/* ---------------- 渲染 ---------------- */
const isInlineNode = (n) => n.tag === "#text" || INLINE_TAGS.has(n.tag);

function renderInline(node) {
  let out = "";
  for (const c of node.children || []) {
    if (c.tag === "#text") {
      out += c.content;
    } else if (c.tag === "br") {
      out += "\n";
    } else if (c.tag === "strong" || c.tag === "b") {
      const inner = renderInline(c).trim();
      out += inner ? `**${inner}**` : "";
    } else if (c.tag === "em" || c.tag === "i") {
      const inner = renderInline(c).trim();
      out += inner ? `*${inner}*` : "";
    } else if (c.tag === "code") {
      const inner = renderInline(c);
      out += `\`${inner.replace(/`/g, "\\`")}\``;
    } else if (c.tag === "a") {
      const href = c.attrs["data-src"] || c.attrs.href || "";
      const inner = renderInline(c).trim();
      if (!inner || inner === href) out += href ? `[${href}](${href})` : "";
      else out += `[${inner}](${href})`;
    } else if (c.tag === "img") {
      const src = c.attrs["data-src"] || c.attrs.src || "";
      const alt = (c.attrs.alt || "").trim();
      out += src ? `![${alt}](${src})` : "";
    } else if (
      c.tag === "span" ||
      c.tag === "font" ||
      c.tag === "u" ||
      c.tag === "small"
    ) {
      out += renderInline(c);
    } else if (c.tag === "s" || c.tag === "del") {
      const inner = renderInline(c).trim();
      out += inner ? `~~${inner}~~` : "";
    } else {
      out += renderInline(c);
    }
  }
  return out;
}

/** 由代码内容猜测语言 */
function detectLang(code) {
  if (
    /CREATE TABLE|SELECT |INSERT INTO|UPDATE |DELETE FROM|ALTER TABLE|DROP TABLE|ORDER BY|GROUP BY/i.test(
      code,
    ) &&
    /create table|select|insert|update|delete/i.test(code.slice(0, 200))
  ) {
    return "sql";
  }
  if (/<\?xml|<dependency|<!DOCTYPE|<html/i.test(code.slice(0, 300)))
    return "xml";
  return "java";
}

function renderBlock(c, depth) {
  const pad = "  ".repeat(Math.max(0, depth - 1));
  const lines = [];
  switch (c.tag) {
    case "p": {
      const t = renderInline(c).trim();
      if (t) lines.push(pad + t);
      break;
    }
    case "div":
    case "section":
    case "figure":
      lines.push(...renderChildren(c, depth, pad));
      break;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = Number(c.tag[1]);
      const t = renderInline(c).trim();
      if (t) lines.push(pad + "#".repeat(level) + " " + t);
      break;
    }
    case "blockquote": {
      const sub = renderChildren(c, depth, "> ");
      lines.push(
        ...sub.map((l) =>
          l.trim() === ">" ? ">" : l.trim() ? "> " + l.trim() : ">",
        ),
      );
      break;
    }
    case "ul":
    case "ol": {
      const ordered = c.tag === "ol";
      let idx = 1;
      for (const li of (c.children || []).filter((x) => x.tag === "li")) {
        const marker = ordered ? `${idx}.` : "-";
        idx++;
        const inline = renderInline({
          children: (li.children || []).filter(isInlineNode),
        }).trim();
        const sub = renderChildren(li, depth + 1, pad + "  ");
        if (inline) {
          lines.push(`${pad}${marker} ${inline}`);
          lines.push(...sub);
        } else if (sub.length) {
          lines.push(`${pad}${marker} ${sub[0].trim()}`);
          lines.push(...sub.slice(1));
        }
      }
      break;
    }
    case "pre": {
      const code = decodeEntities(
        (c.children || [])
          .map((x) => (x.tag === "#text" ? x.content : renderCode(x)))
          .join(""),
      );
      const lang = detectLang(code);
      const cleaned = beautifyCode(
        code.replace(/\n{3,}/g, "\n\n").replace(/^[\s\n]+|[\s\n]+$/g, ""),
        lang,
      );
      if (cleaned) {
        lines.push(pad + "```" + lang);
        lines.push(...cleaned.split("\n"));
        lines.push(pad + "```");
      }
      break;
    }
    case "table": {
      const rows = [];
      for (const tr of c.children || []) {
        if (tr.tag === "thead" || tr.tag === "tbody" || tr.tag === "tfoot") {
          rows.push(...(tr.children || []).filter((x) => x.tag === "tr"));
        } else if (tr.tag === "tr") {
          rows.push(tr);
        }
      }
      if (rows.length) {
        const cell = (x) => renderInline(x).trim().replace(/\|/g, "\\|");
        const firstCells = (rows[0].children || []).filter(
          (x) => x.tag === "th" || x.tag === "td",
        );
        const header = firstCells.map(cell);
        lines.push(pad + "| " + header.join(" | ") + " |");
        lines.push(pad + "| " + header.map(() => "---").join(" | ") + " |");
        for (const tr of rows.slice(1)) {
          const cells = (tr.children || []).filter(
            (x) => x.tag === "th" || x.tag === "td",
          );
          lines.push(pad + "| " + cells.map(cell).join(" | ") + " |");
        }
      }
      break;
    }
    case "hr":
      lines.push(pad + "---");
      break;
    default:
      lines.push(...renderChildren(c, depth, pad));
  }
  return lines;
}

/** 容器子节点: 连续内联合并为一段, 块级递归(同层,section/div 透明容器不加深缩进) */
function renderChildren(node, depth, pad) {
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const t = renderInline({ children: buf }).trim();
    buf = [];
    if (t) out.push(pad + t);
  };
  for (const c of node.children || []) {
    if (isInlineNode(c)) {
      buf.push(c);
    } else {
      flush();
      out.push(...renderBlock(c, depth));
    }
  }
  flush();
  return out;
}

/** 简易代码美化: 公众号页面压缩了换行, 恢复 } 与 ; 后的换行(for 头部内部除外) */
function beautifyCode(code, lang) {
  if (lang !== "java" && lang !== "sql") return code;
  let c = code;
  // } 后换行(排除 else/,/;/; 仅同行触发,避免已换行处双空行)
  c = c.replace(/\}(?!\s*(?:else|,|;|\)))(?=[ \t]*[@\p{L}\/])/gu, "}\n");
  // { 后接修饰符时换行(仅同行触发; 不含 @,避免拆坏 javadoc 的 {@code/{@link)
  c = c.replace(/\{\s*(?=(?:public|private|protected|static))/g, "{\n");
  // 单行 javadoc 重排为多行: /** * xxx */ -> /**\n * xxx\n */
  c = c.replace(/\/\*\*\s*([\s\S]*?)\s*\*\//g, (m, inner) => {
    const core = inner.replace(/^\s*\*\s?/, "");
    const lines = core
      .split(/\s*\*\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return m;
    return "/**\n * " + lines.join("\n * ") + "\n */";
  });
  // 注解后接另一注解或类型关键字时换行（注解名惰性匹配，避免把粘连的修饰符吞进注解名；仅同行触发，避免已换行处产生双空行）
  c = c.replace(
    /(@[A-Za-z][\w]*?(?:\([^)]*\))?)(?=[ \t]*(?:@|class|interface|enum|public|private|protected|static)\b)/g,
    "$1\n",
  );
  // javadoc 结束符后接注解/类型/修饰符时换行(仅同行触发)
  c = c.replace(
    /\*\/(?=[ \t]*(?:@|public|class|interface|enum|private|protected|static|package)\b)/g,
    "*/\n",
  );
  // 泛型括号内残留换行合并: List<\nBook>
  c = c.replace(/<\s*\n\s*/g, "<").replace(/\s*\n\s*>/g, ">");
  // SQL: 建表语句列定义后断行
  if (lang === "sql") {
    c = c.replace(
      /,\s*(?=`[^`]*`\s+(?:int|varchar|bigint|datetime|char|text|date|tinyint|decimal|double|float|longblob|timestamp|blob))/g,
      ",\n",
    );
  }
  // ) 后接类型关键字(Java 声明)时断行
  c = c.replace(
    /\)(?=\s*(?:boolean|String|Long|Integer|int|void|char|double|float|byte|short|Object|BigDecimal|List|Map|Set)\b)/g,
    ")\n",
  );
  // ; 后换行(排除 for(...) 头部内部的 ;)
  c = c.replace(/;\s*(?=\S)/g, (m, off, s) => {
    const since = s.slice(Math.max(0, off - 60), off);
    if (/for\s*\([^)]*$/.test(since)) return m;
    return ";\n";
  });
  // 行尾连续闭合括号 "}}" -> "}\n}"(须在 ; 规则之后,此时 ;}} 已转为 ;\n}})
  c = c.replace(/\}\}$/gm, "}\n}");
  return c;
}

function renderCode(node) {
  let out = "";
  for (const c of node.children || []) {
    out += c.tag === "#text" ? c.content : renderCode(c);
  }
  return out;
}

/* ---------------- 提取 js_content ---------------- */
function extractContent(html) {
  const m = html.match(
    /<div class="rich_media_content[^"]*"[^>]*id="js_content"[^>]*>([\s\S]*?)<\/div>/,
  );
  return m ? m[1] : "";
}

/* ---------------- 后处理 ---------------- */
function postProcess(md) {
  let out = md;
  // 截断公众号推广尾部: 推荐阅读/往期推荐/猜你喜欢/文章推荐 及之后
  const footIdx = out.search(/推荐阅读|往期推荐|猜你喜欢|文章推荐/);
  if (footIdx !== -1) out = out.slice(0, footIdx);
  // 清理关注/点赞引导残留
  out = out.replace(/\n*欢迎关注[^\n]*\n?/g, "\n");
  out = out.replace(/\n*点个再看[^\n]*\n?/g, "\n");
  out = out.replace(/\n*点个在看[^\n]*\n?/g, "\n");
  out = out.replace(/\n*\[置顶\][^\n]*\n?/g, "\n");
  // 折叠嵌套引用前缀 "> > " -> "> "
  out = out.replace(/^((?:>\s){2,})/gm, "> ");
  // 清理引用装饰行: 仅含引号的行(如 "> “" / "> ”")
  out = out.replace(/^>\s*[“”"']+\s*$/gm, "");
  // 空图/空加粗/孤立 img/空标题 残留行清理
  out = out.replace(/^!\[\]\(\)\s*$/gm, "");
  out = out.replace(/^\*{1,3}\s*$/gm, "");
  out = out.replace(/^img\s*$/gm, "");
  out = out.replace(/^#{1,6}\s*$/gm, "");
  // 标题层级归一化: 文件内最浅标题层级归为 "##"(代码围栏内不处理)
  const hLines = out.split("\n");
  let minLv = 6;
  let hfence = false;
  for (const l of hLines) {
    if (/^\s*```/.test(l)) hfence = !hfence;
    if (!hfence) {
      const m = l.match(/^(#{1,6})\s+/);
      if (m) minLv = Math.min(minLv, m[1].length);
    }
  }
  if (minLv > 2 && minLv < 6) {
    const shift = minLv - 2;
    hfence = false;
    for (let i = 0; i < hLines.length; i++) {
      const l = hLines[i];
      if (/^\s*```/.test(l)) hfence = !hfence;
      if (hfence) continue;
      const m = l.match(/^(#{1,6})(\s+)/);
      if (m)
        hLines[i] =
          "#".repeat(m[1].length - shift) + m[2] + l.slice(m[0].length);
    }
    out = hLines.join("\n");
  }
  // 合并空行(代码围栏除外)
  const lines = out.split("\n");
  const res = [];
  let fence = false;
  for (const l of lines) {
    if (/^\s*```/.test(l)) fence = !fence;
    if (!fence && res.length && !l.trim() && res[res.length - 1] === "")
      continue;
    res.push(l);
  }
  out = res.join("\n");
  out = out.replace(/[ \t]+$/gm, "").trim();
  return out;
}

/* ---------------- 主流程 ---------------- */
async function fetchArticle(item) {
  const res = await fetch(item.url, {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${item.key}`);
  const html = await res.text();
  const titleM = html.match(/<meta property="og:title" content="([^"]+)"/);
  const title = titleM ? decodeEntities(titleM[1]) : item.key;
  const content = extractContent(html);
  const tree = buildTree(tokenize(content));
  let md = renderChildren(tree, 0, "").join("\n");
  md = decodeEntities(md);
  md = postProcess(md);
  return { title, md };
}

for (const item of ARTICLES) {
  try {
    const { title, md } = await fetchArticle(item);
    const out = `<!-- 原标题: ${title} -->\n<!-- 原链接: ${item.url} -->\n\n${md}\n`;
    writeFileSync(join(OUT, `${item.key}.md`), out, "utf8");
    console.log(`[OK] ${item.key}  title=${title}  chars=${md.length}`);
  } catch (e) {
    console.error(`[FAIL] ${item.key}  ${e.message}`);
  }
}
