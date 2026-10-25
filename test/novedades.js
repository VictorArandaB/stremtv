// Recién llegado al streaming: fila en Inicio con lo recién llegado a las plataformas grandes (películas y series mezcladas,
// lo más nuevo primero, con la plataforma en el nombre, una sola vez aunque esté en varias y sin lo visto) y la misma fila en
// Series, solo con series. Sin ajuste de plataformas. TMDB y Trakt se simulan. Sale con código 1 si algo falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: hdr, contentType: 'application/json', body: JSON.stringify(o) });
  const res = (items) => ({ page: 1, total_pages: 1, results: items.map((x) => Object.assign({ overview: 'Sinopsis', vote_average: 7, vote_count: 100, genre_ids: [18], original_language: 'en' }, x)) });
  const discover = [], details = [];
  p.on('request', (req) => {
    const u = decodeURIComponent(req.url());
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('api.themoviedb.org') >= 0) {
      if (/\/watch\/providers\/(tv|movie)/.test(u)) return json(req, { results: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 119, provider_name: 'Amazon Prime Video' }, { provider_id: 1899, provider_name: 'HBO Max' }] });
      if (/\/discover\//.test(u)) {
        discover.push(u);
        const pv = (/with_watch_providers=(\d+)/.exec(u) || [])[1];
        if (/\/discover\/movie\?release_date\.gte/.test(u)) {
          if (pv === '8') return json(req, res([{ id: 10, title: 'Peli Netflix vieja', release_date: day(40) }, { id: 11, title: 'Peli en las dos', release_date: day(5) }]));
          if (pv === '119') return json(req, res([{ id: 11, title: 'Peli en las dos', release_date: day(5) }, { id: 12, title: 'Peli Prime vista', release_date: day(2) }]));
          return json(req, res([{ id: 13, title: 'Peli HBO', release_date: day(3) }]));
        }
        if (/\/discover\/tv\?air_date\.gte=[^&]*&air_date\.lte=[^&]*&sort_by=popularity\.desc&vote_count\.gte=5&/.test(u) && pv) {
          if (pv === '8') return json(req, res([{ id: 30, name: 'Serie Netflix', first_air_date: '2019-03-01' }]));
          if (pv === '119') return json(req, res([{ id: 31, name: 'Serie Prime', first_air_date: day(20) }]));
          return json(req, res([{ id: 32, name: 'Serie HBO', first_air_date: day(1) }]));
        }
        // filas de cada plataforma en las pestañas (por popularidad)
        if (pv) return json(req, res([{ id: 900 + +pv, name: 'Popular ' + pv, title: 'Popular ' + pv, first_air_date: '2020-01-01', release_date: '2020-01-01' }]));
        return json(req, { results: [] });
      }
      const tv = /\/tv\/(\d+)\?/.exec(u);
      if (tv) {
        details.push(tv[1]);
        // la serie de Netflix es antigua pero estrenó episodio ayer: sale la primera
        return json(req, { id: +tv[1], last_air_date: day(20), last_episode_to_air: tv[1] === '30' ? { air_date: day(1), season_number: 6, episode_number: 2 } : tv[1] === '32' ? { air_date: day(25) } : null });
      }
      return json(req, { results: [] });
    }
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/sync/watched/movies') >= 0) return json(req, [{ movie: { title: 'Peli Prime vista', ids: { tmdb: 12, trakt: 12 } } }]);
      return json(req, []);
    }
    if (u.indexOf('/catalog/') >= 0) return json(req, { metas: [] });
    if (u.indexOf('/meta/') >= 0) return json(req, { meta: {} });
    // listas y premios (Wikipedia/Wikidata): vacías, para que las filas que se miran no dependan de la red
    if (u.indexOf('wikipedia.org') >= 0 || u.indexOf('wikidata.org') >= 0) return json(req, {});
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';
  const focusText = async (re, sel = '.f') => p.evaluate((top, re, sel) => {
    const x = Array.from(eval(top).querySelectorAll(sel)).filter((e) => new RegExp(re).test(e.textContent) && (e.offsetWidth || e.offsetHeight))[0];
    if (x) StremTV.Nav.focus(x);
    return !!x;
  }, top, re, sel);
  const tab = async (name) => { await focusText('^' + name + '$', '.tab'); await key('Enter'); await sleep(1500); };
  const rows = () => p.evaluate((top) => Array.from(eval(top).querySelectorAll('.row')).map((r) => {
    const t = r.querySelector('.row-title');
    return (t ? t.textContent : '') + ': ' + Array.from(r.querySelectorAll('.card .name, .btn')).map((x) => x.textContent).join(', ');
  }), top);
  const optVal = (re) => p.evaluate((top, re) => (Array.from(eval(top).querySelectorAll('.opt')).filter((x) => new RegExp(re).test(x.textContent))[0] || {}).textContent, top, re);

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, tmdbKey: 'k', key: 'K', debrid: 'alldebrid', hideWatched: true }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);

  // --- Inicio: lo recién llegado a todas las plataformas grandes, sin elegir nada
  const row = (await rows()).filter((r) => /^Recién llegado al streaming/.test(r))[0] || '';
  check(row === 'Recién llegado al streaming: Serie Netflix · Netflix, Peli HBO · HBO Max, Peli en las dos · Netflix, Prime Video, Serie Prime · Prime Video, Serie HBO · HBO Max, Peli Netflix vieja · Netflix',
    'Inicio: lo más nuevo primero, con su plataforma, sin lo visto', row);
  check((row.match(/Peli en las dos/g) || []).length === 1, 'lo que está en varias plataformas sale una sola vez');
  check(/\/discover\/movie\?release_date\.gte=\d{4}-\d\d-\d\d&release_date\.lte=\d{4}-\d\d-\d\d.*with_watch_providers=8&watch_region=ES&with_watch_monetization_types=flatrate/.test(discover.join(' ')), 'consulta por plataforma (con suscripción en España)');
  check(!/with_watch_providers=(1773|63|283)\b/.test(discover.filter((u) => /release_date\.gte|air_date\.gte/.test(u)).join(' ')), 'sin SkyShowtime, Filmin ni Crunchyroll');
  check(details.sort().join() === '30,31,32', 'fecha del último episodio, solo de las series', details.join());
  await p.screenshot({ path: OUT + '/250-recien-llegado.png' });

  // --- Ajustes → General ya no tiene «Mis plataformas»
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(600);
  check(!(await optVal('^Mis plataformas')), 'sin «Mis plataformas» en Ajustes');
  await key('Escape'); await key('Escape'); await sleep(500);

  // --- Series: la misma fila, solo con series, y las plataformas que hay, visibles
  await tab('Series'); await sleep(1500);
  const sr = await rows();
  check(sr.map((r) => r.split(':')[0]).join(' | ') === 'Recién llegado al streaming | En Netflix | En Prime Video | En HBO Max', 'filas de Series', sr.map((r) => r.split(':')[0]).join(' | '));
  check(sr[0] === 'Recién llegado al streaming: Serie Netflix · Netflix, Serie Prime · Prime Video, Serie HBO · HBO Max', 'en Series, solo series', sr[0]);

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
