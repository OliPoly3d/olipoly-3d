(function () {
  'use strict';

  const form = document.getElementById('history-search');
  const signIn = document.getElementById('history-sign-in');
  const input = document.getElementById('history-reference');
  const button = form.querySelector('button');
  const status = document.getElementById('history-status');
  const results = document.getElementById('history-results');
  const cloud = window.OliPolyOpsCloud.create(window.OliPolyOpsTestConfig);

  const previewUrls = new Set();

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

  function renderDocuments(card, documents) {
    if (!documents?.length) return;
    append(card, 'h3', 'Documents');
    const files = append(card, 'ul', '');
    for (const documentInfo of documents) {
      const item = append(files, 'li', '');
      append(item, 'p', documentInfo.file_name);
      const load = append(item, 'button', 'Prepare PDF');
      load.type = 'button';
      const message = append(item, 'p', '');
      message.setAttribute('role', 'status');

      load.addEventListener('click', async () => {
        load.disabled = true;
        message.textContent = 'Loading PDF…';
        try {
          const pdf = await cloud.historyPdf(documentInfo.object_name);
          if (!item.isConnected) return;
          const url = URL.createObjectURL(pdf);
          previewUrls.add(url);
          const link = append(item, 'a', 'Open PDF');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          load.replaceWith(link);
          message.textContent = 'PDF ready.';
          link.focus();
        } catch (error) {
          message.textContent = [400, 403, 404].includes(error.code)
            ? 'This PDF is missing or you don’t have access.'
            : 'PDF unavailable. Check your test sign-in or try again.';
        } finally {
          load.disabled = false;
        }
      });
    }
  }

  function renderMatch(match) {
    const card = append(results, 'article', '');
    card.className = 'card';
    append(card, 'h2', match.matched_reference);
    append(card, 'p', match.record_type + ' · ' + match.archived_status);
    append(card, 'p', 'Source record: ' + match.source_key);
    append(card, 'p', match.related_order ? 'Linked order: ' + match.related_order : 'No linked order recorded.');
    list(card, 'Recorded evidence', match.evidence);
    renderDocuments(card, match.documents);
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
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls.clear();
    if (!reference) {
      status.textContent = 'Enter a full reference to search.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Searching legacy history…';
    try {
      let matches;
      try {
        matches = await cloud.historyWithDocuments(reference);
      } catch (error) {
        if (error.code !== 'PGRST202') throw error;
        matches = await cloud.historyLookup(reference);
      }
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
