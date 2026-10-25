// 0.24: pestañas Series y Películas (filas propias, «Para ti» sin lo visto ni empezado, una fila por plataforma), Buscar con
// los filtros de explorar (TMDB: género, década, nota mínima, plataforma, orden, solo sin ver), filas de cada pestaña en Ajustes
// y, al volver a Inicio desde otra pestaña, el foco en «Inicio». TMDB y Trakt se simulan. Sale con código 1 si algo falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: hdr, contentType: 'application/json', body: JSON.stringify(o) });
  // un nombre o { name, anime: true } (animación japonesa)
  const res = (names, base) => ({ page: 1, total_pages: 3, results: names.map((n, i) => Object.assign({ id: base + i, name: n.name || n, title: n.name || n, overview: 'Sinopsis', first_air_date: '2024-01-01', release_date: '2024-01-01', vote_average: 8, vote_count: 900 },
    n.anime ? { genre_ids: [16], original_language: 'ja' } : { genre_ids: [18], original_language: 'en' }, n.media ? { media_type: n.media } : {})) });
  const discover = [];
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('api.themoviedb.org') >= 0) {
      if (/\/watch\/providers\/(tv|movie)/.test(u)) return json(req, { results: [{ provider_id: 8, provider_name: 'Netflix' }, { provider_id: 1899, provider_name: 'Max' }, { provider_id: 2, provider_name: 'Apple TV' }, { provider_id: 283, provider_name: 'Crunchyroll' }] });
      if (/\/trending\/tv\/week/.test(u)) return json(req, res(['Tendencia uno', { name: 'Anime en tendencia', anime: true }], 100));
      if (/\/search\/multi/.test(u)) return json(req, res([{ name: 'Peli', media: 'movie' }, { name: 'Serie', media: 'tv' }, { name: 'Anime buscado', media: 'tv', anime: true }], 400));
      if (/\/discover\//.test(u)) {
        discover.push(decodeURIComponent(u));
        if (/with_watch_providers=8/.test(u) && !/vote_average\.gte/.test(u)) return json(req, res(['Serie Netflix'], 200));
        if (/with_watch_providers=1899/.test(u)) return json(req, res(['Serie Max'], 300));
        // la 1 (tv) está vista en Trakt: con «Solo sin ver» no sale
        return json(req, res(['Vista en Trakt', 'Sin ver'], 1));
      }
      return json(req, { results: [] });
    }
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/recommendations/shows') >= 0) return json(req, [{ title: 'Rec vista', ids: { imdb: 'tt0000001', tmdb: 1 } }, { title: 'Rec empezada', ids: { imdb: 'tt0000002', tmdb: 5 } }, { title: 'Rec nueva', ids: { imdb: 'tt0000003', tmdb: 3 } },
        { title: 'Rec anime', ids: { imdb: 'tt0000004', tmdb: 4 }, genres: ['anime', 'action'] }]);
      if (u.indexOf('/sync/watched/shows') >= 0) return json(req, [
        { show: { title: 'Rec vista', ids: { imdb: 'tt0000001', tmdb: 1, trakt: 1 }, aired_episodes: 1 }, last_watched_at: '2024-01-01', seasons: [{ number: 1, episodes: [{ number: 1 }] }] },
        { show: { title: 'Rec empezada', ids: { imdb: 'tt0000002', tmdb: 5, trakt: 2 }, aired_episodes: 5 }, last_watched_at: '2024-01-01', seasons: [{ number: 1, episodes: [{ number: 1 }] }] }]);
      return json(req, []);
    }
    // premios (Wikipedia y Wikidata): sin datos, sus filas no salen
    if (u.indexOf('wikipedia.org') >= 0 || u.indexOf('wikidata.org') >= 0) return json(req, {});
    if (u.indexOf('/catalog/') >= 0 && u.indexOf('v3-cinemeta') >= 0) return json(req, { metas: [{ id: 'tt0111161', type: /movie/.test(u) ? 'movie' : 'series', name: 'Cinemeta', poster: '' },
      { id: 'tt0111162', type: /movie/.test(u) ? 'movie' : 'series', name: 'Cinemeta anime', genres: ['Animation', 'Action'], country: 'Japan', poster: '' }] });
    if (u.indexOf('anime-kitsu.strem.fun/catalog/') >= 0) return json(req, { metas: [{ id: /search=/.test(u) ? 'kitsu:2' : 'kitsu:1', type: 'anime', name: /search=/.test(u) ? 'Kitsu búsqueda' : 'Kitsu', poster: '' }] });
    if (u.indexOf('/meta/') >= 0) return json(req, { meta: {} });
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
    return (t ? t.textContent : '') + ': ' + Array.from(r.querySelectorAll('.card .name')).map((x) => x.textContent).join(', ');
  }), top);

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, tmdbKey: 'k', key: 'K', debrid: 'alldebrid', hideWatched: false }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);

  const tabs = await p.evaluate(() => Array.from(document.querySelectorAll('.tab')).map((x) => x.textContent).join(' '));
  check(tabs === 'Inicio Anime Películas Series Buscar Ajustes', 'pestañas', tabs);
  const home = (await rows()).join(' | ');
  check(!/populares|mejor valoradas|Recomendadas/i.test(home), 'Inicio sin populares ni recomendadas (con Trakt)', home);

  // --- Series
  await tab('Series'); await sleep(1500);
  const sr = await rows();
  const titles = sr.map((r) => r.split(':')[0]).join(' | ');
  check(titles === 'Para ti | Tendencia esta semana | En emisión | Populares | Estrenos | Mejor valoradas | En Netflix | En HBO Max', 'filas de Series (sin las plataformas que no hay ni las ocultas)', titles);
  check(sr[0] === 'Para ti: Rec nueva', '«Para ti» sin lo visto ni lo empezado (ni anime)', sr[0]);
  check(sr[1] === 'Tendencia esta semana: Tendencia uno' && sr[3] === 'Populares: Cinemeta', 'Series sin anime (TMDB y Cinemeta)', sr[1] + ' · ' + sr[3]);
  check(sr.indexOf('En Netflix: Serie Netflix') >= 0 && /with_watch_providers=8&watch_region=ES&with_watch_monetization_types=flatrate/.test(discover.join(' ')), 'fila de Netflix (TMDB, con suscripción en España)');
  check(await p.evaluate(() => StremTV.Nav.cur.textContent === 'Series' && StremTV.Nav.cur.classList.contains('active')), 'el foco empieza en la pestaña Series');
  await p.screenshot({ path: OUT + '/240-series.png' });

  // --- Anime: las mismas filas que Series (Kitsu y TMDB) y Crunchyroll
  await tab('Anime'); await sleep(1500);
  const ar = await rows();
  const at = ar.map((r) => r.split(':')[0]).join(' | ');
  check(at === 'Para ti | Tendencia esta semana | En emisión | Populares | Estrenos | Mejor valorados | En Netflix | En Crunchyroll', 'filas de Anime', at);
  check(ar[0] === 'Para ti: Rec anime', '«Para ti» de Anime: solo anime', ar[0]);
  check(/\/discover\/tv\?first_air_date[^ ]*with_genres=16&with_original_language=ja/.test(discover.join(' ')), 'estrenos de anime en TMDB');
  await p.screenshot({ path: OUT + '/242-anime.png' });

  // --- de Series a Inicio: el foco en «Inicio», no en la pestaña que se pulsó para salir de Inicio
  await tab('Inicio');
  const back = await p.evaluate(() => [StremTV.stack.length, StremTV.Nav.cur.textContent].join(' · '));
  check(back === '1 · Inicio', 'de vuelta en Inicio con el foco en su pestaña', back);
  await tab('Películas');
  await tab('Series');
  const st = await p.evaluate(() => [StremTV.stack.length, StremTV.Nav.cur.textContent].join(' · '));
  check(st === '2 · Series', 'de Películas a Series no se apilan pestañas', st);
  await key('Escape'); await sleep(500);
  check(await p.evaluate(() => StremTV.stack.length === 1 && StremTV.Nav.cur.textContent === 'Inicio'), 'Atrás vuelve a Inicio (foco en Inicio)');

  // --- Buscar: filtros
  await tab('Buscar');
  const pick = async (row, label) => {
    const ok = await p.evaluate((top, row, label) => {
      const r = Array.from(eval(top).querySelectorAll('.chips-row')).filter((x) => x.querySelector('.row-title').textContent === row)[0];
      const bt = r && Array.from(r.querySelectorAll('.btn')).filter((x) => x.textContent === label)[0];
      if (bt) StremTV.Nav.focus(bt);
      return !!bt;
    }, top, row, label);
    if (!ok) check(false, 'filtro ' + row + ' → ' + label);
    await key('Enter'); await sleep(700);
  };
  const filterRows = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.chips-row .row-title')).map((x) => x.textContent).join(' | '), top);
  check(/Tipo \| Género \| Año \| Nota mínima \| Plataforma \| Orden \| Mostrar/.test(filterRows), 'filtros de explorar en Buscar', filterRows);
  await pick('Tipo', 'Anime');
  await pick('Género', 'Ciencia ficción y fantasía');
  check(/\/discover\/tv\?.*with_original_language=ja&with_genres=16,10765/.test(discover[discover.length - 1]), 'explorar anime: animación japonesa y el género', discover[discover.length - 1]);
  await pick('Tipo', 'Series');
  check(await p.evaluate(() => StremTV.Nav.cur.textContent === 'Series'), 'al cambiar de tipo, el foco sigue en el botón');
  await pick('Género', 'Ciencia ficción y fantasía');
  await pick('Año', 'Años 90');
  await pick('Nota mínima', '★ 7+');
  await pick('Plataforma', 'Netflix');
  await pick('Orden', 'Mejor valoradas');
  await pick('Mostrar', 'Solo sin ver');
  await sleep(800);
  const last = discover[discover.length - 1];
  check(/\/discover\/tv\?/.test(last) && /with_genres=10765/.test(last) && /first_air_date\.gte=1990-01-01/.test(last) && /first_air_date\.lte=1999-12-31/.test(last) &&
    /vote_average\.gte=7/.test(last) && /with_watch_providers=8/.test(last) && /sort_by=vote_average\.desc/.test(last), 'consulta a TMDB con todos los filtros', last);
  const grid = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.grid .card .name')).map((x) => x.textContent).join(', '), top);
  check(grid === 'Sin ver', '«Solo sin ver» quita lo visto en Trakt', grid);
  await p.screenshot({ path: OUT + '/241-search-filters.png' });
  // al escribir se ocultan los filtros; al borrar vuelven
  const shown = () => p.evaluate((top) => eval(top).querySelector('.chips-row .row-title') && Array.from(eval(top).querySelectorAll('.chips-row')).some((r) => r.offsetHeight > 0 && /Tipo/.test(r.textContent)), top);
  await p.evaluate((top) => { const i = eval(top).querySelector('input'); i.value = 'matrix'; i._ondone('matrix'); }, top); await sleep(500);
  check(!(await shown()), 'con texto, sin filtros');
  const found = (await rows()).filter((r) => !/^(Tipo|Género|Año|Nota mínima|Plataforma|Orden|Mostrar|Búsquedas recientes):/.test(r)).join(' | ');
  check(found === 'Anime: Kitsu búsqueda | Películas: Peli | Series: Serie', 'resultados en Anime, Películas y Series por separado', found);
  await p.evaluate((top) => { const i = eval(top).querySelector('input'); i.value = ''; i.dispatchEvent(new Event('input')); }, top); await sleep(500);
  check(await shown(), 'al borrar, vuelven los filtros');

  // --- Ajustes: filas de Series (SkyShowtime oculta de serie; se puede mostrar)
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(600);
  check(await focusText('^Filas de Series'), 'Ajustes → General → Filas de Series');
  await key('Enter'); await sleep(600);
  const sky = await p.evaluate((top) => (Array.from(eval(top).querySelectorAll('.opt')).filter((x) => /SkyShowtime/.test(x.textContent))[0] || {}).textContent, top);
  check(/En SkyShowtime\s*Oculta/.test(sky || ''), 'SkyShowtime oculta de serie', sky);
  await focusText('En SkyShowtime'); await key('Enter'); await sleep(300);
  await focusText('^Mostrar$'); await key('Enter'); await sleep(300);
  const saved = await p.evaluate(() => JSON.stringify(StremTV.settings.seriesRows.hidden['prov:skyshowtime']));
  check(saved === 'false', 'mostrarla se guarda', saved);

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
