/**
 * 阅读续读：上次阅读位置的存储与锚点换算。
 *
 * 设计要点：位置以「标题锚点 + 越过该标题的进深」记录，而非绝对像素——
 * 本站正文含懒加载图片、异步 Mermaid 与代码高亮，页面高度在加载后仍会变化，
 * 绝对像素在下次打开时必然落错（存了 4200，下次可能整篇只有 3000 高）。
 *
 * 本模块为纯逻辑模块：不导入任何会引入副作用或重依赖的模块（尤其不能
 * 导入 docEditorState.ts —— 它顶层引入 pinyin-pro，会把拼音库拖进主包）。
 */

/** 上次阅读位置在 localStorage 中的键名 */
export const READING_STORAGE_KEY = "javaguide-reading-last";

/**
 * 导航栏遮挡偏移（px）：让标题停在 sticky 导航栏下方。
 *
 * 取值与 docEditorState.ts 的 `SCROLL_SYNC_PAGE_OFFSET_PX` 一致（同为 80），
 * 但**刻意不 import 复用**：docEditorState 顶层引入 pinyin-pro，
 * 引用它会把拼音库带进主包。此处仅镜像同一约定，两处若需调整必须同步。
 */
export const NAV_OFFSET_PX = 80;

/** 沉浸模式标记类：由 LayoutToggle 写在 <html> 上 */
export const IMMERSIVE_CLASS = "layout-hidden";

/** 滚动保存的节流间隔（ms） */
export const SAVE_THROTTLE_MS = 400;

/** 恢复重试的总时长上限（ms） */
export const RESTORE_DEADLINE_MS = 4000;

/** 恢复重试间隔（ms） */
export const RESTORE_RETRY_MS = 200;

/**
 * 判定"已收敛"所需的连续稳定轮数。
 *
 * 仅凭 `docHeight >= 记录时高度` 就停止重试是不够的：懒加载图片/Mermaid
 * 往往在总高"刚够"之后还继续把锚点往下推，过早停手会停在偏上的位置
 * （实测在 memory-area 页偏差达 447px）。因此要求目标坐标连续若干轮不变，
 * 才认为上方内容已铺开。取值 2 约等于 400ms 的静默期。
 */
export const RESTORE_SETTLE_CHECKS = 2;

/**
 * 视为"有实际阅读进深"的最小偏移（px）。
 * 两个用途：① 距页顶小于此值不写入记录（避免把"刚进页"当成有价值的断点）；
 * ② 同页续读提示的门槛（偏移太小则没有可恢复的内容）。
 */
export const MIN_SAVE_OFFSET_PX = 120;

/** 入口文案中标题的最大长度，超出截断 */
export const RESUME_TITLE_MAX_LEN = 24;

/** 挂载后再复检一次续读条件的延迟（ms）：等浏览器自身的滚动恢复落定 */
export const RECHECK_DELAY_MS = 800;

/** 一处阅读位置 */
export interface ReadingPosition {
  /** 路由 path，例如 /cs-basics/java/hashmap */
  path: string;
  /** 页面标题，用于入口文案 */
  title: string;
  /** 最近的上方标题锚点 id；页面无可锚定标题时为空串 */
  anchor: string;
  /** 相对该锚点的"已读进深"（px）；anchor 为空时表示绝对 scrollY */
  offset: number;
  /** 记录时刻的文档总高，用于恢复前判断内容是否已铺开 */
  docHeight: number;
  /** 记录时间戳 */
  savedAt: number;
}

/** 元素相对文档顶部的绝对高度 */
export function absTop(el: HTMLElement): number {
  return el.getBoundingClientRect().top + window.scrollY;
}

/** 当前沉浸模式是否开启（LayoutToggle 把标记类写在 <html> 上） */
export function isImmersive(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains(IMMERSIVE_CLASS);
}

/**
 * 当前的导航栏遮挡偏移。
 * 沉浸模式下导航栏隐藏、不存在遮挡，返回 0 —— 否则会凭空多算 80px。
 */
