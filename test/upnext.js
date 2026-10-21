// Trakt en Inicio: «Siguientes episodios» (series a medias, sin las terminadas ni ocultas) y «Mi lista» separada sin el tope de 40.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (trakt, imdb, title, aired, watched, when) => ({ last_watched_at: when, show: { title, aired_episodes: aired, ids: { trakt, imdb } },
  seasons: [{ number: 1, episodes: Array.from({ length: watched }, (_, i) => ({ number: i + 1 })) }] });
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('api.trakt.tv') < 0) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (u.indexOf('/sync/watched/shows') >= 0) return json(req, [
      show(1, 'tt0903747', 'Breaking Bad', 62, 62, '2026-10-01T00:00:00Z'),      // terminada
      show(2, 'tt0944947', 'Game of Thrones', 73, 20, '2026-10-10T00:00:00Z'),   // a medias
      show(3, 'tt2861424', 'Rick and Morty', 71, 30, '2026-10-15T00:00:00Z'),    // a medias, más reciente
      show(4, 'tt0386676', 'The Office', 201, 50, '2026-10-12T00:00:00Z'),       // oculta en Trakt
      show(5, null, 'Sin IMDb', 10, 2, '2026-10-16T00:00:00Z'),
      show(6, 'tt1475582', 'Sherlock', 13, 5, '2026-10-14T00:00:00Z')]);         // está en pausa a medias (playback)
    if (u.indexOf('/users/hidden/progress_watched') >= 0) return json(req, [{ show: { ids: { trakt: 4 } } }]);
    const pm = /\/shows\/(\d+)\/progress\/watched/.exec(u);
    if (pm) return json(req, { next_episode: { season: 1, number: { 2: 21, 3: 31, 6: 6 }[pm[1]] || 1 } });
    if (u.indexOf('/sync/playback') >= 0) return json(req, [{ type: 'episode', progress: 40, show: { title: 'Sherlock', ids: { imdb: 'tt1475582' } }, episode: { season: 1, number: 6 } }]);
    if (u.indexOf('/sync/watchlist') >= 0) return json(req, Array.from({ length: 60 }, (_, i) => ({ movie: { title: 'Peli ' + i, ids: { imdb: 'tt90000' + (10 + i) } } }))
      .concat(Array.from({ length: 10 }, (_, i) => ({ show: { title: 'Serie ' + i, ids: { imdb: 'tt80000' + (10 + i) } } }))));
    return json(req, []);
  });
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', hideWatched: false }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(4000);
  const rows = await p.evaluate(() => Array.from(document.querySelectorAll('.row')).map((r) => {
    const t = r.querySelector('.row-title'); const names = Array.from(r.querySelectorAll('.card .name')).map((x) => x.textContent);
    return (t ? t.textContent : '') + ' [' + names.length + ']: ' + names.slice(0, 4).join(' | ');
  }).filter((x) => /Trakt|Siguientes|Mi lista/.test(x)));
  console.log(rows.join('\n'));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
