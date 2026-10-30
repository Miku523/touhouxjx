// 首绘门控 DOM 快照 v2（页面侧，返回 JSON 字符串）
(function () {
  if (!document.body) return JSON.stringify({ ready: document.readyState, body: false });
  var cs = function (el) { return el ? getComputedStyle(el) : null; };
  var box = function (el) { if (!el) return null; var r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  var q = function (s) { return document.querySelector(s); };
  var inView = function (r) { return !!r && r.width > 2 && r.height > 2 && r.bottom > -40 && r.top < innerHeight + 40 && r.right > -40 && r.left < innerWidth + 40; };
  var vis = function (el) { if (!el) return false; var c = cs(el); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.02 && inView(el.getBoundingClientRect()); };
  var tx = function (el, n) { return el ? String(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, n || 160) : ''; };
  var kids = [].slice.call(document.querySelectorAll('#ui > *')).map(function (e) {
    var c = cs(e), r = e.getBoundingClientRect();
    return { id: e.id || '', cls: String(e.className || '').slice(0, 40), disp: c.display, vis: vis(e), r: box(e), tx: tx(e, 90) };
  });
  var covers = [].slice.call(document.querySelectorAll('body *')).filter(function (e) {
    var c = cs(e); if (c.display === 'none' || c.visibility === 'hidden') return false;
    if (c.position !== 'fixed' && c.position !== 'absolute') return false;
    var r = e.getBoundingClientRect();
    return r.width >= innerWidth * 0.85 && r.height >= innerHeight * 0.85;
  }).map(function (e) { return { id: e.id || '', cls: String(e.className || '').slice(0, 28), bg: String(cs(e).backgroundColor), bgi: String(cs(e).backgroundImage).slice(0, 40), z: cs(e).zIndex }; });
  var hud = q('#hud'), boot = q('#boot'), bct = q('#bossCardTimer'), panel = q('#hks-boot-error'), hint = q('#hks-boot-hint'), ov = q('#overlay');
  var st = null;
  try { st = (typeof window.__hksBootState === 'function') ? window.__hksBootState() : null; } catch (e) { st = { err: String(e) }; }
  return JSON.stringify({
    ready: document.readyState, t: Math.round(performance.now()),
    htmlClass: document.documentElement.className,
    cssClass: document.documentElement.classList.contains('css-ready'),
    hksClass: document.documentElement.classList.contains('hks-ready'),
    state: st,
    links: [].slice.call(document.querySelectorAll('link[rel=stylesheet]')).map(function (l) { return { href: (l.getAttribute('href') || '').split('/').pop().slice(0, 70), media: l.media, sheet: !!l.sheet }; }),
    ui: kids,
    hud: hud ? { disp: cs(hud).display, vis: vis(hud), r: box(hud), tx: tx(hud, 140) } : null,
    boot: boot ? { disp: cs(boot).display, vis: vis(boot), r: box(boot), bg: String(cs(boot).backgroundColor), bgi: String(cs(boot).backgroundImage).slice(0, 60), logo: (boot.querySelector('.boot-logo') ? cs(boot.querySelector('.boot-logo')).fontSize : null), tx: tx(boot, 120) } : null,
    panel: panel ? { exists: true, disp: cs(panel).display, vis: vis(panel), r: box(panel), tx: tx(panel, 300), btns: [].slice.call(panel.querySelectorAll('button')).map(function (b) { return tx(b, 30); }) } : { exists: false },
    hint: hint ? { exists: true, disp: cs(hint).display, vis: vis(hint), r: box(hint), tx: tx(hint, 120) } : { exists: false },
    overlay: ov ? { disp: cs(ov).display, vis: vis(ov), cls: String(ov.className).slice(0, 60) } : null,
    bct: bct ? { disp: cs(bct).display, vis: vis(bct), tx: tx(bct, 80) } : null,
    covers: covers,
    canvas: box(q('#game')),
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    viewport: { w: innerWidth, h: innerHeight },
    game: window.__game ? String(window.__game.state) : null,
    bodyText: tx(document.body, 240),
    errors: window.__bp ? window.__bp.errors.slice(-8) : []
  });
})();