export function currentNavOffset(): number {
  return isImmersive() ? 0 : NAV_OFFSET_PX;
}

/**
 * 找到"当前小节标题"：绝对高度不超过视口参考线的最后一个带 id 的标题。
 *
 * 参考线取 `scrollY + navOffset`，与恢复侧的
 * `targetScrollY = absTop(heading) - navOffset + offset` 严格互逆。
 * 找不到时返回 null，调用方据此退化为绝对偏移。
 */
export function findCurrentHeading(
  scrollY: number,
  navOffset: number,
): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const container =
    document.querySelector("[vp-content]") ?? document.documentElement;
  const headings = container.querySelectorAll<HTMLElement>(
    "h2[id], h3[id], h4[id]",
  );

  const line = scrollY + navOffset;
  let found: HTMLElement | null = null;
  // 不提前 break：querySelectorAll 已按文档序返回，但逐个比较可免受
  // 个别标题负外边距等异常定位影响
  headings.forEach((heading) => {
    if (absTop(heading) <= line) found = heading;
  });
  return found;
}

/**
 * 依据当前滚动位置构造一条阅读记录。
 * 调用方负责节流与"距页顶过近则跳过"的判断。
 */
export function capturePosition(path: string, title: string): ReadingPosition {
  const scrollY = window.scrollY;
  const navOffset = currentNavOffset();
  const heading = findCurrentHeading(scrollY, navOffset);

  return {
    path,
    title: truncateTitle(title),
    anchor: heading?.id ?? "",
    offset: heading ? scrollY + navOffset - absTop(heading) : scrollY,
    docHeight: document.documentElement.scrollHeight,
    savedAt: Date.now(),
  };
}

/**
 * 依据记录算出应当滚动到的目标位置。
 * 锚点元素已不存在时返回 null —— 页面结构变了，不再强行恢复。
 */
export function expectedScrollY(pos: ReadingPosition): number | null {
  if (!pos.anchor) return pos.offset;

  const heading = document.getElementById(pos.anchor);
  if (!heading) return null;

  return absTop(heading) - currentNavOffset() + pos.offset;
}

/** 按上限截断标题，供入口文案使用 */
export function truncateTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= RESUME_TITLE_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, RESUME_TITLE_MAX_LEN)}…`;
}

/**
 * 读取上次阅读位置。
 * 无记录、内容损坏或存储不可用一律返回 null（不抛异常，不影响阅读）。
 */
export function readSaved(): ReadingPosition | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(READING_STORAGE_KEY);
  } catch (error) {
    // 隐私模式等场景下 localStorage 可能直接抛错
    console.warn("[reading] 读取阅读位置失败", error);
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ReadingPosition> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.path !== "string" || !parsed.path) return null;
    if (typeof parsed.anchor !== "string") return null;
    if (typeof parsed.offset !== "number" || !Number.isFinite(parsed.offset))
      return null;

    return {
      path: parsed.path,
      title: typeof parsed.title === "string" ? parsed.title : "",
      anchor: parsed.anchor,
      offset: parsed.offset,
      docHeight:
        typeof parsed.docHeight === "number" &&
        Number.isFinite(parsed.docHeight)
          ? parsed.docHeight
          : 0,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch (error) {
    // 内容损坏：按"无记录"处理，并清掉脏数据
    console.warn("[reading] 阅读位置内容损坏，已忽略", error);
    clearSaved();
    return null;
  }
}

/**
 * 写入阅读位置。
 * 续读是增强功能，写入失败（配额用尽等）只告警、不向上抛。
 */
export function writeSaved(pos: ReadingPosition): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(pos));
  } catch (error) {
    console.warn("[reading] 保存阅读位置失败", error);
  }
}

/** 清除记录（目标页已不存在时使用） */
export function clearSaved(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(READING_STORAGE_KEY);
  } catch (error) {
    console.warn("[reading] 清除阅读位置失败", error);
  }
}
