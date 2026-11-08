(function () {
  'use strict';
  const C = window.ObstoyatelstvaCore, raw = window.OBSTOYATELSTVA_DATA;
  const members = Array.isArray(raw) ? raw : raw?.cards;
  const $ = selector => document.querySelector(selector);
  if (!C || !Array.isArray(members) || !members.length) { $('#cards').textContent = 'Не удалось загрузить базу. Проверьте, что папка data находится рядом с index.html.'; return; }
  const groups = C.groupCards(members), byGroup = new Map(groups.map(g => [g.id, g]));
  const byMember = new Map(members.map(m => [m.id, m]));
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = { getItem: () => null, setItem: () => { throw new Error('storage unavailable'); } }; }
  let state = C.load(storage, groups);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? esc(url.href) : '#'; } catch (_) { return '#'; } };
  const done = group => C.cardState(state, group).checked;
  const hasMistakes = group => C.hasMistakes(state, group);
  function sync() { const view=state.view; state=C.load(storage,groups); state.view=view; }
  function save(options={}) {
    try { state=C.persist(storage,state,groups,options); $('#save-status').textContent = 'Прогресс сохранён'; $('#save-status').classList.remove('storage-error'); }
    catch (_) { $('#save-status').textContent = 'Сохранение недоступно — не закрывайте страницу'; $('#save-status').classList.add('storage-error'); }
  }
  function label(member, kind, ids) { return ids.length ? [...ids].sort((a,b)=>a-b).join(', ') : 'нет'; }
  function explanation(member) { return `<p>${esc(member.explanation)}</p>`; }
  const syntaxTools={}, pendingSyntax={}, syntaxNames={'gerund-phrase':'Деепричастным оборотом','single-gerund':'Одиночным деепричастием',despite:'С предлогом НЕСМОТРЯ НА'};
  function syntaxToolbar(group){const cs=C.cardState(state,group),locked=C.syntaxChecked(cs,group);return `<section class="syntax-tools" aria-label="Обстоятельство выражено"><h4>Обстоятельство выражено:</h4><div class="syntax-palette" role="group" aria-label="Тип обстоятельства">${Object.entries(syntaxNames).map(([type,name])=>`<button type="button" class="syntax-tool syntax-${type}" data-syntax-tool="${type}" aria-pressed="${syntaxTools[group.id]===type}" ${locked?'disabled':''}>${name}</button>`).join('')}</div><p class="syntax-hint">Нажми на первое и последнее слово. Одно слово — дважды. Повторное нажатие снимает выделение.</p><p class="syntax-status" role="status"></p></section>`;}
  function syntaxAnswer(member){return `<div class="syntax-answer"><strong>Синтаксический разбор:</strong>${member.constructions.length?member.constructions.map(c=>`<p><span class="syntax-label syntax-${c.type}">${syntaxNames[c.type]}</span> ${esc(c.text)}. ${esc(c.explanation)}</p>`).join(''):' Обособленных обстоятельств этих трёх видов нет.'}</div>`;}
  const rangeText=(member,range)=>member.displayText.slice(range.start,range.end);
  function syntaxIssues(member,diff){return `${diff.correctSelections.map(c=>`<li class="answer-correct">Верно: «${esc(rangeText(member,c))}» — ${esc(syntaxNames[c.type])}.</li>`).join('')}${diff.wrong.map(w=>`<li class="answer-error">«${esc(rangeText(member,w.selected))}»: ${w.reason==='type'?'неверный тип':w.reason==='boundaries'?'неверные границы':'неверные границы и тип'}. Выбрано: ${esc(syntaxNames[w.selected.type])}. Правильно: «${esc(w.expected.text)}» — ${esc(syntaxNames[w.expected.type])}. ${esc(w.expected.explanation)}</li>`).join('')}${diff.extra.map(c=>`<li class="answer-error">Лишнее выделение: «${esc(rangeText(member,c))}» — ${esc(syntaxNames[c.type])}. ${esc(member.explanation)}</li>`).join('')}${diff.missing.map(c=>`<li class="answer-missing">Не выделено: «${esc(c.text)}» — ${esc(syntaxNames[c.type])}. ${esc(c.explanation)}</li>`).join('')}`;}
  function syntaxResult(group){const cs=C.cardState(state,group),checked=C.syntaxChecked(cs,group),correct=checked&&group.members.every(m=>cs.members[m.id].syntax.correct);return `<section class="result-panel ${checked?correct?'success':'has-errors':'syntax-pending-result'}" data-result="syntax"><div class="result-heading"><h3>Тип и границы обстоятельства</h3><span class="result-badge">${checked?correct?'Верно':'Есть ошибки':'Ещё не проверено'}</span></div>${group.members.map(m=>{const answer=cs.members[m.id].syntax;if(!answer.checked)return m===group.members.find(member=>!cs.members[member.id].syntax.checked)?`<p>Прежний результат по цифрам сохранён. Выдели конструкции и нажми «Проверить», чтобы выполнить цветное задание.</p>`:'';const diff=C.evaluateSyntax(m,answer.selected);return `<div class="member-result" data-syntax-result-member="${esc(m.id)}">${m.sentenceNumber?`<h4>Предложение ${m.sentenceNumber}</h4>`:''}<ul class="syntax-issues">${syntaxIssues(m,diff)||'<li class="answer-correct">Верно: обособленных обстоятельств этих трёх типов нет.</li>'}</ul><details class="analysis"><summary>Синтаксический разбор</summary>${syntaxAnswer(m)}</details></div>`;}).join('')}</section>`;}
  function syntaxText(member,response,start,end){
    const answer=response.syntax,diff=answer.checked?C.evaluateSyntax(member,answer.selected):null;
    return member.displayText.slice(start,end).replace(/[\p{L}\p{M}]+|[^\p{L}\p{M}]+/gu,(part,relative)=>{if(!/\p{L}/u.test(part))return esc(part);const offset=start+relative,selected=answer.selected.find(c=>offset>=c.start&&offset<c.end),wanted=member.constructions.find(c=>offset>=c.start&&offset<c.end),type=selected?.type,shownType=type||(answer.checked?wanted?.type:null);const result=answer.checked?(selected?diff.correctSelections.some(c=>c.start===selected.start&&c.end===selected.end&&c.type===type)?' syntax-correct':' syntax-incorrect':wanted?' syntax-missed':''):'';return `<span class="syntax-word${type?' marked':''}${shownType?' syntax-'+shownType:''}${result}" data-syntax-offset="${offset}" role="button" tabindex="${answer.checked?'-1':'0'}" aria-disabled="${answer.checked}" aria-label="${esc(part)}${shownType?', '+syntaxNames[shownType]:''}" aria-pressed="${!!type}">${esc(part)}</span>`;});
  }
  function markWord(word){
    const element=word.closest('[data-card]'),group=byGroup.get(element.dataset.card);sync();const member=byMember.get(word.closest('[data-member]').dataset.member),response=C.cardState(state,group).members[member.id],type=syntaxTools[group.id],status=element.querySelector('.syntax-status');if(response.syntax.checked)return;if(!type){status.textContent='Сначала выбери цветной инструмент.';return;}
    const offset=Number(word.dataset.syntaxOffset),pending=pendingSyntax[group.id],old=response.syntax.selected.find(c=>offset>=c.start&&offset<c.end);
    if(pending?.memberId===member.id&&pending.type===type){C.selectRange(response,member,pending.start,offset,type);delete pendingSyntax[group.id];status.textContent='Выделение сохранено.';}
    else if(old){const removing=old.type===type;C.toggleHighlight(response,member,offset,type);delete pendingSyntax[group.id];status.textContent=removing?'Выделение снято.':'Цвет изменён.';}
    else{pendingSyntax[group.id]={memberId:member.id,start:offset,type};element.querySelectorAll('.syntax-start').forEach(el=>el.classList.remove('syntax-start'));word.classList.add('syntax-start');status.textContent='Нажми на последнее слово. Esc — отмена.';return;}
    save({changedGroups:[group.id]});const y=scrollY;element.querySelector(`[data-member="${member.id}"] .sentence`).innerHTML=sentence(group,member);element.querySelector(`[data-member="${member.id}"] [data-syntax-offset="${offset}"]`)?.focus({preventScroll:true});window.scrollTo(0,y);
  }
  $('#cards').addEventListener('click',event=>{const word=event.target.closest('[data-syntax-offset]');if(word)markWord(word);});
  $('#cards').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('[data-syntax-offset]')){event.preventDefault();markWord(event.target);}if(event.key==='Escape'){const card=event.target.closest('[data-card]');if(card){delete pendingSyntax[card.dataset.card];card.querySelectorAll('.syntax-start').forEach(el=>el.classList.remove('syntax-start'));card.querySelector('.syntax-status').textContent='Начало выделения отменено.';}}});
  function sentence(group, member) {
    const gs=C.cardState(state,group),response=gs.members[member.id].commas;let html='',cursor=0;
    for(const token of C.tokens(member.displayText)){
      html+=syntaxText(member,gs.members[member.id],cursor,token.offset);const selected=response.selected.includes(token.index),expected=member.commaAnswers.includes(token.index),allowed=C.allowedPositions(member).includes(token.index);
      const status=gs.checked?selected?allowed?' correct':' incorrect':expected?' missed':'':selected?' selected':'';
      const tone=selected&&C.SYNTAX_TYPES.includes(response.colors?.[token.index])?response.colors[token.index]:'';
      const aria=(member.sentenceNumber?`Предложение ${member.sentenceNumber}, `:'')+`позиция ${token.index}`;
      html+=`<button class="position${status}" data-kind="commas" data-choice="${token.index}" data-tone="${tone}" aria-label="${esc(aria)}" aria-pressed="${selected}" ${gs.checked?'disabled':''}>${token.index}</button>`;cursor=token.offset+token.text.length;
    }return html+syntaxText(member,gs.members[member.id],cursor,member.displayText.length);
  }
  function resultPanel(group, kind) {
    const cs = C.cardState(state, group), allCorrect = group.members.every(m => cs.members[m.id][kind].correct);
    const heading = 'Запятые при обособленных обстоятельствах';
    return `<section class="result-panel ${allCorrect ? 'success' : 'has-errors'}" data-result="${kind}" aria-label="${heading}"><div class="result-heading"><h3>${heading}</h3><span class="result-badge">${allCorrect ? 'Верно' : 'Есть ошибки'}</span></div>${group.members.map(member => {
      const response = cs.members[member.id][kind], expected = C.expected(member, kind), diff = C.evaluate(member, kind, response.selected);
      const correct = response.selected.filter(n => !diff.extra.includes(n));
      return `<div class="member-result" data-result-member="${esc(member.id)}">${member.sentenceNumber ? `<h4>Предложение ${member.sentenceNumber}</h4>` : ''}<dl class="answer-lines"><div class="answer-correct"><dt>Верно выбрано</dt><dd>${esc(label(member, kind, correct))}</dd></div><div class="${diff.extra.length ? 'answer-error' : ''}"><dt>Лишнее</dt><dd>${esc(label(member, kind, diff.extra))}</dd></div><div class="${diff.missing.length ? 'answer-missing' : ''}"><dt>Пропущено</dt><dd>${esc(label(member, kind, diff.missing))}</dd></div></dl><p class="expected-answer"><strong>Правильный ответ:</strong> ${member.acceptedCommaAnswers ? esc(member.acceptedCommaAnswers.map(a=>a.join(', ')).join(' или ')) : expected.length ? esc(label(member, kind, expected)) : kind === 'commas' ? 'запятых при обособленных обстоятельствах нет' : 'вводных конструкций нет'}.</p><details class="analysis"><summary>Объяснение</summary>${explanation(member, kind)}${member.statement ? `<p><strong>Утверждение источника:</strong> ${esc(member.statement)} — ${member.statementTrue ? "верно" : "неверно"}.</p>` : ""}${member.grammarBasis ? `<p><strong>Основа:</strong> ${esc(member.grammarBasis)}</p>` : ""}</details></div>`;
    }).join('')}</section>`;
  }
  function cardHtml(group) {
    const cs = C.cardState(state, group), exemplar = group.members[0];
    const number = groups.filter(g => g.task === group.task).findIndex(g => g.id === group.id) + 1;
    const selected = kind => group.members.reduce((n, m) => n + cs.members[m.id][kind].selected.length, 0);
    const notes = group.members.flatMap(m => (m.reviewNotes || []).map(note => ({ note, member: m })));
    const fullyChecked=C.fullyChecked(cs,group), mistakes = hasMistakes(group), status = cs.checked ? mistakes ? 'Есть ошибки' : fullyChecked ? 'Всё верно' : 'Запятые проверены' : cs.retrying ? 'Повторение' : cs.migratedPartial ? 'Продолжить вариант' : 'К выполнению';
    return `<article class="card task-${group.task}" id="card-${esc(group.id)}" data-card="${esc(group.id)}" aria-labelledby="title-${esc(group.id)}"><header class="card-head"><div class="card-identity"><span class="card-number">${String(number).padStart(2, '0')}</span><div><span class="card-kicker">Задание ${group.task}${group.task === 4 ? ' · 5 предложений' : ''}</span><h3 id="title-${esc(group.id)}">Вариант № ${esc(group.variantId)}</h3></div></div><span class="card-status ${cs.checked ? mistakes ? 'error' : 'success' : ''}">${status}</span></header><div class="card-body"><p class="card-prompt"><span class="amber-dot" aria-hidden="true"></span>Отметь цифры, на месте которых должны стоять запятые при обособленных обстоятельствах</p>${cs.migratedPartial && !cs.checked ? '<p class="partial-note">Прежний выбор сохранён. Проверь весь вариант.</p>' : ''}${syntaxToolbar(group)}<div class="source-passages">${group.members.map(member => `<div class="source-block" id="source-${esc(member.id)}" data-member="${esc(member.id)}">${member.sentenceNumber ? `<span class="sentence-number" aria-label="Предложение ${member.sentenceNumber}">${member.sentenceNumber}.</span>` : ''}<p class="sentence">${sentence(group, member)}</p></div>`).join('')}</div><div class="card-actions"><span class="selection-caption"><span>Цифры <strong data-selected="commas">${selected('commas')}</strong></span></span><button class="button primary check-button" data-action="check" ${fullyChecked ? 'disabled' : ''}>${fullyChecked ? 'Проверено' : 'Проверить'}<span aria-hidden="true">${fullyChecked ? '✓' : '→'}</span></button></div>${cs.checked ? `<div class="feedback" role="status" tabindex="-1"><p class="feedback-legend"><span class="legend-correct">● Верно</span><span class="legend-error">● Лишнее</span><span class="legend-missed">◌ Пропущено</span></p><div class="results-grid">${resultPanel(group, 'commas')}${syntaxResult(group)}</div><button class="button secondary retry-button" data-action="retry">Пройти вариант ещё раз <span aria-hidden="true">↻</span></button></div>` : ''}</div><footer class="card-footer"><span>ФИПИ ${esc(exemplar.fipiId || '')}</span><div><a href="${safeUrl(exemplar.officialSourceUrl || exemplar.sourceUrl)}" target="_blank" rel="noopener noreferrer">ФИПИ ↗</a><a href="${safeUrl(exemplar.sourceUrl)}" target="_blank" rel="noopener noreferrer">${'Исходный вариант'} ↗</a></div></footer>${notes.length ? `<details class="review"><summary>Заметки для преподавателя · ${notes.length}</summary>${notes.map(({ note, member }) => `<p>${member.sentenceNumber ? `<strong>Предложение ${member.sentenceNumber}.</strong> ` : ''}${esc(note)}</p>`).join('')}</details>` : ''}</article>`;
  }
  function updateStats() {
    const stats = C.stats(state, groups);
    $('#done-total').textContent = `${stats.done} / ${stats.total}`; $('#progress').max = stats.total; $('#progress').value = stats.done;
    $('#comma-score').textContent = `${stats.commas.correct} / ${stats.commas.checked}`; $('#syntax-score').textContent = `${stats.syntax.correct} / ${stats.syntax.checked}`; $('#overall-score').textContent = `${stats.overall.correct} / ${stats.overall.checked}`;
    $('#error-count').textContent = state.errors.reduce((n, e) => n + e.extra.length + e.missing.length, 0);
    $('#repeat-errors').disabled = !stats.mistakes; $('#resume').disabled = stats.done === stats.total;
    $('#resume-label').textContent = stats.done === stats.total ? 'Все варианты пройдены' : 'Продолжить';
    $('#resume-status').hidden = stats.done !== stats.total;
    for (const task of [3, 4, 5]) $('#count-' + task).textContent = groups.filter(g => g.task === task || g.aliasTasks.includes(task)).length;
  }
  function visibleGroups() {
    const q = state.view.search.toLocaleLowerCase('ru');
    return groups.filter(g => (g.task === state.view.task || g.aliasTasks.includes(state.view.task)) && (state.view.filter !== 'pending' || !done(g)) && (state.view.filter !== 'mistakes' || hasMistakes(g)) && (!q || `${g.variantId} ${g.members.map(m => m.sourceText + ' ' + m.fipiId).join(' ')}`.toLocaleLowerCase('ru').includes(q)));
  }
  let observer, anchorTimer, observerGeneration=0;
  function observeSources() {
    for (const group of groups.filter(g => g.aliasTasks.length)) {
      const element = document.getElementById('card-' + group.id);
      if (!element) continue;
      element.querySelector('.card-kicker').textContent = `Задания ${[group.task,...group.aliasTasks].sort().join(' и ')} · общая карточка`;
      const footer = element.querySelector('.card-footer>div');
      if (footer && !footer.dataset.sourcesAdded) {
        const used = new Set([...footer.querySelectorAll('a')].map(a=>a.getAttribute('href')));
        for (const source of group.members.flatMap(m=>m.sources || [])) {
          if (!source.url || used.has(source.url)) continue;
          used.add(source.url);
          footer.insertAdjacentHTML('beforeend', `<a href="${safeUrl(source.url)}" target="_blank" rel="noopener noreferrer">Задание ${esc(source.task)} · № ${esc(source.variantId)} ↗</a>`);
        }
        footer.dataset.sourcesAdded='true';
      }
    }
    observer?.disconnect(); const generation=++observerGeneration, observedTask=state.view.task;
    if (!window.IntersectionObserver) return;
    const controlHeight = Math.ceil($('.control-shell').getBoundingClientRect().height + 8);
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting && generation===observerGeneration && observedTask===state.view.task && entry.target.isConnected) {
        const groupId = entry.target.closest('[data-card]').dataset.card;
        state.view.anchors[state.view.task] = groupId; state.view.memberAnchors[state.view.task] = entry.target.dataset.member;
        clearTimeout(anchorTimer); anchorTimer = setTimeout(() => save(), 350);
      }
    }, { rootMargin: `-${controlHeight}px 0px -10% 0px`, threshold: 0 });
    document.querySelectorAll('[data-member]').forEach(el => observer.observe(el));
  }
  function render() {
    for(const id of Object.keys(pendingSyntax))delete pendingSyntax[id];
    const task = state.view.task;
    document.querySelectorAll('[data-task]').forEach(b => { const active = Number(b.dataset.task) === task; b.classList.toggle('active', active); if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.querySelectorAll('[data-filter]').forEach(b => { const active = b.dataset.filter === state.view.filter; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    $('#section-title').textContent = `Задание ${task}`; $('#section-kicker').textContent = task === 5 ? 'ПУНКТУАЦИОННЫЙ АНАЛИЗ' : task === 4 ? 'ПУНКТУАЦИОННЫЕ ПРАВИЛА' : 'СИНТАКСИЧЕСКИЙ АНАЛИЗ';
    $('#section-description').textContent = task === 5 ? 'Исходная нумерация позиций сохранена' : task === 4 ? '5 предложений в каждом варианте' : 'Исходные запятые заменены цифровыми позициями';
    $('#search').value = state.view.search;
    const shown = visibleGroups(); $('#feed-count').textContent = `Карточек: ${shown.length} из ${groups.filter(g => g.task === task || g.aliasTasks.includes(task)).length}`;
    $('#cards').innerHTML = shown.length ? shown.map(cardHtml).join('') : '<div class="empty"><span aria-hidden="true">∅</span><h3>Подходящих вариантов нет</h3><p>Измени фильтр или очисти поиск.</p></div>';
    updateStats(); observeSources();
  }
  function replaceCard(group, focus = false) {
    const element = document.getElementById('card-' + group.id), y = window.scrollY;
    if (!element) return;
    element.outerHTML = cardHtml(group); updateStats(); observeSources();
    if (focus) document.getElementById('card-' + group.id).querySelector('.feedback')?.focus({ preventScroll: true });
    else document.getElementById('card-' + group.id).querySelector('[data-action="check"]')?.focus({ preventScroll: true });
    window.scrollTo(0, y);
  }
  function scrollToAnchor() {
    const source = state.view.memberAnchors[state.view.task], anchor = state.view.anchors[state.view.task];
    const target = (source && document.getElementById('source-' + source)) || (anchor && document.getElementById('card-' + anchor));
    target?.scrollIntoView({ block: 'start' });
  }
  function goTo(group, smooth = false) {
    state.view.task = group.task; state.view.filter = 'all'; state.view.search = ''; state.view.anchors[group.task] = group.id;
    delete state.view.memberAnchors[group.task]; render(); save();
    const scroll = () => document.getElementById('card-' + group.id)?.scrollIntoView({ block: 'start', behavior: smooth && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    if (smooth) requestAnimationFrame(scroll); else scroll();
  }
  $('#cards').addEventListener('click', event => {
    const button = event.target.closest('button'), element = button?.closest('[data-card]'); if (!element) return;
    sync(); const group = byGroup.get(element.dataset.card), cs = C.cardState(state, group), errorStart=state.errors.length;
    if(button.dataset.syntaxTool){syntaxTools[group.id]=button.dataset.syntaxTool;delete pendingSyntax[group.id];element.querySelectorAll('.syntax-start').forEach(el=>el.classList.remove('syntax-start'));element.querySelectorAll('[data-syntax-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));element.querySelector('.syntax-status').textContent='Нажми на первое и последнее слово конструкции.';return;}
    if (button.hasAttribute('data-choice') && (!cs.checked || button.dataset.kind === 'words')) {
      const block = button.closest('[data-member]'), kind = button.dataset.kind, id = Number(button.dataset.choice);
      const response = cs.members[block.dataset.member][kind];
      C.toggleComma(response,byMember.get(block.dataset.member),id,syntaxTools[group.id]);
      button.dataset.tone=response.selected.includes(id)?response.colors?.[id]||'':'';
      button.classList.toggle('selected', response.selected.includes(id)); button.setAttribute('aria-pressed', String(response.selected.includes(id)));
      const counter = element.querySelector(`[data-selected="${kind}"]`); if(counter) counter.textContent = group.members.reduce((n, m) => n + cs.members[m.id][kind].selected.length, 0);
      state.view.memberAnchors[group.task] = block.dataset.member;
    } else if (button.dataset.action === 'check' && !C.fullyChecked(cs,group)) { const pending=pendingSyntax[group.id];if(pending){const m=byMember.get(pending.memberId);C.selectRange(cs.members[m.id],m,pending.start,pending.start,pending.type);delete pendingSyntax[group.id];} C.checkGroup(state, group); replaceCard(group, true); }
    else if (button.dataset.action === 'retry') { delete pendingSyntax[group.id]; C.retry(state, group); replaceCard(group); }
    state.view.anchors[group.task] = group.id; save({changedGroups:[group.id],completed:button.dataset.action==='check',addedErrors:state.errors.slice(errorStart)});
  });
  $('#sections').addEventListener('click', event => {
    const button = event.target.closest('[data-task]'); if (!button) return;
    sync();
    state.view.task = Number(button.dataset.task); state.view.filter = 'all'; state.view.search = ''; render(); save();
    if (state.view.anchors[state.view.task]) scrollToAnchor(); else $('#main').scrollIntoView();
  });
  $('.filters').addEventListener('click', event => { const b = event.target.closest('[data-filter]'); if (!b) return; state.view.filter = b.dataset.filter; render(); save(); });
  let searchTimer;
  $('#search').addEventListener('input', event => { const value = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.view.search = value; render(); save(); $('#search').focus(); }, 180); });
  function continuePractice() {
    sync(); render();
    const next = C.nextUnfinished(state, groups);
    if (next) goTo(next, true); else { $('#resume-status').hidden = false; $('#resume-status').focus({ preventScroll: true }); }
  }
  $('#resume').addEventListener('click', continuePractice);
  $('#back-top').addEventListener('click', () => $('#main').scrollIntoView());
  const journal = $('#journal');
  function renderJournal() {
    $('#retry-all').disabled = !groups.some(hasMistakes); $('#export-journal').disabled = !state.errors.length;
    $('#journal-list').innerHTML = (state.errors.length ? [...state.errors].reverse().map(error => {
      const member = byMember.get(error.cardId), group = byGroup.get(error.groupId); if (!member || !group) return '';
      const cs = C.cardState(state, group), resolved = cs.members[member.id][error.exercise]?.checked && cs.members[member.id][error.exercise].correct;
      if(error.exercise==='syntax')return `<article class="journal-entry"><div class="journal-entry-heading"><h3>Задание ${group.task} · № ${esc(group.variantId)}${member.sentenceNumber?' · предложение '+member.sentenceNumber:''}</h3>${resolved?'<span class="resolved">Исправлено</span>':''}</div><span class="eyebrow">Тип и границы обстоятельства</span><time class="small muted">${esc(new Date(error.time).toLocaleString('ru-RU'))}</time><blockquote>${esc(error.context)}</blockquote><ul class="syntax-issues">${syntaxIssues(member,C.evaluateSyntax(member,error.selected))}</ul><details class="analysis"><summary>Объяснение</summary>${syntaxAnswer(member)}</details><button class="button secondary" data-retry-card="${esc(group.id)}">${resolved?'Открыть вариант':'Повторить вариант'}</button></article>`;
      return `<article class="journal-entry"><div class="journal-entry-heading"><h3>Задание ${group.task} · № ${esc(group.variantId)}${member.sentenceNumber ? ` · предложение ${member.sentenceNumber}` : ''}</h3>${resolved ? '<span class="resolved">Исправлено</span>' : ''}</div><span class="eyebrow">${error.exercise === 'commas' ? 'Запятые при обстоятельствах' : 'Вводные конструкции'}</span><time class="small muted">${esc(new Date(error.time).toLocaleString('ru-RU'))}</time><blockquote>${esc(error.context)}</blockquote><p><strong>Правильная пунктуация:</strong> ${esc(error.correctPunctuation || member.restoredText || member.originalText)}</p>${error.extra.length ? `<p class="journal-error"><strong>Лишнее:</strong> ${esc(label(member, error.exercise, error.extra))}.</p>` : ''}${error.missing.length ? `<p><strong>Пропущено:</strong> ${esc(label(member, error.exercise, error.missing))}.</p>` : ''}<p><strong>Правильный ответ:</strong> ${esc(label(member, error.exercise, error.expected))}.</p><details class="analysis"><summary>Объяснение</summary>${explanation(member, error.exercise)}</details><button class="button secondary" data-retry-card="${esc(group.id)}">${resolved ? 'Открыть вариант' : 'Повторить вариант'}</button></article>`;
    }).join('') : '<div class="empty"><span aria-hidden="true">✓</span><h3>Ошибок нет</h3><p>После проверки здесь появятся пропуски и лишние ответы.</p></div>');
  }
  $('#journal-open').addEventListener('click', () => { sync(); renderJournal(); journal.showModal(); });
  $('#journal-close').addEventListener('click', () => journal.close());
  journal.addEventListener('click', event => { const button = event.target.closest('[data-retry-card]'); if (!button) return; const group = byGroup.get(button.dataset.retryCard); if (group) { sync(); if (hasMistakes(group)){ C.retry(state, group);save({changedGroups:[group.id]});} journal.close(); goTo(group); } });
  function repeatErrors() {
    sync(); const mistakes = groups.filter(hasMistakes); if (!mistakes.length) return;
    mistakes.forEach(group => C.retry(state, group)); journal.close(); state.view.task = mistakes[0].task; state.view.filter = 'mistakes'; state.view.search = '';
    state.view.anchors[mistakes[0].task] = mistakes[0].id; delete state.view.memberAnchors[mistakes[0].task]; save({changedGroups:mistakes.map(g=>g.id)}); render(); document.getElementById('card-' + mistakes[0].id)?.scrollIntoView({ block: 'start' });
  }
  $('#retry-all').addEventListener('click', repeatErrors); $('#repeat-errors').addEventListener('click', repeatErrors);
  $('#export-journal').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), errors: state.errors }, null, 2)], { type: 'application/json;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'oge-obstoyatelstva-errors.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  $('#reset').addEventListener('click', () => $('#reset-dialog').showModal());
  $('#reset-cancel').addEventListener('click', () => $('#reset-dialog').close());
  $('#reset-confirm').addEventListener('click', () => { state = C.emptyState(); save({reset:true}); $('#migration-note').hidden = true; $('#reset-dialog').close(); render(); window.scrollTo(0, 0); });
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); }); window.addEventListener('pagehide', () => save());
  window.addEventListener('storage', event => { if(event.key===C.STORAGE_KEY){const before=JSON.stringify([state.cards,state.errors,state.lastCompleted]);sync();if(before!==JSON.stringify([state.cards,state.errors,state.lastCompleted])){const y=scrollY;render();window.scrollTo(0,y);if(journal.open)renderJournal();}} });
  window.addEventListener('pageshow', event => {if(event.persisted){sync();render();scrollToAnchor();}});
  render();
  if (window.ResizeObserver) {
    const controls = $('.control-shell');
    let previousHeight;
    const measure = () => {
      const height = Math.ceil(controls.getBoundingClientRect().height + 18);
      if (height === previousHeight) return;
      previousHeight = height; document.documentElement.style.setProperty('--trainer-controls-height', `${height}px`); observeSources();
    };
    new ResizeObserver(measure).observe(controls); measure();
  }
  const continueRequested = new URL(window.location?.href || 'http://localhost/').searchParams.get('continue') === '1';
  save(); requestAnimationFrame(continueRequested ? continuePractice : scrollToAnchor);
})();
