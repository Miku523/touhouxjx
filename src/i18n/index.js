/**
 * i18n 运行时：四语言（简体中文 / 繁体中文 / English / 日本語）。
 *
 * 设计要点（见 docs/SETTINGS_I18N_DESIGN.md）：
 *  - 以「中文原文」为键：代码里保持 `tr('设置')`，语言包是 `{ '设置': '設置' }`。
 *    剧情/结局不用加 id、不用改数据结构；缺译自动回退中文，可以增量翻译。
 *  - 语言包按需 import()，主包（main.js）不背翻译体积。
 *  - 语言判定顺序：?lang= → localStorage 里的手动选择 → 浏览器语言 → 简体中文。
 *  - `setLang` 会同步 <html lang>（字体栈跟着换）、写回 settings.lang、通知监听者重绘。
 */

/** 可选语言。short 用于紧凑控件，native 是语言自称（选语言时永远显示自称） */
export const LANGS = [
  { tag: 'zh-Hans', short: '简中', native: '简体中文' },
  { tag: 'zh-Hant', short: '繁中', native: '繁體中文' },
  { tag: 'en', short: 'EN', native: 'English' },
  { tag: 'ja', short: '日', native: '日本語' },
];

const SETTINGS_KEY = 'hks.settings.v1';

/**
 * 语言包加载器（zh-Hans 是原文，没有包）。
 * 包 URL 带上入口脚本的 ?v=（发版号）：否则改完翻译、玩家浏览器还吃旧包缓存。
 */
function assetVer() {
  try {
    const el = [...document.scripts].find((s) => /\/src\/main\.js(\?|$)/.test(s.src || ''));
    const url = el ? new URL(el.src, window.location.href) : null;
    return (url && url.searchParams.get('v')) || '';
  } catch (e) {
    return '';
  }
}
const VER = assetVer();
const withVer = (path) => (VER ? `${path}?v=${encodeURIComponent(VER)}` : path);
const LOADERS = {
  'zh-Hant': () => import(/* @vite-ignore */ withVer('./packs/zh-hant.js')),
  en: () => import(/* @vite-ignore */ withVer('./packs/en.js')),
  ja: () => import(/* @vite-ignore */ withVer('./packs/ja.js')),
};

let lang = 'zh-Hans';
let dict = null;
let manual = false;
const listeners = new Set();
/** 当前语言下查不到的原文（同一句只记一次，开发期汇总用） */
const missing = new Set();

/** 把任意 BCP-47 / 浏览器 tag 规整成四种语言之一；不认识返回 null */
export function matchLang(tag) {
  if (!tag || typeof tag !== 'string') return null;
  const t = tag.trim().toLowerCase().replace(/_/g, '-');
  if (/^ja\b/.test(t)) return 'ja';
  if (/^en\b/.test(t)) return 'en';
  if (/^zh\b/.test(t)) {
    // zh-TW / zh-HK / zh-MO / zh-Hant / 任何带 Hant 的写法都走繁体
    return /(^|-)(tw|hk|mo|hant)\b/.test(t) || t.endsWith('hant') ? 'zh-Hant' : 'zh-Hans';
  }
  return null;
}

function readStore() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}

/** 首启判定（不加载包）：返回 { lang, manual, source } */
export function detectLang() {
  let fromUrl = null;
  try {
    fromUrl = matchLang(new URLSearchParams(window.location.search).get('lang'));
  } catch (e) {
    fromUrl = null;
  }
  if (fromUrl) return { lang: fromUrl, manual: false, source: 'url' };

  const store = readStore();
  const saved = store.lang !== undefined ? matchLang(store.lang) : null;
  if (saved) return { lang: saved, manual: true, source: 'settings' };

  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const list = Array.isArray(nav.languages) && nav.languages.length
    ? nav.languages
    : [nav.language].filter(Boolean);
  for (const tag of list) {
    const m = matchLang(tag);
    if (m) return { lang: m, manual: false, source: 'auto' };
  }
  return { lang: 'zh-Hans', manual: false, source: 'default' };
}

function htmlLang(tag) {
  if (tag === 'zh-Hans') return 'zh-CN';
  if (tag === 'zh-Hant') return 'zh-Hant';
  return tag;
}

function applyHtmlLang() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('lang', htmlLang(lang));
}

