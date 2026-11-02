// «Probar clave» en Ajustes pregunta la clave al propio debrid: Torrentio da fuentes aunque la clave esté mal.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, t) => console.log((c ? '✓ ' : '✗ ') + t);
let adBad = false, down = false;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('api.alldebrid.com/v4/user') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(adBad
      ? { status: 'error', error: { code: 'AUTH_BAD_APIKEY', message: 'The auth apikey is invalid' } }
      : { status: 'success', data: { user: { isPremium: true, premiumUntil: 1800000000 } } }) });
    if (u.indexOf('/stream/') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: down
      ? [{ name: 'Torrentio\nAD error', title: 'AllDebrid is currently unavailable!\nPlease try again later.', url: 'https://torrentio.strem.fun/videos/failed_unavailable_v1.mp4' }]
      : ['A', 'B', 'C'].map((x) => ({ name: '[AD+] Torrentio\n1080p', title: x + '.1080p\n👤 5 💾 2 GB', url: 'https://x.test/' + x })) }) });
    req.continue();
  });
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid' })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  await p.evaluate(() => StremTV.openSettings('sources')); await sleep(1500);
  const test = async () => {
    await p.evaluate(() => { const btn = Array.prototype.filter.call(document.querySelectorAll('.btn'), (x) => x.textContent === 'Probar clave')[0]; StremTV.Nav.focus(btn); });
    await p.keyboard.press('Enter'); await sleep(1500);
    return p.evaluate(() => { const btn = Array.prototype.filter.call(document.querySelectorAll('.btn'), (x) => x.textContent === 'Probar clave')[0]; return btn.nextSibling.textContent; });
  };
  let t = await test(); console.log('buena:', t);
  ok(/✓ Clave válida · premium hasta el/.test(t) && /3 fuentes de prueba/.test(t), 'clave buena: válida, premium y fuentes');
  adBad = true;
  t = await test(); console.log('mala:', t);
  ok(/✗ La clave de AllDebrid no es válida/.test(t), 'clave mala: no válida aunque Torrentio dé fuentes');
  adBad = false; down = true;
  t = await test(); console.log('caído:', t);
  ok(/✓ Clave válida/.test(t) && /no funciona ahora mismo con Torrentio/.test(t), 'clave buena y debrid caído: lo dice');
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
