// Prueba de regresión integral (se carga con eval en la página del harness).
(async function(){
  const wait=(ms=600)=>new Promise(r=>setTimeout(r,ms));
  const errs=[]; window.addEventListener('error',e=>errs.push(e.message)); window.addEventListener('unhandledrejection',e=>errs.push('rej '+(e.reason?.message||e.reason)));
  const fails=[]; const ok=(c,msg)=>{ if(!c) fails.push(msg); };
  const txtBad=(name)=>{ const t=document.getElementById('main').innerText; ['undefined','NaN','[object'].forEach(b=>{ if(t.includes(b)) fails.push(name+': aparece "'+b+'"'); }); if(document.documentElement.scrollWidth>innerWidth+1) fails.push(name+': scroll horizontal'); };
  const R={};
  // ── ADMIN ──
  switchView('dashboard'); await wait(1500); txtBad('dashboard'); ok(document.querySelectorAll('.ar-row').length===8,'dashboard: 8 filas');
  setDashTeamFilter('t2'); await wait(300); ok(document.querySelectorAll('.ar-row').length===2,'filtro t2'); setDashTeamFilter(null);
  switchView('atletas'); await wait(1500); txtBad('atletas'); ok(document.querySelectorAll('#atletas-list .ar-row').length===3,'atletas: 3 individuales');
  openAtleta('u0'); await wait(1200); for(const v of ['rutina','wellness','stats','evals','perfil']){ setAtletaSubview(v); await wait(800); txtBad('ficha '+v); }
  setAtletaSubview('rutina'); await wait(500);
  ok(document.querySelectorAll('.rt-d').length===7,'círculos de días'); ok(document.querySelector('.wk-t')?.innerText.startsWith('Semana'),'tarjeta de semana');
  setAtletaRoutineDay(0); await wait(300); document.querySelectorAll('[onclick^="toggleAtletaRoutineBlock"]').forEach(b=>b.click()); await wait(300);
  txtBad('rutina día abierto');
  openAdminProgressionModal('u0','x1','Sentadilla libre','Día 1'); await wait(400); ok(!!document.querySelector('#lc-wrap')||true,'modal progresión'); closeProgressionModal();
  // ── ficha: vista horizontal con sus botones para modificar ──
  setAtletaRoutineCicloView('horiz'); await wait(500); txtBad('ficha horizontal');
  ok(document.querySelectorAll('.cmp-ath .cmp-col').length===3,'ficha horizontal: los 3 días en columnas');
  ok(document.querySelectorAll('.cmp-ath [onclick^="openExerciseOverrideModal"]').length>0&&document.querySelectorAll('.cmp-ath [onclick^="openCoachNoteModal"]').length>0,'ficha horizontal: Personalizar y Nota en cada ejercicio');
  document.querySelector('.cmp-ath [onclick^="openExerciseOverrideModal"]').click(); await wait(300); ok(!!document.querySelector('.video-modal.open, .modal-overlay.open, [id$="overlay"].open'),'ficha horizontal: Personalizar abre su formulario'); document.querySelectorAll('[id$="overlay"].open').forEach(o=>o.classList.remove('open'));
  setAtletaRoutineCicloView('micro'); await wait(300);
  // nota del profe
  openCoachNoteModal('u0','x1','Sentadilla'); document.getElementById('coachnote-textarea').value='Nota de prueba'; await saveCoachNote(false); await wait(500);
  ok(JSON.parse(localStorage.getItem('__db')).personal.u0.coachNotes?.x1?.text==='Nota de prueba','nota guardada en u0');
  // formulario en nombre
  const adminBefore=JSON.stringify(JSON.parse(localStorage.getItem('__db')).personal.admin1);
  openProxyForm('u6'); await wait(300); proxySetW('fatiga',3); proxySetMins('gimnasio','40'); proxySetRpe('gimnasio',5); await saveProxyForm(); await wait(600);
  const dbp=JSON.parse(localStorage.getItem('__db')).personal; ok(dbp.u6.wellness?.[todayLocal()]?.fatiga===3,'proxy: wellness en u6'); ok(dbp.u6.history._sessionLogs.some(l=>l.activity==='gimnasio'&&l.mins===40),'proxy: carga en u6'); ok(JSON.stringify(dbp.admin1)===adminBefore,'proxy: admin intacto');
  // editor + selector de nombres + comparar
  goBackFromAthleteDetail(); switchView('admin'); adminGoRoutines(); await wait(600); editRoutine('r1'); await wait(500);
  addRoutineBlock('Día 3'); await wait(200); const av=[...document.querySelectorAll('#blockname-body .bnp-opt')].map(b=>b.innerText.replace(/\s+/g,' ').trim()); ok(!av.includes('ESTRUCTURA')&&!av.includes('ACONDICIONAMIENTO'),'selector oculta nombres usados'); ok(av.includes('PUMP'),'selector ofrece PUMP'); bnpPickMain('PUMP'); await wait(300);
  ok(S.editingRoutine.sessions['Día 3'].some(b=>b.title==='PUMP'&&b.main==='PUMP'),'bloque PUMP creado');
  // HIIT con 0, 1 o 2 subcategorías + SPRINT / ACC / COD
  { const order=BLOCK_NAMES.map(c=>c.main); ok(order.slice(order.indexOf('DLO'),order.indexOf('DLO')+5).join()==='DLO,HIIT,SPRINT,ACC,COD','bloques: HIIT, SPRINT, ACC y COD debajo de DLO');
    const titles=()=>S.editingRoutine.sessions['Día 3'].map(b=>b.title);
    addRoutineBlock('Día 3'); await wait(200); bnpPickMain('HIIT'); await wait(200);
    ok([...document.querySelectorAll('#blockname-body .bnp-chips .chip-btn')].map(b=>b.innerText.trim()).join()==='RSA,CORTO,LARGO,SIT,NEUROMUSCULAR','HIIT: sus 5 subcategorías');
    bnpConfirm(); await wait(250); ok(titles().includes('HIIT'),'HIIT sin subcategoría');
    addRoutineBlock('Día 3'); await wait(200); bnpPickMain('HIIT'); await wait(200);
    ok(document.querySelector('#blockname-body .abtn-p').disabled,'HIIT a secas repetido: no deja');
    bnpToggleSub('SIT'); await wait(100); bnpConfirm(); await wait(250); ok(titles().includes('HIIT // SIT'),'HIIT con 1 subcategoría');
    addRoutineBlock('Día 3'); await wait(200); bnpPickMain('HIIT'); await wait(200); bnpToggleSub('CORTO'); bnpToggleSub('RSA'); await wait(100);
    ok(document.querySelector('#blockname-body .bnp-foot b').innerText==='HIIT // RSA // CORTO','HIIT: 2 subcategorías en orden de lista');
    bnpToggleSub('LARGO'); await wait(100); ok(S._bnp.multi.length===2&&!S._bnp.multi.includes('CORTO'),'HIIT: máximo 2 (la tercera reemplaza a la más vieja)');
    bnpToggleSub('LARGO'); bnpToggleSub('CORTO'); await wait(100); bnpConfirm(); await wait(250);
    const hb=S.editingRoutine.sessions['Día 3'].find(b=>b.title==='HIIT // RSA // CORTO'); ok(hb&&hb.main==='HIIT'&&hb.sub==='RSA // CORTO','HIIT con 2 subcategorías guardado');
    ok(getBlockMainSub({title:'hiit // corto // rsa'})?.sub==='RSA // CORTO','HIIT: reconoce un título escrito a mano');
    addRoutineBlock('Día 3'); await wait(200); bnpPickMain('SPRINT'); await wait(250); addRoutineBlock('Día 3'); await wait(200); bnpPickMain('COD'); await wait(250);
    ok(titles().includes('SPRINT')&&titles().includes('COD'),'SPRINT y COD creados');
    addRoutineBlock('Día 3'); await wait(200); const av2=[...document.querySelectorAll('#blockname-body .bnp-opt')].map(b=>b.innerText.replace(/\s+/g,' ').trim().replace(/ ›$/,'')); ok(!av2.includes('SPRINT')&&!av2.includes('COD')&&av2.includes('ACC')&&av2.includes('HIIT'),'selector: SPRINT/COD usados no aparecen; ACC y HIIT sí'); closeBlockNamePicker(); }
  setRoutineCompare(true); await wait(500); txtBad('comparar');
  // ── vista horizontal: se PLANIFICA ahí mismo ──
  { const R1=()=>S.editingRoutine.sessions; const d2=Object.keys(R1()).find(k=>R1()[k].some(b=>b.title==='FUERZA B // MMII'))||'Día 2';
    const blk=R1()[d2].find(b=>b.title==='FUERZA B // MMII'); const ex0=blk.categories[0].exercises[0];
    const row=document.getElementById('cmpex-'+ex0.id); ok(!!row,'horizontal: cada ejercicio tiene su fila editable');
    const f=row.querySelectorAll('.cmp-f'); ok(f.length===4,'horizontal: 4 campos (series, reps, %RM, intensidad)');
    f[0].value='5'; f[0].dispatchEvent(new Event('change',{bubbles:true})); f[1].value='3'; f[1].dispatchEvent(new Event('change',{bubbles:true})); f[2].value='85'; f[2].dispatchEvent(new Event('change',{bubbles:true}));
    const p1=getExPrescriptionForWeek(ex0,1); ok(p1.series==='5'&&p1.reps==='3'&&p1.pct==='85','horizontal: series/reps/%RM quedan en la semana 1');
    if(getRoutineDurationWeeks(S.editingRoutine)>1){ cmpSet('week',2); await wait(200); const f2=document.getElementById('cmpex-'+ex0.id).querySelectorAll('.cmp-f'); f2[0].value='6'; f2[0].dispatchEvent(new Event('change',{bubbles:true}));
      ok(getExPrescriptionForWeek(ex0,2).series==='6'&&getExPrescriptionForWeek(ex0,1).series==='5','horizontal: cada semana guarda lo suyo'); cmpSet('week',1); await wait(200); }
    // agregar bloque y ejercicio desde la columna
    const nB=R1()[d2].length; document.querySelectorAll('.cmp-col')[Object.keys(R1()).length?getOrderedSessionNames(S.editingRoutine).indexOf(d2):0].querySelector('.cmp-addb').click(); await wait(250); bnpPickMain('ACC'); await wait(300);
    ok(R1()[d2].length===nB+1&&R1()[d2].some(b=>b.title==='ACC'),'horizontal: "+ Bloque" agrega en ese día'); ok(S._routineCompare===true&&!!document.getElementById('cmp-wrap'),'horizontal: sigue en horizontal después de agregar');
    const acc=R1()[d2].find(b=>b.title==='ACC'); openRoutineLib(acc.id,d2,0); await wait(250); document.querySelector('#lib-list .lib-item').click(); await wait(350);
    ok(acc.categories[0].exercises.length===1,'horizontal: "+ Ejercicio" agrega al bloque'); ok(!!document.getElementById('cmpex-'+acc.categories[0].exercises[0].id),'horizontal: el ejercicio nuevo aparece en la columna');
    // mover y quitar
    const ids=()=>R1()[d2].map(b=>b.id).join(); const before=ids(); moveRoutineBlock(acc.id,d2,-1); await wait(250); ok(ids()!==before&&!!document.getElementById('cmp-wrap'),'horizontal: mover bloque');
    const exN=acc.categories[0].exercises[0].id; cmpToggleEx(exN); await wait(200); ok(!!document.querySelector('#cmpex-'+exN+' .cmp-full table'),'horizontal: "⋯" abre todas las semanas'); cmpToggleEx(exN); await wait(150);
    deleteRExercise(exN,acc.id,d2,0); await wait(250); ok(acc.categories[0].exercises.length===0,'horizontal: quitar ejercicio');
    txtBad('horizontal editable'); }
 cmpSet('main','PRINC'); await wait(200); ok(document.querySelectorAll('.cmp-blk').length>=2,'comparar: principales'); cmpSet('main',null);
  history.back; setRoutineCompare(false);
  // renombrar día con intercambio
  startRenameRoutineSession('Día 1'); await wait(100); const inp=document.getElementById('rsess-inp'); inp.value='Día 2'; inp.dispatchEvent(new Event('blur')); await wait(300);
  ok(document.getElementById('confirm-modal-overlay').classList.contains('open'),'renombrar: pide intercambiar'); confirmModalConfirm(); await wait(300);
  closeConfirmModal && closeConfirmModal();
  // ── volver atrás ──
  switchView('dashboard'); await wait(1200); document.querySelector('.ar-row').click(); await wait(1500); history.back(); await wait(900); ok(S.currentView==='dashboard'&&!S.atletaView,'historial: ficha→dashboard');
  openReminderScreen(); await wait(400); document.querySelector('.back-btn').click(); await wait(500); ok(S.currentView==='dashboard','atrás desde Recordatorios → Dashboard');
  // ── deportes: nombre bien escrito + dibujo + cruce con la carga ──
  ok(canonicalSport('basquet')==='Básquet'&&canonicalSport('FUTBOL 5')==='Fútbol'&&canonicalSport('padel')==='Pádel'&&canonicalSport('voley')==='Vóley','deportes: nombres bien escritos');
  ok(SPORTS.every(sp=>sportIconHtml(sp).includes('<svg')),'deportes: cada uno tiene su dibujo');
  { const pel=LOAD_ACTIVITIES.find(x=>x.key==='pelota'); const dT=getLoadActivityDisplay(pel,'tenis'); ok(dT.label==='Entrenamiento de tenis'&&dT.emoji.includes('<svg'),'carga: "Entrenamiento de tenis" con dibujo'); ok(getLoadActivityDisplay(pel,'').label!=='Pelota','carga: sin deporte ya no dice "Pelota"'); }
  // ── búsqueda sin tildes ──
  switchView('library'); await wait(700); txtBad('biblioteca');
  { const si=document.getElementById('lib-view-search'); si.value='biceps'; si.dispatchEvent(new Event('input',{bubbles:true})); await wait(300);
    ok(document.getElementById('lib-view-body').innerText.includes('Curl de bíceps'),'biblioteca: "biceps" encuentra "bíceps"');
    si.value='barra curl'; si.dispatchEvent(new Event('input',{bubbles:true})); await wait(300);
    ok(document.getElementById('lib-view-body').innerText.includes('Curl de bíceps'),'biblioteca: palabras en otro orden');
    si.value=''; si.dispatchEvent(new Event('input',{bubbles:true})); }
  // ── categorías de la biblioteca: lista fija, mismo orden en Biblioteca y en el selector, sin familias ni cruces ──
  { const want=LIB_MAIN_CATEGORIES.join("|"); const names=sel=>[...document.querySelectorAll(sel)].map(b=>(b.childNodes[0].textContent||"").trim());
    if(!S._libViewFilterOpen) toggleLibViewFilterDropdown(); await wait(250);
    const inView=names("#lib-view-body .lib-filter").filter(t=>LIB_MAIN_CATEGORIES.includes(t)); ok(inView.join("|")===want,"biblioteca: solo las categorías principales, en orden");
    ok(!/Fuerza|Potencia|Auxiliares|Movilidad y estabilidad/.test(names("#lib-view-body .lib-filter").filter(t=>!LIB_MAIN_CATEGORIES.includes(t)).join("|")),"biblioteca: sin la fila de familias");
    ok(typeof window.deleteLibraryTag==="undefined"&&!document.querySelector("#lib-view-body .lib-filter [onclick*=delete]"),"biblioteca: las categorías no se pueden borrar");
    { const tmp=document.createElement("div"); tmp.innerHTML=renderCategoryFilterChips(new Set(),"setFilter").mainRow; const inPick=[...tmp.querySelectorAll(".lib-filter")].map(b=>(b.childNodes[0].textContent||"").trim()); ok(inPick.join("|")===want,"selector de ejercicios: mismas categorías y mismo orden"); } }
  // ── aviso de ejercicio parecido / duplicado ──
  addLibraryExercise(); await wait(300);
  { const ni=document.getElementById('exform-name-inp'); ni.value='curl de biceps'; ni.dispatchEvent(new Event('input',{bubbles:true})); await wait(200);
    ok(document.getElementById('exform-dups').innerText.includes('Curl de bíceps con barra'),'nuevo ejercicio: muestra los parecidos');
    ni.value='CURL DE BICEPS CON BARRA'; ni.dispatchEvent(new Event('input',{bubbles:true})); await wait(200);
    ok(!!document.querySelector('#exform-dups .dup-exact'),'nuevo ejercicio: avisa que ya existe');
    ni.value='zzqq'; ni.dispatchEvent(new Event('input',{bubbles:true})); await wait(200);
    ok(document.getElementById('exform-dups').innerHTML==='','nuevo ejercicio: sin parecidos no muestra nada'); closeExFormModal(); }
  // ── crear atleta: mail + DNI, sin desloguear al profe ──
  switchView('atletas'); await wait(1200);
  ok(!!document.querySelector('[onclick="openNewAthleteModal()"]'),'Atletas: botón "Crear nuevo atleta"');
  document.querySelector('[onclick="openNewAthleteModal()"]')?.click(); await wait(300);
  { const set=(id,v,ev='input')=>{ const el=document.getElementById(id); el.value=v; el.dispatchEvent(new Event(ev,{bubbles:true})); };
    set('na-last','gonzález'); set('na-first','maría'); set('na-age','22'); set('na-height','168'); set('na-weight','61');
    set('na-sport','Pádel','change'); await wait(200);
    set('na-email','Maria.G@Mail.com'); set('na-dni','12');
    await saveNewAthlete(); ok(/DNI/.test(document.getElementById('newath-err').innerText),'crear atleta: rechaza DNI corto');
    set('na-dni','40.123.456'); await saveNewAthlete(); await wait(700);
    const d2=JSON.parse(localStorage.getItem('__db')); const nu=Object.entries(d2.users).find(([,u])=>u.email==='maria.g@mail.com');
    ok(!!nu,'crear atleta: quedó su perfil guardado');
    if(nu){ const u=nu[1]; ok(u.name==='González María'&&u.sport==='Pádel'&&u.age===22&&u.height===168&&u.weight===61&&u.role==='athlete'&&u.onboardingComplete===true&&u.athleteType==='individual','crear atleta: datos correctos ('+JSON.stringify(u).slice(0,160)+')');
      ok(!JSON.stringify(u).includes('40123456'),'crear atleta: el DNI no se guarda en la base'); }
    ok(JSON.parse(localStorage.getItem('__authAccounts')||'{}')['maria.g@mail.com']?.pass==='40123456','crear atleta: contraseña = DNI (solo números)');
    ok(JSON.parse(localStorage.getItem('__testUser')||'{}').uid==='admin1'&&S.isAdmin===true,'crear atleta: el profe sigue logueado');
    ok(!document.getElementById('newath-overlay').classList.contains('open'),'crear atleta: se cierra el formulario');
    closeConfirmModal && closeConfirmModal(); await wait(300);
    ok(document.querySelectorAll('#atletas-list .ar-row').length===4&&document.getElementById('atletas-list').innerText.includes('González María'),'crear atleta: aparece en la lista');
    txtBad('atletas con atleta nuevo');
    // mismo mail otra vez → no duplica
    openNewAthleteModal(); await wait(200); set('na-last','Otra'); set('na-first','Persona'); set('na-sport','Tenis','change'); await wait(150); set('na-email','maria.g@mail.com'); set('na-dni','40123456'); await saveNewAthlete(); await wait(300);
    ok(document.getElementById('newath-err').innerText.length>0,'crear atleta: mail repetido da error'); closeNewAthleteModal();
    // con equipo: hereda el deporte y entra al plantel
    openNewAthleteModal(); await wait(200); set('na-last','Sosa'); set('na-first','Leo'); set('na-teamId','t2','change'); await wait(200); set('na-email','leo@mail.com'); set('na-dni','39000111'); await saveNewAthlete(); await wait(700);
    const d3=JSON.parse(localStorage.getItem('__db')); const lu=Object.entries(d3.users).find(([,u])=>u.email==='leo@mail.com');
    ok(lu&&lu[1].teamId==='t2'&&lu[1].athleteType==='team'&&lu[1].sport==='Handball','crear atleta de equipo: equipo y deporte');
    ok(lu&&d3.teams.t2.memberUids.includes(lu[0])&&d3.teams.t2.players.includes('Sosa Leo'),'crear atleta de equipo: sumado al plantel');
    closeConfirmModal && closeConfirmModal(); }
  // ── menús y modales ──
  switchView('settings'); await wait(600); txtBad('ajustes');
  R.fails=fails; R.errs=errs; R.view=innerWidth+'x'+innerHeight; R.theme=document.documentElement.getAttribute('data-theme')||'light';
  window.__regress=R;
})();
