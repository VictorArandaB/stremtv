// Aspecto: cabecera grande del inicio, ficha con logo y «▶ Ver», fuentes agrupadas, reproductor (reloj, burbuja, INFO),
// protector de pantalla en pausa y Ajustes con iconos. Uso: node visual.js [url]  -> capturas 100-… en ./shots
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.argv[2] || 'http://127.0.0.1:8090/';
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'OK  ' : 'MAL ') + what); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const st = (q, name, extra) => ({ name: '[AD+] Torrentio\n' + q, title: name + '\n👤 50 💾 1.2 GB ⚙️ x' + (extra || ''), url: VIDEO, behaviorHints: { filename: name } });
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('/stream/') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [
      st('1080p', 'Movie.1080p.WEB-DL-AAA.mkv'), st('4k', 'Movie.2160p.HDR.x265-BBB.mkv'), st('720p', 'Movie.720p-CCC.mkv'), st('1080p', 'Movie.1080p.BluRay-DDD.mkv', ' 🇪🇸')] }) });
    if (u.indexOf('opensubtitles-v3') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"subtitles":[]}' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(300); } };
  const ev = (fn, ...a) => p.evaluate(fn, ...a);
  await p.goto(URL, { waitUntil: 'networkidle2' });
  await ev(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: false, hideWatched: false })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(3000);

  // inicio: la cabecera muestra la primera carátula sin tocar nada
  check(await ev(() => !!document.querySelector('.hero-info .hero-meta')), 'cabecera grande pintada al arrancar');
  check(await ev(() => document.querySelector('.tab.active').textContent === 'Inicio'), 'pestaña activa marcada');
  check(await ev(() => /^\d{1,2}:\d\d$/.test(document.querySelector('.header .clock').textContent)), 'reloj en la cabecera');
  await p.screenshot({ path: OUT + '/100-home-hero.png' });
  await key('ArrowDown'); await key('ArrowRight', 2); await sleep(1500);
  const heroName = await ev(() => document.querySelector('.hero-info span').textContent);
  const cardName = await ev(() => StremTV.Nav.cur._meta.name);
  check(heroName === cardName, 'la cabecera sigue a la carátula enfocada (' + heroName + ')');
  check(await ev(() => StremTV.Nav.cur.parentNode.classList.contains('dim')), 'fila enfocada atenúa el resto');
  await p.screenshot({ path: OUT + '/101-home-focus.png' });
  await key('ArrowDown'); await sleep(1500);
  await p.screenshot({ path: OUT + '/102-home-row2.png' });
  await key('ArrowUp', 3);
  check(await ev(() => StremTV.Nav.cur.classList.contains('tab')), 'arriba vuelve a las pestañas');

  // ficha de serie: «▶ Ver T…», sinopsis en cada episodio
  await ev(() => StremTV.open('series', 'tt0903747')); await sleep(3500);
  const top = await ev(() => Array.from(document.querySelectorAll('.detail .btn')).map((x) => x.textContent).slice(0, 4).join(' | '));
  check(/▶ Ver T1:E1/.test(top), 'botón ver serie: ' + top);
  check(await ev(() => document.querySelectorAll('.ep .ep-ov').length > 3), 'sinopsis en los episodios');
  check(await ev(() => /Breaking Bad/.test(document.querySelector('.detail h1').textContent)), 'título (o logo con nombre) en la ficha');
  await p.screenshot({ path: OUT + '/103-detail-series.png' });
  await ev(() => StremTV.Nav.focus(document.querySelector('.detail .btn.primary'))); await key('Enter'); await sleep(2500);
  // fuentes agrupadas y recomendada
  const groups = await ev(() => Array.from(document.querySelectorAll('.sgroup')).map((x) => x.textContent).join(' | '));
  check(/1080p/.test(groups) && /4K/.test(groups), 'grupos de calidad: ' + groups);
  check(await ev(() => document.querySelectorAll('.stream.rec').length === 1), 'una fuente recomendada');
  check(await ev(() => StremTV.Nav.cur.classList.contains('stream')), 'foco en una fuente (no en un título de grupo)');
  await p.screenshot({ path: OUT + '/104-streams.png' });
  await key('ArrowDown', 6);
  check(await ev(() => StremTV.Nav.cur.classList.contains('stream')), 'bajar salta los títulos de grupo');
  await key('ArrowUp', 6);

  // reproductor
  await key('Enter'); await sleep(3500);
  await ev(() => { document.getElementById('video').playbackRate = 0.1; }); // el vídeo de prueba dura 10 s
  check(await ev(() => document.querySelector('#osd-title').textContent === 'Breaking Bad' && /T1:E1/.test(document.querySelector('#osd-sub').textContent)), 'título y episodio separados en el OSD');
  await key('ArrowRight'); await sleep(200);
  check(await ev(() => !document.querySelector('#osd-seek').classList.contains('hidden')), 'burbuja de tiempo al avanzar');
  await p.screenshot({ path: OUT + '/105-player-seek.png' });
  await sleep(1500);
  await key('i'); await sleep(400);
  check(await ev(() => !document.querySelector('#infopanel').classList.contains('hidden')), 'INFO abre el panel');
  await p.screenshot({ path: OUT + '/106-player-info.png' });
  await key('ArrowLeft'); await sleep(200);
  check(await ev(() => document.querySelector('#infopanel').classList.contains('hidden') && !!StremTV.Player.stream), 'una tecla cierra INFO sin salir del vídeo');
  // protector de pantalla: pausa y espera simulada
  await key('Enter'); await sleep(500);
  await ev(() => { StremTV.Saver.lastKey = Date.now() - 4 * 60000; StremTV.Saver.check(); }); await sleep(2600);
  check(await ev(() => StremTV.Saver.on && !document.querySelector('#saver').classList.contains('hidden')), 'protector con el vídeo en pausa');
  await p.screenshot({ path: OUT + '/107-saver.png' });
  await key('ArrowDown'); await sleep(300);
  check(await ev(() => !StremTV.Saver.on && StremTV.stack.length && !document.querySelector('.modal')), 'una tecla quita el protector (sin abrir el menú)');
  await key('Enter'); await sleep(1000); // sigue reproduciendo
  // ▼ → Cambiar fuente: arranca la otra en el mismo punto, sin pasar por la lista
  const before = await ev(() => ({ file: StremTV.Player.stream.file, t: StremTV.Player.time }));
  await key('ArrowDown'); await sleep(300);
  check(await ev(() => /Cambiar fuente/.test(Array.from(document.querySelectorAll('.mi')).map((x) => x.textContent).join('|'))), '▼ ofrece cambiar de fuente');
  await ev(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.mi')).filter((x) => /Cambiar fuente/.test(x.textContent))[0])); await key('Enter'); await sleep(300);
  await p.screenshot({ path: OUT + '/109-change-source.png' });
  await ev(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.mi')).filter((x) => !x.classList.contains('sel'))[0])); await key('Enter'); await sleep(2500);
  await ev(() => { document.getElementById('video').playbackRate = 0.1; });
  const after = await ev(() => ({ file: StremTV.Player.stream && StremTV.Player.stream.file, start: StremTV.Player.startAt, top: StremTV.stack[StremTV.stack.length - 1] === StremTV.Player.screen, depth: StremTV.stack.length }));
  check(after.top && after.file && after.file !== before.file && Math.abs(after.start - before.t) < 3, 'cambiar fuente sigue en el mismo punto: ' + JSON.stringify([before, after]));
  // Atrás tras reproducir: a la ficha, no a la lista de fuentes
  await key('Escape'); await sleep(800);
  check(await ev(() => { const t = StremTV.stack[StremTV.stack.length - 1]; return !t.streamsOf && !!t.el.querySelector('.detail'); }), 'Atrás tras ver vuelve a la ficha');
  await key('Escape'); await sleep(500);

  // ajustes con iconos
  await ev(() => StremTV.openSettings('')); await sleep(800);
  check(await ev(() => document.querySelectorAll('.opt .ico svg').length === 7), 'iconos en Ajustes');
  await p.screenshot({ path: OUT + '/108-settings.png' });
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
