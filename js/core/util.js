/*!
 * 果园谜题 · Fruit Puzzle Garden
 * core/util.js — 通用工具（无依赖，可离线运行）
 */
(function (global) {
  'use strict';

  var FP = (global.FP = global.FP || {});
  var doc = global.document;
  var root = doc.documentElement;

  /* ---------------- 数学 ---------------- */

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // 缓动函数（游戏动画统一使用，便于手感一致）
  var Ease = {
    linear: function (t) { return t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack: function (t) {
      var c = 1.9;
      return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
    },
    outQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    inQuad: function (t) { return t * t; },
    outElastic: function (t) {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    }
  };

  function now() {
    return (global.performance && global.performance.now)
      ? global.performance.now()
      : Date.now();
  }

  /* ---------------- 随机数（可种子化，便于复现） ---------------- */

  function rng(seed) {
    var s = (seed >>> 0) || (Date.now() >>> 0);
    var fn = function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.int = function (n) { return Math.floor(fn() * n) % n; };
    fn.range = function (min, max) { return min + Math.floor(fn() * (max - min + 1)); };
    fn.pick = function (arr) { return arr[fn.int(arr.length)]; };
    fn.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = fn.int(i + 1);
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    };
    fn.seedOf = function () { return s; };
    return fn;
  }

  /* ---------------- DOM ---------------- */

  function qs(sel, ctx) {
    return (ctx || doc).querySelector(sel);
  }

  function qsa(sel, ctx) {
    return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel));
  }

  function el(tag, attrs, children) {
    var node = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, '');
        else if (v !== false) node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return node;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /* ---------------- 数值与时间格式 ---------------- */

  function fmt(n) {
    if (!isFinite(n)) return '0';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    try {
      var d = new Date(ts);
      var p = function (v) { return v < 10 ? '0' + v : '' + v; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return '—'; }
  }

  /* ---------------- 事件总线 ---------------- */

  function createBus() {
    var map = {};
    return {
      on: function (name, fn) {
        (map[name] = map[name] || []).push(fn);
        return function () { this.off(name, fn); }.bind(this);
      },
      off: function (name, fn) {
        var list = map[name];
        if (!list) return;
        var i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      emit: function (name, payload) {
        var list = map[name];
        if (!list) return;
        list.slice().forEach(function (fn) {
          try { fn(payload); } catch (e) { logErr('bus:' + name, e); }
        });
      }
    };
  }

  function logErr(where, e) {
    if (global.console && console.warn) console.warn('[FP] ' + where, e);
  }

  /* ---------------- 时间轴（动画） ---------------- */

  function createTimeline() {
    var items = [];
    return {
      add: function (item) { items.push(item); return item; },
      remove: function (item) {
        var i = items.indexOf(item);
        if (i >= 0) items.splice(i, 1);
      },
      clear: function () { items.length = 0; },
      get size() { return items.length; },
      done: function () {
        for (var i = items.length - 1; i >= 0; i--) {
          if (items[i].done) items.splice(i, 1);
        }
      },
      update: function (dt) {
        for (var i = items.length - 1; i >= 0; i--) {
          var it = items[i];
          it.t = (it.t || 0) + dt;
          var k = it.dur > 0 ? clamp(it.t / it.dur, 0, 1) : 1;
          if (it.update) it.update(k, it);
          if (k >= 1) {
            if (it.onDone) it.onDone();
            items.splice(i, 1);
          }
        }
      }
    };
  }

  /* ---------------- 设备信息 ---------------- */

  var Device = (function () {
    var ua = global.navigator ? (global.navigator.userAgent || '') : '';
    var coarse = false;
    var fine = false;
    var canHover = false;
    try {
      coarse = !!(global.matchMedia && matchMedia('(pointer: coarse)').matches);
      fine = !!(global.matchMedia && matchMedia('(pointer: fine)').matches);
      canHover = !!(global.matchMedia && matchMedia('(hover: hover)').matches);
    } catch (e) { /* noop */ }

    return {
      ua: ua,
      winW: global.innerWidth || 0,
      winH: global.innerHeight || 0,
      pixelRatio: global.devicePixelRatio || 1,
      touch: ('ontouchstart' in global) || (global.navigator && global.navigator.maxTouchPoints > 0),
      coarse: coarse,
      fine: fine,
      canHover: canHover,
      ios: /iPad|iPhone|iPod/.test(ua) || (/Mac/.test(ua) && 'ontouchend' in doc),
      android: /Android/i.test(ua),
      standalone: ('standalone' in (global.navigator || {}) && global.navigator.standalone) ||
        !!(global.matchMedia && matchMedia('(display-mode: standalone)').matches),
      reduceMotion: !!(global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
      hasVibrate: !!(global.navigator && typeof global.navigator.vibrate === 'function')
    };
  })();

  function vibrate(pattern) {
    if (!FP.store || !FP.store.settings().haptics) return;
    if (!Device.hasVibrate) return;
    try { global.navigator.vibrate(pattern); } catch (e) { /* noop */ }
  }

  /* ---------------- 其它 ---------------- */

  function isPortrait() {
    return global.innerHeight >= global.innerWidth;
  }

  function safe(fn, fallback) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) { logErr('safe', e); return fallback; }
    };
  }

  FP.util = {
    clamp: clamp, lerp: lerp, now: now, rng: rng, Ease: Ease,
    qs: qs, qsa: qsa, el: el, clear: clear, escapeHtml: escapeHtml,
    fmt: fmt, fmtTime: fmtTime, fmtDate: fmtDate,
    createBus: createBus, createTimeline: createTimeline,
    Device: Device, vibrate: vibrate, isPortrait: isPortrait,
    logErr: logErr, safe: safe, root: root,
    // 构建号：改动代码时随手 +1，控制台跑 FP.util.build 即可确认线上是否最新
    build: '2026-10-05.15'
  };
})(window);
