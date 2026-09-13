<template>
  <div class="del-overlay" @click.self="emit('close')">
    <div
      class="del-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="删除页面"
    >
      <header class="del-header">
        <h3>删除页面</h3>
        <button
          class="del-close"
          type="button"
          title="关闭"
          @click="emit('close')"
        >
          ✕
        </button>
      </header>

      <div class="del-body">
        <p class="del-file">
          <span class="del-fp">{{ state.activeFp }}</span>
        </p>
        <p class="del-warn">
          文件将移入回收站
          <code>docs/.vuepress/.edit-trash/&lt;时间戳&gt;/</code
          >（不会立刻销毁，可手工还原）。
          <strong>此操作仅限本地开发环境。</strong>
        </p>
        <label class="del-confirm" for="del-input">
          请输入文件名 <code>{{ basename }}</code> 以确认：
        </label>
        <input
          id="del-input"
          v-model="confirmText"
          type="text"
          :spellcheck="false"
          autocomplete="off"
          placeholder="输入上方文件名"
        />
      </div>

      <p v-if="deleteError" class="del-error" role="alert">{{ deleteError }}</p>

      <footer class="del-footer">
        <button type="button" @click="emit('close')">取消</button>
        <button
          type="button"
          class="del-danger"
          :disabled="!confirmMatched || deleting"
          @click="submit"
        >
          {{ deleting ? "删除中…" : "移入回收站" }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { editorState as state, deletePage, showToast } from "../docEditorState";

/**
 * 删除确认对话框（防误删）：
 * 输入当前文件 basename 匹配后才允许提交，服务端将文件移入回收站。
 */

const emit = defineEmits<{
  (e: "close"): void;
  /** 删除成功（文件已进回收站） */
  (e: "deleted", trashPath: string): void;
}>();

/** 当前文件 basename（确认依据） */
const basename = computed(() => {
  const fp = state.activeFp ?? "";
  const segments = fp.split("/");
  return segments[segments.length - 1] ?? "";
});

const confirmText = ref("");
const deleting = ref(false);
const deleteError = ref<string | null>(null);

/** 确认文本与文件名完全一致时才解锁删除按钮 */
const confirmMatched = computed(
  () => confirmText.value.trim() === basename.value && basename.value !== "",
);

/** 提交删除请求 */
async function submit(): Promise<void> {
  if (!confirmMatched.value || deleting.value || !state.activeFp) return;
  deleting.value = true;
  deleteError.value = null;
  try {
    const { trashPath } = await deletePage(state.activeFp);
    showToast(`已移入回收站：${trashPath}`);
    emit("deleted", trashPath);
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : String(err);
  } finally {
    deleting.value = false;
  }
}
</script>

<style lang="scss" scoped>
.del-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  animation: del-fade-in 0.18s ease;
}

@keyframes del-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.del-dialog {
  width: min(26rem, calc(100vw - 2rem));
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: var(--vp-c-bg-elv, var(--vp-c-bg));
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.22);
  animation: del-pop-in 0.2s ease;
}

@keyframes del-pop-in {
  from {
    transform: translateY(10px) scale(0.98);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

.del-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--vp-c-border);

  h3 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--vp-c-danger-content, #a33);
  }

  .del-close {
    border: none;
    background: transparent;
    color: var(--vp-c-text-3);
    cursor: pointer;

    &:hover {
      color: var(--vp-c-text-1);
    }
  }
}

.del-body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
}

.del-file {
  margin: 0;

  .del-fp {
    display: inline-block;
    padding: 0.25rem 0.55rem;
    border: 1px dashed var(--vp-c-border);
    border-radius: 6px;
    background: var(--vp-c-bg-soft, transparent);
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.8rem;
  }
}

.del-warn {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.78rem;

  code {
    padding: 0.05rem 0.3rem;
    border-radius: 4px;
    background: var(--vp-c-bg-soft, rgba(0, 0, 0, 0.06));
    font-size: 0.75rem;
  }
}

.del-confirm {
  color: var(--vp-c-text-2);
  font-size: 0.8rem;

  code {
    color: var(--vp-c-danger-content, #a33);
    font-weight: 600;
  }
}

.del-body input {
  width: 100%;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.82rem;

  &:focus {
    border-color: var(--vp-c-danger, #a33);
    outline: none;
  }
}

.del-error {
  margin: 0;
  padding: 0 1rem;
  color: var(--vp-c-danger-content, #a33);
  font-size: 0.78rem;
}

.del-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  border-top: 1px solid var(--vp-c-border);

  button {
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--vp-c-border);
    border-radius: 6px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-1);
    font-size: 0.8rem;
    cursor: pointer;

    &.del-danger {
      border-color: transparent;
      background: var(--vp-c-danger, #a33);
      color: #fff;

      &:hover:not(:disabled) {
        filter: brightness(1.1);
      }
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}
</style>
