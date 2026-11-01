import { KAGUYA_STAGE6 } from '../../../src/engine/songs/kaguya_stage6.js';
import fs from 'node:fs';
fs.writeFileSync(process.argv[2], JSON.stringify(KAGUYA_STAGE6.stage6));
console.log('tracks', KAGUYA_STAGE6.stage6.tracks.length, 'drums', KAGUYA_STAGE6.stage6.drums.length);
