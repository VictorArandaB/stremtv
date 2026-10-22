  // ---------------------------------------------------------------- ocultar lo ya visto

  var Seen = { movies: {}, shows: {}, at: 0, loading: null };

  // espera (como mucho una vez cada 10 min) a tener la lista de vistos de Trakt
  function seenReady() {
    if (!settings.hideWatched || !Trakt.linked()) return Promise.resolve();
    if (Date.now() - Seen.at < 600000) return Promise.resolve();
    if (!Seen.loading) {
      Seen.loading = Trakt.loadWatched().catch(function () { /* sin Trakt: se muestra todo */ }).then(function () { Seen.loading = null; });
    }
    return Seen.loading;
  }

  // id de IMDb de una carátula: el que trae o, si su id ya es de IMDb, ese
  function imdbOfMeta(m) {
    var id = String(m.id || m.metaId || '');
    return m.imdb || m.imdb_id || (id.indexOf('tt') === 0 ? id : null);
  }

  function isSeenMeta(m) {
    var id = String(m.id || '');
    var imdb = imdbOfMeta(m);
    if (m.type === 'movie') return !!((imdb && Seen.movies[imdb]) || (progress[id] && progress[id].done));
    return !!(imdb && Seen.shows[imdb]);
  }

  function filterSeen(metas) {
    if (!settings.hideWatched) return metas;
    return metas.filter(function (m) { return !isSeenMeta(m); });
  }

  // ---------------------------------------------------------------- navegación espacial

  function offsetWithin(e, c) {
    var l = 0, t = 0, n = e;
    while (n && n !== c) {
      l += n.offsetLeft; t += n.offsetTop;
      n = n.offsetParent;
    }
    return n === c ? { left: l, top: t } : null;
  }

  // desplazamiento animado (~0,18 s); Nav.move lo termina de golpe antes de medir posiciones.
  // El vertical no usa scrollTop: mueve los hijos con translate3d, que en la tele lo hace la GPU sin repintar
  // las carátulas (medido: 17-20 ms por fotograma frente a 60-85 ms con scrollTop). Los hijos que se añaden
  // después (filas que llegan tarde) reciben el mismo desplazamiento con un MutationObserver.
  // El horizontal sigue con scrollLeft: ya iba a 17 ms y con transform cada carátula sería una capa.
  function getPos(c, prop) { return prop === 'scrollTop' ? c._y || 0 : c[prop]; }
  function setPos(c, prop, v) {
    if (prop !== 'scrollTop') { c[prop] = v; return; }
    v = Math.round(v);
    if (v === c._y) return;
    c._y = v;
    if (!c._yObs && window.MutationObserver) {
      c._yObs = new MutationObserver(function () { shiftChildren(c); });
      c._yObs.observe(c, { childList: true });
    }
    shiftChildren(c);
  }
  function shiftChildren(c) {
    var t = c._y ? 'translate3d(0,' + -c._y + 'px,0)' : '';
    for (var n = c.firstElementChild; n; n = n.nextElementSibling) {
      if (n._ty === t) continue;
      n._ty = t;
      n.style.webkitTransform = t;
      n.style.transform = t;
    }
  }
  var scrolling = [];
  function scrollTarget(c, prop) { var a = c['_anim' + prop]; return a ? a.to : getPos(c, prop); }
  function animScroll(c, prop, to) {
    to = Math.round(to);
    var a = c['_anim' + prop];
    if (a) { a.from = getPos(c, prop); a.to = to; a.t0 = Date.now(); return; }
    if (getPos(c, prop) === to) return;
    a = c['_anim' + prop] = { c: c, prop: prop, from: getPos(c, prop), to: to, t0: Date.now() };
    scrolling.push(a);
    if (scrolling.length === 1) requestAnimationFrame(stepScrolls);
  }
  function stepScrolls() {
    var now = Date.now();
    scrolling = scrolling.filter(function (a) {
      var k = Math.min(1, (now - a.t0) / 180);
      setPos(a.c, a.prop, a.from + (a.to - a.from) * (1 - (1 - k) * (1 - k)));
      if (k < 1) return true;
      a.c['_anim' + a.prop] = null;
      return false;
    });
    if (scrolling.length) requestAnimationFrame(stepScrolls);
  }
  function finishScrolls() {
    scrolling.forEach(function (a) { setPos(a.c, a.prop, a.to); a.c['_anim' + a.prop] = null; });
    scrolling = [];
  }
  // vuelve arriba del todo sin animación
  function scrollTop0(c) {
    if (c._animscrollTop) finishScrolls();
    setPos(c, 'scrollTop', 0);
  }

  function scrollInto(c, e, axis) {
    var o = offsetWithin(e, c);
    if (!o) return;
    if (axis === 'x') {
      var pad = 80, right = o.left + e.offsetWidth, x = scrollTarget(c, 'scrollLeft');
      if (right > x + c.clientWidth - pad) x = right - c.clientWidth + pad;
      if (o.left < x + pad) x = Math.max(0, o.left - pad);
      animScroll(c, 'scrollLeft', x);
    } else {
      var padT = c.getAttribute('data-pad') ? +c.getAttribute('data-pad') : 140;
      var bottom = o.top + e.offsetHeight, y = scrollTarget(c, 'scrollTop');
      if (bottom > y + c.clientHeight - 60) y = bottom - c.clientHeight + 60;
      if (o.top < y + padT) y = Math.max(0, o.top - padT);
      animScroll(c, 'scrollTop', y);
    }
  }

  function ensureVisible(e) {
    var p = e.parentNode;
    while (p && p !== document.body) {
      if (p.classList) {
        if (p.classList.contains('hscroll')) scrollInto(p, e, 'x');
        if (p.classList.contains('vscroll')) scrollInto(p, e, 'y');
      }
      p = p.parentNode;
    }
  }

  function closestClass(e, cls) {
    while (e && e !== document.body) {
      if (e.classList && e.classList.contains(cls)) return e;
      e = e.parentNode;
    }
    return null;
  }

  var Nav = {
    root: null,
    cur: null,
    setRoot: function (root, focusEl) {
      this.root = root;
      if (this.cur) this.cur.classList.remove('focused');
      this.cur = null;
      var target = focusEl && root.contains(focusEl) ? focusEl : this.items()[0];
      if (target) this.focus(target);
    },
    items: function () {
      if (!this.root) return [];
      return Array.prototype.filter.call(this.root.querySelectorAll('.f'), function (e) {
        return e.offsetWidth > 0 || e.offsetHeight > 0;
      });
    },
    lastAt: 0, // última vez que se movió el foco (la cabecera no pinta su fondo mientras sigues pulsando)
    focus: function (e) {
      if (!e) return;
      this.lastAt = Date.now();
      if (this.cur) this.cur.classList.remove('focused');
      this.cur = e;
      e.classList.add('focused');
      ensureVisible(e);
      var row = closestClass(e, 'hscroll');
      if (row) row._last = e;
      // la fila de carátulas enfocada atenúa las demás
      var dim = row && e.classList.contains('card') ? row : null;
      if (this.dimRow && this.dimRow !== dim) this.dimRow.classList.remove('dim');
      if (dim) dim.classList.add('dim');
      this.dimRow = dim;
      if (e._onfocus) e._onfocus();
      if (e._meta && this.root && this.root._hero) this.root._hero.show(e._meta);
    },
    move: function (dir) {
      var cur = this.cur;
      if (!cur || !this.root.contains(cur)) { this.setRoot(this.root); return false; }
      finishScrolls();
      var r = cur.getBoundingClientRect();
      var rcx = (r.left + r.right) / 2, rcy = (r.top + r.bottom) / 2;
      var best = null, bestScore = Infinity, list = this.items();
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c === cur) continue;
        var b = c.getBoundingClientRect();
        var cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2, score;
        if (dir === 'left' || dir === 'right') {
          var gapX = dir === 'right' ? b.left - r.right : r.left - b.right;
          if ((dir === 'right' ? cx - rcx : rcx - cx) <= 1) continue;
          // ◀ ▶ solo dentro de la misma fila: al final de una lista el foco se queda, no salta a la de abajo
          if (!(b.top < r.bottom - 4 && b.bottom > r.top + 4)) continue;
          score = Math.max(0, gapX) + Math.abs(cy - rcy) * 2;
        } else {
          var gapY = dir === 'down' ? b.top - r.bottom : r.top - b.bottom;
          if ((dir === 'down' ? cy - rcy : rcy - cy) <= 1) continue;
          score = Math.max(0, gapY) + Math.abs(cx - rcx) * 0.3;
        }
        if (score < bestScore) { bestScore = score; best = c; }
      }
      if (!best) return false;
      // al cambiar de fila, volver al último póster enfocado en esa fila
      if (dir === 'up' || dir === 'down') {
        var row = closestClass(best, 'hscroll');
        if (row && row !== closestClass(cur, 'hscroll') && row._last && row.contains(row._last)) best = row._last;
      }
      this.focus(best);
      return true;
    }
  };

  function focusable(e, onclick, onfocus) {
    e.classList.add('f');
    e._onclick = onclick;
    if (onfocus) e._onfocus = onfocus;
    return e;
  }

  // ---------------------------------------------------------------- pila de pantallas

  var stack = [];

  function push(screen) {
    var top = stack[stack.length - 1];
    if (top) {
      top.lastFocus = Nav.cur;
      if (!screen.overlay) top.el.style.display = 'none';
    }
    (screen.overlay ? document.body : $('#screens')).appendChild(screen.el);
    stack.push(screen);
    Nav.setRoot(screen.el, screen.initialFocus ? screen.initialFocus() : null);
    if (screen.onShow) screen.onShow();
  }

  function pop() {
    var s = stack.pop();
    if (!s) return;
    s.closed = true;
    if (s.onClose) s.onClose();
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    var top = stack[stack.length - 1];
    if (top) {
      top.el.style.display = '';
      if (top.onResume) top.onResume();
      Nav.setRoot(top.el, top.lastFocus);
    }
  }

  function isTop(screen) { return stack[stack.length - 1] === screen; }
  // para respuestas que llegan tarde: fn solo se ejecuta si la pantalla no se ha cerrado
  // (una pantalla que aún no se ha abierto con push cuenta como viva)
  function alive(screen, fn) { return function () { if (!screen.closed) return fn.apply(this, arguments); }; }

  function goBack() {
    if (stack.length > 1) pop();
    else confirmExit();
  }

  function exitApp() {
    // TizenBrew abre el módulo con location.href, así que volver atrás regresa a su menú
    if (history.length > 1) { history.back(); return; }
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { window.close(); }
  }

  // ---------------------------------------------------------------- teclado

  document.addEventListener('keydown', function (ev) {
    var code = ev.keyCode;
    Saver.poke();
    // con el protector de pantalla, la tecla solo lo quita
    if (Saver.on) { ev.preventDefault(); Saver.key(code); return; }
    var ae = document.activeElement;
    if (ae && ae.tagName === 'INPUT') {
      if (code === K.ENTER || code === K.DONE || code === K.CANCEL || code === K.BACK || code === K.ESC) {
        ev.preventDefault();
        ae.blur();
        if (ae._ondone && code !== K.CANCEL && code !== K.ESC) ae._ondone(ae.value);
      }
      return;
    }
    var top = stack[stack.length - 1];
    if (!top) return;
    ev.preventDefault();
    if (top.onKey && top.onKey(code) === true) return;
    switch (code) {
      case K.LEFT: Nav.move('left'); break;
      case K.RIGHT: Nav.move('right'); break;
      case K.UP: Nav.move('up'); break;
      case K.DOWN: Nav.move('down'); break;
      case K.ENTER:
        if (Nav.cur && Nav.cur._onclick) Nav.cur._onclick(Nav.cur);
        break;
      case K.BACK: case K.ESC: case K.BKSP:
        goBack();
        break;
      case K.RED: case K.GREEN: case K.YELLOW:
        if (Nav.cur && Nav.cur._meta) cardColorKey(code, Nav.cur);
        break;
    }
  });

  // botones de colores sobre una carátula: rojo Mi lista, verde visto (películas), amarillo Más como esto
  function cardColorKey(code, c) {
    var m = c._meta, imdb = imdbOfMeta(m);
    if (code === K.RED) toggleMyList(m);
    else if (code === K.YELLOW) { if (canSimilar(imdb)) push(similarScreen(m.type, imdb, m.name)); }
    else if (m.type === 'movie') {
      var on = !isSeenMeta(m);
      setSeen([{ videoId: String(m.id), metaId: String(m.id), type: 'movie', name: m.name, poster: m.poster, imdb: imdb }], on);
      var p = c.firstChild, mk = p.querySelector('.mark');
      if (on && !mk) p.appendChild(el('div', 'mark', '✓'));
      if (!on && mk) p.removeChild(mk);
      toast(on ? tr('Marcada como vista') : tr('Marcada como no vista'));
    } else toast(tr('Las series se marcan por episodio o temporada, desde su ficha'));
  }

  function registerKeys() {
    try {
      if (!window.tizen || !tizen.tvinputdevice) return;
      ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
        'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue', 'Info', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) {
        try { tizen.tvinputdevice.registerKey(k); } catch (e) { /* tecla no disponible */ }
      });
    } catch (e) { /* fuera de Tizen */ }
  }

  // ---------------------------------------------------------------- menús modales

  function menu(title, items, onPick) {
    // items: [{label, selected, value}]
    var root = el('div', 'modal');
    var box = el('div', 'modal-box');
    box.appendChild(el('h2', null, esc(title)));
    var list = el('div', 'modal-list vscroll');
    list.setAttribute('data-pad', '0');
    list.style.position = 'relative';
    var first = null;
    items.forEach(function (it) {
      var mi = el('div', 'mi' + (it.selected ? ' sel' : ''), esc(it.label));
      focusable(mi, function () { pop(); onPick(it); });
      list.appendChild(mi);
      if (it.selected && !first) first = mi;
    });
    box.appendChild(list);
    root.appendChild(box);
    push({ el: root, overlay: true, initialFocus: function () { return first; } });
    // la lista necesita altura explícita para poder desplazarse
    list.style.height = Math.min(680, list.scrollHeight) + 'px';
  }

  function confirmExit() {
    menu(tr('¿Salir de StremTV?'), [{ label: tr('Salir'), value: 1 }, { label: tr('Cancelar'), value: 0, selected: true }], function (it) {
      if (it.value) exitApp();
    });
  }
