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
    // listas y premios
    'IMDb Top 250 series': 'IMDb Top 250 shows', 'Óscar': 'Oscars', 'Goya': 'Goya Awards', 'Globos de Oro': 'Golden Globes', 'Emmy': 'Emmys',
    'Palma de Oro (Cannes)': 'Palme d’Or (Cannes)', 'Ganadoras del Óscar': 'Best Picture Oscar winners', 'Ganadora': 'Winner',
    '{0} {1}: nominadas': '{0} {1}: nominees'
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
