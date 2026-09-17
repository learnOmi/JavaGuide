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
import {
  editorState,
  showToast,
  titleToSlug,
  uploadImage,
} from "../docEditorState";

/**
 * CodeMirror 6 的 Markdown 编辑器封装。
 *
 * 设计要点：
 * - 受控组件：外部 modelValue 变化（如冲突后重载）同步进编辑器；
 *   编辑器内部变更通过 update:modelValue 抛出，二者以内容比对防回环；
 * - IME：CodeMirror 6 原生处理 composition 事件，中文输入不会误触发逻辑；
 * - Ctrl/Cmd+S：拦截浏览器默认保存，交由父组件立即保存；
 * - 图片粘贴（P3）：剪贴板含图片文件时拦截默认行为 → 上传 → 光标处插入引用。
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

/** 图片 MIME → 扩展名映射（服务端白名单子集；未知 MIME 回退文件名扩展名） */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** File → 纯 base64（剥离 data URL 前缀） */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const comma = dataUrl.indexOf(",");
      resolve(comma === -1 ? dataUrl : dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

/** 从文件名提取扩展名（小写，不含点）；无扩展名返回 null */
function extFromFilename(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

/**
 * 粘贴事件拦截：剪贴板含图片文件时上传并在光标处插入引用。
 * 以 capture 方式监听，先于 CodeMirror 内部处理生效。
 * 文件名在客户端先行规范化（MIME 推断扩展名 + 主干转 slug），
 * 服务端再做白名单兜底校验。
 */
async function handlePaste(event: ClipboardEvent): Promise<void> {
  const files = Array.from(event.clipboardData?.files ?? []);
  const image = files.find((file) => file.type.startsWith("image/"));
  if (!image) return;

  event.preventDefault();
  if (editorState.uploading) return;

  try {
    const base64 = await fileToBase64(image);
    const ext = MIME_TO_EXT[image.type] ?? extFromFilename(image.name) ?? "png";
    const stem = image.name
      ? titleToSlug(image.name.replace(/\.[^.]+$/, ""))
      : "paste-image";
    const result = await uploadImage({
      filename: `${stem === "page" ? "paste-image" : stem}.${ext}`,
      base64,
    });

    const view = editorView;
    if (!view) return;
    // 在光标处插入独立成行的引用，并移动光标到引用之后
    const head = view.state.selection.main.head;
    const insert = `\n${result.md}\n`;
    view.dispatch({
      changes: { from: head, to: head, insert },
      selection: { anchor: head + insert.length },
    });
    view.focus();
  } catch (err) {
    showToast(err instanceof Error ? err.message : "图片上传失败");
  }
}

onMounted(() => {
  if (!containerRef.value) return;

  containerRef.value.addEventListener("paste", handlePaste, true);

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
  containerRef.value?.removeEventListener("paste", handlePaste, true);
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
