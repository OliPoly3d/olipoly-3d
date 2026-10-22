// Pure cash-flow functions. Amounts are signed integer cents; card debt is negative.
export const statuses = ['pending', 'cleared', 'reconciled'];
export function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Use a complete calendar date.');
  const d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== value) throw Error('Invalid date.');
  return d;
}
export const iso = d => d.toISOString().slice(0, 10);
export function addDays(value, days) { const d = date(value); d.setUTCDate(d.getUTCDate() + days); return iso(d); }
export function cents(value) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(String(value))) throw Error('Enter dollars with at most two decimal places.');
  const n = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(n)) throw Error('Amount is too large.');
  return n;
}
function integer(n) { if (!Number.isSafeInteger(n)) throw Error('Amounts must be integer cents.'); }
function unique(items) {
  if (new Set(items.map(x => x.id)).size !== items.length || items.some(x => typeof x.id !== 'string' || !x.id)) throw Error('Missing or duplicate ID.');
}
export function validate(model) {
  if (model.version !== 1) throw Error('Unsupported Money file version.');
  date(model.start);
  for (const k of ['accounts', 'transactions', 'schedules']) {
    if (!Array.isArray(model[k])) throw Error('Missing ' + k);
    unique(model[k]);
  }
  const ids = new Set(model.accounts.map(x => x.id));
  for (const a of model.accounts) {
    if (!a.name || !['household', 'business', 'custodial'].includes(a.entity) || !['cash', 'card', 'loan'].includes(a.type)) throw Error('Invalid account.');
    integer(a.opening); integer(a.reserve);
    if(a.balanceUnknown!==undefined&&typeof a.balanceUnknown!=='boolean')throw Error('Invalid unknown-balance flag.');
    if(a.summaryPriority!==undefined&&(!Number.isSafeInteger(a.summaryPriority)||a.summaryPriority<0))throw Error('Invalid account summary priority.');
  }
  const keys = new Set();
  for (const t of model.transactions) {
    date(t.date);
    if (t.date < model.start) throw Error('Transaction predates opening balances.');
    if (!statuses.includes(t.status)) throw Error('Invalid transaction status.');
    if (t.scheduleKey) {
      if (keys.has(t.scheduleKey)) throw Error('Scheduled payment already recorded.');
      keys.add(t.scheduleKey);
    }
    if (!t.description || !Array.isArray(t.entries) || !t.entries.length) throw Error('Missing transaction details.');
    for (const e of t.entries) { if (!ids.has(e.account)) throw Error('Unknown account.'); integer(e.amount); }
    if (t.kind === 'transfer' && (t.entries.length !== 2 || t.entries[0].account === t.entries[1].account || t.entries.reduce((n,e)=>n+e.amount,0) !== 0)) throw Error('Transfer must balance across two accounts.');
    if (!['expense','income','transfer','adjustment'].includes(t.kind)) throw Error('Invalid transaction kind.');
    if (t.kind !== 'transfer' && t.entries.length !== 1) throw Error('Use one account for this transaction.');
    if (t.kind === 'expense' && (!t.category || t.entries[0].amount >= 0)) throw Error('Expense needs a category and negative amount.');
    if (t.kind === 'income' && t.entries[0].amount <= 0) throw Error('Income must be positive.');
  }
  for (const s of model.schedules) {
    date(s.anchor); if (s.end) date(s.end);
    if (!s.name || !ids.has(s.account) || !['monthly','biweekly'].includes(s.frequency)) throw Error('Invalid schedule.');
    if (s.to && (!ids.has(s.to) || s.to === s.account)) throw Error('Invalid transfer destination.');
    integer(s.amount); integer(s.firstPayBonus || 0);
    if (s.to && s.amount >= 0) throw Error('Transfer schedule amount must be negative.');
    if (s.frequency === 'monthly' && (!Number.isInteger(s.day) || s.day < 1 || s.day > 31)) throw Error('Invalid monthly day.');
    for (const p of s.changes || []) { date(p.date); integer(p.amount); }
    for (const skipped of s.skipped || []) date(skipped);
    if(s.stoppedFrom)date(s.stoppedFrom);
    for (const [key, o] of Object.entries(s.overrides || {})) {
      date(key); if (o.date) date(o.date); integer(o.amount);
      if (o.account && !ids.has(o.account)) throw Error('Unknown expected account.');
      if (o.to && (!s.to || !ids.has(o.to))) throw Error('Unknown expected transfer destination.');
      if (s.to && (o.amount > 0 || (o.account||s.account)===(o.to||s.to))) throw Error('Expected transfer must be outgoing to a different account.');
      if (!s.to && s.amount > 0 && o.amount < 0) throw Error('Expected income cannot be negative.');
      if (!s.to && s.amount < 0 && o.amount > 0) throw Error('Expected expense cannot be positive.');
      if (o.date && o.date < model.start) throw Error('Expected date predates opening balances.');
    }
  }
  return model;
}
export function occurrences(model, end, {includeSkipped=false}={}) {
  const matched = new Set(model.transactions.map(t => t.scheduleKey).filter(Boolean));
  const result = [];
  for (const s of model.schedules) {
    if (s.enabled === false) continue;
    let day = s.anchor;
    const limit = s.end && s.end < end ? s.end : end;
    let month = date(s.anchor); month.setUTCDate(1);
    for (let count = 0; count < 20000; count++) {
      if (s.frequency === 'monthly') {
        const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth()+1, 0)).getUTCDate();
        day = iso(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(s.day,last))));
      }
      // Overrides may move an occurrence across a month boundary, in either direction.
      const nominalDay = day;
      const override = s.overrides?.[nominalDay];
      if (day > limit && !Object.keys(s.overrides || {}).some(k => k >= day && s.overrides[k].date <= limit)) break;
      const key = `${s.id}:${day}`;
      const skipped=(s.skipped||[]).includes(day);
      if (day >= s.anchor && day >= model.start && (!s.stoppedFrom||day<s.stoppedFrom) && !matched.has(key) && (!skipped||includeSkipped)) {
        let amount = [...(s.changes || [])].sort((a,b)=>a.date.localeCompare(b.date)).filter(x=>x.date<=day).at(-1)?.amount ?? s.amount;
        if (s.frequency === 'biweekly' && addDays(day,-14).slice(0,7) !== day.slice(0,7)) amount += s.firstPayBonus || 0;
        if (override) amount = override.amount;
        const eventDate = override?.date || day;
        const entries = [{account:override?.account || s.account,amount}];
        if (s.to) entries.push({account:override?.to || s.to,amount:-amount});
        if (eventDate <= end && (!s.end || nominalDay <= s.end)) result.push({id:key,scheduleKey:key,nominalDate:nominalDay,date:eventDate,description:s.name,kind:s.to?'transfer':(amount<0 || amount===0&&s.amount<0)?'expense':'income',category:s.category||'Scheduled',status:'forecast',entries,estimated:s.estimated===true,skipped,expenseEntity:s.expenseEntity,funding:s.funding});
      }
      if (s.frequency === 'biweekly') day = addDays(day,14);
      else month.setUTCMonth(month.getUTCMonth()+1);
    }
  }
  return result;
}
export function balances(model, asOf, postedOnly=false) {
  const out = Object.fromEntries(model.accounts.map(a=>[a.id,a.opening]));
  for (const t of model.transactions) if (t.date<=asOf && (!postedOnly || t.status!=='pending')) for (const e of t.entries) out[e.account]+=e.amount;
  return out;
}
export function forecast(model, end, plannedEvents = []) {
  validate(model); date(end);
  if (end < model.start || +date(end)- +date(model.start)> 1130*86400000) throw Error('Choose an end date within 36 months.');
  for (const t of plannedEvents) {date(t.date); for (const e of t.entries) {integer(e.amount);if (!model.accounts.some(a=>a.id===e.account)) throw Error('Unknown planned account.');}}
  const events = [...model.transactions, ...occurrences(model,end), ...plannedEvents].filter(t=>t.date<=end && t.date>=model.start).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const grouped = new Map();
  for (const e of events) { if(!grouped.has(e.date)) grouped.set(e.date,[]); grouped.get(e.date).push(e); }
  const running = Object.fromEntries(model.accounts.map(a=>[a.id,a.opening]));
  const days=[];
  for(let day=model.start;day<=end;day=addDays(day,1)) {
    const opening={...running}; const low={...running}; const today=grouped.get(day)||[];
    // Per-account debit-first low is conservative when same-day settlement order is unknown.
    for (const t of today) for(const e of t.entries) if(e.amount<0) low[e.account]+=e.amount;
    for (const t of today) for(const e of t.entries) running[e.account]+=e.amount;
    days.push({date:day,opening,closing:{...running},low,events:today});
  }
  return days;
}
export function monthly(days, account) {
  const groups=new Map();
  for(const d of days) {
    const key=d.date.slice(0,7);
    const g=groups.get(key)||{month:key,opening:d.opening[account],closing:0,low:Infinity};
    g.closing=d.closing[account];g.low=Math.min(g.low,d.low[account]);groups.set(key,g);
  }
  return [...groups.values()];
}
export function spending(model, month) {
  const totals={};
  for(const t of model.transactions) if(t.kind==='expense' && t.date.startsWith(month)) {
    const entity=t.expenseEntity||model.accounts.find(a=>a.id===t.entries[0].account).entity;
    const key=`${entity}: ${t.category}`;totals[key]=(totals[key]||0)-t.entries[0].amount;
  }
  return totals;
}
