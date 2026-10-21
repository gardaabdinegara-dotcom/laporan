(() => {
  const key = 'garda.appearance.v1';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try { const saved = localStorage.getItem(key); if (saved === 'light' || saved === 'dark') preference = saved; } catch {}
  function apply(value) {
    document.documentElement.dataset.colorMode = value;
    document.documentElement.style.colorScheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#18221c' : '#f7f6f0');
  }
  apply(preference || (system.matches ? 'dark' : 'light'));
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-appearance-toggle]')) return;
    preference = document.documentElement.dataset.colorMode === 'dark' ? 'light' : 'dark';
    apply(preference);
    try { localStorage.setItem(key, preference); } catch {}
  });
  system.addEventListener('change', event => { if (!preference) apply(event.matches ? 'dark' : 'light'); });
  window.addEventListener('storage', event => {
    if (event.key !== key) return;
    preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
    apply(preference || (system.matches ? 'dark' : 'light'));
  });
})();
