(function(root){
 'use strict';
 const B=typeof module!=='undefined'?require('./core.js'):root.OdnCore,W=typeof module!=='undefined'?require('./task2-core.js'):root.OdnTask2Core;
 const ROUTE_KEY='zapyatye-oge:odnorodnye:route:v1';
 const split=groups=>[groups.filter(g=>g.task!==2),groups.filter(g=>g.task===2)];
 const part=(state,g)=>g.task===2?state.words:state.comma,core=g=>g.task===2?W:B;
 function wrap(comma,words,view=comma.view,last){const state={comma,words,view,lastCompleted:last};Object.defineProperties(state,{cards:{get:()=>({...comma.cards,...words.cards})},errors:{get:()=>[...comma.errors,...words.errors].sort((a,b)=>a.time.localeCompare(b.time))},archivedCards:{get:()=>({...comma.archivedCards,...words.archivedCards})},archivedErrors:{get:()=>[...comma.archivedErrors,...words.archivedErrors]}});return state;}
 const cardState=(state,g)=>core(g).cardState(part(state,g),g);
 const hasMistakes=(state,g)=>core(g).hasMistakes(part(state,g),g);
 const practiceOrder=groups=>[5,4,2].flatMap(task=>groups.filter(g=>g.task===task));
 function lastCompleted(state,groups){if(state.lastCompleted)return state.lastCompleted;let last=null;for(const g of practiceOrder(groups)){const cs=cardState(state,g);if(cs.checked&&(!last||(cs.checkedAt||'')>=(last.at||'')))last={id:g.id,task:g.task,at:cs.checkedAt};}return last;}
 function nextUnfinished(state,groups){const order=practiceOrder(groups),last=lastCompleted(state,groups),index=last?order.findIndex(g=>g.id===last.id):-1;for(let n=1;n<=order.length;n++){const g=order[(index+n)%order.length];if(!cardState(state,g).checked)return g;}return null;}
 function load(storage,groups){
  const [commaGroups,wordGroups]=split(groups),comma=B.load(storage,commaGroups),words=W.load(storage,wordGroups);let route;try{route=JSON.parse(storage.getItem(ROUTE_KEY));}catch(_){}
  const view={...comma.view,anchors:{...comma.view.anchors},memberAnchors:{...comma.view.memberAnchors}};
  if(route?.version===1&&route.view){const v=route.view;view.task=[5,4,2].includes(v.task)?v.task:5;view.filter=['all','pending','mistakes'].includes(v.filter)?v.filter:'all';view.search=typeof v.search==='string'?v.search:'';for(const t of [5,4,2]){if(groups.some(g=>g.task===t&&g.id===v.anchors?.[t]))view.anchors[t]=v.anchors[t];if(groups.some(g=>g.task===t&&g.members.some(m=>m.id===v.memberAnchors?.[t])))view.memberAnchors[t]=v.memberAnchors[t];}}
  const saved=[comma.lastCompleted,words.lastCompleted,route?.lastCompleted].filter(l=>l&&groups.some(g=>g.id===l.id&&g.task===l.task)).sort((a,b)=>(a.at||'').localeCompare(b.at||''));return wrap(comma,words,view,saved.at(-1));
 }
 function persist(storage,state,groups,options={}){
  const [cg,wg]=split(groups),{changedGroups=[],addedErrors=[],completed=false,reset=false}=options,commaChanged=changedGroups.filter(id=>cg.some(g=>g.id===id)),wordChanged=changedGroups.filter(id=>wg.some(g=>g.id===id));
  let comma=state.comma,words=state.words;
  if(commaChanged.length||(reset&&state.view.task!==2)){
   comma.view={...state.view,task:state.view.task===2?comma.view.task:state.view.task,anchors:Object.fromEntries(Object.entries(state.view.anchors).filter(([t])=>t!=='2')),memberAnchors:Object.fromEntries(Object.entries(state.view.memberAnchors).filter(([t])=>t!=='2'))};
   comma=B.persist(storage,comma,cg,{changedGroups:commaChanged,completed:completed&&state.lastCompleted?.task!==2,addedErrors:addedErrors.filter(e=>e.exercise==='commas'),reset:reset&&state.view.task!==2});
  }
  if(wordChanged.length||(reset&&state.view.task===2))words=W.persist(storage,words,wg,{changedGroups:wordChanged,completed:completed&&state.lastCompleted?.task===2,addedErrors:addedErrors.filter(e=>e.exercise==='main'),reset:reset&&state.view.task===2});
  storage.setItem(ROUTE_KEY,JSON.stringify({version:1,view:state.view,lastCompleted:state.lastCompleted}));return wrap(comma,words,state.view,state.lastCompleted);
 }
 function checkGroup(state,g,now){const result=core(g).checkGroup(part(state,g),g,now);state.lastCompleted=part(state,g).lastCompleted;return result;}
 function stats(state,groups){const out={total:groups.length,done:0,mistakes:0,commas:{checked:0,correct:0},main:{checked:0,correct:0}};for(const g of groups){const cs=cardState(state,g);if(hasMistakes(state,g))out.mistakes++;if(cs.checked){out.done++;const kind=g.task===2?'main':'commas';out[kind].checked++;if(g.members.every(m=>cs.members[m.id][kind].correct))out[kind].correct++;}}return out;}
 function resetScope(state){const task=state.view.task;if(task===2)state.words=W.emptyState();else state.comma=B.emptyState();if((state.lastCompleted?.task===2)===(task===2))state.lastCompleted=undefined;return wrap(state.comma,state.words,state.view,state.lastCompleted);}
 const api={...B,ROUTE_KEY,STORAGE_KEYS:[B.STORAGE_KEY,W.STORAGE_KEY,ROUTE_KEY],emptyState:()=>wrap(B.emptyState(),W.emptyState()),load,persist,cardState,checkGroup,hasMistakes,stats,practiceOrder,lastCompleted,nextUnfinished,resetScope,fullyChecked:cs=>cs.checked,retry:(state,g)=>core(g).retry(part(state,g),g),toggleWord:(state,g,...args)=>W.toggle(state.words,g,...args)};
 if(typeof module!=='undefined')module.exports=api;else root.OdnMixedCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
