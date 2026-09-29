import { SCROLL_SYNC_MAX_LOOKBACK_LINES } from "../docEditorState";

/**
 * 编辑区与页面预览的滚动联动：按"标题锚点"对齐的纯函数集合。
 *
 * 设计要点：
 * - 只用纯函数，不持有任何状态，便于复用与推理；
 * - 对齐基准是**标题**而非滚动比例：源码含 frontmatter、代码块、表格等
 *   与渲染结果高度不一致的内容，按比例对齐会随阅读进度持续漂移；
 * - 两侧以"归一化后的标题文本"配对，因此无需改动 markdown 渲染配置，
 *   也不依赖主题生成的 id 规则。
 */

/** 源码中的一级到六级标题 */
export interface MarkdownHeading {
  /** 标题所在行号（1 基） */
  line: number;
  /** 标题级别（1–6） */
  level: number;
  /** 归一化后的标题文本（用于与页面锚点配对） */
  text: string;
}

/** 页面上已渲染的标题锚点 */
export interface PageAnchor {
  /** 标题元素 id，同时是配对后用于定位的锚点 */
  id: string;
  /** 归一化后的标题文本 */
  text: string;
  /** 标题元素相对文档顶部的偏移（px） */
  top: number;
}

/** 一条"源码标题 ↔ 页面锚点"的配对结果 */
export interface HeadingPair {
  heading: MarkdownHeading;
  anchor: PageAnchor;
}

/**
 * 归一化标题文本：抹平两侧的语法与空白差异，使其可直接比较。
 * 页面侧（渲染后）本就无 Markdown 语法，对其执行同样规则是幂等的。
 */
export function normalizeHeadingText(raw: string): string {
  return (
    raw
      // 图片：![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      // 链接：[text](url) → text
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // 行内代码：`code` → code
      .replace(/`([^`]*)`/g, "$1")
      // 强调标记：* ** _ __ ~~
      .replace(/[*_~]{1,3}/g, "")
      // 自定义锚点属性：标题尾部的 {#custom-id}
      .replace(/\{#[^}]*\}\s*$/g, "")
      // 闭合式 ATX 标题的尾部 #
      .replace(/\s+#+\s*$/, "")
      // 空白折叠
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * 从 Markdown 源码解析标题及其行号。
 * 会跳过 YAML frontmatter 与代码围栏内部的行，避免把注释里的 `#` 当成标题。
 */
export function parseMarkdownHeadings(content: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = content.split("\n");
  /** 当前是否处于代码围栏内 */
  let inFence = false;
  /** 开启围栏的标记字符（` 或 ~），仅同字符围栏可闭合 */
  let fenceChar = "";
  /** 当前是否处于开头的 YAML frontmatter 区块内 */
  let inFrontmatter = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // frontmatter 仅在首行起始处生效
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }

    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const char = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (char === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!match) continue;

    const text = normalizeHeadingText(match[2]);
    if (text === "") continue;
    headings.push({ line: i + 1, level: match[1].length, text });
  }

  return headings;
}

/**
 * 采集当前页面上已渲染的标题锚点（按文档顺序）。
 * 不依赖主题的内部容器类名，改为全局查询并排除编辑抽屉自身；
 * 主题会在标题内插入锚点链接，故优先取 `.header-anchor` 的文本，
 * 避免把锚点符号混入标题文本。
 */
export function collectPageAnchors(): PageAnchor[] {
  const anchors: PageAnchor[] = [];
  const nodes = document.querySelectorAll<HTMLElement>(
    "h2[id], h3[id], h4[id], h5[id], h6[id]",
  );

  nodes.forEach((node) => {
    // 编辑抽屉内不应作为预览锚点（其内容与左侧预览无关）
    if (node.closest(".doc-editor") !== null) return;
    const id = node.id;
    if (!id) return;
    const inner = node.querySelector(".header-anchor");
    const text = normalizeHeadingText((inner ?? node).textContent ?? "");
    if (text === "") return;
    anchors.push({
      id,
      text,
      top: node.getBoundingClientRect().top + window.scrollY,
    });
  });

  return anchors;
}

/**
 * 配对源码标题与页面锚点。
 * 以文本为键；同名标题按各自出现次序一一对应，避免后文锚点被前文占用。
 * 页面尚未渲染出的标题（如刚改完标题、HMR 未跟进）直接跳过，
 * 因此配对结果天然容忍两侧短暂不一致。
 */
export function pairHeadings(
  headings: MarkdownHeading[],
  anchors: PageAnchor[],
): HeadingPair[] {
  const buckets = new Map<string, PageAnchor[]>();
  for (const anchor of anchors) {
    const bucket = buckets.get(anchor.text);
    if (bucket) bucket.push(anchor);
    else buckets.set(anchor.text, [anchor]);
  }

  const consumed = new Map<string, number>();
  const pairs: HeadingPair[] = [];
  for (const heading of headings) {
    const bucket = buckets.get(heading.text);
    if (!bucket) continue;
    const index = consumed.get(heading.text) ?? 0;
    const anchor = bucket[index];
    if (!anchor) continue;
    consumed.set(heading.text, index + 1);
    pairs.push({ heading, anchor });
  }

  return pairs;
}

/**
 * 取"行号不超过 line 的最后一个标题"。
 * 用于"编辑区 → 页面"：编辑器视口顶部通常落在某个标题之后的正文里。
 * 若顶部与最近标题相距超过最大回溯行数，则视为落在无标题的长正文区，
 * 放弃本次对齐（返回 null），以免把页面拽到很远的标题上。
 */
export function findPairByLine(
  pairs: HeadingPair[],
  line: number,
): HeadingPair | null {
  let found: HeadingPair | null = null;
  for (const pair of pairs) {
    if (pair.heading.line > line) break;
    found = pair;
  }
  if (found === null) return null;
  return line - found.heading.line > SCROLL_SYNC_MAX_LOOKBACK_LINES
    ? null
    : found;
}

/**
 * 取"页面顶部位置不超过 pageTop 的最后一个标题"。
 * 用于"页面 → 编辑区"：以页面视口顶部为基准找当前正在阅读的小节。
 */
export function findPairByPageTop(
  pairs: HeadingPair[],
  pageTop: number,
): HeadingPair | null {
  let found: HeadingPair | null = null;
  for (const pair of pairs) {
    if (pair.anchor.top > pageTop) break;
    found = pair;
  }
  return found;
}
