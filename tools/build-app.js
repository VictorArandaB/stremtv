#!/usr/bin/env node
// Une app/src/*.js (en orden de nombre) en app/app.js, que es lo que cargan la tele (paquete o jsDelivr) y las pruebas.
// Los módulos comparten el ámbito de una sola función: 00-base.js la abre y el último la cierra, así que por separado
// no son JavaScript válido; se edita en src/ y se vuelve a generar.
// Uso: node tools/build-app.js          -> escribe app/app.js
//      node tools/build-app.js --check  -> sale con código 1 si app/app.js no corresponde a src/
'use strict';
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');
const SRC = path.join(APP, 'src');
const OUT = path.join(APP, 'app.js');
const HEADER = '// Archivo generado por tools/build-app.js a partir de app/src/*.js: no editar a mano.\n';

const files = fs.readdirSync(SRC).filter((f) => /^\d\d-.+\.js$/.test(f)).sort();
const code = HEADER + files.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\n*$/, '\n')).join('\n');

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== code) { console.error('app/app.js no está al día con app/src: ejecuta node tools/build-app.js'); process.exit(1); }
  console.log('app/app.js al día (' + files.length + ' módulos)');
} else {
  fs.writeFileSync(OUT, code);
  console.log('app/app.js generado con ' + files.length + ' módulos: ' + files.join(', '));
}
