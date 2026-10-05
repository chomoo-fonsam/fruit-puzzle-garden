/*!
 * games/match3.js — 水果消消乐（交换消除 + 连锁 + 60 秒限时）
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});
  var U = FP.util;
  var G = FP.gfx;

  var COLS = 8;
  var ROWS = 8;
  var RUN_TIME = 60;

  // 只用各平台都自带的老 Emoji；🫐(蓝莓) 属于 Emoji 11.0（2018），旧手机会画成空白。
  var KINDS = [
    { emoji: '🍓', color: '#ef4b6b' },
    { emoji: '🍋', color: '#f6c445' },
    { emoji: '🍇', color: '#7b5cc4' },
    { emoji: '🥝', color: '#8dc63f' },
    { emoji: '🍊', color: '#f9943f' },
    { emoji: '🍒', color: '#d94f6a' }
  ];

  var uid = 0;

  function Match3(app) {
    this.app = app;
    this.id = 'match3';
    this.name = FP.i18n.t('mode.match3.name');
    this.emoji = '🍓';
    this.aspect = COLS / ROWS;
    this.particles = G.createParticles(280);

    this.grid = [];
    this.score = 0;
    this.best = 0;
    this.moves = 0;
    this.timeLeft = RUN_TIME;
    this.combo = 0;
    this.chain = 0;
    this.state = 'idle';
    this.anim = null;
    this.selected = null;
    this.cursor = null;
    this.over = false;
    this.hintPair = null;
    this.hintUntil = 0;
    this.idleTime = 0;
    this.cell = 24;
    this.originX = 0;
    this.originY = 0;
    this.shake = 0;
    this.timeWarned = false;
    this.matchedTiles = null;
    this.pendingMatches = null;
    this.lastGain = 0;
  }
  /* ---------------- 生命周期 ---------------- */

  Match3.prototype.mount = function (ctx) {
    this.ctx2d = ctx.ctx;
    this.surface = ctx.surface;
    this.fx = ctx.fx;
    this.setupInput(ctx.inputTarget);
    this.best = FP.store.bestOf(this.id);
    this.computeGeometry();

    var saved = FP.store.loadGame(this.id);
    if (saved && !ctx.fresh && saved.state && saved.state.grid) {
      this.restore(saved.state);
      this.app.toast(FP.i18n.t('toast.loaded'));
    } else {
      this.newGame(true);
    }
    this.syncHud();
  };

  Match3.prototype.newGame = function (freshBest) {
    if (freshBest) this.best = FP.store.bestOf(this.id);
    this.score = 0;
    this.moves = 0;
    this.timeLeft = RUN_TIME;
    this.combo = 0;
    this.chain = 0;
    this.over = false;
    this.state = 'idle';
    this.anim = null;
    this.selected = null;
    this.cursor = null;
    this.hintPair = null;
    this.pendingMatches = null;
    this.matchedTiles = null;
    this.idleTime = 0;
    this.timeWarned = false;
    this.shake = 0;
    this.lastGain = 0;
    this.particles.clear();
    if (this.fx) this.fx.clear();
    this.buildBoard();
    this.syncHud();
  };

  Match3.prototype.makeTile = function (r, c, type) {
    return {
      id: ++uid, r: r, c: c, type: type,
      scale: 1, appear: 1, vy: 0, flash: 0,
      selected: false, clearing: false
    };
  };

  Match3.prototype.buildBoard = function () {
    var guardOuter = 0;
    do {
      this.grid = [];
      for (var r = 0; r < ROWS; r++) {
        var row = [];
        for (var c = 0; c < COLS; c++) {
          var type, guard = 0;
          do {
            type = Math.floor(Math.random() * KINDS.length);
            guard++;
          } while (guard < 40 && (
            (c >= 2 && row[c - 1].type === type && row[c - 2].type === type) ||
            (r >= 2 && this.grid[r - 1][c].type === type && this.grid[r - 2][c].type === type)
          ));
          row.push(this.makeTile(r, c, type));
        }
        this.grid.push(row);
      }
      guardOuter++;
    } while (guardOuter < 20 && !this.findMove());
  };

  Match3.prototype.snapshot = function () {
    return {
      grid: this.grid.map(function (row) {
        return row.map(function (t) { return t ? t.type : -1; });
      }),
      score: this.score,
      moves: this.moves,
      timeLeft: this.timeLeft,
      over: this.over
    };
  };

  Match3.prototype.restore = function (s) {
    this.grid = [];
    for (var r = 0; r < ROWS; r++) {
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var type = s.grid[r] && s.grid[r][c] != null ? s.grid[r][c] : 0;
        if (type < 0) type = Math.floor(Math.random() * KINDS.length);
        row.push(this.makeTile(r, c, type));
      }
      this.grid.push(row);
    }
    this.score = s.score || 0;
    this.moves = s.moves || 0;
    this.timeLeft = s.timeLeft == null ? RUN_TIME : Math.max(1, s.timeLeft);
    this.over = !!s.over;
    this.state = 'idle';
    this.anim = null;
    this.ensurePlayable();
    this.syncHud();
  };

  Match3.prototype.pause = function () { this.flushAll(); };
  Match3.prototype.resume = function () { this.timeLeft = Math.max(1, this.timeLeft); };

  Match3.prototype.unmount = function () {
    this.flushAll();
    if (this.input) { this.input.detach(); this.input = null; }
  };

  /* ---------------- 几何 ---------------- */

  Match3.prototype.computeGeometry = function () {
    var w = this.surface.cssW;
    var h = this.surface.cssH;
    var pad = Math.max(4, w * 0.02);
    this.pad = pad;
    this.cell = Math.min((w - pad * 2) / COLS, (h - pad * 2) / ROWS);
    this.originX = (w - this.cell * COLS) / 2;
    this.originY = (h - this.cell * ROWS) / 2;
  };

  Match3.prototype.offsetX = function (t) {
    if (this.state === 'swap' && this.anim) {
      var a = this.anim;
      if (t === a.a) return U.lerp(a.aDx, 0, this.progress());
      if (t === a.b) return U.lerp(a.bDx, 0, this.progress());
    }
    return 0;
  };

  Match3.prototype.offsetY = function (t) {
    if (this.state === 'swap' && this.anim) {
      var a = this.anim;
      if (t === a.a) return U.lerp(a.aDy, 0, this.progress());
      if (t === a.b) return U.lerp(a.bDy, 0, this.progress());
    }
    if (this.state === 'clear' && t.clearing) {
      return -this.cell * 0.1 * U.Ease.outCubic(this.progress());
    }
    if (this.state === 'fall') {
      if (t.fallFrom != null) return (t.fallFrom - t.r) * this.cell * (1 - U.Ease.outCubic(this.progress()));
      if (t.spawnFrom != null) return (t.spawnFrom - t.r) * this.cell * (1 - U.Ease.outCubic(this.progress()));
    }
    return 0;
  };

  Match3.prototype.progress = function () {
    var a = this.anim;
    if (!a) return 1;
    return U.clamp(a.t / a.dur, 0, 1);
  };

  Match3.prototype.tileRect = function (t, dx, dy) {
    var gap = this.cell * 0.06;
    return {
      x: this.originX + t.c * this.cell + gap / 2 + (dx || 0),
      y: this.originY + t.r * this.cell + gap / 2 + (dy || 0),
      w: this.cell - gap,
      h: this.cell - gap
    };
  };

  Match3.prototype.tileCenter = function (t) {
    var rect = this.tileRect(t, this.offsetX(t), this.offsetY(t));
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  };

  Match3.prototype.setState = function (state, dur) {
    this.state = state;
    this.anim = { t: 0, dur: Math.max(0.02, dur || 0.2) };
  };

  /* ---------------- 匹配 ---------------- */

  Match3.prototype.scanMatches = function () {
    var self = this;
    var marked = {};
    var groups = [];
    var r, c, run, i;

    for (r = 0; r < ROWS; r++) {
      run = [];
      for (c = 0; c < COLS; c++) {
        var t = this.grid[r][c];
        if (t && run.length && t.type === run[0].type) run.push(t);
        else {
          if (run.length >= 3) groups.push(run.slice());
          run = t ? [t] : [];
        }
      }
      if (run.length >= 3) groups.push(run.slice());
    }
    for (c = 0; c < COLS; c++) {
      run = [];
      for (r = 0; r < ROWS; r++) {
        var t2 = self.grid[r][c];
        if (t2 && run.length && t2.type === run[0].type) run.push(t2);
        else {
          if (run.length >= 3) groups.push(run.slice());
          run = t2 ? [t2] : [];
        }
      }
      if (run.length >= 3) groups.push(run.slice());
    }

    var count = 0;
    for (i = 0; i < groups.length; i++) {
      for (var j = 0; j < groups[i].length; j++) {
        var id = groups[i][j].id;
        if (!marked[id]) { marked[id] = true; count++; }
      }
    }
    return { groups: groups, marked: marked, count: count };
  };

  // 轻量判定：某个格子是否处于三连中（用于"是否还有可消除的交换"）
  Match3.prototype.createsMatch = function (r, c) {
    var grid = this.grid;
    var t = grid[r][c];
    if (!t) return false;
    var n = 1, cc = c - 1;
    while (cc >= 0 && grid[r][cc] && grid[r][cc].type === t.type) { n++; cc--; }
    cc = c + 1;
    while (cc < COLS && grid[r][cc] && grid[r][cc].type === t.type) { n++; cc++; }
    if (n >= 3) return true;
    n = 1;
    var rr = r - 1;
    while (rr >= 0 && grid[rr][c] && grid[rr][c].type === t.type) { n++; rr--; }
    rr = r + 1;
    while (rr < ROWS && grid[rr][c] && grid[rr][c].type === t.type) { n++; rr++; }
    return n >= 3;
  };

  Match3.prototype.findMove = function () {
    var dirs = [[0, 1], [1, 0]];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        for (var d = 0; d < dirs.length; d++) {
          var r2 = r + dirs[d][0], c2 = c + dirs[d][1];
          if (r2 >= ROWS || c2 >= COLS) continue;
          var a = this.grid[r][c], b = this.grid[r2][c2];
          if (!a || !b || a.type === b.type) continue;
          this.grid[r][c] = b; this.grid[r2][c2] = a;
          var hit = this.createsMatch(r, c) || this.createsMatch(r2, c2);
          this.grid[r][c] = a; this.grid[r2][c2] = b;
          if (hit) return { a: a, b: b };
        }
      }
    }
    return null;
  };

  /* ---------------- 输入 ---------------- */

  Match3.prototype.setupInput = function (target) {
    var self = this;
    this.input = FP.input.attach(target, {
      dragThreshold: 12,
      onDown: function () { self.app.lastInput = 'pointer'; },
      onTap: function (p) {
        var q = self.app.toLocal(p.x, p.y);
        self.handleTap(q.x, q.y);
      },
      onSwipe: function (e) {
        var q = self.app.toLocal(e.x0, e.y0);
        self.handleSwipe(q.x, q.y, e.dir);
      },
      onDragEnd: function (e) { self.handleDragEnd(e); }
    });
  };

  Match3.prototype.onKey = function (e, dir) {
    if (dir) { this.moveCursor(dir); return true; }
    if (e.key === 'Enter' || e.key === ' ') {
      if (this.cursor) {
        var t = this.grid[this.cursor.r] && this.grid[this.cursor.r][this.cursor.c];
        if (t) { var c = this.tileCenter(t); this.handleTap(c.x, c.y); }
      }
      return true;
    }
    return false;
  };

  Match3.prototype.moveCursor = function (dir) {
    if (!this.cursor) this.cursor = { r: 3, c: 3 };
    var d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    if (!d) return;
    var r = U.clamp(this.cursor.r + d[0], 0, ROWS - 1);
    var c = U.clamp(this.cursor.c + d[1], 0, COLS - 1);
    if (this.selected && this.state === 'idle') {
      var dist = Math.abs(this.selected.r - r) + Math.abs(this.selected.c - c);
      if (dist === 1) {
        var from = this.selected;
        this.cursor = { r: r, c: c };
        this.selected.selected = false;
        this.selected = null;
        this.trySwap(from, this.grid[r][c]);
        return;
      }
    }
    this.cursor = { r: r, c: c };
  };

  Match3.prototype.coordAt = function (x, y) {
    var c = Math.floor((x - this.originX) / this.cell);
    var r = Math.floor((y - this.originY) / this.cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
      // 容错：手指略微落到棋盘外时，就近吸附到边缘格子（最多外扩半格）
      var tol = this.cell * 0.5;
      if (x < this.originX - tol || y < this.originY - tol) return null;
      if (x > this.originX + COLS * this.cell + tol || y > this.originY + ROWS * this.cell + tol) return null;
      c = U.clamp(c, 0, COLS - 1);
      r = U.clamp(r, 0, ROWS - 1);
    }
    return { r: r, c: c };
  };

  Match3.prototype.select = function (tile) {
    if (this.selected && this.selected !== tile) this.selected.selected = false;
    this.selected = tile;
    if (tile) tile.selected = true;
  };

  Match3.prototype.handleTap = function (x, y) {
    if (this.over || this.state !== 'idle') return;
    var pos = this.coordAt(x, y);
    if (!pos) return;
    this.cursor = { r: pos.r, c: pos.c };
    var tile = this.grid[pos.r][pos.c];
    if (!tile) return;
    if (!this.selected) {
      this.select(tile);
      this.app.audio.play('tap');
      U.vibrate(6);
      return;
    }
    if (this.selected === tile) {
      this.select(null);
      return;
    }
    var dist = Math.abs(this.selected.r - tile.r) + Math.abs(this.selected.c - tile.c);
    var prev = this.selected;
    if (dist === 1) {
      this.select(null);
      this.trySwap(prev, tile);
    } else {
      this.select(tile);
      this.app.audio.play('tap');
    }
  };

  Match3.prototype.handleSwipe = function (x0, y0, dir) {
    if (this.over || this.state !== 'idle') return;
    var pos = this.coordAt(x0, y0);
    if (!pos) return;
    var d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    var r2 = pos.r + d[0], c2 = pos.c + d[1];
    if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS) return;
    var a = this.grid[pos.r][pos.c];
    var b = this.grid[r2][c2];
    this.select(null);
    this.cursor = { r: pos.r, c: pos.c };
    this.trySwap(a, b);
  };

  Match3.prototype.handleDragEnd = function (e) {
    if (this.over || this.state !== 'idle') return;
    // 拖动起点：用 client 坐标回推后再统一换算，保证与点击同一套坐标系
    var s = this.app.toLocal(e.x - e.dx, e.y - e.dy);
    var t = this.app.toLocal(e.x, e.y);
    var start = this.coordAt(s.x, s.y);
    var end = this.coordAt(t.x, t.y);
    if (!start || !end) return;
    if (Math.abs(start.r - end.r) + Math.abs(start.c - end.c) !== 1) return;
    this.select(null);
    this.trySwap(this.grid[start.r][start.c], this.grid[end.r][end.c]);
  };

  /* ---------------- 交换流程 ---------------- */

  Match3.prototype.trySwap = function (a, b) {
    if (!a || !b || this.state !== 'idle' || this.over) return false;
    if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return false;

    var ar = a.r, ac = a.c, br = b.r, bc = b.c;
    this.grid[ar][ac] = b;
    this.grid[br][bc] = a;
    a.r = br; a.c = bc;
    b.r = ar; b.c = ac;

    var res = this.scanMatches();
    this.moves++;
    this.idleTime = 0;

    var aDx = (ac - a.c) * this.cell;
    var aDy = (ar - a.r) * this.cell;
    var bDx = (bc - b.c) * this.cell;
    var bDy = (br - b.r) * this.cell;

    this.setState('swap', 0.15);
    this.anim.a = a;
    this.anim.b = b;
    this.anim.aDx = aDx; this.anim.aDy = aDy;
    this.anim.bDx = bDx; this.anim.bDy = bDy;
    this.anim.back = false;
    this.anim.valid = res.count > 0;
    this.hintPair = null;

    if (res.count > 0) {
      this.pendingMatches = res;
      this.app.audio.play('move');
      U.vibrate(8);
    } else {
      this.app.audio.play('warn');
      this.app.toast(FP.i18n.t('toast.swapInvalid'), { duration: 1100 });
    }
    this.syncHud();
    return true;
  };

  Match3.prototype.startSwapBack = function () {
    var a = this.anim.a, b = this.anim.b;
    this.setState('swap', 0.15);
    this.anim.a = a; this.anim.b = b;
    this.anim.aDx = (a.c - b.c) * this.cell;
    this.anim.aDy = (a.r - b.r) * this.cell;
    this.anim.bDx = (b.c - a.c) * this.cell;
    this.anim.bDy = (b.r - a.r) * this.cell;
    this.anim.back = true;
  };

  Match3.prototype.revertSwap = function () {
    var a = this.anim.a, b = this.anim.b;
    var ar = a.r, ac = a.c;
    this.grid[a.r][a.c] = b;
    this.grid[b.r][b.c] = a;
    a.r = b.r; a.c = b.c;
    b.r = ar; b.c = ac;
  };

  /* ---------------- 消除与下落 ---------------- */

  Match3.prototype.beginClear = function (res) {
    var self = this;
    this.matchedTiles = [];
    var total = 0;
    res.groups.forEach(function (group) {
      var bonus = group.length >= 5 ? 2 : group.length === 4 ? 1.5 : 1;
      group.forEach(function (t) {
        if (t.clearing) return;
        t.clearing = true;
        t.flash = 1;
        self.matchedTiles.push(t);
        total += 30 * bonus;
      });
    });
    this.chain++;
    this.combo = Math.max(this.combo, this.chain);
    var mult = 1 + (this.chain - 1) * 0.5;
    var gained = Math.round(total * mult);
    this.score += gained;
    this.lastGain = gained;

    this.matchedTiles.forEach(function (t) {
      var center = self.tileCenter(t);
      var kind = KINDS[t.type] || KINDS[0];
      self.particles.burst(center.x, center.y, {
        count: 9, speed: 140 + self.chain * 26, ttl: 0.58,
        size: Math.max(3, self.cell * 0.09), gravity: 470,
        color: [kind.color, '#ffffff', G.shade(kind.color, 0.25)]
      });
    });
    this.app.audio.play('pop', this.chain - 1);
    U.vibrate(12);
    if (this.chain >= 2) {
      this.app.toast('×' + this.chain + '  +' + gained, { kind: 'good', duration: 900 });
      this.shake = 0.85;
    }
    this.setState('clear', 0.19);
    this.syncHud();
  };

  Match3.prototype.applyGravity = function () {
    var moved = false;
    for (var c = 0; c < COLS; c++) {
      var write = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        var t = this.grid[r][c];
        if (!t || t.clearing) continue;
        if (write !== r) {
          this.grid[write][c] = t;
          this.grid[r][c] = null;
          t.fallFrom = r;
          t.r = write;
          moved = true;
        }
        write--;
      }
      var spawnIdx = 0;
      for (var r2 = write; r2 >= 0; r2--) {
        var tile = this.makeTile(r2, c, Math.floor(Math.random() * KINDS.length));
        tile.spawnFrom = -1 - spawnIdx;
        tile.appear = 0;
        spawnIdx++;
        this.grid[r2][c] = tile;
        moved = true;
      }
    }
    return moved;
  };

  Match3.prototype.settleFalls = function () {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var t = this.grid[r][c];
        if (!t) continue;
        t.fallFrom = null;
        t.spawnFrom = null;
        t.clearing = false;
        t.appear = 1;
        t.scale = 1;
      }
    }
  };

  Match3.prototype.shuffleBoard = function () {
    // 反复打乱直到没有现成三连（有重试上限，避免极端情况下死循环）
    for (var attempt = 0; attempt < 24; attempt++) {
      var tiles = [];
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) if (this.grid[r][c]) tiles.push(this.grid[r][c]);
      }
      for (var i = tiles.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = tiles[i]; tiles[i] = tiles[j]; tiles[j] = tmp;
      }
      var k = 0;
      for (var r2 = 0; r2 < ROWS; r2++) {
        for (var c2 = 0; c2 < COLS; c2++) {
          var t = tiles[k++];
          t.r = r2; t.c = c2;
          this.grid[r2][c2] = t;
        }
      }
      if (this.scanMatches().count === 0) return;
    }
  };

  Match3.prototype.ensurePlayable = function () {
    var guard = 0;
    while (!this.findMove() && guard < 24) {
      this.shuffleBoard();
      guard++;
    }
    if (guard >= 24) this.buildBoard();
  };

  Match3.prototype.shuffle = function () {
    if (this.state !== 'idle' || this.over) return false;
    this.shuffleBoard();
    this.ensurePlayable();
    this.settleFalls();
    this.app.audio.play('tap');
    this.app.toast(FP.i18n.t('toast.shuffled'));
    this.save();
    return true;
  };

  Match3.prototype.hint = function () {
    if (this.state !== 'idle' || this.over) return false;
    var mv = this.findMove();
    if (!mv) {
      this.shuffleBoard();
      this.ensurePlayable();
      mv = this.findMove();
      if (!mv) return false;
      this.app.toast(FP.i18n.t('toast.noHint'));
    }
    this.hintPair = [mv.a, mv.b];
    this.hintUntil = U.now() + 2000;
    this.app.audio.play('flip');
    return true;
  };

  Match3.prototype.undo = function () {
    this.app.audio.play('warn');
    this.app.toast(FP.i18n.t('toast.noUndo'));
    return true;
  };

  Match3.prototype.flushAll = function () {
    if (this.state === 'swap' && this.anim && this.anim.back) {
      this.revertSwap();
    } else if (this.state === 'swap' && this.anim && this.anim.valid && this.pendingMatches) {
      // 动画中途暂停：直接结算消除
      this.matchedTiles = [];
      var self = this;
      var res = this.pendingMatches;
      res.groups.forEach(function (g) {
        g.forEach(function (t) { if (!t.clearing) { t.clearing = true; self.matchedTiles.push(t); } });
      });
      this.pendingMatches = null;
      this.matchedTiles.forEach(function (t) {
        if (self.grid[t.r] && self.grid[t.r][t.c] === t) self.grid[t.r][t.c] = null;
      });
      this.matchedTiles = null;
      this.applyGravity();
    } else if (this.state === 'clear') {
      var self2 = this;
      if (this.matchedTiles) {
        this.matchedTiles.forEach(function (t) {
          if (self2.grid[t.r] && self2.grid[t.r][t.c] === t) self2.grid[t.r][t.c] = null;
        });
      }
      this.matchedTiles = null;
      this.applyGravity();
    } else if (this.state === 'fall') {
      // 保持当前网格，仅结束动画
    }
    this.anim = null;
    this.state = 'idle';
    this.pendingMatches = null;
    this.settleFalls();
    this.chain = 0;
    this.ensurePlayable();
  };

  /* ---------------- 帧更新 ---------------- */

  Match3.prototype.update = function (dt) {
    var speed = this.app.speedScale();
    this.computeGeometry();

    if (this.over) {
      this.particles.update(dt);
      return;
    }

    if (this.state === 'idle') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 5 && this.timeLeft > 4.5 && !this.timeWarned) {
        this.timeWarned = true;
        this.app.audio.play('tick');
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.finish();
        return;
      }
      this.idleTime += dt;
      if (this.idleTime > 6 && FP.store.settings().hintMoves) {
        var mv = this.findMove();
        if (mv) { this.hintPair = [mv.a, mv.b]; this.hintUntil = U.now() + 2400; }
        this.idleTime = 0;
      }
      if (this.hintPair && U.now() > this.hintUntil) this.hintPair = null;
    }

    if (this.state === 'swap') {
      var a = this.anim;
      a.t += dt / speed;
      if (a.t >= a.dur) {
        if (a.back) {
          this.revertSwap();
          this.anim = null;
          this.state = 'idle';
          this.ensurePlayable();
          this.save();
        } else if (a.valid) {
          var pending = this.pendingMatches;
          this.pendingMatches = null;
          this.beginClear(pending);
        } else {
          this.startSwapBack();
        }
      }
    } else if (this.state === 'clear') {
      this.anim.t += dt / speed;
      var p = this.progress();
      if (this.matchedTiles) {
        this.matchedTiles.forEach(function (t) { t.scale = 1 - U.Ease.outCubic(p); });
      }
      if (p >= 1) {
        var self = this;
        if (this.matchedTiles) {
          this.matchedTiles.forEach(function (t) {
            if (self.grid[t.r] && self.grid[t.r][t.c] === t) self.grid[t.r][t.c] = null;
          });
        }
        this.matchedTiles = null;
        this.applyGravity();
        this.setState('fall', 0.2 + this.cell * 0.0016);
      }
    } else if (this.state === 'fall') {
      this.anim.t += dt / speed;
      var p2 = this.progress();
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var t = this.grid[r][c];
          if (t && t.appear < 1) t.appear = Math.min(1, t.appear + dt / (0.1 * speed));
        }
      }
      if (p2 >= 1) {
        this.settleFalls();
        var res = this.scanMatches();
        if (res.count > 0) this.beginClear(res);
        else {
          this.chain = 0;
          this.anim = null;
          this.state = 'idle';
          this.ensurePlayable();
          this.save();
        }
      }
    }

    for (var r2 = 0; r2 < ROWS; r2++) {
      for (var c2 = 0; c2 < COLS; c2++) {
        var tt = this.grid[r2][c2];
        if (tt && tt.flash > 0) tt.flash = Math.max(0, tt.flash - dt * 2.6);
      }
    }

    this.particles.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);
  };

  Match3.prototype.finish = function () {
    if (this.over) return;
    this.over = true;
    this.state = 'over';
    this.selected = null;
    this.app.audio.play('over');
    this.save();
    this.app.onGameOver({
      score: this.score,
      moves: this.moves,
      reason: 'time',
      extra: [
        { label: FP.i18n.t('score.time'), value: U.fmtTime(RUN_TIME) },
        { label: FP.i18n.t('score.combo'), value: '×' + Math.max(1, this.combo) }
      ]
    });
    return true;
  };

  Match3.prototype.syncHud = function () {
    this.best = Math.max(this.best, this.score);
    this.app.setChips([
      { label: FP.i18n.t('chip.score'), value: this.score, hot: this.score > 0 },
      { label: FP.i18n.t('chip.best'), value: FP.store.bestOf(this.id), muted: true },
      { label: FP.i18n.t('chip.time'), value: U.fmtTime(this.timeLeft), hot: this.timeLeft <= 10 }
    ]);
  };

  Match3.prototype.save = function () {
    FP.store.saveGame(this.id, this.snapshot());
  };

  /* ---------------- 绘制 ---------------- */

  Match3.prototype.draw = function () {
    var ctx = this.ctx2d;
    var w = this.surface.cssW;
    var h = this.surface.cssH;
    var theme = FP.theme.tokens();

    ctx.save();
    if (this.shake > 0) {
      var s = this.shake * this.shake * 8;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    G.roundRect(ctx, 0.5, 0.5, w - 1, h - 1, w * 0.04);
    ctx.fillStyle = theme.boardBg;
    ctx.fill();
    ctx.strokeStyle = theme.boardStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var gap = this.cell * 0.06;
        G.roundRect(ctx, this.originX + c * this.cell + gap, this.originY + r * this.cell + gap,
          this.cell - gap * 2, this.cell - gap * 2, this.cell * 0.22);
        ctx.fillStyle = (r + c) % 2 ? theme.cellBg : theme.cellBgAlt;
        ctx.fill();
      }
    }

    var hintA = this.hintPair ? this.hintPair[0] : null;
    var hintB = this.hintPair ? this.hintPair[1] : null;

    for (var r2 = 0; r2 < ROWS; r2++) {
      for (var c2 = 0; c2 < COLS; c2++) {
        var t = this.grid[r2][c2];
        if (t) this.drawTile(ctx, t, t === hintA || t === hintB);
      }
    }

    if (this.cursor && this.app.lastInput === 'key') {
      var cur = this.grid[this.cursor.r] && this.grid[this.cursor.r][this.cursor.c];
      if (cur) {
        var kc = this.tileCenter(cur);
        G.roundRect(ctx, kc.x - this.cell * 0.46, kc.y - this.cell * 0.46, this.cell * 0.92, this.cell * 0.92, this.cell * 0.24);
        ctx.strokeStyle = theme.cursor;
        ctx.lineWidth = Math.max(2, this.cell * 0.05);
        ctx.stroke();
      }
    }

    this.particles.draw(ctx);
    ctx.restore();
  };

  Match3.prototype.drawTile = function (ctx, t, hint) {
    var dx = this.offsetX(t);
    var dy = this.offsetY(t);
    var rect = this.tileRect(t, dx, dy);
    var size = rect.w;
    var scale = t.scale * (t.appear < 1 ? U.Ease.outBack(t.appear) : 1);
    if (scale <= 0.02) return;
    var kind = KINDS[t.type] || KINDS[0];
    var theme = FP.theme.tokens();

    ctx.save();
    ctx.globalAlpha = U.clamp(scale * 1.2, 0, 1);
    ctx.translate(rect.x + size / 2, rect.y + size / 2);
    ctx.scale(scale, scale);

    if (t.selected) {
      G.roundRect(ctx, -size / 2 - size * 0.12, -size / 2 - size * 0.12, size * 1.24, size * 1.24, size * 0.3);
      ctx.fillStyle = theme.select;
      ctx.fill();
    }

    G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.26);
    var grad = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
    grad.addColorStop(0, G.shade(kind.color, 0.2));
    grad.addColorStop(1, G.shade(kind.color, -0.12));
    G.shadow(ctx, 'rgba(20,10,0,.2)', size * 0.16, 0, size * 0.06);
    ctx.fillStyle = grad;
    ctx.fill();
    G.noShadow(ctx);

    ctx.beginPath();
    ctx.ellipse(0, -size * 0.29, size * 0.28, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.26)';
    ctx.fill();

    G.art(ctx, kind.emoji, kind.color, 0, 0, size * 0.62);

    if (hint) {
      var pulse = 0.5 + 0.5 * Math.sin(U.now() / 160);
      G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.26);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + 0.55 * pulse) + ')';
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.stroke();
    }
    if (t.flash > 0) {
      G.roundRect(ctx, -size / 2, -size / 2, size, size, size * 0.26);
      ctx.fillStyle = 'rgba(255,255,255,' + (t.flash * 0.45) + ')';
      ctx.fill();
    }
    ctx.restore();
  };

  Match3.KINDS = KINDS;
  Match3.RUN_TIME = RUN_TIME;
  FP.Match3 = Match3;
})(window);
