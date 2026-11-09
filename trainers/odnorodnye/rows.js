(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OdnRows=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const palette=['#cdebe8','#eadced','#f8e2b5','#d7eedb','#f5d9d1','#d9e5f4','#e9edc5','#f4d9e5','#d7e8ee','#f1dfc8','#dfdef3','#d5ebe0'];
 function color(index){if(index<palette.length)return palette[index];const hue=Math.round((index*137.508)%360),light=88+(index%3);return `hsl(${hue} 55% ${light}%)`;}
 function accent(index){const value=palette[index];if(!value)return `hsl(${Math.round(index*137.508%360)} 30% 40%)`;return '#'+[1,3,5].map(i=>Math.round(parseInt(value.slice(i,i+2),16)*.58).toString(16).padStart(2,'0')).join('');}
 function background(rows){if(rows.length===1)return color(rows[0].colorIndex);const n=rows.length,stops=rows.flatMap((r,i)=>[`${color(r.colorIndex)} ${i*100/n}%`,`${color(r.colorIndex)} ${(i+1)*100/n}%`]);return `linear-gradient(110deg,${stops.join(',')})`;}
 // Explicit source coordinates only; grouping and syntax are reviewed in data.
 function render(member,start,end,checked){
  const text=member.displayText;if(!checked)return esc(text.slice(start,end));const annotations=[];
  for(const row of member.rows||[])for(const c of row.components)for(const s of c.spans)annotations.push({...s,row});
  const active=annotations.filter(a=>a.start<end&&a.end>start),cuts=[...new Set([start,end,...active.flatMap(a=>[Math.max(start,a.start),Math.min(end,a.end)])])].sort((a,b)=>a-b);let html='';
  for(let i=0;i<cuts.length-1;i++){
   const left=cuts[i],right=cuts[i+1],cover=active.filter(a=>a.start<=left&&a.end>=right),seen=new Map();for(const a of cover)seen.set(a.row.id,a.row);
   const rows=[...seen.values()].sort((a,b)=>a.colorIndex-b.colorIndex),value=esc(text.slice(left,right));
   if(!rows.length){html+=value;continue;}
   const title=rows.map(r=>`Ряд ${r.colorIndex+1}: ${r.label}`).join('; '),refs=rows.map(r=>r.id).join(' ');
   const child=rows.find(r=>r.parentId&&rows.some(p=>p.id===r.parentId)),parent=child&&rows.find(r=>r.id===child.parentId);
   const style=parent?`background:${color(child.colorIndex)};box-shadow:inset 0 -2px ${accent(parent.colorIndex)}`:`background:${background(rows)}`;
   html+=`<mark class="od-row${rows.length>1?' od-overlap':''}${parent?' od-hierarchical':''}" data-row-ids="${esc(refs)}" title="${esc(title)}" style="${style}">${value}</mark>`;
  }
  return html;
 }
 function legend(group){const rows=group.members.flatMap(m=>m.rows||[]);if(!rows.length)return '';
  return `<div class="od-legend" aria-label="Цвета однородных рядов"><span>Ряды:</span> ${rows.map(r=>`<span class="od-key" title="${esc(r.type+': '+r.label)}" aria-label="Ряд ${r.colorIndex+1}: ${esc(r.label)}" style="background:${color(r.colorIndex)}">${r.colorIndex+1}</span>`).join(' ')}${rows.some(r=>r.overlap)?'<span class="od-overlap-note">Подчёркивание — внешний ряд составного члена</span>':''}</div>`;
 }
 function explanation(member){const rows=member.rows||[];if(!rows.length)return '';
  return `<div class="od-row-explanations">${rows.map(r=>`<p><span class="od-key" aria-hidden="true" style="background:${color(r.colorIndex)}">${r.colorIndex+1}</span> <strong>${esc(r.type)}:</strong> ${esc(r.label)}. ${esc(r.explanation)}</p>`).join('')}</div>`;
 }
 return {color,render,legend,explanation};
});
