(function () {
  'use strict';

  const form = document.getElementById('history-search');
  const signIn = document.getElementById('history-sign-in');
  const input = document.getElementById('history-reference');
  const button = form.querySelector('button');
  const status = document.getElementById('history-status');
  const results = document.getElementById('history-results');
  const cloud = window.OliPolyOpsCloud.create(window.OliPolyOpsTestConfig);

  function append(parent, tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    parent.append(node);
    return node;
  }

  function list(parent, title, items) {
    if (!items.length) return;
    append(parent, 'h3', title);
    const list = append(parent, 'ul', '');
    items.forEach(item => append(list, 'li', item));
  }

  function renderMatch(match) {
    const card = append(results, 'article', '');
    card.className = 'card';
    append(card, 'h2', match.matched_reference);
    append(card, 'p', match.record_type + ' · ' + match.archived_status);
    append(card, 'p', 'Source record: ' + match.source_key);
    append(card, 'p', match.related_order ? 'Linked order: ' + match.related_order : 'No linked order recorded.');
    list(card, 'Recorded evidence', match.evidence);
    list(card, 'Open items', match.open_issues);
  }

  if (!cloud.signedIn()) {
    signIn.hidden = false;
    return;
  }
  form.hidden = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const reference = input.value.trim();
    results.replaceChildren();
    if (!reference) {
      status.textContent = 'Enter a full reference to search.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Searching legacy history…';
    try {
      const matches = await cloud.historyLookup(reference);
      matches.forEach(renderMatch);
      if (matches.length > 1) status.textContent = matches.length + ' records share this reference. Review each match.';
      else status.textContent = matches.length ? 'One match found.' : 'No archived record matches this exact reference.';
    } catch (error) {
      results.replaceChildren();
      status.textContent = error.code === 'PGRST202'
        ? 'Legacy history has not been enabled in the test database yet.'
        : 'History could not be loaded. Check your test sign-in or try again.';
    } finally {
      button.disabled = false;
    }
  });
})();
