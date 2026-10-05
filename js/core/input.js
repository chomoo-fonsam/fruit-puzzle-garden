/*!
 * core/input.js — 统一输入层：触摸滑动 / 点击 / 拖动 / 鼠标 / 键盘 / 虚拟方向键
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});
  var U = FP.util;

  var KEY_DIRS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
    k: 'up', j: 'down', h: 'left', l: 'right'
  };

  function attach(target, handlers) {
    handlers = handlers || {};
    var state = {
      active: false,
      id: null,
      x0: 0, y0: 0, x: 0, y: 0,
      t0: 0,
      moved: false,
      dragging: false,
      dirEmitted: false
    };

    var opts = { passive: false };
    var dragThreshold = handlers.dragThreshold == null ? 10 : handlers.dragThreshold;
    var swipeThreshold = handlers.swipeThreshold == null ? 26 : handlers.swipeThreshold;
    var tapMaxDist = handlers.tapMaxDist == null ? 16 : handlers.tapMaxDist;
    var tapMaxTime = handlers.tapMaxTime == null ? 700 : handlers.tapMaxTime;

    function local(e) {
      return { x: e.clientX, y: e.clientY, t: U.now(), raw: e };
    }

    function onDown(e) {
      if (e.button != null && e.button > 0) return;
      if (state.active) return;
      var p = local(e);
      state.active = true;
      state.id = e.pointerId;
      state.x0 = p.x; state.y0 = p.y;
      state.x = p.x; state.y = p.y;
      state.t0 = p.t;
      state.moved = false;
      state.dragging = false;
      state.dirEmitted = false;
      try { target.setPointerCapture && target.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      if (handlers.onDown) handlers.onDown(p, state);
      if (target.style) target.style.cursor = 'grabbing';
    }

    function onMove(e) {
      if (!state.active || (state.id != null && e.pointerId !== state.id)) return;
      var p = local(e);
      state.x = p.x; state.y = p.y;
      var dx = p.x - state.x0;
      var dy = p.y - state.y0;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (!state.dragging && dist > dragThreshold) {
        state.dragging = true;
        state.moved = true;
        if (handlers.onDragStart) handlers.onDragStart({ x: state.x0, y: state.y0, raw: e }, state);
      }

      if (state.dragging && handlers.onDragMove) {
        handlers.onDragMove({ x: p.x, y: p.y, dx: dx, dy: dy, raw: e }, state);
        if (e.cancelable) e.preventDefault();
      }

      if (!state.dirEmitted && dist > swipeThreshold) {
        var angle = Math.atan2(dy, dx);
        var dir;
        if (Math.abs(dx) > Math.abs(dy) * 1.15) dir = dx > 0 ? 'right' : 'left';
        else if (Math.abs(dy) > Math.abs(dx) * 1.15) dir = dy > 0 ? 'down' : 'up';
        else dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        state.dir = dir;
        state.dirEmitted = true;
        // 方向游戏在滑动开始时即触发，手感更利落
        if (handlers.onSwipe && handlers.swipeImmediate) handlers.onSwipe({ dir: dir, x0: state.x0, y0: state.y0, x: p.x, y: p.y, raw: e }, state);
      }
    }

    function finish(e, cancelled) {
      if (!state.active) return;
      var p = local(e || {});
      var dx = (p.x || state.x) - state.x0;
      var dy = (p.y || state.y) - state.y0;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var dt = p.t - state.t0;
      var wasDragging = state.dragging;
      var dirEmitted = state.dirEmitted;
      var dir = state.dir;
      var x0 = state.x0, y0 = state.y0, x = state.x, y = state.y;
      var id = state.id;

      state.active = false;
      state.dragging = false;
      state.id = null;
      if (target.style) target.style.cursor = '';
      try { target.releasePointerCapture && id != null && target.releasePointerCapture(id); } catch (err) { /* noop */ }

      if (cancelled) {
        if (handlers.onCancel) handlers.onCancel(state);
        return;
      }

      if (wasDragging) {
        if (handlers.onDragEnd) handlers.onDragEnd({ x: x, y: y, dx: dx, dy: dy, raw: e }, state);
        return;
      }

      if (dirEmitted) {
        if (handlers.onSwipe && !handlers.swipeImmediate) handlers.onSwipe({ dir: dir, x0: x0, y0: y0, x: x, y: y, raw: e }, state);
        return;
      }

      if (dist <= tapMaxDist && dt <= tapMaxTime) {
        if (handlers.onTap) handlers.onTap({ x: p.x || x, y: p.y || y, raw: e }, state);
      }
    }

    function onUp(e) { finish(e, false); }
    function onCancel(e) { finish(e, true); }

    target.addEventListener('pointerdown', onDown, opts);
    target.addEventListener('pointermove', onMove, opts);
    target.addEventListener('pointerup', onUp, opts);
    target.addEventListener('pointercancel', onCancel, opts);
    target.addEventListener('lostpointercapture', function (e) {
      if (state.active && state.id === e.pointerId) finish(e, true);
    });
    // 屏蔽长按菜单、双击缩放与拖拽选中
    target.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    target.addEventListener('dragstart', function (e) { e.preventDefault(); });
    target.addEventListener('selectstart', function (e) { e.preventDefault(); });

    return {
      detach: function () {
        target.removeEventListener('pointerdown', onDown, opts);
        target.removeEventListener('pointermove', onMove, opts);
        target.removeEventListener('pointerup', onUp, opts);
        target.removeEventListener('pointercancel', onCancel, opts);
      },
      get dragging() { return state.dragging; }
    };
  }

  /* ---------------- 键盘 ---------------- */

  var keyListeners = [];

  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      var dir = KEY_DIRS[e.key];
      var handled = false;
      keyListeners.forEach(function (l) { if (l(e, dir) === true) handled = true; });
      // 只有真正被游戏消费的方向键才拦截默认行为，避免影响页面其它滚动
      if (handled) {
        if (e.cancelable) e.preventDefault();
      }
    });
  }

  function onKey(fn) {
    keyListeners.push(fn);
    return function () {
      var i = keyListeners.indexOf(fn);
      if (i >= 0) keyListeners.splice(i, 1);
    };
  }

  /* ---------------- 虚拟方向键（DPad） ---------------- */

  function bindDPad(container, onDir) {
    if (!container) return function () {};
    var un = [];
    U.qsa('[data-dir]', container).forEach(function (btn) {
      var fire = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var d = btn.getAttribute('data-dir');
        if (d) onDir(d);
      };
      var pressed = function () { btn.classList.add('is-active'); };
      var released = function () { btn.classList.remove('is-active'); };
      btn.addEventListener('pointerdown', function (e) { pressed(); fire(e); });
      btn.addEventListener('pointerup', released);
      btn.addEventListener('pointerleave', released);
      btn.addEventListener('pointercancel', released);
      un.push(function () {
        btn.removeEventListener('pointerdown', fire);
        btn.removeEventListener('pointerup', released);
      });
    });
    return function () { un.forEach(function (f) { f(); }); };
  }

  FP.input = { attach: attach, onKey: onKey, bindDPad: bindDPad, KEY_DIRS: KEY_DIRS };
})(window);
