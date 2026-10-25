// Prueba de la interfaz en Chrome headless simulando el mando con las flechas.
// Uso: node ui.js [url]   -> capturas en ./shots
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const URL = process.argv[2] || ('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/');
const OUT = __dirname + '/shots';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(250); } };
  const shot = async (name) => { await sleep(600); await page.screenshot({ path: `${OUT}/${name}.png` }); };
  const focused = () => page.evaluate(() => {
    const f = document.querySelector('.focused');
    return f ? f.className + ' | ' + (f.textContent || f.value || f.placeholder || '').slice(0, 60) : null;
  });

  await page.goto(URL, { waitUntil: 'networkidle2' });
  await sleep(2500);
  await shot('01-home');
  console.log('foco inicial:', await focused());

  await key('ArrowDown', 2); console.log('abajo x2:', await focused());
  await key('ArrowRight', 3); console.log('derecha x3:', await focused());
  await shot('02-home-nav');
  await key('ArrowDown'); console.log('abajo:', await focused());
  await key('ArrowUp'); console.log('arriba (vuelve al último):', await focused());

  await key('Enter'); await sleep(2500);
  await shot('03-detail-movie'); console.log('detalle:', await focused());
  await key('Enter'); await sleep(4000);
  await shot('04-streams-nokey'); console.log('fuentes:', await page.$eval('.screen-sub', (e) => e.textContent).catch(() => '?'));
  await key('Escape'); await key('Escape'); await sleep(500);

  // serie: segunda fila
  await key('ArrowDown'); console.log('fila series:', await focused());
  await key('Enter'); await sleep(3000);
  await shot('05-detail-series'); console.log('detalle serie:', await focused());
  await key('ArrowDown'); console.log('episodio:', await focused());
  await key('ArrowDown', 3); console.log('episodio +3:', await focused());
  await shot('06-episodes');
  await key('Escape'); await sleep(500);

  // buscar
  await key('ArrowUp', 6); console.log('cabecera:', await focused());
  await key('ArrowRight'); await key('Enter'); await sleep(800);
  console.log('buscar foco:', await focused());
  await key('Enter');
  await page.keyboard.type('matrix'); await key('Enter'); await sleep(3000);
  await shot('07-search');
  await key('ArrowDown'); console.log('resultado:', await focused());
  await key('Escape');

  // ajustes
  await key('ArrowUp', 3); await key('ArrowRight', 2); console.log('tab:', await focused());
  await key('Enter'); await sleep(800);
  await shot('08-settings'); console.log('ajustes foco:', await focused());
  await key('Escape'); await sleep(300);
  await key('Escape'); await sleep(500);
  await shot('09-exit-dialog'); console.log('salir foco:', await focused());

  console.log('\nERRORES:', errors.length ? '\n' + errors.join('\n') : 'ninguno');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
