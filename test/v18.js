// 0.18: desplazamiento por GPU, precarga de fuentes, Mi lista sin Trakt, marcar visto, botones de colores,
// pestaña activa enfocada en lila, nota con el mismo formato, fuentes sin calidad repetida, carátulas que no cargan.
// Uso: node v18.js [url]  -> capturas 110-… en ./shots
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
  const st = (q, name) => ({ name: '[AD+] Torrentio\n' + q, title: name + '\n👤 50 💾 1.2 GB ⚙️ x', url: VIDEO, behaviorHints: { filename: name } });
  const streamReqs = [];
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('/stream/') >= 0) {
      streamReqs.push(u);
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [
        st('1080p', 'Movie.1080p.WEB-DL-AAA.mkv'), st('4k DV', 'Movie.2160p.DV.HDR10.x265-BBB.mkv'), st('720p', 'Movie.720p-CCC.mkv')] }) });
    }
    if (u.indexOf('opensubtitles-v3') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"subtitles":[]}' });
    if (u.indexOf('/poster/small/tt0000404/') >= 0) return req.respond({ status: 404, headers: cors, body: '' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(300); } };
  const ev = (fn, ...a) => p.evaluate(fn, ...a);
  // los botones de colores no tienen tecla en el Mac: se simula su keyCode
  const color = async (code) => { await ev((c) => { const e = new KeyboardEvent('keydown', { bubbles: true }); Object.defineProperty(e, 'keyCode', { get: () => c }); document.dispatchEvent(e); }, code); await sleep(500); };
  const RED = 403, GREEN = 404, YELLOW = 405, BLUE = 406;
  await p.goto(URL, { waitUntil: 'networkidle2' });
  await ev(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: false, hideWatched: false })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(3000);

  // pestaña activa con el foco: fondo lila y texto blanco (antes, blanco sobre blanco)
  await ev(() => StremTV.Nav.focus(document.querySelector('.tab.active')));
  const tab = await ev(() => { const s = getComputedStyle(document.querySelector('.tab.active.focused')); return s.backgroundColor + ' / ' + s.color; });
  check(tab === 'rgb(109, 93, 245) / rgb(255, 255, 255)', 'pestaña activa enfocada en lila: ' + tab);
  await p.screenshot({ path: OUT + '/110-tab-active.png', clip: { x: 0, y: 0, width: 1920, height: 140 } });

  // bajar por el inicio mueve las filas con transform, sin scrollTop
  await key('ArrowDown', 4); await sleep(600);
  const vs = await ev(() => { const v = document.querySelector('.with-hero > .vscroll'); return { top: v.scrollTop, y: v._y, tf: Array.from(v.children).some((c) => /translate3d/.test(c.style.transform || c.style.webkitTransform)) }; });
  check(vs.top === 0 && vs.y > 0 && vs.tf, 'desplazamiento vertical por transform: ' + JSON.stringify(vs));
  check(await ev(() => { const r = StremTV.Nav.cur.getBoundingClientRect(); return r.top >= 560 && r.bottom <= 1080; }), 'la carátula enfocada queda a la vista');
  await key('ArrowRight', 9); await sleep(600);
  check(await ev(() => { const r = StremTV.Nav.cur.getBoundingClientRect(); return r.left >= 0 && r.right <= 1920; }), 'la carátula de la derecha queda a la vista');
  await p.screenshot({ path: OUT + '/111-home-scrolled.png' });

  // rojo sobre una carátula: Mi lista local (sin Trakt); al volver al inicio sale la fila
  const cardName = await ev(() => StremTV.Nav.cur._meta.name);
  await color(RED);
  check(await ev(() => Object.keys(JSON.parse(localStorage.getItem('stv.mylist') || '{}')).length === 1), 'rojo guarda la carátula en Mi lista');

  // ficha de película: precarga de fuentes, botón Mi lista y marcar como vista
  streamReqs.length = 0;
  await ev(() => StremTV.open('movie', 'tt0133093')); await sleep(3500);
  check(streamReqs.length === 1, 'la ficha pide las fuentes en segundo plano (' + streamReqs.length + ')');
  check(await ev(() => /En mi lista|Mi lista/.test(document.querySelector('.detail').textContent)), 'botón Mi lista sin Trakt');
  check(await ev(() => !!document.querySelector('.keys-legend .k-red')), 'leyenda de los botones de colores');
  const star = await ev(() => { const s = document.querySelector('.meta-line .star'); return s ? s.textContent + ' ' + getComputedStyle(s).color : ''; });
  check(/★ \d,\d rgb\(255, 216, 74\)/.test(star), 'nota con coma y estrella amarilla como en la cabecera: ' + star);
  await color(GREEN);
  check(await ev(() => /✓ Vista/.test(document.querySelector('.detail').textContent) && JSON.parse(localStorage.getItem('stv.progress'))['tt0133093'].done), 'verde marca la película como vista');
  await p.screenshot({ path: OUT + '/112-detail-movie.png' });
  await color(GREEN);
  check(await ev(() => /Marcar como vista/.test(document.querySelector('.detail').textContent) && !JSON.parse(localStorage.getItem('stv.progress'))['tt0133093']), 'otra vez verde la desmarca');
  await color(RED);
  await ev(() => StremTV.Nav.focus(document.querySelector('.detail .btn.primary'))); await key('Enter'); await sleep(1500);
  check(streamReqs.length === 1 && await ev(() => document.querySelectorAll('.stream').length === 3), '«▶ Ver» usa las fuentes ya pedidas (' + streamReqs.length + ' peticiones)');
  // fuentes agrupadas: sin columna de calidad, «4K DV» como etiqueta, sin ⚡ si todas son instantáneas
  check(await ev(() => !document.querySelector('.stream .q')), 'agrupadas, sin la calidad repetida en cada fila');
  check(await ev(() => /4K DV/.test(document.querySelector('.list').textContent) && !/4k/.test(document.querySelector('.list').textContent)), '«4K DV» con la K en mayúscula');
  check(await ev(() => !/Instantáneo/.test(document.querySelector('.list').textContent) && /todas instantáneas/.test(document.querySelector('.screen-sub').textContent)), 'todas instantáneas: lo dice el subtítulo, sin marca en cada una');
  await p.screenshot({ path: OUT + '/113-streams.png' });
  // azul en el reproductor: cambiar fuente
  await key('Enter'); await sleep(3500);
  await ev(() => { document.getElementById('video').playbackRate = 0.1; });
  await color(BLUE);
  check(await ev(() => /Cambiar fuente/.test((document.querySelector('.modal h2') || {}).textContent || '')), 'azul en el vídeo abre «Cambiar fuente»');
  await key('Escape'); await key('Escape'); await sleep(800); await key('Escape'); await sleep(800);

  // serie: verde en un episodio y en una temporada
  await ev(() => StremTV.open('series', 'tt0903747')); await sleep(4000);
  await ev(() => StremTV.Nav.focus(document.querySelectorAll('.ep')[1]));
  await color(GREEN);
  check(await ev(() => document.querySelectorAll('.ep')[1].classList.contains('seen') && StremTV.Nav.cur === document.querySelectorAll('.ep')[1]), 'verde marca el episodio y el foco sigue en él');
  await ev(() => StremTV.Nav.focus(document.querySelector('.seasons .btn')));
  await color(GREEN);
  check(await ev(() => Array.from(document.querySelectorAll('.ep')).every((e) => e.classList.contains('seen')) && StremTV.Nav.cur._season === 1), 'verde en la temporada la marca entera');
  check(await ev(() => /T2:E1/.test(document.querySelector('.detail .btn.primary').textContent)), '«▶ Ver» pasa a la temporada siguiente');
  await p.screenshot({ path: OUT + '/114-detail-series-seen.png' });
  await color(GREEN);
  check(await ev(() => !document.querySelector('.ep.seen')), 'otra vez verde desmarca la temporada');
  await key('Escape'); await sleep(500); await key('Escape'); await sleep(1500);

  // inicio: fila Mi lista con lo añadido
  const rows = await ev(() => Array.from(document.querySelectorAll('.row-title')).map((x) => x.textContent));
  check(rows.indexOf('Mi lista') >= 0, 'fila Mi lista en el inicio: ' + rows.slice(0, 4).join(' | '));
  check(await ev((n) => { const r = Array.from(document.querySelectorAll('.row')).filter((x) => x.querySelector('.row-title').textContent === 'Mi lista')[0]; return !!r && r.querySelectorAll('.card').length === 2 && r.textContent.indexOf(n) >= 0; }, cardName), 'Mi lista tiene la carátula y la película');

  // carátula que no existe: el nombre en su lugar
  await ev(() => { localStorage.setItem('stv.mylist', JSON.stringify({ tt0000404: { id: 'tt0000404', type: 'movie', name: 'Sin carátula', poster: 'https://images.metahub.space/poster/small/tt0000404/img', ts: Date.now() + 1 } })); location.reload(); });
  await sleep(4000);
  check(await ev(() => { const c = Array.from(document.querySelectorAll('.card')).filter((x) => x._meta && x._meta.id === 'tt0000404')[0]; return !!c && !!c.querySelector('.noimg') && c.querySelector('.noimg').textContent === 'Sin carátula'; }), 'carátula 404: sale el nombre');

  // Ajustes: resúmenes discretos y «—» en lo opcional sin configurar
  await ev(() => StremTV.openSettings('')); await sleep(800);
  const sum = await ev(() => { const v = document.querySelectorAll('.opt .val.sum')[3]; return v.textContent + ' ' + getComputedStyle(v).fontWeight; });
  check(/Trakt — · TMDB — · OMDb — · GitHub —/.test(sum) && !/bold|700/.test(sum), 'cuentas sin configurar con «—» y sin negrita: ' + sum);
  await p.screenshot({ path: OUT + '/115-settings.png' });
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
