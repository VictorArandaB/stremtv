// Explorar en Buscar (tipo, género, año, cargar más; sin clave de TMDB, con Cinemeta) y calendario de Trakt en Inicio.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
      if (u.indexOf('/calendars/my/shows/') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify([
        { first_aired: day(0), episode: { season: 2, number: 5, title: 'x' }, show: { title: 'Severance', ids: { imdb: 'tt11280740' } } },
        { first_aired: day(1), episode: { season: 1, number: 3, title: 'y' }, show: { title: 'The Bear', ids: { imdb: 'tt14452776' } } },
        { first_aired: day(4), episode: { season: 3, number: 1, title: 'z' }, show: { title: 'Andor', ids: { imdb: 'tt9253284' } } }]) });
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '[]' });
    }
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const grid = () => p.evaluate(() => ({ n: document.querySelectorAll('.grid .card').length, first: Array.from(document.querySelectorAll('.grid .card .name')).slice(0, 3).map((x) => x.textContent).join(' | '), more: !!Array.from(document.querySelectorAll('.grid .btn')).filter((x) => /más|more/.test(x.textContent)).length, empty: (document.querySelector('.grid .empty') || {}).textContent }));
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', hideWatched: false }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(3000);
  console.log('calendario:', await p.evaluate(() => { const r = Array.from(document.querySelectorAll('.row')).filter((x) => /Esta semana/.test(x.textContent))[0]; return r ? Array.from(r.querySelectorAll('.name')).map((x) => x.textContent).join(' | ') : 'NO'; }));
  await p.evaluate(() => { const t = Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === 'Buscar')[0]; StremTV.Nav.focus(t); });
  await key('Enter'); await sleep(3000);
  console.log('foco inicial:', await p.evaluate(() => StremTV.Nav.cur.textContent), '· populares:', JSON.stringify(await grid()));
  await p.screenshot({ path: __dirname + '/shots/90-explore.png' });
  const pick = async (row, label) => { await p.evaluate((row, label) => { const r = Array.from(document.querySelectorAll('.chips-row')).filter((x) => x.querySelector('.row-title').textContent === row)[0];
    const btn = Array.from(r.querySelectorAll('.btn')).filter((x) => x.textContent === label)[0]; StremTV.Nav.focus(btn); }, row, label); await key('Enter'); await sleep(3500); };
  await pick('Género', 'Terror'); console.log('terror:', JSON.stringify(await grid()));
  await pick('Año', '2024'); console.log('terror 2024:', JSON.stringify(await grid()));
  await pick('Orden', 'Mejor valoradas'); console.log('terror 2024 mejor valoradas:', JSON.stringify(await grid()));
  await pick('Tipo', 'Series'); console.log('series terror 2024:', JSON.stringify(await grid()));
  await pick('Género', 'Todos'); await pick('Año', 'Todos');
  const before = (await grid()).n;
  await p.evaluate(() => { const m = Array.from(document.querySelectorAll('.grid .btn')).filter((x) => /más/.test(x.textContent))[0]; StremTV.Nav.focus(m); });
  await key('Enter'); await sleep(3500);
  console.log('cargar más:', before, '→', (await grid()).n, '· foco:', await p.evaluate(() => StremTV.Nav.cur.className));
  await p.screenshot({ path: __dirname + '/shots/91-explore-filtered.png' });
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
