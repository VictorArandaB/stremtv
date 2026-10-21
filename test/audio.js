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
    P.ctx = { type: 'series', metaId };
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
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
