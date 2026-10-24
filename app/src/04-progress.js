  // ---------------------------------------------------------------- progreso

  var progress = load('progress', {});
  function saveProgress(entry) {
    progress[entry.videoId] = entry;
    capByTs(progress, 200);
    save('progress', progress);
  }
  function continueList() {
    var byMeta = {};
    // lo último de cada título: si ya está visto (p. ej. un episodio posterior), los anteriores a medias no cuentan
    Object.keys(progress).forEach(function (id) {
      var p = progress[id];
      if (!byMeta[p.metaId] || byMeta[p.metaId].ts < p.ts) byMeta[p.metaId] = p;
    });
    return Object.keys(byMeta).map(function (k) { return byMeta[k]; })
      .filter(function (p) { return !p.done && p.d && p.t >= 60; })
      .sort(function (a, b) { return b.ts - a.ts; }).slice(0, 20);
  }

  // marcar como visto (o quitarlo) a mano: en la tele y, con Trakt vinculado, en su historial.
  // ctxs: contextos como los del reproductor (videoId, metaId, type, name, poster, epLabel, imdb, imdbS, imdbE)
  function setSeen(ctxs, on) {
    var now = Date.now();
    ctxs.forEach(function (c, i) {
      if (on) {
        progress[c.videoId] = { videoId: c.videoId, metaId: c.metaId, type: c.type, name: c.name, poster: c.poster,
          label: c.epLabel ? c.name + ' · ' + c.epLabel.split(' · ')[0] : c.name, t: 0, d: 0, done: true, ts: now + i };
      } else delete progress[c.videoId];
      if (c.type === 'movie' && c.imdb) { if (on) Seen.movies[c.imdb] = true; else delete Seen.movies[c.imdb]; }
    });
    capByTs(progress, 200);
    save('progress', progress);
    if (!Trakt.linked()) return Promise.resolve();
    return Trakt.markWatched(ctxs, on).catch(function (e) { toast('Trakt: ' + e.message); });
  }

  // Mi lista: con Trakt, su lista; sin Trakt, guardada en la tele (y en la copia de seguridad)
  var myList = load('mylist', {});
  function listKey(m) { return imdbOfMeta(m) || String(m.id || m.metaId || ''); }
  function inMyList(m) { return Trakt.linked() ? !!Trakt.watchlist[imdbOfMeta(m)] : !!myList[listKey(m)]; }
  function toggleMyList(m) {
    if (Trakt.linked()) {
      var imdb = imdbOfMeta(m);
      if (!imdb) { toast(tr('Trakt no puede identificar este título (no tiene ID de IMDb)')); return Promise.resolve(false); }
      return Trakt.toggleWatchlist(m.type, imdb).then(function (added) {
        toast(added ? tr('Añadido a tu lista de Trakt') : tr('Quitado de tu lista de Trakt'));
        return added;
      }).catch(function (e) { toast('Trakt: ' + e.message); return inMyList(m); });
    }
    var k = listKey(m);
    if (myList[k]) delete myList[k];
    else myList[k] = { id: m.id || m.metaId, type: m.type, name: m.name, poster: m.poster, ts: Date.now() };
    save('mylist', myList);
    toast(myList[k] ? tr('Añadido a Mi lista') : tr('Quitado de Mi lista'));
    return Promise.resolve(!!myList[k]);
  }
  function myListMetas() {
    return Object.keys(myList).map(function (k) { return myList[k]; }).sort(function (a, b) { return b.ts - a.ts; });
  }
  function canSimilar(imdb) { return !!(imdb && (tmdbOn() || trakt.clientId)); }
