# UI 升级 L2：动效编排层 — 设计与实施计划

> 阶段：设计（待批准后进入实施）
> 上游：L0 地基、L1 暗色完整化均已完成并验证
> 前置约定：令牌前缀 `--jg-*` 声明在 `docs/.vuepress/styles/palette.scss`；复合值（阴影、cubic-bezier）必须写成带引号字符串；样式注入只认 `config.scss` / `palette.scss` / `index.scss` 三个文件。
> 用户决策（2026-10-02）：从"动效编排层"推进。

---

## 一、本期目标与边界

L0 收敛了**过渡**（把 `margin/padding/width` 从 transition 里摘掉，只留合成友好的 `transform/opacity`），并建立了 `--jg-dur-*` / `--jg-ease-*`。但 L0 只解决了"过渡不该过渡什么属性"，**没解决动效的刻度语义**——因为当时的目标是地基，不是动效。

L1 收尾时留下一个明确线索：`GlobalUnlock.vue` / `LayoutToggle.vue` 仍写着 `transition: all`。

本期要解决三件事：

1. **动效令牌按语义分档**，而不是把所有时长硬塞进一条刻度（见第三节，这是本期核心设计判断）。
2. **消除同一视觉语言的两份实现**（shake 关键帧重复）、消除 `transition: all`、补齐缺失的缓动声明。
3. **（已决策：采纳 A 克制版）**引入站点级"进场编排"：仅正文图片与表格做滚动揭示，见第五节与 Step 8。

**不做**：不动布局、不改配色、不引入第三方动效库（延续"自研零依赖"）、不重写 L0 已定稿的沉浸模式位移。

---

## 二、现状实测（证据）

### 2.1 动画时长：5 处落在刻度之外

| 位置                    | 值                        | 语义                           |
| ----------------------- | ------------------------- | ------------------------------ |
| `LazyMermaid.vue:111`   | `0.8s linear infinite`    | spinner 转速（**循环**）       |
| `GlobalUnlock.vue:431`  | `0.45s` + 裸 cubic-bezier | 密码错误抖动（**一次性反馈**） |
| `UnlockContent.vue:211` | `0.5s` + 裸 cubic-bezier  | 同上                           |
| `DocEditor.vue:628`     | `0.22s`                   | 抽屉进场                       |
| `DocEditor.vue:756`     | `0.25s`                   | toast 升起                     |

现有刻度只有 `--jg-dur-sm`(0.15s) / `-md`(0.2s) / `-lg`(0.3s)。

**为什么不能一律归一化**：这五处里只有后两处是"过渡"语义（一次性进场，0.22→0.2、0.25→0.2 的差值肉眼不可辨，归一化安全）；spinner 的 0.8s 是**转速**，shake 的 0.45/0.5s 是**需要被看见的强调反馈**——把 shake 压到 0.3s，抖动幅度还没走完就结束了，等于削弱语义。

### 2.2 同一视觉语言的两份实现

`.shake-enter-active` + `@keyframes shake` 在 `GlobalUnlock.vue:430-450` 与 `UnlockContent.vue:210-230` 各写了一份，差异仅时长（0.45 vs 0.5）、位移（-3px vs -4px），缓动曲线**逐字符相同**（`cubic-bezier(0.36, 0.07, 0.19, 0.97)`）。

> 补充事实：这两个组件目前**无任何页面使用**（L1 已查证：`GlobalUnlock` 未被 import，`UnlockContent` 无 markdown 引用）。所以收敛它们的**当前线上影响为 0**，属于"防止后续启用时两套观感打架"。

### 2.3 `transition: all` 残留 ×2

| 位置                   | hover 实际变化的属性                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| `LayoutToggle.vue:110` | `color` / `border-color` / `transform`（另 `.is-hidden` 改 `background`） |
| `GlobalUnlock.vue:297` | `transform` / `box-shadow`                                                |

`transition: all` 会让浏览器监听**全部**属性（含 `margin/padding` 这类触发布局的），与 L0 的收敛方向相悖。

