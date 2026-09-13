<template>
  <div class="np-overlay" @click.self="emit('close')">
    <div
      class="np-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="新建页面"
    >
      <!-- 第一步：填写目录 / 标题 / slug / 模板 -->
      <template v-if="!createdFp">
        <header class="np-header">
          <h3>新建页面</h3>
          <button
            class="np-close"
            type="button"
            title="关闭"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>

        <div class="np-body">
          <div class="np-row">
            <label for="np-dir">所在目录</label>
            <select id="np-dir" v-model="form.dir" :disabled="loadingDirs">
              <option value="">docs 根目录</option>
              <option
                v-for="opt in dirOptions"
                :key="opt.path"
                :value="opt.path"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>

          <div class="np-row">
            <label for="np-title">标题</label>
            <input
              id="np-title"
              v-model="form.title"
              type="text"
              placeholder="例如：HashMap 源码解析"
              :spellcheck="false"
            />
          </div>

          <div class="np-row">
            <label for="np-slug">文件名 slug</label>
            <input
              id="np-slug"
              v-model="form.slug"
              type="text"
              placeholder="小写字母/数字/连字符"
              :spellcheck="false"
              @input="slugTouched = true"
            />
          </div>
          <p v-if="slugInvalid" class="np-error">
            slug 仅允许小写字母、数字和连字符，且以字母或数字开头
          </p>

          <fieldset class="np-templates">
            <legend>页面模板</legend>
            <label
              v-for="tpl in TEMPLATE_OPTIONS"
              :key="tpl.key"
              class="np-template"
              :class="{ selected: form.template === tpl.key }"
            >
              <input
                type="radio"
                name="np-template"
                :value="tpl.key"
                v-model="form.template"
              />
              <span class="tpl-label">{{ tpl.label }}</span>
              <span class="tpl-desc">{{ tpl.description }}</span>
            </label>
          </fieldset>
        </div>

        <p v-if="createError" class="np-error np-error-body" role="alert">
          {{ createError }}
        </p>

        <footer class="np-footer">
          <button type="button" @click="emit('close')">取消</button>
          <button
            type="button"
            class="np-primary"
            :disabled="!canSubmit || creating"
            @click="submit"
          >
            {{ creating ? "创建中…" : "创建" }}
          </button>
        </footer>
      </template>

      <!-- 第二步：创建成功 → sidebar 挂载引导 -->
      <template v-else>
        <header class="np-header">
          <h3>页面已创建 ✓</h3>
          <button
            class="np-close"
            type="button"
            title="关闭"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>

        <div class="np-body">
          <p class="np-created-path">
            <span class="np-fp">{{ createdFp }}</span>
          </p>

          <div class="np-guide">
            <p class="np-guide-title">
              手动挂载到侧边栏（新建页不会自动出现在 sidebar 中）：
            </p>
            <ol class="np-guide-steps">
              <li>打开 <code>docs/.vuepress/sidebar/index.ts</code></li>
              <li v-if="sidebarFirstSegment === ''">
                找到根配置 <code>"/"</code>（新页位于 docs 根目录）
              </li>
              <li v-else>
                找到路径前缀 <code>"/{{ sidebarFirstSegment }}/"</code> 的配置
              </li>
              <li>把新页 slug 加入对应 <code>children</code> 数组</li>
            </ol>
            <pre class="np-snippet"><code>{{ sidebarSnippet }}</code></pre>
            <button type="button" class="np-copy" @click="copySnippet">
              {{ copied ? "已复制 ✓" : "复制配置片段" }}
            </button>
          </div>
        </div>

        <footer class="np-footer">
          <button type="button" @click="emit('close')">稍后手动打开</button>
          <button type="button" class="np-primary" @click="openCreatedPage">
            打开新页并开始编辑
          </button>
        </footer>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vuepress/client";
import {
  TEMPLATE_OPTIONS,
  createPage,
  fetchDirs,
  titleToSlug,
  type DirNode,
  type TemplateKey,
} from "../docEditorState";

/**
 * 新建页对话框（两步流程）：
 * 1. 目录（/dirs 树）+ 标题（自动转 slug）+ 模板 → POST /page；
 * 2. 成功后展示 sidebar 挂载引导（一键复制配置片段），
 *    用户可选择立即跳转新页继续编辑。
 */

