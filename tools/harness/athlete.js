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
  // ── "Hoy toca X kg" (Día 1: sentadilla al 75% con RM 110 → 82,5, redondeado al disco) ──
  if(sessions.includes('Día 1')){
    S.currentSession='Día 1'; renderMain(); await wait(600);
    // los bloques arrancan plegados: se mira el contenido del DOM, no solo lo visible
    ok(/hoy toca 82,5 kg/i.test(document.getElementById('main').textContent),'aparece "Hoy toca 82,5 kg" (redondeado al disco) en el ejercicio con %RM');
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
  // ── "Semana actual" es la del calendario, aunque el programa haya empezado hace meses ──
  { const keep=S.startDate, keepW=S.currentWeek; S.startDate='2026-06-07'; S.currentWeek=2; if(typeof renderAll==='function') renderAll(); else renderMain(); await wait(400);
    const now=new Date(); const mon=new Date(now); mon.setDate(now.getDate()-((now.getDay()+6)%7)); const sun=new Date(mon); sun.setDate(mon.getDate()+6);
    const f=d=>d.toLocaleDateString('es-AR',{day:'numeric',month:'short'}); const want=f(mon)+' – '+f(sun);
    ok(getWeekHeaderLabel()==='Semana actual · '+want,'semana actual: es la del calendario ('+getWeekHeaderLabel()+')');
    ok(document.getElementById('week-pill').textContent===want,'semana actual: la barra de arriba muestra esta semana ('+document.getElementById('week-pill').textContent+')');
    S.startDate=keep; S.currentWeek=keepW; }
  // ── calculadora: método "Reps + RPE" ──
  { switchView('session'); await wait(600); openRMCalcTab(); await wait(500);
    const lift=document.querySelector('[onclick^="setRMCalcMode"][onclick*="rpe"]'); ok(!!lift,'calculadora: está el método Reps + RPE'); lift.click(); await wait(300);
    const kg=[...document.querySelectorAll('#main input.field-inp')].find(i=>/rpeKg/.test(i.getAttribute('onchange')||'')); kg.value='140'; kg.dispatchEvent(new Event('change',{bubbles:true})); await wait(200);
    const sels=()=>[...document.querySelectorAll('#main select.field-inp')]; const rs=sels().find(x=>/rpeReps/.test(x.getAttribute('onchange'))); rs.value='2'; rs.dispatchEvent(new Event('change',{bubbles:true})); await wait(200);
    const rp=sels().find(x=>/rpeRpe/.test(x.getAttribute('onchange'))); rp.value='8.5'; rp.dispatchEvent(new Event('change',{bubbles:true})); await wait(300);
    const txt=document.getElementById('main').innerText.replace(/\s+/g,' '); ok(txt.includes('157 kg · 1RM estimado'),'calculadora: 140 × 2 a RPE 8,5 → 1RM 157 kg');
    const cells=[...document.querySelectorAll('.rmc-reps > div b')].map(b=>b.textContent); ok(cells.length===12&&cells[0]==='157,5'&&cells[1]==='150','calculadora: carga para 1 a 12 reps, redondeada al disco ('+cells.slice(0,3).join(' / ')+')'); txtBad('calculadora RPE'); }
  // ── el atleta registra kilos y RPE → su RM se actualiza solo ──
  { switchView('session'); await wait(500); S.currentSession='Día 1'; S.rmCalcTabActive=false; renderMain(); await wait(500);
    const row=document.getElementById('exrow-x1'); ok(!!row,'sesión: está la sentadilla');
    if(row){ const ld=row.querySelector('input.field-inp.load'); ld.value='100'; ld.dispatchEvent(new Event('change',{bubbles:true}));
      const rp=[...row.querySelectorAll('input.field-inp')].find(i=>/'rpe'/.test(i.getAttribute('onchange')||'')); rp.value='8'; rp.dispatchEvent(new Event('change',{bubbles:true})); await wait(1500);
      const pr=prescribedRepsForRM(getExPrescriptionForWeek(S.assignedRoutine.sessions['Día 1'].flatMap(b=>b.categories[0].exercises).find(x=>x.id==='x1'), toRoutineRelativeWeek(getRoutineWeek(),S.userData)).reps).reps;
      const want=Math.round(100/rpePct(pr,8)*2)/2;
      ok(S.oneRM.sentadilla_barra===want&&JSON.parse(localStorage.getItem('__db')).personal.u1.oneRM.sentadilla_barra===want,'atleta: su RM pasó a '+want+' kg y quedó guardado ('+S.oneRM.sentadilla_barra+')'); } }
  // ── el atleta también ve por qué está así su ACWR ──
  { switchView('dashboard'); await wait(600); const tap=document.querySelector('#main .ax-tap'); ok(!!tap,'inicio: el ACWR se puede tocar');
    if(tap){ tap.click(); await wait(300); const t=document.querySelector('#acwr-overlay')?.innerText||''; ok(/Tu carga, explicada/.test(t)&&/Carga por semana/i.test(t)&&!/undefined|NaN/.test(t),'atleta: ve la explicación de su ACWR'); closeAcwrExplain(); } }
  // ── ejercicio personalizado con otro de la biblioteca: el atleta ve ese nombre y su video ──
  { const lib2=S.library.find(l=>l.id!=='lsq'&&!/sentadilla/i.test(l.name)); S.videos[lib2.id]='https://youtu.be/abc123';
    if(!S.routineOverrides) S.routineOverrides={}; const rid=S.assignedRoutine.id;
    S.routineOverrides[rid]={...(S.routineOverrides[rid]||{}), 'Día 1':{x1:{fromWeek:1, name:lib2.name, libId:lib2.id, series:'4', reps:'6', rpe:'', note:''}}};
    switchView('session'); await wait(400); S.currentSession='Día 1'; S.rmCalcTabActive=false; renderMain(); await wait(500);
    const row=document.getElementById('exrow-x1'); const vb=row&&row.querySelector('[data-videokey]');
    ok(row&&row.textContent.includes(lib2.name),'atleta: ve el ejercicio que eligió el profe ('+lib2.name+')');
    ok(vb&&vb.getAttribute('data-videokey')===lib2.id&&vb.classList.contains('has-video'),'atleta: el video es el del ejercicio nuevo');
    const vt=row&&row.querySelector('.vt');
    const vh=exVideoThumbHtml(lib2.id,'x'); ok(vt&&(vt.getAttribute('onclick')||'').includes(lib2.id)&&/abc123\/mq1\.jpg/.test(vh)&&/mq2\.jpg/.test(vh)&&/mq3\.jpg/.test(vh),'atleta: miniatura con las 3 fotos del video, al lado del ejercicio');
    if(vt){ vt.click(); await wait(300); ok(document.getElementById('video-overlay')?.classList.contains('open')===true,'atleta: tocando la miniatura se abre el video'); try{ closeVideoModal(); }catch(e){} }
    // más cuadros: con la respuesta del servidor, la miniatura pasa a la tira de 25 fotitos y se mueve
    { const cv=document.createElement('canvas'); cv.width=50; cv.height=50; const sheet=cv.toDataURL('image/png');
      const keepF=window.fetch; window.fetch=async(u,o)=>String(u).includes('/api/yt-frames')?new Response(JSON.stringify({w:160,h:90,cols:5,rows:5,count:20,interval:2000,sheets:[sheet]}),{status:200,headers:{'Content-Type':'application/json'}}):keepF(u,o);
      clearYtFrames('abc123'); await wait(1200); window.fetch=keepF; renderMain(); await wait(600);
      const sb=document.querySelector('#exrow-x1 .vt-sb'); const p1=sb&&sb.style.backgroundPosition; await wait(450); const p2=sb&&sb.style.backgroundPosition;
      ok(!!sb&&/5\d\d% 5\d\d%|500% 500%/.test(sb.style.backgroundSize),'atleta: miniatura con la tira de cuadros del video');
      ok(!!p1&&p1!==p2,'atleta: los cuadros se van pasando ('+p1+' → '+p2+')'); }
    delete S.routineOverrides[rid]['Día 1']; renderMain(); }
  // ── un bloque que arranca en una semana futura no aparece todavía; al ir a esa semana, sí ──
  { switchView('session'); await wait(300); S.currentSession='Día 1'; S.rmCalcTabActive=false; resetRoutineWeekView(); await wait(300);
    const rw=toRoutineRelativeWeek(getRoutineWeek(),S.userData); const blk=S.assignedRoutine.sessions['Día 1'].find(b=>b.categories.some(c=>c.exercises.some(e=>e.id==='x1')));
    blk.fromWeek=rw+1; renderMain(); await wait(300);
    ok(!document.getElementById('exrow-x1'),'atleta: el bloque que empieza la semana que viene no aparece en esta');
    browseRoutineWeek(1); await wait(400); ok(!!document.getElementById('exrow-x1'),'atleta: en la semana siguiente sí aparece');
    resetRoutineWeekView(); delete blk.fromWeek; renderMain(); await wait(200); txtBad('semanas de bloques (atleta)'); }
  // ── inicio: sin wellness hoy, "Completar wellness" arriba de todo; racha de días seguidos ──
  { const td=todayLocal(), keep=S.wellness[td]; const dAgo=n=>{const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-n); return toLocalDateStr(d);};
    const full=JSON.parse(JSON.stringify(Object.values(S.wellness).find(w=>getWellnessScore(w).allFilled)||null));
    if(full){ for(let i=1;i<=3;i++) if(!getWellnessScore(S.wellness[dAgo(i)]).allFilled) S.wellness[dAgo(i)]=JSON.parse(JSON.stringify(full)); }
    delete S.wellness[td]; switchView('dashboard'); await wait(500);
    const first=document.querySelector('.home-cards')?.firstElementChild;
    ok(first&&first.classList.contains('home-wl')&&/Completar wellness/.test(first.innerText),'inicio: sin wellness hoy, "Completar wellness" es lo primero');
    ok(!full||(wellnessStreak(S.wellness)>=3&&/\d+ días/.test(document.querySelector('.home-streak')?.innerText||'')),'inicio: se ve la racha de días seguidos ('+wellnessStreak(S.wellness)+')');
    if(full){ S.wellness[td]=JSON.parse(JSON.stringify(full)); renderMain(); await wait(300);
      ok(!document.querySelector('.home-wl')&&/Wellness hecho/.test(document.querySelector('.home-cards')?.innerText||''),'inicio: hecho el wellness, queda la fila chica con el tilde'); }
    if(keep) S.wellness[td]=keep; else delete S.wellness[td]; renderMain(); txtBad&&txtBad('inicio con racha'); }
  // ── objetivos: el atleta elige hasta 4 de la lista, con meta; se guardan en SU documento ──
  { S.goals=[]; switchView('dashboard'); await wait(400);
    ok(/Elegí tus objetivos/.test(document.querySelector('.home-cards')?.innerText||''),'inicio: invita a elegir objetivos');
    openGoalsEditor('self'); await wait(200);
    ok(document.querySelectorAll('#goals-overlay .ge-opt').length===GOAL_TYPES.length&&/Otro$/.test([...document.querySelectorAll('#goals-overlay .ge-opt b')].pop()?.textContent||''),'objetivos: lista fija con "Otro" al final');
    S.oneRM=S.oneRM||{}; const keepRM=S.oneRM.sentadilla_barra; S.oneRM.sentadilla_barra=100;
    ['rm_sentadilla','frecuencia','lesion','dormir','movilidad'].forEach(id=>toggleGoal(id)); await wait(150);
    ok(S._goalsEdit.list.length===4,'objetivos: no deja elegir más de 4');
    setGoalField('rm_sentadilla','target','120'); setGoalField('frecuencia','target','4'); setGoalField('lesion','pct',50);
    await saveGoals(); await wait(500);
    const D=JSON.parse(localStorage.getItem('__db')); const gs=D.personal.u1?.goals||[];
    ok(gs.length===4&&gs.find(g=>g.type==='rm_sentadilla')?.target===120&&gs.find(g=>g.type==='lesion')?.pct===50,'objetivos: quedan guardados en personal/u1');
    S.oneRM.sentadilla_barra=110; renderMain(); await wait(300);
    const it=[...document.querySelectorAll('.gl-card .gl-it')].find(x=>/sentadilla/i.test(x.innerText));
    ok(it&&/110/.test(it.innerText)&&/120/.test(it.innerText)&&it.querySelector('.gl-bar i').style.width==='50%','objetivos: la sentadilla avanza sola con el RM (100 → 110 de 120 = 50%)');
    txtBad('inicio con objetivos');
    if(keepRM==null) delete S.oneRM.sentadilla_barra; else S.oneRM.sentadilla_barra=keepRM; }
  // ── revisión: con rutina propia y equipo, el Calendario muestra el equipo ──
  { switchView('calendar'); await wait(500);
    ok(!/no estás vinculado/.test(document.getElementById('main').innerText)&&/Handball/.test(document.querySelector('.page-subtitle')?.innerText||''),'calendario: el atleta con rutina propia ve el calendario de su equipo');
    // Primer uso (onboarding): "Atrás" no es rojo, botones parejos, Continuar bloqueado hasta elegir, resumen en filas
    { const keepOC=S.userData.onboardingComplete, keepD=JSON.parse(JSON.stringify(S.onboardingData||{})), keepStep=S.onboardingStep;
      S.userData.onboardingComplete=false; S.onboardingData={lastName:'Meier',firstName:'Matias',age:'16',height:'176',weight:'71'}; S.currentView='onboarding';
      S.onboardingStep=2; renderAll(); await wait(300);
      ok(!document.querySelector('#main .abtn-d')&&!!document.querySelector('#main .ob-back'),'primer uso: "Atrás" es un botón secundario, no rojo');
      const next=[...document.querySelectorAll('#main .ob-nav .wellness-submit')].pop(); ok(!!next&&next.disabled,'primer uso: Continuar bloqueado hasta elegir el tipo de atleta');
      const ch=document.querySelector('#main .ob-choice'); ok(ch&&ch.tagName==='BUTTON'&&ch.getAttribute('role')==='radio','primer uso: el tipo de atleta se elige con botones reales');
      S.onboardingData.athleteType='individual'; S.onboardingStep=4; renderAll(); await wait(300);
      ok(document.querySelectorAll('#main .ob-sum > div').length===6&&/16 años/.test(document.querySelector('#main .ob-sum').innerText),'primer uso: resumen final en 6 filas');
      const b=document.querySelector('#main .ob-back'), f=document.getElementById('onboarding-finish-btn'); ok(b&&f&&Math.abs(b.getBoundingClientRect().height-f.getBoundingClientRect().height)<2,'primer uso: Atrás y Finalizar con la misma altura');
      txtBad('primer uso');
      S.userData.onboardingComplete=keepOC; S.onboardingData=keepD; S.onboardingStep=keepStep; switchView('dashboard'); await wait(300); }
    // Logo nuevo (mancuerna con el gráfico que sube): encabezado e íconos de la app
    { ok(document.querySelector('#topbar .gm-word')?.textContent.trim()==='G-METRICS'&&!!document.querySelector('#topbar .app-logo img[src="logo-icon.svg"]'),'logo: encabezado con el ícono y "G-METRICS"');
      const man=await (await fetch('manifest.json')).json(); const mk=man.icons.find(i=>i.purpose==='maskable');
      const rs=await Promise.all(man.icons.map(i=>fetch(i.src)));
      ok(mk&&mk.src==='icons/icon-512-maskable.png'&&rs.every(r=>r.ok),'logo: los íconos de la app (incluido el adaptable de Android) existen'); }
    // Mis Tests sin ningún test: un solo mensaje, no 4 tarjetas "Sin datos"
    if(!Object.values(S.evalData||{}).some(a=>Array.isArray(a)&&a.length)){ switchView('evals'); await wait(600);
      ok(!!document.getElementById('eval-empty')&&!document.querySelector('.ev-tile'),'mis tests: sin datos muestra un solo mensaje'); }
    // Deslizar: pasa a la sección de al lado (y vuelve), también con un gesto real del dedo
    { switchView('dashboard'); await wait(400);
      swipeNav(1); await wait(500); ok(document.querySelector('#bottombar .bb-btn.active')?.id==='bb-session','deslizar: de Inicio pasa a Mi Rutina');
      swipeNav(-1); await wait(500); ok(document.querySelector('#bottombar .bb-btn.active')?.id==='bb-dashboard','deslizar: vuelve a Inicio');
      ok(swipeNav(-1)===false,'deslizar: en la primera sección no hace nada');
      if(innerWidth<900){ const m=document.getElementById('main'); const T=(x)=>new Touch({identifier:7,target:m,clientX:x,clientY:420});
        try{ m.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[T(300)],changedTouches:[T(300)]})); document.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[T(140)]})); }catch(e){ fails.push('deslizar: no se pudo simular el dedo: '+e.message); }
        await wait(500); ok(document.querySelector('#bottombar .bb-btn.active')?.id==='bb-session','deslizar con el dedo (celular): de Inicio a Mi Rutina');
        switchView('dashboard'); await wait(300); } }
    // Contraseña = DNI: al primer ingreso pide una propia y no deja seguir sin ella
    { S.userData.mustChangePassword=true; localStorage.removeItem('__lastPasswordSet');
      const p=requirePasswordChange(); await wait(300);
      const fill=(a,b)=>{ document.getElementById('ask-f0').value=a; document.getElementById('ask-f1').value=b; document.getElementById('ask-ok').click(); };
      ok(!!document.getElementById('ask-f1'),'contraseña: al entrar pide elegir una nueva');
      fill('corta','corta'); await wait(400); ok(!!document.getElementById('ask-f0')&&!localStorage.getItem('__lastPasswordSet'),'contraseña: corta no se acepta y vuelve a pedir');
      document.getElementById('ask-cancel').click(); await wait(400); ok(!!document.getElementById('ask-f0'),'contraseña: cancelar no la saltea');
      fill('Handball2026','Handball2027'); await wait(400); ok(!localStorage.getItem('__lastPasswordSet'),'contraseña: si no coinciden no se guarda');
      fill('Handball2026','Handball2026'); await p; await wait(300);
      const ls=JSON.parse(localStorage.getItem('__lastPasswordSet')||'null');
      ok(ls&&ls.uid==='u1'&&ls.pass==='Handball2026','contraseña: se guarda la nueva para este atleta');
      ok(!S.userData.mustChangePassword&&!(db().users?.u1||{}).mustChangePassword,'contraseña: ya no la vuelve a pedir (marca borrada en su usuario)'); localStorage.removeItem('gm-pw-ok-u1'); }
    // Notificaciones sin nada: mensaje del sistema (no el texto suelto de antes)
    switchView('notifications'); await wait(500);
    const hasN=document.querySelectorAll('#main .wellness-card').length>0;
    ok(hasN||!!document.getElementById('notif-empty'),'notificaciones: sin avisos muestra el estado vacío del sistema');
    // Esqueleto de carga: se dibuja con la forma de la pantalla y se anuncia como "Cargando"
    { const d=document.createElement('div'); d.innerHTML=skelHtml('dash'); ok(d.querySelectorAll('.sk-tile').length===4&&d.firstElementChild.getAttribute('aria-label')==='Cargando','esqueleto de carga: 4 contadores + lista, con aviso para lectores de pantalla'); }
    // Stats salió de la barra de abajo: se entra desde Inicio → "Ver estadísticas"
    ok(!document.getElementById('bb-stats')&&!/Stats/.test(document.getElementById('bottombar').innerText),'barra de abajo: ya no tiene Stats');
    switchView('dashboard'); await wait(500);
    const sl=document.getElementById('home-stats-link'); ok(!!sl,'inicio: hay acceso a estadísticas desde Control de carga');
    if(sl){ sl.click(); await wait(600); }
    ok(S.currentView==='stats','inicio: "Ver estadísticas" abre Estadísticas');
    ok(document.querySelector('#bottombar .bb-btn.active')?.id==='bb-dashboard','estadísticas: la barra marca Inicio como sección activa');
    const act=[...document.querySelectorAll('#main div')].find(d=>/Actividad — últimos 7 días/.test(d.textContent)&&d.children.length>=2);
    ok(!act||act.querySelectorAll('div[style*="var(--accent)"]').length>0||!(S.history?._sessionLogs||[]).length,'estadísticas: los días entrenados (prácticas y partidos) cuentan como activos');
    switchView('wellness'); await wait(400); ok(!/\d{4}-\d{2}-\d{2}/.test(document.querySelector('.page-header')?.innerText||''),'wellness: sin la fecha cruda AAAA-MM-DD arriba'); }
  R.fails=fails; R.errs=errs; R.view=innerWidth+'x'+innerHeight;
  window.__athlete=R;
})();
