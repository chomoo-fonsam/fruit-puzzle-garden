/*!
 * core/canvas.js（小程序精简版）— 绘制助手、粒子特效、2D 接口补齐
 *
 * 与网页版 js/core/canvas.js 的关系：
 *  - 绘制助手 / 粒子 / polyfillCtx 与网页版完全一致；
 *  - 网页版里的 createSurface / createLoop 依赖浏览器 DOM，小程序由 core-mp/canvas-mp.js 提供，
 *    所以这里不重复实现。
 * 改动绘制相关代码时请两边同步（见 tool/sync-portable.ps1）。
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

  FP.gfx = {
    roundRect: roundRect, shadow: shadow, noShadow: noShadow,
    hexToRgba: hexToRgba, shade: shade, emoji: emoji, label: label, fitText: fitText,
    createParticles: createParticles,
    polyfillCtx: polyfillCtx
  };
})(typeof window !== 'undefined' ? window
  : (typeof GameGlobal !== 'undefined' ? GameGlobal
    : (typeof globalThis !== 'undefined' ? globalThis : this)));
