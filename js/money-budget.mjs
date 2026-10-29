import {date, iso, addDays, occurrences} from './money-engine.mjs';
import {validateCredit} from './money-credit.mjs';
import {validateSavings} from './money-savings.mjs';
import {validateReviews} from './money-review.mjs';

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
export function weeklyDates(month,weekday,start=month+'-01'){
 const bounds=monthBounds(month);if(!Number.isInteger(weekday)||weekday<0||weekday>6)throw Error('Choose a charge weekday.');date(start);
 const dates=[];for(let d=start>bounds.first?start:bounds.first;d<=bounds.last;d=addDays(d,1))if(date(d).getUTCDay()===weekday)dates.push(d);return dates;
}
export function addOneTimeBudget(model,{id,name,month,amount,entity,account}){
 monthBounds(month);if(!name?.trim()||!Number.isSafeInteger(amount)||amount<0)throw Error('Enter a name and nonnegative budget amount.');
 if(!model.accounts.some(a=>a.id===account&&a.type==='cash'&&a.entity===entity))throw Error('Choose a cash account belonging to this view.');
 const next=structuredClone(model);next.budgets=[...(next.budgets||[]),{id,name:name.trim(),entity,account,oneTimeMonth:month,prorate:false,monthly:{[month]:amount}}];return validateBudgets(next);
}
const normalized = value => String(value || '').trim().toLowerCase();
function entityOf(model, transaction) {
  return transaction.expenseEntity || model.accounts.find(a => a.id === transaction.entries[0].account)?.entity;
}
export function validateBudgets(model) {
  validateCredit(model);
  validateSavings(model);
  validateReviews(model);
  if(model.planning?.budgetTiming&&!['weekly','month-end'].includes(model.planning.budgetTiming))throw Error('Choose weekly or month-end budget timing.');
  const budgets = model.budgets || [];
  if (!Array.isArray(budgets)) throw Error('Invalid budgets.');
  const ids = new Set(), categories = new Set();
  for (const b of budgets) {
    if (!b.id || ids.has(b.id) || !b.name || !['household', 'business', 'custodial'].includes(b.entity)) throw Error('Invalid budget category.');
    ids.add(b.id);
    if(b.weekday!==undefined&&(!Number.isInteger(b.weekday)||b.weekday<0||b.weekday>6))throw Error('Choose a valid weekly spending day.');
    if(b.oneTimeMonth)monthBounds(b.oneTimeMonth);
    for(const [month,t] of Object.entries(b.timing||{})){const bounds=monthBounds(month);if(!['daily','weekly','date','month-end'].includes(t.mode))throw Error('Choose valid budget timing.');if(t.mode==='weekly'&&(!Number.isInteger(t.weekday)||t.weekday<0||t.weekday>6))throw Error('Choose a weekday.');if(t.mode==='date'){date(t.date);if(t.date<bounds.first||t.date>bounds.last)throw Error('Budget date must be within its month.');}}
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
  const seasonalIds = new Set();
  for (const item of model.seasonalItems || []) {
    if (!item.id || seasonalIds.has(item.id) || !item.name || !['household','business','custodial'].includes(item.entity) || !Number.isInteger(item.month) || item.month < 1 || item.month > 12 || !Number.isSafeInteger(item.amount)) throw Error('Invalid seasonal item.');
    seasonalIds.add(item.id);
    for (const change of item.changes || []) if (!Number.isInteger(change.year) || change.year < 1900 || !Number.isSafeInteger(change.amount)) throw Error('Invalid yearly seasonal change.');
    for (const [month, amount] of Object.entries(item.overrides || {})) {monthBounds(month);if (!Number.isSafeInteger(amount)) throw Error('Invalid seasonal amount.');}
  }
  const accounts = new Map(model.accounts.map(a=>[a.id,a]));
  for (const b of budgets) if (b.account && accounts.get(b.account)?.type !== 'cash') throw Error('Choose a cash account to fund this budget.');
  for (const b of budgets) for (const [month,account] of Object.entries(b.funding||{})) {monthBounds(month);if(accounts.get(account)?.type!=='cash'||accounts.get(account)?.entity!==b.entity)throw Error('Invalid monthly budget funding account.');}
  for (const p of model.planning?.cardPayoffs || []) {
    if (accounts.get(p.card)?.type !== 'card' || accounts.get(p.from)?.type !== 'cash' || accounts.get(p.card).entity !== accounts.get(p.from).entity) throw Error('Invalid card payoff plan.');
  }
  return model;
}

export function seasonalMonth(model, month, entity) {
  monthBounds(month);
  const items = (model.seasonalItems || []).filter(i=>i.entity===entity && i.month===Number(month.slice(-2))).map(i=>{
    const yearly=[...(i.changes||[])].filter(c=>c.year<=Number(month.slice(0,4))).sort((a,b)=>a.year-b.year).at(-1)?.amount ?? i.amount;
    return {...i,expected:i.overrides?.[month] ?? yearly};
  });
  return {items,total:items.reduce((n,i)=>n+i.expected,0)};
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
  const buckets = (model.budgets || []).filter(b => b.entity === entity&&(!b.oneTimeMonth||b.oneTimeMonth===month)).map(b => {
    const names = new Set([b.name, ...(b.aliases || [])].map(normalized));
    const matches = transactions.filter(t => names.has(normalized(t.category)));
    matches.forEach(t => used.add(t.id));
    const spent = matches.reduce((n, t) => n - t.entries[0].amount, 0);
    const pending = matches.filter(t => t.status === 'pending').reduce((n, t) => n - t.entries[0].amount, 0);
    const seasonal = b.seasonal && model.seasonalItems?.length ? seasonalMonth(model,month,entity).total : null;
    const full = seasonal === null ? b.monthly?.[month] ?? null : Math.max(0,seasonal);
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
