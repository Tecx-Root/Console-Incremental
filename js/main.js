/* Console Incremental — 主程序：流程 + 命令分发 + 游戏循环
 * 移植自 C++ main.cpp（executeCommand / showLeaf / showDir / welcome / name / slot / game / 主循环）。
 */
(function (global) {
  'use strict';
  var INC = global.INC;
  var core = INC.core, term = INC.term, audio = INC.audio, windows = INC.windows;
  var C = core.C, css = core.css, seg = term.seg;

  var G_SPARK = '◆', G_BULLET = '▸', G_DOT = '●';
  var VERSION = '0.0.1-alpha';

  var state = core.createState();
  var playerName = '';
  var currentSlot = 1;
  var devPasswordPending = false;
  var remindLast = {}, remindStep = {};
  var resHistory = [];
  var treeCollapsed = {};
  var lastTick = 0;
  var lastAutoSave = 0;
  var lastToastCheck = 0;
  var inShell = false;

  // 补全状态
  var completion = { open: false, items: [], index: 0, base: '' };

  // ---------- 全局命令表（用于补全 / 红底判定）----------
  var GLOBAL_CMDS = [
    'help', 'tutorial on', 'tutorial off', 'version', 'save.info', 'slot.info', 'game.info',
    'color', 'news on', 'news off', 'cls', 'clear', 'exit', 'olpg on', 'olpg off',
    'save', 'save.hardreset', 'slot.hardreset', 'export save -p ', 'import save -p ',
    'export slot -p ', 'import slot -p ', 'tree', 'cd ', '~', 'show', 'info', 'atb',
    'res_a', 'buff_a', 'upg_a', 'rst_a', 'ach', 'aux', 'Ax_all on', 'Ax_all off',
    'rishow_a', 'warn', 'warn -min', 'warn -min=', 'dev.start',
    'music', 'music.p=', 'music.mode=s-loop', 'music.mode=l-loop', 'music.mode=random',
    'music on', 'music off', 'vol +', 'vol -', 'echo ', 'date', 'time',
    'cmd', 'cmd.add ', 'cmd.del ', 'cmd.rm ', 'cmd.list', 'scr.num=',
    'Ax1 on', 'Ax1 off', 'Ax2 on', 'Ax2 off', 'Ax3 on', 'Ax3 off', 'Ax4 on', 'Ax4 off',
    'Ax5 on', 'Ax5 off', 'Ax6 on', 'Ax6 off', 'Ax7 on', 'Ax7 off', 'Ax8 on', 'Ax8 off',
    'Ax9 on', 'Ax9 off', 'Ax10 on', 'Ax10 off', 'Ax11 on', 'Ax11 off', 'Ax12 on', 'Ax12 off',
    'Ax13 on', 'Ax13 off', 'Ax14 on', 'Ax14 off', 'Ax15 on', 'Ax15 off', 'Ax16 on', 'Ax16 off'
  ];
  core.BUY_ITEMS.forEach(function (it) { GLOBAL_CMDS.push(it.id); });
  Object.keys(core.AX_LABELS).forEach(function (id) {
    GLOBAL_CMDS.push(id + ' on'); GLOBAL_CMDS.push(id + ' off');
  });
  GLOBAL_CMDS = GLOBAL_CMDS.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();

  // ---------- 目录内容渲染 ----------
  function curvePanel(live) {
    // 资源增长曲线（Func9 / Ax6），用 log10 折线近似
    var W = 46, H = 8;
    var vals = resHistory.length ? resHistory.slice(-W) : [0];
    var logs = vals.map(function (v) { return Math.log10(Math.max(1, v)); });
    var lo = Math.min.apply(null, logs), hi = Math.max.apply(null, logs);
    if (hi - lo < 0.001) hi = lo + 0.001;
    var rows = [];
    for (var y = 0; y < H; y++) rows.push(new Array(W).fill(' '));
    for (var x = 0; x < logs.length; x++) {
      var ry = H - 1 - Math.round((logs[x] - lo) / (hi - lo) * (H - 1));
      ry = Math.max(0, Math.min(H - 1, ry));
      rows[ry][x] = '●';
    }
    var lines = rows.map(function (r) { return seg(r.join(''), C.AquaSky); });
    term.box(' RESOURCE CURVE ', lines, { color: C.Royal, width: W + 4 });
  }

  function showLeaf(path) {
    if (path === '~\\game1-xri\\information') {
      term.push([seg('当前存档信息：', C.PaleYellow)]);
      term.push([seg('  存档名：' + playerName, C.Front)]);
      var playSecs = 0, t0 = core.parseTime(state.createdTime);
      if (!isNaN(t0)) playSecs = (Date.now() - t0) / 1000;
      term.push([seg('  游玩总时间：' + core.formatDuration(playSecs), C.Front)]);
      term.push([seg('  资源 a 历史最大数量：' + core.fmtNum(state.maxAmountA), C.Front)]);
      var occ = [];
      for (var i = 1; i <= core.SLOT_COUNT; i++) if (core.hasSlotData(playerName, i)) occ.push(i);
      if (!occ.length) term.push([seg('  槽位：尚无存档数据', C.Gray)]);
      else occ.forEach(function (i) {
        var sd = core.readSlot(playerName, i);
        term.push([seg('  槽位' + i + ': ' + ((sd && sd.lastSaved) || '(空)'), C.Front)]);
      });
    } else if (path === '~\\game1-xri\\a\\a_resource') {
      if (state.auxOn.Ax6) {
        curvePanel();
        term.pushLive(function () { return [seg('资源 a   : ', C.Front), seg(core.fmtNum(state.a.amount), C.BrightWhite)]; });
        term.pushLive(function () { return [seg('速度     : +', C.Front), seg(core.fmtNum(state.a.rate) + '/s', C.Front)]; });
        term.pushLive(function () { return [seg('历史峰值 : ', C.Front), seg(core.fmtNum(state.maxAmountA), C.PaleYellow)]; });
      } else {
        term.box(' RESOURCE STATUS ', [
          [seg('资源 a   : ', C.Front)],
          [seg('速度     : +', C.Front)]
        ], { color: C.PaleGreen, width: 40 });
        term.pushLive(function () { return [seg('  资源 a   : ', C.Front), seg(core.fmtNum(state.a.amount), C.BrightWhite)]; });
        term.pushLive(function () { return [seg('  速度     : +', C.Front), seg(core.fmtNum(state.a.rate) + '/s', C.Front)]; });
      }
    } else if (path === '~\\game1-xri\\a\\a_buff' || path === '~\\game1-xri\\a\\a_upgrade') {
      term.push([seg(path.indexOf('a_buff') >= 0 ? 'a 类可重复购买的购买项：' : 'a 类升级信息：', C.PaleYellow)]);
      var items = core.BUY_ITEMS.filter(function (it) { return it.path === path; });
      items.forEach(function (it) { term.pushLive(function () { return core.buyItemSegments(it, state); }); });
      if (!items.length) term.push([seg('  暂无购买项。', C.Gray)]);
    } else if (path === '~\\game1-xri\\a\\a_reset') {
      term.push([seg('a 类声望层（层级重置）信息：', C.PaleYellow)]);
      term.push([seg('  暂无重置内容。', C.Gray)]);
    } else if (path === '~\\game1-xri\\achievement') {
      term.push([seg('成就：', C.PaleYellow)]);
      term.push([seg('  暂无成就。', C.Gray)]);
    } else if (path === '~\\game1-xri\\automation\\autobuyer') {
      term.push([seg('自动购买器（存于 ~\\game1-xri\\automation\\autobuyer）：', C.PaleYellow)]);
      term.push([seg('  暂无自动购买器。（首个自动购买项 Aa1-1：自动购买 Ba1-1 待实现）', C.Gray)]);
    } else if (path === '~\\game1-xri\\auxiliary') {
      term.push([seg('辅助功能（以下功能存于 ~\\game1-xri\\auxiliary 目录，均可用命令控制开启/关闭）：', C.PaleYellow)]);
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
    } else showLeaf(path);
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
    term.setPrompt(core.promptPrefix(state));
  }
  function isLeafDir(path) {
    if (core.getChildren(path).length) return false;
    var canon = core.stripGame1Xri(path);
    for (var i = 0; i < core.BUY_ITEMS.length; i++) {
      var it = core.BUY_ITEMS[i];
      if (it.path === path || it.path === canon) return false;
    }
    return true;
  }
  function folderContentLabel(path) {
    var p = core.stripGame1Xri(path);
    var M = {
      '~\\game1-xri\\information': '游戏说明文档（info）',
      '~\\game1-xri\\automation\\autobuyer': '自动购买器配置（atb）',
      '~\\game1-xri\\a\\a_resource': '资源 a 数据（res_a）',
      '~\\game1-xri\\a\\a_reset': '重置操作（rst_a）',
      '~\\game1-xri\\achievement': '成就条目（ach）',
      '~\\game1-xri\\auxiliary': '辅助功能开关（Ax1–Ax16）'
    };
    return M[p] || '';
  }
  function printTree(path, indent, isLast) {
    var dirs = core.getChildren(path);
    var canon = core.stripGame1Xri(path);
    var items = core.BUY_ITEMS.filter(function (it) { return it.path === path || it.path === canon; })
      .map(function (it) { return it.id + '：' + it.content + it.effect(state); });
    var total = dirs.length + items.length, idx = 0;
    dirs.forEach(function (d) {
      var last = (++idx === total);
      var childPath = path + '\\' + d;
      var conn = indent + (last ? '└── ' : '├── ') + (treeCollapsed[childPath] ? '[+] ' : '') + d;
      term.push([seg(conn, childPath === state.cwd ? C.Royal : C.Front)]);
      if (!treeCollapsed[childPath]) printTree(childPath, indent + (last ? '    ' : '│   '), last);
      if (state.auxOn.Ax16 && isLeafDir(childPath)) {
        var cl = folderContentLabel(childPath);
        if (cl) term.push([seg(indent + (last ? '    ' : '│   ') + '└── ' + cl, C.Gray)]);
      }
    });
    items.forEach(function (s) {
      var last = (++idx === total);
      term.push([seg(indent + (last ? '└── ' : '├── ') + s, C.Front)]);
    });
  }

  // ---------- 帮助 ----------
  var HELP_CATS = {
    'c -basic': { title: ' 基本命令 ', w: 60, lines: [
      'help            查看所有命令及功能', 'tutorial on/off 教程开关', 'version         查看游戏版本',
      'save.info       查看当前存档信息', 'slot.info       查看当前存档槽位信息',
      'game.info       查看当前的小游戏信息', 'color           改变颜色', 'news on/off     新闻开/关',
      'cls/clear       清屏', 'exit/ESC        退出游戏'
    ] },
    'c -save': { title: ' 存档相关 ', w: 64, lines: [
      'save 手动保存', 'save.hardreset 清除当前存档数据并自动返回输入用户名的界面（硬重置当前存档）',
      'slot.hardreset 清除当前存档槽位数据并自动返回选择存档槽位的界面（硬重置当前存档槽位）',
      'export save -p "XX\\XX\\XX" 导出存档文件到XX\\XX\\XX路径',
      'import save -p "YY\\YY\\YY" 从YY\\YY\\YY路径导入存档文件',
      'export slot -p "XX\\XX\\XX" 导出存档槽位文件到XX\\XX\\XX路径',
      'import slot -p "YY\\YY\\YY" 从YY\\YY\\YY路径导入存档槽位文件',
      'olpg on/off 开启/关闭离线进度'
    ] },
    'c -action': { title: ' 游戏操作 ', w: 68, lines: [
      'tree 查看当前目录下的文件夹树', 'cd <路径> 跳转到某一目录（通常可简写，效果是一样的）',
      'info/cd ~\\game1-xri\\information 查看基本信息和统计数据',
      'atb/cd ~\\game1-xri\\automation\\autobuyer 查看自动购买器',
      'res_a/cd ~\\game1-xri\\a\\a_resource 查看a资源信息',
      'buff_a/cd ~\\game1-xri\\a\\a_buff 查看a类可重复购买的购买项信息',
      'upg_a/cd ~\\game1-xri\\a\\a_upgrade 查看a类升级信息',
      'rst_a/cd ~\\game1-xri\\a\\a_reset 查看a类声望层(层级重置)信息',
      'ach/cd ~\\game1-xri\\achievement 查看成就', 'aux/cd ~\\game1-xri\\auxiliary 查看辅助功能',
      'Ax… on/off 开启/关闭某个辅助功能（在开启Ax14前，须在~\\game1-xri\\auxiliary目录下操作）',
      'Ax_all on/off 开启/关闭所有辅助功能', 'warn -min 显示购买提醒最小间隔（秒）',
      'warn -min=N 设置购买提醒最小间隔（秒）', 'rishow_a 显示a资源增长曲线',
      'show 显示当前目录下的内容（不受Ax3开关影响）',
      'scr.num=… 分配数量（需解锁Ax11）', 'cmd/cmd.add/cmd.del/cmd.list 自定义命令（须先开启Ax10）'
    ] },
    'c -music': { title: ' 音乐相关 ', w: 66, lines: [
      'music 查看音乐列表', 'music.p=N 播放某编号音乐',
      'music.mode=s-loop/l-loop/random 设置音乐播放模式为单曲循环/列表循环/随机播放',
      'music on/off 音乐开/关', 'vol +/- 放大/降低背景音乐音量'
    ] },
    'c -others': { title: ' 其他命令 ', w: 56, lines: [
      'echo <文本> 打印一条信息', 'date 显示当前日期（实时）', 'time 显示当前时间（实时）'
    ] },
    'c -dev': { title: ' dev命令 ', w: 60, lines: [] }
  };
  function help() {
    term.box(' HELP ', [
      seg(G_BULLET + ' c -basic   查看基本命令', C.Front),
      seg(G_BULLET + ' c -save    查看存档相关命令', C.Front),
      seg(G_BULLET + ' c -action  查看游戏操作相关命令', C.Front),
      seg(G_BULLET + ' c -music   查看音乐相关命令', C.Front),
      seg(G_BULLET + ' c -others  查看其他命令', C.Front),
      seg(G_BULLET + ' c -dev     查看dev命令', C.Front)
    ], { color: C.AquaSky, width: 42 });
    term.push([seg('输入以上命令之一以查看该分类下的全部命令。', C.PaleYellow)]);
  }
  function helpCat(cat) {
    var info = HELP_CATS[cat];
    if (!info) return;
    var lines;
    if (cat === 'c -dev') {
      lines = state.devMode
        ? ['dev.start 进入dev模式（已处于dev模式）', 'res_a=… 设置a资源的数量（res_b=… res_c=…以此类推）[支持科学计数法和大数库]']
        : ['dev命令需在dev模式下使用。', '输入 dev.start 并输入密码以进入dev模式。'];
    } else lines = info.lines;
    term.box(info.title, lines.map(function (l) { return seg(l, cat === 'c -dev' && !state.devMode ? C.PaleYellow : C.Front); }),
      { color: C.AquaSky, width: info.w });
  }

  // ---------- 购买 ----------
  function buy(it, times) {
    times = times || 1;
    var done = 0;
    for (var k = 0; k < times; k++) {
      var cnt = core.buyCount(state, it.id), price = core.buyPriceBase(it, cnt);
      if (state.a.amount >= price) {
        state.a.amount -= price;
        state.buys[it.id] = cnt + 1;
        done++;
      } else break;
    }
    if (done > 0) {
      state.a.rate = core.computeRate(state);
      if (state.a.amount > state.maxAmountA) state.maxAmountA = state.a.amount;
      core.writeSlot(playerName, currentSlot, state);
      if (times > 1) {
        term.push([seg(G_SPARK + ' 已批量购买 ' + it.id + ' ×' + done + '（请求 ' + times + ' 次，生效 ' + done + ' 次）：' + it.content + ' ' + it.effect(state), C.AquaSky)]);
      } else {
        term.push([seg(G_SPARK + ' 已购买 ' + it.id + '：' + it.content + ' ' + it.effect(state), C.AquaSky)]);
      }
    } else {
      var cnt0 = core.buyCount(state, it.id);
      term.push([seg('资源 a 不足，需要 ' + core.fmtNum(core.buyPriceBase(it, cnt0)) + ' a。', C.RedDusted)]);
    }
  }

  // ---------- 语法高亮（Ax12 / Ax13）----------
  var SUBVERBS = ['on', 'off', 'add', 'del', 'rm', 'list', 'set', 'open', 'close', 'info', 'all', 'show', 'new', 'run'];
  function highlightCommand(cmd) {
    var toks = cmd.split(/(\s+)/);
    var out = [], first = true;
    var boldRes = !!state.auxOn.Ax13, hl = !!state.auxOn.Ax12;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (!t) continue;
      if (/^\s+$/.test(t)) { out.push(seg(t, 'Front')); continue; }
      if (!hl) { out.push(seg(t, 'Front')); continue; }
      var color = 'Front';
      if (first) { color = 'AquaSky'; first = false; }
      else if (t === 'on') color = 'L_GREEN';
      else if (t === 'off') color = 'L_RED';
      else if (SUBVERBS.indexOf(t) >= 0) color = 'L_GREEN';
      else if (t.charAt(0) === '-') color = 'L_RED';
      else if (/^\*?\d+$/.test(t)) color = 'L_BLUE';
      else if (/^-?[\d.]+e[+-]?\d+$/i.test(t)) color = 'L_AQUA';
      else if (/^[a-z]$/i.test(t)) color = boldRes ? 'BRIGHT' : 'PALE_YELLOW';
      else if (t.indexOf('=') >= 0) {
        var eq = t.indexOf('=');
        out.push(seg(t.slice(0, eq), 'PALE_YELLOW'));
        out.push(seg('=', 'Front'));
        out.push(seg(t.slice(eq + 1), 'L_AQUA'));
        continue;
      }
      out.push(seg(t, color));
    }
    return out;
  }

  // ---------- 命令分发 ----------
  function executeCommand(raw) {
    var command = raw.trim();
    if (!command) return;

    // dev 密码待输入
    if (devPasswordPending) {
      devPasswordPending = false;
      if (command === core.DEV_PASSWORD) {
        state.devMode = true;
        term.push([seg('密码正确，已进入 dev 模式。', C.PaleGreen)]);
        document.title = 'Console Incremental @ ' + VERSION + ' (dev mode)';
        core.writeSlot(playerName, currentSlot, state);
      } else {
        term.push([seg('密码错误。', C.RedDusted)]);
      }
      return;
    }

    // Ax15 批量执行 *n
    var bm = /^(.+?)\s*\*(\d+)$/.exec(command);
    if (bm) {
      if (!state.auxOn.Ax15) { term.push([seg('批量执行功能（Ax15）尚未解锁，无法使用 *n。', C.PaleYellow)]); return; }
      var base = bm[1].trim(), n = Math.max(1, Math.min(100000, parseInt(bm[2], 10)));
      var boughtBase = core.BUY_ITEMS.filter(function (it) {
        return it.id === base && (it.path === state.cwd || state.auxOn.Ax14 || state.devMode);
      })[0];
      if (boughtBase) { buy(boughtBase, n); return; }
      for (var bi = 0; bi < n; bi++) executeCommand(base);
      term.push([seg('命令已批量执行 ' + base + ' ×' + n + ' 次（生效 ' + n + ' 次）。', C.PaleGreen)]);
      return;
    }

    if (command === 'help') { help(); return; }
    if (HELP_CATS[command]) { helpCat(command); return; }
    if (command === 'version') { term.push([seg('Console Incremental @ ' + VERSION, C.AquaSky)]); return; }
    if (command === 'tutorial on') { state.tutorialOn = true; term.push([seg('教程已开启。', C.PaleGreen)]); return; }
    if (command === 'tutorial off') { state.tutorialOn = false; term.push([seg('教程已关闭。', C.PaleGreen)]); return; }
    if (command === 'tutorial') { term.push([seg('教程当前：' + (state.tutorialOn ? '开' : '关') + '  （用法：tutorial on / tutorial off）', C.PaleYellow)]); return; }

    if (command === 'save.info') {
      var sd = core.readSlot(playerName, currentSlot);
      term.push([seg('当前存档信息：', C.PaleYellow)]);
      term.push([seg('  玩家名称：' + playerName, C.Front)]);
      term.push([seg('  当前槽位：槽位' + currentSlot, C.Front)]);
      term.push([seg('  上次保存：' + ((sd && sd.lastSaved) || '(尚未保存)'), C.PaleGreen)]);
      term.push([seg('  资源 a 数量：' + core.fmtNum(state.a.amount), C.Front)]);
      term.push([seg('  资源 a 基础速度：' + core.fmtNum(state.a.rate) + ' /s', C.Front)]);
      term.push([seg('  存档创建时间：' + state.createdTime, C.Front)]);
      return;
    }
    if (command === 'slot.info') {
      var sd2 = core.readSlot(playerName, currentSlot);
      term.push([seg('当前存档槽位信息：', C.PaleYellow)]);
      term.push([seg('  槽位编号：' + currentSlot, C.Front)]);
      term.push([seg('  上次保存：' + ((sd2 && sd2.lastSaved) || '(尚未保存)'), C.PaleGreen)]);
      term.push([seg('  是否已有数据：' + (sd2 ? '是' : '否'), C.Front)]);
      return;
    }
    if (command === 'game.info') {
      term.push([seg('当前的小游戏信息：', C.PaleYellow)]);
      term.push([seg('  当前小游戏：Game1-xri', C.AquaSky)]);
      return;
    }
    if (command === 'save') {
      core.writeSlot(playerName, currentSlot, state);
      term.push([seg(G_DOT + ' Saved. (slot ' + currentSlot + ')', C.PaleGreen)]); return;
    }
    if (command === 'olpg on') { state.olpgOn = true; core.writeSlot(playerName, currentSlot, state); term.push([seg(G_DOT + ' 离线进度已开启。关闭游戏后再次打开时将按离开时长补发资源 a。', C.PaleGreen)]); return; }
    if (command === 'olpg off') { state.olpgOn = false; core.writeSlot(playerName, currentSlot, state); term.push([seg(G_DOT + ' 离线进度已关闭。', C.PaleGreen)]); return; }
    if (command === 'save.hardreset') {
      core.deleteSave(playerName);
      term.push([seg(G_DOT + ' 存档已清除，正在返回用户名输入界面…', C.PaleYellow)]);
      setTimeout(function () { flowName(); }, 400); return;
    }
    if (command === 'slot.hardreset') {
      core.clearSlot(playerName, currentSlot);
      term.push([seg(G_DOT + ' 槽位 ' + currentSlot + ' 已清除，正在返回槽位选择界面…', C.PaleYellow)]);
      setTimeout(function () { flowSlot(); }, 400); return;
    }

    // 导入/导出（HTML 版用剪贴板/提示，存档加密字符串）
    var exp = /^(export|import)\s+(save|slot)\s+-p\s+"?([^"]+)"?$/.exec(command);
    if (exp) {
      var action = exp[1], kind = exp[2], pathName = exp[3];
      var key = 'ci_export_' + pathName;
      if (action === 'export') {
        var data = core.exportData(playerName, kind === 'save' ? null : currentSlot);
        try { localStorage.setItem(key, data); } catch (e) {}
        term.push([seg(G_DOT + ' 已导出' + kind + '到 ' + pathName + '（HTML 版存于浏览器本地）。', C.PaleGreen)]);
      } else {
        var text = null; try { text = localStorage.getItem(key); } catch (e) {}
        if (text && core.importData(text, playerName, kind === 'save' ? null : currentSlot)) {
          term.push([seg(G_DOT + ' 已导入' + kind + '，正在返回槽位选择界面…', C.PaleGreen)]);
          setTimeout(function () { flowSlot(); }, 400);
        } else term.push([seg('导入失败：未找到数据或路径无效', C.RedDusted)]);
      }
      return;
    }

    if (command === 'color') {
      term.push([seg('color 命令：HTML 版提供固定主题配色（深底 + 皇家蓝/水蓝）。', C.PaleYellow)]);
      term.push([seg('可调主题：default（默认）—— 输入 color default', C.Gray)]); return;
    }
    if (command === 'echo') { term.push([seg('', C.Front)]); return; }
    if (command.indexOf('echo ') === 0) { term.push([seg(command.slice(5), C.Front)]); return; }
    if (command === 'date') { term.push([seg(new Date().toLocaleDateString('zh-CN'), C.Front)]); return; }
    if (command === 'time') { term.push([seg(new Date().toLocaleTimeString('zh-CN'), C.Front)]); return; }
    if (command === 'cls' || command === 'clear') { term.clear(); term.focus(); return; }
    if (command === 'exit') {
      core.writeSlot(playerName, currentSlot, state);
      term.push([seg(G_SPARK + '  Goodbye, ' + playerName + '.  ' + G_SPARK, C.PaleYellow)]);
      term.push([seg('（HTML 版无法关闭标签页，可安全关闭此页面。）', C.Gray)]); return;
    }

    // 新闻
    if (command === 'news on') {
      if (!windows.newsIsRunning()) windows.newsStart(windows.NEWS_ITEMS);
      term.push([seg('滚动新闻已开启。', C.PaleGreen)]); return;
    }
    if (command === 'news off') { windows.newsStop(); term.push([seg('滚动新闻已关闭。', C.PaleGreen)]); return; }

    // 音乐
    if (command === 'music') {
      var n = audio.trackCount();
      if (n === 0) term.push([seg('当前没有可用的背景音乐文件（请在 assets/audio 文件夹下放入音频）。', C.PaleYellow)]);
      else {
        var names = audio.listTracks(), modeName = audio.MODE_NAMES[audio.getMode()], cur = audio.currentIndex();
        term.push([seg('背景音乐列表（共 ' + n + ' 首，播放模式：' + modeName + '）：', C.PaleYellow)]);
        names.forEach(function (name, i) {
          term.push([seg('  ' + (i === cur ? '▶ ' : '  ') + (i + 1) + '. ' + name, i === cur ? C.PaleGreen : C.Front)]);
        });
        term.push([seg('用法：music.p=N 播放某编号 / music.mode=s-loop|l-loop|random 切换模式 / music on|off 开关 / vol +/- 调节音量', C.PaleYellow)]);
      }
      return;
    }
    if (command.indexOf('music.p=') === 0) {
      var pn = core.parseNum(command.slice(8));
      if (isNaN(pn)) { term.push([seg('用法：music.p=N（N 为音乐编号，可用 music 查看）', C.PaleYellow)]); return; }
      if (pn < 1 || pn > audio.trackCount()) { term.push([seg('编号超出范围（共 ' + audio.trackCount() + ' 首，可用 music 查看）。', C.PaleYellow)]); return; }
      audio.playTrack(pn);
      term.push([seg('正在播放第 ' + pn + ' 首音乐：' + audio.listTracks()[pn - 1] + '。', C.PaleGreen)]); return;
    }
    if (command.indexOf('music.mode=') === 0) {
      var arg = command.slice(11).trim(), m = -1, disp = '';
      if (arg === 's-loop') { m = 0; disp = '单曲循环'; }
      else if (arg === 'l-loop') { m = 1; disp = '列表循环'; }
      else if (arg === 'random') { m = 2; disp = '随机播放'; }
      if (m >= 0) { audio.setMode(m); term.push([seg('音乐播放模式已设为：' + disp + '。', C.PaleGreen)]); }
      else term.push([seg('用法：music.mode=s-loop|l-loop|random', C.PaleYellow)]);
      return;
    }
    if (command === 'music on') { audio.resume(); term.push([seg('背景音乐已开启。', C.PaleGreen)]); return; }
    if (command === 'music off') { audio.pause(); term.push([seg('背景音乐已关闭。', C.PaleGreen)]); return; }
    if (command === 'vol +') { audio.volumeUp(); term.push([seg('背景音乐音量已调大。', C.PaleGreen)]); return; }
    if (command === 'vol -') { audio.volumeDown(); term.push([seg('背景音乐音量已调小。', C.PaleGreen)]); return; }

    // dev 模式
    if (command === 'dev.start') {
      if (state.devMode) { term.push([seg('已经处于 dev 模式。', C.PaleYellow)]); return; }
      term.push([seg('请输入 dev 模式密码：', C.PaleYellow)]);
      devPasswordPending = true; return;
    }
    if (/^res_[a-z]=/.test(command)) {
      var eq = command.indexOf('='), key = command.slice(4, eq), val = command.slice(eq + 1).trim();
      if (!state.devMode && !state.auxOn.Ax14) { term.push([seg('该命令为 dev 模式独有，请先输入 dev.start。', C.RedDusted)]); return; }
      if (key !== 'a') { term.push([seg('资源 ' + key + ' 尚未加入游戏。', C.PaleYellow)]); return; }
      var num = core.parseNum(val);
      if (isNaN(num)) { term.push([seg('无法解析数值：' + val, C.RedDusted)]); return; }
      state.a.amount = num; state.a.rate = core.computeRate(state);
      if (num > state.maxAmountA) state.maxAmountA = num;
      core.writeSlot(playerName, currentSlot, state);
      term.push([seg(G_DOT + ' 资源 a 数量已设为 ' + core.fmtNum(num) + '。', C.PaleGreen)]); return;
    }

    // 自定义命令（Ax10）
    if (command === 'cmd' || command === 'cmd.list') {
      if (!state.auxOn.Ax10) { term.push([seg('须先开启 Ax10。', C.PaleYellow)]); return; }
      var names = Object.keys(state.customCmds);
      term.push([seg(command === 'cmd' ? '用法：cmd.add <名> <命令体(用&&分隔)> / cmd.del <名> / cmd.list' : '自定义命令列表：', C.PaleYellow)]);
      if (command === 'cmd.list') {
        if (!names.length) term.push([seg('  （空）', C.Gray)]);
        else names.forEach(function (nm) { term.push([seg('  ' + nm + ' = ' + state.customCmds[nm], C.Front)]); });
      }
      return;
    }
    var cmdAdd = /^cmd\.add\s+(\S+)\s+(.+)$/.exec(command);
    if (cmdAdd) {
      if (!state.auxOn.Ax10) { term.push([seg('须先开启 Ax10。', C.PaleYellow)]); return; }
      var nm = cmdAdd[1], body = cmdAdd[2];
      if (state.customCmds[nm] !== undefined || GLOBAL_CMDS.indexOf(nm) >= 0 || core.findBuyItem(nm)) {
        term.push([seg('命令名已被占用。', C.RedDusted)]); return;
      }
      state.customCmds[nm] = body; core.writeSlot(playerName, currentSlot, state);
      term.push([seg('已添加自定义命令 ' + nm + '。', C.PaleGreen)]); return;
    }
    var cmdDel = /^cmd\.(del|rm)\s+(\S+)$/.exec(command);
    if (cmdDel) {
      if (!state.auxOn.Ax10) { term.push([seg('须先开启 Ax10。', C.PaleYellow)]); return; }
      if (state.customCmds[cmdDel[2]] === undefined) { term.push([seg('未找到自定义命令。', C.RedDusted)]); return; }
      delete state.customCmds[cmdDel[2]]; core.writeSlot(playerName, currentSlot, state);
      term.push([seg('已删除自定义命令 ' + cmdDel[2] + '。', C.PaleGreen)]); return;
    }

    // 辅助功能开关
    var axm = /^(Ax\d+)\s+(on|off)$/.exec(command);
    if (axm) {
      var id = axm[1], on = axm[2] === 'on';
      if (!(id in state.auxOn)) { term.push([seg('未识别的辅助功能：' + id, C.RedDusted)]); return; }
      if (state.cwd !== '~\\game1-xri\\auxiliary' && !state.auxOn.Ax14 && !state.devMode) {
        term.push([seg('须在 ~\\game1-xri\\auxiliary 目录下操作（或开启 Ax14）。', C.RedDusted)]); return;
      }
      if (id === 'Ax15' && !on) { term.push([seg('Ax15 解锁后无法关闭。', C.PaleYellow)]); return; }
      state.auxOn[id] = on; core.writeSlot(playerName, currentSlot, state);
      term.push([seg(G_DOT + ' ' + id + ' 已' + (on ? '开启' : '关闭') + '。', C.PaleGreen)]);
      if (id === 'Ax11' && !on) windows.splitStop();
      return;
    }
    if (command === 'Ax_all on' || command === 'Ax_all off') {
      if (state.cwd !== '~\\game1-xri\\auxiliary' && !state.auxOn.Ax14 && !state.devMode) {
        term.push([seg('须在 ~\\game1-xri\\auxiliary 目录下操作（或开启 Ax14）。', C.RedDusted)]); return;
      }
      var val = command.endsWith('on');
      Object.keys(state.auxOn).forEach(function (k) { if (k !== 'Ax15') state.auxOn[k] = val; });
      core.writeSlot(playerName, currentSlot, state);
      term.push([seg(G_DOT + ' 所有辅助功能已' + (val ? '开启' : '关闭') + '。', C.PaleGreen)]); return;
    }

    // scr.num=
    if (command.indexOf('scr.num=') === 0) {
      if (!state.auxOn.Ax11 && !state.devMode) { term.push([seg("'" + command + "' is not a recognized command.", C.RedDusted)]); return; }
      var nn = core.parseNum(command.slice(8));
      var maxSplit = state.devMode ? 32 : 8;
      if (isNaN(nn) || nn < 1) { term.push([seg('用法：scr.num=<n>（n≥1）', C.PaleYellow)]); return; }
      nn = Math.min(maxSplit, Math.floor(nn));
      state.splitCount = nn; core.writeSlot(playerName, currentSlot, state);
      if (nn <= 1) windows.splitStop();
      term.push([seg('分屏数量已设为 ' + nn + (nn <= 1 ? '（不分屏）' : '，分屏窗口已渲染。'), C.PaleGreen)]);
      return;
    }

    // 导航
    if (command === 'cd') { term.push([seg('当前路径：' + state.cwd, C.AquaSky)]); return; }
    if (command.indexOf('cd ') === 0) {
      var arg = command.slice(3).trim(), np = core.normalizePath(state.cwd, arg);
      if (!core.pathExists(np)) term.push([seg('路径不存在：' + arg, C.RedDusted)]);
      else { state.cwd = np; term.push([seg('已到达 ' + np, C.PaleGreen)]); showDirAuto(np); term.setPrompt(core.promptPrefix(state)); }
      return;
    }
    if (command === '~') { navigateTo('~'); return; }
    if (command === 'show' || command === 'show()') { showDir(state.cwd); return; }
    if (command === 'tree') {
      term.push([seg('文件夹树（当前目录：' + state.cwd + '）', C.PaleYellow)]);
      term.push([seg(state.cwd, C.Front)]);
      printTree(state.cwd, '', false);
      term.push([seg('（提示：可输入 collapse <路径> 折叠/展开文件夹）', C.Gray)]);
      return;
    }
    var collapseM = /^collapse\s+(.+)$/.exec(command);
    if (collapseM) {
      var cp = core.normalizePath(state.cwd, collapseM[1].trim());
      treeCollapsed[cp] = !treeCollapsed[cp];
      term.push([seg('已' + (treeCollapsed[cp] ? '折叠' : '展开') + ' ' + cp, C.PaleGreen)]);
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
      if (command === 'res_a' && state.tutorialStage === 0 && state.tutorialOn) {
        state.tutorialStage = 1;
        term.push([seg('教程：资源 a 会随时间自动累积（基础速度 +1/s）。', C.PaleGreen)]);
      }
      return;
    }
    if (command === 'rishow_a' || command === 'rishow' || command === 'rishow_a()') {
      curvePanel();
      term.pushLive(function () { return [seg('资源 a：', C.Front), seg(core.fmtNum(state.a.amount), C.BrightWhite), seg('   速度：+', C.Front), seg(core.fmtNum(state.a.rate) + '/s', C.Front)]; });
      return;
    }
    if (command === 'warn' || command === 'warn -min') {
      term.push([seg('当前购买项两次提醒最小时间间隔：' + state.warnMin + ' 秒。', C.Front)]); return;
    }
    if (command.indexOf('warn -min=') === 0) {
      var wv = core.parseNum(command.slice(10));
      if (!isNaN(wv) && wv >= 1 && wv <= 600) {
        state.warnMin = wv; core.writeSlot(playerName, currentSlot, state);
        remindLast = {}; remindStep = {};
        term.push([seg('已设置提醒最小间隔为 ' + wv + ' 秒。', C.PaleGreen)]);
      } else term.push([seg('用法：warn -min=N（N 为 1–600 秒）', C.PaleYellow)]);
      return;
    }

    // 购买项
    var it = core.findBuyItem(command);
    if (it && (it.path === state.cwd || state.auxOn.Ax14 || state.devMode)) { buy(it, 1); return; }

    // Ax10 自定义命令执行
    if (state.auxOn.Ax10 && state.customCmds[command] !== undefined) {
      state.customCmds[command].split('&&').forEach(function (part) { executeCommand(part.trim()); });
      return;
    }

    term.push([seg("'" + command + "' is not a recognized command.", C.RedDusted)]);
  }

  // ---------- 回显（语法高亮）----------
  function echoCommand(cmd) {
    var p = core.promptPrefix(state);
    term.push([seg(p, 'Front')].concat(highlightCommand(cmd)));
    // 分屏镜像
    if (state.auxOn.Ax11 && state.splitCount > 1) refreshSplits();
  }
  function refreshSplits() {
    windows.splitRefresh(function () {
      var rows = term.getState ? [] : [];
      // 简化：镜像当前状态摘要
      return '<div style="color:#86b8ef">' + escapeHtml(state.cwd) + ' $ </div>' +
        '<div>资源 a: ' + core.fmtNum(state.a.amount) + '</div>' +
        '<div>速度: +' + core.fmtNum(state.a.rate) + '/s</div>';
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- 补全（Ax4）----------
  var completionBox = null;
  function ensureCompletionBox() {
    if (completionBox) return completionBox;
    completionBox = document.createElement('div');
    completionBox.className = 'completion-box';
    completionBox.style.display = 'none';
    document.body.appendChild(completionBox);
    return completionBox;
  }
  function buildCompletion(input) {
    var all = GLOBAL_CMDS.slice();
    if (state.devMode) { all.push('res_a=', 'res_b=', 'res_c=', 'res_d='); }
    var matches = all.filter(function (c) { return c.indexOf(input) === 0; });
    return matches.slice(0, 12);
  }
  function renderCompletion() {
    var box = ensureCompletionBox();
    if (!completion.open || !completion.items.length) { box.style.display = 'none'; return; }
    box.innerHTML = '';
    var inp = document.getElementById('cmd-input');
    if (inp) {
      var r = inp.getBoundingClientRect();
      box.style.left = Math.min(r.left, window.innerWidth - 300) + 'px';
      box.style.top = Math.max(8, r.top - Math.min(completion.items.length, 12) * 24 - 8) + 'px';
    }
    completion.items.forEach(function (item, i) {
      var d = document.createElement('div');
      d.className = 'completion-item' + (i === completion.index ? ' selected' : '');
      // 红底判定：当前目录无法生效的命令
      var invalid = !takesEffect(item);
      if (invalid) d.classList.add('invalid');
      d.textContent = item;
      box.appendChild(d);
    });
    box.style.display = 'block';
  }
  function takesEffect(cmd) {
    for (var i = 0; i < core.BUY_ITEMS.length; i++) {
      var it = core.BUY_ITEMS[i];
      if (it.id === cmd) return state.devMode || !!state.auxOn.Ax14 || it.path === state.cwd;
    }
    if (/^Ax\d+\s+(on|off)$/.test(cmd)) return state.devMode || !!state.auxOn.Ax14 || state.cwd === '~\\game1-xri\\auxiliary';
    if (cmd.indexOf('scr.num=') === 0) return state.devMode || !!state.auxOn.Ax11;
    return true;
  }
  function handleCompletion(evt, value) {
    if (!state.auxOn.Ax4) return false;
    if (evt === 'input') {
      var items = value ? buildCompletion(value) : [];
      completion.open = items.length > 0;
      completion.items = items; completion.index = 0; completion.base = value;
      renderCompletion();
      return false;
    }
    if (evt === 'clear') { completion.open = false; renderCompletion(); return false; }
    if (!completion.open || !completion.items.length) return false;
    if (evt === 'tab') {
      term.setInput(completion.items[completion.index]);
      completion.open = false; renderCompletion(); return true;
    }
    if (evt === 'up') {
      completion.index = (completion.index - 1 + completion.items.length) % completion.items.length;
      renderCompletion(); return true;
    }
    if (evt === 'down') {
      completion.index = (completion.index + 1) % completion.items.length;
      renderCompletion(); return true;
    }
    if (evt === 'esc') { completion.open = false; renderCompletion(); return true; }
    if (evt === 'enter') { completion.open = false; renderCompletion(); return false; }
    return false;
  }

  // ---------- 游戏循环 ----------
  function loop(now) {
    if (!lastTick) lastTick = now;
    var dt = Math.min(0.25, (now - lastTick) / 1000);
    lastTick = now;
    if (inShell) {
      state.a.rate = core.computeRate(state);
      state.a.amount += state.a.rate * dt;
      if (state.a.amount > state.maxAmountA) state.maxAmountA = state.a.amount;
      // 曲线历史（每 ~0.5s 采样）
      if (!loop._acc) loop._acc = 0;
      loop._acc += dt;
      if (loop._acc > 0.5) { loop._acc = 0; resHistory.push(state.a.amount); if (resHistory.length > 200) resHistory.shift(); }
      // 自动保存（每 30s）
      if (now - lastAutoSave > 30000) { lastAutoSave = now; core.writeSlot(playerName, currentSlot, state); }
      // Ax8 终端提醒 / Ax9 toast
      if (now - lastToastCheck > 1000) {
        lastToastCheck = now;
        checkReminders();
      }
      // Ax11 分屏
      if (state.auxOn.Ax11 && state.splitCount > 1 && !windows.splitIsRunning()) {
        windows.splitStart(state.splitCount, function () { return ''; });
      }
      term.render();
    }
    requestAnimationFrame(loop);
  }
  function checkReminders() {
    var affordable = core.affordableItems(state);
    if (!affordable.length) return;
    var nowSec = Date.now() / 1000;
    // Ax9 游戏外提醒：按 warnMin 与降频 step
    if (state.auxOn.Ax9 && !windows.toastIsVisible()) {
      var due = affordable.filter(function (it) {
        var last = remindLast[it.id] || 0;
        var step = remindStep[it.id] || 1;
        return (nowSec - last) >= state.warnMin * step;
      });
      if (due.length) {
        var item = due[0];
        var last = remindLast[item.id] || 0;
        if (last && (nowSec - last) < state.warnMin) remindStep[item.id] = (remindStep[item.id] || 1) + 1;
        else remindStep[item.id] = 1;
        due.forEach(function (x) { remindLast[x.id] = nowSec; });
        windows.toastShow('可购买：' + item.id + ' — ' + item.content + item.effect(state), 6500);
      }
    }
  }

  // ---------- 流程界面：欢迎 / 名称 / 槽位 / 游戏 ----------
  var flowEl = null;
  function ensureFlow() {
    if (!flowEl) {
      flowEl = document.createElement('div');
      flowEl.className = 'flow-overlay';
      document.getElementById('app').appendChild(flowEl);
    }
    return flowEl;
  }
  function hideFlow() { if (flowEl) { flowEl.innerHTML = ''; flowEl.style.display = 'none'; } }
  function showFlow(html) {
    var f = ensureFlow();
    f.innerHTML = html; f.style.display = 'flex';
  }
  function flowWelcome() {
    showFlow('<div class="welcome-text" id="welcomeText">◆ Welcome to Console Incremental ◆</div>' +
      '<div class="flow-hint">按回车继续</div>');
    var done = false;
    function finish() {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey);
      flowName();
    }
    function onKey(e) { if (e.key === 'Enter') finish(); }
    document.addEventListener('keydown', onKey);
    setTimeout(finish, 2000);
  }
  function flowName() {
    var saves = core.listSaves();
    var suggestHtml = saves.length ? '<div class="flow-suggest">已有存档：' + saves.map(function (s) {
      return '<span class="save-chip" data-name="' + escapeHtml(s) + '">' + escapeHtml(s) + '</span>';
    }).join('') + '</div>' : '';
    showFlow(
      '<div class="flow-card">' +
      '<div class="flow-title">◆  CONSOLE INCREMENTAL @ ' + VERSION + '  ◆</div>' +
      '<div class="flow-sub">a virtual console idle game</div>' +
      '<div class="flow-divider"></div>' +
      '<div class="flow-prompt">请输入你的玩家名称：</div>' +
      '<input id="nameInput" class="flow-input" autocomplete="off" autofocus />' +
      suggestHtml +
      '<div class="flow-hint">按回车继续</div>' +
      '</div>'
    );
    var inp = document.getElementById('nameInput');
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var name = inp.value.trim();
          if (!name) return;
          playerName = name;
          if (!core.saveExists(name)) core.createSave(name);
          flowSlot();
        }
      });
    }
    Array.prototype.forEach.call(flowEl.querySelectorAll('.save-chip'), function (chip) {
      chip.addEventListener('click', function () { if (inp) { inp.value = chip.getAttribute('data-name'); inp.focus(); } });
    });
  }
  function flowSlot() {
    var rows = '';
    for (var i = 1; i <= core.SLOT_COUNT; i++) {
      var sd = core.readSlot(playerName, i);
      rows += '<div class="slot-row" data-slot="' + i + '">' +
        '<span class="slot-id">槽位' + i + '</span>' +
        '<span class="slot-info">' + (sd ? escapeHtml(core.slotSummary(playerName, i)) : '（空槽位，从零开始）') + '</span>' +
        '</div>';
    }
    showFlow(
      '<div class="flow-card wide">' +
      '<div class="flow-title">◆ 选择存档槽位  ◆</div>' +
      '<div class="flow-sub">玩家：' + escapeHtml(playerName) + '</div>' +
      '<div class="flow-divider"></div>' +
      rows +
      '<div class="flow-hint">点击槽位或直接按数字键 1–' + core.SLOT_COUNT + '</div>' +
      '</div>'
    );
    function choose(slot) {
      currentSlot = slot;
      var sd = core.readSlot(playerName, slot);
      state = core.createState();
      if (sd) { core.slotToState(sd, state); core.applyOfflineProgress(state, sd); }
      flowGame();
    }
    Array.prototype.forEach.call(flowEl.querySelectorAll('.slot-row'), function (row) {
      row.addEventListener('click', function () { choose(parseInt(row.getAttribute('data-slot'), 10)); });
    });
    function onKey(e) {
      if (/^[1-9]$/.test(e.key)) {
        var s = parseInt(e.key, 10);
        if (s >= 1 && s <= core.SLOT_COUNT) { document.removeEventListener('keydown', onKey); choose(s); }
      }
    }
    document.addEventListener('keydown', onKey);
  }
  function flowGame() {
    showFlow(
      '<div class="flow-card">' +
      '<div class="flow-title">◆ 选择小游戏  ◆</div>' +
      '<div class="flow-divider"></div>' +
      '<div class="game-row" id="gameRow">▸ Game1-xri</div>' +
      '<div class="flow-hint">按回车进入游戏</div>' +
      '</div>'
    );
    function enter() {
      document.removeEventListener('keydown', onKey);
      enterShell();
    }
    function onKey(e) { if (e.key === 'Enter') enter(); }
    document.addEventListener('keydown', onKey);
    var gr = document.getElementById('gameRow');
    if (gr) gr.addEventListener('click', enter);
  }
  function enterShell() {
    hideFlow();
    inShell = true;
    term.setPrompt(core.promptPrefix(state));
    term.push([seg(G_SPARK + ' Welcome to Console Incremental ' + G_SPARK, C.AquaSky)]);
    term.push([seg('Console Incremental @ ' + VERSION, C.AquaSky)]);
    term.push([seg('Player : ' + playerName, C.Front)]);
    term.push([seg('Slot : ' + currentSlot, C.Front)]);
    term.push([seg('Game1-xri', C.Front)]);
    term.push([seg('教程：' + (state.tutorialOn ? '开' : '关'), C.Front)]);
    term.push([seg('输入 help 并按下回车以查看命令列表。', C.PaleYellow)]);
    term.blank();
    if (state.devMode) document.title = 'Console Incremental @ ' + VERSION + ' (dev mode)';
    // 启动音乐与新闻
    audio.onStatus(function (st) { updateStatusBar(st); });
    audio.start();
    if (!windows.newsIsRunning()) windows.newsStart(windows.NEWS_ITEMS);
    // Ax11 恢复分屏
    if (state.auxOn.Ax11 && state.splitCount > 1) windows.splitStart(state.splitCount, function () { return ''; });
    term.focus();
  }
  function updateStatusBar(st) {
    var bar = document.getElementById('statusbar');
    if (bar) bar.textContent = st.text;
  }

  // ---------- 启动 ----------
  function start() {
    // 底部状态栏
    var app = document.getElementById('app');
    if (app && !document.getElementById('statusbar')) {
      var bar = document.createElement('div');
      bar.id = 'statusbar';
      app.appendChild(bar);
    }
    term.init('terminal');
    term.onCommand(function (cmd) {
      echoCommand(cmd);
      try { executeCommand(cmd); }
      catch (err) {
        term.push([seg('（命令执行出错：' + (err && err.message ? err.message : String(err)) + '）', C.RedDusted)]);
        if (global.console && console.error) console.error(err);
      }
      term.focus();
    });
    term.onCompletion(handleCompletion);
    lastTick = performance.now();
    requestAnimationFrame(loop);
    flowWelcome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  global.INC.game = {
    getState: function () { return state; },
    execute: executeCommand,
    enterShell: enterShell,
    setPlayer: function (n, slot) { playerName = n; currentSlot = slot || 1; }
  };
})(window);
