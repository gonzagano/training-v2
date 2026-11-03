// Función serverless de Vercel — cuadros de un video de YouTube para la
// miniatura animada de los ejercicios. YouTube solo publica 3 fotos por
// video; estas son las fotitos que su reproductor muestra al arrastrar la
// barra (storyboard): una cada ~2 s, de a 25 por imagen. El navegador no
// puede leer la página de YouTube (no manda headers CORS), por eso pasa por acá.
// Si YouTube cambia algo, devuelve {sheets:null} y la app sigue con las 3 fotos.
module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  if (!/^[\w-]{6,20}$/.test(id)) return res.status(400).json({ error: 'id inválido' });
  try {
    const r = await fetch('https://www.youtube.com/watch?v=' + id, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept-Language': 'es-AR,es;q=0.9' },
    });
    const html = await r.text();
    const m = html.match(/"playerStoryboardSpecRenderer":\{"spec":"([^"]+)"/);
    if (!m) {
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json({ sheets: null });
    }
    // spec = "base|w#h#cantidad#columnas#filas#ms#nombre#firma|..." (un nivel por tamaño)
    const parts = m[1].replace(/\\u0026/g, '&').split('|');
    const base = parts[0];
    const levels = parts.slice(1).map((p, L) => {
      const f = p.split('#');
      return { L, w: +f[0], h: +f[1], count: +f[2], cols: +f[3], rows: +f[4], interval: +f[5], name: f[6], sigh: f[7] };
    });
    // 160×90 alcanza y sobra para una miniatura de 96 px
    const lv = levels.find(l => l.w === 160) || levels[levels.length - 1];
    if (!lv || !lv.cols || !lv.rows) {
      res.setHeader('Cache-Control', 's-maxage=3600');
      return res.status(200).json({ sheets: null });
    }
    const perSheet = lv.cols * lv.rows;
    const nSheets = Math.min(4, Math.ceil(lv.count / perSheet));
    const sheets = [];
    for (let i = 0; i < nSheets; i++) {
      const name = lv.name.includes('$M') ? lv.name.replace('$M', String(i)) : lv.name;
      sheets.push(base.replace('$L', String(lv.L)).replace('$N', name) + (lv.sigh ? '&sigh=' + encodeURIComponent(lv.sigh) : ''));
    }
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json({ w: lv.w, h: lv.h, cols: lv.cols, rows: lv.rows, count: lv.count, interval: lv.interval, sheets });
  } catch (e) {
    return res.status(200).json({ sheets: null, error: String((e && e.message) || e) });
  }
};
