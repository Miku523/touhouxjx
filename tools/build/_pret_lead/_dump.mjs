import { pathToFileURL } from 'node:url';
const m = await import(pathToFileURL(process.argv[2]).href);
const ex = m["VOYAGE_PRE6"] || Object.values(m)[0];
const k = "pre6" || Object.keys(ex)[0];
console.log(JSON.stringify(ex[k]));
