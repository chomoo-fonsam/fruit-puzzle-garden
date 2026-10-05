/*!
 * core/audio.js — WebAudio 程序化音效与背景音乐（零素材）
 * 首次用户手势时解锁 AudioContext；任何异常都不会影响游戏主流程。
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});

  var ctx = null;
  var master = null;
  var musicGain = null;
  var sfxGain = null;
  var unlocked = false;
  var musicTimer = null;
  var musicStep = 0;
  var SUPPORTED = typeof (global.AudioContext || global.webkitAudioContext) === 'function';

  function settings() { return FP.store ? FP.store.settings() : { sound: true, music: false }; }

  function ensure() {
    if (!SUPPORTED) return null;
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(master);
      return ctx;
    } catch (e) {
      FP.util.logErr('audio.ensure', e);
      ctx = null;
      return null;
    }
  }

  function unlock() {
    var c = ensure();
    if (!c) return;
    try {
      if (c.state === 'suspended' && c.resume) c.resume();
      unlocked = true;
    } catch (e) { /* noop */ }
  }

  function env(node, t0, a, d, peak) {
    var g = node.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  // 单音：type 波形，freq 频率，dur 时长，vol 音量，slideTo 滑音目标
  function tone(opt) {
    if (!settings().sound) return;
    var c = ensure();
    if (!c || !unlocked) return;
    try {
      var t0 = c.currentTime + (opt.delay || 0);
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = opt.type || 'sine';
      osc.frequency.setValueAtTime(opt.freq, t0);
      if (opt.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, opt.slideTo), t0 + (opt.dur || 0.2));
      }
      env(gain, t0, opt.attack || 0.008, opt.dur || 0.18, (opt.vol == null ? 0.5 : opt.vol));
      osc.connect(gain);
      gain.connect(opt.bus === 'music' ? musicGain : sfxGain);
      osc.start(t0);
      osc.stop(t0 + (opt.dur || 0.2) + (opt.attack || 0.008) + 0.05);
    } catch (e) { FP.util.logErr('audio.tone', e); }
  }

  function noise(opt) {
    if (!settings().sound) return;
    var c = ensure();
    if (!c || !unlocked) return;
    try {
      var dur = opt.dur || 0.16;
      var frames = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, frames, c.sampleRate);
      var ch = buf.getChannelData(0);
      for (var i = 0; i < frames; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.2);
      }
      var src = c.createBufferSource();
      src.buffer = buf;
      var filter = c.createBiquadFilter();
      filter.type = opt.filter || 'bandpass';
      filter.frequency.value = opt.freq || 900;
      filter.Q.value = opt.q || 0.9;
      var gain = c.createGain();
      gain.gain.value = opt.vol == null ? 0.32 : opt.vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      src.start();
    } catch (e) { FP.util.logErr('audio.noise', e); }
  }

  // 音阶（五声音阶，听感柔和，符合"果园"氛围）
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

  var SFX = {
    tap: function () { tone({ type: 'triangle', freq: 660, dur: 0.06, vol: 0.22, slideTo: 720 }); },
    move: function () { noise({ freq: 420, dur: 0.1, vol: 0.14, filter: 'lowpass' }); },
    merge: function (level) {
      var f = PENTA[FP.util.clamp(level || 0, 0, PENTA.length - 1)];
      tone({ type: 'sine', freq: f, dur: 0.2, vol: 0.34 });
      tone({ type: 'triangle', freq: f * 2, dur: 0.14, vol: 0.14, delay: 0.04 });
    },
    pop: function (chain) {
      var f = PENTA[FP.util.clamp(2 + (chain || 0), 0, PENTA.length - 1)];
      tone({ type: 'sine', freq: f, dur: 0.16, vol: 0.3, slideTo: f * 1.5 });
      noise({ freq: 1400, dur: 0.12, vol: 0.16 });
    },
    flip: function () { tone({ type: 'triangle', freq: 880, dur: 0.09, vol: 0.2, slideTo: 1180 }); },
    pair: function (n) {
      var f = PENTA[FP.util.clamp(3 + (n || 0), 0, PENTA.length - 1)];
      tone({ type: 'sine', freq: f, dur: 0.22, vol: 0.3 });
      tone({ type: 'sine', freq: f * 1.25, dur: 0.3, vol: 0.18, delay: 0.07 });
    },
    error: function () { tone({ type: 'sawtooth', freq: 180, dur: 0.16, vol: 0.16, slideTo: 120 }); },
    warn: function () { tone({ type: 'square', freq: 300, dur: 0.12, vol: 0.12, slideTo: 240 }); },
    win: function () {
      [0, 1, 2, 4, 5].forEach(function (idx, i) {
        tone({ type: 'sine', freq: PENTA[idx], dur: 0.42, vol: 0.3, delay: i * 0.11 });
      });
    },
    over: function () {
      [4, 3, 2, 0].forEach(function (idx, i) {
        tone({ type: 'sine', freq: PENTA[idx], dur: 0.36, vol: 0.26, delay: i * 0.15 });
      });
    },
    tick: function () { tone({ type: 'square', freq: 1200, dur: 0.04, vol: 0.09 }); }
  };

  /* ---- 背景音乐：缓慢琶音 + 低音铺底，循环生成 ---- */
  var CHORDS = [
    [261.63, 329.63, 392.0], // C
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [196.0, 246.94, 293.66]  // G
  ];

  function musicTick() {
    if (!settings().music) return;
    var chord = CHORDS[musicStep % CHORDS.length];
    var note = chord[Math.floor(Math.random() * chord.length)];
    tone({ bus: 'music', type: 'sine', freq: note * 2, dur: 1.6, vol: 0.16, attack: 0.35 });
    if (musicStep % 4 === 0) {
      tone({ bus: 'music', type: 'triangle', freq: chord[0] / 2, dur: 3.2, vol: 0.18, attack: 0.6 });
    }
    if (musicStep % 8 === 3) {
      tone({ bus: 'music', type: 'sine', freq: note * 3, dur: 1.0, vol: 0.06, attack: 0.4 });
    }
    musicStep++;
  }

  function startMusic() {
    var c = ensure();
    if (!c || !unlocked) return;
    try {
      musicGain.gain.cancelScheduledValues(c.currentTime);
      musicGain.gain.setTargetAtTime(0.22, c.currentTime, 1.2);
    } catch (e) { /* noop */ }
    if (!musicTimer) {
      musicTick();
      musicTimer = global.setInterval(musicTick, 1700);
    }
  }

  function stopMusic() {
    if (musicTimer) { global.clearInterval(musicTimer); musicTimer = null; }
    if (ctx && musicGain) {
      try { musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); } catch (e) { /* noop */ }
    }
  }

  function applySettings() {
    var s = settings();
    if (s.music) startMusic(); else stopMusic();
  }

  function setSound(on) {
    FP.store.set('settings.sound', !!on);
    if (on) { unlock(); SFX.tap(); }
  }

  function setMusic(on) {
    FP.store.set('settings.music', !!on);
    applySettings();
  }

  FP.audio = {
    unlock: unlock,
    sfx: SFX,
    supported: SUPPORTED,
    play: function (name, arg) {
      if (!SUPPORTED || !settings().sound) return;
      var fn = SFX[name];
      if (fn) { try { fn(arg); } catch (e) { FP.util.logErr('audio.play', e); } }
    },
    setSound: setSound,
    setMusic: setMusic,
    applySettings: applySettings,
    stopMusic: stopMusic,
    get enabled() { return !!settings().sound && SUPPORTED; },
    get ready() { return !!ctx && unlocked; }
  };
})(window);