const emit = defineEmits<{
  (e: "close"): void;
  /** 创建成功，携带新文件相对路径（pageData.filePathRelative 形态） */
  (e: "created", fp: string): void;
}>();

const router = useRouter();

/** 目录树扁平化后的选项（缩进体现层级） */
const dirOptions = ref<{ path: string; label: string }[]>([]);
const loadingDirs = ref(false);

/** 表单状态 */
const form = reactive({
  dir: "",
  title: "",
  slug: "",
  template: "article" as TemplateKey,
});

/** 用户是否手动改过 slug（未改过时跟随标题自动生成） */
const slugTouched = ref(false);

const creating = ref(false);
const createError = ref<string | null>(null);

/** 创建成功后的新文件相对路径 */
const createdFp = ref<string | null>(null);

/** slug 是否非法（与服务端 SLUG_PATTERN 对齐的客户端预校验） */
const slugInvalid = computed(
  () => form.slug !== "" && !/^[a-z0-9][a-z0-9-]*$/.test(form.slug),
);

const canSubmit = computed(
  () => form.title.trim() !== "" && form.slug !== "" && !slugInvalid.value,
);

/** 标题输入联动 slug：用户手动改过 slug 后不再跟随 */
watch(
  () => form.title,
  () => {
    if (!slugTouched.value) form.slug = titleToSlug(form.title);
  },
);

/** 扁平化目录树：缩进标示层级 */
function flattenDirs(node: DirNode, depth: number): void {
  for (const child of node.children) {
    dirOptions.value.push({
      path: child.path,
      label: `${"— ".repeat(depth)}${child.name}`,
    });
    flattenDirs(child, depth + 1);
  }
}

onMounted(async () => {
  loadingDirs.value = true;
  try {
    const tree = await fetchDirs();
    flattenDirs(tree, 1);
  } catch {
    // 目录加载失败不阻塞对话框：仍可在根目录创建
    dirOptions.value = [];
  } finally {
    loadingDirs.value = false;
  }
});

/** 提交创建请求 */
async function submit(): Promise<void> {
  if (!canSubmit.value || creating.value) return;
  creating.value = true;
  createError.value = null;
  try {
    const { fp } = await createPage({
      dir: form.dir,
      slug: form.slug,
      title: form.title.trim(),
      template: form.template,
    });
    createdFp.value = fp;
    emit("created", fp);
  } catch (err) {
    createError.value = err instanceof Error ? err.message : String(err);
  } finally {
    creating.value = false;
  }
}

/* ---------- 第二步：sidebar 挂载引导 ---------- */

/** 新页所属顶层目录段（根目录页面无目录段时返回空字符串） */
const sidebarFirstSegment = computed(() => {
  if (createdFp.value === null) return "";
  const parts = createdFp.value.split("/");
  return parts.length > 1 ? (parts[0] ?? "") : "";
});

/** 可复制的 sidebar 配置片段 */
const sidebarSnippet = computed(() => {
  const slug = form.slug;
  const title = form.title.trim();
  const lines: string[] = [];
  if (form.dir === "") {
    lines.push(`// 根配置 "/" 的 children 中追加：`);
    lines.push(`"${slug}",  // ${title}`);
  } else {
    lines.push(
      `// 路径键 "/${sidebarFirstSegment.value}/" 对应分组中的 children 追加：`,
    );
    lines.push(`"${slug}",  // ${title}`);
    lines.push("");
    lines.push(
      `// 若子目录 "/${form.dir}/" 尚未在 sidebar 中出现，可新增分组：`,
    );
    lines.push("{");
    lines.push(`  text: "${title}",`);
    lines.push(`  prefix: "${form.dir}/",`);
    lines.push(`  children: ["${slug}"],`);
    lines.push("},");
  }
  return lines.join("\n");
});

/** 复制反馈状态（2 秒后复原） */
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

/** 复制配置片段到剪贴板（clipboard API 失败时降级 execCommand） */
async function copySnippet(): Promise<void> {
  const text = sidebarSnippet.value;
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    textarea.remove();
  }
  if (ok) {
    copied.value = true;
    if (copiedTimer !== null) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, 2000);
  }
}

