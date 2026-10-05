/*!
 * pages/game/game.js — 游戏页
 *
 * 页面实例本身充当网页版里的 app：把 setChips / toast / speedScale / onWin / onGameOver
 * 等接口补齐，三个玩法（同一份 js/games/*.js）就能原样跑起来。
 */
var FP = (typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis);
// app.js 会先于页面模块执行并初始化这些对象；这里做一次惰性兜底，
// 避免个别基础库下模块求值顺序不同导致取到 undefined。
var U = FP.util;
var UI = FP.mpUI;
var MP = FP.mpCanvas;
function ensureDeps() {
  if (!U) U = FP.util;
  if (!UI) UI = FP.mpUI;
  if (!MP) MP = FP.mpCanvas;
}
ensureDeps();

var TEXT_PREFIXES = ['btn.', 'chip.', 'modal.', 'toast.', 'hint.', 'score.', 'hud.', 'nav.'];
var EMPTY_MODAL = { show: false, kind: '', title: '', text: '', score: '', scoreLabel: '', rows: [], actions: [] };

function modeCtor(mode) {
  if (mode === '2048' && FP.G2048) return FP.G2048;
  if (mode === 'match3' && FP.Match3) return FP.Match3;
  if (mode === 'memory' && FP.Memory) return FP.Memory;
  return null;
}

