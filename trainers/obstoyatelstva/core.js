(function(root){
 'use strict';
 const STORAGE_KEY='zapyatye-oge:obstoyatelstva:progress:v1',JOURNAL_KEY='zapyatye-oge:obstoyatelstva:errors:v1';
 const SYNTAX_TYPES=['gerund-phrase','single-gerund','despite'];
 const positions=text=>[...text.matchAll(/\((\d+)\)/g)].map(m=>Number(m[1]));
 const tokens=text=>[...text.matchAll(/\((\d+)\)/g)].map(m=>({text:m[0],index:Number(m[1]),offset:m.index,kind:'commas'}));
 const wordTokens=text=>[...text.matchAll(/[\p{L}\p{M}]+/gu)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
 const expected=member=>member.commaAnswers;
 function difference(selected,key){const actual=new Set(selected),wanted=new Set(key),extra=[...actual].filter(n=>!wanted.has(n)),missing=[...wanted].filter(n=>!actual.has(n));return {extra,missing,correct:!extra.length&&!missing.length};}
 const answerSets=member=>member.acceptedCommaAnswers||[expected(member)];
 const allowedPositions=member=>[...new Set(answerSets(member).flat())];
 function toggleComma(response,member,index,type){
  if(response.checked||!positions(member.displayText).includes(index))return false;
  const at=response.selected.indexOf(index);
  if(at>=0){response.selected.splice(at,1);if(response.colors)delete response.colors[index];}
  else{response.selected.push(index);if(SYNTAX_TYPES.includes(type)){response.colors||={};response.colors[index]=type;}}
  return true;
 }
 const constructionId=c=>`${c.type}:${c.start}:${c.end}`;
 const syntaxExpected=member=>(member.constructions||[]).map(c=>({...c}));
 function normalizeHighlights(member,selected){
  if(!Array.isArray(selected))return [];
  const words=wordTokens(member.displayText),starts=new Set(words.map(w=>w.start)),ends=new Set(words.map(w=>w.end)),seen=new Set();
  return selected.filter(c=>c&&SYNTAX_TYPES.includes(c.type)&&starts.has(c.start)&&ends.has(c.end)&&c.start<c.end).map(c=>({start:c.start,end:c.end,type:c.type})).filter(c=>{const id=constructionId(c);if(seen.has(id))return false;seen.add(id);return true;}).sort((a,b)=>a.start-b.start||a.end-b.end);
 }
 function evaluateSyntax(member,selected){
  const wanted=syntaxExpected(member),actual=normalizeHighlights(member,selected),used=new Set(),correctSelections=[],wrong=[],extra=[],remaining=[];
  // Match exact boundaries before assigning incomplete or overlapping answers.
  for(const answer of actual){const index=wanted.findIndex((c,i)=>!used.has(i)&&c.start===answer.start&&c.end===answer.end);if(index<0){remaining.push(answer);continue;}used.add(index);const target=wanted[index];if(answer.type===target.type)correctSelections.push(answer);else wrong.push({selected:answer,expected:target,reason:'type'});}
  for(const answer of remaining){const index=wanted.findIndex((c,i)=>!used.has(i)&&c.start<answer.end&&c.end>answer.start);if(index<0)extra.push(answer);else{used.add(index);wrong.push({selected:answer,expected:wanted[index],reason:answer.type===wanted[index].type?'boundaries':'type-and-boundaries'});}}
  const missing=wanted.filter((c,i)=>!used.has(i));return {correctSelections,wrong,extra,missing,correct:!wrong.length&&!extra.length&&!missing.length};
 }
 const evaluate=(member,kind,selected)=>kind==='syntax'?evaluateSyntax(member,selected):answerSets(member).map(key=>difference(selected,key)).sort((a,b)=>(a.extra.length+a.missing.length)-(b.extra.length+b.missing.length))[0];
 function selectRange(response,member,start,end,type){
  if(response.syntax?.checked||!SYNTAX_TYPES.includes(type))return false;
  const words=wordTokens(member.displayText),first=words.find(w=>w.start===Math.min(start,end)),last=words.find(w=>w.start===Math.max(start,end));if(!first||!last)return false;
  response.syntax||={selected:[],checked:false};response.syntax.selected=normalizeHighlights(member,response.syntax.selected).filter(c=>c.end<=first.start||c.start>=last.end);response.syntax.selected.push({start:first.start,end:last.end,type});response.syntax.selected.sort((a,b)=>a.start-b.start);return true;
 }
 function toggleHighlight(response,member,offset,type){
  if(response.syntax?.checked)return false;response.syntax||={selected:[],checked:false};const old=response.syntax.selected.find(c=>offset>=c.start&&offset<c.end);
  if(old){if(type==='erase'||old.type===type)response.syntax.selected=response.syntax.selected.filter(c=>c!==old);else if(SYNTAX_TYPES.includes(type))old.type=type;return true;}
  return type!=='erase'&&selectRange(response,member,offset,offset,type);
 }
 function groupCards(cards){const byId=new Map();for(const m of cards){const id=m.task===3?m.id:`variant-${m.task}-${m.variantId}`;if(!byId.has(id))byId.set(id,{id,task:m.task,variantId:m.variantId,aliasTasks:[],members:[]});byId.get(id).members.push(m);}for(const g of byId.values())g.members.sort((a,b)=>(a.sentenceNumber||0)-(b.sentenceNumber||0));return [...byId.values()];}
 const emptyState=()=>({version:1,cards:{},errors:[],view:{task:5,filter:'all',search:'',anchors:{},memberAnchors:{}}});
 const emptyMember=()=>({commas:{selected:[],checked:false},syntax:{selected:[],checked:false}});
 function cardState(state,group){const cs=state.cards[group.id]||={checked:false,retrying:false,members:{}};for(const m of group.members){cs.members[m.id]||=emptyMember();cs.members[m.id].syntax||={selected:[],checked:false};}return cs;}
 const syntaxChecked=(cs,group)=>group.members.every(m=>cs.members[m.id].syntax.checked);
 const fullyChecked=(cs,group)=>cs.checked&&syntaxChecked(cs,group);
 function hasMistakes(state,group){const cs=cardState(state,group);return cs.retrying||group.members.some(m=>['commas','syntax'].some(kind=>cs.members[m.id][kind].checked&&!cs.members[m.id][kind].correct));}
 function checkGroup(state,group,now=new Date().toISOString()){
  const cs=cardState(state,group);if(fullyChecked(cs,group))return cs;
  for(const m of group.members)for(const kind of ['commas','syntax']){
   const answer=cs.members[m.id][kind];if(answer.checked)continue;const result=evaluate(m,kind,answer.selected);Object.assign(answer,{checked:true,correct:result.correct,checkedAt:now});
   if(!result.correct)state.errors.push({id:`${now}-${m.id}-${kind}-${state.errors.length}`,groupId:group.id,cardId:m.id,task:m.task,variantId:m.variantId,sentenceNumber:m.sentenceNumber||null,exercise:kind,time:now,selected:JSON.parse(JSON.stringify(answer.selected)),expected:kind==='commas'?[...m.commaAnswers]:syntaxExpected(m),extra:kind==='syntax'?[...result.extra,...result.wrong.map(w=>w.selected)]:result.extra,missing:result.missing,...(kind==='syntax'?{wrong:result.wrong}:{}),context:m.originalText,correctPunctuation:m.restoredText||m.originalText,explanation:kind==='commas'?m.explanation:'Сравните границы выделенного фрагмента и тип конструкции с синтаксическим разбором. '+(m.constructions.length?m.constructions.map(c=>c.explanation).join(' '):'Обособленных обстоятельств этих трёх типов нет. Придаточная часть с союзом «несмотря на то что» не является оборотом с предлогом «несмотря на».')});
  }
  Object.assign(cs,{checked:true,checkedAt:now,retrying:false});state.lastCompleted={id:group.id,task:group.task,at:now};return cs;
 }
 function retry(state,group){const cs=cardState(state,group),mistakes=hasMistakes(state,group);for(const m of group.members)cs.members[m.id]=emptyMember();Object.assign(cs,{checked:false,retrying:mistakes});}
 function stats(state,groups){const out={total:groups.length,done:0,mistakes:0,commas:{checked:0,correct:0},syntax:{checked:0,correct:0},overall:{checked:0,correct:0}};for(const g of groups){const cs=cardState(state,g);if(hasMistakes(state,g))out.mistakes++;if(cs.checked)out.done++;for(const kind of ['commas','syntax'])if(g.members.every(m=>cs.members[m.id][kind].checked)){out[kind].checked++;if(g.members.every(m=>cs.members[m.id][kind].correct))out[kind].correct++;}if(fullyChecked(cs,g)){out.overall.checked++;if(!hasMistakes(state,g))out.overall.correct++;}}return out;}
 const practiceOrder=groups=>[5,4,3].flatMap(task=>groups.filter(g=>g.task===task));
 function lastCompleted(state,groups,saved=state.lastCompleted){if(saved&&groups.some(g=>g.id===saved.id&&g.task===saved.task))return {...saved};let latest=null,time=-1;for(const g of practiceOrder(groups)){const cs=state.cards[g.id];if(!cs?.checked)continue;const next=Date.parse(cs.checkedAt)||0;if(next>=time){time=next;latest={id:g.id,task:g.task,...(cs.checkedAt?{at:cs.checkedAt}:{})};}}return latest;}
 function nextUnfinished(state,groups){const order=practiceOrder(groups),last=lastCompleted(state,groups),start=last?order.findIndex(g=>g.id===last.id):-1;for(let n=1;n<=order.length;n++){const g=order[(start+n)%order.length];if(!state.cards[g.id]?.checked)return g;}return null;}
 function load(storage,groups){
  const state=emptyState();let raw;try{raw=JSON.parse(storage.getItem(STORAGE_KEY));}catch(_){return state;}
  if(raw?.version!==1||!raw.cards||typeof raw.cards!=='object'||Array.isArray(raw.cards)||!Array.isArray(raw.errors))return state;
  const memberGroups=new Map(groups.flatMap(g=>g.members.map(m=>[m.id,g])));
  for(const group of groups){const saved=raw.cards[group.id],current=cardState(state,group);if(!saved)continue;let all=true;
   for(const member of group.members){const previous=saved.members?.[member.id],old=previous?.commas,response=current.members[member.id].commas,allowed=new Set(positions(member.displayText));if(Array.isArray(old?.selected))response.selected=[...new Set(old.selected.filter(n=>Number.isInteger(n)&&allowed.has(n)))];response.checked=!!old?.checked;if(response.checked){response.correct=evaluate(member,'commas',response.selected).correct;if(typeof old.checkedAt==='string')response.checkedAt=old.checkedAt;}all&&=response.checked;
    if(old?.colors&&typeof old.colors==='object')response.colors=Object.fromEntries(response.selected.filter(n=>SYNTAX_TYPES.includes(old.colors[n])).map(n=>[n,old.colors[n]]));
    const marks=previous?.highlights,syntax=current.members[member.id].syntax;
    if(marks&&typeof marks==='object'){const allowedIds=new Set((member.constructions||[]).map(constructionId));current.members[member.id].highlights=Object.fromEntries(Object.entries(marks).filter(([id,type])=>allowedIds.has(id)&&SYNTAX_TYPES.includes(type)));}
    if(previous?.syntax){syntax.selected=normalizeHighlights(member,previous.syntax.selected);syntax.checked=!!previous.syntax.checked;if(syntax.checked){syntax.correct=evaluateSyntax(member,syntax.selected).correct;if(typeof previous.syntax.checkedAt==='string')syntax.checkedAt=previous.syntax.checkedAt;}}
    else if(marks){syntax.selected=(member.constructions||[]).filter(c=>SYNTAX_TYPES.includes(marks[constructionId(c)])).map(c=>({start:c.start,end:c.end,type:marks[constructionId(c)]}));}
   }
   // Keep old comma-only completions; check their syntax only on an explicit new attempt.
   current.checked=all;current.retrying=!all&&!!saved.retrying;if(typeof saved.checkedAt==='string')current.checkedAt=saved.checkedAt;
  }
  state.errors=raw.errors.filter(e=>e&&memberGroups.has(e.cardId)&&['commas','syntax'].includes(e.exercise)&&['extra','missing','selected','expected'].every(k=>Array.isArray(e[k]))).map(e=>({...e,groupId:memberGroups.get(e.cardId).id}));
  if(raw.view&&typeof raw.view==='object'){state.view.task=[3,4,5].includes(raw.view.task)?raw.view.task:5;state.view.filter=['all','pending','mistakes'].includes(raw.view.filter)?raw.view.filter:'all';state.view.search=typeof raw.view.search==='string'?raw.view.search:'';for(const task of [3,4,5]){const id=raw.view.anchors?.[task],g=groups.find(g=>g.id===id&&g.task===task);if(g)state.view.anchors[task]=id;const mid=raw.view.memberAnchors?.[task];if(memberGroups.get(mid)?.task===task)state.view.memberAnchors[task]=mid;}}
  state.alternativeErrorArchive=Array.isArray(raw.alternativeErrorArchive)?raw.alternativeErrorArchive:[];
  state.errors=state.errors.flatMap(e=>{const m=memberGroups.get(e.cardId).members.find(m=>m.id===e.cardId);if(e.exercise!=='commas'||!m.acceptedCommaAnswers)return [e];const diff=evaluate(m,'commas',e.selected);if(diff.correct){state.alternativeErrorArchive.push(e);return [];}return [{...e,extra:diff.extra,missing:diff.missing}];});
  const last=lastCompleted(state,groups,raw.lastCompleted);if(last)state.lastCompleted=last;return state;
 }
 // View-only writes cannot overwrite newer answers from another tab or a restored history page.
 function persist(storage,state,groups,{changedGroups=[],completed=false,addedErrors=[],reset=false}={}){const merged=reset?state:load(storage,groups);if(!reset){for(const id of changedGroups)if(state.cards[id])merged.cards[id]=state.cards[id];if(completed)merged.lastCompleted=state.lastCompleted;const ids=new Set(merged.errors.map(e=>e.id));merged.errors.push(...addedErrors.filter(e=>!ids.has(e.id)));merged.view=state.view;}storage.setItem(STORAGE_KEY,JSON.stringify(merged));storage.setItem(JOURNAL_KEY,JSON.stringify(merged.errors));return merged;}
 const api={STORAGE_KEY,JOURNAL_KEY,SYNTAX_TYPES,positions,tokens,wordTokens,expected,answerSets,allowedPositions,toggleComma,difference,evaluate,constructionId,syntaxExpected,normalizeHighlights,evaluateSyntax,selectRange,toggleHighlight,groupCards,emptyState,cardState,syntaxChecked,fullyChecked,hasMistakes,checkGroup,retry,stats,practiceOrder,lastCompleted,nextUnfinished,load,persist};
 if(typeof module!=='undefined')module.exports=api;else root.ObstoyatelstvaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
