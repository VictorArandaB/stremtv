// 0.16.3: mensaje sin addon de fuentes, ficha por TMDB que llega tarde o dos veces, «OK ver ahora» con el temporizador
// «al terminar este vídeo», y una sola descarga de las series vistas de Trakt. Sale con código 1 si alguna comprobación falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  let watchedShows = 0;
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (u.indexOf('/external_ids') >= 0) return setTimeout(() => json(req, { imdb_id: 'tt0111161' }), 1200);
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [{ name: '[AD+] Torrentio\n1080p', title: 'Movie.1080p.x264-AAA\n👤 50 💾 2 GB ⚙️ x', url: 'https://video.test/a.mp4' }] });
    if (u.indexOf('video.test') >= 0) return setTimeout(() => req.respond({ status: 200, headers: cors, contentType: 'video/mp4', body: 'x' }), 8000);
    if (u.indexOf('api.trakt.tv/sync/watched/shows') >= 0) { watchedShows++; return json(req, []); }
    if (u.indexOf('api.trakt.tv') >= 0) return json(req, []);
    if (u.indexOf('opensubtitles') >= 0) return json(req, { subtitles: [] });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const depth = () => p.evaluate(() => StremTV.stack.length);
  const reset = async (settings, extra) => {
    await p.evaluate((settings, extra) => {
      localStorage.clear();
      localStorage.setItem('stv.settings', JSON.stringify(settings));
      for (const k in extra || {}) localStorage.setItem('stv.' + k, JSON.stringify(extra[k]));
    }, settings, extra);
    await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  };
  const torrentio = [{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }];
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });

  // 1. sin addon de fuentes: ▶ Ver muestra el aviso y el botón de Ajustes (en 0.16.2 salía una pantalla vacía)
  await reset({ quickPlay: true });
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(500);
  const msg = await p.evaluate(() => { const top = StremTV.stack[StremTV.stack.length - 1].el; return [top.querySelector('.loading') && top.querySelector('.loading').textContent, StremTV.Nav.cur && StremTV.Nav.cur.textContent]; });
  check(/ningún addon de fuentes/.test(msg[0] || '') && msg[1] === 'Abrir ajustes', 'sin addon: aviso y botón «Abrir ajustes» con el foco', msg.join(' · '));

  // 2. resultado de TMDB: OK dos veces abre una sola ficha; Atrás antes de que llegue no abre ninguna
  await reset({ quickPlay: false, tmdbKey: 'k' }, { addons: torrentio });
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(300);
  const before = await depth();
  await p.evaluate(() => { StremTV.openMeta({ id: 'tmdb:movie:278', type: 'movie' }); StremTV.openMeta({ id: 'tmdb:movie:278', type: 'movie' }); });
  await sleep(2500);
  check(await depth() === before + 1, 'OK dos veces en un resultado de TMDB: una sola ficha', (await depth()) - before);
  await key('Escape'); await sleep(400);
  const back = await depth();
  await p.evaluate(() => StremTV.openMeta({ id: 'tmdb:movie:278', type: 'movie' })); await sleep(100);
  await key('Escape'); await sleep(2000);
  check(await depth() === back - 1, 'Atrás antes de que responda TMDB: no aparece la ficha', await depth());

  // 3. temporizador «al terminar este vídeo»: «OK ver ahora» pasa al siguiente; el paso automático se para
  await reset({ quickPlay: false }, { addons: torrentio });
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(1500); // lista de fuentes
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.stream'))); await key('Enter'); await sleep(500);
  const manual = await p.evaluate(() => {
    const P = StremTV.Player; P.sleep = { end: true }; P.nextCtx = Object.assign({}, P.ctx, { label: 'Siguiente' });
    P.playNext(true);
    const top = StremTV.stack[StremTV.stack.length - 1];
    return { streams: !!top.streamsOf, label: top.el.querySelector('.screen-title').textContent, sleep: JSON.stringify(P.sleep) };
  });
  check(manual.streams && manual.label === 'Siguiente', '«OK ver ahora» con temporizador: abre el siguiente', JSON.stringify(manual));
  await sleep(1500);
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.stream'))); await key('Enter'); await sleep(500);
  const auto = await p.evaluate(() => {
    const P = StremTV.Player; P.sleep = { end: true }; P.nextCtx = Object.assign({}, P.ctx, { label: 'Otro' });
    const d = StremTV.stack.length;
    P.playNext();
    return { closed: StremTV.stack.length === d - 1, title: StremTV.stack[StremTV.stack.length - 1].el.querySelector('.screen-title').textContent };
  });
  check(auto.closed && auto.title !== 'Otro', 'paso automático con temporizador: se para', JSON.stringify(auto));

  // 4. Trakt con «ocultar lo visto»: Inicio descarga una sola vez las series vistas
  watchedShows = 0;
  await reset({ quickPlay: false, hideWatched: true }, { addons: torrentio, trakt: { clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 } });
  await sleep(4000);
  check(watchedShows === 1, 'una sola descarga de /sync/watched/shows al arrancar', watchedShows);

  check(!errs.length, 'sin errores de página', errs.join(' | ') || undefined);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