Page({
  data: {
    T: {},
    mode: '',
    modeName: '',
    state: 'loading',
    chips: [
      { show: false, label: '', value: '', hot: false },
      { show: false, label: '', value: '', hot: false },
      { show: false, label: '', value: '', hot: false }
    ],
    showUndo: false,
    showHint: false,
    showShuffle: false,
    showDpad: false,
    hintText: '',
    toast: { show: false, text: '', kind: '' },
    modal: EMPTY_MODAL
  },

  /* ---------------- 生命周期 ---------------- */

  onLoad: function (query) {
    ensureDeps();
    var mode = (query && query.mode) || '2048';
    var Ctor = modeCtor(mode);
    if (!Ctor) {
      wx.showToast({ title: '未知玩法：' + mode, icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 800);
      return;
    }

    this.mode = mode;
    this.fresh = !(query && query.resume === '1');
    this.game = new Ctor(this);
    this.particles = FP.gfx.createParticles(300);

    this.setData({
      T: UI.text(TEXT_PREFIXES),
      mode: mode,
      modeName: FP.i18n.t('mode.' + mode + '.name'),
      state: 'loading',
      showUndo: mode === '2048',
      showHint: true,
      showShuffle: mode === 'match3' || mode === 'memory',
      showDpad: mode === '2048',
      hintText: mode === '2048' ? FP.i18n.t('hint.2048') : ''
    });

    wx.setNavigationBarTitle({ title: FP.i18n.t('mode.' + mode + '.name') });
  },

  onReady: function () {
    if (!this.game) return;
    this.boot();
  },

  // 小程序：窗口尺寸变化（旋转屏幕等）
  onResize: function (res) {
    if (res && res.size) {
      U.Device.winW = res.size.windowWidth;
      U.Device.winH = res.size.windowHeight;
    }
    if (!this.surface) return;
    var self = this;
    this.surface.remeasure().then(function () {
      self.surface.aspect = self.game ? self.game.aspect : self.surface.aspect;
      self.surface.applySize();
    });
  },

  onShow: function () {
    FP.audio.unlock();
    if (this.surface && this.surface.remeasure) this.surface.remeasure();
    if (this.game && this.data.state === 'paused') this.resumeGame();
  },

  onHide: function () {
    if (this.game && (this.data.state === 'playing')) this.pauseGame(true);
    this._stopLoop();
  },

  onUnload: function () {
    this._stopLoop();
    if (this.game) {
      if (this.game.unmount) this.game.unmount();
      if (this.game.save) this.game.save();
    }
    if (FP.input && FP.input.detachAll) FP.input.detachAll();
    this.game = null;
  },

  /* ---------------- 初始化画布与游戏 ---------------- */

  boot: function () {
    var self = this;
    var mode = this.mode;
    var game = this.game;

    // 玩法需要的宽高比
    var aspect = game.aspect || 1;

    MP.createSurface(this, '#board', aspect, '.stage').then(function (surface) {
      self.surface = surface;
      self.loop = MP.createLoop();

      // 与浏览器端 createSurface 一样：aspect 需要动态跟随玩法
      surface.aspect = aspect;
      surface.applySize();

      // 触摸坐标换算：视口坐标 -> 画布逻辑坐标（玩法内部不再关心平台差异）
      FP.input.setToLocal(function (x, y) { return surface.toLocal(x, y); });

      game.mount({
        ctx: surface.ctx,
        surface: surface,
        fx: self.particles,
        inputTarget: self,   // 小程序里由本页转发 touch 事件
        fresh: self.fresh
      });

      // 渲染循环
      self.loop.onFrame = function (dt) { self.frame(dt); };
      if (self.surface.canvas && self.surface.canvas.requestAnimationFrame) {
        self.loop.setRaf(self.surface.canvas.requestAnimationFrame.bind(self.surface.canvas));
      }
      self.setData({ state: 'playing' });
      self.loop.start();
    }).catch(function (err) {
      U.logErr('board.init', err);
      wx.showModal({
        title: '画布初始化失败',
        content: '请确认基础库版本 ≥ 2.9.0，并检查 canvas 是否使用了 type="2d"。',
        showCancel: false
      });
    });
  },

  frame: function (dt) {
    var game = this.game;
    if (!game) return;
    if (this.data.state === 'paused') {
      this.draw();
      return;
    }
    game.update(dt);
    this.particles.update(dt);
    this.draw();
  },

  draw: function () {
    var game = this.game;
    var surface = this.surface;
    if (!game || !surface) return;
    var ctx = surface.begin();
    game.draw();
    this.drawHintArrow(ctx);
  },

  // 提示箭头（替代网页版里由外壳绘制的浮层）
  drawHintArrow: function (ctx) {
    if (!this._hintDir) return;
    var k = U.clamp((U.now() - this._hintAt) / 900, 0, 1);
    if (k >= 1) { this._hintDir = null; return; }
    var w = this.surface.cssW;
    var h = this.surface.cssH;
    var arrow = { up: '↑', down: '↓', left: '←', right: '→' }[this._hintDir] || '';
    var off = {
      up: [0, -h * 0.22], down: [0, h * 0.22],
      left: [-w * 0.22, 0], right: [w * 0.22, 0]
    }[this._hintDir] || [0, 0];
    ctx.save();
    ctx.globalAlpha = Math.sin(k * Math.PI) * 0.85;
    FP.gfx.label(ctx, arrow, w / 2 + off[0], h / 2 + off[1], {
      size: Math.min(w, h) * 0.26,
      fill: 'rgba(255,255,255,.95)',
      weight: 800,
      shadow: 'rgba(0,0,0,.5)',
      shadowBlur: 16
    });
    ctx.restore();
  },

  _stopLoop: function () {
    if (this.loop) this.loop.stop();
  },

  /* ---------------- 网页版 app 接口（供 game/*.js 调用） ---------------- */

  setChips: function (list) {
    var current = this.data.chips;
    var next = [];
    var changed = false;
    for (var i = 0; i < 3; i++) {
      var def = list && list[i];
      var cur = current[i] || {};
      if (!def) {
        next.push({ show: false, label: cur.label || '', value: '', hot: false });
        if (cur.show) changed = true;
        continue;
      }
      var value = typeof def.value === 'number' ? U.fmt(def.value) : String(def.value == null ? '' : def.value);
      var item = {
        show: true,
        label: def.label || '',
        value: value,
        hot: !!def.hot
      };
      next.push(item);
      if (!cur.show || cur.label !== item.label || cur.value !== item.value || !!cur.hot !== item.hot) changed = true;
    }
    if (changed) this.setData({ chips: next });
  },

  toast: function (msg, opt) {
    UI.toast(this, msg, opt);
  },

  // 与网页版同名接口：视口坐标 -> 画布逻辑坐标
  toLocal: function (clientX, clientY) {
    if (this.surface) return this.surface.toLocal(clientX, clientY);
    return { x: clientX, y: clientY };
  },

  speedScale: function () {
    var s = FP.store.settings().speed;
    if (s === 'fast') return 0.75;
    if (s === 'slow') return 1.35;
    return 1;
  },

  autoHint: function () {
    if (this.game && this.game.hint) this.game.hint();
  },

  hintTouch: function () { /* 预留 */ },

  flashHint: function (dir) {
    this._hintDir = dir;
    this._hintAt = U.now();
    U.vibrate(6);
  },

  confirmRestart: function () { this.onRestart(); },

  /* ---------------- 结果流程 ---------------- */

  onWin: function (info) {
    var mode = this.mode;
    var isBest = FP.store.setBest(mode, info.score);
    FP.store.bump('clears');
    FP.store.bump('totalScore', info.score);
    var self = this;
    this.setData({ state: 'won' });
    UI.modal(this, {
      kind: 'win',
      title: FP.i18n.t('modal.win') + (isBest ? ' ' + FP.i18n.t('modal.newBest') : ''),
      score: U.fmt(info.score),
      scoreLabel: FP.i18n.t('chip.score'),
      rows: this.resultRows(info, isBest),
      actions: [
        { id: 'menu', label: FP.i18n.t('btn.home'), kind: 'soft' },
        { id: 'resume', label: info.primaryLabel || FP.i18n.t('btn.resume'), kind: 'primary' }
      ]
    }, {
      menu: function () { self.goMenu(); },
      resume: function () {
        if (info.onPrimary) info.onPrimary();
        self.resumeGame();
      }
    });
  },

  onGameOver: function (info) {
    var mode = this.mode;
    var isBest = FP.store.setBest(mode, info.score);
    if (info.reason === 'clear') FP.store.bump('clears');
    FP.store.bump('totalScore', info.score);
    FP.store.clearGame(mode);
    var self = this;
    this.setData({ state: 'over' });
    UI.modal(this, {
      kind: 'over',
      title: info.title || (FP.i18n.t('modal.over') + (isBest ? ' ' + FP.i18n.t('modal.newBest') : '')),
      score: U.fmt(info.score),
      scoreLabel: FP.i18n.t('chip.score'),
      rows: this.resultRows(info, isBest),
      actions: [
        { id: 'menu', label: FP.i18n.t('btn.home'), kind: 'soft' },
        { id: 'restart', label: FP.i18n.t('btn.retry'), kind: 'primary' }
      ]
    }, {
      menu: function () { self.goMenu(); },
      restart: function () { self.restartGame(); }
    });
  },

  resultRows: function (info, isBest) {
    var rows = [];
    rows.push({ label: FP.i18n.t('score.best'), value: U.fmt(FP.store.bestOf(this.mode)) + (isBest ? ' 🎉' : '') });
    if (info.moves != null) rows.push({ label: FP.i18n.t('score.moves'), value: U.fmt(info.moves) });
    (info.extra || []).forEach(function (x) { rows.push({ label: x.label, value: String(x.value) }); });
    if (this.game && this.mode === '2048' && this.game.maxValue) {
      var mv = this.game.maxValue();
      rows.push({ label: FP.i18n.t('score.level'), value: FP.fruitMeta(mv).emoji + ' ' + U.fmt(mv) });
    }
    return rows;
  },

  /* ---------------- 交互 ---------------- */

  onTouchStart: function (e) { this._dispatch('start', e); },
  onTouchMove: function (e) { this._dispatch('move', e); },
  onTouchEnd: function (e) { this._dispatch('end', e); },
  onTouchCancel: function (e) { this._dispatch('cancel', e); },

  _dispatch: function (type, e) {
    var st = this.data.state;
    if (!this.game || st === 'paused' || st === 'won' || st === 'over' || st === 'loading') return;
    // 触摸事件的坐标是视口坐标，换算函数已在 boot 时注入
    FP.input.dispatch(type, e);
  },

  onDir: function (e) {
    var dir = e.currentTarget.dataset.dir;
    if (this.game && this.game.move) this.game.move(dir);
  },

  onUndo: function () { if (this.game && this.game.undo) this.game.undo(); },
  onHint: function () { if (this.game && this.game.hint) this.game.hint(); },
  onShuffle: function () { if (this.game && this.game.shuffle) this.game.shuffle(); },
  onRestart: function () { this.restartGame(); },

  onPause: function () {
    if (this.data.state === 'playing') this.pauseGame(false);
    else if (this.data.state === 'paused') this.resumeGame();
  },

  onModalAction: function (e) {
    UI.handleAction(this, e.currentTarget.dataset.action);
  },

  onScrim: function () {
    if (this.data.state === 'paused') this.resumeGame();
    else UI.closeModal(this);
  },

  /* ---------------- 暂停 / 继续 / 重开 / 返回 ---------------- */

  pauseGame: function (silent) {
    if (!this.game) return;
    if (this.game.pause) this.game.pause();
    this.setData({ state: 'paused' });
    if (silent) return;
    var self = this;
    UI.modal(this, {
      kind: 'pause',
      title: FP.i18n.t('modal.paused'),
      text: FP.i18n.t('modal.pausedBody'),
      actions: [
        { id: 'menu', label: FP.i18n.t('btn.home'), kind: 'soft' },
        { id: 'restart', label: FP.i18n.t('btn.retry'), kind: 'ghost' },
        { id: 'resume', label: FP.i18n.t('btn.resume'), kind: 'primary' }
      ]
    }, {
      menu: function () { self.goMenu(); },
      restart: function () { self.restartGame(); },
      resume: function () { self.resumeGame(); }
    });
  },

  resumeGame: function () {
    if (!this.game) return;
    UI.closeModal(this);
    if (this.game.resume) this.game.resume();
    this.setData({ state: 'playing' });
  },

  restartGame: function () {
    if (!this.game) return;
    UI.closeModal(this);
    if (this.game.unmount) this.game.unmount();
    if (FP.input && FP.input.detachAll) FP.input.detachAll();
    var Ctor = modeCtor(this.mode);
    this.game = new Ctor(this);
    this.setData({ state: 'playing' });
    this.surface.aspect = this.game.aspect;
    this.surface.applySize();
    this.game.mount({
      ctx: this.surface.ctx,
      surface: this.surface,
      fx: this.particles,
      inputTarget: this,
      fresh: true
    });
    FP.store.bump('plays');
  },

  goMenu: function () {
    UI.closeModal(this);
    if (this.game && this.game.save) this.game.save();
    wx.navigateBack({
      fail: function () { wx.reLaunch({ url: '/pages/index/index' }); }
    });
  },

  /* ---------------- 分享 ---------------- */

  onShareAppMessage: function () {
    var score = this.game ? (this.game.score || 0) : 0;
    var code = FP.store.encodeShare(this.mode, score);
    return {
      title: FP.i18n.t('mode.' + this.mode + '.name') + ' · ' + U.fmt(score),
      path: '/pages/index/index?s=' + code
    };
  }
});
