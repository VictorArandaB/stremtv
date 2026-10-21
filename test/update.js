// Actualización automática como en la tele: paquete instalado (wgt-build) + versión guardada anterior.
// Uso: servir wgt-build en el puerto 8092 y ejecutar: node test/update.js <carpeta con app.js/style.css viejos> <sha nuevo>
// 1) CDN bien: arranca la guardada, descarga la nueva y el siguiente arranque la usa conservando los datos.
// 2) CDN caído (503): sigue arrancando la guardada sin errores.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OLD = process.argv[2], NEW_SHA = process.argv[3];
const oldJs = fs.readFileSync(OLD + '/app.js', 'utf8'), oldCss = fs.readFileSync(OLD + '/style.css', 'utf8');
const newJs = fs.readFileSync(__dirname + '/../app/app.js', 'utf8'), newCss = fs.readFileSync(__dirname + '/../app/style.css', 'utf8');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  let cdnDown = false; const hits = [];
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('api.github.com/repos/VictorArandaB/stremtv/commits/main') >= 0) { hits.push('github'); return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'text/plain', body: NEW_SHA + '\n' }); }
    if (u.indexOf('cdn.jsdelivr.net/gh/VictorArandaB/stremtv@') >= 0) {
      hits.push('cdn ' + u.split('/').pop() + (cdnDown ? ' 503' : ''));
      if (cdnDown) return req.respond({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'text/html', body: '503 No healthy backends' });
      return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'text/plain', body: u.indexOf('app.js') >= 0 ? newJs : newCss });
    }
    req.continue();
  });
  const ready = async () => { const t0 = Date.now(); while (!(await p.evaluate(() => !!document.querySelector('.focused'))) && Date.now() - t0 < 15000) await sleep(100); };
  const state = () => p.evaluate(() => ({ running: (window.__boot || {}).src, focus: (document.querySelector('.focused') || {}).textContent,
    saved: ((localStorage.getItem('stv.code') || '').match(/VERSION = '([\d.]+)'/) || [])[1], key: JSON.parse(localStorage.getItem('stv.settings') || '{}').key,
    progress: Object.keys(JSON.parse(localStorage.getItem('stv.progress') || '{}')).length, rows: document.querySelectorAll('.row-title').length }));

  await p.goto('http://127.0.0.1:8092/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((js, css) => { localStorage.clear();
    localStorage.setItem('stv.code', JSON.stringify({ sha: '61ae4c9', js, css, ts: Date.now() }));
    localStorage.setItem('stv.settings', JSON.stringify({ key: 'CLAVE', debrid: 'alldebrid', subLang: 'spa' }));
    localStorage.setItem('stv.progress', JSON.stringify({ tt1: { videoId: 'tt1', metaId: 'tt1', type: 'movie', name: 'Peli', t: 600, d: 6000, ts: Date.now() } })); }, oldJs, oldCss);
  await p.reload({ waitUntil: 'domcontentloaded' }); await ready();
  console.log('arranque 1:', JSON.stringify(await state()));
  await sleep(11000); // boot.js busca la actualización a los 8 s
  console.log('tras buscar actualización:', JSON.stringify(await state()), '· peticiones:', hits.join(', '));
  await p.reload({ waitUntil: 'domcontentloaded' }); await ready(); await sleep(1500);
  console.log('arranque 2:', JSON.stringify(await state()));
  console.log('versión en ejecución:', await p.evaluate(() => Array.prototype.filter.call(document.querySelectorAll('style'), (s) => /upnext|cert-warn/.test(s.textContent)).length ? 'estilos nuevos cargados' : 'estilos viejos'));

  // 2) CDN caído: commit nuevo en GitHub, pero jsDelivr devuelve 503
  cdnDown = true; hits.length = 0;
  await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('stv.code')); c.sha = 'otro'; localStorage.setItem('stv.code', JSON.stringify(c)); });
  await p.reload({ waitUntil: 'domcontentloaded' }); await ready(); await sleep(11000);
  console.log('con CDN caído:', JSON.stringify(await state()), '· peticiones:', hits.join(', '));
  await p.reload({ waitUntil: 'domcontentloaded' }); await ready();
  console.log('siguiente arranque con CDN caído:', JSON.stringify(await state()));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
