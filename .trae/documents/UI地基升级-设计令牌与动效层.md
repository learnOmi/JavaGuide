# UI 地基升级：设计令牌层与统一动效层（L0）

## Context（为什么做这件事）

当前站点的视觉与交互是"逐点补丁"式累积出来的，存在三处结构性债务：

1. **无设计令牌**：`styles/config.scss` 只有一行 `$theme-color: #2980b9`，`styles/palette.scss` 只有侧边栏宽度与字体栈。圆角、阴影、动效时长、缓动曲线、z-index、颜色字面量全部散落在 11 个组件的 `<style>` 块里（实测 z-index 就有 `10/11/200/300/350/400/500/999/9999` 九种取值）。
2. **动效即卡顿源**：`styles/index.scss` 把 `margin/padding/width` 也放进了 `transition`，这三个都是触发布局重算的属性；沉浸模式切换必然掉帧。全项目 **零处** `prefers-reduced-motion`。
3. **权重战争 + 死选择器**：沉浸模式靠批量 `!important` 压制主题内部类名，其中 5 个选择器指向**根本不存在的元素**，并且**漏掉了真正约束正文列宽的元素**，导致沉浸模式其实从未真正放宽过阅读列宽（详见下节实证）。

本轮目标（用户已确认）：**只做 L0 地基**——建立设计令牌层、收敛动效、清理图层耦合；**保留现有视觉气质**（#2980b9 蓝 + 清爽黑体），只做精致化；**自研零依赖**，不引入动效库或第三方 UI 库。视觉变化应限于两处刻意修复（沉浸模式列宽、动效帧率）。

---

## 一、已核实的技术前提（这些事实决定了设计，全部经源码验证）

### 1. 样式注入只认三个固定文件名，无通配

主题调用 `useSassPalettePlugin(app, { id:"hope", config:".vuepress/styles/config.scss", palette:".vuepress/styles/palette.scss", style:".vuepress/styles/index.scss" })`
（`vuepress-theme-hope/dist/node/index.js:3406-3414`）。

因此：**新增任何 `.scss` 都必须从这三个文件之一 `@use` 进去**，否则不会被加载。

### 2. `palette.scss` 的变量会自动变成 CSS 变量，且颜色会自动生成暗色一套

`docs/.vuepress/.temp/sass-palette/load-hope.js` → `import "@sass-palette/hope-inject"` → `@include helper.inject($palette-variables)`
（`@vuepress/plugin-sass-palette/styles/helper.scss:136-152`）。

`helper.inject` 的行为（`helper.scss:84-134`，实测）：

- 变量名 `camel-to-kebab` 转成 CSS 自定义属性，前缀 `--`（`$jg-c-shadow` → `--jg-c-shadow`）；
- **类型为 `number` / `string` 的值** → 只写入 `:root`；
- **颜色**或 `(light: <color>, dark: <color>)` **map** → 写入 `:root` 的 light 值，并在 `[data-theme='dark']` 下额外写 dark 值（两者不同时才写）；
- 其余类型走 `@warn` 并**被丢弃**。

### 3. ⚠ 复合值必须写成「带引号的字符串」（本项目最关键的坑）

`0 2px 12px rgba(...)` 在 Sass 里是**空格分隔的 list**，`meta.type-of()` 返回 `list` → 不满足 `number or string` → **被静默丢弃（只有一条 `@warn`，构建不报错）**。

主题自己就是这么绕过的：`templates/palette/transition.scss` 中

```scss
$vp-t-color: "0.3s ease" !default;
```

**明确加了引号**。所以本项目所有复合令牌（阴影、过渡简写）**必须写成带引号的字符串**；插值时引号会被自动剥离 (`#{"0 2px 12px"}` → `0 2px 12px`)。

配套推论：**阴影拆成「颜色令牌 + 结构字面量」**——颜色令牌是 map（自动明暗双套），结构字面量引用它（如 `"0 2px 12px var(--jg-c-shadow)"`），这样暗色下阴影会随颜色自动增强，无需重复定义。

### 4. 暗色选择器是 `html[data-theme="dark"]`

主题在 `document.documentElement.dataset.theme` 上写 `"dark"` / `"light"`（`dist/client/composables/useDarkMode.js:77-81`）。`darkmode` 默认 `"switch"`。

**暗色切换按钮本就存在**，无需恢复：`navbarLayout` 中的 `Outlook` 项映射到 `AppearanceButton`（`dist/client/components/navbar/Navbar.js:37`），而 `AppearanceButton` 在 `canToggle` 且无全屏/多主题色冲突时直接渲染 `ColorModeSwitch`（`AppearanceButton.js:26-30`）。本项目 `theme.ts` 保留了 `"Outlook"`。（先前"暗色开关被覆写丢失"的判断是错的，已证伪。）

