(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource');
  const bootPct = document.querySelector('#boot .bm-pct b');
  return JSON.stringify({
    nav: { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), transfer: nav.transferSize, decoded: nav.decodedBodySize },
    boot: (window.__prewarmInfo || null),
    bootDone: !!window.__game,
    bootP: bootPct ? bootPct.textContent : null,
    res: res.map((r) => ({ n: r.name, d: Math.round(r.duration), start: Math.round(r.startTime), size: r.transferSize, dec: r.decodedBodySize, proto: r.nextHopProtocol, init: r.initiatorType }))
  });
})()