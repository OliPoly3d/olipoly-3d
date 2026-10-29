const $ = (id) => document.getElementById(id);
export function setupWorkspace({ getOwner }) {
  let current = 'today',
    owner = null;
  const preference = () => {
    try {
      return window.localStorage.getItem('money_view_' + getOwner()) || 'today';
    } catch {
      return 'today';
    }
  };
  function select(view, { remember = true } = {}) {
    if (!['today', 'month', 'plan'].includes(view)) view = 'today';
    const changed = current !== view;
    current = view;
    $('app').dataset.moneyView = view;
    for (const element of document.querySelectorAll('#moneyWorkspace [data-money-views]'))
      element.hidden = !element.dataset.moneyViews.split(' ').includes(view);
    for (const button of document.querySelectorAll('[data-money-view-button]'))
      button.setAttribute('aria-pressed', String(button.dataset.moneyViewButton === view));
    if (remember && getOwner())
      try {
        window.localStorage.setItem('money_view_' + getOwner(), view);
      } catch {}
    if (changed)
      document.dispatchEvent(new window.CustomEvent('money-view-changed', { detail: { view } }));
  }
  function reveal(target) {
    const scope = target?.closest('[data-money-views]');
    if (scope && !scope.dataset.moneyViews.split(' ').includes(current))
      select(scope.dataset.moneyViews.split(' ')[0]);
  }
  for (const button of document.querySelectorAll('[data-money-view-button]'))
    button.onclick = () => {
      select(button.dataset.moneyViewButton);
      $('moneyWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  document.addEventListener('money-reveal-section', (e) => reveal(e.detail.target));
  function render() {
    if (owner !== getOwner()) {
      owner = getOwner();
      select(preference(), { remember: false });
      const target = $(window.location.hash.slice(1));
      if (target) reveal(target);
    } else select(current, { remember: false });
  }
  function clear() {
    owner = null;
    current = 'today';
    select('today', { remember: false });
  }
  return { render, clear, select, reveal, current: () => current };
}
