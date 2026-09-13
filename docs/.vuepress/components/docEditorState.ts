import { reactive } from "vue";
import { pinyin } from "pinyin-pro";
import { TEMPLATE_OPTIONS } from "../edit-plugin/templates.js";

export { TEMPLATE_OPTIONS };

/** 页面模板键（与 edit-plugin/templates.ts 的 PageTemplateKey 对齐） */
export type TemplateKey = "blank" | "article" | "note";

/**
 * 编辑 API 基础路径：仅由 edit-plugin 在 dev serve 模式通过 define 注入。
 * prod 构建中该标识符未定义，typeof 守卫降级为 null——
 * 编辑入口据此隐藏，且 API 路径字符串物理上不进入构建产物。
 */
declare const __EDIT_API_BASE__: string | undefined;

/** dev 环境的 API 基础路径；prod 为 null */
export const API_BASE: string | null =
  typeof __EDIT_API_BASE__ === "string" ? __EDIT_API_BASE__ : null;

/** 编辑抽屉默认宽度（左页右编辑布局） */
export const EDITOR_DRAWER_WIDTH = "45vw";

/** 编辑抽屉全屏宽度 */
export const EDITOR_FULL_WIDTH = "100vw";

/** 自动保存防抖间隔（ms）：写盘触发 HMR，防抖避免高频重编译 */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/** health 探测失败后的重试间隔（ms）：prod 静态托管必然 404，重试开销可忽略 */
export const HEALTH_RETRY_MS = 30_000;

/** 异步编辑抽屉 ref 就绪的轮询间隔（ms） */
export const EDITOR_REF_POLL_INTERVAL_MS = 100;

/** 异步编辑抽屉 ref 就绪的最大轮询次数（合计约 3s 上限） */
export const EDITOR_REF_POLL_MAX_TIMES = 30;

/** 会话草稿的 sessionStorage 键前缀（键 = 前缀 + filePathRelative） */
export const DRAFT_KEY_PREFIX = "doc-editor-draft:";

/** 自动保存开关的 localStorage 持久化键 */
export const AUTOSAVE_STORAGE_KEY = "doc-editor-autosave";

/** 编辑器状态（模块级 reactive 单例，跨路由/组件共享，不随路由销毁） */
export interface DocEditorState {
  /** 抽屉是否打开 */
  open: boolean;
  /** health 探测结果：null 表示探测中 */
  healthOk: boolean | null;
  /** 当前编辑文件的相对路径（pageData.filePathRelative） */
  activeFp: string | null;
  /** 编辑器内容（完整 Markdown 源文，含 frontmatter 文本） */
  rawContent: string;
  /** 服务端 mtime（乐观锁基准），保存成功后更新 */
  baseMtime: number | null;
  /** 相对于上次保存是否有改动 */
  dirty: boolean;
  /** 保存请求进行中 */
  saving: boolean;
  /** 上次保存成功的时间戳（用于状态栏展示） */
  lastSavedAt: number | null;
  /** mtime 冲突（409）状态，此时阻止自动保存、由用户决策 */
  conflict: boolean;
  /** 服务端当前 mtime（409 时记录，供"覆盖/重载"决策） */
  serverMtime: number | null;
  /** 自动保存开关（默认开启，用户确认的决策） */
  autosaveOn: boolean;
  /** 加载失败信息 */
  loadError: string | null;
  /** 保存失败信息（非冲突类） */
  saveError: string | null;
  /** 是否从会话草稿恢复了未保存内容 */
  draftRestored: boolean;
}

const AUTOSAVE_DEFAULT = "on";