### 2.4 一处缓动缺失

`NewPageDialog.vue:558`：`transition: border-color var(--jg-dur-sm);` —— 未声明 easing。浏览器按 `ease` 兜底，数值恰好与 `--jg-ease-standard`(ease) 相同，**故无视觉差异**，但语义上少了一档，属不一致。

### 2.5 既有约束（必须尊重，不是问题）

- **reduced-motion 已很扎实**：`styles/index.scss:129-143` 用 `html *, html *::before, html *::after` 全覆盖兜底，并把 `animation-iteration-count` 压到 1（停掉 infinite spinner）。本期任何新增动效**自动被它兜住**，无需重复声明。
- **FontSwitch 刻意不用 `<Transition>`**（`FontSwitch.vue:29-33` 有明确注释）：`<Transition>` 依赖 rAF 推进，后台标签页/无头环境 rAF 被节流会让面板卡在透明态；改用 CSS animation 后，"动画被节流时面板仍保持自然可见"。→ **本期的编排方案必须坚持"CSS animation 优先"，不得用依赖 rAF 推进的 JS 动画。**

---

## 三、核心设计：动效令牌按语义分档

现在的单一刻度是"过渡刻度"。正确做法是按**动效的语义角色**分档：

| 档位 | 令牌                | 语义                                      | 取值                  | 判据                         |
| ---- | ------------------- | ----------------------------------------- | --------------------- | ---------------------------- |
| 过渡 | `--jg-dur-sm/md/lg` | 状态切换，**双向可逆**（hover/展开/抽屉） | 0.15/0.2/0.3s（已有） | 用户触发、可被打断、常态存在 |
| 强调 | `--jg-dur-emphasis` | 一次性反馈，**需要被看见**（错误抖动）    | 0.45s                 | 单向、一次性、幅度需走完     |
| 循环 | `--jg-dur-loop`     | 持续动画周期（spinner **转速**）          | 0.8s                  | 与真实时间挂钩，非"过渡"     |

缓动同理补一档：

| 令牌                   | 取值                                           | 出处 / 用途                |
| ---------------------- | ---------------------------------------------- | -------------------------- |
| `--jg-ease-standard`   | `ease`（已有）                                 | 通用过渡                   |
| `--jg-ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)`（已有）           | 同处时长下更利落的强调     |
| `--jg-ease-decelerate` | `cubic-bezier(0.36, 0.07, 0.19, 0.97)`（新增） | 抖动曲线，现被两处裸写重复 |

> **0.45s 而非 0.5s 的取舍**：两组件分别用 0.5s / 0.45s。本期取 0.45s 作为统一档位（较短者，抖动过快会看不清、过慢显拖沓；0.45 已在两个既有取值之间且更接近"利落"）。因两组件当前均未启用，此选择无线上影响。

---

## 四、实施步骤

### Step 1 — `palette.scss`：补 3 个动效令牌

新增 `$jg-dur-emphasis`(0.45s)、`$jg-dur-loop`(0.8s)、`$jg-ease-decelerate`（带引号字符串）。同步更新文件顶部"令牌清单"注释（L0 已把该维护要求写进注释）。

### Step 2 — `styles/index.scss`：全局收敛 shake

新增**全局** `@keyframes jg-shake` + 工具类 `.jg-anim-shake`（时长/曲线走新令牌），在注释里写明"两处解锁组件共用，避免各自维护"。

> 放在全局层的原因：SFC scoped 样式里的 `@keyframes` 会被 Vue 重命名加 scope 后缀，无法跨组件共享；要共享必须落在非 scoped 的 `index.scss`。

### Step 3 — 消除 `transition: all`（2 处）

按 2.3 表格枚举真实变化的属性。

### Step 4 — 归一化"过渡"语义的刻度外时长（2 处）

`DocEditor.vue:628` 0.22s → `var(--jg-dur-md)`；`:756` 0.25s → `var(--jg-dur-md)`。

### Step 5 — 接线强调/循环档（3 处）

