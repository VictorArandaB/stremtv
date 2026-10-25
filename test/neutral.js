// Sin ningún addon de fuentes (como Stremio recién instalado): aviso en Inicio y mensaje claro al buscar fuentes.
// Al añadir uno con formato de debrid, se usa con la clave y opciones de Ajustes.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const urls = [];
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('fuentes.test') >= 0) {
      urls.push(u);
      if (u.indexOf('manifest.json') >= 0) return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ id: 'com.stremio.torrentio.addon', name: 'Fuentes', resources: ['stream'], types: ['movie', 'series'], catalogs: [] }) });
      return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify({ streams: [{ name: '[AD+] Fuentes\n1080p', title: 'X.1080p.mkv\n💾 1 GB', url: 'https://v.test/x.mkv' }] }) });
    }
    req.continue();
  });
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ key: 'CLAVE', debrid: 'alldebrid', quickPlay: false, maxQ: '1080' })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1200);
  console.log('Inicio sin addon:', await p.evaluate(() => (document.querySelector('.btn.primary') || {}).textContent));
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await p.keyboard.press('Enter'); await sleep(1500);
  console.log('fuentes sin addon:', await p.evaluate(() => document.querySelector('.list .loading').textContent));
  // añadir el addon de fuentes desde Ajustes
  await p.evaluate(() => { while (StremTV.stack.length > 1) StremTV.Nav.cur = null, document.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27 })); });
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === 'Ajustes')[0])); await p.keyboard.press('Enter'); await sleep(600);
  await p.evaluate(() => { const i = Array.from(document.querySelectorAll('input')).filter((x) => /manifest/.test(x.placeholder))[0]; StremTV.Nav.focus(i); i.focus(); i.value = 'https://fuentes.test/manifest.json'; }); await p.keyboard.press('Enter'); await sleep(1500);
  console.log('añadido:', await p.evaluate(() => Array.from(document.querySelectorAll('.opt')).filter((x) => /Fuentes/.test(x.textContent)).map((x) => x.textContent).join()));
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await p.keyboard.press('Enter'); await sleep(1500);
  console.log('fuentes:', await p.evaluate(() => document.querySelector('.screen-sub').textContent));
  console.log('petición con la config de Ajustes:', urls.filter((u) => /stream/.test(u)).map((u) => u.replace(/CLAVE/, '***'))[0]);
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
