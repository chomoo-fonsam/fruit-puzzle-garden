/*!
 * main.js — 应用外壳：主题、模式切换、存档、弹窗流程、渲染循环
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});
  var U = FP.util;
  var G = FP.gfx;
  var el = U.el;

  /* ================= 主题令牌 ================= */

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

  FP.theme = {
    mode: 'auto',
    resolved: 'light',
    apply: function (mode) {
      var m = mode || FP.store.settings().theme || 'auto';
      this.mode = m;
      var dark = m === 'dark' || (m === 'auto' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
      this.resolved = dark ? 'dark' : 'light';
      U.root.setAttribute('data-theme', m);
      U.root.setAttribute('data-effective', this.resolved);
      var meta = U.qs('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#101a14' : '#fff8ef');
    },
    tokens: function () { return TOKENS[this.resolved] || TOKENS.light; }
  };

  if (global.matchMedia) {
    try {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (FP.theme.mode === 'auto') FP.theme.apply('auto');
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (e) { /* noop */ }
  }

  /* ================= 模式定义 ================= */

  FP.modes = [
    { id: '2048', emoji: '🍎', badge: '1️⃣', key: '2048' },
    { id: 'match3', emoji: '🍓', badge: '2️⃣', key: 'match3' },
    { id: 'memory', emoji: '🧠', badge: '3️⃣', key: 'memory' }
  ];
  FP.modes.forEach(function (m) {
    m.name = FP.i18n.t('mode.' + m.key + '.name');
    m.desc = FP.i18n.t('mode.' + m.key + '.desc');
  });

  var MODE_CTOR = {
    '2048': function () { return new FP.G2048(FP.app); },
    match3: function () { return new FP.Match3(FP.app); },
    memory: function () { return new FP.Memory(FP.app); }
  };

  /* ================= 应用 ================= */

  var app = {
    game: null,
    activeMode: null,
    lastInput: 'pointer',
    loop: null,
    surface: null,
    particles: null,
    theme: FP.theme,
    audio: FP.audio,
    difficulty: null,
    _hintUntil: 0,
    _hintDir: null
  };
  FP.app = app;

  var dom = {};

  function cacheDom() {
    dom.app = U.qs('#app');
    dom.title = U.qs('#game-title');
    dom.subtitle = U.qs('#game-subtitle');
    dom.screenHome = U.qs('#screen-home');
    dom.screenGame = U.qs('#screen-game');
    dom.modeGrid = U.qs('#mode-grid');
    dom.board = U.qs('#board');
    dom.holder = U.qs('#board-holder');
    dom.touchpad = U.qs('#touchpad');
    dom.gestureHint = U.qs('#gesture-hint');
    dom.controlPrimary = U.qs('#control-primary');
    dom.btnHome = U.qs('#btn-home');
    dom.btnSound = U.qs('#btn-sound');
    dom.icoSound = U.qs('#ico-sound');
    dom.btnPause = U.qs('#btn-pause');
    dom.btnUndo = U.qs('#btn-undo');
    dom.btnHint = U.qs('#btn-hint');
    dom.btnShuffle = U.qs('#btn-shuffle');
    dom.btnPrimary = U.qs('#btn-primary');
    dom.btnRestart = U.qs('#btn-restart');
    dom.btnSettings = U.qs('#btn-settings');
    dom.btnSettings2 = U.qs('#btn-settings2');
    dom.btnHowto = U.qs('#btn-howto');
    dom.btnShare = U.qs('#btn-share');
    dom.btnContinue = U.qs('#btn-continue');
    dom.homeTip = U.qs('#home-tip');
  }

  /* ---------------- 画布与循环 ---------------- */

  function setupCanvas() {
    app.surface = G.createSurface(dom.board, 1);
    app.particles = G.createParticles(320);
    resizeCanvas();

    app.loop = G.createLoop();
    app.loop.onFrame = function (dt) {
      var s = app.surface;
      // 布局自检：以真实渲染尺寸为准，避免操作坐标与画面对不上
      s.sync();
      if (app.game) {
        if (Math.abs(s.aspect - app.game.aspect) > 0.001) {
          s.aspect = app.game.aspect;
          resizeCanvas();
        }
      }
      if (!app.game) return;
      var g = app.game;
      if (dom.app.dataset.state === 'paused') {
        // 暂停时仍绘制静态画面
        drawFrame();
        return;
      }
      g.update(dt);
      app.particles.update(dt);
      drawFrame();
    };
    app.loop.start();
  }

  function drawFrame() {
    var g = app.game;
    if (!g || !app.surface) return;
    var ctx = app.surface.begin();
    g.draw();
    drawOverlay(ctx);
  }

  function drawOverlay(ctx) {
    if (!app._hintDir) return;
    var k = U.clamp((U.now() - app._hintAt) / 900, 0, 1);
    if (k >= 1) { app._hintDir = null; return; }
    var w = app.surface.cssW;
    var h = app.surface.cssH;
    var arrow = { up: '↑', down: '↓', left: '←', right: '→' }[app._hintDir] || '';
    var alpha = Math.sin(k * Math.PI) * 0.85;
    var cx = w / 2, cy = h / 2;
    var off = { up: [0, -h * 0.22], down: [0, h * 0.22], left: [-w * 0.22, 0], right: [w * 0.22, 0] }[app._hintDir] || [0, 0];
    ctx.save();
    ctx.globalAlpha = alpha;
    G.label(ctx, arrow, cx + off[0], cy + off[1], {
      size: Math.min(w, h) * 0.26, fill: 'rgba(255,255,255,.95)', weight: 800,
      shadow: 'rgba(0,0,0,.5)', shadowBlur: 16
    });
    ctx.restore();
  }

  // 棋盘尺寸：手机保持紧凑，平板/桌面按可用空间放大，确保触控目标够大
  function boardCap() {
    var vmin = Math.min(global.innerWidth, global.innerHeight);
    var cap = Math.round(vmin * 0.94);
    if (vmin >= 640) cap = 660;
    else if (vmin >= 480) cap = 540;
    return U.clamp(cap, 240, 660);
  }

  var resizeRaf = null;
  function scheduleResize() {
    if (resizeRaf) return;
    resizeRaf = global.requestAnimationFrame(function () {
      resizeRaf = null;
      resizeCanvas();
    });
  }

  function resizeCanvas() {
    if (!app.surface) return;
    // 样式表可能还没加载完（此时容器尺寸是错的），交给 load / 首帧自检来兜底
    if (global.document.readyState === 'loading') return;
    var holder = dom.holder;
    var rect = holder.getBoundingClientRect();
    // 游戏页不可见时（首页 / 已隐藏）不要去重算尺寸
    if (rect.width < 32 || rect.height < 32) return;
    var availW = Math.max(160, rect.width);
    var availH = Math.max(160, rect.height);
    app.surface.aspect = app.game ? app.game.aspect : 1;
    app.surface.resize(availW, availH, boardCap());
    // 立即以真实渲染尺寸校准一次，保证第一次点击就落在正确位置
    app.surface.sync(true);
  }

  /* ---------------- 界面辅助 ---------------- */

  app.setChips = function (list) { FP.ui.setChips(list); };
  app.toast = function (msg, opt) { FP.ui.toast(msg, opt); };

  // 统一的屏幕坐标 -> 棋盘逻辑坐标换算（各游戏共用，保证与绘制一致）
  app.toLocal = function (clientX, clientY) {
    if (!app.surface) return { x: clientX, y: clientY };
    return app.surface.toLocal(clientX, clientY);
  };
  app.speedScale = function () {
    var s = FP.store.settings().speed;
    if (s === 'fast') return 0.75;
    if (s === 'slow') return 1.35;
    return 1;
  };
  app.flashHint = function (dir) {
    app._hintDir = dir;
    app._hintAt = U.now();
  };
  app.hintTouch = function () { /* 触摸点击时的轻反馈，保留扩展位 */ };

  app.autoHint = function () {
    if (app.game && app.game.hint) app.game.hint();
  };

  app.confirmRestart = function () {
    if (!app.game) return;
    FP.ui.modal({
      title: FP.i18n.t('btn.restart'),
      body: '<p>' + U.escapeHtml(FP.i18n.t('btn.restart')) + '?</p>',
      actions: [
        { label: FP.i18n.t('btn.close'), kind: 'soft' },
        {
          label: FP.i18n.t('btn.restart'), kind: 'primary',
          onClick: function () { restart(true); }
        }
      ]
    });
  };

  /* ---------------- 玩法与流程 ---------------- */

  app.updateControls = function () {
    var g = app.game;
    if (!g) return;
    var is2048 = g.id === '2048';
    var isM3 = g.id === 'match3';
    var isMem = g.id === 'memory';
    // 只有真正实现了撤销的模式才显示撤销按钮
    dom.btnUndo.hidden = !(g.undo && g.id === '2048');
    dom.btnHint.hidden = !g.hint;
    dom.btnShuffle.hidden = !(isM3 || isMem);
    // 横屏矮屏时方向键会压住棋盘，改用滑动 / 键盘
    var shortLandscape = global.innerHeight <= 520 && global.innerWidth > global.innerHeight;
    dom.touchpad.hidden = !is2048 || shortLandscape;
    dom.gestureHint.hidden = !is2048;
    dom.gestureHint.textContent = is2048 ? FP.i18n.t('hint.2048') : '';
  };

  /* ---------------- 屏幕切换 ---------------- */

  function showHome() {
    if (app.game) {
      app.game.pause && app.game.pause();
      app.game.unmount && app.game.unmount();
      app.game = null;
    }
    app.activeMode = null;
    FP.ui.setChips([]);
    dom.screenHome.hidden = false;
    dom.screenGame.hidden = true;
    dom.app.dataset.screen = 'home';
    dom.app.dataset.state = 'idle';
    dom.title.textContent = FP.i18n.t('app.name');
    dom.subtitle.textContent = FP.i18n.t('app.tagline');
    renderHome();
    dom.btnUndo.hidden = true;
    dom.btnHint.hidden = true;
    dom.btnShuffle.hidden = true;
    dom.btnRestart.hidden = true;
    dom.btnPrimary.hidden = true;
    dom.touchpad.hidden = true;
    dom.gestureHint.hidden = true;
  }

  function renderHome() {
    U.clear(dom.modeGrid);
    FP.modes.forEach(function (m) {
      var card = FP.ui.modeCard(m.id, { name: m.name, desc: m.desc, emoji: m.emoji, badge: m.badge },
        FP.store.bestOf(m.id), function (mode) { start(mode, { fresh: false }); });
      dom.modeGrid.appendChild(card);
    });
    var hasSave = FP.store.hasAnySave();
    dom.btnContinue.hidden = !hasSave;
    if (hasSave) {
      var last = FP.store.get('stats.lastPlayed', 0);
      var label = dom.btnContinue.querySelector('span');
      if (label) label.textContent = FP.i18n.t('btn.continue');
    }
    var s = FP.store.stats();
    dom.homeTip.textContent = (FP.Device.touch ? '📱 ' : '🖥️ ') +
      FP.i18n.t('app.tagline') + ' · ' + FP.i18n.t('a11y.board');
    // 可用存储提示
    if (!FP.store.available) {
      dom.homeTip.textContent = dom.homeTip.textContent + ' · (本地存储不可用)';
    }
    FP.ui.applyDom(dom.screenHome);
  }

  function start(mode, opts) {
    opts = opts || {};
    if (!MODE_CTOR[mode]) return;
    if (app.game) {
      app.game.pause && app.game.pause();
      app.game.unmount && app.game.unmount();
      app.game = null;
    }
    app.activeMode = mode;
    var game = MODE_CTOR[mode]();
    app.game = game;
    app.surface.aspect = game.aspect;

    dom.screenHome.hidden = true;
    dom.screenGame.hidden = false;
    dom.app.dataset.screen = 'game';
    dom.app.dataset.state = 'playing';
    dom.title.textContent = game.name;
    dom.subtitle.textContent = FP.i18n.t('mode.' + mode + '.subtitle') || modeLabel(mode);
    dom.btnPrimary.hidden = true;
    dom.btnRestart.hidden = false;
    dom.btnHint.hidden = false;

    var ctx = {
      ctx: app.surface.ctx,
      surface: app.surface,
      fx: app.particles,
      overlay: null,
      inputTarget: dom.board,
      fresh: !!opts.fresh
    };
    resizeCanvas();
    game.mount(ctx);
    app.updateControls();
    FP.store.bump('plays');
    FP.store.set('stats.lastPlayed', Date.now());
    FP.audio.unlock();
    FP.audio.applySettings();
    FP.ui.applyDom(dom.app);
  }

  function restart(fresh) {
    if (!app.activeMode) return;
    var mode = app.activeMode;
    if (app.game) {
      app.game.unmount && app.game.unmount();
      app.game = null;
    }
    var game = MODE_CTOR[mode]();
    app.game = game;
    app.surface.aspect = game.aspect;
    resizeCanvas();
    game.mount({
      ctx: app.surface.ctx,
      surface: app.surface,
      fx: app.particles,
      inputTarget: dom.board,
      fresh: true
    });
    app.updateControls();
    dom.app.dataset.state = 'playing';
    FP.store.bump('plays');
    FP.store.set('stats.lastPlayed', Date.now());
  }

  function modeLabel(mode) {
    var m = FP.modes.filter(function (x) { return x.id === mode; })[0];
    return m ? m.desc : '';
  }

  /* ---------------- 暂停 / 结束 ---------------- */

  function pauseGame(silent) {
    if (!app.game || dom.app.dataset.state === 'paused') return;
    dom.app.dataset.state = 'paused';
    app.game.pause && app.game.pause();
    if (silent) return;
    FP.ui.modal({
      title: FP.i18n.t('modal.paused'),
      body: '<p>' + U.escapeHtml(FP.i18n.t('modal.pausedBody')) + '</p>',
      dismissible: true,
      actions: [
        { label: FP.i18n.t('btn.home'), kind: 'soft', onClick: function () { showHome(); } },
        { label: FP.i18n.t('btn.retry'), kind: 'ghost', onClick: function () { restart(true); } },
        { label: FP.i18n.t('btn.resume'), kind: 'primary', onClick: function () { resumeGame(); } }
      ],
      onClose: function () { resumeGame(); }
    });
  }

  function resumeGame() {
    if (!app.game) return;
    dom.app.dataset.state = 'playing';
    app.game.resume && app.game.resume();
  }

  app.onWin = function (info) {
    var mode = app.activeMode;
    var isBest = FP.store.setBest(mode, info.score);
    FP.store.bump('clears');
    FP.store.bump('totalScore', info.score);
    FP.ui.modal({
      title: FP.i18n.t('modal.win') + (isBest ? ' ' + FP.i18n.t('modal.newBest') : ''),
      body: resultBody(info, isBest),
      dismissible: false,
      actions: [
        { label: FP.i18n.t('btn.home'), kind: 'soft', onClick: function () { showHome(); } },
        {
          label: info.primaryLabel || FP.i18n.t('btn.retry'), kind: 'primary',
          onClick: function () {
            if (info.onPrimary) info.onPrimary();
            resumeGame();
          }
        }
      ]
    });
  };

  app.onGameOver = function (info) {
    var mode = app.activeMode;
    var isBest = FP.store.setBest(mode, info.score);
    if (info.reason === 'clear') FP.store.bump('clears');
    FP.store.bump('totalScore', info.score);
    FP.store.clearGame(mode);
    dom.app.dataset.state = 'over';
    FP.ui.modal({
      title: info.title || FP.i18n.t('modal.over') + (isBest ? ' ' + FP.i18n.t('modal.newBest') : ''),
      body: resultBody(info, isBest),
      dismissible: false,
      actions: [
        { label: FP.i18n.t('btn.home'), kind: 'soft', onClick: function () { showHome(); } },
        { label: FP.i18n.t('btn.share'), kind: 'ghost', onClick: function () { shareScore(); } },
        { label: FP.i18n.t('btn.retry'), kind: 'primary', onClick: function () { restart(true); } }
      ]
    });
  };

  function resultBody(info, isBest) {
    var mode = app.activeMode;
    var rows = [];
    rows.push(scoreRow(FP.i18n.t('score.best'), U.fmt(FP.store.bestOf(mode)) + (isBest ? ' 🎉' : '')));
    if (info.moves != null) rows.push(scoreRow(FP.i18n.t('score.moves'), U.fmt(info.moves)));
    (info.extra || []).forEach(function (x) {
      rows.push(scoreRow(x.label, x.value));
    });
    if (app.game && app.game.id === '2048' && app.game.maxValue) {
      var mv = app.game.maxValue();
      var meta = FP.fruitMeta(mv);
      rows.push(scoreRow(FP.i18n.t('score.level'), meta.emoji + ' ' + U.fmt(mv)));
    }
    return el('div', { class: 'result' }, [
      el('div', { class: 'result-score' }, [
        el('span', { class: 'result-score-value', text: U.fmt(info.score) }),
        el('span', { class: 'result-score-label', text: FP.i18n.t('chip.score') })
      ]),
      el('div', { class: 'result-rows' }, rows)
    ]);
  }

  function scoreRow(label, value) {
    return el('div', { class: 'result-row' }, [
      el('span', { text: label }),
      el('b', { text: String(value) })
    ]);
  }

  /* ---------------- 分享 ---------------- */

  function shareScore() {
    var mode = app.activeMode || '2048';
    var score = app.game ? (app.game.score || 0) : FP.store.bestOf(mode);
    var code = FP.store.encodeShare(mode, score);
    var url = location.origin + location.pathname + '#s=' + code;
    if (location.protocol === 'file:') url = location.href.split('#')[0] + '#s=' + code;
    var body = el('div', { class: 'share-box' }, [
      el('p', { text: FP.i18n.t('share.body') }),
      el('div', { class: 'share-score' }, [
        el('strong', { text: U.fmt(score) })
      ]),
      el('textarea', { class: 'share-url', readonly: true, text: url })
    ]);
    FP.ui.modal({
      title: FP.i18n.t('modal.share'),
      body: body,
      actions: [
        {
          label: FP.i18n.t('btn.copy'), kind: 'primary',
          keepOpen: true,
          onClick: function () {
            var ta = body.querySelector('textarea');
            var done = function () { FP.ui.toast(FP.i18n.t('toast.copied'), { kind: 'good' }); };
            if (global.navigator && navigator.share) {
              navigator.share({ title: FP.i18n.t('share.title'), text: FP.i18n.t('share.title') + ': ' + score, url: url })
                .catch(function () { /* 用户取消 */ });
            }
            try {
              ta.select();
              ta.setSelectionRange(0, 99999);
              if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(ta, done); });
              } else {
                fallbackCopy(ta, done);
              }
            } catch (e) { fallbackCopy(ta, done); }
          }
        },
        { label: FP.i18n.t('btn.close'), kind: 'soft' }
      ]
    });
  }

  function fallbackCopy(textarea, done) {
    try {
      textarea.select();
      var ok = global.document.execCommand && global.document.execCommand('copy');
      if (ok) done();
      else FP.ui.toast(FP.i18n.t('toast.copyFail'), { kind: 'warn' });
    } catch (e) {
      FP.ui.toast(FP.i18n.t('toast.copyFail'), { kind: 'warn' });
    }
  }

  /* ---------------- 事件绑定 ---------------- */

  function bindEvents() {
    dom.btnHome.addEventListener('click', function () {
      FP.audio.play('tap');
      if (app.game && dom.app.dataset.state === 'playing' && !app.game.over && app.game.score > 0) {
        FP.ui.modal({
          title: FP.i18n.t('btn.home'),
          body: '<p>' + U.escapeHtml(FP.i18n.t('toast.saved')) + '</p>',
          actions: [
            { label: FP.i18n.t('btn.close'), kind: 'soft' },
            { label: FP.i18n.t('btn.home'), kind: 'primary', onClick: function () { showHome(); } }
          ]
        });
        return;
      }
      showHome();
    });

    dom.btnSettings.addEventListener('click', function () { FP.audio.play('tap'); FP.ui.openSettings(afterSettingsChange); });
    dom.btnSettings2.addEventListener('click', function () { FP.audio.play('tap'); FP.ui.openSettings(afterSettingsChange); });
    dom.btnHowto.addEventListener('click', function () { FP.audio.play('tap'); FP.ui.openHowTo(app.activeMode); });
    dom.btnShare.addEventListener('click', function () { FP.audio.play('tap'); shareScore(); });

    dom.btnContinue.addEventListener('click', function () {
      FP.audio.unlock();
      var modes = ['2048', 'match3', 'memory'];
      var pick = null, at = 0;
      modes.forEach(function (m) {
        var s = FP.store.loadGame(m);
        if (s && s.at > at) { at = s.at; pick = m; }
      });
      start(pick || '2048', { fresh: false });
    });

    dom.btnPrimary.addEventListener('click', function () {
      FP.audio.unlock();
      if (app.game && app.game.primary) app.game.primary();
      else if (!app.game) start('2048', {});
    });

    dom.btnPause.addEventListener('click', function () {
      FP.audio.play('tap');
      if (dom.app.dataset.state === 'paused') resumeGame();
      else pauseGame();
    });

    dom.btnSound.addEventListener('click', function () {
      var on = !FP.store.settings().sound;
      FP.audio.setSound(on);
      dom.btnSound.setAttribute('aria-pressed', on ? 'true' : 'false');
      dom.icoSound.textContent = on ? '🔊' : '🔇';
    });

    dom.btnUndo.addEventListener('click', function () {
      FP.audio.play('tap');
      if (app.game && app.game.undo) app.game.undo();
    });
    dom.btnHint.addEventListener('click', function () {
      FP.audio.play('tap');
      if (app.game && app.game.hint) app.game.hint();
    });
    dom.btnShuffle.addEventListener('click', function () {
      FP.audio.play('tap');
      if (app.game && app.game.shuffle) app.game.shuffle();
    });
    dom.btnRestart.addEventListener('click', function () {
      FP.audio.play('tap');
      app.confirmRestart();
    });

    // 虚拟方向键
    FP.input.bindDPad(dom.touchpad, function (dir) {
      app.lastInput = 'pointer';
      if (app.game && app.game.move) app.game.move(dir);
    });

    // 键盘
    FP.input.onKey(function (e, dir) {
      app.lastInput = 'key';
      var key = e.key;
      if (key === 'p' || key === 'P') {
        if (dom.app.dataset.state === 'paused') resumeGame(); else pauseGame();
        return true;
      }
      if (key === 'Escape') {
        if (FP.ui.isModalOpen()) { FP.ui.closeModal(); return true; }
        if (dom.app.dataset.screen === 'game') { pauseGame(); return true; }
        return false;
      }
      if (key === 'u' || key === 'U') {
        if (app.game && app.game.undo) { app.game.undo(); return true; }
      }
      if (key === 'h' || key === 'H') {
        if (app.game && app.game.hint) { app.game.hint(); return true; }
      }
      if (key === '1' || key === '2' || key === '3') {
        var map = { '1': '2048', '2': 'match3', '3': 'memory' };
        start(map[key], {});
        return true;
      }
      if (app.game && app.game.onKey && dom.app.dataset.state !== 'paused') {
        return app.game.onKey(e, dir) === true;
      }
      return false;
    });

    // 触摸立即解锁音频
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (evt) {
      global.addEventListener(evt, function once() {
        FP.audio.unlock();
        FP.audio.applySettings();
        global.removeEventListener(evt, once);
      }, { passive: true });
    });

    // 尺寸变化
    global.addEventListener('resize', scheduleResize);
    global.addEventListener('load', function () {
      // 样式表 / 字体加载完成后，用真实布局再校准一次
      global.setTimeout(function () { resizeCanvas(); }, 0);
    });
    global.addEventListener('orientationchange', function () {
      global.setTimeout(scheduleResize, 240);
    });
    if (global.ResizeObserver) {
      try {
        var ro = new ResizeObserver(scheduleResize);
        ro.observe(dom.holder);
      } catch (e) { /* noop */ }
    }

    // 切到后台自动暂停
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.hidden) {
        if (app.game && dom.app.dataset.state === 'playing') pauseGame(true);
      } else if (app.game && dom.app.dataset.state === 'paused' && !FP.ui.isModalOpen()) {
        resumeApp();
      }
    });

    // 离开页面时保存
    global.addEventListener('pagehide', saveNow);
    global.addEventListener('beforeunload', saveNow);

    // 网络状态提示（离线可玩）
    global.addEventListener('offline', function () { FP.ui.toast(FP.i18n.t('toast.offline'), { kind: 'warn' }); });
    global.addEventListener('online', function () { FP.ui.toast(FP.i18n.t('toast.online'), { kind: 'good' }); });

    // 以 http(s) 打开时注册离线缓存（file:// 下浏览器不支持，直接跳过）
    if ('serviceWorker' in global.navigator && /^https?:$/.test(location.protocol)) {
      global.addEventListener('load', function () {
        global.navigator.serviceWorker.register('sw.js').catch(function () { /* 忽略 */ });
      });
    }
  }

  function resumeApp() {
    dom.app.dataset.state = 'playing';
    if (app.game && app.game.resume) app.game.resume();
  }

  function saveNow() {
    if (app.game && app.game.save) {
      try { app.game.save(); } catch (e) { U.logErr('saveNow', e); }
    }
  }

  function afterSettingsChange(kind) {
    if (kind === 'lang' || kind === 'reset' || kind === 'theme') {
      refreshStaticText();
      if (dom.app.dataset.screen === 'home') renderHome();
      FP.ui.applyDom(dom.app);
    }
    if (kind === 'reset') {
      showHome();
    }
  }

  function refreshStaticText() {
    FP.modes.forEach(function (m) {
      m.name = FP.i18n.t('mode.' + m.key + '.name');
      m.desc = FP.i18n.t('mode.' + m.key + '.desc');
    });
    if (app.game) {
      dom.title.textContent = app.game.name = FP.i18n.t('mode.' + app.activeMode + '.name');
    } else {
      dom.title.textContent = FP.i18n.t('app.name');
      dom.subtitle.textContent = FP.i18n.t('app.tagline');
    }
    dom.btnUndo.querySelector('span').textContent = FP.i18n.t('btn.undo');
    dom.btnHint.querySelector('span').textContent = FP.i18n.t('btn.hint');
    dom.btnShuffle.querySelector('span').textContent = FP.i18n.t('btn.shuffle');
    dom.btnRestart.querySelector('span').textContent = FP.i18n.t('btn.restart');
    dom.btnHome.querySelector('span').textContent = FP.i18n.t('nav.home');
  }

  /* ---------------- 深链：分享 / 指定模式 ---------------- */

  function handleHash() {
    var hash = (location.hash || '').replace(/^#/, '');
    if (!hash) return false;
    var params = {};
    hash.split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) params[kv[0]] = kv[1];
    });
    if (params.s) {
      var decoded = FP.store.decodeShare(params.s);
      if (decoded) {
        var modeName = (FP.modes.filter(function (m) { return m.id === decoded.m; })[0] || {}).name || decoded.m;
        FP.ui.modal({
          title: FP.i18n.t('modal.share'),
          body: el('div', { class: 'result' }, [
            el('div', { class: 'result-score' }, [
              el('span', { class: 'result-score-value', text: U.fmt(decoded.s) }),
              el('span', { class: 'result-score-label', text: modeName })
            ]),
            el('div', { class: 'result-rows' }, [
              scoreRow(FP.i18n.t('score.best'), U.fmt(decoded.b)),
              scoreRow(FP.i18n.t('chip.score'), U.fmt(decoded.s))
            ])
          ]),
          actions: [
            { label: FP.i18n.t('btn.close'), kind: 'soft' },
            {
              label: FP.i18n.t('btn.start'), kind: 'primary',
              onClick: function () { start(decoded.m, {}); }
            }
          ]
        });
        return true;
      }
    }
    if (params.g && MODE_CTOR[params.g]) {
      start(params.g, {});
      return true;
    }
    return false;
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    cacheDom();
    FP.ui.init();
    FP.theme.apply();
    FP.i18n.init();
    refreshStaticText();
    dom.btnSound.setAttribute('aria-pressed', FP.store.settings().sound ? 'true' : 'false');
    dom.icoSound.textContent = FP.store.settings().sound ? '🔊' : '🔇';
    setupCanvas();
    bindEvents();
    renderHome();
    showHome();
    var deepLinked = handleHash();

    // 首次访问引导（用分享链接直接进游戏时不打扰）
    if (!deepLinked && !FP.store.get('stats.plays', 0)) {
      global.setTimeout(function () {
        FP.ui.openHowTo(null);
      }, 420);
    }

    global.addEventListener('hashchange', function () {
      if (location.hash.indexOf('#s=') === 0) handleHash();
    });

    // 调试入口：控制台可用 FP.debug
    global.FP.debug = {
      app: app,
      state: function () {
        return {
          mode: app.activeMode,
          screen: dom.app.dataset.screen,
          state: dom.app.dataset.state,
          score: app.game ? app.game.score : 0,
          grid: app.game && app.game.grid ? app.game.grid.map(function (row) {
            return row.map(function (t) {
              if (!t) return null;
              return t.value != null ? t.value : t.type;
            });
          }) : null
        };
      },
      move: function (dir) { if (app.game && app.game.move) app.game.move(dir); },
      start: function (m) { start(m, { fresh: true }); },
      save: function () { saveNow(); return FP.store.exportAll(); },
      // 坐标自检：逻辑尺寸与真实渲染尺寸必须一致，否则操作会和画面对不上
      probe: function () {
        var s = app.surface;
        var r = dom.board.getBoundingClientRect();
        return {
          mode: app.activeMode,
          logical: [s.cssW, s.cssH],
          rendered: [Math.round(r.width), Math.round(r.height)],
          dpr: s.dpr,
          viewport: [global.innerWidth, global.innerHeight],
          mismatch: Math.abs(r.width - s.cssW) > 1 || Math.abs(r.height - s.cssH) > 1
        };
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
