// 0.23: saga, notas de Rotten Tomatoes/Metacritic, plataformas en España y filas de Inicio.
// TMDB, OMDb y Cinemeta se simulan. Sale con código 1 si alguna comprobación falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const json = (req, o, status) => req.respond({ status: status || 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  const parts = [['tt0120737', 120, 'La Comunidad del Anillo', '2001-12-19'], ['tt0167260', 122, 'El retorno del Rey', '2003-12-17'], ['tt0167261', 121, 'Las dos torres', '2002-12-18']];
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('omdbapi.com') >= 0) return json(req, { Ratings: [{ Source: 'Internet Movie Database', Value: '8.9/10' }, { Source: 'Rotten Tomatoes', Value: '91%' }, { Source: 'Metacritic', Value: '92/100' }] });
    if (u.indexOf('api.themoviedb.org') >= 0) {
      const f = /\/find\/(tt\d+)/.exec(u);
      if (f) { const x = parts.filter((y) => y[0] === f[1])[0] || ['', 1, 'Otra']; return json(req, { movie_results: [{ id: x[1], title: x[2] }], tv_results: [] }); }
      if (/\/collection\/119/.test(u)) return json(req, { parts: parts.map((x) => ({ id: x[1], title: x[2], release_date: x[3], poster_path: null })) });
      const ext = /\/movie\/(\d+)\/external_ids/.exec(u);
      if (ext) return json(req, { imdb_id: parts.filter((x) => x[1] === +ext[1])[0][0] });
      if (/\/movie\/120\?/.test(u)) return json(req, { title: 'La Comunidad del Anillo', overview: 'Sinopsis en español.', genres: [{ name: 'Aventura' }],
        belongs_to_collection: { id: 119, name: 'El Señor de los Anillos - Colección' },
        'watch/providers': { results: { ES: { flatrate: [{ provider_name: 'Max' }, { provider_name: 'Prime Video' }] } } },
      });
      return json(req, {});
    }
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [] });
    if (u.indexOf('/catalog/') >= 0 && u.indexOf('v3-cinemeta') >= 0) {
      const name = /movie\/top/.test(u) ? 'Pop película' : /series\/top/.test(u) ? 'Pop serie' : /movie\/imdbRating/.test(u) ? 'Top película' : 'Top serie';
      return json(req, { metas: [{ id: 'tt0111161', type: 'movie', name: name, poster: '' }] });
    }
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';
  const focusText = async (re) => p.evaluate((top, re) => {
    const x = Array.from(eval(top).querySelectorAll('.f')).filter((e) => new RegExp(re).test(e.textContent))[0];
    if (x) StremTV.Nav.focus(x);
    return !!x;
  }, top, re);
  const rowTitles = () => p.evaluate(() => Array.from(StremTV.stack[0].el.querySelectorAll('.row-title')).map((x) => x.textContent).join(' | '));

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, tmdbKey: 'k', omdbKey: 'o', key: 'K', debrid: 'alldebrid' }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);

  // --- ficha: notas, plataformas y saga
  await p.evaluate(() => StremTV.open('movie', 'tt0120737')); await sleep(3500);
  const btns = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.detail .btn')).map((x) => x.textContent).join(' | '), top);
  check(/Saga/.test(btns) && !/Tráiler/.test(btns), 'la ficha tiene Saga (y ya no Tráiler)', btns);
  const line = await p.evaluate((top) => eval(top).querySelector('.meta-line').textContent, top);
  check(/Rotten Tomatoes 91 %/.test(line) && /Metacritic 92/.test(line), 'notas de Rotten Tomatoes y Metacritic', line);
  const prov = await p.evaluate((top) => (eval(top).querySelector('.providers') || {}).textContent, top);
  check(prov === 'En España: Max, Prime Video', 'plataformas en España', prov);
  await p.screenshot({ path: OUT + '/230-detail-extras.png' });
  await focusText('^Saga$'); await key('Enter'); await sleep(2000);
  const saga = await p.evaluate((top) => [eval(top).querySelector('.screen-title').textContent, Array.from(eval(top).querySelectorAll('.card .name')).map((x) => x.textContent).join(' / ')].join(' : '), top);
  check(/Colección : La Comunidad del Anillo \/ Las dos torres \/ El retorno del Rey$/.test(saga), 'saga en orden de estreno', saga);
  await p.screenshot({ path: OUT + '/231-saga.png' });
  await key('Escape'); await key('Escape'); await sleep(500);

  // --- filas de Inicio: por defecto, en su orden
  let rows = await rowTitles();
  check(/Películas populares \| Series populares$/.test(rows), 'Inicio en el orden de siempre', rows);
  // Ajustes → General → Filas de Inicio: subir «Series populares» arriba del todo y ocultar «Películas populares»
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(600);
  await focusText('Filas de Inicio'); await key('Enter'); await sleep(600);
  const list = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.opt')).map((x) => x.firstChild.textContent).join(' | '), top);
  check(/1\. Continuar viendo/.test(list) && /Series populares/.test(list), 'lista de filas', list);
  await focusText('Series populares'); await key('Enter'); await sleep(400);
  await focusText('^Arriba del todo$'); await key('Enter'); await sleep(400);
  const after = await p.evaluate((top) => [eval(top).querySelector('.opt').firstChild.textContent, StremTV.Nav.cur.firstChild.textContent].join(' · foco: '), top);
  check(/^1\. Series populares · foco: 1\. Series populares$/.test(after), 'arriba del todo (y el foco la sigue)', after);
  await focusText('Películas populares'); await key('Enter'); await sleep(400);
  await focusText('^Ocultar$'); await key('Enter'); await sleep(400);
  const hid = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.opt.off')).map((x) => x.textContent).join(' | '), top);
  check(/Películas populares\s*Oculta/.test(hid), 'Películas populares oculta', hid);
  await p.screenshot({ path: OUT + '/232-home-rows.png' });
  await key('Escape'); await key('Escape'); await key('Escape'); await sleep(1500);
  rows = await rowTitles();
  check(/^Series populares/.test(rows) && !/Películas populares/.test(rows), 'Inicio con el orden nuevo y sin la fila oculta', rows);
  check(await p.evaluate(() => StremTV.Nav.cur && StremTV.stack[0].el.contains(StremTV.Nav.cur)), 'el foco está en Inicio');
  // volver al orden de siempre
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(500);
  await focusText('Filas de Inicio'); await key('Enter'); await sleep(500);
  await focusText('orden de siempre'); await key('Enter'); await sleep(300);
  await key('Escape'); await key('Escape'); await key('Escape'); await sleep(1500);
  rows = await rowTitles();
  check(/Películas populares \| Series populares$/.test(rows), 'orden de siempre restaurado', rows);

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
