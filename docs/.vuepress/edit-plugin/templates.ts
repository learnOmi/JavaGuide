/**
 * 新建页面的 frontmatter 模板。
 *
 * 模板渲染在服务端完成（POST /page），保证：
 * - 模板键名/结构集中维护，与 FrontmatterForm 的可编辑键保持同源；
 * - 标题等动态值统一走 YAML 双引号转义，避免手工拼接产生非法 frontmatter。
 */

/** 模板标识（与客户端 NewPageDialog 的选项一一对应） */
export type PageTemplateKey = "blank" | "article" | "note";

/** 模板描述（客户端展示用） */
export interface TemplateOption {
  key: PageTemplateKey;
  label: string;
  description: string;
}

/** 可选模板清单（顺序即客户端展示顺序） */
export const TEMPLATE_OPTIONS: readonly TemplateOption[] = [
  {
    key: "blank",
    label: "空白页",
    description: "仅含 title 的最小 frontmatter，从零开始",
  },
  {
    key: "article",
    label: "文章页",
    description: "title/icon/date/category/tag，适合知识文章",
  },
  {
    key: "note",
    label: "笔记页",
    description: "title/icon/date/order，适合归入侧边栏目录的知识点",
  },
];

/** 模板键快速查找集合 */
const TEMPLATE_KEY_SET = new Set(TEMPLATE_OPTIONS.map((option) => option.key));

/** 校验模板键是否在白名单内 */
export function isTemplateKey(value: unknown): value is PageTemplateKey {
  return typeof value === "string" && TEMPLATE_KEY_SET.has(value as never);
}

/**
 * 将任意文本安全地序列化为 YAML 双引号标量。
 * 处理反斜杠/双引号转义，并剥离换行与控制字符（frontmatter 值不允许跨行）。
 */
function toYamlScalar(text: string): string {
  const cleaned = text.replace(/[\r\n\x00-\x1f]+/g, " ").trim();
  return `"${cleaned.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** 当前本地日期（YYYY-MM-DD），用于模板 date 字段 */
function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * 按模板渲染新建页的完整 Markdown 内容。
 * @param key 模板键（调用方已用 isTemplateKey 校验）
 * @param title 页面标题（渲染进 frontmatter 与一级标题）
 * @returns 完整 .md 文件内容（UTF-8 文本）
 */
export function renderPageTemplate(
  key: PageTemplateKey,
  title: string,
): string {
  const titleYaml = toYamlScalar(title);

  switch (key) {
    case "article":
      return [
        "---",
        `title: ${titleYaml}`,
        "icon: mdi:file-document-outline",
        `date: ${todayLocal()}`,
        "---",
        "",
        `# ${title.trim()}`,
        "",
        "",
      ].join("\n");
    case "note":
      return [
        "---",
        `title: ${titleYaml}`,
        "icon: mdi:note-edit-outline",
        `date: ${todayLocal()}`,
        "order: 1",
        "---",
        "",
        `# ${title.trim()}`,
        "",
        "",
      ].join("\n");
    case "blank":
    default:
      return [
        "---",
        `title: ${titleYaml}`,
        "---",
        "",
        `# ${title.trim()}`,
        "",
        "",
      ].join("\n");
  }
}
