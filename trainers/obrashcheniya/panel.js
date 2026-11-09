(function () {
  'use strict';
  const menu = document.getElementById('actions-menu');
  const toggle = document.getElementById('actions-toggle');
  const commands = document.getElementById('panel-command-list');
  if (!menu || !toggle || !commands) return;
  const query = window.matchMedia ? window.matchMedia('(max-width: 1000px)') : null;
  const isCompact = () => query ? query.matches : window.innerWidth <= 1000;
  function setOpen(open, returnFocus = false) {
    menu.toggleAttribute('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (returnFocus) toggle.focus({ preventScroll: true });
  }
  function syncViewport() { setOpen(!isCompact()); }
  toggle.addEventListener('click', event => {
    event.preventDefault();
    if (isCompact()) setOpen(!menu.hasAttribute('open'));
  });
  menu.addEventListener('toggle', () => {
    if (!isCompact() && !menu.hasAttribute('open')) setOpen(true);
    else toggle.setAttribute('aria-expanded', String(menu.hasAttribute('open')));
  });
  commands.addEventListener('click', event => {
    if (isCompact() && event.target.closest('button') && !event.target.closest('button').disabled) setOpen(false);
  });
  document.addEventListener('click', event => {
    if (isCompact() && menu.hasAttribute('open') && !menu.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isCompact() && menu.hasAttribute('open')) {
      event.preventDefault(); setOpen(false, true);
    }
  });
  if (query?.addEventListener) query.addEventListener('change', syncViewport);
  else if (query?.addListener) query.addListener(syncViewport);
  else window.addEventListener('resize', syncViewport);
  syncViewport();
})();
