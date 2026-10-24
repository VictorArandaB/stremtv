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

  // título, sinopsis y géneros en español para la ficha; en la misma consulta, la saga (películas)
  // y dónde se puede ver en España con suscripción (datos de JustWatch), y el tráiler de YouTube (en español si lo hay)
  function tmdbDetail(imdb) {
    return tmdbFind(imdb).then(function (r) {
      if (!r.id) return null;
      return tmdbGet('/' + r.k + '/' + r.id + '?append_to_response=watch/providers,videos&include_video_language=es,en').then(function (d) {
        var es = ((d['watch/providers'] || {}).results || {}).ES || {};
        var vids = ((d.videos || {}).results || []).filter(function (v) { return v.site === 'YouTube' && v.type === 'Trailer'; });
        vids.sort(function (a, b) { return (a.iso_639_1 === 'es' ? 0 : 1) - (b.iso_639_1 === 'es' ? 0 : 1); });
        return { trailer: vids.length ? vids[0].key : '', k: r.k, id: r.id, name: d.title || d.name, overview: d.overview, genres: (d.genres || []).map(function (g) { return g.name; }),
          collection: d.belongs_to_collection ? { id: d.belongs_to_collection.id, name: d.belongs_to_collection.name } : null,
          providers: (es.flatrate || []).map(function (p) { return p.provider_name; }) };
      });
    });
  }

  // películas de una saga en orden de estreno, con su id de IMDb (para abrirlas y marcar las vistas)
  function tmdbCollection(id) {
    return tmdbGet('/collection/' + id).then(function (d) {
      var parts = (d.parts || []).filter(function (x) { return x.release_date; })
        .sort(function (a, b) { return a.release_date < b.release_date ? -1 : 1; });
      return mapLimit(parts, 4, function (x) {
        return tmdbGet('/movie/' + x.id + '/external_ids').then(function (e) { return e.imdb_id; }, function () { return null; }).then(function (imdb) {
          return { id: imdb || 'tmdb:movie:' + x.id, imdb: imdb, type: 'movie', name: x.title, releaseInfo: x.release_date.slice(0, 4),
            poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '' };
        });
      });
    });
  }

  // ---------------------------------------------------------------- tráileres (en TizenTube)

  // la tele no reproduce YouTube dentro de la app: se le pide a TizenTube por DIAL. Su servicio escucha en el puerto 8095
  // desde que se abre TizenTube por primera vez tras encender la tele (y sigue aunque se salga de ella)
  var TIZENTUBE_DIAL = 'http://127.0.0.1:8095/dial/apps/YouTube';
  function trailerId(meta) {
    var t = meta._tmdb && meta._tmdb.trailer;
    (meta.trailerStreams || []).forEach(function (s) { if (!t && s.ytId) t = s.ytId; });
    (meta.trailers || []).forEach(function (s) { if (!t && s.source && (!s.type || s.type === 'Trailer')) t = s.source; });
    return /^[\w-]{11}$/.test(t || '') ? t : '';
  }
  function playTrailer(id) {
    toast(tr('Abriendo el tráiler en TizenTube…'));
    xhr('POST', TIZENTUBE_DIAL, { body: 'v=' + id, timeout: 4000, probe: true, headers: { 'Content-Type': 'text/plain' } }).then(function () {
      logEv('tráiler', id);
    }, function () {
      toast(tr('Para ver tráileres, abre TizenTube una vez desde que encendiste la tele y vuelve a probar'), 7000);
    });
  }

  // ---------------------------------------------------------------- notas de Rotten Tomatoes y Metacritic (OMDb)

  var omdbCache = {};
  function omdbRatings(imdb) {
    if (!settings.omdbKey || !imdb) return Promise.resolve(null);
    if (!omdbCache[imdb]) {
      omdbCache[imdb] = getJSON('https://www.omdbapi.com/?i=' + imdb + '&apikey=' + encodeURIComponent(settings.omdbKey)).then(function (d) {
        var out = {};
        (d && d.Ratings || []).forEach(function (r) {
          if (r.Source === 'Rotten Tomatoes') out.rt = parseInt(r.Value, 10);
          else if (r.Source === 'Metacritic') out.mc = parseInt(r.Value, 10);
        });
        return out.rt || out.mc ? out : null;
      }).catch(function () { delete omdbCache[imdb]; return null; });
    }
    return omdbCache[imdb];
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
