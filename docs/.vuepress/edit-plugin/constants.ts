import path from "node:path";

/**
 * docs 源码根目录。
 * vuepress dev/build 始终从项目根目录（package.json 所在处）运行，
 * 因此以 process.cwd() 为基准解析，避免 config 打包后 import.meta.url 漂移的问题。
 */
export const DOCS_ROOT = path.resolve(process.cwd(), "docs");

/** 编辑 API 的统一路由前缀（挂载在 Vite dev server 上，与站点同源同端口） */
export const API_PREFIX = "/__edit/api";

/** 健康检查路由（客户端据此决定是否显示编辑入口） */
export const HEALTH_ROUTE = "/health";

/** 文件读写路由（GET 读取 / PUT 写回 / DELETE 移入回收站） */
export const FILE_ROUTE = "/file";

/** 新建页面路由（POST：按模板创建 .md） */
export const PAGE_ROUTE = "/page";

/** 目录树路由（GET：新建页选择器的数据源） */
export const DIRS_ROUTE = "/dirs";

/** 单个 Markdown 文件大小上限：2MB */
export const MAX_MD_BYTES = 2 * 1024 * 1024;

/** 请求体读取上限：在 md 上限基础上预留 JSON 结构与编码开销 */
export const MAX_BODY_BYTES = Math.floor(MAX_MD_BYTES * 1.5);

/** 编辑插件版本号（health 接口返回，供客户端展示与比对） */
export const EDIT_PLUGIN_VERSION = 1;

/** 允许读写的唯一扩展名 */
export const ALLOWED_MD_EXT = ".md";

/** 禁止读写的目录段（相对 docs 根的任意层级命中即拒绝） */
export const FORBIDDEN_SEGMENTS: readonly string[] = [
  ".vuepress",
  "node_modules",
  ".edit-trash",
];

/** 回收站根目录：删除的文件移入此处（按时间戳分目录），非硬删除 */
export const EDIT_TRASH_DIR = path.join(DOCS_ROOT, ".vuepress", ".edit-trash");

/** 新建页 slug 白名单：小写字母/数字开头，仅含小写字母、数字、连字符 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** 新建页 slug 最大长度（含扩展名前的完整文件名） */
export const MAX_SLUG_LENGTH = 80;

/** 目录树的最大遍历深度（防止超深层级拖垮请求） */
export const DIRS_MAX_DEPTH = 8;
