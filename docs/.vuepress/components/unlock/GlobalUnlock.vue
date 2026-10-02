<template>
  <div v-if="isClientReady && isLockedPage && !isUnlocked">
    <Teleport v-if="teleportTargetSelector" :to="teleportTargetSelector">
      <div class="read-more-anchor">
        <div class="read-more-mask" />
        <button class="read-more-btn" @click="showDialog = true">
          阅读全文
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <transition name="unlock-fade">
        <div
          v-if="showDialog"
          class="unlock-modal-mask"
          @click.self="showDialog = false"
        >
          <div class="unlock-modal">
            <div class="unlock-modal-header">
              <h3 class="lock-title">人机验证</h3>
              <button class="close-btn" @click="showDialog = false">×</button>
            </div>

            <p class="lock-reason">
              为保障正常阅读体验，本站部分内容已开启一次性验证。验证后全站解锁。
            </p>

            <div class="qr-container">
              <img
                :src="config.qrCodeUrl"
                alt="公众号二维码"
                class="qr-image"
              />
              <p class="qr-tip">
                扫码/微信搜索关注
                <span class="highlight">“JavaGuide”</span>
              </p>
              <p class="qr-tip">回复 <span class="highlight">“验证码”</span></p>
            </div>

            <div class="input-wrapper">
              <input
                v-model="inputCode"
                type="text"
                placeholder="输入验证码"
                class="unlock-input"
                maxlength="4"
                @keyup.enter="handleUnlock"
              />
              <button class="unlock-btn" @click="handleUnlock">立即解锁</button>
            </div>

            <transition name="shake">
              <p v-if="showError" class="error-msg">验证码错误，请重试</p>
            </transition>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { usePageData } from "vuepress/client";
import {
  PREVIEW_HEIGHT,
  unlockConfig as config,
} from "../../features/unlock/config";

const STYLE_ID = "unlock-global-style";
const DATA_ATTR = "data-unlock-target";

const pageData = usePageData();
const isClientReady = ref(false);
const isUnlocked = ref(false);
const inputCode = ref("");
const showError = ref(false);
const showDialog = ref(false);
const hasAppliedLock = ref(false);
const teleportTargetSelector = ref<string | null>(null);
const globalUnlockKey = `javaguide_site_unlocked_${config.unlockVersion ?? "v1"}`;

const normalizePath = (path: string) =>
  path.replace(/\/$/, "").replace(".html", "").toLowerCase();

const isPathInPrefix = (currentPath: string, prefix: string) => {
  return currentPath === prefix || currentPath.startsWith(`${prefix}/`);
};

const isLockedPage = computed(() => {
  const currentPath = normalizePath(pageData.value.path);
  const byExactPath = Object.keys(config.protectedPaths)
    .map((p) => normalizePath(p))
    .includes(currentPath);
  if (byExactPath) return true;

  const prefixes = Object.keys(config.protectedPrefixes ?? {}).map((p) =>
    normalizePath(p),
  );
  return prefixes.some((prefix) => isPathInPrefix(currentPath, prefix));
});

const visibleHeight = computed(() => {
  const currentPath = normalizePath(pageData.value.path);
  const matchedPath = Object.keys(config.protectedPaths).find(
    (p) => normalizePath(p) === currentPath,
  );
  if (matchedPath) return config.protectedPaths[matchedPath];

  const matchedPrefix = Object.keys(config.protectedPrefixes ?? {}).find(
    (prefix) => isPathInPrefix(currentPath, normalizePath(prefix)),
  );
  if (matchedPrefix) return config.protectedPrefixes[matchedPrefix];

  return PREVIEW_HEIGHT.LONG;
});

const toPx = (value: string) => {
  const px = Number.parseInt(value, 10);
  return Number.isFinite(px) ? px : 1000;
};

const readUnlockState = () => {
  if (typeof window === "undefined") return;
  const persisted = localStorage.getItem(globalUnlockKey) === "true";
  isUnlocked.value = config.forceLock ? false : persisted;
};

const findContentEl = (): HTMLElement | null => {
  return (
    document.getElementById("markdown-content") ??
    (document.querySelector(".vp-page-content") as HTMLElement | null) ??
    (document.querySelector(".theme-hope-content") as HTMLElement | null)
  );
};

const ensureStyleEl = () => {
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  return styleEl;
};

const buildLockCSS = (height: string) => `
  [${DATA_ATTR}="true"] {
    max-height: ${height} !important;
    overflow: hidden !important;
    position: relative !important;
  }
`;

const clearLockStyle = () => {
  teleportTargetSelector.value = null;
  if (!hasAppliedLock.value) return;

  document.querySelectorAll(`[${DATA_ATTR}]`).forEach((el) => {
    el.removeAttribute(DATA_ATTR);
  });
  document.getElementById(STYLE_ID)?.remove();
  hasAppliedLock.value = false;
};

const applyLockStyle = async () => {
  if (typeof document === "undefined" || !isClientReady.value) return;

  if (!isLockedPage.value || isUnlocked.value) {
    clearLockStyle();
    return;
  }

  clearLockStyle();

  await nextTick();
  const contentEl = findContentEl();
  if (!contentEl) {
    clearLockStyle();
    return;
  }

  // 路由切换期间节点可能已卸载，避免 hydration 阶段异常
  if (!document.contains(contentEl)) {
    clearLockStyle();
    return;
  }

  // 内容不够长时不加锁、不展示按钮
  if (contentEl.scrollHeight <= toPx(visibleHeight.value)) {
    clearLockStyle();
    return;
  }

  const styleEl = ensureStyleEl();
  contentEl.setAttribute(DATA_ATTR, "true");
  styleEl.innerHTML = buildLockCSS(visibleHeight.value);
  hasAppliedLock.value = true;
  if (!contentEl.id) {
    contentEl.id = "unlock-content-root";
  }
  teleportTargetSelector.value = `#${contentEl.id}`;
};

