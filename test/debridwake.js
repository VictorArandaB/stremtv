// «⚠ AllDebrid caído» al volver de reposo: si la tele ha dormido (los temporizadores se paran) se vuelve a comprobar,
// y si al despertar aún no hay red, en cuanto vuelve.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, t) => console.log((c ? '✓ ' : '✗ ') + t);
let down = false, offline = false, probes = 0, adBad = false;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  p.on('request', (req) => {
    const u = req.url();
    if (offline && !/127\.0\.0\.1/.test(u)) return req.abort('internetdisconnected');
    if (u.indexOf('api.alldebrid.com/v4/user') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(adBad
      ? { status: 'error', error: { code: 'AUTH_BAD_APIKEY', message: 'The auth apikey is invalid' } }
      : { status: 'success', data: { user: { isPremium: true, premiumUntil: 1800000000 } } }) });
    if (u.indexOf('/stream/movie/tt0111161.json') >= 0) {
      probes++;
      const streams = down ? [{ name: 'Torrentio\nAD error', title: 'AllDebrid is currently unavailable!\nPlease try again later.', url: 'https://torrentio.strem.fun/videos/failed_unavailable_v1.mp4' }]
        : [{ name: '[AD+] Torrentio\n1080p', title: 'Movie.1080p.x264\n👤 50 💾 2 GB ⚙️ x', url: 'https://x.test/a.mp4' }];
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams }) });
    }
    req.continue();
  });
  const box = () => p.evaluate(() => { const x = document.getElementById('debridbox'); return x && !x.classList.contains('hidden') ? x.textContent : ''; });
  const jump = (ms) => p.evaluate((ms) => { const real = Date.now; Date.now = () => real() + ms; }, ms);
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid' })); });
  await p.reload({ waitUntil: 'networkidle2' });
  await sleep(23000);
  ok(probes === 1 && !(await box()), 'al arrancar: comprobado y funciona');

  // 1) duerme 2 h con red: al despertar comprueba otra vez y ve la caída
  down = true;
  await jump(2 * 3600000);
  await sleep(32000);
  console.log('tras despertar:', probes, 'comprobaciones ·', await box());
  ok(probes === 2 && /AllDebrid caído/.test(await box()), 'al despertar comprueba y sale la etiqueta');

  // 2) duerme otra vez y despierta sin red, con AllDebrid ya arreglado: comprueba al volver la red
  down = false; offline = true;
  await jump(3 * 3600000);
  await sleep(33000);
  const before = probes;
  ok(/AllDebrid caído/.test(await box()), 'sin red sigue la etiqueta (no se sabe)');
  offline = false;
  await sleep(14000); // la red se vuelve a probar cada 10 s
  console.log('al volver la red:', probes - before, 'comprobaciones ·', JSON.stringify(await box()));
  ok(probes > before && !(await box()), 'al volver la red comprueba y quita la etiqueta');
  const log = await p.evaluate(() => JSON.parse(localStorage.getItem('stv.log') || '[]').filter((e) => e.k === 'debrid').map((e) => e.m));
  console.log('registro:', log.join(' · '));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
