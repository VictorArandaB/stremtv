// 0.21: sin conexión (aviso fijo, filas, ficha y fuentes que se vuelven a pedir solas al volver la red; un servicio caído
// no es «sin conexión») y fuentes que esta tele no reproduce bien (AV1, Dolby Vision sin HDR10, H.264 en 4K) plegadas al final.
// Uso: node v21.js  (servidor en 127.0.0.1:8090)  -> capturas 210-… en ./shots. Sale con código 1 si algo falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? 'OK  ' : 'MAL ') + what + (got !== undefined ? ' → ' + JSON.stringify(got) : '')); if (!ok) fails++; };
const ADDONS = JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }]);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  // como en la tele: sin AV1
  await p.evaluateOnNewDocument(() => { const c = HTMLMediaElement.prototype.canPlayType; HTMLMediaElement.prototype.canPlayType = function (t) { return /av01/.test(t) ? '' : c.call(this, t); }; });
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  let net = 'up', dead = null;
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('http://127.0.0.1') === 0) return req.continue();
    if (net === 'down' || (dead && u.indexOf(dead) >= 0)) return req.abort('internetdisconnected');
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (u.indexOf('/stream/movie/tt0111161') >= 0) {
      const s = (q, file) => ({ name: '[AD+] Torrentio\n' + q, title: file + '\n👤 50 💾 2 GB ⚙️ x', url: 'https://example.com/' + file, behaviorHints: { filename: file } });
      return json(req, { streams: [
        s('4k', 'Movie.2160p.WEB-DL.DV.H.265-AAA.mkv'),
        s('4k', 'Movie.2160p.WEB-DL.DV.HDR10.H.265-BBB.mkv'),
        s('4k', 'Movie.2160p.BluRay.x264-CCC.mkv'),
        s('1080p', 'Movie.1080p.WEB-DL.AV1-DDD.mkv'),
        s('1080p', 'Movie.1080p.BluRay.x264-EEE.mkv')] });
    }
    if (u.indexOf('opensubtitles-v3') >= 0 || u.indexOf('api.trakt.tv') >= 0 || u.indexOf('api.github.com') >= 0) return json(req, []);
    req.continue();
  });
  const ev = (fn, ...a) => p.evaluate(fn, ...a);
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(fn)) return true; await sleep(200); } return false; };
  const banner = () => ev(() => { const n = document.querySelector('#netbox'); return !!n && !n.classList.contains('hidden'); });
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await ev((a) => { localStorage.clear(); localStorage.setItem('stv.addons', a);
    localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: false })); }, ADDONS);
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);

  // ---- se cae la red: la pestaña Anime y una ficha fallan, sale el aviso
  net = 'down';
  await key('ArrowRight'); await key('Enter'); // Anime
  check(await waitFor(() => document.querySelectorAll('.screen .row .empty').length >= 4, 5000), 'filas de Anime con error sin red');
  check(await waitFor(() => { const n = document.querySelector('#netbox'); return n && !n.classList.contains('hidden'); }, 5000), 'aviso «Sin conexión» a la vista');
  await ev(() => StremTV.open('movie', 'tt0111161'));
  check(await waitFor(() => /No se pudo cargar/.test(document.querySelector('.detail').textContent), 5000), 'ficha con error sin red');
  await p.screenshot({ path: OUT + '/210-sin-red.png' });

  // ---- vuelve: en ≤ 10 s la siguiente comprobación lo nota, se quita el aviso y todo se vuelve a pedir
  net = 'up';
  check(await waitFor(() => { const n = document.querySelector('#netbox'); return n && n.classList.contains('hidden'); }, 13000), 'aviso quitado al volver la red');
  check(/Conexión recuperada/.test(await ev(() => document.querySelector('#toast').textContent)), 'aviso «Conexión recuperada»');
  check(await waitFor(() => !!document.querySelector('.detail .btn'), 8000), 'la ficha se ha cargado sola');
  await key('Escape');
  check(await waitFor(() => document.querySelectorAll('.screen .row .card').length > 20 && !document.querySelector('.screen .row .empty'), 10000), 'filas de Anime cargadas solas');
  await p.screenshot({ path: OUT + '/211-red-vuelta.png' });
  await key('Escape');

  // ---- un solo servicio caído no es «sin conexión»: ni aviso ni reintento
  dead = '/meta/movie/tt0068646';
  await ev(() => StremTV.open('movie', 'tt0068646'));
  check(await waitFor(() => /No se pudo cargar/.test(document.querySelector('.detail').textContent), 5000), 'ficha con el servicio caído: error');
  await sleep(3000);
  check(!(await banner()), 'sin aviso de red con un servicio caído');
  dead = null;
  await key('Escape'); await sleep(500);

  // ---- fuentes que no se ven bien: al final, plegadas, nunca recomendadas ni elegidas como alternativa
  await ev(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(2500);
  const st = await ev(() => ({
    rows: Array.from(document.querySelectorAll('.stream')).map((r) => r.querySelector('.fname').textContent),
    rec: (document.querySelector('.stream.rec .fname') || {}).textContent,
    fold: (document.querySelector('.sgroup.bad') || {}).textContent || '',
  }));
  check(st.rows.length === 2 && st.rows.every((f) => /HDR10|1080p\.BluRay/.test(f)), 'solo las compatibles a la vista', st.rows);
  check(/3 fuentes/.test(st.fold), 'grupo plegado con 3', st.fold);
  check(/HDR10|EEE/.test(st.rec || ''), 'la recomendada es compatible', st.rec);
  const alt = await ev(() => { const r = document.querySelector('.stream'); const a = StremTV.Player.altRow(false, r); return a ? a._stream.file : null; });
  check(!alt || !/AV1|x264-CCC|DV\.H\.265-AAA/.test(alt), 'la alternativa automática no es incompatible', alt);
  for (let i = 0; i < 6 && !(await ev(() => !!document.querySelector('.sgroup.bad.focused'))); i++) await key('ArrowDown');
  await key('Enter'); await sleep(400);
  const open = await ev(() => ({ n: document.querySelectorAll('.stream').length, focus: (document.querySelector('.stream.focused .fname') || {}).textContent,
    badges: Array.from(document.querySelectorAll('.stream .badge.warn')).map((x) => x.textContent).filter((t) => t.indexOf('✕') === 0) }));
  check(open.n === 5, 'desplegadas: 5 fuentes', open.n);
  check(/DV\.H\.265-AAA|x264-CCC|AV1/.test(open.focus || ''), 'foco en la primera incompatible', open.focus);
  check(open.badges.length === 3 && open.badges.some((t) => /Dolby Vision sin HDR10/.test(t)) && open.badges.some((t) => /H\.264 en 4K/.test(t)) && open.badges.some((t) => /AV1/.test(t)), 'cada una dice por qué', open.badges);
  await p.screenshot({ path: OUT + '/212-incompatibles.png' });

  check(!errs.length, 'sin errores de JS', errs);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
