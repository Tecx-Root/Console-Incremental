/* Console Incremental — 背景音乐 (移植自 C++ audio_player.cpp: Media Foundation -> HTML5 Audio)
 * 暴露 window.INC.audio。
 */
(function (global) {
  'use strict';
  var NEWS = null;

  // 固定映射表（策划案音乐栏 M1..M7），显示名 + 文件名
  var TRACKS = [
    { name: '黎明破晓', file: '(1-1).mp3' },
    { name: '希望之光', file: 'game1.mp3' },
    { name: '修改器之歌', file: 'game2.mp3' },
    { name: '迷茫之雾', file: 'launch.mp3' },
    { name: '破碎长空', file: 'menu.mp3' },
    { name: 'THE MACHINE', file: 'Ramin Djawadi - God Mode.flac' },
    { name: '逍遥游', file: '凡人修仙传-逍遥游.mp3' }
  ];

  var audio = null;
  var index = -1;         // 当前曲目索引
  var mode = 1;           // 0 单曲循环, 1 列表循环, 2 随机
  var volume = 0.6;       // [0,1]
  var on = true;          // 开/关
  var statusCb = null;    // 底栏状态回调

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'none';
    audio.volume = volume;
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', function () {
      // 某些浏览器不支持的格式（如 flac）视作不可播放，前进到下一首
      if (on && audio) nextOnEnd();
    });
    return audio;
  }
  function notify() { if (statusCb) statusCb(status()); }
  function status() {
    if (!on) return { text: '♪ 音乐已关闭', playing: false };
    if (index < 0) return { text: '♪ 无可用音乐', playing: false };
    return { text: '♪ 正在播放：' + TRACKS[index].name, playing: true };
  }
  function trackCount() { return TRACKS.length; }
  function listTracks() { return TRACKS.map(function (t) { return t.name; }); }
  function currentIndex() { return index; }

  function playTrack(n) {
    if (n < 1 || n > TRACKS.length) return false;
    ensureAudio();
    index = n - 1;
    audio.src = 'assets/audio/' + encodeURI(TRACKS[index].file).replace(/#/g, '%23');
    audio.volume = volume;
    if (on) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
    notify();
    return true;
  }
  function pickNext() {
    if (mode === 0) return index;                       // 单曲循环
    if (mode === 2) return Math.floor(Math.random() * TRACKS.length); // 随机
    return (index + 1) % TRACKS.length;                 // 列表循环
  }
  function nextOnEnd() { playTrack(pickNext() + 1); }
  function onEnded() { if (on) nextOnEnd(); }
  function setMode(m) { if (m >= 0 && m <= 2) { mode = m; notify(); } }
  function getMode() { return mode; }
  function resume() {
    on = true; ensureAudio();
    if (index < 0) playTrack(1);
    else { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
    notify();
  }
  function pause() { on = false; if (audio) audio.pause(); notify(); }
  function volumeUp() { volume = Math.min(1, +(volume + 0.1).toFixed(2)); if (audio) audio.volume = volume; }
  function volumeDown() { volume = Math.max(0, +(volume - 0.1).toFixed(2)); if (audio) audio.volume = volume; }
  function start() {
    // 启动随机选曲（与播放模式解耦）
    if (trackCount() > 0) playTrack(Math.floor(Math.random() * trackCount()) + 1);
  }
  function onStatus(cb) { statusCb = cb; notify(); }

  global.INC.audio = {
    start: start, playTrack: playTrack, setMode: setMode, getMode: getMode,
    resume: resume, pause: pause, volumeUp: volumeUp, volumeDown: volumeDown,
    trackCount: trackCount, listTracks: listTracks, currentIndex: currentIndex,
    status: status, onStatus: onStatus,
    MODE_NAMES: ['单曲循环', '列表循环', '随机播放']
  };
})(window);
