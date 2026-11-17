/* Console Incremental — 游戏内核 (移植自 C++ main.cpp / save_manager.h / bignum.cpp)
 * 纯逻辑，不依赖 DOM。暴露 window.INC.core。
 */
(function (global) {
  'use strict';

  // ---- 调色板：与 C++ console_renderer.cpp 的 16 色主题一致 ----
  var BASE_PALETTE = {
    BG: '#0b0e14', ROYAL: '#4169e1', PALE_GREEN: '#a1ecab', AQUA_SKY: '#86b8ef',
    RED_DUSTED: '#de6663', PURPLE: '#b98cff', PALE_YELLOW: '#f0d456', FRONT: '#e6ebf2',
    PANEL: '#63759c', L_BLUE: '#7e9bff', L_GREEN: '#62f06c', L_AQUA: '#afd4ff',
    L_RED: '#ff9b98', L_PURPLE: '#e0b3ff', L_YELLOW: '#ffd86b', BRIGHT: '#ffffff'
  };
  // 可选主题（color <名称>）。仅覆盖差异色，其余沿用默认。
  var THEMES = {
    default: {},
    ocean: {
      BG: '#07161c', ROYAL: '#1f8fb0', PALE_GREEN: '#8ef0c4', AQUA_SKY: '#6fd9e8',
      RED_DUSTED: '#e5736a', PALE_YELLOW: '#ecd885', FRONT: '#dff2f6', PANEL: '#4d8b9c',
      L_BLUE: '#5ad1e6', L_GREEN: '#66f0a8', L_AQUA: '#a9e9f5', L_RED: '#ffa39c'
    },
    amber: {
      BG: '#16100a', ROYAL: '#d08020', PALE_GREEN: '#cfe49a', AQUA_SKY: '#f0c060',
      RED_DUSTED: '#e07050', PALE_YELLOW: '#ffd86b', FRONT: '#f2e2c4', PANEL: '#a08050',
      L_BLUE: '#ffcf7a', L_GREEN: '#b6e878', L_AQUA: '#ffe0a0', L_RED: '#ffab90'
    },
    mono: {
      BG: '#101010', ROYAL: '#7d7d7d', PALE_GREEN: '#c8c8c8', AQUA_SKY: '#c0c0c0',
      RED_DUSTED: '#a8a8a8', PALE_YELLOW: '#e0e0e0', FRONT: '#e8e8e8', PANEL: '#808080',
      L_BLUE: '#b0b0b0', L_GREEN: '#d0d0d0', L_AQUA: '#d8d8d8', L_RED: '#bcbcbc',
      PURPLE: '#a0a0a0', L_PURPLE: '#cccccc', L_YELLOW: '#e4e4e4'
    }
  };
  var PALETTE = {}, themeName = 'default';
  function setTheme(name) {
    if (!THEMES[name]) return false;
    Object.keys(BASE_PALETTE).forEach(function (k) { PALETTE[k] = BASE_PALETTE[k]; });
    Object.keys(THEMES[name]).forEach(function (k) { PALETTE[k] = THEMES[name][k]; });
    themeName = name;
    return true;
  }
  function getTheme() { return themeName; }
  setTheme('default');
  var C = {
    Front: 'FRONT', Gray: 'PANEL', Panel: 'PANEL', BG: 'BG', Black: 'BG', White: 'FRONT',
    LightGreen: 'L_GREEN', LightRed: 'L_RED', AquaSky: 'AQUA_SKY', LightCyan: 'L_AQUA',
    PaleGreen: 'PALE_GREEN', PaleYellow: 'PALE_YELLOW', RedDusted: 'RED_DUSTED',
    BrightWhite: 'BRIGHT', Royal: 'ROYAL', Purple: 'PURPLE', LightBlue: 'L_BLUE',
    LightYellow: 'L_YELLOW', Green: 'PALE_GREEN', Red: 'RED_DUSTED', Yellow: 'PALE_YELLOW',
    Cyan: 'AQUA_SKY', Blue: 'ROYAL', Magenta: 'PURPLE'
  };
  function css(colorKey) {
    if (PALETTE[colorKey]) return PALETTE[colorKey];
    if (C[colorKey]) return PALETTE[C[colorKey]];
    return PALETTE.FRONT;
  }

  // ---- BigNum：复刻 C++ bignum.cpp 的塔式科学计数法（Func23 / TODO 18）----
  // 有限值直接存 number；超出 double 范围时改用 tower：
  //   value = m[0] * 10^( m[1] * 10^( ... * 10^x ) )
  // 规则：<1e5 普通小数；1e5..1e100000 为 n e x；再大为 m e n e x；
  //       1e1e1000 起压缩为 ee x / eee x / …
  function isBN(o) { return !!o && typeof o === 'object' && o.__bn === 1; }
  function bnFinite(v) { return { __bn: 1, v: v, tower: null }; }
  function bnTower(m, x) { return { __bn: 1, v: Infinity, tower: { m: m.slice(), x: x } }; }
  function fmtPlain(v) {
    if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
    return v.toFixed(2);
  }
  function trimSig(s) {
    if (s.indexOf('.') < 0 && s.indexOf('e') < 0 && s.indexOf('E') < 0) return s;
    var parts = s.split(/[eE]/);
    var head = parts[0];
    if (head.indexOf('.') >= 0) head = head.replace(/0+$/, '').replace(/\.$/, '');
    return head + (parts.length > 1 ? 'e' + parts[1] : '');
  }
  function fmtMantissa(m) { return trimSig(Number(m.toPrecision(6)).toString()); }
  function bnToString(b) {
    if (!b.tower) {
      var v = b.v;
      if (v === 0) return '0';
      var neg = v < 0, a = Math.abs(v);
      if (a < 1e5) return (neg ? '-' : '') + fmtPlain(a);
      if (!isFinite(a)) return (neg ? '-' : '') + 'ee999';
      var lx = Math.floor(Math.log10(a)), xi = Math.floor(lx);
      var m0 = a / Math.pow(10, lx);
      if (!isFinite(m0)) m0 = 1;
      var ms = fmtMantissa(m0);
      if (parseFloat(ms) >= 10) { ms = '1'; xi += 1; }
      return (neg ? '-' : '') + ms + 'e' + xi;
    }
    var m = b.tower.m, x = b.tower.x, d = m.length;
    if (d === 1) return x < 5 ? fmtPlain(m[0] * Math.pow(10, x)) : fmtMantissa(m[0]) + 'e' + x;
    if (d === 2) return x < 1000
      ? fmtMantissa(m[0]) + 'e' + fmtMantissa(m[1]) + 'e' + x
      : 'ee' + x;
    return new Array(d + 1).join('e') + x;
  }
  function fmtNum(v) {
    if (isBN(v)) return bnToString(v);
    if (typeof v === 'string') return v;
    return bnToString(bnFinite(Number(v) || 0));
  }
  var fmtRes = fmtNum;

  // 解析：支持 1e5 / 1.2e5 / "n e x" / "m e n e x" / "ee 1000" / "eee 1000"
  // 有限值返回 number，超出 double 的塔式值返回 BigNum 对象，无效返回 NaN。
  function parseNum(str) {
    var t = String(str).trim();
    if (!t) return NaN;
    var sign = 1;
    if (t.charAt(0) === '+') t = t.slice(1);
    else if (t.charAt(0) === '-') { sign = -1; t = t.slice(1); }
    // 紧凑塔式：ee 1000 / eee1000 / …
    var cm = /^(e{1,8})\s*(\d+)$/i.exec(t);
    if (cm) return bnTower(new Array(cm[1].length).fill(1), parseInt(cm[2], 10));
    // 空格分隔的 n e x / m e n e x（策划案写法）
    var sp = /^([\d.]+)\s+e\s+([\d.]+)(?:\s+e\s+(\d+))?$/i.exec(t);
    if (sp) {
      var n0 = parseFloat(sp[1]);
      if (sp[3] !== undefined) return bnTower([n0, parseFloat(sp[2])], parseInt(sp[3], 10));
      var xv = parseInt(sp[2], 10);
      if (xv < 100000) return sign * n0 * Math.pow(10, xv);
      var lx = Math.floor(Math.log10(xv));
      return bnTower([n0, xv / Math.pow(10, lx)], lx);
    }
    var n = Number(t);
    if (!isNaN(n) && isFinite(n)) return sign * n;
    // 溢出：1e100000 之类，按 C++ 提升为二层塔
    var sci = /^([\d.]+)e\+?(\d+)$/i.exec(t);
    if (sci) {
      var mant = parseFloat(sci[1]), exp = parseInt(sci[2], 10);
      if (exp >= 100000) {
        var lx2 = Math.floor(Math.log10(exp));
        return bnTower([mant, exp / Math.pow(10, lx2)], lx2);
      }
      var val = mant * Math.pow(10, exp);
      if (isFinite(val)) return sign * val;
      return sign > 0 ? bnTower([mant, 1], Math.floor(Math.log10(exp))) : NaN;
    }
    return NaN;
  }
  // 资源数量的运算 / 比较辅助（amount 可能是 number 或 BigNum）
  function numValid(x) {
    return x !== null && x !== undefined &&
      (isBN(x) || (typeof x === 'number' && !isNaN(x)));
  }
  function numToDouble(x) {
    if (isBN(x)) return x.tower ? Infinity : x.v;
    return typeof x === 'number' ? x : (+x || 0);
  }
  function numCmp(a, b) {
    var ta = isBN(a) ? a.tower : null, tb = isBN(b) ? b.tower : null;
    var av = isBN(a) ? a.v : (+a || 0), bv = isBN(b) ? b.v : (+b || 0);
    if (av !== bv) return av < bv ? -1 : 1;
    if (ta && tb) {
      if (ta.m.length !== tb.m.length) return ta.m.length < tb.m.length ? -1 : 1;
      if (ta.x !== tb.x) return ta.x < tb.x ? -1 : 1;
      for (var i = 0; i < ta.m.length; i++)
        if (ta.m[i] !== tb.m[i]) return ta.m[i] < tb.m[i] ? -1 : 1;
    }
    return 0;
  }
  function numAdd(a, b) {
    if (isBN(a)) { if (a.tower) return a; a = a.v; }
    if (isBN(b)) { if (b.tower) return b; b = b.v; }
    return (+a || 0) + (+b || 0);
  }
  function numSub(a, b) {
    if (isBN(a)) { if (a.tower) return a; a = a.v; }
    if (isBN(b)) { if (b.tower) return a; b = b.v; }
    return (+a || 0) - (+b || 0);
  }
  function numGte(a, b) { return numCmp(a, b) >= 0; }
  function numSerialize(x) {
    return isBN(x) ? (x.tower ? { __bnTower: [x.tower.m, x.tower.x] } : x.v) : x;
  }
  function numDeserialize(x) {
    if (x && typeof x === 'object' && x.__bnTower) return bnTower(x.__bnTower[0], x.__bnTower[1]);
    return typeof x === 'number' ? x : (+x || 0);
  }
  function formatDuration(secs) {
    var s = Math.round(secs);
    var h = Math.floor(s / 3600); s %= 3600;
    var m = Math.floor(s / 60); s %= 60;
    var out = '';
    if (h > 0) out += h + '小时';
    if (m > 0) out += m + '分';
    return out + s + '秒';
  }

  // ---- 游戏状态 ----
  function createState() {
    return {
      a: { amount: 0, rate: 1.0 },
      cwd: '~', buys: {}, olpgOn: true, createdTime: nowString(),
      maxAmountA: 0, devMode: false, tutorialOn: true, tutorialStage: 0,
      warnMin: 20, splitCount: 1, defaultFg: 7,
      auxOn: {
        Ax1: true, Ax2: false, Ax3: true, Ax4: false, Ax5: false, Ax6: false,
        Ax7: false, Ax8: false, Ax9: false, Ax10: false, Ax11: false, Ax12: false,
        Ax13: false, Ax14: false, Ax15: false, Ax16: false
      },
      customCmds: {}
    };
  }
  function nowString() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function parseTime(s) {
    var m = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || '');
    if (!m) return NaN;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  }

  // ---- 购买项（对齐 C++ BUY_ITEMS）----
  var BA1_BASE = 1.2, BA1_PER_BA1_2 = 0.1;
  function buyCount(state, id) { return state.buys[id] || 0; }
  function buyPriceBase(it, count) { return it.priceBase + it.priceStep * count; }
  var BUY_ITEMS = [
    {
      id: 'Ba1-1', path: '~\\game1-xri\\a\\a_buff', content: '使a的获取速度',
      priceBase: 10, priceStep: 10, showTotal: true, isAdditive: false, repeatable: true, maxBuys: 0,
      effect: function (g) { return '×' + fmtRes(BA1_BASE + BA1_PER_BA1_2 * buyCount(g, 'Ba1-2')); },
      factor: function (g) {
        var b1 = buyCount(g, 'Ba1-1'), b2 = buyCount(g, 'Ba1-2');
        return Math.pow(BA1_BASE + BA1_PER_BA1_2 * b2, b1);
      },
      totalText: function (g) {
        var b1 = buyCount(g, 'Ba1-1'), b2 = buyCount(g, 'Ba1-2');
        return '×' + fmtRes(Math.pow(BA1_BASE + BA1_PER_BA1_2 * b2, b1));
      }, bonus: null
    },
    {
      id: 'Ba1-2', path: '~\\game1-xri\\a\\a_buff', content: '使每个Ba1-1的效果',
      priceBase: 100, priceStep: 100, showTotal: true, isAdditive: false, repeatable: true, maxBuys: 0,
      effect: function () { return '+' + fmtRes(BA1_PER_BA1_2); },
      factor: function () { return 1.0; },
      totalText: function (g) { return '+' + fmtRes(BA1_PER_BA1_2 * buyCount(g, 'Ba1-2')); },
      bonus: null
    },
    {
      id: 'Ua1-1', path: '~\\game1-xri\\a\\a_upgrade', content: '基于当前所拥有的a，给予a一个加成',
      priceBase: 3000, priceStep: 0, showTotal: true, isAdditive: false, repeatable: false, maxBuys: 0,
      effect: function () { return ''; },
      factor: function (g) {
        if (buyCount(g, 'Ua1-1') <= 0) return 1.0;
        return Math.max(1.0, Math.sqrt(Math.max(0, numToDouble(g.a.amount))) / 5.0);
      },
      totalText: function (g) { return '×' + fmtRes(Math.max(1.0, Math.sqrt(Math.max(0, numToDouble(g.a.amount))) / 5.0)); },
      bonus: function () { return 0.0; }
    },
    {
      id: 'Ua1-2', path: '~\\game1-xri\\a\\a_upgrade', content: '使Ba1-1的效果×2',
      priceBase: 10000, priceStep: 0, showTotal: true, isAdditive: false, repeatable: false, maxBuys: 0,
      effect: function () { return ''; },
      factor: function (g) { return buyCount(g, 'Ua1-2') > 0 ? 2.0 : 1.0; },
      totalText: function (g) { return buyCount(g, 'Ua1-2') > 0 ? '×2' : '×1'; },
      bonus: function () { return 0.0; }
    }
  ];
  function findBuyItem(id) {
    for (var i = 0; i < BUY_ITEMS.length; i++) if (BUY_ITEMS[i].id === id) return BUY_ITEMS[i];
    return null;
  }
  function computeRate(g) {
    var mul = 1.0, add = 0.0;
    for (var i = 0; i < BUY_ITEMS.length; i++) {
      var it = BUY_ITEMS[i];
      if (it.isAdditive) add += (it.bonus ? it.bonus(g) : 0);
      else mul *= it.factor(g);
    }
    return mul + add;
  }

  // ---- 分段文本 ----
  function splitBold(s, tok, boldKey, baseKey) {
    var out = [];
    if (!tok) { if (s) out.push({ t: s, c: baseKey }); return out; }
    var i = 0;
    while (i < s.length) {
      var p = s.indexOf(tok, i);
      if (p < 0) { out.push({ t: s.slice(i), c: baseKey }); break; }
      if (p > i) out.push({ t: s.slice(i, p), c: baseKey });
      out.push({ t: tok, c: boldKey });
      i = p + tok.length;
    }
    return out;
  }
  function buyItemSegments(it, g) {
    var base = C.Front, green = C.LightGreen, red = C.LightRed, bold = C.AquaSky;
    var cnt = buyCount(g, it.id), price = buyPriceBase(it, cnt);
    var affordable = numGte(g.a.amount, price), ax1 = !!g.auxOn.Ax1;
    var idColor = base;
    if (ax1) {
      if (it.repeatable) { if (it.maxBuys > 0 && cnt >= it.maxBuys) idColor = green; }
      else { if (cnt > 0) idColor = green; }
    }
    var segs = [{ t: '  ', c: base }, { t: it.id, c: idColor }, { t: ':', c: base }];
    segs = segs.concat(splitBold(it.content + it.effect(g), 'a', bold, base));
    if (it.showTotal && it.totalText) segs = segs.concat(splitBold('[' + it.totalText(g) + ']', 'a', bold, base));
    segs.push({ t: '(', c: base });
    segs.push({ t: fmtRes(price), c: ax1 ? (affordable ? green : red) : base });
    segs.push({ t: ' ', c: base });
    segs.push({ t: 'a', c: bold });
    segs.push({ t: ')', c: base });
    if (g.auxOn.Ax2) segs.push({ t: ' [预计 ' + estimateAffordText(g, price) + ']', c: C.PaleYellow });
    return segs;
  }
  function formatCountdown(secs) {
    if (!isFinite(secs) || secs < 0) return '∞';
    if (secs < 60) return secs.toFixed(1) + '秒';
    if (secs < 3600) { var m = Math.floor(secs / 60), s = Math.floor(secs - m * 60); return m + '分' + s + '秒'; }
    return formatDuration(secs);
  }
  function estimateAffordText(g, price) {
    var have = numToDouble(g.a.amount);
    if (have >= price) return '已可购买';
    var rate = computeRate(g);
    if (rate <= 0) return '速度不足(∞)';
    return formatCountdown((price - have) / rate);
  }
  function affordableItems(g) {
    var out = [];
    for (var i = 0; i < BUY_ITEMS.length; i++) {
      var it = BUY_ITEMS[i], cnt = buyCount(g, it.id);
      if (it.repeatable && it.maxBuys > 0 && cnt >= it.maxBuys) continue;
      if (numGte(g.a.amount, buyPriceBase(it, cnt))) out.push(it);
    }
    return out;
  }

  // ---- 虚拟路径系统 ----
  function splitPath(path) { return String(path).split(/[\\\/]/); }
  function stripGame1Xri(path) {
    var parts = splitPath(path).filter(function (s) { return s !== 'game1-xri'; });
    if (!parts.length) return '~';
    var r = '~';
    for (var i = 1; i < parts.length; i++) r += '\\' + parts[i];
    return r;
  }
  function getChildren(path) {
    var p = stripGame1Xri(path);
    if (p === '~') {
      if (path === '~') return ['game1-xri'];
      return ['information', 'automation', 'a', 'achievement', 'auxiliary'];
    }
    if (p === '~\\a') return ['a_resource', 'a_buff', 'a_upgrade', 'a_reset'];
    if (p === '~\\automation') return ['autobuyer'];
    return [];
  }
  function pathExists(path) {
    if (path === '~') return true;
    var parts = splitPath(path);
    if (!parts.length || parts[0] !== '~') return false;
    var cur = '~';
    for (var i = 1; i < parts.length; i++) {
      if (getChildren(cur).indexOf(parts[i]) < 0) return false;
      cur = cur + '\\' + parts[i];
    }
    return true;
  }
  function normalizePath(cwd, target) {
    var absolute = target.charAt(0) === '~';
    var t = absolute ? target.slice(1) : target;
    t = t.replace(/^[\\\/]+/, '');
    var parts = (!absolute && target) ? splitPath(cwd).slice() : [];
    splitPath(t).forEach(function (tok) {
      if (!tok || tok === '.') return;
      if (tok === '..') { if (parts.length) parts.pop(); return; }
      parts.push(tok);
    });
    if (!parts.length) return '~';
    if (parts[0] !== '~') parts.unshift('~');
    var out = '~';
    for (var i = 1; i < parts.length; i++) {
      var seg = parts[i];
      if (seg === 'achievemnt') seg = 'achievement';
      out += '\\' + seg;
    }
    return out;
  }
  function promptPrefix(g) { return g.cwd + ' $ '; }

  // 目录名 / 快捷别名 → 完整路径（策划案：cd <路径> 通常可简写）
  var PATH_ALIASES = {
    info: 'information', res_a: 'a_resource', buff_a: 'a_buff', upg_a: 'a_upgrade',
    rst_a: 'a_reset', ach: 'achievement', atb: 'autobuyer', aux: 'auxiliary'
  };
  function allPaths() {
    var out = ['~'], queue = ['~'], guard = 0;
    while (queue.length && guard++ < 500) {
      var p = queue.shift();
      getChildren(p).forEach(function (c) {
        var child = p + '\\' + c;
        out.push(child); queue.push(child);
      });
    }
    return out;
  }
  function findPath(name) {
    var target = PATH_ALIASES[name] || name;
    var paths = allPaths();
    for (var i = 0; i < paths.length; i++) {
      var parts = splitPath(paths[i]);
      if (parts[parts.length - 1] === target) return paths[i];
    }
    return null;
  }

  var AX_LABELS = {
    Ax1: '购买项颜色变化', Ax2: '购买项预计可购买倒计时',
    Ax3: '每移动到一个新目录，就自动显示该目录下的内容', Ax4: '命令行命令补全',
    Ax5: '更好的终端', Ax6: '更好的资源信息', Ax7: '更好的文件夹树',
    Ax8: '终端内购买提醒（有可购买的购买项时，控制台底部弹出提醒）',
    Ax9: '游戏外消息购买提醒（有可购买的购买项时，系统弹窗提醒，前台后台均生效；同一项两次提醒间隔< n 秒则自动降频，n 由 warn -min=… 调节）',
    Ax10: '自定义命令（cmd.add/del/rm/list）', Ax11: '分屏数量（命令 scr.num=…）',
    Ax12: '命令行语法高亮', Ax13: '用户输入的资源名称自动加粗',
    Ax14: '命令的操作域增强（即命令不一定要在对应的目录下操作）',
    Ax15: '批量执行（命令后加 *n 重复执行 n 遍，解锁后无法关闭）',
    Ax16: 'tree 命令可展示最底层文件夹下的内容'
  };
  function auxiliaryLineSegments(g, id) {
    // dev 模式下所有辅助功能均为已解锁状态（策划案 S FuncX 第 2 条）
    var on = !!g.devMode || !!g.auxOn[id];
    return [
      { t: '  ' + id + '. ' + (AX_LABELS[id] || '') + '[', c: C.Front },
      { t: on ? '开' : '关', c: on ? C.LightGreen : C.RedDusted },
      { t: ']', c: C.Front }
    ];
  }

  // ---- 存档系统：多存档（玩家名标识）+ 每存档 5 槽位 + 轻量加密 ----
  var SAVE_ROOT = 'ci_html_saves_v1';
  var SLOT_COUNT = 5;
  function xorStr(s, key) {
    var out = '';
    for (var i = 0; i < s.length; i++) out += String.fromCharCode(s.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return out;
  }
  function encode(s) {
    var b64 = btoa(unescape(encodeURIComponent(s)));
    return btoa(xorStr(b64, 'CI#2026'));
  }
  function decode(s) {
    try {
      var b64 = xorStr(atob(s), 'CI#2026');
      return decodeURIComponent(escape(atob(b64)));
    } catch (e) { return '{}'; }
  }
  function readRoot() {
    try { var raw = localStorage.getItem(SAVE_ROOT); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
  }
  function writeRoot(root) {
    try { localStorage.setItem(SAVE_ROOT, JSON.stringify(root)); return true; }
    catch (e) { return false; }
  }
  function listSaves() {
    var root = readRoot();
    return Object.keys(root).filter(function (k) { return root[k] && root[k].slots; });
  }
  function createSave(name) {
    var root = readRoot();
    if (root[name]) return false;
    root[name] = { slots: new Array(SLOT_COUNT).fill(null), lastSlot: 1, createdTime: nowString() };
    return writeRoot(root);
  }
  function saveExists(name) { return !!readRoot()[name]; }
  function deleteSave(name) { var root = readRoot(); delete root[name]; return writeRoot(root); }
  function stateToSlot(g) {
    return {
      amount: numSerialize(g.a.amount), rate: computeRate(g), buys: JSON.parse(JSON.stringify(g.buys)),
      cwd: g.cwd, olpgOn: g.olpgOn, createdTime: g.createdTime, maxAmountA: numSerialize(g.maxAmountA),
      devMode: g.devMode, tutorialOn: g.tutorialOn, tutorialStage: g.tutorialStage,
      warnMin: g.warnMin, splitCount: g.splitCount, defaultFg: g.defaultFg,
      auxOn: JSON.parse(JSON.stringify(g.auxOn)),
      customCmds: JSON.parse(JSON.stringify(g.customCmds)), lastSaved: nowString()
    };
  }
  function writeSlot(name, slot, g) {
    var root = readRoot();
    if (!root[name]) root[name] = { slots: new Array(SLOT_COUNT).fill(null), lastSlot: slot, createdTime: nowString() };
    root[name].slots[slot - 1] = encode(JSON.stringify(stateToSlot(g)));
    root[name].lastSlot = slot;
    return writeRoot(root);
  }
  function readSlot(name, slot) {
    var root = readRoot();
    var s = root[name] && root[name].slots && root[name].slots[slot - 1];
    if (!s) return null;
    try { return JSON.parse(decode(s)); } catch (e) { return null; }
  }
  function hasSlotData(name, slot) { return !!readSlot(name, slot); }
  function clearSlot(name, slot) {
    var root = readRoot();
    if (root[name] && root[name].slots) { root[name].slots[slot - 1] = null; return writeRoot(root); }
    return false;
  }
  function slotSummary(name, slot) {
    var sd = readSlot(name, slot);
    if (!sd) return '(空)';
    return 'a=' + fmtNum(numDeserialize(sd.amount)) + '  上次保存 ' + (sd.lastSaved || '');
  }
  // Func2：已有存档提示「存档 xxx / 上次保存：槽位X:……」
  function saveInfo(name) {
    var s = readRoot()[name];
    if (!s) return null;
    var slot = s.lastSlot || 1;
    return { name: name, lastSlot: slot, summary: slotSummary(name, slot) };
  }
  function slotToState(sd, g) {
    if (!sd) return g;
    g.a.amount = numDeserialize(sd.amount);
    g.a.rate = computeRate(g);
    g.buys = sd.buys || {};
    g.cwd = sd.cwd || '~';
    g.olpgOn = sd.olpgOn !== false;
    g.createdTime = sd.createdTime || nowString();
    g.maxAmountA = numDeserialize(sd.maxAmountA);
    g.devMode = !!sd.devMode;
    if (typeof sd.tutorialOn === 'boolean') g.tutorialOn = sd.tutorialOn;
    if (typeof sd.tutorialStage === 'number') g.tutorialStage = sd.tutorialStage;
    if (typeof sd.warnMin === 'number') g.warnMin = sd.warnMin;
    if (typeof sd.splitCount === 'number') g.splitCount = sd.splitCount;
    if (typeof sd.defaultFg === 'number') g.defaultFg = sd.defaultFg;
    if (sd.auxOn) Object.keys(sd.auxOn).forEach(function (k) { g.auxOn[k] = sd.auxOn[k]; });
    if (sd.customCmds) g.customCmds = sd.customCmds;
    return g;
  }
  function applyOfflineProgress(g, sd) {
    if (!sd || !sd.olpgOn || !sd.lastSaved) return 0;
    var t0 = parseTime(sd.lastSaved), t1 = Date.now();
    if (isNaN(t0)) return 0;
    var sec = (t1 - t0) / 1000;
    if (sec < 1) return 0;
    g.a.amount = numAdd(g.a.amount, sec * computeRate(g));
    return sec;
  }
  function exportData(name, slot) {
    var root = readRoot();
    if (slot === null) return encode(JSON.stringify(root[name] || {}));
    return encode(JSON.stringify(readSlot(name, slot) || {}));
  }
  function importData(text, name, slot) {
    try {
      var obj = JSON.parse(decode(text.trim()));
      var root = readRoot();
      if (slot === null) {
        if (!obj.slots) return false;
        root[name] = obj; return writeRoot(root);
      } else {
        if (!root[name]) root[name] = { slots: new Array(SLOT_COUNT).fill(null), lastSlot: 1, createdTime: nowString() };
        root[name].slots[slot - 1] = encode(JSON.stringify(obj));
        return writeRoot(root);
      }
    } catch (e) { return false; }
  }

  var DEV_PASSWORD = "G3Eq78Aq,1bo4llTc!F{px\\6'N]";

  // color <0-F>：对齐 C++ 的 16 色控制台前景色索引
  var FG16 = [
    '#000000', '#000080', '#008000', '#008080', '#800000', '#800080', '#808000', '#c0c0c0',
    '#808080', '#0000ff', '#00ff00', '#00ffff', '#ff0000', '#ff00ff', '#ffff00', '#ffffff'
  ];

  global.INC = global.INC || {};
  global.INC.core = {
    PALETTE: PALETTE, C: C, css: css, THEMES: THEMES, FG16: FG16,
    setTheme: setTheme, getTheme: getTheme,
    fmtNum: fmtNum, fmtRes: fmtRes, parseNum: parseNum,
    isBN: isBN, bnToString: bnToString,
    numValid: numValid, numToDouble: numToDouble, numCmp: numCmp,
    numAdd: numAdd, numSub: numSub, numGte: numGte,
    numSerialize: numSerialize, numDeserialize: numDeserialize,
    formatDuration: formatDuration, formatCountdown: formatCountdown,
    createState: createState, nowString: nowString, parseTime: parseTime,
    BUY_ITEMS: BUY_ITEMS, findBuyItem: findBuyItem, buyCount: buyCount,
    buyPriceBase: buyPriceBase, computeRate: computeRate, buyItemSegments: buyItemSegments,
    estimateAffordText: estimateAffordText, affordableItems: affordableItems,
    splitPath: splitPath, stripGame1Xri: stripGame1Xri, getChildren: getChildren,
    pathExists: pathExists, normalizePath: normalizePath, promptPrefix: promptPrefix,
    PATH_ALIASES: PATH_ALIASES, allPaths: allPaths, findPath: findPath,
    AX_LABELS: AX_LABELS, auxiliaryLineSegments: auxiliaryLineSegments,
    SLOT_COUNT: SLOT_COUNT, DEV_PASSWORD: DEV_PASSWORD,
    listSaves: listSaves, createSave: createSave, saveExists: saveExists, deleteSave: deleteSave,
    stateToSlot: stateToSlot, writeSlot: writeSlot, readSlot: readSlot, hasSlotData: hasSlotData,
    clearSlot: clearSlot, slotSummary: slotSummary, saveInfo: saveInfo, slotToState: slotToState,
    applyOfflineProgress: applyOfflineProgress, exportData: exportData, importData: importData
  };
})(window);
