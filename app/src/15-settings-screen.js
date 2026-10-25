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
