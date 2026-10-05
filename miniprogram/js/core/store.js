/*!
 * core/store.js — 本地存档 / 设置 / 最高分
 * 浏览器用 localStorage，小程序用 wx 的同步存储；两者都不可用时降级为内存。
 *
 * ⚠️ 本文件与网页版 js/core/store.js 内容一致，改动请两边同步（见 tool/sync-portable.ps1）。
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});

  var NS = 'fp.fruitpuzzle.v1.';

  // 存储后端：浏览器用 localStorage，小程序用 wx 的同步存储（接口保持 Storage 形状）
  var backend = (function () {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    if (typeof wx !== 'undefined' && wx && wx.setStorageSync) {
      return {
        get length() {
          try { return (wx.getStorageInfoSync().keys || []).length; } catch (e) { return 0; }
        },
        key: function (i) {
          try { return (wx.getStorageInfoSync().keys || [])[i] || null; } catch (e) { return null; }
        },
        getItem: function (k) {
          try {
            var v = wx.getStorageSync(k);
            return v === '' || v === undefined ? null : v;
          } catch (e) { return null; }
        },
        setItem: function (k, v) { wx.setStorageSync(k, v); },
        removeItem: function (k) { try { wx.removeStorageSync(k); } catch (e) { /* noop */ } }
      };
    }
    return null;
  })();

  var memory = {};
  var available = (function () {
    if (!backend) return false;
    try {
      var k = NS + '__probe';
      backend.setItem(k, '1');
      backend.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();

  function storageKeys() {
    var keys = [];
    if (!backend) return keys;
    try {
      for (var i = 0; i < backend.length; i++) {
        var k = backend.key(i);
        if (k) keys.push(k);
      }
    } catch (e) { /* noop */ }
    return keys;
  }

  var DEFAULTS = {
    lang: null,
    theme: 'auto',
    sound: true,
    music: false,
    haptics: false,
    hintMoves: true,
    speed: 'normal'
  };

  var data = {
    settings: Object.assign({}, DEFAULTS),
    best: { '2048': 0, match3: 0, memory: 0 },
    stats: { plays: 0, clears: 0, lastPlayed: 0, totalScore: 0 },
    saves: {}
  };

  function readRaw() {
    var out = {};
    if (!available) return Object.assign(out, memory);
    storageKeys().forEach(function (key) {
      if (key.indexOf(NS) === 0) out[key.slice(NS.length)] = backend.getItem(key);
    });
    return out;
  }

  function load() {
    var raw = readRaw();
    var bag = {};
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      try { bag[k] = JSON.parse(v); } catch (e) { bag[k] = v; }
    });
    // 兼容：设置逐项合并，避免新增字段丢失
    if (bag.settings && typeof bag.settings === 'object') {
      data.settings = Object.assign({}, DEFAULTS, bag.settings);
    }
    if (bag.best && typeof bag.best === 'object') {
      data.best = Object.assign(data.best, bag.best);
    }
    if (bag.stats && typeof bag.stats === 'object') {
      data.stats = Object.assign(data.stats, bag.stats);
    }
    if (bag.saves && typeof bag.saves === 'object') {
      data.saves = bag.saves;
    }
    return data;
  }

  function persist(key, value) {
    var k = NS + key;
    var v = JSON.stringify(value);
    if (available) {
      try { backend.setItem(k, v); return true; }
      catch (e) { FP.util.logErr('store.set', e); return false; }
    }
    memory[k] = v;
    return true;
  }

  /* ---------------- 分享码编解码（自带 base64，不依赖 btoa，小程序可用） ---------------- */

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6)); out.push(0x80 | (c & 0x3f)); }
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | (cp >> 18)); out.push(0x80 | ((cp >> 12) & 0x3f));
        out.push(0x80 | ((cp >> 6) & 0x3f)); out.push(0x80 | (cp & 0x3f));
      } else { out.push(0xe0 | (c >> 12)); out.push(0x80 | ((c >> 6) & 0x3f)); out.push(0x80 | (c & 0x3f)); }
    }
    return out;
  }

  function bytesUtf8(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length;) {
      var b = bytes[i++];
      if (b < 0x80) out += String.fromCharCode(b);
      else if (b < 0xe0) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
      else if (b < 0xf0) {
        out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
      } else {
        var cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      }
    }
    return out;
  }

  function b64encode(str) {
    var bytes = utf8Bytes(str);
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      out += B64[b0 >> 2];
      out += B64[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
      out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
      out += b2 === undefined ? '=' : B64[b2 & 63];
    }
    return out;
  }

  function b64decode(str) {
    var clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
    var bytes = [];
    for (var i = 0; i < clean.length; i += 4) {
      var n0 = B64.indexOf(clean[i]);
      var n1 = B64.indexOf(clean[i + 1]);
      var n2 = clean[i + 2] ? B64.indexOf(clean[i + 2]) : -1;
      var n3 = clean[i + 3] ? B64.indexOf(clean[i + 3]) : -1;
      if (n0 < 0 || n1 < 0) break;
      bytes.push((n0 << 2) | (n1 >> 4));
      if (n2 >= 0) bytes.push(((n1 & 15) << 4) | (n2 >> 2));
      if (n3 >= 0) bytes.push(((n2 & 3) << 6) | n3);
    }
    return bytesUtf8(bytes);
  }

  var store = {
    NS: NS,
    available: available,
    load: load,

    get: function (key, fallback) {
      var keys = key.split('.');
      var node = data;
      for (var i = 0; i < keys.length; i++) {
        if (node == null) return fallback;
        node = node[keys[i]];
      }
      return node === undefined ? fallback : node;
    },

    set: function (key, value) {
      if (key === 'lang' && value == null) {
        data.settings.lang = null;
        persist('settings', data.settings);
        return value;
      }
      var keys = key.split('.');
      var node = data;
      for (var i = 0; i < keys.length - 1; i++) {
        if (typeof node[keys[i]] !== 'object' || node[keys[i]] === null) node[keys[i]] = {};
        node = node[keys[i]];
      }
      node[keys[keys.length - 1]] = value;
      if (keys[0] === 'settings') persist('settings', data.settings);
      else if (keys[0] === 'best') persist('best', data.best);
      else if (keys[0] === 'stats') persist('stats', data.stats);
      else if (keys[0] === 'saves') persist('saves', data.saves);
      return value;
    },

    settings: function () { return data.settings; },
    bestOf: function (mode) { return data.best[mode] || 0; },
    setBest: function (mode, score) {
      var prev = store.bestOf(mode);
      if (score > prev) { store.set('best.' + mode, score); return true; }
      return false;
    },
    stats: function () { return data.stats; },
    bump: function (key, by) {
      data.stats[key] = (data.stats[key] || 0) + (by == null ? 1 : by);
      persist('stats', data.stats);
      return data.stats[key];
    },

    /* ---- 单局进度存档（跨终端可分享） ---- */
    saveGame: function (mode, snapshot) {
      data.saves[mode] = { at: Date.now(), state: snapshot };
      persist('saves', data.saves);
      return true;
    },
    loadGame: function (mode) {
      var s = data.saves[mode];
      return s && s.state ? s : null;
    },
    clearGame: function (mode) {
      if (data.saves[mode]) {
        delete data.saves[mode];
        persist('saves', data.saves);
      }
    },
    hasAnySave: function () {
      return Object.keys(data.saves).some(function (k) {
        return data.saves[k] && data.saves[k].state;
      });
    },

    resetAll: function () {
      if (available) {
        storageKeys().forEach(function (key) {
          if (key.indexOf(NS) === 0) { try { backend.removeItem(key); } catch (e) { /* noop */ } }
        });
      }
      memory = {};
      data.settings = Object.assign({}, DEFAULTS);
      data.best = { '2048': 0, match3: 0, memory: 0 };
      data.stats = { plays: 0, clears: 0, lastPlayed: 0, totalScore: 0 };
      data.saves = {};
      return data;
    },

    /* ---- 战绩分享（编码进链接 / 页面参数，可跨设备打开） ---- */
    encodeShare: function (mode, score) {
      var payload = {
        m: mode,
        s: Math.round(score || 0) * 1000,
        b: Math.round(store.bestOf(mode) * 1000),
        t: Math.floor(Date.now() / 1000)
      };
      var json = JSON.stringify(payload);
      var b64 = '';
      try { b64 = b64encode(json); }
      catch (e) { b64 = ''; }
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    decodeShare: function (code) {
      if (!code) return null;
      try {
        var b64 = code.replace(/-/g, '+').replace(/_/g, '/');
        var json = b64decode(b64);
        var obj = JSON.parse(json);
        if (!obj || !obj.m) return null;
        obj.s = (obj.s || 0) / 1000;
        obj.b = (obj.b || 0) / 1000;
        return obj;
      } catch (e) { return null; }
    },

    /* ---- 自检：分享码编解码往返（控制台可跑 FP.store.selfTest()） ---- */
    selfTest: function () {
      var cases = [
        { mode: '2048', score: 0 },
        { mode: 'match3', score: 1234 },
        { mode: 'memory', score: 99999.6 }
      ];
      var results = [];
      var ok = true;
      cases.forEach(function (c) {
        var code = store.encodeShare(c.mode, c.score);
        var back = store.decodeShare(code);
        var expect = Math.round(c.score);
        var good = !!back && back.m === c.mode && Math.round(back.s) === expect;
        if (!good) ok = false;
        results.push({ input: c.mode + '/' + c.score, code: code, back: back, pass: good });
      });
      return { ok: ok, results: results };
    },

    /* ---- 导入/导出（用于跨终端同步） ---- */
    exportAll: function () {
      return JSON.stringify({ v: 1, at: Date.now(), data: data });
    },
    importAll: function (text) {
      try {
        var parsed = JSON.parse(text);
        var incoming = parsed && parsed.data ? parsed.data : parsed;
        if (!incoming || typeof incoming !== 'object') return false;
        if (incoming.settings) store.set('settings', Object.assign({}, DEFAULTS, incoming.settings));
        if (incoming.best) store.set('best', Object.assign({ '2048': 0, match3: 0, memory: 0 }, incoming.best));
        if (incoming.stats) store.set('stats', Object.assign({ plays: 0, clears: 0, lastPlayed: 0, totalScore: 0 }, incoming.stats));
        if (incoming.saves) store.set('saves', incoming.saves);
        return true;
      } catch (e) { return false; }
    }
  };

  FP.store = store;
  load();
})(typeof window !== 'undefined' ? window
  : (typeof GameGlobal !== 'undefined' ? GameGlobal
    : (typeof globalThis !== 'undefined' ? globalThis : this)));