### 5. 沉浸模式的真实缺陷（实测，两个独立问题）

**（a）5 个死选择器**（主题组件从不输出这些类名，已逐个核对 `dist/client/components/**`）：
`.theme-hope-content`、`.vp-page-content`、`.vp-page-container`、`.vp-sidebar-wrapper`、`.sidebar-wrapper`。

**（b）漏掉真正的列宽约束元素**：正文包裹元素是 `<div vp-content>`——**属性，不是 class**（`dist/client/components/base/MarkdownContent.js:30`），列宽来自

```scss
[vp-content]:not(.custom) {
  @include wrapper.wrapper;
} // dist/client/styles/_content.scss:15-21
// wrapper.wrapper → max-width: var(--content-width); margin: 0 auto; padding: 2rem 2.5rem
```

而 `styles/index.scss` 写的是 `.vp-content`（**class 选择器，匹配不到属性**）。

**结论：沉浸模式只隐藏了导航与侧栏，正文列宽始终被钉在 780px，从未真正变宽。** 这正是用户已确认要顺带修好的问题。

**（c）另一处重复**：`.vp-page` 与 `.theme-container > main` 是**同一个元素**（`PageContent.js:19`：`h("main", { id:"main-content", class:"vp-page" })`），现有选择器列表里并列书写属冗余。

### 6. 关于 `@layer`：本期不引入（重要反直觉结论）

主题 CSS **全部未分层**。按 CSS 规范，**未分层样式的优先级高于任何分层样式**。因此把我们的覆盖放进 `@layer` 会**更弱**，反而压不住主题。结论：不为了"优雅"上 `@layer`。

（若将来要上，正确做法是把主题样式也纳入分层，这需要改主题源码，不在本期范围。）

### 7. 主题 z-index 基线（保证新令牌层级正确嵌套）

实测：`page-footer 50`、`toc 99`、`main-layout 100`、`sidebar-mask 100`、`sidebar-mobile 125`、`nav-screen 150`、`navbar 175`、`skip-link 999`、`color-mode-switch 99999`。

现有自定义取值 `200(FontSwitch)/300(EditEntry)/350/400/500(DocEditor)/999(LayoutToggle)/9999(灯箱)` 与其嵌套合理，**本期不改数值，只登记命名**（避免引入新的层级冲突）。
需注意的一处既有碰撞：`LayoutToggle=999` 与主题 `skip-link=999` 同值（后者仅聚焦时可见，实际不冲突，本期记录不改）。

---

## 二、设计令牌清单

全部声明在 `docs/.vuepress/styles/palette.scss`（**保留原有 `$sidebar-width`、`$sidebar-mobile-width`、`$vp-font`、`$vp-font-heading` 与全部注释**）。

命名前缀 `--jg-`。**颜色用 map 以获得自动明暗双套；复合值用带引号字符串。**

### 颜色（map，自动生成 `[data-theme='dark']`）

| Sass 变量             | 值                                                              | 用途               |
| --------------------- | --------------------------------------------------------------- | ------------------ |
| `$jg-c-shadow`        | `(light: rgb(0 0 0 / 10%), dark: rgb(0 0 0 / 42%))`             | 常规浮层阴影色     |
| `$jg-c-shadow-strong` | `(light: rgb(0 0 0 / 22%), dark: rgb(0 0 0 / 55%))`             | 强阴影/弹窗        |
| `$jg-c-scrim`         | `(light: rgb(0 0 0 / 35%), dark: rgb(0 0 0 / 55%))`             | 对话框遮罩         |
| `$jg-c-lightbox`      | `(light: rgb(0 0 0 / 82%), dark: rgb(0 0 0 / 90%))`             | 图片灯箱底         |
| `$jg-c-overlay-hover` | `(light: rgb(255 255 255 / 16%), dark: rgb(255 255 255 / 12%))` | 灯箱关闭按钮 hover |
| `$jg-c-on-accent`     | `#fff`（纯色，不生成 dark 块）                                  | 强调色上的文字     |

### 圆角 / 间距 / 尺寸（number）

| Sass 变量                                     | 值                                        |
| --------------------------------------------- | ----------------------------------------- |
| `$jg-radius-sm` / `md` / `lg` / `xl` / `pill` | `6px` / `8px` / `10px` / `12px` / `999px` |
| `$jg-immersive-content-width`                 | `1200px`（沉浸态列宽，见 Step 3）         |
| `$jg-immersive-pad-x` / `pad-x-lg`            | `2rem` / `3rem`                           |

### 阴影（**带引号字符串**，引用颜色令牌）

