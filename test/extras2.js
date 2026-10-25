// Registro de diagnóstico, sinopsis de episodio, reparto, visto recientemente, subtítulos (idiomas, color, posición) y arranque escalonado.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIDEO = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH' };
  const json = (req, o, st) => req.respond({ status: st || 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o) });
  const gists = {}; let cinemetaAt = 0; const t0 = Date.now();
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (u.indexOf('v3-cinemeta.strem.io/catalog/movie/top.json') >= 0 && !cinemetaAt) cinemetaAt = Date.now();
    if (u.indexOf('api.github.com') >= 0) {
      if (req.method() === 'GET' && /\/gists\?/.test(u)) return json(req, []);
      if (req.method() === 'POST') { gists.g1 = JSON.parse(req.postData()); return json(req, { id: 'g1' }, 201); }
      if (req.method() === 'PATCH') { Object.assign(gists.g1.files, JSON.parse(req.postData()).files); return json(req, { id: 'g1' }); }
    }
    if (u.indexOf('api.trakt.tv/sync/history') >= 0) return json(req, [
      { watched_at: new Date().toISOString(), type: 'episode', show: { title: 'Severance', ids: { imdb: 'tt11280740' } }, episode: { season: 2, number: 4 } },
      { watched_at: new Date().toISOString(), type: 'episode', show: { title: 'Severance', ids: { imdb: 'tt11280740' } }, episode: { season: 2, number: 3 } },
      { watched_at: new Date(Date.now() - 86400000).toISOString(), type: 'movie', movie: { title: 'Dune', ids: { imdb: 'tt1160419' } } }]);
    if (u.indexOf('api.trakt.tv') >= 0) return json(req, []);
    if (u.indexOf('api.themoviedb.org') >= 0) {
      if (u.indexOf('/find/tt0903747') >= 0) return json(req, { tv_results: [{ id: 1396, name: 'Breaking Bad' }], movie_results: [] });
      if (u.indexOf('/tv/1396/credits') >= 0) return json(req, { cast: [{ id: 17419, name: 'Bryan Cranston', character: 'Walter White' }, { id: 84497, name: 'Aaron Paul', character: 'Jesse Pinkman' }] });
      if (u.indexOf('/person/17419/combined_credits') >= 0) return json(req, { cast: [{ media_type: 'tv', id: 1396, name: 'Breaking Bad', vote_count: 9000 }, { media_type: 'movie', id: 12, title: 'Godzilla', vote_count: 5000 }, { media_type: 'tv', id: 1396, name: 'Breaking Bad', vote_count: 9000 }] });
      if (u.indexOf('/tv/1396/season/1') >= 0) return json(req, { episodes: [{ episode_number: 1, name: 'Piloto', overview: 'Walter White, profesor de química…' }] });
      if (u.indexOf('/tv/1396?') >= 0) return json(req, { name: 'Breaking Bad', overview: 'Serie (ES)', genres: [] });
      return json(req, {});
    }
    if (u.indexOf('/stream/') >= 0) return json(req, { streams: [{ name: '[AD+] Torrentio\n1080p', title: 'X.1080p.mkv\n💾 1 GB', url: VIDEO }] });
    if (u.indexOf('opensubtitles-v3') >= 0) return json(req, { subtitles: [{ id: 'f', lang: 'fre', url: 'https://s.test/f.srt' }, { id: 'e', lang: 'eng', url: 'https://s.test/e.srt' }, { id: 'r', lang: 'rus', url: 'https://s.test/r.srt' }, { id: 's', lang: 'spa', url: 'https://s.test/s.srt' }] });
    if (u.indexOf('s.test') >= 0) return req.respond({ status: 200, headers: cors, contentType: 'text/plain', body: '1\n00:00:00,000 --> 00:00:30,000\nBonjour\n' });
    req.continue();
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series', 'anime', 'other'], idPrefixes: null, catalogs: [] } }])); localStorage.setItem('stv.settings', JSON.stringify({ key: 'K', debrid: 'alldebrid', hideWatched: false, quickPlay: true }));
    localStorage.setItem('stv.trakt', JSON.stringify({ clientId: 'c', access: 'a', refresh: 'r', expires: Date.now() + 9e9 }));
    localStorage.setItem('stv.backup', JSON.stringify({ token: 'ghp_X' })); });
  cinemetaAt = 0; const loadAt = Date.now();
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500);
  console.log('arranque con Trakt: catálogos generales tras', cinemetaAt ? Math.round((cinemetaAt - loadAt) / 100) / 10 + ' s' : 'NO');
  console.log('visto recientemente (Trakt):', await p.evaluate(() => { const r = Array.from(document.querySelectorAll('.row')).filter((x) => /Visto recientemente/.test(x.textContent))[0]; return r ? Array.from(r.querySelectorAll('.card .name')).map((x) => x.textContent).join(' | ') : 'NO'; }));

  // sinopsis del episodio y reparto sin TMDB
  await p.evaluate(() => StremTV.open('series', 'tt0903747')); await sleep(3500);
  const desc = () => p.evaluate(() => document.querySelector('.detail .desc').textContent.slice(0, 70));
  // la sinopsis de cada episodio va en su fila; arriba se queda la de la serie
  const epOv = () => p.evaluate(() => (document.querySelector('.ep .ep-ov') || { textContent: 'NO' }).textContent.slice(0, 70));
  console.log('sinopsis del episodio:', await epOv());
  console.log('sinopsis de la serie:', await desc());
  console.log('botones:', await p.evaluate(() => Array.from(document.querySelectorAll('.detail .btn.small')).map((x) => x.textContent).join(' | ')));
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.detail .btn')).filter((x) => x.textContent === 'Reparto')[0])); await key('Enter'); await sleep(400);
  console.log('reparto sin TMDB:', await p.evaluate(() => Array.from(document.querySelectorAll('.mi')).slice(0, 3).map((x) => x.textContent).join(' | ')));
  await key('Escape'); await key('Escape'); await sleep(300);

  // con TMDB: reparto con personajes → filmografía; sinopsis en español
  await p.evaluate(() => { StremTV.settings.tmdbKey = 'CLAVE'; });
  await p.evaluate(() => StremTV.open('series', 'tt0903747')); await sleep(3500);
  console.log('episodio (TMDB):', await epOv());
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.detail .btn')).filter((x) => x.textContent === 'Reparto')[0])); await key('Enter'); await sleep(800);
  console.log('reparto TMDB:', await p.evaluate(() => Array.from(document.querySelectorAll('.mi')).map((x) => x.textContent).join(' | ')));
  await key('Enter'); await sleep(1200);
  console.log('filmografía:', await p.evaluate(() => document.querySelector('.screen-title').textContent + ' → ' + Array.from(document.querySelectorAll('.grid .card .name')).map((x) => x.textContent).join(' | ')));
  await key('Escape'); await sleep(300);

  // subtítulos: francés automático, amarillo y más arriba
  await p.evaluate(() => { StremTV.settings.subLang = 'fre'; StremTV.settings.subColor = 'yellow'; StremTV.settings.subPos = 'high'; StremTV.settings.tmdbKey = ''; });
  await p.evaluate(() => StremTV.open('movie', 'tt0111161')); await sleep(2500);
  await key('Enter'); await sleep(3500);
  console.log('subtítulos:', await p.evaluate(() => [document.getElementById('subs').className, document.getElementById('subs').textContent].join(' · ')));
  await key('ArrowUp'); await sleep(400);
  console.log('menú subs:', await p.evaluate(() => Array.from(document.querySelectorAll('.mi')).map((x) => x.textContent.split(' · ')[0]).join(' | ')));
  await key('Escape'); await sleep(200);
  await p.evaluate(() => { throw new Error('fallo de prueba'); }).catch(() => {});
  await p.evaluate(() => setTimeout(() => { null.x; }, 0)); await sleep(300);
  await key('Escape'); await sleep(500);

  // registro: ver y enviar
  await p.evaluate(() => StremTV.openSettings('data')); await sleep(600);
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.btn')).filter((x) => x.textContent === 'Ver registro')[0])); await key('Enter'); await sleep(400);
  console.log('ver registro:', await p.evaluate(() => Array.from(document.querySelectorAll('.mi')).slice(0, 4).map((x) => x.textContent.slice(0, 110)).join('\n   ')));
  await key('Escape');
  await p.evaluate(() => StremTV.Nav.focus(Array.from(document.querySelectorAll('.btn')).filter((x) => x.textContent === 'Enviar registro de diagnóstico')[0])); await key('Enter'); await sleep(1500);
  const d = gists.g1 && JSON.parse(gists.g1.files['diagnostico.json'].content);
  console.log('enviado:', await p.evaluate(() => document.getElementById('toast').textContent), '· tipos en el gist:', d && Array.from(new Set(d.log.map((e) => e.k))).join(','));
  console.log('ERRORES (solo los provocados):', errs);
  await b.close();
})();
