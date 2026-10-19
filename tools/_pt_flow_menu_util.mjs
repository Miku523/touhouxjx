/**
 * flow-menu 反向试玩共用工具（只读游戏状态 / 模拟输入 / 截图 / 布局检查）
 * 不修改 tools/_pt_core.mjs 与 src/**。
 */
import { sleep } from './_pt_core.mjs';

export const DIR = '_pt/flow_menu';
export const TITLE_OK = 'window.__game && window.__game.state === "menu" && !document.getElementById("overlay").classList.contains("hidden")';

export function shot(T, name) {
  return T.shot(`${DIR}/${name}`);
}

export async function waitMenu(T, timeout = 20000) {
  const ok = await T.waitFor(TITLE_OK, timeout, 100);
  if (!ok) throw new Error('等待标题页超时');
  await sleep(250);
  return ok;
}

export async function bootFresh(T, { query = '?seed=12345', tries = 3 } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      await T.boot({ query, timeout: 45000 });
      await T.eval('localStorage.clear()');
      await T.reload();
      await waitMenu(T, 25000);
      await T.clearCollection();
      return;
    } catch (e) {
      lastErr = e;
      console.log('[util] bootFresh retry', i, String(e).slice(0, 120));
      await sleep(900);
    }
  }
  throw lastErr;
}

export async function reloadWait(T) {
  await T.reload();
  await waitMenu(T);
}

export async function pageInfo(T) {
  return T.eval(`(() => {
    const g = window.__game;
    const q = (s) => document.querySelector(s);
    const txt = (s) => (q(s) ? q(s).textContent.replace(/\\s+/g, ' ').trim() : null);
    return {
      title: txt('#title'), subtitle: txt('#subtitle'),
      hint: (() => { const h = q('#hint'); return h && !h.hidden ? h.textContent.replace(/\\s+/g, ' ').trim() : ''; })(),
      overlayHidden: q('#overlay') ? q('#overlay').classList.contains('hidden') : null,
      overlayClass: q('#overlay') ? q('#overlay').className : null,
      page: g?._page || '', state: g?.state, menuIndex: g?.menuIndex,
      noDirect: !!g?._noDirect, capture: g?._captureAction || null,
      musicVisible: !!g?.musicRoom?.visible,
      musicIn: g?.musicRoom?.el ? !g.musicRoom.el.classList.contains('hidden') : false,
      notice: (() => { const h = q('#hint'); return h && !h.hidden ? h.textContent.replace(/\\s+/g, ' ').trim() : ''; })(),
      buttons: [...document.querySelectorAll('#buttons .btn')].map((b, i) => ({
        i, text: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
        label: (b.querySelector('.set-label') || b.querySelector('.label'))?.textContent || '',
        key: b.querySelector('.k')?.textContent || '',
        disabled: !!b.disabled, cls: b.className,
        back: !!b.dataset.back, sel: b.classList.contains('sel'),
      })),
      mr: (() => {
        const m = document.querySelector('.mr');
        if (!m) return null;
        return {
          hidden: m.classList.contains('hidden'),
          rows: [...document.querySelectorAll('.mr-row')].map((r) => ({
            text: (r.textContent || '').replace(/\\s+/g, ' ').trim(),
            cls: r.className,
          })),
          count: (document.querySelector('.mr-count-num')?.textContent || '') + '/' +
                 (document.querySelector('.mr-count-all')?.textContent || ''),
          state: document.querySelector('.mr-state')?.textContent || '',
          vol: document.querySelector('.mr-vol')?.textContent || '',
          previewBtn: document.querySelector('.mr-preview-btn')?.textContent || '',
          back: document.querySelector('.mr-back')?.textContent || '',
          warnHidden: document.querySelector('.mr-warn')?.classList.contains('hidden') ?? true,
          warnText: document.querySelector('.mr-warn-text')?.textContent || '',
          warnSel: document.querySelector('.mr-warn-btn.sel')?.dataset.act || null,
          curTitle: document.querySelector('.mr-title')?.textContent || '',
          previewTag: (() => { const p = document.querySelector('.mr-preview-tag'); return p && !p.classList.contains('hidden') ? p.textContent : ''; })(),
        };
      })(),
    };
  })()`);
}

