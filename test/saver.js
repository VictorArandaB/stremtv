// Protector de pantalla por inactividad: se activa sin tocar el mando, rota fondos con logo y sinopsis de lo elegido
// en Ajustes → Protector de pantalla, OK abre la ficha del título y cualquier otra tecla vuelve sin moverse.
// Uso: node saver.js [url]  -> capturas 120-… en ./shots
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL = process.argv[2] || 'http://127.0.0.1:8090/';
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'OK  ' : 'MAL ') + what); if (!ok) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(300); } };
  const ev = (fn, ...a) => p.evaluate(fn, ...a);
  const waitCard = async () => { const t0 = Date.now(); while (!(await ev(() => !!document.querySelector('#saver .sv-card'))) && Date.now() - t0 < 15000) await sleep(200); };
  await p.goto(URL, { waitUntil: 'networkidle2' });
  await ev(() => {
    localStorage.clear();
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }]));
    localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', idleSaver: 5, saverShow: 'pending', saverEvery: 10 }));
    // pendientes: una película a medias y dos títulos en Mi lista
    localStorage.setItem('stv.progress', JSON.stringify({ tt0133093: { videoId: 'tt0133093', metaId: 'tt0133093', type: 'movie', name: 'The Matrix', t: 1200, d: 8000, ts: Date.now() } }));
    localStorage.setItem('stv.mylist', JSON.stringify({ tt0903747: { id: 'tt0903747', type: 'series', name: 'Breaking Bad', ts: 2 }, tt0816692: { id: 'tt0816692', type: 'movie', name: 'Interstellar', ts: 1 } }));
  });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(2500);

  // Ajustes: sección propia con su resumen y opciones
  await ev(() => StremTV.openSettings('')); await sleep(600);
  const sum = await ev(() => Array.from(document.querySelectorAll('.opt')).map((o) => o.textContent).filter((t) => /Protector/.test(t))[0] || '');
  check(/A los 5 min · Pendientes de ver/.test(sum), 'resumen en el menú de Ajustes: ' + sum);
  await ev(() => StremTV.openSettings('saver')); await sleep(600);
  const opts = await ev(() => Array.from(StremTV.stack[StremTV.stack.length - 1].el.querySelectorAll('.opt')).map((o) => o.textContent).join(' | '));
  check(/Sin tocar el mando/.test(opts) && /Mostrar/.test(opts) && /Con el vídeo en pausa/.test(opts), 'opciones: ' + opts);
  await ev(() => StremTV.openSettings('playback')); await sleep(600);
  check(await ev(() => !/pausa/.test(StremTV.stack[StremTV.stack.length - 1].el.textContent)), 'la opción de pausa ya no está en Reproducción');
  await key('Escape'); await key('Escape'); await sleep(300);
  await ev(() => StremTV.openSettings('saver')); await sleep(600);
  await p.screenshot({ path: OUT + '/120-saver-settings.png' });
  // «Mostrar» rota entre las cuatro opciones
  const shows = [];
  for (let i = 0; i < 4; i++) {
    await ev(() => { const o = Array.from(StremTV.stack[StremTV.stack.length - 1].el.querySelectorAll('.opt')).filter((x) => /^Mostrar/.test(x.textContent))[0]; StremTV.Nav.focus(o); });
    await key('Enter'); shows.push(await ev(() => JSON.parse(localStorage.getItem('stv.settings')).saverShow));
  }
  check(shows.join(',') === 'list,new,mix,pending', 'Mostrar cambia y se guarda: ' + shows.join(','));
  await key('Escape'); await key('Escape'); await sleep(500);

  // sin tocar el mando 5 min: se activa en modo inactividad con lo pendiente
  check(await ev(() => { StremTV.Saver.check(); return !StremTV.Saver.on; }), 'no salta antes de tiempo');
  await ev(() => { StremTV.Saver.lastKey = Date.now() - 6 * 60000; StremTV.Saver.check(); });
  check(await ev(() => StremTV.Saver.on && StremTV.Saver.mode === 'idle'), 'se activa tras 5 min sin tocar el mando');
  await waitCard(); await sleep(2500);
  const card = await ev(() => ({ tag: document.querySelector('#saver .sv-tag').textContent, name: (document.querySelector('#saver .sv-name img') || document.querySelector('#saver .sv-name b')).outerHTML.slice(0, 80),
    desc: document.querySelector('#saver .sv-desc').textContent.length, pool: StremTV.Saver.pool.map((x) => x.meta.name), clock: document.querySelector('#saver .sv-corner-clock').textContent }));
  check(card.pool[0] === 'The Matrix' && card.pool.indexOf('Breaking Bad') > 0 && card.pool.indexOf('Interstellar') > 0, 'pendientes: a medias primero y después la lista: ' + card.pool.join(', '));
  check(/Continuar viendo/.test(card.tag) && card.desc > 20 && /^\d{1,2}:\d\d$/.test(card.clock), 'ficha con etiqueta, sinopsis y reloj: ' + JSON.stringify(card));
  await p.screenshot({ path: OUT + '/121-saver-idle.png' });
  // pasa al siguiente y cambia de lado
  await ev(() => StremTV.Saver.next()); await sleep(3000);
  const second = await ev(() => ({ side: document.querySelector('#saver .sv-card').className, tag: document.querySelector('#saver .sv-tag').textContent }));
  check(/right/.test(second.side) && /En tu lista/.test(second.tag), 'el siguiente sale al otro lado: ' + JSON.stringify(second));
  await p.screenshot({ path: OUT + '/122-saver-idle-2.png' });
  // una flecha lo quita sin mover el foco
  const before = await ev(() => StremTV.Nav.cur && StremTV.Nav.cur.textContent);
  await key('ArrowDown');
  check(await ev((t) => !StremTV.Saver.on && document.getElementById('saver').className === 'hidden' && StremTV.Nav.cur.textContent === t, before), 'una tecla lo quita sin moverse');
  // OK abre la ficha del título que se ve
  await ev(() => { StremTV.Saver.lastKey = 0; StremTV.Saver.check(); }); await waitCard(); await sleep(2000);
  const shown = await ev(() => StremTV.Saver.shown.meta.name);
  await key('Enter'); await sleep(3500);
  check(await ev(() => !StremTV.Saver.on && !!StremTV.stack[StremTV.stack.length - 1].el.querySelector('.detail')), 'OK abre la ficha de ' + shown);
  await key('Escape'); await sleep(500);

  // «Mi lista» vacía: cae a novedades en vez de quedarse en negro
  await ev(() => { localStorage.setItem('stv.mylist', '{}'); StremTV.settings.saverShow = 'list'; });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(2000);
  await ev(() => { StremTV.settings.saverShow = 'list'; StremTV.Saver.start('idle'); }); await waitCard(); await sleep(1500);
  const fallback = await ev(() => ({ n: StremTV.Saver.pool.length, tag: document.querySelector('#saver .sv-tag').textContent }));
  check(fallback.n > 5 && /Estreno|Series populares/.test(fallback.tag), 'lista vacía: novedades (' + JSON.stringify(fallback) + ')');
  await p.screenshot({ path: OUT + '/123-saver-new.png' });
  await key('ArrowLeft');
  // desactivado: no salta
  await ev(() => { StremTV.settings.idleSaver = 0; StremTV.Saver.lastKey = 0; StremTV.Saver.check(); });
  check(await ev(() => !StremTV.Saver.on), 'con «No» no se activa');
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
