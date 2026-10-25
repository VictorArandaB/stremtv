// «Sorpréndeme» en Anime, Películas y Series: abre la ficha de un título sin ver ni empezar de las recomendaciones de TMDB
// de lo visto y valorado en Trakt (sin anime en Series, solo anime en Anime), la segunda pulsación abre otro, y sin clave
// de TMDB usa las recomendaciones de Trakt; sin Trakt ni TMDB, «Mejor valoradas». Trakt, TMDB y Cinemeta se simulan.
// Sale con código 1 si algo falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
const imdbOf = (id) => 'tt' + String(id).padStart(7, '0');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: hdr, contentType: 'application/json', body: JSON.stringify(o) });
  // resultados de TMDB: [id, nombre, { anime, nota, votos }]
  const names = {};
  const tm = (list) => ({ page: 1, total_pages: 1, results: list.map(([id, n, o = {}]) => {
    names[imdbOf(id)] = n;
    return { id, name: n, title: n, overview: 'Sinopsis', first_air_date: '2020-01-01', release_date: '2020-01-01', vote_average: o.vote || 8, vote_count: o.votes || 900,
      genre_ids: o.anime ? [16, 10759] : [18], original_language: o.anime ? 'ja' : 'en' };
  }) });
  const RECS = {
    // la serie valorada con un 8: dos buenas sin ver; vista, empezada, con mala nota, con pocos votos y anime no valen
    'tv/20': tm([[501, 'SerieVista'], [502, 'SerieEmpezada'], [503, 'RecSerieA'], [504, 'RecSerieB'], [505, 'SerieMala', { vote: 5 }],
      [507, 'SeriePocosVotos', { votes: 20 }], [506, 'AnimeEnSeries', { anime: true }],
      // como Breaking Bad: no sale en la lista de vistos, pero su progreso en Trakt dice que está vista (se descarta al elegirla)
      [508, 'VistaSoloEnProgreso']]),
    // el anime valorado con un 9
    'tv/30': tm([[601, 'RecAnimeA', { anime: true }], [602, 'RecAnimeB', { anime: true }], [603, 'NoAnimeEnAnime']]),
    'movie/10': tm([[701, 'RecPeliA'], [702, 'RecPeliB'], [703, 'AnimePeli', { anime: true }]]),
    // la odiada (un 3) no es semilla: lo suyo no debe salir
    'movie/40': tm([[801, 'DeLaOdiada']])
  };
  const tmdbReqs = [];
  let traktRecs = 0;
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('api.themoviedb.org') >= 0) {
      tmdbReqs.push(u);
      const r = /\/3\/(tv|movie)\/(\d+)\/recommendations/.exec(u);
      if (r) return json(req, RECS[r[1] + '/' + r[2]] || { results: [] });
      const x = /\/3\/(tv|movie)\/(\d+)\/external_ids/.exec(u);
      if (x) return json(req, { imdb_id: imdbOf(x[2]) });
      return json(req, { results: [] });
    }
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/search/tmdb/508') >= 0) return json(req, [{ type: 'show', show: { title: 'VistaSoloEnProgreso', ids: { trakt: 508, tmdb: 508 } } }]);
      if (u.indexOf('/shows/508/progress/watched') >= 0 || u.indexOf('/shows/' + imdbOf(508) + '/progress/watched') >= 0) return json(req, { aired: 62, completed: 62 });
      if (u.indexOf('/sync/ratings') >= 0) return json(req, [
        { type: 'movie', rating: 9, movie: { title: 'SemillaPeli', ids: { imdb: 'tt0000010', tmdb: 10 }, genres: ['drama'] } },
        { type: 'show', rating: 8, show: { title: 'SemillaSerie', ids: { imdb: 'tt0000020', tmdb: 20 }, genres: ['drama'] } },
        { type: 'show', rating: 9, show: { title: 'SemillaAnime', ids: { imdb: 'tt0000030', tmdb: 30 }, genres: ['anime', 'action'] } },
        { type: 'movie', rating: 3, movie: { title: 'Odiada', ids: { imdb: 'tt0000040', tmdb: 40 }, genres: ['drama'] } }]);
      if (u.indexOf('/sync/watched/movies') >= 0) return json(req, [
        { plays: 1, movie: { title: 'SemillaPeli', ids: { imdb: 'tt0000010', tmdb: 10 }, genres: ['drama'] } },
        { plays: 1, movie: { title: 'Odiada', ids: { imdb: 'tt0000040', tmdb: 40 }, genres: ['drama'] } }]);
      if (u.indexOf('/sync/watched/shows') >= 0) return json(req, [
        { show: { title: 'SemillaSerie', ids: { imdb: 'tt0000020', tmdb: 20, trakt: 20 }, aired_episodes: 1, genres: ['drama'] }, last_watched_at: '2024-01-01', seasons: [{ number: 1, episodes: [{ number: 1 }] }] },
        { show: { title: 'SerieVista', ids: { imdb: 'tt0000501', tmdb: 501, trakt: 501 }, aired_episodes: 1 }, last_watched_at: '2024-01-01', seasons: [{ number: 1, episodes: [{ number: 1 }] }] },
        { show: { title: 'SerieEmpezada', ids: { imdb: 'tt0000502', tmdb: 502, trakt: 502 }, aired_episodes: 9 }, last_watched_at: '2024-01-01', seasons: [{ number: 1, episodes: [{ number: 1 }] }] }]);
      if (u.indexOf('/recommendations/shows') >= 0) {
        traktRecs++;
        return json(req, [{ title: 'TraktVista', ids: { imdb: 'tt0000501', tmdb: 501 } }, { title: 'TraktNueva', ids: { imdb: 'tt0000901', tmdb: 901 } },
          { title: 'TraktAnime', ids: { imdb: 'tt0000902', tmdb: 902 }, genres: ['anime'] }]);
      }
      return json(req, []);
    }
    if (u.indexOf('v3-cinemeta') >= 0 && u.indexOf('/catalog/') >= 0) {
      const t = /movie/.test(u) ? 'movie' : 'series';
      if (/imdbRating/.test(u)) return json(req, { metas: [{ id: 'tt0111161', type: t, name: 'TopVistaEnLaTele', poster: '' },
        { id: 'tt0111163', type: t, name: 'TopSinVer', poster: '' }, { id: 'tt0111162', type: t, name: 'TopAnime', genres: ['Animation'], country: 'Japan', poster: '' }] });
      return json(req, { metas: [] });
    }
    const m = /\/meta\/(movie|series)\/(tt\d+)\.json/.exec(u);
    if (m) {
      const n = names[m[2]] || { tt0000901: 'TraktNueva', tt0000902: 'TraktAnime', tt0000501: 'TraktVista', tt0111161: 'TopVistaEnLaTele', tt0111163: 'TopSinVer', tt0111162: 'TopAnime' }[m[2]];
      return json(req, { meta: n ? { id: m[2], type: m[1], name: n, videos: [] } : {} });
    }
    if (u.indexOf('/catalog/') >= 0 || u.indexOf('/meta/') >= 0) return json(req, { metas: [], meta: {} });
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return req.continue();
    return req.respond({ status: 404, headers: hdr, body: '' });
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';
  const focusText = async (re, sel = '.f') => p.evaluate((top, re, sel) => {
    const x = Array.from(eval(top).querySelectorAll(sel)).filter((e) => new RegExp(re).test(e.textContent) && (e.offsetWidth || e.offsetHeight))[0];
    if (x) StremTV.Nav.focus(x);
    return !!x;
  }, top, re, sel);
  const tab = async (name) => { await focusText('^' + name + '$', '.tab'); await key('Enter'); await sleep(1500); };
  const ALL = ['RecSerieA', 'RecSerieB', 'SerieVista', 'SerieEmpezada', 'SerieMala', 'SeriePocosVotos', 'AnimeEnSeries', 'RecAnimeA', 'RecAnimeB', 'NoAnimeEnAnime',
    'RecPeliA', 'RecPeliB', 'AnimePeli', 'DeLaOdiada', 'TraktVista', 'TraktNueva', 'TraktAnime', 'TopVistaEnLaTele', 'TopSinVer', 'TopAnime'];
  // pulsa «Sorpréndeme» y dice qué ficha se ha abierto (y el aviso que salió al pulsar)
  const surprise = async () => {
    const depth = await p.evaluate(() => StremTV.stack.length);
    if (!(await focusText('^Sorpréndeme$'))) return { name: '(sin botón)' };
    // los avisos que salen (el de «buscando» dura poco: con todo simulado, enseguida lo sustituye «Cargando…»)
    await p.evaluate(() => {
      const t = document.getElementById('toast');
      window.__toasts = [];
      if (window.__toastObs) window.__toastObs.disconnect();
      window.__toastObs = new MutationObserver(() => window.__toasts.push(t.textContent));
      window.__toastObs.observe(t, { childList: true, characterData: true, subtree: true });
    });
    await p.keyboard.press('Enter');
    await sleep(60);
    const toastTxt = await p.evaluate(() => window.__toasts[0]);
    for (let i = 0; i < 40 && (await p.evaluate((d) => StremTV.stack.length === d, depth)); i++) await sleep(150);
    await sleep(500);
    const name = await p.evaluate((top, all) => {
      if (StremTV.stack.length < 3) return '(ninguna ficha: ' + document.getElementById('toast').textContent + ')';
      const t = eval(top).textContent;
      return all.filter((n) => t.indexOf(n) >= 0).join(',') || '(ficha sin nombre)';
    }, top, ALL);
    return { name, toast: toastTxt };
  };
  const back = async () => { await key('Escape'); await sleep(600); };

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, tmdbKey: 'k', key: 'K', debrid: 'alldebrid', hideWatched: false }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);

  // --- Series: el botón, debajo de las pestañas (▼ desde la pestaña)
  await tab('Series');
  check(await p.evaluate(() => StremTV.Nav.cur.textContent === 'Series'), 'el foco sigue empezando en la pestaña Series');
  // en Series, al lado está «Calendario de tus series ›»: ▼ cae en el más cercano a la pestaña y ◀ lleva a «Sorpréndeme»
  await key('ArrowDown');
  if (await p.evaluate(() => /Calendario/.test(StremTV.Nav.cur.textContent))) await key('ArrowLeft');
  check(await p.evaluate(() => StremTV.Nav.cur.textContent === 'Sorpréndeme'), '▼ desde la pestaña llega a «Sorpréndeme»', await p.evaluate(() => StremTV.Nav.cur.textContent));
  const firstRow = await p.evaluate((top) => { const v = eval(top).querySelector('.vscroll'); return v.firstElementChild.className + ' · ' + (v.querySelector('.row-title') || {}).textContent; }, top);
  check(/^surprise · Para ti/.test(firstRow), 'el botón va encima de la primera fila', firstRow);
  await p.screenshot({ path: OUT + '/surprise-series.png' });
  const s1 = await surprise();
  check(s1.toast === 'Buscando algo para ti…', 'mientras busca, «Buscando algo para ti…»', s1.toast);
  check(s1.name === 'RecSerieA' || s1.name === 'RecSerieB', 'Series: una recomendada sin ver, con buena nota y sin anime', s1.name);
  check(tmdbReqs.some((u) => /\/tv\/20\/recommendations/.test(u)) && !tmdbReqs.some((u) => /\/movie\/40\/recommendations/.test(u)), 'recomendaciones de la serie valorada, no de la odiada');
  await back();
  const n1 = tmdbReqs.length;
  const s2 = await surprise();
  check((s2.name === 'RecSerieA' || s2.name === 'RecSerieB') && s2.name !== s1.name, 'la segunda pulsación abre otra', s1.name + ' → ' + s2.name);
  check(!tmdbReqs.slice(n1).some((u) => /recommendations/.test(u)), 'la segunda vez no vuelve a pedir recomendaciones');
  await back();

  // --- Anime: solo anime
  await tab('Anime');
  const a1 = await surprise();
  check(a1.name === 'RecAnimeA' || a1.name === 'RecAnimeB', 'Anime: solo anime recomendado', a1.name);
  await back();
  const a2 = await surprise();
  check((a2.name === 'RecAnimeA' || a2.name === 'RecAnimeB') && a2.name !== a1.name, 'Anime: la segunda, otra', a1.name + ' → ' + a2.name);
  await back();

  // --- Películas
  await tab('Películas');
  const m1 = await surprise();
  check(m1.name === 'RecPeliA' || m1.name === 'RecPeliB', 'Películas: película recomendada sin anime', m1.name);
  await back();

  // --- sin clave de TMDB: recomendaciones de Trakt sin lo visto
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('stv.settings')); s.tmdbKey = ''; localStorage.setItem('stv.settings', JSON.stringify(s)); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  const before = tmdbReqs.length;
  await tab('Series');
  const t1 = await surprise();
  check(t1.name === 'TraktNueva', 'sin TMDB: la recomendación de Trakt sin ver ni anime', t1.name);
  check(traktRecs > 0 && tmdbReqs.length === before, 'sin TMDB no se pide nada a TMDB');
  await back();
  await tab('Anime');
  const t2 = await surprise();
  check(t2.name === 'TraktAnime', 'sin TMDB, en Anime: la de Trakt que es anime', t2.name);
  await back();

  // --- sin Trakt ni TMDB: «Mejor valoradas» sin lo visto en la tele ni anime
  await p.evaluate(() => {
    localStorage.removeItem('stv.trakt');
    localStorage.setItem('stv.progress', JSON.stringify({ tt0111161: { videoId: 'tt0111161', metaId: 'tt0111161', type: 'series', name: 'TopVistaEnLaTele', t: 0, d: 0, done: true, ts: Date.now() } }));
  });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  await tab('Series');
  const c1 = await surprise();
  check(c1.name === 'TopSinVer', 'sin Trakt ni TMDB: una de «Mejor valoradas» sin ver ni anime', c1.name);
  await back();
  const c2 = await surprise();
  check(/^\(ninguna ficha: No he encontrado/.test(c2.name), 'si ya no queda nada, lo dice', c2.name);

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
