  // ---------------------------------------------------------------- pantalla: tu año en StremTV

  // Resumen del año: horas, películas, episodios, series terminadas, las series más vistas, tus películas mejor puntuadas,
  // géneros, el mes y el día de la semana con más tele, la racha de días seguidos y el día de maratón.
  // Con Trakt sale de su historial del año (páginas de 250, una detrás de otra: puede haber miles) con la duración de cada
  // episodio o película; sin Trakt, de lo visto en esta tele. Lo de Trakt se guarda por año (stv.year.AAAA): un año que se
  // calculó ya terminado vale para siempre; el que está en curso se rehace al día
  var YEAR_PAGE = 250, YEAR_V = 1;
  var MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS_ES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  var WEEKDAYS_EN = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  // géneros de Trakt (vienen como slug; en inglés basta con ponerlos bonitos)
  var TRAKT_GENRES_ES = { action: 'Acción', adventure: 'Aventura', animation: 'Animación', anime: 'Anime', biography: 'Biografía', comedy: 'Comedia',
    crime: 'Crimen', documentary: 'Documental', drama: 'Drama', family: 'Familia', fantasy: 'Fantasía', history: 'Historia', holiday: 'Fiestas',
    horror: 'Terror', music: 'Música', musical: 'Musical', mystery: 'Misterio', romance: 'Romance', 'science-fiction': 'Ciencia ficción',
    short: 'Cortos', superhero: 'Superhéroes', suspense: 'Suspense', thriller: 'Thriller', war: 'Bélica', western: 'Western', reality: 'Reality',
    'game-show': 'Concursos', 'talk-show': 'Entrevistas', soap: 'Culebrones', 'mini-series': 'Miniseries', children: 'Infantil',
    'sporting-event': 'Deportes', news: 'Noticias', donghua: 'Donghua' };
  var YEAR_ICON = '<path d="M3 21h18M6 17v-5M10 17V6M14 17v-8M18 17V3"/>';

  function genreName(g) {
    if (settings.lang === 'en') return g.charAt(0).toUpperCase() + g.slice(1).replace(/-/g, ' ');
    return TRAKT_GENRES_ES[g] || g;
  }
  function monthName(m) { return settings.lang === 'en' ? MONTHS_EN[m] : MONTHS_ES[m]; }
  // «14 de marzo» / «14 March»
  function yearDate(ms) {
    var d = new Date(ms);
    return settings.lang === 'en' ? d.getDate() + ' ' + MONTHS_EN[d.getMonth()] : d.getDate() + ' de ' + MONTHS_ES[d.getMonth()];
  }
  // día en hora local (el de la tele, no el UTC de Trakt)
  function dayKey(d) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function keyDay(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  // el año del resumen: en enero, el que acaba de terminar
  function wrappedYear() { var d = new Date(); return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); }
  // en diciembre y enero se ve en Inicio (el resto del año, oculta salvo que se muestre en Ajustes → Filas de Inicio)
  function wrappedSeason() { var m = new Date().getMonth(); return m === 11 || m === 0; }
  // la cuenta de Trakt de lo guardado: con otra cuenta no vale
  function yearWho() { return (trakt.clientId || '') + ':' + (trakt.user || ''); }

  // ---- cálculo

  function yearAcc() {
    var per = function (n) { var a = []; for (var i = 0; i < n; i++) a.push({ min: 0, n: 0 }); return a; };
    return { min: 0, plays: 0, movies: {}, episodes: 0, shows: {}, genres: {}, months: per(12), wdays: per(7), days: {}, first: null };
  }
  // suma una visualización. kind: 'movie', 'episode' o 'part' (a medias en esta tele: solo cuenta el tiempo)
  // o: { id, name, poster, genres, s, e, label }
  function yearAdd(acc, when, min, kind, o) {
    acc.min += min;
    acc.months[when.getMonth()].min += min;
    acc.wdays[when.getDay()].min += min;
    var k = dayKey(when), day = acc.days[k] = acc.days[k] || { min: 0, n: 0, m: 0, e: 0 };
    day.min += min;
    (o.genres || []).forEach(function (g) { acc.genres[g] = (acc.genres[g] || 0) + min; });
    if (kind === 'part') return;
    acc.plays++;
    acc.months[when.getMonth()].n++;
    acc.wdays[when.getDay()].n++;
    day.n++;
    if (kind === 'movie') { acc.movies[o.id] = o.name; day.m++; } else {
      acc.episodes++;
      day.e++;
      var sh = acc.shows[o.id] = acc.shows[o.id] || { id: o.id, name: o.name, poster: o.poster, n: 0, min: 0 };
      sh.n++;
      sh.min += min;
    }
    if (!acc.first || when.getTime() < acc.first.at) {
      acc.first = { at: when.getTime(), id: o.id, name: o.name, type: kind === 'movie' ? 'movie' : 'series', s: o.s, e: o.e, label: o.label };
    }
  }
  // el que más tiempo tiene (si no se sabe la duración de nada, el que más visualizaciones)
  function yearBest(list) {
    var best = -1;
    list.forEach(function (x, i) { if (x.n && (best < 0 || x.min > list[best].min || (x.min === list[best].min && x.n > list[best].n))) best = i; });
    return best;
  }
  // lo que se guarda y se pinta (sin las listas completas: cabe de sobra en localStorage)
  function yearResult(acc, y, src, extra) {
    var shows = Object.keys(acc.shows).map(function (k) { return acc.shows[k]; });
    var r = { v: YEAR_V, y: y, src: src, who: src === 'trakt' ? yearWho() : '', at: Date.now(), min: Math.round(acc.min), plays: acc.plays,
      movies: Object.keys(acc.movies).length, episodes: acc.episodes, showCount: shows.length, finished: extra.finished || 0,
      topSeries: shows.sort(function (a, b) { return b.n - a.n || b.min - a.min; }).slice(0, 5)
        .map(function (s) { return { id: s.id, name: s.name, poster: s.poster, n: s.n }; }),
      topMovies: extra.topMovies || [],
      genres: Object.keys(acc.genres).filter(function (g) { return acc.genres[g] > 0; })
        .sort(function (a, b) { return acc.genres[b] - acc.genres[a]; }).slice(0, 5)
        .map(function (g) { return { g: g, pct: acc.min ? Math.round(acc.genres[g] / acc.min * 100) : 0 }; }),
      first: acc.first };
    var m = yearBest(acc.months), w = yearBest(acc.wdays);
    r.month = m < 0 ? null : { m: m, min: Math.round(acc.months[m].min) };
    r.weekday = w < 0 ? null : { d: w, min: Math.round(acc.wdays[w].min) };
    // racha: días seguidos con algo visto (aunque sea a medias)
    var keys = Object.keys(acc.days).filter(function (k) { return acc.days[k].n || acc.days[k].min > 0; }).sort(), run = 0, prev = null, from = null;
    r.streak = null;
    keys.forEach(function (k) {
      var d = keyDay(k);
      if (prev && Math.round((d - prev) / 86400000) === 1) run++; else { run = 1; from = d; }
      prev = d;
      if (!r.streak || run > r.streak.n) r.streak = { n: run, from: from.getTime(), to: d.getTime() };
    });
    // maratón: el día con más tiempo (o, sin duraciones, con más cosas vistas)
    var mk = null;
    keys.forEach(function (k) {
      var d = acc.days[k], b = mk && acc.days[mk];
      if (!b || d.min > b.min || (d.min === b.min && d.n > b.n)) mk = k;
    });
    r.marathon = mk ? { day: keyDay(mk).getTime(), min: Math.round(acc.days[mk].min), m: acc.days[mk].m, e: acc.days[mk].e } : null;
    return r;
  }

  // sin Trakt: lo visto en esta tele ese año (el progreso guarda las 200 últimas cosas; lo marcado a mano no tiene duración)
  function localYear(y) {
    var acc = yearAcc();
    Object.keys(progress).forEach(function (k) {
      var p = progress[k], when = new Date(p.ts);
      if (when.getFullYear() !== y) return;
      var kind = !p.done ? 'part' : p.type === 'movie' ? 'movie' : 'episode';
      if (kind === 'part' && !(p.t >= 60)) return;
      yearAdd(acc, when, ((p.done ? p.d : p.t) || 0) / 60, kind, { id: p.metaId, name: p.name, poster: p.poster, label: p.label || p.name });
    });
    return yearResult(acc, y, 'local', {});
  }

  function yearRange(y) { return 'start_at=' + new Date(y, 0, 1).toISOString() + '&end_at=' + new Date(y + 1, 0, 1).toISOString(); }

  // con Trakt: el historial del año, página a página (onStep(página, total): total 0 si aún no se sabe)
  function traktYear(y, onStep, isAlive) {
    var acc = yearAcc(), pages = 0;
    function add(it) {
      var when = new Date(it.watched_at);
      if (when.getFullYear() !== y) return; // por si Trakt redondea los límites
      if (it.movie && it.movie.ids) {
        var mv = it.movie;
        yearAdd(acc, when, mv.runtime || 0, 'movie', { id: mv.ids.imdb || 'trakt:' + mv.ids.trakt, name: mv.title, genres: mv.genres });
      } else if (it.episode && it.show && it.show.ids) {
        var sh = it.show;
        yearAdd(acc, when, it.episode.runtime || sh.runtime || 0, 'episode', { id: sh.ids.imdb || 'trakt:' + sh.ids.trakt, name: sh.title,
          genres: sh.genres, s: it.episode.season, e: it.episode.number });
      }
    }
    function page(n) {
      if (!isAlive()) return Promise.reject(new Error(tr('cancelado')));
      onStep(n, pages);
      return Trakt.call('GET', '/sync/history?' + yearRange(y) + '&page=' + n + '&limit=' + YEAR_PAGE + '&extended=full', null, function (x) {
        pages = +x.getResponseHeader('X-Pagination-Page-Count') || 0;
      }).then(function (items) {
        items = items || [];
        items.forEach(add);
        // sin la cabecera de paginación (si el navegador no deja leerla), hasta la primera página incompleta
        if ((pages ? n < pages : items.length >= YEAR_PAGE) && n < 400) return page(n + 1);
      });
    }
    return page(1).then(function () {
      if (!isAlive()) throw new Error(tr('cancelado'));
      return Promise.all([
        acc.plays ? Trakt.call('GET', '/sync/ratings/movies').catch(function () { return []; }) : [],
        acc.episodes ? Trakt.watchedShows().catch(function () { return []; }) : []
      ]);
    }).then(function (r) {
      // tus películas mejor puntuadas de las vistas este año (solo las que puntuaste)
      var top = (r[0] || []).filter(function (it) { return it.movie && it.movie.ids && acc.movies.hasOwnProperty(it.movie.ids.imdb || 'trakt:' + it.movie.ids.trakt); })
        .sort(function (a, b) { return b.rating - a.rating || new Date(b.rated_at || 0) - new Date(a.rated_at || 0); }).slice(0, 5)
        .map(function (it) { return { id: it.movie.ids.imdb || '', name: it.movie.title, rating: it.rating }; });
      // series terminadas: al día con lo emitido, con el último episodio visto este año y algo visto este año
      var finished = 0;
      (r[1] || []).forEach(function (it) {
        var sh = it.show, n = 0;
        if (!sh || !sh.ids || !sh.aired_episodes || new Date(it.last_watched_at).getFullYear() !== y) return;
        if (!acc.shows[sh.ids.imdb || 'trakt:' + sh.ids.trakt]) return;
        (it.seasons || []).forEach(function (se) { if (se.number > 0) n += (se.episodes || []).length; });
        if (n >= sh.aired_episodes) finished++;
      });
      var res = yearResult(acc, y, 'trakt', { topMovies: top, finished: finished });
      // la etiqueta del primer episodio del año, con la numeración de Cinemeta (como mucho 4 s)
      var f = res.first;
      if (!f || f.type !== 'series' || String(f.id).indexOf('tt') !== 0) return res;
      return withTimeout(Trakt.learnEpMaps([f.id]), 4000).catch(function () {}).then(function () { return res; });
    });
  }

  // lo guardado de ese año si aún vale
  function yearCached(y) {
    var c = load('year.' + y, null);
    if (!c || c.v !== YEAR_V || c.who !== yearWho()) return null;
    if (c.at >= new Date(y + 1, 0, 1).getTime()) return c; // calculado con el año ya terminado: no cambia
    return Date.now() - c.at < 86400000 ? c : null;
  }

  // el resumen de un año: sin Trakt, al momento; con Trakt, lo guardado o se calcula (force: aunque haya algo guardado)
  function yearStats(y, force, onStep, isAlive) {
    if (!Trakt.linked()) return Promise.resolve(localYear(y));
    var c = !force && yearCached(y);
    if (c) return Promise.resolve(c);
    return traktYear(y, onStep || function () {}, isAlive || function () { return true; }).then(function (r) {
      save('year.' + y, r);
      return r;
    });
  }
  // lo que se sabe ya de un año sin pedir nada (para Ajustes e Inicio)
  function yearKnown(y) { return Trakt.linked() ? yearCached(y) : localYear(y); }

  // años con algo visto (del más reciente al más antiguo; el del resumen siempre). Con Trakt se pregunta por los diez
  // últimos con una consulta mínima cada uno y se guarda un día
  function yearList() {
    var now = new Date().getFullYear(), def = wrappedYear();
    var tidy = function (ys) {
      var out = [];
      ys.concat([now, def]).forEach(function (y) { if (y && out.indexOf(y) < 0) out.push(y); });
      return out.sort(function (a, b) { return b - a; });
    };
    if (!Trakt.linked()) {
      return Promise.resolve(tidy(Object.keys(progress).map(function (k) { return new Date(progress[k].ts).getFullYear(); })));
    }
    var c = load('yearlist', null);
    if (c && c.who === yearWho() && Date.now() - c.at < 86400000) return Promise.resolve(tidy(c.years));
    var ys = [];
    for (var y = now - 1; y >= now - 10; y--) ys.push(y);
    return mapLimit(ys, 3, function (yy) {
      return Trakt.call('GET', '/sync/history?' + yearRange(yy) + '&limit=1').then(function (r) { return r && r.length ? yy : null; });
    }).then(function (found) {
      var years = found.filter(Boolean);
      save('yearlist', { who: yearWho(), at: Date.now(), years: years });
      return tidy(years);
    });
  }

  function yearHours(min) { var h = min / 60; return h < 10 ? num(Math.round(h * 10) / 10) : String(Math.round(h)); }

  // resumen de una línea (Ajustes e Inicio)
  function yearSummary(y) {
    var r = yearKnown(y);
    if (!r || !r.plays) return tr('Tus horas, tus series y tu racha de {0}', y);
    return tr('{0} h · {1} películas · {2} episodios', yearHours(r.min), r.movies, r.episodes);
  }

  // ---- pantalla

  function yearScreen(year) {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    var head = el('div', 'yr-head', '<div class="yr-title"></div><div class="yr-src"></div>');
    vs.appendChild(head);
    var chipsRow = el('div', 'row chips-row');
    var chips = el('div', 'hscroll chips');
    chips.style.position = 'relative';
    chipsRow.appendChild(chips);
    vs.appendChild(chipsRow);
    var body = el('div', 'yr-body');
    vs.appendChild(body);
    var cur = year || wrappedYear(), years = [cur], job = 0;
    var screen = { el: root, initialFocus: function () { return chips.querySelector('.primary') || chips.querySelector('.f'); } };

    // años arriba (◀ ▶ entre ellos) y, con Trakt, «Recalcular»
    function paintChips() {
      var hadFocus = Nav.cur && chips.contains(Nav.cur), target = null;
      chips.innerHTML = '';
      years.forEach(function (y) {
        var b = el('div', 'btn' + (y === cur ? ' primary' : ''), String(y));
        b._year = y;
        focusable(b, function () { if (y !== cur) show(y); });
        chips.appendChild(b);
        if (y === cur) target = chips._last = b;
      });
      if (Trakt.linked()) {
        var again = el('div', 'btn', esc(tr('↻ Recalcular')));
        focusable(again, function () { show(cur, true); });
        chips.appendChild(again);
      }
      if (hadFocus && target && isTop(screen)) Nav.focus(target);
    }

    function paintHead(r) {
      head.firstChild.textContent = tr('Tu {0} en StremTV', cur);
      head.lastChild.textContent = !r ? '' : r.src === 'trakt'
        ? tr('Con tu historial de Trakt · calculado el {0} a las {1}', fmtDate(new Date(r.at)), clockText(new Date(r.at)))
        : tr('Solo lo visto en esta tele (sin Trakt no hay más datos, y la tele recuerda las últimas 200 cosas que has visto).');
    }

    function show(y, force) {
      var my = ++job;
      cur = y;
      Array.prototype.forEach.call(chips.children, function (b) {
        if (b._year === undefined) return;
        b.classList.toggle('primary', b._year === y);
        if (b._year === y) chips._last = b;
      });
      paintHead(null);
      body.innerHTML = '';
      var status = el('div', 'yr-status', esc(tr('Calculando tu año…')));
      body.appendChild(status);
      var live = function () { return !screen.closed && my === job; };
      yearStats(y, force, function (n, total) {
        if (live()) status.textContent = total ? tr('Calculando tu año… {0}/{1}', n, total) : tr('Calculando tu año… {0}', n);
      }, live).then(function (r) {
        if (!live()) return;
        paintHead(r);
        paintStats(r);
      }, function (e) {
        if (live()) status.textContent = tr('No se pudo calcular ({0})', e.message);
      });
    }

    // fila de recuadros con un número grande (enfocables: así ▲ ▼ recorren la pantalla); t: [número, qué, detalle]
    function tiles(list, cls, title) {
      var row = el('div', 'row');
      if (title) row.appendChild(el('div', 'row-title', esc(title)));
      var sc = el('div', 'hscroll');
      sc.style.position = 'relative';
      list.filter(Boolean).forEach(function (t) {
        var s = el('div', 'yr-stat' + (cls ? ' ' + cls : ''), '<div class="yr-big"></div><div class="yr-lbl"></div><div class="yr-sub"></div>');
        s.childNodes[0].textContent = t[0];
        if (cls !== 'wide' && t[0].length > 6) s.childNodes[0].className += t[0].length > 9 ? ' xlong' : ' long'; // que no se corte
        s.childNodes[1].textContent = t[1];
        s.childNodes[2].textContent = t[2] || '';
        sc.appendChild(focusable(s, function () { /* solo para leer */ }));
      });
      row.appendChild(sc);
      body.appendChild(row);
    }

    function paintStats(r) {
      body.innerHTML = '';
      if (!r.plays) {
        body.appendChild(el('div', 'yr-status', esc(tr('En {0} no hay nada visto todavía. Ya habrá tiempo.', r.y))));
        return;
      }
      var days = r.min / 1440;
      tiles([
        [yearHours(r.min), tr('horas'), days >= 1 ? tr('≈ {0} días enteros de tele', num(Math.round(days * 10) / 10)) : tr('Un año tranquilo')],
        [String(r.movies), r.movies === 1 ? tr('película') : tr('películas'), ''],
        [String(r.episodes), r.episodes === 1 ? tr('episodio') : tr('episodios'), r.showCount === 1 ? tr('de 1 serie') : r.showCount ? tr('de {0} series', r.showCount) : ''],
        r.src === 'trakt' ? [String(r.finished), r.finished === 1 ? tr('serie terminada') : tr('series terminadas'), r.finished ? tr('al día con todo lo emitido') : tr('Ninguna… de momento')] : null
      ]);

      // las series con más episodios vistos
      var series = r.topSeries.filter(function (s) { return String(s.id).indexOf('tt') === 0 || s.poster; });
      if (series.length) {
        body.appendChild(posterRow(tr('Tus series del año'), series.map(function (s) {
          return { id: s.id, type: 'series', name: s.name, poster: s.poster || metahubPoster(s.id) };
        }), openMeta, series.map(function (s) { return { label: s.name + ' · ' + (s.n === 1 ? tr('1 episodio') : tr('{0} episodios', s.n)) }; })));
      }

      var facts = [];
      if (r.month) facts.push([cap(monthName(r.month.m)), tr('tu mes con más tele'), r.month.min ? tr('{0} h de pantalla', yearHours(r.month.min)) : '']);
      if (r.weekday) facts.push([cap(settings.lang === 'en' ? WEEKDAYS_EN[r.weekday.d] : WEEKDAYS_ES[r.weekday.d]), tr('tu día de sofá'), '']);
      if (r.streak) facts.push([r.streak.n === 1 ? tr('1 día') : tr('{0} días', r.streak.n), tr('tu racha más larga'),
        r.streak.n > 1 ? tr('del {0} al {1}', yearDate(r.streak.from), yearDate(r.streak.to)) : tr('Sin dos días seguidos. Qué disciplina.')]);
      if (r.marathon) {
        var mm = r.marathon, what = [];
        if (mm.e) what.push(mm.e === 1 ? tr('1 episodio') : tr('{0} episodios', mm.e));
        if (mm.m) what.push(mm.m === 1 ? tr('1 película') : tr('{0} películas', mm.m));
        facts.push([mm.min ? yearHours(mm.min) + ' h' : yearDate(mm.day), tr('tu día de maratón'), (mm.min ? yearDate(mm.day) + ' · ' : '') + what.join(tr(' y '))]);
      }
      if (facts.length) tiles(facts, '', tr('Tus costumbres'));

      if (r.genres.length) {
        tiles(r.genres.map(function (g) { return [g.pct + ' %', genreName(g.g), '']; }), 'small', tr('Lo que más te ha tirado'));
      }

      var movies = r.topMovies.filter(function (m) { return m.id; });
      if (movies.length) {
        body.appendChild(posterRow(tr('Tus películas mejor puntuadas'), movies.map(function (m) {
          return { id: m.id, type: 'movie', name: m.name, poster: metahubPoster(m.id) };
        }), openMeta, movies.map(function (m) { return { label: m.name + ' · ' + tr('tu nota: {0}', m.rating) }; })));
      }

      var f = r.first;
      if (f) {
        var what1 = f.type === 'series' && f.s ? f.name + ' ' + (String(f.id).indexOf('tt') === 0 ? Trakt.epCode(f.id, f.s, f.e) : tr('T{0}:E{1}', f.s, f.e)) : f.label || f.name;
        tiles([[yearDate(f.at), tr('lo primero que viste en {0}', r.y), what1]], 'wide');
      }
      if (Nav.root === root && !(Nav.cur && root.contains(Nav.cur))) Nav.setRoot(root, screen.initialFocus());
    }

    paintChips();
    show(cur);
    yearList().then(function (ys) {
      if (screen.closed) return;
      years = ys.indexOf(cur) < 0 ? ys.concat([cur]).sort(function (a, b) { return b - a; }) : ys;
      paintChips();
    }).catch(function () { /* se queda solo el año elegido */ });
    return screen;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // recuadro de Inicio (diciembre y enero): abre el resumen del año; paint() lo pone al día al volver
  function yearTile(container) {
    var y = wrappedYear();
    var row = el('div', 'row');
    var b = el('div', 'yr-banner', '<div class="yr-banner-t"></div><div class="yr-banner-s"></div>');
    focusable(b, function () { push(yearScreen(y)); });
    row.appendChild(b);
    container.appendChild(row);
    container._paint = function () {
      b.firstChild.textContent = tr('Tu {0} en StremTV', y);
      var r = yearKnown(y);
      b.lastChild.textContent = r && r.plays ? tr('{0} horas, {1} películas y {2} episodios. Y alguna sorpresa más.', yearHours(r.min), r.movies, r.episodes)
        : tr('Tus horas, tus series, tu racha más larga y tu día de maratón');
    };
    container._paint();
  }