export async function gameSnap(T) {
  return T.eval(`(() => {
    const g = window.__game;
    return {
      state: g.state, level: g.levelIndex, inExtra: !!g.inExtra, char: g.char, diff: g.difficulty,
      lives: g.lives, dialogue: !!g.dialogue?.active,
      stageLives: g.stage?.player?.lives ?? null,
      px: g.stage?.player ? Math.round(g.stage.player.x) : null,
      py: g.stage?.player ? Math.round(g.stage.player.y) : null,
      onGround: g.stage?.player?.onGround ?? null,
      vy: g.stage?.player?.vy != null ? +g.stage.player.vy.toFixed(1) : null,
      jumpsLeft: g.stage?.player?.jumpsLeft ?? null,
      frameCap: g.frameCap, loopCap: g.loop?.frameCap,
      loopRunning: !!g.loop?.running,
      musicOn: g.audio?.musicOn, muted: !!g.audio?.muted, song: g.audio?.currentSong,
      hudHidden: document.getElementById('hud')?.classList.contains('hidden'),
    };
  })()`);
}

export async function settingsSnap(T) {
  return T.eval(`(() => {
    const g = window.__game;
    const acts = ['left','right','up','down','fast','jump','shoot','dash','cast','confirm','pause','restart','mute','quit'];
    const binds = {};
    for (const a of acts) { const b = g.input.binds.get(a); binds[a] = { primary: b.primary, alt: b.alt }; }
    return {
      frameCap: g.frameCap, loopCap: g.loop?.frameCap,
      musicOn: g.musicOn !== false, screenShake: g.screenShake !== false, lives: g.lives,
      difficulty: g.difficulty,
      muted: !!g.audio.muted, musicVolume: g.audio.musicVolume, sfxVolume: g.audio.sfxVolume,
      sfxEnabled: !!g.audio.sfxEnabled,
      binds,
      labels: Object.fromEntries(acts.map((a) => [a, g.input.labelFor(a)])),
      settings: (() => { try { return JSON.parse(localStorage.getItem('hks.settings.v1') || 'null'); } catch (e) { return 'BADJSON'; } })(),
      keybinds: (() => { try { return JSON.parse(localStorage.getItem('hks.keybinds.v1') || 'null'); } catch (e) { return 'BADJSON'; } })(),
      progress: (() => { try { return JSON.parse(localStorage.getItem('hks.progress.v1') || 'null'); } catch (e) { return 'BADJSON'; } })(),
      music: (() => { try { return JSON.parse(localStorage.getItem('hks.music.v1') || 'null'); } catch (e) { return 'BADJSON'; } })(),
    };
  })()`);
}

/** 设置页控件读值（开关 class / 滑条数字 / pips / 帧率档位） */
export async function settingsUi(T) {
  return T.eval(`(() => {
    const rows = [...document.querySelectorAll('#buttons .set-row')];
    return rows.map((r) => ({
      label: r.querySelector('.set-label')?.textContent || '',
      sw: r.querySelector('.sw') ? r.querySelector('.sw').classList.contains('on') : null,
      sldNum: r.querySelector('.sld-num')?.textContent || '',
      sldWidth: r.querySelector('.sld i')?.style.width || '',
      pips: r.querySelectorAll('.pips i.on').length,
      seg: r.querySelector('.seg b.on')?.textContent || '',
      keycap: r.querySelector('.k')?.textContent || '',
      capturing: r.classList.contains('capturing'),
      cls: r.className,
    }));
  })()`);
}

