  // ---------------------------------------------------------------- Smart Hub Preview

  // Con StremTV enfocada en la barra de aplicaciones de la tele (sin abrirla), Samsung enseña encima una fila de casillas:
  // «Continuar viendo» (de esta tele) y «Siguientes episodios» (Trakt). OK en una abre la app en su ficha.
  // Las casillas solo las puede poner un servicio de fondo del paquete (service.js, id «<paquete>.preview»):
  // la app le pasa el JSON ya hecho y él llama a webapis.preview.setPreviewData. Con un paquete anterior, sin el
  // servicio, el envío falla una vez y no se vuelve a intentar hasta el siguiente arranque.
  // Se envía a los 20 s de arrancar, cada 30 min y al salir de la app (que es cuando se ven), solo si han cambiado.
  var Preview = {
    sig: '', next: [], failed: false, lastRaw: '', lastScreen: null,
    // imagen: el fondo apaisado de metahub (480x270, dentro de lo que admite Samsung); sin id de IMDb, la carátula
    tile: function (m, title, subtitle, playable) {
      var id = String(m.id || ''), imdb = /^tt\d+$/.test(id);
      if (!id || (!imdb && !m.poster)) return null;
      return { title: title, subtitle: subtitle || '', image_ratio: imdb ? '16by9' : '2by3',
        image_url: imdb ? 'https://images.metahub.space/background/small/' + id + '/img' : m.poster,
        action_data: JSON.stringify({ type: m.type, id: id }), is_playable: !!playable };
    },
    data: function () {
      var used = {}, cont = [], up = [];
      continueList().slice(0, 12).forEach(function (p) {
        var ep = p.label && p.label.indexOf(p.name + ' · ') === 0 ? p.label.slice(p.name.length + 3) : '';
        var t = Preview.tile({ id: p.metaId, type: p.type, poster: p.poster }, p.name, ep || Math.round(100 * p.t / p.d) + ' %', true);
        if (t && !used[p.metaId]) { used[p.metaId] = true; cont.push(t); }
      });
      Preview.next.forEach(function (m) {
        if (used[m.id] || up.length >= 20) return;
        var code = m.label && m.label.indexOf(m.name + ' · ') === 0 ? m.label.slice(m.name.length + 3) : '';
        var t = Preview.tile(m, m.name, code + (m.isNew ? (code ? ' · ' : '') + tr('Nuevo') : ''), false);
        if (t) { used[m.id] = true; up.push(t); }
      });
      var sections = [];
      if (cont.length) sections.push({ title: tr('Continuar viendo'), tiles: cont });
      if (up.length) sections.push({ title: tr('Siguientes episodios'), tiles: up });
      return { sections: sections };
    },
    send: function () {
      if (Preview.failed || typeof tizen === 'undefined' || !tizen.application) return;
      var d = Preview.data();
      if (!d.sections.length) return;
      var json = JSON.stringify(d);
      if (json === Preview.sig) return;
      var off = function (e) {
        Preview.failed = true;
        logEv('preview', 'no disponible', { error: String(e && (e.name || e.message) || e) });
      };
      try {
        var id = tizen.application.getCurrentApplication().appInfo.packageId + '.preview';
        tizen.application.launchAppControl(new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/pick', null, null, null,
          [new tizen.ApplicationControlData('preview', [json])]), id, function () {
          Preview.sig = json;
          logEv('preview', 'enviado', { continuar: d.sections[0].tiles.length, casillas: d.sections.reduce(function (n, s) { return n + s.tiles.length; }, 0) });
        }, off);
      } catch (e) { off(e); }
    },
    // con Trakt, primero la lista de siguientes episodios (la misma de Inicio, guardada 10 min)
    refresh: function () {
      if (Preview.failed || typeof tizen === 'undefined' || document.hidden) return;
      (Trakt.linked() ? Trakt.upNext().catch(function () { return Preview.next; }) : Promise.resolve([])).then(function (list) {
        Preview.next = list || [];
        Preview.send();
      });
    },
    // la casilla elegida llega en PAYLOAD como {"values": "<action_data>"}, al arrancar o con la app ya abierta
    deepLink: function () {
      var raw = '';
      try {
        var data = tizen.application.getCurrentApplication().getRequestedAppControl().appControl.data || [];
        for (var i = 0; i < data.length; i++) if (data[i].key === 'PAYLOAD') raw = data[i].value[0];
      } catch (e) { return; }
      if (!raw) return;
      var a = looseJSON((looseJSON(raw) || {}).values);
      if (!a || !a.id) return;
      // la tele repite la última petición al volver a la app por el icono: si su ficha sigue delante, nada
      if (raw === Preview.lastRaw && isTop(Preview.lastScreen)) return;
      while (Player.stream && stack.length > 1) pop(); // un vídeo en pausa de antes: se cierra guardando la posición
      Preview.lastRaw = raw;
      logEv('preview', 'abrir', { id: a.id });
      push(Preview.lastScreen = detailScreen(a.type || 'series', a.id));
    },
    start: function () {
      if (typeof tizen === 'undefined' || !tizen.application) return;
      window.addEventListener('appcontrol', Preview.deepLink);
      Preview.deepLink();
      setTimeout(Preview.refresh, 20000);
      setInterval(Preview.refresh, 1800000);
      document.addEventListener('visibilitychange', function () { if (document.hidden) Preview.send(); });
    }
  };
