import path from "node:path";
import {
  ALLOWED_IMAGE_EXTS,
  IMAGE_NAME_PATTERN,
  MAX_IMAGE_NAME_LENGTH,
} from "./constants.js";

/**
 * 图片 magic bytes 嗅探器与文件名规范化工具。
 *
 * 设计要点：
 * - 不做"以扩展名信任内容"：伪造扩展名（如 .exe 改名为 .png）的文件，
 *   其文件头无法命中白名单 magic bytes，嗅探返回 null 或与扩展名不符，
 *   上传请求被拒绝（P3 验收项②）；
 * - svg 明确禁用：SVG 可内嵌脚本，静态站点存在 XSS 风险，不入白名单。
 */

/** magic bytes 识别表：每个条目包含扩展名与文件头匹配函数 */
interface MagicEntry {
  ext: string;
  match: (buf: Uint8Array) => boolean;
}

/** 各格式文件头匹配器 */
const MAGIC_ENTRIES: readonly MagicEntry[] = [
  {
    // PNG：89 50 4E 47 0D 0A 1A 0A
    ext: "png",
    match: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    // JPEG：FF D8 FF
    ext: "jpg",
    match: (buf) =>
      buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    // GIF：GIF87a / GIF89a（47 49 46 38 37 61 / 39 61）
    ext: "gif",
    match: (buf) =>
      buf.length >= 6 &&
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) &&
      buf[5] === 0x61,
  },
  {
    // WebP：RIFF (52 49 46 46) + 4 字节大小 + WEBP (57 45 42 50)
    ext: "webp",
    match: (buf) =>
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50,
  },
];

/**
 * 嗅探二进制数据对应的图片类型。
 * @param buf 解码后的图片二进制数据
 * @returns 命中的扩展名（如 "png"，不含点）；无法识别返回 null
 */
export function sniffImageType(buf: Uint8Array): string | null {
  const hit = MAGIC_ENTRIES.find((entry) => entry.match(buf));
  return hit ? hit.ext : null;
}

/**
 * 从上传文件名中提取扩展名（最后一个点之后的小写形式）。
 * @param filename 原始上传文件名（可能含中文/空格）
 * @returns 扩展名（不含点），无扩展名返回 null
 */
export function extractImageExt(filename: string): string | null {
  const base = path.basename(filename).trim();
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === base.length - 1) {
    return null;
  }
  return base.slice(dotIndex + 1).toLowerCase();
}

/**
 * 将文件名主干规范化为白名单形态：
 * 非法字符（中文/空格/标点）替换为连字符、连续连字符合并、
 * 首尾去连字符、转小写；空结果回退为 "image"。
 *
 * @param stem 原始文件名主干（不含扩展名）
 * @returns 规范化后的文件名主干（满足 IMAGE_NAME_PATTERN）
 */
export function normalizeImageStem(stem: string): string {
  const normalized = stem
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, MAX_IMAGE_NAME_LENGTH)
    .replace(/-+$/g, "");
  return normalized === "" ? "image" : normalized;
}

/**
 * 校验上传文件名的"基础合法性"（不含主干字符白名单）：
 * 主干中的中文/空格等非法字符由 {@link normalizeImageStem} 在落盘时转 slug，
 * 这里只保证无路径注入风险、扩展名在白名单内、主干非空且不过长。
 *
 * @param filename 完整上传文件名（可为中文）
 * @returns true 表示可进入后续规范化流程
 */
export function isImageNameValid(filename: string): boolean {
  const base = path.basename(filename).trim();
  if (
    base !== filename ||
    base.includes("..") ||
    base.includes("\0") ||
    base.includes("/") ||
    base.includes("\\")
  ) {
    return false;
  }
  const ext = extractImageExt(base);
  if (ext === null || !ALLOWED_IMAGE_EXTS.includes(ext)) {
    return false;
  }
  const stem = base.slice(0, base.length - ext.length - 1);
  // 原始主干长度上限放宽到规范化上限的两倍：中文等字符在规范化时会被压缩/替换
  if (stem.length === 0 || stem.length > MAX_IMAGE_NAME_LENGTH * 2) {
    return false;
  }
  return true;
}
