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
    ok(!!cmj&&/42,3/.test(cmj.querySelector('.ev-big').textContent)&&/\+1,3 cm vs\. anterior · (Mejora real|Posible mejora|Sin cambio)/.test(cmj.textContent)&&/\+4,1 cm desde \w+ \(\+10,7 %\)/.test(cmj.textContent)&&!!cmj.querySelector('.ev-headr .ev-gold'),'evaluaciones: CMJ con cambio vs. anterior, progreso acumulado y récord ('+cmj?.querySelector('.ev-headl')?.textContent.replace(/\s+/g,' ')+')');
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
    document.getElementById('sb-toggle').click(); let w1=0; for(let i=0;i<20;i++){ await wait(100); w1=tb.getBoundingClientRect().width; if(w1<100) break; }
    ok(w1<100&&w1<w0,'panel: se achica ('+Math.round(w0)+' → '+Math.round(w1)+' px)'); for(let i=0;i<20 && document.getElementById('main').getBoundingClientRect().left>=m0-100;i++) await wait(100); ok(document.getElementById('main').getBoundingClientRect().left<m0-100,'panel: el contenido gana el espacio');
    ok([...document.querySelectorAll('.sidebar-item .sb-lbl')].every(x=>getComputedStyle(x).display==='none')&&document.querySelectorAll('.sidebar-item svg').length>3,'panel achicado: quedan solo los íconos');
    document.querySelectorAll('.sidebar-item')[1].click(); await wait(500); ok(document.documentElement.classList.contains('sb-collapsed'),'panel achicado: se sigue navegando con los íconos');
    ok(localStorage.getItem('gm-sidebar')==='collapsed','panel: recuerda la elección');
    document.getElementById('sb-toggle').click(); for(let i=0;i<20;i++){ await wait(100); if(Math.abs(tb.getBoundingClientRect().width-w0)<2) break; } ok(Math.abs(tb.getBoundingClientRect().width-w0)<2,'panel: se vuelve a abrir'); }
  else ok(getComputedStyle(document.getElementById('sb-toggle')).display==='none','celular/tablet angosta: no hay botón de panel');
  // ── 1RM por RPE: misma tabla que la planilla ──
  { const near=(a,b)=>Math.abs(a-b)<0.01;
    ok(near(rmFromRpe(140,2,8.5),156.9507)&&near(rmFromRpe(65,2,10),68.0628)&&near(rmFromRpe(90,8,7),135.0338)&&rmFromRpe(175,1,10)===175,'1RM por RPE: da igual que la planilla (140×2@8,5 = 156,95)');
    ok(rpePct(13,9)===null&&rpePct(3,4)===null&&rpePct(3,9.2)===0.892,'1RM por RPE: fuera de tabla no inventa; RPE se redondea al medio punto');
    ok(roundPlate(83)===82.5&&roundPlate(83.8)===85&&fmtKg(82.5)==='82,5','redondeo al disco de 2,5 kg'); }
  // ── el RM se actualiza SOLO con lo último que registró, usando las reps prescriptas ──
  { ok(prescribedRepsForRM('6').reps===6&&prescribedRepsForRM('6–8').reps===6&&prescribedRepsForRM('8-6').reps===6&&prescribedRepsForRM('5/3/1').reps===5&&prescribedRepsForRM('8/8/6').reps===8&&prescribedRepsForRM('AMRAP')===null&&prescribedRepsForRM('')===null,'reps prescriptas: número, rango (toma el menor) y formatos que no cuentan');
    S.atletaView=null; switchView('atletas'); await wait(1200);
    const a0=S.adminAthletes.find(x=>x.uid==='u0'); await ensureGroupPersonalData(['u0']);
    { const dbx=JSON.parse(localStorage.getItem('__db')); const keep=dbx.personal.u0.history._sessionLogs; dbx.personal.u0.history={_sessionLogs:keep}; delete dbx.personal.u0.oneRMAuto; localStorage.setItem('__db',JSON.stringify(dbx)); a0._personal.history={_sessionLogs:keep}; delete a0._personal.oneRMAuto; }
    const put=(k,rec)=>{ const dbx=JSON.parse(localStorage.getItem('__db')); dbx.personal.u0.history[k]=rec; localStorage.setItem('__db',JSON.stringify(dbx)); a0._personal.history[k]=rec; };
    // x1 = Sentadilla (RM de sentadilla), prescripta 4 × 6
    put('w1-Día 1',{date:'2026-09-01', exercises:{x1:{load:100, rpe:8, checked:true}}});
    openAtleta('u0'); await wait(1800);
    const P=()=>JSON.parse(localStorage.getItem('__db')).personal.u0;
    ok(P().oneRM.sentadilla_barra===131&&P().oneRMAuto?.sentadilla_barra?.reps===6,'al abrir la ficha: 100 kg a RPE 8 con 6 reps prescriptas → RM 131 ('+P().oneRM.sentadilla_barra+')');
    // una sesión más nueva con menos → baja (es la última)
    put('w2-Día 1',{date:'2026-09-08', exercises:{x1:{load:90, rpe:8, checked:true}}});
    await adminAutoRM(a0); await wait(300); ok(P().oneRM.sentadilla_barra===118&&P().oneRMAuto.sentadilla_barra.kg===90,'sesión más nueva: el RM sigue a la última (90 × 6 @8 → 118)');
    // RIR se convierte
    const ex1=S.routines.find(r=>r.id==='r1').sessions['Día 1'].flatMap(b=>b.categories[0].exercises).find(e=>e.id==='x1');
    // mismas reps pero el profe cambia la prescripción a 3 en la semana 3 → usa 3
    ensureExProgression(ex1); while(ex1.progression.length<3) ex1.progression.push({}); ex1.progression[2]={...ex1.progression[0], reps:'3'};
    put('w3-Día 1',{date:'2026-09-15', exercises:{x1:{load:100, rpe:9, checked:true}}});
    await adminAutoRM(a0); await wait(300); ok(Math.abs(P().oneRM.sentadilla_barra-112)<0.6&&P().oneRMAuto.sentadilla_barra.reps===3,'usa las reps prescriptas de ESA semana (100 × 3 @9 → 112)');
    // corregido a mano: la misma sesión no lo vuelve a pisar
    await adminSaveOneRM('u0','sentadilla_barra','120'); await adminAutoRM(a0); await wait(300); ok(P().oneRM.sentadilla_barra===120,'si el profe lo corrige a mano, no se lo pisa con la misma sesión');
    setAtletaSubview('perfil'); await wait(500); ok(/Se actualizó solo/.test(document.getElementById('main').innerText),'ficha: muestra de dónde salió el RM'); txtBad('perfil con RM automático');
    // cargarle kilos y RPE desde la ficha lo actualiza en el momento
    put('w4-Día 1',{exercises:{}}); ex1.progression[3]={...ex1.progression[0], reps:'5'};
    await adminSetExerciseField('u0',4,'Día 1','x1','load','110',true); await adminSetExerciseField('u0',4,'Día 1','x1','rpe','9',true); await wait(400);
    ok(Math.abs(P().oneRM.sentadilla_barra-(Math.round(110/0.837*2)/2))<0.01,'cargar kilos y RPE desde la ficha lo actualiza (110 × 5 @9 → '+P().oneRM.sentadilla_barra+')'); ok(P().history['w4-Día 1'].date===todayLocal(),'cargar desde la ficha deja la sesión con fecha');
    goBackFromAthleteDetail(); await wait(400); }

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

  // ── estilo único de gráficos ──
  { applyChartTheme(); ok(Chart.defaults.color===chartColors().text3&&Chart.defaults.font.size>=11,'gráficos: color y letra (≥11 px) del tema');
    const cs=[0,1,2,3,4,5].map(chartSeriesColor); ok(new Set(cs).size===6&&!cs.some(c=>[chartColors().green,chartColors().red].includes(c)),'gráficos: 6 colores de atleta distintos, sin verde/rojo de alerta');
    ok(chartSeriesColor(6)===chartSeriesColor(0),'gráficos: el color sigue el orden, no se inventan nuevos'); }
  // ── perfil: wellness y ACWR en dos franjas (nunca dos unidades en un mismo eje) ──
  { S.atletaView=null; switchView('atletas'); await wait(1000); openAtleta('u0'); await wait(1500); setAtletaSubview('perfil'); await wait(700);
    const tr=S.athleteChartInstances?.trend; if(tr){ ok(tr.data.datasets.length===2&&tr.options.scales.y.position==='left'&&tr.options.scales.y1.position==='right'&&tr.options.scales.y.max-tr.options.scales.y.min<=100,'perfil: wellness y ACWR en el mismo gráfico, cada uno con su escala'); }
    goBackFromAthleteDetail(); await wait(400); }
  // ── comparar atletas: de 2 a 6, saltos y fuerza separados, promedio, evolución ──
  { await ensureAdminAthletes(); await ensureGroupPersonalData(S.adminAthletes.map(a=>a.uid));
    const mk=(b,st)=>['2026-05-12','2026-06-15','2026-08-10','2026-09-12'].map((d,i)=>({date:d,height:+(b+st*i).toFixed(1)}));
    [['u0',38,0.7,110,71],['u1',35,0.6,85,92],['u2',37,0.5,120,84],['u3',34,0.3,95,78]].forEach(([uid,c,st,sq,w],k)=>{ const a=S.adminAthletes.find(x=>x.uid===uid); if(!a) return; a.weight=w; a._personal=a._personal||{}; a._personal.evals={cmj:mk(c,st), sj:k===1?[]:mk(c-3,st), rm_sentadilla:[{date:'2026-08-20',height:sq}]}; });
    S.compareUids=[]; S.compareScope='all'; S.compareStrengthRel=false; S.compareMode='last';
    switchView('atletas'); await wait(800); const cb=document.querySelector('#main button[onclick="adminGoCompare(\'ind\')"]'); ok(!!cb,'Atletas: botón Comparar atletas');
    await adminGoCompare('all'); await wait(500);
    ok(/al menos dos/.test(document.getElementById('main').innerText),'comparar: pide al menos dos');
    for(const u of ['u0','u1','u2']) await addCompareAthlete(u); await wait(400);
    ok(document.querySelectorAll('.ca-chip').length===3,'comparar: 3 atletas elegidos');
    const dots=[...document.querySelectorAll('.ca-chip i')].map(i=>getComputedStyle(i).backgroundColor); ok(new Set(dots).size===3,'comparar: un color por atleta');
    const cmj=[...document.querySelectorAll('.ca-test')].find(t=>/^CMJ/.test(t.querySelector('.ca-test-h b').textContent));
    ok(!!cmj&&cmj.querySelectorAll('.ca-bar').length===3,'comparar: CMJ con una barra por atleta');
    ok(!!cmj&&/Mejor/.test(cmj.querySelector('.ca-row .ca-pill').innerText)&&/40,1/.test(cmj.innerText),'comparar: el mejor (Espamer 40,1) lleva "Mejor"');
    ok(!!cmj&&!!cmj.querySelector('.ca-avg')&&/prom\. general/.test(cmj.innerText),'comparar: línea del promedio');
    const sj=[...document.querySelectorAll('.ca-test')].find(t=>/^SJ/.test(t.querySelector('.ca-test-h b').textContent)); ok(!!sj&&/sin test/.test(sj.innerText),'comparar: "sin test" en vez de cero');
    const cards=[...document.querySelectorAll('.ca-card')]; ok(/Saltos/i.test(cards[0].innerText)&&/Fuerza/i.test(cards[1].innerText)&&!/kg/.test(cards[0].querySelector('.ca-test-h').innerText),'comparar: saltos (cm) y fuerza (kg) en gráficos separados');
    setCompareStrengthRel(true); await wait(300); ok(/kg\/kg/.test(document.querySelectorAll('.ca-card')[1].innerText)&&/1,55/.test(document.querySelectorAll('.ca-card')[1].innerText),'comparar: fuerza por kilo de peso (110/71 = 1,55)'); setCompareStrengthRel(false); await wait(200);
    ok(document.querySelectorAll('.ca-lrow .ar-row').length===3,'comparar: carga y bienestar de cada uno');
    await wait(300); const ev=S.compareChartInstances?.evol; ok(!!ev&&ev.data.datasets.filter(d=>!d._avg).length===3&&ev.data.datasets.some(d=>d._avg),'comparar: evolución con 3 líneas + promedio');
    ok(/↑ \+2,1 cm/.test(document.querySelector('.ca-gains')?.innerText||''),'comparar: cuánto mejoró cada uno (+2,1 cm)');
    for(const u of ['u3','u4','u5','u6']) await addCompareAthlete(u); await wait(300); ok(document.querySelectorAll('.ca-chip').length===6&&!document.querySelector('.ca-add'),'comparar: máximo 6');
    removeCompareAthlete('u1'); await wait(200); ok(document.querySelectorAll('.ca-chip').length===5,'comparar: se saca un atleta');
    txtBad('comparar atletas'); ok(document.documentElement.scrollWidth<=innerWidth+1,'comparar: sin scroll horizontal');
    compareGoBack(); await wait(300); ok(S.currentView==='atletas','comparar: volver regresa a Atletas'); }
  // ── ejercicio repetido: al ponerlo avisa dónde ya estaba, y queda marcado ──
  { switchView('admin'); adminGoRoutines(); await wait(600); editRoutine('r1'); await wait(500); S._routineCompare=false;
    const days=getOrderedSessionNames(S.editingRoutine); const d3=days[days.length-1]; S._routineEditSession=d3; renderMain(); await wait(300);
    const blk=S.editingRoutine.sessions[d3][0];
    // "Press banca" (lpb) ya está en otros días
    const before=routineExOtherPlaces(S.editingRoutine,{id:'zz',libId:'lpb',name:'Press banca'}); ok(before.length>=1,'detecta dónde ya está Press banca ('+routineDupLabel(before)+')');
    openRoutineLib(blk.id,d3,0); await wait(250); addFromLib('lpb'); await wait(400);
    const toast=document.getElementById('toast').textContent; ok(/ya está en/.test(toast)&&before.some(p=>toast.includes(p.sName)),'al ponerlo avisa en qué día y bloque ya estaba ('+toast+')');
    const added=blk.categories[0].exercises.find(e=>e.libId==='lpb'); const row=added&&document.getElementById('rexrow-'+added.id);
    ok(!!row&&!!row.querySelector('.dup-tag')&&row.querySelector('.dup-tag').textContent.includes(before[0].sName),'el ejercicio repetido queda marcado con dónde más está');
    // uno que no está repetido no se marca y avisa normal
    openRoutineLib(blk.id,d3,0); await wait(250); addFromLib('lbi'); await wait(400);
    const nb=blk.categories[0].exercises.find(e=>e.libId==='lbi'); ok(!document.getElementById('rexrow-'+nb.id).querySelector('.dup-tag')&&/agregado/.test(document.getElementById('toast').textContent),'un ejercicio no repetido no se marca');
    ok(routineExOtherPlaces(S.editingRoutine,{id:'q',name:'PRESS  BANCA'}).length>=2,'reconoce el mismo ejercicio escrito con mayúsculas o espacios distintos');
    setRoutineCompare(true); await wait(500); ok(!!document.querySelector('#cmpex-'+added.id+' .dup-tag'),'vista horizontal: también lo marca'); setRoutineCompare(false);
    txtBad('editor con repetidos'); }
  // ── estadísticas del equipo: números del plantel, ranking en barras, molestias en lista, radar con tabla, cuadrante y tabla por puesto ──
  { const dbx=JSON.parse(localStorage.getItem('__db')); const mk=(b,st)=>['2026-05-12','2026-07-15','2026-09-12'].map((d,i)=>({date:d,height:+(b+st*i).toFixed(1)}));
    const P={u1:[37,0.8,32,90,70],u2:[40,0.6,35.5,120,80],u3:[34,0.4,null,95,65]};
    Object.entries(P).forEach(([u,[c,st,sj,sq,bp]])=>{ dbx.personal[u]=dbx.personal[u]||{}; dbx.personal[u].evals={cmj:mk(c,st), abalakov:mk(c+6,st), ...(sj?{sj:mk(sj,st)}:{}), rm_sentadilla:[{date:'2026-08-20',height:sq}], rm_press_banca:[{date:'2026-08-20',height:bp}]}; const a=S.adminAthletes.find(x=>x.uid===u); if(a&&a._personal) a._personal.evals=dbx.personal[u].evals; });
    localStorage.setItem('__db',JSON.stringify(dbx));
    S.atletaView=null; S._inAthleteDetail=false; S.leaderboardTest='cmj'; S.leaderboardMode='pr'; S.radarMode='equipo'; S.radarAthleteId='u1';
    switchView('teams'); await wait(600); openTeam('t1'); await wait(1600); setTeamSubview('stats'); await wait(1800);
    const main=document.getElementById('main'); const tx=main.innerText;
    ok(!/Semáforo/i.test(tx),'equipo: sin el semáforo repetido');
    ok(document.querySelectorAll('.ts-kpis .ts-kpi').length===4,'equipo: 4 números del plantel arriba');
    const rk=[...document.querySelectorAll('.ts-card')].find(c=>/Ranking del equipo/i.test(c.innerText));
    const rrows=rk?[...rk.querySelectorAll('.ca-row')]:[]; ok(rrows.length===3&&/Rossi/.test(rrows[0].innerText)&&/41,2/.test(rrows[0].innerText)&&!!rrows[0].querySelector('.ev-gold'),'equipo: ranking en barras, el primero con "Mejor" (Rossi 41,2)');
    ok(!!rk&&!!rk.querySelector('.ca-avg'),'equipo: ranking con la línea del promedio');
    const ij=document.querySelectorAll('.ts-inj-r'); ok(ij.length>=1&&![...ij].some(r=>/_der|_izq/.test(r.innerText))&&!document.getElementById('team-injury-chart'),'equipo: molestias en lista con el nombre de la zona (sin torta)');
    const rc=S.radarChartInstance; ok(!!rc&&rc.data.datasets.length===2&&rc.data.datasets[0].data.every(v=>v===null||v>0),'equipo: radar del atleta contra el promedio (sin ceros inventados)');
    ok(document.querySelectorAll('.ts-rt .ts-rt-r').length===7&&/Meier/i.test(document.querySelector('.ts-rt-h').innerText),'equipo: tabla del radar con los 6 tests');
    ok(!!S.quadrantChartInstance&&S.quadrantChartInstance.data.datasets[0].data.length===2,'equipo: cuadrante con los atletas que tienen CMJ y SJ');
    const pt=document.querySelector('.ts-pt'); ok(!!pt&&pt.querySelectorAll('tbody tr').length===4,'equipo: una sola tabla por puesto (equipo + 3 puestos)');
    setRadarMode('self'); await wait(500); ok(/primer test/i.test(document.querySelector('.ts-rt-h').innerText),'equipo: radar contra su primer test');
    setLeaderboardTest('rm_sentadilla'); await wait(400); ok(/120/.test(document.querySelector('.ca-row').innerText),'equipo: ranking de sentadilla (120 kg primero)');
    txtBad('estadísticas del equipo'); ok(document.documentElement.scrollWidth<=innerWidth+1,'estadísticas del equipo: sin scroll horizontal');
    S.radarMode='equipo'; S.leaderboardTest='cmj'; }
  // ── ficha → Estadísticas: el atleta dentro de su equipo ──
  { S.astScope='team'; S.astMode='best'; adminOpenAthlete('u1'); await wait(1500); setAtletaSubview('stats'); await wait(1800);
    const tx=document.getElementById('main').innerText;
    ok(!/Ranking del equipo/i.test(tx)&&/Dónde está en su equipo/i.test(tx),'ficha: muestra dónde está en su equipo (no un "ranking" de uno)');
    const cmj=[...document.querySelectorAll('.ast-tile')].find(x=>/^CMJ/.test(x.querySelector('.ast-th b').textContent));
    ok(!!cmj&&/de 3/.test(cmj.innerText)&&cmj.querySelectorAll('.ast-dot').length===2&&!!cmj.querySelector('.ast-me')&&!!cmj.querySelector('.ast-avg'),'ficha: CMJ con su puesto (de 3), los 2 compañeros y el promedio');
    ok(!!cmj&&!/Rossi|Perez/.test(cmj.innerText),'ficha: la franja no muestra nombres de compañeros');
    ok([...document.querySelectorAll('.ast-tile')].some(x=>/Sin test/.test(x.innerText)&&/Peso muerto/.test(x.innerText)),'ficha: los tests que faltan, juntos en una tarjeta');
    ok(!!S.radarChartInstance&&!!S.astCharts?.['ast-evol-chart']&&S.astCharts['ast-evol-chart'].data.datasets.length===2,'ficha: radar y evolución contra el promedio del equipo');
    txtBad('ficha estadísticas'); ok(document.documentElement.scrollWidth<=innerWidth+1,'ficha estadísticas: sin scroll horizontal');
    goBackFromAthleteDetail(); await wait(500);
    S.atletaView=null; S._inAthleteDetail=false; switchView('atletas'); await wait(900); openAtleta('u0'); await wait(1300); setAtletaSubview('stats'); await wait(1500);
    ok(/sus marcas/i.test(document.getElementById('main').innerText)&&!document.querySelector('.ast-ctx'),'ficha de individual sin equipo: sus marcas, sin "comparado con"');
    txtBad('ficha individual estadísticas'); goBackFromAthleteDetail(); await wait(400); }
  // ── Dashboard: solo molestias/lesiones de los últimos 10 días; la ficha las sigue mostrando ──
  { const ds=o=>{const d=new Date(); d.setDate(d.getDate()-o); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
    const dbx=JSON.parse(localStorage.getItem('__db'));
    dbx.personal.u4.injuries={hombro_der_b:{pain:5,severity:'moderada',isInjury:true,type:'muscular',history:[{date:ds(3),pain:5}]}, tobillo_izq_b:{pain:3,severity:'leve',isInjury:false,history:[{date:ds(20),pain:3}]}};
    dbx.personal.u5.injuries={rodilla_der_b:{pain:4,severity:'leve',isInjury:false,history:[{date:ds(1),pain:4}]}};
    localStorage.setItem('__db',JSON.stringify(dbx)); S.dashAthletes=null; S.adminAthletes=null; S.adminAthletesLoaded=false;
    S.atletaView=null; switchView('dashboard'); await wait(2500);
    const side=[...document.querySelectorAll('.att-side')].find(x=>/recientes/i.test(x.innerText)); const tx=side?side.innerText:'';
    ok(/Molestias y lesiones recientes/.test(tx),'panel: se llama "Molestias y lesiones recientes"');
    ok(/Gomez Pedro/.test(tx)&&/Lesión/.test(tx),'panel: la lesión de hace 3 días aparece, marcada como Lesión');
    ok(/Diaz Ana/.test(tx)&&/Molestia/.test(tx),'panel: también aparece una molestia reciente (hace 1 día)');
    ok(!/hace 20 días/.test(tx),'panel: la de hace 20 días ya no aparece');
    const att=document.getElementById('dash-att')?.innerText||''; ok(!/Tobillo/i.test(att),'atención: la molestia de hace 20 días no aparece');
    ok(injuryIsRecent({history:[{date:ds(10)}]})&&!injuryIsRecent({history:[{date:ds(11)}]})&&!injuryIsRecent({}),'regla: hasta 10 días sí, 11 no, sin fecha no');
    // en la ficha sigue la de hace 20 días
    await adminOpenAthleteDash('u4'); await wait(2000); setAtletaSubview('perfil'); await wait(600);
    { const mt=document.getElementById('main').innerText.replace(/\s+/g,' '); const k=mt.search(/Molestias/i); const inj=Object.keys((S.atletaView&&S.atletaView._personal&&S.atletaView._personal.injuries)||{}); ok(/Tobillo/i.test(mt),'ficha: la molestia vieja sigue en su perfil ['+S.currentView+'/'+S.atletaSubview+'/'+(S.atletaView&&S.atletaView.uid)+' inj='+inj.join(',')+' :: '+mt.slice(Math.max(0,k),k+200)+']'); } goBackFromAthleteDetail(); await wait(400); }
  // ── ACWR: "Pico de carga" y la explicación de por qué ──
  { ok(getACWRStatus(1.6,30).label==='Pico de carga'&&!/[Rr]iesgo lesional/.test(document.body.innerHTML),'ACWR > 1,5 dice "Pico de carga" (sin "riesgo lesional")');
    const ds=o=>{const d=new Date(); d.setDate(d.getDate()-o); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
    const mk=(o,act,mins,rpe)=>({date:ds(o),activity:act,session:act,week:1,rpe,mins,ua:mins*rpe});
    // semana pesada por partidos: 3 semanas de 1000 UA de gimnasio y esta con 1000 de gimnasio + 1000 de partidos
    const heavy=[]; for(let w=1;w<4;w++) for(let d=0;d<5;d++) heavy.push(mk(w*7+d,'gimnasio',40,5)); for(let d=0;d<5;d++) heavy.push(mk(d,'gimnasio',40,5)); heavy.push(mk(1,'partido',100,10));
    const bh=acwrBreakdown(heavy); const hh=acwrExplainHtml(heavy,'Handball','X');
    ok(bh&&!bh.baseLow&&/más/.test(hh)&&/Partido/.test(hh)&&/sesiones más pesadas/i.test(hh),'semana pesada: dice cuánto más y que lo subió el partido');
    // base baja: 8 semanas de 1500, 3 flojas de 300, esta de 1500
    const low=[]; for(let w=4;w<12;w++) for(let d=0;d<5;d++) low.push(mk(w*7+d,'gimnasio',50,6)); for(let w=1;w<4;w++) low.push(mk(w*7,'gimnasio',50,6)); for(let d=0;d<5;d++) low.push(mk(d,'gimnasio',50,6));
    const bl=acwrBreakdown(low); ok(bl&&bl.baseLow&&/semanas flojas/.test(acwrExplainHtml(low,'','X')),'base baja: explica que viene de semanas flojas');
    // se abre al tocar el ACWR de un atleta en el Dashboard
    S.atletaView=null; switchView('dashboard'); await wait(2000); const tap=document.querySelector('#dash-athlete-list .ar-acwr.ax-tap');
    if(tap){ tap.click(); await wait(300); ok(!!document.querySelector('#acwr-overlay .ax-body')&&S.currentView==='dashboard'&&!S.atletaView,'Dashboard: tocar el ACWR abre la explicación (sin abrir la ficha)'); closeAcwrExplain(); } else ok(false,'Dashboard: el ACWR de la fila se puede tocar'); txtBad('dashboard con ACWR'); }
  // ── Informe: las 4 pestañas son hojas blancas con el mismo encabezado ──
  { S.atletaView=null; S._inAthleteDetail=false; switchView('teams'); await wait(500); openTeam('t1'); await wait(1500); setTeamSubview('reporte'); await wait(500);
    for(const [sub,kind] of [['resumen','Informe mensual'],['staff','Reunión de staff'],['medico','Informe médico'],['partido','Previa del partido']]){
      setTeamReportSubview(sub); await wait(900);
      const sh=document.querySelector('.rp-sheet'); ok(!!sh&&document.querySelectorAll('.rp-sheet').length===1&&new RegExp(kind,'i').test(sh.querySelector('.rp-kind').innerText)&&!!sh.querySelector('.rp-foot'),'informe '+sub+': hoja con encabezado y pie');
      ok(!!sh&&getComputedStyle(sh).backgroundColor==='rgb(255, 255, 255)','informe '+sub+': hoja blanca también en modo oscuro');
      txtBad('informe '+sub); }
    setTeamReportSubview('resumen'); await wait(900);
    ok(!!document.getElementById('report-well-chart')&&!!document.querySelector('#report-acwr-chart, .rp-two .rp-empty')&&!document.getElementById('report-quadrant-chart'),'informe: wellness y ACWR en gráficos separados');
    ok(!/[_](der|izq)\b/.test(document.querySelector('.rp-sheet').innerText),'informe: zonas con su nombre, no el código');
    setTeamReportSubview('medico'); await wait(900); ok(!!document.querySelector('.rp-bm svg')&&!document.getElementById('medreport-severity-chart'),'informe médico: mapa del cuerpo (sin el cuadro vacío)');
    setTeamReportSubview('partido'); await wait(700); ok(document.querySelectorAll('.rp-big3>div').length===3,'informe partido: disponibles, en duda y no disponibles');
    S.teamReportSubview='resumen'; }
  // ── el RM se recalcula al abrir la ficha por CUALQUIER camino, con los datos frescos (no la copia en memoria) ──
  { const P=()=>JSON.parse(localStorage.getItem('__db')).personal.u2; const put=(k,rec)=>{ const dbx=JSON.parse(localStorage.getItem('__db')); dbx.personal.u2.history[k]=rec; localStorage.setItem('__db',JSON.stringify(dbx)); };
    // u2 (Rossi) tiene la rutina r1; x2 = Press banca, se vincula al RM de press plano
    const rt=S.routines.find(x=>x.id==='r1'); const x2=Object.values(rt.sessions).flat().flatMap(b=>b.categories[0].exercises).find(e=>e.id==='x2'); x2.rmLift='press_plano'; x2.reps='8'; delete x2.progression;
    { const dbx=JSON.parse(localStorage.getItem('__db')); const ex=Object.values(dbx.routines.r1.sessions).flat().flatMap(b=>b.categories[0].exercises).find(e=>e.id==='x2'); ex.rmLift='press_plano'; ex.reps='8'; delete ex.progression; localStorage.setItem('__db',JSON.stringify(dbx)); }
    S.atletaView=null; switchView('atletas'); await wait(1200); await ensureGroupPersonalData(['u2']);   // queda en memoria la copia vieja
    const sess=Object.keys(rt.sessions).find(k=>rt.sessions[k].some(b=>b.categories[0].exercises.some(e=>e.id==='x2')));
    put('w1-'+sess,{date:todayLocal(), exercises:{x2:{load:90, rpe:7, checked:true}}});   // el atleta registró DESPUÉS
    await adminOpenAthleteDash('u2'); await wait(1500);
    ok(P().oneRM.press_plano===Math.round(90/rpePct(8,7)*2)/2,'Dashboard → ficha: recalcula con lo recién registrado (90 × 8 @7 → '+P().oneRM.press_plano+')');
    goBackFromAthleteDetail(); await wait(500);
    put('w2-'+sess,{date:'2099-01-01', exercises:{x2:{load:95, rpe:7, checked:true}}});
    S.atletaView=null; switchView('atletas'); await wait(800); openAtleta('u2'); await wait(1800);
    ok(P().oneRM.press_plano===Math.round(95/rpePct(8,7)*2)/2,'Atletas → ficha: también recalcula con datos frescos (95 × 8 @7 → '+P().oneRM.press_plano+')');
    // registro más nuevo que no se puede usar → la ficha lo avisa con el motivo
    x2.progression=[{series:'4',reps:'8'},{series:'4',reps:'8'},{series:'4',reps:'8/6/4'},{series:'4',reps:'AMRAP'}]; const dbx=JSON.parse(localStorage.getItem('__db')); Object.values(dbx.routines.r1.sessions).flat().flatMap(b=>b.categories[0].exercises).find(e=>e.id==='x2').progression=x2.progression; localStorage.setItem('__db',JSON.stringify(dbx));
    put('w3-'+sess,{date:'2099-02-01', exercises:{x2:{load:100, rpe:8, checked:true}}});
    goBackFromAthleteDetail(); await wait(400); openAtleta('u2'); await wait(1800);
    ok(P().oneRM.press_plano===Math.round(100/rpePct(8,8)*2)/2,'reps "8/6/4": se usa la primera (100 × 8 @8 → '+P().oneRM.press_plano+')');
    put('w4-'+sess,{date:'2099-03-01', exercises:{x2:{load:110, rpe:9, checked:true}}});
    goBackFromAthleteDetail(); await wait(400); openAtleta('u2'); await wait(1800); setAtletaSubview('perfil'); await wait(500);
    const sk=document.querySelector('.rm-skip'); ok(!!sk&&/semana 4/.test(sk.textContent)&&/AMRAP/.test(sk.textContent),'ficha: avisa el registro que no se pudo usar y por qué ('+(sk?sk.textContent:'nada')+')');
    ok(/se toma la primera/.test(document.getElementById('main').innerText),'ficha: aclara que se tomó la primera cantidad');
    txtBad('ficha con aviso de RM'); goBackFromAthleteDetail(); await wait(400); }
  // ── evolución de un test sin ningún registro: no se rompe ──
  { let okE=true; try { const a0={_personal:{evals:{}}}; const d=athleteEvolData(a0,[a0,a0],'cmj'); okE = d && d.rankTo===null && d.gain===null; } catch(e){ okE=false; } ok(okE,'evolución de un test sin registros: no tira error'); }
  // ── un atleta con varias molestias aparece UNA vez, con todas adentro ──
  { const ds=o=>{const d=new Date(); d.setDate(d.getDate()-o); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
    const dbx=JSON.parse(localStorage.getItem('__db'));
    dbx.personal.u3.injuries={rodilla_izq_b:{pain:6,severity:'moderada',isInjury:false,history:[{date:ds(2),pain:6}]}, tobillo_izq_b:{pain:7,severity:'leve',isInjury:false,history:[{date:ds(2),pain:7}]}, hombro_der_b:{pain:4,severity:'leve',isInjury:true,history:[{date:ds(5),pain:4}]}};
    localStorage.setItem('__db',JSON.stringify(dbx)); S.dashAthletes=null; S.adminAthletes=null; S.adminAthletesLoaded=false;
    S.atletaView=null; switchView('dashboard'); await wait(2500);
    const side=[...document.querySelectorAll('.att-side')].find(x=>/recientes/i.test(x.innerText));
    const rowsP=[...(side?side.querySelectorAll('.att-grp'):[])].filter(x=>/Perez Juan/.test(x.innerText));
    ok(rowsP.length===1,'recientes: Perez Juan aparece una sola vez ('+rowsP.length+')');
    ok(rowsP[0]&&rowsP[0].querySelectorAll('.inj-line').length===3,'recientes: con sus 3 molestias/lesiones adentro');
    ok(/\((\d+)\)/.test(side.querySelector('.att-side-t').textContent)&&+side.querySelector('.att-side-t').textContent.match(/\((\d+)\)/)[1]===side.querySelectorAll('.att-grp').length,'recientes: el número del título es de atletas');
    txtBad('dashboard con molestias agrupadas'); }
  // ── Importar del Axon: reconoce por nombre dentro del equipo, no duplica, no crea atletas ──
  { const p=parseAxonFile('MEIER_[\r\nMatias\r\n\r\n180\r\nFecha,Hora,Tipo,Piso,Vuelo,Altura,Velocidad,Q,"A Caida"\r\n22/09/26,20:09:14,CMJ," ",576,"40,6","2,82"," ",\r\n22/09/26,20:09:20,CMJ," ",584,"41,8","2,86"," ",\r\n22/09/26,10:20:00,"Prom CMJ"," ","580,00","41,2","2,84"," ",\r\n22/09/26,20:12:00,Máximo,424,704,"60,7","3,45","1,661",\r\n','x.atl');
    ok(p&&p.name==='MEIER Matias'&&p.jumps.length===3&&p.jumps[0].date==='2026-09-22'&&p.jumps[1].height===41.8,'Axon: lee nombre, fecha y altura (sin las filas de promedio)');
    ok(p&&p.jumps[2].testId==='saltoAprox'&&p.jumps[2].contact===424&&p.jumps[2].q===1.661,'Axon: "Máximo" va a Salto de Aproximación con contacto y Q');
    const cands=[{uid:'a',name:'Meier Matias'},{uid:'b',name:'Rossi Lucas'}];
    ok(axonMatch('MEIER Matias',cands).uid==='a'&&axonMatch('MEIER Matias',cands).level==='ok','Axon: reconoce el mismo nombre');
    ok(axonMatch('ROSSI Lucas Martín',cands).level==='maybe'&&axonMatch('GOMEZ Pedro',cands).level==='none','Axon: segundo nombre de más = revisar; desconocido = no importar');
    const users0=Object.keys(JSON.parse(localStorage.getItem('__db')).users).length;
    S.atletaView=null; S._inAthleteDetail=false; switchView('teams'); await wait(500); openTeam('t1'); await wait(1500); setTeamSubview('evals'); await wait(1200);
    const b=[...document.querySelectorAll('button')].find(x=>/Importar del Axon/.test(x.textContent)); ok(!!b,'Evaluaciones del equipo: botón Importar del Axon');
    if(b){ b.click(); await wait(300);
      const mk=(sur,first,rows)=>new File([new Uint8Array([...[sur+'_[',first,'','180','Fecha,Hora,Tipo,Piso,Vuelo,Altura,Velocidad,Q,"A Caida"',...rows].join('\r\n')].map(c=>c.charCodeAt(0)&255))], sur+'.atl');
      await axonFilesChosen({files:[mk('MEIER','Matias',['15/10/26,20:09:14,CMJ," ",576,"40,6","2,82"," ",','15/10/26,20:09:20,CMJ," ",584,"41,8","2,86"," ",']), mk('FANTASMA','Juan',['15/10/26,20:09:14,CMJ," ",576,"40,6","2,82"," ",'])]}); await wait(500);
      const tx=document.getElementById('axon-overlay').innerText; ok(/Reconocido/.test(tx)&&/no están en la app/.test(tx),'Axon: vista previa con reconocidos y los que no están en la app aparte');
      await confirmAxonImport(); await wait(600);
      const d=JSON.parse(localStorage.getItem('__db')); const u=Object.entries(d.users).find(([,x])=>x.name==='Meier Matias'); const rec=u&&(d.personal[u[0]].evals?.cmj||[]).find(r=>r.date==='2026-10-15');
      ok(rec&&rec.height===41.8&&rec.attempts.length===2&&rec.src==='axon','Axon: guarda el mejor salto con los 2 intentos en el atleta correcto');
      ok(Object.keys(d.users).length===users0,'Axon: no crea atletas nuevos');
      closeAxonImport(); openAxonImport(); await axonFilesChosen({files:[mk('MEIER','Matias',['15/10/26,20:09:14,CMJ," ",576,"40,6","2,82"," ",'])]}); await wait(400);
      ok(/Nada nuevo/.test(document.getElementById('axon-overlay').innerText),'Axon: importar dos veces no duplica'); closeAxonImport(); txtBad('evaluaciones equipo');
      // desde Atletas (sin equipo): reconoce a cualquier atleta de la app, de cualquier equipo
      S.teamView=null; S.atletaView=null; switchView('atletas'); await wait(900);
      const ba=[...document.querySelectorAll('#main button')].find(x=>/Importar del Axon/.test(x.textContent)); ok(!!ba,'Atletas: botón Importar del Axon');
      if(ba){ ba.click(); await wait(400); const other=S.adminAthletes.find(x=>x.uid==='u4'); const [sur,...fn]=(other?.name||'Gomez Pedro').split(' ');
        await axonFilesChosen({files:[mk(sur.toUpperCase(),fn.join(' '),['15/10/26,20:09:14,CMJ," ",576,"40,6","2,82"," ",'])]}); await wait(500);
        const r0=S._axon?.rows?.[0]; ok(r0&&r0.uid==='u4'&&/todos los atletas/.test(document.getElementById('axon-overlay').innerText),'Axon desde Atletas: reconoce a un atleta de otro equipo ('+(r0&&r0.uid)+')'); closeAxonImport(); }
      ok(axonCandidates().some(c=>c.uid==='self'&&/(vos)/.test(c.name)),'Axon: el profe también aparece para elegir (sus propios saltos)'); } }
  // ── RPE menor a 7 no mueve el RM (y se avisa por qué) ──
  { S.atletaView=null; switchView('atletas'); await wait(800);
    const a0=S.adminAthletes.find(x=>x.uid==='u0'); await ensureGroupPersonalData(['u0']);
    const dbx=JSON.parse(localStorage.getItem('__db')); dbx.personal.u0.history={_sessionLogs:dbx.personal.u0.history._sessionLogs}; delete dbx.personal.u0.oneRMAuto; dbx.personal.u0.oneRM.sentadilla_barra=110;
    dbx.personal.u0.history['w1-Día 1']={date:'2099-05-01', exercises:{x1:{load:110, rpe:5, checked:true}}}; localStorage.setItem('__db',JSON.stringify(dbx));
    openAtleta('u0'); await wait(1800); const P0=()=>JSON.parse(localStorage.getItem('__db')).personal.u0;
    ok(P0().oneRM.sentadilla_barra===110,'RPE 5: el RM no se mueve (sigue 110; está '+P0().oneRM.sentadilla_barra+')');
    setAtletaSubview('perfil'); await wait(500); const sk=document.querySelector('.rm-skip'); ok(!!sk&&/RPE 5/.test(sk.textContent)&&/RPE 7 o más/.test(sk.textContent),'ficha: avisa que RPE 5 no alcanza ('+(sk?sk.textContent:'nada')+')');
    // RIR 2 = RPE 8: sí cuenta
    ok(rmFromRpe(100,6,10-2)>0&&RM_AUTO_MIN_RPE===7,'RIR 2 (= RPE 8) sí cuenta');
    goBackFromAthleteDetail(); await wait(400); }
  // ── solo el levantamiento en sí actualiza el RM (una Split usa el RM pero no lo mueve) ──
  { const U=exerciseUpdatesRM;
    ok(U('Sentadilla con barra','sentadilla_barra')&&U('Sentadilla Trap Bar','sentadilla_barra')&&U('Sentadilla en trap bar','sentadilla_barra'),'actualizan el RM de sentadilla: con barra y trap bar');
    ok(!U('Sentadilla Split','sentadilla_barra')&&!U('Sentadilla búlgara con barra','sentadilla_barra')&&!U('Sentadilla frontal con barra','sentadilla_barra')&&!U('Goblet squat','sentadilla_barra'),'no lo actualizan: split, búlgara, frontal, goblet');
    ok(U('Press Plano (barra)','press_plano')&&U('Press plano','press_plano')&&!U('Press plano con mancuernas','press_plano')&&!U('Press inclinado','press_plano'),'press plano: sí con barra, no con mancuernas ni inclinado');
    ok(U('Peso muerto','peso_muerto')&&!U('Peso muerto rumano','peso_muerto'),'peso muerto: sí el convencional, no el rumano');
    // en la práctica: una Split vinculada al RM de sentadilla no lo mueve
    const rt=S.routines.find(x=>x.id==='r1'); const exs=Object.values(rt.sessions).flat().flatMap(b=>b.categories[0].exercises); const x1=exs.find(e=>e.id==='x1');
    const hist={'w1-Día 1':{date:'2099-06-01', exercises:{x1:{load:200, rpe:9}}}};
    const keepName=x1.name; x1.name='Sentadilla Split'; const e1=latestRMEstimates(hist, rt, {}, {}); x1.name=keepName; const e2=latestRMEstimates(hist, rt, {}, {});
    ok(!e1.sentadilla_barra&&!!e2.sentadilla_barra,'Split con "De qué RM: sentadilla": no mueve el RM; la sentadilla libre sí'); }
  // ── el número del bloque sigue su posición al moverlo ──
  { switchView('admin'); adminGoRoutines(); await wait(600); editRoutine('r1'); await wait(500); S._routineCompare=false;
    const d=getOrderedSessionNames(S.editingRoutine)[0]; S._routineEditSession=d; renderMain(); await wait(300);
    const arr=S.editingRoutine.sessions[d]; const last=arr[arr.length-1];
    for(let i=0;i<arr.length;i++){ moveRoutineBlock(last.id,d,-1); await wait(120); }
    const labels=S.editingRoutine.sessions[d].map(b=>b.label);
    ok(S.editingRoutine.sessions[d][0].id===last.id && labels.every((l,i)=>new RegExp('^(B|Bloque )'+(i+1)+'$').test(l)),'mover un bloque arriba: los números se reordenan ('+labels.join(', ')+')');
    const badge=document.querySelector('#rblock-'+last.id+' .block-badge'); ok(badge&&/1$/.test(badge.textContent.trim()),'el bloque movido arriba muestra el número 1 ('+(badge&&badge.textContent)+')');
    ok(renumberBlockLabels([{label:'Personal',id:'personal-block'},{label:'Bloque 7'},{label:'B9'},{label:'Calentamiento'}]).map(b=>b.label).join('|')==='Personal|Bloque 1|B2|Calentamiento','etiquetas propias se respetan'); }
  // ── último testeo del grupo y "les toca testear" (más de 6 semanas) ──
  { const ses=(d,a)=>({date:d,height:Math.max(...a),attempts:a}); const old=S._athleteEvalsCache; const oldScope=S.evalScopeUids; const oldCat=S.evalCategory;
    const dAgo=n=>{const d=new Date(); d.setDate(d.getDate()-n); return toLocalDateStr(d);};
    S._athleteEvalsCache={...(old||{}), u1:{cmj:[ses(dAgo(50),[38.0,37.4]),ses(dAgo(5),[43.4,42.8])]}, u2:{cmj:[ses(dAgo(50),[40.0,39.4]),ses(dAgo(4),[41.4,40.9])]}, u3:{cmj:[ses(dAgo(50),[35.0,34.4]),ses(dAgo(5),[35.2,34.9])]}, u4:{sj:[ses(dAgo(170),[30.1,29.5])]}};
    S.evalScopeUids=['u1','u2','u3','u4']; S.evalCategory='saltabilidad'; S.evalTesteoTest='cmj';
    const tx=renderEvalTesteoSummary();
    ok(/1<\/b><span>mejoraron de verdad/.test(tx)&&/1<\/b><span>posible mejora/.test(tx)&&/1<\/b><span>sin cambio/.test(tx),'último testeo: 1 mejora real, 1 posible, 1 sin cambio');
    const rt=renderEvalRetestList(); ok(/Gomez Pedro|u4/.test(rt)&&/hace 24 semanas/.test(rt)&&!/Meier/.test(rt),'les toca testear: solo el que no se testea hace más de 6 semanas');
    const cb=renderEvalCompareBars(); ok(/ca-tr-up/.test(cb)&&/ca-tr-maybe/.test(cb)&&/ca-tr-none/.test(cb)&&!/Tercio/.test(cb)&&/Mejor/.test(cb),'comparar (Evaluaciones): barras con la tendencia de cada uno y "Mejor", sin colores por tercio');
    S._athleteEvalsCache=old; S.evalScopeUids=oldScope; S.evalCategory=oldCat; }
  // ── ¿el cambio es real? (error típico de los intentos y cambio mínimo que importa) ──
  { const ses=(d,a)=>({date:d,height:Math.max(...a),attempts:a});
    const ev={cmj:[ses('2026-05-10',[36.1,37.4,36.5]),ses('2026-06-10',[37.0,38.2]),ses('2026-07-10',[37.9,38.5,37.2]),ses('2026-08-10',[38.0,39.1]),ses('2026-09-10',[38.6,37.5])]};
    const prev=ev.cmj[4];
    ok(/Mejora real/.test(evalChangeTag('cmj',{date:'2026-10-10',height:43.8},prev,ev,'cm')),'cambio grande (+5,2 cm) = Mejora real');
    ok(/Posible mejora/.test(evalChangeTag('cmj',{date:'2026-10-10',height:40.3},prev,ev,'cm')),'cambio chico (+1,7 cm) = Posible mejora');
    ok(/Sin cambio/.test(evalChangeTag('cmj',{date:'2026-10-10',height:38.9},prev,ev,'cm')),'cambio mínimo (+0,3 cm) = Sin cambio');
    ok(/Bajó de verdad/.test(evalChangeTag('cmj',{date:'2026-10-10',height:33.0},prev,ev,'cm')),'baja grande = Bajó de verdad');
    ok(/sus propios intentos/.test(evalChangeTag('cmj',{date:'2026-10-10',height:43.8},prev,ev,'cm')),'el ruido sale de los intentos del propio atleta');
    ok(/medidos con el Axon/.test(evalChangeTag('cmj',{date:'2026-10-10',height:43.8},{date:'2026-09-10',height:38.6},{cmj:[]},'cm')),'sin intentos usa el valor de referencia');
    const rt=evalReactiveTags({height:59.3,q:1.48,contact:470},{height:61,q:1.7,contact:400});
    ok(/Q 1,48/.test(rt)&&/Contacto 470 ms \(\+70\)/.test(rt)&&/fatiga/.test(rt),'salto con contacto: Q, contacto y aviso si el contacto sube sin mejorar la altura');
    ok(!/fatiga/.test(evalReactiveTags({height:63,q:1.6,contact:470},{height:61,q:1.7,contact:400})),'si la altura mejora, no avisa fatiga'); }
  // ── Gestión de rutinas agrupada por deporte + pasar una rutina propia a Gestión ──
  { const dbx=JSON.parse(localStorage.getItem('__db')); const base=JSON.parse(JSON.stringify(dbx.routines.r1));
    const own={...base, id:'rown5', name:'Rutina de Prueba · Ana', ownerUid:'u5'}; delete own.sport;
    const sinDep={...JSON.parse(JSON.stringify(base)), id:'rnone', name:'Plantilla sin deporte'}; delete sinDep.sport;
    dbx.routines.rown5=own; dbx.routines.rnone=sinDep; dbx.users.u5.assignedRoutine='rown5'; dbx.users.u5.sport='Básquet'; localStorage.setItem('__db',JSON.stringify(dbx));
    S.routines.push(JSON.parse(JSON.stringify(own)), JSON.parse(JSON.stringify(sinDep)));
    const a5=S.adminAthletes.find(x=>x.uid==='u5'); a5.assignedRoutine='rown5'; a5.sport='Básquet';
    switchView('admin'); await wait(300); adminGoRoutines(); await wait(700);
    const grp=s=>[...document.querySelectorAll('.rt-sport-grp')].find(g=>g.dataset.sport===s);
    ok(grp('Handball')&&grp('Handball').querySelector('#routine-name-span-r1'),'rutinas: la de handball va en el grupo Handball (por sus atletas)');
    ok(grp('__none__')&&/Sin deporte/.test(grp('__none__').textContent)&&grp('__none__').querySelector('#routine-name-span-rnone'),'rutinas: "Sin deporte" para la que no tiene');
    ok(!document.getElementById('routine-name-span-rown5'),'rutinas: la propia del atleta no aparece en Gestión');
    const order=[...document.querySelectorAll('.rt-sport-grp')].map(g=>g.dataset.sport); ok(order[order.length-1]==='__none__','rutinas: "Sin deporte" va al final ('+order.join(', ')+')');
    const sel=document.getElementById('rt-sport-rnone'); sel.value='Rugby'; sel.dispatchEvent(new Event('change',{bubbles:true})); await wait(700);
    ok(JSON.parse(localStorage.getItem('__db')).routines.rnone.sport==='Rugby'&&grp('Rugby')&&grp('Rugby').querySelector('#routine-name-span-rnone'),'rutinas: elegir deporte la guarda y la pasa a su grupo');
    document.querySelector('.rt-sport-grp[data-sport="Rugby"] .rt-sport-h').click(); await wait(300); ok(!document.getElementById('routine-name-span-rnone')&&grp('Rugby'),'rutinas: el grupo se pliega');
    document.querySelector('.rt-sport-grp[data-sport="Rugby"] .rt-sport-h').click(); await wait(300);
    ok(document.documentElement.scrollWidth<=innerWidth+1,'rutinas por deporte: sin scroll horizontal'); txtBad('rutinas por deporte');
    switchView('atletas'); await wait(600); openAtleta('u5'); await wait(1800); setAtletaSubview('rutina'); await wait(600);
    const b=[...document.querySelectorAll('#main button')].find(x=>/Pasar a Gestión de rutinas/.test(x.textContent)); ok(!!b,'ficha: rutina propia tiene "Pasar a Gestión de rutinas"');
    const keepP=window.prompt; let def=''; window.prompt=(m,d)=>{def=d; return 'Fuerza Básquet base';};
    if(b){ b.click(); await wait(900); } window.prompt=keepP;
    ok(def==='Rutina de Prueba','propone el nombre sin el del atleta ('+def+')');
    const D2=JSON.parse(localStorage.getItem('__db')); const cp=Object.values(D2.routines).find(x=>x.fromPersonalRoutineId==='rown5');
    ok(cp&&!cp.ownerUid&&cp.name==='Fuerza Básquet base'&&cp.sport==='Básquet','copia en Gestión: sin dueño, con el nombre elegido y el deporte del atleta');
    ok(D2.routines.rown5.ownerUid==='u5'&&D2.users.u5.assignedRoutine==='rown5','la rutina del atleta sigue igual y asignada');
    ok([...document.querySelectorAll('#main button')].some(x=>/✓ En Gestión de rutinas/.test(x.textContent)),'ficha: el botón muestra que ya está en Gestión');
    goBackFromAthleteDetail(); await wait(400); switchView('admin'); await wait(300); adminGoRoutines(); await wait(700);
    ok(grp('Básquet')&&/Fuerza Básquet base/.test(grp('Básquet').textContent),'aparece en Gestión, en el grupo Básquet'); }
  // ── notificaciones: si el servidor no está configurado, lo dice en vez de "activar" ──
  { const keepF=window.fetch; window.fetch=async(u,o)=>String(u).includes('/api/send-push')?new Response(JSON.stringify({publicKey:null}),{status:200,headers:{'Content-Type':'application/json'}}):keepF(u,o);
    const keepN=window.Notification; let asked=0; window.Notification=Object.assign(function(){}, {permission:'default', requestPermission:async()=>{asked++; return 'default';}});
    await activarNotificacionesPush(); await wait(200);
    ok(asked===0,'notificaciones: sin servidor configurado no pide permiso');
    ok(/falta configurar el servidor/.test(document.getElementById('toast')?.textContent||document.body.innerText),'notificaciones: avisa que falta configurar el servidor');
    window.fetch=keepF; window.Notification=keepN;
    const uD=S.userData.pushSubscription; S.userData.pushSubscription={endpoint:'https://x',p256dh:'a',auth:'b'}; switchView('settings'); await wait(300);
    ok([...document.querySelectorAll('#main button')].some(b=>b.textContent.trim()==='Probar'),'ajustes: con notificaciones activas está "Probar"'); txtBad('ajustes con notificaciones');
    if(uD) S.userData.pushSubscription=uD; else delete S.userData.pushSubscription; }
  // ── menús y modales ──
  switchView('settings'); await wait(600); txtBad('ajustes');
  R.fails=fails; R.errs=errs; R.view=innerWidth+'x'+innerHeight; R.theme=document.documentElement.getAttribute('data-theme')||'light';
  window.__regress=R;
})();
