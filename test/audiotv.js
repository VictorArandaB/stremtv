// Tele que ignora el cambio de pista de audio durante los primeros 2,5 s de reproducción (como la UE40MU6405):
// la app debe insistir hasta que lo acepte y no quedarse en la primera pista (ruso).
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.evaluateOnNewDocument(() => {
    let cur = 1, playAt = 0, state = 'IDLE', listener = {}, timer = null;
    window.__audioLog = [];
    window.webapis = { avplay: {
      open: () => { state = 'IDLE'; }, setDisplayRect: () => {}, setDisplayMethod: () => {}, setStreamingProperty: () => {}, setBufferingParam: () => {},
      setListener: (l) => { listener = l; },
      prepareAsync: (ok) => setTimeout(() => { state = 'READY'; ok(); }, 200),
      getDuration: () => 1500000, getState: () => state,
      play: () => { state = 'PLAYING'; playAt = Date.now(); let ms = 0; timer = setInterval(() => { ms += 500; listener.oncurrentplaytime && listener.oncurrentplaytime(ms); }, 500); },
      pause: () => { state = 'PAUSED'; }, seekTo: (ms, ok) => ok && ok(), stop: () => { clearInterval(timer); }, close: () => { clearInterval(timer); state = 'NONE'; },
      getTotalTrackInfo: () => [{ type: 'AUDIO', index: 1, extra_info: '{"language":"rus","fourCC":"AC3"}' }, { type: 'AUDIO', index: 2, extra_info: '{"language":"eng","fourCC":"AC3"}' }],
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: cur }],
      setSelectTrack: (k, i) => { const ok = playAt && Date.now() - playAt > 2500; window.__audioLog.push((playAt ? Date.now() - playAt : -1) + 'ms→' + (ok ? 'ok' : 'ignorado')); if (ok) cur = i; },
      setSilentSubtitle: () => {} }, appcommon: { setScreenSaver: () => {}, AppCommonScreenSaverState: {} } };
  });
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('/stream/') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [{ name: '[AD+] Torrentio\n1080p', title: 'Serie.S01E01.1080p.RUS.ENG.mkv\n💾 1 GB', url: VIDEO }] }) });
    if (u.indexOf('opensubtitles-v3') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"subtitles":[]}' });
    req.continue();
  });
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', audioLang: 'spa' })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  console.log('reproductor nativo simulado:', await p.evaluate(() => StremTV.Player.hasAV()));
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await p.keyboard.press('Enter');
  const t0 = Date.now(); let firstEng = 0;
  for (let i = 0; i < 30 && !firstEng; i++) { await sleep(200); if (await p.evaluate(() => { try { return webapis.avplay.getCurrentStreamInfo()[0].index === 2; } catch (e) { return false; } })) firstEng = Date.now() - t0; }
  await sleep(2000);
  console.log('intentos de la app:', (await p.evaluate(() => window.__audioLog)).join(', '));
  console.log('suena en inglés desde (desde pulsar OK):', firstEng ? firstEng + ' ms' : 'NUNCA');
  console.log('registro:', await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('stv.log') || '[]').filter((e) => e.k === 'audio').map((e) => e.m + ' ' + JSON.stringify(e.d)))));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
