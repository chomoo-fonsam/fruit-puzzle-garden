/*!
 * 小程序适配层 · core-mp/canvas-mp.js
 * 把微信 <canvas type="2d"> 包装成和浏览器一致的 surface，让 games/ 里的三个玩法零改动复用。
 *
 * 与浏览器的差异：
 *  1. 没有 getBoundingClientRect / style，尺寸必须由我们用 wx.createSelectorQuery 量出来后显式设置；
 *  2. 触摸事件是 bindtouchstart/move/end，且没有 pointer capture；
 *  3. 硬件像素缩放要自己做（canvas.width = css * dpr，再 ctx.setTransform(dpr,...)）。
 */
(function () {
  'use strict';
  var FP = (typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis);
  var U = FP.util;
  var G = FP.gfx;

  // 页面外围固定占位（rpx）：顶栏 + 状态区 + 底部操作栏 + 手势提示
  var CHROME = { base: 300, hud: 40, bar: 112, hint: 26, min: 180 };

  function stageAvail() {
    var w = U.Device.winW || 375;
    var h = U.Device.winH || 667;
    var dpr = U.Device.pixelRatio || 1;
    return {
      w: Math.max(140, w - 28),
      h: Math.max(140, h - (CHROME.base + CHROME.hud + CHROME.bar + CHROME.hint) / dpr)
    };
  }

  /**
   * 创建画布表面。
   * 关键：画布的像素尺寸由 JS 精确设置（width/height = css * dpr），
   * 这样触摸坐标换算与绘制坐标系严格一致，不会出现"点了别处"。
   *
   * @param {Object} page   页面实例（this），用于 createSelectorQuery().in(page)
   * @param {string} sel    canvas 选择器，如 '#board'
   * @param {number} aspect 宽高比（宽 / 高）
   * @param {string} stageSel 容纳画布的容器选择器（用于取可用空间），可省略
   * @returns {Promise<Object>} surface
   */
  function createSurface(page, sel, aspect, stageSel) {
    return new Promise(function (resolve, reject) {
      if (typeof wx === 'undefined' || !wx.createSelectorQuery) {
        reject(new Error('当前环境不支持 wx.createSelectorQuery'));
        return;
      }
      var q = wx.createSelectorQuery().in(page);
      q.select(sel).fields({ node: true, size: true });
      if (stageSel) q.select(stageSel).boundingClientRect();
      q.exec(function (res) {
        var info = res && res[0];
        if (!info || !info.node) { reject(new Error('找不到 canvas 节点：' + sel)); return; }

        var canvas = info.node;
        var dpr = U.Device.pixelRatio || 1;
        var fallback = stageAvail();
        var stageRect = res[1];
        // 复用网页版的 createSurface（含 polyfillCtx），只覆盖尺寸相关的部分
        var surface = G.createSurface(canvas, aspect, true);
        surface.dpr = dpr;
        // 小程序里画布尺寸完全由下面的 applySize 决定，先保留一份可用宽度
        surface.maxSide = 100000;

        // 可用空间：优先取容器实测尺寸，取不到再用视口估算
        surface.box = {
          w: (stageRect && stageRect.width) || fallback.w,
          h: (stageRect && stageRect.height) || fallback.h
        };

        // 计算并应用画布尺寸（画布贴着内容大小，居中由 flex 容器负责）
        // 注意：尺寸没变时要立刻返回——重设 canvas.width 会清空画布并重置变换，
        // 而且 ctx 对象必须保持同一个引用（玩法在 mount 时就把它存下来了）。
        surface.applySize = function (force) {
          var a = surface.aspect || 1;
          var box = surface.box;
          var cell = Math.min(box.w / a, box.h);
          if (!isFinite(cell) || cell <= 0) cell = Math.min(box.w, box.h) || 200;
          cell = Math.floor(cell);
          var cssW = Math.max(1, Math.round(cell * a));
          var cssH = Math.max(1, Math.round(cell));
          var pw = Math.max(1, Math.round(cssW * dpr));
          var ph = Math.max(1, Math.round(cssH * dpr));

          if (!force && surface.ctx && cssW === surface.cssW && cssH === surface.cssH && canvas.width === pw) {
            return surface;
          }

          surface.cssW = cssW;
          surface.cssH = cssH;
          if (canvas.width !== pw) canvas.width = pw;
          if (canvas.height !== ph) canvas.height = ph;
          // 同步显式样式，保证量到的尺寸与逻辑尺寸一致
          if (canvas.style) {
            canvas.style.width = cssW + 'px';
            canvas.style.height = cssH + 'px';
          }
          if (!surface.ctx) surface.ctx = G.polyfillCtx(canvas.getContext('2d'));
          surface.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          return surface;
        };

        // 重新量一次可用空间（旋转屏幕 / 窗口变化后调用）
        surface.remeasure = function () {
          return new Promise(function (done) {
            var q2 = wx.createSelectorQuery().in(page);
            if (stageSel) q2.select(stageSel).boundingClientRect();
            q2.select(sel).boundingClientRect();
            q2.exec(function (r) {
              var st = stageSel ? r[0] : null;
              if (st && st.width && st.height) surface.box = { w: st.width, h: st.height };
              else surface.box = stageAvail();
              surface.applySize();
              done(surface);
            });
          });
        };

        // 契约对齐：小程序没有布局漂移，自检即重算
        surface.sync = function () { surface.applySize(); };

        // 触摸事件给的是视口坐标；画布位置由 boundingClientRect 提供
        surface.toLocal = function (clientX, clientY) {
          var r = surface._rect;
          var left = r ? r.left : 0;
          var top = r ? r.top : 0;
          var rw = (r && r.width) || surface.cssW;
          var rh = (r && r.height) || surface.cssH;
          return {
            x: (clientX - left) * (rw ? surface.cssW / rw : 1),
            y: (clientY - top) * (rh ? surface.cssH / rh : 1)
          };
        };

        surface.applySize();

        // 量出画布在视口中的位置（命中判定要用）
        wx.createSelectorQuery().in(page).select(sel).boundingClientRect(function (r) {
          if (r) surface._rect = r;
          resolve(surface);
        }).exec();
      });
    });
  }

  /* ---------------- 渲染循环 ---------------- */

  function createLoop() {
    var running = false;
    var rafId = null;
    var timerId = null;
    var last = 0;
    var raf = null;
    var MAX_DT = 1 / 20;

    function tick() {
      if (!running) return;
      var now = U.now();
      var dt = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      if (!isFinite(dt) || dt <= 0) dt = 1 / 240;
      if (dt > MAX_DT) dt = MAX_DT;
      try { loop.onFrame(dt); } catch (e) { U.logErr('mp.loop', e); }
      if (!running) return;
      if (raf) rafId = raf(tick);
      else timerId = setTimeout(tick, 16);
    }

    var loop = {
      onFrame: function () {},
      setRaf: function (fn) { raf = fn; },
      start: function () {
        if (running) return;
        running = true;
        last = 0;
        if (raf) rafId = raf(tick);
        else timerId = setTimeout(tick, 16);
      },
      stop: function () {
        running = false;
        if (rafId != null && raf && raf.cancel) { try { raf.cancel(rafId); } catch (e) { /* noop */ } }
        if (timerId != null) { clearTimeout(timerId); timerId = null; }
        rafId = null;
      },
      get running() { return running; }
    };
    return loop;
  }

  FP.mpCanvas = {
    createSurface: createSurface,
    createLoop: createLoop,
    stageAvail: stageAvail,
    CHROME: CHROME
  };
})();