/** 给 index.html 里静态写死的文案打 data-i18n 后，一步刷新 */
function applyStaticTexts() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const src = el.getAttribute('data-i18n');
    if (src) el.textContent = tr(src);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const src = el.getAttribute('data-i18n-title');
    if (src) el.title = tr(src);
  });
}

async function loadPack(tag) {
  if (tag === 'zh-Hans') return {};
  const loader = LOADERS[tag];
  if (!loader) return {};
  try {
    const mod = await loader();
    return (mod && (mod.default || mod.dict)) || {};
  } catch (e) {
    // 语言包 404 / 语法错：保持中文，不阻断开玩
    console.warn('[i18n] 语言包加载失败：' + tag, e);
    return {};
  }
}

/** 启动时调用一次（必须在任何 tr() 渲染之前）。main.js 顶层 await 它 */
export async function initLang() {
  const d = detectLang();
  lang = d.lang;
  manual = d.manual;
  dict = await loadPack(lang);
  applyHtmlLang();
  applyStaticTexts();
  return lang;
}

export function getLang() {
  return lang;
}

/** 玩家是否手动选过语言（没选过 = 继续跟随浏览器/首启判定） */
export function isManualLang() {
  return manual;
}

/**
 * 取当前语言下的译文；缺译回退中文原文。
 * @param {string} text 中文原文（或本身就是键的短词）
 * @param {Record<string, string|number>} [vars] 替换 {name} 占位符
 */
export function tr(text, vars) {
  if (typeof text !== 'string' || !text) return text;
  let out = dict && dict[text] !== undefined ? dict[text] : undefined;
  if (out === undefined) {
    if (lang !== 'zh-Hans') missing.add(text);
    out = text;
  }
  if (vars && typeof out === 'string') {
    out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  }
  return out;
}

/**
 * 把一棵 DOM 子树里所有「中文原文」文本节点 / placeholder / title / aria-label
 * 按当前字典就地翻译。用于那些由 innerHTML 一次性拼出来、没有逐个 tr() 的旧面板。
 * 只处理含汉字的文本；查不到译文时保持原样，不会把英文/数字改坏。
 * @param {ParentNode} root
 */
export function localizeDom(root) {
  if (!root || typeof document === 'undefined') return;
  if (typeof NodeFilter === 'undefined') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement && node.parentElement.closest('[data-i18n-skip]')) continue;
    const raw = node.nodeValue;
    if (!raw) continue;
    const core = raw.trim();
    if (!core || !/[\u3400-\u9fff]/.test(core)) continue;
    const out = tr(core);
    if (out !== core) {
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      node.nodeValue = lead + out + trail;
    }
  }
  if (typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
    if (el.closest('[data-i18n-skip]')) return;
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      const out = tr(v);
      if (out !== v) el.setAttribute(attr, out);
    }
  });
}

/** 只做占位符替换、不查词典（译文里带 {} 时用） */
export function fill(text, vars) {
  if (!vars || typeof text !== 'string') return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

function persist() {
  try {
    const store = readStore();
    store.lang = lang;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(store));
  } catch (e) {
    // 无 localStorage：本次会话内仍生效
  }
}

/**
 * 切语言。会加载语言包（首次可能 await 一下）、写回设置、触发 onChange。
 * @param {string} tag
 * @param {{ manual?: boolean }} [opts] manual=false 时不写入设置（例如 ?lang= 预览）
 */
export async function setLang(tag, opts = {}) {
  const next = matchLang(tag) || tag;
  if (!LANGS.some((l) => l.tag === next)) return lang;
  dict = await loadPack(next);
  lang = next;
  if (opts.manual !== false) {
    manual = true;
    persist();
  }
  applyHtmlLang();
  applyStaticTexts();
  listeners.forEach((fn) => {
    try {
      fn(lang);
    } catch (e) {
      console.warn('[i18n] onChange 回调出错', e);
    }
  });
  return lang;
}

/** 订阅语言变化（重绘入口）。返回取消订阅函数 */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 开发期：当前语言下缺译的原文列表 */
export function missingKeys() {
  return Array.from(missing);
}

/** 开发期：清空缺译记录（切语言后重新统计） */
export function resetMissing() {
  missing.clear();
}

export default { LANGS, tr, fill, localizeDom, setLang, getLang, initLang, detectLang, onChange, matchLang, isManualLang };
