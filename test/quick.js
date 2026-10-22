// Reproducción directa, hora de fin, subtítulos incrustados por defecto, fondo de subtítulos y aviso del certificado.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('/stream/') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [
      { name: '[AD download] Torrentio\n4k', title: 'Movie.2160p.DV.mkv\n👤 9 💾 30 GB ⚙️ x', url: VIDEO },
      { name: '[AD+] Torrentio\n1080p', title: 'Movie.1080p.x264-AAA\n👤 50 💾 2 GB ⚙️ x', url: VIDEO }] }) });
    if (u.indexOf('opensubtitles-v3') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ subtitles: [{ id: '1', lang: 'spa', url: 'https://subs.test/a.srt' }] }) });
    if (u.indexOf('subs.test') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'text/plain', body: '1\n00:00:00,000 --> 00:00:30,000\nHola mundo\n' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(300); } };
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid' })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(3500); // ▶ Ver → directo
  console.log('directo:', await p.evaluate(() => [StremTV.Player.backend, StremTV.Player.stream && StremTV.Player.stream.file, document.getElementById('player').className].join(' | ')));
  console.log('osd fin:', await p.evaluate(() => document.getElementById('osd-dur').textContent));
  console.log('subs:', await p.evaluate(() => document.getElementById('subs').className + ' · ' + document.getElementById('subs').innerHTML));
  await p.screenshot({ path: __dirname + '/shots/80-quick.png' });
  await key('Escape'); await sleep(800);
  // ya reproducido: Atrás vuelve a la ficha, no a la lista de fuentes
  console.log('tras Atrás:', await p.evaluate(() => { const t = StremTV.stack[StremTV.stack.length - 1]; return (t.streamsOf ? 'lista' : t.el.querySelector('.detail') ? 'ficha' : '?') + ' · foco: ' + StremTV.Nav.cur.textContent.slice(0, 60); }));
  // subtítulos incrustados con AVPlay simulado
  const emb = await p.evaluate(() => {
    const calls = [];
    window.webapis = { avplay: {
      getTotalTrackInfo: () => [{ type: 'AUDIO', index: 1, extra_info: '{"language":"eng"}' }, { type: 'TEXT', index: 3, extra_info: '{"track_lang":"eng"}' }, { type: 'TEXT', index: 4, extra_info: '{"track_lang":"spa"}' }],
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: 1 }],
      setSelectTrack: (k, i) => calls.push(k + i), setSilentSubtitle: (v) => calls.push('silent' + v) } };
    const P = StremTV.Player; P.ctx = { type: 'movie', metaId: 'x' };
    P.autoAudio();
    return calls.join(',');
  });
  console.log('incrustados (audio eng, subs spa):', emb);
  // aviso del certificado: simular que faltan 10 días
  await p.evaluate(() => { Date.now = () => new Date(2026, 11, 22).getTime(); });
  await key('Escape'); await sleep(1500);
  console.log('aviso certificado:', await p.evaluate(() => (document.querySelector('.cert-warn') || {}).textContent));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
