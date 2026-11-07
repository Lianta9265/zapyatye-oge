(function () {
  'use strict';
  const C = window.TrainerCore, raw = window.TRAINER_DATA;
  const members = Array.isArray(raw) ? raw : raw?.cards;
  const $ = selector => document.querySelector(selector);
  if (!C || !Array.isArray(members) || !members.length) { $('#cards').textContent = 'Не удалось загрузить базу. Проверьте, что папка data находится рядом с index.html.'; return; }
  const groups = C.groupCards(members), byGroup = new Map(groups.map(g => [g.id, g]));
  const byMember = new Map(members.map(m => [m.id, m]));
  let storage;
  try { storage = window.localStorage; } catch (_) { storage = { getItem: () => null, setItem: () => { throw new Error('storage unavailable'); } }; }
  let hadV2 = false, hadWordRules = false;
  try { const saved = JSON.parse(storage.getItem(C.STORAGE_KEY)); hadV2 = saved?.version === 2; hadWordRules = saved?.wordRulesVersion === C.WORD_RULES_VERSION; } catch (_) { /* legacy load remains available */ }
  let state = C.load(storage, groups);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? esc(url.href) : '#'; } catch (_) { return '#'; } };
  const done = group => C.cardState(state, group).checked;
  const hasMistakes = group => C.hasMistakes(state, group);
  function save() {
    try { storage.setItem(C.STORAGE_KEY, JSON.stringify(state)); $('#save-status').textContent = 'Прогресс сохранён'; $('#save-status').classList.remove('storage-error'); }
    catch (_) { $('#save-status').textContent = 'Сохранение недоступно — не закрывайте страницу'; $('#save-status').classList.add('storage-error'); }
  }
  function label(member, kind, ids) {
    if (!ids.length) return 'нет';
    const sorted = [...ids].sort((a, b) => a - b);
    if (kind === 'commas') return sorted.join(', ');
    const tokens = C.words(member.displayText);
    return sorted.map(id => `${tokens[id]?.text || '?'} (слово ${id + 1})`).join(', ');
  }
  function explanation(member, kind) {
    if (kind === 'commas') return `<p>${esc(member.explanation)}</p>${member.commaComments?.length ? '<ul>' + member.commaComments.map(c => `<li><strong>${esc(c.position)}</strong> — ${esc(c.explanation)}</li>`).join('') + '</ul>' : ''}`;
    if (!member.connectives.length) return '<p>Подчинительных союзов и союзных слов здесь нет. Сочинительные союзы, частицы и слова, не связывающие придаточную часть с главной, не отмечаются.</p>';
    return '<ul>' + member.connectives.map(c => `<li><strong>${esc(c.text)}</strong> — ${c.kind === 'relative' ? 'союзное слово' : 'подчинительный союз'}. ${esc(c.explanation)}</li>`).join('') + '</ul>' + optionalHint(member);
  }
  function optionalHint(member) {
    const options = C.optionalPrepositions(member);
    if (!options.length) return '';
    return `<p class="optional-hint">Допустимо выделить только союзное слово или сочетание ${options.map(b => `«${esc(b.phrase)}»`).join(', ')}. Слова относящегося к нему предлога необязательны.</p>`;
  }
  function sentence(group, member) {
    const gs = C.cardState(state, group), responses = gs.members[member.id];
    const optional = new Set(C.acceptedOptionalWords(member, responses.words.selected));
    let html = '', cursor = 0;
    for (const token of C.tokens(member.displayText)) {
      html += esc(member.displayText.slice(cursor, token.offset));
      const selected = responses[token.kind].selected.includes(token.index), expected = C.expected(member, token.kind).includes(token.index) || (token.kind === 'words' && optional.has(token.index));
      const status = gs.checked ? expected ? selected ? ' correct' : ' missed' : selected ? ' incorrect' : '' : selected ? ' selected' : '';
      const aria = `${member.task === 4 ? `Предложение ${member.sentenceNumber}, ` : ''}${token.kind === 'commas' ? 'позиция ' + token.index : token.text + ', слово ' + (token.index + 1)}`;
      html += `<button class="${token.kind === 'commas' ? 'position' : 'word'}${status}" data-kind="${token.kind}" data-choice="${token.index}" aria-label="${esc(aria)}" aria-pressed="${selected}" ${gs.checked ? 'disabled' : ''}>${token.kind === 'commas' ? token.index : esc(token.text)}</button>`;
      cursor = token.offset + token.text.length;
    }
    return html + esc(member.displayText.slice(cursor));
  }
  function resultPanel(group, kind) {
    const cs = C.cardState(state, group), allCorrect = group.members.every(m => cs.members[m.id][kind].correct);
    const heading = kind === 'commas' ? 'Запятые СПП' : 'Союзы и союзные слова';
    return `<section class="result-panel ${allCorrect ? 'success' : 'has-errors'}" data-result="${kind}" aria-label="${heading}"><div class="result-heading"><h3>${heading}</h3><span class="result-badge">${allCorrect ? 'Верно' : 'Есть ошибки'}</span></div>${group.members.map(member => {
      const response = cs.members[member.id][kind], expected = C.expected(member, kind), diff = C.evaluate(member, kind, response.selected);
      const correct = response.selected.filter(n => !diff.extra.includes(n));
      return `<div class="member-result" data-result-member="${esc(member.id)}">${group.task === 4 ? `<h4>Предложение ${member.sentenceNumber}</h4>` : ''}<dl class="answer-lines"><div class="answer-correct"><dt>Верно выбрано</dt><dd>${esc(label(member, kind, correct))}</dd></div><div class="${diff.extra.length ? 'answer-error' : ''}"><dt>Лишнее</dt><dd>${esc(label(member, kind, diff.extra))}</dd></div><div class="${diff.missing.length ? 'answer-missing' : ''}"><dt>Пропущено</dt><dd>${esc(label(member, kind, diff.missing))}</dd></div></dl><p class="expected-answer"><strong>Правильный ответ:</strong> ${expected.length ? esc(label(member, kind, expected)) : kind === 'commas' ? 'запятых СПП нет' : 'средств подчинительной связи нет'}.</p><details class="analysis"><summary>Объяснение</summary>${explanation(member, kind)}</details></div>`;
    }).join('')}</section>`;
  }
  function cardHtml(group) {
    const cs = C.cardState(state, group), exemplar = group.members[0];
    const number = groups.filter(g => g.task === group.task).findIndex(g => g.id === group.id) + 1;
    const selected = kind => group.members.reduce((n, m) => n + cs.members[m.id][kind].selected.length, 0);
    const notes = group.members.flatMap(m => (m.reviewNotes || []).map(note => ({ note, member: m })));
    const mistakes = hasMistakes(group), status = cs.checked ? mistakes ? 'Есть ошибки' : 'Всё верно' : cs.retrying ? 'Повторение' : cs.migratedPartial ? 'Продолжить вариант' : 'К выполнению';
    return `<article class="card task-${group.task}" id="card-${esc(group.id)}" data-card="${esc(group.id)}" aria-labelledby="title-${esc(group.id)}"><header class="card-head"><div class="card-identity"><span class="card-number">${String(number).padStart(2, '0')}</span><div><span class="card-kicker">Задание ${group.task}${group.task === 4 ? ' · 5 предложений' : ''}</span><h3 id="title-${esc(group.id)}">Вариант № ${esc(group.variantId)}</h3></div></div><span class="card-status ${cs.checked ? mistakes ? 'error' : 'success' : ''}">${status}</span></header><div class="card-body"><p class="card-prompt"><span class="teal-dot" aria-hidden="true"></span>Выдели союзы и союзные слова <span class="prompt-plus" aria-hidden="true">+</span><span class="amber-dot" aria-hidden="true"></span>Отметь запятые СПП</p>${cs.migratedPartial && !cs.checked ? '<p class="partial-note">Прежний выбор сохранён. Заверши оба действия и проверь весь вариант.</p>' : ''}<div class="source-passages">${group.members.map(member => `<div class="source-block" id="source-${esc(member.id)}" data-member="${esc(member.id)}">${group.task === 4 ? `<span class="sentence-number" aria-label="Предложение ${member.sentenceNumber}">${member.sentenceNumber}.</span>` : ''}<p class="sentence">${sentence(group, member)}</p></div>`).join('')}</div><div class="card-actions"><span class="selection-caption"><span>Цифры <strong data-selected="commas">${selected('commas')}</strong></span><span>Слова <strong data-selected="words">${selected('words')}</strong></span></span><button class="button primary check-button" data-action="check" ${cs.checked ? 'disabled' : ''}>${cs.checked ? 'Проверено' : 'Проверить'}<span aria-hidden="true">${cs.checked ? '✓' : '→'}</span></button></div>${cs.checked ? `<div class="feedback" role="status" tabindex="-1"><p class="feedback-legend"><span class="legend-correct">● Верно</span><span class="legend-error">● Лишнее</span><span class="legend-missed">◌ Пропущено</span></p><div class="results-grid">${resultPanel(group, 'commas')}${resultPanel(group, 'words')}</div><button class="button secondary retry-button" data-action="retry">Пройти вариант ещё раз <span aria-hidden="true">↻</span></button></div>` : ''}</div><footer class="card-footer"><span>ФИПИ ${esc(exemplar.fipiId || '')}</span><div><a href="${safeUrl(exemplar.officialSourceUrl || exemplar.sourceUrl)}" target="_blank" rel="noopener noreferrer">ФИПИ ↗</a><a href="${safeUrl(exemplar.sourceUrl)}" target="_blank" rel="noopener noreferrer">${group.task === 5 ? 'Ключ' : 'Исходный вариант'} ↗</a></div></footer>${notes.length ? `<details class="review"><summary>Заметки для преподавателя · ${notes.length}</summary>${notes.map(({ note, member }) => `<p>${group.task === 4 ? `<strong>Предложение ${member.sentenceNumber}.</strong> ` : ''}${esc(note)}</p>`).join('')}</details>` : ''}</article>`;
  }
  function updateStats() {
    const stats = C.stats(state, groups);
    $('#done-total').textContent = `${stats.done} / ${stats.total}`; $('#progress').max = stats.total; $('#progress').value = stats.done;
    $('#comma-score').textContent = `${stats.commas.correct} / ${stats.commas.checked}`; $('#word-score').textContent = `${stats.words.correct} / ${stats.words.checked}`;
    $('#error-count').textContent = state.errors.reduce((n, e) => n + e.extra.length + e.missing.length, 0);
    $('#repeat-errors').disabled = !stats.mistakes; $('#resume').disabled = stats.done === stats.total;
    $('#resume-label').textContent = stats.done === stats.total ? 'Все варианты пройдены' : 'Продолжить';
    $('#resume-status').hidden = stats.done !== stats.total;
    for (const task of [4, 5]) $('#count-' + task).textContent = groups.filter(g => g.task === task).length;
  }
  function visibleGroups() {
    const q = state.view.search.toLocaleLowerCase('ru');
    return groups.filter(g => g.task === state.view.task && (state.view.filter !== 'pending' || !done(g)) && (state.view.filter !== 'mistakes' || hasMistakes(g)) && (!q || `${g.variantId} ${g.members.map(m => m.sourceText + ' ' + m.fipiId).join(' ')}`.toLocaleLowerCase('ru').includes(q)));
  }
  let observer, anchorTimer;
  function observeSources() {
    observer?.disconnect();
    if (!window.IntersectionObserver) return;
    const controlHeight = Math.ceil($('.control-shell').getBoundingClientRect().height + 8);
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const groupId = entry.target.closest('[data-card]').dataset.card;
        state.view.anchors[state.view.task] = groupId; state.view.memberAnchors[state.view.task] = entry.target.dataset.member;
        clearTimeout(anchorTimer); anchorTimer = setTimeout(save, 350);
      }
    }, { rootMargin: `-${controlHeight}px 0px -10% 0px`, threshold: 0 });
    document.querySelectorAll('[data-member]').forEach(el => observer.observe(el));
  }
  function render() {
    const task = state.view.task;
    document.querySelectorAll('[data-task]').forEach(b => { const active = Number(b.dataset.task) === task; b.classList.toggle('active', active); if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.querySelectorAll('[data-filter]').forEach(b => { const active = b.dataset.filter === state.view.filter; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    $('#section-title').textContent = `Задание ${task}`; $('#section-kicker').textContent = task === 5 ? 'ПУНКТУАЦИОННЫЙ АНАЛИЗ' : 'ПУНКТУАЦИОННЫЕ ПРАВИЛА';
    $('#section-description').textContent = task === 5 ? 'Исходная нумерация позиций сохранена' : '5 предложений в каждом варианте';
    $('#search').value = state.view.search;
    const shown = visibleGroups(); $('#feed-count').textContent = `Вариантов: ${shown.length} из ${groups.filter(g => g.task === task).length}`;
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
    const group = byGroup.get(element.dataset.card), cs = C.cardState(state, group);
    if (button.hasAttribute('data-choice') && !cs.checked) {
      const block = button.closest('[data-member]'), kind = button.dataset.kind, id = Number(button.dataset.choice);
      const response = cs.members[block.dataset.member][kind], index = response.selected.indexOf(id);
      if (index >= 0) response.selected.splice(index, 1); else response.selected.push(id);
      button.classList.toggle('selected', response.selected.includes(id)); button.setAttribute('aria-pressed', String(response.selected.includes(id)));
      element.querySelector(`[data-selected="${kind}"]`).textContent = group.members.reduce((n, m) => n + cs.members[m.id][kind].selected.length, 0);
      state.view.memberAnchors[group.task] = block.dataset.member;
    } else if (button.dataset.action === 'check' && !cs.checked) { C.checkGroup(state, group); replaceCard(group, true); }
    else if (button.dataset.action === 'retry') { C.retry(state, group); replaceCard(group); }
    state.view.anchors[group.task] = group.id; save();
  });
  $('#sections').addEventListener('click', event => {
    const button = event.target.closest('[data-task]'); if (!button) return;
    state.view.task = Number(button.dataset.task); state.view.filter = 'all'; state.view.search = ''; render(); save();
    if (state.view.anchors[state.view.task]) scrollToAnchor(); else $('#main').scrollIntoView();
  });
  $('.filters').addEventListener('click', event => { const b = event.target.closest('[data-filter]'); if (!b) return; state.view.filter = b.dataset.filter; render(); save(); });
  let searchTimer;
  $('#search').addEventListener('input', event => { const value = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.view.search = value; render(); save(); $('#search').focus(); }, 180); });
  function continuePractice() {
    const next = C.nextUnfinished(state, groups);
    if (next) goTo(next, true); else { $('#resume-status').hidden = false; $('#resume-status').focus({ preventScroll: true }); }
  }
  $('#resume').addEventListener('click', continuePractice);
  $('#back-top').addEventListener('click', () => $('#main').scrollIntoView());
  const journal = $('#journal');
  function renderJournal() {
    $('#retry-all').disabled = !groups.some(hasMistakes); $('#export-journal').disabled = !state.errors.length;
    const correctionNote = state.correctedWordErrors?.length ? `<p class="journal-adjustment">Прежние замечания к необязательным предлогам исправлены: ${state.correctedWordErrors.length}. Остальная история сохранена.</p>` : '';
    $('#journal-list').innerHTML = correctionNote + (state.errors.length ? [...state.errors].reverse().map(error => {
      const member = byMember.get(error.cardId), group = byGroup.get(error.groupId); if (!member || !group) return '';
      const cs = C.cardState(state, group), resolved = cs.checked && cs.members[member.id][error.exercise].correct;
      return `<article class="journal-entry"><div class="journal-entry-heading"><h3>Задание ${group.task} · № ${esc(group.variantId)}${member.sentenceNumber ? ` · предложение ${member.sentenceNumber}` : ''}</h3>${resolved ? '<span class="resolved">Исправлено</span>' : ''}</div><span class="eyebrow">${error.exercise === 'commas' ? 'Запятые СПП' : 'Союзы и союзные слова'}</span><time class="small muted">${esc(new Date(error.time).toLocaleString('ru-RU'))}</time><blockquote>${esc(error.context)}</blockquote>${error.extra.length ? `<p class="journal-error"><strong>Лишнее:</strong> ${esc(label(member, error.exercise, error.extra))}.</p>` : ''}${error.missing.length ? `<p><strong>Пропущено:</strong> ${esc(label(member, error.exercise, error.missing))}.</p>` : ''}<p><strong>Правильный ответ:</strong> ${esc(label(member, error.exercise, error.expected))}.</p><details class="analysis"><summary>Объяснение</summary>${explanation(member, error.exercise)}</details><button class="button secondary" data-retry-card="${esc(group.id)}">${resolved ? 'Открыть вариант' : 'Повторить вариант'}</button></article>`;
    }).join('') : '<div class="empty"><span aria-hidden="true">✓</span><h3>Ошибок нет</h3><p>После проверки здесь появятся пропуски и лишние ответы.</p></div>');
  }
  $('#journal-open').addEventListener('click', () => { renderJournal(); journal.showModal(); });
  $('#journal-close').addEventListener('click', () => journal.close());
  journal.addEventListener('click', event => { const button = event.target.closest('[data-retry-card]'); if (!button) return; const group = byGroup.get(button.dataset.retryCard); if (group) { if (hasMistakes(group)) C.retry(state, group); journal.close(); goTo(group); } });
  function repeatErrors() {
    const mistakes = groups.filter(hasMistakes); if (!mistakes.length) return;
    mistakes.forEach(group => C.retry(state, group)); journal.close(); state.view.task = mistakes[0].task; state.view.filter = 'mistakes'; state.view.search = '';
    state.view.anchors[mistakes[0].task] = mistakes[0].id; delete state.view.memberAnchors[mistakes[0].task]; render(); save(); document.getElementById('card-' + mistakes[0].id)?.scrollIntoView({ block: 'start' });
  }
  $('#retry-all').addEventListener('click', repeatErrors); $('#repeat-errors').addEventListener('click', repeatErrors);
  $('#export-journal').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), errors: state.errors }, null, 2)], { type: 'application/json;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'oge-spp-errors.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  $('#reset').addEventListener('click', () => $('#reset-dialog').showModal());
  $('#reset-cancel').addEventListener('click', () => $('#reset-dialog').close());
  $('#reset-confirm').addEventListener('click', () => { state = C.emptyState(); save(); $('#migration-note').hidden = true; $('#reset-dialog').close(); render(); window.scrollTo(0, 0); });
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); }); window.addEventListener('pagehide', save);
  render();
  const notices = [];
  if (!hadV2 && state.migration) notices.push('Прежние ответы и журнал перенесены.' + (state.migration.partialGroups ? ' Частично пройденные варианты сохранили выбор и ожидают общей проверки.' : ' Завершённые варианты учтены в прогрессе.'));
  if (!hadWordRules && state.wordReassessment) notices.push(`Проверка предлогов уточнена. Исправлено записей журнала: ${state.wordReassessment.correctedRecords}. Выбранные ответы и результаты сохранены.`);
  if (notices.length) { $('#migration-note').hidden = false; $('#migration-note').textContent = notices.join(' '); }
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
