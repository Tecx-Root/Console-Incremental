/* Console Incremental — 游戏内核 (移植自 C++ main.cpp / save_manager.h / bignum.cpp)
 * 纯逻辑，不依赖 DOM。暴露 window.INC.core。
 */
(function (global) {
  'use strict';

  // ---- 调色板：与 C++ console_renderer.cpp 的 16 色主题一致 ----
  // key 为语义色名，value 为 CSS 颜色。
  var PALETTE = {
    BG: '#0b0e14',        // 0 深海军蓝底
    ROYAL: '#4169e1',     // 1
    PALE_GREEN: '#a1ecab',// 2
    AQUA_SKY: '#86b8ef',  // 3
    RED_DUSTED: '#de6663',// 4
    PURPLE: '#b98cff',    // 5
    PALE_YELLOW: '#f0d456',//6
    FRONT: '#e6ebf2',     // 7 近白
    PANEL: '#63759c',     // 8 灰（dim）
    L_BLUE: '#7e9bff',    // 9
    L_GREEN: '#62f06c',   // 10 绿（可购买/已购买）
    L_AQUA: '#afd4ff',    // 11
    L_RED: '#ff9b98',     // 12 红（不可购买）
    L_PURPLE: '#e0b3ff',  // 13
    L_YELLOW: '#ffd86b',  // 14
    BRIGHT: '#ffffff'     // 15 纯白（加粗资源名用 AquaSky，见下）
  };
  // 语义 -> 调色板键（对齐 C++ Color::Xxx 的定义）
  var C = {
    Front: 'FRONT', Gray: 'PANEL', Panel: 'PANEL', BG: 'BG',
    LightGreen: 'L_GREEN', LightRed: 'L_RED', AquaSky: 'AQUA_SKY',
    PaleGreen: 'PALE_GREEN', PaleYellow: 'PALE_YELLOW', RedDusted: 'RED_DUSTED',
    BrightWhite: 'BRIGHT', Royal: 'ROYAL', PaleYellow_: 'PALE_YELLOW'
  };
  function css(colorKey) { return PALETTE[colorKey] || PALETTE.FRONT; }

  // ---- 数字格式化：复刻 BigNum::toString（double 区间）----
  // < 1e5 → 两位小数；≥1e5 → "m antissae x"（6 有效位）
  function fmtPlain(v) {
    if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
    return v.toFixed(2);
  }
  function trimSig(s) {
    // 复刻 trimSig：去掉末尾多余的 0（保留至少一位小数）
    if (s.indexOf('.') < 0 && s.indexOf('e') < 0 && s.indexOf('E') < 0) return s;
    var parts = s.split(/[eE]/);
    var head = parts[0];
    if (head.indexOf('.') >= 0) {
      head = head.replace(/0+$/, '').replace(/\.$/, '');
    }
    return head + (parts.length > 1 ? 'e' + parts[1] : '');
  }
  function fmtMantissa(m) { return trimSig(Number(m.toPrecision(6)).toString()); }
  function fmtNum(v) {
    if (v === 0) return '0';
    var neg = v < 0; var a = Math.abs(v);
    if (a < 1e5) return (neg ? '-' : '') + fmtPlain(a);
    var lx = Math.floor(Math.log10(a));
    var xi = Math.floor(lx);
    var m0 = a / Math.pow(10, lx);
    if (!isFinite(m0)) m0 = 1;
    var ms = fmtMantissa(m0);
    if (parseFloat(ms) >= 10) { ms = '1'; xi += 1; }
    // 极大数（超过 Number 范围）用塔式简写
    if (!isFinite(a)) return (neg ? '-' : '') + 'ee' + xi;
    return (neg ? '-' : '') + ms + 'e' + xi;
  }
  // fmtRes(double) 在 C++ 中即 BigNum(v).toString()
  var fmtRes = fmtNum;

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
      cwd: '~',
      buys: {},                 // id -> count
      olpgOn: true,
      createdTime: nowString(),
      maxAmountA: 0,
      devMode: false,
      auxOn: {
        Ax1: true, Ax2: false, Ax3: true, Ax4: false, Ax5: false,
        Ax6: false, Ax7: false, Ax8: false, Ax9: false, Ax10: false,
        Ax11: false, Ax12: false, Ax13: false, Ax14: false, Ax15: false, Ax16: false
      }
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
      priceBase: 10, priceStep: 10, showTotal: true, isAdditive: false,
      repeatable: true, maxBuys: 0,
      effect: function (g) { return '×' + fmtRes(BA1_BASE + BA1_PER_BA1_2 * buyCount(g, 'Ba1-2')); },
      factor: function (g) {
        var b1 = buyCount(g, 'Ba1-1'), b2 = buyCount(g, 'Ba1-2');
        return Math.pow(BA1_BASE + BA1_PER_BA1_2 * b2, b1);
      },
      totalText: function (g) {
        var b1 = buyCount(g, 'Ba1-1'), b2 = buyCount(g, 'Ba1-2');
        return '×' + fmtRes(Math.pow(BA1_BASE + BA1_PER_BA1_2 * b2, b1));
      },
      bonus: null
    },
    {
      id: 'Ba1-2', path: '~\\game1-xri\\a\\a_buff', content: '使每个Ba1-1的效果',
      priceBase: 100, priceStep: 100, showTotal: true, isAdditive: false,
      repeatable: true, maxBuys: 0,
      effect: function () { return '+' + fmtRes(BA1_PER_BA1_2); },
      factor: function () { return 1.0; },
      totalText: function (g) { return '+' + fmtRes(BA1_PER_BA1_2 * buyCount(g, 'Ba1-2')); },
      bonus: null
    },
    {
      id: 'Ua1-1', path: '~\\game1-xri\\a\\a_upgrade', content: '基于当前所拥有的a，给予a一个加成',
      priceBase: 3000, priceStep: 0, showTotal: true, isAdditive: false,
      repeatable: false, maxBuys: 0,
      effect: function () { return ''; },
      factor: function (g) {
        if (buyCount(g, 'Ua1-1') <= 0) return 1.0;
        return Math.max(1.0, Math.sqrt(Math.max(0, g.a.amount)) / 5.0);
      },
      totalText: function (g) { return '×' + fmtRes(Math.max(1.0, Math.sqrt(Math.max(0, g.a.amount)) / 5.0)); },
      bonus: function () { return 0.0; }
    },
    {
      id: 'Ua1-2', path: '~\\game1-xri\\a\\a_upgrade', content: '使Ba1-1的效果×2',
      priceBase: 10000, priceStep: 0, showTotal: true, isAdditive: false,
      repeatable: false, maxBuys: 0,
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

  // 有效增长率：rate = base(+1/s) × Π(乘子) + Σ(加数)，基础乘子=1.0 → 无购买时 1.0/s
  function computeRate(g) {
    var mul = 1.0, add = 0.0;
    for (var i = 0; i < BUY_ITEMS.length; i++) {
      var it = BUY_ITEMS[i];
      if (it.isAdditive) add += (it.bonus ? it.bonus(g) : 0);
      else mul *= it.factor(g);
    }
    return mul + add;
  }

  // ---- 分段文本：把 s 中所有 tok 用 bold 色高亮（资源名 a 加粗）----
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

  // Func25：购买项行配色（实时生成）
  function buyItemSegments(it, g) {
    var base = C.Front, green = C.LightGreen, red = C.LightRed, bold = C.AquaSky;
    var cnt = buyCount(g, it.id);
    var price = buyPriceBase(it, cnt);
    var affordable = g.a.amount >= price;
    var ax1 = !!g.auxOn.Ax1;
    var idColor = base;
    if (ax1) {
      if (it.repeatable) { if (it.maxBuys > 0 && cnt >= it.maxBuys) idColor = green; }
      else { if (cnt > 0) idColor = green; }
    }
    var segs = [
      { t: '  ', c: base }, { t: it.id, c: idColor }, { t: ':', c: base }
    ];
    var content = it.content + it.effect(g);
    segs = segs.concat(splitBold(content, 'a', bold, base));
    if (it.showTotal && it.totalText) {
      segs = segs.concat(splitBold('[' + it.totalText(g) + ']', 'a', bold, base));
    }
    segs.push({ t: '(', c: base });
    segs.push({ t: fmtRes(price), c: ax1 ? (affordable ? green : red) : base });
    segs.push({ t: ' ', c: base });
    segs.push({ t: 'a', c: bold });
    segs.push({ t: ')', c: base });
    if (g.auxOn.Ax2) {
      var est = estimateAffordText(g, price);
      segs.push({ t: ' [预计 ' + est + ']', c: C.PaleYellow });
    }
    return segs;
  }

  function formatCountdown(secs) {
    if (!isFinite(secs) || secs < 0) return '∞';
    if (secs < 60) return secs.toFixed(1) + '秒';
    if (secs < 3600) { var m = Math.floor(secs / 60), s = Math.floor(secs - m * 60); return m + '分' + s + '秒'; }
    return formatDuration(secs);
  }
  function estimateAffordText(g, price) {
    var have = g.a.amount;
    if (have >= price) return '已可购买';
    var rate = computeRate(g);
    if (rate <= 0) return '速度不足(∞)';
    return formatCountdown((price - have) / rate);
  }

  // ---- 虚拟路径系统 ----
  function splitPath(path) {
    return String(path).split(/[\\\/]/);
  }
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
      var ok = getChildren(cur).indexOf(parts[i]) >= 0;
      if (!ok) return false;
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

  // 辅助功能列表行分段
  var AX_LABELS = {
    Ax1: '购买项颜色变化', Ax2: '购买项预计可购买倒计时',
    Ax3: '每移动到一个新目录，就自动显示该目录下的内容', Ax4: '命令行命令补全',
    Ax5: '更好的终端', Ax6: '更好的资源信息', Ax7: '更好的文件夹树',
    Ax8: '终端内购买提醒（有可购买的购买项时，控制台底部弹出提醒）',
    Ax9: '游戏外消息购买提醒（同一项两次提醒间隔< n 秒则自动降频，n 由 warn -min=… 调节）',
    Ax10: '自定义命令', Ax11: '分屏数量', Ax12: '命令行语法高亮',
    Ax13: '用户输入的资源名称自动加粗', Ax14: '命令的操作域增强（即命令不一定要在对应的目录下操作）',
    Ax15: '批量执行（命令后加 *n 重复执行 n 遍，解锁后无法关闭）',
    Ax16: 'tree 命令可展示最底层文件夹下的内容'
  };
  function auxiliaryLineSegments(g, id) {
    var on = !!g.auxOn[id];
    var prefix = '  ' + id + '. ' + (AX_LABELS[id] || '');
    return [
      { t: prefix + '[', c: C.Front },
      { t: on ? '开' : '关', c: on ? C.LightGreen : C.RedDusted },
      { t: ']', c: C.Front }
    ];
  }

  // ---- 存档（localStorage，对齐 C++ 的 SlotData 语义）----
  var SAVE_KEY = 'console_incremental_html_v1';
  function stateToSlot(g) {
    return {
      amount: g.a.amount, buys: JSON.parse(JSON.stringify(g.buys)), cwd: g.cwd,
      olpgOn: g.olpgOn, createdTime: g.createdTime, maxAmountA: g.maxAmountA,
      devMode: g.devMode, auxOn: JSON.parse(JSON.stringify(g.auxOn)),
      lastSaved: nowString(), name: (global.INC && global.INC.playerName) || 'Player'
    };
  }
  function slotToState(sd, g) {
    if (!sd) return g;
    g.a.amount = +sd.amount || 0;
    g.buys = sd.buys || {};
    g.cwd = sd.cwd || '~';
    g.olpgOn = sd.olpgOn !== false;
    g.createdTime = sd.createdTime || nowString();
    g.maxAmountA = +sd.maxAmountA || 0;
    g.devMode = !!sd.devMode;
    if (sd.auxOn) Object.keys(sd.auxOn).forEach(function (k) { g.auxOn[k] = sd.auxOn[k]; });
    return g;
  }
  function saveGame(g) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(stateToSlot(g))); return true; }
    catch (e) { return false; }
  }
  function loadGame(g) {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function hasSave() { return !!loadGame(null); }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  function applyOfflineProgress(g, sd) {
    if (!sd || !sd.olpgOn || !sd.lastSaved) return 0;
    var t0 = parseTime(sd.lastSaved); var t1 = Date.now();
    if (isNaN(t0)) return 0;
    var sec = (t1 - t0) / 1000;
    if (sec < 1) return 0;
    var rate = computeRate(g);
    var gain = sec * rate;
    g.a.amount += gain;
    return sec;
  }

  global.INC = global.INC || {};
  global.INC.core = {
    PALETTE: PALETTE, C: C, css: css,
    fmtNum: fmtNum, fmtRes: fmtRes, formatDuration: formatDuration,
    createState: createState, nowString: nowString, parseTime: parseTime,
    BUY_ITEMS: BUY_ITEMS, findBuyItem: findBuyItem, buyCount: buyCount,
    buyPriceBase: buyPriceBase, computeRate: computeRate,
    buyItemSegments: buyItemSegments, estimateAffordText: estimateAffordText,
    splitPath: splitPath, stripGame1Xri: stripGame1Xri, getChildren: getChildren,
    pathExists: pathExists, normalizePath: normalizePath, promptPrefix: promptPrefix,
    AX_LABELS: AX_LABELS, auxiliaryLineSegments: auxiliaryLineSegments,
    stateToSlot: stateToSlot, slotToState: slotToState, saveGame: saveGame,
    loadGame: loadGame, hasSave: hasSave, clearSave: clearSave,
    applyOfflineProgress: applyOfflineProgress
  };
})(window);
