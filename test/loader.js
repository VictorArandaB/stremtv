const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  for (const port of [8090, 8091]) {
    const p = await b.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2' }); await sleep(2500);
    const r = await p.evaluate(() => ({
      app: !!window.StremTV, focus: (document.querySelector('.focused') || {}).textContent,
      js: Array.from(document.scripts).map((s) => s.src).filter((s) => /app\.js/.test(s)),
      css: Array.from(document.querySelectorAll('link')).map((l) => l.href),
    }));
    console.log(port, JSON.stringify(r), errs.length ? 'ERR ' + errs : '');
  }
  await b.close();
})();
