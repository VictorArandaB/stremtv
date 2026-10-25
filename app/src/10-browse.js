  // ---------------------------------------------------------------- explorar (en Buscar)

  var GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
    'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'];
  var GENRES_ES = { Action: 'Acción', Adventure: 'Aventura', Animation: 'Animación', Biography: 'Biografía', Comedy: 'Comedia',
    Crime: 'Crimen', Documentary: 'Documental', Drama: 'Drama', Family: 'Familia', Fantasy: 'Fantasía', History: 'Historia',
    Horror: 'Terror', Mystery: 'Misterio', Romance: 'Romance', 'Sci-Fi': 'Ciencia ficción', Sport: 'Deporte', Thriller: 'Suspense',
    War: 'Bélica', Western: 'Western' };

  // géneros de TMDB (en series hay menos: acción y aventura van juntas, igual que ciencia ficción y fantasía)
  var TMDB_GENRES = {
    movie: { Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14,
      History: 36, Horror: 27, Mystery: 9648, Romance: 10749, 'Sci-Fi': 878, Thriller: 53, War: 10752, Western: 37 },
    tv: { Action: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Mystery: 9648,
      'Sci-Fi': 10765, War: 10768, Western: 37 }
  };
  var GENRES_TV_ES = { Action: 'Acción y aventura', 'Sci-Fi': 'Ciencia ficción y fantasía', War: 'Bélica y política' };
  var GENRES_TV_EN = { Action: 'Action & Adventure', 'Sci-Fi': 'Sci-Fi & Fantasy', War: 'War & Politics' };

  // Buscar sin escribir nada: explorar con filtros. Con clave de TMDB, todos (tipo, género, año o década, nota mínima,
  // plataforma, orden y solo sin ver); sin ella, los catálogos de Cinemeta (un año suelto, sin plataforma ni estrenos)
  function discoverFilters(wrap) {
    var f = extend({ type: 'movie', genre: '', year: '', rating: '', platform: '', sort: 'pop', unseen: false }, load('explore', {}));
    if (f.sort === 'top') f.sort = 'pop'; // filtros guardados por la versión anterior
    if (f.sort === 'imdbRating') f.sort = 'rated';
    if (/^\d{4}$/.test(f.year)) f.year = 'Y' + f.year;
    var filters = el('div'), results = el('div', 'grid');
    wrap.appendChild(filters);
    wrap.appendChild(results);
    var cards = [], page = 0, fetched = 0, loading = false, more = null, emptyPages = 0, gen = 0;
    var tmdb = !!settings.tmdbKey, cur = new Date().getFullYear();

    function opts() {
      var k = f.type === 'movie' ? 'movie' : 'tv', en = settings.lang === 'en';
      var genres = tmdb ? GENRES.filter(function (g) { return TMDB_GENRES[k][g]; }) : GENRES;
      var years = [''];
      if (tmdb) {
        years.push('Y' + cur, 'Y' + (cur - 1), 'Y' + (cur - 2));
        for (var d = Math.floor(cur / 10) * 10; d >= 1980; d -= 10) years.push('D' + d);
        years.push('B1980');
      } else for (var y = cur; y >= 1987; y--) years.push('Y' + y);
      return [
        [tr('Tipo'), 'type', ['movie', 'series'], function (v) { return v === 'movie' ? tr('Películas') : tr('Series'); }],
        [tr('Género'), 'genre', [''].concat(genres), function (v) {
          if (!v) return tr('Todos');
          if (tmdb && k === 'tv' && (en ? GENRES_TV_EN : GENRES_TV_ES)[v]) return (en ? GENRES_TV_EN : GENRES_TV_ES)[v];
          return en ? v : GENRES_ES[v] || v;
        }],
        [tr('Año'), 'year', years, function (v) {
          if (!v) return tr('Todos');
          var n = +v.slice(1);
          if (v[0] === 'D') return n >= 2000 ? tr('Años {0}', n) : tr('Años {0}', String(n).slice(2));
          if (v[0] === 'B') return tr('Antes de {0}', n);
          return String(n);
        }],
        [tr('Nota mínima'), 'rating', ['', '6', '7', '7.5', '8'], function (v) { return v ? '★ ' + num(v) + '+' : tr('Cualquiera'); }],
        tmdb ? [tr('Plataforma'), 'platform', [''].concat(PLATFORMS.map(function (p) { return p.k; })), function (v) {
          return v ? PLATFORMS.filter(function (p) { return p.k === v; })[0].name : tr('Todas');
        }] : null,
        [tr('Orden'), 'sort', tmdb ? ['pop', 'rated', 'new'] : ['pop', 'rated'], function (v) {
          return v === 'pop' ? tr('Populares') : v === 'rated' ? tr('Mejor valoradas') : tr('Más recientes');
        }],
        [tr('Mostrar'), 'unseen', [false, true], function (v) { return v ? tr('Solo sin ver') : tr('Todo'); }]
      ].filter(Boolean);
    }

    function paint(focusKey) {
      filters.innerHTML = '';
      var target = null;
      opts().forEach(function (o) {
        var key = o[1];
        if (o[2].indexOf(f[key]) < 0) f[key] = o[2][0]; // ya no vale (otro tipo u otro modo)
        var row = el('div', 'row chips-row');
        row.appendChild(el('div', 'row-title', esc(o[0])));
        var sc = el('div', 'hscroll chips');
        sc.style.position = 'relative';
        o[2].forEach(function (v) {
          var b = el('div', 'btn' + (f[key] === v ? ' primary' : ''), esc(o[3](v)));
          focusable(b, function () {
            if (f[key] === v) return;
            f[key] = v;
            save('explore', f);
            // al cambiar de tipo cambian los géneros: se rehacen los filtros con el foco en el mismo botón
            if (key === 'type') paint(key);
            else {
              Array.prototype.forEach.call(sc.children, function (x) { x.classList.remove('primary'); });
              b.classList.add('primary');
            }
            reload();
          });
          sc.appendChild(b);
          if (f[key] === v) { sc._last = b; if (key === focusKey) target = b; } // al bajar a esta fila, ir a la opción elegida
        });
        row.appendChild(sc);
        filters.appendChild(row);
      });
      save('explore', f);
      if (target) Nav.focus(target);
    }

    // TMDB: una página de /discover con todos los filtros
    function tmdbUrl(n) {
      var k = f.type === 'movie' ? 'movie' : 'tv', field = k === 'movie' ? 'primary_release_date' : 'first_air_date';
      var p = '/discover/' + k + '?include_adult=false&page=' + n, gte = '', lte = '', y = +f.year.slice(1);
      if (f.year[0] === 'Y') { gte = y + '-01-01'; lte = y + '-12-31'; }
      else if (f.year[0] === 'D') { gte = y + '-01-01'; lte = (y + 9) + '-12-31'; }
      else if (f.year[0] === 'B') lte = (y - 1) + '-12-31';
      var votes = f.rating ? 100 : 0;
      if (f.sort === 'rated') { p += '&sort_by=vote_average.desc'; votes = k === 'movie' ? 500 : 200; }
      else if (f.sort === 'new') {
        p += '&sort_by=' + field + '.desc';
        votes = Math.max(votes, 20);
        var today = isoDay(Date.now());
        if (!lte || lte > today) lte = today; // nada aún sin estrenar
      } else p += '&sort_by=popularity.desc';
      if (gte) p += '&' + field + '.gte=' + gte;
      if (lte) p += '&' + field + '.lte=' + lte;
      if (votes) p += '&vote_count.gte=' + votes;
      if (f.rating) p += '&vote_average.gte=' + f.rating;
      if (f.genre) p += '&with_genres=' + TMDB_GENRES[k][f.genre];
      if (k === 'tv') p += TV_JUNK;
      if (!f.platform) return Promise.resolve(p);
      return platformId(k, PLATFORMS.filter(function (x) { return x.k === f.platform; })[0]).then(function (id) { return p + platformParams(id || 0); });
    }
    // Cinemeta no combina género y año: con año se pide el catálogo del año y el género se filtra aquí
    function cinemetaUrl() {
      var extra = [], y = f.year.slice(1);
      if (y) extra.push('genre=' + y);
      else if (f.genre) extra.push('genre=' + encodeURIComponent(f.genre));
      if (fetched) extra.push('skip=' + fetched);
      var cat = y ? 'year' : f.sort === 'rated' ? 'imdbRating' : 'top';
      return CINEMETA + '/catalog/' + f.type + '/' + cat + (extra.length ? '/' + extra.join('&') : '') + '.json';
    }
    function fetchPage() {
      if (tmdb) {
        page++;
        return tmdbUrl(page).then(function (u) { return tmdbPage(u, f.type === 'movie' ? 'movie' : 'tv'); });
      }
      return getJSON(cinemetaUrl()).then(function (d) {
        var raw = d.metas || [];
        fetched += raw.length;
        var metas = raw;
        if (f.year && f.genre) metas = metas.filter(function (m) { return (m.genre || m.genres || []).indexOf(f.genre) >= 0; });
        if (f.rating) metas = metas.filter(function (m) { return parseFloat(m.imdbRating) >= +f.rating; });
        if (f.year && f.sort === 'rated') metas.sort(function (a, b) { return (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0); });
        return { metas: metas, more: raw.length >= 20 };
      });
    }

    function reload() {
      results.innerHTML = '';
      cards = []; page = 0; fetched = 0; more = null; emptyPages = 0;
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
      Promise.all([fetchPage(), seenReady(f.unseen)]).then(function (r) {
        if (g !== gen) return; // filtros cambiados mientras cargaba
        loading = false;
        results.removeChild(status);
        var metas = f.unseen ? r[0].metas.filter(isUnseen) : filterSeen(r[0].metas);
        metas.forEach(function (m) {
          var i = cards.length;
          var c = card(m, function () { openMeta(m); });
          c._onfocus = function () { loadImages(cards, i + 14); };
          cards.push(c);
          results.appendChild(c);
        });
        loadImages(cards, first + 13);
        // con filtros que quitan mucho puede que una página entera no tenga ninguno: seguir buscando un poco
        if (!metas.length && r[0].more && ++emptyPages < 4) { loadPage(hadFocus); return; }
        if (r[0].more) {
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
          if (tmdb) page--;
          loadPage(hadFocus);
        });
      });
    }
    paint();
    loadPage();
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
      if (!trim(input.value)) { run(''); return; } // borrado: vuelven los filtros
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
    // sin nada escrito, explorar con filtros
    var explore = el('div');
    explore.appendChild(el('div', 'screen-title settings-title', esc(tr('Explorar'))));
    vs.appendChild(explore);
    discoverFilters(explore);

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
      explore.style.display = q ? 'none' : '';
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
