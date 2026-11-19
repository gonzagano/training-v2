// Función serverless de Vercel — el envío real del push tiene que pasar por
// acá (no se puede hacer desde el navegador del admin): los servidores push
// de Apple/Google no responden con headers CORS, así que el navegador lo
// bloquearía antes de que salga. Esto cifra el mensaje con el estándar Web
// Push (RFC 8291/8292) usando la librería `web-push` y las claves VAPID.
const webpush = require('web-push');

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'training-app-pf';
// Lee users/{uid}.pushSubscription por la API REST de Firestore usando el ID
// token de quien llama: si las reglas no lo dejan leer ese usuario (o el token
// es falso o venció), Firestore responde 401/403 y no se manda nada.
async function readSubscription(uid, token) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null;
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}?mask.fieldPaths=pushSubscription`,
    { headers: { Authorization: 'Bearer ' + token } }).catch(() => null);
  if (!r) return null;
  if (r.status === 401 || r.status === 403) return { denied: r.status };
  if (!r.ok) return null;
  const f = ((await r.json().catch(() => ({}))).fields || {}).pushSubscription?.mapValue?.fields;
  if (!f || !f.endpoint?.stringValue) return null;
  return { uid, endpoint: f.endpoint.stringValue, p256dh: f.p256dh?.stringValue, auth: f.auth?.stringValue };
}

module.exports = async (req, res) => {
  // La clave pública no es secreta: la app la pide acá al activar notificaciones,
  // así nunca queda desparejada con la privada.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Quién manda: la app pasa la sesión de Firebase del usuario logueado (ID token).
  // Antes había una "clave" fija escrita en app.js, que cualquiera podía leer.
  const authz = String(req.headers['authorization'] || '');
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Falta iniciar sesión' });
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

  const { uids, title, body, url } = req.body || {};
  if (!Array.isArray(uids) || !uids.length || uids.length > 500) {
    return res.status(400).json({ error: 'Lista de destinatarios inválida' });
  }
  // A quién: las suscripciones se leen de Firestore CON la sesión de quien manda,
  // así valen las mismas reglas de seguridad que en la app: el profe puede leer
  // las de sus atletas; un atleta, solo la suya (para el "Probar"). Nadie más.
  const subscriptions = (await Promise.all(uids.map(uid => readSubscription(String(uid), token)))).filter(Boolean);
  const allowed = subscriptions.filter(s => !s.denied);
  if (!allowed.length && subscriptions.some(s => s.denied)) {
    return res.status(403).json({ error: 'Sin permiso para avisar a estos usuarios' });
  }
  if (!allowed.length) return res.status(200).json({ results: [] });

  const clip = (s, n) => String(s || '').slice(0, n);
  const payload = JSON.stringify({ title: clip(title, 80) || 'G-Metrics', body: clip(body, 300), url: clip(url, 300) });

  const results = await Promise.all(allowed.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      return { ok: true, uid: sub.uid, endpoint: sub.endpoint };
    } catch (e) {
      // 404/410 = la suscripción venció (usuario desinstaló/bloqueó) — el
      // cliente (sendPushToUids en app.js) la borra de Firestore al ver esto.
      // reason: antes se descartaba e.body/e.message — sin esto, un fallo por
      // OTRO motivo (típicamente claves VAPID mal configuradas en Vercel, ej.
      // "VapidPkHashMismatch" si la pública de acá no es la pareja real de la
      // privada) quedaba invisible: el cliente solo veía "no llegó a nadie",
      // sin ninguna pista de POR QUÉ.
      return { ok: false, status: e.statusCode, uid: sub.uid, endpoint: sub.endpoint, reason: e.body || e.message || 'error desconocido' };
    }
  }));

  return res.status(200).json({ results });
};
