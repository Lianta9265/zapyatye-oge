(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BSPBasisHighlights=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // All ranges come from the editorial data. The renderer never analyses words.
  function render(member,start,end,checked){
    const text=member.displayText;
    if(!checked)return esc(text.slice(start,end));
    const annotations=[];
    for(const pair of member.basisHighlights||[])for(const side of ['left','right'])for(const span of pair[side].spans)annotations.push({...span,side,position:pair.position,label:pair[side].label});
    const active=annotations.filter(a=>a.start<end&&a.end>start),cuts=[...new Set([start,end,...active.flatMap(a=>[Math.max(start,a.start),Math.min(end,a.end)])])].sort((a,b)=>a-b);
    let html='';
    for(let i=0;i<cuts.length-1;i++){
      const left=cuts[i],right=cuts[i+1],cover=active.filter(a=>a.start<=left&&a.end>=right),basis=cover.filter(a=>a.side),value=esc(text.slice(left,right));
      if(basis.length){
        const sides=new Set(basis.map(a=>a.side)),refs=[...new Set(basis.map(a=>`${a.position}:${a.side}`))];
        const title=[...new Set(basis.map(a=>`Позиция ${a.position} — ${a.side==='left'?'левая':'правая'} основа: ${a.label}`))].join('; ');
        html+=`<mark class="bsp-basis bsp-basis-${sides.size===2?'shared':[...sides][0]}" data-basis-refs="${esc(refs.join(' '))}" title="${esc(title)}">${value}</mark>`;
      }else if(cover.some(a=>a.union))html+=`<mark class="bsp-union-highlight">${value}</mark>`;
      else html+=value;
    }
    return html;
  }
  function legend(group){
    if(!group.members.some(m=>m.basisHighlights?.length))return '';
    const shared=group.members.some(m=>{
      const left=(m.basisHighlights||[]).flatMap(p=>p.left.spans),right=(m.basisHighlights||[]).flatMap(p=>p.right.spans);
      return left.some(a=>right.some(b=>a.start<b.end&&b.start<a.end));
    });
    return '<p class="bsp-basis-legend"><span><i class="bsp-basis-key left" aria-hidden="true"></i>Бирюзовый — основа левой части</span><span><i class="bsp-basis-key right" aria-hidden="true"></i>Сливовый — основа правой части</span>'+(shared?'<span><i class="bsp-basis-key shared" aria-hidden="true"></i>Два цвета — основа участвует в обеих парах</span>':'')+'</p>';
  }
  function explanation(member){
    const suffix=b=>b.kind==='one-member'?' (односоставная часть)':b.kind==='incomplete'?' (неполная часть)':'';
    return (member.basisHighlights||[]).map(p=>`<p class="bsp-basis-pair" data-basis-pair="${p.position}"><strong>Позиция ${p.position}:</strong> <span class="bsp-basis-label left">${esc(p.left.label)}${suffix(p.left)}</span> <span aria-label="соединяется с">↔</span> <span class="bsp-basis-label right">${esc(p.right.label)}${suffix(p.right)}</span>.</p>`).join('');
  }
  return {render,legend,explanation};
});
