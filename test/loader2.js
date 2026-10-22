// Actualización en segundo plano (puerto 8091, como en la tele): el 1.er arranque usa el paquete, a los ~8 s boot.js baja de
// jsDelivr el último commit publicado y lo guarda en stv.code; el 2.º arranque usa esa copia guardada (inyectada, sin app.js).
// Necesita red (API de GitHub: 60 consultas/hora sin cuenta). Uso: servir app/ en 127.0.0.1:8091 y node test/loader2.js.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? 'OK  ' : 'MAL ') + what + (got !== undefined ? ' → ' + JSON.stringify(got) : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const state = () => p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('stv.code') || 'null') || {};
    return { app: !!window.StremTV, src: (window.__boot || {}).src, sha: c.sha, ver: ((c.js || '').match(/var VERSION = '([\d.]+)'/) || [])[1],
      files: Array.from(document.scripts).filter((s) => /app\.js/.test(s.src)).length };
  });
  const booted = async () => { const t0 = Date.now(); while (!(await p.evaluate(() => !!document.querySelector('.focused'))) && Date.now() - t0 < 10000) await sleep(50); return Date.now() - t0; };
  await p.goto('http://127.0.0.1:8091/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded' });
  let ms = await booted(), s = await state();
  check(s.app && /^paquete/.test(s.src) && s.files === 1, '1.er arranque desde el paquete (' + ms + ' ms)', s.src);
  for (let t0 = Date.now(); !(await state()).sha && Date.now() - t0 < 30000;) await sleep(500);
  s = await state();
  check(/^[0-9a-f]{40}$/.test(s.sha || '') && !!s.ver, 'último commit descargado y guardado', [s.sha, s.ver]);
  await p.reload({ waitUntil: 'domcontentloaded' });
  ms = await booted();
  const s2 = await state();
  check(s2.app && s2.src === 'guardada ' + s.ver && s2.files === 0, '2.º arranque desde la copia guardada (' + ms + ' ms)', s2.src);
  check(!errs.length, 'sin errores de JS', errs);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
