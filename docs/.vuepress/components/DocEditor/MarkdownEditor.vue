<template>
  <div ref="containerRef" class="markdown-editor" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

/**
 * CodeMirror 6 的 Markdown 编辑器封装。
 *
 * 设计要点：
 * - 受控组件：外部 modelValue 变化（如冲突后重载）同步进编辑器；
 *   编辑器内部变更通过 update:modelValue 抛出，二者以内容比对防回环；
 * - IME：CodeMirror 6 原生处理 composition 事件，中文输入不会误触发逻辑；
 * - Ctrl/Cmd+S：拦截浏览器默认保存，交由父组件立即保存。
 */
const props = defineProps<{
  /** 编辑器内容（完整 Markdown 源文） */
  modelValue: string;
}>();

const emit = defineEmits<{
  /** 内容变更（每次文档变更都会触发，父组件自行防抖） */
  (e: "update:modelValue", value: string): void;
  /** 用户按下 Ctrl/Cmd+S */
  (e: "save"): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);

/** CodeMirror 视图实例（挂载后创建，卸载前销毁） */
let editorView: EditorView | null = null;

onMounted(() => {
  if (!containerRef.value) return;

  editorView = new EditorView({
    parent: containerRef.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        markdown(),
        keymap.of([
          indentWithTab,
          {
            key: "Mod-s",
            run: () => {
              // 拦截浏览器"保存网页"，转为触发文档保存
              emit("save");
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          emit("update:modelValue", update.state.doc.toString());
        }),
      ],
    }),
  });
});

onBeforeUnmount(() => {
  editorView?.destroy();
  editorView = null;
});

// 外部内容变更（冲突后重载、草稿恢复）同步进编辑器；内容一致时跳过防回环
watch(
  () => props.modelValue,
  (value) => {
    if (!editorView) return;
    const current = editorView.state.doc.toString();
    if (current === value) return;
    editorView.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  },
);
</script>

<style lang="scss" scoped>
.markdown-editor {
  height: 100%;
  overflow: hidden;
  border-top: 1px solid var(--vp-c-border);

  // 让 CodeMirror 内部撑满容器（:deep 穿透 scoped 隔离）
  :deep(.cm-editor) {
    height: 100%;
  }

  :deep(.cm-scroller) {
    overflow: auto;
    // 中文正文混排：等宽字体优先，中文回退系统黑体
    font-family: ui-monospace, Consolas, "Courier New", "Microsoft YaHei",
      monospace;
    line-height: 1.7;
  }
}
</style>