const handleUnlock = () => {
  if (inputCode.value === config.code) {
    isUnlocked.value = true;
    localStorage.setItem(globalUnlockKey, "true");
    showDialog.value = false;
    showError.value = false;
    applyLockStyle();
    return;
  }

  showError.value = true;
  inputCode.value = "";
  setTimeout(() => {
    showError.value = false;
  }, 1800);
};

onMounted(() => {
  isClientReady.value = true;
  if (!isLockedPage.value) return;

  readUnlockState();
  nextTick(() => {
    applyLockStyle();
    // 再补一帧，等主题异步渲染完成
    requestAnimationFrame(() => applyLockStyle());
    setTimeout(applyLockStyle, 300);
  });
});

watch(
  () => pageData.value.path,
  async () => {
    if (!isClientReady.value) return;

    if (!isLockedPage.value) {
      showDialog.value = false;
      clearLockStyle();
      return;
    }

    readUnlockState();
    showDialog.value = false;
    await applyLockStyle();
    setTimeout(applyLockStyle, 300);
  },
);
</script>

<style>
.read-more-anchor {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 190px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 24px;
  /* z-index: 10 —— 组件内部相对层级（遮罩相对按钮的层叠关系），非全局尺度，有意保留裸值 */
  z-index: 10;
  pointer-events: none;
}

.read-more-mask {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent, var(--vp-c-bg) 72%);
  pointer-events: none;
}

.read-more-btn {
  position: relative;
  /* z-index: 11 —— 组件内部相对层级（按钮高于同组遮罩），非全局尺度，有意保留裸值 */
  z-index: 11;
  pointer-events: auto;
  min-width: 132px;
  padding: 0.56rem 1.35rem;
  border: 1px solid var(--jg-c-brand-border);
  border-radius: var(--jg-radius-pill);
  background: var(--vp-c-bg-elv);
  color: var(--jg-c-brand);
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--jg-shadow-brand);
  /* 只过渡真实变化的属性：hover 改 transform / box-shadow。
     写 all 会让浏览器监听全部属性（含触发布局的），与 L0 收敛方向相悖。 */
  transition:
    transform var(--jg-dur-md) var(--jg-ease-standard),
    box-shadow var(--jg-dur-md) var(--jg-ease-standard);
}

.read-more-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--jg-shadow-brand-hover);
}

.unlock-modal-mask {
  position: fixed;
  inset: 0;
  z-index: var(--jg-z-lightbox);
  background: var(--jg-c-scrim);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.unlock-modal {
  width: min(92vw, 500px);
  padding: 1.2rem;
  border-radius: var(--jg-radius-xl);
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-elv);
  box-shadow: var(--jg-shadow-lg);
  text-align: center;
}

.unlock-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 0.75rem;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--jg-radius-pill);
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text);
  font-size: 18px;
  line-height: 28px;
  cursor: pointer;
  flex-shrink: 0;
}

.lock-title {
  margin: 0;
  font-size: var(--jg-fs-lg);
}

.lock-reason {
  margin: 0 0 1rem;
  color: var(--vp-c-text-mute);
  line-height: var(--jg-lh-normal);
  font-size: var(--jg-fs-sm);
}

.qr-container {
  margin: 0 auto 1rem;
  padding: 0.8rem;
  max-width: 300px;
  border: 1px dashed var(--jg-c-brand);
  border-radius: var(--jg-radius-lg);
  background: var(--vp-c-bg-alt);
}

.qr-image {
  width: 180px;
  height: 180px;
}

.qr-tip {
  margin: 0.45rem 0 0;
  font-size: var(--jg-fs-base);
}

.highlight {
  color: var(--jg-c-brand);
  font-weight: 700;
}

.input-wrapper {
  display: flex;
  justify-content: center;
  gap: 0.55rem;
}

.unlock-input {
  width: 125px;
  padding: 0.5rem 0.75rem;
  border-radius: var(--jg-radius-md);
  border: 1px solid var(--vp-c-border);
  font-size: var(--jg-fs-base);
  text-align: center;
  outline: none;
}

.unlock-input:focus {
  border-color: var(--jg-c-brand);
}

.unlock-btn {
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: var(--jg-radius-md);
  background: var(--jg-c-brand);
  color: var(--jg-c-on-accent);
  font-weight: 700;
  cursor: pointer;
}

.error-msg {
  margin: 0.45rem 0 0;
  color: var(--vp-c-red-text);
  font-size: var(--jg-fs-sm);
}

.unlock-fade-enter-active,
.unlock-fade-leave-active {
  transition: opacity var(--jg-dur-md) var(--jg-ease-standard);
}

.unlock-fade-enter-from,
.unlock-fade-leave-to {
  opacity: 0;
}

.shake-enter-active {
  /* 关键帧收敛到全局 jg-shake（styles/index.scss），时长/曲线走「强调档」令牌。
     原为组件内自维护的 @keyframes shake（与 UnlockContent 的那份重复），已移至全局层共用。 */
  animation: jg-shake var(--jg-dur-emphasis) var(--jg-ease-decelerate) both;
}

@media (max-width: 576px) {
  .input-wrapper {
    flex-direction: column;
    align-items: center;
  }

  .unlock-input,
  .unlock-btn {
    width: min(220px, 80vw);
  }
}
</style>
