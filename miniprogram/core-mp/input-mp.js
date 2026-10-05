/*!
 * 小程序适配层 · core-mp/input-mp.js
 * 用 touchstart / touchmove / touchend 复刻浏览器端的 pointer 手势识别，
 * 输出与 js/core/input.js 完全一致的回调载荷，让三个玩法不用改。
 */
(function () {
  'use strict';
  var FP = (typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis);
  var U = FP.util;

  var DEFAULTS = {
    dragThreshold: 10,   // 超过即视为拖动（消消乐交换）
    swipeThreshold: 26,  // 超过即判定滑动方向（2048）
    tapMaxDist: 16,      // 抬手时位移不超过此值算点击
    tapMaxTime: 700,
    swipeImmediate: false
  };

  function Gestures(opts) {
    opts = opts || {};
    this.o = {};
    for (var k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) this.o[k] = DEFAULTS[k];
    for (var k2 in opts) if (opts.hasOwnProperty(k2) && opts[k2] !== undefined) this.o[k2] = opts[k2];
    this.reset();
  }

  Gestures.prototype.reset = function () {
    this.active = false;
    this.x0 = 0; this.y0 = 0;
    this.x = 0; this.y = 0;
    this.t0 = 0;
    this.dragging = false;
    this.dirEmitted = false;
    this.dir = null;
  };

  Gestures.prototype.point = function (e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
    if (!t) return null;
    // 小程序 touch 事件：x/y 是相对 canvas 的坐标，clientX/clientY 是视口坐标
    var rawX = (t.clientX != null) ? t.clientX : t.x;
    var rawY = (t.clientY != null) ? t.clientY : t.y;
    var p = this.o.toLocal ? this.o.toLocal(rawX, rawY) : { x: rawX, y: rawY };
    p.t = U.now();
    p.raw = e;
    return p;
  };

  Gestures.prototype.onStart = function (e) {
    if (this.active) return;
    var p = this.point(e);
    if (!p) return;
    this.reset();
    this.active = true;
    this.x0 = this.x = p.x;
    this.y0 = this.y = p.y;
    this.t0 = p.t;
    if (this.o.onDown) this.o.onDown(p);
  };

  Gestures.prototype.onMove = function (e) {
    if (!this.active) return;
    var p = this.point(e);
    if (!p) return;
    this.x = p.x; this.y = p.y;
    var dx = p.x - this.x0;
    var dy = p.y - this.y0;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (!this.dragging && dist > this.o.dragThreshold) {
      this.dragging = true;
      if (this.o.onDragStart) this.o.onDragStart({ x: this.x0, y: this.y0, raw: e });
    }

    if (this.dragging && this.o.onDragMove) {
      this.o.onDragMove({ x: p.x, y: p.y, dx: dx, dy: dy, raw: e });
    }

    if (!this.dirEmitted && dist > this.o.swipeThreshold) {
      var adx = Math.abs(dx), ady = Math.abs(dy);
      var dir;
      if (adx > ady * 1.15) dir = dx > 0 ? 'right' : 'left';
      else if (ady > adx * 1.15) dir = dy > 0 ? 'down' : 'up';
      else dir = adx > ady ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      this.dir = dir;
      this.dirEmitted = true;
      // 2048 在滑动一开始就响应，手感更利落
      if (this.o.onSwipe && this.o.swipeImmediate) {
        this.o.onSwipe({ dir: dir, x0: this.x0, y0: this.y0, x: p.x, y: p.y, raw: e });
      }
    }
  };

  Gestures.prototype.onEnd = function (e) {
    if (!this.active) return;
    var p = this.point(e) || { x: this.x, y: this.y, t: U.now() };
    var dx = p.x - this.x0;
    var dy = p.y - this.y0;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var dt = p.t - this.t0;
    var wasDragging = this.dragging;
    var dirEmitted = this.dirEmitted;
    var dir = this.dir;
    var x0 = this.x0, y0 = this.y0, x = this.x, y = this.y;

    this.reset();

    if (wasDragging) {
      if (this.o.onDragEnd) this.o.onDragEnd({ x: x, y: y, dx: dx, dy: dy, raw: e });
      return;
    }
    if (dirEmitted) {
      if (this.o.onSwipe && !this.o.swipeImmediate) {
        this.o.onSwipe({ dir: dir, x0: x0, y0: y0, x: x, y: y, raw: e });
      }
      return;
    }
    if (dist <= this.o.tapMaxDist && dt <= this.o.tapMaxTime) {
      if (this.o.onTap) this.o.onTap({ x: x, y: y, raw: e });
    }
  };

  Gestures.prototype.onCancel = function () {
    if (!this.active) return;
    this.reset();
  };

  /* 把三个 handler 绑到一个页面/组件上，返回解绑函数 */
  function bind(page, gestures) {
    var h = {
      touchstart: function (e) { gestures.onStart(e); },
      touchmove: function (e) { gestures.onMove(e); },
      touchend: function (e) { gestures.onEnd(e); },
      touchcancel: function () { gestures.onCancel(); }
    };
    page.__fpGestures = gestures;
    page.__fpGestureHandlers = h;
    return h;
  }

  /* ---------------- 与浏览器端同形的 FP.input 接口 ---------------- */

  var registry = {};

  // 游戏里写的是 FP.input.attach(target, handlers)，小程序里忽略 target，只登记 handlers
  function attach(target, handlers) {
    var key = (handlers && handlers.key) || 'default';
    var g = new Gestures(handlers || {});
    registry[key] = { gestures: g, handlers: handlers || {} };
    return {
      detach: function () {
        delete registry[key];
        g.reset();
      },
      get dragging() { return g.dragging; }
    };
  }

  // 页面把 canvas 的 touch 事件转发进来
  function dispatch(type, e) {
    var keys = Object.keys(registry);
    for (var i = 0; i < keys.length; i++) {
      var g = registry[keys[i]].gestures;
      if (type === 'start') g.onStart(e);
      else if (type === 'move') g.onMove(e);
      else if (type === 'end') g.onEnd(e);
      else g.onCancel();
    }
  }

  // 指定"视口坐标 -> 画布逻辑坐标"的换算函数（画布尺寸确定后调用）
  function setToLocal(fn) {
    Object.keys(registry).forEach(function (k) { registry[k].gestures.o.toLocal = fn; });
  }

  function clear() {
    Object.keys(registry).forEach(function (k) { delete registry[k]; });
  }

  FP.input = {
    attach: attach,
    detachAll: clear,
    setToLocal: setToLocal,
    dispatch: dispatch,
    Gestures: Gestures,
    onKey: function () { return function () {}; },   // 小程序无实体键盘
    bindDPad: function () { return function () {}; },// 方向键在 WXML 里直接绑事件
    KEY_DIRS: {}
  };

  FP.mpInput = {
    Gestures: Gestures, bind: bind, attach: attach,
    dispatch: dispatch, setToLocal: setToLocal, clear: clear, DEFAULTS: DEFAULTS
  };
})();
