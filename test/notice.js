const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const u = req.url();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': '*' };
    if (u.indexOf('/stream/movie/') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ streams: [{ name: '[AD+] Torrentio\n1080p', title: 'Movie.1080p.x264.mp4', url: 'https://torrentio.strem.fun/alldebrid/KEY/hash/null/0/Movie.mp4' }] }) });
    if (u.indexOf('/alldebrid/KEY/') >= 0) return req.respond({ status: 302, headers: Object.assign({ Location: 'https://torrentio.strem.fun/videos/blocked_access_v2.mp4' }, cors) });
    if (u.indexOf('/videos/blocked_access') >= 0) return req.respond({ status: 206, headers: cors, contentType: 'video/mp4', body: 'x' });
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    req.continue();
  });
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'KEY', debrid: 'alldebrid', quickPlay: false })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await p.keyboard.press('Enter'); await sleep(2500);
  await p.keyboard.press('Enter'); await sleep(3000);
  console.log('TOAST:', await p.evaluate(() => document.querySelector('#toast').textContent));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
