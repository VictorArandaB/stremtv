// Respuestas que llegan tarde: Atrás mientras carga la ficha, la lista de fuentes o el enlace del vídeo; cierres del reproductor
// con un menú encima; temporizador que no pasa a otro vídeo; una sola renovación de Trakt; la copia no olvida su Gist por un
// fallo de red; desfase guardado en subtítulos incrustados. Sale con código 1 si alguna comprobación falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o, status) => req.respond({ status: status || 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  const delay = { meta: 0, streams: 0, video: 0 };
  let tokenPosts = 0, gistMode = 'ok';
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (u.indexOf('/meta/movie/tt0111161') >= 0 && delay.meta) {
      return setTimeout(() => json(req, { meta: { id: 'tt0111161', type: 'movie', name: 'Cadena perpetua', imdb_id: 'tt0111161' } }), delay.meta);
    }
    if (u.indexOf('/stream/') >= 0) {
      return setTimeout(() => json(req, { streams: [
        { name: '[AD+] Torrentio\n1080p', title: 'Movie.1080p.x264-AAA\n👤 50 💾 2 GB ⚙️ x', url: 'https://video.test/a.mp4' },
        { name: '[AD+] Torrentio\n720p', title: 'Movie.720p.x264-BBB\n👤 50 💾 1 GB ⚙️ x', url: 'https://video.test/b.mp4' }] }), delay.streams);
    }
    if (u.indexOf('video.test') >= 0) return setTimeout(() => req.respond({ status: 200, headers: cors, contentType: 'video/mp4', body: 'x' }), delay.video);
    if (u.indexOf('api.trakt.tv/oauth/token') >= 0) { tokenPosts++; return setTimeout(() => json(req, { access_token: 'a2', refresh_token: 'r2', created_at: Math.floor(Date.now() / 1000), expires_in: 7776000 }), 300); }
    if (u.indexOf('api.trakt.tv') >= 0) return json(req, []);
    if (u.indexOf('api.github.com/gists/g1') >= 0 && req.method() === 'PATCH') {
      if (gistMode === 'net') return req.abort('failed');
      if (gistMode === '404') return json(req, { message: 'Not Found' }, 404);
      return json(req, { id: 'g1' });
    }
    if (u.indexOf('api.github.com/gists') >= 0 && req.method() === 'POST') return json(req, { id: 'g2' }, 201);
    if (u.indexOf('api.github.com/gists') >= 0) return json(req, [{ id: 'g1', description: 'StremTV · copia de seguridad', files: { 'stremtv.json': {} } }]);
    if (u.indexOf('opensubtitles') >= 0) return json(req, { subtitles: [] });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const state = () => p.evaluate(() => {
    const top = StremTV.stack[StremTV.stack.length - 1];
    return { depth: StremTV.stack.length, navOnTop: StremTV.Nav.root === top.el, player: !document.getElementById('player').classList.contains('hidden'),
      src: document.getElementById('video').getAttribute('src'), streams: !!top.streamsOf, playerTop: top === StremTV.Player.screen };
  });
  const reset = async (extra) => {
    await p.evaluate((extra) => {
      localStorage.clear();
      localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }]));
      localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: true, subLang: 'spa' }));
      for (const k in extra || {}) localStorage.setItem('stv.' + k, JSON.stringify(extra[k]));
    }, extra);
    await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  };
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });

  // 1. Atrás mientras carga la ficha: el mando sigue en Inicio
  await reset();
  delay.meta = 1500;
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(200);
  await key('Escape'); await sleep(2000);
  let s = await state();
  check(s.depth === 1 && s.navOnTop, 'Atrás con la ficha cargando: el mando sigue en Inicio', JSON.stringify(s));
  delay.meta = 0;

  // 2. Atrás antes de que lleguen las fuentes (reproducción directa): no arranca nada
  // el retraso va antes de abrir la ficha: desde 0.18 ella ya pide las fuentes en segundo plano
  delay.streams = 4000; // la petición de la ficha sigue en curso al pulsar «▶ Ver»
  delay.video = 5000; // que el vídeo no falle solo y tape el problema
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(300); // ▶ Ver
  check((await state()).streams, 'lista de fuentes abierta, buscando');
  await key('Escape'); await sleep(2200);
  s = await state();
  check(s.depth === 2 && !s.player && s.navOnTop, 'Atrás antes de las fuentes: ni reproductor ni foco perdido', JSON.stringify(s));
  delay.streams = 0;
  await sleep(3000);

  // 3. Atrás mientras se comprueba el enlace: el vídeo no empieza después
  delay.video = 1500;
  await key('Enter'); await sleep(800); // ▶ Ver → lista + reproductor «Conectando…»
  check((await state()).playerTop, 'reproductor abierto conectando');
  await key('Escape'); await sleep(2200);
  s = await state();
  check(!s.player && !s.src && s.streams && s.navOnTop, 'Atrás conectando: no se reproduce ni se cierra la lista', JSON.stringify(s));

  // 4. error con el menú de subtítulos abierto: se cierran menú y reproductor, no solo el menú
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.stream'))); await key('Enter'); await sleep(300);
  await key('ArrowUp'); await sleep(300);
  check(await p.evaluate(() => StremTV.stack.length - StremTV.stack.indexOf(StremTV.Player.screen)) === 2, 'menú ▲ abierto encima del reproductor');
  await p.evaluate(() => StremTV.Player.fail('prueba')); await sleep(400);
  s = await state();
  check(s.streams && !s.player, 'fallo con menú abierto: vuelve a la lista', JSON.stringify(s));

  // 5. el temporizador de un vídeo anterior no para el siguiente
  await p.evaluate(() => { StremTV.Player.sleep = { at: Date.now() - 1000 }; StremTV.Nav.focus(document.querySelector('.stream')); });
  await key('Enter'); await sleep(1200);
  s = await state();
  check(s.playerTop, 'temporizador antiguo: el vídeo nuevo sigue abierto', JSON.stringify(s));
  await key('Escape'); await sleep(2000);
  delay.video = 0;

  // 6. desfase guardado aplicado a los subtítulos incrustados
  await reset({ suboffsets: { tt0111161: { o: 2, ts: Date.now() } } });
  delay.video = 3000;
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(800);
  const pos = await p.evaluate(() => {
    const calls = [];
    window.webapis = { avplay: {
      getTotalTrackInfo: () => [{ type: 'AUDIO', index: 1, extra_info: '{"language":"eng"}' }, { type: 'TEXT', index: 4, extra_info: '{"track_lang":"spa"}' }],
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: 1 }],
      setSelectTrack: () => {}, setSilentSubtitle: () => {}, setSubtitlePosition: (ms) => calls.push(ms) } };
    StremTV.Player.autoAudio();
    delete window.webapis;
    return calls.join(',');
  });
  check(pos === '2000', 'desfase guardado en incrustados', pos);
  await key('Escape'); await sleep(3500);
  delay.video = 0;

  // 7. Trakt a punto de caducar: una sola renovación aunque Inicio lance muchas llamadas
  tokenPosts = 0;
  await reset({ trakt: { clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 3600000 } });
  await sleep(3000);
  const tk = await p.evaluate(() => JSON.parse(localStorage.getItem('stv.trakt')));
  check(tokenPosts === 1 && tk.access === 'a2', 'una sola renovación de Trakt y sigue vinculado', tokenPosts + ' renovaciones · access ' + tk.access);

  // 8. copia: un fallo de red no olvida el Gist; un 404 sí
  const send = async () => {
    await p.evaluate(() => StremTV.openSettings('data')); await sleep(300);
    await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.btn')).filter((x) => /Enviar registro/.test(x.textContent)).pop()));
    await key('Enter'); await sleep(1500);
    await key('Escape'); await key('Escape');
    return p.evaluate(() => JSON.parse(localStorage.getItem('stv.backup')).gistId);
  };
  await reset({ backup: { token: 't', gistId: 'g1', at: Date.now() } });
  gistMode = 'net';
  check(await send() === 'g1', 'fallo de red: conserva el Gist');
  gistMode = '404';
  check(await send() === '', 'Gist borrado (404): se olvida');

  check(!errs.length, 'sin errores de página', errs.join(' | ') || undefined);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
