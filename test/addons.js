// Addons: añadir por URL en Ajustes, fuentes mezcladas con Torrentio, catálogos en Inicio y búsqueda, ficha propia, subtítulos y quitar.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
const A = 'https://addon.test/cfg';
const manifest = { id: 'test.addon', name: 'Prueba', version: '1.0.0', types: ['movie', 'series'],
  resources: ['stream', 'subtitles', { name: 'meta', types: ['movie'], idPrefixes: ['prb:'] }],
  catalogs: [{ type: 'movie', id: 'prb.top', name: 'Destacadas', extra: [{ name: 'search' }, { name: 'skip' }] }, { type: 'movie', id: 'prb.year', name: 'Por año', extra: [{ name: 'genre', isRequired: true }] }] };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('addon.test') >= 0) {
      if (u === A + '/manifest.json') return json(req, manifest);
      if (u.indexOf('/catalog/movie/prb.top/search=') >= 0) return json(req, { metas: [{ id: 'prb:9', type: 'movie', name: 'Encontrada en Prueba', poster: '' }] });
      if (u.indexOf('/catalog/movie/prb.top.json') >= 0) return json(req, { metas: [{ id: 'prb:1', imdb_id: 'tt0111161', type: 'movie', name: 'Cadena perpetua (Prueba)' }, { id: 'prb:2', type: 'movie', name: 'Solo en Prueba' }] });
      if (u.indexOf('/meta/movie/prb:2.json') >= 0) return json(req, { meta: { id: 'prb:2', type: 'movie', name: 'Solo en Prueba', description: 'Ficha del addon' } });
      if (u.indexOf('/stream/movie/') >= 0) return json(req, { streams: [{ name: 'Prueba\n1080p', title: 'Movie.1080p.Castellano.mkv\n💾 1.5 GB', url: VIDEO }] });
      if (u.indexOf('/subtitles/') >= 0) return json(req, { subtitles: [{ id: 's1', lang: 'es', url: 'https://addon.test/s.srt' }] });
      return req.respond({ status: 404, headers: cors, body: '' });
    }
    if (u.indexOf('torrentio.strem.fun') >= 0 && u.indexOf('/stream/') >= 0) return json(req, { streams: [{ name: '[AD+] Torrentio\n720p', title: 'Movie.720p.mkv\n👤 5 💾 1 GB', url: VIDEO }] });
    if (u.indexOf('opensubtitles-v3') >= 0) return json(req, { subtitles: [{ id: 'o1', lang: 'eng', url: 'https://x.test/o.srt' }] });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const text = (sel) => p.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((x) => x.textContent).join(' | '), sel);
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: false, hideWatched: false })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  // Ajustes → escribir la URL del addon
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === 'Ajustes')[0])); await key('Enter'); await sleep(800);
  const typeUrl = async (u) => { await p.evaluate((u) => { const i = Array.from(document.querySelectorAll('input')).filter((x) => /manifest/.test(x.placeholder))[0]; StremTV.Nav.focus(i); i.focus(); i.value = u; }, u); await key('Enter'); await sleep(2500); };
  await typeUrl('stremio://addon.test/cfg/manifest.json');
  console.log('añadido:', await p.evaluate(() => Array.from(document.querySelectorAll('.note')).map((x) => x.textContent).filter((t) => /Añadido|No se pudo/.test(t)).join(' | ')), '· lista:', await p.evaluate(() => Array.from(document.querySelectorAll('.opt')).filter((x) => /Prueba/.test(x.textContent)).map((x) => x.textContent).join()));
  await typeUrl('https://torrentio.strem.fun/manifest.json');
  console.log('addon de fuentes (debrid):', await p.evaluate(() => Array.from(document.querySelectorAll('.opt')).filter((x) => /Torrentio/.test(x.textContent)).map((x) => x.textContent).join() || Array.from(document.querySelectorAll('.note')).map((x) => x.textContent).filter((t) => /No se pudo/.test(t)).join()));
  await typeUrl('https://94c8cb9f702d-tmdb-addon.baby-beamup.club/manifest.json');
  console.log('TMDB real:', await p.evaluate(() => Array.from(document.querySelectorAll('.note')).map((x) => x.textContent).filter((t) => /Añadido|No se pudo/.test(t)).join()));
  // Inicio: filas de catálogos
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(5000);
  console.log('filas de addons:', (await text('.row-title')).split(' | ').filter((t) => /\(/.test(t)).join(' | '));
  // ficha propia del addon
  await p.evaluate(() => { const c = Array.from(document.querySelectorAll('.card')).filter((x) => x.querySelector('.name').textContent === 'Solo en Prueba')[0]; StremTV.Nav.focus(c); }); await key('Enter'); await sleep(1500);
  console.log('ficha del addon:', await text('.detail h1'), '·', await text('.desc'));
  await key('Escape'); await sleep(500);
  // con imdb_id → Cinemeta, y fuentes mezcladas
  await p.evaluate(() => { const c = Array.from(document.querySelectorAll('.card')).filter((x) => /Prueba\)/.test(x.textContent))[0]; StremTV.Nav.focus(c); }); await key('Enter'); await sleep(2500);
  console.log('ficha por imdb:', await text('.detail h1'));
  await key('Enter'); await sleep(2500);
  console.log('fuentes:', await text('.screen-sub'), '·', await text('.stream .t1'));
  await key('Enter'); await sleep(3000); await key('ArrowUp'); await sleep(600);
  console.log('subtítulos:', await text('.mi'));
  await key('Escape'); await key('Escape'); await key('Escape'); await key('Escape'); await sleep(800);
  // búsqueda
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === 'Buscar')[0])); await key('Enter'); await sleep(500);
  await p.evaluate(() => { const i = document.querySelector('input'); i.focus(); i.value = 'algo'; }); await key('Enter'); await sleep(3000);
  console.log('búsqueda:', (await text('.row-title')).split(' | ').filter((t) => /\(/.test(t)).join(' | '), '·', (await text('.card .name')).split(' | ').filter((t) => /Prueba/.test(t)).join());
  // quitar
  await key('Escape'); await sleep(300);
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === 'Ajustes')[0])); await key('Enter'); await sleep(800);
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.opt')).filter((x) => /^Prueba/.test(x.textContent))[0])); await key('Enter'); await sleep(300);
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.mi')).filter((x) => /Quitar/.test(x.textContent))[0])); await key('Enter'); await sleep(500);
  console.log('tras quitar:', await p.evaluate(() => JSON.parse(localStorage.getItem('stv.addons')).map((a) => a.manifest.name).join()), '· foco:', await p.evaluate(() => StremTV.Nav.cur.tagName));
  await p.screenshot({ path: __dirname + '/shots/95-addons.png' });
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
