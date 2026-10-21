// Simula Torrentio con debrid (respuesta falsa) para probar fuentes, ajustes y reproductor.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('torrentio.strem.fun') >= 0 && u.indexOf('/stream/') >= 0) {
      return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ streams: [
        { name: '[RD+] Torrentio\n1080p', title: 'Movie.2024.1080p.WEB-DL.mkv\n👤 120 💾 2.1 GB ⚙️ ThePirateBay\n🇬🇧', url: VIDEO },
        { name: '[RD+] Torrentio\n4k', title: 'Movie.2024.2160p.HDR.Castellano.mkv\n👤 30 💾 15 GB ⚙️ MejorTorrent\n🇪🇸', url: VIDEO },
        { name: '[RD download] Torrentio\n720p', title: 'Movie.2024.720p.mkv\n👤 5 💾 900 MB ⚙️ 1337x', url: VIDEO },
      ] }) });
    }
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(250); } };
  const focused = () => page.evaluate(() => { const f = document.querySelector('.focused'); return f ? (f.textContent || f.value || '').slice(0, 70) : null; });

  await page.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await page.evaluate(() => { localStorage.setItem('stv.settings', JSON.stringify({ key: 'FAKE', debrid: 'realdebrid', quickPlay: false })); });
  await page.reload({ waitUntil: 'networkidle2' }); await sleep(2000);
  console.log('inicio con clave (sin aviso):', await focused());
  await key('ArrowDown'); await key('Enter'); await sleep(2500);   // Cadena perpetua? primera película
  await key('Enter'); await sleep(2500);
  await page.screenshot({ path: OUT + '/10-streams.png' });
  console.log('primera fuente (ES primero):', await focused());
  await key('Enter'); for (let i=0;i<12;i++){ await sleep(500); console.log('t+', i, await page.evaluate(() => [StremTV.Player.backend, document.querySelector('#toast').textContent, document.querySelector('#spinner-text').textContent, document.querySelector('video').error && document.querySelector('video').error.code].join(' | '))); }
  const st = await page.evaluate(() => ({ backend: StremTV.Player.backend, t: StremTV.Player.time, d: StremTV.Player.duration, subs: document.querySelector('#subs').textContent }));
  console.log('reproductor:', JSON.stringify(st));
  await key('ArrowRight', 3); await sleep(1500);
  console.log('tras avanzar x3:', await page.evaluate(() => StremTV.Player.time.toFixed(1)));
  await page.screenshot({ path: OUT + '/11-player.png' });
  await key('ArrowUp'); await sleep(800);
  await page.screenshot({ path: OUT + '/12-subs-menu.png' });
  console.log('menú subs foco:', await focused());
  await key('Escape'); await sleep(300);
  await key('Escape'); await sleep(800);
  console.log('tras salir, pantalla:', await page.evaluate(() => document.querySelector('#player').className), await focused());
  const prog = await page.evaluate(() => localStorage.getItem('stv.progress'));
  console.log('progreso guardado:', prog && prog.slice(0, 200));
  await key('Escape'); await key('Escape'); await sleep(1500);
  await page.screenshot({ path: OUT + '/13-home-continue.png' });
  // ajustes
  await key('ArrowUp', 4); await key('ArrowRight', 2); await key('Enter'); await sleep(800);
  await page.screenshot({ path: OUT + '/14-settings.png' });
  console.log('ajustes foco:', await focused());
  console.log('\nERRORES:', errors.length ? errors.join('\n') : 'ninguno');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
