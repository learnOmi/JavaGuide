# UI 升级 L1：暗色完整化与视觉补漏 — 设计与实施计划

> 阶段：设计（待批准后进入实施）
> 上游：L0 地基已完成并验证（见 [03-UI风格升级-设计与实施记录.md](doc/dev-report/03-UI风格升级-设计与实施记录.md)）
> 前置约定：令牌前缀 `--jg-*` 声明在 `docs/.vuepress/styles/palette.scss`；复合值必须写成带引号字符串；样式注入只认 `config.scss` / `palette.scss` / `index.scss` 三个文件。

---

## 一、本期目标与边界

L0 解决的是"没有地基"：令牌层、动效收敛、图层耦合。它**刻意没碰配色**。L1 补上配色这一层，具体三件事：

1. **接通主题已有的语义色板**，消除暗色下的"浅色泄漏"（这是本期主要矛盾，见第二节的实测发现）。
2. **收编 L0 白名单里的遗留项**：品牌绿一族、`transition: all 0.35s`、灯箱 hover 的 `rgb(255 255 255 / 24%)`。
3. **做一次有边界的暗色对比度抽查**：正文、表格、代码块、引用、提示容器，发现即修（只改本项目代码，不改主题源码）。

**不做**：不改主题配色气质（仍是 #2980b9 蓝 + 清爽黑体）、不动布局、不引入第三方库、不重做锁屏组件的产品逻辑。

---

## 二、实测发现（这两条决定了本期的做法）

### 发现 A：组件里用的语义变量在 hope 主题里根本不存在

`DocEditor`、`NewDeleteDialog`、`FrontmatterForm` 里有大量这种写法：

```css
color: var(--vp-c-danger-content, #a33);
background: var(--vp-c-info-bg, #eaf3ff);
color: var(--vp-c-warning, #e2a600);
```

这些 `--vp-c-danger*` / `--vp-c-warning*` / `--vp-c-info*` 是 **VuePress 默认主题**的命名。本项目用的是 hope，我逐个核对了三处权威来源：

- hope 的 `templates/palette/{color,font,layout,transition,generator}.scss` —— 只有 `accent / bg / text / border / divider / shadow / control` 一族，**没有 danger / warning / info / success**；
- 全量 `node_modules/.pnpm` 下的 `*.scss` / `*.css` / `*.js` —— 搜 `--vp-c-danger:` / `--vp-c-warning:` / `--vp-c-info:` **零命中**。

所以 `var(--vp-c-danger-content, #a33)` 里的 fallback **不是兜底，是唯一取值**。后果：暗色下 `#fdecec`（近白粉底）、`#eaf3ff`（近白蓝底）、`#fff7e6`（近白黄底）会直接怼在深色页面上，是一块块发光的浅色补丁。

### 发现 B：`--bg-color` / `--border-color` 全站无定义

`unlock/*` 组件里反复出现 `var(--bg-color, #fff)`、`var(--border-color, #e5e7eb)`。同样全量搜过：**这两个变量在主题与所有依赖里都没有定义**。于是它俩也一直是字面量 `#fff` / `#e5e7eb`。

后果最刺眼的一处：`.unlock-modal` 的背景是 `var(--bg-color, #fff)` → **暗色模式下弹窗是一整块纯白**。`UnlockContent.vue` 的渐隐遮罩同理，暗色下是"内容淡出到白色"。

> 这条也修正了 03 号文档第四节白名单里的判断：那里把 `var(--bg-color, #fff)` 记作"主题变量兜底，非本项目设计决策"。实测证明它不是兜底，而是一直生效的硬编码，属于要修的真问题。

### 发现 C：主题其实早就给了一整套明暗双套语义色板，我们一处都没用

hope 依赖的 `@vuepress/helper` 自带 `colors.css`，在 `:root` 与 `[data-theme="dark"]` 各定义一套：

| 语义       | 主题现成令牌                                                                       |
| ---------- | ---------------------------------------------------------------------------------- |
| 危险（红） | `--vp-c-red-text` `--vp-c-red-bg` `--vp-c-red-soft` `--vp-c-red-hover`             |
| 警告（黄） | `--vp-c-yellow-text` `--vp-c-yellow-bg` `--vp-c-yellow-soft` `--vp-c-yellow-hover` |
| 信息（蓝） | `--vp-c-blue-text` `--vp-c-blue-bg` `--vp-c-blue-soft` `--vp-c-blue-hover`         |
| 成功（绿） | `--vp-c-green-text` `--vp-c-green-bg` `--vp-c-green-soft` `--vp-c-green-hover`     |
| 中性       | `--vp-c-grey-text` `--vp-c-grey-bg` `--vp-c-grey-soft`                             |

