// Subtítulo elegido a mano recordado en la serie: incrustados sin idioma (la tele da track_lang vacío) por posición,
// solo si el archivo trae las mismas pistas y es de la misma release; «Sin subtítulos» también se recuerda.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  const check = (name, ok, got) => console.log((ok ? '✓ ' : '✗ ') + name + (ok ? '' : ' → ' + JSON.stringify(got)));

  // AVPlay simulado con n pistas TEXT sin idioma; prepara el reproductor como si un episodio acabara de arrancar
  const setup = (n, metaId, group, started) => p.evaluate((n, metaId, group, started) => {
    window.__calls = [];
    window.webapis = { avplay: {
      getTotalTrackInfo: () => [{ type: 'AUDIO', index: 1, extra_info: '{"language":"jp"}' }].concat(Array.from({ length: n }, (x, i) =>
        ({ type: 'TEXT', index: 2 + i, extra_info: '{"track_num":"0","track_lang":"","subtitle_type":"0","fourCC":""}' }))),
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: 1 }],
      setSelectTrack: (k, i) => { window.__calls.push(k + i); }, setSilentSubtitle: (v) => { window.__calls.push('silent' + v); },
      setSubtitlePosition: () => {} } };
    const P = StremTV.Player, S = StremTV.Subs;
    S.box = document.getElementById('subs'); S.reset();
    P.ctx = { type: 'series', metaId: metaId }; P.backend = 'av'; P.stream = { group: group }; P.started = started; P.audioChosen = false;
    const pr = JSON.parse(localStorage.getItem('stv.srcprefs') || '{}')[metaId];
    S.pref = (pr && pr.sub) || null;
    S.listReady = true; S.list = [];
  }, n, metaId, group, started);
  const state = () => p.evaluate(() => ({ calls: window.__calls, emb: StremTV.Subs.embedded, idx: StremTV.Subs.embIndex, cur: StremTV.Subs.current && StremTV.Subs.current.lang }));
  const pick = (re) => p.evaluate((re) => {
    StremTV.Player.subsMenu();
    const mi = Array.from(document.querySelectorAll('.mi')).filter((x) => new RegExp(re).test(x.textContent))[0];
    StremTV.Nav.focus(mi); mi._onclick(mi);
    return { toast: document.getElementById('toast').textContent, pref: JSON.parse(localStorage.getItem('stv.srcprefs'))[StremTV.Player.ctx.metaId].sub };
  }, re);

  // sin nada elegido: con incrustados sin idioma no se pone ninguno (como antes)
  await setup(3, 'tt1', 'toonshub', true);
  await p.evaluate(() => StremTV.Player.autoSubs());
  let s = await state();
  check('sin elegir nada, ningún incrustado', !s.emb && !s.calls.length, s);

  // elegir a mano la pista 2 de 3
  const r = await pick('pista 2');
  check('se guarda la posición', r.pref.kind === 'emb' && r.pref.pos === 1 && r.pref.n === 3 && r.pref.group === 'toonshub', r);
  check('el aviso dice que se usará en la serie', /resto de la serie/.test(r.toast), r.toast);

  // siguiente episodio, mismo archivo: antes de arrancar no se toca, después la pista 2
  await setup(3, 'tt1', 'toonshub', false);
  await p.evaluate(() => StremTV.Player.autoSubs());
  s = await state();
  check('antes de arrancar no se cambia', !s.emb && !s.calls.length, s);
  await p.evaluate(() => { StremTV.Player.started = true; StremTV.Player.autoAudio(); });
  s = await state();
  check('al arrancar, la pista 2 de la serie', s.emb && s.idx === 3 && s.calls.indexOf('TEXT3') >= 0, s);
  await p.evaluate(() => StremTV.Player.autoAudio());
  s = await state();
  check('los reintentos del audio no la vuelven a cambiar', s.calls.filter((c) => c === 'TEXT3').length === 1, s);
  check('el menú la marca como elegida', await p.evaluate(() => { StremTV.Player.subsMenu(); const m = Array.from(document.querySelectorAll('.mi')).filter((x) => /pista 2/.test(x.textContent))[0]; return m.classList.contains('sel'); }), null);
  await p.keyboard.press('Escape'); await sleep(200);
  check('el menú se ha cerrado', await p.evaluate(() => !document.querySelector('.mi')), null);

  // otro archivo con otras pistas, u otra release: no se aplica
  await setup(5, 'tt1', 'toonshub', true);
  await p.evaluate(() => StremTV.Player.autoSubs());
  s = await state();
  check('con otro número de pistas no se aplica', !s.emb, s);
  await setup(3, 'tt1', 'erai', true);
  await p.evaluate(() => StremTV.Player.autoSubs());
  s = await state();
  check('con otra release no se aplica', !s.emb, s);

  // otra serie no hereda nada
  await setup(3, 'tt2', 'toonshub', true);
  await p.evaluate(() => StremTV.Player.autoSubs());
  s = await state();
  check('otra serie, nada', !s.emb, s);

  // externo: se recuerda el idioma y se pone el primero de ese idioma
  await setup(0, 'tt3', '', true);
  await p.evaluate(() => { StremTV.Subs.list = [{ lang: 'spa', url: 'data:text/plain,', addon: '', id: 'a' }, { lang: 'eng', url: 'data:text/plain,', addon: '', id: 'b' }]; });
  const r2 = await pick('Inglés');
  check('externo: se guarda el idioma', r2.pref.kind === 'ext' && r2.pref.lang === 'eng', r2);
  await setup(0, 'tt3', '', true);
  await p.evaluate(() => { StremTV.Subs.list = [{ lang: 'spa', url: 'data:text/plain,', addon: '', id: 'c' }, { lang: 'eng', url: 'data:text/plain,', addon: '', id: 'd' }]; StremTV.Player.autoSubs(); });
  s = await state();
  check('externo: siguiente episodio en inglés (no el español de Ajustes)', s.cur === 'eng', s);

  // «Sin subtítulos» se recuerda: el español de Ajustes ya no se pone solo
  await pick('Sin subtítulos');
  await setup(0, 'tt3', '', true);
  await p.evaluate(() => { StremTV.Subs.list = [{ lang: 'spa', url: 'data:text/plain,', addon: '', id: 'e' }]; StremTV.Player.autoSubs(); });
  s = await state();
  check('sin subtítulos recordado', !s.cur, s);

  // sin preferencia, el de Ajustes como siempre
  await setup(0, 'tt4', '', true);
  await p.evaluate(() => { StremTV.Subs.list = [{ lang: 'spa', url: 'data:text/plain,', addon: '', id: 'f' }]; StremTV.Player.autoSubs(); });
  s = await state();
  check('sin preferencia, el de Ajustes', s.cur === 'spa', s);

  console.log('ERRORES:', errs.length ? '\n' + errs.join('\n') : 'ninguno');
  await b.close();
})();
