(function () {
  'use strict';
  const C = window.OpredeleniyaCore, raw = window.OPREDELENIYA_DATA;
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
  let persistenceAvailable=true;
  function sync() { if(!persistenceAvailable)return; const view=state.view; state=C.load(storage,groups); state.view=view; }
  function save(options={}) {
    if(!persistenceAvailable)return;
    try { state=C.persist(storage,state,groups,options); $('#save-status').textContent = 'Прогресс сохранён'; $('#save-status').classList.remove('storage-error'); }
    catch (_) { persistenceAvailable=false; $('#save-status').textContent = 'Сохранение недоступно — не закрывайте страницу'; $('#save-status').classList.add('storage-error'); }
  }
  function label(member, kind, ids) { return ids.length ? [...ids].sort((a,b)=>a-b).join(', ') : 'нет'; }
  function explanation(member) { return `<p>${esc(member.explanation)}</p>`; }
  const constructions=member=>member.constructions||[];
  function textWithSpans(group,member,response,start,end){return window.OpredeleniyaHighlights.render(member,start,end,C.cardState(state,group).checked);}
  function sentence(group, member) {
    const gs=C.cardState(state,group),response=gs.members[member.id].commas;let html='',cursor=0;
    for(const token of C.tokens(member.displayText)){
      html+=textWithSpans(group,member,gs.members[member.id],cursor,token.offset);const selected=response.selected.includes(token.index),expected=member.commaAnswers.includes(token.index);
      const status=gs.checked?expected?selected?' correct':' missed':selected?' incorrect':'':selected?' selected':'';
      const aria=(member.sentenceNumber?`Предложение ${member.sentenceNumber}, `:'')+`позиция ${token.index}`;
      html+=`<button class="position${status}" data-kind="commas" data-choice="${token.index}" aria-label="${esc(aria)}" aria-pressed="${selected}" ${gs.checked?'disabled':''}>${token.index}</button>${gs.checked && expected ? '<span class="restored-comma" aria-label="запятая">,</span>' : ''}`;cursor=token.offset+token.text.length;
    }return html+textWithSpans(group,member,gs.members[member.id],cursor,member.displayText.length);
  }
  function resultPanel(group, kind) {
    const cs = C.cardState(state, group), allCorrect = group.members.every(m => cs.members[m.id][kind].correct);
    const heading = 'Запятые при обособленных определениях';
    return `<section class="result-panel ${allCorrect ? 'success' : 'has-errors'}" data-result="${kind}" aria-label="${heading}"><div class="result-heading"><h3>${heading}</h3><span class="result-badge">${allCorrect ? 'Верно' : 'Есть ошибки'}</span></div>${group.members.map(member => {
      const response = cs.members[member.id][kind], expected = C.expected(member, kind), diff = C.evaluate(member, kind, response.selected);
      const correct = response.selected.filter(n => !diff.extra.includes(n));
      return `<div class="member-result" data-result-member="${esc(member.id)}">${member.sentenceNumber ? `<h4>Предложение ${member.sentenceNumber}</h4>` : ''}<dl class="answer-lines"><div class="answer-correct"><dt>Верно выбрано</dt><dd>${esc(label(member, kind, correct))}</dd></div><div class="${diff.extra.length ? 'answer-error' : ''}"><dt>Лишнее</dt><dd>${esc(label(member, kind, diff.extra))}</dd></div><div class="${diff.missing.length ? 'answer-missing' : ''}"><dt>Пропущено</dt><dd>${esc(label(member, kind, diff.missing))}</dd></div></dl><p class="expected-answer"><strong>Правильный ответ:</strong> ${expected.length ? esc(label(member, kind, expected)) : kind === 'commas' ? 'запятых при обособленных определениях нет' : 'обособленных определений нет'}.</p><div class="analysis definition-analysis">${explanation(member, kind)}${member.statement ? `<p><strong>Утверждение источника:</strong> ${esc(member.statement)} — ${member.statementTrue ? "верно" : "неверно"}.</p>` : ""}${member.grammarBasis ? `<p><strong>Основа:</strong> ${esc(member.grammarBasis)}</p>` : ""}</div></div>`;
    }).join('')}</section>`;
  }
  function originalRules(group){const m=group.members[0];return m.originalRules?.length?`<details class="analysis original-rules"><summary>Правила и соответствия исходного варианта</summary><ol type="А">${m.originalRules.map((rule,i)=>`<li><strong>${['А','Б','В'][i]}.</strong> ${esc(rule)}</li>`).join('')}</ol><p><strong>Исходный ответ:</strong> ${esc(m.originalAnswer)}.</p></details>`:'';}
  function cardHtml(group) {
    const cs = C.cardState(state, group), exemplar = group.members[0];
    const number = groups.filter(g => g.task === group.task).findIndex(g => g.id === group.id) + 1;
    const selected = kind => group.members.reduce((n, m) => n + cs.members[m.id][kind].selected.length, 0);
    const notes = group.members.flatMap(m => [...(m.reviewNotes || []),...(m.syntaxReviewNotes || [])].map(note => ({ note, member: m })));
    const fullyChecked=C.fullyChecked(cs,group), mistakes = hasMistakes(group), status = cs.checked ? mistakes ? 'Есть ошибки' : fullyChecked ? 'Всё верно' : 'Запятые проверены' : cs.retrying ? 'Повторение' : cs.migratedPartial ? 'Продолжить вариант' : 'К выполнению';
    return `<article class="card task-${group.task}" id="card-${esc(group.id)}" data-card="${esc(group.id)}" aria-labelledby="title-${esc(group.id)}"><header class="card-head"><div class="card-identity"><span class="card-number">${String(number).padStart(2, '0')}</span><div><span class="card-kicker">Задание ${group.task}${group.task === 4 ? ' · 5 предложений' : ''}</span><h3 id="title-${esc(group.id)}">Вариант № ${esc(group.variantId)}</h3></div></div><span class="card-status ${cs.checked ? mistakes ? 'error' : 'success' : ''}">${status}</span></header><div class="card-body"><p class="card-prompt"><span class="amber-dot" aria-hidden="true"></span>Отметь цифры, на месте которых должны стоять запятые при обособленных определениях.</p>${cs.migratedPartial && !cs.checked ? '<p class="partial-note">Прежний выбор сохранён. Проверь весь вариант.</p>' : ''}<div class="source-passages">${group.members.map(member => `<div class="source-block" id="source-${esc(member.id)}" data-member="${esc(member.id)}">${member.sentenceNumber ? `<span class="sentence-number" aria-label="Предложение ${member.sentenceNumber}">${member.sentenceNumber}.</span>` : ''}${member.statement?`<p class="source-statement"><strong>Исходная характеристика:</strong> ${esc(member.statement)}</p>`:''}<p class="sentence">${sentence(group, member)}</p>${member.zeroPositionReason?'<p class="no-positions">В этом предложении нет цифровых позиций. Если запятые при обособленном определении не нужны, нажми «Проверить» без выбора.</p>':''}</div>`).join('')}</div><div class="card-actions"><span class="selection-caption"><span>Цифры <strong data-selected="commas">${selected('commas')}</strong></span></span><button class="button primary check-button" data-action="check" ${fullyChecked ? 'disabled' : ''}>${fullyChecked ? 'Проверено' : 'Проверить'}<span aria-hidden="true">${fullyChecked ? '✓' : '→'}</span></button></div>${cs.checked ? `<div class="feedback" role="status" tabindex="-1"><p class="feedback-legend"><span class="legend-correct">● Верно</span><span class="legend-error">● Лишнее</span><span class="legend-missed">◌ Пропущено</span></p><div class="results-grid">${resultPanel(group, 'commas')}</div>${originalRules(group)}<button class="button secondary retry-button" data-action="retry">Пройти вариант ещё раз <span aria-hidden="true">↻</span></button></div>` : ''}</div><footer class="card-footer"><span>ФИПИ ${esc(exemplar.fipiId || '')}</span><div><a href="${safeUrl(exemplar.officialSourceUrl || exemplar.sourceUrl)}" target="_blank" rel="noopener noreferrer">ФИПИ ↗</a><a href="${safeUrl(exemplar.sourceUrl)}" target="_blank" rel="noopener noreferrer">${'Исходный вариант'} ↗</a></div></footer>${notes.length ? `<details class="review"><summary>Заметки для преподавателя · ${notes.length}</summary>${notes.map(({ note, member }) => `<p>${member.sentenceNumber ? `<strong>Предложение ${member.sentenceNumber}.</strong> ` : ''}${esc(note)}</p>`).join('')}</details>` : ''}</article>`;
  }
  function updateStats() {
    const stats = C.stats(state, groups);
    $('#done-total').textContent = `${stats.done} / ${stats.total}`; $('#progress').max = stats.total; $('#progress').value = stats.done;
    $('#comma-score').textContent = `${stats.commas.correct} / ${stats.commas.checked}`;
    $('#error-count').textContent = state.errors.reduce((n, e) => n + e.extra.length + e.missing.length, 0);
    const next=C.nextUnfinished(state,groups,raw.metadata?.legacyOrder||[]);
    $('#repeat-errors').disabled = !stats.mistakes; $('#resume').disabled = !next;
    $('#resume-label').textContent = next ? 'Продолжить' : 'Все варианты пройдены';
    $('#resume-status').hidden = !!next;
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
    const task = state.view.task;
    document.querySelectorAll('[data-task]').forEach(b => { const active = Number(b.dataset.task) === task; b.classList.toggle('active', active); if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.querySelectorAll('[data-filter]').forEach(b => { const active = b.dataset.filter === state.view.filter; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    $('#section-title').textContent = `Задание ${task}`; $('#section-kicker').textContent = task === 4 ? 'ПУНКТУАЦИОННЫЕ ПРАВИЛА' : task === 5 ? 'ПУНКТУАЦИОННЫЙ АНАЛИЗ' : 'СИНТАКСИЧЕСКИЙ АНАЛИЗ';
    $('#section-description').textContent = task === 4 ? '5 предложений в каждом варианте' : task === 5 ? 'Исходная цифровая нумерация' : 'Исходные запятые заменены цифровыми позициями';
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
    if (button.hasAttribute('data-choice') && !cs.checked) {
      const block = button.closest('[data-member]'), kind = button.dataset.kind, id = Number(button.dataset.choice);
      const response = cs.members[block.dataset.member][kind], index = response.selected.indexOf(id);
      if (index >= 0) response.selected.splice(index, 1); else response.selected.push(id);
      button.classList.toggle('selected', response.selected.includes(id)); button.setAttribute('aria-pressed', String(response.selected.includes(id)));
      const counter = element.querySelector(`[data-selected="${kind}"]`); if(counter) counter.textContent = group.members.reduce((n, m) => n + cs.members[m.id][kind].selected.length, 0);
      state.view.memberAnchors[group.task] = block.dataset.member;
    } else if (button.dataset.action === 'check' && !C.fullyChecked(cs,group)) { C.checkGroup(state, group); replaceCard(group, true); }
    else if (button.dataset.action === 'retry') { C.retry(state, group); replaceCard(group); }
    state.view.anchors[group.task] = group.id; save({changedGroups:[group.id],completed:button.dataset.action==='check',addedErrors:state.errors.slice(errorStart)});
  });
  $('#sections').addEventListener('click', event => {
    const button = event.target.closest('[data-task]'); if (!button) return;
    sync(); state.view.task = Number(button.dataset.task); state.view.filter = 'all'; state.view.search = ''; render(); save();
    if (state.view.anchors[state.view.task]) scrollToAnchor(); else $('#main').scrollIntoView();
  });
  $('.filters').addEventListener('click', event => { const b = event.target.closest('[data-filter]'); if (!b) return; state.view.filter = b.dataset.filter; render(); save(); });
  let searchTimer;
  $('#search').addEventListener('input', event => { const value = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.view.search = value; render(); save(); $('#search').focus(); }, 180); });
  function continuePractice() {
    sync(); render();
    const next = C.nextUnfinished(state, groups, raw.metadata?.legacyOrder||[]);
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
      return `<article class="journal-entry"><div class="journal-entry-heading"><h3>Задание ${group.task} · № ${esc(group.variantId)}${member.sentenceNumber ? ` · предложение ${member.sentenceNumber}` : ''}</h3>${resolved ? '<span class="resolved">Исправлено</span>' : ''}</div><span class="eyebrow">${error.exercise === 'commas' ? 'Запятые при определениях' : 'Определения'}</span><time class="small muted">${esc(new Date(error.time).toLocaleString('ru-RU'))}</time><blockquote>${esc(error.context)}</blockquote><p><strong>Правильная пунктуация:</strong> ${esc(error.correctPunctuation || member.restoredText || member.originalText)}</p>${error.extra.length ? `<p class="journal-error"><strong>Лишнее:</strong> ${esc(label(member, error.exercise, error.extra))}.</p>` : ''}${error.missing.length ? `<p><strong>Пропущено:</strong> ${esc(label(member, error.exercise, error.missing))}.</p>` : ''}<p><strong>Правильный ответ:</strong> ${esc(label(member, error.exercise, error.expected))}.</p><details class="analysis"><summary>Объяснение</summary>${explanation(member, error.exercise)}</details><button class="button secondary" data-retry-card="${esc(group.id)}">${resolved ? 'Открыть вариант' : 'Повторить вариант'}</button></article>`;
    }).join('') : '<div class="empty"><span aria-hidden="true">✓</span><h3>Ошибок нет</h3><p>После проверки здесь появятся пропуски и лишние ответы.</p></div>');
  }
  $('#journal-open').addEventListener('click', () => { sync(); renderJournal(); journal.showModal(); });
  $('#journal-close').addEventListener('click', () => journal.close());
  journal.addEventListener('click', event => { const button = event.target.closest('[data-retry-card]'); if (!button) return; const group = byGroup.get(button.dataset.retryCard); if (group) { sync(); if (hasMistakes(group)){C.retry(state, group);save({changedGroups:[group.id]});} journal.close(); goTo(group); } });
  function repeatErrors() {
    sync(); const mistakes = groups.filter(hasMistakes); if (!mistakes.length) return;
    mistakes.forEach(group => C.retry(state, group)); journal.close(); state.view.task = mistakes[0].task; state.view.filter = 'mistakes'; state.view.search = '';
    state.view.anchors[mistakes[0].task] = mistakes[0].id; delete state.view.memberAnchors[mistakes[0].task]; save({changedGroups:mistakes.map(g=>g.id)}); render(); document.getElementById('card-' + mistakes[0].id)?.scrollIntoView({ block: 'start' });
  }
  $('#retry-all').addEventListener('click', repeatErrors); $('#repeat-errors').addEventListener('click', repeatErrors);
  $('#export-journal').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), errors: state.errors }, null, 2)], { type: 'application/json;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'oge-opredeleniya-errors.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  $('#reset').addEventListener('click', () => $('#reset-dialog').showModal());
  $('#reset-cancel').addEventListener('click', () => $('#reset-dialog').close());
  $('#reset-confirm').addEventListener('click', () => { state = C.emptyState(); save({reset:true}); $('#migration-note').hidden = true; $('#reset-dialog').close(); render(); window.scrollTo(0, 0); });
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); }); window.addEventListener('pagehide', () => save());
  window.addEventListener('storage', event => {if(event.key===C.STORAGE_KEY){const before=JSON.stringify([state.cards,state.errors,state.lastCompleted]);sync();if(before!==JSON.stringify([state.cards,state.errors,state.lastCompleted])){const y=scrollY;render();window.scrollTo(0,y);if(journal.open)renderJournal();}}});
  window.addEventListener('pageshow', event => {if(event.persisted){sync();render();scrollToAnchor();}});
  if(Object.keys(state.archivedCards||{}).length||(state.archivedErrors||[]).length){$('#migration-note').hidden=false;$('#migration-note').textContent='Прежние ответы по запятым сохранены; исключённые карточки и ошибки выделения перенесены в архив.';}
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
