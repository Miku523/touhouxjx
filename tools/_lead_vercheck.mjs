// 校验标题页版本号是否跟随入口 ?v=（本地 8138）。
import { launch, sleep } from './_pt_core.mjs';

const T = await launch({ port: 9560, headless: true });
try {
  const out = {};
  for (const q of ['?v=1.4.5', '?v=9.9.9probe']) {
    await T.boot({ query: q, waitTitle: 20000, timeout: 30000 });
    await sleep(400);
    out[q] = await T.eval('document.querySelector(".title-ver")?.textContent || null');
  }
  console.log(JSON.stringify(out));
} finally {
  await T.close().catch(() => {});
}
