/* Console Incremental — 主程序：流程 + 命令分发 + 游戏循环
 * 移植自 C++ main.cpp（executeCommand / showLeaf / showDir / welcome / name / slot / game / 主循环）。
 * 本版本不含背景音乐：音乐模块、music/vol 命令与音频资源已整体移除。
 */
(function (global) {
  'use strict';
  var INC = global.INC;
  var core = INC.core, term = INC.term, windows = INC.windows;
  var C = core.C, css = core.css, seg = term.seg;

  var G_SPARK = '◆', G_BULLET = '▸', G_DOT = '●';
  var VERSION = '0.0.1-alpha';
  var THEME_KEY = 'ci_html_theme_v1';

  var state = core.createState();
  var playerName = '';
  var currentSlot = 1;
  var devPasswordPending = false;
  var remindLast = {}, remindStep = {};
  var remindAx8At = 0, remindAx8Sig = '';
  var resHistory = [];
  var treeCollapsed = {};
  var lastTick = 0;
  var lastAutoSave = 0;
  var lastToastCheck = 0;
  var lastSplitRefresh = 0;
  var lastStatusRefresh = 0;
  var inShell = false;

  // 补全状态
  var completion = { open: false, items: [], index: 0, base: '' };

  // ---------- 全局命令表（用于补全 / 红底判定）----------
  var GLOBAL_CMDS = [
    'help', 'tutorial on', 'tutorial off', 'version', 'save.info', 'slot.info', 'game.info',
    'color', 'color default', 'color ocean', 'color amber', 'color mono',
    'news on', 'news off', 'cls', 'clear', 'exit', 'olpg', 'olpg on', 'olpg off',
    'save', 'save.hardreset', 'rm save', 'slot.hardreset', 'rm slot',
    'export save -p ', 'import save -p ',
    'export slot -p ', 'import slot -p ', 'tree', 'cd ', '~', 'show', 'info', 'atb',
    'res_a', 'buff_a', 'upg_a', 'rst_a', 'ach', 'aux', 'Ax_all on', 'Ax_all off',
    'rishow_a', 'warn', 'warn -min', 'warn -min=', 'dev.start',
    'echo ', 'date', 'time', 'collapse ',
    'cmd', 'cmd list', 'cmd.add ', 'cmd.del ', 'cmd.rm ', 'cmd.list', 'scr.num=',
    'c -basic', 'c -save', 'c -action', 'c -music', 'c -others', 'c -dev',
    'insert ', 'copy', 'cut', 'paste', 'del', 'mov up', 'mov down', 'sel ', 'unsel',
    'collapse ', 'rishow', 'rishow_a',
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

  // 对齐 C++ isReservedCmdName()：自定义命令不得遮蔽内建命令或购买项 id
  var RESERVED_CMDS = [
    'help', 'version', 'tutorial', 'save', 'save.info', 'slot.info', 'game.info',
    'color', 'cls', 'clear', 'exit', 'news', 'cd', 'show', 'show()', 'tree',
    'info', 'atb', 'res_a', 'buff_a', 'upg_a', 'rst_a', 'ach', 'aux',
    'music', 'olpg', 'echo', 'date', 'time', 'warn', 'c', 'Ax_all', 'scr',
    'rishow_a', 'slot', 'export', 'import', 'rm', 'cmd',
    'Ax1', 'Ax2', 'Ax3', 'Ax4', 'Ax5', 'Ax6', 'Ax7', 'Ax8', 'Ax9', 'Ax10',
    'Ax11', 'Ax12', 'Ax13', 'Ax14', 'Ax15', 'Ax16'
  ];
  function reservedCmd(name) {
    if (RESERVED_CMDS.indexOf(name) >= 0) return true;
    return !!core.findBuyItem(name);
  }

  // ---------- 主题 ----------
  var CSS_VAR_MAP = {
    '--bg': 'BG', '--fg': 'FRONT', '--royal': 'ROYAL', '--aqua': 'AQUA_SKY',
    '--panel': 'PANEL', '--line': 'ROYAL', '--bad': 'RED_DUSTED', '--deep': 'BG',
    '--warn': 'PALE_YELLOW', '--good': 'PALE_GREEN'
  };
  function syncCssTheme() {
    var root = document.documentElement;
    Object.keys(CSS_VAR_MAP).forEach(function (v) {
      var val = core.PALETTE[CSS_VAR_MAP[v]];
      if (v === '--line') val = mix(val, core.PALETTE.BG, 0.72);
      if (v === '--deep') val = mix(val, '#000000', 0.45);
      root.style.setProperty(v, val);
    });
  }
  function mix(a, b, t) {
    function rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    var x = rgb(a), y = rgb(b);
    return '#' + x.map(function (v, i) {
      return Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0');
    }).join('');
  }
  function applyTheme(name, quiet) {
    if (!core.setTheme(name)) {
      if (!quiet) term.push([seg('未知主题：' + name + '（可用：' + Object.keys(core.THEMES).join(' / ') + '）', C.RedDusted)]);
      return false;
    }
    // color <0-F> 设置的前景色索引优先于主题默认前景色
    if (state.defaultFg !== 7) core.PALETTE.FRONT = core.FG16[state.defaultFg];
    syncCssTheme();
    term.repaint();
    try { localStorage.setItem(THEME_KEY, name); } catch (e) {}
    if (!quiet) term.push([seg(G_DOT + ' 配色主题已设为 ' + name + '。', C.PaleGreen)]);
    return true;
  }
  // 与 C++ currentDateStr() / currentClock() 同格式（date / time 命令实时刷新）
  function currentClock() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function currentDateStr() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    var wd = ['日', '一', '二', '三', '四', '五', '六'];
    return d.getFullYear() + '年' + p(d.getMonth() + 1) + '月' + p(d.getDate()) + '日 星期' + wd[d.getDay()];
  }
  function unknownCommand(command) {
    term.push([seg("'" + command + "' is not a recognized command.", C.RedDusted)]);
    term.push([seg("Type 'help' for available commands.", C.Gray)]);
  }

  // ---------- 目录内容渲染 ----------
  function sparkline(vals, W) {
    var chars = '▁▂▃▄▅▆▇█';
    var v = vals.slice(-W);
    if (!v.length) return '（采样中）';
    var logs = v.map(function (x) { return Math.log10(Math.max(1, x)); });
    var lo = Math.min.apply(null, logs), hi = Math.max.apply(null, logs);
    if (hi - lo < 1e-9) hi = lo + 1e-9;
    return logs.map(function (l) {
      return chars[Math.max(0, Math.min(7, Math.round((l - lo) / (hi - lo) * 7)))];
    }).join('');
  }
  function curvePanel() {
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
      // 对齐 C++ showLeaf：Ax6 关闭时是 RESOURCE STATUS 盒；开启时叠加曲线与峰值
      var resRow = function () {
        return [seg('资源 a   : ', C.Front), seg(core.fmtNum(state.a.amount), C.BrightWhite)];
      };
      var rateRow = function () {
        return [seg('速度     : +', C.Front), seg(core.fmtNum(state.a.rate) + '/s', C.BrightWhite)];
      };
      if (state.auxOn.Ax6) {
        term.box(' RESOURCE a ', [
          resRow, rateRow,
          function () { return [seg('历史峰值 : ', C.Front), seg(core.fmtNum(state.maxAmountA), C.PaleYellow)]; },
          function () { return [seg(sparkline(resHistory, 46), C.AquaSky)]; }
        ], { color: C.LightBlue, width: 60 });
      } else {
        term.box(' RESOURCE STATUS ', [resRow, rateRow], { color: C.PaleGreen, width: 88 });
      }
    } else if (path === '~\\game1-xri\\a\\a_buff' || path === '~\\game1-xri\\a\\a_upgrade') {
      term.push([seg(path.indexOf('a_buff') >= 0 ? 'a 类可重复购买的购买项：' : 'a 类升级信息：', C.PaleYellow)]);
      var items = core.BUY_ITEMS.filter(function (it) { return it.path === path; });
      items.forEach(function (it) {
        term.pushLive(function () { return core.buyItemSegments(it, state); }, 'view');
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
      term.push([seg('  暂无自动购买器。（首个自动购买项 Aa1-1：自动购买 Ba1-1 待实现）', C.Gray)]);
    } else if (path === '~\\game1-xri\\auxiliary') {
      term.push([seg('辅助功能（以下功能存于 ~\\game1-xri\\auxiliary 目录，均可用命令控制开启/关闭）：', C.PaleYellow)]);
      Object.keys(core.AX_LABELS).forEach(function (id) {
        term.pushLive(function () { return core.auxiliaryLineSegments(state, id); }, 'view');
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
  // 视图区整块替换：切目录不会残留上一目录的实时行
  function showView(path) {
    term.beginView();
    try { showDir(path); } finally { term.endView(); }
  }
  function showDirAuto(path) {
    if (core.getChildren(path).length) { showView(path); return; }
    if (!state.auxOn.Ax3) {
      term.beginView();
      try { term.push([seg('（Ax3 已关闭，未自动显示该目录内容；输入 show 查看）', C.Gray)]); }
      finally { term.endView(); }
      return;
    }
    showView(path);
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
      '~\\information': '游戏说明文档（info）',
      '~\\automation\\autobuyer': '自动购买器配置（atb）',
      '~\\a\\a_resource': '资源 a 数据（res_a）',
      '~\\a\\a_reset': '重置操作（rst_a）',
      '~\\achievement': '成就条目（ach）',
      '~\\auxiliary': '辅助功能开关（Ax1–Ax16）',
      '~\\a\\a_buff': '可重复购买项（buff_a）',
      '~\\a\\a_upgrade': '升级项（upg_a）'
    };
    return M[p] || M[path] || '';
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
  function resolveCd(cwd, arg) {
    // 1) 常规相对 / 绝对路径
    var np = core.normalizePath(cwd, arg);
    if (core.pathExists(np)) return np;
    // 2) 目录名或快捷别名简写，在整棵虚拟目录树里查找
    var hit = core.findPath(arg.replace(/[\\\/]/g, ''));
    return hit;
  }

  // ---------- Ax7：更好的文件夹树（Func15）可点击、可折叠面板 ----------
  function pathLeaf(path) {
    var parts = core.splitPath(path);
    return parts[parts.length - 1] || path;
  }
  function emitTreeAx7() {
    var panel = document.createElement('div');
    panel.className = 'tree-panel';
    renderTreePanel(panel);
    term.pushNode(panel);
  }
  function renderTreePanel(panel) {
    panel.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'tree-panel-head';
    head.textContent = '文件夹树  ·  当前目录 ' + state.cwd;
    panel.appendChild(head);
    var body = document.createElement('div');
    body.className = 'tree-panel-body';
    panel.appendChild(body);

    function addDir(path, depth) {
      var children = core.getChildren(path);
      var row = document.createElement('div');
      row.className = 'tree-node';
      row.style.paddingLeft = (8 + depth * 18) + 'px';
      var toggle = document.createElement('span');
      toggle.className = 'tree-toggle' + (children.length ? '' : ' leaf');
      toggle.textContent = children.length ? (treeCollapsed[path] ? '[+]' : '[-]') : '·';
      if (children.length) {
        toggle.addEventListener('click', function (e) {
          e.stopPropagation();
          treeCollapsed[path] = !treeCollapsed[path];
          renderTreePanel(panel);
        });
      }
      row.appendChild(toggle);
      var name = document.createElement('span');
      name.className = 'tree-name' + (path === state.cwd ? ' current' : '');
      name.textContent = pathLeaf(path);
      name.title = '点击跳转到 ' + path;
      name.addEventListener('click', function () { navigateTo(path); });
      row.appendChild(name);
      var p = core.stripGame1Xri(path);
      var aliases = { '~\\information': 'info', '~\\automation\\autobuyer': 'atb',
        '~\\a\\a_resource': 'res_a', '~\\a\\a_buff': 'buff_a', '~\\a\\a_upgrade': 'upg_a',
        '~\\a\\a_reset': 'rst_a', '~\\achievement': 'ach', '~\\auxiliary': 'aux' };
      if (aliases[p]) {
        var tag = document.createElement('span');
        tag.className = 'tree-alias'; tag.textContent = aliases[p];
        row.appendChild(tag);
      }
      body.appendChild(row);
      if (treeCollapsed[path]) return;
      children.forEach(function (c) { addDir(path + '\\' + c, depth + 1); });
      core.BUY_ITEMS.filter(function (it) { return it.path === path || it.path === p; })
        .forEach(function (it) {
          var ir = document.createElement('div');
          ir.className = 'tree-node tree-item';
          ir.style.paddingLeft = (8 + (depth + 1) * 18) + 'px';
          ir.textContent = '└ ' + it.id + '：' + it.content + it.effect(state);
          body.appendChild(ir);
        });
      if (state.auxOn.Ax16 && isLeafDir(path)) {
        var cl = folderContentLabel(path);
        if (cl) {
          var cr = document.createElement('div');
          cr.className = 'tree-node tree-label';
          cr.style.paddingLeft = (8 + (depth + 1) * 18) + 'px';
          cr.textContent = '└ ' + cl;
          body.appendChild(cr);
        }
      }
    }
    addDir(state.cwd, 0);
    var foot = document.createElement('div');
    foot.className = 'tree-panel-foot';
    foot.textContent = '点击【名称】跳转目录 · 点击 [+]/[-] 折叠/展开';
    panel.appendChild(foot);
  }

  // ---------- 帮助 ----------
  // 文案逐条对齐 C++ executeCommand() 中 pushBox 的内容（策划案「命令一览」）
  var HELP_CATS = {
    'c -basic': { title: ' 基本命令 ', w: 60, lines: [
      'help            查看所有命令及功能',
      'tutorial on/off 教程开关',
      'version         查看游戏版本',
      'save.info       查看当前存档信息',
      'slot.info       查看当前存档槽位信息',
      'game.info       查看当前的小游戏信息',
      'color           改变颜色',
      'news on/off     新闻开/关',
      'cls/clear       清屏',
      'exit/ESC        退出游戏'
    ] },
    'c -music': { title: ' 音乐相关 ', w: 60, lines: [
      'music 查看音乐列表',
      'music.p=N 播放某编号音乐',
      'music.mode=s-loop/l-loop/random 设置音乐播放模式为单曲循环/列表循环/随机播放',
      'music on/off 音乐开/关',
      'vol +/- 放大/降低背景音乐音量',
      '（本版本已整体移除背景音乐，上述命令不可用）'
    ] },
    'c -save': { title: ' 存档相关 ', w: 64, lines: [
      'save 手动保存',
      'save.hardreset 清除当前存档数据并自动返回输入用户名的界面（硬重置当前存档）',
      'slot.hardreset 清除当前存档槽位数据并自动返回选择存档槽位的界面（硬重置当前存档槽位）',
      'export save -p "XX\\XX\\XX" 导出存档文件到XX\\XX\\XX路径',
      'import save -p "YY\\YY\\YY" 从YY\\YY\\YY路径导入存档文件',
      'export slot -p "XX\\XX\\XX" 导出存档槽位文件到XX\\XX\\XX路径',
      'import slot -p "YY\\YY\\YY" 从YY\\YY\\YY路径导入存档槽位文件',
      'olpg on/off 开启/关闭离线进度（关闭游戏后再次打开时按离开时长补发资源 a）'
    ] },
    'c -action': { title: ' 游戏操作 ', w: 68, lines: [
      'tree 查看当前目录下的文件夹树',
      'cd <路径> 跳转到某一目录（通常可简写，效果是一样的）',
      'info/cd ~\\game1-xri\\information 查看基本信息和统计数据',
      'atb/cd ~\\game1-xri\\automation\\autobuyer 查看自动购买器',
      'res_a/cd ~\\game1-xri\\a\\a_resource 查看a资源信息',
      'buff_a/cd ~\\game1-xri\\a\\a_buff 查看a类可重复购买的购买项信息',
      'upg_a/cd ~\\game1-xri\\a\\a_upgrade 查看a类升级信息',
      'rst_a/cd ~\\game1-xri\\a\\a_reset 查看a类声望层(层级重置)信息',
      'ach/cd ~\\game1-xri\\achievement 查看成就',
      'aux/cd ~\\game1-xri\\auxiliary 查看辅助功能',
      'Ax… on/off 开启/关闭某个辅助功能（在开启Ax14前，须在~\\game1-xri\\auxiliary目录下操作）',
      'Ax_all on/off 开启/关闭所有辅助功能（在开启Ax14前，须在~\\game1-xri\\auxiliary目录下操作）',
      'warn -min 显示当前购买项两次提醒最小间隔（单位：秒）',
      'warn -min=N 设置购买提醒最小间隔（秒）。同一购买项两次提醒间隔小于 N 秒时自动降频（两次一提醒→三次…，见Ax9/Ax10，由 warn -min 统一控制）',
      'rishow_a 显示a资源增长曲线（res_a 会叠加显示数量/速度/峰值）',
      'show 显示当前目录下的内容（不受Ax3开关影响）',
      'scr.num=… 分配数量（需解锁Ax11后才会显示，未解锁时输入返回通用错误提示）',
      'cmd / cmd.add / cmd.del / cmd.list 自定义命令（须先开启Ax10，详见 cmd 命令）',
      '（本版扩展：collapse <路径> 折叠/展开文件夹树；color <主题名> 切换配色）'
    ] },
    'c -others': { title: ' 其他命令 ', w: 56, lines: [
      'echo <文本> 打印一条信息',
      'date 显示当前日期（实时）',
      'time 显示当前时间（实时）'
    ] },
    'c -dev': { title: ' dev命令 ', w: 64, lines: [] }
  };
  function help() {
    term.box(' HELP ', [
      seg(G_BULLET + ' c -basic   查看基本命令', C.Front),
      seg(G_BULLET + ' c -save    查看存档相关命令', C.Front),
      seg(G_BULLET + ' c -action  查看游戏操作相关命令', C.Front),
      seg(G_BULLET + ' c -music   查看音乐相关命令', C.Front),
      seg(G_BULLET + ' c -others  查看其他命令', C.Front),
      seg(G_BULLET + ' c -dev     查看dev命令', C.Front)
    ], { color: C.AquaSky, width: 60 });
    term.push([seg('输入以上命令之一以查看该分类下的全部命令。', C.PaleYellow)]);
  }
  function helpCat(cat) {
    var info = HELP_CATS[cat];
    if (!info) return;
    var lines;
    if (cat === 'c -dev') {
      lines = state.devMode
        ? ['dev.start 进入dev模式（已处于dev模式）',
           'res_a=… 设置a资源的数量（res_b=… res_c=…以此类推）[支持科学计数法和大数库]']
        : ['dev命令需在dev模式下使用。', '输入 dev.start 并输入密码以进入dev模式。'];
    } else lines = info.lines;
    term.box(info.title, lines.map(function (l) {
      return seg(l, (cat === 'c -dev' && !state.devMode) || String(l).indexOf('（本版') === 0 ? C.PaleYellow : C.Front);
    }), { color: C.AquaSky, width: info.w });
  }

  // ---------- 购买 ----------
  function buy(it, times) {
    times = times || 1;
    var done = 0;
    for (var k = 0; k < times; k++) {
      var cnt = core.buyCount(state, it.id), price = core.buyPriceBase(it, cnt);
      if (core.numGte(state.a.amount, price)) {
        state.a.amount = core.numSub(state.a.amount, price);
        state.buys[it.id] = cnt + 1;
        done++;
      } else break;
    }
    if (done > 0) {
      state.a.rate = core.computeRate(state);
      if (core.numCmp(state.a.amount, state.maxAmountA) > 0) state.maxAmountA = state.a.amount;
      core.writeSlot(playerName, currentSlot, state);
      if (times > 1) {
        term.push([seg(G_SPARK + ' 已批量购买 ' + it.id + ' ×' + done + '（请求 ' + times + ' 次，生效 ' + done + ' 次）：' + it.content + ' ' + it.effect(state), C.AquaSky)]);
      } else {
        term.push([seg(G_SPARK + ' 已购买 ' + it.id + '：' + it.content + ' ' + it.effect(state), C.AquaSky)]);
      }
      if (state.tutorialOn && state.tutorialStage < 2) {
        state.tutorialStage = 2;
        term.push([seg('教程：购买会提升资源 a 的获取速度，输入 res_a 可查看当前速度。', C.PaleGreen)]);
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
  function executeCommand(raw, depth) {
    depth = depth || 0;
    var command = raw.trim();
    if (!command) return;

    // dev 密码待输入
    if (devPasswordPending) {
      devPasswordPending = false;
      if (command === core.DEV_PASSWORD) {
        state.devMode = true;
        // 策划案 S FuncX：dev 模式下所有辅助功能均为已解锁状态
        Object.keys(state.auxOn).forEach(function (k) { state.auxOn[k] = true; });
        syncEditor();
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
    // Ax5：更好的终端（Func17）命令块编辑
    if (state.auxOn.Ax5 && command.indexOf('insert') === 0) {
      if (command === 'insert') {
        var t = term.selectedBlockText();
        if (t) { term.setInput(t); term.push([seg('已把选中命令取回输入框，编辑后按回车执行。', C.PaleGreen)]); }
        else term.push([seg('请先选中命令块（sel <序号> 或点击命令行）。', C.PaleYellow)]);
      } else {
        var ic = command.slice(6).trim();
        if (ic) { echoCommand(ic); executeCommand(ic, depth + 1); }
        else term.push([seg('用法：insert <命令> 或 insert（取回选中命令）', C.PaleYellow)]);
      }
      return;
    }
    if (state.auxOn.Ax5 && /^(copy|cut|paste|del|mov|sel|unsel)(\s|$)/.test(command)) {
      var er = term.editorCommand(command);
      if (er.msg) term.push([seg(er.msg, er.ok ? C.PaleGreen : C.PaleYellow)]);
      else unknownCommand(command);
      return;
    }
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
      term.push([seg('  配色主题：' + core.getTheme(), C.Front)]);
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
    if (command === 'olpg') { term.push([seg('用法：olpg on / olpg off', C.PaleYellow)]); return; }
    if (command === 'olpg on') { state.olpgOn = true; core.writeSlot(playerName, currentSlot, state); term.push([seg(G_DOT + ' 离线进度已开启。关闭游戏后再次打开时将按离开时长补发资源 a。', C.PaleGreen)]); return; }
    if (command === 'olpg off') { state.olpgOn = false; core.writeSlot(playerName, currentSlot, state); term.push([seg(G_DOT + ' 离线进度已关闭。', C.PaleGreen)]); return; }
    if (command === 'save.hardreset' || command === 'rm save') {
      core.deleteSave(playerName);
      term.push([seg(G_DOT + ' 存档已清除，返回用户名输入界面。', C.PaleYellow)]);
      setTimeout(function () { inShell = false; flowName(); }, 400); return;
    }
    if (command === 'slot.hardreset' || command === 'rm slot') {
      core.clearSlot(playerName, currentSlot);
      term.push([seg(G_DOT + ' 槽位 ' + currentSlot + ' 已清除，返回槽位选择界面。', C.PaleYellow)]);
      setTimeout(function () { inShell = false; flowSlot(); }, 400); return;
    }

    // 导入/导出（HTML 版：加密串存于浏览器本地键，路径即键名）
    // 与 C++ tokenizeQuoted 一致：-p 可出现在任意位置，路径可用引号包裹
    if (/^(export|import)\b/.test(command)) {
      var tk = command.match(/"[^"]*"|'[^']*'|\S+/g) || [];
      var action = tk[0], kind = tk[1] || '', pi = tk.indexOf('-p');
      var pathName = pi >= 0 && tk[pi + 1] ? tk[pi + 1].replace(/^["']|["']$/g, '') : '';
      if (kind !== 'save' && kind !== 'slot') {
        term.push([seg('Usage: ' + action + ' save|slot -p "path"', C.RedDusted)]); return;
      }
      if (!pathName) {
        term.push([seg('Usage: ' + action + ' ' + kind + ' -p "path"', C.RedDusted)]); return;
      }
      var key = 'ci_export_' + pathName;
      if (action === 'export') {
        var data = core.exportData(playerName, kind === 'save' ? null : currentSlot);
        try { localStorage.setItem(key, data); } catch (e) {}
        term.push([seg(G_DOT + ' 已导出' + kind + '到 ' + pathName + '（存于浏览器本地键 ' + key + '）。', C.PaleGreen)]);
      } else {
        var text = null; try { text = localStorage.getItem(key); } catch (e) {}
        if (text && core.importData(text, playerName, kind === 'save' ? null : currentSlot)) {
          term.push([seg(G_DOT + ' 已导入' + kind + '，正在返回槽位选择界面…', C.PaleGreen)]);
          setTimeout(function () { inShell = false; flowSlot(); }, 400);
        } else term.push([seg('导入失败：未找到数据或路径无效', C.RedDusted)]);
      }
      return;
    }

    // color：C++ 用 0-F 索引设置默认前景色；本版额外保留主题名
    if (command === 'color') {
      term.push([seg('Usage: color <0-F>  (sets default text color, 0=black … F=white)', C.PaleYellow)]);
      term.push([seg('本版另支持 color <主题名>（' + Object.keys(core.THEMES).join(' / ') +
        '）；当前主题：' + core.getTheme() + '，前景色索引：' + state.defaultFg, C.Gray)]);
      return;
    }
    var colorM = /^color\s+(\S+)$/.exec(command);
    if (colorM) {
      var ca = colorM[1];
      if (/^[0-9a-fA-F]$/.test(ca)) {
        var idx = parseInt(ca, 16);
        state.defaultFg = idx;
        core.PALETTE.FRONT = core.FG16[idx];
        syncCssTheme(); term.repaint();
        core.writeSlot(playerName, currentSlot, state);
        term.push([seg('Default text color set to index ' + idx + '.', C.PaleGreen)]);
      } else if (!applyTheme(ca)) {
        term.push([seg('Usage: color <0-F>  (sets default text color)', C.RedDusted)]);
      }
      return;
    }

    if (command.indexOf('echo ') === 0) { term.push([seg(command.slice(5), C.Front)]); return; }
    if (command === 'date') {
      term.pushLive(function () { return [seg('当前日期：' + currentDateStr(), C.PaleYellow)]; });
      return;
    }
    if (command === 'time') {
      term.pushLive(function () { return [seg('当前时间：' + currentClock(), C.PaleYellow)]; });
      return;
    }
    if (command === 'cls' || command === 'clear') { term.clear(); term.focus(); return; }
    if (command === 'exit') {
      core.writeSlot(playerName, currentSlot, state);
      term.push([seg(G_SPARK + '  Goodbye, ' + playerName + '.  ' + G_SPARK, C.PaleYellow)]);
      term.push([seg('（已退出；HTML 版无法关闭标签页，重新加载页面可再次进入。）', C.Gray)]);
      inShell = false; return;
    }

    // 新闻
    if (command === 'news on') {
      if (!windows.newsIsRunning()) windows.newsStart(windows.NEWS_ITEMS);
      term.push([seg('滚动新闻已开启。', C.PaleGreen)]); return;
    }
    if (command === 'news off') { windows.newsStop(); term.push([seg('滚动新闻已关闭。', C.PaleGreen)]); return; }

    // 音乐已移除：给出明确反馈，避免误判为拼写错误
    // （c -music 分类仍保留在 help 中，内容标注「本版本已移除」，与命令一览对齐）
    if (/^(music|vol)(\s|\.|=|$)/.test(command)) {
      term.push([seg('音乐功能已在本版本移除（不含背景音乐）。', C.Gray)]); return;
    }

    // dev 模式
    if (command === 'dev.start') {
      if (state.devMode) { term.push([seg('已经处于 dev 模式。', C.PaleYellow)]); return; }
      term.push([seg('请输入 dev 模式密码：', C.PaleYellow)]);
      devPasswordPending = true; return;
    }
    if (/^res_[a-z]\s*=/.test(command)) {
      var eq = command.indexOf('='), key = command.slice(4, eq).trim(), val = command.slice(eq + 1).trim();
      if (!state.devMode) { term.push([seg('res_…= 是 dev 模式专属命令，请先通过 dev.start 进入 dev 模式。', C.RedDusted)]); return; }
      if (key !== 'a') { term.push([seg('资源 ' + key + ' 尚未加入游戏。', C.PaleYellow)]); return; }
      var num = core.parseNum(val);
      if (!core.numValid(num)) { term.push([seg('无法解析数值：' + val, C.RedDusted)]); return; }
      state.a.amount = num; state.a.rate = core.computeRate(state);
      if (core.numCmp(num, state.maxAmountA) > 0) state.maxAmountA = num;
      core.writeSlot(playerName, currentSlot, state);
      term.push([seg(G_DOT + ' 资源 a 数量已设为 ' + core.fmtNum(num) + '。', C.PaleGreen)]); return;
    }

    // 自定义命令（Ax10 / Func18）：对齐 C++ cmd / cmd.add / cmd.del / cmd.list
    if (command === 'cmd' || command === 'cmd list' || command === 'cmd.list' || command.indexOf('cmd ') === 0) {
      if (!state.auxOn.Ax10) {
        term.push([seg('自定义命令功能未开启。请先开启 Ax10（须在 ~\\game1-xri\\auxiliary 目录下输入 Ax10 on）。', C.PaleYellow)]);
        return;
      }
      var names = Object.keys(state.customCmds);
      if (command === 'cmd' || command === 'cmd list' || command === 'cmd.list') {
        if (!names.length) term.push([seg('当前没有自定义命令。', C.PaleYellow)]);
        else {
          term.push([seg('自定义命令列表（开启 Ax10 后输入名称即可执行）：', C.PaleYellow)]);
          names.forEach(function (nm) { term.push([seg('  ' + nm + '  →  ' + state.customCmds[nm], C.Front)]); });
        }
        term.push([seg('用法：cmd.add <名称> <命令体> | cmd.del <名称> | cmd.list', C.Gray)]);
      } else {
        term.push([seg('未知的子命令。用法：cmd.add <名称> <命令体> | cmd.del <名称> | cmd.list', C.PaleYellow)]);
      }
      return;
    }
    var cmdAdd = /^cmd\.add(?:\s+(\S*))?(?:\s+(.+))?$/.exec(command);
    if (cmdAdd) {
      if (!state.auxOn.Ax10) { term.push([seg('自定义命令功能未开启。请先开启 Ax10。', C.PaleYellow)]); return; }
      var nm = (cmdAdd[1] || '').trim(), body = (cmdAdd[2] || '').trim();
      if (!nm || !body) {
        term.push([seg('用法：cmd.add <名称> <命令体>（名称和命令体均不能为空）', C.PaleYellow)]); return;
      }
      if (/[\s=;]/.test(nm) || nm.indexOf('cmd') === 0) {
        term.push([seg("自定义命令名称须为不含空格、'=' 且不以 cmd 开头的单个词。", C.RedDusted)]); return;
      }
      if (reservedCmd(nm)) {
        term.push([seg('名称 ' + nm + ' 与已有命令冲突，请换一个名称。', C.RedDusted)]); return;
      }
      var existed = state.customCmds[nm] !== undefined;
      state.customCmds[nm] = body; core.writeSlot(playerName, currentSlot, state);
      term.push([seg((existed ? '已更新自定义命令 ' : '已添加自定义命令 ') + nm + ' → ' + body, C.PaleGreen)]); return;
    }
    var cmdDel = /^cmd\.(del|rm)\s*(\S*)$/.exec(command);
    if (cmdDel) {
      if (!state.auxOn.Ax10) { term.push([seg('自定义命令功能未开启。请先开启 Ax10。', C.PaleYellow)]); return; }
      var dn = cmdDel[2];
      if (!dn) { term.push([seg('用法：cmd.del <名称>', C.PaleYellow)]); return; }
      if (state.customCmds[dn] === undefined) { term.push([seg('未找到自定义命令 ' + dn, C.RedDusted)]); return; }
      delete state.customCmds[dn]; core.writeSlot(playerName, currentSlot, state);
      term.push([seg('已删除自定义命令 ' + dn, C.PaleGreen)]); return;
    }

    // 辅助功能开关
    var axm = /^(Ax\d+)\s+(on|off)$/.exec(command);
    if (axm) {
      var id = axm[1], on = axm[2] === 'on';
      if (!(id in state.auxOn)) { term.push([seg('未识别的辅助功能：' + id, C.RedDusted)]); return; }
      if (state.cwd !== '~\\game1-xri\\auxiliary' && !state.auxOn.Ax14 && !state.devMode) {
        term.push([seg('须在 ~\\game1-xri\\auxiliary 目录下操作，或开启 Ax14。', C.PaleYellow)]); return;
      }
      if (id === 'Ax15') {
        if (on) {
          state.auxOn[id] = true; core.writeSlot(playerName, currentSlot, state);
          term.push([seg('Ax15 已开启（批量执行 *n：命令后可加 *n 重复执行 n 遍；解锁后无法关闭）。', C.PaleGreen)]);
        } else term.push([seg('Ax15（批量执行功能）解锁后无法关闭。', C.PaleYellow)]);
        return;
      }
      state.auxOn[id] = on; core.writeSlot(playerName, currentSlot, state);
      if (id === 'Ax5') syncEditor();
      if (!on && id === 'Ax9') { remindLast = {}; remindStep = {}; windows.toastHide(); }
      if (!on && id === 'Ax7') { treeCollapsed = {}; }
      if (!on && id === 'Ax11') windows.splitStop();
      term.push([seg(id + ' 已' + (on ? '开启' : '关闭') + '。', C.PaleGreen)]);
      if (on && id === 'Ax5') ax5Help();
      if (on && id === 'Ax6') {
        term.push([seg('更好的资源信息：输入 res_a 或 rishow_a 时显示资源增长曲线（半透明玻璃面板 + 发光折线）。', C.PaleYellow)]);
        term.push([seg(' · rishow_a 只显示曲线；res_a 在曲线面板顶部叠加资源数量 / 速度 / 峰值，Y 轴随数值自动缩放。关闭后 res_a 恢复为普通资源文本。', C.PaleYellow)]);
      }
      if (on && id === 'Ax7') {
        term.push([seg('更好的文件夹树：输入 tree 时以美化面板显示文件夹树，目录可点击跳转、文件夹可折叠。', C.PaleYellow)]);
        term.push([seg(' · 点击文件夹【名称】进入该目录；点击 [+]/[-] 折叠/展开其子目录。', C.PaleYellow)]);
        term.push([seg(' · 折叠状态在会话内保持；关闭后 tree 恢复为普通文本树。', C.PaleYellow)]);
      }
      if (state.cwd === '~\\game1-xri\\a\\a_resource' || state.cwd === '~\\game1-xri\\auxiliary') showView(state.cwd);
      return;
    }
    if (command === 'Ax_all on' || command === 'Ax_all off') {
      if (state.cwd !== '~\\game1-xri\\auxiliary' && !state.auxOn.Ax14 && !state.devMode) {
        term.push([seg('须在 ~\\game1-xri\\auxiliary 目录下操作，或开启 Ax14。', C.PaleYellow)]); return;
      }
      var val = command.slice(-2) === 'on';
      Object.keys(state.auxOn).forEach(function (k) { if (k !== 'Ax15') state.auxOn[k] = val; });
      core.writeSlot(playerName, currentSlot, state);
      syncEditor();
      if (!val) { remindLast = {}; remindStep = {}; treeCollapsed = {}; windows.toastHide(); windows.splitStop(); }
      term.push([seg('所有辅助功能已' + (val ? '开启' : '关闭') + '。', C.PaleGreen)]);
      if (state.cwd === '~\\game1-xri\\a\\a_resource' || state.cwd === '~\\game1-xri\\auxiliary') showView(state.cwd);
      return;
    }

    // scr.num=
    if (command.indexOf('scr.num=') === 0) {
      if (!state.auxOn.Ax11 && !state.devMode) { unknownCommand(command); return; }
      var rawN = command.slice(8).trim(), maxSplit = state.devMode ? 32 : 8;
      var okN = /^\d+$/.test(rawN), nn = okN ? parseInt(rawN, 10) : 0;
      if (!okN || nn < 1) {
        term.push([seg('用法：scr.num=<数量>  数量须为 ≥1 的整数（分屏数量，上限 8）', C.RedDusted)]); return;
      }
      if (nn > maxSplit) {
        term.push([seg('分屏数量上限为 ' + maxSplit + '，已自动限制为 ' + maxSplit + '。', C.Front)]);
        nn = maxSplit;
      }
      state.splitCount = nn; core.writeSlot(playerName, currentSlot, state);
      if (nn === 1) windows.splitStop();
      else windows.splitStart(nn, splitContent);
      term.push([seg('已分配 ' + nn + ' 个分屏。', C.PaleGreen)]);
      term.push([seg(nn === 1 ? '（1 表示不分屏，仅使用主窗口）' : '分屏窗口已渲染。', C.Gray)]);
      return;
    }

    // 导航
    if (command === 'cd') { term.push([seg('当前路径：' + state.cwd, C.AquaSky)]); return; }
    if (command.indexOf('cd ') === 0) {
      var arg = command.slice(3).trim(), np = resolveCd(state.cwd, arg);
      if (!np || !core.pathExists(np)) term.push([seg('路径不存在：' + arg, C.RedDusted)]);
      else { state.cwd = np; term.push([seg('已到达 ' + np, C.PaleGreen)]); showDirAuto(np); term.setPrompt(core.promptPrefix(state)); }
      return;
    }
    if (command === '~') { navigateTo('~'); return; }
    if (command === 'show' || command === 'show()') { showView(state.cwd); return; }
    if (command === 'tree') {
      if (state.auxOn.Ax7) { emitTreeAx7(); return; }
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
    if (command === 'rishow_a' || command === 'rishow_a()' || command === 'rishow' || command === 'rishow()') {
      curvePanel();
      term.push([seg('资源 a：' + core.fmtNum(state.a.amount) + '   速度：+' + core.fmtNum(state.a.rate) + '/s', C.Front)]);
      return;
    }
    // warn：与 C++ 一样，任意以 warn 开头的命令都进入本分支
    if (command.indexOf('warn') === 0) {
      var wm = /-min\s*=\s*(\d+)/.exec(command);
      if (!wm) {
        term.push([seg('购买提醒最小间隔 n = ' + Math.floor(state.warnMin) +
          ' 秒（用法：warn -min=N，N 为秒数，例如 warn -min=30）', C.PaleGreen)]);
      } else {
        var wv = Math.min(600, Math.max(1, parseInt(wm[1], 10)));
        state.warnMin = wv; core.writeSlot(playerName, currentSlot, state);
        Object.keys(remindStep).forEach(function (k) { remindStep[k] = 1; });
        term.push([seg('购买提醒最小间隔已设为 ' + wv + ' 秒。', C.PaleGreen)]);
      }
      return;
    }

    // 购买项
    var item = core.findBuyItem(command);
    if (item && (item.path === state.cwd || state.auxOn.Ax14 || state.devMode)) { buy(item, 1); return; }

    // Ax10 自定义命令执行（对齐 C++：&& 链式 + 16 层递归保护，防自引用死循环）
    if (state.auxOn.Ax10 && state.customCmds[command] !== undefined) {
      if (depth >= 16) {
        term.push([seg('自定义命令嵌套过深，已停止执行（' + command + '）。', C.RedDusted)]); return;
      }
      state.customCmds[command].split('&&').forEach(function (part) {
        if (part.trim()) executeCommand(part.trim(), depth + 1);
      });
      return;
    }

    unknownCommand(command);
  }

  // ---------- 回显（语法高亮）----------
  function echoCommand(cmd) {
    var p = core.promptPrefix(state);
    var en = term.push([seg(p, 'Front')].concat(highlightCommand(cmd)));
    term.markCommand(en);   // Ax5：标记命令块起点
  }
  // Ax5 开启时的编辑器说明（对齐 C++ Ax5 on 分支）
  function ax5Help() {
    term.push([seg('更好的终端（类编辑器）：', C.PaleYellow)]);
    term.push([seg(' · 点击历史命令行以选中（Ctrl+点击可多选）；选中块左侧有 ▌ 标记。', C.PaleYellow)]);
    term.push([seg(' · Ctrl+C 复制、Ctrl+X 剪切、Ctrl+V 在选中处粘贴；Ctrl+K 删除选中块（命令+结果一起）。', C.PaleYellow)]);
    term.push([seg(' · Ctrl+↑/↓ 上下移动选中块（结果随命令一起移动、始终在命令下方）。', C.PaleYellow)]);
    term.push([seg(' · 也可用命令：copy / cut / paste / del / mov up|down / sel <序号> / unsel / insert。', C.PaleYellow)]);
    term.push([seg(' · Ctrl+Enter 把选中命令取回输入框就地编辑后执行。', C.PaleYellow)]);
  }
  function syncEditor() { term.setEditorEnabled(!!state.auxOn.Ax5); }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- 分屏内容（真实镜像主终端最近输出）----------
  function splitContent() {
    var lines = term.recentLines(12);
    var html = '<div class="split-head">' + escapeHtml(core.promptPrefix(state)) + '</div>';
    html += lines.map(function (l) { return '<div>' + escapeHtml(l) + '</div>'; }).join('');
    html += '<div class="split-stat">a: ' + escapeHtml(core.fmtNum(state.a.amount)) +
      '   +' + escapeHtml(core.fmtNum(state.a.rate)) + '/s   ' +
      escapeHtml(new Date().toLocaleTimeString('zh-CN')) + '</div>';
    return html;
  }

  // ---------- 底部状态栏（实时游戏信息）----------
  var lastStatusText = '';
  function renderStatusBar() {
    var bar = document.getElementById('statusbar');
    if (!bar) return;
    var clock = new Date().toLocaleTimeString('zh-CN');
    var txt = [playerName, currentSlot, state.cwd, core.fmtNum(state.a.amount), core.fmtNum(state.a.rate), clock].join('|');
    if (txt === lastStatusText) return;
    lastStatusText = txt;
    bar.innerHTML = '';
    function group(cls) {
      var g = document.createElement('span'); g.className = 'sb-group ' + cls; bar.appendChild(g); return g;
    }
    function chip(parent, cls, text) {
      var s = document.createElement('span'); s.className = 'sb-chip ' + (cls || '');
      s.textContent = text; parent.appendChild(s); return s;
    }
    var g1 = group('sb-brand-group');
    chip(g1, 'sb-brand', '◆ CONSOLE INCREMENTAL');
    chip(g1, 'sb-dim', '@ ' + VERSION);
    var g2 = group('sb-mid');
    chip(g2, 'sb-label', 'PLAYER'); chip(g2, 'sb-strong', playerName || '—');
    chip(g2, 'sb-label', 'SLOT'); chip(g2, 'sb-strong', String(currentSlot));
    chip(g2, 'sb-label', 'a'); chip(g2, 'sb-strong', core.fmtNum(state.a.amount));
    chip(g2, 'sb-rate', '+' + core.fmtNum(state.a.rate) + '/s');
    chip(g2, 'sb-path', state.cwd);
    var g3 = group('sb-end');
    chip(g3, 'sb-live', 'ONLINE');
    chip(g3, 'sb-clock', clock);
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
    if (inp && inp.getBoundingClientRect) {
      var r = inp.getBoundingClientRect();
      box.style.left = Math.min(r.left, window.innerWidth - 300) + 'px';
      box.style.top = Math.max(8, r.top - Math.min(completion.items.length, 12) * 24 - 8) + 'px';
    }
    completion.items.forEach(function (item, i) {
      var d = document.createElement('div');
      d.className = 'completion-item' + (i === completion.index ? ' selected' : '');
      if (!takesEffect(item)) d.classList.add('invalid');
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
    // 欢迎页看门狗：即使定时器被后台标签页节流，只要页面在前台渲染一帧就强制推进
    if (!inShell && !welcomeDone && bootStartedAt && Date.now() - bootStartedAt > 2600 && typeof flowBackdropAction === 'function') {
      flowBackdropAction();
    }
    var dt = Math.min(0.25, (now - lastTick) / 1000);
    lastTick = now;
    if (inShell) {
      state.a.rate = core.computeRate(state);
      state.a.amount = core.numAdd(state.a.amount, state.a.rate * dt);
      if (core.numCmp(state.a.amount, state.maxAmountA) > 0) state.maxAmountA = state.a.amount;
      // 曲线历史（每 ~0.5s 采样）
      if (!loop._acc) loop._acc = 0;
      loop._acc += dt;
      if (loop._acc > 0.5) { loop._acc = 0; resHistory.push(core.numToDouble(state.a.amount)); if (resHistory.length > 200) resHistory.shift(); }
      // 自动保存（每 30s）
      if (now - lastAutoSave > 30000) { lastAutoSave = now; core.writeSlot(playerName, currentSlot, state); }
      // Ax8 终端提醒 / Ax9 浮层提醒
      if (now - lastToastCheck > 1000) {
        lastToastCheck = now;
        checkReminders();
      }
      // Ax11 分屏
      if (state.auxOn.Ax11 && state.splitCount > 1 && !windows.splitIsRunning()) {
        windows.splitStart(state.splitCount, splitContent);
      }
      if (now - lastSplitRefresh > 200) {
        lastSplitRefresh = now;
        if (state.auxOn.Ax11 && state.splitCount > 1) windows.splitRefresh();
      }
      if (now - lastStatusRefresh > 500) { lastStatusRefresh = now; renderStatusBar(); }
      term.render();
    }
    requestAnimationFrame(loop);
  }
  function checkReminders() {
    var affordable = core.affordableItems(state);
    if (!affordable.length) return;
    var nowSec = Date.now() / 1000;
    // Ax8 终端内提醒：可购买集合变化立即提醒，否则按间隔降频
    if (state.auxOn.Ax8) {
      var sig = affordable.map(function (x) { return x.id; }).join(',');
      if (sig !== remindAx8Sig || nowSec - remindAx8At >= state.warnMin * 3) {
        remindAx8Sig = sig; remindAx8At = nowSec;
        term.push([seg(G_DOT + ' 购买提醒：' + affordable.map(function (x) {
          return x.id + '（' + core.fmtNum(core.buyPriceBase(x, core.buyCount(state, x.id))) + ' a）';
        }).join('、') + ' 现在可以购买。', C.PaleYellow)]);
      }
    }
    // Ax9 游戏外提醒：按 warnMin 与降频 step
    if (state.auxOn.Ax9 && !windows.toastIsVisible()) {
      var due = affordable.filter(function (it) {
        var last = remindLast[it.id] || 0;
        var step = remindStep[it.id] || 1;
        return (nowSec - last) >= state.warnMin * step;
      });
      if (due.length) {
        var picked = due[0];
        var last = remindLast[picked.id] || 0;
        if (last && (nowSec - last) < state.warnMin) remindStep[picked.id] = (remindStep[picked.id] || 1) + 1;
        else remindStep[picked.id] = 1;
        due.forEach(function (x) { remindLast[x.id] = nowSec; });
        windows.toastShow('可购买：' + picked.id + ' — ' + picked.content + picked.effect(state), 6500);
      }
    }
  }

  // ---------- 启动异常可见化：任何脚本错误都不再表现为黑屏 ----------
  function showFatal(msg) {
    var box = document.getElementById('fatal');
    if (!box) return;
    box.hidden = false;
    box.style.display = 'flex';
    box.innerHTML = '';
    var card = document.createElement('div'); card.className = 'fatal-card';
    var h = document.createElement('div'); h.className = 'fatal-title'; h.textContent = '启动异常';
    var p = document.createElement('div'); p.className = 'fatal-detail'; p.textContent = String(msg);
    var tip = document.createElement('div'); tip.className = 'fatal-tip';
    tip.textContent = '可尝试重新加载；若仍失败，请检查浏览器控制台。';
    var btn = document.createElement('button'); btn.className = 'flow-btn primary'; btn.textContent = '重新加载';
    btn.addEventListener('click', function () { if (global.location && global.location.reload) global.location.reload(); });
    card.appendChild(h); card.appendChild(p); card.appendChild(tip); card.appendChild(btn);
    box.appendChild(card);
  }
  try {
    global.addEventListener('error', function (e) {
      showFatal((e && e.message ? e.message : '未知脚本错误') +
        (e && e.filename ? '（' + e.filename + ':' + e.lineno + '）' : ''));
    });
    global.addEventListener('unhandledrejection', function (e) {
      showFatal('异步操作失败：' + (e && e.reason && e.reason.message ? e.reason.message : String(e && e.reason)));
    });
  } catch (e) {}

  // ---------- 流程界面：欢迎 / 名称 / 槽位 / 游戏 ----------
  var flowEl = null;
  var flowKeyHandler = null, flowBackdropAction = null;
  var bootTimer = null, bootWatchdog = null, welcomeDone = false, bootStartedAt = 0;

  function ensureFlow() {
    if (!flowEl) {
      flowEl = document.createElement('div');
      flowEl.className = 'flow-overlay';
      // 点击遮罩空白处也能推进，避免只能靠键盘 / 定时器
      flowEl.addEventListener('click', function (e) {
        if (e.target === flowEl && typeof flowBackdropAction === 'function') flowBackdropAction();
      });
      document.getElementById('app').appendChild(flowEl);
    }
    return flowEl;
  }
  function bindFlowKeys(fn) { unbindFlowKeys(); flowKeyHandler = fn; document.addEventListener('keydown', flowKeyHandler); }
  function unbindFlowKeys() {
    if (flowKeyHandler) { document.removeEventListener('keydown', flowKeyHandler); flowKeyHandler = null; }
  }
  function hideFlow() {
    unbindFlowKeys();
    flowBackdropAction = null;
    if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
    if (bootWatchdog) { clearTimeout(bootWatchdog); bootWatchdog = null; }
    if (flowEl) { flowEl.innerHTML = ''; flowEl.style.display = 'none'; }
  }
  function showFlow(html) {
    var f = ensureFlow();
    f.innerHTML = html; f.style.display = 'flex';
  }
  function stepBar(active) {
    var names = ['玩家名称', '存档槽位', '进入游戏'];
    return '<div class="step-bar">' + names.map(function (n, i) {
      var k = i + 1, cls = k === active ? 'active' : (k < active ? 'done' : '');
      return '<div class="step ' + cls + '"><span class="step-num">' + (k < active ? '◆' : k) + '</span><span class="step-name">' + n + '</span></div>';
    }).join('<span class="step-link"></span>') + '</div>';
  }
  function flowWelcome() {
    welcomeDone = false;
    bootStartedAt = Date.now();
    showFlow(
      '<div class="boot-panel">' +
        '<div class="boot-mark">◆</div>' +
        '<div class="welcome-text">WELCOME TO CONSOLE INCREMENTAL</div>' +
        '<div class="boot-sub">@ ' + VERSION + '  ·  a virtual console idle game</div>' +
        '<div class="boot-check">' +
          '<div><span class="ck">[ OK ]</span> 终端渲染器已就绪</div>' +
          '<div><span class="ck">[ OK ]</span> 资源系统已装载</div>' +
          '<div><span class="ck">[ OK ]</span> 存档管理器已连接</div>' +
        '</div>' +
        '<div class="boot-actions"><button class="flow-btn primary" id="bootEnter">进入游戏 <span>▸</span></button></div>' +
        '<div class="flow-hint">按任意键或点击继续 · 稍后自动进入</div>' +
      '</div>'
    );
    // 文字保持可见（不淡出到透明），四重推进入口：按钮 / 任意键 / 点击遮罩 / 定时器
    function finish() {
      if (welcomeDone) return;
      welcomeDone = true;
      if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
      if (bootWatchdog) { clearTimeout(bootWatchdog); bootWatchdog = null; }
      unbindFlowKeys();
      flowBackdropAction = null;
      flowName();
    }
    flowBackdropAction = finish;
    var btn = document.getElementById('bootEnter');
    if (btn) btn.addEventListener('click', finish);
    bindFlowKeys(function (e) {
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      finish();
    });
    bootTimer = setTimeout(finish, 1600);
    bootWatchdog = setTimeout(finish, 4000);
  }
  function flowName() {
    var saves = [];
    try { saves = core.listSaves() || []; } catch (e) { saves = []; }
    showFlow(
      '<div class="flow-card">' + stepBar(1) +
      '<div class="flow-kicker">SESSION / 01</div>' +
      '<div class="flow-title">CONSOLE INCREMENTAL</div>' +
      '<div class="flow-sub">@ ' + VERSION + '  ·  a virtual console idle game</div>' +
      '<div class="flow-divider"></div>' +
      '<div class="flow-prompt">请输入你的玩家名称</div>' +
      '<div class="input-row">' +
        '<input id="nameInput" class="flow-input" autocomplete="off" placeholder="Player name" />' +
        '<button class="flow-btn primary" id="nameContinue">继续 <span>▸</span></button>' +
      '</div>' +
      '<div id="saveSuggest" class="flow-suggest"></div>' +
      '<div class="flow-hint">按回车或点击「继续」</div>' +
      '</div>'
    );
    var inp = document.getElementById('nameInput');
    var box = document.getElementById('saveSuggest');
    // Func2：输入中包含已有存档名的任意字符/字符串时，下方显示这些存档的信息；
    // 点击某条自动补全玩家名，回车后读取该存档。
    function renderSuggest() {
      if (!box) return;
      var q = inp ? inp.value.trim() : '';
      var matched = saves.filter(function (s) {
        return q ? s.toLowerCase().indexOf(q.toLowerCase()) >= 0 : true;
      });
      if (!matched.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
      box.style.display = 'block';
      box.innerHTML = '<div class="suggest-title">' + (q ? '匹配的已有存档' : '检测到已有存档') + '（点击填入）：</div>' +
        matched.map(function (s) {
          var info = null;
          try { info = core.saveInfo(s); } catch (e) {}
          var line = '存档 ' + escapeHtml(s);
          if (info) line += '<span class="suggest-meta">上次保存：槽位' + info.lastSlot + ':' + escapeHtml(info.summary) + '</span>';
          return '<div class="save-chip" data-name="' + escapeHtml(s) + '">' + line + '</div>';
        }).join('');
      Array.prototype.forEach.call(box.querySelectorAll('.save-chip'), function (chip) {
        chip.addEventListener('click', function () {
          if (inp) { inp.value = chip.getAttribute('data-name'); inp.focus(); renderSuggest(); }
        });
      });
    }
    function submit() {
      var name = inp ? inp.value.trim() : '';
      if (!name) {
        if (inp) {
          inp.classList.add('shake');
          setTimeout(function () { inp.classList.remove('shake'); }, 420);
          inp.focus();
        }
        return;
      }
      playerName = name;
      try { if (!core.saveExists(name)) core.createSave(name); } catch (e) {}
      unbindFlowKeys();
      flowBackdropAction = null;
      flowSlot();
    }
    flowBackdropAction = null;
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      inp.addEventListener('input', renderSuggest);
    }
    var cont = document.getElementById('nameContinue');
    if (cont) cont.addEventListener('click', submit);
    renderSuggest();
  }
  function flowSlot() {
    var rows = '';
    for (var i = 1; i <= core.SLOT_COUNT; i++) {
      var sd = null, summary = '';
      try { sd = core.readSlot(playerName, i); if (sd) summary = core.slotSummary(playerName, i); } catch (e) { sd = null; }
      rows += '<div class="slot-row" data-slot="' + i + '">' +
        '<span class="slot-id"><i>' + i + '</i></span>' +
        '<span class="slot-info"><b>槽位 ' + i + '</b><em>' + (sd ? escapeHtml(summary) : '（空槽位，从零开始）') + '</em></span>' +
        '<span class="slot-arrow">▸</span>' +
        '</div>';
    }
    showFlow(
      '<div class="flow-card wide">' + stepBar(2) +
      '<div class="flow-kicker">SESSION / 02</div>' +
      '<div class="flow-title">选择存档槽位</div>' +
      '<div class="flow-sub">玩家：<span class="hl">' + escapeHtml(playerName) + '</span>  ·  每个存档含 ' + core.SLOT_COUNT + ' 个独立槽位</div>' +
      '<div class="flow-divider"></div>' +
      rows +
      '<div class="flow-actions">' +
        '<button class="flow-btn ghost" id="slotBack">← 返回</button>' +
        '<button class="flow-btn primary" id="slotContinue">使用槽位 ' + currentSlot + ' <span>▸</span></button>' +
      '</div>' +
      '<div class="flow-hint">点击槽位或直接按数字键 1–' + core.SLOT_COUNT + '</div>' +
      '</div>'
    );
    function choose(slot) {
      unbindFlowKeys();
      flowBackdropAction = null;
      currentSlot = slot;
      var sd = null;
      try { sd = core.readSlot(playerName, slot); } catch (e) { sd = null; }
      state = core.createState();
      if (sd) {
        try { core.slotToState(sd, state); core.applyOfflineProgress(state, sd); } catch (e) {}
      }
      flowGame();
    }
    function onKey(e) {
      if (/^[1-9]$/.test(e.key)) {
        var s = parseInt(e.key, 10);
        if (s >= 1 && s <= core.SLOT_COUNT) choose(s);
      } else if (e.key === 'Enter') choose(currentSlot);
    }
    bindFlowKeys(onKey);
    Array.prototype.forEach.call(flowEl.querySelectorAll('.slot-row'), function (row) {
      row.addEventListener('click', function () { choose(parseInt(row.getAttribute('data-slot'), 10)); });
    });
    var back = document.getElementById('slotBack');
    if (back) back.addEventListener('click', function () { unbindFlowKeys(); flowName(); });
    var cont = document.getElementById('slotContinue');
    if (cont) cont.addEventListener('click', function () { choose(currentSlot); });
  }
  function flowGame() {
    showFlow(
      '<div class="flow-card">' + stepBar(3) +
      '<div class="flow-kicker">SESSION / 03</div>' +
      '<div class="flow-title">选择小游戏</div>' +
      '<div class="flow-sub">已就绪：玩家 ' + escapeHtml(playerName) + '  ·  槽位 ' + currentSlot + '</div>' +
      '<div class="flow-divider"></div>' +
      '<div class="game-row" id="gameRow">' +
        '<span class="game-icon">▸</span>' +
        '<span class="game-meta"><b>Game1-xri</b><em>资源 a · 购买项 · 路径探索</em></span>' +
        '<span class="game-tag">AVAILABLE</span>' +
      '</div>' +
      '<div class="flow-actions"><button class="flow-btn primary" id="gameEnter">进入终端 <span>▸</span></button></div>' +
      '<div class="flow-hint">按回车或点击「进入终端」</div>' +
      '</div>'
    );
    function enter() {
      unbindFlowKeys();
      flowBackdropAction = null;
      enterShell();
    }
    function onKey(e) { if (e.key === 'Enter') enter(); }
    bindFlowKeys(onKey);
    flowBackdropAction = enter;
    var gr = document.getElementById('gameRow');
    if (gr) gr.addEventListener('click', enter);
    var ge = document.getElementById('gameEnter');
    if (ge) ge.addEventListener('click', enter);
  }
  function enterShell() {
    hideFlow();
    inShell = true;
    syncEditor();
    term.setPrompt(core.promptPrefix(state));
    // TODO 6 / C++ 进入命令行时的状态块
    term.push([seg('Console Incremental @' + VERSION, C.AquaSky)]);
    term.push([seg('Player : ' + playerName, C.BrightWhite)]);
    term.push([seg('Slot : ' + currentSlot, C.BrightWhite)]);
    term.push([seg('Game1-xri', C.AquaSky)]);
    term.pushLive(function () { return [seg('教程：' + (state.tutorialOn ? '开' : '关'), C.PaleYellow)]; });
    term.push([seg('输入 help 并按下回车以查看命令列表', C.PaleGreen)]);
    if (state.tutorialOn && state.tutorialStage === 0) {
      term.push([seg('教程：输入 res_a 查看资源 a 的信息。', C.PaleGreen)]);
    }
    term.blank();
    if (state.devMode) document.title = 'Console Incremental @ ' + VERSION + ' (dev mode)';
    if (!windows.newsIsRunning()) windows.newsStart(windows.NEWS_ITEMS);
    if (state.auxOn.Ax11 && state.splitCount > 1) windows.splitStart(state.splitCount, splitContent);
    renderStatusBar();
    term.focus();
  }

  // ---------- 启动 ----------
  function start() {
    try {
      var app = document.getElementById('app');
      if (app && !document.getElementById('statusbar')) {
        var bar = document.createElement('div');
        bar.id = 'statusbar';
        app.appendChild(bar);
      }
      term.init('terminal');
      var savedTheme = 'default';
      try { savedTheme = localStorage.getItem(THEME_KEY) || 'default'; } catch (e) {}
      applyTheme(savedTheme, true);
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
      // ESC 退出游戏（输入框为空时）；Ctrl+Enter 把选中命令取回输入框
      term.onEscape(function () { executeCommand('exit'); });
      term.onEditorInsert(function () {
        var t = term.selectedBlockText();
        if (t) term.setInput(t);
        term.focus();
      });
      // 自动保存第三种情况：退出游戏（关闭 / 刷新页面）时保存
      try {
        global.addEventListener('beforeunload', function () {
          if (inShell && playerName) core.writeSlot(playerName, currentSlot, state);
        });
      } catch (e) {}
      lastTick = performance.now();
      requestAnimationFrame(loop);
      renderStatusBar();
      flowWelcome();
    } catch (err) {
      showFatal((err && err.message ? err.message : String(err)));
      if (global.console && console.error) console.error(err);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  global.INC.game = {
    getState: function () { return state; },
    execute: executeCommand,
    enterShell: enterShell,
    setPlayer: function (n, slot) { playerName = n; currentSlot = slot || 1; },
    setFlow: function (fn) { if (fn === 'name') flowName(); else if (fn === 'slot') flowSlot(); else if (fn === 'game') flowGame(); },
    applyTheme: applyTheme
  };
})(window);
