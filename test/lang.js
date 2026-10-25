// Idioma de la app: cambiar a inglés desde Ajustes y comprobar inicio, ajustes, serie, fuentes y reproductor.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
const OUT = __dirname + '/shots';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('/stream/') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [
      { name: '[AD+] Torrentio\n1080p', title: 'Show.S01E01.1080p.WEB-DL-AAA\n👤 50 💾 1.2 GB ⚙️ x', url: VIDEO, behaviorHints: { filename: 'Show.S01E01.1080p.WEB-DL-AAA.mkv' } }] }) });
    if (u.indexOf('opensubtitles-v3') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"subtitles":[]}' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(300); } };
  const text = (sel) => p.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((x) => x.textContent).join(' | '), sel);
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: false })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  console.log('ES pestañas:', await text('.tab'));
  // ir a Ajustes y cambiar el idioma (primera opción)
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(800);
  console.log('foco en ajustes:', await p.evaluate(() => StremTV.Nav.cur.textContent));
  await key('Enter'); await sleep(1500);
  console.log('tras cambiar → foco:', await p.evaluate(() => StremTV.Nav.cur && StremTV.Nav.cur.textContent), '· pila:', await p.evaluate(() => StremTV.stack.length), '· lang:', await p.evaluate(() => document.documentElement.lang));
  console.log('EN opciones:', (await text('.opt')).slice(0, 400));
  await p.screenshot({ path: OUT + '/70-settings-en.png' });
  await key('Escape'); await sleep(2500);
  console.log('EN inicio filas:', await text('.row-title'), '· pestañas:', await text('.tab'));
  await p.screenshot({ path: OUT + '/71-home-en.png' });
  await p.evaluate(() => StremTV.open('series', 'tt0903747')); await sleep(3000);
  console.log('EN serie:', (await text('.seasons .btn')).slice(0, 80), '·', (await text('.ep-title')).slice(0, 60));
  await p.screenshot({ path: OUT + '/72-detail-en.png' });
  await p.evaluate(() => StremTV.Nav.focus(document.querySelector('.ep'))); await key('Enter'); await sleep(2000);
  console.log('EN fuentes:', await text('.screen-sub'), '·', await text('.stream .t1'));
  await key('Enter'); await sleep(3000);
  console.log('EN reproductor ayuda:', await text('#osd-help'));
  await key('ArrowUp'); await sleep(500);
  console.log('EN menú subs:', await text('.modal h2'), '·', await text('.mi'));
  await key('Escape'); await key('Escape'); await sleep(500);
  // volver a español
  await p.evaluate(() => { StremTV.settings.lang = 'es'; });
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
