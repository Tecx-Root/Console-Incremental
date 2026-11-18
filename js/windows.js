/* Console Incremental — 独立浮层窗口：滚动新闻 / 分屏终端 / 购买提醒 toast
 * 对应 C++ news_window.cpp / split_window.cpp / toast_window.cpp。
 * 虚拟标题栏：标题 + 徽章 + 装饰红 X（点击无效），可拖动。暴露 window.INC.windows。
 */
(function (global) {
  'use strict';

  // 新闻逐条播放：同一时刻屏幕上只有一条，等它完全移出左边界后，
  // 下一条才从右边界开始进入（间隔等于整个可视区宽度）。
  // 条目之间不加任何分隔符 / 圆点：每条新闻前都保持纯文本。
  var NEWS_SPEED = 2.0;          // px / 帧（30ms 一帧）；窗口加宽后略放慢，便于阅读
  // 去掉条目首尾的项目符号与空白（◆ ● · ▸ • 等），保证新闻前不出现"点"
  function cleanNewsItem(s) {
    return String(s)
      .replace(/^[\s◆◇●○·•‣▪▸▹►>]+/, '')
      .replace(/[\s◆◇●○·•‣▪▸▹►<]+$/, '');
  }
  var newsIndex = 0;
  var newsItems = [
    '据本台记者报道，近日，一名外国小哥竟然惊奇地发现————————————杯子是用来喝水的',
    '1+1=?',
    '1+1=（系统未响应）',
    '1+1=（服务器繁忙请稍后再试）',
    '猜猜这是新闻列表里的第几条新闻',
    '本台快讯：资源 a 仍在持续增长，暂无停止迹象',
    '专家提醒：连续购买 Ba1-1 可能导致速度过快',
    '寻物启事：走失的括号一枚，特征为成对出现',
    '天气预报：今日局部地区有购买项出没，请注意查收',
    '系统公告：新闻窗口已扩容，感谢收看'
  ].map(cleanNewsItem);

  var newsWin = null, newsTimer = null, newsRunning = false;
  var newsBody = null, newsTrack = null, newsText = null;
  var newsCounter = null, newsBar = null, newsWidth = 560;
  var splitWins = [], splitRunning = false, splitRenderFn = null;
  var toastEl = null, toastBody = null, toastTimer = null;
  var toastId = null, toastKicker = null, toastDesc = null, toastHint = null, toastTime = null, toastBar = null;
  var zTop = 100;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function viewport() { return global.innerWidth || 1280; }

  // 全局拖拽：只注册一次监听，避免每次创建标题栏都往 document 上堆监听
  var drag = { win: null, offX: 0, offY: 0 };
  document.addEventListener('mousemove', function (e) {
    if (!drag.win) return;
    drag.win.style.left = (e.clientX - drag.offX) + 'px';
    drag.win.style.top = (e.clientY - drag.offY) + 'px';
  });
  document.addEventListener('mouseup', function () { drag.win = null; });

  // opts.badge：标题栏右侧徽章；返回的节点上挂 badgeEl 便于动态更新
  function makeTitlebar(title, opts) {
    opts = opts || {};
    var bar = document.createElement('div');
    bar.className = 'win-titlebar';
    var t = document.createElement('span');
    t.className = 'win-titletext';
    t.textContent = title;
    bar.appendChild(t);
    if (opts.badge) {
      var badge = document.createElement('span');
      badge.className = 'win-badge';
      badge.textContent = opts.badge;
      bar.appendChild(badge);
      bar.badgeEl = badge;
    }
    var x = document.createElement('span');
    x.className = 'win-x';
    x.textContent = '×';
    x.title = '（装饰，点击无效）';
    x.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    x.addEventListener('click', function (e) { e.stopPropagation(); });
    bar.appendChild(x);
    bar.addEventListener('mousedown', function (e) {
      if (e.target === x) return;
      var win = bar.parentNode;
      drag.win = win;
      drag.offX = e.clientX - win.offsetLeft;
      drag.offY = e.clientY - win.offsetTop;
      win.style.zIndex = ++zTop;
      e.preventDefault();
    });
    return bar;
  }

  // 重启一条 CSS 动画（先置 none 触发重排，再恢复）
  function restartAnim(node, durSec) {
    if (!node || !node.style) return;
    node.style.animation = 'none';
    void node.offsetWidth;
    node.style.animation = '';
    node.style.animationDuration = durSec + 's';
  }

  // ---------- 滚动新闻窗口 ----------
  function newsStart(items) {
    if (items && items.length) newsItems = items.map(cleanNewsItem).filter(Boolean);
    if (!newsItems.length) return;
    if (newsRunning) return;
    newsRunning = true;
    newsIndex = 0;
    newsWidth = Math.min(560, Math.max(300, viewport() - 40));

    newsWin = document.createElement('div');
    newsWin.className = 'float-win news-win';
    newsWin.style.width = newsWidth + 'px';
    newsWin.style.left = Math.max(8, viewport() - newsWidth - 20) + 'px';
    newsWin.style.top = '20px';
    newsWin.style.zIndex = ++zTop;
    newsWin.appendChild(makeTitlebar('滚动新闻', { badge: 'NEWS · LIVE' }));

    newsBody = document.createElement('div');
    newsBody.className = 'news-body';
    newsTrack = document.createElement('div');
    newsTrack.className = 'news-track';
    newsText = document.createElement('span');
    newsText.className = 'news-text';
    newsTrack.appendChild(newsText);
    newsBody.appendChild(newsTrack);
    newsWin.appendChild(newsBody);

    // 底栏：LIVE 指示 / 当前条目序号 / 走带进度
    var foot = document.createElement('div');
    foot.className = 'news-foot';
    var live = document.createElement('span');
    live.className = 'news-live';
    live.textContent = 'LIVE';
    var label = document.createElement('span');
    label.className = 'news-label';
    label.textContent = 'NEWS FEED';
    newsCounter = document.createElement('span');
    newsCounter.className = 'news-counter';
    newsCounter.textContent = pad2(1) + ' / ' + pad2(newsItems.length);
    var progWrap = document.createElement('div');
    progWrap.className = 'news-progress';
    newsBar = document.createElement('i');
    progWrap.appendChild(newsBar);
    foot.appendChild(live);
    foot.appendChild(label);
    foot.appendChild(newsCounter);
    foot.appendChild(progWrap);
    newsWin.appendChild(foot);
    document.body.appendChild(newsWin);

    var pos = 0;
    // 视口宽度：优先取内容区实际宽度，DOM 桩/未布局时回退到窗口宽度
    function viewportWidth() {
      return newsBody.clientWidth || newsWin.clientWidth || newsWidth;
    }
    function resetBar() {
      var textW = newsText.offsetWidth || 260;
      var secs = Math.max(4, ((viewportWidth() + textW) / NEWS_SPEED) * 0.03);
      restartAnim(newsBar, secs);
    }
    // 只在一条新闻完全移出左边界后才调用：把下一条放到右边界之外
    function loadNext() {
      newsIndex = (newsIndex + 1) % newsItems.length;
      textSet(newsIndex);
      pos = viewportWidth();
      newsTrack.style.transform = 'translateX(' + pos + 'px)';
      if (newsCounter) newsCounter.textContent = pad2(newsIndex + 1) + ' / ' + pad2(newsItems.length);
      resetBar();
    }
    function textSet(i) { newsText.textContent = newsItems[i % newsItems.length]; }

    textSet(newsIndex);
    pos = viewportWidth();
    newsTrack.style.transform = 'translateX(' + pos + 'px)';
    resetBar();
    newsTimer = setInterval(function () {
      pos -= NEWS_SPEED;
      var w = newsText.offsetWidth || 0;
      // w <= 0 时（字体未加载 / 未布局）只移动，不切换，避免误判为已移出
      if (w > 0 && pos <= -w) { loadNext(); return; }
      newsTrack.style.transform = 'translateX(' + pos + 'px)';
    }, 30);
  }
  function newsStop() {
    if (!newsRunning) return;
    newsRunning = false;
    if (newsTimer) { clearInterval(newsTimer); newsTimer = null; }
    if (newsWin && newsWin.parentNode) newsWin.parentNode.removeChild(newsWin);
    newsWin = null; newsBody = null; newsTrack = null; newsText = null;
    newsCounter = null; newsBar = null;
  }
  function newsIsRunning() { return newsRunning; }

  // ---------- 分屏终端窗口（镜像主终端最近输出）----------
  function splitStart(count, renderFn) {
    if (renderFn) splitRenderFn = renderFn;
    splitRunning = count > 1;
    var cols = Math.max(1, Math.floor((viewport() * 0.42) / 372));
    while (splitWins.length < count - 1) {
      var idx = splitWins.length;
      var w = document.createElement('div');
      w.className = 'float-win split-win';
      var col = idx % cols, row = Math.floor(idx / cols);
      w.style.left = Math.min(viewport() - 370, viewport() * 0.55 + col * 372) + 'px';
      w.style.top = (20 + row * 290) + 'px';
      w.style.width = '360px';
      w.style.height = '260px';
      w.style.zIndex = ++zTop;
      w.appendChild(makeTitlebar('分屏 ' + (idx + 2)));
      var body = document.createElement('div');
      body.className = 'split-body';
      w.appendChild(body);
      document.body.appendChild(w);
      splitWins.push({ el: w, body: body });
    }
    while (splitWins.length > count - 1) {
      var rem = splitWins.pop();
      if (rem.el.parentNode) rem.el.parentNode.removeChild(rem.el);
    }
    if (count <= 1) splitRunning = false;
    splitRefresh();
  }
  function splitRefresh(renderFn) {
    if (renderFn) splitRenderFn = renderFn;
    if (!splitRenderFn) return;
    splitWins.forEach(function (sw, i) {
      var html = splitRenderFn(i);
      if (typeof html === 'string' && sw.body.innerHTML !== html) sw.body.innerHTML = html;
    });
  }
  function splitStop() {
    splitWins.forEach(function (sw) { if (sw.el.parentNode) sw.el.parentNode.removeChild(sw.el); });
    splitWins = [];
    splitRunning = false;
  }
  function splitIsRunning() { return splitRunning; }

  // ---------- 购买提醒 toast（Ax9 游戏外提醒）----------
  function ensureToast() {
    if (toastEl) return;
    toastEl = document.createElement('div');
    toastEl.className = 'toast-win';
    toastEl.appendChild(makeTitlebar('购买提醒', { badge: 'Ax9' }));
    toastBody = document.createElement('div');
    toastBody.className = 'toast-body';

    var head = document.createElement('div');
    head.className = 'toast-head';
    toastId = document.createElement('span');
    toastId.className = 'toast-id';
    toastKicker = document.createElement('span');
    toastKicker.className = 'toast-kicker';
    head.appendChild(toastId);
    head.appendChild(toastKicker);

    toastDesc = document.createElement('div');
    toastDesc.className = 'toast-desc';

    var foot = document.createElement('div');
    foot.className = 'toast-foot';
    toastHint = document.createElement('span');
    toastHint.className = 'toast-hint';
    toastTime = document.createElement('span');
    toastTime.className = 'toast-time';
    foot.appendChild(toastHint);
    foot.appendChild(toastTime);

    var progWrap = document.createElement('div');
    progWrap.className = 'toast-progress';
    toastBar = document.createElement('i');
    progWrap.appendChild(toastBar);

    toastBody.appendChild(head);
    toastBody.appendChild(toastDesc);
    toastBody.appendChild(foot);
    toastBody.appendChild(progWrap);
    toastEl.appendChild(toastBody);
    document.body.appendChild(toastEl);
  }
  // 主程序传入形如「可购买：Ba1-1 — 使a的获取速度 +1.00/s」；也兼容纯文本提醒
  function parseToast(text) {
    var s = String(text), m = /^可购买：([^—]+?)\s*—\s*([\s\S]*)$/.exec(s);
    if (m) return { id: m[1].trim(), body: m[2].trim(), kicker: 'PURCHASE READY', hint: '当前资源已可负担该购买项' };
    return { id: '', body: s, kicker: 'NOTICE', hint: '游戏提示' };
  }
  function toastShow(text, durationMs) {
    ensureToast();
    var info = parseToast(text);
    var sec = (durationMs || 6500) / 1000;
    toastId.textContent = info.id || '提醒';
    toastKicker.textContent = info.kicker;
    toastDesc.textContent = info.body;
    toastHint.textContent = info.hint;
    toastTime.textContent = sec.toFixed(1) + 's';
    toastEl.style.width = Math.min(390, Math.max(280, viewport() - 40)) + 'px';
    toastEl.style.right = '24px';
    toastEl.style.bottom = '24px';
    toastEl.style.zIndex = ++zTop;
    toastEl.style.display = 'block';
    restartAnim(toastBar, sec);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastHide(); }, durationMs || 6500);
  }
  function toastHide() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (toastEl) toastEl.style.display = 'none';
  }
  function toastIsVisible() { return !!toastEl && toastEl.style.display === 'block'; }

  global.INC.windows = {
    NEWS_ITEMS: newsItems,
    newsStart: newsStart, newsStop: newsStop, newsIsRunning: newsIsRunning,
    splitStart: splitStart, splitRefresh: splitRefresh, splitStop: splitStop, splitIsRunning: splitIsRunning,
    toastShow: toastShow, toastHide: toastHide, toastIsVisible: toastIsVisible
  };
})(window);
