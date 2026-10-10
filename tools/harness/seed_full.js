(function(){
const today=new Date(); const ds=(o)=>{const d=new Date(today); d.setDate(d.getDate()-o); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
// [nombre, tipo, deporte, posición, equipo, wellness base 7 días (más viejo→hoy, null=sin), entrenó días, actividades de hoy]
const A=[
 ['Espamer German','individual','Handball','Pivote',null,[4,4,3,5,4,4,null],[1,1,0,1,1,1,0],[]],
 ['Meier Matias','team','Handball','Lateral','t1',[5,5,5,4,5,5,5],[1,0,1,1,0,1,1],[['partido',8,60]]],
 ['Rossi Lucas','team','Handball','Central','t1',[4,4,3,3,2,3,2],[1,1,0,1,1,0,1],[['gimnasio',7,60],['pelota',6,90]]],
 ['Perez Juan','team','Handball','Arquero','t1',[null,null,4,4,4,4,4],[0,0,1,1,0,1,0],[]],
 ['Gomez Pedro','team','Handball','Extremo','t2',[3,4,4,5,4,3,null],[1,0,1,0,1,1,0],[['gimnasio',5,70]]],
 ['Diaz Ana','individual','Tenis','',null,[null,null,null,null,null,4,5],[0,0,0,0,0,0,1],[['pelota',5,50]]],
 ['Lopez Sofia','individual','Básquet','Base',null,[null,null,null,null,null,null,null],[0,0,0,0,0,0,0],[]],
 ['Ruiz Tomas','team','Handball','Pivote','t2',[4,4,4,4,4,4,4],[1,1,1,0,1,1,1],[['gimnasio',6,60]]]
];
const users={admin1:{email:'gonzaloganora@gmail.com',name:'Gonzalo',role:'admin',onboardingComplete:true}}; const personal={admin1:{}};
const ex=(id,libId,name,reps)=>({id,libId,name,series:'4',reps:reps||'6',rpe:'7',intensityType:'RPE'});
const blk=(id,label,title,ck,exs,main,sub)=>({id,label,title,colorKey:ck,main,sub,categories:[{id:'c'+id,label:'',exercises:exs}]});
const routine={name:'AUMENTO MASA MUSCULAR (3 DÍAS)',durationWeeks:4,sessions:{
 'Día 1':[blk('b1','B1','MOVILIDAD','bx',[ex('m1','lmo','Movilidad de cadera 90/90','8')],'MOVILIDAD',null),blk('b2','B2','FUERZA A // CONTRASTE MMII','b1',[{...ex('x1','lsq','Sentadilla libre','6'),pct:'75',rmLift:'sentadilla_barra'},ex('x5','lta','Tirones de arranque','5')],'FUERZA A','CONTRASTE MMII'),blk('b3','B3','FUERZA A // CONTRASTE MMSS','b1',[ex('x2','lpb','Press banca','6–8'),ex('x4','lrm','Remo con barra','8')],'FUERZA A','CONTRASTE MMSS'),blk('b4','B4','ACCESORIOS','bx',[ex('x6','lpa','Pallof press','10')],'ACCESORIOS',null)],
 'Día 2':[blk('b5','B1','DLO // PLYO MMII','b2',[ex('x7','lta','Tirones de arranque','5')],'DLO','PLYO MMII'),blk('b6','B2','FUERZA B // MMII','b1',[ex('x8','lrd','Peso muerto rumano','6')],'FUERZA B','MMII'),blk('b7','B3','PUMP','b4',[ex('x9','lpb','Press banca','12')],'PUMP',null)],
 'Día 3':[blk('b8','B1','ESTRUCTURA','b3',[ex('x10','lsq','Sentadilla libre','5')],'ESTRUCTURA',null),blk('b9','B2','ACONDICIONAMIENTO','b4',[ex('x11','lac','Trote suave','15 min')],'ACONDICIONAMIENTO',null)]}};
A.forEach((n,i)=>{ const uid='u'+i; const withRoutine=i<3;
 users[uid]={email:uid+'@t.com',name:n[0],role:'athlete',onboardingComplete:true,athleteType:n[1],sport:n[1]==='team'?undefined:n[2],position:n[3],teamId:n[4]||undefined,age:20+i,height:175+i,weight:70+i,
  ...(withRoutine?{assignedRoutine:'r1',routineAssignedDate:ds(10),trainingStartDate:ds(10),trainingWeekdays:[0,2,4],routineAssignmentHistory:[{routineId:'r1',routineName:routine.name,startDate:ds(10),startWeek:1,durationWeeks:4}]}:{})};
 Object.keys(users[uid]).forEach(k=>users[uid][k]===undefined&&delete users[uid][k]);
 const wellness={}; n[5].forEach((b,k)=>{ if(b==null) return; const o=6-k; wellness[ds(o)]={fatiga:b,sueño_calidad:b,estres:b,dolor_muscular:b,humor:b,sueño_horas:7,submitted:true}; });
 const logs=[]; n[6].forEach((t,k)=>{ if(t) logs.push({date:ds(6-k),activity:'gimnasio',session:'Gimnasio',week:1,rpe:6,mins:60,ua:360}); });
 n[7].forEach(a=>logs.push({date:ds(0),activity:a[0],session:a[0],week:1,rpe:a[1],mins:a[2],ua:a[1]*a[2]}));
 personal[uid]={startDate:ds(10),oneRM:{sentadilla_barra:110,press_plano:80},wellness,history:{_sessionLogs:logs},injuries:i===2?{rodilla:{pain:4,severity:'moderada',type:'lesion',history:[{date:ds(2),pain:4}]}}:{}}; });
const lib=[{id:'lsq',name:'Sentadilla libre',tags:['Empuje MMII','bilateral']},{id:'lpb',name:'Press banca',tags:['Empuje MMSS','bilateral']},{id:'lta',name:'Tirones de arranque',tags:['DLO']},{id:'lpa',name:'Pallof press',tags:['Zona Media','anti-rotación']},{id:'lrm',name:'Remo con barra',tags:['Tracción MMSS','bilateral']},{id:'lrd',name:'Peso muerto rumano',tags:['Tracción MMII','bilateral']},{id:'lmo',name:'Movilidad de cadera 90/90',tags:['Movilidad','Cadera']},{id:'lac',name:'Trote suave',tags:['Estabilidad']}];
const db={users,personal,routines:{r1:routine},teams:{t1:{name:'Handball-EDLP',category:'Liga de Honor',sport:'Handball',memberUids:['u1','u2','u3'],players:['Meier Matias','Rossi Lucas','Perez Juan','Sin Cuenta Jugador'],trainingDays:[]},t2:{name:'Handball-Club B',category:'Juveniles',sport:'Handball',memberUids:['u4','u7'],players:['Gomez Pedro','Ruiz Tomas'],trainingDays:[]}},shared:{library:{library:lib,videos:{}}},pendingAthletes:{}};
localStorage.setItem('__db',JSON.stringify(db)); localStorage.setItem('__testUser',JSON.stringify({uid:'admin1',email:'gonzaloganora@gmail.com'}));
return 'seeded';
})()
