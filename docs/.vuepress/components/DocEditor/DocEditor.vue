<template>
  <aside
    v-if="state.open"
    class="doc-editor"
    :class="{ 'is-full': isFull }"
    :style="{ width: isFull ? EDITOR_FULL_WIDTH : EDITOR_DRAWER_WIDTH }"
  >
    <!-- 头部：文件路径 + 脏状态 + 操作区 -->
    <header class="editor-header">
      <div class="editor-title">
        <span class="fp" :title="state.activeFp ?? ''">{{
          state.activeFp
        }}</span>
        <span v-if="state.dirty" class="dirty-dot" title="有未保存改动">●</span>
      </div>
      <div class="editor-actions">
        <label
          class="autosave-toggle"
          title="开启后编辑停止 0.8 秒自动写回源文件"
        >
          <input
            type="checkbox"
            :checked="state.autosaveOn"
            @change="onToggleAutosave"
          />
          自动保存
        </label>
        <button
          class="icon-btn"
          type="button"
          :title="isFull ? '退出全屏' : '全屏编辑'"
          @click="isFull = !isFull"
        >
          {{ isFull ? "⇲" : "⇱" }}
        </button>
        <button
          class="save-btn"
          type="button"
          :disabled="!state.dirty || state.saving || state.conflict"
          @click="manualSave"
        >
          保存
        </button>
        <button
          class="icon-btn"
          type="button"
          title="关闭（未保存内容保留在草稿中）"
          @click="close"
        >
          ✕
        </button>
      </div>
    </header>

    <!-- 提示条：冲突 > 错误 > 草稿恢复 -->
    <div v-if="state.conflict" class="banner banner-conflict" role="alert">
      <span>⚠ 文件已被外部修改（可能是其他标签页）</span>
      <span class="banner-actions">
        <button type="button" @click="overwrite">以我的为准覆盖</button>
        <button type="button" @click="reloadFromServer">重新加载</button>
      </span>
    </div>
    <div
      v-else-if="state.loadError || state.saveError"
      class="banner banner-error"
      role="alert"
    >
      <span>{{ state.loadError || state.saveError }}</span>
      <button v-if="state.loadError" type="button" @click="loadActiveFile">
        重试
      </button>
    </div>
    <div v-else-if="state.draftRestored" class="banner banner-info">
      <span>已从会话草稿恢复未保存内容</span>
      <button type="button" @click="state.draftRestored = false">知道了</button>
    </div>

    <!-- 编辑主体：CodeMirror -->
    <main class="editor-body">
      <MarkdownEditor
        :model-value="state.rawContent"
        @update:model-value="onContentChange"
        @save="manualSave"
      />
    </main>

    <!-- 状态栏 -->
    <footer class="editor-status">
      <span v-if="state.saving">保存中…</span>
      <span v-else-if="state.lastSavedAt">
        已保存 {{ formatTime(state.lastSavedAt) }}
      </span>
      <span v-else-if="state.autosaveOn">自动保存已开启</span>
      <span v-else>手动模式：Ctrl+S 保存</span>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePageData } from "vuepress/client";
import MarkdownEditor from "./MarkdownEditor.vue";
import {
  AUTOSAVE_DEBOUNCE_MS,
  EDITOR_DRAWER_WIDTH,
  EDITOR_FULL_WIDTH,
  ApiError,
  clearDraft,
  editorState as state,
  fetchFile,
  readDraft,
  saveFile,
  setAutosavePreference,
  writeDraft,
} from "../docEditorState";

/** 是否全屏编辑（默认 45% 宽，左页右编辑） */
const isFull = ref(false);

/** 防抖定时器句柄（自动保存） */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** 保存请求串行化标记：保存期间又有新保存请求时，结束后补一次 */
let pendingSave = false;

const pageData = usePageData();

/** 状态栏时间格式化 */
const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });

