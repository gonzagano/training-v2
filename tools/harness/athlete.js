// Prueba del lado ATLETA (entra como u1 = Meier Matias, con rutina asignada).
// Pantallas, carga de un kilo con el teclado real, tilde, y que el dato quede
// guardado EN SU documento (personal/u1) y se vuelva a ver al re-dibujar.
(async function(){
  const wait=(ms=600)=>new Promise(r=>setTimeout(r,ms));
  const errs=[]; window.addEventListener('error',e=>errs.push(e.message)); window.addEventListener('unhandledrejection',e=>errs.push('rej '+(e.reason?.message||e.reason)));
  const fails=[]; const ok=(c,msg)=>{ if(!c) fails.push(msg); };
  const txtBad=(name)=>{ const t=document.getElementById('main').innerText; ['undefined','NaN','[object'].forEach(b=>{ if(t.includes(b)) fails.push(name+': aparece "'+b+'"'); }); if(document.documentElement.scrollWidth>innerWidth+1) fails.push(name+': scroll horizontal'); };
  const R={};
  const db=()=>JSON.parse(localStorage.getItem('__db')||'{}');
  ok(S.isAdmin===false,'entró como atleta (no admin)');
  ok(!!S.assignedRoutine,'tiene rutina asignada');
  // ── pantallas del atleta ──
  for(const v of ['session','calendar','progress','wellness','stats','settings']){
    try{ switchView(v); }catch(e){ fails.push('switchView '+v+': '+e.message); continue; }
    await wait(900); txtBad('atleta '+v);
  }
  // ── cargar un kilo en el primer ejercicio de la sesión ──
  switchView('session'); await wait(900);
  const sessions=Object.keys(S.assignedRoutine?.sessions||{});
  ok(sessions.length>0,'la rutina tiene días');
  if(sessions.length){ S.currentSession=sessions[0]; renderMain(); await wait(600); }
  const row=document.querySelector('.ex-row');
  ok(!!row,'hay ejercicios en la sesión');
  if(row){
    const exId=row.id.replace('exrow-','');
    const inp=row.querySelector('input.field-inp.load');
    ok(!!inp,'hay campo de carga real');
    if(inp){
      inp.focus(); inp.value='83,5'; inp.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(500);
      row.querySelector('.ex-check')?.click();
      await wait(3500);
      const raw=localStorage.getItem('__db')||'';
      const mine=JSON.stringify(db().personal?.u1||{});
      ok(mine.includes('83,5'),'la carga quedó guardada en personal/u1');
      ok(!JSON.stringify(db().personal?.u2||{}).includes('83,5'),'la carga NO cayó en otro atleta');
      ok(!JSON.stringify(db().personal?.admin1||{}).includes('83,5'),'la carga NO cayó en el admin');
      renderMain(); await wait(600);
      const again=document.querySelector('#exrow-'+exId+' input.field-inp.load');
      ok(again && again.value==='83,5','la carga se ve al re-dibujar');
      ok(document.querySelector('#exrow-'+exId+' .ex-check.checked'),'el tilde queda marcado');
      txtBad('sesión con carga');
    }
  }
  // ── "Hoy toca X kg" (Día 1: sentadilla al 75% con RM 110 → 83) ──
  if(sessions.includes('Día 1')){
    S.currentSession='Día 1'; renderMain(); await wait(600);
    // los bloques arrancan plegados: se mira el contenido del DOM, no solo lo visible
    ok(/hoy toca 83/i.test(document.getElementById('main').textContent),'aparece "Hoy toca 83 kg" en el ejercicio con %RM');
  }
  // ── la carga de su deporte dice "Entrenamiento de handball" (lo hereda del equipo) ──
  ok(mySport()==='Handball','deporte del atleta: lo toma de su equipo ('+mySport()+')');
  { const pel=LOAD_ACTIVITIES.find(x=>x.key==='pelota'); const h=renderLoadItemRow(pel, todayLocal(), mySport()); ok(/Entrenamiento de handball/.test(h)&&h.includes('<svg class="sp-ic"'),'carga del atleta: "Entrenamiento de handball" con dibujo'); ok(!/Pelota/.test(h),'carga del atleta: ya no dice "Pelota"'); }
  // ── inicio: tarjeta de la sesión, semana (7 días, uno marcado como hoy) y wellness ──
  switchView('dashboard'); await wait(700); txtBad('inicio atleta');
  ok(/Hola, Matias!/.test(document.querySelector('.home-head .page-title').textContent),'inicio: saluda por el nombre ('+document.querySelector('.home-head .page-title').textContent+')');
  ok(!!document.querySelector('.home-hero .home-cta') && document.querySelectorAll('.home-week .hw-d').length===7 && document.querySelectorAll('.home-week .hw-today').length===1 && !!document.querySelector('.home-row'),'inicio: sesión de hoy, semana y wellness');
  document.querySelector('.home-row').click(); await wait(500); ok(S.currentView==='wellness','inicio: la fila de wellness abre Wellness');
  switchView('dashboard'); await wait(500); document.querySelector('.home-hero').click(); await wait(500); ok(S.currentView==='session','inicio: la tarjeta abre la sesión');
  // ── cierre de sesión: RPE en botones (sin valor por defecto), duración con +/− y UA en vivo ──
  openSessionFeedback(); await wait(250);
  ok(document.getElementById('sf-rpe').value==='' && !document.querySelector('.sf-rpe-b.on'),'RPE: arranca sin elegir');
  document.querySelectorAll('.sf-rpe-b')[6].click(); document.getElementById('sf-mins').value=''; adjSfMins(5); adjSfMins(-5);
  ok(document.getElementById('sf-rpe').value==='7' && document.querySelectorAll('.sf-rpe-b.on').length===1 && /7 · Muy duro/.test(document.getElementById('sf-rpe-val').textContent),'RPE: botón 7 elegido');
  ok(document.getElementById('sf-mins').value==='55' && document.getElementById('sf-ua-preview').textContent==='385 UA','duración 55 y carga 385 UA en vivo ('+document.getElementById('sf-mins').value+' / '+document.getElementById('sf-ua-preview').textContent+')');
  ok(document.documentElement.scrollWidth<=innerWidth+1,'cierre de sesión: sin scroll horizontal');
  closeSessionFeedback(); openSessionFeedback(); await wait(150); ok(document.getElementById('sf-rpe').value==='','RPE: se limpia al reabrir'); closeSessionFeedback();
  R.fails=fails; R.errs=errs; R.view=innerWidth+'x'+innerHeight;
  window.__athlete=R;
})();
