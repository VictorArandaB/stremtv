/* StremTV — cliente ligero tipo Stremio para Samsung Tizen 3+.
   Escrito en ES5 (sin let/const, flechas, plantillas, find, assign...) porque
   el motor web de Tizen 3.0 es Chromium ~47. */
(function () {
  'use strict';

  var CINEMETA = 'https://v3-cinemeta.strem.io';
  var ANIME = 'https://anime-kitsu.strem.fun'; // catálogo de anime (Kitsu, acepta IDs de AniDB/MAL/AniList)
  var SUBS_ADDON = 'https://opensubtitles-v3.strem.io';
  // el certificado con el que se firma la app (y la Tizen Developers CA) caduca ese día: actualizar al volver a firmarla
  var CERT_EXPIRES = new Date(2027, 0, 1);
  var PROBE_ID = 'tt0111161'; // Cadena perpetua: siempre tiene fuentes, sirve para probar la clave

  var K = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BKSP: 8,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, DONE: 65376, CANCEL: 65385, INFO: 457, I: 73
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

  // petición HTTP que resuelve con el texto; los errores llevan .status (0: sin conexión o tiempo agotado)
  // o: { headers, body, timeout, fail(status) → mensaje propio del servicio, head(xhr) → para leer las cabeceras de la respuesta }
  function xhr(method, url, o) {
    o = o || {};
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, url, true);
      x.timeout = o.timeout || 25000;
      for (var h in o.headers || {}) x.setRequestHeader(h, o.headers[h]);
      var fail = function (status, msg) { reject(extend(new Error(msg), { status: status })); };
      x.onload = function () {
        if (!o.probe) Net.alive();
        if (x.status >= 200 && x.status < 300) { if (o.head) o.head(x); return resolve(x.responseText); }
        fail(x.status, (o.fail && o.fail(x.status)) || 'HTTP ' + x.status);
      };
      x.onerror = function () { if (!o.probe) Net.check(); fail(0, tr('sin conexión')); };
      x.ontimeout = function () { fail(0, tr('tiempo de espera agotado')); };
      x.send(o.body === undefined ? null : o.body);
    });
  }

  // ---------------------------------------------------------------- conexión
  // Una petición sin respuesta (o el evento offline de la tele) hace comprobar si hay internet pidiendo dos servicios
  // distintos: si no responde ninguno, la red está caída (aviso fijo arriba) y se vuelve a probar cada 10 s.
  // Si responde alguno, solo fallaba aquel servicio. Al volver la red se ejecuta lo que esperaba con Net.whenBack;
  // si resulta que no estaba caída, lo de «otherwise»
  var Net = {
    down: false, since: 0, checking: false, waiting: [], timer: null,
    // espera la conclusión de la comprobación en curso (o la empieza)
    whenBack: function (back, otherwise) {
      Net.waiting.push({ back: back, otherwise: otherwise });
      if (!Net.down) Net.check();
    },
    check: function () {
      if (Net.checking) return;
      Net.checking = true;
      var probe = function (url) { return xhr('GET', url + '?t=' + Date.now(), { timeout: 8000, probe: true }); };
      var any = new Promise(function (resolve) {
        var left = 2, no = function () { if (--left === 0) resolve(false); };
        probe(CINEMETA + '/manifest.json').then(function () { resolve(true); }, no);
        probe('https://cdn.jsdelivr.net/gh/VictorArandaB/stremtv@main/package.json').then(function () { resolve(true); }, no);
      });
      any.then(function (ok) {
        Net.checking = false;
        if (ok) Net.alive(); else Net.lost();
      });
    },
    lost: function () {
      clearTimeout(Net.timer);
      Net.timer = setTimeout(Net.check, 10000);
      if (Net.down) return;
      Net.down = true;
      Net.since = Date.now();
      logEv('red', 'sin conexión');
      var box = $('#netbox');
      if (!box) {
        box = el('div', '', '<div class="nb-title"></div><div class="nb-help"></div>');
        box.id = 'netbox';
        document.body.appendChild(box);
      }
      box.firstChild.textContent = '⚠ ' + tr('Sin conexión a internet');
      box.lastChild.textContent = tr('Lo que no ha cargado se cargará solo cuando vuelva');
      box.classList.remove('hidden');
    },
    alive: function () {
      clearTimeout(Net.timer);
      var was = Net.down, list = Net.waiting;
      Net.down = false;
      Net.waiting = [];
      if (was) {
        logEv('red', 'conexión recuperada', { s: Math.round((Date.now() - Net.since) / 1000) });
        var box = $('#netbox');
        if (box) box.classList.add('hidden');
        toast(tr('Conexión recuperada'), 2500);
      }
      list.forEach(function (w) {
        var fn = was ? w.back : w.otherwise;
        if (fn) try { fn(); } catch (e) { /* lo de una pantalla no frena al resto */ }
      });
    }
  };
  window.addEventListener('offline', function () { Net.lost(); });
  window.addEventListener('online', function () { if (Net.down) Net.check(); });
  // una función que da la misma promesa a quien la pida, salvo si falló: entonces la vuelve a pedir
  // (para filas que comparten datos y se reintentan al volver la red)
  function shared(fn) {
    var p = null;
    return function () { return p || (p = fn().catch(function (e) { p = null; throw e; })); };
  }
  // JSON estricto (respuesta rota = error) o tolerante (vacía o rota = null: las APIs que responden 204)
  function strictJSON(txt) { try { return JSON.parse(txt); } catch (e) { throw new Error(tr('respuesta no válida')); } }
  function looseJSON(txt) { try { return txt ? JSON.parse(txt) : null; } catch (e) { return null; } }
  function getJSON(url) { return xhr('GET', url).then(strictJSON); }
  function getText(url) { return xhr('GET', url); }

  // baraja la lista en su sitio (Fisher-Yates) y la devuelve
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
  }

  // deja en obj solo las n entradas más recientes (por .ts)
  function capByTs(obj, n) {
    var ids = Object.keys(obj);
    if (ids.length <= n) return;
    ids.sort(function (a, b) { return obj[a].ts - obj[b].ts; });
    for (var i = 0; i < ids.length - n; i++) delete obj[ids[i]];
  }

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
