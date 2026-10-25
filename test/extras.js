// Búsqueda (recientes y mientras escribes), Más como esto, saltar intro (AniSkip) y temporizador.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  const searches = [];
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (u.indexOf('/catalog/movie/top/search=') >= 0) { searches.push(decodeURIComponent(u.split('search=')[1])); return json(req, { metas: [{ id: 'tt0111161', type: 'movie', name: 'Resultado ' + searches.length }] }); }
    if (u.indexOf('/search=') >= 0) return json(req, { metas: [] });
    if (u.indexOf('api.trakt.tv/movies/tt0111161/related') >= 0) return json(req, [{ title: 'Parecida 1', ids: { imdb: 'tt0068646' } }, { title: 'Parecida 2', ids: { imdb: 'tt0071562' } }]);
    if (u.indexOf('api.trakt.tv') >= 0) return json(req, []);
    if (u.indexOf('arm.haglund.dev/api/v2/ids?source=kitsu&id=46474') >= 0) return json(req, { myanimelist: 52991, kitsu: 46474 });
    if (u.indexOf('arm.haglund.dev') >= 0) return json(req, []);
    if (u.indexOf('api.aniskip.com/v2/skip-times/52991/1') >= 0) return json(req, { found: true, results: [{ skipType: 'op', interval: { startTime: 1, endTime: 6 } }, { skipType: 'ed', interval: { startTime: 8, endTime: 9.9 } }] });
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [{ name: '[AD+] Torrentio\n1080p', title: 'X.1080p.mkv\n💾 1 GB', url: VIDEO }] });
    if (u.indexOf('opensubtitles-v3') >= 0) return json(req, { subtitles: [] });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const tab = async (name) => { await p.evaluate((n) => StremTV.Nav.focus(Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === n)[0]), name); await key('Enter'); await sleep(600); };
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', hideWatched: false }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'cid' })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);

  // --- 4 búsqueda
  await tab('Buscar');
  await p.evaluate(() => { const i = document.querySelector('.search-box input'); i.focus(); });
  await p.keyboard.type('pa', { delay: 80 }); await sleep(1200);
  console.log('2 letras → búsquedas:', searches.length);
  await p.keyboard.type('drino', { delay: 80 }); await sleep(1300);
  console.log('mientras escribe → búsquedas:', JSON.stringify(searches), '· filas:', await p.evaluate(() => document.querySelectorAll('.row .card').length));
  await key('Enter'); await sleep(500);
  console.log('Hecho (sin repetir) → búsquedas:', searches.length, '· recientes:', await p.evaluate(() => Array.from(document.querySelectorAll('.chips .btn')).map((x) => x.textContent).join(' | ')));
  await key('Escape'); await tab('Buscar');
  console.log('al volver, recientes:', await p.evaluate(() => Array.from(document.querySelectorAll('.chips .btn')).map((x) => x.textContent).join(' | ')));
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.chips .btn'))[0])); await key('Enter'); await sleep(1200);
  console.log('OK en «padrino» → búsquedas:', searches.length, '· cuadro:', await p.evaluate(() => document.querySelector('.search-box input').value));
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.chips .btn')).filter((x) => x.textContent === 'Borrar')[0])); await key('Enter'); await sleep(300);
  console.log('Borrar → recientes:', await p.evaluate(() => document.querySelectorAll('.chips .btn').length), '· foco:', await p.evaluate(() => StremTV.Nav.cur.tagName));
  await key('Escape');

  // --- 5 más como esto (Trakt, sin TMDB)
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  console.log('botones ficha:', await p.evaluate(() => Array.from(document.querySelectorAll('.detail .btn')).map((x) => x.textContent).join(' | ')));
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.detail .btn')).filter((x) => x.textContent === 'Más como esto')[0])); await key('Enter'); await sleep(1500);
  console.log('más como esto:', await p.evaluate(() => document.querySelector('.screen-title').textContent + ' → ' + Array.from(document.querySelectorAll('.grid .card .name')).map((x) => x.textContent).join(' | ')), '· foco:', await p.evaluate(() => StremTV.Nav.cur.textContent));
  await key('Escape'); await key('Escape'); await sleep(400);

  // --- 3 saltar intro (anime de Kitsu, ep. 1)
  await p.evaluate(() => StremTV.open('series', 'kitsu:46474')); await sleep(4000);
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.ep'))); await key('Enter'); await sleep(2600);
  console.log('intro:', await p.evaluate(() => [StremTV.Player.time.toFixed(1), (document.getElementById('skipbox') || {}).className, (document.getElementById('skipbox') || {}).textContent].join(' | ')));
  await key('Enter'); await sleep(600);
  console.log('tras OK:', await p.evaluate(() => [StremTV.Player.time.toFixed(1), StremTV.Player.paused, document.getElementById('skipbox').className].join(' | ')));
  await sleep(2300);
  console.log('en el ending (hay siguiente ep.):', await p.evaluate(() => [StremTV.Player.time.toFixed(1), document.getElementById('skipbox').className, (document.getElementById('upnext') || {}).className].join(' | ')));

  // --- 7 temporizador
  await p.evaluate(() => { StremTV.Player.dismissUpNext(); StremTV.Player.skipTo(1); }); await sleep(300);
  await key('ArrowDown'); await sleep(500);
  console.log('menú ▼:', await p.evaluate(() => document.querySelector('.modal h2').textContent + ' → ' + Array.from(document.querySelectorAll('.mi')).map((x) => x.textContent).join(' | ')));
  await key('Enter'); await sleep(400);
  console.log('submenú:', await p.evaluate(() => Array.from(document.querySelectorAll('.mi')).map((x) => x.textContent).join(' | ')));
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.mi')).filter((x) => /30/.test(x.textContent))[0])); await key('Enter'); await sleep(500);
  console.log('osd:', await p.evaluate(() => document.getElementById('osd-state').textContent), '· aviso:', await p.evaluate(() => document.getElementById('toast').textContent));
  await p.evaluate(() => { StremTV.Player.sleep = { at: Date.now() + 1200 }; }); await sleep(2000);
  console.log('al cumplirse:', await p.evaluate(() => [document.getElementById('player').className, document.getElementById('toast').textContent, StremTV.Player.sleep].join(' | ')));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
