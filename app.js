import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, orderBy, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// ── TIPOS DE LESIÓN/MOLESTIA ────────────────────────────────────
const INJURY_TYPES = { muscular: 'Muscular', articular: 'Articular', ligamentaria: 'Ligamentaria' };

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

const ALL_FILTERS = ['MMII','MMSS','zona media','unilateral','bilateral','fuerza','tracción','empuje','hombros','rehabilitación','funcional','iso','cadera','rodilla','lumbar'];

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

// ── STATE ─────────────────────────────────────────────────────
let S = {
  user: null, isAdmin: false, userData: null,
  currentView: 'dashboard', currentSession: 'A', currentWeek: 1,
  startDate: new Date().toISOString().split('T')[0],
  blocks: JSON.parse(JSON.stringify(DEFAULT_BLOCKS)),
  library: JSON.parse(JSON.stringify(DEFAULT_LIBRARY)),
  videos: {}, history: {}, wellness: {}, injuries: {}, injuryArchive: [],
  teams: [], progressView: { week: 1 },
  myTeam: null, // solo para atletas de equipo: el doc de su propio equipo
  teamSubview: 'rutina',      // 'rutina'|'wellness'|'stats'|'evals' dentro de un equipo
  atletaView: null,           // uid del atleta individual seleccionado (o null = lista)
  atletaSubview: 'rutina',
  evalScopeUids: null,        // si está seteado, Evaluaciones solo muestra estos uids
  libTarget: null, videoTarget: null,
  activeFilter: null, selectedZone: null,
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
    if (d.sessionLogs) { if(!S.history) S.history={}; S.history._sessionLogs=d.sessionLogs; }
    if (d.history) S.history = d.history;
    if (d.wellness) S.wellness = d.wellness;
    if (d.injuries) S.injuries = d.injuries;
    if (d.injuryArchive) S.injuryArchive = d.injuryArchive;
    if (d.currentWeek) S.currentWeek = d.currentWeek;
    if (d.startDate) S.startDate = d.startDate;
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

  if (S.isAdmin) {
    // Load teams
    const tSnap = await getDocs(collection(db, 'teams'));
    S.teams = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Load all routines
    const rSnap = await getDocs(collection(db, 'routines'));
    S.routines = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } else {
    // Athlete: la rutina PERSONAL (assignedRoutine) tiene prioridad.
    // Si no tiene una personal y pertenece a un equipo, hereda los "días de
    // entrenamiento" que el admin armó para ese equipo — son la rutina real.
    const assignedId = S.userData.assignedRoutine || null;
    if (assignedId) {
      const rSnap = await getDoc(doc(db, 'routines', assignedId));
      if (rSnap.exists()) {
        S.assignedRoutine = { id: assignedId, ...rSnap.data() };
        S.currentRoutineSessions = Object.keys(S.assignedRoutine.sessions || {});
        if (S.currentRoutineSessions.length) S.currentSession = S.currentRoutineSessions[0];
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
        S.currentRoutineSessions = Object.keys(sessions);
        if (S.currentRoutineSessions.length) S.currentSession = S.currentRoutineSessions[0];
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
  const initial = (S.userData.name || 'U')[0].toUpperCase();
  ['avatar-btn','avatar-btn-mobile'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.textContent=initial;
  });
  if (S.isAdmin) {
    document.getElementById('pm-admin').style.display = 'block';
  }

  renderBottomBar();
  renderAll();
});

// ── SAVE ──────────────────────────────────────────────────────
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToFirestore, 1500);
}

async function saveToFirestore() {
  if (!S.user) return;
  try {
    // Athletes with assigned routines don't save blocks (read-only from routine)
    const dataToSave = {
      history: S.history, evals: S.evals||{}, sessionLogs: (S.history._sessionLogs||[]),
      wellness: S.wellness, injuries: S.injuries, injuryArchive: S.injuryArchive||[],
      currentWeek: S.currentWeek, startDate: S.startDate,
      updatedAt: serverTimestamp()
    };
    if (S.isAdmin) {
      // Admin saves their own personal blocks
      dataToSave.blocks = S.blocks;
      // Biblioteca y videos son compartidos — van a su propio documento, no al personal
      await setDoc(doc(db, 'shared', 'library'), { library: S.library, videos: S.videos }, { merge: true });
    }
    await setDoc(doc(db, 'personal', S.user.uid), dataToSave, { merge: true });
  } catch(e) { console.error('Save error', e); }
}