`LazyMermaid.vue:111` → `var(--jg-dur-loop)`；两处 shake → `var(--jg-dur-emphasis)` + `var(--jg-ease-decelerate)`（并删除各自的 `@keyframes` 副本，改用 `.jg-anim-shake`）。

### Step 6 — 补缓动（1 处）

`NewPageDialog.vue:558` 补 `var(--jg-ease-standard)`。

### Step 7 — 验收与归档

浏览器实测令牌取值 + 强制编译检查注入 CSS + `pnpm docs:build`；归档新建 `doc/dev-report/05-UI风格升级L2-动效编排层-设计与实施记录.md`。

---

## 五、（待决策）是否引入站点级"进场编排"

前三步是**纯收敛**（无新视觉、零风险）。这一段是**有感知的新动效**，需要你先拍板。

**先说清楚风险**：本站是**文档站**，核心场景是长文阅读。滚动揭示（scroll reveal）在营销页是加分项，在文档站是**双刃剑**——内容"边滚边浮出来"会增加视觉噪声、拖慢扫读，主流文档站（Vite / Stripe / MDN）的正文基本**不做**滚动揭示。所以我不建议全站铺开。

| 方案                    | 做法                                                                                                                         | 利                                                               | 弊                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **A. 克制版（推荐）**   | 仅对正文里的**图片 / 表格 / 代码块**（不与文字段落做动画）做"进视野淡入 + 8px 上浮"，`IntersectionObserver` 一次性触发后断开 | 有"活起来"的观感又基本不干扰阅读；触发一次即销毁，长文无持续开销 | 需写少量 JS；与主题 TOC 的滚动监听并存需留意                            |
| **B. 纯 CSS 版**        | `animation-timeline: view()` 滚动驱动，零 JS                                                                                 | 无 JS、无观察器开销                                              | 浏览器支持有限（Chrome 115+ / Safari 26+），需 `@supports` 回退；调试难 |
| **C. 只做路由切换编排** | 页面切换时内容淡入上浮，正文内部不做任何滚动动画                                                                             | 完全不干扰阅读；切页有整体感                                     | 观感提升最弱                                                            |
| **D. 本期不做**         | 只交付第四节                                                                                                                 | 零风险、纯地基                                                   | "编排层"名不副实，留待 L3                                               |

**我的建议**：先做 A（克制版），但**只覆盖图片与表格**、代码块因高度大易引起布局位移而排除；且全程受 reduced-motion 兜底。

> **已决策（2026-10-02）：采纳方案 A（克制版）**，范围收窄为**仅正文图片与表格**：进视野时淡入 + `translateY(8px)` 上浮，`IntersectionObserver` 触发一次后立即 `disconnect()`。排除：代码块（高度大、易引起观感位移）、文字段落（干扰扫读）、标题（与 TOC 高亮语义重叠）。

---

## 六、验收标准

1. 新增 3 个令牌在浏览器 `getComputedStyle` 中明暗两态均非空（`--jg-dur-emphasis` → `0.45s`、`--jg-dur-loop` → `0.8s`、`--jg-ease-decelerate` → 目标 cubic-bezier）。
2. 全站 `transition: all` 命中数为 **0**（L1 收尾时为 2）。
3. `@keyframes shake` 自研副本命中数为 **0**（收敛为全局 `jg-shake` 单份）。
4. 改过的组件里，动画/过渡语法糖中的 duration 与 easing **不再出现刻度外字面量**（spinner 转速走 `--jg-dur-loop`，抖动走 `--jg-dur-emphasis`）。
5. reduced-motion 下新动效同样被兜住（实测 `animation-duration` ≈ 0.01ms）。
6. 若采纳第五节方案：正文章节在暗色/明色下滚动揭示不产生横向溢出、不引起明显布局位移（CLS 目测无跳动）。
7. `pnpm docs:build` 构建成功。

---

## 七、风险与对策

