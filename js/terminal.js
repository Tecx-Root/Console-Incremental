/* Console Incremental — 浏览器模拟终端 (对应 C++ console_renderer + 主循环 UI)
 * 暴露 window.INC.term。
 * 视图区（view）：由 beginView/endView 包住的「当前目录内容」，切目录时整块替换，
 * 避免 live 行无限堆积；命令历史与回显保留在视图区之外。
 */
(function (global) {
  'use strict';
  var core = global.INC.core;
  var css = core.css;

  var el = null, input = null, promptEl = null, inputLine = null;
  var entries = [];
  var cmdHistory = [], histIndex = -1;
  var cmdCb = null, completionCb = null;
  var promptText = '~ $ ';
  var atBottom = true;
  var view = { start: -1, end: -1 }, inView = false;

  function seg(text, colorKey) { return { t: String(text), c: colorKey || 'Front' }; }
  function normalize(segs, colorKey) {
    if (typeof segs === 'string') return [seg(segs, colorKey)];
    if (Array.isArray(segs)) return segs;
    if (segs && typeof segs === 'object' && 't' in segs) return [segs];
    return [];
  }
  // 显示宽度（全角=2），与 C++ isWideCharConsole 对齐
  function wide(ch) {
    var c = ch.codePointAt(0);
    return (c >= 0x1100 && (c <= 0x115F || c === 0x2329 || c === 0x232A ||
      (c >= 0x2E80 && c <= 0xA4CF && c !== 0x303F) ||
      (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0xF900 && c <= 0xFAFF) ||
      (c >= 0xFE10 && c <= 0xFE19) || (c >= 0xFE30 && c <= 0xFE6F) ||
      (c >= 0xFF00 && c <= 0xFF60) || (c >= 0xFFE0 && c <= 0xFFE6) ||
      (c >= 0x20000 && c <= 0x3FFFD))) ? 2 : 1;
  }
  function width(str) { var w = 0; for (var ch of String(str)) w += wide(ch); return w; }

  function init(root) {
    el = typeof root === 'string' ? document.getElementById(root) : root;
    el.innerHTML = '';
    inputLine = document.createElement('div');
    inputLine.id = 'input-line';
    promptEl = document.createElement('span');
    promptEl.id = 'prompt';
    input = document.createElement('input');
    input.id = 'cmd-input';
    input.type = 'text';
    input.autocomplete = 'off'; input.autocapitalize = 'off'; input.spellcheck = false;
    inputLine.appendChild(promptEl);
    inputLine.appendChild(input);
    el.appendChild(inputLine);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('input', function () { if (completionCb) completionCb('input', input.value); });
    el.addEventListener('scroll', function () {
      atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 24;
    });
    el.addEventListener('mousedown', function (e) {
      if (window.getSelection().toString() === '' && e.target !== input) {
        setTimeout(function () { input.focus(); }, 0);
      }
    });
    setPrompt(promptText);
    render();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (completionCb) completionCb('enter', input.value);
      var v = input.value;
      input.value = '';
      if (completionCb) completionCb('clear', '');
      if (v.trim() !== '') cmdHistory.push(v);
      histIndex = cmdHistory.length;
      if (cmdCb) cmdCb(v);
      scrollBottom();
    } else if (e.key === 'ArrowUp') {
      if (completionCb && completionCb('up', input.value) === true) { e.preventDefault(); return; }
      e.preventDefault();
      if (!cmdHistory.length) return;
      histIndex = Math.max(0, histIndex - 1);
      input.value = cmdHistory[histIndex] || '';
      if (completionCb) completionCb('input', input.value);
    } else if (e.key === 'ArrowDown') {
      if (completionCb && completionCb('down', input.value) === true) { e.preventDefault(); return; }
      e.preventDefault();
      if (!cmdHistory.length) return;
      histIndex = Math.min(cmdHistory.length, histIndex + 1);
      input.value = cmdHistory[histIndex] || '';
      if (completionCb) completionCb('input', input.value);
    } else if (e.key === 'Tab') {
      if (completionCb && completionCb('tab', input.value) === true) e.preventDefault();
    } else if (e.key === 'Escape') {
      if (completionCb && completionCb('esc', input.value) === true) { e.preventDefault(); return; }
      input.value = '';
      if (completionCb) completionCb('clear', '');
    }
  }

  function makeLineNode(segs) {
    var div = document.createElement('div');
    div.className = 'line';
    segs.forEach(function (s) {
      var span = document.createElement('span');
      span.className = 'seg';
      span.textContent = s.t;
      span.style.color = css(s.c);
      if (s.bg) span.style.backgroundColor = css(s.bg);
      if (s.bold) span.style.fontWeight = 'bold';
      div.appendChild(span);
    });
    if (!segs.length) div.appendChild(document.createTextNode('\u00a0'));
    return div;
  }
  function removeEntry(en) {
    if (en.node && en.node.parentNode) en.node.parentNode.removeChild(en.node);
  }
  function commit(entry) {
    entries.push(entry);
    el.insertBefore(entry.node, inputLine);
    if (inView) view.end = entries.length;
    scrollBottom();
    return entry;
  }

  function push(segs, colorKey) {
    var arr = normalize(segs, colorKey);
    return commit({ node: makeLineNode(arr), segs: arr });
  }
  function pushLive(generator, group) {
    var arr = normalize(generator());
    return commit({ node: makeLineNode(arr), segs: arr, live: generator, lastKey: '', group: group || '' });
  }
  function blank() { push('\u00a0', 'Front'); }

  function box(title, lines, opts) {
    opts = opts || {};
    var colorKey = opts.color || 'AquaSky';
    var contentRows = lines.map(function (l) { return normalize(l, 'Front'); });
    var max = 0;
    contentRows.forEach(function (r) {
      var w = r.reduce(function (a, s) { return a + width(s.t); }, 0);
      if (w > max) max = w;
    });
    var inner = opts.width ? (opts.width - 4) : (max + 2);
    if (inner < width(title) + 2) inner = width(title) + 2;
    var top = '╭─ ' + title + ' ' + '─'.repeat(Math.max(0, inner - width(title) - 3)) + '╮';
    var bot = '╰' + '─'.repeat(Math.max(0, inner)) + '╯';
    push([seg(top, colorKey)]);
    contentRows.forEach(function (r) {
      var w = r.reduce(function (a, s) { return a + width(s.t); }, 0);
      var pad = ' '.repeat(Math.max(0, inner - w));
      push([seg('│ ', colorKey)].concat(r).concat([seg(pad + ' │', colorKey)]));
    });
    push([seg(bot, colorKey)]);
  }

  // ---------- 视图区 ----------
  function dropView() {
    if (view.start < 0) return;
    var end = Math.min(view.end, entries.length);
    var removed = entries.splice(view.start, Math.max(0, end - view.start));
    removed.forEach(removeEntry);
    view.start = -1; view.end = -1;
  }
  function beginView() {
    dropView();
    view.start = entries.length; view.end = entries.length; inView = true;
  }
  function endView() { view.end = entries.length; inView = false; }
  function clearView() { dropView(); inView = false; }

  function setPrompt(text) { promptText = text; if (promptEl) promptEl.textContent = text; }
  function onCommand(cb) { cmdCb = cb; }
  function onCompletion(cb) { completionCb = cb; }
  function focus() { if (input) input.focus(); }
  function scrollBottom() { if (el) el.scrollTop = el.scrollHeight; }
  function clear() {
    entries = [];
    view.start = -1; view.end = -1; inView = false;
    if (el) Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n !== inputLine) el.removeChild(n);
    });
  }
  function setInput(v) { if (input) { input.value = v; if (completionCb) completionCb('input', v); } }
  function getInput() { return input ? input.value : ''; }
  function lineText(en) {
    var arr = en.live ? normalize(en.live()) : (en.segs || []);
    en.segs = arr;
    return arr.map(function (s) { return s.t; }).join('');
  }
  // 最近 n 行纯文本（供分屏镜像）
  function recentLines(n) {
    return entries.slice(-Math.max(1, n)).map(lineText);
  }
  function repaint() {
    if (!el) return;
    entries.forEach(function (en) {
      var arr = en.live ? normalize(en.live()) : (en.segs || []);
      en.segs = arr;
      var fresh = makeLineNode(arr);
      if (en.node && en.node.parentNode) el.replaceChild(fresh, en.node);
      en.node = fresh;
    });
  }

  function render() {
    var changed = false;
    for (var i = 0; i < entries.length; i++) {
      var en = entries[i];
      if (!en.live) continue;
      var segs = normalize(en.live());
      en.segs = segs;
      var key = segs.map(function (s) { return s.t + '|' + s.c + '|' + (s.bold || ''); }).join('\u0000');
      if (key === en.lastKey) continue;
      en.lastKey = key;
      var fresh = makeLineNode(segs);
      if (en.node && en.node.parentNode) el.replaceChild(fresh, en.node);
      en.node = fresh;
      changed = true;
    }
    if (changed && atBottom) el.scrollTop = el.scrollHeight;
  }

  global.INC.term = {
    init: init, push: push, pushLive: pushLive, blank: blank, box: box,
    beginView: beginView, endView: endView, clearView: clearView,
    setPrompt: setPrompt, onCommand: onCommand, onCompletion: onCompletion,
    focus: focus, render: render, repaint: repaint, clear: clear,
    scrollBottom: scrollBottom, setInput: setInput, getInput: getInput,
    seg: seg, width: width, recentLines: recentLines,
    getState: function () { return { history: cmdHistory, lines: entries.length }; }
  };
})(window);
