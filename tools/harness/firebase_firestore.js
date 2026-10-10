// Firestore falso en memoria, persistido en localStorage. Imita las reglas
// reales que importan: updateDoc entiende rutas con puntos, setDoc+merge NO
// (las claves con punto son literales), rutas inválidas (~ * / [ ]) y valores
// undefined tiran error igual que el SDK real.
const KEY='__db';
function load(){ try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){return {};} }
function persist(db){ localStorage.setItem(KEY, JSON.stringify(db)); }
window.__DB = ()=>load();
window.__resetDB = ()=>{ localStorage.removeItem(KEY); };
window.__seedDB = (obj)=>persist(obj);
const DEL = {__delete:true};
export function deleteField(){ return DEL; }
export function serverTimestamp(){ return {__ts:true, toDate(){ return new Date(); }}; }
export function arrayUnion(...a){ return {__arrayUnion:a}; }
export function getFirestore(){ return {}; }
export function doc(db,col,id){ return {col,id}; }
export function collection(db,col){ return {col}; }
export function query(c){ return c; } export function where(){return null;} export function orderBy(){return null;}
function snap(ref, data){ return { id:ref.id, exists:()=>data!==undefined, data:()=>data===undefined?undefined:JSON.parse(JSON.stringify(data)) }; }
export async function getDoc(ref){ await net(); const db=load(); return snap(ref, db[ref.col]?.[ref.id]); }
export async function getDocs(c){ const db=load(); const col=db[c.col]||{}; return { docs:Object.keys(col).map(id=>snap({id},col[id])) }; }
function checkVal(v,path){
  if(v===undefined) throw new Error('Function updateDoc() called with invalid data. Unsupported field value: undefined (found in field '+path+')');
  if(v && typeof v==='object' && !v.__delete && !v.__ts && !v.__arrayUnion){
    for(const k of Object.keys(v)) checkVal(v[k], path+'.'+k);
  }
}
function resolve(v, old){
  if(v && v.__ts) return new Date().toISOString();
  if(v && v.__arrayUnion){ const base=Array.isArray(old)?old:[]; return [...base, ...v.__arrayUnion.filter(x=>!base.includes(x))]; }
  if(v && typeof v==='object' && !Array.isArray(v)){ const o={}; for(const k of Object.keys(v)) o[k]=resolve(v[k], undefined); return o; }
  return v;
}
function deepMerge(target, src){
  for(const k of Object.keys(src)){
    const v=src[k];
    if(v && v.__delete){ delete target[k]; continue; }
    if(v && typeof v==='object' && !Array.isArray(v) && !v.__ts && !v.__arrayUnion){
      if(!target[k]||typeof target[k]!=='object'||Array.isArray(target[k])) target[k]={};
      deepMerge(target[k], v);
    } else target[k]=resolve(v, target[k]);
  }
}
export async function setDoc(ref, data, opts){ await net();
  const db=load(); db[ref.col]=db[ref.col]||{};
  checkVal(data,'');
  if(opts&&opts.merge){ db[ref.col][ref.id]=db[ref.col][ref.id]||{}; deepMerge(db[ref.col][ref.id], data); }
  else { const o={}; deepMerge(o,data); db[ref.col][ref.id]=o; }
  persist(db);
}
export class FieldPath { constructor(...segs){ if(!segs.length||segs.some(x=>typeof x!=='string'||!x)) throw new Error('Invalid FieldPath'); this.segs=segs; } }
window.__NET='ok';
async function net(){ if(window.__NET==='hang') await new Promise(()=>{}); if(window.__NET==='fail'){ const e=new Error('unavailable'); e.code='unavailable'; throw e; } }
export async function updateDoc(ref, ...args){
  await net();
  const db=load();
  if(!db[ref.col]||!db[ref.col][ref.id]) { const e=new Error('not-found'); e.code='not-found'; throw e; }
  const doc_=db[ref.col][ref.id];
  const pairs=[];
  if(args.length===1 && args[0] && typeof args[0]==='object' && !(args[0] instanceof FieldPath)){
    Object.keys(args[0]).forEach(k=>pairs.push([k,args[0][k]]));
  } else {
    if(args.length%2) throw new Error('updateDoc varargs must be pairs');
    for(let i=0;i<args.length;i+=2) pairs.push([args[i],args[i+1]]);
  }
  const prepared=[];
  for(const [path,val] of pairs){
    let segs;
    if(path instanceof FieldPath) segs=path.segs;
    else {
      if(/[~*\/\[\]]/.test(path)) throw new Error('Invalid field path ('+path+'). Paths must not contain ~ * / [ ]');
      segs=path.split('.');
      if(segs.some(s=>!s)) throw new Error('Invalid field path ('+path+'). Paths must not be empty or contain ..');
    }
    checkVal(val, segs.join('.'));
    prepared.push([segs,val]);
  }
  for(const [segs,val] of prepared){
    let cur=doc_;
    for(let i=0;i<segs.length-1;i++){ if(!cur[segs[i]]||typeof cur[segs[i]]!=='object'||Array.isArray(cur[segs[i]])) cur[segs[i]]={}; cur=cur[segs[i]]; }
    const last=segs[segs.length-1];
    if(val && val.__delete) delete cur[last]; else cur[last]=resolve(val, cur[last]);
  }
  persist(db);
}
export async function deleteDoc(ref){ const db=load(); if(db[ref.col]) delete db[ref.col][ref.id]; persist(db); }
