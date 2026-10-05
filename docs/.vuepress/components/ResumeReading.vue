<template>
  <div v-if="visible" class="resume-reading">
    <button
      class="resume-reading-btn"
      type="button"
      :title="fullLabel"
      @click="restore"
    >
      <svg
        class="resume-reading-icon"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
      </svg>
      <span class="resume-reading-text">{{ label }}</span>
    </button>
    <button
      class="resume-reading-close"
      type="button"
      title="本次会话不再提示"
      @click="dismiss"
    >
      ✕
    </button>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { usePageData, useRoute, useRouter } from "vuepress/client";

import {
  MIN_SAVE_OFFSET_PX,
  RECHECK_DELAY_MS,
  RESTORE_DEADLINE_MS,
  RESTORE_RETRY_MS,
  RESTORE_SETTLE_CHECKS,
  SAVE_THROTTLE_MS,
  capturePosition,
  clearSaved,
  expectedScrollY,
  readSaved,
  writeSaved,
  type ReadingPosition,
} from "./readingPosition";

const route = useRoute();
const router = useRouter();
const pageData = usePageData();

/** 当前是否展示入口胶囊 */
const visible = ref(false);
/** 读到的上次阅读位置（点击入口时作为目标） */
const saved = ref<ReadingPosition | null>(null);
/** 本次会话已被用户手动关闭：不再提示 */
const dismissed = ref(false);

/** 恢复流程是否进行中（期间不写存储、不重算可见性，避免自己打断自己） */
let restoring = false;
/** 本次恢复是否已被放弃（用户主动滚动输入） */
let restoreReleased = false;
/** 本次会话刚恢复过的页面：不再为它弹提示 */
let resumedPath: string | null = null;

/* ---------------------------------------------------------------- */
/* 入口文案                                                          */
/* ---------------------------------------------------------------- */

const displayTitle = computed(
  () => saved.value?.title || saved.value?.path || "",
);
const label = computed(() => `继续上次阅读：${displayTitle.value}`);
const fullLabel = computed(() => `继续上次阅读：${saved.value?.title ?? ""}`);

/* ---------------------------------------------------------------- */
/* 保存：滚动节流 + 页面隐藏/离开时补一次                             */
/* ---------------------------------------------------------------- */

let saveTimer: number | null = null;

/** 把当前阅读位置写入存储（距页顶过近则跳过） */
function saveCurrent(): void {
  if (restoring) return;
  if (window.scrollY < MIN_SAVE_OFFSET_PX) return;
  writeSaved(capturePosition(route.path, pageData.value.title ?? ""));
}

function onScroll(): void {
  if (restoring) return;
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveCurrent();
  }, SAVE_THROTTLE_MS);
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") saveCurrent();
}

/* ---------------------------------------------------------------- */
/* 恢复编排：定位 → 内容未铺开则重试 → 用户输入/超时/离开页面即停      */
/* ---------------------------------------------------------------- */

/** 视为"用户主动滚动"的输入事件：命中即放弃本次恢复，避免与用户意图冲突 */
const USER_SCROLL_EVENTS: readonly string[] = [
  "wheel",
  "touchmove",
  "keydown",
  "pointerdown",
  "mousedown",
];

const releaseRestore = (): void => {
  restoreReleased = true;
};

function bindUserInput(): void {
  USER_SCROLL_EVENTS.forEach((name) =>
    window.addEventListener(name, releaseRestore, { passive: true }),
  );
}

function unbindUserInput(): void {
  USER_SCROLL_EVENTS.forEach((name) =>
    window.removeEventListener(name, releaseRestore),
  );
}

/**
 * 应用定位并重试：
 * 每次尝试都重新计算目标位置——内容（图片/Mermaid/高亮）逐步撑开后，
 * 锚点的绝对高度会变，必须按最新布局重算，否则会停在一个过时的坐标上。
 *
 * @param pos        目标阅读位置
 * @param originPath 本次恢复的出发页路径。运行期间若路由既不是出发页、
 *                   也不是目标页，说明用户中途点去了别处，立即放弃。
 */
function applyWithRetry(
  pos: ReadingPosition,
  originPath: string,
): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + RESTORE_DEADLINE_MS;
    /** 上一轮算出的目标坐标，用于判断是否收敛 */
    let lastTarget: number | null = null;
    /** 目标坐标已连续稳定的轮数 */
    let stableCount = 0;

    const step = (): void => {
      if (restoreReleased) return resolve();
      // 用户已导航到别处（含恢复过程中途点走），不再干预。
      // 同时放行出发页与目标页：router.push 后 route.path 的更新时机
      // 与 await 的先后并不严格保证，只认目标页会把恢复静默跳过。
      if (route.path !== originPath && route.path !== pos.path)
        return resolve();

      const target = expectedScrollY(pos);
      // 锚点已不存在：页面结构变了，不再强行恢复
      if (target === null) return resolve();

      // 仅在确实偏离目标时才写滚动：每轮无条件滚会带来无谓的抖动
      if (Math.abs(window.scrollY - target) > 1) {
        // 必须显式 instant：全局 html{scroll-behavior:smooth} 会让恢复被动画化，
        // 并与主题的哈希滚动相互竞争
        window.scrollTo({
          top: Math.max(target, 0),
          left: 0,
          behavior: "instant",
        });
      }

      // 收敛判定：目标坐标连续 RESTORE_SETTLE_CHECKS 轮不变，才认为
      // 上方懒加载内容已铺开。只看 docHeight 会过早收手（见常量注释）。
      stableCount = target === lastTarget ? stableCount + 1 : 0;
      lastTarget = target;

      const settled =
        document.documentElement.scrollHeight >= pos.docHeight &&
        stableCount >= RESTORE_SETTLE_CHECKS;
      if (settled || Date.now() >= deadline) return resolve();

      window.setTimeout(step, RESTORE_RETRY_MS);
    };

    step();
  });
}

