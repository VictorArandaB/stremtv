/* StremTV — cliente ligero tipo Stremio para Samsung Tizen 3+.
   Escrito en ES5 (sin let/const, flechas, plantillas, find, assign...) porque
   el motor web de Tizen 3.0 es Chromium ~47. */
(function () {
  'use strict';

  var CINEMETA = 'https://v3-cinemeta.strem.io';
  var ANIME = 'https://anime-kitsu.strem.fun'; // catálogo de anime (Kitsu, acepta IDs de AniDB/MAL/AniList)
  var TORRENTIO = 'https://torrentio.strem.fun';
  var SUBS_ADDON = 'https://opensubtitles-v3.strem.io';
  // el certificado con el que se firma la app (y la Tizen Developers CA) caduca ese día: actualizar al volver a firmarla
  var CERT_EXPIRES = new Date(2027, 0, 1);
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
        try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(new Error(tr('respuesta no válida'))); }
      };
      x.onerror = function () { reject(new Error(tr('sin conexión'))); };
      x.ontimeout = function () { reject(new Error(tr('tiempo de espera agotado'))); };
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

  // ---------------------------------------------------------------- idioma de la app

  // Los textos se escriben en español; EN da su traducción. {0}, {1}… se sustituyen por los argumentos.
  var LANGS = { es: 'Español', en: 'English' };
  var EN = {
    // general
    'respuesta no válida': 'invalid response', 'sin conexión': 'no connection', 'tiempo de espera agotado': 'timed out',
    'medida no válida': 'invalid measurement', 'sin datos': 'no data',
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
    '✓ En mi lista': '✓ In my list', '＋ Mi lista': '＋ My list',
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
    '↺ Como el anterior': '↺ Same as before', '⚡ Instantáneo': '⚡ Instant', 'Descargar en debrid': 'Download on debrid',
    ' · pesada': ' · heavy', '✗ Falló': '✗ Failed',
    'No se pudieron obtener las fuentes ({0}). Pulsa Atrás e inténtalo de nuevo.': 'Could not get sources ({0}). Press Back and try again.',
    // reproductor
    'Conectando con {0}…': 'Connecting to {0}…',
    'OK pausa · ◀ ▶ avanzar/retroceder · ▲ subtítulos · ▼ audio · Atrás salir': 'OK pause · ◀ ▶ seek · ▲ subtitles · ▼ audio · Back exit',
    '{0} ha bloqueado el acceso desde Torrentio. Revisa tu correo o la sección de autorizaciones de tu cuenta y aprueba el acceso.':
      '{0} has blocked access from Torrentio. Check your email or the authorizations section of your account and approve it.',
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
    'Error inesperado de Torrentio. Prueba otra fuente.': 'Unexpected Torrentio error. Try another source.',
    'Aviso de Torrentio: {0}': 'Torrentio notice: {0}',
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
    'Si cambias la pista con ▼ en una serie, se recuerda para el resto de episodios (y la fuente que elijas, también).':
      'If you change the track with ▼ in a show, it is remembered for the rest of the episodes (and so is the source you pick).',
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
    'Ninguno añadido. Torrentio, Cinemeta, Kitsu y OpenSubtitles ya vienen incluidos.': 'None added. Torrentio, Cinemeta, Kitsu and OpenSubtitles are built in.',
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
    ' · Catálogo: Cinemeta · Fuentes: Torrentio · Subtítulos: OpenSubtitles · Reproductor: {0}':
      ' · Catalog: Cinemeta · Sources: Torrentio · Subtitles: OpenSubtitles · Player: {0}'
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
    subLang: 'spa', subSize: 'normal', autoNext: true, audioLang: 'spa', lang: 'es', quickPlay: true, subBg: true
  };
  var settings = extend(extend({}, DEFAULTS), load('settings', {}));
  function saveSettings() { save('settings', settings); }

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

  var SUB_NAMES = { spa: 'Español', eng: 'Inglés', off: 'Desactivados' };
  var LANG_NAMES = { spa: 'Español', eng: 'Inglés', fre: 'Francés', ger: 'Alemán', ita: 'Italiano', por: 'Portugués',
    jpn: 'Japonés', kor: 'Coreano', cat: 'Catalán' };
  // idiomas que se pueden elegir como audio preferido (orig = el que traiga el archivo por defecto)
  var AUDIO_LANGS = ['spa', 'eng', 'fre', 'ger', 'ita', 'por', 'jpn', 'kor', 'cat', 'orig'];

  // código de idioma de una pista (es, spa, Spanish, cas… → spa; fr, fra, French → fre…)
  var LANG_RE = {
    spa: /^(es($|[-_])|spa|esp|spanish|cas|lat)/, eng: /^(en($|[-_])|eng)/, fre: /^(fr($|[-_])|fre|fra)/,
    ger: /^(de($|[-_])|ger|deu)/, ita: /^(it($|[-_])|ita)/, por: /^(pt($|[-_])|por)/,
    jpn: /^(ja($|[-_])|jpn|jap)/, kor: /^(ko($|[-_])|kor)/, cat: /^(ca($|[-_])|cat)/
  };
  function langKey(l) {
    l = String(l || '').toLowerCase();
    for (var k in LANG_RE) if (LANG_RE[k].test(l)) return k;
    return l === 'und' ? '' : l.slice(0, 3);
  }

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

  // ---------------------------------------------------------------- addons de Stremio añadidos en Ajustes

  // [{ url: base sin /manifest.json, manifest: {id, name, resources, types, idPrefixes, catalogs} }]
  var addons = load('addons', []);
  var BUILTIN_ADDONS = ['com.stremio.torrentio.addon', 'com.linvo.cinemeta', 'org.stremio.opensubtitlesv3'];

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
      x.onerror = function () { reject(new Error(tr('sin conexión'))); };
      x.ontimeout = function () { reject(new Error(tr('tiempo de espera agotado'))); };
      x.send(body ? JSON.stringify(body) : null);
    });
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
      if (!Trakt.linked()) return Promise.reject(new Error(tr('Trakt no vinculado')));
      return Trakt.ensureFresh().then(function () { return traktReq(method, path, body); }).catch(function (e) {
        if (e.status === 401) { trakt.access = ''; saveTrakt(); toast(tr('La sesión de Trakt ha caducado. Vuelve a vincularla en Ajustes.')); }
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
      return Trakt.call('GET', '/sync/watchlist?limit=500').then(function (items) {
        Trakt.watchlist = {};
        var metas = [];
        (items || []).forEach(function (it) {
          var o = it.movie || it.show;
          if (!o || !o.ids || !o.ids.imdb) return; // sin IMDb, Cinemeta y Torrentio no lo encuentran
          Trakt.watchlist[o.ids.imdb] = true;
          metas.push({ id: o.ids.imdb, type: it.movie ? 'movie' : 'series', name: o.title, poster: metahubPoster(o.ids.imdb) });
        });
        return metas;
      });
    },

    // series empezadas con episodios ya emitidos pendientes, de la vista más recientemente a la más antigua (el «Up Next» de Trakt).
    // Se guarda 10 minutos (o hasta terminar de ver algo): son muchas consultas
    upNextCache: null,
    upNext: function () {
      var c = Trakt.upNextCache;
      if (c && Date.now() - c.at < 600000) return c.promise;
      var promise = Promise.all([
        Trakt.call('GET', '/sync/watched/shows?extended=full'),
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
        // todas las series (no solo las recientes), como mucho 6 consultas a la vez para no saturar la tele ni Trakt
        return mapLimit(shows, 6, function (it) {
          var sh = it.show;
          return Trakt.call('GET', '/shows/' + sh.ids.trakt + '/progress/watched?hidden=false&specials=false&count_specials=false&extended=full').then(function (d) {
            var e = d && d.next_episode;
            if (!e || (d.aired && d.completed >= d.aired)) return null; // al día: lo «siguiente» aún no se ha emitido
            if (e.first_aired && new Date(e.first_aired) > new Date()) return null;
            return { id: sh.ids.imdb, type: 'series', name: sh.title, poster: metahubPoster(sh.ids.imdb),
              label: sh.title + ' · ' + tr('T{0}:E{1}', e.season, e.number) };
          }).catch(function () { return null; });
        });
      }).then(function (list) { return list.filter(Boolean); });
      Trakt.upNextCache = { at: Date.now(), promise: promise };
      promise.catch(function () { Trakt.upNextCache = null; });
      return promise;
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
              label: it.show.title + ' · ' + tr('T{0}:E{1}', it.episode.season, it.episode.number) });
          }
        });
        return out;
      });
    },

    // episodios de tus series de hace dos días a una semana vista
    calendar: function () {
      var d = new Date(Date.now() - 2 * 86400000);
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var start = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      return Trakt.call('GET', '/calendars/my/shows/' + start + '/10').then(function (items) {
        return (items || []).filter(function (it) { return it.show && it.show.ids && it.show.ids.imdb && it.episode; }).map(function (it) {
          var imdb = it.show.ids.imdb;
          return { id: imdb, type: 'series', name: it.show.title, poster: metahubPoster(imdb),
            label: dayLabel(new Date(it.first_aired)) + ' · ' + it.show.title + ' ' + tr('T{0}:E{1}', it.episode.season, it.episode.number) };
        });
      });
    },

    recommendations: function (kind) {
      return Trakt.call('GET', '/recommendations/' + kind + '?limit=30&ignore_collected=true').then(function (items) {
        return (items || []).filter(function (o) { return o.ids && o.ids.imdb; }).map(function (o) {
          return { id: o.ids.imdb, type: kind === 'movies' ? 'movie' : 'series', name: o.title, poster: metahubPoster(o.ids.imdb) };
        });
      });
    },

    // películas vistas y series sin episodios emitidos pendientes
    loadWatched: function () {
      return Promise.all([
        Trakt.call('GET', '/sync/watched/movies'),
        Trakt.call('GET', '/sync/watched/shows?extended=full')
      ]).then(function (r) {
        var movies = {}, shows = {};
        (r[0] || []).forEach(function (it) { if (it.movie && it.movie.ids && it.movie.ids.imdb) movies[it.movie.ids.imdb] = true; });
        (r[1] || []).forEach(function (it) {
          var sh = it.show;
          if (!sh || !sh.ids || !sh.ids.imdb) return;
          var n = 0;
          (it.seasons || []).forEach(function (se) { if (se.number > 0) n += (se.episodes || []).length; });
          if (sh.aired_episodes && n >= sh.aired_episodes) shows[sh.ids.imdb] = true;
        });
        Seen.movies = movies;
        Seen.shows = shows;
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

  // ---------------------------------------------------------------- copia de seguridad en un Gist secreto de GitHub

  var BACKUP_KEYS = ['settings', 'trakt', 'progress', 'suboffsets', 'srcprefs', 'addons', 'explore'];
  var BACKUP_DESC = 'StremTV · copia de seguridad';
  var BACKUP_FILE = 'stremtv.json';
  var backup = load('backup', {}); // token, gistId, at (última copia), err
  function saveBackup() { save('backup', backup); }

  function ghReq(method, path, body) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method, 'https://api.github.com' + path, true);
      x.timeout = 20000;
      x.setRequestHeader('Accept', 'application/vnd.github+json');
      x.setRequestHeader('Authorization', 'token ' + backup.token);
      if (body) x.setRequestHeader('Content-Type', 'application/json');
      x.onload = function () {
        var d = null;
        try { d = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { /* respuesta vacía */ }
        if (x.status >= 200 && x.status < 300) return resolve(d);
        reject(new Error(x.status === 401 ? tr('el token de GitHub no es válido') :
          x.status === 403 || x.status === 404 ? tr('el token no tiene permiso para Gists') : 'GitHub ' + x.status));
      };
      x.onerror = function () { reject(new Error(tr('sin conexión'))); };
      x.ontimeout = function () { reject(new Error(tr('tiempo de espera agotado'))); };
      x.send(body ? JSON.stringify(body) : null);
    });
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
    return findBackupGist().then(function (id) {
      if (id) {
        return ghReq('PATCH', '/gists/' + id, { files: files }).catch(function (e) {
          backup.gistId = ''; // borrado desde GitHub: crear otro
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

  function isSeenMeta(m) {
    var id = String(m.id || '');
    var imdb = m.imdb_id || (id.indexOf('tt') === 0 ? id : null);
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
  function promiseRow(container, title, promise, onPick, hideIfEmpty, max) {
    var row = el('div', 'row');
    row.appendChild(el('div', 'row-title', esc(title)));
    row.appendChild(el('div', 'empty', tr('Cargando…')));
    container.appendChild(row);
    promise.then(function (metas) {
      bootMark('firstRow');
      if (!row.parentNode) return;
      metas = (metas || []).slice(0, max || 40);
      if (!metas.length && hideIfEmpty) { container.removeChild(row); return; }
      var hadFocus = Nav.cur && row.contains(Nav.cur);
      var fresh = metas.length
        ? posterRow(title, metas, onPick, metas.map(function (m) { return m.pct || m.label ? { pct: m.pct, label: m.label } : null; }))
        : el('div', 'row', '<div class="row-title">' + esc(title) + '</div><div class="empty">' + tr('Sin resultados') + '</div>');
      container.replaceChild(fresh, row);
      if (hadFocus) Nav.setRoot(Nav.root);
    }).catch(function (e) {
      if (hideIfEmpty && row.parentNode) { container.removeChild(row); return; }
      row.lastChild.textContent = tr('No se pudo cargar ({0})', e.message);
    });
  }

  function asyncRow(container, title, url, onPick) {
    promiseRow(container, title, Promise.all([getJSON(url), seenReady()]).then(function (r) {
      return filterSeen(r[0].metas || []);
    }), onPick);
  }

  function openMeta(meta) {
    var id = String(meta.id || meta.metaId || '');
    if (meta.imdb_id && id.indexOf('tt') !== 0 && id.indexOf('kitsu:') !== 0) id = meta.imdb_id;
    push(detailScreen(meta.type === 'anime' && id.indexOf('tt') === 0 ? 'series' : meta.type, id));
  }

  // ---------------------------------------------------------------- pantalla: inicio

  function header(active) {
    var h = el('div', 'header');
    h.appendChild(el('div', 'logo', 'StremTV'));
    [['home', 'Inicio'], ['anime', 'Anime'], ['explore', 'Explorar'], ['search', 'Buscar'], ['settings', 'Ajustes']].forEach(function (t) {
      var tab = el('div', 'tab', tr(t[1]));
      focusable(tab, function () {
        if (t[0] === active) return;
        if (t[0] === 'search') push(searchScreen());
        else if (t[0] === 'anime') push(animeScreen());
        else if (t[0] === 'explore') push(exploreScreen());
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
        var b = el('div', 'btn primary', tr('Configura tu Real-Debrid o AllDebrid para poder reproducir'));
        b.style.marginLeft = '80px';
        focusable(b, function () { push(settingsScreen()); });
        warn.appendChild(b);
        contWrap.appendChild(warn);
      }
      if (CERT_EXPIRES - Date.now() < 30 * 86400000) {
        var cw = el('div', 'row');
        cw.appendChild(el('div', 'note cert-warn', esc(tr('⚠ El certificado de StremTV caduca el {0}. Si deja de abrirse, hay que volver a firmarla e instalarla desde el Mac.', fmtDate(CERT_EXPIRES)))));
        contWrap.appendChild(cw);
      }
      var cont = continueList();
      if (cont.length) {
        contWrap.appendChild(posterRow(tr('Continuar viendo'), cont.map(function (p) {
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
      var paused = Trakt.playback().then(function (items) {
        var seen = {};
        return items.filter(function (m) {
          if (local[m.id] || seen[m.id]) return false; // ya está en «Continuar viendo»
          seen[m.id] = true;
          return true;
        });
      });
      promiseRow(traktWrap, tr('Continuar (Trakt)'), paused, openMeta, true);
      // series con el siguiente episodio pendiente (sin repetir las que ya salen arriba)
      promiseRow(traktWrap, tr('Siguientes episodios'), Promise.all([Trakt.upNext(), paused.catch(function () { return []; })]).then(function (r) {
        var above = {};
        r[1].forEach(function (m) { above[m.id] = true; });
        return r[0].filter(function (m) { return !local[m.id] && !above[m.id]; });
      }), openMeta, true, 100);
      promiseRow(traktWrap, tr('Esta semana en tus series'), Trakt.calendar(), openMeta, true);
      var wl = Trakt.loadWatchlist();
      promiseRow(traktWrap, tr('Mi lista: películas'), wl.then(function (m) { return m.filter(function (x) { return x.type === 'movie'; }); }), openMeta, true, 100);
      promiseRow(traktWrap, tr('Mi lista: series'), wl.then(function (m) { return m.filter(function (x) { return x.type === 'series'; }); }), openMeta, true, 100);
      var seenThen = function (pr) { return Promise.all([pr, seenReady()]).then(function (r) { return filterSeen(r[0]); }); };
      promiseRow(traktWrap, tr('Recomendadas para ti: películas'), seenThen(Trakt.recommendations('movies')), openMeta, true);
      promiseRow(traktWrap, tr('Recomendadas para ti: series'), seenThen(Trakt.recommendations('shows')), openMeta, true);
    }
    renderTrakt();

    asyncRow(vs, tr('Películas populares'), CINEMETA + '/catalog/movie/top.json', openMeta);
    asyncRow(vs, tr('Series populares'), CINEMETA + '/catalog/series/top.json', openMeta);
    asyncRow(vs, tr('Películas mejor valoradas'), CINEMETA + '/catalog/movie/imdbRating.json', openMeta);
    asyncRow(vs, tr('Series mejor valoradas'), CINEMETA + '/catalog/series/imdbRating.json', openMeta);
    // catálogos de los addons añadidos: como mucho 4 filas por addon para no llenar el inicio
    var perAddon = {};
    addonCatalogs(false).forEach(function (c) {
      var n = perAddon[c.addon.url] = (perAddon[c.addon.url] || 0) + 1;
      if (n > 4) return;
      // si el catálogo viene vacío o el addon falla, la fila desaparece
      promiseRow(vs, c.title, Promise.all([getJSON(c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '.json'), seenReady()]).then(function (r) {
        return filterSeen(r[0].metas || []);
      }), openMeta, true);
    });

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
    asyncRow(vs, tr('En emisión esta temporada'), ANIME + '/catalog/anime/kitsu-anime-airing.json', openMeta);
    asyncRow(vs, tr('Tendencias'), ANIME + '/catalog/anime/kitsu-anime-trending.json', openMeta);
    asyncRow(vs, tr('Más populares'), ANIME + '/catalog/anime/kitsu-anime-popular.json', openMeta);
    asyncRow(vs, tr('Mejor valorados'), ANIME + '/catalog/anime/kitsu-anime-rating.json', openMeta);
    return { el: root, initialFocus: function () { return vs.querySelectorAll('.tab')[1]; } };
  }

  // ---------------------------------------------------------------- pantalla: explorar (tipo, género, año)

  var GENRES = ['Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
    'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'];
  var GENRES_ES = { Action: 'Acción', Adventure: 'Aventura', Animation: 'Animación', Biography: 'Biografía', Comedy: 'Comedia',
    Crime: 'Crimen', Documentary: 'Documental', Drama: 'Drama', Family: 'Familia', Fantasy: 'Fantasía', History: 'Historia',
    Horror: 'Terror', Mystery: 'Misterio', Romance: 'Romance', 'Sci-Fi': 'Ciencia ficción', Sport: 'Deporte', Thriller: 'Suspense',
    War: 'Bélica', Western: 'Western' };

  function exploreScreen() {
    var f = extend({ type: 'movie', genre: '', year: '', sort: 'top' }, load('explore', {}));
    var root = el('div', 'screen');
    var vs = el('div', 'vscroll');
    root.appendChild(vs);
    vs.appendChild(header('explore'));
    var filters = el('div');
    vs.appendChild(filters);
    var results = el('div', 'grid');
    vs.appendChild(results);
    var cards = [], fetched = 0, loading = false, more = null, emptyPages = 0, gen = 0;

    function chips(title, values, key, label) {
      var row = el('div', 'row chips-row');
      row.appendChild(el('div', 'row-title', esc(title)));
      var sc = el('div', 'hscroll chips');
      sc.style.position = 'relative';
      values.forEach(function (v) {
        var b = el('div', 'btn' + (f[key] === v ? ' primary' : ''), esc(label(v)));
        focusable(b, function () {
          if (f[key] === v) return;
          f[key] = v;
          save('explore', f);
          Array.prototype.forEach.call(sc.children, function (x) { x.classList.remove('primary'); });
          b.classList.add('primary');
          reload();
        });
        sc.appendChild(b);
        if (f[key] === v) sc._last = b; // al bajar a esta fila, ir a la opción elegida
      });
      row.appendChild(sc);
      filters.appendChild(row);
    }

    var years = [''];
    for (var y = new Date().getFullYear(); y >= 1987; y--) years.push(String(y));
    chips(tr('Tipo'), ['movie', 'series'], 'type', function (v) { return v === 'movie' ? tr('Películas') : tr('Series'); });
    chips(tr('Género'), [''].concat(GENRES), 'genre', function (v) { return !v ? tr('Todos') : settings.lang === 'en' ? v : GENRES_ES[v] || v; });
    chips(tr('Año'), years, 'year', function (v) { return v || tr('Todos'); });
    chips(tr('Orden'), ['top', 'imdbRating'], 'sort', function (v) { return v === 'top' ? tr('Populares') : tr('Mejor valoradas'); });

    // Cinemeta no combina género y año: con año se pide el catálogo del año y el género se filtra aquí
    function url() {
      var extra = [];
      if (f.year) extra.push('genre=' + f.year);
      else if (f.genre) extra.push('genre=' + encodeURIComponent(f.genre));
      if (fetched) extra.push('skip=' + fetched);
      return CINEMETA + '/catalog/' + f.type + '/' + (f.year ? 'year' : f.sort) + (extra.length ? '/' + extra.join('&') : '') + '.json';
    }

    function reload() {
      results.innerHTML = '';
      cards = []; fetched = 0; more = null; emptyPages = 0;
      loading = false;
      gen++; // las respuestas de los filtros anteriores se descartan
      loadPage();
    }

    function loadPage() {
      if (loading) return;
      loading = true;
      var hadFocus = more && Nav.cur === more;
      if (more && more.parentNode) more.parentNode.removeChild(more);
      more = null;
      var status = el('div', 'empty', tr('Cargando…'));
      results.appendChild(status);
      var g = gen, first = cards.length;
      Promise.all([getJSON(url()), seenReady()]).then(function (r) {
        if (g !== gen) return; // filtros cambiados mientras cargaba
        loading = false;
        results.removeChild(status);
        var raw = r[0].metas || [];
        fetched += raw.length;
        var metas = filterSeen(raw);
        if (f.year && f.genre) metas = metas.filter(function (m) { return (m.genre || m.genres || []).indexOf(f.genre) >= 0; });
        if (f.year && f.sort === 'imdbRating') metas.sort(function (a, b) { return (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0); });
        metas.forEach(function (m) {
          var i = cards.length;
          var c = card(m, function () { openMeta(m); });
          c._onfocus = function () { loadImages(cards, i + 14); };
          cards.push(c);
          results.appendChild(c);
        });
        loadImages(cards, first + 13);
        var hasMore = raw.length >= 20;
        // con año y género puede que una página entera no tenga ninguno: seguir buscando un poco
        if (!metas.length && hasMore && ++emptyPages < 4) { loadPage(); return; }
        if (hasMore) {
          more = el('div', 'btn', tr('Cargar más'));
          focusable(more, loadPage);
          results.appendChild(more);
        }
        if (!cards.length) results.appendChild(el('div', 'empty', tr('Sin resultados')));
        if (hadFocus) Nav.focus(cards[first] || more);
      }).catch(function (e) {
        if (g !== gen) return;
        loading = false;
        status.textContent = tr('No se pudo cargar ({0})', e.message);
      });
    }
    loadPage();

    return { el: root, initialFocus: function () { return vs.querySelectorAll('.tab')[2]; } };
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
    input.placeholder = tr('Título de película o serie…');
    focusable(input, function () { input.focus(); });
    input._ondone = function (q) { run(q); };
    box.appendChild(input);
    vs.appendChild(box);
    vs.appendChild(el('div', 'hint', tr('Pulsa OK para escribir y confirma con «Hecho».')));
    var results = el('div');
    vs.appendChild(results);

    function run(q) {
      q = (q || '').replace(/^\s+|\s+$/g, '');
      results.innerHTML = '';
      if (!q) return;
      var enc = encodeURIComponent(q);
      asyncRow(results, tr('Películas'), CINEMETA + '/catalog/movie/top/search=' + enc + '.json', openMeta);
      asyncRow(results, tr('Series'), CINEMETA + '/catalog/series/top/search=' + enc + '.json', openMeta);
      asyncRow(results, tr('Anime'), ANIME + '/catalog/anime/kitsu-anime-list/search=' + enc + '.json', openMeta);
      addonCatalogs(true).forEach(function (c) {
        asyncRow(results, c.title, c.addon.url + '/catalog/' + c.catalog.type + '/' + c.catalog.id + '/search=' + enc + '.json', openMeta);
      });
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
    d.appendChild(el('div', 'loading', tr('Cargando…')));
    root.appendChild(d);
    var screen = { el: root };
    var meta = null, curSeason = null, episodesBox = null, actions = null;
    var traktSeen = {}, traktNext = null, showSeen = false, progressRequested = false;

    function watchlistButton(container) {
      if (!Trakt.linked()) return;
      var b = el('div', 'btn');
      var imdb = imdbOf();
      if (!imdb) return; // anime sin correspondencia en IMDb: Trakt no lo puede identificar
      var paint = function () { b.textContent = Trakt.watchlist[imdb] ? tr('✓ En mi lista') : tr('＋ Mi lista'); };
      paint();
      focusable(b, function () {
        Trakt.toggleWatchlist(type, imdb).then(function (added) {
          paint();
          toast(added ? tr('Añadido a tu lista de Trakt') : tr('Quitado de tu lista de Trakt'));
        }).catch(function (e) { toast('Trakt: ' + e.message); });
      });
      container.appendChild(b);
    }

    var isAnime = String(id).indexOf('kitsu:') === 0;
    function imdbOf() { return meta.imdb_id || (String(meta.id).indexOf('tt') === 0 ? meta.id : null); }

    var metaFrom = isAnime ? ANIME + '/meta/anime/' + id + '.json' : CINEMETA + '/meta/' + type + '/' + id + '.json';
    if (!isAnime && String(id).indexOf('tt') !== 0) {
      var own = addonsFor('meta', type, id)[0];
      metaFrom = own ? own.url + '/meta/' + type + '/' + id + '.json' : null;
    }
    (metaFrom ? getJSON(metaFrom) : Promise.reject(new Error(tr('sin datos')))).then(function (res) {
      meta = res.meta;
      if (!meta) throw new Error(tr('sin datos'));
      if (isAnime) type = meta.type === 'movie' ? 'movie' : 'series';
      render();
    }).catch(function (e) {
      d.innerHTML = '';
      d.appendChild(el('div', 'loading', esc(tr('No se pudo cargar ({0})', e.message))));
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
      return { type: type, metaId: meta.id, imdb: imdbOf(), name: meta.name, poster: meta.poster, background: meta.background,
        runtime: parseRuntime(meta.runtime) };
    }

    function renderMovieActions() {
      actions.innerHTML = '';
      var p = progress[meta.id];
      var play = el('div', 'btn primary', p && !p.done && p.t > 60 ? tr('▶ Continuar ({0})', fmtTime(p.t)) : tr('▶ Ver'));
      focusable(play, function () {
        push(streamsScreen(extend(base(), { videoId: meta.id, label: meta.name, startAt: p && !p.done ? p.t : 0, autoPlay: settings.quickPlay })));
      });
      actions.appendChild(play);
      if (p && !p.done && p.t > 60) {
        var fromStart = el('div', 'btn', tr('Desde el principio'));
        focusable(fromStart, function () {
          push(streamsScreen(extend(base(), { videoId: meta.id, label: meta.name, startAt: 0, autoPlay: settings.quickPlay })));
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
        runtime: parseRuntime(v.runtime) || parseRuntime(meta.runtime),
        next: function () { var n = nextEpisode(v); return n ? epCtx(n) : null; }
      });
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

      // fila superior: mi lista y mostrar/ocultar vistos
      var top = el('div');
      watchlistButton(top);
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
        Trakt.showProgress(imdbOf()).then(function (tp) {
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
        }).catch(function () { /* sin datos de Trakt */ });
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

    function renderEpisodes(eps) {
      episodesBox.innerHTML = '';
      episodesBox.scrollTop = 0;
      var focusTarget = null;
      if (hidingSeen()) eps = eps.filter(function (v) { return !isSeenEp(v); });
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
        var epTitle = v.name || v.title || tr('Episodio {0}', v.episode);
        var seen = (p && p.done) || traktSeen[traktKey(v)];
        txt.appendChild(el('div', 'ep-title', esc(v.episode + '. ' + epTitle) + (seen ? ' <span class="badge ok">' + tr('Visto') + '</span>' : '')));
        var date = v.released ? new Date(v.released) : null;
        var sub = [];
        if (date && !isNaN(date)) sub.push(date.toLocaleDateString ? fmtDate(date) : date.toDateString());
        if (p && !p.done && p.t > 60) sub.push(tr('Continuar desde {0}', fmtTime(p.t)));
        txt.appendChild(el('div', 'ep-sub', esc(sub.join(' · '))));
        row.appendChild(txt);
        focusable(row, function () { push(streamsScreen(extend(epCtx(v), { autoPlay: settings.quickPlay }))); });
        episodesBox.appendChild(row);
        if (!focusTarget && ((p && !p.done) || traktNext === traktKey(v))) focusTarget = row;
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

  // Formato a partir del nombre del archivo; risk alto = probable error de descodificación
  function mediaInfo(name) {
    var hevc = /x\.?265|h\.?265|hevc/i.test(name);
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
    return { hevc: hevc, av1: av1, dv: dv, tenbit: tenbit, dts: dts, h264: !hevc && !av1, risk: risk };
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
    var ids = Object.keys(srcPrefs);
    if (ids.length > 100) {
      ids.sort(function (a, b) { return srcPrefs[a].ts - srcPrefs[b].ts; });
      for (var i = 0; i < ids.length - 100; i++) delete srcPrefs[ids[i]];
    }
    save('srcprefs', srcPrefs);
  }
  // 4 = mismo torrent (pack de temporada), 2 = mismo bingeGroup de Torrentio, 1 = mismo grupo
  function prefScore(s, pref) {
    if (!pref) return 0;
    return (pref.hash && s.hash === pref.hash ? 4 : 0) + (pref.binge && s.binge === pref.binge ? 2 : 0) +
      (pref.group && s.group === pref.group ? 1 : 0);
  }

  function streamsScreen(ctx) {
    var root = el('div', 'screen');
    root.appendChild(el('div', 'screen-title', esc(ctx.label)));
    var sub = el('div', 'screen-sub', tr('Buscando fuentes…'));
    root.appendChild(sub);
    var list = el('div', 'list vscroll');
    list.setAttribute('data-pad', '0');
    root.appendChild(list);
    var screen = { el: root, streamsOf: ctx.videoId };

    function message(text, withSettings) {
      list.innerHTML = '';
      list.appendChild(el('div', 'loading', esc(text)));
      if (withSettings) {
        var b = el('div', 'btn primary', tr('Abrir ajustes'));
        focusable(b, function () { push(settingsScreen()); });
        list.appendChild(b);
      }
      Nav.setRoot(root);
    }

    function fetchStreams() {
      sub.textContent = tr('Buscando fuentes…');
      var fromAddons = Promise.all(addonsFor('stream', ctx.type, ctx.videoId).map(function (a) {
        return getJSON(a.url + '/stream/' + ctx.type + '/' + ctx.videoId + '.json').then(function (d) {
          return (d.streams || []).map(function (x) { var st = parseStream(x); st.addon = a.manifest.name; return st; })
            .filter(function (st) { return st.url && !st.error; });
        }).catch(function () { return []; }); // un addon caído no estropea el resto
      }));
      var fromTorrentio = getJSON(torrentioBase() + '/stream/' + ctx.type + '/' + ctx.videoId + '.json').catch(function (e) { return { failed: e }; });
      Promise.all([fromTorrentio, fromAddons]).then(function (r) {
        var d = r[0], extra = [].concat.apply([], r[1]);
        if (d.failed && !extra.length) throw d.failed;
        var streams = (d.streams || []).map(parseStream);
        if (streams.length === 1 && streams[0].error && !extra.length) {
          sub.textContent = '';
          return message(tr('La clave de {0} no es válida o ha caducado.', DEBRID_NAMES[settings.debrid]) + ' ' +
            (streams[0].raw.title || ''), true);
        }
        if (!settings.key && !extra.length) {
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
        // orden: primero lo que la tele puede reproducir y cabe en la conexión, después español, después Torrentio
        var tier = function (x) { return (x.heavy ? 3 : 0) + (!settings.compatFirst ? 0 : x.media.risk <= 1 ? 0 : x.media.risk <= 3 ? 1 : 2); };
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
        var auto = null;
        streams.forEach(function (s) {
          var row = el('div', 'stream');
          row.appendChild(el('div', 'q', esc(s.quality)));
          var info = el('div', 'info');
          var badges = '';
          if (s.pref >= 2) badges += '<span class="badge ok">' + tr('↺ Como el anterior') + '</span>';
          if (s.addon) badges += '<span class="badge addon">' + esc(s.addon) + '</span>';
          if (s.cached) badges += '<span class="badge ok">' + tr('⚡ Instantáneo') + '</span>';
          else if (s.download) badges += '<span class="badge">' + tr('Descargar en debrid') + '</span>';
          if (s.es) badges += '<span class="badge es">ES</span>';
          var m = s.media;
          if (m.av1) badges += '<span class="badge warn">AV1</span>';
          else if (m.hevc) badges += '<span class="badge' + (Codecs.hevc ? '' : ' warn') + '">HEVC</span>';
          else badges += '<span class="badge ok">H.264</span>';
          if (m.dv) badges += '<span class="badge warn">Dolby Vision</span>';
          else if (m.tenbit) badges += '<span class="badge' + (Codecs.hevc10 ? '' : ' warn') + '">10-bit/HDR</span>';
          if (m.dts) badges += '<span class="badge' + (Codecs.dts ? '' : ' warn') + '">DTS/TrueHD</span>';
          if (s.mbps) badges += '<span class="badge' + (s.heavy ? ' warn' : '') + '">~' + num(s.mbps) + ' Mb/s' + (s.heavy ? tr(' · pesada') : '') + '</span>';
          info.appendChild(el('div', 't1', badges + esc(s.file)));
          info.appendChild(el('div', 't2', esc(s.stats + '   ' + s.langs)));
          row.appendChild(info);
          focusable(row, function () { Player.open(s, ctx, row); });
          list.appendChild(row);
          // reproducción directa: la misma release que antes en esta serie o, si no, la primera instantánea que quepa
          if (ctx.autoPlay && !auto && (s.pref >= 2 || (s.cached && !s.heavy))) auto = { s: s, row: row };
        });
        if (ctx.autoPlay && !auto) auto = { s: streams[0], row: list.firstChild };
        if (auto) {
          sub.textContent += tr(' · elegida automáticamente: pulsa OK en otra para cambiar');
          Nav.setRoot(root, auto.row);
          ctx.autoPlay = false; // al volver a esta lista no arrancar otra vez
          Player.open(auto.s, ctx, auto.row);
          return;
        }
        Nav.setRoot(root);
      }).catch(function (e) {
        sub.textContent = '';
        message(tr('No se pudieron obtener las fuentes ({0}). Pulsa Atrás e inténtalo de nuevo.', e.message));
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
    var ids = Object.keys(subOffsets);
    if (ids.length > 300) {
      ids.sort(function (a, b) { return subOffsets[a].ts - subOffsets[b].ts; });
      for (var i = 0; i < ids.length - 300; i++) delete subOffsets[ids[i]];
    }
    save('suboffsets', subOffsets);
  }

  var Subs = {
    cues: [], idx: 0, offset: 0, list: [], current: null, embedded: false, auto: false, manual: false,
    box: null,
    reset: function () {
      this.cues = []; this.idx = 0; this.offset = 0; this.list = []; this.current = null; this.embedded = false; this.auto = false; this.manual = false;
      this.box.textContent = '';
      this.box.className = (settings.subSize === 'big' ? 'big' : '') + (settings.subBg ? ' bg' : '');
    },
    fetchList: function (ctx) {
      var self = this;
      if (!ctx.imdb) { self.list = []; return Promise.resolve([]); }
      var sid = ctx.type === 'movie' ? ctx.imdb : ctx.imdb + ':' + ctx.imdbS + ':' + ctx.imdbE;
      var sources = [{ url: SUBS_ADDON, name: '' }].concat(addonsFor('subtitles', ctx.type, sid).map(function (a) { return { url: a.url, name: a.manifest.name }; }));
      return Promise.all(sources.map(function (src) {
        return getJSON(src.url + '/subtitles/' + ctx.type + '/' + sid + '.json').then(function (d) {
          return (d.subtitles || []).map(function (x) { return extend(extend({}, x), { lang: langKey(x.lang), addon: src.name }); });
        }).catch(function () { return []; });
      })).then(function (r) {
        var order = { spa: 0, eng: 1 };
        self.list = [].concat.apply([], r).filter(function (x) { return x.lang === 'spa' || x.lang === 'eng'; })
          .sort(function (a, b) { return order[a.lang] - order[b.lang]; }).slice(0, 30);
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

  // ---------------------------------------------------------------- reproductor

  var Player = {
    backend: null, ctx: null, stream: null,
    duration: 0, time: 0, paused: false, buffering: false,
    seekTarget: null, seekTimer: null, seekStep: 0, lastSeekKey: 0,
    osdTimer: null, tickTimer: null, saveTimer: null, startAt: 0, started: false,

    hasAV: function () {
      try { return !!(window.webapis && webapis.avplay && webapis.avplay.open); } catch (e) { return false; }
    },

    open: function (stream, ctx, row) {
      var self = this;
      this.ctx = ctx; this.stream = stream; this.row = row || null;
      this.duration = 0; this.time = 0; this.paused = false; this.started = false; this.lastPaused = null;
      this.finalUrl = null; this.probeText = ''; this.probeId = 0;
      this.startAt = ctx.startAt || 0;
      this.seekTarget = null;
      this.upNext = null; this.upNextOff = false; this.nextCtx = undefined; this.audioKey = '';
      $('#player').classList.remove('hidden');
      $('#osd-title').textContent = ctx.label;
      Subs.box = $('#subs');
      Subs.reset();
      this.syncMode = false;
      Subs.offset = subOffsets[ctx.videoId] ? subOffsets[ctx.videoId].o : 0;
      this.spinner(true, tr('Conectando con {0}…', DEBRID_NAMES[settings.debrid]));
      $('#osd-help').textContent = tr('OK pausa · ◀ ▶ avanzar/retroceder · ▲ subtítulos · ▼ audio · Atrás salir');
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

      // Torrentio redirige a un vídeo de aviso cuando el debrid falla: comprobarlo antes de reproducir
      this.resolve(stream.url).then(function (finalUrl) {
        if (self.stream !== stream) return;
        self.finalUrl = finalUrl;
        if (self.hasAV()) self.openAV(finalUrl); else self.openHTML(finalUrl);
      }, function (msg) {
        if (self.stream === stream) self.fail(msg);
      });

      Subs.fetchList(ctx).then(function (list) {
        if (self.ctx !== ctx || settings.subLang === 'off' || self.skipAutoSubs() || Subs.embedded || Subs.manual) return;
        for (var i = 0; i < list.length; i++) {
          if (list[i].lang === settings.subLang) { Subs.auto = true; Subs.select(list[i]); return; }
        }
      });
      this.tickTimer = setInterval(function () { self.tick(); }, 250);
      this.saveTimer = setInterval(function () { self.saveProgress(); }, 10000);
    },

    resolve: function (url) {
      var name = DEBRID_NAMES[settings.debrid];
      var notices = {
        'blocked_access': tr('{0} ha bloqueado el acceso desde Torrentio. Revisa tu correo o la sección de autorizaciones de tu cuenta y aprueba el acceso.', name),
        'failed_access': tr('La clave de {0} no es válida o tu suscripción ha caducado.', name),
        'downloading': tr('{0} aún está descargando este archivo. Prueba dentro de unos minutos o elige una fuente instantánea.', name),
        'download_failed': tr('{0} no ha podido descargar este archivo. Prueba otra fuente.', name),
        'limits_exceeded': tr('Has alcanzado el límite de {0}. Prueba más tarde.', name),
        'failed_too_big': tr('El archivo es demasiado grande para {0}.', name),
        'failed_rar': tr('La fuente es un RAR y no se puede reproducir. Prueba otra.'),
        'failed_opening': tr('{0} no ha podido abrir este archivo. Prueba otra fuente.', name),
        'failed_infringement': tr('{0} ha retirado este archivo. Prueba otra fuente.', name),
        'failed_unavailable': tr('Este archivo ya no está disponible. Prueba otra fuente.'),
        'failed_unexpected': tr('Error inesperado de Torrentio. Prueba otra fuente.')
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
          if (m && final.indexOf('torrentio') >= 0) reject(notices[m[1]] || tr('Aviso de Torrentio: {0}', m[1]));
          else resolve(final);
        };
        x.onerror = x.ontimeout = function () { resolve(url); }; // si no se puede comprobar, intentar igualmente
        x.send();
      });
    },

    // --- backend AVPlay (reproductor nativo de Samsung: MKV, HEVC, varias pistas)
    openAV: function (url) {
      var self = this, av = webapis.avplay;
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
          onbufferingstart: function () { self.buffering = true; self.spinner(true, tr('Cargando…')); },
          onbufferingprogress: function (p) { self.spinner(true, tr('Cargando…') + ' ' + p + '%'); },
          onbufferingcomplete: function () { self.buffering = false; self.spinner(false); },
          oncurrentplaytime: function (ms) { self.time = ms / 1000; },
          onstreamcompleted: function () { self.finished(); },
          onerror: function (e) { self.fail(tr('Error del reproductor: {0}', e)); },
          onsubtitlechange: function (duration, text) {
            if (Subs.embedded) Subs.show((text || '').replace(/<[^>]+>/g, ''));
          }
        });
        av.prepareAsync(function () {
          self.duration = av.getDuration() / 1000;
          self.autoAudio();
          // por si la pista no se puede cambiar antes de empezar: volver a intentarlo ya reproduciendo
          var go = function () { av.play(); self.markStarted(); self.spinner(false); self.autoAudio(); };
          if (self.startAt > 5) av.seekTo(Math.floor(self.startAt * 1000), go, go);
          else go();
        }, function (e) {
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
        if (self.startAt > 5 && !self.started) v.currentTime = self.startAt;
      };
      v.onwaiting = function () { self.buffering = true; self.spinner(true, tr('Cargando…')); };
      v.onplaying = function () { self.buffering = false; self.markStarted(); self.spinner(false); };
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
      $('#osd-dur').textContent = this.duration ? tr('termina a las {0}', end.getHours() + ':' + (end.getMinutes() < 10 ? '0' : '') + end.getMinutes()) +
        ' · ' + fmtTime(this.duration) : '--:--';
      $('#osd-progress').style.width = this.duration ? (shown / this.duration * 100) + '%' : '0';
      $('#osd-state').textContent = this.seekTarget !== null ? (this.seekTarget >= this.time ? '⏩ ' : '⏪ ') + fmtTime(this.seekTarget) :
        (this.paused ? tr('⏸ Pausa') + (this.probeText ? ' · ' + this.probeText : '') : '');
      if (this.paused) this.showOSD(true);
      Subs.update(this.time);
      this.checkUpNext();
    },

    markStarted: function () {
      if (this.started) return;
      this.started = true;
      var c = this.ctx, s = this.stream;
      if (c.type === 'series') saveSrcPref(c.metaId, { hash: s.hash, binge: s.binge, group: s.group });
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
      if (this.upNextOff || this.paused || this.duration < 300 || left > 40) return;
      if (this.nextCtx === undefined) this.nextCtx = this.ctx.next ? this.ctx.next() : null;
      if (!this.nextCtx) { this.upNextOff = true; return; }
      this.upNext = { left: 10 };
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

    playNext: function () {
      var next = this.nextCtx, me = this.screen;
      if (!next) return;
      this.upNext = null;
      this.paintUpNext();
      while (stack.length > 1 && stack[stack.length - 1] !== me) pop(); // cerrar menús abiertos
      pop(); // cierra el reproductor: guarda el progreso y avisa a Trakt
      var top = stack[stack.length - 1];
      if (top && top.streamsOf) pop(); // la lista de fuentes del episodio anterior ya no sirve
      next.autoPlay = true;
      push(streamsScreen(next));
    },

    // --- audio: el idioma elegido antes en esta serie o, si no, español si el archivo lo trae
    currentAudio: function () {
      try {
        var sel = webapis.avplay.getCurrentStreamInfo().filter(function (t) { return t.type === 'AUDIO'; })[0];
        return sel ? sel.index : -1;
      } catch (e) { return -1; }
    },

    autoAudio: function () {
      var c = this.ctx, pref = c.type === 'series' ? srcPrefs[c.metaId] : null;
      var want = (pref && pref.audio) || (settings.audioLang !== 'orig' ? settings.audioLang : '');
      var tracks = this.avTracks('AUDIO'), cur = this.currentAudio(), i;
      for (i = 0; want && tracks.length > 1 && i < tracks.length; i++) {
        if (langKey(tracks[i].lang) !== want) continue;
        if (tracks[i].index !== cur) {
          try { webapis.avplay.setSelectTrack('AUDIO', tracks[i].index); cur = tracks[i].index; } catch (e) { /* se queda la de serie */ }
        }
        break;
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
          } catch (e) { /* se quedan los de OpenSubtitles */ }
          break;
        }
      }
    },

    skipAutoSubs: function () { return settings.subLang !== 'off' && this.audioKey === settings.subLang; },

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
      if (this.backend !== 'av') { toast(tr('Cambiar el audio solo es posible con el reproductor nativo')); return; }
      var tracks = this.avTracks('AUDIO');
      if (tracks.length < 2) { toast(tr('Esta fuente solo tiene una pista de audio')); return; }
      var cur = this.currentAudio(), c = this.ctx, self = this;
      menu('Audio', tracks.map(function (k, i) {
        return { label: (tr(LANG_NAMES[langKey(k.lang)]) || k.lang || tr('Pista {0}', i + 1)) + (k.codec ? ' · ' + k.codec : '') + (k.channels ? tr(' · {0} canales', k.channels) : ''),
          value: k.index, lang: langKey(k.lang), selected: k.index === cur };
      }), function (it) {
        try { webapis.avplay.setSelectTrack('AUDIO', it.value); } catch (e) { toast(tr('No se pudo cambiar el audio')); return; }
        self.audioKey = it.lang;
        if (c.type === 'series' && it.lang) {
          saveSrcPref(c.metaId, { audio: it.lang });
          toast(tr('Audio cambiado (se usará en el resto de la serie)'));
        } else toast(tr('Audio cambiado'));
      });
    },

    subsMenu: function () {
      var self = this, items = [{ label: tr('Sin subtítulos'), value: 'off', selected: !Subs.current && !Subs.embedded }];
      if (this.backend === 'av') {
        this.avTracks('TEXT').forEach(function (t, i) {
          items.push({ label: tr('Incrustado: {0}', t.lang || tr('pista {0}', i + 1)), value: 'emb', index: t.index });
        });
      }
      Subs.list.forEach(function (s) {
        items.push({ label: tr(s.lang === 'spa' ? 'Español' : 'Inglés') + ' · ' + (s.addon ? s.addon + ' · ' : '') + (s.subtitleFileName || s.id), value: 'ext', sub: s, selected: Subs.current === s });
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

    adjustSync: function (delta) {
      Subs.offset = Math.round((Subs.offset + delta) * 100) / 100;
      Subs.idx = 0;
      if (Subs.embedded) {
        try { webapis.avplay.setSubtitlePosition(Math.round(Subs.offset * 1000)); } catch (e) { /* no soportado */ }
      }
      saveSubOffset(this.ctx && this.ctx.videoId, Subs.offset);
      this.paintSync();
    },

    onKey: function (code) {
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
        if (code === K.ENTER) { this.playNext(); return true; }
        this.dismissUpNext();
        if (code === K.BACK || code === K.ESC || code === K.BKSP) return true;
      }
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
      var done = this.time / this.duration > 0.92;
      saveProgress({
        videoId: c.videoId, metaId: c.metaId, type: c.type, name: c.name, poster: c.poster,
        label: c.epLabel ? c.name + ' · ' + c.epLabel.split(' · ')[0] : c.name,
        t: this.time, d: this.duration, done: done, ts: Date.now()
      });
    },

    finished: function () {
      this.time = this.duration;
      if (this.nextCtx === undefined) this.nextCtx = this.ctx.next ? this.ctx.next() : null;
      if (this.nextCtx && settings.autoNext && !this.upNextOff) { this.playNext(); return; }
      this.saveProgress();
      pop();
    },

    fail: function (msg) {
      var row = this.row;
      this.spinner(false);
      pop();
      // volver a la lista con la siguiente fuente ya seleccionada
      if (row && row.parentNode) {
        var t1 = row.querySelector('.t1');
        if (t1 && !row._failed) { row._failed = true; t1.innerHTML = '<span class="badge warn">' + tr('✗ Falló') + '</span>' + t1.innerHTML; }
        var next = row.nextSibling;
        while (next && next._failed) next = next.nextSibling;
        if (next) { Nav.focus(next); msg += tr(' Pulsa OK para probar la siguiente fuente.'); }
      }
      toast(msg, 7000);
    },

    close: function () {
      this.probeId++;
      this.syncMode = false;
      this.paintSync();
      this.upNext = null;
      this.paintUpNext();
      if (this.started) {
        Trakt.scrobble('stop', this.ctx, this.pct()); // >= 80 % lo marca como visto
        Trakt.upNextCache = null; // el siguiente episodio ha podido cambiar
      }
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
      document.documentElement.style.background = '';
      document.body.style.background = '';
      $('#player').style.background = '';
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

    opt('Idioma de la app', function () { return LANGS[settings.lang]; }, function () {
      settings.lang = settings.lang === 'en' ? 'es' : 'en';
      saveSettings();
      setTimeout(rebuildUI, 0);
    });

    box.appendChild(el('div', 'row-title', tr('Servicio debrid')));
    box.lastChild.style.padding = '10px 0 16px 0';
    opt('Servicio', function () { return DEBRID_NAMES[settings.debrid]; }, cycle('debrid', ['realdebrid', 'alldebrid']));

    var field = el('div', 'field');
    field.appendChild(el('label', null, tr('Clave API (pulsa OK para escribirla)')));
    var input = el('input');
    input.type = 'text';
    input.value = settings.key;
    input.placeholder = tr('Pega o escribe aquí tu clave');
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

    var testBtn = el('div', 'btn', tr('Probar clave'));
    var status = el('span', 'note');
    status.style.marginLeft = '20px';
    focusable(testBtn, testKey);
    box.appendChild(testBtn);
    box.appendChild(status);

    function testKey() {
      if (!settings.key) { status.textContent = tr('Escribe primero la clave.'); return; }
      status.textContent = tr('Comprobando…');
      getJSON(torrentioBase() + '/stream/movie/' + PROBE_ID + '.json').then(function (d) {
        var s = (d.streams || []).map(parseStream);
        if (s.length === 1 && s[0].error) status.textContent = tr('✗ Clave no válida para {0}', DEBRID_NAMES[settings.debrid]);
        else status.textContent = tr('✓ Clave válida · {0} fuentes de prueba', s.filter(function (x) { return x.url; }).length);
      }).catch(function (e) { status.textContent = tr('No se pudo comprobar ({0})', e.message); });
    }

    box.appendChild(el('div', 'row-title', tr('Fuentes')));
    box.lastChild.style.padding = '30px 0 16px 0';
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
    opt('Ocultar lo que ya he visto (Trakt y esta app)', function () { return yesNo(settings.hideWatched); }, function () { settings.hideWatched = !settings.hideWatched; Seen.at = 0; });
    opt('Mostrar primero las fuentes en español', function () { return yesNo(settings.preferEs); }, function () { settings.preferEs = !settings.preferEs; });

    box.appendChild(el('div', 'row-title', tr('Reproducción')));
    box.lastChild.style.padding = '30px 0 16px 0';
    opt('Al pulsar Ver, reproducir directamente la mejor fuente', function () { return yesNo(settings.quickPlay); }, function () { settings.quickPlay = !settings.quickPlay; });
    opt('Pasar solo al siguiente episodio', function () { return yesNo(settings.autoNext); }, function () { settings.autoNext = !settings.autoNext; });
    opt('Idioma del audio', function () {
      return settings.audioLang === 'orig' ? tr('El que traiga el archivo') : tr('{0} si lo hay', tr(LANG_NAMES[settings.audioLang]));
    }, cycle('audioLang', AUDIO_LANGS));
    box.appendChild(el('div', 'note', tr('Si cambias la pista con ▼ en una serie, se recuerda para el resto de episodios (y la fuente que elijas, también).')));

    box.appendChild(el('div', 'row-title', tr('Subtítulos')));
    box.lastChild.style.padding = '30px 0 16px 0';
    opt('Idioma automático', function () { return tr(SUB_NAMES[settings.subLang]); }, cycle('subLang', ['spa', 'eng', 'off']));
    opt('Fondo detrás del texto', function () { return yesNo(settings.subBg); }, function () { settings.subBg = !settings.subBg; });
    opt('Tamaño', function () { return settings.subSize === 'big' ? tr('Grande') : tr('Normal'); }, function () { settings.subSize = settings.subSize === 'big' ? 'normal' : 'big'; });

    box.appendChild(el('div', 'row-title', 'Trakt'));
    box.lastChild.style.padding = '30px 0 16px 0';
    var tStatus = el('div', 'note');
    box.appendChild(tStatus);

    function textField(label, key, placeholder) {
      var f = el('div', 'field');
      f.appendChild(el('label', null, esc(tr(label))));
      var inp = el('input');
      inp.type = 'text';
      inp.value = trakt[key] || '';
      inp.placeholder = tr(placeholder);
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

    box.appendChild(el('div', 'row-title', tr('Addons')));
    box.lastChild.style.padding = '30px 0 16px 0';
    var addonList = el('div');
    box.appendChild(addonList);
    function paintAddons() {
      addonList.innerHTML = '';
      if (!addons.length) addonList.appendChild(el('div', 'note', esc(tr('Ninguno añadido. Torrentio, Cinemeta, Kitsu y OpenSubtitles ya vienen incluidos.'))));
      addons.forEach(function (a) {
        var what = [];
        if (addonHas(a, 'stream')) what.push(tr('fuentes'));
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
    var af = el('div', 'field');
    af.appendChild(el('label', null, esc(tr('Añadir addon: URL de su manifest (pulsa OK para escribirla)'))));
    var addonInput = el('input');
    addonInput.type = 'text';
    addonInput.placeholder = 'https://…/manifest.json';
    addonInput.setAttribute('autocomplete', 'off');
    addonInput.setAttribute('spellcheck', 'false');
    focusable(addonInput, function () { addonInput.focus(); });
    var addonStatus = el('div', 'note');
    addonInput._ondone = function (v) {
      if (!v || !v.replace(/\s+/g, '')) return;
      addonStatus.textContent = tr('Comprobando…');
      installAddon(v).then(function (a) {
        addonInput.value = '';
        addonStatus.textContent = tr('✓ Añadido: {0}', a.manifest.name);
        paintAddons();
      }).catch(function (e) { addonStatus.textContent = tr('✗ No se pudo añadir ({0})', e.message); });
    };
    af.appendChild(addonInput);
    box.appendChild(af);
    box.appendChild(addonStatus);
    box.appendChild(el('div', 'note', esc(tr('Los addons de fuentes que piden configuración (Comet, MediaFusion…) se configuran en su web con tu debrid y se pega aquí la URL que dan. Sus catálogos salen en Inicio y en la búsqueda.'))));

    box.appendChild(el('div', 'row-title', tr('Copia de seguridad')));
    box.lastChild.style.padding = '30px 0 16px 0';
    box.appendChild(el('div', 'note', esc(tr('Guarda tus ajustes, claves, Trakt, progreso y addons en un Gist secreto de tu cuenta de GitHub, una vez al día. Si se borran los datos de la app, escribe el token y pulsa Restaurar.'))));
    var bf = el('div', 'field');
    bf.appendChild(el('label', null, esc(tr('Token de GitHub con permiso «gist» (pulsa OK para escribirlo)'))));
    var tokenInput = el('input');
    tokenInput.type = 'text';
    tokenInput.value = backup.token ? backup.token.slice(0, 8) + '…' : '';
    tokenInput.placeholder = 'ghp_…';
    tokenInput.setAttribute('autocomplete', 'off');
    tokenInput.setAttribute('spellcheck', 'false');
    focusable(tokenInput, function () { if (backup.token) tokenInput.value = ''; tokenInput.focus(); });
    tokenInput._ondone = function (v) {
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
    };
    bf.appendChild(tokenInput);
    box.appendChild(bf);
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

    box.appendChild(el('div', 'row-title', tr('Datos')));
    box.lastChild.style.padding = '30px 0 16px 0';
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
    box.appendChild(el('div', 'note', 'StremTV ' + VERSION + tr(' · Catálogo: Cinemeta · Fuentes: Torrentio · Subtítulos: OpenSubtitles · Reproductor: {0}', Player.hasAV() ? tr('nativo (AVPlay)') : 'HTML5')));

    return { el: root, initialFocus: function () { return box.querySelector('.f'); } };
  }

  // al cambiar el idioma, rehacer las pantallas (inicio + ajustes) con los textos nuevos
  function rebuildUI() {
    while (stack.length) {
      var sc = stack.pop();
      if (sc.onClose) sc.onClose();
      if (sc.el.parentNode) sc.el.parentNode.removeChild(sc.el);
    }
    document.documentElement.lang = settings.lang;
    push(homeScreen());
    push(settingsScreen());
  }

  // ---------------------------------------------------------------- arranque

  var VERSION = '0.11.1';

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
    autoMeasure();
    refreshAddons();
    autoBackup();
    fitScreen();
    window.addEventListener('resize', fitScreen);
    registerKeys();
    document.documentElement.lang = settings.lang;
    push(homeScreen());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // exponer para depurar desde la consola
  window.StremTV = { bootLog: function () { return load('boot', []); }, settings: settings, Player: Player, Nav: Nav, stack: stack, toast: function (m, ms) { toast(tr(m), ms); }, open: function (type, id) { push(detailScreen(type, id)); } };
})();
