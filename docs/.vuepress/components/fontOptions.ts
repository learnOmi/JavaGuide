/**
 * 字体切换器预设常量
 *
 * 每个预设描述如何覆盖 vuepress-theme-hope 的
 * `--vp-font`（正文）与 `--vp-font-heading`（标题）两个 CSS 变量。
 * 代码块字体 `--vp-font-mono` 不受切换影响。
 *
 * L3 起：字体栈文本的**唯一权威**在 `docs/.vuepress/styles/palette.scss`
 * （`$vp-font` / `$jg-font-*` 令牌）。本文件只保留"元数据 + 懒加载地址"，
 * 通过 fontStackVar() 引用令牌——原先 TS 的 SANS_STACK 与 SCSS 的 $vp-font
 * 逐字节重复，属同一份真相写了两遍，L3 已合并。
 */

/** localStorage 持久化键名 */
export const FONT_STORAGE_KEY = "javaguide-font-preset";

/** 默认预设键名（与 styles/palette.scss 注入的 $vp-font 默认栈保持一致） */
export const DEFAULT_FONT_KEY = "system";

/** 单个 webfont 样式表的 CDN 地址组：首选加载失败时自动回退 */
export interface FontStylesheet {
  /** 首选 CDN（jsDelivr） */
  primary: string;
  /** 回退 CDN（npmmirror，国内直连友好） */
  fallback: string;
}

/** 字体预设 */
export interface FontOption {
  /** 唯一键：用于持久化、选中态高亮，并推导对应的字体栈令牌 */
  key: string;
  /** 展示名称 */
  label: string;
  /** 可选：选中该预设时才懒加载的 webfont 样式表 */
  cssSheets?: FontStylesheet[];
}

/**
 * 由预设键推导对应的字体栈令牌引用。
 *
 * 令牌 `--jg-font-<key>` 在 styles/palette.scss 中声明，
 * 形如 `--jg-font-web-sans: "Noto Sans SC", system-ui, ...`。
 * 把它赋给 `--vp-font` 属于「自定义属性引用自定义属性」，
 * 浏览器会在计算 font-family 时链式解析到真实字体栈。
 */
export const fontStackVar = (key: string): string => `var(--jg-font-${key})`;

/**
 * 全部字体预设
 *
 * webfont 通过 CDN 懒加载（中文全量字体体积大，仅在用户选中时下载），
 * 未加载/加载失败时回退到本地系统字体。
 * 顺序：黑体 → 衬线 → 楷体 → 趣味（FontSwitch 面板按此顺序展示）。
 */
export const FONT_OPTIONS: FontOption[] = [
  {
    key: "system",
    label: "清爽黑体",
  },
  {
    key: "web-sans",
    label: "思源黑体",
    cssSheets: [
      {
        primary:
          "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5/400.css",
        fallback:
          "https://registry.npmmirror.com/@fontsource/noto-sans-sc/latest/files/400.css",
      },
      {
        primary:
          "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5/700.css",
        fallback:
          "https://registry.npmmirror.com/@fontsource/noto-sans-sc/latest/files/700.css",
      },
    ],
  },
  {
    // misans 包刻意声明了非标准 weight（Regular=330 / Bold=630，贴合其视觉字重）：
    // 正文 400 匹配到 Regular，标题 600+ 匹配到 Bold，均为真实字形、不触发伪加粗
    key: "misans",
    label: "MiSans",
    cssSheets: [
      {
        primary:
          "https://cdn.jsdelivr.net/npm/misans@4/lib/Normal/MiSans-Regular.min.css",
        fallback:
          "https://registry.npmmirror.com/misans/latest/files/lib/Normal/MiSans-Regular.min.css",
      },
      {
        primary:
          "https://cdn.jsdelivr.net/npm/misans@4/lib/Normal/MiSans-Bold.min.css",
        fallback:
          "https://registry.npmmirror.com/misans/latest/files/lib/Normal/MiSans-Bold.min.css",
      },
    ],
  },
  {
    // 历史默认衬线栈（Georgia + 苹方/雅黑），栈文本见 palette.scss 的 $jg-font-theme
    key: "theme",
    label: "主题衬线",
  },
  {
    key: "noto-serif",
    label: "思源宋体",
    cssSheets: [
      {
        primary:
          "https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5/400.css",
        fallback:
          "https://registry.npmmirror.com/@fontsource/noto-serif-sc/latest/files/400.css",
      },
      {
        primary:
          "https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5/700.css",
        fallback:
          "https://registry.npmmirror.com/@fontsource/noto-serif-sc/latest/files/700.css",
      },
    ],
  },
  {
    key: "wenkai",
    label: "霞鹜文楷",
    cssSheets: [
      {
        primary:
          "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1/style.css",
        fallback:
          "https://registry.npmmirror.com/lxgw-wenkai-screen-webfont/latest/files/style.css",
      },
    ],
  },
  {
    key: "kuaile",
    label: "站酷快乐体",
    cssSheets: [
      {
        primary:
          "https://cdn.jsdelivr.net/npm/@fontsource/zcool-kuaile@5/400.css",
        fallback:
          "https://registry.npmmirror.com/@fontsource/zcool-kuaile/latest/files/400.css",
      },
    ],
  },
];

/** 按键名查找字体预设 */
export const getFontOption = (key: string): FontOption | undefined =>
  FONT_OPTIONS.find((option) => option.key === key);
