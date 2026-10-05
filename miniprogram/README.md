# 果园谜题 · 微信小程序版

这是网页版（`../`）的小程序移植版。**三个玩法的核心算法是同一份代码**，只把渲染、输入、存储、音效、UI 换成了小程序实现。

## ⚠️ 先做一步：同步可移植层

微信只打包项目目录内的文件，所以 `miniprogram/js/` 需要一份网页版源码的副本。  
**首次使用（或改了网页版玩法逻辑后）请执行一次同步**：

```bat
:: 双击运行，或在命令行执行
tool\sync-portable.bat
```

它会把这 8 个文件从 `js/` 复制到 `miniprogram/js/`（两端内容完全一致）：

```
core/util.js  core/i18n.js  core/store.js  core/audio.js  core/canvas.js
games/g2048.js  games/match3.js  games/memory.js
```

> 当前仓库里已经放好了 `core/util.js`、`core/i18n.js`、`core/store.js`、`core/canvas.js`，  
> **`games/` 下的三个玩法文件请运行一次上面的脚本补齐**（它们与网页版逐字一致）。  
> PowerShell 用户也可以用 `pwsh -File tool/sync-portable.ps1`。
>
> 想彻底免维护，可在 Windows 上改用目录联接：
>
> ```bat
> rmdir /s /q miniprogram\js
> mklink /J miniprogram\js js
> ```

补完后的目录结构：

```
miniprogram/
├─ project.config.json     开发者工具项目配置（appid 为 touristappid，可直接导入体验）
├─ app.json / app.js       页面注册、全局初始化（i18n、主题、模式表）
├─ app.wxss                设计令牌与通用样式（与网页版视觉一致）
├─ theme.json              原生组件深浅色变量
├─ sitemap.json
├─ core-mp/                只在小程序里用的适配层
│  ├─ canvas-mp.js         微信 2D canvas -> 与浏览器一致的 surface + 渲染循环
│  ├─ input-mp.js          touchstart/move/end -> 与浏览器一致的手势回调
│  └─ ui-mp.js             吐司 / 弹窗（setData 驱动）
├─ pages/
│  ├─ index/               首页：模式选择、设置、玩法、分享
│  └─ game/                游戏页：HUD + 画布 + 控制栏 + 结算
└─ js/                     ← 由 tool/sync-portable.bat 从网页版同步
   ├─ core/                util / i18n / store / audio / canvas（双端同跑）
   └─ games/               g2048 / match3 / memory（零改动）
```

## 怎么跑起来

1. 打开 **微信开发者工具** → 导入项目 → 目录选 `D:\harness-game\miniprogram`；
2. AppID 选「测试号」或直接使用配置里的 `touristappid`（游客模式）；
3. 编译即可，首页三个模式卡片都能进。

调试建议：

- 基础库请选 **≥ 2.9.0**（`canvas type="2d"` 与 `requestAnimationFrame` 需要）；
- 真机预览比模拟器更接近实际手感（模拟器的触摸事件时序与真机不同）；
- 控制台可跑 `FP.store.selfTest()` 验证分享码编解码往返是否正常。

## 网页版 → 小程序：哪些复用、哪些重写

| 模块                                              | 处理方式        | 说明                                                                                                                                  |
| ----------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `js/games/g2048.js`、`match3.js`、`memory.js`     | **原样复用**    | 纯逻辑 + Canvas 2D 绘制，不含任何 DOM API                                                                                                     |
| `js/core/util.js`                               | 复用 + 环境分支   | 新增 `env` 判定、小程序设备信息、震动映射；DOM 助手在无 `document` 时安全返回                                                                                  |
| `js/core/i18n.js`                               | 复用 + 少量改动   | 去掉对 `<html lang>` 的强依赖；新增 `pick(prefixes)` 方便页面批量取词                                                                                 |
| `js/core/store.js`                              | 复用 + 后端替换   | 存储后端在 `localStorage` 与 `wx.*StorageSync` 之间切换；base64 改为自带实现（小程序没有 `btoa`）                                                           |
| `js/core/canvas.js`                             | 复用 + 补齐     | 新增 `polyfillCtx()`：老内核/小程序缺 `roundRect`、`ellipse` 时用 `arcTo`/`arc` 补齐；`createSurface/createLoop` 在小程序里由 `core-mp/canvas-mp.js` 覆盖实现 |
| `js/core/audio.js`                              | 复用 + 降级     | 小程序没有 WebAudio，`supported` 为 false 时所有音效调用变为空操作，游戏不受影响                                                                              |
| `js/core/ui.js`、`js/core/input.js`、`js/main.js` | **不移植**     | 被 `core-mp/*` 与 `pages/*` 取代                                                                                                        |
| 主题令牌（TOKENS）                                    | 搬到 `app.js` | 玩法绘制代码通过 `FP.theme.tokens()` 取色，保持一致                                                                                                |

