  // ---------------------------------------------------------------- títulos y sinopsis en español (TMDB)

  var TMDB = 'https://api.themoviedb.org/3';
  // imdb → { k: 'movie' | 'tv' | '', id, n: título en español }; los títulos casi no cambian, así que no caduca (salvo «no encontrado»)
  var tmdbIds = load('tmdbids', {});
  var tmdbPending = {}, tmdbSaveTimer = null;

  // solo con la app en español (Cinemeta ya da todo en inglés) y con clave
  function tmdbOn() { return !!settings.tmdbKey && settings.lang !== 'en'; }

  function tmdbGet(path) {
    var key = settings.tmdbKey, bearer = key.length > 40; // token de lectura (v4) o clave de la API (v3)
    var url = TMDB + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'language=' + (settings.lang === 'en' ? 'en-US' : 'es-ES') + (bearer ? '' : '&api_key=' + encodeURIComponent(key));
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

  // ---------------------------------------------------------------- listas de TMDB (Series, Películas y Buscar)

  // carátula de un resultado de TMDB; se abre por su id de IMDb al elegirla (openMeta)
  function tmdbMeta(x, k) {
    var date = x.release_date || x.first_air_date || '';
    return { id: 'tmdb:' + k + ':' + x.id, type: k === 'movie' ? 'movie' : 'series', name: x.title || x.name,
      poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '',
      background: x.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + x.backdrop_path : '',
      description: x.overview || '', releaseInfo: date.slice(0, 4),
      imdbRating: x.vote_count >= 50 && x.vote_average ? x.vote_average.toFixed(1) : '',
      anime: (x.genre_ids || []).indexOf(16) >= 0 && (x.original_language === 'ja' || (x.origin_country || []).indexOf('JP') >= 0) };
  }
  // animación japonesa: lo marca TMDB (tmdbMeta) o Trakt (género «anime»); de Cinemeta, por el género y el país
  function isAnimeMeta(m) {
    if (m.anime !== undefined) return !!m.anime;
    var g = m.genres || m.genre || [];
    return g.indexOf('Animation') >= 0 && /^Japan/.test(m.country || '');
  }
  // una página de resultados de TMDB como carátulas, con si hay más páginas
  function tmdbPage(path, k) {
    return tmdbGet(path).then(function (d) {
      return { metas: (d.results || []).map(function (x) { return tmdbMeta(x, k); }), more: (d.page || 1) < Math.min(d.total_pages || 1, 500) };
    });
  }
  function tmdbList(path, k) { return tmdbPage(path, k).then(function (r) { return r.metas; }); }

  function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

  // plataformas con suscripción en España: por su id de TMDB y, si ya no está, por el nombre (cambian: Max → HBO Max).
  // Apple TV+ solo por id: ahora se llama «Apple TV», igual que la tienda de alquiler de Apple
  var PLATFORMS = [
    { k: 'netflix', name: 'Netflix', ids: [8], m: ['netflix'] },
    { k: 'prime', name: 'Prime Video', ids: [119], m: ['amazonprimevideo', 'primevideo'] },
    { k: 'disney', name: 'Disney+', ids: [337], m: ['disneyplus'] },
    { k: 'max', name: 'HBO Max', ids: [1899, 384], m: ['hbomax', 'max'] },
    { k: 'apple', name: 'Apple TV+', ids: [350], m: ['appletvplus'] },
    { k: 'movistar', name: 'Movistar Plus+', ids: [149], m: ['movistarplusplus', 'movistarplus'] },
    { k: 'skyshowtime', name: 'SkyShowtime', ids: [1773], m: ['skyshowtime'], off: true },
    { k: 'filmin', name: 'Filmin', ids: [63], m: ['filmin'], off: true },
    { k: 'crunchyroll', name: 'Crunchyroll', ids: [283], m: ['crunchyroll'], anime: true }
  ];
  var providerLists = {};
  function platformId(k, pl) {
    if (!providerLists[k]) {
      providerLists[k] = tmdbGet('/watch/providers/' + k + '?watch_region=ES').then(function (d) { return d.results || []; })
        .catch(function (e) { delete providerLists[k]; throw e; });
    }
    return providerLists[k].then(function (list) {
      var norm = function (n) { return String(n).toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, ''); };
      var i, j;
      for (i = 0; i < pl.ids.length; i++) {
        for (j = 0; j < list.length; j++) if (list[j].provider_id === pl.ids[i]) return pl.ids[i];
      }
      for (i = 0; i < pl.m.length; i++) {
        for (j = 0; j < list.length; j++) if (norm(list[j].provider_name) === pl.m[i]) return list[j].provider_id;
      }
      return 0;
    });
  }
  // con suscripción en esa plataforma (en España)
  function platformParams(id) { return '&with_watch_providers=' + id + '&watch_region=ES&with_watch_monetization_types=flatrate'; }
  // sin telediarios, programas de entrevistas ni culebrones
  var TV_JUNK = '&without_genres=10763,10767,10766';

  // ---------------------------------------------------------------- tráileres (con el debrid, en el reproductor)

  // la tele no reproduce YouTube dentro de la app, pero AllDebrid y Real-Debrid convierten un enlace de YouTube en el vídeo
  // directo: el tráiler se ve en el reproductor de StremTV
  function trailerId(meta) {
    var t = meta._tmdb && meta._tmdb.trailer;
    (meta.trailerStreams || []).forEach(function (s) { if (!t && s.ytId) t = s.ytId; });
    (meta.trailers || []).forEach(function (s) { if (!t && s.source && (!s.type || s.type === 'Trailer')) t = s.source; });
    return /^[\w-]{11}$/.test(t || '') ? t : '';
  }

  // AllDebrid: /link/unlock da el enlace o, en webs de vídeo como YouTube, las calidades disponibles; la elegida se pide a
  // /link/streaming, que puede tardar (delayed: se pregunta cada 2 s, como mucho 30 s)
  function allDebridGet(path) {
    return xhr('GET', 'https://api.alldebrid.com/v4/' + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'agent=stremtv',
      { timeout: 20000, headers: { Authorization: 'Bearer ' + settings.key } }).then(strictJSON).then(function (r) {
      if (r.status !== 'success') throw new Error((r.error && (r.error.message || r.error.code)) || 'AllDebrid');
      return r.data;
    });
  }
  // la calidad más alta que la tele reproduce bien: mp4, hasta 1080p y con sonido si se sabe
  function bestStream(streams) {
    var ok = streams.filter(function (s) { return (!s.ext || s.ext === 'mp4') && (parseInt(s.quality, 10) || 0) <= 1080; });
    ok.sort(function (a, b) { return (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0); });
    return ok[0] || streams[0];
  }
  function debridTrailer(yt) {
    var link = 'https://www.youtube.com/watch?v=' + yt;
    if (!settings.key) return Promise.reject(new Error(tr('sin clave de debrid')));
    if (settings.debrid === 'realdebrid') {
      return xhr('POST', 'https://api.real-debrid.com/rest/1.0/unrestrict/link', { timeout: 20000, body: 'link=' + encodeURIComponent(link),
        headers: { Authorization: 'Bearer ' + settings.key, 'Content-Type': 'application/x-www-form-urlencoded' } }).then(strictJSON).then(function (d) {
        if (!d.download) throw new Error('Real-Debrid');
        return { url: d.download, quality: d.quality || '', file: d.filename || '' };
      });
    }
    return allDebridGet('link/unlock?link=' + encodeURIComponent(link)).then(function (d) {
      if (d.link) return { url: d.link, quality: '', file: d.filename || '' };
      var st = bestStream(d.streams || []);
      if (!st) throw new Error(tr('sin vídeo'));
      return allDebridGet('link/streaming?id=' + encodeURIComponent(d.id) + '&stream=' + encodeURIComponent(st.id)).then(function (x) {
        var out = function (url) { return { url: url, quality: st.quality ? st.quality + 'p' : '', file: d.filename || '' }; };
        if (x.link) return out(x.link);
        if (!x.delayed) throw new Error(tr('sin vídeo'));
        var tries = 0;
        return (function poll() {
          return new Promise(function (r) { setTimeout(r, 2000); }).then(function () {
            return allDebridGet('link/delayed?id=' + encodeURIComponent(x.delayed));
          }).then(function (dl) {
            if (dl.status === 2 && dl.link) return out(dl.link);
            if (dl.status === 3 || ++tries >= 15) throw new Error(tr('sin vídeo'));
            return poll();
          });
        })();
      });
    });
  }

  var trailerBusy = false;
  function playTrailer(yt, meta) {
    if (trailerBusy) return;
    trailerBusy = true;
    var from = stack[stack.length - 1];
    toast(tr('Cargando el tráiler…'), 20000);
    debridTrailer(yt).then(function (v) {
      trailerBusy = false;
      if (!isTop(from)) return; // ha salido de la ficha mientras se pedía
      $('#toast').classList.add('hidden');
      logEv('tráiler', DEBRID_NAMES[settings.debrid], { id: yt, calidad: v.quality });
      var name = (meta && meta.name) || '';
      Player.open({ url: v.url, quality: v.quality, file: v.file, addon: 'YouTube' },
        { trailer: true, type: 'trailer', videoId: 'trailer:' + yt, metaId: 'trailer:' + yt, name: name, poster: meta && meta.poster,
          label: tr('Tráiler') + (name ? ' · ' + name : ''), desc: meta && meta.description });
    }, function (e) {
      trailerBusy = false;
      logEv('tráiler', 'el debrid no lo da', { id: yt, error: e.message });
      if (isTop(from)) toast(tr('{0} no ha podido darte el tráiler ({1})', DEBRID_NAMES[settings.debrid], e.message), 6000);
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
