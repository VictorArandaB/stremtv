// Smart Hub Preview: la app manda al servicio de fondo las casillas de «Continuar viendo» y abre la ficha
// de la casilla elegida (PAYLOAD), al arrancar y con la app ya abierta.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (c, t) => console.log((c ? '✓ ' : '✗ ') + t);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*' };
  p.on('request', (req) => {
    const u = req.url();
    const m = /\/meta\/(movie|series)\/(tt\d+)\.json/.exec(u);
    if (m) return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ meta: { id: m[2], type: m[1], name: 'Titulo ' + m[2], videos: [] } }) });
    if (/^http:\/\/127\.0\.0\.1/.test(u)) return req.continue();
    req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{}' });
  });
  // una tele de mentira: solo lo que usa el Preview
  await p.evaluateOnNewDocument(() => {
    window.__sent = []; window.__payload = sessionStorage.getItem('payload') || '';
    window.tizen = {
      ApplicationControl: function (op, uri, mime, cat, data) { this.operation = op; this.data = data; },
      ApplicationControlData: function (key, value) { this.key = key; this.value = value; },
      application: {
        getCurrentApplication: () => ({ appInfo: { packageId: 'StrmTV2026' },
          getRequestedAppControl: () => ({ appControl: { data: window.__payload ? [{ key: 'PAYLOAD', value: [window.__payload] }] : [] } }) }),
        launchAppControl: (ac, id, done, fail) => { if (window.__noService) return setTimeout(() => fail({ name: 'NotFoundError' }), 0); window.__sent.push({ id, op: ac.operation, data: ac.data }); setTimeout(done, 0); }
      }
    };
  });
  const URL = 'http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/';
  await p.goto(URL, { waitUntil: 'networkidle2' });
  await p.evaluate(() => {
    localStorage.clear(); sessionStorage.clear();
    const now = Date.now();
    localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', hideWatched: false }));
    localStorage.setItem('stv.progress', JSON.stringify({
      'tt0000001:1:3': { videoId: 'tt0000001:1:3', metaId: 'tt0000001', type: 'series', name: 'Serie Uno', poster: 'https://x.test/p1.jpg', label: 'Serie Uno · T1:E3', t: 600, d: 2400, ts: now },
      'tt0000002': { videoId: 'tt0000002', metaId: 'tt0000002', type: 'movie', name: 'Peli Dos', poster: 'https://x.test/p2.jpg', label: 'Peli Dos', t: 1800, d: 7200, ts: now - 1000 },
      'kitsu:7:2': { videoId: 'kitsu:7:2', metaId: 'kitsu:7', type: 'series', name: 'Anime', poster: 'https://x.test/k7.jpg', label: 'Anime · E2', t: 300, d: 1400, ts: now - 2000 },
      'tt0000009': { videoId: 'tt0000009', metaId: 'tt0000009', type: 'movie', name: 'Vista', poster: 'https://x.test/p9.jpg', t: 0, d: 0, done: true, ts: now - 3000 } }));
  });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);

  // 1) envío al servicio
  await p.evaluate(() => StremTV.Preview.refresh()); await sleep(300);
  let sent = await p.evaluate(() => window.__sent);
  const d = sent[0] && JSON.parse(sent[0].data[0].value[0]);
  const tiles = d ? d.sections[0].tiles : [];
  console.log(JSON.stringify(d));
  ok(sent.length === 1 && sent[0].id === 'StrmTV2026.preview' && sent[0].data[0].key === 'preview', 'un envío al servicio StrmTV2026.preview');
  ok(d && d.sections.length === 1 && d.sections[0].title === 'Continuar viendo' && tiles.length === 3, 'una sección «Continuar viendo» con lo empezado (sin lo visto)');
  ok(tiles[0].title === 'Serie Uno' && tiles[0].subtitle === 'T1:E3' && tiles[0].image_ratio === '16by9' && /background\/small\/tt0000001\/img$/.test(tiles[0].image_url), 'serie: episodio y fondo apaisado');
  ok(tiles[1].subtitle === '25 %' && tiles[1].is_playable === true, 'película: porcentaje visto');
  ok(tiles[2].image_ratio === '2by3' && tiles[2].image_url === 'https://x.test/k7.jpg', 'sin id de IMDb: la carátula');
  ok(new Set(tiles.map((t) => t.action_data)).size === 3 && JSON.parse(tiles[1].action_data).id === 'tt0000002', 'action_data distinto en cada casilla');
  await p.evaluate(() => { StremTV.Preview.send(); StremTV.Preview.refresh(); }); await sleep(300);
  ok((await p.evaluate(() => window.__sent.length)) === 1, 'sin cambios no se vuelve a enviar');

  // 2) casilla elegida con la app abierta
  const top = () => p.evaluate(() => { const s = StremTV.stack; return s.length + ' ' + (s[s.length - 1].el.textContent || '').slice(0, 300); });
  const before = await p.evaluate(() => StremTV.stack.length);
  await p.evaluate(() => { window.__payload = JSON.stringify({ values: JSON.stringify({ type: 'movie', id: 'tt0000002' }) }); window.dispatchEvent(new Event('appcontrol')); });
  await sleep(1200);
  let t = await top();
  ok(+t.split(' ')[0] === before + 1 && /Titulo tt0000002/.test(t), 'con la app abierta: abre la ficha de la casilla');
  await p.evaluate(() => window.dispatchEvent(new Event('appcontrol'))); await sleep(300);
  ok(+(await top()).split(' ')[0] === before + 1, 'la misma petición repetida con la ficha delante no la abre dos veces');

  // 3) arranque desde una casilla
  await p.evaluate(() => sessionStorage.setItem('payload', JSON.stringify({ values: JSON.stringify({ type: 'series', id: 'tt0000001' }) })));
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1200);
  t = await top();
  ok(+t.split(' ')[0] === 2 && /Titulo tt0000001/.test(t), 'arranque en frío: Inicio y encima la ficha');

  // 4) paquete sin el servicio: falla una vez y no insiste
  await p.evaluate(() => { sessionStorage.clear(); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  await p.evaluate(() => { window.__noService = true; StremTV.Preview.refresh(); }); await sleep(300);
  await p.evaluate(() => { window.__noService = false; StremTV.Preview.send(); }); await sleep(300);
  ok((await p.evaluate(() => window.__sent.length)) === 0 && (await p.evaluate(() => StremTV.Preview.failed)), 'sin servicio en el paquete: no insiste');
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
