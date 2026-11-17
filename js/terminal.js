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
  var cmdCb = null, completionCb = null, escapeCb = null, editorInsertCb = null;
  var editorOn = false, selection = [], clipText = '';
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
    // Func3：SHIFT+ENTER 可换行输入多行指令，故用 textarea 模拟命令行输入
    input = document.createElement('textarea');
    input.id = 'cmd-input';
    input.rows = 1; input.wrap = 'off';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
    inputLine.appendChild(promptEl);
    inputLine.appendChild(input);
    el.appendChild(inputLine);
    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('input', function () {
      autoGrow();
      if (completionCb) completionCb('input', input.value);
    });
    el.addEventListener('scroll', function () {
      atBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 24;
    });
    el.addEventListener('mousedown', function (e) {
      if (window.getSelection().toString() === '' && e.target !== input) {
        setTimeout(function () { input.focus(); }, 0);
      }
    });
    // Ax5：点击历史命令行选中其所在的「命令 + 结果」块
    el.addEventListener('click', function (e) {
      if (!editorOn || e.target === input) return;
      for (var i = 0; i < entries.length; i++) {
        var n = entries[i].node;
        if (!n) continue;
        if (n === e.target || (n.contains && n.contains(e.target))) {
          var bs = blockList();
          for (var k = 0; k < bs.length; k++) {
            if (bs[k].idx.indexOf(i) >= 0) { selectBlock(k + 1, e.ctrlKey || e.metaKey); break; }
          }
          break;
        }
      }
    });
    setPrompt(promptText);
    render();
  }

  function autoGrow() {
    if (!input) return;
    input.style.height = 'auto';
    var h = input.scrollHeight || 20;
    input.style.height = Math.min(140, Math.max(20, h)) + 'px';
  }

  function onKeyDown(e) {
    // Ax5：编辑器快捷键（仅在有选中块 / 剪贴板内容时拦截，避免影响普通复制粘贴）
    if (e.ctrlKey && editorOn) {
      var k = (e.key || '').toLowerCase();
      if (k === 'c' && selection.length) { editorCommand('copy'); e.preventDefault(); return; }
      if (k === 'x' && selection.length) { editorCommand('cut'); e.preventDefault(); return; }
      if (k === 'v' && clipText) { editorCommand('paste'); e.preventDefault(); return; }
      if (k === 'k' && selection.length) { editorCommand('del'); e.preventDefault(); return; }
      if (e.key === 'ArrowUp' && selection.length) { editorCommand('mov up'); e.preventDefault(); return; }
      if (e.key === 'ArrowDown' && selection.length) { editorCommand('mov down'); e.preventDefault(); return; }
      if (e.key === 'Enter' && selection.length) {
        if (editorInsertCb) editorInsertCb(selection[0]);
        e.preventDefault(); return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (completionCb) completionCb('enter', input.value);
      var rawV = input.value;
      // Func3：多行指令逐行执行；历史里保留原始多行输入
      var parts = rawV.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      input.value = ''; autoGrow();
      if (completionCb) completionCb('clear', '');
      if (rawV.trim() !== '') cmdHistory.push(rawV);
      histIndex = cmdHistory.length;
      if (cmdCb) parts.forEach(function (p) { cmdCb(p); });
      scrollBottom();
    } else if (e.key === 'Enter' && e.shiftKey) {
      // 允许 textarea 默认换行，仅调整高度
      setTimeout(autoGrow, 0);
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
      if (input.value === '' && escapeCb) { e.preventDefault(); escapeCb(); return; }
      input.value = ''; autoGrow();
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
  // 自定义 DOM 节点作为一行（Ax7 交互式文件夹树面板）
  function pushNode(node) {
    return commit({ node: node, segs: [], custom: true });
  }
  function markCommand(en) {
    if (!en) return;
    en.isCommand = true;
    addCls(en.node, 'cmd-line');
  }
  function addCls(node, c) {
    if (!node) return;
    var s = node.className || '';
    if (s.split(/\s+/).indexOf(c) < 0) node.className = (s ? s + ' ' : '') + c;
  }
  function delCls(node, c) {
    if (!node || !node.className) return;
    node.className = String(node.className).split(/\s+/).filter(function (x) { return x && x !== c; }).join(' ');
  }

  // 盒框：用真实 CSS 边框容器，不再用 Unicode 框线字符 + 补空格拼接。
  // 所有行共享同一个盒模型，宽度由容器决定，天然对齐。
  function makeRowNode(segs) {
    var div = document.createElement('div');
    div.className = 'tbox-row';
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
  function rowKey(segs) {
    return segs.map(function (s) { return s.t + '|' + s.c + '|' + (s.bold || '') + '|' + (s.bg || ''); }).join('\u0000');
  }
  function box(title, lines, opts) {
    opts = opts || {};
    var node = document.createElement('div');
    node.className = 'term-box';
    if (opts.width) node.style.setProperty('--tbox-min', Math.min(680, opts.width * 8) + 'px');

    var head = document.createElement('div');
    head.className = 'tbox-head';
    var titleEl = document.createElement('span');
    titleEl.className = 'tbox-title';
    titleEl.textContent = String(title).trim() || 'INFO';
    titleEl.style.color = css(opts.color || 'AquaSky');
    var rule = document.createElement('span');
    rule.className = 'tbox-rule';
    head.appendChild(titleEl); head.appendChild(rule);
    node.appendChild(head);

    var rows = [], generators = [], keys = [], segsList = [];
    lines.forEach(function (l) {
      var gen = typeof l === 'function' ? l : null;
      var arr = normalize(gen ? gen() : l, 'Front');
      var row = makeRowNode(arr);
      node.appendChild(row);
      rows.push(row); generators.push(gen); keys.push(rowKey(arr)); segsList.push(arr);
    });
    var foot = document.createElement('div');
    foot.className = 'tbox-foot';
    node.appendChild(foot);

    return commit({
      node: node, box: true, segs: [], rows: rows, segsList: segsList,
      generators: generators, keys: keys, lastKey: '', cls: 'term-box'
    });
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

  // ---------- Ax5：更好的终端（Func17）—— 历史命令块编辑 ----------
  // 一个「块」= 一条命令回显 + 其后到下一命令回显之前的所有返回行。
  function blockList() {
    var out = [], cur = null;
    entries.forEach(function (en, i) {
      if (en.isCommand) {
        cur = { start: i, idx: [i], text: lineText(en) };
        out.push(cur);
      } else if (cur) cur.idx.push(i);
    });
    return out;
  }
  function applySelectionClasses() {
    var bs = blockList(), sel = {};
    selection.forEach(function (n) { sel[n] = 1; });
    entries.forEach(function (en) { if (en.node) delCls(en.node, 'blk-sel'); });
    bs.forEach(function (b, k) {
      if (!sel[k]) return;
      b.idx.forEach(function (i) { if (entries[i] && entries[i].node) addCls(entries[i].node, 'blk-sel'); });
    });
  }
  function clearSelection() { selection = []; applySelectionClasses(); }
  function selectBlock(n, additive) {
    var bs = blockList();
    if (n < 1 || n > bs.length) return false;
    if (additive) { if (selection.indexOf(n - 1) < 0) selection.push(n - 1); }
    else selection = [n - 1];
    applySelectionClasses();
    return true;
  }
  function reorderDom() {
    if (!el) return;
    entries.forEach(function (en) { if (en.node && en.node.parentNode === el) el.appendChild(en.node); });
    el.appendChild(inputLine);
  }
  function cmdTextOf(en) {
    return lineText(en).replace(/^.*? \$ /, '');
  }
  function clipFromSelection() {
    var bs = blockList();
    return selection.map(function (k) {
      var b = bs[k]; return b ? cmdTextOf(entries[b.start]) : '';
    }).filter(Boolean).join('\n');
  }
  function removeBlocks(idxs) {
    var bs = blockList();
    idxs.slice().sort(function (a, b) { return b - a; }).forEach(function (k) {
      var b = bs[k]; if (!b) return;
      b.idx.forEach(function (i) { if (entries[i]) removeEntry(entries[i]); });
      entries.splice(b.start, b.idx.length);
    });
    view.start = -1; view.end = -1;
    clearSelection();
  }
  function pasteClipboard() {
    if (!clipText) return 0;
    var bs = blockList(), at = entries.length;
    if (selection.length) {
      var b = bs[selection[selection.length - 1]];
      if (b) at = b.start + b.idx.length;
    }
    var lines = clipText.split('\n'), inserted = 0;
    lines.forEach(function (t) {
      if (!t) return;
      var arr = [seg(t, 'Front')];
      var node = makeLineNode(arr);
      addCls(node, 'cmd-line');
      var en = { node: node, segs: arr, isCommand: true };
      entries.splice(at, 0, en);
      el.insertBefore(node, inputLine);
      at++; inserted++;
    });
    reorderDom();
    return inserted;
  }
  function moveSelection(dir) {
    var bs = blockList();
    if (!selection.length || bs.length < 2) return false;
    var k = Math.max(0, Math.min(bs.length - 1, selection[0])), j = k + dir;
    if (j < 0 || j >= bs.length) return false;
    var order = bs.map(function (b, i) { return i; });
    var tmp = order[k]; order[k] = order[j]; order[j] = tmp;
    var next = entries.slice(0, bs[0].start);
    order.forEach(function (bi) {
      bs[bi].idx.forEach(function (i) { next.push(entries[i]); });
    });
    entries = next;
    view.start = -1; view.end = -1;
    reorderDom();
    selection = [j]; applySelectionClasses();
    return true;
  }
  function editorCommand(cmd) {
    var c = String(cmd).trim(), bs = blockList();
    if (c === 'unsel') { clearSelection(); return { ok: true, msg: '已清除选中。' }; }
    var sm = /^sel\s+(\d+)$/.exec(c);
    if (sm) {
      var ok = selectBlock(parseInt(sm[1], 10), false);
      return { ok: ok, msg: ok ? '已选中第 ' + sm[1] + ' 个命令块。' : '序号超出范围（共 ' + bs.length + ' 个命令块）。' };
    }
    if (c === 'sel') return { ok: true, msg: '当前命令块共 ' + bs.length + ' 个，已选中 ' + selection.length + ' 个。' };
    if (c === 'copy' || c === 'cut') {
      if (!selection.length) return { ok: false, msg: '请先选中命令块（sel <序号> 或点击命令行）。' };
      clipText = clipFromSelection();
      var n = clipText.split('\n').length;
      if (c === 'cut') removeBlocks(selection.slice());
      return { ok: true, msg: (c === 'cut' ? '已剪切 ' : '已复制 ') + n + ' 条命令。' };
    }
    if (c === 'paste') {
      if (!clipText) return { ok: false, msg: '剪贴板为空。' };
      return { ok: true, msg: '已粘贴 ' + pasteClipboard() + ' 条命令块。' };
    }
    if (c === 'del') {
      if (!selection.length) return { ok: false, msg: '请先选中命令块。' };
      var n2 = selection.length; removeBlocks(selection.slice());
      return { ok: true, msg: '已删除 ' + n2 + ' 个命令块（命令与结果一起）。' };
    }
    var mm = /^mov\s+(up|down)$/.exec(c);
    if (mm) {
      var ok2 = moveSelection(mm[1] === 'up' ? -1 : 1);
      return { ok: ok2, msg: ok2 ? '已移动选中块。' : '无法移动（没有选中或已到边界）。' };
    }
    return { ok: false, msg: null };
  }
  function setEditorEnabled(on) {
    editorOn = !!on;
    if (!editorOn) clearSelection();
  }
  function onEditorInsert(cb) { editorInsertCb = cb; }
  function onEscape(cb) { escapeCb = cb; }
  function selectedBlockText() {
    var bs = blockList();
    if (!selection.length || !bs[selection[0]]) return '';
    return cmdTextOf(entries[bs[selection[0]].start]);
  }

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
  function setInput(v) { if (input) { input.value = v; autoGrow(); if (completionCb) completionCb('input', v); } }
  function getInput() { return input ? input.value : ''; }
  function lineText(en) {
    if (en.custom) return (en.node && en.node.textContent) || '';
    if (en.box) return en.segsList.map(function (arr) {
      return arr.map(function (s) { return s.t; }).join('');
    }).join('\n');
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
      if (en.custom) return;
      if (en.box) {
        en.segsList.forEach(function (arr, k) {
          if (en.generators[k]) arr = normalize(en.generators[k]());
          en.segsList[k] = arr; en.keys[k] = rowKey(arr);
          var fresh = makeRowNode(arr);
          if (en.rows[k] && en.rows[k].parentNode) en.rows[k].parentNode.replaceChild(fresh, en.rows[k]);
          en.rows[k] = fresh;
        });
        return;
      }
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
      if (en.custom) continue;
      if (en.box) {
        en.generators.forEach(function (gen, k) {
          if (!gen) return;
          var arr = normalize(gen()), key = rowKey(arr);
          if (key === en.keys[k]) return;
          en.segsList[k] = arr; en.keys[k] = key;
          var fresh = makeRowNode(arr);
          if (en.rows[k] && en.rows[k].parentNode) en.rows[k].parentNode.replaceChild(fresh, en.rows[k]);
          en.rows[k] = fresh; changed = true;
        });
        continue;
      }
      if (!en.live) continue;
      var segs = normalize(en.live());
      en.segs = segs;
      var key2 = segs.map(function (s) { return s.t + '|' + s.c + '|' + (s.bold || ''); }).join('\u0000');
      if (key2 === en.lastKey) continue;
      en.lastKey = key2;
      var fresh2 = makeLineNode(segs);
      if (en.node && en.node.parentNode) el.replaceChild(fresh2, en.node);
      en.node = fresh2;
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
    pushNode: pushNode, markCommand: markCommand,
    editorCommand: editorCommand, setEditorEnabled: setEditorEnabled,
    onEditorInsert: onEditorInsert, onEscape: onEscape,
    selectedBlockText: selectedBlockText, selectBlock: selectBlock,
    clearSelection: clearSelection, blockList: blockList,
    seg: seg, width: width, recentLines: recentLines,
    getState: function () { return { history: cmdHistory, lines: entries.length }; }
  };
})(window);
