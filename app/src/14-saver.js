  // ---------------------------------------------------------------- pausa automática y protector de pantalla

  // al salir de la app (botón Home, cambio de fuente…) el vídeo se pausa en vez de seguir reproduciéndose
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden || !Player.stream || !Player.started || Player.paused) return;
    Player.toggle();
    Player.paused = true;
    Player.autoPaused = true;
    logEv('pausa', 'al salir de la app');
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !Player.autoPaused) return;
    Player.autoPaused = false;
    if (Player.stream) toast(tr('Vídeo en pausa al salir de la app: pulsa OK para seguir'), 6000);
  });

  // Protector de pantalla, en dos casos:
  // - «pausa»: con el vídeo en pausa unos minutos (Ajustes → Protector), fondos de lo que hay en Inicio que se funden despacio;
  //   el reproductor apaga el salvapantallas de la tele, así que sin esto la imagen se quedaría fija
  // - «inactividad»: sin tocar el mando fuera del vídeo, fondos con logo y sinopsis de lo que elijas en Ajustes
  //   (pendientes de ver, Mi lista, novedades o un poco de todo); OK abre la ficha del que se ve
  var SAVER_SHOW = ['mix', 'pending', 'list', 'new'];
  var SAVER_SHOW_NAMES = { mix: 'Un poco de todo', pending: 'Pendientes de ver', list: 'Mi lista', 'new': 'Novedades' };

  // títulos para el protector por inactividad: [{ meta, tag }] sin repetir, de las fuentes elegidas
  function saverItems(kind) {
    var lists = [];
    var safe = function (pr, tag) { lists.push(pr.then(function (ms) { return (ms || []).map(function (m) { return { meta: m, tag: tag(m) }; }); }, function () { return []; })); };
    var linked = Trakt.linked();
    if (kind === 'pending' || kind === 'mix') {
      safe(Promise.resolve(continueList().map(function (p) { return { id: p.metaId, type: p.type, name: p.name, poster: p.poster, label: p.label }; })),
        function (m) { return tr('Continuar viendo') + (m.label && m.label !== m.name ? ' · ' + m.label.replace(m.name + ' · ', '') : ''); });
      if (linked) {
        safe(Trakt.upNext(), function (m) { return tr('Siguiente episodio') + ' · ' + String(m.label || '').replace(m.name + ' · ', ''); });
        safe(Trakt.playback(), function () { return tr('Continuar (Trakt)'); });
      }
    }
    if (kind === 'list' || kind === 'mix' || kind === 'pending') {
      safe(linked ? Trakt.loadWatchlist() : Promise.resolve(myListMetas()), function () { return tr('En tu lista'); });
    }
    if (kind === 'new' || kind === 'mix') {
      var year = new Date().getFullYear();
      if (linked) safe(Trakt.calendar(), function (m) { return tr('Esta semana en tus series') + ' · ' + String(m.label || '').split(' · ')[0]; });
      safe(getJSON(CINEMETA + '/catalog/movie/year/genre=' + year + '.json').then(function (r) { return (r.metas || []).slice(0, 20); }), function () { return tr('Estreno de {0}', year); });
      safe(getJSON(CINEMETA + '/catalog/series/top.json').then(function (r) { return (r.metas || []).slice(0, 15); }), function () { return tr('Series populares'); });
    }
    return Promise.all(lists).then(function (all) {
      // intercaladas: una de cada fuente por turno, para que «un poco de todo» lo sea de verdad
      var out = [], seen = {}, more = true;
      for (var i = 0; more; i++) {
        more = false;
        all.forEach(function (l) {
          if (i >= l.length) return;
          more = true;
          var k = listKey(l[i].meta);
          if (!k || seen[k]) return;
          seen[k] = true;
          out.push(l[i]);
        });
      }
      return out.slice(0, 60);
    });
  }

  var Saver = {
    on: false, mode: '', lastKey: Date.now(), slide: 0, timer: null, pool: [], shown: null, gen: 0,

    poke: function () { this.lastKey = Date.now(); },

    check: function () {
      if (Saver.on || document.hidden) return;
      var idle = Date.now() - Saver.lastKey;
      if (Player.stream) {
        if (settings.saver && Player.started && Player.paused && idle >= settings.saver * 60000) Saver.start('pause');
      } else if (settings.idleSaver && idle >= settings.idleSaver * 60000 && stack.length) Saver.start('idle');
    },

    // una tecla con el protector puesto: lo quita; en el de inactividad, OK además abre la ficha del título que se ve
    key: function (code) {
      var m = this.mode === 'idle' && code === K.ENTER && this.shown ? this.shown.meta : null;
      this.stop();
      if (m) openMeta(m); // solo sale fuera del vídeo: no hay reproductor que cerrar
    },

    // primero lo que está en pausa; después, carátulas de las pantallas abiertas (sin repetir, mezcladas)
    collect: function () {
      var c = Player.ctx || {}, seen = {}, out = [], rest = [];
      var add = function (list, m) {
        var imdb = imdbOfMeta(m);
        var bg = m.background || (imdb ? metahubImg('background', imdb) : '');
        if (!bg || seen[bg]) return;
        seen[bg] = true;
        list.push({ bg: bg, name: m.name });
      };
      add(out, c);
      Array.prototype.forEach.call(document.querySelectorAll('.card'), function (x) { if (x._meta) add(rest, x._meta); });
      shuffle(rest);
      return out.concat(rest.slice(0, 30));
    },

    box: function () {
      var box = $('#saver');
      if (!box) {
        box = el('div', 'hidden', '<div class="sv-bg"></div><div class="sv-bg"></div><div class="sv-shade"></div><div class="sv-info"></div><div class="sv-corner-clock clock"></div>');
        box.id = 'saver';
        document.body.appendChild(box);
      }
      return box;
    },

    start: function (mode) {
      var box = this.box(), gen = ++this.gen;
      this.mode = mode || 'pause';
      this.on = true;
      this.slide = 0;
      this.shown = null;
      box.className = 'sv-' + this.mode;
      if (this.mode === 'pause') {
        this.pool = this.collect();
        logEv('protector', 'activado', { fondos: this.pool.length });
        this.next();
        return;
      }
      // inactividad: mientras llegan los títulos, el reloj sobre negro
      this.pool = [];
      box.querySelector('.sv-info').className = 'sv-info';
      box.querySelector('.sv-info').innerHTML = '<div class="sv-clock clock">' + clockText(new Date()) + '</div>';
      saverItems(settings.saverShow).then(function (items) {
        if (!Saver.on || Saver.gen !== gen) return;
        // si lo elegido está vacío (sin pendientes, lista vacía), novedades
        return items.length || settings.saverShow === 'new' ? items : saverItems('new');
      }).then(function (items) {
        if (!Saver.on || Saver.gen !== gen || !items) return;
        Saver.pool = settings.saverShow === 'pending' ? items : shuffle(items);
        logEv('protector', 'inactividad', { mostrar: settings.saverShow, titulos: items.length });
        Saver.next();
      });
    },

    next: function () {
      if (!this.on) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(function () { Saver.next(); }, (this.mode === 'idle' ? settings.saverEvery || 20 : 15) * 1000);
      if (this.mode === 'idle') { this.nextIdle(this.gen, 0); return; }
      var box = $('#saver'), layers = box.querySelectorAll('.sv-bg'), infoBox = box.querySelector('.sv-info');
      var item = this.pool.length ? this.pool[this.slide % this.pool.length] : null, n = this.slide++;
      var cur = layers[n % 2], prev = layers[(n + 1) % 2];
      var c = Player.ctx || {};
      var paint = function () {
        cur.classList.add('on');
        prev.classList.remove('on');
        // el texto cambia de esquina en cada fondo para no marcar la pantalla
        infoBox.className = 'sv-info c' + (n % 4);
        infoBox.innerHTML = '<div class="sv-clock clock">' + clockText(new Date()) + '</div>' +
          '<div class="sv-title">' + esc(tr('En pausa: {0}', c.epLabel ? c.name + ' · ' + c.epLabel.split(' · ')[0] : c.name || c.label || '')) + '</div>' +
          (item && item.name && item.name !== c.name ? '<div class="sv-sub">' + esc(item.name) + '</div>' : '') +
          '<div class="sv-sub">' + esc(tr('Pulsa cualquier tecla para volver')) + '</div>';
      };
      if (item) {
        var img = new Image();
        img.onload = function () { if (Saver.on) { cur.style.backgroundImage = 'url("' + item.bg + '")'; paint(); } };
        img.onerror = paint;
        img.src = item.bg;
      } else paint();
    },

    // inactividad: ficha del siguiente título (fondo, logo, nota, sinopsis); si no tiene fondo se salta, como mucho 5 seguidos
    nextIdle: function (gen, tries) {
      if (!this.pool.length || tries > 5) { this.paintIdle(null); return; }
      var item = this.pool[this.slide % this.pool.length], n = this.slide++;
      heroInfo(item.meta).then(function (d) {
        if (!Saver.on || Saver.gen !== gen) return;
        var imdb = imdbOfMeta(d);
        var bg = d.background || (imdb ? metahubImg('background', imdb) : '');
        if (!bg) { Saver.nextIdle(gen, tries + 1); return; }
        var img = new Image();
        img.onload = function () { if (Saver.on && Saver.gen === gen) Saver.paintIdle(item, d, bg, n); };
        img.onerror = function () { if (Saver.on && Saver.gen === gen) Saver.nextIdle(gen, tries + 1); };
        img.src = bg;
      });
    },

    paintIdle: function (item, d, bg, n) {
      var box = $('#saver'), layers = box.querySelectorAll('.sv-bg'), infoBox = box.querySelector('.sv-info');
      if (!item) {
        infoBox.className = 'sv-info';
        infoBox.innerHTML = '<div class="sv-clock clock">' + clockText(new Date()) + '</div>';
        return;
      }
      this.shown = item;
      var cur = layers[n % 2], prev = layers[(n + 1) % 2];
      cur.style.backgroundImage = 'url("' + bg + '")';
      cur.classList.add('on');
      prev.classList.remove('on');
      var meta = [];
      if (d.imdbRating && parseFloat(d.imdbRating)) meta.push('<span class="star">★ ' + esc(num(d.imdbRating)) + '</span>');
      if (d.releaseInfo || d.year) meta.push('<span>' + esc(d.releaseInfo || d.year) + '</span>');
      var g = d.genres || d.genre;
      if (g && g.length) meta.push('<span>' + esc(g.slice(0, 3).join(', ')) + '</span>');
      // izquierda y derecha alternas para no marcar la pantalla
      infoBox.className = 'sv-info sv-card ' + (n % 2 ? 'right' : 'left');
      infoBox.innerHTML = '<div class="sv-tag">' + esc(item.tag) + '</div>' +
        '<div class="sv-name">' + (d.logo ? '<img src="' + esc(d.logo) + '"><span>' + esc(d.name) + '</span>' : '<b>' + esc(d.name) + '</b>') + '</div>' +
        '<div class="sv-meta">' + meta.join('') + '</div>' +
        '<div class="sv-desc">' + esc(d.description || '') + '</div>' +
        '<div class="sv-help">' + esc(tr('OK: abrir la ficha · cualquier otra tecla: volver')) + '</div>';
      // logo que no carga: el nombre en texto
      var logo = infoBox.querySelector('img');
      if (logo) logo.onerror = function () { logo.parentNode.innerHTML = '<b>' + esc(d.name) + '</b>'; };
      box.querySelector('.sv-corner-clock').textContent = clockText(new Date());
    },

    stop: function () {
      if (!this.on) return;
      this.on = false;
      this.gen++;
      this.shown = null;
      clearTimeout(this.timer);
      var box = $('#saver');
      if (box) {
        box.className = 'hidden';
        Array.prototype.forEach.call(box.querySelectorAll('.sv-bg'), function (l) { l.classList.remove('on'); });
      }
      this.poke();
    }
  };
  // al salir de la app, fuera el protector (y nada de descargar fondos en segundo plano)
  document.addEventListener('visibilitychange', function () { if (document.hidden) Saver.stop(); });
  setInterval(Saver.check, 5000);
