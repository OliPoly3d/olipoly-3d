(function () {
  'use strict';

  const pages = [
    ['Hub','hub.html'], ['Production','production-control.html'], ['Orders','orders-admin.html'],
    ['Quotes','quote.html'], ['Inventory','inventory-control.html'], ['Customers','customer-360.html'],
    ['Recipes','product-recipes.html'], ['Knowledge','erp-knowledge-library.html'],
    ['Handbook','erp-handbook.html'], ['Campaigns','campaign-manager.html']
  ];
  const titles = Object.fromEntries(pages.map(([label, href]) => [href, label]));
  const current = location.pathname.split('/').pop() || 'hub.html';

  function sessionIdentity() {
    const candidates = ['sb_user', 'olipoly_auth_session_v1'];
    for (const key of candidates) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        const user = value?.user || value;
        if (user?.email) return user.email;
      } catch (_) { /* presentation must not block a page on malformed recovery data */ }
    }
    return '';
  }

  function focusSignIn() {
    const target = document.getElementById('signinCard') || document.getElementById('authSection');
    if (target) {
      if (target.tagName === 'DETAILS') target.open = true;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.querySelector('input[type="email"]')?.focus({ preventScroll: true });
      return;
    }
    location.href = 'orders-admin.html#signinCard';
  }

  function mount() {
    document.body.classList.add('erp-ui');
    const identity = sessionIdentity();
    const bar = document.createElement('header');
    bar.className = 'erp-app-bar';
    bar.dataset.erpShell = 'app-bar';
    bar.innerHTML = `<div class="erp-app-identity"><span class="erp-app-mark" aria-hidden="true">OP</span><span><strong>OliPoly ERP</strong><span>${titles[current] || document.title}</span></span></div><div class="erp-auth" data-erp-auth="top"><span class="erp-auth-copy"><strong>${identity ? 'Signed in' : 'Authentication'}</strong><small>${identity || 'Sign in to access private operations'}</small></span><button class="erp-auth-action" type="button">${identity ? 'Account / Sign Out' : 'Sign In'}</button></div>`;
    const action = bar.querySelector('.erp-auth-action');
    action.addEventListener('click', () => {
      const existing = document.getElementById(identity ? 'logoutBtn' : 'loginBtn');
      if (identity && existing) existing.click();
      else focusSignIn();
    });

    const nav = document.createElement('nav');
    nav.className = 'erp-nav';
    nav.dataset.erpShell = 'navigation';
    nav.setAttribute('aria-label', 'ERP sections');
    nav.innerHTML = pages.map(([label, href]) => `<a href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('') + '<a href="finance-pro.html">Finance</a>';
    document.body.prepend(nav);
    document.body.prepend(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}());
