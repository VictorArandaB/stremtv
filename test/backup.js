// Copia de seguridad en un Gist (GitHub simulado): guardar, borrar los datos de la tele, escribir el token y restaurar.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH' };
  const gists = {}; const calls = [];
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('api.github.com') < 0) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    calls.push(req.method() + ' ' + u.replace('https://api.github.com', ''));
    const auth = req.headers().authorization;
    const out = (st, o) => req.respond({ status: st, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
    if (auth !== 'token ghp_BUENO') return out(401, { message: 'Bad credentials' });
    if (req.method() === 'GET' && /\/gists\?/.test(u)) return out(200, Object.keys(gists).map((id) => ({ id, description: gists[id].description, files: { 'stremtv.json': {} } })));
    if (req.method() === 'POST') { const body = JSON.parse(req.postData()); gists.g1 = body; return out(201, { id: 'g1' }); }
    const m = /\/gists\/(\w+)$/.exec(u);
    if (m && req.method() === 'PATCH') { Object.assign(gists[m[1]].files, JSON.parse(req.postData()).files); return out(200, { id: m[1] }); }
    if (m && req.method() === 'GET') return out(200, gists[m[1]]);
    return out(404, {});
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const status = () => p.evaluate(() => { const b = Array.from(document.querySelectorAll('.btn')).filter((x) => /Restaurar copia/.test(x.textContent))[0]; return b && b.nextSibling ? b.nextSibling.textContent : '?'; });
  const goSettings = async () => { await p.evaluate(() => StremTV.openSettings('accounts')); await sleep(800); };
  const typeToken = async (t) => { await p.evaluate((t) => { const i = Array.from(document.querySelectorAll('input')).filter((x) => x.placeholder === 'ghp_…')[0]; StremTV.Nav.focus(i); i.focus(); i.value = t; }, t); await key('Enter'); await sleep(1500); };
  const press = async (label) => { await p.evaluate((label) => StremTV.Nav.focus(Array.from(document.querySelectorAll('.btn,.mi')).filter((x) => x.textContent === label)[0]), label); await key('Enter'); await sleep(1500); };

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear();
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'CLAVE-DEBRID', debrid: 'alldebrid', lang: 'es', audioLang: 'eng' }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'cid', access: 'acc', refresh: 'ref', expires: Date.now() + 9e9 }));
    localStorage.setItem('stv.progress', JSON.stringify({ tt1: { videoId: 'tt1', metaId: 'tt1', type: 'movie', name: 'Peli', t: 600, d: 6000, ts: Date.now() } }));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://a.test', manifest: { id: 'a', name: 'Addon A', resources: [], types: [], catalogs: [] } }])); });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  await goSettings();
  console.log('sin token:', await status());
  await typeToken('ghp_MALO'); console.log('token malo:', await status());
  await typeToken('ghp_BUENO'); console.log('token bueno:', await status());
  await press('Guardar copia ahora'); console.log('guardar:', await status(), '· gist:', gists.g1 && gists.g1.public, Object.keys(JSON.parse(gists.g1.files['stremtv.json'].content).data).join());
  await press('Guardar copia ahora'); console.log('guardar otra vez →', calls.slice(-1)[0]);
  // la tele pierde los datos
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle2' }); await sleep(800);
  await goSettings(); await typeToken('ghp_BUENO'); console.log('tras borrar, token:', await status());
  await press('Restaurar copia'); await press('Restaurar'); await sleep(2500);
  console.log('restaurado:', await p.evaluate(() => [StremTV.settings.key, StremTV.settings.audioLang, JSON.parse(localStorage.getItem('stv.trakt')).access,
    Object.keys(JSON.parse(localStorage.getItem('stv.progress'))).join(), JSON.parse(localStorage.getItem('stv.addons'))[0].manifest.name].join(' | ')));
  console.log('continuar viendo:', await p.evaluate(() => Array.from(document.querySelectorAll('.row-title')).map((x) => x.textContent).filter((t) => /Continuar viendo/.test(t)).join()));
  console.log('ERRORES:', errs.length ? errs : 'ninguno');
  await b.close();
})();
