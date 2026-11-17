# Console Incremental (HTML)

由 C++ 控制台增量游戏 `ConsoleIncremental` 移植而来的网页版本。纯静态，双击 `index.html` 即可运行，无需构建或服务器。

## 已移植功能

- 欢迎 → 玩家名输入（已有存档提示）→ 槽位选择（5 槽位）→ 选小游戏 → 命令行
- 虚拟路径系统：`cd` / `~` / `show` / `tree` / 快捷跳转（info/res_a/buff_a/upg_a/rst_a/ach/atb/aux）
- 资源 `a` 实时增长、增长率公式（乘子 Π + 加数 Σ）、科学计数法与峰值统计
- 购买项 Ba1-1 / Ba1-2 / Ua1-1 / Ua1-2，Func25 实时配色（可购买价绿、已购编号绿、资源名加粗）
- 命令补全（Ax4）、语法高亮（Ax12）、资源名加粗（Ax13）、预计倒计时（Ax2）、批量执行（Ax15）
- 资源增长曲线（rishow_a / Ax6）、美化文件夹树（Ax7）
- 存档：多存档多槽位、加密、导入导出、离线进度；dev 模式（密码校验）
- 背景音乐：HTML5 Audio 播放 7 首曲目，列表 / 单曲 / 随机模式、音量、底栏状态
- 独立浮层窗口：滚动新闻（Ax/ Func21）、分屏终端（Ax11）、游戏外购买提醒（Ax9，虚拟标题栏可拖动、关闭无效）
- 自定义命令（Ax10，cmd.add/del/list）、Ax1–Ax16 辅助功能开关

## 运行

用浏览器打开 `index.html`。首次进入输入玩家名，选槽位与游戏后进入命令行；输入 `help` 查看命令分类。

## 目录

- `index.html` — 入口
- `css/style.css` — 视觉样式（深底 + 皇家蓝/水蓝主题）
- `js/core.js` — 内核（状态、购买、路径、存档、数字格式化）
- `js/terminal.js` — 模拟终端（历史、live 行、输入、补全）
- `js/audio.js` — 背景音乐
- `js/windows.js` — 浮层窗口（新闻/分屏/提醒）
- `js/main.js` — 流程与命令分发
- `assets/audio/` — 音乐文件

## 来源

原 C++ 源码位于相邻目录 `../ConsoleIncremental`（不在本仓库内），移植参考其中的 `main.cpp`、`save_manager.h`、`audio_player.cpp`、`news_window.cpp`、`split_window.cpp`、`toast_window.cpp` 及策划案 `doc/Console Incremental策划案.docx`。

## 与原版的差异

- 用浏览器 `<audio>` 替代 Media Foundation；FLAC 曲目在不支持的浏览器上会自动跳到下一首。
- 存档由加密 `.dat` 文件改为浏览器 localStorage（同样加密）；导入/导出落在浏览器本地键下。
- 多窗口由 Win32 弹窗改为 DOM 浮层，虚拟标题栏保留“关闭键无效、可拖动”的行为。
