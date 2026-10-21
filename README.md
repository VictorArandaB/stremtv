# StremTV

Cliente ligero tipo Stremio para **teles Samsung Tizen 3+ (2017 en adelante)**, pensado para instalarse como módulo de [TizenBrew](https://github.com/reisxd/TizenBrew).

Escrito en ES5 y CSS sin funciones modernas para que funcione en el motor web de Tizen 3 (Chromium ~47), donde la web oficial de Stremio no carga (necesita WebAssembly).

## Qué hace
- Catálogo y búsqueda de películas y series (Cinemeta).
- **Anime**: en emisión, tendencias, populares y mejor valorados, con búsqueda (addon Kitsu; acepta IDs de AniDB/MAL/AniList).
- Fuentes de Torrentio a través de **Real-Debrid** o **AllDebrid** (enlaces directos: la tele solo reproduce).
- Prioriza fuentes en español y marca las instantáneas (en caché).
- Reproductor nativo de Samsung (AVPlay) si está disponible, con HTML5 como alternativa. Cambio de pista de audio con AVPlay.
- Subtítulos en español/inglés de OpenSubtitles, con ajuste de sincronía.
- «Continuar viendo» y progreso por episodio (guardado en la propia tele).
- **Siguiente episodio automático**: aviso en los últimos 40 s con cuenta atrás de 10 s (OK lo pone ya, Atrás lo descarta).
- En cada serie recuerda la **fuente** (misma release o pack) y la **pista de audio** elegidas y las usa en los demás episodios.
- **Explorar**: películas o series por género y año, populares o mejor valoradas.
- **Esta semana en tus series** (Trakt): episodios de las series que sigues, de hace dos días a una semana vista.
- **Reproducción directa**: «▶ Ver» arranca la mejor fuente (instantánea, que quepa en la conexión, o la misma release que en el episodio anterior); Atrás lleva a la lista para elegir otra.
- Hora a la que termina el vídeo en la barra, subtítulos con fondo y subtítulos del propio MKV por defecto si los trae en tu idioma.
- **App en español o inglés** (Ajustes → Idioma de la app, primera opción).
- **Idioma del audio elegible** (español, inglés, francés, alemán, italiano, portugués, japonés, coreano, catalán u original): se pone solo si el archivo lo trae, y si coincide con el de los subtítulos automáticos, no los pone.
- **Trakt**: vinculación con código, scrobble automático (visto al pasar del 80 %), «Continuar», tu lista, recomendaciones y episodios vistos. El anime se registra usando su equivalencia en IMDb.

## Instalar en TizenBrew
Módulos → Añadir módulo GitHub → `<usuario>/stremtv`

Después, en **Ajustes** de la app, elige el servicio y escribe tu clave API:
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
| Flechas | Moverse | ◀ ▶ retroceder/avanzar (pulsaciones seguidas aceleran), ▲ subtítulos, ▼ audio |
| OK | Abrir | Pausa/continuar |
| Atrás | Volver | Salir (guarda la posición) |

## Desarrollo
```
cd app && python3 -m http.server 8090   # abrir http://127.0.0.1:8090 (flechas, Intro, Esc)
cd test && npm i && node ui.js && node player.js && node trakt.js   # pruebas headless con capturas en test/shots
```
