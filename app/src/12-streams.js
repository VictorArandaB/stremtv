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
    var screen = { el: root, streamsOf: ctx.videoId };

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
        ordered.forEach(function (s) {
          if (s.head) { list.appendChild(el('div', 'sgroup', esc(s.head) + ' · ' + (s.n === 1 ? tr('1 fuente') : tr('{0} fuentes', s.n)))); return; }
          var row = el('div', 'stream' + (s === rec ? ' rec' : ''));
          var g = qualityGroup(s.quality), q = s.quality.replace(/4k/i, '4K');
          // agrupadas, la calidad ya está en el título del grupo: solo se repite si dice algo más («4K DV»)
          if (!grouped) row.appendChild(el('div', 'q', '<span class="' + (g === '4K' ? 'q4k' : g === '1080p' ? 'q1080' : g === '720p' ? 'q720' : '') + '">' + esc(q) + '</span>'));
          var info = el('div', 'info');
          var badges = grouped && q !== g && q ? '<span class="badge">' + esc(q) + '</span>' : '';
          if (s === rec) badges += '<span class="badge rec">' + tr('★ Recomendada') + '</span>';
          if (s.pref >= 2) badges += '<span class="badge ok">' + tr('↺ Como el anterior') + '</span>';
          if (s.addon) badges += '<span class="badge addon">' + esc(s.addon) + '</span>';
          // si todas son instantáneas lo dice el subtítulo y la marca sobra
          if (s.cached && !allCached) badges += '<span class="badge ok">' + tr('⚡ Instantáneo') + '</span>';
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
          info.appendChild(el('div', 't1', badges + '<span class="fname">' + esc(s.file) + '</span>'));
          info.appendChild(el('div', 't2', esc(s.stats + '   ' + s.langs)));
          row.appendChild(info);
          focusable(row, function () { Player.open(s, ctx, row); });
          list.appendChild(row);
          s._row = row;
          row._stream = s;
        });
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
      });
    }
    fetchStreams();
    return screen;
  }
