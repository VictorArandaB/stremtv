// 0.20: audio (título → Ajustes → idioma de la app → inglés → primera, sin repetidos, silencio hasta aplicar), cortes con aviso
// para cambiar de fuente, recuperación de fallos a mitad, intro aprendida, teclas 0-9, salto en la burbuja,
// cola desde el móvil (cola.txt en el Gist) y «Nuevo» con barra en Siguientes episodios.
// Uso: node v20.js  (servidor en 127.0.0.1:8090)  -> capturas 200-… en ./shots
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'OK  ' : 'MAL ') + what); if (!ok) fails++; };
const ADDONS = JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }]);
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o) => req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  let cola = '', patches = [];
  const recent = new Date(Date.now() - 5 * 3600000).toISOString();
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    const m = /\/stream\/series\/tt0903747:(\d+):(\d+)\.json/.exec(u);
    if (m) {
      const ep = 'S0' + m[1] + 'E0' + m[2];
      const s = (q, g) => ({ name: '[AD+] Torrentio\n' + q, title: 'Show.' + ep + '.' + q + '.WEB-DL-' + g + '\n👤 50 💾 1.2 GB ⚙️ x', url: 'https://example.com/' + ep + '-' + q + '.mkv',
        behaviorHints: { bingeGroup: 'torrentio|' + q + '|' + g, filename: 'Show.' + ep + '.' + q + '.WEB-DL-' + g + '.mkv' } });
      return json(req, { streams: [s('4k', 'AAA'), s('1080p', 'BBB'), s('720p', 'CCC')] });
    }
    if (u.indexOf('opensubtitles-v3') >= 0 || u.indexOf('aniskip') >= 0 || u.indexOf('arm.haglund') >= 0) return json(req, u.indexOf('opensubtitles') >= 0 ? { subtitles: [] } : {});
    if (u.indexOf('api.github.com/gists/G1') >= 0) {
      if (req.method() === 'PATCH') { const body = JSON.parse(req.postData()); patches.push(body); if (body.files['cola.txt']) cola = body.files['cola.txt'].content; return json(req, { id: 'G1' }); }
      return json(req, { id: 'G1', files: cola === null ? {} : { 'cola.txt': { content: cola } } });
    }
    if (u.indexOf('api.github.com') >= 0) return json(req, []);
    if (u.indexOf('api.trakt.tv') >= 0) {
      if (u.indexOf('/sync/watched/shows') >= 0) return json(req, [
        { last_watched_at: '2026-10-15T00:00:00Z', show: { title: 'Rick and Morty', aired_episodes: 71, ids: { trakt: 3, imdb: 'tt2861424' } }, seasons: [{ number: 1, episodes: [{ number: 1 }] }] },
        { last_watched_at: '2026-10-10T00:00:00Z', show: { title: 'Game of Thrones', aired_episodes: 73, ids: { trakt: 2, imdb: 'tt0944947' } }, seasons: [{ number: 1, episodes: [{ number: 1 }] }] }]);
      const pm = /\/shows\/(\d+)\/progress\/watched/.exec(u);
      if (pm) return json(req, +pm[1] === 2 ? { aired: 10, completed: 9, next_episode: { season: 1, number: 10, first_aired: recent } } : { aired: 10, completed: 2, next_episode: { season: 1, number: 3, first_aired: '2020-01-01T00:00:00Z' } });
      return json(req, []);
    }
    req.continue();
  });
  const ev = (fn, ...a) => p.evaluate(fn, ...a);
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await ev((a) => { localStorage.clear(); localStorage.setItem('stv.addons', a);
    localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', quickPlay: false, autoNext: false, audioLang: 'eng', lastAudio: 'jp' })); }, ADDONS);
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);

  // --- audio
  check(await ev(() => !('lastAudio' in JSON.parse(localStorage.getItem('stv.settings')))), 'el «último audio» guardado se borra');
  const run = (tracks, ctx) => ev((tracks, ctx) => {
    let cur = tracks[0].index;
    window.webapis = { avplay: {
      getTotalTrackInfo: () => tracks.map((t) => ({ type: 'AUDIO', index: t.index, extra_info: JSON.stringify({ language: t.lang }) })),
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: cur }], setSelectTrack: (k, i) => { cur = i; } } };
    const P = StremTV.Player; P.ctx = ctx; P.audioChosen = false;
    P.autoAudio();
    const log = JSON.parse(localStorage.getItem('stv.log') || '[]');
    return { cur, key: P.audioKey };
  }, tracks, ctx);
  let r = await run([{ index: 1, lang: 'fr' }, { index: 2, lang: 'es' }], { type: 'movie', metaId: 'tt15239678' });
  check(r.cur === 2, 'Dune (francés y español, buscando inglés): español → ' + JSON.stringify(r));
  r = await run([{ index: 1, lang: 'jp' }, { index: 2, lang: 'en' }], { type: 'movie', metaId: 'tt0000001' });
  check(r.cur === 2, 'Ajustes en inglés (jp, en): inglés → ' + JSON.stringify(r));
  await ev(() => { localStorage.setItem('stv.srcprefs', JSON.stringify({ 'tt12590266': { audio: 'jp' } })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  r = await run([{ index: 1, lang: 'es' }, { index: 2, lang: 'jp' }, { index: 3, lang: 'en' }], { type: 'series', metaId: 'tt12590266' });
  check(r.cur === 2 && r.key === 'jpn', 'elegido a mano en la serie («jp» de AVPlay) manda sobre Ajustes → ' + JSON.stringify(r));
  await ev(() => { StremTV.settings.audioLang = 'fre'; });
  r = await run([{ index: 1, lang: 'ru' }, { index: 2, lang: 'en' }, { index: 3, lang: 'es' }], { type: 'movie', metaId: 'tt0000002' });
  check(r.cur === 3, 'Ajustes en francés sin francés: idioma de la app (español) antes que inglés → ' + JSON.stringify(r));
  r = await run([{ index: 1, lang: 'ru' }, { index: 2, lang: 'en' }], { type: 'movie', metaId: 'tt0000002' });
  check(r.cur === 2, 'ni Ajustes ni la app: inglés antes que la primera (ruso) → ' + JSON.stringify(r));
  r = await run([{ index: 1, lang: 'ru' }, { index: 2, lang: 'de' }], { type: 'movie', metaId: 'tt0000002' });
  check(r.cur === 1, 'ninguno: se queda en la primera → ' + JSON.stringify(r));
  await ev(() => { StremTV.settings.audioLang = 'eng'; });
  await sleep(1700);
  const busca = await ev(() => JSON.parse(localStorage.getItem('stv.log')).filter((e) => e.k === 'audio').map((e) => e.d.busca));
  check(busca.every((l) => l.length === new Set(l).size), 'sin idiomas repetidos en la búsqueda: ' + JSON.stringify(busca[0]));
  const manual = await ev(() => {
    let cur = 1;
    window.webapis = { avplay: { getTotalTrackInfo: () => [{ type: 'AUDIO', index: 1, extra_info: '{"language":"es"}' }, { type: 'AUDIO', index: 2, extra_info: '{"language":"ko"}' }],
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: cur }], setSelectTrack: (k, i) => { cur = i; } } };
    const P = StremTV.Player; P.backend = 'av'; P.ctx = { type: 'series', metaId: 'kitsu:11' };
    P.audioMenu();
    const mi = Array.from(document.querySelectorAll('.mi')).filter((x) => /Coreano/.test(x.textContent))[0];
    StremTV.Nav.focus(mi); mi._onclick(mi); P.backend = null;
    return { pref: JSON.parse(localStorage.getItem('stv.srcprefs'))['kitsu:11'].audio, last: 'lastAudio' in StremTV.settings };
  });
  check(manual.pref === 'kor' && !manual.last, 'elegido a mano: solo para esa serie ' + JSON.stringify(manual));
  // --- silencio mientras la tele no acepta la pista
  const mute = await ev(async () => {
    let muted = false; const calls = [];
    window.tizen = { tvaudiocontrol: { isMute: () => muted, setMute: (v) => { calls.push(v); muted = v; } } };
    const P = StremTV.Player, out = {};
    P.muteAudio(true); out.on = muted && localStorage.getItem('stv.muted') === 'true';
    P.muteAudio(false); out.off = !muted && localStorage.getItem('stv.muted') === 'false';
    P.muteAudio(true); await new Promise((r) => setTimeout(r, 4300)); out.cap = !muted;
    muted = true; calls.length = 0; P.muteAudio(true); P.muteAudio(false); out.userMuted = muted && calls.length === 0;
    delete window.tizen;
    return out;
  });
  check(mute.on && mute.off, 'silencia y devuelve el sonido (y lo apunta por si la app se cierra)');
  check(mute.cap, 'como mucho 4 s en silencio');
  check(mute.userMuted, 'si la tele ya estaba en silencio no se toca');

  // --- lista de fuentes con reproductor simulado
  await ev(() => {
    const P = StremTV.Player;
    P.hasAV = () => false;
    P.resolve = (url) => Promise.resolve(url);
    P.openHTML = function () { this.backend = 'test'; this.duration = 3000; this.paused = true; this.markStarted(); };
  });
  await ev(() => StremTV.open('series', 'tt0903747')); await sleep(3500);
  await ev(() => StremTV.Nav.focus(document.querySelector('.ep'))); await key('Enter'); await sleep(1500);
  const list = await ev(() => Array.from(document.querySelectorAll('.stream')).map((x) => x._stream && x._stream.quality).join(','));
  await ev(() => StremTV.Nav.focus(document.querySelector('.stream'))); await key('Enter'); await sleep(500);
  check(await ev(() => StremTV.Player.started && /4k/i.test(StremTV.Player.stream.quality)), 'reproduce la 4K (lista: ' + list + ')');

  // cortes: dos no avisan, el tercero ofrece la 1080p; uno justo después de saltar no cuenta
  const stall = (n) => ev((n) => { const P = StremTV.Player; for (let i = 0; i < n; i++) { P.stallBegin(); P.stallStart -= 2000; P.stallEnd(); } }, n);
  await stall(2);
  check(await ev(() => !document.getElementById('stallbox') || /hidden/.test(document.getElementById('stallbox').className)), 'dos cortes: aún sin aviso');
  await ev(() => { const P = StremTV.Player; P.lastSeekAt = Date.now(); P.stallBegin(); P.stallEnd(); P.lastSeekAt = 0; });
  check(await ev(() => StremTV.Player.stalls.n === 2), 'la carga tras un salto no cuenta como corte');
  await stall(1);
  const box = await ev(() => document.getElementById('stallbox').className + ' · ' + document.getElementById('stallbox').textContent);
  check(/^ ?·|^$/.test(box.split(' · ')[0]) && /1080p/.test(box), 'tercer corte: ofrece la 1080p → ' + box);
  await p.screenshot({ path: OUT + '/200-stall.png' });
  await ev(() => { StremTV.Player.time = 1234; });
  await key('Enter'); await sleep(500);
  const sw = await ev(() => ({ q: StremTV.Player.stream.quality, at: StremTV.Player.startAt, log: JSON.parse(localStorage.getItem('stv.log') || '[]').filter((e) => e.k === 'cortes').map((e) => e.m) }));
  check(/1080/.test(sw.q) && Math.round(sw.at) === 1234, 'OK cambia a la 1080p en el mismo punto: ' + JSON.stringify(sw));

  // fallo a mitad: sigue solo con otra fuente, como mucho dos veces seguidas
  await ev(() => { StremTV.Player.time = 1500; StremTV.Player.fail('Error del reproductor: X'); }); await sleep(400);
  const rec1 = await ev(() => ({ q: StremTV.Player.stream && StremTV.Player.stream.quality, at: StremTV.Player.startAt, toast: document.getElementById('toast').textContent }));
  check(rec1.q && Math.round(rec1.at) === 1500 && /ha fallado/.test(rec1.toast), 'fallo a mitad: sigue con otra en el mismo punto ' + JSON.stringify(rec1));
  await ev(() => { StremTV.Player.time = 1600; StremTV.Player.fail('Error del reproductor: Y'); }); await sleep(400);
  const rec2 = await ev(() => ({ q: StremTV.Player.stream && StremTV.Player.stream.quality, n: StremTV.Player.ctx && StremTV.Player.ctx.recovered }));
  check(rec2.n === 2, 'segundo fallo: otra más ' + JSON.stringify(rec2));
  await ev(() => { StremTV.Player.fail('Error del reproductor: Z'); }); await sleep(400);
  check(await ev(() => !StremTV.Player.stream && /hidden/.test(document.getElementById('player').className)), 'tercer fallo: vuelve a la lista');

  // --- intro aprendida (Breaking Bad no está en AniSkip)
  await ev(() => StremTV.Nav.focus(document.querySelectorAll('.stream')[0])); await key('Enter'); await sleep(400);
  const learned = await ev(async () => {
    const P = StremTV.Player; P.time = 25;
    P.seekBy(1); P.seekBy(1); P.seekBy(1); // 10 + 30 + 60
    await new Promise((r) => setTimeout(r, 350));
    const bubble = document.getElementById('osd-seek').innerHTML;
    await new Promise((r) => setTimeout(r, 800));
    return { saved: JSON.parse(localStorage.getItem('stv.introskips') || '{}').tt0903747, bubble, time: P.time };
  });
  check(learned.saved && learned.saved.s === 25 && learned.saved.e === 125, 'salto de 100 s al principio: intro aprendida ' + JSON.stringify(learned.saved));
  check(/<small>\+1:40<\/small>/.test(learned.bubble), 'la burbuja muestra cuánto se salta: ' + learned.bubble);
  await p.screenshot({ path: OUT + '/201-seek-bubble.png' });
  // otro episodio: ofrece saltarla
  await key('Escape'); await sleep(600); // del vídeo a la ficha
  await ev(() => StremTV.Nav.focus(document.querySelectorAll('.ep')[1])); await key('Enter'); await sleep(1500);
  await ev(() => StremTV.Nav.focus(document.querySelector('.stream'))); await key('Enter'); await sleep(500);
  await ev(() => { StremTV.Player.time = 20; }); await sleep(500);
  const offer = await ev(() => document.getElementById('skipbox') && document.getElementById('skipbox').className + '|' + document.getElementById('skipbox').textContent);
  check(/\|.*saltar intro/.test(offer) && !/hidden/.test(offer.split('|')[0]), 'episodio 2: ofrece saltar la intro aprendida → ' + offer);
  await p.screenshot({ path: OUT + '/202-learned-intro.png' });
  await key('Enter'); await sleep(300);
  check(await ev(() => Math.round(StremTV.Player.time) === 125), 'OK salta al final de la intro');
  // teclas numéricas: 5 → 50 %, sin aprender nada
  await ev(() => { localStorage.removeItem('stv.introskips'); StremTV.Player.time = 60; });
  await key('5'); await sleep(1000);
  const jump = await ev(() => ({ t: StremTV.Player.time, learned: localStorage.getItem('stv.introskips') }));
  check(jump.t === 1500 && !jump.learned, 'tecla 5: a la mitad (1500 s de 3000) y sin aprender intro ' + JSON.stringify(jump));
  await key('0'); await sleep(1000);
  check(await ev(() => StremTV.Player.time === 0), 'tecla 0: al principio');
  await ev(() => StremTV.Player.leave()); await sleep(300);
  await key('Escape'); await key('Escape'); await sleep(400);


  // --- cola desde el móvil
  cola = '# instrucciones\nver https://m.imdb.com/title/tt0816692/\nserie The Bear\nzzqqxx título inexistente 123\n';
  await ev(() => { localStorage.setItem('stv.backup', JSON.stringify({ token: 'T', gistId: 'G1', at: Date.now() })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  const n = await ev(() => StremTV.checkQueue()); await sleep(1200);
  const q = await ev(() => ({ list: Object.keys(JSON.parse(localStorage.getItem('stv.mylist') || '{}')), top: StremTV.stack[StremTV.stack.length - 1].el.textContent.slice(0, 60) }));
  check(n === 2 && q.list.indexOf('tt0816692') >= 0 && q.list.length === 2, 'cola: 2 títulos a Mi lista ' + JSON.stringify(q.list));
  check(/Interstellar/.test(q.top), '«ver» abre la ficha: ' + q.top);
  check(cola === '# instrucciones\n✗ zzqqxx título inexistente 123\n', 'cola.txt: quedan las instrucciones y lo no encontrado con ✗ → ' + JSON.stringify(cola));
  const n2 = await ev(() => StremTV.checkQueue());
  check(n2 === 0 && patches.length === 1, 'las líneas con ✗ no se repiten ni se reescribe el archivo');
  cola = null; patches = [];
  await ev(() => StremTV.checkQueue()); await sleep(300);
  check(patches.length === 1 && /cola desde el móvil/.test(cola), 'sin cola.txt: lo crea con las instrucciones');

  // --- Siguientes episodios con Trakt: «Nuevo» primero y barra con lo visto de la serie
  await ev(() => { localStorage.removeItem('stv.backup'); localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 })); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(5000);
  const upn = await ev(() => {
    const r = Array.from(document.querySelectorAll('.row')).filter((x) => /Siguientes/.test(x.querySelector('.row-title').textContent))[0];
    return r ? Array.from(r.querySelectorAll('.card')).map((c) => ({ name: c.querySelector('.name').textContent, isNew: !!c.querySelector('.new'), bar: !!c.querySelector('.pbar'), left: (c.querySelector('.left') || {}).textContent || '' })) : [];
  });
  check(upn.length === 2 && upn[0].isNew && /Game of Thrones/.test(upn[0].name) && upn[0].left === '1' && !upn[1].isNew && upn[1].left === '8' && !upn[0].bar && !upn[1].bar, 'Siguientes: ' + JSON.stringify(upn));
  await ev(() => { const r = Array.from(document.querySelectorAll('.row')).filter((x) => /Siguientes/.test(x.textContent))[0]; StremTV.Nav.focus(r.querySelector('.card')); }); await sleep(800);
  await p.screenshot({ path: OUT + '/203-upnext-new.png' });

  check(!errs.length, 'sin errores de JS ' + (errs.length ? JSON.stringify(errs) : ''));
  console.log(fails ? fails + ' FALLOS' : 'TODO BIEN');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
