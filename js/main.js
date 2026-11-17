/* Console Incremental — 主程序：命令分发 + 游戏循环
 * 移植自 C++ main.cpp 的 executeCommand / showLeaf / showDir / 主循环。
 */
(function (global) {
  'use strict';
  var INC = global.INC;
  var core = INC.core, term = INC.term;
  var C = core.C, css = core.css, seg = term.seg;

  var G_SPARK = '◆', G_BULLET = '▸', G_DOT = '●';
  var VERSION = '0.0.1-alpha';

  var state = core.createState();
  var playerName = 'Player';
  var tutorialOn = true;
  var tutorialStage = 0;
  var lastTick = performance.now();

  // ---- 目录内容渲染（对应 showLeaf / showDir / showDirAuto）----
  function showLeaf(path) {
    if (path === '~\\game1-xri\\information') {
      term.push([seg('当前存档信息：', C.PaleYellow)]);
      term.push([seg('  存档名：' + playerName, C.Front)]);
      var playSecs = 0;
      var t0 = core.parseTime(state.createdTime);
      if (!isNaN(t0)) playSecs = (Date.now() - t0) / 1000;
      term.push([seg('  游玩总时间：' + core.formatDuration(playSecs), C.Front)]);
      term.push([seg('  资源 a 历史最大数量：' + core.fmtNum(state.maxAmountA), C.Front)]);
      term.push([seg('  槽位：本地单槽存档' + (core.hasSave() ? '（已有数据）' : '（尚无数据）'), C.Gray)]);
    } else if (path === '~\\game1-xri\\a\\a_resource') {
      // 两条 live 行：数字每帧实时刷新
      term.push([seg('资源状态：', C.PaleYellow)]);
      term.pushLive(function () {
        return [seg('  资源 a   : ', C.Front), seg(core.fmtNum(state.a.amount), C.BrightWhite)];
      });
      term.pushLive(function () {
        return [seg('  速度     : +', C.Front), seg(core.fmtNum(state.a.rate) + '/s', C.Front)];
      });
    } else if (path === '~\\game1-xri\\a\\a_buff' || path === '~\\game1-xri\\a\\a_upgrade') {
      term.push([seg(path.indexOf('a_buff') >= 0 ? 'a 类可重复购买的购买项：' : 'a 类升级信息：', C.PaleYellow)]);
      var items = core.BUY_ITEMS.filter(function (it) { return it.path === path; });
      items.forEach(function (it) {
        term.pushLive(function () { return core.buyItemSegments(it, state); });
      });
      if (!items.length) term.push([seg('  暂无购买项。', C.Gray)]);
    } else if (path === '~\\game1-xri\\a\\a_reset') {
      term.push([seg('a 类声望层（层级重置）信息：', C.PaleYellow)]);
      term.push([seg('  暂无重置内容。', C.Gray)]);
    } else if (path === '~\\game1-xri\\achievement') {
      term.push([seg('成就：', C.PaleYellow)]);
      term.push([seg('  暂无成就。', C.Gray)]);
    } else if (path === '~\\game1-xri\\automation\\autobuyer') {
      term.push([seg('自动购买器（存于 ~\\game1-xri\\automation\\autobuyer）：', C.PaleYellow)]);
      term.push([seg('  暂无自动购买器。（首个自动购买项 Aa1-1 待实现）', C.Gray)]);
    } else if (path === '~\\game1-xri\\auxiliary') {
      term.push([seg('辅助功能（以下功能可用命令控制开启/关闭）：', C.PaleYellow)]);
      Object.keys(core.AX_LABELS).forEach(function (id) {
        term.pushLive(function () { return core.auxiliaryLineSegments(state, id); });
      });
      term.blank();
      term.push([seg('用法：在 aux 目录下输入  AxN on  或  AxN off  切换开关。', C.Gray)]);
    } else {
      term.push([seg('（空目录）', C.Gray)]);
    }
  }

  function showDir(path) {
    var children = core.getChildren(path);
    if (children.length) {
      term.push([seg('目录 ' + path, C.PaleYellow)]);
      term.push([seg('包含文件夹：', C.Gray)]);
      children.forEach(function (c) { term.push([seg('  ' + c, C.Front)]); });
    } else {
      showLeaf(path);
    }
  }
  function showDirAuto(path) {
    if (core.getChildren(path).length) { showDir(path); return; }
    if (!state.auxOn.Ax3) {
      term.push([seg('（Ax3 已关闭，未自动显示该目录内容；输入 show 查看）', C.Gray)]);
      return;
    }
    showDir(path);
  }
  function navigateTo(path) {
    state.cwd = path;
    term.push([seg('已到达 ' + path, C.PaleGreen)]);
    showDirAuto(path);
    updatePrompt();
  }
  function printTree(path, indent, isLast) {
    var dirs = core.getChildren(path);
    var canon = core.stripGame1Xri(path);
    var items = core.BUY_ITEMS.filter(function (it) { return it.path === path || it.path === canon; })
      .map(function (it) { return it.id + '：' + it.content + it.effect(state); });
    var total = dirs.length + items.length, idx = 0;
    dirs.forEach(function (d) {
      var last = (++idx === total);
      term.push([seg(indent + (last ? '└── ' : '├── ') + d, C.Front)]);
      printTree(path + '\\' + d, indent + (last ? '    ' : '│   '), last);
    });
    items.forEach(function (s) {
      var last = (++idx === total);
      term.push([seg(indent + (last ? '└── ' : '├── ') + s, C.Front)]);
    });
  }

  // ---- 帮助 ----
  function help() {
    term.box(' HELP ', [
      seg(G_BULLET + ' c -basic   查看基本命令', C.Front),
      seg(G_BULLET + ' c -save    查看存档相关命令', C.Front),
      seg(G_BULLET + ' c -action  查看游戏操作相关命令', C.Front),
      seg(G_BULLET + ' c -music   查看音乐相关命令', C.Front),
      seg(G_BULLET + ' c -others  查看其他命令', C.Front),
      seg(G_BULLET + ' c -dev     查看dev命令', C.Front)
    ], { color: C.AquaSky, width: 40 });
    term.push([seg('输入以上命令之一以查看该分类下的全部命令。', C.PaleYellow)]);
  }
  var HELP_CATS = {
    'c -basic': [
      'help            查看所有命令及功能', 'tutorial on/off 教程开关',
      'version         查看游戏版本', 'save.info       查看当前存档信息',
      'slot.info       查看当前存档槽位信息', 'game.info       查看当前的小游戏信息',
      'color           改变颜色', 'news on/off     新闻开/关'
    ],
    'c -save': [
      'save            手动保存', 'save.hardreset  清除当前存档数据',
      'slot.hardreset  清除当前存档槽位数据', 'save.info       查看存档信息',
      'export save -p  导出存档', 'import save -p  导入存档',
      'export slot -p  导出槽位', 'import slot -p  导入槽位', 'olpg on/off     离线进度开关'
    ],
    'c -action': [
      'cd <路径>       切换目录（~ 返回根）', '~               返回根目录',
      'show            显示当前目录内容', 'tree            显示文件夹树',
      'res_a/buff_a/upg_a/rst_a  快捷跳转', 'info/ach/atb/aux 快捷跳转',
      'AxN on/off      开关辅助功能（需在 aux 目录）', 'warn -min=N     调节提醒间隔'
    ],
    'c -music': [
      'music           查看音乐列表', 'music.p=N       播放第 N 首',
      'music.mode=...  播放模式', 'music on/off    音乐开关', 'vol +/-         音量调节'
    ],
    'c -others': ['date            显示日期', 'time            显示时间', 'echo <文字>     回显文字'],
    'c -dev': ['dev.start       进入开发者模式', 'res_a=<数值>    设置资源 a 数量（dev 模式）']
  };
  function helpCat(cat) {
    var lines = HELP_CATS[cat] || [];
    term.box(' ' + cat.toUpperCase() + ' ', lines.map(function (l) { return seg(l, C.Front); }),
      { color: C.AquaSky, width: 46 });
  }

  // ---- 购买 ----
  function buy(it, times) {
    times = times || 1;
    var done = 0;
    for (var k = 0; k < times; k++) {
      var cnt = core.buyCount(state, it.id);
      var price = core.buyPriceBase(it, cnt);
      if (state.a.amount >= price) {
        state.a.amount -= price;
        state.buys[it.id] = cnt + 1;
        done++;
      } else break;
    }
    if (done > 0) {
      state.a.rate = core.computeRate(state);
      if (state.a.amount > state.maxAmountA) state.maxAmountA = state.a.amount;
      core.saveGame(state);
      term.push([seg(G_SPARK + ' 已购买 ' + it.id + '：' + it.content + ' ' + it.effect(state), C.AquaSky)]);
    } else {
      var cnt0 = core.buyCount(state, it.id);
      term.push([seg('资源 a 不足，需要 ' + core.fmtNum(core.buyPriceBase(it, cnt0)) + ' a。', C.RedDusted)]);
    }
  }

  // ---- 命令分发（对应 executeCommand 的主要分支）----
  function executeCommand(raw) {
    var command = raw.trim();
    if (!command) return;

    // Ax15 批量执行 *n
    var bm = /^(.+?)\s*\*(\d+)$/.exec(command);
    if (bm) {
      if (!state.auxOn.Ax15) {
        term.push([seg('批量执行功能（Ax15）尚未解锁，无法使用 *n。', C.PaleYellow)]);
        return;
      }
      var base = bm[1].trim(), n = Math.max(1, Math.min(100000, parseInt(bm[2], 10)));
      var boughtBase = core.BUY_ITEMS.filter(function (it) {
        return it.id === base && (it.path === state.cwd || state.auxOn.Ax14);
      })[0];
      if (boughtBase) { buy(boughtBase, n); return; }
      for (var i = 0; i < n; i++) executeCommand(base);
      return;
    }

    if (command === 'help') { help(); return; }
    if (HELP_CATS[command]) { helpCat(command); return; }
    if (command === 'version') {
      term.push([seg('Console Incremental @ ' + VERSION, C.AquaSky)]); return;
    }
    if (command === 'tutorial on') { tutorialOn = true; term.push([seg('教程已开启。', C.PaleGreen)]); return; }
    if (command === 'tutorial off') { tutorialOn = false; term.push([seg('教程已关闭。', C.PaleGreen)]); return; }

    // 存档命令
    if (command === 'save') {
      term.push([seg(G_DOT + ' Saved.', C.PaleGreen)]); core.saveGame(state); return;
    }
    if (command === 'save.info') {
      var sd = core.loadGame(state);
      term.push([seg('玩家：' + playerName, C.Front)]);
      term.push([seg('资源 a：' + core.fmtNum(state.a.amount) + '  速度 +' + core.fmtNum(state.a.rate) + '/s', C.Front)]);
      term.push([seg('创建时间：' + state.createdTime + (sd ? '  上次保存：' + sd.lastSaved : '（未保存）'), C.Gray)]);
      return;
    }
    if (command === 'slot.info') { term.push([seg('当前槽位：1（本地单槽）', C.Front)]); return; }
    if (command === 'game.info') { term.push([seg('Game1-xri — 内置的第一个小游戏（当前唯一）。', C.Front)]); return; }
    if (command === 'olpg on') { state.olpgOn = true; core.saveGame(state); term.push([seg(G_DOT + ' 离线进度已开启。', C.PaleGreen)]); return; }
    if (command === 'olpg off') { state.olpgOn = false; core.saveGame(state); term.push([seg(G_DOT + ' 离线进度已关闭。', C.PaleGreen)]); return; }
    if (command === 'save.hardreset' || command === 'slot.hardreset') {
      core.clearSave(); term.push([seg(G_DOT + ' 存档已清除（刷新页面后生效）。', C.PaleYellow)]); return;
    }

    // 颜色
    if (command === 'color') { term.push([seg('HTML 版使用固定主题配色。', C.PaleYellow)]); return; }
    // 其他
    if (command === 'date') { term.push([seg(new Date().toLocaleDateString('zh-CN'), C.Front)]); return; }
    if (command === 'time') { term.push([seg(new Date().toLocaleTimeString('zh-CN'), C.Front)]); return; }
    if (command.indexOf('echo ') === 0) { term.push([seg(command.slice(5), C.Front)]); return; }

    // dev 模式
    if (command === 'dev.start') {
      term.push([seg('（HTML 版 dev 模式已简化）开发者模式已开启。', C.PaleYellow)]);
      state.devMode = true; return;
    }
    if (command.indexOf('res_') === 0 && command.indexOf('=') > 0) {
      var eq = command.indexOf('='), key = command.slice(4, eq), val = command.slice(eq + 1).trim();
      if (!state.devMode && !state.auxOn.Ax14) {
        term.push([seg('该命令为 dev 模式独有，请先输入 dev.start。', C.RedDusted)]); return;
      }
      if (key === 'a') {
        var num = Number(val);
        if (isNaN(num) || !isFinite(num)) {
          var sci = /^(-?[\d.]+)e([+-]?\d+)$/i.exec(val);
          if (sci) num = parseFloat(sci[1]) * Math.pow(10, parseInt(sci[2], 10));
        }
        if (!isNaN(num)) {
          state.a.amount = num; state.a.rate = core.computeRate(state); core.saveGame(state);
          term.push([seg(G_DOT + ' 资源 a 数量已设为 ' + core.fmtNum(num) + '。', C.PaleGreen)]);
        } else term.push([seg('无法解析数值：' + val, C.RedDusted)]);
      } else term.push([seg('资源 ' + key + ' 尚未加入游戏。', C.PaleYellow)]);
      return;
    }

    // 音乐命令（核心版：提示未移植）
    if (command === 'music' || command.indexOf('music.') === 0 || command === 'music on' || command === 'music off' ||
        command === 'vol +' || command === 'vol -') {
      term.push([seg('音乐功能将在后续版本移植。', C.Gray)]); return;
    }
    if (command === 'news on' || command === 'news off') {
      term.push([seg('新闻窗口将在后续版本移植。', C.Gray)]); return;
    }

    // 辅助功能开关（须在 aux 目录，或 Ax14/dev）
    var axm = /^(Ax\d+)\s+(on|off)$/.exec(command);
    if (axm) {
      var id = axm[1], on = axm[2] === 'on';
      if (state.cwd !== '~\\game1-xri\\auxiliary' && !state.auxOn.Ax14 && !state.devMode) {
        term.push([seg('须在 ~\\game1-xri\\auxiliary 目录下操作（或开启 Ax14）。', C.RedDusted)]); return;
      }
      if (!(id in state.auxOn)) {
        term.push([seg('未识别的辅助功能：' + id, C.RedDusted)]); return;
      }
      if (id === 'Ax15' && !on) { term.push([seg('Ax15 解锁后无法关闭。', C.PaleYellow)]); return; }
      state.auxOn[id] = on; core.saveGame(state);
      term.push([seg(G_DOT + ' ' + id + ' 已' + (on ? '开启' : '关闭') + '。', C.PaleGreen)]);
      return;
    }
    if (command === 'Ax_all on' || command === 'Ax_all off') {
      if (state.cwd !== '~\\game1-xri\\auxiliary' && !state.auxOn.Ax14 && !state.devMode) {
        term.push([seg('须在 ~\\game1-xri\\auxiliary 目录下操作（或开启 Ax14）。', C.RedDusted)]); return;
      }
      var val = command.endsWith('on');
      Object.keys(state.auxOn).forEach(function (k) { if (k !== 'Ax15') state.auxOn[k] = val; });
      core.saveGame(state);
      term.push([seg(G_DOT + ' 所有辅助功能已' + (val ? '开启' : '关闭') + '。', C.PaleGreen)]); return;
    }

    // 导航
    if (command === 'cd') { term.push([seg('当前路径：' + state.cwd, C.AquaSky)]); return; }
    if (command.indexOf('cd ') === 0) {
      var arg = command.slice(3).trim();
      var np = core.normalizePath(state.cwd, arg);
      if (!core.pathExists(np)) term.push([seg('路径不存在：' + arg, C.RedDusted)]);
      else { state.cwd = np; term.push([seg('已到达 ' + np, C.PaleGreen)]); showDirAuto(np); updatePrompt(); }
      return;
    }
    if (command === '~') { navigateTo('~'); return; }
    if (command === 'show' || command === 'show()') { showDir(state.cwd); return; }
    if (command === 'tree') {
      term.push([seg('文件夹树（当前目录：' + state.cwd + '）', C.PaleYellow)]);
      term.push([seg(state.cwd, C.Front)]);
      printTree(state.cwd, '', false);
      return;
    }
    var jump = {
      info: '~\\game1-xri\\information', res_a: '~\\game1-xri\\a\\a_resource',
      buff_a: '~\\game1-xri\\a\\a_buff', rst_a: '~\\game1-xri\\a\\a_reset',
      upg_a: '~\\game1-xri\\a\\a_upgrade', ach: '~\\game1-xri\\achievement',
      atb: '~\\game1-xri\\automation\\autobuyer', aux: '~\\game1-xri\\auxiliary'
    };
    if (jump[command]) {
      navigateTo(jump[command]);
      if (command === 'res_a' && tutorialStage === 0 && tutorialOn) {
        tutorialStage = 1;
        term.push([seg('教程：资源 a 会随时间自动累积（基础速度 +1/s）。', C.PaleGreen)]);
      }
      return;
    }
    if (command === 'rishow_a' || command === 'rishow' || command === 'rishow_a()') {
      term.push([seg('资源曲线图（Func9）将在后续版本移植。', C.Gray)]); return;
    }
    if (command === 'warn' || command === 'warn -min') {
      term.push([seg('提醒间隔：默认 20 秒（提醒窗口功能将在后续版本移植）。', C.Front)]); return;
    }
    if (command.indexOf('warn -min=') === 0) {
      term.push([seg('提醒间隔已记录（提醒窗口功能将在后续版本移植）。', C.PaleGreen)]); return;
    }

    // 购买项（R2）：在所属目录输入 id
    var it = core.findBuyItem(command);
    if (it && (it.path === state.cwd || state.auxOn.Ax14 || state.devMode)) {
      buy(it, 1); return;
    }

    term.push([seg("'" + command + "' is not a recognized command.", C.RedDusted)]);
  }

  function updatePrompt() { term.setPrompt(core.promptPrefix(state)); }

  // ---- 回显：命令 + 提示符前缀，历史风格 ----
  function echoCommand(cmd) {
    var p = core.promptPrefix(state);
    term.push([seg(p, C.Front), seg(cmd, C.Front)]);
  }

  // ---- 游戏循环：资源增长 + live 行刷新 ----
  function loop(now) {
    var dt = Math.min(0.25, (now - lastTick) / 1000);
    lastTick = now;
    state.a.rate = core.computeRate(state);
    state.a.amount += state.a.rate * dt;
    if (state.a.amount > state.maxAmountA) state.maxAmountA = state.a.amount;
    term.render();
    requestAnimationFrame(loop);
  }

  // ---- 启动 ----
  function start() {
    term.init('terminal');
    term.onCommand(function (cmd) {
      echoCommand(cmd);
      executeCommand(cmd);
      term.focus();
    });

    // 读档 + 离线进度
    var sd = core.loadGame(state);
    if (sd) {
      core.slotToState(sd, state);
      var sec = core.applyOfflineProgress(state, sd);
      if (sd.name) playerName = sd.name;
    }

    // 欢迎信息（对应游戏进入命令行后的输出）
    term.push([seg(G_SPARK + ' Welcome to Console Incremental ' + G_SPARK, C.AquaSky)]);
    term.push([seg('Console Incremental @ ' + VERSION, C.AquaSky)]);
    term.push([seg('Player : ' + playerName, C.Front)]);
    term.push([seg('Slot : 1', C.Front)]);
    term.push([seg('Game1-xri', C.Front)]);
    term.push([seg('教程：' + (tutorialOn ? '开' : '关'), C.Front)]);
    term.push([seg('输入 help 并按下回车以查看命令列表。', C.PaleYellow)]);
    term.blank();
    if (sd) term.push([seg('（已读取本地存档' + (state.olpgOn ? '，离线进度已结算' : '') + '）', C.Gray)]);

    updatePrompt();
    term.focus();
    lastTick = performance.now();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  global.INC.game = { getState: function () { return state; }, execute: executeCommand };
})(window);
