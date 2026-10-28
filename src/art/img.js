/**
 * 美术素材取图辅助：AVIF 优先 / WebP 回退（1.6.16）
 *
 * 背景：src/art/gen 下的 .webp 已全部保留，同目录另有一批同名 .avif（体积更小）。
 * 这里不做能力探针，也不改 DOM 结构（素材几乎全是 canvas 画的 new Image()）：
 *
 *   img.src = artUrl(webpUrl);                 // 有 .avif 就给 .avif，否则原样 .webp
 *   img.onerror = () => {                     // 失败时先退回 .webp，再谈真正的失败
 *     if (onArtError(img, webpUrl)) return;   // 回退一次就返回 true
 *     handleRealFailure();                    // 连 .webp 都挂了才走这里
 *   };
 *
 * 为什么不用探针：首屏 3 张图必须在主线程立刻发请求，不能等异步能力检测；
 * 不支持 AVIF 的浏览器由 onerror 立刻回退，代价只是一次失败的请求（老浏览器才发生）。
 * 为什么用清单：只有体积收益达标的图才转成了 .avif（见 tools/optimize_art_avif.py），
 * 没转的图不登记在 avif_manifest.js 里，运行期就不会白吃一次 404。
 *
 * 测试 / 线上救急：URL 上加 ?noavif=1 可强制全站走 WebP（含 CSS 背景图）。
 */
import { AVIF_ASSETS } from './avif_manifest.js';

const GEN_PREFIX = '/src/art/gen/';
const WEBP_RE = /\.webp(?=([?#]|$))/;

/** ?noavif=1（或 noavif / noavif=true）时强制 WebP；缓存开关结果，模块加载读一次即可 */
const FORCE_WEBP = (() => {
  try {
    const v = new URLSearchParams(location.search).get('noavif');
    return v !== null && v !== '0' && v !== 'false';
  } catch (e) {
    return false;
  }
})();

/** .webp URL -> 清单里的素材名（相对 src/art/gen、去掉扩展名）；不是 art 素材返回 null */
function assetStem(url) {
  const s = String(url);
  const i = s.indexOf(GEN_PREFIX);
  if (i < 0) return null;
  let rest = s.slice(i + GEN_PREFIX.length);
  const cut = rest.search(/[?#]/);
  if (cut >= 0) rest = rest.slice(0, cut);
  if (!rest.endsWith('.webp')) return null;
  return rest.slice(0, -5);
}

/**
 * 把一张 art 素材的 .webp URL 换成 .avif URL。
 * 同步、无副作用；没有对应 .avif（或 ?noavif=1）时返回原 URL。
 * @param {string|URL} url 源码里写死的 .webp 地址
 * @returns {string}
 */
export function artUrl(url) {
  const s = String(url);
  if (FORCE_WEBP || !WEBP_RE.test(s)) return s;
  const stem = assetStem(s);
  if (!stem || !AVIF_ASSETS.has(stem)) return s;
  return s.replace(WEBP_RE, '.avif');
}

/** 已经回退过 WebP 的图片对象（同一张图只回退一次，避免死循环） */
const RETRIED = new WeakSet();

/**
 * 图片 onerror 里的第一步：当前加载的是 .avif 就静默换成 .webp 再试一次。
 * @param {HTMLImageElement} img 出错的 <img> / Image
 * @param {string|URL} webpUrl 源码里对应的 .webp 地址（原始回退目标）
 * @returns {boolean} 本次是否已经把请求改回 .webp（true = 调用方不要当成真失败）
 */
export function onArtError(img, webpUrl) {
  if (!img || RETRIED.has(img)) return false;
  const cur = String(img.currentSrc || img.src || '');
  if (!cur.includes('.avif')) return false;
  RETRIED.add(img);
  img.src = String(webpUrl);
  return true;
}

/** 当前是否启用 AVIF（?noavif=1 时 false，供测试/日志用） */
export function isAvifEnabled() {
  return !FORCE_WEBP;
}
