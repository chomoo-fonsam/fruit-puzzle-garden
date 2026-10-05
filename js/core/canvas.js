/*!
 * core/canvas.js — 自适应画布（HiDPI）、绘制助手、粒子特效、渲染循环
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});
  var U = FP.util;

  var FONT = '-apple-system,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

  /* ---------------- 老内核 / 小程序补齐缺失的 2D 接口 ---------------- */

  function polyfillCtx(ctx) {
    if (!ctx) return ctx;
    try {
      // roundRect：微信 2D canvas 在部分基础库上没有
      if (typeof ctx.roundRect !== 'function') {
        ctx.roundRect = function (x, y, w, h, r) {
          var rr = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
          this.moveTo(x + rr, y);
          this.arcTo(x + w, y, x + w, y + h, rr);
          this.arcTo(x + w, y + h, x, y + h, rr);
          this.arcTo(x, y + h, x, y, rr);
          this.arcTo(x, y, x + w, y, rr);
          this.closePath();
        };
      }
      // ellipse：部分环境只有 arc
      if (typeof ctx.ellipse !== 'function') {
        ctx.ellipse = function (x, y, rx, ry, rot, start, end) {
          this.save();
          this.translate(x, y);
          this.rotate(rot || 0);
          this.scale(rx / (ry || 1), 1);
          this.arc(0, 0, ry, start, end);
          this.restore();
        };
      }
    } catch (e) { /* 只读实现就跳过，走 JS 兜底 */ }
    return ctx;
  }

  /* ---------------- 绘制助手 ---------------- */

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, rr);
      return;
    }
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function shadow(ctx, color, blur, ox, oy) {
    ctx.shadowColor = color || 'rgba(0,0,0,.25)';
    ctx.shadowBlur = blur == null ? 12 : blur;
    ctx.shadowOffsetX = ox || 0;
    ctx.shadowOffsetY = oy == null ? 4 : oy;
  }

  function noShadow(ctx) {
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  function hexToRgba(hex, alpha) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return 'rgba(0,0,0,' + (alpha == null ? 1 : alpha) + ')';
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
  }

  function shade(hex, amount) {
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return hex;
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var f = function (v) { return U.clamp(Math.round(v + 255 * amount), 0, 255); };
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  function emoji(ctx, char, cx, cy, size, rotate) {
    ctx.save();
    ctx.translate(cx, cy);
    if (rotate) ctx.rotate(rotate);
    ctx.font = size + 'px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, 0, size * 0.04);
    ctx.restore();
  }

  /* ---------------- 水果图案兼容层 ----------------
   *
   * 背景：iOS Safari 的 Canvas 对彩色 Emoji 的渲染并不稳定（某些字符/某些机型直接画不出来），
   * 而像素探测（画一次再 getImageData 看有没有像素）在这类设备上会误判——实测 iPhone 上
   * 只有极少数 Emoji 能通过探测，其余全部被误判为"不支持"，卡片于是变成一片空白。
   *
   * 因此这里不再做任何探测，只用两条确定的规则，任何设备上都成立：
   *   规则 1：先画一层"同色圆形底"（带白描边 + 高光）——Emoji 画不出来时，它就是卡片花色；
   *   规则 2：再在这个底上画 Emoji——能画出来时，底被盖住，看到的就是水果。
   * 最坏情况（Emoji 完全不渲染）也保证每张卡有一个颜色明确、彼此可区分的圆形图案。
   */

  // 同色圆形底：既是"水果托盘"，也是 Emoji 失效时的兜底花色
  function artBase(ctx, color, cx, cy, size) {
    var r = size * 0.5;
    ctx.save();
    ctx.translate(cx, cy);

    // 主体
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color || '#f2704a';
    ctx.fill();

    // 内圈提亮，让圆更有"果肉"感
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fill();

    // 外描边
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = 'rgba(0,0,0,.16)';
    ctx.stroke();

    // 左上高光
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.36, r * 0.3, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fill();

    // 小果柄
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.88);
    ctx.quadraticCurveTo(r * 0.36, -r * 1.3, r * 0.06, -r * 1.04);
    ctx.lineWidth = Math.max(1.2, r * 0.15);
    ctx.strokeStyle = 'rgba(70,120,40,.8)';
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 画一个水果图案：同色圆底 + Emoji。
   * 无论 Emoji 能否渲染，图案都是可辨识的（见上方说明）。
   * @param {string} char  水果 Emoji（可以为空，只画圆底）
   * @param {string} color 该水果的主色
   */
  function art(ctx, char, color, cx, cy, size, rotate) {
    artBase(ctx, color, cx, cy, size);
    if (char) emoji(ctx, char, cx, cy, size * 0.92, rotate);
    return true;
  }

  function label(ctx, text, cx, cy, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = (opts.weight || 700) + ' ' + (opts.size || 18) + 'px ' + (opts.family || FONT);
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'middle';
    if (opts.shadow) shadow(ctx, opts.shadow, opts.shadowBlur || 8, 0, 2);
    if (opts.fill) ctx.fillStyle = opts.fill;
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.fillText(text, cx, cy);
    ctx.restore();
  }

  function fitText(ctx, text, maxWidth, baseSize, opts) {
    opts = opts || {};
    var size = baseSize;
    ctx.save();
    while (size > 8) {
      ctx.font = (opts.weight || 700) + ' ' + size + 'px ' + (opts.family || FONT);
      if (ctx.measureText(text).width <= maxWidth) break;
      size -= 1;
    }
    ctx.restore();
    return size;
  }

  /* ---------------- 粒子系统 ---------------- */

  function createParticles(limit) {
    var list = [];
    var max = limit || 220;
    return {
      list: list,
      burst: function (x, y, opt) {
        opt = opt || {};
        var n = opt.count || 14;
        for (var i = 0; i < n; i++) {
          if (list.length >= max) list.shift();
          var a = opt.angle != null ? opt.angle + (Math.random() - 0.5) * (opt.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
          var sp = (opt.speed || 180) * (0.4 + Math.random() * 0.9);
          list.push({
            x: x, y: y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp - (opt.lift || 0),
            life: 0,
            ttl: (opt.ttl || 0.7) * (0.7 + Math.random() * 0.6),
            size: (opt.size || 5) * (0.6 + Math.random()),
            color: Array.isArray(opt.color) ? opt.color[Math.floor(Math.random() * opt.color.length)] : (opt.color || '#fff'),
            shape: opt.shape || 'circle',
            spin: (Math.random() - 0.5) * 8,
            rot: Math.random() * Math.PI,
            gravity: opt.gravity == null ? 420 : opt.gravity,
            text: opt.text
          });
        }
      },
      update: function (dt) {
        for (var i = list.length - 1; i >= 0; i--) {
          var p = list[i];
          p.life += dt;
          if (p.life >= p.ttl) { list.splice(i, 1); continue; }
          p.vy += p.gravity * dt;
          p.vx *= 0.99;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt;
        }
      },
      draw: function (ctx) {
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          var k = 1 - p.life / p.ttl;
          ctx.save();
          ctx.globalAlpha = U.clamp(k, 0, 1);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          if (p.shape === 'emoji' && p.text) {
            emoji(ctx, p.text, 0, 0, p.size * 3.4);
          } else if (p.shape === 'square') {
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          } else if (p.shape === 'petal') {
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size * k, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      },
      clear: function () { list.length = 0; }
    };
  }

  /* ---------------- 画布表面 ---------------- */

  function createSurface(canvas, aspect) {
    var surface = {
      canvas: canvas,
      ctx: polyfillCtx(canvas.getContext('2d')),
      cssW: 300,
      cssH: 300,
      dpr: 1,
      aspect: aspect || 1,
      maxSide: 640
    };

    surface.resize = function (availW, availH, maxSide) {
      var cap = maxSide || surface.maxSide;
      var w = Math.max(120, availW);
      var h = Math.max(120, availH);
      var a = surface.aspect;
      var cw = Math.min(w, h * a, cap);
      var ch = cw / a;
      if (ch > h) { ch = h; cw = ch * a; }
      var dpr = U.clamp(global.devicePixelRatio || 1, 1, 2.5);
      surface.cssW = Math.floor(cw);
      surface.cssH = Math.floor(ch);
      surface.dpr = dpr;
      canvas.style.width = surface.cssW + 'px';
      canvas.style.height = surface.cssH + 'px';
      var pw = Math.floor(cw * dpr);
      var ph = Math.floor(ch * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      var ctx = surface.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return surface;
    };

    surface.begin = function () {
      var ctx = surface.ctx;
      ctx.setTransform(surface.dpr, 0, 0, surface.dpr, 0, 0);
      ctx.clearRect(0, 0, surface.cssW, surface.cssH);
      return ctx;
    };

    // 关键：让"逻辑坐标"始终等于"屏幕上真实渲染的尺寸"。
    // 只要两者出现偏差（布局在 resize 之后又变过、父容器宽度变化、CSS 约束等），
    // 所有点击/滑动的坐标换算就会整体偏移，表现就是"操作和画面对不上"。
    // 因此定期对照 getBoundingClientRect() 自检并纠正（节流，避免每帧强制布局）。
    var syncTick = 0;
    surface.sync = function (force) {
      syncTick++;
      if (!force && syncTick % 6 !== 0) return;
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var w = Math.round(rect.width);
      var h = Math.round(rect.height);
      if (w !== surface.cssW) {
        surface.cssW = w;
        canvas.style.width = w + 'px';
        canvas.width = Math.max(1, Math.round(w * surface.dpr));
      }
      if (h !== surface.cssH) {
        surface.cssH = h;
        canvas.style.height = h + 'px';
        canvas.height = Math.max(1, Math.round(h * surface.dpr));
      }
    };

    // 把任意屏幕坐标（clientX/clientY）换算成画布逻辑坐标
    surface.toLocal = function (clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      var sx = rect.width ? surface.cssW / rect.width : 1;
      var sy = rect.height ? surface.cssH / rect.height : 1;
      return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    };

    return surface;
  }

  /* ---------------- 渲染循环（可变时间步 + 自动暂停） ---------------- */

  function createLoop() {
    var running = false;
    var raf = null;
    var last = 0;
    var MAX_DT = 1 / 20;   // 单帧最大推进 50ms，低帧率设备上也不会变成"慢动作"
    var MIN_DT = 1 / 240;

    function frame(t) {
      if (!running) return;
      raf = global.requestAnimationFrame(frame);
      var time = t || U.now();
      // 首帧、或时钟出现跳变（切后台回来）时，用一个安全的小步长
      var dt = last ? (time - last) / 1000 : MIN_DT;
      last = time;
      if (!isFinite(dt) || dt <= 0) dt = MIN_DT;
      if (dt > MAX_DT) dt = MAX_DT;
      try { loop.onFrame(dt); } catch (e) { U.logErr('loop.frame', e); }
    }

    var loop = {
      onFrame: function () {},
      start: function () {
        if (running) return;
        running = true;
        last = 0;
        raf = global.requestAnimationFrame(frame);
      },
      stop: function () {
        running = false;
        if (raf) global.cancelAnimationFrame(raf);
        raf = null;
      },
      get running() { return running; }
    };

    // 时钟跳变保护：切后台再回来时丢弃这一段时间，避免动画瞬移
    global.document.addEventListener('visibilitychange', function () {
      last = 0;
    });

    return loop;
  }

  FP.gfx = {
    roundRect: roundRect, shadow: shadow, noShadow: noShadow,
    hexToRgba: hexToRgba, shade: shade, emoji: emoji, art: art, artBase: artBase,
    label: label, fitText: fitText,
    createParticles: createParticles, createSurface: createSurface, createLoop: createLoop,
    polyfillCtx: polyfillCtx
  };
})(window);
