const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIRST = 'tt34384900';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const json = (req, body) => req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/sync/watched/movies') >= 0) return json(req, [{ movie: { title: 'x', ids: { imdb: FIRST } } }]);
      if (u.indexOf('/sync/watched/shows') >= 0) return json(req, []);
      if (u.indexOf('/progress/watched') >= 0) return json(req, { seasons: [{ number: 1, episodes: [{ number: 1, completed: true }, { number: 2, completed: true }] }], next_episode: { season: 1, number: 3 } });
      return json(req, []);
    }
    req.continue();
  });
  const titles = () => p.evaluate(() => Array.from(document.querySelectorAll('.row')).slice(0, 3).map((r) => (r.querySelector('.row-title') || {}).textContent + ': ' + Array.from(r.querySelectorAll('.card .name')).slice(0, 3).map((n) => n.textContent).join(', ')).join('\n'));
  const eps = () => p.evaluate(() => Array.from(document.querySelectorAll('.ep .ep-title')).slice(0, 4).map((e) => e.textContent).join(' / ') + '  [foco: ' + ((document.querySelector('.focused') || {}).textContent || '').slice(0, 40) + ']');
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: false })); localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);
  console.log('INICIO (ocultar vistos):\n' + await titles());
  console.log('¿aparece la película vista?', await p.evaluate((id) => document.body.innerHTML.indexOf('/' + id + '/') >= 0, FIRST));
  await p.evaluate(() => StremTV.open('series', 'kitsu:46474')); await sleep(4000);
  console.log('FRIEREN:', await eps());
  console.log('botón:', await p.evaluate(() => Array.from(document.querySelectorAll('.btn')).map((x) => x.textContent).join(' | ')));
  await p.evaluate(() => { const t = Array.from(document.querySelectorAll('.btn')).filter((x) => /vistos/.test(x.textContent))[0]; StremTV.Nav.focus(t); t._onclick(t); }); await sleep(800);
  console.log('TRAS "Mostrar vistos":', await eps());
  await p.screenshot({ path: __dirname + '/shots/40-hide-seen.png' });
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
