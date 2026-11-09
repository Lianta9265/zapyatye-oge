(function(root){
 'use strict';
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render(member,start=0,end=member.displayText.length,checked=false){
  const text=member.displayText;if(!checked)return esc(text.slice(start,end));
  const spans=(member.constructions||[]).filter(s=>s.type==='definition'&&s.isolatedBy==='commas').map(s=>({start:Math.max(start,s.start),end:Math.min(end,s.end)})).filter(s=>s.start<s.end).sort((a,b)=>a.start-b.start||b.end-a.end),merged=[];
  for(const s of spans){const last=merged.at(-1);if(last&&s.start<=last.end)last.end=Math.max(last.end,s.end);else merged.push({...s});}
  let out='',cursor=start;for(const s of merged){out+=esc(text.slice(cursor,s.start))+'<mark class="definition-highlight">'+esc(text.slice(s.start,s.end))+'</mark>';cursor=s.end;}return out+esc(text.slice(cursor,end));
 }
 const api={render};if(typeof module!=='undefined')module.exports=api;else root.OpredeleniyaHighlights=api;
})(typeof globalThis!=='undefined'?globalThis:this);
