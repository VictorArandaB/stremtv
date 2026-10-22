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

  var BACKUP_KEYS = ['settings', 'trakt', 'progress', 'suboffsets', 'srcprefs', 'addons', 'explore', 'mylist'];
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
