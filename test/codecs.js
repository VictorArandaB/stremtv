const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GOOD = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('torrentio.strem.fun') >= 0 && u.indexOf('/stream/') >= 0) return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ streams: [
      { name: '[AD+] Torrentio\n4k', title: 'Show.S01E01.2160p.WEB-DL.DV.HDR.DDP5.1.Atmos.H.265.mkv\n👤 90 💾 6 GB', url: 'https://example.invalid/broken.mkv' },
      { name: '[AD+] Torrentio\n1080p', title: 'Show.S01E01.1080p.BluRay.DTS-HD.MA.x264.mkv\n👤 40 💾 4 GB', url: GOOD },
      { name: '[AD+] Torrentio\n1080p', title: 'Show.S01E01.1080p.WEB-DL.x265.10bit.mkv\n👤 60 💾 1 GB', url: 'https://example.invalid/broken2.mkv' },
      { name: '[AD+] Torrentio\n1080p', title: 'Show.S01E01.1080p.WEB-DL.Castellano.AC3.x264.mkv\n👤 20 💾 2 GB\n🇪🇸', url: 'https://example.invalid/broken3.mkv' },
    ] }) });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const rows = () => p.evaluate(() => Array.from(document.querySelectorAll('.stream')).map((r) => (r.classList.contains('focused') ? '> ' : '  ') + r.querySelector('.t1').textContent.slice(0, 95)));
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ key: 'FAKE', debrid: 'alldebrid' })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(2500);
  console.log('ORDEN:\n' + (await rows()).join('\n'));
  await key('Enter'); await sleep(4000); // la primera (castellano, enlace roto) falla
  console.log('TOAST:', await p.evaluate(() => document.querySelector('#toast').textContent));
  console.log('TRAS FALLO:\n' + (await rows()).join('\n'));
  await p.screenshot({ path: __dirname + '/shots/30-codecs.png' });
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
