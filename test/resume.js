// Retomar desde Trakt: película y episodio dejados a medias en otro dispositivo (sin progreso en la tele).
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
      if (u.indexOf('/sync/playback') >= 0) return json(req, [
        { type: 'movie', progress: 70.4, movie: { title: 'Shawshank', ids: { imdb: 'tt0111161' } } },
        { type: 'episode', progress: 40, show: { title: 'Breaking Bad', ids: { imdb: 'tt0903747' } }, episode: { season: 1, number: 3 } }]);
      return json(req, []);
    }
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [{ name: '[AD+] Torrentio\n1080p', title: 'X.1080p.mkv\n💾 1 GB', url: VIDEO }] });
    if (u.indexOf('opensubtitles-v3') >= 0) return json(req, { subtitles: [] });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', hideWatched: false }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(3000);
  console.log('película:', await p.evaluate(() => Array.from(document.querySelectorAll('.detail .btn')).map((x) => x.textContent).join(' | ')), '· foco:', await p.evaluate(() => StremTV.Nav.cur.textContent));
  await key('Enter'); await sleep(2500);
  console.log('arranca en:', await p.evaluate(() => StremTV.Player.time.toFixed(1) + ' s de ' + StremTV.Player.duration.toFixed(1)));
  await key('Escape'); await sleep(500); await key('Escape'); await sleep(800);
  console.log('película tras verla aquí (manda lo local):', await p.evaluate(() => document.querySelector('.detail .btn').textContent));
  await key('Escape'); await sleep(500);
  await p.evaluate(() => StremTV.open('series', 'tt0903747')); await sleep(3500);
  console.log('serie, foco:', await p.evaluate(() => StremTV.Nav.cur.textContent), '· barra:', await p.evaluate(() => { const b = StremTV.Nav.cur.querySelector('.pbar'); return b && b.style.width; }));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
