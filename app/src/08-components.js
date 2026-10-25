  // ---------------------------------------------------------------- componentes

  function card(meta, onclick, extra) {
    var c = el('div', 'card');
    var p = el('div', 'poster');
    c._img = smallPoster(meta.poster);
    if (!c._img) p.appendChild(el('div', 'noimg', esc(meta.name)));
    if (extra && extra.pct) {
      var bar = el('div', 'pbar');
      bar.style.width = Math.round(extra.pct * 100) + '%';
      p.appendChild(bar);
    }
    if (extra && extra.isNew) p.appendChild(el('div', 'new', esc(tr('Nuevo'))));
    if (extra && extra.left > 0) p.appendChild(leftBadge(extra.left));
    // «Ganadora» o el año en las filas de premios
    if (extra && extra.badge) p.appendChild(el('div', 'new award', esc(extra.badge)));
    // ✓ en lo ya visto (en las filas de progreso o historial no hace falta) y la nota al enfocarla
    // (en las pantallas con cabecera grande la nota sale en la cabecera y la de la carátula no se ve)
    if ((!extra || extra.badge) && isSeenMeta(meta)) p.appendChild(el('div', 'mark', '✓'));
    if (meta.imdbRating && parseFloat(meta.imdbRating)) p.appendChild(el('div', 'rate', '★ ' + esc(num(meta.imdbRating))));
    c.appendChild(p);
    c.appendChild(el('div', 'name', esc(extra && extra.label ? extra.label : meta.name)));
    c._imdb = extra && extra.label ? null : imdbOfMeta(meta);
    c._meta = meta;
    return focusable(c, onclick);
  }

  // episodios pendientes de la serie (99+ para no tapar la carátula)
  function leftBadge(n) { return el('div', 'left', n > 99 ? '99+' : String(n)); }

  // fila de carátulas vacías mientras llega la de verdad
  function skeleton() {
    var sc = el('div', 'hscroll skel');
    for (var i = 0; i < 8; i++) sc.appendChild(el('div', 'card', '<div class="poster"></div><div class="name"></div>'));
    return sc;
  }

  function loadImages(cards, upto) {
    for (var i = 0; i < cards.length && i <= upto; i++) {
      var c = cards[i];
      if (c._img && !c._loaded) {
        c._loaded = true;
        posterImg(c);
      }
      if (c._loaded || !c._img) nameCard(c);
    }
  }

  // la carátula se pone cuando ha cargado; si no existe (404 en metahub), el nombre en su lugar.
  // Si falló con la red caída (o comprobándose), se vuelve a pedir cuando vuelva
  function posterImg(c) {
    var img = new Image(), p = c.firstChild;
    img.onload = function () {
      p.style.backgroundImage = 'url("' + c._img + '")';
      var n = p.querySelector('.noimg');
      if (n) p.removeChild(n);
    };
    img.onerror = function () {
      if (!p.querySelector('.noimg')) p.appendChild(el('div', 'noimg', esc(c._meta.name)));
      if (Net.down || Net.checking) Net.whenBack(function () { if (document.body.contains(c)) posterImg(c); });
    };
    img.src = c._img;
  }

  // título en español de la tarjeta (solo las que ya se ven)
  function nameCard(c) {
    if (!c._imdb || c._named || !tmdbOn()) return;
    c._named = true;
    tmdbFind(c._imdb).then(function (r) { if (r.n) c.lastChild.textContent = r.n; }).catch(function () { c._named = false; });
  }

  function posterRow(title, metas, onPick, extras) {
    var row = el('div', 'row');
    row.appendChild(el('div', 'row-title', esc(title)));
    var sc = el('div', 'hscroll');
    sc.style.position = 'relative';
    var cards = [];
    metas.forEach(function (m, i) {
      var c = card(m, function () { onPick(m, i); }, extras ? extras[i] : null);
      c._onfocus = function () { loadImages(cards, i + 9); };
      cards.push(c);
      sc.appendChild(c);
    });
    loadImages(cards, 8);
    row.appendChild(sc);
    return row;
  }

  // fila que se rellena cuando llega la promesa (metas con .pct/.label/.isNew/.left/.badge opcionales; la lista puede traer
  // .title si el título depende de los datos, como «Óscar 2026»). Si en vez de la promesa se da
  // una función que la crea, la fila que falla por la red se vuelve a pedir sola cuando vuelve la conexión
  function promiseRow(container, title, promise, onPick, hideIfEmpty, max) {
    var row = el('div', 'row');
    row.appendChild(el('div', 'row-title', esc(title)));
    row.appendChild(skeleton());
    container.appendChild(row);
    var make = typeof promise === 'function' ? promise : null;
    (function run(p) {
      p.then(function (metas) {
        bootMark('firstRow');
        if (!row.parentNode) return;
        var t = (metas && metas.title) || title;
        metas = (metas || []).slice(0, max || 40);
        if (!metas.length && hideIfEmpty) { container.removeChild(row); return; }
        var hadFocus = Nav.cur && row.contains(Nav.cur);
        var fresh = metas.length
          ? posterRow(t, metas, onPick, metas.map(function (m) {
            return m.pct || m.label || m.isNew || m.left || m.badge ? { pct: m.pct, label: m.label, isNew: m.isNew, left: m.left, badge: m.badge } : null;
          }))
          : el('div', 'row', '<div class="row-title">' + esc(t) + '</div><div class="empty">' + tr('Sin resultados') + '</div>');
        container.replaceChild(fresh, row);
        if (hadFocus) Nav.setRoot(Nav.root);
        primeHero(container);
      }).catch(function (e) {
        if (!row.parentNode) return;
        var gone = function () { if (hideIfEmpty && row.parentNode) container.removeChild(row); };
        row.replaceChild(el('div', 'empty', esc(tr('No se pudo cargar ({0})', e.message))), row.lastChild);
        if (!make || e.status !== 0) { gone(); return; }
        // mientras se comprueba la red, la fila se queda con el aviso; si la red estaba bien, como siempre
        Net.whenBack(function () {
          if (!row.parentNode) return;
          row.replaceChild(skeleton(), row.lastChild);
          run(make());
        }, gone);
      });
    })(make ? make() : promise);
  }

  function asyncRow(container, title, url, onPick) {
    promiseRow(container, title, function () {
      return Promise.all([getJSON(url), seenReady()]).then(function (r) { return filterSeen(r[0].metas || []); });
    }, onPick);
  }

  var metaOpening = {}; // tmdb:… -> consulta de su id de IMDb en curso
  function openMeta(meta) {
    var id = String(meta.id || meta.metaId || '');
    var tm = /^tmdb:(movie|tv):(\d+)$/.exec(id);
    if (tm) { // resultado de la búsqueda en español: abrir por su id de IMDb
      // solo si sigue delante la pantalla desde la que se pidió (ni tras Atrás ni dos veces por pulsar OK otra vez)
      var job = metaOpening[id];
      if (job) { job.from = stack[stack.length - 1]; return; } // ya se está pidiendo: vale la misma respuesta
      job = metaOpening[id] = { from: stack[stack.length - 1] };
      toast(tr('Cargando…'), 1500);
      tmdbGet('/' + tm[1] + '/' + tm[2] + '/external_ids').then(function (x) {
        delete metaOpening[id];
        if (!isTop(job.from)) return;
        if (x.imdb_id) push(detailScreen(meta.type, x.imdb_id));
        else toast(tr('Este título no tiene ID de IMDb y no se puede reproducir'));
      }).catch(function (e) { delete metaOpening[id]; if (isTop(job.from)) toast(tr('No se pudo cargar ({0})', e.message)); });
      return;
    }
    if (meta.imdb_id && id.indexOf('tt') !== 0 && id.indexOf('kitsu:') !== 0) id = meta.imdb_id;
    push(detailScreen(meta.type === 'anime' && id.indexOf('tt') === 0 ? 'series' : meta.type, id));
  }