| 风险                               | 说明                                                                   | 对策                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 归一化 0.22/0.25 → 0.2 改变观感    | 差 0.02/0.05s                                                          | 差值小于人眼可辨阈值；截图对比抽屉/toast 进场，异常即回退为专用令牌              |
| 全局 `.jg-anim-shake` 污染全局命名 | 引入新的全局类名                                                       | 用 `jg-` 前缀命名空间 + 注释说明归属；`jg-shake` 为全局共享类                    |
| 滚动揭示引起布局位移               | 上浮 8px 若用 `translateY` 不影响布局流，但 `opacity` 变化可能造成"闪" | 只用 `transform`+`opacity`（合成层属性），不碰 `height/margin`；先在单页验证 CLS |
| 与主题 TOC 滚动监听打架            | 主题监听滚动更新目录高亮                                               | 编排只**读**可见性、不写滚动位置；不改 `scroll-behavior`                         |
| 死代码组件改动无验证途径           | 两解锁组件无页面使用                                                   | 沿用 L1 的"强制编译 + 读注入 CSS"验收路线                                        |

---

## 八、参考示范（关键片段）

仅给关键片段与取舍说明，不给完整补丁。

**令牌（palette.scss）**

```scss
// 强调型：一次性反馈（错误抖动）。需要被"看见"，不压进过渡刻度
$jg-dur-emphasis: 0.45s;
// 循环型：持续动画周期（spinner 转速），与真实时间挂钩
$jg-dur-loop: 0.8s;
// 抖动减速曲线（原先在两处组件里逐字符重复）
$jg-ease-decelerate: "cubic-bezier(0.36, 0.07, 0.19, 0.97)";
```

**全局抖动（styles/index.scss）**

```scss
// 锁屏组件的密码错误反馈。原为两份副本（0.45s/-3px、0.5s/-4px），此处收敛为一份。
// 放在全局层而非 SFC：scoped 样式的 @keyframes 会被 Vue 加 scope 后缀，无法跨组件共享。
@keyframes jg-shake {
  10%,
  90% {
    transform: translate3d(-1px, 0, 0);
  }
  20%,
  80% {
    transform: translate3d(2px, 0, 0);
  }
  30%,
  50%,
  70% {
    transform: translate3d(-3px, 0, 0);
  }
  40%,
  60% {
    transform: translate3d(3px, 0, 0);
  }
}

.jg-anim-shake {
  animation: jg-shake var(--jg-dur-emphasis) var(--jg-ease-decelerate) both;
}
```

**枚举属性（LayoutToggle.vue，替换 `transition: all`）**

```scss
// 只过渡真实变化的属性：hover 改 color/border-color/transform，
// .is-hidden 改 background。写 all 会让浏览器监听全部属性（含触发布局的），与 L0 收敛方向相悖。
transition:
  color var(--jg-dur-lg) var(--jg-ease-standard),
  background-color var(--jg-dur-lg) var(--jg-ease-standard),
  border-color var(--jg-dur-lg) var(--jg-ease-standard),
  transform var(--jg-dur-lg) var(--jg-ease-standard);
```

---

## 九、已决策（2026-10-02）

1. **第五节编排方案：采纳 A（克制版）**，范围收窄为仅正文图片与表格，触发一次即断开。
2. **shake 收敛：统一为 0.45s**（`--jg-dur-emphasis`），两份自研 `@keyframes shake` 副本合并为全局 `jg-shake` 单份。

### 据此细化的 Step 8 — 进场编排（方案 A）

- 新增 `docs/.vuepress/components/RevealOnScroll.vue`（或等价的最小实现）作为 rootComponent；
- 目标选择器限定 `#markdown-content img` 与 `#markdown-content table`；
- 初始态 `opacity: 0; transform: translateY(8px)`，进视野加 `.is-revealed` 过渡到自然态；**只动 `transform` / `opacity`**，不碰 `height/margin/padding` 以规避 CLS；
- 触发后 `observer.disconnect()`（或 `unobserve`），长文无持续开销；
- 路由切换后需重新扫描（`router.afterEach`）；组件卸载时 `disconnect()`；
- 新样式放入 `styles/index.scss` 或组件 scoped 块，需受既有 reduced-motion 全覆盖兜底约束。
