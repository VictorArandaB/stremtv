// Audio automático con un AVPlay simulado: español por defecto, el elegido en la serie, y sin subtítulos en español sobre audio en español.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://127.0.0.1:8090/', { waitUntil: 'networkidle2' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  const run = (tracks, metaId) => p.evaluate((tracks, metaId, prefAudio) => {
    let cur = tracks[0].index; const calls = [];
    window.webapis = { avplay: {
      getTotalTrackInfo: () => tracks.map((t) => ({ type: 'AUDIO', index: t.index, extra_info: JSON.stringify({ language: t.lang }) })),
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: cur }],
      setSelectTrack: (k, i) => { calls.push(i); cur = i; } } };
    const P = StremTV.Player;
    P.ctx = { type: 'series', metaId }; P.audioChosen = false;
    document.getElementById('subs').textContent = '';
    P.autoAudio();
    return { cur, calls, audioKey: P.audioKey };
  }, tracks, metaId);
  console.log('eng+spa → spa:', JSON.stringify(await run([{ index: 1, lang: 'eng' }, { index: 2, lang: 'spa' }], 'x')));
  console.log('ja+es → es:', JSON.stringify(await run([{ index: 1, lang: 'ja' }, { index: 2, lang: 'es' }], 'x')));
  console.log('est (estonio) no es español:', JSON.stringify(await run([{ index: 1, lang: 'eng' }, { index: 2, lang: 'est' }], 'x')));
  console.log('una pista spa (sin cambiar):', JSON.stringify(await run([{ index: 1, lang: 'spa' }], 'x')));
  await p.evaluate(() => { StremTV.settings.audioLang = 'eng'; });
  console.log('ajuste inglés, spa+en → en:', JSON.stringify(await run([{ index: 1, lang: 'spa' }, { index: 2, lang: 'en' }], 'x')));
  await p.evaluate(() => { StremTV.settings.audioLang = 'fre'; });
  console.log('ajuste francés, eng+fra → fra:', JSON.stringify(await run([{ index: 1, lang: 'eng' }, { index: 2, lang: 'fra' }], 'x')));
  await p.evaluate(() => { StremTV.settings.audioLang = 'orig'; });
  console.log('ajuste «original»:', JSON.stringify(await run([{ index: 1, lang: 'eng' }, { index: 2, lang: 'spa' }], 'x')));
  // el caso del ruso: sin español en el archivo, mejor inglés que la primera pista
  await p.evaluate(() => { StremTV.settings.audioLang = 'spa'; StremTV.settings.lastAudio = ''; });
  console.log('rus+eng sin español → eng:', JSON.stringify(await run([{ index: 1, lang: 'rus' }, { index: 2, lang: 'eng' }], 'peli1')));
  await p.evaluate(() => { StremTV.settings.lastAudio = 'fre'; });
  console.log('rus+eng+fra, último elegido francés → fra:', JSON.stringify(await run([{ index: 1, lang: 'rus' }, { index: 2, lang: 'eng' }, { index: 3, lang: 'fra' }], 'peli1')));
  // elegir a mano en una película: se recuerda para esa película
  const picked = await p.evaluate(() => {
    let cur = 1;
    window.webapis = { avplay: {
      getTotalTrackInfo: () => [{ type: 'AUDIO', index: 1, extra_info: '{"language":"rus"}' }, { type: 'AUDIO', index: 2, extra_info: '{"language":"ger"}' }],
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: cur }], setSelectTrack: (k, i) => { cur = i; } } };
    const P = StremTV.Player; P.backend = 'av'; P.ctx = { type: 'movie', metaId: 'peli2' };
    P.audioMenu();
    const mi = Array.from(document.querySelectorAll('.mi')).filter((x) => /Alemán/.test(x.textContent))[0];
    StremTV.Nav.focus(mi); mi._onclick(mi);
    return { toast: document.getElementById('toast').textContent, pref: JSON.parse(localStorage.getItem('stv.srcprefs')).peli2.audio, last: StremTV.settings.lastAudio };
  });
  console.log('elegido a mano en película:', JSON.stringify(picked));
  console.log('volver a poner peli2 (rus+ger) → ger:', JSON.stringify(await run([{ index: 1, lang: 'rus' }, { index: 2, lang: 'ger' }], 'peli2')));
  console.log('otra peli sin español ni alemán recordado → último (ger):', JSON.stringify(await run([{ index: 1, lang: 'rus' }, { index: 2, lang: 'eng' }, { index: 3, lang: 'deu' }], 'peli3')));
  // tras elegir a mano con ▼, los reintentos automáticos no la cambian
  const keep = await p.evaluate(() => {
    let cur = 2, calls = [];
    window.webapis = { avplay: {
      getTotalTrackInfo: () => [{ type: 'AUDIO', index: 1, extra_info: '{"language":"rus"}' }, { type: 'AUDIO', index: 2, extra_info: '{"lang":"eng"}' }],
      getCurrentStreamInfo: () => [{ type: 'AUDIO', index: cur }], setSelectTrack: (k, i) => { calls.push(i); cur = i; } } };
    const P = StremTV.Player; P.ctx = { type: 'movie', metaId: 'peli9' }; P.audioChosen = true;
    P.autoAudio();
    return { cur, calls };
  });
  console.log('elegida a mano (ruso) y reintento → no la toca:', JSON.stringify(keep));
  console.log('idioma en el campo «lang» → eng:', JSON.stringify(await run([{ index: 1, lang: 'rus' }, { index: 2, lang: 'eng' }], 'peli10')));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
