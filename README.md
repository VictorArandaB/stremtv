# StremTV

Cliente ligero tipo Stremio para **teles Samsung Tizen 3+ (2017 en adelante)**, pensado para instalarse como módulo de [TizenBrew](https://github.com/reisxd/TizenBrew).

Escrito en ES5 y CSS sin funciones modernas para que funcione en el motor web de Tizen 3 (Chromium ~47), donde la web oficial de Stremio no carga (necesita WebAssembly).

## Qué hace
- Catálogo y búsqueda de películas y series (Cinemeta).
- Fuentes de Torrentio a través de **Real-Debrid** o **AllDebrid** (enlaces directos: la tele solo reproduce).
- Prioriza fuentes en español y marca las instantáneas (en caché).
- Reproductor nativo de Samsung (AVPlay) si está disponible, con HTML5 como alternativa. Cambio de pista de audio con AVPlay.
- Subtítulos en español/inglés de OpenSubtitles, con ajuste de sincronía.
- «Continuar viendo» y progreso por episodio (guardado en la propia tele).

## Instalar en TizenBrew
Módulos → Añadir módulo GitHub → `<usuario>/stremtv`

Después, en **Ajustes** de la app, elige el servicio y escribe tu clave API:
- Real-Debrid: https://real-debrid.com/apitoken
- AllDebrid: https://alldebrid.com/apikeys

La clave solo se guarda en la tele.

## Mando
| Tecla | Navegación | Reproductor |
|---|---|---|
| Flechas | Moverse | ◀ ▶ retroceder/avanzar (pulsaciones seguidas aceleran), ▲ subtítulos, ▼ audio |
| OK | Abrir | Pausa/continuar |
| Atrás | Volver | Salir (guarda la posición) |

## Desarrollo
```
cd app && python3 -m http.server 8090   # abrir http://127.0.0.1:8090 (flechas, Intro, Esc)
cd test && npm i && node ui.js && node player.js   # pruebas headless con capturas en test/shots
```