| Sass 变量       | 值                                        |
| --------------- | ----------------------------------------- |
| `$jg-shadow-sm` | `"0 2px 12px var(--jg-c-shadow)"`         |
| `$jg-shadow-md` | `"0 4px 16px var(--jg-c-shadow)"`         |
| `$jg-shadow-lg` | `"0 12px 48px var(--jg-c-shadow-strong)"` |
| `$jg-shadow-xl` | `"0 18px 48px var(--jg-c-shadow-strong)"` |

### 动效（时长 number / 缓动字符串）

| Sass 变量                  | 值                             | 说明                                |
| -------------------------- | ------------------------------ | ----------------------------------- |
| `$jg-dur-sm` / `md` / `lg` | `0.15s` / `0.2s` / `0.3s`      | 原 `0.16s→0.15s`、`0.18s→0.2s` 收敛 |
| `$jg-ease-standard`        | `ease`                         |                                     |
| `$jg-ease-emphasized`      | `"cubic-bezier(0.2, 0, 0, 1)"` | 与 `ease` 同时长下观感更利落        |

### z-index（number，沿用现值仅命名）

| Sass 变量            | 值     | 对应                              |
| -------------------- | ------ | --------------------------------- |
| `$jg-z-float`        | `200`  | FontSwitch（高于主题 navbar 175） |
| `$jg-z-entry`        | `300`  | EditEntry                         |
| `$jg-z-editor`       | `350`  | DocEditor 抽屉                    |
| `$jg-z-dialog`       | `400`  | 新建页/删除确认                   |
| `$jg-z-editor-inner` | `500`  | DocEditor 内部层级                |
| `$jg-z-immersive`    | `999`  | LayoutToggle                      |
| `$jg-z-lightbox`     | `9999` | 图片预览 / GlobalUnlock 遮罩      |

---

## 三、分步实施

### Step 1 — `styles/palette.scss`：追加令牌

按上表追加，**保留原有四个变量与注释**。文件顶部加一段注释说明分工与"复合值必须加引号"的约束（附一行失效表现：只有 `@warn`，构建不报错，易漏）。

### Step 2 — `styles/config.scss`：不动，仅补注释

该文件进入 `hope-config` 模块，是**编译期 Sass 变量**（供主题在 `@include` 中消费），不会生成 `var()`。补一行注释说明它与 `palette.scss` 的分工，避免后人把令牌错放进来。

### Step 3 — `styles/index.scss`：图层收敛（核心）

1. **共享过渡层**：属性收敛为 `transform, opacity`（移除 `margin/padding/width`）；值改用 `var(--jg-dur-lg) var(--jg-ease-standard)`；选择器提升特异性为 `html .vp-navbar, html .vp-sidebar, html .vp-page`（去掉冗余的 `.theme-container > main`，它与 `.vp-page` 同元素）。
   **必须留在基础态，不能放进 `html.layout-hidden` 内**——否则退出沉浸时类移除与属性变更同帧发生，退场动画会丢失（现有代码已有此正确结构，保持）。
2. **沉浸模式修复**：
   - 删除 5 个死选择器；
   - 侧栏位移由 `translateX(-100%)` 改为 `translateX(calc(-1 * var(--sidebar-width)))`。
     **原因**：`-100%` 基于自身宽度，而侧栏宽度在沉浸态被瞬时归零，`-100%` 就等于 0，滑动动画会退化成纯淡出；
   - **`.vp-content` → `[vp-content]`**，并把 `max-width` 从 `100%` 改为 `var(--jg-immersive-content-width)`、`margin` 改为 `margin-inline: auto` 以保持居中。
     这样沉浸模式才真正放宽阅读列宽（但仍限宽，避免宽屏上行长失控影响可读性）。
3. **`!important` 分批退役**：逐条判定，不一次性删。
   - 第一批（零风险）：死选择器上的规则、以及主题**完全无对应声明**的属性（`opacity` / `pointer-events`）；
   - 第二批：主题有声明但我们的选择器特异性更高（如 `html.layout-hidden .vp-sidebar` (0,2,1) vs 主题 `.vp-sidebar` (0,1,0)）——摘除；
   - 第三批：保留待 A/B 验证结果决定。
     **判定方法**：DevTools → Elements → Styles 面板，逐条取消 `!important` 勾选，观察 Computed 值是否跳变（跳变=必需）。
4. **新增 `@media (prefers-reduced-motion: reduce)` 兜底**（全项目目前零命中）：统一把过渡/动画时长压到 `0.01ms`、关闭 `scroll-behavior`，并作为沉浸模式"瞬时切换"的分支。

