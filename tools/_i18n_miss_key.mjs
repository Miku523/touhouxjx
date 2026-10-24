import { STORY } from '../src/game/story.js';
import { ENDINGS } from '../src/game/endings.js';
import en from '../src/i18n/packs/en.js';
const texts=new Set();
function walk(v){if(!v)return;if(Array.isArray(v)){for(const x of v)walk(x);return;}if(typeof v==='object'){if(typeof v.text==='string')texts.add(v.text);for(const x of Object.values(v))walk(x);}}
walk(STORY);walk(ENDINGS);
for(const k of texts)if(!en[k])console.log(JSON.stringify(k));
