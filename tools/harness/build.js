// Genera la copia de prueba de la app: igual que la real pero con los imports de
// Firebase apuntando a los stubs. Los archivos _test_* están en .gitignore.
const fs = require('fs'), path = require('path');
const proj = path.join(__dirname, '..', '..');
module.exports = function build() {
  let app = fs.readFileSync(path.join(proj, 'app.js'), 'utf8');
  const before = app;
  app = app.replace('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js', './firebase_app.js')
           .replace('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js', './firebase_auth.js')
           .replace('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js', './firebase_firestore.js');
  const swapped = (app.match(/\.\/firebase_/g) || []).length;
  if (swapped !== 3) throw new Error('No se pudieron reemplazar los 3 imports de Firebase (¿cambió la versión del SDK?) — encontrados: ' + swapped);
  fs.writeFileSync(path.join(__dirname, '_test_app.js'), app);
  let idx = fs.readFileSync(path.join(proj, 'index.html'), 'utf8');
  idx = idx.replace(/app\.js\?v=[^"]*/, '_test_app.js');
  fs.writeFileSync(path.join(__dirname, '_test_index.html'), idx);
  return {bytes: app.length, source: before.length};
};
if (require.main === module) console.log('build', module.exports());
