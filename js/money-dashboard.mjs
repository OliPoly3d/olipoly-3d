import {budgetMonth, billsMonth, monthBounds, shiftMonth} from './money-budget.mjs';

const $ = id => document.getElementById(id);
const dollars = n => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(n / 100);
const monthName = month => new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(month + '-01T00:00:00Z'));
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function bar(width, cls) {
  const track = el('div', undefined, 'bar-track');
  const fill = el('span', undefined, cls);
  fill.style.width = Math.min(100, Math.max(0, width)) + '%';
  track.append(fill);
  track.setAttribute('aria-hidden', 'true');
  return track;
}

export function setupDashboard({getModel, today, saveTarget, record, action}) {
  function view(name) {
    for (const button of document.querySelectorAll('[data-view]')) {
      const active = button.dataset.view === name;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      $('view-' + button.dataset.view).hidden = !active;
    }
  }
  for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => view(button.dataset.view);
  const tabs = [...document.querySelectorAll('[data-view]')];
  tabs.forEach((button, index) => button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    view(tabs[next].dataset.view); tabs[next].focus();
  }));
  $('addExpense').onclick = () => {view('activity'); $('transactionForm').elements.description.focus();};
  $('budgetMonth').value = today().slice(0, 7);
  for (const [id, offset] of [['prevMonth', -1], ['nextMonth', 1]]) $(id).onclick = () => action(async () => {
    const next = shiftMonth($('budgetMonth').value, offset);
    if (next < $('budgetMonth').min || next > $('budgetMonth').max) return;
    $('budgetMonth').value = next; render();
  });
  $('budgetMonth').onchange = () => action(async () => render());
  $('budgetEntity').onchange = () => action(async () => render());
  $('trendBucket').onchange = () => action(async () => render());
  $('budgetForm').onsubmit = event => {
    event.preventDefault();
    action(async () => {
      const f = new FormData(event.target);
      await saveTarget(f.get('bucket'), f.get('month'), f.get('amount'));
    });
  };
  function clear() {
    for (const id of ['buckets', 'budgetMetrics', 'budgetTrend', 'outsideSpending', 'billList', 'unknownBills', 'categoryNames', 'editBucket', 'trendBucket']) $(id).replaceChildren();
    for (const id of ['budgetHeading', 'budgetPeriod', 'budgetPercent', 'billSummary']) $(id).textContent = '';
    $('budgetRing').style.removeProperty('--used');
    $('budgetRing').removeAttribute('aria-label');
    view('budget');
  }
  function render() {
    const model = getModel();
    if (!model) return;
    const min = model.start.slice(0, 7), max = shiftMonth(min, 35);
    const monthInput = $('budgetMonth');
    monthInput.min = min; monthInput.max = max;
    if (!monthInput.value || monthInput.value < min) monthInput.value = min;
    if (monthInput.value > max) monthInput.value = max;
    const month = monthInput.value, entity = $('budgetEntity').value;
    const result = budgetMonth(model, month, entity, today());
    const {totals, buckets} = result;
    $('budgetHeading').textContent = monthName(month);
    const partial = month === model.start.slice(0, 7) && model.start.slice(-2) !== '01';
    $('budgetPeriod').textContent = partial ? 'Fresh start from ' + model.start + '. Variable targets are prorated through month end.' : 'Monthly targets reset. Purchases include pending activity through ' + today() + '.';
    $('budgetMetrics').replaceChildren();
    for (const [label, amount] of [['Bucket budget', totals.budget], ['Spent + pending', totals.spent], ['Bucket remainder', totals.remaining]]) {
      const card = el('div', undefined, 'metric');
      card.append(el('span', label), el('strong', dollars(amount), amount < 0 ? 'low' : ''));
      $('budgetMetrics').append(card);
    }
    const percent = totals.budget > 0 ? Math.round(totals.spent / totals.budget * 100) : 0;
    $('budgetPercent').textContent = totals.budget > 0 ? percent + '%' : '—';
    $('budgetRing').style.setProperty('--used', Math.min(percent, 100) + '%');
    $('budgetRing').setAttribute('aria-label', dollars(totals.spent) + ' recorded against ' + dollars(totals.budget) + ' budget');
    $('buckets').replaceChildren();
    if (!buckets.length) $('buckets').append(el('p', 'No category budgets are configured for this view.'));
    for (const b of buckets) {
      const card = el('article', undefined, 'bucket' + (b.remaining !== null && b.remaining < 0 ? ' over' : ''));
      const head = el('div', undefined, 'bucket-head');
      head.append(el('h3', b.name), el('strong', b.remaining === null ? 'Set target' : dollars(Math.abs(b.remaining)) + (b.remaining < 0 ? ' over' : ' left')));
      card.append(head, bar(b.allowance ? b.spent / b.allowance * 100 : b.spent ? 100 : 0, 'bucket-fill'));
      card.append(el('p', dollars(b.spent) + ' spent · ' + (b.allowance === null ? 'No target for this month' : dollars(b.allowance) + ' budget')));
      if (b.pending) card.append(el('small', dollars(b.pending) + ' pending included'));
      const edit = el('button', 'Edit target', 'quiet');
      edit.onclick = () => {
        $('editBucket').value = b.id; $('editBudgetMonth').value = month;
        $('budgetForm').elements.amount.value = b.allowance === null ? '' : (b.allowance / 100).toFixed(2);
        $('budgetForm').closest('details').open = true;
        $('budgetForm').elements.amount.focus();
      };
      card.append(edit); $('buckets').append(card);
    }
    if (result.missing) $('buckets').append(el('p', result.missing + ' categories need a target. Missing targets are excluded from budget and remainder totals.', 'notice wide'));
    $('editBucket').replaceChildren();
    for (const b of buckets) {const o = el('option', b.name); o.value = b.id; $('editBucket').append(o);}
    const trendSelection = $('trendBucket').value;
    $('trendBucket').replaceChildren();
    const all = el('option', 'All buckets'); all.value = ''; $('trendBucket').append(all);
    for (const b of buckets) {const o = el('option', b.name); o.value = b.id; $('trendBucket').append(o);}
    if (buckets.some(b => b.id === trendSelection)) $('trendBucket').value = trendSelection;
    $('editBudgetMonth').value = month; $('editBudgetMonth').min = min; $('editBudgetMonth').max = max;
    $('categoryNames').replaceChildren();
    const names = new Set([...(model.budgets || []).map(b => b.name), ...model.schedules.map(s => s.category).filter(Boolean)]);
    for (const name of names) {const o = el('option'); o.value = name; $('categoryNames').append(o);}
    $('outsideSpending').replaceChildren();
    const outside = new Map();
    for (const t of result.outside) outside.set(t.category, (outside.get(t.category) || 0) - t.entries[0].amount);
    for (const [name, amount] of outside) {const line = el('div', undefined, 'value-line'); line.append(el('span', name), el('strong', dollars(amount))); $('outsideSpending').append(line);}
    if (!outside.size) $('outsideSpending').append(el('p', 'No other spending recorded this month.'));
    renderTrend(model, month, entity, min, max);
    renderBills(model, month, entity);
  }
  function renderTrend(model, month, entity, min, max) {
    const start = shiftMonth(month, -2) < min ? min : shiftMonth(month, -2);
    const months = Array.from({length: 6}, (_, n) => shiftMonth(start, n)).filter(m => m <= max);
    const category = $('trendBucket').value;
    const data = months.map(m => {
      const result = budgetMonth(model, m, entity, today());
      if (!category) return result;
      const bucket = result.buckets.find(b => b.id === category);
      return {month: m, totals: {budget: bucket?.allowance || 0, spent: bucket?.spent || 0}, missing: !bucket || bucket.allowance === null ? 1 : 0};
    });
    const scale = Math.max(1, ...data.flatMap(r => [r.totals.budget, r.totals.spent]));
    $('budgetTrend').replaceChildren();
    for (const r of data) {
      const row = el('div', undefined, 'trend-row');
      row.append(el('strong', monthName(r.month)));
      const pair = el('div', undefined, 'trend-pair');
      const planned = el('div'), actual = el('div');
      planned.append(bar(r.totals.budget / scale * 100, 'planned'), el('span', dollars(r.totals.budget) + (r.missing ? ' · incomplete target' : '')));
      actual.append(bar(r.totals.spent / scale * 100, 'actual'), el('span', dollars(r.totals.spent) + ' recorded'));
      pair.append(planned, actual); row.append(pair); $('budgetTrend').append(row);
    }
  }
  function renderBills(model, month, entity) {
    const bills = billsMonth(model, month, entity, today());
    const pending = bills.filter(b => !b.actual);
    const expected = pending.reduce((sum, b) => sum - b.entries.find(e => e.amount < 0).amount, 0);
    $('billSummary').textContent = pending.length + ' not recorded · ' + dollars(expected) + ' expected. Dates before your opening balance are excluded.';
    $('billList').replaceChildren();
    for (const bill of bills) {
      const outgoing = (bill.actual || bill).entries.find(e => e.amount < 0);
      const account = model.accounts.find(a => a.id === outgoing?.account);
      const card = el('article', undefined, 'bill-card');
      const when = el('div', undefined, 'bill-date');
      when.append(el('strong', bill.date.slice(-2)), el('span', new Intl.DateTimeFormat('en-US', {month: 'short', timeZone: 'UTC'}).format(new Date(bill.date + 'T00:00:00Z'))));
      const info = el('div', undefined, 'bill-info');
      info.append(el('h3', bill.description), el('small', (account?.name || '') + ' · ' + (bill.kind === 'transfer' ? 'Transfer / card payment' : bill.category)));
      info.append(el('small', bill.state + (bill.estimated ? ' · provisional amount/date' : '')));
      if (bill.actual && bill.actual.date !== bill.date) info.append(el('small', 'Recorded on ' + bill.actual.date));
      card.append(when, info, el('strong', dollars(Math.abs(outgoing?.amount || 0))));
      if (!bill.actual) {const b = el('button', 'Record'); b.onclick = () => {view('activity'); record(bill);}; card.append(b);}
      $('billList').append(card);
    }
    if (!bills.length) $('billList').append(el('p', 'No recurring bills scheduled in this view.'));
    $('unknownBills').replaceChildren();
    const unknown = (model.unscheduledBills || []).filter(b => b.entity === entity);
    if (unknown.length) {
      $('unknownBills').append(el('h3', 'Still needs details'));
      for (const bill of unknown) $('unknownBills').append(el('p', bill.name + ' — ' + bill.reason, 'notice'));
    }
  }
  return {render, clear, view};
}
