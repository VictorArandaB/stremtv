/* StremTV — cliente ligero tipo Stremio para Samsung Tizen 3+.
   Escrito en ES5 (sin let/const, flechas, plantillas, find, assign...) porque
   el motor web de Tizen 3.0 es Chromium ~47. */
(function () {
  'use strict';

  var CINEMETA = 'https://v3-cinemeta.strem.io';
  var ANIME = 'https://anime-kitsu.strem.fun'; // catálogo de anime (Kitsu, acepta IDs de AniDB/MAL/AniList)
  var TORRENTIO = 'https://torrentio.strem.fun';
  var SUBS_ADDON = 'https://opensubtitles-v3.strem.io';
  var PROBE_ID = 'tt0111161'; // Cadena perpetua: siempre tiene fuentes, sirve para probar la clave

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BKSP: 8,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, DONE: 65376, CANCEL: 65385
  };

  var FLAG_ES = '🇪🇸';
  var FLAG_MX = '🇲🇽';

  // ---------------------------------------------------------------- utilidades

  function $(sel, root) { return (root || document).querySelector(sel); }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined && html !== null) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function request(url, asJSON) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.timeout = 25000;
      x.onload = function () {
        if (x.status < 200 || x.status >= 300) return reject(new Error('HTTP ' + x.status));
        if (!asJSON) return resolve(x.responseText);
        try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(new Error('respuesta no válida')); }
      };
      x.onerror = function () { reject(new Error('sin conexión')); };
      x.ontimeout = function () { reject(new Error('tiempo de espera agotado')); };
      x.send();
    });
  }
  function getJSON(url) { return request(url, true); }
  function getText(url) { return request(url, false); }

  function load(key, def) {
    try {
      var v = localStorage.getItem('stv.' + key);
      return v ? JSON.parse(v) : def;
    } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem('stv.' + key, JSON.stringify(val)); } catch (e) { /* almacenamiento lleno o bloqueado */ }
  }

  function extend(dst, src) { for (var k in src) if (src.hasOwnProperty(k)) dst[k] = src[k]; return dst; }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = h ? (m < 10 ? '0' + m : m) : m;
    return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
  }

  function smallPoster(url) { return url ? url.replace('/poster/medium/', '/poster/small/') : ''; }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 3500);
  }

  // ---------------------------------------------------------------- ajustes

  var DEFAULTS = {
    debrid: 'realdebrid', key: '', onlyCached: true, maxQ: 'all',
    preferEs: true, subLang: 'spa', subSize: 'normal'
  };
  var settings = extend(extend({}, DEFAULTS), load('settings', {}));
  function saveSettings() { save('settings', settings); }

  var DEBRID_NAMES = { realdebrid: 'Real-Debrid', alldebrid: 'AllDebrid' };
  var QUALITY_NAMES = { all: 'Todas', '1080': 'Hasta 1080p', '720': 'Hasta 720p' };
  var SUB_NAMES = { spa: 'Español', eng: 'Inglés', off: 'Desactivados' };

  function torrentioBase() {
    var filter = ['scr', 'cam', 'unknown'];
    if (settings.maxQ === '1080') filter.push('4k');
    if (settings.maxQ === '720') filter.push('4k', '1080p');
    var parts = ['sort=qualitysize', 'qualityfilter=' + filter.join(',')];
    if (settings.key) {
      parts.push('debridoptions=' + (settings.onlyCached ? 'nodownloadlinks,nocatalog' : 'nocatalog'));
      parts.push(settings.debrid + '=' + settings.key);
    }
    return TORRENTIO + '/' + parts.join('|');
  }

  // ---------------------------------------------------------------- progreso

  var progress = load('progress', {});
  function saveProgress(entry) {
    progress[entry.videoId] = entry;
    // limitar a las 200 entradas más recientes
    var ids = Object.keys(progress);
    if (ids.length > 200) {
      ids.sort(function (a, b) { return progress[a].ts - progress[b].ts; });
      for (var i = 0; i < ids.length - 200; i++) delete progress[ids[i]];
    }
    save('progress', progress);
  }
  function continueList() {
    var byMeta = {};
    Object.keys(progress).forEach(function (id) {
      var p = progress[id];
      if (p.done || !p.d || p.t < 60) return;
      if (!byMeta[p.metaId] || byMeta[p.metaId].ts < p.ts) byMeta[p.metaId] = p;
    });
    return Object.keys(byMeta).map(function (k) { return byMeta[k]; })
      .sort(function (a, b) { return b.ts - a.ts; }).slice(0, 20);
  }

  // ---------------------------------------------------------------- Trakt

  var TRAKT = 'https://api.trakt.tv';
  var trakt = load('trakt', {}); // clientId, clientSecret, access, refresh, expires, user
  function saveTrakt() { save('trakt', trakt); }

  function traktReq(method, path, body, auth) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, TRAKT + path, true);
      x.timeout = 20000;
      x.setRequestHeader('Content-Type', 'application/json');
      x.setRequestHeader('trakt-api-version', '2');
      x.setRequestHeader('trakt-api-key', trakt.clientId || '');
      if (auth !== false && trakt.access) x.setRequestHeader('Authorization', 'Bearer ' + trakt.access);
      x.onload = function () {
        var d = null;
        try { d = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { /* respuesta vacía */ }
        if (x.status >= 200 && x.status < 300) return resolve(d);
        var err = new Error('Trakt ' + x.status);
        err.status = x.status;
        reject(err);
      };
      x.onerror = function () { reject(new Error('sin conexión')); };
      x.ontimeout = function () { reject(new Error('tiempo de espera agotado')); };
      x.send(body ? JSON.stringify(body) : null);
    });
  }

  function withSecret(body) {
    if (trakt.clientSecret) body.client_secret = trakt.clientSecret;
    return body;
  }

  function metahubPoster(imdb) { return 'https://images.metahub.space/poster/small/' + imdb + '/img'; }

  var Trakt = {
    watchlist: {}, // imdb -> true

    linked: function () { return !!(trakt.clientId && trakt.access); },

    storeTokens: function (t) {
      trakt.access = t.access_token;
      trakt.refresh = t.refresh_token;
      trakt.expires = (t.created_at * 1000) + (t.expires_in * 1000);
      saveTrakt();
    },

    ensureFresh: function () {
      // renovar el token si caduca en menos de un día
      if (!trakt.refresh || Date.now() < (trakt.expires || 0) - 86400000) return Promise.resolve();
      return traktReq('POST', '/oauth/token', withSecret({
        refresh_token: trakt.refresh, client_id: trakt.clientId,
        redirect_uri: 'http://localhost', grant_type: 'refresh_token'
      }), false).then(Trakt.storeTokens);
    },

    call: function (method, path, body) {
      if (!Trakt.linked()) return Promise.reject(new Error('Trakt no vinculado'));
      return Trakt.ensureFresh().then(function () { return traktReq(method, path, body); }).catch(function (e) {
        if (e.status === 401) { trakt.access = ''; saveTrakt(); toast('La sesión de Trakt ha caducado. Vuelve a vincularla en Ajustes.'); }
        throw e;
      });
    },

    unlink: function () {
      if (trakt.access) traktReq('POST', '/oauth/revoke', withSecret({ token: trakt.access, client_id: trakt.clientId }), false).catch(function () { /* da igual */ });
      trakt.access = ''; trakt.refresh = ''; trakt.expires = 0; trakt.user = '';
      Trakt.watchlist = {};
      saveTrakt();
    },

    body: function (ctx) {
      if (!ctx.imdb) return null;
      if (ctx.type === 'movie') return { movie: { ids: { imdb: ctx.imdb } } };
      return { show: { ids: { imdb: ctx.imdb } }, episode: { season: +ctx.imdbS, number: +ctx.imdbE } };
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
      return Trakt.call('GET', '/sync/watchlist?limit=200').then(function (items) {
        Trakt.watchlist = {};
        var metas = [];
        (items || []).forEach(function (it) {
          var o = it.movie || it.show;
          if (!o || !o.ids || !o.ids.imdb) return;
          Trakt.watchlist[o.ids.imdb] = true;
          metas.push({ id: o.ids.imdb, type: it.movie ? 'movie' : 'series', name: o.title, poster: metahubPoster(o.ids.imdb) });
        });
        return metas;
      });
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
              label: it.show.title + ' · T' + it.episode.season + ':E' + it.episode.number });
          }
        });
        return out;
      });
    },

    recommendations: function (kind) {
      return Trakt.call('GET', '/recommendations/' + kind + '?limit=30&ignore_collected=true').then(function (items) {
        return (items || []).filter(function (o) { return o.ids && o.ids.imdb; }).map(function (o) {
          return { id: o.ids.imdb, type: kind === 'movies' ? 'movie' : 'series', name: o.title, poster: metahubPoster(o.ids.imdb) };
        });
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

  // ---------------------------------------------------------------- navegación espacial

  function offsetWithin(e, c) {
    var l = 0, t = 0, n = e;
    while (n && n !== c) {
      l += n.offsetLeft; t += n.offsetTop;
      n = n.offsetParent;
    }
    return n === c ? { left: l, top: t } : null;
  }

  function scrollInto(c, e, axis) {
    var o = offsetWithin(e, c);
    if (!o) return;
    if (axis === 'x') {
      var pad = 80, right = o.left + e.offsetWidth;
      if (right > c.scrollLeft + c.clientWidth - pad) c.scrollLeft = right - c.clientWidth + pad;
      if (o.left < c.scrollLeft + pad) c.scrollLeft = Math.max(0, o.left - pad);
    } else {
      var padT = c.getAttribute('data-pad') ? +c.getAttribute('data-pad') : 140;
      var bottom = o.top + e.offsetHeight;
      if (bottom > c.scrollTop + c.clientHeight - 60) c.scrollTop = bottom - c.clientHeight + 60;
      if (o.top < c.scrollTop + padT) c.scrollTop = Math.max(0, o.top - padT);
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
    focus: function (e) {
      if (!e) return;
      if (this.cur) this.cur.classList.remove('focused');
      this.cur = e;
      e.classList.add('focused');
      ensureVisible(e);
      var row = closestClass(e, 'hscroll');
      if (row) row._last = e;
      if (e._onfocus) e._onfocus();
    },
    move: function (dir) {
      var cur = this.cur;
      if (!cur || !this.root.contains(cur)) { this.setRoot(this.root); return false; }
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
          var overlapY = b.top < r.bottom - 4 && b.bottom > r.top + 4;
          score = Math.max(0, gapX) + Math.abs(cy - rcy) * 2 + (overlapY ? 0 : 100000);
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
    if (s.onClose) s.onClose();
    if (s.el.parentNode) s.el.parentNode.removeChild(s.el);
    var top = stack[stack.length - 1];
    if (top) {
      top.el.style.display = '';
      if (top.onResume) top.onResume();
      Nav.setRoot(top.el, top.lastFocus);
    }
  }

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
    }
  });

  function registerKeys() {
    try {
      if (!window.tizen || !tizen.tvinputdevice) return;
      ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
        'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(function (k) {
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
    menu('¿Salir de StremTV?', [{ label: 'Salir', value: 1 }, { label: 'Cancelar', value: 0, selected: true }], function (it) {
      if (it.value) exitApp();
    });
  }

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
    c.appendChild(p);
    c.appendChild(el('div', 'name', esc(extra && extra.label ? extra.label : meta.name)));
    return focusable(c, onclick);
  }

  function loadImages(cards, upto) {
    for (var i = 0; i < cards.length && i <= upto; i++) {
      var c = cards[i];
      if (c._img && !c._loaded) {
        c._loaded = true;
        c.firstChild.style.backgroundImage = 'url("' + c._img + '")';
      }
    }
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

  // fila que se rellena cuando llega la promesa (metas con .pct/.label opcionales)
  function promiseRow(container, title, promise, onPick, hideIfEmpty) {
    var row = el('div', 'row');
    row.appendChild(el('div', 'row-title', esc(title)));
    row.appendChild(el('div', 'empty', 'Cargando…'));
    container.appendChild(row);
    promise.then(function (metas) {
      if (!row.parentNode) return;
      metas = (metas || []).slice(0, 40);
      if (!metas.length && hideIfEmpty) { container.removeChild(row); return; }
      var hadFocus = Nav.cur && row.contains(Nav.cur);
      var fresh = metas.length
        ? posterRow(title, metas, onPick, metas.map(function (m) { return m.pct || m.label ? { pct: m.pct, label: m.label } : null; }))
        : el('div', 'row', '<div class="row-title">' + esc(title) + '</div><div class="empty">Sin resultados</div>');
      container.replaceChild(fresh, row);
      if (hadFocus) Nav.setRoot(Nav.root);
    }).catch(function (e) {
      if (hideIfEmpty && row.parentNode) { container.removeChild(row); return; }
      row.lastChild.textContent = 'No se pudo cargar (' + e.message + ')';
    });
  }

  function asyncRow(container, title, url, onPick) {
    promiseRow(container, title, getJSON(url).then(function (d) { return d.metas || []; }), onPick);
  }

  function openMeta(meta) { push(detailScreen(meta.type, meta.id || meta.metaId)); }

  // ---------------------------------------------------------------- pantalla: inicio

  function header(active) {
    var h = el('div', 'header');
    h.appendChild(el('div', 'logo', 'StremTV'));
    [['home', 'Inicio'], ['anime', 'Anime'], ['search', 'Buscar'], ['settings', 'Ajustes']].forEach(function (t) {
      var tab = el('div', 'tab', t[1]);
      focusable(tab, function () {
        if (t[0] === active) return;
        if (t[0] === 'search') push(searchScreen());
        else if (t[0] === 'anime') push(animeScreen());
        else if (t[0] === 'settings') push(settingsScreen());
        else while (stack.length > 1) pop();
      });
      h.appendChild(tab);
    });
    return h;
  }

  function homeScreen() {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('home'));
    var contWrap = el('div');
    vs.appendChild(contWrap);

    function renderTop() {
      contWrap.innerHTML = '';
      if (!settings.key) {
        var warn = el('div', 'row');
        var b = el('div', 'btn primary', 'Configura tu Real-Debrid o AllDebrid para poder reproducir');
        b.style.marginLeft = '80px';
        focusable(b, function () { push(settingsScreen()); });
        warn.appendChild(b);
        contWrap.appendChild(warn);
      }
      var cont = continueList();
      if (cont.length) {
        contWrap.appendChild(posterRow('Continuar viendo', cont.map(function (p) {
          return { id: p.metaId, type: p.type, name: p.name, poster: p.poster };
        }), function (m, i) {
          var p = cont[i];
          if (p.type === 'movie') resumeMovie(p);
          else push(detailScreen(p.type, p.metaId));
        }, cont.map(function (p) { return { pct: p.t / p.d, label: p.label || p.name }; })));
      }
    }
    renderTop();

    var traktWrap = el('div');
    vs.appendChild(traktWrap);
    var traktLoaded = 0;
    function renderTrakt() {
      if (!Trakt.linked()) { traktWrap.innerHTML = ''; traktLoaded = 0; return; }
      if (Date.now() - traktLoaded < 120000) return; // como mucho cada 2 minutos
      traktLoaded = Date.now();
      traktWrap.innerHTML = '';
      var local = {};
      continueList().forEach(function (p) { local[p.metaId] = true; });
      promiseRow(traktWrap, 'Continuar (Trakt)', Trakt.playback().then(function (items) {
        var seen = {};
        return items.filter(function (m) {
          if (local[m.id] || seen[m.id]) return false; // ya está en «Continuar viendo»
          seen[m.id] = true;
          return true;
        });
      }), openMeta, true);
      promiseRow(traktWrap, 'Mi lista (Trakt)', Trakt.loadWatchlist(), openMeta, true);
      promiseRow(traktWrap, 'Recomendadas para ti: películas', Trakt.recommendations('movies'), openMeta, true);
      promiseRow(traktWrap, 'Recomendadas para ti: series', Trakt.recommendations('shows'), openMeta, true);
    }
    renderTrakt();

    asyncRow(vs, 'Películas populares', CINEMETA + '/catalog/movie/top.json', openMeta);
    asyncRow(vs, 'Series populares', CINEMETA + '/catalog/series/top.json', openMeta);
    asyncRow(vs, 'Películas mejor valoradas', CINEMETA + '/catalog/movie/imdbRating.json', openMeta);
    asyncRow(vs, 'Series mejor valoradas', CINEMETA + '/catalog/series/imdbRating.json', openMeta);

    return { el: root, onResume: function () { renderTop(); renderTrakt(); } };
  }

  function resumeMovie(p) {
    // pasar por el detalle permite elegir otra fuente si la guardada caducó
    push(detailScreen('movie', p.metaId));
  }

  // ---------------------------------------------------------------- pantalla: anime

  function animeScreen() {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('anime'));
    asyncRow(vs, 'En emisión esta temporada', ANIME + '/catalog/anime/kitsu-anime-airing.json', openMeta);
    asyncRow(vs, 'Tendencias', ANIME + '/catalog/anime/kitsu-anime-trending.json', openMeta);
    asyncRow(vs, 'Más populares', ANIME + '/catalog/anime/kitsu-anime-popular.json', openMeta);
    asyncRow(vs, 'Mejor valorados', ANIME + '/catalog/anime/kitsu-anime-rating.json', openMeta);
    return { el: root, initialFocus: function () { return vs.querySelectorAll('.tab')[1]; } };
  }

  // ---------------------------------------------------------------- pantalla: búsqueda

  function searchScreen() {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('search'));
    var box = el('div', 'search-box');
    var input = el('input');
    input.type = 'text';
    input.placeholder = 'Título de película o serie…';
    focusable(input, function () { input.focus(); });
    input._ondone = function (q) { run(q); };
    box.appendChild(input);
    vs.appendChild(box);
    vs.appendChild(el('div', 'hint', 'Pulsa OK para escribir y confirma con «Hecho».'));
    var results = el('div');
    vs.appendChild(results);

    function run(q) {
      q = (q || '').replace(/^\s+|\s+$/g, '');
      results.innerHTML = '';
      if (!q) return;
      var enc = encodeURIComponent(q);
      asyncRow(results, 'Películas', CINEMETA + '/catalog/movie/top/search=' + enc + '.json', openMeta);
      asyncRow(results, 'Series', CINEMETA + '/catalog/series/top/search=' + enc + '.json', openMeta);
      asyncRow(results, 'Anime', ANIME + '/catalog/anime/kitsu-anime-list/search=' + enc + '.json', openMeta);
    }

    return { el: root, initialFocus: function () { return input; } };
  }

  // ---------------------------------------------------------------- pantalla: detalle

  function detailScreen(type, id) {
    var root = el('div', 'screen');
    var bd = el('div', 'backdrop');
    root.appendChild(bd);
    root.appendChild(el('div', 'shade'));
    var d = el('div', 'detail');
    d.appendChild(el('div', 'loading', 'Cargando…'));
    root.appendChild(d);
    var screen = { el: root };
    var meta = null, curSeason = null, episodesBox = null, actions = null;
    var traktSeen = {}, traktNext = null;

    function watchlistButton(container) {
      if (!Trakt.linked()) return;
      var b = el('div', 'btn');
      var imdb = imdbOf();
      if (!imdb) return; // anime sin correspondencia en IMDb: Trakt no lo puede identificar
      var paint = function () { b.textContent = Trakt.watchlist[imdb] ? '✓ En mi lista' : '＋ Mi lista'; };
      paint();
      focusable(b, function () {
        Trakt.toggleWatchlist(type, imdb).then(function (added) {
          paint();
          toast(added ? 'Añadido a tu lista de Trakt' : 'Quitado de tu lista de Trakt');
        }).catch(function (e) { toast('Trakt: ' + e.message); });
      });
      container.appendChild(b);
    }

    var isAnime = String(id).indexOf('kitsu:') === 0;
    function imdbOf() { return meta.imdb_id || (String(meta.id).indexOf('tt') === 0 ? meta.id : null); }

    getJSON(isAnime ? ANIME + '/meta/anime/' + id + '.json' : CINEMETA + '/meta/' + type + '/' + id + '.json').then(function (res) {
      meta = res.meta;
      if (!meta) throw new Error('sin datos');
      if (isAnime) type = meta.type === 'movie' ? 'movie' : 'series';
      render();
    }).catch(function (e) {
      d.innerHTML = '';
      d.appendChild(el('div', 'loading', 'No se pudo cargar (' + esc(e.message) + ')'));
    });

    function info() {
      var parts = [];
      if (meta.releaseInfo || meta.year) parts.push(meta.releaseInfo || meta.year);
      if (meta.runtime) parts.push(meta.runtime);
      if (meta.imdbRating) parts.push('★ ' + meta.imdbRating);
      if (meta.genres && meta.genres.length) parts.push(meta.genres.slice(0, 3).join(', '));
      return parts.map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('');
    }

    function render() {
      var focusEl = null;
      if (meta.background) bd.style.backgroundImage = 'url("' + meta.background + '")';
      d.innerHTML = '';
      d.appendChild(el('h1', null, esc(meta.name)));
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
      Nav.setRoot(root, focusEl);
      screen.autoFocus = Nav.cur;
    }

    function base() {
      return { type: type, metaId: meta.id, imdb: imdbOf(), name: meta.name, poster: meta.poster, background: meta.background };
    }

    function renderMovieActions() {
      actions.innerHTML = '';
      var p = progress[meta.id];
      var play = el('div', 'btn primary', p && !p.done && p.t > 60 ? '▶ Continuar (' + fmtTime(p.t) + ')' : '▶ Ver');
      focusable(play, function () {
        push(streamsScreen(extend(base(), { videoId: meta.id, label: meta.name, startAt: p && !p.done ? p.t : 0 })));
      });
      actions.appendChild(play);
      if (p && !p.done && p.t > 60) {
        var fromStart = el('div', 'btn', 'Desde el principio');
        focusable(fromStart, function () {
          push(streamsScreen(extend(base(), { videoId: meta.id, label: meta.name, startAt: 0 })));
        });
        actions.appendChild(fromStart);
      }
      watchlistButton(actions);
    }

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

    function renderSeries() {
      var seasons = seasonsOf();
      if (!seasons.nums.length) {
        actions.appendChild(el('div', 'loading', 'Sin episodios disponibles'));
        return;
      }
      if (curSeason === null) {
        var lw = lastWatchedSeason(seasons);
        curSeason = lw !== null ? lw : seasons.nums[0];
      }
      if (Trakt.linked()) {
        var wl = el('div');
        watchlistButton(wl);
        actions.appendChild(wl);
        if (imdbOf()) Trakt.showProgress(imdbOf()).then(function (tp) {
          traktSeen = tp.seen;
          traktNext = tp.next;
          // si no hay progreso local, ir a la temporada del siguiente episodio según Trakt
          if (traktNext && lastWatchedSeason(seasons) === null) {
            var ns = null;
            seasons.nums.forEach(function (n) {
              seasons.map[n].forEach(function (v) { if (ns === null && traktKey(v) === traktNext) ns = n; });
            });
            if (seasons.map[ns] && ns !== curSeason) {
              curSeason = ns;
              Array.prototype.forEach.call(sRow.children, function (x) {
                x.classList.toggle('primary', x._season === ns);
              });
            }
          }
          var target = renderEpisodes(seasons.map[curSeason]);
          // solo mover el foco si el usuario aún no se ha movido
          if (target && Nav.root === root && Nav.cur === screen.autoFocus) Nav.focus(target);
        }).catch(function () { /* sin datos de Trakt */ });
      }
      var sRow = el('div', 'seasons hscroll');
      sRow.style.position = 'relative';
      seasons.nums.forEach(function (n) {
        var b = el('div', 'btn' + (n === curSeason ? ' primary' : ''), n === 0 ? 'Especiales' : 'Temporada ' + n);
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
      episodesBox.style.height = Trakt.linked() ? '440px' : '520px';
      actions.appendChild(episodesBox);
      return renderEpisodes(seasons.map[curSeason]);
    }

    function renderEpisodes(eps) {
      episodesBox.innerHTML = '';
      episodesBox.scrollTop = 0;
      var focusTarget = null;
      eps.forEach(function (v) {
        var p = progress[v.id];
        var row = el('div', 'ep');
        var th = el('div', 'thumb');
        if (v.thumbnail) th.style.backgroundImage = 'url("' + v.thumbnail + '")';
        if (p && p.d) {
          var bar = el('div', 'pbar');
          bar.style.cssText = 'position:absolute;left:0;bottom:0;height:8px;background:#8a7dff;width:' + (p.done ? 100 : Math.round(p.t / p.d * 100)) + '%';
          th.appendChild(bar);
        }
        row.appendChild(th);
        var txt = el('div');
        var epTitle = v.name || v.title || ('Episodio ' + v.episode);
        var seen = (p && p.done) || traktSeen[traktKey(v)];
        txt.appendChild(el('div', 'ep-title', esc(v.episode + '. ' + epTitle) + (seen ? ' <span class="badge ok">Visto</span>' : '')));
        var date = v.released ? new Date(v.released) : null;
        var sub = [];
        if (date && !isNaN(date)) sub.push(date.toLocaleDateString ? date.toLocaleDateString('es-ES') : date.toDateString());
        if (p && !p.done && p.t > 60) sub.push('Continuar desde ' + fmtTime(p.t));
        txt.appendChild(el('div', 'ep-sub', esc(sub.join(' · '))));
        row.appendChild(txt);
        var label = 'T' + v.season + ':E' + v.episode + ' · ' + epTitle;
        focusable(row, function () {
          push(streamsScreen(extend(base(), {
            videoId: v.id, label: meta.name + ' — ' + label, epLabel: label,
            imdb: v.imdb_id || imdbOf(),
            imdbS: v.imdbSeason !== undefined ? v.imdbSeason : v.season,
            imdbE: v.imdbEpisode !== undefined ? v.imdbEpisode : v.episode,
            startAt: p && !p.done ? p.t : 0
          })));
        });
        episodesBox.appendChild(row);
        if (!focusTarget && ((p && !p.done) || traktNext === traktKey(v))) focusTarget = row;
      });
      return focusTarget;
    }

    screen.onResume = function () {
      if (!meta) return;
      if (type === 'movie') { renderMovieActions(); return; }
      // repintar episodios conservando la posición
      var idx = -1;
      if (Nav.cur && Nav.cur.parentNode === episodesBox) idx = Array.prototype.indexOf.call(episodesBox.children, Nav.cur);
      if (screen.lastFocus && screen.lastFocus.parentNode === episodesBox) idx = Array.prototype.indexOf.call(episodesBox.children, screen.lastFocus);
      var top = episodesBox.scrollTop;
      renderEpisodes(seasonsOf().map[curSeason]);
      episodesBox.scrollTop = top;
      if (idx >= 0 && episodesBox.children[idx]) screen.lastFocus = episodesBox.children[idx];
    };

    return screen;
  }

  // ---------------------------------------------------------------- pantalla: fuentes

  function parseStream(s) {
    var nameLines = (s.name || '').split('\n');
    var head = nameLines[0] || '';
    var quality = (nameLines[1] || '').replace(/^\s+|\s+$/g, '') || head;
    var title = s.title || '';
    var lines = title.split('\n');
    var stats = [], langs = '';
    for (var i = 1; i < lines.length; i++) {
      if (/👤|💾|⚙/.test(lines[i])) stats.push(lines[i]);
      else langs += lines[i] + ' ';
    }
    return {
      url: s.url,
      infoHash: s.infoHash,
      quality: quality,
      cached: /\+\]/.test(head),
      download: /download/i.test(head + quality),
      error: /error/i.test(quality) || /failed_access|failed_/.test(s.url || ''),
      file: (s.behaviorHints && s.behaviorHints.filename) || lines[0],
      stats: stats.join('  '),
      langs: langs,
      es: title.indexOf(FLAG_ES) >= 0 || title.indexOf(FLAG_MX) >= 0 ||
        /(^|[^a-z])(spa|spanish|castellano|espa[nñ]ol|latino|esp)([^a-z]|$)/i.test(title),
      raw: s
    };
  }

  function streamsScreen(ctx) {
    var root = el('div', 'screen');
    root.appendChild(el('div', 'screen-title', esc(ctx.label)));
    var sub = el('div', 'screen-sub', 'Buscando fuentes…');
    root.appendChild(sub);
    var list = el('div', 'list vscroll');
    list.setAttribute('data-pad', '0');
    root.appendChild(list);
    var screen = { el: root };

    function message(text, withSettings) {
      list.innerHTML = '';
      list.appendChild(el('div', 'loading', esc(text)));
      if (withSettings) {
        var b = el('div', 'btn primary', 'Abrir ajustes');
        focusable(b, function () { push(settingsScreen()); });
        list.appendChild(b);
      }
      Nav.setRoot(root);
    }

    function fetchStreams() {
      sub.textContent = 'Buscando fuentes…';
      getJSON(torrentioBase() + '/stream/' + ctx.type + '/' + ctx.videoId + '.json').then(function (d) {
        var streams = (d.streams || []).map(parseStream);
        if (streams.length === 1 && streams[0].error) {
          sub.textContent = '';
          return message('La clave de ' + DEBRID_NAMES[settings.debrid] + ' no es válida o ha caducado. ' +
            (streams[0].raw.title || ''), true);
        }
        if (!settings.key) {
          sub.textContent = streams.length + ' torrents encontrados';
          return message('Sin un servicio debrid configurado la tele no puede reproducir torrents. Añade tu clave de Real-Debrid o AllDebrid en Ajustes.', true);
        }
        streams = streams.filter(function (s) { return s.url && !s.error; });
        if (settings.preferEs) {
          streams = streams.map(function (s, i) { s._i = i; return s; }).sort(function (a, b) {
            return (b.es - a.es) || (a._i - b._i);
          });
        }
        if (!streams.length) {
          sub.textContent = '';
          return message(settings.onlyCached
            ? 'No hay fuentes en caché para este título. Puedes desactivar «Solo en caché» en Ajustes para ver más.'
            : 'No se han encontrado fuentes.', settings.onlyCached);
        }
        sub.textContent = streams.length + ' fuentes · ' + DEBRID_NAMES[settings.debrid];
        list.innerHTML = '';
        streams.forEach(function (s) {
          var row = el('div', 'stream');
          row.appendChild(el('div', 'q', esc(s.quality)));
          var info = el('div', 'info');
          var badges = '';
          if (s.cached) badges += '<span class="badge ok">⚡ Instantáneo</span>';
          else if (s.download) badges += '<span class="badge">Descargar en debrid</span>';
          if (s.es) badges += '<span class="badge es">ES</span>';
          info.appendChild(el('div', 't1', badges + esc(s.file)));
          info.appendChild(el('div', 't2', esc(s.stats + '   ' + s.langs)));
          row.appendChild(info);
          focusable(row, function () { Player.open(s, ctx); });
          list.appendChild(row);
        });
        Nav.setRoot(root);
      }).catch(function (e) {
        sub.textContent = '';
        message('No se pudieron obtener las fuentes (' + e.message + '). Pulsa Atrás e inténtalo de nuevo.');
      });
    }
    fetchStreams();
    return screen;
  }

  // ---------------------------------------------------------------- subtítulos

  function parseTime(h, m, s, ms) { return (+h || 0) * 3600 + (+m) * 60 + (+s) + (+ms) / Math.pow(10, String(ms).length); }

  function parseSubs(txt) {
    txt = txt.replace(/\r/g, '').replace(/^﻿/, '');
    var re = /(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;
    var blocks = txt.split(/\n\s*\n/), cues = [];
    for (var i = 0; i < blocks.length; i++) {
      var lines = blocks[i].split('\n');
      for (var j = 0; j < lines.length; j++) {
        var m = re.exec(lines[j]);
        if (!m) continue;
        var text = lines.slice(j + 1).join('\n')
          .replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/^\s+|\s+$/g, '');
        if (text) cues.push({ s: parseTime(m[1], m[2], m[3], m[4]), e: parseTime(m[5], m[6], m[7], m[8]), t: text });
        break;
      }
    }
    cues.sort(function (a, b) { return a.s - b.s; });
    return cues;
  }

  var Subs = {
    cues: [], idx: 0, offset: 0, list: [], current: null, embedded: false,
    box: null,
    reset: function () {
      this.cues = []; this.idx = 0; this.offset = 0; this.list = []; this.current = null; this.embedded = false;
      this.box.textContent = '';
      this.box.className = settings.subSize === 'big' ? 'big' : '';
    },
    fetchList: function (ctx) {
      var self = this;
      if (!ctx.imdb) { self.list = []; return Promise.resolve([]); }
      var sid = ctx.type === 'movie' ? ctx.imdb : ctx.imdb + ':' + ctx.imdbS + ':' + ctx.imdbE;
      return getJSON(SUBS_ADDON + '/subtitles/' + ctx.type + '/' + sid + '.json').then(function (d) {
        var order = { spa: 0, eng: 1 };
        self.list = (d.subtitles || []).filter(function (s) { return s.lang === 'spa' || s.lang === 'eng'; })
          .sort(function (a, b) { return order[a.lang] - order[b.lang]; }).slice(0, 25);
        return self.list;
      }).catch(function () { self.list = []; return []; });
    },
    select: function (s) {
      var self = this;
      this.current = s;
      this.cues = []; this.idx = 0; this.box.textContent = '';
      if (!s) return Promise.resolve();
      return getText(s.url).then(function (txt) {
        if (self.current !== s) return;
        self.cues = parseSubs(txt);
        if (!self.cues.length) toast('El subtítulo está vacío o no se puede leer');
      }).catch(function () { toast('No se pudo descargar el subtítulo'); });
    },
    update: function (t) {
      if (this.embedded || !this.cues.length) return;
      t -= this.offset;
      var c = this.cues, i = this.idx;
      if (i >= c.length || c[i].s > t) i = 0; // retroceso: volver a buscar desde el principio
      while (i < c.length - 1 && c[i].e < t) i++;
      this.idx = i;
      var cue = c[i];
      var text = cue && cue.s <= t && cue.e >= t ? cue.t : '';
      if (this.box.textContent !== text) this.box.textContent = text;
    }
  };

  // ---------------------------------------------------------------- reproductor

  var Player = {
    backend: null, ctx: null, stream: null,
    duration: 0, time: 0, paused: false, buffering: false,
    seekTarget: null, seekTimer: null, seekStep: 0, lastSeekKey: 0,
    osdTimer: null, tickTimer: null, saveTimer: null, startAt: 0, started: false,

    hasAV: function () {
      try { return !!(window.webapis && webapis.avplay && webapis.avplay.open); } catch (e) { return false; }
    },

    open: function (stream, ctx) {
      var self = this;
      this.ctx = ctx; this.stream = stream;
      this.duration = 0; this.time = 0; this.paused = false; this.started = false; this.lastPaused = null;
      this.startAt = ctx.startAt || 0;
      this.seekTarget = null;
      $('#player').classList.remove('hidden');
      $('#osd-title').textContent = ctx.label;
      Subs.box = $('#subs');
      Subs.reset();
      this.spinner(true, 'Conectando con ' + DEBRID_NAMES[settings.debrid] + '…');
      this.showOSD();
      push({
        el: el('div'),
        onKey: function (code) { return self.onKey(code); },
        onClose: function () { self.close(); }
      });
      try {
        if (window.webapis && webapis.appcommon) webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
      } catch (e) { /* sin control del salvapantallas */ }

      if (this.hasAV()) this.openAV(stream.url); else this.openHTML(stream.url);

      Subs.fetchList(ctx).then(function (list) {
        if (settings.subLang === 'off') return;
        for (var i = 0; i < list.length; i++) {
          if (list[i].lang === settings.subLang) { Subs.select(list[i]); return; }
        }
      });
      this.tickTimer = setInterval(function () { self.tick(); }, 250);
      this.saveTimer = setInterval(function () { self.saveProgress(); }, 10000);
    },

    // --- backend AVPlay (reproductor nativo de Samsung: MKV, HEVC, varias pistas)
    openAV: function (url) {
      var self = this, av = webapis.avplay;
      this.backend = 'av';
      $('#video').classList.add('hidden');
      $('#avplayer').classList.remove('hidden');
      try {
        av.open(url);
        av.setDisplayRect(0, 0, 1920, 1080);
        try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) { /* no soportado */ }
        try { av.setStreamingProperty('USER_AGENT', 'Mozilla/5.0 (SMART-TV; Tizen) StremTV'); } catch (e) { /* opcional */ }
        av.setListener({
          onbufferingstart: function () { self.buffering = true; self.spinner(true, 'Cargando…'); },
          onbufferingprogress: function (p) { self.spinner(true, 'Cargando… ' + p + '%'); },
          onbufferingcomplete: function () { self.buffering = false; self.spinner(false); },
          oncurrentplaytime: function (ms) { self.time = ms / 1000; },
          onstreamcompleted: function () { self.finished(); },
          onerror: function (e) { self.fail('Error del reproductor: ' + e); },
          onsubtitlechange: function (duration, text) {
            if (Subs.embedded) Subs.box.textContent = (text || '').replace(/<[^>]+>/g, '');
          }
        });
        av.prepareAsync(function () {
          self.duration = av.getDuration() / 1000;
          var go = function () { av.play(); self.started = true; self.spinner(false); };
          if (self.startAt > 5) av.seekTo(Math.floor(self.startAt * 1000), go, go);
          else go();
        }, function (e) {
          // si AVPlay no puede, probar con el reproductor HTML5
          try { av.close(); } catch (x) { /* ya cerrado */ }
          self.openHTML(url);
        });
      } catch (e) {
        try { av.close(); } catch (x) { /* ya cerrado */ }
        this.openHTML(url);
      }
    },

    // --- backend HTML5
    openHTML: function (url) {
      var self = this, v = $('#video');
      this.backend = 'html';
      $('#avplayer').classList.add('hidden');
      v.classList.remove('hidden');
      v.onloadedmetadata = function () {
        self.duration = v.duration || 0;
        if (self.startAt > 5 && !self.started) v.currentTime = self.startAt;
      };
      v.onwaiting = function () { self.buffering = true; self.spinner(true, 'Cargando…'); };
      v.onplaying = function () { self.buffering = false; self.started = true; self.spinner(false); };
      v.onended = function () { self.finished(); };
      v.onerror = function () {
        var code = v.error ? v.error.code : 0;
        self.fail(code === 4 ? 'No se pudo reproducir: el enlace ha fallado o la tele no admite el formato. Prueba otra fuente (mejor 1080p).' : 'Error de reproducción (' + code + ')');
      };
      v.src = url;
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* el error llega por onerror */ });
    },

    tick: function () {
      if (this.backend === 'html') {
        var v = $('#video');
        this.time = v.currentTime || 0;
        this.duration = v.duration || this.duration;
        this.paused = v.paused;
        if (v.buffered && v.buffered.length && this.duration) {
          $('#osd-buffer').style.width = (v.buffered.end(v.buffered.length - 1) / this.duration * 100) + '%';
        }
      } else if (this.backend === 'av') {
        try {
          var st = webapis.avplay.getState();
          this.paused = st === 'PAUSED';
          if (!this.duration) this.duration = webapis.avplay.getDuration() / 1000;
        } catch (e) { /* aún no preparado */ }
      }
      // avisar a Trakt al empezar, pausar y reanudar
      if (this.started && this.lastPaused !== this.paused) {
        this.lastPaused = this.paused;
        Trakt.scrobble(this.paused ? 'pause' : 'start', this.ctx, this.pct());
      }
      var shown = this.seekTarget !== null ? this.seekTarget : this.time;
      $('#osd-cur').textContent = fmtTime(shown);
      $('#osd-dur').textContent = this.duration ? fmtTime(this.duration) : '--:--';
      $('#osd-progress').style.width = this.duration ? (shown / this.duration * 100) + '%' : '0';
      $('#osd-state').textContent = this.seekTarget !== null ? (this.seekTarget >= this.time ? '⏩ ' : '⏪ ') + fmtTime(this.seekTarget) : (this.paused ? '⏸ Pausa' : '');
      if (this.paused) this.showOSD(true);
      Subs.update(this.time);
    },

    showOSD: function (sticky) {
      var osd = $('#osd');
      osd.classList.remove('off');
      $('#subs').classList.add('up');
      clearTimeout(this.osdTimer);
      if (!sticky) this.osdTimer = setTimeout(function () { osd.classList.add('off'); $('#subs').classList.remove('up'); }, 4000);
    },

    spinner: function (on, text) {
      $('#spinner').classList.toggle('hidden', !on);
      if (text) $('#spinner-text').textContent = text;
    },

    toggle: function () {
      if (this.backend === 'html') {
        var v = $('#video');
        if (v.paused) v.play(); else v.pause();
      } else if (this.backend === 'av') {
        try {
          if (webapis.avplay.getState() === 'PAUSED') webapis.avplay.play(); else webapis.avplay.pause();
        } catch (e) { /* estado no válido */ }
      }
      this.showOSD();
    },

    seekBy: function (dir) {
      var now = Date.now();
      // pulsaciones seguidas aceleran: 10 s, 30 s, 60 s
      this.seekStep = now - this.lastSeekKey < 700 ? Math.min(this.seekStep + 1, 2) : 0;
      this.lastSeekKey = now;
      var step = [10, 30, 60][this.seekStep];
      var base = this.seekTarget !== null ? this.seekTarget : this.time;
      var max = this.duration ? this.duration - 5 : base + step;
      this.seekTarget = Math.max(0, Math.min(max, base + dir * step));
      this.showOSD();
      var self = this;
      clearTimeout(this.seekTimer);
      this.seekTimer = setTimeout(function () { self.commitSeek(); }, 800);
    },

    commitSeek: function () {
      var t = this.seekTarget, self = this;
      if (t === null) return;
      if (this.backend === 'html') {
        $('#video').currentTime = t;
        this.seekTarget = null;
      } else if (this.backend === 'av') {
        try {
          webapis.avplay.seekTo(Math.floor(t * 1000), function () { self.seekTarget = null; }, function () { self.seekTarget = null; });
        } catch (e) { this.seekTarget = null; }
      }
      this.time = t;
      Subs.idx = 0;
    },

    avTracks: function (kind) {
      try {
        return webapis.avplay.getTotalTrackInfo().filter(function (t) { return t.type === kind; }).map(function (t) {
          var info = {};
          try { info = JSON.parse(t.extra_info || '{}'); } catch (e) { /* sin metadatos */ }
          return { index: t.index, lang: info.language || info.track_lang || '', codec: info.fourCC || '', channels: info.channels || '' };
        });
      } catch (e) { return []; }
    },

    audioMenu: function () {
      if (this.backend !== 'av') { toast('Cambiar el audio solo es posible con el reproductor nativo'); return; }
      var tracks = this.avTracks('AUDIO');
      if (tracks.length < 2) { toast('Esta fuente solo tiene una pista de audio'); return; }
      var cur = -1;
      try {
        var sel = webapis.avplay.getCurrentStreamInfo().filter(function (t) { return t.type === 'AUDIO'; })[0];
        if (sel) cur = sel.index;
      } catch (e) { /* desconocido */ }
      menu('Audio', tracks.map(function (t, i) {
        return { label: (t.lang || ('Pista ' + (i + 1))) + (t.codec ? ' · ' + t.codec : '') + (t.channels ? ' · ' + t.channels + ' canales' : ''), value: t.index, selected: t.index === cur };
      }), function (it) {
        try { webapis.avplay.setSelectTrack('AUDIO', it.value); toast('Audio cambiado'); } catch (e) { toast('No se pudo cambiar el audio'); }
      });
    },

    subsMenu: function () {
      var self = this, items = [{ label: 'Sin subtítulos', value: 'off', selected: !Subs.current && !Subs.embedded }];
      if (this.backend === 'av') {
        this.avTracks('TEXT').forEach(function (t, i) {
          items.push({ label: 'Incrustado: ' + (t.lang || ('pista ' + (i + 1))), value: 'emb', index: t.index });
        });
      }
      Subs.list.forEach(function (s) {
        items.push({ label: (s.lang === 'spa' ? 'Español' : 'Inglés') + ' · ' + (s.subtitleFileName || s.id), value: 'ext', sub: s, selected: Subs.current === s });
      });
      if (Subs.current) {
        items.push({ label: 'Adelantar subtítulos 0,5 s', value: 'minus' });
        items.push({ label: 'Retrasar subtítulos 0,5 s', value: 'plus' });
      }
      menu('Subtítulos', items, function (it) {
        if (it.value === 'minus' || it.value === 'plus') {
          Subs.offset += it.value === 'plus' ? 0.5 : -0.5;
          Subs.idx = 0;
          toast('Desfase de subtítulos: ' + (Subs.offset > 0 ? '+' : '') + Subs.offset.toFixed(1) + ' s');
          return;
        }
        Subs.embedded = false;
        try { if (self.backend === 'av') webapis.avplay.setSilentSubtitle(true); } catch (e) { /* no soportado */ }
        if (it.value === 'off') { Subs.select(null); return; }
        if (it.value === 'emb') {
          Subs.select(null);
          try {
            webapis.avplay.setSelectTrack('TEXT', it.index);
            webapis.avplay.setSilentSubtitle(false);
            Subs.embedded = true;
          } catch (e) { toast('No se pudo activar el subtítulo incrustado'); }
          return;
        }
        Subs.select(it.sub).then(function () { if (Subs.cues.length) toast('Subtítulos activados'); });
      });
    },

    onKey: function (code) {
      switch (code) {
        case K.ENTER: case K.PLAYPAUSE: this.toggle(); return true;
        case K.PLAY:
          if (this.paused) this.toggle(); return true;
        case K.PAUSE:
          if (!this.paused) this.toggle(); return true;
        case K.LEFT: case K.RW: this.seekBy(-1); return true;
        case K.RIGHT: case K.FF: this.seekBy(1); return true;
        case K.UP: this.showOSD(); this.subsMenu(); return true;
        case K.DOWN: this.showOSD(); this.audioMenu(); return true;
        case K.STOP: pop(); return true;
      }
      return false; // Atrás lo gestiona la pila (cierra el reproductor)
    },

    pct: function () { return this.duration ? this.time / this.duration * 100 : 0; },

    saveProgress: function () {
      var c = this.ctx;
      if (!c || !this.started || !this.duration || this.time < 5) return;
      var done = this.time / this.duration > 0.92;
      saveProgress({
        videoId: c.videoId, metaId: c.metaId, type: c.type, name: c.name, poster: c.poster,
        label: c.epLabel ? c.name + ' · ' + c.epLabel.split(' · ')[0] : c.name,
        t: this.time, d: this.duration, done: done, ts: Date.now()
      });
    },

    finished: function () {
      this.time = this.duration;
      this.saveProgress();
      pop();
    },

    fail: function (msg) {
      this.spinner(false);
      toast(msg, 6000);
      pop();
    },

    close: function () {
      if (this.started) Trakt.scrobble('stop', this.ctx, this.pct()); // >= 80 % lo marca como visto
      this.saveProgress();
      clearInterval(this.tickTimer);
      clearInterval(this.saveTimer);
      clearTimeout(this.seekTimer);
      clearTimeout(this.osdTimer);
      if (this.backend === 'av') {
        try { webapis.avplay.stop(); } catch (e) { /* ya parado */ }
        try { webapis.avplay.close(); } catch (e) { /* ya cerrado */ }
      }
      var v = $('#video');
      v.onerror = null;
      v.pause();
      v.removeAttribute('src');
      try { v.load(); } catch (e) { /* nada que liberar */ }
      this.backend = null;
      Subs.reset();
      $('#player').classList.add('hidden');
      this.spinner(false);
      try {
        if (window.webapis && webapis.appcommon) webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON);
      } catch (e) { /* sin control del salvapantallas */ }
    }
  };

  // ---------------------------------------------------------------- vinculación con Trakt (código de dispositivo)

  function traktLinkScreen(onDone) {
    var root = el('div', 'modal');
    var box = el('div', 'modal-box');
    box.style.cssText = 'left:410px;width:1100px;top:180px;text-align:center';
    box.appendChild(el('h2', null, 'Vincular Trakt'));
    var msg = el('div', null, 'Pidiendo código…');
    msg.style.cssText = 'font-size:30px;line-height:46px;margin-bottom:30px';
    box.appendChild(msg);
    var cancel = el('div', 'btn', 'Cancelar');
    focusable(cancel, function () { pop(); });
    box.appendChild(cancel);
    root.appendChild(box);
    var timer = null, alive = true;
    push({ el: root, overlay: true, onClose: function () { alive = false; clearTimeout(timer); } });

    traktReq('POST', '/oauth/device/code', { client_id: trakt.clientId }, false).then(function (d) {
      if (!alive) return;
      msg.innerHTML = 'En el móvil o el ordenador entra en<br><b style="font-size:42px">' + esc(d.verification_url) +
        '</b><br>e introduce este código:<div style="font-size:90px;letter-spacing:12px;margin:24px 0;color:#8a7dff;font-weight:bold">' +
        esc(d.user_code) + '</div><span style="color:#99a">Esperando confirmación…</span>';
      var interval = (d.interval || 5) * 1000, deadline = Date.now() + d.expires_in * 1000;
      var poll = function () {
        if (!alive) return;
        if (Date.now() > deadline) { msg.textContent = 'El código ha caducado. Vuelve a intentarlo.'; return; }
        traktReq('POST', '/oauth/device/token', withSecret({ code: d.device_code, client_id: trakt.clientId }), false)
          .then(function (t) {
            Trakt.storeTokens(t);
            return Trakt.call('GET', '/users/settings').then(function (st) {
              trakt.user = st && st.user ? st.user.username : '';
              saveTrakt();
            }).catch(function () { /* el nombre es opcional */ });
          })
          .then(function () {
            if (!alive) return;
            pop();
            toast('Trakt vinculado' + (trakt.user ? ' como ' + trakt.user : ''));
            if (onDone) onDone();
          }, function (e) {
            if (!alive) return;
            if (e.status === 400) { timer = setTimeout(poll, interval); return; } // aún no confirmado
            if (e.status === 429) { interval += 1000; timer = setTimeout(poll, interval); return; }
            msg.textContent = e.status === 418 ? 'Has rechazado la vinculación.'
              : e.status === 410 || e.status === 404 ? 'El código ha caducado. Vuelve a intentarlo.'
              : e.status === 401 ? (trakt.clientSecret ? 'El Client Secret no es correcto. Prueba a dejarlo vacío.' : 'Trakt ha rechazado la vinculación. Revisa el Client ID.')
              : 'Error al vincular (' + e.message + ')';
          });
      };
      timer = setTimeout(poll, interval);
    }).catch(function (e) {
      msg.textContent = e.status === 401 || e.status === 403 ? 'El Client ID no es válido.' : 'No se pudo contactar con Trakt (' + e.message + ')';
    });
  }

  // ---------------------------------------------------------------- pantalla: ajustes

  function settingsScreen() {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('settings'));
    var box = el('div');
    box.style.cssText = 'padding:0 80px;width:1400px';
    vs.appendChild(box);

    function opt(label, valueFn, onclick) {
      var o = el('div', 'opt');
      var l = el('span', null, esc(label));
      var v = el('span', 'val', esc(valueFn()));
      o.appendChild(l); o.appendChild(v);
      focusable(o, function () { onclick(); v.textContent = valueFn(); saveSettings(); });
      box.appendChild(o);
      return o;
    }

    function cycle(key, values) {
      return function () {
        var i = values.indexOf(settings[key]);
        settings[key] = values[(i + 1) % values.length];
      };
    }

    box.appendChild(el('div', 'row-title', 'Servicio debrid'));
    box.lastChild.style.padding = '10px 0 16px 0';
    opt('Servicio', function () { return DEBRID_NAMES[settings.debrid]; }, cycle('debrid', ['realdebrid', 'alldebrid']));

    var field = el('div', 'field');
    field.appendChild(el('label', null, 'Clave API (pulsa OK para escribirla)'));
    var input = el('input');
    input.type = 'text';
    input.value = settings.key;
    input.placeholder = 'Pega o escribe aquí tu clave';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    focusable(input, function () { input.focus(); });
    input._ondone = function (v) {
      settings.key = (v || '').replace(/\s+/g, '');
      input.value = settings.key;
      saveSettings();
      if (settings.key) testKey();
    };
    field.appendChild(input);
    box.appendChild(field);
    box.appendChild(el('div', 'note', 'Real-Debrid: real-debrid.com/apitoken · AllDebrid: alldebrid.com/apikeys'));

    var testBtn = el('div', 'btn', 'Probar clave');
    var status = el('span', 'note');
    status.style.marginLeft = '20px';
    focusable(testBtn, testKey);
    box.appendChild(testBtn);
    box.appendChild(status);

    function testKey() {
      if (!settings.key) { status.textContent = 'Escribe primero la clave.'; return; }
      status.textContent = 'Comprobando…';
      getJSON(torrentioBase() + '/stream/movie/' + PROBE_ID + '.json').then(function (d) {
        var s = (d.streams || []).map(parseStream);
        if (s.length === 1 && s[0].error) status.textContent = '✗ Clave no válida para ' + DEBRID_NAMES[settings.debrid];
        else status.textContent = '✓ Clave válida · ' + s.filter(function (x) { return x.url; }).length + ' fuentes de prueba';
      }).catch(function (e) { status.textContent = 'No se pudo comprobar (' + e.message + ')'; });
    }

    box.appendChild(el('div', 'row-title', 'Fuentes'));
    box.lastChild.style.padding = '30px 0 16px 0';
    opt('Solo enlaces en caché (instantáneos)', function () { return settings.onlyCached ? 'Sí' : 'No'; }, function () { settings.onlyCached = !settings.onlyCached; });
    opt('Calidad máxima', function () { return QUALITY_NAMES[settings.maxQ]; }, cycle('maxQ', ['all', '1080', '720']));
    opt('Mostrar primero las fuentes en español', function () { return settings.preferEs ? 'Sí' : 'No'; }, function () { settings.preferEs = !settings.preferEs; });

    box.appendChild(el('div', 'row-title', 'Subtítulos'));
    box.lastChild.style.padding = '30px 0 16px 0';
    opt('Idioma automático', function () { return SUB_NAMES[settings.subLang]; }, cycle('subLang', ['spa', 'eng', 'off']));
    opt('Tamaño', function () { return settings.subSize === 'big' ? 'Grande' : 'Normal'; }, function () { settings.subSize = settings.subSize === 'big' ? 'normal' : 'big'; });

    box.appendChild(el('div', 'row-title', 'Trakt'));
    box.lastChild.style.padding = '30px 0 16px 0';
    var tStatus = el('div', 'note');
    box.appendChild(tStatus);

    function textField(label, key, placeholder) {
      var f = el('div', 'field');
      f.appendChild(el('label', null, esc(label)));
      var inp = el('input');
      inp.type = 'text';
      inp.value = trakt[key] || '';
      inp.placeholder = placeholder;
      inp.setAttribute('autocomplete', 'off');
      inp.setAttribute('spellcheck', 'false');
      focusable(inp, function () { inp.focus(); });
      inp._ondone = function (v) {
        trakt[key] = (v || '').replace(/\s+/g, '');
        inp.value = trakt[key];
        saveTrakt();
        paintTrakt();
      };
      f.appendChild(inp);
      box.appendChild(f);
    }
    textField('Client ID de tu app de Trakt', 'clientId', 'Client ID');
    textField('Client Secret (solo apps antiguas de Trakt; déjalo vacío si no tienes)', 'clientSecret', 'Opcional');
    box.appendChild(el('div', 'note', 'Créala gratis en trakt.tv/oauth/applications/new · Redirect URI: http://localhost'));

    var linkBtn = el('div', 'btn primary');
    focusable(linkBtn, function () {
      if (Trakt.linked()) {
        Trakt.unlink();
        paintTrakt();
        toast('Trakt desvinculado');
        return;
      }
      if (!trakt.clientId) { toast('Escribe primero el Client ID de tu app de Trakt'); return; }
      traktLinkScreen(paintTrakt);
    });
    box.appendChild(linkBtn);

    function paintTrakt() {
      tStatus.textContent = Trakt.linked()
        ? '✓ Vinculado' + (trakt.user ? ' como ' + trakt.user : '') + '. Lo que veas se registra automáticamente (visto al pasar del 80 %).'
        : 'Sin vincular. Registra lo que ves, tu lista y recomendaciones.';
      linkBtn.textContent = Trakt.linked() ? 'Desvincular Trakt' : 'Vincular con Trakt';
    }
    paintTrakt();

    box.appendChild(el('div', 'row-title', 'Datos'));
    box.lastChild.style.padding = '30px 0 16px 0';
    var clear = el('div', 'btn', 'Borrar historial de reproducción');
    focusable(clear, function () {
      menu('¿Borrar «Continuar viendo» y el progreso?', [{ label: 'Borrar', value: 1 }, { label: 'Cancelar', value: 0, selected: true }], function (it) {
        if (!it.value) return;
        progress = {};
        save('progress', progress);
        toast('Historial borrado');
      });
    });
    box.appendChild(clear);
    box.appendChild(el('div', 'note', 'StremTV ' + VERSION + ' · Catálogo: Cinemeta · Fuentes: Torrentio · Subtítulos: OpenSubtitles · Reproductor: ' + (Player.hasAV() ? 'nativo (AVPlay)' : 'HTML5')));

    return { el: root, initialFocus: function () { return box.querySelector('.f'); } };
  }

  // ---------------------------------------------------------------- arranque

  var VERSION = '0.2.3';

  function fitScreen() {
    var z = window.innerWidth / 1920;
    document.body.style.zoom = Math.abs(z - 1) > 0.01 ? z : '';
  }

  function start() {
    fitScreen();
    window.addEventListener('resize', fitScreen);
    registerKeys();
    push(homeScreen());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // exponer para depurar desde la consola
  window.StremTV = { settings: settings, Player: Player, Nav: Nav, stack: stack, open: function (type, id) { push(detailScreen(type, id)); } };
})();
