(function () {
  'use strict';

  const pages = [
    ['Overview', [['Hub', 'hub.html']]],
    ['Customers and Sales', [['Customer 360', 'customer-360.html'], ['Quote', 'quote.html'], ['Orders Admin', 'orders-admin.html']]],
    ['Operations', [['Production Control', 'production-control.html'], ['Inventory Control', 'inventory-control.html'], ['Product Recipes', 'product-recipes.html']]],
    ['Programs', [['Campaign Manager', 'campaign-manager.html']]],
    ['Finance', [['Finance Pro', 'finance-pro.html']]],
    ['Knowledge', [['ERP Handbook', 'erp-handbook.html'], ['Knowledge Library', 'erp-knowledge-library.html']]]
  ];
  const ownership = {
    'hub.html': ['Operations overview', 'Review existing attention signals, then open the page that owns the work.', 'Reference and navigation; records remain owned by their operational pages.'],
    'customer-360.html': ['Customer history', 'Find an exact customer identity and open the related record.', 'Customer-level history and navigation; commercial, production, and finance edits remain with their owners.'],
    'quote.html': ['Customer pricing', 'Build or update the quote, then save it before preparing approval.', 'Quote terms and authoritative totals; manufacturing estimates remain in Production Control.'],
    'orders-admin.html': ['Accepted orders', 'Select an order and complete its next valid service or fulfillment action.', 'Accepted commercial snapshot, customer service, fulfillment, and production linkage.'],
    'production-control.html': ['Production execution', 'Select a job and use its existing next valid transition.', 'Manufacturing workflow, actual usage, scrap, machine assignment, and quality control.'],
    'inventory-control.html': ['Inventory control', 'Review stock and make only authorized inventory adjustments.', 'Stock, reservation, consumption, adjustments, and reorder policy.'],
    'product-recipes.html': ['Product recipes', 'Find or maintain a reusable production specification.', 'Reusable specifications and recipe-linked assets; stock remains in Inventory Control.'],
    'campaign-manager.html': ['Campaign programs', 'Select a campaign and maintain its existing product assignments.', 'Campaign and campaign-product configuration; orders, production, and finance remain with their owners.'],
    'finance-pro.html': ['Financial records', 'Review or post financial entries using the existing finance workflow.', 'Payments, expenses, reporting, and profitability; accepted terms remain snapshot-driven.'],
    'erp-handbook.html': ['Operator handbook', 'Follow the verified steps for the task you are performing.', 'How to operate OliPoly Engine. Technical contracts belong in the Knowledge Library.'],
    'erp-knowledge-library.html': ['System knowledge', 'Use the architecture and maintenance references before changing a workflow.', 'Authority, contracts, storage, troubleshooting, and safe-change boundaries.']
  };
  const current = location.pathname.split('/').pop() || 'hub.html';
  if (!document.body || !document.body.classList.contains('op-engine') || !ownership[current]) return;

  const nav = document.createElement('nav');
  nav.className = 'engine-nav';
  nav.setAttribute('aria-label', 'OliPoly Engine');
  nav.innerHTML = pages.map(([group, links]) => `<section class="engine-nav-group"><span>${group}</span>${links.map(([label, href]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</section>`).join('');

  const header = document.querySelector('header.topbar, div.topbar, header.top, .app-header, .erp-header');
  if (header) header.insertAdjacentElement('afterend', nav);
  else document.body.insertAdjacentElement('afterbegin', nav);

  const [title, action, boundary] = ownership[current];
  const intro = document.createElement('section');
  intro.className = 'engine-page-intro';
  intro.setAttribute('aria-label', 'Page responsibility');
  intro.innerHTML = `<div><span class="engine-kicker">Page ownership</span><h2>${title}</h2></div><p><strong>Work here:</strong> ${action}</p><p><strong>Boundary:</strong> ${boundary}</p><a href="erp-handbook.html">Operator help</a>`;
  nav.insertAdjacentElement('afterend', intro);

  const params = new URLSearchParams(location.search);
  const contextKeys = ['customer', 'search', 'quote', 'order', 'job', 'recipe', 'campaign'];
  const context = contextKeys.map(key => [key, params.get(key)]).filter(([, value]) => value);
  if (context.length) {
    const bar = document.createElement('aside');
    bar.className = 'engine-context';
    bar.setAttribute('aria-label', 'Current record context');
    bar.innerHTML = `<strong>Current context</strong>${context.map(([key, value]) => `<span><b>${key === 'search' ? 'customer' : key}</b> ${escapeText(value)}</span>`).join('')}`;
    intro.insertAdjacentElement('afterend', bar);
  }

  mountAuthentication(intro);

  async function mountAuthentication(anchor) {
    const auth = await requireAuthenticationBridge();
    if (!auth) return;
    const gate = document.createElement('section');
    gate.className = 'engine-auth-gate';
    gate.setAttribute('aria-live', 'polite');
    anchor.insertAdjacentElement('afterend', gate);

    const showSignIn = (message = 'Sign in to load authoritative OliPoly Engine data.') => {
      document.body.classList.add('engine-auth-required');
      gate.dataset.state = 'signed-out';
      gate.innerHTML = `<form class="engine-auth-form"><div><strong>Private Engine sign in</strong><p>${escapeText(message)}</p></div><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Sign in</button></form>`;
      gate.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button');
        const email = form.elements.email.value.trim();
        const password = form.elements.password.value;
        button.disabled = true;
        gate.querySelector('p').textContent = 'Signing in…';
        try {
          await auth.login(email, password);
          const user = await auth.getUser();
          if (!user) throw new Error('The session could not be verified.');
          location.reload();
        } catch (error) {
          form.elements.password.value = '';
          gate.querySelector('p').textContent = error?.message || 'Sign in failed. Try again.';
          button.disabled = false;
        }
      });
    };

    gate.innerHTML = '<p>Checking private session…</p>';
    try {
      const session = await auth.recover();
      if (!session?.user) return showSignIn();
      document.body.classList.remove('engine-auth-required');
      gate.dataset.state = 'signed-in';
      gate.innerHTML = '<span><strong>Private session active</strong><small>Authoritative data access is available.</small></span><button class="ghost" type="button">Sign out</button>';
      gate.querySelector('button').addEventListener('click', () => {
        auth.logout();
        showSignIn('Signed out. Sign in again to load private data.');
      });
    } catch {
      showSignIn('Your session could not be recovered. Sign in again.');
    }
  }

  function requireAuthenticationBridge() {
    if (window.OliPolyAuth?.recover) return Promise.resolve(window.OliPolyAuth);
    return new Promise(resolve => {
      const existing = document.querySelector('script[data-engine-auth-bridge]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.OliPolyAuth || null), { once: true });
        existing.addEventListener('error', () => resolve(null), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'olipoly-auth.js';
      script.dataset.engineAuthBridge = 'true';
      script.onload = () => resolve(window.OliPolyAuth || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  function escapeText(value) {
    const node = document.createElement('span');
    node.textContent = value;
    return node.innerHTML;
  }
}());
