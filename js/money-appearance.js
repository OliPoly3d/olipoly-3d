/* Display-only preference, applied before paint and independent of sign-in. */
(() => {
  const key = 'money-appearance-v1';
  const root = document.documentElement;
  const device = window.matchMedia?.('(prefers-color-scheme: light)');
  let choice = 'dark';
  try { choice = localStorage.getItem(key) || 'dark'; } catch { /* Storage may be disabled. */ }
  if (!['dark', 'light', 'system'].includes(choice)) choice = 'dark';
  const apply = () => { root.dataset.moneyTheme = choice === 'system' ? (device?.matches ? 'light' : 'dark') : choice; };
  apply();
  device?.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('moneyTheme');
    if (!select) return;
    select.value = choice;
    select.addEventListener('change', () => {
      choice = select.value;
      apply();
      try { localStorage.setItem(key, choice); } catch { /* Theme still works for this visit. */ }
    });
  }, { once: true });
})();
