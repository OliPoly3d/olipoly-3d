import { cents, balances } from './money-engine.mjs';
import { refundableParts, spendingParts, transactionOwner } from './money-categories.mjs';
import { categoryAccent } from './money-home.mjs';
import { defaultWatchedAccounts } from './money-everyday.mjs';
import { searchLedger } from './money-decisions.mjs';
import { formatMoney } from './money-charts.mjs';
import { revealSection, sectionPreview } from './money-sections.mjs';
const $ = (id) => document.getElementById(id),
  el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
function options(select, items, value = select.value) {
  select.replaceChildren();
  for (const [id, label] of items) {
    const o = el('option', label);
    o.value = id;
    select.append(o);
  }
  if (items.some(([id]) => id === value)) select.value = value;
}
function button(text, fn) {
  const b = el('button', text);
  b.type = 'button';
  b.onclick = fn;
  return b;
}
export function setupEntry({
  getDraft,
  getOwner,
  today,
  updateDraft,
  record,
  remove,
  cancel,
  message,
}) {
  const f = $('transactionForm'),
    dialog = $('transactionDialog'),
    view = document.defaultView;
  const fieldsFirst = [
    f.elements.amount.closest('label'),
    f.elements.kind.closest('label'),
    f.elements.entryTiming.closest('label'),
    $('entryAccountChoices').parentElement,
    $('transactionToLabel'),
    $('transactionCategoryLabel'),
    f.elements.description.closest('label'),
    f.querySelector('.entry-meta'),
  ];
  for (const field of fieldsFirst.reverse()) f.prepend(field);
  let lastLedger = '',
    receiptTimer = null;
  const preference = () => {
    try {
      return JSON.parse(window.localStorage.getItem('money_entry_defaults_' + getOwner()) || '{}');
    } catch {
      return {};
    }
  };
  function status(text = '', error = false) {
    $('entryStatus').textContent = text;
    $('entryStatus').classList.toggle('low', error);
    $('entryStatus').hidden = !text;
  }
  function show() {
    const kind = f.elements.kind.value;
    if (
      $('app').dataset.debtHidden === 'true' &&
      !['expense', 'refund'].includes(kind) &&
      [f.elements.account.value, ...(kind === 'transfer' ? [f.elements.to.value] : [])].some(
        (id) => getDraft().accounts.find((a) => a.id === id)?.type !== 'cash',
      )
    ) {
      close();
      message('Use Show debt before entering or editing a debt payment. Your entry is preserved.');
      return;
    }
    $('spendingSection').open = true;
    revealSection(f);
    if (!dialog.open) {
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    sync();
    document.dispatchEvent(new window.Event('money-entry-shown'));
  }
  function close() {
    if (dialog.open && dialog.close) dialog.close();
    else dialog.removeAttribute('open');
  }
  document.addEventListener('money-privacy-changed', (e) => {
    if (e.detail.hidden && $('transactionEntry').hasAttribute('data-debt-private')) {
      close();
      message(
        'Debt entry hidden. Your unsaved entry remains; use Show debt and reopen it to continue.',
      );
    }
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    cancel();
  });
  function sync() {
    const kind = f.elements.kind.value,
      transfer = kind === 'transfer',
      refund = kind === 'refund',
      expense = kind === 'expense' || refund;
    $('transactionCategoryLabel').hidden = !expense;
    f.elements.category.disabled = !expense;
    $('transactionToLabel').hidden = !transfer;
    f.elements.to.disabled = !transfer;
    f.elements.to.required = transfer;
    $('transactionAccountText').textContent =
      refund || kind === 'income' ? 'Received into' : 'Paid from / account';
    $('refundEntry').hidden = !refund;
    f.elements.refundOf.disabled = !refund;
    $('splitEntry').hidden = !expense;
    f.elements.splitPurchase.disabled = !expense;
    $('splitRows').hidden = !expense || !f.elements.splitPurchase.checked;
    $('addSplit').hidden = !expense || !f.elements.splitPurchase.checked;
    const expected = f.elements.entryTiming.value === 'plan';
    f.elements.entryTiming.disabled =
      !!f.elements.editTransactionId.value ||
      !!f.elements.scheduleKey.value ||
      refund ||
      kind === 'adjustment';
    if (f.elements.entryTiming.disabled) f.elements.entryTiming.value = 'actual';
    $('recordTransaction').textContent =
      expected && !f.elements.entryTiming.disabled ? 'Add to budget preview' : 'Record actual';
    if (!expense) f.elements.splitPurchase.checked = false;
    updateSplitTotal();
    renderQuickChoices();
  }
  function choiceButtons(target, select, items, { color = false } = {}) {
    const key = JSON.stringify(items);
    if (target.dataset.choices !== key) {
      target.replaceChildren();
      target.dataset.choices = key;
      for (const [value, label] of items) {
        const b = button(label, () => {
          if (select.disabled) return;
          select.value = value;
          select.dispatchEvent(new view.Event('change', { bubbles: true }));
        });
        b.dataset.value = value;
        b.setAttribute('aria-label', 'Choose ' + label);
        if (color) b.style.setProperty('--category-accent', categoryAccent(label));
        target.append(b);
      }
    }
    for (const b of target.children) {
      b.setAttribute('aria-pressed', String(b.dataset.value === select.value));
      b.disabled = select.disabled;
    }
  }
  function renderQuickChoices() {
    const m = getDraft();
    if (!m) return;
    const selected = m.accounts.find((a) => a.id === f.elements.account.value),
      entity = selected?.entity || $('budgetEntity').value,
      watch = defaultWatchedAccounts(m, entity).map((id) => m.accounts.find((a) => a.id === id)),
      favorites = [
        ...watch.filter((a) => a.type === 'card').slice(0, 2),
        ...watch.filter((a) => a.type === 'cash').slice(0, 1),
        selected,
      ].filter(Boolean),
      seen = new Set();
    choiceButtons(
      $('entryAccountChoices'),
      f.elements.account,
      favorites.filter((a) => !seen.has(a.id) && seen.add(a.id)).map((a) => [a.id, a.name]),
    );
    const categories = m.budgets
        .filter(
          (b) =>
            b.entity === (f.elements.expenseEntity.value || entity) &&
            !b.seasonal &&
            !b.oneTimeMonth,
        )
        .map((b) => b.name),
      current = f.elements.category.value;
    if (current && !categories.includes(current)) categories.push(current);
    choiceButtons(
      $('entryCategoryChoices'),
      f.elements.category,
      categoryChoices().filter(([id]) => categories.includes(id)),
      { color: true },
    );
    $('entryCategoryChoices').hidden = f.elements.splitPurchase.checked;
    $('entryContextRows').replaceChildren();
    if (!selected) return;
    $('entryContextRows').append(el('strong', selected.name));
    const rows = searchLedger(m, { account: selected.id, to: today() }).slice(0, 6);
    for (const t of rows) {
      const line = el('div');
      line.className = 'entry-context-row';
      line.toggleAttribute(
        'data-debt-private',
        t.kind !== 'expense' &&
          t.kind !== 'refund' &&
          t.entries.some((e) => m.accounts.find((a) => a.id === e.account)?.type !== 'cash'),
      );
      line.append(
        el('small', t.date + ' · ' + t.status),
        el('span', t.description),
        el(
          'strong',
          formatMoney(
            t.entries.filter((e) => e.account === selected.id).reduce((n, e) => n + e.amount, 0),
          ),
        ),
      );
      $('entryContextRows').append(line);
    }
    if (!rows.length)
      $('entryContextRows').append(el('p', 'No recorded activity yet for this account.'));
  }
  function categoryChoices() {
    const choices = [...f.elements.category.options].map((o) => [o.value, o.textContent]);
    return choices.filter(([id]) => id !== 'Split purchase');
  }
  function addSplit(part = {}) {
    const row = el('div');
    row.className = 'split-row';
    const category = el('select');
    category.setAttribute('aria-label', 'Split category');
    options(category, categoryChoices(), part.category || f.elements.category.value);
    const amount = el('input');
    amount.type = 'number';
    amount.min = '0.01';
    amount.step = '0.01';
    amount.inputMode = 'decimal';
    amount.value = part.amount == null ? '' : (part.amount / 100).toFixed(2);
    amount.setAttribute('aria-label', 'Split amount');
    const remove = button('Remove', () => {
      row.remove();
      updateSplitTotal();
    });
    category.onchange = updateSplitTotal;
    amount.oninput = updateSplitTotal;
    row.append(category, amount, remove);
    $('splitRows').append(row);
    updateSplitTotal();
  }
  function updateSplitTotal() {
    let sum = 0;
    for (const row of $('splitRows').children) {
      const value = row.querySelector('input').value;
      try {
        if (value !== '') sum += cents(value);
      } catch {}
    }
    $('splitTotal').textContent = f.elements.splitPurchase.checked
      ? 'Allocated ' +
        formatMoney(sum) +
        ' of ' +
        (f.elements.amount.value
          ? formatMoney(Math.round(Number(f.elements.amount.value) * 100))
          : '$0.00')
      : '';
  }
  f.elements.splitPurchase.onchange = () => {
    if (f.elements.splitPurchase.checked && !$('splitRows').children.length) {
      addSplit({
        category: f.elements.category.value,
        amount: f.elements.amount.value
          ? Math.round(Number(f.elements.amount.value) * 100)
          : undefined,
      });
      addSplit();
    }
    sync();
  };
  $('addSplit').onclick = () => addSplit();
  f.elements.amount.addEventListener('input', updateSplitTotal);
  function fillRefund() {
    const id = f.elements.refundOf.value,
      parts = refundableParts(getDraft(), id, f.elements.editTransactionId.value);
    if (!id) return;
    f.elements.expenseEntity.value =
      getDraft().transactions.find((t) => t.id === id)?.expenseEntity || '';
    $('splitRows').replaceChildren();
    f.elements.amount.value = (parts.reduce((n, p) => n + p.amount, 0) / 100).toFixed(2);
    if (parts.length === 1) {
      f.elements.splitPurchase.checked = false;
      f.elements.category.value = parts[0].category;
    } else {
      f.elements.splitPurchase.checked = true;
      for (const part of parts) addSplit(part);
    }
    sync();
  }
  f.elements.refundOf.onchange = fillRefund;
  f.addEventListener('change', sync);
  f.elements.entryTiming.onchange = sync;
  function fields() {
    const kind = f.elements.kind.value,
      extra = {};
    if (kind === 'refund') {
      if (!f.elements.refundOf.value) throw Error('Choose the purchase this receipt repays.');
      extra.refundOf = f.elements.refundOf.value;
    }
    if (['expense', 'refund'].includes(kind) && f.elements.splitPurchase.checked) {
      extra.allocations = [...$('splitRows').children].map((row) => ({
        category: row.querySelector('select').value,
        amount: cents(row.querySelector('input').value),
      }));
      extra.category =
        extra.allocations.length === 1 ? extra.allocations[0].category : 'Split purchase';
    }
    if (kind === 'transfer') extra.category = 'Transfer';
    return extra;
  }
  function load(t) {
    render(getDraft());
    status();
    $('refreshTransactionEntry').hidden = true;
    $('splitRows').replaceChildren();
    f.elements.entryTiming.value = 'actual';
    f.elements.refundOf.value = t.refundOf || '';
    f.elements.splitPurchase.checked = !!t.allocations;
    for (const part of t.allocations || []) addSplit(part);
    if (t.allocations && !categoryChoices().some(([id]) => id === 'Split purchase')) {
      const o = el('option', 'Split purchase');
      o.value = 'Split purchase';
      f.elements.category.append(o);
    }
    if (t.allocations) f.elements.category.value = t.category;
    show();
  }
  function quick(kind, { account, to, description, refundOf } = {}) {
    const m = getDraft(),
      pref = preference(),
      entity = $('budgetEntity').value;
    f.reset();
    $('splitRows').replaceChildren();
    f.elements.editTransactionId.value = '';
    f.elements.scheduleKey.value = '';
    f.elements.date.value = today();
    f.elements.entryTiming.value = 'actual';
    f.elements.kind.value = kind;
    f.elements.description.value = description || '';
    const wanted = account || pref[kind]?.account;
    if (wanted && m.accounts.some((a) => a.id === wanted && a.entity === entity))
      f.elements.account.value = wanted;
    else
      f.elements.account.value =
        m.accounts.find((a) => a.type === 'cash' && a.entity === entity)?.id || '';
    if (to) f.elements.to.value = to;
    const category = pref[kind]?.category;
    if (category) f.elements.category.value = category;
    f.elements.status.value = 'cleared';
    status();
    $('refreshTransactionEntry').hidden = true;
    render(m);
    show();
    if (refundOf) {
      f.elements.refundOf.value = refundOf;
      fillRefund();
    }
    f.dispatchEvent(new window.Event('change'));
    f.elements.amount.focus();
  }
  for (const [id, kind] of [
    ['quickPurchase', 'expense'],
    ['quickIncome', 'income'],
    ['quickRefund', 'refund'],
  ])
    $(id).onclick = () => quick(kind);
  $('quickCardPayment').onclick = () => {
    const m = getDraft(),
      entity = $('budgetEntity').value;
    quick('transfer', {
      account: m.accounts.find((a) => a.type === 'cash' && a.entity === entity)?.id,
      to: m.accounts.find((a) => a.type === 'card' && a.entity === entity)?.id,
      description: 'Card payment',
    });
  };
  $('quickWallet').onclick = () => {
    revealSection($('walletEntry'));
    $('walletEntry').scrollIntoView({ behavior: 'smooth' });
  };
  function remember(t) {
    view.clearTimeout(receiptTimer);
    receiptTimer = view.setTimeout(() => {
      $('entryReceipt').hidden = true;
    }, 5000);
    $('entryReceipt').hidden = false;
    $('entryReceipt').textContent =
      'Saved · ' + t.description + ' · ' + formatMoney(Math.abs(t.entries[0].amount));
    $('entryReceipt').toggleAttribute(
      'data-debt-private',
      t.kind === 'transfer' &&
        t.entries.some((e) => getDraft().accounts.find((a) => a.id === e.account)?.type !== 'cash'),
    );
    try {
      const p = preference();
      p[t.kind] = { account: t.entries[0].account, category: t.category };
      window.localStorage.setItem('money_entry_defaults_' + getOwner(), JSON.stringify(p));
    } catch {}
    status('Saved. Account balances and category amounts are updated.');
    $('splitRows').replaceChildren();
    sync();
  }
  const ledgerControls = [
    'ledgerQuery',
    'ledgerAccount',
    'ledgerCategory',
    'ledgerStatus',
    'ledgerFrom',
    'ledgerTo',
  ];
  function ledger() {
    const m = getDraft();
    if (!m) return;
    const filter = {
        query: $('ledgerQuery').value,
        account: $('ledgerAccount').value,
        category: $('ledgerCategory').value,
        status: $('ledgerStatus').value,
        from: $('ledgerFrom').value,
        to: $('ledgerTo').value,
        entity: $('budgetEntity').value,
      },
      key =
        JSON.stringify(filter) +
        JSON.stringify(m.transactions) +
        m.accounts.map((a) => a.name).join('|');
    if (key === lastLedger) return;
    lastLedger = key;
    const rows = searchLedger(m, filter);
    $('ledgerRows').replaceChildren();
    for (const t of rows.slice(0, 300)) {
      const tr = el('tr');
      tr.toggleAttribute(
        'data-debt-private',
        t.kind !== 'expense' &&
          t.kind !== 'refund' &&
          t.entries.some((e) => m.accounts.find((a) => a.id === e.account)?.type !== 'cash'),
      );
      const parts = spendingParts(t),
        values = [
          t.date,
          t.description,
          t.kind,
          parts.length
            ? parts.map((p) => p.category + ' ' + formatMoney(p.amount)).join(' · ')
            : t.category || '—',
          t.entries
            .map(
              (e) => m.accounts.find((a) => a.id === e.account)?.name + ' ' + formatMoney(e.amount),
            )
            .join(' → '),
          t.status,
        ];
      for (const [i, v] of values.entries()) {
        const td = el('td', v);
        td.dataset.label = ['Date', 'Description', 'Type', 'Categories', 'Accounts', 'Status'][i];
        tr.append(td);
      }
      const actions = el('td');
      actions.dataset.label = 'Actions';
      actions.append(
        button('Edit', () => record(t)),
        button('Remove', () => remove(t)),
      );
      if (t.kind === 'expense' && refundableParts(m, t.id).length)
        actions.append(
          button('Refund / repayment', () => {
            quick('refund', {
              account: t.entries[0].account,
              description: 'Refund / repayment: ' + t.description,
              refundOf: t.id,
            });
          }),
        );
      tr.append(actions);
      $('ledgerRows').append(tr);
    }
    $('ledgerCount').textContent =
      rows.length +
      ' matching entries' +
      (rows.length > 300 ? ' · first 300 shown; narrow the filters' : '');
    sectionPreview(
      'activitySection',
      m.transactions.length + ' recorded entries · Search purchases, bills, income and transfers',
    );
  }
  $('openTransactionEntry').onclick = () => quick('expense');
  for (const id of ledgerControls)
    $(id).addEventListener(id === 'ledgerQuery' ? 'input' : 'change', ledger);
  $('ledgerClear').onclick = () => {
    for (const id of ledgerControls) $(id).value = '';
    lastLedger = '';
    ledger();
  };
  function wallet(m) {
    const entity = $('budgetEntity').value,
      wallets = m.accounts.filter((a) => a.wallet && a.entity === entity),
      bank = m.accounts.filter((a) => a.type === 'cash' && !a.wallet && a.entity === entity);
    $('walletSetup').hidden = !!wallets.length;
    $('walletActions').hidden = !wallets.length;
    options(
      $('walletSelect'),
      wallets.map((a) => [a.id, a.name]),
    );
    options(
      $('walletBank'),
      bank.map((a) => [a.id, a.name]),
    );
    $('walletBalance').textContent = wallets.length
      ? 'Tracked cash ' + formatMoney(balances(m, today())[$('walletSelect').value])
      : 'Create a cash wallet to track physical cash separately from bank withdrawals.';
  }
  $('createWallet').onclick = () => {
    try {
      const amount = cents($('walletOpening').value || '0');
      if (amount < 0) throw Error('Enter a nonnegative physical cash count.');
      updateDraft((next) => {
        const id = crypto.randomUUID();
        next.accounts.push({
          id,
          name: $('walletName').value.trim() || 'Cash wallet',
          entity: $('budgetEntity').value,
          type: 'cash',
          wallet: true,
          opening: 0,
          reserve: 0,
        });
        if (amount)
          next.transactions.push({
            id: crypto.randomUUID(),
            date: today(),
            kind: 'adjustment',
            status: 'reconciled',
            description: 'Initial physical cash count',
            note: 'Cash tracking begins with the supplied count on this date.',
            entries: [{ account: id, amount }],
          });
        return next;
      });
      message(
        'Cash wallet added to preview. Save changes keeps the account and supplied cash count.',
      );
    } catch (e) {
      message(e.message);
    }
  };
  $('walletSelect').onchange = () => wallet(getDraft());
  $('walletWithdraw').onclick = () =>
    quick('transfer', {
      account: $('walletBank').value,
      to: $('walletSelect').value,
      description: 'Cash withdrawal',
    });
  $('walletSpend').onclick = () =>
    quick('expense', { account: $('walletSelect').value, description: 'Cash spending' });
  $('walletReturn').onclick = () =>
    quick('transfer', {
      account: $('walletSelect').value,
      to: $('walletBank').value,
      description: 'Unspent cash returned',
    });
  function render(m) {
    if (!m) return;
    const choices = [['', 'All accounts'], ...m.accounts.map((a) => [a.id, a.name])];
    options($('ledgerAccount'), choices);
    const categories = [
      ...new Set([
        ...m.transactions.flatMap((t) => spendingParts(t).map((p) => p.category)),
        ...m.transactions.map((t) => t.category).filter(Boolean),
      ]),
    ].sort();
    options($('ledgerCategory'), [['', 'All categories'], ...categories.map((c) => [c, c])]);
    options(f.elements.refundOf, [
      ['', 'Choose original purchase'],
      ...m.transactions
        .filter(
          (t) =>
            t.kind === 'expense' &&
            transactionOwner(m, t) === $('budgetEntity').value &&
            refundableParts(m, t.id, f.elements.editTransactionId.value).length,
        )
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((t) => [
          t.id,
          t.date + ' · ' + t.description + ' · ' + formatMoney(Math.abs(t.entries[0].amount)),
        ]),
    ]);
    wallet(m);
    ledger();
    sync();
  }
  function clear() {
    view.clearTimeout(receiptTimer);
    close();
    $('entryReceipt').hidden = true;
    $('entryReceipt').textContent = '';
    lastLedger = '';
    $('ledgerRows').replaceChildren();
    for (const id of ['entryAccountChoices', 'entryCategoryChoices', 'entryContextRows']) {
      $(id).replaceChildren();
      delete $(id).dataset.choices;
    }
    $('ledgerCount').textContent = '';
    for (const id of ['ledgerAccount', 'ledgerCategory', 'walletSelect', 'walletBank'])
      $(id).replaceChildren();
    $('walletBalance').textContent = '';
    for (const select of f.querySelectorAll('.accountOptions')) select.replaceChildren();
    $('splitRows').replaceChildren();
    status();
    $('refundEntry').hidden = true;
    f.elements.refundOf.replaceChildren();
    $('refreshTransactionEntry').hidden = true;
    sectionPreview('activitySection', '');
  }
  function capture() {
    return {
      fields: [...f.elements]
        .filter((x) => x.name)
        .map((x) => ({ name: x.name, value: x.value, checked: x.checked })),
      splits: [...$('splitRows').children].map((r) => ({
        category: r.querySelector('select').value,
        raw: r.querySelector('input').value,
      })),
    };
  }
  function restore(state) {
    for (const item of state.fields) {
      const input = f.elements[item.name];
      if (input) {
        if (
          input.tagName === 'SELECT' &&
          item.value &&
          ![...input.options].some((o) => o.value === item.value)
        ) {
          const o = el('option', item.value);
          o.value = item.value;
          input.append(o);
        }
        input.value = item.value;
        if (input.type === 'checkbox') input.checked = item.checked;
      }
    }
    $('splitRows').replaceChildren();
    for (const part of state.splits) {
      addSplit({ category: part.category });
      $('splitRows').lastElementChild.querySelector('input').value = part.raw;
    }
    show();
    updateSplitTotal();
  }
  return {
    render,
    load,
    fields,
    quick,
    remember,
    status,
    show,
    close,
    clear,
    sync,
    capture,
    restore,
  };
}
