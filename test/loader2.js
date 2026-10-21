const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const state = () => p.evaluate(() => ({ app: !!window.StremTV, focus: (document.querySelector('.focused') || {}).textContent,
    cache: (JSON.parse(localStorage.getItem('stv.code') || 'null') || {}).sha, ver: (localStorage.getItem('stv.code') || '').match(/VERSION = '([\d.]+)'/) }));
  await p.goto('http://127.0.0.1:8091/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded' });
  let t0 = Date.now(); while (!(await p.evaluate(() => !!document.querySelector('.focused'))) && Date.now() - t0 < 10000) await sleep(50);
  console.log('arranque 1 (archivos del paquete):', Date.now() - t0, 'ms', JSON.stringify(await state()));
  await sleep(14000);
  console.log('tras actualización en segundo plano:', JSON.stringify(await state()));
  await p.reload({ waitUntil: 'domcontentloaded' });
  t0 = Date.now(); while (!(await p.evaluate(() => !!document.querySelector('.focused'))) && Date.now() - t0 < 10000) await sleep(50);
  const fromCache = await p.evaluate(() => Array.prototype.some.call(document.scripts, (s) => !s.src && s.text.indexOf('var VERSION') >= 0));
  console.log('arranque 2 (desde caché):', Date.now() - t0, 'ms, código en línea:', fromCache, JSON.stringify(await state()));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
