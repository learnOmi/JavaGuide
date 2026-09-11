<template>
  <!-- 仅在 dev 环境且存在对应源文件时渲染 -->
  <button
    v-if="state.healthOk"
    class="edit-entry"
    type="button"
    title="编辑本页（仅本地开发环境可用）"
    aria-label="编辑本页"
    @click="openEditor"
  >
    <svg
      class="pen-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
    >
      <!-- 铅笔图标（内联 SVG，避免引入图标库） -->
      <path
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
        fill="currentColor"
      />
    </svg>
  </button>

  <!-- 编辑抽屉：懒加载（CodeMirror 不进首屏 bundle），首次打开后保持挂载 -->
  <DocEditor v-if="everOpened" ref="editorRef" />
</template>

<script setup lang="ts">
import {
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import { usePageData } from "vuepress/client";
import {
  API_BASE,
  HEALTH_RETRY_MS,
  EDITOR_REF_POLL_INTERVAL_MS,
  EDITOR_REF_POLL_MAX_TIMES,
  editorState as state,
} from "./docEditorState";

/** 编辑抽屉懒加载：保证编辑相关依赖不进入站点首屏 */
const DocEditor = defineAsyncComponent(
  () => import("./DocEditor/DocEditor.vue"),
);

const pageData = usePageData();

/** 抽屉组件 ref（调用其暴露的 open 方法） */
const editorRef = ref<InstanceType<typeof DocEditor> | null>(null);

/** 是否打开过编辑器（首次打开后保持 DocEditor 挂载，支撑跨页冲刷） */
const everOpened = ref(false);

/** 探测定时器句柄（health 失败后周期重试） */
let healthTimer: ReturnType<typeof setInterval> | null = null;

/** 探测编辑 API 健康状态：成功则显示浮动按钮并停止重试 */
async function probeHealth(): Promise<void> {
  // API_BASE 仅 dev 注入（prod 为 null）：入口隐藏，不发探测请求
  if (API_BASE === null) {
    state.healthOk = false;
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { ok?: boolean };
    if (payload.ok !== true) throw new Error("unexpected payload");
    state.healthOk = true;
    if (healthTimer !== null) {
      clearInterval(healthTimer);
      healthTimer = null;
    }
  } catch {
    // prod 静态托管必然失败：保持隐藏，按周期低频重试即可
    state.healthOk = false;
  }
}

/** 点击浮动按钮：打开抽屉并加载当前页源文件 */
async function openEditor(): Promise<void> {
  const fp = pageData.value.filePathRelative;
  if (!fp) return;
  everOpened.value = true;
  // 异步组件首次加载存在延迟：轮询等待 ref 就绪后再调用 open
  for (
    let i = 0;
    i < EDITOR_REF_POLL_MAX_TIMES && editorRef.value === null;
    i += 1
  ) {
    await nextTick();
    await new Promise((resolve) =>
      setTimeout(resolve, EDITOR_REF_POLL_INTERVAL_MS),
    );
  }
  await editorRef.value?.open(fp);
}

onMounted(() => {
  if (API_BASE === null) {
    // prod：API 基础路径未注入，入口永久隐藏，不启动探测定时器
    state.healthOk = false;
    return;
  }
  void probeHealth();
  healthTimer = setInterval(() => void probeHealth(), HEALTH_RETRY_MS);
});

onBeforeUnmount(() => {
  if (healthTimer !== null) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
});
</script>

<style lang="scss" scoped>
.edit-entry {
  position: fixed;
  right: 1.4rem;
  bottom: 4.2rem;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  padding: 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 50%;
  background: var(--vp-c-bg-elv, var(--vp-c-bg));
  color: var(--vp-c-accent, var(--vp-c-brand));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;

  &:hover {
    border-color: var(--vp-c-accent, var(--vp-c-brand));
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0) scale(0.96);
  }

  .pen-icon {
    display: block;
  }
}
</style>
