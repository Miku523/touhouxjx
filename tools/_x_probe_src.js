// 页面侧探针（最早注入）—— 纯 IIFE，无模板串。注意：脚本可能在 documentElement 存在之前运行，
// 因此观察 document 节点而不是 document.documentElement，并用 40ms 轮询兜底。
(function () {
  var now = function () { return Math.round(performance.now()); };
  if (window.__bp) { try { window.__bp.errors.push({ t: now(), msg: 'probe re-ran' }); } catch (e) {} return; }
  var p = (window.__bp = { t0: now(), cssReadyAt: null, realCssAt: null, gameAt: null, bootGoneAt: null, linkMedia: [], errors: [] });
  function mark() {
    try {
      var de = document.documentElement;
      if (de && p.cssReadyAt === null && de.classList.contains('css-ready')) p.cssReadyAt = now();
      var links = [].slice.call(document.querySelectorAll('link[rel=stylesheet]'));
      if (links.length && p.realCssAt === null) {
        var n = 0;
        for (var i = 0; i < links.length; i++) if (links[i].media === 'all') n++;
        if (n === links.length) p.realCssAt = now();
      }
    } catch (e) { p.errors.push({ t: now(), msg: 'mark: ' + e.message }); }
  }
  try {
    window.addEventListener('error', function (e) {
      var el = e.target || {};
      p.errors.push({ t: now(), msg: String(e.message || e.type).slice(0, 160), src: String(el.src || el.href || '').slice(-60) });
    }, true);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var t = ms[i].target;
        if (t && t.tagName === 'LINK' && t.rel === 'stylesheet' && t.media === 'all') {
          p.linkMedia.push({ t: now(), href: (t.getAttribute('href') || '').split('/').pop() });
        }
      }
      mark();
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class', 'media'] });
    var iv = setInterval(function () {
      mark();
      if (p.gameAt === null && window.__game) p.gameAt = now();
      var b = document.getElementById('boot');
      if (p.bootGoneAt === null && b && getComputedStyle(b).display === 'none') p.bootGoneAt = now();
      if (p.gameAt !== null && p.bootGoneAt !== null) clearInterval(iv);
    }, 40);
    document.addEventListener('DOMContentLoaded', mark);
  } catch (e) { p.errors.push({ t: now(), msg: 'probe-init: ' + e.message }); }
})();
