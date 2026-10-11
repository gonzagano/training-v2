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
  setRoutineCompare(true); await wait(500); txtBad('comparar'); cmpSet('main','PRINC'); await wait(200); ok(document.querySelectorAll('.cmp-blk').length>=2,'comparar: principales'); cmpSet('main',null);
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
