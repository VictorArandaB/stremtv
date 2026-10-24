  // ---------------------------------------------------------------- arranque

  var VERSION = '0.22.3';

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
  window.StremTV = { bootLog: function () { return load('boot', []); }, settings: settings, Player: Player, Saver: Saver, Nav: Nav, stack: stack, toast: function (m, ms) { toast(tr(m), ms); }, open: function (type, id) { push(detailScreen(type, id)); }, openMeta: openMeta, openSettings: openSettings, checkQueue: checkQueue };
})();
