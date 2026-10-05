# 果园谜题 · Fruit Puzzle Garden 🍎

一套**水果主题的益智游戏合集**，纯前端实现：无依赖、无构建、可离线，同一份代码适配手机 / 平板 / 桌面 / 键盘 / 触屏。

> **当前形态：只做浏览器 / H5 版本。** 微信小程序版的代码已从本目录移除，仓库里只剩这一套 HTML 实现。
> 移植期间给核心层留下的两处**对 H5 也有益**的增强保留了下来：
> `gfx.polyfillCtx()`（老内核缺 `roundRect` / `ellipse` 时用 `arcTo` / `arc` 补齐）与
> `store.selfTest()`（控制台一行验证分享码编解码往返）。除此之外核心逻辑与原先一致。

```
fruit-puzzle-garden/
├─ index.html              入口（双击即可玩）
├─ 404.html                GitHub Pages 的兜底页（自动跳回首页）
├─ manifest.webmanifest    PWA 清单（可"添加到主屏幕"）
├─ sw.js                   离线缓存（仅在 http(s) 下生效）
├─ LICENSE                 MIT
├─ .gitignore
├─ publish.bat             双击即可发布（推荐）
├─ tool/
│  └─ publish.ps1          发布脚本本体（自动 init / 提交 / 推送）
├─ css/
│  ├─ base.css             设计令牌、按钮、吐司、弹窗、设置面板
│  ├─ layout.css           应用骨架与响应式断点
│  └─ games.css            模式卡片、虚拟方向键、游戏内细节
└─ js/
   ├─ core/
   │  ├─ util.js           数学 / 缓动 / 种子随机 / DOM / 事件总线 / 时间轴 / 设备探测
   │  ├─ i18n.js           中英双语词典与实时切换
   │  ├─ store.js          localStorage 存档、设置、最高分、分享码
   │  ├─ audio.js          WebAudio 程序化音效 + 循环背景音乐（零音频素材）
   │  ├─ canvas.js         HiDPI 自适应画布、绘制助手、粒子系统、渲染循环
   │  ├─ input.js          触摸滑动 / 点击 / 拖动 + 鼠标 + 键盘 + 虚拟方向键
   │  └─ ui.js             HUD、弹窗、吐司、设置面板、模式卡片
   ├─ games/
   │  ├─ g2048.js          果园 2048（滑动合并）
   │  ├─ match3.js         水果消消乐（交换消除 + 连锁 + 60 秒）
   │  └─ memory.js         记忆果园（翻牌配对）
   └─ main.js              应用外壳：主题、模式切换、存读档、结算流程、渲染循环
```

## 三种玩法

| 模式 | 玩法 | 计分 | 结束条件 |
| --- | --- | --- | --- |
| 🍎 **果园 2048** | 滑动/方向键让全部水果移动，相同水果相撞合并：🍇→🍒→🍓→🍑→🍊→🍋→🍏→🍐→🍍→🍉→🍎 | 每次合并得到新水果的点数 | 合成 🍎（可继续挑战）/ 无法移动 |
| 🍓 **水果消消乐** | 点击或拖动交换相邻水果，3 连及以上消除，落果补位可触发连锁 | 每格 30 分 ×（4 连 1.5 / 5 连 2）× 连锁倍率 | 60 秒倒计时结束 |
| 🧠 **记忆果园** | 翻两张牌，图案相同即配对（开局有 1.4 秒预览） | 每对 100 + 首翻奖励，通关再加时间奖励 | 全部配对 |

## 多终端适配

- **响应式布局**：`dvh` 全屏高度 + `env(safe-area-inset-*)` 刘海屏安全区；窄屏（≤380px）、横屏矮屏（≤520px）、平板（≥600px）、桌面（≥900px）分别调整密度与排版。
- **画布自适应**：按容器可用空间与设备像素比（1–2.5×）重建后备缓冲区，旋转屏幕 / 改窗口大小自动重排；棋盘尺寸在手机、平板、桌面上都有封顶，不会拉成巨屏。
- **输入三套并行**：
  - 触屏：滑动（2048）、点击与拖动交换（消消乐）、点按翻牌（记忆）；
  - 鼠标：同上，桌面端显示精细光标提示；
  - 键盘：`↑↓←→` / `WASD` 移动，`Enter`/`Space` 确认（消消乐与记忆有光标高亮），`P` 暂停，`U` 撤销，`H` 提示，`R` 重开，`1/2/3` 直接切换模式，`Esc` 返回 / 关闭弹窗。
  - 2048 在竖直屏幕上额外提供**虚拟方向键**，单手也能玩。
