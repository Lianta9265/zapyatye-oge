(function (root) {
  'use strict';
  const WORD = /\p{L}[\p{L}\p{M}]*(?:[-‑][\p{L}\p{M}]+)*/gu;
  const KINDS = ['commas'];
  const RESPONSE_KINDS = ['commas', 'words'];
  const STORAGE_KEY = 'zapyatye-oge:vvodnye:progress:v1', LEGACY_KEY = 'zapyatye-oge:vvodnye:legacy:unused';
  const GRADING_VERSION = 2;
  function words(text) { return [...text.matchAll(new RegExp(WORD.source, 'gu'))].map((m, index) => ({ text: m[0], index, offset: m.index })); }
  // Source offsets retain combining stress marks; visible labels are ordinary unbroken words.
  function displayWord(text) { return text.normalize('NFC').replace(/\u0301/gu, ''); }
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
  function evaluate(member, kind, selected) {
    return kind === 'commas' ? difference(selected, expected(member, kind)) : { extra: [], missing: [], correct: true };
  }
  function groupCards(cards) {
    const groups = new Map();
    for (const member of cards) {
      const id = member.groupId || (member.task < 4 ? member.id : `variant-${member.task}-${member.variantId}`);
      if (!groups.has(id)) groups.set(id, { id, task: member.task, variantId: member.variantId, aliasTasks: member.aliasTasks || [], members: [] });
      groups.get(id).members.push(member);
    }
    for (const group of groups.values()) group.members.sort((a, b) => (a.sentenceNumber || 0) - (b.sentenceNumber || 0));
    return [...groups.values()];
  }
  function emptyState() { return { version: 2, gradingVersion: GRADING_VERSION, cards: {}, errors: [], archivedCards: {}, archivedErrors: [], view: { task: 5, filter: 'all', search: '', anchors: {}, memberAnchors: {} } }; }
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
    const result = { total: groups.length, done: 0, commas: { checked: 0, correct: 0 }, mistakes: 0 };
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
  function practiceOrder(groups) { return [5,4,3,2].flatMap(task => groups.filter(g => g.task === task)); }
  function lastCompleted(state, groups, saved = state.lastCompleted) {
    const ordered = practiceOrder(groups);
    if (saved && (ordered.some(g => g.id === saved.id && g.task === saved.task) || (state.archivedCards?.[saved.id] && state.priorPracticeOrder?.includes(saved.id)))) return { id: saved.id, task: saved.task, ...(typeof saved.at === 'string' ? { at: saved.at } : {}) };
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
    if (last && !ordered.some(g=>g.id===last.id) && state.priorPracticeOrder?.includes(last.id)) {
      const prior = state.priorPracticeOrder, start = prior.indexOf(last.id);
      const active = new Map(ordered.map(g=>[g.id,g]));
      for(let step=1;step<=prior.length;step++) {
        const group=active.get(prior[(start+step)%prior.length]);
        if(group && !state.cards[group.id]?.checked) return group;
      }
    }
    const start = last ? ordered.findIndex(g => g.id === last.id) : -1;
    for (let step = 1; step <= ordered.length; step++) {
      const group = ordered[(start + step) % ordered.length];
      if (!state.cards[group.id]?.checked) return group;
    }
    return null;
  }
  function load(storage, groups, now = new Date().toISOString(), previousOrder = []) {
    const current = read(storage, STORAGE_KEY), legacy = read(storage, LEGACY_KEY);
    const raw = validState(current, 2) ? current : validState(legacy, 1) ? legacy : null;
    const state = emptyState();
    state.priorPracticeOrder = [...new Set([...(Array.isArray(raw?.priorPracticeOrder) ? raw.priorPracticeOrder : []), ...previousOrder])].filter(id=>typeof id==='string');
    if (!raw) return state;
    const memberGroups = new Map(groups.flatMap(g => g.members.map(m => [m.id, g])));
    const activeIds = new Set(groups.map(g=>g.id));
    state.archivedCards = raw.archivedCards && typeof raw.archivedCards==='object' && !Array.isArray(raw.archivedCards) ? {...raw.archivedCards} : {};
    for (const [id,answer] of Object.entries(raw.cards)) if (!activeIds.has(id)) state.archivedCards[id]=answer;
    state.archivedErrors = Array.isArray(raw.archivedErrors) ? raw.archivedErrors.filter(e=>e && typeof e==='object') : [];
    const archive = (error,reason) => {
      if (!state.archivedErrors.some(e=>e.id===error.id && e.archiveReason===reason)) state.archivedErrors.push({...error,archiveReason:reason,archivedAt:now});
    };
    if(Array.isArray(raw.correctedWordErrors)) for(const error of raw.correctedWordErrors) if(error && typeof error==='object') archive(error,'ungraded-words');
    for (const error of raw.errors) {
      if (!error || typeof error!=='object') continue;
      const group=memberGroups.get(error.cardId);
      if (error.exercise==='words') { archive(error,'ungraded-words'); continue; }
      if (!group) { archive(error,'removed-card'); continue; }
      if(error.exercise!=='commas' || !['selected','expected','extra','missing'].every(k=>Array.isArray(error[k]))) { archive(error,'invalid-record');continue; }
      const member=group.members.find(m=>m.id===error.cardId);
      const result=evaluate(member,'commas',error.selected);
      if(result.correct) {archive(error,'revised-comma-key');continue;}
      state.errors.push({...error, groupId:group.id, sentenceNumber:member.sentenceNumber || null, expected:expected(member,'commas'), extra:result.extra, missing:result.missing});
    }
    for (const group of groups) {
      const target = cardState(state, group), source = raw.version === 2 ? raw.cards[group.id] : null;
      let allChecked=true;
      for (const member of group.members) {
        const old=raw.version===2 ? source?.members?.[member.id] : raw.cards[member.id];
        for (const kind of RESPONSE_KINDS) {
          const previous=old?.[kind], answer=target.members[member.id][kind];
          const allowed=new Set(kind==='commas' ? positions(member.displayText) : words(member.displayText).map(w=>w.index));
          if(Array.isArray(previous?.selected)) answer.selected=[...new Set(previous.selected.filter(n=>Number.isInteger(n) && allowed.has(n)))];
          if(kind==='words') continue;
          answer.checked=!!previous?.checked;
          if(answer.checked) {
            answer.correct=evaluate(member,'commas',answer.selected).correct;
            if(typeof previous.checkedAt==='string') answer.checkedAt=previous.checkedAt;
          }
          allChecked &&= answer.checked;
        }
      }
      target.checked=allChecked;
      target.retrying=!target.checked && !!source?.retrying && state.errors.some(e=>e.groupId===group.id);
      target.migratedPartial=!allChecked && (raw.version===1 ? group.members.some(m=>target.members[m.id].commas.checked) : !!source?.migratedPartial);
      if(typeof source?.checkedAt==='string') target.checkedAt=source.checkedAt;
    }
    if(raw.view && typeof raw.view==='object') {
      state.view.task=[2,3,4,5].includes(raw.view.task) ? raw.view.task : 5;
      state.view.filter=['all','pending','mistakes'].includes(raw.view.filter) ? raw.view.filter : 'all';
      state.view.search=typeof raw.view.search==='string' ? raw.view.search : '';
      for(const task of [2,3,4,5]) {
        const anchor=raw.view.anchors?.[task], group=groups.find(g=>g.id===anchor) || memberGroups.get(anchor);
        if(group && (group.task===task || group.aliasTasks.includes(task))) state.view.anchors[task]=group.id;
        const memberId=raw.view.memberAnchors?.[task];
        const memberGroup=memberGroups.get(memberId);
        if(memberGroup && (memberGroup.task===task || memberGroup.aliasTasks.includes(task))) state.view.memberAnchors[task]=memberId;
      }
    }
    if(raw.migration) state.migration=raw.migration;
    const completion=lastCompleted(state,groups,raw.lastCompleted);
    if(completion) state.lastCompleted=completion;
    if(raw.gradingVersion!==GRADING_VERSION) state.editorialMigration={at:now,fromGradingVersion:raw.gradingVersion || 1,archivedErrors:state.archivedErrors.length,archivedCards:Object.keys(state.archivedCards).length};
    else if(raw.editorialMigration) state.editorialMigration=raw.editorialMigration;
    return state;
  }
  const api = { words, displayWord, positions, restore, tokens, difference, expected, evaluate, groupCards, emptyState, cardState, checkGroup, retry, stats, hasMistakes, load, practiceOrder, lastCompleted, nextUnfinished, STORAGE_KEY, LEGACY_KEY, GRADING_VERSION };
  if (typeof module !== 'undefined') module.exports = api; else root.VvodnyeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
