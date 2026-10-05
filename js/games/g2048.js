/*!
 * games/g2048.js — 果园 2048（滑动合并水果）
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});
  var U = FP.util;
  var G = FP.gfx;

  var SIZE = 4;
  var WIN = 2048;

  // 水果阶梯：2 → 2048（大果王）
  var FRUIT = [
    { v: 2, emoji: '🫐', color: '#7b5cc4', ink: '#ffffff' },
    { v: 4, emoji: '🍇', color: '#9b6ad6', ink: '#ffffff' },
    { v: 8, emoji: '🍒', color: '#f0546b', ink: '#ffffff' },
    { v: 16, emoji: '🍓', color: '#ef4b6b', ink: '#ffffff' },
    { v: 32, emoji: '🍑', color: '#f98e5a', ink: '#5b2a10' },
    { v: 64, emoji: '🍊', color: '#f9a03f', ink: '#5b2a10' },
    { v: 128, emoji: '🍋', color: '#f7d34d', ink: '#5b4a10' },
    { v: 256, emoji: '🍏', color: '#a8d94a', ink: '#2f4a10' },
    { v: 512, emoji: '🍐', color: '#bfe36a', ink: '#2f4a10' },
    { v: 1024, emoji: '🍍', color: '#f6c445', ink: '#5b3f10' },
    { v: 2048, emoji: '🍎', color: '#e63946', ink: '#ffffff' }
  ];

  function metaOf(v) {
    for (var i = FRUIT.length - 1; i >= 0; i--) {
      if (v >= FRUIT[i].v) return FRUIT[i];
    }
    return FRUIT[0];
  }

  function levelOf(v) {
    for (var i = 0; i < FRUIT.length; i++) if (FRUIT[i].v === v) return i;
    return 0;
  }

  var uid = 0;
  function nextId() { return ++uid; }

  function G2048(app) {
    this.app = app;
    this.id = '2048';
    this.name = FP.i18n.t('mode.2048.name');
    this.emoji = '🍎';
    this.aspect = 1;
    this.particles = G.createParticles(220);

    this.grid = [];
    this.tiles = [];
    this.score = 0;
    this.best = 0;
    this.moves = 0;
    this.won = false;
    this.winShown = false;
    this.continued = false;
    this.over = false;
    this.animating = false;
    this.mergeQueue = [];
    this.spawnQueue = [];
    this.moveT = 1;
    this.shake = 0;
    this.bestTier = 0;
    this.cell = 0;
    this.gap = 0;
    this.pad = 0;
    this._prev = null;
  }

  /* ---------------- 生命周期 ---------------- */

  G2048.prototype.mount = function (ctx) {
    this.ctx2d = ctx.ctx;
    this.surface = ctx.surface;
    this.fx = ctx.fx;
    this.setupInput(ctx.inputTarget);
    this.best = FP.store.bestOf(this.id);

    var saved = FP.store.loadGame(this.id);
    if (saved && !ctx.fresh && saved.state && saved.state.grid) {
      this.restore(saved.state);
      this.app.toast(FP.i18n.t('toast.loaded'));
    } else {
      this.newGame(true);
    }
    this.syncHud();
  };

  G2048.prototype.newGame = function (freshBest) {
    this.grid = [[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]];
    this.tiles = [];
    this.score = 0;
    this.moves = 0;
    this.won = false;
    this.winShown = false;
    this.continued = false;
    this.over = false;
    this.animating = false;
    this.moveT = 1;
    this.mergeQueue = [];
    this.spawnQueue = [];
    this._prev = null;
    this.shake = 0;
    this.bestTier = 0;
    this.particles.clear();
    if (this.fx) this.fx.clear();
    if (freshBest) this.best = FP.store.bestOf(this.id);
    this.spawnTile();
    this.spawnTile();
    this.tiles.forEach(function (t) { t.scale = 1; t.appear = 1; });
    this.syncHud();
  };

  G2048.prototype.snapshot = function () {
    this.flushNow();
    return {
      grid: this.grid.map(function (row) {
        return row.map(function (t) { return t ? { v: t.value, id: t.id } : null; });
      }),
      score: this.score,
      moves: this.moves,
      won: this.won,
      continued: this.continued,
      over: this.over
    };
  };

  G2048.prototype.restore = function (s) {
    if (!s || !s.grid) { this.newGame(true); return; }
    this.score = s.score || 0;
    this.moves = s.moves || 0;
    this.won = !!s.won;
    this.winShown = this.won;
    this.continued = !!s.continued;
    this.over = !!s.over;
    this.animating = false;
    this.moveT = 1;
    this.mergeQueue = [];
    this.spawnQueue = [];
    this.tiles = [];
    this.grid = [[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]];
    var self = this;
    s.grid.forEach(function (row, r) {
      row.forEach(function (cell, c) {
        if (!cell || !cell.v) return;
        var t = {
          id: nextId(), value: cell.v, r: r, c: c,
          fromR: r, fromC: c, toR: r, toC: c,
          scale: 1, appear: 1, moving: false, merged: false, isNew: false
        };
        self.grid[r][c] = t;
        self.tiles.push(t);
      });
    });
    this.bestTier = levelOf(this.maxValue());
    this.syncHud();
  };

  G2048.prototype.pause = function () {
    if (this.animating) this.flushNow();
  };

  G2048.prototype.resume = function () { /* 无定时器，无需处理 */ };

  G2048.prototype.unmount = function () {
    this.flushNow();
    this.save();
    if (this.input) { this.input.detach(); this.input = null; }
  };

  /* ---------------- 几何 ---------------- */

  G2048.prototype.computeGeometry = function () {
    var w = this.surface.cssW;
    this.pad = Math.max(6, w * 0.03);
    this.gap = Math.max(5, w * 0.026);
    this.cell = (w - this.pad * 2 - this.gap * (SIZE - 1)) / SIZE;
  };

  G2048.prototype.cellRect = function (r, c) {
    return {
      x: this.pad + c * (this.cell + this.gap),
      y: this.pad + r * (this.cell + this.gap),
      w: this.cell,
      h: this.cell
    };
  };

  G2048.prototype.tileCenter = function (r, c) {
    var rect = this.cellRect(r, c);
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  };

  /* ---------------- 生成与判定 ---------------- */

  G2048.prototype.emptyCells = function () {
    var out = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) if (!this.grid[r][c]) out.push({ r: r, c: c });
    }
    return out;
  };

  G2048.prototype.spawnTile = function (value) {
    var empties = this.emptyCells();
    if (!empties.length) return null;
    var pick = empties[Math.floor(Math.random() * empties.length)];
    var v = value || (Math.random() < 0.9 ? 2 : 4);
    var tile = {
      id: nextId(), value: v, r: pick.r, c: pick.c,
      fromR: pick.r, fromC: pick.c, toR: pick.r, toC: pick.c,
      scale: 1, appear: this.animating ? 0 : 1,
      moving: false, merged: false, isNew: true
    };
    this.grid[pick.r][pick.c] = tile;
    this.tiles.push(tile);
    if (this.animating) this.spawnQueue.push(tile);
    return tile;
  };

  G2048.prototype.hasMoves = function () {
    if (this.emptyCells().length) return true;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var t = this.grid[r][c];
        if (!t) return true;
        if (c + 1 < SIZE && this.grid[r][c + 1] && this.grid[r][c + 1].value === t.value) return true;
        if (r + 1 < SIZE && this.grid[r + 1][c] && this.grid[r + 1][c].value === t.value) return true;
      }
    }
    return false;
  };

  G2048.prototype.maxValue = function () {
    if (!this.tiles.length) return 0;
    return this.tiles.reduce(function (m, t) { return Math.max(m, t.value); }, 0);
  };

  /* ---------------- 输入 ---------------- */

  G2048.prototype.setupInput = function (target) {
    var self = this;
    this.input = FP.input.attach(target, {
      swipeImmediate: true,
      onSwipe: function (e) { self.move(e.dir); },
      onTap: function () { self.app.autoHint(); }
    });
  };

  G2048.prototype.onKey = function (e, dir) {
    if (dir) { this.move(dir); return true; }
    return false;
  };

  /* ---------------- 核心移动 ---------------- */

  G2048.prototype.move = function (dir) {
    if (this.over || this.animating) return false;
    this.flushNow();
    var self = this;
    this._prev = {
      grid: this.grid.map(function (row) {
        return row.map(function (t) { return t ? { v: t.value, id: t.id } : null; });
      }),
      score: this.score,
      moves: this.moves
    };
    if (!this.doSlide(dir)) {
      this._prev = null;
      return false;
    }
    this.animating = true;
    this.moveT = 0;
    this.moves++;
    this.app.audio.play('move');
    U.vibrate(8);
    this.spawnTile();
    this.syncHud();
    return true;
  };

  G2048.prototype.doSlide = function (dir) {
    var vector = {
      up: { dr: -1, dc: 0 },
      down: { dr: 1, dc: 0 },
      left: { dr: 0, dc: -1 },
      right: { dr: 0, dc: 1 }
    }[dir];
    if (!vector) return false;

    var self = this;
    var order = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) order.push({ r: r, c: c });
    }
    order.sort(function (a, b) {
      return (b.r * vector.dr + b.c * vector.dc) - (a.r * vector.dr + a.c * vector.dc);
    });

    var newGrid = [[null, null, null, null], [null, null, null, null], [null, null, null, null], [null, null, null, null]];
    var merges = [];
    var mergedTargets = {};
    var moved = false;
    var maxLevel = 0;

    order.forEach(function (pos) {
      var tile = self.grid[pos.r][pos.c];
      if (!tile) return;
      var nr = pos.r, nc = pos.c;
      while (true) {
        var tr = nr + vector.dr, tc = nc + vector.dc;
        if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
        var occupant = newGrid[tr][tc];
        if (!occupant) { nr = tr; nc = tc; continue; }
        if (occupant.value === tile.value && !mergedTargets[occupant.id]) { nr = tr; nc = tc; }
        break;
      }
      var target = newGrid[nr][nc];
      tile.fromR = pos.r; tile.fromC = pos.c;
      if (target && target.value === tile.value && !mergedTargets[target.id]) {
        mergedTargets[target.id] = true;
        tile.toR = nr; tile.toC = nc; tile.moving = true; tile.merging = true;
        merges.push({ from: tile, into: target });
        moved = true;
        maxLevel = Math.max(maxLevel, levelOf(target.value * 2));
      } else {
        newGrid[nr][nc] = tile;
        tile.toR = nr; tile.toC = nc;
        if (nr !== pos.r || nc !== pos.c) { tile.moving = true; moved = true; }
      }
    });

    if (!moved) return false;

    this.grid = newGrid;
    this.mergeQueue = merges;
    this.maxMergeLevel = maxLevel;
    return true;
  };

  // 动画结束：落位、结算合并、生成新水果、判定胜负
  G2048.prototype.commitMove = function () {
    var self = this;
    var gained = 0;
    this.tiles.forEach(function (t) {
      if (t.moving && !t.merging) {
        t.r = t.toR; t.c = t.toC;
        t.moving = false;
        var c = self.tileCenter(t.r, t.c);
        self.particles.burst(c.x, c.y, {
          count: 2, speed: 30, ttl: 0.3, size: 2.2, gravity: 30,
          color: G.hexToRgba(metaOf(t.value).color, 0.45)
        });
      }
    });
    this.mergeQueue.forEach(function (m) {
      var tile = m.into;
      tile.value *= 2;
      tile.merged = true;
      tile.moving = false;
      tile.merging = false;
      tile.fromR = tile.toR;
      tile.fromC = tile.toC;
      gained += tile.value;
      var center = self.tileCenter(tile.toR, tile.toC);
      var meta = metaOf(tile.value);
      self.particles.burst(center.x, center.y, {
        count: 13, speed: 170, ttl: 0.65, size: 4, gravity: 400,
        color: [meta.color, '#ffffff', G.shade(meta.color, 0.2)]
      });
      self.removeTile(m.from);
    });
    this.mergeQueue = [];
    this.spawnQueue = [];
    this.animating = false;
    this.moveT = 1;
    if (gained) {
      this.score += gained;
      this.app.audio.play('merge', this.maxMergeLevel || 0);
      U.vibrate(14);
      if (gained >= 64) this.shake = 1;
      var top = this.bestTier || 0;
      if ((this.maxMergeLevel || 0) > top) {
        this.bestTier = this.maxMergeLevel;
        if (top > 0) {
          var m = FRUIT[this.maxMergeLevel] || metaOf(this.score);
          this.app.toast(FP.i18n.t('toast.newFruit') + ' ' + m.emoji + ' · ' + U.fmt(m.v), { kind: 'good', duration: 1200 });
        }
      }
    }
    this.syncHud();
    this.evaluate();
    this.save();
  };

  G2048.prototype.flushNow = function () {
    if (!this.animating) return;
    var self = this;
    this.tiles.forEach(function (t) {
      if (t.moving) { t.r = t.toR; t.c = t.toC; t.moving = false; }
      t.appear = 1;
      t.scale = 1;
    });
    this.mergeQueue.forEach(function (m) {
      var tile = m.into;
      tile.value *= 2;
      tile.merged = true;
      tile.merging = false;
      tile.fromR = tile.toR;
      tile.fromC = tile.toC;
      self.removeTile(m.from);
    });
    this.mergeQueue = [];
    this.spawnQueue = [];
    this.animating = false;
    this.moveT = 1;
  };

  G2048.prototype.removeTile = function (tile) {
    var i = this.tiles.indexOf(tile);
    if (i >= 0) this.tiles.splice(i, 1);
  };

  /* ---------------- 胜负 ---------------- */

  G2048.prototype.evaluate = function () {
    if (this.over) return;
    var reached = this.maxValue() >= WIN;
    if (reached && !this.won) {
      this.won = true;
      if (!this.continued) {
        this.winShown = true;
        this.save();
        this.app.audio.play('win');
        var self = this;
        this.app.onWin({
          score: this.score,
          moves: this.moves,
          primaryLabel: FP.i18n.t('btn.resume'),
          onPrimary: function () { self.continued = true; self.over = false; }
        });
        return;
      }
    }
    if (!this.hasMoves()) {
      this.over = true;
      this.save();
      this.app.audio.play('over');
      this.app.onGameOver({ score: this.score, moves: this.moves, reason: this.won ? 'win' : 'full' });
      return;
    }
    this.save();
  };

  G2048.prototype.syncHud = function () {
    this.best = Math.max(this.best, this.score);
    this.app.setChips([
      { label: FP.i18n.t('chip.score'), value: this.score, hot: this.score > 0 },
      { label: FP.i18n.t('chip.best'), value: FP.store.bestOf(this.id), muted: true },
      { label: FP.i18n.t('chip.moves'), value: this.moves, muted: true }
    ]);
  };

  G2048.prototype.save = function () {
    FP.store.saveGame(this.id, this.snapshot());
  };

  /* ---------------- 辅助操作 ---------------- */

  G2048.prototype.undo = function () {
    if (this.animating) return true;
    if (!this._prev) {
      this.app.audio.play('warn');
      this.app.toast(FP.i18n.t('toast.noUndo'));
      return true;
    }
    var prev = this._prev;
    this._prev = null;
    this.restore({
      grid: prev.grid,
      score: prev.score,
      moves: prev.moves,
      won: this.won,
      continued: this.continued
    });
    this.over = false;
    this.app.audio.play('tap');
    this.save();
    return true;
  };

  G2048.prototype.hint = function () {
    if (this.animating) { this.flushNow(); }
    var dirs = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < dirs.length; i++) {
      if (this.canMoveDir(dirs[i])) {
        this.app.flashHint(dirs[i]);
        return true;
      }
    }
    this.app.audio.play('warn');
    this.app.toast(FP.i18n.t('toast.needMove'));
    return false;
  };

  // 静态推演：判断某个方向是否会发生位移（用于提示，不改动棋盘）
  G2048.prototype.canMoveDir = function (dir) {
    var vector = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    var grid = this.grid.map(function (row) {
      return row.map(function (t) { return t ? t.value : 0; });
    });
    var merged = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    var out = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    var order = [];
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) order.push([r, c]);
    order.sort(function (a, b) {
      return (b[0] * vector[0] + b[1] * vector[1]) - (a[0] * vector[0] + a[1] * vector[1]);
    });
    order.forEach(function (pos) {
      var r = pos[0], c = pos[1];
      var v = grid[r][c];
      if (!v) return;
      var nr = r, nc = c;
      while (true) {
        var tr = nr + vector[0], tc = nc + vector[1];
        if (tr < 0 || tr >= SIZE || tc < 0 || tc >= SIZE) break;
        if (!out[tr][tc]) { nr = tr; nc = tc; continue; }
        if (out[tr][tc] === v && !merged[tr][tc]) { nr = tr; nc = tc; }
        break;
      }
      if (out[nr][nc] === v && !merged[nr][nc]) {
        out[nr][nc] = v * 2;
        merged[nr][nc] = 1;
      } else {
        out[nr][nc] = v;
      }
    });
    for (var r2 = 0; r2 < SIZE; r2++) {
      for (var c2 = 0; c2 < SIZE; c2++) {
        if (out[r2][c2] !== grid[r2][c2]) return true;
      }
    }
    return false;
  };

  G2048.prototype.shuffle = function () { return false; };

  /* ---------------- 帧更新 ---------------- */

  G2048.prototype.update = function (dt) {
    var speed = this.app.speedScale();
    this.computeGeometry();

    if (this.animating) {
      this.moveT = (this.moveT || 0) + dt / (0.115 * speed);
      if (this.moveT >= 1) this.commitMove();
    }
    var self = this;
    this.tiles.forEach(function (t) {
      if (t.appear < 1) t.appear = Math.min(1, t.appear + dt / (0.15 * speed));
    });
    this.particles.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3.2);
  };

  /* ---------------- 绘制 ---------------- */

  G2048.prototype.draw = function () {
    var ctx = this.ctx2d;
    var w = this.surface.cssW;
    var h = this.surface.cssH;
    var theme = FP.theme.tokens();

    ctx.save();
    if (this.shake > 0) {
      var s = this.shake * this.shake * 7;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    G.roundRect(ctx, 0.5, 0.5, w - 1, h - 1, w * 0.045);
    ctx.fillStyle = theme.boardBg;
    ctx.fill();
    ctx.strokeStyle = theme.boardStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var rect = this.cellRect(r, c);
        G.roundRect(ctx, rect.x, rect.y, rect.w, rect.h, this.cell * 0.2);
        ctx.fillStyle = theme.cellBg;
        ctx.fill();
      }
    }

    var self = this;
    this.tiles.slice().sort(function (a, b) { return a.value - b.value; })
      .forEach(function (t) { self.drawTile(ctx, t); });

    this.particles.draw(ctx);
    ctx.restore();
  };

  G2048.prototype.drawTile = function (ctx, t) {
    var fromRect = this.cellRect(t.fromR, t.fromC);
    var toRect = this.cellRect(t.toR, t.toC);
    var k = this.animating ? U.Ease.outQuint(U.clamp(this.moveT, 0, 1)) : 1;
    var x = U.lerp(fromRect.x, toRect.x, k);
    var y = U.lerp(fromRect.y, toRect.y, k);
    var size = this.cell;
    var scale = t.scale * (t.appear < 1 ? U.Ease.outBack(t.appear) : 1);
    var meta = metaOf(t.value);

    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(scale, scale);

    G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.2);
    var grad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
    grad.addColorStop(0, G.shade(meta.color, 0.13));
    grad.addColorStop(1, G.shade(meta.color, -0.1));
    G.shadow(ctx, 'rgba(20,10,0,.22)', size * 0.16, 0, size * 0.05);
    ctx.fillStyle = grad;
    ctx.fill();
    G.noShadow(ctx);

    ctx.beginPath();
    ctx.ellipse(0, -size * 0.28, size * 0.29, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.24)';
    ctx.fill();

    G.emoji(ctx, meta.emoji, 0, -size * 0.05, size * 0.55);
    G.label(ctx, String(t.value), 0, size * 0.33, {
      size: size * (t.value >= 1024 ? 0.17 : 0.2),
      fill: meta.ink,
      weight: 800,
      alpha: 0.9
    });
    ctx.restore();
  };

  G2048.FRUIT = FRUIT;
  G2048.WIN = WIN;
  FP.G2048 = G2048;
  FP.fruitMeta = metaOf;
})(window);