- **体感与系统集成**：`prefers-color-scheme` 深浅色、`prefers-reduced-motion` 降低动效、`navigator.vibrate` 震动反馈（默认关闭）、`navigator.share` 系统分享、PWA 可安装 + 离线可玩（Service Worker）。

## 特色功能

- **随时续玩**：每局自动存档，首页出现"继续上次"；切后台自动暂停，离开页面即时保存。
- **撤销与提示**：2048 支持撤销一步；消消乐在无解时自动重排并提示、可"提示"高亮可行的一步；记忆果园支持打乱未配对图案。
- **实时双语**：中文 / English 一键切换，界面与规则说明同步更新，语言默认跟随系统。
- **分享战绩**：把成绩编码进 URL（`#s=...`），发到另一台设备打开即可看到战绩并直接开始同一模式。
- **零素材**：所有音效由 WebAudio 实时合成（五声音阶，不刺耳），所有画面由 Canvas 程序化绘制，仅用系统 Emoji 作水果图标 —— 因此完全离线可用、体积极小。
- **图案兼容兜底（纯 Canvas 手绘，不依赖字体）**：水果图案**不用 Emoji 绘制**，而是由 `gfx.art()` 用 Canvas 图元手绘（苹果 / 橙子 / 柠檬 / 葡萄 / 草莓 / 桃子 / 梨 / 猕猴桃 / 樱桃 / 西瓜 / 香蕉 / 菠萝 共 12 种）。原因是在 **iOS「锁定模式 / 高级隐私保护」** 或被内置浏览器（WKWebView，如 QQ、微信）加载时，系统彩色 Emoji 字体被限制，所有水果字符会退化成**同一个单色回退字形**——实测表现为"记忆果园 24 张卡片长得一模一样"，游戏直接无法配对。手绘方案在锁定模式下同样正常。
- **相近水果的区分**：草莓与樱桃、桃子与橙子这类同色系水果，通过**形状轮廓 + 刻意拉开的配色**区分（草莓是带籽的圆润心形、樱桃是两颗果加交叉果柄、桃子有中缝、橙子有瓣纹……）。卡面上不叠加任何角标或符号，保持干净的水果外观。

## 在线试玩

> 🔗 **https://\<你的用户名\>.github.io/fruit-puzzle-garden/**
>
> 这是 GitHub Pages 地址（开启 Pages 后即为上面的形式，见「发布到公网」一节）。
> 手机浏览器打开即可玩，"添加到主屏幕"后会像 App 一样全屏运行，断网也能继续玩。

## 运行方式

**方式一：直接打开（最快）**

双击 `index.html`。所有脚本都是普通 `<script>`，`file://` 协议下也能正常运行（仅"离线缓存"与剪贴板分享受浏览器限制，游戏本体不受影响）。

**方式二：本地静态服务器（推荐，可用全部能力）**

```powershell
# 任选其一，在 D:\harness-game 目录下执行
python -m http.server 8080
npx serve .
```

然后浏览器访问 `http://localhost:8080`。此方式下 Service Worker 生效，可在手机上"添加到主屏幕"当作 App 使用。

## 发布到公网

本项目是**零构建的纯静态站点**，任何静态托管都能直接发布，全部资源都使用相对路径，因此放在子目录（如 `https://用户名.github.io/仓库名/`）也不会 404。

### 方案 A：GitHub + GitHub Pages（推荐，仓库与公网链接一次搞定）

**第 1 步 · 在 GitHub 建空仓库**

