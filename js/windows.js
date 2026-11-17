/* Console Incremental — 独立浮层窗口：滚动新闻 / 分屏终端 / 购买提醒 toast
 * 对应 C++ news_window.cpp / split_window.cpp / toast_window.cpp。
 * 虚拟标题栏：标题 + 装饰红 X（点击无效），可拖动。暴露 window.INC.windows。
 */
(function (global) {
  'use strict';

  // 新闻之间的间隔：前后各留 10 个空格，配一个菱形分隔，避免条目挤在一起
  var NEWS_SEPARATOR = '          ◆          ';
  var newsItems = [
    '据本台记者报道，近日，一名外国小哥竟然惊奇地发现————————————杯子是用来喝水的',
    '1+1=?',
    '1+1=（系统未响应）',
    '1+1=（服务器繁忙请稍后再试）',
    '猜猜这是新闻列表里的第几条新闻'
  ];

  var newsWin = null, newsTimer = null, newsRunning = false;
  var splitWins = [], splitRunning = false, splitRenderFn = null;
  var toastEl = null, toastBody = null, toastTimer = null;
  var zTop = 100;

  // 全局拖拽：只注册一次监听，避免每次创建标题栏都往 document 上堆监听
  var drag = { win: null, offX: 0, offY: 0 };
  document.addEventListener('mousemove', function (e) {
    if (!drag.win) return;
    drag.win.style.left = (e.clientX - drag.offX) + 'px';
    drag.win.style.top = (e.clientY - drag.offY) + 'px';
  });
  document.addEventListener('mouseup', function () { drag.win = null; });

  function makeTitlebar(title) {
    var bar = document.createElement('div');
    bar.className = 'win-titlebar';
    var t = document.createElement('span');
    t.className = 'win-titletext';
    t.textContent = title;
    var x = document.createElement('span');
    x.className = 'win-x';
    x.textContent = '×';
    x.title = '（装饰，点击无效）';
    x.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    x.addEventListener('click', function (e) { e.stopPropagation(); });
    bar.appendChild(t);
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

  // ---------- 滚动新闻窗口 ----------
  function newsStart(items) {
    if (items && items.length) newsItems = items;
    if (newsRunning) return;
    newsRunning = true;
    newsWin = document.createElement('div');
    newsWin.className = 'float-win news-win';
    newsWin.style.left = Math.max(8, window.innerWidth - 460) + 'px';
    newsWin.style.top = '20px';
    newsWin.style.zIndex = ++zTop;
    newsWin.appendChild(makeTitlebar('滚动新闻'));
    var body = document.createElement('div');
    body.className = 'news-body';
    var track = document.createElement('div');
    track.className = 'news-track';
    var text = document.createElement('span');
    text.className = 'news-text';
    text.textContent = newsItems.join(NEWS_SEPARATOR) + NEWS_SEPARATOR;
    track.appendChild(text);
    track.appendChild(text.cloneNode(true));
    body.appendChild(track);
    newsWin.appendChild(body);
    document.body.appendChild(newsWin);
    var pos = 0;
    newsTimer = setInterval(function () {
      pos -= 1.5;
      var half = text.offsetWidth;
      if (half > 0 && -pos >= half) pos += half;
      track.style.transform = 'translateX(' + pos + 'px)';
    }, 30);
  }
  function newsStop() {
    if (!newsRunning) return;
    newsRunning = false;
    if (newsTimer) { clearInterval(newsTimer); newsTimer = null; }
    if (newsWin && newsWin.parentNode) newsWin.parentNode.removeChild(newsWin);
    newsWin = null;
  }
  function newsIsRunning() { return newsRunning; }

  // ---------- 分屏终端窗口（镜像主终端最近输出）----------
  function splitStart(count, renderFn) {
    if (renderFn) splitRenderFn = renderFn;
    splitRunning = count > 1;
    var cols = Math.max(1, Math.floor((window.innerWidth * 0.42) / 372));
    while (splitWins.length < count - 1) {
      var idx = splitWins.length;
      var w = document.createElement('div');
      w.className = 'float-win split-win';
      var col = idx % cols, row = Math.floor(idx / cols);
      w.style.left = Math.min(window.innerWidth - 370, window.innerWidth * 0.55 + col * 372) + 'px';
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
    toastEl.appendChild(makeTitlebar('购买提醒'));
    toastBody = document.createElement('div');
    toastBody.className = 'toast-body';
    toastEl.appendChild(toastBody);
    document.body.appendChild(toastEl);
  }
  function toastShow(text, durationMs) {
    ensureToast();
    toastBody.textContent = text;
    toastEl.style.right = '24px';
    toastEl.style.bottom = '24px';
    toastEl.style.zIndex = ++zTop;
    toastEl.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastHide(); }, durationMs || 6500);
  }
  function toastHide() { if (toastEl) toastEl.style.display = 'none'; }
  function toastIsVisible() { return !!toastEl && toastEl.style.display === 'block'; }

  global.INC.windows = {
    NEWS_ITEMS: newsItems,
    newsStart: newsStart, newsStop: newsStop, newsIsRunning: newsIsRunning,
    splitStart: splitStart, splitRefresh: splitRefresh, splitStop: splitStop, splitIsRunning: splitIsRunning,
    toastShow: toastShow, toastHide: toastHide, toastIsVisible: toastIsVisible
  };
})(window);
