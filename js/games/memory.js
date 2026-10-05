/*!
 * games/memory.js — 记忆果园（翻牌配对）
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});
  var U = FP.util;
  var G = FP.gfx;

  // 只用各平台都自带的老 Emoji（Emoji 仅用于挑选形状，不参与绘制）。
  // 配色刻意拉开：草莓(亮粉) / 樱桃(深红) / 桃子(橙红) / 橙子(橙黄) / 柠檬(柠檬黄) / 香蕉(亮黄) / 西瓜(深绿)，
  // 再配 canvas.js 里的专属角标，确保小屏上一眼可分辨。
  var FACES = [
    { emoji: '🍎', color: '#e63946' },
    { emoji: '🍊', color: '#ef8a2b' },
    { emoji: '🍋', color: '#efc431' },
    { emoji: '🍇', color: '#9b6ad6' },
    { emoji: '🍓', color: '#e8324f' },
    { emoji: '🍑', color: '#ee7a48' },
    { emoji: '🍐', color: '#bfe36a' },
    { emoji: '🥝', color: '#8dc63f' },
    { emoji: '🍒', color: '#c0203c' },
    { emoji: '🍉', color: '#2f9e5c' },
    { emoji: '🍌', color: '#f0dc44' },
    { emoji: '🍍', color: '#f4a63a' }
  ];

  var LAYOUTS = {
    easy: { rows: 4, cols: 4, pairs: 8, label: '4×4' },
    normal: { rows: 4, cols: 6, pairs: 12, label: '4×6' },
    hard: { rows: 6, cols: 6, pairs: 18, label: '6×6' }
  };

  var PREVIEW_TIME = 1.4;
  var FLIP_TIME = 0.22;
  var MISS_HOLD = 0.95;
  var uid = 0;

  function Memory(app) {
    this.app = app;
    this.id = 'memory';
    this.name = FP.i18n.t('mode.memory.name');
    this.emoji = '🧠';
    this.aspect = 1.4;
    this.particles = G.createParticles(160);

    this.cards = [];
    this.rows = 4;
    this.cols = 6;
    this.pairs = 12;
    this.score = 0;
    this.best = 0;
    this.moves = 0;
    this.matches = 0;
    this.elapsed = 0;
    this.flips = 0;
    this.state = 'preview'; // preview | idle | resolve | over
    this.first = null;
    this.second = null;
    this.timer = 0;
    this.over = false;
    this.cell = 40;
    this.gap = 6;
    this.originX = 0;
    this.originY = 0;
  }

  Memory.prototype.mount = function (ctx) {
    this.ctx2d = ctx.ctx;
    this.surface = ctx.surface;
    this.fx = ctx.fx;
    this.setupInput(ctx.inputTarget);
    this.best = FP.store.bestOf(this.id);

    var saved = FP.store.loadGame(this.id);
    if (saved && !ctx.fresh && saved.state && saved.state.cards && saved.state.cards.length) {
      this.restore(saved.state);
      this.app.toast(FP.i18n.t('toast.loaded'));
    } else {
      this.newGame(true);
    }
    this.syncHud();
  };

  Memory.prototype.newGame = function (freshBest) {
    if (freshBest) this.best = FP.store.bestOf(this.id);
    var diff = this.app.difficulty || 'normal';
    var layout = LAYOUTS[diff] || LAYOUTS.normal;
    this.rows = layout.rows;
    this.cols = layout.cols;
    this.pairs = layout.pairs;
    this.aspect = this.cols / this.rows;

    var faces = FACES.slice(0, Math.min(this.pairs, FACES.length));
    while (faces.length < this.pairs) faces = faces.concat(FACES.slice(0, this.pairs - faces.length));
    var deck = [];
    faces.forEach(function (f, i) {
      // 不用对象展开语法，兼容较老的浏览器内核
      deck.push({ face: i, emoji: f.emoji, color: f.color });
      deck.push({ face: i, emoji: f.emoji, color: f.color });
    });
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }

    this.cards = [];
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        var meta = deck[r * this.cols + c] || { face: 0, emoji: '🍎', color: '#e63946' };
        this.cards.push({
          id: ++uid,
          r: r, c: c,
          face: meta.face,
          emoji: meta.emoji,
          color: meta.color,
          up: false, matched: false,
          flip: 0, miss: 0, pulse: 0, spawn: 0
        });
      }
    }
    this.score = 0;
    this.moves = 0;
    this.matches = 0;
    this.elapsed = 0;
    this.flips = 0;
    this.first = null;
    this.second = null;
    this.timer = 0;
    this.over = false;
    this.state = 'preview';
    this.previewLeft = PREVIEW_TIME;
    this.particles.clear();
    if (this.fx) this.fx.clear();
    this.cards.forEach(function (card) { card.up = true; card.spawn = 0; });
    this.syncHud();
  };

  Memory.prototype.snapshot = function () {
    return {
      rows: this.rows,
      cols: this.cols,
      cards: this.cards.map(function (c) {
        return { r: c.r, c: c.c, face: c.face, emoji: c.emoji, color: c.color, matched: c.matched };
      }),
      score: this.score,
      moves: this.moves,
      matches: this.matches,
      elapsed: this.elapsed,
      flips: this.flips,
      over: this.over
    };
  };

  Memory.prototype.restore = function (s) {
    this.rows = s.rows || 4;
    this.cols = s.cols || 6;
    this.pairs = s.cards.length / 2;
    this.aspect = this.cols / this.rows;
    this.cards = s.cards.map(function (c) {
      return {
        id: ++uid, r: c.r, c: c.c, face: c.face,
        emoji: c.emoji, color: c.color,
        up: false, matched: !!c.matched,
        flip: c.matched ? 1 : 0, miss: 0, pulse: 0, spawn: 1
      };
    });
    this.score = s.score || 0;
    this.moves = s.moves || 0;
    this.matches = s.matches || 0;
    this.elapsed = s.elapsed || 0;
    this.flips = s.flips || 0;
    this.over = !!s.over;
    this.state = this.over ? 'over' : 'idle';
    this.first = null;
    this.second = null;
    this.syncHud();
  };

  Memory.prototype.pause = function () {
    if (this.state === 'preview') this.state = 'idle';
    // 暂停时把手牌翻回去，恢复后不会出现"只翻一半"的悬空状态
    this.first = null;
    this.second = null;
    if (this.state === 'resolve') {
      this.state = 'idle';
      this.timer = 0;
      this.cards.forEach(function (c) { c.miss = 0; });
    }
    this.cards.forEach(function (c) { if (!c.matched) c.up = false; });
  };

  Memory.prototype.resume = function () { /* 计时在 update 中按状态推进 */ };

  Memory.prototype.unmount = function () {
    if (this.input) { this.input.detach(); this.input = null; }
    if (!this.over) this.save();
  };

  /* ---------------- 几何 ---------------- */

  Memory.prototype.computeGeometry = function () {
    var w = this.surface.cssW;
    var h = this.surface.cssH;
    var pad = Math.max(5, Math.min(w, h) * 0.03);
    this.pad = pad;
    var gapRatio = this.cols >= 6 ? 0.07 : 0.09;
    var cellW = (w - pad * 2) / this.cols;
    var cellH = (h - pad * 2) / this.rows;
    this.cell = Math.min(cellW, cellH);
    this.gap = this.cell * gapRatio;
    this.originX = (w - this.cell * this.cols) / 2;
    this.originY = (h - this.cell * this.rows) / 2;
  };

  Memory.prototype.cardRect = function (card) {
    var s = this.cell - this.gap;
    return {
      x: this.originX + card.c * this.cell + this.gap / 2,
      y: this.originY + card.r * this.cell + this.gap / 2,
      w: s,
      h: s
    };
  };

  Memory.prototype.cardCenter = function (card) {
    var r = this.cardRect(card);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };

  Memory.prototype.cardAt = function (x, y) {
    var c = Math.floor((x - this.originX) / this.cell);
    var r = Math.floor((y - this.originY) / this.cell);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
      // 容错：略微出界时吸附到最近一行/列
      var tol = this.cell * 0.5;
      if (x < this.originX - tol || y < this.originY - tol) return null;
      if (x > this.originX + this.cols * this.cell + tol || y > this.originY + this.rows * this.cell + tol) return null;
      c = U.clamp(c, 0, this.cols - 1);
      r = U.clamp(r, 0, this.rows - 1);
    }
    for (var i = 0; i < this.cards.length; i++) {
      if (this.cards[i].r === r && this.cards[i].c === c) return this.cards[i];
    }
    return null;
  };

  /* ---------------- 输入 ---------------- */

  Memory.prototype.setupInput = function (target) {
    var self = this;
    this.input = FP.input.attach(target, {
      dragThreshold: 14,
      onDown: function () { self.app.lastInput = 'pointer'; },
      onTap: function (p) {
        var q = self.app.toLocal(p.x, p.y);
        self.flipAt(q.x, q.y);
      }
    });
  };

  Memory.prototype.onKey = function (e, dir) {
    if (dir) { this.moveCursor(dir); return true; }
    if (e.key === 'Enter' || e.key === ' ') {
      if (this.cursor) {
        var center = this.cardCenter(this.cursor);
        this.flipAt(center.x, center.y);
      }
      return true;
    }
    return false;
  };

  Memory.prototype.moveCursor = function (dir) {
    if (!this.cursor) this.cursor = this.cards[0];
    var d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    if (!d) return;
    var r = U.clamp(this.cursor.r + d[0], 0, this.rows - 1);
    var c = U.clamp(this.cursor.c + d[1], 0, this.cols - 1);
    var card = this.cardAt(this.originX + (c + 0.5) * this.cell, this.originY + (r + 0.5) * this.cell);
    if (card) this.cursor = card;
  };

  Memory.prototype.flipAt = function (x, y) {
    if (this.over || this.state === 'resolve') return;
    // 观察期不吃点击：明确告诉玩家"先记住位置"，避免误以为点了没反应
    if (this.state === 'preview') {
      var now = U.now();
      if (!this._previewTipAt || now - this._previewTipAt > 1200) {
        this._previewTipAt = now;
        this.app.toast(FP.i18n.t('toast.memorize'), { duration: 1100 });
      }
      return;
    }
    var card = this.cardAt(x, y);
    if (!card) return;
    this.cursor = card;
    this.flipCard(card);
  };

  Memory.prototype.flipCard = function (card) {
    if (!card || card.matched || card.up) return;

    // 预览阶段（开局 1~2 秒）整盘都是亮着的：此时不吃点击。
    // 之前这里会把牌翻开却不记录成"第一张"，导致预览结束后状态错位，
    // 玩家会看到"点了两张一样的牌却没配上 / 牌自己翻回去"的怪现象。
    if (this.state === 'preview') return;
    if (this.state !== 'idle') return;

    card.up = true;
    card.flip = 0;
    card.pulse = 1;
    this.flips++;
    this.app.audio.play('flip');
    U.vibrate(5);

    if (!this.first) {
      this.first = card;
      return;
    }
    this.second = card;
    this.moves++;
    var a = this.first, b = this.second;
    this.first = null;
    this.second = null;

    // 记录本次翻牌对，便于自检时核对"看起来一样的牌为什么没配上"
    this.lastPair = {
      a: { cell: [a.r, a.c], face: a.face, emoji: a.emoji, color: a.color },
      b: { cell: [b.r, b.c], face: b.face, emoji: b.emoji, color: b.color },
      sameFace: a.face === b.face,
      sameEmoji: a.emoji === b.emoji,
      sameColor: a.color === b.color,
      shapeA: G.shapeName ? G.shapeName(a.color, a.emoji) : null,
      shapeB: G.shapeName ? G.shapeName(b.color, b.emoji) : null
    };
    this.lastResult = this.lastPair.sameFace ? 'matched' : 'miss';

    if (a.face === b.face) {
      a.matched = true;
      b.matched = true;
      this.matches++;
      var gain = 100 + Math.max(0, 40 - this.flips);
      this.score += gain;
      this.app.audio.play('pair', this.matches);
      U.vibrate(18);
      var self = this;
      [a, b].forEach(function (c) {
        var center = self.cardCenter(c);
        self.particles.burst(center.x, center.y, {
          count: 14, speed: 190, ttl: 0.7, size: Math.max(3, self.cell * 0.08),
          gravity: 420, color: [c.color, '#ffffff', G.shade(c.color, 0.25)]
        });
      });
      this.app.toast('+ ' + gain, { kind: 'good', duration: 800 });
      this.syncHud();
      if (this.matches >= this.pairs) this.finish();
      else this.save();
    } else {
      this.state = 'resolve';
      this.timer = MISS_HOLD;
      a.miss = 1;
      b.miss = 1;
      this.app.audio.play('error');
      this.syncHud();
    }
  };

  Memory.prototype.hint = function () {
    if (this.state !== 'idle' || this.over) return false;
    // 提示：短暂点亮一对未配对的水果
    var groups = {};
    var self = this;
    this.cards.forEach(function (c) {
      if (c.matched) return;
      groups[c.face] = groups[c.face] || [];
      groups[c.face].push(c);
    });
    var keys = Object.keys(groups).filter(function (k) { return groups[k].length >= 2; });
    if (!keys.length) return false;
    var pick = groups[keys[Math.floor(Math.random() * keys.length)]];
    pick.forEach(function (c) { c.pulse = 1; });
    this.hintUntil = U.now() + 900;
    this.hintCards = pick;
    this.app.audio.play('tap');
    return true;
  };

  Memory.prototype.undo = function () {
    this.app.audio.play('warn');
    this.app.toast(FP.i18n.t('toast.noUndo'));
    return true;
  };

  Memory.prototype.shuffle = function () {
    if (this.over) return false;
    // 重新排列未配对的卡片图案
    var free = this.cards.filter(function (c) { return !c.matched; });
    var data = free.map(function (c) { return { face: c.face, emoji: c.emoji, color: c.color }; });
    for (var i = data.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = data[i]; data[i] = data[j]; data[j] = t;
    }
    free.forEach(function (c, i) {
      c.face = data[i].face;
      c.emoji = data[i].emoji;
      c.color = data[i].color;
      c.up = false;
      c.flip = 0;
      c.pulse = 1;
    });
    this.first = null;
    this.second = null;
    this.state = 'idle';
    this.app.audio.play('tap');
    this.app.toast(FP.i18n.t('toast.shuffled'));
    this.save();
    return true;
  };

  /* ---------------- 结束 ---------------- */

  Memory.prototype.finish = function () {
    if (this.over) return;
    this.over = true;
    this.state = 'over';
    var timeBonus = Math.max(0, Math.round(400 - this.elapsed * 3));
    this.score += timeBonus;
    this.app.audio.play('win');
    for (var i = 0; i < 3; i++) {
      var cx = this.originX + Math.random() * this.cell * this.cols;
      var cy = this.originY + Math.random() * this.cell * this.rows;
      this.particles.burst(cx, cy, {
        count: 16, speed: 240, ttl: 0.9, size: 5, gravity: 320,
        color: ['#ef4b6b', '#f6c445', '#8dc63f', '#7b5cc4', '#ffffff']
      });
    }
    this.syncHud();
    this.save();
    this.app.onGameOver({
      score: this.score,
      moves: this.moves,
      reason: 'clear',
      title: FP.i18n.t('modal.win'),
      extra: [
        { label: FP.i18n.t('score.time'), value: U.fmtTime(this.elapsed) },
        { label: FP.i18n.t('hud.pairs'), value: this.matches + '/' + this.pairs },
        { label: FP.i18n.t('hud.streak'), value: String(this.flips) }
      ]
    });
  };

  Memory.prototype.syncHud = function () {
    this.best = Math.max(this.best, this.score);
    this.app.setChips([
      { label: FP.i18n.t('chip.score'), value: this.score, hot: this.score > 0 },
      { label: FP.i18n.t('chip.best'), value: FP.store.bestOf(this.id), muted: true },
      { label: FP.i18n.t('chip.time'), value: U.fmtTime(this.elapsed) }
    ]);
  };

  Memory.prototype.save = function () {
    FP.store.saveGame(this.id, this.snapshot());
  };

  // 自检：当前状态 / 第一张牌 / 以及"这盘每对同图案的牌都在哪两个格子"
  Memory.prototype.debugBoard = function () {
    var byFace = {};
    this.cards.forEach(function (c) {
      (byFace[c.face] = byFace[c.face] || []).push({
        cell: [c.r, c.c], up: !!c.up, matched: !!c.matched, emoji: c.emoji
      });
    });
    var faces = Object.keys(byFace).map(function (k) {
      return {
        face: Number(k),
        emoji: byFace[k][0].emoji,
        count: byFace[k].length,
        cells: byFace[k].map(function (x) { return x.cell; })
      };
    });
    var odd = faces.filter(function (f) { return f.count !== 2; });
    return {
      state: this.state,
      rows: this.rows, cols: this.cols, pairs: this.pairs,
      matches: this.matches, moves: this.moves, flips: this.flips,
      previewLeft: this.previewLeft,
      first: this.first ? [this.first.r, this.first.c, this.first.face] : null,
      lastResult: this.lastResult || null,
      lastPair: this.lastPair || null,
      facesWithWrongCount: odd,
      // 紧凑列出每对同图案的格子，方便对照画面
      facesCompact: faces.map(function (f) {
        return f.emoji + ' face' + f.face + ' x' + f.count + ' @ ' + f.cells.map(function (c) { return c.join('-'); }).join(' , ');
      }),
      faces: faces
    };
  };

  /* ---------------- 帧更新 ---------------- */

  Memory.prototype.update = function (dt) {
    var speed = this.app.speedScale();
    this.computeGeometry();
    var self = this;

    if (!this.over && this.state !== 'resolve' && this.state !== 'preview') this.elapsed += dt;

    if (this.state === 'preview') {
      this.previewLeft -= dt;
      if (this.previewLeft <= 0) {
        this.state = 'idle';
        this.cards.forEach(function (c) { if (!c.matched) c.up = false; });
      }
    }

    this.cards.forEach(function (c) {
      var target = c.up || c.matched ? 1 : 0;
      c.flip += (target - c.flip) * Math.min(1, dt * 13 / speed);
      if (Math.abs(target - c.flip) < 0.01) c.flip = target;
      if (c.pulse > 0) c.pulse = Math.max(0, c.pulse - dt * 1.7);
      if (c.miss > 0) c.miss = Math.max(0, c.miss - dt * 1.1);
      if (c.spawn < 1) c.spawn = Math.min(1, c.spawn + dt / (0.4 * speed));
    });

    if (this.hintCards && U.now() > this.hintUntil) {
      this.hintCards.forEach(function (c) { c.pulse = 0; });
      this.hintCards = null;
    }

    if (this.state === 'resolve') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.cards.forEach(function (c) {
          if (!c.matched) { c.up = false; c.miss = 0; }
        });
        this.state = 'idle';
        this.save();
      }
    }

    this.particles.update(dt);
    if (!this.over) this.syncHud();
  };

  /* ---------------- 绘制 ---------------- */

  Memory.prototype.draw = function () {
    var ctx = this.ctx2d;
    var theme = FP.theme.tokens();
    var self = this;

    for (var i = 0; i < this.cards.length; i++) {
      var c = this.cards[i];
      var rect = this.cardRect(c);
      var size = rect.w;
      var cx = rect.x + size / 2;
      var cy = rect.y + size / 2;

      // 翻牌：横向折叠
      var fold = Math.cos(U.clamp(c.flip, 0, 1) * Math.PI);
      var sx = Math.abs(fold);
      var showFace = c.flip > 0.5;
      sx = Math.max(0.06, sx);
      var scale = 1;
      if (c.spawn < 1) scale *= U.Ease.outBack(c.spawn);
      if (c.matched) scale *= 1 + 0.05 * Math.sin(U.now() / 260 + i);
      if (c.miss > 0) scale *= 1 - 0.06 * Math.sin(c.miss * Math.PI * 6);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sx * scale, scale);

      if (showFace) {
        // 正面
        G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.22);
        var grad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
        grad.addColorStop(0, G.shade(c.color, 0.22));
        grad.addColorStop(1, G.shade(c.color, -0.08));
        G.shadow(ctx, c.matched ? G.hexToRgba(c.color, 0.55) : 'rgba(20,10,0,.22)', size * (c.matched ? 0.34 : 0.16), 0, size * 0.05);
        ctx.fillStyle = grad;
        ctx.fill();
        G.noShadow(ctx);

        if (c.matched) {
          G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.22);
          ctx.strokeStyle = 'rgba(255,255,255,.85)';
          ctx.lineWidth = size * 0.06;
          ctx.stroke();
        }
        G.art(ctx, c.emoji, c.color, 0, 0, size * 0.58);
      } else {
        // 背面
        G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.22);
        var bg = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
        bg.addColorStop(0, theme.cardBackA);
        bg.addColorStop(1, theme.cardBackB);
        G.shadow(ctx, 'rgba(20,10,0,.24)', size * 0.16, 0, size * 0.05);
        ctx.fillStyle = bg;
        ctx.fill();
        G.noShadow(ctx);

        ctx.globalAlpha = 0.9;
        G.art(ctx, '🍃', '#8dc63f', 0, -size * 0.06, size * 0.42);
        ctx.globalAlpha = 1;
        G.roundRect(ctx, -size / 2 + size * 0.1, -size / 2 + size * 0.1, size * 0.8, size * 0.8, size * 0.16);
        ctx.strokeStyle = 'rgba(255,255,255,.16)';
        ctx.lineWidth = Math.max(1, size * 0.03);
        ctx.stroke();
      }

      if (c.pulse > 0) {
        G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.22);
        ctx.fillStyle = 'rgba(255,255,255,' + (c.pulse * 0.35) + ')';
        ctx.fill();
      }
      if (c.miss > 0) {
        G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.22);
        ctx.fillStyle = 'rgba(220,60,60,' + (c.miss * 0.35) + ')';
        ctx.fill();
      }

      if (this.cursor === c && this.app.lastInput === 'key') {
        G.roundRect(ctx, -size / 2 - size * 0.08, -size / 2 - size * 0.08, size * 1.16, size * 1.16, size * 0.26);
        ctx.strokeStyle = theme.cursor;
        ctx.lineWidth = Math.max(2, size * 0.06);
        ctx.stroke();
      }

      ctx.restore();
    }

    this.particles.draw(ctx);
  };

  Memory.LAYOUTS = LAYOUTS;
  Memory.FACES = FACES;
  FP.Memory = Memory;
})(window);
