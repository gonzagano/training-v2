#!/usr/bin/env node
// DEPARTAMENTO DE TESTING — corre la app REAL en un navegador (Edge sin pantalla)
// con Firebase falso y datos de prueba, en celular/iPad/escritorio, claro y oscuro.
// Uso:  node tools/test.js            (completo: 3 tamaños)
//       node tools/test.js --quick    (1 tamaño, para iterar)
// Sale con código 0 solo si NO hay fallas ni errores de consola. NO toca datos reales.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), {execSync, spawn, spawnSync} = require('child_process');
const puppeteer = require('./node_modules/puppeteer-core');
const build = require('./harness/build');
const {start} = require('./harness/server');

const EDGE = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => p && fs.existsSync(p));

const SCENARIOS = [
  {label: 'escritorio 1280 oscuro', width: 1280, height: 800, theme: 'dark'},
  {label: 'iPad 768 claro', width: 768, height: 1024, theme: 'light'},
  {label: 'celular 390 oscuro', width: 390, height: 844, theme: 'dark', mobile: true},
];
const SCRIPTS = ['regress.js', 'athlete.js'];
const quick = process.argv.includes('--quick');

(async () => {
  if (!EDGE) { console.error('No encontré Edge/Chrome. Definí BROWSER_PATH.'); process.exit(2); }
  try { execSync('node --version', {stdio: 'ignore'}); } catch (e) {}
  const b = build();
  console.log('Build de prueba OK (' + b.bytes + ' bytes)');
  const {srv, port} = await start(0);
  // Edge/Chrome se lanzan a mano (el método por pipe de puppeteer falla con Edge) y nos conectamos por puerto.
  const dbgPort = 9400 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), 'gm-test-profile-' + Date.now());
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=' + dbgPort, '--user-data-dir=' + profile, 'about:blank'], {stdio: 'ignore'});
  const ready = async () => { for (let i = 0; i < 60; i++) { const ok = await new Promise(r => http.get('http://127.0.0.1:' + dbgPort + '/json/version', x => { x.resume(); r(x.statusCode === 200); }).on('error', () => r(false))); if (ok) return true; await new Promise(r => setTimeout(r, 500)); } return false; };
  if (!(await ready())) { console.error('El navegador de prueba no arrancó.'); proc.kill(); process.exit(2); }
  const browser = await puppeteer.connect({browserURL: 'http://127.0.0.1:' + dbgPort, defaultViewport: null});
  const killBrowser = () => {
    // Edge deja procesos hijos sueltos: se cierran TODOS los que usan el perfil temporal de esta corrida.
    try {
      if (process.platform === 'win32') spawnSync('powershell', ['-NoProfile', '-File', path.join(__dirname, 'kill-profile.ps1'), path.basename(profile)], {stdio: 'ignore'});
      else proc.kill('SIGKILL');
    } catch (e) { try { proc.kill(); } catch (e2) {} }
    try { fs.rmSync(profile, {recursive: true, force: true}); } catch (e) {}
  };
  const seed = fs.readFileSync(path.join(__dirname, 'harness', 'seed_full.js'), 'utf8');
  const report = [];
  let failed = false;
  for (const sc of (quick ? SCENARIOS.slice(0, 1) : SCENARIOS)) {
    for (const script of SCRIPTS) {
      const code = fs.readFileSync(path.join(__dirname, 'harness', script), 'utf8');
      const key = script === 'regress.js' ? '__regress' : '__athlete';
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.setViewport({width: sc.width, height: sc.height, isMobile: !!sc.mobile, hasTouch: !!sc.mobile, deviceScaleFactor: 1});
      const consoleErrs = [];
      page.on('pageerror', e => consoleErrs.push('pageerror: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|manifest|serviceworker|sw\.js/i.test(m.text())) consoleErrs.push('console: ' + m.text().slice(0, 200)); });
      const t0 = Date.now();
      let res = null, err = null;
      try {
        await page.evaluateOnNewDocument(t => { try { localStorage.setItem('gm-theme', t); } catch (e) {} }, sc.theme);
        await page.goto(`http://localhost:${port}/`, {waitUntil: 'load'});
        await page.evaluate(seed);                       // deja los datos de prueba en el Firestore falso
        const user = script === 'athlete.js' ? 'u1' : 'admin1';
        if (user !== 'admin1') await page.evaluate(u => localStorage.setItem('__testUser', JSON.stringify({uid: u, email: u + '@test.com'})), user);
        await page.reload({waitUntil: 'load'});
        await new Promise(r => setTimeout(r, 2500));
        await page.evaluate(`window.${key}=null; ${code}`).catch(e => { err = e.message; });
        await page.waitForFunction(k => window[k], {timeout: 150000, polling: 500}, key);
        res = await page.evaluate(k => window[k], key);
      } catch (e) { err = e.message; }
      await ctx.close();
      const fails = (res && res.fails) || [];
      const errs = [...((res && res.errs) || []), ...consoleErrs];
      const ok = !err && res && !fails.length && !errs.length;
      if (!ok) failed = true;
      report.push({sc: sc.label, script, ok});
      console.log(`${ok ? '✓' : '✗'} ${script.padEnd(12)} ${sc.label.padEnd(26)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      if (err) console.log('    error del runner:', err);
      fails.forEach(f => console.log('    FALLA:', f));
      errs.forEach(e => console.log('    ERROR:', e));
    }
  }
  try { await browser.disconnect(); } catch (e) {} killBrowser(); srv.close();
  console.log(failed ? '\nTESTING: HAY FALLAS — no se puede publicar.' : '\nTESTING: todo en verde.');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