### Step 4 — 组件换令牌（全部组件，用户已确认全量）

按 `<style>` 块逐文件替换硬编码值为 `var(--jg-*)`，**保留所有原有注释，方法不超 50 行**。

| 文件                                                        | 主要替换项                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `components/LayoutToggle.vue`                               | 圆角 `18px`→`--jg-radius-pill`、阴影、`0.3s ease`、z-index `999` |
| `components/FontSwitch.vue`                                 | 圆角 `10px`、阴影、`0.18s`、z-index `200`                        |
| `components/EditEntry.vue`                                  | z-index `300`、阴影两处、`0.15s`                                 |
| `components/ClickImagePreview.vue`                          | z-index `9999`、遮罩色、圆角 `6px`/`50%`、阴影、`0.16s`          |
| `components/DocEditor/DocEditor.vue`                        | z-index `350`/`500`、圆角、阴影、时长                            |
| `components/DocEditor/{NewPageDialog,DeleteDialog}.vue`     | z-index `400`、遮罩色、圆角、阴影、入场动画                      |
| `components/DocEditor/{FrontmatterForm,MarkdownEditor}.vue` | 圆角、间距、时长                                                 |
| `components/unlock/{GlobalUnlock,UnlockContent}.vue`        | z-index `10`/`11`/`9999`、圆角、阴影                             |

> 注：`unlock` 的 `z-index: 10/11` 是组件内部相对层级，不纳入全局尺度，**保留原值不动**（登记录入注释即可）。

### Step 5 — 文档与记录

- 在该文件（`palette.scss`）与 `index.scss` 顶部补注释，作为令牌的**唯一权威声明处**的说明；
- 完成后按项目文档纪律，将实施记录写入 `doc/dev-report/03-UI风格升级-设计与实施记录.md`（**新建**：这是新问题，不并入 01/02）。

---

## 四、验证方案

**必须先做基线**：改动前先在 `1440 / 1280 / 960 / 720 / 420px` 五档宽度对同一组页面截图留档，作为像素比对基线。
页面样本：首页 `/`、一篇含 TOC 的长正文页、`/404.html`、含 `UnlockContent` 的加密页。

1. **视觉无回归**：`pnpm docs:build` 后本地静态服务，同宽度同页面重截，与基线做像素 diff。**预期差异仅两处且必须解释清楚**：沉浸模式列宽（有意修复）、过渡属性收敛后的动效观感。
2. **沉浸模式真变宽**：进入沉浸模式后读 `[vp-content]` 的 computed `max-width`，应为 `1200px`（而非改动前的 `780px`）。
3. **沉浸模式不掉帧**：DevTools Performance 录制一次「进入沉浸 → 退出沉浸」，检查 `Recalculate Style / Layout` 只在切换瞬间出现、之后无连续 Layout 帧；再开 4× CPU throttling 复测。
4. **暗色无颜色错误**：切到 `html[data-theme="dark"]`，逐个核对阴影/遮罩/灯箱的 computed `box-shadow` 与 `background-color`，确认无残留 `#fff`、`rgba(0,0,0,0.1)` 等字面量；确认 `--jg-c-shadow` 等在暗色下确实取到了 dark 值。
5. **令牌真的生效**（防"被 `helper.inject` 静默丢弃"）：构建产物 CSS 中 grep `--jg-shadow-sm` 等**每一条**令牌名，确认全部存在于 `:root`；再 grep `data-theme="dark"` 块确认颜色令牌的 dark 值已生成。
6. **`prefers-reduced-motion`**：DevTools Rendering 面板开启该模拟，确认动画全部被压除。
7. **`!important` 退役回归**：每摘一批就重跑 1、2、4 三项，并且**必须在生产构建产物上复核**（chunk CSS 注入顺序只在 build 下暴露，dev 环境会掩盖顺序问题）。

---

## 五、风险与对策

| 风险                                          | 对策                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 复合值忘了加引号 → 令牌静默失效（仅 `@warn`） | 验证方案第 5 条强制逐条 grep 构建产物；这条约束写进 `palette.scss` 注释                         |
| 摘 `!important` 导致沉浸模式在真机上失效      | 分批摘除 + 每批回归；最终判定以生产构建产物为准                                                 |
| 组件量大（11 个文件）机械替换引入笔误         | 逐文件改完即做该组件的视觉核对，不批量改完再统一验                                              |
| `max-width: 1200px` 在超宽屏仍显宽            | 需实测 2560px 下的观感；若过宽则下调令牌值（只改一处）                                          |
| 主题升级后内部类名变动                        | 本期已把死选择器清掉、并改用属性选择器 `[vp-content]`（比主题内部类名稳定），后续耦合面显著缩小 |
