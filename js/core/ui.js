/*!
 * core/ui.js — HUD、弹窗、吐司、设置面板、模式卡片
 */
(function (global) {
  'use strict';
  var FP = (global.FP = global.FP || {});
  var U = FP.util;
  var el = U.el;

  var dom = {};

  function cache() {
    dom.app = U.qs('#app');
    dom.stage = U.qs('.stage');
    dom.toastWrap = U.qs('#toast-wrap');
    dom.modalRoot = U.qs('#modal-root');
    dom.modalTitle = U.qs('#modal-title');
    dom.modalBody = U.qs('#modal-body');
    dom.modalActions = U.qs('#modal-actions');
    dom.modalScrim = U.qs('#modal-scrim');
    dom.chips = [U.qs('#chip-0'), U.qs('#chip-1'), U.qs('#chip-2')];
  }

  /* ---------------- 吐司 ---------------- */

  var toastTimer = null;
  function toast(msg, opt) {
    if (!dom.toastWrap) return;
    opt = opt || {};
    var node = el('div', { class: 'toast' + (opt.kind ? ' is-' + opt.kind : ''), text: msg });
    dom.toastWrap.appendChild(node);
    global.setTimeout(function () { node.classList.add('in'); }, 10);
    global.setTimeout(function () {
      node.classList.remove('in');
      global.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
    }, opt.duration || 1600);
  }

  /* ---------------- 弹窗 ---------------- */

  var closeCurrent = null;

  function modal(opt) {
    if (!dom.modalRoot) return;
    closeModal(true);
    dom.modalTitle.textContent = opt.title || '';
    U.clear(dom.modalBody);
    if (typeof opt.body === 'string') dom.modalBody.appendChild(el('p', { class: 'modal-text', html: opt.body }));
    else if (opt.body) dom.modalBody.appendChild(opt.body);

    U.clear(dom.modalActions);
    (opt.actions || []).forEach(function (a) {
      var btn = el('button', {
        class: 'btn ' + (a.kind === 'primary' ? 'btn-primary' : a.kind === 'ghost' ? 'btn-ghost' : 'btn-soft'),
        text: a.label
      });
      btn.addEventListener('click', function () {
        if (a.keepOpen !== true) closeModal();
        if (a.onClick) a.onClick();
      });
      dom.modalActions.appendChild(btn);
    });
    if (dom.modalActions.childNodes.length === 0) dom.modalActions.hidden = true;
    else dom.modalActions.hidden = false;

    dom.modalRoot.hidden = false;
    global.requestAnimationFrame(function () { dom.modalRoot.classList.add('in'); });
    closeCurrent = typeof opt.onClose === 'function' ? opt.onClose : null;
    if (opt.dismissible !== false) {
      dom.modalScrim.onclick = function () { closeModal(); };
    } else {
      dom.modalScrim.onclick = null;
    }
    return { close: closeModal };
  }

  function closeModal(silent) {
    if (!dom.modalRoot || dom.modalRoot.hidden) { closeCurrent = null; return; }
    dom.modalRoot.classList.remove('in');
    var cb = closeCurrent;
    closeCurrent = null;
    global.setTimeout(function () {
      dom.modalRoot.hidden = true;
      if (!silent && cb) cb();
    }, 180);
  }

  function isModalOpen() {
    return dom.modalRoot && !dom.modalRoot.hidden;
  }

  /* ---------------- HUD ---------------- */

  var chipState = [];

  function setChips(list) {
    for (var i = 0; i < 3; i++) {
      var node = dom.chips[i];
      var def = list[i];
      if (!node) continue;
      if (!def) { node.hidden = true; continue; }
      node.hidden = false;
      var labelNode = node.querySelector('.chip-label');
      var valueNode = node.querySelector('.chip-value');
      if (labelNode.textContent !== def.label) labelNode.textContent = def.label;
      var text = typeof def.value === 'number' ? U.fmt(def.value) : String(def.value == null ? '' : def.value);
      if (valueNode.textContent !== text) {
        valueNode.textContent = text;
        if (chipState[i] != null) {
          valueNode.classList.remove('bump');
          // 触发重排以重启动画
          void valueNode.offsetWidth;
          valueNode.classList.add('bump');
        }
      }
      chipState[i] = text;
      node.classList.toggle('is-muted', !!def.muted);
      node.classList.toggle('is-hot', !!def.hot);
    }
  }

  /* ---------------- 模式卡片 ---------------- */

  function modeCard(mode, meta, best, onPick) {
    var card = el('button', { class: 'mode-card', 'data-mode': mode, type: 'button' }, [
      el('span', { class: 'mode-badge', text: meta.badge || '' }),
      el('span', { class: 'mode-emoji', text: meta.emoji || '🍇' }),
      el('span', { class: 'mode-text' }, [
        el('strong', { class: 'mode-name', text: meta.name }),
        el('span', { class: 'mode-desc', text: meta.desc })
      ]),
      el('span', { class: 'mode-best' }, [
        el('em', { text: FP.i18n.t('score.best') }),
        el('b', { text: U.fmt(best || 0) })
      ])
    ]);
    card.addEventListener('click', function () {
      FP.audio.unlock();
      onPick(mode);
    });
    return card;
  }

  /* ---------------- 设置面板 ---------------- */

  function row(label, control) {
    return el('div', { class: 'set-row' }, [
      el('span', { class: 'set-label', text: label }),
      el('span', { class: 'set-control' }, [control])
    ]);
  }

  function segmented(value, options, onPick) {
    var wrap = el('div', { class: 'segmented' });
    options.forEach(function (o) {
      var b = el('button', { class: 'seg-btn' + (o.value === value ? ' is-on' : ''), type: 'button', text: o.label });
      b.addEventListener('click', function () {
        U.qsa('.seg-btn', wrap).forEach(function (n) { n.classList.remove('is-on'); });
        b.classList.add('is-on');
        onPick(o.value);
        FP.audio.play('tap');
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function toggle(value, onChange) {
    var b = el('button', { class: 'switch' + (value ? ' is-on' : ''), type: 'button', role: 'switch', 'aria-checked': value ? 'true' : 'false' }, [
      el('span', { class: 'switch-dot' })
    ]);
    b.addEventListener('click', function () {
      var next = !b.classList.contains('is-on');
      b.classList.toggle('is-on', next);
      b.setAttribute('aria-checked', next ? 'true' : 'false');
      onChange(next);
      FP.audio.play('tap');
    });
    return b;
  }

  function openSettings(onChange) {
    var s = FP.store.settings();
    var body = el('div', { class: 'settings' });

    // 语言
    body.appendChild(row(FP.i18n.t('settings.language'), segmented(FP.i18n.get(), [
      { value: 'zh', label: '中文' },
      { value: 'en', label: 'English' }
    ], function (v) { FP.i18n.set(v); onChange && onChange('lang'); })));

    // 外观
    body.appendChild(row(FP.i18n.t('settings.theme'), segmented(s.theme, [
      { value: 'auto', label: FP.i18n.t('settings.theme.auto') },
      { value: 'light', label: FP.i18n.t('settings.theme.light') },
      { value: 'dark', label: FP.i18n.t('settings.theme.dark') }
    ], function (v) { FP.store.set('settings.theme', v); FP.theme.apply(v); onChange && onChange('theme'); })));

    // 音效
    body.appendChild(row(FP.i18n.t('settings.sound'), toggle(s.sound, function (v) {
      FP.audio.setSound(v);
      onChange && onChange('sound');
    })));

    // 音乐
    body.appendChild(row(FP.i18n.t('settings.music'), toggle(s.music, function (v) {
      FP.audio.setMusic(v);
      onChange && onChange('music');
    })));

    // 震动
    body.appendChild(row(FP.i18n.t('settings.haptics'), toggle(s.haptics, function (v) {
      FP.store.set('settings.haptics', v);
      if (v) U.vibrate(20);
      onChange && onChange('haptics');
    })));

    // 提示
    body.appendChild(row(FP.i18n.t('settings.hintMoves'), toggle(s.hintMoves, function (v) {
      FP.store.set('settings.hintMoves', v);
      onChange && onChange('hintMoves');
    })));

    // 动画速度
    body.appendChild(row(FP.i18n.t('settings.animSpeed'), segmented(s.speed, [
      { value: 'fast', label: FP.i18n.t('settings.speed.fast') },
      { value: 'normal', label: FP.i18n.t('settings.speed.normal') },
      { value: 'slow', label: FP.i18n.t('settings.speed.slow') }
    ], function (v) { FP.store.set('settings.speed', v); onChange && onChange('speed'); })));

    // 操作说明
    body.appendChild(el('div', { class: 'set-note' }, [
      el('strong', { text: FP.i18n.t('settings.controls') }),
      el('p', { text: FP.i18n.t('settings.controlsText') })
    ]));

    // 跨设备同步（导出 / 导入存档 JSON）
    var syncBtn = el('button', { class: 'btn btn-soft', text: '⇄ ' + FP.i18n.t('settings.sync') });
    syncBtn.addEventListener('click', function () { openSync(); });
    body.appendChild(el('div', { class: 'set-row is-stack' }, [syncBtn]));

    // 关于 + 清空
    body.appendChild(el('div', { class: 'set-note' }, [
      el('strong', { text: FP.i18n.t('settings.about') }),
      el('p', { text: FP.i18n.t('settings.aboutText') })
    ]));

    var resetBtn = el('button', { class: 'btn btn-danger', text: FP.i18n.t('settings.reset') });
    resetBtn.addEventListener('click', function () {
      modal({
        title: FP.i18n.t('settings.reset'),
        body: '<p>' + U.escapeHtml(FP.i18n.t('settings.resetConfirm')) + '</p>',
        actions: [
          { label: FP.i18n.t('btn.close'), kind: 'soft' },
          {
            label: FP.i18n.t('settings.reset'),
            kind: 'primary',
            onClick: function () {
              FP.store.resetAll();
              FP.theme.apply('auto');
              toast(FP.i18n.t('settings.resetDone'), { kind: 'warn' });
              onChange && onChange('reset');
            }
          }
        ]
      });
    });
    body.appendChild(el('div', { class: 'set-row is-stack' }, [resetBtn]));

    modal({
      title: FP.i18n.t('settings.title'),
      body: body,
      actions: [{ label: FP.i18n.t('btn.close'), kind: 'primary' }]
    });
  }

  /* ---------------- 玩法说明 ---------------- */

  function openHowTo(mode) {
    var body = el('div', { class: 'howto' });
    var modes = FP.modes || [];
    modes.forEach(function (m) {
      if (mode && m.id !== mode) return;
      body.appendChild(el('div', { class: 'howto-item' + (m.id === mode ? ' is-current' : '') }, [
        el('div', { class: 'howto-head' }, [
          el('span', { class: 'howto-emoji', text: m.emoji }),
          el('strong', { text: m.name })
        ]),
        el('p', { text: FP.i18n.t('mode.' + m.id + '.rules') })
      ]));
    });
    modal({
      title: FP.i18n.t('btn.howto'),
      body: body,
      actions: [{ label: FP.i18n.t('btn.close'), kind: 'primary' }]
    });
  }

  /* ---------------- 跨设备同步 ---------------- */

  function openSync() {
    var out = el('textarea', { class: 'share-url', readonly: true, text: FP.store.exportAll() });
    var inp = el('textarea', { class: 'share-url', placeholder: FP.i18n.t('settings.syncHint') });
    var save = el('button', { class: 'btn btn-soft', text: FP.i18n.t('settings.syncImport') });
    save.addEventListener('click', function () {
      var ok = FP.store.importAll(inp.value.trim());
      if (ok) {
        toast(FP.i18n.t('settings.syncDone'), { kind: 'good' });
        closeModal();
      } else {
        toast(FP.i18n.t('settings.syncFail'), { kind: 'warn' });
      }
    });
    var copy = el('button', { class: 'btn btn-ghost', text: FP.i18n.t('btn.copy') });
    copy.addEventListener('click', function () {
      out.select();
      try { out.setSelectionRange(0, 99999); } catch (e) { /* noop */ }
      var done = function () { toast(FP.i18n.t('toast.copied'), { kind: 'good' }); };
      var fallback = function () {
        try { if (global.document.execCommand('copy')) done(); else toast(FP.i18n.t('toast.copyFail'), { kind: 'warn' }); }
        catch (e) { toast(FP.i18n.t('toast.copyFail'), { kind: 'warn' }); }
      };
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(out.value).then(done, fallback);
      } else {
        fallback();
      }
    });
    var body = el('div', { class: 'settings' }, [
      el('div', { class: 'set-note' }, [
        el('strong', { text: FP.i18n.t('settings.sync') }),
        el('p', { text: FP.i18n.t('settings.syncText') })
      ]),
      out,
      el('div', { class: 'set-row is-stack' }, [copy]),
      inp,
      el('div', { class: 'set-row is-stack' }, [save])
    ]);
    modal({ title: FP.i18n.t('settings.sync'), body: body, actions: [{ label: FP.i18n.t('btn.close'), kind: 'soft' }] });
  }

  FP.ui = {
    init: cache,
    toast: toast,
    modal: modal,
    closeModal: closeModal,
    isModalOpen: isModalOpen,
    setChips: setChips,
    modeCard: modeCard,
    openSettings: openSettings,
    openHowTo: openHowTo,
    dom: dom
  };
})(window);
