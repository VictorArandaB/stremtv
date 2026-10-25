// Arranque con los archivos del paquete en los dos servidores: 8090 (modo desarrollo, sin actualizaciones) y 8091 (como en
// la tele). Con el almacenamiento vacío los dos cargan app.js/style.css del paquete y la app arranca con el foco en Inicio.
// Uso: servir app/ en 127.0.0.1:8090 y :8091 y ejecutar node test/loader.js. Sale con código 1 si algo falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? 'OK  ' : 'MAL ') + what + (got !== undefined ? ' → ' + JSON.stringify(got) : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  for (const port of [+(process.env.STV_PORT || 8090), +(process.env.STV_PORT2 || 8091)]) {
    const p = await b.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);
    const r = await p.evaluate(() => ({
      app: !!window.StremTV, focus: (document.querySelector('.focused') || {}).textContent, src: (window.__boot || {}).src,
      js: Array.from(document.scripts).map((s) => s.src).filter((s) => /app\.js/.test(s)).length,
      css: Array.from(document.querySelectorAll('link')).map((l) => l.href).filter((h) => /style\.css/.test(h)).length,
    }));
    check(r.app && r.focus === 'Inicio', port + ': la app arranca con el foco en Inicio', r.focus);
    check(/^paquete/.test(r.src || ''), port + ': cargada del paquete', r.src);
    check(r.js === 1 && r.css === 1, port + ': app.js y style.css como archivos', [r.js, r.css]);
    check(!errs.length, port + ': sin errores de JS', errs);
    await p.close();
  }
  await b.close();
  process.exit(fails ? 1 : 0);
})();
