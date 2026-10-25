// Calendario completo: la casilla final de «Esta semana en tus series» (y el botón de Series) abre la pantalla, con una fila
// por día (Ayer, Hoy, Mañana…), los episodios con la numeración de Cinemeta (epMap) y la hora de la tele, las películas de tu
// lista que se estrenan (cines, DVD, digital; sin repetir), ✓ en lo visto, el foco en hoy y OK abre la ficha.
// Sin Trakt, el aviso para vincularlo. Sale con código 1 si alguna comprobación falla.
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
  // fechas en la hora de la tele (la misma que la de este Mac): «off» días desde hoy a las «h»
  const at = (off, h) => { const d = new Date(); d.setDate(d.getDate() + off); d.setHours(h, 0, 0, 0); return d; };
  const iso = (off, h) => at(off, h).toISOString();
  const ymd = (off) => { const d = at(off, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  // como en epmap.js: Cinemeta T1 y T2 de 2 episodios, Trakt una T1 de 4 con las mismas fechas (su 1x4 es la T2:E2 de Cinemeta)
  const day = (d) => '2024-0' + d + '-10T14:30:00.000Z';
  const videos = [[1, 1, 1], [1, 2, 2], [2, 1, 3], [2, 2, 4]].map((x) => ({ id: 'tt9000001:' + x[0] + ':' + x[1], season: x[0], episode: x[1], name: 'Ep ' + x[0] + 'x' + x[1], released: day(x[2]) }));
  const shows = [
    { first_aired: iso(-1, 22), episode: { season: 1, number: 5 }, show: { title: 'Serie vista', ids: { imdb: 'tt9000002', trakt: 2 } } },
    { first_aired: iso(-1, 23), episode: { season: 1, number: 6 }, show: { title: 'Serie pendiente', ids: { imdb: 'tt9000005', trakt: 5 } } },
    { first_aired: iso(0, 21), episode: { season: 1, number: 4 }, show: { title: 'Serie de prueba', ids: { imdb: 'tt9000001', trakt: 1 } } },
    { first_aired: iso(5, 20), episode: { season: 3, number: 1 }, show: { title: 'Vuelve', ids: { imdb: 'tt9000003', trakt: 3 } } },
    { first_aired: iso(10, 18), episode: { season: 1, number: 1 }, show: { title: 'Nueva', ids: { imdb: 'tt9000004', trakt: 4 } } },
    { first_aired: iso(10, 19), episode: { season: 1, number: 2 }, show: { title: 'Sin IMDb', ids: { trakt: 9 } } }
  ];
  const calls = [];
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('/meta/series/tt9000001.json') >= 0) return json(req, { meta: { id: 'tt9000001', type: 'series', name: 'Serie de prueba', videos: videos } });
    if (u.indexOf('/meta/') >= 0) return json(req, {}, 404);
    // fuera del puerto 8090 el cargador baja la versión de GitHub para el siguiente arranque: aquí se prueba la de esta copia
    if (u.indexOf('api.github.com') >= 0) return req.respond({ status: 404, headers: hdr, body: '' });
    if (u.indexOf('images.metahub.space') >= 0 || u.indexOf('wsrv.nl') >= 0) return req.respond({ status: 404, headers: hdr, body: '' });
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/calendars/') >= 0) calls.push(u.replace(/^.*\/calendars\//, ''));
      if (u.indexOf('/calendars/my/shows/') >= 0) return json(req, shows);
      if (u.indexOf('/calendars/my/movies/') >= 0) return json(req, [{ released: ymd(3), movie: { title: 'Peli en cines', ids: { imdb: 'tt9100001' } } }]);
      if (u.indexOf('/calendars/my/dvd/') >= 0) return json(req, [{ released: ymd(7), movie: { title: 'Peli en DVD', ids: { imdb: 'tt9100002' } } }]);
      // la misma en digital el mismo día (no se repite) y otra en digital más adelante
      if (u.indexOf('/calendars/my/streaming/') >= 0) return json(req, [{ released: ymd(7), movie: { title: 'Peli en DVD', ids: { imdb: 'tt9100002' } } },
        { released: ymd(12), movie: { title: 'Peli digital', ids: { imdb: 'tt9100003' } } }]);
      if (u.indexOf('/shows/tt9000001/seasons') >= 0) return json(req, [{ number: 1, episodes: [1, 2, 3, 4].map((n) => ({ number: n, first_aired: day(n) })) }]);
      if (u.indexOf('/sync/watched/shows') >= 0) return json(req, [{ show: { title: 'Serie vista', ids: { imdb: 'tt9000002', trakt: 2 }, aired_episodes: 10 }, last_watched_at: iso(-1, 23),
        seasons: [{ number: 1, episodes: [1, 2, 3, 4, 5].map((n) => ({ number: n })) }] }]);
      return json(req, []);
    }
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [] });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.settings', JSON.stringify({ quickPlay: false, hideWatched: false, key: 'K', debrid: 'alldebrid' }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);

  // Inicio: la casilla final de «Esta semana en tus series»
  const tile = await p.evaluate(() => { const r = Array.from(document.querySelectorAll('.row')).filter((x) => /Esta semana/.test(x.querySelector('.row-title').textContent))[0];
    if (!r) return 'sin fila'; const cs = r.querySelectorAll('.card'); const last = cs[cs.length - 1];
    if (last.classList.contains('more')) StremTV.Nav.focus(last); return last.className + ' · ' + last.textContent; });
  check(/more/.test(tile) && /Calendario completo ›/.test(tile), 'al final de «Esta semana en tus series», «Calendario completo ›»', tile);
  await p.screenshot({ path: __dirname + '/shots/94-calendar-home.png' });
  const week = await p.evaluate(() => Array.from(StremTV.Nav.cur.parentNode.querySelectorAll('.name')).map((x) => x.textContent).join(' | '));
  check(/Hoy · Serie de prueba T2:E2/.test(week), 'en Inicio, también con la numeración de Cinemeta', week);
  await key('Enter'); await sleep(2500);
  check(await p.evaluate((top) => eval(top).classList.contains('cal'), top), 'la casilla abre el calendario');
  await p.screenshot({ path: __dirname + '/shots/95-calendar.png' });

  const rows = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.cal-day')).map((r) => ({
    title: r.querySelector('.row-title').textContent, past: r.classList.contains('past'),
    cards: Array.from(r.querySelectorAll('.card')).map((c) => c.querySelector('.name').textContent + (c.querySelector('.mark') ? ' ✓' : '') + (c.querySelector('.new') ? ' [' + c.querySelector('.new').textContent + ']' : '')) })), top);
  console.log(rows.map((r) => r.title + (r.past ? ' (pasado)' : '') + ': ' + r.cards.join(' | ')).join('\n'));
  const titles = rows.map((r) => r.title.split(' · ')[0]);
  check(titles.length === 7 && titles[0] === 'Ayer' && titles[1] === 'Hoy' && !/·/.test(rows[2].title), 'una fila por día: Ayer, Hoy y los siguientes con su fecha', titles.join(', '));
  check(rows[0].past && !rows[1].past, 'ayer, atenuado; hoy no');
  const hh = (d) => d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  check(rows[1].cards[0] === 'Serie de prueba · T2:E2 · ' + hh(at(0, 21)), 'el episodio con la numeración de Cinemeta (Trakt 1x4) y la hora de la tele', rows[1].cards[0]);
  check(rows[0].cards[0] === 'Serie vista · T1:E5 · ' + hh(at(-1, 22)) + ' ✓' && rows[0].cards[1].indexOf('✓') < 0, '✓ en el visto en Trakt, no en el pendiente', rows[0].cards.join(' | '));
  const all = rows.map((r) => r.cards.join(' | ')).join(' | ');
  check(/Peli en cines · En cines/.test(all) && /Peli digital · En digital/.test(all), 'películas de tu lista en cines y en digital', all);
  check((all.match(/Peli en DVD/g) || []).length === 1, 'la misma película el mismo día, una vez');
  check(/Vuelve · T3:E1 · [^|]*\[Estreno\]/.test(all) && /Nueva · T1:E1 · [^|]*\[Serie nueva\]/.test(all), 'estreno de temporada y serie nueva marcados');
  check(!/Sin IMDb/.test(all), 'sin IMDb no sale (no se puede abrir)');
  check(calls.some((c) => /^my\/shows\/\d{4}-\d\d-\d\d\/33$/.test(c)) && calls.some((c) => /^my\/movies\//.test(c)) && calls.some((c) => /^my\/dvd\//.test(c)),
    'pide a Trakt series y películas de 33 días', calls.join(' '));
  check(calls.some((c) => c.indexOf('my/shows/' + ymd(-3) + '/33') === 0), 'desde hace 3 días', ymd(-3));

  // foco en hoy; OK abre la ficha
  const cur = await p.evaluate(() => StremTV.Nav.cur && StremTV.Nav.cur.querySelector('.name').textContent);
  check(/^Serie de prueba/.test(cur || ''), 'el foco empieza en hoy', cur);
  const depth = await p.evaluate(() => StremTV.stack.length);
  await key('Enter'); await sleep(2500);
  const det = await p.evaluate((top) => ({ n: StremTV.stack.length, play: (eval(top).querySelector('.btn.primary') || {}).textContent || '' }), top);
  check(det.n === depth + 1 && /Ver/.test(det.play), 'OK sobre una tarjeta abre su ficha', JSON.stringify(det));
  await key('Escape'); await sleep(800);
  check(await p.evaluate((top) => eval(top).classList.contains('cal'), top), 'Atrás vuelve al calendario');
  // ▼ al día siguiente
  await key('ArrowDown');
  check(/^Vuelve|^Peli en cines/.test(await p.evaluate(() => StremTV.Nav.cur.querySelector('.name').textContent)), '▼ pasa al siguiente día');

  // Series: botón al calendario
  await key('Escape'); await sleep(500);
  await p.evaluate(() => { const t = Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === 'Series')[0]; StremTV.Nav.focus(t); });
  await key('Enter'); await sleep(1500);
  const btn = await p.evaluate((top) => { const x = Array.from(eval(top).querySelectorAll('.surprise .btn')).filter((b) => /Calendario/.test(b.textContent))[0]; if (x) StremTV.Nav.focus(x); return x ? x.textContent : ''; }, top);
  await p.screenshot({ path: __dirname + '/shots/96-calendar-series.png' });
  check(btn === 'Calendario de tus series ›', 'en Series, el botón del calendario', btn);
  await key('Enter'); await sleep(2000);
  check(await p.evaluate((top) => eval(top).classList.contains('cal') && eval(top).querySelectorAll('.cal-day').length === 7, top), 'el botón de Series abre el calendario');

  // sin Trakt: el aviso para vincularlo
  await p.evaluate(() => { localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c' })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  await p.evaluate(() => { const t = Array.from(document.querySelectorAll('.tab')).filter((x) => x.textContent === 'Series')[0]; StremTV.Nav.focus(t); });
  await key('Enter'); await sleep(1000);
  await p.evaluate((top) => StremTV.Nav.focus(Array.from(eval(top).querySelectorAll('.surprise .btn')).filter((b) => /Calendario/.test(b.textContent))[0]), top);
  await key('Enter'); await sleep(800);
  const msg = await p.evaluate((top) => eval(top).textContent, top);
  check(/vincúlalo en Ajustes/.test(msg) && /Vincular con Trakt/.test(msg), 'sin Trakt, el aviso para vincularlo', msg.slice(0, 160));
  check(await p.evaluate(() => /Vincular con Trakt/.test(StremTV.Nav.cur && StremTV.Nav.cur.textContent)), 'con el foco en «Vincular con Trakt»');

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
