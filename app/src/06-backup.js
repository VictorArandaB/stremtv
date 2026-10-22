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
