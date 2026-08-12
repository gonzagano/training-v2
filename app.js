import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged, deleteUser, EmailAuthProvider, reauthenticateWithCredential }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, collection, getDocs, query, where, orderBy, serverTimestamp, arrayUnion }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── FECHAS EN HORARIO LOCAL, NUNCA UTC ────────────────────────────
// .toISOString() siempre da la fecha en UTC. Para Argentina (UTC-3), entre
// las 21:00 y la medianoche hora local, UTC ya pasó a "mañana" — así que
// todo lo que calculaba "hoy" comparando contra la fecha UTC (wellness,
// carga, lesiones, calendario, rutinas...) quedaba mal esas 3 horas todas
// las noches: alguien completando el wellness del lunes a la noche lo
// guardaba con fecha martes. Estas dos funciones son el reemplazo — siempre
// trabajan con el calendario LOCAL del dispositivo, nunca UTC.
function toLocalDateStr(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function todayLocal() { return toLocalDateStr(new Date()); }
window.toLocalDateStr = toLocalDateStr;
window.todayLocal = todayLocal;

// "Día efectivo" para cargar wellness/carga: antes de la madrugada (antes de
// las 5am) sigue mostrando AYER por defecto — quien entrena de noche y carga
// sus datos recién pasada la medianoche está reportando la sesión de ayer,
// no una sesión de hoy que ni empezó. Es solo el valor por DEFECTO: quien de
// verdad quiera cargar algo del día calendario real puede tocar "Volver a
// hoy" y avanzar, eso sigue disponible siempre.
const WELLNESS_DAY_CUTOFF_HOUR = 5;
function getEffectiveTodayDate() {
  const now = new Date();
  if (now.getHours() < WELLNESS_DAY_CUTOFF_HOUR) {
    const d = new Date(now); d.setDate(d.getDate()-1);
    return toLocalDateStr(d);
  }
  return toLocalDateStr(now);
}
window.getEffectiveTodayDate = getEffectiveTodayDate;

// ── TEMA (claro/oscuro) ──────────────────────────────────────────
// El modo oscuro es opcional: no toca el tema claro por defecto, solo
// alterna un atributo que activa el bloque de variables oscuras en CSS.
function getTheme() { return localStorage.getItem('gm-theme') || 'light'; }
function toggleTheme() {
  const next = getTheme()==='dark' ? 'light' : 'dark';
  localStorage.setItem('gm-theme', next);
  document.documentElement.setAttribute('data-theme', next);
  renderMain();
}
window.getTheme = getTheme;
window.toggleTheme = toggleTheme;

// ── PERSONALIZACIÓN (color de acento, tipografía, tamaño de fuente) ──
// Mismo criterio que el tema: se guarda en el dispositivo (localStorage) y
// se aplica pisando variables CSS — no toca los colores semánticos
// (verde/amarillo/rojo de ACWR, wellness, gravedad de lesión), que siguen
// significando siempre lo mismo sin importar el acento elegido.
const ACCENT_COLORS = [
  {id:'navy',   label:'Navy',          c:'#243B6B', hover:'#2F4A85'},
  {id:'teal',   label:'Teal',          c:'#0E7C6B', hover:'#159686'},
  {id:'purple', label:'Violeta',       c:'#5B3E96', hover:'#6F4FB2'},
  {id:'wine',   label:'Vino',          c:'#A83250', hover:'#C23F61'},
  {id:'forest', label:'Verde bosque',  c:'#256D4B', hover:'#2E8560'},
  {id:'orange', label:'Naranja',       c:'#C1601F', hover:'#D97328'},
];
window.ACCENT_COLORS = ACCENT_COLORS;

const FONT_OPTIONS = [
  {id:'manrope', label:'Manrope (predeterminada)', stack:"'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", googleFont:null},
  {id:'inter',   label:'Inter',                    stack:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", googleFont:'Inter:wght@400;500;600;700;800'},
  {id:'poppins', label:'Poppins',                  stack:"'Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", googleFont:'Poppins:wght@400;500;600;700;800'},
  {id:'system',  label:'Del sistema (más rápida)', stack:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", googleFont:null},
];
window.FONT_OPTIONS = FONT_OPTIONS;

// Lee el color REAL vigente de una variable CSS (light u oscuro, el acento
// que elegiste, lo que sea) — los gráficos de Chart.js no entienden var(),
// dibujan en un <canvas> aparte de la cascada CSS, así que hay que
// resolverlo a mano en el momento de dibujar. Sin esto, los textos de los
// gráficos quedaban con un gris oscuro fijo que en modo oscuro es casi
// invisible.
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback || '#000';
}
window.cssVar = cssVar;

function hexToRgba(hex, alpha) {
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getAccentColor() { return localStorage.getItem('gm-accent') || 'navy'; }
window.getAccentColor = getAccentColor;
function applyAccentColor(id) {
  const def = ACCENT_COLORS.find(a=>a.id===id) || ACCENT_COLORS[0];
  const root = document.documentElement.style;
  root.setProperty('--accent', def.c);
  root.setProperty('--accent-hover', def.hover);
  root.setProperty('--accent-dim', hexToRgba(def.c, 0.08));
  root.setProperty('--accent-dim2', hexToRgba(def.c, 0.05));
}
function setAccentColor(id) {
  localStorage.setItem('gm-accent', id);
  applyAccentColor(id);
  renderMain();
}
window.setAccentColor = setAccentColor;

let _loadedGoogleFonts = new Set();
function getFontFamily() { return localStorage.getItem('gm-font') || 'manrope'; }
window.getFontFamily = getFontFamily;
function applyFontFamily(id) {
  const def = FONT_OPTIONS.find(f=>f.id===id) || FONT_OPTIONS[0];
  if(def.googleFont && !_loadedGoogleFonts.has(def.googleFont)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${def.googleFont}&display=swap`;
    document.head.appendChild(link);
    _loadedGoogleFonts.add(def.googleFont);
  }
  document.documentElement.style.setProperty('--font-body', def.stack);
}
function setFontFamily(id) {
  localStorage.setItem('gm-font', id);
  applyFontFamily(id);
  renderMain();
}
window.setFontFamily = setFontFamily;

function getFontScale() { return +(localStorage.getItem('gm-fontscale')||100); }
window.getFontScale = getFontScale;
function applyFontScale(pct) { document.documentElement.style.zoom = pct/100; }
function setFontScale(pct) {
  localStorage.setItem('gm-fontscale', pct);
  applyFontScale(pct);
}
window.setFontScale = setFontScale;

// Se aplican apenas carga el módulo — el flash inicial (antes de esto)
// ya lo evita el script inline de index.html, que hace lo mismo más rápido.
applyAccentColor(getAccentColor());
applyFontFamily(getFontFamily());
applyFontScale(getFontScale());

const firebaseConfig = {
  apiKey: "AIzaSyA_GNkUG63pSMNU1aNvAXM-61jVHbwuGQ0",
  authDomain: "training-app-pf.firebaseapp.com",
  projectId: "training-app-pf",
  storageBucket: "training-app-pf.firebasestorage.app",
  messagingSenderId: "698623644418",
  appId: "1:698623644418:web:a5b3fa6093752a53c9e81b"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ── ADMIN EMAIL (el tuyo) ─────────────────────────────────────
const ADMIN_EMAIL = "gonzaloganora@gmail.com";

// ── INSTITUCIONES / EQUIPOS FIJOS ──────────────────────────────
// Catálogo cerrado: un atleta "de equipo" siempre pertenece a una de estas
// instituciones, y dentro de ella, a una de sus categorías. Esto genera
// (o reutiliza) el equipo real en Firestore al completar el onboarding.
const INSTITUTIONS = {
  'Handball-EDLP': { sport: 'Handball', categories: ['Cadetes', 'Juveniles', 'Juniors', 'Liga de Honor'] },
  'Basquet-Club Universal': { sport: 'Basquet', categories: ['u15', 'u17', 'u21'] }
};

// Lista dinámica de equipos/categorías reales para el onboarding — en vez de
// depender de INSTITUTIONS (fijo en el código), se arma sola en base a los
// equipos que el admin ya haya creado en S.teams. Así, un equipo nuevo que
// se crea desde el Panel Admin aparece automáticamente como opción para
// cualquiera que se registre después, sin tocar código.
function getInstitutionsFromTeams() {
  const map = {};
  // Base: instituciones/categorías conocidas de antemano — SIEMPRE aparecen,
  // sin importar si ya existe o no un equipo creado a mano para esa
  // categoría puntual (antes dependía 100% de que el equipo ya existiera,
  // y por eso "Juniors" no aparecía si vos todavía no lo habías cargado).
  Object.entries(INSTITUTIONS).forEach(([inst,info])=>{
    map[inst] = {sport:info.sport, categories:new Set(info.categories)};
  });
  // Se suma cualquier equipo real que ya exista, por si hay instituciones o
  // categorías nuevas (fuera de esta lista fija) que vos hayas creado.
  (S.teams||[]).forEach(t=>{
    const inst = t.institution || t.name;
    if(!inst) return;
    if(!map[inst]) map[inst] = {sport:t.sport||'', categories:new Set()};
    if(t.category) map[inst].categories.add(t.category);
    if(!map[inst].sport && t.sport) map[inst].sport = t.sport;
  });
  return map;
}
window.getInstitutionsFromTeams = getInstitutionsFromTeams;

// ── TIPOS DE LESIÓN/MOLESTIA ────────────────────────────────────
const INJURY_TYPES = { muscular: 'Muscular', articular: 'Articular', ligamentaria: 'Ligamentaria' };

// Gravedad CLÍNICA de la lesión — a propósito separada del dolor 0-10 del
// día. El dolor fluctúa día a día (un golpe puede doler un 8 y ser leve; una
// cirugía de menisco en rehabilitación puede no doler nada y seguir siendo
// grave). La gravedad la fija conscientemente el entrenador/atleta, no se
// deriva automáticamente del número de dolor.
const SEVERITY_LEVELS = [
  {id:'leve', label:'Leve', color:'#1F7A4D'},
  {id:'moderada', label:'Moderada', color:'#C67C0F'},
  {id:'grave', label:'Grave', color:'#C33A2C'},
];
function severityInfo(id) { return SEVERITY_LEVELS.find(s=>s.id===id) || null; }
window.severityInfo = severityInfo;

// Cuestionario OSTRC-O simplificado — 4 preguntas de opción múltiple (no
// números sueltos, así es más rápido y didáctico para el atleta) que suman
// 0–100. Convive con el dolor 0–10 de siempre, no lo reemplaza: uno es "cuánto
// duele" y esto es "cuánto te está afectando de verdad" (participación,
// volumen de entrenamiento, rendimiento), que no son lo mismo.
const OSTRC_QUESTIONS = [
  { id:'q1', label:'¿Pudiste participar normalmente hoy?', options:[
    {v:0, label:'Sí, sin problema'}, {v:8, label:'Sí, con molestia'},
    {v:17, label:'Participé menos'}, {v:25, label:'No participé'},
  ]},
  { id:'q2', label:'¿Bajaste el volumen de entrenamiento por esto?', options:[
    {v:0, label:'No, nada'}, {v:6, label:'Un poco'}, {v:13, label:'Bastante'},
    {v:19, label:'Mucho'}, {v:25, label:'No entrené'},
  ]},
  { id:'q3', label:'¿Te afectó el rendimiento?', options:[
    {v:0, label:'Nada'}, {v:6, label:'Un poco'}, {v:13, label:'Bastante'},
    {v:19, label:'Mucho'}, {v:25, label:'No pude rendir'},
  ]},
  { id:'q4', label:'¿Cuánto dolor al entrenar/jugar?', options:[
    {v:0, label:'Nada'}, {v:8, label:'Leve'}, {v:17, label:'Moderado'}, {v:25, label:'Severo'},
  ]},
];
window.OSTRC_QUESTIONS = OSTRC_QUESTIONS;

function ostrcTotal(inj) {
  const o = inj?.ostrc;
  if(!o || o.q1==null || o.q2==null || o.q3==null || o.q4==null) return null;
  return o.q1+o.q2+o.q3+o.q4;
}
window.ostrcTotal = ostrcTotal;

function setOstrcAnswer(zid, q, val) {
  if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',severity:'leve',isInjury:false,history:[]};
  if(!S.injuries[zid].ostrc) S.injuries[zid].ostrc={};
  S.injuries[zid].ostrc[q]=val;
  markInjuryDirty(zid);
  renderMain();
}
window.setOstrcAnswer=setOstrcAnswer;

// Fases de retorno al juego — las fija el entrenador/kinesiólogo, nunca el
// atleta (es una decisión clínica/técnica, no una autoevaluación). Solo
// aplica a lesiones reales (isRealInjury), no a molestias sin diagnóstico.
const RTP_PHASES = [
  {id:'reposo', label:'Reposo'},
  {id:'sin_contacto', label:'Trabajo sin contacto'},
  {id:'reintegro_parcial', label:'Reintegro parcial'},
  {id:'alta', label:'Alta médica'},
];
function rtpPhaseInfo(id) { return RTP_PHASES.find(p=>p.id===id) || null; }
window.RTP_PHASES = RTP_PHASES;
window.rtpPhaseInfo = rtpPhaseInfo;

// Distingue una LESIÓN real (esguince, edema, luxación, hasta una cirugía —
// con tipo y gravedad clínica) de una MOLESTIA pasajera (dolor sin
// diagnóstico, ej. "me duele la espalda"). Solo cuenta como lesión real si
// alguien la marcó explícitamente así (isInjury===true) — cualquier otra
// cosa (incluidos todos los registros de antes de este campo, que no tienen
// isInjury guardado) se trata como molestia. Es la única forma de que el
// Dashboard muestre pocas alertas de verdad en vez de inundarse con cada
// dolor que alguien marcó sin querer decir "esto es una lesión".
function isRealInjury(inj) { return inj?.isInjury === true; }
window.isRealInjury = isRealInjury;

// ── PROGRESIÓN DE DOLOR (flecha de tendencia + gráfico día a día) ───────
// Compara el dolor de HOY (inj.pain, el valor vivo) contra el último
// registro guardado en el historial que no sea de hoy. OJO con la
// dirección: acá arriba (↑) significa mejorando (menos dolor) y abajo (↓)
// empeorando (más dolor) — es la convención que pidió el prep, no "el
// número subió/bajó" literal.
function getInjuryTrend(inj) {
  const hist = inj?.history||[];
  if(!hist.length) return null;
  const today = todayLocal();
  const prior = [...hist].filter(h=>h.date!==today).sort((a,b)=>a.date.localeCompare(b.date)).pop();
  if(!prior) return null;
  const current = inj.pain;
  if(current < prior.pain) return {dir:'up', label:'Mejorando', color:'var(--green)', arrow:'↑'};
  if(current > prior.pain) return {dir:'down', label:'Empeorando', color:'var(--red)', arrow:'↓'};
  return {dir:'flat', label:'Estable', color:'var(--text3)', arrow:'→'};
}
window.getInjuryTrend = getInjuryTrend;

// uid: 'self' (o vacío) para la propia molestia del atleta logueado, o el
// uid real de un atleta cuando lo abre el admin desde su perfil.
function openPainTrendModal(uid, zoneId) {
  let inj, zoneLabel;
  const allZones = [...BODY_ZONES.front, ...BODY_ZONES.back];
  zoneLabel = allZones.find(z=>z.id===zoneId)?.label || zoneId;
  if(!uid || uid==='self') {
    inj = S.injuries?.[zoneId];
  } else {
    const personal = S.viewingAthlete?.uid===uid ? S.viewingAthlete.personal : (S.adminAthletes||[]).find(x=>x.uid===uid)?._personal;
    inj = personal?.injuries?.[zoneId];
  }
  if(!inj) return;

  const today = todayLocal();
  const points = [...(inj.history||[])].sort((a,b)=>a.date.localeCompare(b.date));
  if(!points.length || points[points.length-1].date!==today) points.push({date:today, pain:inj.pain});

  document.getElementById('pain-trend-title').textContent = `${zoneLabel} — progresión de dolor`;
  document.getElementById('pain-trend-list').innerHTML = [...points].reverse().map(p=>
    `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text3)">${p.date}${p.date===today?' (hoy)':''}</span>
      <span style="font-weight:700;color:${getPainColor(p.pain).color}">${p.pain}/10</span>
    </div>`).join('');

  document.getElementById('pain-trend-overlay').classList.add('open');
  setTimeout(()=>drawPainTrendChart(points), 50);
}
window.openPainTrendModal = openPainTrendModal;

function drawPainTrendChart(points) {
  if(typeof Chart==='undefined') return;
  const canvas = document.getElementById('pain-trend-chart');
  if(!canvas) return;
  try{ S.painTrendChartInstance?.destroy(); }catch(e){}
  if(points.length<2) return; // un solo punto no dice tendencia, solo se ve la lista
  S.painTrendChartInstance = new Chart(canvas, {
    type:'line',
    data:{
      labels: points.map(p=>p.date.slice(5)),
      datasets:[{ label:'Dolor', data:points.map(p=>p.pain), borderColor:'#C33A2C', backgroundColor:'rgba(195,58,44,0.08)', tension:.3, pointRadius:3, fill:true }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>'Dolor: '+ctx.parsed.y+'/10'}} },
      scales:{
        y:{min:0,max:10,ticks:{stepSize:2,color:cssVar('--text3','#7A8394'),font:{size:10}},grid:{color:'rgba(18,21,28,0.08)'}},
        x:{ticks:{color:cssVar('--text3','#7A8394'),font:{size:9},maxRotation:0,autoSkip:true,maxTicksLimit:7},grid:{display:false}}
      }
    }
  });
}
window.drawPainTrendChart = drawPainTrendChart;

function closePainTrendModal() { document.getElementById('pain-trend-overlay').classList.remove('open'); }
window.closePainTrendModal = closePainTrendModal;
function closePainTrendIfOutside(e) { if(e.target===document.getElementById('pain-trend-overlay')) closePainTrendModal(); }
window.closePainTrendIfOutside = closePainTrendIfOutside;

// Los 5 levantamientos con RM registrable — usados para linkear el %RM de
// la rutina con el peso real de cada atleta.
const RM_LIFTS = [
  {id:'press_plano', label:'Press Plano'},
  {id:'sentadilla_barra', label:'Sentadilla con Barra'},
  {id:'peso_muerto', label:'Peso Muerto'},
  {id:'cargada_potencia', label:'Cargada de Potencia'},
  {id:'arranque_potencia', label:'Arranque de Potencia'},
];
window.RM_LIFTS = RM_LIFTS;

// Mapea el id de test de 1RM en Evaluaciones al id de levantamiento del
// perfil (oneRM) — para que cargar un test de fuerza actualice el perfil
// automáticamente. Solo en este sentido: Evaluaciones → Perfil. Editar el RM
// a mano en el perfil nunca toca las evaluaciones. "Arranque de Potencia" no
// tiene test equivalente en Evaluaciones todavía, así que queda solo manual.
const EVAL_TO_ONERM_LIFT = {
  rm_press_banca: 'press_plano',
  rm_sentadilla: 'sentadilla_barra',
  rm_peso_muerto: 'peso_muerto',
  rm_cargada_potencia: 'cargada_potencia',
};
window.EVAL_TO_ONERM_LIFT = EVAL_TO_ONERM_LIFT;

async function syncEvalToOneRM(uid, testId, value) {
  const liftId = EVAL_TO_ONERM_LIFT[testId];
  if (!liftId || !uid || isPendingId(uid)) return;
  if (uid === 'self') {
    if(!S.oneRM) S.oneRM = {};
    S.oneRM[liftId] = value;
    try { await updateDocSafe(doc(db,'personal',S.user.uid), {[`oneRM.${liftId}`]:value}); } catch(e){ /* no bloquea el guardado del test */ }
    return;
  }
  const a = S.adminAthletes?.find(x=>x.uid===uid);
  if(a) { if(!a._personal) a._personal={}; if(!a._personal.oneRM) a._personal.oneRM={}; a._personal.oneRM[liftId]=value; }
  try { await updateDocSafe(doc(db,'personal',uid), {[`oneRM.${liftId}`]:value}); } catch(e){ /* no bloquea el guardado del test */ }
}
window.syncEvalToOneRM = syncEvalToOneRM;

// Editar el RM de un atleta desde su Perfil (admin) — mismo campo oneRM que
// Ajustes usa para el propio atleta, pero escrito desde el lado del admin.
async function adminSaveOneRM(uid, liftId, value) {
  const val = value===''||value===null||value===undefined ? null : parseDecimal(value);
  const a = S.adminAthletes?.find(x=>x.uid===uid);
  if(a) { if(!a._personal) a._personal={}; if(!a._personal.oneRM) a._personal.oneRM={}; a._personal.oneRM[liftId]=val; }
  try {
    await updateDocSafe(doc(db,'personal',uid), {[`oneRM.${liftId}`]:val});
    showToast('✓ RM guardado');
  } catch(e) { showToast('Error al guardar'); }
}
window.adminSaveOneRM = adminSaveOneRM;

// ── DEFAULT DATA ─────────────────────────────────────────────
const DEFAULT_BLOCKS = [
  { id:'b1', label:'Bloque 1', title:'Activación y movilidad', time:'5–10 min', colorKey:'b1',
    note:'Hacé siempre. Elegí 2–3 según lo que sientas hoy.', _open:true,
    categories:[
      { id:'c1', label:'Tren inferior', exercises:[
        {id:'e1',name:'ISO hold sentadilla'},{id:'e2',name:'ISO hold split'},
        {id:'e3',name:'Step down excéntrico'},{id:'e4',name:'Movilidad cadera con banda'},
        {id:'e5',name:'90/90 + respiración'}]},
      { id:'c2', label:'Tren superior y hombros', exercises:[
        {id:'e6',name:'ISO hold rotador'},{id:'e7',name:'Face pull con banda'},
        {id:'e8',name:'Press rango máximo (banda)'},{id:'e9',name:'Dislocación con banda'}]},
      { id:'c3', label:'Zona lumbar / cadera', exercises:[
        {id:'e10',name:'Bisagra de cadera con banda'},{id:'e11',name:'Cat-cow con respiración'},
        {id:'e12',name:'Hip CARs'}]},
    ]},
  { id:'b2', label:'Bloque 2', title:'Preparatorio — core y fuerza coordinativa', time:'12–15 min', colorKey:'b2',
    note:'Elegí 2–3 en total. Un ejercicio por categoría es suficiente.', _open:false,
    categories:[
      { id:'c4', label:'Dominante de rodilla (bajo impacto)', exercises:[
        {id:'e13',name:'Caminata trineo (atrás)'},{id:'e14',name:'Caminata trineo (perfil)'},
        {id:'e15',name:'Sissy squat'},{id:'e16',name:'Step down'}]},
      { id:'c5', label:'Zona media', exercises:[
        {id:'e17',name:'Espinales (variante)'},{id:'e18',name:'Plancha oso'},
        {id:'e19',name:'Plancha lateral + remo banda'},{id:'e20',name:'Plancha lateral + rotación'},
        {id:'e21',name:'Copenhagen'},{id:'e22',name:'Fitball (variante)'}]},
      { id:'c6', label:'Preses y remos coordinativos', exercises:[
        {id:'e23',name:'Remo resistido unilateral'},{id:'e24',name:'Press + rotación'},
        {id:'e25',name:'Press desde plancha invertida'},{id:'e26',name:'Remo con 2 apoyos'},
        {id:'e27',name:'Farmer walk (hombros altos)'},{id:'e28',name:'Farmer walk (codos 90°)'}]},
    ]},
  { id:'b3', label:'Bloque 3', title:'Fuerza básica', time:'20–25 min', colorKey:'b3',
    note:'Anclas fijas siempre. Variantes rotan entre sesiones.', _open:true, hasRPE:true,
    categories:[
      { id:'c7', label:'Dominante de rodilla', exercises:[
        {id:'e29',name:'Sentadilla libre',vbt:true},{id:'e30',name:'Split squat búlgaro'},
        {id:'e31',name:'Sentadilla goblet'},{id:'e32',name:'Sentadilla frontal'}]},
      { id:'c8', label:'Empuje', exercises:[
        {id:'e33',name:'Press plano (barra)',vbt:true},{id:'e34',name:'Press inclinado (mancuernas)'},
        {id:'e35',name:'Press militar'},{id:'e36',name:'Fondos lastrados'}]},
      { id:'c9', label:'Jalón / tracción', exercises:[
        {id:'e37',name:'Dominadas'},{id:'e38',name:'Dominadas supinas'},
        {id:'e39',name:'Remo al pecho (barra)'},{id:'e40',name:'Remo seal'}]},
      { id:'c10', label:'Cadera dominante', exercises:[
        {id:'e41',name:'Bisagra unilateral'},{id:'e42',name:'Hip thrust'},
        {id:'e43',name:'Trap bar DL (progresión)',vbt:true}]},
    ]},
  { id:'b4', label:'Bloque 4', title:'Brazos — hipertrofia', time:'8–10 min', colorKey:'b4',
    note:'Si llegás con tiempo y energía. 2 ejercicios, no más.', _open:false,
    categories:[
      { id:'c11', label:'Bíceps', exercises:[
        {id:'e44',name:'Curl mancuerna alternado'},{id:'e45',name:'Curl martillo'},
        {id:'e46',name:'Curl concentrado'},{id:'e47',name:'Curl banda'}]},
      { id:'c12', label:'Tríceps', exercises:[
        {id:'e48',name:'Extensión sobre cabeza'},{id:'e49',name:'Press francés'},
        {id:'e50',name:'Fondos en banco'},{id:'e51',name:'Jalón tríceps banda'}]},
    ]},
];

const DEFAULT_LIBRARY = [
  {id:'l1',name:'Sentadilla libre',tags:['MMII','bilateral','fuerza']},
  {id:'l2',name:'Sentadilla frontal',tags:['MMII','bilateral','fuerza']},
  {id:'l3',name:'Split squat búlgaro',tags:['MMII','unilateral','fuerza']},
  {id:'l4',name:'Hip thrust',tags:['MMII','cadera','bilateral']},
  {id:'l5',name:'Bisagra unilateral',tags:['MMII','unilateral','cadera']},
  {id:'l6',name:'Step down excéntrico',tags:['MMII','unilateral','rehabilitación']},
  {id:'l7',name:'Sissy squat',tags:['MMII','unilateral','rodilla']},
  {id:'l8',name:'Press plano (barra)',tags:['MMSS','empuje','bilateral','fuerza']},
  {id:'l9',name:'Press inclinado (mancuernas)',tags:['MMSS','empuje','bilateral']},
  {id:'l10',name:'Press militar',tags:['MMSS','empuje','bilateral','hombros']},
  {id:'l11',name:'Fondos lastrados',tags:['MMSS','empuje','bilateral']},
  {id:'l12',name:'Dominadas',tags:['MMSS','tracción','bilateral','fuerza']},
  {id:'l13',name:'Remo seal',tags:['MMSS','tracción','bilateral']},
  {id:'l14',name:'Remo resistido unilateral',tags:['MMSS','tracción','unilateral']},
  {id:'l15',name:'Face pull con banda',tags:['MMSS','hombros','rehabilitación']},
  {id:'l16',name:'Plancha oso',tags:['zona media','bilateral']},
  {id:'l17',name:'Plancha lateral + remo',tags:['zona media','unilateral']},
  {id:'l18',name:'Copenhagen',tags:['zona media','unilateral','cadera']},
  {id:'l19',name:'Espinales (variante)',tags:['zona media','lumbar']},
  {id:'l20',name:'ISO hold sentadilla',tags:['MMII','iso','rehabilitación']},
  {id:'l21',name:'Farmer walk',tags:['zona media','bilateral','funcional']},
  {id:'l22',name:'Press + rotación',tags:['MMSS','empuje','unilateral','funcional']},
  {id:'l23',name:'Curl mancuerna alternado',tags:['MMSS','bíceps','unilateral']},
  {id:'l24',name:'Extensión sobre cabeza',tags:['MMSS','tríceps','bilateral']},
];

// Las categorías/etiquetas disponibles para FILTRAR la lista de la Biblioteca
// tienen que incluir siempre las 17 principales (LIB_MAIN_CATEGORIES, ver más
// abajo), más cualquier tag suelto que todavía tenga algún ejercicio viejo
// sin recategorizar — así, mientras se van recategorizando, esos tags viejos
// siguen sirviendo para encontrarlos y arreglarlos, y desaparecen solos de
// esta lista en cuanto ya ningún ejercicio los usa.
function getAllLibraryTags() {
  const tags = new Set(LIB_MAIN_CATEGORIES);
  (S.library||[]).forEach(ex => (ex.tags||[]).forEach(t=>{ if(t) tags.add(t); }));
  return [...tags].sort((a,b)=>a.localeCompare(b));
}
window.getAllLibraryTags = getAllLibraryTags;

// Escala 1→5 en TODOS los ítems, y 5 siempre significa "mejor". Cada opción tiene
// una etiqueta explícita para que el atleta nunca tenga que interpretar un número solo.
const WELLNESS_ITEMS = [
  {key:'fatiga', label:'Fatiga', options:[
    {v:1,label:'Muy cansado',emoji:'😩'},{v:2,label:'Cansado',emoji:'😕'},{v:3,label:'Normal',emoji:'😐'},{v:4,label:'Fresco',emoji:'🙂'},{v:5,label:'Muy fresco',emoji:'💪'}]},
  {key:'sueño_calidad', label:'Calidad del sueño', options:[
    {v:1,label:'Muy mala',emoji:'😩'},{v:2,label:'Mala',emoji:'😕'},{v:3,label:'Normal',emoji:'😐'},{v:4,label:'Buena',emoji:'🙂'},{v:5,label:'Muy buena',emoji:'😴'}]},
  {key:'estres', label:'Estrés', options:[
    {v:1,label:'Muy estresado',emoji:'😩'},{v:2,label:'Estresado',emoji:'😕'},{v:3,label:'Normal',emoji:'😐'},{v:4,label:'Relajado',emoji:'🙂'},{v:5,label:'Muy relajado',emoji:'😌'}]},
  {key:'dolor_muscular', label:'Dolor muscular (DOMS)', options:[
    {v:1,label:'Mucho dolor',emoji:'😣'},{v:2,label:'Dolor',emoji:'😕'},{v:3,label:'Normal',emoji:'😐'},{v:4,label:'Leve',emoji:'🙂'},{v:5,label:'Sin dolor',emoji:'💪'}]},
  {key:'humor', label:'Estado de ánimo', options:[
    {v:1,label:'Muy mal',emoji:'😩'},{v:2,label:'Mal',emoji:'😕'},{v:3,label:'Normal',emoji:'😐'},{v:4,label:'Bien',emoji:'🙂'},{v:5,label:'Muy bien',emoji:'😄'}]},
];

// Sueño: el atleta selecciona horas reales (no una categoría). La categoría y el
// puntaje interno se derivan automáticamente a partir de las horas.
function sleepHoursCategory(hours) {
  if(hours===null||hours===undefined||hours==='') return null;
  const h=+hours;
  if(h<=3)  return {score:1, label:'Insuficiente', color:'var(--red)'};
  if(h<=5)  return {score:2, label:'Poco', color:'var(--amber)'};
  if(h<=7)  return {score:4, label:'Suficiente', color:'var(--green)'};
  return       {score:5, label:'Excelente', color:'var(--green)'};
}
window.sleepHoursCategory=sleepHoursCategory;

// Color semántico para un valor 1-5 de wellness (fatiga, sueño, estrés,
// dolor, ánimo) — reusa los mismos tokens rojo/ámbar/verde de siempre en vez
// de inventar un gradiente HSL aparte, para que el significado del color sea
// consistente en toda la app (1 = mal = rojo, 5 = bien = verde).
function wellnessValColor(val) {
  if(!val) return null;
  const map = {
    1: {solid:'var(--red)',   dim:'var(--red-dim)'},
    2: {solid:'var(--amber)', dim:'var(--amber-dim)'},
    3: {solid:'var(--blue)',  dim:'var(--blue-dim)'},
    4: {solid:'var(--teal)',  dim:'var(--teal-dim)'},
    5: {solid:'var(--green)', dim:'var(--green-dim)'},
  };
  return map[val] || null;
}
window.wellnessValColor = wellnessValColor;

// Nombres cortos de cada ítem de wellness, para chips angostos donde el
// label completo ("Dolor muscular (DOMS)", "Estado de ánimo") no entra.
const WELLNESS_SHORT_LABEL = { fatiga:'Fatiga', sueño_calidad:'Sueño', estres:'Estrés', dolor_muscular:'Dolor', humor:'Ánimo' };
window.WELLNESS_SHORT_LABEL = WELLNESS_SHORT_LABEL;

// Score compuesto de wellness: promedio de sub-puntajes normalizados (0–1, 1=mejor)
// entre los 5 ítems Likert + el ítem de horas de sueño. Se expresa como % (0–100, mayor=mejor).
function getWellnessScore(w) {
  if(!w) return {pct:null, allFilled:false};
  const parts=[]; let allFilled=true;
  WELLNESS_ITEMS.forEach(item=>{
    if(w[item.key]) parts.push((w[item.key]-1)/4);
    else allFilled=false;
  });
  if(w.sueño_horas!==undefined && w.sueño_horas!==null && w.sueño_horas!=='') {
    const cat=sleepHoursCategory(w.sueño_horas);
    parts.push((cat.score-1)/4);
  } else allFilled=false;
  if(!parts.length) return {pct:null, allFilled:false};
  const pct=Math.round((parts.reduce((a,v)=>a+v,0)/parts.length)*100);
  return {pct, allFilled};
}
window.getWellnessScore=getWellnessScore;

function getWellnessState(pct) {
  if(pct===null||pct===undefined) return {label:'Sin datos', color:'var(--text3)'};
  if(pct>=75) return {label:'En buena forma 💪', color:'var(--green)'};
  if(pct>=50) return {label:'Normal ✓', color:'var(--amber)'};
  return {label:'Fatigado 😴', color:'var(--red)'};
}
window.getWellnessState=getWellnessState;

// BODY_ZONES: type 'ellipse' → cx,cy,rx,ry | type 'circle' → cx,cy,r
// Joints = circle, segments = ellipse. viewBox 0 0 200 400
const BODY_ZONES = {
  front: [
    // HEAD & NECK
    {id:'cabeza',      label:'Cabeza',           type:'ellipse', cx:100, cy:22,  rx:18, ry:20},
    {id:'cuello',      label:'Cuello',            type:'ellipse', cx:100, cy:50,  rx:8,  ry:10},
    // SHOULDERS (joints)
    {id:'hombro_izq',  label:'Hombro izq.',       type:'circle',  cx:72,  cy:68,  r:10},
    {id:'hombro_der',  label:'Hombro der.',        type:'circle',  cx:128, cy:68,  r:10},
    // CHEST & ABDOMEN
    {id:'pecho',       label:'Pecho',             type:'ellipse', cx:100, cy:85,  rx:22, ry:18},
    {id:'abdomen',     label:'Abdomen',           type:'ellipse', cx:100, cy:120, rx:18, ry:16},
    // ARMS
    {id:'brazo_izq',   label:'Brazo izq.',        type:'ellipse', cx:62,  cy:95,  rx:8,  ry:22},
    {id:'brazo_der',   label:'Brazo der.',         type:'ellipse', cx:138, cy:95,  rx:8,  ry:22},
    // ELBOWS (joints)
    {id:'codo_izq',    label:'Codo izq.',          type:'circle',  cx:56,  cy:120, r:8},
    {id:'codo_der',    label:'Codo der.',           type:'circle',  cx:144, cy:120, r:8},
    // FOREARMS
    {id:'antebrazo_izq', label:'Antebrazo izq.',  type:'ellipse', cx:50,  cy:145, rx:7,  ry:18},
    {id:'antebrazo_der', label:'Antebrazo der.',   type:'ellipse', cx:150, cy:145, rx:7,  ry:18},
    // WRISTS (joints)
    {id:'muneca_izq',  label:'Muñeca izq.',        type:'circle',  cx:46,  cy:167, r:6},
    {id:'muneca_der',  label:'Muñeca der.',         type:'circle',  cx:154, cy:167, r:6},
    // HANDS
    {id:'mano_izq',    label:'Mano izq.',          type:'ellipse', cx:43,  cy:183, rx:7,  ry:12},
    {id:'mano_der',    label:'Mano der.',           type:'ellipse', cx:157, cy:183, rx:7,  ry:12},
    // HIPS (joint area)
    {id:'cadera',      label:'Cadera',            type:'ellipse', cx:100, cy:145, rx:20, ry:12},
    // QUADRICEPS
    {id:'cuad_izq',    label:'Cuádriceps izq.',   type:'ellipse', cx:87,  cy:192, rx:11, ry:30},
    {id:'cuad_der',    label:'Cuádriceps der.',    type:'ellipse', cx:113, cy:192, rx:11, ry:30},
    // KNEES (joints)
    {id:'rodilla_izq', label:'Rodilla izq.',       type:'circle',  cx:87,  cy:228, r:10},
    {id:'rodilla_der', label:'Rodilla der.',        type:'circle',  cx:113, cy:228, r:10},
    // TIBIAS
    {id:'tibia_izq',   label:'Tibia / Pantorrilla izq.', type:'ellipse', cx:86,  cy:268, rx:9,  ry:28},
    {id:'tibia_der',   label:'Tibia / Pantorrilla der.',  type:'ellipse', cx:114, cy:268, rx:9,  ry:28},
    // ANKLES (joints)
    {id:'tobillo_izq', label:'Tobillo izq.',       type:'circle',  cx:86,  cy:300, r:7},
    {id:'tobillo_der', label:'Tobillo der.',        type:'circle',  cx:114, cy:300, r:7},
    // FEET
    {id:'pie_izq',     label:'Pie izq.',           type:'ellipse', cx:82,  cy:316, rx:12, ry:8},
    {id:'pie_der',     label:'Pie der.',            type:'ellipse', cx:118, cy:316, rx:12, ry:8},
  ],
  back: [
    // HEAD & NECK
    {id:'cabeza_b',    label:'Cabeza (post.)',     type:'ellipse', cx:100, cy:22,  rx:18, ry:20},
    {id:'cuello_b',    label:'Cuello (post.)',     type:'ellipse', cx:100, cy:50,  rx:8,  ry:10},
    // SHOULDER JOINTS
    {id:'hombro_izq_b',label:'Hombro izq. (post.)',type:'circle', cx:72,  cy:68,  r:10},
    {id:'hombro_der_b',label:'Hombro der. (post.)',type:'circle', cx:128, cy:68,  r:10},
    // UPPER BACK
    {id:'trapecio',    label:'Trapecio',           type:'ellipse', cx:100, cy:75,  rx:22, ry:14},
    {id:'espalda_alta',label:'Espalda alta',       type:'ellipse', cx:100, cy:103, rx:20, ry:16},
    // ARMS (back)
    {id:'brazo_izq_b', label:'Brazo izq. (post.)',type:'ellipse', cx:62,  cy:95,  rx:8,  ry:22},
    {id:'brazo_der_b', label:'Brazo der. (post.)', type:'ellipse', cx:138, cy:95,  rx:8,  ry:22},
    // ELBOWS
    {id:'codo_izq_b',  label:'Codo izq. (post.)', type:'circle',  cx:56,  cy:120, r:8},
    {id:'codo_der_b',  label:'Codo der. (post.)',  type:'circle',  cx:144, cy:120, r:8},
    // FOREARMS (back)
    {id:'antebrazo_izq_b',label:'Antebrazo izq. (post.)',type:'ellipse',cx:50,cy:145,rx:7,ry:18},
    {id:'antebrazo_der_b',label:'Antebrazo der. (post.)',type:'ellipse',cx:150,cy:145,rx:7,ry:18},
    // LOWER BACK
    {id:'espalda_baja', label:'Espalda baja / Lumbares', type:'ellipse', cx:100, cy:132, rx:18, ry:14},
    // GLUTES
    {id:'gluteo_izq',  label:'Glúteo izq.',        type:'ellipse', cx:87,  cy:158, rx:13, ry:16},
    {id:'gluteo_der',  label:'Glúteo der.',         type:'ellipse', cx:113, cy:158, rx:13, ry:16},
    // HAMSTRINGS
    {id:'isq_izq',     label:'Isquiotibial izq.',  type:'ellipse', cx:87,  cy:200, rx:11, ry:28},
    {id:'isq_der',     label:'Isquiotibial der.',   type:'ellipse', cx:113, cy:200, rx:11, ry:28},
    // KNEES (back)
    {id:'rodilla_izq_b',label:'Rodilla izq. (post.)',type:'circle',cx:87, cy:228, r:10},
    {id:'rodilla_der_b',label:'Rodilla der. (post.)',type:'circle',cx:113,cy:228, r:10},
    // CALVES
    {id:'gemelo_izq',  label:'Gemelo izq.',         type:'ellipse', cx:86,  cy:263, rx:10, ry:26},
    {id:'gemelo_der',  label:'Gemelo der.',          type:'ellipse', cx:114, cy:263, rx:10, ry:26},
    // ANKLES (back)
    {id:'tobillo_izq_b',label:'Tobillo izq. (post.)',type:'circle',cx:86, cy:300, r:7},
    {id:'tobillo_der_b',label:'Tobillo der. (post.)',type:'circle',cx:114,cy:300, r:7},
    // FEET (back)
    {id:'pie_izq_b',   label:'Pie izq. (post.)',    type:'ellipse', cx:82,  cy:316, rx:12, ry:8},
    {id:'pie_der_b',   label:'Pie der. (post.)',     type:'ellipse', cx:118, cy:316, rx:12, ry:8},
  ]
};

// ── REFERENCIA / LEYENDAS DE MÉTRICAS ───────────────────────────
// Texto corto para el botón "?" que acompaña a cada número de carga o de
// salto — pensado para que ni el atleta ni el entrenador tengan que
// guiarse solo por el color. A propósito evita afirmar una sola lectura
// posible para los índices derivados (ej. Índice Elástico): un mismo
// número puede salir de historias muy distintas.
function infoLegendRow(color, title, text) {
  return `<div class="info-legend-row">
    ${color?`<div class="info-legend-dot" style="background:${color}"></div>`:''}
    <div><b>${title}</b> — ${text}</div>
  </div>`;
}

const INFO_LEGENDS = {
  wellness: { title:'Wellness (%)', html:
    `<p style="margin-bottom:10px">Tu estado percibido de hoy, según sueño, estrés, fatiga, dolor muscular y ánimo. No mide lo que entrenaste, sino cómo te sentís vos — un valor bajo puede venir del entrenamiento, pero también de factores fuera del gimnasio.</p>`
    + infoLegendRow('var(--green)','75-100%','en buena forma')
    + infoLegendRow('var(--amber)','50-74%','normal')
    + infoLegendRow('var(--red)','menos de 50%','fatigado — vale la pena prestarle atención')
  },
  ua: { title:'UA — Unidades Arbitrarias', html:
    `<p>Mide cuánto exigió una sesión, combinando la duración neta × el esfuerzo percibido (RPE de sesión). La carga <b>aguda</b> es tu última semana; la <b>crónica</b> es el promedio de las últimas 4 — se usan juntas para calcular el ACWR.</p>`
  },
  acwr: { title:'ACWR — Carga aguda : crónica', html:
    `<p style="margin-bottom:10px">Compara tu carga de esta semana contra tu promedio de las últimas 4. No es un semáforo infalible: un valor alto puede ser una progresión buscada o un salto brusco sin base — depende de tu planificación.</p>`
    + infoLegendRow('var(--purple)','menor a 0.8','carga baja respecto a tu base')
    + infoLegendRow('var(--green)','0.8 – 1.3','zona habitual')
    + infoLegendRow('var(--amber)','1.3 – 1.5','subida a vigilar')
    + infoLegendRow('var(--red)','mayor a 1.5','subida marcada — la literatura la asocia a mayor riesgo')
    + `<p style="margin-top:10px;font-size:11px;color:var(--text3)">Necesita 21 días de historial para ser confiable.</p>`
  },
  monotony: { title:'Monotonía', html:
    `<p style="margin-bottom:10px">Qué tan parecida es tu carga día a día en la semana. Un valor alto no es malo por sí solo (puede ser una semana de acumulación buscada), pero sostenido en el tiempo se asocia a mayor riesgo.</p>`
    + infoLegendRow('var(--green)','menor a 1.5','con variación')
    + infoLegendRow('var(--blue)','1.5 – 2.0','moderada')
    + infoLegendRow('var(--red)','mayor a 2.0','alta — sesiones muy parecidas entre sí')
  },
  strain: { title:'Strain', html:
    `<p style="margin-bottom:10px">Cruza carga semanal × monotonía. Sube cuando entrenás mucho y siempre igual al mismo tiempo — más una alerta combinada que un valor a minimizar siempre.</p>`
    + infoLegendRow('var(--green)','menor a 2000','bajo')
    + infoLegendRow('var(--amber)','2000 – 6000','moderado')
    + infoLegendRow('var(--red)','mayor a 6000','alto')
  },
  rpe: { title:'RPE — Esfuerzo percibido (escala de Foster)', html:
    `<p style="margin-bottom:10px">Cuánto esfuerzo sentiste — de 0 (reposo) a 10 (máximo). Es la misma escala tanto para calificar una sesión completa como un ejercicio puntual.</p>
     <table style="width:100%;border-collapse:collapse;font-size:12px">
       <tr><td style="padding:4px 8px;font-weight:700">0-1</td><td style="padding:4px 8px">Reposo / muy, muy suave</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">2-3</td><td style="padding:4px 8px">Suave</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">4-5</td><td style="padding:4px 8px">Moderado</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">6-7</td><td style="padding:4px 8px">Duro</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">8-9</td><td style="padding:4px 8px">Muy duro</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">10</td><td style="padding:4px 8px">Esfuerzo máximo</td></tr>
     </table>`
  },
  rir: { title:'RIR — Repeticiones en Reserva', html:
    `<p style="margin-bottom:10px">Cuántas repeticiones más podrías haber hecho en esa serie antes de fallar.</p>
     <table style="width:100%;border-collapse:collapse;font-size:12px">
       <tr><td style="padding:4px 8px;font-weight:700">0</td><td style="padding:4px 8px">Fallo — no podrías hacer una repetición más</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">1</td><td style="padding:4px 8px">Podrías hacer 1 repetición más</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">2</td><td style="padding:4px 8px">Podrías hacer 2 repeticiones más</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">3</td><td style="padding:4px 8px">Podrías hacer 3 repeticiones más</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">4-6</td><td style="padding:4px 8px">Esfuerzo moderado, con margen</td></tr>
       <tr><td style="padding:4px 8px;font-weight:700">6+</td><td style="padding:4px 8px">Esfuerzo liviano / activación</td></tr>
     </table>`
  },
  ice: { title:'Índice Elástico', html:
    `<p>Compara tu salto CMJ (con contramovimiento) contra tu SJ (Squat Jump o salto sin impulso). Un valor alto puede significar que aprovechás bien el CEA (ciclo estiramiento-acortamiento) de tus músculos y tendones. Valores bajos o negativos pueden ser una señal de que hay que mejorar el CEA — los trabajos pliométricos son una buena alternativa para esto.</p>`
  },
  coord: { title:'Coordinación de Brazos', html:
    `<p>Compara tu salto Abalakov (con brazos) contra tu CMJ. Muestra cuánto te ayuda — o no — el braceo al saltar. Un valor bajo puede indicar una técnica de braceo a pulir, no necesariamente un déficit físico.</p>`
  },
  asym: { title:'Asimetría Unilateral', html:
    `<p style="margin-bottom:10px">Marca la diferencia entre tu pierna derecha e izquierda en el CMJ unilateral.</p>`
    + infoLegendRow('var(--green)','hasta 10% de asimetría','normal')
    + infoLegendRow('var(--red)','más de 10% de asimetría','la literatura la asocia con mayor riesgo de lesión — candidato a trabajo unilateral compensatorio')
  },
};
// Vista combinada para el toggle RPE/RIR de la rutina — un solo ícono ahí
// muestra las dos tablas juntas, ya que en ese lugar puede estar activo
// cualquiera de los dos.
// Cada mitad lleva su propio subtítulo (reusando el title de rpe/rir, no uno
// duplicado a mano) — antes la parte de RIR arrancaba directo en el texto,
// sin nada que dijera "esto ya es RIR", así que después de la línea
// divisoria no quedaba claro qué tabla era cuál.
INFO_LEGENDS.intensity = { title:'RPE y RIR — Intensidad por serie', html:
  `<div style="margin-bottom:14px"><div style="font-weight:700;font-size:13px;margin-bottom:8px">${INFO_LEGENDS.rpe.title}</div>${INFO_LEGENDS.rpe.html}</div>`
  + `<hr style="border:none;border-top:1px solid var(--border);margin-bottom:14px">`
  + `<div><div style="font-weight:700;font-size:13px;margin-bottom:8px">${INFO_LEGENDS.rir.title}</div>${INFO_LEGENDS.rir.html}</div>`
};
window.INFO_LEGENDS = INFO_LEGENDS;

// Botón "?" reutilizable — se arma como string HTML para meter inline en
// cualquier template. Toca/clickea (no solo hover), así funciona igual en
// celular que en computadora.
function infoBtn(key) {
  return `<span class="info-btn" onclick="event.stopPropagation();openInfoModal('${key}')" title="Referencia">?</span>`;
}
window.infoBtn = infoBtn;

function openInfoModal(key) {
  const def = INFO_LEGENDS[key];
  if(!def) return;
  document.getElementById('info-modal-title').textContent = def.title;
  document.getElementById('info-modal-body').innerHTML = def.html;
  document.getElementById('info-modal-overlay').classList.add('open');
}
window.openInfoModal = openInfoModal;

function closeInfoModal() { document.getElementById('info-modal-overlay').classList.remove('open'); }
window.closeInfoModal = closeInfoModal;

function closeInfoModalIfOutside(e) { if(e.target===document.getElementById('info-modal-overlay')) closeInfoModal(); }
window.closeInfoModalIfOutside = closeInfoModalIfOutside;

// ── STATE ─────────────────────────────────────────────────────
let S = {
  user: null, isAdmin: false, userData: null,
  currentView: 'dashboard', currentSession: 'A', currentWeek: 1,
  startDate: todayLocal(),
  blocks: JSON.parse(JSON.stringify(DEFAULT_BLOCKS)),
  library: JSON.parse(JSON.stringify(DEFAULT_LIBRARY)),
  videos: {}, history: {}, wellness: {}, injuries: {}, injuryArchive: [], illnesses: [], personalExtras: {},
  teams: [], pendingAthletes: [], notifications: [], progressView: { week: 1 },
  myTeam: null, // solo para atletas de equipo: el doc de su propio equipo
  teamSubview: 'rutina',      // 'rutina'|'wellness'|'stats'|'evals' dentro de un equipo
  atletaView: null,           // uid del atleta individual seleccionado (o null = lista)
  atletaSubview: 'perfil',
  evalScopeUids: null,        // si está seteado, Evaluaciones solo muestra estos uids
  libTarget: null, videoTarget: null,
  activeFilters: new Set(), selectedZone: null,
  teamView: null,
  teamDayEdit: null,
  teamDayIdx: 0,
  // ── DASHBOARD ──
  dashAthletes: [],      // cached for dashboard
  dashLoaded: false,
  // ── SESSION FEEDBACK ──
  showSessionFeedback: false,
  feedbackSession: null, // {week, session}
  // ── EVALUATIONS ──
  evals: {},            // { athleteId: { cmj:[{date,height,tof,vel}], sj:[], abalakov:[], saltoH:[], cmj_der:[], cmj_izq:[] } }
  oneRM: {},            // {press_plano, sentadilla_barra, peso_muerto, cargada_potencia, arranque_potencia} en kg
  evalView: 'entry',    // 'entry' | 'history' | 'compare'
  evalHidden: new Set(), // tests hidden in history view
  _evalAthletesLoading: false,
  evalAthleteId: 'self',// 'self' or uid
  evalShowSecondary: false,
  evalCompareSelected: [],
  evalChartInstances: {},
  // ── ROUTINE SYSTEM ──
  routines: [],          // admin: all saved routines
  assignedRoutine: null, // athlete: { routineId, sessions:{name:[blocks]} }
  currentRoutineSessions: [],  // derived: array of session names for subnav
  // ── ADMIN PANEL STATE ──
  adminView: 'main',     // 'main' | 'athletes' | 'athlete_detail' | 'routines' | 'routine_edit'
  adminAthletes: [],     // list of all user docs
  adminAthletesLoaded: false,
  viewingAthlete: null,  // { uid, userData, personal }
  editingRoutine: null,  // { id, name, sessions }
  // ── ONBOARDING (perfil de atleta) ──
  onboardingStep: 1,
  onboardingData: {
    fullName: '', age: '', height: '', weight: '',
    athleteType: '',      // 'individual' | 'team'
    sport: '', position: '',           // si es individual
    institution: '', category: ''      // si es de equipo
  },
};
// Los atributos inline (onclick="S.x=...", oninput="S.x=...") se ejecutan en el
// scope global del navegador, no en el scope de este módulo — sin esto, CUALQUIER
// referencia directa a S dentro de un atributo HTML revienta con
// "ReferenceError: S is not defined". Esta línea es la que lo habilita.
window.S = S;

// ── AUTH MODE ─────────────────────────────────────────────────
let authMode = 'login';
function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('auth-sub').textContent = authMode === 'login' ? 'Tu sistema de entrenamiento' : 'Crear cuenta nueva';
  document.getElementById('auth-btn').textContent = authMode === 'login' ? 'Iniciar sesión' : 'Registrarse';
  document.getElementById('auth-name').style.display = authMode === 'register' ? 'block' : 'none';
  document.getElementById('auth-switch').innerHTML = authMode === 'login'
    ? '¿No tenés cuenta? <span>Registrarse</span>'
    : '¿Ya tenés cuenta? <span>Iniciar sesión</span>';
  document.getElementById('auth-err').textContent = '';
}
window.toggleAuthMode = toggleAuthMode;

async function authAction() {
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  const name = document.getElementById('auth-name').value.trim();
  const errEl = document.getElementById('auth-err');
  errEl.textContent = '';
  try {
    if (authMode === 'register') {
      if (!name) { errEl.textContent = 'Ingresá tu nombre'; return; }
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name, email, role: 'athlete', createdAt: serverTimestamp()
      });
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch(e) {
    const msgs = {
      'auth/user-not-found':'Email no encontrado',
      'auth/wrong-password':'Contraseña incorrecta',
      'auth/email-already-in-use':'Email ya registrado',
      'auth/weak-password':'Contraseña muy corta (mín. 6 caracteres)',
      'auth/invalid-email':'Email inválido',
      'auth/invalid-credential':'Email o contraseña incorrectos',
    };
    errEl.textContent = msgs[e.code] || e.message;
  }
}
window.authAction = authAction;

async function signOut() {
  await fbSignOut(auth);
  toggleProfileMenu(true);
}
window.signOut = signOut;

// ── AUTH STATE ────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  document.getElementById('loading').style.display = 'none';
  if (!user) {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    return;
  }
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  S.user = user;
  S.isAdmin = user.email === ADMIN_EMAIL;

  // Load user data from Firestore
  const uRef = doc(db, 'users', user.uid);
  const uSnap = await getDoc(uRef);
  if (uSnap.exists()) {
    S.userData = uSnap.data();
  } else {
    S.userData = { name: user.email.split('@')[0], email: user.email, role: 'athlete' };
    await setDoc(uRef, { ...S.userData, createdAt: serverTimestamp() });
  }

  // Load personal data
  const pRef = doc(db, 'personal', user.uid);
  const pSnap = await getDoc(pRef);
  if (pSnap.exists()) {
    const d = pSnap.data();
    if (d.evals) S.evals = d.evals;
    if (d.oneRM) S.oneRM = d.oneRM;
    // "history" (anidado) es la fuente de verdad; "sessionLogs" (campo suelto,
    // legado) es solo un respaldo para docs viejos que todavía no tengan
    // _sessionLogs adentro de history. Antes el orden era al revés en la
    // práctica (se pisaba history entero después), así que si algún doc
    // viejo tenía sessionLogs pero no history._sessionLogs, se perdía.
    if (d.history) S.history = d.history;
    if (!S.history) S.history = {};
    if (!S.history._sessionLogs && d.sessionLogs) S.history._sessionLogs = d.sessionLogs;
    if (d.wellness) S.wellness = d.wellness;
    if (d.injuries) S.injuries = d.injuries;
    if (d.injuryArchive) S.injuryArchive = d.injuryArchive;
    if (d.illnesses) S.illnesses = d.illnesses;
    if (d.personalExtras) S.personalExtras = d.personalExtras;
    if (d.notifications) S.notifications = d.notifications;
    if (d.currentWeek) S.currentWeek = d.currentWeek;
    // BUG encontrado y corregido acá — la causa real de "siempre me dice
    // Semana 1": S.startDate arranca con el default "hoy" (ver la
    // declaración de S) y solo se pisa con un valor real si personal/{uid}
    // trae un campo startDate guardado. Cuentas viejas, de antes de que
    // saveToFirestore() empezara a guardar startDate en cada save, nunca
    // llegaron a tener ese campo — así que en cada carga de la página
    // volvía a caer en "hoy", computeWeekFromDate("hoy") siempre da semana
    // 1, y quedaba pegado ahí para siempre sin importar cuánto hacía que
    // esa rutina estaba corriendo de verdad. createdAt (la fecha real en la
    // que se creó la cuenta, guardada una sola vez al registrarse) es un
    // ancla muchísimo mejor que "hoy" para esos casos — y de paso lo
    // guardamos ya mismo para no tener que volver a derivarlo cada vez.
    if (d.startDate) {
      S.startDate = d.startDate;
    } else if (S.userData?.createdAt?.toDate) {
      S.startDate = toLocalDateStr(S.userData.createdAt.toDate());
      updateDocSafe(pRef, { startDate: S.startDate }).catch(()=>{});
    }
    // La semana SIEMPRE se recalcula a partir de la fecha de inicio real —
    // así avanza sola con el calendario, entrene o no entrene el atleta.
    // Si tiene una rutina asignada, la semana se cuenta desde el día que se
    // la asignaron (no desde que se registró) — es lo que corresponde a la
    // planificación real que está corriendo.
    // El valor guardado (d.currentWeek) queda solo como respaldo si por algún
    // motivo no hay ninguna fecha disponible.
    if (S.userData?.assignedRoutine && S.userData?.routineAssignedDate) {
      S.currentWeek = computeWeekFromDate(S.userData.routineAssignedDate);
    } else if (S.startDate) {
      S.currentWeek = computeWeekFromDate(S.startDate);
    }
    // blocks only loaded for admin (athletes get them from assigned routine)
    if (S.isAdmin) {
      // Admin loads their own personal blocks
      if (d.blocks) S.blocks = d.blocks;
      else S.blocks = JSON.parse(JSON.stringify(DEFAULT_BLOCKS)); // admin fallback to default
    }
    // Athletes never load blocks — they come from assignedRoutine only
  }

  // Biblioteca de ejercicios y videos: son recursos COMPARTIDOS de todo el
  // gimnasio (un solo admin, un solo set de ejercicios/videos) — viven en un
  // documento aparte que TODOS (admin y atletas) leen, para que un atleta vea
  // los mismos videos que el admin cargó. Antes vivían en personal/{uid} de
  // cada usuario, por eso nunca le llegaban a ningún atleta.
  try {
    const sharedRef = doc(db, 'shared', 'library');
    const sharedSnap = await getDoc(sharedRef);
    if (sharedSnap.exists()) {
      const sd = sharedSnap.data();
      if (sd.library) S.library = sd.library;
      if (sd.videos) S.videos = sd.videos;
    } else if (S.isAdmin && pSnap.exists()) {
      // Migración única: si el admin todavía tiene biblioteca/videos viejos en
      // su documento personal (de antes de este cambio), los copiamos al
      // documento compartido para no perder lo ya cargado.
      const d = pSnap.data();
      if (d.library || d.videos) {
        if (d.library) S.library = d.library;
        if (d.videos) S.videos = d.videos;
        await setDoc(sharedRef, { library: S.library, videos: S.videos }, { merge: true });
      }
    }
  } catch(e) { console.error('Error cargando biblioteca/videos compartidos', e); }

  // Equipos: los necesita el admin para todo, y también cualquier atleta
  // durante el onboarding (para elegir a qué equipo pertenece de una lista
  // real, no de una lista fija hardcodeada). Las reglas de Firestore ya
  // permiten que cualquier usuario logueado los lea.
  try {
    const tSnap = await getDocs(collection(db, 'teams'));
    S.teams = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) { console.error('Error cargando equipos', e); }

  if (S.isAdmin) {
    // Load all routines
    const rSnap = await getDocs(collection(db, 'routines'));
    S.routines = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Jugadores cargados de antemano que todavía no se registraron con una
    // cuenta real — pueden tener tests/evaluaciones ya cargados.
    try {
      const pSnap2 = await getDocs(collection(db, 'pendingAthletes'));
      S.pendingAthletes = pSnap2.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { S.pendingAthletes = []; }
  } else {
    // Athlete: la rutina PERSONAL (assignedRoutine) tiene prioridad.
    // Si no tiene una personal y pertenece a un equipo, hereda los "días de
    // entrenamiento" que el admin armó para ese equipo — son la rutina real.
    const assignedId = S.userData.assignedRoutine || null;
    if (assignedId) {
      const rSnap = await getDoc(doc(db, 'routines', assignedId));
      if (rSnap.exists()) {
        S.assignedRoutine = { id: assignedId, ...rSnap.data() };
        S.currentRoutineSessions = getOrderedSessionNames(S.assignedRoutine);
        if (S.currentRoutineSessions.length) S.currentSession = getTodaysRoutineSession(S.currentRoutineSessions, S.userData.routineAssignedDate, S.userData.trainingWeekdays);
        // blocks are read-only from routine; don't overwrite with personal
      }
    } else if (S.userData.teamId) {
      const tSnap = await getDoc(doc(db, 'teams', S.userData.teamId));
      if (tSnap.exists()) {
        const team = { id: S.userData.teamId, ...tSnap.data() };
        S.myTeam = team;
        const days = team.trainingDays || [];
        const sessions = {};
        days.forEach((d, i) => {
          let key = d.title || `Día ${i + 1}`;
          if (sessions[key]) key = `${key} (${i + 1})`; // evita choques de nombre
          sessions[key] = d.blocks || [];
        });
        // Se arma como si fuera una rutina más — así toda la lógica de
        // sesión/semana/historial que ya existe funciona sin cambios.
        S.assignedRoutine = { id: null, name: team.category ? `${team.name} · ${team.category}` : team.name, sessions, fromTeam: true };
        S.currentRoutineSessions = sortSessionNames(Object.keys(sessions));
        if (S.currentRoutineSessions.length) S.currentSession = getTodaysRoutineSession(S.currentRoutineSessions, null);
      }
    }
  }

  // ── GATE DE ONBOARDING ──────────────────────────────────────
  // Los atletas (no el admin) no pueden usar la app hasta completar su perfil.
  if (!S.isAdmin && !S.userData.onboardingComplete) {
    S.currentView = 'onboarding';
  }

  // Update profile menu
  document.getElementById('pm-name').textContent = S.userData.name || '—';
  document.getElementById('pm-email').textContent = S.userData.email || '—';
  document.getElementById('pm-role').textContent = S.isAdmin ? 'admin' : 'atleta';
  updateTopbarAvatar();
  if (S.isAdmin) {
    document.getElementById('pm-admin').style.display = 'block';
  }
  updateNotifBadge();

  renderBottomBar();
  renderAll();
});

// ── SAVE ──────────────────────────────────────────────────────
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToFirestore, 1500);
}

// ── BUG DE BASE, CONFIRMADO CONTRA FIRESTORE REAL ──────────────────────
// setDoc(ref, {'wellness.2026-07-30': valor}, {merge:true}) NO mete "valor"
// adentro del mapa "wellness" en la clave "2026-07-30" — crea un campo de
// primer nivel que se llama LITERALMENTE "wellness.2026-07-30" (con el punto
// como parte del nombre). Esa interpretación de "ruta con puntos" es SOLO de
// updateDoc(), no de setDoc() con merge. Por eso cada guardado puntual por
// fecha/zona de esta app (wellness, lesiones, evaluaciones, calendario, 1RM,
// extras personales) venía "guardando bien" sin ningún error, pero nadie
// nunca leía ese campo con nombre raro — al recargar, desaparecía. Este
// helper usa updateDoc() de verdad (que sí entiende las rutas con puntos), y
// si el documento todavía no existe (updateDoc no lo crea solo, a diferencia
// de setDoc+merge), lo crea vacío primero y reintenta.
async function updateDocSafe(ref, dotPathData) {
  try {
    await updateDoc(ref, dotPathData);
  } catch(e) {
    if (e.code === 'not-found') {
      await setDoc(ref, {}, { merge: true });
      await updateDoc(ref, dotPathData);
    } else {
      throw e;
    }
  }
}
window.updateDocSafe = updateDocSafe;

// Para acciones de "esto ya está, lo mando" (terminar wellness, guardar
// carga, guardar una molestia) — NUNCA el guardado con demora de 1.5s de
// scheduleSave(). Ese debounce está pensado para no spamear Firestore
// mientras el atleta todavía está tipeando/tocando cosas, pero si el
// resultado (guardado o no) recién se sabe 1.5s después de un toast de
// "listo" que ya se mostró, y el atleta cierra la app apenas ve ese
// mensaje (comportamiento carasímil en el celular), ese guardado pendiente
// nunca llega a salir — quedaba la sensación de "completé todo y no le
// llegó nada al entrenador". Acá se guarda de una, y el toast de éxito solo
// se muestra después de que el guardado realmente confirmó.
async function saveNow() {
  clearTimeout(saveTimer);
  return await saveToFirestore();
}
window.saveNow = saveNow;

// ── QUÉ SE TOCÓ REALMENTE ESTA SESIÓN (para guardar sin pisar nada ajeno) ──
// PWAs instaladas (agregadas a la pantalla de inicio) suelen quedar
// "congeladas" en memoria por horas o días en vez de recargarse cada vez
// que se abren — el celular las suspende y las retoma tal cual estaban. Si
// mientras tanto un admin corrigió algo (una fecha de wellness movida, una
// lesión reclasificada) y DESPUÉS esa sesión vieja guarda cualquier cosa,
// el guardado de siempre (wellness/carga ENTEROS con lo que hubiera en
// memoria) pisaba la corrección — el dato volvía a aparecer mal, tal cual
// se reportó. La solución: guardar SOLO las fechas que esta sesión tocó de
// verdad, nunca el objeto completo.
function markWellnessDirty(date) {
  if(!S._dirtyWellnessDates) S._dirtyWellnessDates = new Set();
  S._dirtyWellnessDates.add(date);
}
window.markWellnessDirty = markWellnessDirty;

function markCargaDirty(date) {
  if(!S._dirtyCargaDates) S._dirtyCargaDates = new Set();
  S._dirtyCargaDates.add(date);
}
window.markCargaDirty = markCargaDirty;

function markInjuryDirty(zid) {
  if(!S._dirtyInjuryZones) S._dirtyInjuryZones = new Set();
  S._dirtyInjuryZones.add(zid);
}
window.markInjuryDirty = markInjuryDirty;

function markEvalDirty(testId) {
  if(!S._dirtyEvalTests) S._dirtyEvalTests = new Set();
  S._dirtyEvalTests.add(testId);
}
window.markEvalDirty = markEvalDirty;

function markIllnessDirty(id) {
  if(!S._dirtyIllnessIds) S._dirtyIllnessIds = new Set();
  S._dirtyIllnessIds.add(id);
}
window.markIllnessDirty = markIllnessDirty;

// Progreso de rutina (pesos, reps, el tilde de "hecho" por ejercicio) —
// BUG GRAVE encontrado y corregido acá: esto vivía en S.history[sessionKey],
// pero saveToFirestore() nunca lo incluía en ningún guardado — ni con el
// debounce de siempre, ni al tocar "Guardar rutina" (finishSession() solo
// marca sd.done=true y llama scheduleSave(), que tampoco lo mandaba). Un
// atleta podía completar toda una sesión, cerrar la app sin haber
// terminado (típico: entrena, se va, sigue después) y perder todo lo
// tipeado — nunca había llegado a guardarse en ningún momento. Ahora cada
// campo tocado marca su sessionKey como sucio, y si o sí se incluye acá.
function markRoutineDirty(sk) {
  if(!S._dirtyRoutineSessions) S._dirtyRoutineSessions = new Set();
  S._dirtyRoutineSessions.add(sk);
}
window.markRoutineDirty = markRoutineDirty;

async function saveToFirestore() {
  if (!S.user) return;
  try {
    const dataToSave = {
      // injuryArchive queda como campo completo a propósito: es historial que
      // solo el propio atleta escribe (nadie más lo toca desde el lado
      // admin), así que no hay con quién colisionar.
      injuryArchive: S.injuryArchive||[],
      // personalExtras NO se re-guarda acá a propósito: el atleta nunca lo
      // edita (solo lo lee), así que reescribirlo en cada save suyo
      // arriesgaba el mismo bug que saveTeam() — pisar con una copia local
      // vieja lo que el admin acaba de agregarle, si guardó algo (wellness,
      // dolor) antes de refrescar la página. Solo lo escriben
      // addPersonalExtraExercise/removePersonalExtraExercise, del lado admin.
      currentWeek: S.currentWeek, startDate: S.startDate,
      updatedAt: serverTimestamp()
    };
    // Evaluaciones: por test puntual (dot-path) — el admin puede cargar un
    // test para este mismo atleta desde su propia sesión (saveAthleteEvalsDoc)
    // mientras esta sesión sigue abierta; si mandáramos el mapa "evals"
    // entero, el próximo guardado de wellness/carga de esta sesión pisaría
    // ese test recién cargado por el admin.
    (S._dirtyEvalTests||new Set()).forEach(testId=>{
      if(S.evals[testId]) dataToSave['evals.'+testId] = S.evals[testId];
    });
    // Wellness: SOLO las fechas que esta sesión modificó, por campo puntual
    // (dot-path) — así una fecha que un admin ya movió/borró en otro lado
    // nunca se puede "resucitar" con una copia vieja, aunque esta sesión
    // todavía la tenga en memoria.
    (S._dirtyWellnessDates||new Set()).forEach(date=>{
      if(S.wellness[date]) dataToSave['wellness.'+date] = S.wellness[date];
    });
    // Lesiones/molestias: mismo criterio, por zona puntual — si la zona ya
    // no existe en memoria es porque se resolvió/quitó, así que se borra en
    // Firestore con deleteField() en vez de mandar el mapa entero (que podía
    // pisar una gravedad o fase de retorno que el entrenador acababa de fijar).
    (S._dirtyInjuryZones||new Set()).forEach(zid=>{
      dataToSave['injuries.'+zid] = S.injuries[zid] ? S.injuries[zid] : deleteField();
    });
    // Progreso de rutina — por sesión puntual (dot-path), la que se tocó de
    // verdad esta vez.
    (S._dirtyRoutineSessions||new Set()).forEach(sk=>{
      if(S.history[sk]) dataToSave['history.'+sk] = S.history[sk];
    });
    // Carga (_sessionLogs): es un array, no se puede tocar una fecha suelta
    // con dot-path — leemos lo que hay guardado de verdad ahora mismo,
    // sacamos las fechas que esta sesión tocó (van a quedar reemplazadas) y
    // le sumamos las versiones locales de esas fechas. Cualquier otra fecha
    // (tocada por un admin mientras tanto) queda tal cual estaba en el server.
    const dirtyCarga = S._dirtyCargaDates||new Set();
    if(dirtyCarga.size) {
      let serverLogs = [];
      try {
        const snap = await getDoc(doc(db,'personal',S.user.uid));
        if(snap.exists()) serverLogs = snap.data().history?._sessionLogs || snap.data().sessionLogs || [];
      } catch(e) { serverLogs = S.history._sessionLogs||[]; }
      const keptServerLogs = serverLogs.filter(l=>!dirtyCarga.has(l.date));
      const localDirtyLogs = (S.history._sessionLogs||[]).filter(l=>dirtyCarga.has(l.date));
      const mergedLogs = [...keptServerLogs, ...localDirtyLogs];
      dataToSave['history._sessionLogs'] = mergedLogs;
      dataToSave.sessionLogs = mergedLogs;
      S.history._sessionLogs = mergedLogs;
    }
    // Enfermedades: mismo criterio que la carga — es un array, así que
    // mezclamos por id en vez de mandar la lista entera. adminAddIllness /
    // adminResolveIllness ya escriben esto mismo desde el lado admin, así
    // que sin esto el próximo guardado del propio atleta podía revivir una
    // enfermedad que el admin acababa de marcar como recuperada.
    const dirtyIll = S._dirtyIllnessIds||new Set();
    if(dirtyIll.size) {
      let serverIll = [];
      try {
        const snap = await getDoc(doc(db,'personal',S.user.uid));
        if(snap.exists()) serverIll = snap.data().illnesses || [];
      } catch(e) { serverIll = S.illnesses||[]; }
      const keptServerIll = serverIll.filter(x=>!dirtyIll.has(x.id));
      const localDirtyIll = (S.illnesses||[]).filter(x=>dirtyIll.has(x.id));
      dataToSave.illnesses = [...keptServerIll, ...localDirtyIll];
    }
    if (S.isAdmin) {
      // Admin saves their own personal blocks
      dataToSave.blocks = S.blocks;
      // Biblioteca y videos son compartidos — van a su propio documento, no al personal
      await setDoc(doc(db, 'shared', 'library'), { library: S.library, videos: S.videos }, { merge: true });
    }
    await updateDocSafe(doc(db, 'personal', S.user.uid), dataToSave);
    S._dirtyWellnessDates = new Set();
    S._dirtyCargaDates = new Set();
    S._dirtyInjuryZones = new Set();
    S._dirtyEvalTests = new Set();
    S._dirtyIllnessIds = new Set();
    S._dirtyRoutineSessions = new Set();
    return true;
  } catch(e) { console.error('Save error', e); return false; }
}

// ── HELPERS ───────────────────────────────────────────────────
function genId() { return 'x' + Date.now() + Math.floor(Math.random()*9999); }

// Comparación de nombres de persona usada en TODOS los lugares donde hay que
// reconciliar "texto escrito a mano" con "cuenta real" (roster del equipo,
// migración de tests de jugadores pendientes, etc.) — ignora mayúsculas,
// espacios de más, Y el orden de las palabras ("Flores Joaquín" y "Joaquín
// Flores" cuentan como la misma persona). Antes existían DOS versiones de
// esta comparación en distintas partes del código: una flexible (para
// mostrar "cuenta vinculada" en el roster) y otra estricta (para migrar
// tests de jugadores pendientes) — esa inconsistencia hacía que la
// migración fallara justo cuando alguien se registraba con el nombre en
// otro orden. Ahora es una sola función, usada en los dos lugares.
function normPersonName(s) { return (s||'').trim().toLowerCase(); }
window.normPersonName=normPersonName;
function namesLikelyMatch(x,y) {
  const wx=normPersonName(x).split(/\s+/).filter(Boolean).sort().join(' ');
  const wy=normPersonName(y).split(/\s+/).filter(Boolean).sort().join(' ');
  return !!wx && !!wy && wx===wy;
}
window.namesLikelyMatch=namesLikelyMatch;

// Pone en mayúscula la primera letra de cada palabra (y el resto en minúscula)
// — "GANORA" o "ganora" se guardan siempre como "Ganora".
function capitalizeName(s) {
  return (s||'').trim().split(/\s+/).filter(Boolean)
    .map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
}
window.capitalizeName=capitalizeName;

// Ordena nombres de sesión/día ("Día 1","Día 2"...) de forma numérica en vez
// de por orden de inserción (que es lo que da Object.keys por default, y por
// eso a veces aparecían como "Día 2, Día 3, Día 4, Día 1").
// parseFloat corta la lectura en la coma ("77,5" → 77, sin error ni aviso).
// Los porcentajes de RM se escriben en notación es-AR (coma decimal), así
// que cualquier número que el usuario tipeó con coma tiene que pasar por acá
// antes de un parseFloat — si no, el decimal se pierde silenciosamente.
function parseDecimal(str) {
  if (str === null || str === undefined) return NaN;
  return parseFloat(String(str).trim().replace(',', '.'));
}
window.parseDecimal = parseDecimal;

const WEEKDAY_ORDER = {lunes:0,martes:1,miercoles:2,'miércoles':2,jueves:3,viernes:4,sabado:5,'sábado':5,domingo:6};
function sortSessionNames(names) {
  return [...names].sort((a,b)=>{
    const na=parseInt((a.match(/\d+/)||[])[0],10);
    const nb=parseInt((b.match(/\d+/)||[])[0],10);
    if(!isNaN(na)&&!isNaN(nb)) return na-nb;
    // Si el nombre del día es un día de la semana (Lunes, Martes...),
    // ordenamos por el calendario real, no alfabéticamente — si no,
    // "Jueves" queda antes que "Lunes" porque la J va antes que la L.
    const wa = WEEKDAY_ORDER[a.trim().toLowerCase()];
    const wb = WEEKDAY_ORDER[b.trim().toLowerCase()];
    if(wa!==undefined && wb!==undefined) return wa-wb;
    return a.localeCompare(b);
  });
}
window.sortSessionNames=sortSessionNames;

// Qué día de la rutina le toca a un atleta HOY, sin que tenga que elegirlo
// a mano — y sin importar si completó o no el día anterior (a las 00:00
// ya es otro día, y le corresponde el que sigue).
// - Si los nombres de día son días de la semana reales (Lunes, Martes...),
//   usamos el calendario real: el día de HOY si está en la rutina, o el
//   próximo que venga si hoy es un día de descanso.
// - Si son genéricos (Día 1, Día 2...), avanzamos un día de la rutina por
//   cada día calendario transcurrido desde que se ASIGNÓ, dando la vuelta
//   cíclicamente si la rutina tiene menos días que los transcurridos.
// Cuando el admin elige a mano qué días de la semana el atleta va al
// gimnasio (trainingWeekdays, ej. [0,2,4] = lunes/miércoles/viernes), esa
// selección es la fuente de verdad de qué día de la rutina corresponde a
// cada día real — sin importar cómo se llamen los días de la rutina
// (Lunes, "Día 1", "Push"...). Se empareja por posición: el primer día
// seleccionado (ordenado lunes→domingo) es el primer día de la rutina, el
// segundo seleccionado el segundo día, y así — repitiendo cíclicamente si
// hay más días seleccionados que días en la rutina.
function getWeekdayScheduleMap(sessionNames, trainingWeekdays) {
  const map = {};
  if (!sessionNames || !sessionNames.length || !trainingWeekdays || !trainingWeekdays.length) return map;
  const sorted = [...trainingWeekdays].sort((a,b)=>a-b);
  sorted.forEach((dow, i) => { map[dow] = sessionNames[i % sessionNames.length]; });
  return map;
}
window.getWeekdayScheduleMap = getWeekdayScheduleMap;

function getTodaysRoutineSession(sessionNames, assignedDate, trainingWeekdays) {
  if(!sessionNames || !sessionNames.length) return null;
  // Prioridad 1: días de gimnasio elegidos a mano por el admin al asignar.
  if (trainingWeekdays && trainingWeekdays.length) {
    const map = getWeekdayScheduleMap(sessionNames, trainingWeekdays);
    const todayDow = (new Date().getDay()+6)%7; // lunes=0
    if (map[todayDow] !== undefined) return map[todayDow];
    // Hoy no es día de gimnasio: mostramos igual cuál es el próximo que viene.
    const sorted = [...trainingWeekdays].sort((a,b)=>a-b);
    let best = null, bestDiff = 8;
    sorted.forEach(dow=>{ let diff = dow - todayDow; if(diff<0) diff += 7; if(diff < bestDiff){ bestDiff = diff; best = map[dow]; } });
    return best;
  }
  const allWeekdays = sessionNames.every(n => WEEKDAY_ORDER[n.trim().toLowerCase()] !== undefined);
  if(allWeekdays) {
    const todayDow = (new Date().getDay()+6)%7; // lunes=0
    let best = null, bestDiff = 8;
    sessionNames.forEach(n=>{
      const dow = WEEKDAY_ORDER[n.trim().toLowerCase()];
      let diff = dow - todayDow; if(diff<0) diff += 7;
      if(diff < bestDiff) { bestDiff = diff; best = n; }
    });
    return best;
  }
  if(!assignedDate) return sessionNames[0];
  const start = new Date(assignedDate+'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.floor((today-start)/86400000);
  const idx = ((diffDays % sessionNames.length) + sessionNames.length) % sessionNames.length;
  return sessionNames[idx];
}
window.getTodaysRoutineSession = getTodaysRoutineSession;

// Bloques de una rutina que le corresponden a ESTE atleta puntual en esta
// sesión — se arma en dos pasos:
// 1) Si esta rutina fue asignada a TODO un equipo (team.assignedRoutineId
//    coincide), se filtra por el mapeo bloque→puesto que se configuró en
//    ESE momento (no en el editor de rutinas — la rutina en sí es genérica,
//    reusable para cualquier equipo/atleta). Un bloque sin puesto asignado
//    lo ve todo el mundo.
// 2) Se le suman, al final, los ejercicios "personales" que el admin le haya
//    cargado a este atleta puntual — un bloque sintético que solo existe
//    para él, sin tocar la rutina compartida ni afectar a sus compañeros.
function getVisibleRoutineBlocks(routine, sessionName, teamId, position, personalExtras) {
  const allBlocks = (routine?.sessions || {})[sessionName] || [];
  const team = teamId ? S.teams.find(t=>t.id===teamId) : null;
  const posMap = (team && routine?.id && team.assignedRoutineId===routine.id) ? (team.routineBlockPositions||{}) : null;
  let blocks = posMap
    ? allBlocks.filter(b=>{ const positions=posMap[b.id]; return !positions || !positions.length || positions.includes(position); })
    : allBlocks;
  const extras = (personalExtras||{})[sessionName] || [];
  if(extras.length) {
    blocks = [...blocks, {id:'personal-block', label:'Personal', title:'Ejercicios personales', colorKey:'bx', note:'', categories:[{id:'personal-cat', label:'Solo para vos', exercises:extras}]}];
  }
  return blocks;
}
window.getVisibleRoutineBlocks = getVisibleRoutineBlocks;

// Los registros de un test (salto o fuerza) tienen que quedar SIEMPRE
// ordenados por la fecha real del test, no por el orden en que se cargaron
// — si cargás hoy un salto de hace 3 meses, tiene que aparecer donde
// corresponde cronológicamente, no al final de la lista.
function sortEvalRecsByDate(arr) {
  arr.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  return arr;
}
window.sortEvalRecsByDate=sortEvalRecsByDate;
// Calcula la semana de entrenamiento a partir de la fecha real de inicio —
// avanza sola con el calendario, sin importar si el atleta entrenó o no.
function computeWeekFromDate(startDate) {
  if(!startDate) return 1;
  const start = new Date(startDate+'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.floor((today-start)/86400000);
  return Math.max(1, Math.floor(diffDays/7)+1);
}
window.computeWeekFromDate = computeWeekFromDate;

// S.currentWeek y S.currentSession se calculan una sola vez, al loguear —
// pero una PWA suele quedar "abierta" en memoria días enteros (se la trae al
// frente desde el ícono del celular en vez de recargarla de cero), así que
// esos valores se congelaban en lo que eran el día del último login real y
// nunca se enteraban de que ya arrancó una semana nueva. Esto recalcula
// ambos con lo que ya está en memoria (sin ir a buscar nada a Firestore) —
// se llama de nuevo cada vez que la app vuelve a primer plano.
function refreshTodaysTrainingContext() {
  if(!S.userData) return;
  if(S.userData.assignedRoutine && S.userData.routineAssignedDate) {
    S.currentWeek = computeWeekFromDate(S.userData.routineAssignedDate);
  } else if(S.startDate) {
    S.currentWeek = computeWeekFromDate(S.startDate);
  }
  if(!S.isAdmin && S.currentRoutineSessions && S.currentRoutineSessions.length) {
    const assignedDate = S.assignedRoutine?.fromTeam ? null : S.userData.routineAssignedDate;
    S.currentSession = getTodaysRoutineSession(S.currentRoutineSessions, assignedDate, S.userData.trainingWeekdays);
  }
}
window.refreshTodaysTrainingContext = refreshTodaysTrainingContext;

// Rango lunes-domingo de la semana calendario REAL de hoy — para el admin,
// que gestiona muchos atletas cada uno en una semana distinta de su propia
// planificación, mostrar "Semana 3" era ambiguo (¿semana 3 de quién?). Esto
// no depende de ningún atleta puntual.
// Los jugadores de EQUIPO no tienen un programa propio que avanza semana a
// semana desde que se registraron — entrenan según el calendario del
// equipo. Mostrarles "Semana 1", "Semana 2"... (contado desde su alta) no
// significa nada real y confunde. Para ellos (y para el admin) mostramos la
// semana calendario actual con su rango de fechas; solo a un atleta
// individual con programa propio le sigue sirviendo el número de semana.
function isTeamAthlete() { return S.userData?.athleteType === 'team'; }
window.isTeamAthlete = isTeamAthlete;
function getWeekHeaderLabel() {
  // "Semana actual" + la fecha, siempre — antes el atleta individual veía
  // solo "Semana N" pelado, sin fecha, mientras que equipo/admin sí tenían
  // el rango de fechas (aunque sin la palabra "actual" delante). Unificado
  // acá para que diga lo mismo en los dos casos.
  if(S.isAdmin || isTeamAthlete()) return 'Semana actual · '+getCurrentWeekRangeLabel();
  const range = getProgramWeekRangeLabel(S.currentWeek);
  return 'Semana actual'+(range?' · '+range:'');
}
window.getWeekHeaderLabel = getWeekHeaderLabel;

// ── REPASAR OTRAS SEMANAS DE LA RUTINA (solo atleta individual) ───────────
// Nunca toca S.startDate ni S.currentWeek reales — es puramente "qué semana
// estoy MIRANDO", separado del progreso real (que sigue su curso solo, según
// la fecha). Antes la única forma de ver otra semana era el selector de
// "Semana actual" en Ajustes, que en realidad CORRÍA la fecha de inicio real
// del programa — mezclaba "repasar" con "mover mi plan", que es justo lo que
// no se quería. Solo para atletas individuales: los de equipo no planifican
// semana a semana con tanta anticipación, así que no hace falta.
function getRoutineWeek() {
  return S._routineViewWeek || S.currentWeek;
}
window.getRoutineWeek = getRoutineWeek;

function browseRoutineWeek(delta) {
  const base = S._routineViewWeek || S.currentWeek;
  const target = Math.max(1, base + delta);
  S._routineViewWeek = (target === S.currentWeek) ? null : target;
  renderAll();
}
window.browseRoutineWeek = browseRoutineWeek;

function resetRoutineWeekView() {
  S._routineViewWeek = null;
  renderAll();
}
window.resetRoutineWeekView = resetRoutineWeekView;

function getCurrentWeekRangeLabel() {
  const now = new Date();
  const dow = (now.getDay()+6)%7; // lunes=0
  const monday = new Date(now); monday.setDate(now.getDate()-dow);
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
  const fmt = (d) => d.toLocaleDateString('es-AR',{day:'numeric',month:'short'});
  return `${fmt(monday)} – ${fmt(sunday)}`;
}
window.getCurrentWeekRangeLabel = getCurrentWeekRangeLabel;

// Rango de fechas de una semana PUNTUAL del programa de un atleta individual
// (semana N desde su propia fecha de inicio) — mismo cálculo que
// computeWeekFromDate() pero al revés, para que "Semana 3" y el rango de
// fechas que se muestra sean siempre consistentes entre sí.
function getProgramWeekRangeLabel(weekNum) {
  if(!S.startDate) return null;
  const start = new Date(S.startDate+'T00:00:00');
  const monday = new Date(start); monday.setDate(start.getDate() + (Math.max(1,weekNum)-1)*7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
  const fmt = (d) => d.toLocaleDateString('es-AR',{day:'numeric',month:'short'});
  return `${fmt(monday)} – ${fmt(sunday)}`;
}
window.getProgramWeekRangeLabel = getProgramWeekRangeLabel;

function sessionKey(w,s) { return `w${w}-${s}`; }
function getSD(w,s) {
  const k=sessionKey(w,s);
  if(!S.history[k]) S.history[k]={date:null,exercises:{},rpe:7.5,done:false};
  return S.history[k];
}
function getED(w,s,id) {
  const sd=getSD(w,s);
  if(!sd.exercises[id]) sd.exercises[id]={series:'',reps:'',pct:'',ms:'',load:'',rpe:'',checked:false};
  return sd.exercises[id];
}
// Resuelve qué le corresponde a un ejercicio en una semana puntual. Si el
// ejercicio tiene progresión semanal cargada (ex.progression), usa el valor
// de esa semana (repitiendo la última semana definida si la rutina dura más
// de lo que se cargó explícitamente). Si NO tiene progresión (todas las
// rutinas ya existentes), cae en los campos planos de siempre — así ninguna
// rutina vieja se rompe ni cambia de comportamiento.
function getExPrescriptionForWeek(ex, week) {
  // El tipo de intensidad (RPE/RIR) es UN SOLO interruptor para todo el
  // ejercicio (el botón está una sola vez, arriba de toda la tabla de
  // semanas) — nunca hay que leerlo de la copia por semana en
  // ex.progression, que puede quedar vieja si se tocó el botón después de
  // crear la progresión. ex.intensityType es siempre la fuente de verdad.
  if(ex.progression && ex.progression.length) {
    const idx = Math.min(week, ex.progression.length) - 1;
    const wk = ex.progression[idx] || {};
    return {
      series: wk.series||'', reps: wk.reps||'', pct: wk.pct||'',
      rpe: wk.rpe||'', intensityType: ex.intensityType||'RPE', note: wk.note||''
    };
  }
  return {
    series: ex.series||'', reps: ex.reps||'', pct: ex.pct||'',
    rpe: ex.rpe||'', intensityType: ex.intensityType||'RPE', note: ex.note||''
  };
}
window.getExPrescriptionForWeek = getExPrescriptionForWeek;

function weekLabel(w) {
  const base=new Date(S.startDate);
  base.setDate(base.getDate()+(w-1)*7);
  const end=new Date(base); end.setDate(end.getDate()+6);
  const f=d=>d.toLocaleDateString('es-AR',{day:'numeric',month:'short'});
  return `${f(base)} – ${f(end)}`;
}
function rpeDesc(v) {
  v=parseFloat(v);
  if(v<=6) return 'suave';
  if(v<=7) return 'moderado';
  if(v<=8.5) return 'moderado–alto';
  return 'alto';
}
function showToast(msg) {
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}
function countChecked(w) {
  let n=0;
  getSessionList().forEach(s=>{
    const sd=getSD(w,s);
    Object.values(sd.exercises).forEach(e=>{if(e.checked)n++;});
  });
  return n;
}

// ── ONBOARDING (perfil de atleta obligatorio) ──────────────────
function renderOnboarding() {
  const step = S.onboardingStep;
  const d = S.onboardingData;
  let html = `<div class="page-header">
    <div class="page-title">Completá tu perfil</div>
    <div class="page-subtitle">Paso ${step} de 4 · Necesario antes de usar la app</div>
  </div>`;

  html += `<div style="display:flex;gap:6px;margin-bottom:20px">
    ${[1,2,3,4].map(n=>`<div style="flex:1;height:4px;border-radius:2px;background:${n<=step?'var(--accent)':'var(--border2)'}"></div>`).join('')}
  </div>`;

  if (step===1) html += renderOnboardingStep1(d);
  else if (step===2) html += renderOnboardingStep2(d);
  else if (step===3) html += renderOnboardingStep3(d);
  else if (step===4) html += renderOnboardingStep4(d);

  return `<div style="max-width:520px;margin:0 auto">${html}</div>`;
}
window.renderOnboarding = renderOnboarding;

function renderOnboardingStep1(d) {
  return `<div class="wellness-card">
    <div class="wellness-title">Datos personales</div>
    <div class="wellness-sub">Completá tu información básica</div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="eval-lbl">Apellido</label><input class="auth-inp" style="margin:0" type="text" value="${d.lastName||''}" oninput="setOnboardingField('lastName',this.value)" onblur="this.value=capitalizeName(this.value);setOnboardingField('lastName',this.value)" placeholder="Ej: Pérez"></div>
        <div><label class="eval-lbl">Nombre</label><input class="auth-inp" style="margin:0" type="text" value="${d.firstName||''}" oninput="setOnboardingField('firstName',this.value)" onblur="this.value=capitalizeName(this.value);setOnboardingField('firstName',this.value)" placeholder="Ej: Juan"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        <div><label class="eval-lbl">Edad</label><input class="auth-inp" style="margin:0" type="number" min="1" value="${d.age}" oninput="setOnboardingField('age',this.value)" placeholder="años"></div>
        <div><label class="eval-lbl">Altura (cm)</label><input class="auth-inp" style="margin:0" type="number" min="1" value="${d.height}" oninput="setOnboardingField('height',this.value)" placeholder="cm"></div>
        <div><label class="eval-lbl">Peso (kg)</label><input class="auth-inp" style="margin:0" type="number" min="1" value="${d.weight}" oninput="setOnboardingField('weight',this.value)" placeholder="kg"></div>
      </div>
    </div>
    <div style="padding:0 16px 16px">
      <button class="wellness-submit" onclick="onboardingNext()">Continuar</button>
    </div>
  </div>`;
}

function renderOnboardingStep2(d) {
  let html = `<div class="wellness-card">
    <div class="wellness-title">¿Qué tipo de atleta sos?</div>
    <div class="wellness-sub">Esto define cómo se organizan tus datos</div>
    <div style="padding:16px;display:flex;gap:10px">
      <div onclick="selectAthleteType('individual')" style="flex:1;cursor:pointer;border:2px solid ${d.athleteType==='individual'?'var(--accent)':'var(--border2)'};border-radius:var(--r);padding:16px;text-align:center;background:${d.athleteType==='individual'?'var(--bg3)':'transparent'}">
        <div style="font-size:14px;font-weight:700">Atleta individual</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">No pertenezco a ningún equipo</div>
      </div>
      <div onclick="selectAthleteType('team')" style="flex:1;cursor:pointer;border:2px solid ${d.athleteType==='team'?'var(--accent)':'var(--border2)'};border-radius:var(--r);padding:16px;text-align:center;background:${d.athleteType==='team'?'var(--bg3)':'transparent'}">
        <div style="font-size:14px;font-weight:700">Atleta de equipo</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Formo parte de un equipo</div>
      </div>
    </div>`;

  if (d.athleteType === 'individual') {
    html += `<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:12px">
      <div><label class="eval-lbl">Deporte</label><input class="auth-inp" style="margin:0" type="text" value="${d.sport}" oninput="setOnboardingField('sport',this.value)" placeholder="Ej: Tenis, Básquet..."></div>
      <div><label class="eval-lbl">Posición</label><input class="auth-inp" style="margin:0" type="text" value="${d.position}" oninput="setOnboardingField('position',this.value)" placeholder="Ej: Base, Alero..."></div>
    </div>`;
  } else if (d.athleteType === 'team') {
    const instMap = getInstitutionsFromTeams();
    const instNames = Object.keys(instMap).sort();
    html += `<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:12px">
      <div><label class="eval-lbl">Equipo</label>
        <select class="auth-inp" style="margin:0" onchange="selectInstitution(this.value)">
          <option value="">Seleccionar...</option>
          ${instNames.map(inst=>`<option value="${inst}" ${d.institution===inst?'selected':''}>${inst}</option>`).join('')}
        </select>
      </div>
      ${!instNames.length?`<div style="font-size:12px;color:var(--text3)">Todavía no hay ningún equipo cargado — pedile a tu entrenador que cree uno primero.</div>`:''}
      ${d.institution ? `<div><label class="eval-lbl">Categoría</label>
        <select class="auth-inp" style="margin:0" onchange="onboardingCategoryChange(this.value)">
          <option value="">Seleccionar...</option>
          ${[...instMap[d.institution].categories].sort().map(c=>`<option value="${c}" ${d.category===c?'selected':''}>${c}</option>`).join('')}
          <option value="__nueva__" ${d.category==='__nueva__'?'selected':''}>+ Otra categoría</option>
        </select>
      </div>` : ''}
      ${d.category==='__nueva__' ? `<div><label class="eval-lbl">Nombre de la categoría</label>
        <input class="auth-inp" style="margin:0" type="text" value="${d.categoryCustom||''}" oninput="setOnboardingField('categoryCustom',this.value)" placeholder="Ej: Sub-19">
      </div>` : ''}
      ${d.institution ? (()=>{
        const sport = instMap[d.institution]?.sport||'';
        const posOpts = getPositionOptionsForSport(sport);
        return `<div><label class="eval-lbl">Posición</label>
          ${posOpts ? `<select class="auth-inp" style="margin:0" onchange="setOnboardingField('position',this.value)">
            <option value="">Seleccionar...</option>
            ${posOpts.map(p=>`<option value="${p}" ${d.position===p?'selected':''}>${p}</option>`).join('')}
          </select>` : `<input class="auth-inp" style="margin:0" type="text" value="${d.position||''}" oninput="setOnboardingField('position',this.value)" placeholder="Ej: Base, Alero...">`}
        </div>`;
      })() : ''}
    </div>`;
  }

  const teamCategoryOk = d.category && (d.category!=='__nueva__' || !!(d.categoryCustom||'').trim());
  const canContinue = d.athleteType==='individual' ? !!(d.sport && d.position) : d.athleteType==='team' ? !!(d.institution && teamCategoryOk && d.position) : false;
  html += `<div style="padding:0 16px 16px;display:flex;gap:10px">
    <button class="abtn abtn-d" style="flex:1" onclick="onboardingPrev()">← Atrás</button>
    <button class="wellness-submit" style="flex:2;${canContinue?'':'opacity:.4;pointer-events:none'}" onclick="onboardingNext()">Continuar</button>
  </div></div>`;
  return html;
}

function renderOnboardingStep3(d) {
  return `<div class="wellness-card">
    <div class="wellness-title">Lesiones o molestias</div>
    <div class="wellness-sub">Si tenés alguna lesión pasada o actual, marcala en el mapa (es opcional)</div>
    <div class="body-map-wrap">
      <div class="body-svg-wrap"><div class="body-svg-label">Frente</div>${renderBodySVG('front')}</div>
      <div class="body-svg-wrap"><div class="body-svg-label">Espalda</div>${renderBodySVG('back')}</div>
    </div>
    ${S.selectedZone ? renderZoneDetail() : ''}
    ${renderInjuryList()}
  </div>
  <div style="padding:16px 0;display:flex;gap:10px">
    <button class="abtn abtn-d" style="flex:1" onclick="onboardingPrev()">← Atrás</button>
    <button class="wellness-submit" style="flex:2" onclick="onboardingNext()">Continuar</button>
  </div>`;
}

function renderOnboardingStep4(d) {
  const typeLabel = d.athleteType==='individual' ? `Individual · ${d.sport} · ${d.position}` : `${d.institution} · ${d.category}`;
  const injCount = Object.keys(S.injuries).length;
  return `<div class="wellness-card">
    <div class="wellness-title">Confirmá tus datos</div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:10px;font-size:13px">
      <div><b>Nombre:</b> ${(d.lastName&&d.firstName) ? capitalizeName(d.lastName)+' '+capitalizeName(d.firstName) : '—'}</div>
      <div><b>Edad:</b> ${d.age||'—'} · <b>Altura:</b> ${d.height||'—'} cm · <b>Peso:</b> ${d.weight||'—'} kg</div>
      <div><b>Perfil:</b> ${typeLabel}</div>
      <div><b>Lesiones registradas:</b> ${injCount ? injCount : 'Ninguna'}</div>
    </div>
    <div id="onboarding-err" style="color:var(--red);font-size:12px;padding:0 16px 8px;text-align:center"></div>
    <div style="padding:0 16px 16px;display:flex;gap:10px">
      <button class="abtn abtn-d" style="flex:1" onclick="onboardingPrev()">← Atrás</button>
      <button class="wellness-submit" style="flex:2" id="onboarding-finish-btn" onclick="finishOnboarding()">Finalizar y entrar</button>
    </div>
  </div>`;
}

function setOnboardingField(key, val) { S.onboardingData[key] = val; }
window.setOnboardingField = setOnboardingField;

async function selectAthleteType(type) {
  S.onboardingData.athleteType = type;
  renderMain();
  if(type==='team') {
    // Recargamos los equipos justo en este momento (no solo al loguearse),
    // por si el admin acaba de crear o editar un equipo hace instantes.
    try {
      const tSnap = await getDocs(collection(db,'teams'));
      S.teams = tSnap.docs.map(d=>({id:d.id, ...d.data()}));
      renderMain();
    } catch(e) {}
  }
}
window.selectAthleteType = selectAthleteType;

function selectInstitution(inst) { S.onboardingData.institution = inst; S.onboardingData.category = ''; S.onboardingData.categoryCustom=''; renderMain(); }
function onboardingCategoryChange(val) {
  S.onboardingData.category = val;
  if(val!=='__nueva__') S.onboardingData.categoryCustom='';
  renderMain();
}
window.onboardingCategoryChange=onboardingCategoryChange;
window.selectInstitution = selectInstitution;

function onboardingNext() {
  const d = S.onboardingData;
  if (S.onboardingStep === 1 && (!d.lastName || !d.firstName || !d.age || !d.height || !d.weight)) {
    showToast('Completá todos los campos'); return;
  }
  if (S.onboardingStep === 2) {
    const ok = d.athleteType==='individual' ? (d.sport && d.position) : d.athleteType==='team' ? (d.institution && d.category) : false;
    if (!ok) { showToast('Completá los datos de tu perfil'); return; }
  }
  S.onboardingStep = Math.min(4, S.onboardingStep + 1);
  renderMain();
}
window.onboardingNext = onboardingNext;

function onboardingPrev() {
  S.onboardingStep = Math.max(1, S.onboardingStep - 1);
  renderMain();
}
window.onboardingPrev = onboardingPrev;

// Busca un equipo real ya creado para esta institución+categoría, o lo crea si es
// la primera vez que alguien se registra en esa combinación.
async function findOrCreateTeam(institution, category, sport) {
  const tSnap = await getDocs(collection(db, 'teams'));
  const allTeams = tSnap.docs.map(dd => ({ id: dd.id, ...dd.data() }));
  // Normalizado (sin mayúsculas, sin espacios de más, sin tildes) para no
  // duplicar un equipo por una diferencia de forma ("Liga De Honor " vs
  // "Liga de Honor") — antes era comparación exacta, y una sola letra
  // distinta creaba un equipo fantasma nuevo con los partidos importados,
  // mientras el equipo real (con los jugadores) se quedaba sin nada.
  const norm = s => (s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const institutionN = norm(institution), categoryN = norm(category);
  const existing = allTeams.find(t => norm(t.institution)===institutionN && norm(t.category)===categoryN)
    || allTeams.find(t => norm(t.name)===institutionN && norm(t.category)===categoryN);
  if (existing) {
    // Aprovechamos y le completamos el campo institution si le faltaba, para
    // que la próxima vez ya matchee directo por la vía correcta.
    if(!existing.institution) {
      try { await updateDoc(doc(db,'teams',existing.id), {institution}); } catch(e){}
    }
    return existing.id;
  }
  const id = genId();
  const team = {
    id, name: institution, sport: sport||'', category, institution,
    players: [], memberUids: [], trainingDays: [], calendar: {}, color: '',
    createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'teams', id), team);
  return id;
}

// ── IMPORTACIÓN DE FIXTURE — Estudiantes de La Plata (Femebal, Clausura 2026) ──
// Partidos que quedan del Torneo Metropolitano Clausura, sacados de los PDFs
// oficiales de la liga (Mayores/LHC → Liga de Honor; Infantiles-A-Masculino →
// Cadetes, Juveniles y Juniors por igual, según lo confirmó el prep). Se puede
// correr más de una vez sin duplicar: si esa fecha ya tiene un partido contra
// el mismo rival, se salta.
const ESTUDIANTES_FIXTURES_LHC = [
  {date:'2026-08-08', opponent:'S.A.G. Polvorines', homeAway:'local'},
  {date:'2026-08-15', opponent:'Nuestra Señora de Luján', homeAway:'visitante'},
  {date:'2026-08-22', opponent:'A.A.C.F. Quilmes', homeAway:'local'},
  {date:'2026-08-29', opponent:'Municipalidad de Vicente López', homeAway:'visitante'},
  {date:'2026-09-05', opponent:'Colegio Ward', homeAway:'local'},
  {date:'2026-09-12', opponent:'S.A.G. Villa Ballester', homeAway:'visitante'},
  {date:'2026-09-19', opponent:'A.A. Argentinos Juniors', homeAway:'local'},
  {date:'2026-09-26', opponent:'Ferro Carril Oeste', homeAway:'visitante'},
  {date:'2026-10-03', opponent:'C.A. Vélez Sarsfield', homeAway:'local'},
  {date:'2026-10-17', opponent:'Club Ferrocarril Mitre', homeAway:'visitante'},
  {date:'2026-10-24', opponent:'San Fernando Handball', homeAway:'local'},
  {date:'2026-10-31', opponent:'C.A. River Plate', homeAway:'visitante'},
  {date:'2026-11-07', opponent:'Dorrego Handball', homeAway:'local'},
  {date:'2026-11-14', opponent:'S.A.G.A.B.', homeAway:'local'},
  {date:'2026-11-21', opponent:'S.E.D.A.L.O.', homeAway:'visitante'},
];
const ESTUDIANTES_FIXTURES_INFANTILES = [
  {date:'2026-08-08', opponent:'C.A. Lanús', homeAway:'local'},
  {date:'2026-08-15', opponent:'Nuestra Señora de Luján', homeAway:'visitante'},
  {date:'2026-08-22', opponent:'A.A.C.F. Quilmes', homeAway:'local'},
  {date:'2026-08-29', opponent:'Municipalidad de Vicente López', homeAway:'visitante'},
  {date:'2026-09-05', opponent:'Colegio Ward', homeAway:'local'},
  {date:'2026-09-12', opponent:'S.A.G. Villa Ballester', homeAway:'visitante'},
  {date:'2026-09-19', opponent:'A.A. Argentinos Juniors', homeAway:'local'},
  {date:'2026-09-26', opponent:'Ferro Carril Oeste', homeAway:'visitante'},
  {date:'2026-10-03', opponent:'C.A. Vélez Sarsfield', homeAway:'local'},
  {date:'2026-10-17', opponent:'Campana Boat Club', homeAway:'visitante'},
  {date:'2026-10-24', opponent:'San Fernando Handball', homeAway:'local'},
  {date:'2026-10-31', opponent:'C.A. River Plate', homeAway:'visitante'},
  {date:'2026-11-07', opponent:'Dorrego Handball', homeAway:'local'},
  {date:'2026-11-14', opponent:'S.A.G.A.B.', homeAway:'local'},
  {date:'2026-11-21', opponent:'S.E.D.A.L.O.', homeAway:'visitante'},
];

async function importEstudiantesFixtures() {
  if(!confirm('Esto agrega los partidos que quedan del Torneo Metropolitano Clausura al calendario de Liga de Honor, Cadetes, Juveniles y Juniors de Handball-EDLP. ¿Confirmás?')) return;
  showToast('Importando fixture…');
  try {
    const targets = [
      {category:'Liga de Honor', fixtures:ESTUDIANTES_FIXTURES_LHC},
      {category:'Cadetes', fixtures:ESTUDIANTES_FIXTURES_INFANTILES},
      {category:'Juveniles', fixtures:ESTUDIANTES_FIXTURES_INFANTILES},
      {category:'Juniors', fixtures:ESTUDIANTES_FIXTURES_INFANTILES},
    ];
    let addedTotal = 0;
    const emptyTeams = [];
    for(const {category, fixtures} of targets) {
      const teamId = await findOrCreateTeam('Handball-EDLP', category, 'Handball');
      let team = S.teams.find(t=>t.id===teamId);
      if(!team) {
        const snap = await getDoc(doc(db,'teams',teamId));
        team = {id:teamId, ...snap.data()};
        S.teams.push(team);
      }
      // Chequeo de seguridad: si el equipo que encontró/creó para esta
      // categoría no tiene NINGÚN jugador, es casi seguro que no es el
      // equipo real (el que ya tiene el plantel armado) — probablemente se
      // creó uno nuevo por no encontrar el existente. Avisamos ANTES de que
      // el admin se entere recién al refrescar y no ver nada.
      if(!(team.players?.length) && !(team.memberUids?.length)) emptyTeams.push(category);
      if(!team.calendar) team.calendar={};
      for(const fx of fixtures) {
        const existing = getCalendarEvents(team, fx.date);
        if(existing.some(e=>e.type==='partido' && e.opponent===fx.opponent)) continue;
        const updated = [...existing, {type:'partido', opponent:fx.opponent, homeAway:fx.homeAway}];
        team.calendar[fx.date] = updated;
        await updateDocSafe(doc(db,'teams',teamId), {[`calendar.${fx.date}`]: updated});
        addedTotal++;
      }
    }
    showToast(`✓ Fixture importado — ${addedTotal} partidos agregados`);
    if(emptyTeams.length) {
      alert(`OJO: el equipo de ${emptyTeams.join(', ')} al que se le acaban de agregar los partidos NO TIENE JUGADORES cargados. Probablemente no sea el equipo real (puede haberse creado uno nuevo por no encontrar el existente) — revisá en "Equipos" que los partidos aparezcan en el plantel correcto antes de confiar en esto.`);
    }
    renderMain();
  } catch(e) { console.error(e); showToast('Error al importar: '+e.message); }
}
window.importEstudiantesFixtures = importEstudiantesFixtures;

// ── REPARAR VÍNCULOS DE EQUIPO ────────────────────────────────────────
// Corrige atletas que tienen teamId cargado (se registraron bien) pero cuyo
// uid no está en team.memberUids — el síntoma es que no aparecen en
// "Evaluaciones" ni en ninguna pantalla scopeada al equipo, aunque sí
// aparecen en su ficha individual. Causa: una condición de carrera al
// registrarse (ver comentario en finishOnboarding) ya corregida, pero no
// deshace el daño en cuentas que se registraron ANTES del arreglo.
async function repairTeamMemberLinks() {
  if(!confirm('Esto revisa todos los atletas registrados y vuelve a vincular al equipo a los que quedaron afuera por un bug ya corregido (no aparecían en Evaluaciones del equipo aunque estén registrados). ¿Confirmás?')) return;
  showToast('Revisando vínculos…');
  try {
    await ensureAdminAthletes();
    const tSnap = await getDocs(collection(db,'teams'));
    const teams = tSnap.docs.map(d=>({id:d.id, ...d.data()}));
    let fixed = 0;
    for(const a of S.adminAthletes) {
      if(!a.teamId) continue;
      const team = teams.find(t=>t.id===a.teamId);
      if(!team) continue;
      if((team.memberUids||[]).includes(a.uid)) continue;
      await updateDoc(doc(db,'teams',a.teamId), {memberUids:arrayUnion(a.uid)});
      fixed++;
    }
    const freshSnap = await getDocs(collection(db,'teams'));
    S.teams = freshSnap.docs.map(d=>({id:d.id, ...d.data()}));
    showToast(`✓ ${fixed} atleta${fixed!==1?'s':''} reparado${fixed!==1?'s':''}`);
    renderMain();
  } catch(e) { console.error(e); showToast('Error al reparar: '+e.message); }
}
window.repairTeamMemberLinks = repairTeamMemberLinks;

// ── COMPLETAR CALENDARIO SEMANAL — Handball-EDLP, Clausura 2026 ──────────
// Lunes/Martes/Jueves = Físico + Pelota el mismo día (el modelo de datos ya
// soporta varios eventos por fecha), desde hoy hasta fin de temporada. No
// pisa nada que ya esté cargado (ni partidos, ni si el prep ya tocó ese día
// a mano) — si ese tipo de evento ya existe esa fecha, se salta.
const WEEKLY_TRAINING_END_DATE = '2026-11-30';
async function fillWeeklyTrainingCalendar() {
  if(!confirm('Esto agrega entrenamiento de Físico y Pelota todos los lunes, martes y jueves desde hoy hasta el 30/11, en Liga de Honor, Cadetes, Juveniles y Juniors de Handball-EDLP. No duplica ni pisa lo que ya esté cargado. ¿Confirmás?')) return;
  showToast('Completando calendario…');
  try {
    const categories = ['Liga de Honor','Cadetes','Juveniles','Juniors'];
    const today = new Date(); today.setHours(0,0,0,0);
    const endDate = new Date(WEEKLY_TRAINING_END_DATE+'T00:00:00');
    let addedTotal = 0;
    for(const category of categories) {
      const teamId = await findOrCreateTeam('Handball-EDLP', category, 'Handball');
      let team = S.teams.find(t=>t.id===teamId);
      if(!team) {
        const snap = await getDoc(doc(db,'teams',teamId));
        team = {id:teamId, ...snap.data()};
        S.teams.push(team);
      }
      if(!team.calendar) team.calendar={};
      const d = new Date(today);
      while(d<=endDate) {
        const dow = d.getDay(); // 1=lunes, 2=martes, 4=jueves
        if(dow===1||dow===2||dow===4) {
          const dateStr = toLocalDateStr(d);
          const existing = getCalendarEvents(team, dateStr);
          const existingTypes = existing.map(e=>e.type);
          const toAdd = ['fisico','pelota'].filter(t=>!existingTypes.includes(t)).map(type=>({type}));
          if(toAdd.length) {
            const updated = [...existing, ...toAdd];
            team.calendar[dateStr] = updated;
            await updateDocSafe(doc(db,'teams',teamId), {[`calendar.${dateStr}`]: updated});
            addedTotal += toAdd.length;
          }
        }
        d.setDate(d.getDate()+1);
      }
    }
    showToast(`✓ Calendario completado — ${addedTotal} entrenamientos agregados`);
    renderMain();
  } catch(e) { console.error(e); showToast('Error al completar calendario: '+e.message); }
}
window.fillWeeklyTrainingCalendar = fillWeeklyTrainingCalendar;

async function finishOnboarding() {
  const d = S.onboardingData;
  const btn = document.getElementById('onboarding-finish-btn');
  const errEl = document.getElementById('onboarding-err');
  if (errEl) errEl.textContent = '';
  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }
  try {
    const finalName = (d.lastName&&d.firstName) ? capitalizeName(d.lastName)+' '+capitalizeName(d.firstName) : (d.fullName||S.userData.name);
    const update = {
      name: finalName,
      age: Number(d.age) || null,
      height: Number(d.height) || null,
      weight: Number(d.weight) || null,
      athleteType: d.athleteType,
      onboardingComplete: true
    };
    if (d.athleteType === 'individual') {
      update.sport = d.sport;
      update.position = d.position;
      update.institution = null; update.category = null; update.teamId = null;
    } else {
      const finalCategory = d.category==='__nueva__' ? (d.categoryCustom||'').trim() : d.category;
      const instMap = getInstitutionsFromTeams();
      const sport = instMap[d.institution]?.sport || '';
      update.institution = d.institution;
      update.category = finalCategory;
      update.sport = sport;
      update.position = d.position || null;
      const teamId = await findOrCreateTeam(d.institution, finalCategory, sport);
      update.teamId = teamId;
      // Vincular esta cuenta real (uid) al roster del equipo, sin romper
      // el campo `players` (nombres) que ya usa el editor de días de equipo.
      // memberUids se agrega con arrayUnion (atómico en el servidor) — antes
      // era leer el array, agregar el uid a mano y reescribirlo entero, lo
      // cual perdía jugadores cuando dos se registraban casi a la vez: el
      // segundo pisaba el array leído ANTES de que el primero terminara de
      // guardar. players sigue con lectura previa porque necesita comparar
      // nombres (namesLikelyMatch) para no duplicar, algo que arrayUnion no
      // puede hacer solo — pero eso no es lo que causaba el bug reportado.
      const tRef = doc(db, 'teams', teamId);
      await updateDoc(tRef, { memberUids: arrayUnion(S.user.uid) });
      const tSnap = await getDoc(tRef);
      const players = tSnap.exists() ? (tSnap.data().players || []) : [];
      if (!players.some(p=>namesLikelyMatch(p,update.name))) {
        await updateDoc(tRef, { players: [...players, update.name] });
      }

      // Si el admin ya había cargado a este jugador de antemano (mismo
      // nombre, mismo equipo) con tests/evaluaciones, los migramos ahora a
      // la cuenta real recién creada, y borramos el registro pendiente.
      // IMPORTANTE: usa namesLikelyMatch (ignora orden de palabras) — antes
      // usaba una comparación estricta que fallaba si alguien se registraba
      // como "Joaquín Flores" cuando el admin lo había cargado como
      // "Flores Joaquín".
      try {
        const pendSnap = await getDocs(query(collection(db,'pendingAthletes'), where('teamId','==',teamId)));
        const match = pendSnap.docs.map(dd=>({id:dd.id, ...dd.data()})).find(p=>namesLikelyMatch(p.name,update.name));
        if (match) {
          if (match.evals && Object.keys(match.evals).length) {
            await setDoc(doc(db,'personal',S.user.uid), {evals:match.evals}, {merge:true});
          }
          await deleteDoc(doc(db,'pendingAthletes',match.id));
        }
      } catch(e) { /* no bloqueamos el registro si esto falla */ }
    }
    await setDoc(doc(db, 'users', S.user.uid), update, { merge: true });
    // Por si durante el paso de lesiones se marcó algo en el mapa corporal,
    // lo persistimos ya (vive en la colección /personal, no en /users).
    await saveToFirestore();
    S.userData = { ...S.userData, ...update };
    showToast('✓ Perfil completado');
    S.currentView = 'dashboard';
    renderBottomBar();
    renderAll();
  } catch (e) {
    if (errEl) errEl.textContent = 'Error al guardar: ' + (e.message || e);
    if (btn) { btn.textContent = 'Finalizar y entrar'; btn.style.pointerEvents = ''; }
  }
}
window.finishOnboarding = finishOnboarding;

// ── VIEWS ─────────────────────────────────────────────────────
function switchView(v) {
  // Mientras el perfil de atleta esté incompleto, no se puede navegar a otro lado
  if (!S.isAdmin && S.userData && !S.userData.onboardingComplete) {
    S.currentView = 'onboarding';
    renderAll();
    return;
  }
  if (v!=='wellness') S.wellnessViewDate=null; // siempre vuelve a "hoy" al reingresar
  if (v==='session') { S.rmCalcTabActive=false; S._routineViewWeek=null; } // Mi Rutina siempre entra por hoy, día y semana reales — nunca donde había quedado repasando
  S.currentView=v;
  renderBottomBar();
  renderAll();
}
window.switchView = switchView;

function goHome() {
  // Reset all sub-views, go to session
  S.adminView='main';
  S.teamView=null;
  S.teamDayEdit=null;
  S.teamDayIdx=0;
  S._routineEditorPrev=null;
  S.editingRoutine=null;
  S.viewingAthlete=null;
  switchView('dashboard');
}
window.goHome=goHome;

// navTo: unified navigation — always keeps UI consistent
function navTo(viewOrFn) {
  if(typeof viewOrFn === 'string') {
    S.currentView = viewOrFn;
  }
  renderBottomBar();
  renderSubnav();
  renderMain();
}
window.navTo=navTo;


function renderBottomBar() {
  // Mientras el atleta no completó su perfil, no mostramos ninguna navegación
  if (!S.isAdmin && S.userData && !S.userData.onboardingComplete) {
    const bbEmpty = document.getElementById('bottombar');
    const snEmpty = document.getElementById('sidebar-nav');
    if (bbEmpty) bbEmpty.innerHTML = '';
    if (snEmpty) snEmpty.innerHTML = '';
    return;
  }
  const isDesktop = window.innerWidth >= 900;
  const tabs = S.isAdmin ? [
    {id:'dashboard',label:'Dashboard',   section:null, svg:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'},
    {id:'teams',    label:'Equipos',     section:null, svg:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'},
    {id:'atletas',  label:'Atletas',     section:null, svg:'<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'},
    {id:'admin',    label:'Panel Admin', section:null, svg:'<circle cx="12" cy="8" r="4"/><path d="M17 21v-2a4 4 0 0 0-4-4h-2a4 4 0 0 0-4 4v2"/><path d="M22 21v-1a3 3 0 0 0-2-2.83"/>'},
  ] : [
    {id:'dashboard',label:'Inicio',      section:null, svg:'<path d="M3 9l9-7 9 7"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>'},
    {id:'session',  label:'Mi Rutina',   section:null, svg:'<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>'},
    // Solo para atleta de equipo — el individual no tiene calendario de
    // equipo que mirar (ver renderMain, case 'calendar').
    ...(isTeamAthlete() ? [{id:'calendar', label:'Calendario', section:null, svg:'<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><circle cx="8" cy="15" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>'}] : []),
    {id:'wellness', label:'Wellness',    section:null, svg:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'},
    {id:'evals',    label:'Mis Tests',   section:null, svg:'<path d="M6 3v4l-3 8a3 3 0 0 0 3 4h12a3 3 0 0 0 3-4l-3-8V3"/><line x1="6" y1="3" x2="18" y2="3"/><line x1="8" y1="12" x2="16" y2="12"/>'},
    {id:'stats',    label:'Stats',       section:null, svg:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'},
  ];

  // Mobile bottom bar
  const bb = document.getElementById('bottombar');
  if(bb) {
    bb.innerHTML = tabs.map(t=>`
      <button class="bb-btn ${S.currentView===t.id?'active':''}" id="bb-${t.id}" onclick="switchView('${t.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${t.svg}</svg>
        ${t.label}
      </button>`).join('');
  }

  // Desktop sidebar nav
  const sn = document.getElementById('sidebar-nav');
  if(sn) {
    let navHtml = '';
    let lastSection = null;
    tabs.forEach(t=>{
      if(t.section && t.section!==lastSection) {
        navHtml += `<div class="sidebar-section">${t.section}</div>`;
        lastSection = t.section;
      }
      navHtml += `<button class="sidebar-item ${S.currentView===t.id?'active':''}" onclick="switchView('${t.id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${t.svg}</svg>
        ${t.label}
      </button>`;
    });
    sn.innerHTML = navHtml;
  }

  // Desktop week widget
  const dw = document.getElementById('desktop-week');
  const dwr = document.getElementById('desktop-week-range');
  const sf = document.getElementById('sidebar-footer');
  if(dw) dw.style.display = isDesktop ? 'flex' : 'none';
  if(dwr) dwr.textContent = getWeekHeaderLabel();
  if(sf) sf.style.display = isDesktop ? 'block' : 'none';

  // Sync desktop user info
  const nd = document.getElementById('pm-name-desk');
  const rd = document.getElementById('pm-role-desk');
  if(nd) nd.textContent = S.userData?.name || '—';
  if(rd) rd.textContent = S.isAdmin ? 'Administrador' : 'Atleta';
}
window.renderBottomBar=renderBottomBar;

window.addEventListener('resize', ()=>{ renderBottomBar(); });

// Ver refreshTodaysTrainingContext(): sin esto, una PWA que queda "abierta"
// en segundo plano (celular bloqueado, cambiás de app y volvés) nunca se
// entera de que cruzó la medianoche o arrancó una semana nueva hasta que se
// recarga de cero. Solo actuamos si el DÍA realmente cambió — no en cada
// cambio de pestaña dentro del mismo día — para no pisar algo que el atleta
// estuviera completando a mitad de camino.
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  if(!S.user || !S.userData) return;
  const today = todayLocal();
  if(S._lastKnownDay === undefined || S._lastKnownDay === null) { S._lastKnownDay = today; return; }
  if(today === S._lastKnownDay) return;
  S._lastKnownDay = today;
  refreshTodaysTrainingContext();
  renderAll();
});

function renderAll() { renderSubnav(); renderMain(); }

function renderSubnav() {
  const nav=document.getElementById('subnav');
  // Esto es lo que se ve arriba de todo en el celular — el atleta individual
  // veía acá "Sem 1" pelado (sin fecha); ahora usa el mismo texto unificado
  // "Semana actual · [fechas]" que ya tiene el resto de la app.
  const wp=document.getElementById('week-pill'); if(wp) wp.textContent = S.isAdmin ? getCurrentWeekRangeLabel() : getWeekHeaderLabel();
  const dwr=document.getElementById('desktop-week-range'); if(dwr) dwr.textContent = getWeekHeaderLabel();
  if(S.currentView!=='session') { nav.innerHTML=''; return; }
  // Sessions: for admin use A/B/C/D; for athlete with routine use routine session names
  const sessions = getSessionList();
  let tabsHtml = sessions.map(s=>{
    const sd=getSD(getRoutineWeek(),s);
    const done=sd.done;
    const active=!S.rmCalcTabActive && S.currentSession===s;
    return `<button class="snav-tab ${active?'active':''} ${done&&!active?'done':''}"
      onclick="selectSession('${s}')">${done&&!active?'✓ ':''}${s}</button>`;
  }).join('');
  // La calculadora de %RM es una solapa más acá adentro, al final de los
  // días — no algo que se abre primero ni un "día" más de la rutina.
  if(!S.isAdmin) {
    tabsHtml += `<button class="snav-tab ${S.rmCalcTabActive?'active':''}" onclick="openRMCalcTab()">🧮 Calculadora</button>`;
  }
  nav.innerHTML = tabsHtml;
}

function getSessionList() {
  if (S.isAdmin) return ['A','B','C','D'];
  if (S.assignedRoutine && S.currentRoutineSessions.length) return S.currentRoutineSessions;
  return ['A','B','C','D'];
}
window.getSessionList=getSessionList;

function getCurrentBlocks() {
  if (S.isAdmin) return S.blocks;
  // Athletes ONLY see what was assigned by admin — never DEFAULT_BLOCKS
  if (S.assignedRoutine) {
    return getVisibleRoutineBlocks(S.assignedRoutine, S.currentSession, S.userData?.teamId, S.userData?.position, S.personalExtras);
  }
  return []; // No assigned routine = empty, not default
}
window.getCurrentBlocks=getCurrentBlocks;

function selectSession(s) {
  S.currentSession=s; S.rmCalcTabActive=false; renderAll();
}
window.selectSession = selectSession;

function openRMCalcTab() {
  S.rmCalcTabActive = true;
  renderAll();
}
window.openRMCalcTab = openRMCalcTab;

function renderMain() {
  const m=document.getElementById('main');
  switch(S.currentView) {
    case 'dashboard': m.innerHTML=renderDashboard(); setTimeout(loadDashboard,50); break;
    case 'session':  m.innerHTML=renderSession(); break;
    case 'calendar': m.innerHTML=renderPlayerCalendar(); break;
    case 'progress': m.innerHTML=renderProgress(); break;
    case 'wellness': m.innerHTML=renderWellness(); setTimeout(()=>runCountUps(),30); break;
    case 'stats':    m.innerHTML=renderStats(); break;
    case 'teams':    m.innerHTML=renderTeams();
      if(S.teamView && S.teamSubview==='stats') { const uids=getTeamStatsMemberUids(S.teamView); const mem=(S.adminAthletes||[]).filter(a=>uids.includes(a.uid)); setTimeout(()=>{drawTeamInjuryChart(mem);drawTeamRadarChart(mem);drawTeamQuadrantChart(mem);},80); }
      if(S.teamView && S.teamSubview==='reporte' && (S.teamReportSubview||'resumen')==='resumen') { const uids=getTeamStatsMemberUids(S.teamView); const mem=(S.adminAthletes||[]).filter(a=>uids.includes(a.uid)); setTimeout(()=>{drawTeamReportTrendChart(mem);drawTeamQuadrantChart(mem,'report-quadrant-chart','reportQuadrantChartInstance','cmj','ice');},80); }
      if(S.teamView && S.teamSubview==='reporte' && S.teamReportSubview==='medico') { const uids=getTeamStatsMemberUids(S.teamView); const mem=(S.adminAthletes||[]).filter(a=>uids.includes(a.uid)); setTimeout(()=>drawMedicalReportCharts(mem),80); }
      break;
    case 'atletas':  m.innerHTML=renderAtletas(); setTimeout(drawAtletaTabCharts,80); break;
    case 'settings': m.innerHTML=renderSettings(); break;
    case 'notifications': m.innerHTML=renderNotifications(); break;
    case 'admin':    m.innerHTML=renderAdmin(); if(S.adminView==='athlete_detail') setTimeout(drawAtletaTabCharts,80); if(S.adminView==='compare_athletes') setTimeout(drawCompareCharts,80); setTimeout(()=>runCountUps(),30); break;
    case 'weekly_report': m.innerHTML=renderWeeklyReport(); break;
    case 'library':  m.innerHTML=renderLibraryView(); break;
    case 'evals':    m.innerHTML=renderEvals(); setTimeout(drawEvalCharts,80); break;
    case 'onboarding': m.innerHTML=renderOnboarding(); break;
    default:         m.innerHTML='';
  }
  // re-draw charts if needed
  if(S.currentView==='evals') setTimeout(drawEvalCharts,50);
  updateRestTimerFabVisibility();
}


// ── EXERCISE SUMMARY FORMAT ────────────────────
function formatExSummary(ex) {
  const parts = [];
  // Volume: "3x8" or "3x" or "8"
  if(ex.series && ex.reps) parts.push(`${ex.series}x${ex.reps}`);
  else if(ex.series) parts.push(`${ex.series}x`);
  else if(ex.reps) parts.push(ex.reps);
  // Intensity: %RM or RPE/RIR
  if(ex.pct) parts.push(`${ex.pct}%RM`);
  else if(ex.rpe) {
    const type = ex.intensityType || 'RPE';
    parts.push(`${type} ${ex.rpe}`);
  }
  if(ex.note) parts.push(`(${ex.note})`);
  return parts.join(' // ');
}
window.formatExSummary=formatExSummary;

// ── SESSION ───────────────────────────────────────────────────
// ── CALCULADORA DE %RM — "Mi Rutina" ────────────────────────────────────
// Vive siempre en la vista de rutina del jugador, tenga o no rutina asignada
// (de equipo, individual, o ninguna todavía) — para consultar rápido con qué
// peso trabajar en cada %, sin hacer la cuenta a mano. Elegida entre 4
// prototipos mostrados al prep: un ejercicio a la vez con pestañas arriba,
// tabla en orden descendente 100%→45% (se entrena de más pesado a más
// liviano, no al revés).
const RM_CALC_LIFTS = [
  { liftId:'press_plano', short:'Press Plano', hasVelocity:true,
    velTable:[[45,1.04],[50,0.95],[55,0.87],[60,0.78],[65,0.70],[70,0.62],[75,0.55],[80,0.47],[85,0.39],[90,0.32],[95,0.25],[100,0.18]] },
  { liftId:'sentadilla_barra', short:'Sentadilla', hasVelocity:true,
    velTable:[[45,1.21],[50,1.14],[55,1.07],[60,1.00],[65,0.92],[70,0.84],[75,0.76],[80,0.68],[85,0.59],[90,0.51],[95,0.42],[100,0.32]] },
  { liftId:'peso_muerto', short:'Peso Muerto', hasVelocity:true,
    velTable:[[45,0.94],[50,0.87],[55,0.81],[60,0.75],[65,0.69],[70,0.62],[75,0.56],[80,0.50],[85,0.44],[90,0.37],[95,0.31],[100,0.25]] },
  { liftId:'cargada_potencia', short:'Cargada de Potencia', hasVelocity:false, velTable:null },
];
window.RM_CALC_LIFTS = RM_CALC_LIFTS;

const RM_CALC_PCTS = [100,95,90,85,80,75,70,65,60,55,50,45];
function rmCalcRepHint(pct) {
  if(pct>=100) return '1';
  if(pct>=95) return '2';
  if(pct>=90) return '2-4';
  if(pct>=85) return 'hasta 6';
  if(pct>=80) return '7-8';
  if(pct>=75) return '9-12';
  if(pct>=70) return '13-15';
  if(pct>=65) return '16-18';
  if(pct>=60) return '19-20';
  return '20+';
}

function rmCalcEpley(weight, reps) {
  if(!weight || !reps) return null;
  return weight * (1 + reps/30);
}
// Interpola sobre la tabla de velocidad (a mayor %RM, menor velocidad) para
// encontrar el %RM correspondiente a la velocidad medida, y de ahí el 1RM —
// misma tabla que ya se usa en la planilla de velocidad de ejecución.
function rmCalcFromVelocity(lift, kg, v) {
  if(!lift.velTable || !kg || !v) return null;
  const t = lift.velTable;
  if(v >= t[0][1]) return kg/(t[0][0]/100);
  if(v <= t[t.length-1][1]) return kg/(t[t.length-1][0]/100);
  for(let i=0;i<t.length-1;i++){
    const [p1,v1]=t[i], [p2,v2]=t[i+1];
    if(v<=v1 && v>=v2){
      const frac=(v1-v)/(v1-v2);
      return kg/((p1+frac*(p2-p1))/100);
    }
  }
  return null;
}

function getRMCalcState(liftId) {
  if(!S._rmCalc) S._rmCalc = {};
  if(!S._rmCalc[liftId]) {
    S._rmCalc[liftId] = { mode: S.oneRM?.[liftId] ? 'loaded' : 'epley', epleyWeight:null, epleyReps:null, velKg:null, velV:null };
  }
  return S._rmCalc[liftId];
}
function rmCalcActiveLift() {
  return (S._rmCalcActiveLift && RM_CALC_LIFTS.find(l=>l.liftId===S._rmCalcActiveLift)) ? S._rmCalcActiveLift : RM_CALC_LIFTS[0].liftId;
}
function setRMCalcActiveLift(liftId) { S._rmCalcActiveLift = liftId; renderMain(); }
window.setRMCalcActiveLift = setRMCalcActiveLift;
function setRMCalcMode(liftId, mode) { getRMCalcState(liftId).mode = mode; renderMain(); }
window.setRMCalcMode = setRMCalcMode;
function setRMCalcField(liftId, field, value) {
  getRMCalcState(liftId)[field] = value===''||value===null ? null : parseDecimal(value);
  renderMain();
}
window.setRMCalcField = setRMCalcField;

function currentRMCalcValue(lift) {
  const s = getRMCalcState(lift.liftId);
  if(s.mode==='epley') return rmCalcEpley(s.epleyWeight, s.epleyReps);
  if(s.mode==='velocity') return rmCalcFromVelocity(lift, s.velKg, s.velV);
  return S.oneRM?.[lift.liftId] || null;
}

function rmCalcInputsHtml(lift, s) {
  if(s.mode==='loaded') {
    const rmVal = S.oneRM?.[lift.liftId];
    if(rmVal) return `<div style="font-size:12px;color:var(--text3)">Tu 1RM cargado: <b style="color:var(--text2)">${rmVal} kg</b></div>`;
    return `<div style="font-size:12px;color:var(--amber)">Todavía no tenés un RM cargado para ${lift.short} — cargalo en Ajustes, o estimalo con Repeticiones o Velocidad.</div>`;
  }
  const fld = (label,f,val,placeholder,step) => `<div style="flex:1">
      <label style="display:block;font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px">${label}</label>
      <input class="field-inp" style="width:100%" type="number" inputmode="decimal" ${step?`step="${step}"`:''} value="${val??''}" placeholder="${placeholder}" onchange="setRMCalcField('${lift.liftId}','${f}',this.value)">
    </div>`;
  if(s.mode==='epley') {
    return `<div style="display:flex;gap:8px">${fld('Peso (kg)','epleyWeight',s.epleyWeight,'ej. 60')}${fld('Repeticiones','epleyReps',s.epleyReps,'ej. 6')}</div>
    <div style="font-size:11px;color:var(--text3);margin-top:6px">Hacé una serie cerca del fallo (1 a 10 reps) y cargá cuánto pesaste y cuántas hiciste.</div>`;
  }
  return `<div style="display:flex;gap:8px">${fld('Peso (kg)','velKg',s.velKg,'ej. 80')}${fld('Velocidad (m/s)','velV',s.velV,'ej. 0.39','0.01')}</div>
  <div style="font-size:11px;color:var(--text3);margin-top:6px">Cargá el peso movido y la velocidad de ejecución de esa serie.</div>`;
}

function rmCalcTableHtml(rm) {
  if(rm==null) return `<div style="font-size:12px;color:var(--text3);padding:8px 0">Completá los datos de arriba para ver la tabla.</div>`;
  const rows = RM_CALC_PCTS.map(p=>({ pct:p, kg: Math.round(rm*p/100*10)/10 }));
  return `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums">
    <thead><tr>
      <th style="text-align:left;font-size:9.5px;text-transform:uppercase;color:var(--text3);font-weight:700;border-bottom:1px solid var(--border2);padding-bottom:6px">%RM</th>
      <th style="text-align:right;font-size:9.5px;text-transform:uppercase;color:var(--text3);font-weight:700;border-bottom:1px solid var(--border2);padding-bottom:6px">Kg</th>
      <th style="text-align:right;font-size:9.5px;text-transform:uppercase;color:var(--text3);font-weight:700;border-bottom:1px solid var(--border2);padding-bottom:6px">Reps aprox.</th>
    </tr></thead>
    <tbody>
      ${rows.map(r=>{
        const zoneColor = r.pct>=85?'var(--red)':r.pct>=65?'var(--amber)':'var(--green)';
        const zoneDim = r.pct>=85?'var(--red-dim)':r.pct>=65?'var(--amber-dim)':'var(--green-dim)';
        return `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:7px 0"><span style="display:inline-block;min-width:34px;padding:2px 6px;border-radius:5px;font-size:11px;font-weight:700;color:${zoneColor};background:${zoneDim}">${r.pct}%</span></td>
          <td style="text-align:right;font-weight:700;font-size:13px;padding:7px 0">${r.kg}</td>
          <td style="text-align:right;font-size:11px;color:var(--text3);padding:7px 0">${rmCalcRepHint(r.pct)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

function renderRMCalcSection(standalone) {
  const key = 'rm-calc';
  const collapsed = standalone ? false : !!S.collapsedSections?.has(key);
  const activeId = rmCalcActiveLift();
  const lift = RM_CALC_LIFTS.find(l=>l.liftId===activeId);
  const s = getRMCalcState(lift.liftId);
  const rm = currentRMCalcValue(lift);

  const body = collapsed ? '' : `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
      ${RM_CALC_LIFTS.map(l=>`<button class="snav-tab ${l.liftId===activeId?'active':''}" onclick="setRMCalcActiveLift('${l.liftId}')">${l.short}</button>`).join('')}
    </div>
    <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
      <button class="lib-filter ${s.mode==='loaded'?'active':''}" onclick="setRMCalcMode('${lift.liftId}','loaded')">Mi RM cargado</button>
      <button class="lib-filter ${s.mode==='epley'?'active':''}" onclick="setRMCalcMode('${lift.liftId}','epley')">Repeticiones</button>
      <button class="lib-filter ${s.mode==='velocity'?'active':''}" ${!lift.hasVelocity?'disabled style="opacity:.4;cursor:not-allowed"':''} onclick="setRMCalcMode('${lift.liftId}','velocity')">Velocidad</button>
    </div>
    ${rmCalcInputsHtml(lift, s)}
    <div style="display:flex;align-items:baseline;gap:6px;background:var(--accent-dim);border-radius:var(--rsm);padding:10px 12px;margin:12px 0">
      <span style="font-size:20px;font-weight:800;color:var(--accent-text)">${rm!=null?Math.round(rm*10)/10:'—'}</span>
      <span style="font-size:12px;color:var(--text2);font-weight:600">kg · 1RM estimado</span>
    </div>
    ${rmCalcTableHtml(rm)}`;

  if(standalone) {
    return `<div class="wellness-card">${body}</div>`;
  }
  return `<div class="wellness-card">
    <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleSection('${key}')">
      <div>
        <div class="wellness-title">🏋️ Calculadora de %RM</div>
        <div class="wellness-sub">Con qué peso trabajar hoy, en cada ejercicio</div>
      </div>
      <span style="color:var(--text3);font-size:15px;transform:rotate(${collapsed?'-90':'0'}deg);transition:transform .15s">›</span>
    </div>
    ${body}
  </div>`;
}
window.renderRMCalcSection = renderRMCalcSection;

function renderSession() {
  // La calculadora es su propia solapa dentro de "Mi Rutina" (ver
  // renderSubnav) — entrar a la rutina SIEMPRE muestra primero el día que
  // corresponde, nunca la calculadora; solo aparece si el jugador la elige
  // a propósito tocando esa solapa.
  if (!S.isAdmin && S.rmCalcTabActive) {
    const header = `<div class="page-header">
      <div class="page-title">Calculadora de %RM</div>
      <div class="page-subtitle">Con qué peso trabajar hoy, en cada ejercicio</div>
    </div>`;
    return header + renderRMCalcSection(true);
  }
  const blocks = getCurrentBlocks();
  const sessionLabel = S.isAdmin ? `Sesión ${S.currentSession}` : (S.currentSession||'Sesión');
  const isBrowsingWeek = !!S._routineViewWeek;
  const header = `<div class="page-header">
    <div class="page-title">${sessionLabel}</div>
    <div class="page-subtitle">${isBrowsingWeek ? 'Repasando semana '+getRoutineWeek() : getWeekHeaderLabel(true)+' · '+new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</div>
  </div>`;
  // Repasar otras semanas — solo el atleta individual, nunca de equipo ni
  // admin (ver comentario en getRoutineWeek). No mueve nada real: solo
  // cambia qué semana se está mirando en esta pantalla.
  const weekBrowser = (!S.isAdmin && !isTeamAthlete()) ? `<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin:-6px 0 16px">
    <button class="abtn" onclick="browseRoutineWeek(-1)" title="Semana anterior">‹</button>
    <span style="font-size:12px;font-weight:700;color:${isBrowsingWeek?'var(--accent)':'var(--text3)'}">Semana ${getRoutineWeek()}${isBrowsingWeek?' · repasando':''}</span>
    <button class="abtn" onclick="browseRoutineWeek(1)" title="Semana siguiente">›</button>
    ${isBrowsingWeek?`<button class="abtn" onclick="resetRoutineWeekView()">Volver a hoy</button>`:''}
  </div>` : '';
  if (!blocks.length) {
    if (!S.isAdmin) {
      return header + weekBrowser + `<div class="empty-state" style="padding:40px 20px">
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">Sin rutina asignada</div>
        <div style="font-size:13px;color:var(--text3);line-height:1.6">Tu entrenador está preparando tu planificación.<br>Pronto vas a ver tu rutina acá.</div>
      </div>`;
    }
    return header + `<div class="empty-state">Sin bloques en esta sesión.</div>`;
  }
  return header + weekBrowser + blocks.map(b=>renderBlock(b)).join('')
    + `<button class="finish-btn" onclick="finishSession()">✓ Marcar sesión como completada</button>`;
}
window.renderSession = renderSession;

function renderBlock(b) {
  const cc=b.colorKey||'bx';
  // Todos los bloques arrancan colapsados — el atleta (o el admin revisando
  // su rutina) los va desplegando uno por uno, en vez de encontrarse toda la
  // sesión abierta y tener que scrollear entre bloques que no le interesan
  // todavía.
  const open=b._open===true;
  const exampleColors = {b1:'var(--teal)',b2:'var(--blue)',b3:'var(--purple)',b4:'var(--amber)',bx:'var(--text2)'};
  // Si TODOS los ejercicios de este bloque están tildados, mostramos un
  // check verde en el encabezado — así se ve el progreso aunque el bloque
  // esté colapsado.
  let totalEx=0, doneEx=0;
  b.categories.forEach(cat=>cat.exercises.forEach(ex=>{
    totalEx++;
    if(getED(getRoutineWeek(),S.currentSession,ex.id).checked) doneEx++;
  }));
  const blockAllDone = totalEx>0 && doneEx===totalEx;
  let inner=`<p class="block-note">${b.note||''}</p>`;
  b.categories.forEach((cat,ci)=>{
    inner+=`<div class="cat-header">
      <div class="cat-label-wrap">
        <span class="cat-label" ondblclick="editCatLabel(this,'${b.id}',${ci})">${cat.label}</span>
        <input class="cat-label-inp" id="catinp-${b.id}-${ci}" onblur="saveCatLabel('${b.id}',${ci},this)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      ${S.isAdmin?`<span class="cat-del" onclick="deleteCat('${b.id}',${ci})">− cat</span>`:''}
    </div>`;
    cat.exercises.forEach(ex=>{ inner+=renderExRow(ex,b.id,ci); });
    if(S.isAdmin) {
      inner+=`<button class="add-btn" onclick="openLib('${b.id}',${ci})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Agregar ejercicio</button>`;
    }
    if(ci<b.categories.length-1) inner+=`<hr class="cat-divider">`;
  });
  if(S.isAdmin) {
    inner+=`<button class="add-btn" style="margin-top:10px;color:var(--text3);border-top:1px solid var(--border);padding-top:10px" onclick="addCategory('${b.id}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Agregar subcategoría</button>`;
  }
  if(b.hasRPE) {
    const sd=getSD(getRoutineWeek(),S.currentSession);
    const rpe=sd.rpe||7.5;
    inner+=`<div class="rpe-row">
      <span class="rpe-lbl">RPE objetivo:</span>
      <input type="range" class="rpe-slider" min="5" max="10" step="0.5" value="${rpe}" oninput="setRPELive(this.value)" onchange="setRPE(this.value)">
      <span class="rpe-val" id="rpe-val">${rpe}</span>
      <span class="rpe-desc" id="rpe-desc">${rpeDesc(rpe)}</span>
    </div>`;
  }
  return `<div class="card block ${cc} ${open?'open':''}" id="block-${b.id}">
    <div class="block-header" onclick="toggleBlock('${b.id}')">
      <span class="block-badge">${b.label}</span>
      <div class="block-title-wrap">
        <span class="block-title" ${S.isAdmin?`ondblclick="editBlockTitle(event,'${b.id}')"`:''}>${b.title}</span>
        <input class="block-title-inp" id="btinp-${b.id}" onblur="saveBlockTitle('${b.id}',this)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <span class="block-time">${b.time}</span>
      ${blockAllDone?`<span class="block-done-badge" title="Bloque completo" style="width:20px;height:20px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>`:''}
      ${S.isAdmin?`<span class="block-del" onclick="deleteBlock(event,'${b.id}')">×</span>`:''}
      <span class="block-chevron">›</span>
    </div>
    <div class="block-body">${inner}</div>
  </div>`;
}

function renderExRow(ex,blockId,catIdx,forceReadOnly=false) {
  const d=getED(getRoutineWeek(),S.currentSession,ex.id);
  // Ejercicios agregados ANTES de que existiera libId no tienen ese vínculo — como
  // respaldo, buscamos por nombre exacto en la biblioteca para no perder el video.
  const libMatch = ex.libId ? null : S.library.find(l=>l.name.trim().toLowerCase()===(ex.name||'').trim().toLowerCase());
  const videoKey=ex.libId||(libMatch&&libMatch.id)||ex.id;
  const hasV=!!S.videos[videoKey];
  const canEdit=S.isAdmin && !forceReadOnly;
  const isAthleteMode=!S.isAdmin && !!S.assignedRoutine;
  // Routine prescription values — resueltas según la semana actual, con
  // progresión/regresión si la rutina la tiene cargada.
  const wp = getExPrescriptionForWeek(ex, getRoutineWeek());
  const prescSeries = wp.series;
  const prescReps   = wp.reps;
  const prescPct    = wp.pct;
  const prescNote   = wp.note;
  // BUG encontrado y corregido acá: el admin carga un RPE/RIR objetivo por
  // ejercicio al armar la rutina (ex.rpe + ex.intensityType), pero esta fila
  // de "lo que prescribió el entrenador" nunca lo mostraba — el jugador solo
  // veía series/reps/%RM, nunca la intensidad objetivo.
  const prescRpe = wp.rpe;
  const prescIntensityType = wp.intensityType || 'RPE';
  // If athlete mode: show prescribed values as read-only, only allow editing load + rpe actual
  const vbtF=ex.vbt?`<div class="field-box"><span class="field-lbl">m/s</span>
    <input class="field-inp vbt" type="number" step="0.01" placeholder="0.00" value="${d.ms||''}"
      ${isAthleteMode?'readonly style="opacity:.5;pointer-events:none"':''}
      onchange="setField('${ex.id}','ms',this.value)"></div>`:'';
  // Si el ejercicio tiene %RM y está vinculado a uno de los levantamientos
  // con RM cargado, calculamos el kilaje sugerido para hoy.
  // El %RM puede ser un solo número, o varios separados por "/" — uno por
  // serie, para progresiones dentro del mismo ejercicio (ej: "70/75/80" en
  // un ejercicio de 3 series). Calculamos el kilo de CADA valor por separado.
  const rmValue = ex.rmLift ? S.oneRM?.[ex.rmLift] : null;
  const pctParts = prescPct ? prescPct.split('/').map(p=>p.trim()).filter(Boolean) : [];
  const suggestedKg = (pctParts.length && rmValue)
    ? pctParts.map(p=>{ const n=parseDecimal(p); return isNaN(n)?'?':Math.round((n/100)*rmValue); }).join('/')
    : null;
  // Prescription display for athlete (read-only pill row above fields)
  const prescRow = isAthleteMode && (prescSeries||prescReps||prescPct||prescRpe) ? `
    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;align-items:center">
      <div style="display:flex;gap:6px;flex-wrap:wrap;cursor:pointer" onclick="openProgressionModal('${ex.id}','${ex.name.replace(/'/g,"\\'")}')" title="Ver progresión semana a semana">
        ${prescSeries?`<span style="font-size:11px;background:var(--purple-dim);color:var(--purple);padding:2px 8px;border-radius:20px;border:1px solid rgba(212,100,122,0.3)">${prescSeries} series</span>`:''}
        ${prescReps?`<span style="font-size:11px;background:var(--blue-dim);color:var(--blue);padding:2px 8px;border-radius:20px;border:1px solid rgba(96,165,250,0.3)">${prescReps} reps</span>`:''}
        ${prescPct?`<span style="font-size:11px;background:var(--teal-dim);color:var(--teal);padding:2px 8px;border-radius:20px;border:1px solid rgba(45,212,191,0.3)">${prescPct}%RM${suggestedKg?' ≈ '+suggestedKg+'kg':''}</span>`:''}
        ${prescRpe?`<span style="font-size:11px;background:var(--amber-dim);color:var(--amber);padding:2px 8px;border-radius:20px;border:1px solid rgba(198,124,15,0.3)">${prescIntensityType} objetivo: ${prescRpe}</span>`:''}
        ${(prescPct && ex.rmLift && !rmValue)?`<span style="font-size:11px;color:var(--amber)">Cargá tu RM de ${RM_LIFTS.find(r=>r.id===ex.rmLift)?.label||''} en Ajustes para ver los kilos</span>`:''}
        <span style="font-size:10px;color:var(--text3)">📈</span>
      </div>
      ${prescRpe?infoBtn('intensity'):''}
    </div>` : '';
  const prescNoteRow = prescNote ? `<div style="font-size:12px;color:var(--text3);font-style:italic;margin:2px 0 6px">${prescNote}</div>` : '';
  // El tipo de intensidad (RPE o RIR) lo define la rutina por ejercicio — acá
  // solo lo leemos para que la etiqueta, el rango del campo y el color
  // reflejen cuál es, en vez de asumir siempre RPE. Van en escalas opuestas:
  // RPE alto = esfuerzo alto (rojo); RIR bajo = esfuerzo alto (rojo) — por
  // eso el color no puede usar la misma función para los dos.
  const intensityType = wp.intensityType || ex.intensityType || 'RPE';
  const isRIR = intensityType === 'RIR';
  return `<div class="ex-row" id="exrow-${ex.id}">
    <div class="ex-check ${d.checked?'checked':''}" onclick="toggleCheck('${ex.id}')"></div>
    <div class="ex-main">
      <div class="ex-name-row">
        <span class="ex-name" ${canEdit?`ondblclick="editExName(this,'${ex.id}','${blockId}',${catIdx})"`:''}>${ex.name}</span>
        <input class="ex-name-inp" id="exinp-${ex.id}" ${canEdit?`onblur="saveExName('${ex.id}','${blockId}',${catIdx},this)" onkeydown="if(event.key==='Enter')this.blur()"`:''}>
        <div class="ex-actions" style="flex-direction:column">
          <div class="ex-icon-btn ${hasV?'has-video':''}" data-videokey="${videoKey}" onclick="openVideoModal('${videoKey}','${ex.name}',${canEdit})" title="${canEdit?'Video':'Ver video'}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          <div class="ex-icon-btn ex-note-btn ${d.athleteNote?'has-note':''}" onclick="openAthleteNoteModal('${ex.id}','${ex.name.replace(/'/g,"\\'")}')" title="Mi nota">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </div>
          ${canEdit?`<div class="ex-icon-btn del-ex" onclick="deleteExercise('${ex.id}','${blockId}',${catIdx})" title="Eliminar">×</div>`:''}
        </div>
      </div>
      ${prescNoteRow}
      ${prescRow}
      <div class="ex-fields">
        ${isAthleteMode ? `
          <div class="field-box"><span class="field-lbl" style="color:var(--green)">Carga real (kg)</span>
            <input class="field-inp load" type="text" placeholder="—" value="${d.load||''}" onchange="setField('${ex.id}','load',this.value)" style="border-color:rgba(212,100,122,0.35)"></div>
          <div class="field-box"><span class="field-lbl" style="color:var(--amber)">${intensityType} ejercicio</span>
            <input class="field-inp" type="number" min="${isRIR?0:1}" max="10" placeholder="—" value="${d.rpe||''}" onchange="setField('${ex.id}','rpe',this.value);this.style.borderColor=getIntensityColor(+this.value,'${intensityType}')" style="border-color:${d.rpe?getIntensityColor(+d.rpe,intensityType):'rgba(198,124,15,0.4)'}"></div>
          ${vbtF}
        ` : `
          <div class="field-box"><span class="field-lbl">Series</span>
            <input class="field-inp" type="text" placeholder="3x" value="${d.series||''}" onchange="setField('${ex.id}','series',this.value)"></div>
          <div class="field-box"><span class="field-lbl">Reps</span>
            <input class="field-inp" type="text" placeholder="6–8" value="${d.reps||''}" onchange="setField('${ex.id}','reps',this.value)"></div>
          <div class="field-box"><span class="field-lbl">%RM</span>
            <input class="field-inp" type="text" placeholder="—" value="${d.pct||''}" onchange="setField('${ex.id}','pct',this.value)"></div>
          ${vbtF}
          <div class="field-box"><span class="field-lbl">Carga (kg)</span>
            <input class="field-inp load" type="text" placeholder="—" value="${d.load||''}" onchange="setField('${ex.id}','load',this.value)"></div>
          <div class="field-box"><span class="field-lbl">${intensityType}</span>
            <input class="field-inp" type="text" placeholder="—" value="${d.rpe||''}" onchange="setField('${ex.id}','rpe',this.value)"></div>
        `}
      </div>
    </div>
  </div>`;
}

// ── SESSION ACTIONS ───────────────────────────────────────────

// Guarda el progreso de la sesión actual DE UNA, sin toast de "guardando"
// (esto tira varias veces por sesión — un toast por cada tilde/campo sería
// un fogonazo constante) — solo avisa si de verdad falló, porque eso sí
// importa que se note.
async function saveRoutineFieldSilently() {
  markRoutineDirty(sessionKey(getRoutineWeek(), S.currentSession));
  const ok = await saveNow();
  if(!ok) showToast('No se pudo guardar tu progreso — revisá tu conexión');
}
window.saveRoutineFieldSilently = saveRoutineFieldSilently;

function toggleBlock(id) {
  const el=document.getElementById('block-'+id);
  el.classList.toggle('open');
  const blocks=getCurrentBlocks();
  const b=blocks.find(x=>x.id===id);
  if(b) b._open=el.classList.contains('open');
}
window.toggleBlock=toggleBlock;

function toggleCheck(exId) {
  const d=getED(getRoutineWeek(),S.currentSession,exId);
  d.checked=!d.checked;
  const rowEl=document.querySelector(`#exrow-${exId}`);
  const el=rowEl?.querySelector('.ex-check');
  if(el) el.classList.toggle('checked',d.checked);
  if(!getSD(getRoutineWeek(),S.currentSession).date)
    getSD(getRoutineWeek(),S.currentSession).date=todayLocal();
  saveRoutineFieldSilently();
  updateBlockCheckmark(rowEl);
}
window.toggleCheck=toggleCheck;

// Actualiza a mano el tilde verde de "bloque completo" en el encabezado,
// sin re-renderizar toda la pantalla (evita perder foco en otros campos).
function updateBlockCheckmark(rowEl) {
  const blockEl = rowEl?.closest('.card.block');
  if(!blockEl) return;
  const checks = blockEl.querySelectorAll('.ex-check');
  const total = checks.length;
  const done = blockEl.querySelectorAll('.ex-check.checked').length;
  const header = blockEl.querySelector('.block-header');
  if(!header) return;
  let badge = header.querySelector('.block-done-badge');
  const allDone = total>0 && done===total;
  if(allDone && !badge) {
    badge = document.createElement('span');
    badge.className='block-done-badge';
    badge.title='Bloque completo';
    badge.style.cssText='width:20px;height:20px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;flex-shrink:0';
    badge.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    const timeEl = header.querySelector('.block-time');
    if(timeEl) timeEl.insertAdjacentElement('afterend', badge); else header.appendChild(badge);
  } else if(!allDone && badge) {
    badge.remove();
  }
}
window.updateBlockCheckmark = updateBlockCheckmark;

function setField(exId,field,val) {
  const d=getED(getRoutineWeek(),S.currentSession,exId);
  d[field]=val;
  if(!getSD(getRoutineWeek(),S.currentSession).date)
    getSD(getRoutineWeek(),S.currentSession).date=todayLocal();
  saveRoutineFieldSilently();
}
window.setField=setField;

// Igual criterio que la barra de horas de sueño: mientras se arrastra
// (oninput) solo se actualiza la etiqueta, nada se guarda ni se toca en
// otro lado de la pantalla — recién al soltar (onchange) se guarda de
// verdad, para no repetir el mismo bug de "el toque cae en otro lado".
function setRPELive(val) {
  const v=document.getElementById('rpe-val'), d=document.getElementById('rpe-desc');
  if(v) v.textContent=val; if(d) d.textContent=rpeDesc(val);
}
window.setRPELive=setRPELive;

function setRPE(val) {
  setRPELive(val);
  getSD(getRoutineWeek(),S.currentSession).rpe=parseFloat(val);
  saveRoutineFieldSilently();
}
window.setRPE=setRPE;

async function finishSession() {
  const sd=getSD(getRoutineWeek(),S.currentSession);
  sd.done=true; sd.date=todayLocal();
  markRoutineDirty(sessionKey(getRoutineWeek(),S.currentSession));
  const ok = await saveNow();
  if(!ok) { showToast('No se pudo guardar — revisá tu conexión y volvé a intentar'); return; }
  // Show session feedback modal
  S.feedbackSession={week:getRoutineWeek(), session:S.currentSession};
  openSessionFeedback();
  renderSubnav();
}
window.finishSession=finishSession;

function openSessionFeedback() {
  const modal = document.getElementById('session-feedback-modal');
  if(modal) { modal.classList.add('open'); }
}
window.openSessionFeedback=openSessionFeedback;

function closeSessionFeedback() {
  const modal = document.getElementById('session-feedback-modal');
  if(modal) modal.classList.remove('open');
}
window.closeSessionFeedback=closeSessionFeedback;

async function submitSessionFeedback() {
  const rpe    = parseInt(document.getElementById('sf-rpe')?.value||'0');
  const mins   = parseInt(document.getElementById('sf-mins')?.value||'0');
  const feel   = document.getElementById('sf-feel')?.value||'';
  const injury = document.getElementById('sf-injury')?.checked||false;

  if(!rpe||!mins) { showToast('Completá RPE y duración'); return; }

  const ua = rpe * mins;
  const date = todayLocal();
  const log = { date, week:S.currentWeek, session:S.currentSession, rpe, mins, ua, feel, injury, activity:'gimnasio' };

  // Save to sessionLogs — si ya había un log de gimnasio hoy (por ejemplo cargado
  // manualmente desde Wellness), lo reemplaza en vez de duplicar la carga del día.
  if(!S.history) S.history={};
  if(!S.history._sessionLogs) S.history._sessionLogs=[];
  S.history._sessionLogs = S.history._sessionLogs.filter(l=>!(l.date===date && l.activity==='gimnasio'));
  S.history._sessionLogs.push(log);
  markCargaDirty(date);
  showToast('Guardando…');
  const ok = await saveNow();
  if(!ok) { showToast('No se pudo guardar — revisá tu conexión y volvé a intentar'); return; }

  closeSessionFeedback();
  showToast(`✓ Sesión guardada · ${ua} UA`);

  if(injury) {
    setTimeout(()=>switchView('wellness'),600);
  }
}
window.submitSessionFeedback=submitSessionFeedback;

// ── CARGA DE HOY (Gimnasio / Pelota / Partido) ────────────────
// Registro de carga interna independiente de si el atleta tiene rutina
// asignada. Cada actividad completada (mins + RPE) se guarda como un log
// más en S.history._sessionLogs, con el mismo modelo sRPE (UA = mins × RPE)
// que ya usa calcLoadMetrics para ACWR / monotonía / strain.
const LOAD_ACTIVITIES = [
  {key:'gimnasio',  label:'Gimnasio (club)', emoji:'🏋️'},
  {key:'gimnasio2', label:'Gimnasio individual (fuera del club)', emoji:'🏋️', isExtraGym:true},
  {key:'pelota',    label:'Pelota',    emoji:'🏀'},
  {key:'partido',   label:'Partido 1', emoji:'🏆', isGame:true},
  {key:'partido2',  label:'Partido 2 (si jugaste doble ese día)', emoji:'🏆', isGame:true},
];

// "Pelota" era un nombre fijo (y el ícono siempre una pelota de básquet) sin
// importar el deporte real del atleta — un tenista veía "Pelota 🏀", que no
// tiene nada que ver. Esto cruza el deporte cargado en su ficha (individual
// o heredado del equipo) para mostrar "Entrenamiento de tenis 🎾", etc. El
// key interno sigue siendo 'pelota' siempre — solo cambia lo que se muestra.
const SPORT_ACTIVITY_ICONS = {
  handball:{name:'handball',emoji:'🤾'}, balonmano:{name:'handball',emoji:'🤾'},
  basquet:{name:'básquet',emoji:'🏀'}, básquet:{name:'básquet',emoji:'🏀'}, basketball:{name:'básquet',emoji:'🏀'},
  futbol:{name:'fútbol',emoji:'⚽'}, fútbol:{name:'fútbol',emoji:'⚽'},
  tenis:{name:'tenis',emoji:'🎾'}, padel:{name:'pádel',emoji:'🎾'}, pádel:{name:'pádel',emoji:'🎾'},
  voley:{name:'vóley',emoji:'🏐'}, vóley:{name:'vóley',emoji:'🏐'},
  rugby:{name:'rugby',emoji:'🏉'}, hockey:{name:'hockey',emoji:'🏑'},
};
function getLoadActivityDisplay(act, sport) {
  if(act.key!=='pelota') return {label:act.label, emoji:act.emoji};
  const s=(sport||'').toLowerCase().trim();
  for(const key in SPORT_ACTIVITY_ICONS) {
    if(s.includes(key)) { const info=SPORT_ACTIVITY_ICONS[key]; return {label:'Entrenamiento de '+info.name, emoji:info.emoji}; }
  }
  return sport ? {label:'Entrenamiento de '+sport, emoji:'🥅'} : {label:act.label, emoji:act.emoji};
}
window.getLoadActivityDisplay = getLoadActivityDisplay;

function getLoadLog(activity,date) {
  const logs=(S.history?._sessionLogs)||[];
  return logs.find(l=>l.date===date && l.activity===activity) || null;
}
window.getLoadLog=getLoadLog;

function updateLoadDraft(date,activity,field,value) {
  if(!S.loadDraft) S.loadDraft={};
  if(!S.loadDraft[date]) S.loadDraft[date]={};
  if(!S.loadDraft[date][activity]) {
    const existing=getLoadLog(activity,date);
    S.loadDraft[date][activity]=existing?{mins:existing.mins,rpe:existing.rpe,note:existing.note||''}:{mins:'',rpe:0,note:''};
  }
  if(field==='mins') S.loadDraft[date][activity][field]= value===''?'':Math.max(0,+value);
  else if(field==='rpe') S.loadDraft[date][activity][field]= +value;
  else S.loadDraft[date][activity][field]= value; // note: texto libre, no numérico

  // El input de minutos tiene foco de teclado activo — un renderMain()
  // completo reconstruye el <input> y en el celular eso cierra el teclado y
  // tira el scroll para arriba a mitad de tipeo. Actualizamos el numerito de
  // UA a mano en su lugar, sin reconstruir nada. Para RPE (son botones, sin
  // foco de texto) sí se puede re-renderizar entero sin problema.
  if(field==='mins') {
    const draft=S.loadDraft[date][activity];
    const ua=(draft.mins&&draft.rpe)?draft.mins*draft.rpe:0;
    const el=document.getElementById(`load-ua-preview-${date}-${activity}`);
    if(el) {
      if(ua) { el.textContent=`${draft.mins} min × RPE ${draft.rpe} = ${ua} UA`; el.style.display=''; }
      else { el.textContent=''; el.style.display='none'; }
    }
    // Igual que el numerito de UA de arriba: se actualiza a mano para no
    // reconstruir el input y perder el foco/teclado en el celular.
    const stillMissing = draft.rpe>0 && !draft.mins;
    const minsEl = document.getElementById(`load-mins-${date}-${activity}`);
    if(minsEl) minsEl.style.cssText = stillMissing ? 'border:2px solid var(--red);background:var(--red-dim)' : '';
    const warnEl = document.getElementById(`load-mins-warn-${date}-${activity}`);
    if(warnEl) warnEl.style.display = stillMissing ? '' : 'none';
  } else {
    renderMain();
  }
}
window.updateLoadDraft=updateLoadDraft;

async function saveLoadLog(date) {
  const today=todayLocal();
  date = date || today;
  if(!S.history) S.history={};
  if(!S.history._sessionLogs) S.history._sessionLogs=[];
  let savedAny=false;
  const incomplete=[]; // actividades con RPE pero sin minutos (o viceversa) — antes se perdían sin avisar
  LOAD_ACTIVITIES.forEach(act=>{
    const draft=(S.loadDraft?.[date]?.[act.key])||null;
    const existing=getLoadLog(act.key,date);
    const mins = draft ? draft.mins : existing?.mins;
    const rpe  = draft ? draft.rpe  : existing?.rpe;
    const note = draft ? (draft.note||'') : (existing?.note||'');
    if(mins && rpe) {
      // saca cualquier log previo de esta actividad en esa fecha, para no duplicar carga
      S.history._sessionLogs = S.history._sessionLogs.filter(l=>!(l.date===date && l.activity===act.key));
      S.history._sessionLogs.push({date, activity:act.key, session:getLoadActivityDisplay(act, S.userData?.sport).label, week:S.currentWeek, rpe, mins, note, ua:mins*rpe});
      markCargaDirty(date);
      savedAny=true;
    } else if((mins && !rpe) || (!mins && rpe)) {
      // Cargó una mitad y no la otra — esto es justo lo que se perdía en
      // silencio antes: el toast de éxito tapaba que esa actividad puntual
      // no se había guardado.
      incomplete.push(getLoadActivityDisplay(act, S.userData?.sport).label + (mins&&!rpe ? ' (falta RPE)' : ' (falta minutos)'));
    }
  });
  if(!savedAny && !incomplete.length) { showToast('Completá minutos y RPE de al menos una actividad'); return; }
  if(S.loadDraft) delete S.loadDraft[date];
  if(savedAny) {
    showToast('Guardando…');
    const ok = await saveNow();
    if(!ok) { showToast('No se pudo guardar — revisá tu conexión y volvé a intentar'); renderMain(); return; }
  }
  if(incomplete.length) {
    showToast((savedAny?'✓ Carga guardada, pero falta completar: ':'Falta completar: ')+incomplete.join(', '));
  } else {
    showToast(date===today ? '✓ Carga de hoy guardada' : `✓ Carga del ${date} guardada`);
  }
  renderMain();
}
window.saveLoadLog=saveLoadLog;

// ── ADMIN EDIT ACTIONS ────────────────────────────────────────
function editBlockTitle(e,blockId) {
  e.stopPropagation();
  const b=S.blocks.find(x=>x.id===blockId); if(!b) return;
  const span=e.target, inp=document.getElementById('btinp-'+blockId);
  span.style.display='none'; inp.value=b.title; inp.style.display='block'; inp.focus(); inp.select();
}
window.editBlockTitle=editBlockTitle;

function saveBlockTitle(blockId,inp) {
  const b=S.blocks.find(x=>x.id===blockId); if(!b) return;
  if(inp.value.trim()) b.title=inp.value.trim();
  inp.style.display='none';
  const span=inp.previousElementSibling; if(span) span.style.display='';
  span.textContent=b.title; scheduleSave();
}
window.saveBlockTitle=saveBlockTitle;

function deleteBlock(e,blockId) {
  e.stopPropagation();
  if(!confirm('¿Eliminar este bloque?')) return;
  S.blocks=S.blocks.filter(b=>b.id!==blockId);
  scheduleSave(); renderMain();
}
window.deleteBlock=deleteBlock;

function editCatLabel(el,blockId,catIdx) {
  const inp=document.getElementById(`catinp-${blockId}-${catIdx}`);
  el.style.display='none'; inp.value=el.textContent; inp.style.display='inline-block'; inp.focus(); inp.select();
}
window.editCatLabel=editCatLabel;

function saveCatLabel(blockId,catIdx,inp) {
  const b=S.blocks.find(x=>x.id===blockId); if(!b) return;
  if(inp.value.trim()) b.categories[catIdx].label=inp.value.trim();
  inp.style.display='none';
  const span=inp.previousElementSibling; if(span) { span.textContent=b.categories[catIdx].label; span.style.display=''; }
  scheduleSave();
}
window.saveCatLabel=saveCatLabel;

function deleteCat(blockId,catIdx) {
  if(!confirm('¿Eliminar esta subcategoría y sus ejercicios?')) return;
  const b=S.blocks.find(x=>x.id===blockId); if(!b) return;
  b.categories.splice(catIdx,1); scheduleSave(); renderMain();
}
window.deleteCat=deleteCat;

function addCategory(blockId) {
  const b=S.blocks.find(x=>x.id===blockId); if(!b) return;
  b.categories.push({id:genId(),label:'Nueva categoría',exercises:[]});
  scheduleSave(); renderMain();
}
window.addCategory=addCategory;

function editExName(el,exId,blockId,catIdx) {
  const inp=document.getElementById('exinp-'+exId);
  el.style.display='none'; inp.value=el.textContent; inp.style.display='block'; inp.focus(); inp.select();
}
window.editExName=editExName;

function saveExName(exId,blockId,catIdx,inp) {
  const b=S.blocks.find(x=>x.id===blockId); if(!b) return;
  const ex=b.categories[catIdx].exercises.find(e=>e.id===exId); if(!ex) return;
  if(inp.value.trim()) ex.name=inp.value.trim();
  inp.style.display='none';
  const span=inp.previousElementSibling; if(span) { span.textContent=ex.name; span.style.display=''; }
  scheduleSave();
}
window.saveExName=saveExName;

function deleteExercise(exId,blockId,catIdx) {
  const b=S.blocks.find(x=>x.id===blockId); if(!b) return;
  b.categories[catIdx].exercises=b.categories[catIdx].exercises.filter(e=>e.id!==exId);
  scheduleSave(); renderMain();
}
window.deleteExercise=deleteExercise;

// ── COPIAR/PEGAR UN BLOQUE PUNTUAL ──────────────────────────────
// Portapapeles en memoria (dura mientras la pestaña esté abierta) para poder
// copiar UN bloque de cualquier lado — rutina, día de equipo, sesión propia
// del admin — y pegarlo en cualquier otro, sin llevarse la planificación
// entera. Clonar SIEMPRE regenera todos los ids (bloque, categorías,
// ejercicios): así la copia pegada queda 100% independiente del original —
// pegarla varias veces, o seguir editando el original después, nunca cruza
// cables entre copias.
function copyBlockToClipboard(block) {
  S._blockClipboard = JSON.parse(JSON.stringify(block));
  showToast(`✓ "${block.title||block.label}" copiado — pegalo donde quieras`);
}
window.copyBlockToClipboard = copyBlockToClipboard;

function clonedBlockFromClipboard() {
  if(!S._blockClipboard) return null;
  const b = JSON.parse(JSON.stringify(S._blockClipboard));
  b.id = genId();
  b._open = true;
  (b.categories||[]).forEach(cat=>{
    cat.id = genId();
    (cat.exercises||[]).forEach(ex=>{ ex.id = genId(); });
  });
  return b;
}
window.clonedBlockFromClipboard = clonedBlockFromClipboard;

// ── ADD BLOCK ─────────────────────────────────────────────────
function addBlock() {
  const colors=['b1','b2','b3','b4','bx'];
  const cc=colors[S.blocks.length % colors.length];
  S.blocks.push({
    id:genId(), label:`Bloque ${S.blocks.length+1}`, title:'Nuevo bloque',
    time:'', colorKey:cc, note:'', _open:true, categories:[
      {id:genId(),label:'Categoría',exercises:[]}
    ]
  });
  scheduleSave(); renderMain();
  setTimeout(()=>{
    const last=document.querySelectorAll('.block-title');
    if(last.length) last[last.length-1].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  },100);
}
window.addBlock=addBlock;

// ── LIBRARY ───────────────────────────────────────────────────
function openLib(blockId,catIdx) {
  S.libTarget={blockId,catIdx};
  S.activeFilters=new Set();
  document.getElementById('lib-search').value='';
  renderLibFilters();
  renderLibList();
  S._newExTags = new Set();
  renderTagChipPicker('lib-new-tags-picker','_newExTags');
  // El formulario de "crear ejercicio nuevo" arranca oculto cada vez que se
  // abre la biblioteca — lo pedido era no verlo de entrada (el caso común es
  // agregar uno YA existente de la lista de arriba), pero poder desplegarlo
  // con el botón cuando hace falta, y volver a ocultarlo después.
  hideLibNewExerciseForm();
  document.getElementById('lib-overlay').classList.add('open');
}
window.openLib=openLib;

function toggleLibNewExerciseForm() {
  const wrap = document.getElementById('lib-new-wrap');
  if(!wrap) return;
  if(wrap.style.display==='none') showLibNewExerciseForm(); else hideLibNewExerciseForm();
}
window.toggleLibNewExerciseForm = toggleLibNewExerciseForm;

function showLibNewExerciseForm() {
  const wrap = document.getElementById('lib-new-wrap');
  const btn = document.getElementById('lib-new-toggle-btn');
  if(wrap) wrap.style.display='flex';
  if(btn) btn.textContent='− Ocultar formulario';
}
window.showLibNewExerciseForm = showLibNewExerciseForm;

function hideLibNewExerciseForm() {
  const wrap = document.getElementById('lib-new-wrap');
  const btn = document.getElementById('lib-new-toggle-btn');
  if(wrap) wrap.style.display='none';
  if(btn) btn.textContent='+ Crear ejercicio nuevo';
}
window.hideLibNewExerciseForm = hideLibNewExerciseForm;

function closeLib() { document.getElementById('lib-overlay').classList.remove('open'); }
window.closeLib=closeLib;

function closeLibIfOutside(e) { if(e.target===document.getElementById('lib-overlay')) closeLib(); }
window.closeLibIfOutside=closeLibIfOutside;

function renderLibFilters() {
  const f=document.getElementById('lib-filters');
  f.innerHTML=[{id:null,label:'Todos'},...getAllLibraryTags().map(t=>({id:t,label:t}))].map(ft=>
    `<span class="lib-filter ${ft.id===null?(S.activeFilters.size===0?'active':''):(S.activeFilters.has(ft.id)?'active':'')}" onclick="setFilter('${ft.id}')">${ft.label}</span>`
  ).join('');
}

function setFilter(f) {
  if(f==='null') { S.activeFilters=new Set(); }
  else if(S.activeFilters.has(f)) { S.activeFilters.delete(f); }
  else { S.activeFilters.add(f); }
  renderLibFilters(); renderLibList();
}
window.setFilter=setFilter;

function renderLibList() {
  const q=document.getElementById('lib-search').value.toLowerCase();
  const list=document.getElementById('lib-list');
  let items=S.library.filter(ex=>{
    const matchQ=!q||ex.name.toLowerCase().includes(q);
    const matchF=S.activeFilters.size===0||[...S.activeFilters].some(f=>ex.tags?.includes(f));
    return matchQ&&matchF;
  });
  // Los que cumplen TODAS las categorías elegidas van primero, después los
  // que cumplen menos — y alfabético como desempate (y como único criterio
  // si no hay filtros activos).
  items = [...items].sort((a,b)=>{
    if(S.activeFilters.size>0) {
      const am=[...S.activeFilters].filter(f=>a.tags?.includes(f)).length;
      const bm=[...S.activeFilters].filter(f=>b.tags?.includes(f)).length;
      if(bm!==am) return bm-am;
    }
    return a.name.localeCompare(b.name);
  });
  if(!items.length) { list.innerHTML=`<div class="empty-state">No se encontraron ejercicios</div>`; return; }
  list.innerHTML=items.map(ex=>`
    <div class="lib-item" onclick="addFromLib('${ex.id}')">
      <div>
        <div class="lib-item-name">${ex.name}</div>
        ${(ex.tags||[]).length?`<div class="lib-item-tags">${(ex.tags||[]).slice(0,2).join(' · ')}</div>`:''}
      </div>
      <button class="lib-item-add" tabindex="-1">+</button>
    </div>`).join('');
}
window.renderLibList=renderLibList;

function addFromLib(libId) {
  const libEx=S.library.find(e=>e.id===libId); if(!libEx||!S.libTarget) return;
  const {blockId,catIdx,sessionName,isRoutine}=S.libTarget;
  if(S.libTarget.isTD) {
    // Adding to team day editor
    const {teamId,dayIdx}=S.libTarget;
    const b=getTDBlock(blockId,teamId,dayIdx);
    if(!b)return;
    b.categories[catIdx].exercises.push({id:genId(),libId:libEx.id,name:libEx.name,series:'',reps:'',pct:'',rpe:'',note:''});
    closeLib();renderMain();
  } else if(S.libTarget.isPersonal) {
    // Adding a personal-only exercise for ONE specific athlete
    const {uid,sessionName:pSName}=S.libTarget;
    addPersonalExtraExercise(uid,pSName,{id:genId(),libId:libEx.id,name:libEx.name,series:'',reps:'',pct:'',rpe:'',note:''});
    closeLib();
  } else if(isRoutine && S.editingRoutine) {
    // Adding to routine editor
    const b=(S.editingRoutine.sessions[sessionName]||[]).find(x=>x.id===blockId);
    if(!b) return;
    const newEx={id:genId(),libId:libEx.id,name:libEx.name,series:'',reps:'',pct:'',rpe:'',note:''};
    b.categories[catIdx].exercises.push(newEx);
    closeLib(); renderMain();
  } else {
    // Adding to admin's personal session
    const b=S.blocks.find(x=>x.id===blockId); if(!b) return;
    const newEx={id:genId(),libId:libEx.id,name:libEx.name};
    b.categories[catIdx].exercises.push(newEx);
    scheduleSave(); closeLib(); renderMain();
  }
  showToast(`✓ ${libEx.name} agregado`);
}
window.addFromLib=addFromLib;

// ── TAXONOMÍA DE CATEGORÍAS DE LA BIBLIOTECA ────────────────────
// Reemplaza el sistema viejo de tags 100% libres (que se prestaba a
// categorías duplicadas por errores de tipeo) por una taxonomía cerrada: UNA
// categoría principal por ejercicio (excluyente, de esta lista fija de 17) +
// sus sub-categorías obligatorias, que dependen de cuál sea la principal.
// Todo se sigue guardando en el mismo array plano ex.tags de siempre — no
// hace falta un campo aparte para "cuál es la principal", se deduce viendo
// cuál de estas 17 aparece en el array (como es excluyente, hay como mucho una).
const LIB_MAIN_CATEGORIES = [
  'Movilidad','Empuje MMSS','Tracción MMSS','Empuje MMII','Tracción MMII','Zona Media',
  'ISO HOLD','ISO PUSH','ISO CATCH','ISO SWITCH','Pliometría','Saltos','Lanzamientos',
  'Auxiliar Brazos','Auxiliar MMII','Estabilidad','Rehabilitación',
];
window.LIB_MAIN_CATEGORIES = LIB_MAIN_CATEGORIES;

// Por cada principal, uno o dos "grupos" de sub-categorías. Un grupo con
// multi:false se comporta como radio (a lo sumo una opción marcada a la
// vez); multi:true se comporta como checkbox (se pueden marcar varias).
const LIB_SUBCATEGORY_RULES = {
  'Movilidad':       [{ options:['Hombro','Columna','Cadera','Tobillo','Otro'], multi:false }],
  'Empuje MMSS':     [{ options:['bilateral','unilateral'], multi:false }],
  'Tracción MMSS':   [{ options:['bilateral','unilateral'], multi:false }],
  'Empuje MMII':     [{ options:['bilateral','unilateral'], multi:false }],
  'Tracción MMII':   [{ options:['bilateral','unilateral'], multi:false }],
  'Zona Media':      [{ options:['anti-extensión','anti-flexión','anti-rotación','anti-flexión lateral','rotación','flexión','extensión','flexión lateral'], multi:true }],
  'ISO HOLD':        [{ options:['bilateral','unilateral'], multi:false }, { options:['Hombro','Cadera','Rodilla','Tobillo'], multi:false }],
  'ISO PUSH':        [{ options:['bilateral','unilateral'], multi:false }, { options:['Hombro','Cadera','Rodilla','Tobillo'], multi:false }],
  'ISO CATCH':       [{ options:['bilateral','unilateral'], multi:false }, { options:['Empuje MMSS','Tracción MMSS','Miembro inferior'], multi:false }],
  'ISO SWITCH':      [{ options:['Cadera','Tobillo'], multi:false }],
  'Pliometría':      [{ options:['bilateral','unilateral'], multi:false }, { options:['MMII','MMSS'], multi:false }],
  'Saltos':          [{ options:['bilateral','unilateral'], multi:false }, { options:['Vertical','Horizontal'], multi:false }],
  'Lanzamientos':    [{ options:['bilateral','unilateral'], multi:false }, { options:['Vertical','Horizontal','Rotacional'], multi:false }],
  'Auxiliar Brazos': [{ options:['Hombros','Bíceps','Tríceps'], multi:false }],
  'Auxiliar MMII':   [{ options:['Glúteo','Cuádriceps','Isquiosurales','Aductores','Gemelos'], multi:false }],
  'Estabilidad':     [{ options:['Hombro','Cadera','Rodilla','Tobillo'], multi:false }],
  'Rehabilitación':  [{ options:['Muñeca','Codo','Hombro','Columna','Cadera','Rodilla','Tobillo','Pie'], multi:false }],
};
window.LIB_SUBCATEGORY_RULES = LIB_SUBCATEGORY_RULES;

function getExerciseMainCategory(tags) {
  const set = new Set(tags||[]);
  return LIB_MAIN_CATEGORIES.find(c=>set.has(c)) || null;
}
window.getExerciseMainCategory = getExerciseMainCategory;

// Qué falta completar para que el ejercicio esté bien categorizado (vacío =
// todo OK) — se usa para bloquear el guardado y avisar qué falta.
function getMissingLibRules(tags) {
  const set = new Set(tags||[]);
  const main = getExerciseMainCategory(tags);
  if(!main) return [{label:'una categoría principal'}];
  const groups = LIB_SUBCATEGORY_RULES[main]||[];
  return groups.filter(g=>!g.options.some(o=>set.has(o)))
    .map(g=>({label: main+': '+g.options.join('/')}));
}
window.getMissingLibRules = getMissingLibRules;

// Elegir una principal nueva LIMPIA cualquier principal/sub-tag previo (son
// propios de la principal anterior, no tienen sentido sueltos).
function selectMainCategory(selected, cat) {
  const mainSet = new Set(LIB_MAIN_CATEGORIES);
  const allSubOptions = new Set(Object.values(LIB_SUBCATEGORY_RULES).flatMap(groups=>groups.flatMap(g=>g.options)));
  const wasSelected = selected.has(cat);
  [...selected].forEach(t=>{ if(mainSet.has(t)||allSubOptions.has(t)) selected.delete(t); });
  if(!wasSelected) selected.add(cat);
}
window.selectMainCategory = selectMainCategory;

// Tocar una sub-categoría: si el grupo es radio (multi:false), saca
// cualquier otra opción del mismo grupo antes de marcar la nueva.
function toggleSubcategory(selected, tag, multi) {
  const main = getExerciseMainCategory([...selected]);
  const group = (LIB_SUBCATEGORY_RULES[main]||[]).find(g=>g.options.includes(tag));
  if(group && !group.multi) group.options.forEach(o=>{ if(o!==tag) selected.delete(o); });
  if(selected.has(tag)) selected.delete(tag); else selected.add(tag);
}
window.toggleSubcategory = toggleSubcategory;

// Selector de dos pasos compartido — se usa para crear/editar ejercicios
// tanto desde el picker rápido (sesión/rutina/día de equipo) como desde la
// Biblioteca completa: primero la categoría principal (excluyente), y recién
// al elegirla se despliegan sus sub-categorías obligatorias.
function renderTagChipPicker(containerId, setKey) {
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!S[setKey]) S[setKey] = new Set();
  const selected = S[setKey];
  const main = getExerciseMainCategory([...selected]);
  let html = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'
    + LIB_MAIN_CATEGORIES.map(c=>`<span class="lib-filter ${main===c?'active':''}" onclick="selectMainCategoryChip('${containerId}','${setKey}','${c.replace(/'/g,"\\'")}')">${c}</span>`).join('')
    + '</div>';
  if(main) {
    (LIB_SUBCATEGORY_RULES[main]||[]).forEach(g=>{
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">'
        + g.options.map(t=>`<span class="lib-filter ${selected.has(t)?'active':''}" onclick="toggleSubcategoryChip('${containerId}','${setKey}','${t.replace(/'/g,"\\'")}',${g.multi})">${t}</span>`).join('')
        + '</div>';
    });
  } else {
    html += '<div style="font-size:11px;color:var(--text3)">Elegí una categoría principal arriba.</div>';
  }
  el.innerHTML = html;
}
window.renderTagChipPicker = renderTagChipPicker;

function selectMainCategoryChip(containerId, setKey, cat) {
  if(!S[setKey]) S[setKey] = new Set();
  selectMainCategory(S[setKey], cat);
  renderTagChipPicker(containerId, setKey);
}
window.selectMainCategoryChip = selectMainCategoryChip;

function toggleSubcategoryChip(containerId, setKey, tag, multi) {
  if(!S[setKey]) S[setKey] = new Set();
  toggleSubcategory(S[setKey], tag, multi);
  renderTagChipPicker(containerId, setKey);
}
window.toggleSubcategoryChip = toggleSubcategoryChip;

function createAndAddExercise() {
  const name=document.getElementById('lib-new-name').value.trim();
  if(!name) return;
  const tags=[...(S._newExTags||new Set())];
  const missing = getMissingLibRules(tags);
  if(missing.length) { showToast('Falta elegir: '+missing.map(m=>m.label).join(' · ')); return; }
  const videoUrl=document.getElementById('lib-new-video').value.trim();
  const newLibEx={id:genId(),name,tags};
  S.library.push(newLibEx);
  if(videoUrl) S.videos[newLibEx.id]=videoUrl;
  if(S.libTarget) {
    const {blockId,catIdx,sessionName,isRoutine}=S.libTarget;
    if(S.libTarget.isTD) {
      // Adding to team day editor (esto es lo que faltaba)
      const {teamId,dayIdx}=S.libTarget;
      const b=getTDBlock(blockId,teamId,dayIdx);
      if(b) b.categories[catIdx].exercises.push({id:genId(),libId:newLibEx.id,name,series:'',reps:'',pct:'',rpe:'',note:''});
      scheduleSave(); closeLib(); renderMain();
    } else if(S.libTarget.isPersonal) {
      const {uid,sessionName:pSName}=S.libTarget;
      scheduleSave(); // guarda el ejercicio nuevo en la biblioteca compartida
      addPersonalExtraExercise(uid,pSName,{id:genId(),libId:newLibEx.id,name,series:'',reps:'',pct:'',rpe:'',note:''});
      closeLib();
    } else if(isRoutine && S.editingRoutine) {
      const b=(S.editingRoutine.sessions[sessionName]||[]).find(x=>x.id===blockId);
      if(b) b.categories[catIdx].exercises.push({id:genId(),libId:newLibEx.id,name,series:'',reps:'',pct:'',rpe:'',note:''});
      scheduleSave(); closeLib(); renderMain();
    } else {
      const b=S.blocks.find(x=>x.id===blockId);
      if(b) b.categories[catIdx].exercises.push({id:genId(),libId:newLibEx.id,name});
      scheduleSave(); closeLib(); renderMain();
    }
  }
  document.getElementById('lib-new-name').value='';
  document.getElementById('lib-new-video').value='';
  showToast(`✓ Ejercicio creado`);
}
window.createAndAddExercise=createAndAddExercise;

// ── VIDEO ─────────────────────────────────────────────────────
// Convierte cualquier link de YouTube (watch, youtu.be, shorts, embed) a una URL embebible
function getYouTubeEmbedUrl(url) {
  if(!url) return '';
  try {
    const u = new URL(url);
    let id = '';
    if(u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else if(u.searchParams.get('v')) id = u.searchParams.get('v');
    else if(u.pathname.includes('/embed/')) id = u.pathname.split('/embed/')[1];
    else if(u.pathname.includes('/shorts/')) id = u.pathname.split('/shorts/')[1];
    id = (id||'').split('&')[0].split('?')[0].split('/')[0];
    return id ? `https://www.youtube.com/embed/${id}` : '';
  } catch(e) { return ''; }
}
window.getYouTubeEmbedUrl=getYouTubeEmbedUrl;

function openVideoModal(exId,exName,editable) {
  S.videoTarget=exId;
  S.videoEditable=!!editable;
  const url=S.videos[exId]||'';

  const els = {
    editNote: document.getElementById('video-modal-editnote'),
    previewWrap: document.getElementById('video-preview-wrap'),
    previewFrame: document.getElementById('video-preview-frame'),
    urlInp: document.getElementById('video-url-inp'),
    clearBtn: document.getElementById('video-clear-btn'),
    cancelBtn: document.getElementById('video-cancel-btn'),
    saveBtn: document.getElementById('video-save-btn'),
    emptyNote: document.getElementById('video-empty-note'),
    closeBtn: document.getElementById('video-close-btn'),
  };
  document.getElementById('video-modal-title').textContent=exName;
  const embed=getYouTubeEmbedUrl(url);

  if(S.videoEditable) {
    els.editNote.style.display='block';
    els.urlInp.style.display='block';
    els.urlInp.value=url;
    els.clearBtn.style.display=url?'inline-block':'none';
    els.cancelBtn.style.display='inline-block';
    els.saveBtn.style.display='inline-block';
    els.emptyNote.style.display='none';
    els.closeBtn.style.display='none';
    els.previewFrame.src=embed||'';
    els.previewWrap.style.display=embed?'block':'none';
  } else {
    if(!url) { showToast('Todavía no hay video cargado para este ejercicio'); S.videoTarget=null; return; }
    els.editNote.style.display='none';
    els.urlInp.style.display='none';
    els.clearBtn.style.display='none';
    els.cancelBtn.style.display='none';
    els.saveBtn.style.display='none';
    els.emptyNote.style.display='none';
    els.closeBtn.style.display='block';
    els.previewFrame.src=embed||'';
    els.previewWrap.style.display=embed?'block':'none';
  }
  document.getElementById('video-overlay').classList.add('open');
  // Foco automático en el campo de link — para no tener que tocarlo a mano
  // antes de pegar la URL, ahorra un paso cada vez.
  if(S.videoEditable) setTimeout(()=>els.urlInp.focus(), 50);
}
window.openVideoModal=openVideoModal;

function closeVideoModal() {
  document.getElementById('video-overlay').classList.remove('open');
  document.getElementById('video-preview-frame').src=''; // corta la reproducción al cerrar
}
window.closeVideoModal=closeVideoModal;

function closeVideoIfOutside(e) { if(e.target===document.getElementById('video-overlay')) closeVideoModal(); }
window.closeVideoIfOutside=closeVideoIfOutside;

// ── NOTA PROPIA DEL ATLETA POR EJERCICIO (pizarra) ───────────────
function openAthleteNoteModal(exId, exName) {
  S._noteModalExId = exId;
  const d = getED(S.currentWeek, S.currentSession, exId);
  document.getElementById('note-modal-title').textContent = 'Mi nota · ' + exName;
  document.getElementById('note-modal-textarea').value = d.athleteNote || '';
  document.getElementById('note-overlay').classList.add('open');
}
window.openAthleteNoteModal = openAthleteNoteModal;

function closeNoteModal() {
  document.getElementById('note-overlay').classList.remove('open');
}
window.closeNoteModal = closeNoteModal;

function closeNoteIfOutside(e) { if(e.target===document.getElementById('note-overlay')) closeNoteModal(); }
window.closeNoteIfOutside = closeNoteIfOutside;

function saveAthleteNote() {
  const exId = S._noteModalExId;
  if(!exId) return;
  const val = document.getElementById('note-modal-textarea').value;
  setField(exId, 'athleteNote', val);
  const btn = document.querySelector(`#exrow-${exId} .ex-note-btn`);
  if(btn) btn.classList.toggle('has-note', !!val.trim());
  closeNoteModal();
  showToast('✓ Nota guardada');
}
window.saveAthleteNote = saveAthleteNote;

// ── PROGRESIÓN SEMANAL (prescripto vs completado, semana a semana) ──────
function findExInAssignedRoutine(exId) {
  const routine = S.assignedRoutine;
  if(!routine || !routine.sessions) return null;
  for(const sName in routine.sessions) {
    for(const b of (routine.sessions[sName]||[])) {
      for(const cat of (b.categories||[])) {
        const found = (cat.exercises||[]).find(e=>e.id===exId);
        if(found) return found;
      }
    }
  }
  return null;
}
window.findExInAssignedRoutine = findExInAssignedRoutine;

// Toggle micro/macrociclo en la ficha de rutina del atleta (vista admin) —
// microciclo = semana puntual con estética de campos; macrociclo = todas
// las semanas en tabla horizontal. Solo aplica a la vista admin.
function setAtletaRoutineCicloView(mode) {
  S._atletaRoutineCicloView = mode;
  renderMain();
}
window.setAtletaRoutineCicloView = setAtletaRoutineCicloView;

// Permite al admin corregir carga/RPE que el atleta cargó mal — escribe
// directo en el historial personal del atleta (mismo documento que él usa).
// IMPORTANTE: nunca mandar el objeto "history" entero — ese mapa también
// contiene _sessionLogs (la carga cruda que el atleta va cargando desde su
// celular, en vivo). a._personal es una copia en memoria que se trajo al
// abrir el equipo/atleta y puede quedar vieja mientras el admin corrige
// varios atletas seguidos — mandar el objeto completo pisaba con esa foto
// vieja cualquier sesión nueva que el atleta hubiera cargado mientras tanto.
// Por eso acá se escribe SOLO el campo puntual tocado, por dot-path.
async function adminSetExerciseField(uid, wKey, sName, exId, field, value) {
  const a = S.adminAthletes?.find(x=>x.uid===uid) || (S.viewingAthlete?.uid===uid ? S.viewingAthlete : null);
  if(!a) return;
  if(!a._personal) a._personal = {};
  if(!a._personal.history) a._personal.history = {};
  const sk = sessionKey(wKey, sName);
  const num = value===''? null : parseDecimal(value);
  try {
    // Traemos el registro puntual de ESTE ejercicio fresco del servidor
    // antes de tocarlo, en vez de completar sobre la copia en memoria del
    // admin (que puede tener horas de vieja dentro de la misma sesión,
    // S.adminAthletes solo se carga una vez) — así ningún campo hermano
    // (load/rpe/nota) que el atleta haya cargado más reciente se pierde.
    let rec = {};
    try {
      const snap = await getDoc(doc(db,'personal',uid));
      rec = snap.exists() ? (snap.data().history?.[sk]?.exercises?.[exId] || {}) : {};
    } catch(e) { rec = a._personal.history[sk]?.exercises?.[exId] || {}; }
    rec = {...rec};
    rec[field] = (num===null || isNaN(num)) ? null : num;
    if(rec.load || rec.rpe) rec.checked = true;
    const path = `history.${sk}.exercises.${exId}`;
    await updateDocSafe(doc(db,'personal',uid), {[path]: rec});
    if(!a._personal.history[sk]) a._personal.history[sk] = {};
    if(!a._personal.history[sk].exercises) a._personal.history[sk].exercises = {};
    a._personal.history[sk].exercises[exId] = rec;
    showToast('✓ Guardado');
  } catch(e) { showToast('Error al guardar'); }
  renderMain();
}
window.adminSetExerciseField = adminSetExerciseField;

// "Completó" (kg/RPE reales del atleta, editables por el admin por si se
// equivocó al cargar) — mismo patrón que editar el título de un bloque: se
// ve como texto, doble click lo vuelve editable. adminSetExerciseField ya
// hace renderMain() al terminar de guardar, así que el texto se termina de
// actualizar solo con los datos frescos — acá solo hace falta mostrar el
// input al doble click.
function editAthleteDoneField(e) {
  e.stopPropagation();
  const wrap = e.currentTarget.closest('.done-field-wrap');
  if(!wrap) return;
  const span = wrap.querySelector('.done-field-txt');
  const inp = wrap.querySelector('.done-field-inp');
  if(!span || !inp) return;
  span.style.display = 'none';
  inp.style.display = 'inline-block';
  inp.focus(); inp.select();
}
window.editAthleteDoneField = editAthleteDoneField;

function saveAthleteDoneField(uid, week, sName, exId, field, unitLabel, inp) {
  const wrap = inp.closest('.done-field-wrap');
  if(wrap) {
    const span = wrap.querySelector('.done-field-txt');
    if(span) span.style.display = '';
  }
  inp.style.display = 'none';
  adminSetExerciseField(uid, week, sName, exId, field, inp.value);
}
window.saveAthleteDoneField = saveAthleteDoneField;

// Tabla de progresión semana×semana en horizontal: cada columna es una
// semana, cada fila una métrica (series/reps/%RM/intensidad/completó) —
// así se puede leer de un vistazo cómo progresa el plan y qué pasó
// realmente, sin tener que scrollear una lista vertical semana por semana.
function buildWeeklyProgressionTable(lastWeek, currentWeek, getWeekData, editCtx) {
  const weeks = Array.from({length:lastWeek}, (_,i)=>i+1);
  const rowsOf = weeks.map(w => getWeekData(w));
  const anyPct = rowsOf.some(r=>r.wp.pct);
  const anyNote = rowsOf.some(r=>r.wp.note);
  const head = weeks.map((w,i)=>`<th class="${w===currentWeek?'cur':''}">S${w}${w===currentWeek?' ·':''}</th>`).join('');
  const rowSeries = weeks.map((w,i)=>`<td class="${w===currentWeek?'cur':''}">${rowsOf[i].wp.series||'—'}</td>`).join('');
  const rowReps = weeks.map((w,i)=>`<td class="${w===currentWeek?'cur':''}">${rowsOf[i].wp.reps||'—'}</td>`).join('');
  const rowPct = weeks.map((w,i)=>`<td class="${w===currentWeek?'cur':''}">${rowsOf[i].wp.pct?rowsOf[i].wp.pct+'%':'—'}</td>`).join('');
  const rowInt = weeks.map((w,i)=>`<td class="${w===currentWeek?'cur':''}">${rowsOf[i].wp.rpe?(rowsOf[i].wp.intensityType||'RPE')+' '+rowsOf[i].wp.rpe:'—'}</td>`).join('');
  const rowDone = weeks.map((w,i)=>{
    const d = rowsOf[i].d, hasData = !!(d.load||d.rpe);
    const cls = hasData?'done-ok':(d.checked?'done-partial':'done-none');
    if (editCtx) {
      const base = `adminSetExerciseField('${editCtx.uid}',${w},'${editCtx.sName.replace(/'/g,"\\'")}','${editCtx.exId}'`;
      return `<td class="${w===currentWeek?'cur':''}"><div style="display:flex;gap:3px;justify-content:center;align-items:center">
        <input type="number" value="${d.load||''}" placeholder="kg" onchange="${base},'load',this.value)" style="width:44px;font-size:11.5px;text-align:center;background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:3px 2px;color:var(--text)">
        <input type="number" value="${d.rpe||''}" placeholder="${(rowsOf[i].wp.intensityType||'RPE').slice(0,3)}" onchange="${base},'rpe',this.value)" style="width:36px;font-size:11.5px;text-align:center;background:var(--bg3);border:1px solid var(--border2);border-radius:5px;padding:3px 2px;color:var(--text)">
      </div></td>`;
    }
    const txt = hasData ? (d.load?d.load+'kg':'')+(d.load&&d.rpe?' · ':'')+(d.rpe?(rowsOf[i].wp.intensityType||'RPE')+' '+d.rpe:'') : (d.checked?'✓ sin datos':'—');
    return `<td class="${w===currentWeek?'cur':''} ${cls}">${txt}</td>`;
  }).join('');
  const rowNote = anyNote ? `<tr><td>Nota</td>${weeks.map((w,i)=>`<td class="${w===currentWeek?'cur':''}" style="white-space:normal;max-width:140px;font-size:11.5px;color:var(--text3)">${rowsOf[i].wp.note||''}</td>`).join('')}</tr>` : '';
  const athleteNoteRows = rowsOf.map((r,i)=>r.d.athleteNote?`<div style="font-size:12px;color:var(--amber);margin-top:6px"><b>S${weeks[i]}:</b> 📝 ${r.d.athleteNote}</div>`:'').filter(Boolean).join('');
  return `<div class="prog-table-wrap"><table class="prog-table"><thead><tr><th>Semana</th>${head}</tr></thead><tbody>
    <tr><td>Series</td>${rowSeries}</tr>
    <tr><td>Reps</td>${rowReps}</tr>
    ${anyPct?`<tr><td>%RM</td>${rowPct}</tr>`:''}
    <tr><td>Intensidad</td>${rowInt}</tr>
    <tr><td>Completó</td>${rowDone}</tr>
    ${rowNote}
  </tbody></table></div>${athleteNoteRows?`<div style="margin-top:10px">${athleteNoteRows}</div>`:''}`;
}

function openProgressionModal(exId, exName) {
  const ex = findExInAssignedRoutine(exId);
  const routine = S.assignedRoutine;
  const durationWeeks = routine?.durationWeeks || 1;
  const lastWeek = Math.max(durationWeeks, S.currentWeek);
  document.getElementById('progression-modal-title').textContent = 'Progresión · ' + exName;
  const body = ex ? buildWeeklyProgressionTable(lastWeek, S.currentWeek, (w) => ({
    wp: getExPrescriptionForWeek(ex, w),
    d: (S.history[sessionKey(w,S.currentSession)]||{}).exercises?.[exId] || {}
  })) : '';
  document.getElementById('progression-modal-body').innerHTML = body || '<div style="padding:12px;color:var(--text3);font-size:13px">Sin datos de progresión.</div>';
  document.getElementById('progression-overlay').classList.add('open');
}
window.openProgressionModal = openProgressionModal;

// Versión ADMIN: ver todas las semanas de un ejercicio de UN atleta puntual
// (prescripto y completado), sin depender de la sesión propia del admin.
function openAdminProgressionModal(uid, exId, exName, sName) {
  const a = S.adminAthletes?.find(x=>x.uid===uid);
  if(!a) return;
  const routine = S.routines.find(r=>r.id===a.assignedRoutine);
  let ex = null;
  if(routine) {
    outer: for(const b of (routine.sessions?.[sName]||[])) {
      for(const cat of (b.categories||[])) {
        const found = (cat.exercises||[]).find(e=>e.id===exId);
        if(found) { ex = found; break outer; }
      }
    }
  }
  const durationWeeks = routine?.durationWeeks || 1;
  const athleteWeek = a.routineAssignedDate ? computeWeekFromDate(a.routineAssignedDate) : (a._personal?.startDate ? computeWeekFromDate(a._personal.startDate) : 1);
  const lastWeek = Math.max(durationWeeks, athleteWeek);
  document.getElementById('progression-modal-title').textContent = 'Progresión · ' + exName;
  const body = ex ? buildWeeklyProgressionTable(lastWeek, athleteWeek, (w) => ({
    wp: getExPrescriptionForWeek(ex, w),
    d: a._personal?.history?.[sessionKey(w,sName)]?.exercises?.[exId] || {}
  }), {uid:a.uid, sName, exId}) : '';
  document.getElementById('progression-modal-body').innerHTML = body || '<div style="padding:12px;color:var(--text3);font-size:13px">Sin datos de progresión.</div>';
  document.getElementById('progression-overlay').classList.add('open');
}
window.openAdminProgressionModal = openAdminProgressionModal;

function closeProgressionModal() { document.getElementById('progression-overlay').classList.remove('open'); }
window.closeProgressionModal = closeProgressionModal;
function closeProgressionIfOutside(e) { if(e.target===document.getElementById('progression-overlay')) closeProgressionModal(); }
window.closeProgressionIfOutside = closeProgressionIfOutside;

function saveVideoUrl() {
  if(!S.videoEditable) return; // el atleta no puede guardar aunque manipule el DOM
  const url=document.getElementById('video-url-inp').value.trim();
  if(S.videoTarget) {
    if(url) S.videos[S.videoTarget]=url; else delete S.videos[S.videoTarget];
    scheduleSave();
    document.querySelectorAll(`[data-videokey="${S.videoTarget}"]`).forEach(btn=>btn.classList.toggle('has-video',!!url));
    showToast(url?'▶ Video guardado':'Video eliminado');
    const embed=getYouTubeEmbedUrl(url);
    document.getElementById('video-preview-frame').src=embed||'';
    document.getElementById('video-preview-wrap').style.display=embed?'block':'none';
    document.getElementById('video-clear-btn').style.display=url?'inline-block':'none';
  }
}
window.saveVideoUrl=saveVideoUrl;

function clearVideoUrl() {
  document.getElementById('video-url-inp').value='';
  document.getElementById('video-clear-btn').style.display='none';
  document.getElementById('video-preview-frame').src='';
  document.getElementById('video-preview-wrap').style.display='none';
}
window.clearVideoUrl=clearVideoUrl;

// ── WELLNESS ──────────────────────────────────────────────────
const WELLNESS_BACKFILL_DAYS = 13; // hasta 2 semanas atrás para completar días salteados

// Tira de 7 días (hoy + los 6 anteriores) para saltar directo a un día —
// marca con color qué días ya tienen wellness enviado, cuáles están a medio
// completar y cuáles están vacíos, para no depender solo de una flecha ‹ ›
// sin ninguna señal visual de qué días faltan.
function renderWellnessDayStrip(wKey) {
  const today = todayLocal();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ key: toLocalDateStr(d), dow: d.toLocaleDateString('es-AR', { weekday: 'narrow' }), num: d.getDate() });
  }
  const cells = days.map(d => {
    const rec = S.wellness[d.key];
    const submitted = !!(rec && rec.submitted);
    const partial = !!(rec && !submitted && Object.keys(rec).length);
    const isSel = d.key === wKey;
    const bg = submitted ? 'var(--green)' : partial ? 'var(--amber)' : 'var(--bg3)';
    const fg = (submitted || partial) ? '#fff' : 'var(--text3)';
    const border = isSel ? 'var(--accent)' : 'var(--border2)';
    return `<div onclick="goToWellnessDate('${d.key}')" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;min-width:0">
      <div style="font-size:9px;font-weight:700;color:var(--text3);text-transform:uppercase">${d.dow}</div>
      <div style="width:100%;aspect-ratio:1;max-width:38px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:${isSel ? '2px' : '1px'} solid ${border};transition:all .15s">${d.num}</div>
    </div>`;
  }).join('');
  return `<div style="display:flex;gap:5px;margin-bottom:10px">${cells}</div>`;
}
function goToWellnessDate(key) {
  // null = "día efectivo por defecto" (ver getEffectiveTodayDate) — si
  // colapsara contra el HOY real durante el corte de madrugada, tocar el
  // día de hoy en la tira lo mandaría de nuevo a ayer en el próximo render.
  S.wellnessViewDate = (key === getEffectiveTodayDate()) ? null : key;
  renderMain();
}
window.goToWellnessDate = goToWellnessDate;

function shiftWellnessDate(delta) {
  const today=todayLocal();
  const base=S.wellnessViewDate||getEffectiveTodayDate();
  const d=new Date(base+'T00:00:00');
  d.setDate(d.getDate()+delta);
  const newDate=toLocalDateStr(d);
  if(newDate>today) return;
  const minD=new Date(); minD.setDate(minD.getDate()-WELLNESS_BACKFILL_DAYS);
  if(newDate<toLocalDateStr(minD)) return;
  // null significa "usar el día efectivo por defecto" — así que solo se
  // puede colapsar a null cuando aterrizás justo en ese día efectivo, nunca
  // en el "hoy" real si todavía es antes del corte de madrugada (si no, la
  // próxima vez que se recalcule volvería a caer en ayer, no en donde estás).
  S.wellnessViewDate=(newDate===getEffectiveTodayDate())?null:newDate;
  renderMain();
}
window.shiftWellnessDate=shiftWellnessDate;

// Este SIEMPRE lleva al día calendario real, incluso durante el corte de
// madrugada donde el default es "ayer" — es el override explícito para
// quien de verdad quiere cargar algo del día de hoy antes de las 5am.
function goToTodayWellness() { S.wellnessViewDate=todayLocal(); renderMain(); }
window.goToTodayWellness=goToTodayWellness;

function renderLoadItemRow(act, wKey, sport) {
  const existing=getLoadLog(act.key,wKey);
  const draft=(S.loadDraft?.[wKey]?.[act.key]) || (existing?{mins:existing.mins,rpe:existing.rpe,note:existing.note||''}:{mins:'',rpe:0,note:''});
  const ua=(draft.mins&&draft.rpe)?draft.mins*draft.rpe:0;
  const display = getLoadActivityDisplay(act, sport);
  // Marcaron el RPE (tocar un puntito es rápido y llamativo) pero se
  // olvidan de los minutos (un campo de texto chico, fácil de saltear) — se
  // perdía la carga entera en silencio. Esto lo resalta ANTES de guardar.
  const missingMins = draft.rpe>0 && !draft.mins;
  return `<div class="load-item">
    <div class="load-item-label"><span>${display.emoji}</span><span>${display.label}</span></div>
    ${act.isGame?`<input type="text" maxlength="60" class="load-mins-inp" style="width:100%;text-align:left;margin-bottom:8px" placeholder="Rival / categoría (opcional, ej: vs Club X — Juvenil)" value="${draft.note||''}" onblur="updateLoadDraft('${wKey}','${act.key}','note',this.value)">`:''}
    <div class="load-item-row">
      <input type="number" min="0" max="300" id="load-mins-${wKey}-${act.key}" class="load-mins-inp" placeholder="⬅ Minutos (obligatorio)" style="${missingMins?'border:2px solid var(--red);background:var(--red-dim)':''}" value="${draft.mins||''}" oninput="updateLoadDraft('${wKey}','${act.key}','mins',this.value)">
      <div class="load-rpe-scale">
        ${Array.from({length:11},(_,i)=>i).map(v=>{
          const color=v===0?'var(--text3)':`hsl(${Math.round((10-v)/10*120)},65%,45%)`;
          return `<div class="load-rpe-dot ${draft.rpe===v?'sel':''}" style="${draft.rpe===v?`background:${color}`:''}" onclick="updateLoadDraft('${wKey}','${act.key}','rpe',${v})" title="RPE ${v}">${v}</div>`;
        }).join('')}
      </div>
    </div>
    <div id="load-mins-warn-${wKey}-${act.key}" style="font-size:11px;color:var(--red);font-weight:600;margin-top:2px;${missingMins?'':'display:none'}">⚠ Falta poner los minutos — sin eso, no se guarda esta actividad</div>
    ${ua?`<div class="load-ua-preview" id="load-ua-preview-${wKey}-${act.key}">${draft.mins} min × RPE ${draft.rpe} = ${ua} UA</div>`:`<div class="load-ua-preview" id="load-ua-preview-${wKey}-${act.key}" style="display:none"></div>`}
  </div>`;
}
window.renderLoadItemRow = renderLoadItemRow;

// Mostrar/ocultar el segundo Gimnasio (entrenamiento individual fuera del
// club) — queda a criterio del atleta, arranca oculto salvo que ya tenga
// datos cargados ese día.
function toggleExtraGym() {
  S.showExtraGym = !S.showExtraGym;
  renderMain();
}
window.toggleExtraGym = toggleExtraGym;

function renderWellness() {
  const today=todayLocal();
  const wKey=S.wellnessViewDate||getEffectiveTodayDate();
  const isToday=wKey===today;
  if(!S.wellness[wKey]) S.wellness[wKey]={};
  const w=S.wellness[wKey];

  const {pct, allFilled} = getWellnessScore(w);
  const wState = getWellnessState(allFilled?pct:null);

  const isDesktop = window.innerWidth >= 900;

  const minAllowed=(()=>{const d=new Date();d.setDate(d.getDate()-WELLNESS_BACKFILL_DAYS);return toLocalDateStr(d);})();
  const canGoBack=wKey>minAllowed, canGoForward=wKey<today;
  const fullDateStr=new Date(wKey+'T00:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  const dateLabel=isToday?`Hoy - ${fullDateStr}`:fullDateStr;

  // Desktop: two-column layout. Mobile: stacked.
  let html = `<div class="page-header">
    <div class="page-title">Wellness</div>
    <div class="page-subtitle">${wKey} · Check-in diario</div>
  </div>
  <div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);padding:10px 12px 8px;margin-bottom:14px">
  ${renderWellnessDayStrip(wKey)}
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:6px;border-top:1px solid var(--border)">
    <button class="abtn" onclick="shiftWellnessDate(-1)" ${canGoBack?'':'disabled style="opacity:.3;cursor:not-allowed"'}>‹</button>
    <div style="text-align:center">
      <div style="font-size:14px;font-weight:700;text-transform:capitalize">${dateLabel}</div>
      ${!isToday?`<div style="font-size:11px;color:var(--accent-text);cursor:pointer" onclick="goToTodayWellness()">Volver a hoy →</div>`:''}
    </div>
    <button class="abtn" onclick="shiftWellnessDate(1)" ${canGoForward?'':'disabled style="opacity:.3;cursor:not-allowed"'}>›</button>
  </div>
  </div>`;

  html += renderIllnessSection();
  html += renderInjuryFollowup();

  if(isDesktop) {
    // Desktop: Hooper left, body map right
    html += `<div style="display:grid;grid-template-columns:1fr 380px;gap:20px;align-items:start">
      <div>`;
  }

  // Wellness card
  html += `<div class="wellness-card">
    <div class="wellness-title">${isToday?'¿Cómo estás hoy?':'¿Cómo estuviste ese día?'}</div>
    <div class="wellness-sub">Tocá la opción que mejor te describe en cada ítem</div>`;

  WELLNESS_ITEMS.forEach(item=>{
    const val=w[item.key]||0;
    const selOpt=item.options.find(o=>o.v===val);
    const selColor = val ? `hsl(${Math.round((val-1)/4*120)},65%,45%)` : 'var(--text3)';
    html+=`<div class="hooper-item">
      <div class="hooper-label">
        <span>${item.label}</span>
        <span style="color:${selColor};font-size:12px;font-weight:700">${selOpt?selOpt.label:'—'}</span>
      </div>
      <div class="hooper-scale">
        ${item.options.map(o=>{
          const color=`hsl(${Math.round((o.v-1)/4*120)},65%,45%)`;
          return `<div class="hooper-dot ${val===o.v?'sel':''}" style="${val===o.v?`background:${color}`:''}" onclick="setHooper('${wKey}','${item.key}',${o.v})" title="${o.label}">${o.emoji}</div>`;
        }).join('')}
      </div>
    </div>`;
  });

  // Sueño: horas reales, no una calificación subjetiva
  const hours = w.sueño_horas!==undefined && w.sueño_horas!==null && w.sueño_horas!=='' ? +w.sueño_horas : null;
  const sleepCat = sleepHoursCategory(hours);
  const sleepPct = hours!==null ? Math.round((hours/12)*100) : 0;
  html+=`<div class="hooper-item">
    <div class="hooper-label">
      <span>Horas de sueño</span>
      <span style="color:${sleepCat?sleepCat.color:'var(--text3)'};font-size:12px;font-weight:700">${hours!==null?`${hours}h · ${sleepCat.label}`:'—'}</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin:4px 0 2px">
      <span style="font-size:10px;color:var(--text3);white-space:nowrap">0h</span>
      <input type="range" min="0" max="12" step="0.5" value="${hours||0}"
        style="flex:1;-webkit-appearance:none;height:6px;border-radius:3px;outline:none;cursor:pointer;accent-color:${sleepCat?sleepCat.color:'var(--border2)'};background:linear-gradient(to right,${sleepCat?sleepCat.color:'var(--border2)'} ${sleepPct}%,var(--bg3) ${sleepPct}%)"
        oninput="updateSleepHoursLive(this)" onchange="updateSleepHours('${wKey}',this)">
      <span style="font-size:10px;color:var(--text3);white-space:nowrap">12h+</span>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:2px">0-3h insuficiente · 4-5h poco · 6-7h suficiente · 8h+ excelente</div>
  </div>`;

  html+=`<div id="wellness-score-section-${wKey}">
  <div class="hooper-score-box">
    <div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Score de hoy</div>
      <div class="hooper-score-val" style="color:${wState.color}" ${allFilled?`data-countup="${pct}" data-suffix="%"`:''}>${allFilled?pct+'%':'—'}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">≥75% bien · ≥50% normal · &lt;50% fatigado</div>
    </div>
    <div style="text-align:right">
      <div class="hooper-score-label" style="color:${wState.color};font-weight:700">${allFilled?wState.label:'Completá todos los ítems'}</div>
    </div>
  </div>
  ${allFilled?`<button class="wellness-submit" onclick="submitWellness('${wKey}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Guardar registro${isToday?' de hoy':''}</button>`:''}
  </div>
  </div>`;

  // Carga del día: Gimnasio / Pelota / Partido — siempre disponible, tenga o no
  // rutina cargada. Alimenta directamente el cálculo de ACWR/monotonía/strain.
  // Usa wKey (la fecha que se esté viendo), no necesariamente hoy.
  html += `<div class="wellness-card">
    <div class="wellness-title">${isToday?'Carga de hoy':'Carga de ese día'}</div>
    <div class="wellness-sub">Cargá minutos y RPE de cada actividad (las que no correspondan, dejalas en blanco)</div>`;

  LOAD_ACTIVITIES.forEach(act=>{
    if(act.isExtraGym) return; // se muestra aparte, como desplegable, justo después de Gimnasio
    html += renderLoadItemRow(act, wKey, S.userData?.sport);
    if(act.key==='gimnasio') {
      const extraAct = LOAD_ACTIVITIES.find(a=>a.key==='gimnasio2');
      const hasExtraData = !!getLoadLog('gimnasio2', wKey);
      const showExtra = S.showExtraGym || hasExtraData;
      html += showExtra
        ? `<div style="position:relative">
             <button class="abtn" style="position:absolute;top:8px;right:0;font-size:11px;z-index:1" onclick="toggleExtraGym()">Ocultar</button>
             ${renderLoadItemRow(extraAct, wKey, S.userData?.sport)}
           </div>`
        : `<div style="text-align:center;padding:2px 0 12px">
             <button class="abtn" style="font-size:12px" onclick="toggleExtraGym()">+ Agregar entrenamiento individual (fuera del club)</button>
           </div>`;
    }
  });

  html += `<button class="wellness-submit" style="margin-top:12px" onclick="saveLoadLog('${wKey}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Guardar carga${isToday?' de hoy':' de ese día'}</button>
  </div>`;

  if(isDesktop) {
    html += `</div><div>`; // close left col, open right col
  }

  // Body map card — fixed size, never full width
  html+=`<div class="wellness-card">
    <div class="wellness-title">Mapa de molestias</div>
    <div class="wellness-sub">Tocá la zona donde sentís molestia</div>
    <div class="body-map-wrap">
      <div class="body-svg-wrap">
        <div class="body-svg-label">Frente</div>
        ${renderBodySVG('front')}
      </div>
      <div class="body-svg-wrap">
        <div class="body-svg-label">Espalda</div>
        ${renderBodySVG('back')}
      </div>
    </div>
    ${S.selectedZone ? renderZoneDetail() : ''}
    ${renderInjuryList()}
  </div>`;

  if(isDesktop) {
    html += `</div></div>`; // close right col + grid
  }

  return html;
}

function renderBodySVG(side) {
  const zones=BODY_ZONES[side];
  const shapes=zones.map(z=>{
    const inj=S.injuries[z.id];
    let cls='body-zone';
    if(inj && inj.pain>0) { cls+= inj.severity==='grave'?' sel-high':inj.severity==='moderada'?' sel-med':' sel-low'; }
    if(S.selectedZone===z.id) cls+=' is-selected';
    const click=`onclick="selectZone('${z.id}')"`;
    const tip=`<title>${z.label}</title>`;
    if(z.type==='circle') {
      return `<circle class="${cls}" cx="${z.cx}" cy="${z.cy}" r="${z.r}" ${click}>${tip}</circle>`;
    } else {
      return `<ellipse class="${cls}" cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" ${click}>${tip}</ellipse>`;
    }
  }).join('');
  return `<svg viewBox="0 0 200 335" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:320px">${shapes}</svg>`;
}

function renderZoneDetail() {
  const zid=S.selectedZone;
  const allZones=[...BODY_ZONES.front,...BODY_ZONES.back];
  const zone=allZones.find(z=>z.id===zid); if(!zone) return '';
  const inj=S.injuries[zid]||{pain:0,note:'',type:'',severity:'',isInjury:false,history:[]};
  const painBtns=Array.from({length:11},(_,i)=>{
    const cls=inj.pain===i?(i>=8?'pain-btn p-high':i>=4?'pain-btn p-med':'pain-btn p-low'):'pain-btn';
    return `<button class="${cls}" onclick="setPain('${zid}',${i})">${i}</button>`;
  }).join('');
  const typeBtns=Object.entries(INJURY_TYPES).map(([k,label])=>{
    const active=inj.type===k;
    return `<button onclick="setInjuryType('${zid}','${k}')" style="flex:1;padding:8px;border-radius:var(--rsm);border:1px solid ${active?'var(--accent)':'var(--border2)'};background:${active?'var(--bg3)':'transparent'};color:${active?'var(--text)':'var(--text3)'};font-size:12px;cursor:pointer">${label}</button>`;
  }).join('');
  const sevBtns=SEVERITY_LEVELS.map(s=>{
    const active=(inj.severity||'')===s.id;
    return `<button onclick="setInjurySeverity('${zid}','${s.id}')" style="flex:1;padding:8px;border-radius:var(--rsm);border:1px solid ${active?s.color:'var(--border2)'};background:${active?s.color+'1a':'transparent'};color:${active?s.color:'var(--text3)'};font-weight:${active?'700':'400'};font-size:12px;cursor:pointer">${s.label}</button>`;
  }).join('');
  const isInjury = inj.isInjury===true;
  const isExisting = !!S.injuries[zid];
  return `<div class="zone-detail">
    <div class="zone-detail-title">${zone.label}
      <span class="zone-close" onclick="S.selectedZone=null;renderMain()">×</span>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">¿Qué es esto? — una molestia solo se ve dentro de tu equipo; una lesión también entra en las alertas del entrenador</div>
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <button onclick="setIsInjury('${zid}',false)" style="flex:1;padding:8px;border-radius:var(--rsm);border:1px solid ${!isInjury?'var(--accent)':'var(--border2)'};background:${!isInjury?'var(--bg3)':'transparent'};color:${!isInjury?'var(--text)':'var(--text3)'};font-weight:${!isInjury?'700':'400'};font-size:12px;cursor:pointer">Molestia</button>
      <button onclick="setIsInjury('${zid}',true)" style="flex:1;padding:8px;border-radius:var(--rsm);border:1px solid ${isInjury?'var(--red)':'var(--border2)'};background:${isInjury?'var(--red-dim)':'transparent'};color:${isInjury?'var(--red)':'var(--text3)'};font-weight:${isInjury?'700':'400'};font-size:12px;cursor:pointer">Lesión (esguince, edema, luxación...)</button>
    </div>
    ${isInjury?`
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Tipo de lesión</div>
    <div style="display:flex;gap:6px;margin-bottom:10px">${typeBtns}</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Gravedad — esto lo evalúa tu entrenador, marcá lo que te haya dicho (o dejalo en "Leve" si es algo nuevo/sin evaluar)</div>
    <div style="display:flex;gap:6px;margin-bottom:10px">${sevBtns}</div>
    `:''}
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Dolor de HOY 0–10</div>
    <div class="pain-scale" style="display:flex;gap:4px;margin:8px 0;flex-wrap:wrap">${painBtns}</div>
    <div style="font-size:12px;color:var(--text3);margin:14px 0 8px;padding-top:10px;border-top:1px dashed var(--border)">Cuestionario rápido (4 preguntas — te ayuda a vos y a tu entrenador a ver cómo te está afectando de verdad, no solo cuánto duele)</div>
    ${OSTRC_QUESTIONS.map(q=>{
      const cur = inj.ostrc?.[q.id];
      const opts = q.options.map(o=>`<button onclick="setOstrcAnswer('${zid}','${q.id}',${o.v})" style="flex:1;min-width:70px;padding:6px 4px;border-radius:var(--rxs);border:1px solid ${cur===o.v?'var(--accent)':'var(--border2)'};background:${cur===o.v?'var(--accent-dim)':'transparent'};color:${cur===o.v?'var(--accent)':'var(--text3)'};font-weight:${cur===o.v?'700':'400'};font-size:10.5px;cursor:pointer">${o.label}</button>`).join('');
      return `<div style="margin-bottom:10px">
        <div style="font-size:11.5px;color:var(--text3);margin-bottom:5px">${q.label}</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${opts}</div>
      </div>`;
    }).join('')}
    ${(()=>{ const sc=ostrcTotal(inj); return sc!=null?`<div style="font-size:12px;font-weight:700;color:var(--accent-text);margin-bottom:10px">Puntaje: ${sc}/100</div>`:''; })()}
    <textarea class="pain-note-inp" placeholder="Observaciones..." onchange="setPainNote('${zid}',this.value)">${inj.note||''}</textarea>
    ${renderInjuryStudies(zid, inj)}
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="wellness-submit" style="flex:2" onclick="saveInjury('${zid}')">Guardar ${isInjury?'lesión':'molestia'}</button>
      ${isExisting?`<button style="flex:1;background:transparent;border:1px solid var(--red);color:var(--red);border-radius:var(--rsm);cursor:pointer;font-size:13px" onclick="removeInjury('${zid}')">Quitar</button>`:''}
    </div>
  </div>`;
}

function renderInjuryList() {
  const allZones=[...BODY_ZONES.front,...BODY_ZONES.back];
  const active=Object.entries(S.injuries).filter(([,v])=>v.pain>0);
  const activeHtml = !active.length
    ? `<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px">Sin molestias activas</div>`
    : `<div class="injury-list">${active.map(([id,inj])=>{
        const zone=allZones.find(z=>z.id===id);
        const sev = severityInfo(inj.severity) || severityInfo('leve');
        const col = sev.color;
        const typeLbl=inj.type?INJURY_TYPES[inj.type]:'';
        const trend = getInjuryTrend(inj);
        return `<div class="injury-item" style="cursor:pointer" onclick="openPainTrendModal('self','${id}')" title="Tocá para ver la progresión">
          <div class="injury-dot" style="background:${col}"></div>
          <div class="injury-info">
            <div class="injury-zone">${zone?.label||id}${typeLbl?` · ${typeLbl}`:''} · <span style="color:${col};font-weight:700">${sev.label}</span></div>
            <div class="injury-pain">Dolor de hoy: ${inj.pain}/10${inj.note?' · '+inj.note.slice(0,30):''}</div>
            ${isRealInjury(inj)&&inj.rtpPhase?`<div style="font-size:11px;color:var(--accent-text);font-weight:600;margin-top:2px">🩹 En recuperación · ${rtpPhaseInfo(inj.rtpPhase)?.label||''}</div>`:''}
          </div>
          ${trend?`<div class="injury-trend" style="color:${trend.color};font-weight:800;font-size:15px">${trend.arrow}</div>`:''}
        </div>`;
      }).join('')}</div>`;
  return activeHtml + renderResolvedInjuries();
}

// Lista compacta de lesiones ya resueltas (archivadas). No es el reporte
// final para el club — eso vive en la futura sección de Estadísticas de
// Equipos — pero evita que el dato quede invisible mientras tanto.
function renderResolvedInjuries() {
  const arch = S.injuryArchive||[];
  if(!arch.length) return '';
  const sorted = [...arch].sort((a,b)=> (b.resolvedDate||'').localeCompare(a.resolvedDate||''));
  return `<div style="margin-top:10px">
    <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;padding:8px 0 4px">Historial (resueltas)</div>
    ${sorted.map(r=>{
      const typeLbl = r.type?INJURY_TYPES[r.type]:'';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-top:1px solid var(--border);font-size:12px">
        <div>
          <div style="font-weight:600">${r.zoneLabel}${typeLbl?` · ${typeLbl}`:''}</div>
          <div style="color:var(--text3)">${r.startDate} → ${r.resolvedDate} · pico ${r.peakPain}/10</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}
window.renderResolvedInjuries=renderResolvedInjuries;

// ── ESTUDIOS MÉDICOS (resonancia, placa, etc.) — SIEMPRE opcional, nunca
// obligatorio para registrar una lesión/molestia. No hay almacenamiento de
// archivos conectado en esta app (no hay Firebase Storage ni similar), así
// que se guarda como imagen comprimida directo en el documento, igual que el
// escudo del rival del calendario — por eso el límite de tamaño.
function addInjuryStudy(zid, input) {
  const file = input.files[0];
  if(!file) return;
  const finish = (dataUrl) => {
    if(dataUrl.length > 900000) { showToast('El archivo es muy pesado (máx. ~700KB) — probá con una foto más chica o más comprimida'); return; }
    if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',severity:'',isInjury:false,history:[]};
    if(!S.injuries[zid].studies) S.injuries[zid].studies=[];
    S.injuries[zid].studies.push({id:genId(), name:file.name, type:file.type, url:dataUrl, uploadedAt:todayLocal()});
    markInjuryDirty(zid);
    scheduleSave();
    showToast('✓ Estudio agregado');
    renderMain();
  };
  readStudyFile(file, finish);
}
window.addInjuryStudy = addInjuryStudy;

function removeInjuryStudy(zid, studyId) {
  if(!S.injuries[zid]?.studies) return;
  S.injuries[zid].studies = S.injuries[zid].studies.filter(s=>s.id!==studyId);
  markInjuryDirty(zid);
  scheduleSave();
  renderMain();
}
window.removeInjuryStudy = removeInjuryStudy;

// Comparte la lógica de lectura/compresión entre el lado atleta y el lado
// admin — si es imagen, la reduce a un lado máximo razonable para que se
// pueda leer una placa/resonancia (no la mini miniatura de un escudo);
// si es otro tipo de archivo (ej. PDF), la manda tal cual con el mismo tope
// de tamaño.
function readStudyFile(file, cb) {
  const isImage = file.type.startsWith('image/');
  const reader = new FileReader();
  if(isImage) {
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1100;
        const scale = Math.min(1, maxSide/Math.max(img.width,img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width*scale); canvas.height = Math.round(img.height*scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = e.target.result;
    };
  } else {
    reader.onload = (e) => cb(e.target.result);
  }
  reader.readAsDataURL(file);
}

async function adminAddInjuryStudy(uid, zoneId, input) {
  const file = input.files[0];
  if(!file) return;
  const personal = S.viewingAthlete?.uid===uid ? S.viewingAthlete.personal : null;
  if(!personal || !personal.injuries || !personal.injuries[zoneId]) return;
  readStudyFile(file, async (dataUrl) => {
    if(dataUrl.length > 900000) { showToast('El archivo es muy pesado (máx. ~700KB) — probá con una foto más chica o más comprimida'); return; }
    try {
      let zone = await fetchFreshInjuryZone(uid, zoneId);
      if(zone===null) zone = {...personal.injuries[zoneId]};
      if(!zone.studies) zone.studies=[];
      zone.studies.push({id:genId(), name:file.name, type:file.type, url:dataUrl, uploadedAt:todayLocal()});
      await updateDocSafe(doc(db,'personal',uid), {[`injuries.${zoneId}`]: zone});
      personal.injuries[zoneId] = zone;
      showToast('✓ Estudio agregado');
      renderMain();
    } catch(e) { showToast('Error al guardar'); }
  });
}
window.adminAddInjuryStudy = adminAddInjuryStudy;

async function adminRemoveInjuryStudy(uid, zoneId, studyId) {
  const personal = S.viewingAthlete?.uid===uid ? S.viewingAthlete.personal : null;
  if(!personal?.injuries?.[zoneId]) return;
  try {
    let zone = await fetchFreshInjuryZone(uid, zoneId);
    if(zone===null) zone = {...personal.injuries[zoneId]};
    zone.studies = (zone.studies||[]).filter(s=>s.id!==studyId);
    await updateDocSafe(doc(db,'personal',uid), {[`injuries.${zoneId}`]: zone});
    personal.injuries[zoneId] = zone;
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.adminRemoveInjuryStudy = adminRemoveInjuryStudy;

// ownerUid: pasar el uid del atleta cuando lo renderiza el ADMIN desde la
// ficha de otro atleta; dejar vacío/omitir para el propio atleta (self).
function renderInjuryStudies(zid, inj, ownerUid) {
  const studies = inj.studies||[];
  const isAdmin = !!ownerUid;
  const addFn = isAdmin ? `adminAddInjuryStudy('${ownerUid}','${zid}',this)` : `addInjuryStudy('${zid}',this)`;
  const rmFn = (sid) => isAdmin ? `adminRemoveInjuryStudy('${ownerUid}','${zid}','${sid}')` : `removeInjuryStudy('${zid}','${sid}')`;
  return `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Estudios (resonancia, placa, etc.) — opcional</div>
    ${studies.length?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">${studies.map(s=>`
      <div style="position:relative">
        ${(s.type||'').startsWith('image/')
          ? `<img src="${s.url}" onclick="window.open('${s.url}','_blank')" style="width:64px;height:64px;object-fit:cover;border-radius:var(--rxs);border:1px solid var(--border2);cursor:pointer">`
          : `<a href="${s.url}" target="_blank" style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;border-radius:var(--rxs);border:1px solid var(--border2);background:var(--bg3);font-size:10px;text-align:center;padding:4px;color:var(--text3);text-decoration:none;overflow:hidden">${(s.name||'Archivo').slice(0,16)}</a>`}
        <span onclick="${rmFn(s.id)}" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:var(--red);color:#fff;font-size:12px;line-height:18px;text-align:center;cursor:pointer">×</span>
      </div>`).join('')}</div>`:''}
    <label class="abtn" style="cursor:pointer;font-size:11px;display:inline-block">+ Subir estudio<input type="file" accept="image/*,.pdf" style="display:none" onchange="${addFn}"></label>
  </div>`;
}
window.renderInjuryStudies = renderInjuryStudies;

function getRPEColor(v) {
  if(v<=3) return '#34c97a';
  if(v<=6) return '#f0a030';
  if(v<=8) return '#e05030';
  return '#3b7dd8';
}
window.getRPEColor=getRPEColor;

// RPE y RIR van en escalas OPUESTAS: en RPE, un número alto es más esfuerzo
// (rojo); en RIR, un número BAJO es más esfuerzo (menos repeticiones en
// reserva = más cerca del fallo). Usar getRPEColor tal cual para un valor de
// RIR pintaría un 1 (casi al fallo) de verde, como si fuera fácil — al revés
// de lo que es.
function getIntensityColor(v, type) {
  if (type === 'RIR') {
    if (v<=1) return '#e05030';
    if (v<=3) return '#f0a030';
    return '#34c97a';
  }
  return getRPEColor(v);
}
window.getIntensityColor = getIntensityColor;

function updateUAPreview() {
  const rpe = parseInt(document.getElementById('sf-rpe')?.value||'0');
  const mins = parseInt(document.getElementById('sf-mins')?.value||'0');
  const preview = document.getElementById('sf-ua-preview');
  if(preview && rpe && mins) {
    preview.textContent = `UA estimadas: ${rpe * mins}`;
    preview.style.color = 'var(--accent)';
  } else if(preview) {
    preview.textContent = '';
  }
}
window.updateUAPreview=updateUAPreview;

// Recalcula y refresca SOLO la caja de score + botón de guardar — se usa
// en vez de un renderMain() completo cuando el cambio viene de un slider en
// pleno arrastre (el slider de horas de sueño), porque un re-render entero
// reconstruye el <input type="range"> a mitad de gesto y el arrastre se
// siente trabado/roto en el celular.
function refreshWellnessScoreSection(wKey) {
  const w = S.wellness[wKey] || {};
  const {pct, allFilled} = getWellnessScore(w);
  const wState = getWellnessState(allFilled?pct:null);
  const isToday = wKey === todayLocal();
  const el = document.getElementById(`wellness-score-section-${wKey}`);
  if(!el) return;
  el.innerHTML = `
    <div class="hooper-score-box">
      <div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Score de hoy ${infoBtn('wellness')}</div>
        <div class="hooper-score-val" style="color:${wState.color}" ${allFilled?`data-countup="${pct}" data-suffix="%"`:''}>${allFilled?pct+'%':'—'}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">≥75% bien · ≥50% normal · &lt;50% fatigado</div>
      </div>
      <div style="text-align:right">
        <div class="hooper-score-label" style="color:${wState.color};font-weight:700">${allFilled?wState.label:'Completá todos los ítems'}</div>
      </div>
    </div>
    ${allFilled?`<button class="wellness-submit" onclick="submitWellness('${wKey}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Guardar registro${isToday?' de hoy':''}</button>`:''}
  `;
  if(allFilled) runCountUps();
}
window.refreshWellnessScoreSection = refreshWellnessScoreSection;

// Mientras se arrastra (oninput, dispara en CADA tick del gesto) solo se
// toca la barra y su propia etiqueta — nada más en la pantalla se mueve.
// Antes esto también reescribía la caja de score/botón "Guardar" en cada
// tick (refreshWellnessScoreSection), y como ese botón aparece/desaparece
// según si el wellness quedó completo, la pantalla se corría de golpe justo
// en medio del arrastre — al soltar el dedo, el toque cae sobre lo que
// quedó debajo (otra pestaña, otro botón) en vez de nada. La actualización
// "pesada" (guardar el valor, refrescar el score/botón) ahora pasa solo al
// SOLTAR (onchange), cuando el gesto ya terminó y mover contenido no molesta.
function updateSleepHoursLive(input) {
  const h=+input.value;
  const cat=sleepHoursCategory(h);
  const pct=Math.round((h/12)*100);
  input.style.background=`linear-gradient(to right,${cat.color} ${pct}%,var(--bg3) ${pct}%)`;
  input.style.accentColor=cat.color;
  const wrap=input.closest('.hooper-item');
  if(wrap){const sp=wrap.querySelector('.hooper-label span:last-child');if(sp){sp.textContent=`${h}h · ${cat.label}`;sp.style.color=cat.color;}}
}
window.updateSleepHoursLive=updateSleepHoursLive;

function updateSleepHours(wKey,input) {
  const h=+input.value;
  updateSleepHoursLive(input);
  if(!S.wellness[wKey]) S.wellness[wKey]={};
  S.wellness[wKey]['sueño_horas']=h;
  markWellnessDirty(wKey);
  scheduleSave();
  refreshWellnessScoreSection(wKey);
}
window.updateSleepHours=updateSleepHours;

function setHooper(wKey,key,val) {
  if(!S.wellness[wKey]) S.wellness[wKey]={};
  S.wellness[wKey][key]=val;
  markWellnessDirty(wKey);
  scheduleSave(); renderMain();
}
window.setHooper=setHooper;

async function submitWellness(wKey) {
  // Si es el wellness de HOY y hay una molestia activa sin puntuar hoy, no
  // se deja terminar sin pasar por ahí primero — antes era fácil completar
  // el wellness de siempre y saltearse esto sin darse cuenta.
  if(wKey===todayLocal() && hasPendingInjuryFollowup()) {
    showToast('Antes de guardar, puntuá tu dolor de hoy más arriba ↑');
    document.getElementById('injury-followup-section')?.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  S.wellness[wKey].date=wKey; S.wellness[wKey].submitted=true;
  markWellnessDirty(wKey);
  showToast('Guardando…');
  const ok = await saveNow();
  showToast(ok ? '✓ Wellness de hoy guardado' : 'No se pudo guardar — revisá tu conexión y volvé a intentar');
  const main=document.getElementById('main');
  if(main) main.scrollTo({top:0,behavior:'smooth'});
  renderMain();
}
window.submitWellness=submitWellness;

// Antes de dejar tocar el dolor de una zona, chequeamos UNA vez por sesión
// si el servidor la tiene activa de verdad. Un celular con la app abierta
// (o suspendida en segundo plano) por horas puede seguir teniendo en
// memoria una molestia YA resuelta (pain llegó a 0, se archivó) con su
// historial viejo — si el atleta vuelve a marcar dolor en esa MISMA zona
// sin este chequeo, ese historial viejo se seguía extendiendo con la fecha
// de hoy: quedaba mezclado el dolor de una molestia vieja con el de una
// nueva, y por eso parecía "viene doliendo hace días" cuando era recién de
// hoy. Si el servidor no tiene nada para esa zona, arrancamos de cero acá
// también.
async function reconcileInjuryZoneOnce(zid) {
  if(!S._reconciledInjuryZones) S._reconciledInjuryZones = new Set();
  if(S._reconciledInjuryZones.has(zid)) return;
  S._reconciledInjuryZones.add(zid);
  if(!S.injuries[zid]?.history?.length) return;
  try {
    const snap = await getDoc(doc(db,'personal',S.user.uid));
    const serverZone = snap.exists() ? snap.data().injuries?.[zid] : undefined;
    if(!serverZone) S.injuries[zid].history = [];
  } catch(e) {}
}
window.reconcileInjuryZoneOnce = reconcileInjuryZoneOnce;

async function selectZone(zid) {
  S.selectedZone=zid; renderMain();
  await reconcileInjuryZoneOnce(zid);
  if(S.selectedZone===zid) renderMain();
}
window.selectZone=selectZone;

function setPain(zid,val) {
  if(!S.injuries[zid]) {
    // Al crear una molestia nueva, arrancamos con una gravedad sugerida en
    // base al dolor inicial — es solo un punto de partida razonable, no
    // queda pegada a este valor: se puede cambiar en cualquier momento,
    // independiente de cómo evolucione el dolor día a día.
    const suggestedSeverity = val>=8?'grave':val>=4?'moderada':'leve';
    // Arranca como "molestia" (isInjury:false) — el caso más común al tocar
    // rápido en el mapa es un dolor sin diagnóstico. El atleta lo sube a
    // "lesión" a propósito si corresponde (ver setIsInjury).
    S.injuries[zid]={pain:0,note:'',type:'',severity:suggestedSeverity,isInjury:false,history:[]};
  }
  S.injuries[zid].pain=val; markInjuryDirty(zid); renderMain();
}
window.setPain=setPain;

function setPainNote(zid,val) {
  if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',severity:'leve',isInjury:false,history:[]};
  S.injuries[zid].note=val;
  markInjuryDirty(zid);
}
window.setPainNote=setPainNote;

function setIsInjury(zid,val) {
  if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',severity:'leve',isInjury:false,history:[]};
  S.injuries[zid].isInjury=val; markInjuryDirty(zid); renderMain();
}
window.setIsInjury=setIsInjury;

function setInjuryType(zid,type) {
  if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',severity:'',isInjury:true,history:[]};
  S.injuries[zid].type=type; markInjuryDirty(zid); renderMain();
}
window.setInjuryType=setInjuryType;

function setInjurySeverity(zid,severity) {
  if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',severity:'',isInjury:true,history:[]};
  S.injuries[zid].severity=severity; markInjuryDirty(zid); renderMain();
}
window.setInjurySeverity=setInjurySeverity;

// Trae fresca del servidor la ficha de UNA zona puntual antes de que el
// admin le cambie un campo — S.viewingAthlete.personal viene de la misma
// caché de equipo (a._personal) que solo se carga una vez por sesión y
// nunca se refresca sola, así que puede tener horas de vieja. Sin esto, si
// el atleta hubiera cargado dolor de hoy o agregado a la zona desde su
// celular mientras el admin tenía la ficha abierta, ese dato se perdía al
// guardar la corrección (solo el campo que el admin toca, encima).
async function fetchFreshInjuryZone(uid, zoneId) {
  try {
    const snap = await getDoc(doc(db,'personal',uid));
    if(!snap.exists()) return null;
    const zone = snap.data().injuries?.[zoneId];
    // Si el servidor no tiene nada para esta zona, NUNCA devolver un objeto
    // vacío — el que llama lo tomaría como válido y escribiría solo el campo
    // que tocó, borrando pain/historia/tipo/etc. Devolver null fuerza a usar
    // la copia local como base en vez de un objeto pelado.
    return (zone && typeof zone==='object') ? zone : null;
  } catch(e) { return null; }
}

// El admin corrige/fija la gravedad clínica real de una molestia desde la
// ficha del atleta — independiente de lo que el dolor de hoy muestre. Es
// justo el caso de "meniscos operado, en rehab, sin dolor hoy, pero sigue
// siendo grave": esto es lo que lo resuelve.
async function adminSetInjurySeverity(uid, zoneId, severity) {
  const personal = S.viewingAthlete?.uid===uid ? S.viewingAthlete.personal : null;
  if(!personal || !personal.injuries || !personal.injuries[zoneId]) return;
  try {
    let zone = await fetchFreshInjuryZone(uid, zoneId);
    if(zone===null) zone = {...personal.injuries[zoneId]};
    zone.severity = severity;
    await updateDocSafe(doc(db,'personal',uid), {[`injuries.${zoneId}`]: zone});
    personal.injuries[zoneId] = zone;
    showToast('✓ Gravedad actualizada');
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.adminSetInjurySeverity = adminSetInjurySeverity;

async function adminSetInjuryRtpPhase(uid, zoneId, phase) {
  const personal = S.viewingAthlete?.uid===uid ? S.viewingAthlete.personal : null;
  if(!personal || !personal.injuries || !personal.injuries[zoneId]) return;
  try {
    let zone = await fetchFreshInjuryZone(uid, zoneId);
    if(zone===null) zone = {...personal.injuries[zoneId]};
    zone.rtpPhase = phase;
    await updateDocSafe(doc(db,'personal',uid), {[`injuries.${zoneId}`]: zone});
    personal.injuries[zoneId] = zone;
    showToast('✓ Fase de retorno actualizada');
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.adminSetInjuryRtpPhase = adminSetInjuryRtpPhase;

// ── ENFERMEDAD — separada a propósito de lesiones/molestias: no es una
// excepción del cuerpo (golpe, sobrecarga), es una excepción a la regla, así
// que vive en su propia sección chica, sin ocupar lugar en el monigote ni en
// las alertas del dashboard.
function getActiveIllness(illnesses) {
  const today = todayLocal();
  return (illnesses||[]).find(x=>!x.endDate || x.endDate>=today) || null;
}
window.getActiveIllness = getActiveIllness;

function toggleIllnessForm() { S._showIllnessForm = !S._showIllnessForm; renderMain(); }
window.toggleIllnessForm = toggleIllnessForm;

// Chico y discreto a propósito — no es un monigote ni una alerta, es una
// línea que se puede ignorar los 364 días que no aplica.
function renderIllnessSection() {
  const active = getActiveIllness(S.illnesses);
  if(active) {
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;margin-bottom:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rsm);font-size:12px">
      <span style="color:var(--text3)">🤒 Enfermedad activa desde ${active.startDate}${active.note?' · '+active.note:''}</span>
      <button class="abtn" style="font-size:11px;padding:4px 8px" onclick="resolveIllness('${active.id}')">Marcar recuperado</button>
    </div>`;
  }
  if(S._showIllnessForm) {
    return `<div style="padding:10px 12px;margin-bottom:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rsm)">
      <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Registrar enfermedad (gripe, fiebre, gastro, etc. — no es un golpe ni una molestia física)</div>
      <input type="text" id="illness-note-inp" placeholder="Ej: Gripe" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none;margin-bottom:8px;box-sizing:border-box">
      <div style="display:flex;gap:8px">
        <button class="abtn abtn-p" style="flex:1" onclick="addIllness(document.getElementById('illness-note-inp').value)">Guardar</button>
        <button class="abtn" onclick="toggleIllnessForm()">Cancelar</button>
      </div>
    </div>`;
  }
  return `<div style="text-align:right;margin-bottom:14px"><span style="font-size:11px;color:var(--text3);cursor:pointer" onclick="toggleIllnessForm()">🤒 ¿Estás enfermo? Registrar</span></div>`;
}
window.renderIllnessSection = renderIllnessSection;

async function addIllness(note) {
  if(!S.illnesses) S.illnesses=[];
  if(getActiveIllness(S.illnesses)) { showToast('Ya hay una enfermedad activa registrada'); return; }
  const today = todayLocal();
  const newIll = {id:genId(), startDate:today, endDate:null, note:(note||'').trim()};
  S.illnesses.push(newIll);
  markIllnessDirty(newIll.id);
  S._showIllnessForm = false;
  scheduleSave();
  showToast('✓ Enfermedad registrada');
  renderMain();
}
window.addIllness = addIllness;

function resolveIllness(id) {
  const it = (S.illnesses||[]).find(x=>x.id===id);
  if(!it) return;
  it.endDate = todayLocal();
  markIllnessDirty(id);
  scheduleSave();
  showToast('✓ Marcado como recuperado');
  renderMain();
}
window.resolveIllness = resolveIllness;

// Versión admin — misma lógica pero contra la ficha de OTRO atleta.
function toggleAdminIllnessForm() { S._showAdminIllnessForm = !S._showAdminIllnessForm; renderMain(); }
window.toggleAdminIllnessForm = toggleAdminIllnessForm;

// illnesses es un array (no un mapa), así que no se puede tocar un elemento
// suelto con dot-path — antes de escribir, se trae la lista real del
// servidor y se mezcla por id: se descarta la versión vieja de ESTE id (si
// existía) y se agrega/reemplaza con la versión local, dejando cualquier
// otro id (ej. registrado por el propio atleta mientras tanto) intacto.
async function mergeIllnessToServer(uid, localEntry) {
  let serverList = [];
  try {
    const snap = await getDoc(doc(db,'personal',uid));
    if(snap.exists()) serverList = snap.data().illnesses || [];
  } catch(e) { serverList = []; }
  const merged = [...serverList.filter(x=>x.id!==localEntry.id), localEntry];
  await setDoc(doc(db,'personal',uid), {illnesses:merged}, {merge:true});
  return merged;
}

async function adminAddIllness(uid, note) {
  const personal = S.viewingAthlete?.uid===uid ? S.viewingAthlete.personal : null;
  if(!personal) return;
  if(!personal.illnesses) personal.illnesses=[];
  if(getActiveIllness(personal.illnesses)) { showToast('Ya hay una enfermedad activa registrada'); return; }
  const today = todayLocal();
  const newIll = {id:genId(), startDate:today, endDate:null, note:(note||'').trim()};
  personal.illnesses.push(newIll);
  try {
    personal.illnesses = await mergeIllnessToServer(uid, newIll);
    S._showAdminIllnessForm = false;
    showToast('✓ Enfermedad registrada');
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.adminAddIllness = adminAddIllness;

async function adminResolveIllness(uid, id) {
  const personal = S.viewingAthlete?.uid===uid ? S.viewingAthlete.personal : null;
  if(!personal) return;
  const it = (personal.illnesses||[]).find(x=>x.id===id);
  if(!it) return;
  it.endDate = todayLocal();
  try {
    personal.illnesses = await mergeIllnessToServer(uid, it);
    showToast('✓ Marcado como recuperado');
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.adminResolveIllness = adminResolveIllness;

// Copia una lesión activa al historial permanente antes de que desaparezca
// de la lista de "activas". No se pierde nada: queda disponible para
// reportes futuros por atleta o por equipo.
function archiveInjury(zid) {
  const inj=S.injuries[zid]; if(!inj) return;
  const allZones=[...BODY_ZONES.front,...BODY_ZONES.back];
  const zone=allZones.find(z=>z.id===zid);
  const hist=inj.history||[];
  if(!S.injuryArchive) S.injuryArchive=[];
  S.injuryArchive.push({
    zoneId: zid,
    zoneLabel: zone?zone.label:zid,
    type: inj.type||'',
    startDate: hist.length?hist[0].date:todayLocal(),
    resolvedDate: todayLocal(),
    peakPain: hist.length?Math.max(...hist.map(h=>h.pain),inj.pain):inj.pain,
    history: hist
  });
}

async function removeInjury(zid) {
  if(!S.injuries[zid]) return;
  archiveInjury(zid);
  delete S.injuries[zid];
  markInjuryDirty(zid);
  S.selectedZone=null;
  showToast('Guardando…');
  const ok = await saveNow();
  showToast(ok ? '✓ Molestia quitada y guardada en el historial' : 'No se pudo guardar — revisá tu conexión y volvé a intentar');
  renderMain();
}
window.removeInjury=removeInjury;

async function saveInjury(zid) {
  const inj=S.injuries[zid]; if(!inj) return;
  if(!inj.history) inj.history=[];
  const today=todayLocal();
  const last=inj.history[inj.history.length-1];
  // Si ya se guardó algo de esta zona HOY (ej. tocaste "Guardar" dos veces
  // seguidas para ajustar el dolor), corregimos esa entrada en vez de
  // agregar una segunda — antes sumaba una entrada nueva cada vez, así que
  // el historial de un solo día podía terminar con varios registros.
  if(last && last.date===today) { last.pain=inj.pain; last.note=inj.note||''; last.type=inj.type||''; }
  else inj.history.push({date:today,pain:inj.pain,note:inj.note||'',type:inj.type||''});
  if(inj.pain===0) { archiveInjury(zid); delete S.injuries[zid]; }
  markInjuryDirty(zid);
  S.selectedZone=null;
  showToast('Guardando…');
  const ok = await saveNow();
  showToast(ok ? '✓ Molestia guardada' : 'No se pudo guardar — revisá tu conexión y volvé a intentar');
  renderMain();
}
window.saveInjury=saveInjury;

// ── SEGUIMIENTO DIARIO DE LESIONES (dentro de Wellness) ────────
// Antes esto se veía igual de "neutral" que cualquier otra tarjeta —
// jugadores completaban el wellness de siempre y se salteaban esto sin
// notarlo, porque nada acá comunicaba "esto es obligatorio, todos los
// días". Ahora: si falta puntuar hoy, la tarjeta se ve con borde/fondo de
// alerta y un título que lo dice directo — y además submitWellness() no te
// deja terminar el wellness de HOY sin pasar por acá primero (ver más abajo).
function renderInjuryFollowup() {
  const active=Object.entries(S.injuries).filter(([,v])=>v.pain>0);
  if(!active.length) return '';
  const today=todayLocal();
  const allZones=[...BODY_ZONES.front,...BODY_ZONES.back];
  const isDoneToday = (inj) => { const hist=inj.history||[]; return hist.length>0 && hist[hist.length-1].date===today; };
  const anyPending = active.some(([,inj])=>!isDoneToday(inj));
  return `<div class="wellness-card" id="injury-followup-section" style="margin-bottom:16px${anyPending?';border:1.5px solid var(--amber);background:var(--amber-dim)':''}">
    <div class="wellness-title">${anyPending?'⚠️ Te falta puntuar tu dolor de hoy':'Seguimiento de molestias'}</div>
    <div class="wellness-sub">${anyPending?'Es obligatorio TODOS los días mientras tengas una molestia activa — aunque sea para marcar que ya no te duele':'Contanos cómo estás hoy de cada una'}</div>
    ${active.map(([zid,inj])=>{
      const zone=allZones.find(z=>z.id===zid);
      const doneToday = isDoneToday(inj);
      const scaleBtns=Array.from({length:11},(_,i)=>{
        const cls=inj.pain===i?(i>=8?'pain-btn p-high':i>=4?'pain-btn p-med':'pain-btn p-low'):'pain-btn';
        return `<button class="${cls}" onclick="updateInjuryFollowup('${zid}',${i})">${i}</button>`;
      }).join('');
      return `<div style="padding:12px 16px;border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:13px;font-weight:600">${zone?.label||zid}${inj.type?` · ${INJURY_TYPES[inj.type]}`:''}</div>
          ${doneToday?'<span style="font-size:11px;color:var(--text3)">✓ Registrado hoy — tocá otro número para corregir</span>':'<span style="font-size:11px;color:var(--amber);font-weight:700">Falta hoy</span>'}
        </div>
        <div class="pain-scale" style="display:flex;gap:4px;flex-wrap:wrap">${scaleBtns}</div>
      </div>`;
    }).join('')}
  </div>`;
}
window.renderInjuryFollowup=renderInjuryFollowup;

// true si hay alguna molestia/lesión activa a la que le falte el puntaje de
// HOY — lo usa submitWellness() para no dejar terminar el wellness de hoy
// sin pasar antes por el seguimiento de dolor.
function hasPendingInjuryFollowup() {
  const today=todayLocal();
  return Object.values(S.injuries||{}).some(inj=>{
    if(!(inj.pain>0)) return false;
    const hist=inj.history||[];
    return !(hist.length>0 && hist[hist.length-1].date===today);
  });
}
window.hasPendingInjuryFollowup = hasPendingInjuryFollowup;

async function updateInjuryFollowup(zid,val) {
  await reconcileInjuryZoneOnce(zid);
  const inj=S.injuries[zid]; if(!inj) return;
  const today=todayLocal();
  inj.pain=val;
  if(!inj.history) inj.history=[];
  const last=inj.history[inj.history.length-1];
  if(last && last.date===today) { last.pain=val; last.note=inj.note||''; last.type=inj.type||''; }
  else inj.history.push({date:today,pain:val,note:inj.note||'',type:inj.type||''});
  if(val===0) { archiveInjury(zid); delete S.injuries[zid]; }
  markInjuryDirty(zid);
  showToast('Guardando…');
  const ok = await saveNow();
  showToast(ok ? '✓ Seguimiento guardado' : 'No se pudo guardar — revisá tu conexión y volvé a intentar');
  renderMain();
}
window.updateInjuryFollowup=updateInjuryFollowup;

// ── PROGRESS ──────────────────────────────────────────────────
function renderProgress() {
  let w=S.progressView.week||S.currentWeek;
  w=Math.max(1,Math.min(w,S.currentWeek));
  S.progressView.week=w;

  let html=`<div class="week-nav">
    <button class="week-nav-btn" onclick="progWeek(-1)" ${w<=1?'disabled':''}>‹</button>
    <div class="week-nav-label">Semana ${w} · <span style="color:var(--text3);font-size:12px">${weekLabel(w)}</span></div>
    <button class="week-nav-btn" onclick="progWeek(1)" ${w>=S.currentWeek?'disabled':''}>›</button>
  </div>`;

  html+=`<div class="prog-week-card">
    <div class="prog-week-header"><span class="prog-week-title">Sesiones</span><span class="prog-week-date">${weekLabel(w)}</span></div>
    <div class="session-dots">${getSessionList().map(s=>`<div class="session-dot ${getSD(w,s).done?'done':''}" title="${s}"></div>`).join('')}</div>
  </div>`;

  const sessionList=getSessionList();
  const allExById={};
  getCurrentBlocks().forEach(b=>b.categories.forEach(c=>c.exercises.forEach(e=>{allExById[e.id]=e.name;})));
  const exData=[];
  getCurrentBlocks().forEach(b=>b.categories.forEach(c=>c.exercises.forEach(ex=>{
    const rows=sessionList.map(s=>({s,d:getED(w,s,ex.id),done:getSD(w,s).done}))
      .filter(r=>r.done&&(r.d.series||r.d.reps||r.d.load||r.d.ms));
    if(rows.length) exData.push({ex,rows});
  })));

  if(!exData.length) {
    html+=`<div class="empty-state">Sin datos registrados para esta semana.<br><span style="font-size:12px">Completá sesiones para ver progresión.</span></div>`;
  } else {
    html+=`<div class="prog-ex-list">`;
    exData.forEach(({ex,rows})=>{
      rows.forEach(r=>{
        const d=r.d;
        const serReps=[d.series,d.reps].filter(Boolean).join('×')||'—';
        const carga=d.load?`${d.load}kg`:d.pct?`${d.pct}%RM`:d.ms?`${d.ms}m/s`:'—';
        html+=`<div class="prog-ex-item">
          <span class="prog-ex-name">${ex.name}</span>
          <div class="prog-ex-vals">
            <div class="prog-val"><b>${serReps}</b><span>vol</span></div>
            <div class="prog-val"><b>${carga}</b><span>carga</span></div>
            <div class="prog-val"><b>Día ${r.s}</b><span></span></div>
          </div>
        </div>`;
      });
    });
    html+=`</div>`;
  }

  if(w>1) {
    const c=countChecked(w), p=countChecked(w-1), diff=c-p;
    html+=`<div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);padding:14px;margin-top:10px;font-size:13px;color:var(--text2)">
      vs semana ${w-1}: <b style="color:var(--purple)">${c}</b> ejercicios realizados
      ${diff>0?`<span style="color:var(--green)"> +${diff} ↑</span>`:diff<0?`<span style="color:var(--red)"> ${diff} ↓</span>`:'<span style="color:var(--text3)"> sin cambios</span>'}
    </div>`;
  }
  return html;
}

function progWeek(d) { S.progressView.week=(S.progressView.week||S.currentWeek)+d; renderMain(); }
window.progWeek=progWeek;

// ── STATS ─────────────────────────────────────────────────────
function renderStats() {
  const sessionList=getSessionList();
  let totalS=0,totalC=0;
  const freq={};
  for(let w=1;w<=S.currentWeek;w++) sessionList.forEach(s=>{
    const sd=getSD(w,s);
    if(sd.done) totalS++;
    Object.entries(sd.exercises).forEach(([id,d])=>{ if(d.checked){totalC++;freq[id]=(freq[id]||0)+1;} });
  });
  const today=new Date();
  const last7=Array.from({length:7},(_,i)=>{ const d=new Date(today); d.setDate(d.getDate()-6+i); return toLocalDateStr(d); });
  const doneDs=new Set();
  for(let w=1;w<=S.currentWeek;w++) sessionList.forEach(s=>{
    const sd=getSD(w,s); if(sd.done&&sd.date) doneDs.add(sd.date);
  });
  const allExById={};
  getCurrentBlocks().forEach(b=>b.categories.forEach(c=>c.exercises.forEach(e=>{allExById[e.id]=e.name;})));
  const topEx=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxF=topEx[0]?.[1]||1;
  const wDays=Object.entries(S.wellness).sort((a,b)=>a[0].localeCompare(b[0])).slice(-7);
  const wScores=wDays.map(([date,w])=>{
    const {pct,allFilled}=getWellnessScore(w);
    return {date,pct,ok:allFilled};
  }).filter(x=>x.ok);
  const streak=last7.filter(d=>doneDs.has(d)).length;
  const isDesktop=window.innerWidth>=900;

  let html=`<div class="page-header">
    <div class="page-title">Estadísticas</div>
    <div class="page-subtitle">${getWeekHeaderLabel(true)}${isTeamAthlete()?'':` · ${totalS} sesión${totalS!==1?'es':''} completada${totalS!==1?'s':''}`}</div>
  </div>`;

  // Metric cards — 2x2 grid, no emojis, proper card styling
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
    <div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);padding:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Semanas</div>
      <div style="font-size:30px;font-weight:800;color:var(--text);line-height:1">${S.currentWeek}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">ciclo actual</div>
    </div>
    <div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);padding:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Sesiones</div>
      <div style="font-size:30px;font-weight:800;color:var(--text);line-height:1">${totalS}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">completadas</div>
    </div>
    <div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);padding:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Racha semanal</div>
      <div style="font-size:30px;font-weight:800;line-height:1;color:${streak>=5?'var(--green)':streak>=3?'var(--amber)':'var(--text)'}">${streak}<span style="font-size:16px;font-weight:400;color:var(--text3)">/7</span></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">días activos</div>
    </div>
    <div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);padding:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Ejerc./sesión</div>
      <div style="font-size:30px;font-weight:800;color:var(--text);line-height:1">${totalS>0?Math.round(totalC/totalS):0}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">promedio</div>
    </div>
  </div>`;

  // Last 7 days activity strip
  html+=`<div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);padding:16px 14px;margin-bottom:16px">
    <div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:12px;text-transform:uppercase;letter-spacing:.06em">Actividad — últimos 7 días</div>
    <div style="display:flex;gap:4px;justify-content:space-between">
      ${last7.map(d=>{
        const day=new Date(d+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short'}).replace('.','');
        const done=doneDs.has(d);
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px">
          <div style="width:34px;height:34px;border-radius:50%;background:${done?'var(--accent)':'var(--bg3)'};border:1px solid ${done?'var(--accent)':'var(--border2)'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${done?'#fff':'var(--text3)'}">${done?'✓':''}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:capitalize;text-align:center">${day.slice(0,2)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  // Two columns on desktop
  if(isDesktop) html+=`<div class="desktop-cols">`;

  // Top exercises
  if(topEx.length) html+=`<div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);margin-bottom:16px;overflow:hidden">
    <div style="font-size:14px;font-weight:600;padding:14px 16px;border-bottom:1px solid var(--border)">Ejercicios más frecuentes</div>
    <div style="padding:8px 16px 14px">
      ${topEx.map(([id,f],i)=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="width:22px;height:22px;border-radius:50%;background:var(--accent-dim);color:var(--accent-text);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div>
          <div style="flex:1;font-size:13px;font-weight:500">${allExById[id]||'—'}</div>
          <div style="display:flex;align-items:center;gap:6px;min-width:80px">
            <div style="flex:1;height:4px;border-radius:2px;background:var(--bg3)">
              <div style="height:100%;border-radius:2px;background:var(--accent);width:${Math.round(f/maxF*100)}%"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:var(--accent-text);min-width:24px;text-align:right">${f}x</span>
          </div>
        </div>`).join('')}
    </div>
  </div>`;

  // Wellness trend
  if(wScores.length) html+=`<div class="wellness-card">
    <div class="wellness-title">Bienestar semanal</div>
    <div style="padding:8px 18px 14px">
      ${wScores.map(({date,pct})=>{
        const st=getWellnessState(pct);
        return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text3);min-width:44px">${date.slice(5)}</div>
          <div style="flex:1;height:6px;border-radius:3px;background:var(--bg3)">
            <div style="height:100%;border-radius:3px;background:${st.color};width:${pct}%;transition:width .3s"></div>
          </div>
          <div style="font-size:13px;font-weight:700;color:${st.color};min-width:32px;text-align:right">${pct}%</div>
          <div style="font-size:10px;color:${st.color};min-width:36px">${pct>=75?'Bien':pct>=50?'Normal':'Fatiga'}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
  else html+=`<div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);margin-bottom:16px"><div style="font-size:14px;font-weight:600;padding:14px 16px;border-bottom:1px solid var(--border)">Bienestar semanal</div><div class="empty-state" style="padding:24px">Sin registros de wellness aún.</div></div>`;

  if(isDesktop) html+=`</div>`;
  return html;
}

// ── TEAMS ─────────────────────────────────────────────────────
function renderTeams() {
  if(S._teamViewLoadingId) return `<div style="text-align:center;padding:40px;color:var(--text3)">Cargando equipo…</div>`;
  if(S.teamView) return renderTeamDetail(S.teamView);
  let html=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <div style="font-size:16px;font-weight:700">Equipos</div>
    <button class="abtn abtn-p" onclick="createTeam()">+ Nuevo equipo</button>
  </div>`;
  if(!S.teams.length) html+=`<div class="empty-state">No hay equipos creados.<br><span style="font-size:12px">Creá un equipo para planificar.</span></div>`;
  else html+=S.teams.map(t=>`
    <div class="team-card" onclick="openTeam('${t.id}')" style="border-left:3px solid ${t.color||'var(--purple)'}">
      <div class="team-card-header">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:10px;height:10px;border-radius:50%;background:${t.color||'var(--purple)'};flex-shrink:0"></div>
          <div class="team-name">${t.name}${t.category?` / ${t.category}`:''}</div>
        </div>
        <span class="team-sport-badge">${t.sport||'Deporte'}</span>
      </div>
      <div class="team-meta">${(t.players||[]).length} jugadores · ${Object.keys(t.calendar||{}).length} días con actividad en el calendario</div>
    </div>`).join('');
  return html;
}



function renderTeamDetail(team) {
  if(S.teamDayEdit) return renderTeamDayEditor(team, S.teamDayEdit);
  const sub = S.teamSubview || 'rutina';
  let html=`<div class="team-detail-header">
    <button class="back-btn" data-back="team-list">‹</button>
    <div class="team-detail-title" style="display:flex;align-items:center;gap:8px">
      <div style="width:12px;height:12px;border-radius:50%;background:${team.color||'var(--purple)'}"></div>
      ${team.name}${team.category?` / ${team.category}`:''}
    </div>
    <span class="team-sport-badge">${team.sport||''}</span>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
    <button class="snav-tab ${sub==='rutina'?'active':''}" onclick="setTeamSubview('rutina')">Rutina</button>
    <button class="snav-tab ${sub==='evals'?'active':''}" onclick="setTeamSubview('evals')">Evaluaciones</button>
    <button class="snav-tab ${sub==='wellness'?'active':''}" onclick="setTeamSubview('wellness')">Wellness</button>
    <button class="snav-tab ${sub==='calendario'?'active':''}" onclick="setTeamSubview('calendario')">Calendario</button>
    <button class="snav-tab ${sub==='stats'?'active':''}" onclick="setTeamSubview('stats')">Estadísticas</button>
    <button class="snav-tab ${sub==='reporte'?'active':''}" onclick="setTeamSubview('reporte')">Informe</button>
  </div>`;

  if(sub==='wellness') html += renderGroupWellness(getTeamStatsMemberUids(team));
  else if(sub==='stats') html += renderGroupStats(getTeamStatsMemberUids(team));
  else if(sub==='evals') html += renderEvals();
  else if(sub==='calendario') html += renderTeamCalendar(team);
  else if(sub==='reporte') html += renderTeamReport(team);
  else html += renderTeamRutina(team);
  return html;
}

function setTeamSubview(v) {
  S.teamSubview = v;
  if (v==='evals') {
    S.evalScopeUids = getTeamStatsMemberUids(S.teamView);
    if (!S.evalScopeUids.includes(S.evalAthleteId)) S.evalAthleteId = S.evalScopeUids[0] || null;
    // Al entrar a Evaluaciones de un EQUIPO (no de un atleta suelto), arrancar
    // mostrando la comparación de todo el plantel — antes caía en la ficha de
    // "Registrar salto" del primer atleta de la lista, como si ese fuera el
    // dato relevante del equipo, cuando en realidad era solo el primero por
    // orden alfabético/de carga.
    if (S.evalScopeUids.length > 1) S.evalView = 'compare';
    ensureAdminAthletes()
      .then(()=>{
        S.evalScopeUids = getTeamStatsMemberUids(S.teamView);
        // Comparar atletas necesita los datos de TODO el plantel, no solo del
        // primero — antes solo se traía el del atleta seleccionado, así que
        // "Comparar atletas" arrancaba mostrando a uno solo y el resto como
        // "Sin datos" hasta que tocabas "Actualizar datos de atletas" a mano.
        if (S.evalScopeUids.length > 1) return loadAllAthleteEvals(true);
        return ensureAthleteEvalData(S.evalAthleteId);
      })
      .then(()=>{ renderMain(); setTimeout(drawEvalCharts,80); })
      .catch((e)=>{ console.error('Error al cargar Evaluaciones del equipo', e); showToast('Error: '+(e?.message||e)); renderMain(); });
    return;
  }
  if (v==='wellness' || v==='stats' || v==='reporte') {
    ensureGroupPersonalData(getTeamStatsMemberUids(S.teamView))
      .then(()=>{
        // Aprovechamos que acá ya se cargaron los datos personales de todo
        // el plantel (+ cualquier atleta individual comparado con este
        // equipo) para refrescar el promedio de evaluaciones del equipo
        // (ver syncTeamEvalAverages) — así "Comparar en equipo" del lado
        // del atleta tiene un número real para mostrar, sin que el atleta
        // necesite permiso para leer los datos de sus compañeros.
        if(v==='stats' && S.teamView) {
          const uids = getTeamStatsMemberUids(S.teamView);
          const mem=(S.adminAthletes||[]).filter(a=>uids.includes(a.uid));
          syncTeamEvalAverages(S.teamView, mem);
        }
        renderMain();
      })
      .catch((e)=>{ console.error('Error al cargar datos del equipo', e); showToast('Error: '+(e?.message||e)); renderMain(); });
    return;
  }
  renderMain();
}
window.setTeamSubview = setTeamSubview;

// Promedio del equipo por test de saltabilidad (mejor marca de cada atleta,
// igual criterio que el ranking/radar) — se guarda en el propio documento
// del equipo, que cualquier usuario logueado puede leer. Los atletas no
// tienen permiso para leer los datos personales de sus compañeros uno por
// uno, así que sin esto "Comparar en equipo" no tenía ningún dato real con
// qué comparar.
async function syncTeamEvalAverages(team, members) {
  if(!team || !members.length) return;
  const bestOf = (a,id) => { const r=a._personal?.evals?.[id]||[]; return r.length?Math.max(...r.map(x=>x.height)):null; };
  const avgs = {};
  const maxs = {};
  EVAL_TESTS.forEach(t=>{
    const vals = members.map(a=>bestOf(a,t.id)).filter(v=>v!=null);
    if(vals.length) {
      avgs[t.id] = +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(1);
      maxs[t.id] = Math.max(...vals);
    }
  });
  if(!Object.keys(avgs).length) return;

  // Promedio por puesto — mismo criterio de privacidad (agregado, nunca datos
  // crudos de un compañero puntual). Solo se guarda un puesto si hay al menos
  // 2 atletas con datos ahí adentro, si no el "promedio" sería directamente
  // la propia marca del jugador comparada contra sí misma.
  const byPos = {};
  members.forEach(a=>{ if(a.position) (byPos[a.position]=byPos[a.position]||[]).push(a); });
  const avgsByPosition = {};
  Object.entries(byPos).forEach(([pos,mem])=>{
    const posAvgs = {};
    EVAL_TESTS.forEach(t=>{
      const vals = mem.map(a=>bestOf(a,t.id)).filter(v=>v!=null);
      if(vals.length>=2) posAvgs[t.id] = +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(1);
    });
    if(Object.keys(posAvgs).length) avgsByPosition[pos] = posAvgs;
  });

  team.evalAverages = avgs;
  team.evalMax = maxs;
  team.evalAveragesByPosition = avgsByPosition;
  try { await setDoc(doc(db,'teams',team.id), {evalAverages:avgs, evalMax:maxs, evalAveragesByPosition:avgsByPosition}, {merge:true}); } catch(e) { /* no crítico */ }
}
window.syncTeamEvalAverages = syncTeamEvalAverages;

// ══════════════════════════════════════════════════════════════
// ── CALENDARIO DEL EQUIPO (estilo Google Calendar) ───────────
// ══════════════════════════════════════════════════════════════
const CALENDAR_TYPES = [
  {id:'fisico',   label:'Físico',       color:'#3b7dd8'},
  {id:'pelota',   label:'Pelota',       color:'#8b5cf6'},
  {id:'partido',  label:'Partido',      color:'#ef4444'},
  {id:'descanso', label:'Descanso',     color:'#7A8394'},
];

// team.calendar[fecha] es un ARRAY de eventos (no un solo tipo) — un mismo
// día puede tener Pelota Y Físico a la vez, por ejemplo. Si hay datos viejos
// guardados como un objeto suelto (formato anterior), los tratamos como
// lista de un elemento para no perder nada.
function getCalendarEvents(team, dateStr) {
  const raw = (team.calendar||{})[dateStr];
  if(!raw) return [];
  if(Array.isArray(raw)) return raw;
  return raw.type ? [raw] : [];
}
window.getCalendarEvents=getCalendarEvents;

function setCalendarViewMode(mode) {
  S.calendarViewMode = mode;
  renderMain();
}
window.setCalendarViewMode=setCalendarViewMode;

function shiftCalendarRef(delta) {
  const mode = S.calendarViewMode||'month';
  const ref = new Date((S.calendarRefDate||todayLocal())+'T00:00:00');
  if(mode==='day') ref.setDate(ref.getDate()+delta);
  else if(mode==='week') ref.setDate(ref.getDate()+delta*7);
  else ref.setMonth(ref.getMonth()+delta);
  S.calendarRefDate = toLocalDateStr(ref);
  renderMain();
}
window.shiftCalendarRef=shiftCalendarRef;

function selectCalendarDay(dateStr) {
  S.calendarSelectedDate = (S.calendarSelectedDate===dateStr) ? null : dateStr;
  renderMain();
}
window.selectCalendarDay=selectCalendarDay;

function renderTeamCalendar(team) {
  const mode = S.calendarViewMode||'month';
  let html = `<div style="display:flex;gap:6px;margin-bottom:14px">
    <button class="lib-filter ${mode==='day'?'active':''}" onclick="setCalendarViewMode('day')">Día</button>
    <button class="lib-filter ${mode==='week'?'active':''}" onclick="setCalendarViewMode('week')">Semana</button>
    <button class="lib-filter ${mode==='month'?'active':''}" onclick="setCalendarViewMode('month')">Mes</button>
  </div>`;
  if(S.isAdmin) html += renderCalendarRepeatTool(team);
  if(mode==='day') html += renderCalendarDayView(team);
  else if(mode==='week') html += renderCalendarWeekView(team);
  else html += renderCalendarMonthView(team);
  return html;
}
window.renderTeamCalendar=renderTeamCalendar;

// Calendario del propio equipo, vista jugador — mismo grid/chips que ya usa
// el admin (día de partido con escudo, Local/Visitante, etc.), pero de solo
// lectura: tocar un día muestra renderCalendarDayReadOnly, nunca el editor.
function renderPlayerCalendar() {
  const header = `<div class="page-header">
    <div class="page-title">Calendario</div>
    <div class="page-subtitle">${S.myTeam?S.myTeam.name+(S.myTeam.category?' · '+S.myTeam.category:''):'Tu equipo'}</div>
  </div>`;
  if(!S.myTeam) {
    return header + `<div class="empty-state">Todavía no estás vinculado a ningún equipo.</div>`;
  }
  return header + renderTeamCalendar(S.myTeam);
}
window.renderPlayerCalendar = renderPlayerCalendar;

// ── REPETIR ACTIVIDAD SEMANALMENTE (tipo Google Calendar) ─────────────
// En vez de cargar entrenamiento día por día a mano, el admin elige el tipo
// de actividad, qué días de la semana, y hasta qué fecha — y esto la carga
// en todas las fechas que matcheen, en UNA sola escritura a Firestore (no
// una por fecha). Nunca pisa lo que ya esté cargado: por cada fecha, si ese
// tipo de actividad ya está puesto ese día, se salta (mismo criterio que el
// importador de fixture).
function toggleCalendarRepeat() {
  S._calRepeatOpen = !S._calRepeatOpen;
  if(S._calRepeatOpen && !S._calRepeatTypes) {
    S._calRepeatTypes = new Set();
    S._calRepeatDows = new Set();
    S._calRepeatStart = todayLocal();
    const d = new Date(); d.setMonth(d.getMonth()+4);
    S._calRepeatEnd = toLocalDateStr(d);
  }
  renderMain();
}
window.toggleCalendarRepeat = toggleCalendarRepeat;

function toggleCalendarRepeatType(typeId) {
  if(!S._calRepeatTypes) S._calRepeatTypes = new Set();
  if(S._calRepeatTypes.has(typeId)) S._calRepeatTypes.delete(typeId); else S._calRepeatTypes.add(typeId);
  renderMain();
}
window.toggleCalendarRepeatType = toggleCalendarRepeatType;

function toggleCalendarRepeatDow(dow) {
  if(!S._calRepeatDows) S._calRepeatDows = new Set();
  if(S._calRepeatDows.has(dow)) S._calRepeatDows.delete(dow); else S._calRepeatDows.add(dow);
  renderMain();
}
window.toggleCalendarRepeatDow = toggleCalendarRepeatDow;

function setCalendarRepeatDate(field, val) {
  if(field==='start') S._calRepeatStart = val; else S._calRepeatEnd = val;
}
window.setCalendarRepeatDate = setCalendarRepeatDate;

function renderCalendarRepeatTool(team) {
  const open = S._calRepeatOpen;
  let html = `<div class="admin-section" style="margin-bottom:14px">
    <div class="admin-item" style="cursor:pointer" onclick="toggleCalendarRepeat()">
      <div class="admin-section-title" style="margin:0">🔁 Repetir actividad semanalmente</div>
      <span style="color:var(--text3);font-size:12px">${open?'▲ cerrar':'▼ abrir'}</span>
    </div>`;
  if(open) {
    const types = S._calRepeatTypes||new Set();
    const dows = S._calRepeatDows||new Set();
    const dowLabels=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    html += `<div style="padding:12px 16px">
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Actividad a repetir</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        ${CALENDAR_TYPES.map(t=>`<button class="lib-filter ${types.has(t.id)?'active':''}" onclick="toggleCalendarRepeatType('${t.id}')">${t.label}</button>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Días de la semana</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        ${dowLabels.map((lbl,i)=>`<button class="lib-filter ${dows.has(i)?'active':''}" onclick="toggleCalendarRepeatDow(${i})">${lbl}</button>`).join('')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Desde</div>
          <input type="date" class="abtn" value="${S._calRepeatStart||todayLocal()}" onchange="setCalendarRepeatDate('start',this.value)">
        </div>
        <div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Hasta</div>
          <input type="date" class="abtn" value="${S._calRepeatEnd||todayLocal()}" onchange="setCalendarRepeatDate('end',this.value)">
        </div>
      </div>
      <button class="abtn abtn-p" style="width:100%" onclick="applyCalendarRepeat('${team.id}')">Aplicar</button>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">No pisa nada ya cargado: si ese día ya tiene esa actividad, se salta. Si elegís Partido, se crea sin rival cargado en cada fecha — después entrás día por día a poner el rival y Local/Visitante.</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}
window.renderCalendarRepeatTool = renderCalendarRepeatTool;

async function applyCalendarRepeat(teamId) {
  const team = S.teams.find(t=>t.id===teamId); if(!team) return;
  const types = [...(S._calRepeatTypes||[])];
  const dows = S._calRepeatDows||new Set();
  if(!types.length) { showToast('Elegí al menos un tipo de actividad'); return; }
  if(!dows.size) { showToast('Elegí al menos un día de la semana'); return; }
  const start = S._calRepeatStart||todayLocal();
  const end = S._calRepeatEnd||start;
  if(end<start) { showToast('La fecha final tiene que ser después de la inicial'); return; }
  const typeLabels = types.map(t=>CALENDAR_TYPES.find(x=>x.id===t)?.label||t).join(', ');
  const dowLabels = [...dows].sort((a,b)=>a-b).map(d=>['lunes','martes','miércoles','jueves','viernes','sábado','domingo'][d]).join(', ');
  if(!confirm(`¿Agregar ${typeLabels} todos los ${dowLabels} desde ${start} hasta ${end}? No duplica lo que ya esté cargado ese día.`)) return;
  showToast('Aplicando…');
  if(!team.calendar) team.calendar={};
  const fsUpdate = {};
  let addedTotal = 0;
  const d = new Date(start+'T00:00:00');
  const endD = new Date(end+'T00:00:00');
  while(d<=endD) {
    const dow = (d.getDay()+6)%7;
    if(dows.has(dow)) {
      const dateStr = toLocalDateStr(d);
      let events = getCalendarEvents(team, dateStr);
      let changed = false;
      types.forEach(typeId=>{
        if(!events.some(e=>e.type===typeId)) {
          const newEvent = typeId==='partido' ? {type:'partido', opponent:'', homeAway:'local'} : {type:typeId};
          events=[...events,newEvent]; changed=true; addedTotal++;
        }
      });
      if(changed) { team.calendar[dateStr]=events; fsUpdate[`calendar.${dateStr}`]=events; }
    }
    d.setDate(d.getDate()+1);
  }
  if(!addedTotal) { showToast('No había nada nuevo para agregar en ese rango'); return; }
  try {
    await updateDocSafe(doc(db,'teams',teamId), fsUpdate);
    showToast(`✓ ${addedTotal} actividades agregadas`);
    S._calRepeatOpen = false;
    renderMain();
  } catch(e) { showToast('Error al guardar: '+e.message); }
}
window.applyCalendarRepeat = applyCalendarRepeat;

// Antes, de lejos (mes/semana sin entrar al día) solo se veía un puntito de
// color por actividad — no se podía saber si era gimnasio, práctica o
// partido sin tocar. Ahora cada actividad es un rectángulo chico con el
// nombre, para leerlo de un vistazo sin abrir nada.
function renderCalendarEventChips(events, maxChips) {
  if(!events.length) return '';
  const partidos = events.filter(e=>e.type==='partido');
  const others = events.filter(e=>e.type!=='partido');
  const shownOthers = others.slice(0, maxChips);
  const extraOthers = others.length - shownOthers.length;
  // Día de partido: se pide de un vistazo (sin entrar al día) quién es el
  // rival, su escudo bien visible y si jugamos de Local (rojo) o Visitante
  // (azul) — por eso este día tiene su propio recuadro más grande en vez del
  // chip fino que usan gimnasio/práctica.
  const matchBoxes = partidos.map(e=>{
    const isLocal = e.homeAway!=='visitante';
    const badgeColor = isLocal ? 'var(--red)' : 'var(--blue)';
    const badgeLabel = isLocal ? 'LOCAL' : 'VISITANTE';
    const name = e.opponent || 'Rival';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;width:100%">
      <span style="font-size:8.5px;font-weight:700;text-align:center;line-height:1.15;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${name}</span>
      ${e.crestUrl?`<img src="${e.crestUrl}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid var(--border2)">`:`<div style="width:30px;height:30px;border-radius:50%;background:var(--bg3);border:1px solid var(--border2)"></div>`}
      <span style="font-size:7.5px;font-weight:800;letter-spacing:.02em;padding:1px 5px;border-radius:3px;color:#fff;background:${badgeColor}">${badgeLabel}</span>
    </div>`;
  }).join('');
  const otherChips = shownOthers.length ? `<div style="display:flex;flex-direction:column;gap:2px;width:100%">
    ${shownOthers.map(e=>{
      const t = CALENDAR_TYPES.find(x=>x.id===e.type);
      const color = t?t.color:'var(--text3)';
      const label = t?t.label:e.type;
      return `<div style="background:${color}26;color:${color};border-radius:3px;padding:1px 3px;font-size:8.5px;font-weight:700;line-height:1.5;width:100%;box-sizing:border-box;overflow:hidden;text-align:center;white-space:nowrap;text-overflow:ellipsis">${label}</div>`;
    }).join('')}
    ${extraOthers>0?`<div style="font-size:8px;color:var(--text3);text-align:center">+${extraOthers}</div>`:''}
  </div>` : '';
  return `<div style="display:flex;flex-direction:column;gap:3px;width:100%;align-items:center">${matchBoxes}${otherChips}</div>`;
}
window.renderCalendarEventChips = renderCalendarEventChips;

function renderCalendarMonthView(team) {
  const refDate = new Date((S.calendarRefDate||todayLocal())+'T00:00:00');
  const y=refDate.getFullYear(), m=refDate.getMonth();
  const firstDay = new Date(y,m,1);
  const daysInMonth = new Date(y,m+1,0).getDate();
  const startWeekday = (firstDay.getDay()+6)%7;
  const monthLabel = firstDay.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
  const today = todayLocal();
  const selected = S.calendarSelectedDate||null;

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <button class="abtn" onclick="shiftCalendarRef(-1)">‹</button>
    <div style="font-weight:700;font-size:15px;text-transform:capitalize">${monthLabel}</div>
    <button class="abtn" onclick="shiftCalendarRef(1)">›</button>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
    ${CALENDAR_TYPES.map(t=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3)"><div style="width:8px;height:8px;border-radius:50%;background:${t.color}"></div>${t.label}</div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px">
    ${['L','M','X','J','V','S','D'].map(d=>`<div style="text-align:center;font-size:10px;color:var(--text3);font-weight:600">${d}</div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:16px">
    ${Array.from({length:startWeekday}).map(()=>'<div></div>').join('')}
    ${Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
      const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const events = getCalendarEvents(team,dateStr);
      const isToday = dateStr===today, isSelected = dateStr===selected;
      return `<div onclick="selectCalendarDay('${dateStr}')" style="min-height:64px;border-radius:var(--rxs);display:flex;flex-direction:column;align-items:center;cursor:pointer;gap:2px;font-size:12px;padding:4px 2px;
        background:${isSelected?'var(--accent-dim)':'var(--bg3)'};border:1px solid ${isToday?'var(--accent)':'var(--border)'}">
        <span style="color:${isToday?'var(--accent)':'var(--text)'}">${day}</span>
        ${renderCalendarEventChips(events, 3)}
      </div>`;
    }).join('')}
  </div>
  ${selected ? (S.isAdmin?renderCalendarDayEditor(team, selected):renderCalendarDayReadOnly(team, selected)) : `<div class="empty-state" style="padding:24px">Tocá un día del calendario para ver ${S.isAdmin?'o agregar':''} actividades.</div>`}`;
  return html;
}
window.renderCalendarMonthView=renderCalendarMonthView;

function renderCalendarWeekView(team) {
  const refDate = new Date((S.calendarRefDate||todayLocal())+'T00:00:00');
  const dow = (refDate.getDay()+6)%7;
  const monday = new Date(refDate); monday.setDate(monday.getDate()-dow);
  const days = Array.from({length:7},(_,i)=>{ const d=new Date(monday); d.setDate(d.getDate()+i); return d; });
  const today = todayLocal();
  const weekLabel = `${days[0].toLocaleDateString('es-AR',{day:'numeric',month:'short'})} – ${days[6].toLocaleDateString('es-AR',{day:'numeric',month:'short'})}`;
  const selected = S.calendarSelectedDate||null;
  const dayInitials = ['L','M','X','J','V','S','D'];

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <button class="abtn" onclick="shiftCalendarRef(-1)">‹</button>
    <div style="font-weight:700;font-size:14px">${weekLabel}</div>
    <button class="abtn" onclick="shiftCalendarRef(1)">›</button>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
    ${CALENDAR_TYPES.map(t=>`<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3)"><div style="width:8px;height:8px;border-radius:50%;background:${t.color}"></div>${t.label}</div>`).join('')}
  </div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:16px">
    ${days.map((d,i)=>{
      const dateStr=toLocalDateStr(d);
      const events=getCalendarEvents(team,dateStr);
      const isToday=dateStr===today, isSelected=dateStr===selected;
      return `<div onclick="selectCalendarDay('${dateStr}')" style="min-height:88px;border-radius:var(--rxs);display:flex;flex-direction:column;align-items:center;cursor:pointer;gap:3px;padding:4px 2px;
        background:${isSelected?'var(--accent-dim)':'var(--bg3)'};border:1px solid ${isToday?'var(--accent)':'var(--border)'}">
        <span style="font-size:9px;color:var(--text3);font-weight:600">${dayInitials[i]}</span>
        <span style="font-size:14px;color:${isToday?'var(--accent)':'var(--text)'}">${d.getDate()}</span>
        ${renderCalendarEventChips(events, 4)}
      </div>`;
    }).join('')}
  </div>
  ${selected ? (S.isAdmin?renderCalendarDayEditor(team, selected):renderCalendarDayReadOnly(team, selected)) : `<div class="empty-state" style="padding:20px">Tocá un día de la semana para ver ${S.isAdmin?'o agregar':''} actividades.</div>`}`;
  return html;
}
window.renderCalendarWeekView=renderCalendarWeekView;

function renderCalendarDayView(team) {
  const refDate = S.calendarRefDate || todayLocal();
  const dateLabel = new Date(refDate+'T00:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <button class="abtn" onclick="shiftCalendarRef(-1)">‹</button>
    <div style="font-weight:700;font-size:14px;text-transform:capitalize">${dateLabel}</div>
    <button class="abtn" onclick="shiftCalendarRef(1)">›</button>
  </div>`;
  html += S.isAdmin ? renderCalendarDayEditor(team, refDate) : renderCalendarDayReadOnly(team, refDate);
  return html;
}
window.renderCalendarDayView=renderCalendarDayView;

// Lista de eventos de un día puntual, con alta/baja y edición inline de
// rival/local-visitante para los eventos de tipo "Partido".
// ── EDICIÓN DE UN DÍA DEL CALENDARIO — mismo modelo que la rutina ──────────
// Antes cada click (agregar actividad, sacar una, tipear el rival) disparaba
// su propio guardado a Firestore, uno por uno. Con conexión lenta o dos
// clicks rápidos seguidos, esas escrituras podían pisarse entre sí o
// perderse una en el camino sin que se notara — el síntoma era "cargo algo y
// no queda guardado". La rutina nunca tuvo ese problema porque funciona
// distinto: editás todo LOCAL y recién se manda a Firestore una sola vez,
// entera, cuando tocás "Guardar". Ahora el calendario hace exactamente lo
// mismo: todo lo de abajo (agregar/quitar actividad, rival, escudo) es
// edición local nomás — nada se manda a Firestore hasta que tocás "Guardar
// cambios de este día".
function markCalendarDayDirty(dateStr) {
  if(!S._calDirtyDates) S._calDirtyDates = new Set();
  S._calDirtyDates.add(dateStr);
}
window.markCalendarDayDirty = markCalendarDayDirty;

// Misma info que renderCalendarDayEditor pero sin ningún control de edición
// (agregar/quitar actividad, escudo, guardar) — lo que ve el jugador al
// tocar un día de SU calendario de equipo, de solo lectura.
function renderCalendarDayReadOnly(team, dateStr) {
  const events = getCalendarEvents(team, dateStr);
  const dateLabel = new Date(dateStr+'T00:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  return `<div class="admin-section">
    <div class="admin-section-title" style="text-transform:capitalize">${dateLabel}</div>
    ${events.length?events.map(e=>{
      const t=CALENDAR_TYPES.find(x=>x.id===e.type);
      return `<div class="admin-item" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:${t?t.color:'var(--text3)'};flex-shrink:0"></div>
          <div style="font-size:13px;font-weight:600;flex:1">${t?t.label:e.type}</div>
        </div>
        ${e.type==='partido'?`<div style="display:flex;gap:8px;align-items:center;padding-left:16px">
          ${e.crestUrl?`<img src="${e.crestUrl}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid var(--border2)">`:''}
          <span style="font-size:13px;font-weight:600">${e.opponent||'Rival'}</span>
          <span style="font-size:10px;font-weight:800;padding:2px 8px;border-radius:4px;color:#fff;background:${e.homeAway==='visitante'?'var(--blue)':'var(--red)'}">${e.homeAway==='visitante'?'VISITANTE':'LOCAL'}</span>
        </div>`:''}
      </div>`;
    }).join(''):`<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin actividades este día.</div>`}
  </div>`;
}
window.renderCalendarDayReadOnly=renderCalendarDayReadOnly;

function renderCalendarDayEditor(team, dateStr) {
  const events = getCalendarEvents(team, dateStr);
  const dateLabel = new Date(dateStr+'T00:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  const isDirty = S._calDirtyDates?.has(dateStr);
  return `<div class="admin-section">
    <div class="admin-section-title" style="text-transform:capitalize;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>${dateLabel}</span>
      ${isDirty?'<span style="font-size:11px;font-weight:700;color:var(--amber)">● cambios sin guardar</span>':''}
    </div>
    ${events.length?events.map((e,i)=>{
      const t=CALENDAR_TYPES.find(x=>x.id===e.type);
      return `<div class="admin-item" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:${t?t.color:'var(--text3)'};flex-shrink:0"></div>
          <div style="font-size:13px;font-weight:600;flex:1">${t?t.label:e.type}</div>
          <button class="abtn abtn-d" onclick="removeCalendarEvent('${team.id}','${dateStr}',${i})">Quitar</button>
        </div>
        ${e.type==='partido'?`<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding-left:16px">
          <input value="${e.opponent||''}" placeholder="Rival" style="flex:1;min-width:120px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:12px;outline:none" onblur="setCalendarEventField('${team.id}','${dateStr}',${i},'opponent',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
          <select style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:12px;outline:none" onchange="setCalendarEventField('${team.id}','${dateStr}',${i},'homeAway',this.value)">
            <option value="local" ${e.homeAway==='local'?'selected':''}>Local</option>
            <option value="visitante" ${e.homeAway==='visitante'?'selected':''}>Visitante</option>
          </select>
          ${e.crestUrl?`<img src="${e.crestUrl}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid var(--border2)">`:''}
          <label class="abtn" style="cursor:pointer;font-size:11px">Escudo rival<input type="file" accept="image/*" style="display:none" onchange="handleCrestUpload(this,'${team.id}','${dateStr}',${i})"></label>
        </div>`:''}
      </div>`;
    }).join(''):`<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin actividades este día.</div>`}
    <div style="padding:14px 16px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Agregar actividad (podés combinar varias el mismo día)</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${CALENDAR_TYPES.map(t=>`<button class="lib-filter" onclick="addCalendarEvent('${team.id}','${dateStr}','${t.id}')">+ ${t.label}</button>`).join('')}
      </div>
    </div>
    <div style="padding:0 16px 16px">
      <button class="abtn abtn-p" style="width:100%" onclick="saveCalendarDay('${team.id}','${dateStr}')">${isDirty?'Guardar cambios de este día':'✓ Guardado'}</button>
    </div>
  </div>`;
}
window.renderCalendarDayEditor=renderCalendarDayEditor;

function addCalendarEvent(teamId, dateStr, type) {
  const team = S.teams.find(t=>t.id===teamId); if(!team) return;
  if(!team.calendar) team.calendar={};
  const events = getCalendarEvents(team,dateStr);
  const newEvent = type==='partido' ? {type,opponent:'',homeAway:'local'} : {type};
  team.calendar[dateStr] = [...events, newEvent];
  markCalendarDayDirty(dateStr);
  renderMain();
}
window.addCalendarEvent=addCalendarEvent;

function removeCalendarEvent(teamId, dateStr, idx) {
  const team = S.teams.find(t=>t.id===teamId); if(!team) return;
  const events = getCalendarEvents(team,dateStr);
  events.splice(idx,1);
  team.calendar[dateStr] = events;
  markCalendarDayDirty(dateStr);
  renderMain();
}
window.removeCalendarEvent=removeCalendarEvent;

function setCalendarEventField(teamId, dateStr, idx, field, value) {
  const team = S.teams.find(t=>t.id===teamId); if(!team) return;
  const events = getCalendarEvents(team,dateStr);
  if(!events[idx]) return;
  events[idx][field]=value;
  team.calendar[dateStr]=events;
  markCalendarDayDirty(dateStr);
}
window.setCalendarEventField=setCalendarEventField;

// Escribe TODO el día de una — un solo viaje a Firestore, igual que
// "Guardar" en la rutina. Sigue siendo un merge por fecha puntual (dot-path),
// nunca el calendario entero, así que un partido cargado en otra pestaña/
// sesión mientras tanto no se pierde — solo cambia lo mismo que ya cambiaba
// antes, ahora en un solo paquete en vez de uno por click.
async function saveCalendarDay(teamId, dateStr) {
  const team = S.teams.find(t=>t.id===teamId); if(!team) return;
  const events = getCalendarEvents(team, dateStr);
  showToast('Guardando…');
  try {
    if(events.length) await updateDocSafe(doc(db,'teams',teamId), {[`calendar.${dateStr}`]: events});
    else await updateDocSafe(doc(db,'teams',teamId), {[`calendar.${dateStr}`]: deleteField()});
    S._calDirtyDates?.delete(dateStr);
    showToast('✓ Guardado');
    renderMain();
  } catch(e) { showToast('Error al guardar: '+e.message); }
}
window.saveCalendarDay = saveCalendarDay;

// ══════════════════════════════════════════════════════════════
// ── INFORME EXPORTABLE DEL EQUIPO ────────────────────────────
// ══════════════════════════════════════════════════════════════
// ── INFORME DEL EQUIPO — 4 sub-pestañas dentro de la misma pestaña "Informe" ──
// Resumen (semáforo + puntos clave, ya existía) / Reunión de staff / Médico /
// Cómo llegamos al partido. Todo anidado por equipo, no como sección aparte.
const TEAM_REPORT_TABS = [
  {id:'resumen', label:'Resumen'},
  {id:'staff', label:'Reunión de staff'},
  {id:'medico', label:'Médico'},
  {id:'partido', label:'Cómo llegamos al partido'},
];

function setTeamReportSubview(v) {
  S.teamReportSubview = v;
  renderMain();
  if(v==='resumen') setTimeout(()=>{
    const mem = (S.adminAthletes||[]).filter(a=>getTeamStatsMemberUids(S.teamView||{}).includes(a.uid));
    drawTeamReportTrendChart(mem);
    drawTeamQuadrantChart(mem,'report-quadrant-chart','reportQuadrantChartInstance','cmj','ice');
  },80);
  if(v==='medico') setTimeout(()=>{
    const mem = (S.adminAthletes||[]).filter(a=>getTeamStatsMemberUids(S.teamView||{}).includes(a.uid));
    drawMedicalReportCharts(mem);
  },80);
}
window.setTeamReportSubview = setTeamReportSubview;

function renderTeamReport(team) {
  const reportUids = getTeamStatsMemberUids(team);
  const members = (S.adminAthletes||[]).filter(a=>reportUids.includes(a.uid));
  if(!members.length) return `<div class="empty-state">No hay atletas en este equipo todavía.</div>`;

  const sub = S.teamReportSubview || 'resumen';
  const tabsHtml = `<div class="no-print" style="display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap">
    <div style="font-size:15px;font-weight:700;flex:1;min-width:160px">Informe del equipo</div>
    <button class="abtn abtn-p" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  </div>
  <div class="no-print" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
    ${TEAM_REPORT_TABS.map(t=>`<button class="snav-tab ${sub===t.id?'active':''}" onclick="setTeamReportSubview('${t.id}')">${t.label}</button>`).join('')}
  </div>`;

  if(sub==='staff') return tabsHtml + renderStaffMeetingReport(team, members);
  if(sub==='medico') return tabsHtml + renderMedicalReport(team, members);
  if(sub==='partido') return tabsHtml + renderMatchReadinessReport(team, members);
  return tabsHtml + renderTeamReportResumen(team, members);
}
window.renderTeamReport=renderTeamReport;

function renderTeamReportResumen(team, members) {
  const today = todayLocal();
  const periodDays = 30;
  const periodStart = new Date(); periodStart.setDate(periodStart.getDate()-periodDays);
  const periodStartStr = toLocalDateStr(periodStart);
  const prevPeriodStart = new Date(); prevPeriodStart.setDate(prevPeriodStart.getDate()-periodDays*2);
  const prevPeriodStartStr = toLocalDateStr(prevPeriodStart);

  const injSum = getTeamInjurySummary(members);
  let altas=0, bajas=0;
  members.forEach(a=>{
    const archive = a._personal?.injuryArchive||[];
    altas += archive.filter(x=>x.resolvedDate>=periodStartStr).length;
    const active = a._personal?.injuries||{};
    Object.values(active).forEach(inj=>{
      const start = inj.history?.length ? inj.history[0].date : null;
      if(start && start>=periodStartStr) bajas++;
    });
  });
  const injuryRate = members.length ? Math.round((injSum.total/members.length)*100) : 0;

  const summaries = members.map(computeAthleteLoadSummary);
  const avgW = avgMetric(summaries,'avgWellness');
  const avgAcwr = avgMetric(summaries,'acwr');

  // Tendencia: wellness promedio de este período vs el período anterior —
  // reconstruido día a día a partir de lo que cada atleta cargó, para poder
  // decir "subiendo/bajando", no solo la foto de hoy.
  const wellnessAvgForRange = (startStr, endStr) => {
    let total=0, count=0;
    members.forEach(a=>{
      const w = a._personal?.wellness||{};
      Object.entries(w).forEach(([date,entry])=>{
        if(date>=startStr && date<endStr) {
          const {pct,allFilled} = getWellnessScore(entry);
          if(allFilled) { total+=pct; count++; }
        }
      });
    });
    return count?Math.round(total/count):null;
  };
  const wellnessPrev = wellnessAvgForRange(prevPeriodStartStr, periodStartStr);
  const wellnessNow  = wellnessAvgForRange(periodStartStr, today);
  const wellnessTrend = (wellnessPrev!=null && wellnessNow!=null)
    ? (wellnessNow>wellnessPrev+2 ? {arrow:'↑',color:'#16803c',txt:'mejorando'} : wellnessNow<wellnessPrev-2 ? {arrow:'↓',color:'#b91c1c',txt:'bajando'} : {arrow:'→',color:'#6b6b6b',txt:'estable'})
    : null;

  const jumpRows = members.map(a=>{
    const evals = a._personal?.evals||{};
    const recs = evals['cmj']||[];
    const best = recs.length?Math.max(...recs.map(r=>r.height)):null;
    return {name:a.name||a.email, best};
  }).filter(r=>r.best!=null).sort((a,b)=>b.best-a.best);
  const teamAvgCMJ = jumpRows.length ? Math.round(jumpRows.reduce((s,r)=>s+r.best,0)/jumpRows.length) : null;

  const positions = [...new Set(members.map(a=>a.position).filter(Boolean))];

  // ── Semáforo (RAG) — mismos umbrales que ya usa el resto de la app, para
  // que el informe diga lo mismo que la pantalla en vivo. ──────────────────
  const wellnessRag = avgW==null ? {c:'#9aa0a6',bg:'#f2f2f2',label:'Sin datos'}
    : avgW>=75 ? {c:'#16803c',bg:'#e7f5ec',label:'Bien'}
    : avgW>=50 ? {c:'#a16207',bg:'#fdf3e3',label:'Normal'}
    : {c:'#b91c1c',bg:'#fdecea',label:'Fatigado'};
  const acwrRag = avgAcwr==null ? {c:'#9aa0a6',bg:'#f2f2f2',label:'Sin datos'}
    : avgAcwr<0.8 ? {c:'#6b4fc7',bg:'#f0ecfb',label:'Subcarga'}
    : avgAcwr<=1.3 ? {c:'#16803c',bg:'#e7f5ec',label:'Zona óptima'}
    : avgAcwr<=1.5 ? {c:'#a16207',bg:'#fdf3e3',label:'Precaución'}
    : {c:'#b91c1c',bg:'#fdecea',label:'Riesgo'};
  const injRag = injSum.grave>0 ? {c:'#b91c1c',bg:'#fdecea',label:'Atención'}
    : injSum.total>0 ? {c:'#a16207',bg:'#fdf3e3',label:'Vigilar'}
    : {c:'#16803c',bg:'#e7f5ec',label:'Sin novedad'};

  // ── Puntos clave automáticos — lo que de verdad cambia una decisión, no
  // todos los números crudos (así lo recomiendan los propios fabricantes:
  // Catapult, por ejemplo, aconseja entregar un subconjunto chico y accionable). ──
  const highlights = [];
  if(injSum.grave>0) highlights.push(`⚠ ${injSum.grave} lesión${injSum.grave===1?'':'es'} grave${injSum.grave===1?'':'es'} activa${injSum.grave===1?'':'s'} — revisar antes de la próxima sesión.`);
  const riskyAthletes = summaries.filter(s=>s.acwr!=null && s.acwr>1.5).length;
  if(riskyAthletes>0) highlights.push(`⚠ ${riskyAthletes} atleta${riskyAthletes===1?'':'s'} en zona de riesgo por ACWR alto (>1.5).`);
  if(wellnessTrend && wellnessTrend.txt!=='estable') highlights.push(`${wellnessTrend.arrow} El wellness del plantel viene ${wellnessTrend.txt} respecto a los ${periodDays} días previos (${wellnessPrev}% → ${wellnessNow}%).`);
  if(bajas>altas && bajas>0) highlights.push(`${bajas} lesiones nuevas contra ${altas} altas en los últimos ${periodDays} días — el balance es negativo.`);
  if(!highlights.length) highlights.push('Sin alertas relevantes — el plantel está estable en wellness, carga y lesiones.');

  return `<div class="print-report" style="background:#fff;color:#111;border-radius:8px;padding:28px;max-width:760px;margin:0 auto;font-family:'Inter',-apple-system,sans-serif">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #243B6B;padding-bottom:14px;margin-bottom:18px">
      <div>
        <div style="font-size:20px;font-weight:800;color:#243B6B">${team.name}</div>
        <div style="font-size:12px;color:#555;margin-top:2px">${team.sport||''}${team.category?' · '+team.category:''} · ${members.length} atletas</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#243B6B;text-transform:uppercase;letter-spacing:.05em;font-weight:700">G-Metrics Performance Lab</div>
        <div style="font-size:12px;color:#555;margin-top:2px">Período: últimos ${periodDays} días · Generado ${today}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
      <div style="background:${wellnessRag.bg};border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:9px;color:${wellnessRag.c};text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:4px">Wellness</div>
        <div style="font-size:20px;font-weight:800;color:${wellnessRag.c}">${avgW!=null?avgW+'%':'—'}</div>
        <div style="font-size:10px;color:${wellnessRag.c};font-weight:600">${wellnessRag.label}${wellnessTrend?' '+wellnessTrend.arrow:''}</div>
      </div>
      <div style="background:${acwrRag.bg};border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:9px;color:${acwrRag.c};text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:4px">Carga (ACWR)</div>
        <div style="font-size:20px;font-weight:800;color:${acwrRag.c}">${avgAcwr!=null?avgAcwr.toFixed(2):'—'}</div>
        <div style="font-size:10px;color:${acwrRag.c};font-weight:600">${acwrRag.label}</div>
      </div>
      <div style="background:${injRag.bg};border-radius:8px;padding:12px;text-align:center">
        <div style="font-size:9px;color:${injRag.c};text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:4px">Lesiones</div>
        <div style="font-size:20px;font-weight:800;color:${injRag.c}">${injSum.total}</div>
        <div style="font-size:10px;color:${injRag.c};font-weight:600">${injRag.label} · ${injuryRate}% plantel</div>
      </div>
    </div>

    <div style="background:#F0F3F9;border-left:3px solid #243B6B;border-radius:0 6px 6px 0;padding:12px 14px;margin-bottom:22px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#243B6B;margin-bottom:6px">Puntos clave</div>
      ${highlights.map(h=>`<div style="font-size:12px;line-height:1.6">${h}</div>`).join('')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">
      <div>
        <div style="font-size:13px;font-weight:700;margin-bottom:8px">Evolución del plantel (${periodDays} días)</div>
        <div style="height:170px;position:relative"><canvas id="report-trend-chart"></canvas></div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;margin-bottom:8px">Cuadrante — CMJ vs. Índice Elástico</div>
        <div style="height:170px;position:relative"><canvas id="report-quadrant-chart"></canvas></div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:700;margin-bottom:8px">Lesiones activas por gravedad</div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <div style="flex:1;background:#fdecea;border-radius:6px;padding:8px;text-align:center"><div style="font-size:16px;font-weight:800;color:#b91c1c">${injSum.grave}</div><div style="font-size:9px;color:#b91c1c;text-transform:uppercase">Graves</div></div>
      <div style="flex:1;background:#fdf3e3;border-radius:6px;padding:8px;text-align:center"><div style="font-size:16px;font-weight:800;color:#a16207">${injSum.moderada}</div><div style="font-size:9px;color:#a16207;text-transform:uppercase">Moderadas</div></div>
      <div style="flex:1;background:#e7f5ec;border-radius:6px;padding:8px;text-align:center"><div style="font-size:16px;font-weight:800;color:#16803c">${injSum.leve}</div><div style="font-size:9px;color:#16803c;text-transform:uppercase">Leves</div></div>
      <div style="flex:1;background:#f2f2f2;border-radius:6px;padding:8px;text-align:center"><div style="font-size:16px;font-weight:800;color:#16803c">${altas}</div><div style="font-size:9px;color:#555;text-transform:uppercase">Altas (${periodDays}d)</div></div>
      <div style="flex:1;background:#f2f2f2;border-radius:6px;padding:8px;text-align:center"><div style="font-size:16px;font-weight:800;color:#b91c1c">${bajas}</div><div style="font-size:9px;color:#555;text-transform:uppercase">Bajas nuevas</div></div>
    </div>
    ${injSum.details.length?`<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <thead><tr style="background:#f2f2f2"><th style="padding:6px 10px;text-align:left">Atleta</th><th style="padding:6px 10px;text-align:left">Zona</th><th style="padding:6px 10px;text-align:center">Dolor</th><th style="padding:6px 10px;text-align:center">Gravedad</th></tr></thead>
      <tbody>${injSum.details.sort((a,b)=>{const r={grave:3,moderada:2,leve:1}; return (r[b.sev]||1)-(r[a.sev]||1) || b.pain-a.pain;}).map(d=>{
        const col = d.sev==='grave'?'#b91c1c':d.sev==='moderada'?'#a16207':'#16803c';
        const bg = d.sev==='grave'?'#fdecea':d.sev==='moderada'?'#fdf3e3':'#e7f5ec';
        const lbl = d.sev==='grave'?'Grave':d.sev==='moderada'?'Moderada':'Leve';
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${d.athlete}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${d.zoneId}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${d.pain}/10</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center"><span style="background:${bg};color:${col};font-weight:700;font-size:10px;padding:2px 8px;border-radius:10px">${lbl}</span></td></tr>`;
      }).join('')}</tbody>
    </table>`:'<div style="font-size:12px;color:#777;margin-bottom:20px">Sin lesiones activas.</div>'}

    <div style="font-size:13px;font-weight:700;margin-bottom:8px">Test de salto — mejor CMJ registrado</div>
    ${jumpRows.length?`<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px">
      <thead><tr style="background:#f2f2f2"><th style="padding:6px 10px;text-align:left">Atleta</th><th style="padding:6px 10px;text-align:center">CMJ (cm)</th><th style="padding:6px 10px;text-align:center">vs. promedio</th></tr></thead>
      <tbody>${jumpRows.map(r=>{
        const diff = teamAvgCMJ!=null ? Math.round(r.best-teamAvgCMJ) : null;
        const diffTxt = diff==null?'—':diff===0?'≈ promedio':(diff>0?'+':'')+diff+'cm';
        const diffCol = diff==null?'#777':diff>0?'#16803c':diff<0?'#b91c1c':'#777';
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${r.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${r.best}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:${diffCol}">${diffTxt}</td></tr>`;
      }).join('')}</tbody>
    </table>
    <div style="font-size:11px;color:#777;margin-bottom:20px">Promedio del equipo: ${teamAvgCMJ}cm</div>`:'<div style="font-size:12px;color:#777;margin-bottom:20px">Sin tests de salto registrados.</div>'}

    ${positions.length?`<div style="font-size:13px;font-weight:700;margin-bottom:8px">Promedios por posición</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <thead><tr style="background:#f2f2f2"><th style="padding:6px 10px;text-align:left">Posición</th><th style="padding:6px 10px;text-align:center">Wellness</th><th style="padding:6px 10px;text-align:center">ACWR</th></tr></thead>
      <tbody>${positions.map(pos=>{
        const group=members.filter(a=>a.position===pos);
        const s=group.map(computeAthleteLoadSummary);
        const w=avgMetric(s,'avgWellness'); const ac=avgMetric(s,'acwr');
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${pos}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${w!=null?w+'%':'—'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${ac!=null?ac.toFixed(2):'—'}</td></tr>`;
      }).join('')}</tbody>
    </table>`:''}

    <div style="font-size:10px;color:#999;text-align:right;margin-top:20px">Generado el ${today} · G-Metrics Performance Lab</div>
  </div>`;
}
window.renderTeamReportResumen=renderTeamReportResumen;

// ── REUNIÓN DE STAFF ─────────────────────────────────────────
function renderStaffMeetingReport(team, members) {
  const today = todayLocal();
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);
  const sevenDaysAgoStr = toLocalDateStr(sevenDaysAgo);

  // Lesiones reales vs. molestias — acá SÍ se ven las dos, es la vista de
  // adentro del equipo (a diferencia del Dashboard, que solo alerta lesiones).
  const injSum = getTeamInjurySummary(members);
  const realInjuriesActive = members.reduce((s,a)=>s+Object.values(a._personal?.injuries||{}).filter(inj=>inj.pain>0&&isRealInjury(inj)).length,0);
  const molestiasActive = Math.max(0, injSum.total-realInjuriesActive);

  const cargaronHoy = members.filter(a=>a._personal?.wellness?.[today]).length;
  const nuncaCargaron = members.filter(a=>!Object.keys(a._personal?.wellness||{}).length).length;
  const diasPromedio = members.length ? (members.reduce((s,a)=>{
    const w=a._personal?.wellness||{};
    return s+Object.keys(w).filter(d=>d>=sevenDaysAgoStr&&d<=today).length;
  },0)/members.length).toFixed(1) : '0.0';
  const noCargaronHoy = members.filter(a=>!a._personal?.wellness?.[today]);

  const fatigaVals=[];
  const dolorRows = members.map(a=>{
    const w = a._personal?.wellness||{};
    const dates = Object.keys(w).sort();
    const lastDate = dates[dates.length-1];
    const last = lastDate?w[lastDate]:null;
    if(last?.fatiga!=null) fatigaVals.push(last.fatiga);
    return {name:a.name||a.email, fatiga:last?.fatiga??null, dolor:last?.dolor_muscular??null, date:lastDate};
  }).filter(r=>r.fatiga!=null||r.dolor!=null);
  const fatigaMedia = fatigaVals.length ? (fatigaVals.reduce((s,v)=>s+v,0)/fatigaVals.length).toFixed(1) : null;

  const matchRows = members.map(a=>{
    const logs = a._personal?.history?._sessionLogs||[];
    const sum = getMatchMinutesSummary(logs);
    return {name:a.name||a.email, ...sum};
  }).filter(r=>r.partidosJugados>0).sort((x,y)=>y.minutosTotales-x.minutosTotales);

  return `<div class="admin-section">
    <div class="admin-section-title">Resumen ejecutivo del plantel — ${today}</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border)">
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${members.length}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Plantel</div></div>
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800;color:${realInjuriesActive>0?'var(--red)':'var(--text)'}">${realInjuriesActive}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Lesionadas</div></div>
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${molestiasActive}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Molestias</div></div>
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${fatigaMedia??'—'}${fatigaMedia?'/5':''}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Fatiga media</div></div>
    </div>
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Cumplimiento del wellness diario</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);margin-bottom:10px">
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800;color:${cargaronHoy===members.length?'var(--green)':'var(--text)'}">${cargaronHoy}/${members.length}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Cargaron hoy</div></div>
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${diasPromedio}/7</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Promedio días (últ. 7)</div></div>
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800;color:${nuncaCargaron>0?'var(--amber)':'var(--text)'}">${nuncaCargaron}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Nunca cargaron</div></div>
    </div>
    ${noCargaronHoy.length?`<div style="padding:0 16px 14px;font-size:11px;color:var(--text3)">Todavía no cargaron hoy: ${noCargaronHoy.map(a=>a.name||a.email).join(', ')}</div>`:''}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Fatiga y dolor por jugador</div>
    <div style="padding:6px 16px 4px;font-size:11px;color:var(--text3)">Se usa el último check-in cargado por cada jugador — no hace falta que todas hayan completado el wellness el mismo día.</div>
    ${dolorRows.length?dolorRows.map(r=>`
      <div style="padding:8px 16px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="font-size:12px;font-weight:600">${r.name}</div>
        <div style="font-size:11px;color:var(--text3)">Fatiga ${r.fatiga??'—'}/5 · Dolor ${r.dolor??'—'}/5${r.date?' · '+r.date:''}</div>
      </div>`).join(''):`<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin registros de wellness todavía.</div>`}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Participación en partidos del plantel</div>
    <div style="padding:6px 16px 4px;font-size:11px;color:var(--text3)">Quiénes acumulan más minutos de partido — cruzalo con fatiga y ACWR antes de definir la próxima carga.</div>
    ${matchRows.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:8px 10px;color:var(--text2)">Jugador</th>
        <th style="text-align:center;padding:8px 10px;color:var(--text2)">Partidos</th>
        <th style="text-align:center;padding:8px 10px;color:var(--text2)">Minutos totales</th>
        <th style="text-align:center;padding:8px 10px;color:var(--text2)">Promedio</th>
      </tr></thead>
      <tbody>${matchRows.map(r=>`<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px;font-weight:600">${r.name}</td>
        <td style="padding:8px 10px;text-align:center">${r.partidosJugados}</td>
        <td style="padding:8px 10px;text-align:center">${r.minutosTotales}</td>
        <td style="padding:8px 10px;text-align:center">${r.promedioPorPartido}'</td>
      </tr>`).join('')}</tbody>
    </table></div>`:`<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin partidos cargados en "Carga de hoy" todavía.</div>`}
  </div>`;
}
window.renderStaffMeetingReport = renderStaffMeetingReport;

// ── INFORME MÉDICO ────────────────────────────────────────────
// Toda la data que necesitan tanto el HTML del informe médico como sus
// gráficos Chart.js — un solo lugar para no tener el conteo de lesiones
// duplicado (y potencialmente divergente) entre render y dibujo.
function computeMedicalReportStats(members) {
  const periodDays = 90;
  const periodStart = new Date(); periodStart.setDate(periodStart.getDate()-periodDays);
  const periodStartStr = toLocalDateStr(periodStart);

  let activeToday=0, grave=0, moderada=0, leve=0, totalHistoric=0;
  const zoneCounts = {};
  const monthCounts = {};
  const posStats = {}; // {posLabel: {active, exposureHours}}

  members.forEach(a=>{
    const posLabel = a.position || 'Sin puesto';
    if(!posStats[posLabel]) posStats[posLabel] = {active:0, exposureHours:0};
    posStats[posLabel].exposureHours += getExposureHours(a._personal?.history?._sessionLogs||[]);
    const injuries = a._personal?.injuries||{};
    Object.entries(injuries).forEach(([zoneId,inj])=>{
      if(!inj.pain||inj.pain<=0||!isRealInjury(inj)) return;
      activeToday++;
      posStats[posLabel].active++;
      const sev = inj.severity||'leve';
      if(sev==='grave') grave++; else if(sev==='moderada') moderada++; else leve++;
      zoneCounts[zoneId] = (zoneCounts[zoneId]||0)+1;
      const start = inj.history?.length ? inj.history[0].date : null;
      if(start && start>=periodStartStr) monthCounts[start.slice(0,7)] = (monthCounts[start.slice(0,7)]||0)+1;
    });
    const archive = a._personal?.injuryArchive||[];
    archive.forEach(r=>{
      totalHistoric++;
      if(r.startDate>=periodStartStr) monthCounts[r.startDate.slice(0,7)] = (monthCounts[r.startDate.slice(0,7)]||0)+1;
    });
  });
  totalHistoric += activeToday;

  const prevalencia = members.length ? Math.round((activeToday/members.length)*100) : 0;
  const lesionesPorJugador = members.length ? (totalHistoric/members.length).toFixed(2) : '0.00';
  const totalExposureHours = members.reduce((s,a)=>s+getExposureHours(a._personal?.history?._sessionLogs||[]),0);
  const incidencia = totalExposureHours>0 ? +((activeToday/totalExposureHours)*1000).toFixed(1) : null;

  const allBodyZones = [...BODY_ZONES.front, ...BODY_ZONES.back];
  const zoneRows = Object.entries(zoneCounts).map(([zid,count])=>({label:allBodyZones.find(z=>z.id===zid)?.label||zid, count})).sort((a,b)=>b.count-a.count);
  const monthKeys = Object.keys(monthCounts).sort();

  const positionRows = Object.entries(posStats)
    .filter(([,s])=>s.active>0)
    .map(([label,s])=>({label, active:s.active, incidencia: s.exposureHours>0 ? +((s.active/s.exposureHours)*1000).toFixed(1) : null}))
    .sort((a,b)=>b.active-a.active);

  return {periodDays, activeToday, grave, moderada, leve, prevalencia, lesionesPorJugador, incidencia, zoneRows, monthKeys, monthCounts, positionRows};
}
window.computeMedicalReportStats = computeMedicalReportStats;

function renderMedicalReport(team, members) {
  const st = computeMedicalReportStats(members);
  const maxZoneCount = st.zoneRows.length ? Math.max(...st.zoneRows.map(z=>z.count)) : 1;
  const maxPosActive = st.positionRows.length ? Math.max(...st.positionRows.map(p=>p.active)) : 1;

  return `<div class="admin-section">
    <div class="admin-section-title">Resumen epidemiológico del plantel</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border)">
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800;color:${st.prevalencia>0?'var(--red)':'var(--text)'}">${st.prevalencia}%</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Prevalencia actual</div></div>
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${st.lesionesPorJugador}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Lesiones/jugador</div></div>
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${st.activeToday}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Activas hoy</div></div>
      <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${st.incidencia??'—'}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Incidencia /1000hs</div></div>
    </div>
    <div style="padding:8px 16px 12px;font-size:11px;color:var(--text3)">La incidencia por horas de exposición se calcula con los minutos de entrenamiento/partido que cada atleta ya carga en "Carga de hoy".</div>
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Zonas del cuerpo más afectadas</div>
    ${st.zoneRows.length?st.zoneRows.map(z=>`
      <div style="padding:6px 16px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span>${z.label}</span><span style="font-weight:700">${z.count}</span></div>
        <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="height:100%;background:var(--red);border-radius:4px;width:${(z.count/maxZoneCount)*100}%"></div></div>
      </div>`).join(''):`<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin lesiones activas.</div>`}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Incidencia por puesto</div>
    ${st.positionRows.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:6px 16px;color:var(--text2)">Puesto</th>
        <th style="text-align:center;padding:6px 10px;color:var(--text2)">Activas</th>
        <th style="text-align:center;padding:6px 16px;color:var(--text2)">Incidencia /1000hs</th>
      </tr></thead>
      <tbody>${st.positionRows.map(p=>`
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px 16px">${p.label}</td>
          <td style="padding:6px 10px;text-align:center;font-weight:700">${p.active}</td>
          <td style="padding:6px 16px;text-align:center">${p.incidencia??'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`:`<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin lesiones activas, o los atletas no tienen puesto cargado en su ficha.</div>`}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Distribución por gravedad</div>
    <div style="height:180px;position:relative;padding:12px 16px"><canvas id="medreport-severity-chart"></canvas></div>
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Lesiones por mes (tendencia, últimos ${st.periodDays} días)</div>
    <div style="height:180px;position:relative;padding:12px 16px">${st.monthKeys.length?'<canvas id="medreport-trend-chart"></canvas>':`<div style="font-size:13px;color:var(--text3)">Sin lesiones nuevas en el período.</div>`}</div>
  </div>`;
}
window.renderMedicalReport = renderMedicalReport;

function drawMedicalReportCharts(members) {
  if(typeof Chart==='undefined') return;
  const st = computeMedicalReportStats(members);
  try { S._medreportSeverityChart?.destroy(); } catch(e){}
  try { S._medreportTrendChart?.destroy(); } catch(e){}

  const sevCanvas = document.getElementById('medreport-severity-chart');
  if(sevCanvas && (st.grave+st.moderada+st.leve)>0) {
    S._medreportSeverityChart = new Chart(sevCanvas, {
      type:'doughnut',
      data:{ labels:['Graves','Moderadas','Leves'], datasets:[{ data:[st.grave,st.moderada,st.leve], backgroundColor:['#C33A2C','#C67C0F','#1F7A4D'], borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{color:cssVar('--text','#1A1D26'),font:{size:11},boxWidth:10} } } }
    });
  }

  const trendCanvas = document.getElementById('medreport-trend-chart');
  if(trendCanvas && st.monthKeys.length) {
    S._medreportTrendChart = new Chart(trendCanvas, {
      type:'bar',
      data:{ labels:st.monthKeys, datasets:[{ label:'Lesiones', data:st.monthKeys.map(k=>st.monthCounts[k]), backgroundColor:'#3b7dd8', borderRadius:6 }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{
          x:{ ticks:{color:cssVar('--text','#1A1D26'),font:{size:10}}, grid:{display:false} },
          y:{ beginAtZero:true, ticks:{color:cssVar('--text','#1A1D26'),font:{size:10},stepSize:1}, grid:{color:'rgba(18,21,28,0.08)'} }
        }
      }
    });
  }
}
window.drawMedicalReportCharts = drawMedicalReportCharts;

// ── CÓMO LLEGAMOS AL PARTIDO ──────────────────────────────────
// Busca el próximo evento de tipo "partido" en el calendario del equipo —
// mismo dato que ya carga el editor de calendario (rival, local/visitante,
// escudo), sin pedir nada nuevo.
function getNextMatch(team) {
  const today = todayLocal();
  const cal = team.calendar || {};
  const dates = Object.keys(cal).filter(d=>d>=today).sort();
  for(const d of dates) {
    const partido = getCalendarEvents(team,d).find(e=>e.type==='partido');
    if(partido) return {date:d, ...partido};
  }
  return null;
}
window.getNextMatch = getNextMatch;

function renderMatchReadinessReport(team, members) {
  const today = todayLocal();
  const nextMatch = getNextMatch(team);
  const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);
  const sevenDaysAgoStr = toLocalDateStr(sevenDaysAgo);

  let noWellness7d = 0;
  const rows = members.map(a=>{
    const personal = a._personal||{};
    const logs = personal.history?._sessionLogs||[];
    const m = calcLoadMetrics(logs);
    const wellness = personal.wellness||{};
    const recentEntries = Object.entries(wellness).filter(([d])=>d>=sevenDaysAgoStr && d<=today);
    const fatigaVals = recentEntries.map(([,w])=>w.fatiga).filter(v=>v!=null);
    const dolorVals = recentEntries.map(([,w])=>w.dolor_muscular).filter(v=>v!=null);
    const fatigaAvg = fatigaVals.length ? +(fatigaVals.reduce((s,v)=>s+v,0)/fatigaVals.length).toFixed(1) : null;
    const dolorAvg = dolorVals.length ? +(dolorVals.reduce((s,v)=>s+v,0)/dolorVals.length).toFixed(1) : null;
    if(!recentEntries.length) noWellness7d++;

    const injuries = personal.injuries||{};
    const realInjuries = Object.values(injuries).filter(inj=>inj.pain>0 && isRealInjury(inj));
    const rank = {grave:3,moderada:2,leve:1};
    const worst = realInjuries.reduce((w,inj)=>(rank[inj.severity]||1)>(rank[w?.severity]||0)?inj:w, null);
    let disponibilidad = {label:'Disponible', color:'var(--green)'};
    if(worst?.severity==='grave') disponibilidad = {label:'No disponible', color:'var(--red)'};
    else if(worst?.severity==='moderada') disponibilidad = {label:'En duda', color:'var(--amber)'};

    const matchSummary = getMatchMinutesSummary(logs);
    return {a, fatigaAvg, dolorAvg, acwr:m?.acwr??null, disponibilidad, diasSinPartido:matchSummary.daysSinceLastMatch};
  });

  const fatigaVals = rows.map(r=>r.fatigaAvg).filter(v=>v!=null);
  const dolorVals = rows.map(r=>r.dolorAvg).filter(v=>v!=null);
  const fatigaMedia = fatigaVals.length ? (fatigaVals.reduce((s,v)=>s+v,0)/fatigaVals.length).toFixed(1) : null;
  const dolorMedia = dolorVals.length ? (dolorVals.reduce((s,v)=>s+v,0)/dolorVals.length).toFixed(1) : null;
  const acwrRiesgo = rows.filter(r=>r.acwr!=null && r.acwr>1.5).length;
  const lesionadasEnDuda = rows.filter(r=>r.disponibilidad.label!=='Disponible').length;

  let html = `<div class="admin-section">`;
  if(nextMatch) {
    const daysUntil = Math.max(0, Math.ceil((new Date(nextMatch.date)-new Date(today))/(1000*60*60*24)));
    html += `<div class="admin-section-title">Próximo partido</div>
      <div style="padding:14px 16px;display:flex;align-items:center;gap:12px">
        ${nextMatch.crestUrl?`<img src="${nextMatch.crestUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid var(--border2)">`:''}
        <div>
          <div style="font-size:15px;font-weight:700">${nextMatch.opponent?'vs. '+nextMatch.opponent:'Partido'} · ${nextMatch.homeAway==='visitante'?'✈️ Visitante':'🏠 Local'}</div>
          <div style="font-size:12px;color:var(--text3)">${nextMatch.date} · en ${daysUntil} día${daysUntil===1?'':'s'}</div>
        </div>
      </div>`;
  } else {
    html += `<div class="admin-section-title">Próximo partido</div><div style="padding:12px 16px;font-size:13px;color:var(--text3)">No hay ningún partido cargado en el Calendario para este equipo.</div>`;
  }
  html += `</div>`;

  html += `<div class="admin-section"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border)">
    <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${fatigaMedia??'—'}${fatigaMedia?'/5':''}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Fatiga media (7d)</div></div>
    <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800">${dolorMedia??'—'}${dolorMedia?'/5':''}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Dolor medio (7d)</div></div>
    <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800;color:${acwrRiesgo>0?'var(--red)':'var(--text)'}">${acwrRiesgo}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">ACWR en riesgo</div></div>
    <div style="background:var(--bg2);padding:12px;text-align:center"><div style="font-size:18px;font-weight:800;color:${lesionadasEnDuda>0?'var(--amber)':'var(--text)'}">${lesionadasEnDuda}</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Lesionadas/en duda</div></div>
  </div></div>`;

  if(noWellness7d>0) html += `<div style="background:var(--amber-dim);color:var(--amber);border-radius:var(--rsm);padding:10px 14px;margin-bottom:14px;font-size:12px">⚠ ${noWellness7d} atleta${noWellness7d===1?'':'s'} sin wellness cargado en los últimos 7 días — su estado real podría no estar reflejado.</div>`;

  html += `<div class="admin-section"><div class="admin-section-title">Disponibilidad del plantel</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:8px 10px;color:var(--text2)">Atleta</th>
        <th style="text-align:center;padding:8px 10px;color:var(--text2)">Disponibilidad</th>
        <th style="text-align:center;padding:8px 10px;color:var(--text2)">Fatiga</th>
        <th style="text-align:center;padding:8px 10px;color:var(--text2)">Dolor</th>
        <th style="text-align:center;padding:8px 10px;color:var(--text2)">ACWR</th>
        <th style="text-align:center;padding:8px 10px;color:var(--text2)">Días s/partido</th>
      </tr></thead>
      <tbody>
      ${[...rows].sort((x,y)=>(x.a.name||x.a.email||'').localeCompare(y.a.name||y.a.email||'')).map(r=>`
        <tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="adminOpenAthlete('${r.a.uid}')">
          <td style="padding:8px 10px;font-weight:600">${r.a.name||r.a.email}</td>
          <td style="padding:8px 10px;text-align:center"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${r.disponibilidad.color}22;color:${r.disponibilidad.color}">${r.disponibilidad.label}</span></td>
          <td style="padding:8px 10px;text-align:center">${r.fatigaAvg??'—'}</td>
          <td style="padding:8px 10px;text-align:center">${r.dolorAvg??'—'}</td>
          <td style="padding:8px 10px;text-align:center">${r.acwr!=null?r.acwr.toFixed(2):'—'}</td>
          <td style="padding:8px 10px;text-align:center">${r.diasSinPartido??'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;

  return html;
}
window.renderMatchReadinessReport = renderMatchReadinessReport;

// ── RUTINA DE EQUIPO CON SEGUIMIENTO INDIVIDUAL ──────────────────────────
// A diferencia de team.trainingDays (compartido, sin seguimiento, todos ven
// lo mismo), esto reutiliza el motor de rutinas individuales — cada jugador
// la recibe como si se la hubieras asignado uno por uno (semana a semana,
// %RM contra su propio 1RM, seguimiento de completado). La rutina en sí se
// arma genérica en el Gestor de rutinas, sin pensar en puestos; el mapeo
// bloque→puesto se define acá, al momento de asignarla a ESTE equipo — así
// la misma rutina se puede reusar en otro equipo con otro mapeo distinto.
function renderTeamRoutineAssignSection(team) {
  let html = `<div class="admin-section">
    <div class="admin-section-title">Rutina de equipo (con seguimiento individual)</div>`;
  if(team.assignedRoutineId) {
    const r = S.routines.find(x=>x.id===team.assignedRoutineId);
    const memberUids = team.memberUids||[];
    const assignedCount = memberUids.filter(uid=>(S.adminAthletes||[]).find(a=>a.uid===uid)?.assignedRoutine===team.assignedRoutineId).length;
    html += `<div class="admin-item">
      <div><div class="admin-item-lbl">${r?r.name:'(rutina eliminada)'}</div><div class="admin-item-sub">Asignada a ${assignedCount}/${memberUids.length} jugadores del roster</div></div>
      <button class="abtn" onclick="openTeamRoutineAssign('${team.id}')">Cambiar</button>
    </div>`;
  } else {
    html += `<div class="admin-item">
      <div class="admin-item-sub">Todavía no le asignaste una rutina con seguimiento a este equipo.</div>
      <button class="abtn abtn-p" onclick="openTeamRoutineAssign('${team.id}')">Asignar rutina</button>
    </div>`;
  }
  if(S._teamRoutineAssign?.teamId===team.id) html += renderTeamRoutineAssignWizard();
  html += `</div>`;
  return html;
}
window.renderTeamRoutineAssignSection = renderTeamRoutineAssignSection;

function renderTeamRoutineAssignWizard() {
  const st = S._teamRoutineAssign;
  const routine = S.routines.find(r=>r.id===st.routineId);
  let html = `<div style="padding:12px 16px;border-top:1px solid var(--border)">
    <select class="abtn" style="width:100%;margin-bottom:10px" onchange="setTeamRoutineAssignRoutine(this.value)">
      <option value="">Elegí una rutina...</option>
      ${S.routines.map(r=>`<option value="${r.id}" ${st.routineId===r.id?'selected':''}>${r.name}</option>`).join('')}
    </select>`;
  if(routine) {
    const sessionNames = getOrderedSessionNames(routine);
    html += `<div style="font-size:12px;color:var(--text3);margin-bottom:8px">Marcá para qué puestos es cada bloque — dejalo sin marcar si es para todos.</div>`;
    sessionNames.forEach(sName=>{
      const blocks = routine.sessions[sName]||[];
      if(!blocks.length) return;
      html += `<div style="font-size:11px;font-weight:700;color:var(--accent-text);text-transform:uppercase;margin:10px 0 4px">${sName}</div>`;
      blocks.forEach(b=>{
        const sel = st.blockPositions[b.id] || [];
        html += `<div style="padding:8px 0;border-top:1px solid var(--border)">
          <div style="font-size:13px;font-weight:600;margin-bottom:6px">${b.label} — ${b.title||''}</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            ${ALL_POSITIONS.map(p=>`<button class="abtn ${sel.includes(p)?'abtn-p':''}" style="font-size:11px;padding:4px 9px" onclick="toggleTeamRoutineBlockPosition('${b.id}','${p}')">${p}</button>`).join('')}
          </div>
          ${!sel.length?`<div style="font-size:10px;color:var(--text3);margin-top:3px">Sin marcar = lo ven todos</div>`:''}
        </div>`;
      });
    });
    const need = sessionNames.length;
    const sortedSel = [...st.selectedWeekdays].sort((a,b)=>a-b);
    html += `<div style="font-size:12px;color:var(--text3);margin:14px 0 8px;padding-top:10px;border-top:1px solid var(--border)">¿Qué días reales de la semana entrena el equipo? (elegí ${need})</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
        ${WEEKDAY_LABELS.map((label,dow)=>{
          const checked = st.selectedWeekdays.includes(dow);
          const order = checked ? sortedSel.indexOf(dow) : -1;
          const mapped = (checked && order>=0) ? sessionNames[order % need] : null;
          return `<button class="abtn ${checked?'abtn-p':''}" style="justify-content:space-between;display:flex;width:100%" onclick="toggleTeamRoutineWeekday(${dow})">
            <span>${label}</span>${mapped?`<span style="font-size:11px;opacity:.85">${mapped}</span>`:''}
          </button>`;
        }).join('')}
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:11px;color:var(--text3);display:block;margin-bottom:4px">¿Desde qué día arranca la Semana 1?</label>
        <input type="date" class="abtn" style="width:100%" value="${st.startDate}" onchange="setTeamRoutineAssignStartDate(this.value)">
      </div>`;
    const ready = st.selectedWeekdays.length===need;
    const memberCount = (S.teams.find(t=>t.id===st.teamId)?.memberUids||[]).length;
    html += `<button class="abtn abtn-p" style="width:100%;${ready?'':'opacity:.4;pointer-events:none'}" onclick="confirmTeamRoutineAssign()">Asignar a todo el equipo (${memberCount} jugador${memberCount!==1?'es':''})</button>`;
  }
  html += `<button class="abtn" style="width:100%;margin-top:8px" onclick="closeTeamRoutineAssign()">Cancelar</button>
  </div>`;
  return html;
}
window.renderTeamRoutineAssignWizard = renderTeamRoutineAssignWizard;

function openTeamRoutineAssign(teamId) {
  const team = S.teams.find(t=>t.id===teamId);
  const routineId = team?.assignedRoutineId||'';
  S._teamRoutineAssign = {
    teamId,
    routineId,
    blockPositions: team?.routineBlockPositions ? JSON.parse(JSON.stringify(team.routineBlockPositions)) : {},
    selectedWeekdays: [],
    startDate: todayLocal(), // se corrige abajo, una vez que los atletas frescos estén cargados, si corresponde
  };
  ensureAdminAthletes().then(()=>{
    // BUG encontrado y corregido acá: si el equipo YA tenía esta misma
    // rutina asignada, arrancamos con la fecha real de inicio de sus
    // jugadores (no "hoy") — antes, reabrir esto solo para ajustar
    // posiciones/bloques (sin querer cambiar nada de fechas) reseteaba a
    // Semana 1 a TODO el plantel al confirmar, aunque llevaran semanas.
    const st = S._teamRoutineAssign;
    if(st && st.routineId===routineId && team) {
      const memberWithDate = (team.memberUids||[])
        .map(uid=>S.adminAthletes?.find(a=>a.uid===uid))
        .find(a=>a && a.assignedRoutine===routineId && a.routineAssignedDate);
      if(memberWithDate) st.startDate = memberWithDate.routineAssignedDate;
    }
    renderMain();
  });
}
window.openTeamRoutineAssign = openTeamRoutineAssign;

function closeTeamRoutineAssign() { S._teamRoutineAssign = null; renderMain(); }
window.closeTeamRoutineAssign = closeTeamRoutineAssign;

function setTeamRoutineAssignRoutine(routineId) {
  if(!S._teamRoutineAssign) return;
  S._teamRoutineAssign.routineId = routineId;
  S._teamRoutineAssign.blockPositions = {};
  S._teamRoutineAssign.selectedWeekdays = [];
  renderMain();
}
window.setTeamRoutineAssignRoutine = setTeamRoutineAssignRoutine;

function toggleTeamRoutineBlockPosition(blockId, position) {
  const st = S._teamRoutineAssign; if(!st) return;
  if(!st.blockPositions[blockId]) st.blockPositions[blockId]=[];
  const arr = st.blockPositions[blockId];
  const i = arr.indexOf(position);
  if(i>=0) arr.splice(i,1); else arr.push(position);
  renderMain();
}
window.toggleTeamRoutineBlockPosition = toggleTeamRoutineBlockPosition;

function toggleTeamRoutineWeekday(dow) {
  const st = S._teamRoutineAssign; if(!st) return;
  const i = st.selectedWeekdays.indexOf(dow);
  if(i>=0) st.selectedWeekdays.splice(i,1); else st.selectedWeekdays.push(dow);
  renderMain();
}
window.toggleTeamRoutineWeekday = toggleTeamRoutineWeekday;

function setTeamRoutineAssignStartDate(val) {
  const st = S._teamRoutineAssign; if(!st||!val) return;
  st.startDate = val;
}
window.setTeamRoutineAssignStartDate = setTeamRoutineAssignStartDate;

async function confirmTeamRoutineAssign() {
  const st = S._teamRoutineAssign; if(!st || !st.routineId) return;
  const team = S.teams.find(t=>t.id===st.teamId); if(!team) return;
  const routine = S.routines.find(r=>r.id===st.routineId); if(!routine) return;
  const sessionNames = getOrderedSessionNames(routine);
  if(st.selectedWeekdays.length !== sessionNames.length) { showToast(`Elegí ${sessionNames.length} día${sessionNames.length!==1?'s':''} de entrenamiento`); return; }
  const memberUids = team.memberUids||[];
  if(!confirm(`Esto le asigna "${routine.name}" a los ${memberUids.length} jugadores del roster, reemplazando la rutina individual que tuviera cada uno. ¿Confirmás?`)) return;
  showToast('Asignando…');
  try {
    await setDoc(doc(db,'teams',team.id), {assignedRoutineId:st.routineId, routineBlockPositions:st.blockPositions}, {merge:true});
    team.assignedRoutineId = st.routineId;
    team.routineBlockPositions = st.blockPositions;
    for(const uid of memberUids) {
      await writeRoutineAssignment(uid, st.routineId, [...st.selectedWeekdays], st.startDate);
    }
    showToast(`✓ Rutina asignada a ${memberUids.length} jugador${memberUids.length!==1?'es':''}`);
    S._teamRoutineAssign = null;
    renderMain();
  } catch(e) { console.error(e); showToast('Error al asignar: '+e.message); }
}
window.confirmTeamRoutineAssign = confirmTeamRoutineAssign;

function renderTeamRutina(team) {
  const days=team.trainingDays||[];
  let html = renderTeamRoutineAssignSection(team);
  html+=`<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <span style="font-size:11px;color:var(--text3)">Color:</span>
    ${TEAM_COLORS.map(c=>`<div onclick="setTeamColor('${team.id}','${c}')" style="width:22px;height:22px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${team.color===c?'#fff':'transparent'};transition:border .15s"></div>`).join('')}
  </div>`;

  if(days.length) {
    const curIdx = S.teamDayIdx||0;
    html+=`<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;overflow-x:auto">
      ${days.map((d,i)=>`<button class="snav-tab ${curIdx===i?'active':''}" onclick="S.teamDayIdx=${i};renderMain()">${d.title||'Día '+(i+1)}</button>`).join('')}
    </div>`;
    const day=days[Math.min(curIdx,days.length-1)];
    const di=Math.min(curIdx,days.length-1);
    if(day) {
      const blocks=day.blocks||[];
      html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:14px;font-weight:600">${day.title||'Día '+(di+1)}</div>
        <div style="display:flex;gap:6px">
          <button class="abtn abtn-p" onclick="openTeamDayEditor('${team.id}',${di})">✏️ Editar</button>
          <button class="abtn abtn-d" onclick="deleteDay('${team.id}',${di})">×</button>
        </div>
      </div>`;
      if(!blocks.length){
        html+=`<div class="empty-state" style="margin-bottom:10px">Sin ejercicios aún.<br><span style="font-size:12px">Tocá "Editar" para planificar esta sesión.</span></div>`;
      } else {
        html+=blocks.map(b=>{
          const exList=b.categories.flatMap(c=>c.exercises);
          return `<div class="card" style="padding:12px;margin-bottom:8px">
            <div style="font-size:12px;font-weight:600;color:var(--purple);margin-bottom:6px">${b.label} — ${b.title}</div>
            ${exList.map(ex=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:13px;font-weight:500">${ex.name}</span>
              <span style="color:var(--accent-text);font-size:12px;font-weight:600;background:var(--accent-dim);padding:3px 8px;border-radius:20px;white-space:nowrap">${formatExSummary(ex)||'—'}</span>
            </div>`).join('')}
          </div>`;
        }).join('');
      }
      html+=`<div style="font-size:11px;color:var(--text3);margin:12px 0 6px;text-transform:uppercase;letter-spacing:.06em">Notas por jugador</div>
        <div class="player-note"><span class="player-note-name">+ Nota</span>
          <input style="flex:1;background:transparent;border:none;outline:none;font-size:12px;color:var(--text)" placeholder="Jugador: nota específica..." onkeydown="if(event.key==='Enter')addPlayerNote('${team.id}',${di},this)">
        </div>
        ${(day.playerNotes||[]).map((n,ni)=>`<div class="player-note"><span class="player-note-name">${n.player}</span><span class="player-note-text">${n.note}</span><span style="cursor:pointer;color:var(--text3);font-size:14px;margin-left:8px" onclick="deletePlayerNote('${team.id}',${di},${ni})">×</span></div>`).join('')}`;
    }
  } else {
    html+=`<div class="empty-state">Sin sesiones de entrenamiento aún.<br><span style="font-size:12px">Agregá una sesión para comenzar a planificar.</span></div>`;
  }

  html+=`<button class="add-block-btn" style="margin-top:10px" onclick="addTrainingDay('${team.id}')">+ Agregar sesión</button>`;

  // Reconciliación: el roster (texto libre) y las cuentas realmente vinculadas
  // (memberUids, vía código de invitación) son dos listas separadas — esto puede
  // desalinearse con muchos atletas. Marcamos qué nombres del roster tienen
  // cuenta real, y avisamos si hay cuentas vinculadas que no están en el roster.
  const linkedMembers = (S.adminAthletes||[]).filter(a=>(team.memberUids||[]).includes(a.uid) || a.teamId===team.id);
  const unmatchedLinked = linkedMembers.filter(a=>!(team.players||[]).some(p=>namesLikelyMatch(p,a.name)||normPersonName(p)===normPersonName(a.email)));

  html+=`<div class="admin-section" style="margin-top:16px"><div class="admin-section-title">Jugadores</div>
    <div style="padding:12px 16px 4px">
    ${(team.players||[]).map((p,pi)=>{
      const match=linkedMembers.find(a=>namesLikelyMatch(a.name,p)||normPersonName(a.email)===normPersonName(p));
      if(!match) {
        return `<div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--rsm);padding:12px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:14px;font-weight:600">${p} <span style="font-size:10px;color:var(--amber);font-weight:500;margin-left:6px">sin cuenta todavía</span></div>
          <button class="abtn abtn-d" onclick="deletePlayer('${team.id}',${pi})">−</button>
        </div>`;
      }
      const today = todayLocal();
      const w = match._personal?.wellness?.[today];
      const {pct, allFilled} = getWellnessScore(w);
      const wState = getWellnessState(allFilled?pct:null);
      const injuries = getActiveInjuriesSummary(match._personal);
      const sevRank = {grave:3, moderada:2, leve:1};
      const worstInjury = injuries.length ? injuries.reduce((worst,i)=>(sevRank[i.severity]||1)>(sevRank[worst.severity]||1)?i:worst, injuries[0]) : null;
      const injColor = worstInjury ? (severityInfo(worstInjury.severity)||severityInfo('leve')).color : null;
      const matchInfo = getRecentMatchCardInfo(match._personal, today);

      // Alertas puntuales de HOY: estrés, sueño y dolor muscular reportados bajos.
      const alerts = [];
      if(w?.estres!==undefined && w.estres<=2) alerts.push({emoji:'😩',label:'Estresado'});
      if(w?.sueño_calidad!==undefined && w.sueño_calidad<=2) alerts.push({emoji:'😴',label:'Durmió mal'});
      if(w?.dolor_muscular!==undefined && w.dolor_muscular<=2) alerts.push({emoji:'💪',label:'Dolor muscular'});
      if(w?.sueño_horas!==undefined && w.sueño_horas!=='' && +w.sueño_horas<=5) alerts.push({emoji:'⏰',label:`Poco sueño (${w.sueño_horas}h)`});

      return `<div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--rsm);padding:12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="cursor:pointer;flex-shrink:0" onclick="adminOpenAthlete('${match.uid}')">${avatarHtml(match.name||p, match.color, 36, match.photoUrl)}</div>
          <div style="flex:1;min-width:0;cursor:pointer" onclick="adminOpenAthlete('${match.uid}')">
            <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${match.name||p}</div>
            <div style="font-size:11px;color:var(--text3)">${match.position||'Sin posición cargada'}</div>
          </div>
          <div style="text-align:center;flex-shrink:0;cursor:pointer" onclick="adminOpenAthlete('${match.uid}')">
            <div style="font-size:16px;font-weight:800;color:${wState.color}">${allFilled?pct+'%':'—'}</div>
            <div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">Wellness</div>
          </div>
          <div style="flex-shrink:0">${sparklineSvg(getWellnessSparklineData(match._personal,14), wState.color, 44, 20)}</div>
          <button class="abtn abtn-d" onclick="deletePlayer('${team.id}',${pi})">−</button>
        </div>
        ${(worstInjury || alerts.length || matchInfo) ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          ${matchInfo?`<span style="font-size:11px;padding:3px 9px;border-radius:20px;background:var(--accent-dim);color:var(--accent-text);font-weight:700">🏆 ${matchInfo.mins}' · RPE ${matchInfo.rpe}${matchInfo.daysAgo>0?' · hace '+matchInfo.daysAgo+'d':''}</span>`:''}
          ${matchInfo?.hadMolestia?`<span style="font-size:11px;padding:3px 9px;border-radius:20px;background:var(--red-dim);color:var(--red);font-weight:700">⚠ molestia en el partido</span>`:''}
          ${worstInjury?`<span style="font-size:11px;padding:3px 9px;border-radius:20px;background:${injColor}22;color:${injColor};border:1px solid ${injColor}">🩹 ${worstInjury.zoneLabel} · ${severityInfo(worstInjury.severity)?.label||'Leve'} · dolor ${worstInjury.pain}/10</span>`:''}
          ${alerts.map(al=>`<span style="font-size:11px;padding:3px 9px;border-radius:20px;background:var(--bg3);color:var(--text2);border:1px solid var(--border)">${al.emoji} ${al.label}</span>`).join('')}
        </div>`:''}
      </div>`;
    }).join('')}
    </div>
    <div class="admin-item">
      <input id="new-player-inp" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" placeholder="Nombre del jugador">
      <button class="abtn abtn-p" onclick="addPlayer('${team.id}')">Agregar</button>
    </div></div>
  ${unmatchedLinked.length?`<div class="admin-section" style="margin-top:12px;border-color:var(--amber)">
    <div class="admin-section-title" style="color:var(--amber)">⚠ ${unmatchedLinked.length} atleta${unmatchedLinked.length===1?'':'s'} con cuenta vinculada pero fuera del roster</div>
    ${unmatchedLinked.map(a=>`<div class="admin-item">
      <div class="admin-item-lbl" style="cursor:pointer" onclick="adminOpenAthlete('${a.uid}')">${a.name||a.email}</div>
      <button class="abtn abtn-p" onclick="addLinkedPlayerToRoster('${team.id}','${(a.name||a.email).replace(/'/g,"\\'")}')">+ Agregar al roster</button>
    </div>`).join('')}
  </div>`:''}
  <button class="abtn abtn-d" style="width:100%;margin-top:8px;padding:10px;border-radius:var(--r)" onclick="deleteTeam('${team.id}')">Eliminar equipo</button>`;
  return html;
}


const TEAM_COLORS = ['#d4647a','#b07ab8','#d4944a','#7ab88a','#68b4c8','#c87890','#a45870','#d4a8b0'];

// Avatar circular con iniciales en vez de un simple punto de color — más fácil
// de escanear en listas largas y le da más carácter a cada atleta.
function getInitials(name) {
  if(!name) return '?';
  const parts=name.trim().split(/\s+/).filter(Boolean);
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}
window.getInitials=getInitials;

function avatarHtml(name, color, size, photoUrl) {
  size = size||28;
  if(photoUrl) return `<img src="${photoUrl}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;display:block" alt="">`;
  const fs = Math.round(size*0.36);
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color||'var(--accent)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;font-size:${fs}px;font-weight:700;letter-spacing:-.02em">${getInitials(name)}</div>`;
}
window.avatarHtml=avatarHtml;

// Actualiza el avatar circular del topbar/sidebar (mi propia foto o iniciales)
// — separado del render de #main porque el topbar no se vuelve a pintar en
// cada renderMain(), así que hay que llamarlo a mano después de cualquier
// cambio a nombre o foto de perfil.
function updateTopbarAvatar() {
  if(!S.userData) return;
  const initial = (S.userData.name || 'U')[0].toUpperCase();
  const myPhotoUrl = S.userData.photoUrl;
  ['avatar-btn','avatar-btn-mobile'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    if(myPhotoUrl) el.innerHTML = `<img src="${myPhotoUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block" alt="">`;
    else { el.innerHTML=''; el.textContent=initial; }
  });
}
window.updateTopbarAvatar=updateTopbarAvatar;

// Foto del atleta si la tiene, o si no, el típico círculo con silueta
// genérica de hombros para arriba (en vez de iniciales) — para la lista de
// Atletas individuales, donde el objetivo es distinguir de un vistazo quién
// es quién, no decorar con color.
function athleteListAvatarHtml(a, size) {
  size = size || 44;
  if (a.photoUrl) return `<img src="${a.photoUrl}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;display:block" alt="">`;
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--bg3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden">
    <svg width="${Math.round(size*0.62)}" height="${Math.round(size*0.62)}" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke-linecap="round"/></svg>
  </div>`;
}
window.athleteListAvatarHtml = athleteListAvatarHtml;

// Ícono minimalista por deporte — para diferenciar de un vistazo la lista de
// atletas individuales sin depender de leer el texto.
function sportIconSvg(sport) {
  const s = (sport||'').toLowerCase();
  const common = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  if (s.includes('tenis') || s.includes('tennis')) {
    // Raqueta
    return `<svg ${common}><ellipse cx="9" cy="8" rx="6" ry="7" transform="rotate(-20 9 8)"/><line x1="13.5" y1="12.5" x2="20" y2="21"/></svg>`;
  }
  if (s.includes('basq') || s.includes('básq') || s.includes('basket')) {
    // Pelota de básquet
    return `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.5 5.5c3 3 3 10 0 13M18.5 5.5c-3 3-3 10 0 13"/></svg>`;
  }
  if (s.includes('handball') || s.includes('balonmano')) {
    // Persona lanzando — figura en zancada, brazo atrás con la pelota
    return `<svg ${common}><circle cx="9.5" cy="3.6" r="1.7"/><path d="M9.5 6v6"/><path d="M9.5 7.5l3.5-2 2-3"/><circle cx="15.3" cy="2.2" r="1.1"/><path d="M9.5 8l-3.5 1.5-1.5 3"/><path d="M9.5 12l3 2 1 5"/><path d="M9.5 12l-3.5 1-3 5"/></svg>`;
  }
  if (s.includes('futbol') || s.includes('fútbol') || s.includes('soccer')) {
    // Pelota de fútbol
    return `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 7l3.5 2.5-1.3 4.1h-4.4L8.5 9.5 12 7zM12 7V4M9.6 13.6L6 15M14.4 13.6L18 15M9.5 9.5L6 8M14.5 9.5L18 8"/></svg>`;
  }
  if (s.includes('rugby')) {
    // Pelota de rugby (ovalada)
    return `<svg ${common}><ellipse cx="12" cy="12" rx="9" ry="6" transform="rotate(-30 12 12)"/><path d="M7 9l10 6M9 7.5l6 9"/></svg>`;
  }
  return '';
}
window.sportIconSvg = sportIconSvg;

// Íconos de línea con personalidad propia para tarjetas de métricas —
// reemplazan los emoji genéricos (⚡💪❤️👥) por trazos consistentes con
// el resto del set de íconos de la app.
function metricIconSvg(key) {
  const c = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  const paths = {
    ice: '<path d="M3 12h3l2-6 2 12 2-12 2 12 2-6h3"/>',
    coord: '<path d="M18.18 8c5.1 0 5.1 8 0 8-5.1 0-7.73-8-12.36-8-5.1 0-5.1 8 0 8 4.63 0 7.26-8 12.36-8z"/>',
    asym: '<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0L5 7z"/><path d="M19 7l-3 6a3 3 0 0 0 6 0l-3-6z"/>',
    bestcmj: '<rect x="4" y="14" width="3" height="7"/><rect x="10.5" y="10" width="3" height="11"/><rect x="17" y="5" width="3" height="16"/><path d="M18.5 1.6l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.7-1.2.7.2-1.4-1-1 1.4-.2z" fill="currentColor"/>',
    atletas: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17.5" cy="9" r="2.3"/><path d="M14.8 20a4.7 4.7 0 0 1 8.2-3.1"/>',
    entrenaron: '<line x1="7" y1="12" x2="17" y2="12"/><rect x="3" y="9" width="3" height="6" rx="1"/><rect x="18" y="9" width="3" height="6" rx="1"/><rect x="6" y="7" width="2.4" height="10" rx="1"/><rect x="15.6" y="7" width="2.4" height="10" rx="1"/>',
    wellness: '<path d="M12 20.2s-7-4.4-9.3-9A5 5 0 0 1 12 6.3 5 5 0 0 1 21.3 11.2c-2.3 4.6-9.3 9-9.3 9z"/><path d="M6 12.5h2.6l1.4-2.6 1.8 4.3 1.4-2.6H18"/>'
  };
  return '<svg '+c+'>'+(paths[key]||'')+'</svg>';
}
window.metricIconSvg = metricIconSvg;

// Mini-gráfico de tendencia sin ejes ni leyenda — para mostrar "hacia dónde viene
// yendo" un número al lado del valor puntual, sin ocupar el espacio de un gráfico
// completo. values: array ordenado de más viejo a más nuevo, con null = sin dato.
function sparklineSvg(values, color, w, h) {
  w=w||44; h=h||16;
  const present = values.filter(v=>v!==null&&v!==undefined);
  if(present.length<2) return '';
  const min=Math.min(...present), max=Math.max(...present);
  const range=(max-min)||1;
  const stepX = values.length>1 ? w/(values.length-1) : 0;
  const pad=1.5;
  const pts = values.map((v,i)=>{
    if(v===null||v===undefined) return null;
    const x=i*stepX;
    const y = pad + (h-pad*2) - ((v-min)/range)*(h-pad*2);
    return x.toFixed(1)+','+y.toFixed(1);
  });
  const segments=[]; let cur=[];
  pts.forEach(p=>{ if(p===null){ if(cur.length>1) segments.push(cur); cur=[]; } else cur.push(p); });
  if(cur.length>1) segments.push(cur);
  if(!segments.length) return '';
  const polylines = segments.map(seg=>`<polyline points="${seg.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;flex-shrink:0">${polylines}</svg>`;
}
window.sparklineSvg=sparklineSvg;

// Serie de wellness (%) de los últimos N días de un atleta, para el sparkline.
function getWellnessSparklineData(personalData, days) {
  days=days||7;
  const wellness=personalData?.wellness||{};
  const today=new Date();
  const vals=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date(today); d.setDate(d.getDate()-i);
    const ds=toLocalDateStr(d);
    const {pct,allFilled}=getWellnessScore(wellness[ds]);
    vals.push(allFilled?pct:null);
  }
  return vals;
}
window.getWellnessSparklineData=getWellnessSparklineData;

// Micro-animación de conteo (0 → valor) para que los números clave se sientan
// menos estáticos. Busca elementos con data-countup="valor" y anima el texto.
// El textContent inicial YA es el valor final (fallback correcto si algo falla);
// la animación solo lo sobreescribe temporalmente mientras corre.
function runCountUps(containerId) {
  const root = containerId ? document.getElementById(containerId) : document;
  if(!root) return;
  root.querySelectorAll('[data-countup]').forEach(el=>{
    const target=parseFloat(el.getAttribute('data-countup'));
    if(isNaN(target)) return;
    const suffix=el.getAttribute('data-suffix')||'';
    const decimals=el.getAttribute('data-decimals')?+el.getAttribute('data-decimals'):0;
    const duration=500;
    const start=performance.now();
    function tick(now) {
      const p=Math.min(1,(now-start)/duration);
      const eased=1-Math.pow(1-p,3);
      el.textContent=(target*eased).toFixed(decimals)+suffix;
      if(p<1) requestAnimationFrame(tick);
      else el.textContent=target.toFixed(decimals)+suffix;
    }
    requestAnimationFrame(tick);
  });
}
window.runCountUps=runCountUps;

async function createTeam() {
  const name=prompt('Nombre del equipo:'); if(!name) return;
  const sport=prompt('Deporte (ej: Handball, Básquet):','');
  const category=prompt('Categoría (ej: Liga de Honor):','');
  // institution = mismo valor que el nombre — es lo que el onboarding de un
  // atleta de equipo usa para encontrar este equipo y no crear uno duplicado.
  const team={id:genId(),name,institution:name,sport:sport||'',category:category||'',players:[],memberUids:[],trainingDays:[],calendar:{},color:'',createdAt:new Date().toISOString()};
  S.teams.push(team);
  await setDoc(doc(db,'teams',team.id),team);
  renderMain(); showToast('✓ Equipo creado');
}
window.createTeam=createTeam;
async function setTeamColor(teamId, color) {
  const t = S.teams.find(x=>x.id===teamId);
  if(!t) return;
  t.color = color;
  if(S.teamView?.id===teamId) S.teamView.color=color;
  try {
    await setDoc(doc(db,'teams',teamId),{color},{merge:true});
    renderMain();
  } catch(e){ showToast('Error'); }
}
window.setTeamColor=setTeamColor;
async function setAthleteColor(uid, color) {
  try {
    await setDoc(doc(db,'users',uid),{color},{merge:true});
    const a = S.adminAthletes.find(x=>x.uid===uid);
    if(a) a.color=color;
    if(S.viewingAthlete?.userData) S.viewingAthlete.userData.color=color;
    renderMain();
  } catch(e){ showToast('Error'); }
}
window.setAthleteColor=setAthleteColor;

// Posición del atleta dentro de un equipo — el desplegable depende del deporte del equipo.
const POSITION_OPTIONS = {
  handball: ['Central','Lateral','Extremo','Pivote','Arquero'],
  basquet: ['Base','Escolta','Alero','Pivot'],
};
function getPositionOptionsForSport(sport) {
  const s=(sport||'').toLowerCase();
  if(s.includes('handball')||s.includes('balonmano')) return POSITION_OPTIONS.handball;
  if(s.includes('basquet')||s.includes('básquet')||s.includes('basket')) return POSITION_OPTIONS.basquet;
  return null; // deporte no reconocido: se usa un campo de texto libre en su lugar
}
window.getPositionOptionsForSport=getPositionOptionsForSport;

// Todas las posiciones conocidas, de todos los deportes — se usa al asignar
// una rutina a un equipo, para elegir a qué puestos le corresponde cada
// bloque. No depende del deporte del equipo porque la rutina en sí es
// genérica (se arma en el gestor de rutinas sin pensar en puestos todavía).
const ALL_POSITIONS = [...new Set(Object.values(POSITION_OPTIONS).flat())];
window.ALL_POSITIONS = ALL_POSITIONS;

async function setAthletePosition(uid, position) {
  try {
    await setDoc(doc(db,'users',uid),{position},{merge:true});
    const a = S.adminAthletes.find(x=>x.uid===uid);
    if(a) a.position=position;
    if(S.viewingAthlete?.userData) S.viewingAthlete.userData.position=position;
    showToast('✓ Posición guardada');
    renderMain();
  } catch(e){ showToast('Error'); }
}
window.setAthletePosition=setAthletePosition;

// Un atleta puede ser individual (rutina y seguimiento propios, sin mezclarse
// con ningún roster) y AL MISMO TIEMPO compararse con un equipo en
// Wellness/Estadísticas/Evaluaciones — ej: juega en un club pero vos lo
// llevás por fuera como preparador personal. compareTeamId es un vínculo
// SOLO para comparar; no toca teamId (que es la pertenencia real al equipo,
// con su roster y su rutina de equipo).
async function setAthleteCompareTeam(uid, teamId) {
  try {
    await setDoc(doc(db,'users',uid),{compareTeamId:teamId||null},{merge:true});
    const a = S.adminAthletes.find(x=>x.uid===uid);
    if(a) a.compareTeamId = teamId||null;
    if(S.viewingAthlete?.userData) S.viewingAthlete.userData.compareTeamId = teamId||null;
    showToast(teamId?'✓ Ahora se compara con ese equipo':'Comparación quitada');
    renderMain();
  } catch(e){ showToast('Error'); }
}
window.setAthleteCompareTeam = setAthleteCompareTeam;

// Uids a usar para Wellness/Estadísticas/Evaluaciones de un atleta: solo él
// mismo, salvo que tenga un equipo de comparación elegido — ahí se suman los
// compañeros de ese equipo (sin duplicar), para que tenga con quién
// compararse sin dejar de ser un atleta individual de verdad.
function getEffectiveGroupUids(a) {
  if (!a) return [];
  if (a.compareTeamId) {
    const team = S.teams.find(t=>t.id===a.compareTeamId);
    if (team) return [...new Set([a.uid, ...(team.memberUids||[])])];
  }
  return [a.uid];
}
window.getEffectiveGroupUids = getEffectiveGroupUids;

// La otra mitad de getEffectiveGroupUids: un atleta individual comparado con
// un equipo (compareTeamId, elegido en su Perfil) pasa a contarse TAMBIÉN
// dentro de las vistas agregadas propias de ese equipo — Wellness,
// Estadísticas, Evaluaciones e Informe — como si fuera un integrante más,
// hasta que se cambie o se saque la comparación desde su Perfil. No toca su
// rutina/roster de entrenamiento: sigue siendo un programa aparte, esto es
// solo para que sus números entren en los promedios y gráficos del equipo.
function getTeamStatsMemberUids(team) {
  if (!team) return [];
  const base = team.memberUids || [];
  const compared = (S.adminAthletes||[])
    .filter(a => a.compareTeamId === team.id && !base.includes(a.uid))
    .map(a => a.uid);
  return compared.length ? [...base, ...compared] : base;
}
window.getTeamStatsMemberUids = getTeamStatsMemberUids;

async function setAthleteName(uid, newName) {
  newName = (newName||'').trim();
  if(!newName) { showToast('El nombre no puede quedar vacío'); renderMain(); return; }
  const a = S.adminAthletes.find(x=>x.uid===uid);
  const oldName = a?.name;
  try {
    await setDoc(doc(db,'users',uid), {name:newName}, {merge:true});
    if(a) a.name = newName;
    if(S.viewingAthlete?.userData) S.viewingAthlete.userData.name = newName;
    // Si pertenece a un equipo, actualizamos también su entrada en el roster
    // de texto, para que no quede un nombre viejo dando vueltas.
    if(a?.teamId) {
      const team = S.teams.find(t=>t.id===a.teamId);
      if(team && team.players) {
        const idx = team.players.findIndex(p=>oldName && namesLikelyMatch(p,oldName));
        if(idx>=0) {
          team.players[idx] = newName;
          await updateDoc(doc(db,'teams',team.id), {players:team.players});
        }
      }
    }
    showToast('✓ Nombre actualizado');
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.setAthleteName=setAthleteName;

// Mueve a un atleta de un equipo a otro (o lo saca a "individual" si value
// queda vacío) — lo saca del roster/memberUids del equipo viejo y lo agrega
// al nuevo. Pensado para corregir cargas erróneas o fusionar equipos que
// quedaron duplicados por una diferencia de nombre en la categoría.
async function reassignAthleteTeam(uid, newTeamId) {
  const a = S.adminAthletes.find(x=>x.uid===uid);
  if(!a) return;
  const oldTeamId = a.teamId;
  try {
    if(oldTeamId && oldTeamId!==newTeamId) {
      const oldTeam = S.teams.find(t=>t.id===oldTeamId);
      if(oldTeam) {
        const memberUids = (oldTeam.memberUids||[]).filter(id=>id!==uid);
        const players = (oldTeam.players||[]).filter(p=>!namesLikelyMatch(p,a.name));
        await updateDoc(doc(db,'teams',oldTeamId), {memberUids, players});
        oldTeam.memberUids=memberUids; oldTeam.players=players;
      }
    }
    let newTeam = null;
    if(newTeamId) {
      newTeam = S.teams.find(t=>t.id===newTeamId);
      if(newTeam) {
        const memberUids = newTeam.memberUids||[];
        if(!memberUids.includes(uid)) memberUids.push(uid);
        const players = newTeam.players||[];
        if(!players.some(p=>namesLikelyMatch(p,a.name))) players.push(a.name);
        await updateDoc(doc(db,'teams',newTeamId), {memberUids, players});
        newTeam.memberUids=memberUids; newTeam.players=players;
      }
    }
    const update = { teamId: newTeamId||null };
    if(newTeam) {
      update.athleteType = 'team';
      update.institution = newTeam.institution||newTeam.name;
      update.category = newTeam.category||'';
    } else {
      // Pasa a individual: limpiamos los campos de equipo que ya no aplican.
      update.athleteType = 'individual';
      update.institution = null;
      update.category = null;
    }
    await setDoc(doc(db,'users',uid), update, {merge:true});
    a.teamId = newTeamId||null;
    if(S.viewingAthlete?.userData) Object.assign(S.viewingAthlete.userData, update);
    showToast('✓ Equipo actualizado');
    renderMain();
  } catch(e) { showToast('Error al mover de equipo'); }
}
window.reassignAthleteTeam=reassignAthleteTeam;

// Botón "Guardar" del selector de equipo: si la categoría elegida todavía no
// tiene un equipo creado (por ejemplo "Junior" si nunca armaste ese equipo a
// mano), lo crea en este momento antes de mover al atleta ahí.
async function saveReassignAthleteTeam(uid) {
  const sel = document.getElementById('reassign-sel-'+uid);
  if(!sel) return;
  const val = sel.value;
  if(!val) { await reassignAthleteTeam(uid, ''); return; }
  const [inst, cat] = val.split('|||');
  showToast('Guardando…');
  try {
    const instMap = getInstitutionsFromTeams();
    const sport = instMap[inst]?.sport || '';
    const teamId = await findOrCreateTeam(inst, cat, sport);
    if(!S.teams.find(t=>t.id===teamId)) {
      const tSnap = await getDocs(collection(db,'teams'));
      S.teams = tSnap.docs.map(d=>({id:d.id, ...d.data()}));
    }
    await reassignAthleteTeam(uid, teamId);
  } catch(e) { showToast('Error al guardar'); }
}
window.saveReassignAthleteTeam=saveReassignAthleteTeam;

// Borra TODOS los datos del atleta (perfil + datos personales) y lo saca del
// roster de su equipo — no borra la cuenta de Firebase en sí (eso solo lo
// puede hacer la persona misma, ver deleteMyAccount), pero la próxima vez
// que entre con el mismo mail, la app la manda al registro de cero.
async function resetAthleteAccount(uid) {
  const a = S.adminAthletes.find(x=>x.uid===uid);
  const name = a?.name || 'este atleta';
  if(!confirm(`¿Resetear la cuenta de ${name}? Se borran todos sus datos (tests, wellness, rutina, equipo). La próxima vez que entre va a tener que registrarse de cero con el mismo mail. Esto no se puede deshacer.`)) return;
  showToast('Reseteando…');
  try {
    if(a?.teamId) {
      const team = S.teams.find(t=>t.id===a.teamId);
      if(team) {
        const memberUids = (team.memberUids||[]).filter(id=>id!==uid);
        const players = (team.players||[]).filter(p=>!namesLikelyMatch(p,a.name));
        await updateDoc(doc(db,'teams',team.id), {memberUids, players});
        team.memberUids=memberUids; team.players=players;
      }
    }
    await deleteDoc(doc(db,'users',uid));
    await deleteDoc(doc(db,'personal',uid));
    S.adminAthletes = S.adminAthletes.filter(x=>x.uid!==uid);
    S.viewingAthlete = null;
    S.adminView = 'athletes';
    showToast('✓ Cuenta reseteada');
    renderMain();
  } catch(e) { showToast('Error al resetear'); }
}
window.resetAthleteAccount = resetAthleteAccount;

// Doble competencia ya no es un flag fijo en el perfil — se detecta solo,
// mirando si el atleta cargó 2+ partidos en los últimos 7 días. Así, si una
// semana juega doble y la siguiente no, la marca "2x" aparece y desaparece
// sola, sin que nadie tenga que tildar/destildar nada a mano.
function hasPlayedTwoGamesThisWeek(personal) {
  const logs = personal?.history?._sessionLogs || personal?.sessionLogs || [];
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  const gameLogs = logs.filter(l=>(l.activity==='partido'||l.activity==='partido2') && new Date(l.date)>=weekAgo);
  const gameDates = new Set(gameLogs.map(l=>l.date));
  return gameLogs.length>=2 || gameDates.size>=2;
}
window.hasPlayedTwoGamesThisWeek=hasPlayedTwoGamesThisWeek;

// ── DATOS AGRUPADOS (Wellness/Estadísticas dentro de Equipos y Atletas) ──
// Carga la lista de atletas si todavía no está en memoria.
async function ensureAdminAthletes() {
  if (S.adminAthletes && S.adminAthletes.length) { S.adminAthletesLoaded = true; return; }
  try {
    const snap = await getDocs(collection(db, 'users'));
    S.adminAthletes = snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.email !== ADMIN_EMAIL);
  } catch (e) { S.adminAthletes = S.adminAthletes || []; }
  S.adminAthletesLoaded = true;
}
window.ensureAdminAthletes = ensureAdminAthletes;

// Trae /personal/{uid} solo de los atletas pedidos que todavía no lo tengan
// cacheado (evita releer a todo el mundo cada vez que se abre una pestaña).
async function ensureGroupPersonalData(memberUids) {
  await ensureAdminAthletes();
  const need = S.adminAthletes.filter(a => memberUids.includes(a.uid) && !a._personal);
  if (!need.length) return;
  const results = await Promise.all(need.map(a => getDoc(doc(db, 'personal', a.uid))));
  need.forEach((a, i) => { a._personal = results[i].exists() ? results[i].data() : {}; });
}
window.ensureGroupPersonalData = ensureGroupPersonalData;

// Misma idea que ensureGroupPersonalData, pero SIN saltarse a quien ya está
// cacheado — trae a todo el grupo fresco de Firestore siempre. Se usa en los
// momentos donde ver el dato de HOY importa más que ahorrarse la lectura (ej.
// al abrir un equipo): la caché de toda-la-sesión de ensureGroupPersonalData
// está bien para no releer todo el tiempo sin querer, pero significa que
// wellness/carga recién cargados por un jugador no se veían hasta recargar
// la página entera.
async function refreshGroupPersonalData(memberUids) {
  await ensureAdminAthletes();
  const members = S.adminAthletes.filter(a => memberUids.includes(a.uid));
  if (!members.length) return;
  try {
    const results = await Promise.all(members.map(a => getDoc(doc(db, 'personal', a.uid))));
    members.forEach((a, i) => { a._personal = results[i].exists() ? results[i].data() : {}; });
  } catch(e) { console.error('Error refrescando datos del equipo', e); }
}
window.refreshGroupPersonalData = refreshGroupPersonalData;

function computeHooperScore(w) {
  if (!w) return null;
  const {pct, allFilled} = getWellnessScore(w);
  return allFilled ? pct : null;
}

function getLatestSessionLog(personal) {
  const logs = (personal?.history?._sessionLogs) || [];
  if (!logs.length) return null;
  return [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
}

function getActiveInjuriesSummary(personal) {
  const inj = personal?.injuries || {};
  const allZones = [...BODY_ZONES.front, ...BODY_ZONES.back];
  return Object.entries(inj).filter(([, v]) => v.pain > 0).map(([zid, v]) => {
    const zone = allZones.find(z => z.id === zid);
    return { zoneLabel: zone ? zone.label : zid, pain: v.pain, type: v.type || '', severity: v.severity||'leve' };
  });
}

// Resumen de carga + wellness de un atleta, usado para promediar a nivel equipo/posición.
function computeAthleteLoadSummary(a) {
  const logs=(a._personal?.history?._sessionLogs)||[];
  const m=calcLoadMetrics(logs);
  const today=todayLocal();
  const todayUA=logs.filter(l=>l.date===today).reduce((s,l)=>s+(l.ua||0),0);
  const wellness=a._personal?.wellness||{};
  const last7=Object.entries(wellness).sort((x,y)=>y[0].localeCompare(x[0])).slice(0,7);
  const wPcts=last7.map(([,w])=>getWellnessScore(w)).filter(x=>x.allFilled).map(x=>x.pct);
  const avgWellness=wPcts.length?Math.round(wPcts.reduce((s,v)=>s+v,0)/wPcts.length):null;
  return {
    todayUA: logs.length?todayUA:null,
    acuteUA: m?m.acuteUA:null,
    chronicUA: m?m.chronicUA:null,
    acwr: m&&m.acwr!=null?m.acwr:null,
    monotony: m&&m.monotony!=null?m.monotony:null,
    avgWellness,
  };
}
window.computeAthleteLoadSummary=computeAthleteLoadSummary;

// Promedia una métrica entre varios resúmenes, ignorando los atletas sin dato para esa métrica.
// Redondeado acá mismo a 1 decimal — promediar valores ya redondeados entre
// varios atletas (ej. 3 wellness / 9 personas) puede dar decimales
// interminables (79.8888...9%) si no se corta en algún lado.
function avgMetric(summaries,key) {
  const vals=summaries.map(s=>s[key]).filter(v=>v!==null&&v!==undefined&&!isNaN(v));
  if(!vals.length) return null;
  const avg = vals.reduce((a,v)=>a+v,0)/vals.length;
  return Math.round(avg*10)/10;
}
window.avgMetric=avgMetric;

// Tarjeta de métricas promedio (equipo completo o un grupo por posición).
// showLoad=false oculta las 3 tarjetas de carga (UA) — se usa en Estadísticas
// para no repetir lo que ya se ve en Wellness; ahí sí quedan.
function renderTeamMetricsCard(title,members,showLoad) {
  if(showLoad===undefined) showLoad=true;
  const summaries=members.map(computeAthleteLoadSummary);
  const avgW=avgMetric(summaries,'avgWellness');
  const avgToday=avgMetric(summaries,'todayUA');
  const avgAcute=avgMetric(summaries,'acuteUA');
  const avgChronic=avgMetric(summaries,'chronicUA');
  const avgAcwr=avgMetric(summaries,'acwr');
  const avgMono=avgMetric(summaries,'monotony');
  const wState=getWellnessState(avgW!==null?Math.round(avgW):null);
  const acwrSt=getACWRStatus(avgAcwr);
  const monSt=getMonotonyStatus(avgMono);
  return `<div class="admin-section">
    <div class="admin-section-title">${title} · ${members.length} atleta${members.length!==1?'s':''}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border)">
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:${wState.color}" ${avgW!==null?`data-countup="${avgW}" data-suffix="%"`:''}>${avgW!==null?avgW+'%':'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Wellness sem. ${infoBtn('wellness')}</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:${acwrSt.color}" ${avgAcwr!==null?`data-countup="${avgAcwr}" data-decimals="2"`:''}>${avgAcwr!==null?avgAcwr.toFixed(2):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">ACWR ${infoBtn('acwr')}</div>
        <div style="font-size:9px;color:${acwrSt.color}">${acwrSt.label}</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:${monSt.color}" ${avgMono!==null?`data-countup="${avgMono}" data-decimals="1"`:''}>${avgMono!==null?avgMono.toFixed(1):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Monotonía ${infoBtn('monotony')}</div>
        <div style="font-size:9px;color:${monSt.color}">${monSt.label}</div>
      </div>
      ${showLoad?`<div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:16px;font-weight:700" ${avgToday!==null?`data-countup="${Math.round(avgToday)}"`:''}>${avgToday!==null?Math.round(avgToday):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Carga hoy (UA) ${infoBtn('ua')}</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:16px;font-weight:700" ${avgAcute!==null?`data-countup="${Math.round(avgAcute)}"`:''}>${avgAcute!==null?Math.round(avgAcute):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Carga semana (UA)</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:16px;font-weight:700" ${avgChronic!==null?`data-countup="${Math.round(avgChronic)}"`:''}>${avgChronic!==null?Math.round(avgChronic):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Carga crónica (UA)</div>
      </div>`:''}
    </div>
  </div>`;
}
window.renderTeamMetricsCard=renderTeamMetricsCard;

// Ficha compacta de un atleta: wellness de hoy, alerta de lesión, último RPE.
// La reutilizamos acá y, más adelante, en las tarjetas del Dashboard.
function renderAthleteSummaryCard(a) {
  const today = todayLocal();
  const p = a._personal || {};
  const todayWellness = p.wellness ? p.wellness[today] : null;
  const score = todayWellness ? computeHooperScore(todayWellness) : null;
  const injuries = getActiveInjuriesSummary(p);
  const lastLog = getLatestSessionLog(p);
  const scoreColor = getWellnessState(score).color;

  // Tira de los últimos 7 días — un cuadradito por día, coloreado según el
  // wellness que marcó ESE día (mismo semáforo verde/ámbar/rojo de siempre),
  // gris si no cargó nada. De un vistazo se ve la semana completa, no solo hoy.
  const weekDates = getWeeklyComplianceDates(0);
  const dayStrip = `<div style="display:flex;gap:3px;margin-top:10px">
    ${weekDates.map(d=>{
      const sc = computeHooperScore(p.wellness?.[d]);
      const st = getWellnessState(sc);
      const dt = new Date(d+'T00:00:00');
      const initial = dt.toLocaleDateString('es-AR',{weekday:'narrow'});
      return `<div style="flex:1;text-align:center" title="${d}${sc!=null?' · Wellness '+sc+'%':' · sin wellness'}">
        <div style="font-size:8px;color:var(--text3);margin-bottom:2px;text-transform:uppercase">${initial}</div>
        <div style="height:14px;border-radius:3px;background:${sc!=null?st.color:'var(--bg3)'}"></div>
      </div>`;
    }).join('')}
  </div>`;

  return `<div class="card" style="padding:14px;cursor:pointer" onclick="adminOpenAthlete('${a.uid}')">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div>
        <div style="font-size:14px;font-weight:600">${a.name || a.email}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${a.sport || ''}${a.position ? ' · ' + a.position : ''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        ${score !== null
          ? `<div style="font-size:18px;font-weight:700;color:${scoreColor}">${score}%</div><div style="font-size:10px;color:var(--text3)">Wellness</div>`
          : `<div style="font-size:11px;color:var(--text3)">Sin wellness hoy</div>`}
      </div>
    </div>
    ${injuries.length ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
      ${injuries.map(inj => `<div style="font-size:11px;color:var(--red);display:flex;align-items:center;gap:4px">⚠️ ${inj.zoneLabel}${inj.type ? ' · ' + INJURY_TYPES[inj.type] : ''} (${inj.pain}/10)</div>`).join('')}
    </div>` : ''}
    ${lastLog ? `<div style="margin-top:6px;font-size:11px;color:var(--text3)">Última sesión: RPE ${lastLog.rpe} · ${lastLog.date}</div>` : ''}
    ${dayStrip}
  </div>`;
}
window.renderAthleteSummaryCard = renderAthleteSummaryCard;

function renderGroupWellness(memberUids, opts) {
  const members = (S.adminAthletes || []).filter(a => memberUids.includes(a.uid));
  if (!members.length) return `<div class="empty-state">No hay atletas en este grupo todavía.</div>`;

  // Vista de comparación pura (para un atleta individual que eligió
  // compararse con un equipo desde su Perfil): SU PROPIA ficha (esto se
  // había perdido en un pase anterior — el atleta desaparecía por completo,
  // solo quedaba el promedio) más el promedio agregado del equipo — nunca el
  // listado de compañeros ni sus datos puntuales, eso es exclusivo de la
  // ficha real del equipo en Equipos.
  if (opts && opts.compareOnly) {
    const selfMember = members.find(m=>m.uid===opts.selfUid);
    let html = selfMember ? renderAthleteSummaryCard(selfMember) : '';
    html += members.length > 1
      ? renderTeamMetricsCard('Promedio del equipo con el que se compara', members)
      : `<div class="empty-state">El equipo elegido para comparar todavía no tiene datos.</div>`;
    return html;
  }

  const today = todayLocal();
  const doneCount = members.filter(a => a._personal?.wellness?.[today]).length;

  // El promedio "del equipo" no dice nada cuando el grupo es un solo atleta
  // (sería literalmente la misma tarjeta repetida dos veces) — pasa siempre
  // que se abre a un atleta realmente individual, sin equipo para comparar.
  let html = '';
  if (members.length > 1) {
    html = renderTeamMetricsCard('Promedio del equipo', members);
    const withPos = members.filter(a=>a.position);
    if (withPos.length) {
      const positions = [...new Set(members.map(a=>a.position||'Sin posición'))].sort((a,b)=>{
        if(a==='Sin posición') return 1;
        if(b==='Sin posición') return -1;
        return a.localeCompare(b);
      });
      // Antes se mostraba UNA tarjeta por puesto, todas apiladas siempre —
      // con varios puestos era un choclo larguísimo para bajar. Ahora arranca
      // oculto (solo el promedio del equipo) y el admin elige si quiere ver
      // un puesto puntual o todos desplegados.
      const posFilter = S.wellnessPosFilter || '';
      html += `<div style="display:flex;gap:8px;align-items:center;margin:10px 0;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--text3)">Ver por puesto:</span>
        <select class="abtn" onchange="setWellnessPosFilter(this.value)">
          <option value="" ${!posFilter?'selected':''}>Ocultar (solo promedio del equipo)</option>
          <option value="__all__" ${posFilter==='__all__'?'selected':''}>Todos los puestos</option>
          ${positions.map(p=>`<option value="${p}" ${posFilter===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>`;
      if (posFilter==='__all__') {
        html += positions.map(pos=>renderTeamMetricsCard(pos, members.filter(a=>(a.position||'Sin posición')===pos))).join('');
      } else if (posFilter) {
        html += renderTeamMetricsCard(posFilter, members.filter(a=>(a.position||'Sin posición')===posFilter));
      }
    }
  }

  html += renderWeeklyComplianceGrid(members);

  // En desktop, una tarjeta por fila a lo ancho completo era muchísimo
  // espacio vacío para lo poco que mostraba cada una — mismo criterio que ya
  // usamos en el Dashboard (alertas / lesiones recientes en paralelo).
  const isDesktopWellness = window.innerWidth >= 900;
  html += `<div style="margin:14px 0 12px;font-size:12px;color:var(--text3)">${doneCount}/${members.length} completaron el wellness de hoy</div>
    <div style="display:${isDesktopWellness?'grid':'flex'};${isDesktopWellness?'grid-template-columns:1fr 1fr;':'flex-direction:column;'}gap:10px">${members.map(renderAthleteSummaryCard).join('')}</div>`;
  return html;
}
window.renderGroupWellness = renderGroupWellness;

function setWellnessPosFilter(v) { S.wellnessPosFilter = v; renderMain(); }
window.setWellnessPosFilter = setWellnessPosFilter;

// ── VISTA SEMANAL DE CUMPLIMIENTO (wellness + carga) ───────────────────────
// Antes solo se veía "completó hoy sí/no" — no alcanzaba para notar patrones
// como "wellness y carga de hoy cargados juntos, pero nada el día anterior"
// (típico de alguien que se olvidó de cargar ayer y lo hace hoy con la fecha
// de hoy en vez de volver atrás). Wellness y carga van SEPARADOS a propósito
// en cada celda — mezclarlos en un solo indicador escondería justo eso.
function getWeeklyComplianceDates(offsetWeeks) {
  const base = new Date(); base.setHours(0,0,0,0);
  base.setDate(base.getDate() + (offsetWeeks||0)*7);
  const dates = [];
  for(let i=6; i>=0; i--) {
    const d = new Date(base); d.setDate(d.getDate()-i);
    dates.push(toLocalDateStr(d));
  }
  return dates;
}
window.getWeeklyComplianceDates = getWeeklyComplianceDates;

function setComplianceWeekOffset(delta) {
  S._complianceWeekOffset = Math.min(0, (S._complianceWeekOffset||0) + delta);
  renderMain();
}
window.setComplianceWeekOffset = setComplianceWeekOffset;

function renderWeeklyComplianceGrid(members) {
  const offset = S._complianceWeekOffset||0;
  const dates = getWeeklyComplianceDates(offset);
  const todayStr = todayLocal();
  const colW = 46;

  const dayHead = dates.map(d=>{
    const dt = new Date(d+'T00:00:00');
    const isToday = d===todayStr;
    return `<div style="width:${colW}px;flex-shrink:0;text-align:center;font-size:9.5px;font-weight:700;color:${isToday?'var(--accent)':'var(--text3)'};text-transform:uppercase">${dt.toLocaleDateString('es-AR',{weekday:'short'}).replace('.','')}<div style="font-weight:400;font-size:9px">${dt.getDate()}/${dt.getMonth()+1}</div></div>`;
  }).join('');

  const rows = members.map(a=>{
    const p = a._personal||{};
    const logs = p.history?._sessionLogs || p.sessionLogs || [];
    const cells = dates.map(d=>{
      const wDone = getWellnessScore(p.wellness?.[d]).allFilled;
      const cDone = logs.some(l=>l.date===d);
      return `<div style="width:${colW}px;flex-shrink:0;display:flex;justify-content:center;gap:3px;padding:7px 0;cursor:pointer" onclick="viewWellnessDay('${a.uid}','${d}')" title="${(a.name||a.email||'').replace(/"/g,'')} · ${d}">
        <span style="width:8px;height:8px;border-radius:50%;background:${wDone?'var(--accent)':'var(--border2)'}"></span>
        <span style="width:8px;height:8px;border-radius:50%;background:${cDone?'var(--warm)':'var(--border2)'}"></span>
      </div>`;
    }).join('');
    return `<div style="display:flex;align-items:center;border-top:1px solid var(--border)">
      <div style="width:104px;flex-shrink:0;font-size:12px;font-weight:600;padding:8px 6px 8px 0;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" onclick="adminOpenAthlete('${a.uid}')">${a.name||a.email}</div>
      <div style="display:flex">${cells}</div>
    </div>`;
  }).join('');

  return `<div class="admin-section">
    <div class="admin-item" style="border-bottom:1px solid var(--border)">
      <div class="admin-section-title" style="margin:0">Cumplimiento semanal</div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="abtn" onclick="setComplianceWeekOffset(-1)" title="Semana anterior">‹</button>
        <span style="font-size:11px;color:var(--text3);white-space:nowrap">${offset===0?'Esta semana':(offset*-1)+' sem. atrás'}</span>
        <button class="abtn" onclick="setComplianceWeekOffset(1)" title="Semana siguiente" ${offset>=0?'disabled style="opacity:.3;cursor:not-allowed"':''}>›</button>
      </div>
    </div>
    <div style="overflow-x:auto">
      <div style="min-width:${104+7*colW}px;padding:10px 16px 4px">
        <div style="display:flex;align-items:center">
          <div style="width:104px;flex-shrink:0"></div>
          <div style="display:flex">${dayHead}</div>
        </div>
        ${rows}
      </div>
    </div>
    <div style="display:flex;gap:14px;padding:10px 16px;font-size:11px;color:var(--text3);border-top:1px solid var(--border);flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block"></span>Wellness completo</span>
      <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--warm);display:inline-block"></span>Carga cargada</span>
      <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--border2);display:inline-block"></span>Sin completar</span>
    </div>
  </div>`;
}
window.renderWeeklyComplianceGrid = renderWeeklyComplianceGrid;

// Lesiones activas del plantel agrupadas por gravedad — mismo criterio de
// gravedad clínica que el entrenador fija manualmente (independiente del
// dolor del día — ver SEVERITY_LEVELS/setInjurySeverity) que ya se usa en el resto
// de la app para pintar las molestias individuales.
function getTeamInjurySummary(members) {
  let grave=0, moderada=0, leve=0;
  const details=[];
  members.forEach(a=>{
    const injuries = a._personal?.injuries||{};
    Object.entries(injuries).forEach(([zoneId,inj])=>{
      if(!inj.pain||inj.pain<=0) return;
      const sev = inj.severity || 'leve';
      if(sev==='grave') grave++; else if(sev==='moderada') moderada++; else leve++;
      details.push({uid:a.uid, athlete:a.name||a.email, zoneId, pain:inj.pain, sev});
    });
  });
  return {grave, moderada, leve, total:grave+moderada+leve, details};
}
window.getTeamInjurySummary=getTeamInjurySummary;

function renderTeamInjuryChart(members) {
  const sum = getTeamInjurySummary(members);
  if(!sum.total) {
    return `<div class="admin-section">
      <div class="admin-section-title">Lesiones activas del plantel</div>
      <div style="padding:20px;text-align:center;font-size:13px;color:var(--green)">✓ Sin molestias activas registradas</div>
    </div>`;
  }
  return `<div class="admin-section">
    <div class="admin-section-title">Lesiones activas del plantel · ${sum.total}</div>
    <div style="display:flex;align-items:center;gap:20px;padding:16px;flex-wrap:wrap">
      <div style="width:160px;height:160px;position:relative;flex-shrink:0"><canvas id="team-injury-chart"></canvas></div>
      <div style="flex:1;min-width:160px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:50%;background:var(--red)"></div><span style="font-size:13px">Graves</span><span style="margin-left:auto;font-weight:700">${sum.grave}</span></div>
        <div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:50%;background:var(--amber)"></div><span style="font-size:13px">Moderadas</span><span style="margin-left:auto;font-weight:700">${sum.moderada}</span></div>
        <div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:50%;background:var(--green)"></div><span style="font-size:13px">Leves</span><span style="margin-left:auto;font-weight:700">${sum.leve}</span></div>
      </div>
    </div>
    <div style="padding:2px 16px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;color:var(--text2);font-size:12px;font-weight:600" onclick="toggleSection('team-injury-detail-open')">
      <span>${S.collapsedSections?.has('team-injury-detail-open')?'Ocultar':'Mostrar'} detalle por jugador</span>
      <span style="transition:transform .15s;display:inline-block;transform:rotate(${S.collapsedSections?.has('team-injury-detail-open')?'0':'-90'}deg)">›</span>
    </div>
    ${S.collapsedSections?.has('team-injury-detail-open')?`<div style="padding:0 16px 14px">
      ${sum.details.sort((a,b)=>{const r={grave:3,moderada:2,leve:1}; return (r[b.sev]||1)-(r[a.sev]||1) || b.pain-a.pain;}).map(d=>{
        const col = d.sev==='grave'?'var(--red)':d.sev==='moderada'?'var(--amber)':'var(--green)';
        const sevLabel = severityInfo(d.sev)?.label||'Leve';
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border);font-size:12px;cursor:pointer" onclick="adminOpenAthlete('${d.uid}')">
          <span>${d.athlete} <span style="color:var(--text3)">— ${d.zoneId}</span></span>
          <span style="color:${col};font-weight:600">${sevLabel} · dolor ${d.pain}/10</span>
        </div>`;
      }).join('')}</div>`:''}
  </div>`;
}
window.renderTeamInjuryChart=renderTeamInjuryChart;

function drawTeamInjuryChart(members) {
  if(typeof Chart==='undefined') return;
  const canvas=document.getElementById('team-injury-chart');
  if(!canvas) return;
  const sum=getTeamInjurySummary(members);
  if(!sum.total) return;
  if(!S.injuryChartInstance) S.injuryChartInstance=null;
  try{ if(S.injuryChartInstance) S.injuryChartInstance.destroy(); }catch(e){}

  // Sombra sutil para dar sensación de profundidad — mucho más suave que
  // antes, porque una sombra pensada para fondo oscuro se ve como una mancha
  // sucia sobre un fondo claro. Acá el objetivo es un efecto de "tarjeta
  // apenas levantada", no un halo marcado.
  const shadowPlugin = {
    id:'donutShadow',
    beforeDatasetsDraw(chart){ const ctx=chart.ctx; ctx.save(); ctx.shadowColor='rgba(18,21,28,0.18)'; ctx.shadowBlur=10; ctx.shadowOffsetY=4; },
    afterDatasetsDraw(chart){ chart.ctx.restore(); }
  };

  S.injuryChartInstance = new Chart(canvas, {
    type:'doughnut',
    data:{
      labels:['Graves','Moderadas','Leves'],
      datasets:[{
        data:[sum.grave, sum.moderada, sum.leve],
        backgroundColor:['#C33A2C','#C67C0F','#1F7A4D'],
        borderColor:'#F5F6F8', borderWidth:2,
        hoverOffset:4,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{ legend:{display:false}, tooltip:{backgroundColor:'#12151C',titleColor:'#fff',bodyColor:'#C7CDD6'} }
    },
    plugins:[shadowPlugin]
  });
}
window.drawTeamInjuryChart=drawTeamInjuryChart;

// ══════════════════════════════════════════════════════════════
// ── RANKING, RADAR Y CUADRANTE DEL EQUIPO (inspirado en Hawkin
// Dynamics / TeamBuildr / VALD) — todas colapsables por separado ──
// ══════════════════════════════════════════════════════════════
const LEADERBOARD_TESTS = [
  {id:'cmj', label:'CMJ', unit:'cm'},
  {id:'sj', label:'SJ', unit:'cm'},
  {id:'abalakov', label:'Abalakov', unit:'cm'},
  {id:'rm_press_banca', label:'Press banca', unit:'kg'},
  {id:'rm_peso_muerto', label:'Peso muerto', unit:'kg'},
  {id:'rm_sentadilla', label:'Sentadilla', unit:'kg'},
];

function collapsibleHeader(key, title) {
  const collapsed = S.collapsedSections?.has(key);
  return `<div style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleSection('${key}')">
    <div class="admin-section-title" style="padding:0;margin:0">${title}</div>
    <span style="color:var(--text3);font-size:15px;transform:rotate(${collapsed?'-90':'0'}deg);transition:transform .15s;display:inline-block">›</span>
  </div>`;
}
window.collapsibleHeader = collapsibleHeader;

function renderTeamLeaderboard(members) {
  const key = 'team-leaderboard';
  const collapsed = S.collapsedSections?.has(key);
  const testId = S.leaderboardTest || 'cmj';
  // Por defecto siempre PR histórico (mejor marca alguna vez registrada) —
  // es lo que se ve la primera vez que se abre este gráfico. "Último test"
  // es una vista alternativa que el propio prep puede elegir, no al revés.
  const mode = S.leaderboardMode || 'pr';
  const testDef = LEADERBOARD_TESTS.find(t=>t.id===testId);
  let html = `<div class="admin-section">${collapsibleHeader(key,'🏆 Ranking del equipo')}`;
  if(!collapsed) {
    const rows = members.map(a=>{
      const recs = a._personal?.evals?.[testId]||[];
      if(!recs.length) return {name:a.name||a.email, uid:a.uid, best:null};
      const best = mode==='ultimo'
        ? sortEvalRecsByDate([...recs]).slice(-1)[0].height
        : Math.max(...recs.map(r=>r.height));
      return {name:a.name||a.email, uid:a.uid, best};
    }).filter(r=>r.best!=null).sort((a,b)=>b.best-a.best);

    html += `<div style="padding:0 16px 12px;display:flex;gap:6px;flex-wrap:wrap">
      ${LEADERBOARD_TESTS.map(t=>`<button class="lib-filter ${testId===t.id?'active':''}" onclick="setLeaderboardTest('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div style="padding:0 16px 12px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <span style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em">Ordenar por</span>
      <button class="lib-filter ${mode==='pr'?'active':''}" onclick="setLeaderboardMode('pr')">PR histórico</button>
      <button class="lib-filter ${mode==='ultimo'?'active':''}" onclick="setLeaderboardMode('ultimo')">Último test</button>
    </div>`;
    html += rows.length ? rows.map((r,i)=>`
      <div class="admin-item" style="cursor:pointer" onclick="adminOpenAthlete('${r.uid}')">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:20px;text-align:center;font-size:13px;font-weight:700;color:${i===0?'var(--warm)':'var(--text3)'}">${i+1}</div>
          <div style="font-size:13px;font-weight:600">${r.name}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${jumpLevelTagHtml(testId,r.best)}
          <div style="font-size:14px;font-weight:700;color:var(--accent-text)">${r.best}${testDef.unit}</div>
        </div>
      </div>`).join('') : `<div style="padding:4px 16px 14px;font-size:13px;color:var(--text3)">Sin registros de ${testDef.label} todavía.</div>`;
  }
  html += `</div>`;
  return html;
}
window.renderTeamLeaderboard = renderTeamLeaderboard;

function setLeaderboardTest(id) { S.leaderboardTest = id; renderMain(); }
window.setLeaderboardTest = setLeaderboardTest;

function setLeaderboardMode(mode) { S.leaderboardMode = mode; renderMain(); }
window.setLeaderboardMode = setLeaderboardMode;

const RADAR_METRICS = [
  {id:'cmj', label:'CMJ'}, {id:'sj', label:'SJ'}, {id:'abalakov', label:'Abalakov'},
  {id:'rm_press_banca', label:'Banca'}, {id:'rm_peso_muerto', label:'Muerto'}, {id:'rm_sentadilla', label:'Sentadilla'},
];

function renderTeamRadarSection(members, lockedAthleteId) {
  const key = 'team-radar';
  const collapsed = S.collapsedSections?.has(key);
  let html = `<div class="admin-section">${collapsibleHeader(key,'📡 Perfil de atleta (radar)')}`;
  if(!collapsed) {
    if (!members.length) {
      html += `<div style="padding:14px 16px;font-size:12px;color:var(--text3)">Sin atletas para mostrar.</div>`;
    } else {
      // Con un solo atleta (individual sin equipo, sin comparación elegida)
      // no hay con quién comparar en un mismo momento — pero SÍ tiene
      // sentido comparar al atleta contra sí mismo en el tiempo, así que
      // forzamos ese modo en vez de no mostrar nada.
      const soloAthlete = members.length === 1;
      const mode = soloAthlete ? 'self' : (S.radarMode || 'equipo');
      // lockedAthleteId (ficha individual comparándose con un equipo): el
      // radar siempre muestra a ESE atleta, sin selector — mostrar el
      // selector acá dejaría elegir y ver el radar de cualquier compañero
      // del equipo de comparación, la misma fuga que ya se evita en el resto
      // de esta vista.
      const athleteId = lockedAthleteId || (S.radarAthleteId && members.find(a=>a.uid===S.radarAthleteId) ? S.radarAthleteId : (members[0]?.uid||''));
      const scaleLabel = soloAthlete ? 'su propio mejor valor registrado' : 'el mejor valor del equipo';
      html += soloAthlete ? '' : `<div style="padding:0 16px 10px;display:flex;gap:6px">
        <button class="lib-filter ${mode==='equipo'?'active':''}" onclick="setRadarMode('equipo')">vs. equipo</button>
        <button class="lib-filter ${mode==='self'?'active':''}" onclick="setRadarMode('self')">vs. uno mismo</button>
      </div>`;
      html += (members.length>1 && !lockedAthleteId) ? `<div style="padding:0 16px 12px">
        <select class="abtn" style="width:100%;text-align:left" onchange="setRadarAthlete(this.value)">
          ${members.map(a=>`<option value="${a.uid}" ${athleteId===a.uid?'selected':''}>${a.name||a.email}</option>`).join('')}
        </select>
      </div>` : '';
      html += `<div style="padding:0 16px 8px;height:270px;position:relative"><canvas id="team-radar-chart"></canvas></div>
      <div style="padding:0 16px 14px;font-size:11px;color:var(--text3)">${mode==='equipo'
        ? `Cada eje es el % respecto a ${scaleLabel} — línea llena: el atleta elegido. Punteada: promedio del resto del equipo.`
        : `Cada eje es el % respecto a ${scaleLabel} — línea llena: su test más reciente. Punteada: su primer test registrado.`}</div>`;
    }
  }
  html += `</div>`;
  return html;
}
window.renderTeamRadarSection = renderTeamRadarSection;

function setRadarAthlete(uid) { S.radarAthleteId = uid; renderMain(); }
window.setRadarAthlete = setRadarAthlete;

function setRadarMode(mode) { S.radarMode = mode; renderMain(); }
window.setRadarMode = setRadarMode;

function drawTeamRadarChart(members, lockedAthleteId) {
  if(typeof Chart==='undefined') return;
  if(!members.length) return;
  const canvas = document.getElementById('team-radar-chart');
  if(!canvas) return;
  const soloAthlete = members.length === 1;
  const mode = soloAthlete ? 'self' : (S.radarMode || 'equipo');
  const athleteId = lockedAthleteId || (S.radarAthleteId && members.find(a=>a.uid===S.radarAthleteId) ? S.radarAthleteId : (members[0]?.uid||''));
  const athlete = members.find(a=>a.uid===athleteId);
  if(!athlete) return;

  const bestOf = (a,id) => { const r=a._personal?.evals?.[id]||[]; return r.length?Math.max(...r.map(x=>x.height)):null; };
  const latestOf = (a,id) => { const r=a._personal?.evals?.[id]||[]; if(!r.length) return null; return sortEvalRecsByDate([...r]).slice(-1)[0].height; };
  const earliestOf = (a,id) => { const r=a._personal?.evals?.[id]||[]; if(!r.length) return null; return sortEvalRecsByDate([...r])[0].height; };
  const unitOf = (id) => id.startsWith('rm_') ? 'kg' : 'cm';

  const teamMax = {};
  RADAR_METRICS.forEach(m=>{ teamMax[m.id] = Math.max(0.01, ...members.map(a=>bestOf(a,m.id)||0)); });
  const pct = (raw,id) => raw!=null ? Math.round((raw/teamMax[id])*100) : 0;

  let rawA, rawB, labelA, labelB;
  if(mode==='self') {
    rawA = RADAR_METRICS.map(m=>latestOf(athlete,m.id));
    rawB = RADAR_METRICS.map(m=>earliestOf(athlete,m.id));
    labelA = 'Ahora'; labelB = 'Primer registro';
  } else {
    // El atleta individual se compara con su ÚLTIMO test (dónde está parado
    // ahora), mientras que el promedio del equipo sigue usando la MEJOR
    // marca histórica de cada compañero — mismo criterio que "Promedio del
    // equipo" en el resto de la app. Son dos preguntas distintas: "¿cómo
    // está este jugador hoy?" vs "¿cuál es el techo del plantel?".
    rawA = RADAR_METRICS.map(m=>latestOf(athlete,m.id));
    rawB = RADAR_METRICS.map(m=>{
      const vals = members.filter(a=>a.uid!==athlete.uid).map(a=>bestOf(a,m.id)).filter(v=>v!=null);
      return vals.length ? Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10 : null;
    });
    labelA = athlete.name||athlete.email; labelB = 'Promedio del equipo';
  }
  const valuesA = RADAR_METRICS.map((m,i)=>pct(rawA[i],m.id));
  const valuesB = RADAR_METRICS.map((m,i)=>pct(rawB[i],m.id));
  // Si "primer registro" y "ahora" son el mismo único test cargado, dibujar
  // dos líneas idénticas superpuestas no aporta nada — mostramos solo una.
  const sameData = mode==='self' && rawA.every((v,i)=>v===rawB[i]);

  const datasets = [
    { label:labelA, data:valuesA, backgroundColor:'rgba(36,59,107,0.15)', borderColor:'#243B6B', borderWidth:2, pointBackgroundColor:'#243B6B', pointRadius:3, _raw:rawA },
  ];
  if(!sameData) datasets.push({ label:labelB, data:valuesB, backgroundColor:'rgba(122,131,148,0.06)', borderColor:cssVar('--text3','#7A8394'), borderWidth:2, borderDash:[5,4], pointBackgroundColor:cssVar('--text3','#7A8394'), pointRadius:3, _raw:rawB });

  try{ S.radarChartInstance?.destroy(); }catch(e){}
  S.radarChartInstance = new Chart(canvas, {
    type:'radar',
    data:{ labels: RADAR_METRICS.map(m=>m.label), datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:true, labels:{color:cssVar('--text2','#4B5160'), font:{size:10}, boxWidth:10} },
        tooltip:{ callbacks:{ label:(ctx)=>{
          const raw = ctx.dataset._raw?.[ctx.dataIndex];
          const unit = unitOf(RADAR_METRICS[ctx.dataIndex].id);
          return `${ctx.dataset.label}: ${raw!=null?raw+unit:'sin datos'} (${ctx.formattedValue}%)`;
        } } }
      },
      scales:{ r:{ min:0, max:100, ticks:{color:cssVar('--text2','#4B5160'), backdropColor:'transparent', font:{size:9}, stepSize:25},
        grid:{color:cssVar('--border2','rgba(18,21,28,0.14)')}, angleLines:{color:cssVar('--border2','rgba(18,21,28,0.14)')},
        pointLabels:{color:cssVar('--text','#1A1D26'), font:{size:11,weight:600}} } }
    }
  });
}
window.drawTeamRadarChart = drawTeamRadarChart;

// Métricas disponibles para cruzar en el cuadrante — antes era fijo CMJ vs
// Índice Elástico; ahora el prep elige qué cruzar según lo que le interese
// (fuerza vs. elasticidad, por ejemplo). Los tests crudos usan la mejor
// marca histórica (mismo criterio que ranking/radar); los índices derivados
// (elástico/coordinación) se calculan con el último test cargado de cada
// componente, porque reflejan el estado actual, no un récord.
const QUADRANT_METRICS = [
  {id:'cmj', label:'CMJ', unit:'cm'},
  {id:'sj', label:'SJ', unit:'cm'},
  {id:'abalakov', label:'Abalakov', unit:'cm'},
  {id:'rm_press_banca', label:'Press banca 1RM', unit:'kg'},
  {id:'rm_peso_muerto', label:'Peso muerto 1RM', unit:'kg'},
  {id:'rm_sentadilla', label:'Sentadilla 1RM', unit:'kg'},
  {id:'ice', label:'Índice Elástico', unit:'%'},
  {id:'coord', label:'Coord. de brazos', unit:'%'},
];
window.QUADRANT_METRICS = QUADRANT_METRICS;

function quadrantMetricValue(a, id) {
  // Siempre el ÚLTIMO test, nunca el récord histórico — un atleta con una
  // marca vieja excelente pero lesionado hoy (ej. menisco) no puede aparecer
  // como si estuviera en su mejor momento; el cuadrante tiene que reflejar
  // dónde está PARADO ahora, no su techo histórico.
  const lastOf = (mid) => { const r=a._personal?.evals?.[mid]||[]; if(!r.length) return null; return sortEvalRecsByDate([...r]).slice(-1)[0].height; };
  if(id==='ice') {
    const cmj=lastOf('cmj'), sj=lastOf('sj');
    return (cmj!=null && sj) ? parseFloat(((cmj-sj)/sj*100).toFixed(1)) : null;
  }
  if(id==='coord') {
    const abal=lastOf('abalakov'), cmj=lastOf('cmj');
    return (abal!=null && cmj) ? parseFloat(((abal-cmj)/cmj*100).toFixed(1)) : null;
  }
  return lastOf(id);
}
window.quadrantMetricValue = quadrantMetricValue;

function setQuadrantAxis(axis, id) {
  if(axis==='x') S.quadrantX = id; else S.quadrantY = id;
  renderMain();
}
window.setQuadrantAxis = setQuadrantAxis;

function renderTeamQuadrantSection(members) {
  const key = 'team-quadrant';
  const collapsed = S.collapsedSections?.has(key);
  let html = `<div class="admin-section">${collapsibleHeader(key,'🎯 Cuadrante de entrenamiento')}`;
  if(!collapsed) {
    const xId = S.quadrantX || 'cmj';
    const yId = S.quadrantY || 'ice';
    const xDef = QUADRANT_METRICS.find(m=>m.id===xId) || QUADRANT_METRICS[0];
    const yDef = QUADRANT_METRICS.find(m=>m.id===yId) || QUADRANT_METRICS[6];
    html += `<div style="padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap">
      <select class="abtn" style="flex:1;min-width:140px;text-align:left" onchange="setQuadrantAxis('x',this.value)">
        ${QUADRANT_METRICS.map(m=>`<option value="${m.id}" ${xId===m.id?'selected':''}>Eje X: ${m.label}</option>`).join('')}
      </select>
      <select class="abtn" style="flex:1;min-width:140px;text-align:left" onchange="setQuadrantAxis('y',this.value)">
        ${QUADRANT_METRICS.map(m=>`<option value="${m.id}" ${yId===m.id?'selected':''}>Eje Y: ${m.label}</option>`).join('')}
      </select>
    </div>
    <div style="padding:0 16px 8px;font-size:12px;color:var(--text3)">${xDef.label} vs. ${yDef.label} — agrupa a tus atletas por lo que más necesitan entrenar.</div>
    <div style="padding:0 16px 16px;height:280px;position:relative"><canvas id="team-quadrant-chart"></canvas></div>`;
  }
  html += `</div>`;
  return html;
}
window.renderTeamQuadrantSection = renderTeamQuadrantSection;

function drawTeamQuadrantChart(members, canvasId, instanceKey, overrideX, overrideY) {
  if(typeof Chart==='undefined') return;
  canvasId = canvasId || 'team-quadrant-chart';
  instanceKey = instanceKey || 'quadrantChartInstance';
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;

  const xId = overrideX || S.quadrantX || 'cmj';
  const yId = overrideY || S.quadrantY || 'ice';
  const xDef = QUADRANT_METRICS.find(m=>m.id===xId) || QUADRANT_METRICS[0];
  const yDef = QUADRANT_METRICS.find(m=>m.id===yId) || QUADRANT_METRICS[6];

  const points = members.map(a=>{
    const x = quadrantMetricValue(a, xId);
    const y = quadrantMetricValue(a, yId);
    if(x==null || y==null) return null;
    return {x, y, name:a.name||a.email};
  }).filter(Boolean);

  try{ S[instanceKey]?.destroy(); }catch(e){}
  if(!points.length) return;

  const xs = points.map(p=>p.x), ys = points.map(p=>p.y);
  const xMid = (Math.min(...xs)+Math.max(...xs))/2;
  const yMid = (Math.min(...ys)+Math.max(...ys))/2;

  const quadrantLinesPlugin = {
    id:'quadrantLines',
    afterDraw(chart) {
      const {ctx, chartArea, scales} = chart;
      const xPix = scales.x.getPixelForValue(xMid), yPix = scales.y.getPixelForValue(yMid);
      ctx.save();
      ctx.strokeStyle='rgba(18,21,28,0.15)'; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(xPix, chartArea.top); ctx.lineTo(xPix, chartArea.bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(chartArea.left, yPix); ctx.lineTo(chartArea.right, yPix); ctx.stroke();
      ctx.restore();
    }
  };
  const pointLabelsPlugin = {
    id:'quadrantLabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      chart.getDatasetMeta(0).data.forEach((pt,i)=>{
        ctx.save();
        ctx.fillStyle=cssVar('--text','#1A1D26'); ctx.font='600 10px Inter, sans-serif'; ctx.textAlign='center';
        ctx.fillText(points[i].name.split(' ')[0], pt.x, pt.y-8);
        ctx.restore();
      });
    }
  };

  S[instanceKey] = new Chart(canvas, {
    type:'scatter',
    data:{ datasets:[{ data:points, backgroundColor:'#243B6B', pointRadius:5, pointHoverRadius:7 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>points[ctx.dataIndex].name+': '+ctx.parsed.x+xDef.unit+', '+ctx.parsed.y+yDef.unit}} },
      scales:{
        x:{ title:{display:true,text:xDef.label+' ('+xDef.unit+')',color:cssVar('--text','#1A1D26'),font:{size:10}}, ticks:{color:cssVar('--text','#1A1D26'),font:{size:9}}, grid:{color:'rgba(18,21,28,0.08)'} },
        y:{ title:{display:true,text:yDef.label+' ('+yDef.unit+')',color:cssVar('--text','#1A1D26'),font:{size:10}}, ticks:{color:cssVar('--text','#1A1D26'),font:{size:9}}, grid:{color:'rgba(18,21,28,0.08)'} },
      }
    },
    plugins:[quadrantLinesPlugin, pointLabelsPlugin]
  });
}
window.drawTeamQuadrantChart = drawTeamQuadrantChart;

// Wellness y ACWR promedio del plantel, día a día — para el informe
// imprimible del equipo (mismo criterio que drawAthleteTrendChart, pero
// promediando entre todos los miembros en vez de un solo atleta, así el
// informe muestra una tendencia real y no solo la foto del día en que se
// generó.
function drawTeamReportTrendChart(members, canvasId) {
  if(typeof Chart==='undefined') return;
  canvasId = canvasId || 'report-trend-chart';
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;

  const DAYS = 30;
  const labels=[], acwrData=[], wellnessData=[];
  const today = new Date();
  for(let i=DAYS-1;i>=0;i--){
    const d=new Date(today); d.setDate(d.getDate()-i);
    const dateStr=toLocalDateStr(d);
    labels.push(dateStr.slice(5));

    const wPcts = members.map(a=>{
      const { pct, allFilled } = getWellnessScore(a._personal?.wellness?.[dateStr]);
      return allFilled ? pct : null;
    }).filter(v=>v!=null);
    wellnessData.push(wPcts.length ? Math.round(wPcts.reduce((s,v)=>s+v,0)/wPcts.length) : null);

    const acwrVals = members.map(a=>{
      const logs = (a._personal?.history?._sessionLogs)||[];
      const m = calcLoadMetrics(logs.filter(l=>l.date<=dateStr));
      return m?.acwr!=null ? m.acwr : null;
    }).filter(v=>v!=null);
    acwrData.push(acwrVals.length ? +(acwrVals.reduce((s,v)=>s+v,0)/acwrVals.length).toFixed(2) : null);
  }
  if(acwrData.every(v=>v===null) && wellnessData.every(v=>v===null)) return;

  try{ S.reportTrendChartInstance?.destroy(); }catch(e){}
  const gridColor='rgba(0,0,0,0.08)';
  S.reportTrendChartInstance = new Chart(canvas, {
    type:'line',
    data:{ labels, datasets:[
      {label:'Wellness % (plantel)',data:wellnessData,borderColor:'#1f7a4d',backgroundColor:'rgba(31,122,77,0.08)',yAxisID:'y',spanGaps:true,tension:.3,pointRadius:2,fill:true},
      {label:'ACWR (plantel)',data:acwrData,borderColor:'#2f5fd8',backgroundColor:'rgba(47,95,216,0.08)',yAxisID:'y1',spanGaps:true,tension:.3,pointRadius:2,fill:false},
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{ legend:{labels:{color:'#111',font:{size:9},boxWidth:9}} },
      scales:{
        x:{ ticks:{color:'#111',font:{size:8},maxRotation:0,autoSkip:true,maxTicksLimit:6}, grid:{color:gridColor} },
        y:{ position:'left', min:0, max:100, ticks:{color:'#1f7a4d',font:{size:9},stepSize:25}, grid:{color:gridColor} },
        y1:{ position:'right', min:0, suggestedMax:2, ticks:{color:'#2f5fd8',font:{size:9}}, grid:{drawOnChartArea:false} },
      }
    }
  });
}
window.drawTeamReportTrendChart = drawTeamReportTrendChart;

// ── SEMÁFORO DEL PLANTEL (triage) ───────────────────────────────
// Tabla compacta y ordenable para escanear todo el equipo de un vistazo:
// quién tiene ACWR alto, wellness bajo o dolor reportado, sin entrar a cada
// ficha una por una. Pensada para ser lo primero que se mira antes de una
// sesión.
function setTriageSort(key) {
  if(S._triageSortKey===key) S._triageSortDir = (S._triageSortDir==='desc'?'asc':'desc');
  else { S._triageSortKey = key; S._triageSortDir = key==='wellness' ? 'asc' : 'desc'; }
  renderMain();
}
window.setTriageSort = setTriageSort;

function renderTriageTable(members) {
  const key = 'team-triage';
  const collapsed = S.collapsedSections?.has(key);
  let html = `<div class="admin-section">${collapsibleHeader(key,'🚦 Semáforo del plantel — quién necesita atención hoy')}`;
  if(!collapsed) {
    const sortKey = S._triageSortKey || 'acwr';
    const sortDir = S._triageSortDir || 'desc';
    const today = todayLocal();

    let rows = members.map(a=>{
      const summary = computeAthleteLoadSummary(a);
      const injuries = getActiveInjuriesSummary(a._personal);
      const sevRank = {grave:3, moderada:2, leve:1};
      const worst = injuries.length ? injuries.reduce((w,i)=>(sevRank[i.severity]||1)>(sevRank[w.severity]||1)?i:w, injuries[0]) : null;
      const w = a._personal?.wellness?.[today];
      const lowFlags = [];
      if(w?.estres!==undefined && w.estres<=2) lowFlags.push('😩 estrés');
      if(w?.sueño_calidad!==undefined && w.sueño_calidad<=2) lowFlags.push('😴 sueño');
      if(w?.dolor_muscular!==undefined && w.dolor_muscular<=2) lowFlags.push('💪 dolor');
      return {a, summary, worst, lowFlags};
    });

    rows.sort((r1,r2)=>{
      if(sortKey==='name') {
        const v1=(r1.a.name||r1.a.email||'').toLowerCase(), v2=(r2.a.name||r2.a.email||'').toLowerCase();
        return sortDir==='asc' ? v1.localeCompare(v2) : v2.localeCompare(v1);
      }
      const v1 = sortKey==='wellness' ? r1.summary.avgWellness : sortKey==='monotony' ? r1.summary.monotony : r1.summary.acwr;
      const v2 = sortKey==='wellness' ? r2.summary.avgWellness : sortKey==='monotony' ? r2.summary.monotony : r2.summary.acwr;
      // Sin datos siempre al final, sea cual sea la dirección del orden.
      if(v1==null && v2==null) return 0;
      if(v1==null) return 1;
      if(v2==null) return -1;
      return sortDir==='asc' ? v1-v2 : v2-v1;
    });

    const arrow = (k) => sortKey===k ? (sortDir==='asc'?' ↑':' ↓') : '';
    html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="border-bottom:1px solid var(--border)">
        <th style="text-align:left;padding:8px 10px;cursor:pointer;white-space:nowrap;color:var(--text2)" onclick="setTriageSort('name')">Atleta${arrow('name')}</th>
        <th style="text-align:center;padding:8px 10px;cursor:pointer;white-space:nowrap;color:var(--text2)" onclick="setTriageSort('wellness')">Wellness${arrow('wellness')}</th>
        <th style="text-align:center;padding:8px 10px;cursor:pointer;white-space:nowrap;color:var(--text2)" onclick="setTriageSort('acwr')">ACWR${arrow('acwr')}</th>
        <th style="text-align:center;padding:8px 10px;cursor:pointer;white-space:nowrap;color:var(--text2)" onclick="setTriageSort('monotony')">Monoton.${arrow('monotony')}</th>
        <th style="text-align:left;padding:8px 10px;white-space:nowrap;color:var(--text2)">Alertas de hoy</th>
      </tr></thead>
      <tbody>
      ${rows.map(({a,summary,worst,lowFlags})=>{
        const wState = getWellnessState(summary.avgWellness);
        const acwrSt = getACWRStatus(summary.acwr, null);
        const monSt = getMonotonyStatus(summary.monotony);
        const worstColor = worst ? (severityInfo(worst.severity)||severityInfo('leve')).color : null;
        return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="adminOpenAthlete('${a.uid}')">
          <td style="padding:8px 10px;font-weight:600;white-space:nowrap">${a.name||a.email}</td>
          <td style="padding:8px 10px;text-align:center;font-weight:700;color:${wState.color}">${summary.avgWellness!=null?summary.avgWellness+'%':'—'}</td>
          <td style="padding:8px 10px;text-align:center;font-weight:700;color:${acwrSt.color}">${summary.acwr!=null?summary.acwr.toFixed(2):'—'}</td>
          <td style="padding:8px 10px;text-align:center;font-weight:700;color:${monSt.color}">${summary.monotony!=null?summary.monotony.toFixed(1):'—'}</td>
          <td style="padding:8px 10px">
            ${worst?`<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${worstColor}22;color:${worstColor};margin-right:4px;white-space:nowrap">🩹 ${worst.zoneLabel}</span>`:''}
            ${lowFlags.map(f=>`<span style="font-size:10px;color:var(--text3);margin-right:6px;white-space:nowrap">${f}</span>`).join('')}
            ${(!worst && !lowFlags.length)?'<span style="color:var(--text3)">—</span>':''}
          </td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`;
  }
  html += `</div>`;
  return html;
}
window.renderTriageTable = renderTriageTable;

function renderGroupStats(memberUids, opts) {
  const members = (S.adminAthletes || []).filter(a => memberUids.includes(a.uid));
  if (!members.length) return `<div class="empty-state">No hay atletas en este grupo todavía.</div>`;

  // Vista de comparación pura (atleta individual comparándose con un
  // equipo elegido en su Perfil): promedio agregado + su propio radar —
  // nada de molestias, ranking clickeable ni detalle semanal de otros
  // jugadores, que son cosas exclusivas de la ficha real del equipo.
  // El radar se BLOQUEA en el propio atleta (sin el selector de compañeros)
  // y el cuadrante queda afuera directamente: a diferencia del radar (una
  // sola línea punteada de promedio, sin identificar a nadie), el cuadrante
  // grafica un punto con nombre por cada integrante del equipo — mostrarlo
  // acá era exactamente la fuga de datos de compañeros que este modo existe
  // para evitar.
  if (opts && opts.compareOnly) {
    let cHtml = members.length > 1 ? renderTeamMetricsCard('Promedio del equipo con el que se compara', members, false) : '';
    cHtml += renderTeamRadarSection(members, opts.selfUid);
    return cHtml;
  }

  // 0) Semáforo del plantel — lo primero que se ve, para escanear en
  // segundos quién necesita atención hoy (ACWR alto, wellness bajo, dolor
  // reportado) sin tener que entrar atleta por atleta.
  let html = members.length > 1 ? renderTriageTable(members) : '';

  // 1) Promedio general del equipo — no tiene sentido para un solo atleta
  // (sería literalmente la misma tarjeta repetida dos veces)
  html += members.length > 1 ? renderTeamMetricsCard('Promedio del equipo', members, false) : '';

  // 1b) Lesiones activas del plantel, por gravedad
  html += renderTeamInjuryChart(members);

  // 1c) Ranking del equipo, perfil de radar y cuadrante de entrenamiento —
  // las tres colapsables, para que no molesten si todavía no hay datos.
  html += renderTeamLeaderboard(members);
  html += renderTeamRadarSection(members);
  html += renderTeamQuadrantSection(members);

  // 2) Desglose por posición (solo si al menos alguien tiene posición cargada)
  const withPos = members.filter(a=>a.position);
  if (withPos.length) {
    const positions = [...new Set(members.map(a=>a.position||'Sin posición'))].sort((a,b)=>{
      if(a==='Sin posición') return 1;
      if(b==='Sin posición') return -1;
      return a.localeCompare(b);
    });
    html += positions.map(pos=>{
      const group = members.filter(a=>(a.position||'Sin posición')===pos);
      return renderTeamMetricsCard(pos, group, false);
    }).join('');
  } else if (members.length === 1) {
    html += renderTeamMetricsCard(members[0].name||members[0].email, members, false);
  }

  return html;
}
window.renderGroupStats = renderGroupStats;

// ── TEAM DAY EDITOR ───────────────────────────────────────────
function openTeamDayEditor(teamId,dayIdx){S.teamDayEdit={teamId,dayIdx};renderMain();}
window.openTeamDayEditor=openTeamDayEditor;

function getTeamDay(teamId,dayIdx){const team=S.teams.find(t=>t.id===teamId);if(!team)return null;if(!team.trainingDays[dayIdx])return null;if(!team.trainingDays[dayIdx].blocks)team.trainingDays[dayIdx].blocks=[];return team.trainingDays[dayIdx];}

function renderTeamDayEditor(team,{teamId,dayIdx}){
  const day=getTeamDay(teamId,dayIdx);
  if(!day)return`<div class="empty-state">Error cargando sesión.</div>`;
  const blocks=day.blocks||[];
  const blocksHtml=blocks.map(b=>renderTeamDayBlock(b,teamId,dayIdx)).join('');
  return`<div class="team-detail-header">
    <button class="back-btn" data-back="team-day">‹</button>
    <div class="team-detail-title">${team.name} — ${day.title||'Día '+(dayIdx+1)}</div>
    <button class="abtn abtn-p" onclick="saveTeamDayBlocks('${teamId}',${dayIdx})">Guardar</button>
  </div>
  ${blocksHtml}
  <div style="display:flex;gap:8px">
    <button class="add-block-btn" style="flex:1" onclick="addTeamDayBlock('${teamId}',${dayIdx})">+ Agregar bloque</button>
    ${S._blockClipboard?`<button class="add-block-btn" style="flex:1" onclick="pasteTeamDayBlock('${teamId}',${dayIdx})">📥 Pegar "${S._blockClipboard.title||S._blockClipboard.label}"</button>`:''}
  </div>`;
}

function renderTeamDayBlock(b,teamId,dayIdx){
  const cc=b.colorKey||'bx',open=b._open===true;
  let inner='';
  b.categories.forEach((cat,ci)=>{
    inner+=`<div class="cat-header"><div class="cat-label-wrap"><span class="cat-label" ondblclick="editTDCatLabel(this,'${b.id}','${teamId}',${dayIdx},${ci})">${cat.label}</span><input class="cat-label-inp" id="tdcatinp-${b.id}-${ci}" onblur="saveTDCatLabel('${b.id}','${teamId}',${dayIdx},${ci},this)" onkeydown="if(event.key==='Enter')this.blur()"></div><span class="cat-del" onclick="deleteTDCat('${b.id}','${teamId}',${dayIdx},${ci})">− cat</span></div>`;
    cat.exercises.forEach(ex=>{
      const videoKey = ex.libId || S.library.find(l=>l.name.trim().toLowerCase()===(ex.name||'').trim().toLowerCase())?.id || ex.id;
      const hasV = !!S.videos[videoKey];
      inner+=`<div class="ex-row" id="tdexrow-${ex.id}"><div class="ex-main"><div class="ex-name-row"><span class="ex-name" ondblclick="editTDExName(this,'${ex.id}','${b.id}','${teamId}',${dayIdx},${ci})">${ex.name}</span><input class="ex-name-inp" id="tdexinp-${ex.id}" onblur="saveTDExName('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},this)" onkeydown="if(event.key==='Enter')this.blur()"><div class="ex-actions"><div class="ex-icon-btn ${hasV?'has-video':''}" data-videokey="${videoKey}" onclick="openVideoModal('${videoKey}','${ex.name}',true)" title="Video"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></div><div class="ex-icon-btn del-ex" onclick="deleteTDEx('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci})">×</div></div></div>
      <div class="ex-fields">
        <div class="field-box"><span class="field-lbl">Series</span><input class="field-inp" type="text" placeholder="3x" value="${ex.series||''}" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'series',this.value)"></div>
        <div class="field-box"><span class="field-lbl">Reps</span><input class="field-inp" type="text" placeholder="6–8" value="${ex.reps||''}" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'reps',this.value)"></div>
        <div class="field-box"><span class="field-lbl">%RM</span><input class="field-inp" type="text" placeholder="—" value="${ex.pct||''}" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'pct',this.value)"></div>
        <div class="field-box"><span class="field-lbl">De qué RM</span><select class="field-inp" style="width:auto;padding:6px 4px;font-size:11px" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'rmLift',this.value)"><option value="">—</option>${RM_LIFTS.map(rm=>`<option value="${rm.id}" ${ex.rmLift===rm.id?'selected':''}>${rm.label}</option>`).join('')}</select></div>
        <div class="field-box" style="gap:3px"><span class="field-lbl">Intensidad ${infoBtn('intensity')}</span>
          <div class="intensity-sel">
            <button class="intensity-type-btn ${(ex.intensityType||'RPE')==='RPE'?'active':''}" onclick="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'intensityType','RPE');this.classList.add('active');this.nextElementSibling.classList.remove('active')">RPE</button>
            <button class="intensity-type-btn ${ex.intensityType==='RIR'?'active':''}" onclick="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'intensityType','RIR');this.classList.add('active');this.previousElementSibling.classList.remove('active')">RIR</button>
          </div>
          <input class="field-inp" type="text" placeholder="—" value="${ex.rpe||''}" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'rpe',this.value)" style="width:48px"></div>
        <div class="field-box"><span class="field-lbl">Nota</span><input class="field-inp" style="width:80px" type="text" placeholder="—" value="${ex.note||''}" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'note',this.value)"></div>
      </div></div></div>`;
    });
    inner+=`<button class="add-btn" onclick="openTDLib('${b.id}','${teamId}',${dayIdx},${ci})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Agregar ejercicio</button>`;
    if(ci<b.categories.length-1)inner+=`<hr class="cat-divider">`;
  });
  inner+=`<button class="add-btn" style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px" onclick="addTDCategory('${b.id}','${teamId}',${dayIdx})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Agregar subcategoría</button>`;
  return`<div class="card block ${cc} ${open?'open':''}" id="tdblock-${b.id}"><div class="block-header" onclick="toggleTDBlock('${b.id}','${teamId}',${dayIdx})"><span class="block-badge">${b.label}</span><div class="block-title-wrap"><span class="block-title" ondblclick="editTDBlockTitle(event,'${b.id}','${teamId}',${dayIdx})">${b.title}</span><input class="block-title-inp" id="tdbinp-${b.id}" onblur="saveTDBlockTitle('${b.id}','${teamId}',${dayIdx},this)" onkeydown="if(event.key==='Enter')this.blur()"></div><span class="block-time">${b.time||''}</span><span class="ex-icon-btn" onclick="event.stopPropagation();copyBlockToClipboard(getTDBlock('${b.id}','${teamId}',${dayIdx}))" title="Copiar bloque"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span><span class="block-del" onclick="deleteTDBlock(event,'${b.id}','${teamId}',${dayIdx})">×</span><span class="block-chevron">›</span></div><div class="block-body">${inner}</div></div>`;
}

function getTDBlock(blockId,teamId,dayIdx){const day=getTeamDay(teamId,dayIdx);if(!day)return null;return(day.blocks||[]).find(b=>b.id===blockId)||null;}
window.getTDBlock=getTDBlock;
function addTeamDayBlock(teamId,dayIdx){const day=getTeamDay(teamId,dayIdx);if(!day)return;if(!day.blocks)day.blocks=[];const colors=['b1','b2','b3','b4','bx'],n=day.blocks.length;day.blocks.push({id:genId(),label:`Bloque ${n+1}`,title:'Nuevo bloque',time:'',colorKey:colors[n%colors.length],note:'',_open:true,categories:[{id:genId(),label:'Categoría',exercises:[]}]});renderMain();}
window.addTeamDayBlock=addTeamDayBlock;
function pasteTeamDayBlock(teamId,dayIdx){
  const b=clonedBlockFromClipboard();
  if(!b){showToast('No copiaste ningún bloque todavía');return;}
  const day=getTeamDay(teamId,dayIdx);if(!day)return;
  if(!day.blocks)day.blocks=[];
  const colors=['b1','b2','b3','b4','bx'];
  b.colorKey=colors[day.blocks.length%colors.length];
  b.label=`Bloque ${day.blocks.length+1}`;
  day.blocks.push(b);
  renderMain();
  showToast('✓ Bloque pegado');
}
window.pasteTeamDayBlock=pasteTeamDayBlock;
function toggleTDBlock(blockId,teamId,dayIdx){const el=document.getElementById('tdblock-'+blockId);if(!el)return;el.classList.toggle('open');const b=getTDBlock(blockId,teamId,dayIdx);if(b)b._open=el.classList.contains('open');}
window.toggleTDBlock=toggleTDBlock;
function editTDBlockTitle(e,blockId,teamId,dayIdx){e.stopPropagation();const b=getTDBlock(blockId,teamId,dayIdx);if(!b)return;const span=e.target,inp=document.getElementById('tdbinp-'+blockId);span.style.display='none';inp.value=b.title;inp.style.display='block';inp.focus();inp.select();}
window.editTDBlockTitle=editTDBlockTitle;
function saveTDBlockTitle(blockId,teamId,dayIdx,inp){const b=getTDBlock(blockId,teamId,dayIdx);if(!b)return;if(inp.value.trim())b.title=inp.value.trim();inp.style.display='none';const span=inp.previousElementSibling;if(span){span.textContent=b.title;span.style.display='';}}
window.saveTDBlockTitle=saveTDBlockTitle;
function deleteTDBlock(e,blockId,teamId,dayIdx){e.stopPropagation();if(!confirm('¿Eliminar bloque?'))return;const day=getTeamDay(teamId,dayIdx);if(!day)return;day.blocks=day.blocks.filter(b=>b.id!==blockId);renderMain();}
window.deleteTDBlock=deleteTDBlock;
function editTDCatLabel(el,blockId,teamId,dayIdx,ci){const inp=document.getElementById(`tdcatinp-${blockId}-${ci}`);el.style.display='none';inp.value=el.textContent;inp.style.display='inline-block';inp.focus();inp.select();}
window.editTDCatLabel=editTDCatLabel;
function saveTDCatLabel(blockId,teamId,dayIdx,ci,inp){const b=getTDBlock(blockId,teamId,dayIdx);if(!b)return;if(inp.value.trim())b.categories[ci].label=inp.value.trim();inp.style.display='none';const span=inp.previousElementSibling;if(span){span.textContent=b.categories[ci].label;span.style.display='';}}
window.saveTDCatLabel=saveTDCatLabel;
function deleteTDCat(blockId,teamId,dayIdx,ci){if(!confirm('¿Eliminar categoría?'))return;const b=getTDBlock(blockId,teamId,dayIdx);if(!b)return;b.categories.splice(ci,1);renderMain();}
window.deleteTDCat=deleteTDCat;
function addTDCategory(blockId,teamId,dayIdx){const b=getTDBlock(blockId,teamId,dayIdx);if(!b)return;b.categories.push({id:genId(),label:'Nueva categoría',exercises:[]});renderMain();}
window.addTDCategory=addTDCategory;
function editTDExName(el,exId,blockId,teamId,dayIdx,ci){const inp=document.getElementById('tdexinp-'+exId);el.style.display='none';inp.value=el.textContent;inp.style.display='block';inp.focus();inp.select();}
window.editTDExName=editTDExName;
function saveTDExName(exId,blockId,teamId,dayIdx,ci,inp){const b=getTDBlock(blockId,teamId,dayIdx);if(!b)return;const ex=b.categories[ci].exercises.find(e=>e.id===exId);if(!ex)return;if(inp.value.trim())ex.name=inp.value.trim();inp.style.display='none';const span=inp.previousElementSibling;if(span){span.textContent=ex.name;span.style.display='';}}
window.saveTDExName=saveTDExName;
function setTDExField(exId,blockId,teamId,dayIdx,ci,field,val){const b=getTDBlock(blockId,teamId,dayIdx);if(!b)return;const ex=b.categories[ci].exercises.find(e=>e.id===exId);if(!ex)return;ex[field]=val;}
window.setTDExField=setTDExField;
function deleteTDEx(exId,blockId,teamId,dayIdx,ci){const b=getTDBlock(blockId,teamId,dayIdx);if(!b)return;b.categories[ci].exercises=b.categories[ci].exercises.filter(e=>e.id!==exId);renderMain();}
window.deleteTDEx=deleteTDEx;
function openTDLib(blockId,teamId,dayIdx,ci){S.libTarget={blockId,catIdx:ci,teamId,dayIdx,isTD:true};S.activeFilters=new Set();document.getElementById('lib-search').value='';renderLibFilters();renderLibList();S._newExTags=new Set();renderTagChipPicker('lib-new-tags-picker','_newExTags');document.getElementById('lib-overlay').classList.add('open');}
window.openTDLib=openTDLib;

// Agregar un ejercicio SOLO para un atleta puntual, encima de la rutina que
// comparte con su equipo — no toca la rutina compartida ni a sus compañeros.
function openPersonalExtraLib(uid,sessionName){
  S.libTarget={isPersonal:true,uid,sessionName};
  S.activeFilters=new Set();
  document.getElementById('lib-search').value='';
  renderLibFilters();
  renderLibList();
  S._newExTags=new Set();
  renderTagChipPicker('lib-new-tags-picker','_newExTags');
  document.getElementById('lib-overlay').classList.add('open');
}
window.openPersonalExtraLib=openPersonalExtraLib;

function getPersonalOwner(uid) {
  if(S.viewingAthlete?.uid===uid) return S.viewingAthlete.personal;
  return S.adminAthletes?.find(a=>a.uid===uid)?._personal || null;
}

async function addPersonalExtraExercise(uid,sessionName,exObj){
  const personal=getPersonalOwner(uid);
  if(!personal) return;
  if(!personal.personalExtras) personal.personalExtras={};
  if(!personal.personalExtras[sessionName]) personal.personalExtras[sessionName]=[];
  personal.personalExtras[sessionName].push(exObj);
  try {
    await updateDocSafe(doc(db,'personal',uid), {[`personalExtras.${sessionName}`]: personal.personalExtras[sessionName]});
    showToast(`✓ ${exObj.name} agregado (solo para este atleta)`);
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.addPersonalExtraExercise=addPersonalExtraExercise;

async function removePersonalExtraExercise(uid,sessionName,exId){
  const personal=getPersonalOwner(uid);
  if(!personal?.personalExtras?.[sessionName]) return;
  personal.personalExtras[sessionName]=personal.personalExtras[sessionName].filter(e=>e.id!==exId);
  try {
    await updateDocSafe(doc(db,'personal',uid), {[`personalExtras.${sessionName}`]: personal.personalExtras[sessionName]});
    showToast('✓ Eliminado');
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.removePersonalExtraExercise=removePersonalExtraExercise;
async function saveTeamDayBlocks(teamId,dayIdx){
  const team=S.teams.find(t=>t.id===teamId);if(!team)return;
  // Guarda SOLO trainingDays (que es lo único que esta pantalla toca), nunca
  // el documento entero — mismo bug que saveTeam(): escribir el objeto
  // completo pisaba calendar (y cualquier otro campo) con la copia en
  // memoria, que podía estar vieja si el fixture se cargó en otra pestaña o
  // sesión. Esta pantalla de edición de bloques es la que más seguido se usa,
  // así que probablemente sea la causa real de que se te borraran partidos.
  const toSave=JSON.parse(JSON.stringify(team.trainingDays||[]));
  const clean=obj=>{if(Array.isArray(obj))obj.forEach(clean);else if(obj&&typeof obj==='object'){delete obj._open;delete obj._editing;Object.values(obj).forEach(clean);}};
  clean(toSave);
  try{await setDoc(doc(db,'teams',teamId),{trainingDays:toSave},{merge:true});showToast('✓ Sesión guardada');S.teamDayEdit=null;renderMain();}catch(e){showToast('Error al guardar');}
}
window.saveTeamDayBlocks=saveTeamDayBlocks;





async function openTeam(id) {
  S.teamSubview='rutina';
  S.currentView='teams';
  // Mostramos "Cargando…" en vez del equipo viejo cacheado mientras se trae
  // la versión fresca de Firestore. Antes se mostraba la copia vieja YA
  // interactiva mientras el fetch fresco corría atrás — si el admin
  // alcanzaba a cargar algo (un partido, una actividad) en esos primeros
  // instantes, esa edición se guardaba bien en Firestore, pero cuando el
  // fetch fresco (que había arrancado un poco antes) terminaba, pisaba en
  // pantalla lo recién cargado con una foto un pelín más vieja — eso era el
  // "no se guarda" del calendario. Ahora no se puede tocar nada hasta que
  // la versión fresca ya esté puesta.
  S._teamViewLoadingId = id;
  S._calDirtyDates = new Set();
  renderBottomBar(); renderMain();
  let freshTeam = null;
  try {
    const fresh = await getDoc(doc(db,'teams',id));
    if(fresh.exists()) {
      freshTeam = {id, ...fresh.data()};
      const idx = S.teams.findIndex(t=>t.id===id);
      if(idx>=0) S.teams[idx]=freshTeam; else S.teams.push(freshTeam);
    }
  } catch(e) { console.error('Error refrescando equipo', e); }
  // BUG encontrado y corregido acá: "toco atrás y no vuelve, tengo que
  // tocar Equipos de nuevo para que ahí sí funcione". Si mientras este fetch
  // estaba en vuelo el admin ya volvió atrás (o abrió otro equipo), este
  // resultado quedó viejo — aplicarlo igual pisaba el "volver" que ya había
  // hecho: el fetch terminaba un instante después del toque en ‹ y volvía a
  // poner el equipo en pantalla, como si el botón atrás no hubiera hecho
  // nada. S._teamViewLoadingId es la señal de "a quién le importa este
  // resultado todavía" — el botón atrás la limpia, así que si ya no coincide
  // con el id de este fetch, no hay que tocar nada más.
  if (S._teamViewLoadingId !== id) return;
  S._teamViewLoadingId = null;
  S.teamView = freshTeam || S.teams.find(t=>t.id===id) || null;
  renderMain();
  // Sin esto, si entrás a Equipos sin haber pasado antes por "Atletas",
  // S.adminAthletes queda vacío y el roster no puede reconocer a NADIE como
  // "cuenta vinculada" aunque estén perfectamente registrados.
  await ensureAdminAthletes();
  // Wellness y lesiones de cada jugador, para mostrarlas directamente en el
  // roster (no solo en la ficha individual de cada uno). SIEMPRE frescas acá
  // — ensureGroupPersonalData se salta a quien ya esté cacheado, así que si
  // ya habías entrado a este equipo antes en la misma sesión, sin esto
  // seguías viendo wellness/carga de la primera vez que entraste, no lo que
  // los jugadores acaban de cargar.
  if(S.teamView) await refreshGroupPersonalData(getTeamStatsMemberUids(S.teamView));
  renderMain();
}
window.openTeam=openTeam;

function addTrainingDay(teamId) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  if(!t.trainingDays) t.trainingDays=[];
  t.trainingDays.push({title:`Día ${t.trainingDays.length+1}`,blocks:[],playerNotes:[]});
  saveTeam(teamId); renderMain();
}
window.addTrainingDay=addTrainingDay;

function deleteDay(teamId,di) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  if(!confirm('¿Eliminar este día?')) return;
  t.trainingDays.splice(di,1); saveTeam(teamId); renderMain();
}
window.deleteDay=deleteDay;

function toggleDayEdit(teamId,di) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  t.trainingDays[di]._editing=!t.trainingDays[di]._editing;
  if(!t.trainingDays[di]._editing) saveTeam(teamId);
  renderMain();
}
window.toggleDayEdit=toggleDayEdit;

function editDayTitle(teamId,di) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  t.trainingDays[di]._editing=true; renderMain();
  setTimeout(()=>{ const el=document.getElementById(`dttinp-${di}`); if(el){el.focus();el.select();} },50);
}
window.editDayTitle=editDayTitle;

function saveDayTitle(teamId,di,inp) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  if(inp.value.trim()) t.trainingDays[di].title=inp.value.trim();
}
window.saveDayTitle=saveDayTitle;

function saveDayContent(teamId,di,val) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  t.trainingDays[di].content=val;
}
window.saveDayContent=saveDayContent;

function addPlayerNote(teamId,di,inp) {
  const val=inp.value.trim(); if(!val) return;
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  const parts=val.split(':');
  const player=parts.length>1?parts[0].trim():'Jugador';
  const note=parts.length>1?parts.slice(1).join(':').trim():val;
  if(!t.trainingDays[di].playerNotes) t.trainingDays[di].playerNotes=[];
  t.trainingDays[di].playerNotes.push({player,note});
  inp.value=''; saveTeam(teamId); renderMain();
}
window.addPlayerNote=addPlayerNote;

function deletePlayerNote(teamId,di,ni) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  t.trainingDays[di].playerNotes.splice(ni,1); saveTeam(teamId); renderMain();
}
window.deletePlayerNote=deletePlayerNote;

async function addPlayer(teamId) {
  const inp=document.getElementById('new-player-inp'); if(!inp) return;
  const name=inp.value.trim(); if(!name) return;
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  if(!t.players) t.players=[];
  t.players.push(name); inp.value=''; saveTeam(teamId); renderMain();
  // Creamos un registro "pendiente" para este jugador — así se le pueden
  // cargar tests/evaluaciones ya mismo, aunque todavía no se haya registrado.
  // Si más adelante se registra con el mismo nombre en este mismo equipo,
  // sus datos se migran solos a la cuenta real (ver finishOnboarding).
  try {
    const pendId = genId();
    await setDoc(doc(db,'pendingAthletes',pendId), {name, teamId, evals:{}, createdAt:new Date().toISOString()});
    if(!S.pendingAthletes) S.pendingAthletes=[];
    S.pendingAthletes.push({id:pendId, name, teamId, evals:{}});
  } catch(e) { /* no bloqueamos el flujo si esto falla */ }
}
window.addPlayer=addPlayer;

function addLinkedPlayerToRoster(teamId,name) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  if(!t.players) t.players=[];
  if(!t.players.some(p=>p.trim().toLowerCase()===name.trim().toLowerCase())) t.players.push(name);
  saveTeam(teamId); renderMain();
  showToast(`✓ ${name} agregado al roster`);
}
window.addLinkedPlayerToRoster=addLinkedPlayerToRoster;

function deletePlayer(teamId,pi) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  t.players.splice(pi,1); saveTeam(teamId); renderMain();
}
window.deletePlayer=deletePlayer;

async function deleteTeam(teamId) {
  if(!confirm('¿Eliminar este equipo? Esta acción no se puede deshacer.')) return;
  try {
    await deleteDoc(doc(db,'teams',teamId));
    S.teams = S.teams.filter(t=>t.id!==teamId);
    S.teamView = null;
    S.currentView = 'teams';
    renderBottomBar();
    renderMain();
    showToast('✓ Equipo eliminado permanentemente');
  } catch(e) {
    showToast('Error al eliminar: '+e.message);
  }
}
window.deleteTeam=deleteTeam;

// Guarda SOLO jugadores y días de entrenamiento — nunca el documento
// completo. Escribir el objeto entero pisaba campos que esta función jamás
// toca (como calendar) con lo que hubiera en la copia local en memoria,
// que podía estar desactualizada (ej: fixture importado en otra pestaña) —
// eso borraba partidos ya guardados sin que nadie los tocara.
async function saveTeam(teamId) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  try { await setDoc(doc(db,'teams',teamId),{players:t.players||[],trainingDays:t.trainingDays||[]},{merge:true}); } catch(e) { console.error(e); }
}

// ── ATLETAS (individuales, sin equipo) ─────────────────────────
function renderAtletas() {
  if (S.atletaView) return renderAtletaDetail(S.atletaView);

  let html = `<div style="font-size:16px;font-weight:700;margin-bottom:14px">Atletas individuales</div>`;

  if (!S.adminAthletesLoaded) {
    ensureAdminAthletes().then(renderMain);
    return html + `<div class="empty-state">Cargando...</div>`;
  }

  const individuals = (S.adminAthletes || []).filter(a => a.athleteType === 'individual');
  if (!individuals.length) {
    html += `<div class="empty-state">No hay atletas individuales registrados todavía.<br><span style="font-size:12px">Aparecen acá los que se registran sin elegir un equipo.</span></div>`;
  } else {
    html += individuals.map(a => {
      const icon = sportIconSvg(a.sport);
      return `
      <div class="card" style="padding:14px;cursor:pointer;margin-bottom:10px" onclick="openAtleta('${a.uid}')">
        <div style="display:flex;align-items:center;gap:12px">
          ${athleteListAvatarHtml(a, 44)}
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:700">${a.name || a.email}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:5px;flex-wrap:wrap">
              ${(a.sport||a.position)?`<div style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--accent-text);background:var(--accent-dim);border:1px solid var(--border);border-radius:20px;padding:4px 10px">
                ${icon?`<span style="display:flex;color:var(--accent-text)">${icon}</span>`:''}
                <span>${a.sport||''}${a.sport&&a.position?' · ':''}${a.position||''}</span>
              </div>`:`<span style="font-size:11px;color:var(--text3)">Sin deporte/posición cargados</span>`}
            </div>
          </div>
          <span style="color:var(--text3);font-size:18px">›</span>
        </div>
      </div>`;
    }).join('');
  }
  return html;
}
window.renderAtletas = renderAtletas;

// Lista ordenada de uids "hermanos" del atleta que se está por abrir — se
// calcula ANTES de tocar S.currentView/adminView/teamView (con esos todavía
// intactos sabemos de qué lista real vino el click: roster de un equipo,
// pestaña Atletas, o Panel Admin › Atletas), para poder recorrerla con
// flechas ‹ › sin volver a la lista en el medio.
function computeAthleteSiblingUids() {
  if (S.teamView) {
    const team = S.teamView;
    const linked = (S.adminAthletes||[]).filter(a=>(team.memberUids||[]).includes(a.uid));
    const ordered = [];
    (team.players||[]).forEach(p=>{
      const m = linked.find(a=>namesLikelyMatch(a.name,p)||normPersonName(a.email)===normPersonName(p));
      if(m && !ordered.includes(m.uid)) ordered.push(m.uid);
    });
    linked.forEach(a=>{ if(!ordered.includes(a.uid)) ordered.push(a.uid); });
    return ordered;
  }
  if (S.currentView==='atletas') {
    return (S.adminAthletes||[]).filter(a=>a.athleteType==='individual').map(a=>a.uid);
  }
  if (S.adminView==='athletes') {
    const search=(S._athletesSearch||'').toLowerCase();
    let list=S.adminAthletes||[];
    if(search) list=list.filter(a=>(a.name||a.email||'').toLowerCase().includes(search));
    return list.map(a=>a.uid);
  }
  return null;
}
window.computeAthleteSiblingUids = computeAthleteSiblingUids;

// Mueve la ficha abierta al atleta anterior/siguiente dentro de la lista de
// donde se entró (ver computeAthleteSiblingUids), preservando la subvista
// activa (Perfil/Rutina/Wellness/Estadísticas/Evaluaciones) — así comparar
// wellness de todo un plantel es cuestión de tocar "siguiente", no de volver
// atrás y volver a entrar cada vez.
function navigateAthleteSibling(delta) {
  const list = S._athleteSiblingUids;
  const curUid = (S.viewingAthlete && S.viewingAthlete.uid) || (S.atletaView && S.atletaView.uid);
  if(!list || list.length<2 || !curUid) return;
  const idx = list.indexOf(curUid);
  if(idx===-1) return;
  const nextUid = list[(idx+delta+list.length)%list.length];
  if(nextUid===curUid) return;
  const sub = S.atletaSubview;
  if(S.currentView==='atletas') openAtleta(nextUid);
  else adminOpenAthlete(nextUid);
  S.atletaSubview = sub;
}
window.navigateAthleteSibling = navigateAthleteSibling;

function openAtleta(uid) {
  const a = (S.adminAthletes || []).find(x => x.uid === uid);
  if (!a) return;
  if(!S._inAthleteDetail) {
    S._athleteDetailReturnCtx = {currentView:'atletas', adminView:null, teamView:null, teamSubview:null};
    S._athleteSiblingUids = computeAthleteSiblingUids();
  }
  S._inAthleteDetail = true;
  S.atletaView = a;
  S.atletaSubview = 'perfil';
  S._atletaRoutineCollapsedDays = null;
  S._atletaRoutineCollapsedBlocks = null;
  S._routineWeekPreview = null;
  ensureGroupPersonalData(getEffectiveGroupUids(a)).then(()=>{
    S.viewingAthlete = { uid, userData: a, personal: a._personal||{} };
    renderMain();
  }).catch((e)=>{ console.error('Error al abrir atleta', e); showToast('Error: '+(e?.message||e)); renderMain(); });
  renderMain();
}
window.openAtleta = openAtleta;

function renderAtletaDetail(a) {
  const sub = S.atletaSubview || 'perfil';
  const myTeam = S.teams.find(t=>t.id===a.teamId);
  const sportLabel = capitalizeName(a.sport||'');
  // Flechas para recorrer el plantel/lista sin volver atrás — solo aparecen
  // si sabemos de qué lista se entró (ver computeAthleteSiblingUids).
  const sibs = S._athleteSiblingUids;
  const sibIdx = sibs ? sibs.indexOf(a.uid) : -1;
  const sibNav = (sibs && sibs.length>1 && sibIdx>=0) ? `<div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
      <button class="ex-icon-btn" onclick="navigateAthleteSibling(-1)" title="Atleta anterior"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg></button>
      <span style="font-size:10px;color:var(--text3);white-space:nowrap;padding:0 2px">${sibIdx+1}/${sibs.length}</span>
      <button class="ex-icon-btn" onclick="navigateAthleteSibling(1)" title="Atleta siguiente"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg></button>
    </div>` : '';
  let html = `<div class="team-detail-header">
    <button class="back-btn" onclick="goBackFromAthleteDetail()">‹</button>
    <div class="team-detail-title" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
      ${avatarHtml(a.name||a.email, a.color, 30, a.photoUrl)}
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name || a.email}</span>
    </div>
    ${sibNav}
    <button class="abtn" onclick="openWeeklyReport('${a.uid}')" title="Reporte semanal">📄 Reporte</button>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
    ${myTeam?`<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:var(--accent-dim);color:var(--accent-text)">${myTeam.name}</span>`:''}
    ${a.position?`<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:var(--bg3);color:var(--text2);border:1px solid var(--border)">${a.position}</span>`:''}
    ${sportLabel&&!myTeam?`<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:var(--bg3);color:var(--text2);border:1px solid var(--border)">${sportLabel}</span>`:''}
  </div>
  <div class="card" style="padding:14px 16px;margin-bottom:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:10px">
      <div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-weight:600">Equipo</div><div style="font-size:13px;font-weight:600">${myTeam?myTeam.name+(myTeam.category?' · '+myTeam.category:''):'Individual'}</div></div>
      <div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-weight:600">Edad</div><div style="font-size:13px;font-weight:600">${a.age?a.age+' años':'—'}</div></div>
      <div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-weight:600">Talla</div><div style="font-size:13px;font-weight:600">${a.height?a.height+' cm':'—'}</div></div>
      <div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-weight:600">Peso</div><div style="font-size:13px;font-weight:600">${a.weight?a.weight+' kg':'—'}</div></div>
    </div>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
    <button class="snav-tab ${sub === 'perfil' ? 'active' : ''}" onclick="setAtletaSubview('perfil')">Perfil</button>
    <button class="snav-tab ${sub === 'rutina' ? 'active' : ''}" onclick="setAtletaSubview('rutina')">Rutina</button>
    <button class="snav-tab ${sub === 'wellness' ? 'active' : ''}" onclick="setAtletaSubview('wellness')">Wellness</button>
    <button class="snav-tab ${sub === 'stats' ? 'active' : ''}" onclick="setAtletaSubview('stats')">Estadísticas</button>
    <button class="snav-tab ${sub === 'evals' ? 'active' : ''}" onclick="setAtletaSubview('evals')">Evaluaciones</button>
  </div>`;

  if (sub === 'rutina') html += renderAtletaRutina(a);
  else if (sub === 'wellness') html += renderGroupWellness(getEffectiveGroupUids(a), {compareOnly: !!a.compareTeamId, selfUid: a.uid});
  else if (sub === 'stats') html += renderGroupStats(getEffectiveGroupUids(a), {compareOnly: !!a.compareTeamId, selfUid: a.uid});
  else if (sub === 'evals') html += renderEvals();
  else html += renderPerfilTab(a);
  return html;
}
window.renderAtletaDetail = renderAtletaDetail;

// Dibuja los gráficos que correspondan según qué pestaña de la ficha esté
// activa — se llama igual sin importar si se entró por "Atletas" o por
// Panel Admin, ya que ambas rutas ahora comparten la misma vista.
function drawAtletaTabCharts() {
  if (!S.atletaView) return;
  const a = S.atletaView;
  if (S.atletaSubview === 'perfil') {
    drawAthleteTrendChart();
  } else if (S.atletaSubview === 'stats') {
    const uids = getEffectiveGroupUids(a);
    const mem = (S.adminAthletes||[]).filter(x=>uids.includes(x.uid));
    if (a.compareTeamId) {
      // Ficha individual comparándose con un equipo: solo el radar
      // (bloqueado en el propio atleta) — sin gráfico de lesiones ni
      // cuadrante, que no se renderizan en este modo (ver renderGroupStats).
      drawTeamRadarChart(mem, a.uid);
    } else {
      drawTeamInjuryChart(mem); drawTeamRadarChart(mem); drawTeamQuadrantChart(mem);
    }
  }
}
window.drawAtletaTabCharts = drawAtletaTabCharts;

// ── PERFIL ───────────────────────────────────────────────────
// Identidad + estado general del atleta: resumen de wellness/carga, datos
// editables (nombre/color/posición/equipo/comparación), sus RM (editables,
// sincronizados desde Evaluaciones) y resetear cuenta. La gestión de la
// rutina en sí (asignar, semana, plan) vive en la pestaña Rutina aparte.
function renderPerfilTab(a) {
  const uid = a.uid;
  const personal = a._personal || {};
  const wellness = personal.wellness || {};
  const injuries = personal.injuries || {};
  const wEntries = Object.entries(wellness).sort((x,y)=>y[0].localeCompare(x[0])).slice(0,7);
  const activeInj = Object.entries(injuries).filter(([,v])=>v.pain>0);
  const allZones=[...BODY_ZONES.front,...BODY_ZONES.back];
  const myTeam = a.teamId ? S.teams.find(t=>t.id===a.teamId) : null;

  const today=todayLocal();
  const todayW = wellness[today];
  const {pct:todayPct, allFilled:todayFilled} = getWellnessScore(todayW);
  const wState = getWellnessState(todayFilled?todayPct:null);
  const logs = personal.history?._sessionLogs || personal.sessionLogs || [];
  const m = calcLoadMetrics(logs);
  const acwrSt = getACWRStatus(m?.acwr??null, m?.daysOfHistory);
  const activeInjCount = activeInj.length;

  let html = `
  <!-- Resumen rápido -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:16px;border:1px solid var(--border)">
    <div style="background:var(--bg2);padding:14px;text-align:center${todayFilled?';cursor:pointer':''}" ${todayFilled?`onclick="viewWellnessDay('${uid}','${today}')"`:''}>
      <div style="font-size:20px;font-weight:800;color:${wState.color}" ${todayFilled?`data-countup="${todayPct}" data-suffix="%"`:''}>${todayFilled?todayPct+'%':'—'}</div>
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Wellness hoy ${infoBtn('wellness')}</div>
      <div style="display:flex;justify-content:center;margin-top:6px">${sparklineSvg(getWellnessSparklineData(personal,14), wState.color, 48, 16)}</div>
    </div>
    <div style="background:var(--bg2);padding:14px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:${acwrSt.color}" ${m?.acwr!=null?`data-countup="${m.acwr}" data-decimals="2"`:''}>${m?.acwr!=null?m.acwr.toFixed(2):'—'}</div>
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">ACWR ${infoBtn('acwr')}</div>
    </div>
    <div style="background:var(--bg2);padding:14px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:${activeInjCount?'var(--red)':'var(--green)'}" data-countup="${activeInjCount||0}">${activeInjCount||'0'}</div>
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Molestias activas</div>
    </div>
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Tendencia — últimos 30 días</div>
    <div style="padding:14px 16px;height:220px;position:relative">
      <canvas id="athlete-trend-chart"></canvas>
    </div>
  </div>

  <!-- Control de carga interna + wellness reciente, arriba del formulario editable -->
  ${(()=>{
    if(!m) return '<div class="admin-section"><div class="admin-section-title">Control de carga interna</div><div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin datos. El atleta debe cargar su carga de gimnasio/pelota/partido en Wellness.</div></div>';
    const monSt=getMonotonyStatus(m.monotony);
    return `<div class="admin-section">
      <div class="admin-section-title">Control de carga interna</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--border)">
        <div style="background:var(--bg2);padding:14px 16px">
          <div style="font-size:22px;font-weight:800;color:${acwrSt.color}">${m.acwr!=null?m.acwr.toFixed(2):'—'}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px">ACWR ${infoBtn('acwr')}</div>
          <div style="font-size:11px;color:${acwrSt.color}">${acwrSt.label}</div>
        </div>
        <div style="background:var(--bg2);padding:14px 16px">
          <div style="font-size:22px;font-weight:800;color:${monSt.color}">${Math.round((m.monotony||0)*10)/10}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px">Monotonía ${infoBtn('monotony')}</div>
          <div style="font-size:11px;color:${monSt.color}">${monSt.label}</div>
        </div>
        <div style="background:var(--bg2);padding:14px 16px">
          <div style="font-size:22px;font-weight:800">${m.acuteUA}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px">UA semana ${infoBtn('ua')}</div>
          <div style="font-size:11px;color:var(--text3)">${m.sessions} sesiones</div>
        </div>
        <div style="background:var(--bg2);padding:14px 16px">
          <div style="font-size:22px;font-weight:800">${Math.round(m.strain)}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px">Strain ${infoBtn('strain')}</div>
          <div style="font-size:11px;color:${m.strain>6000?'var(--red)':m.strain>2000?'var(--amber)':'var(--green)'}">${m.strain>6000?'Alto ⚠':m.strain>2000?'Moderado':'Bajo'}</div>
        </div>
      </div>
    </div>`;
  })()}

  <div class="admin-section">
    <div class="admin-section-title">Wellness — últimos 7 días</div>
    ${wEntries.length?wEntries.map(([date,w])=>{
      const {pct,allFilled}=getWellnessScore(w);
      if(!allFilled) return '';
      const col=getWellnessState(pct).color;
      // Antes esta fila era fecha a la izquierda y % a la derecha, con todo
      // el medio vacío — para ver QUÉ compone ese % (fatiga, dolor, sueño...)
      // había que entrar al detalle del día. Corregido: nada de emojis (eso
      // fue exactamente lo que se pidió sacar) — un chip chico CON EL NOMBRE
      // del ítem por cada uno, coloreado según el valor, en una segunda
      // línea propia para que el nombre entre legible.
      const itemChips = WELLNESS_ITEMS.map(item=>{
        const val = w[item.key];
        const c = wellnessValColor(val);
        return `<span style="font-size:9.5px;font-weight:700;padding:3px 6px;border-radius:4px;background:${c?c.dim:'var(--bg3)'};color:${c?c.solid:'var(--text3)'};white-space:nowrap;flex-shrink:0">${WELLNESS_SHORT_LABEL[item.key]||item.label}</span>`;
      }).join('');
      return `<div class="admin-item" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:7px" onclick="viewWellnessDay('${uid}','${date}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:var(--text3)">${date}</span>
          <span style="font-size:14px;font-weight:600;color:${col}">${pct}% ›</span>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${itemChips}</div>
      </div>`;
    }).join(''):`<div style="padding:12px 14px;font-size:13px;color:var(--text3)">Sin registros de wellness.</div>`}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Perfil</div>
    <div class="admin-item" style="flex-direction:column;align-items:flex-start;gap:10px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%">
        <span style="font-size:11px;color:var(--text3);min-width:50px">Nombre</span>
        <input id="edit-name-${uid}" value="${a.name||''}" placeholder="Apellido y nombre" style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" onblur="setAthleteName('${uid}',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--text3);min-width:50px">Color</span>
        ${TEAM_COLORS.map(c=>`<div onclick="setAthleteColor('${uid}','${c}')" style="width:20px;height:20px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${a.color===c?'#fff':'transparent'};transition:border .15s"></div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%">
        <span style="font-size:11px;color:var(--text3);min-width:50px">Posición</span>
        ${(()=>{
          const posOpts=getPositionOptionsForSport(myTeam?.sport);
          if(posOpts) {
            return `<select id="pos-sel-${uid}" style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" onchange="setAthletePosition('${uid}',this.value)">
              <option value="">— Sin posición —</option>
              ${posOpts.map(p=>`<option value="${p}" ${a.position===p?'selected':''}>${p}</option>`).join('')}
            </select>`;
          }
          return `<input id="pos-inp-${uid}" value="${a.position||''}" placeholder="Ej: Base, Alero..." style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" onblur="setAthletePosition('${uid}',this.value)" onkeydown="if(event.key==='Enter')this.blur()">`;
        })()}
      </div>
      ${!myTeam?.sport&&myTeam?`<div style="font-size:11px;color:var(--text3)">El equipo no tiene deporte definido, así que es un campo de texto libre.</div>`:''}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%">
        <span style="font-size:11px;color:var(--text3);min-width:50px">Equipo</span>
        ${(()=>{
          const instMap = getInstitutionsFromTeams();
          const opts = [];
          Object.keys(instMap).sort().forEach(inst=>{
            [...instMap[inst].categories].sort().forEach(cat=>opts.push({inst,cat}));
          });
          const curVal = (a.institution && a.category) ? (a.institution+'|||'+a.category) : '';
          return `<select id="reassign-sel-${uid}" style="flex:1;min-width:180px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none">
            <option value="">— Sin equipo (individual) —</option>
            ${opts.map(o=>`<option value="${o.inst}|||${o.cat}" ${curVal===(o.inst+'|||'+o.cat)?'selected':''}>${o.inst} / ${o.cat}</option>`).join('')}
          </select>
          <button class="abtn abtn-p" onclick="saveReassignAthleteTeam('${uid}')">Guardar</button>`;
        })()}
      </div>
      <div style="font-size:11px;color:var(--text3)">Se ven TODAS las categorías conocidas (existan o no como equipo todavía) — si elegís una que no existe aún, se crea sola. Sirve para mover a alguien de categoría, fusionar equipos duplicados, o pasarlo de individual a equipo (y viceversa).</div>
      ${!myTeam ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%;padding-top:6px;border-top:1px dashed var(--border);margin-top:2px">
        <span style="font-size:11px;color:var(--text3);min-width:110px">Comparar con equipo</span>
        <select style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" onchange="setAthleteCompareTeam('${uid}',this.value)">
          <option value="">— Ninguno —</option>
          ${S.teams.map(t=>`<option value="${t.id}" ${a.compareTeamId===t.id?'selected':''}>${t.name}${t.category?' · '+t.category:''}</option>`).join('')}
        </select>
      </div>
      <div style="font-size:11px;color:var(--text3)">Para atletas individuales que igual juegan en un club: los suma solo en Wellness/Estadísticas/Evaluaciones para que se puedan comparar, sin volverlos parte real del roster ni tocar su rutina personal.</div>`:''}
    </div>
  </div>

  <!-- RM del atleta: editable acá, y se actualiza solo desde Evaluaciones -->
  <div class="admin-section">
    <div class="admin-section-title">RM del atleta</div>
    <div style="font-size:11px;color:var(--text3);padding:0 14px 8px">Se puede editar acá directamente. Si cargás un test de 1RM en Evaluaciones, el valor correspondiente se actualiza solo (nunca al revés).</div>
    ${RM_LIFTS.map(rm=>`<div class="admin-item">
      <span style="font-size:13px">${rm.label}</span>
      <input type="number" step="0.5" min="0" placeholder="kg" value="${personal.oneRM?.[rm.id]||''}" style="width:90px;text-align:right;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" onblur="adminSaveOneRM('${uid}','${rm.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
    </div>`).join('')}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Molestias activas</div>
    ${activeInj.length?`<div style="padding:10px 14px;display:flex;flex-direction:column;gap:10px">${activeInj.map(([id,inj])=>{
      const zone=allZones.find(z=>z.id===id);
      const sev = severityInfo(inj.severity) || severityInfo('leve');
      const trend = getInjuryTrend(inj);
      return `<div style="background:var(--bg);border:1px solid var(--border2);border-radius:var(--rsm);padding:10px 12px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:8px;height:8px;border-radius:50%;background:${sev.color};flex-shrink:0"></div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${zone?.label||id}${inj.type?' · '+INJURY_TYPES[inj.type]:''}</div>
            <div style="font-size:11px;color:var(--text3);cursor:pointer" onclick="openPainTrendModal('${uid}','${id}')" title="Tocá para ver la progresión">
              Dolor de hoy: ${inj.pain}/10${inj.note?' · '+inj.note.slice(0,40):''}
              ${trend?` <span style="color:${trend.color};font-weight:800;font-size:13px" title="${trend.label}">${trend.arrow}</span>`:''}
            </div>
            ${(()=>{ const sc=ostrcTotal(inj); return sc!=null?`<div style="font-size:11px;color:var(--text3)">Puntaje OSTRC: <b style="color:var(--text)">${sc}/100</b></div>`:''; })()}
          </div>
        </div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Gravedad clínica (la fijás vos, no depende del dolor del día)</div>
        <div style="display:flex;gap:6px">
          ${SEVERITY_LEVELS.map(s=>`<button onclick="adminSetInjurySeverity('${uid}','${id}','${s.id}')" style="flex:1;padding:6px;border-radius:var(--rxs);border:1px solid ${sev.id===s.id?s.color:'var(--border2)'};background:${sev.id===s.id?s.color+'1a':'transparent'};color:${sev.id===s.id?s.color:'var(--text3)'};font-weight:${sev.id===s.id?'700':'400'};font-size:11px;cursor:pointer">${s.label}</button>`).join('')}
        </div>
        ${isRealInjury(inj)?`
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 5px">Fase de retorno al juego</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${RTP_PHASES.map(p=>`<button onclick="adminSetInjuryRtpPhase('${uid}','${id}','${p.id}')" style="flex:1;min-width:80px;padding:6px;border-radius:var(--rxs);border:1px solid ${inj.rtpPhase===p.id?'var(--accent)':'var(--border2)'};background:${inj.rtpPhase===p.id?'var(--accent-dim)':'transparent'};color:${inj.rtpPhase===p.id?'var(--accent)':'var(--text3)'};font-weight:${inj.rtpPhase===p.id?'700':'400'};font-size:11px;cursor:pointer">${p.label}</button>`).join('')}
        </div>`:''}
        ${renderInjuryStudies(id, inj, uid)}
      </div>`;
    }).join('')}</div>`:`<div style="padding:12px 14px;font-size:13px;color:var(--text3)">Sin molestias registradas.</div>`}
  </div>

  ${(()=>{
    const activeIllness = getActiveIllness(personal.illnesses);
    const pastIllnesses = (personal.illnesses||[]).filter(x=>x.endDate && (!activeIllness||x.id!==activeIllness.id));
    return `<div class="admin-section">
    <div class="admin-section-title">Salud general (no es lesión física)</div>
    <div style="padding:10px 14px">
      ${activeIllness
        ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px">
             <span>🤒 Enfermedad activa desde ${activeIllness.startDate}${activeIllness.note?' · '+activeIllness.note:''}</span>
             <button class="abtn" style="font-size:11px;padding:4px 8px" onclick="adminResolveIllness('${uid}','${activeIllness.id}')">Marcar recuperado</button>
           </div>`
        : (S._showAdminIllnessForm
          ? `<div>
              <input type="text" id="admin-illness-note-inp" placeholder="Ej: Gripe" style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none;margin-bottom:8px;box-sizing:border-box">
              <div style="display:flex;gap:8px">
                <button class="abtn abtn-p" style="flex:1" onclick="adminAddIllness('${uid}',document.getElementById('admin-illness-note-inp').value)">Guardar</button>
                <button class="abtn" onclick="toggleAdminIllnessForm()">Cancelar</button>
              </div>
            </div>`
          : `<span style="font-size:12px;color:var(--text3);cursor:pointer" onclick="toggleAdminIllnessForm()">Sin enfermedad activa · + Registrar</span>`)
      }
      ${pastIllnesses.length ? `<div style="font-size:11px;color:var(--text3);margin-top:10px">Historial: ${pastIllnesses.map(x=>x.startDate+'→'+x.endDate+(x.note?' ('+x.note+')':'')).join(' · ')}</div>` : ''}
    </div>
  </div>`;
  })()}

  <div class="admin-section" style="border-color:rgba(195,58,44,0.3)">
    <div class="admin-item" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div><div class="admin-item-lbl" style="color:var(--red)">Resetear cuenta</div><div class="admin-item-sub">Borra todo (nombre, equipo, tests, wellness) y lo manda al registro de cero la próxima vez que entre con el mismo mail. No borra el mail en sí — para eso, esa persona tiene que entrar y usar "Eliminar mi cuenta" en Ajustes.</div></div>
      <button class="abtn abtn-d" onclick="resetAthleteAccount('${uid}')">Resetear cuenta</button>
    </div>
  </div>`;

  return html;
}
window.renderPerfilTab = renderPerfilTab;

function setAtletaSubview(v) {
  S.atletaSubview = v;
  // OJO: Evaluaciones nunca se amplía con el equipo de comparación — eso
  // dejaría entrar/editar el historial de evaluaciones de los compañeros
  // desde la ficha de un atleta individual, que es justo lo que no
  // queremos. La comparación con el equipo, en gráficos, vive en la
  // pestaña Estadísticas (radar/cuadrante), no acá.
  const uids = S.atletaView ? [S.atletaView.uid] : [];
  const statsWellnessUids = S.atletaView ? getEffectiveGroupUids(S.atletaView) : [];
  if (v === 'evals') {
    S.evalScopeUids = uids;
    S.evalAthleteId = S.atletaView?.uid || null;
    ensureAdminAthletes()
      .then(()=>ensureAthleteEvalData(S.evalAthleteId))
      .then(() => { renderMain(); setTimeout(drawEvalCharts, 80); })
      .catch((e)=>{ console.error('Error al cargar Evaluaciones del atleta', e); showToast('Error: '+(e?.message||e)); renderMain(); });
    return;
  }
  if (v === 'wellness' || v === 'stats') {
    ensureGroupPersonalData(statsWellnessUids)
      .then(renderMain)
      .catch((e)=>{ console.error('Error al cargar datos del atleta', e); showToast('Error: '+(e?.message||e)); renderMain(); });
    return;
  }
  renderMain();
}
window.setAtletaSubview = setAtletaSubview;

// Vista de solo-lectura de la rutina asignada, + el mismo control de
// asignación que ya existe en Panel Admin → Alumnos (misma id de <select>,
// así assignRoutineToAthlete funciona sin cambios).
function renderAtletaRutina(a) {
  const routine = S.routines.find(r => r.id === a.assignedRoutine);
  const routineOpts = `<select id="assign-routine-sel" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none">
    <option value="">— Sin rutina —</option>
    ${S.routines.map(r => `<option value="${r.id}" ${a.assignedRoutine === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
  </select>`;

  let html = `<div class="admin-section">
    <div class="admin-section-title">Rutina asignada</div>
    <div class="admin-item" style="gap:8px;flex-wrap:wrap">
      ${routineOpts}
      <button class="abtn abtn-p" onclick="assignRoutineToAthlete('${a.uid}')">Asignar</button>
    </div>
    ${(routine && a.trainingWeekdays && a.trainingWeekdays.length) ? `<div style="font-size:12px;color:var(--text3);margin-top:6px">
      Días de gimnasio: ${[...a.trainingWeekdays].sort((x,y)=>x-y).map(d=>WEEKDAY_LABELS[d]).join(' · ')}
      — para cambiarlos, elegí la misma rutina y tocá "Asignar" de nuevo.
    </div>` : ''}
  </div>`;

  if (!routine) {
    html += `<div class="empty-state">Este atleta no tiene una rutina asignada todavía.</div>`;
    return html;
  }
  // La semana REAL se cuenta desde que se ASIGNÓ esta rutina (fecha real en
  // Firestore), no desde que el atleta se registró — si por algún motivo esa
  // fecha no está (rutinas asignadas antes de este cambio), caemos en la
  // fecha de inicio general.
  const realWeek = a.routineAssignedDate ? computeWeekFromDate(a.routineAssignedDate)
    : (a._personal?.startDate ? computeWeekFromDate(a._personal.startDate) : 1);
  // La navegación ‹/› solo cambia esta variable LOCAL para poder hojear otras
  // semanas de la planificación — antes movía routineAssignedDate en
  // Firestore, lo cual cambiaba de verdad la semana real del atleta (¡y lo
  // que ve en su propio celular!) cada vez que el admin solo quería mirar.
  const previewWeek = S._routineWeekPreview?.[a.uid] ?? realWeek;
  const isViewingReal = previewWeek === realWeek;

  const sessionNames = getOrderedSessionNames(routine);
  // Qué día le toca hoy al atleta según su calendario real (días de gimnasio
  // asignados, o el nombre del día si son días de semana reales).
  const todaySession = getTodaysRoutineSession(sessionNames, a.routineAssignedDate, a.trainingWeekdays);
  // La primera vez que se entra a esta ficha (nadie tocó un desplegable a
  // mano todavía) arrancamos con SOLO el día de hoy abierto, el resto
  // colapsado — así no hay que buscarlo entre todos los días de la rutina.
  if (!S._atletaRoutineCollapsedDays) {
    S._atletaRoutineCollapsedDays = new Set(sessionNames.filter(n=>n!==todaySession));
  }
  html += `<div class="admin-section">
    <div class="admin-item" style="flex-direction:column;align-items:stretch;gap:8px">
      <div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:600">Semana real de esta planificación</div>
        <div style="font-size:20px;font-weight:800;color:var(--accent-text);font-family:'Barlow Condensed',sans-serif">Semana ${realWeek}</div>
        ${!isViewingReal?`<div style="font-size:11px;color:var(--amber);margin-top:2px">Estás mirando la Semana ${previewWeek} — esto no cambia la planificación real del atleta.</div>`:''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button class="abtn" onclick="adjustAthleteRoutineWeek('${a.uid}',-1)" title="Ver la semana anterior (no cambia la fecha real)">‹ Semana</button>
        <button class="abtn" onclick="adjustAthleteRoutineWeek('${a.uid}',1)" title="Ver la semana siguiente (no cambia la fecha real)">Semana ›</button>
        ${!isViewingReal?`<button class="abtn abtn-p" onclick="resetRoutineWeekPreview('${a.uid}')" title="Volver a mostrar la semana real del atleta">Volver a la real</button>`:''}
      </div>
    </div>
    <div class="admin-item" style="flex-direction:column;align-items:stretch;gap:8px;border-top:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text3)">¿Está mal la semana real? Corregila acá (esto SÍ cambia lo que ve el atleta)</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <button class="abtn" onclick="adminSetRealRoutineWeek('${a.uid}',${Math.max(1,realWeek-1)})" title="Corregir la semana real, un número menos">− Corregir</button>
        <button class="abtn" onclick="adminSetRealRoutineWeek('${a.uid}',${realWeek+1})" title="Corregir la semana real, un número más">Corregir +</button>
        <button class="abtn abtn-d" onclick="resetAthleteRoutineWeek('${a.uid}')" title="Reasigna la planificación para que arranque hoy en Semana 1">Reiniciar a Sem. 1</button>
      </div>
    </div>
  </div>
  <div class="admin-section">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:2px">
      <div class="admin-section-title" style="margin-bottom:0">${routine.name}</div>
      <div style="display:flex;gap:6px">
        <button class="abtn ${S._atletaRoutineCicloView!=='macro'?'abtn-p':''}" onclick="setAtletaRoutineCicloView('micro')">Vista microciclo</button>
        <button class="abtn ${S._atletaRoutineCicloView==='macro'?'abtn-p':''}" onclick="setAtletaRoutineCicloView('macro')">Vista macrociclo</button>
      </div>
    </div>
    ${sessionNames.map(sName => {
      const blocks = getVisibleRoutineBlocks(routine, sName, a.teamId, a.position, a._personal?.personalExtras);
      const dayCollapsed = S._atletaRoutineCollapsedDays?.has(sName);
      const dayDone = !!(a._personal?.history?.[sessionKey(previewWeek, sName)]?.done);
      const isToday = sName===todaySession && isViewingReal;
      return `<div style="border-top:1px solid var(--border)${isToday?';background:var(--accent-dim)':''}">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer" onclick="toggleAtletaRoutineDay('${sName}')">
          <div style="font-size:11px;font-weight:700;color:var(--accent-text);text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:6px">
            ${sName}${isToday?'<span style="font-size:9px;font-weight:800;background:var(--accent);color:#fff;padding:2px 6px;border-radius:10px;text-transform:none;letter-spacing:0">HOY</span>':''}
            ${dayDone?'<span style="color:var(--green);font-size:13px">✓</span>':''}
          </div>
          <span style="color:var(--text3);font-size:16px;transition:transform .15s;transform:rotate(${dayCollapsed?'-90':'0'}deg)">›</span>
        </div>
        ${dayCollapsed ? '' : (blocks.length ? blocks.map(b=>{
          const blockOpen = !S._atletaRoutineCollapsedBlocks?.has(b.id);
          return `<div class="card block ${b.colorKey||'bx'} ${blockOpen?'open':''}" style="margin:0 16px 10px">
            <div class="block-header" onclick="toggleAtletaRoutineBlock('${b.id}')">
              <span class="block-badge">${b.label}</span>
              <div class="block-title-wrap"><span class="block-title">${b.title||''}</span></div>
              <span class="block-chevron">›</span>
            </div>
            <div class="block-body">
              ${(b.categories||[]).map(cat=>`
                ${cat.label?`<div class="cat-header"><div class="cat-label-wrap"><span class="cat-label">${cat.label}</span></div></div>`:''}
                ${(cat.exercises||[]).map(ex=>{
                  const wp = getExPrescriptionForWeek(ex, previewWeek);
                  // Solo la semana EXACTA que se está mostrando — nada de
                  // buscar hacia atrás. Antes, al hojear una semana "fantasma"
                  // (que el atleta nunca hizo), se mostraba la carga/RPE de una
                  // semana anterior como si fuera de esa semana, lo cual además
                  // guardaba cualquier edición en la semana equivocada.
                  const doneData = a._personal?.history?.[sessionKey(previewWeek, sName)]?.exercises?.[ex.id] || {};
                  const hasCompletion = !!(doneData.load || doneData.rpe);
                  const durationWeeksEx = routine?.durationWeeks || 1;
                  const lastWeekEx = Math.max(durationWeeksEx, previewWeek);
                  if (S._atletaRoutineCicloView === 'macro') {
                    return `
                    <div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--rsm);padding:12px;margin-bottom:8px">
                      <div style="font-size:14px;font-weight:600;margin-bottom:8px">${ex.name}</div>
                      ${buildWeeklyProgressionTable(lastWeekEx, previewWeek, (w) => ({
                        wp: getExPrescriptionForWeek(ex, w),
                        d: a._personal?.history?.[sessionKey(w, sName)]?.exercises?.[ex.id] || {}
                      }), {uid:a.uid, sName, exId:ex.id})}
                    </div>`;
                  }
                  return `
                  <div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--rsm);padding:12px;margin-bottom:8px">
                    <div style="font-size:14px;font-weight:600;margin-bottom:8px">${ex.name} <span style="font-size:10px;color:var(--accent-text);font-weight:600;cursor:pointer" onclick="openAdminProgressionModal('${a.uid}','${ex.id}','${ex.name.replace(/'/g,"\\'")}','${sName.replace(/'/g,"\\'")}')" title="Ver todas las semanas">· Semana ${previewWeek} · Ver todas ▤</span>${b.id==='personal-block'?`<span style="float:right;font-size:10px;color:var(--red);font-weight:600;cursor:pointer" onclick="removePersonalExtraExercise('${a.uid}','${sName.replace(/'/g,"\\'")}','${ex.id}')">Quitar</span>`:''}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                      <div class="field-box"><span class="field-lbl">Series</span><div style="font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 7px;text-align:center;min-width:44px">${wp.series||'—'}</div></div>
                      <div class="field-box"><span class="field-lbl">Reps</span><div style="font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 7px;text-align:center;min-width:44px">${wp.reps||'—'}</div></div>
                      ${wp.pct?`<div class="field-box"><span class="field-lbl">%RM</span><div style="font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 7px;text-align:center;min-width:44px">${wp.pct}${(()=>{ const rmV=ex.rmLift?a._personal?.oneRM?.[ex.rmLift]:null; if(!rmV) return ''; const parts=wp.pct.split('/').map(p=>p.trim()).filter(Boolean); const kg=parts.map(p=>{const n=parseDecimal(p);return isNaN(n)?'?':Math.round((n/100)*rmV);}).join('/'); return ' ≈ '+kg+'kg'; })()}</div></div>`:''}
                      <div class="field-box"><span class="field-lbl">${wp.intensityType||'RPE'}</span><div style="font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 7px;text-align:center;min-width:44px">${wp.rpe||'—'}</div></div>
                      ${wp.note?`<div class="field-box" style="flex:1;min-width:120px"><span class="field-lbl">Nota</span><div style="font-size:13px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px">${wp.note}</div></div>`:''}
                    </div>
                    ${(()=>{
                      const sNameEsc = sName.replace(/'/g,"\\'");
                      const intensityLbl = wp.intensityType||'RPE';
                      const loadTxt = doneData.load ? doneData.load+'kg' : '— kg';
                      const rpeTxt = intensityLbl+' '+(doneData.rpe!=null&&doneData.rpe!==''?doneData.rpe:'—');
                      const txtColor = hasCompletion ? 'var(--green)' : 'var(--text3)';
                      return `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <span style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:600">Completó</span>
                      <span class="done-field-wrap">
                        <span class="done-field-txt" style="color:${txtColor}" ondblclick="editAthleteDoneField(event)">${loadTxt}</span>
                        <input class="done-field-inp" type="number" value="${doneData.load||''}" placeholder="kg" onblur="saveAthleteDoneField('${a.uid}',${previewWeek},'${sNameEsc}','${ex.id}','load',null,this)" onkeydown="if(event.key==='Enter')this.blur()">
                      </span>
                      <span class="done-field-wrap">
                        <span class="done-field-txt" style="color:${txtColor}" ondblclick="editAthleteDoneField(event)">${rpeTxt}</span>
                        <input class="done-field-inp" type="number" value="${doneData.rpe||''}" placeholder="${intensityLbl}" onblur="saveAthleteDoneField('${a.uid}',${previewWeek},'${sNameEsc}','${ex.id}','rpe','${intensityLbl}',this)" onkeydown="if(event.key==='Enter')this.blur()">
                      </span>
                    </div>`;
                    })()}
                    ${doneData.athleteNote?`<div style="margin-top:6px;background:var(--amber-dim);border:1px solid rgba(198,124,15,0.3);border-radius:var(--rxs);padding:8px 10px;font-size:12px;color:var(--text)">
                      <span style="font-weight:700;color:var(--amber)">📝 Nota del atleta:</span> ${doneData.athleteNote}
                    </div>`:''}
                  </div>`;}).join('')}
              `).join('')}
            </div>
          </div>`;
        }).join('') : `<div style="padding:0 16px 12px;font-size:12px;color:var(--text3)">Sin ejercicios cargados</div>`)}
        ${dayCollapsed ? '' : `<div style="padding:0 16px 12px"><button class="abtn" style="font-size:11px" onclick="openPersonalExtraLib('${a.uid}','${sName.replace(/'/g,"\\'")}')" title="Se lo agrega SOLO a ${a.name||a.email}, no afecta a sus compañeros">+ Ejercicio personal para ${(a.name||a.email||'').split(' ')[0]}</button></div>`}
      </div>`;
    }).join('')}
  </div>`;
  return html;
}
window.renderAtletaRutina = renderAtletaRutina;

// Colapsar/desplegar días y bloques en la VISTA PREVIA de la rutina asignada
// (ficha del atleta) — a propósito usa su propio estado (S._atletaRoutine...),
// separado del que usa el editor real de rutinas, para no arriesgar mezclar
// ediciones de una rutina con la vista de otra.
function toggleAtletaRoutineDay(sName) {
  if(!S._atletaRoutineCollapsedDays) S._atletaRoutineCollapsedDays = new Set();
  const set = S._atletaRoutineCollapsedDays;
  if(set.has(sName)) set.delete(sName); else set.add(sName);
  renderMain();
}
window.toggleAtletaRoutineDay = toggleAtletaRoutineDay;

function toggleAtletaRoutineBlock(blockId) {
  if(!S._atletaRoutineCollapsedBlocks) S._atletaRoutineCollapsedBlocks = new Set();
  const set = S._atletaRoutineCollapsedBlocks;
  if(set.has(blockId)) set.delete(blockId); else set.add(blockId);
  renderMain();
}
window.toggleAtletaRoutineBlock = toggleAtletaRoutineBlock;

// ── SETTINGS ─────────────────────────────────────────────────
// Fuerza a bajar la última versión de la app, saltando cualquier caché del
// navegador o del service worker — botón "Actualizar app" en Ajustes.
async function forceAppUpdate() {
  showToast('Actualizando…');
  try {
    if('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k=>caches.delete(k)));
    }
    if('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
  } catch(e) {}
  // location.reload(true) es un parámetro viejo que la mayoría de los
  // navegadores modernos (Safari en iPhone incluido) ignoran en silencio —
  // hace un refresco normal, no uno que fuerce bajar todo de cero. En vez de
  // eso, navegamos a una URL con un parámetro nuevo cada vez, para que el
  // navegador la trate como una página distinta y no pueda reusar nada viejo.
  location.href = location.pathname + '?_fresh=' + Date.now();
}
window.forceAppUpdate = forceAppUpdate;

// ── NOTIFICACIONES DENTRO DE LA APP (sin WhatsApp, sin push nativo) ──────
function updateNotifBadge() {
  const unread = (S.notifications||[]).filter(n=>!n.read).length;
  ['notif-badge-mobile','notif-badge-desk'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(unread>0) { el.textContent = unread>9?'9+':unread; el.style.display='flex'; }
    else el.style.display='none';
  });
}
window.updateNotifBadge = updateNotifBadge;

function renderNotifications() {
  const notifs = S.notifications||[];
  // Ordenamos ÍNDICES (no una copia de los objetos) — así "Marcar leído"
  // sigue apuntando a la posición real dentro de S.notifications aunque en
  // pantalla se muestren en otro orden (más reciente primero). Antes se
  // ordenaba una copia y se usaba el índice de ESA copia como si fuera el
  // índice original: con más de una notificación fuera de orden, tocaba
  // "Marcar leído" en una y en realidad marcaba otra distinta — el número de
  // la campanita nunca bajaba porque la que se veía en pantalla seguía sin
  // leer.
  const order = notifs.map((_,i)=>i).sort((ai,bi)=>(notifs[bi].date||'').localeCompare(notifs[ai].date||''));
  let html = `<div class="page-header">
    <div class="page-title">Notificaciones</div>
    <div class="page-subtitle">${order.length?notifs.filter(n=>!n.read).length+' sin leer':'Nada nuevo por acá'}</div>
  </div>`;
  if(!order.length) {
    html += `<div class="empty-state">No tenés notificaciones todavía.</div>`;
    return html;
  }
  html += `<div class="wellness-card">
    ${order.map(i=>{ const n=notifs[i]; return `
      <div class="hooper-item" style="background:${n.read?'transparent':'var(--accent-dim)'}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div style="font-size:13px;line-height:1.5">${n.message}</div>
          ${!n.read?`<button class="abtn" style="flex-shrink:0;font-size:11px" onclick="markNotificationRead(${i})">Marcar leído</button>`:''}
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${n.date||''}</div>
      </div>`; }).join('')}
  </div>`;
  return html;
}
window.renderNotifications = renderNotifications;

async function markNotificationRead(idx) {
  if(!S.notifications || !S.notifications[idx]) return;
  S.notifications[idx].read = true;
  try { await setDoc(doc(db,'personal',S.user.uid), {notifications:S.notifications}, {merge:true}); } catch(e){}
  updateNotifBadge();
  renderMain();
}
window.markNotificationRead = markNotificationRead;

async function markAllNotificationsRead() {
  if(!S.notifications) return;
  S.notifications.forEach(n=>n.read=true);
  try { await setDoc(doc(db,'personal',S.user.uid), {notifications:S.notifications}, {merge:true}); } catch(e){}
  updateNotifBadge();
  renderMain();
}
window.markAllNotificationsRead = markAllNotificationsRead;

// ── NOTIFICACIONES PUSH REALES (Web Push) ──────────────────────
// A diferencia de S.notifications (que solo se ve DENTRO de la app, en la
// campanita), esto le llega al celular como cualquier notificación del
// sistema, aunque G-Metrics esté cerrada. Estándar Web Push (RFC 8291/8292):
// el navegador genera una "suscripción" (endpoint + claves) que se guarda en
// su propio documento de Firestore (mismo patrón que photoUrl), y cuando el
// admin quiere avisarle algo, el propio cliente arma la lista de a quién
// mandarle y se la pasa a /api/send-push (función serverless de Vercel) —
// el cifrado y el envío real no se pueden hacer desde el navegador del admin
// porque los servidores push de Apple/Google no responden con CORS.
const VAPID_PUBLIC_KEY = 'BD_LHVYb3YbBE8Ih_viOAqYlp_2TXWlJa0dLGfNKsQfZlnxun47Up_nD9RMvUieeUMcrWRXw60u5e3Q_1HCBKy8';
// Igual que en la guía de la que sale este patrón: no es un secreto
// criptográfico, solo evita que cualquiera le pegue a /api/send-push desde
// afuera. Tiene que ser EXACTAMENTE el mismo string que la variable de
// entorno PUSH_API_SECRET en Vercel.
const PUSH_API_SECRET = 'ea0345e39a0b8631223fe3d23ebf8af5cb00264b6d9881b5';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Safari en iPhone solo soporta Web Push si la PWA está agregada a la
// pantalla de inicio (modo standalone) — pedir permiso antes de eso no
// funciona, hay que guiar al usuario a instalarla primero.
function esIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }
window.esIOS = esIOS;
function esStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
window.esStandalone = esStandalone;

async function activarNotificacionesPush() {
  if(typeof Notification==='undefined') { showToast('Tu navegador no soporta notificaciones'); return; }
  if(esIOS() && !esStandalone()) {
    alert('En iPhone: primero agregá G-Metrics a tu pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ese ícono — recién ahí Safari deja activar notificaciones.');
    return;
  }
  try {
    const permiso = await Notification.requestPermission();
    if(permiso==='denied') { showToast('Bloqueaste las notificaciones — activalas desde la configuración del sitio en tu navegador'); return; }
    if(permiso!=='granted') return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    const raw = sub.toJSON();
    const subData = { endpoint: raw.endpoint, p256dh: raw.keys.p256dh, auth: raw.keys.auth };
    await setDoc(doc(db,'users',S.user.uid), {pushSubscription:subData}, {merge:true});
    if(S.userData) S.userData.pushSubscription = subData;
    showToast('✓ Notificaciones activadas');
    renderMain();
  } catch(e) {
    showToast('No se pudieron activar: '+(e?.message||e));
  }
}
window.activarNotificacionesPush = activarNotificacionesPush;

async function desactivarNotificacionesPush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if(sub) await sub.unsubscribe();
    await setDoc(doc(db,'users',S.user.uid), {pushSubscription:deleteField()}, {merge:true});
    if(S.userData) delete S.userData.pushSubscription;
    showToast('Notificaciones desactivadas');
    renderMain();
  } catch(e) {
    showToast('Error al desactivar');
  }
}
window.desactivarNotificacionesPush = desactivarNotificacionesPush;

// Manda un push real a los uids que tengan pushSubscription guardada (los que
// no la tengan simplemente no reciben nada acá — igual les queda el aviso
// adentro de la app vía S.notifications). Se apoya en S.adminAthletes, que ya
// tiene el documento completo de cada atleta cargado — no hace falta pedirle
// permiso a Firestore para leer la suscripción de cada uno por separado.
async function sendPushToUids(uids, {title, body, url} = {}) {
  const subs = (uids||[])
    .map(uid => (S.adminAthletes||[]).find(a=>a.uid===uid)?.pushSubscription)
    .filter(Boolean);
  if(!subs.length) return {sent:0, total:(uids||[]).length};
  try {
    const resp = await fetch('/api/send-push', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'X-Push-Secret': PUSH_API_SECRET},
      body: JSON.stringify({subscriptions:subs, title:title||'G-Metrics', body:body||'', url:url||location.origin})
    });
    if(!resp.ok) return {sent:0, total:uids.length, error:true};
    const data = await resp.json();
    const results = data.results||[];
    const sent = results.filter(r=>r.ok).length;
    // Suscripciones vencidas (404/410 — el usuario desinstaló, bloqueó, o
    // cambió de navegador): las limpiamos para no reintentar siempre en vano.
    const dead = results.filter(r=>!r.ok && (r.status===404||r.status===410)).map(r=>r.endpoint);
    if(dead.length) {
      (uids||[]).forEach(uid=>{
        const a = (S.adminAthletes||[]).find(x=>x.uid===uid);
        if(a?.pushSubscription && dead.includes(a.pushSubscription.endpoint)) {
          delete a.pushSubscription;
          setDoc(doc(db,'users',uid), {pushSubscription:deleteField()}, {merge:true}).catch(()=>{});
        }
      });
    }
    return {sent, total:uids.length};
  } catch(e) {
    return {sent:0, total:(uids||[]).length, error:true};
  }
}
window.sendPushToUids = sendPushToUids;

// Corrige de una sola vez la capitalización de TODOS los nombres: atletas
// registrados, su entrada en el roster de su equipo, y los jugadores
// pendientes (sin cuenta todavía). Útil para arreglar de golpe los nombres
// que algunos cargaron en mayúscula o minúscula.
async function fixAllNameCapitalization() {
  if(!confirm('¿Corregir mayúsculas de todos los nombres registrados? Esto no se puede deshacer.')) return;
  showToast('Corrigiendo…');
  await ensureAdminAthletes();
  let fixedCount = 0;

  for(const a of S.adminAthletes) {
    const oldName = a.name;
    const newName = capitalizeName(oldName);
    if(newName && newName!==oldName) {
      try {
        await setDoc(doc(db,'users',a.uid), {name:newName}, {merge:true});
        // Actualizamos también su entrada en el roster del equipo, si tiene.
        if(a.teamId) {
          const team = S.teams.find(t=>t.id===a.teamId);
          if(team && team.players) {
            const idx = team.players.findIndex(p=>namesLikelyMatch(p,oldName));
            if(idx>=0 && team.players[idx]!==newName) {
              team.players[idx] = newName;
              await updateDoc(doc(db,'teams',team.id), {players:team.players});
            }
          }
        }
        a.name = newName;
        fixedCount++;
      } catch(e) { /* seguimos con el resto aunque uno falle */ }
    }
  }

  // Jugadores pendientes (sin cuenta todavía)
  for(const p of (S.pendingAthletes||[])) {
    const newName = capitalizeName(p.name);
    if(newName && newName!==p.name) {
      try {
        await setDoc(doc(db,'pendingAthletes',p.id), {name:newName}, {merge:true});
        const team = S.teams.find(t=>t.id===p.teamId);
        if(team && team.players) {
          const idx = team.players.findIndex(pl=>namesLikelyMatch(pl,p.name));
          if(idx>=0) { team.players[idx]=newName; await updateDoc(doc(db,'teams',team.id), {players:team.players}); }
        }
        p.name = newName;
        fixedCount++;
      } catch(e) {}
    }
  }

  showToast(`✓ ${fixedCount} nombre${fixedCount!==1?'s':''} corregido${fixedCount!==1?'s':''}`);
  renderMain();
}
window.fixAllNameCapitalization = fixAllNameCapitalization;

// ── ORDEN DE NOMBRES (Apellido, Nombre) — con vista previa ──────────────
// No hay forma de saber por código si un nombre YA está en formato
// "Apellido Nombre" (el campo es texto libre, no hay firstName/lastName
// separados) — por eso esto SIEMPRE pasa por una revisión antes de guardar,
// a diferencia de fixAllNameCapitalization que sí es seguro aplicar directo.
// La propuesta: mover la primera palabra al final, dejando el resto (uno o
// dos apellidos) en el mismo orden en que la persona los escribió.
function proposeNameOrder(rawName) {
  const cap = capitalizeName(rawName);
  const words = cap.split(' ').filter(Boolean);
  if(words.length<2) return cap;
  const first = words.shift();
  words.push(first);
  return words.join(' ');
}
window.proposeNameOrder = proposeNameOrder;

function getNameOrderCandidates() {
  const list = [];
  (S.adminAthletes||[]).forEach(a=>{
    const proposed = proposeNameOrder(a.name);
    if(proposed && proposed!==a.name) list.push({kind:'user', id:a.uid, current:a.name, proposed});
  });
  (S.pendingAthletes||[]).forEach(p=>{
    const proposed = proposeNameOrder(p.name);
    if(proposed && proposed!==p.name) list.push({kind:'pending', id:p.id, current:p.name, proposed});
  });
  return list;
}
window.getNameOrderCandidates = getNameOrderCandidates;

function openNameOrderReview() {
  S.adminView = 'name_order_review';
  S.currentView = 'admin';
  S._nameOrderChecked = null;
  renderBottomBar();
  renderMain();
}
window.openNameOrderReview = openNameOrderReview;

function toggleNameOrderChecked(i) {
  if(!S._nameOrderChecked) return;
  if(S._nameOrderChecked.has(i)) S._nameOrderChecked.delete(i); else S._nameOrderChecked.add(i);
  renderMain();
}
window.toggleNameOrderChecked = toggleNameOrderChecked;

function setAllNameOrderChecked(val) {
  const candidates = getNameOrderCandidates();
  S._nameOrderChecked = val ? new Set(candidates.map((c,i)=>i)) : new Set();
  renderMain();
}
window.setAllNameOrderChecked = setAllNameOrderChecked;

function renderNameOrderReview() {
  const candidates = getNameOrderCandidates();
  if(!S._nameOrderChecked) S._nameOrderChecked = new Set(candidates.map((c,i)=>i));
  return `<div class="team-detail-header">
    <button class="back-btn" data-back="admin-main">‹</button>
    <div class="team-detail-title">Revisar orden de nombres</div>
  </div>
  <div style="font-size:12px;color:var(--text3);margin-bottom:16px">
    Propuesta: mover la primera palabra al final (ej. "Facundo Letanu" → "Letanu Facundo"), dejando el resto en el mismo orden en que lo escribieron — así un doble apellido no se reordena entre sí, solo se mueve el nombre de pila al final. No hay forma de saber por código cuáles YA están en formato Apellido-Nombre: desmarcá esos antes de aplicar.
  </div>
  ${candidates.length ? `
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="abtn" onclick="setAllNameOrderChecked(true)">Marcar todos</button>
    <button class="abtn" onclick="setAllNameOrderChecked(false)">Desmarcar todos</button>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">${candidates.length} nombre${candidates.length!==1?'s':''} con cambio propuesto</div>
    ${candidates.map((c,i)=>`
      <div class="admin-item" style="cursor:pointer" onclick="toggleNameOrderChecked(${i})">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
          <input type="checkbox" ${S._nameOrderChecked.has(i)?'checked':''} onclick="event.stopPropagation();toggleNameOrderChecked(${i})" style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer;flex-shrink:0">
          <div style="min-width:0">
            <div style="font-size:11px;color:var(--text3);text-decoration:line-through">${c.current}</div>
            <div style="font-size:13px;font-weight:600">${c.proposed}</div>
          </div>
        </div>
      </div>`).join('')}
  </div>
  <button class="wellness-submit" onclick="applyNameOrderReview()">Aplicar seleccionados (${S._nameOrderChecked.size})</button>
  ` : `<div class="empty-state">No hay cambios de orden para proponer.</div>`}`;
}
window.renderNameOrderReview = renderNameOrderReview;

async function applyNameOrderReview() {
  const candidates = getNameOrderCandidates();
  const checked = S._nameOrderChecked || new Set();
  if(!checked.size) { showToast('No marcaste ninguno'); return; }
  if(!confirm(`¿Aplicar el nuevo orden a ${checked.size} nombre${checked.size!==1?'s':''}? Esto no se puede deshacer.`)) return;
  showToast('Aplicando…');
  let fixedCount = 0;
  for(let i=0;i<candidates.length;i++) {
    if(!checked.has(i)) continue;
    const c = candidates[i];
    try {
      if(c.kind==='user') {
        await setDoc(doc(db,'users',c.id), {name:c.proposed}, {merge:true});
        const a = S.adminAthletes.find(x=>x.uid===c.id);
        if(a) {
          if(a.teamId) {
            const team = S.teams.find(t=>t.id===a.teamId);
            if(team && team.players) {
              const idx = team.players.findIndex(p=>namesLikelyMatch(p,c.current));
              if(idx>=0) { team.players[idx]=c.proposed; await updateDoc(doc(db,'teams',team.id), {players:team.players}); }
            }
          }
          a.name = c.proposed;
        }
      } else {
        await setDoc(doc(db,'pendingAthletes',c.id), {name:c.proposed}, {merge:true});
        const p = S.pendingAthletes.find(x=>x.id===c.id);
        if(p) {
          const team = S.teams.find(t=>t.id===p.teamId);
          if(team && team.players) {
            const idx = team.players.findIndex(pl=>namesLikelyMatch(pl,c.current));
            if(idx>=0) { team.players[idx]=c.proposed; await updateDoc(doc(db,'teams',team.id), {players:team.players}); }
          }
          p.name = c.proposed;
        }
      }
      fixedCount++;
    } catch(e) { /* seguimos con el resto aunque uno falle */ }
  }
  S._nameOrderChecked = null;
  showToast(`✓ ${fixedCount} nombre${fixedCount!==1?'s':''} actualizado${fixedCount!==1?'s':''}`);
  S.adminView = 'main';
  renderMain();
}
window.applyNameOrderReview = applyNameOrderReview;

function renderSettings() {
  const u = S.userData || {};
  const darkOn = getTheme()==='dark';
  const curAccent = getAccentColor();
  const curFont = getFontFamily();
  const curScale = getFontScale();
  return `
  <div class="card">
    <div class="admin-section-title" style="padding:12px 14px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Apariencia</div>
    <div class="settings-item">
      <div><div class="settings-lbl">Modo oscuro</div><div class="settings-sub">Ideal para entrenar de noche o con poca luz</div></div>
      <div class="theme-switch ${darkOn?'on':''}" onclick="toggleTheme()"><div class="theme-switch-knob"></div></div>
    </div>
    <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
      <div class="settings-lbl" style="margin-bottom:8px">Color de acento</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${ACCENT_COLORS.map(a=>`<div onclick="setAccentColor('${a.id}')" title="${a.label}" style="width:30px;height:30px;border-radius:50%;background:${a.c};cursor:pointer;border:2px solid ${curAccent===a.id?'var(--text)':'transparent'};box-shadow:0 0 0 1px var(--border2);transition:border-color .15s"></div>`).join('')}
      </div>
    </div>
    <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
      <div class="settings-lbl" style="margin-bottom:8px">Tipografía</div>
      <select class="abtn" style="width:100%;text-align:left" onchange="setFontFamily(this.value)">
        ${FONT_OPTIONS.map(f=>`<option value="${f.id}" ${curFont===f.id?'selected':''}>${f.label}</option>`).join('')}
      </select>
    </div>
    <div style="padding:14px 16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="settings-lbl">Tamaño de fuente</div>
        <span id="font-scale-val" style="font-size:12px;color:var(--text3);font-weight:600">${curScale}%</span>
      </div>
      <input type="range" min="90" max="130" step="5" value="${curScale}" style="width:100%;accent-color:var(--accent);cursor:pointer"
        oninput="document.getElementById('font-scale-val').textContent=this.value+'%';setFontScale(this.value)">
    </div>
  </div>
  <div class="card">
    <div class="admin-section-title" style="padding:12px 14px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Mi perfil</div>
    <div style="padding:16px;display:flex;align-items:center;gap:14px;${S.isAdmin?'':'border-bottom:1px solid var(--border)'}">
      <div style="position:relative;cursor:pointer;flex-shrink:0" onclick="document.getElementById('profile-photo-inp').click()">
        ${avatarHtml(u.name||S.user?.email, u.color, 64, u.photoUrl)}
        <div style="position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;border:2px solid var(--bg2)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </div>
      </div>
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.name||'—'}</div>
        <div style="font-size:12px;color:var(--text3)">Tocá la foto para cambiarla</div>
      </div>
      <input type="file" id="profile-photo-inp" accept="image/*" style="display:none" onchange="handleProfilePhotoUpload(this)">
    </div>
    ${S.isAdmin ? '' : `
    <div class="settings-item">
      <div class="settings-lbl">Nombre</div>
      <input class="abtn" style="text-align:right;flex:1;max-width:200px" value="${u.name||''}" onblur="saveMyProfileField('name',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
    </div>
    <div class="settings-item">
      <div class="settings-lbl">Edad</div>
      <input class="abtn" type="number" style="text-align:right;width:80px" value="${u.age||''}" onblur="saveMyProfileField('age',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
    </div>
    <div class="settings-item">
      <div class="settings-lbl">Altura (cm)</div>
      <input class="abtn" type="number" style="text-align:right;width:80px" value="${u.height||''}" onblur="saveMyProfileField('height',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
    </div>
    <div class="settings-item">
      <div class="settings-lbl">Peso (kg)</div>
      <input class="abtn" type="number" style="text-align:right;width:80px" value="${u.weight||''}" onblur="saveMyProfileField('weight',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
    </div>
    ${(()=>{
      if(u.athleteType!=='team') return '';
      const myTeam = u.teamId ? S.teams.find(t=>t.id===u.teamId) : null;
      const posOpts = getPositionOptionsForSport(myTeam?.sport||u.sport);
      return `<div class="settings-item">
        <div class="settings-lbl">Posición</div>
        ${posOpts
          ? `<select class="abtn" style="text-align:right" onchange="saveMyProfileField('position',this.value)">
              <option value="">— Sin posición —</option>
              ${posOpts.map(p=>`<option value="${p}" ${u.position===p?'selected':''}>${p}</option>`).join('')}
            </select>`
          : `<input class="abtn" style="text-align:right;flex:1;max-width:200px" value="${u.position||''}" placeholder="Ej: Base, Alero..." onblur="saveMyProfileField('position',this.value)" onkeydown="if(event.key==='Enter')this.blur()">`}
      </div>`;
    })()}`}
  </div>
  <div class="card">
    <div class="admin-section-title" style="padding:12px 14px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Notificaciones</div>
    <div class="settings-item">
      <div><div class="settings-lbl">Avisos en el celular</div><div class="settings-sub">${(()=>{
        if(typeof Notification==='undefined') return 'Tu navegador no soporta notificaciones.';
        if(u.pushSubscription) return 'Activadas — te van a llegar aunque no tengas la app abierta.';
        if(Notification.permission==='denied') return 'Bloqueadas en el navegador — activalas desde la configuración del sitio.';
        if(esIOS() && !esStandalone()) return 'En iPhone primero agregá G-Metrics a tu pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí.';
        return 'Recibí recordatorios de wellness/carga aunque no tengas la app abierta.';
      })()}</div></div>
      ${typeof Notification!=='undefined' ? `<button class="abtn ${u.pushSubscription?'':'abtn-p'}" onclick="${u.pushSubscription?'desactivarNotificacionesPush()':'activarNotificacionesPush()'}">${u.pushSubscription?'Desactivar':'Activar'}</button>` : ''}
    </div>
  </div>
  ${S.isAdmin ? '' : `<div class="card">
    <div class="admin-section-title" style="padding:12px 14px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Mis marcas (1RM)</div>
    <div style="padding:4px 14px 12px;font-size:11px;color:var(--text3)">Cargá tu máximo en cada levantamiento — la rutina va a calcular sola los kilos cuando el entrenador te prescriba un %RM.</div>
    ${RM_LIFTS.map(rm=>`<div class="settings-item">
      <div class="settings-lbl">${rm.label}</div>
      <input class="abtn" type="number" style="text-align:right;width:80px" value="${S.oneRM?.[rm.id]||''}" placeholder="kg" onblur="saveOneRM('${rm.id}',this.value)" onkeydown="if(event.key==='Enter')this.blur()">
    </div>`).join('')}
  </div>`}
  ${isTeamAthlete() ? '' : `<div class="card">
    <div class="admin-section-title" style="padding:12px 14px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em">Semana actual</div>
    <div class="settings-item">
      <div><div class="settings-lbl">Semana ${S.currentWeek}</div><div class="settings-sub">${weekLabel(S.currentWeek)}</div></div>
      <div style="display:flex;gap:6px">
        <button class="abtn" onclick="changeWeek(-1)">‹</button>
        <button class="abtn" onclick="changeWeek(1)">›</button>
      </div>
    </div>
    <div class="settings-item">
      <div><div class="settings-lbl">Fecha inicio</div></div>
      <input type="date" class="abtn" value="${S.startDate}" onchange="S.startDate=this.value;S.currentWeek=computeWeekFromDate(S.startDate);scheduleSave();renderMain()" style="cursor:pointer">
    </div>
  </div>`}
  <div class="card">
    <div class="settings-item">
      <div><div class="settings-lbl">Actualizar app</div><div class="settings-sub">Bajá la última versión ahora mismo (por si el celular guardó una copia vieja)</div></div>
      <button class="abtn abtn-p" onclick="forceAppUpdate()">↻ Actualizar</button>
    </div>
  </div>
  <div class="card">
    <div class="settings-item">
      <div><div class="settings-lbl">Exportar datos</div><div class="settings-sub">Descargá una copia local</div></div>
      <button class="abtn" onclick="exportData()">Exportar</button>
    </div>
  </div>
  <div class="card">
    <div class="settings-item" style="border-bottom:none">
      <div><div class="settings-lbl" style="color:var(--red)">Cerrar sesión</div><div class="settings-sub">Volvés a la pantalla de inicio de sesión</div></div>
      <button class="abtn abtn-d" onclick="signOut()">Cerrar sesión</button>
    </div>
  </div>
  <div class="card">
    <div class="settings-item" style="border-bottom:none">
      <div><div class="settings-lbl" style="color:var(--red)">Eliminar mi cuenta</div><div class="settings-sub">Borra tu cuenta y todos tus datos definitivamente — el mail queda libre para registrarse de nuevo</div></div>
      <button class="abtn abtn-d" onclick="deleteMyAccount()">Eliminar cuenta</button>
    </div>
  </div>
  <div style="text-align:center;padding:20px;font-size:11px;color:var(--text3)">
    G-Metrics Performance Lab · ${S.userData?.name||''} · ${S.isAdmin?'Admin':'Atleta'}
  </div>`;
}

// Elimina la cuenta propia por completo: datos de Firestore + la cuenta real
// de Firebase (esto sí libera el mail para un registro nuevo). Solo la puede
// hacer la persona misma, logueada — es la única forma real de "borrar el
// mail", Firebase no permite que un admin borre la cuenta de otro.
async function deleteMyAccount() {
  if(S.isAdmin) {
    alert('Por seguridad, la cuenta de administrador no se puede eliminar desde acá. Si necesitás cambiarla, avisale a quien armó la app.');
    return;
  }
  if(!confirm('¿Eliminar tu cuenta definitivamente? Se borran todos tus datos (wellness, tests, rutina) y tu mail queda libre para registrarte de nuevo si hace falta. Esto NO se puede deshacer.')) return;
  if(!confirm('Confirmá una vez más: esto borra tu cuenta para siempre. ¿Seguro?')) return;

  const uid = S.user.uid;
  showToast('Eliminando cuenta…');

  const wipeFirestoreAndAuth = async () => {
    try {
      // Sacarlo del roster de su equipo, si tiene
      if(S.userData?.teamId) {
        const tSnap = await getDoc(doc(db,'teams',S.userData.teamId));
        if(tSnap.exists()) {
          const team = tSnap.data();
          const memberUids = (team.memberUids||[]).filter(id=>id!==uid);
          const players = (team.players||[]).filter(p=>!namesLikelyMatch(p,S.userData.name));
          await updateDoc(doc(db,'teams',S.userData.teamId), {memberUids, players});
        }
      }
      await deleteDoc(doc(db,'users',uid)).catch(()=>{});
      await deleteDoc(doc(db,'personal',uid)).catch(()=>{});
      await deleteUser(auth.currentUser);
      showToast('✓ Cuenta eliminada');
    } catch(e) {
      if(e.code==='auth/requires-recent-login') {
        const pass = prompt('Por seguridad, Firebase te pide confirmar tu contraseña antes de eliminar la cuenta:');
        if(!pass) { showToast('Cancelado'); return; }
        try {
          const cred = EmailAuthProvider.credential(S.user.email, pass);
          await reauthenticateWithCredential(auth.currentUser, cred);
          await wipeFirestoreAndAuth();
        } catch(e2) { showToast('Contraseña incorrecta o error al reautenticar'); }
      } else {
        showToast('Error al eliminar la cuenta');
      }
    }
  };
  await wipeFirestoreAndAuth();
}
window.deleteMyAccount = deleteMyAccount;

async function saveOneRM(liftId, value) {
  const val = value===''?null:Math.max(0,+value);
  if(!S.oneRM) S.oneRM={};
  S.oneRM[liftId]=val;
  try {
    await updateDocSafe(doc(db,'personal',S.user.uid), {[`oneRM.${liftId}`]:val});
    showToast('✓ Marca guardada');
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.saveOneRM = saveOneRM;

async function saveMyProfileField(field, value) {
  if(field==='name' && !value.trim()) { showToast('El nombre no puede quedar vacío'); renderMain(); return; }
  const numeric = ['age','height','weight'].includes(field);
  const val = numeric ? (value===''?'':+value) : value.trim();
  if(!S.userData) S.userData={};
  S.userData[field]=val;
  try {
    await setDoc(doc(db,'users',S.user.uid), {[field]:val}, {merge:true});
    showToast('✓ Guardado');
    if(field==='name') updateTopbarAvatar();
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.saveMyProfileField=saveMyProfileField;

function handleProfilePhotoUpload(input) {
  const file = input.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')) { showToast('Elegí un archivo de imagen'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = async () => {
      const size = 200;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width-minSide)/2, sy = (img.height-minSide)/2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      if(dataUrl.length > 700000) { showToast('La imagen es muy pesada, probá con otra'); return; }
      if(!S.userData) S.userData={};
      S.userData.photoUrl = dataUrl;
      try {
        await setDoc(doc(db,'users',S.user.uid), {photoUrl:dataUrl}, {merge:true});
        showToast('✓ Foto actualizada');
        updateTopbarAvatar();
        renderMain();
      } catch(e) { showToast('Error al guardar la foto'); }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
window.handleProfilePhotoUpload=handleProfilePhotoUpload;

// Escudo del rival en un evento de Partido — mismo criterio que la foto de
// perfil (achicar a un cuadrado chico y guardar como dataURL, sin usar
// Storage aparte) pero todavía más chico porque es solo un ícono.
function handleCrestUpload(input, teamId, dateStr, idx) {
  const file = input.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')) { showToast('Elegí un archivo de imagen'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const size = 80;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(img.width, img.height);
      const sx = (img.width-minSide)/2, sy = (img.height-minSide)/2;
      ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/png', 0.85);
      if(dataUrl.length > 300000) { showToast('La imagen es muy pesada, probá con otra'); return; }
      // Local nomás, como el resto del día — se manda a Firestore recién con
      // "Guardar cambios de este día".
      setCalendarEventField(teamId, dateStr, idx, 'crestUrl', dataUrl);
      showToast('Escudo listo — no te olvides de tocar "Guardar cambios de este día"');
      renderMain();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
window.handleCrestUpload = handleCrestUpload;

function changeWeek(d) {
  const start = new Date(S.startDate+'T00:00:00');
  start.setDate(start.getDate() - d*7);
  S.startDate = toLocalDateStr(start);
  S.currentWeek = computeWeekFromDate(S.startDate);
  scheduleSave();
  renderAll();
}
window.changeWeek=changeWeek;

function exportData() {
  const blob=new Blob([JSON.stringify({blocks:S.blocks,history:S.history,wellness:S.wellness,injuries:S.injuries},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`training-backup-${todayLocal()}.json`; a.click();
  showToast('Datos exportados');
}
window.exportData=exportData;

// ── ADMIN PANEL ───────────────────────────────────────────────
// ── ADMIN PANEL ───────────────────────────────────────────────
// Ver cómo respondió un atleta puntualmente un día de wellness — para
// entender SI un % bajo fue por sueño, estrés, dolor muscular, etc., no solo
// el número final.
function viewWellnessDay(uid, date) {
  S.wellnessDetailUid = uid;
  S.wellnessDetailDate = date;
  S._wellnessDetailReturnView = S.adminView;
  S.adminView = 'wellness_detail';
  renderMain();
}
window.viewWellnessDay=viewWellnessDay;

function shiftWellnessDetailDate(delta) {
  const d = new Date(S.wellnessDetailDate+'T00:00:00');
  d.setDate(d.getDate()+delta);
  const today = new Date(); today.setHours(0,0,0,0);
  if(d>today) return; // no tiene sentido navegar a futuro
  S.wellnessDetailDate = toLocalDateStr(d);
  renderMain();
}
window.shiftWellnessDetailDate = shiftWellnessDetailDate;

function renderWellnessDetail() {
  const uid = S.wellnessDetailUid, date = S.wellnessDetailDate;
  // OJO: priorizamos S.viewingAthlete porque SIEMPRE trae el documento
  // personal completo (se carga entero al abrir la ficha) — S.adminAthletes
  // y S.dashAthletes son listas livianas que muchas veces NO tienen el
  // historial de wellness cargado, y por eso a veces parecía que un día que
  // sí estaba completo "no tenía datos".
  const a = (S.viewingAthlete?.uid===uid ? {name:S.viewingAthlete.userData?.name, email:S.viewingAthlete.userData?.email, _personal:S.viewingAthlete.personal} : null)
    || (S.adminAthletes||[]).find(x=>x.uid===uid)
    || (S.dashAthletes||[]).find(x=>x.uid===uid);
  if(!a) return `<div class="empty-state">Atleta no encontrado.</div>`;

  const w = a._personal?.wellness?.[date] || {};
  const {pct, allFilled} = getWellnessScore(w);
  const state = getWellnessState(allFilled?pct:null);
  const dateLabel = new Date(date+'T00:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  const isToday = date===todayLocal();

  let html = `<div class="team-detail-header">
    <button class="back-btn" onclick="S.adminView='${S._wellnessDetailReturnView||'athlete_detail'}';renderMain()">‹</button>
    <div class="team-detail-title">Wellness · ${a.name||a.email}</div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <button class="abtn" onclick="shiftWellnessDetailDate(-1)">‹ Día anterior</button>
    <div style="font-size:13px;color:var(--text3);text-transform:capitalize">${dateLabel}</div>
    <button class="abtn" style="${isToday?'opacity:.3;pointer-events:none':''}" onclick="shiftWellnessDetailDate(1)">Día siguiente ›</button>
  </div>
  <div class="hooper-score-box">
    <div>
      <div class="hooper-score-val" style="color:${state.color}">${allFilled?pct+'%':'—'}</div>
    </div>
    <div class="hooper-score-label" style="color:${state.color};font-weight:700">${allFilled?state.label:'Registro incompleto'}</div>
  </div>`;

  if(!Object.keys(w).length) {
    html += `<div class="empty-state">Sin datos de wellness cargados este día.</div>`;
  } else {
  // Antes cada ítem era una línea de texto con un emoji al lado — había que
  // reconocer el emoji para entender si algo estaba bien o mal. Ahora cada
  // ítem es un recuadro con SU PROPIO color de fondo (rojo→ámbar→azul→
  // teal→verde según la escala 1-5, sin emojis) — se lee de un vistazo por
  // el color solo, sin adivinar nada.
  html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">`;
  WELLNESS_ITEMS.forEach(item=>{
    const val = w[item.key];
    const opt = item.options.find(o=>o.v===val);
    const c = wellnessValColor(val);
    html += `<div style="background:${c?c.dim:'var(--bg3)'};border-radius:var(--rsm);padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px">
      <span style="font-size:12.5px;font-weight:600;color:var(--text2)">${item.label}</span>
      <span style="font-size:14px;font-weight:800;color:${c?c.solid:'var(--text3)'}">${opt?opt.label:'— sin dato'}</span>
    </div>`;
  });
  const hours = w.sueño_horas;
  const cat = (hours!==undefined && hours!==null && hours!=='') ? sleepHoursCategory(hours) : null;
  // sleepHoursCategory() da "var(--red)" etc. (no un hex), así que el fondo
  // tenue se arma con el mismo patrón --X → --X-dim que usa el resto de la
  // app, no pegándole un sufijo de alpha a un var() (eso no es CSS válido).
  const catDim = cat ? cat.color.replace(')', '-dim)') : 'var(--bg3)';
  html += `<div style="background:${catDim};border-radius:var(--rsm);padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px">
    <span style="font-size:12.5px;font-weight:600;color:var(--text2)">Horas de sueño</span>
    <span style="font-size:14px;font-weight:800;color:${cat?cat.color:'var(--text3)'}">${cat?hours+'h · '+cat.label:'— sin dato'}</span>
  </div>
  </div>`;
  }

  // Carga del día: Gimnasio / Pelota / Partido — para ver si un wellness bajo
  // coincide con un día de mucho volumen o RPE alto.
  const logs = (a._personal?.history?._sessionLogs || a._personal?.sessionLogs || []).filter(l=>l.date===date);
  html += `<div class="admin-section">
    <div class="admin-section-title">Carga de ese día</div>
    ${logs.length ? logs.map(l=>{
      const act = LOAD_ACTIVITIES.find(x=>x.key===l.activity);
      const display = act ? getLoadActivityDisplay(act, a.sport) : null;
      return `<div class="admin-item" style="flex-direction:column;align-items:flex-start;gap:4px">
        <div style="display:flex;justify-content:space-between;width:100%">
          <span style="font-size:13px;font-weight:600">${display?display.emoji+' '+display.label:l.activity}</span>
          <span style="font-size:13px;font-weight:700;color:var(--accent-text)">${l.ua} UA</span>
        </div>
        <div style="font-size:12px;color:var(--text3)">${l.mins} min · RPE ${l.rpe}${l.note?' · '+l.note:''}</div>
      </div>`;
    }).join('') : `<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin carga registrada este día.</div>`}
  </div>`;

  // Caso típico: alguien carga la sesión de ayer pasados unos minutos de la
  // medianoche y le queda fechada "hoy" — no es un bug (a esa hora ya es
  // técnicamente el día siguiente), pero conviene poder corregirlo a mano.
  if(Object.keys(w).length || logs.length) {
    const prevDay = (()=>{ const d=new Date(date+'T00:00:00'); d.setDate(d.getDate()-1); return toLocalDateStr(d); })();
    html += `<div class="admin-section">
      <div class="admin-section-title">¿Se equivocaron de día?</div>
      <div style="padding:12px 16px">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Mueve el wellness y la carga de este día a otra fecha — típico caso: cargaron la sesión de ayer recién pasada la medianoche.</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input type="date" id="move-wellness-date-inp" class="abtn" value="${prevDay}">
          <button class="abtn abtn-d" onclick="moveWellnessDayData('${uid}','${date}',document.getElementById('move-wellness-date-inp').value)">Mover a esa fecha</button>
        </div>
      </div>
    </div>`;
  }
  return html;
}
window.renderWellnessDetail=renderWellnessDetail;

async function moveWellnessDayData(uid, oldDate, newDate) {
  if(!newDate) { showToast('Elegí una fecha'); return; }
  if(newDate===oldDate) { showToast('Es la misma fecha'); return; }
  const personal = getPersonalOwner(uid);
  if(!personal) { showToast('No se encontró el registro del atleta'); return; }

  // Todo el chequeo Y el movimiento se hacen sobre una lectura FRESCA del
  // servidor, nunca sobre "personal" (la caché del admin, que se trae una
  // sola vez por sesión y puede tener horas de vieja). Antes solo la carga
  // se releía fresca y el wellness seguía usando la copia vieja — eso podía
  // hacer que el wellness "movido" en realidad pisara con un valor
  // desactualizado, o que un día que en el servidor ya no tenía nada (el
  // atleta lo había corregido él mismo, o un movimiento previo ya lo había
  // vaciado) se detectara como "hay datos" por la caché y confundiera todo.
  let fresh;
  try {
    const snap = await getDoc(doc(db,'personal',uid));
    fresh = snap.exists() ? snap.data() : {};
  } catch(e) { showToast('Error al leer el registro: '+e.message); return; }
  const freshWellness = fresh.wellness || {};
  const freshLogsAll = fresh.history?._sessionLogs || fresh.sessionLogs || [];
  const hasWellness = !!freshWellness[oldDate];
  const hasLogs = freshLogsAll.some(l=>l.date===oldDate);
  if(!hasWellness && !hasLogs) { showToast('No hay datos ese día para mover (revisá si ya se movieron antes)'); return; }
  const collision = !!(freshWellness[newDate] || freshLogsAll.some(l=>l.date===newDate));
  if(!confirm(`¿Mover el wellness y la carga del ${oldDate} al ${newDate}?`+(collision?' Ojo: ya hay datos cargados ese día — se pueden mezclar.':''))) return;

  const fsUpdate = {};
  if(hasWellness) {
    fsUpdate[`wellness.${newDate}`] = freshWellness[oldDate];
    fsUpdate[`wellness.${oldDate}`] = deleteField();
  }
  let freshLogs = null;
  if(hasLogs) {
    freshLogs = freshLogsAll.map(l => l.date===oldDate ? {...l, date:newDate} : l);
    fsUpdate['history._sessionLogs'] = freshLogs;
    fsUpdate['sessionLogs'] = freshLogs;
  }
  try {
    await updateDocSafe(doc(db,'personal',uid), fsUpdate);
    if(!personal.wellness) personal.wellness = {};
    if(hasWellness) {
      personal.wellness[newDate] = freshWellness[oldDate];
      delete personal.wellness[oldDate];
    }
    if(freshLogs) {
      if(!personal.history) personal.history = {};
      personal.history._sessionLogs = freshLogs;
    }
    showToast('✓ Movido al '+newDate);
    S.wellnessDetailDate = newDate;
    renderMain();
  } catch(e) { showToast('Error al mover: '+e.message); }
}
window.moveWellnessDayData = moveWellnessDayData;


// ── RECORDATORIOS: quién falta completar wellness/carga hoy ─────────────
function openReminderScreen() {
  S.adminView = 'reminders';
  S.currentView = 'admin';
  renderBottomBar();
  renderMain();
}
window.openReminderScreen = openReminderScreen;

// La tarjeta "N atletas" del dashboard no navega a otra pantalla — la lista
// ya está más abajo, en la misma vista — solo hace scroll hasta ahí.
function scrollToDashAthleteList() {
  const el = document.getElementById('dash-team-filters');
  if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
}
window.scrollToDashAthleteList = scrollToDashAthleteList;

function openTrainedTodayScreen() {
  S.adminView = 'trained_today';
  S.currentView = 'admin';
  renderBottomBar();
  renderMain();
}
window.openTrainedTodayScreen = openTrainedTodayScreen;

// Mismo criterio que "Wellness hoy" (renderReminderScreen) pero para carga:
// quién entrenó hoy, con qué duración/RPE por actividad, y si de paso marcó
// alguna molestia o lesión en el mapa corporal ese mismo día.
function renderTrainedTodayScreen() {
  const today = todayLocal();
  const athletes = S.dashAthletes || [];
  const rows = [];
  athletes.forEach(a=>{
    const logs = (a._personal?.history?._sessionLogs||[]).filter(l=>l.date===today);
    if(!logs.length) return;
    const injuries = a._personal?.injuries || {};
    const markedToday = Object.values(injuries).some(inj=>(inj.history||[]).some(h=>h.date===today));
    rows.push({a, logs, markedToday});
  });
  rows.sort((x,y)=>(x.a.name||x.a.email||'').localeCompare(y.a.name||y.a.email||''));

  return `<div class="team-detail-header">
    <button class="back-btn" data-back="admin-main">‹</button>
    <div class="team-detail-title">Entrenaron hoy</div>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">${rows.length} de ${athletes.length} atletas · ${today}</div>
    ${rows.length ? rows.map(({a,logs,markedToday})=>`
      <div class="admin-item" style="cursor:pointer;flex-direction:column;align-items:stretch;gap:6px" onclick="adminOpenAthleteDash('${a.uid}')">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div class="admin-item-lbl">${a.name||a.email}</div>
          ${markedToday?`<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:var(--red-dim);color:var(--red);font-weight:700;white-space:nowrap">⚠ molestia/lesión</span>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${logs.map(l=>`<span style="font-size:11px;padding:3px 9px;border-radius:20px;background:var(--bg3);color:var(--text2);white-space:nowrap">${l.session||l.activity} · ${l.mins}min · RPE ${l.rpe}</span>`).join('')}
        </div>
      </div>`).join('') : `<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Todavía nadie entrenó hoy.</div>`}
  </div>`;
}
window.renderTrainedTodayScreen = renderTrainedTodayScreen;

// Mecanismo genérico para ocultar/mostrar cualquier lista de la app —
// reutilizable en cualquier sección (Atención requerida, lesiones del
// plantel, etc.), sin guardar nada en Firestore (es solo preferencia visual
// de la sesión actual).
function toggleSection(key) {
  if(!S.collapsedSections) S.collapsedSections = new Set();
  if(S.collapsedSections.has(key)) S.collapsedSections.delete(key);
  else S.collapsedSections.add(key);
  renderMain();
}
window.toggleSection = toggleSection;

function renderReminderScreen() {
  const today = todayLocal();
  const athletes = S.dashAthletes || [];
  const pending = [];
  const done = [];
  athletes.forEach(a=>{
    const w = a._personal?.wellness?.[today];
    const {allFilled} = getWellnessScore(w);
    const logs = (a._personal?.history?._sessionLogs || a._personal?.sessionLogs || []).filter(l=>l.date===today);
    const hasLoad = logs.length>0;
    if(allFilled && hasLoad) done.push(a);
    else pending.push({a, wellnessOk:allFilled, loadOk:hasLoad});
  });

  const names = pending.map(p=>'• '+(p.a.name||p.a.email)).join('\n');
  const msg = `Recordatorio de G-Metrics: todavía no completaste el wellness y/o la carga de hoy (${today}). Por favor cargalo en la app apenas puedas. Gracias!`;
  S._reminderPendingUids = pending.map(p=>p.a.uid);

  let html = `<div class="team-detail-header">
    <button class="back-btn" data-back="admin-main">‹</button>
    <div class="team-detail-title">Recordatorios de hoy</div>
  </div>
  <div style="font-size:12px;color:var(--text3);margin-bottom:16px">
    El recordatorio se manda DENTRO de la app — les va a aparecer en su campanita de notificaciones la próxima vez que entren.
  </div>
  <div class="admin-section">
    <div class="admin-section-title" style="color:var(--amber)">⚠ Faltan ${pending.length} de ${athletes.length}</div>
    ${pending.length?pending.map(p=>`<div class="admin-item" style="cursor:pointer" onclick="adminOpenAthleteDash('${p.a.uid}')">
      <div class="admin-item-lbl">${p.a.name||p.a.email}</div>
      <div style="font-size:11px;color:var(--text3);display:flex;gap:8px">
        <span style="color:${p.wellnessOk?'var(--green)':'var(--amber)'}">${p.wellnessOk?'✓':'✗'} wellness</span>
        <span style="color:${p.loadOk?'var(--green)':'var(--amber)'}">${p.loadOk?'✓':'✗'} carga</span>
      </div>
    </div>`).join(''):`<div style="padding:12px 16px;font-size:13px;color:var(--green)">✓ Completaron todos.</div>`}
  </div>
  ${pending.length?`<div class="wellness-card">
    <div class="wellness-title">Mensaje de recordatorio</div>
    <div style="padding:14px 16px">
      <textarea id="reminder-msg-txt" style="width:100%;min-height:90px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:10px;color:var(--text);font-size:13px;outline:none;font-family:inherit;resize:vertical">${msg}</textarea>
      <div style="font-size:11px;color:var(--text3);margin:8px 0">Se les manda a estos ${pending.length}:\n${names}</div>
      <button class="wellness-submit" onclick="sendInAppReminder()">Enviar recordatorio en la app (${pending.length})</button>
    </div>
  </div>`:''}
  <div class="admin-section" style="margin-top:12px">
    <div class="admin-section-title" style="color:var(--green)">✓ Completaron todo (${done.length})</div>
    ${done.length?done.map(a=>`<div class="admin-item" style="cursor:pointer" onclick="adminOpenAthleteDash('${a.uid}')"><div class="admin-item-lbl">${a.name||a.email}</div></div>`).join(''):`<div style="padding:12px 16px;font-size:13px;color:var(--text3)">Nadie completó todo todavía.</div>`}
  </div>`;
  return html;
}
window.renderReminderScreen = renderReminderScreen;

async function sendInAppReminder() {
  const txt = document.getElementById('reminder-msg-txt');
  const msg = txt ? txt.value.trim() : '';
  if(!msg) { showToast('Escribí un mensaje'); return; }
  const pendingUids = S._reminderPendingUids || [];
  if(!pendingUids.length) { showToast('No hay nadie pendiente'); return; }
  const today = todayLocal();
  showToast('Enviando…');
  let sentCount = 0;
  for(const uid of pendingUids) {
    try {
      const ref = doc(db,'personal',uid);
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().notifications||[]) : [];
      existing.push({message:msg, date:today, read:false});
      await setDoc(ref, {notifications:existing}, {merge:true});
      sentCount++;
    } catch(e) {}
  }
  const pushResult = await sendPushToUids(pendingUids, {title:'G-Metrics · Recordatorio', body:msg});
  showToast(`✓ Enviado a ${sentCount} atleta${sentCount!==1?'s':''}${pushResult.sent?` (${pushResult.sent} con notificación push)`:''}`);
}
window.sendInAppReminder = sendInAppReminder;

function renderAdmin() {
  switch(S.adminView) {
    case 'athletes':       return renderAdminAthletes();
    case 'athlete_detail': return S.atletaView ? renderAtletaDetail(S.atletaView) : `<div class="empty-state">Error cargando perfil.</div>`;
    case 'routines':       return renderAdminRoutines();
    case 'routine_edit':   return renderRoutineEditor();
    case 'compare_athletes': return renderCompareAthletes();
    case 'wellness_detail': return renderWellnessDetail();
    case 'reminders': return renderReminderScreen();
    case 'trained_today': return renderTrainedTodayScreen();
    case 'injury_classify': return renderInjuryClassifyScreen();
    case 'name_order_review': return renderNameOrderReview();
    default:               return renderAdminMain();
  }
}

function renderAdminMain() {
  return `
  <div style="font-size:16px;font-weight:700;margin-bottom:14px">Panel admin</div>
  <div class="admin-section">
    <div class="admin-section-title">Alumnos</div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Ver alumnos</div><div class="admin-item-sub">Historial, wellness, molestias y asignación de rutinas</div></div>
      <button class="abtn abtn-p" onclick="adminGoAthletes()">Ver →</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Comparar atletas</div><div class="admin-item-sub">Wellness, ACWR, saltos y fuerza lado a lado</div></div>
      <button class="abtn abtn-p" onclick="adminGoCompare()">Comparar →</button>
    </div>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">Rutinas</div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Gestionar rutinas</div><div class="admin-item-sub">${S.routines.length} rutina${S.routines.length!==1?'s':''} creada${S.routines.length!==1?'s':''}</div></div>
      <button class="abtn abtn-p" onclick="adminGoRoutines()">Gestionar →</button>
    </div>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">Sistema</div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Equipos</div><div class="admin-item-sub">${S.teams.length} equipo${S.teams.length!==1?'s':''}</div></div>
      <button class="abtn abtn-p" onclick="switchView('teams')">Ver →</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Biblioteca de ejercicios</div><div class="admin-item-sub">${S.library.length} ejercicios guardados</div></div>
      <button class="abtn abtn-p" onclick="switchView('library')">Gestionar →</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Limpiar categorías viejas de la Biblioteca</div><div class="admin-item-sub">Saca de todos los ejercicios cualquier categoría que no sea de la lista nueva (17 principales + sus sub-categorías)</div></div>
      <button class="abtn" onclick="cleanUnrecognizedLibraryTags()">Limpiar</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Corregir mayúsculas de nombres</div><div class="admin-item-sub">Pasa "GANORA gonzalo" → "Ganora Gonzalo" para todos los atletas de una</div></div>
      <button class="abtn" onclick="fixAllNameCapitalization()">Corregir</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Ordenar nombres (Apellido, Nombre)</div><div class="admin-item-sub">Te muestra una vista previa para revisar antes de aplicar — no hay forma de saber cuáles ya están bien</div></div>
      <button class="abtn" onclick="openNameOrderReview()">Revisar</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Importar fixture Estudiantes (Clausura)</div><div class="admin-item-sub">Carga los partidos que quedan en Liga de Honor, Cadetes, Juveniles y Juniors — no duplica si se corre de nuevo</div></div>
      <button class="abtn" onclick="importEstudiantesFixtures()">Importar</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Completar calendario semanal (Handball-EDLP)</div><div class="admin-item-sub">Carga Físico y Pelota todos los lunes, martes y jueves desde hoy hasta el 30/11, en Liga de Honor, Cadetes, Juveniles y Juniors — no duplica si se corre de nuevo, y no toca lo que ya esté cargado</div></div>
      <button class="abtn" onclick="fillWeeklyTrainingCalendar()">Completar</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Reparar vínculos de equipo</div><div class="admin-item-sub">Si un atleta registrado no aparece en las Evaluaciones/Wellness de su equipo (aunque sí en su ficha individual), esto lo arregla</div></div>
      <button class="abtn" onclick="repairTeamMemberLinks()">Reparar</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Clasificar molestias/lesiones</div><div class="admin-item-sub">Decidí de una cuáles dolores marcados son lesión real y cuáles son molestia</div></div>
      <button class="abtn" onclick="openInjuryClassifyScreen()">Revisar</button>
    </div>
  </div>
  <div class="admin-section" style="border-color:rgba(195,58,44,0.3)">
    <div class="admin-item" style="border-bottom:none">
      <div><div class="admin-item-lbl" style="color:var(--red)">Cerrar sesión</div><div class="admin-item-sub">Volvés a la pantalla de inicio de sesión</div></div>
      <button class="abtn abtn-d" onclick="signOut()">Cerrar sesión</button>
    </div>
  </div>`;
}

function resetBlocks() {
  if(!confirm('¿Restaurar bloques por defecto?')) return;
  S.blocks=JSON.parse(JSON.stringify(DEFAULT_BLOCKS));
  scheduleSave(); renderMain(); showToast('Bloques restaurados');
}
window.resetBlocks=resetBlocks;

// ── ADMIN: ATHLETES ───────────────────────────────────────────
async function adminGoAthletes() {
  S.adminView='athletes';
  S.currentView='admin';
  document.getElementById('main').innerHTML=`<div style="text-align:center;padding:40px;color:var(--text3)">Cargando alumnos…</div>`;
  try {
    const snap = await getDocs(collection(db,'users'));
    S.adminAthletes = snap.docs.map(d=>({uid:d.id,...d.data()}))
      .filter(u=>u.email !== ADMIN_EMAIL);
  } catch(e) { S.adminAthletes=[]; }
  renderBottomBar();
  renderMain();
}
window.adminGoAthletes=adminGoAthletes;

function renderAdminAthletes() {
  let html=`<div class="team-detail-header">
    <button class="back-btn" data-back="admin-main">‹</button>
    <div class="team-detail-title">Atletas</div>
  </div>`;
  if(!S.adminAthletes.length) {
    html+=`<div class="empty-state">No hay atletas registrados aún.</div>`;
    return html;
  }
  html += `<div style="margin-bottom:14px">
    <input id="athletes-search-inp" value="${S._athletesSearch||''}" placeholder="Buscar atleta..."
      style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rsm);padding:9px 13px;color:var(--text);font-size:14px;outline:none;font-family:inherit"
      oninput="setAthletesSearch(this.value)">
  </div>
  <div id="athletes-list-body">${renderAthletesListBody()}</div>`;
  return html;
}
window.renderAdminAthletes=renderAdminAthletes;

// Separado del shell para poder refrescar solo esto al buscar, sin perder el foco del input.
function renderAthletesListBody() {
  const search=(S._athletesSearch||'').toLowerCase();
  let list=S.adminAthletes;
  if(search) list=list.filter(a=>(a.name||a.email||'').toLowerCase().includes(search));
  if(!list.length) return `<div class="empty-state" style="padding:24px">Sin atletas que coincidan.</div>`;
  return `<div class="wellness-card" style="padding:0">
    ${list.map(a=>{
      const assigned = S.routines.find(r=>r.id===a.assignedRoutine);
      const myTeam = a.teamId ? S.teams.find(t=>t.id===a.teamId) : null;
      const statusLbl = assigned ? '✓ Personalizada' : myTeam ? '↳ Del equipo' : 'Sin rutina';
      const statusColor = assigned ? 'var(--green)' : myTeam ? 'var(--accent)' : 'var(--amber)';
      return `<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onclick="adminOpenAthlete('${a.uid}')" onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background=''">
        ${avatarHtml(a.name||a.email, a.color, 32, a.photoUrl)}
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name||a.email}</div>
          <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${myTeam?myTeam.name+(myTeam.category?' · '+myTeam.category:''):'Individual'}${a.position?' · '+a.position:''}${hasPlayedTwoGamesThisWeek(a._personal)?' · <span style="color:var(--amber);font-weight:700">2x esta semana</span>':''}</div>
        </div>
        <span style="font-size:11px;color:${statusColor};flex-shrink:0;white-space:nowrap">${statusLbl}</span>
        <span style="color:var(--text3);font-size:18px;flex-shrink:0">›</span>
      </div>`;
    }).join('')}
  </div>`;
}
window.renderAthletesListBody=renderAthletesListBody;

function setAthletesSearch(v) {
  S._athletesSearch=v;
  const el=document.getElementById('athletes-list-body');
  if(el) el.innerHTML=renderAthletesListBody();
}
window.setAthletesSearch=setAthletesSearch;

// ── COMPARAR ATLETAS ────────────────────────────────────────
async function adminGoCompare() {
  S.adminView='compare_athletes';
  S.currentView='admin';
  document.getElementById('main').innerHTML=`<div style="text-align:center;padding:40px;color:var(--text3)">Cargando atletas…</div>`;
  await ensureAdminAthletes();
  renderBottomBar();
  renderMain();
}
window.adminGoCompare=adminGoCompare;

async function setCompareAthlete(slot,uid) {
  if(slot==='A') S.compareA = uid||null; else S.compareB = uid||null;
  if(uid) await ensureGroupPersonalData([uid]);
  renderMain();
}
window.setCompareAthlete=setCompareAthlete;

function renderCompareAthletes() {
  const athletes = S.adminAthletes||[];
  const optsHtml = sel => `<option value="">— Elegir atleta —</option>` + athletes.map(a=>`<option value="${a.uid}" ${sel===a.uid?'selected':''}>${a.name||a.email}</option>`).join('');

  let html = `<div class="team-detail-header">
    <button class="back-btn" data-back="admin-main">‹</button>
    <div class="team-detail-title">Comparar atletas</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
    <select class="eval-inp" onchange="setCompareAthlete('A',this.value)">${optsHtml(S.compareA)}</select>
    <select class="eval-inp" onchange="setCompareAthlete('B',this.value)">${optsHtml(S.compareB)}</select>
  </div>`;

  if(!S.compareA || !S.compareB) return html+`<div class="empty-state">Elegí dos atletas para ver sus números lado a lado.</div>`;
  if(S.compareA===S.compareB) return html+`<div class="empty-state">Elegí dos atletas distintos.</div>`;

  const a=athletes.find(x=>x.uid===S.compareA), b=athletes.find(x=>x.uid===S.compareB);
  if(!a||!b) return html;

  const sumA=computeAthleteLoadSummary(a), sumB=computeAthleteLoadSummary(b);
  const wA=getWellnessState(sumA.avgWellness), wB=getWellnessState(sumB.avgWellness);
  const acwrA=getACWRStatus(sumA.acwr), acwrB=getACWRStatus(sumB.acwr);
  const monA=getMonotonyStatus(sumA.monotony), monB=getMonotonyStatus(sumB.monotony);
  const evalsA=a._personal?.evals||{}, evalsB=b._personal?.evals||{};
  const bestOf=(edata,id)=>{ const r=edata?.[id]||[]; return r.length?Math.max(...r.map(x=>x.height)):null; };

  const rows=[
    {label:'Wellness semanal', va:sumA.avgWellness!=null?sumA.avgWellness+'%':'—', vb:sumB.avgWellness!=null?sumB.avgWellness+'%':'—', ca:wA.color, cb:wB.color},
    {label:'ACWR', va:sumA.acwr!=null?sumA.acwr.toFixed(2):'—', vb:sumB.acwr!=null?sumB.acwr.toFixed(2):'—', ca:acwrA.color, cb:acwrB.color},
    {label:'Monotonía', va:sumA.monotony!=null?sumA.monotony.toFixed(1):'—', vb:sumB.monotony!=null?sumB.monotony.toFixed(1):'—', ca:monA.color, cb:monB.color},
    {label:'Carga semana (UA)', va:sumA.acuteUA!=null?Math.round(sumA.acuteUA):'—', vb:sumB.acuteUA!=null?Math.round(sumB.acuteUA):'—'},
    {label:'Mejor CMJ (cm)', va:bestOf(evalsA,'cmj')??'—', vb:bestOf(evalsB,'cmj')??'—'},
    {label:'Press de banca (kg)', va:bestOf(evalsA,'rm_press_banca')??'—', vb:bestOf(evalsB,'rm_press_banca')??'—'},
    {label:'Peso muerto (kg)', va:bestOf(evalsA,'rm_peso_muerto')??'—', vb:bestOf(evalsB,'rm_peso_muerto')??'—'},
    {label:'Sentadilla (kg)', va:bestOf(evalsA,'rm_sentadilla')??'—', vb:bestOf(evalsB,'rm_sentadilla')??'—'},
    {label:'Cargada de potencia (kg)', va:bestOf(evalsA,'rm_cargada_potencia')??'—', vb:bestOf(evalsB,'rm_cargada_potencia')??'—'},
  ];

  html += `<div class="admin-section">
    <div style="display:grid;grid-template-columns:1fr 1fr;padding:12px 16px;border-bottom:1px solid var(--border);gap:8px">
      <div style="text-align:center;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name||a.email}</div>
      <div style="text-align:center;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.name||b.email}</div>
    </div>
    ${rows.map(r=>`
      <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;text-align:center;margin-bottom:4px">${r.label}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr">
          <div style="text-align:center;font-size:16px;font-weight:700;color:${r.ca||'var(--text)'}">${r.va}</div>
          <div style="text-align:center;font-size:16px;font-weight:700;color:${r.cb||'var(--text)'}">${r.vb}</div>
        </div>
      </div>`).join('')}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Wellness semanal — en gráfico</div>
    <div style="padding:14px 16px;height:180px;position:relative"><canvas id="compare-chart-wellness"></canvas></div>
  </div>
  <div class="admin-section">
    <div class="admin-section-title">Marcas de salto y fuerza — en gráfico</div>
    <div style="padding:14px 16px;height:220px;position:relative"><canvas id="compare-chart-strength"></canvas></div>
  </div>`;
  return html;
}
window.renderCompareAthletes=renderCompareAthletes;

function drawCompareCharts() {
  if(typeof Chart==='undefined') return;
  if(!S.compareChartInstances) S.compareChartInstances={};
  Object.keys(S.compareChartInstances).forEach(k=>{
    try{S.compareChartInstances[k].destroy();}catch(e){}
    delete S.compareChartInstances[k];
  });
  if(!S.compareA || !S.compareB || S.compareA===S.compareB) return;
  const athletes=S.adminAthletes||[];
  const a=athletes.find(x=>x.uid===S.compareA), b=athletes.find(x=>x.uid===S.compareB);
  if(!a||!b) return;

  const sumA=computeAthleteLoadSummary(a), sumB=computeAthleteLoadSummary(b);
  const evalsA=a._personal?.evals||{}, evalsB=b._personal?.evals||{};
  const bestOf=(edata,id)=>{ const r=edata?.[id]||[]; return r.length?Math.max(...r.map(x=>x.height)):0; };
  const gridColor='rgba(18,21,28,0.08)';
  const nameA=a.name||a.email, nameB=b.name||b.email;

  const c1=document.getElementById('compare-chart-wellness');
  if(c1) {
    S.compareChartInstances['wellness']=new Chart(c1,{
      type:'bar',
      data:{ labels:[nameA,nameB], datasets:[{ data:[sumA.avgWellness||0, sumB.avgWellness||0], backgroundColor:['#3b7dd8','#22c55e'], borderRadius:6 }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ y:{min:0,max:100,ticks:{color:cssVar('--text','#1A1D26'),font:{size:10}},grid:{color:gridColor}}, x:{ticks:{color:cssVar('--text','#1A1D26'),font:{size:11}},grid:{display:false}} } }
    });
  }
  const c2=document.getElementById('compare-chart-strength');
  if(c2) {
    const labels=['CMJ (cm)','Banca (kg)','Muerto (kg)','Sentadilla (kg)','Cargada (kg)'];
    const ids=['cmj','rm_press_banca','rm_peso_muerto','rm_sentadilla','rm_cargada_potencia'];
    S.compareChartInstances['strength']=new Chart(c2,{
      type:'bar',
      data:{ labels, datasets:[
        {label:nameA, data:ids.map(id=>bestOf(evalsA,id)), backgroundColor:'#3b7dd8', borderRadius:4},
        {label:nameB, data:ids.map(id=>bestOf(evalsB,id)), backgroundColor:'#22c55e', borderRadius:4},
      ]},
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:cssVar('--text','#1A1D26'),font:{size:11}}}},
        scales:{ y:{ticks:{color:cssVar('--text','#1A1D26'),font:{size:10}},grid:{color:gridColor}}, x:{ticks:{color:cssVar('--text','#1A1D26'),font:{size:9}},grid:{display:false}} } }
    });
  }
}
window.drawCompareCharts=drawCompareCharts;

async function adminOpenAthlete(uid) {
  // Guardamos desde dónde se abrió esta ficha (Dashboard, un equipo, la
  // lista de Atletas...) para que "volver" te lleve ahí y no siempre al
  // mismo lugar fijo. Con el mismo contexto armamos la lista de "hermanos"
  // para poder recorrerla con las flechas ‹ › sin pasar por la lista.
  if(!S._inAthleteDetail) {
    S._athleteDetailReturnCtx = {currentView:S.currentView, adminView:S.adminView, teamView:S.teamView, teamSubview:S.teamSubview};
    S._athleteSiblingUids = computeAthleteSiblingUids();
  }
  S._inAthleteDetail = true;
  S._athleteOpenLoadingUid = uid;
  S.adminView='athlete_detail';
  S.currentView='admin';
  S.atletaSubview = 'perfil';
  S._atletaRoutineCollapsedDays = null;
  S._atletaRoutineCollapsedBlocks = null;
  S._routineWeekPreview = null;
  document.getElementById('main').innerHTML=`<div style="text-align:center;padding:40px;color:var(--text3)">Cargando perfil…</div>`;
  try {
    await ensureAdminAthletes();
    let a = S.adminAthletes.find(x=>x.uid===uid);
    if(!a) {
      // Por las dudas no esté todavía en la caché liviana de atletas — lo
      // traemos y lo agregamos, para no duplicar la lógica de la ficha en
      // dos modelos de datos distintos.
      const uSnap = await getDoc(doc(db,'users',uid));
      a = { uid, ...(uSnap.exists()?uSnap.data():{email:'—',name:'—'}) };
      S.adminAthletes.push(a);
    }
    // ensureGroupPersonalData solo trae lo que TODAVÍA no está cacheado —
    // como esa caché vive toda la sesión del admin, si ya habías entrado a
    // este atleta antes (aunque sea hace horas), se mostraba esa foto vieja
    // de nuevo sin volver a preguntarle a Firestore. Acá, específicamente al
    // abrir la ficha, siempre traemos a ESTE atleta fresco — es el momento
    // exacto en el que más importa ver lo último, sobre todo wellness/carga
    // recién cargados.
    try {
      const freshSnap = await getDoc(doc(db,'personal',uid));
      a._personal = freshSnap.exists() ? freshSnap.data() : {};
    } catch(e) {}
    await ensureGroupPersonalData(getEffectiveGroupUids(a));
    // Mismo bug de fondo que openTeam(): si mientras este fetch corría el
    // admin ya volvió atrás (o abrió a otro atleta), este resultado quedó
    // viejo — aplicarlo pisaría esa navegación y dejaría al admin "pegado"
    // en una ficha de la que ya se había ido.
    if (S._athleteOpenLoadingUid !== uid) return;
    S.atletaView = a;
    S.viewingAthlete = { uid, userData:a, personal:a._personal||{} };
  } catch(e) { S.viewingAthlete=null; S.atletaView=null; }
  renderMain();
}
window.adminOpenAthlete=adminOpenAthlete;

// "Volver" desde la ficha de un atleta — te lleva de nuevo a donde estabas
// parado antes de entrar (Dashboard, un equipo, la lista de Atletas...), en
// vez de siempre mandarte al mismo lugar fijo.
function goBackFromAthleteDetail() {
  const ctx = S._athleteDetailReturnCtx;
  S._athleteDetailReturnCtx = null;
  S._athleteSiblingUids = null;
  S._inAthleteDetail = false;
  S._athleteOpenLoadingUid = null;
  S.viewingAthlete = null;
  S.atletaView = null;
  if(ctx) {
    S.currentView = ctx.currentView;
    S.adminView = ctx.adminView;
    S.teamView = ctx.teamView;
    S.teamSubview = ctx.teamSubview;
    renderBottomBar(); renderMain();
  } else {
    S.adminView='athletes'; S.currentView='admin'; adminGoAthletes();
  }
}
window.goBackFromAthleteDetail = goBackFromAthleteDetail;

// ── REPORTE SEMANAL EXPORTABLE ──────────────────────────────
// Usa la función nativa de impresión del navegador (sin librerías nuevas):
// "Imprimir" en el diálogo del navegador permite guardar como PDF directamente.
async function openWeeklyReport(uid) {
  await ensureGroupPersonalData([uid]);
  S.reportAthleteUid = uid;
  S.currentView = 'weekly_report';
  renderMain();
}
window.openWeeklyReport = openWeeklyReport;

function renderWeeklyReport() {
  const uid = S.reportAthleteUid;
  const a = (S.adminAthletes||[]).find(x=>x.uid===uid);
  if(!a) return `<div class="empty-state">Atleta no encontrado.</div>`;

  const personal = a._personal||{};
  const wellness = personal.wellness||{};
  const logs = personal.history?._sessionLogs || personal.sessionLogs || [];
  const injuries = Object.entries(personal.injuries||{}).filter(([,v])=>v.pain>0);
  const myTeam = a.teamId ? S.teams?.find(t=>t.id===a.teamId) : null;

  const today = new Date();
  const days = [];
  for(let i=6;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); days.push(toLocalDateStr(d)); }
  const rangeLabel = days[0]+' — '+days[6];

  const m = calcLoadMetrics(logs);
  const acwrSt = getACWRStatus(m?.acwr??null, m?.daysOfHistory);
  const monSt = getMonotonyStatus(m?.monotony??null);

  const wellnessRows = days.map(d=>{
    const w = wellness[d];
    const {pct,allFilled} = getWellnessScore(w);
    const dayLogs = logs.filter(l=>l.date===d);
    const ua = dayLogs.reduce((s,l)=>s+(l.ua||0),0);
    const acts = dayLogs.map(l=>l.activity).join(', ');
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #ddd">${d}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:center">${allFilled?pct+'%':'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:center">${ua||'—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #ddd">${acts||'—'}</td>
    </tr>`;
  }).join('');

  return `<div class="no-print" style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
    <button class="back-btn" onclick="S.currentView='admin';renderMain()">‹</button>
    <div style="font-size:15px;font-weight:700;flex:1">Reporte semanal</div>
    <button class="abtn abtn-p" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  </div>

  <div class="print-report" style="background:#fff;color:#111;border-radius:8px;padding:28px;max-width:720px;margin:0 auto;font-family:inherit">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:18px">
      <div>
        <div style="font-size:20px;font-weight:800">${a.name||a.email}</div>
        <div style="font-size:12px;color:#555;margin-top:2px">${myTeam?myTeam.name+' · ':''}${a.position||''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.05em">G-Metrics Performance Lab</div>
        <div style="font-size:12px;color:#555;margin-top:2px">${rangeLabel}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#ddd;border:1px solid #ddd;margin-bottom:20px">
      <div style="background:#fff;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:800">${m?.acwr!=null?m.acwr.toFixed(2):'—'}</div>
        <div style="font-size:10px;color:#555;text-transform:uppercase;margin-top:2px">ACWR</div>
        <div style="font-size:10px;color:#555">${acwrSt.label}</div>
      </div>
      <div style="background:#fff;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:800">${m?.monotony!=null?m.monotony.toFixed(1):'—'}</div>
        <div style="font-size:10px;color:#555;text-transform:uppercase;margin-top:2px">Monotonía</div>
        <div style="font-size:10px;color:#555">${monSt.label}</div>
      </div>
      <div style="background:#fff;padding:12px;text-align:center">
        <div style="font-size:20px;font-weight:800">${m?.acuteUA??'—'}</div>
        <div style="font-size:10px;color:#555;text-transform:uppercase;margin-top:2px">Carga semana (UA)</div>
      </div>
    </div>

    <div style="font-size:13px;font-weight:700;margin-bottom:8px">Wellness y carga diaria</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px">
      <thead><tr style="background:#f2f2f2">
        <th style="padding:6px 10px;text-align:left">Fecha</th>
        <th style="padding:6px 10px;text-align:center">Wellness</th>
        <th style="padding:6px 10px;text-align:center">UA del día</th>
        <th style="padding:6px 10px;text-align:left">Actividades</th>
      </tr></thead>
      <tbody>${wellnessRows}</tbody>
    </table>

    <div style="font-size:13px;font-weight:700;margin-bottom:8px">Molestias activas</div>
    ${injuries.length
      ? `<ul style="font-size:12px;margin:0 0 10px;padding-left:18px">${injuries.map(([id,inj])=>`<li>${id} — ${severityInfo(inj.severity)?.label||'Leve'} · dolor de hoy ${inj.pain}/10${inj.note?' · '+inj.note:''}</li>`).join('')}</ul>`
      : `<div style="font-size:12px;color:#777;margin-bottom:10px">Sin molestias registradas.</div>`}

    <div style="font-size:10px;color:#999;text-align:right;margin-top:24px">Generado el ${todayLocal()}</div>
  </div>`;
}
window.renderWeeklyReport = renderWeeklyReport;

// Escribe la asignación en Firestore y refleja el cambio en el estado local
// (viewingAthlete + lista de adminAthletes), sea que venga de "quitar
// rutina" directo o de confirmar el modal de días de gimnasio.
async function writeRoutineAssignment(uid, routineId, trainingWeekdays, startDate) {
  const today = todayLocal();
  const update = { assignedRoutine: routineId||null };
  // La semana de la planificación se cuenta desde el día que se la
  // asignás, no desde que el atleta se registró — por eso guardamos esta
  // fecha cada vez que asignás (o reasignás) una rutina. Por defecto es hoy,
  // pero el admin puede elegir otra (ej: arrancar retroactivo desde el lunes).
  if(routineId) update.routineAssignedDate = startDate||today;
  update.trainingWeekdays = routineId ? (trainingWeekdays||[]) : [];
  await setDoc(doc(db,'users',uid), update, {merge:true});
  if(S.viewingAthlete?.userData) Object.assign(S.viewingAthlete.userData, update);
  const a = S.adminAthletes.find(x=>x.uid===uid);
  if(a) Object.assign(a, update);
}

async function assignRoutineToAthlete(uid) {
  const sel = document.getElementById('assign-routine-sel');
  if(!sel) return;
  const routineId = sel.value || null;
  if (!routineId) {
    // "— Sin rutina —": se quita directo, no hace falta elegir días.
    try {
      await writeRoutineAssignment(uid, null, []);
      showToast('Rutina removida');
      renderMain();
    } catch(e) { showToast('Error al asignar'); }
    return;
  }
  openWeekdayAssignModal(uid, routineId);
}
window.assignRoutineToAthlete=assignRoutineToAthlete;

// ── Calendario semanal de días de gimnasio (al asignar una rutina) ──────
// El admin tilda en qué días reales de la semana el atleta entrena; esos
// días se emparejan por orden con los días de la rutina (ver
// getWeekdayScheduleMap), sin importar cómo se llamen. Se repite todas las
// semanas mientras dure la rutina.
const WEEKDAY_LABELS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

function openWeekdayAssignModal(uid, routineId) {
  const routine = S.routines.find(r=>r.id===routineId);
  if(!routine) { showToast('Error: rutina no encontrada'); return; }
  const sessionNames = getOrderedSessionNames(routine);
  const a = S.adminAthletes.find(x=>x.uid===uid) || S.viewingAthlete?.userData;
  // Si ya tenía días elegidos (para esta u otra rutina), arrancamos de ahí —
  // es un punto de partida razonable que el admin puede ajustar.
  const prevSelected = (a && a.assignedRoutine===routineId && Array.isArray(a.trainingWeekdays)) ? a.trainingWeekdays : [];
  const today = todayLocal();
  // BUG encontrado y corregido acá: si el atleta YA tenía esta misma rutina
  // asignada, arrancamos con su fecha real de inicio (no "hoy") — antes,
  // reabrir esto solo para tocar los días de gimnasio (sin querer cambiar
  // nada de fechas) reseteaba a Semana 1 a alguien que ya venía entrenando
  // hace semanas, porque el campo quedaba siempre precargado en hoy.
  const startDate = (a && a.assignedRoutine===routineId && a.routineAssignedDate) ? a.routineAssignedDate : today;
  S._weekdayAssign = { uid, routineId, sessionNames, selected: [...prevSelected], startDate };
  document.getElementById('weekday-assign-title').textContent = 'Días de gimnasio · ' + routine.name;
  renderWeekdayAssignBody();
  document.getElementById('weekday-assign-overlay').classList.add('open');
}
window.openWeekdayAssignModal = openWeekdayAssignModal;

function renderWeekdayAssignBody() {
  const st = S._weekdayAssign;
  if(!st) return;
  const need = st.sessionNames.length;
  const got = st.selected.length;
  const sortedSel = [...st.selected].sort((a,b)=>a-b);
  const html = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px">
      Esta rutina tiene <strong>${need}</strong> día${need===1?'':'s'} (${st.sessionNames.join(' · ')}).
      Elegí ${need} día${need===1?'':'s'} reales de la semana en que el atleta va al gimnasio.
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:600;display:block;margin-bottom:4px">¿Desde qué día arranca la Semana 1?</label>
      <input type="date" class="abtn" style="width:100%" value="${st.startDate}" onchange="setWeekdayAssignStartDate(this.value)">
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${WEEKDAY_LABELS.map((label,dow)=>{
        const checked = st.selected.includes(dow);
        const order = checked ? sortedSel.indexOf(dow) : -1;
        const mapped = (checked && order>=0) ? st.sessionNames[order % need] : null;
        return `<button class="abtn ${checked?'abtn-p':''}" style="justify-content:space-between;display:flex;width:100%" onclick="toggleWeekdayAssignDay(${dow})">
          <span>${label}</span>
          ${mapped?`<span style="font-size:11px;opacity:.85">${mapped}</span>`:''}
        </button>`;
      }).join('')}
    </div>
    <div style="font-size:12px;color:${got===need?'var(--green)':'var(--text3)'};margin-top:12px;text-align:center">
      ${got}/${need} día${need===1?'':'s'} seleccionado${need===1?'':'s'}
    </div>`;
  document.getElementById('weekday-assign-body').innerHTML = html;
  const btn = document.getElementById('weekday-assign-confirm-btn');
  const ready = got===need;
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '.3';
  btn.style.cursor = ready ? 'pointer' : 'not-allowed';
}
window.renderWeekdayAssignBody = renderWeekdayAssignBody;

function toggleWeekdayAssignDay(dow) {
  const st = S._weekdayAssign;
  if(!st) return;
  const i = st.selected.indexOf(dow);
  if(i>=0) st.selected.splice(i,1); else st.selected.push(dow);
  renderWeekdayAssignBody();
}
window.toggleWeekdayAssignDay = toggleWeekdayAssignDay;

function setWeekdayAssignStartDate(val) {
  const st = S._weekdayAssign;
  if(!st || !val) return;
  st.startDate = val;
}
window.setWeekdayAssignStartDate = setWeekdayAssignStartDate;

function closeWeekdayAssignModal() {
  document.getElementById('weekday-assign-overlay').classList.remove('open');
  S._weekdayAssign = null;
}
window.closeWeekdayAssignModal = closeWeekdayAssignModal;

function closeWeekdayAssignIfOutside(e) { if(e.target===document.getElementById('weekday-assign-overlay')) closeWeekdayAssignModal(); }
window.closeWeekdayAssignIfOutside = closeWeekdayAssignIfOutside;

async function confirmWeekdayAssign() {
  const st = S._weekdayAssign;
  if(!st || st.selected.length !== st.sessionNames.length) return;
  try {
    await writeRoutineAssignment(st.uid, st.routineId, [...st.selected], st.startDate);
    showToast('✓ Rutina y días asignados');
    closeWeekdayAssignModal();
    renderMain();
  } catch(e) { showToast('Error al asignar'); }
}
window.confirmWeekdayAssign = confirmWeekdayAssign;

// Hojear otras semanas de la planificación PARA MIRARLAS, sin tocar nada
// real — antes esto reescribía routineAssignedDate en Firestore, lo cual
// cambiaba de verdad la semana del atleta (incluso en su propio celular)
// cada vez que el admin solo quería revisar contenido. Ahora es 100% local.
function adjustAthleteRoutineWeek(uid, delta) {
  const a = S.adminAthletes?.find(x=>x.uid===uid);
  if(!a) return;
  const realWeek = a.routineAssignedDate ? computeWeekFromDate(a.routineAssignedDate)
    : (a._personal?.startDate ? computeWeekFromDate(a._personal.startDate) : 1);
  if(!S._routineWeekPreview) S._routineWeekPreview = {};
  const current = S._routineWeekPreview[uid] ?? realWeek;
  S._routineWeekPreview[uid] = Math.max(1, current+delta);
  renderMain();
}
window.adjustAthleteRoutineWeek = adjustAthleteRoutineWeek;

function resetRoutineWeekPreview(uid) {
  if(S._routineWeekPreview) delete S._routineWeekPreview[uid];
  renderMain();
}
window.resetRoutineWeekPreview = resetRoutineWeekPreview;

// Corrección EXPLÍCITA y deliberada de la semana real — a diferencia de
// adjustAthleteRoutineWeek (que ahora es solo vista), esto sí reescribe
// routineAssignedDate a propósito, para cuando la semana real quedó mal
// (por ejemplo, por un click viejo de antes de que existiera la vista segura).
async function adminSetRealRoutineWeek(uid, week) {
  const a = S.adminAthletes?.find(x=>x.uid===uid);
  if(!a) return;
  const w = Math.max(1, week);
  const base = new Date(); base.setHours(0,0,0,0);
  base.setDate(base.getDate() - (w-1)*7);
  const newDate = toLocalDateStr(base);
  try {
    await setDoc(doc(db,'users',uid), {routineAssignedDate:newDate}, {merge:true});
    a.routineAssignedDate = newDate;
    if(S.viewingAthlete?.uid===uid) S.viewingAthlete.userData.routineAssignedDate = newDate;
    if(S._routineWeekPreview) delete S._routineWeekPreview[uid];
    showToast('✓ Semana real corregida a Semana '+w);
    renderMain();
  } catch(e) { showToast('Error al corregir'); }
}
window.adminSetRealRoutineWeek = adminSetRealRoutineWeek;

async function resetAthleteRoutineWeek(uid) {
  if(!confirm('Esto reinicia la planificación real del atleta a Semana 1 a partir de hoy — lo va a ver así en su propio celular. ¿Confirmás?')) return;
  const a = S.adminAthletes?.find(x=>x.uid===uid);
  const today = todayLocal();
  try {
    await setDoc(doc(db,'users',uid), {routineAssignedDate:today}, {merge:true});
    if(a) a.routineAssignedDate = today;
    if(S.viewingAthlete?.uid===uid) S.viewingAthlete.userData.routineAssignedDate = today;
    if(S._routineWeekPreview) delete S._routineWeekPreview[uid];
    showToast('✓ Reiniciado a Semana 1');
    renderMain();
  } catch(e) { showToast('Error al reiniciar'); }
}
window.resetAthleteRoutineWeek = resetAthleteRoutineWeek;

async function changeAthleteWeek(uid, delta) {
  const p = S.viewingAthlete?.personal;
  if(!p) return;
  const start = new Date((p.startDate||todayLocal())+'T00:00:00');
  start.setDate(start.getDate() - delta*7);
  const newStart = toLocalDateStr(start);
  const newWeek = computeWeekFromDate(newStart);
  if(newWeek<1) return;
  p.startDate = newStart;
  p.currentWeek = newWeek;
  try {
    await setDoc(doc(db,'personal',uid),{startDate:newStart, currentWeek:newWeek},{merge:true});
    showToast(`Semana actualizada: ${newWeek}`);
    renderMain();
  } catch(e) { showToast('Error'); }
}
window.changeAthleteWeek=changeAthleteWeek;

// ── ADMIN: ROUTINES ───────────────────────────────────────────
function adminGoRoutines() {
  S.adminView='routines';
  renderMain();
}
window.adminGoRoutines=adminGoRoutines;

function renderAdminRoutines() {
  let html=`<div class="team-detail-header">
    <button class="back-btn" data-back="admin-main">‹</button>
    <div class="team-detail-title">Rutinas</div>
    <button class="abtn abtn-p" onclick="createRoutine()">+ Nueva</button>
  </div>`;
  if(!S.routines.length) {
    html+=`<div class="empty-state">No hay rutinas creadas.<br><span style="font-size:12px">Creá una rutina para asignarla a tus alumnos.</span></div>`;
  } else {
    html+=S.routines.map(r=>`
      <div class="card" style="padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:14px;font-weight:600">${r.name}</div>
          <div style="display:flex;gap:6px">
            <button class="abtn abtn-p" onclick="editRoutine('${r.id}')">Editar</button>
            <button class="abtn" onclick="duplicateRoutine('${r.id}')" title="Duplicar — para partir de esta y cambiar solo lo que necesitás">⧉ Duplicar</button>
            <button class="abtn abtn-d" onclick="deleteRoutine('${r.id}')">×</button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text3)">
          ${sortSessionNames(Object.keys(r.sessions||{})).join(' · ')||'Sin sesiones'}
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Asignada a: ${S.adminAthletes.filter(a=>a.assignedRoutine===r.id).map(a=>a.name||a.email).join(', ')||'nadie'}
        </div>
      </div>`).join('');
  }
  return html;
}
window.renderAdminRoutines = renderAdminRoutines;

async function createRoutine() {
  const name = prompt('Nombre de la rutina (ej: Fuerza Base Baloncesto):');
  if(!name) return;
  const sessionsRaw = prompt('Nombres de las sesiones separadas por coma\n(ej: Lunes,Miércoles,Viernes)','Lunes,Miércoles,Viernes');
  if(!sessionsRaw) return;
  const sessionNames = sessionsRaw.split(',').map(s=>s.trim()).filter(Boolean);
  const sessions = {};
  sessionNames.forEach(s=>{ sessions[s]=[]; });
  const id = genId();
  const routine = { id, name, sessions, createdAt: new Date().toISOString() };
  try {
    await setDoc(doc(db,'routines',id), routine);
    S.routines.push(routine);
    showToast('✓ Rutina creada');
    S.editingRoutine = JSON.parse(JSON.stringify(routine));
    S._routineEditSession = sessionNames[0]||null;
    S._routineEditorPrev = 'routines'; // track where to go back
    S.adminView='routine_edit';
    renderMain();
  } catch(e) { showToast('Error al crear'); }
}
window.createRoutine=createRoutine;

function editRoutine(id) {
  const r = S.routines.find(x=>x.id===id);
  if(!r) return;
  S.editingRoutine = JSON.parse(JSON.stringify(r));
  S._routineEditorPrev = 'routines';
  S.adminView='routine_edit';
  const sessions = sortSessionNames(Object.keys(S.editingRoutine.sessions||{}));
  S._routineEditSession = sessions[0]||null;
  renderMain();
}
window.editRoutine=editRoutine;

// Copia completa de una rutina existente (todas sus sesiones, bloques y
// ejercicios) bajo un id y nombre nuevos, y abre el editor directo sobre la
// copia — para cuando dos rutinas son casi iguales y solo hace falta
// cambiarles algún detalle, en vez de recrearlas ejercicio por ejercicio.
async function duplicateRoutine(id) {
  const r = S.routines.find(x=>x.id===id);
  if(!r) return;
  const name = prompt('Nombre de la copia:', r.name+' (copia)');
  if(!name) return;
  const newId = genId();
  const copy = JSON.parse(JSON.stringify(r));
  copy.id = newId;
  copy.name = name;
  copy.createdAt = new Date().toISOString();
  try {
    await setDoc(doc(db,'routines',newId), copy);
    S.routines.push(copy);
    showToast('✓ Rutina duplicada');
    S.editingRoutine = JSON.parse(JSON.stringify(copy));
    const sessions = sortSessionNames(Object.keys(S.editingRoutine.sessions||{}));
    S._routineEditSession = sessions[0]||null;
    S._routineEditorPrev = 'routines';
    S.adminView='routine_edit';
    renderMain();
  } catch(e) { showToast('Error al duplicar'); }
}
window.duplicateRoutine = duplicateRoutine;

async function deleteRoutine(id) {
  if(!confirm('¿Eliminar esta rutina?')) return;
  try {
    await deleteDoc(doc(db,'routines',id));
    S.routines = S.routines.filter(r=>r.id!==id);
    showToast('Rutina eliminada');
    renderMain();
  } catch(e) { showToast('Error'); }
}
window.deleteRoutine=deleteRoutine;

// ── ROUTINE EDITOR ────────────────────────────────────────────
function setRoutineDuration(val) {
  if(!S.editingRoutine) return;
  S.editingRoutine.durationWeeks = Math.max(1, +val||4);
  renderMain();
}
window.setRoutineDuration = setRoutineDuration;

function renderRoutineEditor() {
  const r = S.editingRoutine;
  if(!r) return `<div class="empty-state">Error: no hay rutina en edición.</div>`;
  const sessionNames = getOrderedSessionNames(r);
  if(!S._routineEditSession || !r.sessions[S._routineEditSession]) {
    S._routineEditSession = sessionNames[0]||null;
  }
  const curSession = S._routineEditSession;
  const blocks = curSession ? (r.sessions[curSession]||[]) : [];
  // Si son días reales de semana, el orden calendario manda siempre (ver
  // getOrderedSessionNames) — mover con las flechitas no haría nada, así
  // que ni se muestran para no sugerir un control que no tiene efecto.
  const canReorderManually = sessionNames.length > 1
    && !sessionNames.every(n => WEEKDAY_ORDER[n.trim().toLowerCase()] !== undefined);

  const sessionTabs = sessionNames.map((s,i)=>'<span style="display:inline-flex;align-items:center;gap:2px">'
    +'<button class="snav-tab '+(curSession===s?'active':'')+'" onclick="routineSelectSession(\''+s+'\')">'+s+'</button>'
    +(canReorderManually?(
      '<button class="ex-icon-btn" style="'+(i===0?'opacity:.3;pointer-events:none':'')+'" onclick="moveRoutineDay(\''+s+'\',-1)" title="Mover antes"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="15 18 9 12 15 6"/></svg></button>'
      +'<button class="ex-icon-btn" style="'+(i===sessionNames.length-1?'opacity:.3;pointer-events:none':'')+'" onclick="moveRoutineDay(\''+s+'\',1)" title="Mover después"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 18 15 12 9 6"/></svg></button>'
    ):'')
    +'</span>').join('');

  const blocksHtml = blocks.map((b,bi)=>renderRoutineBlock(b,curSession,bi,blocks.length)).join('');

  return `
  <div class="team-detail-header">
    <button class="back-btn" data-back="routine-editor">‹</button>
    <div class="team-detail-title" style="flex:1">${r.name}</div>
    <button class="abtn abtn-p" onclick="saveRoutineToFirestore()">Guardar</button>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;padding:10px 14px;background:var(--accent-dim);border-radius:var(--rsm)">
    <span style="font-size:12px;font-weight:600;color:var(--accent-text)">Duración de esta planificación</span>
    <input type="number" min="1" max="52" value="${r.durationWeeks||4}" style="width:56px;text-align:center;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--rxs);padding:5px;color:var(--text);font-size:13px" onchange="setRoutineDuration(this.value)">
    <span style="font-size:12px;color:var(--text3)">semanas</span>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
    ${sessionTabs}
    <button class="abtn" onclick="addRoutineSession()" style="font-size:11px">+ Sesión</button>
    ${curSession?`<button class="abtn abtn-d" onclick="deleteRoutineSession('${curSession}')" style="font-size:11px">× ${curSession}</button>`:''}
  </div>
  ${curSession?`
    ${blocksHtml}
    <div style="display:flex;gap:8px">
      <button class="add-block-btn" style="flex:1" onclick="addRoutineBlock('${curSession}')">+ Agregar bloque</button>
      ${S._blockClipboard?`<button class="add-block-btn" style="flex:1" onclick="pasteRoutineBlock('${curSession}')">📥 Pegar "${S._blockClipboard.title||S._blockClipboard.label}"</button>`:''}
    </div>
  `:`<div class="empty-state">Seleccioná o creá una sesión para empezar.</div>`}
  `;
}

function renderRoutineBlock(b, sessionName, bIdx, totalBlocks) {
  const cc=b.colorKey||'bx';
  const open=b._open===true;
  let inner=``;
  if(b.note) inner+=`<p class="block-note">${b.note}</p>`;

  b.categories.forEach((cat,ci)=>{
    inner+=`<div class="cat-header">
      <div class="cat-label-wrap">
        <span class="cat-label" ondblclick="editRCatLabel(this,'${b.id}','${sessionName}',${ci})">${cat.label}</span>
        <input class="cat-label-inp" id="rcatinp-${b.id}-${ci}" onblur="saveRCatLabel('${b.id}','${sessionName}',${ci},this)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <span class="cat-del" onclick="deleteRCat('${b.id}','${sessionName}',${ci})">− cat</span>
    </div>`;
    cat.exercises.forEach((ex,ei)=>{
      inner+=renderRoutineExRow(ex,b.id,sessionName,ci,ei,cat.exercises.length);
    });
    inner+=`<button class="add-btn" onclick="openRoutineLib('${b.id}','${sessionName}',${ci})">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Agregar ejercicio</button>`;
    if(ci<b.categories.length-1) inner+=`<hr class="cat-divider">`;
  });

  inner+=`<button class="add-btn" style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px" onclick="addRCategory('${b.id}','${sessionName}')">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Agregar subcategoría</button>`;

  return `<div class="card block ${cc} ${open?'open':''}" id="rblock-${b.id}">
    <div class="block-header" onclick="toggleRBlock('${b.id}','${sessionName}')">
      <span class="block-badge">${b.label}</span>
      <div class="block-title-wrap">
        <span class="block-title" ondblclick="editRBlockTitle(event,'${b.id}','${sessionName}')">${b.title}</span>
        <input class="block-title-inp" id="rbtinp-${b.id}" onblur="saveRBlockTitle('${b.id}','${sessionName}',this)" onkeydown="if(event.key==='Enter')this.blur()">
      </div>
      <span class="block-time">${b.time||''}</span>
      <span class="ex-icon-btn" style="${bIdx===0?'opacity:.3;pointer-events:none':''}" onclick="event.stopPropagation();moveRoutineBlock('${b.id}','${sessionName}',-1)" title="Mover arriba"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg></span>
      <span class="ex-icon-btn" style="${bIdx===totalBlocks-1?'opacity:.3;pointer-events:none':''}" onclick="event.stopPropagation();moveRoutineBlock('${b.id}','${sessionName}',1)" title="Mover abajo"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
      <span class="ex-icon-btn" onclick="event.stopPropagation();copyBlockToClipboard(getRBlock('${b.id}','${sessionName}'))" title="Copiar bloque"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
      <span class="block-del" onclick="deleteRBlock(event,'${b.id}','${sessionName}')">×</span>
      <span class="block-chevron">›</span>
    </div>
    <div class="block-body">${inner}</div>
  </div>`;
}

function renderRoutineExRow(ex, blockId, sessionName, catIdx, exIdx, totalEx) {
  // Mismo criterio que en el resto de la app: el video se busca por libId
  // (el vínculo con la biblioteca), y si el ejercicio es viejo y no lo
  // tiene, se intenta igual por nombre exacto para no perder el video.
  const libMatch = ex.libId ? null : S.library.find(l=>l.name.trim().toLowerCase()===(ex.name||'').trim().toLowerCase());
  const videoKey = ex.libId || (libMatch&&libMatch.id) || ex.id;
  const hasV = !!S.videos[videoKey];
  const isFirst = exIdx===0, isLast = exIdx===(totalEx-1);
  const durationWeeks = S.editingRoutine?.durationWeeks || 4;
  const weeksArr = Array.from({length:durationWeeks}, (_,i)=>i+1);
  const getWP = (w) => (ex.progression && ex.progression[w-1]) ? ex.progression[w-1] : {series:ex.series||'',reps:ex.reps||'',pct:ex.pct||'',rpe:ex.rpe||'',intensityType:ex.intensityType||'RPE',note:ex.note||''};
  return `<div class="ex-row" id="rexrow-${ex.id}">
    <div class="ex-main">
      <div class="ex-name-row">
        <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
          <button class="ex-icon-btn" style="${isFirst?'opacity:.3;pointer-events:none':''}" onclick="moveRExercise('${ex.id}','${blockId}','${sessionName}',${catIdx},-1)" title="Subir">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button class="ex-icon-btn" style="${isLast?'opacity:.3;pointer-events:none':''}" onclick="moveRExercise('${ex.id}','${blockId}','${sessionName}',${catIdx},1)" title="Bajar">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        <span class="ex-name" ondblclick="editRExName(this,'${ex.id}','${blockId}','${sessionName}',${catIdx})">${ex.name}</span>
        <input class="ex-name-inp" id="rexinp-${ex.id}" onblur="saveRExName('${ex.id}','${blockId}','${sessionName}',${catIdx},this)" onkeydown="if(event.key==='Enter')this.blur()">
        <div class="ex-actions">
          <div class="ex-icon-btn ${hasV?'has-video':''}" data-videokey="${videoKey}" onclick="openVideoModal('${videoKey}','${ex.name}',true)" title="Video">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          <div class="ex-icon-btn del-ex" onclick="deleteRExercise('${ex.id}','${blockId}','${sessionName}',${catIdx})" title="Eliminar">×</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
        <span style="font-size:10px;color:var(--text3);font-weight:600">De qué RM:</span>
        <select class="field-inp" style="width:auto;padding:5px 4px;font-size:11px" onchange="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'rmLift',this.value)">
          <option value="">—</option>
          ${RM_LIFTS.map(rm=>`<option value="${rm.id}" ${ex.rmLift===rm.id?'selected':''}>${rm.label}</option>`).join('')}
        </select>
        <span style="font-size:10px;color:var(--text3);font-weight:600;margin-left:8px">Intensidad: ${infoBtn('intensity')}</span>
        <div class="intensity-sel">
          <button class="intensity-type-btn ${(ex.intensityType||'RPE')==='RPE'?'active':''}" onclick="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'intensityType','RPE');this.classList.add('active');this.nextElementSibling.classList.remove('active')">RPE</button>
          <button class="intensity-type-btn ${ex.intensityType==='RIR'?'active':''}" onclick="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'intensityType','RIR');this.classList.add('active');this.previousElementSibling.classList.remove('active')">RIR</button>
        </div>
      </div>
      <div style="overflow-x:auto;margin-bottom:8px;border:1px solid var(--border2);border-radius:var(--rsm)">
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr style="background:var(--accent-dim)">
              <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--accent-text);font-weight:700;position:sticky;left:0;background:var(--accent-dim);min-width:64px;z-index:1"></th>
              ${weeksArr.map(w=>`<th style="padding:6px 8px;text-align:center;font-size:11px;color:var(--accent-text);font-weight:700;min-width:76px;white-space:nowrap">Semana ${w}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:5px 8px;font-size:10px;color:var(--text3);font-weight:600;position:sticky;left:0;background:var(--bg2)">Series</td>
              ${weeksArr.map(w=>`<td style="padding:3px 4px"><input class="field-inp" style="width:100%;min-width:64px;text-align:center" type="text" placeholder="3x" value="${getWP(w).series||''}" onchange="setRExWeekField('${ex.id}','${blockId}','${sessionName}',${catIdx},${w},'series',this.value)"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:5px 8px;font-size:10px;color:var(--text3);font-weight:600;position:sticky;left:0;background:var(--bg2)">Reps</td>
              ${weeksArr.map(w=>`<td style="padding:3px 4px"><input class="field-inp" style="width:100%;min-width:64px;text-align:center" type="text" placeholder="6–8" value="${getWP(w).reps||''}" onchange="setRExWeekField('${ex.id}','${blockId}','${sessionName}',${catIdx},${w},'reps',this.value)"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:5px 8px;font-size:10px;color:var(--text3);font-weight:600;position:sticky;left:0;background:var(--bg2)">%RM</td>
              ${weeksArr.map(w=>`<td style="padding:3px 4px"><input class="field-inp" style="width:100%;min-width:64px;text-align:center" type="text" placeholder="—" value="${getWP(w).pct||''}" onchange="setRExWeekField('${ex.id}','${blockId}','${sessionName}',${catIdx},${w},'pct',this.value)"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:5px 8px;font-size:10px;color:var(--text3);font-weight:600;position:sticky;left:0;background:var(--bg2)">${ex.intensityType||'RPE'}</td>
              ${weeksArr.map(w=>`<td style="padding:3px 4px"><input class="field-inp" style="width:100%;min-width:64px;text-align:center" type="text" placeholder="—" value="${getWP(w).rpe||''}" onchange="setRExWeekField('${ex.id}','${blockId}','${sessionName}',${catIdx},${w},'rpe',this.value)"></td>`).join('')}
            </tr>
            <tr>
              <td style="padding:5px 8px;font-size:10px;color:var(--text3);font-weight:600;position:sticky;left:0;background:var(--bg2)">Nota</td>
              ${weeksArr.map(w=>`<td style="padding:3px 4px"><input class="field-inp" style="width:100%;min-width:90px" type="text" placeholder="—" value="${getWP(w).note||''}" onchange="setRExWeekField('${ex.id}','${blockId}','${sessionName}',${catIdx},${w},'note',this.value)"></td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// Routine editor helper functions
function getRBlock(blockId, sessionName) {
  const r=S.editingRoutine; if(!r) return null;
  return (r.sessions[sessionName]||[]).find(b=>b.id===blockId)||null;
}
window.getRBlock=getRBlock;

function routineSelectSession(s) { S._routineEditSession=s; renderMain(); }
window.routineSelectSession=routineSelectSession;

function addRoutineSession() {
  const name=prompt('Nombre de la sesión (ej: Martes):'); if(!name) return;
  if(!S.editingRoutine.sessions[name]) {
    S.editingRoutine.sessions[name]=[];
    S._routineEditSession=name;
  }
  renderMain();
}
window.addRoutineSession=addRoutineSession;

function deleteRoutineSession(sessionName) {
  if(!confirm(`¿Eliminar la sesión "${sessionName}"?`)) return;
  delete S.editingRoutine.sessions[sessionName];
  const remaining=sortSessionNames(Object.keys(S.editingRoutine.sessions));
  S._routineEditSession=remaining[0]||null;
  renderMain();
}
window.deleteRoutineSession=deleteRoutineSession;

function addRoutineBlock(sessionName) {
  const r=S.editingRoutine; if(!r) return;
  if(!r.sessions[sessionName]) r.sessions[sessionName]=[];
  const colors=['b1','b2','b3','b4','bx'];
  const n=r.sessions[sessionName].length;
  r.sessions[sessionName].push({
    id:genId(), label:`Bloque ${n+1}`, title:'Nuevo bloque',
    time:'', colorKey:colors[n%colors.length], note:'', _open:true,
    categories:[{id:genId(),label:'Categoría',exercises:[]}]
  });
  renderMain();
}
window.addRoutineBlock=addRoutineBlock;

function pasteRoutineBlock(sessionName) {
  const b=clonedBlockFromClipboard();
  if(!b){showToast('No copiaste ningún bloque todavía');return;}
  const r=S.editingRoutine; if(!r) return;
  if(!r.sessions[sessionName]) r.sessions[sessionName]=[];
  const colors=['b1','b2','b3','b4','bx'];
  const n=r.sessions[sessionName].length;
  b.colorKey=colors[n%colors.length];
  b.label=`Bloque ${n+1}`;
  r.sessions[sessionName].push(b);
  renderMain();
  showToast('✓ Bloque pegado');
}
window.pasteRoutineBlock=pasteRoutineBlock;

function toggleRBlock(blockId,sessionName) {
  const el=document.getElementById('rblock-'+blockId);
  if(!el) return;
  el.classList.toggle('open');
  const b=getRBlock(blockId,sessionName);
  if(b) b._open=el.classList.contains('open');
}
window.toggleRBlock=toggleRBlock;

function editRBlockTitle(e,blockId,sessionName) {
  e.stopPropagation();
  const b=getRBlock(blockId,sessionName); if(!b) return;
  const span=e.target, inp=document.getElementById('rbtinp-'+blockId);
  span.style.display='none'; inp.value=b.title; inp.style.display='block'; inp.focus(); inp.select();
}
window.editRBlockTitle=editRBlockTitle;

function saveRBlockTitle(blockId,sessionName,inp) {
  const b=getRBlock(blockId,sessionName); if(!b) return;
  if(inp.value.trim()) b.title=inp.value.trim();
  inp.style.display='none';
  const span=inp.previousElementSibling; if(span) { span.textContent=b.title; span.style.display=''; }
}
window.saveRBlockTitle=saveRBlockTitle;

function deleteRBlock(e,blockId,sessionName) {
  e.stopPropagation();
  if(!confirm('¿Eliminar este bloque?')) return;
  const r=S.editingRoutine; if(!r) return;
  r.sessions[sessionName]=(r.sessions[sessionName]||[]).filter(b=>b.id!==blockId);
  renderMain();
}
window.deleteRBlock=deleteRBlock;

function editRCatLabel(el,blockId,sessionName,catIdx) {
  const inp=document.getElementById(`rcatinp-${blockId}-${catIdx}`);
  el.style.display='none'; inp.value=el.textContent; inp.style.display='inline-block'; inp.focus(); inp.select();
}
window.editRCatLabel=editRCatLabel;

function saveRCatLabel(blockId,sessionName,catIdx,inp) {
  const b=getRBlock(blockId,sessionName); if(!b) return;
  if(inp.value.trim()) b.categories[catIdx].label=inp.value.trim();
  inp.style.display='none';
  const span=inp.previousElementSibling; if(span){ span.textContent=b.categories[catIdx].label; span.style.display=''; }
}
window.saveRCatLabel=saveRCatLabel;

function deleteRCat(blockId,sessionName,catIdx) {
  if(!confirm('¿Eliminar esta subcategoría?')) return;
  const b=getRBlock(blockId,sessionName); if(!b) return;
  b.categories.splice(catIdx,1); renderMain();
}
window.deleteRCat=deleteRCat;

function addRCategory(blockId,sessionName) {
  const b=getRBlock(blockId,sessionName); if(!b) return;
  b.categories.push({id:genId(),label:'Nueva categoría',exercises:[]});
  renderMain();
}
window.addRCategory=addRCategory;

function editRExName(el,exId,blockId,sessionName,catIdx) {
  const inp=document.getElementById('rexinp-'+exId);
  el.style.display='none'; inp.value=el.textContent; inp.style.display='block'; inp.focus(); inp.select();
}
window.editRExName=editRExName;

function saveRExName(exId,blockId,sessionName,catIdx,inp) {
  const b=getRBlock(blockId,sessionName); if(!b) return;
  const ex=b.categories[catIdx].exercises.find(e=>e.id===exId); if(!ex) return;
  if(inp.value.trim()) ex.name=inp.value.trim();
  inp.style.display='none';
  const span=inp.previousElementSibling; if(span){ span.textContent=ex.name; span.style.display=''; }
}
window.saveRExName=saveRExName;

function setRExField(exId,blockId,sessionName,catIdx,field,val) {
  const b=getRBlock(blockId,sessionName); if(!b) return;
  const ex=b.categories[catIdx].exercises.find(e=>e.id===exId); if(!ex) return;
  ex[field]=val;
  // El botón RPE/RIR es un único interruptor para todo el ejercicio, pero
  // una vez que existe progresión semana a semana, cada semana guarda su
  // PROPIA copia de intensityType (para que getExPrescriptionForWeek pueda
  // leerla semana por semana sin lógica extra). Si acá solo actualizamos
  // ex.intensityType, el botón cambia pero cada semana sigue mostrando el
  // valor viejo con el que se creó la progresión — hay que propagarlo a
  // todas las semanas ya cargadas.
  if (field === 'intensityType' && ex.progression && ex.progression.length) {
    ex.progression.forEach(wk => { wk.intensityType = val; });
  }
}
window.setRExField=setRExField;

function setRExEditWeek(exId, week) {
  if(!S._routineEditWeek) S._routineEditWeek = {};
  S._routineEditWeek[exId] = Math.max(1, week);
  renderMain();
}
window.setRExEditWeek = setRExEditWeek;

// Si el ejercicio todavía no tiene progresión cargada, la inicializa con
// los campos planos que ya tenía (semana 1) — así nunca se pierde nada de
// lo que ya estaba cargado.
function ensureExProgression(ex) {
  if(!ex.progression || !ex.progression.length) {
    ex.progression = [{series:ex.series||'', reps:ex.reps||'', pct:ex.pct||'', rpe:ex.rpe||'', intensityType:ex.intensityType||'RPE', note:ex.note||''}];
  }
  return ex.progression;
}
window.ensureExProgression = ensureExProgression;

function setRExWeekField(exId, blockId, sessionName, catIdx, week, field, val) {
  const b = getRBlock(blockId, sessionName); if(!b) return;
  const ex = b.categories[catIdx].exercises.find(e=>e.id===exId); if(!ex) return;
  const prog = ensureExProgression(ex);
  // Si se edita una semana más adelante de lo cargado hasta ahora, se
  // extiende repitiendo la última semana definida (progresión por defecto).
  while(prog.length < week) prog.push({...prog[prog.length-1]});
  prog[week-1][field] = val;
}
window.setRExWeekField = setRExWeekField;

function copyRExWeekForward(exId, blockId, sessionName, catIdx, week) {
  const b = getRBlock(blockId, sessionName); if(!b) return;
  const ex = b.categories[catIdx].exercises.find(e=>e.id===exId); if(!ex) return;
  const durationWeeks = S.editingRoutine?.durationWeeks || 4;
  const prog = ensureExProgression(ex);
  const base = {...prog[week-1]};
  for(let w=week+1; w<=durationWeeks; w++) prog[w-1] = {...base};
  renderMain();
  showToast('✓ Copiado a las semanas siguientes');
}
window.copyRExWeekForward = copyRExWeekForward;

function deleteRExercise(exId,blockId,sessionName,catIdx) {
  const b=getRBlock(blockId,sessionName); if(!b) return;
  b.categories[catIdx].exercises=b.categories[catIdx].exercises.filter(e=>e.id!==exId);
  renderMain();
}
window.deleteRExercise=deleteRExercise;

// Reordena un ejercicio dentro de la misma categoría, subiéndolo o
// bajándolo una posición — para no tener que borrar y volver a escribir
// si te confundiste con el orden.
function moveRExercise(exId,blockId,sessionName,catIdx,direction) {
  const b=getRBlock(blockId,sessionName); if(!b) return;
  const arr=b.categories[catIdx].exercises;
  const idx=arr.findIndex(e=>e.id===exId);
  if(idx<0) return;
  const newIdx=idx+direction;
  if(newIdx<0||newIdx>=arr.length) return;
  [arr[idx],arr[newIdx]]=[arr[newIdx],arr[idx]];
  renderMain();
}
window.moveRExercise=moveRExercise;

function moveRoutineBlock(blockId, sessionName, direction) {
  const arr = S.editingRoutine?.sessions?.[sessionName]; if(!arr) return;
  const idx = arr.findIndex(b=>b.id===blockId);
  if(idx<0) return;
  const newIdx = idx+direction;
  if(newIdx<0||newIdx>=arr.length) return;
  [arr[idx],arr[newIdx]] = [arr[newIdx],arr[idx]];
  renderMain();
}
window.moveRoutineBlock = moveRoutineBlock;

// El orden de los "días" (sesiones) se recalculaba solo (por número o por
// día de semana) y no se podía fijar a mano. Guardamos un orden explícito
// en la rutina — se inicializa con el orden calculado la primera vez, y de
// ahí en más el admin lo puede reacomodar libremente. Si se agrega un día
// nuevo, se suma al final; si se borra uno, se saca de la lista.
function getOrderedSessionNames(routine) {
  const allNames = sortSessionNames(Object.keys(routine.sessions||{}));
  // Si TODOS los nombres son días reales de la semana (Lunes, Martes...), el
  // orden calendario es el único que tiene sentido — un sessionOrder manual
  // viejo (guardado con las flechitas ‹ › antes de este fix, o con el orden
  // en que se cargaron los días) no debe poder poner Jueves antes que Lunes.
  // El reordenamiento manual queda reservado para nombres genéricos (Día 1,
  // Bloque A...) donde no hay un orden natural que el calendario pueda dar.
  const allWeekdays = allNames.every(n => WEEKDAY_ORDER[n.trim().toLowerCase()] !== undefined);
  if (allWeekdays) return allNames;
  if(!routine.sessionOrder || !Array.isArray(routine.sessionOrder)) return allNames;
  const order = routine.sessionOrder.filter(n=>allNames.includes(n));
  allNames.forEach(n=>{ if(!order.includes(n)) order.push(n); });
  return order;
}
window.getOrderedSessionNames = getOrderedSessionNames;

function moveRoutineDay(sessionName, direction) {
  const routine = S.editingRoutine; if(!routine) return;
  const current = getOrderedSessionNames(routine);
  if(!routine.sessionOrder) routine.sessionOrder = current;
  const arr = routine.sessionOrder;
  const idx = arr.indexOf(sessionName);
  if(idx<0) return;
  const newIdx = idx+direction;
  if(newIdx<0||newIdx>=arr.length) return;
  [arr[idx],arr[newIdx]] = [arr[newIdx],arr[idx]];
  renderMain();
}
window.moveRoutineDay = moveRoutineDay;

function openRoutineLib(blockId,sessionName,catIdx) {
  S.libTarget={blockId,catIdx,sessionName,isRoutine:true};
  S.activeFilters=new Set();
  document.getElementById('lib-search').value='';
  renderLibFilters();
  renderLibList();
  S._newExTags = new Set();
  renderTagChipPicker('lib-new-tags-picker','_newExTags');
  document.getElementById('lib-overlay').classList.add('open');
}
window.openRoutineLib=openRoutineLib;

async function saveRoutineToFirestore() {
  const r=S.editingRoutine; if(!r) return;
  try {
    // Clean _open/_editing flags before saving
    const toSave=JSON.parse(JSON.stringify(r));
    const clean=obj=>{
      if(Array.isArray(obj)) obj.forEach(clean);
      else if(obj&&typeof obj==='object') { delete obj._open; delete obj._editing; Object.values(obj).forEach(clean); }
    };
    clean(toSave);
    await setDoc(doc(db,'routines',r.id), toSave);
    // Update local list
    const idx=S.routines.findIndex(x=>x.id===r.id);
    if(idx>=0) S.routines[idx]=JSON.parse(JSON.stringify(toSave));
    else S.routines.push(JSON.parse(JSON.stringify(toSave)));
    showToast('✓ Rutina guardada');
  } catch(e) { showToast('Error al guardar: '+e.message); }
}
window.saveRoutineToFirestore=saveRoutineToFirestore;

// ══════════════════════════════════════════════════════════════
// ── MÓDULO DE EVALUACIONES ────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const EVAL_TESTS = [
  { id:'cmj',     label:'CMJ',                    unit:'cm', desc:'Countermovement Jump' },
  { id:'sj',      label:'SJ',                     unit:'cm', desc:'Squat Jump' },
  { id:'abalakov', label:'Abalakov',               unit:'cm', desc:'CMJ con brazos libres' },
  { id:'saltoH',  label:'Salto Horizontal',        unit:'cm', desc:'Salto horizontal a dos piernas' },
  { id:'saltoAprox', label:'Salto de Aproximación', unit:'cm', desc:'Salto con carrera de aproximación (remate/bloqueo)' },
  { id:'cmj_der', label:'CMJ Unilateral Der.',     unit:'cm', desc:'CMJ una pierna derecha' },
  { id:'cmj_izq', label:'CMJ Unilateral Izq.',     unit:'cm', desc:'CMJ una pierna izquierda' },
];

// ── TABLA DE REFERENCIA — NIVEL DE SALTO VERTICAL ───────────────
// Tabla general de población (no diferenciada por deporte/edad/categoría a
// propósito) — el propio prep físico ya sabe ajustar la lectura según cada
// caso (un CMJ de 40cm no es lo mismo a los 15 años que a los 30). El SJ no
// tiene tabla publicada propia: se estima a partir del CMJ (SJ suele rondar
// 85-90% del CMJ, al no haber ciclo estiramiento-acortamiento) y se marca
// bien claro como estimado, no como dato validado.
const JUMP_LEVELS = ['Inicial/Joven','Intermedio','Avanzado','Profesional','Élite'];
const JUMP_LEVEL_COLORS = {
  'Inicial/Joven': {c:'var(--green)',  bg:'var(--green-dim)'},
  'Intermedio':    {c:'var(--amber)',  bg:'var(--amber-dim)'},
  'Avanzado':      {c:'var(--warm)',   bg:'var(--warm-dim)'},
  'Profesional':   {c:'var(--red)',    bg:'var(--red-dim)'},
  'Élite':         {c:'var(--purple)', bg:'var(--purple-dim)'},
};
const JUMP_BENCHMARKS = {
  cmj: { label:'CMJ', estimated:false, bands:[
    {level:'Inicial/Joven', min:0,  max:34, text:'25 – 34 cm'},
    {level:'Intermedio',    min:35, max:44, text:'35 – 44 cm'},
    {level:'Avanzado',      min:45, max:54, text:'45 – 54 cm'},
    {level:'Profesional',   min:55, max:64, text:'55 – 64 cm'},
    {level:'Élite',         min:65, max:Infinity, text:'65 – 70+ cm'},
  ]},
  // SJ estimado a partir de las mismas bandas de CMJ, pero con un % que baja
  // a medida que sube el nivel: cuanto más alto salta un atleta en CMJ, más
  // de esa altura suele venir del ciclo estiramiento-acortamiento (elasticidad)
  // y no de fuerza concéntrica pura — así que la brecha SJ vs. CMJ tiende a
  // ser mayor en los niveles más altos. Hasta Avanzado: 87%. Profesional: 84%.
  // Élite: 80%. El techo de cada banda se arma contra el piso de la
  // siguiente (no se calcula el propio techo con el % de esa banda) para que
  // no queden bandas superpuestas entre Profesional y Élite.
  sj: { label:'SJ (estimado)', estimated:true, bands:[
    {level:'Inicial/Joven', min:0,  max:29, text:'22 – 29 cm'},
    {level:'Intermedio',    min:30, max:38, text:'30 – 38 cm'},
    {level:'Avanzado',      min:39, max:45, text:'39 – 45 cm'},
    {level:'Profesional',   min:46, max:51, text:'46 – 51 cm'},
    {level:'Élite',         min:52, max:Infinity, text:'52 – 56+ cm'},
  ]},
  abalakov: { label:'Abalakov', estimated:false, bands:[
    {level:'Inicial/Joven', min:0,  max:39, text:'30 – 39 cm'},
    {level:'Intermedio',    min:40, max:49, text:'40 – 49 cm'},
    {level:'Avanzado',      min:50, max:59, text:'50 – 59 cm'},
    {level:'Profesional',   min:60, max:74, text:'60 – 74 cm'},
    {level:'Élite',         min:75, max:Infinity, text:'75 – 80+ cm'},
  ]},
  saltoAprox: { label:'Salto de Aproximación', estimated:false, bands:[
    {level:'Inicial/Joven', min:0,  max:49, text:'35 – 49 cm'},
    {level:'Intermedio',    min:50, max:59, text:'50 – 59 cm'},
    {level:'Avanzado',      min:60, max:69, text:'60 – 69 cm'},
    {level:'Profesional',   min:70, max:89, text:'70 – 89 cm'},
    {level:'Élite',         min:90, max:Infinity, text:'90 – 110+ cm'},
  ]},
};
window.JUMP_BENCHMARKS = JUMP_BENCHMARKS;

// Nivel al que corresponde un valor de salto — se usa para el tag de color
// que acompaña al número (ej. "34cm · Avanzado") en historial, ranking, etc.
function getJumpLevel(testId, value) {
  const def = JUMP_BENCHMARKS[testId];
  if(!def || value==null || isNaN(value)) return null;
  // Las bandas están en cm enteros, pero los valores reales vienen con
  // decimales (ej. 47.7) — sin redondear antes, un valor así caía en el
  // "hueco" entre el techo de una banda (47) y el piso de la siguiente (48)
  // y el .find() no encontraba ninguna banda, así que por error terminaba
  // siempre cayendo en la última (Élite), sin importar el valor real.
  const rounded = Math.round(value);
  const band = def.bands.find(b=>rounded>=b.min && rounded<=b.max) || def.bands[def.bands.length-1];
  return { level:band.level, ...JUMP_LEVEL_COLORS[band.level] };
}
window.getJumpLevel = getJumpLevel;

// Chip clickeable con el nivel, que abre la tabla completa para que quien no
// entienda de dónde sale "Avanzado" pueda ir a ver la referencia.
function jumpLevelTagHtml(testId, value) {
  const lv = getJumpLevel(testId, value);
  if(!lv) return '';
  return `<span onclick="event.stopPropagation();openInfoModal('jumpTable')" style="cursor:pointer;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${lv.bg};color:${lv.c};white-space:nowrap">${lv.level}</span>`;
}
window.jumpLevelTagHtml = jumpLevelTagHtml;

function buildJumpBenchmarkTableHtml() {
  const rows = ['sj','cmj','abalakov','saltoAprox'].map(id=>JUMP_BENCHMARKS[id]);
  let html = `<p style="margin-bottom:12px">Tabla general de población — no diferenciada por deporte, edad o categoría. Usala como referencia amplia, no como corte exacto: un mismo centímetro no significa lo mismo a los 15 años que a los 30.</p>`;
  html += `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;text-align:center">
    <thead><tr>
      <th style="padding:6px 8px;text-align:left;background:var(--teal-dim);color:var(--teal)">Tipo de salto</th>
      ${JUMP_LEVELS.map(lv=>`<th style="padding:6px 8px;background:${JUMP_LEVEL_COLORS[lv].bg};color:${JUMP_LEVEL_COLORS[lv].c};white-space:nowrap">${lv}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${rows.map(r=>`<tr>
        <td style="padding:6px 8px;text-align:left;font-weight:700;background:var(--blue-dim);color:var(--blue);white-space:nowrap">${r.label}</td>
        ${r.bands.map(b=>`<td style="padding:6px 8px;background:${JUMP_LEVEL_COLORS[b.level].bg};color:${JUMP_LEVEL_COLORS[b.level].c};font-weight:600;white-space:nowrap">${b.text}</td>`).join('')}
      </tr>`).join('')}
    </tbody>
  </table></div>`;
  return html;
}
window.buildJumpBenchmarkTableHtml = buildJumpBenchmarkTableHtml;
INFO_LEGENDS.jumpTable = { title:'Nivel de Salto Vertical — tabla de referencia', html: buildJumpBenchmarkTableHtml() };

// Tests de fuerza máxima (1RM). Reutilizan el mismo campo "height" que los tests
// de salto por debajo (para poder reusar renderEvalHistory/drawEvalCharts sin
// duplicar lógica) — acá representa kilos, no centímetros.
const STRENGTH_TESTS = [
  { id:'rm_press_banca',      label:'Press de banca',      unit:'kg', desc:'1RM' },
  { id:'rm_peso_muerto',      label:'Peso muerto',         unit:'kg', desc:'1RM' },
  { id:'rm_sentadilla',       label:'Sentadilla',          unit:'kg', desc:'1RM' },
  { id:'rm_cargada_potencia', label:'Cargada de potencia', unit:'kg', desc:'1RM' },
];

function setEvalCategory(cat) {
  S.evalCategory = cat;
  S.evalView = 'entry';
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.setEvalCategory = setEvalCategory;

// ══════════════════════════════════════════════════════════════
// ── TEST DE SALTABILIDAD ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function renderEvals() {
  const isDesktop = window.innerWidth >= 900;

  // Auto-load athletes list if admin hasn't loaded it yet
  if(S.isAdmin && !S.adminAthletes.length && !S._evalAthletesLoading) {
    S._evalAthletesLoading = true;
    getDocs(collection(db,'users')).then(snap=>{
      S.adminAthletes = snap.docs.map(d=>({uid:d.id,...d.data()})).filter(u=>u.email!==ADMIN_EMAIL);
      S._evalAthletesLoading = false;
      renderMain();
      setTimeout(drawEvalCharts,80);
    }).catch(()=>{ S._evalAthletesLoading=false; });
  }

  // Cuando estamos DENTRO de un equipo o de un atleta puntual (evalScopeUids seteado),
  // nunca hay que caer en 'self' — eso mostraría las evaluaciones propias del admin
  // disfrazadas de datos del grupo. El fallback a 'self' solo aplica en la vista general.
  const edata = S.evalScopeUids
    ? getAthleteEvals(S.evalAthleteId || '')
    : getAthleteEvals(S.evalAthleteId || 'self');
  const view = S.evalView||'entry';

  // Athlete selector (admin only) — strictly scopes which athlete's data is shown/edited
  let athleteSel = '';
  if(S.isAdmin) {
    const pool = S.evalScopeUids ? S.adminAthletes.filter(a=>S.evalScopeUids.includes(a.uid)) : S.adminAthletes;
    // Jugadores del roster que todavía no se registraron, pero pertenecen a
    // este mismo equipo — se pueden elegir igual para cargarles tests.
    const pendingPool = (S.teamView && S.pendingAthletes)
      ? S.pendingAthletes.filter(p=>p.teamId===S.teamView.id)
      : [];
    if (S.evalScopeUids) {
      // Estamos dentro de Equipos o Atletas: sin "Yo mismo", solo el grupo acotado
      const registeredOpts = pool.map(a=>'<option value="'+a.uid+'" '+(S.evalAthleteId===a.uid?'selected':'')+'>'+(a.name||a.email)+'</option>').join('');
      const pendingOpts = pendingPool.map(p=>'<option value="pending:'+p.id+'" '+(S.evalAthleteId===('pending:'+p.id)?'selected':'')+'>'+p.name+' (sin registrar)</option>').join('');
      athleteSel = (pool.length || pendingPool.length)
        ? '<select class="eval-inp" onchange="selectEvalAthlete(this.value)" style="cursor:pointer;max-width:220px">'
          + registeredOpts + pendingOpts
          + '</select>'
        : '<div style="font-size:12px;color:var(--text3)">Sin atletas en este grupo todavía</div>';
    } else if (S.adminAthletes.length) {
      const opts = ['<option value="self">Yo mismo</option>']
        .concat(S.adminAthletes.map(a=>'<option value="'+a.uid+'" '+(S.evalAthleteId===a.uid?'selected':'')+'>'+(a.name||a.email)+'</option>'));
      athleteSel = '<select class="eval-inp" onchange="selectEvalAthlete(this.value)" style="cursor:pointer;max-width:220px">'+opts.join('')+'</select>';
    }
  }

  const lastOf = id => { const r=sortEvalRecsByDate([...(edata[id]||[])]); return r.length ? r[r.length-1] : null; };

  // Selector de categoría: Saltabilidad (jump tests) vs Fuerza Máxima (1RM)
  const evalCat = S.evalCategory || 'saltabilidad';
  const catSwitcherHtml = `<div style="display:flex;gap:6px;margin-bottom:16px">
    <button class="snav-tab ${evalCat==='saltabilidad'?'active':''}" onclick="setEvalCategory('saltabilidad')">Saltabilidad</button>
    <button class="snav-tab ${evalCat==='fuerza'?'active':''}" onclick="setEvalCategory('fuerza')">Fuerza Máxima</button>
  </div>`;
  if(evalCat==='fuerza') return renderStrengthEvals(edata, athleteSel, catSwitcherHtml, isDesktop);

  const lCMJ=lastOf('cmj'), lSJ=lastOf('sj'), lAbal=lastOf('abalakov');
  const lDer=lastOf('cmj_der'), lIzq=lastOf('cmj_izq');
  const ice   = (lCMJ&&lSJ)   ? ((lCMJ.height-lSJ.height)/lSJ.height*100).toFixed(1) : null;
  const coord = (lCMJ&&lAbal) ? ((lAbal.height-lCMJ.height)/lCMJ.height*100).toFixed(1) : null;
  const asym  = (lDer&&lIzq)  ? (Math.abs(lDer.height-lIzq.height)/Math.max(lDer.height,lIzq.height)*100).toFixed(1) : null;
  // "Mejor CMJ" tiene que ser el máximo histórico, no el último cargado —
  // son cosas distintas (el índice elástico sí usa el último, porque refleja
  // el estado actual; esta tarjeta puntual es un récord personal).
  const cmjRecs = edata['cmj']||[];
  const bestCMJ = cmjRecs.length ? cmjRecs.reduce((best,r)=>r.height>best.height?r:best, cmjRecs[0]) : null;

  const currentAthleteName = getAthleteDisplayName(S.evalAthleteId);

  let html = '<div class="page-header"><div class="page-title">Test de Saltabilidad</div>'
    + '<div class="page-subtitle">Valoración neuromuscular · Índices elásticos y coordinación</div></div>';
  html += catSwitcherHtml;

  if(S.isAdmin) {
    html += '<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:var(--r);padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
      + '<div style="font-size:12px;font-weight:600;color:var(--accent-text);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">Atleta seleccionado</div>'
      + athleteSel
      + '<div style="font-size:13px;font-weight:600;color:var(--text)">'+currentAthleteName+'</div>'
      + '</div>';
  }

  // Tabs — role aware
  const evalTabs = S.isAdmin
    ? [{id:'entry',label:'Registrar salto'},{id:'history',label:'Historial'},{id:'compare',label:'Comparar atletas'}]
    : [{id:'history',label:'Mi historial'},{id:'team_compare',label:'Comparar en equipo'}];
  const activeView = evalTabs.find(t=>t.id===view) ? view : evalTabs[0].id;
  if(activeView !== view) S.evalView = activeView;

  const tabsHtml = evalTabs.map(t=>'<button class="snav-tab '+(activeView===t.id?'active':'')+'" onclick="switchEvalView(\''+t.id+'\')">'+t.label+'</button>').join('');
  html += '<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap">'+tabsHtml+'</div>';

  if(activeView==='entry') {
    html += renderEvalEntry(edata, lCMJ, lSJ, lAbal, lDer, lIzq, ice, coord, asym, isDesktop);
  } else if(activeView==='history') {
    html += renderEvalHistory(edata, isDesktop);
  } else if(activeView==='compare') {
    html += renderEvalCompare();
  } else if(activeView==='team_compare') {
    html += renderAthleteTeamCompare(edata);
  }

  return html;
}
window.renderEvals = renderEvals;

// ══════════════════════════════════════════════════════════════
// ── FUERZA MÁXIMA (1RM) ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════

function renderStrengthEvals(edata, athleteSel, catSwitcherHtml, isDesktop) {
  const currentAthleteName = getAthleteDisplayName(S.evalAthleteId);

  let html = '<div class="page-header"><div class="page-title">Fuerza Máxima</div>'
    + '<div class="page-subtitle">Tests de 1RM · Banca, peso muerto, sentadilla y cargada de potencia</div></div>';
  html += catSwitcherHtml;

  if(S.isAdmin) {
    html += '<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:var(--r);padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
      + '<div style="font-size:12px;font-weight:600;color:var(--accent-text);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">Atleta seleccionado</div>'
      + athleteSel
      + '<div style="font-size:13px;font-weight:600;color:var(--text)">'+currentAthleteName+'</div>'
      + '</div>';
  }

  const evalTabs = S.isAdmin
    ? [{id:'entry',label:'Registrar test'},{id:'history',label:'Historial'},{id:'compare',label:'Comparar atletas'}]
    : [{id:'history',label:'Mi historial'}];
  const view = S.evalView||'entry';
  const activeView = evalTabs.find(t=>t.id===view) ? view : evalTabs[0].id;
  if(activeView !== view) S.evalView = activeView;
  const tabsHtml = evalTabs.map(t=>'<button class="snav-tab '+(activeView===t.id?'active':'')+'" onclick="switchEvalView(\''+t.id+'\')">'+t.label+'</button>').join('');
  html += '<div style="display:flex;gap:6px;margin-bottom:20px;flex-wrap:wrap">'+tabsHtml+'</div>';

  if(activeView==='entry') html += renderStrengthEntry(edata);
  else if(activeView==='compare') html += renderEvalCompare();
  else html += renderEvalHistory(edata, isDesktop, STRENGTH_TESTS);

  return html;
}
window.renderStrengthEvals = renderStrengthEvals;

function renderStrengthEntry(edata) {
  const today = todayLocal();
  let html = `<div class="wellness-card">
    <div class="wellness-title">Registrar test de 1RM</div>
    <div class="wellness-sub">Cargá el máximo levantado en cada ejercicio — dejá en blanco los que no corresponda hoy</div>
    <div style="padding:14px 16px 0">
      <label class="eval-lbl">Fecha</label>
      <input class="eval-inp" type="date" id="einp-strength-date" value="${today}">
    </div>`;
  STRENGTH_TESTS.forEach(t=>{
    const recs=sortEvalRecsByDate([...(edata[t.id]||[])]);
    const last=recs.length?recs[recs.length-1]:null;
    html += `<div class="hooper-item">
      <div class="hooper-label">
        <span>${t.label}</span>
        ${last?`<span style="font-size:11px;color:var(--text3)">Último: ${last.height}kg · ${last.date}</span>`:''}
      </div>
      <input class="eval-inp" type="number" step="0.5" min="0" placeholder="kg" id="einp-strength-${t.id}">
    </div>`;
  });
  html += `<div style="padding:14px 16px"><button class="eval-submit" style="grid-column:unset" onclick="saveStrengthEvals()">Guardar test</button></div>
  </div>`;
  return html;
}
window.renderStrengthEntry=renderStrengthEntry;

async function saveStrengthEvals() {
  const date = document.getElementById('einp-strength-date')?.value || todayLocal();
  let saved=0;
  const uid = S.evalAthleteId||'self';
  for(const t of STRENGTH_TESTS) {
    const el=document.getElementById('einp-strength-'+t.id);
    if(!el||!el.value) continue;
    const v=parseFloat(el.value);
    if(isNaN(v)||v<=0) continue;
    const rec={date, height:v}; // "height" reutilizado con semántica de kg acá
    if(uid==='self') {
      if(!S.evals[t.id]) S.evals[t.id]=[];
      S.evals[t.id].push(rec);
      sortEvalRecsByDate(S.evals[t.id]);
      markEvalDirty(t.id);
    } else {
      if(!S._athleteEvalsCache) S._athleteEvalsCache={};
      if(!S._athleteEvalsCache[uid]) S._athleteEvalsCache[uid]={};
      if(!S._athleteEvalsCache[uid][t.id]) S._athleteEvalsCache[uid][t.id]=[];
      S._athleteEvalsCache[uid][t.id].push(rec);
      sortEvalRecsByDate(S._athleteEvalsCache[uid][t.id]);
    }
    await syncEvalToOneRM(uid, t.id, v);
    saved++;
  }
  if(!saved) { showToast('Ingresá al menos un valor'); return; }
  if(uid==='self') scheduleSave();
  else {
    try { await saveAthleteEvalsDoc(uid, S._athleteEvalsCache[uid]); }
    catch(e) { showToast('Error al guardar'); return; }
  }
  syncEvalsToAthleteObject(uid);
  showToast('✓ '+saved+' test'+(saved!==1?'s':'')+' guardado'+(saved!==1?'s':''));
  setTimeout(()=>{ if(S.currentView==='evals'){ renderMain(); setTimeout(drawEvalCharts,80);} }, 100);
}
window.saveStrengthEvals = saveStrengthEvals;

async function selectEvalAthlete(uid) {
  S.evalAthleteId = uid;
  await ensureAthleteEvalData(uid);
  renderMain();
  setTimeout(drawEvalCharts, 100);
}
window.selectEvalAthlete = selectEvalAthlete;

function renderEvalEntry(edata, lCMJ, lSJ, lAbal, lDer, lIzq, ice, coord, asym, isDesktop) {
  const cmjRecsEntry = edata['cmj']||[];
  const bestCMJ = cmjRecsEntry.length ? cmjRecsEntry.reduce((best,r)=>r.height>best.height?r:best, cmjRecsEntry[0]) : null;
  const sec = S.evalShowSecondary;
  let html = isDesktop ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">' : '';

  // LEFT: entry form
  html += '<div><div class="wellness-card"><div class="wellness-title">Entrada de datos</div>'
    + '<div class="wellness-sub">'+new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})+'</div>'
    + '<div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">';

  EVAL_TESTS.forEach(t=>{
    const last = sortEvalRecsByDate([...(edata[t.id]||[])]).slice(-1)[0];
    const fullWidth = (t.id==='saltoH'||t.id==='abalakov') ? 'full' : '';
    html += '<div class="eval-field '+fullWidth+'">'
      + '<label class="eval-lbl">'+t.label+' ('+t.unit+')</label>'
      + '<input class="eval-inp" type="number" step="0.1" placeholder="—" id="einp-height-'+t.id+'" value="'+(last?last.height:'')+'" style="text-align:center;font-size:18px;font-weight:700;padding:10px"></div>';
  });

  html += '<div class="eval-field full" style="margin-top:4px"><label class="eval-lbl">Fecha</label>'
    + '<input class="eval-inp" type="date" id="einp-date-all" value="'+todayLocal()+'"></div>';
  html += '<div class="eval-field full"><span class="eval-toggle-secondary" onclick="toggleEvalSecondary()">'
    + (sec?'▲ Ocultar':'▼ Mostrar')+' tiempo de vuelo y velocidad</span></div>';

  if(sec) {
    html += '<div class="eval-field"><label class="eval-lbl">T. vuelo CMJ (ms)</label><input class="eval-inp" type="number" id="einp-tof-cmj" placeholder="—"></div>';
    html += '<div class="eval-field"><label class="eval-lbl">Vel. CMJ (m/s)</label><input class="eval-inp" type="number" id="einp-vel-cmj" placeholder="—"></div>';
  }

  html += '</div><div style="padding:0 16px 16px"><button class="wellness-submit" onclick="saveAllEvals()">Procesar salto</button></div></div></div>';

  // RIGHT: metric cards + chart
  html += '<div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
  html += metricCardHtml('ÍNDICE ELÁSTICO', metricIconSvg('ice'), ice!==null?ice+'%':'-- %', ice?'var(--accent)':'var(--text3)', '(CMJ−SJ)/SJ · '+(lCMJ&&lSJ?'CMJ '+lCMJ.height+' · SJ '+lSJ.height:'Sin datos'), 'ice');
  html += metricCardHtml('COORD. DE BRAZOS', metricIconSvg('coord'), coord!==null?coord+'%':'-- %', coord?'var(--blue)':'var(--text3)', '(Abal−CMJ)/CMJ · '+(lCMJ&&lAbal?'Abal '+lAbal.height+' · CMJ '+lCMJ.height:'Sin datos'), 'coord');
  html += metricCardHtml('ASIMETRÍA UNILAT.', metricIconSvg('asym'), asym!==null?asym+'%':'-- %', asym?(parseFloat(asym)>10?'var(--red)':'var(--green)'):'var(--text3)', (lDer&&lIzq?'Der '+lDer.height+' · Izq '+lIzq.height:'Sin datos'), 'asym');
  html += metricCardHtml('MEJOR CMJ', metricIconSvg('bestcmj'), bestCMJ?bestCMJ.height+' cm':'--', 'var(--text)', bestCMJ?'Récord personal · '+bestCMJ.date+' '+jumpLevelTagHtml('cmj',bestCMJ.height):'Sin datos');
  html += '</div>';

  html += '</div>';

  if(isDesktop) html += '</div>';
  return html;
}

function metricCardHtml(label, icon, value, color, sub, infoKey) {
  // El label del ícono redondo y el texto+"?" van agrupados cada uno en su
  // propio span — así .metric-card-label (que es flex) siempre reparte
  // exactamente 2 items (space-between), y el "?" nunca queda flotando
  // suelto entre el texto y el ícono en pantallas angostas.
  return '<div class="metric-card"><div class="metric-card-label"><span class="metric-card-label-txt">'+label+(infoKey?' '+infoBtn(infoKey):'')+'</span><span class="metric-card-icon">'+icon+'</span></div>'
    + '<div class="metric-card-value" style="font-size:28px;color:'+color+'">'+value+'</div>'
    + '<div class="metric-card-sub">'+sub+'</div></div>';
}

function renderEvalHistory(edata, isDesktop, testList) {
  if(!(S.evalHidden instanceof Set)) S.evalHidden = new Set();

  const includeAsym = !testList; // la asimetría solo aplica a los tests de salto
  const histTests = testList
    ? testList
    : EVAL_TESTS.concat([{id:'asym', label:'Asimetría Unilateral', unit:'%', desc:'% diferencia entre CMJ pierna derecha e izquierda'}]);

  let html = isDesktop ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">' : '';

  // Los mismos índices calculados que aparecen en "Registrar test" — también
  // acá, para no tener que ir y volver entre pestañas para verlos.
  if(includeAsym) {
    const lastOfH = id => { const r=sortEvalRecsByDate([...(edata[id]||[])]); return r.length ? r[r.length-1] : null; };
    const lCMJ=lastOfH('cmj'), lSJ=lastOfH('sj'), lAbal=lastOfH('abalakov');
    const lDer=lastOfH('cmj_der'), lIzq=lastOfH('cmj_izq');
    const ice   = (lCMJ&&lSJ)   ? ((lCMJ.height-lSJ.height)/lSJ.height*100).toFixed(1) : null;
    const coord = (lCMJ&&lAbal) ? ((lAbal.height-lCMJ.height)/lCMJ.height*100).toFixed(1) : null;
    const asymH = (lDer&&lIzq)  ? (Math.abs(lDer.height-lIzq.height)/Math.max(lDer.height,lIzq.height)*100).toFixed(1) : null;
    const cmjRecsH = edata['cmj']||[];
    const bestCMJH = cmjRecsH.length ? cmjRecsH.reduce((best,r)=>r.height>best.height?r:best, cmjRecsH[0]) : null;
    html += `<div style="grid-column:${isDesktop?'1/-1':'auto'};display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px">`
      + metricCardHtml('ÍNDICE ELÁSTICO', metricIconSvg('ice'), ice!==null?ice+'%':'-- %', ice?'var(--accent)':'var(--text3)', '(CMJ−SJ)/SJ · '+(lCMJ&&lSJ?'CMJ '+lCMJ.height+' · SJ '+lSJ.height:'Sin datos'), 'ice')
      + metricCardHtml('COORD. DE BRAZOS', metricIconSvg('coord'), coord!==null?coord+'%':'-- %', coord?'var(--blue)':'var(--text3)', '(Abal−CMJ)/CMJ · '+(lCMJ&&lAbal?'Abal '+lAbal.height+' · CMJ '+lCMJ.height:'Sin datos'), 'coord')
      + metricCardHtml('ASIMETRÍA UNILAT.', metricIconSvg('asym'), asymH!==null?asymH+'%':'-- %', asymH?(parseFloat(asymH)>10?'var(--red)':'var(--green)'):'var(--text3)', (lDer&&lIzq?'Der '+lDer.height+' · Izq '+lIzq.height:'Sin datos'), 'asym')
      + metricCardHtml('MEJOR CMJ', metricIconSvg('bestcmj'), bestCMJH?bestCMJH.height+' cm':'--', 'var(--text)', bestCMJH?'Récord personal · '+bestCMJH.date+' '+jumpLevelTagHtml('cmj',bestCMJH.height):'Sin datos')
      + '</div>';
  }

  histTests.forEach(t=>{
    const isHidden = S.evalHidden.has(t.id);
    let recsFwd, recs, last, isAsym = (t.id==='asym');

    if(isAsym) {
      const der = edata['cmj_der']||[], izq = edata['cmj_izq']||[];
      const dates = [...new Set([...der.map(r=>r.date), ...izq.map(r=>r.date)])].sort();
      recsFwd = dates.map(date=>{
        const d = der.find(r=>r.date===date), i = izq.find(r=>r.date===date);
        if(!d||!i) return null;
        const a = Math.abs(d.height-i.height)/Math.max(d.height,i.height)*100;
        return {date, height: parseFloat(a.toFixed(1)), der: d.height, izq: i.height};
      }).filter(Boolean);
      recs = recsFwd.slice().reverse();
    } else {
      recsFwd = sortEvalRecsByDate([...(edata[t.id]||[])]);
      recs = recsFwd.slice().reverse();
    }
    last = recs[0]||null;

    html += '<div id="eval-card-'+t.id+'" style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);margin-bottom:'+(isDesktop?'0':'12px')+';overflow:hidden">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px">';
    html += '<div><div style="font-size:14px;font-weight:600">'+t.label+'</div>';
    if(last) {
      const lcolor = isAsym ? (last.height>10?'var(--red)':last.height>5?'var(--amber)':'var(--green)') : 'var(--accent)';
      html += '<div style="font-size:13px;font-weight:700;color:'+lcolor+';margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
        + '<span>'+last.height+t.unit+(isAsym?' · Der:'+last.der+' / Izq:'+last.izq:'')+'</span>'
        + jumpLevelTagHtml(t.id,last.height) + '</div>';
    } else {
      html += '<div style="font-size:12px;color:var(--text3);margin-top:2px">Sin registros</div>';
    }
    html += '</div>';
    html += '<button class="eval-toggle-btn" onclick="toggleEvalChart(\''+t.id+'\')" style="background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rxs);padding:5px 12px;font-size:11px;font-weight:600;color:var(--text2);cursor:pointer;font-family:inherit;white-space:nowrap">'
      + (isHidden?'▼ Ver':'▲ Ocultar') + '</button>';
    html += '</div>';

    html += '<div class="eval-hist-body" style="display:'+(isHidden?'none':'block')+';padding:0 16px 14px;border-top:1px solid var(--border)">';
    if(recsFwd.length>=1) {
      html += '<div style="margin:12px 0 10px;position:relative"><canvas id="chart-hist-'+t.id+'"></canvas></div>';
    }
    if(recs.length) {
      const maxHeight = (!isAsym && recsFwd.length) ? Math.max(...recsFwd.map(r=>r.height)) : null;
      recs.slice(0,5).forEach((r,i)=>{
        const isPR = maxHeight!==null && r.height===maxHeight;
        html += '<div class="eval-record"><div>'
          + '<div class="eval-record-main" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
          + '<span>'+r.height+t.unit+(isAsym?' · Der:'+r.der+' / Izq:'+r.izq:'')+(isPR?' <span style="color:var(--warm);font-size:11px;font-weight:700">🏆 PR</span>':'')+'</span>'
          + jumpLevelTagHtml(t.id,r.height) + '</div>'
          + '<div class="eval-record-date">'+r.date+(r.tof?' · '+r.tof+'ms':'')+'</div></div>';
        // Solo el admin puede borrar un test ya cargado — un jugador lo podía
        // borrar sin querer (un toque de más en el "×") y no había forma de
        // recuperarlo. El admin sigue pudiendo corregir un dato mal cargado.
        if(!isAsym && S.isAdmin) html += '<span class="eval-record-del" onclick="deleteEvalRecord(\''+t.id+'\','+(recsFwd.length-1-i)+')">×</span>';
        html += '</div>';
      });
    } else {
      html += '<div class="eval-no-data">Sin registros aún</div>';
    }
    html += '</div></div>';
  });

  if(isDesktop) html += '</div>';
  return html;
}

// Antes esto era UN gráfico de barras por test (CMJ, SJ, Abalakov...),
// cambiando de a uno con pestañas — con un plantel de 12-16 jugadores el
// gráfico se estiraba a 500-600px de alto y encima solo mostraba UNA métrica
// a la vez, así que comparar dos tests obligaba a ir y volver entre
// pestañas. Ahora es una tabla compacta: una fila por atleta, una columna
// por cada test — todas las métricas se ven juntas, cada celda coloreada
// por tercio (igual criterio que antes, pero por columna), y el alto total
// no depende de cuántos tests haya, solo de cuántos atletas — mucho más
// chico y entra en pantalla sin scrollear de más.
function renderEvalCompare() {
  if(!S.adminAthletes.length) {
    return '<div style="text-align:center;padding:30px;color:var(--text3)">'
      + '<div style="margin-bottom:10px">Cargando atletas...</div>'
      + '<button class="abtn abtn-p" onclick="loadEvalAthletes()">Cargar atletas</button></div>';
  }

  const testList = S.evalCategory==='fuerza' ? STRENGTH_TESTS : EVAL_TESTS;

  const athletes = S.evalScopeUids
    ? S.adminAthletes.filter(a=>S.evalScopeUids.includes(a.uid))
    : [{uid:'self', name:'Yo (admin)', email:''}].concat(S.adminAthletes);

  // Un valor por atleta por test (último registro), más la posición para
  // poder agrupar/filtrar igual que antes.
  const perAthlete = athletes.map(a=>{
    const ed = a.uid==='self' ? S.evals : (S._athleteEvalsCache?.[a.uid]||{});
    const values = {};
    testList.forEach(t=>{
      const recs = sortEvalRecsByDate([...(ed[t.id]||[])]);
      values[t.id] = recs.length ? recs[recs.length-1].height : null;
    });
    return {name: a.name||a.email||'Atleta', position: a.position||null, values};
  });
  const withAnyData = perAthlete.filter(a=>testList.some(t=>a.values[t.id]!=null));
  const withoutAnyData = perAthlete.filter(a=>!testList.some(t=>a.values[t.id]!=null));

  const positions = [...new Set(withAnyData.map(d=>d.position).filter(Boolean))];
  const groupBy = positions.length ? (S.evalCompareGroupBy||'none') : 'none';
  const groupPos = S.evalCompareGroupPosition||'all';

  // Agrupado por puesto: una fila por puesto, cada test promediado.
  let rows;
  if(groupBy==='position') {
    const pool = groupPos==='all' ? withAnyData : withAnyData.filter(d=>d.position===groupPos);
    if(groupPos==='all') {
      const byPos = {};
      pool.forEach(d=>{ const p=d.position||'Sin puesto'; (byPos[p]=byPos[p]||[]).push(d); });
      rows = Object.entries(byPos).map(([pos,members])=>{
        const values = {};
        testList.forEach(t=>{
          const vals = members.map(m=>m.values[t.id]).filter(v=>v!=null);
          values[t.id] = vals.length ? Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10 : null;
        });
        return {name: pos, values};
      });
    } else {
      rows = pool;
    }
  } else {
    rows = withAnyData;
  }

  let html = '<div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);overflow:hidden">';
  html += '<div style="padding:14px 16px;border-bottom:1px solid var(--border)">';
  html += '<div style="font-size:15px;font-weight:600">Comparación de atletas</div>';
  html += '<div style="font-size:12px;color:var(--text3);margin-top:2px">Último registro de cada test, por atleta</div></div>';

  if(positions.length) {
    html += '<div style="padding:12px 16px;border-bottom:1px solid var(--border)">'
      + '<div style="font-size:11px;color:var(--text3);margin-bottom:6px">Elegí cómo comparar:</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<select class="abtn" onchange="setEvalCompareGroupBy(this.value)">'
      +   '<option value="none" '+(groupBy==='none'?'selected':'')+'>Todos los atletas juntos</option>'
      +   '<option value="position" '+(groupBy==='position'?'selected':'')+'>Agrupado por puesto</option>'
      + '</select>'
      + (groupBy==='position' ? '<select class="abtn" onchange="setEvalCompareGroupPosition(this.value)">'
          + '<option value="all" '+(groupPos==='all'?'selected':'')+'>Promedio de cada puesto</option>'
          + positions.map(p=>'<option value="'+p+'" '+(groupPos===p?'selected':'')+'>Solo '+p+'</option>').join('')
          + '</select>' : '')
      + '</div></div>';
  }

  html += '<div style="padding:12px 16px">';

  // Un gráfico de barras horizontales por test — no una tabla de números —
  // así se ve de un vistazo quién está arriba y quién abajo en cada métrica,
  // sin tener que leer y comparar cifras columna por columna.
  const anyTestHasData = rows.length && testList.some(t=>rows.some(r=>r.values[t.id]!=null));
  if(anyTestHasData) {
    testList.forEach(t=>{
      const vals = rows.map(r=>({name:r.name, v:r.values[t.id]})).filter(x=>x.v!=null);
      if(!vals.length) return;
      vals.sort((a,b)=>b.v-a.v);
      const colors = tercileColors(vals.map(x=>x.v));
      const maxV = Math.max(...vals.map(x=>x.v)) * 1.05;
      html += '<div style="margin-bottom:18px">'
        + '<div style="font-size:12px;font-weight:700;margin-bottom:8px">'+t.label+' <span style="font-weight:400;color:var(--text3)">('+t.unit+')</span></div>';
      vals.forEach((x,i)=>{
        const pct = maxV>0 ? Math.max(4,(x.v/maxV)*100) : 0;
        const color = colors[i];
        html += '<div style="margin-bottom:6px">'
          + '<div style="display:flex;justify-content:space-between;gap:8px;font-size:11.5px;margin-bottom:2px">'
          + '<span style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+x.name+'</span>'
          + '<span style="font-weight:700;color:'+color+';flex-shrink:0">'+x.v+'</span></div>'
          + '<div style="height:7px;background:var(--bg3);border-radius:4px;overflow:hidden">'
          + '<div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:4px"></div></div>'
          + '</div>';
      });
      html += '</div>';
    });
    html += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--text3);margin-top:4px">'
      + '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:50%;background:#22c55e;display:inline-block"></span>Tercio superior</span>'
      + '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:50%;background:#3b7dd8;display:inline-block"></span>Medio</span>'
      + '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:9px;height:9px;border-radius:50%;background:#ef4444;display:inline-block"></span>A reforzar</span>'
      + '</div>';
  } else {
    html += '<div class="eval-no-data">Sin datos registrados.<br><span style="font-size:12px">Presioná Actualizar después de cargar evaluaciones.</span></div>';
  }
  if(withoutAnyData.length) {
    html += '<div style="font-size:11px;color:var(--text3);margin-top:8px">Sin ningún test cargado: '+withoutAnyData.map(d=>d.name).join(', ')+'</div>';
  }
  html += '<button class="abtn abtn-p" style="width:100%;margin-top:12px" onclick="loadAllAthleteEvals()">↻ Actualizar datos de atletas</button>';
  html += '</div></div>';
  return html;
}
window.renderEvalCompare = renderEvalCompare;

function renderAthleteTeamCompare(myData) {
  const myTeam = (S.teams||[]).find(t=>(t.players||[]).some(p=>p===S.userData?.name || p===S.userData?.email));
  let html = '<div style="background:var(--bg2);border:1.5px solid var(--border2);box-shadow:0 1px 3px rgba(18,21,28,0.06);border-radius:var(--r);padding:16px;margin-bottom:16px">'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Comparación con el equipo</div>';

  if(!myTeam) {
    html += '<div class="eval-no-data">No estás registrado en ningún equipo.</div></div>';
    return html;
  }

  const teamAvgs = myTeam.evalAverages || {};
  if(!Object.keys(teamAvgs).length) {
    html += '<div style="font-size:12px;color:var(--text3);margin-bottom:4px">'+myTeam.name+'</div>'
      + '<div class="eval-no-data">Todavía no hay un promedio del equipo calculado. Se actualiza solo la próxima vez que tu entrenador abra las estadísticas del equipo.</div></div>';
    return html;
  }

  // Si el jugador tiene puesto cargado y ese puesto tiene datos de al menos
  // 2 compañeros (ver syncTeamEvalAverages), comparamos contra el promedio
  // de SU puesto en vez del equipo entero — es la comparación que de verdad
  // le sirve (un arquero no se compara contra un pivot). Si no hay ese dato
  // todavía, cae de vuelta al promedio general sin romper nada.
  const myPosition = S.userData?.position || null;
  const posAvgs = myPosition ? (myTeam.evalAveragesByPosition?.[myPosition] || null) : null;
  const avgs = posAvgs || teamAvgs;
  const avgLabel = posAvgs ? ('promedio de '+myPosition) : 'promedio del equipo';

  html += '<div style="font-size:12px;color:var(--text3);margin-bottom:14px">'+myTeam.name+(posAvgs?' · '+myPosition:'')+'</div>';

  html += '<div style="height:250px;position:relative;margin-bottom:8px"><canvas id="player-team-radar-chart"></canvas></div>'
    + '<div style="font-size:11px;color:var(--text3);margin-bottom:16px">Cada eje es el % respecto al mejor valor del equipo — línea llena: vos. Punteada: '+avgLabel+'.</div>';

  html += '<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Tu mejor marca vs. '+avgLabel+'</div>';

  EVAL_TESTS.filter(t=>t.id!=='cmj_der' && t.id!=='cmj_izq').forEach(t=>{
    const avg = avgs[t.id];
    const myRecs = myData[t.id]||[];
    const myBest = myRecs.length ? Math.max(...myRecs.map(r=>r.height)) : null;
    if(myBest==null && avg==null) return;
    // Escala visual relativa a lo más alto entre mi marca y el promedio (con
    // margen), en vez de un techo fijo inventado — así la barra siempre
    // representa la proporción real entre los dos números, sea cm o kg.
    const ceiling = Math.max(myBest||0, avg||0, 0.01) * 1.15;
    const myPct = myBest!=null ? Math.min(100, (myBest/ceiling)*100) : 0;
    const avgPct = avg!=null ? Math.min(100, (avg/ceiling)*100) : 0;
    html += '<div style="margin-bottom:14px">'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">'
      + '<span style="font-weight:500">'+t.label+'</span>'
      + '<span style="color:var(--text3)">'+(avg!=null?avgLabel+' '+avg+t.unit:'sin promedio')+'</span></div>'
      + '<div style="position:relative;height:8px;background:var(--bg3);border-radius:4px;overflow:visible;margin-bottom:2px">'
      + '<div style="height:100%;background:var(--accent);border-radius:4px;width:'+myPct+'%"></div>'
      + (avg!=null?'<div style="position:absolute;top:-3px;left:'+avgPct+'%;width:2px;height:14px;background:var(--text2)" title="'+avgLabel+'"></div>':'')
      + '</div>'
      + '<div style="text-align:right;font-size:12px;font-weight:700;color:var(--accent-text)">'+(myBest!=null?myBest+t.unit:'sin datos')+'</div>'
      + '</div>';
  });

  html += '</div>';
  return html;
}
window.renderAthleteTeamCompare = renderAthleteTeamCompare;

// Radar del jugador en "Comparar en equipo" — misma idea visual que el radar
// que ve el admin (drawTeamRadarChart), pero sin necesitar los datos crudos
// de los compañeros (el atleta no tiene permiso para leerlos uno por uno):
// se apoya únicamente en los agregados que el admin ya sincroniza en el
// propio documento del equipo (evalMax, evalAverages/evalAveragesByPosition).
function drawPlayerTeamRadar(myData, team, myPosition) {
  if(typeof Chart==='undefined') return;
  const canvas = document.getElementById('player-team-radar-chart');
  if(!canvas) return;

  const teamMax = team.evalMax || {};
  const posAvgs = myPosition ? (team.evalAveragesByPosition?.[myPosition] || null) : null;
  const avgs = posAvgs || team.evalAverages || {};
  const avgLabel = posAvgs ? 'Promedio de tu puesto' : 'Promedio del equipo';

  const bestOf = (id) => { const r=myData[id]||[]; return r.length ? Math.max(...r.map(x=>x.height)) : null; };
  const pct = (raw,id) => { const max=teamMax[id]; return (raw!=null && max) ? Math.min(100, Math.round((raw/max)*100)) : 0; };

  const rawA = RADAR_METRICS.map(m=>bestOf(m.id));
  const rawB = RADAR_METRICS.map(m=>avgs[m.id]!=null ? avgs[m.id] : null);
  const valuesA = RADAR_METRICS.map((m,i)=>pct(rawA[i],m.id));
  const valuesB = RADAR_METRICS.map((m,i)=>pct(rawB[i],m.id));

  const datasets = [
    { label:'Vos', data:valuesA, backgroundColor:'rgba(36,59,107,0.15)', borderColor:'#243B6B', borderWidth:2, pointBackgroundColor:'#243B6B', pointRadius:3, _raw:rawA },
    { label:avgLabel, data:valuesB, backgroundColor:'rgba(122,131,148,0.06)', borderColor:cssVar('--text3','#7A8394'), borderWidth:2, borderDash:[5,4], pointBackgroundColor:cssVar('--text3','#7A8394'), pointRadius:3, _raw:rawB },
  ];

  try{ S.playerRadarChartInstance?.destroy(); }catch(e){}
  S.playerRadarChartInstance = new Chart(canvas, {
    type:'radar',
    data:{ labels: RADAR_METRICS.map(m=>m.label), datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:true, labels:{color:cssVar('--text2','#4B5160'), font:{size:10}, boxWidth:10} },
        tooltip:{ callbacks:{ label:(ctx)=>{
          const raw = ctx.dataset._raw?.[ctx.dataIndex];
          const unit = RADAR_METRICS[ctx.dataIndex].id.startsWith('rm_') ? 'kg' : 'cm';
          return `${ctx.dataset.label}: ${raw!=null?raw+unit:'sin datos'}`;
        } } }
      },
      scales:{ r:{ min:0, max:100, ticks:{color:cssVar('--text2','#4B5160'), backdropColor:'transparent', font:{size:9}, stepSize:25},
        grid:{color:cssVar('--border2','rgba(18,21,28,0.14)')}, angleLines:{color:cssVar('--border2','rgba(18,21,28,0.14)')},
        pointLabels:{color:cssVar('--text','#1A1D26'), font:{size:11,weight:600}} } }
    }
  });
}
window.drawPlayerTeamRadar = drawPlayerTeamRadar;

async function saveAllEvals() {
  const date = document.getElementById('einp-date-all')?.value || todayLocal();
  const tof  = document.getElementById('einp-tof-cmj')?.value;
  const vel  = document.getElementById('einp-vel-cmj')?.value;
  let saved = 0;
  const uid = S.evalAthleteId||'self';

  for(const t of EVAL_TESTS) {
    const hEl = document.getElementById('einp-height-'+t.id);
    if(!hEl || !hEl.value) continue;
    const h = parseFloat(hEl.value);
    if(isNaN(h) || h<=0) continue;
    const rec = {date, height:h};
    if(t.id==='cmj') { if(tof) rec.tof=parseFloat(tof); if(vel) rec.vel=parseFloat(vel); }

    if(uid==='self') {
      if(!S.evals[t.id]) S.evals[t.id]=[];
      S.evals[t.id].push(rec);
      sortEvalRecsByDate(S.evals[t.id]);
      markEvalDirty(t.id);
    } else {
      if(!S._athleteEvalsCache) S._athleteEvalsCache={};
      if(!S._athleteEvalsCache[uid]) S._athleteEvalsCache[uid]={};
      if(!S._athleteEvalsCache[uid][t.id]) S._athleteEvalsCache[uid][t.id]=[];
      S._athleteEvalsCache[uid][t.id].push(rec);
      sortEvalRecsByDate(S._athleteEvalsCache[uid][t.id]);
    }
    saved++;
  }

  if(!saved) { showToast('Ingresá al menos un valor'); return; }

  if(uid==='self') {
    scheduleSave();
  } else {
    try {
      await saveAthleteEvalsDoc(uid, S._athleteEvalsCache[uid]);
    } catch(e) { showToast('Error al guardar'); return; }
  }
  syncEvalsToAthleteObject(uid);

  showToast('✓ '+saved+' test'+(saved!==1?'s':'')+' guardado'+(saved!==1?'s':''));
  setTimeout(()=>{ if(S.currentView==='evals'){ renderMain(); setTimeout(drawEvalCharts,80);} }, 100);
}
window.saveAllEvals = saveAllEvals;

// ── CHART DRAWING — strictly scoped to S.evalAthleteId, redraws on every call ──
function drawEvalCharts() {
  if(typeof Chart==='undefined') return;
  // Always destroy ALL existing chart instances first to prevent stale/mixed data
  Object.keys(S.evalChartInstances||{}).forEach(key=>{
    try { S.evalChartInstances[key].destroy(); } catch(e){}
    delete S.evalChartInstances[key];
  });
  if(S.playerRadarChartInstance) { try{ S.playerRadarChartInstance.destroy(); }catch(e){} S.playerRadarChartInstance=null; }

  // Mismo criterio que en renderEvals: si estamos scopeados a un equipo/atleta,
  // nunca sustituir por las evaluaciones propias del admin.
  const edata = S.evalScopeUids
    ? getAthleteEvals(S.evalAthleteId || '')
    : getAthleteEvals(S.evalAthleteId || 'self');
  const view = S.evalView||'entry';
  if(view==='team_compare') {
    const myTeam = (S.teams||[]).find(t=>(t.players||[]).some(p=>p===S.userData?.name || p===S.userData?.email));
    if(myTeam) drawPlayerTeamRadar(edata, myTeam, S.userData?.position||null);
    return;
  }
  const gridColor = 'rgba(18,21,28,0.08)';
  const chartView = view;
  // Escala dinámica: en vez de un rango fijo igual para todos los atletas
  // (ej. 10-80cm), se calcula en base a los valores REALES registrados —
  // así, si un atleta salta entre 41 y 49cm, el gráfico va de ~35 a ~55cm en
  // vez de 10 a 80, y las diferencias entre test y test se ven de verdad.
  function computeDynamicScale(vals) {
    const valid = (vals||[]).filter(v=>v!=null && !isNaN(v));
    if(!valid.length) return {min:0, max:10};
    const dataMin=Math.min(...valid), dataMax=Math.max(...valid);
    const range = dataMax-dataMin;
    const pad = range>0 ? Math.max(range*0.3, 2) : Math.max(dataMax*0.15, 5);
    let min = Math.floor((dataMin-pad)/5)*5;
    let max = Math.ceil((dataMax+pad)/5)*5;
    if(min<0) min=0;
    if(max<=min) max=min+10;
    return {min,max};
  }
  window.computeDynamicScale=computeDynamicScale;

  const tooltipStyle = {backgroundColor:'#111827',titleColor:'#e8edf8',bodyColor:'#7a90b8',borderColor:'rgba(255,255,255,0.1)',borderWidth:1};

  if(chartView==='history') {
    if(!(S.evalHidden instanceof Set)) S.evalHidden = new Set();

    // Datalabels plugin for bar charts (value above bar)
    const barLabelsPlugin = {
      id:'barlabels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        chart.data.datasets.forEach((ds,i)=>{
          chart.getDatasetMeta(i).data.forEach((bar,idx)=>{
            const val = ds.data[idx];
            if(val===null||val===undefined) return;
            ctx.save();
            ctx.fillStyle = cssVar('--text','#1A1D26');
            ctx.font = '700 12px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(val+(ds._unit||'cm'), bar.x, bar.y-4);
            ctx.restore();
          });
        });
      }
    };

    const colorMap   = {cmj:'rgba(59,125,216,0.8)', sj:'rgba(34,197,94,0.8)', abalakov:'rgba(139,92,246,0.8)', saltoH:'rgba(20,184,166,0.8)', cmj_der:'rgba(245,158,11,0.8)', cmj_izq:'rgba(239,68,68,0.8)',
      rm_press_banca:'rgba(139,92,246,0.8)', rm_peso_muerto:'rgba(20,184,166,0.8)', rm_sentadilla:'rgba(59,125,216,0.8)', rm_cargada_potencia:'rgba(239,68,68,0.8)'};
    const borderMap  = {cmj:'#3b7dd8', sj:'#22c55e', abalakov:'#8b5cf6', saltoH:'#14b8a6', cmj_der:'#f59e0b', cmj_izq:'#ef4444',
      rm_press_banca:'#8b5cf6', rm_peso_muerto:'#14b8a6', rm_sentadilla:'#3b7dd8', rm_cargada_potencia:'#ef4444'};

    EVAL_TESTS.concat(STRENGTH_TESTS).forEach(t=>{
      if(S.evalHidden.has(t.id)) return;
      const recs = sortEvalRecsByDate([...(edata[t.id]||[])]);
      if(!recs.length) return;
      const c = document.getElementById('chart-hist-'+t.id);
      if(!c) return;
      const sc = computeDynamicScale(recs.map(r=>r.height));

      S.evalChartInstances['chart-hist-'+t.id] = new Chart(c, {
        type:'bar',
        data:{
          labels: recs.map(r=>r.date),
          datasets:[
            {
              type:'bar', label:t.label,
              data: recs.map(r=>r.height),
              backgroundColor: colorMap[t.id]||'rgba(59,125,216,0.8)',
              borderColor: borderMap[t.id]||'#3b7dd8',
              borderWidth:1, borderRadius:4, order:2, _unit:t.unit
            },
            {
              type:'line', label:t.label+' (línea)',
              data: recs.map(r=>r.height),
              borderColor: borderMap[t.id]||'#3b7dd8',
              borderWidth:2, pointRadius:3, pointBackgroundColor:'#fff',
              tension:0.3, fill:false, order:1
            }
          ]
        },
        options:{
          responsive:true, maintainAspectRatio:true, aspectRatio:2.3,
          devicePixelRatio: window.devicePixelRatio || 1,
          plugins:{
            legend:{display:false},
            tooltip:{...tooltipStyle, filter:item=>item.datasetIndex===0}
          },
          scales:{
            x:{grid:{color:gridColor}, ticks:{color:cssVar('--text','#1A1D26'), font:{size:10}, maxRotation:30}},
            y:{grid:{color:gridColor}, ticks:{color:cssVar('--text','#1A1D26'), font:{size:10}}, min:sc.min, max:sc.max, title:{display:true,text:t.unit||'cm',color:cssVar('--text','#1A1D26'),font:{size:10}}}
          }
        },
        plugins:[barLabelsPlugin]
      });
      // Algunos navegadores miden mal el tamaño real del canvas si el layout
      // (grid de 2 columnas en desktop, tarjetas recién insertadas) todavía no
      // terminó de asentarse en el momento exacto del draw inicial — eso deja
      // el canvas dibujado a una resolución más chica de la que después ocupa
      // en pantalla, y CSS lo estira, lo cual se ve borroso (afecta sobre todo
      // al texto chico de las etiquetas). Forzamos un resize() en el siguiente
      // frame, ya con el layout definitivo, para que quede nítido.
      requestAnimationFrame(()=>{ try{ S.evalChartInstances['chart-hist-'+t.id]?.resize(); }catch(e){} });
    });

    // Asymmetry chart (separate, always a line)
    if(!S.evalHidden.has('asym')) {
      const der=edata['cmj_der']||[], izq=edata['cmj_izq']||[];
      const dates=[...new Set([...der.map(r=>r.date), ...izq.map(r=>r.date)])].sort();
      const asymVals = dates.map(date=>{
        const d=der.find(r=>r.date===date), i=izq.find(r=>r.date===date);
        if(!d||!i) return null;
        return parseFloat((Math.abs(d.height-i.height)/Math.max(d.height,i.height)*100).toFixed(1));
      });
      const validDates = dates.filter((_,idx)=>asymVals[idx]!==null);
      const validVals  = asymVals.filter(v=>v!==null);
      const c = document.getElementById('chart-hist-asym');
      if(c && validDates.length) {
        S.evalChartInstances['chart-hist-asym'] = new Chart(c, {
          type:'line',
          data:{
            labels:validDates,
            datasets:[{
              label:'Asimetría %', data:validVals,
              borderColor:'#c67c0f', backgroundColor:'rgba(198,124,15,0.08)',
              tension:.3, pointRadius:5,
              pointBackgroundColor:validVals.map(v=>v>10?'#ef4444':v>5?'#f59e0b':'#22c55e'),
              fill:true
            }]
          },
          options:{
            responsive:true, maintainAspectRatio:true, aspectRatio:2.3,
            plugins:{legend:{display:false}, tooltip:tooltipStyle},
            scales:{
              x:{grid:{color:gridColor}, ticks:{color:cssVar('--text','#1A1D26'), font:{size:9}, maxRotation:30}},
              y:{grid:{color:gridColor}, ticks:{color:cssVar('--text','#1A1D26'), font:{size:9}}, min:0, title:{display:true,text:'% asimetría',color:cssVar('--text','#1A1D26'),font:{size:9}}}
            }
          },
          plugins:[{
            id:'asymlabels',
            afterDatasetsDraw(chart){
              const ctx=chart.ctx;
              chart.getDatasetMeta(0).data.forEach((pt,idx)=>{
                const val=chart.data.datasets[0].data[idx];
                if(val===null||val===undefined) return;
                ctx.save();
                ctx.fillStyle=cssVar('--text','#1A1D26');
                ctx.font='600 10px Inter, sans-serif';
                ctx.textAlign='center';
                ctx.textBaseline='bottom';
                ctx.fillText(val+'%', pt.x, pt.y-6);
                ctx.restore();
              });
            }
          }]
        });
      }
    }

  }
  // "compare" ya no dibuja un gráfico Chart.js — ver renderEvalCompare(),
  // ahora es una tabla (más chica, muestra todos los tests a la vez).
}
window.drawEvalCharts = drawEvalCharts;

function getAthleteEvals(uid) {
  if(uid==='self') return S.evals;
  return (S._athleteEvalsCache && S._athleteEvalsCache[uid]) || {};
}

// El sistema de Evaluaciones guarda los tests en S._athleteEvalsCache (una
// caché aparte, pensada solo para esa pantalla). Pero el Ranking/Radar/
// Cuadrante del equipo leen los tests desde a._personal.evals (el objeto del
// atleta en S.adminAthletes). Sin esta sincronización, un test recién
// cargado no aparecía ahí hasta recargar toda la app — quedaban dos copias
// de los mismos datos desconectadas entre sí.
function syncEvalsToAthleteObject(uid) {
  if(isPendingId(uid)) return;
  const a = S.adminAthletes?.find(x=>x.uid===uid);
  if(a) {
    if(!a._personal) a._personal = {};
    a._personal.evals = S._athleteEvalsCache?.[uid] || {};
  }
}
window.syncEvalsToAthleteObject = syncEvalsToAthleteObject;

// Nombre a mostrar para cualquier id de "atleta seleccionado": el admin
// mismo, un atleta con cuenta real, o un jugador pendiente de registrarse.
function getAthleteDisplayName(id) {
  if(id==='self') return 'Yo (admin)';
  if(isPendingId(id)) {
    const p = (S.pendingAthletes||[]).find(x=>('pending:'+x.id)===id);
    return p ? p.name+' (sin registrar)' : 'Jugador pendiente';
  }
  const a = S.adminAthletes.find(a=>a.uid===id);
  return a?.name || a?.email || 'Atleta';
}
window.getAthleteDisplayName=getAthleteDisplayName;

// Un jugador "pendiente" es alguien que el admin cargó en el roster de un
// equipo pero que TODAVÍA no se registró con una cuenta real — se identifica
// con un id con el prefijo "pending:" en vez de un uid de Firebase Auth.
function isPendingId(uid) { return typeof uid==='string' && uid.startsWith('pending:'); }
window.isPendingId=isPendingId;
function pendingDocId(uid) { return uid.slice('pending:'.length); }
window.pendingDocId=pendingDocId;

async function saveAthleteEvalsDoc(uid, evals) {
  const ref = isPendingId(uid) ? doc(db,'pendingAthletes',pendingDocId(uid)) : doc(db,'personal',uid);
  // Dot-path por testId, nunca {evals} entero — si no, la próxima vez que el
  // propio atleta guarde CUALQUIER cosa suya (wellness, carga) desde una
  // sesión vieja, su copia local desactualizada del mapa "evals" completo
  // pisaría el test que el admin acaba de cargar acá, aunque sea de otro
  // ejercicio. Mismo criterio que wellness/injuries en saveToFirestore().
  const payload = {};
  Object.keys(evals||{}).forEach(testId => { payload['evals.'+testId] = evals[testId]; });
  if(Object.keys(payload).length) await updateDocSafe(ref, payload);
}
window.saveAthleteEvalsDoc=saveAthleteEvalsDoc;

// Trae /personal/{uid}.evals para UN atleta puntual si todavía no está en
// caché. Antes, solo el botón "Comparar atletas" (loadAllAthleteEvals)
// poblaba esta caché — por eso elegir un atleta individual no mostraba
// sus saltos, aunque el dato sí existía en Firestore.
async function ensureAthleteEvalData(uid) {
  if (!uid || uid === 'self') return;
  if (S._athleteEvalsCache && S._athleteEvalsCache[uid]) return;
  try {
    const ref = isPendingId(uid) ? doc(db,'pendingAthletes',pendingDocId(uid)) : doc(db, 'personal', uid);
    const snap = await getDoc(ref);
    if (!S._athleteEvalsCache) S._athleteEvalsCache = {};
    S._athleteEvalsCache[uid] = snap.exists() ? (snap.data().evals || {}) : {};
  } catch (e) {}
}
window.ensureAthleteEvalData = ensureAthleteEvalData;

async function deleteEvalRecord(testId, idx) {
  // Blindaje además de sacar el botón de la vista del jugador — nadie que no
  // sea admin puede borrar un test cargado, ni por acá ni por consola.
  if(!S.isAdmin) return;
  if(!confirm('¿Eliminar este registro?')) return;
  const uid = S.evalAthleteId||'self';
  if(uid==='self') {
    if(S.evals[testId]) { S.evals[testId].splice(idx,1); markEvalDirty(testId); scheduleSave(); }
  } else {
    if(S._athleteEvalsCache?.[uid]?.[testId]) {
      S._athleteEvalsCache[uid][testId].splice(idx,1);
      try { await saveAthleteEvalsDoc(uid, S._athleteEvalsCache[uid]); } catch(e){}
      syncEvalsToAthleteObject(uid);
    }
  }
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.deleteEvalRecord = deleteEvalRecord;

function setLibFilter(tag) {
  if(!S._libViewFilters) S._libViewFilters = new Set();
  if(S._libViewFilters.has(tag)) S._libViewFilters.delete(tag);
  else S._libViewFilters.add(tag);
  updateLibViewResults();
}
window.setLibFilter = setLibFilter;

// Elimina una categoría de TODOS los ejercicios que la tengan — no hay
// una lista separada de categorías "disponibles", son simplemente las que
// usa algún ejercicio, así que borrarla es sacarla de todos lados.
function deleteLibraryTag(tag) {
  const count = (S.library||[]).filter(e=>(e.tags||[]).includes(tag)).length;
  if(!confirm(`¿Eliminar la categoría "${tag}"? Se va a sacar de los ${count} ejercicio${count!==1?'s':''} que la tienen. No se puede deshacer.`)) return;
  (S.library||[]).forEach(ex=>{ if(ex.tags) ex.tags = ex.tags.filter(t=>t!==tag); });
  if(S._libViewFilters) S._libViewFilters.delete(tag);
  if(S.activeFilters) S.activeFilters.delete(tag);
  scheduleSave();
  showToast('✓ Categoría eliminada');
  renderMain();
}
window.deleteLibraryTag = deleteLibraryTag;

// Barrido de una sola vez: saca de TODOS los ejercicios cualquier tag que no
// sea parte de la taxonomía nueva (ni una de las 17 principales, ni una
// sub-categoría válida) — para limpiar de golpe lo que quedó de cuando la
// Biblioteca usaba tags 100% libres. Los ejercicios quedan igual de todos
// modos sin categoría principal después de esto si el tag viejo que tenían
// no era ninguna de las nuevas — hay que volver a categorizarlos a mano
// (el picker de "Editar" ya bloquea guardar hasta que estén completos).
async function cleanUnrecognizedLibraryTags() {
  const allowed = new Set([
    ...LIB_MAIN_CATEGORIES,
    ...Object.values(LIB_SUBCATEGORY_RULES).flatMap(groups=>groups.flatMap(g=>g.options)),
  ]);
  const affected = (S.library||[]).filter(ex=>(ex.tags||[]).some(t=>!allowed.has(t)));
  if(!affected.length) { showToast('No hay categorías viejas para limpiar'); return; }
  if(!confirm(`Esto va a sacar categorías viejas (que no son de la lista nueva) de ${affected.length} ejercicio${affected.length!==1?'s':''}. Van a quedar sin categorizar hasta que los edites de nuevo. No se puede deshacer. ¿Confirmás?`)) return;
  affected.forEach(ex=>{ ex.tags = (ex.tags||[]).filter(t=>allowed.has(t)); });
  if(S._libViewFilters) [...S._libViewFilters].forEach(t=>{ if(!allowed.has(t)) S._libViewFilters.delete(t); });
  if(S.activeFilters) [...S.activeFilters].forEach(t=>{ if(!allowed.has(t)) S.activeFilters.delete(t); });
  showToast('Limpiando…');
  const ok = await saveNow();
  if(!ok) { showToast('No se pudo guardar — revisá tu conexión y volvé a intentar'); return; }
  showToast(`✓ Se limpiaron ${affected.length} ejercicio${affected.length!==1?'s':''}`);
  renderMain();
}
window.cleanUnrecognizedLibraryTags = cleanUnrecognizedLibraryTags;

function switchCompareTest(testId) {
  S.evalCompareTest = testId;
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.switchCompareTest = switchCompareTest;

// De la lista plana de {name,value,position} arma las filas a graficar:
// sin agrupar (tal cual), promedio por puesto, o solo los atletas de UN puesto.
function buildEvalCompareRows(withData, groupBy, groupPos) {
  if(groupBy!=='position') return withData;
  if(groupPos==='all') {
    const byPos = {};
    withData.forEach(d=>{ const p=d.position||'Sin puesto'; (byPos[p]=byPos[p]||[]).push(d.value); });
    return Object.entries(byPos).map(([pos,vals])=>({
      name: pos, value: Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10
    }));
  }
  return withData.filter(d=>d.position===groupPos);
}
window.buildEvalCompareRows = buildEvalCompareRows;

// Colorea cada barra según su tercio DENTRO de este mismo conjunto — verde
// el tercio superior, azul el medio, rojo el que está más lejos (a reforzar).
// Es relativo al grupo que se está mirando, no una escala fija.
function tercileColors(values) {
  const n = values.length;
  if(n<3) return values.map(()=>'#3b7dd8');
  const order = values.map((v,i)=>i).sort((a,b)=>values[a]-values[b]);
  const rankOf = new Array(n);
  order.forEach((origIdx,pos)=>{ rankOf[origIdx] = pos/(n-1); });
  return values.map((v,i)=>{
    const rank = rankOf[i];
    if(rank>=2/3) return '#22c55e';
    if(rank>=1/3) return '#3b7dd8';
    return '#ef4444';
  });
}
window.tercileColors = tercileColors;

function setEvalCompareGroupBy(v) {
  S.evalCompareGroupBy = v;
  if(v==='none') S.evalCompareGroupPosition='all';
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.setEvalCompareGroupBy = setEvalCompareGroupBy;

function setEvalCompareGroupPosition(v) {
  S.evalCompareGroupPosition = v;
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.setEvalCompareGroupPosition = setEvalCompareGroupPosition;

function switchEvalView(viewId) {
  S.evalView = viewId;
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.switchEvalView = switchEvalView;

function toggleEvalChart(testId) {
  if(!(S.evalHidden instanceof Set)) S.evalHidden = new Set();
  if(S.evalHidden.has(testId)) S.evalHidden.delete(testId);
  else S.evalHidden.add(testId);

  const card = document.getElementById('eval-card-'+testId);
  if(card) {
    const body = card.querySelector('.eval-hist-body');
    const btn = card.querySelector('.eval-toggle-btn');
    if(body) body.style.display = S.evalHidden.has(testId) ? 'none' : 'block';
    if(btn) btn.textContent = S.evalHidden.has(testId) ? '▼ Ver' : '▲ Ocultar';
    if(!S.evalHidden.has(testId)) setTimeout(drawEvalCharts, 80);
    return;
  }
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.toggleEvalChart = toggleEvalChart;

function toggleEvalSecondary() {
  S.evalShowSecondary = !S.evalShowSecondary;
  renderMain();
}
window.toggleEvalSecondary = toggleEvalSecondary;

async function loadEvalAthletes() {
  if(!S.isAdmin) return;
  try {
    const snap = await getDocs(collection(db,'users'));
    S.adminAthletes = snap.docs.map(d=>({uid:d.id,...d.data()})).filter(u=>u.email!==ADMIN_EMAIL);
    renderMain();
    setTimeout(drawEvalCharts, 80);
  } catch(e) { showToast('Error cargando atletas'); }
}
window.loadEvalAthletes = loadEvalAthletes;

async function loadAllAthleteEvals(silent) {
  if(!S.isAdmin || !S.adminAthletes.length) return;
  if(!silent) showToast('Cargando datos...');
  if(!S._athleteEvalsCache) S._athleteEvalsCache = {};
  const targets = S.evalScopeUids ? S.adminAthletes.filter(a=>S.evalScopeUids.includes(a.uid)) : S.adminAthletes;
  for(const a of targets) {
    try {
      const snap = await getDoc(doc(db,'personal',a.uid));
      if(snap.exists()) S._athleteEvalsCache[a.uid] = snap.data().evals || {};
    } catch(e) {}
  }
  if(!silent) { showToast('✓ Datos actualizados'); renderMain(); setTimeout(drawEvalCharts, 80); }
}
window.loadAllAthleteEvals = loadAllAthleteEvals;


// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ── DASHBOARD ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

// Minutos jugados en partido — se arman solos a partir de lo que cada
// atleta ya completa en "Carga de hoy" (actividad Partido/Partido 2), sin
// pedirle un dato nuevo a nadie. Estos mismos logs YA entran en calcLoadMetrics
// (UA/ACWR) porque comparten el mismo array _sessionLogs — acá solo se
// resumen aparte para los informes de partido y médico.
function getMatchLogs(sessionLogs) {
  return (sessionLogs||[]).filter(l=>l.activity==='partido'||l.activity==='partido2');
}
window.getMatchLogs = getMatchLogs;

// Para las tarjetas de atleta (Dashboard y roster de Equipos): si jugó un
// partido reciente, mostrar minutos + RPE en crudo ahí mismo — no la UA
// (unidad arbitraria), que hay que traducir mentalmente cada vez. "Reciente"
// son 3 días, no solo hoy, para que un partido del sábado o domingo se siga
// viendo el lunes al entrar (que es justo cuando el prep lo quiere ver).
function getRecentMatchCardInfo(personal, todayStr) {
  const logs = personal?.history?._sessionLogs || [];
  const matches = getMatchLogs(logs);
  if(!matches.length) return null;
  const latest = matches.reduce((max,l)=> l.date>max.date?l:max, matches[0]);
  const daysAgo = Math.floor((new Date(todayStr+'T00:00:00') - new Date(latest.date+'T00:00:00')) / 86400000);
  if(daysAgo<0 || daysAgo>3) return null;
  const injuries = personal?.injuries || {};
  const hadMolestia = Object.values(injuries).some(inj=>(inj.history||[]).some(h=>h.date===latest.date));
  return { mins:latest.mins, rpe:latest.rpe, date:latest.date, daysAgo, hadMolestia };
}
window.getRecentMatchCardInfo = getRecentMatchCardInfo;

function getMatchMinutesSummary(sessionLogs) {
  const matchLogs = getMatchLogs(sessionLogs);
  const partidosJugados = matchLogs.length;
  const minutosTotales = matchLogs.reduce((s,l)=>s+(l.mins||0),0);
  const promedioPorPartido = partidosJugados ? Math.round(minutosTotales/partidosJugados) : 0;
  const lastMatchDate = matchLogs.length ? matchLogs.reduce((max,l)=>l.date>max?l.date:max, matchLogs[0].date) : null;
  const daysSinceLastMatch = lastMatchDate ? Math.floor((new Date()-new Date(lastMatchDate))/(1000*60*60*24)) : null;
  return { partidosJugados, minutosTotales, promedioPorPartido, lastMatchDate, daysSinceLastMatch, matchLogs };
}
window.getMatchMinutesSummary = getMatchMinutesSummary;

// Horas de exposición (entrenamiento + partido) — insumo para la incidencia
// de lesiones por 1000hs, un estándar real de epidemiología deportiva.
function getExposureHours(sessionLogs) {
  return (sessionLogs||[]).reduce((s,l)=>s+(l.mins||0),0) / 60;
}
window.getExposureHours = getExposureHours;

function calcLoadMetrics(sessionLogs) {
  // sessionLogs = array of {date, week, session, rpe, mins, ua}
  if(!sessionLogs || !sessionLogs.length) return null;
  
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate()-7);
  const fourWeeksAgo = new Date(now); fourWeeksAgo.setDate(fourWeeksAgo.getDate()-28);
  
  // Acute load: last 7 days
  const acuteLogs = sessionLogs.filter(l=>new Date(l.date)>=weekAgo);
  const acuteUA = acuteLogs.reduce((a,l)=>a+l.ua, 0);
  
  // Chronic load: average of last 4 weeks
  const chronicLogs = sessionLogs.filter(l=>new Date(l.date)>=fourWeeksAgo);
  // Split into 4 weeks
  const weeklyUA = [0,0,0,0];
  chronicLogs.forEach(l=>{
    const daysAgo = Math.floor((now-new Date(l.date))/(1000*60*60*24));
    const wIdx = Math.floor(daysAgo/7);
    if(wIdx<4) weeklyUA[wIdx]+=l.ua;
  });
  const chronicUA = weeklyUA.reduce((a,v)=>a+v,0)/4;

  // El ACWR (acuteUA/chronicUA) es un artefacto estadístico cuando hay poco historial:
  // con una sola sesión, chronicUA ya sale dividido por 4 semanas aunque 3 de ellas
  // nunca existieron, e infla el ratio artificialmente (300 UA / 75 UA = 4.00, aunque
  // el atleta recién esté empezando y no haya ningún riesgo real todavía). Exigimos un
  // mínimo de historial antes de reportar un ACWR — si no, es más ruido que señal.
  //
  // BUG encontrado y corregido acá: el requisito original era "¿pasaron 21 días
  // desde el PRIMER log de la historia?" — una sola sesión aislada de hace un mes
  // (una prueba, el día que se registró) ya cumplía eso, aunque después haya
  // semanas vacías y recién esté entrenando de verdad hace 2 semanas. El ACWR
  // igual salía altísimo y aparecía "riesgo lesional" en un jugador sin
  // suficiente historial real para que el número signifique algo.
  //
  // La primera corrección (semanas-de-calendario consecutivas) resultó
  // demasiado estricta: un hueco normal de la vida real — una gripe, un
  // partido libre un fin de semana — podía caer justo en el borde entre dos
  // "semanas" (que acá son ventanas de 7 días fijas, no lunes-a-domingo) y
  // cortaba la racha de un atleta con historial real de sobra. Se mide
  // día por día: se camina hacia atrás desde hoy por las fechas con carga
  // cargada, y la racha se corta solo si el HUECO entre dos sesiones seguidas
  // supera el máximo tolerado.
  //
  // Ese máximo NO es fijo — un atleta que ya viene entrenando hace semanas o
  // meses se merece más margen ante un hueco real (una gripe más larga, unos
  // días de descanso) que uno recién arrancado: para éste, un hueco grande
  // todavía dice "no hay base confiable"; para alguien con historial de
  // sobra, el mismo hueco es solo una pausa dentro de una racha real. Se
  // mira una ventana más amplia (90 días, más allá de las 4 semanas que
  // importan para el cálculo en sí) para decidir si está "establecido": si
  // tiene bastantes días distintos con carga ahí, se le da el margen más
  // generoso.
  const WIDE_LOOKBACK_DAYS = 90;
  const ESTABLISHED_MIN_DAYS = 15;
  const GAP_MAX_NEW = 10;
  const GAP_MAX_ESTABLISHED = 21;
  const wideAgo = new Date(now); wideAgo.setDate(wideAgo.getDate()-WIDE_LOOKBACK_DAYS);
  const wideDistinctDays = new Set(sessionLogs.filter(l=>new Date(l.date)>=wideAgo).map(l=>l.date)).size;
  const isEstablished = wideDistinctDays >= ESTABLISHED_MIN_DAYS;
  const GAP_MAX_DAYS = isEstablished ? GAP_MAX_ESTABLISHED : GAP_MAX_NEW;

  const chronicDatesDesc = [...new Set(chronicLogs.map(l=>l.date))].sort().reverse();
  let cursor = now;
  for (const dStr of chronicDatesDesc) {
    const d = new Date(dStr+'T00:00:00');
    if (Math.floor((cursor - d) / 86400000) > GAP_MAX_DAYS) break;
    cursor = d;
  }
  const daysOfHistory = Math.floor((now - cursor) / 86400000);
  const hasEnoughHistory = daysOfHistory >= 21;
  const acwr = (chronicUA>0 && hasEnoughHistory) ? (acuteUA/chronicUA) : null;
  
  // Monotony: mean / stddev of daily UA in last 7 days
  const dailyUA = {};
  acuteLogs.forEach(l=>{ dailyUA[l.date]=(dailyUA[l.date]||0)+l.ua; });
  const dailyVals = Object.values(dailyUA);
  // pad with 0s for missing days
  while(dailyVals.length<7) dailyVals.push(0);
  const mean = dailyVals.reduce((a,v)=>a+v,0)/7;
  const variance = dailyVals.reduce((a,v)=>a+Math.pow(v-mean,2),0)/7;
  const stddev = Math.sqrt(variance);
  const monotony = stddev>0 ? mean/stddev : mean>0 ? 2.5 : 0;
  const strain = acuteUA * monotony;
  
  return { acuteUA, chronicUA:Math.round(chronicUA), acwr, monotony, strain, sessions:acuteLogs.length, daysOfHistory, hasEnoughHistory };
}
window.calcLoadMetrics=calcLoadMetrics;

function getACWRStatus(acwr, daysOfHistory) {
  if(acwr===null||acwr===undefined) {
    if(daysOfHistory!=null && daysOfHistory<21) return {label:`Faltan ${21-daysOfHistory} día${21-daysOfHistory===1?'':'s'} de datos`,color:'var(--text3)'};
    return {label:'Sin datos',color:'var(--text3)'};
  }
  if(acwr<0.8)   return {label:'Subcarga',color:'var(--purple)'};
  if(acwr<=1.3)  return {label:'Zona óptima ✓',color:'var(--green)'};
  if(acwr<=1.5)  return {label:'Precaución',color:'var(--amber)'};
  // El jugador ve una alerta más suave a propósito — "riesgo lesional" es un
  // término fuerte para mostrarle a un chico sin que un profesional lo
  // contextualice antes. El admin (S.isAdmin) sigue viendo la etiqueta
  // técnica tal cual, porque la necesita para identificar rápido a quién
  // mirar primero.
  return S.isAdmin
    ? {label:'Riesgo lesional ⚠',color:'var(--red)'}
    : {label:'Posibles cargas elevadas ⚠ — consultalo con tu entrenador',color:'var(--red)'};
}
window.getACWRStatus = getACWRStatus;

// Gráfico de tendencia en la ficha del atleta: ACWR y wellness día a día,
// últimos 30 días. El ACWR se recalcula "como si fuera ese día" (solo con los
// logs hasta esa fecha), así la curva refleja cómo evolucionó de verdad, no
// solo la foto de hoy.
function drawAthleteTrendChart() {
  if(typeof Chart==='undefined') return;
  if(!S.athleteChartInstances) S.athleteChartInstances={};
  Object.keys(S.athleteChartInstances).forEach(k=>{
    try{S.athleteChartInstances[k].destroy();}catch(e){}
    delete S.athleteChartInstances[k];
  });
  if(!S.viewingAthlete) return;
  const canvas=document.getElementById('athlete-trend-chart');
  if(!canvas) return;

  const {personal}=S.viewingAthlete;
  const logs=personal.history?._sessionLogs || personal.sessionLogs || [];
  const wellness=personal.wellness||{};
  const DAYS=30;
  const labels=[], acwrData=[], wellnessData=[];
  const today=new Date();

  for(let i=DAYS-1;i>=0;i--){
    const d=new Date(today); d.setDate(d.getDate()-i);
    const dateStr=toLocalDateStr(d);
    labels.push(dateStr.slice(5));
    const logsUpToDate=logs.filter(l=>l.date<=dateStr);
    const m=calcLoadMetrics(logsUpToDate);
    acwrData.push(m?.acwr!=null ? +m.acwr.toFixed(2) : null);
    const {pct,allFilled}=getWellnessScore(wellness[dateStr]);
    wellnessData.push(allFilled?pct:null);
  }

  if(acwrData.every(v=>v===null) && wellnessData.every(v=>v===null)) return; // nada que graficar

  const gridColor='rgba(18,21,28,0.08)';
  S.athleteChartInstances['trend']=new Chart(canvas,{
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Wellness %',data:wellnessData,borderColor:'#1f7a4d',backgroundColor:'rgba(31,122,77,0.08)',yAxisID:'y',spanGaps:true,tension:.3,pointRadius:2,fill:true},
        {label:'ACWR',data:acwrData,borderColor:'#2f5fd8',backgroundColor:'rgba(47,95,216,0.08)',yAxisID:'y1',spanGaps:true,tension:.3,pointRadius:2,fill:false},
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:cssVar('--text','#1A1D26'),font:{size:11},boxWidth:12}},
        tooltip:{backgroundColor:'#111827',titleColor:'#e8edf8',bodyColor:'#7a90b8',borderColor:'rgba(255,255,255,0.1)',borderWidth:1}
      },
      scales:{
        x:{ ticks:{color:cssVar('--text','#1A1D26'),font:{size:9},maxRotation:0,autoSkip:true,maxTicksLimit:8}, grid:{color:gridColor} },
        y:{ position:'left', min:0, max:100, ticks:{color:'#1f7a4d',font:{size:10},stepSize:25}, grid:{color:gridColor} },
        y1:{ position:'right', min:0, suggestedMax:2, ticks:{color:'#2f5fd8',font:{size:10}}, grid:{drawOnChartArea:false} },
      }
    }
  });
}
window.drawAthleteTrendChart=drawAthleteTrendChart;

function getMonotonyStatus(m) {
  if(!m) return {label:'Sin datos',color:'var(--text3)'};
  if(m<1.5) return {label:'Buena variación',color:'var(--green)'};
  if(m<2.0) return {label:'Moderada',color:'var(--blue)'};
  return {label:'Alta ⚠',color:'var(--red)'};
}

function renderDashboard() {
  if(!S.isAdmin) return renderAthleteHome();
  
  return `<div class="page-header">
    <div class="page-title">Dashboard</div>
    <div class="page-subtitle">Vista general de tus atletas · ${new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</div>
  </div>
  <div id="dashboard-content">
    <div class="empty-state" style="padding:30px">
      <div style="font-size:24px;margin-bottom:8px">⏳</div>
      Cargando atletas...
    </div>
  </div>`;
}
window.renderDashboard=renderDashboard;

async function loadDashboard() {
  if(!S.isAdmin) return;
  try {
    const snap = await getDocs(collection(db,'users'));
    S.dashAthletes = snap.docs.map(d=>({uid:d.id,...d.data()}))
      .filter(u=>u.email!==ADMIN_EMAIL);
    
    // Load personal data for each athlete (parallel)
    const personalData = await Promise.all(
      S.dashAthletes.map(a=>getDoc(doc(db,'personal',a.uid)))
    );
    S.dashAthletes.forEach((a,i)=>{
      a._personal = personalData[i].exists() ? personalData[i].data() : {};
    });
    
    S.dashLoaded = true;
    const el = document.getElementById('dashboard-content');
    if(el) el.innerHTML = renderDashboardContent();
    setTimeout(()=>runCountUps(),30);
  } catch(e) {
    const el = document.getElementById('dashboard-content');
    if(el) el.innerHTML = `<div class="empty-state">Error cargando datos: ${e.message}</div>`;
  }
}
window.loadDashboard=loadDashboard;

// Orden fijo de "grupo de población" para las listas de lesiones del
// Dashboard — de mayor a menor edad/nivel. Individuales siempre al final,
// después de cualquier categoría real conocida.
const INJURY_CATEGORY_ORDER = ['Liga de Honor', 'Juniors', 'Juveniles', 'Cadetes'];
function getAthleteCategoryLabel(a) {
  if(!a?.teamId) return 'Individuales';
  const team = (S.teams||[]).find(t=>t.id===a.teamId);
  return team?.category || 'Sin categoría';
}
window.getAthleteCategoryLabel = getAthleteCategoryLabel;
function injuryCategoryRank(label) {
  const idx = INJURY_CATEGORY_ORDER.indexOf(label);
  if(idx>=0) return idx;
  if(label==='Individuales') return INJURY_CATEGORY_ORDER.length;
  return INJURY_CATEGORY_ORDER.length+1; // categorías desconocidas, al final de todo
}

function setDashInjuryCategoryFilter(v) { S.dashInjuryCategoryFilter = v||null; renderMain(); }
window.setDashInjuryCategoryFilter = setDashInjuryCategoryFilter;

function renderDashInjuryCategoryFilters() {
  const cats = ['Todas', ...INJURY_CATEGORY_ORDER, 'Individuales'];
  const cur = S.dashInjuryCategoryFilter || 'Todas';
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    ${cats.map(c=>`<button class="lib-filter ${cur===c?'active':''}" onclick="setDashInjuryCategoryFilter('${c==='Todas'?'':c}')">${c}</button>`).join('')}
  </div>`;
}
window.renderDashInjuryCategoryFilters = renderDashInjuryCategoryFilters;

// Feed cronológico de lesiones reales — activas (con su último estado) y
// dadas de alta (archivadas) — para el panel "Lesiones recientes" del
// Dashboard, separado de "Atención requerida" (que es solo lo que hay que
// mirar HOY). Acá se ve la foto más amplia: qué pasó últimamente.
// Solo ACTIVAS a propósito — las dadas de alta no hacen bulto acá, quedan
// como historial dentro del informe de cada equipo (injuryArchive sigue
// completo, esto es nomás lo que se muestra en el Dashboard).
function getRecentInjuryFeed(athletes, limit) {
  const allBodyZones = [...BODY_ZONES.front, ...BODY_ZONES.back];
  const feed = [];
  athletes.forEach(a=>{
    const injuries = a._personal?.injuries||{};
    const dismissed = a._personal?.dashboardInjuryDismissed||[];
    Object.entries(injuries).forEach(([zoneId,inj])=>{
      if(!inj.pain||inj.pain<=0||!isRealInjury(inj)) return;
      const lastDate = inj.history?.length ? inj.history[inj.history.length-1].date : null;
      // Ocultada del panel del Dashboard a propósito (dismissDashboardInjury)
      // — atada a zoneId+fecha, no solo a zoneId: si esta lesión se actualiza
      // más adelante (nuevo dolor, nueva entrada de seguimiento) la fecha
      // cambia y vuelve a aparecer sola, en vez de quedar escondida para
      // siempre por error. Nunca toca la ficha real del atleta ni del
      // equipo — esto es solo qué se MUESTRA en este panel puntual.
      if(dismissed.includes(zoneId+'|'+(lastDate||''))) return;
      const zoneLabel = allBodyZones.find(z=>z.id===zoneId)?.label || zoneId;
      feed.push({athlete:a, zoneId, zoneLabel, type:inj.type, severity:inj.severity||'leve', pain:inj.pain, note:inj.note||'', date:lastDate||'', status:'active'});
    });
  });
  feed.sort((x,y)=>(y.date||'').localeCompare(x.date||''));
  return limit ? feed.slice(0, limit) : feed;
}
window.getRecentInjuryFeed = getRecentInjuryFeed;

// Sacar una lesión puntual del panel "Lesiones recientes" del Dashboard —
// NO la da de alta, NO la borra de la ficha del atleta ni del equipo, solo
// deja de ocupar lugar en este resumen. Se guarda en el propio doc personal
// del atleta (separado del campo injuries) para que persista entre sesiones
// del admin.
async function dismissDashboardInjury(uid, zoneId, lastDate) {
  const key = zoneId+'|'+(lastDate||'');
  // BUGS encontrados y corregidos acá: (1) esto tocaba S.adminAthletes, pero
  // el panel del Dashboard lee de S.dashAthletes — una lista aparte, cargada
  // por su cuenta en loadDashboard() — así que el toque nunca llegaba al
  // dato que en realidad se muestra. (2) llamaba a renderMain(), pero
  // renderDashboard() SIEMPRE arranca mostrando "Cargando atletas…" sin
  // importar si ya había datos, y además dispara loadDashboard() de nuevo
  // (otra vuelta completa a Firestore) — el botón "funcionaba" pero la
  // pantalla volvía a cero y la lesión podía reaparecer si esa recarga
  // terminaba antes que el guardado. Ahora se actualiza en las dos listas en
  // las que el atleta puede estar cacheado, y se repinta SOLO el contenido
  // del dashboard (mismo patrón que ya usa la búsqueda/filtro), no la
  // pantalla entera.
  const targets = [
    (S.dashAthletes||[]).find(x=>x.uid===uid),
    (S.adminAthletes||[]).find(x=>x.uid===uid),
  ].filter(Boolean);
  if(!targets.length) return;
  let newList = null;
  targets.forEach(a=>{
    if(!a._personal) a._personal = {};
    const list = a._personal.dashboardInjuryDismissed||[];
    if(!list.includes(key)) a._personal.dashboardInjuryDismissed = [...list, key];
    newList = a._personal.dashboardInjuryDismissed;
  });
  const el = document.getElementById('dashboard-content');
  if(el) el.innerHTML = renderDashboardContent();
  try { await updateDocSafe(doc(db,'personal',uid), {dashboardInjuryDismissed: newList}); }
  catch(e) { showToast('No se pudo guardar — se va a mostrar de nuevo si recargás'); }
}
window.dismissDashboardInjury = dismissDashboardInjury;

// Color de dolor 0-10 — mismo criterio que ya usan los botones del mapa
// corporal (pain-btn p-low/p-med/p-high), reusado acá para los badges.
function getPainColor(pain) {
  if(pain>=8) return {color:'var(--red)', bg:'rgba(195,58,44,0.14)'};
  if(pain>=4) return {color:'var(--amber)', bg:'rgba(198,124,15,0.14)'};
  return {color:'var(--green)', bg:'rgba(31,122,77,0.14)'};
}
window.getPainColor = getPainColor;

function getAthleteTeam(a) {
  return a?.teamId ? (S.teams||[]).find(t=>t.id===a.teamId) : null;
}
window.getAthleteTeam = getAthleteTeam;

// Badge de equipo/categoría — usa el color que vos le asignaste al equipo en
// Equipos (team.color); si es individual o el equipo no tiene color propio
// todavía, cae a un gris neutro.
function teamBadgeHtml(a) {
  const team = getAthleteTeam(a);
  const label = getAthleteCategoryLabel(a);
  if(team?.color) {
    return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${team.color}22;color:${team.color};white-space:nowrap">${label}</span>`;
  }
  return `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--bg4);color:var(--text2);white-space:nowrap">${label}</span>`;
}
window.teamBadgeHtml = teamBadgeHtml;

// Fila de badges para una lesión: gravedad (color de gravedad), zona del
// cuerpo (siempre el mismo color, es solo informativo) y dolor (color de la
// escala de dolor) + el badge de equipo al final.
function injuryBadgesHtml({severity, zoneLabel, pain, athlete}) {
  const sevInfo = severityInfo(severity) || severityInfo('leve');
  const painC = getPainColor(pain);
  return `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">
    <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${sevInfo.color}22;color:${sevInfo.color};white-space:nowrap">${sevInfo.label}</span>
    <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--blue-dim);color:var(--blue);white-space:nowrap">${zoneLabel}</span>
    <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${painC.bg};color:${painC.color};white-space:nowrap">dolor ${pain}/10</span>
    ${teamBadgeHtml(athlete)}
  </div>`;
}
window.injuryBadgesHtml = injuryBadgesHtml;

// Marcas de dolor de ANTES de que existiera la distinción lesión/molestia
// (isInjury sin definir todavía) — se listan acá para clasificarlas de una,
// en vez de tener que entrar atleta por atleta al mapa corporal de cada uno.
function getUnclassifiedInjuries(athletes) {
  const allBodyZones = [...BODY_ZONES.front, ...BODY_ZONES.back];
  const rows = [];
  (athletes||[]).forEach(a=>{
    const injuries = a._personal?.injuries||{};
    Object.entries(injuries).forEach(([zoneId,inj])=>{
      if(!inj.pain||inj.pain<=0) return;
      if(inj.isInjury===true||inj.isInjury===false) return;
      rows.push({a, zoneId, inj, zoneLabel: allBodyZones.find(z=>z.id===zoneId)?.label||zoneId});
    });
  });
  return rows;
}
window.getUnclassifiedInjuries = getUnclassifiedInjuries;

function openInjuryClassifyScreen() {
  S.adminView = 'injury_classify';
  S.currentView = 'admin';
  renderBottomBar();
  renderMain();
}
window.openInjuryClassifyScreen = openInjuryClassifyScreen;

function renderInjuryClassifyScreen() {
  const rows = getUnclassifiedInjuries(S.dashAthletes||[]);
  return `<div class="team-detail-header">
    <button class="back-btn" data-back="admin-main">‹</button>
    <div class="team-detail-title">Clasificar molestias/lesiones</div>
  </div>
  <div style="font-size:12px;color:var(--text3);margin-bottom:16px">
    Estos dolores se marcaron antes de que existiera esta distinción. Elegí de una si cada uno es una lesión de verdad (entra en las alertas del Dashboard) o una molestia (solo se ve dentro del equipo, no genera alerta). Una vez que elijas, esa fila desaparece de esta lista.
  </div>
  <div class="admin-section">
    <div class="admin-section-title">${rows.length} sin clasificar</div>
    ${rows.length ? rows.map(({a,zoneId,inj,zoneLabel})=>`
      <div class="admin-item" style="flex-direction:column;align-items:stretch;gap:8px">
        <div>
          <div class="admin-item-lbl">${a.name||a.email}</div>
          <div style="font-size:11px;color:var(--text3)">${zoneLabel} · dolor ${inj.pain}/10${inj.note?' · '+inj.note:''}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="abtn" style="flex:1" onclick="adminSetIsInjury('${a.uid}','${zoneId}',false)">Molestia</button>
          <button class="abtn abtn-d" style="flex:1" onclick="adminSetIsInjury('${a.uid}','${zoneId}',true)">Lesión</button>
        </div>
      </div>`).join('') : `<div style="padding:12px 16px;font-size:13px;color:var(--green)">✓ Ya clasificaste todo.</div>`}
  </div>`;
}
window.renderInjuryClassifyScreen = renderInjuryClassifyScreen;

async function adminSetIsInjury(uid, zoneId, val) {
  const a = (S.dashAthletes||[]).find(x=>x.uid===uid) || (S.adminAthletes||[]).find(x=>x.uid===uid);
  const personal = a?._personal;
  if(!personal?.injuries?.[zoneId]) return;
  try {
    let zone = await fetchFreshInjuryZone(uid, zoneId);
    if(zone===null) zone = {...personal.injuries[zoneId]};
    zone.isInjury = val;
    await updateDocSafe(doc(db,'personal',uid), {[`injuries.${zoneId}`]: zone});
    personal.injuries[zoneId] = zone;
    showToast(val?'✓ Marcada como lesión':'✓ Marcada como molestia');
    renderMain();
  } catch(e) { showToast('Error al guardar'); }
}
window.adminSetIsInjury = adminSetIsInjury;

function renderDashboardContent() {
  const athletes = S.dashAthletes;
  const today = todayLocal();
  const isDesktop = window.innerWidth >= 900;
  
  // Aggregate stats
  const totalAthletes = athletes.length;
  const trainedToday = athletes.filter(a=>{
    const logs = a._personal?.history?._sessionLogs||[];
    return logs.some(l=>l.date===today);
  }).length;
  const wellnessToday = athletes.filter(a=>a._personal?.wellness?.[today]).length;

  // Alert detection: ACWR risk + wellness silence (2+ days without check-in)
  const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate()-2);
  const twoDaysAgoStr = toLocalDateStr(twoDaysAgo);

  const acwrAlerts = athletes.filter(a=>{
    const logs = a._personal?.history?._sessionLogs||[];
    const m = calcLoadMetrics(logs);
    return m && m.acwr && m.acwr>1.5;
  }).map(a=>({athlete:a, type:'acwr', detail:'ACWR elevado'}));

  // Alertas de lesiones — lo que de verdad requiere atención, no "no llenó
  // el wellness" ni una molestia pasajera sin diagnóstico. Acá SOLO entran
  // lesiones reales (isRealInjury), en cualquier gravedad — leve, moderada o
  // grave — sin importar el dolor puntual de hoy (una operación de cruzado
  // sigue siendo grave aunque hoy no duela). Las molestias (dolores sin
  // diagnóstico, tipo "me duele la espalda") NO entran acá para no inundar
  // el panel de inicio de ruido — siguen viéndose completas dentro de cada
  // equipo.
  const allBodyZones = [...BODY_ZONES.front, ...BODY_ZONES.back];
  const injuryAlerts = [];
  athletes.forEach(a=>{
    const injuries = a._personal?.injuries || {};
    Object.entries(injuries).forEach(([zoneId, inj])=>{
      if(!inj.pain || inj.pain<=0) return;
      if(!isRealInjury(inj)) return;
      const sev = inj.severity || 'leve';
      const zoneLabel = allBodyZones.find(z=>z.id===zoneId)?.label || zoneId;
      const sevInfo = severityInfo(sev);
      injuryAlerts.push({
        athlete:a, type:'injury', severity:sev, zoneLabel, pain:inj.pain,
        detail: `${sevInfo?.label||'Leve'} · ${zoneLabel} · dolor ${inj.pain}/10`
      });
    });
  });

  const allAlerts = [...acwrAlerts, ...injuryAlerts];
  const alertAthletes = acwrAlerts.map(x=>x.athlete); // keep for backward compat in metric card

  let html = `<div class="metric-grid" style="margin-bottom:20px">
    <div class="metric-card" style="border-left:3px solid var(--accent);cursor:pointer" onclick="scrollToDashAthleteList()">
      <div class="metric-card-label">ATLETAS <span class="metric-card-icon">${metricIconSvg('atletas')}</span></div>
      <div class="metric-card-value" data-countup="${totalAthletes}">${totalAthletes}</div>
      <div class="metric-card-sub">registrados · tocá para ver la lista</div>
    </div>
    <div class="metric-card" style="border-left:3px solid var(--warm);cursor:pointer" onclick="openTrainedTodayScreen()">
      <div class="metric-card-label">ENTRENARON HOY <span class="metric-card-icon">${metricIconSvg('entrenaron')}</span></div>
      <div class="metric-card-value" style="color:${trainedToday>0?'var(--green)':'var(--text)'}" data-countup="${trainedToday}">${trainedToday}</div>
      <div class="metric-card-sub">de ${totalAthletes} atletas · tocá para ver quiénes</div>
    </div>
    <div class="metric-card" style="border-left:3px solid var(--green);cursor:pointer" onclick="openReminderScreen()">
      <div class="metric-card-label">WELLNESS HOY <span class="metric-card-icon">${metricIconSvg('wellness')}</span></div>
      <div class="metric-card-value" style="color:${wellnessToday>0?'var(--green)':'var(--text)'}" data-countup="${wellnessToday}">${wellnessToday}</div>
      <div class="metric-card-sub">registros enviados · tocá para recordar</div>
    </div>
    ${allAlerts.length?`<div class="metric-card" style="border-left:3px solid var(--red);border-color:rgba(195,58,44,0.3)">
      <div class="metric-card-label" style="color:var(--red)">ALERTAS ⚠</div>
      <div class="metric-card-value" style="color:var(--red)" data-countup="${allAlerts.length}">${allAlerts.length}</div>
      <div class="metric-card-sub">requieren atención</div>
    </div>`:''}
  </div>`;

  // Marcas de dolor de antes de la distinción lesión/molestia — banner bien
  // visible para clasificarlas de una (ver getUnclassifiedInjuries).
  const unclassified = getUnclassifiedInjuries(athletes);
  if(unclassified.length) {
    html += `<div style="background:var(--amber-dim);border:1px solid rgba(198,124,15,0.3);border-radius:var(--r);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;cursor:pointer" onclick="openInjuryClassifyScreen()">
      <span style="color:var(--amber);font-size:16px">⚠</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:var(--amber)">${unclassified.length} dolor${unclassified.length===1?'':'es'} marcado${unclassified.length===1?'':'s'} antes de esta actualización, sin clasificar</div>
        <div style="font-size:11px;color:var(--text3)">Tocá para decidir de una cuáles son lesión y cuáles molestia</div>
      </div>
      <span style="color:var(--text3);font-size:16px">›</span>
    </div>`;
  }

  // "Atención requerida" y "Lesiones recientes" van al mismo nivel (lado a
  // lado en desktop, apiladas en celular) — ambas ordenadas por grupo de
  // población (Liga de Honor → Juniors → Juveniles → Cadetes → Individuales)
  // y con el mismo filtro compartido arriba, en vez de una sola lista larga.
  if(allAlerts.length || getRecentInjuryFeed(athletes).length) {
    const catFilter = S.dashInjuryCategoryFilter || null;
    let alertsSorted = catFilter ? allAlerts.filter(x=>getAthleteCategoryLabel(x.athlete)===catFilter) : allAlerts.slice();
    alertsSorted.sort((a,b)=>injuryCategoryRank(getAthleteCategoryLabel(a.athlete))-injuryCategoryRank(getAthleteCategoryLabel(b.athlete)));

    let recentFeed = getRecentInjuryFeed(athletes);
    if(catFilter) recentFeed = recentFeed.filter(r=>getAthleteCategoryLabel(r.athlete)===catFilter);
    // Solo por fecha de última actualización, la más reciente arriba — antes
    // agrupaba por categoría primero, así que una lesión de hoy podía quedar
    // más abajo que una de hace semanas solo por el orden de categorías.
    recentFeed.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

    html += renderDashInjuryCategoryFilters();

    const alertsPanel = `<div style="background:var(--bg2);border:1px solid rgba(195,58,44,0.25);border-radius:var(--r);overflow:hidden;height:100%">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
        <span style="color:var(--red);font-size:16px">⚠</span>
        <span style="font-size:14px;font-weight:600;flex:1">Atención requerida (${alertsSorted.length})</span>
      </div>
      ${alertsSorted.length?alertsSorted.map(({athlete,type,detail,severity,zoneLabel,pain})=>`
        <div style="padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="adminOpenAthleteDash('${athlete.uid}')">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${athlete.name||athlete.email}</div>
            <span style="color:var(--text3);font-size:16px;flex-shrink:0">›</span>
          </div>
          ${type==='injury'
            ? injuryBadgesHtml({severity,zoneLabel,pain,athlete})
            : `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--red-dim);color:var(--red);white-space:nowrap">${detail}</span>${teamBadgeHtml(athlete)}</div>`}
        </div>`).join(''):`<div style="padding:12px 16px;font-size:12px;color:var(--text3)">Sin alertas${catFilter?' en '+catFilter:''}.</div>`}
    </div>`;

    const recentPanel = `<div style="background:var(--bg2);border:1px solid var(--border2);border-radius:var(--r);overflow:hidden;height:100%">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);font-size:14px;font-weight:600">Lesiones recientes (${recentFeed.length})</div>
      ${recentFeed.length?recentFeed.map(r=>{
        const daysAgo = r.date ? Math.round((new Date(todayLocal()+'T00:00:00') - new Date(r.date+'T00:00:00'))/86400000) : null;
        const whenLabel = daysAgo==null ? 'sin fecha' : daysAgo<=0 ? 'hoy' : daysAgo===1 ? 'ayer' : `hace ${daysAgo} días`;
        const whenColor = daysAgo==null ? 'var(--text3)' : daysAgo<=1 ? 'var(--accent)' : daysAgo<=3 ? 'var(--text2)' : 'var(--text3)';
        return `
        <div style="padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="adminOpenAthleteDash('${r.athlete.uid}')">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.athlete.name||r.athlete.email}</div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <button onclick="event.stopPropagation();dismissDashboardInjury('${r.athlete.uid}','${r.zoneId}','${r.date}')" title="Sacar de este panel — sigue viva en la ficha del atleta" style="appearance:none;border:none;background:var(--bg3);color:var(--text3);width:20px;height:20px;border-radius:50%;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">×</button>
              <span style="color:var(--text3);font-size:16px">›</span>
            </div>
          </div>
          ${injuryBadgesHtml({severity:r.severity, zoneLabel:r.zoneLabel, pain:r.pain, athlete:r.athlete})}
          ${r.note?`<div style="font-size:12px;color:var(--text2);margin-top:5px;line-height:1.4">"${r.note}"</div>`:''}
          <div style="font-size:11.5px;font-weight:700;color:${whenColor};margin-top:5px">Última actualización: ${whenLabel}${r.date?` (${r.date})`:''}</div>
        </div>`;
      }).join(''):`<div style="padding:12px 16px;font-size:12px;color:var(--text3)">Sin lesiones activas${catFilter?' en '+catFilter:''}.</div>`}
    </div>`;

    html += isDesktop
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;align-items:start">${alertsPanel}${recentPanel}</div>`
      : `<div style="margin-bottom:16px">${alertsPanel}</div><div style="margin-bottom:20px">${recentPanel}</div>`;
  }

  if(!athletes.length) {
    html += `<div class="empty-state">No hay atletas registrados aún.<br><span style="font-size:12px">Cuando un atleta cree su cuenta, aparecerá aquí.</span></div>`;
    return html;
  }

  // Búsqueda + filtro por equipo — para que esto siga siendo usable con 30-50 atletas,
  // no solo con 2. Filas compactas en vez de una tarjeta enorme por atleta.
  html += `<div style="margin-bottom:10px">
    <input id="dash-search-inp" value="${S.dashSearch||''}" placeholder="Buscar atleta..."
      style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rsm);padding:9px 13px;color:var(--text);font-size:14px;outline:none;font-family:inherit"
      oninput="setDashSearch(this.value)">
  </div>
  <div id="dash-team-filters" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${renderDashTeamFilters(athletes)}</div>
  <div id="dash-athlete-list">${renderDashboardAthleteList()}</div>`;

  html += `<div style="text-align:center;margin-top:12px">
    <button class="abtn" onclick="loadDashboard()" style="padding:8px 18px">↻ Actualizar</button>
  </div>`;

  return html;
}
window.renderDashboardContent=renderDashboardContent;

// Fila compacta por atleta (color, nombre, equipo/posición, chips de wellness/ACWR/hoy).
// Separada de renderDashboardContent para poder refrescarla sola al buscar/filtrar,
// sin re-renderizar el input de búsqueda (y así no perderle el foco al escribir).
function renderDashboardAthleteList() {
  const athletes = S.dashAthletes||[];
  const search = (S.dashSearch||'').toLowerCase();
  const teamFilter = S.dashTeamFilter||null;
  const today = todayLocal();

  let filtered = athletes;
  if(teamFilter==='individual') filtered = filtered.filter(a=>!a.teamId);
  else if(teamFilter) filtered = filtered.filter(a=>a.teamId===teamFilter);
  if(search) filtered = filtered.filter(a=>(a.name||a.email||'').toLowerCase().includes(search));

  if(!filtered.length) return `<div class="empty-state" style="padding:24px">Sin atletas que coincidan con la búsqueda.</div>`;

  return `<div class="wellness-card" style="padding:0">
    ${filtered.map(a=>{
      const logs = a._personal?.history?._sessionLogs||[];
      const metrics = calcLoadMetrics(logs);
      const todayLog = logs.filter(l=>l.date===today);
      const matchInfo = getRecentMatchCardInfo(a._personal, today);
      const wToday = a._personal?.wellness?.[today];
      const {pct:wPct, allFilled:wAllFilled} = getWellnessScore(wToday);
      const acwrStatus = getACWRStatus(metrics?.acwr??null, metrics?.daysOfHistory);
      const team = a.teamId ? S.teams?.find(t=>t.id===a.teamId) : null;
      // Últimos 7 días (mismo criterio y colores que "Cumplimiento semanal"
      // en Equipos), no solo hoy — un punto de wellness y uno de carga por
      // día, así se ve el patrón de la semana de un vistazo, no un solo día.
      const weekDates = getWeeklyComplianceDates(0);
      const weekStrip = `<span style="display:inline-flex;gap:2px;flex-shrink:0" title="Últimos 7 días — wellness arriba, carga abajo">
        ${weekDates.map(d=>{
          const wDone = getWellnessScore(a._personal?.wellness?.[d]).allFilled;
          const cDone = logs.some(l=>l.date===d);
          return `<span style="display:flex;flex-direction:column;gap:2px">
            <span style="width:6px;height:6px;border-radius:50%;background:${wDone?'var(--accent)':'var(--border2)'}"></span>
            <span style="width:6px;height:6px;border-radius:50%;background:${cDone?'var(--warm)':'var(--border2)'}"></span>
          </span>`;
        }).join('')}
      </span>`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onclick="adminOpenAthleteDash('${a.uid}')" onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background=''">
        ${avatarHtml(a.name||a.email, a.color, 32, a.photoUrl)}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name||a.email}</div>
          <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${team?team.name+(team.category?' · '+team.category:''):'Individual'}${a.position?' · '+a.position:''}${hasPlayedTwoGamesThisWeek(a._personal)?' · <span style="color:var(--amber);font-weight:700">2x esta semana</span>':''}</div>
          ${matchInfo?`<div style="display:flex;align-items:center;gap:5px;margin-top:3px">
            <span style="font-size:10.5px;padding:2px 8px;border-radius:20px;background:var(--accent-dim);color:var(--accent-text);font-weight:700;white-space:nowrap">🏆 ${matchInfo.mins}' · RPE ${matchInfo.rpe}${matchInfo.daysAgo>0?' · hace '+matchInfo.daysAgo+'d':''}</span>
            ${matchInfo.hadMolestia?`<span style="font-size:10.5px;padding:2px 8px;border-radius:20px;background:var(--red-dim);color:var(--red);font-weight:700;white-space:nowrap">⚠ molestia</span>`:''}
          </div>`:''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;align-items:center">
          ${weekStrip}
          ${wAllFilled?sparklineSvg(getWellnessSparklineData(a._personal,7), getWellnessState(wPct).color, 36, 16):''}
          ${wAllFilled?`<span style="font-size:11px;padding:3px 8px;border-radius:20px;background:var(--bg3);color:${getWellnessState(wPct).color};font-weight:600;white-space:nowrap">${wPct}%</span>`:''}
          ${metrics?.acwr!=null?`<span style="font-size:11px;padding:3px 8px;border-radius:20px;background:var(--bg3);color:${acwrStatus.color};font-weight:600;white-space:nowrap">ACWR ${metrics.acwr.toFixed(2)}</span>`:''}
          ${todayLog.length?`<span style="font-size:11px;padding:3px 8px;border-radius:20px;background:var(--bg3);color:var(--green);white-space:nowrap">✓ hoy</span>`:''}
        </div>
        <span style="color:var(--text3);font-size:16px;flex-shrink:0">›</span>
      </div>`;
    }).join('')}
  </div>`;
}
window.renderDashboardAthleteList=renderDashboardAthleteList;

function updateDashboardAthleteList() {
  const el=document.getElementById('dash-athlete-list');
  if(el) el.innerHTML=renderDashboardAthleteList();
}
window.updateDashboardAthleteList=updateDashboardAthleteList;

// Chips de "Todos / Individuales / equipo" — separados para poder
// refrescarlos junto con la lista al filtrar. Antes solo se refrescaba la
// lista de abajo: filtraba bien, pero el chip tocado nunca se pintaba de
// azul porque su propio HTML no se volvía a generar.
function renderDashTeamFilters(athletes) {
  const teamsWithAthletes = [...new Set(athletes.filter(a=>a.teamId).map(a=>a.teamId))]
    .map(tid=>S.teams?.find(t=>t.id===tid)).filter(Boolean);
  return `<button class="lib-filter ${!S.dashTeamFilter?'active':''}" onclick="setDashTeamFilter(null)">Todos (${athletes.length})</button>
    <button class="lib-filter ${S.dashTeamFilter==='individual'?'active':''}" onclick="setDashTeamFilter('individual')">Individuales</button>
    ${teamsWithAthletes.map(t=>`<button class="lib-filter ${S.dashTeamFilter===t.id?'active':''}" onclick="setDashTeamFilter('${t.id}')">${t.name}${t.category?' · '+t.category:''}</button>`).join('')}`;
}
window.renderDashTeamFilters = renderDashTeamFilters;

function updateDashTeamFilters() {
  const el=document.getElementById('dash-team-filters');
  if(el) el.innerHTML=renderDashTeamFilters(S.dashAthletes||[]);
}
window.updateDashTeamFilters = updateDashTeamFilters;

function setDashSearch(v) { S.dashSearch=v; updateDashboardAthleteList(); }
window.setDashSearch=setDashSearch;

function setDashTeamFilter(v) { S.dashTeamFilter=v; updateDashTeamFilters(); updateDashboardAthleteList(); }
window.setDashTeamFilter=setDashTeamFilter;

async function adminOpenAthleteDash(uid) {
  renderBottomBar();
  await adminOpenAthlete(uid);
}
window.adminOpenAthleteDash=adminOpenAthleteDash;

// Athlete home (non-admin) — brief summary
function renderAthleteHome() {
  const today = todayLocal();
  const logs = S.history?._sessionLogs||[];
  const todayLogs = logs.filter(l=>l.date===today);
  const metrics = calcLoadMetrics(logs);
  const acwrSt = getACWRStatus(metrics?.acwr||null, metrics?.daysOfHistory);
  const hasTodayWellness = !!S.wellness[today];
  
  const routineName = S.assignedRoutine?.name || null;
  return `<div class="page-header">
    <div class="page-title">Hola${S.userData?.name?' '+S.userData.name.trim().split(/\s+/).slice(-1)[0]:''}!</div>
    <div class="page-subtitle">${new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</div>
  </div>
  ${routineName?`<div style="background:var(--accent-dim);border:1.5px solid rgba(36,59,107,0.25);border-radius:var(--rsm);padding:10px 14px;margin-bottom:16px;font-size:13px;display:flex;align-items:center;gap:8px">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
    <span style="color:var(--accent-text);font-weight:600">Rutina activa:</span>
    <span style="color:var(--text)">${routineName}</span>
  </div>`:''}
  
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    <div class="metric-card" style="cursor:pointer" onclick="switchView('session')">
      <div class="metric-card-label">HOY</div>
      <div class="metric-card-value" style="font-size:22px">${todayLogs.length?'✓':'—'}</div>
      <div class="metric-card-sub">${todayLogs.length?`${todayLogs.reduce((a,l)=>a+l.ua,0)} UA registradas`:'Sesión pendiente'}</div>
    </div>
    <div class="metric-card" style="cursor:pointer" onclick="switchView('wellness')">
      <div class="metric-card-label">WELLNESS</div>
      <div class="metric-card-value" style="font-size:22px">${hasTodayWellness?'✓':'—'}</div>
      <div class="metric-card-sub">${hasTodayWellness?'Registrado hoy':'Sin registro hoy'}</div>
    </div>
  </div>
  
  ${metrics?`<div class="wellness-card" style="margin-bottom:14px">
    <div class="wellness-title">Control de carga</div>
    <div class="wellness-sub">Últimas 4 semanas</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:14px 0">
      <div style="text-align:center;padding:10px;border-right:1px solid var(--border)">
        <div style="font-size:24px;font-weight:800;color:${acwrSt.color}">${metrics.acwr?.toFixed(2)||'—'}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:4px">ACWR ${infoBtn('acwr')}</div>
        <div style="font-size:11px;color:${acwrSt.color};margin-top:2px">${acwrSt.label}</div>
      </div>
      <div style="text-align:center;padding:10px;border-right:1px solid var(--border)">
        <div style="font-size:24px;font-weight:800">${Math.round((metrics.monotony||0)*10)/10}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:4px">Monotonía ${infoBtn('monotony')}</div>
        <div style="font-size:11px;color:${getMonotonyStatus(metrics.monotony).color};margin-top:2px">${getMonotonyStatus(metrics.monotony).label}</div>
      </div>
      <div style="text-align:center;padding:10px">
        <div style="font-size:24px;font-weight:800">${metrics.acuteUA}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:4px">UA semana ${infoBtn('ua')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${metrics.sessions} sesiones</div>
      </div>
    </div>
  </div>`:''}
  
  <div style="display:flex;gap:10px;margin-top:4px">
    <button class="finish-btn" style="flex:1" onclick="switchView('session')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
      Ir a mi sesión
    </button>
    ${!hasTodayWellness?`<button class="finish-btn" style="flex:1;background:var(--bg3);border:1px solid var(--border);color:var(--text2)" onclick="switchView('wellness')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      Wellness
    </button>`:''}
  </div>`;
}

// Also add 'dashboard' to renderMain

// ── LIBRARY VIEW ─────────────────────────────────────────────
function renderLibraryView() {
  const allTags = [...new Set(S.library.flatMap(e=>e.tags||[]))].sort();
  return `<div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between">
    <div>
      <div class="page-title">Biblioteca de ejercicios</div>
      <div class="page-subtitle">${S.library.length} ejercicios · ${allTags.length} categorías</div>
    </div>
    <button class="back-btn" data-back="admin-main" style="flex-shrink:0;margin-top:4px">‹</button>
  </div>

  <!-- Search + filter -->
  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <input id="lib-view-search" value="${S._libViewSearch||''}" placeholder="Buscar ejercicio..."
      style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rsm);padding:9px 13px;color:var(--text);font-size:14px;outline:none;font-family:inherit"
      oninput="S._libViewSearch=this.value;updateLibViewResults()"
      onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border2)'">
    <button class="abtn abtn-p" onclick="addLibraryExercise()">+ Nuevo ejercicio</button>
  </div>

  <div id="lib-view-body">${renderLibViewBody()}</div>`;
}
window.renderLibraryView=renderLibraryView;

// Recalcula SOLO la parte filtrable (chips de tags + lista) sin tocar el input
// de búsqueda — así el input nunca pierde el foco mientras se escribe.
function renderLibViewBody() {
  const search = S._libViewSearch||'';
  if(!S._libViewFilters) S._libViewFilters = new Set();
  const filters = S._libViewFilters;
  const allTags = [...new Set(S.library.flatMap(e=>e.tags||[]))].sort();
  // Cuántos ejercicios todavía no tienen categoría principal + sub-categorías
  // completas bajo la taxonomía nueva — para poder recategorizar la
  // biblioteca entera de forma sistemática en vez de ir descubriéndolo uno
  // por uno al abrir cada ejercicio.
  const pendingCount = S.library.filter(e=>getMissingLibRules(e.tags).length).length;

  let items = S.library;
  if(search) items = items.filter(e=>e.name.toLowerCase().includes(search.toLowerCase())||
    (e.tags||[]).some(t=>t.toLowerCase().includes(search.toLowerCase())));
  if(filters.size) items = items.filter(e=>[...filters].some(f=>e.tags?.includes(f)));
  if(S._libViewPendingOnly) items = items.filter(e=>getMissingLibRules(e.tags).length);
  // Los que cumplen TODAS las categorías elegidas van primero, después los
  // que cumplen menos — y alfabético como desempate (y como único criterio
  // si no hay filtros activos).
  items = [...items].sort((a,b)=>{
    if(filters.size>0) {
      const am=[...filters].filter(f=>a.tags?.includes(f)).length;
      const bm=[...filters].filter(f=>b.tags?.includes(f)).length;
      if(bm!==am) return bm-am;
    }
    return a.name.localeCompare(b.name);
  });

  return `<!-- Tag filters — multi-select: un click selecciona, otro click desselecciona -->
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
    <button class="lib-filter ${!filters.size&&!S._libViewPendingOnly?'active':''}" onclick="S._libViewFilters=new Set();S._libViewPendingOnly=false;updateLibViewResults()">Todos</button>
    ${pendingCount?`<button class="lib-filter ${S._libViewPendingOnly?'active':''}" style="color:var(--amber);border-color:var(--amber)" onclick="S._libViewPendingOnly=!S._libViewPendingOnly;updateLibViewResults()">⚠ Sin categorizar (${pendingCount})</button>`:''}
    ${allTags.map(t=>`<span style="position:relative;display:inline-flex">
      <button class="lib-filter ${filters.has(t)?'active':''}" onclick="setLibFilter('${t}')" style="padding-right:20px">${t}</button>
      <span onclick="event.stopPropagation();deleteLibraryTag('${t}')" title="Eliminar categoría" style="position:absolute;top:2px;right:4px;width:14px;height:14px;border-radius:50%;background:var(--red);color:#fff;font-size:10px;line-height:14px;text-align:center;cursor:pointer;font-weight:700">×</span>
    </span>`).join('')}
  </div>

  <!-- Exercise list -->
  ${items.length?`<div class="wellness-card">
    ${items.map((ex,i)=>{
      const hasV=!!S.videos[ex.id];
      const missing = getMissingLibRules(ex.tags);
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);transition:background .15s"
           onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background=''">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:500" id="libname-${ex.id}">${ex.name}${missing.length?' <span style="font-size:10px;color:var(--amber);font-weight:700">⚠ sin categorizar</span>':''}</div>
          <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
            ${(ex.tags||[]).map(t=>`<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:var(--accent-dim);color:var(--accent-text);border:1px solid rgba(36,59,107,0.2)">${t}</span>`).join('')}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <div class="ex-icon-btn ${hasV?'has-video':''}" data-videokey="${ex.id}" onclick="openVideoModal('${ex.id}','${ex.name}',true)" title="Video">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          <button class="abtn" onclick="editLibraryExercise('${ex.id}')" style="font-size:11px">Editar</button>
          <button class="abtn abtn-d" onclick="deleteLibraryExercise('${ex.id}')" style="font-size:11px">×</button>
        </div>
      </div>`;}).join('')}
  </div>`:`<div class="empty-state">Sin ejercicios que coincidan.<br><span style="font-size:12px">Probá con otra búsqueda o creá uno nuevo.</span></div>`}`;
}
window.renderLibViewBody=renderLibViewBody;

function updateLibViewResults() {
  const el=document.getElementById('lib-view-body');
  if(el) el.innerHTML=renderLibViewBody();
}
window.updateLibViewResults=updateLibViewResults;

// Reemplaza los viejos prompt() de nombre/categorías por el mismo modal con
// selector de categorías con un click que usa el resto de la app — así
// crear/editar desde la Biblioteca completa tiene exactamente las mismas
// funciones que crear un ejercicio nuevo desde una rutina o una sesión.
function openLibExerciseModal(id) {
  const ex = id ? S.library.find(e=>e.id===id) : null;
  S._exFormEditId = id||null;
  S._exFormTags = new Set(ex?.tags||[]);
  document.getElementById('exform-modal-title').textContent = ex ? 'Editar ejercicio' : 'Nuevo ejercicio';
  document.getElementById('exform-name-inp').value = ex?.name||'';
  document.getElementById('exform-video-inp').value = (id && S.videos[id]) || '';
  document.getElementById('exform-delete-btn').style.display = ex ? 'block' : 'none';
  renderTagChipPicker('exform-tags-picker','_exFormTags');
  document.getElementById('exform-overlay').classList.add('open');
}
window.openLibExerciseModal = openLibExerciseModal;

function closeExFormModal() { document.getElementById('exform-overlay').classList.remove('open'); }
window.closeExFormModal = closeExFormModal;

function closeExFormIfOutside(e) { if(e.target===document.getElementById('exform-overlay')) closeExFormModal(); }
window.closeExFormIfOutside = closeExFormIfOutside;

function saveLibExerciseModal() {
  const name = document.getElementById('exform-name-inp').value.trim();
  if(!name) { showToast('Ingresá un nombre'); return; }
  const tags = [...(S._exFormTags||new Set())];
  const missing = getMissingLibRules(tags);
  if(missing.length) { showToast('Falta elegir: '+missing.map(m=>m.label).join(' · ')); return; }
  const videoUrl = document.getElementById('exform-video-inp').value.trim();
  const exId = S._exFormEditId || genId();
  if(S._exFormEditId) {
    const ex = S.library.find(e=>e.id===S._exFormEditId);
    if(ex) { ex.name=name; ex.tags=tags; }
  } else {
    S.library.push({id:exId, name, tags});
  }
  if(videoUrl) S.videos[exId]=videoUrl; else delete S.videos[exId];
  scheduleSave();
  closeExFormModal();
  showToast('✓ Guardado');
  renderMain();
}
window.saveLibExerciseModal = saveLibExerciseModal;

function deleteFromExFormModal() {
  if(!S._exFormEditId) return;
  if(!confirm('¿Eliminar este ejercicio de la biblioteca?')) return;
  S.library = S.library.filter(e=>e.id!==S._exFormEditId);
  scheduleSave();
  closeExFormModal();
  showToast('Ejercicio eliminado');
  renderMain();
}
window.deleteFromExFormModal = deleteFromExFormModal;

function addLibraryExercise() { openLibExerciseModal(null); }
window.addLibraryExercise=addLibraryExercise;

function editLibraryExercise(id) { openLibExerciseModal(id); }
window.editLibraryExercise=editLibraryExercise;

function deleteLibraryExercise(id) {
  if(!confirm('¿Eliminar este ejercicio de la biblioteca?')) return;
  S.library = S.library.filter(e=>e.id!==id);
  scheduleSave();
  showToast('Ejercicio eliminado');
  renderMain();
}
window.deleteLibraryExercise=deleteLibraryExercise;

// ── PROFILE MENU ──────────────────────────────────────────────
function toggleProfileMenu(forceClose=false) {
  const m=document.getElementById('profile-menu');
  const isDesktop=window.innerWidth>=900;
  if(isDesktop){
    m.style.top='auto';m.style.bottom='80px';m.style.left='calc(var(--sidebar-w) + 8px)';m.style.right='auto';
  } else {
    m.style.top='54px';m.style.bottom='';m.style.left='';m.style.right='12px';
  }
  m.classList.toggle('open',!forceClose&&!m.classList.contains('open'));
}
window.toggleProfileMenu=toggleProfileMenu;

document.addEventListener('click',e=>{
  const m=document.getElementById('profile-menu');
  const btn=document.getElementById('avatar-btn');
  if(m&&btn&&!m.contains(e.target)&&!btn.contains(e.target)) m.classList.remove('open');
});

// ── GLOBAL BACK BUTTON HANDLER ────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-back]');
  if(!btn) return;
  const action = btn.getAttribute('data-back');
  switch(action) {
    case 'team-list':
      // _teamViewLoadingId también se limpia acá: si había un fetch de
      // openTeam en vuelo, esto le avisa que ya no importa su resultado —
      // ver el comentario en openTeam().
      S.teamView=null; S.teamDayEdit=null; S.teamDayIdx=0; S._teamViewLoadingId=null;
      S.currentView='teams'; renderBottomBar(); renderMain(); break;
    case 'team-day':
      S.teamDayEdit=null;
      S.currentView='teams'; renderBottomBar(); renderMain(); break;
    case 'admin-main':
      S.adminView='main';
      S.currentView='admin'; renderBottomBar(); renderMain(); break;
    case 'admin-athletes':
      S.adminView='athletes'; S.currentView='admin'; adminGoAthletes(); break;
    case 'routine-editor':
      S.adminView=(S._routineEditorPrev||'routines');
      S.currentView='admin'; renderBottomBar(); renderMain(); break;
    case 'home':
      goHome(); break;
  }
});

// ── ENTER KEY FOR AUTH ────────────────────────────────────────
document.getElementById('auth-pass').addEventListener('keydown',e=>{ if(e.key==='Enter') authAction(); });
document.getElementById('auth-email').addEventListener('keydown',e=>{ if(e.key==='Enter') document.getElementById('auth-pass').focus(); });

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

// ── GESTOS DE CELULAR: deslizar hacia abajo para refrescar, y hacia los
// costados para cambiar de sección — igual que cualquier app nativa. ──────
(function setupTouchGestures(){
  const main = document.getElementById('main');
  if(!main) return;

  // Pull-to-refresh
  const ptr = document.createElement('div');
  ptr.id='ptr-indicator';
  ptr.style.cssText='position:fixed;top:0;left:0;right:0;display:flex;justify-content:center;align-items:center;height:0;overflow:hidden;transition:height .15s;z-index:600;color:var(--text3,#7a90b8);font-size:12px;background:var(--bg2,#111827);pointer-events:none';
  document.body.appendChild(ptr);

  let pStartY=0, pulling=false;
  const PTR_THRESHOLD=70;

  main.addEventListener('touchstart', e=>{
    if(main.scrollTop<=0) { pStartY=e.touches[0].clientY; pulling=true; }
  }, {passive:true});

  main.addEventListener('touchmove', e=>{
    if(!pulling) return;
    const diff=e.touches[0].clientY-pStartY;
    if(diff>0 && main.scrollTop<=0) {
      const h=Math.min(diff*0.5, PTR_THRESHOLD);
      ptr.style.height=h+'px';
      ptr.textContent = h>=PTR_THRESHOLD ? '↑ Soltá para actualizar' : '↓ Deslizá para actualizar';
    } else { pulling=false; ptr.style.height='0px'; }
  }, {passive:true});

  main.addEventListener('touchend', ()=>{
    if(!pulling) return;
    pulling=false;
    if(parseInt(ptr.style.height||'0')>=PTR_THRESHOLD) {
      ptr.textContent='Actualizando…';
      setTimeout(()=>location.reload(), 150);
    } else {
      ptr.style.height='0px';
    }
  });

  // Swipe horizontal entre secciones de la barra inferior
  // BUG encontrado y corregido acá: este listener mide CUALQUIER arrastre
  // horizontal dentro de #main, sin fijarse en qué elemento empezó — así que
  // arrastrar una barra deslizante (horas de sueño, RPE) se leía como un
  // swipe de cambio de pestaña. En el peor caso, navigateSwipe() reemplazaba
  // #main entero A MITAD del gesto, antes de que el input llegara a disparar
  // su propio onchange — el valor arrastrado se perdía sin guardarse nunca
  // (volvía a 0 al re-renderizar), además de mandar al usuario a otra
  // pestaña sin querer. Ahora un toque que arranca sobre un <input
  // type="range"> nunca arma el swipe — el slider queda libre para manejar
  // su propio gesto sin que nada más en la pantalla se mueva.
  let sStartX=0, sStartY=0, swiping=false;
  main.addEventListener('touchstart', e=>{
    const t=e.target;
    if(t && t.tagName==='INPUT' && t.type==='range') { swiping=false; return; }
    sStartX=e.touches[0].clientX; sStartY=e.touches[0].clientY; swiping=true;
  }, {passive:true});
  main.addEventListener('touchend', e=>{
    if(!swiping) return; swiping=false;
    const dx=e.changedTouches[0].clientX-sStartX;
    const dy=e.changedTouches[0].clientY-sStartY;
    if(Math.abs(dx)>70 && Math.abs(dx)>Math.abs(dy)*2) navigateSwipe(dx<0?1:-1);
  });
})();

// ── CRONÓMETRO DE DESCANSO (botón flotante en Mi Rutina) ─────────────────
function toggleRestTimerPanel() {
  const panel = document.getElementById('rest-timer-panel');
  if(!panel) return;
  panel.style.display = panel.style.display==='none' ? 'block' : 'none';
}
window.toggleRestTimerPanel = toggleRestTimerPanel;

function updateRestTimerDisplay() {
  const el = document.getElementById('rest-timer-display');
  if(!el) return;
  const s = S._restTimerRemaining ?? 90;
  const m = Math.floor(Math.abs(s)/60), r = Math.abs(s)%60;
  el.textContent = (s<0?'-':'')+m+':'+String(r).padStart(2,'0');
  el.classList.toggle('rest-timer-done', s<=0);
}
window.updateRestTimerDisplay = updateRestTimerDisplay;

function setRestTimerPreset(sec) {
  clearInterval(S._restTimerInterval);
  S._restTimerRunning = false;
  S._restTimerRemaining = sec;
  updateRestTimerDisplay();
  const btn = document.getElementById('rest-timer-startpause');
  if(btn) btn.textContent = '▶ Iniciar';
}
window.setRestTimerPreset = setRestTimerPreset;

function toggleRestTimerRun() {
  if(S._restTimerRemaining===undefined) S._restTimerRemaining = 90;
  const btn = document.getElementById('rest-timer-startpause');
  if(S._restTimerRunning) {
    clearInterval(S._restTimerInterval);
    S._restTimerRunning = false;
    if(btn) btn.textContent = '▶ Continuar';
  } else {
    S._restTimerRunning = true;
    if(btn) btn.textContent = '⏸ Pausar';
    S._restTimerInterval = setInterval(()=>{
      S._restTimerRemaining--;
      updateRestTimerDisplay();
      if(S._restTimerRemaining===0) {
        if(navigator.vibrate) navigator.vibrate([200,100,200,100,200]);
      }
    }, 1000);
  }
}
window.toggleRestTimerRun = toggleRestTimerRun;

function resetRestTimer() {
  clearInterval(S._restTimerInterval);
  S._restTimerRunning = false;
  S._restTimerRemaining = 90;
  updateRestTimerDisplay();
  const btn = document.getElementById('rest-timer-startpause');
  if(btn) btn.textContent = '▶ Iniciar';
}
window.resetRestTimer = resetRestTimer;

// Solo tiene sentido mostrar el cronómetro en la sesión de entrenamiento de
// un atleta (no en el resto de la app, ni para el admin).
function updateRestTimerFabVisibility() {
  const fab = document.getElementById('rest-timer-fab');
  if(!fab) return;
  const show = !S.isAdmin && S.currentView==='session';
  fab.style.display = show ? 'flex' : 'none';
  if(!show) { const p=document.getElementById('rest-timer-panel'); if(p) p.style.display='none'; }
}
window.updateRestTimerFabVisibility = updateRestTimerFabVisibility;

// Desliza el recuadro azul de la barra inferior hasta la pestaña activa —
// mismo tipo de transición suave que usan los números animados (countup).
function updateBottomBarIndicator() {
  const bb = document.getElementById('bottombar');
  const indicator = document.getElementById('bb-indicator');
  if(!bb || !indicator) return;
  const activeBtn = bb.querySelector('.bb-btn.active');
  if(!activeBtn) { indicator.style.width='0px'; return; }
  const inset = 6;
  indicator.style.left = (activeBtn.offsetLeft+inset)+'px';
  indicator.style.width = (activeBtn.offsetWidth-inset*2)+'px';
}
window.updateBottomBarIndicator = updateBottomBarIndicator;

function navigateSwipe(dir) {
  // Solo cambia de sección si estamos en una pantalla "de primer nivel" de
  // la barra inferior — si hay un detalle abierto (un atleta, un equipo,
  // etc.) el swipe no hace nada, para no navegar por sorpresa.
  const tabs = S.isAdmin ? ['dashboard','teams','atletas','admin'] : ['dashboard','session',...(isTeamAthlete()?['calendar']:[]),'wellness','evals','stats'];
  const idx = tabs.indexOf(S.currentView);
  if(idx<0) return;
  if(S.isAdmin && S.currentView==='admin' && S.adminView && S.adminView!=='main') return;
  if(S.isAdmin && S.currentView==='teams' && S.teamView) return;
  if(S.isAdmin && S.currentView==='atletas' && S.atletaView) return;
  const next = idx+dir;
  if(next<0||next>=tabs.length) return;
  switchView(tabs[next]);
}
window.navigateSwipe=navigateSwipe;
