// Ajustes por categorías: menú con resumen, abrir cada categoría, volver, y apertura directa en Fuentes si falta el addon.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const tab = async () => { await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === 'Ajustes')[0])); await key('Enter'); await sleep(600); };
  const shown = () => p.evaluate(() => { const s = StremTV.stack[StremTV.stack.length - 1].el; const t = s.querySelector('.settings-title'); return (t ? t.textContent : 'MENÚ') + ' · foco: ' + StremTV.Nav.cur.textContent.slice(0, 50); });
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  await tab();
  console.log('sin addon de fuentes →', await shown());
  console.log('opciones:', await p.evaluate(() => Array.from(StremTV.stack[StremTV.stack.length - 1].el.querySelectorAll('.row-title')).map((x) => x.textContent).join(' | ')));
  await key('Escape'); await sleep(400);
  console.log('Atrás →', await shown());
  console.log('menú:', await p.evaluate(() => Array.from(StremTV.stack[StremTV.stack.length - 1].el.querySelectorAll('.opt')).map((x) => x.firstChild.textContent + ' [' + x.lastChild.textContent + ']').join('\n      ')));
  for (const [i, name] of [[1, 'Reproducción'], [2, 'Subtítulos'], [3, 'Cuentas'], [4, 'General'], [5, 'Datos y diagnóstico']]) {
    await p.evaluate((i) => StremTV.Nav.focus(StremTV.stack[StremTV.stack.length - 1].el.querySelectorAll('.opt')[i]), i); await key('Enter'); await sleep(400);
    console.log(name, '→', await shown(), '· elementos:', await p.evaluate(() => StremTV.stack[StremTV.stack.length - 1].el.querySelectorAll('.f').length));
    await key('Escape'); await sleep(300);
  }
  // cambiar un ajuste y ver el resumen actualizado al volver
  await p.evaluate(() => StremTV.Nav.focus(StremTV.stack[StremTV.stack.length - 1].el.querySelectorAll('.opt')[2])); await key('Enter'); await sleep(300);
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.opt')).filter((x) => /Color/.test(x.textContent)).pop())); await key('Enter'); await key('Escape'); await sleep(300);
  console.log('resumen Subtítulos tras cambiar color:', await p.evaluate(() => StremTV.stack[StremTV.stack.length - 1].el.querySelectorAll('.opt')[2].lastChild.textContent));
  // con addon de fuentes, la pestaña abre el menú
  await p.evaluate(() => { localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://x.test', manifest: { id: 'com.stremio.torrentio.addon', name: 'Fuentes', resources: ['stream'], types: ['movie'], catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  await tab();
  console.log('con addon →', await shown());
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
