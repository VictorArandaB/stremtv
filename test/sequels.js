// Series que Trakt tiene como una sola e IMDb parte en dos (Bleach: en Trakt la T2 es Thousand-Year Blood War, que en
// Cinemeta es otra serie, tt14986406): la ficha de Bleach trae la continuación como temporadas siguientes, «▶ Ver» va al
// siguiente de Trakt en ella, las fuentes se piden con su id y lo visto va a Trakt como Bleach T2.
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
  // Cinemeta: Bleach T1 y T2 de un episodio (2004) y la continuación aparte, T1 de 2 (2022); Trakt: T1 de 2 y T2 de 2
  const old = [[1, 1, '2004-10-05'], [2, 1, '2005-01-11']].map((x) => ({ id: 'tt0434665:' + x[0] + ':' + x[1], season: x[0], episode: x[1], name: 'Viejo ' + x[0], released: x[2] + 'T00:00:00.000Z' }));
  const tybw = [[1, 1, '2022-10-10'], [1, 2, '2022-10-17']].map((x) => ({ id: 'tt14986406:' + x[0] + ':' + x[1], season: x[0], episode: x[1], name: 'TYBW ' + x[1], imdb_id: 'tt1707386' + x[1], released: x[2] + 'T00:00:00.000Z' }));
  const history = [], streams = [];
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('/meta/series/tt0434665.json') >= 0) return json(req, { meta: { id: 'tt0434665', type: 'series', name: 'Bleach', videos: old } });
    if (u.indexOf('/meta/series/tt14986406.json') >= 0) return json(req, { meta: { id: 'tt14986406', type: 'series', name: 'Bleach: Thousand-Year Blood War', videos: tybw } });
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/shows/tt0434665/seasons') >= 0) return json(req, [
        { number: 1, episodes: [{ number: 1, first_aired: '2004-10-05T10:00:00.000Z' }, { number: 2, first_aired: '2005-01-11T10:00:00.000Z' }] },
        { number: 2, episodes: [{ number: 1, first_aired: '2022-10-10T15:00:00.000Z' }, { number: 2, first_aired: '2022-10-17T15:00:00.000Z' }] }]);
      if (u.indexOf('/sync/watched/shows') >= 0) return json(req, [{ show: { title: 'Bleach', ids: { imdb: 'tt0434665', trakt: 5 }, aired_episodes: 4 }, last_watched_at: '2026-10-30T10:00:00.000Z',
        seasons: [{ number: 1, episodes: [{ number: 1 }, { number: 2 }] }, { number: 2, episodes: [{ number: 1 }] }] }]);
      if (/\/shows\/(tt0434665|5)\/progress\/watched/.test(u)) return json(req, { aired: 4, completed: 3,
        seasons: [{ number: 1, episodes: [1, 2].map((n) => ({ number: n, completed: true })) }, { number: 2, episodes: [1, 2].map((n) => ({ number: n, completed: n === 1 })) }],
        next_episode: { season: 2, number: 2, first_aired: '2022-10-17T15:00:00.000Z' } });
      if (u.indexOf('/sync/history') >= 0 && req.method() === 'POST') { history.push(req.postData()); return json(req, {}, 201); }
      return json(req, []);
    }
    if (u.indexOf('/stream/') >= 0) { streams.push(u); return json(req, { streams: [] }); }
    req.continue();
  });
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, hideWatched: false, key: 'K', debrid: 'alldebrid' }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);

  // «Siguientes episodios»: Trakt dice 2x2, que en la ficha es la T3:E2 (la T1 de la continuación)
  const up = await p.evaluate(() => StremTV.Trakt.upNext().then((l) => l.map((m) => m.label).join(' | ')));
  check(up === 'Bleach · T3:E2', 'Siguientes episodios lleva a la continuación (Trakt: 2x2)', up);

  await p.evaluate(() => StremTV.open('series', 'tt0434665')); await sleep(3000);
  const play = await p.evaluate((top) => eval(top).querySelector('.btn.primary').textContent, top);
  check(play === '▶ Ver T3:E2', '«▶ Ver» va a la continuación, no a la serie antigua', play);
  const eps = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.ep')).map((e) => e.querySelector('.ep-title').textContent.slice(0, 2) + (e.classList.contains('seen') ? '✓' : '·')).join(' '), top);
  check(eps === '1.✓ 2.·', 'en la T3, el 1 visto (Trakt 2x1) y el 2 pendiente', eps);

  // verde sobre el T3:E2 → a Trakt como Bleach 2x2 (la serie principal, no el id del episodio en IMDb)
  await p.evaluate((top) => StremTV.Nav.focus(eval(top).querySelectorAll('.ep')[1]), top);
  await p.evaluate(() => { const e = new KeyboardEvent('keydown', { bubbles: true }); Object.defineProperty(e, 'keyCode', { get: () => 404 }); document.dispatchEvent(e); });
  await sleep(800);
  check(/"imdb":"tt0434665".*"seasons":\[\{"number":2,"episodes":\[\{"number":2\}\]\}\]/.test(history[0] || ''), 'marcar visto el T3:E2 manda a Trakt Bleach 2x2', history[0]);

  // las fuentes, con el id de la continuación
  await p.evaluate((top) => StremTV.Nav.focus(eval(top).querySelectorAll('.ep')[1]), top);
  await p.keyboard.press('Enter'); await sleep(1500);
  check(streams.some((u) => u.indexOf('/stream/series/tt14986406:1:2.json') >= 0), 'las fuentes se piden como tt14986406:1:2', streams.join(' '));

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
