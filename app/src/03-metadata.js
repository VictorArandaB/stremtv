  // ---------------------------------------------------------------- títulos y sinopsis en español (TMDB)

  var TMDB = 'https://api.themoviedb.org/3';
  // imdb → { k: 'movie' | 'tv' | '', id, n: título en español }; los títulos casi no cambian, así que no caduca (salvo «no encontrado»)
  var tmdbIds = load('tmdbids', {});
  var tmdbPending = {}, tmdbSaveTimer = null;

  // solo con la app en español (Cinemeta ya da todo en inglés) y con clave
  function tmdbOn() { return !!settings.tmdbKey && settings.lang !== 'en'; }

  function tmdbGet(path) {
    var key = settings.tmdbKey, bearer = key.length > 40; // token de lectura (v4) o clave de la API (v3)
    var url = TMDB + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'language=es-ES' + (bearer ? '' : '&api_key=' + encodeURIComponent(key));
    return xhr('GET', url, { timeout: 15000, headers: bearer ? { Authorization: 'Bearer ' + key } : {},
      fail: function (st) { return st === 401 ? tr('la clave de TMDB no es válida') : 'TMDB ' + st; } }).then(strictJSON);
  }

  function saveTmdbIds() {
    clearTimeout(tmdbSaveTimer);
    tmdbSaveTimer = setTimeout(function () {
      capByTs(tmdbIds, 3000);
      save('tmdbids', tmdbIds);
    }, 2000);
  }

  // id de TMDB y título en español de un título de IMDb (con caché)
  function tmdbFind(imdb) {
    var c = tmdbIds[imdb];
    // lo encontrado no caduca; «no está en TMDB» se vuelve a mirar a la semana (los estrenos se enlazan después)
    if (c && (c.id || Date.now() - c.ts < 7 * 86400000)) return Promise.resolve(c);
    if (!tmdbPending[imdb]) {
      tmdbPending[imdb] = tmdbGet('/find/' + imdb + '?external_source=imdb_id').then(function (d) {
        var m = (d.movie_results || [])[0], t = (d.tv_results || [])[0];
        var r = m ? { k: 'movie', id: m.id, n: m.title } : t ? { k: 'tv', id: t.id, n: t.name } : { k: '', id: 0, n: '' };
        r.ts = Date.now();
        tmdbIds[imdb] = r;
        saveTmdbIds();
        delete tmdbPending[imdb];
        return r;
      }, function (e) {
        delete tmdbPending[imdb];
        if (!c) throw e;
        c.ts = Date.now() - 6 * 86400000; // sin respuesta: vale lo guardado y se vuelve a mirar en un día, no en cada render
        return c;
      });
    }
    return tmdbPending[imdb];
  }

  // título, sinopsis y géneros en español para la ficha
  function tmdbDetail(imdb) {
    return tmdbFind(imdb).then(function (r) {
      if (!r.id) return null;
      return tmdbGet('/' + r.k + '/' + r.id).then(function (d) {
        return { k: r.k, id: r.id, name: d.title || d.name, overview: d.overview, genres: (d.genres || []).map(function (g) { return g.name; }) };
      });
    });
  }

  // como mucho «ms» de espera: si TMDB tarda, la ficha sale en inglés
  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  // ---------------------------------------------------------------- saltar intro y ending de anime (AniSkip)

  // id de MyAnimeList y número de episodio de lo que se reproduce (ARM traduce de Kitsu o IMDb); null si no es anime
  var armCache = {};
  function armGet(path) {
    if (!armCache[path]) armCache[path] = getJSON('https://arm.haglund.dev/api/v2/' + path).catch(function () { delete armCache[path]; return null; });
    return armCache[path];
  }
  function malFor(ctx) {
    var k = /^kitsu:(\d+)/.exec(ctx.metaId || '');
    if (k) {
      var ep = +String(ctx.videoId).split(':')[2] || 1;
      return armGet('ids?source=kitsu&id=' + k[1]).then(function (d) { return d && d.myanimelist ? { id: d.myanimelist, ep: ep } : null; });
    }
    if (!ctx.imdb) return Promise.resolve(null);
    return armGet('imdb?id=' + ctx.imdb).then(function (list) {
      list = (list || []).filter(function (x) { return x.myanimelist; });
      if (!list.length) return null;
      if (ctx.type === 'movie') return { id: list[0].myanimelist, ep: 1 };
      // series: la entrada de MyAnimeList de esa temporada
      var bySeason = list.filter(function (x) { return x['thetvdb-season'] === +ctx.imdbS || x['themoviedb-season'] === +ctx.imdbS; });
      var m = bySeason.length === 1 ? bySeason[0] : list.length === 1 ? list[0] : null;
      return m ? { id: m.myanimelist, ep: +ctx.imdbE } : null;
    });
  }

  function skipTimes(ctx) {
    return malFor(ctx).then(function (mal) {
      if (!mal) return [];
      return getJSON('https://api.aniskip.com/v2/skip-times/' + mal.id + '/' + mal.ep + '?types=op&types=ed&episodeLength=0').then(function (d) {
        return d && d.found ? (d.results || []).map(function (r) { return { type: r.skipType, s: r.interval.startTime, e: r.interval.endTime }; }) : [];
      });
    }).catch(function () { return []; });
  }
