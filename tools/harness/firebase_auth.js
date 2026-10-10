let _cb = null;
export function getAuth(){ return { get currentUser(){ try{return JSON.parse(localStorage.getItem('__testUser')||'null');}catch(e){return null;} } }; }
export function onAuthStateChanged(auth, cb){ _cb = cb; setTimeout(()=>cb(auth.currentUser), 0); }
export async function signOut(auth){ localStorage.removeItem('__testUser'); if(_cb) _cb(null); }
export async function createUserWithEmailAndPassword(){ throw {code:'auth/unsupported'}; }
export async function signInWithEmailAndPassword(){ throw {code:'auth/unsupported'}; }
export async function deleteUser(){}
export const EmailAuthProvider = { credential(){ return {}; } };
export async function reauthenticateWithCredential(){}
export async function sendPasswordResetEmail(){}
