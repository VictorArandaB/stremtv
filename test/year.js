// Tu año en StremTV: historial de Trakt del año paginado (con y sin la cabecera X-Pagination-Page-Count), totales, series más
// vistas, series terminadas, películas mejor puntuadas, géneros, mes, racha y maratón; lo calculado se guarda (el año en curso un
// día, los pasados para siempre); entradas en Ajustes y en Inicio (solo en diciembre y enero) y el modo sin Trakt (lo de esta
// tele). La fecha de la app se simula (localStorage «test.now»). Trakt y Cinemeta se simulan. Sale con código 1 si algo falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };

// --- historial simulado de 2026 (a las 12:00 UTC: el mismo día en hora de Madrid)
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
const H2026 = [];
const show = (imdb, title, runtime, genres, trakt) => ({ title, ids: { imdb, trakt }, runtime, genres });
const A = show('tt1000001', 'Serie A', 25, ['comedy'], 1), B = show('tt1000002', 'Serie B', 30, ['drama'], 2), C = show('tt1000003', 'Serie C', 60, ['science-fiction', 'drama'], 3);
// Serie A: 300 episodios, dos cada dos días desde el 15 de enero (hasta el 9 de noviembre)
for (let k = 0; k < 150; k++) for (let j = 0; j < 2; j++) {
  const n = k * 2 + j;
  H2026.push({ watched_at: new Date(day(2026, 1, 15).getTime() + k * 2 * 86400000).toISOString(), type: 'episode', show: A, episode: { season: 1 + Math.floor(n / 100), number: n % 100 + 1, runtime: 25 } });
}
// Serie B: racha del 1 al 12 de diciembre (un episodio al día, sin runtime en el episodio: vale el de la serie)
for (let d = 1; d <= 12; d++) H2026.push({ watched_at: day(2026, 12, d).toISOString(), type: 'episode', show: B, episode: { season: 1, number: d } });
// Serie C: maratón el 7 de junio (10 episodios de 60 min)
for (let e = 1; e <= 10; e++) H2026.push({ watched_at: new Date(day(2026, 6, 7).getTime() + e * 60000).toISOString(), type: 'episode', show: C, episode: { season: 1, number: e, runtime: 60 } });
const movie = (imdb, title, runtime) => ({ title, ids: { imdb, trakt: 900 + +imdb.slice(-1) }, runtime, genres: ['action'] });
const M1 = movie('tt2000001', 'Peli Uno', 120), M2 = movie('tt2000002', 'Peli Dos', 100), M3 = movie('tt2000003', 'Peli Tres', 90);
H2026.push({ watched_at: day(2026, 4, 2).toISOString(), type: 'movie', movie: M1 }, { watched_at: day(2026, 10, 7).toISOString(), type: 'movie', movie: M1 },
  { watched_at: day(2026, 8, 4).toISOString(), type: 'movie', movie: M2 }, { watched_at: day(2026, 9, 1).toISOString(), type: 'movie', movie: M3 });
H2026.sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at)); // como Trakt: lo más reciente primero
// 2025: una película
const H2025 = [{ watched_at: day(2025, 1, 2).toISOString(), type: 'movie', movie: movie('tt2000005', 'Peli Vieja', 100) }];
// lo esperado (minutos: 300×25 + 12×30 + 10×60 + 120×2 + 100 + 90 = 8890 → 148 h)
const WD = ['Domingos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados'];
const wdMin = [0, 0, 0, 0, 0, 0, 0];
H2026.forEach((it) => { wdMin[new Date(it.watched_at).getDay()] += it.movie ? it.movie.runtime : it.episode.runtime || it.show.runtime; });
const wdBest = WD[wdMin.indexOf(Math.max.apply(null, wdMin))];

