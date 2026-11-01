import { pathToFileURL } from 'node:url';
const m = await import(pathToFileURL(process.argv[2]).href);
console.log(JSON.stringify(m.KAGUYA_STAGE6.stage6));