## 移植时真正要处理的三件事

### 1. 坐标换算（最容易出错的地方）

小程序触摸事件给的是**视口坐标**，而玩法内部用的是**画布逻辑坐标**。网页版靠 `getBoundingClientRect()` 换算；小程序里：

1. `canvas-mp.js` 用 `wx.createSelectorQuery().boundingClientRect()` 量出画布位置；
2. `surface.toLocal(clientX, clientY)` 做统一换算；
3. `input-mp.js` 的 `setToLocal()` 把这个函数注入手势识别器，玩法里的 `onTap/onSwipe/onDragEnd` 拿到的就已经是画布坐标。

**并且**：画布的像素尺寸由 JS 精确设置（`canvas.width = cssW * dpr`），不用 CSS 拉伸，这样"量到的尺寸 = 绘制坐标系的尺寸"，不会出现点了别处的情况。

### 2. 渲染循环

小程序的 `canvas.requestAnimationFrame` 挂在 canvas 节点上，而且**页面隐藏后不会自动暂停**。所以：

- `MP.createLoop()` 优先用节点上的 rAF，取不到就退回 `setTimeout(16)`；
- `onHide` 里主动 `stop()` 并自动暂停游戏，`onShow` 里恢复；
- 单帧 `dt` 上限 50ms，避免切回前台时动画瞬移（与网页版同一套规则）。

### 3. UI 与交互的等价物

| 网页版                                     | 小程序版                                       |
| --------------------------------------- | ------------------------------------------ |
| `pointerdown/move/up` + pointer capture | `bindtouchstart/move/end/cancel`           |
| 键盘方向键 / WASD                            | 删除；保留页面内虚拟方向键（WXML 按钮，比 Canvas 内自绘更省事）     |
| DOM 吐司 / 弹窗                             | `setData` 驱动的 `.toast` / `.modal-root`     |
| CSS 媒体查询自适应                             | `wx.createSelectorQuery` 实测可用空间 + rpx 固定占位 |
| Service Worker 离线                       | 小程序天然离线                                    |
| URL 分享码 `#s=`                           | 页面参数 `?s=`（`onShareAppMessage` 里带 `path`）  |
| 震动 `navigator.vibrate`                  | `wx.vibrateShort / vibrateLong`            |

## 已知限制

- **音效为静音**：小程序没有 WebAudio，网页版那套"程序化音效"无法照搬。要加音效需要准备音频文件并用 `wx.createInnerAudioContext()` 播放；如需背景音乐同理（且音频播放受系统静音键影响）。
- **横屏**：`app.json` 未开启 `pageOrientation`，当前以竖屏为设计基准；如需横屏需额外适配布局。
- **深度链接**：小程序不能从外部用 URL 直接唤起指定页面，分享码只能通过 `onShareAppMessage` 的 `path` 或剪贴板（`?s=`）传递。
- **音频/分享等能力**：部分接口在开发工具里表现与真机不同，需真机验证。

## 上线前需要注意（非技术部分）

1. **AppID**：需要注册小程序并替换 `project.config.json` 里的 `touristappid`；
2. **服务类目**：游戏类小程序需选择游戏类目，通常要求提供 **计算机软件著作权登记证书**等资质，且游戏类目多为企业主体 —— 这一步建议先在 `mp.weixin.qq.com` 确认当前政策，再决定是否走"工具类"还是"游戏类"；
3. **内容合规**：游戏内不含用户生成内容、不含社交与支付，审核风险较低，但仍需填写隐私协议（本项目只在本地存储游戏进度与最高分，不上传任何数据）；
4. **`miniprogram/` 与网页版共用源码**：`miniprogram/js/` 是从网页版复制同步的。若你后续在网页版里改了玩法逻辑，记得同步这两个目录（也可以把 `js/` 改成软链接或构建时复制）。

## 如果要做成「小游戏」（wx 的 game 模式）

本移植是**小程序**形态（WXML + Canvas）。若要做成 `wx` 的**小游戏**（纯 Canvas、`game.js` + `wx.createCanvas()`），核心逻辑同样可以直接复用，但需要替换：

- 页面系统 → 自绘 UI（本项目的三个玩法本来就是 Canvas 绘制，UI 需要自己画）；
- `wx.createSelectorQuery` 尺寸测量 → `wx.getSystemInfoSync()` + 全屏 canvas；
- 触摸事件 → `wx.onTouchStart/Move/End`（全局事件，无 DOM 元素）；
- 该形态对类目与资质的要求更严格（游戏类目 + 版号/软著），建议先确认资质再投入。
