/*!
 * 小程序适配层 · core-mp/ui-mp.js
 * 把浏览器端的吐司 / 弹窗流程，换成小程序 setData 驱动的版本。
 */
(function () {
  'use strict';
  var FP = (typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis);
  var U = FP.util;

  /* ---------------- 吐司 ---------------- */

  function toast(page, msg, opt) {
    opt = opt || {};
    if (!page || !page.setData) return;
    var id = (page.__toastId || 0) + 1;
    page.__toastId = id;
    page.setData({
      toast: { show: true, text: msg, kind: opt.kind || '' }
    });
    setTimeout(function () {
      if (page.__toastId === id) page.setData({ toast: { show: false, text: '', kind: '' } });
    }, opt.duration || 1600);
  }

  /* ---------------- 弹窗 ---------------- */

  /**
   * 打开弹窗
   * @param {Object} page       页面实例
   * @param {Object} opt        { title, text, rows:[{label,value}], score, actions:[{id,label,kind}] }
   * @param {Object} callbacks  { actionId: fn }
   */
  function modal(page, opt, callbacks) {
    if (!page || !page.setData) return;
    page.__modalCallbacks = callbacks || {};
    page.setData({
      modal: {
        show: true,
        kind: opt.kind || '',
        title: opt.title || '',
        text: opt.text || '',
        score: opt.score == null ? '' : opt.score,
        scoreLabel: opt.scoreLabel || '',
        rows: opt.rows || [],
        actions: opt.actions || [{ id: 'close', label: '关闭', kind: 'primary' }],
        dismissible: opt.dismissible !== false
      }
    });
  }

  function closeModal(page) {
    if (!page || !page.setData) return;
    page.__modalCallbacks = null;
    page.setData({
      modal: {
        show: false, kind: '', title: '', text: '',
        score: '', scoreLabel: '', rows: [], actions: []
      }
    });
  }

  // WXML 上 bindtap="onModalAction" data-action="xxx"
  function handleAction(page, actionId) {
    var cbs = page.__modalCallbacks || {};
    var fn = cbs[actionId];
    closeModal(page);
    if (fn) { try { fn(); } catch (e) { U.logErr('modal.action', e); } }
  }

  /* ---------------- 页面文案 ---------------- */

  // 按前缀批量取词，键里的点换成下划线，方便 WXML 里 {{T['btn.start']}} 直接取值
  function text(prefixes) {
    var raw = FP.i18n.pick(prefixes);
    var out = {};
    Object.keys(raw).forEach(function (k) { out[k] = raw[k]; });
    return out;
  }

  FP.mpUI = { toast: toast, modal: modal, closeModal: closeModal, handleAction: handleAction, text: text };
})();
