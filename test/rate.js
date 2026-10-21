const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('/stream/movie/') >= 0) return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ streams: [
      { name: '[AD+] Torrentio\n4k', title: 'Movie.2160p.REMUX.mkv\n👤 9 💾 60 GB ⚙️ x', url: 'https://x/1' },
      { name: '[AD+] Torrentio\n4k', title: 'Movie.2160p.WEB-DL.x264.mkv\n👤 9 💾 15 GB ⚙️ x', url: 'https://x/2' },
      { name: '[AD+] Torrentio\n1080p', title: 'Movie.1080p.WEB-DL.x264.mkv\n👤 9 💾 2.1 GB ⚙️ x', url: 'https://x/3' },
      { name: '[AD+] Torrentio\n720p', title: 'Movie.720p.x264.mp4\n👤 9 💾 900 MB ⚙️ x', url: 'https://x/4' } ] }) });
    req.continue();
  });
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', measuredMbps: 20, measuredAt: Date.now() })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await p.keyboard.press('Enter'); await sleep(2500);
  console.log(await p.evaluate(() => document.querySelector('.screen-sub').textContent));
  console.log(await p.evaluate(() => Array.from(document.querySelectorAll('.stream')).map((r) => r.querySelector('.q').textContent + ' | ' + r.querySelector('.t1').textContent).join('\n')));
  await p.screenshot({ path: __dirname + '/shots/60-rate.png' });
  // medir conexión desde ajustes
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await sleep(500);
  await p.evaluate(() => StremTV.openSettings('sources')); await sleep(600);
  await p.evaluate(() => { const bt = Array.from(document.querySelectorAll('.btn')).filter((x) => /Medir/.test(x.textContent))[0]; bt._onclick(bt); }); await sleep(12000);
  console.log('medida:', await p.evaluate(() => Array.from(document.querySelectorAll('.note')).map((n) => n.textContent).filter((t) => /Mb\/s|Midiendo|medir/.test(t)).join(' | ')));
  console.log('opción:', await p.evaluate(() => Array.from(document.querySelectorAll('.opt')).filter((o) => /Tasa/.test(o.textContent))[0].textContent));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
