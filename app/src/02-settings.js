  // ---------------------------------------------------------------- ajustes

  var DEFAULTS = {
    debrid: 'realdebrid', key: '', onlyCached: true, maxQ: 'all',
    preferEs: true, compatFirst: true, hideWatched: true, maxRate: 'auto', measuredMbps: 0, measuredAt: 0,
    subLang: 'spa', subSize: 'normal', autoNext: true, audioLang: 'spa', lang: 'es', quickPlay: true, subBg: true, tmdbKey: '', autoSkip: false, subColor: 'white', subPos: 'low', saver: 3,
    idleSaver: 10, saverShow: 'mix', saverEvery: 20
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
