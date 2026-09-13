<template>
  <div class="fm-form">
    <p v-if="syntaxError" class="fm-invalid" role="alert">
      frontmatter 存在语法错误，表单已停用。请切换到「正文」Tab
      修复后再编辑属性。
    </p>
    <p v-else-if="!hasFrontmatter" class="fm-hint">
      当前文档没有 frontmatter。编辑下方任意字段将自动创建。
    </p>

    <div v-for="field in FIELDS" :key="field.key" class="fm-row">
      <label :for="`fm-${field.key}`">{{ field.label }}</label>
      <input
        :id="`fm-${field.key}`"
        type="text"
        :value="fieldValue(field)"
        :placeholder="field.placeholder"
        :disabled="syntaxError || isComplex(field)"
        :title="
          isComplex(field)
            ? '该键为复杂结构（嵌套数组/对象），请在正文 Tab 中手工编辑'
            : undefined
        "
        :spellcheck="false"
        @input="onFieldInput(field, $event)"
      />
      <span v-if="isComplex(field)" class="fm-complex-mark">复杂结构</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  findFrontmatter,
  getFrontmatterValue,
  hasFrontmatterSyntaxError,
  updateFrontmatterKey,
} from "./frontmatterUtils";

/**
 * frontmatter 常用键的表单化编辑（受控视图）。
 *
 * 单一事实源是父组件的 rawContent（完整 Markdown 源文）：
 * - 读取：每次渲染从 rawContent 解析 frontmatter（只解析头部，开销可忽略）；
 * - 写入：经 updateFrontmatterKey 做按键级手术式补丁后整篇回传，
 *   复用 DocEditor 的脏状态/自动保存/草稿链路，正文逐字节不受影响。
 */

/** 表单字段类型：text 纯量 / list 逗号分隔列表 / number 数字 */
type FieldType = "text" | "list" | "number";

/** 表单字段定义（覆盖 JavaGuide/theme-hope 最常用键） */
interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder: string;
}

/** 字段清单（顺序即展示顺序） */
const FIELDS: readonly FieldDef[] = [
  { key: "title", label: "标题", type: "text", placeholder: "页面标题" },
  {
    key: "icon",
    label: "图标",
    type: "text",
    placeholder: "mdi:xxx（Material 图标名）",
  },
  { key: "date", label: "日期", type: "text", placeholder: "YYYY-MM-DD" },
  {
    key: "category",
    label: "分类",
    type: "list",
    placeholder: "逗号分隔，如：Java, 集合",
  },
  {
    key: "tag",
    label: "标签",
    type: "list",
    placeholder: "逗号分隔，如：基础, 面试",
  },
  {
    key: "order",
    label: "排序",
    type: "number",
    placeholder: "数字，越小越靠前",
  },
  {
    key: "sticky",
    label: "置顶权重",
    type: "number",
    placeholder: "数字越大越靠前，留空表示不置顶",
  },
  {
    key: "star",
    label: "星标",
    type: "number",
    placeholder: "数字越大越靠前，留空表示不加星",
  },
];

/** 复杂结构占位值：嵌套数组/对象等表单无法安全表达的前端标记 */
const COMPLEX_PLACEHOLDER = "（复杂结构，请到正文 Tab 手工编辑）";

const props = defineProps<{ rawContent: string }>();

const emit = defineEmits<{ "update:rawContent": [value: string] }>();

/** frontmatter 头部定位（含 yamlText 与围栏） */
const fmRange = computed(() => findFrontmatter(props.rawContent));

/** 是否已有 frontmatter */
const hasFrontmatter = computed(() => fmRange.value.startLine !== -1);

/** frontmatter YAML 是否语法非法（此时禁用表单防止破坏数据） */
const syntaxError = computed(() =>
  hasFrontmatterSyntaxError(fmRange.value.yamlText),
);

/** 判断键当前值是否为表单无法表达的复杂结构 */
function isComplex(field: FieldDef): boolean {
  const value = getFrontmatterValue(props.rawContent, field.key);
  if (value === undefined || value === null) return false;
  if (field.type === "list") {
    // 列表字段：字符串标量或纯字符串数组均可表达；嵌套数组/对象不可
    return !isListConvertible(value);
  }
  return typeof value !== "string" && typeof value !== "number";
}

/** list 字段可表达形态：字符串标量，或全部元素均为字符串的数组 */
function isListConvertible(value: unknown): value is string | string[] {
  if (typeof value === "string") return true;
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** 读取字段的文本表现（供 input value 绑定） */
function fieldValue(field: FieldDef): string {
  const value = getFrontmatterValue(props.rawContent, field.key);
  if (value === undefined || value === null) return "";
  if (field.type === "list") {
    if (isListConvertible(value)) {
      return Array.isArray(value) ? value.join(", ") : value;
    }
    return COMPLEX_PLACEHOLDER;
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return COMPLEX_PLACEHOLDER;
}

/**
 * 字段输入 → frontmatter 补丁。
 * 空值统一语义为"移除该键"；数字字段非法输入不回写。
 */
function onFieldInput(field: FieldDef, event: Event): void {
  if (syntaxError.value) return;
  const input = (event.target as HTMLInputElement).value.trim();
  let value: unknown;

  if (input === "") {
    value = undefined; // 清空 = 移除键，交还主题默认值
  } else if (field.type === "list") {
    value = input
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter((item) => item !== "");
  } else if (field.type === "number") {
    const parsed = Number(input);
    if (!Number.isFinite(parsed)) return; // 非法数字：不回写
    value = parsed;
  } else {
    value = input;
  }

  try {
    emit(
      "update:rawContent",
      updateFrontmatterKey(props.rawContent, field.key, value),
    );
  } catch {
    // 键名白名单等异常：静默忽略单次回写（键来自固定清单，理论不可达）
  }
}
</script>

<style lang="scss" scoped>
.fm-form {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  height: 100%;
  padding: 0.9rem 1rem;
  overflow-y: auto;
}

.fm-hint,
.fm-invalid {
  margin: 0;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  font-size: 0.78rem;
}

.fm-hint {
  background: var(--vp-c-info-bg, #eaf3ff);
  color: var(--vp-c-info-content, #246);
}

.fm-invalid {
  background: var(--vp-c-danger-bg, #fdecec);
  color: var(--vp-c-danger-content, #a33);
}

.fm-row {
  display: grid;
  grid-template-columns: 4.5rem 1fr auto;
  align-items: center;
  gap: 0.5rem;

  label {
    color: var(--vp-c-text-2);
    font-size: 0.8rem;
    text-align: right;
  }

  input {
    width: 100%;
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--vp-c-border);
    border-radius: 6px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-1);
    font-size: 0.82rem;

    &:focus {
      border-color: var(--vp-c-accent, var(--vp-c-brand));
      outline: none;
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  .fm-complex-mark {
    color: var(--vp-c-warning, #e2a600);
    font-size: 0.72rem;
    white-space: nowrap;
  }
}
</style>