网页上点 **New repository** → 名称例如 `fruit-puzzle-garden` → **不要**勾选 README / .gitignore / License（保持空仓库）→ Create。

**第 2 步 · 推送代码**

仓库里已经备好了发布脚本（会自动 `git init` → 提交 → 推送）。选任意一种方式运行：

**方式 ①（最省事）**：直接**双击**项目根目录的 `publish.bat`，它会提示你粘贴仓库地址。
也可以在命令行带参数运行：

```bat
publish.bat -Repo https://github.com/<你的用户名>/fruit-puzzle-garden.git
```

**方式 ②**：用 PowerShell 运行脚本。注意 Windows 自带的 PowerShell 5.1 **没有** `pwsh` 命令（`pwsh` 是 PowerShell 7 的名字），所以要用 `powershell`：

```powershell
powershell -ExecutionPolicy Bypass -File tool\publish.ps1 -Repo https://github.com/<你的用户名>/fruit-puzzle-garden.git
```

> 如果你安装了 PowerShell 7，`pwsh -File tool\publish.ps1 -Repo <地址>` 同样可用。

首次推送会弹出登录：用户名填 GitHub 用户名，**密码位置填 Personal Access Token**（不是账号密码）。
Token 生成路径：GitHub → Settings → Developer settings → Personal access tokens → 勾选 `repo` 权限。

**常见报错对照**

| 报错 | 原因与解决 |
| --- | --- |
| `无法将"pwsh"项识别为 cmdlet…` | Windows 自带的是 PowerShell 5.1，用上面的 `powershell -ExecutionPolicy Bypass -File …`，或直接双击 `publish.bat` |
| `无法加载文件 … 未对文件进行数字签名` | 执行策略限制，给命令加上 `-ExecutionPolicy Bypass`（`publish.bat` 已内置） |
| `fatal: Authentication failed` | 密码位置要填 Personal Access Token，不是 GitHub 登录密码 |
| `fatal: remote origin already exists` | 脚本会自动改用 `set-url`；如手动操作则执行 `git remote set-url origin <地址>` |
| `Updates were rejected` | 远程已有提交，先 `git pull --rebase origin main` 再重推 |
| 推送成功但网页 404 | Pages 还没部署完（等 1~2 分钟），或 Settings → Pages 里分支/目录选错了 |

也可以手动执行等价命令：

```powershell
git init -b main
git add -A
git commit -m "feat: 果园谜题 H5 版"
git remote add origin https://github.com/<你的用户名>/fruit-puzzle-garden.git
git push -u origin main
```

**第 3 步 · 开启 Pages（只需一次）**

仓库 → **Settings → Pages** → Source 选 `Deploy from a branch` → Branch 选 `main`、目录选 `/ (root)` → **Save**。

等 1~2 分钟，访问：

```
https://<你的用户名>.github.io/<仓库名>/
```

之后每次更新只要重跑一次 `publish.ps1`，Pages 会自动重新发布。

> 仓库设置建议：About 里填一句简介并勾选 **Use your GitHub Pages website**，这样仓库首页就能直接点开玩；再加 Topics：`game` `canvas` `javascript` `puzzle` `2048` `match3` `no-dependencies` `offline`。

### 方案 B：其它静态托管（都不用改代码，拖拽或连仓库即可）

| 平台 | 操作要点 | 得到的链接 | 备注 |
| --- | --- | --- | --- |
| **Cloudflare Pages** | 连接 GitHub 仓库，Build command 留空，输出目录填 `/` | `xxx.pages.dev` | 免费、全球 CDN，国内通常比 GitHub Pages 稳 |
| **Vercel** | Import 仓库，Framework 选 Other，无需构建 | `xxx.vercel.app` | 免费额度够用，自动 HTTPS |
| **Netlify** | 直接把整个文件夹拖到 app.netlify.com/drop | `xxx.netlify.app` | 最快：不用 Git，拖完就有链接 |
| **Gitee Pages** | 推到 Gitee 后在服务里开启 Pages | `xxx.gitee.io/仓库名` | 国内访问快；需实名认证，免费版开启/更新要人工审核 |
| **腾讯云 EdgeOne Pages / 阿里云 OSS** | 上传静态文件 + 开启静态网站托管 | 绑定自定义域名 | 国内访问最快；用自有域名需备案 |
| **Surge.sh** | `npx surge` 首次注册后一条命令上线 | `xxx.surge.sh` | 临时演示、发给别人试玩很方便 |

