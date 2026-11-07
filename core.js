(function (root) {
  'use strict';
  const WORD = /\p{L}[\p{L}\p{M}]*(?:[-‑][\p{L}\p{M}]+)*/gu;
  const KINDS = ['commas', 'words'];
  const STORAGE_KEY = 'oge-spp-commas:progress:v2', LEGACY_KEY = 'oge-spp-commas:progress:v1';
  const WORD_RULES_VERSION = 1;
  // Reviewed syntactic links, not a rule that permits every nearby preposition.
  // This annotation extends accepted word selections without changing the source corpus.
  const RELATIVE_PREPOSITIONS = {
    'sdamgia-4-38089-2': [{ relative: 19, prepositions: [18], phrase: 'с которого' }],
    'sdamgia-4-38232-5': [{ relative: 4, prepositions: [3], phrase: 'с которого' }],
    'sdamgia-4-38246-1': [{ relative: 7, prepositions: [5, 6], phrase: 'с помощью которых' }],
    'sdamgia-4-38247-3': [{ relative: 12, prepositions: [11], phrase: 'к которому' }],
    'sdamgia-4-38330-2': [{ relative: 15, prepositions: [14], phrase: 'на которое' }],
    'sdamgia-4-43441-4': [{ relative: 15, prepositions: [14], phrase: 'в которых' }],
    'sdamgia-5-27645': [{ relative: 22, prepositions: [21], phrase: 'о которых' }],
    'sdamgia-5-27793': [{ relative: 23, prepositions: [22], phrase: 'в котором' }],
    'sdamgia-5-27902': [{ relative: 24, prepositions: [23], phrase: 'на которой' }],
    'sdamgia-5-28352': [{ relative: 33, prepositions: [32], phrase: 'на который' }],
    'sdamgia-5-28388': [{ relative: 23, prepositions: [22], phrase: 'по которой' }],
    'sdamgia-5-28630': [{ relative: 37, prepositions: [36], phrase: 'из которых' }],
    'sdamgia-5-28704': [{ relative: 43, prepositions: [42], phrase: 'по которым' }]
  };
  function words(text) { return [...text.matchAll(new RegExp(WORD.source, 'gu'))].map((m, index) => ({ text: m[0], index, offset: m.index })); }
  function positions(text) { return [...text.matchAll(/\((\d+)\)/g)].map(m => Number(m[1])); }
  function restore(text, key) { const keys = new Set(key); return text.replace(/\s*\((\d+)\)\s*/g, (_, n) => keys.has(Number(n)) ? ', ' : ' ').replace(/ +([.!?;:»])/g, '$1').trim(); }
  function tokens(text) {
    const pieces = words(text).map(w => ({ ...w, kind: 'words' }));
    for (const m of text.matchAll(/\((\d+)\)/g)) pieces.push({ text: m[0], index: Number(m[1]), offset: m.index, kind: 'commas' });
    return pieces.sort((a, b) => a.offset - b.offset);
  }
  function difference(selected, expected) {
    const actual = new Set(selected), correct = new Set(expected);
    const extra = [...actual].filter(x => !correct.has(x)), missing = [...correct].filter(x => !actual.has(x));
    return { extra, missing, correct: !extra.length && !missing.length };
  }
  function expected(member, kind) { return kind === 'commas' ? member.commaAnswers : [...new Set(member.connectives.flatMap(c => c.words))].sort((a, b) => a - b); }
  function optionalPrepositions(member) {
    const textWords = words(member.displayText);
    return (RELATIVE_PREPOSITIONS[member.id] || []).filter(binding =>
      member.connectives.some(c => c.kind === 'relative' && c.words.includes(binding.relative)) &&
      [...binding.prepositions, binding.relative].map(i => textWords[i]?.text).join(' ').toLowerCase() === binding.phrase
    );
  }
  function acceptedOptionalWords(member, selected) {
    const chosen = new Set(selected);
    return optionalPrepositions(member).filter(b => chosen.has(b.relative)).flatMap(b => b.prepositions.filter(i => chosen.has(i)));
  }
  function evaluate(member, kind, selected) {
    const required = expected(member, kind);
    if (kind === 'commas') return difference(selected, required);
    // Optional words enter the allowed set only when actually selected with their relative word.
    // They can therefore never become missing answers.
    return difference(selected, [...required, ...acceptedOptionalWords(member, selected)]);
  }
  function groupCards(cards) {
    const groups = new Map();
    for (const member of cards) {
      const id = `variant-${member.task}-${member.variantId}`;
      if (!groups.has(id)) groups.set(id, { id, task: member.task, variantId: member.variantId, members: [] });
      groups.get(id).members.push(member);
    }
    for (const group of groups.values()) group.members.sort((a, b) => (a.sentenceNumber || 0) - (b.sentenceNumber || 0));
    return [...groups.values()];
  }
  function emptyState() { return { version: 2, wordRulesVersion: WORD_RULES_VERSION, cards: {}, errors: [], view: { task: 5, filter: 'all', search: '', anchors: {}, memberAnchors: {} } }; }
  function emptyMember() { return { commas: { selected: [], checked: false }, words: { selected: [], checked: false } }; }
  function cardState(state, group) {
    if (!state.cards[group.id]) state.cards[group.id] = { checked: false, retrying: false, members: {} };
    const cs = state.cards[group.id];
    for (const member of group.members) if (!cs.members[member.id]) cs.members[member.id] = emptyMember();
    return cs;
  }
  function hasMistakes(state, group) {
    const cs = cardState(state, group);
    return cs.retrying || ((cs.checked || cs.migratedPartial) && group.members.some(m => KINDS.some(k => cs.members[m.id][k].checked && !cs.members[m.id][k].correct)));
  }
  function checkGroup(state, group, now = new Date().toISOString()) {
    const cs = cardState(state, group);
    if (cs.checked) return cs;
    for (const member of group.members) for (const kind of KINDS) {
      const current = cs.members[member.id][kind], result = evaluate(member, kind, current.selected);
      Object.assign(current, { checked: true, correct: result.correct, checkedAt: now });
      if (!result.correct) state.errors.push({ id: `${now}-${state.errors.length}`, groupId: group.id, cardId: member.id, task: member.task, variantId: member.variantId, sentenceNumber: member.sentenceNumber || null, exercise: kind, time: now, selected: [...current.selected], expected: expected(member, kind), extra: result.extra, missing: result.missing, context: member.sourceText, explanation: member.explanation });
    }
    Object.assign(cs, { checked: true, checkedAt: now, retrying: false, migratedPartial: false });
    state.lastCompleted = { id: group.id, task: group.task, at: now };
    return cs;
  }
  function retry(state, group) {
    const cs = cardState(state, group), needsRetry = hasMistakes(state, group);
    for (const member of group.members) cs.members[member.id] = emptyMember();
    Object.assign(cs, { checked: false, retrying: needsRetry, migratedPartial: false });
  }
  function stats(state, groups) {
    const result = { total: groups.length, done: 0, commas: { checked: 0, correct: 0 }, words: { checked: 0, correct: 0 }, mistakes: 0 };
    for (const group of groups) {
      const cs = cardState(state, group);
      if (hasMistakes(state, group)) result.mistakes++;
      if (!cs.checked) continue;
      result.done++;
      for (const kind of KINDS) { result[kind].checked++; if (group.members.every(m => cs.members[m.id][kind].correct)) result[kind].correct++; }
    }
    return result;
  }
  function read(storage, key) { try { const value = JSON.parse(storage.getItem(key)); return value && typeof value === 'object' ? value : null; } catch (_) { return null; } }
  function validState(raw, version) { return raw?.version === version && raw.cards && typeof raw.cards === 'object' && !Array.isArray(raw.cards) && Array.isArray(raw.errors); }
  function practiceOrder(groups) { return [...groups.filter(g => g.task === 5), ...groups.filter(g => g.task === 4)]; }
  function lastCompleted(state, groups, saved = state.lastCompleted) {
    const ordered = practiceOrder(groups);
    if (saved && ordered.some(g => g.id === saved.id && g.task === saved.task)) return { id: saved.id, task: saved.task, ...(typeof saved.at === 'string' ? { at: saved.at } : {}) };
    let latest = null, latestTime = -1;
    for (const group of ordered) {
      const cs = state.cards[group.id]; if (!cs?.checked) continue;
      const dates = [cs.checkedAt, ...group.members.flatMap(m => KINDS.map(k => cs.members?.[m.id]?.[k]?.checkedAt))].filter(d => typeof d === 'string' && Number.isFinite(Date.parse(d)));
      const time = dates.length ? Math.max(...dates.map(Date.parse)) : 0;
      if (time >= latestTime) { latestTime = time; latest = { id: group.id, task: group.task, ...(dates.length ? { at: new Date(time).toISOString() } : {}) }; }
    }
    return latest;
  }
  function nextUnfinished(state, groups) {
    const ordered = practiceOrder(groups), last = lastCompleted(state, groups);
    const start = last ? ordered.findIndex(g => g.id === last.id) : -1;
    for (let step = 1; step <= ordered.length; step++) {
      const group = ordered[(start + step) % ordered.length];
      if (!state.cards[group.id]?.checked) return group;
    }
    return null;
  }
  function load(storage, groups, now = new Date().toISOString()) {
    const current = read(storage, STORAGE_KEY), legacy = read(storage, LEGACY_KEY);
    const raw = validState(current, 2) ? current : validState(legacy, 1) ? legacy : null;
    const state = emptyState();
    if (!raw) return state;
    const memberGroups = new Map(groups.flatMap(g => g.members.map(m => [m.id, g])));
    for (const group of groups) {
      const target = cardState(state, group), source = raw.version === 2 ? raw.cards[group.id] : null;
      let touched = false, allChecked = true;
      for (const member of group.members) {
        const old = raw.version === 2 ? source?.members?.[member.id] : raw.cards[member.id];
        for (const kind of KINDS) {
          const previous = old?.[kind], answer = target.members[member.id][kind];
          if (!previous || !Array.isArray(previous.selected)) { allChecked = false; continue; }
          const allowed = new Set(kind === 'commas' ? positions(member.displayText) : words(member.displayText).map(w => w.index));
          answer.selected = [...new Set(previous.selected.filter(n => Number.isInteger(n) && allowed.has(n)))];
          answer.checked = !!previous.checked;
          if (answer.checked) { answer.correct = evaluate(member, kind, answer.selected).correct; if (typeof previous.checkedAt === 'string') answer.checkedAt = previous.checkedAt; }
          allChecked = allChecked && answer.checked;
          touched ||= answer.checked || !!answer.selected.length || !!previous.retrying;
          target.retrying ||= !!previous.retrying;
        }
      }
      target.checked = raw.version === 2 ? !!source?.checked && allChecked : allChecked;
      target.retrying ||= !!source?.retrying;
      target.migratedPartial = raw.version === 1 ? touched && !allChecked : !!source?.migratedPartial;
      if (source?.checkedAt) target.checkedAt = source.checkedAt;
      if (target.checked && group.members.every(m => KINDS.every(k => target.members[m.id][k].correct))) target.retrying = false;
    }
    state.errors = raw.errors.filter(e => e && memberGroups.has(e.cardId) && KINDS.includes(e.exercise) && ['extra', 'missing', 'selected', 'expected'].every(k => Array.isArray(e[k]))).map(e => ({ ...e, groupId: memberGroups.get(e.cardId).id, sentenceNumber: memberGroups.get(e.cardId).members.find(m => m.id === e.cardId).sentenceNumber || null }));
    if (Array.isArray(raw.correctedWordErrors)) state.correctedWordErrors = raw.correctedWordErrors.filter(e => e && typeof e === 'object').map(e => ({ ...e }));
    if (raw.wordReassessment) state.wordReassessment = raw.wordReassessment;
    let correctedRecords = 0, removedRecords = 0;
    state.errors = state.errors.filter(error => {
      if (error.exercise !== 'words') return true;
      const member = memberGroups.get(error.cardId).members.find(m => m.id === error.cardId);
      const required = expected(member, 'words'), count = words(member.displayText).length;
      const validSelection = error.selected.every(n => Number.isInteger(n) && n >= 0 && n < count);
      // Reassess only complete, comparable historical answers; preserve ambiguous records.
      if (!validSelection || !difference(error.expected, required).correct) return true;
      const result = evaluate(member, 'words', error.selected);
      if (difference(error.extra, result.extra).correct && difference(error.missing, result.missing).correct) return true;
      correctedRecords++;
      if (result.correct) {
        state.correctedWordErrors ||= [];
        if (!state.correctedWordErrors.some(e => e.id === error.id)) state.correctedWordErrors.push({ ...error, reassessedAt: now, reason: 'optional-preposition' });
        removedRecords++; return false;
      }
      error.extra = result.extra; error.missing = result.missing;
      return true;
    });
    if (correctedRecords) state.wordReassessment = { version: WORD_RULES_VERSION, at: now, correctedRecords, removedRecords };
    if (raw.view && typeof raw.view === 'object') {
      state.view.task = [4, 5].includes(raw.view.task) ? raw.view.task : 5;
      state.view.filter = ['all', 'pending', 'mistakes'].includes(raw.view.filter) ? raw.view.filter : 'all';
      state.view.search = typeof raw.view.search === 'string' ? raw.view.search : '';
      for (const task of [4, 5]) {
        const anchor = raw.view.anchors?.[task], group = groups.find(g => g.id === anchor) || memberGroups.get(anchor);
        if (group && group.task === task) state.view.anchors[task] = group.id;
        const memberId = raw.view.memberAnchors?.[task] || (memberGroups.has(anchor) ? anchor : null);
        if (memberId && memberGroups.get(memberId)?.task === task) state.view.memberAnchors[task] = memberId;
      }
    }
    if (raw.version === 1) state.migration = { from: 1, at: now, partialGroups: Object.values(state.cards).filter(c => c.migratedPartial).length };
    else if (raw.migration) state.migration = raw.migration;
    const completion = lastCompleted(state, groups, raw.lastCompleted);
    if (completion) state.lastCompleted = completion;
    return state;
  }
  const api = { words, positions, restore, tokens, difference, expected, optionalPrepositions, acceptedOptionalWords, evaluate, groupCards, emptyState, cardState, checkGroup, retry, stats, hasMistakes, load, practiceOrder, lastCompleted, nextUnfinished, STORAGE_KEY, LEGACY_KEY, WORD_RULES_VERSION };
  if (typeof module !== 'undefined') module.exports = api; else root.TrainerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
