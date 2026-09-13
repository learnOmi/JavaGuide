import { promises as fs } from "node:fs";
import path from "node:path";
import { DIRS_MAX_DEPTH, DOCS_ROOT } from "./constants.js";
import { FORBIDDEN_SEGMENTS } from "./constants.js";

/** 目录树节点（新建页目录选择器的数据源） */
export interface DirNode {
  /** 目录名（docs 根节点为 "docs"） */
  name: string;
  /** 相对 docs 根的目录路径（`/` 分隔；根节点为空字符串） */
  path: string;
  /** 子目录（按名称排序） */
  children: DirNode[];
}

/** 禁区目录段的快速查找集合（统一小写比较） */
const FORBIDDEN_SEGMENT_SET = new Set(
  FORBIDDEN_SEGMENTS.map((segment) => segment.toLowerCase()),
);

/**
 * 递归扫描目录并构建树节点。
 * - 跳过禁区目录（.vuepress / node_modules / .edit-trash）与所有点开头目录；
 * - 仅统计目录，不列出文件；
 * - 超过 DIRS_MAX_DEPTH 不再下钻。
 */
async function scanDir(
  absoluteDir: string,
  relativeDir: string,
  name: string,
  depth: number,
): Promise<DirNode> {
  const node: DirNode = { name, path: relativeDir, children: [] };
  if (depth >= DIRS_MAX_DEPTH) {
    return node;
  }

  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  const childDirs = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => !FORBIDDEN_SEGMENT_SET.has(entry.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  const children = await Promise.all(
    childDirs.map((entry) =>
      scanDir(
        path.join(absoluteDir, entry.name),
        relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`,
        entry.name,
        depth + 1,
      ),
    ),
  );
  node.children = children;
  return node;
}

/**
 * 构建 docs 根下的可用目录树（GET /dirs 响应数据）。
 * 扫描失败按空树降级，避免编辑 API 因文件系统抖动整体不可用。
 */
export async function listDocsDirs(): Promise<DirNode> {
  try {
    return await scanDir(DOCS_ROOT, "", "docs", 0);
  } catch {
    return { name: "docs", path: "", children: [] };
  }
}
