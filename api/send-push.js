// Función serverless de Vercel — el envío real del push tiene que pasar por
// acá (no se puede hacer desde el navegador del admin): los servidores push
// de Apple/Google no responden con headers CORS, así que el navegador lo
// bloquearía antes de que salga. Esto cifra el mensaje con el estándar Web
// Push (RFC 8291/8292) usando la librería `web-push` y las claves VAPID.
const webpush = require('web-push');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.headers['x-push-secret'] !== process.env.PUSH_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Chequeo explícito ANTES de llamar a setVapidDetails: si alguna de estas
  // 3 variables de entorno no está seteada en Vercel, la librería tira un
  // error genérico ("web-push subject/keys not set") que llegaba como un
  // 500 pelado, sin decir CUÁL faltaba. Esto pasó a ser el sospechoso
  // principal de por qué "las notificaciones siguen sin funcionar" — es la
  // única parte de todo el circuito que no se puede verificar desde el
  // código ni desde este entorno de test, solo mirando el dashboard de
  // Vercel (Project → Settings → Environment Variables).
  const missingEnv = ['VAPID_SUBJECT','VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY'].filter(k=>!process.env[k]);
  if (missingEnv.length) {
    return res.status(500).json({ error: 'Faltan variables de entorno en Vercel: ' + missingEnv.join(', ') });
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (e) {
    return res.status(500).json({ error: 'Claves VAPID inválidas: ' + (e.message||e) });
  }

  const { subscriptions, title, body, url } = req.body || {};
  if (!Array.isArray(subscriptions) || !subscriptions.length) {
    return res.status(400).json({ error: 'No subscriptions provided' });
  }

  const payload = JSON.stringify({ title, body, url });

  const results = await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      return { ok: true, endpoint: sub.endpoint };
    } catch (e) {
      // 404/410 = la suscripción venció (usuario desinstaló/bloqueó) — el
      // cliente (sendPushToUids en app.js) la borra de Firestore al ver esto.
      // reason: antes se descartaba e.body/e.message — sin esto, un fallo por
      // OTRO motivo (típicamente claves VAPID mal configuradas en Vercel, ej.
      // "VapidPkHashMismatch" si la pública de acá no es la pareja real de la
      // privada) quedaba invisible: el cliente solo veía "no llegó a nadie",
      // sin ninguna pista de POR QUÉ.
      return { ok: false, status: e.statusCode, endpoint: sub.endpoint, reason: e.body || e.message || 'error desconocido' };
    }
  }));

  return res.status(200).json({ results });
};
