#!/usr/bin/env node
// REVISIÓN ESTÁTICA (rápida, sin navegador). Corre antes de cada publicación.
// Frena si: el código no se puede leer, un botón llama a una función que no existe
// en window, hay archivos de prueba versionados, o la versión de caché es incoherente.
const fs = require('fs'), path = require('path'), {execSync} = require('child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const errors = [], warns = [];
const err = m => errors.push(m);

// 1) app.js se puede leer (se quitan los imports porque new Function no los acepta)
const app = read('app.js');
try { new Function(app.replace(/^\s*import[\s\S]*?from\s+['"][^'"]+['"];?/mg, '')); }
catch (e) { err('app.js tiene un error de sintaxis: ' + e.message); }

// 2) cada handler inline (onclick="foo(...)") apunta a algo que existe
const html = read('index.html');
function stripTemplates(s) { // saca ${ ... } con llaves balanceadas
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') { let d = 1; i += 2; while (i < s.length && d) { if (s[i] === '{') d++; else if (s[i] === '}') d--; i++; } out += '__T__'; }
    else out += s[i++];
  }
  return out;
}
const SKIP = new Set(['__T__','if','else','for','while','return','function','typeof','new','event','this','S','document','window','history','location','JSON','Math','Number','String','Array','Object','Date','parseInt','parseFloat','isNaN','confirm','alert','prompt','setTimeout','clearTimeout','setInterval','encodeURIComponent','decodeURIComponent','stopPropagation','preventDefault','getElementById','querySelector','querySelectorAll','closest','classList','style','value','click','focus','blur','select','remove','add','toggle','contains','scrollIntoView','scrollTo','open','close','trim','replace','slice','join','map','filter','toFixed','toLowerCase','toUpperCase','includes','indexOf','push','test','back','forward','reload','dispatchEvent','Event','stopImmediatePropagation','getAttribute','setAttribute','removeAttribute','insertAdjacentHTML','appendChild','removeChild','cloneNode','matches','parentNode','nextElementSibling','previousElementSibling','children','innerHTML','textContent','checked','disabled','files','length','key','target','currentTarget','which','keyCode']);
const names = new Set();
const handlerRe = /\bon(?:click|change|input|blur|focus|keydown|keyup|keypress|submit|dblclick|touchstart|touchend|mouseover|mouseout|mousedown|mouseup|oninput|scroll|load|error)\s*=\s*"([^"]*)"/g;
for (const src of [app, html]) {
  let m; const clean = stripTemplates(src);
  while ((m = handlerRe.exec(clean))) {
    const body = m[1].replace(/'[^']*'/g, "''").replace(/&quot;[^&]*&quot;/g, '');
    const callRe = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g; let c;
    while ((c = callRe.exec(body))) if (!SKIP.has(c[2])) names.add(c[2]);
  }
}
const defined = new Set();
for (const src of [app, html]) {
  for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
  for (const m of src.matchAll(/window\[\s*['"]([\w$]+)['"]\s*\]\s*=/g)) defined.add(m[1]);
  for (const m of src.matchAll(/Object\.assign\(\s*window\s*,\s*\{([^}]*)\}/g)) m[1].split(',').forEach(x => defined.add(x.split(':')[0].trim()));
  for (const m of src.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/mg)) if (src === html) defined.add(m[1]);
  for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=\s*window\./g)) defined.add(m[1]);
}
// multi-asignaciones tipo: window.a=a; window.b=b;  ya cubiertas arriba
const missing = [...names].filter(n => !defined.has(n)).sort();
if (missing.length) err('Botones que llaman a funciones sin exportar a window (no van a funcionar): ' + missing.join(', '));

// 3) versión de caché coherente entre index.html y sw.js
const vApp = (html.match(/app\.js\?v=([\w.-]+)/) || [])[1], vCss = (html.match(/styles\.css\?v=([\w.-]+)/) || [])[1];
if (!vApp || !vCss) err('index.html: faltan los parámetros ?v= de app.js / styles.css');
else if (vApp !== vCss) err('index.html: app.js?v=' + vApp + ' y styles.css?v=' + vCss + ' no coinciden');
const sw = read('sw.js');
if (!/CACHE_NAME\s*=\s*['"][^'"]+['"]/.test(sw)) err('sw.js: no encuentro CACHE_NAME');

// 4) JSON válidos y archivos referenciados presentes
try { JSON.parse(read('manifest.json')); } catch (e) { err('manifest.json inválido: ' + e.message); }
for (const m of html.matchAll(/(?:src|href)="((?!https?:|data:|#|mailto:)[^"?]+)(?:\?[^"]*)?"/g)) {
  if (!fs.existsSync(path.join(root, m[1]))) err('index.html referencia un archivo que no existe: ' + m[1]);
}

// 5) nada de prueba dentro de lo que se publica
try {
  const tracked = execSync('git ls-files', {cwd: root}).toString().split('\n').filter(Boolean);
  const bad = tracked.filter(f => /(^|\/)_test_|\.bak($|_)|\.orig$|node_modules\//.test(f));
  if (bad.length) err('Hay archivos de prueba/respaldo versionados: ' + bad.join(', '));
} catch (e) { warns.push('No pude revisar archivos versionados (¿no es un repo git?)'); }

// 6) cosas que nunca deberían llegar a producción
if (/\bdebugger\b/.test(app)) err('app.js contiene "debugger"');
if (/__testUser|__db\b/.test(app) || /__testUser|__db\b/.test(html)) err('app.js/index.html mencionan el Firestore falso de pruebas (__db/__testUser)');

// 7) sistema de diseño (ver el bloque "SISTEMA DE DISEÑO v1" al final de styles.css):
//    solo tamaños de letra de la escala, redondeos permitidos, sin MAYÚSCULAS forzadas
//    y ningún color hex nuevo fuera de la lista tools/design-colors.txt.
{
  const FS = new Set([11, 13, 15, 17, 22, 30, 44]);
  const css = read('styles.css'), files = {'styles.css': css, 'app.js': app, 'index.html': html};
  const colorsFile = path.join(__dirname, 'design-colors.txt');
  const hexes = s => [...s.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase());
  if (process.argv.includes('--baseline-colors')) {
    const all = [...new Set(Object.values(files).flatMap(hexes))].sort();
    fs.writeFileSync(colorsFile, '# Colores permitidos (hex). Uno nuevo: mejor usar una variable de styles.css (--accent, --text2, --red…)\n' + all.join('\n') + '\n');
    console.log('design-colors.txt: ' + all.length + ' colores');
  }
  const allowed = fs.existsSync(colorsFile) ? new Set(read('tools/design-colors.txt').split('\n').map(l => l.trim()).filter(l => /^#[0-9a-f]{3,8}$/.test(l))) : null;
  for (const [f, s] of Object.entries(files)) {
    const badFs = [...new Set([...s.matchAll(/font-size:\s*([0-9.]+)px/g)].map(m => +m[1]).filter(v => !FS.has(v)))];
    if (badFs.length) err(f + ': tamaños de letra fuera de la escala 11/13/15/17/22/30/44 → ' + badFs.join(', ') + ' px');
    const badR = [...new Set([...s.matchAll(/border-radius:\s*([0-9.]+)px(?=[\s;}"'!])/g)].map(m => +m[1]).filter(v => v > 4 && v !== 10 && v !== 16 && v !== 999))];
    if (badR.length) err(f + ': redondeos fuera del sistema (10/16/999, o ≤4 en barritas) → ' + badR.join(', ') + ' px');
    if (/text-transform:\s*uppercase/.test(s)) err(f + ': text-transform:uppercase (el sistema no usa etiquetas en MAYÚSCULAS)');
    if (allowed) { const nuevos = [...new Set(hexes(s).filter(h => !allowed.has(h)))]; if (nuevos.length) err(f + ': colores nuevos fuera del sistema → ' + nuevos.join(', ') + ' (usar una variable de styles.css)'); }
  }
}

warns.forEach(w => console.log('  aviso:', w));
if (errors.length) { console.log('CHECK: ' + errors.length + ' problema(s):'); errors.forEach(e => console.log('  ✗ ' + e)); process.exit(1); }
console.log('CHECK: revisión estática OK (' + names.size + ' funciones de botones verificadas)');
