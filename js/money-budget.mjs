import {date, iso, addDays, occurrences} from './money-engine.mjs';

export function monthBounds(month) {
  date(month + '-01');
  const last = date(month + '-01');
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  return {first: month + '-01', last: iso(last), days: last.getUTCDate()};
}
export function shiftMonth(month, delta) {
  const d = date(month + '-01');
  d.setUTCMonth(d.getUTCMonth() + delta);
  return iso(d).slice(0, 7);
}
const normalized = value => String(value || '').trim().toLowerCase();
function entityOf(model, transaction) {
  return transaction.expenseEntity || model.accounts.find(a => a.id === transaction.entries[0].account)?.entity;
}
export function validateBudgets(model) {
  const budgets = model.budgets || [];
  if (!Array.isArray(budgets)) throw Error('Invalid budgets.');
  const ids = new Set(), categories = new Set();
  for (const b of budgets) {
    if (!b.id || ids.has(b.id) || !b.name || !['household', 'business', 'custodial'].includes(b.entity)) throw Error('Invalid budget category.');
    ids.add(b.id);
    for (const name of new Set([b.name, ...(b.aliases || [])].map(normalized))) {
      const key = b.entity + ':' + name;
      if (!name || categories.has(key)) throw Error('Budget categories overlap.');
      categories.add(key);
    }
    for (const collection of [b.monthly || {}, b.overrides || {}]) {
      for (const [month, amount] of Object.entries(collection)) {
        monthBounds(month);
        if (!Number.isSafeInteger(amount) || amount < 0) throw Error('Budget must be nonnegative integer cents.');
      }
    }
  }
  return model;
}

// One owner/category/month calculation for every card, cash account and chart.
// Pending purchases consume a bucket; transfers, card payments and openings do not.
export function budgetMonth(model, month, entity, asOf) {
  validateBudgets(model);
  const bounds = monthBounds(month);
  date(asOf);
  const cutoff = asOf < bounds.last ? asOf : bounds.last;
  const transactions = model.transactions.filter(t => t.kind === 'expense' &&
    t.date >= bounds.first && t.date <= cutoff && entityOf(model, t) === entity);
  const used = new Set();
  const buckets = (model.budgets || []).filter(b => b.entity === entity).map(b => {
    const names = new Set([b.name, ...(b.aliases || [])].map(normalized));
    const matches = transactions.filter(t => names.has(normalized(t.category)));
    matches.forEach(t => used.add(t.id));
    const spent = matches.reduce((n, t) => n - t.entries[0].amount, 0);
    const pending = matches.filter(t => t.status === 'pending').reduce((n, t) => n - t.entries[0].amount, 0);
    const full = b.monthly?.[month] ?? null;
    let allowance = b.overrides?.[month] ?? full;
    const partial = model.start.slice(0, 7) === month && model.start > bounds.first && b.prorate !== false;
    if (allowance !== null && partial && b.overrides?.[month] === undefined) {
      allowance = Math.round(allowance * (bounds.days - Number(model.start.slice(-2)) + 1) / bounds.days);
    }
    if (bounds.last < model.start) allowance = null;
    return {...b, full, allowance, spent, pending, partial, remaining: allowance === null ? null : allowance - spent};
  });
  const outside = transactions.filter(t => !used.has(t.id));
  const totals = buckets.reduce((n, b) => ({
    budget: n.budget + (b.allowance || 0), spent: n.spent + b.spent,
    pending: n.pending + b.pending, remaining: n.remaining + (b.remaining ?? 0)
  }), {budget: 0, spent: 0, pending: 0, remaining: 0});
  return {month, buckets, totals, outside, missing: buckets.filter(b => b.allowance === null).length};
}

export function billsMonth(model, month, entity, asOf) {
  const {first, last} = monthBounds(month);
  // Include expected occurrences even when matched, then attach the actual once.
  const expected = occurrences({...model, transactions: []}, last).filter(t =>
    t.date >= first && t.entries.some(e => e.amount < 0 && model.accounts.find(a => a.id === e.account)?.entity === entity));
  const actuals = new Map(model.transactions.filter(t => t.scheduleKey).map(t => [t.scheduleKey, t]));
  return expected.map(t => {
    const actual = actuals.get(t.scheduleKey);
    return {...t, actual, state: actual ? actual.status : t.date < asOf ? 'unrecorded' : 'upcoming'};
  });
}
