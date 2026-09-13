import { dump, load } from "js-yaml";

/**
 * frontmatter 解析与"按键级手术式"补丁工具。
 *
 * 设计要点（对应实施计划第 191 行风险项）：
 * - 不做整块 frontmatter 的 load → dump 往返（会丢失注释与原格式），
 *   而是只在原始文本上精准定位某个顶层键所在的行区间，替换/删除/插入该区间；
 * - 键区块的界定：顶层键行 = 行首（无缩进）匹配 `key:`；该键的区块延伸到
 *   下一个顶层键行之前的所有行（含更深层缩进的续行与空行）；
 * - 新值的序列化交给 js-yaml dump（含正确的引号/多行块样式），
 *   杜绝手工拼接产生非法 YAML。
 */

/** frontmatter 围栏标记 */
const FENCE = "---";

/** 顶层键名白名单：字母/数字/下划线/连字符，防止注入多行伪键 */
const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 定位到的 frontmatter 区块（行号均为 0 基） */
export interface FrontmatterRange {
  /** 起始围栏行号；-1 表示文档没有 frontmatter */
  startLine: number;
  /** 结束围栏行号；无 frontmatter 时为 -1 */
  endLine: number;
  /** 围栏之间的 YAML 原文（未做任何格式化） */
  yamlText: string;
}

/**
 * 定位文档头部的 frontmatter 区块。
 * 仅识别文档第一行即 `---` 的标准形态；正文中间的 `---` 分隔线不受影响。
 */
export function findFrontmatter(raw: string): FrontmatterRange {
  const lines = raw.split("\n");
  const first = (lines[0] ?? "").replace(/^\uFEFF/, "").trim();
  if (first !== FENCE) {
    return { startLine: -1, endLine: -1, yamlText: "" };
  }

  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === FENCE) {
      return {
        startLine: 0,
        endLine: i,
        yamlText: lines.slice(1, i).join("\n"),
      };
    }
  }
  // 只有起始围栏没有结束围栏：视为无 frontmatter，避免误改正文
  return { startLine: -1, endLine: -1, yamlText: "" };
}

/**
 * 解析 frontmatter YAML 为对象。
 * 解析失败（非法 YAML）返回空对象，不抛出——表单据此降级为"源文编辑"模式。
 */
export function parseFrontmatterData(
  yamlText: string,
): Record<string, unknown> {
  if (yamlText.trim() === "") {
    return {};
  }
  try {
    const data = load(yamlText);
    return data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** 读取文档 frontmatter 中的单个键值（无 frontmatter/键不存在/解析失败 → undefined） */
export function getFrontmatterValue(
  raw: string,
  key: string,
): unknown | undefined {
  const { yamlText } = findFrontmatter(raw);
  if (yamlText === "") {
    return undefined;
  }
  const data = parseFrontmatterData(yamlText);
  return Object.hasOwn(data, key) ? data[key] : undefined;
}

/**
 * 检测 frontmatter YAML 是否存在语法错误。
 * 表单据此降级停用（错误状态下经表单写入会破坏用户数据）。
 */
export function hasFrontmatterSyntaxError(yamlText: string): boolean {
  if (yamlText.trim() === "") {
    return false;
  }
  try {
    load(yamlText);
    return false;
  } catch {
    return true;
  }
}

/**
 * 将任意值序列化为一行或多行 `key: value` YAML 片段。
 *
 * - 纯量（null/字符串/数字/布尔）输出单行 `key: value`（js-yaml 负责引号）；
 * - 数组/对象/多行字符串输出 `key:` + 统一缩进两格的块样式，
 *   与 JavaGuide 现有 frontmatter 的排版习惯一致。
 *
 * 注意必须按"值类型"分流而非按 dump 输出行数：
 * 单键对象 dump 结果恰为单行（如 `depth: 3`），若按行数判断会拼出
 * `key: depth: 3` 这类非法 YAML。
 */
function serializeKeyValue(key: string, value: unknown): string[] {
  const isScalar =
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
  if (isScalar) {
    const dumped = dump(value, { lineWidth: -1, noRefs: true }).trimEnd();
    if (!dumped.includes("\n")) {
      return [`${key}: ${dumped}`];
    }
  }
  // 集合/多行文本：块样式
  const dumped = dump(value, { lineWidth: -1, noRefs: true }).trimEnd();
  return [
    `${key}:`,
    ...dumped.split("\n").map((line) => (line === "" ? line : `  ${line}`)),
  ];
}

/**
 * 在原始 Markdown 文本上对 frontmatter 顶层键做"手术式"修改。
 *
 * @param raw 完整 Markdown 源文
 * @param key 顶层键名（仅允许字母/数字/下划线/连字符）
 * @param value 新值；传 `undefined` 表示删除该键
 * @returns 修改后的完整 Markdown 源文（frontmatter 之外的文本保证逐字节不变）
 * @throws Error 键名非法时抛出
 */
export function updateFrontmatterKey(
  raw: string,
  key: string,
  value: unknown,
): string {
  if (!KEY_PATTERN.test(key)) {
    throw new Error(`非法的 frontmatter 键名：${key}`);
  }

  const { startLine, endLine } = findFrontmatter(raw);
  const lines = raw.split("\n");

  // 情形一：文档没有 frontmatter
  if (startLine === -1) {
    if (value === undefined) {
      return raw; // 删除不存在的键：原地返回
    }
    return [FENCE, ...serializeKeyValue(key, value), FENCE, ...lines].join(
      "\n",
    );
  }

  // 情形二：已有 frontmatter，在围栏内定位顶层键区块
  const keyLinePrefix = `${key}:`;
  let keyIndex = -1;
  for (let i = startLine + 1; i < endLine; i += 1) {
    const line = lines[i];
    if (line.startsWith(keyLinePrefix) && !/^\s/.test(line)) {
      keyIndex = i;
      break;
    }
  }

  if (keyIndex === -1) {
    // 键不存在：删除为空操作；写入则插到 frontmatter 开头
    if (value === undefined) {
      return raw;
    }
    lines.splice(startLine + 1, 0, ...serializeKeyValue(key, value));
    return lines.join("\n");
  }

  // 计算键区块边界：从键行向后，直到下一个顶层键行（无缩进的行）为止
  let blockEnd = keyIndex;
  for (let i = keyIndex + 1; i < endLine; i += 1) {
    const line = lines[i];
    if (line.trim() === "") {
      blockEnd = i; // 空行暂记为区块尾部，若后续仍是缩进内容则继续延伸
      continue;
    }
    if (/^\s/.test(line)) {
      blockEnd = i;
      continue;
    }
    break; // 命中下一个顶层键，停止
  }

  if (value === undefined) {
    lines.splice(keyIndex, blockEnd - keyIndex + 1);
  } else {
    lines.splice(
      keyIndex,
      blockEnd - keyIndex + 1,
      ...serializeKeyValue(key, value),
    );
  }
  return lines.join("\n");
}
