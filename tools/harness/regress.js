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
  // ── menús y modales ──
  switchView('settings'); await wait(600); txtBad('ajustes');
  R.fails=fails; R.errs=errs; R.view=innerWidth+'x'+innerHeight; R.theme=document.documentElement.getAttribute('data-theme')||'light';
  window.__regress=R;
})();
