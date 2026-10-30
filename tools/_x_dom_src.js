// 页面侧 DOM 快照（求值返回 JSON 字符串）—— 纯 IIFE，无模板串
(function () {
  var cs = function (el) { return el ? getComputedStyle(el) : null; };
  var box = function (el) { if (!el) return null; var r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  var q = function (s) { return document.querySelector(s); };
  var vis = function (el) { if (!el) return false; var c = cs(el); var r = el.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.02 && r.width > 2 && r.height > 2; };
  var links = [].slice.call(document.querySelectorAll('link[rel=stylesheet]')).map(function (l) {
    var rules = null; try { rules = l.sheet ? l.sheet.cssRules.length : null; } catch (e) { rules = 'x'; }
    return { href: (l.getAttribute('href') || '').split('/').pop(), media: l.media, sheet: !!l.sheet, rules: rules };
  });
  var hiddenVisible = [].slice.call(document.querySelectorAll('.hidden')).filter(function (e) { return cs(e).display !== 'none'; }).map(function (e) { return '#' + (e.id || String(e.className).slice(0, 24)); });
  var boot = q('#boot'), hud = q('#hud'), overlay = q('#overlay'), bct = q('#bossCardTimer');
  var uiKids = [].slice.call(document.querySelectorAll('#ui > *')).filter(vis).map(function (e) { return e.id || String(e.className).slice(0, 20); });
  var bodyText = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return JSON.stringify({
    ready: document.readyState, t: Math.round(performance.now()),
    cssReady: document.documentElement.classList.contains('css-ready'),
    htmlClass: document.documentElement.className,
    links: links, hiddenVisible: hiddenVisible, uiKids: uiKids, bodyText: bodyText,
    htmlBg: cs(document.documentElement).backgroundColor,
    bodyBg: document.body ? cs(document.body).backgroundColor : null,
    colorScheme: cs(document.documentElement).colorScheme,
    boot: boot ? { cls: boot.className, disp: cs(boot).display, vis: vis(boot), z: cs(boot).zIndex, r: box(boot), bg: String(cs(boot).backgroundImage).slice(0, 48), logoFont: boot.querySelector('.boot-logo') ? cs(boot.querySelector('.boot-logo')).fontSize : null } : null,
    hud: hud ? { cls: hud.className, disp: cs(hud).display, vis: vis(hud), r: box(hud), text: (hud.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140) } : null,
    overlay: overlay ? { cls: overlay.className, disp: cs(overlay).display, vis: vis(overlay), r: box(overlay) } : null,
    bct: bct ? { disp: cs(bct).display, vis: vis(bct), mode: q('#bossCardMode') ? q('#bossCardMode').className : null, text: (bct.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) } : null,
    canvas: box(q('#game')),
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    viewport: { w: innerWidth, h: innerHeight },
    game: window.__game ? window.__game.state : null,
    errors: window.__bp ? window.__bp.errors.slice(-6) : []
  });
})();
