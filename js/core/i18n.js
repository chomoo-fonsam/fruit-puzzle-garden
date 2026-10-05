/*!
 * core/i18n.js — 中英双语词典与切换（适配不同地区设备）
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});

  var DICT = {
    zh: {
      'app.name': '果园谜题',
      'app.tagline': 'Fruit Puzzle Garden · 三种水果益智玩法',
      'nav.home': '首页',
      'nav.pause': '暂停',
      'nav.sound': '音效',
      'chip.score': '得分',
      'chip.best': '最高',
      'chip.moves': '步数',
      'chip.time': '时间',
      'chip.level': '关卡',
      'btn.start': '开始',
      'btn.continue': '继续上次',
      'btn.undo': '撤销',
      'btn.hint': '提示',
      'btn.shuffle': '洗牌',
      'btn.restart': '重开',
      'btn.settings': '设置',
      'btn.howto': '玩法',
      'btn.share': '分享战绩',
      'btn.resume': '继续',
      'btn.retry': '再来一局',
      'btn.home': '回到首页',
      'btn.close': '关闭',
      'btn.copy': '复制链接',
      'btn.fullscreen': '全屏',
      'mode.2048.name': '果园 2048',
      'mode.2048.desc': '滑动合并水果，冲击大果王',
      'mode.2048.subtitle': '滑动 / 方向键 · 合并同种水果',
      'mode.2048.rules': '滑动 / 方向键让水果整体移动，相同水果相撞即合并。合成 🍎 大果王即通关，方块填满且无法移动则结束。',
      'mode.match3.name': '水果消消乐',
      'mode.match3.desc': '交换相邻水果，三连即消',
      'mode.match3.subtitle': '60 秒 · 交换相邻水果凑三连',
      'mode.match3.rules': '点击或拖动交换相邻水果，凑成 3 个以上同种水果即可消除；连锁消除有加成，60 秒内冲击高分。',
      'mode.memory.name': '记忆果园',
      'mode.memory.desc': '翻牌配对，考验记忆力',
      'mode.memory.subtitle': '翻牌配对 · 步数越少分数越高',
      'mode.memory.rules': '翻开两张卡片，图案相同即配对成功；用最少的步数和时间找出全部配对。',
      'hud.combo': '连锁',
      'hud.streak': '连击',
      'hud.pairs': '配对',
      'hud.timeup': '时间到',
      'hint.2048': '滑动屏幕或使用方向键 / WASD 移动',
      'hint.match3': '点击两个相邻水果交换，或拖动交换',
      'hint.memory': '点击卡片翻开，找到全部配对',
      'toast.needMove': '无法移动，试试其它方向',
      'toast.swapInvalid': '这样换不出消除，换个位置试试（可点💡提示）',
      'toast.swapSameKind': '两个同类水果换来换去不会产生三连，要和不同水果交换哦',
      'toast.saved': '进度已保存',
      'toast.loaded': '已恢复上次进度',
      'toast.copied': '链接已复制，可在其它设备打开继续',
      'toast.copyFail': '复制失败，请手动复制地址栏链接',
      'toast.noUndo': '没有可撤销的操作了',
      'toast.shuffled': '水果已重新摆放',
      'toast.noHint': '暂时没有可消除的位置，已自动洗牌',
      'toast.offline': '已离线，游戏可继续',
      'toast.online': '网络已恢复',
      'toast.newFruit': '解锁新水果',
      'modal.paused': '已暂停',
      'modal.pausedBody': '休息一下，果园在等你回来。',
      'modal.over': '本局结束',
      'modal.win': '恭喜通关！',
      'modal.newBest': '🎉 新纪录！',
      'modal.share': '分享战绩',
      'settings.title': '设置',
      'settings.language': '语言 / Language',
      'settings.theme': '外观',
      'settings.theme.auto': '跟随系统',
      'settings.theme.light': '浅色',
      'settings.theme.dark': '深色',
      'settings.sound': '音效',
      'settings.music': '背景音乐',
      'settings.haptics': '震动反馈',
      'settings.assist': '辅助',
      'settings.hintMoves': '显示可消除提示',
      'settings.animSpeed': '动画速度',
      'settings.speed.fast': '快',
      'settings.speed.normal': '标准',
      'settings.speed.slow': '慢',
      'settings.on': '开',
      'settings.off': '关',
      'settings.reset': '清空所有数据',
      'settings.resetConfirm': '确定要清空全部进度与设置吗？此操作不可恢复。',
      'settings.resetDone': '数据已清空',
      'settings.controls': '操作方式',
      'settings.controlsText': '触屏：滑动、点击、拖动 · 键盘：方向键 / WASD / P 暂停 / U 撤销 / H 提示 / Esc 返回',
      'settings.about': '关于',
      'settings.aboutText': '纯前端实现，无依赖、可离线；进度保存在本机浏览器中。',
      'settings.sync': '跨设备同步',
      'settings.syncText': '复制下面这段存档码，粘贴到另一台设备的"导入"框里，即可带着最高分和进度继续玩。',
      'settings.syncHint': '在此粘贴存档码后点"导入存档"',
      'settings.syncImport': '导入存档',
      'settings.syncDone': '存档已导入',
      'settings.syncFail': '存档码无法识别，请检查后重试',
      'score.best': '最高分',
      'score.moves': '步数',
      'score.time': '用时',
      'score.pairs': '配对',
      'score.combo': '最高连锁',
      'score.level': '最大水果',
      'share.title': '我的果园战绩',
      'share.body': '把链接发到手机或平板，即可继续挑战同一模式。',
      'offline.badge': '离线可用',
      'a11y.board': '游戏面板'
    },
    en: {
      'app.name': 'Fruit Puzzle Garden',
      'app.tagline': 'Three fruity brain teasers · one garden',
      'nav.home': 'Home',
      'nav.pause': 'Pause',
      'nav.sound': 'Sound',
      'chip.score': 'Score',
      'chip.best': 'Best',
      'chip.moves': 'Moves',
      'chip.time': 'Time',
      'chip.level': 'Level',
      'btn.start': 'Play',
      'btn.continue': 'Continue',
      'btn.undo': 'Undo',
      'btn.hint': 'Hint',
      'btn.shuffle': 'Shuffle',
      'btn.restart': 'Restart',
      'btn.settings': 'Settings',
      'btn.howto': 'How to play',
      'btn.share': 'Share score',
      'btn.resume': 'Resume',
      'btn.retry': 'Play again',
      'btn.home': 'Back home',
      'btn.close': 'Close',
      'btn.copy': 'Copy link',
      'btn.fullscreen': 'Fullscreen',
      'mode.2048.name': 'Orchard 2048',
      'mode.2048.desc': 'Merge fruit, raise the big apple',
      'mode.2048.subtitle': 'Swipe / arrow keys · merge matching fruit',
      'mode.2048.rules': 'Swipe or use arrow keys to slide every fruit. Equal fruit merge on contact. Reach 🍎 to win; the run ends when the board is full and nothing can move.',
      'mode.match3.name': 'Fruit Crush',
      'mode.match3.desc': 'Swap neighbours, match three',
      'mode.match3.subtitle': '60 seconds · swap to line up three',
      'mode.match3.rules': 'Tap or drag to swap adjacent fruit. Line up 3 or more of a kind to clear them. Cascades multiply your score in a 60 second run.',
      'mode.memory.name': 'Memory Orchard',
      'mode.memory.desc': 'Flip cards, find the pairs',
      'mode.memory.subtitle': 'Flip and pair · fewer moves score higher',
      'mode.memory.rules': 'Flip two cards at a time. Matching pairs stay open. Clear the whole orchard in as few moves as you can.',
      'hud.combo': 'Combo',
      'hud.streak': 'Streak',
      'hud.pairs': 'Pairs',
      'hud.timeup': 'Time up',
      'hint.2048': 'Swipe the board or use arrow keys / WASD',
      'hint.match3': 'Tap two neighbours to swap, or drag across them',
      'hint.memory': 'Tap a card to flip it and find every pair',
      'toast.needMove': 'No move that way — try another',
      'toast.swapInvalid': 'That swap makes no match — try another spot (tap 💡 for a hint)',
      'toast.swapSameKind': 'Swapping two of the same fruit can never make a line — swap different fruit',
      'toast.saved': 'Progress saved',
      'toast.loaded': 'Previous run restored',
      'toast.copied': 'Link copied — open it on any device',
      'toast.copyFail': 'Copy failed, please copy the URL manually',
      'toast.noUndo': 'Nothing left to undo',
      'toast.shuffled': 'Fruit rearranged',
      'toast.noHint': 'No match left — board auto-shuffled',
      'toast.offline': 'Offline — the game keeps working',
      'toast.online': 'Back online',
      'toast.newFruit': 'New fruit unlocked',
      'modal.paused': 'Paused',
      'modal.pausedBody': 'Take a breath, the orchard waits for you.',
      'modal.over': 'Run over',
      'modal.win': 'You did it!',
      'modal.newBest': '🎉 New best!',
      'modal.share': 'Share score',
      'settings.title': 'Settings',
      'settings.language': 'Language / 语言',
      'settings.theme': 'Appearance',
      'settings.theme.auto': 'System',
      'settings.theme.light': 'Light',
      'settings.theme.dark': 'Dark',
      'settings.sound': 'Sound effects',
      'settings.music': 'Background music',
      'settings.haptics': 'Haptics',
      'settings.assist': 'Assists',
      'settings.hintMoves': 'Show available matches',
      'settings.animSpeed': 'Animation speed',
      'settings.speed.fast': 'Fast',
      'settings.speed.normal': 'Normal',
      'settings.speed.slow': 'Slow',
      'settings.on': 'On',
      'settings.off': 'Off',
      'settings.reset': 'Erase all data',
      'settings.resetConfirm': 'Erase every save and setting? This cannot be undone.',
      'settings.resetDone': 'All data erased',
      'settings.controls': 'Controls',
      'settings.controlsText': 'Touch: swipe, tap, drag · Keyboard: arrows / WASD / P pause / U undo / H hint / Esc back',
      'settings.about': 'About',
      'settings.aboutText': 'Zero dependencies, fully offline capable. Progress is stored in this browser.',
      'settings.sync': 'Move saves between devices',
      'settings.syncText': 'Copy the save code below and paste it into the import box on another device to carry your best scores and progress over.',
      'settings.syncHint': 'Paste a save code here, then tap Import',
      'settings.syncImport': 'Import save',
      'settings.syncDone': 'Save imported',
      'settings.syncFail': 'That save code could not be read',
      'score.best': 'Best',
      'score.moves': 'Moves',
      'score.time': 'Time',
      'score.pairs': 'Pairs',
      'score.combo': 'Best combo',
      'score.level': 'Biggest fruit',
      'share.title': 'My orchard score',
      'share.body': 'Send the link to a phone or tablet to keep playing the same mode.',
      'offline.badge': 'Works offline',
      'a11y.board': 'Game board'
    }
  };

  var current = 'zh';

  function detect() {
    var saved = FP.store && FP.store.get('lang', null);
    if (saved && DICT[saved]) return saved;
    var nav = global.navigator || {};
    var langs = nav.languages && nav.languages.length ? nav.languages : [nav.language || ''];
    for (var i = 0; i < langs.length; i++) {
      var tag = String(langs[i] || '').toLowerCase();
      if (tag.indexOf('zh') === 0) return 'zh';
      if (tag.indexOf('en') === 0) return 'en';
    }
    return 'zh';
  }

  function t(key, fallback) {
    var table = DICT[current] || DICT.zh;
    if (table[key] != null) return table[key];
    if (DICT.zh[key] != null) return DICT.zh[key];
    return fallback != null ? fallback : key;
  }

  function setLang(lang) {
    if (!DICT[lang]) return;
    current = lang;
    // 浏览器改 <html lang>，小程序没有 DOM（由页面自己刷新文案）
    if (FP.util && FP.util.root && FP.util.root.setAttribute) {
      FP.util.root.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    }
    if (FP.store) FP.store.set('lang', lang);
    if (FP.bus) FP.bus.emit('lang', lang);
    if (FP.onLangChange) FP.onLangChange(lang);
  }

  function getLang() { return current; }
  function langs() { return Object.keys(DICT); }

  // 应用静态 DOM 上的 data-i18n（小程序不需要，保留同名空实现便于复用）
  function applyDom(scope) {
    if (!FP.util || !FP.util.qsa) return;
    var nodes = FP.util.qsa('[data-i18n]', scope || (typeof document !== 'undefined' ? document : null));
    nodes.forEach(function (n) {
      var key = n.getAttribute('data-i18n');
      var val = t(key);
      if (n.hasAttribute('data-i18n-attr')) n.setAttribute(n.getAttribute('data-i18n-attr'), val);
      else n.textContent = val;
    });
  }

  // 按 key 前缀批量取词，方便小程序页面一次性拿到本页需要的全部文案
  function pick(prefixes) {
    var out = {};
    var list = Array.isArray(prefixes) ? prefixes : [prefixes];
    var table = DICT[current] || DICT.zh;
    Object.keys(table).forEach(function (key) {
      for (var i = 0; i < list.length; i++) {
        if (key.indexOf(list[i]) === 0) { out[key] = table[key]; break; }
      }
    });
    return out;
  }

  FP.i18n = {
    t: t, set: setLang, get: getLang, detect: detect,
    langs: langs, dict: DICT, applyDom: applyDom, pick: pick,
    init: function () { setLang(detect()); }
  };
})(window);
