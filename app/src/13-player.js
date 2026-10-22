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
  // En las series sin AniSkip, el siguiente episodio ofrece «saltar intro» en el mismo tramo
  var introSkips = load('introskips', {});
  function learnedIntro(ctx) {
    var L = ctx && ctx.type === 'series' && introSkips[ctx.metaId];
    return L ? [{ type: 'op', s: Math.max(0, L.s - 10), e: L.e, learned: true }] : [];
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
      this.skips = []; this.skipNow = null;
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
      if (cur === this.skipNow) return;
      this.skipNow = cur;
      var box = $('#skipbox');
      if (!box) { // el index.html de la app instalada no trae este elemento
        box = el('div', 'hidden');
        box.id = 'skipbox';
        $('#player').appendChild(box);
      }
      box.textContent = cur ? (cur.type === 'op' ? tr('⏭ OK: saltar intro') : tr('⏭ OK: saltar ending')) : '';
      box.classList.toggle('hidden', !cur);
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

    // un salto de 30 s-3 min hacia delante en los 10 primeros minutos de un episodio suele ser la intro: se recuerda
    learnIntro: function (from, to) {
      var c = this.ctx;
      if (!c || c.type !== 'series' || !this.started || from > 600 || to - from < 30 || to - from > 180) return;
      for (var i = 0; i < this.skips.length; i++) if (this.skips[i].type === 'op' && !this.skips[i].learned) return; // AniSkip ya la sabe
      introSkips[c.metaId] = { s: Math.round(from), e: Math.round(to), ts: Date.now() };
      capByTs(introSkips, 100);
      save('introskips', introSkips);
      logEv('intro', 'aprendida', { serie: c.name, s: Math.round(from), e: Math.round(to) });
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
      var rows = Array.prototype.filter.call(list.querySelectorAll('.stream'), function (r) { return r._stream && r !== row && !r._failed; });
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
      if (this.skipNow && code === K.ENTER) { this.skipTo(this.skipNow.e); return true; }
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
