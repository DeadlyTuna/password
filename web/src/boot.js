/* Boot: parse data, create engine + store, mount every registered section in order. */
(function () {
  'use strict';
  const PWB = window.PWB;
  const { h, kit } = { h: PWB.kit.h, kit: PWB.kit };
  const dataEl = document.getElementById('pwb-data');
  const data = JSON.parse(dataEl.textContent);
  const E = PWB.engineFactory.create(data);
  // The engine keeps its own compact copy of the chain; free the raw 600k-key object and the 5 MB JSON text.
  data.markov.grams = null;
  dataEl.textContent = '';
  const store = kit.createStore(E);
  Object.assign(PWB, { E, data, store });
  const ctx = { E, kit, data, store, h: kit.h, s: kit.s, fmt: kit.fmt };

  const main = document.getElementById('main');
  const toc = document.getElementById('toc');
  const sections = PWB.sections.slice().sort((a, b) => a.order - b.order);
  let n = 0;
  for (const sec of sections) {
    const body = h('div', { class: sec.hero ? 'hero-body' : 'sec-body' });
    let el;
    if (sec.hero) {
      el = h('section', { class: 'sec-hero', id: sec.id }, body);
    } else {
      n += 1;
      el = h('section', { class: 'sec', id: sec.id, 'aria-labelledby': `${sec.id}-title` },
        h('div', { class: 'sec-margin' }, h('div', { class: 'stage' },
          h('div', { class: 'sec-num' }, String(n).padStart(2, '0')),
          h('div', { class: 'eyebrow' }, sec.kicker || ''))),
        h('div', { style: { minWidth: '0' } },
          h('header', { class: 'sec-head' },
            h('h2', { id: `${sec.id}-title` }, sec.title),
            sec.lede ? h('p', { class: 'lede' }, sec.lede) : null),
          body));
      if (toc) toc.append(h('a', { href: `#${sec.id}`, dataset: { id: sec.id } }, sec.nav || sec.title));
    }
    main.append(el);
    try { sec.mount(body, ctx); } catch (e) {
      kit.recordError(sec.id, e);
      body.append(h('div', { class: 'sec-error' }, `This section failed to load: ${e.message}`));
    }
  }

  // Top-bar mirror of the password, with the live grade badge.
  const mini = document.getElementById('mini-pw');
  const badge = document.getElementById('mini-grade');
  if (mini) {
    mini.addEventListener('input', () => store.set(mini.value));
    store.subscribe((st) => {
      if (document.activeElement !== mini) mini.value = st.password;
      badge.textContent = st.rating.grade;
      badge.style.setProperty('--c', kit.gradeColor(st.rating.grade));
    }, 'topbar');
  }

  // Scroll spy for the contents links.
  if (toc && 'IntersectionObserver' in window) {
    const links = new Map([...toc.querySelectorAll('a')].map((a) => [a.dataset.id, a]));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        links.forEach((a) => a.classList.remove('on'));
        const a = links.get(e.target.id);
        if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.filter((s) => !s.hero).forEach((s) => { const el = document.getElementById(s.id); el && io.observe(el); });
  }

  // Theme: system -> light -> dark.
  const themeBtn = document.getElementById('theme-btn');
  const applyTheme = (t) => {
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    if (themeBtn) themeBtn.textContent = { system: 'Auto', light: 'Paper', dark: 'Blueprint' }[t];
  };
  let theme = 'system';
  try { theme = localStorage.getItem('pwb-theme') || 'system'; } catch (e) { /* storage blocked */ }
  applyTheme(theme);
  themeBtn && themeBtn.addEventListener('click', () => {
    theme = { system: 'light', light: 'dark', dark: 'system' }[theme];
    applyTheme(theme);
    try { localStorage.setItem('pwb-theme', theme); } catch (e) { /* storage blocked */ }
    window.dispatchEvent(new Event('pwb-theme'));
  });

  store.set('Summer2026!');
})();