它的取值示例（会自动切换）：`--vp-c-red-text` 亮色 `#b8272c` / 暗色 `#f66f81`；`--vp-c-blue-soft` = `#1bb2e524`（半透明蓝，明暗通用）。

另外 hope 的 `generator.scss` 还提供了现成的文字/边框/背景层级：`--vp-c-text` / `--vp-c-text-mute` / `--vp-c-text-subtle`、`--vp-c-border` / `--vp-c-divider` / `--vp-c-border-hard`、`--vp-c-bg` / `--vp-c-bg-alt` / `--vp-c-bg-elv` / `--vp-c-bg-soft`。

**所以结论是反直觉的：L1 几乎不需要"新造"语义色令牌。** 需求（成功/警告/危险/信息）主题早就满足了，缺的只是"去用"。真正需要自造的只有品牌绿那一族——因为它是 JavaGuide 解锁组件的品牌色，不属于主题的通用语义色板。

---

## 三、令牌变更（palette.scss）

新增 6 个，全部只服务于品牌绿与灯箱 hover，理由见上（其余语义色一律接主题现成令牌，不重复定义、不制造两套维护源）。

| 令牌                         | 值                                                              | 用途                                                                      |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `$jg-c-brand`                | `(light: #3eaf7c, dark: #4ab98a)`                               | 品牌绿（解锁按钮/高亮/虚线框/聚焦边框）。暗色略提亮，补偿深底上的视觉重量 |
| `$jg-c-brand-border`         | `(light: rgb(62 175 124 / 45%), dark: rgb(74 185 138 / 50%))`   | 阅读全文按钮描边                                                          |
| `$jg-c-brand-glow`           | `(light: rgb(62 175 124 / 16%), dark: rgb(74 185 138 / 22%))`   | 品牌绿光晕阴影的**颜色令牌**（结构字面量引用它）                          |
| `$jg-shadow-brand`           | `"0 8px 20px var(--jg-c-brand-glow)"`                           | 阅读全文按钮常态                                                          |
| `$jg-shadow-brand-hover`     | `"0 10px 24px var(--jg-c-brand-glow)"`                          | 阅读全文按钮 hover                                                        |
| `$jg-c-overlay-hover-strong` | `(light: rgb(255 255 255 / 24%), dark: rgb(255 255 255 / 30%))` | 灯箱关闭按钮 hover（L0 白名单遗留项）                                     |

同步：`--jg-c-on-accent` 保持 `#fff` 不变（它只用在自绘按钮上，不跟主题 `--vp-c-white` 的明暗反转语义混用）。

---

## 四、分步实施

### Step 1 — `styles/palette.scss`：追加 6 个令牌

追加在既有"品牌/阴影"分区，**保留全部原有注释**，并补一句说明"语义色（红/黄/蓝/绿）一律用主题 `--vp-c-*-text/-bg/-soft`，本文件不重复定义"。

### Step 2 — 语义色接线（把不存在的变量换成主题现成令牌）

映射规则（左 = 现在，右 = 改为）：

| 现在                                   | 改为                      | 语义                       |
| -------------------------------------- | ------------------------- | -------------------------- |
| `var(--vp-c-danger-content, #a33)`     | `var(--vp-c-red-text)`    | 危险-文字                  |
| `var(--vp-c-danger-bg, #fdecec)`       | `var(--vp-c-red-soft)`    | 危险-软底                  |
| `var(--vp-c-danger, #a33)`             | `var(--vp-c-red-bg)`      | 危险-实色（边框/实心按钮） |
| `var(--vp-c-warning-content, #8a6100)` | `var(--vp-c-yellow-text)` | 警告-文字                  |
| `var(--vp-c-warning-bg, #fff7e6)`      | `var(--vp-c-yellow-soft)` | 警告-软底                  |
| `var(--vp-c-warning, #e2a600)`         | `var(--vp-c-yellow-bg)`   | 警告-图标/强调             |
| `var(--vp-c-info-content, #246)`       | `var(--vp-c-blue-text)`   | 信息-文字                  |
| `var(--vp-c-info-bg, #eaf3ff)`         | `var(--vp-c-blue-soft)`   | 信息-软底                  |
| `color: #fff`（危险实心按钮上的字）    | `var(--jg-c-on-accent)`   | 强调底上的文字             |

涉及文件与行（实施时逐行核对）：`DocEditor/DocEditor.vue`（671/727/730/789/790/794/795/799/800）、`DocEditor/DeleteDialog.vue`（160/214/229/237/259/260）、`DocEditor/NewPageDialog.vue`（569）、`DocEditor/FrontmatterForm.vue`（210/211/215/216/252）。