/** 从 localStorage 读取自动保存开关（默认开启） */
function loadAutosavePreference(): boolean {
  try {
    return localStorage.getItem(AUTOSAVE_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** 模块级单例：所有编辑相关组件共享同一份状态 */
export const editorState: DocEditorState = reactive({
  open: false,
  healthOk: null,
  activeFp: null,
  rawContent: "",
  baseMtime: null,
  dirty: false,
  saving: false,
  lastSavedAt: null,
  conflict: false,
  serverMtime: null,
  autosaveOn: loadAutosavePreference(),
  loadError: null,
  saveError: null,
  draftRestored: false,
});

/** 获取编辑器共享状态（等价于直接导入 editorState，提供语义化入口） */
export function useDocEditor(): DocEditorState {
  return editorState;
}

/** 持久化自动保存开关 */
export function setAutosavePreference(enabled: boolean): void {
  editorState.autosaveOn = enabled;
  try {
    localStorage.setItem(
      AUTOSAVE_STORAGE_KEY,
      enabled ? AUTOSAVE_DEFAULT : "off",
    );
  } catch {
    // 存储不可用时仅影响下次会话的默认值，不中断编辑流程
  }
}

/** API 结构化错误：携带 HTTP 状态与冲突详情，供调用方分流处理 */
export class ApiError extends Error {
  readonly status: number;
  readonly conflict: boolean;
  readonly serverMtime: number | null;

  constructor(
    message: string,
    status: number,
    options?: { conflict?: boolean; serverMtime?: number | null },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.conflict = options?.conflict ?? false;
    this.serverMtime = options?.serverMtime ?? null;
  }
}

/** GET /file 的响应结构 */
export interface LoadedFile {
  content: string;
  mtime: number;
}

/** 统一的 API fetch 封装：非 2xx 抛出 ApiError */
async function requestApi<T>(url: string, init?: RequestInit): Promise<T> {
  if (API_BASE === null) {
    throw new ApiError("编辑服务不可用（非本地开发环境）", 0);
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    throw new ApiError(
      `无法连接编辑服务：${err instanceof Error ? err.message : String(err)}`,
      0,
    );
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // 非 JSON（如 prod 环境的 404 页面）按统一错误处理
  }
  if (!response.ok || payload.ok !== true) {
    throw new ApiError(
      typeof payload.message === "string"
        ? payload.message
        : `编辑 API 请求失败（HTTP ${response.status}）`,
      response.status,
      {
        conflict: payload.conflict === true,
        serverMtime:
          typeof payload.serverMtime === "number" ? payload.serverMtime : null,
      },
    );
  }
  return payload as T;
}

/** 读取当前页源文件 */
export function fetchFile(fp: string): Promise<LoadedFile> {
  return requestApi<LoadedFile>(
    `${API_BASE}/file?fp=${encodeURIComponent(fp)}`,
  );
}

/** PUT /file 的请求参数 */
export interface SaveFileParams {
  fp: string;
  content: string;
  baseMtime: number | null;
  /** 冲突后用户选择"以我的为准覆盖"时置 true，跳过 mtime 比对 */
  force?: boolean;
}

/** 写回当前页源文件，返回服务端新 mtime */
export function saveFile({
  fp,
  content,
  baseMtime,
  force = false,
}: SaveFileParams): Promise<{ mtime: number }> {
  return requestApi<{ mtime: number }>(`${API_BASE}/file`, {
    method: "PUT",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ fp, content, baseMtime, force }),
  });
}

/** 会话草稿键 */
function draftKey(fp: string): string {
  return `${DRAFT_KEY_PREFIX}${fp}`;
}

/** 读取会话草稿（防浏览器崩溃丢稿），无草稿返回 null */
export function readDraft(fp: string): string | null {
  try {
    return sessionStorage.getItem(draftKey(fp));
  } catch {
    return null;
  }
}

/** 写入会话草稿 */
export function writeDraft(fp: string, content: string): void {
  try {
    sessionStorage.setItem(draftKey(fp), content);
  } catch {
    // 草稿是兜底手段，写失败不影响主流程
  }
}

/** 清除会话草稿（保存成功后调用） */
export function clearDraft(fp: string): void {
  try {
    sessionStorage.removeItem(draftKey(fp));
  } catch {
    // 同上
  }
}

/* ---------------------------------------------------------------- */
/* P2：新建/删除页面与目录树                                          */
/* ---------------------------------------------------------------- */

/** GET /dirs 响应中的目录树节点（与服务端 dirs.ts 的 DirNode 对齐） */
export interface DirNode {
  /** 目录名（docs 根节点为 "docs"） */
  name: string;
  /** 相对 docs 根的目录路径（`/` 分隔；根节点为空字符串） */
  path: string;
  /** 子目录 */
  children: DirNode[];
}

/** POST /page 的请求参数 */
export interface CreatePageParams {
  /** 目标目录（`/` 分隔相对路径，空字符串表示 docs 根） */
  dir: string;
  /** 文件名 slug（不含 .md 扩展名） */
  slug: string;
  /** 页面标题（渲染进模板 frontmatter） */
  title: string;
  /** 模板键 */
  template: TemplateKey;
}

/** 读取 docs 根下的可用目录树（新建页目录选择器数据源） */
export async function fetchDirs(): Promise<DirNode> {
  const { dirs } = await requestApi<{ dirs: DirNode }>(`${API_BASE}/dirs`);
  return dirs;
}

/** 按模板新建页面，返回新文件的相对路径（pageData.filePathRelative 形态） */
export function createPage(params: CreatePageParams): Promise<{ fp: string }> {
  return requestApi<{ fp: string }>(`${API_BASE}/page`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(params),
  });
}

/** 删除页面（服务端移入回收站 .edit-trash，可手工还原） */
export function deletePage(fp: string): Promise<{ trashPath: string }> {
  return requestApi<{ trashPath: string }>(
    `${API_BASE}/file?fp=${encodeURIComponent(fp)}`,
    { method: "DELETE" },
  );
}

/** 新建页 slug 上限（与服务端 MAX_SLUG_LENGTH 对齐） */
export const MAX_SLUG_LENGTH = 80;

/**
 * 标题 → slug：中文转拼音（无声调）、英文保留、非法字符剔除、
 * 多余连字符合并。空结果回退为 "page"。
 */
export function titleToSlug(title: string): string {
  const withPinyin = pinyin(title.trim().toLowerCase(), {
    toneType: "none",
    type: "string",
    separator: "-",
    nonZh: "consecutive",
  });
  const slug = withPinyin
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug === "" ? "page" : slug;
}

/* ---------------------------------------------------------------- */
/* 全局轻量 toast（新建/删除等动作的结果反馈）                        */
/* ---------------------------------------------------------------- */

/** toast 显示时长（ms） */
const TOAST_DURATION_MS = 3000;

/** toast 隐藏定时器句柄 */
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** 全局 toast 文本（编辑相关组件共享，单条即够用） */
export const toastMessage = reactive<{ text: string | null }>({ text: null });

/** 显示全局 toast，TOAST_DURATION_MS 后自动消失 */
export function showToast(text: string): void {
  toastMessage.text = text;
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.text = null;
    toastTimer = null;
  }, TOAST_DURATION_MS);
}