> **关于国内访问**：GitHub Pages 在国内的连通性时好时坏（且页面内依赖的 Emoji 字体来自本机，不受影响）。如果要稳定服务国内用户，建议用 Cloudflare Pages 或国内对象存储 + 自定义域名。
>
> **关于自定义域名**：任何平台绑定自有域名都只需加一条 CNAME。**若服务器/存储在国内，需要先完成 ICP 备案**；用 GitHub Pages / Cloudflare 等境外节点则无需备案。

### 更新已发布的版本

Service Worker 采用"缓存优先 + 后台更新"，用户下次打开会自动拿到新版本。若想强制所有客户端立刻刷新缓存，把 `sw.js` 顶部的 `CACHE = 'fruit-puzzle-v3'` 版本号 +1 再推送即可。

### 手机端排查小抄

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 手机上水果图案变成空白/方块 | 个别较新的 Emoji（如 🫐🥭，Emoji 11.0）在旧系统字体里没有字形 | 已改用全平台通行的老 Emoji，并加了 `gfx.art()` 兜底：画不出就降级为同色圆点，不会留白 |
| 改完代码手机上还是旧样子 | Service Worker 缓存优先，可能仍命中旧缓存 | 下拉刷新一次；或 `sw.js` 里 `CACHE` 版本号 +1；也可在浏览器设置里清除该站点数据 |
| 完全没反应 | `file://` 下 Service Worker 不注册，属正常 | 用 http(s) 访问（Pages 链接本身即 https） |

## 上手试玩

打开浏览器控制台可用调试入口：

```js
FP.debug.state()        // 当前模式、屏幕状态、分数、棋盘
FP.debug.probe()        // 坐标自检：逻辑尺寸 vs 真实渲染尺寸（mismatch 必须为 false）
FP.debug.start('2048')  // 直接开始某个模式（2048 / match3 / memory）
FP.debug.move('left')   // 程序化走一步
FP.debug.save()         // 导出全部存档 JSON
```

深链：`index.html#g=match3` 直接进入消消乐；`index.html#s=<share>` 打开分享战绩。

### 坐标一致性约定（重要）

棋盘是 Canvas 绘制的，命中判定必须使用**画布逻辑坐标**，而浏览器事件给出的是**视口坐标**。两者一旦不一致，症状就是"点这里却动了那里"。

- 所有指针事件统一经 `app.toLocal(clientX, clientY)` 换算后再进入游戏逻辑（见各 `setupInput`）；
- 渲染前由 `surface.sync()` 每 6 帧对照 `getBoundingClientRect()` 自检，逻辑尺寸一旦偏离真实渲染尺寸立即纠正；
- 切换模式时若 `surface.aspect` 与游戏所需比例不符，会自动重新计算尺寸。

新增玩法时请沿用这三条，不要直接把 `clientX/clientY` 传给命中判定。

## 设计约定（便于二次开发）

- 每个模式的构造函数暴露同一套接口：`mount(ctx)`、`update(dt)`、`draw()`、`pause()`、`resume()`、`unmount()`、`snapshot()`，以及可选的 `onKey/undo/hint/shuffle`；`ctx` 提供 `{ ctx, surface, fx, inputTarget, fresh }`。新增模式只需在 `main.js` 的 `MODE_CTOR` 与 `FP.modes` 里登记。
- 画布坐标以 CSS 像素为单位，绘制前由 `surface.begin()` 统一套用 DPR 变换。
- 手感参数集中在 `app.speedScale()`（设置里的动画速度）与各模式的动画时长常量，便于统一调节。
- 所有存档写入 `localStorage`，键前缀 `fp.fruitpuzzle.v1.`；存储不可用时自动降级为内存模式（游戏仍可玩，只是关掉页面即丢失）。
