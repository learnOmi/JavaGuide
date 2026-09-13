import { existsSync } from "node:fs";
import path from "node:path";
import { ALLOWED_MD_EXT, DOCS_ROOT, FORBIDDEN_SEGMENTS } from "./constants.js";

/** 禁止目录段的快速查找集合（统一小写比较） */
const FORBIDDEN_SEGMENT_SET = new Set(
  FORBIDDEN_SEGMENTS.map((segment) => segment.toLowerCase()),
);

/**
 * 路径/参数校验失败异常。
 * API 层据此将响应状态码定为 400（区别于未知错误的 500）。
 */
export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathValidationError";
  }
}

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
 * 校验客户端传入的相对目录（新建页目标目录），杜绝路径穿越与禁区访问。
 *
 * 与 {@link resolveSafeMdPath} 共用同一套防线，差异点：
 * 1. 允许空字符串（代表 docs 根本身）；
 * 2. 校验对象是目录而非文件，无扩展名要求。
 *
 * @param dir 客户端传入的相对目录（`/` 分隔，如 `JavaBasis/集合` 或 ``）
 * @returns 解析后的绝对目录路径
 * @throws PathValidationError 目录非法、越界或命中禁区时抛出
 */
export function resolveSafeMdDir(dir: unknown): string {
  if (dir === undefined || dir === null || dir === "") {
    return DOCS_ROOT;
  }
  if (typeof dir !== "string") {
    throw new PathValidationError("目录路径必须为字符串");
  }
  if (dir.includes("\0") || dir.includes("\\") || path.isAbsolute(dir)) {
    throw new PathValidationError("目录路径格式非法");
  }
  if (dir.startsWith("/") || dir.endsWith("/")) {
    throw new PathValidationError("目录路径不能以 / 开头或结尾");
  }

  const absolute = path.resolve(DOCS_ROOT, dir);
  const rootWithSep = DOCS_ROOT.endsWith(path.sep)
    ? DOCS_ROOT
    : DOCS_ROOT + path.sep;
  if (absolute !== DOCS_ROOT && !absolute.startsWith(rootWithSep)) {
    throw new PathValidationError("目录路径越界");
  }

  const relative = path.relative(DOCS_ROOT, absolute);
  for (const segment of relative.split(path.sep)) {
    if (FORBIDDEN_SEGMENT_SET.has(segment.toLowerCase())) {
      throw new PathValidationError(`禁止访问目录：${segment}`);
    }
  }
  return absolute;
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
 * @throws PathValidationError 路径非法、越界或命中禁区时抛出，由 API 层转换为 400 响应
 */
export function resolveSafeMdPath(fp: unknown): string {
  if (typeof fp !== "string" || fp.length === 0) {
    throw new PathValidationError("文件路径不能为空");
  }
  if (fp.includes("\0") || fp.includes("\\") || path.isAbsolute(fp)) {
    // 反斜杠一律拒绝：统一使用 filePathRelative 的 / 分隔风格，
    // 避免 Windows 分隔符绕过路径段检查
    throw new PathValidationError("文件路径格式非法");
  }

  const absolute = path.resolve(DOCS_ROOT, fp);
  const rootWithSep = DOCS_ROOT.endsWith(path.sep)
    ? DOCS_ROOT
    : DOCS_ROOT + path.sep;
  if (absolute !== DOCS_ROOT && !absolute.startsWith(rootWithSep)) {
    throw new PathValidationError("文件路径越界");
  }
  if (path.extname(absolute).toLowerCase() !== ALLOWED_MD_EXT) {
    throw new PathValidationError(`仅允许读写 ${ALLOWED_MD_EXT} 文件`);
  }

  const relative = path.relative(DOCS_ROOT, absolute);
  for (const segment of relative.split(path.sep)) {
    if (FORBIDDEN_SEGMENT_SET.has(segment.toLowerCase())) {
      throw new PathValidationError(`禁止访问目录：${segment}`);
    }
  }
  return absolute;
}
