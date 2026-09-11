/**
 * 字体切换器预设常量
 *
 * 每个预设描述如何覆盖 vuepress-theme-hope 的
 * `--vp-font`（正文）与 `--vp-font-heading`（标题）两个 CSS 变量。
 * 代码块字体 `--vp-font-mono` 不受切换影响。
 */

/** localStorage 持久化键名 */
export const FONT_STORAGE_KEY = "javaguide-font-preset";

/** 默认预设键名（与 styles/palette.scss 中 $vp-font 默认栈保持一致） */
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
  /** 唯一键，用于持久化与选中态高亮 */
  key: string;
  /** 展示名称 */
  label: string;
  /** 正文 --vp-font 字体栈 */
  base: string;
  /** 标题 --vp-font-heading 字体栈 */
  heading: string;
  /** 可选：选中该预设时才懒加载的 webfont 样式表 */
  cssSheets?: FontStylesheet[];
}

/** 清爽黑体栈（新默认） */
const SANS_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "WenQuanYi Micro Hei", sans-serif';

/** 主题衬线栈（历史默认，Georgia + 苹方/雅黑） */
const SERIF_STACK =
  'Georgia, -apple-system, "Nimbus Roman No9 L", "PingFang SC", "Hiragino Sans GB", "Noto Serif SC", "Microsoft Yahei", "WenQuanYi Micro Hei", sans-serif';

/** 楷体回退栈（霞鹜文楷 webfont 加载前后的本地兜底） */
const KAI_STACK =
  '"LXGW WenKai Screen", "Kaiti SC", STKaiti, KaiTi, "PingFang SC", serif';

/** 宋体回退栈（思源宋体 webfont 加载前后的本地兜底） */
const SONG_STACK =
  '"Noto Serif SC", Georgia, "Songti SC", SimSun, "Microsoft Yahei", serif';

/** 网页思源黑体栈（webfont 保证跨平台渲染一致，失败时回退系统黑体栈） */
const WEB_SANS_STACK = `"Noto Sans SC", ${SANS_STACK}`;

/** MiSans 栈（小米官方字体，webfont 加载前后的本地兜底为系统黑体栈） */
const MISANS_STACK = `"MiSans", ${SANS_STACK}`;

/** 站酷快乐体栈（趣味展示字体，回退圆体/幼圆，再回退系统黑体） */
const KUAILE_STACK =
  '"ZCOOL KuaiLe", "Yuanti SC", YouYuan, "Microsoft YaHei", sans-serif';

/**
 * 全部字体预设
 *
 * webfont 通过 CDN 懒加载（中文全量字体体积大，仅在用户选中时下载），
 * 未加载/加载失败时回退到本地系统字体。
 */
export const FONT_OPTIONS: FontOption[] = [
  {
    key: "system",
    label: "清爽黑体",
    base: SANS_STACK,
    heading: SANS_STACK,
  },
  {
    key: "web-sans",
    label: "思源黑体",
    base: WEB_SANS_STACK,
    heading: WEB_SANS_STACK,
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
    base: MISANS_STACK,
    heading: MISANS_STACK,
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
    key: "theme",
    label: "主题衬线",
    base: SERIF_STACK,
    heading: SERIF_STACK,
  },
  {
    key: "noto-serif",
    label: "思源宋体",
    base: SONG_STACK,
    heading: SONG_STACK,
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
    base: KAI_STACK,
    heading: KAI_STACK,
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
    base: KUAILE_STACK,
    heading: KUAILE_STACK,
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
