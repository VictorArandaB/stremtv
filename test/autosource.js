// «▶ Ver» con la fuente elegida automáticamente: si no arranca, prueba sola las siguientes (hasta 4 en total);
// elegida a mano, al fallar vuelve a la lista como siempre.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
const BAD = (n) => 'https://bad.test/' + n + '.mp4';
let mode = 'third';
const cached = [];
let adBad = false;
const ok = (c, t) => console.log((c ? '✓ ' : '✗ ') + t);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); await p.evaluateOnNewDocument(() => { window.STV_NOTICE_MAX = 0; }); // vídeos de prueba de 10 s, no de aviso
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('api.alldebrid.com/v4/user') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(adBad
      ? { status: 'error', error: { code: 'AUTH_BAD_APIKEY', message: 'The auth apikey is invalid' } }
      : { status: 'success', data: { user: { isPremium: true, premiumUntil: 1800000000 } } }) });
    if (u.indexOf('/stream/') >= 0 && u.indexOf('alldebrid=') >= 0 && !/\.json\?t=\d+$/.test(u)) cached.push(u);
    if (u.indexOf('/stream/') >= 0) {
      const s = (name, file, url) => ({ name: '[AD+] Torrentio\n' + name, title: file + '\n👤 50 💾 2 GB ⚙️ x', url });
      if (mode === 'down') return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [
        { name: 'Torrentio\nAD error', title: 'AllDebrid is currently unavailable!\nPlease try again later.', url: 'https://torrentio.strem.fun/videos/failed_unavailable_v1.mp4' }] }) });
      const RES = (n) => 'https://torrentio.strem.fun/resolve/alldebrid/K/' + n;
      if (mode === 'notice') return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams:
        ['A', 'B', 'C', 'D'].map((x) => s('1080p', x + '.1080p.x264', RES(x))) }) });
      if (mode === 'dup') return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [
        s('1080p', 'A.1080p.x264', BAD('a1')), s('1080p', 'A.1080p.x264', BAD('a2')), s('1080p', 'B.1080p.x264', VIDEO)] }) });
      const streams = mode === 'third'
        ? [s('1080p', 'A.1080p.x264', BAD('a')), s('1080p', 'B.1080p.x264', BAD('b')), s('1080p', 'C.1080p.x264', VIDEO)]
        : ['A', 'B', 'C', 'D', 'E'].map((x) => s('1080p', x + '.1080p.x264', BAD(x)));
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams }) });
    }
    if (u.indexOf('/resolve/') >= 0) return req.respond({ status: 302, headers: Object.assign({ Location: 'https://torrentio.strem.fun/videos/failed_unavailable_v1.mp4' }, cors), body: '' });
    if (u.indexOf('/videos/failed_') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'video/mp4', body: 'x' });
    if (u.indexOf('bad.test') >= 0) return req.respond({ status: 404, headers: cors, contentType: 'text/plain', body: 'no' });
    if (u.indexOf('opensubtitles-v3') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"subtitles":[]}' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(300); } };
  const state = () => p.evaluate(() => ({
    playing: !document.getElementById('player').classList.contains('hidden'),
    file: StremTV.Player.stream && StremTV.Player.stream.file,
    failed: Array.prototype.filter.call(document.querySelectorAll('.stream'), (r) => r._failed).map((r) => r._stream.file),
    focus: StremTV.Nav.cur && StremTV.Nav.cur._stream && StremTV.Nav.cur._stream.file,
    toast: document.getElementById('toast').textContent
  }));
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid' })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);

  // 1) las dos primeras fallan: acaba en la tercera sin tocar nada
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(7000);
  let st = await state();
  console.log('tercera:', JSON.stringify(st));
  ok(st.playing && st.file === 'C.1080p.x264', 'reproduce la tercera tras fallar dos');
  ok(st.failed.join() === 'A.1080p.x264,B.1080p.x264', 'las dos primeras marcadas como fallidas');
  await key('Escape'); await sleep(800); await key('Escape'); await sleep(800); await key('Escape'); await sleep(1500);

  // 2) fallan todas: para tras 4 intentos en la lista, con la quinta seleccionada
  mode = 'all';
  await p.evaluate(() => StremTV.open('movie', 'tt0068646')); await sleep(2500);
  await key('Enter'); await sleep(9000);
  st = await state();
  console.log('todas mal:', JSON.stringify(st));
  ok(!st.playing && st.failed.length === 4, 'para tras 4 intentos');
  ok(st.focus === 'E.1080p.x264' && /OK/.test(st.toast), 'deja la siguiente seleccionada para probarla a mano');

  // 3) elegida a mano: al fallar vuelve a la lista sin probar otra
  await key('Enter'); await sleep(3000);
  st = await state();
  console.log('a mano:', JSON.stringify(st));
  ok(!st.playing && st.failed.length === 5, 'a mano no encadena otra');
  await key('Escape'); await sleep(800); await key('Escape'); await sleep(1500);

  // 4) el debrid caído para Torrentio: aviso claro, sin decir que la clave está mal
  mode = 'down';
  await p.evaluate(() => StremTV.open('movie', 'tt0071562')); await sleep(2500);
  await key('Enter'); await sleep(3000);
  const msg = await p.evaluate(() => (document.querySelector('.loading') || {}).textContent || '');
  console.log('caído:', msg);
  ok(/no está disponible ahora mismo/.test(msg) && !/clave de AllDebrid no es válida/.test(msg), 'aviso de debrid caído, no de clave mala');
  const box = () => p.evaluate(() => { const b = document.getElementById('debridbox'); return b && !b.classList.contains('hidden') ? b.textContent : ''; });
  await key('Escape'); await sleep(1500);
  const shown = await box();
  console.log('aviso arriba:', shown);
  ok(/AllDebrid caído/.test(shown), 'aviso fijo arriba con el debrid caído');
  await p.screenshot({ path: __dirname + '/shots/90-debrid-down.png' });

  // 5) dos seguidas con el mismo aviso del debrid: para en la segunda
  mode = 'notice';
  await p.evaluate(() => StremTV.open('movie', 'tt0468569')); await sleep(2500);
  await key('Enter'); await sleep(6000);
  st = await state();
  console.log('mismo aviso:', JSON.stringify(st));
  ok(!st.playing && st.failed.length === 2 && /han fallado igual/.test(st.toast), 'para tras dos fallos con el mismo aviso');
  ok(/AllDebrid falla/.test(await box()), 'con la lista buena pero los enlaces fallando: «AllDebrid falla»');
  // 6) clave mala: Torrentio dice «unavailable» igual, pero la lista y la etiqueta dicen que es la clave
  adBad = true; mode = 'down';
  await key('Escape'); await sleep(800); await key('Escape'); await sleep(1500);
  await p.evaluate(() => StremTV.open('movie', 'tt0110912')); await sleep(2500);
  await key('Enter'); await sleep(3500);
  const msg2 = await p.evaluate(() => (document.querySelector('.loading') || {}).textContent || '');
  console.log('clave mala:', msg2, '·', await box());
  ok(/La clave de AllDebrid no es válida/.test(msg2) && /Clave de AllDebrid no válida/.test(await box()), 'con la clave mal lo dice la lista y la etiqueta');
  ok(await p.evaluate(() => !!Array.prototype.filter.call(document.querySelectorAll('.btn'), (x) => /Abrir ajustes/.test(x.textContent)).length), 'con la clave mal ofrece abrir Ajustes');
  // 7) clave arreglada; la misma release repetida en la lista se salta y, al arrancar una del debrid, se quita la etiqueta
  adBad = false; mode = 'dup';
  await key('Escape'); await sleep(800); await key('Escape'); await sleep(1500);
  await p.evaluate(() => StremTV.open('movie', 'tt0137523')); await sleep(2500);
  await key('Enter'); await sleep(6000);
  st = await state();
  console.log('repetida:', JSON.stringify(st), '·', JSON.stringify(await box()));
  ok(st.playing && st.file === 'B.1080p.x264' && st.failed.length === 1, 'salta la repetida de la que falló');
  ok(!(await box()), 'al arrancar una fuente del debrid se quita la etiqueta');
  ok(!cached.length, 'la lista del debrid y la comprobación se piden sin caché' + (cached.length ? ': ' + cached[0] : ''));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
