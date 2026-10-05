/*!
 * 果园谜题 · 微信小程序版入口
 * 复用与网页版完全相同的三套玩法核心（js/core + js/games），
 * 仅把渲染 / 输入 / 存储 / 音效 / UI 换成小程序实现。
 */
var util = require('./js/core/util.js');
var i18n = require('./js/core/i18n.js');
var store = require('./js/core/store.js');
var audio = require('./js/core/audio.js');
var gfx = require('./js/core/canvas.js');
var inputMp = require('./core-mp/input-mp.js');
var uiMp = require('./core-mp/ui-mp.js');

// 三个玩法的构造器（与网页版是同一份文件）
require('./js/games/g2048.js');
require('./js/games/match3.js');
require('./js/games/memory.js');

var FP = (typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis);

// 主题令牌：与网页版 main.js 保持一致，供三个玩法的绘制代码取值
var TOKENS = {
  light: {
    boardBg: '#fff6e6',
    boardStroke: 'rgba(90,60,20,.14)',
    cellBg: 'rgba(120,90,50,.10)',
    cellBgAlt: 'rgba(120,90,50,.16)',
    select: 'rgba(255,168,64,.55)',
    cursor: 'rgba(60,40,20,.75)',
    cardBackA: '#ff9f68',
    cardBackB: '#f2704a'
  },
  dark: {
    boardBg: 'rgba(255,255,255,.05)',
    boardStroke: 'rgba(255,255,255,.10)',
    cellBg: 'rgba(255,255,255,.05)',
    cellBgAlt: 'rgba(255,255,255,.09)',
    select: 'rgba(255,190,90,.50)',
    cursor: 'rgba(255,240,220,.85)',
    cardBackA: '#ff9f68',
    cardBackB: '#e2613f'
  }
};

var themeMode = 'light';

FP.theme = {
  mode: themeMode,
  resolved: themeMode,
  tokens: function () { return TOKENS[this.resolved] || TOKENS.light; },
  apply: function (mode) {
    var m = mode || 'light';
    this.mode = m;
    if (m === 'auto') {
      try {
        var info = wx.getSystemInfoSync();
        m = info.theme === 'dark' ? 'dark' : 'light';
      } catch (e) { m = 'light'; }
    }
    this.resolved = m === 'dark' ? 'dark' : 'light';
    return this.resolved;
  }
};

// 模式定义（与网页版同构）
FP.modes = [
  { id: '2048', emoji: '🍎', badge: '1', key: '2048' },
  { id: 'match3', emoji: '🍓', badge: '2', key: 'match3' },
  { id: 'memory', emoji: '🧠', badge: '3', key: 'memory' }
];

FP.modeName = function (id) {
  return FP.i18n.t('mode.' + id + '.name');
};

FP.modeDesc = function (id) {
  return FP.i18n.t('mode.' + id + '.desc');
};

FP.modeList = function () {
  return FP.modes.map(function (m) {
    return {
      id: m.id,
      emoji: m.emoji,
      badge: m.badge,
      name: FP.modeName(m.id),
      desc: FP.modeDesc(m.id),
      best: FP.store.bestOf(m.id)
    };
  });
};

FP.textBundle = function (prefixes) {
  return FP.mpUI.text(prefixes);
};

App({
  globalData: {
    theme: 'light',
    lang: 'zh'
  },

  onLaunch: function () {
    // i18n 初始化（会写入 store 的 lang）
    FP.i18n.init();
    this.globalData.lang = FP.i18n.get();
    this.globalData.theme = FP.theme.apply(FP.store.settings().theme);

    // 深浅色变化跟随系统
    if (wx.onThemeChange) {
      wx.onThemeChange(function (res) {
        if (FP.store.settings().theme === 'auto') {
          FP.theme.apply('auto');
          FP.theme.resolved = res.theme === 'dark' ? 'dark' : 'light';
          FP.bus && FP.bus.emit('theme', FP.theme.resolved);
        }
      });
    }

    if (wx.showShareMenu) {
      try { wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] }); }
      catch (e) { /* 低版本忽略 */ }
    }
  },

  onShow: function () {
    // 回到前台时恢复音乐设置（小程序端音频为可选扩展）
    FP.audio.applySettings();
  },

  onHide: function () {
    FP.audio.stopMusic();
  },

  onError: function (err) {
    FP.util.logErr('app.onError', err);
  }
});
