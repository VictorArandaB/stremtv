  // ---------------------------------------------------------------- pantalla: explorar (tipo, género, año)

  var GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
    'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'];
  var GENRES_ES = { Action: 'Acción', Adventure: 'Aventura', Animation: 'Animación', Biography: 'Biografía', Comedy: 'Comedia',
    Crime: 'Crimen', Documentary: 'Documental', Drama: 'Drama', Family: 'Familia', Fantasy: 'Fantasía', History: 'Historia',
    Horror: 'Terror', Mystery: 'Misterio', Romance: 'Romance', 'Sci-Fi': 'Ciencia ficción', Sport: 'Deporte', Thriller: 'Suspense',
    War: 'Bélica', Western: 'Western' };

  function exploreScreen() {
    var f = extend({ type: 'movie', genre: '', year: '', sort: 'top' }, load('explore', {}));
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('explore'));
    var filters = el('div');
    vs.appendChild(filters);
    var results = el('div', 'grid');
    vs.appendChild(results);
    var cards = [], fetched = 0, loading = false, more = null, emptyPages = 0, gen = 0;

    function chips(title, values, key, label) {
      var row = el('div', 'row chips-row');
      row.appendChild(el('div', 'row-title', esc(title)));
      var sc = el('div', 'hscroll chips');
      sc.style.position = 'relative';
      values.forEach(function (v) {
        var b = el('div', 'btn' + (f[key] === v ? ' primary' : ''), esc(label(v)));
        focusable(b, function () {
          if (f[key] === v) return;
          f[key] = v;
          save('explore', f);
          Array.prototype.forEach.call(sc.children, function (x) { x.classList.remove('primary'); });
          b.classList.add('primary');
          reload();
        });
        sc.appendChild(b);
        if (f[key] === v) sc._last = b; // al bajar a esta fila, ir a la opción elegida
      });
      row.appendChild(sc);
      filters.appendChild(row);
    }

    var years = [''];
    for (var y = new Date().getFullYear(); y >= 1987; y--) years.push(String(y));
    chips(tr('Tipo'), ['movie', 'series'], 'type', function (v) { return v === 'movie' ? tr('Películas') : tr('Series'); });
    chips(tr('Género'), [''].concat(GENRES), 'genre', function (v) { return !v ? tr('Todos') : settings.lang === 'en' ? v : GENRES_ES[v] || v; });
    chips(tr('Año'), years, 'year', function (v) { return v || tr('Todos'); });
    chips(tr('Orden'), ['top', 'imdbRating'], 'sort', function (v) { return v === 'top' ? tr('Populares') : tr('Mejor valoradas'); });

    // Cinemeta no combina género y año: con año se pide el catálogo del año y el género se filtra aquí
    function url() {
      var extra = [];
      if (f.year) extra.push('genre=' + f.year);
      else if (f.genre) extra.push('genre=' + encodeURIComponent(f.genre));
      if (fetched) extra.push('skip=' + fetched);
      return CINEMETA + '/catalog/' + f.type + '/' + (f.year ? 'year' : f.sort) + (extra.length ? '/' + extra.join('&') : '') + '.json';
    }

    function reload() {
      results.innerHTML = '';
      cards = []; fetched = 0; more = null; emptyPages = 0;
      loading = false;
      gen++; // las respuestas de los filtros anteriores se descartan
      loadPage();
    }

    function loadPage(keepFocus) {
      if (loading) return;
      loading = true;
      var hadFocus = keepFocus === true || (more && Nav.cur === more);
      if (more && more.parentNode) more.parentNode.removeChild(more);
      more = null;
      var status = el('div', 'empty', tr('Cargando…'));
      results.appendChild(status);
      var g = gen, first = cards.length;
      Promise.all([getJSON(url()), seenReady()]).then(function (r) {
        if (g !== gen) return; // filtros cambiados mientras cargaba
        loading = false;
        results.removeChild(status);
        var raw = r[0].metas || [];
        fetched += raw.length;
        var metas = filterSeen(raw);
        if (f.year && f.genre) metas = metas.filter(function (m) { return (m.genre || m.genres || []).indexOf(f.genre) >= 0; });
        if (f.year && f.sort === 'imdbRating') metas.sort(function (a, b) { return (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0); });
        metas.forEach(function (m) {
          var i = cards.length;
          var c = card(m, function () { openMeta(m); });
          c._onfocus = function () { loadImages(cards, i + 14); };
          cards.push(c);
          results.appendChild(c);
        });
        loadImages(cards, first + 13);
        var hasMore = raw.length >= 20;
        // con año y género puede que una página entera no tenga ninguno: seguir buscando un poco
        if (!metas.length && hasMore && ++emptyPages < 4) { loadPage(hadFocus); return; }
        if (hasMore) {
          more = el('div', 'btn', tr('Cargar más'));
          focusable(more, loadPage);
          results.appendChild(more);
        }
        if (!cards.length) results.appendChild(el('div', 'empty', tr('Sin resultados')));
        if (hadFocus && (cards[first] || more)) Nav.focus(cards[first] || more);
      }).catch(function (e) {
        if (g !== gen) return;
        loading = false;
        status.textContent = tr('No se pudo cargar ({0})', e.message);
        // sin red: la misma página otra vez al volver, si no se han cambiado los filtros ni se ha cerrado
        if (e.status === 0) Net.whenBack(function () {
          if (g !== gen || loading || !document.body.contains(status)) return;
          results.removeChild(status);
          loadPage(hadFocus);
        });
      });
    }
    loadPage();

    return { el: root, initialFocus: function () { return vs.querySelectorAll('.tab')[2]; } };
  }

  // ---------------------------------------------------------------- pantalla: más como esto

  // recomendaciones de TMDB (en español) o, si no hay, títulos relacionados de Trakt
  function similarTitles(type, imdb) {
    var fromTrakt = function () {
      if (!trakt.clientId) return [];
      return traktReq('GET', '/' + (type === 'movie' ? 'movies' : 'shows') + '/' + imdb + '/related?limit=40', null, false).then(function (list) {
        return (list || []).filter(function (o) { return o.ids && o.ids.imdb; }).map(function (o) {
          return { id: o.ids.imdb, type: type, name: o.title, poster: metahubPoster(o.ids.imdb) };
        });
      });
    };
    if (!tmdbOn()) return Promise.resolve(fromTrakt());
    return tmdbFind(imdb).then(function (r) {
      if (!r.id) return [];
      return tmdbGet('/' + r.k + '/' + r.id + '/recommendations').then(function (d) {
        return (d.results || []).map(function (x) {
          return { id: 'tmdb:' + r.k + ':' + x.id, type: type, name: x.title || x.name, poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '' };
        });
      });
    }).then(function (list) { return list.length ? list : fromTrakt(); }, fromTrakt);
  }

  function similarScreen(type, imdb, name) {
    return gridScreen(tr('Más como «{0}»', name), similarTitles(type, imdb));
  }

  // películas y series de un actor (TMDB), de la más conocida a la menos
  function personScreen(id, name) {
    return gridScreen(name, tmdbGet('/person/' + id + '/combined_credits').then(function (d) {
      var seen = {};
      return (d.cast || []).filter(function (x) {
        var k = x.media_type + x.id;
        if ((x.media_type !== 'movie' && x.media_type !== 'tv') || seen[k]) return false;
        seen[k] = true;
        return true;
      }).sort(function (a, b) { return (b.vote_count || 0) - (a.vote_count || 0); }).slice(0, 60).map(function (x) {
        return { id: 'tmdb:' + x.media_type + ':' + x.id, type: x.media_type === 'movie' ? 'movie' : 'series', name: x.title || x.name,
          poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '' };
      });
    }));
  }

  function collectionScreen(id, name) {
    return gridScreen(name, tmdbCollection(id), true);
  }

  // keepSeen: sin quitar lo visto aunque esté puesto «ocultar lo visto» (en una saga, las vistas salen con ✓)
  function gridScreen(title, promise, keepSeen) {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(el('div', 'screen-title', esc(title)));
    var grid = el('div', 'grid');
    vs.appendChild(grid);
    var status = el('div', 'empty', tr('Cargando…'));
    grid.appendChild(status);
    Promise.all([promise, seenReady()]).then(function (r) {
      var metas = keepSeen ? r[0].filter(Boolean) : filterSeen(r[0]), cards = [];
      grid.innerHTML = '';
      if (!metas.length) { grid.appendChild(el('div', 'empty', tr('Sin resultados'))); return; }
      metas.forEach(function (m, i) {
        var c = card(m, function () { openMeta(m); });
        c._onfocus = function () { loadImages(cards, i + 14); };
        cards.push(c);
        grid.appendChild(c);
      });
      loadImages(cards, 13);
      if (Nav.root === root) Nav.setRoot(root, cards[0]);
    }).catch(function (e) { status.textContent = tr('No se pudo cargar ({0})', e.message); });
    return { el: root };
  }

  // ---------------------------------------------------------------- pantalla: búsqueda

  function searchScreen() {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('search'));
    var box = el('div', 'search-box');
    var input = el('input');
    input.type = 'text';
    input.placeholder = tr('Título de película o serie…');
    focusable(input, function () { input.focus(); });
    var lastRun = null, liveTimer = null;
    input._ondone = function (q) {
      clearTimeout(liveTimer);
      remember(q);
      if (trim(q) !== lastRun) run(q);
    };
    // resultados mientras se escribe: a partir de 3 letras, cuando se deja de teclear un momento
    input.addEventListener('input', function () {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () {
        var q = trim(input.value);
        if (q.length >= 3 && q !== lastRun) run(q);
      }, 800);
    });
    box.appendChild(input);
    vs.appendChild(box);
    vs.appendChild(el('div', 'hint', tr('Pulsa OK para escribir y confirma con «Hecho».')));
    var recent = el('div');
    vs.appendChild(recent);
    var results = el('div');
    vs.appendChild(results);

    function trim(q) { return (q || '').replace(/^\s+|\s+$/g, ''); }

    // últimas 12 búsquedas, la más reciente primero
    var recentQs = load('searches', []);
    function remember(q) {
      q = trim(q);
      if (!q) return;
      recentQs = [q].concat(recentQs.filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); })).slice(0, 12);
      save('searches', recentQs);
      paintRecent();
    }
    function paintRecent() {
      recent.innerHTML = '';
      if (!recentQs.length) return;
      var row = el('div', 'row chips-row');
      row.appendChild(el('div', 'row-title', esc(tr('Búsquedas recientes'))));
      var sc = el('div', 'hscroll chips');
      sc.style.position = 'relative';
      recentQs.forEach(function (q) {
        var b = el('div', 'btn', esc(q));
        focusable(b, function () { input.value = q; remember(q); run(q); });
        sc.appendChild(b);
      });
      var clear = el('div', 'btn', esc(tr('Borrar')));
      focusable(clear, function () { recentQs = []; save('searches', recentQs); paintRecent(); Nav.focus(input); });
      sc.appendChild(clear);
      row.appendChild(sc);
      recent.appendChild(row);
    }
    paintRecent();

    // abrir un resultado también guarda la búsqueda (aunque no se pulsara «Hecho»)
    function pick(m) { remember(lastRun); openMeta(m); }

    function run(q) {
      q = trim(q);
      lastRun = q;
      results.innerHTML = '';
      if (!q) return;
      var enc = encodeURIComponent(q);
      if (tmdbOn()) {
        promiseRow(results, tr('Resultados en español (TMDB)'), tmdbGet('/search/multi?include_adult=false&query=' + enc).then(function (d) {
          return (d.results || []).filter(function (x) { return x.media_type === 'movie' || x.media_type === 'tv'; }).map(function (x) {
            return { id: 'tmdb:' + x.media_type + ':' + x.id, type: x.media_type === 'movie' ? 'movie' : 'series', name: x.title || x.name,
              poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '' };
          });
        }), pick, true);
      }
      asyncRow(results, tr('Películas'), CINEMETA + '/catalog/movie/top/search=' + enc + '.json', pick);
      asyncRow(results, tr('Series'), CINEMETA + '/catalog/series/top/search=' + enc + '.json', pick);
      asyncRow(results, tr('Anime'), ANIME + '/catalog/anime/kitsu-anime-list/search=' + enc + '.json', pick);
      addonCatalogs(true).forEach(function (c) {
        asyncRow(results, c.title, c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '/search=' + enc + '.json', pick);
      });
    }

    return { el: root, initialFocus: function () { return input; } };
  }