async function restore(): Promise<void> {
  const pos = saved.value;
  if (!pos) return;

  /** 出发页：跨页恢复时用于区分"用户中途导航走了"与"已抵达目标页" */
  const originPath = route.path;

  visible.value = false;
  restoring = true;
  restoreReleased = false;
  bindUserInput();

  try {
    if (route.path !== pos.path) {
      try {
        await router.push(pos.path);
      } catch (error) {
        // 目标页已删除/改名：清掉失效记录并如实提示
        console.warn("[reading] 打开上次阅读页面失败", error);
        clearSaved();
        saved.value = null;
        return;
      }
    }
    await nextTick();
    await applyWithRetry(pos, originPath);
  } finally {
    unbindUserInput();
    restoring = false;
  }

  // 已经回到原处，本次会话不再重复提示（也不再用 refresh 把它弹回来）
  resumedPath = pos.path;
}

/* ---------------------------------------------------------------- */
/* 可见性：路径不同则提示；同路径则仅在"明显不在原位"时提示             */
/* ---------------------------------------------------------------- */

function refresh(): void {
  if (restoring) return;

  saved.value = readSaved();
  const pos = saved.value;
  if (!pos || dismissed.value || pos.path === resumedPath) {
    visible.value = false;
    return;
  }

  if (pos.path !== route.path) {
    visible.value = true;
    return;
  }

  // 同一页：偏移太小没有可恢复内容；或浏览器已把滚动还原到记录位置附近，
  // 此时再提示是多余的
  if (pos.offset < MIN_SAVE_OFFSET_PX) {
    visible.value = false;
    return;
  }
  const atTop = window.scrollY < MIN_SAVE_OFFSET_PX;
  const target = expectedScrollY(pos);
  const alreadyThere =
    target !== null && Math.abs(window.scrollY - target) < MIN_SAVE_OFFSET_PX;
  visible.value = atTop && !alreadyThere;
}

function dismiss(): void {
  dismissed.value = true;
  visible.value = false;
}

/* ---------------------------------------------------------------- */
/* 生命周期                                                          */
/* ---------------------------------------------------------------- */

let recheckTimer: number | null = null;

onMounted(() => {
  refresh();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pagehide", saveCurrent);
  document.addEventListener("visibilitychange", onVisibilityChange);

  // 浏览器自身的滚动恢复可能晚于挂载：稍后再复检一次同页续读条件
  recheckTimer = window.setTimeout(() => {
    recheckTimer = null;
    refresh();
  }, RECHECK_DELAY_MS);
});

// SPA 内跳转：重新评估是否有可续读的位置（不自动恢复）
watch(() => route.path, refresh);

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("pagehide", saveCurrent);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  unbindUserInput();
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  if (recheckTimer !== null) window.clearTimeout(recheckTimer);
});
</script>

<style lang="scss" scoped>
.resume-reading {
  position: fixed;
  // 左下：站内已有的两个悬浮入口（沉浸阅读、编辑入口）都在右侧，避开它们
  left: 1.4rem;
  bottom: 4.2rem;
  z-index: var(--jg-z-entry);
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: min(60vw, 22rem);
  padding: 2px 2px 2px 0;
  color: var(--vp-c-text);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: var(--jg-radius-pill);
  box-shadow: var(--jg-shadow-sm);
  // 只过渡真实变化的属性，不写 all（L0 收敛方向）
  transition:
    border-color var(--jg-dur-lg) var(--jg-ease-standard),
    box-shadow var(--jg-dur-lg) var(--jg-ease-standard);

  &:hover {
    border-color: var(--vp-c-accent);
  }
}

.resume-reading-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  font-size: var(--jg-fs-sm);
  color: inherit;
  background: transparent;
  border: none;
  border-radius: var(--jg-radius-pill);
  cursor: pointer;
  transition: color var(--jg-dur-lg) var(--jg-ease-standard);

  &:hover {
    color: var(--vp-c-accent);
  }

  .resume-reading-icon {
    flex-shrink: 0;
  }

  .resume-reading-text {
    overflow: hidden;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.resume-reading-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: var(--jg-fs-xs);
  color: var(--vp-c-text-mute);
  background: transparent;
  border: none;
  border-radius: var(--jg-radius-pill);
  cursor: pointer;
  transition: color var(--jg-dur-lg) var(--jg-ease-standard);

  &:hover {
    color: var(--vp-c-accent);
  }
}

// 窄屏隐藏，避免遮挡正文（与沉浸阅读按钮的处置一致）
@media (max-width: 959px) {
  .resume-reading {
    display: none;
  }
}
</style>
