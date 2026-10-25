  // ---------------------------------------------------------------- Trakt

  var TRAKT = 'https://api.trakt.tv';
  var trakt = load('trakt', {}); // clientId, clientSecret, access, refresh, expires, user
  function saveTrakt() { save('trakt', trakt); }

  function traktReq(method, path, body, auth) {
    var headers = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': trakt.clientId || '' };
    if (auth !== false && trakt.access) headers.Authorization = 'Bearer ' + trakt.access;
    return xhr(method, TRAKT + path, { timeout: 20000, headers: headers, body: body ? JSON.stringify(body) : null,
      fail: function (st) { return 'Trakt ' + st; } }).then(looseJSON);
  }

  function withSecret(body) {
    if (trakt.clientSecret) body.client_secret = trakt.clientSecret;
    return body;
  }

  // Hoy / Mañana / Ayer o «jue 23»
  function dayLabel(d) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var day = new Date(d.getTime()); day.setHours(0, 0, 0, 0);
    var diff = Math.round((day - today) / 86400000);
    if (diff === 0) return tr('Hoy');
    if (diff === 1) return tr('Mañana');
    if (diff === -1) return tr('Ayer');
    try { return d.toLocaleDateString(settings.lang === 'en' ? 'en-GB' : 'es-ES', { weekday: 'short', day: 'numeric' }); } catch (e) { return fmtDate(d); }
  }

  // como Promise.all(items.map(fn)) pero con como mucho «limit» promesas en marcha; conserva el orden
  function mapLimit(items, limit, fn) {
    return new Promise(function (resolve) {
      var out = new Array(items.length), next = 0, done = 0;
      if (!items.length) return resolve(out);
      function run() {
        var i = next++;
        if (i >= items.length) return;
        fn(items[i]).then(function (v) { out[i] = v; }, function () { out[i] = null; }).then(function () {
          if (++done === items.length) resolve(out); else run();
        });
      }
      for (var k = 0; k < Math.min(limit, items.length); k++) run();
    });
  }

  function metahubPoster(imdb) { return 'https://images.metahub.space/poster/small/' + imdb + '/img'; }

  var Trakt = {
    watchlist: {}, // imdb -> true

    linked: function () { return !!(trakt.clientId && trakt.access); },

    storeTokens: function (t) {
      trakt.access = t.access_token;
      trakt.refresh = t.refresh_token;
      trakt.expires = (t.created_at * 1000) + (t.expires_in * 1000);
      trakt.ttl = t.expires_in * 1000;
      saveTrakt();
    },

    refreshing: null,
    ensureFresh: function () {
      // renovar el token si caduca en menos de un día (o de un cuarto de su vida, si dura poco)
      var margin = Math.min(86400000, (trakt.ttl || 7776000000) / 4);
      if (!trakt.refresh || Date.now() < (trakt.expires || 0) - margin) return Promise.resolve();
      // el refresh_token solo vale una vez: las llamadas que llegan a la vez esperan a la misma renovación
      if (!Trakt.refreshing) {
        var gen = Trakt.gen;
        Trakt.refreshing = traktReq('POST', '/oauth/token', withSecret({
          refresh_token: trakt.refresh, client_id: trakt.clientId,
          redirect_uri: 'http://localhost', grant_type: 'refresh_token'
        }), false).then(function (t) {
          if (gen !== Trakt.gen) throw new Error(tr('Trakt no vinculado')); // otra cuenta: no pisar sus tokens
          Trakt.refreshing = null; Trakt.storeTokens(t);
        }, function (e) { if (gen === Trakt.gen) Trakt.refreshing = null; throw e; });
      }
      return Trakt.refreshing;
    },

    call: function (method, path, body) {
      if (!Trakt.linked()) return Promise.reject(new Error(tr('Trakt no vinculado')));
      var gen = Trakt.gen;
      // la respuesta de una cuenta ya desvinculada no se usa ni puede desvincular la nueva
      var stale = function () { return gen !== Trakt.gen; };
      return Trakt.ensureFresh().then(function () { return traktReq(method, path, body); }).then(function (r) {
        if (stale()) throw new Error(tr('Trakt no vinculado'));
        return r;
      }, function (e) {
        if (stale()) throw e;
        if (e.status === 401) { trakt.access = ''; saveTrakt(); toast(tr('La sesión de Trakt ha caducado. Vuelve a vincularla en Ajustes.')); }
        throw e;
      });
    },

    unlink: function () {
      if (trakt.access) traktReq('POST', '/oauth/revoke', withSecret({ token: trakt.access, client_id: trakt.clientId }), false).catch(function () { /* da igual */ });
      trakt.access = ''; trakt.refresh = ''; trakt.expires = 0; trakt.user = '';
      Trakt.forget();
      saveTrakt();
    },

    // lo descargado de la cuenta anterior (al desvincular o vincular otra)
    // gen cambia con cada cuenta: lo que llegue después de la anterior se descarta (Trakt.call y la renovación del token)
    gen: 0,
    forget: function () {
      Trakt.gen++;
      Trakt.refreshing = null;
      Trakt.watchlist = {};
      Trakt.watchedCache = null; Trakt.upNextCache = null; Trakt.resumeCache = null;
      Trakt.progressCache = {}; save('upnext', {});
      Seen.movies = {}; Seen.shows = {}; Seen.at = 0; Seen.loading = null;
    },

    // Trakt y Cinemeta pueden numerar distinto los episodios de una serie (Mashle: en Trakt una T1 de 24, en Cinemeta T1 y T2
    // de 12). Se emparejan por fecha de emisión: imdb → { ts, n: episodios en Cinemeta, map: { 'T:E de Cinemeta': 'T:E de Trakt' } };
    // map vacío si coinciden. Se rehace al mes o si Cinemeta tiene otro número de episodios
    epMaps: load('epmaps', {}),
    epMap: function (imdb, videos) {
      var eps = (videos || []).filter(function (v) { return v.season > 0 && v.episode > 0; })
        .sort(function (a, b) { return a.season - b.season || a.episode - b.episode; });
      var c = Trakt.epMaps[imdb];
      if (c && c.n === eps.length && Date.now() - c.ts < 30 * 86400000) return Promise.resolve(c.map);
      return Trakt.call('GET', '/shows/' + imdb + '/seasons?extended=episodes,full').then(function (seasons) {
        var aired = {}, byDay = {}, map = {};
        (seasons || []).forEach(function (se) {
          if (!se.number) return;
          (se.episodes || []).forEach(function (e) {
            var k = se.number + ':' + e.number;
            aired[k] = e.first_aired || '';
            if (e.first_aired) (byDay[e.first_aired.slice(0, 10)] = byDay[e.first_aired.slice(0, 10)] || []).push(k);
          });
        });
        var near = function (a, b) { return !a || !b || Math.abs(new Date(a) - new Date(b)) < 2 * 86400000; };
        var same = eps.every(function (v) { var k = v.season + ':' + v.episode; return aired.hasOwnProperty(k) && near(aired[k], v.released); });
        if (!same) eps.forEach(function (v) {
          if (!v.released) return;
          var t = new Date(v.released).getTime(), bucket = null;
          // el mismo día o el de al lado (las fechas de una y otra pueden ir en otra zona horaria)
          [0, -1, 1].some(function (off) {
            var b = byDay[new Date(t + off * 86400000).toISOString().slice(0, 10)];
            if (b && b.length) { bucket = b; return true; }
            return false;
          });
          var tk = bucket && bucket.shift();
          if (tk && tk !== v.season + ':' + v.episode) map[v.season + ':' + v.episode] = tk;
        });
        Trakt.epMaps[imdb] = { ts: Date.now(), n: eps.length, map: map };
        capByTs(Trakt.epMaps, 300);
        save('epmaps', Trakt.epMaps);
        return map;
      });
    },
    // «T1:E3» de un episodio que da Trakt, con la numeración de Cinemeta si se conoce la equivalencia
    epCode: function (imdb, season, number) {
      var c = Trakt.epMaps[imdb], tk = season + ':' + number;
      if (c) for (var k in c.map) if (c.map[k] === tk) { var p = k.split(':'); season = p[0]; number = p[1]; break; }
      return tr('T{0}:E{1}', season, number);
    },
    // equivalencias de las series de una fila que aún no se conocen (de tres en tres; luego quedan guardadas un mes)
    learnEpMaps: function (imdbs) {
      var todo = imdbs.filter(function (id, i) { return id && imdbs.indexOf(id) === i && !Trakt.epMaps[id]; });
      return mapLimit(todo, 3, function (imdb) {
        return getJSON(CINEMETA + '/meta/series/' + imdb + '.json').then(function (r) { return Trakt.epMap(imdb, (r.meta || {}).videos); })
          .catch(function () { return null; });
      });
    },

    body: function (ctx) {
      if (!ctx.imdb) return null;
      if (ctx.type === 'movie') return { movie: { ids: { imdb: ctx.imdb } } };
      return { show: { ids: { imdb: ctx.imdb } }, episode: { season: +(ctx.traktS || ctx.imdbS), number: +(ctx.traktE || ctx.imdbE) } };
    },

    // start al reproducir, pause al pausar, stop al salir: Trakt lo marca como visto si progress >= 80
    scrobble: function (action, ctx, pct) {
      if (!Trakt.linked() || !ctx) return;
      var b = Trakt.body(ctx);
      if (!b) return;
      b.progress = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
      Trakt.call('POST', '/scrobble/' + action, b).catch(function () { /* 409 = duplicado reciente; no es grave */ });
    },

    loadWatchlist: function () {
      return Trakt.call('GET', '/sync/watchlist?limit=500').then(function (items) {
        Trakt.watchlist = {};
        var metas = [];
        (items || []).forEach(function (it) {
          var o = it.movie || it.show;
          if (!o || !o.ids || !o.ids.imdb) return; // sin IMDb, Cinemeta y los addons de fuentes no lo encuentran
          Trakt.watchlist[o.ids.imdb] = true;
          metas.push({ id: o.ids.imdb, type: it.movie ? 'movie' : 'series', name: o.title, poster: metahubPoster(o.ids.imdb) });
        });
        return metas;
      });
    },

    // series empezadas con episodios ya emitidos pendientes, de la vista más recientemente a la más antigua (el «Up Next» de Trakt).
    // Se guarda 10 minutos (o hasta terminar de ver algo): son muchas consultas
    upNextCache: null,
    // el progreso de cada serie (id de Trakt -> lw, ae, at, d), guardado en la tele: solo se vuelve a pedir si se ha visto algo
    // de ella (last_watched_at), si se ha emitido otro episodio (aired_episodes), si el pendiente que faltaba ya ha salido o tras un día
    progressCache: load('upnext', {}),
    // la lista completa de series vistas es la respuesta más pesada de Trakt: Seen y Siguientes episodios comparten la descarga
    watchedShows: function () {
      var c = Trakt.watchedCache;
      if (c && Date.now() - c.at < 60000) return c.promise;
      var promise = Trakt.call('GET', '/sync/watched/shows?extended=full');
      Trakt.watchedCache = { at: Date.now(), promise: promise };
      promise.catch(function () { Trakt.watchedCache = null; });
      return promise;
    },

    upNext: function () {
      var c = Trakt.upNextCache;
      if (c && Date.now() - c.at < 600000) return c.promise;
      var promise = Promise.all([
        Trakt.watchedShows(),
        Trakt.call('GET', '/users/hidden/progress_watched?type=show&limit=500').catch(function () { return []; })
      ]).then(function (r) {
        var hidden = {};
        (r[1] || []).forEach(function (h) { if (h.show && h.show.ids) hidden[h.show.ids.trakt] = true; });
        var shows = (r[0] || []).filter(function (it) {
          var sh = it.show;
          if (!sh || !sh.ids || !sh.ids.imdb || hidden[sh.ids.trakt]) return false;
          var n = 0;
          (it.seasons || []).forEach(function (se) { if (se.number > 0) n += (se.episodes || []).length; });
          return !sh.aired_episodes || n < sh.aired_episodes;
        }).sort(function (a, b) { return new Date(b.last_watched_at) - new Date(a.last_watched_at); }).slice(0, 150);
        var cache = Trakt.progressCache, now = Date.now(), keep = {};
        // todas las series (no solo las recientes), como mucho 6 consultas a la vez para no saturar la tele ni Trakt
        return mapLimit(shows, 6, function (it) {
          var sh = it.show, c = cache[sh.ids.trakt];
          keep[sh.ids.trakt] = true;
          var pending = c && c.d && c.d.next_episode && c.d.next_episode.first_aired, fresh = c && c.lw === it.last_watched_at &&
            c.ae === sh.aired_episodes && now - c.at < 86400000 && !(pending && c.d.aired <= c.d.completed && new Date(pending) <= new Date());
          return (fresh ? Promise.resolve(c.d) : Trakt.call('GET', '/shows/' + sh.ids.trakt + '/progress/watched?hidden=false&specials=false&count_specials=false&extended=full').then(function (d) {
            d = d ? { aired: d.aired, completed: d.completed, next_episode: d.next_episode &&
              { season: d.next_episode.season, number: d.next_episode.number, first_aired: d.next_episode.first_aired } } : null;
            cache[sh.ids.trakt] = { lw: it.last_watched_at, ae: sh.aired_episodes, at: now, d: d };
            return d;
          })).then(function (d) {
            var e = d && d.next_episode;
            if (!e || (d.aired && d.completed >= d.aired)) return null; // al día: lo «siguiente» aún no se ha emitido
            if (e.first_aired && new Date(e.first_aired) > new Date()) return null;
            // insignia: episodios emitidos que faltan por ver; «Nuevo»: emitido en las últimas 48 h
            return { id: sh.ids.imdb, type: 'series', name: sh.title, poster: metahubPoster(sh.ids.imdb),
              ep: e, left: d.aired ? d.aired - d.completed : 0,
              isNew: !!(e.first_aired && Date.now() - new Date(e.first_aired) < 48 * 3600000) };
          }).catch(function () { return null; });
        }).then(function (list) {
          // las que ya no salen (terminadas, ocultas…) no se guardan
          Object.keys(cache).forEach(function (id) { if (!keep[id]) delete cache[id]; });
          save('upnext', cache);
          return list;
        });
      }).then(function (list) {
        // los recién emitidos primero, el resto en su orden (de la serie vista más recientemente a la más antigua)
        list = list.filter(Boolean);
        // la etiqueta con la numeración de Cinemeta (la de la ficha): antes se aprenden las equivalencias que falten,
        // como mucho 5 s (si no, sale la de Trakt y la próxima vez ya la de Cinemeta)
        return withTimeout(Trakt.learnEpMaps(list.map(function (m) { return m.id; })), 5000).catch(function () {}).then(function () {
          list.forEach(function (m) { m.label = m.name + ' · ' + Trakt.epCode(m.id, m.ep.season, m.ep.number); });
          return list.filter(function (m) { return m.isNew; }).concat(list.filter(function (m) { return !m.isNew; }));
        });
      });
      Trakt.upNextCache = { at: Date.now(), promise: promise };
      promise.catch(function () { Trakt.upNextCache = null; });
      return promise;
    },

    // episodios emitidos sin ver de cada serie empezada (imdb -> n), del mismo progreso que «Siguientes episodios».
    // No se calcula con aired_episodes de la lista de vistas: puede contar especiales y episodios que el progreso no cuenta
    pendingMap: function () {
      return Trakt.upNext().then(function (list) {
        var map = {};
        list.forEach(function (m) { if (m.left > 0) map[m.id] = m.left; });
        return map;
      });
    },
    // pone .left en las series de la lista (si Trakt falla, la fila sale igual sin el número)
    withPending: function (metas) {
      return Trakt.pendingMap().catch(function () { return {}; }).then(function (map) {
        metas.forEach(function (m) { if (m.type === 'series' && !m.left && map[imdbOfMeta(m)]) m.left = map[imdbOfMeta(m)]; });
        return metas;
      });
    },

    // añade o quita del historial películas y episodios marcados a mano
    markWatched: function (ctxs, on) {
      var movies = [], shows = {};
      ctxs.forEach(function (c) {
        if (!c.imdb) return;
        if (c.type === 'movie') { movies.push({ ids: { imdb: c.imdb } }); return; }
        var sh = shows[c.imdb] = shows[c.imdb] || {};
        var se = c.traktS || c.imdbS;
        (sh[se] = sh[se] || []).push({ number: +(c.traktE || c.imdbE) });
      });
      var body = { movies: movies, shows: Object.keys(shows).map(function (imdb) {
        return { ids: { imdb: imdb }, seasons: Object.keys(shows[imdb]).map(function (n) { return { number: +n, episodes: shows[imdb][n] }; }) };
      }) };
      // al quitar algo del historial last_watched_at no cambia: se vuelve a pedir el progreso de todas
      Trakt.upNextCache = null; Trakt.watchedCache = null; Trakt.progressCache = {};
      return Trakt.call('POST', '/sync/history' + (on ? '' : '/remove'), body);
    },

    toggleWatchlist: function (type, imdb) {
      var inList = !!Trakt.watchlist[imdb];
      var b = {};
      b[type === 'movie' ? 'movies' : 'shows'] = [{ ids: { imdb: imdb } }];
      return Trakt.call('POST', '/sync/watchlist' + (inList ? '/remove' : ''), b).then(function () {
        if (inList) delete Trakt.watchlist[imdb]; else Trakt.watchlist[imdb] = true;
        return !inList;
      });
    },

    playback: function () {
      return Trakt.call('GET', '/sync/playback?limit=30').then(function (items) {
        var out = [];
        (items || []).forEach(function (it) {
          if (it.type === 'movie' && it.movie && it.movie.ids.imdb) {
            out.push({ id: it.movie.ids.imdb, type: 'movie', name: it.movie.title, poster: metahubPoster(it.movie.ids.imdb), pct: it.progress / 100 });
          } else if (it.type === 'episode' && it.show && it.show.ids.imdb && it.episode) {
            out.push({ id: it.show.ids.imdb, type: 'series', name: it.show.title, poster: metahubPoster(it.show.ids.imdb), pct: it.progress / 100,
              label: it.show.title + ' · ' + Trakt.epCode(it.show.ids.imdb, it.episode.season, it.episode.number) });
          }
        });
        return out;
      });
    },

    // lo último visto (una entrada por película o serie)
    history: function () {
      return Trakt.call('GET', '/sync/history?limit=80').then(function (items) {
        var seen = {}, out = [];
        (items || []).forEach(function (it) {
          var o = it.movie || it.show;
          if (!o || !o.ids || !o.ids.imdb || seen[o.ids.imdb]) return;
          seen[o.ids.imdb] = true;
          var what = it.episode ? o.title + ' ' + Trakt.epCode(o.ids.imdb, it.episode.season, it.episode.number) : o.title;
          out.push({ id: o.ids.imdb, type: it.movie ? 'movie' : 'series', name: o.title, poster: metahubPoster(o.ids.imdb),
            label: dayLabel(new Date(it.watched_at)) + ' · ' + what });
        });
        return out;
      });
    },

    // lo dejado a medias en cualquier dispositivo: imdb (película) o imdb:temporada:episodio → % visto
    resumeCache: null,
    resumeMap: function () {
      if (!Trakt.linked()) return Promise.resolve({});
      var c = Trakt.resumeCache;
      if (c && Date.now() - c.at < 120000) return c.promise;
      var promise = Trakt.call('GET', '/sync/playback?limit=100').then(function (items) {
        var map = {};
        (items || []).forEach(function (it) {
          if (it.type === 'movie' && it.movie && it.movie.ids.imdb) map[it.movie.ids.imdb] = it.progress;
          else if (it.type === 'episode' && it.show && it.show.ids.imdb && it.episode) {
            map[it.show.ids.imdb + ':' + it.episode.season + ':' + it.episode.number] = it.progress;
          }
        });
        return map;
      }).catch(function () { return {}; });
      Trakt.resumeCache = { at: Date.now(), promise: promise };
      return promise;
    },

    // episodios de tus series de hace dos días a una semana vista
    calendar: function () {
      var d = new Date(Date.now() - 2 * 86400000);
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var start = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      return Trakt.call('GET', '/calendars/my/shows/' + start + '/10').then(function (items) {
        return (items || []).filter(function (it) { return it.show && it.show.ids && it.show.ids.imdb && it.episode; }).map(function (it) {
          var imdb = it.show.ids.imdb;
          return { id: imdb, type: 'series', name: it.show.title, poster: metahubPoster(imdb),
            label: dayLabel(new Date(it.first_aired)) + ' · ' + it.show.title + ' ' + Trakt.epCode(imdb, it.episode.season, it.episode.number) };
        });
      });
    },

    recommendations: function (kind) {
      return Trakt.call('GET', '/recommendations/' + kind + '?limit=30&ignore_collected=true').then(function (items) {
        return (items || []).filter(function (o) { return o.ids && o.ids.imdb; }).map(function (o) {
          return { id: o.ids.imdb, type: kind === 'movies' ? 'movie' : 'series', name: o.title, poster: metahubPoster(o.ids.imdb) };
        });
      });
    },

    // películas vistas y series sin episodios emitidos pendientes
    loadWatched: function () {
      return Promise.all([
        Trakt.call('GET', '/sync/watched/movies'),
        Trakt.watchedShows()
      ]).then(function (r) {
        var movies = {}, shows = {};
        (r[0] || []).forEach(function (it) { if (it.movie && it.movie.ids && it.movie.ids.imdb) movies[it.movie.ids.imdb] = true; });
        (r[1] || []).forEach(function (it) {
          var sh = it.show;
          if (!sh || !sh.ids || !sh.ids.imdb) return;
          var n = 0;
          (it.seasons || []).forEach(function (se) { if (se.number > 0) n += (se.episodes || []).length; });
          if (sh.aired_episodes && n >= sh.aired_episodes) shows[sh.ids.imdb] = true;
        });
        Seen.movies = movies;
        Seen.shows = shows;
        Seen.at = Date.now();
      });
    },

    showProgress: function (imdb) {
      return Trakt.call('GET', '/shows/' + imdb + '/progress/watched?hidden=false&specials=false').then(function (d) {
        var seen = {};
        ((d && d.seasons) || []).forEach(function (s) {
          (s.episodes || []).forEach(function (e) { if (e.completed) seen[s.number + ':' + e.number] = true; });
        });
        return { seen: seen, next: d && d.next_episode ? d.next_episode.season + ':' + d.next_episode.number : null };
      });
    }
  };
