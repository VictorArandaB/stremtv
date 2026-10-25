// Buscar desde el móvil: QR en Buscar con la página del móvil y el tema secreto de ntfy, mensajes de ntfy (simulado) que
// escriben en el cuadro y buscan, los de antes de abrir Buscar no cuentan, reconexión pidiendo desde el último mensaje,
// y la escucha se para al tapar Buscar con otra pantalla o al salir (y vuelve al regresar). Sale con código 1 si algo falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  // ntfy: cada conexión se contesta con la siguiente respuesta preparada; sin ninguna, se queda abierta (como la de verdad)
  const ntfy = [], replies = [], aborted = [];
  const line = (o) => JSON.stringify(Object.assign({ topic: 't' }, o)) + '\n';
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('ntfy.sh') >= 0) {
      ntfy.push(u);
      const r = replies.shift();
      if (r) req.respond({ status: 200, headers: cors, contentType: 'application/x-ndjson', body: r });
      return;
    }
    if (u.indexOf('/catalog/') >= 0 && u.indexOf('v3-cinemeta') >= 0) {
      const q = /search=([^/]+)\.json/.exec(u);
      return json(req, { metas: [{ id: 'tt0111161', type: /movie/.test(u) ? 'movie' : 'series', name: q ? 'Resultado ' + decodeURIComponent(q[1]) : 'Cinemeta', poster: '' }] });
    }
    if (u.indexOf('anime-kitsu.strem.fun/catalog/') >= 0) return json(req, { metas: [] });
    if (u.indexOf('/meta/') >= 0) return json(req, { meta: { id: 'tt0111161', type: 'movie', name: 'Cadena perpetua' } });
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [] });
    req.continue();
  });
  p.on('requestfailed', (req) => { if (req.url().indexOf('ntfy.sh') >= 0) aborted.push(req.url()); });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';
  const input = () => p.evaluate(() => document.querySelector('.search-box input') && document.querySelector('.search-box input').value);
  const found = () => p.evaluate(() => Array.from(document.querySelectorAll('.search-box ~ div .card .name, .search-top ~ div .card .name')).map((x) => x.textContent).join(', '));

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, key: 'K', debrid: 'alldebrid', hideWatched: false }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  check(ntfy.length === 0, 'en Inicio no se escucha ntfy', ntfy.length);

  // la primera conexión: la línea «open» con la hora del servidor y un mensaje de antes de abrir Buscar
  replies.push(line({ id: 'open1', time: 1000, event: 'open' }) + line({ id: 'old1', time: 990, event: 'message', message: 'Vieja' }));
  // la segunda (tras cerrarse la primera): repite el viejo y trae uno nuevo
  replies.push(line({ id: 'open2', time: 1004, event: 'open' }) + line({ id: 'old1', time: 990, event: 'message', message: 'Vieja' }) +
    line({ id: 'm1', time: 1005, event: 'message', message: '  Dune   parte dos ' }) + line({ id: 'k1', time: 1006, event: 'keepalive' }));
  await p.evaluate((top) => { const t = Array.from(eval(top).querySelectorAll('.tab')).filter((x) => x.textContent === 'Buscar')[0]; StremTV.Nav.focus(t); }, top);
  await key('Enter'); await sleep(800);

  // --- QR
  const topic = await p.evaluate(() => JSON.parse(localStorage.getItem('stv.phonetopic') || '""'));
  check(/^[a-z0-9]{24}$/.test(topic), 'tema secreto de 24 caracteres guardado en la tele', topic);
  const qr = await p.evaluate(() => {
    const c = document.querySelector('.phone-qr canvas'), t = document.querySelector('.phone-qr-text');
    if (!c) return null;
    const ctx = c.getContext('2d'), n = c.width, px = (x, y) => ctx.getImageData(x, y, 1, 1).data[0];
    // los tres cuadros de las esquinas: el primer punto negro de la diagonal, tras el margen blanco, y los mismos en las otras dos
    let k = 0;
    while (k < n / 4 && px(k, k) === 255) k++;
    return { w: n, shown: c.offsetWidth, text: t && t.textContent, margin: k, finders: [px(k, k), px(n - 1 - k, k), px(k, n - 1 - k)].join(',') };
  });
  check(qr && qr.w >= 280 && qr.w <= 330 && qr.shown >= 280, 'QR de unos 300 px en Buscar', qr && qr.w);
  check(qr && qr.text === 'Escanea con el móvil para escribir desde él', 'texto bajo el QR', qr && qr.text);
  check(qr && qr.margin >= 8 && qr.finders === '0,0,0', 'QR con margen blanco y los tres cuadros de las esquinas', qr && qr.margin + ' · ' + qr.finders);
  // si este Chrome sabe leer QR (BarcodeDetector), que diga la URL de la página con el tema detrás del #
  const decoded = await p.evaluate(async () => {
    if (!window.BarcodeDetector) return null;
    try { const r = await new BarcodeDetector({ formats: ['qr_code'] }).detect(document.querySelector('.phone-qr canvas')); return r[0] ? r[0].rawValue : ''; } catch (e) { return null; }
  });
  if (decoded === null) console.log('(este Chrome no lee QR: no se comprueba su contenido)');
  else check(decoded === 'https://victorarandab.github.io/stremtv/buscar.html#' + topic, 'el QR lleva a la página del móvil con el tema', decoded);
  await p.screenshot({ path: OUT + '/phone-qr.png' });

  // --- mensajes
  check(ntfy[0] === 'https://ntfy.sh/' + topic + '/json', 'al abrir Buscar se escucha el tema (sin «since»: solo lo nuevo)', ntfy[0]);
  check((await input()) === '' && !/Vieja/.test(await found()), 'el mensaje de antes de abrir Buscar no cuenta', await input());
  await sleep(2600);
  check(ntfy[1] === 'https://ntfy.sh/' + topic + '/json?since=old1', 'al cerrarse, se vuelve a conectar desde el último mensaje', ntfy[1]);
  await sleep(1200);
  check((await input()) === 'Dune parte dos', 'el mensaje nuevo se escribe en el cuadro', await input());
  const res = await found();
  check(/Resultado Dune parte dos/.test(res) && !/Vieja/.test(res), 'y se busca', res);
  check(await p.evaluate(() => JSON.parse(localStorage.getItem('stv.searches') || '[]')[0] === 'Dune parte dos'), 'queda en Búsquedas recientes');
  check(await p.evaluate(() => StremTV.Nav.cur === document.querySelector('.search-box input')), 'el foco va al cuadro');
  await sleep(2500);
  check(ntfy.length === 3 && ntfy[2] === 'https://ntfy.sh/' + topic + '/json?since=m1', 'tercera conexión desde el último mensaje, y se queda abierta', ntfy.slice(2).join(' '));
  await p.screenshot({ path: OUT + '/phone-search.png' });

  // --- tapar Buscar con una ficha: se corta la conexión y no se vuelve a abrir
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(1000);
  const n1 = ntfy.length;
  check(aborted.length === 1, 'al abrir una ficha encima se corta la conexión con ntfy', aborted.length);
  await sleep(4000);
  check(ntfy.length === n1, 'y no se vuelve a conectar mientras no se ve Buscar', ntfy.length - n1);
  // al volver, otra vez (solo lo nuevo)
  await key('Escape'); await sleep(1000);
  check(ntfy.length === n1 + 1 && ntfy[n1] === 'https://ntfy.sh/' + topic + '/json', 'al volver a Buscar se escucha de nuevo', ntfy.slice(n1).join(' '));
  // a otra pestaña (Buscar se cierra)
  await p.evaluate((top) => { const t = Array.from(eval(top).querySelectorAll('.tab')).filter((x) => x.textContent === 'Películas')[0]; StremTV.Nav.focus(t); }, top);
  await key('Enter'); await sleep(1000);
  check(aborted.length === 2, 'al cambiar de pestaña se corta', aborted.length);
  const n2 = ntfy.length;
  await sleep(4000);
  check(ntfy.length === n2, 'y no se vuelve a conectar', ntfy.length - n2);

  // --- el tema se mantiene entre arranques
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(1500);
  check(await p.evaluate(() => JSON.parse(localStorage.getItem('stv.phonetopic'))) === topic, 'el tema no cambia al volver a abrir la app');

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