export async function findBtn(T, text, selector = '#buttons .btn') {
  return T.eval(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const idx = els.findIndex((e) => norm(e.querySelector('.set-label')?.textContent || e.querySelector('.label')?.textContent || e.textContent).includes(${JSON.stringify(text)}));
    if (idx < 0) return { found: false, texts: els.map((e) => norm(e.textContent).slice(0, 40)) };
    const el = els[idx];
    const r = el.getBoundingClientRect();
    return { found: true, index: idx, x: r.x + r.width / 2, y: r.y + r.height / 2, text: norm(el.textContent).slice(0, 60), disabled: !!el.disabled };
  })()`);
}

export async function clickBtn(T, index) {
  const info = await T.eval(`(() => {
    const el = document.querySelectorAll('#buttons .btn')[${index}];
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return { found: true, x: r.x + r.width / 2, y: r.y + r.height / 2, text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60) };
  })()`);
  if (info.found) await T.mouse(info.x, info.y);
  await sleep(180);
  return info;
}

export async function clickText(T, text, selector = '#buttons .btn') {
  const info = await findBtn(T, text, selector);
  if (info.found && !info.disabled) await T.mouse(info.x, info.y);
  await sleep(180);
  return info;
}

/** 全页面元素是否超出视口 / 被 overflow:hidden 祖先裁切 / 不可滚动容器溢出 */
export async function layoutCheck(T) {
  return T.eval(`(() => {
    const vw = innerWidth, vh = innerHeight;
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const bad = [];
    const seen = new Set();
    const checkEl = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (!el.getClientRects().length) return;
      let clippedBy = null;
      let anc = el.parentElement;
      while (anc && anc !== document.documentElement) {
        const s = getComputedStyle(anc);
        const of = s.overflow + ' ' + s.overflowX + ' ' + s.overflowY;
        if (/(hidden|clip)/.test(of)) {
          const ar = anc.getBoundingClientRect();
          if (r.bottom > ar.bottom + 1 || r.top < ar.top - 1 || r.right > ar.right + 1 || r.left < ar.left - 1) {
            clippedBy = (anc.className && String(anc.className)) || anc.tagName;
            break;
          }
        }
        anc = anc.parentElement;
      }
      const inView = r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1;
      // 超出视口但落在可滚动容器里 = 玩家能滚到，不算裁切 bug
      let reachable = false;
      if (!inView) {
        let p = el.parentElement;
        while (p && p !== document.documentElement) {
          const ps = getComputedStyle(p);
          if (/auto|scroll/.test(ps.overflowY) && p.scrollHeight > p.clientHeight + 2) { reachable = true; break; }
          p = p.parentElement;
        }
      }
      if (clippedBy || (!inView && !reachable)) {
        bad.push({ text: norm(el.textContent).slice(0, 30), cls: String(el.className || el.tagName).slice(0, 70),
          x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), inView, reachable, clippedBy });
      }
    };
    document.querySelectorAll('#overlay .btn, .mr-row, .mr-back, .mr-preview-btn, .mr-warn-btn, .mr-warn-text, .mr-state, .mr-title, .mr-list').forEach(checkEl);
    const over = [];
    document.querySelectorAll('#overlay .panel, #overlay .set-group, #overlay .set-rows, #overlay .buttons, .mr, .mr-list, .mr-body, .mr-stage, #ui').forEach((el) => {
      const cs = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 2 && !/auto|scroll/.test(cs.overflowY)) over.push({ cls: String(el.className).slice(0, 60), t: 'v', sh: el.scrollHeight, ch: el.clientHeight, overflowY: cs.overflowY });
      if (el.scrollWidth > el.clientWidth + 2 && !/auto|scroll/.test(cs.overflowX)) over.push({ cls: String(el.className).slice(0, 60), t: 'h', sw: el.scrollWidth, cw: el.clientWidth, overflowX: cs.overflowX });
    });
    const panel = document.querySelector('#overlay .panel');
    const pr = panel ? panel.getBoundingClientRect() : null;
    return {
      vw, vh, badCount: bad.length, bad, over,
      doc: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw, vh },
      panel: pr ? { x: Math.round(pr.x), y: Math.round(pr.y), w: Math.round(pr.width), h: Math.round(pr.height), sh: panel.scrollHeight, ch: panel.clientHeight, oy: getComputedStyle(panel).overflowY } : null,
    };
  })()`);
}

export async function setViewport(T, width = 1280, height = 720) {
  await T.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
}

/** 循环按 Enter 推进对话，直到进入 play（对话有打字机效果，通常每行需按 2 次） */
export async function advanceToPlay(T, max = 80) {
  for (let i = 0; i < max; i++) {
    const st = await T.eval('window.__game.state');
    if (st === 'play') return true;
    if (st !== 'dialogue') {
      // 不是对话也不是 play：可能卡在菜单/异常，交给调用方判断
      await T.key('Enter');
    } else {
      await T.key('Enter');
    }
    await sleep(110);
  }
  return (await T.eval('window.__game.state')) === 'play';
}

/** 从 play 回标题：Esc 暂停 → Q 退出到标题（暂停菜单 hotkey） */
export async function playToTitle(T) {
  await T.key('Escape');
  await sleep(220);
  await T.key('KeyQ');
  await sleep(350);
  await waitMenu(T, 8000).catch(() => {});
  return pageInfo(T);
}

export function mkPart(checks) {
  const sum = checks.sum();
  return { pass: sum.pass, fail: sum.fail, rows: sum.rows };
}

export { sleep };
