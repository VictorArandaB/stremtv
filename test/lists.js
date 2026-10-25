// Listas famosas y premios en Películas y Series: IMDb Top 250 (lista de Trakt, con el Client ID y sin vincular), la última
// edición de los Óscar, Goya y Emmy (Wikipedia + Wikidata; la ganadora delante y marcada; antes de la gala, «nominadas»),
// historial de ganadoras (Wikidata), lo guardado no se vuelve a pedir hasta que caduca (y si falla, vale lo guardado),
// filas ocultas de serie y que se pueden ocultar como las demás, y en inglés. Todo se simula. Sale con código 1 si algo falla.
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = __dirname + '/shots';
let fails = 0;
const check = (ok, what, got) => { console.log((ok ? '✓ ' : '✗ ') + what + (got !== undefined ? ' → ' + got : '')); if (!ok) fails++; };
const Y = new Date().getFullYear();
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.setRequestInterception(true);
  const hdr = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  const json = (req, o, status) => req.respond({ status: status || 200, headers: hdr, contentType: 'application/json', body: JSON.stringify(o) });

  // páginas de la Wikipedia: la casilla de la categoría con la ganadora en negrita y las nominadas debajo
  const ordinal = (n) => n + (n % 100 > 10 && n % 100 < 14 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th');
  const cell = (cat, label, win, noms) => '| {{Award category|#F9EFAA|[[' + cat + '|' + label + ']]}}\n' +
    (win ? "* '''''[[" + win + "]]''''' – Productores ‡\n" + noms.map((n) => "** ''[[" + n + "]]'' – Otros").join('\n')
      : noms.map((n) => "* ''[[" + n + "]]'' – Otros").join('\n')) + '\n';
  const PAGES = {};
  // Óscar: la del año que viene existe pero vacía; la de este año, con ganadora (la categoría también sale antes en el texto)
  PAGES[ordinal(Y + 1 - 1928) + ' Academy Awards'] = 'The ceremony will honor films.\n{| class="wikitable"\n| {{Award category|#F9EFAA|[[Academy Award for Best Picture|Best Picture]]}}\n*\n*\n|}';
  PAGES[ordinal(Y - 1928) + ' Academy Awards'] = 'Nominated for the [[Academy Award for Best Picture]] were ten films.\n\n===Awards===\n{| class="wikitable"\n' +
    cell('Academy Award for Best Picture', 'Best Picture', 'Peli Ganadora (film)', ['Peli Nominada|Nominada Uno', 'Sin IMDb']) +
    cell('Academy Award for Best Director', 'Best Director', 'Alguien', ['Otro']) + '|}';
  // Goya: la del año que viene ya tiene nominadas y aún no hay ganadora
  PAGES[ordinal(Y + 1 - 1986) + ' Goya Awards'] = '{| class="wikitable"\n' + cell('Goya Award for Best Film', 'Best Film', null, ['Goya Uno', 'Goya Dos (film)']) + '|}';
  PAGES[ordinal(Y - 1986) + ' Goya Awards'] = '{| class="wikitable"\n' + cell('Goya Award for Best Film', 'Best Film', 'Goya Vieja', ['Goya Vieja Dos']) + '|}';
  // Emmy: la de este año, con ganadoras en drama y comedia
  PAGES[ordinal(Y - 1948) + ' Primetime Emmy Awards'] = '{| class="wikitable"\n' +
    cell('Primetime Emmy Award for Outstanding Comedy Series', 'Comedy', 'Comedia Ganadora', ['Comedia Nominada']) +
    cell('Primetime Emmy Award for Outstanding Drama Series', 'Drama', 'Drama Ganador (TV series)', ['Drama Nominado']) + '|}';
  // artículo → elemento de Wikidata (una redirección incluida) y elemento → id de IMDb y título en español
  const QID = { 'Peli Ganadora (film)': 'Q1', 'Peli Nominada': 'Q2', 'Sin IMDb': 'Q3', 'Goya Uno': 'Q4', 'Goya Dos (película)': 'Q5', 'Goya Vieja': 'Q6', 'Goya Vieja Dos': 'Q7',
    'Comedia Ganadora': 'Q8', 'Comedia Nominada': 'Q9', 'Drama Ganador (TV series)': 'Q10', 'Drama Nominado': 'Q11' };
  const REDIR = { 'Goya Dos (film)': 'Goya Dos (película)' };
  const WD = { Q1: ['tt0000101', 'La peli ganadora (película de 2025)', 2025], Q2: ['tt0000102', 'Nominada uno', 2025], Q4: ['tt0000104', 'Goya uno', 2026], Q5: ['tt0000105', '', 2026],
    Q6: ['tt0000106', 'Goya vieja', 2025], Q7: ['tt0000107', 'Goya vieja dos', 2025], Q8: ['tt0000108', 'Comedia ganadora', 0], Q9: ['tt0000109', 'Comedia nominada', 0],
    Q10: ['tt0000110', 'Drama ganador', 0], Q11: ['tt0000111', 'Drama nominado', 0] };
  const reqs = { wiki: 0, sparql: 0, trakt: 0 };
  let traktHdr = null, failAll = false;
  p.on('request', (req) => {
    const u = req.url();
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: hdr });
    if (u.indexOf('en.wikipedia.org/w/api.php') >= 0) {
      reqs.wiki++;
      if (failAll) return json(req, {}, 500);
      const q = new URL(u).searchParams, titles = q.get('titles').split('|');
      if (q.get('prop') === 'revisions') {
        return json(req, { query: { pages: titles.map((t) => PAGES[t] ? { title: t, revisions: [{ slots: { main: { content: PAGES[t] } } }] } : { title: t, missing: true }) } });
      }
      const redirects = titles.filter((t) => REDIR[t]).map((t) => ({ from: t, to: REDIR[t] }));
      return json(req, { query: { redirects: redirects, pages: titles.map((t) => REDIR[t] || t).map((t) => QID[t] ? { title: t, pageprops: { wikibase_item: QID[t] } } : { title: t, missing: true }) } });
    }
    if (u.indexOf('query.wikidata.org/sparql') >= 0) {
      reqs.sparql++;
      if (failAll) return json(req, {}, 500);
      const sq = new URL(u).searchParams.get('query');
      if (/ps:P166 wd:Q179808/.test(sq)) {
        // Palma de Oro: con una persona (sin tt) y una película repetida
        const lit = (v) => ({ type: 'literal', value: String(v) });
        return json(req, { results: { bindings: [
          { item: lit('x'), imdb: lit('tt0000201'), y: lit(Y), es: lit('Palma reciente'), en: lit('Recent Palme') },
          { item: lit('x'), imdb: lit('nm0000001'), y: lit(Y), en: lit('Un director') },
          { item: lit('x'), imdb: lit('tt0000202'), y: lit(Y - 1), en: lit('Older Palme') },
          { item: lit('x'), imdb: lit('tt0000201'), y: lit(Y - 1), en: lit('Recent Palme') }] } });
      }
      const ids = (/VALUES \?item \{([^}]*)\}/.exec(sq) || ['', ''])[1].trim().split(/\s+/).map((x) => x.replace('wd:', ''));
      return json(req, { results: { bindings: ids.filter((q) => WD[q]).map((q) => Object.assign({ item: { type: 'uri', value: 'http://www.wikidata.org/entity/' + q }, imdb: { type: 'literal', value: WD[q][0] } },
        WD[q][1] ? { es: { type: 'literal', value: WD[q][1] } } : {}, WD[q][2] ? { y: { type: 'literal', value: String(WD[q][2]) } } : {})) } });
    }
    if (u.indexOf('api.trakt.tv/users/justin/lists/') >= 0) {
      reqs.trakt++;
      traktHdr = req.headers();
      if (failAll) return json(req, {}, 500);
      if (/imdb-top-rated-movies\/items\/movies$/.test(u)) return json(req, [
        { rank: 2, type: 'movie', movie: { title: 'The Godfather', year: 1972, ids: { imdb: 'tt0068646' } } },
        { rank: 1, type: 'movie', movie: { title: 'The Shawshank Redemption', year: 1994, ids: { imdb: 'tt0111161' } } },
        { rank: 3, type: 'movie', movie: { title: 'Sin IMDb', year: 2000, ids: { trakt: 5 } } }]);
      if (/imdb-top-rated-tv-shows\/items\/shows$/.test(u)) return json(req, [{ rank: 1, type: 'show', show: { title: 'Breaking Bad', year: 2008, ids: { imdb: 'tt0903747' } } }]);
      return json(req, [], 404);
    }
    if (u.indexOf('api.trakt.tv') >= 0) return json(req, []);
    if (u.indexOf('/catalog/') >= 0 && u.indexOf('v3-cinemeta') >= 0) return json(req, { metas: [{ id: 'tt0000900', type: /movie/.test(u) ? 'movie' : 'series', name: 'Cinemeta', poster: '' }] });
    if (u.indexOf('/meta/') >= 0) return json(req, { meta: {} });
    if (u.indexOf('/manifest.json') >= 0) return json(req, {});
    if (u.indexOf('http://127.0.0.1') === 0) return req.continue();
    return req.respond({ status: 404, headers: hdr, body: '' });
  });
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await sleep(250); } };
  const top = 'StremTV.stack[StremTV.stack.length - 1].el';
  const focusText = async (re, sel = '.f') => p.evaluate((top, re, sel) => {
    const x = Array.from(eval(top).querySelectorAll(sel)).filter((e) => new RegExp(re).test(e.textContent) && (e.offsetWidth || e.offsetHeight))[0];
    if (x) StremTV.Nav.focus(x);
    return !!x;
  }, top, re, sel);
  const tab = async (name) => { await focusText('^' + name + '$', '.tab'); await key('Enter'); await sleep(2500); };
  // «Título: [insignia] nombre (id, año), …»
  const rows = () => p.evaluate((top) => Array.from(eval(top).querySelectorAll('.row')).map((r) => {
    const t = r.querySelector('.row-title');
    return (t ? t.textContent : '') + ': ' + Array.from(r.querySelectorAll('.card')).map((c) => {
      const bd = c.querySelector('.award');
      return (bd ? '[' + bd.textContent + '] ' : '') + c.querySelector('.name').textContent + ' (' + (c._meta && c._meta.id) + (c._meta && c._meta.releaseInfo ? ', ' + c._meta.releaseInfo : '') + ')';
    }).join(', ');
  }), top);
  const rowTitles = () => p.evaluate((top) => Array.from(eval(top).querySelectorAll('.row-title')).map((t) => t.textContent).join(' | '), top);
  const row = (list, re) => list.filter((r) => new RegExp(re).test(r))[0] || '';
  const setup = (extra) => p.evaluate((extra) => {
    localStorage.clear();
    localStorage.setItem('stv.settings', JSON.stringify(Object.assign({ key: 'K', debrid: 'alldebrid', hideWatched: false }, extra.settings || {})));
    if (extra.trakt) localStorage.setItem('stv.trakt', JSON.stringify(extra.trakt));
    localStorage.setItem('stv.addons', JSON.stringify([{ url: 'https://torrentio.strem.fun', manifest: { id: 'com.stremio.torrentio.addon', name: 'Torrentio', resources: ['stream'], types: ['movie', 'series'], idPrefixes: null, catalogs: [] } }]));
  }, extra);

  await p.goto(('http://127.0.0.1:' + (process.env.STV_PORT || 8090) + '/'), { waitUntil: 'networkidle2' });
  // Client ID de Trakt sin vincular la cuenta: basta para la Top 250
  await setup({ trakt: { clientId: 'cid' } });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);

  // --- Películas
  await tab('Películas');
  const mv = await rows();
  const titles = await rowTitles();
  check(titles === 'Populares | Mejor valoradas | IMDb Top 250 | Óscar ' + Y + ' | Goya ' + (Y + 1) + ': nominadas', 'filas de Películas (Globos de Oro, Palma de Oro y Ganadoras del Óscar, ocultas de serie)', titles);
  const top250 = row(mv, '^IMDb Top 250:');
  check(top250 === 'IMDb Top 250: The Shawshank Redemption (tt0111161, 1994), The Godfather (tt0068646, 1972)', 'Top 250 en orden de la lista y sin lo que no tiene id de IMDb', top250);
  check(traktHdr && traktHdr['trakt-api-key'] === 'cid' && !traktHdr.authorization, 'la lista de Trakt se pide con el Client ID y sin sesión', traktHdr && traktHdr['trakt-api-key']);
  const oscar = row(mv, '^Óscar');
  check(oscar === 'Óscar ' + Y + ': [Ganadora] La peli ganadora (tt0000101, 2025), Nominada uno (tt0000102, 2025)',
    'Óscar: la edición más reciente con nominadas, la ganadora delante y marcada, en español y sin las que no tienen IMDb', oscar);
  const goya = row(mv, '^Goya');
  check(goya === 'Goya ' + (Y + 1) + ': nominadas: Goya uno (tt0000104, 2026), Goya Dos (tt0000105, 2026)', 'Goya antes de la gala: «nominadas», sin ganadora (y siguiendo la redirección)', goya);
  await p.screenshot({ path: OUT + '/lists-movies.png' });
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('stv.lists') || '{}'));
  check(saved['award:oscar'] && saved['award:oscar'].year === Y && saved['top:imdb-top-rated-movies'] && saved['top:imdb-top-rated-movies'].items.length === 2 && saved['award:goya'],
    'lo descargado se guarda', Object.keys(saved).join(', '));

  // --- Series
  await tab('Series');
  const sr = await rows();
  const st = await rowTitles();
  check(st === 'Populares | Mejor valoradas | IMDb Top 250 series | Emmy ' + Y, 'filas de Series', st);
  const emmy = row(sr, '^Emmy');
  check(emmy === 'Emmy ' + Y + ': [Ganadora] Drama ganador (tt0000110), [Ganadora] Comedia ganadora (tt0000108), Drama nominado (tt0000111), Comedia nominada (tt0000109)',
    'Emmy: las ganadoras de drama y comedia delante (drama primero, aunque en la página vaya después)', emmy);
  check(row(sr, '^IMDb Top 250 series') === 'IMDb Top 250 series: Breaking Bad (tt0903747, 2008)', 'Top 250 de series', row(sr, '^IMDb Top 250 series'));
  check(await p.evaluate(() => { const c = Array.from(document.querySelectorAll('.card')).filter((x) => x._meta && x._meta.id === 'tt0000110')[0]; return c && c._meta.type === 'series'; }), 'las del Emmy son series');

  // --- lo guardado no se vuelve a pedir
  const before = JSON.stringify(reqs);
  await tab('Inicio'); await tab('Películas'); await tab('Series');
  check(JSON.stringify(reqs) === before && row(await rows(), '^Emmy') === emmy, 'al volver a las pestañas no se pide nada', before + ' → ' + JSON.stringify(reqs));
  // tras recargar la app, tampoco: sale de lo guardado
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  await tab('Películas');
  check(JSON.stringify(reqs) === before && row(await rows(), '^Óscar') === oscar, 'tras reiniciar, las filas salen de lo guardado sin pedir nada', JSON.stringify(reqs));

  // --- caducado y la descarga falla: vale lo guardado; caducado y responde: se vuelve a pedir
  await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('stv.lists')); Object.keys(l).forEach((k) => { l[k].ts = Date.now() - 30 * 86400000; }); localStorage.setItem('stv.lists', JSON.stringify(l)); });
  failAll = true;
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  await tab('Películas');
  const stale = await rows();
  check(row(stale, '^Óscar') === oscar && /^IMDb Top 250: The Shawshank/.test(row(stale, '^IMDb Top 250:')), 'si falla la descarga, valen las listas guardadas', row(stale, '^Óscar'));
  const ts1 = await p.evaluate(() => JSON.parse(localStorage.getItem('stv.lists'))['award:oscar'].ts);
  check(Date.now() - ts1 < 7 * 86400000, 'tras el fallo, se vuelve a probar más tarde (no en cada apertura)', Math.round((Date.now() - ts1) / 86400000) + ' días');
  failAll = false;
  await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('stv.lists')); Object.keys(l).forEach((k) => { l[k].ts = Date.now() - 30 * 86400000; }); localStorage.setItem('stv.lists', JSON.stringify(l)); });
  const n0 = reqs.wiki;
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  await tab('Películas');
  check(reqs.wiki > n0 && row(await rows(), '^Óscar') === oscar, 'caducado: se vuelve a pedir', (reqs.wiki - n0) + ' peticiones a la Wikipedia');

  // --- Ajustes: Palma de Oro oculta de serie; mostrarla y ocultar el Óscar
  await p.evaluate(() => StremTV.openSettings('general')); await sleep(600);
  check(await focusText('^Filas de Películas'), 'Ajustes → General → Filas de Películas');
  await key('Enter'); await sleep(600);
  const opts = await p.evaluate((top) => Array.from(eval(top).querySelectorAll('.opt')).map((x) => x.textContent).join(' | '), top);
  check(/Palma de Oro \(Cannes\)\s*Oculta/.test(opts) && /Ganadoras del Óscar\s*Oculta/.test(opts) && /Globos de Oro\s*Oculta/.test(opts) && /\d+\. Óscar\s*Visible/.test(opts), 'en Ajustes, como las demás filas (las secundarias, ocultas)', opts);
  await focusText('Palma de Oro'); await key('Enter'); await sleep(300);
  await focusText('^Mostrar$'); await key('Enter'); await sleep(300);
  await focusText('\\d+\\. Óscar'); await key('Enter'); await sleep(300);
  await focusText('^Ocultar$'); await key('Enter'); await sleep(300);
  check(await p.evaluate(() => StremTV.settings.moviesRows.hidden.oscar === true && StremTV.settings.moviesRows.hidden.palme === false), 'se guarda');
  await tab('Películas');
  const mv2 = await rows();
  check(!row(mv2, '^Óscar') && row(mv2, '^Palma de Oro') === 'Palma de Oro (Cannes): [' + Y + '] Palma reciente (tt0000201), [' + (Y - 1) + '] Older Palme (tt0000202)',
    'sin el Óscar y con la Palma de Oro (el año del premio en la carátula, sin personas ni repetidas)', (await rowTitles()) + ' · ' + row(mv2, '^Palma'));
  await p.screenshot({ path: OUT + '/lists-palme.png' });

  // --- sin Client ID de Trakt no hay Top 250; en inglés
  await setup({ settings: { lang: 'en' } });
  await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
  await tab('Movies');
  const en = await rows();
  const et = await rowTitles();
  check(!/IMDb Top 250/.test(et), 'sin Client ID de Trakt, sin Top 250', et);
  check(row(en, '^Oscars') === 'Oscars ' + Y + ': [Winner] Peli Ganadora (tt0000101, 2025), Nominada Uno (tt0000102, 2025)', 'en inglés: «Oscars», «Winner» y el título de la Wikipedia', row(en, '^Oscars'));
  check(/^Goya Awards \d+: nominees/.test(row(en, '^Goya')), 'en inglés: «nominees»', row(en, '^Goya'));

  console.log('ERRORES:', errs.length ? errs.join(' | ') : 'ninguno');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
