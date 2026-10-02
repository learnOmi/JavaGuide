<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted } from "vue";
import { useRouter } from "vuepress/client";

/**
 * 正文章块的进场编排（L2 方案 A「克制版」）。
 *
 * 只对 `#markdown-content` 里的图片与表格做「进视野淡入 + 8px 上浮」，
 * 触发一次即取消观察（`unobserve`），长文无持续开销。
 *
 * 为什么排除代码块 / 文字段落 / 标题：
 * - 代码块高度大，上浮会造成明显的观感位移；
 * - 文字段落做动画会拖慢扫读（文档站核心场景是长文阅读）；
 * - 标题与主题 TOC 的滚动高亮语义重叠，重复动效会打架。
 *
 * 本组件无渲染输出（renderless），仅操作 DOM 类名；实际视觉由
 * `styles/index.scss` 的 `.reveal-on-scroll` / `.is-revealed` 定义。
 * 该样式只动 `transform` / `opacity`（合成层属性），不碰 `height/margin/padding`，
 * 以规避布局位移（CLS）；`prefers-reduced-motion` 由全局兜底规则覆盖。
 */

/** 参与编排的目标：仅正文图片与表格 */
const TARGET_SELECTOR = "#markdown-content img, #markdown-content table";

/** 初始态类名（透明 + 下移 8px），与 index.scss 中的定义必须一致 */
const REVEAL_CLASS = "reveal-on-scroll";

/** 揭示态类名（过渡到自然态） */
const REVEALED_CLASS = "is-revealed";

/** 系统「减弱动态效果」媒体查询 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * 提前触发的底边余量：元素上沿进入视口底部 10% 之前就开始揭示，
 * 避免用户已经看到元素才姗姗淡入。
 */
const ROOT_MARGIN_BOTTOM = "-10%";

/**
 * 观察区域「上边界」的外扩量。
 *
 * 为什么必须有它（实测踩过）：`IntersectionObserver` 只在**相交状态发生变化**时回调。
 * 元素若从「视口下方（不相交）」一次性跳到「视口上方（同样不相交）」——例如按
 * Ctrl+End、拖动滚动条直达底部、或锚点跳转——状态全程没变过，回调永不触发，
 * 元素就会永远停在初始的 `opacity: 0`，即**正文永久不可见**。
 * （实测：直达底部后 8 个表格全部卡在 opacity 0。）
 *
 * 把上边界外扩一个极大值后，「视口上方」也算相交，上述跳转就会产生
 * 「不相交 → 相交」的状态变化，被跨过去的元素因此能被兜住。
 *
 * 取 100000px 而非 Infinity：CSS 无法表达无穷。站点最长页面约 4 万 px，
 * 该值绰绰有余；即便某页极长导致超过此值，元素在用户回头上滚时仍会
 * 变成相交并被揭示——失败模式从「永久不可见」退化为「暂时未揭示」。
 */
const ROOT_MARGIN_TOP = "100000px";

/** 观察区域：上边界外扩（兜住被跨过的元素）+ 下边界内收（提前触发） */
const ROOT_MARGIN = `${ROOT_MARGIN_TOP} 0px ${ROOT_MARGIN_BOTTOM} 0px`;

const router = useRouter();

/** 观察器实例；为 null 表示本次未启用编排（降级路径） */
let observer: IntersectionObserver | null = null;

/** 路由钩子的注销函数 */
let stopAfterEach: (() => void) | null = null;

/** 揭示单个元素：加揭示态并停止观察（一次性） */
function reveal(target: Element): void {
  target.classList.add(REVEALED_CLASS);
  observer?.unobserve(target);
}

/**
 * 扫描并接管新出现的正文图片 / 表格。
 *
 * 关键细节：跳过「挂载时已在视口内」的元素。站点是 SSR 预渲染的，首屏内容
 * 在 JS 执行前就已可见；若此时再补上 `opacity: 0`，用户会看到
 * 「先看见 → 瞬间消失 → 再淡入」的闪烁。首屏元素本就在用户眼前，不做动画即可。
 * 视口外的元素被设为透明时用户看不见，因此不存在闪烁问题。
 */
function scan(): void {
  if (!observer) return;

  const viewportBottom = window.innerHeight;
  for (const target of document.querySelectorAll(TARGET_SELECTOR)) {
    if (target.classList.contains(REVEAL_CLASS)) continue;
    if (target.getBoundingClientRect().top < viewportBottom) continue;

    target.classList.add(REVEAL_CLASS);
    observer.observe(target);
  }
}

onMounted(() => {
  // 降级路径一：用户要求减弱动态效果 → 完全不介入，内容保持自然可见。
  // （全局 reduced-motion 规则已把 transition-duration 压到 0.01ms，这里再跳过
  //   一遍是为了避免「先隐藏再瞬间显示」的无意义闪烁。）
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return;

  // 降级路径二：环境不支持 IntersectionObserver → 不介入，
  // 否则元素会被加上初始态却永远等不到揭示，正文永久不可见。
  if (!("IntersectionObserver" in window)) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) reveal(entry.target);
      }
    },
    { rootMargin: ROOT_MARGIN, threshold: 0 },
  );

  scan();

  // 路由切换后正文整体替换，需重新扫描；等 DOM 更新完再扫
  stopAfterEach = router.afterEach(() => {
    void nextTick(scan);
  });
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  stopAfterEach?.();
  stopAfterEach = null;
});
</script>

<template>
  <!-- 无渲染输出：仅做 DOM 编排，视觉由全局样式承担 -->
</template>
