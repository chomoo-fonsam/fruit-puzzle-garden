/*!
 * pages/index/index.js — 首页：模式选择、设置、玩法说明、分享
 */
var FP = (typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis);
var U = FP.util;
var UI = FP.mpUI;
function ensureDeps() {
  if (!U) U = FP.util;
  if (!UI) UI = FP.mpUI;
}
ensureDeps();

// 取全局 App 实例（模块加载时 getApp() 可能还没准备好，所以包一层）
function globalData(key, value) {
  try {
    var inst = typeof getApp === 'function' ? getApp() : null;
    if (!inst || !inst.globalData) return undefined;
    if (key == null) return inst.globalData;
    if (value !== undefined) inst.globalData[key] = value;
    return inst.globalData[key];
  } catch (e) { return undefined; }
}

var TEXT_PREFIXES = [
  'app.', 'btn.', 'score.', 'settings.', 'modal.', 'toast.', 'share.',
  'mode.2048.name', 'mode.2048.desc',
  'mode.match3.name', 'mode.match3.desc',
  'mode.memory.name', 'mode.memory.desc'
];

var EMPTY_MODAL = {
  show: false, kind: '', title: '', text: '',
  score: '', scoreLabel: '', rows: [], actions: []
};

Page({
  data: {
    T: {},
    modes: [],
    hasSave: false,
    lang: 'zh',
    theme: 'auto',
    haptics: false,
    hintMoves: true,
    speed: 'normal',
    howto: [],
    toast: { show: false, text: '', kind: '' },
    modal: EMPTY_MODAL
  },

  onLoad: function (query) {
    ensureDeps();
    this.refreshText();
    this.refreshModes();
    this.refreshSettings();
    if (query && query.s) {
      var decoded = null;
      try { decoded = FP.store.decodeShare(query.s); } catch (e) { decoded = null; }
      if (decoded) this.showShared(decoded);
    }
  },

  onShow: function () {
    // 从游戏页返回时最高分可能已更新
    this.refreshModes();
    this.setData({ hasSave: FP.store.hasAnySave() });
  },

  /* ---------------- 文案与数据 ---------------- */

  refreshText: function () {
    this.setData({ T: UI.text(TEXT_PREFIXES), lang: FP.i18n.get() });
  },

  refreshModes: function () {
    this.setData({ modes: FP.modeList() });
  },

  refreshSettings: function () {
    var s = FP.store.settings();
    this.setData({
      theme: s.theme || 'auto',
      haptics: !!s.haptics,
      hintMoves: !!s.hintMoves,
      speed: s.speed || 'normal'
    });
  },

  /* ---------------- 进入游戏 ---------------- */

  onPick: function (e) {
    FP.audio.unlock();
    wx.navigateTo({ url: '/pages/game/game?mode=' + e.currentTarget.dataset.mode });
  },

  onContinue: function () {
    var pick = null;
    var at = 0;
    ['2048', 'match3', 'memory'].forEach(function (m) {
      var s = FP.store.loadGame(m);
      if (s && s.at > at) { at = s.at; pick = m; }
    });
    wx.navigateTo({ url: '/pages/game/game?mode=' + (pick || '2048') + '&resume=1' });
  },

  /* ---------------- 分享 ---------------- */

  onShare: function () {
    var self = this;
    var rows = FP.modes.map(function (m) {
      return { label: FP.modeName(m.id), value: U.fmt(FP.store.bestOf(m.id)) };
    });
    openModal(this, {
      kind: 'share',
      title: FP.i18n.t('modal.share'),
      text: FP.i18n.t('share.body'),
      rows: rows,
      actions: [
        { id: 'wechat', label: FP.i18n.t('btn.share'), kind: 'ghost' },
        { id: 'copy', label: FP.i18n.t('btn.copy'), kind: 'soft' },
        { id: 'close', label: FP.i18n.t('btn.close'), kind: 'primary' }
      ]
    }, {
      wechat: function () {
        // 提示用户点右上角"···"转发（小程序内无法直接唤起转发面板）
        UI.toast(self, FP.i18n.t('share.tapMore'), { kind: 'good', duration: 2200 });
      },
      copy: function () {
        var code = FP.store.encodeShare('2048', FP.store.bestOf('2048'));
        wx.setClipboardData({
          data: '/pages/index/index?s=' + code,
          success: function () { UI.toast(self, FP.i18n.t('toast.copied'), { kind: 'good' }); }
        });
      }
    });
  },

  onShareAppMessage: function () {
    return {
      title: FP.i18n.t('app.name') + ' · ' + FP.i18n.t('app.tagline'),
      path: '/pages/index/index'
    };
  },

  onShareTimeline: function () {
    return { title: FP.i18n.t('app.name') + ' · ' + FP.i18n.t('app.tagline') };
  },

  /* ---------------- 设置 ---------------- */

  onSettings: function () {
    openModal(this, {
      kind: 'settings',
      title: FP.i18n.t('settings.title'),
      actions: [{ id: 'close', label: FP.i18n.t('btn.close'), kind: 'primary' }]
    }, {});
  },

  onLang: function (e) {
    var lang = e.currentTarget.dataset.lang;
    FP.i18n.set(lang);
    globalData('lang', lang);
    this.refreshText();
    this.setData({ howto: buildHowto() });
  },

  onTheme: function (e) {
    var mode = e.currentTarget.dataset.theme;
    FP.store.set('settings.theme', mode);
    var resolved = FP.theme.apply(mode);
    globalData('theme', resolved);
    this.setData({ theme: mode });
    // 原生导航栏跟随切换
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: resolved === 'dark' ? '#172420' : '#f2704a'
    });
  },

  onHaptics: function (e) {
    FP.store.set('settings.haptics', e.detail.value);
    this.setData({ haptics: e.detail.value });
    if (e.detail.value) U.vibrate(18);
  },

  onHintMoves: function (e) {
    FP.store.set('settings.hintMoves', e.detail.value);
    this.setData({ hintMoves: e.detail.value });
  },

  onSpeed: function (e) {
    var speed = e.currentTarget.dataset.speed;
    FP.store.set('settings.speed', speed);
    this.setData({ speed: speed });
  },

  onReset: function () {
    var self = this;
    openModal(this, {
      kind: 'reset',
      title: FP.i18n.t('settings.reset'),
      text: FP.i18n.t('settings.resetConfirm'),
      actions: [
        { id: 'close', label: FP.i18n.t('btn.close'), kind: 'soft' },
        { id: 'reset', label: FP.i18n.t('settings.reset'), kind: 'primary' }
      ]
    }, {
      reset: function () {
        FP.store.resetAll();
        FP.theme.apply('auto');
        self.refreshModes();
        self.refreshSettings();
        self.setData({ hasSave: false });
        UI.toast(self, FP.i18n.t('settings.resetDone'), { kind: 'warn' });
      }
    });
  },

  /* ---------------- 玩法说明 ---------------- */

  onHowTo: function () {
    this.setData({ howto: buildHowto() });
    openModal(this, {
      kind: 'howto',
      title: FP.i18n.t('btn.howto'),
      actions: [{ id: 'close', label: FP.i18n.t('btn.close'), kind: 'primary' }]
    }, {});
  },

  /* ---------------- 弹窗事件 ---------------- */

  onModalAction: function (e) {
    UI.handleAction(this, e.currentTarget.dataset.action);
  },

  onScrim: function () {
    UI.closeModal(this);
  },

  /* ---------------- 从分享码进入 ---------------- */

  showShared: function (decoded) {
    var self = this;
    openModal(this, {
      kind: 'shared',
      title: FP.i18n.t('modal.share'),
      score: U.fmt(decoded.s),
      scoreLabel: FP.modeName(decoded.m) || decoded.m,
      rows: [{ label: FP.i18n.t('score.best'), value: U.fmt(decoded.b) }],
      actions: [
        { id: 'close', label: FP.i18n.t('btn.close'), kind: 'soft' },
        { id: 'play', label: FP.i18n.t('btn.start'), kind: 'primary' }
      ]
    }, {
      play: function () { wx.navigateTo({ url: '/pages/game/game?mode=' + decoded.m }); }
    });
  }
});

/* ---------------- 辅助 ---------------- */

function openModal(page, opt, callbacks) {
  var wrapped = { close: function () {} };
  Object.keys(callbacks || {}).forEach(function (k) {
    var fn = callbacks[k];
    if (typeof fn === 'function') wrapped[k] = function () { fn.call(page); };
  });
  UI.modal(page, opt, wrapped);
}

function buildHowto() {
  return FP.modes.map(function (m) {
    return {
      id: m.id,
      emoji: m.emoji,
      name: FP.modeName(m.id),
      rules: FP.i18n.t('mode.' + m.id + '.rules')
    };
  });
}
