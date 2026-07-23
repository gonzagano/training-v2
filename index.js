// Cloud Function para enviar push notifications reales (Firebase Cloud Messaging).
// El navegador del admin NO puede mandar push directo: hace falta un backend
// con la Admin SDK. Esta función corre en Firebase (gratis hasta cierto uso,
// requiere plan Blaze — pay-as-you-go, pero el uso normal de esta app no
// genera costo real).
//
// CÓMO INSTALARLA (una sola vez):
//   1) npm install -g firebase-tools   (si no lo tenés)
//   2) firebase login
//   3) Desde la raíz del proyecto: firebase init functions
//      (elegí el proyecto training-app-pf, JavaScript, sin ESLint)
//   4) Reemplazá el functions/index.js generado por este archivo.
//   5) firebase deploy --only functions
//
// Con esto quedan dos funciones "callable" (se invocan desde app.js con
// httpsCallable, ya está enganchado):
//   - sendPushReminder({ uids, title, body }): manda push a esos atletas.
//   - sendPushToAll({ title, body }): manda push a todos los atletas con
//     token guardado (por si en el futuro querés un aviso general).

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();

async function sendToTokens(tokens, title, body) {
  if (!tokens.length) return { successCount: 0, failureCount: 0 };
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { fcmOptions: { link: '/' }, notification: { icon: '/icons/icon-192.png' } }
  });
  return { successCount: res.successCount, failureCount: res.failureCount };
}

exports.sendPushReminder = onCall(async (request) => {
  const { uids, title, body } = request.data || {};
  if (!Array.isArray(uids) || !uids.length) throw new HttpsError('invalid-argument', 'Faltan uids');
  if (!title || !body) throw new HttpsError('invalid-argument', 'Faltan title/body');

  const tokens = [];
  for (const uid of uids) {
    const snap = await db.collection('users').doc(uid).get();
    const t = snap.exists ? (snap.data().fcmTokens || []) : [];
    tokens.push(...t);
  }
  return sendToTokens(tokens, title, body);
});

exports.sendPushToAll = onCall(async (request) => {
  const { title, body } = request.data || {};
  if (!title || !body) throw new HttpsError('invalid-argument', 'Faltan title/body');
  const snap = await db.collection('users').get();
  const tokens = [];
  snap.forEach(d => { const t = d.data().fcmTokens; if (Array.isArray(t)) tokens.push(...t); });
  return sendToTokens(tokens, title, body);
});
