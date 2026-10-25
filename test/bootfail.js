// Versión guardada que falla a medias al arrancar: se descarta y se arranca limpio con la del paquete, sin ejecutar dos copias.
// Uso: servir app/ en el puerto 8091 (fuera del modo desarrollo) y ejecutar node test/bootfail.js. Sale con código 1 si falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT2 || 8091) + '/'), { waitUntil: 'domcontentloaded' });
  // la guardada registra un listener de teclas (como app.js) y después lanza una excepción
  await p.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    const js = "var VERSION = '99.0.0'; /* StremTV */ sessionStorage.setItem('badRuns', +(sessionStorage.getItem('badRuns') || 0) + 1);" +
      " document.addEventListener('keydown', function () { window.__badKeys = (window.__badKeys || 0) + 1; }); throw new Error('rota');";
    localStorage.setItem('stv.code', JSON.stringify({ sha: 'a'.repeat(40), js, css: 'body{}', ts: Date.now() }));
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  while (!(await p.evaluate(() => !!(window.StremTV && document.querySelector('.focused'))).catch(() => false)) && Date.now() - t0 < 10000) await sleep(100);
  const r = await p.evaluate(() => ({ app: !!window.StremTV, runs: sessionStorage.getItem('badRuns'), code: localStorage.getItem('stv.code'),
    bad: localStorage.getItem('stv.code.bad'), src: window.__boot && window.__boot.src }));
  check(r.app, 'arranca la app del paquete', r.src);
  check(r.runs === '1', 'la guardada rota se ejecutó una sola vez', r.runs);
  check(!r.code && r.bad === 'a'.repeat(40), 'la guardada se borra y su commit queda marcado', r.bad);
  await p.keyboard.press('ArrowRight'); await sleep(200);
  check(!(await p.evaluate(() => window.__badKeys)), 'tras recargar no queda ningún listener de la versión rota');
  check(!errs.filter((e) => e !== 'rota').length, 'sin otros errores de página', errs.join(' | ') || undefined);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
