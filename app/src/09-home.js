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
  // trakt: solo con Trakt vinculado; local: solo sin él; tmdb: solo con clave de TMDB; season: sin dato, visible solo en diciembre y enero
  var PAGE_ROWS = {
    home: [
      { k: 'cont', name: 'Continuar viendo' },
      { k: 'wrapped', name: 'Tu año en StremTV', season: true }, // recuadro que abre el resumen del año
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
      { k: 'top', name: 'Mejor valoradas', url: CINEMETA + '/catalog/series/imdbRating.json' }
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
      { k: 'top', name: 'Mejor valoradas', url: CINEMETA + '/catalog/movie/imdbRating.json' }
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
    var all = PAGE_ROWS[page].filter(function (r) { return !(r.trakt && !linked) && !(r.local && linked) && !(r.tmdb && !tmdb); })
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
      r.hidden = hidden[r.k] === undefined ? !!(r.off || (r.offIfTrakt && linked) || (r.season && !wrappedSeason())) : !!hidden[r.k];
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
      if (slot('wrapped')) yearTile(slot('wrapped'));
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
      if (slots.wrapped && slots.wrapped._paint) slots.wrapped._paint(); // lo recién calculado en su pantalla
      // si se acaba de poner la clave de TMDB, traducir las tarjetas que ya se ven
      Array.prototype.forEach.call(root.querySelectorAll('.card'), function (c) { if (c._loaded || !c._img) nameCard(c); });
    };
    return screen;
  }

  function resumeMovie(p) {
    // pasar por el detalle permite elegir otra fuente si la guardada caducó
    push(detailScreen('movie', p.metaId));
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
      rows.forEach(function (r) { if (!r.hidden) promiseRow(vs, r.title, pageRowLoader(page, r), openMeta, true); });
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
