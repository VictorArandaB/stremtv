// Pasa todos los tests de uno en uno y dice cuáles fallan. Sirve app/ en 8090 (desarrollo) y 8091 (como en la tele)
// si no hay ya algo escuchando; con STV_PORT=8190 usa 8190 y 8191 (para pasar los tests de otra copia a la vez). Uso: npm test (en test/) o node test/run-all.js [nombres…] (p. ej. upnext v20).
// Un test falla si sale con código distinto de 0, si escribe «MAL …» o «✗ …», o «ERRORES:» con algo distinto de «ninguno».
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const DIR = __dirname, APP = path.join(DIR, '..', 'app');
const TIMEOUT = 300000;
const PORT = +(process.env.STV_PORT || 8090), PORT2 = +(process.env.STV_PORT2 || PORT + 1);
// necesitan algo que no se puede montar aquí: se pasan a mano
const SKIP = {
  'update.js': 'necesita wgt-build en 8092 y una versión antigua como argumento',
  'loader2.js': 'baja la última versión de GitHub (red y límite de 60 consultas/hora)'
};

const listening = (port) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1', () => { s.end(); resolve(true); });
  s.on('error', () => resolve(false));
});

async function serve(port) {
  if (await listening(port)) return null;
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', APP], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await listening(port)); i++) await new Promise((r) => setTimeout(r, 100));
  return srv;
}

function run(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let out = '';
    const child = spawn(process.execPath, [path.join(DIR, file)], { cwd: DIR, env: Object.assign({}, process.env, { STV_PORT: String(PORT), STV_PORT2: String(PORT2) }) });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += '\n(se pasó de ' + TIMEOUT / 1000 + ' s)'; child.kill('SIGKILL'); }, TIMEOUT);
    child.on('close', (code) => {
      clearTimeout(timer);
      const lines = out.split('\n');
      // «✗ » solo cuenta en los tests que lo usan para sus comprobaciones (en otros es texto de la app, p. ej. «✗ Falló»)
      const cross = fs.readFileSync(path.join(DIR, file), 'utf8').indexOf("'✗ '") >= 0;
      // tras un «ERRORES:» vacío vienen los errores, uno por línea; los 404 de imágenes o del favicon no cuentan
      let inErrs = false;
      const bad = lines.filter((l) => {
        if (/^ERRORES:/.test(l)) { inErrs = !/ninguno/.test(l); return inErrs && l.replace(/^ERRORES:\s*/, '') !== ''; }
        if (inErrs && l.trim() && !/Failed to load resource/.test(l)) return true;
        return /^MAL /.test(l) || (cross && /^✗ /.test(l)) || /se pasó de/.test(l);
      });
      resolve({ file, ok: code === 0 && !bad.length, code, bad, out, secs: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

(async () => {
  const only = process.argv.slice(2).map((n) => n.replace(/\.js$/, '') + '.js');
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js') && f !== 'run-all.js')
    .filter((f) => !only.length || only.indexOf(f) >= 0).sort();
  const servers = [await serve(PORT), await serve(PORT2)];
  const results = [];
  for (const f of files) {
    if (SKIP[f] && !only.length) { console.log('--   ' + f + ' (se salta: ' + SKIP[f] + ')'); continue; }
    const r = await run(f);
    results.push(r);
    console.log((r.ok ? 'OK   ' : 'MAL  ') + f + ' (' + r.secs + ' s)');
    if (!r.ok) {
      const show = r.bad.length ? r.bad : r.out.trim().split('\n').slice(-8);
      show.forEach((l) => console.log('       ' + l));
      if (r.code) console.log('       código de salida ' + r.code);
    }
  }
  servers.forEach((s) => s && s.kill());
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (failed.length ? failed.length + ' de ' + results.length + ' fallan: ' + failed.map((r) => r.file).join(', ')
    : 'TODO BIEN (' + results.length + ' tests)'));
  process.exit(failed.length ? 1 : 0);
})();
