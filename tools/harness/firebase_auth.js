// Auth falso. La sesión principal vive en localStorage.__testUser; una app
// secundaria (initializeApp(config, 'nombre')) tiene su propia sesión en memoria.
// Igual que Firebase real: createUserWithEmailAndPassword deja LOGUEADA la
// cuenta nueva en el auth que se le pase — si el código usa el auth principal
// para crear un atleta, el admin queda deslogueado y el test lo detecta.
let _cb = null;
const main = { get currentUser(){ try{return JSON.parse(localStorage.getItem('__testUser')||'null');}catch(e){return null;} } };
const secondaries = new WeakMap();
export function getAuth(app){
  if(!app || app.name === '[DEFAULT]') return main;
  if(!secondaries.has(app)) secondaries.set(app, {secondary:true, currentUser:null});
  return secondaries.get(app);
}
export function onAuthStateChanged(auth, cb){ if(auth===main){ _cb = cb; setTimeout(()=>cb(auth.currentUser), 0); } }
export async function signOut(auth){
  if(auth && auth.secondary){ auth.currentUser = null; return; }
  localStorage.removeItem('__testUser'); if(_cb) _cb(null);
}
function accounts(){ try{return JSON.parse(localStorage.getItem('__authAccounts')||'{}');}catch(e){return {};} }
export async function createUserWithEmailAndPassword(auth, email, pass){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')) throw {code:'auth/invalid-email'};
  if(String(pass||'').length < 6) throw {code:'auth/weak-password'};
  const acc = accounts();
  let users = {}; try{ users = JSON.parse(localStorage.getItem('__db')||'{}').users || {}; }catch(e){}
  if(acc[email] || Object.values(users).some(u=>(u.email||'').toLowerCase()===email.toLowerCase())) throw {code:'auth/email-already-in-use'};
  const uid = 'new' + Math.random().toString(36).slice(2,10);
  acc[email] = {uid, pass: String(pass)};
  localStorage.setItem('__authAccounts', JSON.stringify(acc));
  const user = {uid, email};
  if(auth && auth.secondary) auth.currentUser = user;
  else { localStorage.setItem('__testUser', JSON.stringify(user)); if(_cb) _cb(user); }
  return {user};
}
export async function signInWithEmailAndPassword(){ throw {code:'auth/unsupported'}; }
export async function deleteUser(){}
export const EmailAuthProvider = { credential(){ return {}; } };
export async function reauthenticateWithCredential(){}
export async function sendPasswordResetEmail(){}