// ── HELPERS ───────────────────────────────────────────────────
function genId() { return 'x' + Date.now() + Math.floor(Math.random()*9999); }
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
      <div>
        <label class="eval-lbl">Apellido y nombre</label>
        <input class="auth-inp" style="margin:0;display:block" type="text" value="${d.fullName || S.userData?.name || ''}" oninput="setOnboardingField('fullName',this.value)" placeholder="Ej: Pérez, Juan">
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
    html += `<div style="padding:0 16px 16px;display:flex;flex-direction:column;gap:12px">
      <div><label class="eval-lbl">Institución</label>
        <select class="auth-inp" style="margin:0" onchange="selectInstitution(this.value)">
          <option value="">Seleccionar...</option>
          ${Object.keys(INSTITUTIONS).map(inst=>`<option value="${inst}" ${d.institution===inst?'selected':''}>${inst}</option>`).join('')}
        </select>
      </div>
      ${d.institution ? `<div><label class="eval-lbl">Categoría</label>
        <select class="auth-inp" style="margin:0" onchange="setOnboardingField('category',this.value)">
          <option value="">Seleccionar...</option>
          ${INSTITUTIONS[d.institution].categories.map(c=>`<option value="${c}" ${d.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>`;
  }

  const canContinue = d.athleteType==='individual' ? !!(d.sport && d.position) : d.athleteType==='team' ? !!(d.institution && d.category) : false;
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
      <div class="body-svg-wrap">${renderBodySVG('front')}<div class="body-svg-label">Frente</div></div>
      <div class="body-svg-wrap">${renderBodySVG('back')}<div class="body-svg-label">Espalda</div></div>
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
      <div><b>Nombre:</b> ${d.fullName || '—'}</div>
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

function selectAthleteType(type) { S.onboardingData.athleteType = type; renderMain(); }
window.selectAthleteType = selectAthleteType;

function selectInstitution(inst) { S.onboardingData.institution = inst; S.onboardingData.category = ''; renderMain(); }
window.selectInstitution = selectInstitution;

function onboardingNext() {
  const d = S.onboardingData;
  if (S.onboardingStep === 1 && (!d.fullName || !d.age || !d.height || !d.weight)) {
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
async function findOrCreateTeam(institution, category) {
  const sport = INSTITUTIONS[institution].sport;
  const tSnap = await getDocs(collection(db, 'teams'));
  const existing = tSnap.docs.map(dd => ({ id: dd.id, ...dd.data() }))
    .find(t => t.institution === institution && t.category === category);
  if (existing) return existing.id;
  const id = genId();
  const team = {
    id, name: institution, sport, category, institution,
    players: [], memberUids: [], trainingDays: [], color: '',
    createdAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'teams', id), team);
  return id;
}

async function finishOnboarding() {
  const d = S.onboardingData;
  const btn = document.getElementById('onboarding-finish-btn');
  const errEl = document.getElementById('onboarding-err');
  if (errEl) errEl.textContent = '';
  if (btn) { btn.textContent = 'Guardando...'; btn.style.pointerEvents = 'none'; }
  try {
    const update = {
      name: d.fullName || S.userData.name,
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
      update.institution = d.institution;
      update.category = d.category;
      update.sport = INSTITUTIONS[d.institution].sport;
      update.position = null;
      const teamId = await findOrCreateTeam(d.institution, d.category);
      update.teamId = teamId;
      // Vincular esta cuenta real (uid) al roster del equipo, sin romper
      // el campo `players` (nombres) que ya usa el editor de días de equipo.
      const tRef = doc(db, 'teams', teamId);
      const tSnap = await getDoc(tRef);
      const tData = tSnap.exists() ? tSnap.data() : {};
      const memberUids = tData.memberUids || [];
      const players = tData.players || [];
      if (!memberUids.includes(S.user.uid)) memberUids.push(S.user.uid);
      if (!players.includes(update.name)) players.push(update.name);
      await updateDoc(tRef, { memberUids, players });
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
  switchView('session');
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
    {id:'session',  label:'Mi Rutina',   section:null, svg:'<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>'},
    {id:'wellness', label:'Wellness',    section:null, svg:'<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'},
    {id:'evals',    label:'Mis Saltos',  section:null, svg:'<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'},
    {id:'stats',    label:'Stats',       section:null, svg:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'},
  ];

  // Mobile bottom bar
  const bb = document.getElementById('bottombar');
  if(bb) bb.innerHTML = tabs.map(t=>`
    <button class="bb-btn ${S.currentView===t.id?'active':''}" id="bb-${t.id}" onclick="switchView('${t.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${t.svg}</svg>
      ${t.label}
    </button>`).join('');

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
  const dwl = document.getElementById('desktop-week-label');
  const sf = document.getElementById('sidebar-footer');
  if(dw) dw.style.display = isDesktop ? 'flex' : 'none';
  if(dwl) dwl.textContent = `Semana ${S.currentWeek}`;
  if(sf) sf.style.display = isDesktop ? 'block' : 'none';

  // Sync desktop user info
  const nd = document.getElementById('pm-name-desk');
  const rd = document.getElementById('pm-role-desk');
  if(nd) nd.textContent = S.userData?.name || '—';
  if(rd) rd.textContent = S.isAdmin ? 'Administrador' : 'Atleta';
}
window.renderBottomBar=renderBottomBar;

window.addEventListener('resize', ()=>{ renderBottomBar(); });

function renderAll() { renderSubnav(); renderMain(); }

function renderSubnav() {
  const nav=document.getElementById('subnav');
  const wp=document.getElementById('week-pill'); if(wp) wp.textContent=`Sem ${S.currentWeek}`;
  const dwl=document.getElementById('desktop-week-label'); if(dwl) dwl.textContent=`Semana ${S.currentWeek}`;
  if(S.currentView!=='session') { nav.innerHTML=''; return; }
  // Sessions: for admin use A/B/C/D; for athlete with routine use routine session names
  const sessions = getSessionList();
  nav.innerHTML=sessions.map(s=>{
    const sd=getSD(S.currentWeek,s);
    const done=sd.done;
    const active=S.currentSession===s;
    return `<button class="snav-tab ${active?'active':''} ${done&&!active?'done':''}"
      onclick="selectSession('${s}')">${done&&!active?'✓ ':''}${s}</button>`;
  }).join('');
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
    const ses = S.assignedRoutine.sessions || {};
    return ses[S.currentSession] || [];
  }
  return []; // No assigned routine = empty, not default
}
window.getCurrentBlocks=getCurrentBlocks;

function selectSession(s) {
  S.currentSession=s; renderAll();
}
window.selectSession = selectSession;

function renderMain() {
  const m=document.getElementById('main');
  switch(S.currentView) {
    case 'dashboard': m.innerHTML=renderDashboard(); setTimeout(loadDashboard,50); break;
    case 'session':  m.innerHTML=renderSession(); break;
    case 'progress': m.innerHTML=renderProgress(); break;
    case 'wellness': m.innerHTML=renderWellness(); break;
    case 'stats':    m.innerHTML=renderStats(); break;
    case 'teams':    m.innerHTML=renderTeams(); break;
    case 'atletas':  m.innerHTML=renderAtletas(); break;
    case 'settings': m.innerHTML=renderSettings(); break;
    case 'admin':    m.innerHTML=renderAdmin(); if(S.adminView==='athlete_detail') setTimeout(drawAthleteTrendChart,80); break;
    case 'library':  m.innerHTML=renderLibraryView(); break;
    case 'evals':    m.innerHTML=renderEvals(); setTimeout(drawEvalCharts,80); break;
    case 'onboarding': m.innerHTML=renderOnboarding(); break;
    default:         m.innerHTML='';
  }
  // re-draw charts if needed
  if(S.currentView==='evals') setTimeout(drawEvalCharts,50);
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
function renderSession() {
  const blocks = getCurrentBlocks();
  const sessionLabel = S.isAdmin ? `Sesión ${S.currentSession}` : (S.currentSession||'Sesión');
  const header = `<div class="page-header">
    <div class="page-title">${sessionLabel}</div>
    <div class="page-subtitle">Semana ${S.currentWeek} · ${new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</div>
  </div>`;
  if (!blocks.length) {
    if (!S.isAdmin) {
      return header + `<div class="empty-state" style="padding:40px 20px">
        <div style="font-size:32px;margin-bottom:12px">🏋️</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">Sin rutina asignada</div>
        <div style="font-size:13px;color:var(--text3);line-height:1.6">Tu entrenador está preparando tu planificación.<br>Pronto vas a ver tu rutina acá.</div>
      </div>`;
    }
    return header + `<div class="empty-state">Sin bloques en esta sesión.</div>`;
  }
  return header + blocks.map(b=>renderBlock(b)).join('')
    + `<button class="finish-btn" onclick="finishSession()">✓ Marcar sesión como completada</button>`;
}

function renderBlock(b) {
  const cc=b.colorKey||'bx';
  const open=b._open!==false;
  const exampleColors = {b1:'var(--teal)',b2:'var(--blue)',b3:'var(--purple)',b4:'var(--amber)',bx:'var(--text2)'};
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
    const sd=getSD(S.currentWeek,S.currentSession);
    const rpe=sd.rpe||7.5;
    inner+=`<div class="rpe-row">
      <span class="rpe-lbl">RPE objetivo:</span>
      <input type="range" class="rpe-slider" min="5" max="10" step="0.5" value="${rpe}" oninput="setRPE(this.value)">
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
      ${S.isAdmin?`<span class="block-del" onclick="deleteBlock(event,'${b.id}')">×</span>`:''}
      <span class="block-chevron">›</span>
    </div>
    <div class="block-body">${inner}</div>
  </div>`;
}

function renderExRow(ex,blockId,catIdx,forceReadOnly=false) {
  const d=getED(S.currentWeek,S.currentSession,ex.id);
  // Ejercicios agregados ANTES de que existiera libId no tienen ese vínculo — como
  // respaldo, buscamos por nombre exacto en la biblioteca para no perder el video.
  const libMatch = ex.libId ? null : S.library.find(l=>l.name.trim().toLowerCase()===(ex.name||'').trim().toLowerCase());
  const videoKey=ex.libId||(libMatch&&libMatch.id)||ex.id;
  const hasV=!!S.videos[videoKey];
  const canEdit=S.isAdmin && !forceReadOnly;
  const isAthleteMode=!S.isAdmin && !!S.assignedRoutine;
  // Routine prescription values (from routine definition or admin-set in exercise)
  const prescSeries = ex.series||'';
  const prescReps   = ex.reps||'';
  const prescPct    = ex.pct||'';
  const prescNote   = ex.note||'';
  // If athlete mode: show prescribed values as read-only, only allow editing load + rpe actual
  const vbtF=ex.vbt?`<div class="field-box"><span class="field-lbl">m/s</span>
    <input class="field-inp vbt" type="number" step="0.01" placeholder="0.00" value="${d.ms||''}"
      ${isAthleteMode?'readonly style="opacity:.5;pointer-events:none"':''}
      onchange="setField('${ex.id}','ms',this.value)"></div>`:'';
  // Prescription display for athlete (read-only pill row above fields)
  const prescRow = isAthleteMode && (prescSeries||prescReps||prescPct) ? `
    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      ${prescSeries?`<span style="font-size:11px;background:var(--purple-dim);color:var(--purple);padding:2px 8px;border-radius:20px;border:1px solid rgba(212,100,122,0.3)">${prescSeries} series</span>`:''}
      ${prescReps?`<span style="font-size:11px;background:var(--blue-dim);color:var(--blue);padding:2px 8px;border-radius:20px;border:1px solid rgba(96,165,250,0.3)">${prescReps} reps</span>`:''}
      ${prescPct?`<span style="font-size:11px;background:var(--teal-dim);color:var(--teal);padding:2px 8px;border-radius:20px;border:1px solid rgba(45,212,191,0.3)">${prescPct}%RM</span>`:''}
      ${prescNote?`<span style="font-size:11px;color:var(--text3);font-style:italic">${prescNote}</span>`:''}
    </div>` : '';
  return `<div class="ex-row" id="exrow-${ex.id}">
    <div class="ex-check ${d.checked?'checked':''}" onclick="toggleCheck('${ex.id}')"></div>
    <div class="ex-main">
      <div class="ex-name-row">
        <span class="ex-name" ${canEdit?`ondblclick="editExName(this,'${ex.id}','${blockId}',${catIdx})"`:''}>${ex.name}</span>
        <input class="ex-name-inp" id="exinp-${ex.id}" ${canEdit?`onblur="saveExName('${ex.id}','${blockId}',${catIdx},this)" onkeydown="if(event.key==='Enter')this.blur()"`:''}>
        <div class="ex-actions">
          <div class="ex-icon-btn ${hasV?'has-video':''}" data-videokey="${videoKey}" onclick="openVideoModal('${videoKey}','${ex.name}',${canEdit})" title="${canEdit?'Video':'Ver video'}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
          ${canEdit?`<div class="ex-icon-btn del-ex" onclick="deleteExercise('${ex.id}','${blockId}',${catIdx})" title="Eliminar">×</div>`:''}
        </div>
      </div>
      ${prescRow}
      <div class="ex-fields">
        ${isAthleteMode ? `
          <div class="field-box"><span class="field-lbl" style="color:var(--green)">Carga real (kg)</span>
            <input class="field-inp load" type="text" placeholder="—" value="${d.load||''}" onchange="setField('${ex.id}','load',this.value)" style="border-color:rgba(212,100,122,0.35)"></div>
          <div class="field-box"><span class="field-lbl" style="color:var(--amber)">RPE ejercicio</span>
            <input class="field-inp" type="number" min="1" max="10" placeholder="—" value="${d.rpe||''}" onchange="setField('${ex.id}','rpe',this.value);this.style.borderColor=getRPEColor(+this.value)" style="border-color:${d.rpe?getRPEColor(+d.rpe):'rgba(245,158,11,0.4)'}"></div>
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
          <div class="field-box"><span class="field-lbl">RPE</span>
            <input class="field-inp" type="text" placeholder="—" value="${d.rpe||''}" onchange="setField('${ex.id}','rpe',this.value)"></div>
        `}
      </div>
    </div>
  </div>`;
}

// ── SESSION ACTIONS ───────────────────────────────────────────
function toggleBlock(id) {
  const el=document.getElementById('block-'+id);
  el.classList.toggle('open');
  const blocks=getCurrentBlocks();
  const b=blocks.find(x=>x.id===id);
  if(b) b._open=el.classList.contains('open');
}
window.toggleBlock=toggleBlock;

function toggleCheck(exId) {
  const d=getED(S.currentWeek,S.currentSession,exId);
  d.checked=!d.checked;
  const el=document.querySelector(`#exrow-${exId} .ex-check`);
  if(el) el.classList.toggle('checked',d.checked);
  if(!getSD(S.currentWeek,S.currentSession).date)
    getSD(S.currentWeek,S.currentSession).date=new Date().toISOString().split('T')[0];
  scheduleSave();
}
window.toggleCheck=toggleCheck;

function setField(exId,field,val) {
  const d=getED(S.currentWeek,S.currentSession,exId);
  d[field]=val;
  if(!getSD(S.currentWeek,S.currentSession).date)
    getSD(S.currentWeek,S.currentSession).date=new Date().toISOString().split('T')[0];
  scheduleSave();
}
window.setField=setField;

function setRPE(val) {
  getSD(S.currentWeek,S.currentSession).rpe=parseFloat(val);
  const v=document.getElementById('rpe-val'), d=document.getElementById('rpe-desc');
  if(v) v.textContent=val; if(d) d.textContent=rpeDesc(val);
  scheduleSave();
}
window.setRPE=setRPE;

function finishSession() {
  const sd=getSD(S.currentWeek,S.currentSession);
  sd.done=true; sd.date=new Date().toISOString().split('T')[0];
  scheduleSave();
  // Show session feedback modal
  S.feedbackSession={week:S.currentWeek, session:S.currentSession};
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
  const date = new Date().toISOString().split('T')[0];
  const log = { date, week:S.currentWeek, session:S.currentSession, rpe, mins, ua, feel, injury, activity:'gimnasio' };

  // Save to sessionLogs — si ya había un log de gimnasio hoy (por ejemplo cargado
  // manualmente desde Wellness), lo reemplaza en vez de duplicar la carga del día.
  if(!S.history) S.history={};
  if(!S.history._sessionLogs) S.history._sessionLogs=[];
  S.history._sessionLogs = S.history._sessionLogs.filter(l=>!(l.date===date && l.activity==='gimnasio'));
  S.history._sessionLogs.push(log);
  scheduleSave();

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
  {key:'gimnasio', label:'Gimnasio', emoji:'🏋️'},
  {key:'pelota',   label:'Pelota',   emoji:'🏀'},
  {key:'partido',  label:'Partido',  emoji:'🏆'},
];

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
    S.loadDraft[date][activity]=existing?{mins:existing.mins,rpe:existing.rpe}:{mins:'',rpe:0};
  }
  S.loadDraft[date][activity][field]= field==='mins' ? (value===''?'':Math.max(0,+value)) : +value;
  renderMain();
}
window.updateLoadDraft=updateLoadDraft;

function saveLoadLog(date) {
  const today=new Date().toISOString().split('T')[0];
  date = date || today;
  if(!S.history) S.history={};
  if(!S.history._sessionLogs) S.history._sessionLogs=[];
  let savedAny=false;
  LOAD_ACTIVITIES.forEach(act=>{
    const draft=(S.loadDraft?.[date]?.[act.key])||null;
    const existing=getLoadLog(act.key,date);
    const mins = draft ? draft.mins : existing?.mins;
    const rpe  = draft ? draft.rpe  : existing?.rpe;
    if(mins && rpe) {
      // saca cualquier log previo de esta actividad en esa fecha, para no duplicar carga
      S.history._sessionLogs = S.history._sessionLogs.filter(l=>!(l.date===date && l.activity===act.key));
      S.history._sessionLogs.push({date, activity:act.key, session:act.label, week:S.currentWeek, rpe, mins, ua:mins*rpe});
      savedAny=true;
    }
  });
  if(!savedAny) { showToast('Completá minutos y RPE de al menos una actividad'); return; }
  if(S.loadDraft) delete S.loadDraft[date];
  scheduleSave();
  showToast(date===today ? '✓ Carga de hoy guardada' : `✓ Carga del ${date} guardada`);
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
  S.activeFilter=null;
  document.getElementById('lib-search').value='';
  renderLibFilters();
  renderLibList();
  document.getElementById('lib-overlay').classList.add('open');
}
window.openLib=openLib;

function closeLib() { document.getElementById('lib-overlay').classList.remove('open'); }
window.closeLib=closeLib;

function closeLibIfOutside(e) { if(e.target===document.getElementById('lib-overlay')) closeLib(); }
window.closeLibIfOutside=closeLibIfOutside;

function renderLibFilters() {
  const f=document.getElementById('lib-filters');
  f.innerHTML=[{id:null,label:'Todos'},...ALL_FILTERS.map(t=>({id:t,label:t}))].map(ft=>
    `<span class="lib-filter ${S.activeFilter===ft.id?'active':''}" onclick="setFilter('${ft.id}')">${ft.label}</span>`
  ).join('');
}

function setFilter(f) {
  S.activeFilter=f==='null'?null:f;
  renderLibFilters(); renderLibList();
}
window.setFilter=setFilter;

function renderLibList() {
  const q=document.getElementById('lib-search').value.toLowerCase();
  const list=document.getElementById('lib-list');
  let items=S.library.filter(ex=>{
    const matchQ=!q||ex.name.toLowerCase().includes(q);
    const matchF=!S.activeFilter||ex.tags?.includes(S.activeFilter);
    return matchQ&&matchF;
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

function createAndAddExercise() {
  const name=document.getElementById('lib-new-name').value.trim();
  if(!name) return;
  const newLibEx={id:genId(),name,tags:[]};
  S.library.push(newLibEx);
  if(S.libTarget) {
    const {blockId,catIdx,sessionName,isRoutine}=S.libTarget;
    if(S.libTarget.isTD) {
      // Adding to team day editor (esto es lo que faltaba)
      const {teamId,dayIdx}=S.libTarget;
      const b=getTDBlock(blockId,teamId,dayIdx);
      if(b) b.categories[catIdx].exercises.push({id:genId(),libId:newLibEx.id,name,series:'',reps:'',pct:'',rpe:'',note:''});
      scheduleSave(); closeLib(); renderMain();
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
}
window.openVideoModal=openVideoModal;

function closeVideoModal() {
  document.getElementById('video-overlay').classList.remove('open');
  document.getElementById('video-preview-frame').src=''; // corta la reproducción al cerrar
}
window.closeVideoModal=closeVideoModal;

function closeVideoIfOutside(e) { if(e.target===document.getElementById('video-overlay')) closeVideoModal(); }
window.closeVideoIfOutside=closeVideoIfOutside;

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

function shiftWellnessDate(delta) {
  const today=new Date().toISOString().split('T')[0];
  const base=S.wellnessViewDate||today;
  const d=new Date(base+'T00:00:00');
  d.setDate(d.getDate()+delta);
  const newDate=d.toISOString().split('T')[0];
  if(newDate>today) return;
  const minD=new Date(); minD.setDate(minD.getDate()-WELLNESS_BACKFILL_DAYS);
  if(newDate<minD.toISOString().split('T')[0]) return;
  S.wellnessViewDate=(newDate===today)?null:newDate;
  renderMain();
}
window.shiftWellnessDate=shiftWellnessDate;

function goToTodayWellness() { S.wellnessViewDate=null; renderMain(); }
window.goToTodayWellness=goToTodayWellness;

function renderWellness() {
  const today=new Date().toISOString().split('T')[0];
  const wKey=S.wellnessViewDate||today;
  const isToday=wKey===today;
  if(!S.wellness[wKey]) S.wellness[wKey]={};
  const w=S.wellness[wKey];

  const {pct, allFilled} = getWellnessScore(w);
  const wState = getWellnessState(allFilled?pct:null);

  const isDesktop = window.innerWidth >= 900;

  const minAllowed=(()=>{const d=new Date();d.setDate(d.getDate()-WELLNESS_BACKFILL_DAYS);return d.toISOString().split('T')[0];})();
  const canGoBack=wKey>minAllowed, canGoForward=wKey<today;
  const dateLabel=isToday?'Hoy':new Date(wKey+'T00:00:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});

  // Desktop: two-column layout. Mobile: stacked.
  let html = `<div class="page-header">
    <div class="page-title">Wellness</div>
    <div class="page-subtitle">${wKey} · Check-in diario</div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:8px 12px">
    <button class="abtn" onclick="shiftWellnessDate(-1)" ${canGoBack?'':'disabled style="opacity:.3;cursor:not-allowed"'}>‹</button>
    <div style="text-align:center">
      <div style="font-size:14px;font-weight:700;text-transform:capitalize">${dateLabel}</div>
      ${!isToday?`<div style="font-size:11px;color:var(--accent);cursor:pointer" onclick="goToTodayWellness()">Volver a hoy →</div>`:''}
    </div>
    <button class="abtn" onclick="shiftWellnessDate(1)" ${canGoForward?'':'disabled style="opacity:.3;cursor:not-allowed"'}>›</button>
  </div>`;

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
        oninput="updateSleepHours('${wKey}',this)">
      <span style="font-size:10px;color:var(--text3);white-space:nowrap">12h+</span>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:2px">0-3h insuficiente · 4-5h poco · 6-7h suficiente · 8h+ excelente</div>
  </div>`;

  html+=`<div class="hooper-score-box">
    <div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Score de hoy</div>
      <div class="hooper-score-val" style="color:${wState.color}">${allFilled?pct+'%':'—'}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">≥75% bien · ≥50% normal · &lt;50% fatigado</div>
    </div>
    <div style="text-align:right">
      <div class="hooper-score-label" style="color:${wState.color};font-weight:700">${allFilled?wState.label:'Completá todos los ítems'}</div>
    </div>
  </div>
  ${allFilled?`<button class="wellness-submit" onclick="submitWellness('${wKey}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Guardar registro${isToday?' de hoy':''}</button>`:''}
  </div>`;

  // Carga del día: Gimnasio / Pelota / Partido — siempre disponible, tenga o no
  // rutina cargada. Alimenta directamente el cálculo de ACWR/monotonía/strain.
  // Usa wKey (la fecha que se esté viendo), no necesariamente hoy.
  html += `<div class="wellness-card">
    <div class="wellness-title">${isToday?'Carga de hoy':'Carga de ese día'}</div>
    <div class="wellness-sub">Cargá minutos y RPE de cada actividad (las que no correspondan, dejalas en blanco)</div>`;

  LOAD_ACTIVITIES.forEach(act=>{
    const existing=getLoadLog(act.key,wKey);
    const draft=(S.loadDraft?.[wKey]?.[act.key]) || (existing?{mins:existing.mins,rpe:existing.rpe}:{mins:'',rpe:0});
    const ua=(draft.mins&&draft.rpe)?draft.mins*draft.rpe:0;
    html+=`<div class="load-item">
      <div class="load-item-label"><span>${act.emoji}</span><span>${act.label}</span></div>
      <div class="load-item-row">
        <input type="number" min="0" max="300" class="load-mins-inp" placeholder="min" value="${draft.mins||''}" oninput="updateLoadDraft('${wKey}','${act.key}','mins',this.value)">
        <div class="load-rpe-scale">
          ${Array.from({length:11},(_,i)=>i).map(v=>{
            const color=v===0?'var(--text3)':`hsl(${Math.round((10-v)/10*120)},65%,45%)`;
            return `<div class="load-rpe-dot ${draft.rpe===v?'sel':''}" style="${draft.rpe===v?`background:${color}`:''}" onclick="updateLoadDraft('${wKey}','${act.key}','rpe',${v})" title="RPE ${v}">${v}</div>`;
          }).join('')}
        </div>
      </div>
      ${ua?`<div class="load-ua-preview">${draft.mins} min × RPE ${draft.rpe} = ${ua} UA</div>`:''}
    </div>`;
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
        ${renderBodySVG('front')}
        <div class="body-svg-label">Frente</div>
      </div>
      <div class="body-svg-wrap">
        ${renderBodySVG('back')}
        <div class="body-svg-label">Espalda</div>
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
    if(inj) { const p=inj.pain; cls+=p>=8?' sel-high':p>=4?' sel-med':' sel-low'; }
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
  const inj=S.injuries[zid]||{pain:0,note:'',type:'',history:[]};
  const painBtns=Array.from({length:11},(_,i)=>{
    const cls=inj.pain===i?(i>=8?'pain-btn p-high':i>=4?'pain-btn p-med':'pain-btn p-low'):'pain-btn';
    return `<button class="${cls}" onclick="setPain('${zid}',${i})">${i}</button>`;
  }).join('');
  const typeBtns=Object.entries(INJURY_TYPES).map(([k,label])=>{
    const active=inj.type===k;
    return `<button onclick="setInjuryType('${zid}','${k}')" style="flex:1;padding:8px;border-radius:var(--rsm);border:1px solid ${active?'var(--accent)':'var(--border2)'};background:${active?'var(--bg3)':'transparent'};color:${active?'var(--text)':'var(--text3)'};font-size:12px;cursor:pointer">${label}</button>`;
  }).join('');
  const isExisting = !!S.injuries[zid];
  return `<div class="zone-detail">
    <div class="zone-detail-title">${zone.label}
      <span class="zone-close" onclick="S.selectedZone=null;renderMain()">×</span>
    </div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Nivel de la molestia</div>
    <div style="display:flex;gap:6px;margin-bottom:10px">${typeBtns}</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:6px">Dolor 0–10</div>
    <div class="pain-scale" style="display:flex;gap:4px;margin:8px 0;flex-wrap:wrap">${painBtns}</div>
    <textarea class="pain-note-inp" placeholder="Observaciones..." onchange="setPainNote('${zid}',this.value)">${inj.note||''}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="wellness-submit" style="flex:2" onclick="saveInjury('${zid}')">Guardar molestia</button>
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
        const col=inj.pain>=8?'var(--red)':inj.pain>=4?'var(--amber)':'var(--green)';
        const lbl=inj.pain>=8?'Dolor':inj.pain>=4?'Molestia':'Leve';
        const typeLbl=inj.type?INJURY_TYPES[inj.type]:'';
        const hist=inj.history||[];
        const trend=hist.length>1?(hist[hist.length-1].pain<hist[hist.length-2].pain?'↓ Mejorando':hist[hist.length-1].pain>hist[hist.length-2].pain?'↑ Empeorando':'→ Estable'):'';
        return `<div class="injury-item">
          <div class="injury-dot" style="background:${col}"></div>
          <div class="injury-info">
            <div class="injury-zone">${zone?.label||id}${typeLbl?` · ${typeLbl}`:''}</div>
            <div class="injury-pain">Dolor: ${inj.pain}/10 · ${lbl}${inj.note?' · '+inj.note.slice(0,30):''}</div>
          </div>
          <div class="injury-trend" style="color:${col}">${trend}</div>
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

function getRPEColor(v) {
  if(v<=3) return '#34c97a';
  if(v<=6) return '#f0a030';
  if(v<=8) return '#e05030';
  return '#3b7dd8';
}
window.getRPEColor=getRPEColor;

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

function updateSleepHours(wKey,input) {
  const h=+input.value;
  const cat=sleepHoursCategory(h);
  const pct=Math.round((h/12)*100);
  input.style.background=`linear-gradient(to right,${cat.color} ${pct}%,var(--bg3) ${pct}%)`;
  input.style.accentColor=cat.color;
  const wrap=input.closest('.hooper-item');
  if(wrap){const sp=wrap.querySelector('.hooper-label span:last-child');if(sp){sp.textContent=`${h}h · ${cat.label}`;sp.style.color=cat.color;}}
  setHooper(wKey,'sueño_horas',h);
}
window.updateSleepHours=updateSleepHours;

function setHooper(wKey,key,val) {
  if(!S.wellness[wKey]) S.wellness[wKey]={};
  S.wellness[wKey][key]=val; scheduleSave(); renderMain();
}
window.setHooper=setHooper;

function submitWellness(wKey) {
  S.wellness[wKey].date=wKey; S.wellness[wKey].submitted=true;
  scheduleSave();
  showToast('✓ Wellness de hoy guardado');
  const main=document.getElementById('main');
  if(main) main.scrollTo({top:0,behavior:'smooth'});
  renderMain();
}
window.submitWellness=submitWellness;

function selectZone(zid) { S.selectedZone=zid; renderMain(); }
window.selectZone=selectZone;

function setPain(zid,val) {
  if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',history:[]};
  S.injuries[zid].pain=val; renderMain();
}
window.setPain=setPain;

function setPainNote(zid,val) {
  if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',history:[]};
  S.injuries[zid].note=val;
}
window.setPainNote=setPainNote;

function setInjuryType(zid,type) {
  if(!S.injuries[zid]) S.injuries[zid]={pain:0,note:'',type:'',history:[]};
  S.injuries[zid].type=type; renderMain();
}
window.setInjuryType=setInjuryType;

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
    startDate: hist.length?hist[0].date:new Date().toISOString().split('T')[0],
    resolvedDate: new Date().toISOString().split('T')[0],
    peakPain: hist.length?Math.max(...hist.map(h=>h.pain),inj.pain):inj.pain,
    history: hist
  });
}

function removeInjury(zid) {
  if(!S.injuries[zid]) return;
  archiveInjury(zid);
  delete S.injuries[zid];
  S.selectedZone=null; scheduleSave(); showToast('✓ Molestia quitada y guardada en el historial'); renderMain();
}
window.removeInjury=removeInjury;

function saveInjury(zid) {
  const inj=S.injuries[zid]; if(!inj) return;
  if(!inj.history) inj.history=[];
  inj.history.push({date:new Date().toISOString().split('T')[0],pain:inj.pain,note:inj.note||'',type:inj.type||''});
  if(inj.pain===0) { archiveInjury(zid); delete S.injuries[zid]; }
  S.selectedZone=null; scheduleSave(); showToast('✓ Molestia guardada'); renderMain();
}
window.saveInjury=saveInjury;

// ── SEGUIMIENTO DIARIO DE LESIONES (dentro de Wellness) ────────
function renderInjuryFollowup() {
  const active=Object.entries(S.injuries).filter(([,v])=>v.pain>0);
  if(!active.length) return '';
  const today=new Date().toISOString().split('T')[0];
  const allZones=[...BODY_ZONES.front,...BODY_ZONES.back];
  return `<div class="wellness-card" style="margin-bottom:16px">
    <div class="wellness-title">Seguimiento de molestias</div>
    <div class="wellness-sub">Contanos cómo estás hoy de cada una</div>
    ${active.map(([zid,inj])=>{
      const zone=allZones.find(z=>z.id===zid);
      const hist=inj.history||[];
      const doneToday = hist.length>0 && hist[hist.length-1].date===today;
      const scaleBtns=Array.from({length:11},(_,i)=>{
        const cls=inj.pain===i?(i>=8?'pain-btn p-high':i>=4?'pain-btn p-med':'pain-btn p-low'):'pain-btn';
        return `<button class="${cls}" ${doneToday?'disabled':''} onclick="updateInjuryFollowup('${zid}',${i})">${i}</button>`;
      }).join('');
      return `<div style="padding:12px 16px;border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:13px;font-weight:600">${zone?.label||zid}${inj.type?` · ${INJURY_TYPES[inj.type]}`:''}</div>
          ${doneToday?'<span style="font-size:11px;color:var(--green)">✓ Registrado hoy</span>':''}
        </div>
        <div class="pain-scale" style="display:flex;gap:4px;flex-wrap:wrap;${doneToday?'opacity:.5':''}">${scaleBtns}</div>
      </div>`;
    }).join('')}
  </div>`;
}
window.renderInjuryFollowup=renderInjuryFollowup;

function updateInjuryFollowup(zid,val) {
  const inj=S.injuries[zid]; if(!inj) return;
  const today=new Date().toISOString().split('T')[0];
  inj.pain=val;
  if(!inj.history) inj.history=[];
  const last=inj.history[inj.history.length-1];
  if(last && last.date===today) { last.pain=val; last.note=inj.note||''; last.type=inj.type||''; }
  else inj.history.push({date:today,pain:val,note:inj.note||'',type:inj.type||''});
  if(val===0) { archiveInjury(zid); delete S.injuries[zid]; }
  scheduleSave(); showToast('✓ Seguimiento guardado'); renderMain();
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
    html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-top:10px;font-size:13px;color:var(--text2)">
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
  const last7=Array.from({length:7},(_,i)=>{ const d=new Date(today); d.setDate(d.getDate()-6+i); return d.toISOString().split('T')[0]; });
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
    <div class="page-subtitle">Semana ${S.currentWeek} · ${totalS} sesión${totalS!==1?'es':''} completada${totalS!==1?'s':''}</div>
  </div>`;

  // Metric cards — 2x2 grid, no emojis, proper card styling
  html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Semanas</div>
      <div style="font-size:30px;font-weight:800;color:var(--text);line-height:1">${S.currentWeek}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">ciclo actual</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Sesiones</div>
      <div style="font-size:30px;font-weight:800;color:var(--text);line-height:1">${totalS}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">completadas</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Racha semanal</div>
      <div style="font-size:30px;font-weight:800;line-height:1;color:${streak>=5?'var(--green)':streak>=3?'var(--amber)':'var(--text)'}">${streak}<span style="font-size:16px;font-weight:400;color:var(--text3)">/7</span></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">días activos</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Ejerc./sesión</div>
      <div style="font-size:30px;font-weight:800;color:var(--text);line-height:1">${totalS>0?Math.round(totalC/totalS):0}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">promedio</div>
    </div>
  </div>`;

  // Last 7 days activity strip
  html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px 14px;margin-bottom:16px">
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
  if(topEx.length) html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px;overflow:hidden">
    <div style="font-size:14px;font-weight:600;padding:14px 16px;border-bottom:1px solid var(--border)">Ejercicios más frecuentes</div>
    <div style="padding:8px 16px 14px">
      ${topEx.map(([id,f],i)=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="width:22px;height:22px;border-radius:50%;background:var(--accent-dim);color:var(--accent);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i+1}</div>
          <div style="flex:1;font-size:13px;font-weight:500">${allExById[id]||'—'}</div>
          <div style="display:flex;align-items:center;gap:6px;min-width:80px">
            <div style="flex:1;height:4px;border-radius:2px;background:var(--bg3)">
              <div style="height:100%;border-radius:2px;background:var(--accent);width:${Math.round(f/maxF*100)}%"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:var(--accent);min-width:24px;text-align:right">${f}x</span>
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
  else html+=`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px"><div style="font-size:14px;font-weight:600;padding:14px 16px;border-bottom:1px solid var(--border)">Bienestar semanal</div><div class="empty-state" style="padding:24px">Sin registros de wellness aún.</div></div>`;

  if(isDesktop) html+=`</div>`;
  return html;
}

// ── TEAMS ─────────────────────────────────────────────────────
function renderTeams() {
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
          <div class="team-name">${t.name}</div>
        </div>
        <span class="team-sport-badge">${t.sport||'Deporte'}</span>
      </div>
      <div class="team-meta">${t.category||''} · ${(t.players||[]).length} jugadores · ${(t.trainingDays||[]).length} días de entrenamiento</div>
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
      ${team.name}
    </div>
    <span class="team-sport-badge">${team.sport||''}</span>
  </div>
  <div style="font-size:13px;color:var(--text3);margin-bottom:12px">${team.category||''}</div>
  <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
    <button class="snav-tab ${sub==='rutina'?'active':''}" onclick="setTeamSubview('rutina')">Rutina</button>
    <button class="snav-tab ${sub==='wellness'?'active':''}" onclick="setTeamSubview('wellness')">Wellness</button>
    <button class="snav-tab ${sub==='stats'?'active':''}" onclick="setTeamSubview('stats')">Estadísticas</button>
    <button class="snav-tab ${sub==='evals'?'active':''}" onclick="setTeamSubview('evals')">Evaluaciones</button>
  </div>`;

  if(sub==='wellness') html += renderGroupWellness(team.memberUids||[]);
  else if(sub==='stats') html += renderGroupStats(team.memberUids||[]);
  else if(sub==='evals') html += renderEvals();
  else html += renderTeamRutina(team);
  return html;
}

function setTeamSubview(v) {
  S.teamSubview = v;
  if (v==='evals') {
    S.evalScopeUids = S.teamView?.memberUids || [];
    if (!S.evalScopeUids.includes(S.evalAthleteId)) S.evalAthleteId = S.evalScopeUids[0] || null;
    ensureAdminAthletes()
      .then(()=>ensureAthleteEvalData(S.evalAthleteId))
      .then(()=>{ renderMain(); setTimeout(drawEvalCharts,80); });
    return;
  }
  if (v==='wellness' || v==='stats') { ensureGroupPersonalData(S.teamView?.memberUids||[]).then(renderMain); return; }
  renderMain();
}
window.setTeamSubview = setTeamSubview;

function renderTeamRutina(team) {
  const days=team.trainingDays||[];
  let html=`<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
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
              <span style="color:var(--accent);font-size:12px;font-weight:600;background:var(--accent-dim);padding:3px 8px;border-radius:20px;white-space:nowrap">${formatExSummary(ex)||'—'}</span>
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
  const norm = s => (s||'').trim().toLowerCase();
  // Compara nombres ignorando orden de palabras (nombre/apellido invertido),
  // mayúsculas y espacios — "Vincent Ian" y "Ian Vincent" cuentan como la misma persona.
  const namesLikelyMatch = (x,y) => {
    const wx=norm(x).split(/\s+/).filter(Boolean).sort().join(' ');
    const wy=norm(y).split(/\s+/).filter(Boolean).sort().join(' ');
    return !!wx && !!wy && wx===wy;
  };
  const unmatchedLinked = linkedMembers.filter(a=>!(team.players||[]).some(p=>namesLikelyMatch(p,a.name)||norm(p)===norm(a.email)));

  html+=`<div class="admin-section" style="margin-top:16px"><div class="admin-section-title">Jugadores</div>
    ${(team.players||[]).map((p,pi)=>{
      const match=linkedMembers.find(a=>namesLikelyMatch(a.name,p)||norm(a.email)===norm(p));
      return `<div class="admin-item">
        <div class="admin-item-lbl">${p} ${match?`<span style="font-size:10px;color:var(--green);font-weight:600;margin-left:6px">✓ cuenta vinculada</span>`:`<span style="font-size:10px;color:var(--amber);margin-left:6px">sin cuenta</span>`}</div>
        <button class="abtn abtn-d" onclick="deletePlayer('${team.id}',${pi})">−</button>
      </div>`;
    }).join('')}
    <div class="admin-item">
      <input id="new-player-inp" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" placeholder="Nombre del jugador">
      <button class="abtn abtn-p" onclick="addPlayer('${team.id}')">Agregar</button>
    </div></div>
  ${unmatchedLinked.length?`<div class="admin-section" style="margin-top:12px;border-color:var(--amber)">
    <div class="admin-section-title" style="color:var(--amber)">⚠ ${unmatchedLinked.length} atleta${unmatchedLinked.length===1?'':'s'} con cuenta vinculada pero fuera del roster</div>
    ${unmatchedLinked.map(a=>`<div class="admin-item">
      <div class="admin-item-lbl">${a.name||a.email}</div>
      <button class="abtn abtn-p" onclick="addLinkedPlayerToRoster('${team.id}','${(a.name||a.email).replace(/'/g,"\\'")}')">+ Agregar al roster</button>
    </div>`).join('')}
  </div>`:''}
  <button class="abtn abtn-d" style="width:100%;margin-top:8px;padding:10px;border-radius:var(--r)" onclick="deleteTeam('${team.id}')">Eliminar equipo</button>`;
  return html;
}


const TEAM_COLORS = ['#d4647a','#b07ab8','#d4944a','#7ab88a','#68b4c8','#c87890','#a45870','#d4a8b0'];

async function createTeam() {
  const name=prompt('Nombre del equipo:'); if(!name) return;
  const sport=prompt('Deporte (ej: Handball, Básquet):','');
  const category=prompt('Categoría (ej: Liga de Honor):','');
  const team={id:genId(),name,sport:sport||'',category:category||'',players:[],trainingDays:[],createdAt:new Date().toISOString()};
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
    return { zoneLabel: zone ? zone.label : zid, pain: v.pain, type: v.type || '' };
  });
}

// Resumen de carga + wellness de un atleta, usado para promediar a nivel equipo/posición.
function computeAthleteLoadSummary(a) {
  const logs=(a._personal?.history?._sessionLogs)||[];
  const m=calcLoadMetrics(logs);
  const today=new Date().toISOString().split('T')[0];
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
function avgMetric(summaries,key) {
  const vals=summaries.map(s=>s[key]).filter(v=>v!==null&&v!==undefined&&!isNaN(v));
  if(!vals.length) return null;
  return vals.reduce((a,v)=>a+v,0)/vals.length;
}
window.avgMetric=avgMetric;

// Tarjeta de métricas promedio (equipo completo o un grupo por posición)
function renderTeamMetricsCard(title,members) {
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
        <div style="font-size:18px;font-weight:800;color:${wState.color}">${avgW!==null?avgW+'%':'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Wellness sem.</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:${acwrSt.color}">${avgAcwr!==null?avgAcwr.toFixed(2):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">ACWR</div>
        <div style="font-size:9px;color:${acwrSt.color}">${acwrSt.label}</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:18px;font-weight:800;color:${monSt.color}">${avgMono!==null?avgMono.toFixed(1):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Monotonía</div>
        <div style="font-size:9px;color:${monSt.color}">${monSt.label}</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:16px;font-weight:700">${avgToday!==null?Math.round(avgToday):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Carga hoy (UA)</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:16px;font-weight:700">${avgAcute!==null?Math.round(avgAcute):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Carga semana (UA)</div>
      </div>
      <div style="background:var(--bg2);padding:12px;text-align:center">
        <div style="font-size:16px;font-weight:700">${avgChronic!==null?Math.round(avgChronic):'—'}</div>
        <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Carga crónica (UA)</div>
      </div>
    </div>
  </div>`;
}
window.renderTeamMetricsCard=renderTeamMetricsCard;

// Ficha compacta de un atleta: wellness de hoy, alerta de lesión, último RPE.
// La reutilizamos acá y, más adelante, en las tarjetas del Dashboard.
function renderAthleteSummaryCard(a) {
  const today = new Date().toISOString().split('T')[0];
  const p = a._personal || {};
  const todayWellness = p.wellness ? p.wellness[today] : null;
  const score = todayWellness ? computeHooperScore(todayWellness) : null;
  const injuries = getActiveInjuriesSummary(p);
  const lastLog = getLatestSessionLog(p);
  const scoreColor = getWellnessState(score).color;
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
  </div>`;
}
window.renderAthleteSummaryCard = renderAthleteSummaryCard;

function renderGroupWellness(memberUids) {
  const members = (S.adminAthletes || []).filter(a => memberUids.includes(a.uid));
  if (!members.length) return `<div class="empty-state">No hay atletas en este grupo todavía.</div>`;
  const today = new Date().toISOString().split('T')[0];
  const doneCount = members.filter(a => a._personal?.wellness?.[today]).length;

  let html = renderTeamMetricsCard('Promedio del equipo', members);
  const withPos = members.filter(a=>a.position);
  if (withPos.length) {
    const positions = [...new Set(members.map(a=>a.position||'Sin posición'))].sort((a,b)=>{
      if(a==='Sin posición') return 1;
      if(b==='Sin posición') return -1;
      return a.localeCompare(b);
    });
    html += positions.map(pos=>renderTeamMetricsCard(pos, members.filter(a=>(a.position||'Sin posición')===pos))).join('');
  }

  html += `<div style="margin:14px 0 12px;font-size:12px;color:var(--text3)">${doneCount}/${members.length} completaron el wellness de hoy</div>
    <div style="display:flex;flex-direction:column;gap:10px">${members.map(renderAthleteSummaryCard).join('')}</div>`;
  return html;
}
window.renderGroupWellness = renderGroupWellness;

function renderGroupStats(memberUids) {
  const members = (S.adminAthletes || []).filter(a => memberUids.includes(a.uid));
  if (!members.length) return `<div class="empty-state">No hay atletas en este grupo todavía.</div>`;

  // 1) Promedio general del equipo
  let html = renderTeamMetricsCard('Promedio del equipo', members);

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
      return renderTeamMetricsCard(pos, group);
    }).join('');
  }

  // 3) Detalle semanal por atleta (como antes)
  const rows = members.map(a => {
    const logs = (a._personal?.history?._sessionLogs) || [];
    const weekLogs = logs.filter(l => l.week === S.currentWeek);
    const avgRpe = weekLogs.length ? (weekLogs.reduce((s, l) => s + (l.rpe || 0), 0) / weekLogs.length).toFixed(1) : '—';
    const totalUA = weekLogs.reduce((s, l) => s + (l.ua || 0), 0);
    return `<div class="admin-item" style="justify-content:space-between;flex-wrap:wrap">
      <div><div style="font-size:13px;font-weight:600">${a.name || a.email}</div><div style="font-size:11px;color:var(--text3)">${a.position||''}</div></div>
      <div style="font-size:12px;color:var(--text3);display:flex;gap:14px">
        <span>${weekLogs.length} sesiones</span>
        <span>RPE prom: ${avgRpe}</span>
        <span>UA: ${totalUA}</span>
      </div>
    </div>`;
  }).join('');
  html += `<div class="admin-section"><div class="admin-section-title">Detalle por atleta · Semana ${S.currentWeek}</div>${rows}</div>`;
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
  <button class="add-block-btn" onclick="addTeamDayBlock('${teamId}',${dayIdx})">+ Agregar bloque</button>`;
}

function renderTeamDayBlock(b,teamId,dayIdx){
  const cc=b.colorKey||'bx',open=b._open!==false;
  let inner='';
  b.categories.forEach((cat,ci)=>{
    inner+=`<div class="cat-header"><div class="cat-label-wrap"><span class="cat-label" ondblclick="editTDCatLabel(this,'${b.id}','${teamId}',${dayIdx},${ci})">${cat.label}</span><input class="cat-label-inp" id="tdcatinp-${b.id}-${ci}" onblur="saveTDCatLabel('${b.id}','${teamId}',${dayIdx},${ci},this)" onkeydown="if(event.key==='Enter')this.blur()"></div><span class="cat-del" onclick="deleteTDCat('${b.id}','${teamId}',${dayIdx},${ci})">− cat</span></div>`;
    cat.exercises.forEach(ex=>{
      inner+=`<div class="ex-row" id="tdexrow-${ex.id}"><div class="ex-main"><div class="ex-name-row"><span class="ex-name" ondblclick="editTDExName(this,'${ex.id}','${b.id}','${teamId}',${dayIdx},${ci})">${ex.name}</span><input class="ex-name-inp" id="tdexinp-${ex.id}" onblur="saveTDExName('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},this)" onkeydown="if(event.key==='Enter')this.blur()"><div class="ex-actions"><div class="ex-icon-btn del-ex" onclick="deleteTDEx('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci})">×</div></div></div>
      <div class="ex-fields">
        <div class="field-box"><span class="field-lbl">Series</span><input class="field-inp" type="text" placeholder="3x" value="${ex.series||''}" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'series',this.value)"></div>
        <div class="field-box"><span class="field-lbl">Reps</span><input class="field-inp" type="text" placeholder="6–8" value="${ex.reps||''}" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'reps',this.value)"></div>
        <div class="field-box"><span class="field-lbl">%RM</span><input class="field-inp" type="text" placeholder="—" value="${ex.pct||''}" onchange="setTDExField('${ex.id}','${b.id}','${teamId}',${dayIdx},${ci},'pct',this.value)"></div>
        <div class="field-box" style="gap:3px"><span class="field-lbl">Intensidad</span>
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
  return`<div class="card block ${cc} ${open?'open':''}" id="tdblock-${b.id}"><div class="block-header" onclick="toggleTDBlock('${b.id}','${teamId}',${dayIdx})"><span class="block-badge">${b.label}</span><div class="block-title-wrap"><span class="block-title" ondblclick="editTDBlockTitle(event,'${b.id}','${teamId}',${dayIdx})">${b.title}</span><input class="block-title-inp" id="tdbinp-${b.id}" onblur="saveTDBlockTitle('${b.id}','${teamId}',${dayIdx},this)" onkeydown="if(event.key==='Enter')this.blur()"></div><span class="block-time">${b.time||''}</span><span class="block-del" onclick="deleteTDBlock(event,'${b.id}','${teamId}',${dayIdx})">×</span><span class="block-chevron">›</span></div><div class="block-body">${inner}</div></div>`;
}

function getTDBlock(blockId,teamId,dayIdx){const day=getTeamDay(teamId,dayIdx);if(!day)return null;return(day.blocks||[]).find(b=>b.id===blockId)||null;}
function addTeamDayBlock(teamId,dayIdx){const day=getTeamDay(teamId,dayIdx);if(!day)return;if(!day.blocks)day.blocks=[];const colors=['b1','b2','b3','b4','bx'],n=day.blocks.length;day.blocks.push({id:genId(),label:`Bloque ${n+1}`,title:'Nuevo bloque',time:'',colorKey:colors[n%colors.length],note:'',_open:true,categories:[{id:genId(),label:'Categoría',exercises:[]}]});renderMain();}
window.addTeamDayBlock=addTeamDayBlock;
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
function openTDLib(blockId,teamId,dayIdx,ci){S.libTarget={blockId,catIdx:ci,teamId,dayIdx,isTD:true};S.activeFilter=null;document.getElementById('lib-search').value='';renderLibFilters();renderLibList();document.getElementById('lib-overlay').classList.add('open');}
window.openTDLib=openTDLib;
async function saveTeamDayBlocks(teamId,dayIdx){
  const team=S.teams.find(t=>t.id===teamId);if(!team)return;
  const toSave=JSON.parse(JSON.stringify(team));
  const clean=obj=>{if(Array.isArray(obj))obj.forEach(clean);else if(obj&&typeof obj==='object'){delete obj._open;delete obj._editing;Object.values(obj).forEach(clean);}};
  clean(toSave);
  try{await setDoc(doc(db,'teams',teamId),toSave);showToast('✓ Sesión guardada');S.teamDayEdit=null;renderMain();}catch(e){showToast('Error al guardar');}
}
window.saveTeamDayBlocks=saveTeamDayBlocks;





function openTeam(id) { S.teamView=S.teams.find(t=>t.id===id)||null; S.teamSubview='rutina'; S.currentView='teams'; renderBottomBar(); renderMain(); }
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

function addPlayer(teamId) {
  const inp=document.getElementById('new-player-inp'); if(!inp) return;
  const name=inp.value.trim(); if(!name) return;
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  if(!t.players) t.players=[];
  t.players.push(name); inp.value=''; saveTeam(teamId); renderMain();
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

async function saveTeam(teamId) {
  const t=S.teams.find(x=>x.id===teamId); if(!t) return;
  try { await setDoc(doc(db,'teams',teamId),t); } catch(e) { console.error(e); }
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
    html += individuals.map(a => `
      <div class="card" style="padding:14px;cursor:pointer;margin-bottom:8px" onclick="openAtleta('${a.uid}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:600">${a.name || a.email}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">${a.sport || ''}${a.position ? ' · ' + a.position : ''}</div>
          </div>
          <span style="color:var(--text3);font-size:18px">›</span>
        </div>
      </div>`).join('');
  }
  return html;
}
window.renderAtletas = renderAtletas;

function openAtleta(uid) {
  const a = (S.adminAthletes || []).find(x => x.uid === uid);
  if (!a) return;
  S.atletaView = a;
  S.atletaSubview = 'rutina';
  ensureGroupPersonalData([uid]).then(renderMain);
  renderMain();
}
window.openAtleta = openAtleta;

function renderAtletaDetail(a) {
  const sub = S.atletaSubview || 'rutina';
  let html = `<div class="team-detail-header">
    <button class="back-btn" onclick="S.atletaView=null;renderMain()">‹</button>
    <div class="team-detail-title">${a.name || a.email}</div>
  </div>
  <div style="font-size:13px;color:var(--text3);margin-bottom:12px">${a.sport || ''}${a.position ? ' · ' + a.position : ''}</div>
  <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">
    <button class="snav-tab ${sub === 'rutina' ? 'active' : ''}" onclick="setAtletaSubview('rutina')">Rutina</button>
    <button class="snav-tab ${sub === 'wellness' ? 'active' : ''}" onclick="setAtletaSubview('wellness')">Wellness</button>
    <button class="snav-tab ${sub === 'stats' ? 'active' : ''}" onclick="setAtletaSubview('stats')">Estadísticas</button>
    <button class="snav-tab ${sub === 'evals' ? 'active' : ''}" onclick="setAtletaSubview('evals')">Evaluaciones</button>
  </div>`;

  if (sub === 'wellness') html += renderGroupWellness([a.uid]);
  else if (sub === 'stats') html += renderGroupStats([a.uid]);
  else if (sub === 'evals') html += renderEvals();
  else html += renderAtletaRutina(a);
  return html;
}
window.renderAtletaDetail = renderAtletaDetail;

function setAtletaSubview(v) {
  S.atletaSubview = v;
  if (v === 'evals') {
    S.evalScopeUids = S.atletaView ? [S.atletaView.uid] : [];
    S.evalAthleteId = S.atletaView?.uid || null;
    ensureAdminAthletes()
      .then(()=>ensureAthleteEvalData(S.evalAthleteId))
      .then(() => { renderMain(); setTimeout(drawEvalCharts, 80); });
    return;
  }
  if (v === 'wellness' || v === 'stats') {
    ensureGroupPersonalData(S.atletaView ? [S.atletaView.uid] : []).then(renderMain);
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
  </div>`;

  if (!routine) {
    html += `<div class="empty-state">Este atleta no tiene una rutina asignada todavía.</div>`;
    return html;
  }

  const sessionNames = Object.keys(routine.sessions || {});
  html += `<div class="admin-section">
    <div class="admin-section-title">${routine.name}</div>
    ${sessionNames.map(sName => {
      const blocks = routine.sessions[sName] || [];
      const exRows = [];
      blocks.forEach(b => (b.categories || []).forEach(cat => (cat.exercises || []).forEach(ex => exRows.push(ex))));
      return `<div style="padding:10px 16px;border-top:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${sName}</div>
        ${exRows.length
          ? exRows.map((ex,i) => `<div style="font-size:13px;padding:5px 0;${i>0?'border-top:1px solid var(--border)':''}"><span style="color:var(--text)">${ex.name}</span> <span style="color:var(--text3)">— ${formatExSummary(ex)}</span></div>`).join('')
          : `<div style="font-size:12px;color:var(--text3)">Sin ejercicios cargados</div>`}
      </div>`;
    }).join('')}
  </div>`;
  return html;
}
window.renderAtletaRutina = renderAtletaRutina;

// ── SETTINGS ─────────────────────────────────────────────────
function renderSettings() {
  return `
  <div class="card">
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
      <input type="date" class="abtn" value="${S.startDate}" onchange="S.startDate=this.value;scheduleSave();renderMain()" style="cursor:pointer">
    </div>
  </div>
  <div class="card">
    <div class="settings-item">
      <div><div class="settings-lbl">Exportar datos</div><div class="settings-sub">Descargá una copia local</div></div>
      <button class="abtn" onclick="exportData()">Exportar</button>
    </div>
  </div>
  <div style="text-align:center;padding:20px;font-size:11px;color:var(--text3)">
    Training System v2.0 · ${S.userData?.name||''} · ${S.isAdmin?'Admin':'Atleta'}
  </div>`;
}

function changeWeek(d) { S.currentWeek=Math.max(1,S.currentWeek+d); scheduleSave(); renderAll(); }
window.changeWeek=changeWeek;

function exportData() {
  const blob=new Blob([JSON.stringify({blocks:S.blocks,history:S.history,wellness:S.wellness,injuries:S.injuries},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`training-backup-${new Date().toISOString().split('T')[0]}.json`; a.click();
  showToast('Datos exportados');
}
window.exportData=exportData;

// ── ADMIN PANEL ───────────────────────────────────────────────
// ── ADMIN PANEL ───────────────────────────────────────────────
function renderAdmin() {
  switch(S.adminView) {
    case 'athletes':       return renderAdminAthletes();
    case 'athlete_detail': return renderAthleteDetail();
    case 'routines':       return renderAdminRoutines();
    case 'routine_edit':   return renderRoutineEditor();
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
      <div><div class="admin-item-lbl">Mi sesión de entrenamiento</div><div class="admin-item-sub">Tu propia rutina personal</div></div>
      <button class="abtn abtn-p" onclick="switchView('session')">Ir →</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Equipos</div><div class="admin-item-sub">${S.teams.length} equipo${S.teams.length!==1?'s':''}</div></div>
      <button class="abtn abtn-p" onclick="switchView('teams')">Ver →</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Biblioteca de ejercicios</div><div class="admin-item-sub">${S.library.length} ejercicios guardados</div></div>
      <button class="abtn abtn-p" onclick="switchView('library')">Gestionar →</button>
    </div>
    <div class="admin-item">
      <div><div class="admin-item-lbl">Restaurar bloques propios</div><div class="admin-item-sub">Vuelve a la estructura original de tu sesión</div></div>
      <button class="abtn" onclick="resetBlocks()">Restaurar</button>
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
        <div style="width:9px;height:9px;border-radius:50%;background:${a.color||'var(--text3)'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name||a.email}</div>
          <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${myTeam?myTeam.name:'Individual'}${a.position?' · '+a.position:''}</div>
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

async function adminOpenAthlete(uid) {
  S.adminView='athlete_detail';
  S.currentView='admin';
  document.getElementById('main').innerHTML=`<div style="text-align:center;padding:40px;color:var(--text3)">Cargando perfil…</div>`;
  try {
    const uSnap = await getDoc(doc(db,'users',uid));
    const pSnap = await getDoc(doc(db,'personal',uid));
    S.viewingAthlete = {
      uid,
      userData: uSnap.exists()?uSnap.data():{email:'—',name:'—'},
      personal: pSnap.exists()?pSnap.data():{}
    };
  } catch(e) { S.viewingAthlete=null; }
  renderMain();
}
window.adminOpenAthlete=adminOpenAthlete;

function renderAthleteDetail() {
  if(!S.viewingAthlete) return `<div class="empty-state">Error cargando perfil.</div>`;
  const {uid,userData,personal} = S.viewingAthlete;
  const assigned = S.routines.find(r=>r.id===userData.assignedRoutine);

  // Build history summary
  const history = personal.history || {};
  const wellness = personal.wellness || {};
  const injuries = personal.injuries || {};

  // Last 5 sessions with data
  const sessions = Object.entries(history)
    .filter(([,sd])=>sd.done)
    .sort((a,b)=>b[0].localeCompare(a[0]))
    .slice(0,5);

  // Last 7 wellness entries
  const wEntries = Object.entries(wellness)
    .sort((a,b)=>b[0].localeCompare(a[0]))
    .slice(0,7);

  // Active injuries
  const activeInj = Object.entries(injuries).filter(([,v])=>v.pain>0);
  const allZones=[...BODY_ZONES.front,...BODY_ZONES.back];

  // Assign routine options
  const myTeam = userData.teamId ? S.teams.find(t=>t.id===userData.teamId) : null;
  const routineOpts = `<select id="assign-routine-sel" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none">
    <option value="">${myTeam?'— Usar la del equipo —':'— Sin rutina —'}</option>
    ${S.routines.map(r=>`<option value="${r.id}" ${userData.assignedRoutine===r.id?'selected':''}>${r.name}</option>`).join('')}
  </select>`;

  // ── Resumen rápido: wellness de hoy + ACWR, para no tener que bucear ──
  const today=new Date().toISOString().split('T')[0];
  const todayW = wellness[today];
  const {pct:todayPct, allFilled:todayFilled} = getWellnessScore(todayW);
  const wState = getWellnessState(todayFilled?todayPct:null);
  const logs = personal.history?._sessionLogs || personal.sessionLogs || [];
  const m = calcLoadMetrics(logs);
  const acwrSt = getACWRStatus(m?.acwr??null, m?.daysOfHistory);
  const activeInjCount = activeInj.length;

  let html=`<div class="team-detail-header">
    <button class="back-btn" data-back="admin-athletes">‹</button>
    <div class="team-detail-title" style="display:flex;align-items:center;gap:8px">
      <div style="width:12px;height:12px;border-radius:50%;background:${userData.color||'var(--text3)'};flex-shrink:0"></div>
      ${userData.name||userData.email}
    </div>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
    ${myTeam?`<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:var(--accent-dim);color:var(--accent)">${myTeam.name}</span>`:''}
    ${userData.position?`<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:var(--bg3);color:var(--text2);border:1px solid var(--border)">${userData.position}</span>`:''}
    ${userData.sport&&!myTeam?`<span style="font-size:11px;padding:4px 10px;border-radius:20px;background:var(--bg3);color:var(--text2);border:1px solid var(--border)">${userData.sport}</span>`:''}
  </div>

  <!-- Resumen rápido -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:16px;border:1px solid var(--border)">
    <div style="background:var(--bg2);padding:14px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:${wState.color}">${todayFilled?todayPct+'%':'—'}</div>
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Wellness hoy</div>
    </div>
    <div style="background:var(--bg2);padding:14px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:${acwrSt.color}">${m?.acwr!=null?m.acwr.toFixed(2):'—'}</div>
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">ACWR</div>
    </div>
    <div style="background:var(--bg2);padding:14px;text-align:center">
      <div style="font-size:20px;font-weight:800;color:${activeInjCount?'var(--red)':'var(--green)'}">${activeInjCount||'0'}</div>
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-top:2px">Molestias activas</div>
    </div>
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Tendencia — últimos 30 días</div>
    <div style="padding:14px 16px;height:220px;position:relative">
      <canvas id="athlete-trend-chart"></canvas>
    </div>
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Perfil</div>
    <div class="admin-item" style="flex-direction:column;align-items:flex-start;gap:10px">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--text3);min-width:50px">Color</span>
        ${TEAM_COLORS.map(c=>`<div onclick="setAthleteColor('${uid}','${c}')" style="width:20px;height:20px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${userData.color===c?'#fff':'transparent'};transition:border .15s"></div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;width:100%">
        <span style="font-size:11px;color:var(--text3);min-width:50px">Posición</span>
        ${(()=>{
          const posOpts=getPositionOptionsForSport(myTeam?.sport);
          if(posOpts) {
            return `<select id="pos-sel-${uid}" style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" onchange="setAthletePosition('${uid}',this.value)">
              <option value="">— Sin posición —</option>
              ${posOpts.map(p=>`<option value="${p}" ${userData.position===p?'selected':''}>${p}</option>`).join('')}
            </select>`;
          }
          return `<input id="pos-inp-${uid}" value="${userData.position||''}" placeholder="Ej: Base, Alero..." style="flex:1;min-width:160px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--rxs);padding:6px 10px;color:var(--text);font-size:13px;outline:none" onblur="setAthletePosition('${uid}',this.value)" onkeydown="if(event.key==='Enter')this.blur()">`;
        })()}
      </div>
      ${!myTeam?.sport&&myTeam?`<div style="font-size:11px;color:var(--text3)">El equipo no tiene deporte definido, así que es un campo de texto libre.</div>`:''}
    </div>
  </div>

  <div class="admin-section">
    <div class="admin-section-title">${myTeam?'Rutina personalizada (opcional)':'Rutina asignada'}</div>
    <div class="admin-item" style="gap:8px;flex-wrap:wrap">
      ${routineOpts}
      <button class="abtn abtn-p" onclick="assignRoutineToAthlete('${uid}')">Asignar</button>
    </div>
    ${assigned
      ? `<div style="padding:8px 14px;font-size:12px;color:var(--green)">✓ Personalizada activa: ${assigned.name}${myTeam?' (reemplaza a la del equipo)':''}</div>`
      : myTeam
        ? `<div style="padding:8px 14px;font-size:12px;color:var(--accent)">↳ Hereda la rutina del equipo "${myTeam.name}" · sin personalización propia</div>`
        : `<div style="padding:8px 14px;font-size:12px;color:var(--amber)">Sin rutina activa</div>`}
    <div class="admin-item">
      <div><div class="admin-item-lbl">Semana ${personal.currentWeek||1}</div><div class="admin-item-sub">${personal.startDate?'Desde: '+personal.startDate:''}</div></div>
      <div style="display:flex;gap:6px">
        <button class="abtn" onclick="changeAthleteWeek('${uid}',-1)">‹</button>
        <button class="abtn" onclick="changeAthleteWeek('${uid}',1)">›</button>
      </div>
    </div>
  </div>

  <!-- Load metrics from session logs -->
  ${(()=>{
    if(!m) return '<div class="admin-section"><div class="admin-section-title">Control de carga interna</div><div style="padding:12px 16px;font-size:13px;color:var(--text3)">Sin datos. El atleta debe cargar su carga de gimnasio/pelota/partido en Wellness.</div></div>';
    const monSt=getMonotonyStatus(m.monotony);
    return `<div class="admin-section">
      <div class="admin-section-title">Control de carga interna</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--border)">
        <div style="background:var(--bg2);padding:14px 16px">
          <div style="font-size:22px;font-weight:800;color:${acwrSt.color}">${m.acwr!=null?m.acwr.toFixed(2):'—'}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px">ACWR</div>
          <div style="font-size:11px;color:${acwrSt.color}">${acwrSt.label}</div>
        </div>
        <div style="background:var(--bg2);padding:14px 16px">
          <div style="font-size:22px;font-weight:800;color:${monSt.color}">${Math.round((m.monotony||0)*10)/10}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px">Monotonía</div>
          <div style="font-size:11px;color:${monSt.color}">${monSt.label}</div>
        </div>
        <div style="background:var(--bg2);padding:14px 16px">
          <div style="font-size:22px;font-weight:800">${m.acuteUA}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px">UA semana</div>
          <div style="font-size:11px;color:var(--text3)">${m.sessions} sesiones</div>
        </div>
        <div style="background:var(--bg2);padding:14px 16px">
          <div style="font-size:22px;font-weight:800">${Math.round(m.strain)}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:2px">Strain</div>
          <div style="font-size:11px;color:${m.strain>6000?'var(--red)':m.strain>2000?'var(--amber)':'var(--green)'}">${m.strain>6000?'Alto ⚠':m.strain>2000?'Moderado':'Bajo'}</div>
        </div>
      </div>
    </div>`;
  })()}

  <div class="admin-section">
    <div class="admin-section-title">Últimas sesiones completadas</div>
    ${sessions.length?sessions.map(([key,sd])=>{
      const exEntries=Object.entries(sd.exercises||{}).filter(([,e])=>e.load||e.rpe||e.checked);
      return `<div class="admin-item" style="flex-direction:column;align-items:flex-start;gap:6px">
        <div style="display:flex;justify-content:space-between;width:100%">
          <span style="font-size:13px;font-weight:500">${key}</span>
          <span style="font-size:11px;color:var(--text3)">${sd.date||''} · RPE ${sd.rpe||'—'}</span>
        </div>
        ${exEntries.slice(0,4).map(([id,e])=>`
          <div style="font-size:12px;color:var(--text2);display:flex;gap:10px">
            <span style="color:var(--text3);min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${id}</span>
            ${e.load?`<span style="color:var(--green)">${e.load}kg</span>`:''}
            ${e.rpe?`<span style="color:var(--amber)">RPE ${e.rpe}</span>`:''}
          </div>`).join('')}
      </div>`;
    }).join(''):`<div style="padding:12px 14px;font-size:13px;color:var(--text3)">Sin sesiones registradas aún.</div>`}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Wellness — últimos 7 días</div>
    ${wEntries.length?wEntries.map(([date,w])=>{
      const {pct,allFilled}=getWellnessScore(w);
      if(!allFilled) return '';
      const col=getWellnessState(pct).color;
      return `<div class="admin-item">
        <span style="font-size:12px;color:var(--text3)">${date}</span>
        <span style="font-size:14px;font-weight:600;color:${col}">${pct}%</span>
      </div>`;
    }).join(''):`<div style="padding:12px 14px;font-size:13px;color:var(--text3)">Sin registros de wellness.</div>`}
  </div>

  <div class="admin-section">
    <div class="admin-section-title">Molestias activas</div>
    ${activeInj.length?`<div class="injury-list" style="padding:10px 14px">${activeInj.map(([id,inj])=>{
      const zone=allZones.find(z=>z.id===id);
      const col=inj.pain>=8?'var(--red)':inj.pain>=4?'var(--amber)':'var(--green)';
      return `<div class="injury-item">
        <div class="injury-dot" style="background:${col}"></div>
        <div class="injury-info">
          <div class="injury-zone">${zone?.label||id}</div>
          <div class="injury-pain">Dolor: ${inj.pain}/10${inj.note?' · '+inj.note.slice(0,40):''}</div>
        </div>
      </div>`;
    }).join('')}</div>`:`<div style="padding:12px 14px;font-size:13px;color:var(--text3)">Sin molestias registradas.</div>`}
  </div>`;

  return html;
}

async function assignRoutineToAthlete(uid) {
  const sel = document.getElementById('assign-routine-sel');
  if(!sel) return;
  const routineId = sel.value || null;
  try {
    await setDoc(doc(db,'users',uid), { assignedRoutine: routineId||null }, {merge:true});
    if(S.viewingAthlete?.userData) S.viewingAthlete.userData.assignedRoutine = routineId;
    // Also update local adminAthletes list
    const a = S.adminAthletes.find(x=>x.uid===uid);
    if(a) a.assignedRoutine = routineId;
    showToast(routineId?'✓ Rutina asignada':'Rutina removida');
    renderMain();
  } catch(e) { showToast('Error al asignar'); }
}
window.assignRoutineToAthlete=assignRoutineToAthlete;

async function changeAthleteWeek(uid, delta) {
  const p = S.viewingAthlete?.personal;
  if(!p) return;
  const cur = (p.currentWeek||1)+delta;
  if(cur<1) return;
  p.currentWeek = cur;
  try {
    await setDoc(doc(db,'personal',uid),{currentWeek:cur},{merge:true});
    showToast(`Semana actualizada: ${cur}`);
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
            <button class="abtn abtn-d" onclick="deleteRoutine('${r.id}')">×</button>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text3)">
          ${Object.keys(r.sessions||{}).join(' · ')||'Sin sesiones'}
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">
          Asignada a: ${S.adminAthletes.filter(a=>a.assignedRoutine===r.id).map(a=>a.name||a.email).join(', ')||'nadie'}
        </div>
      </div>`).join('');
  }
  return html;
}

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
  const sessions = Object.keys(S.editingRoutine.sessions||{});
  S._routineEditSession = sessions[0]||null;
  renderMain();
}
window.editRoutine=editRoutine;

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
function renderRoutineEditor() {
  const r = S.editingRoutine;
  if(!r) return `<div class="empty-state">Error: no hay rutina en edición.</div>`;
  const sessionNames = Object.keys(r.sessions||{});
  if(!S._routineEditSession || !r.sessions[S._routineEditSession]) {
    S._routineEditSession = sessionNames[0]||null;
  }
  const curSession = S._routineEditSession;
  const blocks = curSession ? (r.sessions[curSession]||[]) : [];

  const sessionTabs = sessionNames.map(s=>'<button class="snav-tab '+(curSession===s?'active':'')+'" onclick="routineSelectSession(\''+s+'\')">'+s+'</button>').join('');

  const blocksHtml = blocks.map(b=>renderRoutineBlock(b,curSession)).join('');

  return `
  <div class="team-detail-header">
    <button class="back-btn" data-back="routine-editor">‹</button>
    <div class="team-detail-title" style="flex:1">${r.name}</div>
    <button class="abtn abtn-p" onclick="saveRoutineToFirestore()">Guardar</button>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
    ${sessionTabs}
    <button class="abtn" onclick="addRoutineSession()" style="font-size:11px">+ Sesión</button>
    ${curSession?`<button class="abtn abtn-d" onclick="deleteRoutineSession('${curSession}')" style="font-size:11px">× ${curSession}</button>`:''}
  </div>
  ${curSession?`
    ${blocksHtml}
    <button class="add-block-btn" onclick="addRoutineBlock('${curSession}')">+ Agregar bloque</button>
  `:`<div class="empty-state">Seleccioná o creá una sesión para empezar.</div>`}
  `;
}

function renderRoutineBlock(b, sessionName) {
  const cc=b.colorKey||'bx';
  const open=b._open!==false;
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
      inner+=renderRoutineExRow(ex,b.id,sessionName,ci,ei);
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
      <span class="block-del" onclick="deleteRBlock(event,'${b.id}','${sessionName}')">×</span>
      <span class="block-chevron">›</span>
    </div>
    <div class="block-body">${inner}</div>
  </div>`;
}

function renderRoutineExRow(ex, blockId, sessionName, catIdx, exIdx) {
  return `<div class="ex-row" id="rexrow-${ex.id}">
    <div class="ex-main">
      <div class="ex-name-row">
        <span class="ex-name" ondblclick="editRExName(this,'${ex.id}','${blockId}','${sessionName}',${catIdx})">${ex.name}</span>
        <input class="ex-name-inp" id="rexinp-${ex.id}" onblur="saveRExName('${ex.id}','${blockId}','${sessionName}',${catIdx},this)" onkeydown="if(event.key==='Enter')this.blur()">
        <div class="ex-actions">
          <div class="ex-icon-btn del-ex" onclick="deleteRExercise('${ex.id}','${blockId}','${sessionName}',${catIdx})" title="Eliminar">×</div>
        </div>
      </div>
      <div class="ex-fields">
        <div class="field-box"><span class="field-lbl">Series</span>
          <input class="field-inp" type="text" placeholder="3x" value="${ex.series||''}" onchange="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'series',this.value)"></div>
        <div class="field-box"><span class="field-lbl">Reps</span>
          <input class="field-inp" type="text" placeholder="6–8" value="${ex.reps||''}" onchange="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'reps',this.value)"></div>
        <div class="field-box"><span class="field-lbl">%RM</span>
          <input class="field-inp" type="text" placeholder="—" value="${ex.pct||''}" onchange="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'pct',this.value)"></div>
        <div class="field-box" style="gap:3px">
          <span class="field-lbl">Intensidad</span>
          <div class="intensity-sel">
            <button class="intensity-type-btn ${(ex.intensityType||'RPE')==='RPE'?'active':''}" onclick="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'intensityType','RPE');this.classList.add('active');this.nextElementSibling.classList.remove('active')">RPE</button>
            <button class="intensity-type-btn ${ex.intensityType==='RIR'?'active':''}" onclick="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'intensityType','RIR');this.classList.add('active');this.previousElementSibling.classList.remove('active')">RIR</button>
          </div>
          <input class="field-inp" type="text" placeholder="—" value="${ex.rpe||''}" onchange="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'rpe',this.value)" style="width:48px"></div>
        <div class="field-box"><span class="field-lbl">Nota</span>
          <input class="field-inp" style="width:90px" type="text" placeholder="—" value="${ex.note||''}" onchange="setRExField('${ex.id}','${blockId}','${sessionName}',${catIdx},'note',this.value)"></div>
      </div>
    </div>
  </div>`;
}

// Routine editor helper functions
function getRBlock(blockId, sessionName) {
  const r=S.editingRoutine; if(!r) return null;
  return (r.sessions[sessionName]||[]).find(b=>b.id===blockId)||null;
}

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
  const remaining=Object.keys(S.editingRoutine.sessions);
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
}
window.setRExField=setRExField;

function deleteRExercise(exId,blockId,sessionName,catIdx) {
  const b=getRBlock(blockId,sessionName); if(!b) return;
  b.categories[catIdx].exercises=b.categories[catIdx].exercises.filter(e=>e.id!==exId);
  renderMain();
}
window.deleteRExercise=deleteRExercise;

function openRoutineLib(blockId,sessionName,catIdx) {
  S.libTarget={blockId,catIdx,sessionName,isRoutine:true};
  S.activeFilter=null;
  document.getElementById('lib-search').value='';
  renderLibFilters();
  renderLibList();
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
  { id:'cmj_der', label:'CMJ Unilateral Der.',     unit:'cm', desc:'CMJ una pierna derecha' },
  { id:'cmj_izq', label:'CMJ Unilateral Izq.',     unit:'cm', desc:'CMJ una pierna izquierda' },
];

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
    if (S.evalScopeUids) {
      // Estamos dentro de Equipos o Atletas: sin "Yo mismo", solo el grupo acotado
      athleteSel = pool.length
        ? '<select class="eval-inp" onchange="selectEvalAthlete(this.value)" style="cursor:pointer;max-width:220px">'
          + pool.map(a=>'<option value="'+a.uid+'" '+(S.evalAthleteId===a.uid?'selected':'')+'>'+(a.name||a.email)+'</option>').join('')
          + '</select>'
        : '<div style="font-size:12px;color:var(--text3)">Sin atletas en este grupo todavía</div>';
    } else if (S.adminAthletes.length) {
      const opts = ['<option value="self">Yo mismo</option>']
        .concat(S.adminAthletes.map(a=>'<option value="'+a.uid+'" '+(S.evalAthleteId===a.uid?'selected':'')+'>'+(a.name||a.email)+'</option>'));
      athleteSel = '<select class="eval-inp" onchange="selectEvalAthlete(this.value)" style="cursor:pointer;max-width:220px">'+opts.join('')+'</select>';
    }
  }

  const lastOf = id => { const r=(edata[id]||[]); return r.length ? r[r.length-1] : null; };
  const lCMJ=lastOf('cmj'), lSJ=lastOf('sj'), lAbal=lastOf('abalakov');
  const lDer=lastOf('cmj_der'), lIzq=lastOf('cmj_izq');
  const ice   = (lCMJ&&lSJ)   ? ((lCMJ.height-lSJ.height)/lSJ.height*100).toFixed(1) : null;
  const coord = (lCMJ&&lAbal) ? ((lAbal.height-lCMJ.height)/lCMJ.height*100).toFixed(1) : null;
  const asym  = (lDer&&lIzq)  ? (Math.abs(lDer.height-lIzq.height)/Math.max(lDer.height,lIzq.height)*100).toFixed(1) : null;

  const currentAthleteName = S.evalAthleteId==='self'
    ? 'Yo (admin)'
    : (S.adminAthletes.find(a=>a.uid===S.evalAthleteId)?.name || S.adminAthletes.find(a=>a.uid===S.evalAthleteId)?.email || 'Atleta');

  let html = '<div class="page-header"><div class="page-title">Test de Saltabilidad</div>'
    + '<div class="page-subtitle">Valoración neuromuscular · Índices elásticos y coordinación</div></div>';

  if(S.isAdmin) {
    html += '<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:var(--r);padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
      + '<div style="font-size:12px;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">Atleta seleccionado</div>'
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

async function selectEvalAthlete(uid) {
  S.evalAthleteId = uid;
  await ensureAthleteEvalData(uid);
  renderMain();
  setTimeout(drawEvalCharts, 100);
}
window.selectEvalAthlete = selectEvalAthlete;

function renderEvalEntry(edata, lCMJ, lSJ, lAbal, lDer, lIzq, ice, coord, asym, isDesktop) {
  const sec = S.evalShowSecondary;
  let html = isDesktop ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">' : '';

  // LEFT: entry form
  html += '<div><div class="wellness-card"><div class="wellness-title">Entrada de datos</div>'
    + '<div class="wellness-sub">'+new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})+'</div>'
    + '<div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">';

  EVAL_TESTS.forEach(t=>{
    const last = (edata[t.id]||[]).slice(-1)[0];
    const fullWidth = (t.id==='saltoH'||t.id==='abalakov') ? 'full' : '';
    html += '<div class="eval-field '+fullWidth+'">'
      + '<label class="eval-lbl">'+t.label+' ('+t.unit+')</label>'
      + '<input class="eval-inp" type="number" step="0.1" placeholder="—" id="einp-height-'+t.id+'" value="'+(last?last.height:'')+'" style="text-align:center;font-size:18px;font-weight:700;padding:10px"></div>';
  });

  html += '<div class="eval-field full" style="margin-top:4px"><label class="eval-lbl">Fecha</label>'
    + '<input class="eval-inp" type="date" id="einp-date-all" value="'+new Date().toISOString().split('T')[0]+'"></div>';
  html += '<div class="eval-field full"><span class="eval-toggle-secondary" onclick="toggleEvalSecondary()">'
    + (sec?'▲ Ocultar':'▼ Mostrar')+' tiempo de vuelo y velocidad</span></div>';

  if(sec) {
    html += '<div class="eval-field"><label class="eval-lbl">T. vuelo CMJ (ms)</label><input class="eval-inp" type="number" id="einp-tof-cmj" placeholder="—"></div>';
    html += '<div class="eval-field"><label class="eval-lbl">Vel. CMJ (m/s)</label><input class="eval-inp" type="number" id="einp-vel-cmj" placeholder="—"></div>';
  }

  html += '</div><div style="padding:0 16px 16px"><button class="wellness-submit" onclick="saveAllEvals()">Procesar salto</button></div></div></div>';

  // RIGHT: metric cards + chart
  html += '<div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
  html += metricCardHtml('ÍNDICE ELÁSTICO', '⚡', ice!==null?ice+'%':'-- %', ice?'var(--accent)':'var(--text3)', '(CMJ−SJ)/SJ · '+(lCMJ&&lSJ?'CMJ '+lCMJ.height+' · SJ '+lSJ.height:'Sin datos'));
  html += metricCardHtml('COORD. DE BRAZOS', '💪', coord!==null?coord+'%':'-- %', coord?'var(--blue)':'var(--text3)', '(Abal−CMJ)/CMJ · '+(lCMJ&&lAbal?'Abal '+lAbal.height+' · CMJ '+lCMJ.height:'Sin datos'));
  html += metricCardHtml('ASIMETRÍA UNILAT.', '↔', asym!==null?asym+'%':'-- %', asym?(parseFloat(asym)>10?'var(--red)':'var(--green)'):'var(--text3)', (lDer&&lIzq?'Der '+lDer.height+' · Izq '+lIzq.height:'Sin datos'));
  html += metricCardHtml('MEJOR CMJ', '↑', lCMJ?lCMJ.height+' cm':'--', 'var(--text)', lCMJ?'Último registro · '+lCMJ.date:'Sin datos');
  html += '</div>';

  html += '</div>';

  if(isDesktop) html += '</div>';
  return html;
}

function metricCardHtml(label, icon, value, color, sub) {
  return '<div class="metric-card"><div class="metric-card-label">'+label+' <span class="metric-card-icon">'+icon+'</span></div>'
    + '<div class="metric-card-value" style="font-size:28px;color:'+color+'">'+value+'</div>'
    + '<div class="metric-card-sub">'+sub+'</div></div>';
}

function renderEvalHistory(edata, isDesktop) {
  if(!(S.evalHidden instanceof Set)) S.evalHidden = new Set();

  const histTests = EVAL_TESTS
    .concat([{id:'asym', label:'Asimetría Unilateral', unit:'%', desc:'% diferencia entre CMJ pierna derecha e izquierda'}]);

  let html = isDesktop ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">' : '';

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
      recsFwd = edata[t.id]||[];
      recs = recsFwd.slice().reverse();
    }
    last = recs[0]||null;

    html += '<div id="eval-card-'+t.id+'" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);margin-bottom:'+(isDesktop?'0':'12px')+';overflow:hidden">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px">';
    html += '<div><div style="font-size:14px;font-weight:600">'+t.label+'</div>';
    if(last) {
      const lcolor = isAsym ? (last.height>10?'var(--red)':last.height>5?'var(--amber)':'var(--green)') : 'var(--accent)';
      html += '<div style="font-size:13px;font-weight:700;color:'+lcolor+';margin-top:2px">'+last.height+t.unit+(isAsym?' · Der:'+last.der+' / Izq:'+last.izq:'')+'</div>';
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
      recs.slice(0,5).forEach((r,i)=>{
        html += '<div class="eval-record"><div>'
          + '<div class="eval-record-main">'+r.height+t.unit+(isAsym?' · Der:'+r.der+' / Izq:'+r.izq:'')+'</div>'
          + '<div class="eval-record-date">'+r.date+(r.tof?' · '+r.tof+'ms':'')+'</div></div>';
        if(!isAsym) html += '<span class="eval-record-del" onclick="deleteEvalRecord(\''+t.id+'\','+(recsFwd.length-1-i)+')">×</span>';
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

function renderEvalCompare() {
  if(!S.adminAthletes.length) {
    return '<div style="text-align:center;padding:30px;color:var(--text3)">'
      + '<div style="margin-bottom:10px">Cargando atletas...</div>'
      + '<button class="abtn abtn-p" onclick="loadEvalAthletes()">Cargar atletas</button></div>';
  }

  const testId = S.evalCompareTest||'cmj';
  const tabsHtml = EVAL_TESTS.map(t=>'<button class="snav-tab '+(testId===t.id?'active':'')+'" onclick="switchCompareTest(\''+t.id+'\')">'+t.label+'</button>').join('');
  let html = '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">'+tabsHtml+'</div>';

  // Si estamos dentro de un equipo o de un atleta individual (S.evalScopeUids
  // seteado), la comparación se acota a ESE grupo — nada de "Yo (admin)" ni
  // de atletas de otro lado. Sin acotar, es el comportamiento anterior.
  const athletes = S.evalScopeUids
    ? S.adminAthletes.filter(a=>S.evalScopeUids.includes(a.uid))
    : [{uid:'self', name:'Yo (admin)', email:''}].concat(S.adminAthletes);
  const allData = athletes.map(a=>{
    const ed = a.uid==='self' ? S.evals : (S._athleteEvalsCache?.[a.uid]||{});
    const recs = ed[testId]||[];
    const last = recs.length ? recs[recs.length-1] : null;
    return {name: a.name||a.email||'Atleta', value: last?last.height:null};
  });
  const withData = allData.filter(x=>x.value!==null);
  const withoutData = allData.filter(x=>x.value===null);
  const testLabel = (EVAL_TESTS.find(t=>t.id===testId)||{}).label || testId;

  html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);overflow:hidden">';
  html += '<div style="padding:14px 16px;border-bottom:1px solid var(--border)">';
  html += '<div style="font-size:15px;font-weight:600">Comparación — '+testLabel+'</div>';
  html += '<div style="font-size:12px;color:var(--text3);margin-top:2px">Último registro por atleta</div></div>';
  html += '<div style="padding:16px">';

  if(withData.length>=1) {
    html += '<canvas class="eval-chart" id="chart-compare-'+testId+'" height="220" style="margin-bottom:12px"></canvas>';
    withData.forEach(d=>{
      html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">'
        + '<span>'+d.name+'</span><span style="font-weight:700;color:var(--accent)">'+d.value+' cm</span></div>';
    });
  } else {
    html += '<div class="eval-no-data">Sin datos registrados.<br><span style="font-size:12px">Presioná Actualizar después de cargar evaluaciones.</span></div>';
  }
  if(withoutData.length) {
    html += '<div style="font-size:11px;color:var(--text3);margin-top:8px">Sin datos: '+withoutData.map(d=>d.name).join(', ')+'</div>';
  }
  html += '<button class="abtn abtn-p" style="width:100%;margin-top:12px" onclick="loadAllAthleteEvals()">↻ Actualizar datos de atletas</button>';
  html += '</div></div>';
  return html;
}

function renderAthleteTeamCompare(myData) {
  const myTeam = (S.teams||[]).find(t=>(t.players||[]).some(p=>p===S.userData?.name || p===S.userData?.email));
  let html = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:16px">'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Comparación con el equipo</div>';

  if(!myTeam) {
    html += '<div class="eval-no-data">No estás registrado en ningún equipo.</div></div>';
    return html;
  }

  html += '<div style="font-size:12px;color:var(--text3);margin-bottom:14px">'+myTeam.name+'</div>';
  html += '<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Tu último valor vs. media del equipo (visual)</div>';

  EVAL_TESTS.filter(t=>t.id!=='cmj_der' && t.id!=='cmj_izq').forEach(t=>{
    const myRecs = myData[t.id]||[];
    const myLast = myRecs.length ? myRecs[myRecs.length-1].height : null;
    if(!myLast) return;
    html += '<div style="margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">'
      + '<span style="font-weight:500">'+t.label+'</span><span style="color:var(--accent);font-weight:700">'+myLast+' cm</span></div>'
      + '<div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">'
      + '<div style="height:100%;background:var(--accent);border-radius:3px;width:'+Math.min(100,myLast/60*100)+'%"></div></div></div>';
  });

  html += '</div>';
  return html;
}
window.renderAthleteTeamCompare = renderAthleteTeamCompare;

async function saveAllEvals() {
  const date = document.getElementById('einp-date-all')?.value || new Date().toISOString().split('T')[0];
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
    } else {
      if(!S._athleteEvalsCache) S._athleteEvalsCache={};
      if(!S._athleteEvalsCache[uid]) S._athleteEvalsCache[uid]={};
      if(!S._athleteEvalsCache[uid][t.id]) S._athleteEvalsCache[uid][t.id]=[];
      S._athleteEvalsCache[uid][t.id].push(rec);
    }
    saved++;
  }

  if(!saved) { showToast('Ingresá al menos un valor'); return; }

  if(uid==='self') {
    scheduleSave();
  } else {
    try {
      await setDoc(doc(db,'personal',uid), {evals:S._athleteEvalsCache[uid]}, {merge:true});
    } catch(e) { showToast('Error al guardar'); return; }
  }

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

  // Mismo criterio que en renderEvals: si estamos scopeados a un equipo/atleta,
  // nunca sustituir por las evaluaciones propias del admin.
  const edata = S.evalScopeUids
    ? getAthleteEvals(S.evalAthleteId || '')
    : getAthleteEvals(S.evalAthleteId || 'self');
  const gridColor = 'rgba(255,255,255,0.05)';
  const view = S.evalView||'entry';
  const chartView = (view==='team_compare') ? 'history' : view;
  // Escalas fijas por test (pedidas explícitamente): la mayoría 10–80cm,
  // salto horizontal mucho más largo, y unilateral en un rango bajo.
  const scaleMap = {
    cmj:{min:10,max:80}, sj:{min:10,max:80}, abalakov:{min:10,max:80},
    saltoH:{min:50,max:340},
    cmj_der:{min:0,max:40}, cmj_izq:{min:0,max:40}
  };

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
            ctx.fillStyle = '#a8b8d8';
            ctx.font = '600 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(val+'cm', bar.x, bar.y-4);
            ctx.restore();
          });
        });
      }
    };

    const colorMap   = {cmj:'rgba(59,125,216,0.8)', sj:'rgba(34,197,94,0.8)', abalakov:'rgba(139,92,246,0.8)', saltoH:'rgba(20,184,166,0.8)', cmj_der:'rgba(245,158,11,0.8)', cmj_izq:'rgba(239,68,68,0.8)'};
    const borderMap  = {cmj:'#3b7dd8', sj:'#22c55e', abalakov:'#8b5cf6', saltoH:'#14b8a6', cmj_der:'#f59e0b', cmj_izq:'#ef4444'};

    EVAL_TESTS.forEach(t=>{
      if(S.evalHidden.has(t.id)) return;
      const recs = edata[t.id]||[];
      if(!recs.length) return;
      const c = document.getElementById('chart-hist-'+t.id);
      if(!c) return;
      const sc = scaleMap[t.id] || {};

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
              borderWidth:1, borderRadius:4, order:2
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
          plugins:{
            legend:{display:false},
            tooltip:{...tooltipStyle, filter:item=>item.datasetIndex===0}
          },
          scales:{
            x:{grid:{color:gridColor}, ticks:{color:'#3d5070', font:{size:9}, maxRotation:30}},
            y:{grid:{color:gridColor}, ticks:{color:'#3d5070', font:{size:9}}, min:sc.min, max:sc.max, title:{display:true,text:'cm',color:'#3d5070',font:{size:9}}}
          }
        },
        plugins:[barLabelsPlugin]
      });
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
              borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.08)',
              tension:.3, pointRadius:5,
              pointBackgroundColor:validVals.map(v=>v>10?'#ef4444':v>5?'#f59e0b':'#22c55e'),
              fill:true
            }]
          },
          options:{
            responsive:true, maintainAspectRatio:true, aspectRatio:2.3,
            plugins:{legend:{display:false}, tooltip:tooltipStyle},
            scales:{
              x:{grid:{color:gridColor}, ticks:{color:'#3d5070', font:{size:9}, maxRotation:30}},
              y:{grid:{color:gridColor}, ticks:{color:'#3d5070', font:{size:9}}, min:0, title:{display:true,text:'% asimetría',color:'#3d5070',font:{size:9}}}
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
                ctx.fillStyle='#a8b8d8';
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

  } else if(chartView==='compare') {
    const testId = S.evalCompareTest||'cmj';
    const athletes = S.evalScopeUids
      ? S.adminAthletes.filter(a=>S.evalScopeUids.includes(a.uid))
      : [{uid:'self',name:'Yo (admin)'}].concat(S.adminAthletes);
    const compData = athletes.map(a=>{
      const ed = a.uid==='self' ? S.evals : (S._athleteEvalsCache?.[a.uid]||{});
      const recs = ed[testId]||[];
      const last = recs.length ? recs[recs.length-1] : null;
      return {name: a.name||a.email||'Admin', value: last?last.height:null};
    }).filter(x=>x.value!==null);

    const canvasId = 'chart-compare-'+testId;
    const c = document.getElementById(canvasId);
    if(c && compData.length) {
      const sc = scaleMap[testId] || {};
      const colors = compData.map((_,i)=>'hsl('+(210+i*35)+',65%,55%)');
      S.evalChartInstances[canvasId] = new Chart(c, {
        type:'bar',
        data:{labels:compData.map(d=>d.name), datasets:[{data:compData.map(d=>d.value), backgroundColor:colors, borderRadius:6, borderWidth:0}]},
        options:{
          responsive:true, maintainAspectRatio:true, aspectRatio:2,
          plugins:{legend:{display:false}, tooltip:{...tooltipStyle, callbacks:{label:ctx=>' '+ctx.raw+' cm'}}},
          scales:{
            x:{grid:{color:gridColor}, ticks:{color:'#3d5070', font:{size:11}}},
            y:{grid:{color:gridColor}, ticks:{color:'#3d5070', font:{size:10}}, min:sc.min, max:sc.max, title:{display:true,text:'cm',color:'#3d5070',font:{size:10}}}
          }
        },
        plugins:[{
          id:'comparelabels',
          afterDatasetsDraw(chart){
            const ctx=chart.ctx;
            chart.getDatasetMeta(0).data.forEach((bar,idx)=>{
              const val=chart.data.datasets[0].data[idx];
              if(!val) return;
              ctx.save();
              ctx.fillStyle='#e8edf8';
              ctx.font='700 11px Inter, sans-serif';
              ctx.textAlign='center';
              ctx.textBaseline='bottom';
              ctx.fillText(val+'cm', bar.x, bar.y-3);
              ctx.restore();
            });
          }
        }]
      });
    }
  }
}
window.drawEvalCharts = drawEvalCharts;

