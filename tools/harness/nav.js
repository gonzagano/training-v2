// Navegación del profe: cada botón del menú desde cada pantalla, y el "‹" desde cada entrada a una ficha.
(async()=>{
  const wait=(ms=350)=>new Promise(r=>setTimeout(r,ms));
  const fails=[], errs=[]; const ok=(c,msg)=>{ if(!c) fails.push(msg); };
  window.addEventListener('error',e=>errs.push(e.message));
  await wait(800);
  const TABS=['dashboard','teams','atletas','admin'];
  const navBtn=id=>[...document.querySelectorAll('#bb-'+id+', #sidebar-nav .sidebar-item')].filter(b=>b.id==='bb-'+id||(b.getAttribute('onclick')||'').includes("'"+id+"'")).find(b=>b.offsetParent!==null);
  const tap=async id=>{ const b=navBtn(id); if(!b){ fails.push('no encuentro el botón '+id); return; } b.click(); await wait(); };
  const active=()=>TABS.filter(id=>{ const b=navBtn(id); return b&&b.classList.contains('active'); });
  const back=async()=>{ const b=document.querySelector('#main .back-btn'); if(!b){ fails.push('no hay botón ‹ en '+S.currentView+'/'+S.adminView); return; } b.click(); await wait(600); };
  const inFicha=uid=>S.atletaView&&S.atletaView.uid===uid&&!!document.querySelector('#main .back-btn');
  const TITLE={dashboard:null, teams:/Equipos/, atletas:/Atletas/, admin:/Panel admin/};
  const atRoot=(id,where)=>{
    const t=document.getElementById('main').innerText; const lbl=where+' → '+id;
    ok(S.currentView===id,lbl+': está en '+S.currentView);
    ok(!S.atletaView&&!S.viewingAthlete&&!S._inAthleteDetail,lbl+': quedó una ficha abierta');
    ok(!S.teamView&&!S.teamDayEdit,lbl+': quedó un equipo abierto');
    ok(S.adminView==='main',lbl+': pantalla interna '+S.adminView);
    ok(!S.editingRoutine,lbl+': quedó el editor de rutinas');
    ok(!document.querySelector('#main .back-btn'),lbl+': no es la pantalla principal (hay un ‹)');
    if(TITLE[id]) ok(TITLE[id].test(t),lbl+': no se ve "'+TITLE[id].source+'"');
    ok(active().join()===id,lbl+': menú marcado '+active().join());
  };
  // ── pantallas de partida ──
  const START={
    'Dashboard':async()=>{ await tap('dashboard'); },
    'Equipos':async()=>{ await tap('teams'); },
    'un equipo':async()=>{ await tap('teams'); await openTeam('t1'); await wait(600); },
    'Atletas':async()=>{ await tap('atletas'); },
    'ficha desde Atletas':async()=>{ await tap('atletas'); openAtleta('u0'); await wait(1000); },
    'ficha desde Dashboard':async()=>{ await tap('dashboard'); await adminOpenAthleteDash('u1'); await wait(300); },
    'ficha desde un equipo':async()=>{ await tap('teams'); await openTeam('t1'); await wait(500); await adminOpenAthlete('u1'); await wait(300); },
    'ficha desde Panel Admin':async()=>{ await tap('admin'); await adminGoAthletes(); await wait(300); await adminOpenAthlete('u2'); await wait(300); },
    'ficha en Rutina':async()=>{ await tap('atletas'); openAtleta('u0'); await wait(1000); setAtletaSubview('rutina'); await wait(300); },
    'Panel Admin':async()=>{ await tap('admin'); },
    'alumnos':async()=>{ await tap('admin'); await adminGoAthletes(); await wait(300); },
    'Gestión de rutinas':async()=>{ await tap('admin'); adminGoRoutines(); await wait(400); },
    'editor de rutinas':async()=>{ await tap('admin'); adminGoRoutines(); await wait(300); editRoutine('r1'); await wait(300); },
    'Comparar':async()=>{ await tap('admin'); adminGoCompare(); await wait(500); },
    'Biblioteca':async()=>{ await tap('admin'); switchView('library'); await wait(300); },
    'Ajustes':async()=>{ switchView('settings'); await wait(300); },
    'Notificaciones':async()=>{ switchView('notifications'); await wait(300); },
    'reporte semanal':async()=>{ await tap('atletas'); openAtleta('u0'); await wait(900); await openWeeklyReport('u0'); await wait(300); },
  };
  for(const [name,go] of Object.entries(START)) for(const id of TABS) { await go(); await tap(id); atRoot(id,name); }
  // tocar la sección en la que ya estás también te lleva a su pantalla principal
  await tap('atletas'); openAtleta('u0'); await wait(900); await tap('atletas'); atRoot('atletas','Atletas (repetido)');
  // ── el "‹" vuelve a donde estabas ──
  await tap('atletas'); document.querySelector('#main [onclick*="openAtleta"]')?.click(); await wait(1000);
  ok(inFicha(S.atletaView&&S.atletaView.uid),'Atletas: tocar un atleta abre la ficha'); ok(active().join()==='atletas','ficha desde Atletas: el menú sigue en Atletas ('+active().join()+')');
  await back(); atRoot('atletas','‹ de ficha abierta desde Atletas');
  await tap('dashboard'); await adminOpenAthleteDash('u1'); await wait(300); ok(active().join()==='dashboard','ficha desde Dashboard: menú en Dashboard ('+active().join()+')'); await back(); atRoot('dashboard','‹ de ficha abierta desde Dashboard');
  await tap('teams'); await openTeam('t1'); await wait(500); await adminOpenAthlete('u1'); await wait(300); ok(active().join()==='teams','ficha desde equipo: menú en Equipos ('+active().join()+')'); await back();
  ok(S.currentView==='teams'&&S.teamView&&S.teamView.id==='t1'&&!S.atletaView,'‹ de ficha abierta desde un equipo vuelve a ese equipo ('+S.currentView+')');
  await tap('admin'); await adminGoAthletes(); await wait(300); await adminOpenAthlete('u2'); await wait(300); await back(); ok(S.currentView==='admin'&&S.adminView==='athletes'&&!S.atletaView,'‹ de ficha desde alumnos vuelve a alumnos ('+S.adminView+')');
  // EL caso del usuario: quedó una ficha de Dashboard, paso a Atletas, abro otro, ‹ → Atletas (no Dashboard)
  await tap('dashboard'); await adminOpenAthleteDash('u1'); await wait(300); await tap('atletas'); atRoot('atletas','ficha de Dashboard → Atletas');
  document.querySelector('#main [onclick*="openAtleta"]')?.click(); await wait(1000); await back(); atRoot('atletas','Dashboard→ficha→Atletas→ficha→‹');
  // de la ficha a Panel Admin y de vuelta a Atletas: la lista, no la ficha vieja
  await tap('atletas'); openAtleta('u0'); await wait(900); await tap('admin'); atRoot('admin','ficha→Admin'); await tap('atletas'); atRoot('atletas','ficha→Admin→Atletas');
  // tocar el menú mientras la ficha todavía está cargando: no te vuelve a meter en la ficha
  await tap('dashboard'); adminOpenAthlete('u1'); await tap('admin'); await wait(1500); atRoot('admin','menú mientras carga la ficha (equipo)');
  await tap('atletas'); openAtleta('u0'); await tap('admin'); await wait(1500); atRoot('admin','menú mientras carga la ficha (individual)');
  // ficha → editor de rutinas → ‹ → ficha → ‹ → origen
  await tap('atletas'); openAtleta('u0'); await wait(900); setAtletaSubview('rutina'); await wait(300); editRoutine('r1','athlete_detail'); await wait(300);
  ok(active().join()==='atletas','editor desde ficha: menú en Atletas ('+active().join()+')');
  await back(); ok(inFicha('u0')&&S.atletaSubview==='rutina','‹ del editor vuelve a la ficha, en Rutina ('+S.adminView+'/'+S.atletaSubview+')');
  await back(); atRoot('atletas','editor→ficha→‹');
  // reporte semanal: ‹ vuelve a la ficha desde donde se abrió
  await tap('atletas'); openAtleta('u0'); await wait(900); await openWeeklyReport('u0'); await wait(300); await back(); ok(inFicha('u0')&&S.currentView==='atletas','‹ del reporte vuelve a la ficha ('+S.currentView+')'); await back(); atRoot('atletas','reporte→ficha→‹');
  // ── botón atrás del navegador / deslizar ──
  await tap('atletas'); openAtleta('u0'); await wait(1000); history.back(); await wait(700); atRoot('atletas','atrás del navegador desde ficha');
  history.forward(); await wait(900); ok(inFicha('u0'),'adelante del navegador vuelve a la ficha'); await back(); atRoot('atletas','adelante + ‹');
  await tap('dashboard'); await adminOpenAthleteDash('u1'); await wait(300); await back(); history.back(); await wait(700); ok(inFicha('u1'),'atrás del navegador reabre la ficha'); await back(); atRoot('dashboard','ficha recuperada con atrás: ‹ va a Dashboard');
  // ── cambios sin guardar en el editor: pregunta antes de perderlos ──
  const modalBtn=re=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent!==null&&!b.closest('#main')).find(b=>re.test(b.textContent));
  await tap('admin'); adminGoRoutines(); await wait(300); editRoutine('r1'); await wait(300); const d0=getOrderedSessionNames(S.editingRoutine)[0]; const blks=S.editingRoutine.sessions[d0]; moveRoutineBlock(blks[blks.length-1].id,d0,-1); await wait(200);
  const order0=JSON.stringify(S.editingRoutine.sessions[d0].map(b=>b.id));
  await tap('dashboard'); ok(S.adminView==='routine_edit'&&S.editingRoutine&&!!modalBtn(/Salir sin guardar/),'editor con cambios: pregunta antes de salir ('+S.currentView+'/'+S.adminView+')');
  const cancel=modalBtn(/Cancelar/); if(cancel){ cancel.click(); await wait(200); }
  ok(S.adminView==='routine_edit'&&S.editingRoutine&&JSON.stringify(S.editingRoutine.sessions[d0].map(b=>b.id))===order0,'editor: cancelar deja los cambios');
  await tap('dashboard'); const leave=modalBtn(/Salir sin guardar/); ok(!!leave,'editor: está el botón "Salir sin guardar"'); if(leave){ leave.click(); await wait(400); } atRoot('dashboard','editor con cambios → Salir sin guardar');
  await tap('admin'); adminGoRoutines(); await wait(300); editRoutine('r1'); await wait(300); await tap('dashboard'); atRoot('dashboard','editor sin cambios: no pregunta nada');
  // el logo
  await tap('atletas'); openAtleta('u0'); await wait(900); const logo=document.querySelector('.app-logo'); if(logo&&logo.offsetParent){ logo.click(); await wait(400); atRoot('dashboard','logo'); }
  ['undefined','NaN'].forEach(b=>{ if(document.getElementById('main').innerText.includes(b)) fails.push('aparece '+b); });
  window.__nav={fails:[...new Set(fails)],errs};
})();