/** 清除防抖定时器 */
function clearAutosaveTimer(): void {
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

/** 加载当前文件（含会话草稿恢复），打开抽屉与冲突重载共用 */
async function loadActiveFile(): Promise<void> {
  const fp = state.activeFp;
  if (!fp) return;
  state.loadError = null;
  state.saveError = null;
  state.conflict = false;
  state.serverMtime = null;
  state.draftRestored = false;
  try {
    const { content, mtime } = await fetchFile(fp);
    const draft = readDraft(fp);
    // 草稿与服务端内容不一致时恢复草稿并标记脏状态
    const hasUnsavedDraft = draft !== null && draft !== content;
    state.rawContent = hasUnsavedDraft ? draft : content;
    state.baseMtime = mtime;
    state.dirty = hasUnsavedDraft;
    state.draftRestored = hasUnsavedDraft;
  } catch (err) {
    state.loadError = err instanceof Error ? err.message : String(err);
  }
}

/** 编辑器内容变更入口：标记脏状态、写会话草稿并安排防抖自动保存 */
function onContentChange(value: string): void {
  state.rawContent = value;
  state.dirty = true;
  state.saveError = null;
  // 会话草稿兜底：即使防抖保存前崩溃/关页，下次打开也能恢复
  if (state.activeFp) writeDraft(state.activeFp, value);
  if (state.conflict) return; // 冲突时冻结自动保存，等待用户决策
  clearAutosaveTimer();
  if (!state.autosaveOn || !state.open) return;
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void performSave(false);
  }, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * 执行保存（乐观锁）。
 * @param force true 时跳过 mtime 比对（用户选择"以我的为准覆盖"）
 */
async function performSave(force: boolean): Promise<void> {
  if (!state.activeFp || !state.dirty) return;
  if (state.saving) {
    pendingSave = true;
    return;
  }
  state.saving = true;
  state.saveError = null;
  const fp = state.activeFp;
  // 快照保存时刻内容：保存期间继续输入则保持 dirty 并续排自动保存
  const snapshot = state.rawContent;
  try {
    const { mtime } = await saveFile({
      fp,
      content: snapshot,
      baseMtime: force ? state.serverMtime : state.baseMtime,
      force,
    });
    if (state.rawContent === snapshot) {
      state.dirty = false;
      clearDraft(fp);
    }
    state.baseMtime = mtime;
    state.conflict = false;
    state.serverMtime = null;
    state.lastSavedAt = Date.now();
    if (state.rawContent !== snapshot && state.autosaveOn && state.open) {
      onContentChange(state.rawContent);
    }
  } catch (err) {
    if (err instanceof ApiError && err.conflict) {
      state.conflict = true;
      state.serverMtime = err.serverMtime;
    } else {
      state.saveError = err instanceof Error ? err.message : String(err);
    }
  } finally {
    state.saving = false;
    if (pendingSave) {
      pendingSave = false;
      void performSave(false);
    }
  }
}

/** 手动保存（Ctrl+S / 保存按钮）：立即写回 */
function manualSave(): void {
  clearAutosaveTimer();
  void performSave(false);
}

/** 冲突后选择覆盖服务端内容 */
function overwrite(): void {
  void performSave(true);
}

/** 冲突后选择放弃本地改动、重新加载服务端内容 */
function reloadFromServer(): void {
  if (
    state.dirty &&
    !window.confirm("将丢弃当前未保存的改动并重新加载服务端内容，确认？")
  ) {
    return;
  }
  clearAutosaveTimer();
  void loadActiveFile();
}

/** 关闭抽屉（脏内容保留在草稿与会话状态中） */
function close(): void {
  clearAutosaveTimer();
  state.open = false;
}

/** 自动保存开关切换 */
function onToggleAutosave(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked;
  setAutosavePreference(enabled);
}

/** 全局 Ctrl+S：编辑抽屉打开时拦截浏览器默认保存 */
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    if (!state.open) return;
    event.preventDefault();
    manualSave();
  }
}

/** 关闭/刷新页签前，若有未保存改动则给出浏览器确认 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
}

// 路由切换（左侧页面导航）时：冲刷未保存改动 → 加载新页内容
watch(
  () => pageData.value.filePathRelative,
  async (fp) => {
    if (!fp || !state.open || fp === state.activeFp) return;
    clearAutosaveTimer();
    if (state.dirty) await performSave(false);
    if (state.conflict) return; // 保存冲突时不切换内容，保留决策现场
    state.activeFp = fp;
    await loadActiveFile();
  },
);

onMounted(() => {
  document.addEventListener("keydown", onGlobalKeydown);
  window.addEventListener("beforeunload", onBeforeUnload);
});

onBeforeUnmount(() => {
  clearAutosaveTimer();
  document.removeEventListener("keydown", onGlobalKeydown);
  window.removeEventListener("beforeunload", onBeforeUnload);
});

/** 暴露打开方法：EditEntry 通过 ref 调用 */
defineExpose({
  open: async (fp: string) => {
    state.open = true;
    if (fp === state.activeFp) {
      // 同一文件重复打开：保留现场（首次无内容时补加载）
      if (state.baseMtime === null) await loadActiveFile();
      return;
    }
    state.activeFp = fp;
    await loadActiveFile();
  },
});
</script>

<style lang="scss" scoped>
.doc-editor {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 350;
  display: flex;
  flex-direction: column;
  max-width: 100vw;
  background: var(--vp-c-bg-elv, var(--vp-c-bg));
  border-left: 1px solid var(--vp-c-border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.14);
  // 入场动画：CSS animation 实现，rAF 节流环境下也能保证可见
  animation: drawer-slide-in 0.22s ease;

  @media (max-width: 719px) {
    // 小屏直接全屏，避免挤压阅读区
    width: 100vw !important;
  }
}

@keyframes drawer-slide-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--vp-c-border);
}

.editor-title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 0.4rem;

  .fp {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--vp-c-text-2);
    font-size: 0.82rem;
  }

  .dirty-dot {
    color: var(--vp-c-warning, #e2a600);
    font-size: 0.7rem;
  }
}

.editor-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
}

.autosave-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
  cursor: pointer;
  user-select: none;
}

.icon-btn,
.save-btn {
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background-color 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--vp-c-accent, var(--vp-c-brand));
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.save-btn {
  background: var(--vp-c-accent, var(--vp-c-brand));
  border-color: transparent;
  color: var(--vp-c-white, #fff);

  &:hover:not(:disabled) {
    filter: brightness(1.08);
  }
}

.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.9rem;
  font-size: 0.8rem;

  button {
    padding: 0.15rem 0.55rem;
    border: 1px solid currentColor;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font-size: 0.78rem;
    cursor: pointer;
  }

  &.banner-conflict {
    background: var(--vp-c-warning-bg, #fff7e6);
    color: var(--vp-c-warning-content, #8a6100);
  }

  &.banner-error {
    background: var(--vp-c-danger-bg, #fdecec);
    color: var(--vp-c-danger-content, #a33);
  }

  &.banner-info {
    background: var(--vp-c-info-bg, #eaf3ff);
    color: var(--vp-c-info-content, #246);
  }
}

.banner-actions {
  display: inline-flex;
  flex-shrink: 0;
  gap: 0.4rem;
}

.editor-body {
  flex: 1;
  min-height: 0;
}

.editor-status {
  padding: 0.35rem 0.9rem;
  border-top: 1px solid var(--vp-c-border);
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
}
</style>