顺手清理一处死 fallback：`var(--vp-c-accent, var(--vp-c-brand))` 里的 `--vp-c-brand` 同样不存在（`--vp-c-accent` 存在，链式取值本就命中前者）。改为 `var(--vp-c-accent)`。出现位置：`LayoutToggle.vue`(115/122)、`EditEntry.vue`(147)、`NewPageDialog.vue`(440/476/561)、`FrontmatterForm.vue`(241)、`DocEditor.vue`(707/736)。**这一条属于可选清理，若担心回归可跳过**，请在批准时指明。

### Step 3 — `unlock/*` 暗色修复 + 品牌令牌化

**`unlock/UnlockContent.vue`**

| 行              | 现在                                            | 改为                                                                                                               |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 116             | `var(--bg-color, #fff)`                         | `var(--vp-c-bg)`                                                                                                   |
| 120             | `var(--border-color, #e5e7eb)`                  | `var(--vp-c-border)`                                                                                               |
| 136             | `#64748b`                                       | `var(--vp-c-text-mute)`                                                                                            |
| 145 / 174 / 181 | `#3eaf7c`                                       | `var(--jg-c-brand)`                                                                                                |
| 147             | `#f8fafc`                                       | `var(--vp-c-bg-alt)`                                                                                               |
| 165             | `#d1d5db`                                       | `var(--vp-c-border)`                                                                                               |
| 187             | `#dc2626`                                       | `var(--vp-c-red-text)`                                                                                             |
| 193             | `#94a3b8`                                       | `var(--vp-c-text-subtle)`                                                                                          |
| 199             | `transition: all 0.35s var(--jg-ease-standard)` | `transition: transform var(--jg-dur-lg) var(--jg-ease-standard), opacity var(--jg-dur-lg) var(--jg-ease-standard)` |

199 行同时解决两件事：白名单遗留的"刻度外时长"，以及 `all` 会连 `margin/padding` 一起过渡的性能小坑（与 L0 收敛动效的方向一致）。

**`unlock/GlobalUnlock.vue`**

| 行                    | 现在                                                  | 改为                                                                                                               |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 277-278               | `rgba(255,255,255,0)` + `var(--bg-color, #fff)`       | `transparent` + `var(--vp-c-bg)`                                                                                   |
| 283-289               | `[data-theme="dark"] .read-more-mask { ... #1d1e20 }` | **整块删除**（用 `--vp-c-bg` 后暗色取值自动变成 `#1b1b1f`，与原来的 `#1d1e20` 视觉几乎一致，手写暗色覆盖不再需要） |
| 298                   | `rgba(62,175,124,.45)`                                | `var(--jg-c-brand-border)`                                                                                         |
| 300 / 330             | `var(--bg-color, #fff)`                               | `var(--vp-c-bg-elv)`                                                                                               |
| 301 / 388 / 409 / 416 | `#3eaf7c`                                             | `var(--jg-c-brand)`                                                                                                |
| 304                   | `0 8px 20px rgba(62,175,124,.16)`                     | `var(--jg-shadow-brand)`                                                                                           |
| 310                   | `0 10px 24px rgba(62,175,124,.2)`                     | `var(--jg-shadow-brand-hover)`                                                                                     |
| 329                   | `var(--border-color, #e5e7eb)`                        | `var(--vp-c-border)`                                                                                               |
| 348                   | `#f1f5f9`                                             | `var(--vp-c-bg-alt)`                                                                                               |
| 349                   | `#334155`                                             | `var(--vp-c-text)`                                                                                                 |
| 363                   | `#64748b`                                             | `var(--vp-c-text-mute)`                                                                                            |
| 372                   | `#3eaf7c`                                             | `var(--jg-c-brand)`                                                                                                |
| 374                   | `#f8fafc`                                             | `var(--vp-c-bg-alt)`                                                                                               |
| 402                   | `#d1d5db`                                             | `var(--vp-c-border)`                                                                                               |
| 424                   | `#dc2626`                                             | `var(--vp-c-red-text)`                                                                                             |

> 保留不动：268 / 294 行的 `z-index: 10 / 11`（组件内部相对层级，L0 已判定并加注释）。

**`ClickImagePreview.vue`**：155 行 `rgb(255 255 255 / 24%)` → `var(--jg-c-overlay-hover-strong)`；147 行 `#fff` → `var(--jg-c-on-accent)`（灯箱底永远是深色，语义上就是"强调底上的文字"，换成令牌可读性更好，但**属可选**）。

### Step 4 — 暗色对比度抽查（有边界）

在 dev server 上，选 3 类代表页：普通正文页、含大量表格/hint 的页、被锁页 + 编辑抽屉。切到 `html[data-theme="dark"]` 后量：

- 正文段落、二级/三级标题；
- 表格：表头、斑马纹、边框线；
- 行内 `code` 与 `pre` 代码块（背景与文字）；
- 引用块 `blockquote`；
- 6 类 hint 容器（important/info/note/tip/warning/caution）的 标题色 vs 软底色；
- 本期改过的四个组件。

