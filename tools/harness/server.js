// Servidor del entorno de prueba: sirve la app real (carpeta del proyecto) con
// Firebase reemplazado por stubs locales. NUNCA toca datos reales.
const http = require('http'), fs = require('fs'), path = require('path');
const proj = path.join(__dirname, '..', '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};

function start(port) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/' || p === '/_test_index') p = '/_test_index.html';
      const f = [path.join(__dirname, p), path.join(proj, p)].find(c => c.startsWith(proj) && fs.existsSync(c) && fs.statSync(c).isFile());
      if (!f) { res.writeHead(404); res.end('nf ' + p); return; }
      res.writeHead(200, {'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
      res.end(fs.readFileSync(f));
    }).listen(port || 0, () => resolve({srv, port: srv.address().port}));
  });
}
module.exports = {start};
if (require.main === module) start(8735).then(r => console.log('harness en http://localhost:' + r.port));
