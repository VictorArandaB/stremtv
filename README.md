# StremTV

Cliente ligero tipo Stremio para **teles Samsung Tizen 3+ (2017 en adelante)**, pensado para instalarse como módulo de [TizenBrew](https://github.com/reisxd/TizenBrew).

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
- **Addons de Stremio**: en Ajustes → Fuentes y debrid se pega la URL de un manifest; sus fuentes se suman entre sí, sus catálogos salen en Inicio (hasta 4 filas) y en la búsqueda, y sus subtítulos en el menú ▲.
- **Explorar**: películas o series por género y año, populares o mejor valoradas.
- **Esta semana en tus series** (Trakt): episodios de las series que sigues, de hace dos días a una semana vista.
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
- **Siguientes episodios** con «Nuevo» (emitidos en las últimas 48 h, primero) y una insignia con los episodios que faltan por ver (también en Continuar, Mi lista y Visto recientemente). El progreso de cada serie se guarda en la tele y solo se vuelve a pedir a Trakt si ha cambiado.
- **Tráiler** en la ficha: se abre en TizenTube (en español si TMDB lo tiene). Hace falta haber abierto TizenTube una vez desde que se encendió la tele.
- **Saga** en la ficha de las películas que forman parte de una (TMDB): todas en orden de estreno, con ✓ en las vistas.
- **Notas de Rotten Tomatoes y Metacritic** junto a la de IMDb con una clave gratuita de OMDb (Ajustes → Cuentas) y **dónde verla en España** con suscripción (TMDB/JustWatch).
- **Filas de Inicio a tu gusto** (Ajustes → General → Filas de Inicio): subir, bajar u ocultar cada fila, también las de los addons.
- **Series que Trakt numera distinto** (Mashle, The Apothecary Diaries: en Trakt una sola temporada larga): los episodios se emparejan por fecha de emisión, así que salen como vistos, las filas dicen el episodio correcto y lo que ves se registra en Trakt con su número.
- **Trakt**: vinculación con código, scrobble automático (visto al pasar del 80 %), «Continuar», tu lista, recomendaciones y episodios vistos. El anime se registra usando su equivalencia en IMDb.

## Instalar en TizenBrew
Módulos → Añadir módulo GitHub → `<usuario>/stremtv`

Después, en **Ajustes → Fuentes y debrid** (se abre solo mientras no haya ningún addon de fuentes):
1. En **Addons**, pega la URL del manifest del addon de fuentes que uses (el mismo que en Stremio).
2. Si es un addon con debrid, elige el servicio y escribe tu clave API:
- Real-Debrid: https://real-debrid.com/apitoken
- AllDebrid: https://alldebrid.com/apikeys

La clave solo se guarda en la tele.

### Trakt
1. Crea una app en https://trakt.tv/oauth/applications/new (nombre libre, Redirect URI `http://localhost`).
2. En Ajustes → Trakt escribe el Client ID (el Client Secret solo si tu app es antigua y lo tiene) y pulsa «Vincular con Trakt».
3. Entra en trakt.tv/activate e introduce el código que aparece en la tele.

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

Tests (Chrome + puppeteer-core): `cd test && npm install && npm test` los pasa todos de uno en uno y dice cuáles fallan (sirve `app/` en los puertos 8090 y 8091 si no hay nada en ellos); `node test/run-all.js upnext v20` pasa solo esos. `update.js` y `loader2.js` se saltan: necesitan un paquete firmado o la red y se pasan a mano.
```
node tools/build-app.js                 # genera app/app.js desde app/src
cd app && python3 -m http.server 8090   # abrir http://127.0.0.1:8090 (flechas, Intro, Esc)
cd test && npm i && node ui.js && node player.js && node trakt.js && node v18.js && node saver.js && node v20.js   # pruebas headless con capturas en test/shots
```

## Aviso
StremTV no aloja, indexa ni proporciona contenido, y no incluye ningún addon de fuentes. Solo muestra lo que devuelven los addons que añada cada usuario, que es responsable de usarlos conforme a la ley y a los derechos de autor de su país.
