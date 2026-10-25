  // ---------------------------------------------------------------- pantalla: inicio

  function clockText(d) { return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  // un solo temporizador para todos los relojes (cabeceras y reproductor)
  var clockTick = Date.now();
  function tickClocks() {
    clockTick = Date.now();
    var t = clockText(new Date());
    Array.prototype.forEach.call(document.querySelectorAll('.clock'), function (c) { if (c.textContent !== t) c.textContent = t; });
  }
  setInterval(tickClocks, 10000);
  // en la tele el reloj se ha visto parado sin poder reproducirlo: al volver a la app o al pulsar una tecla se pone al día
  // y, si el temporizador llevaba más de un minuto sin saltar, queda en el registro
  function clockCheck(why) {
    var gap = Date.now() - clockTick;
    if (gap > 60000 && !document.hidden) logEv('reloj', 'temporizador parado ' + Math.round(gap / 1000) + ' s', { al: why });
    tickClocks();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) clockCheck('volver a la app'); });
  document.addEventListener('keydown', function () { if (Date.now() - clockTick > 15000) clockCheck('tecla'); }, true);

  var TABS = [['home', 'Inicio'], ['anime', 'Anime'], ['movies', 'Películas'], ['series', 'Series'], ['search', 'Buscar'], ['settings', 'Ajustes']];
  function header(active) {
    var h = el('div', 'header');
    h.appendChild(el('div', 'logo', 'StremTV'));
    TABS.forEach(function (t) {
      var tab = el('div', 'tab' + (t[0] === active ? ' active' : ''), tr(t[1]));
      focusable(tab, function () { if (t[0] !== active) openTab(t[0]); });
      h.appendChild(tab);
    });
    h.appendChild(el('div', 'clock', clockText(new Date())));
    return h;
  }
  // cada pestaña se abre sobre Inicio (Atrás siempre vuelve a Inicio); al volver a Inicio, el foco en su pestaña,
  // no en la que se pulsó para salir de ella
  function openTab(k) {
    while (stack.length > 1) {
      if (stack.length === 2) stack[0].lastFocus = stack[0].el.querySelector('.tab.active');
      pop();
    }
    if (k === 'home') return;
    if (k === 'search') push(searchScreen());
    else if (k === 'anime' || k === 'series' || k === 'movies') push(catalogScreen(k));
    else if (k === 'settings') openSettings();
  }
  function activeTab(root) { return function () { return root.querySelector('.tab.active'); }; }

  // ---------------------------------------------------------------- cabecera grande (inicio y anime)

  function metahubImg(kind, imdb) { return 'https://images.metahub.space/' + kind + '/medium/' + imdb + '/img'; }
  // fondo reducido a 960 px: en la tele, pintar uno de 1920×1080 cuesta el doble (medido: ~200 ms frente a ~100 ms por cambio)
  function smallBg(url) { return 'https://wsrv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//, '')) + '&w=960&output=jpg&q=80'; }

  // datos completos de una carátula para la cabecera: los del catálogo o, si faltan (filas de Trakt), los de Cinemeta/Kitsu;
  // con TMDB, título y sinopsis en español. Se guardan en memoria mientras dure la sesión
  var heroCache = {}, heroCount = 0;
  // fondo y logo deducidos del id de IMDb si el catálogo no los trae
  function withImages(d, imdb) {
    if (!d.background && imdb) d.background = metahubImg('background', imdb);
    if (!d.logo && imdb) d.logo = metahubImg('logo', imdb);
    return d;
  }
  // lo que ya se sabe de la carátula sin pedir nada (los catálogos de Cinemeta traen casi todo)
  function heroQuick(m) {
    return withImages(extend({}, m), imdbOfMeta(m));
  }
  var logoState = {}; // url → 'ok' | 'no'
  // pone el logo en «box» (que ya lleva el nombre en un <span> oculto); sin logo, o si a los 1,2 s de la primera
  // llamada aún no ha cargado, el nombre en texto. Una vez decidido, esa caja ya no cambia: volver a llamar con ella
  // (al llegar la ficha completa) solo sirve mientras no se ha decidido. Con «later», no tener logo aún no decide nada:
  // puede llegar en la siguiente llamada. Un logo que carga tarde sí se queda guardado, y la próxima vez sale el logo
  function titleLogo(box, url, logoCls, textCls, later) {
    if (box._done) return;
    var settle = function (img) {
      if (box._done) return;
      box._done = true;
      box.className = img ? logoCls : textCls;
      if (img) box.insertBefore(img, box.firstChild);
    };
    if (!box._timer) { box.className = logoCls; box._timer = setTimeout(function () { settle(null); }, 1200); }
    if (!url || logoState[url] === 'no') { if (!later) settle(null); return; }
    var img = new Image();
    if (logoState[url] === 'ok') { img.src = url; settle(img); return; }
    img.onload = function () { logoState[url] = 'ok'; settle(img); };
    img.onerror = function () { logoState[url] = 'no'; if (!later) settle(null); };
    img.src = url;
  }

  function heroInfo(m) {
    var id = String(m.id || ''), kitsu = id.indexOf('kitsu:') === 0;
    var imdb = imdbOfMeta(m);
    var key = (m.type || '') + ':' + id;
    if (heroCache[key]) return heroCache[key];
    if (++heroCount > 300) { heroCache = {}; heroCount = 1; }
    var full = m.description && m.background ? Promise.resolve(extend({}, m)) : !(imdb || kitsu) ? Promise.resolve(extend({}, m))
      : getJSON(kitsu ? ANIME + '/meta/anime/' + id + '.json' : CINEMETA + '/meta/' + (m.type === 'movie' ? 'movie' : 'series') + '/' + imdb + '.json')
        .then(function (r) { var d = extend(extend({}, m), r.meta || {}); d.name = m.name || d.name; return d; }, function () { return extend({}, m); });
    return (heroCache[key] = full.then(function (d) {
      imdb = imdb || d.imdb_id || null;
      withImages(d, imdb);
      if (!tmdbOn() || !imdb) return d;
      return withTimeout(tmdbDetail(imdb), 3000).then(function (es) {
        if (es && es.overview) d.description = es.overview;
        if (es && es.genres.length) d.genres = es.genres;
        return d;
      }, function () { return d; });
    }));
  }

  function makeHero(root) {
    var hero = el('div', 'hero');
    var layers = [el('div', 'hero-bg'), el('div', 'hero-bg')];
    hero.appendChild(layers[0]);
    hero.appendChild(layers[1]);
    hero.appendChild(el('div', 'hero-shade'));
    var info = el('div', 'hero-info');
    hero.appendChild(info);
    root.insertBefore(hero, root.firstChild);
    root.classList.add('with-hero');
    var front = 0, shownBg = '', bg = null, timer = null, title = null;

    function bgOff() { layers[0].classList.remove('on'); layers[1].classList.remove('on'); }
    // el fondo nuevo sustituye al anterior en cuanto se ha descargado, salvo si se sigue pulsando: entonces espera
    // a que el foco lleve 0,3 s quieto (sin fundido: en la tele, repintar esa zona durante el fundido atasca la navegación);
    // si la versión reducida falla o tarda más de 2,5 s, la original; si también falla, las de altBg
    function setBg(url) {
      if (url === shownBg) return;
      shownBg = url;
      bg = null;
      if (!url) { bgOff(); return; }
      bgNext(bg = { tries: [smallBg(url), url] });
    }
    // otro fondo para la misma carátula (el de la ficha completa), por si el que se está probando no existe
    function altBg(url) {
      var cur = bg;
      if (!cur || !url || url === shownBg || cur.done) return;
      cur.tries.push(smallBg(url), url);
      if (!cur.busy) bgNext(cur);
    }
    function bgNext(cur) {
      var src = cur.tries.shift();
      if (!src) { cur.busy = false; bgOff(); return; }
      cur.busy = true;
      var img = new Image(), loaded = false, over = false;
      var fail = function () { if (over || loaded || bg !== cur) return; over = true; bgNext(cur); };
      var slow = src.indexOf('https://wsrv.nl/') === 0 ? setTimeout(fail, 2500) : null;
      var apply = function () {
        if (over || bg !== cur) return;
        var wait = Nav.lastAt + 300 - Date.now();
        if (wait > 0) { setTimeout(apply, wait); return; }
        over = cur.done = true;
        front = 1 - front;
        layers[front].style.backgroundImage = 'url("' + src + '")';
        layers[front].classList.add('on');
        layers[1 - front].classList.remove('on');
      };
      img.onload = function () { clearTimeout(slow); loaded = true; apply(); };
      img.onerror = function () { clearTimeout(slow); fail(); };
      img.src = src;
    }

    // título: el logo si lo hay; mientras se sabe, el hueco queda vacío (sin saltar de texto a logo).
    // Sin logo, o si tarda más de 1,2 s, el nombre en texto. Se decide una vez por carátula: al repintar con la ficha
    // completa se reutiliza la misma caja, y el logo de la ficha solo cuenta si aún no se había decidido.
    // «fresh»: carátula nueva; «later»: aún puede llegar un logo con la ficha completa
    function paint(d, fresh, later) {
      var box = el('div');
      if (fresh) {
        title = el('div', 'hero-logo');
        title.appendChild(el('span'));
      }
      title.lastChild.innerHTML = esc(d.name);
      titleLogo(title, d.logo, 'hero-logo', 'hero-title', later);
      box.appendChild(title);
      var parts = [];
      if (d.imdbRating && parseFloat(d.imdbRating)) parts.push('<span class="star">★ ' + esc(num(d.imdbRating)) + '</span>');
      if (d.releaseInfo || d.year) parts.push('<span>' + esc(d.releaseInfo || d.year) + '</span>');
      if (d.runtime) parts.push('<span>' + esc(d.runtime) + '</span>');
      var g = d.genres || d.genre;
      if (g && g.length) parts.push('<span>' + esc(g.slice(0, 3).join(', ')) + '</span>');
      box.appendChild(el('div', 'hero-meta', parts.join('')));
      box.appendChild(el('div', 'hero-desc', esc(d.description || '')));
      info.innerHTML = '';
      info.appendChild(box);
    }

    var api = {
      cur: null,
      // espera un momento por si el foco sigue moviéndose; el logo (si lo hay) sustituye al título cuando ya ha cargado
      // tras un instante quieto: lo que trae el catálogo y la descarga del fondo a la vez; la sinopsis completa
      // (o en español) sustituye al texto cuando llega, sin esperar por ella para lo demás
      show: function (m) {
        if (m === api.cur) return;
        api.cur = m;
        clearTimeout(timer);
        timer = setTimeout(function () {
          var q = heroQuick(m), sig = function (d) {
            return [d.name, d.description, d.releaseInfo, d.year, d.runtime, d.imdbRating, String(d.genres || d.genre || ''), d.logo].join('|');
          };
          paint(q, true, true);
          // sin fondo en el catálogo se deja el anterior hasta saber si la ficha completa trae uno
          if (q.background) setBg(q.background);
          heroInfo(m).then(function (d) {
            if (api.cur !== m) return;
            if (sig(d) !== sig(q)) paint(d);
            else titleLogo(title, d.logo, 'hero-logo', 'hero-title');
            if (!q.background) setBg(d.background || '');
            else if (d.background !== q.background) altBg(d.background);
          });
        }, 200);
      }
    };
    root._hero = api;
    return api;
  }

  // mientras no se haya enfocado ninguna carátula, la cabecera muestra la primera
  function primeHero(node) {
    var root = closestClass(node, 'screen');
    if (!root || !root._hero || root._hero.cur) return;
    var cards = root.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) if (cards[i]._meta) { root._hero.show(cards[i]._meta); return; }
  }

  // pantalla con cabecera grande: pestañas arriba, fondo y datos detrás y las filas en la mitad de abajo
  function heroScreen(active) {
    var root = el('div', 'screen');
    makeHero(root);
    root.appendChild(header(active));
    var vs = el('div', 'vscroll');
    vs.setAttribute('data-pad', '60');
    root.appendChild(vs);
    return { root: root, vs: vs };
  }

  // filas de Inicio, Series y Películas que se pueden ordenar u ocultar (Ajustes → General → Filas de …). Las de los addons van
  // detrás, con la clave «addon:url|tipo|id»: las de películas en Películas, las de series en Series, las de anime en Anime
  // y las demás en Inicio.
  // settings.homeRows / animeRows / moviesRows / seriesRows: { order: [claves], hidden: { clave: true | false } }; sin dato, oculta si «off»
  // (u «offIfTrakt» con Trakt vinculado).
  // trakt: solo con Trakt vinculado; local: solo sin él; tmdb: solo con clave de TMDB; traktKey: con el Client ID de Trakt
  // (aunque la cuenta no esté vinculada); max: cuántas carátulas como mucho (40 si no se dice)
  var PAGE_ROWS = {
    home: [
      { k: 'cont', name: 'Continuar viendo' },
      { k: 'mylist', name: 'Mi lista', local: true }, // sin Trakt (con Trakt, su lista va en dos filas)
      { k: 'traktCont', name: 'Continuar (Trakt)', trakt: true },
      { k: 'upnext', name: 'Siguientes episodios', trakt: true },
      { k: 'week', name: 'Esta semana en tus series', trakt: true },
      { k: 'wlMovies', name: 'Mi lista: películas', trakt: true },
      { k: 'wlSeries', name: 'Mi lista: series', trakt: true },
      { k: 'history', name: 'Visto recientemente' },
      // lo de Series y Películas; en Inicio, solo si no hay Trakt (si no, saldría casi vacío)
      { k: 'popMovies', name: 'Películas populares', url: CINEMETA + '/catalog/movie/top.json', offIfTrakt: true },
      { k: 'popSeries', name: 'Series populares', url: CINEMETA + '/catalog/series/top.json', offIfTrakt: true }
    ],
    series: [
      { k: 'forYou', name: 'Para ti', trakt: true },
      { k: 'trending', name: 'Tendencia esta semana', tmdb: true },
      { k: 'airing', name: 'En emisión', tmdb: true },
      { k: 'pop', name: 'Populares', url: CINEMETA + '/catalog/series/top.json' },
      { k: 'new', name: 'Estrenos', tmdb: true },
      { k: 'top', name: 'Mejor valoradas', url: CINEMETA + '/catalog/series/imdbRating.json' },
      // listas famosas y premios (más abajo, «listas famosas y premios»)
      { k: 'imdbTop', name: 'IMDb Top 250 series', top: 'imdb-top-rated-tv-shows', traktKey: true, max: 250 },
      { k: 'emmy', name: 'Emmy', award: 'emmy' },
      { k: 'globes', name: 'Globos de Oro', award: 'globesTv', off: true }
    ],
    // el anime va en su pestaña: Películas y Series no lo muestran
    anime: [
      { k: 'forYou', name: 'Para ti', trakt: true },
      { k: 'trending', name: 'Tendencia esta semana', url: ANIME + '/catalog/anime/kitsu-anime-trending.json' },
      { k: 'airing', name: 'En emisión', url: ANIME + '/catalog/anime/kitsu-anime-airing.json' },
      { k: 'pop', name: 'Populares', url: ANIME + '/catalog/anime/kitsu-anime-popular.json' },
      { k: 'new', name: 'Estrenos', tmdb: true },
      { k: 'top', name: 'Mejor valorados', url: ANIME + '/catalog/anime/kitsu-anime-rating.json' }
    ],
    movies: [
      { k: 'forYou', name: 'Para ti', trakt: true },
      { k: 'trending', name: 'Tendencia esta semana', tmdb: true },
      { k: 'new', name: 'Estrenos en digital', tmdb: true },
      { k: 'cinema', name: 'En cines', tmdb: true },
      { k: 'pop', name: 'Populares', url: CINEMETA + '/catalog/movie/top.json' },
      { k: 'top', name: 'Mejor valoradas', url: CINEMETA + '/catalog/movie/imdbRating.json' },
      { k: 'imdbTop', name: 'IMDb Top 250', top: 'imdb-top-rated-movies', traktKey: true, max: 250 },
      { k: 'oscar', name: 'Óscar', award: 'oscar' },
      { k: 'goya', name: 'Goya', award: 'goya' },
      { k: 'globes', name: 'Globos de Oro', award: 'globes', off: true },
      { k: 'palme', name: 'Palma de Oro (Cannes)', wins: 'Q179808', off: true },
      { k: 'oscarWins', name: 'Ganadoras del Óscar', wins: 'Q102427', season: 'oscar', off: true }
    ]
  };
  // una fila por plataforma en Series y Películas
  PLATFORMS.forEach(function (pl) {
    ['movies', 'series', 'anime'].forEach(function (page) {
      if (pl.anime && page !== 'anime') return; // Crunchyroll, solo en Anime
      var off = page === 'anime' ? !pl.anime && pl.k !== 'netflix' && pl.k !== 'prime' : pl.off;
      PAGE_ROWS[page].push({ k: 'prov:' + pl.k, name: 'En {0}', arg: pl.name, tmdb: true, off: off, platform: pl });
    });
  });
  var ROWS_SETTING = { home: 'homeRows', anime: 'animeRows', movies: 'moviesRows', series: 'seriesRows' };
  var PAGE_NAMES = { home: 'Inicio', anime: 'Anime', movies: 'Películas', series: 'Series' };

  // las filas que tocan ahora en una pestaña (de cada addon, como mucho 4) en el orden elegido; las nuevas, al final
  function pageRows(page) {
    var linked = Trakt.linked(), tmdb = !!settings.tmdbKey, perAddon = {};
    var all = PAGE_ROWS[page].filter(function (r) { return !(r.trakt && !linked) && !(r.local && linked) && !(r.tmdb && !tmdb) && !(r.traktKey && !trakt.clientId); })
      .map(function (r) { return extend({ title: tr(r.name, r.arg) }, r); });
    addonCatalogs(false).forEach(function (c) {
      var t = c.catalog.type, to = t === 'movie' ? 'movies' : t === 'series' ? 'series' : t === 'anime' ? 'anime' : 'home';
      if (to !== page) return;
      var n = perAddon[c.addon.url] = (perAddon[c.addon.url] || 0) + 1;
      if (n <= 4) all.push({ k: 'addon:' + c.addon.url + '|' + t + '|' + c.catalog.id, title: c.title, catalog: c });
    });
    var pref = settings[ROWS_SETTING[page]] || {}, order = pref.order || [], hidden = pref.hidden || {};
    return all.map(function (r, i) {
      var p = order.indexOf(r.k);
      r.hidden = hidden[r.k] === undefined ? !!(r.off || (r.offIfTrakt && linked)) : !!hidden[r.k];
      return { r: r, p: p < 0 ? 1000 + i : p };
    }).sort(function (a, b) { return a.p - b.p; }).map(function (x) { return x.r; });
  }
  function homeRows() { return pageRows('home'); }
  function rowsKey(rows) { return rows.map(function (r) { return r.k + (r.hidden ? '-' : '+'); }).join(','); }

  function homeScreen() {
    var hs = heroScreen('home'), root = hs.root, vs = hs.vs;
    var warnWrap = el('div'), slots = {}, rowsSig = '', first = true;
    var screen = { el: root };
    // cada fila tiene su hueco en el orden elegido; una fila oculta no tiene hueco y no se pide
    function slot(k) { return slots[k] || null; }

    function renderWarnings() {
      warnWrap.innerHTML = '';
      var noSources = !hasSources();
      if (noSources || !settings.key) {
        var warn = el('div', 'row');
        var b = el('div', 'btn primary', noSources ? tr('Añade un addon de fuentes en Ajustes → Fuentes y debrid para poder reproducir')
          : tr('Configura tu Real-Debrid o AllDebrid para poder reproducir'));
        b.style.marginLeft = '80px';
        focusable(b, function () { openSettings('sources'); });
        warn.appendChild(b);
        warnWrap.appendChild(warn);
      }
      if (CERT_EXPIRES - Date.now() < 30 * 86400000) {
        var cw = el('div', 'row');
        cw.appendChild(el('div', 'note cert-warn', esc(tr('⚠ El certificado de StremTV caduca el {0}. Si deja de abrirse, hay que volver a firmarla e instalarla desde el Mac.', fmtDate(CERT_EXPIRES)))));
        warnWrap.appendChild(cw);
      }
    }

    function renderLocal() {
      var cw = slot('cont'), cont = continueList();
      if (cw) cw.innerHTML = '';
      if (cw && cont.length) {
        var contRow;
        cw.appendChild(contRow = posterRow(tr('Continuar viendo'), cont.map(function (p) {
          return { id: p.metaId, type: p.type, name: p.name, poster: p.poster };
        }), function (m, i) {
          var p = cont[i];
          if (p.type === 'movie') resumeMovie(p);
          else push(detailScreen(p.type, p.metaId));
        }, cont.map(function (p) { return { pct: p.t / p.d, label: p.label || p.name }; })));
        // la fila sale ya (es local); el número de pendientes de cada serie llega después con Trakt
        if (Trakt.linked()) Trakt.withPending(cont.map(function (p) { return { id: p.metaId, type: p.type }; })).then(function (ms) {
          var cards = contRow.querySelectorAll('.card');
          ms.forEach(function (m, i) { if (m.left && cards[i]) cards[i].firstChild.appendChild(leftBadge(m.left)); });
        });
      }
      var lw = slot('mylist'), mine = myListMetas();
      if (lw) lw.innerHTML = '';
      if (lw && mine.length) lw.appendChild(posterRow(tr('Mi lista'), mine, openMeta));
    }

    var traktLoaded = 0;
    function renderTrakt() {
      if (!Trakt.linked()) { traktLoaded = 0; return; }
      if (Date.now() - traktLoaded < 120000) return; // como mucho cada 2 minutos
      traktLoaded = Date.now();
      ['traktCont', 'upnext', 'week', 'wlMovies', 'wlSeries'].forEach(function (k) { if (slots[k]) slots[k].innerHTML = ''; });
      var local = {};
      if (slot('cont')) continueList().forEach(function (p) { local[p.metaId] = true; });
      // cada fila se da como función: si falla por la red, se vuelve a pedir sola al volver (las que comparten datos, con shared)
      var paused = shared(function () {
        return Trakt.playback().then(function (items) {
          var seen = {};
          return Trakt.withPending(items.filter(function (m) {
            if (local[m.id] || seen[m.id]) return false; // ya está en «Continuar viendo»
            seen[m.id] = true;
            return true;
          }));
        });
      });
      if (slot('traktCont')) promiseRow(slot('traktCont'), tr('Continuar (Trakt)'), paused, openMeta, true);
      // series con el siguiente episodio pendiente (sin repetir las que ya salen arriba)
      if (slot('upnext')) promiseRow(slot('upnext'), tr('Siguientes episodios'), function () {
        return Promise.all([Trakt.upNext(), slot('traktCont') ? paused().catch(function () { return []; }) : []]).then(function (r) {
          var above = {};
          r[1].forEach(function (m) { above[m.id] = true; });
          return r[0].filter(function (m) { return !local[m.id] && !above[m.id]; });
        });
      }, openMeta, true, 100);
      if (slot('week')) promiseRow(slot('week'), tr('Esta semana en tus series'), function () { return Trakt.calendar(); }, openMeta, true);
      var wl = shared(function () { return Trakt.loadWatchlist(); });
      var wlOf = function (type) { return function () { return wl().then(function (m) { return m.filter(function (x) { return x.type === type; }); }); }; };
      if (slot('wlMovies')) promiseRow(slot('wlMovies'), tr('Mi lista: películas'), wlOf('movie'), openMeta, true, 100);
      if (slot('wlSeries')) promiseRow(slot('wlSeries'), tr('Mi lista: series'), function () { return wlOf('series')().then(Trakt.withPending); }, openMeta, true, 100);
    }

    // lo último visto: de Trakt si está vinculado (incluye otros dispositivos) o, si no, de esta tele
    var histLoaded = 0;
    function renderHistory() {
      var hw = slot('history');
      if (!hw || (Trakt.linked() && Date.now() - histLoaded < 120000)) return;
      histLoaded = Date.now();
      hw.innerHTML = '';
      promiseRow(hw, tr('Visto recientemente'), function () { return Trakt.linked() ? Trakt.history().then(Trakt.withPending) : Promise.resolve(localHistory()); }, openMeta, true, 30);
    }
    function localHistory() {
      var seen = {};
      return Object.keys(progress).map(function (k) { return progress[k]; }).filter(function (p) { return p.done; })
        .sort(function (a, b) { return b.ts - a.ts; }).filter(function (p) {
          if (seen[p.metaId]) return false;
          seen[p.metaId] = true;
          return true;
        }).map(function (p) { return { id: p.metaId, type: p.type, name: p.name, poster: p.poster, label: dayLabel(new Date(p.ts)) + ' · ' + (p.label || p.name) }; });
    }

    // catálogos generales y de los addons (si el catálogo viene vacío o el addon falla, la fila desaparece)
    function loadCatalogs(rows) {
      rows.forEach(function (r) {
        var w = slot(r.k);
        if (!w) return;
        if (r.url) asyncRow(w, r.title, r.url, openMeta);
        else if (r.catalog) {
          var c = r.catalog;
          promiseRow(w, r.title, function () {
            return Promise.all([getJSON(c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '.json'), seenReady()]).then(function (res) {
              return filterSeen(res[0].metas || []);
            });
          }, openMeta, true);
        }
      });
    }

    function layout(rows) {
      rowsSig = rowsKey(rows);
      vs.innerHTML = '';
      scrollTop0(vs);
      slots = {};
      vs.appendChild(warnWrap);
      rows.forEach(function (r) {
        if (r.hidden) return;
        slots[r.k] = el('div');
        vs.appendChild(slots[r.k]);
      });
      renderWarnings();
      renderLocal();
      traktLoaded = histLoaded = 0;
      renderTrakt();
      renderHistory();
      // al arrancar con Trakt vinculado, sus filas van primero: los catálogos esperan 1,5 s
      // para no competir con ellas por la red y el procesador de la tele
      if (first && Trakt.linked()) setTimeout(function () { if (rowsSig === rowsKey(rows)) loadCatalogs(rows); }, 1500);
      else loadCatalogs(rows);
      first = false;
    }
    layout(homeRows());

    screen.onShow = function () { primeHero(vs); };
    screen.onResume = function () {
      var rows = homeRows();
      // filas cambiadas en Ajustes (orden, ocultas, Trakt vinculado o addons nuevos): rehacer Inicio
      if (rowsKey(rows) !== rowsSig) {
        layout(rows);
        screen.lastFocus = null;
        if (root._hero) root._hero.cur = null;
        primeHero(vs);
        return;
      }
      renderWarnings(); renderLocal(); renderTrakt(); renderHistory();
      // si se acaba de poner la clave de TMDB, traducir las tarjetas que ya se ven
      Array.prototype.forEach.call(root.querySelectorAll('.card'), function (c) { if (c._loaded || !c._img) nameCard(c); });
    };
    return screen;
  }

  function resumeMovie(p) {
    // pasar por el detalle permite elegir otra fuente si la guardada caducó
    push(detailScreen('movie', p.metaId));
  }

  // ---------------------------------------------------------------- listas famosas y premios (Películas y Series)

  // Se ponen al día solas cada año, sin tocar el código:
  // - Premios de la última edición (Óscar, Globos de Oro, Goya, Emmy): la página de la edición en la Wikipedia en inglés
  //   («98th Academy Awards»). Todas usan la misma plantilla: en la casilla de cada categoría (con el enlace al artículo de la
  //   categoría) va la ganadora en negrita y debajo las demás nominadas («** …»); antes de la gala, todas las nominadas al mismo
  //   nivel y sin negrita. El número de edición sale del año (98.ª de los Óscar = 2026) y se piden a la vez la del año que viene,
  //   la de este y la del anterior: vale la más reciente que ya tenga nominadas (las del año que viene existen antes de tiempo,
  //   pero vacías). Si un premio se saltara un año, habría que corregir su «first».
  //   Los ids de IMDb (y el título en español) salen de Wikidata. Wikidata sola no vale para las nominadas: le faltan muchas
  //   de los últimos años (en 2026 tenía 3 de las 10 nominadas a mejor película; «Cónclave» no tiene ninguna nominación),
  //   pero las ganadoras sí las tiene bien.
  // - Historial de ganadoras (Palma de Oro, Óscar a mejor película): Wikidata («premio recibido» con su fecha).
  // - IMDb Top 250 (películas y series): la lista pública de Trakt que la copia y la mantiene al día (usuario «justin»), pedida
  //   con el Client ID de Trakt de Ajustes, sin necesidad de vincular la cuenta. IMDb no tiene API abierta, Wikidata no guarda
  //   la lista y «Mejor valoradas» de Cinemeta no es lo mismo. Si Trakt quitara la lista, la fila desaparece sin más.
  // Lo descargado se guarda («lists»): los premios se miran cada día en su temporada (diciembre-marzo; julio-septiembre los Emmy)
  // y cada semana el resto del año; las Top 250, cada semana. Si falla la descarga, vale lo guardado
  var WIKI = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*';
  var SPARQL = 'https://query.wikidata.org/sparql?format=json&query=';
  // page: nombre de la página sin el número; first: año de la primera edición; cats: artículos de las categorías (los que enlaza
  // la casilla); season: meses (0-11) de nominaciones y gala
  var AWARDS = {
    oscar: { page: 'Academy Awards', first: 1929, cats: ['Academy Award for Best Picture'], season: [11, 0, 1, 2] },
    globes: { page: 'Golden Globe Awards', first: 1944, season: [11, 0, 1, 2],
      cats: ['Golden Globe Award for Best Motion Picture – Drama', 'Golden Globe Award for Best Motion Picture – Musical or Comedy'] },
    globesTv: { page: 'Golden Globe Awards', first: 1944, season: [11, 0, 1, 2],
      cats: ['Golden Globe Award for Best Television Series – Drama', 'Golden Globe Award for Best Television Series – Musical or Comedy'] },
    goya: { page: 'Goya Awards', first: 1987, cats: ['Goya Award for Best Film'], season: [11, 0, 1, 2] },
    emmy: { page: 'Primetime Emmy Awards', first: 1949, season: [6, 7, 8],
      cats: ['Primetime Emmy Award for Outstanding Drama Series', 'Primetime Emmy Award for Outstanding Comedy Series'] }
  };
  var lists = load('lists', {}), listPending = {};

  // lo guardado si aún vale; si no, lo pide (una sola vez aunque lo pidan dos filas). Si la descarga falla o viene vacía
  // (la Wikipedia cambió de formato, Trakt quitó la lista), vale lo guardado y se vuelve a probar al día siguiente
  function cachedList(key, maxAge, fetch) {
    var c = lists[key];
    if (c && Date.now() - c.ts < maxAge) return Promise.resolve(c);
    if (!listPending[key]) {
      var keep = function () { c.ts = Date.now() - Math.max(0, maxAge - 86400000); save('lists', lists); return c; };
      listPending[key] = fetch().then(function (d) {
        delete listPending[key];
        if (!d.items.length && c && c.items.length) return keep();
        d.ts = Date.now();
        lists[key] = d;
        save('lists', lists);
        return d;
      }, function (e) {
        delete listPending[key];
        if (!c) throw e;
        return keep();
      });
    }
    return listPending[key];
  }
  // un día en la temporada del premio y una semana el resto del año
  function awardAge(season) { return season && season.indexOf(new Date().getMonth()) >= 0 ? 86400000 : 7 * 86400000; }

  function ordinal(n) {
    var t = n % 100, u = n % 10;
    return n + (t > 10 && t < 14 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
  }

  // nominadas de una categoría en el wikitexto de la página de la edición: [{ t: artículo, n: título, win }] (la ganadora en
  // negrita). La categoría puede salir enlazada antes en el texto: vale la primera vez que lleva una lista debajo
  function awardEntries(wt, cat) {
    var pos = 0;
    for (;;) {
      var a = wt.indexOf('[[' + cat + '|', pos), b = wt.indexOf('[[' + cat + ']]', pos);
      var i = a < 0 ? b : b < 0 ? a : Math.min(a, b);
      if (i < 0) return [];
      pos = i + 2;
      // la lista acaba en la casilla siguiente («|…», «|-», «|}») o en un apartado nuevo
      var lines = wt.slice(i, i + 8000).split('\n'), out = [];
      for (var j = 1; j < lines.length && !/^[|!=]/.test(lines[j]); j++) {
        var m = /^\*+\s*(.*)/.exec(lines[j]), lk = m && /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/.exec(m[1]);
        if (!lk) continue;
        out.push({ t: lk[1], n: (lk[2] || lk[1].replace(/\s*\([^)]*\)$/, '')).replace(/'{2,}/g, ''), win: m[1].slice(0, lk.index).indexOf("'''") >= 0 });
      }
      if (out.length) return out;
    }
  }

  // la última edición con nominadas: { year (el de la gala), items } con las ganadoras delante
  function awardEdition(a) {
    var y = new Date().getFullYear(), years = [y + 1, y, y - 1];
    var titles = years.map(function (yy) { return ordinal(yy - a.first + 1) + ' ' + a.page; });
    return getJSON(WIKI + '&action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=' + encodeURIComponent(titles.join('|'))).then(function (d) {
      var q = d.query || {}, to = {}, text = {};
      (q.normalized || []).concat(q.redirects || []).forEach(function (r) { to[r.from] = r.to; });
      (q.pages || []).forEach(function (pg) {
        var rv = pg.revisions && pg.revisions[0];
        if (rv) text[pg.title] = rv.slots ? rv.slots.main.content : rv.content;
      });
      for (var i = 0; i < years.length; i++) {
        var t = titles[i];
        for (var n = 0; n < 3 && to[t]; n++) t = to[t];
        var wt = text[t] || '', all = [], seenT = {};
        a.cats.forEach(function (c) { all = all.concat(awardEntries(wt, c)); });
        all = all.filter(function (e) { if (seenT[e.t]) return false; seenT[e.t] = true; return true; });
        if (all.length >= 2) {
          return { year: years[i], items: all.filter(function (e) { return e.win; }).concat(all.filter(function (e) { return !e.win; })) };
        }
      }
      return { year: 0, items: [] };
    });
  }

  // id de IMDb, título en español y año de los artículos de la Wikipedia (su elemento de Wikidata); sin id de IMDb, fuera
  function wikiImdb(items) {
    items = items.slice(0, 50);
    if (!items.length) return Promise.resolve([]);
    return getJSON(WIKI + '&action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=' +
      encodeURIComponent(items.map(function (e) { return e.t; }).join('|'))).then(function (d) {
      var q = d.query || {}, to = {}, qid = {};
      (q.normalized || []).concat(q.redirects || []).forEach(function (r) { to[r.from] = r.to; });
      (q.pages || []).forEach(function (pg) { if (pg.pageprops && pg.pageprops.wikibase_item) qid[pg.title] = pg.pageprops.wikibase_item; });
      items.forEach(function (e) {
        var t = e.t;
        for (var n = 0; n < 3 && to[t]; n++) t = to[t];
        e.q = qid[t];
      });
      var ids = items.filter(function (e) { return e.q; }).map(function (e) { return 'wd:' + e.q; });
      if (!ids.length) return [];
      return getJSON(SPARQL + encodeURIComponent('SELECT ?item (SAMPLE(?i) AS ?imdb) (SAMPLE(?l) AS ?es) (MIN(YEAR(?d)) AS ?y) WHERE { VALUES ?item { ' +
        ids.join(' ') + ' } ?item wdt:P345 ?i . OPTIONAL { ?item rdfs:label ?l FILTER(LANG(?l) = "es") } OPTIONAL { ?item wdt:P577 ?d } } GROUP BY ?item')).then(function (r) {
        var byQ = {};
        ((r.results || {}).bindings || []).forEach(function (b) {
          byQ[b.item.value.replace(/^.*\//, '')] = { id: b.imdb.value, es: b.es ? b.es.value : '', y: b.y ? +b.y.value : 0 };
        });
        return items.filter(function (e) { return byQ[e.q] && /^tt\d+$/.test(byQ[e.q].id); }).map(function (e) {
          var w = byQ[e.q];
          return { id: w.id, n: e.n, es: w.es, y: w.y, win: e.win };
        });
      });
    });
  }

  // las etiquetas de Wikidata a veces llevan la aclaración de la Wikipedia: «Aún estoy aquí (película de 2024)»
  function cleanLabel(s) { return String(s || '').replace(/\s*\((película|serie|serie de televisión|telefilme)[^)]*\)$/, ''); }
  // carátulas de una lista guardada; «badge»: Ganadora o el año del premio
  function listMetas(items, type) {
    var en = settings.lang === 'en';
    return items.map(function (it) {
      return { id: it.id, type: type, name: (!en && cleanLabel(it.es)) || it.n, poster: metahubPoster(it.id), releaseInfo: it.y ? String(it.y) : '',
        badge: it.win ? tr('Ganadora') : it.yr ? String(it.yr) : '' };
    });
  }

  // fila de la última edición de un premio: «Óscar 2026» (la ganadora delante, marcada) o, antes de la gala, «Óscar 2027: nominadas»
  function awardRow(r) {
    var a = AWARDS[r.award];
    return cachedList('award:' + r.award, awardAge(a.season), function () {
      return awardEdition(a).then(function (ed) {
        return wikiImdb(ed.items).then(function (items) { return { year: ed.year, items: items }; });
      });
    }).then(function (d) {
      var metas = listMetas(d.items, r.award === 'emmy' || r.award === 'globesTv' ? 'series' : 'movie');
      var won = d.items.some(function (it) { return it.win; });
      metas.title = d.year ? tr(won ? '{0} {1}' : '{0} {1}: nominadas', tr(r.name), d.year) : tr(r.name);
      return metas;
    });
  }

  // ganadoras de un premio, de la más reciente a la más antigua, con el año en la carátula
  function winsRow(r) {
    return cachedList('wins:' + r.wins, awardAge(r.season && AWARDS[r.season].season), function () {
      return getJSON(SPARQL + encodeURIComponent('SELECT ?item ?imdb ?y ?es ?en WHERE { ?item p:P166 ?st . ?st ps:P166 wd:' + r.wins +
        ' ; pq:P585 ?d . BIND(YEAR(?d) AS ?y) ?item wdt:P345 ?imdb . FILTER(STRSTARTS(?imdb, "tt")) OPTIONAL { ?item rdfs:label ?es FILTER(LANG(?es) = "es") }' +
        ' OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") } } ORDER BY DESC(?y) LIMIT 80')).then(function (res) {
        var seenId = {}, items = [];
        ((res.results || {}).bindings || []).forEach(function (b) {
          var id = b.imdb.value;
          if (seenId[id] || !/^tt\d+$/.test(id)) return;
          seenId[id] = true;
          items.push({ id: id, n: b.en ? b.en.value : id, es: b.es ? b.es.value : '', yr: +b.y.value });
        });
        return { items: items.slice(0, 40) };
      });
    }).then(function (d) { return listMetas(d.items, 'movie'); });
  }

  // IMDb Top 250 de la lista de Trakt (en su orden)
  function topList(slug, k) {
    var kind = k === 'movie' ? 'movies' : 'shows';
    return cachedList('top:' + slug, 7 * 86400000, function () {
      return traktReq('GET', '/users/justin/lists/' + slug + '/items/' + kind, null, false).then(function (list) {
        var items = (list || []).filter(function (o) { var x = o.movie || o.show; return x && x.ids && x.ids.imdb; })
          .sort(function (a, b) { return (a.rank || 0) - (b.rank || 0); }).map(function (o) {
            var x = o.movie || o.show;
            return { id: x.ids.imdb, n: x.title, y: x.year || 0 };
          });
        return { items: items };
      });
    }).then(function (d) { return listMetas(d.items, k === 'movie' ? 'movie' : 'series'); });
  }

  // ---------------------------------------------------------------- pantallas: anime, películas y series

  // lo que carga cada fila (función: si falla por la red, la fila se vuelve a pedir sola al volver)
  // anime: animación japonesa (TMDB y Cinemeta) o con el género «anime» de Trakt
  var TMDB_ANIME = '&with_genres=16&with_original_language=ja';
  function pageRowLoader(page, r) {
    var k = page === 'movies' ? 'movie' : 'tv', now = Date.now(), today = isoDay(now), anime = page === 'anime';
    // en Películas y Series, sin anime (para eso está su pestaña)
    var seen = function (list) {
      return Promise.all([list, seenReady()]).then(function (x) {
        var metas = filterSeen(x[0] || []);
        return page === 'home' || anime ? metas : metas.filter(function (m) { return !isAnimeMeta(m); });
      });
    };
    var tmdb = function (path) { return function () { return seen(tmdbList(path, k)); }; };
    if (r.catalog) {
      var c = r.catalog;
      return function () { return seen(getJSON(c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '.json').then(function (d) { return d.metas; })); };
    }
    if (r.url) return function () { return seen(getJSON(r.url).then(function (d) { return d.metas; })); };
    // listas famosas y premios: la Top 250 sin lo visto (si se oculta lo visto); los premios, enteros (✓ en lo visto)
    if (r.top) return function () { return seen(topList(r.top, k)); };
    if (r.award) return function () { return awardRow(r); };
    if (r.wins) return function () { return winsRow(r); };
    if (r.platform) {
      return function () {
        return seen(platformId(k, r.platform).then(function (id) {
          return id ? tmdbList('/discover/' + k + '?sort_by=popularity.desc' + platformParams(id) + (anime ? TMDB_ANIME : k === 'tv' ? TV_JUNK : ''), k) : [];
        }));
      };
    }
    switch (r.k) {
      // recomendaciones de Trakt sin nada visto ni empezado (aunque no se oculte lo visto); en Anime, las de series y
      // películas que son anime, y en Películas y Series, las que no
      case 'forYou': return function () {
        var kinds = anime ? ['shows', 'movies'] : [page === 'movies' ? 'movies' : 'shows'];
        return Promise.all(kinds.map(function (kd) { return Trakt.recommendations(kd); }).concat([seenReady(true)])).then(function (x) {
          var all = [];
          kinds.forEach(function (kd, i) { all = all.concat(x[i]); });
          return all.filter(function (m) { return isUnseen(m) && (anime ? m.anime : !m.anime); });
        });
      };
      case 'trending': return tmdb('/trending/' + k + '/week');
      case 'airing': return tmdb('/discover/tv?air_date.gte=' + isoDay(now - 7 * 86400000) + '&air_date.lte=' + today + '&sort_by=popularity.desc&vote_count.gte=50' + TV_JUNK);
      case 'new':
        if (anime) return tmdb('/discover/tv?first_air_date.gte=' + isoDay(now - 120 * 86400000) + '&first_air_date.lte=' + today + '&sort_by=popularity.desc' + TMDB_ANIME);
        return k === 'tv'
          ? tmdb('/discover/tv?first_air_date.gte=' + isoDay(now - 120 * 86400000) + '&first_air_date.lte=' + today + '&sort_by=popularity.desc&vote_count.gte=10' + TV_JUNK)
          // estrenadas en digital (alquiler, compra o plataforma) en España en los últimos 4 meses
          : tmdb('/discover/movie?region=ES&with_release_type=4%7C5&release_date.gte=' + isoDay(now - 120 * 86400000) + '&release_date.lte=' + today + '&sort_by=popularity.desc&vote_count.gte=10');
      case 'cinema': return tmdb('/movie/now_playing?region=ES');
    }
    return function () { return Promise.resolve([]); };
  }

  // Anime, Películas o Series: cabecera grande y las filas elegidas (Ajustes → General → Filas de …)
  function catalogScreen(page) {
    var hs = heroScreen(page), root = hs.root, vs = hs.vs, sig = '';
    var screen = { el: root, initialFocus: activeTab(root) };
    function layout() {
      var rows = pageRows(page);
      sig = rowsKey(rows) + settings.tmdbKey;
      vs.innerHTML = '';
      scrollTop0(vs);
      rows.forEach(function (r) { if (!r.hidden) promiseRow(vs, r.title, pageRowLoader(page, r), openMeta, true, r.max); });
    }
    layout();
    screen.onShow = function () { primeHero(vs); };
    screen.onResume = function () {
      if (rowsKey(pageRows(page)) + settings.tmdbKey === sig) return;
      layout();
      screen.lastFocus = null;
      if (root._hero) root._hero.cur = null;
    };
    return screen;
  }
