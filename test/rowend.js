// ◀ ▶ al final de una fila de carátulas: el foco se queda en la fila (no salta a la de abajo).
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', hideWatched: false })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(3000);
  const where = () => p.evaluate(() => { const c = StremTV.Nav.cur; const row = c.closest('.row'); return (row ? row.querySelector('.row-title').textContent : '?') + ' · ' + c.textContent.slice(0, 30); });
  // última carátula de la primera fila
  await p.evaluate(() => { const r = document.querySelector('.row .hscroll'); StremTV.Nav.focus(r.lastChild); });
  console.log('última de la fila:', await where());
  for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowRight'); await sleep(200); }
  console.log('tras ▶ x3:', await where());
  await p.evaluate(() => { const r = document.querySelector('.row .hscroll'); StremTV.Nav.focus(r.firstChild); });
  await p.keyboard.press('ArrowLeft'); await sleep(200);
  console.log('primera y ◀:', await where());
  await p.keyboard.press('ArrowDown'); await sleep(200);
  console.log('▼ sigue funcionando:', await where());
  await p.keyboard.press('ArrowRight'); await sleep(200);
  console.log('▶ dentro de la fila:', await where());
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
