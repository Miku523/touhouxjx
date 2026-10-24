import { STORY } from '../src/game/story.js';
import { ENDINGS } from '../src/game/endings.js';
import ja from '../src/i18n/packs/ja.js';
const texts=new Set();
function walk(v){if(!v)return;if(Array.isArray(v)){for(const x of v)walk(x);return;}if(typeof v==='object'){if(typeof v.text==='string')texts.add(v.text);for(const x of Object.values(v))walk(x);}}
walk(STORY);walk(ENDINGS);
const bad=/[你您吗呢吧啊呀嘛哦嗯喂啥咋啦]|们|这|说|门|边|见|现|实|发|关|开|无|与|为|乐|书|车|马|鸟|鱼|龙|龟|贝|页|风|飞|个|还|进|过|对|从么/u;
let n=0;for(const k of texts){const v=ja[k];if(v&&bad.test(v)){n++;if(n<=10)console.log(JSON.stringify([k.slice(0,30),v.slice(0,80)]));}}
console.log('ja 可疑',n);
