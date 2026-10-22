  // ---------------------------------------------------------------- pantalla: detalle

  function detailScreen(type, id) {
    var root = el('div', 'screen');
    var bd = el('div', 'backdrop');
    root.appendChild(bd);
    root.appendChild(el('div', 'shade'));
    var d = el('div', 'detail');
    d.appendChild(el('div', 'loading', tr('Cargando…')));
    root.appendChild(d);
    root.appendChild(el('div', 'keys-legend', '<i class="k-red"></i>' + tr('Mi lista') + '<i class="k-green"></i>' + tr('Visto') +
      '<i class="k-yellow"></i>' + tr('Más como esto')));
    var screen = { el: root };
    var meta = null, curSeason = null, episodesBox = null, actions = null;
    var traktSeen = {}, traktNext = null, showSeen = false, progressRequested = false, traktResume = {};

    function listMeta() { return { id: meta.id, type: type, name: meta.name, poster: meta.poster, imdb: imdbOf() }; }
    var listBtn = null;
    function paintListBtn() { if (listBtn) listBtn.textContent = inMyList(listMeta()) ? tr('✓ En mi lista') : tr('＋ Mi lista'); }
    function toggleList() { toggleMyList(listMeta()).then(paintListBtn); }
    function watchlistButton(container) {
      if (Trakt.linked() && !imdbOf()) return; // anime sin correspondencia en IMDb: Trakt no lo puede identificar
      listBtn = el('div', 'btn small');
      paintListBtn();
      focusable(listBtn, toggleList);
      container.appendChild(listBtn);
    }

    // reparto: con TMDB, cada actor abre su filmografía; sin clave, solo los nombres de Cinemeta
    function castButton(container) {
      if (!(meta.cast && meta.cast.length) && !(meta._tmdb && tmdbOn())) return;
      var b = el('div', 'btn small', tr('Reparto'));
      focusable(b, function () {
        var names = function () {
          return (meta.cast || []).slice(0, 15).map(function (n) { return { label: n, value: 0 }; });
        };
        var show = function (items) {
          if (!items.length) { toast(tr('Sin datos de reparto')); return; }
          menu(tr('Reparto'), items, function (it) {
            if (it.value) push(personScreen(it.value, it.name));
            else if (!tmdbOn()) toast(tr('Con la clave de TMDB (Ajustes) puedes ver la filmografía de cada actor'));
          });
        };
        if (!meta._tmdb || !tmdbOn()) { show(names()); return; }
        tmdbGet('/' + meta._tmdb.k + '/' + meta._tmdb.id + '/credits').then(function (d) {
          if (!isTop(screen)) return; // ha salido de la ficha (o abierto otra cosa) mientras llegaba
          var cast = (d.cast || []).slice(0, 20).map(function (c) {
            return { label: c.name + (c.character ? ' · ' + c.character : ''), value: c.id, name: c.name };
          });
          show(cast.length ? cast : names());
        }).catch(function () { if (isTop(screen)) show(names()); });
      });
      container.appendChild(b);
    }

    function similarButton(container) {
      if (!canSimilar(imdbOf())) return; // hace falta TMDB o una app de Trakt
      var b = el('div', 'btn small', tr('Más como esto'));
      focusable(b, function () { push(similarScreen(type, imdbOf(), meta.name)); });
      container.appendChild(b);
    }

    var isAnime = String(id).indexOf('kitsu:') === 0;
    function imdbOf() { return imdbOfMeta(meta); }

    var metaFrom = isAnime ? ANIME + '/meta/anime/' + id + '.json' : CINEMETA + '/meta/' + type + '/' + id + '.json';
    if (!isAnime && String(id).indexOf('tt') !== 0) {
      var own = addonsFor('meta', type, id)[0];
      metaFrom = own ? own.url + '/meta/' + type + '/' + id + '.json' : null;
    }
    (metaFrom ? getJSON(metaFrom) : Promise.reject(new Error(tr('sin datos')))).then(function (res) {
      meta = res.meta;
      if (!meta) throw new Error(tr('sin datos'));
      if (isAnime) type = meta.type === 'movie' ? 'movie' : 'series';
      if (!tmdbOn() || !imdbOf()) return render();
      return withTimeout(tmdbDetail(imdbOf()), 2500).then(function (es) {
        if (es) {
          if (es.name) meta.name = es.name;
          if (es.overview) meta.description = es.overview;
          if (es.genres.length) meta.genres = es.genres;
          meta._tmdb = es;
        }
      }, function () { /* sin traducción: en inglés */ }).then(render);
    }).catch(function (e) {
      d.innerHTML = '';
      d.appendChild(el('div', 'loading', esc(tr('No se pudo cargar ({0})', e.message))));
    });

    function infoParts() {
      var parts = [];
      if (meta.releaseInfo || meta.year) parts.push(meta.releaseInfo || meta.year);
      if (meta.runtime) parts.push(meta.runtime);
      if (meta.imdbRating && parseFloat(meta.imdbRating)) parts.push('★ ' + num(meta.imdbRating));
      if (meta.genres && meta.genres.length) parts.push(meta.genres.slice(0, 3).join(', '));
      return parts;
    }
    function info() { return infoParts().map(function (p) { return '<span' + (p.charAt(0) === '★' ? ' class="star"' : '') + '>' + esc(p) + '</span>'; }).join(''); }

    function render() {
      if (screen.closed) return; // cerrada mientras cargaba
      var focusEl = null;
      if (meta.background) bd.style.backgroundImage = 'url("' + meta.background + '")';
      d.innerHTML = '';
      // el logo del título en vez del texto (el nombre se queda dentro, oculto); el texto solo si no hay logo o tarda
      var h1 = el('h1', null, '<span>' + esc(meta.name) + '</span>');
      d.appendChild(h1);
      titleLogo(h1, meta.logo || (imdbOf() ? metahubImg('logo', imdbOf()) : ''), 'd-logo', '');
      d.appendChild(el('div', 'meta-line', info()));
      var desc = el('div', 'desc', esc(meta.description || ''));
      d.appendChild(desc);
      actions = el('div');
      d.appendChild(actions);
      if (type === 'movie') {
        renderMovieActions();
      } else {
        desc.style.maxHeight = '114px';
        focusEl = renderSeries();
      }
      if (isTop(screen)) Nav.setRoot(root, focusEl);
      else screen.lastFocus = focusEl;
      screen.autoFocus = focusEl || (isTop(screen) ? Nav.cur : null);
      if (Trakt.linked() && imdbOf()) Trakt.resumeMap().then(alive(screen, applyResume));
    }

    function applyResume(map) {
      traktResume = map;
      var mine = imdbOf(), any = false;
      for (var k in map) if (k === mine || k.indexOf(mine + ':') === 0) any = true;
      if (!any || !meta) return;
      var untouched = Nav.root === root && Nav.cur === screen.autoFocus;
      if (type === 'movie') {
        renderMovieActions();
        if (untouched || (Nav.root === root && !root.contains(Nav.cur))) { Nav.setRoot(root, actions.firstChild); screen.autoFocus = Nav.cur; }
        return;
      }
      if (!episodesBox || curSeason === null) return;
      var idx = Nav.cur && Nav.cur.parentNode === episodesBox ? Array.prototype.indexOf.call(episodesBox.children, Nav.cur) : -1;
      var target = renderEpisodes(seasonsOf().map[curSeason]);
      if (Nav.root !== root) return;
      if (untouched && target) { Nav.setRoot(root, target); screen.autoFocus = Nav.cur; }
      else if (idx >= 0) Nav.setRoot(root, episodesBox.children[Math.min(idx, episodesBox.children.length - 1)]);
    }

    // posición de Trakt (de otro dispositivo) si la tele no tiene una propia: % entre 1 y 95
    function resumePct(key) {
      var x = traktResume[key];
      return x && x >= 1 && x < 95 ? Math.round(x) : 0;
    }

    function base() {
      return { type: type, metaId: meta.id, imdb: imdbOf(), name: meta.name, poster: meta.poster, background: meta.background,
        runtime: parseRuntime(meta.runtime), desc: meta.description || '', info: infoParts().join(' · ') };
    }

    function renderMovieActions() {
      actions.innerHTML = '';
      var p = progress[meta.id];
      var local = p && !p.done && p.t > 60, pct = p ? 0 : resumePct(imdbOf()); // si la tele tiene progreso propio, manda el suyo
      var play = el('div', 'btn primary', local ? tr('▶ Continuar ({0})', fmtTime(p.t)) : pct ? tr('▶ Continuar ({0} %)', pct) : tr('▶ Ver'));
      focusable(play, function () {
        push(streamsScreen(extend(base(), { videoId: meta.id, label: meta.name, startAt: p && !p.done ? p.t : 0, startPct: pct, autoPlay: settings.quickPlay })));
      });
      actions.appendChild(play);
      if (!screen.closed) prefetchStreams(type, meta.id); // cerrada antes de cargar: nada que adelantar
      if (local || pct) {
        var fromStart = el('div', 'btn', tr('Desde el principio'));
        focusable(fromStart, function () {
          push(streamsScreen(extend(base(), { videoId: meta.id, label: meta.name, startAt: 0, autoPlay: settings.quickPlay })));
        });
        actions.appendChild(fromStart);
      }
      var seenB = el('div', 'btn small', movieSeen() ? tr('✓ Vista') : tr('Marcar como vista'));
      focusable(seenB, toggleMovieSeen);
      actions.appendChild(seenB);
      watchlistButton(actions);
      similarButton(actions);
      castButton(actions);
    }

    function movieCtx() { return extend(base(), { videoId: meta.id, label: meta.name }); }
    function movieSeen() { return isSeenMeta({ id: meta.id, type: 'movie', imdb: imdbOf() }); }
    function toggleMovieSeen() {
      var on = !movieSeen();
      setSeen([movieCtx()], on);
      toast(on ? tr('Marcada como vista') : tr('Marcada como no vista'));
      var wasBtn = Nav.cur && Nav.cur.parentNode === actions ? Array.prototype.indexOf.call(actions.children, Nav.cur) : -1;
      renderMovieActions();
      if (wasBtn >= 0 && Nav.root === root) Nav.setRoot(root, actions.children[Math.min(wasBtn, actions.children.length - 1)]);
    }

    // verde en un episodio: visto/no visto; en una temporada: toda la temporada emitida
    function toggleSeenAtFocus() {
      if (type === 'movie') { toggleMovieSeen(); return; }
      var cur = Nav.cur, s = seasonsOf(), eps, idx = -1, seasonTab = null;
      if (cur && cur._ep) { eps = [cur._ep]; idx = Array.prototype.indexOf.call(episodesBox.children, cur); }
      else if (cur && cur._season !== undefined) {
        seasonTab = cur._season;
        eps = (s.map[seasonTab] || []).filter(function (v) { return !(v.released && new Date(v.released) > new Date()); });
      } else { toast(tr('Ponte sobre un episodio o una temporada y pulsa el botón verde')); return; }
      if (!eps.length) return;
      var on = !eps.every(isSeenEp);
      setSeen(eps.map(epCtx), on);
      eps.forEach(function (v) { if (on) traktSeen[traktKey(v)] = true; else delete traktSeen[traktKey(v)]; });
      toast(seasonTab !== null ? tr(on ? 'Temporada {0} marcada como vista' : 'Temporada {0} marcada como no vista', seasonTab)
        : on ? tr('Marcado como visto') : tr('Marcado como no visto'));
      renderSeries();
      if (Nav.root !== root) return;
      if (seasonTab !== null) {
        var tabs = actions.querySelectorAll('.seasons .btn');
        for (var i = 0; i < tabs.length; i++) if (tabs[i]._season === seasonTab) { Nav.setRoot(root, tabs[i]); return; }
        Nav.setRoot(root);
      } else if (episodesBox && episodesBox.children.length) Nav.setRoot(root, episodesBox.children[Math.min(idx, episodesBox.children.length - 1)]);
      else Nav.setRoot(root);
    }

    // botones de colores del mando (la leyenda sale abajo a la derecha)
    screen.onKey = function (code) {
      if (!meta || !actions) return false;
      if (code === K.RED) { toggleList(); return true; }
      if (code === K.GREEN) { toggleSeenAtFocus(); return true; }
      if (code === K.YELLOW) { if (canSimilar(imdbOf())) push(similarScreen(type, imdbOf(), meta.name)); return true; }
      return false;
    };

    function seasonsOf() {
      var map = {};
      (meta.videos || []).forEach(function (v) {
        if (typeof v.season !== 'number') return;
        (map[v.season] = map[v.season] || []).push(v);
      });
      var nums = Object.keys(map).map(Number).sort(function (a, b) {
        if (a === 0) return 1; if (b === 0) return -1; return a - b;
      });
      nums.forEach(function (n) { map[n].sort(function (a, b) { return a.episode - b.episode; }); });
      return { nums: nums, map: map };
    }

    // temporada:episodio en IMDb/Trakt (el anime de Kitsu trae su propia numeración)
    function traktKey(v) {
      return (v.imdbSeason !== undefined ? v.imdbSeason : v.season) + ':' + (v.imdbEpisode !== undefined ? v.imdbEpisode : v.episode);
    }

    function lastWatchedSeason(seasons) {
      var best = null;
      seasons.nums.forEach(function (n) {
        seasons.map[n].forEach(function (v) {
          var p = progress[v.id];
          if (p && (!best || p.ts > best.ts)) best = { ts: p.ts, season: n };
        });
      });
      return best ? best.season : null;
    }

    // siguiente episodio ya emitido (sin pasar a los especiales)
    function nextEpisode(v) {
      var s = seasonsOf(), list = [];
      s.nums.forEach(function (n) { if (n !== 0) list = list.concat(s.map[n]); });
      var i = list.indexOf(v), n = i >= 0 ? list[i + 1] : null;
      if (!n || (n.released && new Date(n.released) > new Date())) return null;
      return n;
    }

    // contexto de reproducción de un episodio; next() da el del siguiente para encadenarlos
    function epCtx(v) {
      var p = progress[v.id];
      var label = tr('T{0}:E{1}', v.season, v.episode) + ' · ' + (v.name || v.title || tr('Episodio {0}', v.episode));
      return extend(base(), {
        videoId: v.id, label: meta.name + ' — ' + label, epLabel: label,
        imdb: v.imdb_id || imdbOf(),
        imdbS: v.imdbSeason !== undefined ? v.imdbSeason : v.season,
        imdbE: v.imdbEpisode !== undefined ? v.imdbEpisode : v.episode,
        startAt: p && !p.done ? p.t : 0,
        startPct: p ? 0 : resumePct(imdbOf() + ':' + traktKey(v)),
        runtime: parseRuntime(v.runtime) || parseRuntime(meta.runtime),
        desc: v.overview || v.description || meta.description || '',
        next: function () { var n = nextEpisode(v); return n ? epCtx(n) : null; }
      });
    }

    // episodio para «▶ Ver»: el que está a medias, el siguiente al último visto (aquí o en Trakt) o el primero sin ver
    function nextToWatch() {
      var s = seasonsOf(), all = [], last = null, i;
      s.nums.forEach(function (n) { if (n !== 0) all = all.concat(s.map[n]); });
      all.forEach(function (v) { var p = progress[v.id]; if (p && (!last || p.ts > last.p.ts)) last = { v: v, p: p }; });
      if (last) return last.p.done ? (nextEpisode(last.v) ? { v: nextEpisode(last.v) } : null) : { v: last.v, resume: true };
      for (i = 0; i < all.length; i++) if (resumePct(imdbOf() + ':' + traktKey(all[i]))) return { v: all[i], resume: true };
      for (i = 0; traktNext && i < all.length; i++) if (traktKey(all[i]) === traktNext) return { v: all[i] };
      for (i = 0; i < all.length; i++) {
        var v = all[i];
        if (v.released && new Date(v.released) > new Date()) return null;
        if (!isSeenEp(v)) return { v: v };
      }
      return null;
    }

    function isSeenEp(v) {
      var p = progress[v.id];
      return !!((p && p.done) || traktSeen[traktKey(v)]);
    }

    function hidingSeen() { return settings.hideWatched && !showSeen; }

    function renderSeries() {
      actions.innerHTML = '';
      var seasons = seasonsOf();
      if (!seasons.nums.length) {
        actions.appendChild(el('div', 'loading', tr('Sin episodios disponibles')));
        return null;
      }
      var seenCount = 0;
      seasons.nums.forEach(function (n) { seasons.map[n].forEach(function (v) { if (isSeenEp(v)) seenCount++; }); });
      var nums = !hidingSeen() ? seasons.nums : seasons.nums.filter(function (n) {
        return seasons.map[n].some(function (v) { return !isSeenEp(v); });
      });
      if (curSeason === null || nums.indexOf(curSeason) < 0) {
        var lw = lastWatchedSeason(seasons);
        curSeason = lw !== null && nums.indexOf(lw) >= 0 ? lw : (nums.length ? nums[0] : null);
      }

      // fila superior: ver el siguiente, mi lista, más como esto, reparto y mostrar/ocultar vistos
      var top = el('div');
      var nx = nextToWatch();
      if (nx) {
        var code = tr('T{0}:E{1}', nx.v.season, nx.v.episode);
        var play = el('div', 'btn primary', nx.resume ? tr('▶ Continuar {0}', code) : tr('▶ Ver {0}', code));
        focusable(play, function () { push(streamsScreen(extend(epCtx(nx.v), { autoPlay: settings.quickPlay }))); });
        top.appendChild(play);
        if (!screen.closed) prefetchStreams(type, nx.v.id);
      }
      watchlistButton(top);
      similarButton(top);
      castButton(top);
      var toggle = null;
      if (settings.hideWatched && seenCount) {
        toggle = el('div', 'btn', showSeen ? tr('Ocultar vistos') : seenCount === 1 ? tr('Mostrar 1 visto') : tr('Mostrar {0} vistos', seenCount));
        focusable(toggle, function () {
          showSeen = !showSeen;
          renderSeries();
          var again = actions.querySelectorAll('.btn');
          for (var i = 0; i < again.length; i++) if (/visto|watched/i.test(again[i].textContent)) { Nav.setRoot(root, again[i]); return; }
          Nav.setRoot(root);
        });
        top.appendChild(toggle);
      }
      if (top.children.length) actions.appendChild(top);

      if (Trakt.linked() && imdbOf() && !progressRequested) {
        progressRequested = true;
        Trakt.showProgress(imdbOf()).then(alive(screen, function (tp) {
          traktSeen = tp.seen;
          traktNext = tp.next;
          var untouched = Nav.root === root && Nav.cur === screen.autoFocus;
          // si no hay progreso local, ir a la temporada del siguiente episodio según Trakt
          if (traktNext && lastWatchedSeason(seasons) === null) {
            seasons.nums.forEach(function (n) {
              seasons.map[n].forEach(function (v) { if (traktKey(v) === traktNext) curSeason = n; });
            });
          }
          var target = renderSeries();
          // solo mover el foco si el usuario aún no se había movido
          if (Nav.root === root && (untouched || !root.contains(Nav.cur))) {
            Nav.setRoot(root, target);
            screen.autoFocus = Nav.cur;
          }
        })).catch(function () { /* sin datos de Trakt */ });
      }

      if (curSeason === null) {
        actions.appendChild(el('div', 'loading', tr('✓ Has visto todos los episodios emitidos.')));
        return toggle;
      }
      var sRow = el('div', 'seasons hscroll');
      sRow.style.position = 'relative';
      nums.forEach(function (n) {
        var b = el('div', 'btn' + (n === curSeason ? ' primary' : ''), n === 0 ? tr('Especiales') : tr('Temporada {0}', n));
        b._season = n;
        focusable(b, function () {
          curSeason = n;
          Array.prototype.forEach.call(sRow.children, function (x) { x.classList.remove('primary'); });
          b.classList.add('primary');
          renderEpisodes(seasons.map[n]);
        });
        sRow.appendChild(b);
      });
      actions.appendChild(sRow);
      episodesBox = el('div', 'vscroll');
      episodesBox.setAttribute('data-pad', '0');
      episodesBox.style.position = 'relative';
      episodesBox.style.height = top.children.length ? '440px' : '520px';
      actions.appendChild(episodesBox);
      return renderEpisodes(seasons.map[curSeason]);
    }

    // títulos de episodio en español: se piden una vez por temporada y se vuelve a pintar
    var tmdbSeasons = {};
    function translateEpisodes(eps) {
      if (!meta._tmdb || meta._tmdb.k !== 'tv') return;
      var need = {};
      eps.forEach(function (v) { need[v.imdbSeason !== undefined ? v.imdbSeason : v.season] = true; });
      Object.keys(need).forEach(function (n) {
        if (tmdbSeasons[n]) return;
        tmdbSeasons[n] = tmdbGet('/tv/' + meta._tmdb.id + '/season/' + n).then(alive(screen, function (d) {
          var names = {}, ovs = {}, mins = {};
          (d.episodes || []).forEach(function (e) {
            if (e.name && !/^(Episodio|Episode) \d+$/.test(e.name)) names[e.episode_number] = e.name; // sin traducir: se queda el original
            if (e.overview) ovs[e.episode_number] = e.overview;
            if (e.runtime) mins[e.episode_number] = e.runtime;
          });
          var changed = false;
          (meta.videos || []).forEach(function (v) {
            var s = v.imdbSeason !== undefined ? v.imdbSeason : v.season, e = v.imdbEpisode !== undefined ? v.imdbEpisode : v.episode;
            if (String(s) !== n) return;
            if (names[e] && v.name !== names[e]) { v.name = names[e]; v.title = names[e]; changed = true; }
            if (ovs[e] && v.overview !== ovs[e]) { v.overview = ovs[e]; changed = true; }
            if (mins[e] && !v.runtime) { v.runtime = mins[e] + ' min'; changed = true; }
          });
          if (!changed || !episodesBox || curSeason === null || Nav.root !== root) return;
          var idx = Nav.cur && Nav.cur.parentNode === episodesBox ? Array.prototype.indexOf.call(episodesBox.children, Nav.cur) : -1;
          renderEpisodes(seasonsOf().map[curSeason]);
          if (idx >= 0) Nav.setRoot(root, episodesBox.children[Math.min(idx, episodesBox.children.length - 1)]);
        })).catch(function () { /* se quedan en inglés */ });
      });
    }

    var epPrefetch = null;
    function renderEpisodes(eps) {
      translateEpisodes(eps);
      episodesBox.innerHTML = '';
      scrollTop0(episodesBox);
      var focusTarget = null;
      if (hidingSeen()) eps = eps.filter(function (v) { return !isSeenEp(v); });
      eps.forEach(function (v) {
        var p = progress[v.id];
        var tp = p ? 0 : resumePct(imdbOf() + ':' + traktKey(v));
        var seen = isSeenEp(v);
        var row = el('div', 'ep' + (seen ? ' seen' : ''));
        var th = el('div', 'thumb');
        if (seen) th.appendChild(el('div', 'mark', '✓'));
        if (v.thumbnail) th.style.backgroundImage = 'url("' + v.thumbnail + '")';
        if ((p && p.d) || tp) {
          var bar = el('div', 'pbar');
          bar.style.cssText = 'position:absolute;left:0;bottom:0;height:8px;background:#8a7dff;width:' + (tp || (p.done ? 100 : Math.round(p.t / p.d * 100))) + '%';
          th.appendChild(bar);
        }
        row.appendChild(th);
        var txt = el('div');
        var epTitle = v.name || v.title || tr('Episodio {0}', v.episode);
        txt.appendChild(el('div', 'ep-title', esc(v.episode + '. ' + epTitle) + (seen ? ' <span class="badge ok">' + tr('Visto') + '</span>' : '')));
        var date = v.released ? new Date(v.released) : null;
        var sub = [];
        if (date && !isNaN(date)) sub.push(date.toLocaleDateString ? fmtDate(date) : date.toDateString());
        if (v.runtime && parseRuntime(v.runtime)) sub.push(tr('{0} min', parseRuntime(v.runtime)));
        if (p && !p.done && p.t > 60) sub.push(tr('Continuar desde {0}', fmtTime(p.t)));
        else if (tp) sub.push(tr('Continuar desde el {0} % (Trakt)', tp));
        txt.appendChild(el('div', 'ep-sub', esc(sub.join(' · '))));
        var ov = v.overview || v.description || '';
        if (ov) txt.appendChild(el('div', 'ep-ov', esc(ov)));
        row.appendChild(txt);
        focusable(row, function () { push(streamsScreen(extend(epCtx(v), { autoPlay: settings.quickPlay }))); });
        row._ep = v;
        // quieto 1 s sobre un episodio: sus fuentes se piden ya, por si lo abre
        row._onfocus = function () {
          clearTimeout(epPrefetch);
          epPrefetch = setTimeout(function () { if (Nav.cur === row) prefetchStreams(type, v.id); }, 1000);
        };
        episodesBox.appendChild(row);
        if (!focusTarget && ((p && !p.done) || tp || traktNext === traktKey(v))) focusTarget = row;
      });
      return focusTarget;
    }

    screen.onResume = function () {
      if (!meta) return;
      if (type === 'movie') { renderMovieActions(); return; }
      // repintar (lo recién visto puede desaparecer) y colocarse en el siguiente pendiente
      var idx = -1, box = episodesBox;
      if (box && screen.lastFocus && screen.lastFocus.parentNode === box) idx = Array.prototype.indexOf.call(box.children, screen.lastFocus);
      var target = renderSeries();
      if (target) screen.lastFocus = target;
      else if (idx >= 0 && episodesBox && episodesBox.children.length) screen.lastFocus = episodesBox.children[Math.min(idx, episodesBox.children.length - 1)];
      else screen.lastFocus = null;
    };

    return screen;
  }
