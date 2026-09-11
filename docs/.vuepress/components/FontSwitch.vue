<template>
  <div ref="rootRef" class="font-switch">
    <button
      class="font-switch-btn"
      type="button"
      :aria-expanded="open"
      aria-haspopup="listbox"
      title="切换字体"
      @click="open = !open"
    >
      <svg
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
        <path d="M4 20 10 4h1.5L17.5 20" />
        <path d="M6.2 14h8.9" />
        <path d="M19 17.5c.8.8 1.8 1 2.6.6" />
      </svg>
      <span class="font-switch-label">{{ currentOption.label }}</span>
    </button>

    <!--
      不用 <Transition>：其推进依赖 requestAnimationFrame，
      在后台标签页/无头环境中 rAF 可能被节流导致面板卡在透明状态。
      改用 CSS animation，动画被节流时面板仍保持自然可见。
    -->
    <div v-if="open" class="font-switch-panel" role="listbox">
      <div class="font-switch-title">阅读字体</div>
      <button
        v-for="option in FONT_OPTIONS"
        :key="option.key"
        class="font-option"
        :class="{ active: option.key === currentKey }"
        type="button"
        role="option"
        :aria-selected="option.key === currentKey"
        :style="{ fontFamily: option.base }"
        @click="select(option)"
      >
        <span class="font-option-text">
          <span class="font-option-name">{{ option.label }}</span>
          <span class="font-option-preview">永和九年 Aa 123</span>
        </span>
        <svg
          v-if="option.key === currentKey"
          class="font-option-check"
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m4.5 12.5 5 5 10-11" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import {
  DEFAULT_FONT_KEY,
  FONT_OPTIONS,
  FONT_STORAGE_KEY,
  getFontOption,
  type FontOption,
  type FontStylesheet,
} from "./fontOptions";

const rootRef = ref<HTMLElement | null>(null);
const open = ref(false);
const currentKey = ref(DEFAULT_FONT_KEY);

const currentOption = computed(
  () => getFontOption(currentKey.value) ?? FONT_OPTIONS[0],
);

// 已成功注入（或已尝试注入）的样式表地址，避免重复加载
const loadedSheets = new Set<string>();

/**
 * 注入单个 webfont 样式表，首选 CDN 失败时回退到 npmmirror
 */
const loadSheet = ({ primary, fallback }: FontStylesheet): void => {
  if (loadedSheets.has(primary)) return;
  loadedSheets.add(primary);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = primary;
  link.onerror = () => {
    link.remove();
    loadedSheets.delete(primary);
    if (fallback && !loadedSheets.has(fallback)) {
      loadedSheets.add(fallback);
      const fallbackLink = document.createElement("link");
      fallbackLink.rel = "stylesheet";
      fallbackLink.href = fallback;
      document.head.appendChild(fallbackLink);
    }
  };
  document.head.appendChild(link);
};

/**
 * 将预设应用到文档根元素：
 * 通过内联 CSS 变量覆盖调色板默认值（内联优先级高于 :root 声明）
 */
const applyFont = (option: FontOption): void => {
  const root = document.documentElement;
  root.style.setProperty("--vp-font", option.base);
  root.style.setProperty("--vp-font-heading", option.heading);
  root.dataset.fontPreset = option.key;
  option.cssSheets?.forEach(loadSheet);
};

const select = (option: FontOption): void => {
  currentKey.value = option.key;
  open.value = false;
  localStorage.setItem(FONT_STORAGE_KEY, option.key);
  applyFont(option);
};

const onDocumentClick = (event: MouseEvent): void => {
  if (
    open.value &&
    rootRef.value &&
    !rootRef.value.contains(event.target as Node)
  ) {
    open.value = false;
  }
};

const onKeydown = (event: KeyboardEvent): void => {
  if (open.value && event.key === "Escape") {
    open.value = false;
  }
};

onMounted(() => {
  const saved = localStorage.getItem(FONT_STORAGE_KEY);
  const option = saved ? getFontOption(saved) : undefined;
  currentKey.value = option ? option.key : DEFAULT_FONT_KEY;
  // 注意：currentOption 是 computed ref，必须通过 .value 访问，
  // 直接调用会抛 TypeError 并中断后续初始化
  applyFont(currentOption.value);

  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<style lang="scss" scoped>
.font-switch {
  position: relative;
  display: inline-flex;
}

.font-switch-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  padding: 0 0.5rem;
  color: var(--vp-c-text);
  background: transparent;
  border: none;
  font-size: 0.8rem;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: var(--vp-c-accent);
  }

  svg {
    flex-shrink: 0;
  }
}

.font-switch-label {
  max-width: 5.5em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-switch-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 200;
  min-width: 210px;
  // 选项较多时限高滚动，避免小屏幕下面板溢出视口
  max-height: min(60vh, 26rem);
  overflow-y: auto;
  padding: 0.5rem;
  background: var(--vp-c-bg-elv, var(--vp-c-bg));
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  // 轻量淡入上浮动画；rAF 被节流时动画不播放，面板保持自然可见
  animation: font-pop-in 0.18s ease;
}

@keyframes font-pop-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.font-switch-title {
  padding: 0.25rem 0.6rem 0.45rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-mute);
  letter-spacing: 0.05em;
}

.font-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  padding: 0.45rem 0.6rem;
  color: var(--vp-c-text);
  background: transparent;
  border: none;
  border-radius: 7px;
  text-align: left;
  line-height: 1.3;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: var(--vp-c-bg-soft);
    color: var(--vp-c-accent);
  }

  &.active {
    color: var(--vp-c-accent);
  }
}

.font-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.font-option-name {
  font-size: 0.85rem;
  font-weight: 600;
}

.font-option-preview {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--vp-c-text-mute);
  white-space: nowrap;
}

.font-option-check {
  flex-shrink: 0;
}

// 窄屏下按钮只留图标，避免挤占导航栏
@media (max-width: 719px) {
  .font-switch-label {
    display: none;
  }
}
</style>
