#!/usr/bin/env node
// PUBLICAR = revisión estática + testing completo + versión de caché + commit + push a main.
// Vercel publica solo cuando llega el push. Si algo falla, NO se publica nada.
// Uso:  node tools/release.js "Qué cambió, en una línea"
const fs = require('fs'), path = require('path'), crypto = require('crypto'), {execSync, spawnSync} = require('child_process');
const root = path.join(__dirname, '..');
const msg = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ').trim();
if (!msg) { console.error('Falta el mensaje: node tools/release.js "Qué cambió"'); process.exit(2); }
const sh = (c, o) => execSync(c, {cwd: root, stdio: 'pipe', ...o}).toString().trim();
const run = (args) => { const r = spawnSync('node', args, {cwd: root, stdio: 'inherit'}); if (r.status !== 0) { console.error('\n✗ ' + args[0] + ' falló — NO se publica.'); process.exit(1); } };

// 1) lo que hay que pasar ANTES de tocar nada
console.log('── 1/4 Revisión estática'); run(['tools/check.js']);
console.log('── 2/4 Testing completo (escritorio, iPad y celular; admin y atleta)'); run(['tools/test.js']);

// 2) versión de caché: solo si cambió algo que los celulares guardan
const files = ['app.js', 'styles.css', 'index.html', 'sw.js', 'manifest.json'];
const strip = s => s.replace(/\?v=[\w.-]+/g, '?v=X').replace(/CACHE_NAME\s*=\s*'[^']*'/, "CACHE_NAME='X'");
const hash = crypto.createHash('sha1');
files.forEach(f => hash.update(strip(fs.readFileSync(path.join(root, f), 'utf8'))));
const ver = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + hash.digest('hex').slice(0, 7);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const html2 = html.replace(/(app\.js|styles\.css)\?v=[\w.-]+/g, '$1?v=' + ver);
const sw2 = sw.replace(/CACHE_NAME\s*=\s*'[^']*'/, "CACHE_NAME = 'gmetrics-" + ver + "'");
if (html2 !== html) fs.writeFileSync(path.join(root, 'index.html'), html2);
if (sw2 !== sw) fs.writeFileSync(path.join(root, 'sw.js'), sw2);
console.log('── 3/4 Versión de caché: ' + ver); run(['tools/check.js']);

// 3) commit + push
console.log('── 4/4 Publicando');
sh('git add -A');
if (!sh('git status --porcelain')) { console.log('No hay cambios para publicar.'); process.exit(0); }
const body = msg + '\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>';
fs.writeFileSync(path.join(root, '.git', 'GM_MSG'), body);
sh('git commit -F .git/GM_MSG');
try { sh('git pull --rebase origin main'); } catch (e) { console.error('✗ No pude integrar lo último de GitHub:\n' + e.message); process.exit(1); }
try { sh('git push origin main'); } catch (e) { console.error('✗ El push falló:\n' + e.message); process.exit(1); }
console.log('✓ Publicado: ' + sh('git log -1 --format=%h') + ' — Vercel lo despliega en ~1 minuto. Versión ' + ver);
