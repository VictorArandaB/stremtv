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
  // anime sin clave de TMDB: géneros de Kitsu
  var KITSU_GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Sci-Fi', 'Fantasy', 'Romance', 'Slice of Life', 'Mystery', 'Horror',
    'Psychological', 'Sports', 'Mecha', 'Supernatural', 'School', 'Music'];
  var KITSU_ES = { 'Slice of Life': 'Recuentos de la vida', Psychological: 'Psicológico', Sports: 'Deportes', Mecha: 'Mecha',
    Supernatural: 'Sobrenatural', School: 'Escolar', Music: 'Música' };

  // Buscar sin escribir nada: explorar con filtros. Películas, series y anime por separado (el anime no sale en las otras dos).
  // Con clave de TMDB, todos los filtros (tipo, género, año o década, nota mínima, plataforma, orden y solo sin ver);
  // sin ella, los catálogos de Cinemeta (un año suelto, sin plataforma ni estrenos) y de Kitsu para el anime (sin año)
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
      var k = f.type === 'movie' ? 'movie' : 'tv', en = settings.lang === 'en', kitsu = !tmdb && f.type === 'anime';
      var genres = kitsu ? KITSU_GENRES : tmdb ? GENRES.filter(function (g) { return TMDB_GENRES[k][g] && !(f.type === 'anime' && g === 'Animation'); }) : GENRES;
      var years = [''];
      if (kitsu) years = null;
      else if (tmdb) {
        years.push('Y' + cur, 'Y' + (cur - 1), 'Y' + (cur - 2));
        for (var d = Math.floor(cur / 10) * 10; d >= 1980; d -= 10) years.push('D' + d);
        years.push('B1980');
      } else for (var y = cur; y >= 1987; y--) years.push('Y' + y);
      return [
        [tr('Tipo'), 'type', ['movie', 'series', 'anime'], function (v) { return v === 'movie' ? tr('Películas') : v === 'series' ? tr('Series') : tr('Anime'); }],
        [tr('Género'), 'genre', [''].concat(genres), function (v) {
          if (!v) return tr('Todos');
          if (kitsu) return en ? v : KITSU_ES[v] || GENRES_ES[v] || v;
          if (tmdb && k === 'tv' && (en ? GENRES_TV_EN : GENRES_TV_ES)[v]) return (en ? GENRES_TV_EN : GENRES_TV_ES)[v];
          return en ? v : GENRES_ES[v] || v;
        }],
        years && [tr('Año'), 'year', years, function (v) {
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
      var target = null, list = opts();
      if (!list.some(function (o) { return o[1] === 'year'; })) f.year = '';
      list.forEach(function (o) {
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
      // anime: animación japonesa (y el género elegido, a la vez)
      if (f.type === 'anime') p += '&with_original_language=ja&with_genres=16' + (f.genre ? ',' + TMDB_GENRES.tv[f.genre] : '');
      else if (f.genre) p += '&with_genres=' + TMDB_GENRES[k][f.genre];
      if (k === 'tv') p += TV_JUNK;
      if (!f.platform) return Promise.resolve(p);
      return platformId(k, PLATFORMS.filter(function (x) { return x.k === f.platform; })[0]).then(function (id) { return p + platformParams(id || 0); });
    }
    // Cinemeta no combina género y año: con año se pide el catálogo del año y el género se filtra aquí
    function kitsuUrl() {
      var extra = [];
      if (f.genre) extra.push('genre=' + encodeURIComponent(f.genre));
      if (fetched) extra.push('skip=' + fetched);
      return ANIME + '/catalog/anime/kitsu-anime-' + (f.sort === 'rated' ? 'rating' : 'popular') + (extra.length ? '/' + extra.join('&') : '') + '.json';
    }
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
      return getJSON(f.type === 'anime' ? kitsuUrl() : cinemetaUrl()).then(function (d) {
        var raw = d.metas || [];
        fetched += raw.length;
        var metas = raw;
        if (f.year && f.genre && f.type !== 'anime') metas = metas.filter(function (m) { return (m.genre || m.genres || []).indexOf(f.genre) >= 0; });
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
        if (f.type !== 'anime') metas = metas.filter(function (m) { return !isAnimeMeta(m); }); // el anime, en su tipo
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

  // ---------------------------------------------------------------- buscar desde el móvil

  // Escribir con el mando es lento: Buscar enseña un QR con docs/buscar.html (GitHub Pages de este repo) y, detrás del #,
  // un tema secreto de ntfy.sh (servicio público y gratuito, sin cuenta). Lo que se envía desde el móvil llega por ntfy y
  // se busca en la tele. El # no llega al servidor de la página, así que el tema solo lo saben la tele y el móvil.
  // Solo se escucha mientras Buscar está a la vista; lo enviado antes de abrirla no cuenta
  var PHONE_PAGE = 'https://victorarandab.github.io/stremtv/buscar.html';
  var NTFY = 'https://ntfy.sh';

  // tema de ntfy de esta tele: 24 letras y cifras al azar, creado la primera vez. No va en la copia de seguridad: es
  // de esta tele (otra con la misma copia recibiría también sus búsquedas) y basta con volver a escanear el QR
  function phoneTopic() {
    var t = load('phonetopic', '');
    if (/^[a-z0-9]{24}$/.test(t)) return t;
    var abc = 'abcdefghijklmnopqrstuvwxyz0123456789', rnd = null;
    try { rnd = new Uint8Array(24); window.crypto.getRandomValues(rnd); } catch (e) { rnd = null; }
    t = '';
    for (var i = 0; i < 24; i++) t += abc.charAt((rnd ? rnd[i] : Math.floor(Math.random() * 256)) % abc.length);
    save('phonetopic', t);
    return t;
  }
  function phoneUrl() { return PHONE_PAGE + '#' + phoneTopic(); }

  // Escucha el tema con una conexión que se queda abierta: ntfy manda cada mensaje en una línea JSON en cuanto llega
  // (y un «keepalive» cada 45 s), y onprogress lo va leyendo de responseText (por eso no se usa xhr(), que espera al
  // final). La primera línea («open») trae la hora del servidor: lo anterior a ella no cuenta. Si la conexión se cierra
  // o se queda 2 min callada, se vuelve a abrir pidiendo lo enviado desde el último mensaje (o desde aquella hora),
  // así no se pierde nada entre medias; con errores, cada vez se espera más (hasta 1 min). Una sola petición abierta
  // gasta mucho menos del límite de ntfy para quien no tiene cuenta que preguntar cada pocos segundos.
  // onText(texto) por cada mensaje nuevo; devuelve la función que la para
  function phoneListen(topic, onText) {
    var x = null, stopped = false, t0 = 0, last = '', seen = {}, fails = 0, retry = null, quiet = null;
    function connect() {
      if (stopped) return;
      var since = last || (t0 ? String(t0) : ''), pos = 0;
      var req = x = new XMLHttpRequest();
      req.open('GET', NTFY + '/' + topic + '/json' + (since ? '?since=' + since : ''), true);
      // las líneas completas que hayan llegado desde la última vez
      var read = function () {
        if (req !== x || req.status !== 200) return; // un error (429, 5xx…) también trae JSON: no es un mensaje
        var txt = req.responseText || '', end = txt.lastIndexOf('\n');
        if (end < pos) return;
        var lines = txt.slice(pos, end).split('\n');
        pos = end + 1;
        lines.forEach(function (l) {
          var m = looseJSON(l);
          if (!m) return;
          fails = 0;
          if (m.event === 'open' && !t0) t0 = m.time || 0;
          if (m.event !== 'message' || !m.id || seen[m.id]) return;
          seen[m.id] = true;
          last = m.id;
          if (t0 && m.time < t0) return; // de antes de abrir Buscar
          if (typeof m.message === 'string') onText(m.message);
        });
      };
      var again = function (ms) {
        if (req !== x) return;
        x = null;
        clearTimeout(quiet);
        if (!stopped) retry = setTimeout(connect, ms);
      };
      var awake = function () {
        clearTimeout(quiet);
        quiet = setTimeout(function () { try { req.abort(); } catch (e) { /* ya cerrada */ } again(0); }, 120000);
      };
      req.onprogress = function () { awake(); read(); };
      req.onload = function () {
        read();
        // cerrada por el servidor (o 429 por pasarse del límite): volver a abrirla
        if (req.status === 200) again(2000);
        else again(req.status === 429 ? 60000 : Math.min(60000, 5000 * Math.pow(2, fails++)));
      };
      req.onerror = req.ontimeout = function () { again(Math.min(60000, 5000 * Math.pow(2, fails++))); };
      req.send();
      awake();
    }
    connect();
    return function () {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(quiet);
      var req = x;
      x = null;
      if (req) try { req.abort(); } catch (e) { /* ya cerrada */ }
    };
  }

  // la escucha de la pantalla de Buscar abierta: se para con la app en segundo plano y vuelve al regresar
  var phoneSync = null;
  document.addEventListener('visibilitychange', function () { if (phoneSync) phoneSync(); });

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
    // arriba: el cuadro, la ayuda y las búsquedas recientes, con el QR para escribir desde el móvil a la derecha
    var topRow = el('div', 'search-top'), main = el('div', 'search-main');
    topRow.appendChild(main);
    main.appendChild(box);
    main.appendChild(el('div', 'hint', tr('Pulsa OK para escribir y confirma con «Hecho».')));
    var recent = el('div');
    main.appendChild(recent);
    var qr = el('div', 'phone-qr');
    try {
      var cv = qrCanvas(phoneUrl(), 300);
      qr.appendChild(cv);
      qr.style.width = cv.width + 'px'; // el texto, del ancho del QR
    } catch (e) { logEv('error', 'QR: ' + e); }
    qr.appendChild(el('div', 'phone-qr-text', esc(tr('Escanea con el móvil para escribir desde él'))));
    topRow.appendChild(qr);
    vs.appendChild(topRow);
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
      // anime, películas y series por separado (como las pestañas): el anime solo en su fila. Con TMDB, películas y series
      // salen de su búsqueda (en español); el anime, de Kitsu
      var noAnime = function (url) {
        return function () { return Promise.all([getJSON(url), seenReady()]).then(function (r) { return filterSeen(r[0].metas || []).filter(function (m) { return !isAnimeMeta(m); }); }); };
      };
      asyncRow(results, tr('Anime'), ANIME + '/catalog/anime/kitsu-anime-list/search=' + enc + '.json', pick);
      if (tmdbOn()) {
        var multi = shared(function () {
          return Promise.all([tmdbGet('/search/multi?include_adult=false&query=' + enc), seenReady()]).then(function (r) {
            return filterSeen((r[0].results || []).filter(function (x) { return x.media_type === 'movie' || x.media_type === 'tv'; })
              .map(function (x) { return tmdbMeta(x, x.media_type); })).filter(function (m) { return !m.anime; });
          });
        });
        var ofType = function (t) { return function () { return multi().then(function (l) { return l.filter(function (m) { return m.type === t; }); }); }; };
        promiseRow(results, tr('Películas'), ofType('movie'), pick);
        promiseRow(results, tr('Series'), ofType('series'), pick);
      } else {
        promiseRow(results, tr('Películas'), noAnime(CINEMETA + '/catalog/movie/top/search=' + enc + '.json'), pick);
        promiseRow(results, tr('Series'), noAnime(CINEMETA + '/catalog/series/top/search=' + enc + '.json'), pick);
      }
      addonCatalogs(true).forEach(function (c) {
        asyncRow(results, c.title, c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '/search=' + enc + '.json', pick);
      });
    }

    // lo que llega del móvil se escribe en el cuadro y se busca, con el foco en el cuadro (los resultados, arriba)
    function fromPhone(q) {
      q = trim(String(q).replace(/\s+/g, ' ')).slice(0, 200);
      if (!q) return;
      if (document.activeElement === input) input.blur(); // cierra el teclado de la tele si estaba abierto
      clearTimeout(liveTimer);
      input.value = q;
      remember(q);
      run(q);
      if (Nav.root === root) Nav.focus(input);
    }

    // se escucha mientras Buscar se ve: no tapada por otra pantalla, ni cerrada, ni la app en segundo plano
    var screen = { el: root, initialFocus: function () { return input; } }, stopListen = null;
    function sync() {
      var on = !screen.closed && root.style.display !== 'none' && !document.hidden;
      if (on && !stopListen) stopListen = phoneListen(phoneTopic(), fromPhone);
      if (!on && stopListen) { stopListen(); stopListen = null; }
    }
    screen.onShow = screen.onResume = screen.onHide = sync;
    screen.onClose = function () { sync(); if (phoneSync === sync) phoneSync = null; };
    phoneSync = sync;
    return screen;
  }