/** 跳转到新页（编辑抽屉保持打开，DocEditor 的路由监听会加载新文件） */
async function openCreatedPage(): Promise<void> {
  if (createdFp.value === null) return;
  await router.push(`/${createdFp.value.replace(/\.md$/, ".html")}`);
  emit("close");
}
</script>

<style lang="scss" scoped>
.np-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  animation: np-fade-in 0.18s ease;
}

@keyframes np-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.np-dialog {
  display: flex;
  flex-direction: column;
  width: min(30rem, calc(100vw - 2rem));
  max-height: calc(100vh - 4rem);
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: var(--vp-c-bg-elv, var(--vp-c-bg));
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.22);
  animation: np-pop-in 0.2s ease;
}

@keyframes np-pop-in {
  from {
    transform: translateY(10px) scale(0.98);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

.np-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--vp-c-border);

  h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .np-close {
    border: none;
    background: transparent;
    color: var(--vp-c-text-3);
    font-size: 0.9rem;
    cursor: pointer;

    &:hover {
      color: var(--vp-c-text-1);
    }
  }
}

.np-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  overflow-y: auto;
}

.np-row {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  align-items: center;
  gap: 0.5rem;

  label {
    color: var(--vp-c-text-2);
    font-size: 0.8rem;
    text-align: right;
  }

  input,
  select {
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
  }
}

.np-templates {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;

  legend {
    padding: 0 0.3rem;
    color: var(--vp-c-text-2);
    font-size: 0.78rem;
  }

  .np-template {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: 0.45rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;

    &:hover {
      background: var(--vp-c-bg-soft, transparent);
    }

    &.selected {
      border-color: var(--vp-c-accent, var(--vp-c-brand));
      background: var(--vp-c-bg-soft, transparent);
    }

    input {
      margin: 0;
      accent-color: var(--vp-c-accent, var(--vp-c-brand));
    }

    .tpl-label {
      font-size: 0.82rem;
      font-weight: 600;
    }

    .tpl-desc {
      color: var(--vp-c-text-3);
      font-size: 0.75rem;
    }
  }
}

.np-created-path {
  margin: 0;
  font-size: 0.85rem;

  .np-fp {
    display: inline-block;
    padding: 0.25rem 0.55rem;
    border: 1px dashed var(--vp-c-border);
    border-radius: 6px;
    background: var(--vp-c-bg-soft, transparent);
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.8rem;
  }
}

.np-guide {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  .np-guide-title {
    margin: 0;
    color: var(--vp-c-text-2);
    font-size: 0.8rem;
  }

  .np-guide-steps {
    margin: 0;
    padding-left: 1.2rem;
    color: var(--vp-c-text-2);
    font-size: 0.78rem;

    code {
      padding: 0.05rem 0.3rem;
      border-radius: 4px;
      background: var(--vp-c-bg-soft, rgba(0, 0, 0, 0.06));
      font-size: 0.75rem;
    }
  }

  .np-snippet {
    margin: 0;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--vp-c-border);
    border-radius: 8px;
    background: var(--vp-c-bg-soft, rgba(0, 0, 0, 0.04));
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.75rem;
    line-height: 1.6;
    overflow-x: auto;
  }

  .np-copy {
    align-self: flex-start;
    padding: 0.25rem 0.7rem;
    border: 1px dashed var(--vp-c-border);
    border-radius: 6px;
    background: transparent;
    color: var(--vp-c-text-1);
    font-size: 0.78rem;
    cursor: pointer;
    transition: border-color 0.15s;

    &:hover {
      border-color: var(--vp-c-accent, var(--vp-c-brand));
    }
  }
}

.np-error {
  margin: 0;
  padding: 0.4rem 1rem;
  color: var(--vp-c-danger-content, #a33);
  font-size: 0.78rem;

  &.np-error-body {
    padding: 0 1rem;
  }
}

.np-footer {
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

    &.np-primary {
      border-color: transparent;
      background: var(--vp-c-accent, var(--vp-c-brand));
      color: var(--vp-c-white, #fff);

      &:hover:not(:disabled) {
        filter: brightness(1.08);
      }
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}
</style>
