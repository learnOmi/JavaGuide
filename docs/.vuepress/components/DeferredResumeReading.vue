<template>
  <ResumeReading v-if="shouldShow" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from "vue";

/**
 * 延迟挂载外壳：复用 DeferredLayoutToggle 的模式。
 * 续读入口只关心滚动位置与 localStorage，不属于首屏关键路径，
 * 等浏览器空闲后再异步加载真组件，避免把它的监听与逻辑压进首屏。
 */
const ResumeReading = defineAsyncComponent(() => import("./ResumeReading.vue"));
const shouldShow = ref(false);

onMounted(() => {
  const show = () => {
    shouldShow.value = true;
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(show, { timeout: 2000 });
    return;
  }

  window.setTimeout(show, 1200);
});
</script>