(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  // fecha simulada: la de localStorage «test.now» (si la hay), desde antes de cargar la app
  await p.evaluateOnNewDocument(() => {
    let t = null;
    try { t = localStorage.getItem('test.now'); } catch (e) { /* sin acceso */ }
    if (!t) return;
    const Real = Date, off = +t - Real.now();
    class Fake extends Real {
      constructor(...a) { if (a.length) super(...a); else super(Real.now() + off); }
      static now() { return Real.now() + off; }
    }
    window.Date = Fake;
  });
  await p.setRequestInterception(true);
  const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o, extra) => req.respond({ status: 200, headers: Object.assign({}, hdr, extra || {}), contentType: 'application/json', body: JSON.stringify(o) });
  const hist = { 2026: 0, 2025: 0, probes: 0 };
  let noHeader = false;
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/sync/history?') >= 0) {
        const q = new URL(u).searchParams;
        const y = new Date(Date.parse(q.get('start_at')) + 7 * 86400000).getUTCFullYear();
        const all = y === 2026 ? H2026 : y === 2025 ? H2025 : [];
        const limit = +q.get('limit'), page = +(q.get('page') || 1);
        if (limit === 1) { hist.probes++; return json(req, all.slice(0, 1)); }
        hist[y] = (hist[y] || 0) + 1;
        const pages = Math.max(1, Math.ceil(all.length / limit));
        const extra = noHeader ? {} : { 'X-Pagination-Page-Count': String(pages), 'X-Pagination-Page': String(page), 'Access-Control-Expose-Headers': 'X-Pagination-Page-Count, X-Pagination-Page' };
        // un poco lento, para ver el progreso
        return setTimeout(() => json(req, all.slice((page - 1) * limit, page * limit), extra), 400);
      }
      if (u.indexOf('/sync/ratings/movies') >= 0) return json(req, [{ rating: 9, rated_at: '2026-04-02T20:00:00.000Z', movie: M1 }, { rating: 7, movie: M3 },
        { rating: 10, movie: movie('tt2000009', 'Vista otro año', 100) }]);
      if (u.indexOf('/sync/watched/shows') >= 0) return json(req, [
        { show: Object.assign({ aired_episodes: 500 }, A), last_watched_at: '2026-11-09T12:00:00.000Z', seasons: [{ number: 1, episodes: new Array(100).fill(0).map((x, i) => ({ number: i + 1 })) }] },
        { show: Object.assign({ aired_episodes: 12 }, B), last_watched_at: '2026-12-12T12:00:00.000Z', seasons: [{ number: 1, episodes: new Array(12).fill(0).map((x, i) => ({ number: i + 1 })) }] },
        { show: Object.assign({ aired_episodes: 10 }, C), last_watched_at: '2026-06-07T12:10:00.000Z', seasons: [{ number: 0, episodes: [{ number: 1 }] }, { number: 1, episodes: new Array(10).fill(0).map((x, i) => ({ number: i + 1 })) }] },
        // terminada pero sin nada visto este año: no cuenta
        { show: { title: 'Serie D', ids: { imdb: 'tt1000004', trakt: 4 }, aired_episodes: 1 }, last_watched_at: '2026-05-01T12:00:00.000Z', seasons: [{ number: 1, episodes: [{ number: 1 }] }] }]);
      return json(req, []);
    }
    if (u.indexOf('/meta/') >= 0) return json(req, { meta: { videos: [] } });
    if (u.indexOf('/catalog/') >= 0) return json(req, { metas: [] });
    if (/images\.metahub|wsrv\.nl/.test(u)) return req.respond({ status: 404, headers: hdr, body: '' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';
  const focusText = async (re, sel = '.f') => p.evaluate((top, re, sel) => {
    const x = Array.from(eval(top).querySelectorAll(sel)).filter((e) => new RegExp(re).test(e.textContent) && (e.offsetWidth || e.offsetHeight))[0];
    if (x) StremTV.Nav.focus(x);
    return !!x;
  }, top, re, sel);
  const text = (sel) => p.evaluate((top, sel) => Array.from(eval(top).querySelectorAll(sel)).map((x) => x.textContent).join(' | '), top, sel);
  const stats = () => p.evaluate((top) => Array.from(eval(top).querySelectorAll('.yr-stat')).map((s) => Array.from(s.children).map((c) => c.textContent).filter(Boolean).join(' / ')), top);
  const waitStats = async () => { for (let i = 0; i < 60 && !(await p.evaluate((top) => !!eval(top).querySelector('.yr-stat') || /no hay nada|No se pudo/.test(eval(top).textContent), top)); i++) await sleep(250); };
  const boot = async (now, linked, extra) => {
    await p.evaluate((now, linked, extra) => {
      localStorage.clear();
      localStorage.setItem('test.now', String(now));
      localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, key: 'K', debrid: 'alldebrid', hideWatched: false }));
      localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }]));
      if (linked) localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9, user: 'yo' }));
      Object.keys(extra || {}).forEach((k) => localStorage.setItem(k, extra[k]));
    }, now, linked, extra || {});
    await p.reload({ waitUntil: 'networkidle2' }); await sleep(1200);
  };
  const openFromSettings = async () => {
    await p.evaluate(() => StremTV.openSettings()); await sleep(500);
    const ok = await focusText('Tu año en StremTV', '.opt');
    await key('Enter'); await sleep(300);
    return ok;
  };

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });

  // --- 15 de diciembre de 2026, con Trakt: recuadro en Inicio
  const DEC = day(2026, 12, 15).getTime();
  await boot(DEC, true);
  check(await p.evaluate(() => new Date().getFullYear() === 2026 && new Date().getMonth() === 11), 'fecha simulada: diciembre de 2026');
  const banner = await p.evaluate(() => { const x = document.querySelector('.yr-banner'); return x && x.offsetHeight ? x.textContent : ''; });
  check(/^Tu 2026 en StremTV/.test(banner), 'en diciembre, recuadro «Tu 2026 en StremTV» en Inicio', banner);
  const rowsOrder = await p.evaluate(() => { const s = document.querySelector('.yr-banner'); return s ? 'ok' : ''; });
  check(rowsOrder === 'ok', 'el recuadro está en Inicio');

  // OK en el recuadro: calcula con progreso y páginas seguidas
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.yr-banner'))); await key('Enter');
  const progressTexts = new Set();
  for (let i = 0; i < 40; i++) {
    const t = await p.evaluate((top) => { const s = eval(top).querySelector('.yr-status'); return s ? s.textContent : ''; }, top);
    if (t) progressTexts.add(t);
    if (await p.evaluate((top) => !!eval(top).querySelector('.yr-stat'), top)) break;
    await sleep(100);
  }
  const prog = Array.from(progressTexts).join(' · ');
  check(/Calculando tu año… 2\/2/.test(prog), 'progreso «Calculando tu año… 2/2»', prog);
  await waitStats(); await sleep(400);
  check(hist[2026] === 2, 'dos páginas del historial de 2026 (326 entradas, de 250 en 250)', hist[2026]);
  const head = await text('.yr-title');
  check(head === 'Tu 2026 en StremTV', 'título', head);
  check(/Con tu historial de Trakt/.test(await text('.yr-src')), 'dice que es de Trakt', await text('.yr-src'));
  let st = await stats();
  check(st[0] === '148 / horas / ≈ 6,2 días enteros de tele', 'horas totales', st[0]);
  check(st[1] === '3 / películas', 'películas (distintas)', st[1]);
  check(st[2] === '322 / episodios / de 3 series', 'episodios', st[2]);
  check(st[3] === '2 / series terminadas / al día con todo lo emitido', 'series terminadas este año (no la que no se vio este año ni la a medias)', st[3]);
  const posters = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.row')).filter((r) => r.querySelector('.card')).map((r) =>
    r.querySelector('.row-title').textContent + ': ' + Array.from(r.querySelectorAll('.card .name')).map((x) => x.textContent).join(', ')), top);
  check(posters[0] === 'Tus series del año: Serie A · 300 episodios, Serie B · 12 episodios, Serie C · 10 episodios', 'series más vistas', posters[0]);
  check(posters[1] === 'Tus películas mejor puntuadas: Peli Uno · tu nota: 9, Peli Tres · tu nota: 7', 'películas mejor puntuadas (solo las vistas este año)', posters[1]);
  const facts = st.slice(4, 8).join(' | ');
  check(/^Junio \/ tu mes con más tele \/ 23 h de pantalla/.test(st[4]), 'mes con más tele', st[4]);
  check(st[5] === wdBest + ' / tu día de sofá', 'día de la semana favorito', st[5] + ' (esperado ' + wdBest + ')');
  check(st[6] === '12 días / tu racha más larga / del 1 de diciembre al 12 de diciembre', 'racha más larga', st[6]);
  check(st[7] === '10 h / tu día de maratón / 7 de junio · 10 episodios', 'día de maratón', st[7]);
  const genres = st.slice(8, 12).join(' | ');
  check(/^84 % \/ Comedia \| 11 % \/ Drama \| 7 % \/ Ciencia ficción \| 5 % \/ Acción/.test(genres), 'géneros', genres);
  check(st[st.length - 1] === '15 de enero / lo primero que viste en 2026 / Serie A T1:E1', 'lo primero del año (numeración de Cinemeta)', st[st.length - 1]);
  const chips = await text('.chips .btn');
  check(chips === '2026 | 2025 | ↻ Recalcular', 'años con algo visto (los diez últimos, preguntando a Trakt)', chips + ' · consultas: ' + hist.probes);
  await p.screenshot({ path: OUT + '/260-year.png' });
  // ▼ recorre la pantalla hasta abajo
  await key('ArrowDown', 8);
  check(await p.evaluate(() => /lo primero/.test(StremTV.Nav.cur.textContent)), '▼ llega hasta el último recuadro');
  await p.screenshot({ path: OUT + '/261-year-bottom.png' });

  // --- 2025 con ◀ ▶ en los años
  await focusText('^2026$', '.chips .btn'); await key('ArrowRight'); await key('Enter');
  await sleep(300); await waitStats(); await sleep(300);
  st = await stats();
  check(await text('.yr-title') === 'Tu 2025 en StremTV' && st[0] === '1,7 / horas / Un año tranquilo' && st[1] === '1 / película', '2025: otro año', st.slice(0, 2).join(' | '));
  check(await p.evaluate(() => StremTV.Nav.cur.textContent === '2025' && StremTV.Nav.cur.classList.contains('primary')), 'el foco sigue en el año elegido');

  // --- caché: volver a abrir no pide nada
  await key('Escape'); await sleep(500);
  check(await p.evaluate(() => StremTV.stack.length === 1), 'Atrás vuelve a Inicio');
  const banner2 = await p.evaluate(() => document.querySelector('.yr-banner').textContent);
  check(/148 horas, 3 películas y 322 episodios/.test(banner2), 'el recuadro de Inicio ya dice las cifras', banner2);
  const before = hist[2026] + hist[2025];
  check(await openFromSettings(), 'Ajustes → «Tu año en StremTV»');
  await waitStats();
  check(hist[2026] + hist[2025] === before, 'al volver a abrir, lo guardado (sin pedir el historial)', hist[2026] + hist[2025] - before);
  check(await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('stv.year.2026')); return c && c.min === 8890 && c.y === 2026; }), 'guardado en stv.year.2026');
  await key('Escape'); await sleep(400);
  const sum = await p.evaluate(() => Array.from(document.querySelectorAll('.opt')).filter((o) => /Tu año/.test(o.textContent)).map((o) => o.lastChild.textContent)[0]);
  check(sum === '148 h · 3 películas · 322 episodios', 'resumen en el menú de Ajustes', sum);
  // año en curso: a los dos días se vuelve a calcular; uno pasado calculado ya terminado vale para siempre
  await p.evaluate(() => {
    ['2026', '2025'].forEach((y) => { const c = JSON.parse(localStorage.getItem('stv.year.' + y)); c.at -= 2 * 86400000; localStorage.setItem('stv.year.' + y, JSON.stringify(c)); });
  });
  await key('Escape'); await sleep(300);
  await openFromSettings(); await sleep(300); await waitStats(); await sleep(300);
  check(hist[2026] === 4, 'el año en curso, pasado un día, se vuelve a calcular', hist[2026]);
  await focusText('^2025$', '.chips .btn'); await key('Enter'); await sleep(300); await waitStats();
  check(hist[2025] === 1, '2025 (calculado en 2026) no se vuelve a pedir', hist[2025]);
  // sin la cabecera de paginación: hasta la primera página incompleta
  noHeader = true;
  await focusText('^2026$', '.chips .btn'); await key('Enter'); await sleep(300); await waitStats();
  await focusText('Recalcular', '.chips .btn'); await key('Enter'); await sleep(300);
  for (let i = 0; i < 30 && hist[2026] < 6; i++) await sleep(200);
  await sleep(500); await waitStats(); await sleep(300);
  st = await stats();
  check(hist[2026] === 6 && st[0].indexOf('148 / horas') === 0 && st[2].indexOf('322 /') === 0, '«Recalcular» sin X-Pagination-Page-Count: dos páginas y los mismos totales', hist[2026] + ' · ' + st[0]);
  noHeader = false;

  // --- en octubre, sin recuadro en Inicio (pero en Ajustes → Filas de Inicio, oculto)
  await boot(day(2026, 10, 25).getTime(), true);
  const octBanner = await p.evaluate(() => !!document.querySelector('.yr-banner'));
  check(!octBanner, 'en octubre no sale en Inicio');
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(400);
  await focusText('Filas de Inicio'); await key('Enter'); await sleep(500);
  const rowOpt = await p.evaluate((top) => (Array.from(eval(top).querySelectorAll('.opt')).filter((x) => /Tu año en StremTV/.test(x.textContent))[0] || {}).textContent, top);
  check(/Tu año en StremTV\s*Oculta/.test(rowOpt || ''), 'en Filas de Inicio, oculta fuera de temporada', rowOpt);

  // --- enero de 2027: el recuadro es del año que acaba de terminar
  await boot(day(2027, 1, 10).getTime(), true);
  const janBanner = await p.evaluate(() => { const x = document.querySelector('.yr-banner'); return x ? x.firstChild.textContent : ''; });
  check(janBanner === 'Tu 2026 en StremTV', 'en enero, «Tu 2026 en StremTV»', janBanner);
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.yr-banner'))); await key('Enter'); await sleep(300); await waitStats(); await sleep(300);
  check(await text('.yr-title') === 'Tu 2026 en StremTV' && (await stats())[0].indexOf('148') === 0, 'abre 2026');
  check(await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('stv.year.2026')); return c.at >= new Date(2027, 0, 1).getTime(); }), 'calculado con el año terminado: se guarda para siempre');

  // --- sin Trakt: lo de esta tele
  const now = day(2026, 12, 15).getTime(), ts = (m, d) => day(2026, m, d).getTime();
  const prog2 = {
    'tt3000001:1:1': { videoId: 'tt3000001:1:1', metaId: 'tt3000001', type: 'series', name: 'Local S', poster: '', label: 'Local S · T1:E1', t: 0, d: 2400, done: true, ts: ts(3, 3) },
    'tt3000001:1:2': { videoId: 'tt3000001:1:2', metaId: 'tt3000001', type: 'series', name: 'Local S', poster: '', label: 'Local S · T1:E2', t: 0, d: 2400, done: true, ts: ts(3, 4) },
    'tt3000001:1:3': { videoId: 'tt3000001:1:3', metaId: 'tt3000001', type: 'series', name: 'Local S', poster: '', label: 'Local S · T1:E3', t: 1200, d: 2400, done: false, ts: ts(3, 5) },
    'tt3000002': { videoId: 'tt3000002', metaId: 'tt3000002', type: 'movie', name: 'Local P', poster: '', t: 0, d: 7200, done: true, ts: ts(5, 1) },
    'tt3000003': { videoId: 'tt3000003', metaId: 'tt3000003', type: 'movie', name: 'Vieja', poster: '', t: 0, d: 7200, done: true, ts: day(2024, 5, 1).getTime() }
  };
  await boot(now, false, { 'stv.progress': JSON.stringify(prog2) });
  check(await openFromSettings(), 'sin Trakt, también en Ajustes');
  await waitStats(); await sleep(300);
  st = await stats();
  check(/Solo lo visto en esta tele/.test(await text('.yr-src')), 'avisa de que es solo esta tele', await text('.yr-src'));
  check(st[0].indexOf('3,7 / horas') === 0 && st[1] === '1 / película' && st[2] === '2 / episodios / de 1 serie' && !/terminad/.test(st.join()), 'totales de esta tele (sin series terminadas)', st.slice(0, 3).join(' | '));
  check(st.some((s) => s === '3 días / tu racha más larga / del 3 de marzo al 5 de marzo'), 'racha con lo de esta tele (también lo dejado a medias)', st.join(' | '));
  check(await text('.chips .btn') === '2026 | 2024', 'años de esta tele (sin «Recalcular»)', await text('.chips .btn'));
  await p.screenshot({ path: OUT + '/262-year-local.png' });

  // --- en inglés
  await p.evaluate(() => { StremTV.settings.lang = 'en'; });
  await key('Escape'); await sleep(300);
  await p.evaluate(() => StremTV.openSettings()); await sleep(400);
  const en = await p.evaluate(() => Array.from(document.querySelectorAll('.opt')).filter((o) => /in StremTV/.test(o.textContent)).map((o) => o.textContent)[0]);
  check(/Your year in StremTV/.test(en || '') && /movies/.test(en || ''), 'en inglés', en);

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
