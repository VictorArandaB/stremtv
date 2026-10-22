  // ---------------------------------------------------------------- pantalla: inicio

  function clockText(d) { return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  // un solo temporizador para todos los relojes (cabeceras y reproductor)
  setInterval(function () {
    var t = clockText(new Date());
    Array.prototype.forEach.call(document.querySelectorAll('.clock'), function (c) { if (c.textContent !== t) c.textContent = t; });
  }, 10000);

  function header(active) {
    var h = el('div', 'header');
    h.appendChild(el('div', 'logo', 'StremTV'));
    [['home', 'Inicio'], ['anime', 'Anime'], ['explore', 'Explorar'], ['search', 'Buscar'], ['settings', 'Ajustes']].forEach(function (t) {
      var tab = el('div', 'tab' + (t[0] === active ? ' active' : ''), tr(t[1]));
      focusable(tab, function () {
        if (t[0] === active) return;
        if (t[0] === 'search') push(searchScreen());
        else if (t[0] === 'anime') push(animeScreen());
        else if (t[0] === 'explore') push(exploreScreen());
        else if (t[0] === 'settings') openSettings();
        else while (stack.length > 1) pop();
      });
      h.appendChild(tab);
    });
    h.appendChild(el('div', 'clock', clockText(new Date())));
    return h;
  }

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

  function homeScreen() {
    var hs = heroScreen('home'), root = hs.root, vs = hs.vs;
    var contWrap = el('div');
    vs.appendChild(contWrap);

    function renderTop() {
      contWrap.innerHTML = '';
      var noSources = !hasSources();
      if (noSources || !settings.key) {
        var warn = el('div', 'row');
        var b = el('div', 'btn primary', noSources ? tr('Añade un addon de fuentes en Ajustes → Fuentes y debrid para poder reproducir')
          : tr('Configura tu Real-Debrid o AllDebrid para poder reproducir'));
        b.style.marginLeft = '80px';
        focusable(b, function () { openSettings('sources'); });
        warn.appendChild(b);
        contWrap.appendChild(warn);
      }
      if (CERT_EXPIRES - Date.now() < 30 * 86400000) {
        var cw = el('div', 'row');
        cw.appendChild(el('div', 'note cert-warn', esc(tr('⚠ El certificado de StremTV caduca el {0}. Si deja de abrirse, hay que volver a firmarla e instalarla desde el Mac.', fmtDate(CERT_EXPIRES)))));
        contWrap.appendChild(cw);
      }
      var cont = continueList();
      if (cont.length) {
        contWrap.appendChild(posterRow(tr('Continuar viendo'), cont.map(function (p) {
          return { id: p.metaId, type: p.type, name: p.name, poster: p.poster };
        }), function (m, i) {
          var p = cont[i];
          if (p.type === 'movie') resumeMovie(p);
          else push(detailScreen(p.type, p.metaId));
        }, cont.map(function (p) { return { pct: p.t / p.d, label: p.label || p.name }; })));
      }
      var mine = Trakt.linked() ? [] : myListMetas(); // con Trakt, su lista sale más abajo
      if (mine.length) contWrap.appendChild(posterRow(tr('Mi lista'), mine, openMeta));
    }
    renderTop();

    var traktWrap = el('div');
    vs.appendChild(traktWrap);
    var traktLoaded = 0;
    function renderTrakt() {
      if (!Trakt.linked()) { traktWrap.innerHTML = ''; traktLoaded = 0; return; }
      if (Date.now() - traktLoaded < 120000) return; // como mucho cada 2 minutos
      traktLoaded = Date.now();
      traktWrap.innerHTML = '';
      var local = {};
      continueList().forEach(function (p) { local[p.metaId] = true; });
      var paused = Trakt.playback().then(function (items) {
        var seen = {};
        return items.filter(function (m) {
          if (local[m.id] || seen[m.id]) return false; // ya está en «Continuar viendo»
          seen[m.id] = true;
          return true;
        });
      });
      promiseRow(traktWrap, tr('Continuar (Trakt)'), paused, openMeta, true);
      // series con el siguiente episodio pendiente (sin repetir las que ya salen arriba)
      promiseRow(traktWrap, tr('Siguientes episodios'), Promise.all([Trakt.upNext(), paused.catch(function () { return []; })]).then(function (r) {
        var above = {};
        r[1].forEach(function (m) { above[m.id] = true; });
        return r[0].filter(function (m) { return !local[m.id] && !above[m.id]; });
      }), openMeta, true, 100);
      promiseRow(traktWrap, tr('Esta semana en tus series'), Trakt.calendar(), openMeta, true);
      var wl = Trakt.loadWatchlist();
      promiseRow(traktWrap, tr('Mi lista: películas'), wl.then(function (m) { return m.filter(function (x) { return x.type === 'movie'; }); }), openMeta, true, 100);
      promiseRow(traktWrap, tr('Mi lista: series'), wl.then(function (m) { return m.filter(function (x) { return x.type === 'series'; }); }), openMeta, true, 100);
      var seenThen = function (pr) { return Promise.all([pr, seenReady()]).then(function (r) { return filterSeen(r[0]); }); };
      promiseRow(traktWrap, tr('Recomendadas para ti: películas'), seenThen(Trakt.recommendations('movies')), openMeta, true);
      promiseRow(traktWrap, tr('Recomendadas para ti: series'), seenThen(Trakt.recommendations('shows')), openMeta, true);
    }
    renderTrakt();

    // con Trakt vinculado, sus filas van arriba: los catálogos generales (fuera de pantalla) esperan 1,5 s
    // para no competir con ellas por la red y el procesador de la tele al arrancar
    var generalRows = el('div');
    vs.appendChild(generalRows);
    function loadGeneral() {
      asyncRow(generalRows, tr('Películas populares'), CINEMETA + '/catalog/movie/top.json', openMeta);
      asyncRow(generalRows, tr('Series populares'), CINEMETA + '/catalog/series/top.json', openMeta);
      asyncRow(generalRows, tr('Películas mejor valoradas'), CINEMETA + '/catalog/movie/imdbRating.json', openMeta);
      asyncRow(generalRows, tr('Series mejor valoradas'), CINEMETA + '/catalog/series/imdbRating.json', openMeta);
    }
    if (Trakt.linked()) setTimeout(loadGeneral, 1500); else loadGeneral();
    // lo último visto: de Trakt si está vinculado (incluye otros dispositivos) o, si no, de esta tele
    var histWrap = el('div');
    vs.insertBefore(histWrap, traktWrap.nextSibling);
    var histLoaded = 0;
    function renderHistory() {
      if (Trakt.linked() && Date.now() - histLoaded < 120000) return;
      histLoaded = Date.now();
      histWrap.innerHTML = '';
      promiseRow(histWrap, tr('Visto recientemente'), Trakt.linked() ? Trakt.history() : Promise.resolve(localHistory()), openMeta, true, 30);
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
    renderHistory();

    // catálogos de los addons añadidos: como mucho 4 filas por addon para no llenar el inicio
    var perAddon = {};
    addonCatalogs(false).forEach(function (c) {
      var n = perAddon[c.addon.url] = (perAddon[c.addon.url] || 0) + 1;
      if (n > 4) return;
      // si el catálogo viene vacío o el addon falla, la fila desaparece
      promiseRow(vs, c.title, Promise.all([getJSON(c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '.json'), seenReady()]).then(function (r) {
        return filterSeen(r[0].metas || []);
      }), openMeta, true);
    });

    return { el: root, onShow: function () { primeHero(vs); }, onResume: function () {
      renderTop(); renderTrakt(); renderHistory();
      // si se acaba de poner la clave de TMDB, traducir las tarjetas que ya se ven
      Array.prototype.forEach.call(root.querySelectorAll('.card'), function (c) { if (c._loaded || !c._img) nameCard(c); });
    } };
  }

  function resumeMovie(p) {
    // pasar por el detalle permite elegir otra fuente si la guardada caducó
    push(detailScreen('movie', p.metaId));
  }

  // ---------------------------------------------------------------- pantalla: anime

  function animeScreen() {
    var hs = heroScreen('anime'), root = hs.root, vs = hs.vs;
    asyncRow(vs, tr('En emisión esta temporada'), ANIME + '/catalog/anime/kitsu-anime-airing.json', openMeta);
    asyncRow(vs, tr('Tendencias'), ANIME + '/catalog/anime/kitsu-anime-trending.json', openMeta);
    asyncRow(vs, tr('Más populares'), ANIME + '/catalog/anime/kitsu-anime-popular.json', openMeta);
    asyncRow(vs, tr('Mejor valorados'), ANIME + '/catalog/anime/kitsu-anime-rating.json', openMeta);
    return { el: root, initialFocus: function () { return root.querySelectorAll('.tab')[1]; } };
  }
