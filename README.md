# StremTV

Cliente ligero tipo Stremio para **teles Samsung Tizen 3+ (2017 en adelante)**. Se instala como **app propia firmada** en modo desarrollador (ver [Instalación](#instalación)) y usa el reproductor nativo **AVPlay** para abrir MKV, HEVC y AC3.

Escrito en ES5 y CSS sin funciones modernas para que funcione en el motor web de Tizen 3 (Chromium ~47), donde la web oficial de Stremio no carga (necesita WebAssembly).

## Qué hace
- Catálogo y búsqueda de películas y series (Cinemeta).
- **Anime**: en emisión, tendencias, populares y mejor valorados, con búsqueda (addon Kitsu; acepta IDs de AniDB/MAL/AniList).
- **Sin fuentes de serie, como Stremio**: reproduce lo que den los addons que añadas en Ajustes → Fuentes y debrid. Con addons que aceptan debrid en su dirección, usa tu **Real-Debrid** o **AllDebrid** y las opciones de Ajustes (calidad, solo en caché…).
- Prioriza fuentes en español y marca las instantáneas (en caché).
- Reproductor nativo de Samsung (AVPlay) si está disponible, con HTML5 como alternativa. Cambio de pista de audio con AVPlay.
- Subtítulos en español/inglés de OpenSubtitles, con ajuste de sincronía.
- «Continuar viendo» y progreso por episodio (guardado en la propia tele).
- **Siguiente episodio automático**: aviso en los últimos 40 s con cuenta atrás de 10 s (OK lo pone ya, Atrás lo descarta).
- En cada serie recuerda la **fuente** (misma release o pack) y la **pista de audio** elegidas y las usa en los demás episodios.
- **Registro de diagnóstico** (errores, pistas de audio de cada archivo, fallos de fuentes, tiempos de arranque) que se envía con la copia al Gist; sinopsis del episodio al pasar por él; **Reparto** con la filmografía de cada actor (TMDB); fila **Visto recientemente**; subtítulos en más idiomas, amarillos o más arriba.
- Búsquedas recientes y resultados mientras escribes, «Más como esto» en la ficha, **saltar intro/ending de anime** (AniSkip) y **temporizador** (menú ▼).
- La pista de audio elegida se recuerda por película o serie.
- **Títulos y sinopsis en español** con una clave gratuita de TMDB (Ajustes, debajo del idioma): tarjetas, fichas, géneros, nombres de episodio y búsqueda en español.
- **Retomar desde Trakt** lo dejado a medias en otro dispositivo («▶ Continuar (35 %)»).
- **Copia de seguridad** en un Gist secreto de GitHub (Ajustes → Copia de seguridad): diaria y automática; para restaurar basta con escribir el token.
- **Addons de Stremio**: en Ajustes → Fuentes y debrid se pega la URL de un manifest; sus fuentes se suman entre sí, sus catálogos salen en Anime, Películas, Series o Inicio según su tipo (hasta 4 filas) y en la búsqueda, y sus subtítulos en el menú ▲.
- **Pestañas Anime, Películas y Series** (en ese orden, cada una con las mismas filas; el anime solo en la suya, también en Buscar): Para ti (recomendaciones de Trakt sin nada visto ni empezado), tendencia, en emisión o estrenos (en digital y en cines), populares, mejor valoradas y una fila por plataforma en España (Netflix, Prime Video, Disney+, HBO Max, Apple TV+, Movistar Plus+; SkyShowtime y Filmin, ocultas de serie). Las de TMDB necesitan su clave. Inicio queda para lo tuyo: continuar, siguientes episodios, esta semana, tu lista y lo visto.
- **Sorpréndeme** en Anime, Películas y Series: abre la ficha de un título sin ver ni empezar, elegido entre las recomendaciones de TMDB de lo que has visto y te gustó (lo valorado con 7 o más en Trakt, las series terminadas o con muchos episodios; sin Trakt, lo visto en la tele), con buena nota y de esa pestaña (el anime solo en la suya). Cada pulsación sale otro. Sin clave de TMDB, las recomendaciones de Trakt; sin ninguno de los dos, uno de «Mejor valoradas».
- **Explorar en Buscar**: sin escribir nada, filtros de tipo, género, año o década, nota mínima, plataforma, orden (populares, mejor valoradas, más recientes) y «solo sin ver». Sin clave de TMDB, con los catálogos de Cinemeta (año suelto, sin plataforma).
- **Esta semana en tus series** (Trakt): episodios de las series que sigues, de hace dos días a una semana vista.
- **Calendario** (Trakt; «Calendario completo ›» al final de «Esta semana en tus series» o el botón de Series): de hace 3 días a 30 días vista, una fila por día con los episodios de tus series (número como en la ficha, hora de emisión, «Estreno» o «Serie nueva» en los episodios 1) y las películas de tu lista que llegan a cines, DVD o digital; los días pasados atenuados y ✓ en lo visto. OK abre la ficha.
- **Reproducción directa**: «▶ Ver» arranca la mejor fuente (instantánea, que quepa en la conexión, o la misma release que en el episodio anterior); para elegir otra, ▼ → «Cambiar fuente…».
- Hora a la que termina el vídeo en la barra, subtítulos con fondo y subtítulos del propio MKV por defecto si los trae en tu idioma.
- **App en español o inglés** (Ajustes → Idioma de la app, primera opción).
- **Idioma del audio elegible** (español, inglés, francés, alemán, italiano, portugués, japonés, coreano, catalán u original): se pone solo si el archivo lo trae, y si coincide con el de los subtítulos automáticos, no los pone.
- **Inicio con cabecera grande**: fondo, logo, nota, año y sinopsis de la carátula enfocada (también en Anime); la fila enfocada atenúa el resto, ✓ en lo visto, reloj y pestaña activa en la cabecera.
- **Ficha** con el logo del título, botón «▶ Ver T1:E3» con el siguiente episodio pendiente y sinopsis y duración en cada episodio.
- **Fuentes agrupadas por calidad** (4K, 1080p, 720p…) con la recomendada (la que elige «▶ Ver») marcada.
- **Reproductor**: reloj, episodio bajo el título, burbuja con el tiempo de destino al avanzar y **INFO** con la ficha y los datos técnicos (resolución, archivo, audio, subtítulos) sin salir del vídeo.
- **Atrás en el vídeo vuelve a la ficha** (la lista de fuentes solo si el vídeo no llegó a empezar o falló); para **cambiar de fuente** sin salir, ▼ → «Cambiar fuente…», que sigue en el mismo punto.
- **Pausa automática** al salir de la app (Home, cambio de fuente) y **protector de pantalla** con fondos que se funden si el vídeo lleva unos minutos en pausa (Ajustes → Reproducción: 3 min, 10 min o no).
- **Navegación más fluida en la tele**: las filas se desplazan con la GPU (sin repintar las carátulas) y las fuentes se piden en segundo plano al abrir la ficha, al quedarse 1 s sobre un episodio y durante el aviso del siguiente episodio, así que «▶ Ver» no espera a los addons.
- **Mi lista sin Trakt**: «＋ Mi lista» guarda en la tele (y en la copia de seguridad) y sale como fila en Inicio; con Trakt vinculado, sigue siendo tu lista de Trakt.
- **Marcar como visto a mano**: películas (botón en la ficha), episodios y temporadas enteras (botón verde); con Trakt también se añade o quita de su historial.
- **Botones de colores del mando**: rojo Mi lista, verde visto, amarillo Más como esto (en la ficha y sobre cualquier carátula); azul en el vídeo, cambiar fuente.
- **Protector de pantalla** (Ajustes → Protector de pantalla): sin tocar el mando unos minutos, fondos a pantalla completa con logo, nota y sinopsis de lo que elijas (pendientes de ver, Mi lista, novedades o un poco de todo); OK abre la ficha del título que se ve. Con el vídeo en pausa sigue el de siempre.
- **Audio**: por orden, el elegido a mano en esa película o serie, el de Ajustes, el idioma de la app y, si no, inglés antes que la primera pista; la tele se queda en silencio el segundo que tarda en aceptar la pista elegida.
- **Fuentes que se cortan**: tres cortes en 10 minutos ofrecen pasar a una fuente más ligera en el mismo punto (OK); si una fuente falla a mitad de vídeo, sigue sola con otra (hasta dos veces seguidas). Los cortes de cada vídeo quedan en el registro.
- **Saltar intro en cualquier serie**: si saltas la intro en dos episodios distintos en el mismo punto (de 30 s a 3 min hacia delante en los 10 primeros minutos), los siguientes ofrecen «⏭ OK: saltar intro» en ese tramo. En el anime manda AniSkip. El botón se quita a los 5 s si no lo pulsas y vuelve con el OSD mientras dure la intro.
- **Teclas 0-9 en el vídeo**: 1-9 van al 10 %-90 % y 0 al principio; la burbuja al avanzar dice también cuánto se salta.
- **Cola desde el móvil**: escribe títulos o enlaces de IMDb en `cola.txt` del Gist de la copia y llegan a Mi lista en unos minutos («ver …» abre además su ficha).
- **Buscar desde el móvil**: Buscar enseña un QR; al escanearlo se abre en el móvil una página donde lo que escribes (y envías) aparece en el cuadro de la tele y se busca al momento. Va por ntfy.sh con un tema secreto de cada tele, sin cuentas ni servidor propio, y solo mientras Buscar está abierta (la página está en `docs/buscar.html`, servida con GitHub Pages).
- **Siguientes episodios** con «Nuevo» (emitidos en las últimas 48 h, primero) y una insignia con los episodios que faltan por ver (también en Continuar, Mi lista y Visto recientemente). El progreso de cada serie se guarda en la tele y solo se vuelve a pedir a Trakt si ha cambiado.
- **Saga** en la ficha de las películas que forman parte de una (TMDB): todas en orden de estreno, con ✓ en las vistas.
- **Notas de Rotten Tomatoes y Metacritic** junto a la de IMDb con una clave gratuita de OMDb (Ajustes → Cuentas) y **dónde verla en España** con suscripción (TMDB/JustWatch).
- **Filas a tu gusto** (Ajustes → General → Filas de Inicio / Anime / Películas / Series): subir, bajar u ocultar cada fila, también las de los addons.
- **Listas famosas y premios, al día solas cada año**: en Películas, **IMDb Top 250**, **Óscar** y **Goya** de la última edición (la ganadora delante y marcada; entre las nominaciones y la gala, las nominadas) y, ocultas de serie, Globos de Oro, Palma de Oro (Cannes) y Ganadoras del Óscar; en Series, **IMDb Top 250 series**, **Emmy** (drama y comedia) y Globos de Oro (oculta). Los premios salen de la Wikipedia y Wikidata; las Top 250, de la lista pública de Trakt (basta su Client ID, sin vincular). Se guardan y se miran cada día en temporada de premios y cada semana el resto del año.
- **Recién llegado al streaming** (TMDB): en Inicio, lo que acaba de llegar a Netflix, Prime Video, Disney+, HBO Max, Apple TV+ y Movistar Plus+, películas y series mezcladas, lo más nuevo primero, con la plataforma en el nombre (una sola vez aunque esté en varias) y sin lo visto; en Películas y Series, lo de cada tipo. Sin nada que configurar: con debrid da igual dónde esté, sirve para descubrir. TMDB no sabe el día en que un título entra en una plataforma: se aproxima con la fecha de estreno (películas, últimos 60 días) o del último episodio (series, últimos 30 días).
- **Series que Trakt numera distinto** (Mashle, The Apothecary Diaries: en Trakt una sola temporada larga): los episodios se emparejan por fecha de emisión, así que salen como vistos, las filas dicen el episodio correcto y lo que ves se registra en Trakt con su número.
- **Sin spoilers** (Ajustes → General, desactivado de serie): en la ficha, los episodios que aún no has visto (en la tele o en Trakt) salen sin sinopsis ni imagen, solo con el título, y el INFO del vídeo muestra la sinopsis de la serie en vez de la del episodio.
- **Tu año en StremTV** (Ajustes, y en Inicio en diciembre y enero): horas, películas, episodios y series terminadas del año, tus series más vistas y tus películas mejor puntuadas, géneros, el mes y el día de la semana con más tele, la racha más larga y el día de maratón. Con Trakt, de todo su historial del año (se guarda: el año en curso se rehace a diario); sin Trakt, de lo visto en esta tele. Años anteriores con ◀ ▶.
- **Trakt**: vinculación con código, scrobble automático (visto al pasar del 80 %), «Continuar», tu lista, recomendaciones y episodios vistos. El anime se registra usando su equivalencia en IMDb.

## Instalación

StremTV se instala como **app propia firmada** en una Samsung Tizen en **modo desarrollador**. No se instala por TizenBrew: necesita el privilegio `avplay` del `config.xml` (que TizenBrew no concede) para reproducir MKV con el reproductor nativo.

**Necesitas:**
- Una Samsung Smart TV con **Tizen 3.0 o superior**.
- **Tizen Studio** (aporta `sdb`, el gestor de certificados y el empaquetador) o, como mínimo, el `sdb` de los Tizen tools.
- Un **certificado de autor** propio (Tizen Studio → *Certificate Manager*). El certificado del autor no se publica en este repositorio.

**Pasos:**
1. **Activa el modo desarrollador en la tele:** en *Aplicaciones (Apps)* teclea `12345`, activa *Developer mode* y escribe en *Host PC IP* la IP del ordenador desde el que vas a instalar. **Reinicia la tele** (solo aplica esa IP al reiniciar).
2. **Empaqueta y firma** la carpeta `app/` como un `.wgt` con tu certificado (Tizen Studio, o `tizen package -t wgt`). El repo incluye `build-wgt.sh` como ayuda del autor, pero depende de un certificado y del CLI de Tizen bajo `tools/`, que **no** están en Git.
3. **Instala** el paquete: `sdb connect <IP_de_la_tele>` y `sdb install StremTV.wgt` (o desde el *Device Manager* de Tizen Studio).
4. Abre **StremTV** desde la lista de aplicaciones de la tele.

## Configuración

Al abrir StremTV por primera vez, **Ajustes → Fuentes y debrid** se abre solo (aún sin ningún addon de fuentes). Todas las claves se guardan **solo en la tele** (y, si activas la copia, en tu Gist privado de GitHub).

### Fuentes y debrid (imprescindible para reproducir)
1. En **Addons**, pega la URL del *manifest* del addon de fuentes que uses (el mismo que en Stremio; por ejemplo Torrentio).
2. Si el addon admite debrid, elige el servicio y escribe tu clave:
   - **Real-Debrid**: https://real-debrid.com/apitoken
   - **AllDebrid**: https://alldebrid.com/apikeys

### Cuentas (Ajustes → Cuentas) — opcionales; cada una desbloquea funciones
| Servicio | Para qué sirve | Dónde se saca (gratis) |
|---|---|---|
| **Trakt** | Scrobble automático, Continuar, tu lista, recomendaciones, calendario y «Tu año». Además, su **Client ID** (sin vincular) habilita las listas **IMDb Top 250**. | trakt.tv/oauth/applications/new · Redirect URI `http://localhost` |
| **TMDB** | Títulos y sinopsis en **español**, filas por plataforma, recomendaciones (Sorpréndeme, Más como esto), reparto, saga, dónde ver y Recién llegado. Sin clave: todo en inglés y menos filas. | themoviedb.org → Ajustes → API |
| **OMDb** | Notas de **Rotten Tomatoes** y **Metacritic** junto a la de IMDb. | omdbapi.com → API Key (plan FREE, 1000/día) |
| **GitHub** (token con permiso `gist`) | **Copia de seguridad** diaria y restaurar, y la **cola** y **búsqueda desde el móvil**. | github.com/settings/tokens/new (marca solo `gist`) |

**Vincular Trakt:** en *Ajustes → Cuentas → Trakt* escribe el **Client ID** (el *Client Secret* solo si tu app de Trakt es antigua y lo tiene), pulsa **«Vincular con Trakt»**, entra en trakt.tv/activate e introduce el código que aparece en la tele.

## Actualizaciones

Una vez instalada, StremTV **se actualiza sola**: al arrancar comprueba el último commit de `main` en GitHub y descarga `app.js`/`style.css` (vía jsDelivr) para aplicarlos en el **siguiente** arranque. Para la mayoría de cambios **no hace falta reinstalar**.

Solo hay que **volver a empaquetar e instalar el `.wgt`** cuando cambian `boot.js`, `index.html` o `config.xml` (el cargador, el HTML base o los permisos/CSP), porque esos archivos no se autoactualizan.

## Mando
| Tecla | Navegación | Reproductor |
|---|---|---|
| Flechas | Moverse | ◀ ▶ retroceder/avanzar (pulsaciones seguidas aceleran), ▲ subtítulos, ▼ audio, fuente y temporizador |
| 0-9 | — | Ir al 0 %-90 % del vídeo |
| OK | Abrir | Pausa/continuar |
| INFO | — | Ficha y datos técnicos (cualquier tecla lo cierra) |
| 🔴 Rojo | Añadir/quitar de Mi lista | — |
| 🟢 Verde | Marcar visto (película, episodio o temporada) | — |
| 🟡 Amarillo | Más como esto | — |
| 🔵 Azul | — | Cambiar fuente |
| Atrás | Volver | Salir a la ficha (guarda la posición) |

## Desarrollo
El código está partido en módulos en `app/src/` (por orden: base, idioma, ajustes, Trakt, navegación, pantallas, reproductor…). La tele carga un solo `app/app.js`, que se genera uniéndolos: **se edita en `app/src/` y después se ejecuta `node tools/build-app.js`** (`--check` dice si está al día; `build-wgt.sh` no empaqueta uno desfasado). Los módulos comparten una sola función (`00-base.js` la abre y `16-start.js` la cierra), así que por separado no son JavaScript válido.

Tests (Chrome + puppeteer-core): `cd test && npm install && npm test` los pasa todos de uno en uno y dice cuáles fallan (sirve `app/` en los puertos 8090 y 8091 si no hay nada en ellos; con `STV_PORT=8190` usa 8190 y 8191, para pasar a la vez los de otra copia, como un worktree); `node test/run-all.js upnext v20` pasa solo esos. `update.js` y `loader2.js` se saltan: necesitan un paquete firmado o la red y se pasan a mano.
```
node tools/build-app.js                 # genera app/app.js desde app/src
cd app && python3 -m http.server 8090   # abrir http://127.0.0.1:8090 (flechas, Intro, Esc)
cd test && npm i && node ui.js && node player.js && node trakt.js && node v18.js && node saver.js && node v20.js   # pruebas headless con capturas en test/shots
```

## Aviso
StremTV no aloja, indexa ni proporciona contenido, y no incluye ningún addon de fuentes. Solo muestra lo que devuelven los addons que añada cada usuario, que es responsable de usarlos conforme a la ley y a los derechos de autor de su país.
