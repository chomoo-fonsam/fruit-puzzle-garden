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

  /* ---------------- 水果图形库（纯 Canvas 绘制，不依赖任何字体） ----------------
   *
   * 为什么要有这一层：
   *  1. iOS Safari 的 Canvas 对彩色 Emoji 渲染并不稳定；
   *  2. 更关键的是，在 iOS「锁定模式 / 高级隐私保护」或被内置浏览器（WKWebView，如 QQ / 微信）
   *     加载时，系统彩色 Emoji 字体会被限制，所有水果字符会退化成同一个单色回退字形 ——
   *     实测表现为"记忆果园里 24 张卡片的图案长得一模一样"，游戏因此无法配对。
   *
   * 所以卡面主图案改为用 Canvas 图元手绘：轮廓 + 主色双重区分，任何设备上完全一致。
   * 传入的 Emoji 只作为"该画哪种水果"的线索，不参与绘制。
   */

  function circle(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function highlight(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fill();
  }

  function leafShape(ctx, x, y, len, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.55, -len * 0.42, len, 0);
    ctx.quadraticCurveTo(len * 0.55, len * 0.42, 0, 0);
    ctx.closePath();
    ctx.fillStyle = color || '#5fae44';
    ctx.fill();
    ctx.restore();
  }

  function stem(ctx, x, y, h, color) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + h * 0.25, y - h * 0.6, x + h * 0.08, y - h);
    ctx.lineWidth = Math.max(1.2, h * 0.16);
    ctx.strokeStyle = color || '#7a5230';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  var FRUIT_SHAPES = {
    // 苹果 / 青苹果：双圆弧轮廓 + 果柄 + 叶
    apple: function (ctx, x, y, s, c) {
      ctx.beginPath();
      ctx.arc(x - s * 0.15, y + s * 0.08, s * 0.34, 0, Math.PI * 2);
      ctx.arc(x + s * 0.15, y + s * 0.08, s * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      stem(ctx, x, y - s * 0.2, s * 0.28);
      leafShape(ctx, x + s * 0.06, y - s * 0.44, s * 0.34, -0.35);
      highlight(ctx, x - s * 0.2, y - s * 0.04, s * 0.1, s * 0.06);
    },
    // 橙子：圆 + 瓣纹 + 叶
    orange: function (ctx, x, y, s, c) {
      circle(ctx, x, y, s * 0.4, c);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.32)';
      ctx.lineWidth = Math.max(1, s * 0.03);
      for (var i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(i * Math.PI / 3) * s * 0.34, y + Math.sin(i * Math.PI / 3) * s * 0.34);
        ctx.stroke();
      }
      ctx.restore();
      leafShape(ctx, x + s * 0.06, y - s * 0.38, s * 0.26, -0.5);
      highlight(ctx, x - s * 0.16, y - s * 0.16, s * 0.1, s * 0.06);
    },
    // 柠檬：斜椭圆 + 两端尖角
    lemon: function (ctx, x, y, s, c) {
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.42, s * 0.27, -0.35, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      circle(ctx, x - s * 0.41, y + s * 0.14, s * 0.065, c);
      circle(ctx, x + s * 0.41, y - s * 0.14, s * 0.065, c);
      leafShape(ctx, x + s * 0.2, y - s * 0.28, s * 0.24, -0.6);
      highlight(ctx, x - s * 0.16, y - s * 0.09, s * 0.12, s * 0.05);
    },
    // 葡萄：一串错落的小圆 + 果柄 + 叶
    grape: function (ctx, x, y, s, c) {
      var pts = [
        [0, -0.34], [-0.22, -0.18], [0.22, -0.18],
        [-0.34, 0.06], [0, 0.06], [0.34, 0.06],
        [-0.18, 0.3], [0.18, 0.3], [0, 0.5]
      ];
      for (var i = 0; i < pts.length; i++) {
        circle(ctx, x + pts[i][0] * s, y + pts[i][1] * s, s * 0.17, i % 2 ? shade(c, -0.08) : c);
      }
      stem(ctx, x, y - s * 0.4, s * 0.22);
      leafShape(ctx, x + s * 0.08, y - s * 0.5, s * 0.3, -0.4);
    },
    // 草莓：倒心形 + 籽 + 绿蒂
    strawberry: function (ctx, x, y, s, c) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.46);
      ctx.quadraticCurveTo(x - s * 0.44, y + s * 0.1, x - s * 0.34, y - s * 0.16);
      ctx.quadraticCurveTo(x, y - s * 0.4, x + s * 0.34, y - s * 0.16);
      ctx.quadraticCurveTo(x + s * 0.44, y + s * 0.1, x, y + s * 0.46);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      var seeds = [[-0.14, -0.04], [0.12, 0.02], [-0.02, 0.16], [0.2, -0.14], [-0.22, -0.14], [0.04, 0.3]];
      for (var i = 0; i < seeds.length; i++) {
        circle(ctx, x + seeds[i][0] * s, y + seeds[i][1] * s, s * 0.035, 'rgba(255,255,255,.8)');
      }
      leafShape(ctx, x, y - s * 0.24, s * 0.3, -0.1, '#4f9c3a');
      leafShape(ctx, x, y - s * 0.24, s * 0.3, -0.9, '#5fae44');
      leafShape(ctx, x, y - s * 0.24, s * 0.3, 0.7, '#4f9c3a');
    },
    // 桃子：双圆弧 + 中缝 + 叶
    peach: function (ctx, x, y, s, c) {
      ctx.beginPath();
      ctx.arc(x - s * 0.16, y + s * 0.06, s * 0.34, 0, Math.PI * 2);
      ctx.arc(x + s * 0.16, y + s * 0.06, s * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.26);
      ctx.quadraticCurveTo(x + s * 0.06, y + s * 0.06, x, y + s * 0.4);
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.strokeStyle = 'rgba(160,60,40,.4)';
      ctx.stroke();
      leafShape(ctx, x + s * 0.08, y - s * 0.3, s * 0.3, -0.45);
      highlight(ctx, x - s * 0.22, y - s * 0.02, s * 0.1, s * 0.06);
    },
    // 梨：下大上小两个圆 + 果柄
    pear: function (ctx, x, y, s, c) {
      circle(ctx, x, y + s * 0.14, s * 0.32, c);
      circle(ctx, x, y - s * 0.14, s * 0.22, c);
      stem(ctx, x, y - s * 0.3, s * 0.22);
      leafShape(ctx, x + s * 0.06, y - s * 0.34, s * 0.26, -0.4);
      highlight(ctx, x - s * 0.16, y + s * 0.06, s * 0.1, s * 0.07);
    },
    // 猕猴桃：外皮 + 果肉 + 白心 + 一圈籽
    kiwi: function (ctx, x, y, s, c) {
      circle(ctx, x, y, s * 0.42, '#8a6a45');
      circle(ctx, x, y, s * 0.34, c);
      circle(ctx, x, y, s * 0.2, '#f3f6e6');
      for (var i = 0; i < 10; i++) {
        var a = i * Math.PI / 5;
        circle(ctx, x + Math.cos(a) * s * 0.26, y + Math.sin(a) * s * 0.26, s * 0.028, '#3d3a24');
      }
    },
    // 樱桃：两颗果 + 交叉果柄 + 叶
    cherry: function (ctx, x, y, s, c) {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.2, y + s * 0.16);
      ctx.quadraticCurveTo(x - s * 0.02, y - s * 0.4, x + s * 0.24, y - s * 0.36);
      ctx.moveTo(x + s * 0.2, y + s * 0.24);
      ctx.quadraticCurveTo(x + s * 0.16, y - s * 0.2, x + s * 0.24, y - s * 0.36);
      ctx.lineWidth = Math.max(1.2, s * 0.05);
      ctx.strokeStyle = '#6b8f3a';
      ctx.lineCap = 'round';
      ctx.stroke();
      circle(ctx, x - s * 0.2, y + s * 0.26, s * 0.22, c);
      circle(ctx, x + s * 0.2, y + s * 0.32, s * 0.22, shade(c, -0.08));
      leafShape(ctx, x + s * 0.24, y - s * 0.36, s * 0.28, -0.5);
    },
    // 西瓜：半圆瓜皮 + 红瓤 + 籽
    watermelon: function (ctx, x, y, s, c) {
      ctx.beginPath();
      ctx.arc(x, y + s * 0.22, s * 0.44, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y + s * 0.2, s * 0.34, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#e8534f';
      ctx.fill();
      var seeds = [[-0.16, 0.18], [0, 0.1], [0.16, 0.18], [-0.08, 0.3], [0.09, 0.3]];
      for (var i = 0; i < seeds.length; i++) {
        ctx.save();
        ctx.translate(x + seeds[i][0] * s, y + seeds[i][1] * s);
        ctx.rotate(-0.3);
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.035, s * 0.06, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#2b2b1f';
        ctx.fill();
        ctx.restore();
      }
    },
    // 香蕉：弯月轮廓 + 蒂
    banana: function (ctx, x, y, s, c) {
      ctx.beginPath();
      ctx.moveTo(x - s * 0.4, y - s * 0.12);
      ctx.quadraticCurveTo(x, y + s * 0.62, x + s * 0.42, y - s * 0.06);
      ctx.quadraticCurveTo(x + s * 0.16, y + s * 0.3, x - s * 0.26, y + s * 0.02);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - s * 0.4, y - s * 0.12);
      ctx.quadraticCurveTo(x, y + s * 0.56, x + s * 0.42, y - s * 0.06);
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.strokeStyle = 'rgba(120,90,20,.3)';
      ctx.stroke();
      circle(ctx, x - s * 0.42, y - s * 0.14, s * 0.05, '#6b5a1e');
    },
    // 菠萝：冠叶 + 椭圆果身 + 菱形网纹
    pineapple: function (ctx, x, y, s, c) {
      for (var i = -2; i <= 2; i++) {
        leafShape(ctx, x, y - s * 0.26, s * 0.34, -Math.PI / 2 + i * 0.38, '#4f9c3a');
      }
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.1, s * 0.3, s * 0.36, 0, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.1, s * 0.3, s * 0.36, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = 'rgba(150,100,20,.32)';
      ctx.lineWidth = Math.max(1, s * 0.025);
      for (var k = -3; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.4 + k * s * 0.14, y - s * 0.4);
        ctx.lineTo(x + s * 0.4 + k * s * 0.14, y + s * 0.6);
        ctx.moveTo(x + s * 0.4 + k * s * 0.14, y - s * 0.4);
        ctx.lineTo(x - s * 0.4 + k * s * 0.14, y + s * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  // 按主色反查水果形状（各玩法里的 color 互不相同）
  var SHAPE_BY_COLOR = {
    '#e63946': 'apple', '#d94f6a': 'cherry', '#f0546b': 'strawberry',
    '#ef4b6b': 'strawberry', '#f98e5a': 'peach', '#f9943f': 'orange',
    '#f9a03f': 'orange', '#f7d34d': 'lemon', '#f6c445': 'lemon',
    '#a8d94a': 'apple', '#bfe36a': 'pear', '#8dc63f': 'kiwi',
    '#9b6ad6': 'grape', '#7b5cc4': 'grape', '#3fae6a': 'watermelon',
    '#e0503f': 'watermelon', '#f2d13c': 'banana', '#f4a63a': 'pineapple',
    // 为区分度调整后的新配色
    '#e8324f': 'strawberry', '#c0203c': 'cherry', '#ee7a48': 'peach',
    '#ef8a2b': 'orange', '#efc431': 'lemon', '#f0dc44': 'banana',
    '#2f9e5c': 'watermelon', '#d64562': 'cherry'
  };

  // 每种水果一个专属角标：即使主图案在小屏上不易分辨，也能一眼区分
  var FRUIT_MARKER = {
    apple: { shape: 'dot', color: '#ffffff' },
    orange: { shape: 'ring', color: '#ffffff' },
    lemon: { shape: 'plus', color: '#ffffff' },
    grape: { shape: 'triangle', color: '#ffffff' },
    strawberry: { shape: 'square', color: '#ffffff' },
    peach: { shape: 'diamond', color: '#ffffff' },
    pear: { shape: 'bars', color: '#ffffff' },
    kiwi: { shape: 'dot', color: '#3d3a24' },
    cherry: { shape: 'ring', color: '#ffe14d' },
    watermelon: { shape: 'triangle', color: '#ffffff' },
    banana: { shape: 'plus', color: '#6b5a1e' },
    pineapple: { shape: 'diamond', color: '#5b3f10' }
  };

  // 在卡片角落画角标
  function drawMarker(ctx, name, cx, cy, size) {
    var m = FRUIT_MARKER[name];
    if (!m) return;
    var s = size * 0.19;               // 角标半径
    var x = cx + size * 0.36;
    var y = cy + size * 0.36;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = m.color;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = Math.max(1.4, s * 0.42);
    ctx.lineCap = 'square';

    switch (m.shape) {
      case 'dot':
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
        break;
      case 'ring':
        ctx.beginPath(); ctx.arc(0, 0, s * 0.72, 0, Math.PI * 2); ctx.stroke();
        break;
      case 'square':
        ctx.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0);
        ctx.closePath(); ctx.fill();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.95); ctx.lineTo(s * 0.9, s * 0.7); ctx.lineTo(-s * 0.9, s * 0.7);
        ctx.closePath(); ctx.fill();
        break;
      case 'plus':
        ctx.beginPath();
        ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
        ctx.moveTo(0, -s); ctx.lineTo(0, s);
        ctx.stroke();
        break;
      case 'bars':
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.7); ctx.lineTo(s * 0.2, -s * 0.7);
        ctx.moveTo(-s * 0.6, 0); ctx.lineTo(s * 0.6, 0);
        ctx.moveTo(-s * 0.3, s * 0.7); ctx.lineTo(s, s * 0.7);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  var SHAPE_BY_EMOJI = {
    '🍎': 'apple', '🍏': 'apple', '🍊': 'orange', '🍋': 'lemon',
    '🍇': 'grape', '🍓': 'strawberry', '🍑': 'peach', '🍐': 'pear',
    '🥝': 'kiwi', '🍒': 'cherry', '🍉': 'watermelon', '🍌': 'banana',
    '🍍': 'pineapple'
  };

  function normalizeColor(c) {
    if (!c) return '';
    var s = String(c).toLowerCase().trim();
    if (s.charAt(0) !== '#') return s;
    if (s.length === 4) return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return s;
  }

  function shapeName(color, emoji) {
    return SHAPE_BY_COLOR[normalizeColor(color)] || SHAPE_BY_EMOJI[emoji] || 'apple';
  }

  /**
   * 画一个水果图案：完全由 Canvas 图元绘制，不依赖任何字体。
   * 因此在 iOS 锁定模式 / 内置浏览器等限制彩色 Emoji 的环境里也能正常显示。
   * @param {string} emoji 水果 Emoji（仅作为"画哪种水果"的线索，不会被绘制）
   * @param {string} color 该水果主色
   */
  function art(ctx, emoji, color, cx, cy, size) {
    var name = shapeName(color, emoji);
    var draw = FRUIT_SHAPES[name] || FRUIT_SHAPES.apple;
    ctx.save();
    // 浅色托盘底，让图案在深浅两种卡片底色上都有轮廓
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.54, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.54, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.stroke();
    draw(ctx, cx, cy, size, color || '#f2704a');
    drawMarker(ctx, name, cx, cy, size);
    ctx.restore();
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
    hexToRgba: hexToRgba, shade: shade, emoji: emoji, art: art,
    fruitShapes: FRUIT_SHAPES, fruitMarkers: FRUIT_MARKER, shapeName: shapeName,
    label: label, fitText: fitText,
    createParticles: createParticles, createSurface: createSurface, createLoop: createLoop,
    polyfillCtx: polyfillCtx
  };
})(window);
