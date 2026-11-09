(function(root){
 'use strict';
 const STORAGE_KEY='zapyatye-oge:odnorodnye:task2:progress:v1',JOURNAL_KEY='zapyatye-oge:odnorodnye:task2:errors:v1';
 const roles=['subject','predicate'];
 const tokenCache=new Map();
 function wordTokens(text){if(!tokenCache.has(text))tokenCache.set(text,[...text.matchAll(/[\p{L}\p{M}\p{N}]+(?:[-‑‐][\p{L}\p{M}\p{N}]+)*/gu)].map((m,index)=>({index,text:m[0],start:m.index,end:m.index+m[0].length})));return tokenCache.get(text);}
 const emptyState=()=>({version:1,cards:{},errors:[],archivedCards:{},archivedErrors:[]});
 const emptyMember=()=>({main:{selected:{},checked:false}});
 function cardState(state,g){const cs=state.cards[g.id]||={checked:false,retrying:false,activeTool:'subject',members:{}};for(const m of g.members)cs.members[m.id]||=emptyMember();return cs;}
 function selection(member,value){const count=wordTokens(member.displayText).length;return Object.fromEntries(Object.entries(value&&typeof value==='object'&&!Array.isArray(value)?value:{}).filter(([id,role])=>/^\d+$/.test(id)&&Number(id)<count&&roles.includes(role)));}
 function evaluate(member,selected){
  selected=selection(member,selected);const expected=member.mainAnswers,extra=[],missing=[],wrongRole=[],correctWords=[];
  for(const [key,role] of Object.entries(selected)){const index=Number(key);if(!expected[key])extra.push({index,selectedRole:role});else if(expected[key]!==role)wrongRole.push({index,selectedRole:role,expectedRole:expected[key]});else correctWords.push(index);}
  for(const [key,role] of Object.entries(expected))if(!selected[key])missing.push({index:Number(key),expectedRole:role});
  return {extra,missing,wrongRole,correctWords,correct:!extra.length&&!missing.length&&!wrongRole.length};
 }
 function toggle(state,g,memberId,index,role){const cs=cardState(state,g),member=g.members.find(m=>m.id===memberId);if(cs.checked||!member||!roles.includes(role)||!Number.isInteger(index)||!wordTokens(member.displayText)[index])return;const selected=cs.members[memberId].main.selected;if(selected[index]===role)delete selected[index];else selected[index]=role;}
 function hasMistakes(state,g){const cs=cardState(state,g);return cs.retrying||g.members.some(m=>cs.members[m.id].main.checked&&!cs.members[m.id].main.correct);}
 function checkGroup(state,g,now=new Date().toISOString()){
  const cs=cardState(state,g);if(cs.checked)return cs;
  for(const m of g.members){const r=cs.members[m.id].main,diff=evaluate(m,r.selected);Object.assign(r,{checked:true,correct:diff.correct,checkedAt:now});if(!diff.correct)state.errors.push({id:`${now}-${m.id}-main-${state.errors.length}`,groupId:g.id,cardId:m.id,task:2,variantId:g.variantId,sentenceNumber:m.sentenceNumber,exercise:'main',time:now,selected:{...r.selected},expected:{...m.mainAnswers},extra:diff.extra,missing:diff.missing,wrongRole:diff.wrongRole,context:m.originalText,explanation:m.explanation});}
  Object.assign(cs,{checked:true,retrying:false,checkedAt:now});state.lastCompleted={id:g.id,task:2,at:now};return cs;
 }
 function retry(state,g){const cs=cardState(state,g),mistakes=hasMistakes(state,g);for(const m of g.members)cs.members[m.id]=emptyMember();Object.assign(cs,{checked:false,retrying:mistakes});}
 function load(storage,groups){
  const state=emptyState();let raw;try{raw=JSON.parse(storage.getItem(STORAGE_KEY));}catch(_){}if(raw?.version!==1||!raw.cards||Array.isArray(raw.cards)||!Array.isArray(raw.errors))return state;
  if(typeof raw.resetAt==='string')state.resetAt=raw.resetAt;
  const valid=new Set(groups.map(g=>g.id)),members=new Map(groups.flatMap(g=>g.members.map(m=>[m.id,g])));state.archivedCards={...(raw.archivedCards||{})};state.archivedErrors=Array.isArray(raw.archivedErrors)?raw.archivedErrors:[];
  for(const [id,value] of Object.entries(raw.cards))if(!valid.has(id))state.archivedCards[id]=value;
  for(const g of groups){const old=raw.cards[g.id],cs=cardState(state,g);if(!old)continue;cs.activeTool=roles.includes(old.activeTool)?old.activeTool:'subject';for(const m of g.members){const saved=old.members?.[m.id]?.main,r=cs.members[m.id].main;r.selected=selection(m,saved?.selected);r.checked=!!saved?.checked;if(r.checked){r.correct=evaluate(m,r.selected).correct;r.checkedAt=saved.checkedAt;}}cs.checked=g.members.every(m=>cs.members[m.id].main.checked);cs.retrying=!cs.checked&&!!old.retrying;cs.checkedAt=old.checkedAt;}
  for(const e of raw.errors){const group=members.get(e?.cardId);if(group&&e.exercise==='main'&&Array.isArray(e.extra)&&Array.isArray(e.missing)&&Array.isArray(e.wrongRole))state.errors.push({...e,groupId:group.id});else if(e&&!state.archivedErrors.some(a=>a.id===e.id))state.archivedErrors.push(e);}
  if(raw.lastCompleted&&valid.has(raw.lastCompleted.id))state.lastCompleted=raw.lastCompleted;return state;
 }
 function persist(storage,state,groups,{changedGroups=[],completed=false,addedErrors=[],reset=false}={}){
  const merged=reset?state:load(storage,groups);if(reset)merged.resetAt=new Date().toISOString();else if(merged.resetAt===state.resetAt){for(const id of changedGroups)if(state.cards[id])merged.cards[id]=state.cards[id];if(completed)merged.lastCompleted=state.lastCompleted;const ids=new Set(merged.errors.map(e=>e.id));merged.errors.push(...addedErrors.filter(e=>!ids.has(e.id)));}
  storage.setItem(STORAGE_KEY,JSON.stringify(merged));storage.setItem(JOURNAL_KEY,JSON.stringify(merged.errors));return merged;
 }
 const api={STORAGE_KEY,JOURNAL_KEY,roles,wordTokens,emptyState,cardState,evaluate,toggle,hasMistakes,checkGroup,retry,load,persist};
 if(typeof module!=='undefined')module.exports=api;else root.OdnTask2Core=api;
})(typeof globalThis!=='undefined'?globalThis:this);
