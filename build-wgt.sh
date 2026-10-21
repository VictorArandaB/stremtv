#!/bin/sh
# Empaqueta y firma StremTV como app de Tizen (permite el reproductor nativo AVPlay).
# Uso: ./build-wgt.sh   -> StremTV.wgt en la raíz del proyecto
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/wgt-build"
rm -rf "$OUT" "$ROOT/StremTV.wgt" && mkdir -p "$OUT"
cp "$ROOT"/app/index.html "$ROOT"/app/app.js "$ROOT"/app/style.css "$OUT"/
cp "$ROOT"/wgt/config.xml "$ROOT"/wgt/icon.png "$OUT"/
# tizen.js empaqueta el directorio actual (ignora el argumento), así que se ejecuta desde $OUT
cd "$OUT"
node "$ROOT/tools/node_modules/tizen/cli.js" build . -t wgt -o "$ROOT/StremTV.wgt" \
  --author "$ROOT/tools/author.p12" --authorPwd "$(cat "$ROOT/tools/author.pwd")" -p public
# comprobación: solo deben ir los archivos de la app y las firmas
EXTRA=$(unzip -Z1 "$ROOT/StremTV.wgt" | grep -vxE 'index.html|app.js|style.css|config.xml|icon.png|author-signature.xml|signature1.xml' || true)
if [ -n "$EXTRA" ]; then echo "ERROR: archivos inesperados en el paquete:"; echo "$EXTRA"; rm -f "$ROOT/StremTV.wgt"; exit 1; fi
echo "OK: $(unzip -Z1 "$ROOT/StremTV.wgt" | tr '\n' ' ')"
