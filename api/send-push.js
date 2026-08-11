// Función serverless de Vercel — el envío real del push tiene que pasar por
// acá (no se puede hacer desde el navegador del admin): los servidores push
// de Apple/Google no responden con headers CORS, así que el navegador lo
// bloquearía antes de que salga. Esto cifra el mensaje con el estándar Web
// Push (RFC 8291/8292) usando la librería `web-push` y las claves VAPID.
const webpush = require('web-push');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (req.headers['x-push-secret'] !== process.env.PUSH_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
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
      return { ok: false, status: e.statusCode, endpoint: sub.endpoint };
    }
  }));

  return res.status(200).json({ results });
};
