// «Sin spoilers» (Ajustes → General): desactivado, la ficha enseña sinopsis e imagen de todos los episodios; activado, las
// de los episodios sin ver se ocultan (los vistos en la tele o en Trakt, no) y el INFO del vídeo da la sinopsis de la serie.
// El ajuste se guarda. Sale con código 1 si alguna comprobación falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o, status) => req.respond({ status: status || 200, headers: hdr, contentType: 'application/json', body: JSON.stringify(o) });
  const day = (d) => '2024-0' + d + '-10T14:30:00.000Z';
  // T1 de 3 episodios con sinopsis e imagen: el 1 visto en la tele, el 2 visto en Trakt, el 3 sin ver
  const videos = [1, 2, 3].map((n) => ({ id: 'tt9100001:1:' + n, season: 1, episode: n, name: 'Capítulo ' + n, released: day(n),
    overview: 'Sinopsis del ' + n, thumbnail: 'https://img.test/ep' + n + '.jpg' }));
  const imgs = [];
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('img.test') >= 0) { imgs.push(u); return req.respond({ status: 404, headers: hdr, body: '' }); }
    if (u.indexOf('/meta/series/tt9100001.json') >= 0) return json(req, { meta: { id: 'tt9100001', type: 'series', name: 'Serie sin spoilers', description: 'Sinopsis de la serie', videos: videos } });
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/shows/tt9100001/seasons') >= 0) return json(req, [{ number: 1, episodes: [1, 2, 3].map((n) => ({ number: n, first_aired: day(n) })) }]);
      if (/\/shows\/tt9100001\/progress\/watched/.test(u)) return json(req, { aired: 3, completed: 1, seasons: [{ number: 1, episodes: [1, 2, 3].map((n) => ({ number: n, completed: n === 2 })) }], next_episode: { season: 1, number: 3, first_aired: day(3) } });
      return json(req, []);
    }
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [] });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';
  // por episodio: «n:sinopsis:imagen» (imagen = url, «oculta» o «—»)
  const eps = () => p.evaluate((top) => Array.from(eval(top).querySelectorAll('.ep')).map((e) => {
    const ov = e.querySelector('.ep-ov'), th = e.querySelector('.thumb');
    return e.querySelector('.ep-title').textContent.slice(0, 1) + ':' + (ov ? ov.textContent : '—') + ':' +
      (th.classList.contains('nospoil') ? 'oculta' : /ep\d/.test(th.style.backgroundImage) ? 'imagen' : '—');
  }).join(' | '), top);
  const reset = async (s) => {
    await p.evaluate((s) => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify(s));
      localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 }));
      localStorage.setItem('stv.progress', JSON.stringify({ 'tt9100001:1:1': { metaId: 'tt9100001', type: 'series', name: 'Serie sin spoilers', t: 1400, d: 1440, done: true, ts: Date.parse('2024-05-01T10:00:00Z') } }));
      localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); }, s);
    await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  };
  // INFO del vídeo con el contexto del episodio abierto (la lista de fuentes lo guarda en .ctx)
  const infoDesc = async (n) => {
    await p.evaluate((top, n) => StremTV.Nav.focus(eval(top).querySelectorAll('.ep')[n]), top, n); await key('Enter'); await sleep(800);
    const d = await p.evaluate(() => { const c = StremTV.stack[StremTV.stack.length - 1].ctx; if (!c) return 'sin ctx';
      StremTV.Player.ctx = c; StremTV.Player.toggleInfo(); const t = document.querySelector('#infopanel .ip-desc').textContent; StremTV.Player.closeInfo(); StremTV.Player.ctx = null; return t; });
    await key('Escape'); await sleep(500);
    return d;
  };
  const base = { quickPlay: false, hideWatched: false, key: 'K', debrid: 'alldebrid' };

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });

  // 1. desactivado (por defecto): todo a la vista
  await reset(base);
  check(await p.evaluate(() => StremTV.settings.noSpoilers) === false, 'desactivado por defecto');
  await p.evaluate(() => StremTV.open('series', 'tt9100001')); await sleep(3000);
  const off = await eps();
  check(off === '1:Sinopsis del 1:imagen | 2:Sinopsis del 2:imagen | 3:Sinopsis del 3:imagen', 'sin el ajuste, sinopsis e imagen de todos', off);
  const offInfo = await infoDesc(2);
  check(offInfo === 'Sinopsis del 3', 'sin el ajuste, el INFO da la sinopsis del episodio', offInfo);
  await key('Escape'); await sleep(400);

  // 2. activado: el sin ver, sin sinopsis ni imagen; los vistos (en la tele y en Trakt), como siempre
  await reset(Object.assign({ noSpoilers: true }, base));
  imgs.length = 0;
  await p.evaluate(() => StremTV.open('series', 'tt9100001')); await sleep(3000);
  const on = await eps();
  check(on === '1:Sinopsis del 1:imagen | 2:Sinopsis del 2:imagen | 3:Sinopsis oculta (sin spoilers):oculta', 'con el ajuste, solo se oculta el sin ver', on);
  const title3 = await p.evaluate((top) => eval(top).querySelectorAll('.ep')[2].querySelector('.ep-title').textContent, top);
  check(title3 === '3. Capítulo 3', 'el título del sin ver se queda', title3);
  check(!imgs.some((u) => /ep3/.test(u)), 'la imagen del sin ver ni se pide', imgs.join(' '));
  const series = await p.evaluate((top) => eval(top).querySelector('.desc').textContent, top);
  check(series === 'Sinopsis de la serie', 'la sinopsis de la serie se ve', series);
  const onInfo = await infoDesc(2);
  check(onInfo === 'Sinopsis de la serie', 'con el ajuste, el INFO del sin ver da la de la serie', onInfo);
  const seenInfo = await infoDesc(0);
  check(seenInfo === 'Sinopsis del 1', 'con el ajuste, el INFO del visto da la del episodio', seenInfo);
  // marcarlo como visto (verde) lo destapa
  await p.evaluate((top) => StremTV.Nav.focus(eval(top).querySelectorAll('.ep')[2]), top);
  await p.evaluate(() => { const e = new KeyboardEvent('keydown', { bubbles: true }); Object.defineProperty(e, 'keyCode', { get: () => 404 }); document.dispatchEvent(e); });
  await sleep(800);
  const marked = await eps();
  check(/3:Sinopsis del 3:imagen$/.test(marked), 'al marcarlo como visto se ve su sinopsis', marked);
  await key('Escape'); await sleep(400);

  // 3. el interruptor de Ajustes → General cambia el valor y se guarda
  await reset(base);
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(600);
  const optText = () => p.evaluate((top) => { const o = Array.from(eval(top).querySelectorAll('.opt')).filter((x) => /Sin spoilers/.test(x.textContent))[0]; return o ? o.lastChild.textContent : 'no está'; }, top);
  check(await optText() === 'No', 'opción «Sin spoilers» en General, a No', await optText());
  await p.evaluate((top) => StremTV.Nav.focus(Array.from(eval(top).querySelectorAll('.opt')).filter((x) => /Sin spoilers/.test(x.textContent))[0]), top);
  await key('Enter'); await sleep(300);
  check(await optText() === 'Sí', 'OK la pone a Sí', await optText());
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1000);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('stv.settings')).noSpoilers === true && StremTV.settings.noSpoilers === true);
  check(saved, 'se guarda y sigue al volver a abrir la app');
  await p.evaluate(() => StremTV.open('series', 'tt9100001')); await sleep(3000);
  const after = await eps();
  check(/3:Sinopsis oculta/.test(after), 'tras reiniciar, sigue ocultando', after);

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
