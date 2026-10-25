// Siguiente episodio: fuente recordada por serie, arranque automático y aviso de los últimos 40 s.
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
    const m = /\/stream\/series\/tt0903747:(\d+):(\d+)\.json/.exec(u);
    if (m) {
      const ep = 'S0' + m[1] + 'E0' + m[2];
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [
        { name: '[AD+] Torrentio\n1080p', title: 'Show.' + ep + '.1080p.WEB-DL.Castellano-AAA\n👤 50 💾 1.2 GB ⚙️ x\n🇪🇸', url: VIDEO, behaviorHints: { bingeGroup: 'torrentio|1080p|AAA', filename: 'Show.' + ep + '.1080p.WEB-DL.Castellano-AAA.mkv' } },
        { name: '[AD+] Torrentio\n720p', title: 'Show.' + ep + '.720p.HDTV-BBB\n👤 10 💾 400 MB ⚙️ x', url: VIDEO, behaviorHints: { bingeGroup: 'torrentio|720p|BBB', filename: 'Show.' + ep + '.720p.HDTV-BBB.mkv' } },
      ] }) });
    }
    if (u.indexOf('opensubtitles-v3') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"subtitles":[]}' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(300); } };
  const state = () => p.evaluate(() => ({ playing: StremTV.Player.ctx && StremTV.Player.ctx.epLabel, file: StremTV.Player.stream && StremTV.Player.stream.file,
    player: document.getElementById('player').className, stack: StremTV.stack.length }));
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: false })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  await p.evaluate(() => StremTV.open('series', 'tt0903747')); await sleep(3000);
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.ep'))); await key('Enter'); await sleep(2000);
  console.log('E1 fuentes:', await p.evaluate(() => Array.from(document.querySelectorAll('.stream .t1')).map((x) => x.textContent).join(' | ')));
  await key('ArrowDown'); await key('Enter'); await sleep(3000);   // elegir la 720p de BBB
  console.log('E1 reproduciendo:', JSON.stringify(await state()), 'pref:', await p.evaluate(() => localStorage.getItem('stv.srcprefs')));
  await sleep(11000); // el vídeo de prueba dura 10 s: al acabar debe pasar solo al E2
  console.log('E2 automático:', JSON.stringify(await state()));
  console.log('E2 fuentes:', await p.evaluate(() => Array.from(document.querySelectorAll('.stream .t1')).map((x) => x.textContent).join(' | ')));
  console.log('progreso E1:', await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('stv.progress'))['tt0903747:1:1'])));
  // simular los últimos 40 s de un episodio largo
  await p.evaluate(() => { const P = StremTV.Player; P.backend = 'test'; P.started = true; P.duration = 2700; P.time = 2670; P.paused = false; });
  await sleep(1000);
  console.log('aviso:', await p.evaluate(() => { const u = document.getElementById('upnext'); return u && u.className + ' · ' + u.textContent; }));
  await p.screenshot({ path: __dirname + '/shots/60-upnext.png' });
  await key('Escape'); await sleep(500);
  console.log('tras Atrás (descartado, sigue el vídeo):', await p.evaluate(() => document.getElementById('upnext').className), JSON.stringify(await state()));
  await p.evaluate(() => { const P = StremTV.Player; P.time = 2000; }); await sleep(500);
  await p.evaluate(() => { const P = StremTV.Player; P.time = 2670; }); await sleep(600);
  console.log('vuelve a avisar tras retroceder:', await p.evaluate(() => document.getElementById('upnext').textContent));
  await sleep(10500);
  console.log('E3 tras la cuenta atrás:', JSON.stringify(await state()));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
