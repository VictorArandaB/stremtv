// Fuente que da un «vídeo de aviso» de unos segundos en vez del archivo (Comet/AllDebrid: «provider is currently
// unavailable»): es una fuente fallida; no se marca como visto ni salta al siguiente episodio.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, t) => console.log((c ? '✓ ' : '✗ ') + t);
const NOTICE = fs.readFileSync(path.join(__dirname, 'notice.webm')); // 6 s
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('comet.test/') >= 0 && u.indexOf('/stream/') >= 0) {
      const s = (q, file) => ({ name: '[AD⚡] Comet ' + q, description: '📄 ' + file + '\n💾 2 GB', url: 'https://comet.test/playback/' + file, behaviorHints: { filename: file, bingeGroup: 'comet|alldebrid|' + file } });
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [
        s('1080p', 'A.1080p.x264.mkv'), s('1080p', 'B.1080p.x264.mkv'), s('1080p', 'C.1080p.x264.mkv')] }) });
    }
    if (u.indexOf('comet.test/playback/') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'video/webm', body: NOTICE });
    if (u.indexOf('opensubtitles-v3') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"subtitles":[]}' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(300); } };
  const state = () => p.evaluate(() => ({
    playing: !document.getElementById('player').classList.contains('hidden'),
    ep: StremTV.Player.ctx && StremTV.Player.ctx.epLabel,
    failed: Array.prototype.filter.call(document.querySelectorAll('.stream'), (r) => r._failed).length,
    progress: localStorage.getItem('stv.progress') || '{}',
    log: JSON.parse(localStorage.getItem('stv.log') || '[]').filter((e) => e.m === 'vídeo de aviso').length,
    toast: document.getElementById('toast').textContent
  }));
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://comet.test/cfg', manifest: { id: 'stremio.comet.fast', name: 'Comet | AD', resources: ['stream'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ autoNext: true })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);

  // 1) episodio (fuente automática): el aviso es una fuente fallida, no cuenta como visto ni pasa al siguiente
  await p.evaluate(() => StremTV.open('series', 'tt0903747')); await sleep(3000);
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.ep'))); await key('Enter'); await sleep(14000); // más que 2 × 6 s
  let st = await state();
  console.log('episodio:', JSON.stringify(st));
  ok(!st.playing && st.failed === 2 && st.ep === 'T1:E1 · Pilot', 'dos avisos: fuentes fallidas, para y sigue en el E1');
  ok(st.progress === '{}', 'no queda nada marcado como visto');
  ok(st.log === 2 && /vídeo de aviso/.test(st.toast), 'lo registra y lo dice');

  // 2) película con «▶ Ver» (fuente automática): prueba otra y, con el mismo aviso dos veces, para
  const before = st;
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(14000);
  st = await state();
  console.log('película:', JSON.stringify(st));
  ok(!st.playing && st.failed - before.failed === 2 && st.log - before.log === 2, 'prueba la siguiente y para tras dos avisos');
  ok(st.progress === '{}', 'tampoco marca la película');
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
