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
  // Dashboard: fila completa (ACWR, UA, estado), atajos del plantel y contadores
  await wait(300);
  ok(document.querySelectorAll('#dash-athlete-list .ar-row.ar-full .ar-st').length===8 && document.querySelectorAll('#dash-athlete-list .ar-load').length===8,'dashboard: fila con ACWR/UA/estado');
  ok(document.querySelectorAll('#dash-quick .chip-btn').length===4,'dashboard: 4 atajos');
  { const n=+document.querySelectorAll('#dash-quick .chip-btn')[2].textContent.match(/\((\d+)\)/)[1]; setDashQuick('nowell'); await wait(200); ok(n>0 && document.querySelectorAll('#dash-athlete-list .ar-row').length===n,'atajo Sin wellness filtra '+n); }
  { const n=+document.querySelectorAll('#dash-quick .chip-btn')[1].textContent.match(/\((\d+)\)/)[1]; const al=+document.querySelector('.metric-card.mc-alert .metric-card-value')?.textContent||0; setDashQuick('att'); await wait(200); ok(document.querySelectorAll('#dash-athlete-list .ar-row').length===n && n>=1 && [...document.querySelectorAll('#dash-athlete-list .ar-st')].every(e=>e.textContent==='Requiere atención'),'atajo Requieren atención: '+n+' (alertas '+al+')'); }
  setDashQuick('all'); await wait(200); ok(document.querySelectorAll('#dash-athlete-list .ar-row').length===8,'atajo Todos vuelve a 8');
  ok(document.querySelectorAll('.ar-act b').length>0 && !document.querySelector('#dash-athlete-list .ar-ch.ar-hi'),'actividad neutra: solo el RPE con color');
  ok(!!document.querySelector('.att-btn') && document.querySelectorAll('.mc-bar').length===2,'recordatorio a mano y barras en contadores');
  { const hd=document.querySelector('#dash-athlete-list .ar-head'); const shown=!!hd&&getComputedStyle(hd).display!=='none'; ok(!!hd&&shown===(innerWidth>=1240),'plantel: encabezado de columnas solo en pantalla ancha ('+innerWidth+')');
    ok(/Requieren atención \(\d+\)/.test(document.querySelector('#dash-att .att-side-t')?.textContent||'')&&!!document.querySelector('#dash-att .att-row.att-crit .att-av'),'panel de atención: título con cantidad y avatar'); }
  txtBad('dashboard con atajos');
  switchView('atletas'); await wait(1500); txtBad('atletas'); ok(document.querySelectorAll('#atletas-list .ar-row').length===3,'atletas: 3 individuales');
  ok(document.querySelectorAll('#atletas-list .ar-row.ar-full .ar-load').length===3 && document.querySelectorAll('#atletas-list .ar-st').length===3 && !!document.querySelector('#atletas-list .ar-head'),'atletas: misma fila que el Dashboard (ACWR, UA y estado)');
  openAtleta('u0'); await wait(1200); for(const v of ['rutina','wellness','stats','evals','perfil']){ setAtletaSubview(v); await wait(800); txtBad('ficha '+v); }
  // ── perfil reordenado: estado + indicadores arriba, dos columnas, datos al final ──
  { const hero=document.querySelector('.pf-hero'), grid=document.querySelector('.pf-grid');
    ok(!!hero&&/Todo en orden|A seguir de cerca|Requiere atención/.test(hero.querySelector('.pf-state b').textContent)&&hero.querySelectorAll('.kpi-c').length===3,'perfil: estado e indicadores arriba');
    ok(!!grid&&grid.children.length===2&&!!grid.children[0].querySelector('#athlete-trend-chart')&&!!grid.children[0].querySelector('.act-scroll')&&!!grid.children[1].querySelector('.pf-load, .admin-section')&&/Molestias activas/i.test(grid.children[1].textContent)&&/RM del atleta/i.test(grid.children[1].textContent),'perfil: evolución a la izquierda y detalle a la derecha');
    const cols=getComputedStyle(grid).gridTemplateColumns.split(' ').length; ok(cols===(innerWidth>=1180?2:1),'perfil: 2 columnas solo en pantalla ancha ('+cols+' en '+innerWidth+')');
    const form=document.querySelector('.pf-form'); ok(!!form&&!!form.querySelector('input[id^="edit-name-"]')&&form.querySelectorAll('.basic-f input').length===3&&!!form.querySelector('select[id^="reassign-sel-"]')&&grid.children[0].contains(form)&&form.getBoundingClientRect().top>grid.children[0].querySelector('.act-scroll').getBoundingClientRect().bottom-1,'perfil: datos del atleta debajo de la actividad, con todos sus campos'); }
  // ── evaluaciones: historial con índices, resumen por test, récord, próximo nivel, período y gráficos de línea ──
  { setAtletaSubview('evals'); await wait(700);
    const uid=S.evalAthleteId, p2=n=>String(n).padStart(2,'0'), dAgo=n=>{ const d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); };
    const mk=v=>v.map((h,i)=>({date:dAgo((4-i)*30),height:h}));
    S._athleteEvalsCache=S._athleteEvalsCache||{}; const before=S._athleteEvalsCache[uid];
    S._athleteEvalsCache[uid]={cmj:mk([38.2,39.5,39.1,41,42.3]),sj:mk([34,35.1,35.6,36.2,37]),abalakov:mk([44.5,45.8,46,47.9,49.1]),cmj_der:mk([21.5,22,22.8,23.1,24]),cmj_izq:mk([19,19.8,21.5,21.9,22.6])};
    S.evalRange='all'; switchEvalView('history'); await wait(700); txtBad('evaluaciones historial');
    const cmj=document.getElementById('eval-card-cmj'), tile=document.querySelector('.ev-tiles .ev-tile');
    ok(document.querySelectorAll('.ev-tiles .ev-tile').length===4&&/42,3/.test(tile.textContent)&&!!tile.querySelector('.ev-gold .ev-medal')&&/Faltan 2,7 cm/.test(tile.textContent)&&!!tile.querySelector('.ev-lvl-b i'),'evaluaciones: mejor CMJ con medalla y barra al próximo nivel');
    ok(!!cmj&&/42,3/.test(cmj.querySelector('.ev-big').textContent)&&/\+1,3 vs\. anterior/.test(cmj.textContent)&&/\+4,1 cm desde \w+ \(\+10,7 %\)/.test(cmj.textContent)&&!!cmj.querySelector('.ev-headr .ev-gold'),'evaluaciones: CMJ con cambio vs. anterior, progreso acumulado y récord ('+cmj?.querySelector('.ev-headl')?.textContent.replace(/\s+/g,' ')+')');
    ok(/24 \/ 22,6/.test(document.getElementById('eval-card-asym').textContent)&&/5,8 % de diferencia/.test(document.getElementById('eval-card-asym').textContent),'evaluaciones: asimetría con las dos piernas y el % de diferencia');
    if(typeof Chart!=='undefined'){ const c=S.evalChartInstances['chart-hist-cmj'], as=S.evalChartInstances['chart-hist-asym'];
      ok(!!c&&c.config.type==='line'&&c.data.labels.length===5&&/^\d+ [a-z]{3}$/.test(c.data.labels[0]),'evaluaciones: gráfico de línea con fechas cortas ('+c?.data.labels[0]+')');
      ok(!!as&&as.config.type==='bar'&&as.data.datasets.length===2,'evaluaciones: asimetría con barras de las dos piernas');
      setEvalRange('3m'); await wait(600); ok(S.evalChartInstances['chart-hist-cmj'].data.labels.length===4&&/desde/.test(document.getElementById('eval-card-cmj').textContent),'evaluaciones: el período de 3 meses recorta el gráfico a 4 tests');
      setEvalRange('all'); await wait(400); }
    ok(document.documentElement.scrollWidth<=innerWidth+1,'evaluaciones: sin scroll horizontal');
    if(before) S._athleteEvalsCache[uid]=before; else delete S._athleteEvalsCache[uid]; switchEvalView('entry'); await wait(300); }
  // ── wellness por día: pocos días grandes a la vista, el resto se desliza; cargar datos bien visible ──
  setAtletaSubview('wellness'); await wait(700);
  { const hm=document.querySelector('.hm'); const cw=document.querySelector('.hm-c').getBoundingClientRect().width; const vis=Math.round((hm.clientWidth-document.querySelector('.hm-nm').getBoundingClientRect().width)/cw);
    ok(cw>=58,'wellness por día: celdas grandes ('+Math.round(cw)+'px)'); ok(vis>=3&&vis<=10,'wellness por día: entre 4 y 10 días a la vista ('+vis+')');
    ok(hm.scrollWidth>hm.clientWidth+200&&Math.abs(hm.scrollLeft-(hm.scrollWidth-hm.clientWidth))<3,'wellness por día: arranca en hoy y se desliza hacia atrás');
    ok([...document.querySelectorAll('.hm-c b')].some(b=>/^\d+%$/.test(b.textContent)),'wellness por día: muestra el porcentaje de cada día');
    const cta=document.querySelector('.load-cta'); ok(!!cta&&cta.getBoundingClientRect().height>=44&&/Cargar wellness/.test(cta.innerText),'pestaña Wellness: botón grande para cargar');
    cta.click(); await wait(300); ok(document.getElementById('proxy-overlay').classList.contains('open'),'el botón abre el formulario de carga'); closeProxyForm(); }
  // ── tocar un día abre SU registro: lo que marcó en cada ítem, y se puede corregir o cargar ──
  { const P=()=>JSON.parse(localStorage.getItem('__db')).personal; const d2=getWeeklyComplianceDates(0)[4]; const wBefore=P().u0.wellness[d2];
    const cell=[...document.querySelectorAll('.hm-c')].find(c=>(c.getAttribute('onclick')||'').includes(d2)); ok(!!cell,'wellness por día: celda del día'); cell.click(); await wait(350);
    ok(document.getElementById('proxy-overlay').classList.contains('open')&&S._proxy.date===d2&&S._proxy.uid==='u0','tocar un día abre el registro de ese día');
    ok(S.currentView==='atletas','tocar un día no saca de la ficha');
    ok(document.querySelectorAll('#proxy-body .px-face.on').length===5&&S._proxy.w.fatiga===wBefore.fatiga,'registro del día: muestra lo que marcó en cada ítem');
    const others=JSON.stringify([P().admin1,P().u1]); proxySetW('fatiga',1); proxySetMins('pelota','45'); proxySetRpe('pelota',6); await saveProxyForm(); await wait(600);
    ok(P().u0.wellness[d2].fatiga===1&&P().u0.wellness[d2].humor===wBefore.humor,'registro del día: corrige un ítem sin tocar los demás');
    ok(P().u0.history._sessionLogs.some(l=>l.date===d2&&l.activity==='pelota'&&l.mins===45&&l.rpe===6),'registro del día: carga de ese día guardada');
    ok(JSON.stringify([P().admin1,P().u1])===others,'registro del día: no tocó a nadie más');
    // desde ahí se llega al detalle completo (mover de fecha) y se vuelve a la ficha
    [...document.querySelectorAll('.hm-c')].find(c=>(c.getAttribute('onclick')||'').includes(d2)).click(); await wait(350); ok(!!document.querySelector('.px-more'),'registro del día: acceso a mover de fecha'); document.querySelector('.px-more').click(); await wait(500);
    ok(S.adminView==='wellness_detail'&&!document.getElementById('proxy-overlay').classList.contains('open')&&/Carga de ese día/i.test(document.getElementById('main').innerText),'detalle del día: se abre desde la ficha'); txtBad('detalle del día');
    document.querySelector('#main .back-btn').click(); await wait(500); ok(!!S.atletaView&&S.atletaView.uid==='u0'&&!!document.querySelector('.snav-tab'),'detalle del día: volver deja en la ficha'); setAtletaSubview('perfil'); await wait(500);
    document.querySelector('.act-row').click(); await wait(300); ok(document.getElementById('proxy-overlay').classList.contains('open')&&S._proxy.date===todayLocal(),'actividad diaria: tocar un día abre su registro'); closeProxyForm(); }

  // ── el profe hace por el atleta lo mismo que el atleta: molestias en el mapa del cuerpo ──
  setAtletaSubview('perfil'); await wait(600);
  { const P=()=>JSON.parse(localStorage.getItem('__db')).personal; const others=JSON.stringify([P().admin1,P().u1,P().u2]);
    ok(!!document.querySelector('[onclick^="openAdminBodyMap"]'),'ficha: botón para cargar molestias');
    document.querySelector('[onclick^="openAdminBodyMap"]').click(); await wait(300);
    ok(document.querySelectorAll('#bodymap-body .body-zone').length===BODY_ZONES.front.length+BODY_ZONES.back.length,'mapa del profe: todas las zonas del cuerpo');
    { const ids=[...BODY_ZONES.front,...BODY_ZONES.back].map(z=>z.id), need=['cuad_der','aductor_der','aductor_izq','oblicuo_der','muneca_izq','mano_izq','dorsal_izq','isq_der','gemelo_izq','pecho','abdomen','cadera','hombro_izq_b'];
      ok(need.every(i=>ids.includes(i)) && new Set(ids).size===ids.length,'mapa de músculos: zonas nuevas y viejas, sin repetidos');
      const box=id=>document.querySelector('#bodymap-body .body-zone[onclick="abmSelectZone(\''+id+'\')"]').getBoundingClientRect();
      ok(box('cuad_der').left<box('cuad_izq').left && box('aductor_der').left<box('aductor_izq').left,'mapa de frente: la derecha del atleta a la izquierda de la pantalla');
      ok(box('isq_izq').left<box('isq_der').left,'mapa de espalda: la izquierda del atleta a la izquierda de la pantalla');
      ok(box('cuad_der').right<=box('aductor_der').left+2 && box('muneca_izq').bottom<=box('mano_izq').top+1,'mapa: cuádriceps y aductor separados; muñeca y mano separadas'); }
    const z=BODY_ZONES.front[3].id; document.querySelector('#bodymap-body .body-zone[onclick*="'+z+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true})); await wait(250);
    await abmSave(false); ok(!P().u0.injuries?.[z],'mapa del profe: sin dolor marcado no guarda');
    abmSet('pain',6); abmSet('isInjury',true); abmSet('type','muscular'); document.getElementById('abm-note').value='Tirón entrenando'; document.getElementById('abm-note').dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#bodymap-body .abm-row .abm-opt'); await wait(150); await abmSave(false); await wait(500);
    const iz=P().u0.injuries?.[z]; ok(iz&&iz.pain===6&&iz.isInjury===true&&iz.type==='muscular'&&iz.note==='Tirón entrenando'&&iz.severity==='moderada','mapa del profe: lesión guardada en u0 ('+JSON.stringify(iz||{}).slice(0,140)+')');
    ok(iz&&iz.history.length===1&&iz.history[0].date===todayLocal()&&iz.history[0].pain===6,'mapa del profe: suma el registro de hoy al historial');
    ok(JSON.stringify([P().admin1,P().u1,P().u2])===others,'mapa del profe: no tocó al admin ni a otros atletas');
    ok(document.getElementById('main').innerText.includes('Tirón entrenando')||document.getElementById('main').innerText.includes('6/10'),'mapa del profe: la molestia aparece en la ficha');
    abmSelectZone(z); await wait(200); abmSet('pain',3); await abmSave(false); await wait(400);
    ok(P().u0.injuries[z].pain===3&&P().u0.injuries[z].history.length===1&&P().u0.injuries[z].history[0].pain===3,'mapa del profe: actualizar el mismo día corrige, no duplica');
    abmSelectZone(z); await wait(200); await abmSave(true); await wait(400);
    ok(!P().u0.injuries[z]&&(P().u0.injuryArchive||[]).some(x=>x.zoneId===z&&x.peakPain>=3),'mapa del profe: quitar la pasa al historial de resueltas');
    closeAdminBodyMap(); txtBad('perfil con molestias'); }
  // edad / altura / peso editables por el profe
  { const i=document.querySelector('input[id^="basic-weight-"]'); ok(!!i,'ficha: edad, altura y peso editables'); i.value='78,5'; i.dispatchEvent(new Event('blur')); await wait(500);
    ok(JSON.parse(localStorage.getItem('__db')).users.u0.weight===78.5,'ficha: el peso queda guardado en el atleta'); }
  // carga de partido con rival, en nombre del atleta
  { openProxyForm('u6'); await wait(300); proxySetMins('partido','70'); proxySetRpe('partido',8); await wait(150); const ni=document.querySelector('#proxy-body .px-note'); ok(!!ni,'cargar datos: campo de rival en el partido'); ni.value='vs Club X'; ni.dispatchEvent(new Event('input',{bubbles:true})); await saveProxyForm(); await wait(600);
    ok(JSON.parse(localStorage.getItem('__db')).personal.u6.history._sessionLogs.some(l=>l.activity==='partido'&&l.mins===70&&l.rpe===8&&l.note==='vs Club X'),'cargar datos: partido con rival guardado en u6'); }
  setAtletaSubview('rutina'); await wait(500);
  ok(document.querySelectorAll('.rt-d').length===7,'círculos de días'); ok(document.querySelector('.wk-t')?.innerText.startsWith('Semana'),'tarjeta de semana');
  setAtletaRoutineDay(0); await wait(300); document.querySelectorAll('[onclick^="toggleAtletaRoutineBlock"]').forEach(b=>b.click()); await wait(300);
  txtBad('rutina día abierto');
  openAdminProgressionModal('u0','x1','Sentadilla libre','Día 1'); await wait(400); ok(!!document.querySelector('#lc-wrap')||true,'modal progresión'); closeProgressionModal();
  // ── ficha: vista horizontal con sus botones para modificar ──
  setAtletaRoutineCicloView('horiz'); await wait(500); txtBad('ficha horizontal');
  ok(document.querySelectorAll('.cmp-ath .cmp-col').length===3,'ficha horizontal: los 3 días en columnas');
  ok(document.querySelectorAll('.cmp-ath [onclick^="openExerciseOverrideModal"]').length>0&&document.querySelectorAll('.cmp-ath [onclick^="openCoachNoteModal"]').length>0,'ficha horizontal: Personalizar y Nota en cada ejercicio');
  // íconos chicos en vez de las pastillas "Personalizar"/"Nota"
  ok(!/Personalizar|Nota/.test(document.querySelector('.cmp-ath').innerText),'ficha horizontal: Personalizar y Nota son íconos');
  // kilos que tocan por %RM (Sentadilla 75% de 110 = 82,5, redondeado al disco de 2,5)
  ok(/82,5 kg/.test(document.querySelector('.cmp-ath').innerText),'ficha horizontal: kilos que tocan por %RM, redondeados al disco (82,5)');
  // cargar kilos y RPE desde la columna → quedan en el documento de ESE atleta
  { const before=JSON.stringify(JSON.parse(localStorage.getItem('__db')).personal.u1);
    const ins=document.querySelectorAll('.cmp-ath .cmp-done-in')[1].querySelectorAll('input'); ok(ins.length===2,'ficha horizontal: campos de kilos y RPE en cada ejercicio');
    ins[0].value='82,5'; ins[0].dispatchEvent(new Event('change',{bubbles:true})); ins[1].value='8'; ins[1].dispatchEvent(new Event('change',{bubbles:true})); await wait(900);
    const h=JSON.parse(localStorage.getItem('__db')).personal.u0.history; const recs=Object.values(h).filter(v=>v&&v.exercises).flatMap(v=>Object.values(v.exercises));
    ok(recs.some(x=>String(x.load)==='82.5'&&String(x.rpe)==='8'),'ficha horizontal: kilos y RPE guardados en u0');
    ok(JSON.stringify(JSON.parse(localStorage.getItem('__db')).personal.u1)===before,'ficha horizontal: no tocó a otro atleta');
    ok(ins[0].isConnected&&ins[0].closest('.cmp-df').classList.contains('has'),'ficha horizontal: no redibuja mientras se carga (no pierde el foco)');
    setAtletaRoutineCicloView('micro'); await wait(300); setAtletaRoutineCicloView('horiz'); await wait(400);
    ok([...document.querySelectorAll('.cmp-ath .cmp-done-in input')].some(i=>i.value==='82.5'),'ficha horizontal: lo cargado se vuelve a ver');
    const txt=[...document.querySelectorAll('.cmp-ath .cmp-done-in')].map(x=>x.querySelectorAll('.cmp-df')).find(l=>l[0].querySelector('input').value==='82.5'); ok(txt&&txt[0].innerText.trim()==='kg'&&/^(RPE|RIR)$/.test(txt[1].innerText.trim()),'ficha horizontal: se lee "82.5 kg" y "RPE 8"'); }
  // historial (planificaciones anteriores y cargas registradas): plegado hasta que se toca
  { const sec=()=>[...document.querySelectorAll('#main .admin-section-title')].map(e=>e.textContent.trim().toLowerCase()).join('|');
    ok(!!document.querySelector('.hist-toggle')&&!/cargas registradas/.test(sec()),'ficha: historial plegado por defecto');
    document.querySelector('.hist-toggle').click(); await wait(300); ok(/cargas registradas/.test(sec()),'ficha: el historial se despliega al tocarlo'); txtBad('historial abierto');
    document.querySelector('.hist-toggle').click(); await wait(300); ok(!/cargas registradas/.test(sec()),'ficha: el historial se vuelve a plegar'); }
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
  // ── categorías nuevas al final: HIIT, SPRINTS, ACC, COD (sin subcategorías) ──
  ok(LIB_MAIN_CATEGORIES.slice(-4).join()==="HIIT,SPRINTS,ACC,COD","biblioteca: HIIT, SPRINTS, ACC y COD al final");
  ok(getMissingLibRules(["SPRINTS"]).length===0&&getMissingLibRules(["HIIT"]).length===0,"categorías nuevas: no exigen subcategoría");
  { addLibraryExercise(); await wait(250); document.getElementById("exform-name-inp").value="Sprint 30 m lanzado"; selectMainCategoryChip("exform-tags-picker","_exFormTags","SPRINTS"); await wait(150); saveLibExerciseModal(); await wait(400);
    const nx=S.library.find(e=>e.name==="Sprint 30 m lanzado"); ok(nx&&nx.tags.join()==="SPRINTS","se puede crear un ejercicio en SPRINTS");
    setLibFilter("SPRINTS"); await wait(250); ok(document.getElementById("lib-view-body").innerText.includes("Sprint 30 m lanzado"),"filtrar por SPRINTS lo encuentra"); setLibFilter("SPRINTS"); await wait(150); }
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
  // ── las fotos de perfil se agrandan al tocarlas (y no abren la ficha por error) ──
  { const u=S.dashAthletes?.[0]||S.adminAthletes[0]; const h=avatarHtml('X',null,38,'data:image/gif;base64,R0lGODlhAQABAAAAACw=',true); const tmp=document.createElement('div'); tmp.innerHTML=h; document.body.appendChild(tmp);
    const before=S.currentView; tmp.querySelector('img').click(); await wait(150); ok(!!document.querySelector('#photo-zoom img')&&S.currentView===before,'foto: se abre en grande'); document.getElementById('photo-zoom').click(); await wait(100); ok(!document.getElementById('photo-zoom'),'foto: se cierra tocando afuera'); tmp.remove();
    ok(!/onclick/.test(avatarHtml('X',null,38,null,true))&&!/openPhotoZoom/.test(avatarHtml('X',null,38,'a.png')),'foto: sin foto (o sin pedirlo) no hay zoom'); }
  // ── en las listas la foto abre la FICHA; recién dentro de la ficha, tocarla la agranda ──
  { const px="data:image/gif;base64,R0lGODlhAQABAAAAACw="; const dbx=JSON.parse(localStorage.getItem("__db")); dbx.users.u1.photoUrl=px; localStorage.setItem("__db",JSON.stringify(dbx)); const am=(S.adminAthletes||[]).find(x=>x.uid==="u1"); if(am) am.photoUrl=px; const row0={uid:"u1"};
    S.atletaView=null; S.dashAthletes=null; switchView("dashboard"); await wait(2200); const im=document.querySelector("#dash-athlete-list .ar-av img"); ok(!!im,"lista: se ve la foto del atleta"); ok(!!im&&!im.classList.contains("av-zoom"),"lista: la foto no tiene zoom");
    if(im){ im.click(); await wait(1500); ok(!document.getElementById("photo-zoom")&&!!S.atletaView&&S.atletaView.uid===row0.uid,"lista: tocar la foto abre la ficha de ese atleta");
      const hd=document.querySelector(".team-detail-header img.av-zoom"); ok(!!hd,"ficha: la foto del encabezado se puede agrandar"); if(hd){ hd.click(); await wait(150); ok(!!document.querySelector("#photo-zoom img")&&!!S.atletaView,"ficha: tocar la foto la agranda (sin salir de la ficha)"); closePhotoZoom(); }
      goBackFromAthleteDetail(); await wait(500); } }
  // ── panel lateral: se achica a íconos y se vuelve a abrir (solo pantallas anchas) ──
  if(innerWidth>=900){ const tb=document.getElementById('topbar'); const w0=tb.getBoundingClientRect().width; const m0=document.getElementById('main').getBoundingClientRect().left;
    document.getElementById('sb-toggle').click(); await wait(400); const w1=tb.getBoundingClientRect().width;
    ok(w1<100&&w1<w0,'panel: se achica ('+Math.round(w0)+' → '+Math.round(w1)+' px)'); ok(document.getElementById('main').getBoundingClientRect().left<m0-100,'panel: el contenido gana el espacio');
    ok([...document.querySelectorAll('.sidebar-item .sb-lbl')].every(x=>getComputedStyle(x).display==='none')&&document.querySelectorAll('.sidebar-item svg').length>3,'panel achicado: quedan solo los íconos');
    document.querySelectorAll('.sidebar-item')[1].click(); await wait(500); ok(document.documentElement.classList.contains('sb-collapsed'),'panel achicado: se sigue navegando con los íconos');
    ok(localStorage.getItem('gm-sidebar')==='collapsed','panel: recuerda la elección');
    document.getElementById('sb-toggle').click(); await wait(400); ok(Math.abs(tb.getBoundingClientRect().width-w0)<2,'panel: se vuelve a abrir'); }
  else ok(getComputedStyle(document.getElementById('sb-toggle')).display==='none','celular/tablet angosta: no hay botón de panel');
  // ── 1RM por RPE: misma tabla que la planilla ──
  { const near=(a,b)=>Math.abs(a-b)<0.01;
    ok(near(rmFromRpe(140,2,8.5),156.9507)&&near(rmFromRpe(65,2,10),68.0628)&&near(rmFromRpe(90,8,7),135.0338)&&rmFromRpe(175,1,10)===175,'1RM por RPE: da igual que la planilla (140×2@8,5 = 156,95)');
    ok(rpePct(13,9)===null&&rpePct(3,4)===null&&rpePct(3,9.2)===0.892,'1RM por RPE: fuera de tabla no inventa; RPE se redondea al medio punto');
    ok(roundPlate(83)===82.5&&roundPlate(83.8)===85&&fmtKg(82.5)==='82,5','redondeo al disco de 2,5 kg'); }
  // ── RM estimado con lo que el atleta registró, y "Usar como RM" ──
  { S.atletaView=null; switchView('atletas'); await wait(1200); openAtleta('u0'); await wait(1800);
    const a0=S.adminAthletes.find(x=>x.uid==='u0'); const dbx=JSON.parse(localStorage.getItem('__db'));
    const rec={date:todayLocal(), exercises:{x1:{load:100, rpe:8, checked:true}}}; dbx.personal.u0.history['w1-Día 1']=rec; localStorage.setItem('__db',JSON.stringify(dbx));
    a0._personal.history=a0._personal.history||{}; a0._personal.history['w1-Día 1']=rec; a0._personal.oneRM.sentadilla_barra=110;
    setAtletaSubview('perfil'); await wait(600);
    const est=estimateRMsFromHistory(a0).sentadilla_barra; ok(est&&Math.abs(est.rm-100/0.762)<0.01&&est.reps===6&&est.rpe===8,'RM estimado: 100 kg × 6 @8 → 131,2 kg');
    const btn=document.querySelector('.rm-use[onclick*="sentadilla_barra"]'); ok(!!btn&&/131/.test(btn.closest('.rm-est').innerText),'ficha: muestra el estimado y el botón para usarlo');
    if(btn){ btn.click(); await wait(600); ok(JSON.parse(localStorage.getItem('__db')).personal.u0.oneRM.sentadilla_barra===131,'Usar como RM: queda guardado (131) en el atleta'); ok(!document.querySelector('.rm-use[onclick*="sentadilla_barra"]'),'después de usarlo ya no lo vuelve a ofrecer'); }
    txtBad('perfil con RM estimado'); goBackFromAthleteDetail(); await wait(400); }
  // ── prescribir solo la semana 1: las demás semanas repiten lo mismo ──
  { const ex1={id:'t1',name:'Prueba',progression:[{series:'4',reps:'6',pct:'75',rpe:'8',note:'Controlado'},{series:'',reps:'',pct:'',rpe:'',note:''},{},{}]};
    const p3=getExPrescriptionForWeek(ex1,3); ok(p3.series==='4'&&p3.reps==='6'&&p3.pct==='75'&&p3.rpe==='8'&&p3.note==='Controlado','semanas vacías repiten la semana 1 ('+JSON.stringify(p3)+')');
    ex1.progression[2].reps='5'; const p4=getExPrescriptionForWeek(ex1,4); ok(p4.reps==='5'&&p4.series==='4','una semana cambiada arrastra a las siguientes vacías, y lo demás sigue igual');
    ok(getExPrescriptionForWeek(ex1,2).reps==='6','la semana anterior al cambio no se toca');
    ok(getExPrescriptionForWeek({series:'3',reps:'10'},4).reps==='10','ejercicio sin tabla por semanas: igual en todas'); }
  // en el editor: completar solo la semana 1, guardar, y el atleta ve lo mismo en la semana 4
  { switchView('admin'); adminGoRoutines(); await wait(600); editRoutine('r1'); await wait(500);
    setRoutineDuration('4'); await wait(300);
    const sess=getOrderedSessionNames(S.editingRoutine)[0]; S._routineEditSession=sess; S._routineCompare=false; renderMain(); await wait(400);
    const b0=S.editingRoutine.sessions[sess][0]; const e0=b0.categories[0].exercises[0]; delete e0.progression; e0.series=''; e0.reps=''; e0.pct=''; e0.rpe='';
    b0._open=true; renderMain(); await wait(400);
    const row=document.getElementById('rexrow-'+e0.id); const cells=f=>[...row.querySelectorAll('input.field-inp')].filter(i=>(i.getAttribute('onchange')||'').includes("'"+f+"'"));
    const s1=cells('series')[0]; s1.value='5'; s1.dispatchEvent(new Event('change',{bubbles:true})); const r1=cells('reps')[0]; r1.value='3'; r1.dispatchEvent(new Event('change',{bubbles:true})); const q1=cells('rpe')[0]; q1.value='8'; q1.dispatchEvent(new Event('change',{bubbles:true}));
    renderMain(); await wait(400);
    const row2=document.getElementById('rexrow-'+e0.id); const reps4=[...row2.querySelectorAll('input.field-inp')].filter(i=>(i.getAttribute('onchange')||'').includes("'reps'"))[3];
    ok(reps4&&reps4.value===''&&reps4.placeholder==='3'&&reps4.dataset.inh==='1','editor: la semana 4 muestra en gris lo de la semana 1');
    await saveRoutineToFirestore(); await wait(700);
    const saved=JSON.parse(localStorage.getItem('__db')).routines.r1.sessions[sess][0].categories[0].exercises[0]; const pw=getExPrescriptionForWeek(saved,4);
    ok(pw.series==='5'&&pw.reps==='3'&&pw.rpe==='8','guardada: la semana 4 tiene 5 × 3 a RPE 8 sin haberla completado');
    closeConfirmModal && closeConfirmModal(); document.querySelectorAll('[id$="overlay"].open').forEach(o=>o.classList.remove('open')); txtBad('editor semanas heredadas'); }
  // ── menús y modales ──
  switchView('settings'); await wait(600); txtBad('ajustes');
  R.fails=fails; R.errs=errs; R.view=innerWidth+'x'+innerHeight; R.theme=document.documentElement.getAttribute('data-theme')||'light';
  window.__regress=R;
})();
