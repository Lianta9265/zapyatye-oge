(function(root){
 'use strict';
 const STORAGE_KEY='zapyatye-oge:obstoyatelstva:progress:v1',JOURNAL_KEY='zapyatye-oge:obstoyatelstva:errors:v1';
 const positions=text=>[...text.matchAll(/\((\d+)\)/g)].map(m=>Number(m[1]));
 const tokens=text=>[...text.matchAll(/\((\d+)\)/g)].map(m=>({text:m[0],index:Number(m[1]),offset:m.index,kind:'commas'}));
 const expected=member=>member.commaAnswers;
 function difference(selected,key){const actual=new Set(selected),wanted=new Set(key),extra=[...actual].filter(n=>!wanted.has(n)),missing=[...wanted].filter(n=>!actual.has(n));return {extra,missing,correct:!extra.length&&!missing.length};}
 const answerSets=member=>member.acceptedCommaAnswers||[expected(member)];
 const allowedPositions=member=>[...new Set(answerSets(member).flat())];
 const evaluate=(member,kind,selected)=>answerSets(member).map(key=>difference(selected,key)).sort((a,b)=>(a.extra.length+a.missing.length)-(b.extra.length+b.missing.length))[0];
 const constructionId=c=>`${c.type}:${c.start}:${c.end}`;
 function toggleHighlight(response,member,offset,type){const c=(member.constructions||[]).find(c=>offset>=c.start&&offset<c.end);if(!c)return false;response.highlights||={};const id=constructionId(c);if(type==='erase'||response.highlights[id]===type)delete response.highlights[id];else response.highlights[id]=type;return true;}
 function groupCards(cards){
  const byId=new Map();
  for(const m of cards){const id=m.task===3?m.id:`variant-${m.task}-${m.variantId}`;if(!byId.has(id))byId.set(id,{id,task:m.task,variantId:m.variantId,aliasTasks:[],members:[]});byId.get(id).members.push(m);}
  for(const g of byId.values())g.members.sort((a,b)=>(a.sentenceNumber||0)-(b.sentenceNumber||0));
  return [...byId.values()];
 }
 const emptyState=()=>({version:1,cards:{},errors:[],view:{task:5,filter:'all',search:'',anchors:{},memberAnchors:{}}});
 const emptyMember=()=>({commas:{selected:[],checked:false}});
 function cardState(state,group){const cs=state.cards[group.id]||=( {checked:false,retrying:false,members:{}} );for(const m of group.members)cs.members[m.id]||=emptyMember();return cs;}
 function hasMistakes(state,group){const cs=cardState(state,group);return cs.retrying||(cs.checked&&group.members.some(m=>!cs.members[m.id].commas.correct));}
 function checkGroup(state,group,now=new Date().toISOString()){
  const cs=cardState(state,group);if(cs.checked)return cs;
  for(const m of group.members){const answer=cs.members[m.id].commas,result=evaluate(m,'commas',answer.selected);Object.assign(answer,{checked:true,correct:result.correct,checkedAt:now});
   if(!result.correct)state.errors.push({id:`${now}-${m.id}-${state.errors.length}`,groupId:group.id,cardId:m.id,task:m.task,variantId:m.variantId,sentenceNumber:m.sentenceNumber||null,exercise:'commas',time:now,selected:[...answer.selected],expected:[...m.commaAnswers],extra:result.extra,missing:result.missing,context:m.originalText,correctPunctuation:m.restoredText||m.originalText,explanation:m.explanation});
  }
  Object.assign(cs,{checked:true,checkedAt:now,retrying:false});state.lastCompleted={id:group.id,task:group.task,at:now};return cs;
 }
 function retry(state,group){const cs=cardState(state,group),mistakes=hasMistakes(state,group);for(const m of group.members){const highlights=cs.members[m.id].highlights;cs.members[m.id]=emptyMember();if(highlights)cs.members[m.id].highlights=highlights;}Object.assign(cs,{checked:false,retrying:mistakes});}
 function stats(state,groups){const out={total:groups.length,done:0,mistakes:0,commas:{checked:0,correct:0}};for(const g of groups){const cs=cardState(state,g);if(hasMistakes(state,g))out.mistakes++;if(cs.checked){out.done++;out.commas.checked++;if(g.members.every(m=>cs.members[m.id].commas.correct))out.commas.correct++;}}return out;}
 const practiceOrder=groups=>[5,4,3].flatMap(task=>groups.filter(g=>g.task===task));
 function lastCompleted(state,groups,saved=state.lastCompleted){
  if(saved&&groups.some(g=>g.id===saved.id&&g.task===saved.task))return {...saved};
  let latest=null,time=-1;for(const g of practiceOrder(groups)){const cs=state.cards[g.id];if(!cs?.checked)continue;const next=Date.parse(cs.checkedAt)||0;if(next>=time){time=next;latest={id:g.id,task:g.task,...(cs.checkedAt?{at:cs.checkedAt}:{})};}}return latest;
 }
 function nextUnfinished(state,groups){const order=practiceOrder(groups),last=lastCompleted(state,groups),start=last?order.findIndex(g=>g.id===last.id):-1;for(let n=1;n<=order.length;n++){const g=order[(start+n)%order.length];if(!state.cards[g.id]?.checked)return g;}return null;}
 function load(storage,groups){
  const state=emptyState();let raw;try{raw=JSON.parse(storage.getItem(STORAGE_KEY));}catch(_){return state;}
  if(raw?.version!==1||!raw.cards||typeof raw.cards!=='object'||Array.isArray(raw.cards)||!Array.isArray(raw.errors))return state;
  const memberGroups=new Map(groups.flatMap(g=>g.members.map(m=>[m.id,g])));
  for(const group of groups){const saved=raw.cards[group.id],current=cardState(state,group);if(!saved)continue;let all=true;
   for(const member of group.members){const old=saved.members?.[member.id]?.commas,response=current.members[member.id].commas,allowed=new Set(positions(member.displayText));if(Array.isArray(old?.selected))response.selected=[...new Set(old.selected.filter(n=>Number.isInteger(n)&&allowed.has(n)))];response.checked=!!old?.checked;if(response.checked){response.correct=evaluate(member,'commas',response.selected).correct;if(typeof old.checkedAt==='string')response.checkedAt=old.checkedAt;}all&&=response.checked;}
   for(const member of group.members){const marks=saved.members?.[member.id]?.highlights;if(marks&&typeof marks==='object'){const allowed=new Set((member.constructions||[]).map(constructionId));current.members[member.id].highlights=Object.fromEntries(Object.entries(marks).filter(([id,type])=>allowed.has(id)&&['gerund-phrase','single-gerund','despite'].includes(type)));}}
   current.checked=all;current.retrying=!all&&!!saved.retrying;if(typeof saved.checkedAt==='string')current.checkedAt=saved.checkedAt;
  }
  state.errors=raw.errors.filter(e=>e&&memberGroups.has(e.cardId)&&e.exercise==='commas'&&['extra','missing','selected','expected'].every(k=>Array.isArray(e[k]))).map(e=>({...e,groupId:memberGroups.get(e.cardId).id}));
  if(raw.view&&typeof raw.view==='object'){
   state.view.task=[3,4,5].includes(raw.view.task)?raw.view.task:5;state.view.filter=['all','pending','mistakes'].includes(raw.view.filter)?raw.view.filter:'all';state.view.search=typeof raw.view.search==='string'?raw.view.search:'';
   for(const task of [3,4,5]){const id=raw.view.anchors?.[task],g=groups.find(g=>g.id===id&&g.task===task);if(g)state.view.anchors[task]=id;const mid=raw.view.memberAnchors?.[task];if(memberGroups.get(mid)?.task===task)state.view.memberAnchors[task]=mid;}
  }
  state.alternativeErrorArchive=Array.isArray(raw.alternativeErrorArchive)?raw.alternativeErrorArchive:[];
  state.errors=state.errors.flatMap(e=>{const m=memberGroups.get(e.cardId).members.find(m=>m.id===e.cardId);if(!m.acceptedCommaAnswers)return [e];const diff=evaluate(m,'commas',e.selected);if(diff.correct){state.alternativeErrorArchive.push(e);return [];}return [{...e,extra:diff.extra,missing:diff.missing}];});
  const last=lastCompleted(state,groups,raw.lastCompleted);if(last)state.lastCompleted=last;return state;
 }
 // View-only writes never overwrite answers from a newer tab or a restored history page.
 function persist(storage,state,groups,{changedGroups=[],completed=false,addedErrors=[],reset=false}={}){
  const merged=reset?state:load(storage,groups);
  if(!reset){for(const id of changedGroups)if(state.cards[id])merged.cards[id]=state.cards[id];if(completed)merged.lastCompleted=state.lastCompleted;const ids=new Set(merged.errors.map(e=>e.id));merged.errors.push(...addedErrors.filter(e=>!ids.has(e.id)));merged.view=state.view;}
  storage.setItem(STORAGE_KEY,JSON.stringify(merged));storage.setItem(JOURNAL_KEY,JSON.stringify(merged.errors));return merged;
 }
 const api={STORAGE_KEY,JOURNAL_KEY,positions,tokens,expected,answerSets,allowedPositions,difference,evaluate,constructionId,toggleHighlight,groupCards,emptyState,cardState,hasMistakes,checkGroup,retry,stats,practiceOrder,lastCompleted,nextUnfinished,load,persist};
 if(typeof module!=='undefined')module.exports=api;else root.ObstoyatelstvaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
