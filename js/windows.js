/* Console Incremental — 独立浮层窗口：滚动新闻 / 分屏终端 / 购买提醒 toast
 * 对应 C++ news_window.cpp / split_window.cpp / toast_window.cpp。
 * 虚拟标题栏：标题 + 装饰红 X（点击无效），可拖动。暴露 window.INC.windows。
 */
(function (global) {
  'use strict';

  var newsItems = [
    '据本台记者报道，近日，一名外国小哥竟然惊奇地发现————————————杯子是用来喝水的',
    '1+1=?',
    '1+1=（系统未响应）',
    '1+1=（服务器繁忙请稍后再试）',
    '猜猜这是新闻列表里的第几条新闻'
  ];

  var newsWin = null, newsTimer = null, newsRunning = false;
  var splitWins = [], splitRunning = false;
  var toastEl = null, toastTimer = null;
  var zTop = 100;

  function makeTitlebar(title, onDragHandle) {
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
    // 手动拖拽（对不可聚焦/浮层窗口可靠）
    var dragging = false, offX = 0, offY = 0;
    bar.addEventListener('mousedown', function (e) {
      if (e.target === x) return;
      dragging = true;
      offX = e.clientX - bar.parentNode.offsetLeft;
      offY = e.clientY - bar.parentNode.offsetTop;
      bar.parentNode.style.zIndex = ++zTop;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging || !bar.parentNode) return;
      bar.parentNode.style.left = (e.clientX - offX) + 'px';
      bar.parentNode.style.top = (e.clientY - offY) + 'px';
    });
    document.addEventListener('mouseup', function () { dragging = false; });
    return bar;
  }

  // ---------- 滚动新闻窗口 ----------
  function newsStart(items) {
    if (items && items.length) newsItems = items;
    if (newsRunning) return;
    newsRunning = true;
    newsWin = document.createElement('div');
    newsWin.className = 'float-win news-win';
    newsWin.style.left = (window.innerWidth - 460) + 'px';
    newsWin.style.top = '20px';
    newsWin.style.zIndex = ++zTop;
    newsWin.appendChild(makeTitlebar('滚动新闻'));
    var body = document.createElement('div');
    body.className = 'news-body';
    var track = document.createElement('div');
    track.className = 'news-track';
    var text = document.createElement('span');
    text.className = 'news-text';
    text.textContent = newsItems.join('    ◆    ') + '    ◆    ';
    track.appendChild(text);
    track.appendChild(text.cloneNode(true));
    body.appendChild(track);
    newsWin.appendChild(body);
    document.body.appendChild(newsWin);
    var pos = 0;
    newsTimer = setInterval(function () {
      pos -= 1;
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

  // ---------- 分屏终端窗口（镜像主终端文本）----------
  function splitStart(count, renderFn) {
    splitRunning = count > 1;
    // 数量调整
    while (splitWins.length < count - 1) {
      var idx = splitWins.length; // 0 = 分屏2
      var w = document.createElement('div');
      w.className = 'float-win split-win';
      var perCol = Math.max(1, Math.ceil((count - 1) / (count > 4 ? 2 : 1)));
      w.style.left = (window.innerWidth * 0.55 + (idx % 2) * 380) + 'px';
      w.style.top = (20 + Math.floor(idx / 2) * 300) + 'px';
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
    splitRefresh(renderFn);
  }
  function splitRefresh(renderFn) {
    if (!renderFn) return;
    splitWins.forEach(function (sw, i) {
      sw.body.innerHTML = '';
      var html = renderFn(i);
      if (typeof html === 'string') sw.body.innerHTML = html;
    });
  }
  function splitStop() {
    splitWins.forEach(function (sw) { if (sw.el.parentNode) sw.el.parentNode.removeChild(sw.el); });
    splitWins = [];
    splitRunning = false;
  }
  function splitIsRunning() { return splitRunning; }

  // ---------- 购买提醒 toast（Ax9 游戏外提醒，样式参考消息弹窗）----------
  function toastShow(text, durationMs) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast-win';
      document.body.appendChild(toastEl);
    }
    var title = makeTitlebar('购买提醒');
    // 复用已有 titlebar：若重建则清空
    toastEl.innerHTML = '';
    toastEl.appendChild(title);
    var body = document.createElement('div');
    body.className = 'toast-body';
    body.textContent = text;
    toastEl.appendChild(body);
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
