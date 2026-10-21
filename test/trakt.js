// Trakt (API simulada) + anime (Kitsu real): vinculación, filas, scrobble y episodios vistos.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const page = await browser.newPage();
  const errors = [], scrobbles = [];
  let tokenPolls = 0;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setRequestInterception(true);
  const json = (req, status, body) => req.respond({ status, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, contentType: 'application/json', body: body === null ? '' : JSON.stringify(body) });
  page.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.endsWith('/oauth/device/code')) return json(req, 200, { device_code: 'dev', user_code: 'AB12CD34', verification_url: 'https://trakt.tv/activate', expires_in: 600, interval: 1 });
      if (u.endsWith('/oauth/device/token')) return ++tokenPolls < 2 ? json(req, 400, null) : json(req, 200, { access_token: 'acc', refresh_token: 'ref', expires_in: 7776000, created_at: Math.floor(Date.now() / 1000) });
      if (u.endsWith('/users/settings')) return json(req, 200, { user: { username: 'victor' } });
      if (u.indexOf('/sync/watchlist') >= 0 && req.method() === 'GET') return json(req, 200, [{ type: 'movie', movie: { title: 'Dune: Part Two', ids: { imdb: 'tt15239678' } } }, { type: 'show', show: { title: 'Shogun', ids: { imdb: 'tt2788316' } } }]);
      if (u.indexOf('/sync/watchlist') >= 0) return json(req, 201, {});
      if (u.indexOf('/sync/playback') >= 0) return json(req, 200, [{ type: 'episode', progress: 40, episode: { season: 1, number: 3 }, show: { title: 'Sousou no Frieren', ids: { imdb: 'tt22248376' } } }]);
      if (u.indexOf('/recommendations/') >= 0) return json(req, 200, [{ title: 'Oppenheimer', ids: { imdb: 'tt15398776' } }]);
      if (u.indexOf('/progress/watched') >= 0) return json(req, 200, { seasons: [{ number: 1, episodes: [{ number: 1, completed: true }, { number: 2, completed: true }] }], next_episode: { season: 1, number: 3 } });
      if (u.indexOf('/scrobble/') >= 0) { scrobbles.push(u.split('/scrobble/')[1] + ' ' + req.postData()); return json(req, 201, {}); }
      return json(req, 404, {});
    }
    if (u.indexOf('torrentio.strem.fun') >= 0 && u.indexOf('/stream/') >= 0) {
      return json(req, 200, { streams: [{ name: '[RD+] Torrentio\n1080p', title: 'Frieren.S01E03.1080p.mkv\n👤 50 💾 1.4 GB ⚙️ Nyaa', url: VIDEO }] });
    }
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(250); } };
  const go = async (re) => { const ok = await page.evaluate((src) => { const r = new RegExp(src); const e = StremTV.Nav.items().filter((x) => r.test(x.textContent))[0]; if (e) StremTV.Nav.focus(e); return !!e; }, re); if (!ok) console.log('NO ENCONTRADO', re); await key('Enter'); };
  const focused = () => page.evaluate(() => { const f = document.querySelector('.focused'); return f ? (f.textContent || f.value || '').replace(/\s+/g, ' ').slice(0, 80) : null; });

  await page.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ key: 'FAKE' })); localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'cid', clientSecret: 'sec' })); });
  await page.reload({ waitUntil: 'networkidle2' }); await sleep(1500);

  // Ajustes -> Vincular
  await go('^Ajustes$'); await sleep(600);
  await go('Vincular con Trakt'); await sleep(800);
  await page.screenshot({ path: OUT + '/20-trakt-code.png' });
  await sleep(3000);
  console.log('estado tras vincular:', await page.evaluate(() => document.querySelector('#toast').textContent), '|', await focused());
  await page.screenshot({ path: OUT + '/21-trakt-linked.png' });

  // Inicio con filas de Trakt
  await key('Escape'); await sleep(2500);
  console.log('filas inicio:', await page.evaluate(() => Array.from(document.querySelectorAll('.row-title')).map((e) => e.textContent).join(' | ')));
  await page.screenshot({ path: OUT + '/22-home-trakt.png' });

  // Anime
  await go('^Anime$'); await sleep(3500);
  console.log('filas anime:', await page.evaluate(() => Array.from(document.querySelectorAll('.row-title')).filter((e) => e.offsetWidth).map((e) => e.textContent).join(' | ')));
  await page.screenshot({ path: OUT + '/23-anime.png' });

  // Abrir Frieren por búsqueda directa del detalle (kitsu)
  await page.evaluate(() => StremTV.open('series', 'kitsu:46474')); await sleep(3500);
  console.log('foco en detalle anime (debe ser ep 3):', await focused());
  await page.screenshot({ path: OUT + '/24-anime-detail.png' });
  await key('Enter'); await sleep(2500);
  await key('Enter'); await sleep(5000);
  await key('Enter'); await sleep(1500); // pausa
  await key('Escape'); await sleep(1500);
  console.log('scrobbles:\n  ' + scrobbles.join('\n  '));
  console.log('\nERRORES:', errors.length ? errors.join('\n') : 'ninguno');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
