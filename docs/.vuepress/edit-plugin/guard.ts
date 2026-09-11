import { existsSync } from "node:fs";
import path from "node:path";
import { ALLOWED_MD_EXT, DOCS_ROOT, FORBIDDEN_SEGMENTS } from "./constants.js";

/** 禁止目录段的快速查找集合（统一小写比较） */
const FORBIDDEN_SEGMENT_SET = new Set(
  FORBIDDEN_SEGMENTS.map((segment) => segment.toLowerCase()),
);

/**
 * 校验运行环境是否满足编辑插件要求。
 * @returns 合法返回 null；否则返回问题描述（此时插件应静默禁用）
 */
export function validateEnvironment(): string | null {
  if (!existsSync(DOCS_ROOT)) {
    return `docs 根目录不存在：${DOCS_ROOT}`;
  }
  if (!existsSync(path.join(DOCS_ROOT, ".vuepress"))) {
    return "未找到 docs/.vuepress 目录，无法确认 docs 根";
  }
  return null;
}

/**
 * 校验并解析客户端传入的相对文件路径，杜绝路径穿越与禁区访问。
 *
 * 防线设计：
 * 1. 只接受以 `/` 分隔的相对路径（与 VuePress pageData.filePathRelative 一致）；
 * 2. resolve 后必须仍位于 DOCS_ROOT 内部；
 * 3. 扩展名必须为 .md；
 * 4. 路径段命中禁区（.vuepress / node_modules / .edit-trash）即拒绝。
 *
 * @param fp 客户端传入的相对路径
 * @returns 解析后的绝对路径
 * @throws Error 路径非法、越界或命中禁区时抛出，由 API 层转换为 400 响应
 */
export function resolveSafeMdPath(fp: unknown): string {
  if (typeof fp !== "string" || fp.length === 0) {
    throw new Error("文件路径不能为空");
  }
  if (fp.includes("\0") || fp.includes("\\") || path.isAbsolute(fp)) {
    // 反斜杠一律拒绝：统一使用 filePathRelative 的 / 分隔风格，
    // 避免 Windows 分隔符绕过路径段检查
    throw new Error("文件路径格式非法");
  }

  const absolute = path.resolve(DOCS_ROOT, fp);
  const rootWithSep = DOCS_ROOT.endsWith(path.sep)
    ? DOCS_ROOT
    : DOCS_ROOT + path.sep;
  if (absolute !== DOCS_ROOT && !absolute.startsWith(rootWithSep)) {
    throw new Error("文件路径越界");
  }
  if (path.extname(absolute).toLowerCase() !== ALLOWED_MD_EXT) {
    throw new Error(`仅允许读写 ${ALLOWED_MD_EXT} 文件`);
  }

  const relative = path.relative(DOCS_ROOT, absolute);
  for (const segment of relative.split(path.sep)) {
    if (FORBIDDEN_SEGMENT_SET.has(segment.toLowerCase())) {
      throw new Error(`禁止访问目录：${segment}`);
    }
  }
  return absolute;
}
