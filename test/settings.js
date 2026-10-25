// Ajustes por categorías: menú con resumen, abrir cada categoría, volver, y apertura directa en Fuentes si falta el addon.
// Sale con código 1 si alguna comprobación falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';
  // la pestaña Ajustes de la pantalla de arriba (no la de otra pantalla de la pila)
  const tab = async () => { await p.evaluate((top) => StremTV.Nav.focus(Array.from(eval(top).querySelectorAll('.tab')).filter((x) => x.textContent === 'Ajustes')[0]), top); await key('Enter'); await sleep(600); };
  const shown = () => p.evaluate((top) => { const t = eval(top).querySelector('.settings-title'); return t ? t.textContent : 'MENÚ'; }, top);
  const depth = () => p.evaluate(() => StremTV.stack.length);
  const summary = (i) => p.evaluate((top, i) => eval(top).querySelectorAll('.opt')[i].lastChild.textContent, top, i);
  const torrentio = { url: 'https://x.test', manifest: { id: 'com.stremio.torrentio.addon', name: 'Fuentes', resources: ['stream'], types: ['movie'], catalogs: [] } };
  const comet = { url: 'https://c.test', manifest: { id: 'comet', name: 'Comet', resources: ['stream'], types: ['movie'], catalogs: [] } };
  const reset = async (settings, addons) => {
    await p.evaluate((s, a) => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify(s)); if (a) localStorage.setItem('stv.addons', JSON.stringify(a)); }, settings, addons);
    await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  };

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await reset({ quickPlay: false });
  await tab();
  check(await shown() === 'Ajustes › Fuentes y debrid', 'sin addon, la pestaña abre Fuentes y debrid', await shown());
  await key('Escape'); await sleep(400);
  check(await shown() === 'MENÚ', 'Atrás vuelve al menú', await shown());
  check((await summary(0)) === '✗ Falta un addon de fuentes', 'resumen sin addon', await summary(0));
  for (const [i, name] of [[1, 'Reproducción'], [2, 'Subtítulos'], [3, 'Cuentas'], [4, 'Protector de pantalla'], [5, 'General'], [6, 'Datos y diagnóstico']]) {
    await p.evaluate((top, i) => StremTV.Nav.focus(eval(top).querySelectorAll('.opt')[i]), top, i); await key('Enter'); await sleep(400);
    check(await shown() === 'Ajustes › ' + name, 'abre ' + name);
    await key('Escape'); await sleep(300);
  }
  // cambiar un ajuste y ver el resumen actualizado al volver
  await p.evaluate((top) => StremTV.Nav.focus(eval(top).querySelectorAll('.opt')[2]), top); await key('Enter'); await sleep(300);
  await p.evaluate((top) => StremTV.Nav.focus(Array.from(eval(top).querySelectorAll('.opt')).filter((x) => /Color/.test(x.textContent))[0]), top); await key('Enter'); await key('Escape'); await sleep(300);
  check(/Amarillo/.test(await summary(2)), 'resumen de Subtítulos tras cambiar el color', await summary(2));
  // General: ocultar lo visto también sale en el resumen
  await p.evaluate((top) => StremTV.Nav.focus(eval(top).querySelectorAll('.opt')[5]), top); await key('Enter'); await sleep(300);
  await p.evaluate((top) => StremTV.Nav.focus(Array.from(eval(top).querySelectorAll('.opt')).filter((x) => /Ocultar/.test(x.textContent))[0]), top); await key('Enter'); await key('Escape'); await sleep(300);
  check(/ocultar lo visto: No/.test(await summary(5)), 'resumen de General con ocultar lo visto', await summary(5));

  // aviso de Inicio: abre Fuentes con el menú debajo; Atrás → menú, otra vez → Inicio
  await reset({ quickPlay: false });
  const warn = await p.evaluate((top) => { const w = Array.from(eval(top).querySelectorAll('.btn.primary')).filter((x) => /addon de fuentes/.test(x.textContent))[0]; if (w) StremTV.Nav.focus(w); return w ? w.textContent : ''; }, top);
  check(/Fuentes y debrid/.test(warn), 'el aviso de Inicio nombra «Fuentes y debrid»', warn);
  await key('Enter'); await sleep(500);
  check(await shown() === 'Ajustes › Fuentes y debrid', 'el aviso abre Fuentes y debrid');
  await key('Escape'); await sleep(400);
  check(await shown() === 'MENÚ', 'desde el aviso, Atrás vuelve al menú');
  await key('Escape'); await sleep(400);
  check(await depth() === 1, 'otra vez Atrás → Inicio');

  // con addon de debrid, la pestaña abre el menú
  await reset({ quickPlay: false, key: 'k', debrid: 'alldebrid' }, [torrentio]);
  await tab();
  check(await shown() === 'MENÚ', 'con addon, la pestaña abre el menú');
  check(await summary(0) === 'Fuentes · AllDebrid ✓', 'resumen con addon y clave', await summary(0));

  // un solo addon que no usa la clave: ni «addons» en plural ni debrid
  await reset({ quickPlay: false, key: 'k', audioLang: 'es', subLang: 'xx' }, [comet]);
  await tab();
  check(await summary(0) === '1 addon de fuentes', 'resumen con un addon sin debrid', await summary(0));
  check(!/undefined/.test(await summary(1)) && /Audio: es/.test(await summary(1)), 'audio con código antiguo', await summary(1));
  check(!/undefined/.test(await summary(2)), 'subtítulos con código desconocido', await summary(2));

  // gancho de depuración con un id desconocido: sin error, cae en el menú
  const before = await depth();
  await p.evaluate(() => StremTV.openSettings('addons')); await sleep(300);
  check(await shown() === 'MENÚ' && await depth() === before + 1, 'openSettings con id desconocido abre el menú');

  check(!errs.length, 'sin errores de página', errs.join(' | ') || undefined);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