function getAthleteEvals(uid) {
  if(uid==='self') return S.evals;
  return (S._athleteEvalsCache && S._athleteEvalsCache[uid]) || {};
}

// Trae /personal/{uid}.evals para UN atleta puntual si todavía no está en
// caché. Antes, solo el botón "Comparar atletas" (loadAllAthleteEvals)
// poblaba esta caché — por eso elegir un atleta individual no mostraba
// sus saltos, aunque el dato sí existía en Firestore.
async function ensureAthleteEvalData(uid) {
  if (!uid || uid === 'self') return;
  if (S._athleteEvalsCache && S._athleteEvalsCache[uid]) return;
  try {
    const snap = await getDoc(doc(db, 'personal', uid));
    if (!S._athleteEvalsCache) S._athleteEvalsCache = {};
    S._athleteEvalsCache[uid] = snap.exists() ? (snap.data().evals || {}) : {};
  } catch (e) {}
}
window.ensureAthleteEvalData = ensureAthleteEvalData;

async function deleteEvalRecord(testId, idx) {
  if(!confirm('¿Eliminar este registro?')) return;
  const uid = S.evalAthleteId||'self';
  if(uid==='self') {
    if(S.evals[testId]) { S.evals[testId].splice(idx,1); scheduleSave(); }
  } else {
    if(S._athleteEvalsCache?.[uid]?.[testId]) {
      S._athleteEvalsCache[uid][testId].splice(idx,1);
      try { await setDoc(doc(db,'personal',uid), {evals:S._athleteEvalsCache[uid]}, {merge:true}); } catch(e){}
    }
  }
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.deleteEvalRecord = deleteEvalRecord;

function setLibFilter(tag) {
  S._libViewFilter = (S._libViewFilter===tag) ? null : tag;
  updateLibViewResults();
}
window.setLibFilter = setLibFilter;

function switchCompareTest(testId) {
  S.evalCompareTest = testId;
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.switchCompareTest = switchCompareTest;

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

async function loadAllAthleteEvals() {
  if(!S.isAdmin || !S.adminAthletes.length) return;
  showToast('Cargando datos...');
  if(!S._athleteEvalsCache) S._athleteEvalsCache = {};
  const targets = S.evalScopeUids ? S.adminAthletes.filter(a=>S.evalScopeUids.includes(a.uid)) : S.adminAthletes;
  for(const a of targets) {
    try {
      const snap = await getDoc(doc(db,'personal',a.uid));
      if(snap.exists()) S._athleteEvalsCache[a.uid] = snap.data().evals || {};
    } catch(e) {}
  }
  showToast('✓ Datos actualizados');
  renderMain();
  setTimeout(drawEvalCharts, 80);
}
window.loadAllAthleteEvals = loadAllAthleteEvals;


// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ── DASHBOARD ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

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
  const MIN_DAYS_FOR_ACWR = 21;
  const earliestDate = sessionLogs.reduce((min,l)=> l.date<min?l.date:min, sessionLogs[0].date);
  const daysOfHistory = Math.floor((now-new Date(earliestDate))/(1000*60*60*24));
  const hasEnoughHistory = daysOfHistory >= MIN_DAYS_FOR_ACWR;
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
  if(acwr<0.8)   return {label:'Subcarga',color:'var(--blue)'};
  if(acwr<=1.3)  return {label:'Zona óptima ✓',color:'var(--green)'};
  if(acwr<=1.5)  return {label:'Precaución',color:'var(--amber)'};
  return {label:'Riesgo lesional ⚠',color:'var(--red)'};
}

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
    const dateStr=d.toISOString().split('T')[0];
    labels.push(dateStr.slice(5));
    const logsUpToDate=logs.filter(l=>l.date<=dateStr);
    const m=calcLoadMetrics(logsUpToDate);
    acwrData.push(m?.acwr!=null ? +m.acwr.toFixed(2) : null);
    const {pct,allFilled}=getWellnessScore(wellness[dateStr]);
    wellnessData.push(allFilled?pct:null);
  }

  if(acwrData.every(v=>v===null) && wellnessData.every(v=>v===null)) return; // nada que graficar

  const gridColor='rgba(255,255,255,0.05)';
  S.athleteChartInstances['trend']=new Chart(canvas,{
    type:'line',
    data:{
      labels,
      datasets:[
        {label:'Wellness %',data:wellnessData,borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,0.08)',yAxisID:'y',spanGaps:true,tension:.3,pointRadius:2,fill:true},
        {label:'ACWR',data:acwrData,borderColor:'#3b7dd8',backgroundColor:'rgba(59,125,216,0.08)',yAxisID:'y1',spanGaps:true,tension:.3,pointRadius:2,fill:false},
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#a8b8d8',font:{size:11},boxWidth:12}},
        tooltip:{backgroundColor:'#111827',titleColor:'#e8edf8',bodyColor:'#7a90b8',borderColor:'rgba(255,255,255,0.1)',borderWidth:1}
      },
      scales:{
        x:{ ticks:{color:'#7a90b8',font:{size:9},maxRotation:0,autoSkip:true,maxTicksLimit:8}, grid:{color:gridColor} },
        y:{ position:'left', min:0, max:100, ticks:{color:'#22c55e',font:{size:10},stepSize:25}, grid:{color:gridColor} },
        y1:{ position:'right', min:0, suggestedMax:2, ticks:{color:'#3b7dd8',font:{size:10}}, grid:{drawOnChartArea:false} },
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
  } catch(e) {
    const el = document.getElementById('dashboard-content');
    if(el) el.innerHTML = `<div class="empty-state">Error cargando datos: ${e.message}</div>`;
  }
}
window.loadDashboard=loadDashboard;

function renderDashboardContent() {
  const athletes = S.dashAthletes;
  const today = new Date().toISOString().split('T')[0];
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
  const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

  const acwrAlerts = athletes.filter(a=>{
    const logs = a._personal?.history?._sessionLogs||[];
    const m = calcLoadMetrics(logs);
    return m && m.acwr && m.acwr>1.5;
  }).map(a=>({athlete:a, type:'acwr', detail:'ACWR elevado'}));

  const wellnessAlerts = athletes.filter(a=>{
    const wellness = a._personal?.wellness||{};
    const dates = Object.keys(wellness).filter(d=>wellness[d] && getWellnessScore(wellness[d]).allFilled);
    if(!dates.length) return true; // never checked in
    const lastDate = dates.sort().reverse()[0];
    return lastDate < twoDaysAgoStr;
  }).map(a=>({athlete:a, type:'wellness', detail:'Sin wellness hace 2+ días'}));

  const allAlerts = [...acwrAlerts, ...wellnessAlerts];
  const alertAthletes = acwrAlerts.map(x=>x.athlete); // keep for backward compat in metric card

  let html = `<div class="metric-grid" style="margin-bottom:20px">
    <div class="metric-card">
      <div class="metric-card-label">ATLETAS <span class="metric-card-icon">👥</span></div>
      <div class="metric-card-value">${totalAthletes}</div>
      <div class="metric-card-sub">registrados</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-label">ENTRENARON HOY <span class="metric-card-icon">💪</span></div>
      <div class="metric-card-value" style="color:${trainedToday>0?'var(--green)':'var(--text)'}">${trainedToday}</div>
      <div class="metric-card-sub">de ${totalAthletes} atletas</div>
    </div>
    <div class="metric-card">
      <div class="metric-card-label">WELLNESS HOY <span class="metric-card-icon">❤️</span></div>
      <div class="metric-card-value" style="color:${wellnessToday>0?'var(--green)':'var(--text)'}">${wellnessToday}</div>
      <div class="metric-card-sub">registros enviados</div>
    </div>
    ${allAlerts.length?`<div class="metric-card" style="border-color:rgba(239,68,68,0.3)">
      <div class="metric-card-label" style="color:var(--red)">ALERTAS ⚠</div>
      <div class="metric-card-value" style="color:var(--red)">${allAlerts.length}</div>
      <div class="metric-card-sub">requieren atención</div>
    </div>`:''}
  </div>`;

  // Dedicated alerts panel
  if(allAlerts.length) {
    html += `<div style="background:var(--bg2);border:1px solid rgba(239,68,68,0.25);border-radius:var(--r);margin-bottom:20px;overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
        <span style="color:var(--red);font-size:16px">⚠</span>
        <span style="font-size:14px;font-weight:600">Atención requerida</span>
      </div>
      ${allAlerts.map(({athlete,type,detail})=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer" onclick="adminOpenAthleteDash('${athlete.uid}')">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:8px;height:8px;border-radius:50%;background:${type==='acwr'?'var(--red)':'var(--amber)'}"></div>
            <div>
              <div style="font-size:13px;font-weight:500">${athlete.name||athlete.email}</div>
              <div style="font-size:11px;color:var(--text3)">${detail}</div>
            </div>
          </div>
          <span style="color:var(--text3);font-size:16px">›</span>
        </div>`).join('')}
    </div>`;
  }

  if(!athletes.length) {
    html += `<div class="empty-state">No hay atletas registrados aún.<br><span style="font-size:12px">Cuando un atleta cree su cuenta, aparecerá aquí.</span></div>`;
    return html;
  }

  // Búsqueda + filtro por equipo — para que esto siga siendo usable con 30-50 atletas,
  // no solo con 2. Filas compactas en vez de una tarjeta enorme por atleta.
  const teamsWithAthletes = [...new Set(athletes.filter(a=>a.teamId).map(a=>a.teamId))]
    .map(tid=>S.teams?.find(t=>t.id===tid)).filter(Boolean);
  html += `<div style="margin-bottom:10px">
    <input id="dash-search-inp" value="${S.dashSearch||''}" placeholder="Buscar atleta..."
      style="width:100%;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--rsm);padding:9px 13px;color:var(--text);font-size:14px;outline:none;font-family:inherit"
      oninput="setDashSearch(this.value)">
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
    <button class="lib-filter ${!S.dashTeamFilter?'active':''}" onclick="setDashTeamFilter(null)">Todos (${athletes.length})</button>
    <button class="lib-filter ${S.dashTeamFilter==='individual'?'active':''}" onclick="setDashTeamFilter('individual')">Individuales</button>
    ${teamsWithAthletes.map(t=>`<button class="lib-filter ${S.dashTeamFilter===t.id?'active':''}" onclick="setDashTeamFilter('${t.id}')">${t.name}</button>`).join('')}
  </div>
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
  const today = new Date().toISOString().split('T')[0];

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
      const wToday = a._personal?.wellness?.[today];
      const {pct:wPct, allFilled:wAllFilled} = getWellnessScore(wToday);
      const acwrStatus = getACWRStatus(metrics?.acwr??null, metrics?.daysOfHistory);
      const team = a.teamId ? S.teams?.find(t=>t.id===a.teamId) : null;
      return `<div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onclick="adminOpenAthleteDash('${a.uid}')" onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background=''">
        <div style="width:9px;height:9px;border-radius:50%;background:${a.color||'var(--text3)'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name||a.email}</div>
          <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${team?team.name:'Individual'}${a.position?' · '+a.position:''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
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

function setDashSearch(v) { S.dashSearch=v; updateDashboardAthleteList(); }
window.setDashSearch=setDashSearch;

function setDashTeamFilter(v) { S.dashTeamFilter=v; updateDashboardAthleteList(); }
window.setDashTeamFilter=setDashTeamFilter;

async function adminOpenAthleteDash(uid) {
  S.adminView='athlete_detail';
  S.currentView='admin';
  renderBottomBar();
  document.getElementById('main').innerHTML=`<div style="text-align:center;padding:40px;color:var(--text3)">Cargando perfil…</div>`;
  try {
    const uSnap=await getDoc(doc(db,'users',uid));
    const pSnap=await getDoc(doc(db,'personal',uid));
    S.viewingAthlete={uid,userData:uSnap.exists()?uSnap.data():{email:'—',name:'—'},personal:pSnap.exists()?pSnap.data():{}};
  } catch(e) { S.viewingAthlete=null; }
  renderMain();
}
window.adminOpenAthleteDash=adminOpenAthleteDash;

// Athlete home (non-admin) — brief summary
function renderAthleteHome() {
  const today = new Date().toISOString().split('T')[0];
  const logs = S.history?._sessionLogs||[];
  const todayLogs = logs.filter(l=>l.date===today);
  const metrics = calcLoadMetrics(logs);
  const acwrSt = getACWRStatus(metrics?.acwr||null, metrics?.daysOfHistory);
  const hasTodayWellness = !!S.wellness[today];
  
  const routineName = S.assignedRoutine?.name || null;
  return `<div class="page-header">
    <div class="page-title">Hola${S.userData?.name?' '+S.userData.name.split(' ')[0]:''}! 👋</div>
    <div class="page-subtitle">${new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</div>
  </div>
  ${routineName?`<div style="background:var(--accent-dim);border:1px solid rgba(59,125,216,0.25);border-radius:var(--rsm);padding:10px 14px;margin-bottom:16px;font-size:13px;display:flex;align-items:center;gap:8px">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
    <span style="color:var(--accent);font-weight:600">Rutina activa:</span>
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
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:4px">ACWR</div>
        <div style="font-size:11px;color:${acwrSt.color};margin-top:2px">${acwrSt.label}</div>
      </div>
      <div style="text-align:center;padding:10px;border-right:1px solid var(--border)">
        <div style="font-size:24px;font-weight:800">${Math.round((metrics.monotony||0)*10)/10}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:4px">Monotonía</div>
        <div style="font-size:11px;color:${getMonotonyStatus(metrics.monotony).color};margin-top:2px">${getMonotonyStatus(metrics.monotony).label}</div>
      </div>
      <div style="text-align:center;padding:10px">
        <div style="font-size:24px;font-weight:800">${metrics.acuteUA}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-top:4px">UA semana</div>
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
  const filter = S._libViewFilter||null;
  const allTags = [...new Set(S.library.flatMap(e=>e.tags||[]))].sort();

  let items = S.library;
  if(search) items = items.filter(e=>e.name.toLowerCase().includes(search.toLowerCase())||
    (e.tags||[]).some(t=>t.toLowerCase().includes(search.toLowerCase())));
  if(filter) items = items.filter(e=>(e.tags||[]).includes(filter));
  items = [...items].sort((a,b)=>a.name.localeCompare(b.name));

  return `<!-- Tag filters -->
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
    <button class="lib-filter ${!filter?'active':''}" onclick="S._libViewFilter=null;updateLibViewResults()">Todos</button>
    ${allTags.map(t=>'<button class="lib-filter '+(filter===t?'active':'')+'" onclick="setLibFilter(\''+t+'\')">' + t + '</button>').join('')}
  </div>

  <!-- Exercise list -->
  ${items.length?`<div class="wellness-card">
    ${items.map((ex,i)=>{
      const hasV=!!S.videos[ex.id];
      return `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border);transition:background .15s" 
           onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background=''">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:500" id="libname-${ex.id}">${ex.name}</div>
          <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
            ${(ex.tags||[]).map(t=>`<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:var(--accent-dim);color:var(--accent);border:1px solid rgba(59,125,216,0.2)">${t}</span>`).join('')}
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

function addLibraryExercise() {
  const name = prompt('Nombre del ejercicio:');
  if(!name||!name.trim()) return;
  const tagsRaw = prompt('Categorías separadas por coma (ej: Tren inferior,Fuerza):', '');
  const tags = tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [];
  const newEx = {id:genId(), name:name.trim(), tags};
  S.library.push(newEx);
  scheduleSave();
  showToast('✓ Ejercicio agregado');
  renderMain();
}
window.addLibraryExercise=addLibraryExercise;

function editLibraryExercise(id) {
  const ex = S.library.find(e=>e.id===id); if(!ex) return;
  const name = prompt('Nombre:', ex.name);
  if(!name) return;
  const tagsRaw = prompt('Categorías (separadas por coma):', (ex.tags||[]).join(','));
  ex.name = name.trim();
  ex.tags = tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [];
  scheduleSave();
  showToast('✓ Guardado');
  renderMain();
}
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
      S.teamView=null; S.teamDayEdit=null; S.teamDayIdx=0;
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
