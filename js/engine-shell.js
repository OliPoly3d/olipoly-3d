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

  function escapeText(value) {
    const node = document.createElement('span');
    node.textContent = value;
    return node.innerHTML;
  }
}());
