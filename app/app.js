// Archivo generado por tools/build-app.js a partir de app/src/*.js: no editar a mano.
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

  // ---------------------------------------------------------------- idioma de la app

  // Los textos se escriben en español; EN da su traducción. {0}, {1}… se sustituyen por los argumentos.
  var LANGS = { es: 'Español', en: 'English' };
  var EN = {
    // general
    'respuesta no válida': 'invalid response', 'sin conexión': 'no connection', 'tiempo de espera agotado': 'timed out',
    'medida no válida': 'invalid measurement', 'sin datos': 'no data',
    'Sin conexión a internet': 'No internet connection', 'Lo que no ha cargado se cargará solo cuando vuelva': 'Anything that didn’t load will load by itself once it’s back',
    'Conexión recuperada': 'Connection restored',
    'Sí': 'Yes', 'No': 'No', 'sí ({0})': 'yes ({0})', 'no': 'no',
    '¿Salir de StremTV?': 'Exit StremTV?', 'Salir': 'Exit', 'Cancelar': 'Cancel', 'Cargando…': 'Loading…',
    'Sin resultados': 'No results', 'No se pudo cargar ({0})': 'Could not load ({0})',
    'Actualización descargada: se aplicará la próxima vez que abras StremTV': 'Update downloaded: it will apply the next time you open StremTV',
    // inicio, anime y búsqueda
    'Inicio': 'Home', 'Anime': 'Anime', 'Buscar': 'Search', 'Ajustes': 'Settings',
    'Configura tu Real-Debrid o AllDebrid para poder reproducir': 'Set up Real-Debrid or AllDebrid to be able to play',
    'Continuar viendo': 'Continue watching', 'Continuar (Trakt)': 'Continue (Trakt)',
    'Recomendadas para ti: películas': 'Recommended for you: movies', 'Recomendadas para ti: series': 'Recommended for you: shows',
    'Películas populares': 'Popular movies', 'Series populares': 'Popular shows',
    'Películas mejor valoradas': 'Top rated movies', 'Series mejor valoradas': 'Top rated shows',
    'En emisión esta temporada': 'Airing this season', 'Tendencias': 'Trending', 'Más populares': 'Most popular',
    'Mejor valorados': 'Top rated', 'Películas': 'Movies', 'Series': 'Shows',
    'Título de película o serie…': 'Movie or show title…',
    'Pulsa OK para escribir y confirma con «Hecho».': 'Press OK to type and confirm with “Done”.',
    // detalle
    // protector de pantalla
    'Protector de pantalla': 'Screensaver', 'Sin tocar el mando': 'When the remote is idle', 'Mostrar': 'Show', 'Cambiar de título cada': 'Next title every',
    '{0} s': '{0} s', 'Con el vídeo en pausa': 'With the video paused', 'Probar ahora': 'Try it now',
    'Un poco de todo': 'A bit of everything', 'Pendientes de ver': 'Up next for me', 'Novedades': 'New releases',
    'En tu lista': 'In your list', 'Estreno de {0}': 'New in {0}', 'OK: abrir la ficha · cualquier otra tecla: volver': 'OK: open its page · any other key: go back',
    'Pendientes de ver: lo que dejaste a medias, los siguientes episodios de tus series (Trakt) y tu lista. Novedades: estrenos de este año y series populares (y con Trakt, los episodios de esta semana). Con el protector puesto, OK abre la ficha del título que se ve.':
      'Up next for me: what you left halfway, the next episodes of your shows (Trakt) and your list. New releases: this year’s premieres and popular shows (and, with Trakt, this week’s episodes). While the screensaver is on, OK opens the page of the title on screen.',
    '✓ En mi lista': '✓ In my list', '＋ Mi lista': '＋ My list', 'Mi lista': 'My list',
    'Añadido a Mi lista': 'Added to My list', 'Quitado de Mi lista': 'Removed from My list',
    'Trakt no puede identificar este título (no tiene ID de IMDb)': 'Trakt cannot identify this title (no IMDb ID)',
    '✓ Vista': '✓ Watched', 'Marcar como vista': 'Mark as watched', 'Marcada como vista': 'Marked as watched', 'Marcada como no vista': 'Marked as unwatched',
    'Marcado como visto': 'Marked as watched', 'Marcado como no visto': 'Marked as unwatched',
    'Temporada {0} marcada como vista': 'Season {0} marked as watched', 'Temporada {0} marcada como no vista': 'Season {0} marked as unwatched',
    'Ponte sobre un episodio o una temporada y pulsa el botón verde': 'Highlight an episode or a season and press the green button',
    'Las series se marcan por episodio o temporada, desde su ficha': 'Shows are marked by episode or season, from their page',
    'Añadido a tu lista de Trakt': 'Added to your Trakt list', 'Quitado de tu lista de Trakt': 'Removed from your Trakt list',
    '▶ Ver': '▶ Watch', '▶ Continuar ({0})': '▶ Resume ({0})', 'Desde el principio': 'From the beginning',
    'T{0}:E{1}': 'S{0}:E{1}', 'Episodio {0}': 'Episode {0}', 'Temporada {0}': 'Season {0}', 'Especiales': 'Specials',
    'Sin episodios disponibles': 'No episodes available', 'Ocultar vistos': 'Hide watched',
    'Mostrar 1 visto': 'Show 1 watched', 'Mostrar {0} vistos': 'Show {0} watched',
    '✓ Has visto todos los episodios emitidos.': '✓ You have watched every aired episode.',
    'Visto': 'Watched', 'Continuar desde {0}': 'Resume from {0}',
    // fuentes
    'Buscando fuentes…': 'Looking for sources…', 'Abrir ajustes': 'Open settings',
    'La clave de {0} no es válida o ha caducado.': 'The {0} key is invalid or has expired.',
    '{0} torrents encontrados': '{0} torrents found',
    'Sin un servicio debrid configurado la tele no puede reproducir torrents. Añade tu clave de Real-Debrid o AllDebrid en Ajustes.':
      'Without a debrid service the TV cannot play torrents. Add your Real-Debrid or AllDebrid key in Settings.',
    'No hay fuentes en caché para este título. Puedes desactivar «Solo en caché» en Ajustes para ver más.':
      'There are no cached sources for this title. You can turn off “Cached only” in Settings to see more.',
    'No se han encontrado fuentes.': 'No sources found.',
    '1 fuente · {0}': '1 source · {0}', '{1} fuentes · {0}': '{1} sources · {0}', ' · tu conexión: hasta ~{0} Mb/s': ' · your connection: up to ~{0} Mb/s',
    '↺ Como el anterior': '↺ Same as before', ' · todas instantáneas': ' · all instant', '⚡ Instantáneo': '⚡ Instant', 'Descargar en debrid': 'Download on debrid',
    ' · pesada': ' · heavy', '✗ Falló': '✗ Failed',
    'No se pudieron obtener las fuentes ({0}). Pulsa Atrás e inténtalo de nuevo.': 'Could not get sources ({0}). Press Back and try again.',
    // reproductor
    'Conectando con {0}…': 'Connecting to {0}…',
    'OK pausa · ◀ ▶ avanzar/retroceder · ▲ subtítulos · ▼ audio y temporizador · Atrás salir': 'OK pause · ◀ ▶ seek · ▲ subtitles · ▼ audio and sleep timer · Back exit',
    '{0} ha bloqueado el acceso desde {1}. Revisa tu correo o la sección de autorizaciones de tu cuenta y aprueba el acceso.':
      '{0} has blocked access from {1}. Check your email or the authorizations section of your account and approve it.',
    'La clave de {0} no es válida o tu suscripción ha caducado.': 'The {0} key is invalid or your subscription has expired.',
    '{0} aún está descargando este archivo. Prueba dentro de unos minutos o elige una fuente instantánea.':
      '{0} is still downloading this file. Try again in a few minutes or pick an instant source.',
    '{0} no ha podido descargar este archivo. Prueba otra fuente.': '{0} could not download this file. Try another source.',
    'Has alcanzado el límite de {0}. Prueba más tarde.': 'You have reached the {0} limit. Try again later.',
    'El archivo es demasiado grande para {0}.': 'The file is too big for {0}.',
    'La fuente es un RAR y no se puede reproducir. Prueba otra.': 'The source is a RAR and cannot be played. Try another one.',
    '{0} no ha podido abrir este archivo. Prueba otra fuente.': '{0} could not open this file. Try another source.',
    '{0} ha retirado este archivo. Prueba otra fuente.': '{0} has removed this file. Try another source.',
    'Este archivo ya no está disponible. Prueba otra fuente.': 'This file is no longer available. Try another source.',
    'Error inesperado de {0}. Prueba otra fuente.': 'Unexpected {0} error. Try another source.',
    'Aviso de {0}: {1}': '{0} notice: {1}',
    'Error del reproductor: {0}': 'Player error: {0}',
    'El reproductor nativo no ha podido abrir esta fuente ({0}).': 'The native player could not open this source ({0}).',
    'No se pudo reproducir: el enlace ha fallado o la tele no admite el formato. Prueba otra fuente (mejor 1080p).':
      'Could not play: the link failed or the TV does not support the format. Try another source (1080p is safer).',
    'Error de reproducción ({0})': 'Playback error ({0})', '⏸ Pausa': '⏸ Paused',
    ' Pulsa OK para probar la siguiente fuente.': ' Press OK to try the next source.',
    'Siguiente episodio': 'Next episode', 'Empieza en {0} s · ': 'Starts in {0} s · ',
    'OK ver ahora · Atrás seguir viendo': 'OK watch now · Back keep watching',
    '↓ midiendo…': '↓ measuring…', '↓ no se pudo medir': '↓ could not measure', ' (necesita ~{0}) ': ' (needs ~{0}) ',
    '⚠ justo': '⚠ tight', '✗ lenta: prueba otra fuente': '✗ slow: try another source',
    // audio y subtítulos
    'Cambiar el audio solo es posible con el reproductor nativo': 'Changing audio is only possible with the native player',
    'Esta fuente solo tiene una pista de audio': 'This source has only one audio track',
    'Pista {0}': 'Track {0}', ' · {0} canales': ' · {0} channels',
    'No se pudo cambiar el audio': 'Could not change the audio',
    'Audio cambiado (se usará en el resto de la serie)': 'Audio changed (it will be used for the rest of the show)',
    'Audio cambiado': 'Audio changed',
    'Sin subtítulos': 'No subtitles', 'Incrustado: {0}': 'Embedded: {0}', 'pista {0}': 'track {0}',
    'Sincronizar subtítulos… (ahora {0})': 'Sync subtitles… (now {0})', 'Subtítulos': 'Subtitles',
    'No se pudo activar el subtítulo incrustado': 'Could not enable the embedded subtitle', 'Subtítulos activados': 'Subtitles on',
    'El subtítulo está vacío o no se puede leer': 'The subtitle is empty or unreadable',
    'No se pudo descargar el subtítulo': 'Could not download the subtitle',
    'sin desfase': 'no offset', ' (más tarde)': ' (later)', ' (antes)': ' (earlier)',
    '◀ adelantar · ▶ retrasar (0,25 s) &nbsp;·&nbsp; ▲ ▼ 1 s &nbsp;·&nbsp; OK terminar':
      '◀ earlier · ▶ later (0.25 s) &nbsp;·&nbsp; ▲ ▼ 1 s &nbsp;·&nbsp; OK done',
    'Subtítulos: {0} (se recordará para este vídeo)': 'Subtitles: {0} (remembered for this video)',
    'Español': 'Spanish', 'Inglés': 'English', 'Francés': 'French', 'Alemán': 'German', 'Italiano': 'Italian',
    'Portugués': 'Portuguese', 'Japonés': 'Japanese', 'Coreano': 'Korean', 'Catalán': 'Catalan', 'Desactivados': 'Off',
    // Trakt
    'Trakt no vinculado': 'Trakt not linked',
    'La sesión de Trakt ha caducado. Vuelve a vincularla en Ajustes.': 'Your Trakt session has expired. Link it again in Settings.',
    'Vincular Trakt': 'Link Trakt', 'Pidiendo código…': 'Requesting code…',
    'En el móvil o el ordenador entra en': 'On your phone or computer go to', 'e introduce este código:': 'and enter this code:',
    'Esperando confirmación…': 'Waiting for confirmation…', 'El código ha caducado. Vuelve a intentarlo.': 'The code has expired. Try again.',
    'Trakt vinculado': 'Trakt linked', ' como {0}': ' as {0}', 'Has rechazado la vinculación.': 'You declined the link.',
    'El Client Secret no es correcto. Prueba a dejarlo vacío.': 'The Client Secret is wrong. Try leaving it empty.',
    'Trakt ha rechazado la vinculación. Revisa el Client ID.': 'Trakt rejected the link. Check the Client ID.',
    'Error al vincular ({0})': 'Linking error ({0})', 'El Client ID no es válido.': 'The Client ID is not valid.',
    'No se pudo contactar con Trakt ({0})': 'Could not reach Trakt ({0})',
    // ajustes
    'Idioma de la app': 'App language', 'Servicio debrid': 'Debrid service', 'Servicio': 'Service',
    'Clave API (pulsa OK para escribirla)': 'API key (press OK to type it)', 'Pega o escribe aquí tu clave': 'Paste or type your key here',
    'Probar clave': 'Test key', 'Escribe primero la clave.': 'Type the key first.', 'Comprobando…': 'Checking…',
    '✗ Clave no válida para {0}': '✗ Invalid key for {0}', '✓ Clave válida · {0} fuentes de prueba': '✓ Valid key · {0} test sources',
    'No se pudo comprobar ({0})': 'Could not check ({0})',
    'Fuentes': 'Sources', 'Solo enlaces en caché (instantáneos)': 'Cached links only (instant)', 'Calidad máxima': 'Maximum quality',
    'Todas': 'All', 'Hasta 1080p': 'Up to 1080p', 'Hasta 720p': 'Up to 720p',
    'Tasa máxima de las fuentes': 'Maximum source bitrate', 'Automática': 'Automatic', 'Sin límite': 'No limit', ' (sin medir)': ' (not measured)',
    'Medir mi conexión': 'Measure my connection', 'Última medida: {0} Mb/s': 'Last measurement: {0} Mb/s', 'Sin medir todavía': 'Not measured yet',
    'Midiendo… (unos segundos)': 'Measuring… (a few seconds)',
    'Tu conexión: {0} Mb/s → fuentes de hasta ~{1} Mb/s': 'Your connection: {0} Mb/s → sources up to ~{1} Mb/s',
    'No se pudo medir ({0})': 'Could not measure ({0})',
    'Las fuentes más pesadas que tu conexión salen al final, marcadas como «pesada»: suelen pararse a cargar.':
      'Sources heavier than your connection go last, marked “heavy”: they tend to stop to buffer.',
    'Mostrar primero las fuentes que la tele puede reproducir': 'Show sources the TV can play first',
    'Ocultar lo que ya he visto (Trakt y esta app)': 'Hide what I have already watched (Trakt and this app)',
    'Mostrar primero las fuentes en español': 'Show Spanish sources first',
    'Reproducción': 'Playback', 'Pasar solo al siguiente episodio': 'Play the next episode automatically',
    'Idioma del audio': 'Audio language', 'El que traiga el archivo': 'Whatever the file has', '{0} si lo hay': '{0} if available',
    'La pista que elijas con ▼ se recuerda en esa película o serie. Si un archivo no trae tu idioma, se prueba el último que elegiste y después inglés.':
      'The track you pick with ▼ is remembered for that movie or show. If a file lacks your language, the last one you picked is tried, then English.',
    'Idioma automático': 'Automatic language', 'Tamaño': 'Size', 'Grande': 'Large', 'Normal': 'Normal',
    'Client ID de tu app de Trakt': 'Client ID of your Trakt app',
    'Client Secret (solo apps antiguas de Trakt; déjalo vacío si no tienes)': 'Client Secret (old Trakt apps only; leave empty if you have none)',
    'Opcional': 'Optional',
    'Créala gratis en trakt.tv/oauth/applications/new · Redirect URI: http://localhost': 'Create it for free at trakt.tv/oauth/applications/new · Redirect URI: http://localhost',
    'Trakt desvinculado': 'Trakt unlinked', 'Escribe primero el Client ID de tu app de Trakt': 'Type your Trakt app Client ID first',
    '✓ Vinculado': '✓ Linked', '. Lo que veas se registra automáticamente (visto al pasar del 80 %).': '. What you watch is logged automatically (watched after 80 %).',
    'Sin vincular. Registra lo que ves, tu lista y recomendaciones.': 'Not linked. Logs what you watch, your list and recommendations.',
    'Desvincular Trakt': 'Unlink Trakt', 'Vincular con Trakt': 'Link with Trakt',
    'Datos': 'Data', 'Borrar historial de reproducción': 'Clear playback history',
    '¿Borrar «Continuar viendo» y el progreso?': 'Clear “Continue watching” and progress?', 'Borrar': 'Clear', 'Historial borrado': 'History cleared',
    'Diagnóstico de reproducción': 'Playback diagnostics',
    'Fuentes y debrid': 'Sources and debrid', 'Cuentas': 'Accounts', 'General': 'General', 'Datos y diagnóstico': 'Data and diagnostics',
    '{0} addons de fuentes': '{0} source add-ons', '1 addon de fuentes': '1 source add-on', 'ocultar lo visto: {0}': 'hide watched: {0}', '✗ Falta un addon de fuentes': '✗ No source add-on', 'sin clave de debrid': 'no debrid key',
    'Audio: {0}': 'Audio: {0}', 'siguiente episodio: {0}': 'next episode: {0}', 'Opciones de fuentes': 'Source options',
    'Títulos en español (TMDB)': 'Spanish titles (TMDB)', 'Copia de seguridad (GitHub)': 'Backup (GitHub)',
    'Añade primero un addon de fuentes (arriba, en Addons).': 'Add a sources add-on first (above, in Add-ons).',
    'Enviar registro de diagnóstico': 'Send diagnostic log', 'Configura antes la copia de seguridad (token de GitHub)': 'Set up the backup first (GitHub token)',
    'Enviando…': 'Sending…', 'Registro enviado. ID: {0}': 'Log sent. ID: {0}', 'Ver registro': 'View log',
    'Registro (lo más reciente arriba)': 'Log (most recent first)', 'Vacío': 'Empty',
    'ID del Gist de la copia y del registro: {0}': 'Gist ID of the backup and log: {0}',
    'Reparto': 'Cast', 'Sin datos de reparto': 'No cast data',
    'Con la clave de TMDB (Ajustes) puedes ver la filmografía de cada actor': 'With the TMDB key (Settings) you can see each actor\'s filmography',
    'Visto recientemente': 'Recently watched', 'Color': 'Color', 'Amarillo': 'Yellow', 'Blanco': 'White',
    'Posición': 'Position', 'Más arriba': 'Higher', 'Abajo': 'Bottom',
    'Búsquedas recientes': 'Recent searches', 'Más como esto': 'More like this', 'Más como «{0}»': 'More like “{0}”',
    'ir al %': 'go to %', '⚠ Esta fuente se corta': '⚠ This source keeps stalling', 'Cambiar a {0}': 'Switch to {0}',
    'OK cambiar · Atrás seguir con esta': 'OK switch · Back keep this one', 'La fuente ha fallado: sigue con otra ({0})': 'The source failed: continuing with another ({0})',
    'Nuevo': 'New', 'Desde el móvil: {0} en Mi lista': 'From your phone: {0} added to My list', 'Revisar la cola del móvil': 'Check the phone queue',
    'Revisando…': 'Checking…', '{0} añadidos desde el móvil': '{0} added from your phone', 'La cola está vacía': 'The queue is empty',
    'Desde el móvil: escribe títulos o enlaces de IMDb en el archivo cola.txt de ese Gist (gist.github.com) y llegan a Mi lista en unos minutos.':
      'From your phone: write titles or IMDb links in that Gist’s cola.txt file (gist.github.com) and they reach My list within minutes.',
    'Intro saltada': 'Intro skipped', 'Audio cambiado (se recordará para esta película)': 'Audio changed (it will be remembered for this movie)', '⏭ OK: saltar intro': '⏭ OK: skip intro', '⏭ OK: saltar ending': '⏭ OK: skip ending',
    'Saltar solo las intros de anime': 'Skip anime intros automatically',
    '⏾ Temporizador: {0}': '⏾ Sleep timer: {0}', 'desactivado': 'off',
    'al terminar este vídeo': 'when this video ends', 'quedan {0} min': '{0} min left', 'Temporizador': 'Sleep timer',
    'Desactivado': 'Off', 'Al terminar este vídeo': 'When this video ends', '{0} minutos': '{0} minutes',
    'Temporizador: {0}': 'Sleep timer: {0}', 'Temporizador: reproducción detenida': 'Sleep timer: playback stopped',
    '▶ Continuar ({0} %)': '▶ Resume ({0} %)', 'Continuar desde el {0} % (Trakt)': 'Resume from {0} % (Trakt)',
    'la clave de TMDB no es válida': 'the TMDB key is not valid', 'Resultados en español (TMDB)': 'Results in Spanish (TMDB)',
    'Este título no tiene ID de IMDb y no se puede reproducir': 'This title has no IMDb ID and cannot be played',
    'Títulos y sinopsis en español: clave de TMDB (pulsa OK para escribirla)': 'Spanish titles and synopses: TMDB key (press OK to type it)',
    'Clave de la API o token de lectura de themoviedb.org': 'API key or read access token from themoviedb.org',
    'Gratis en themoviedb.org → Ajustes → API. Solo se usa con la app en español.': 'Free at themoviedb.org → Settings → API. Only used with the app in Spanish.',
    'Sin clave: los títulos salen en inglés.': 'No key: titles are shown in English.',
    '✓ Clave válida («{0}»). Los cambios se ven al volver a Inicio.': '✓ Valid key (“{0}”). Changes show when you go back to Home.',
    'el token de GitHub no es válido': 'the GitHub token is not valid', 'el token no tiene permiso para Gists': 'the token has no Gist permission',
    'falta el token de GitHub': 'the GitHub token is missing', 'no hay ninguna copia en esta cuenta de GitHub': 'there is no backup in this GitHub account',
    'la copia está vacía': 'the backup is empty', 'la copia no es de StremTV': 'the backup is not from StremTV',
    'Copia de seguridad': 'Backup',
    'Guarda tus ajustes, claves, Trakt, progreso y addons en un Gist secreto de tu cuenta de GitHub, una vez al día. Si se borran los datos de la app, escribe el token y pulsa Restaurar.':
      'Saves your settings, keys, Trakt, progress and add-ons to a secret Gist in your GitHub account, once a day. If the app data is wiped, type the token and press Restore.',
    'Token de GitHub con permiso «gist» (pulsa OK para escribirlo)': 'GitHub token with “gist” permission (press OK to type it)',
    'Token guardado. Buscando una copia anterior…': 'Token saved. Looking for a previous backup…',
    'Hay una copia en GitHub: pulsa Restaurar para recuperarla o Guardar para sustituirla.': 'There is a backup on GitHub: press Restore to recover it or Save to replace it.',
    'No hay copias todavía: pulsa Guardar copia ahora.': 'No backups yet: press Save backup now.',
    'Créalo en github.com/settings/tokens/new marcando solo «gist».': 'Create it at github.com/settings/tokens/new ticking only “gist”.',
    'Guardar copia ahora': 'Save backup now', 'Restaurar copia': 'Restore backup', 'Sin configurar.': 'Not set up.',
    '✗ La última copia falló ({0})': '✗ The last backup failed ({0})', '✓ Última copia: {0}': '✓ Last backup: {0}',
    'Aún no se ha hecho ninguna copia.': 'No backup made yet.', 'Guardando…': 'Saving…', 'Copia guardada en GitHub': 'Backup saved to GitHub',
    '¿Restaurar la copia? Se sustituyen los ajustes, el progreso y los addons de esta tele.': 'Restore the backup? It replaces the settings, progress and add-ons on this TV.',
    'Restaurar': 'Restore', 'Restaurando…': 'Restoring…', 'Copia del {0} restaurada. Reiniciando…': 'Backup from {0} restored. Restarting…',
    'Addons': 'Add-ons', 'la URL debe empezar por https://': 'the URL must start with https://',
    'no es un addon de Stremio': 'it is not a Stremio add-on', '{0} ya viene incluido en StremTV': '{0} is already built into StremTV',
    'hay que configurarlo primero en su web y pegar la URL que te dé': 'configure it on its website first and paste the URL it gives you',
    'Ninguno añadido. Sin un addon de fuentes no se puede reproducir nada. Cinemeta, Kitsu y OpenSubtitles ya vienen incluidos.':
      'None added. Without a sources add-on nothing can be played. Cinemeta, Kitsu and OpenSubtitles are built in.',
    'fuentes con tu debrid': 'sources with your debrid',
    'No tienes ningún addon de fuentes. Añádelo en Ajustes → Fuentes y debrid pegando la URL de su manifest.': 'You have no sources add-on. Add one in Settings → Sources and debrid by pasting its manifest URL.',
    'Añade un addon de fuentes en Ajustes → Fuentes y debrid para poder reproducir': 'Add a sources add-on in Settings → Sources and debrid to be able to play',
    'fuentes': 'sources', 'catálogos': 'catalogs', 'subtítulos': 'subtitles', 'Quitar este addon': 'Remove this add-on',
    'Addon quitado': 'Add-on removed', 'Añadir addon: URL de su manifest (pulsa OK para escribirla)': 'Add an add-on: its manifest URL (press OK to type it)',
    '✓ Añadido: {0}': '✓ Added: {0}', '✗ No se pudo añadir ({0})': '✗ Could not add it ({0})',
    'Los addons de fuentes que piden configuración (Comet, MediaFusion…) se configuran en su web con tu debrid y se pega aquí la URL que dan. Sus catálogos salen en Inicio y en la búsqueda.':
      'Source add-ons that need setup (Comet, MediaFusion…) are configured on their website with your debrid; paste the URL they give you here. Their catalogs show up on Home and in search.',
    'Explorar': 'Explore', 'Tipo': 'Type', 'Género': 'Genre', 'Año': 'Year', 'Orden': 'Sort', 'Todos': 'All',
    'Populares': 'Popular', 'Mejor valoradas': 'Top rated', 'Cargar más': 'Load more',
    'Esta semana en tus series': 'This week in your shows', 'Siguientes episodios': 'Up next',
    'Mi lista: películas': 'My list: movies', 'Mi lista: series': 'My list: shows', 'Hoy': 'Today', 'Mañana': 'Tomorrow', 'Ayer': 'Yesterday',
    ' · elegida automáticamente: pulsa OK en otra para cambiar': ' · picked automatically: press OK on another one to switch',
    'termina a las {0}': 'ends at {0}', 'Fondo detrás del texto': 'Background behind the text',
    'Al pulsar Ver, reproducir directamente la mejor fuente': 'When pressing Watch, play the best source directly',
    '⚠ El certificado de StremTV caduca el {0}. Si deja de abrirse, hay que volver a firmarla e instalarla desde el Mac.':
      '⚠ The StremTV certificate expires on {0}. If it stops opening, it has to be signed and installed again from the Mac.',
    'Certificado de la app válido hasta el {0}': 'App certificate valid until {0}', 'Diagnóstico': 'Diagnostics',
    'Reproductor: {0}': 'Player: {0}', 'nativo (AVPlay)': 'native (AVPlay)', 'Navegador: Chromium {0}': 'Browser: Chromium {0}',
    ' · Catálogo: Cinemeta · Fuentes: tus addons · Subtítulos: OpenSubtitles · Reproductor: {0}':
      ' · Catalog: Cinemeta · Sources: your add-ons · Subtitles: OpenSubtitles · Player: {0}',
    // aspecto: ficha, fuentes, reproductor, protector de pantalla
    '▶ Continuar {0}': '▶ Resume {0}', '▶ Ver {0}': '▶ Watch {0}', 'Otras': 'Other', '1 fuente': '1 source', '{0} fuentes': '{0} sources',
    '⚠ 1 fuente que esta tele no puede reproducir bien · OK para verla': '⚠ 1 source this TV can’t play properly · OK to show it',
    '⚠ {0} fuentes que esta tele no puede reproducir bien · OK para verlas': '⚠ {0} sources this TV can’t play properly · OK to show them',
    '⚠ No se ven bien en esta tele': '⚠ Won’t play properly on this TV', '✕ {0}': '✕ {0}',
    'Dolby Vision sin HDR10': 'Dolby Vision without HDR10', 'H.264 en 4K': 'H.264 in 4K',
    '★ Recomendada': '★ Recommended', 'pausa': 'pause', 'avanzar/retroceder': 'seek', 'audio, fuente y temporizador': 'audio, source & sleep timer', 'Audio, fuente y temporizador': 'Audio, source and sleep timer',
    '⇄ Cambiar fuente…': '⇄ Change source…', 'Cambiar fuente': 'Change source', 'No hay otras fuentes para este vídeo': 'There are no other sources for this video',
    'información': 'info', 'salir': 'exit', 'Fuente': 'Source', 'Archivo': 'File', 'incrustados': 'embedded', 'Reproductor': 'Player',
    'Pulsa cualquier tecla para cerrar': 'Press any key to close', 'En pausa: {0}': 'Paused: {0}',
    'Pulsa cualquier tecla para volver': 'Press any key to go back', 'Protector de pantalla con el vídeo en pausa': 'Screensaver while the video is paused',
    'A los {0} min': 'After {0} min', 'Vídeo en pausa al salir de la app: pulsa OK para seguir': 'Video paused when you left the app: press OK to continue',
    // saga, notas y plataformas
    'Saga': 'Collection', 'En España: {0}': 'In Spain: {0}',
    'Notas de Rotten Tomatoes y Metacritic (OMDb)': 'Rotten Tomatoes and Metacritic scores (OMDb)', 'Clave de OMDb (pulsa OK para escribirla)': 'OMDb key (press OK to type it)',
    'Clave de omdbapi.com': 'omdbapi.com key', 'Sin clave: solo la nota de IMDb.': 'No key: IMDb rating only.',
    '✓ Clave válida (Cadena perpetua: Rotten Tomatoes {0} %)': '✓ Valid key (The Shawshank Redemption: Rotten Tomatoes {0} %)',
    '✗ La clave no es válida o aún no está activada (llega un correo para activarla)': '✗ The key is not valid or not activated yet (you get an email to activate it)',
    'Gratis en omdbapi.com → API Key (plan FREE, 1000 consultas al día). Las notas salen en la ficha junto a la de IMDb.': 'Free at omdbapi.com → API Key (FREE plan, 1000 requests a day). Scores show on the detail page next to IMDb’s.',
    // filas de Inicio
    'Filas de Inicio': 'Home rows', 'Ordenar u ocultar ›': 'Reorder or hide ›', 'Oculta': 'Hidden', 'Visible': 'Visible',
    'Subir': 'Move up', 'Bajar': 'Move down', 'Arriba del todo': 'Move to top', 'Ocultar': 'Hide',
    'OK sobre una fila para subirla, bajarla u ocultarla. Los avisos (fuentes, certificado) salen siempre arriba.': 'Press OK on a row to move it up, down or hide it. Warnings (sources, certificate) always show at the top.',
    'Volver al orden de siempre': 'Restore the default order', 'Inicio vuelve a tener todas las filas en su orden de siempre': 'Home is back to all rows in the default order',
    'Filas de {0}': '{0} rows', '{0} vuelve a tener las filas en su orden de siempre': '{0} is back to its rows in the default order',
    'OK sobre una fila para subirla, bajarla u ocultarla.': 'Press OK on a row to move it up, down or hide it.',
    'Con una clave de TMDB (Ajustes → Cuentas) hay más filas: tendencias, estrenos y una por plataforma.': 'With a TMDB key (Settings → Accounts) there are more rows: trending, new releases and one per platform.',
    // series y películas
    'Para ti': 'For you', 'Tendencia esta semana': 'Trending this week', 'En emisión': 'Airing now', 'Estrenos': 'New releases',
    'Estrenos en digital': 'New on digital', 'En cines': 'In theaters', 'En {0}': 'On {0}',
    // explorar (en Buscar)
    'Años {0}': '{0}s', 'Antes de {0}': 'Before {0}', 'Nota mínima': 'Minimum rating', 'Cualquiera': 'Any', 'Plataforma': 'Platform',
    'Más recientes': 'Newest', 'Solo sin ver': 'Unwatched only', 'Todo': 'Everything',
    // sin spoilers
    'Sin spoilers (episodios sin ver: sin sinopsis ni imagen)': 'No spoilers (unwatched episodes: no synopsis or image)',
    'Sinopsis oculta (sin spoilers)': 'Synopsis hidden (no spoilers)',
    // sorpréndeme
    'Sorpréndeme': 'Surprise me', 'Buscando algo para ti…': 'Finding something for you…',
    'No he encontrado nada sin ver que recomendarte aquí. Prueba más tarde o en otra pestaña': 'I couldn’t find anything unwatched to recommend here. Try again later or in another tab',
    // buscar desde el móvil
    'Escanea con el móvil para escribir desde él': 'Scan with your phone to type from it',
    // listas y premios
    'IMDb Top 250 series': 'IMDb Top 250 shows', 'Óscar': 'Oscars', 'Goya': 'Goya Awards', 'Globos de Oro': 'Golden Globes', 'Emmy': 'Emmys',
    'Palma de Oro (Cannes)': 'Palme d’Or (Cannes)', 'Ganadoras del Óscar': 'Best Picture Oscar winners', 'Ganadora': 'Winner',
    '{0} {1}: nominadas': '{0} {1}: nominees',
    // novedades en tus plataformas
    'Novedades en tus plataformas': 'New on your services', 'Mis plataformas': 'My streaming services', 'Ninguna': 'None',
    '{0} plataformas': '{0} services', 'Elige tus plataformas (Netflix, Prime Video…) para ver aquí lo que acaba de llegar': 'Choose your streaming services (Netflix, Prime Video…) to see what just arrived here',
    'Las plataformas que tienes contratadas. Inicio muestra lo que acaba de llegar a ellas (según su fecha de estreno o del último episodio: TMDB no dice el día en que entró en la plataforma) y en Anime, Películas y Series se ven sus filas y se ocultan las de las demás (en Filas de … se pueden volver a mostrar).':
      'The services you subscribe to. Home shows what just arrived on them (by release date or latest episode: TMDB doesn’t say the day a title was added) and Anime, Movies and Series show their rows and hide the others (they can be shown again in … rows).',
    'Necesita una clave de TMDB (Ajustes → Cuentas).': 'Needs a TMDB key (Settings → Accounts).',
    // tu año
    'Tu año en StremTV': 'Your year in StremTV', 'Tu {0} en StremTV': 'Your {0} in StremTV', '↻ Recalcular': '↻ Recalculate',
    'Tus horas, tus series y tu racha de {0}': 'Your hours, shows and streak of {0}', '{0} h · {1} películas · {2} episodios': '{0} h · {1} movies · {2} episodes',
    '{0} horas, {1} películas y {2} episodios. Y alguna sorpresa más.': '{0} hours, {1} movies and {2} episodes. And a few surprises.',
    'Tus horas, tus series, tu racha más larga y tu día de maratón': 'Your hours, your shows, your longest streak and your binge day',
    'Calculando tu año…': 'Crunching your year…', 'Calculando tu año… {0}': 'Crunching your year… {0}', 'Calculando tu año… {0}/{1}': 'Crunching your year… {0}/{1}',
    'cancelado': 'cancelled', 'No se pudo calcular ({0})': 'Could not calculate it ({0})',
    'Con tu historial de Trakt · calculado el {0} a las {1}': 'From your Trakt history · calculated on {0} at {1}',
    'Solo lo visto en esta tele (sin Trakt no hay más datos, y la tele recuerda las últimas 200 cosas que has visto).':
      'Only what you watched on this TV (without Trakt there is no more data, and the TV remembers the last 200 things you watched).',
    'En {0} no hay nada visto todavía. Ya habrá tiempo.': 'Nothing watched in {0} yet. There’s still time.',
    'horas': 'hours', 'película': 'movie', 'películas': 'movies', 'episodio': 'episode', 'episodios': 'episodes',
    '1 película': '1 movie', '{0} películas': '{0} movies', '1 episodio': '1 episode', '{0} episodios': '{0} episodes',
    'de 1 serie': 'from 1 show', 'de {0} series': 'from {0} shows', 'serie terminada': 'show finished', 'series terminadas': 'shows finished',
    'al día con todo lo emitido': 'caught up with everything aired', 'Ninguna… de momento': 'None… yet',
    '≈ {0} días enteros de tele': '≈ {0} whole days of TV', 'Un año tranquilo': 'A quiet year',
    'Tus series del año': 'Your shows of the year', 'Tus películas mejor puntuadas': 'Your top rated movies', 'tu nota: {0}': 'your rating: {0}',
    'Tus costumbres': 'Your habits', 'tu mes con más tele': 'your busiest TV month', '{0} h de pantalla': '{0} h of screen time',
    'tu día de sofá': 'your couch day', '1 día': '1 day', '{0} días': '{0} days', 'tu racha más larga': 'your longest streak',
    'del {0} al {1}': 'from {0} to {1}', 'Sin dos días seguidos. Qué disciplina.': 'Never two days in a row. Such discipline.',
    'tu día de maratón': 'your binge day', ' y ': ' and ', 'Lo que más te ha tirado': 'What pulled you in the most',
    'lo primero que viste en {0}': 'the first thing you watched in {0}',
    // calendario
    'Calendario': 'Calendar', 'Calendario completo ›': 'Full calendar ›', 'Calendario de tus series ›': 'Your shows’ calendar ›',
    'Tus series y las películas de tu lista de Trakt, de hace 3 días a 30 días vista': 'Your shows and the movies on your Trakt list, from 3 days ago to 30 days ahead',
    'El calendario sale de Trakt: vincúlalo en Ajustes → Cuentas.': 'The calendar comes from Trakt: link it in Settings → Accounts.',
    'Nada en tu calendario en estas semanas': 'Nothing on your calendar in these weeks',
    'En DVD': 'On DVD', 'En digital': 'On digital', 'Serie nueva': 'New show', 'Estreno': 'Premiere'
  };

  function tr(s) {
    if (s === undefined || s === null) return s;
    var out = settings.lang === 'en' && EN.hasOwnProperty(s) ? EN[s] : s;
    for (var i = 1; i < arguments.length; i++) out = out.split('{' + (i - 1) + '}').join(arguments[i]);
    return out;
  }
  function fmtDate(d) { return d.toLocaleDateString(settings.lang === 'en' ? 'en-GB' : 'es-ES'); }
  // decimales con coma en español y con punto en inglés
  function num(x) { return settings.lang === 'en' ? String(x) : String(x).replace('.', ','); }
  function yesNo(v) { return v ? tr('Sí') : tr('No'); }

  function fmtOffset(o) {
    o = Math.round((o || 0) * 100) / 100;
    if (!o) return tr('sin desfase');
    return (o > 0 ? '+' : '−') + num(Math.abs(o).toFixed(2)) + ' s' + (o > 0 ? tr(' (más tarde)') : tr(' (antes)'));
  }

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
    preferEs: true, compatFirst: true, hideWatched: true, maxRate: 'auto', measuredMbps: 0, measuredAt: 0,
    subLang: 'spa', subSize: 'normal', autoNext: true, audioLang: 'spa', lang: 'es', quickPlay: true, subBg: true, tmdbKey: '', autoSkip: false, subColor: 'white', subPos: 'low', saver: 3,
    idleSaver: 10, saverShow: 'mix', saverEvery: 20, omdbKey: '', homeRows: null, animeRows: null, moviesRows: null, seriesRows: null,
    noSpoilers: false,
    myPlatforms: [] // claves de PLATFORMS (Ajustes → General → Mis plataformas)
  };
  var settings = extend(extend({}, DEFAULTS), load('settings', {}));
  function saveSettings() { save('settings', settings); }
  // el «último audio elegido» ya no se usa (0.20.1): el orden es el título, Ajustes, la app e inglés
  if ('lastAudio' in settings || 'lastAudioAnime' in settings) { delete settings.lastAudio; delete settings.lastAudioAnime; saveSettings(); }

  var DEBRID_NAMES = { realdebrid: 'Real-Debrid', alldebrid: 'AllDebrid' };
  var QUALITY_NAMES = { all: 'Todas', '1080': 'Hasta 1080p', '720': 'Hasta 720p' };
  var RATE_NAMES = { auto: 'Automática', none: 'Sin límite', '10': '10 Mb/s', '20': '20 Mb/s', '40': '40 Mb/s' };

  // tasa máxima en Mb/s (0 = sin límite); en automático, 70 % de la velocidad medida
  function rateLimit() {
    if (settings.maxRate === 'none') return 0;
    if (settings.maxRate === 'auto') return settings.measuredMbps ? Math.round(settings.measuredMbps * 0.7) : 0;
    return +settings.maxRate;
  }

  // mide la velocidad real de la tele descargando ~25 MB de Cloudflare (o lo que dé en 8 s)
  function measureSpeed() {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest(), t0 = 0, done = false;
      x.open('GET', 'https://speed.cloudflare.com/__down?bytes=25000000&t=' + Date.now(), true);
      x.responseType = 'arraybuffer';
      x.timeout = 30000;
      var finish = function (bytes) {
        if (done) return;
        done = true;
        var secs = (Date.now() - t0) / 1000;
        if (!t0 || secs <= 0 || bytes < 500000) return reject(new Error(tr('medida no válida')));
        resolve(Math.round(bytes * 8 / secs / 1e5) / 10);
      };
      x.onprogress = function (e) {
        if (!t0) t0 = Date.now(); // empezar a contar con el primer byte (sin la conexión TLS)
        if (Date.now() - t0 > 8000) { finish(e.loaded); try { x.abort(); } catch (er) { /* ya cerrada */ } }
      };
      x.onload = function () { finish(x.response ? x.response.byteLength : 0); };
      x.onerror = x.ontimeout = function () { if (!done) { done = true; reject(new Error(tr('sin conexión'))); } };
      x.send();
    });
  }

  function parseRuntime(r) {
    if (!r) return 0;
    var h = /(\d+)\s*h/i.exec(r), m = /(\d+)\s*m/i.exec(r);
    if (h || m) return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
    var n = parseInt(r, 10);
    return n > 0 ? n : 0;
  }

  function parseSizeGB(text) {
    var m = /([\d.,]+)\s*(GB|MB|TB)/i.exec(text || '');
    if (!m) return 0;
    var v = parseFloat(m[1].replace(',', '.'));
    var u = m[2].toUpperCase();
    return u === 'TB' ? v * 1024 : u === 'MB' ? v / 1024 : v;
  }

  var SUB_NAMES = { spa: 'Español', eng: 'Inglés', fre: 'Francés', ger: 'Alemán', ita: 'Italiano', por: 'Portugués', off: 'Desactivados' };
  var LANG_NAMES = { spa: 'Español', eng: 'Inglés', fre: 'Francés', ger: 'Alemán', ita: 'Italiano', por: 'Portugués',
    jpn: 'Japonés', kor: 'Coreano', cat: 'Catalán' };
  // idiomas que se pueden elegir como audio preferido (orig = el que traiga el archivo por defecto)
  var AUDIO_LANGS = ['spa', 'eng', 'fre', 'ger', 'ita', 'por', 'jpn', 'kor', 'cat', 'orig'];
  // nombre de un idioma de audio/subtítulos; un código desconocido (copias de versiones antiguas) se muestra tal cual
  function langName(names, k) { return tr(names[k] || k || '—'); }

  // código de idioma de una pista (es, spa, Spanish, cas… → spa; fr, fra, French → fre…)
  var LANG_RE = {
    spa: /^(es($|[-_])|spa|esp|spanish|cas|lat)/, eng: /^(en($|[-_])|eng)/, fre: /^(fr($|[-_])|fre|fra)/,
    ger: /^(de($|[-_])|ger|deu)/, ita: /^(it($|[-_])|ita)/, por: /^(pt($|[-_])|por|pob)/,
    jpn: /^(ja($|[-_])|jpn?($|[-_])|jap)/, kor: /^(ko($|[-_])|kor)/, cat: /^(ca($|[-_])|cat)/
  };
  function langKey(l) {
    l = String(l || '').toLowerCase();
    for (var k in LANG_RE) if (LANG_RE[k].test(l)) return k;
    return l === 'und' ? '' : l.slice(0, 3);
  }

  // Como en Stremio, la app no trae ningún proveedor de fuentes: se añaden en Ajustes → Fuentes y debrid.
  // Los addons de este formato aceptan la configuración del debrid en su dirección; con clave en Ajustes,
  // la app pone la suya (calidad, solo en caché…). Sin clave, se usa la dirección tal cual (configurada en su web)
  var DEBRID_ADDON_IDS = ['com.stremio.torrentio.addon'];
  function debridAddon() {
    for (var i = 0; i < addons.length; i++) if (DEBRID_ADDON_IDS.indexOf(addons[i].manifest.id) >= 0) return addons[i];
    return null;
  }
  function originOf(url) { return (/^https?:\/\/[^\/]+/.exec(url) || [url])[0]; }

  function sourcesBase(a) {
    if (!settings.key) return a.url;
    var filter = ['scr', 'cam', 'unknown'];
    if (settings.maxQ === '1080') filter.push('4k');
    if (settings.maxQ === '720') filter.push('4k', '1080p');
    var parts = ['sort=qualitysize', 'qualityfilter=' + filter.join(','),
      'debridoptions=' + (settings.onlyCached ? 'nodownloadlinks,nocatalog' : 'nocatalog'), settings.debrid + '=' + settings.key];
    return originOf(a.url) + '/' + parts.join('|');
  }

  // ---------------------------------------------------------------- addons de Stremio añadidos en Ajustes

  // [{ url: base sin /manifest.json, manifest: {id, name, resources, types, idPrefixes, catalogs} }]
  var addons = load('addons', []);
  var BUILTIN_ADDONS = ['com.linvo.cinemeta', 'org.stremio.opensubtitlesv3'];

  function addonBase(u) {
    return String(u || '').replace(/^\s+|\s+$/g, '').replace(/^stremio:\/\//, 'https://')
      .replace(/\/manifest\.json(\?.*)?$/, '').replace(/\/+$/, '');
  }

  function slimManifest(m) {
    return { id: m.id, name: m.name || m.id, resources: m.resources || [], types: m.types || [], idPrefixes: m.idPrefixes || null,
      catalogs: m.catalogs || [] };
  }

  // ¿sirve este addon el recurso (stream, meta, subtitles…) para ese tipo e id?
  function addonHas(a, resource, type, id) {
    var m = a.manifest;
    return (m.resources || []).some(function (r) {
      var name = typeof r === 'string' ? r : r.name;
      if (name !== resource) return false;
      var types = (typeof r === 'object' && r.types) || m.types || [];
      var prefixes = (typeof r === 'object' && r.idPrefixes) || m.idPrefixes;
      if (type && types.indexOf(type) < 0) return false;
      if (id && prefixes && prefixes.length) return prefixes.some(function (pre) { return String(id).indexOf(pre) === 0; });
      return true;
    });
  }
  function addonsFor(resource, type, id) { return addons.filter(function (a) { return addonHas(a, resource, type, id); }); }

  function installAddon(url) {
    var base = addonBase(url);
    if (!/^https?:\/\//.test(base)) return Promise.reject(new Error(tr('la URL debe empezar por https://')));
    return getJSON(base + '/manifest.json').then(function (m) {
      if (!m || !m.id || !m.resources) throw new Error(tr('no es un addon de Stremio'));
      if (BUILTIN_ADDONS.indexOf(m.id) >= 0) throw new Error(tr('{0} ya viene incluido en StremTV', m.name));
      if (m.behaviorHints && m.behaviorHints.configurationRequired) throw new Error(tr('hay que configurarlo primero en su web y pegar la URL que te dé'));
      addons = addons.filter(function (a) { return a.url !== base; });
      addons.push({ url: base, manifest: slimManifest(m) });
      save('addons', addons);
      return addons[addons.length - 1];
    });
  }

  function removeAddon(a) {
    addons = addons.filter(function (x) { return x !== a; });
    save('addons', addons);
  }

  // al arrancar, actualizar en segundo plano lo que declara cada addon (catálogos nuevos, etc.)
  function refreshAddons() {
    addons.forEach(function (a) {
      getJSON(a.url + '/manifest.json').then(function (m) {
        if (m && m.id) { a.manifest = slimManifest(m); save('addons', addons); }
      }).catch(function () { /* se queda lo guardado */ });
    });
  }

  // catálogos de película/serie/anime que se pueden pedir sin datos extra (o con búsqueda, si search es true)
  function addonCatalogs(search) {
    var out = [];
    addons.forEach(function (a) {
      (a.manifest.catalogs || []).forEach(function (c) {
        if (['movie', 'series', 'anime'].indexOf(c.type) < 0) return;
        var hasSearch = false, required = false;
        (c.extra || []).forEach(function (e) {
          if (e.name === 'search') { hasSearch = true; if (e.isRequired && !search) required = true; }
          else if (e.isRequired) required = true;
        });
        (c.extraRequired || []).forEach(function (n) { if (n !== 'search' || !search) required = true; });
        if ((c.extraSupported || []).indexOf('search') >= 0) hasSearch = true;
        if (required || (search && !hasSearch)) return;
        var kind = c.type === 'series' ? tr('Series') : c.type === 'movie' ? tr('Películas') : tr('Anime');
        out.push({ addon: a, catalog: c, title: (c.name ? c.name + ' · ' : '') + kind + ' (' + a.manifest.name + ')' });
      });
    });
    return out;
  }

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
  // y dónde se puede ver en España con suscripción (datos de JustWatch)
  function tmdbDetail(imdb) {
    return tmdbFind(imdb).then(function (r) {
      if (!r.id) return null;
      return tmdbGet('/' + r.k + '/' + r.id + '?append_to_response=watch/providers').then(function (d) {
        var es = ((d['watch/providers'] || {}).results || {}).ES || {};
        return { k: r.k, id: r.id, name: d.title || d.name, overview: d.overview, genres: (d.genres || []).map(function (g) { return g.name; }),
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
  // ctxs: contextos como los del reproductor (videoId, metaId, type, name, poster, epLabel, imdb, imdbS, imdbE, traktS, traktE)
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

  // ---------------------------------------------------------------- Trakt

  var TRAKT = 'https://api.trakt.tv';
  var trakt = load('trakt', {}); // clientId, clientSecret, access, refresh, expires, user
  function saveTrakt() { save('trakt', trakt); }

  // head(xhr): para leer cabeceras de la respuesta (la paginación de Trakt va en X-Pagination-Page-Count)
  function traktReq(method, path, body, auth, head) {
    var headers = { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': trakt.clientId || '' };
    if (auth !== false && trakt.access) headers.Authorization = 'Bearer ' + trakt.access;
    return xhr(method, TRAKT + path, { timeout: 20000, headers: headers, body: body ? JSON.stringify(body) : null,
      fail: function (st) { return 'Trakt ' + st; }, head: head }).then(looseJSON);
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

  // «2026-10-25» del día de hoy más «off» días, en la hora de la tele (para los calendarios de Trakt)
  function localDay(off) {
    var d = new Date(Date.now() + off * 86400000);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
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

    call: function (method, path, body, head) {
      if (!Trakt.linked()) return Promise.reject(new Error(tr('Trakt no vinculado')));
      var gen = Trakt.gen;
      // la respuesta de una cuenta ya desvinculada no se usa ni puede desvincular la nueva
      var stale = function () { return gen !== Trakt.gen; };
      return Trakt.ensureFresh().then(function () { return traktReq(method, path, body, undefined, head); }).then(function (r) {
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
      Seen.movies = {}; Seen.shows = {}; Seen.tmdb = {}; Seen.started = {}; Seen.at = 0; Seen.loading = null;
    },

    // Trakt y Cinemeta pueden numerar distinto los episodios de una serie (Mashle: en Trakt una T1 de 24, en Cinemeta T1 y T2
    // de 12). Se emparejan por fecha de emisión y los que Cinemeta aún no tiene fechados, por orden tras el anterior:
    // imdb → { ts, n: episodios en Cinemeta, map: { 'T:E de Cinemeta': 'T:E de Trakt' }, future: ['T:E de Trakt'] (sin emitir
    // según Cinemeta) }; map vacío si coinciden. Se rehace a la semana (Trakt añade temporadas) o si Cinemeta cambia
    epMaps: load('epmaps', {}),
    epMap: function (imdb, videos) {
      var eps = (videos || []).filter(function (v) { return v.season > 0 && v.episode > 0; })
        .sort(function (a, b) { return a.season - b.season || a.episode - b.episode; });
      var c = Trakt.epMaps[imdb];
      if (c && c.future && c.n === eps.length && Date.now() - c.ts < 7 * 86400000) return Promise.resolve(c.map); // sin future: de la 0.23
      return Trakt.call('GET', '/shows/' + imdb + '/seasons?extended=episodes,full').then(function (seasons) {
        var aired = {}, byDay = {}, map = {}, order = [], future = [];
        (seasons || []).forEach(function (se) {
          if (!se.number) return;
          (se.episodes || []).forEach(function (e) {
            var k = se.number + ':' + e.number;
            aired[k] = e.first_aired || '';
            order.push({ s: se.number, e: e.number, k: k });
            if (e.first_aired) (byDay[e.first_aired.slice(0, 10)] = byDay[e.first_aired.slice(0, 10)] || []).push(k);
          });
        });
        var near = function (a, b) { return !a || !b || Math.abs(new Date(a) - new Date(b)) < 2 * 86400000; };
        var same = eps.every(function (v) { var k = v.season + ':' + v.episode; return aired.hasOwnProperty(k) && near(aired[k], v.released); });
        if (!same) {
          order.sort(function (a, b) { return a.s - b.s || a.e - b.e; });
          var used = {}, prev = -1, now = Date.now();
          var pos = {};
          order.forEach(function (o, i) { pos[o.k] = i; });
          eps.forEach(function (v) {
            var tk = null;
            if (v.released) {
              var t = new Date(v.released).getTime(), bucket = null;
              // el mismo día o el de al lado (las fechas de una y otra pueden ir en otra zona horaria)
              [0, -1, 1].some(function (off) {
                var b = byDay[new Date(t + off * 86400000).toISOString().slice(0, 10)];
                if (b && b.length) { bucket = b; return true; }
                return false;
              });
              tk = bucket && bucket.shift();
            }
            // sin fecha (o sin pareja): el siguiente de Trakt tras el anterior emparejado
            if (!tk && prev >= 0) for (var i = prev + 1; i < order.length; i++) if (!used[order[i].k]) { tk = order[i].k; break; }
            if (!tk) return;
            used[tk] = true;
            prev = pos[tk];
            if (tk !== v.season + ':' + v.episode) map[v.season + ':' + v.episode] = tk;
            if (!v.released || new Date(v.released).getTime() > now) future.push(tk);
          });
        }
        Trakt.epMaps[imdb] = { ts: Date.now(), n: eps.length, map: map, future: future };
        capByTs(Trakt.epMaps, 300);
        save('epmaps', Trakt.epMaps);
        return map;
      });
    },
    // [temporada, episodio] de Cinemeta de un episodio que da Trakt (los mismos si no se conoce la equivalencia)
    epCine: function (imdb, season, number) {
      var c = Trakt.epMaps[imdb], tk = season + ':' + number;
      if (c) for (var k in c.map) if (c.map[k] === tk) { var p = k.split(':'); return [+p[0], +p[1]]; }
      return [+season, +number];
    },
    // «T1:E3» de un episodio que da Trakt, con la numeración de Cinemeta si se conoce la equivalencia
    epCode: function (imdb, season, number) {
      var c = Trakt.epCine(imdb, season, number);
      return tr('T{0}:E{1}', c[0], c[1]);
    },
    // episodio de Trakt que según Cinemeta aún no se ha emitido (Trakt a veces da por emitida una temporada anunciada)
    epFuture: function (imdb, season, number) {
      var c = Trakt.epMaps[imdb];
      return !!(c && c.future && c.future.indexOf(season + ':' + number) >= 0);
    },
    // equivalencias de las series de una fila que aún no se conocen o tienen más de una semana (de tres en tres)
    learnEpMaps: function (imdbs) {
      var todo = imdbs.filter(function (id, i) { var c = Trakt.epMaps[id]; return id && imdbs.indexOf(id) === i && !(c && c.future && Date.now() - c.ts < 7 * 86400000); });
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
    // de ella (last_watched_at) o ha cambiado su historial (last_updated_at: p. ej. marcados con la fecha de emisión), si se ha emitido otro episodio (aired_episodes), si el pendiente que faltaba ya ha salido o tras un día
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
          var pending = c && c.d && c.d.next_episode && c.d.next_episode.first_aired, lw = it.last_watched_at + '|' + (it.last_updated_at || ''), fresh = c && c.lw === lw &&
            c.ae === sh.aired_episodes && now - c.at < 86400000 && !(pending && c.d.aired <= c.d.completed && new Date(pending) <= new Date());
          return (fresh ? Promise.resolve(c.d) : Trakt.call('GET', '/shows/' + sh.ids.trakt + '/progress/watched?hidden=false&specials=false&count_specials=false&extended=full').then(function (d) {
            d = d ? { aired: d.aired, completed: d.completed, next_episode: d.next_episode &&
              { season: d.next_episode.season, number: d.next_episode.number, first_aired: d.next_episode.first_aired } } : null;
            cache[sh.ids.trakt] = { lw: lw, ae: sh.aired_episodes, at: now, d: d };
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
          // lo que Trakt da por emitido y Cinemeta aún no: ni en la fila ni en los pendientes
          list = list.filter(function (m) { return !Trakt.epFuture(m.id, m.ep.season, m.ep.number); });
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
        // con «at», la fecha en que se vio (si no, Trakt pone la de ahora)
        (sh[se] = sh[se] || []).push({ number: +(c.traktE || c.imdbE), watched_at: c.at ? new Date(c.at).toISOString() : undefined });
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

    // episodios de tus series de hace dos días a una semana vista, con la numeración de Cinemeta (como «Siguientes episodios»,
    // antes se aprenden las equivalencias que falten, como mucho 5 s)
    calendar: function () {
      return Trakt.call('GET', '/calendars/my/shows/' + localDay(-2) + '/10').then(function (items) {
        items = (items || []).filter(function (it) { return it.show && it.show.ids && it.show.ids.imdb && it.episode; });
        return withTimeout(Trakt.learnEpMaps(items.map(function (it) { return it.show.ids.imdb; })), 5000).catch(function () {}).then(function () {
          return items.map(function (it) {
            var imdb = it.show.ids.imdb;
            return { id: imdb, type: 'series', name: it.show.title, poster: metahubPoster(imdb),
              label: dayLabel(new Date(it.first_aired)) + ' · ' + it.show.title + ' ' + Trakt.epCode(imdb, it.episode.season, it.episode.number) };
          });
        });
      });
    },

    // calendario completo (pantalla Calendario): episodios de tus series y películas de tu lista que se estrenan en cines,
    // en DVD o en digital, de hace 3 días a 30 días vista (Trakt da como mucho 33 días por consulta). Los estrenos de
    // temporada y las series nuevas ya vienen en el de series (son sus episodios 1): no hace falta pedirlos aparte.
    // Cada entrada es una carátula con at (fecha), allDay (película: solo el día), kind ('ep', 'cinema', 'dvd', 'digital'),
    // ep (numeración de Trakt), cine (la de Cinemeta) y seen (visto en Trakt o en la tele)
    fullCalendar: function () {
      var span = '/' + localDay(-3) + '/33';
      // las de películas, si fallan, no impiden ver las series
      var opt = function (path) { return Trakt.call('GET', path).catch(function () { return []; }); };
      return Promise.all([
        Trakt.call('GET', '/calendars/my/shows' + span),
        opt('/calendars/my/movies' + span),
        opt('/calendars/my/dvd' + span),
        opt('/calendars/my/streaming' + span)
      ]).then(function (r) {
        var out = [], dup = {};
        (r[0] || []).forEach(function (it) {
          if (!it.show || !it.show.ids || !it.show.ids.imdb || !it.episode || !it.first_aired) return;
          var imdb = it.show.ids.imdb;
          out.push({ id: imdb, type: 'series', name: it.show.title, poster: metahubPoster(imdb), at: new Date(it.first_aired), kind: 'ep',
            traktId: it.show.ids.trakt, ep: { season: it.episode.season, number: it.episode.number } });
        });
        ['cinema', 'dvd', 'digital'].forEach(function (kind, i) {
          (r[i + 1] || []).forEach(function (it) {
            var o = it.movie, d = /^(\d{4})-(\d\d)-(\d\d)/.exec(it.released || '');
            if (!o || !o.ids || !o.ids.imdb || !d) return;
            // la fecha de estreno es un día, sin hora: ese día en la tele
            var at = new Date(+d[1], +d[2] - 1, +d[3]), k = o.ids.imdb + '|' + at.getTime();
            if (dup[k]) return;
            dup[k] = true;
            out.push({ id: o.ids.imdb, type: 'movie', name: o.title, poster: metahubPoster(o.ids.imdb), at: at, allDay: true, kind: kind });
          });
        });
        var eps = out.filter(function (m) { return m.kind === 'ep'; });
        // la numeración de Cinemeta (como en «Siguientes episodios», como mucho 5 s) y lo visto: series en Trakt (con su
        // numeración) o en la tele (con la de Cinemeta), películas en Trakt o en la tele
        return Promise.all([
          withTimeout(Trakt.learnEpMaps(eps.map(function (m) { return m.id; })), 5000).catch(function () {}),
          seenReady(true),
          eps.length ? Trakt.watchedShows().catch(function () { return []; }) : []
        ]).then(function (x) {
          var watched = {};
          (x[2] || []).forEach(function (it) {
            var ids = it.show && it.show.ids;
            if (!ids) return;
            var set = {};
            (it.seasons || []).forEach(function (se) { (se.episodes || []).forEach(function (e) { set[se.number + ':' + e.number] = true; }); });
            if (ids.trakt) watched['t' + ids.trakt] = set;
            if (ids.imdb) watched[ids.imdb] = set;
          });
          out.forEach(function (m) {
            if (m.kind !== 'ep') { m.seen = isSeenMeta(m); return; }
            m.cine = Trakt.epCine(m.id, m.ep.season, m.ep.number);
            var set = watched['t' + m.traktId] || watched[m.id] || {}, local = progress[m.id + ':' + m.cine[0] + ':' + m.cine[1]];
            m.seen = !!(set[m.ep.season + ':' + m.ep.number] || (local && local.done));
          });
          return out.sort(function (a, b) { return a.at - b.at; });
        });
      });
    },

    recommendations: function (kind) {
      return Trakt.call('GET', '/recommendations/' + kind + '?limit=60&ignore_collected=true&extended=full').then(function (items) {
        return (items || []).filter(function (o) { return o.ids && o.ids.imdb; }).map(function (o) {
          return { id: o.ids.imdb, type: kind === 'movies' ? 'movie' : 'series', name: o.title, poster: metahubPoster(o.ids.imdb),
            anime: (o.genres || []).indexOf('anime') >= 0 };
        });
      });
    },

    // películas vistas y series sin episodios emitidos pendientes
    loadWatched: function () {
      return Promise.all([
        Trakt.call('GET', '/sync/watched/movies'),
        Trakt.watchedShows()
      ]).then(function (r) {
        var movies = {}, shows = {}, tmdb = {}, started = {};
        (r[0] || []).forEach(function (it) {
          var ids = it.movie && it.movie.ids;
          if (!ids) return;
          if (ids.imdb) movies[ids.imdb] = true;
          if (ids.tmdb) tmdb['movie:' + ids.tmdb] = true;
        });
        (r[1] || []).forEach(function (it) {
          var sh = it.show;
          if (!sh || !sh.ids) return;
          var n = 0;
          (it.seasons || []).forEach(function (se) { if (se.number > 0) n += (se.episodes || []).length; });
          if (sh.ids.imdb) started[sh.ids.imdb] = true;
          if (sh.ids.tmdb) started['tv:' + sh.ids.tmdb] = true;
          if (sh.aired_episodes && n >= sh.aired_episodes) {
            if (sh.ids.imdb) shows[sh.ids.imdb] = true;
            if (sh.ids.tmdb) tmdb['tv:' + sh.ids.tmdb] = true;
          }
        });
        Seen.movies = movies;
        Seen.shows = shows;
        Seen.tmdb = tmdb;
        Seen.started = started;
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

  // ---------------------------------------------------------------- registro de diagnóstico

  // últimos 300 eventos (errores, reproductor, pistas, fuentes, arranque) para entender fallos que solo pasan en la tele.
  // Se envía con la copia de seguridad al Gist (archivo diagnostico.json)
  var diagLog = load('log', []);
  var logSaveTimer = null;
  function logEv(kind, msg, data) {
    var e = { t: new Date().toISOString(), k: kind, m: String(msg === undefined ? '' : msg).slice(0, 300) };
    if (data !== undefined) { try { e.d = JSON.parse(JSON.stringify(data)); } catch (x) { /* no serializable */ } }
    diagLog.push(e);
    if (diagLog.length > 300) diagLog.splice(0, diagLog.length - 300);
    clearTimeout(logSaveTimer);
    logSaveTimer = setTimeout(function () { save('log', diagLog); }, 1500);
  }
  window.addEventListener('error', function (ev) {
    logEv('error', (ev.message || 'error') + (ev.lineno ? ' (línea ' + ev.lineno + ')' : ''));
  });

  // ---------------------------------------------------------------- copia de seguridad en un Gist secreto de GitHub

  var BACKUP_KEYS = ['settings', 'trakt', 'progress', 'suboffsets', 'srcprefs', 'addons', 'explore', 'mylist', 'introskips'];
  var BACKUP_DESC = 'StremTV · copia de seguridad';
  var BACKUP_FILE = 'stremtv.json';
  var backup = load('backup', {}); // token, gistId, at (última copia), err
  function saveBackup() { save('backup', backup); }

  function ghReq(method, path, body) {
    var headers = { Accept: 'application/vnd.github+json', Authorization: 'token ' + backup.token };
    if (body) headers['Content-Type'] = 'application/json';
    return xhr(method, 'https://api.github.com' + path, { timeout: 20000, headers: headers, body: body ? JSON.stringify(body) : null,
      fail: function (st) {
        return st === 401 ? tr('el token de GitHub no es válido') : st === 403 || st === 404 ? tr('el token no tiene permiso para Gists') : 'GitHub ' + st;
      } }).then(looseJSON);
  }

  // el Gist de la copia: el guardado o, si no, el que tenga nuestra descripción
  function findBackupGist() {
    if (backup.gistId) return Promise.resolve(backup.gistId);
    return ghReq('GET', '/gists?per_page=100').then(function (list) {
      var g = (list || []).filter(function (x) { return x.description === BACKUP_DESC && x.files && x.files[BACKUP_FILE]; })[0];
      if (g) { backup.gistId = g.id; saveBackup(); }
      return g ? g.id : null;
    });
  }

  function backupNow() {
    if (!backup.token) return Promise.reject(new Error(tr('falta el token de GitHub')));
    var data = { app: 'StremTV', version: VERSION, at: new Date().toISOString(), data: {} };
    BACKUP_KEYS.forEach(function (k) { var v = load(k, null); if (v !== null) data.data[k] = v; });
    var files = {};
    files[BACKUP_FILE] = { content: JSON.stringify(data) };
    files['diagnostico.json'] = { content: JSON.stringify({ version: VERSION, at: data.at, ua: navigator.userAgent,
      player: Player.hasAV() ? 'avplay' : 'html5', boot: load('boot', []), log: diagLog }, null, 1) };
    return findBackupGist().then(function (id) {
      if (id) {
        return ghReq('PATCH', '/gists/' + id, { files: files }).catch(function (e) {
          if (e.status === 404) backup.gistId = ''; // borrado desde GitHub: crear otro (no por un fallo de red)
          throw e;
        });
      }
      return ghReq('POST', '/gists', { description: BACKUP_DESC, 'public': false, files: files }).then(function (g) {
        backup.gistId = g.id;
        return g;
      });
    }).then(function () {
      backup.at = Date.now();
      backup.err = '';
      saveBackup();
    }, function (e) {
      backup.err = e.message;
      saveBackup();
      throw e;
    });
  }

  function restoreBackup() {
    if (!backup.token) return Promise.reject(new Error(tr('falta el token de GitHub')));
    return findBackupGist().then(function (id) {
      if (!id) throw new Error(tr('no hay ninguna copia en esta cuenta de GitHub'));
      return ghReq('GET', '/gists/' + id);
    }).then(function (g) {
      var f = g && g.files && g.files[BACKUP_FILE];
      if (!f) throw new Error(tr('la copia está vacía'));
      return f.truncated ? getText(f.raw_url) : f.content;
    }).then(function (txt) {
      var d = JSON.parse(txt);
      if (!d || d.app !== 'StremTV' || !d.data) throw new Error(tr('la copia no es de StremTV'));
      BACKUP_KEYS.forEach(function (k) { if (d.data[k] !== undefined) save(k, d.data[k]); });
      return d;
    });
  }

  // una copia al día como mucho, en segundo plano
  function autoBackup() {
    if (!backup.token || Date.now() - (backup.at || 0) < 86400000) return;
    setTimeout(function () { backupNow().catch(function () { /* se reintenta en el próximo arranque */ }); }, 30000);
  }

  // ---------------------------------------------------------------- cola desde el móvil (cola.txt en el mismo Gist)

  // una línea por título: enlace o ID de IMDb (tt…) o el nombre; «ver …» delante abre además su ficha.
  // Lo que se entiende va a Mi lista y la línea se borra; lo que no, se queda marcado con ✗ para corregirlo
  var QUEUE_FILE = 'cola.txt';
  var QUEUE_HELP = '# StremTV · cola desde el móvil\n' +
    '# Escribe una línea por título y la tele lo añade a Mi lista en unos minutos:\n' +
    '#   un enlace de IMDb (https://www.imdb.com/title/tt0816692/), su ID (tt0816692) o el nombre (Interstellar)\n' +
    '#   «ver » delante (ver The Bear) abre además su ficha en la tele\n' +
    '#   «serie »/«película » delante si el nombre se confunde (serie The Office)\n';
  var queueBusy = false;
  function fold(t) { return String(t || '').toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n'); }

  // { type, imdb, name } del título de la línea, o null
  function queueLookup(line) {
    var tt = /tt\d{5,}/.exec(line);
    if (tt) {
      var meta = function (type) {
        return getJSON(CINEMETA + '/meta/' + type + '/' + tt[0] + '.json').then(function (d) { return d.meta && d.meta.name ? { type: type, imdb: tt[0], name: d.meta.name, poster: d.meta.poster } : null; }, function () { return null; });
      };
      return Promise.all([meta('movie'), meta('series')]).then(function (r) { return r[0] || r[1]; });
    }
    var only = /^(serie|series|show)\s+/i.test(line) ? 'series' : /^(pel[ií]cula|peli|movie|film)\s+/i.test(line) ? 'movie' : '';
    var q = line.replace(/^(serie|series|show|pel[ií]cula|peli|movie|film)\s+/i, '').replace(/^\s+|\s+$/g, '');
    if (!q) return Promise.resolve(null);
    // Cinemeta y TMDB devuelven algo hasta con texto sin sentido: vale si al menos la mitad de las palabras del nombre escrito
    // están en el título (con o sin tildes, en español o en el original)
    var words = function (t) { return fold(t).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1 || /\d/.test(w); }); };
    var mine = words(q);
    var fits = function (names) {
      var have = [];
      names.forEach(function (n) { have = have.concat(words(n)); });
      var hits = mine.filter(function (w) { return have.indexOf(w) >= 0; }).length;
      return mine.length && hits * 2 >= mine.length;
    };
    var search = function (type) {
      if (only && only !== type) return Promise.resolve([]);
      return getJSON(CINEMETA + '/catalog/' + type + '/top/search=' + encodeURIComponent(q) + '.json').then(function (d) {
        return (d.metas || []).filter(function (m) { return /^tt/.test(m.id || '') && fits([m.name]); })
          .map(function (m) { return { type: type, imdb: m.id, name: m.name, poster: m.poster }; });
      }, function () { return []; });
    };
    // con TMDB, también títulos en español («La casa del dragón»): su id de IMDb sale de external_ids
    var tmdb = !tmdbOn() ? Promise.resolve(null) : tmdbGet('/search/multi?include_adult=false&query=' + encodeURIComponent(q)).then(function (d) {
      var x = (d.results || []).filter(function (x) {
        return (x.media_type === 'movie' || x.media_type === 'tv') && (!only || (only === 'movie') === (x.media_type === 'movie')) &&
          fits([x.title || x.name || '', x.original_title || x.original_name || '']);
      })[0];
      if (!x) return null;
      return tmdbGet('/' + x.media_type + '/' + x.id + '/external_ids').then(function (e) {
        return e.imdb_id ? { type: x.media_type === 'movie' ? 'movie' : 'series', imdb: e.imdb_id, name: x.title || x.name,
          poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '' } : null;
      });
    }).catch(function () { return null; });
    return Promise.all([tmdb, search('movie'), search('series')]).then(function (r) {
      if (r[0]) return r[0];
      var all = r[1].concat(r[2]), low = fold(q);
      var exact = all.filter(function (m) { return fold(m.name) === low; })[0];
      return exact || all[0] || null;
    });
  }

  function queueAdd(m) {
    if (Trakt.linked()) {
      var b = {};
      b[m.type === 'movie' ? 'movies' : 'shows'] = [{ ids: { imdb: m.imdb } }];
      return Trakt.call('POST', '/sync/watchlist', b).then(function () { Trakt.watchlist[m.imdb] = true; });
    }
    if (!myList[m.imdb]) {
      myList[m.imdb] = { id: m.imdb, type: m.type, name: m.name, poster: m.poster, ts: Date.now() };
      save('mylist', myList);
    }
    return Promise.resolve();
  }

  function checkQueue() {
    if (!backup.token || queueBusy) return Promise.resolve(0);
    queueBusy = true;
    var gistId = null, done = 0;
    return findBackupGist().then(function (id) {
      if (!id) return null; // aún sin copia: la cola se crea con la primera
      gistId = id;
      return ghReq('GET', '/gists/' + id);
    }).then(function (g) {
      if (!g) return;
      var f = g.files && g.files[QUEUE_FILE];
      if (!f) { // primera vez: crear el archivo con las instrucciones
        var files = {};
        files[QUEUE_FILE] = { content: QUEUE_HELP };
        return ghReq('PATCH', '/gists/' + gistId, { files: files });
      }
      var lines = String(f.content || '').split('\n').map(function (l) { return l.replace(/^\s+|\s+$/g, ''); })
        .filter(function (l) { return l && l.charAt(0) !== '#' && l.indexOf('✗ ') !== 0; });
      if (!lines.length) return;
      var failed = [], open = null;
      return mapLimit(lines, 3, function (line) {
        var watch = /^(ver|play|▶)\s*:?\s+/i.test(line);
        return queueLookup(line.replace(/^(ver|play|▶)\s*:?\s+/i, '')).then(function (m) {
          if (!m) { failed.push(line); return; }
          return queueAdd(m).then(function () {
            done++;
            logEv('cola', m.name, { linea: line, imdb: m.imdb });
            if (watch) open = m;
            toast(tr('Desde el móvil: {0} en Mi lista', m.name), 5000);
          });
        }).catch(function () { failed.push(line); });
      }).then(function () {
        // abrir la ficha pedida con «ver», salvo con un vídeo en marcha (ahí basta con tenerlo en la lista)
        if (open && !Player.stream) push(detailScreen(open.type, open.imdb));
        // releer por si se ha escrito algo mientras tanto: lo hecho se borra, lo no entendido queda con ✗ y el resto se queda
        return ghReq('GET', '/gists/' + gistId).then(function (g2) {
          var now = g2.files && g2.files[QUEUE_FILE] ? String(g2.files[QUEUE_FILE].content || '') : QUEUE_HELP;
          var out = now.split('\n').map(function (l) {
            var t = l.replace(/^\s+|\s+$/g, '');
            if (failed.indexOf(t) >= 0) return '✗ ' + t;
            return lines.indexOf(t) >= 0 ? null : l;
          }).filter(function (l) { return l !== null; });
          var files = {};
          files[QUEUE_FILE] = { content: out.join('\n').replace(/\n*$/, '\n') };
          return ghReq('PATCH', '/gists/' + gistId, { files: files });
        });
      });
    }).then(function () { queueBusy = false; return done; }, function (e) { queueBusy = false; logEv('cola', 'error: ' + e.message); return done; });
  }

  // al arrancar (pasados 20 s), cada 3 minutos y al volver a la app (sin token de GitHub no hace nada)
  function startQueue() {
    setTimeout(checkQueue, 20000);
    setInterval(function () { if (!document.hidden) checkQueue(); }, 180000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkQueue(); });
  }

  // ---------------------------------------------------------------- ocultar lo ya visto

  // movies / shows: vistas (series: sin emitidos pendientes) por id de IMDb; tmdb: lo mismo por «movie:id» / «tv:id»;
  // started: series con algún episodio visto (imdb y «tv:id»)
  var Seen = { movies: {}, shows: {}, tmdb: {}, started: {}, at: 0, loading: null };

  // espera (como mucho una vez cada 10 min) a tener la lista de vistos de Trakt; «always»: aunque no se oculte lo visto
  function seenReady(always) {
    if ((!settings.hideWatched && !always) || !Trakt.linked()) return Promise.resolve();
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
  function tmdbKeyOf(m) {
    var t = /^tmdb:(movie|tv):(\d+)$/.exec(String(m.id || ''));
    return t ? t[1] + ':' + t[2] : null;
  }

  function isSeenMeta(m) {
    var id = String(m.id || '');
    var imdb = imdbOfMeta(m), tk = tmdbKeyOf(m);
    if (tk && Seen.tmdb[tk]) return true;
    if (m.type === 'movie') return !!((imdb && Seen.movies[imdb]) || (progress[id] && progress[id].done));
    return !!(imdb && Seen.shows[imdb]);
  }
  // ni vista ni empezada (para «Para ti» y «Solo sin ver»)
  function isUnseen(m) {
    var imdb = imdbOfMeta(m), tk = tmdbKeyOf(m);
    return !isSeenMeta(m) && !(imdb && Seen.started[imdb]) && !(tk && Seen.started[tk]);
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
      if (!screen.overlay) {
        top.el.style.display = 'none';
        if (top.onHide) top.onHide(); // tapada por otra pantalla (vuelve con onResume)
      }
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

  // casilla final de una fila que lleva a otra pantalla (more: { label, onPick }), del tamaño de una carátula
  function moreTile(more) {
    var c = el('div', 'card more');
    c.appendChild(el('div', 'poster', '<div class="more-label">' + esc(more.label) + '</div>'));
    c.appendChild(el('div', 'name'));
    return focusable(c, more.onPick);
  }

  function posterRow(title, metas, onPick, extras, more) {
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
    if (more) sc.appendChild(moreTile(more));
    loadImages(cards, 8);
    row.appendChild(sc);
    return row;
  }

  // fila que se rellena cuando llega la promesa (metas con .pct/.label/.isNew/.left/.badge opcionales; la lista puede traer
  // .title si el título depende de los datos, como «Óscar 2026»). Si en vez de la promesa se da
  // una función que la crea, la fila que falla por la red se vuelve a pedir sola cuando vuelve la conexión.
  // more: casilla final que lleva a otra pantalla (ver moreTile), solo si la fila tiene algo
  function promiseRow(container, title, promise, onPick, hideIfEmpty, max, more) {
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
          }), more)
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

  // ---------------------------------------------------------------- código QR

  // Generador de códigos QR de Kazuhiko Arase (qrcode-generator 1.4.4, licencia MIT, se conserva su cabecera), recortado
  // a lo que usa la app: solo modo byte (texto ASCII como una URL) y sin las salidas a tabla, SVG, GIF ni texto; se dibuja
  // con qrCanvas, al final. Ya era ES5. Se genera en la tele: la URL lleva el tema secreto de ntfy y no debe ir a un
  // servicio de QR de fuera.

  //---------------------------------------------------------------------
  //
  // QR Code Generator for JavaScript
  //
  // Copyright (c) 2009 Kazuhiko Arase
  //
  // URL: http://www.d-project.com/
  //
  // Licensed under the MIT license:
  //  http://www.opensource.org/licenses/mit-license.php
  //
  // The word 'QR Code' is registered trademark of
  // DENSO WAVE INCORPORATED
  //  http://www.denso-wave.com/qrcode/faqpatent-e.html
  //
  //---------------------------------------------------------------------

  var qrcode = function() {

    //---------------------------------------------------------------------
    // qrcode
    //---------------------------------------------------------------------

    /**
     * qrcode
     * @param typeNumber 1 to 40
     * @param errorCorrectionLevel 'L','M','Q','H'
     */
    var qrcode = function(typeNumber, errorCorrectionLevel) {

      var PAD0 = 0xEC;
      var PAD1 = 0x11;

      var _typeNumber = typeNumber;
      var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
      var _modules = null;
      var _moduleCount = 0;
      var _dataCache = null;
      var _dataList = [];

      var _this = {};

      var makeImpl = function(test, maskPattern) {

        _moduleCount = _typeNumber * 4 + 17;
        _modules = function(moduleCount) {
          var modules = new Array(moduleCount);
          for (var row = 0; row < moduleCount; row += 1) {
            modules[row] = new Array(moduleCount);
            for (var col = 0; col < moduleCount; col += 1) {
              modules[row][col] = null;
            }
          }
          return modules;
        }(_moduleCount);

        setupPositionProbePattern(0, 0);
        setupPositionProbePattern(_moduleCount - 7, 0);
        setupPositionProbePattern(0, _moduleCount - 7);
        setupPositionAdjustPattern();
        setupTimingPattern();
        setupTypeInfo(test, maskPattern);

        if (_typeNumber >= 7) {
          setupTypeNumber(test);
        }

        if (_dataCache == null) {
          _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
        }

        mapData(_dataCache, maskPattern);
      };

      var setupPositionProbePattern = function(row, col) {

        for (var r = -1; r <= 7; r += 1) {

          if (row + r <= -1 || _moduleCount <= row + r) continue;

          for (var c = -1; c <= 7; c += 1) {

            if (col + c <= -1 || _moduleCount <= col + c) continue;

            if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
                || (0 <= c && c <= 6 && (r == 0 || r == 6) )
                || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
              _modules[row + r][col + c] = true;
            } else {
              _modules[row + r][col + c] = false;
            }
          }
        }
      };

      var getBestMaskPattern = function() {

        var minLostPoint = 0;
        var pattern = 0;

        for (var i = 0; i < 8; i += 1) {

          makeImpl(true, i);

          var lostPoint = QRUtil.getLostPoint(_this);

          if (i == 0 || minLostPoint > lostPoint) {
            minLostPoint = lostPoint;
            pattern = i;
          }
        }

        return pattern;
      };

      var setupTimingPattern = function() {

        for (var r = 8; r < _moduleCount - 8; r += 1) {
          if (_modules[r][6] != null) {
            continue;
          }
          _modules[r][6] = (r % 2 == 0);
        }

        for (var c = 8; c < _moduleCount - 8; c += 1) {
          if (_modules[6][c] != null) {
            continue;
          }
          _modules[6][c] = (c % 2 == 0);
        }
      };

      var setupPositionAdjustPattern = function() {

        var pos = QRUtil.getPatternPosition(_typeNumber);

        for (var i = 0; i < pos.length; i += 1) {

          for (var j = 0; j < pos.length; j += 1) {

            var row = pos[i];
            var col = pos[j];

            if (_modules[row][col] != null) {
              continue;
            }

            for (var r = -2; r <= 2; r += 1) {

              for (var c = -2; c <= 2; c += 1) {

                if (r == -2 || r == 2 || c == -2 || c == 2
                    || (r == 0 && c == 0) ) {
                  _modules[row + r][col + c] = true;
                } else {
                  _modules[row + r][col + c] = false;
                }
              }
            }
          }
        }
      };

      var setupTypeNumber = function(test) {

        var bits = QRUtil.getBCHTypeNumber(_typeNumber);

        for (var i = 0; i < 18; i += 1) {
          var mod = (!test && ( (bits >> i) & 1) == 1);
          _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
        }

        for (var i = 0; i < 18; i += 1) {
          var mod = (!test && ( (bits >> i) & 1) == 1);
          _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
        }
      };

      var setupTypeInfo = function(test, maskPattern) {

        var data = (_errorCorrectionLevel << 3) | maskPattern;
        var bits = QRUtil.getBCHTypeInfo(data);

        // vertical
        for (var i = 0; i < 15; i += 1) {

          var mod = (!test && ( (bits >> i) & 1) == 1);

          if (i < 6) {
            _modules[i][8] = mod;
          } else if (i < 8) {
            _modules[i + 1][8] = mod;
          } else {
            _modules[_moduleCount - 15 + i][8] = mod;
          }
        }

        // horizontal
        for (var i = 0; i < 15; i += 1) {

          var mod = (!test && ( (bits >> i) & 1) == 1);

          if (i < 8) {
            _modules[8][_moduleCount - i - 1] = mod;
          } else if (i < 9) {
            _modules[8][15 - i - 1 + 1] = mod;
          } else {
            _modules[8][15 - i - 1] = mod;
          }
        }

        // fixed module
        _modules[_moduleCount - 8][8] = (!test);
      };

      var mapData = function(data, maskPattern) {

        var inc = -1;
        var row = _moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        var maskFunc = QRUtil.getMaskFunction(maskPattern);

        for (var col = _moduleCount - 1; col > 0; col -= 2) {

          if (col == 6) col -= 1;

          while (true) {

            for (var c = 0; c < 2; c += 1) {

              if (_modules[row][col - c] == null) {

                var dark = false;

                if (byteIndex < data.length) {
                  dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
                }

                var mask = maskFunc(row, col - c);

                if (mask) {
                  dark = !dark;
                }

                _modules[row][col - c] = dark;
                bitIndex -= 1;

                if (bitIndex == -1) {
                  byteIndex += 1;
                  bitIndex = 7;
                }
              }
            }

            row += inc;

            if (row < 0 || _moduleCount <= row) {
              row -= inc;
              inc = -inc;
              break;
            }
          }
        }
      };

      var createBytes = function(buffer, rsBlocks) {

        var offset = 0;

        var maxDcCount = 0;
        var maxEcCount = 0;

        var dcdata = new Array(rsBlocks.length);
        var ecdata = new Array(rsBlocks.length);

        for (var r = 0; r < rsBlocks.length; r += 1) {

          var dcCount = rsBlocks[r].dataCount;
          var ecCount = rsBlocks[r].totalCount - dcCount;

          maxDcCount = Math.max(maxDcCount, dcCount);
          maxEcCount = Math.max(maxEcCount, ecCount);

          dcdata[r] = new Array(dcCount);

          for (var i = 0; i < dcdata[r].length; i += 1) {
            dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
          }
          offset += dcCount;

          var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
          var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

          var modPoly = rawPoly.mod(rsPoly);
          ecdata[r] = new Array(rsPoly.getLength() - 1);
          for (var i = 0; i < ecdata[r].length; i += 1) {
            var modIndex = i + modPoly.getLength() - ecdata[r].length;
            ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
          }
        }

        var totalCodeCount = 0;
        for (var i = 0; i < rsBlocks.length; i += 1) {
          totalCodeCount += rsBlocks[i].totalCount;
        }

        var data = new Array(totalCodeCount);
        var index = 0;

        for (var i = 0; i < maxDcCount; i += 1) {
          for (var r = 0; r < rsBlocks.length; r += 1) {
            if (i < dcdata[r].length) {
              data[index] = dcdata[r][i];
              index += 1;
            }
          }
        }

        for (var i = 0; i < maxEcCount; i += 1) {
          for (var r = 0; r < rsBlocks.length; r += 1) {
            if (i < ecdata[r].length) {
              data[index] = ecdata[r][i];
              index += 1;
            }
          }
        }

        return data;
      };

      var createData = function(typeNumber, errorCorrectionLevel, dataList) {

        var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

        var buffer = qrBitBuffer();

        for (var i = 0; i < dataList.length; i += 1) {
          var data = dataList[i];
          buffer.put(data.getMode(), 4);
          buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
          data.write(buffer);
        }

        // calc num max data.
        var totalDataCount = 0;
        for (var i = 0; i < rsBlocks.length; i += 1) {
          totalDataCount += rsBlocks[i].dataCount;
        }

        if (buffer.getLengthInBits() > totalDataCount * 8) {
          throw 'code length overflow. ('
            + buffer.getLengthInBits()
            + '>'
            + totalDataCount * 8
            + ')';
        }

        // end code
        if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
          buffer.put(0, 4);
        }

        // padding
        while (buffer.getLengthInBits() % 8 != 0) {
          buffer.putBit(false);
        }

        // padding
        while (true) {

          if (buffer.getLengthInBits() >= totalDataCount * 8) {
            break;
          }
          buffer.put(PAD0, 8);

          if (buffer.getLengthInBits() >= totalDataCount * 8) {
            break;
          }
          buffer.put(PAD1, 8);
        }

        return createBytes(buffer, rsBlocks);
      };

      _this.addData = function(data) {
        _dataList.push(qr8BitByte(data) );
        _dataCache = null;
      };

      _this.isDark = function(row, col) {
        if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
          throw row + ',' + col;
        }
        return _modules[row][col];
      };

      _this.getModuleCount = function() {
        return _moduleCount;
      };

      _this.make = function() {
        if (_typeNumber < 1) {
          var typeNumber = 1;

          for (; typeNumber < 40; typeNumber++) {
            var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
            var buffer = qrBitBuffer();

            for (var i = 0; i < _dataList.length; i++) {
              var data = _dataList[i];
              buffer.put(data.getMode(), 4);
              buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
              data.write(buffer);
            }

            var totalDataCount = 0;
            for (var i = 0; i < rsBlocks.length; i++) {
              totalDataCount += rsBlocks[i].dataCount;
            }

            if (buffer.getLengthInBits() <= totalDataCount * 8) {
              break;
            }
          }

          _typeNumber = typeNumber;
        }

        makeImpl(false, getBestMaskPattern() );
      };

      return _this;
    };

    //---------------------------------------------------------------------
    // qrcode.stringToBytes
    //---------------------------------------------------------------------

    qrcode.stringToBytesFuncs = {
      'default' : function(s) {
        var bytes = [];
        for (var i = 0; i < s.length; i += 1) {
          var c = s.charCodeAt(i);
          bytes.push(c & 0xff);
        }
        return bytes;
      }
    };

    qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

    //---------------------------------------------------------------------
    // QRMode
    //---------------------------------------------------------------------

    var QRMode = {
      MODE_NUMBER :    1 << 0,
      MODE_ALPHA_NUM : 1 << 1,
      MODE_8BIT_BYTE : 1 << 2,
      MODE_KANJI :     1 << 3
    };

    //---------------------------------------------------------------------
    // QRErrorCorrectionLevel
    //---------------------------------------------------------------------

    var QRErrorCorrectionLevel = {
      L : 1,
      M : 0,
      Q : 3,
      H : 2
    };

    //---------------------------------------------------------------------
    // QRMaskPattern
    //---------------------------------------------------------------------

    var QRMaskPattern = {
      PATTERN000 : 0,
      PATTERN001 : 1,
      PATTERN010 : 2,
      PATTERN011 : 3,
      PATTERN100 : 4,
      PATTERN101 : 5,
      PATTERN110 : 6,
      PATTERN111 : 7
    };

    //---------------------------------------------------------------------
    // QRUtil
    //---------------------------------------------------------------------

    var QRUtil = function() {

      var PATTERN_POSITION_TABLE = [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
      ];
      var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
      var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
      var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

      var _this = {};

      var getBCHDigit = function(data) {
        var digit = 0;
        while (data != 0) {
          digit += 1;
          data >>>= 1;
        }
        return digit;
      };

      _this.getBCHTypeInfo = function(data) {
        var d = data << 10;
        while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
          d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
        }
        return ( (data << 10) | d) ^ G15_MASK;
      };

      _this.getBCHTypeNumber = function(data) {
        var d = data << 12;
        while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
          d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
        }
        return (data << 12) | d;
      };

      _this.getPatternPosition = function(typeNumber) {
        return PATTERN_POSITION_TABLE[typeNumber - 1];
      };

      _this.getMaskFunction = function(maskPattern) {

        switch (maskPattern) {

        case QRMaskPattern.PATTERN000 :
          return function(i, j) { return (i + j) % 2 == 0; };
        case QRMaskPattern.PATTERN001 :
          return function(i, j) { return i % 2 == 0; };
        case QRMaskPattern.PATTERN010 :
          return function(i, j) { return j % 3 == 0; };
        case QRMaskPattern.PATTERN011 :
          return function(i, j) { return (i + j) % 3 == 0; };
        case QRMaskPattern.PATTERN100 :
          return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
        case QRMaskPattern.PATTERN101 :
          return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
        case QRMaskPattern.PATTERN110 :
          return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
        case QRMaskPattern.PATTERN111 :
          return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

        default :
          throw 'bad maskPattern:' + maskPattern;
        }
      };

      _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
        var a = qrPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i += 1) {
          a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
        }
        return a;
      };

      _this.getLengthInBits = function(mode, type) {

        if (1 <= type && type < 10) {

          // 1 - 9

          switch(mode) {
          case QRMode.MODE_NUMBER    : return 10;
          case QRMode.MODE_ALPHA_NUM : return 9;
          case QRMode.MODE_8BIT_BYTE : return 8;
          case QRMode.MODE_KANJI     : return 8;
          default :
            throw 'mode:' + mode;
          }

        } else if (type < 27) {

          // 10 - 26

          switch(mode) {
          case QRMode.MODE_NUMBER    : return 12;
          case QRMode.MODE_ALPHA_NUM : return 11;
          case QRMode.MODE_8BIT_BYTE : return 16;
          case QRMode.MODE_KANJI     : return 10;
          default :
            throw 'mode:' + mode;
          }

        } else if (type < 41) {

          // 27 - 40

          switch(mode) {
          case QRMode.MODE_NUMBER    : return 14;
          case QRMode.MODE_ALPHA_NUM : return 13;
          case QRMode.MODE_8BIT_BYTE : return 16;
          case QRMode.MODE_KANJI     : return 12;
          default :
            throw 'mode:' + mode;
          }

        } else {
          throw 'type:' + type;
        }
      };

      _this.getLostPoint = function(qrcode) {

        var moduleCount = qrcode.getModuleCount();

        var lostPoint = 0;

        // LEVEL1

        for (var row = 0; row < moduleCount; row += 1) {
          for (var col = 0; col < moduleCount; col += 1) {

            var sameCount = 0;
            var dark = qrcode.isDark(row, col);

            for (var r = -1; r <= 1; r += 1) {

              if (row + r < 0 || moduleCount <= row + r) {
                continue;
              }

              for (var c = -1; c <= 1; c += 1) {

                if (col + c < 0 || moduleCount <= col + c) {
                  continue;
                }

                if (r == 0 && c == 0) {
                  continue;
                }

                if (dark == qrcode.isDark(row + r, col + c) ) {
                  sameCount += 1;
                }
              }
            }

            if (sameCount > 5) {
              lostPoint += (3 + sameCount - 5);
            }
          }
        };

        // LEVEL2

        for (var row = 0; row < moduleCount - 1; row += 1) {
          for (var col = 0; col < moduleCount - 1; col += 1) {
            var count = 0;
            if (qrcode.isDark(row, col) ) count += 1;
            if (qrcode.isDark(row + 1, col) ) count += 1;
            if (qrcode.isDark(row, col + 1) ) count += 1;
            if (qrcode.isDark(row + 1, col + 1) ) count += 1;
            if (count == 0 || count == 4) {
              lostPoint += 3;
            }
          }
        }

        // LEVEL3

        for (var row = 0; row < moduleCount; row += 1) {
          for (var col = 0; col < moduleCount - 6; col += 1) {
            if (qrcode.isDark(row, col)
                && !qrcode.isDark(row, col + 1)
                &&  qrcode.isDark(row, col + 2)
                &&  qrcode.isDark(row, col + 3)
                &&  qrcode.isDark(row, col + 4)
                && !qrcode.isDark(row, col + 5)
                &&  qrcode.isDark(row, col + 6) ) {
              lostPoint += 40;
            }
          }
        }

        for (var col = 0; col < moduleCount; col += 1) {
          for (var row = 0; row < moduleCount - 6; row += 1) {
            if (qrcode.isDark(row, col)
                && !qrcode.isDark(row + 1, col)
                &&  qrcode.isDark(row + 2, col)
                &&  qrcode.isDark(row + 3, col)
                &&  qrcode.isDark(row + 4, col)
                && !qrcode.isDark(row + 5, col)
                &&  qrcode.isDark(row + 6, col) ) {
              lostPoint += 40;
            }
          }
        }

        // LEVEL4

        var darkCount = 0;

        for (var col = 0; col < moduleCount; col += 1) {
          for (var row = 0; row < moduleCount; row += 1) {
            if (qrcode.isDark(row, col) ) {
              darkCount += 1;
            }
          }
        }

        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;
      };

      return _this;
    }();

    //---------------------------------------------------------------------
    // QRMath
    //---------------------------------------------------------------------

    var QRMath = function() {

      var EXP_TABLE = new Array(256);
      var LOG_TABLE = new Array(256);

      // initialize tables
      for (var i = 0; i < 8; i += 1) {
        EXP_TABLE[i] = 1 << i;
      }
      for (var i = 8; i < 256; i += 1) {
        EXP_TABLE[i] = EXP_TABLE[i - 4]
          ^ EXP_TABLE[i - 5]
          ^ EXP_TABLE[i - 6]
          ^ EXP_TABLE[i - 8];
      }
      for (var i = 0; i < 255; i += 1) {
        LOG_TABLE[EXP_TABLE[i] ] = i;
      }

      var _this = {};

      _this.glog = function(n) {

        if (n < 1) {
          throw 'glog(' + n + ')';
        }

        return LOG_TABLE[n];
      };

      _this.gexp = function(n) {

        while (n < 0) {
          n += 255;
        }

        while (n >= 256) {
          n -= 255;
        }

        return EXP_TABLE[n];
      };

      return _this;
    }();

    //---------------------------------------------------------------------
    // qrPolynomial
    //---------------------------------------------------------------------

    function qrPolynomial(num, shift) {

      if (typeof num.length == 'undefined') {
        throw num.length + '/' + shift;
      }

      var _num = function() {
        var offset = 0;
        while (offset < num.length && num[offset] == 0) {
          offset += 1;
        }
        var _num = new Array(num.length - offset + shift);
        for (var i = 0; i < num.length - offset; i += 1) {
          _num[i] = num[i + offset];
        }
        return _num;
      }();

      var _this = {};

      _this.getAt = function(index) {
        return _num[index];
      };

      _this.getLength = function() {
        return _num.length;
      };

      _this.multiply = function(e) {

        var num = new Array(_this.getLength() + e.getLength() - 1);

        for (var i = 0; i < _this.getLength(); i += 1) {
          for (var j = 0; j < e.getLength(); j += 1) {
            num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
          }
        }

        return qrPolynomial(num, 0);
      };

      _this.mod = function(e) {

        if (_this.getLength() - e.getLength() < 0) {
          return _this;
        }

        var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

        var num = new Array(_this.getLength() );
        for (var i = 0; i < _this.getLength(); i += 1) {
          num[i] = _this.getAt(i);
        }

        for (var i = 0; i < e.getLength(); i += 1) {
          num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
        }

        // recursive call
        return qrPolynomial(num, 0).mod(e);
      };

      return _this;
    };

    //---------------------------------------------------------------------
    // QRRSBlock
    //---------------------------------------------------------------------

    var QRRSBlock = function() {

      var RS_BLOCK_TABLE = [

        // L
        // M
        // Q
        // H

        // 1
        [1, 26, 19],
        [1, 26, 16],
        [1, 26, 13],
        [1, 26, 9],

        // 2
        [1, 44, 34],
        [1, 44, 28],
        [1, 44, 22],
        [1, 44, 16],

        // 3
        [1, 70, 55],
        [1, 70, 44],
        [2, 35, 17],
        [2, 35, 13],

        // 4
        [1, 100, 80],
        [2, 50, 32],
        [2, 50, 24],
        [4, 25, 9],

        // 5
        [1, 134, 108],
        [2, 67, 43],
        [2, 33, 15, 2, 34, 16],
        [2, 33, 11, 2, 34, 12],

        // 6
        [2, 86, 68],
        [4, 43, 27],
        [4, 43, 19],
        [4, 43, 15],

        // 7
        [2, 98, 78],
        [4, 49, 31],
        [2, 32, 14, 4, 33, 15],
        [4, 39, 13, 1, 40, 14],

        // 8
        [2, 121, 97],
        [2, 60, 38, 2, 61, 39],
        [4, 40, 18, 2, 41, 19],
        [4, 40, 14, 2, 41, 15],

        // 9
        [2, 146, 116],
        [3, 58, 36, 2, 59, 37],
        [4, 36, 16, 4, 37, 17],
        [4, 36, 12, 4, 37, 13],

        // 10
        [2, 86, 68, 2, 87, 69],
        [4, 69, 43, 1, 70, 44],
        [6, 43, 19, 2, 44, 20],
        [6, 43, 15, 2, 44, 16],

        // 11
        [4, 101, 81],
        [1, 80, 50, 4, 81, 51],
        [4, 50, 22, 4, 51, 23],
        [3, 36, 12, 8, 37, 13],

        // 12
        [2, 116, 92, 2, 117, 93],
        [6, 58, 36, 2, 59, 37],
        [4, 46, 20, 6, 47, 21],
        [7, 42, 14, 4, 43, 15],

        // 13
        [4, 133, 107],
        [8, 59, 37, 1, 60, 38],
        [8, 44, 20, 4, 45, 21],
        [12, 33, 11, 4, 34, 12],

        // 14
        [3, 145, 115, 1, 146, 116],
        [4, 64, 40, 5, 65, 41],
        [11, 36, 16, 5, 37, 17],
        [11, 36, 12, 5, 37, 13],

        // 15
        [5, 109, 87, 1, 110, 88],
        [5, 65, 41, 5, 66, 42],
        [5, 54, 24, 7, 55, 25],
        [11, 36, 12, 7, 37, 13],

        // 16
        [5, 122, 98, 1, 123, 99],
        [7, 73, 45, 3, 74, 46],
        [15, 43, 19, 2, 44, 20],
        [3, 45, 15, 13, 46, 16],

        // 17
        [1, 135, 107, 5, 136, 108],
        [10, 74, 46, 1, 75, 47],
        [1, 50, 22, 15, 51, 23],
        [2, 42, 14, 17, 43, 15],

        // 18
        [5, 150, 120, 1, 151, 121],
        [9, 69, 43, 4, 70, 44],
        [17, 50, 22, 1, 51, 23],
        [2, 42, 14, 19, 43, 15],

        // 19
        [3, 141, 113, 4, 142, 114],
        [3, 70, 44, 11, 71, 45],
        [17, 47, 21, 4, 48, 22],
        [9, 39, 13, 16, 40, 14],

        // 20
        [3, 135, 107, 5, 136, 108],
        [3, 67, 41, 13, 68, 42],
        [15, 54, 24, 5, 55, 25],
        [15, 43, 15, 10, 44, 16],

        // 21
        [4, 144, 116, 4, 145, 117],
        [17, 68, 42],
        [17, 50, 22, 6, 51, 23],
        [19, 46, 16, 6, 47, 17],

        // 22
        [2, 139, 111, 7, 140, 112],
        [17, 74, 46],
        [7, 54, 24, 16, 55, 25],
        [34, 37, 13],

        // 23
        [4, 151, 121, 5, 152, 122],
        [4, 75, 47, 14, 76, 48],
        [11, 54, 24, 14, 55, 25],
        [16, 45, 15, 14, 46, 16],

        // 24
        [6, 147, 117, 4, 148, 118],
        [6, 73, 45, 14, 74, 46],
        [11, 54, 24, 16, 55, 25],
        [30, 46, 16, 2, 47, 17],

        // 25
        [8, 132, 106, 4, 133, 107],
        [8, 75, 47, 13, 76, 48],
        [7, 54, 24, 22, 55, 25],
        [22, 45, 15, 13, 46, 16],

        // 26
        [10, 142, 114, 2, 143, 115],
        [19, 74, 46, 4, 75, 47],
        [28, 50, 22, 6, 51, 23],
        [33, 46, 16, 4, 47, 17],

        // 27
        [8, 152, 122, 4, 153, 123],
        [22, 73, 45, 3, 74, 46],
        [8, 53, 23, 26, 54, 24],
        [12, 45, 15, 28, 46, 16],

        // 28
        [3, 147, 117, 10, 148, 118],
        [3, 73, 45, 23, 74, 46],
        [4, 54, 24, 31, 55, 25],
        [11, 45, 15, 31, 46, 16],

        // 29
        [7, 146, 116, 7, 147, 117],
        [21, 73, 45, 7, 74, 46],
        [1, 53, 23, 37, 54, 24],
        [19, 45, 15, 26, 46, 16],

        // 30
        [5, 145, 115, 10, 146, 116],
        [19, 75, 47, 10, 76, 48],
        [15, 54, 24, 25, 55, 25],
        [23, 45, 15, 25, 46, 16],

        // 31
        [13, 145, 115, 3, 146, 116],
        [2, 74, 46, 29, 75, 47],
        [42, 54, 24, 1, 55, 25],
        [23, 45, 15, 28, 46, 16],

        // 32
        [17, 145, 115],
        [10, 74, 46, 23, 75, 47],
        [10, 54, 24, 35, 55, 25],
        [19, 45, 15, 35, 46, 16],

        // 33
        [17, 145, 115, 1, 146, 116],
        [14, 74, 46, 21, 75, 47],
        [29, 54, 24, 19, 55, 25],
        [11, 45, 15, 46, 46, 16],

        // 34
        [13, 145, 115, 6, 146, 116],
        [14, 74, 46, 23, 75, 47],
        [44, 54, 24, 7, 55, 25],
        [59, 46, 16, 1, 47, 17],

        // 35
        [12, 151, 121, 7, 152, 122],
        [12, 75, 47, 26, 76, 48],
        [39, 54, 24, 14, 55, 25],
        [22, 45, 15, 41, 46, 16],

        // 36
        [6, 151, 121, 14, 152, 122],
        [6, 75, 47, 34, 76, 48],
        [46, 54, 24, 10, 55, 25],
        [2, 45, 15, 64, 46, 16],

        // 37
        [17, 152, 122, 4, 153, 123],
        [29, 74, 46, 14, 75, 47],
        [49, 54, 24, 10, 55, 25],
        [24, 45, 15, 46, 46, 16],

        // 38
        [4, 152, 122, 18, 153, 123],
        [13, 74, 46, 32, 75, 47],
        [48, 54, 24, 14, 55, 25],
        [42, 45, 15, 32, 46, 16],

        // 39
        [20, 147, 117, 4, 148, 118],
        [40, 75, 47, 7, 76, 48],
        [43, 54, 24, 22, 55, 25],
        [10, 45, 15, 67, 46, 16],

        // 40
        [19, 148, 118, 6, 149, 119],
        [18, 75, 47, 31, 76, 48],
        [34, 54, 24, 34, 55, 25],
        [20, 45, 15, 61, 46, 16]
      ];

      var qrRSBlock = function(totalCount, dataCount) {
        var _this = {};
        _this.totalCount = totalCount;
        _this.dataCount = dataCount;
        return _this;
      };

      var _this = {};

      var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

        switch(errorCorrectionLevel) {
        case QRErrorCorrectionLevel.L :
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case QRErrorCorrectionLevel.M :
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case QRErrorCorrectionLevel.Q :
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case QRErrorCorrectionLevel.H :
          return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default :
          return undefined;
        }
      };

      _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

        var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

        if (typeof rsBlock == 'undefined') {
          throw 'bad rs block @ typeNumber:' + typeNumber +
              '/errorCorrectionLevel:' + errorCorrectionLevel;
        }

        var length = rsBlock.length / 3;

        var list = [];

        for (var i = 0; i < length; i += 1) {

          var count = rsBlock[i * 3 + 0];
          var totalCount = rsBlock[i * 3 + 1];
          var dataCount = rsBlock[i * 3 + 2];

          for (var j = 0; j < count; j += 1) {
            list.push(qrRSBlock(totalCount, dataCount) );
          }
        }

        return list;
      };

      return _this;
    }();

    //---------------------------------------------------------------------
    // qrBitBuffer
    //---------------------------------------------------------------------

    var qrBitBuffer = function() {

      var _buffer = [];
      var _length = 0;

      var _this = {};

      _this.getBuffer = function() {
        return _buffer;
      };

      _this.getAt = function(index) {
        var bufIndex = Math.floor(index / 8);
        return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
      };

      _this.put = function(num, length) {
        for (var i = 0; i < length; i += 1) {
          _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
        }
      };

      _this.getLengthInBits = function() {
        return _length;
      };

      _this.putBit = function(bit) {

        var bufIndex = Math.floor(_length / 8);
        if (_buffer.length <= bufIndex) {
          _buffer.push(0);
        }

        if (bit) {
          _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
        }

        _length += 1;
      };

      return _this;
    };

    //---------------------------------------------------------------------
    // qr8BitByte
    //---------------------------------------------------------------------

    var qr8BitByte = function(data) {

      var _mode = QRMode.MODE_8BIT_BYTE;
      var _data = data;
      var _bytes = qrcode.stringToBytes(data);

      var _this = {};

      _this.getMode = function() {
        return _mode;
      };

      _this.getLength = function(buffer) {
        return _bytes.length;
      };

      _this.write = function(buffer) {
        for (var i = 0; i < _bytes.length; i += 1) {
          buffer.put(_bytes[i], 8);
        }
      };

      return _this;
    };

    return qrcode;
  }();

  // QR de un texto en un canvas de unos px de lado (blanco, con el margen de 4 módulos que piden los lectores).
  // Módulos de un número entero de píxeles para que salgan nítidos
  function qrCanvas(text, px) {
    var q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    var n = q.getModuleCount(), cell = Math.max(2, Math.round(px / (n + 8))), size = (n + 8) * cell;
    var cv = el('canvas', 'qr');
    cv.width = cv.height = size;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + 4) * cell, (r + 4) * cell, cell, cell);
    }
    return cv;
  }

  // ---------------------------------------------------------------- pantalla: inicio

  function clockText(d) { return d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }
  // un solo temporizador para todos los relojes (cabeceras y reproductor)
  var clockTick = Date.now();
  function tickClocks() {
    clockTick = Date.now();
    var t = clockText(new Date());
    Array.prototype.forEach.call(document.querySelectorAll('.clock'), function (c) { if (c.textContent !== t) c.textContent = t; });
  }
  setInterval(tickClocks, 10000);
  // en la tele el reloj se ha visto parado sin poder reproducirlo: al volver a la app o al pulsar una tecla se pone al día
  // y, si el temporizador llevaba más de un minuto sin saltar, queda en el registro
  function clockCheck(why) {
    var gap = Date.now() - clockTick;
    if (gap > 60000 && !document.hidden) logEv('reloj', 'temporizador parado ' + Math.round(gap / 1000) + ' s', { al: why });
    tickClocks();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) clockCheck('volver a la app'); });
  document.addEventListener('keydown', function () { if (Date.now() - clockTick > 15000) clockCheck('tecla'); }, true);

  var TABS = [['home', 'Inicio'], ['anime', 'Anime'], ['movies', 'Películas'], ['series', 'Series'], ['search', 'Buscar'], ['settings', 'Ajustes']];
  function header(active) {
    var h = el('div', 'header');
    h.appendChild(el('div', 'logo', 'StremTV'));
    TABS.forEach(function (t) {
      var tab = el('div', 'tab' + (t[0] === active ? ' active' : ''), tr(t[1]));
      focusable(tab, function () { if (t[0] !== active) openTab(t[0]); });
      h.appendChild(tab);
    });
    h.appendChild(el('div', 'clock', clockText(new Date())));
    return h;
  }
  // cada pestaña se abre sobre Inicio (Atrás siempre vuelve a Inicio); al volver a Inicio, el foco en su pestaña,
  // no en la que se pulsó para salir de ella
  function openTab(k) {
    while (stack.length > 1) {
      if (stack.length === 2) stack[0].lastFocus = stack[0].el.querySelector('.tab.active');
      pop();
    }
    if (k === 'home') return;
    if (k === 'search') push(searchScreen());
    else if (k === 'anime' || k === 'series' || k === 'movies') push(catalogScreen(k));
    else if (k === 'settings') openSettings();
  }
  function activeTab(root) { return function () { return root.querySelector('.tab.active'); }; }

  // ---------------------------------------------------------------- cabecera grande (inicio y anime)

  function metahubImg(kind, imdb) { return 'https://images.metahub.space/' + kind + '/medium/' + imdb + '/img'; }
  // fondo reducido a 960 px: en la tele, pintar uno de 1920×1080 cuesta el doble (medido: ~200 ms frente a ~100 ms por cambio)
  function smallBg(url) { return 'https://wsrv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//, '')) + '&w=960&output=jpg&q=80'; }

  // datos completos de una carátula para la cabecera: los del catálogo o, si faltan (filas de Trakt), los de Cinemeta/Kitsu;
  // con TMDB, título y sinopsis en español. Se guardan en memoria mientras dure la sesión
  var heroCache = {}, heroCount = 0;
  // fondo y logo deducidos del id de IMDb si el catálogo no los trae
  function withImages(d, imdb) {
    if (!d.background && imdb) d.background = metahubImg('background', imdb);
    if (!d.logo && imdb) d.logo = metahubImg('logo', imdb);
    return d;
  }
  // lo que ya se sabe de la carátula sin pedir nada (los catálogos de Cinemeta traen casi todo)
  function heroQuick(m) {
    return withImages(extend({}, m), imdbOfMeta(m));
  }
  var logoState = {}; // url → 'ok' | 'no'
  // pone el logo en «box» (que ya lleva el nombre en un <span> oculto); sin logo, o si a los 1,2 s de la primera
  // llamada aún no ha cargado, el nombre en texto. Una vez decidido, esa caja ya no cambia: volver a llamar con ella
  // (al llegar la ficha completa) solo sirve mientras no se ha decidido. Con «later», no tener logo aún no decide nada:
  // puede llegar en la siguiente llamada. Un logo que carga tarde sí se queda guardado, y la próxima vez sale el logo
  function titleLogo(box, url, logoCls, textCls, later) {
    if (box._done) return;
    var settle = function (img) {
      if (box._done) return;
      box._done = true;
      box.className = img ? logoCls : textCls;
      if (img) box.insertBefore(img, box.firstChild);
    };
    if (!box._timer) { box.className = logoCls; box._timer = setTimeout(function () { settle(null); }, 1200); }
    if (!url || logoState[url] === 'no') { if (!later) settle(null); return; }
    var img = new Image();
    if (logoState[url] === 'ok') { img.src = url; settle(img); return; }
    img.onload = function () { logoState[url] = 'ok'; settle(img); };
    img.onerror = function () { logoState[url] = 'no'; if (!later) settle(null); };
    img.src = url;
  }

  function heroInfo(m) {
    var id = String(m.id || ''), kitsu = id.indexOf('kitsu:') === 0;
    var imdb = imdbOfMeta(m);
    var key = (m.type || '') + ':' + id;
    if (heroCache[key]) return heroCache[key];
    if (++heroCount > 300) { heroCache = {}; heroCount = 1; }
    var full = m.description && m.background ? Promise.resolve(extend({}, m)) : !(imdb || kitsu) ? Promise.resolve(extend({}, m))
      : getJSON(kitsu ? ANIME + '/meta/anime/' + id + '.json' : CINEMETA + '/meta/' + (m.type === 'movie' ? 'movie' : 'series') + '/' + imdb + '.json')
        .then(function (r) { var d = extend(extend({}, m), r.meta || {}); d.name = m.name || d.name; return d; }, function () { return extend({}, m); });
    return (heroCache[key] = full.then(function (d) {
      imdb = imdb || d.imdb_id || null;
      withImages(d, imdb);
      if (!tmdbOn() || !imdb) return d;
      return withTimeout(tmdbDetail(imdb), 3000).then(function (es) {
        if (es && es.overview) d.description = es.overview;
        if (es && es.genres.length) d.genres = es.genres;
        return d;
      }, function () { return d; });
    }));
  }

  function makeHero(root) {
    var hero = el('div', 'hero');
    var layers = [el('div', 'hero-bg'), el('div', 'hero-bg')];
    hero.appendChild(layers[0]);
    hero.appendChild(layers[1]);
    hero.appendChild(el('div', 'hero-shade'));
    var info = el('div', 'hero-info');
    hero.appendChild(info);
    root.insertBefore(hero, root.firstChild);
    root.classList.add('with-hero');
    var front = 0, shownBg = '', bg = null, timer = null, title = null;

    function bgOff() { layers[0].classList.remove('on'); layers[1].classList.remove('on'); }
    // el fondo nuevo sustituye al anterior en cuanto se ha descargado, salvo si se sigue pulsando: entonces espera
    // a que el foco lleve 0,3 s quieto (sin fundido: en la tele, repintar esa zona durante el fundido atasca la navegación);
    // si la versión reducida falla o tarda más de 2,5 s, la original; si también falla, las de altBg
    function setBg(url) {
      if (url === shownBg) return;
      shownBg = url;
      bg = null;
      if (!url) { bgOff(); return; }
      bgNext(bg = { tries: [smallBg(url), url] });
    }
    // otro fondo para la misma carátula (el de la ficha completa), por si el que se está probando no existe
    function altBg(url) {
      var cur = bg;
      if (!cur || !url || url === shownBg || cur.done) return;
      cur.tries.push(smallBg(url), url);
      if (!cur.busy) bgNext(cur);
    }
    function bgNext(cur) {
      var src = cur.tries.shift();
      if (!src) { cur.busy = false; bgOff(); return; }
      cur.busy = true;
      var img = new Image(), loaded = false, over = false;
      var fail = function () { if (over || loaded || bg !== cur) return; over = true; bgNext(cur); };
      var slow = src.indexOf('https://wsrv.nl/') === 0 ? setTimeout(fail, 2500) : null;
      var apply = function () {
        if (over || bg !== cur) return;
        var wait = Nav.lastAt + 300 - Date.now();
        if (wait > 0) { setTimeout(apply, wait); return; }
        over = cur.done = true;
        front = 1 - front;
        layers[front].style.backgroundImage = 'url("' + src + '")';
        layers[front].classList.add('on');
        layers[1 - front].classList.remove('on');
      };
      img.onload = function () { clearTimeout(slow); loaded = true; apply(); };
      img.onerror = function () { clearTimeout(slow); fail(); };
      img.src = src;
    }

    // título: el logo si lo hay; mientras se sabe, el hueco queda vacío (sin saltar de texto a logo).
    // Sin logo, o si tarda más de 1,2 s, el nombre en texto. Se decide una vez por carátula: al repintar con la ficha
    // completa se reutiliza la misma caja, y el logo de la ficha solo cuenta si aún no se había decidido.
    // «fresh»: carátula nueva; «later»: aún puede llegar un logo con la ficha completa
    function paint(d, fresh, later) {
      var box = el('div');
      if (fresh) {
        title = el('div', 'hero-logo');
        title.appendChild(el('span'));
      }
      title.lastChild.innerHTML = esc(d.name);
      titleLogo(title, d.logo, 'hero-logo', 'hero-title', later);
      box.appendChild(title);
      var parts = [];
      if (d.imdbRating && parseFloat(d.imdbRating)) parts.push('<span class="star">★ ' + esc(num(d.imdbRating)) + '</span>');
      if (d.releaseInfo || d.year) parts.push('<span>' + esc(d.releaseInfo || d.year) + '</span>');
      if (d.runtime) parts.push('<span>' + esc(d.runtime) + '</span>');
      var g = d.genres || d.genre;
      if (g && g.length) parts.push('<span>' + esc(g.slice(0, 3).join(', ')) + '</span>');
      box.appendChild(el('div', 'hero-meta', parts.join('')));
      box.appendChild(el('div', 'hero-desc', esc(d.description || '')));
      info.innerHTML = '';
      info.appendChild(box);
    }

    var api = {
      cur: null,
      // espera un momento por si el foco sigue moviéndose; el logo (si lo hay) sustituye al título cuando ya ha cargado
      // tras un instante quieto: lo que trae el catálogo y la descarga del fondo a la vez; la sinopsis completa
      // (o en español) sustituye al texto cuando llega, sin esperar por ella para lo demás
      show: function (m) {
        if (m === api.cur) return;
        api.cur = m;
        clearTimeout(timer);
        timer = setTimeout(function () {
          var q = heroQuick(m), sig = function (d) {
            return [d.name, d.description, d.releaseInfo, d.year, d.runtime, d.imdbRating, String(d.genres || d.genre || ''), d.logo].join('|');
          };
          paint(q, true, true);
          // sin fondo en el catálogo se deja el anterior hasta saber si la ficha completa trae uno
          if (q.background) setBg(q.background);
          heroInfo(m).then(function (d) {
            if (api.cur !== m) return;
            if (sig(d) !== sig(q)) paint(d);
            else titleLogo(title, d.logo, 'hero-logo', 'hero-title');
            if (!q.background) setBg(d.background || '');
            else if (d.background !== q.background) altBg(d.background);
          });
        }, 200);
      }
    };
    root._hero = api;
    return api;
  }

  // mientras no se haya enfocado ninguna carátula, la cabecera muestra la primera
  function primeHero(node) {
    var root = closestClass(node, 'screen');
    if (!root || !root._hero || root._hero.cur) return;
    var cards = root.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) if (cards[i]._meta) { root._hero.show(cards[i]._meta); return; }
  }

  // pantalla con cabecera grande: pestañas arriba, fondo y datos detrás y las filas en la mitad de abajo
  function heroScreen(active) {
    var root = el('div', 'screen');
    makeHero(root);
    root.appendChild(header(active));
    var vs = el('div', 'vscroll');
    vs.setAttribute('data-pad', '60');
    root.appendChild(vs);
    return { root: root, vs: vs };
  }

  // filas de Inicio, Series y Películas que se pueden ordenar u ocultar (Ajustes → General → Filas de …). Las de los addons van
  // detrás, con la clave «addon:url|tipo|id»: las de películas en Películas, las de series en Series, las de anime en Anime
  // y las demás en Inicio.
  // settings.homeRows / animeRows / moviesRows / seriesRows: { order: [claves], hidden: { clave: true | false } }; sin dato, oculta si «off»
  // (u «offIfTrakt» con Trakt vinculado); las de plataforma, con Mis plataformas elegidas, ocultas si no es una de ellas.
  // trakt: solo con Trakt vinculado; local: solo sin él; tmdb: solo con clave de TMDB; traktKey: con el Client ID de Trakt
  // (aunque la cuenta no esté vinculada); max: cuántas carátulas como mucho (40 si no se dice); season: sin dato, visible
  // solo en diciembre y enero
  var PAGE_ROWS = {
    home: [
      { k: 'cont', name: 'Continuar viendo' },
      { k: 'wrapped', name: 'Tu año en StremTV', season: true }, // recuadro que abre el resumen del año
      { k: 'mylist', name: 'Mi lista', local: true }, // sin Trakt (con Trakt, su lista va en dos filas)
      { k: 'traktCont', name: 'Continuar (Trakt)', trakt: true },
      { k: 'upnext', name: 'Siguientes episodios', trakt: true },
      { k: 'week', name: 'Esta semana en tus series', trakt: true },
      // películas y series recién llegadas a las plataformas de Ajustes → General → Mis plataformas (sin elegir, un aviso)
      { k: 'novedades', name: 'Novedades en tus plataformas', tmdb: true },
      { k: 'wlMovies', name: 'Mi lista: películas', trakt: true },
      { k: 'wlSeries', name: 'Mi lista: series', trakt: true },
      { k: 'history', name: 'Visto recientemente' },
      // lo de Series y Películas; en Inicio, solo si no hay Trakt (si no, saldría casi vacío)
      { k: 'popMovies', name: 'Películas populares', url: CINEMETA + '/catalog/movie/top.json', offIfTrakt: true },
      { k: 'popSeries', name: 'Series populares', url: CINEMETA + '/catalog/series/top.json', offIfTrakt: true }
    ],
    series: [
      { k: 'forYou', name: 'Para ti', trakt: true },
      { k: 'trending', name: 'Tendencia esta semana', tmdb: true },
      { k: 'novedades', name: 'Novedades en tus plataformas', tmdb: true }, // solo con Mis plataformas
      { k: 'airing', name: 'En emisión', tmdb: true },
      { k: 'pop', name: 'Populares', url: CINEMETA + '/catalog/series/top.json' },
      { k: 'new', name: 'Estrenos', tmdb: true },
      { k: 'top', name: 'Mejor valoradas', url: CINEMETA + '/catalog/series/imdbRating.json' },
      // listas famosas y premios (más abajo, «listas famosas y premios»)
      { k: 'imdbTop', name: 'IMDb Top 250 series', top: 'imdb-top-rated-tv-shows', traktKey: true, max: 250 },
      { k: 'emmy', name: 'Emmy', award: 'emmy' },
      { k: 'globes', name: 'Globos de Oro', award: 'globesTv', off: true }
    ],
    // el anime va en su pestaña: Películas y Series no lo muestran
    anime: [
      { k: 'forYou', name: 'Para ti', trakt: true },
      { k: 'trending', name: 'Tendencia esta semana', url: ANIME + '/catalog/anime/kitsu-anime-trending.json' },
      { k: 'airing', name: 'En emisión', url: ANIME + '/catalog/anime/kitsu-anime-airing.json' },
      { k: 'pop', name: 'Populares', url: ANIME + '/catalog/anime/kitsu-anime-popular.json' },
      { k: 'new', name: 'Estrenos', tmdb: true },
      { k: 'top', name: 'Mejor valorados', url: ANIME + '/catalog/anime/kitsu-anime-rating.json' }
    ],
    movies: [
      { k: 'forYou', name: 'Para ti', trakt: true },
      { k: 'trending', name: 'Tendencia esta semana', tmdb: true },
      { k: 'novedades', name: 'Novedades en tus plataformas', tmdb: true }, // solo con Mis plataformas
      { k: 'new', name: 'Estrenos en digital', tmdb: true },
      { k: 'cinema', name: 'En cines', tmdb: true },
      { k: 'pop', name: 'Populares', url: CINEMETA + '/catalog/movie/top.json' },
      { k: 'top', name: 'Mejor valoradas', url: CINEMETA + '/catalog/movie/imdbRating.json' },
      { k: 'imdbTop', name: 'IMDb Top 250', top: 'imdb-top-rated-movies', traktKey: true, max: 250 },
      { k: 'oscar', name: 'Óscar', award: 'oscar' },
      { k: 'goya', name: 'Goya', award: 'goya' },
      { k: 'globes', name: 'Globos de Oro', award: 'globes', off: true },
      { k: 'palme', name: 'Palma de Oro (Cannes)', wins: 'Q179808', off: true },
      { k: 'oscarWins', name: 'Ganadoras del Óscar', wins: 'Q102427', season: 'oscar', off: true }
    ]
  };
  // una fila por plataforma en Series y Películas; con Mis plataformas elegidas, de serie solo se ven las suyas
  PLATFORMS.forEach(function (pl) {
    ['movies', 'series', 'anime'].forEach(function (page) {
      if (pl.anime && page !== 'anime') return; // Crunchyroll, solo en Anime
      var off = page === 'anime' ? !pl.anime && pl.k !== 'netflix' && pl.k !== 'prime' : pl.off;
      PAGE_ROWS[page].push({ k: 'prov:' + pl.k, name: 'En {0}', arg: pl.name, tmdb: true, off: off, platform: pl });
    });
  });
  var ROWS_SETTING = { home: 'homeRows', anime: 'animeRows', movies: 'moviesRows', series: 'seriesRows' };
  var PAGE_NAMES = { home: 'Inicio', anime: 'Anime', movies: 'Películas', series: 'Series' };

  // las filas que tocan ahora en una pestaña (de cada addon, como mucho 4) en el orden elegido; las nuevas, al final
  function pageRows(page) {
    var linked = Trakt.linked(), tmdb = !!settings.tmdbKey, perAddon = {}, mine = myPlatformKeys();
    var all = PAGE_ROWS[page].filter(function (r) { return !(r.trakt && !linked) && !(r.local && linked) && !(r.tmdb && !tmdb) && !(r.traktKey && !trakt.clientId); })
      .map(function (r) { return extend({ title: tr(r.name, r.arg) }, r); });
    addonCatalogs(false).forEach(function (c) {
      var t = c.catalog.type, to = t === 'movie' ? 'movies' : t === 'series' ? 'series' : t === 'anime' ? 'anime' : 'home';
      if (to !== page) return;
      var n = perAddon[c.addon.url] = (perAddon[c.addon.url] || 0) + 1;
      if (n <= 4) all.push({ k: 'addon:' + c.addon.url + '|' + t + '|' + c.catalog.id, title: c.title, catalog: c });
    });
    var pref = settings[ROWS_SETTING[page]] || {}, order = pref.order || [], hidden = pref.hidden || {};
    return all.map(function (r, i) {
      var p = order.indexOf(r.k);
      var def = r.platform && mine.length ? mine.indexOf(r.platform.k) < 0 : !!(r.off || (r.offIfTrakt && linked) || (r.season && !wrappedSeason()));
      r.hidden = hidden[r.k] === undefined ? def : !!hidden[r.k];
      return { r: r, p: p < 0 ? 1000 + i : p };
    }).sort(function (a, b) { return a.p - b.p; }).map(function (x) { return x.r; });
  }
  function homeRows() { return pageRows('home'); }
  function rowsKey(rows) { return rows.map(function (r) { return r.k + (r.hidden ? '-' : '+'); }).join(','); }

  function homeScreen() {
    var hs = heroScreen('home'), root = hs.root, vs = hs.vs;
    var warnWrap = el('div'), slots = {}, rowsSig = '', first = true;
    var screen = { el: root };
    // cada fila tiene su hueco en el orden elegido; una fila oculta no tiene hueco y no se pide
    function slot(k) { return slots[k] || null; }

    function renderWarnings() {
      warnWrap.innerHTML = '';
      var noSources = !hasSources();
      if (noSources || !settings.key) {
        var warn = el('div', 'row');
        var b = el('div', 'btn primary', noSources ? tr('Añade un addon de fuentes en Ajustes → Fuentes y debrid para poder reproducir')
          : tr('Configura tu Real-Debrid o AllDebrid para poder reproducir'));
        b.style.marginLeft = '80px';
        focusable(b, function () { openSettings('sources'); });
        warn.appendChild(b);
        warnWrap.appendChild(warn);
      }
      if (CERT_EXPIRES - Date.now() < 30 * 86400000) {
        var cw = el('div', 'row');
        cw.appendChild(el('div', 'note cert-warn', esc(tr('⚠ El certificado de StremTV caduca el {0}. Si deja de abrirse, hay que volver a firmarla e instalarla desde el Mac.', fmtDate(CERT_EXPIRES)))));
        warnWrap.appendChild(cw);
      }
    }

    function renderLocal() {
      var cw = slot('cont'), cont = continueList();
      if (cw) cw.innerHTML = '';
      if (cw && cont.length) {
        var contRow;
        cw.appendChild(contRow = posterRow(tr('Continuar viendo'), cont.map(function (p) {
          return { id: p.metaId, type: p.type, name: p.name, poster: p.poster };
        }), function (m, i) {
          var p = cont[i];
          if (p.type === 'movie') resumeMovie(p);
          else push(detailScreen(p.type, p.metaId));
        }, cont.map(function (p) { return { pct: p.t / p.d, label: p.label || p.name }; })));
        // la fila sale ya (es local); el número de pendientes de cada serie llega después con Trakt
        if (Trakt.linked()) Trakt.withPending(cont.map(function (p) { return { id: p.metaId, type: p.type }; })).then(function (ms) {
          var cards = contRow.querySelectorAll('.card');
          ms.forEach(function (m, i) { if (m.left && cards[i]) cards[i].firstChild.appendChild(leftBadge(m.left)); });
        });
      }
      var lw = slot('mylist'), mine = myListMetas();
      if (lw) lw.innerHTML = '';
      if (lw && mine.length) lw.appendChild(posterRow(tr('Mi lista'), mine, openMeta));
    }

    var traktLoaded = 0;
    function renderTrakt() {
      if (!Trakt.linked()) { traktLoaded = 0; return; }
      if (Date.now() - traktLoaded < 120000) return; // como mucho cada 2 minutos
      traktLoaded = Date.now();
      ['traktCont', 'upnext', 'week', 'wlMovies', 'wlSeries'].forEach(function (k) { if (slots[k]) slots[k].innerHTML = ''; });
      var local = {};
      if (slot('cont')) continueList().forEach(function (p) { local[p.metaId] = true; });
      // cada fila se da como función: si falla por la red, se vuelve a pedir sola al volver (las que comparten datos, con shared)
      var paused = shared(function () {
        return Trakt.playback().then(function (items) {
          var seen = {};
          return Trakt.withPending(items.filter(function (m) {
            if (local[m.id] || seen[m.id]) return false; // ya está en «Continuar viendo»
            seen[m.id] = true;
            return true;
          }));
        });
      });
      if (slot('traktCont')) promiseRow(slot('traktCont'), tr('Continuar (Trakt)'), paused, openMeta, true);
      // series con el siguiente episodio pendiente (sin repetir las que ya salen arriba)
      if (slot('upnext')) promiseRow(slot('upnext'), tr('Siguientes episodios'), function () {
        return Promise.all([Trakt.upNext(), slot('traktCont') ? paused().catch(function () { return []; }) : []]).then(function (r) {
          var above = {};
          r[1].forEach(function (m) { above[m.id] = true; });
          return r[0].filter(function (m) { return !local[m.id] && !above[m.id]; });
        });
      }, openMeta, true, 100);
      if (slot('week')) promiseRow(slot('week'), tr('Esta semana en tus series'), function () { return Trakt.calendar(); }, openMeta, true, 40,
        { label: tr('Calendario completo ›'), onPick: function () { push(calendarScreen()); } });
      var wl = shared(function () { return Trakt.loadWatchlist(); });
      var wlOf = function (type) { return function () { return wl().then(function (m) { return m.filter(function (x) { return x.type === type; }); }); }; };
      if (slot('wlMovies')) promiseRow(slot('wlMovies'), tr('Mi lista: películas'), wlOf('movie'), openMeta, true, 100);
      if (slot('wlSeries')) promiseRow(slot('wlSeries'), tr('Mi lista: series'), function () { return wlOf('series')().then(Trakt.withPending); }, openMeta, true, 100);
    }

    // lo último visto: de Trakt si está vinculado (incluye otros dispositivos) o, si no, de esta tele
    var histLoaded = 0;
    function renderHistory() {
      var hw = slot('history');
      if (!hw || (Trakt.linked() && Date.now() - histLoaded < 120000)) return;
      histLoaded = Date.now();
      hw.innerHTML = '';
      promiseRow(hw, tr('Visto recientemente'), function () { return Trakt.linked() ? Trakt.history().then(Trakt.withPending) : Promise.resolve(localHistory()); }, openMeta, true, 30);
    }
    function localHistory() {
      var seen = {};
      return Object.keys(progress).map(function (k) { return progress[k]; }).filter(function (p) { return p.done; })
        .sort(function (a, b) { return b.ts - a.ts; }).filter(function (p) {
          if (seen[p.metaId]) return false;
          seen[p.metaId] = true;
          return true;
        }).map(function (p) { return { id: p.metaId, type: p.type, name: p.name, poster: p.poster, label: dayLabel(new Date(p.ts)) + ' · ' + (p.label || p.name) }; });
    }

    // novedades en tus plataformas: sin plataformas elegidas, un botón que lleva a elegirlas
    function renderNovedades(w, title) {
      w.innerHTML = '';
      if (myPlatformKeys().length) {
        promiseRow(w, title, function () {
          return Promise.all([novedades(['movie', 'tv']), seenReady()]).then(function (x) { return filterSeen(x[0]); });
        }, openMeta, true);
        return;
      }
      var row = el('div', 'row');
      row.appendChild(el('div', 'row-title', esc(title)));
      var b = el('div', 'btn', tr('Elige tus plataformas (Netflix, Prime Video…) para ver aquí lo que acaba de llegar'));
      b.style.marginLeft = '80px';
      focusable(b, function () { openSettings('general'); push(platformsScreen()); });
      row.appendChild(b);
      w.appendChild(row);
    }

    // catálogos generales y de los addons (si el catálogo viene vacío o el addon falla, la fila desaparece)
    function loadCatalogs(rows) {
      rows.forEach(function (r) {
        var w = slot(r.k);
        if (!w) return;
        if (r.k === 'novedades') renderNovedades(w, r.title);
        else if (r.url) asyncRow(w, r.title, r.url, openMeta);
        else if (r.catalog) {
          var c = r.catalog;
          promiseRow(w, r.title, function () {
            return Promise.all([getJSON(c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '.json'), seenReady()]).then(function (res) {
              return filterSeen(res[0].metas || []);
            });
          }, openMeta, true);
        }
      });
    }

    function layout(rows) {
      rowsSig = rowsKey(rows) + myPlatformKeys().join();
      vs.innerHTML = '';
      scrollTop0(vs);
      slots = {};
      vs.appendChild(warnWrap);
      rows.forEach(function (r) {
        if (r.hidden) return;
        slots[r.k] = el('div');
        vs.appendChild(slots[r.k]);
      });
      renderWarnings();
      if (slot('wrapped')) yearTile(slot('wrapped'));
      renderLocal();
      traktLoaded = histLoaded = 0;
      renderTrakt();
      renderHistory();
      // al arrancar con Trakt vinculado, sus filas van primero: los catálogos esperan 1,5 s
      // para no competir con ellas por la red y el procesador de la tele
      if (first && Trakt.linked()) setTimeout(function () { if (rowsSig === rowsKey(rows) + myPlatformKeys().join()) loadCatalogs(rows); }, 1500);
      else loadCatalogs(rows);
      first = false;
    }
    layout(homeRows());

    screen.onShow = function () { primeHero(vs); };
    screen.onResume = function () {
      var rows = homeRows();
      // filas cambiadas en Ajustes (orden, ocultas, Trakt vinculado, addons nuevos o Mis plataformas): rehacer Inicio
      if (rowsKey(rows) + myPlatformKeys().join() !== rowsSig) {
        layout(rows);
        screen.lastFocus = null;
        if (root._hero) root._hero.cur = null;
        primeHero(vs);
        return;
      }
      renderWarnings(); renderLocal(); renderTrakt(); renderHistory();
      if (slots.wrapped && slots.wrapped._paint) slots.wrapped._paint(); // lo recién calculado en su pantalla
      // si se acaba de poner la clave de TMDB, traducir las tarjetas que ya se ven
      Array.prototype.forEach.call(root.querySelectorAll('.card'), function (c) { if (c._loaded || !c._img) nameCard(c); });
    };
    return screen;
  }

  function resumeMovie(p) {
    // pasar por el detalle permite elegir otra fuente si la guardada caducó
    push(detailScreen('movie', p.metaId));
  }

  // ---------------------------------------------------------------- listas famosas y premios (Películas y Series)

  // Se ponen al día solas cada año, sin tocar el código:
  // - Premios de la última edición (Óscar, Globos de Oro, Goya, Emmy): la página de la edición en la Wikipedia en inglés
  //   («98th Academy Awards»). Todas usan la misma plantilla: en la casilla de cada categoría (con el enlace al artículo de la
  //   categoría) va la ganadora en negrita y debajo las demás nominadas («** …»); antes de la gala, todas las nominadas al mismo
  //   nivel y sin negrita. El número de edición sale del año (98.ª de los Óscar = 2026) y se piden a la vez la del año que viene,
  //   la de este y la del anterior: vale la más reciente que ya tenga nominadas (las del año que viene existen antes de tiempo,
  //   pero vacías). Si un premio se saltara un año, habría que corregir su «first».
  //   Los ids de IMDb (y el título en español) salen de Wikidata. Wikidata sola no vale para las nominadas: le faltan muchas
  //   de los últimos años (en 2026 tenía 3 de las 10 nominadas a mejor película; «Cónclave» no tiene ninguna nominación),
  //   pero las ganadoras sí las tiene bien.
  // - Historial de ganadoras (Palma de Oro, Óscar a mejor película): Wikidata («premio recibido» con su fecha).
  // - IMDb Top 250 (películas y series): la lista pública de Trakt que la copia y la mantiene al día (usuario «justin»), pedida
  //   con el Client ID de Trakt de Ajustes, sin necesidad de vincular la cuenta. IMDb no tiene API abierta, Wikidata no guarda
  //   la lista y «Mejor valoradas» de Cinemeta no es lo mismo. Si Trakt quitara la lista, la fila desaparece sin más.
  // Lo descargado se guarda («lists»): los premios se miran cada día en su temporada (diciembre-marzo; julio-septiembre los Emmy)
  // y cada semana el resto del año; las Top 250, cada semana. Si falla la descarga, vale lo guardado
  var WIKI = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*';
  var SPARQL = 'https://query.wikidata.org/sparql?format=json&query=';
  // page: nombre de la página sin el número; first: año de la primera edición; cats: artículos de las categorías (los que enlaza
  // la casilla); season: meses (0-11) de nominaciones y gala
  var AWARDS = {
    oscar: { page: 'Academy Awards', first: 1929, cats: ['Academy Award for Best Picture'], season: [11, 0, 1, 2] },
    globes: { page: 'Golden Globe Awards', first: 1944, season: [11, 0, 1, 2],
      cats: ['Golden Globe Award for Best Motion Picture – Drama', 'Golden Globe Award for Best Motion Picture – Musical or Comedy'] },
    globesTv: { page: 'Golden Globe Awards', first: 1944, season: [11, 0, 1, 2],
      cats: ['Golden Globe Award for Best Television Series – Drama', 'Golden Globe Award for Best Television Series – Musical or Comedy'] },
    goya: { page: 'Goya Awards', first: 1987, cats: ['Goya Award for Best Film'], season: [11, 0, 1, 2] },
    emmy: { page: 'Primetime Emmy Awards', first: 1949, season: [6, 7, 8],
      cats: ['Primetime Emmy Award for Outstanding Drama Series', 'Primetime Emmy Award for Outstanding Comedy Series'] }
  };
  var lists = load('lists', {}), listPending = {};

  // lo guardado si aún vale; si no, lo pide (una sola vez aunque lo pidan dos filas). Si la descarga falla o viene vacía
  // (la Wikipedia cambió de formato, Trakt quitó la lista), vale lo guardado y se vuelve a probar al día siguiente
  function cachedList(key, maxAge, fetch) {
    var c = lists[key];
    if (c && Date.now() - c.ts < maxAge) return Promise.resolve(c);
    if (!listPending[key]) {
      var keep = function () { c.ts = Date.now() - Math.max(0, maxAge - 86400000); save('lists', lists); return c; };
      listPending[key] = fetch().then(function (d) {
        delete listPending[key];
        if (!d.items.length && c && c.items.length) return keep();
        d.ts = Date.now();
        lists[key] = d;
        save('lists', lists);
        return d;
      }, function (e) {
        delete listPending[key];
        if (!c) throw e;
        return keep();
      });
    }
    return listPending[key];
  }
  // un día en la temporada del premio y una semana el resto del año
  function awardAge(season) { return season && season.indexOf(new Date().getMonth()) >= 0 ? 86400000 : 7 * 86400000; }

  function ordinal(n) {
    var t = n % 100, u = n % 10;
    return n + (t > 10 && t < 14 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
  }

  // nominadas de una categoría en el wikitexto de la página de la edición: [{ t: artículo, n: título, win }] (la ganadora en
  // negrita). La categoría puede salir enlazada antes en el texto: vale la primera vez que lleva una lista debajo
  function awardEntries(wt, cat) {
    var pos = 0;
    for (;;) {
      var a = wt.indexOf('[[' + cat + '|', pos), b = wt.indexOf('[[' + cat + ']]', pos);
      var i = a < 0 ? b : b < 0 ? a : Math.min(a, b);
      if (i < 0) return [];
      pos = i + 2;
      // la lista acaba en la casilla siguiente («|…», «|-», «|}») o en un apartado nuevo
      var lines = wt.slice(i, i + 8000).split('\n'), out = [];
      for (var j = 1; j < lines.length && !/^[|!=]/.test(lines[j]); j++) {
        var m = /^\*+\s*(.*)/.exec(lines[j]), lk = m && /\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/.exec(m[1]);
        if (!lk) continue;
        out.push({ t: lk[1], n: (lk[2] || lk[1].replace(/\s*\([^)]*\)$/, '')).replace(/'{2,}/g, ''), win: m[1].slice(0, lk.index).indexOf("'''") >= 0 });
      }
      if (out.length) return out;
    }
  }

  // la última edición con nominadas: { year (el de la gala), items } con las ganadoras delante
  function awardEdition(a) {
    var y = new Date().getFullYear(), years = [y + 1, y, y - 1];
    var titles = years.map(function (yy) { return ordinal(yy - a.first + 1) + ' ' + a.page; });
    return getJSON(WIKI + '&action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=' + encodeURIComponent(titles.join('|'))).then(function (d) {
      var q = d.query || {}, to = {}, text = {};
      (q.normalized || []).concat(q.redirects || []).forEach(function (r) { to[r.from] = r.to; });
      (q.pages || []).forEach(function (pg) {
        var rv = pg.revisions && pg.revisions[0];
        if (rv) text[pg.title] = rv.slots ? rv.slots.main.content : rv.content;
      });
      for (var i = 0; i < years.length; i++) {
        var t = titles[i];
        for (var n = 0; n < 3 && to[t]; n++) t = to[t];
        var wt = text[t] || '', all = [], seenT = {};
        a.cats.forEach(function (c) { all = all.concat(awardEntries(wt, c)); });
        all = all.filter(function (e) { if (seenT[e.t]) return false; seenT[e.t] = true; return true; });
        if (all.length >= 2) {
          return { year: years[i], items: all.filter(function (e) { return e.win; }).concat(all.filter(function (e) { return !e.win; })) };
        }
      }
      return { year: 0, items: [] };
    });
  }

  // id de IMDb, título en español y año de los artículos de la Wikipedia (su elemento de Wikidata); sin id de IMDb, fuera
  function wikiImdb(items) {
    items = items.slice(0, 50);
    if (!items.length) return Promise.resolve([]);
    return getJSON(WIKI + '&action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=' +
      encodeURIComponent(items.map(function (e) { return e.t; }).join('|'))).then(function (d) {
      var q = d.query || {}, to = {}, qid = {};
      (q.normalized || []).concat(q.redirects || []).forEach(function (r) { to[r.from] = r.to; });
      (q.pages || []).forEach(function (pg) { if (pg.pageprops && pg.pageprops.wikibase_item) qid[pg.title] = pg.pageprops.wikibase_item; });
      items.forEach(function (e) {
        var t = e.t;
        for (var n = 0; n < 3 && to[t]; n++) t = to[t];
        e.q = qid[t];
      });
      var ids = items.filter(function (e) { return e.q; }).map(function (e) { return 'wd:' + e.q; });
      if (!ids.length) return [];
      return getJSON(SPARQL + encodeURIComponent('SELECT ?item (SAMPLE(?i) AS ?imdb) (SAMPLE(?l) AS ?es) (MIN(YEAR(?d)) AS ?y) WHERE { VALUES ?item { ' +
        ids.join(' ') + ' } ?item wdt:P345 ?i . OPTIONAL { ?item rdfs:label ?l FILTER(LANG(?l) = "es") } OPTIONAL { ?item wdt:P577 ?d } } GROUP BY ?item')).then(function (r) {
        var byQ = {};
        ((r.results || {}).bindings || []).forEach(function (b) {
          byQ[b.item.value.replace(/^.*\//, '')] = { id: b.imdb.value, es: b.es ? b.es.value : '', y: b.y ? +b.y.value : 0 };
        });
        return items.filter(function (e) { return byQ[e.q] && /^tt\d+$/.test(byQ[e.q].id); }).map(function (e) {
          var w = byQ[e.q];
          return { id: w.id, n: e.n, es: w.es, y: w.y, win: e.win };
        });
      });
    });
  }

  // las etiquetas de Wikidata a veces llevan la aclaración de la Wikipedia: «Aún estoy aquí (película de 2024)»
  function cleanLabel(s) { return String(s || '').replace(/\s*\((película|serie|serie de televisión|telefilme)[^)]*\)$/, ''); }
  // carátulas de una lista guardada; «badge»: Ganadora o el año del premio
  function listMetas(items, type) {
    var en = settings.lang === 'en';
    return items.map(function (it) {
      return { id: it.id, type: type, name: (!en && cleanLabel(it.es)) || it.n, poster: metahubPoster(it.id), releaseInfo: it.y ? String(it.y) : '',
        badge: it.win ? tr('Ganadora') : it.yr ? String(it.yr) : '' };
    });
  }

  // fila de la última edición de un premio: «Óscar 2026» (la ganadora delante, marcada) o, antes de la gala, «Óscar 2027: nominadas»
  function awardRow(r) {
    var a = AWARDS[r.award];
    return cachedList('award:' + r.award, awardAge(a.season), function () {
      return awardEdition(a).then(function (ed) {
        return wikiImdb(ed.items).then(function (items) { return { year: ed.year, items: items }; });
      });
    }).then(function (d) {
      var metas = listMetas(d.items, r.award === 'emmy' || r.award === 'globesTv' ? 'series' : 'movie');
      var won = d.items.some(function (it) { return it.win; });
      metas.title = d.year ? tr(won ? '{0} {1}' : '{0} {1}: nominadas', tr(r.name), d.year) : tr(r.name);
      return metas;
    });
  }

  // ganadoras de un premio, de la más reciente a la más antigua, con el año en la carátula
  function winsRow(r) {
    return cachedList('wins:' + r.wins, awardAge(r.season && AWARDS[r.season].season), function () {
      return getJSON(SPARQL + encodeURIComponent('SELECT ?item ?imdb ?y ?es ?en WHERE { ?item p:P166 ?st . ?st ps:P166 wd:' + r.wins +
        ' ; pq:P585 ?d . BIND(YEAR(?d) AS ?y) ?item wdt:P345 ?imdb . FILTER(STRSTARTS(?imdb, "tt")) OPTIONAL { ?item rdfs:label ?es FILTER(LANG(?es) = "es") }' +
        ' OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") } } ORDER BY DESC(?y) LIMIT 80')).then(function (res) {
        var seenId = {}, items = [];
        ((res.results || {}).bindings || []).forEach(function (b) {
          var id = b.imdb.value;
          if (seenId[id] || !/^tt\d+$/.test(id)) return;
          seenId[id] = true;
          items.push({ id: id, n: b.en ? b.en.value : id, es: b.es ? b.es.value : '', yr: +b.y.value });
        });
        return { items: items.slice(0, 40) };
      });
    }).then(function (d) { return listMetas(d.items, 'movie'); });
  }

  // IMDb Top 250 de la lista de Trakt (en su orden)
  function topList(slug, k) {
    var kind = k === 'movie' ? 'movies' : 'shows';
    return cachedList('top:' + slug, 7 * 86400000, function () {
      return traktReq('GET', '/users/justin/lists/' + slug + '/items/' + kind, null, false).then(function (list) {
        var items = (list || []).filter(function (o) { var x = o.movie || o.show; return x && x.ids && x.ids.imdb; })
          .sort(function (a, b) { return (a.rank || 0) - (b.rank || 0); }).map(function (o) {
            var x = o.movie || o.show;
            return { id: x.ids.imdb, n: x.title, y: x.year || 0 };
          });
        return { items: items };
      });
    }).then(function (d) { return listMetas(d.items, k === 'movie' ? 'movie' : 'series'); });
  }

  // ---------------------------------------------------------------- pantallas: anime, películas y series

  // ---------------------------------------------------------------- novedades en tus plataformas

  // claves de Ajustes → General → Mis plataformas, en el orden de PLATFORMS (las que ya no existen no cuentan)
  function myPlatformKeys() {
    var sel = settings.myPlatforms || [];
    return PLATFORMS.filter(function (pl) { return sel.indexOf(pl.k) >= 0; }).map(function (pl) { return pl.k; });
  }

  // fecha del último episodio emitido de una serie (TMDB no la da en discover); se guarda 6 horas en memoria
  var tvLastAir = {};
  function tvLastDate(id) {
    var c = tvLastAir[id];
    if (c && Date.now() - c.ts < 6 * 3600000) return Promise.resolve(c.d);
    return tmdbGet('/tv/' + id).then(function (d) {
      var e = d.last_episode_to_air;
      tvLastAir[id] = { d: (e && e.air_date) || d.last_air_date || '', ts: Date.now() };
      return tvLastAir[id].d;
    });
  }

  // lo recién llegado a tus plataformas (kinds: 'movie' y/o 'tv'), lo más nuevo primero, con la plataforma en el nombre.
  // TMDB no sabe cuándo entró un título en una plataforma: se aproxima con las fechas. Películas con algún estreno
  // (en cualquier país y formato) en los últimos 60 días; series con algún episodio emitido en los últimos 30, ordenadas
  // por la fecha de ese episodio (una consulta por serie, como mucho 10 por plataforma). Una consulta por plataforma y tipo:
  // así se sabe en cuál está cada título sin preguntar título a título; si está en varias, salen todas
  function novedades(kinds) {
    var now = Date.now(), today = isoDay(now), err = null, mine = myPlatformKeys(), jobs = [];
    var pls = PLATFORMS.filter(function (pl) { return mine.indexOf(pl.k) >= 0; });
    pls.forEach(function (pl) {
      kinds.forEach(function (k) {
        jobs.push(platformId(k, pl).then(function (id) {
          if (!id) return [];
          var q = k === 'movie'
            ? '/discover/movie?release_date.gte=' + isoDay(now - 60 * 86400000) + '&release_date.lte=' + today + '&sort_by=popularity.desc&vote_count.gte=10'
            : '/discover/tv?air_date.gte=' + isoDay(now - 30 * 86400000) + '&air_date.lte=' + today + '&sort_by=popularity.desc&vote_count.gte=5' + TV_JUNK;
          return tmdbGet(q + platformParams(id)).then(function (d) {
            return (d.results || []).slice(0, k === 'movie' ? 20 : 10).map(function (x) { return { x: x, k: k, pl: pl }; });
          });
        }).then(null, function (e) { err = err || e; return null; }));
      });
    });
    return Promise.all(jobs).then(function (lists) {
      // si no ha respondido ninguna, es un error (la fila se vuelve a pedir sola cuando vuelva la red)
      if (err && lists.every(function (l) { return !l; })) throw err;
      var byKey = {}, all = [];
      lists.forEach(function (l) {
        (l || []).forEach(function (it) {
          var key = it.k + ':' + it.x.id, cur = byKey[key];
          if (cur) { if (cur.names.indexOf(it.pl.name) < 0) cur.names.push(it.pl.name); return; }
          all.push(byKey[key] = { x: it.x, k: it.k, names: [it.pl.name], date: it.x.release_date || it.x.first_air_date || '' });
        });
      });
      var series = all.filter(function (it) { return it.k === 'tv'; });
      return mapLimit(series, 4, function (it) { return tvLastDate(it.x.id); }).then(function (dates) {
        series.forEach(function (it, i) { if (dates[i]) it.date = dates[i]; });
        return all.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).map(function (it) {
          var m = tmdbMeta(it.x, it.k);
          m.label = m.name + ' · ' + it.names.join(', ');
          return m;
        });
      });
    });
  }

  // lo que carga cada fila (función: si falla por la red, la fila se vuelve a pedir sola al volver)
  // anime: animación japonesa (TMDB y Cinemeta) o con el género «anime» de Trakt
  var TMDB_ANIME = '&with_genres=16&with_original_language=ja';
  function pageRowLoader(page, r) {
    var k = page === 'movies' ? 'movie' : 'tv', now = Date.now(), today = isoDay(now), anime = page === 'anime';
    // en Películas y Series, sin anime (para eso está su pestaña)
    var seen = function (list) {
      return Promise.all([list, seenReady()]).then(function (x) {
        var metas = filterSeen(x[0] || []);
        return page === 'home' || anime ? metas : metas.filter(function (m) { return !isAnimeMeta(m); });
      });
    };
    var tmdb = function (path) { return function () { return seen(tmdbList(path, k)); }; };
    if (r.catalog) {
      var c = r.catalog;
      return function () { return seen(getJSON(c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '.json').then(function (d) { return d.metas; })); };
    }
    if (r.url) return function () { return seen(getJSON(r.url).then(function (d) { return d.metas; })); };
    // listas famosas y premios: la Top 250 sin lo visto (si se oculta lo visto); los premios, enteros (✓ en lo visto)
    if (r.top) return function () { return seen(topList(r.top, k)); };
    if (r.award) return function () { return awardRow(r); };
    if (r.wins) return function () { return winsRow(r); };
    if (r.platform) {
      return function () {
        return seen(platformId(k, r.platform).then(function (id) {
          return id ? tmdbList('/discover/' + k + '?sort_by=popularity.desc' + platformParams(id) + (anime ? TMDB_ANIME : k === 'tv' ? TV_JUNK : ''), k) : [];
        }));
      };
    }
    switch (r.k) {
      // recomendaciones de Trakt sin nada visto ni empezado (aunque no se oculte lo visto); en Anime, las de series y
      // películas que son anime, y en Películas y Series, las que no
      case 'forYou': return function () {
        var kinds = anime ? ['shows', 'movies'] : [page === 'movies' ? 'movies' : 'shows'];
        return Promise.all(kinds.map(function (kd) { return Trakt.recommendations(kd); }).concat([seenReady(true)])).then(function (x) {
          var all = [];
          kinds.forEach(function (kd, i) { all = all.concat(x[i]); });
          return all.filter(function (m) { return isUnseen(m) && (anime ? m.anime : !m.anime); });
        });
      };
      case 'trending': return tmdb('/trending/' + k + '/week');
      case 'airing': return tmdb('/discover/tv?air_date.gte=' + isoDay(now - 7 * 86400000) + '&air_date.lte=' + today + '&sort_by=popularity.desc&vote_count.gte=50' + TV_JUNK);
      case 'new':
        if (anime) return tmdb('/discover/tv?first_air_date.gte=' + isoDay(now - 120 * 86400000) + '&first_air_date.lte=' + today + '&sort_by=popularity.desc' + TMDB_ANIME);
        return k === 'tv'
          ? tmdb('/discover/tv?first_air_date.gte=' + isoDay(now - 120 * 86400000) + '&first_air_date.lte=' + today + '&sort_by=popularity.desc&vote_count.gte=10' + TV_JUNK)
          // estrenadas en digital (alquiler, compra o plataforma) en España en los últimos 4 meses
          : tmdb('/discover/movie?region=ES&with_release_type=4%7C5&release_date.gte=' + isoDay(now - 120 * 86400000) + '&release_date.lte=' + today + '&sort_by=popularity.desc&vote_count.gte=10');
      case 'cinema': return tmdb('/movie/now_playing?region=ES');
      case 'novedades': return function () { return seen(novedades([k])); };
    }
    return function () { return Promise.resolve([]); };
  }

  // ---------------------------------------------------------------- sorpréndeme

  // un título para la pestaña elegido a partir de lo que has visto y te gustó («semillas»): las recomendaciones de TMDB de
  // varias de ellas al azar (lo mejor valorado en Trakt y las series terminadas pesan más), sin nada visto ni empezado y con
  // buena nota; si no queda nada, lo mejor valorado de tu género favorito. Sin clave de TMDB, las recomendaciones de Trakt;
  // sin Trakt ni TMDB, uno de «Mejor valoradas/os». Semillas y candidatos se guardan mientras dure la sesión: la segunda
  // pulsación es inmediata y no repite lo que ya ha salido
  var Surprise = { seeds: null, linked: null, recs: {}, pools: {}, backup: {}, trakt: {}, top: {}, picked: [], busy: false };

  // índice elegido al azar con probabilidad proporcional a su peso (-1 si ninguno pesa)
  function pickWeighted(list, weight) {
    var total = 0, ws = list.map(function (x) { var w = Math.max(0, weight(x) || 0); total += w; return w; });
    if (!total) return -1;
    var r = Math.random() * total;
    for (var i = 0; i < ws.length; i++) {
      r -= ws[i];
      if (r < 0 && ws[i] > 0) return i;
    }
    for (i = ws.length - 1; i >= 0; i--) if (ws[i] > 0) return i;
    return -1;
  }

  // semillas: { k: 'movie' | 'tv', tmdb, imdb, w: peso (0 = solo empezada), anime: true | false | undefined (no se sabe) }
  function surpriseSeeds() {
    var linked = Trakt.linked();
    if (Surprise.seeds && Surprise.linked === linked) return Surprise.seeds;
    Surprise.linked = linked;
    var p = Surprise.seeds = (linked ? traktSeeds() : localSeeds()).catch(function (e) { if (Surprise.seeds === p) Surprise.seeds = null; throw e; });
    return p;
  }

  // de Trakt: lo valorado (de 7 para arriba, más cuanto mejor; de 5 para abajo, fuera), las películas vistas, las series
  // (terminada o muchos episodios = gustó) y un extra por lo visto hace poco
  function traktSeeds() {
    var bad = 0, soft = function (p) { return p.catch(function () { bad++; return []; }); };
    return Promise.all([
      soft(Trakt.call('GET', '/sync/ratings?extended=full')),
      soft(Trakt.call('GET', '/sync/watched/movies?extended=full')),
      soft(Trakt.watchedShows()),
      soft(Trakt.call('GET', '/sync/history?limit=60'))
    ]).then(function (r) {
      if (bad === 4) throw new Error('Trakt');
      var seeds = {}, hated = {};
      var keyOf = function (o, k) { return o.ids.tmdb ? k + ':' + o.ids.tmdb : o.ids.imdb; };
      var add = function (o, k, w) {
        if (!o || !o.ids || !(o.ids.tmdb || o.ids.imdb)) return;
        var key = keyOf(o, k);
        var s = seeds[key] || (seeds[key] = { k: k, tmdb: o.ids.tmdb || 0, imdb: o.ids.imdb || '', w: 0 });
        s.w += w;
        if (o.genres) s.anime = !!s.anime || o.genres.indexOf('anime') >= 0;
      };
      (r[0] || []).forEach(function (it) {
        var o = it.movie || it.show, k = it.movie ? 'movie' : 'tv', whole = it.type === 'movie' || it.type === 'show';
        if (!o || !o.ids) return;
        if (whole && it.rating <= 5) { hated[keyOf(o, k)] = true; return; }
        // un episodio o una temporada bien valorados también cuentan algo para su serie
        add(o, k, whole ? (it.rating >= 7 ? it.rating - 4 : 1) : it.rating >= 8 ? 1 : 0);
      });
      (r[1] || []).forEach(function (it) { add(it.movie, 'movie', it.plays > 1 ? 1.5 : 1); });
      (r[2] || []).forEach(function (it) {
        var sh = it.show, n = 0;
        if (!sh) return;
        (it.seasons || []).forEach(function (se) { if (se.number > 0) n += (se.episodes || []).length; });
        // terminada, muchos episodios o solo probada (y quizá dejada)
        add(sh, 'tv', sh.aired_episodes && n >= sh.aired_episodes ? 3 : n >= 5 ? 2 : 0.3);
      });
      var recent = {};
      (r[3] || []).forEach(function (it) {
        var o = it.movie || it.show, k = it.movie ? 'movie' : 'tv';
        if (!o || !o.ids || recent[keyOf(o, k)]) return;
        recent[keyOf(o, k)] = true;
        add(o, k, 1);
      });
      return Object.keys(seeds).filter(function (k) { return !hated[k]; }).map(function (k) { return seeds[k]; })
        .sort(function (a, b) { return b.w - a.w; }).slice(0, 80);
    });
  }

  // sin Trakt: lo visto en esta tele (película terminada o varios episodios de una serie); lo empezado, con peso 0, solo para
  // no recomendarlo. Se traduce a TMDB por su id de IMDb (el anime de Kitsu, a través de ARM)
  function localSeeds() {
    var by = {};
    Object.keys(progress).forEach(function (id) {
      var p = progress[id], b = by[p.metaId] || (by[p.metaId] = { id: String(p.metaId || ''), type: p.type, done: 0 });
      if (p.done) b.done++;
    });
    return mapLimit(Object.keys(by).map(function (k) { return by[k]; }), 4, function (b) {
      var kitsu = /^kitsu:(\d+)/.exec(b.id);
      var imdb = kitsu ? armGet('ids?source=kitsu&id=' + kitsu[1]).then(function (d) { return d && d.imdb; })
        : Promise.resolve(b.id.indexOf('tt') === 0 ? b.id : null);
      return imdb.then(function (im) {
        return im ? tmdbFind(im).then(function (r) {
          if (!r.id) return null;
          return { k: r.k, tmdb: r.id, imdb: im, anime: kitsu ? true : undefined,
            w: !b.done ? 0 : b.type === 'movie' ? 1.5 : b.done >= 5 ? 2.5 : 1 };
        }) : null;
      });
    }).then(function (seeds) { return seeds.filter(Boolean); });
  }

  function seedKey(s) { return s.k + ':' + (s.tmdb || s.imdb); }
  // en Películas, películas; en Series, series; en Anime, lo que sea anime (sin saberlo, no vale para ninguna de las tres
  // salvo que no sea anime seguro)
  function seedFits(page, s) {
    if (page === 'anime') return s.anime === true;
    return s.anime !== true && s.k === (page === 'movies' ? 'movie' : 'tv');
  }

  // recomendaciones de TMDB de una semilla: [{ k, x }]
  function seedRecs(s) {
    var key = seedKey(s);
    if (!Surprise.recs[key]) {
      Surprise.recs[key] = (s.tmdb ? Promise.resolve({ k: s.k, id: s.tmdb }) : tmdbFind(s.imdb)).then(function (r) {
        if (!r || !r.id) return [];
        s.tmdb = r.id; s.k = r.k;
        return tmdbGet('/' + r.k + '/' + r.id + '/recommendations').then(function (d) {
          return (d.results || []).map(function (x) { return { k: r.k, x: x }; });
        });
      }).catch(function () { delete Surprise.recs[key]; return []; });
    }
    return Surprise.recs[key];
  }

  // candidato: recomendado por «n» semillas que suman «score»
  function addCand(pool, k, x, w) {
    if (!x || !x.id || x.adult) return;
    var key = k + ':' + x.id;
    var c = pool.cands[key] || (pool.cands[key] = { key: key, k: k, x: x, meta: tmdbMeta(x, k), n: 0, score: 0 });
    c.n++;
    c.score += w;
  }

  // ni visto ni empezado, que no haya salido ya, de la pestaña (anime solo en Anime) y con buena nota y votos suficientes
  function candFits(page, c, mine) {
    var x = c.x, m = c.meta;
    if (mine[c.key] || Surprise.picked.indexOf(m.id) >= 0) return false;
    if (page === 'anime' ? !m.anime : m.anime || (page === 'movies') !== (c.k === 'movie')) return false;
    if (!(x.vote_average >= 6.8 && x.vote_count >= (m.anime ? 50 : 150))) return false;
    return isUnseen(m);
  }

  // el género que más se repite en lo recomendado (sin «animación», que en Anime ya va aparte)
  function favGenre(pool) {
    var count = {}, best = 0, g = '';
    Object.keys(pool.cands).forEach(function (k) {
      var c = pool.cands[k];
      (c.x.genre_ids || []).forEach(function (id) { if (id !== 16) count[id] = (count[id] || 0) + c.score; });
    });
    Object.keys(count).forEach(function (id) { if (count[id] > best) { best = count[id]; g = id; } });
    return g;
  }

  // de reserva: lo mejor valorado y con muchos votos del género favorito (o de cualquiera, si con él no queda nada)
  function surpriseBackup(page, pool, mine, genre) {
    var k = page === 'movies' ? 'movie' : 'tv', anime = page === 'anime';
    var genres = anime ? '16' + (genre ? ',' + genre : '') : genre;
    var key = page + ':' + genres;
    if (!Surprise.backup[key]) {
      Surprise.backup[key] = tmdbGet('/discover/' + k + '?sort_by=vote_count.desc&vote_average.gte=7&vote_count.gte=' + (anime ? 100 : 300) +
        (genres ? '&with_genres=' + genres : '') + (anime ? '&with_original_language=ja' : k === 'tv' ? TV_JUNK : '') +
        '&page=' + (1 + Math.floor(Math.random() * 3))).then(function (d) {
        (d.results || []).forEach(function (x) { addCand(pool, k, x, 0.5); });
      }).catch(function (e) { delete Surprise.backup[key]; throw e; });
    }
    return Surprise.backup[key].then(function () {
      var list = Object.keys(pool.cands).map(function (c) { return pool.cands[c]; }).filter(function (c) { return candFits(page, c, mine); });
      var i = pickWeighted(list, function (c) { return c.x.vote_average - 6; });
      if (i >= 0) return list[i].meta;
      return genre ? surpriseBackup(page, pool, mine, '') : null;
    });
  }

  function surpriseTmdb(page) {
    var pool = Surprise.pools[page] || (Surprise.pools[page] = { used: {}, cands: {} });
    return surpriseSeeds().catch(function () { return []; }).then(function (seeds) {
      var mine = {};
      seeds.forEach(function (s) { if (s.tmdb) mine[s.k + ':' + s.tmdb] = true; });
      var ok = seeds.filter(function (s) { return s.w > 0 && seedFits(page, s); });
      var fits = function () {
        return Object.keys(pool.cands).map(function (k) { return pool.cands[k]; }).filter(function (c) { return candFits(page, c, mine); });
      };
      // con menos de 5 opciones, las recomendaciones de 3 semillas más (elegidas al azar según su peso), hasta 3 rondas
      var grow = function (round) {
        if (round >= 3 || fits().length >= 5) return Promise.resolve();
        var fresh = ok.filter(function (s) { return !pool.used[seedKey(s)]; }), batch = [];
        while (batch.length < 3 && fresh.length) batch.push(fresh.splice(Math.max(0, pickWeighted(fresh, function (s) { return s.w; })), 1)[0]);
        if (!batch.length) return Promise.resolve();
        batch.forEach(function (s) { pool.used[seedKey(s)] = true; });
        return Promise.all(batch.map(seedRecs)).then(function (lists) {
          lists.forEach(function (l, j) { l.forEach(function (r) { addCand(pool, r.k, r.x, batch[j].w); }); });
          seeds.forEach(function (s) { if (s.tmdb) mine[s.k + ':' + s.tmdb] = true; }); // las traducidas ahora desde IMDb
          return grow(round + 1);
        });
      };
      return grow(0).then(function () {
        var list = fits();
        // pesa la valoración de las semillas que lo recomiendan, cuántas son y su nota
        var i = pickWeighted(list, function (c) { return c.score * (1 + 0.5 * (c.n - 1)) * (c.x.vote_average - 6); });
        return i >= 0 ? list[i].meta : surpriseBackup(page, pool, mine, favGenre(pool));
      });
    });
  }

  // lo empezado o visto en esta tele (por id de la ficha)
  function localMetaIds() {
    var ids = {};
    Object.keys(progress).forEach(function (k) { ids[progress[k].metaId] = true; });
    return ids;
  }

  // sin TMDB: las recomendaciones de Trakt, más probable cuanto más arriba
  function surpriseTrakt(page) {
    var anime = page === 'anime', kinds = anime ? ['shows', 'movies'] : [page === 'movies' ? 'movies' : 'shows'];
    return Promise.all(kinds.map(function (kd) {
      return Surprise.trakt[kd] || (Surprise.trakt[kd] = Trakt.recommendations(kd).catch(function (e) { delete Surprise.trakt[kd]; throw e; }));
    })).then(function (x) {
      var local = localMetaIds(), list = [];
      x.forEach(function (metas) {
        metas.forEach(function (m, i) {
          if (isUnseen(m) && !local[m.id] && (anime ? m.anime : !m.anime) && Surprise.picked.indexOf(m.id) < 0) list.push({ m: m, w: 1 / (1 + i / 10) });
        });
      });
      var i = pickWeighted(list, function (o) { return o.w; });
      return i >= 0 ? list[i].m : null;
    });
  }

  // sin Trakt ni TMDB: uno sin ver de «Mejor valoradas/os» (Cinemeta o Kitsu)
  function surpriseTop(page) {
    var row = PAGE_ROWS[page].filter(function (r) { return r.k === 'top'; })[0];
    if (!Surprise.top[page]) Surprise.top[page] = getJSON(row.url).then(function (d) { return d.metas || []; }).catch(function (e) { delete Surprise.top[page]; throw e; });
    return Surprise.top[page].then(function (metas) {
      var local = localMetaIds();
      var list = metas.filter(function (m) {
        return isUnseen(m) && !local[m.id] && (page === 'anime' || !isAnimeMeta(m)) && Surprise.picked.indexOf(m.id) < 0;
      });
      return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    });
  }

  // elige y abre la ficha; mientras, «Buscando algo para ti…». Con TMDB, sus recomendaciones; si no hay nada, las de Trakt y
  // después «Mejor valoradas/os»
  function surprise(page, screen) {
    if (Surprise.busy) return;
    Surprise.busy = true;
    toast(tr('Buscando algo para ti…'), 20000);
    var tries = [];
    if (settings.tmdbKey) tries.push(surpriseTmdb);
    if (Trakt.linked()) tries.push(surpriseTrakt);
    tries.push(surpriseTop);
    var next = function (i) {
      if (i >= tries.length) return Promise.resolve(null);
      return tries[i](page).catch(function () { return null; }).then(function (m) { return m || next(i + 1); });
    };
    seenReady(true).then(function () { return next(0); }).then(function (m) {
      Surprise.busy = false;
      if (!isTop(screen)) return;
      if (!m) { toast(tr('No he encontrado nada sin ver que recomendarte aquí. Prueba más tarde o en otra pestaña')); return; }
      Surprise.picked.push(m.id);
      if (Surprise.picked.length > 60) Surprise.picked.shift();
      $('#toast').classList.add('hidden');
      openMeta(m);
    }, function () { Surprise.busy = false; });
  }

  // Anime, Películas o Series: cabecera grande y las filas elegidas (Ajustes → General → Filas de …)
  function catalogScreen(page) {
    var hs = heroScreen(page), root = hs.root, vs = hs.vs, sig = '';
    var screen = { el: root, initialFocus: activeTab(root) };
    function layout() {
      var rows = pageRows(page), mine = myPlatformKeys();
      sig = rowsKey(rows) + settings.tmdbKey + mine.join();
      vs.innerHTML = '';
      scrollTop0(vs);
      // «Sorpréndeme», encima de la primera fila; en Series, a su lado, el calendario de tus series (también si en Inicio
      // no sale «Esta semana en tus series»)
      var bar = el('div', 'surprise'), sb = el('div', 'btn small', esc(tr('Sorpréndeme')));
      focusable(sb, function () { surprise(page, screen); });
      bar.appendChild(sb);
      if (page === 'series') {
        var cb = el('div', 'btn small', esc(tr('Calendario de tus series ›')));
        focusable(cb, function () { push(calendarScreen()); });
        bar.appendChild(cb);
      }
      vs.appendChild(bar);
      rows.forEach(function (r) {
        // «Novedades en tus plataformas» solo con plataformas elegidas (el aviso para elegirlas sale en Inicio)
        if (!r.hidden && !(r.k === 'novedades' && !mine.length)) promiseRow(vs, r.title, pageRowLoader(page, r), openMeta, true, r.max);
      });
    }
    layout();
    screen.onShow = function () { primeHero(vs); };
    screen.onResume = function () {
      if (rowsKey(pageRows(page)) + settings.tmdbKey + myPlatformKeys().join() === sig) return;
      layout();
      screen.lastFocus = null;
      if (root._hero) root._hero.cur = null;
    };
    return screen;
  }

  // ---------------------------------------------------------------- pantalla: calendario

  // «Hoy · domingo, 25 de octubre», «Mañana · …», «Ayer · …» o, más allá, «Jueves, 29 de octubre»
  function calDayTitle(d) {
    var rel = dayLabel(d), long;
    try { long = d.toLocaleDateString(settings.lang === 'en' ? 'en-GB' : 'es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { long = fmtDate(d); }
    long = long.charAt(0).toUpperCase() + long.slice(1);
    return rel === tr('Hoy') || rel === tr('Mañana') || rel === tr('Ayer') ? rel + ' · ' + long : long;
  }

  // lo que dice la tarjeta: «Serie · T2:E3 · 21:00» (numeración de Cinemeta y hora de la tele) o «Película · En cines»
  var CAL_KINDS = { cinema: 'En cines', dvd: 'En DVD', digital: 'En digital' };
  function calLabel(m) {
    if (m.kind !== 'ep') return m.name + ' · ' + tr(CAL_KINDS[m.kind]);
    return m.name + ' · ' + tr('T{0}:E{1}', m.cine[0], m.cine[1]) + ' · ' + clockText(m.at);
  }

  // tus series y películas de Trakt día a día, de hace 3 días a 30 días vista: una fila por día (los pasados, atenuados y
  // con ✓ en lo visto) y el foco en hoy o el primer día que viene. Las carátulas se piden según se llega a cada fila
  function calendarScreen() {
    var root = el('div', 'screen cal');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(el('div', 'cal-title', esc(tr('Calendario'))));
    vs.appendChild(el('div', 'cal-sub', esc(tr('Tus series y las películas de tu lista de Trakt, de hace 3 días a 30 días vista'))));
    var screen = { el: root };
    var status = el('div', 'empty', esc(tr('Cargando…')));
    vs.appendChild(status);
    if (!Trakt.linked()) {
      status.textContent = tr('El calendario sale de Trakt: vincúlalo en Ajustes → Cuentas.');
      var b = el('div', 'btn primary', esc(tr('Vincular con Trakt')));
      b.style.marginLeft = '80px';
      focusable(b, function () { openSettings('accounts'); });
      vs.appendChild(b);
      return screen;
    }
    Trakt.fullCalendar().then(alive(screen, function (list) {
      var today = new Date(); today.setHours(0, 0, 0, 0);
      var from = today.getTime() - 3 * 86400000, to = today.getTime() + 31 * 86400000;
      var days = [], byDay = {};
      list.forEach(function (m) {
        var d = new Date(m.at.getTime()); d.setHours(0, 0, 0, 0);
        var t = d.getTime();
        if (t < from || t >= to) return;
        if (!byDay[t]) days.push(byDay[t] = { t: t, d: d, items: [] });
        byDay[t].items.push(m);
      });
      vs.removeChild(status);
      if (!days.length) { vs.appendChild(el('div', 'empty', esc(tr('Nada en tu calendario en estas semanas')))); return; }
      var rows = [], focusRow = -1;
      days.forEach(function (day, r) {
        var past = day.t < today.getTime();
        if (!past && focusRow < 0) focusRow = r;
        var row = el('div', 'row cal-day' + (past ? ' past' : ''));
        row.appendChild(el('div', 'row-title', esc(calDayTitle(day.d))));
        var sc = el('div', 'hscroll');
        sc.style.position = 'relative';
        var cards = [];
        day.items.forEach(function (m, i) {
          var c = card(m, function () { openMeta(m); }, { label: calLabel(m) });
          var p = c.firstChild;
          if (m.seen) p.appendChild(el('div', 'mark', '✓'));
          // estreno de temporada o serie nueva (sus episodios 1, con la numeración de Cinemeta)
          if (m.kind === 'ep' && m.cine[1] === 1) p.appendChild(el('div', 'new', esc(m.cine[0] === 1 ? tr('Serie nueva') : tr('Estreno'))));
          // al llegar a una fila, sus carátulas y las primeras de la siguiente
          c._onfocus = function () { loadImages(cards, i + 9); if (rows[r + 1]) loadImages(rows[r + 1], 8); };
          cards.push(c);
          sc.appendChild(c);
        });
        rows.push(cards);
        row.appendChild(sc);
        vs.appendChild(row);
      });
      if (focusRow < 0) focusRow = rows.length - 1;
      for (var r = Math.max(0, focusRow - 1); r <= focusRow + 1 && r < rows.length; r++) loadImages(rows[r], 8);
      if (Nav.root === root) Nav.setRoot(root, rows[focusRow][0]);
    }), alive(screen, function (e) { status.textContent = tr('No se pudo cargar ({0})', e.message); }));
    return screen;
  }

  // ---------------------------------------------------------------- explorar (en Buscar)

  var GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
    'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'];
  var GENRES_ES = { Action: 'Acción', Adventure: 'Aventura', Animation: 'Animación', Biography: 'Biografía', Comedy: 'Comedia',
    Crime: 'Crimen', Documentary: 'Documental', Drama: 'Drama', Family: 'Familia', Fantasy: 'Fantasía', History: 'Historia',
    Horror: 'Terror', Mystery: 'Misterio', Romance: 'Romance', 'Sci-Fi': 'Ciencia ficción', Sport: 'Deporte', Thriller: 'Suspense',
    War: 'Bélica', Western: 'Western' };

  // géneros de TMDB (en series hay menos: acción y aventura van juntas, igual que ciencia ficción y fantasía)
  var TMDB_GENRES = {
    movie: { Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14,
      History: 36, Horror: 27, Mystery: 9648, Romance: 10749, 'Sci-Fi': 878, Thriller: 53, War: 10752, Western: 37 },
    tv: { Action: 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Mystery: 9648,
      'Sci-Fi': 10765, War: 10768, Western: 37 }
  };
  var GENRES_TV_ES = { Action: 'Acción y aventura', 'Sci-Fi': 'Ciencia ficción y fantasía', War: 'Bélica y política' };
  var GENRES_TV_EN = { Action: 'Action & Adventure', 'Sci-Fi': 'Sci-Fi & Fantasy', War: 'War & Politics' };
  // anime sin clave de TMDB: géneros de Kitsu
  var KITSU_GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Sci-Fi', 'Fantasy', 'Romance', 'Slice of Life', 'Mystery', 'Horror',
    'Psychological', 'Sports', 'Mecha', 'Supernatural', 'School', 'Music'];
  var KITSU_ES = { 'Slice of Life': 'Recuentos de la vida', Psychological: 'Psicológico', Sports: 'Deportes', Mecha: 'Mecha',
    Supernatural: 'Sobrenatural', School: 'Escolar', Music: 'Música' };

  // Buscar sin escribir nada: explorar con filtros. Películas, series y anime por separado (el anime no sale en las otras dos).
  // Con clave de TMDB, todos los filtros (tipo, género, año o década, nota mínima, plataforma, orden y solo sin ver);
  // sin ella, los catálogos de Cinemeta (un año suelto, sin plataforma ni estrenos) y de Kitsu para el anime (sin año)
  function discoverFilters(wrap) {
    var f = extend({ type: 'movie', genre: '', year: '', rating: '', platform: '', sort: 'pop', unseen: false }, load('explore', {}));
    if (f.sort === 'top') f.sort = 'pop'; // filtros guardados por la versión anterior
    if (f.sort === 'imdbRating') f.sort = 'rated';
    if (/^\d{4}$/.test(f.year)) f.year = 'Y' + f.year;
    var filters = el('div'), results = el('div', 'grid');
    wrap.appendChild(filters);
    wrap.appendChild(results);
    var cards = [], page = 0, fetched = 0, loading = false, more = null, emptyPages = 0, gen = 0;
    var tmdb = !!settings.tmdbKey, cur = new Date().getFullYear();

    function opts() {
      var k = f.type === 'movie' ? 'movie' : 'tv', en = settings.lang === 'en', kitsu = !tmdb && f.type === 'anime';
      var genres = kitsu ? KITSU_GENRES : tmdb ? GENRES.filter(function (g) { return TMDB_GENRES[k][g] && !(f.type === 'anime' && g === 'Animation'); }) : GENRES;
      var years = [''];
      if (kitsu) years = null;
      else if (tmdb) {
        years.push('Y' + cur, 'Y' + (cur - 1), 'Y' + (cur - 2));
        for (var d = Math.floor(cur / 10) * 10; d >= 1980; d -= 10) years.push('D' + d);
        years.push('B1980');
      } else for (var y = cur; y >= 1987; y--) years.push('Y' + y);
      return [
        [tr('Tipo'), 'type', ['movie', 'series', 'anime'], function (v) { return v === 'movie' ? tr('Películas') : v === 'series' ? tr('Series') : tr('Anime'); }],
        [tr('Género'), 'genre', [''].concat(genres), function (v) {
          if (!v) return tr('Todos');
          if (kitsu) return en ? v : KITSU_ES[v] || GENRES_ES[v] || v;
          if (tmdb && k === 'tv' && (en ? GENRES_TV_EN : GENRES_TV_ES)[v]) return (en ? GENRES_TV_EN : GENRES_TV_ES)[v];
          return en ? v : GENRES_ES[v] || v;
        }],
        years && [tr('Año'), 'year', years, function (v) {
          if (!v) return tr('Todos');
          var n = +v.slice(1);
          if (v[0] === 'D') return n >= 2000 ? tr('Años {0}', n) : tr('Años {0}', String(n).slice(2));
          if (v[0] === 'B') return tr('Antes de {0}', n);
          return String(n);
        }],
        [tr('Nota mínima'), 'rating', ['', '6', '7', '7.5', '8'], function (v) { return v ? '★ ' + num(v) + '+' : tr('Cualquiera'); }],
        tmdb ? [tr('Plataforma'), 'platform', [''].concat(PLATFORMS.map(function (p) { return p.k; })), function (v) {
          return v ? PLATFORMS.filter(function (p) { return p.k === v; })[0].name : tr('Todas');
        }] : null,
        [tr('Orden'), 'sort', tmdb ? ['pop', 'rated', 'new'] : ['pop', 'rated'], function (v) {
          return v === 'pop' ? tr('Populares') : v === 'rated' ? tr('Mejor valoradas') : tr('Más recientes');
        }],
        [tr('Mostrar'), 'unseen', [false, true], function (v) { return v ? tr('Solo sin ver') : tr('Todo'); }]
      ].filter(Boolean);
    }

    function paint(focusKey) {
      filters.innerHTML = '';
      var target = null, list = opts();
      if (!list.some(function (o) { return o[1] === 'year'; })) f.year = '';
      list.forEach(function (o) {
        var key = o[1];
        if (o[2].indexOf(f[key]) < 0) f[key] = o[2][0]; // ya no vale (otro tipo u otro modo)
        var row = el('div', 'row chips-row');
        row.appendChild(el('div', 'row-title', esc(o[0])));
        var sc = el('div', 'hscroll chips');
        sc.style.position = 'relative';
        o[2].forEach(function (v) {
          var b = el('div', 'btn' + (f[key] === v ? ' primary' : ''), esc(o[3](v)));
          focusable(b, function () {
            if (f[key] === v) return;
            f[key] = v;
            save('explore', f);
            // al cambiar de tipo cambian los géneros: se rehacen los filtros con el foco en el mismo botón
            if (key === 'type') paint(key);
            else {
              Array.prototype.forEach.call(sc.children, function (x) { x.classList.remove('primary'); });
              b.classList.add('primary');
            }
            reload();
          });
          sc.appendChild(b);
          if (f[key] === v) { sc._last = b; if (key === focusKey) target = b; } // al bajar a esta fila, ir a la opción elegida
        });
        row.appendChild(sc);
        filters.appendChild(row);
      });
      save('explore', f);
      if (target) Nav.focus(target);
    }

    // TMDB: una página de /discover con todos los filtros
    function tmdbUrl(n) {
      var k = f.type === 'movie' ? 'movie' : 'tv', field = k === 'movie' ? 'primary_release_date' : 'first_air_date';
      var p = '/discover/' + k + '?include_adult=false&page=' + n, gte = '', lte = '', y = +f.year.slice(1);
      if (f.year[0] === 'Y') { gte = y + '-01-01'; lte = y + '-12-31'; }
      else if (f.year[0] === 'D') { gte = y + '-01-01'; lte = (y + 9) + '-12-31'; }
      else if (f.year[0] === 'B') lte = (y - 1) + '-12-31';
      var votes = f.rating ? 100 : 0;
      if (f.sort === 'rated') { p += '&sort_by=vote_average.desc'; votes = k === 'movie' ? 500 : 200; }
      else if (f.sort === 'new') {
        p += '&sort_by=' + field + '.desc';
        votes = Math.max(votes, 20);
        var today = isoDay(Date.now());
        if (!lte || lte > today) lte = today; // nada aún sin estrenar
      } else p += '&sort_by=popularity.desc';
      if (gte) p += '&' + field + '.gte=' + gte;
      if (lte) p += '&' + field + '.lte=' + lte;
      if (votes) p += '&vote_count.gte=' + votes;
      if (f.rating) p += '&vote_average.gte=' + f.rating;
      // anime: animación japonesa (y el género elegido, a la vez)
      if (f.type === 'anime') p += '&with_original_language=ja&with_genres=16' + (f.genre ? ',' + TMDB_GENRES.tv[f.genre] : '');
      else if (f.genre) p += '&with_genres=' + TMDB_GENRES[k][f.genre];
      if (k === 'tv') p += TV_JUNK;
      if (!f.platform) return Promise.resolve(p);
      return platformId(k, PLATFORMS.filter(function (x) { return x.k === f.platform; })[0]).then(function (id) { return p + platformParams(id || 0); });
    }
    // Cinemeta no combina género y año: con año se pide el catálogo del año y el género se filtra aquí
    function kitsuUrl() {
      var extra = [];
      if (f.genre) extra.push('genre=' + encodeURIComponent(f.genre));
      if (fetched) extra.push('skip=' + fetched);
      return ANIME + '/catalog/anime/kitsu-anime-' + (f.sort === 'rated' ? 'rating' : 'popular') + (extra.length ? '/' + extra.join('&') : '') + '.json';
    }
    function cinemetaUrl() {
      var extra = [], y = f.year.slice(1);
      if (y) extra.push('genre=' + y);
      else if (f.genre) extra.push('genre=' + encodeURIComponent(f.genre));
      if (fetched) extra.push('skip=' + fetched);
      var cat = y ? 'year' : f.sort === 'rated' ? 'imdbRating' : 'top';
      return CINEMETA + '/catalog/' + f.type + '/' + cat + (extra.length ? '/' + extra.join('&') : '') + '.json';
    }
    function fetchPage() {
      if (tmdb) {
        page++;
        return tmdbUrl(page).then(function (u) { return tmdbPage(u, f.type === 'movie' ? 'movie' : 'tv'); });
      }
      return getJSON(f.type === 'anime' ? kitsuUrl() : cinemetaUrl()).then(function (d) {
        var raw = d.metas || [];
        fetched += raw.length;
        var metas = raw;
        if (f.year && f.genre && f.type !== 'anime') metas = metas.filter(function (m) { return (m.genre || m.genres || []).indexOf(f.genre) >= 0; });
        if (f.rating) metas = metas.filter(function (m) { return parseFloat(m.imdbRating) >= +f.rating; });
        if (f.year && f.sort === 'rated') metas.sort(function (a, b) { return (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0); });
        return { metas: metas, more: raw.length >= 20 };
      });
    }

    function reload() {
      results.innerHTML = '';
      cards = []; page = 0; fetched = 0; more = null; emptyPages = 0;
      loading = false;
      gen++; // las respuestas de los filtros anteriores se descartan
      loadPage();
    }

    function loadPage(keepFocus) {
      if (loading) return;
      loading = true;
      var hadFocus = keepFocus === true || (more && Nav.cur === more);
      if (more && more.parentNode) more.parentNode.removeChild(more);
      more = null;
      var status = el('div', 'empty', tr('Cargando…'));
      results.appendChild(status);
      var g = gen, first = cards.length;
      Promise.all([fetchPage(), seenReady(f.unseen)]).then(function (r) {
        if (g !== gen) return; // filtros cambiados mientras cargaba
        loading = false;
        results.removeChild(status);
        var metas = f.unseen ? r[0].metas.filter(isUnseen) : filterSeen(r[0].metas);
        if (f.type !== 'anime') metas = metas.filter(function (m) { return !isAnimeMeta(m); }); // el anime, en su tipo
        metas.forEach(function (m) {
          var i = cards.length;
          var c = card(m, function () { openMeta(m); });
          c._onfocus = function () { loadImages(cards, i + 14); };
          cards.push(c);
          results.appendChild(c);
        });
        loadImages(cards, first + 13);
        // con filtros que quitan mucho puede que una página entera no tenga ninguno: seguir buscando un poco
        if (!metas.length && r[0].more && ++emptyPages < 4) { loadPage(hadFocus); return; }
        if (r[0].more) {
          more = el('div', 'btn', tr('Cargar más'));
          focusable(more, loadPage);
          results.appendChild(more);
        }
        if (!cards.length) results.appendChild(el('div', 'empty', tr('Sin resultados')));
        if (hadFocus && (cards[first] || more)) Nav.focus(cards[first] || more);
      }).catch(function (e) {
        if (g !== gen) return;
        loading = false;
        status.textContent = tr('No se pudo cargar ({0})', e.message);
        // sin red: la misma página otra vez al volver, si no se han cambiado los filtros ni se ha cerrado
        if (e.status === 0) Net.whenBack(function () {
          if (g !== gen || loading || !document.body.contains(status)) return;
          results.removeChild(status);
          if (tmdb) page--;
          loadPage(hadFocus);
        });
      });
    }
    paint();
    loadPage();
  }

  // ---------------------------------------------------------------- pantalla: más como esto

  // recomendaciones de TMDB (en español) o, si no hay, títulos relacionados de Trakt
  function similarTitles(type, imdb) {
    var fromTrakt = function () {
      if (!trakt.clientId) return [];
      return traktReq('GET', '/' + (type === 'movie' ? 'movies' : 'shows') + '/' + imdb + '/related?limit=40', null, false).then(function (list) {
        return (list || []).filter(function (o) { return o.ids && o.ids.imdb; }).map(function (o) {
          return { id: o.ids.imdb, type: type, name: o.title, poster: metahubPoster(o.ids.imdb) };
        });
      });
    };
    if (!tmdbOn()) return Promise.resolve(fromTrakt());
    return tmdbFind(imdb).then(function (r) {
      if (!r.id) return [];
      return tmdbGet('/' + r.k + '/' + r.id + '/recommendations').then(function (d) {
        return (d.results || []).map(function (x) {
          return { id: 'tmdb:' + r.k + ':' + x.id, type: type, name: x.title || x.name, poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '' };
        });
      });
    }).then(function (list) { return list.length ? list : fromTrakt(); }, fromTrakt);
  }

  function similarScreen(type, imdb, name) {
    return gridScreen(tr('Más como «{0}»', name), similarTitles(type, imdb));
  }

  // películas y series de un actor (TMDB), de la más conocida a la menos
  function personScreen(id, name) {
    return gridScreen(name, tmdbGet('/person/' + id + '/combined_credits').then(function (d) {
      var seen = {};
      return (d.cast || []).filter(function (x) {
        var k = x.media_type + x.id;
        if ((x.media_type !== 'movie' && x.media_type !== 'tv') || seen[k]) return false;
        seen[k] = true;
        return true;
      }).sort(function (a, b) { return (b.vote_count || 0) - (a.vote_count || 0); }).slice(0, 60).map(function (x) {
        return { id: 'tmdb:' + x.media_type + ':' + x.id, type: x.media_type === 'movie' ? 'movie' : 'series', name: x.title || x.name,
          poster: x.poster_path ? 'https://image.tmdb.org/t/p/w185' + x.poster_path : '' };
      });
    }));
  }

  function collectionScreen(id, name) {
    return gridScreen(name, tmdbCollection(id), true);
  }

  // keepSeen: sin quitar lo visto aunque esté puesto «ocultar lo visto» (en una saga, las vistas salen con ✓)
  function gridScreen(title, promise, keepSeen) {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(el('div', 'screen-title', esc(title)));
    var grid = el('div', 'grid');
    vs.appendChild(grid);
    var status = el('div', 'empty', tr('Cargando…'));
    grid.appendChild(status);
    Promise.all([promise, seenReady()]).then(function (r) {
      var metas = keepSeen ? r[0].filter(Boolean) : filterSeen(r[0]), cards = [];
      grid.innerHTML = '';
      if (!metas.length) { grid.appendChild(el('div', 'empty', tr('Sin resultados'))); return; }
      metas.forEach(function (m, i) {
        var c = card(m, function () { openMeta(m); });
        c._onfocus = function () { loadImages(cards, i + 14); };
        cards.push(c);
        grid.appendChild(c);
      });
      loadImages(cards, 13);
      if (Nav.root === root) Nav.setRoot(root, cards[0]);
    }).catch(function (e) { status.textContent = tr('No se pudo cargar ({0})', e.message); });
    return { el: root };
  }

  // ---------------------------------------------------------------- buscar desde el móvil

  // Escribir con el mando es lento: Buscar enseña un QR con docs/buscar.html (GitHub Pages de este repo) y, detrás del #,
  // un tema secreto de ntfy.sh (servicio público y gratuito, sin cuenta). Lo que se envía desde el móvil llega por ntfy y
  // se busca en la tele. El # no llega al servidor de la página, así que el tema solo lo saben la tele y el móvil.
  // Solo se escucha mientras Buscar está a la vista; lo enviado antes de abrirla no cuenta
  var PHONE_PAGE = 'https://victorarandab.github.io/stremtv/buscar.html';
  var NTFY = 'https://ntfy.sh';

  // tema de ntfy de esta tele: 24 letras y cifras al azar, creado la primera vez. No va en la copia de seguridad: es
  // de esta tele (otra con la misma copia recibiría también sus búsquedas) y basta con volver a escanear el QR
  function phoneTopic() {
    var t = load('phonetopic', '');
    if (/^[a-z0-9]{24}$/.test(t)) return t;
    var abc = 'abcdefghijklmnopqrstuvwxyz0123456789', rnd = null;
    try { rnd = new Uint8Array(24); window.crypto.getRandomValues(rnd); } catch (e) { rnd = null; }
    t = '';
    for (var i = 0; i < 24; i++) t += abc.charAt((rnd ? rnd[i] : Math.floor(Math.random() * 256)) % abc.length);
    save('phonetopic', t);
    return t;
  }
  function phoneUrl() { return PHONE_PAGE + '#' + phoneTopic(); }

  // Escucha el tema con una conexión que se queda abierta: ntfy manda cada mensaje en una línea JSON en cuanto llega
  // (y un «keepalive» cada 45 s), y onprogress lo va leyendo de responseText (por eso no se usa xhr(), que espera al
  // final). La primera línea («open») trae la hora del servidor: lo anterior a ella no cuenta. Si la conexión se cierra
  // o se queda 2 min callada, se vuelve a abrir pidiendo lo enviado desde el último mensaje (o desde aquella hora),
  // así no se pierde nada entre medias; con errores, cada vez se espera más (hasta 1 min). Una sola petición abierta
  // gasta mucho menos del límite de ntfy para quien no tiene cuenta que preguntar cada pocos segundos.
  // onText(texto) por cada mensaje nuevo; devuelve la función que la para
  function phoneListen(topic, onText) {
    var x = null, stopped = false, t0 = 0, last = '', seen = {}, fails = 0, retry = null, quiet = null;
    function connect() {
      if (stopped) return;
      var since = last || (t0 ? String(t0) : ''), pos = 0;
      var req = x = new XMLHttpRequest();
      req.open('GET', NTFY + '/' + topic + '/json' + (since ? '?since=' + since : ''), true);
      // las líneas completas que hayan llegado desde la última vez
      var read = function () {
        if (req !== x || req.status !== 200) return; // un error (429, 5xx…) también trae JSON: no es un mensaje
        var txt = req.responseText || '', end = txt.lastIndexOf('\n');
        if (end < pos) return;
        var lines = txt.slice(pos, end).split('\n');
        pos = end + 1;
        lines.forEach(function (l) {
          var m = looseJSON(l);
          if (!m) return;
          fails = 0;
          if (m.event === 'open' && !t0) t0 = m.time || 0;
          if (m.event !== 'message' || !m.id || seen[m.id]) return;
          seen[m.id] = true;
          last = m.id;
          if (t0 && m.time < t0) return; // de antes de abrir Buscar
          if (typeof m.message === 'string') onText(m.message);
        });
      };
      var again = function (ms) {
        if (req !== x) return;
        x = null;
        clearTimeout(quiet);
        if (!stopped) retry = setTimeout(connect, ms);
      };
      var awake = function () {
        clearTimeout(quiet);
        quiet = setTimeout(function () { try { req.abort(); } catch (e) { /* ya cerrada */ } again(0); }, 120000);
      };
      req.onprogress = function () { awake(); read(); };
      req.onload = function () {
        read();
        // cerrada por el servidor (o 429 por pasarse del límite): volver a abrirla
        if (req.status === 200) again(2000);
        else again(req.status === 429 ? 60000 : Math.min(60000, 5000 * Math.pow(2, fails++)));
      };
      req.onerror = req.ontimeout = function () { again(Math.min(60000, 5000 * Math.pow(2, fails++))); };
      req.send();
      awake();
    }
    connect();
    return function () {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(quiet);
      var req = x;
      x = null;
      if (req) try { req.abort(); } catch (e) { /* ya cerrada */ }
    };
  }

  // la escucha de la pantalla de Buscar abierta: se para con la app en segundo plano y vuelve al regresar
  var phoneSync = null;
  document.addEventListener('visibilitychange', function () { if (phoneSync) phoneSync(); });

  // ---------------------------------------------------------------- pantalla: búsqueda

  function searchScreen() {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('search'));
    var box = el('div', 'search-box');
    var input = el('input');
    input.type = 'text';
    input.placeholder = tr('Título de película o serie…');
    focusable(input, function () { input.focus(); });
    var lastRun = null, liveTimer = null;
    input._ondone = function (q) {
      clearTimeout(liveTimer);
      remember(q);
      if (trim(q) !== lastRun) run(q);
    };
    // resultados mientras se escribe: a partir de 3 letras, cuando se deja de teclear un momento
    input.addEventListener('input', function () {
      clearTimeout(liveTimer);
      if (!trim(input.value)) { run(''); return; } // borrado: vuelven los filtros
      liveTimer = setTimeout(function () {
        var q = trim(input.value);
        if (q.length >= 3 && q !== lastRun) run(q);
      }, 800);
    });
    box.appendChild(input);
    // arriba: el cuadro, la ayuda y las búsquedas recientes, con el QR para escribir desde el móvil a la derecha
    var topRow = el('div', 'search-top'), main = el('div', 'search-main');
    topRow.appendChild(main);
    main.appendChild(box);
    main.appendChild(el('div', 'hint', tr('Pulsa OK para escribir y confirma con «Hecho».')));
    var recent = el('div');
    main.appendChild(recent);
    var qr = el('div', 'phone-qr');
    try {
      var cv = qrCanvas(phoneUrl(), 300);
      qr.appendChild(cv);
      qr.style.width = cv.width + 'px'; // el texto, del ancho del QR
    } catch (e) { logEv('error', 'QR: ' + e); }
    qr.appendChild(el('div', 'phone-qr-text', esc(tr('Escanea con el móvil para escribir desde él'))));
    topRow.appendChild(qr);
    vs.appendChild(topRow);
    var results = el('div');
    vs.appendChild(results);
    // sin nada escrito, explorar con filtros
    var explore = el('div');
    explore.appendChild(el('div', 'screen-title settings-title', esc(tr('Explorar'))));
    vs.appendChild(explore);
    discoverFilters(explore);

    function trim(q) { return (q || '').replace(/^\s+|\s+$/g, ''); }

    // últimas 12 búsquedas, la más reciente primero
    var recentQs = load('searches', []);
    function remember(q) {
      q = trim(q);
      if (!q) return;
      recentQs = [q].concat(recentQs.filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); })).slice(0, 12);
      save('searches', recentQs);
      paintRecent();
    }
    function paintRecent() {
      recent.innerHTML = '';
      if (!recentQs.length) return;
      var row = el('div', 'row chips-row');
      row.appendChild(el('div', 'row-title', esc(tr('Búsquedas recientes'))));
      var sc = el('div', 'hscroll chips');
      sc.style.position = 'relative';
      recentQs.forEach(function (q) {
        var b = el('div', 'btn', esc(q));
        focusable(b, function () { input.value = q; remember(q); run(q); });
        sc.appendChild(b);
      });
      var clear = el('div', 'btn', esc(tr('Borrar')));
      focusable(clear, function () { recentQs = []; save('searches', recentQs); paintRecent(); Nav.focus(input); });
      sc.appendChild(clear);
      row.appendChild(sc);
      recent.appendChild(row);
    }
    paintRecent();

    // abrir un resultado también guarda la búsqueda (aunque no se pulsara «Hecho»)
    function pick(m) { remember(lastRun); openMeta(m); }

    function run(q) {
      q = trim(q);
      lastRun = q;
      results.innerHTML = '';
      explore.style.display = q ? 'none' : '';
      if (!q) return;
      var enc = encodeURIComponent(q);
      // anime, películas y series por separado (como las pestañas): el anime solo en su fila. Con TMDB, películas y series
      // salen de su búsqueda (en español); el anime, de Kitsu
      var noAnime = function (url) {
        return function () { return Promise.all([getJSON(url), seenReady()]).then(function (r) { return filterSeen(r[0].metas || []).filter(function (m) { return !isAnimeMeta(m); }); }); };
      };
      asyncRow(results, tr('Anime'), ANIME + '/catalog/anime/kitsu-anime-list/search=' + enc + '.json', pick);
      if (tmdbOn()) {
        var multi = shared(function () {
          return Promise.all([tmdbGet('/search/multi?include_adult=false&query=' + enc), seenReady()]).then(function (r) {
            return filterSeen((r[0].results || []).filter(function (x) { return x.media_type === 'movie' || x.media_type === 'tv'; })
              .map(function (x) { return tmdbMeta(x, x.media_type); })).filter(function (m) { return !m.anime; });
          });
        });
        var ofType = function (t) { return function () { return multi().then(function (l) { return l.filter(function (m) { return m.type === t; }); }); }; };
        promiseRow(results, tr('Películas'), ofType('movie'), pick);
        promiseRow(results, tr('Series'), ofType('series'), pick);
      } else {
        promiseRow(results, tr('Películas'), noAnime(CINEMETA + '/catalog/movie/top/search=' + enc + '.json'), pick);
        promiseRow(results, tr('Series'), noAnime(CINEMETA + '/catalog/series/top/search=' + enc + '.json'), pick);
      }
      addonCatalogs(true).forEach(function (c) {
        asyncRow(results, c.title, c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '/search=' + enc + '.json', pick);
      });
    }

    // lo que llega del móvil se escribe en el cuadro y se busca, con el foco en el cuadro (los resultados, arriba)
    function fromPhone(q) {
      q = trim(String(q).replace(/\s+/g, ' ')).slice(0, 200);
      if (!q) return;
      if (document.activeElement === input) input.blur(); // cierra el teclado de la tele si estaba abierto
      clearTimeout(liveTimer);
      input.value = q;
      remember(q);
      run(q);
      if (Nav.root === root) Nav.focus(input);
    }

    // se escucha mientras Buscar se ve: no tapada por otra pantalla, ni cerrada, ni la app en segundo plano
    var screen = { el: root, initialFocus: function () { return input; } }, stopListen = null;
    function sync() {
      var on = !screen.closed && root.style.display !== 'none' && !document.hidden;
      if (on && !stopListen) stopListen = phoneListen(phoneTopic(), fromPhone);
      if (!on && stopListen) { stopListen(); stopListen = null; }
    }
    screen.onShow = screen.onResume = screen.onHide = sync;
    screen.onClose = function () { sync(); if (phoneSync === sync) phoneSync = null; };
    phoneSync = sync;
    return screen;
  }

  // ---------------------------------------------------------------- pantalla: detalle

  // ojo tachado para la miniatura de un episodio sin ver con «Sin spoilers» (trazos de 24×24)
  var NOSPOIL_ICON = '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.6 7-10 7c-2 0-3.7-.7-5.1-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/></svg>';

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

    // películas de la misma saga (TMDB), en orden y con ✓ en las vistas
    function sagaButton(container) {
      var c = meta._tmdb && meta._tmdb.collection;
      if (!c) return;
      var b = el('div', 'btn small', tr('Saga'));
      focusable(b, function () { push(collectionScreen(c.id, c.name)); });
      container.appendChild(b);
    }

    var isAnime = String(id).indexOf('kitsu:') === 0;
    function imdbOf() { return imdbOfMeta(meta); }

    var metaFrom = isAnime ? ANIME + '/meta/anime/' + id + '.json' : CINEMETA + '/meta/' + type + '/' + id + '.json';
    if (!isAnime && String(id).indexOf('tt') !== 0) {
      var own = addonsFor('meta', type, id)[0];
      metaFrom = own ? own.url + '/meta/' + type + '/' + id + '.json' : null;
    }
    function loadMeta() {
      (metaFrom ? getJSON(metaFrom) : Promise.reject(new Error(tr('sin datos')))).then(function (res) {
        meta = res.meta;
        if (!meta) throw new Error(tr('sin datos'));
        if (isAnime) type = meta.type === 'movie' ? 'movie' : 'series';
        // la numeración de Trakt (a la vez que TMDB; guardada en la tele, así que casi siempre está ya)
        var mapping = type === 'series' && !isAnime && Trakt.linked() && imdbOf()
          ? withTimeout(Trakt.epMap(imdbOf(), meta.videos), 2500).then(function (m) { epMap = m || {}; }, function () { /* sin ella: la misma numeración */ })
          : null;
        if (!tmdbOn() || !imdbOf()) return Promise.resolve(mapping).then(render);
        var es = withTimeout(tmdbDetail(imdbOf()), 2500).catch(function () { return null; }); // sin traducción: en inglés
        return Promise.all([mapping, es]).then(function (r) {
          var es = r[1];
          if (es) {
            if (es.name) meta.name = es.name;
            if (es.overview) meta.description = es.overview;
            if (es.genres.length) meta.genres = es.genres;
            meta._tmdb = es;
          }
        }).then(render);
      }).catch(function (e) {
        if (screen.closed) return;
        d.innerHTML = '';
        d.appendChild(el('div', 'loading', esc(tr('No se pudo cargar ({0})', e.message))));
        // sin red: se vuelve a intentar sola cuando vuelva
        if (e.status === 0) Net.whenBack(alive(screen, function () {
          d.innerHTML = '';
          d.appendChild(el('div', 'loading', tr('Cargando…')));
          loadMeta();
        }));
      });
    }
    loadMeta();

    function infoParts() {
      var parts = [];
      if (meta.releaseInfo || meta.year) parts.push(meta.releaseInfo || meta.year);
      if (meta.runtime) parts.push(meta.runtime);
      if (meta.imdbRating && parseFloat(meta.imdbRating)) parts.push('★ ' + num(meta.imdbRating));
      var r = meta._ratings;
      if (r && r.rt >= 0) parts.push('Rotten Tomatoes ' + r.rt + ' %');
      if (r && r.mc >= 0) parts.push('Metacritic ' + r.mc);
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
      var metaLine = el('div', 'meta-line', info());
      d.appendChild(metaLine);
      var prov = meta._tmdb && meta._tmdb.providers;
      if (prov && prov.length) d.appendChild(el('div', 'providers', esc(tr('En España: {0}', prov.slice(0, 5).join(', ')))));
      // notas de Rotten Tomatoes y Metacritic (con clave de OMDb): llegan después y se añaden a la línea
      if (!meta._ratings) omdbRatings(imdbOf()).then(alive(screen, function (r) {
        if (!r) return;
        meta._ratings = r;
        metaLine.innerHTML = info();
      }));
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
      sagaButton(actions);
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
    // y si Trakt numera distinto que Cinemeta (Trakt.epMap), con su numeración
    var epMap = {};
    function traktKey(v) {
      var k = (v.imdbSeason !== undefined ? v.imdbSeason : v.season) + ':' + (v.imdbEpisode !== undefined ? v.imdbEpisode : v.episode);
      return epMap[k] || k;
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
      var tk = traktKey(v).split(':'); // para Trakt (scrobble y visto), con su numeración
      return extend(base(), {
        videoId: v.id, label: meta.name + ' — ' + label, epLabel: label,
        imdb: v.imdb_id || imdbOf(),
        imdbS: v.imdbSeason !== undefined ? v.imdbSeason : v.season,
        imdbE: v.imdbEpisode !== undefined ? v.imdbEpisode : v.episode,
        traktS: tk[0], traktE: tk[1],
        startAt: p && !p.done ? p.t : 0,
        startPct: p ? 0 : resumePct(imdbOf() + ':' + traktKey(v)),
        runtime: parseRuntime(v.runtime) || parseRuntime(meta.runtime),
        // sin spoilers: en el INFO del vídeo, la sinopsis de la serie en vez de la del episodio sin ver
        desc: (!spoilerFree(v) && (v.overview || v.description)) || meta.description || '',
        next: function () { var n = nextEpisode(v); return n ? epCtx(n) : null; }
      });
    }

    // vistos en la tele que Trakt no tiene, de una serie que numera distinto: antes de la 0.23 se le mandaban con la numeración
    // de Cinemeta (Mashle T2:E1 en vez de 1x13) y Trakt los descartaba. Se le mandan con la suya y la fecha en que se vieron
    function sendMissingSeen() {
      var s = seasonsOf(), missing = [];
      s.nums.forEach(function (n) {
        if (n !== 0) s.map[n].forEach(function (v) {
          var p = progress[v.id], ck = (v.imdbSeason !== undefined ? v.imdbSeason : v.season) + ':' + (v.imdbEpisode !== undefined ? v.imdbEpisode : v.episode);
          if (p && p.done && epMap[ck] && !traktSeen[epMap[ck]]) missing.push(v);
        });
      });
      if (!missing.length) return;
      missing.forEach(function (v) { traktSeen[traktKey(v)] = true; });
      if (traktNext && traktSeen[traktNext]) traktNext = null;
      Trakt.markWatched(missing.map(function (v) { return extend(epCtx(v), { at: progress[v.id].ts }); }), true).then(function () {
        logEv('trakt', 'vistos enviados con su numeración', { serie: meta.name, n: missing.length });
      }, function () {
        missing.forEach(function (v) { delete traktSeen[traktKey(v)]; }); // se vuelve a intentar al abrir la ficha otra vez
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

    // «Sin spoilers» (Ajustes → General): de un episodio sin ver no se enseña ni la sinopsis ni la imagen
    function spoilerFree(v) { return settings.noSpoilers && !isSeenEp(v); }

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
        toggle = el('div', 'btn small', showSeen ? tr('Ocultar vistos') : seenCount === 1 ? tr('Mostrar 1 visto') : tr('Mostrar {0} vistos', seenCount));
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
          sendMissingSeen();
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
        var hide = spoilerFree(v);
        // sin spoilers: la imagen ni se pide; en su lugar, el fondo liso con un ojo tachado (un blur sería lento en la tele)
        var th = el('div', 'thumb' + (hide ? ' nospoil' : ''), hide ? NOSPOIL_ICON : '');
        if (seen) th.appendChild(el('div', 'mark', '✓'));
        if (v.thumbnail && !hide) th.style.backgroundImage = 'url("' + v.thumbnail + '")';
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
        if (ov && hide) txt.appendChild(el('div', 'ep-ov nospoil', esc(tr('Sinopsis oculta (sin spoilers)'))));
        else if (ov) txt.appendChild(el('div', 'ep-ov', esc(ov)));
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

  // ---------------------------------------------------------------- pantalla: fuentes

  // Qué formatos dice admitir el reproductor HTML5 de esta tele (se pregunta una vez)
  var Codecs = (function () {
    var v = document.createElement('video');
    function can(t) { try { return v.canPlayType(t) || ''; } catch (e) { return ''; } }
    // con el reproductor nativo (app instalada) MKV, HEVC 10-bit y AC3/EAC3 funcionan aunque HTML5 diga que no
    var nativeAV = false;
    try { nativeAV = !!(window.webapis && webapis.avplay && webapis.avplay.open); } catch (e) { /* fuera de Tizen */ }
    if (nativeAV) {
      return { h264: 'nativo', hevc: 'nativo', hevc10: 'nativo', av1: '', mkv: 'nativo', ac3: 'nativo', eac3: 'nativo',
        dts: can('audio/mp4; codecs="dtsc"') || can('audio/vnd.dts') };
    }
    return {
      h264: can('video/mp4; codecs="avc1.640028"'),
      hevc: can('video/mp4; codecs="hev1.1.6.L120.90"') || can('video/mp4; codecs="hvc1.1.6.L120.90"'),
      hevc10: can('video/mp4; codecs="hvc1.2.4.L153.B0"') || can('video/mp4; codecs="hev1.2.4.L153.B0"'),
      av1: can('video/mp4; codecs="av01.0.05M.08"'),
      mkv: can('video/x-matroska'),
      ac3: can('audio/mp4; codecs="ac-3"'),
      eac3: can('audio/mp4; codecs="ec-3"'),
      dts: can('audio/mp4; codecs="dtsc"') || can('audio/vnd.dts')
    };
  })();

  // Formato a partir del nombre del archivo; risk alto = probable error de descodificación.
  // bad: lo que esta tele no reproduce o no se ve bien (AV1; Dolby Vision sin capa HDR10, que sale con colores
  // morados y verdes; H.264 en 4K, que es nivel 5.1); la razón, para enseñarla
  function mediaInfo(name) {
    var hevc = /x\.?265|h\.?265|hevc/i.test(name);
    var avc = !hevc && /x\.?264|h\.?264|(^|[^a-z0-9])avc([^a-z0-9]|$)/i.test(name);
    var uhd = /2160|4k|uhd/i.test(name);
    var av1 = /(^|[^a-z0-9])av1([^a-z0-9]|$)/i.test(name);
    var dv = /(^|[^a-z0-9])(dv|dovi)([^a-z0-9]|$)|dolby.?vision/i.test(name);
    var tenbit = dv || /10.?bit|hdr/i.test(name);
    var dts = /(^|[^a-z0-9])dts|truehd|true-hd|atmos/i.test(name);
    var eac3 = /ddp|eac3|e-ac-3|dd\+/i.test(name);
    var remux = /remux/i.test(name);
    var risk = 0;
    if (av1) risk += Codecs.av1 ? 1 : 6;
    if (hevc) risk += Codecs.hevc ? 1 : 4;
    if (tenbit) risk += Codecs.hevc10 ? 1 : 3;
    if (dv) risk += 3;
    if (dts) risk += Codecs.dts ? 1 : 4;
    if (eac3 && !Codecs.eac3) risk += 2;
    if (remux) risk += 2;
    var bad = av1 && !Codecs.av1 ? 'AV1' : dv && !/hdr/i.test(name) ? tr('Dolby Vision sin HDR10') : avc && uhd ? tr('H.264 en 4K') : '';
    return { hevc: hevc, av1: av1, dv: dv, tenbit: tenbit, dts: dts, h264: !hevc && !av1, risk: risk, bad: bad };
  }

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
      media: mediaInfo(((s.behaviorHints && s.behaviorHints.filename) || '') + ' ' + title + ' ' + quality),
      es: title.indexOf(FLAG_ES) >= 0 || title.indexOf(FLAG_MX) >= 0 ||
        /(^|[^a-z])(spa|spanish|castellano|espa[nñ]ol|latino|esp)([^a-z]|$)/i.test(title),
      hash: s.infoHash || (/\/([a-f0-9]{40})\//i.exec(s.url || '') || [])[1] || '',
      binge: (s.behaviorHints && s.behaviorHints.bingeGroup) || '',
      group: releaseGroup(((s.behaviorHints && s.behaviorHints.filename) || '') || lines[0]),
      raw: s
    };
  }

  // grupo que firma la release: «…-NTb.mkv» o «[SubsPlease] …» en anime
  function releaseGroup(file) {
    var f = String(file || '').replace(/\.(mkv|mp4|avi|m4v|ts)$/i, '');
    var m = /^\[([^\]]+)\]/.exec(f) || /-([A-Za-z0-9]+)(\[[^\]]*\])?$/.exec(f);
    return m ? m[1].toLowerCase() : '';
  }

  // fuente (y pista de audio) elegida en cada serie, para usar la misma en los demás episodios
  var srcPrefs = load('srcprefs', {});
  function saveSrcPref(metaId, data) {
    if (!metaId) return;
    srcPrefs[metaId] = extend(srcPrefs[metaId] || {}, data);
    srcPrefs[metaId].ts = Date.now();
    capByTs(srcPrefs, 100);
    save('srcprefs', srcPrefs);
  }
  // 4 = mismo torrent (pack de temporada), 2 = mismo bingeGroup del addon, 1 = mismo grupo
  function prefScore(s, pref) {
    if (!pref) return 0;
    return (pref.hash && s.hash === pref.hash ? 4 : 0) + (pref.binge && s.binge === pref.binge ? 2 : 0) +
      (pref.group && s.group === pref.group ? 1 : 0);
  }

  // grupo de calidad de una fuente: 4K, 1080p, 720p, SD u «Otras»
  function qualityGroup(q) {
    if (/2160|4k|uhd/i.test(q)) return '4K';
    if (/1080/.test(q)) return '1080p';
    if (/720/.test(q)) return '720p';
    if (/480|576|360|sd\b|dvd/i.test(q)) return 'SD';
    return '';
  }

  // respuestas de los addons de fuentes, 5 min: la ficha las pide en segundo plano (prefetchStreams) para que
  // «▶ Ver» no tenga que esperar; si la pantalla de fuentes llega antes de que respondan, comparte la petición
  var streamCache = {};
  function streamJSON(url) {
    var now = Date.now();
    for (var k in streamCache) if (now - streamCache[k].ts > 300000) delete streamCache[k];
    if (streamCache[url]) return streamCache[url].p;
    var p = getJSON(url);
    streamCache[url] = { p: p, ts: now };
    p.catch(function () { if (streamCache[url] && streamCache[url].p === p) delete streamCache[url]; });
    return p;
  }
  function streamURLs(type, videoId) {
    var dAddon = debridAddon();
    var urls = addonsFor('stream', type, videoId).filter(function (a) { return a !== dAddon; }).map(function (a) {
      return a.url + '/stream/' + type + '/' + videoId + '.json';
    });
    if (dAddon) urls.unshift(sourcesBase(dAddon) + '/stream/' + type + '/' + videoId + '.json');
    return urls;
  }
  function prefetchStreams(type, videoId) {
    if (!videoId) return;
    streamURLs(type, videoId).forEach(function (u) { streamJSON(u).catch(function () { /* ya se verá al abrir las fuentes */ }); });
  }

  function streamsScreen(ctx) {
    var root = el('div', 'screen');
    root.appendChild(el('div', 'screen-title', esc(ctx.label)));
    var sub = el('div', 'screen-sub', tr('Buscando fuentes…'));
    root.appendChild(sub);
    var list = el('div', 'list vscroll');
    list.setAttribute('data-pad', '0');
    root.appendChild(list);
    var screen = { el: root, streamsOf: ctx.videoId, ctx: ctx };

    function message(text, withSettings) {
      if (screen.closed) return; // cerrada mientras buscaba (antes del push aún no está en la pila, pero sí viva)
      list.innerHTML = '';
      list.appendChild(el('div', 'loading', esc(text)));
      if (withSettings) {
        var b = el('div', 'btn primary', tr('Abrir ajustes'));
        focusable(b, function () { openSettings('sources'); });
        list.appendChild(b);
      }
      if (isTop(screen)) Nav.setRoot(root);
    }

    function fetchStreams() {
      sub.textContent = tr('Buscando fuentes…');
      var dAddon = debridAddon();
      var others = addonsFor('stream', ctx.type, ctx.videoId).filter(function (a) { return a !== dAddon; });
      if (!dAddon && !others.length) {
        sub.textContent = '';
        message(tr('No tienes ningún addon de fuentes. Añádelo en Ajustes → Fuentes y debrid pegando la URL de su manifest.'), true);
        return;
      }
      var fromAddons = Promise.all(others.map(function (a) {
        return streamJSON(a.url + '/stream/' + ctx.type + '/' + ctx.videoId + '.json').then(function (d) {
          return (d.streams || []).map(function (x) { var st = parseStream(x); st.addon = a.manifest.name; return st; })
            .filter(function (st) { return st.url && !st.error; });
        }).catch(function () { return []; }); // un addon caído no estropea el resto
      }));
      var fromDebrid = dAddon ? streamJSON(sourcesBase(dAddon) + '/stream/' + ctx.type + '/' + ctx.videoId + '.json').catch(function (e) { return { failed: e }; })
        : Promise.resolve({ streams: [] });
      Promise.all([fromDebrid, fromAddons]).then(function (r) {
        if (screen.closed) return; // Atrás antes de que respondan los addons: ni pintar ni reproducir
        var d = r[0], extra = [].concat.apply([], r[1]);
        if (d.failed && !extra.length) throw d.failed;
        var streams = (d.streams || []).map(parseStream);
        if (streams.length === 1 && streams[0].error && !extra.length) {
          sub.textContent = '';
          return message(tr('La clave de {0} no es válida o ha caducado.', DEBRID_NAMES[settings.debrid]) + ' ' +
            (streams[0].raw.title || ''), true);
        }
        if (!settings.key && !extra.length && !streams.some(function (x) { return x.url && !x.error; })) {
          sub.textContent = tr('{0} torrents encontrados', streams.length);
          return message(tr('Sin un servicio debrid configurado la tele no puede reproducir torrents. Añade tu clave de Real-Debrid o AllDebrid en Ajustes.'), true);
        }
        streams = streams.filter(function (s) { return s.url && !s.error; }).concat(extra);
        // tasa estimada (Mb/s) = tamaño / duración; las que no caben en la conexión van al final
        var limit = rateLimit();
        streams.forEach(function (x) {
          var gb = parseSizeGB(x.stats);
          x.mbps = gb && ctx.runtime ? Math.round(gb * 8192 / (ctx.runtime * 60) * 10) / 10 : 0;
          x.heavy = !!(limit && x.mbps && x.mbps > limit);
        });
        // orden: primero lo que la tele puede reproducir y cabe en la conexión, después español, después el del addon
        var tier = function (x) { return (x.media.bad ? 10 : 0) + (x.heavy ? 3 : 0) + (!settings.compatFirst ? 0 : x.media.risk <= 1 ? 0 : x.media.risk <= 3 ? 1 : 2); };
        // en series, antes que nada la misma release que se vio en el episodio anterior
        var pref = ctx.type === 'series' ? srcPrefs[ctx.metaId] : null;
        streams.forEach(function (x) { x.pref = prefScore(x, pref); });
        streams = streams.map(function (s, i) { s._i = i; return s; }).sort(function (a, b) {
          return (b.pref - a.pref) || (tier(a) - tier(b)) || (settings.preferEs ? b.es - a.es : 0) || (a._i - b._i);
        });
        if (!streams.length) {
          sub.textContent = '';
          return message(settings.onlyCached
            ? tr('No hay fuentes en caché para este título. Puedes desactivar «Solo en caché» en Ajustes para ver más.')
            : tr('No se han encontrado fuentes.'), settings.onlyCached);
        }
        sub.textContent = tr(streams.length === 1 ? '1 fuente · {0}' : '{1} fuentes · {0}', DEBRID_NAMES[settings.debrid], streams.length) +
          (limit ? tr(' · tu conexión: hasta ~{0} Mb/s', limit) : '');
        list.innerHTML = '';
        // las que esta tele no reproduce bien van aparte al final, plegadas, y nunca se eligen solas; si solo hay de esas, se ven todas
        var bad = [];
        if (streams.some(function (x) { return !x.media.bad; })) {
          bad = streams.filter(function (x) { return x.media.bad; });
          streams = streams.filter(function (x) { return !x.media.bad; });
        }
        // la recomendada (la que elige «▶ Ver»): la misma release que antes en esta serie o, si no, la primera instantánea que quepa
        var rec = null;
        for (var i = 0; i < streams.length && !rec; i++) if (streams[i].pref >= 2 || (streams[i].cached && !streams[i].heavy)) rec = streams[i];
        rec = rec || streams[0];
        // agrupadas por calidad sin perder el orden: cada grupo sale donde aparece su mejor fuente
        var groups = [], byQ = {};
        streams.forEach(function (s) {
          var g = qualityGroup(s.quality);
          if (!byQ[g]) { byQ[g] = []; groups.push(g); }
          byQ[g].push(s);
        });
        var ordered = [], grouped = groups.length > 1;
        var allCached = streams.every(function (x) { return x.cached; });
        if (allCached) sub.textContent += tr(' · todas instantáneas');
        groups.forEach(function (g) {
          if (grouped) ordered.push({ head: g || tr('Otras'), n: byQ[g].length });
          ordered = ordered.concat(byQ[g]);
        });
        function makeRow(s) {
          var row = el('div', 'stream' + (s === rec ? ' rec' : ''));
          var g = qualityGroup(s.quality), q = s.quality.replace(/4k/i, '4K');
          // agrupadas, la calidad ya está en el título del grupo: solo se repite si dice algo más («4K DV»)
          if (!grouped) row.appendChild(el('div', 'q', '<span class="' + (g === '4K' ? 'q4k' : g === '1080p' ? 'q1080' : g === '720p' ? 'q720' : '') + '">' + esc(q) + '</span>'));
          var info = el('div', 'info');
          var badges = grouped && (q !== g || s.media.bad) && q ? '<span class="badge">' + esc(q) + '</span>' : '';
          if (s === rec) badges += '<span class="badge rec">' + tr('★ Recomendada') + '</span>';
          if (s.pref >= 2) badges += '<span class="badge ok">' + tr('↺ Como el anterior') + '</span>';
          if (s.addon) badges += '<span class="badge addon">' + esc(s.addon) + '</span>';
          // si todas son instantáneas lo dice el subtítulo y la marca sobra
          if (s.cached && !allCached) badges += '<span class="badge ok">' + tr('⚡ Instantáneo') + '</span>';
          else if (s.download) badges += '<span class="badge">' + tr('Descargar en debrid') + '</span>';
          if (s.es) badges += '<span class="badge es">ES</span>';
          var m = s.media;
          // en las que no se ven bien, en vez del formato, por qué
          if (m.bad) badges += '<span class="badge warn">' + esc(tr('✕ {0}', m.bad)) + '</span>';
          else {
            if (m.av1) badges += '<span class="badge warn">AV1</span>';
            else if (m.hevc) badges += '<span class="badge' + (Codecs.hevc ? '' : ' warn') + '">HEVC</span>';
            else badges += '<span class="badge ok">H.264</span>';
            if (m.dv) badges += '<span class="badge warn">Dolby Vision</span>';
            else if (m.tenbit) badges += '<span class="badge' + (Codecs.hevc10 ? '' : ' warn') + '">10-bit/HDR</span>';
          }
          if (m.dts) badges += '<span class="badge' + (Codecs.dts ? '' : ' warn') + '">DTS/TrueHD</span>';
          if (s.mbps) badges += '<span class="badge' + (s.heavy ? ' warn' : '') + '">~' + num(s.mbps) + ' Mb/s' + (s.heavy ? tr(' · pesada') : '') + '</span>';
          info.appendChild(el('div', 't1', badges + '<span class="fname">' + esc(s.file) + '</span>'));
          info.appendChild(el('div', 't2', esc(s.stats + '   ' + s.langs)));
          row.appendChild(info);
          focusable(row, function () { Player.open(s, ctx, row); });
          s._row = row;
          row._stream = s;
          return row;
        }
        ordered.forEach(function (s) {
          if (s.head) { list.appendChild(el('div', 'sgroup', esc(s.head) + ' · ' + (s.n === 1 ? tr('1 fuente') : tr('{0} fuentes', s.n)))); return; }
          list.appendChild(makeRow(s));
        });
        if (bad.length) {
          var fold = el('div', 'sgroup bad', esc(tr(bad.length === 1 ? '⚠ 1 fuente que esta tele no puede reproducir bien · OK para verla'
            : '⚠ {0} fuentes que esta tele no puede reproducir bien · OK para verlas', bad.length)));
          focusable(fold, function () {
            fold.classList.remove('f', 'focused');
            fold.textContent = tr('⚠ No se ven bien en esta tele') + ' · ' + (bad.length === 1 ? tr('1 fuente') : tr('{0} fuentes', bad.length));
            bad.forEach(function (s) { list.appendChild(makeRow(s)); });
            Nav.setRoot(root, bad[0]._row);
          });
          list.appendChild(fold);
        }
        // reproducción directa: la recomendada
        var auto = ctx.autoPlay ? { s: rec, row: rec._row } : null;
        if (auto && isTop(screen)) {
          sub.textContent += tr(' · elegida automáticamente: pulsa OK en otra para cambiar');
          Nav.setRoot(root, auto.row);
          ctx.autoPlay = false; // al volver a esta lista no arrancar otra vez
          Player.open(auto.s, ctx, auto.row);
          return;
        }
        if (isTop(screen)) Nav.setRoot(root, streams[0]._row);
      }).catch(function (e) {
        logEv('fuentes', e.message, { id: ctx.videoId });
        sub.textContent = '';
        message(tr('No se pudieron obtener las fuentes ({0}). Pulsa Atrás e inténtalo de nuevo.', e.message));
        // sin red: se vuelven a buscar solas cuando vuelva
        if (e.status === 0) Net.whenBack(alive(screen, function () {
          message(tr('Cargando…'));
          fetchStreams();
        }));
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

  // desfase de subtítulos recordado por vídeo (los 300 más recientes)
  var subOffsets = load('suboffsets', {});
  function saveSubOffset(videoId, offset) {
    if (!videoId) return;
    if (Math.abs(offset) < 0.01) delete subOffsets[videoId];
    else subOffsets[videoId] = { o: Math.round(offset * 100) / 100, ts: Date.now() };
    capByTs(subOffsets, 300);
    save('suboffsets', subOffsets);
  }

  var Subs = {
    cues: [], idx: 0, offset: 0, list: [], current: null, embedded: false, auto: false, manual: false,
    box: null,
    reset: function () {
      this.cues = []; this.idx = 0; this.offset = 0; this.list = []; this.current = null; this.embedded = false; this.auto = false; this.manual = false;
      this.box.textContent = '';
      this.box.className = (settings.subSize === 'big' ? 'big' : '') + (settings.subBg ? ' bg' : '') +
        (settings.subColor === 'yellow' ? ' yellow' : '') + (settings.subPos === 'high' ? ' high' : '');
    },
    fetchList: function (ctx) {
      var self = this, mine = Player.session;
      if (!ctx.imdb) { self.list = []; return Promise.resolve([]); }
      var sid = ctx.type === 'movie' ? ctx.imdb : ctx.imdb + ':' + ctx.imdbS + ':' + ctx.imdbE;
      var sources = [{ url: SUBS_ADDON, name: '' }].concat(addonsFor('subtitles', ctx.type, sid).map(function (a) { return { url: a.url, name: a.manifest.name }; }));
      return Promise.all(sources.map(function (src) {
        return getJSON(src.url + '/subtitles/' + ctx.type + '/' + sid + '.json').then(function (d) {
          return (d.subtitles || []).map(function (x) { return extend(extend({}, x), { lang: langKey(x.lang), addon: src.name }); });
        }).catch(function () { return []; });
      })).then(function (r) {
        // el idioma de Ajustes primero, después español e inglés
        var rank = function (l) { return l === settings.subLang ? 0 : l === 'spa' ? 1 : l === 'eng' ? 2 : 3; };
        if (Player.session !== mine) return []; // llegó tarde: el reproductor se ha cerrado o se ha vuelto a abrir
        self.list = [].concat.apply([], r).filter(function (x) { return rank(x.lang) < 3; })
          .sort(function (a, b) { return rank(a.lang) - rank(b.lang); }).slice(0, 40);
        return self.list;
      });
    },
    select: function (s) {
      var self = this;
      this.current = s;
      this.cues = []; this.idx = 0; this.box.textContent = '';
      if (!s) return Promise.resolve();
      return getText(s.url).then(function (txt) {
        if (self.current !== s) return;
        self.cues = parseSubs(txt);
        if (!self.cues.length) toast(tr('El subtítulo está vacío o no se puede leer'));
      }).catch(function () { toast(tr('No se pudo descargar el subtítulo')); });
    },
    // el texto va en un <span> para que el fondo se ajuste a cada línea
    show: function (text) { this.box.innerHTML = text ? '<span>' + esc(text) + '</span>' : ''; },
    update: function (t) {
      if (this.embedded || !this.cues.length) return;
      t -= this.offset;
      var c = this.cues, i = this.idx;
      if (i >= c.length || c[i].s > t) i = 0; // retroceso: volver a buscar desde el principio
      while (i < c.length - 1 && c[i].e < t) i++;
      this.idx = i;
      var cue = c[i];
      var text = cue && cue.s <= t && cue.e >= t ? cue.t : '';
      if (this.box.textContent !== text) this.show(text);
    }
  };

  // intro aprendida por serie (las 100 más recientes): donde el usuario saltó hacia delante al principio de un episodio.
  // En las series sin AniSkip se ofrece «saltar intro» en ese tramo, pero solo cuando dos episodios distintos
  // coinciden (n >= 2): un salto suelto o una serie con la intro en sitios distintos no deben dar avisos falsos
  var introSkips = load('introskips', {});
  function learnedIntro(ctx) {
    var L = ctx && ctx.type === 'series' && introSkips[ctx.metaId];
    return L && L.n >= 2 ? [{ type: 'op', s: Math.max(0, L.s - 5), e: L.e, learned: true }] : [];
  }

  // ---------------------------------------------------------------- reproductor

  var Player = {
    backend: null, ctx: null, stream: null, session: 0, // session: sube al abrir y al cerrar
    duration: 0, time: 0, paused: false, buffering: false,
    seekTarget: null, seekTimer: null, seekStep: 0, lastSeekKey: 0,
    osdTimer: null, tickTimer: null, saveTimer: null, startAt: 0, started: false,

    hasAV: function () {
      try { return !!(window.webapis && webapis.avplay && webapis.avplay.open); } catch (e) { return false; }
    },

    open: function (stream, ctx, row) {
      var self = this;
      if (this.stream) this.close(); // por si aún sigue abierto otro vídeo: AVPlay no admite dos a la vez
      this.ctx = ctx; this.stream = stream; this.row = row || null;
      var session = ++this.session;
      this.duration = 0; this.time = 0; this.paused = false; this.started = false; this.lastPaused = null;
      this.finalUrl = null; this.probeText = ''; this.probeId = 0;
      this.startAt = ctx.startAt || 0;
      this.startPct = this.startAt ? 0 : ctx.startPct || 0;
      this.seekTarget = null;
      this.upNext = null; this.upNextOff = false; this.nextCtx = undefined; this.audioKey = ''; this.audioRetried = false; this.audioChosen = false;
      this.skips = []; this.skipNow = null; this.showSkip(false); // que no se quede el del vídeo anterior
      this.stalls = { n: 0, ms: 0, at: [] }; this.stallStart = 0; this.lastSeekAt = 0; this.stallOffer = null; this.stallOffered = false;
      // el temporizador solo sigue al pasar solo al siguiente episodio, no en otro vídeo abierto después
      if (!ctx.continued) Player.sleep = null;
      logEv('reproducir', ctx.label, { archivo: stream.file, calidad: stream.quality, addon: stream.addon, cache: stream.cached, desde: Math.round(this.startAt) || (ctx.startPct ? ctx.startPct + '%' : 0) });
      this.skips = learnedIntro(ctx);
      skipTimes(ctx).then(function (list) {
        if (self.ctx !== ctx) return;
        // AniSkip manda; lo aprendido solo cubre la intro si AniSkip no la conoce
        var op = list.filter(function (x) { return x.type === 'op'; }).length;
        self.skips = op ? list : list.concat(learnedIntro(ctx));
      });
      $('#player').classList.remove('hidden');
      this.osdParts();
      $('#osd-title').textContent = ctx.epLabel ? ctx.name : ctx.label;
      $('#osd-sub').textContent = ctx.epLabel || '';
      $('#osd-sub').classList.toggle('hidden', !ctx.epLabel);
      this.closeInfo();
      Subs.box = $('#subs');
      Subs.reset();
      this.syncMode = false;
      Subs.offset = subOffsets[ctx.videoId] ? subOffsets[ctx.videoId].o : 0;
      this.spinner(true, tr('Conectando con {0}…', DEBRID_NAMES[settings.debrid]));
      var sep = '<span class="sep"></span>';
      $('#osd-help').innerHTML = '<span class="key">OK</span>' + esc(tr('pausa')) + sep + '<span class="key">◀</span><span class="key">▶</span>' + esc(tr('avanzar/retroceder')) + sep + '<span class="key">0-9</span>' + esc(tr('ir al %')) + sep +
        '<span class="key">▲</span>' + esc(tr('subtítulos')) + sep + '<span class="key">▼</span>' + esc(tr('audio, fuente y temporizador')) + sep +
        '<span class="key">INFO</span>' + esc(tr('información')) + sep + '<span class="key">↩</span>' + esc(tr('salir'));
      this.showOSD();
      this.screen = {
        el: el('div'),
        onKey: function (code) { return self.onKey(code); },
        onClose: function () { self.close(); }
      };
      push(this.screen);
      try {
        if (window.webapis && webapis.appcommon) webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
      } catch (e) { /* sin control del salvapantallas */ }

      // el addon de fuentes redirige a un vídeo de aviso cuando el debrid falla: comprobarlo antes de reproducir
      this.resolve(stream.url).then(function (finalUrl) {
        if (self.stream !== stream) return;
        self.finalUrl = finalUrl;
        if (self.hasAV()) self.openAV(finalUrl); else self.openHTML(finalUrl);
      }, function (msg) {
        if (self.stream === stream) self.fail(msg);
      });

      Subs.fetchList(ctx).then(function (list) {
        if (self.session !== session || settings.subLang === 'off' || self.skipAutoSubs() || Subs.embedded || Subs.manual) return;
        for (var i = 0; i < list.length; i++) {
          if (list[i].lang === settings.subLang) { Subs.auto = true; Subs.select(list[i]); return; }
        }
      });
      this.tickTimer = setInterval(function () { self.tick(); }, 250);
      this.saveTimer = setInterval(function () { self.saveProgress(); }, 10000);
    },

    // piezas del OSD que el index.html de la app instalada no trae: reloj arriba, episodio bajo el título y burbuja al avanzar
    osdParts: function () {
      if ($('#osd-top')) return;
      var top = el('div', 'clock');
      top.id = 'osd-top';
      top.textContent = clockText(new Date());
      $('#player').insertBefore(top, $('#osd'));
      var sub = el('div');
      sub.id = 'osd-sub';
      $('#osd-title').parentNode.insertBefore(sub, $('#osd-title').nextSibling);
      var seek = el('div', 'hidden');
      seek.id = 'osd-seek';
      $('#osd-bar').appendChild(seek);
    },

    // INFO: ficha y datos técnicos sin salir del vídeo; cualquier tecla lo cierra
    toggleInfo: function () {
      if (this.infoOpen) { this.closeInfo(); return; }
      var c = this.ctx, st = this.stream || {}, box = $('#infopanel');
      if (!c) return;
      if (!box) {
        box = el('div', 'hidden');
        box.id = 'infopanel';
        $('#player').appendChild(box);
      }
      var tech = [];
      var row = function (k, v) { if (v) tech.push('<b>' + esc(tr(k)) + ':</b> ' + esc(v)); };
      var vinfo = this.videoInfo();
      row('Fuente', [st.quality, vinfo, st.addon || DEBRID_NAMES[settings.debrid]].filter(Boolean).join(' · '));
      row('Archivo', st.file);
      row('Audio', this.audioKey ? tr(LANG_NAMES[this.audioKey]) || this.audioKey : this.backend === 'av' ? tr('pista {0}', this.currentAudio() + 1) : '');
      row('Subtítulos', Subs.embedded ? tr('incrustados') : Subs.current ? (tr(LANG_NAMES[Subs.current.lang]) || Subs.current.lang) : tr('no'));
      row('Reproductor', this.backend === 'av' ? tr('nativo (AVPlay)') : 'HTML5');
      if (this.duration) {
        var end = new Date(Date.now() + Math.max(0, this.duration - this.time) * 1000);
        row('Posición', fmtTime(this.time) + ' / ' + fmtTime(this.duration) + ' · ' + tr('termina a las {0}', clockText(end)));
      }
      box.innerHTML = '<div class="ip-poster"' + (c.poster ? ' style="background-image:url(&quot;' + esc(c.poster) + '&quot;)"' : '') + '></div>' +
        '<div class="ip-body"><h2>' + esc(c.name || c.label) + '</h2>' + (c.epLabel ? '<div class="ip-ep">' + esc(c.epLabel) + '</div>' : '') +
        (c.info ? '<div class="ip-meta">' + esc(c.info) + '</div>' : '') + '<div class="ip-desc">' + esc(c.desc || '') + '</div>' +
        '<div class="ip-tech">' + tech.join('<br>') + '</div><div class="ip-help">' + esc(tr('Pulsa cualquier tecla para cerrar')) + '</div></div>';
      box.classList.remove('hidden');
      this.infoOpen = true;
    },

    closeInfo: function () {
      this.infoOpen = false;
      var box = $('#infopanel');
      if (box) box.classList.add('hidden');
    },

    // resolución y códec del vídeo según AVPlay («1920×1080 H264»)
    videoInfo: function () {
      if (this.backend !== 'av') {
        var v = $('#video');
        return v.videoWidth ? v.videoWidth + '×' + v.videoHeight : '';
      }
      try {
        var t = webapis.avplay.getCurrentStreamInfo().filter(function (x) { return x.type === 'VIDEO'; })[0];
        var x = JSON.parse(t.extra_info || '{}');
        return (x.Width ? x.Width + '×' + x.Height : '') + (x.fourCC ? ' ' + x.fourCC : '');
      } catch (e) { return ''; }
    },

    resolve: function (url) {
      var name = DEBRID_NAMES[settings.debrid], da = debridAddon(), src = da ? da.manifest.name : '', srcOrigin = da ? originOf(da.url) : '';
      var notices = {
        'blocked_access': tr('{0} ha bloqueado el acceso desde {1}. Revisa tu correo o la sección de autorizaciones de tu cuenta y aprueba el acceso.', name, src),
        'failed_access': tr('La clave de {0} no es válida o tu suscripción ha caducado.', name),
        'downloading': tr('{0} aún está descargando este archivo. Prueba dentro de unos minutos o elige una fuente instantánea.', name),
        'download_failed': tr('{0} no ha podido descargar este archivo. Prueba otra fuente.', name),
        'limits_exceeded': tr('Has alcanzado el límite de {0}. Prueba más tarde.', name),
        'failed_too_big': tr('El archivo es demasiado grande para {0}.', name),
        'failed_rar': tr('La fuente es un RAR y no se puede reproducir. Prueba otra.'),
        'failed_opening': tr('{0} no ha podido abrir este archivo. Prueba otra fuente.', name),
        'failed_infringement': tr('{0} ha retirado este archivo. Prueba otra fuente.', name),
        'failed_unavailable': tr('Este archivo ya no está disponible. Prueba otra fuente.'),
        'failed_unexpected': tr('Error inesperado de {0}. Prueba otra fuente.', src)
      };
      return new Promise(function (resolve, reject) {
        var x = new XMLHttpRequest();
        x.open('GET', url, true);
        x.setRequestHeader('Range', 'bytes=0-0');
        x.timeout = 30000;
        x.onreadystatechange = function () {
          if (x.readyState < 2) return; // con las cabeceras basta: no hace falta descargar nada
          var final = x.responseURL || url;
          var m = /\/videos\/([a-z_]+?)(_v\d+)?\.mp4/.exec(final);
          x.onreadystatechange = null;
          try { x.abort(); } catch (e) { /* ya terminada */ }
          if (m && srcOrigin && final.indexOf(srcOrigin) === 0) reject(notices[m[1]] || tr('Aviso de {0}: {1}', src, m[1]));
          else resolve(final);
        };
        x.onerror = x.ontimeout = function () { resolve(url); }; // si no se puede comprobar, intentar igualmente
        x.send();
      });
    },

    // --- backend AVPlay (reproductor nativo de Samsung: MKV, HEVC, varias pistas)
    openAV: function (url) {
      var self = this, av = webapis.avplay, mine = this.stream;
      this.backend = 'av';
      $('#video').classList.add('hidden');
      $('#avplayer').classList.remove('hidden');
      // AVPlay pinta el vídeo en un plano por debajo de la web: hay que dejarla transparente
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
      $('#player').style.background = 'transparent';
      try {
        av.open(url);
        av.setDisplayRect(0, 0, 1920, 1080);
        try { av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX'); } catch (e) { /* no soportado */ }
        try { av.setStreamingProperty('USER_AGENT', 'Mozilla/5.0 (SMART-TV; Tizen) StremTV'); } catch (e) { /* opcional */ }
        // más colchón: arrancar con ~15 s cargados y ~20 s tras saltar o atascarse
        try { av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 15); } catch (e) { /* no soportado */ }
        try { av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', 20); } catch (e) { /* no soportado */ }
        av.setListener({
          onbufferingstart: function () { self.buffering = true; self.spinner(true, tr('Cargando…')); self.stallBegin(); },
          onbufferingprogress: function (p) { self.spinner(true, tr('Cargando…') + ' ' + p + '%'); },
          onbufferingcomplete: function () { self.buffering = false; self.spinner(false); self.stallEnd(); },
          oncurrentplaytime: function (ms) {
            self.time = ms / 1000;
            // Tizen 3 ignora el cambio de pista hasta un rato después de arrancar (en la tele se veía el cambio a los 3 s):
            // comprobar cada 0,4 s qué pista suena y repetirlo hasta que la tele lo acepte (3 lecturas buenas seguidas)
            if (self.started && !self.audioRetried) {
              self.audioRetried = true;
              var mine = self.stream, tries = 0, good = 0, t0 = Date.now();
              var poll = setInterval(function () {
                if (self.stream !== mine || self.backend !== 'av' || ++tries > 25) { clearInterval(poll); self.muteAudio(false); return; }
                if (self.autoAudio(true)) {
                  self.muteAudio(false);
                  if (++good >= 3) {
                    clearInterval(poll);
                    logEv('audio', 'aplicada', { intentos: tries, ms: Date.now() - t0 });
                  }
                } else good = 0;
              }, 400);
            }
          },
          onstreamcompleted: function () { if (self.stream === mine) self.finished(); },
          onerror: function (e) { if (self.stream === mine) self.fail(tr('Error del reproductor: {0}', e)); },
          onsubtitlechange: function (duration, text) {
            if (Subs.embedded) Subs.show((text || '').replace(/<[^>]+>/g, ''));
          }
        });
        av.prepareAsync(function () {
          // salió mientras preparaba: close() ya cerró ese vídeo; no tocar AVPlay, que puede ser ya el de otra fuente
          if (self.stream !== mine) return;
          self.duration = av.getDuration() / 1000;
          try {
            logEv('pistas', Math.round(self.duration) + ' s', webapis.avplay.getTotalTrackInfo().map(function (t) { return { tipo: t.type, i: t.index, info: t.extra_info }; }));
          } catch (e) { logEv('pistas', 'no disponibles: ' + e.message); }
          if (!self.startAt && self.startPct && self.duration) self.startAt = self.duration * self.startPct / 100;
          if (!self.autoAudio()) self.muteAudio(true);
          // por si la pista no se puede cambiar antes de empezar: volver a intentarlo ya reproduciendo
          var go = function () { av.play(); self.markStarted(); self.spinner(false); self.autoAudio(); };
          if (self.startAt > 5) av.seekTo(Math.floor(self.startAt * 1000), go, go);
          else go();
        }, function (e) {
          if (self.stream !== mine) return;
          try { av.close(); } catch (x) { /* ya cerrado */ }
          self.fail(tr('El reproductor nativo no ha podido abrir esta fuente ({0}).', e && e.name ? e.name : e));
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
        if (!self.startAt && self.startPct && self.duration) self.startAt = self.duration * self.startPct / 100;
        if (self.startAt > 5 && !self.started) v.currentTime = self.startAt;
      };
      v.onwaiting = function () { self.buffering = true; self.spinner(true, tr('Cargando…')); self.stallBegin(); };
      v.onplaying = function () { self.buffering = false; self.markStarted(); self.spinner(false); self.stallEnd(); };
      v.onended = function () { self.finished(); };
      v.onerror = function () {
        var code = v.error ? v.error.code : 0;
        self.fail(code === 4 ? tr('No se pudo reproducir: el enlace ha fallado o la tele no admite el formato. Prueba otra fuente (mejor 1080p).') : tr('Error de reproducción ({0})', code));
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
        if (this.paused) this.probeSpeed(); else { this.probeId++; this.probeText = ''; }
        this.lastPaused = this.paused;
        Trakt.scrobble(this.paused ? 'pause' : 'start', this.ctx, this.pct());
      }
      var shown = this.seekTarget !== null ? this.seekTarget : this.time;
      $('#osd-cur').textContent = fmtTime(shown);
      var end = new Date(Date.now() + Math.max(0, this.duration - shown) * 1000);
      $('#osd-dur').textContent = this.duration ? tr('termina a las {0}', clockText(end)) + ' · ' + fmtTime(this.duration) : '--:--';
      $('#osd-progress').style.width = this.duration ? (shown / this.duration * 100) + '%' : '0';
      // burbuja con el tiempo de destino mientras se avanza o retrocede
      var bubble = $('#osd-seek');
      if (bubble) {
        bubble.classList.toggle('hidden', this.seekTarget === null || !this.duration);
        if (this.seekTarget !== null && this.duration) {
          bubble.style.left = (this.seekTarget / this.duration * 100) + '%';
          // debajo, cuánto se salta en total desde donde estaba
          var delta = this.seekFrom !== null && this.seekFrom !== undefined ? Math.round(this.seekTarget - this.seekFrom) : 0, ad = Math.abs(delta);
          var html = fmtTime(this.seekTarget) + (delta ? '<small>' + (delta > 0 ? '+' : '−') + (ad < 60 ? ad + ' s' : fmtTime(ad)) + '</small>' : '');
          if (bubble.innerHTML !== html) bubble.innerHTML = html;
        }
      }
      // al avanzar, el tiempo de destino ya sale en la burbuja: aquí solo la dirección
      $('#osd-state').textContent = this.seekTarget !== null ? (this.seekTarget >= this.time ? '⏩' : '⏪') + (bubble ? '' : ' ' + fmtTime(this.seekTarget)) :
        (this.paused ? tr('⏸ Pausa') + (this.probeText ? ' · ' + this.probeText : '') : '') +
        (Player.sleep ? '  ⏾ ' + this.sleepLabel() : '');
      if (this.paused) this.showOSD(true);
      Subs.update(this.time);
      this.checkSkip();
      this.checkUpNext();
      this.checkSleep();
    },

    // opening/ending de AniSkip en curso (el ending solo si no hay siguiente episodio: entonces sale su aviso)
    checkSkip: function () {
      var cur = null, t = this.time, i;
      if (this.started && this.seekTarget === null) {
        for (i = 0; i < this.skips.length; i++) {
          var sk = this.skips[i];
          if (t >= sk.s && t < sk.e - 2 && !(sk.type === 'ed' && (this.upNext || this.nextCtx))) cur = sk;
        }
      }
      if (cur && cur.type === 'op' && settings.autoSkip && !cur.done && !cur.learned) {
        cur.done = true;
        toast(tr('Intro saltada'));
        this.skipTo(cur.e);
        cur = null;
      }
      if (cur === this.skipNow) {
        // si no se pulsa en 5 s, se quita (vuelve con el OSD mientras siga en el tramo)
        if (cur && !this.skipHidden && Date.now() - this.skipShownAt > 5000) this.showSkip(false);
        return;
      }
      this.skipNow = cur;
      this.showSkip(!!cur);
    },

    showSkip: function (on) {
      var box = $('#skipbox'), cur = this.skipNow;
      if (!box) { // el index.html de la app instalada no trae este elemento
        box = el('div', 'hidden');
        box.id = 'skipbox';
        $('#player').appendChild(box);
      }
      on = on && !!cur;
      this.skipHidden = !on;
      if (on) this.skipShownAt = Date.now();
      box.textContent = on ? (cur.type === 'op' ? tr('⏭ OK: saltar intro') : tr('⏭ OK: saltar ending')) : '';
      box.classList.toggle('hidden', !on);
    },

    skipTo: function (t) {
      this.seekFrom = null;
      this.seekTarget = Math.min(t, this.duration ? this.duration - 1 : t);
      this.commitSeek();
    },

    // en el ending (si AniSkip lo conoce) ya se puede avisar del siguiente episodio
    inEnding: function () {
      for (var i = 0; i < this.skips.length; i++) if (this.skips[i].type === 'ed' && this.time >= this.skips[i].s) return true;
      return false;
    },

    markStarted: function () {
      if (this.started) return;
      this.started = true;
      var c = this.ctx, s = this.stream;
      if (s && c.type === 'series') saveSrcPref(c.metaId, { hash: s.hash, binge: s.binge, group: s.group });
    },

    // --- siguiente episodio: aviso en los últimos 40 s y cuenta atrás de 10 s
    checkUpNext: function () {
      if (!this.started || !this.duration) return;
      var left = this.duration - this.time;
      if (this.upNext) {
        // la cuenta atrás se para en pausa o con un menú abierto
        if (settings.autoNext && !this.paused && stack[stack.length - 1] === this.screen) {
          this.upNext.left -= 0.25;
          if (this.upNext.left <= 0) { this.playNext(); return; }
        }
        this.paintUpNext();
        return;
      }
      if (this.upNextOff && this.nextCtx && left > 120) this.upNextOff = false; // ha vuelto atrás: avisar otra vez
      if (this.upNextOff || this.paused || this.duration < 300 || (left > 40 && !this.inEnding())) return;
      if (this.nextCtx === undefined) this.nextCtx = this.ctx.next ? this.ctx.next() : null;
      if (!this.nextCtx) { this.upNextOff = true; return; }
      this.upNext = { left: 10 };
      prefetchStreams(this.nextCtx.type, this.nextCtx.videoId); // que el siguiente empiece sin esperar a los addons
      this.paintUpNext();
    },

    paintUpNext: function () {
      var box = $('#upnext');
      if (!box) { // el index.html de la app instalada no trae este elemento
        box = el('div', 'hidden');
        box.id = 'upnext';
        $('#player').appendChild(box);
      }
      if (!this.upNext) { box.classList.add('hidden'); return; }
      var html = '<div class="un-label">' + tr('Siguiente episodio') + '</div><div class="un-title">' + esc(this.nextCtx.epLabel) + '</div>' +
        '<div class="un-help">' + (settings.autoNext ? tr('Empieza en {0} s · ', Math.max(1, Math.ceil(this.upNext.left))) : '') +
        tr('OK ver ahora · Atrás seguir viendo') + '</div>';
      if (box.innerHTML !== html) box.innerHTML = html;
      box.classList.remove('hidden');
    },

    dismissUpNext: function () {
      this.upNext = null;
      this.upNextOff = true;
      this.paintUpNext();
    },

    // manual: el usuario ha pulsado «OK ver ahora»; el temporizador «al terminar este vídeo» pasa al siguiente
    playNext: function (manual) {
      var next = this.nextCtx;
      if (!next) return;
      if (!manual && Player.sleep && Player.sleep.end) { this.sleepNow(); return; } // «al terminar este vídeo»: no seguir
      this.upNext = null;
      this.paintUpNext();
      if (!this.leave()) return; // cierra menús y reproductor: guarda el progreso y avisa a Trakt
      var top = stack[stack.length - 1];
      if (top && top.streamsOf) pop(); // la lista de fuentes del episodio anterior ya no sirve
      next.autoPlay = true;
      next.continued = true;
      push(streamsScreen(next));
    },

    // --- audio: el idioma elegido antes en esta serie o, si no, español si el archivo lo trae
    currentAudio: function () {
      try {
        var sel = webapis.avplay.getCurrentStreamInfo().filter(function (t) { return t.type === 'AUDIO'; })[0];
        return sel ? sel.index : -1;
      } catch (e) { return -1; }
    },

    // devuelve true si ya suena la pista que toca (o no hay ninguna que elegir); quiet: sin apuntarlo en el registro
    autoAudio: function (quiet) {
      if (this.audioChosen) return true; // ya elegida a mano con ▼
      var c = this.ctx, pref = srcPrefs[c.metaId];
      // por orden: lo elegido a mano en esta película o serie, el idioma de Ajustes, el de la app y, si tampoco, inglés
      // antes que la primera pista (muchos archivos traen primero una pista en ruso u otro doblaje; Dune traía francés y español)
      var wants = [], all = [];
      if (pref && pref.audio) all.push(pref.audio);
      if (settings.audioLang !== 'orig') all.push(settings.audioLang, settings.lang === 'en' ? 'eng' : 'spa', 'eng');
      all.forEach(function (l) { l = langKey(l); if (l && wants.indexOf(l) < 0) wants.push(l); });
      var tracks = this.avTracks('AUDIO'), cur = this.currentAudio(), i, w, pick = null;
      for (w = 0; !pick && tracks.length > 1 && w < wants.length; w++) {
        for (i = 0; wants[w] && i < tracks.length; i++) if (langKey(tracks[i].lang) === wants[w]) { pick = tracks[i]; break; }
      }
      var before = cur, err = '';
      if (pick && pick.index !== cur) {
        try { webapis.avplay.setSelectTrack('AUDIO', pick.index); cur = pick.index; } catch (e) { err = e.message || String(e); }
      }
      var now = this.currentAudio();
      if (!quiet || err) {
        logEv('audio', pick ? 'elegida ' + langKey(pick.lang) : 'sin coincidencia', { busca: wants, pistas: tracks.map(function (t) { return t.lang || '?'; }),
          antes: before, ahora: now, error: err || undefined });
      }
      this.audioKey = '';
      for (i = 0; i < tracks.length; i++) if (tracks[i].index === cur || tracks.length === 1) this.audioKey = langKey(tracks[i].lang);
      // con el audio en el mismo idioma que los subtítulos automáticos, sobran
      if (Subs.auto && this.skipAutoSubs()) { Subs.auto = false; Subs.select(null); }
      // subtítulos que trae el propio archivo en el idioma elegido: van sincronizados, mejor que los de OpenSubtitles
      if (!Subs.embedded && !Subs.manual && settings.subLang !== 'off' && !this.skipAutoSubs()) {
        var texts = this.avTracks('TEXT');
        for (i = 0; i < texts.length; i++) {
          if (langKey(texts[i].lang) !== settings.subLang) continue;
          try {
            webapis.avplay.setSelectTrack('TEXT', texts[i].index);
            webapis.avplay.setSilentSubtitle(false);
            Subs.select(null);
            Subs.embedded = true;
            Subs.auto = true;
            this.applySubOffset();
          } catch (e) { /* se quedan los de OpenSubtitles */ }
          break;
        }
      }
      return !pick || now === pick.index;
    },

    // mientras la tele no acepta la pista elegida (1-2 s al empezar) suena la primera: silencio hasta entonces.
    // Con tope de 4 s y sin tocar nada si la tele ya estaba en silencio; se guarda por si la app se cierra a medias
    muteAudio: function (on) {
      var ac = window.tizen && tizen.tvaudiocontrol;
      if (!ac) return;
      clearTimeout(this.muteTimer);
      try {
        if (on && !this.mutedByUs && !ac.isMute()) {
          ac.setMute(true);
          this.mutedByUs = true;
          save('muted', true);
          var self = this;
          this.muteTimer = setTimeout(function () { self.muteAudio(false); }, 4000);
        } else if (!on && this.mutedByUs) {
          this.mutedByUs = false;
          ac.setMute(false);
          save('muted', false);
        }
      } catch (e) { this.mutedByUs = false; /* sin permiso tv.audio (app instalada antes de 0.20) */ }
    },

    skipAutoSubs: function () { return settings.subLang !== 'off' && this.audioKey === settings.subLang; },

    showOSD: function (sticky) {
      var osd = $('#osd'), top = $('#osd-top');
      osd.classList.remove('off');
      if (top) top.classList.remove('off');
      $('#subs').classList.add('up');
      if (this.skipNow && this.skipHidden) this.showSkip(true);
      clearTimeout(this.osdTimer);
      if (!sticky) this.osdTimer = setTimeout(function () { osd.classList.add('off'); if (top) top.classList.add('off'); $('#subs').classList.remove('up'); }, 4000);
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
      if (this.seekTarget === null) { this.seekFrom = this.time; this.seekNum = false; }
      var base = this.seekTarget !== null ? this.seekTarget : this.time;
      var max = this.duration ? this.duration - 5 : base + step;
      this.seekTarget = Math.max(0, Math.min(max, base + dir * step));
      this.showOSD();
      var self = this;
      clearTimeout(this.seekTimer);
      this.seekTimer = setTimeout(function () { self.commitSeek(); }, 800);
    },

    // teclas 1-9: al 10 %-90 % del vídeo; 0: al principio
    jumpTo: function (n) {
      if (!this.duration) return;
      if (this.seekTarget === null) this.seekFrom = this.time;
      this.seekNum = true;
      this.seekTarget = Math.min(this.duration - 5, this.duration * n / 10);
      this.showOSD();
      var self = this;
      clearTimeout(this.seekTimer);
      this.seekTimer = setTimeout(function () { self.commitSeek(); }, 800);
    },

    // un salto de 30 s-3 min hacia delante en los 10 primeros minutos de un episodio suele ser la intro: se recuerda.
    // Si en otro episodio se salta lo mismo (inicio ±20 s, duración ±15 s) queda confirmada; si no, se empieza de cero
    learnIntro: function (from, to) {
      var c = this.ctx;
      if (!c || c.type !== 'series' || !this.started || from > 600 || to - from < 30 || to - from > 180) return;
      for (var i = 0; i < this.skips.length; i++) if (this.skips[i].type === 'op' && !this.skips[i].learned) return; // AniSkip ya la sabe
      var L = introSkips[c.metaId], s = Math.round(from), e = Math.round(to);
      var same = L && Math.abs(L.s - s) <= 20 && Math.abs((L.e - L.s) - (e - s)) <= 15;
      var n = !same ? 1 : L.v === c.videoId ? L.n || 1 : (L.n || 1) + 1;
      // confirmada: desde el inicio más temprano de los saltos, hasta el final del último
      introSkips[c.metaId] = { s: same ? Math.min(L.s, s) : s, e: e, n: n, v: c.videoId, ts: Date.now() };
      capByTs(introSkips, 100);
      save('introskips', introSkips);
      logEv('intro', n >= 2 ? 'confirmada' : 'aprendida', { serie: c.name, s: introSkips[c.metaId].s, e: e, n: n });
    },

    commitSeek: function () {
      var t = this.seekTarget, self = this;
      if (t === null) return;
      if (!this.seekNum && this.seekFrom !== null && this.seekFrom !== undefined) this.learnIntro(this.seekFrom, t);
      this.seekFrom = null;
      if (this.backend === 'html') {
        $('#video').currentTime = t;
        this.seekTarget = null;
      } else if (this.backend === 'av') {
        try {
          webapis.avplay.seekTo(Math.floor(t * 1000), function () { self.seekTarget = null; }, function () { self.seekTarget = null; });
        } catch (e) { this.seekTarget = null; }
      }
      this.time = t;
      this.lastSeekAt = Date.now();
      Subs.idx = 0;
    },

    // --- cortes: las cargas a mitad de vídeo que no vienen de saltar. Se apuntan en el registro al cerrar y,
    // con 3 en 10 minutos, se ofrece pasar a una fuente más ligera en el mismo punto
    stallBegin: function () {
      if (this.started && !this.stallStart && Date.now() - this.lastSeekAt > 4000) this.stallStart = Date.now();
    },

    stallEnd: function () {
      if (!this.stallStart) return;
      var now = Date.now(), st = this.stalls;
      st.n++;
      st.ms += now - this.stallStart;
      st.at.push(now);
      this.stallStart = 0;
      st.at = st.at.filter(function (t) { return now - t < 600000; });
      if (st.at.length >= 3 && !this.stallOffered) {
        this.stallOffered = true;
        var alt = this.altRow(true);
        if (alt) this.offerSwitch(alt);
      }
    },

    // otra fuente de la lista (en su orden de preferencia, sin las que han fallado). lighter (se corta): una de menos
    // calidad (720p como mínimo) o, si no, otra de la misma; nunca una más pesada. Sin lighter (ha fallado): la misma
    // calidad si la hay y, si no, la siguiente que quede
    altRow: function (lighter, from) {
      var row = from || this.row, list = row && row.parentNode;
      if (!list) return null;
      var RANK = { '4K': 4, '1080p': 3, '720p': 2, SD: 1 }, cur = row._stream || this.stream || {};
      var mine = RANK[qualityGroup(cur.quality || '')] || 0;
      var rows = Array.prototype.filter.call(list.querySelectorAll('.stream'), function (r) { return r._stream && r !== row && !r._failed && !r._stream.media.bad; });
      var rank = function (r) { return RANK[qualityGroup(r._stream.quality || '')] || 0; };
      var same = rows.filter(function (r) { return rank(r) === mine; })[0];
      if (lighter) return rows.filter(function (r) { return rank(r) < mine && rank(r) >= 2; })[0] || same || null;
      return same || rows[0] || null;
    },

    offerSwitch: function (alt) {
      var box = $('#stallbox'), self = this;
      if (!box) { // el index.html de la app instalada no trae este elemento
        box = el('div', 'hidden');
        box.id = 'stallbox';
        $('#player').appendChild(box);
      }
      this.stallOffer = alt;
      var x = alt._stream;
      box.innerHTML = '<div class="un-label">' + esc(tr('⚠ Esta fuente se corta')) + '</div><div class="un-title">' + esc(tr('Cambiar a {0}', x.quality + (x.cached ? ' ⚡' : ''))) + '</div>' +
        '<div class="un-help">' + esc(tr('OK cambiar · Atrás seguir con esta')) + '</div>';
      box.classList.remove('hidden');
      logEv('cortes', 'ofrecido cambio', { archivo: this.stream && this.stream.file, a: x.file, cortes: this.stalls.n });
      clearTimeout(this.stallTimer);
      this.stallTimer = setTimeout(function () { self.dismissStall(); }, 15000);
    },

    dismissStall: function () {
      this.stallOffer = null;
      clearTimeout(this.stallTimer);
      var box = $('#stallbox');
      if (box) box.classList.add('hidden');
    },

    // cambia a la fuente de esa fila en el mismo punto (la lista sigue debajo del reproductor)
    switchTo: function (row, why) {
      var at = this.seekTarget !== null ? this.seekTarget : this.time, ctx = extend({}, this.ctx);
      ctx.startAt = at > 5 ? at : 0;
      ctx.startPct = 0;
      ctx.continued = true; // el temporizador sigue
      logEv('fuente', why, { de: this.stream && this.stream.file, a: row._stream.file, en: Math.round(at) });
      if (!this.leave()) return null;
      Nav.focus(row);
      Player.open(row._stream, ctx, row);
      return ctx;
    },

    avTracks: function (kind) {
      try {
        return webapis.avplay.getTotalTrackInfo().filter(function (t) { return t.type === kind; }).map(function (t) {
          var info = {};
          try { info = JSON.parse(t.extra_info || '{}'); } catch (e) { /* sin metadatos */ }
          return { index: t.index, lang: info.language || info.track_lang || info.lang || info.track_language || '', codec: info.fourCC || '', channels: info.channels || '' };
        });
      } catch (e) { return []; }
    },

    // ▼: temporizador y, si hay varias, pistas de audio
    audioMenu: function () {
      var tracks = this.backend === 'av' ? this.avTracks('AUDIO') : [];
      var cur = this.currentAudio(), c = this.ctx, self = this;
      var items = [{ label: tr('⏾ Temporizador: {0}', this.sleepLabel()), value: 'sleep' }, { label: tr('⇄ Cambiar fuente…'), value: 'source' }];
      if (tracks.length > 1) {
        items = items.concat(tracks.map(function (k, i) {
          return { label: (tr(LANG_NAMES[langKey(k.lang)]) || k.lang || tr('Pista {0}', i + 1)) + (k.codec ? ' · ' + k.codec : '') + (k.channels ? tr(' · {0} canales', k.channels) : ''),
            value: k.index, lang: langKey(k.lang), selected: k.index === cur };
        }));
      } else {
        items.push({ label: this.backend === 'av' ? tr('Esta fuente solo tiene una pista de audio') : tr('Cambiar el audio solo es posible con el reproductor nativo'), value: 'none' });
      }
      menu(tr('Audio, fuente y temporizador'), items, function (it) {
        if (it.value === 'sleep') { self.sleepMenu(); return; }
        if (it.value === 'source') { self.sourceMenu(); return; }
        if (it.value === 'none') return;
        try { webapis.avplay.setSelectTrack('AUDIO', it.value); } catch (e) { toast(tr('No se pudo cambiar el audio')); return; }
        self.audioKey = it.lang;
        self.audioChosen = true;
        if (it.lang) {
          // se recuerda solo en esta película o serie
          saveSrcPref(c.metaId, { audio: it.lang });
          toast(c.type === 'series' ? tr('Audio cambiado (se usará en el resto de la serie)') : tr('Audio cambiado (se recordará para esta película)'));
        } else toast(tr('Audio cambiado'));
      });
    },

    // otra fuente de la lista sin salir: arranca en el mismo punto (la lista sigue debajo del reproductor)
    sourceMenu: function () {
      var self = this, list = this.row && this.row.parentNode;
      var rows = list ? Array.prototype.filter.call(list.querySelectorAll('.stream'), function (r) { return r._stream; }) : [];
      if (rows.length < 2) { toast(tr('No hay otras fuentes para este vídeo')); return; }
      var cur = this.stream;
      menu(tr('Cambiar fuente'), rows.map(function (r) {
        var x = r._stream;
        return { label: x.quality + ' · ' + (x.cached ? '⚡ ' : '') + (x.es ? 'ES · ' : '') + (r._failed ? tr('✗ Falló') + ' · ' : '') + x.file,
          value: r, selected: x === cur };
      }), function (it) {
        if (it.value._stream === self.stream) return;
        self.switchTo(it.value, 'cambiada en el vídeo');
      });
    },

    sleepLabel: function () {
      var sl = Player.sleep;
      if (!sl) return tr('desactivado');
      if (sl.end) return tr('al terminar este vídeo');
      return tr('quedan {0} min', Math.max(1, Math.ceil((sl.at - Date.now()) / 60000)));
    },

    sleepMenu: function () {
      var self = this, sl = Player.sleep;
      menu(tr('Temporizador'), [
        { label: tr('Desactivado'), value: 0, selected: !sl },
        { label: tr('Al terminar este vídeo'), value: 'end', selected: !!(sl && sl.end) },
        { label: tr('{0} minutos', 30), value: 30 }, { label: tr('{0} minutos', 60), value: 60 }, { label: tr('{0} minutos', 90), value: 90 }
      ], function (it) {
        Player.sleep = !it.value ? null : it.value === 'end' ? { end: true } : { at: Date.now() + it.value * 60000 };
        toast(tr('Temporizador: {0}', self.sleepLabel()));
      });
    },

    // se para guardando la posición; el salvapantallas vuelve y la tele se apaga sola con su ahorro de energía
    checkSleep: function () {
      var sl = Player.sleep;
      if (sl && sl.at && Date.now() >= sl.at && stack[stack.length - 1] === this.screen) this.sleepNow();
    },

    sleepNow: function () {
      Player.sleep = null;
      this.leave();
      toast(tr('Temporizador: reproducción detenida'), 8000);
    },

    subsMenu: function () {
      var self = this, items = [{ label: tr('Sin subtítulos'), value: 'off', selected: !Subs.current && !Subs.embedded }];
      if (this.backend === 'av') {
        this.avTracks('TEXT').forEach(function (t, i) {
          items.push({ label: tr('Incrustado: {0}', t.lang || tr('pista {0}', i + 1)), value: 'emb', index: t.index });
        });
      }
      Subs.list.forEach(function (s) {
        items.push({ label: (tr(LANG_NAMES[s.lang]) || s.lang) + ' · ' + (s.addon ? s.addon + ' · ' : '') + (s.subtitleFileName || s.id), value: 'ext', sub: s, selected: Subs.current === s });
      });
      if (Subs.current || Subs.embedded) {
        items.unshift({ label: tr('Sincronizar subtítulos… (ahora {0})', fmtOffset(Subs.offset)), value: 'sync' });
      }
      menu(tr('Subtítulos'), items, function (it) {
        if (it.value === 'sync') { self.startSync(); return; }
        Subs.auto = false;
        Subs.manual = true;
        Subs.embedded = false;
        try { if (self.backend === 'av') webapis.avplay.setSilentSubtitle(true); } catch (e) { /* no soportado */ }
        if (it.value === 'off') { Subs.select(null); return; }
        if (it.value === 'emb') {
          Subs.select(null);
          try {
            webapis.avplay.setSelectTrack('TEXT', it.index);
            webapis.avplay.setSilentSubtitle(false);
            Subs.embedded = true;
            self.applySubOffset();
          } catch (e) { toast(tr('No se pudo activar el subtítulo incrustado')); }
          return;
        }
        Subs.select(it.sub).then(function () { if (Subs.cues.length) toast(tr('Subtítulos activados')); });
      });
    },

    // modo sincronización: ◀ ▶ ±0,25 s, ▲ ▼ ±1 s, OK/Atrás termina (sin salir del vídeo)
    startSync: function () {
      this.syncMode = true;
      this.paintSync();
    },

    paintSync: function () {
      var box = $('#syncbox');
      if (!box) { // la app instalada puede tener un index.html anterior sin este elemento
        box = el('div', 'hidden');
        box.id = 'syncbox';
        $('#player').appendChild(box);
      }
      if (!this.syncMode) { box.classList.add('hidden'); return; }
      box.innerHTML = '<div class="sync-val">' + fmtOffset(Subs.offset) + '</div>' +
        '<div class="sync-help">' + tr('◀ adelantar · ▶ retrasar (0,25 s) &nbsp;·&nbsp; ▲ ▼ 1 s &nbsp;·&nbsp; OK terminar') + '</div>';
      box.classList.remove('hidden');
    },

    // los incrustados los pinta AVPlay: el desfase se le pasa a él (los de OpenSubtitles lo aplica Subs.update)
    applySubOffset: function () {
      try { webapis.avplay.setSubtitlePosition(Math.round(Subs.offset * 1000)); } catch (e) { /* no soportado */ }
    },

    adjustSync: function (delta) {
      Subs.offset = Math.round((Subs.offset + delta) * 100) / 100;
      Subs.idx = 0;
      if (Subs.embedded) this.applySubOffset();
      saveSubOffset(this.ctx && this.ctx.videoId, Subs.offset);
      this.paintSync();
    },

    onKey: function (code) {
      if (this.infoOpen) { this.closeInfo(); return true; }
      if (code === K.INFO || code === K.I) { this.toggleInfo(); return true; }
      if (code === K.BLUE) { this.sourceMenu(); return true; }
      if (this.syncMode) {
        switch (code) {
          case K.LEFT: this.adjustSync(-0.25); return true;
          case K.RIGHT: this.adjustSync(0.25); return true;
          case K.DOWN: this.adjustSync(-1); return true;
          case K.UP: this.adjustSync(1); return true;
          case K.ENTER: case K.BACK: case K.ESC: case K.BKSP:
            this.syncMode = false;
            this.paintSync();
            toast(tr('Subtítulos: {0} (se recordará para este vídeo)', fmtOffset(Subs.offset)));
            return true;
        }
      }
      if (this.upNext) {
        if (code === K.ENTER) { this.playNext(true); return true; }
        this.dismissUpNext();
        if (code === K.BACK || code === K.ESC || code === K.BKSP) return true;
      }
      if (this.stallOffer) {
        var alt = this.stallOffer;
        this.dismissStall();
        if (code === K.ENTER) { this.switchTo(alt, 'cambiada por cortes'); return true; }
        if (code === K.BACK || code === K.ESC || code === K.BKSP) return true;
      }
      if (this.skipNow && !this.skipHidden && code === K.ENTER) { this.skipTo(this.skipNow.e); return true; }
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
        case K.STOP: case K.BACK: case K.ESC: case K.BKSP: this.exit(); return true;
      }
      if (code >= 48 && code <= 57) { this.jumpTo(code - 48); return true; }
      return false;
    },

    // al pausar: descargar ~4 MB del mismo archivo (por donde vamos) para medir lo rápido que lo sirve el debrid
    probeSpeed: function () {
      var self = this, id = ++this.probeId, url = this.finalUrl, st = this.stream || {};
      if (!url) return;
      var gb = parseSizeGB(st.stats), total = gb * 1073741824;
      var start = total && this.duration ? Math.floor(total * Math.min(0.95, this.time / this.duration)) : 0;
      var CHUNK = 4 * 1048576;
      this.probeText = tr('↓ midiendo…');
      var x = new XMLHttpRequest(), t0 = 0, done = false;
      x.open('GET', url, true);
      x.setRequestHeader('Range', 'bytes=' + start + '-' + (start + CHUNK - 1));
      x.responseType = 'arraybuffer';
      x.timeout = 20000;
      var finish = function (bytes) {
        if (done || id !== self.probeId) return;
        done = true;
        var secs = (Date.now() - t0) / 1000;
        if (!t0 || secs <= 0 || bytes < 262144) { self.probeText = tr('↓ no se pudo medir'); return; }
        var mbps = Math.round(bytes * 8 / secs / 1e5) / 10;
        var need = st.mbps || 0;
        self.probeText = '↓ ' + num(mbps) + ' Mb/s' +
          (need ? tr(' (necesita ~{0}) ', num(need)) + (mbps >= need * 1.3 ? '✓' : mbps >= need ? tr('⚠ justo') : tr('✗ lenta: prueba otra fuente')) : '');
      };
      x.onprogress = function (e) {
        if (!t0) t0 = Date.now();
        if (Date.now() - t0 > 6000) { finish(e.loaded); try { x.abort(); } catch (er) { /* ya cerrada */ } }
      };
      x.onload = function () { finish(x.response ? x.response.byteLength : 0); };
      x.onerror = x.ontimeout = function () { if (!done && id === self.probeId) { done = true; self.probeText = tr('↓ no se pudo medir'); } };
      x.send();
    },

    pct: function () { return this.duration ? this.time / this.duration * 100 : 0; },

    saveProgress: function () {
      var c = this.ctx;
      if (!c || !this.started || !this.duration || this.time < 5) return;
      // visto: casi al final, en el ending (AniSkip) o ya en el aviso del siguiente episodio (últimos 40 s)
      var done = this.time / this.duration > 0.92 || this.duration - this.time <= 40 || this.inEnding();
      saveProgress({
        videoId: c.videoId, metaId: c.metaId, type: c.type, name: c.name, poster: c.poster,
        label: c.epLabel ? c.name + ' · ' + c.epLabel.split(' · ')[0] : c.name,
        t: this.time, d: this.duration, done: done, ts: Date.now()
      });
    },

    finished: function () {
      this.time = this.duration;
      if (this.nextCtx === undefined) this.nextCtx = this.ctx.next ? this.ctx.next() : null;
      if (Player.sleep && Player.sleep.end) { this.sleepNow(); return; }
      if (this.nextCtx && settings.autoNext && !this.upNextOff) { this.playNext(); return; }
      this.saveProgress();
      this.exit();
    },

    // Atrás, Stop o fin del vídeo: si llegó a reproducirse, a la ficha (la lista de fuentes ya no hace falta;
    // para cambiar de fuente está ▼). Si no llegó a empezar, se queda en la lista para probar otra
    exit: function () {
      var played = this.started;
      if (!this.leave()) return;
      var top = stack[stack.length - 1];
      if (played && top && top.streamsOf) pop();
    },

    // cierra el reproductor aunque tenga un menú (▲/▼) encima; false si ya estaba cerrado
    leave: function () {
      var me = this.screen;
      if (!me || me.closed) return false;
      while (!isTop(me)) pop();
      pop();
      return true;
    },

    fail: function (msg) {
      logEv('fallo', msg, { archivo: this.stream && this.stream.file, addon: this.stream && this.stream.addon });
      var row = this.row, ctx = this.ctx, played = this.started, at = this.seekTarget !== null ? this.seekTarget : this.time;
      this.spinner(false);
      if (!this.leave()) return;
      // volver a la lista con la siguiente fuente ya seleccionada
      if (row && row.parentNode) {
        var t1 = row.querySelector('.t1');
        if (t1 && !row._failed) { row._failed = true; t1.innerHTML = '<span class="badge warn">' + tr('✗ Falló') + '</span>' + t1.innerHTML; }
        // falló a mitad de vídeo: seguir solo con otra fuente en el mismo punto (como mucho dos veces seguidas)
        var alt = played && (ctx.recovered || 0) < 2 ? this.altRow(false, row) : null;
        if (alt) {
          var again = extend({}, ctx);
          again.startAt = at > 5 ? at : 0;
          again.startPct = 0;
          again.continued = true;
          again.recovered = (ctx.recovered || 0) + 1;
          logEv('fuente', 'recuperada tras fallo', { de: row._stream && row._stream.file, a: alt._stream.file, en: Math.round(at) });
          Nav.focus(alt);
          Player.open(alt._stream, again, alt);
          toast(tr('La fuente ha fallado: sigue con otra ({0})', alt._stream.quality), 6000);
          return;
        }
        var next = row.nextSibling;
        while (next && (next._failed || !next.classList.contains('stream'))) next = next.nextSibling;
        if (next) { Nav.focus(next); msg += tr(' Pulsa OK para probar la siguiente fuente.'); }
      }
      toast(msg, 7000);
    },

    close: function () {
      this.probeId++;
      this.dismissStall();
      if (this.started && this.stalls) {
        logEv('cortes', this.stalls.n + ' en ' + fmtTime(this.time), { s: Math.round(this.stalls.ms / 1000), archivo: this.stream && this.stream.file,
          calidad: this.stream && this.stream.quality, mbps: this.stream && this.stream.mbps, tope: rateLimit() });
      }
      this.closeInfo();
      Saver.stop();
      this.syncMode = false;
      this.paintSync();
      this.upNext = null;
      this.paintUpNext();
      if (this.started) {
        Trakt.scrobble('stop', this.ctx, this.pct()); // >= 80 % lo marca como visto
        Trakt.upNextCache = null; // el siguiente episodio ha podido cambiar
        Trakt.watchedCache = null;
        Trakt.resumeCache = null;
      }
      this.saveProgress();
      this.muteAudio(false);
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
      document.documentElement.style.background = '';
      document.body.style.background = '';
      $('#player').style.background = '';
      $('#player').classList.add('hidden');
      this.spinner(false);
      this.session++;
      this.stream = null; // las respuestas que lleguen tarde (comprobación del enlace, AVPlay) ya no son de este vídeo
      try {
        if (window.webapis && webapis.appcommon) webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON);
      } catch (e) { /* sin control del salvapantallas */ }
    }
  };

  // ---------------------------------------------------------------- pausa automática y protector de pantalla

  // al salir de la app (botón Home, cambio de fuente…) el vídeo se pausa en vez de seguir reproduciéndose
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden || !Player.stream || !Player.started || Player.paused) return;
    Player.toggle();
    Player.paused = true;
    Player.autoPaused = true;
    logEv('pausa', 'al salir de la app');
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !Player.autoPaused) return;
    Player.autoPaused = false;
    if (Player.stream) toast(tr('Vídeo en pausa al salir de la app: pulsa OK para seguir'), 6000);
  });

  // Protector de pantalla, en dos casos:
  // - «pausa»: con el vídeo en pausa unos minutos (Ajustes → Protector), fondos de lo que hay en Inicio que se funden despacio;
  //   el reproductor apaga el salvapantallas de la tele, así que sin esto la imagen se quedaría fija
  // - «inactividad»: sin tocar el mando fuera del vídeo, fondos con logo y sinopsis de lo que elijas en Ajustes
  //   (pendientes de ver, Mi lista, novedades o un poco de todo); OK abre la ficha del que se ve
  var SAVER_SHOW = ['mix', 'pending', 'list', 'new'];
  var SAVER_SHOW_NAMES = { mix: 'Un poco de todo', pending: 'Pendientes de ver', list: 'Mi lista', 'new': 'Novedades' };

  // títulos para el protector por inactividad: [{ meta, tag }] sin repetir, de las fuentes elegidas
  function saverItems(kind) {
    var lists = [];
    var safe = function (pr, tag) { lists.push(pr.then(function (ms) { return (ms || []).map(function (m) { return { meta: m, tag: tag(m) }; }); }, function () { return []; })); };
    var linked = Trakt.linked();
    if (kind === 'pending' || kind === 'mix') {
      safe(Promise.resolve(continueList().map(function (p) { return { id: p.metaId, type: p.type, name: p.name, poster: p.poster, label: p.label }; })),
        function (m) { return tr('Continuar viendo') + (m.label && m.label !== m.name ? ' · ' + m.label.replace(m.name + ' · ', '') : ''); });
      if (linked) {
        safe(Trakt.upNext(), function (m) { return tr('Siguiente episodio') + ' · ' + String(m.label || '').replace(m.name + ' · ', ''); });
        safe(Trakt.playback(), function () { return tr('Continuar (Trakt)'); });
      }
    }
    if (kind === 'list' || kind === 'mix' || kind === 'pending') {
      safe(linked ? Trakt.loadWatchlist() : Promise.resolve(myListMetas()), function () { return tr('En tu lista'); });
    }
    if (kind === 'new' || kind === 'mix') {
      var year = new Date().getFullYear();
      if (linked) safe(Trakt.calendar(), function (m) { return tr('Esta semana en tus series') + ' · ' + String(m.label || '').split(' · ')[0]; });
      safe(getJSON(CINEMETA + '/catalog/movie/year/genre=' + year + '.json').then(function (r) { return (r.metas || []).slice(0, 20); }), function () { return tr('Estreno de {0}', year); });
      safe(getJSON(CINEMETA + '/catalog/series/top.json').then(function (r) { return (r.metas || []).slice(0, 15); }), function () { return tr('Series populares'); });
    }
    return Promise.all(lists).then(function (all) {
      // intercaladas: una de cada fuente por turno, para que «un poco de todo» lo sea de verdad
      var out = [], seen = {}, more = true;
      for (var i = 0; more; i++) {
        more = false;
        all.forEach(function (l) {
          if (i >= l.length) return;
          more = true;
          var k = listKey(l[i].meta);
          if (!k || seen[k]) return;
          seen[k] = true;
          out.push(l[i]);
        });
      }
      return out.slice(0, 60);
    });
  }

  var Saver = {
    on: false, mode: '', lastKey: Date.now(), slide: 0, timer: null, pool: [], shown: null, gen: 0,

    poke: function () { this.lastKey = Date.now(); },

    check: function () {
      if (Saver.on || document.hidden) return;
      var idle = Date.now() - Saver.lastKey;
      if (Player.stream) {
        if (settings.saver && Player.started && Player.paused && idle >= settings.saver * 60000) Saver.start('pause');
      } else if (settings.idleSaver && idle >= settings.idleSaver * 60000 && stack.length) Saver.start('idle');
    },

    // una tecla con el protector puesto: lo quita; en el de inactividad, OK además abre la ficha del título que se ve
    key: function (code) {
      var m = this.mode === 'idle' && code === K.ENTER && this.shown ? this.shown.meta : null;
      this.stop();
      if (m) openMeta(m); // solo sale fuera del vídeo: no hay reproductor que cerrar
    },

    // primero lo que está en pausa; después, carátulas de las pantallas abiertas (sin repetir, mezcladas)
    collect: function () {
      var c = Player.ctx || {}, seen = {}, out = [], rest = [];
      var add = function (list, m) {
        var imdb = imdbOfMeta(m);
        var bg = m.background || (imdb ? metahubImg('background', imdb) : '');
        if (!bg || seen[bg]) return;
        seen[bg] = true;
        list.push({ bg: bg, name: m.name });
      };
      add(out, c);
      Array.prototype.forEach.call(document.querySelectorAll('.card'), function (x) { if (x._meta) add(rest, x._meta); });
      shuffle(rest);
      return out.concat(rest.slice(0, 30));
    },

    box: function () {
      var box = $('#saver');
      if (!box) {
        box = el('div', 'hidden', '<div class="sv-bg"></div><div class="sv-bg"></div><div class="sv-shade"></div><div class="sv-info"></div><div class="sv-corner-clock clock"></div>');
        box.id = 'saver';
        document.body.appendChild(box);
      }
      return box;
    },

    start: function (mode) {
      var box = this.box(), gen = ++this.gen;
      this.mode = mode || 'pause';
      this.on = true;
      this.slide = 0;
      this.shown = null;
      box.className = 'sv-' + this.mode;
      if (this.mode === 'pause') {
        this.pool = this.collect();
        logEv('protector', 'activado', { fondos: this.pool.length });
        this.next();
        return;
      }
      // inactividad: mientras llegan los títulos, el reloj sobre negro
      this.pool = [];
      box.querySelector('.sv-info').className = 'sv-info';
      box.querySelector('.sv-info').innerHTML = '<div class="sv-clock clock">' + clockText(new Date()) + '</div>';
      saverItems(settings.saverShow).then(function (items) {
        if (!Saver.on || Saver.gen !== gen) return;
        // si lo elegido está vacío (sin pendientes, lista vacía), novedades
        return items.length || settings.saverShow === 'new' ? items : saverItems('new');
      }).then(function (items) {
        if (!Saver.on || Saver.gen !== gen || !items) return;
        Saver.pool = settings.saverShow === 'pending' ? items : shuffle(items);
        logEv('protector', 'inactividad', { mostrar: settings.saverShow, titulos: items.length });
        Saver.next();
      });
    },

    next: function () {
      if (!this.on) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(function () { Saver.next(); }, (this.mode === 'idle' ? settings.saverEvery || 20 : 15) * 1000);
      if (this.mode === 'idle') { this.nextIdle(this.gen, 0); return; }
      var box = $('#saver'), layers = box.querySelectorAll('.sv-bg'), infoBox = box.querySelector('.sv-info');
      var item = this.pool.length ? this.pool[this.slide % this.pool.length] : null, n = this.slide++;
      var cur = layers[n % 2], prev = layers[(n + 1) % 2];
      var c = Player.ctx || {};
      var paint = function () {
        cur.classList.add('on');
        prev.classList.remove('on');
        // el texto cambia de esquina en cada fondo para no marcar la pantalla
        infoBox.className = 'sv-info c' + (n % 4);
        infoBox.innerHTML = '<div class="sv-clock clock">' + clockText(new Date()) + '</div>' +
          '<div class="sv-title">' + esc(tr('En pausa: {0}', c.epLabel ? c.name + ' · ' + c.epLabel.split(' · ')[0] : c.name || c.label || '')) + '</div>' +
          (item && item.name && item.name !== c.name ? '<div class="sv-sub">' + esc(item.name) + '</div>' : '') +
          '<div class="sv-sub">' + esc(tr('Pulsa cualquier tecla para volver')) + '</div>';
      };
      if (item) {
        var img = new Image();
        img.onload = function () { if (Saver.on) { cur.style.backgroundImage = 'url("' + item.bg + '")'; paint(); } };
        img.onerror = paint;
        img.src = item.bg;
      } else paint();
    },

    // inactividad: ficha del siguiente título (fondo, logo, nota, sinopsis); si no tiene fondo se salta, como mucho 5 seguidos
    nextIdle: function (gen, tries) {
      if (!this.pool.length || tries > 5) { this.paintIdle(null); return; }
      var item = this.pool[this.slide % this.pool.length], n = this.slide++;
      heroInfo(item.meta).then(function (d) {
        if (!Saver.on || Saver.gen !== gen) return;
        var imdb = imdbOfMeta(d);
        var bg = d.background || (imdb ? metahubImg('background', imdb) : '');
        if (!bg) { Saver.nextIdle(gen, tries + 1); return; }
        var img = new Image();
        img.onload = function () { if (Saver.on && Saver.gen === gen) Saver.paintIdle(item, d, bg, n); };
        img.onerror = function () { if (Saver.on && Saver.gen === gen) Saver.nextIdle(gen, tries + 1); };
        img.src = bg;
      });
    },

    paintIdle: function (item, d, bg, n) {
      var box = $('#saver'), layers = box.querySelectorAll('.sv-bg'), infoBox = box.querySelector('.sv-info');
      if (!item) {
        infoBox.className = 'sv-info';
        infoBox.innerHTML = '<div class="sv-clock clock">' + clockText(new Date()) + '</div>';
        return;
      }
      this.shown = item;
      var cur = layers[n % 2], prev = layers[(n + 1) % 2];
      cur.style.backgroundImage = 'url("' + bg + '")';
      cur.classList.add('on');
      prev.classList.remove('on');
      var meta = [];
      if (d.imdbRating && parseFloat(d.imdbRating)) meta.push('<span class="star">★ ' + esc(num(d.imdbRating)) + '</span>');
      if (d.releaseInfo || d.year) meta.push('<span>' + esc(d.releaseInfo || d.year) + '</span>');
      var g = d.genres || d.genre;
      if (g && g.length) meta.push('<span>' + esc(g.slice(0, 3).join(', ')) + '</span>');
      // izquierda y derecha alternas para no marcar la pantalla
      infoBox.className = 'sv-info sv-card ' + (n % 2 ? 'right' : 'left');
      infoBox.innerHTML = '<div class="sv-tag">' + esc(item.tag) + '</div>' +
        '<div class="sv-name">' + (d.logo ? '<img src="' + esc(d.logo) + '"><span>' + esc(d.name) + '</span>' : '<b>' + esc(d.name) + '</b>') + '</div>' +
        '<div class="sv-meta">' + meta.join('') + '</div>' +
        '<div class="sv-desc">' + esc(d.description || '') + '</div>' +
        '<div class="sv-help">' + esc(tr('OK: abrir la ficha · cualquier otra tecla: volver')) + '</div>';
      // logo que no carga: el nombre en texto
      var logo = infoBox.querySelector('img');
      if (logo) logo.onerror = function () { logo.parentNode.innerHTML = '<b>' + esc(d.name) + '</b>'; };
      box.querySelector('.sv-corner-clock').textContent = clockText(new Date());
    },

    stop: function () {
      if (!this.on) return;
      this.on = false;
      this.gen++;
      this.shown = null;
      clearTimeout(this.timer);
      var box = $('#saver');
      if (box) {
        box.className = 'hidden';
        Array.prototype.forEach.call(box.querySelectorAll('.sv-bg'), function (l) { l.classList.remove('on'); });
      }
      this.poke();
    }
  };
  // al salir de la app, fuera el protector (y nada de descargar fondos en segundo plano)
  document.addEventListener('visibilitychange', function () { if (document.hidden) Saver.stop(); });
  setInterval(Saver.check, 5000);

  // ---------------------------------------------------------------- vinculación con Trakt (código de dispositivo)

  function traktLinkScreen(onDone) {
    var root = el('div', 'modal');
    var box = el('div', 'modal-box');
    box.style.cssText = 'left:410px;width:1100px;top:180px;text-align:center';
    box.appendChild(el('h2', null, tr('Vincular Trakt')));
    var msg = el('div', null, tr('Pidiendo código…'));
    msg.style.cssText = 'font-size:30px;line-height:46px;margin-bottom:30px';
    box.appendChild(msg);
    var cancel = el('div', 'btn', tr('Cancelar'));
    focusable(cancel, function () { pop(); });
    box.appendChild(cancel);
    root.appendChild(box);
    var timer = null, alive = true;
    push({ el: root, overlay: true, onClose: function () { alive = false; clearTimeout(timer); } });

    traktReq('POST', '/oauth/device/code', { client_id: trakt.clientId }, false).then(function (d) {
      if (!alive) return;
      msg.innerHTML = tr('En el móvil o el ordenador entra en') + '<br><b style="font-size:42px">' + esc(d.verification_url) +
        '</b><br>' + tr('e introduce este código:') + '<div style="font-size:90px;letter-spacing:12px;margin:24px 0;color:#8a7dff;font-weight:bold">' +
        esc(d.user_code) + '</div><span style="color:#99a">' + tr('Esperando confirmación…') + '</span>';
      var interval = (d.interval || 5) * 1000, deadline = Date.now() + d.expires_in * 1000;
      var poll = function () {
        if (!alive) return;
        if (Date.now() > deadline) { msg.textContent = tr('El código ha caducado. Vuelve a intentarlo.'); return; }
        traktReq('POST', '/oauth/device/token', withSecret({ code: d.device_code, client_id: trakt.clientId }), false)
          .then(function (t) {
            Trakt.forget();
            Trakt.storeTokens(t);
            return Trakt.call('GET', '/users/settings').then(function (st) {
              trakt.user = st && st.user ? st.user.username : '';
              saveTrakt();
            }).catch(function () { /* el nombre es opcional */ });
          })
          .then(function () {
            if (!alive) return;
            pop();
            toast(tr('Trakt vinculado') + (trakt.user ? tr(' como {0}', trakt.user) : ''));
            if (onDone) onDone();
          }, function (e) {
            if (!alive) return;
            if (e.status === 400) { timer = setTimeout(poll, interval); return; } // aún no confirmado
            if (e.status === 429) { interval += 1000; timer = setTimeout(poll, interval); return; }
            msg.textContent = e.status === 418 ? tr('Has rechazado la vinculación.')
              : e.status === 410 || e.status === 404 ? tr('El código ha caducado. Vuelve a intentarlo.')
              : e.status === 401 ? (trakt.clientSecret ? tr('El Client Secret no es correcto. Prueba a dejarlo vacío.') : tr('Trakt ha rechazado la vinculación. Revisa el Client ID.'))
              : tr('Error al vincular ({0})', e.message);
          });
      };
      timer = setTimeout(poll, interval);
    }).catch(function (e) {
      msg.textContent = e.status === 401 || e.status === 403 ? tr('El Client ID no es válido.') : tr('No se pudo contactar con Trakt ({0})', e.message);
    });
  }

  // ---------------------------------------------------------------- pantalla: ajustes

  // Ajustes: menú de categorías (con un resumen de cada una); settingsScreen(id) abre una categoría
  var SETTINGS_SECTIONS = ['sources', 'playback', 'subs', 'accounts', 'saver', 'general', 'data'];
  var SECTION_NAMES = { sources: 'Fuentes y debrid', playback: 'Reproducción', subs: 'Subtítulos', accounts: 'Cuentas',
    saver: 'Protector de pantalla', general: 'General', data: 'Datos y diagnóstico' };

  // iconos de las categorías de Ajustes (trazos de 24×24)
  var SECTION_ICONS = {
    sources: '<path d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0zM12 17v4"/>',
    playback: '<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z"/>',
    subs: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 13h4M12 13h6M6 16h8"/>',
    accounts: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    saver: '<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M5 15l4-4 3 3 3-4 4 5M8 21h8"/>',
    general: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'
  };

  function hasSources() { return !!(debridAddon() || addonsFor('stream').length); }

  function sectionSummary(id) {
    if (id === 'sources') {
      // la clave de debrid solo se usa con un addon que la acepte (debridAddon); con otros, no se menciona
      var da = debridAddon(), n = addonsFor('stream').length;
      if (da) return da.manifest.name + ' · ' + (settings.key ? DEBRID_NAMES[settings.debrid] + ' ✓' : tr('sin clave de debrid'));
      return n === 1 ? tr('1 addon de fuentes') : n ? tr('{0} addons de fuentes', n) : tr('✗ Falta un addon de fuentes');
    }
    if (id === 'playback') {
      return tr('Audio: {0}', settings.audioLang === 'orig' ? tr('El que traiga el archivo') : langName(LANG_NAMES, settings.audioLang)) +
        ' · ' + tr('siguiente episodio: {0}', yesNo(settings.autoNext));
    }
    if (id === 'subs') return langName(SUB_NAMES, settings.subLang) + ' · ' + (settings.subColor === 'yellow' ? tr('Amarillo') : tr('Blanco'));
    if (id === 'accounts') {
      var mark = function (on) { return on ? ' ✓' : ' —'; }; // sin configurar no es un error: son opcionales
      return 'Trakt' + mark(Trakt.linked()) + ' · TMDB' + mark(settings.tmdbKey) + ' · OMDb' + mark(settings.omdbKey) + ' · GitHub' + mark(backup.token);
    }
    if (id === 'saver') {
      return settings.idleSaver ? tr('A los {0} min', settings.idleSaver) + ' · ' + tr(SAVER_SHOW_NAMES[settings.saverShow] || SAVER_SHOW_NAMES.mix) : tr('No');
    }
    if (id === 'general') return LANGS[settings.lang] + ' · ' + tr('ocultar lo visto: {0}', yesNo(settings.hideWatched));
    return 'StremTV ' + VERSION;
  }

  // abre Ajustes siempre con el menú debajo (Atrás vuelve a él) y, encima, la categoría pedida;
  // la pestaña Ajustes, sin addon de fuentes, se abre directamente en «Fuentes y debrid»
  function openSettings(section) {
    push(settingsScreen());
    if (SETTINGS_SECTIONS.indexOf(section) < 0) section = hasSources() ? '' : 'sources';
    if (section) push(settingsScreen(section));
  }

  function settingsScreen(section) {
    if (SETTINGS_SECTIONS.indexOf(section) < 0) section = ''; // id desconocido → menú
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('settings'));
    var box = el('div');
    box.style.cssText = 'padding:0 80px;width:1400px';

    if (!section) {
      var items = [];
      SETTINGS_SECTIONS.forEach(function (id) {
        var o = el('div', 'opt');
        o.appendChild(el('span', null, '<span class="ico"><svg viewBox="0 0 24 24">' + SECTION_ICONS[id] + '</svg></span><span class="lbl"></span>'));
        o.appendChild(el('span', 'val sum'));
        focusable(o, function () { push(settingsScreen(id)); });
        box.appendChild(o);
        items.push({ o: o, id: id });
      });
      // «Tu año en StremTV» no es una categoría: abre su pantalla
      var yo = el('div', 'opt');
      yo.appendChild(el('span', null, '<span class="ico"><svg viewBox="0 0 24 24">' + YEAR_ICON + '</svg></span><span class="lbl"></span>'));
      yo.appendChild(el('span', 'val sum'));
      focusable(yo, function () { push(yearScreen()); });
      box.appendChild(yo);
      var paint = function () {
        items.forEach(function (it) {
          it.o.firstChild.lastChild.textContent = tr(SECTION_NAMES[it.id]);
          it.o.lastChild.textContent = sectionSummary(it.id);
        });
        yo.firstChild.lastChild.textContent = tr('Tu año en StremTV');
        yo.lastChild.textContent = yearSummary(wrappedYear());
      };
      paint();
      vs.appendChild(box);
      return { el: root, initialFocus: function () { return box.querySelector('.f'); }, onResume: paint };
    }

    vs.appendChild(el('div', 'screen-title settings-title', esc(tr('Ajustes') + ' › ' + tr(SECTION_NAMES[section]))));
    vs.appendChild(box);

    function opt(label, valueFn, onclick) {
      var o = el('div', 'opt');
      var l = el('span', null, esc(tr(label)));
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

    // campo de texto: OK lo abre para escribir; al terminar, ondone(valor) (inp.value se puede corregir dentro)
    function textField(label, value, placeholder, ondone, onfocus) {
      var f = el('div', 'field');
      f.appendChild(el('label', null, esc(tr(label))));
      var inp = el('input');
      inp.type = 'text';
      inp.value = value || '';
      inp.placeholder = tr(placeholder);
      inp.setAttribute('autocomplete', 'off');
      inp.setAttribute('spellcheck', 'false');
      focusable(inp, function () { if (onfocus) onfocus(); inp.focus(); });
      inp._ondone = ondone;
      f.appendChild(inp);
      box.appendChild(f);
      return inp;
    }

    var build = {}, onResume = null;
    function heading(t) {
      var h = el('div', 'row-title', esc(t));
      h.style.padding = box.children.length ? '30px 0 16px 0' : '0 0 16px 0';
      box.appendChild(h);
    }

    // cada categoría en su propia función: ES5 estricto no admite funciones declaradas dentro de un if
    build.sources = function () {
      heading(tr('Addons'));
      var addonList = el('div');
      box.appendChild(addonList);
      function paintAddons() {
        addonList.innerHTML = '';
        if (!addons.length) addonList.appendChild(el('div', 'note', esc(tr('Ninguno añadido. Sin un addon de fuentes no se puede reproducir nada. Cinemeta, Kitsu y OpenSubtitles ya vienen incluidos.'))));
        addons.forEach(function (a) {
          var what = [];
          if (a === debridAddon()) what.push(tr('fuentes con tu debrid'));
          else if (addonHas(a, 'stream')) what.push(tr('fuentes'));
          if ((a.manifest.catalogs || []).length) what.push(tr('catálogos'));
          if (addonHas(a, 'subtitles')) what.push(tr('subtítulos'));
          var o = el('div', 'opt');
          o.appendChild(el('span', null, esc(a.manifest.name)));
          o.appendChild(el('span', 'val', esc(what.join(', ') || '—')));
          focusable(o, function () {
            menu(a.manifest.name, [{ label: tr('Quitar este addon'), value: 1 }, { label: tr('Cancelar'), value: 0, selected: true }], function (it) {
              if (!it.value) return;
              removeAddon(a);
              paintAddons();
              Nav.focus(addonInput);
              toast(tr('Addon quitado'));
            });
          });
          addonList.appendChild(o);
        });
      }
      paintAddons();
      var addonStatus = el('div', 'note');
      var addonInput = textField('Añadir addon: URL de su manifest (pulsa OK para escribirla)', '', 'https://…/manifest.json', function (v) {
        if (!v || !v.replace(/\s+/g, '')) return;
        addonStatus.textContent = tr('Comprobando…');
        installAddon(v).then(function (a) {
          addonInput.value = '';
          addonStatus.textContent = tr('✓ Añadido: {0}', a.manifest.name);
          paintAddons();
        }).catch(function (e) { addonStatus.textContent = tr('✗ No se pudo añadir ({0})', e.message); });
      });
      box.appendChild(addonStatus);
      box.appendChild(el('div', 'note', esc(tr('Los addons de fuentes que piden configuración (Comet, MediaFusion…) se configuran en su web con tu debrid y se pega aquí la URL que dan. Sus catálogos salen en Inicio y en la búsqueda.'))));

      heading(tr('Servicio debrid'));
      opt('Servicio', function () { return DEBRID_NAMES[settings.debrid]; }, cycle('debrid', ['realdebrid', 'alldebrid']));

      var input = textField('Clave API (pulsa OK para escribirla)', settings.key, 'Pega o escribe aquí tu clave', function (v) {
        settings.key = (v || '').replace(/\s+/g, '');
        input.value = settings.key;
        saveSettings();
        if (settings.key) testKey();
      });
      box.appendChild(el('div', 'note', 'Real-Debrid: real-debrid.com/apitoken · AllDebrid: alldebrid.com/apikeys'));

      var testBtn = el('div', 'btn', tr('Probar clave'));
      var status = el('span', 'note');
      status.style.marginLeft = '20px';
      focusable(testBtn, testKey);
      box.appendChild(testBtn);
      box.appendChild(status);

      function testKey() {
        if (!settings.key) { status.textContent = tr('Escribe primero la clave.'); return; }
        var da = debridAddon();
        if (!da) { status.textContent = tr('Añade primero un addon de fuentes (arriba, en Addons).'); return; }
        status.textContent = tr('Comprobando…');
        getJSON(sourcesBase(da) + '/stream/movie/' + PROBE_ID + '.json').then(function (d) {
          var s = (d.streams || []).map(parseStream);
          if (s.length === 1 && s[0].error) status.textContent = tr('✗ Clave no válida para {0}', DEBRID_NAMES[settings.debrid]);
          else status.textContent = tr('✓ Clave válida · {0} fuentes de prueba', s.filter(function (x) { return x.url; }).length);
        }).catch(function (e) { status.textContent = tr('No se pudo comprobar ({0})', e.message); });
      }

      heading(tr('Opciones de fuentes'));
      opt('Solo enlaces en caché (instantáneos)', function () { return yesNo(settings.onlyCached); }, function () { settings.onlyCached = !settings.onlyCached; });
      opt('Calidad máxima', function () { return tr(QUALITY_NAMES[settings.maxQ]); }, cycle('maxQ', ['all', '1080', '720']));
      var rateOpt = opt('Tasa máxima de las fuentes', function () {
        return tr(RATE_NAMES[settings.maxRate]) + (settings.maxRate === 'auto' ? (settings.measuredMbps ? ' (~' + rateLimit() + ' Mb/s)' : tr(' (sin medir)')) : '');
      }, cycle('maxRate', ['auto', 'none', '10', '20', '40']));
      var speedBtn = el('div', 'btn', tr('Medir mi conexión'));
      var speedNote = el('span', 'note', settings.measuredMbps ? tr('Última medida: {0} Mb/s', num(settings.measuredMbps)) : tr('Sin medir todavía'));
      speedNote.style.marginLeft = '20px';
      focusable(speedBtn, function () {
        speedNote.textContent = tr('Midiendo… (unos segundos)');
        measureSpeed().then(function (mbps) {
          settings.measuredMbps = mbps;
          settings.measuredAt = Date.now();
          saveSettings();
          speedNote.textContent = tr('Tu conexión: {0} Mb/s → fuentes de hasta ~{1} Mb/s', num(mbps), Math.round(mbps * 0.7));
          rateOpt.lastChild.textContent = tr(RATE_NAMES[settings.maxRate]) + (settings.maxRate === 'auto' ? ' (~' + rateLimit() + ' Mb/s)' : '');
        }).catch(function (e) { speedNote.textContent = tr('No se pudo medir ({0})', e.message); });
      });
      box.appendChild(speedBtn);
      box.appendChild(speedNote);
      box.appendChild(el('div', 'note', tr('Las fuentes más pesadas que tu conexión salen al final, marcadas como «pesada»: suelen pararse a cargar.')));
      opt('Mostrar primero las fuentes que la tele puede reproducir', function () { return yesNo(settings.compatFirst); }, function () { settings.compatFirst = !settings.compatFirst; });
      opt('Mostrar primero las fuentes en español', function () { return yesNo(settings.preferEs); }, function () { settings.preferEs = !settings.preferEs; });

    };

    build.playback = function () {
      opt('Al pulsar Ver, reproducir directamente la mejor fuente', function () { return yesNo(settings.quickPlay); }, function () { settings.quickPlay = !settings.quickPlay; });
      opt('Saltar solo las intros de anime', function () { return yesNo(settings.autoSkip); }, function () { settings.autoSkip = !settings.autoSkip; });
      opt('Pasar solo al siguiente episodio', function () { return yesNo(settings.autoNext); }, function () { settings.autoNext = !settings.autoNext; });
      opt('Idioma del audio', function () {
        return settings.audioLang === 'orig' ? tr('El que traiga el archivo') : tr('{0} si lo hay', langName(LANG_NAMES, settings.audioLang));
      }, cycle('audioLang', AUDIO_LANGS));
      box.appendChild(el('div', 'note', tr('La pista que elijas con ▼ se recuerda en esa película o serie. Si un archivo no trae tu idioma, se prueba el último que elegiste y después inglés.')));

    };

    build.subs = function () {
      opt('Idioma automático', function () { return langName(SUB_NAMES, settings.subLang); }, cycle('subLang', ['spa', 'eng', 'fre', 'ger', 'ita', 'por', 'off']));
      opt('Color', function () { return settings.subColor === 'yellow' ? tr('Amarillo') : tr('Blanco'); }, function () { settings.subColor = settings.subColor === 'yellow' ? 'white' : 'yellow'; });
      opt('Posición', function () { return settings.subPos === 'high' ? tr('Más arriba') : tr('Abajo'); }, function () { settings.subPos = settings.subPos === 'high' ? 'low' : 'high'; });
      opt('Fondo detrás del texto', function () { return yesNo(settings.subBg); }, function () { settings.subBg = !settings.subBg; });
      opt('Tamaño', function () { return settings.subSize === 'big' ? tr('Grande') : tr('Normal'); }, function () { settings.subSize = settings.subSize === 'big' ? 'normal' : 'big'; });

    };

    build.accounts = function () {
      heading('Trakt');
      var tStatus = el('div', 'note');
      box.appendChild(tStatus);

      function traktField(label, key, placeholder) {
        var inp = textField(label, trakt[key], placeholder, function (v) {
          trakt[key] = (v || '').replace(/\s+/g, '');
          inp.value = trakt[key];
          saveTrakt();
          paintTrakt();
        });
      }
      traktField('Client ID de tu app de Trakt', 'clientId', 'Client ID');
      traktField('Client Secret (solo apps antiguas de Trakt; déjalo vacío si no tienes)', 'clientSecret', 'Opcional');
      box.appendChild(el('div', 'note', tr('Créala gratis en trakt.tv/oauth/applications/new · Redirect URI: http://localhost')));

      var linkBtn = el('div', 'btn primary');
      focusable(linkBtn, function () {
        if (Trakt.linked()) {
          Trakt.unlink();
          paintTrakt();
          toast(tr('Trakt desvinculado'));
          return;
        }
        if (!trakt.clientId) { toast(tr('Escribe primero el Client ID de tu app de Trakt')); return; }
        traktLinkScreen(paintTrakt);
      });
      box.appendChild(linkBtn);

      function paintTrakt() {
        tStatus.textContent = Trakt.linked()
          ? tr('✓ Vinculado') + (trakt.user ? tr(' como {0}', trakt.user) : '') + tr('. Lo que veas se registra automáticamente (visto al pasar del 80 %).')
          : tr('Sin vincular. Registra lo que ves, tu lista y recomendaciones.');
        linkBtn.textContent = Trakt.linked() ? tr('Desvincular Trakt') : tr('Vincular con Trakt');
      }
      paintTrakt();

      heading(tr('Títulos en español (TMDB)'));
      var tmdbInput = textField('Títulos y sinopsis en español: clave de TMDB (pulsa OK para escribirla)', settings.tmdbKey, 'Clave de la API o token de lectura de themoviedb.org', function (v) {
        settings.tmdbKey = (v || '').replace(/\s+/g, '');
        tmdbInput.value = settings.tmdbKey;
        saveSettings();
        if (!settings.tmdbKey) { tmdbStatus.textContent = tr('Sin clave: los títulos salen en inglés.'); return; }
        tmdbStatus.textContent = tr('Comprobando…');
        tmdbGet('/movie/278').then(function (d) {
          tmdbStatus.textContent = tr('✓ Clave válida («{0}»). Los cambios se ven al volver a Inicio.', d.title);
        }).catch(function (e) { tmdbStatus.textContent = '✗ ' + e.message; });
      });
      var tmdbStatus = el('div', 'note', esc(tr('Gratis en themoviedb.org → Ajustes → API. Solo se usa con la app en español.')));
      box.appendChild(tmdbStatus);

      heading(tr('Notas de Rotten Tomatoes y Metacritic (OMDb)'));
      var omdbInput = textField('Clave de OMDb (pulsa OK para escribirla)', settings.omdbKey, 'Clave de omdbapi.com', function (v) {
        settings.omdbKey = (v || '').replace(/\s+/g, '');
        omdbInput.value = settings.omdbKey;
        saveSettings();
        omdbCache = {};
        if (!settings.omdbKey) { omdbStatus.textContent = tr('Sin clave: solo la nota de IMDb.'); return; }
        omdbStatus.textContent = tr('Comprobando…');
        omdbRatings('tt0111161').then(function (r) {
          omdbStatus.textContent = r ? tr('✓ Clave válida (Cadena perpetua: Rotten Tomatoes {0} %)', r.rt) : tr('✗ La clave no es válida o aún no está activada (llega un correo para activarla)');
        });
      });
      var omdbStatus = el('div', 'note', esc(tr('Gratis en omdbapi.com → API Key (plan FREE, 1000 consultas al día). Las notas salen en la ficha junto a la de IMDb.')));
      box.appendChild(omdbStatus);

      heading(tr('Copia de seguridad (GitHub)'));
      box.appendChild(el('div', 'note', esc(tr('Guarda tus ajustes, claves, Trakt, progreso y addons en un Gist secreto de tu cuenta de GitHub, una vez al día. Si se borran los datos de la app, escribe el token y pulsa Restaurar.'))));
      var tokenInput = textField('Token de GitHub con permiso «gist» (pulsa OK para escribirlo)', backup.token ? backup.token.slice(0, 8) + '…' : '', 'ghp_…', function (v) {
        v = (v || '').replace(/\s+/g, '');
        if (!v || v.indexOf('…') >= 0) { tokenInput.value = backup.token ? backup.token.slice(0, 8) + '…' : ''; return; }
        backup.token = v;
        backup.gistId = '';
        saveBackup();
        tokenInput.value = v.slice(0, 8) + '…';
        paintBackup(tr('Token guardado. Buscando una copia anterior…'));
        findBackupGist().then(function (id) {
          paintBackup(id ? tr('Hay una copia en GitHub: pulsa Restaurar para recuperarla o Guardar para sustituirla.') : tr('No hay copias todavía: pulsa Guardar copia ahora.'));
        }).catch(function (e) { paintBackup('✗ ' + e.message); });
      }, function () { if (backup.token) tokenInput.value = ''; });
      box.appendChild(el('div', 'note', esc(tr('Créalo en github.com/settings/tokens/new marcando solo «gist».'))));
      var saveBtn = el('div', 'btn', tr('Guardar copia ahora'));
      var restoreBtn = el('div', 'btn', tr('Restaurar copia'));
      var bStatus = el('div', 'note');
      function paintBackup(msg) {
        bStatus.textContent = msg || (!backup.token ? tr('Sin configurar.') :
          backup.err ? tr('✗ La última copia falló ({0})', backup.err) :
          backup.at ? tr('✓ Última copia: {0}', fmtDate(new Date(backup.at)) + ' ' + new Date(backup.at).toTimeString().slice(0, 5)) : tr('Aún no se ha hecho ninguna copia.'));
      }
      focusable(saveBtn, function () {
        paintBackup(tr('Guardando…'));
        backupNow().then(function () { paintBackup(); toast(tr('Copia guardada en GitHub')); }).catch(function (e) { paintBackup('✗ ' + e.message); });
      });
      focusable(restoreBtn, function () {
        menu(tr('¿Restaurar la copia? Se sustituyen los ajustes, el progreso y los addons de esta tele.'),
          [{ label: tr('Restaurar'), value: 1 }, { label: tr('Cancelar'), value: 0, selected: true }], function (it) {
            if (!it.value) return;
            paintBackup(tr('Restaurando…'));
            restoreBackup().then(function (d) {
              toast(tr('Copia del {0} restaurada. Reiniciando…', fmtDate(new Date(d.at))));
              setTimeout(function () { location.reload(); }, 1500);
            }).catch(function (e) { paintBackup('✗ ' + e.message); });
          });
      });
      box.appendChild(saveBtn);
      box.appendChild(restoreBtn);
      box.appendChild(bStatus);
      paintBackup();

    };

    build.saver = function () {
      opt('Sin tocar el mando', function () {
        return settings.idleSaver ? tr('A los {0} min', settings.idleSaver) : tr('No');
      }, cycle('idleSaver', [5, 10, 20, 30, 0]));
      opt('Mostrar', function () { return tr(SAVER_SHOW_NAMES[settings.saverShow] || SAVER_SHOW_NAMES.mix); }, cycle('saverShow', SAVER_SHOW));
      opt('Cambiar de título cada', function () { return tr('{0} s', settings.saverEvery); }, cycle('saverEvery', [10, 20, 40]));
      opt('Con el vídeo en pausa', function () {
        return settings.saver ? tr('A los {0} min', settings.saver) : tr('No');
      }, cycle('saver', [3, 10, 0]));
      var test = el('div', 'btn', tr('Probar ahora'));
      focusable(test, function () { Saver.start('idle'); });
      box.appendChild(test);
      box.appendChild(el('div', 'note', tr('Pendientes de ver: lo que dejaste a medias, los siguientes episodios de tus series (Trakt) y tu lista. Novedades: estrenos de este año y series populares (y con Trakt, los episodios de esta semana). Con el protector puesto, OK abre la ficha del título que se ve.')));
    };

    build.general = function () {
      opt('Idioma de la app', function () { return LANGS[settings.lang]; }, function () {
        settings.lang = settings.lang === 'en' ? 'es' : 'en';
        saveSettings();
        setTimeout(rebuildUI, 0);
      });

      opt('Ocultar lo que ya he visto (Trakt y esta app)', function () { return yesNo(settings.hideWatched); }, function () { settings.hideWatched = !settings.hideWatched; Seen.at = 0; });

      // sin spoilers: de los episodios sin ver, ni sinopsis ni imagen (ficha e INFO del vídeo); el título se queda
      opt('Sin spoilers (episodios sin ver: sin sinopsis ni imagen)', function () { return yesNo(settings.noSpoilers); }, function () { settings.noSpoilers = !settings.noSpoilers; });

      var platOpt = opt('Mis plataformas', platformsSummary, function () { push(platformsScreen()); });
      onResume = function () { platOpt.lastChild.textContent = platformsSummary(); };

      ['home', 'anime', 'movies', 'series'].forEach(function (page) {
        opt(tr('Filas de {0}', tr(PAGE_NAMES[page])), function () { return tr('Ordenar u ocultar ›'); }, function () { push(rowsScreen(page)); });
      });
    };

    build.data = function () {
      var clear = el('div', 'btn', tr('Borrar historial de reproducción'));
      focusable(clear, function () {
        menu(tr('¿Borrar «Continuar viendo» y el progreso?'), [{ label: tr('Borrar'), value: 1 }, { label: tr('Cancelar'), value: 0, selected: true }], function (it) {
          if (!it.value) return;
          progress = {};
          save('progress', progress);
          toast(tr('Historial borrado'));
        });
      });
      box.appendChild(clear);
      var sendLog = el('div', 'btn', tr('Enviar registro de diagnóstico'));
      focusable(sendLog, function () {
        if (!backup.token) { toast(tr('Configura antes la copia de seguridad (token de GitHub)')); return; }
        toast(tr('Enviando…'));
        backupNow().then(function () { toast(tr('Registro enviado. ID: {0}', backup.gistId), 8000); }).catch(function (e) { toast('✗ ' + e.message); });
      });
      box.appendChild(sendLog);
      var viewLog = el('div', 'btn', tr('Ver registro'));
      focusable(viewLog, function () {
        var last = diagLog.slice(-60).reverse();
        menu(tr('Registro (lo más reciente arriba)'), last.length ? last.map(function (e) {
          return { label: e.t.slice(5, 16).replace('T', ' ') + ' · ' + e.k + ' · ' + e.m + (e.d ? ' · ' + JSON.stringify(e.d).slice(0, 160) : '') };
        }) : [{ label: tr('Vacío') }], function () { /* solo lectura */ });
      });
      box.appendChild(viewLog);
      if (backup.gistId) box.appendChild(el('div', 'note', esc(tr('ID del Gist de la copia y del registro: {0}', backup.gistId))));
      if (backup.token) {
        var queue = el('div', 'btn', tr('Revisar la cola del móvil'));
        focusable(queue, function () {
          toast(tr('Revisando…'));
          checkQueue().then(function (n) { toast(n ? tr('{0} añadidos desde el móvil', n) : tr('La cola está vacía')); });
        });
        box.appendChild(queue);
        box.appendChild(el('div', 'note', esc(tr('Desde el móvil: escribe títulos o enlaces de IMDb en el archivo cola.txt de ese Gist (gist.github.com) y llegan a Mi lista en unos minutos.'))));
      }
      var diag = el('div', 'btn', tr('Diagnóstico de reproducción'));
      focusable(diag, function () {
        var yn = function (v) { return v ? tr('sí ({0})', v) : tr('no'); };
        var chrome = (navigator.userAgent.match(/Chrome\/(\d+)/) || [])[1] || '?';
        menu(tr('Diagnóstico'), [
          { label: tr('Reproductor: {0}', Player.hasAV() ? tr('nativo (AVPlay)') : 'HTML5') },
          { label: 'API tizen: ' + yesNo(window.tizen) + ' · webapis: ' + yesNo(window.webapis) },
          { label: tr('Navegador: Chromium {0}', chrome) },
          { label: 'H.264: ' + yn(Codecs.h264) },
          { label: 'HEVC 8-bit: ' + yn(Codecs.hevc) },
          { label: 'HEVC 10-bit: ' + yn(Codecs.hevc10) },
          { label: 'AV1: ' + yn(Codecs.av1) },
          { label: 'MKV: ' + yn(Codecs.mkv) },
          { label: 'Audio AC3: ' + yn(Codecs.ac3) + ' · EAC3: ' + yn(Codecs.eac3) },
          { label: 'Audio DTS: ' + yn(Codecs.dts) }
        ], function () { /* solo informativo */ });
      });
      box.appendChild(diag);
      box.appendChild(el('div', 'note', esc(tr('Certificado de la app válido hasta el {0}', fmtDate(CERT_EXPIRES)))));
      box.appendChild(el('div', 'note', 'StremTV ' + VERSION + tr(' · Catálogo: Cinemeta · Fuentes: tus addons · Subtítulos: OpenSubtitles · Reproductor: {0}', Player.hasAV() ? tr('nativo (AVPlay)') : 'HTML5')));

    };

    build[section]();
    return { el: root, initialFocus: function () { return box.querySelector('.f'); }, onResume: function () { if (onResume) onResume(); } };
  }

  // «Netflix, Prime Video», «4 plataformas» o «Ninguna»
  function platformsSummary() {
    var mine = myPlatformKeys();
    if (!mine.length) return tr('Ninguna');
    if (mine.length > 2) return tr('{0} plataformas', mine.length);
    return PLATFORMS.filter(function (pl) { return mine.indexOf(pl.k) >= 0; }).map(function (pl) { return pl.name; }).join(', ');
  }

  // Ajustes → General → Mis plataformas: OK marca o desmarca cada una. Con alguna elegida, Inicio tiene «Novedades en tus
  // plataformas» y, en las pestañas, las filas de las demás plataformas pasan a estar ocultas de serie
  function platformsScreen() {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('settings'));
    vs.appendChild(el('div', 'screen-title settings-title', esc(tr('Ajustes') + ' › ' + tr('Mis plataformas'))));
    var box = el('div');
    box.style.cssText = 'padding:0 80px;width:1400px';
    vs.appendChild(box);
    box.appendChild(el('div', 'note', esc(tr('Las plataformas que tienes contratadas. Inicio muestra lo que acaba de llegar a ellas (según su fecha de estreno o del último episodio: TMDB no dice el día en que entró en la plataforma) y en Anime, Películas y Series se ven sus filas y se ocultan las de las demás (en Filas de … se pueden volver a mostrar).') +
      (settings.tmdbKey ? '' : ' ' + tr('Necesita una clave de TMDB (Ajustes → Cuentas).')))));
    PLATFORMS.forEach(function (pl) {
      var o = el('div', 'opt');
      o.appendChild(el('span', null, esc(pl.name)));
      var v = el('span', 'val');
      o.appendChild(v);
      var paint = function () {
        var on = myPlatformKeys().indexOf(pl.k) >= 0;
        v.textContent = on ? '✓ ' + tr('Sí') : tr('No');
        o.classList.toggle('off', !on);
      };
      focusable(o, function () {
        var mine = myPlatformKeys(), on = mine.indexOf(pl.k) >= 0;
        settings.myPlatforms = PLATFORMS.filter(function (x) { return x.k === pl.k ? !on : mine.indexOf(x.k) >= 0; }).map(function (x) { return x.k; });
        // al cambiar de plataformas, sus filas en las pestañas vuelven a lo que toque por defecto (las elegidas, visibles)
        for (var page in ROWS_SETTING) {
          var pref = settings[ROWS_SETTING[page]];
          if (pref && pref.hidden) for (var k in pref.hidden) if (k.indexOf('prov:') === 0) delete pref.hidden[k];
        }
        saveSettings();
        paint();
      });
      paint();
      box.appendChild(o);
    });
    return { el: root, initialFocus: function () { return box.querySelector('.f'); } };
  }

  // Ajustes → General → Filas de Inicio / Series / Películas: OK sobre una fila la sube, baja, lleva arriba del todo u oculta
  function rowsScreen(page) {
    var key = ROWS_SETTING[page], pageName = tr(PAGE_NAMES[page]);
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('settings'));
    vs.appendChild(el('div', 'screen-title settings-title', esc(tr('Ajustes') + ' › ' + tr('Filas de {0}', pageName))));
    var box = el('div');
    box.style.cssText = 'padding:0 80px;width:1400px';
    vs.appendChild(box);
    box.appendChild(el('div', 'note', esc(page === 'home' ? tr('OK sobre una fila para subirla, bajarla u ocultarla. Los avisos (fuentes, certificado) salen siempre arriba.')
      : tr('OK sobre una fila para subirla, bajarla u ocultarla.') + (settings.tmdbKey ? '' : ' ' + tr('Con una clave de TMDB (Ajustes → Cuentas) hay más filas: tendencias, estrenos y una por plataforma.')))));
    var list = el('div');
    box.appendChild(list);
    var reset = el('div', 'btn', tr('Volver al orden de siempre'));
    focusable(reset, function () {
      settings[key] = null;
      saveSettings();
      paint();
      toast(tr('{0} vuelve a tener las filas en su orden de siempre', pageName));
    });
    box.appendChild(reset);

    function store(rows) {
      var hidden = {};
      rows.forEach(function (r) { hidden[r.k] = !!r.hidden; });
      var order = rows.map(function (r) { return r.k; });
      // las que ahora no tocan (de Trakt sin vincular, de un addon quitado) conservan su sitio para cuando vuelvan
      var prev = settings[key] || {};
      (prev.order || []).forEach(function (k) { if (order.indexOf(k) < 0) { order.push(k); if (prev.hidden && k in prev.hidden) hidden[k] = prev.hidden[k]; } });
      settings[key] = { order: order, hidden: hidden };
      saveSettings();
    }
    function paint(focusK) {
      var rows = pageRows(page), target = null;
      list.innerHTML = '';
      rows.forEach(function (r, i) {
        var o = el('div', 'opt' + (r.hidden ? ' off' : ''));
        o.appendChild(el('span', null, esc((i + 1) + '. ' + r.title)));
        o.appendChild(el('span', 'val', esc(r.hidden ? tr('Oculta') : tr('Visible'))));
        focusable(o, function () {
          var items = [];
          if (i > 0) items.push({ label: tr('Subir'), value: 'up' });
          if (i < rows.length - 1) items.push({ label: tr('Bajar'), value: 'down' });
          if (i > 1) items.push({ label: tr('Arriba del todo'), value: 'top' });
          items.push({ label: r.hidden ? tr('Mostrar') : tr('Ocultar'), value: 'toggle' });
          items.push({ label: tr('Cancelar'), value: '' });
          items[0].selected = true;
          menu(r.title, items, function (it) {
            if (!it.value) return;
            rows.splice(i, 1);
            if (it.value === 'up') rows.splice(i - 1, 0, r);
            else if (it.value === 'down') rows.splice(i + 1, 0, r);
            else if (it.value === 'top') rows.unshift(r);
            else { rows.splice(i, 0, r); r.hidden = !r.hidden; }
            store(rows);
            paint(r.k);
          });
        });
        list.appendChild(o);
        if (r.k === focusK) target = o;
      });
      if (target && Nav.root === root) Nav.setRoot(root, target);
    }
    paint();
    return { el: root, initialFocus: function () { return list.querySelector('.f'); } };
  }

  // al cambiar el idioma, rehacer las pantallas (inicio + ajustes) con los textos nuevos
  function rebuildUI() {
    while (stack.length) {
      var sc = stack.pop();
      sc.closed = true;
      if (sc.onClose) sc.onClose();
      if (sc.el.parentNode) sc.el.parentNode.removeChild(sc.el);
    }
    document.documentElement.lang = settings.lang;
    push(homeScreen());
    push(settingsScreen());
    push(settingsScreen('general'));
  }

  // ---------------------------------------------------------------- pantalla: tu año en StremTV

  // Resumen del año: horas, películas, episodios, series terminadas, las series más vistas, tus películas mejor puntuadas,
  // géneros, el mes y el día de la semana con más tele, la racha de días seguidos y el día de maratón.
  // Con Trakt sale de su historial del año (páginas de 250, una detrás de otra: puede haber miles) con la duración de cada
  // episodio o película; sin Trakt, de lo visto en esta tele. Lo de Trakt se guarda por año (stv.year.AAAA): un año que se
  // calculó ya terminado vale para siempre; el que está en curso se rehace al día
  var YEAR_PAGE = 250, YEAR_V = 1;
  var MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS_ES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  var WEEKDAYS_EN = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  // géneros de Trakt (vienen como slug; en inglés basta con ponerlos bonitos)
  var TRAKT_GENRES_ES = { action: 'Acción', adventure: 'Aventura', animation: 'Animación', anime: 'Anime', biography: 'Biografía', comedy: 'Comedia',
    crime: 'Crimen', documentary: 'Documental', drama: 'Drama', family: 'Familia', fantasy: 'Fantasía', history: 'Historia', holiday: 'Fiestas',
    horror: 'Terror', music: 'Música', musical: 'Musical', mystery: 'Misterio', romance: 'Romance', 'science-fiction': 'Ciencia ficción',
    short: 'Cortos', superhero: 'Superhéroes', suspense: 'Suspense', thriller: 'Thriller', war: 'Bélica', western: 'Western', reality: 'Reality',
    'game-show': 'Concursos', 'talk-show': 'Entrevistas', soap: 'Culebrones', 'mini-series': 'Miniseries', children: 'Infantil',
    'sporting-event': 'Deportes', news: 'Noticias', donghua: 'Donghua' };
  var YEAR_ICON = '<path d="M3 21h18M6 17v-5M10 17V6M14 17v-8M18 17V3"/>';

  function genreName(g) {
    if (settings.lang === 'en') return g.charAt(0).toUpperCase() + g.slice(1).replace(/-/g, ' ');
    return TRAKT_GENRES_ES[g] || g;
  }
  function monthName(m) { return settings.lang === 'en' ? MONTHS_EN[m] : MONTHS_ES[m]; }
  // «14 de marzo» / «14 March»
  function yearDate(ms) {
    var d = new Date(ms);
    return settings.lang === 'en' ? d.getDate() + ' ' + MONTHS_EN[d.getMonth()] : d.getDate() + ' de ' + MONTHS_ES[d.getMonth()];
  }
  // día en hora local (el de la tele, no el UTC de Trakt)
  function dayKey(d) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function keyDay(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  // el año del resumen: en enero, el que acaba de terminar
  function wrappedYear() { var d = new Date(); return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); }
  // en diciembre y enero se ve en Inicio (el resto del año, oculta salvo que se muestre en Ajustes → Filas de Inicio)
  function wrappedSeason() { var m = new Date().getMonth(); return m === 11 || m === 0; }
  // la cuenta de Trakt de lo guardado: con otra cuenta no vale
  function yearWho() { return (trakt.clientId || '') + ':' + (trakt.user || ''); }

  // ---- cálculo

  function yearAcc() {
    var per = function (n) { var a = []; for (var i = 0; i < n; i++) a.push({ min: 0, n: 0 }); return a; };
    return { min: 0, plays: 0, movies: {}, episodes: 0, shows: {}, genres: {}, months: per(12), wdays: per(7), days: {}, first: null };
  }
  // suma una visualización. kind: 'movie', 'episode' o 'part' (a medias en esta tele: solo cuenta el tiempo)
  // o: { id, name, poster, genres, s, e, label }
  function yearAdd(acc, when, min, kind, o) {
    acc.min += min;
    acc.months[when.getMonth()].min += min;
    acc.wdays[when.getDay()].min += min;
    var k = dayKey(when), day = acc.days[k] = acc.days[k] || { min: 0, n: 0, m: 0, e: 0 };
    day.min += min;
    (o.genres || []).forEach(function (g) { acc.genres[g] = (acc.genres[g] || 0) + min; });
    if (kind === 'part') return;
    acc.plays++;
    acc.months[when.getMonth()].n++;
    acc.wdays[when.getDay()].n++;
    day.n++;
    if (kind === 'movie') { acc.movies[o.id] = o.name; day.m++; } else {
      acc.episodes++;
      day.e++;
      var sh = acc.shows[o.id] = acc.shows[o.id] || { id: o.id, name: o.name, poster: o.poster, n: 0, min: 0 };
      sh.n++;
      sh.min += min;
    }
    if (!acc.first || when.getTime() < acc.first.at) {
      acc.first = { at: when.getTime(), id: o.id, name: o.name, type: kind === 'movie' ? 'movie' : 'series', s: o.s, e: o.e, label: o.label };
    }
  }
  // el que más tiempo tiene (si no se sabe la duración de nada, el que más visualizaciones)
  function yearBest(list) {
    var best = -1;
    list.forEach(function (x, i) { if (x.n && (best < 0 || x.min > list[best].min || (x.min === list[best].min && x.n > list[best].n))) best = i; });
    return best;
  }
  // lo que se guarda y se pinta (sin las listas completas: cabe de sobra en localStorage)
  function yearResult(acc, y, src, extra) {
    var shows = Object.keys(acc.shows).map(function (k) { return acc.shows[k]; });
    var r = { v: YEAR_V, y: y, src: src, who: src === 'trakt' ? yearWho() : '', at: Date.now(), min: Math.round(acc.min), plays: acc.plays,
      movies: Object.keys(acc.movies).length, episodes: acc.episodes, showCount: shows.length, finished: extra.finished || 0,
      topSeries: shows.sort(function (a, b) { return b.n - a.n || b.min - a.min; }).slice(0, 5)
        .map(function (s) { return { id: s.id, name: s.name, poster: s.poster, n: s.n }; }),
      topMovies: extra.topMovies || [],
      genres: Object.keys(acc.genres).filter(function (g) { return acc.genres[g] > 0; })
        .sort(function (a, b) { return acc.genres[b] - acc.genres[a]; }).slice(0, 5)
        .map(function (g) { return { g: g, pct: acc.min ? Math.round(acc.genres[g] / acc.min * 100) : 0 }; }),
      first: acc.first };
    var m = yearBest(acc.months), w = yearBest(acc.wdays);
    r.month = m < 0 ? null : { m: m, min: Math.round(acc.months[m].min) };
    r.weekday = w < 0 ? null : { d: w, min: Math.round(acc.wdays[w].min) };
    // racha: días seguidos con algo visto (aunque sea a medias)
    var keys = Object.keys(acc.days).filter(function (k) { return acc.days[k].n || acc.days[k].min > 0; }).sort(), run = 0, prev = null, from = null;
    r.streak = null;
    keys.forEach(function (k) {
      var d = keyDay(k);
      if (prev && Math.round((d - prev) / 86400000) === 1) run++; else { run = 1; from = d; }
      prev = d;
      if (!r.streak || run > r.streak.n) r.streak = { n: run, from: from.getTime(), to: d.getTime() };
    });
    // maratón: el día con más tiempo (o, sin duraciones, con más cosas vistas)
    var mk = null;
    keys.forEach(function (k) {
      var d = acc.days[k], b = mk && acc.days[mk];
      if (!b || d.min > b.min || (d.min === b.min && d.n > b.n)) mk = k;
    });
    r.marathon = mk ? { day: keyDay(mk).getTime(), min: Math.round(acc.days[mk].min), m: acc.days[mk].m, e: acc.days[mk].e } : null;
    return r;
  }

  // sin Trakt: lo visto en esta tele ese año (el progreso guarda las 200 últimas cosas; lo marcado a mano no tiene duración)
  function localYear(y) {
    var acc = yearAcc();
    Object.keys(progress).forEach(function (k) {
      var p = progress[k], when = new Date(p.ts);
      if (when.getFullYear() !== y) return;
      var kind = !p.done ? 'part' : p.type === 'movie' ? 'movie' : 'episode';
      if (kind === 'part' && !(p.t >= 60)) return;
      yearAdd(acc, when, ((p.done ? p.d : p.t) || 0) / 60, kind, { id: p.metaId, name: p.name, poster: p.poster, label: p.label || p.name });
    });
    return yearResult(acc, y, 'local', {});
  }

  function yearRange(y) { return 'start_at=' + new Date(y, 0, 1).toISOString() + '&end_at=' + new Date(y + 1, 0, 1).toISOString(); }

  // con Trakt: el historial del año, página a página (onStep(página, total): total 0 si aún no se sabe)
  function traktYear(y, onStep, isAlive) {
    var acc = yearAcc(), pages = 0;
    function add(it) {
      var when = new Date(it.watched_at);
      if (when.getFullYear() !== y) return; // por si Trakt redondea los límites
      if (it.movie && it.movie.ids) {
        var mv = it.movie;
        yearAdd(acc, when, mv.runtime || 0, 'movie', { id: mv.ids.imdb || 'trakt:' + mv.ids.trakt, name: mv.title, genres: mv.genres });
      } else if (it.episode && it.show && it.show.ids) {
        var sh = it.show;
        yearAdd(acc, when, it.episode.runtime || sh.runtime || 0, 'episode', { id: sh.ids.imdb || 'trakt:' + sh.ids.trakt, name: sh.title,
          genres: sh.genres, s: it.episode.season, e: it.episode.number });
      }
    }
    function page(n) {
      if (!isAlive()) return Promise.reject(new Error(tr('cancelado')));
      onStep(n, pages);
      return Trakt.call('GET', '/sync/history?' + yearRange(y) + '&page=' + n + '&limit=' + YEAR_PAGE + '&extended=full', null, function (x) {
        pages = +x.getResponseHeader('X-Pagination-Page-Count') || 0;
      }).then(function (items) {
        items = items || [];
        items.forEach(add);
        // sin la cabecera de paginación (si el navegador no deja leerla), hasta la primera página incompleta
        if ((pages ? n < pages : items.length >= YEAR_PAGE) && n < 400) return page(n + 1);
      });
    }
    return page(1).then(function () {
      if (!isAlive()) throw new Error(tr('cancelado'));
      return Promise.all([
        acc.plays ? Trakt.call('GET', '/sync/ratings/movies').catch(function () { return []; }) : [],
        acc.episodes ? Trakt.watchedShows().catch(function () { return []; }) : []
      ]);
    }).then(function (r) {
      // tus películas mejor puntuadas de las vistas este año (solo las que puntuaste)
      var top = (r[0] || []).filter(function (it) { return it.movie && it.movie.ids && acc.movies.hasOwnProperty(it.movie.ids.imdb || 'trakt:' + it.movie.ids.trakt); })
        .sort(function (a, b) { return b.rating - a.rating || new Date(b.rated_at || 0) - new Date(a.rated_at || 0); }).slice(0, 5)
        .map(function (it) { return { id: it.movie.ids.imdb || '', name: it.movie.title, rating: it.rating }; });
      // series terminadas: al día con lo emitido, con el último episodio visto este año y algo visto este año
      var finished = 0;
      (r[1] || []).forEach(function (it) {
        var sh = it.show, n = 0;
        if (!sh || !sh.ids || !sh.aired_episodes || new Date(it.last_watched_at).getFullYear() !== y) return;
        if (!acc.shows[sh.ids.imdb || 'trakt:' + sh.ids.trakt]) return;
        (it.seasons || []).forEach(function (se) { if (se.number > 0) n += (se.episodes || []).length; });
        if (n >= sh.aired_episodes) finished++;
      });
      var res = yearResult(acc, y, 'trakt', { topMovies: top, finished: finished });
      // la etiqueta del primer episodio del año, con la numeración de Cinemeta (como mucho 4 s)
      var f = res.first;
      if (!f || f.type !== 'series' || String(f.id).indexOf('tt') !== 0) return res;
      return withTimeout(Trakt.learnEpMaps([f.id]), 4000).catch(function () {}).then(function () { return res; });
    });
  }

  // lo guardado de ese año si aún vale
  function yearCached(y) {
    var c = load('year.' + y, null);
    if (!c || c.v !== YEAR_V || c.who !== yearWho()) return null;
    if (c.at >= new Date(y + 1, 0, 1).getTime()) return c; // calculado con el año ya terminado: no cambia
    return Date.now() - c.at < 86400000 ? c : null;
  }

  // el resumen de un año: sin Trakt, al momento; con Trakt, lo guardado o se calcula (force: aunque haya algo guardado)
  function yearStats(y, force, onStep, isAlive) {
    if (!Trakt.linked()) return Promise.resolve(localYear(y));
    var c = !force && yearCached(y);
    if (c) return Promise.resolve(c);
    return traktYear(y, onStep || function () {}, isAlive || function () { return true; }).then(function (r) {
      save('year.' + y, r);
      return r;
    });
  }
  // lo que se sabe ya de un año sin pedir nada (para Ajustes e Inicio)
  function yearKnown(y) { return Trakt.linked() ? yearCached(y) : localYear(y); }

  // años con algo visto (del más reciente al más antiguo; el del resumen siempre). Con Trakt se pregunta por los diez
  // últimos con una consulta mínima cada uno y se guarda un día
  function yearList() {
    var now = new Date().getFullYear(), def = wrappedYear();
    var tidy = function (ys) {
      var out = [];
      ys.concat([now, def]).forEach(function (y) { if (y && out.indexOf(y) < 0) out.push(y); });
      return out.sort(function (a, b) { return b - a; });
    };
    if (!Trakt.linked()) {
      return Promise.resolve(tidy(Object.keys(progress).map(function (k) { return new Date(progress[k].ts).getFullYear(); })));
    }
    var c = load('yearlist', null);
    if (c && c.who === yearWho() && Date.now() - c.at < 86400000) return Promise.resolve(tidy(c.years));
    var ys = [];
    for (var y = now - 1; y >= now - 10; y--) ys.push(y);
    return mapLimit(ys, 3, function (yy) {
      return Trakt.call('GET', '/sync/history?' + yearRange(yy) + '&limit=1').then(function (r) { return r && r.length ? yy : null; });
    }).then(function (found) {
      var years = found.filter(Boolean);
      save('yearlist', { who: yearWho(), at: Date.now(), years: years });
      return tidy(years);
    });
  }

  function yearHours(min) { var h = min / 60; return h < 10 ? num(Math.round(h * 10) / 10) : String(Math.round(h)); }

  // resumen de una línea (Ajustes e Inicio)
  function yearSummary(y) {
    var r = yearKnown(y);
    if (!r || !r.plays) return tr('Tus horas, tus series y tu racha de {0}', y);
    return tr('{0} h · {1} películas · {2} episodios', yearHours(r.min), r.movies, r.episodes);
  }

  // ---- pantalla

  function yearScreen(year) {
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    var head = el('div', 'yr-head', '<div class="yr-title"></div><div class="yr-src"></div>');
    vs.appendChild(head);
    var chipsRow = el('div', 'row chips-row');
    var chips = el('div', 'hscroll chips');
    chips.style.position = 'relative';
    chipsRow.appendChild(chips);
    vs.appendChild(chipsRow);
    var body = el('div', 'yr-body');
    vs.appendChild(body);
    var cur = year || wrappedYear(), years = [cur], job = 0;
    var screen = { el: root, initialFocus: function () { return chips.querySelector('.primary') || chips.querySelector('.f'); } };

    // años arriba (◀ ▶ entre ellos) y, con Trakt, «Recalcular»
    function paintChips() {
      var hadFocus = Nav.cur && chips.contains(Nav.cur), target = null;
      chips.innerHTML = '';
      years.forEach(function (y) {
        var b = el('div', 'btn' + (y === cur ? ' primary' : ''), String(y));
        b._year = y;
        focusable(b, function () { if (y !== cur) show(y); });
        chips.appendChild(b);
        if (y === cur) target = chips._last = b;
      });
      if (Trakt.linked()) {
        var again = el('div', 'btn', esc(tr('↻ Recalcular')));
        focusable(again, function () { show(cur, true); });
        chips.appendChild(again);
      }
      if (hadFocus && target && isTop(screen)) Nav.focus(target);
    }

    function paintHead(r) {
      head.firstChild.textContent = tr('Tu {0} en StremTV', cur);
      head.lastChild.textContent = !r ? '' : r.src === 'trakt'
        ? tr('Con tu historial de Trakt · calculado el {0} a las {1}', fmtDate(new Date(r.at)), clockText(new Date(r.at)))
        : tr('Solo lo visto en esta tele (sin Trakt no hay más datos, y la tele recuerda las últimas 200 cosas que has visto).');
    }

    function show(y, force) {
      var my = ++job;
      cur = y;
      Array.prototype.forEach.call(chips.children, function (b) {
        if (b._year === undefined) return;
        b.classList.toggle('primary', b._year === y);
        if (b._year === y) chips._last = b;
      });
      paintHead(null);
      body.innerHTML = '';
      var status = el('div', 'yr-status', esc(tr('Calculando tu año…')));
      body.appendChild(status);
      var live = function () { return !screen.closed && my === job; };
      yearStats(y, force, function (n, total) {
        if (live()) status.textContent = total ? tr('Calculando tu año… {0}/{1}', n, total) : tr('Calculando tu año… {0}', n);
      }, live).then(function (r) {
        if (!live()) return;
        paintHead(r);
        paintStats(r);
      }, function (e) {
        if (live()) status.textContent = tr('No se pudo calcular ({0})', e.message);
      });
    }

    // fila de recuadros con un número grande (enfocables: así ▲ ▼ recorren la pantalla); t: [número, qué, detalle]
    function tiles(list, cls, title) {
      var row = el('div', 'row');
      if (title) row.appendChild(el('div', 'row-title', esc(title)));
      var sc = el('div', 'hscroll');
      sc.style.position = 'relative';
      list.filter(Boolean).forEach(function (t) {
        var s = el('div', 'yr-stat' + (cls ? ' ' + cls : ''), '<div class="yr-big"></div><div class="yr-lbl"></div><div class="yr-sub"></div>');
        s.childNodes[0].textContent = t[0];
        s.childNodes[1].textContent = t[1];
        s.childNodes[2].textContent = t[2] || '';
        sc.appendChild(focusable(s, function () { /* solo para leer */ }));
      });
      row.appendChild(sc);
      body.appendChild(row);
    }

    function paintStats(r) {
      body.innerHTML = '';
      if (!r.plays) {
        body.appendChild(el('div', 'yr-status', esc(tr('En {0} no hay nada visto todavía. Ya habrá tiempo.', r.y))));
        return;
      }
      var days = r.min / 1440;
      tiles([
        [yearHours(r.min), tr('horas'), days >= 1 ? tr('≈ {0} días enteros de tele', num(Math.round(days * 10) / 10)) : tr('Un año tranquilo')],
        [String(r.movies), r.movies === 1 ? tr('película') : tr('películas'), ''],
        [String(r.episodes), r.episodes === 1 ? tr('episodio') : tr('episodios'), r.showCount === 1 ? tr('de 1 serie') : r.showCount ? tr('de {0} series', r.showCount) : ''],
        r.src === 'trakt' ? [String(r.finished), r.finished === 1 ? tr('serie terminada') : tr('series terminadas'), r.finished ? tr('al día con todo lo emitido') : tr('Ninguna… de momento')] : null
      ]);

      // las series con más episodios vistos
      var series = r.topSeries.filter(function (s) { return String(s.id).indexOf('tt') === 0 || s.poster; });
      if (series.length) {
        body.appendChild(posterRow(tr('Tus series del año'), series.map(function (s) {
          return { id: s.id, type: 'series', name: s.name, poster: s.poster || metahubPoster(s.id) };
        }), openMeta, series.map(function (s) { return { label: s.name + ' · ' + (s.n === 1 ? tr('1 episodio') : tr('{0} episodios', s.n)) }; })));
      }

      var facts = [];
      if (r.month) facts.push([cap(monthName(r.month.m)), tr('tu mes con más tele'), r.month.min ? tr('{0} h de pantalla', yearHours(r.month.min)) : '']);
      if (r.weekday) facts.push([cap(settings.lang === 'en' ? WEEKDAYS_EN[r.weekday.d] : WEEKDAYS_ES[r.weekday.d]), tr('tu día de sofá'), '']);
      if (r.streak) facts.push([r.streak.n === 1 ? tr('1 día') : tr('{0} días', r.streak.n), tr('tu racha más larga'),
        r.streak.n > 1 ? tr('del {0} al {1}', yearDate(r.streak.from), yearDate(r.streak.to)) : tr('Sin dos días seguidos. Qué disciplina.')]);
      if (r.marathon) {
        var mm = r.marathon, what = [];
        if (mm.e) what.push(mm.e === 1 ? tr('1 episodio') : tr('{0} episodios', mm.e));
        if (mm.m) what.push(mm.m === 1 ? tr('1 película') : tr('{0} películas', mm.m));
        facts.push([mm.min ? yearHours(mm.min) + ' h' : yearDate(mm.day), tr('tu día de maratón'), (mm.min ? yearDate(mm.day) + ' · ' : '') + what.join(tr(' y '))]);
      }
      if (facts.length) tiles(facts, '', tr('Tus costumbres'));

      if (r.genres.length) {
        tiles(r.genres.map(function (g) { return [g.pct + ' %', genreName(g.g), '']; }), 'small', tr('Lo que más te ha tirado'));
      }

      var movies = r.topMovies.filter(function (m) { return m.id; });
      if (movies.length) {
        body.appendChild(posterRow(tr('Tus películas mejor puntuadas'), movies.map(function (m) {
          return { id: m.id, type: 'movie', name: m.name, poster: metahubPoster(m.id) };
        }), openMeta, movies.map(function (m) { return { label: m.name + ' · ' + tr('tu nota: {0}', m.rating) }; })));
      }

      var f = r.first;
      if (f) {
        var what1 = f.type === 'series' && f.s ? f.name + ' ' + (String(f.id).indexOf('tt') === 0 ? Trakt.epCode(f.id, f.s, f.e) : tr('T{0}:E{1}', f.s, f.e)) : f.label || f.name;
        tiles([[yearDate(f.at), tr('lo primero que viste en {0}', r.y), what1]], 'wide');
      }
      if (Nav.root === root && !(Nav.cur && root.contains(Nav.cur))) Nav.setRoot(root, screen.initialFocus());
    }

    paintChips();
    show(cur);
    yearList().then(function (ys) {
      if (screen.closed) return;
      years = ys.indexOf(cur) < 0 ? ys.concat([cur]).sort(function (a, b) { return b - a; }) : ys;
      paintChips();
    }).catch(function () { /* se queda solo el año elegido */ });
    return screen;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // recuadro de Inicio (diciembre y enero): abre el resumen del año; paint() lo pone al día al volver
  function yearTile(container) {
    var y = wrappedYear();
    var row = el('div', 'row');
    var b = el('div', 'yr-banner', '<div class="yr-banner-t"></div><div class="yr-banner-s"></div>');
    focusable(b, function () { push(yearScreen(y)); });
    row.appendChild(b);
    container.appendChild(row);
    container._paint = function () {
      b.firstChild.textContent = tr('Tu {0} en StremTV', y);
      var r = yearKnown(y);
      b.lastChild.textContent = r && r.plays ? tr('{0} horas, {1} películas y {2} episodios. Y alguna sorpresa más.', yearHours(r.min), r.movies, r.episodes)
        : tr('Tus horas, tus series, tu racha más larga y tu día de maratón');
    };
    container._paint();
  }

  // ---------------------------------------------------------------- arranque

  var VERSION = '0.27.0';

  function fitScreen() {
    var z = window.innerWidth / 1920;
    document.body.style.zoom = Math.abs(z - 1) > 0.01 ? z : '';
  }

  // registro de arranque (últimos 5) para medir en la tele dónde se va el tiempo
  function bootMark(name) {
    var b = window.__boot;
    if (!b || b[name]) return;
    b[name] = Date.now();
    if (name !== 'firstRow') return;
    logEv('arranque', VERSION + ' · ' + b.src, { cargador: b.loader - b.nav, app: b.app - b.nav, primeraFila: b.firstRow - b.nav });
    var log = load('boot', []);
    log.unshift({ at: new Date(b.nav || b.loader).toISOString(), src: b.src, loader: b.loader - b.nav, app: b.app - b.nav, firstRow: b.firstRow - b.nav });
    save('boot', log.slice(0, 5));
  }

  function autoMeasure() {
    if (settings.maxRate !== 'auto' || Date.now() - (settings.measuredAt || 0) < 7 * 86400000) return;
    setTimeout(function () {
      measureSpeed().then(function (mbps) {
        settings.measuredMbps = mbps;
        settings.measuredAt = Date.now();
        saveSettings();
      }).catch(function () { /* se reintenta en el próximo arranque */ });
    }, 15000);
  }

  function start() {
    bootMark('app');
    // la app se cerró con el sonido quitado mientras esperaba la pista de audio: devolverlo
    if (load('muted', false)) { try { tizen.tvaudiocontrol.setMute(false); } catch (e) { /* sin permiso */ } save('muted', false); }
    autoMeasure();
    refreshAddons();
    autoBackup();
    startQueue();
    fitScreen();
    window.addEventListener('resize', fitScreen);
    registerKeys();
    document.documentElement.lang = settings.lang;
    push(homeScreen());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // exponer para depurar desde la consola
  window.StremTV = { bootLog: function () { return load('boot', []); }, settings: settings, Player: Player, Saver: Saver, Nav: Nav, Trakt: Trakt, stack: stack, toast: function (m, ms) { toast(tr(m), ms); }, open: function (type, id) { push(detailScreen(type, id)); }, openMeta: openMeta, openSettings: openSettings, checkQueue: checkQueue };
})();