判定线：正文类文本 ≥ 4.5:1；大字/非文本 UI（边框、图标）≥ 3:1。**命中问题且能在本项目代码内修的就地修**；若根因在主题源码，只记录到文档，不动主题。

### Step 5 — 归档

按项目惯例新建 `doc/dev-report/04-UI风格升级L1-暗色完整化-设计与实施记录.md`（03 号只记 L0，不改标题），并在 03 号第四节白名单里把本期收编的 3 项标注"已由 L1 收编"，同时更正"`var(--bg-color,#fff)` 属主题兜底"的错误判断。

---

## 五、令牌生效链路（为什么这么改就一定生效）

```
palette.scss ($jg-*)
        │  @vuepress/plugin-sass-palette / helper.inject()
        ▼
   :root (+ [data-theme="dark"] 的第二套)
        ▲
        │  两者都在同一张 CSSOM 上，var() 在解析期按当前主题取值
        │
@vuepress/helper/colors.css ($vp-c-red/yellow/blue/green-*)
@vuepress/plugin-markdown-hint/config.css ($vp-c-*-bg 消费方)
        ▲
        │
组件 <style>：var(--jg-c-brand) / var(--vp-c-red-text) / var(--vp-c-text-mute)
```

关键点：`--vp-c-red-*` 这些令牌已经在页面运行时存在于 `:root`（hint 容器一直在消费它们），所以我们只是"补上消费方"，不引入新的注入环节——**改完必然生效，不存在 L0 那种"值被 `helper.inject` 静默丢弃"的风险**，因为本期新增的 6 个令牌只有 `$jg-shadow-brand*` 两条是复合字符串（已按约束加引号）。

---

## 六、验收标准

1. 浏览器 `getComputedStyle(document.documentElement)` 中，`--vp-c-red-text` / `--vp-c-yellow-soft` / `--vp-c-blue-soft` / `--vp-c-bg-alt` / `--vp-c-text-mute` / `--vp-c-border` 在明暗两态下均**非空**且取值不同（证明双套成立）。
2. 暗色下实测：`.unlock-modal` 背景 ≠ `#fff`；`.qr-container` 背景 ≠ `#f8fafc`；`.fade-mask` / `.read-more-mask` 渐变终点 = 暗色页面底色。
3. 明色下上述组件的**视觉与改动前一致**（品牌绿、浅灰底盒不出现肉眼可见变化）——本期明色只允许"死 fallback 清理"这一处零视觉差异的改动。
4. 改过的组件里，除白名单（圆形 `50%`、组件内 `z-index: 10/11`）外**不再有 `#hex` / `rgb()` 字面量**（用脚本扫一遍）。
5. 暗色对比度抽查结论落表（命中/未命中 + 数值），有问题项给出处置。
6. `pnpm docs:build` 构建成功。
7. 未提交改动全部集中在 `styles/palette.scss` + 上述 6 个组件 + 2 个文档，不动主题源码、不动功能逻辑。

---

## 七、风险与对策

| 风险                                   | 说明                                                                                   | 对策                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 明色观感漂移                           | `#64748b` → `--vp-c-text-mute`、`#f8fafc` → `--vp-c-bg-alt` 都是**近似但不等值**的替换 | 明色下逐处截图对比；若某处差异明显，回退为"新增一个专用 `--jg-*` 令牌保留原值" |
| 品牌绿暗色提亮过头                     | `#4ab98a` 是主观选取                                                                   | 只在暗态量对比度，目标 ≥ 4.5:1（正文语义）且不刺眼；不达标就下调               |
| `--vp-c-red-*` 实际未注入              | 若 hint 插件在本站被裁掉，色板可能不在包内                                             | 验收第 1 条即为护栏，先测再改                                                  |
| 删除 GlobalUnlock 的暗色覆盖块引入回归 | 该块是唯一手写暗色适配                                                                 | 用计算值比对（渐变终点色）而非肉眼判断                                         |

---

## 八、被否决的方案

- **自造 `--jg-c-danger/warning/info/success` 全套令牌**：主题已有 red/yellow/blue/green 四色明暗双套，再造一套等于维护两份真相，且未来主题调色不会跟随。除非将来需要"语义 ≠ 主题色板"的映射（例如品牌色要复用给 danger），才值得引入别名层。本期不需要。
- **把品牌绿并入 `--vp-c-green-*`**：品牌绿 `#3eaf7c` ≠ 主题 green（`#30a46c`/`#298459`），且它在语义上是"品牌"不是"成功"，混用会让以后改品牌色时必须动主题色板。故单列 `--jg-c-brand`。
- **改主题源码去补 `--vp-c-danger*`**：会与主题升级冲突，且发现 C 已证明无必要。
