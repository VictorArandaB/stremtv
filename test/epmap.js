// Numeración distinta en Trakt y en Cinemeta (como Mashle o The Apothecary Diaries: en Trakt una sola temporada):
// la ficha marca como vistos los episodios de la T2 de Cinemeta que Trakt tiene como T1:E3…, «▶ Ver» va al siguiente
// con la numeración de Cinemeta y lo que se marca como visto se manda a Trakt con la suya.
// Sale con código 1 si alguna comprobación falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o, status) => req.respond({ status: status || 200, headers: hdr, contentType: 'application/json', body: JSON.stringify(o) });
  const day = (d) => '2024-0' + d + '-10T14:30:00.000Z';
  // Cinemeta: T1 y T2 de 2 episodios; Trakt: una T1 de 4, con las mismas fechas
  const videos = [[1, 1, 1], [1, 2, 2], [2, 1, 3], [2, 2, 4]].map((x) => ({ id: 'tt9000001:' + x[0] + ':' + x[1], season: x[0], episode: x[1], name: 'Ep ' + x[0] + 'x' + x[1], released: day(x[2]) }));
  const history = [];
  let withAnnounced = false;
  // como Mashle ahora: Trakt suma una T2 que da por emitida y que en Cinemeta es la T3, aún sin fecha
  const videos2 = [[1, 1, 1], [1, 2, 2], [2, 1, 3], [2, 2, 4]].map((x) => ({ id: 'tt9000002:' + x[0] + ':' + x[1], season: x[0], episode: x[1], released: day(x[2]) }))
    .concat([{ id: 'tt9000002:3:1', season: 3, episode: 1 }]);
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('/meta/series/tt9000002.json') >= 0) return json(req, { meta: { id: 'tt9000002', type: 'series', name: 'Serie anunciada', videos: videos2 } });
    if (u.indexOf('/meta/series/tt9000001.json') >= 0) return json(req, { meta: { id: 'tt9000001', type: 'series', name: 'Serie de prueba', videos: videos } });
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/shows/tt9000001/seasons') >= 0) return json(req, [{ number: 0, episodes: [] }, { number: 1, episodes: [1, 2, 3, 4].map((n) => ({ number: n, first_aired: day(n) })) }]);
      if (u.indexOf('/shows/tt9000002/seasons') >= 0) return json(req, [{ number: 1, episodes: [1, 2, 3, 4].map((n) => ({ number: n, first_aired: day(n) })) }, { number: 2, episodes: [1, 2].map((n) => ({ number: n, first_aired: day(6) })) }]);
      if (/\/shows\/(tt9000002|78)\/progress\/watched/.test(u)) return json(req, { aired: 6, completed: 4, seasons: [], next_episode: { season: 2, number: 1, first_aired: day(6) } });
      if (u.indexOf('/sync/watched/shows') >= 0 && withAnnounced) return json(req, [{ show: { title: 'Serie anunciada', ids: { imdb: 'tt9000002', trakt: 78 }, aired_episodes: 6 }, last_watched_at: day(5),
        seasons: [{ number: 1, episodes: [1, 2, 3, 4].map((n) => ({ number: n })) }] }]);
      if (u.indexOf('/sync/watched/shows') >= 0) return json(req, [{ show: { title: 'Serie de prueba', ids: { imdb: 'tt9000001', trakt: 77 }, aired_episodes: 4 }, last_watched_at: day(5),
        seasons: [{ number: 1, episodes: [1, 2, 3].map((n) => ({ number: n })) }] }]);
      if (/\/shows\/(tt9000001|77)\/progress\/watched/.test(u)) return json(req, { aired: 4, completed: 3, seasons: [{ number: 1, episodes: [1, 2, 3, 4].map((n) => ({ number: n, completed: n <= 3 })) }], next_episode: { season: 1, number: 4, first_aired: day(4) } });
      if (u.indexOf('/sync/history') >= 0 && req.method() === 'POST') { history.push(req.postData()); return json(req, {}, 201); }
      return json(req, []);
    }
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [] });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';

  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, hideWatched: false, key: 'K', debrid: 'alldebrid' }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  await p.evaluate(() => StremTV.open('series', 'tt9000001')); await sleep(3000);

  const play = await p.evaluate((top) => eval(top).querySelector('.btn.primary').textContent, top);
  check(play === '▶ Ver T2:E2', '«▶ Ver» con la numeración de Cinemeta (Trakt dice 1x4)', play);
  const eps = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.ep')).map((e) => e.querySelector('.ep-title').textContent.slice(0, 2) + (e.classList.contains('seen') ? '✓' : '·')).join(' '), top);
  check(eps === '1.✓ 2.·', 'en la T2, el 1 visto (Trakt 1x3) y el 2 pendiente', eps);
  const map = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('stv.epmaps'))['tt9000001'].map));
  check(map === '{"2:1":"1:3","2:2":"1:4"}', 'equivalencia guardada en la tele', map);
  // verde sobre el T2:E2 → a Trakt como 1x4
  await p.evaluate((top) => StremTV.Nav.focus(eval(top).querySelectorAll('.ep')[1]), top);
  await p.evaluate(() => { const e = new KeyboardEvent('keydown', { bubbles: true }); Object.defineProperty(e, 'keyCode', { get: () => 404 }); document.dispatchEvent(e); });
  await sleep(800);
  check(/"seasons":\[\{"number":1,"episodes":\[\{"number":4\}\]\}\]/.test(history[0] || ''), 'marcar visto el T2:E2 manda a Trakt el 1x4', history[0]);

  // «Siguientes episodios» con la numeración de Cinemeta, aunque la equivalencia aún no estuviera guardada
  const up = await p.evaluate(() => { localStorage.removeItem('stv.epmaps'); StremTV.Trakt.epMaps = {}; StremTV.Trakt.upNextCache = null;
    return StremTV.Trakt.upNext().then((l) => l.map((m) => m.label).join(' | ')); });
  check(up === 'Serie de prueba · T2:E2', 'Siguientes episodios dice T2:E2 (Trakt: 1x4)', up);

  // la temporada que Trakt da por emitida y Cinemeta no: ni en «Siguientes episodios» ni como pendiente; equivalencia por orden
  const up2 = await p.evaluate(() => { StremTV.Trakt.upNextCache = null; StremTV.Trakt.watchedCache = null;
    return StremTV.Trakt.upNext().then((l) => l.map((m) => m.label).join(' | ')); }, withAnnounced = true);
  check(up2 === '', 'lo no emitido según Cinemeta no sale en Siguientes episodios', up2);
  const map2 = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('stv.epmaps'))['tt9000002']));
  check(/"3:1":"2:1"/.test(map2) && /"future":\["2:1"\]/.test(map2), 'su T3:E1 es la T2:E1 de Trakt, aún sin emitir', map2);

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
