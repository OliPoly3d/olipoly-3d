import { validate, date, addDays, balances, forecastEnd } from './money-engine.mjs';
import { validateBudgets, monthBounds, shiftMonth } from './money-budget.mjs';
import { installPaymentPlan } from './money-credit.mjs';
import { planningForecast } from './money-planning.mjs';
import { planningSnapshot } from './money-insights.mjs';
import { horizonSummary, clampEnd } from './money-decisions.mjs';
import { savingsSummary, savingsCategory } from './money-savings.mjs';

export const scenarioChangeTypes = [
  'budget',
  'schedule',
  'expense',
  'income',
  'transfer',
  'debt',
  'balance',
];
export function validateScenarioSettings(model) {
  if (model.householdScenarios !== undefined && !Array.isArray(model.householdScenarios))
    throw Error('Invalid saved scenarios.');
  const ids = new Set();
  for (const s of model.householdScenarios || []) {
    if (!s.id || ids.has(s.id) || !s.name?.trim() || !Array.isArray(s.changes))
      throw Error('Give each scenario a unique name and ID.');
    ids.add(s.id);
    date(s.asOf);
    date(s.end);
    for (const c of s.changes)
      if (!scenarioChangeTypes.includes(c.type)) throw Error('Unknown scenario change.');
  }
  return model;
}
export function applyScenarioChanges(model, scenario, { hypotheticalBalances = false } = {}) {
  let next = structuredClone(model);
  const overrides = {};
  for (const [index, c] of scenario.changes.entries()) {
    if (c.type === 'balance') {
      if (hypotheticalBalances) {
        if (!next.accounts.some((a) => a.id === c.account && a.type !== 'cash'))
          throw Error('Choose a debt account for the hypothetical balance.');
        if (!Number.isSafeInteger(c.amount) || c.amount < 0)
          throw Error('Enter a nonnegative hypothetical debt.');
        overrides[c.account] = c.amount;
      }
      continue;
    }
    if (c.type === 'budget') {
      const b = next.budgets?.find((b) => b.id === c.budget);
      if (!b) throw Error('A scenario category no longer exists. Review this scenario.');
      monthBounds(c.month);
      const end = c.through || c.month;
      monthBounds(end);
      if (
        end < c.month ||
        end > forecastEnd(next.start).slice(0, 7) ||
        !Number.isSafeInteger(c.amount) ||
        c.amount < 0
      )
        throw Error('Choose valid category months and a nonnegative target.');
      for (let month = c.month; month <= end; month = shiftMonth(month, 1))
        b.overrides = { ...b.overrides, [month]: c.amount };
    } else if (c.type === 'schedule') {
      const s = next.schedules.find((s) => s.id === c.schedule);
      if (!s) throw Error('A scenario schedule no longer exists. Review this scenario.');
      date(c.when);
      if (c.stop) {
        s.stoppedFrom = c.when;
        continue;
      }
      if (!Number.isSafeInteger(c.amount) || c.amount < 0)
        throw Error('Enter a nonnegative recurring amount.');
      const a = next.accounts.find((a) => a.credit?.scheduleId === s.id);
      if (a) {
        next = installPaymentPlan(next, a.id, {
          mode: 'fixed',
          amount: c.amount,
          day: s.day,
          from: s.account,
          asOf: c.when,
        });
        continue;
      }
      const amount = s.amount < 0 ? -c.amount : c.amount;
      s.changes = [
        ...(s.changes || []).filter(
          (x) => x.date !== c.when && (!c.replaceFuture || x.date < c.when),
        ),
        { date: c.when, amount },
      ].sort((a, b) => a.date.localeCompare(b.date));
    } else if (c.type === 'debt') {
      next = installPaymentPlan(next, c.account, {
        mode: c.mode || 'fixed',
        amount: c.amount,
        day: c.day,
        from: c.from,
        asOf: c.when,
        monthly: c.monthly || {},
      });
    } else {
      date(c.when);
      if (
        c.when < scenario.asOf &&
        !next.transactions.some((t) =>
          t.scheduleKey?.startsWith('scenario:' + scenario.id + ':' + (c.id || index) + ':'),
        )
      )
        throw Error(
          'A one-time scenario date is now in the past. Update it before comparing or applying.',
        );
      if (
        c.when < next.start ||
        !Number.isSafeInteger(c.amount) ||
        c.amount <= 0 ||
        !c.name?.trim()
      )
        throw Error('Enter an expected date, description and positive amount.');
      const id = 'scenario:' + scenario.id + ':' + (c.id || index),
        existing = next.schedules.find((s) => s.id === id);
      const bucket = c.bucket && next.savingsBuckets?.find((b) => b.id === c.bucket),
        account = bucket?.account || c.account,
        s = {
          id,
          name: c.name.trim(),
          anchor: c.when,
          end: c.when,
          day: Number(c.when.slice(-2)),
          frequency: 'monthly',
          oneTime: true,
          account,
          amount: c.type === 'income' ? c.amount : -c.amount,
          category: bucket ? savingsCategory(bucket) : c.category || 'Scenario extras',
          estimated: true,
          note: 'Expected item from scenario ' + scenario.name,
        };
      if (c.type === 'transfer') s.to = c.to;
      if (bucket) s.savingsBucket = bucket.id;
      if (existing) {
        if (next.transactions.some((t) => t.scheduleKey?.startsWith(id + ':'))) {
          if (
            existing.amount !== s.amount ||
            existing.anchor !== s.anchor ||
            existing.account !== s.account
          )
            throw Error(
              'This scenario item was recorded. Add a new expected item for another transaction.',
            );
        } else next.schedules[next.schedules.indexOf(existing)] = s;
      } else next.schedules.push(s);
    }
  }
  validateBudgets(validate(next));
  return hypotheticalBalances ? planningSnapshot(next, scenario.asOf, overrides) : next;
}
export function compareScenario(model, scenario) {
  validateScenarioSettings({ ...model, householdScenarios: [scenario] });
  if (
    scenario.asOf < model.start ||
    scenario.end < scenario.asOf ||
    scenario.end > forecastEnd(model.start)
  )
    throw Error('Choose a scenario period within the available forecast.');
  if (
    !model.accounts.some(
      (a) =>
        a.id === (scenario.account || model.accounts.find((x) => x.type === 'cash')?.id) &&
        a.type === 'cash',
    )
  )
    throw Error('Choose a cash account to watch in this scenario.');
  const base = planningSnapshot(model, scenario.asOf),
    trial = applyScenarioChanges(model, scenario, { hypotheticalBalances: true }),
    before = planningForecast(base, scenario.end),
    after = planningForecast(trial, scenario.end),
    account = scenario.account || model.accounts.find((a) => a.type === 'cash')?.id;
  const summary = (m, p) => {
    const cash = horizonSummary(m, account, scenario.asOf, scenario.end, p),
      last = p.days.at(-1),
      entity = m.accounts.find((a) => a.id === account).entity,
      debts = m.accounts.filter((a) => a.type !== 'cash' && a.entity === entity);
    return {
      ...cash,
      debt: debts.reduce((n, a) => n + Math.max(0, -last.closing[a.id]), 0),
      interest: debts.reduce((n, a) => n + (last.credit?.[a.id]?.interest || 0), 0),
      debtComplete:
        !p.creditWarnings.some(
          (w) => w.includes('interest incomplete') && debts.some((a) => w.startsWith(a.name + ':')),
        ) &&
        !debts.some(
          (a) => a.balanceUnknown && !a.principalSnapshots?.some((s) => s.date <= scenario.asOf),
        ),
    };
  };
  return {
    before: summary(base, before),
    after: summary(trial, after),
    beforeProjection: before,
    afterProjection: after,
    trial,
  };
}
export function affordability(
  model,
  {
    id = 'affordability-preview',
    name = 'Proposed spending',
    when,
    amount,
    account,
    watchAccount,
    budget,
    bucket,
    mode = 'extra',
    scheduleKey,
    asOf,
    end,
  },
) {
  const changes = [];
  let next = structuredClone(model);
  date(when);
  date(asOf);
  if (when > clampEnd(model, end || forecastEnd(model.start)))
    throw Error('Choose a spending date within the comparison horizon.');
  if (when < asOf || !Number.isSafeInteger(amount) || amount <= 0)
    throw Error('Enter a future expected date and a positive amount.');
  if (mode === 'savings') {
    const purpose = model.savingsBuckets?.find((b) => b.id === bucket);
    if (!purpose) throw Error('Choose a savings purpose.');
    account = purpose.account;
  }
  if (!['extra', 'allowance', 'savings', 'existing'].includes(mode))
    throw Error('Choose a spending mode.');
  const source = model.accounts.find((a) => a.id === account),
    watch = model.accounts.find((a) => a.id === watchAccount);
  if (!source || (watch && (watch.type !== 'cash' || watch.entity !== source.entity)))
    throw Error('Choose a cash account belonging to the funding owner.');
  if (mode === 'existing') {
    const s = next.schedules.find((s) => s.id === scheduleKey?.slice(0, -11));
    if (!s) throw Error('Choose an existing expectation.');
    const day = scheduleKey.slice(-10);
    s.overrides = {
      ...s.overrides,
      [day]: {
        ...s.overrides?.[day],
        date: when,
        amount: s.amount < 0 ? -amount : amount,
        account: account || s.account,
      },
    };
  } else {
    const b = budget && next.budgets?.find((b) => b.id === budget);
    if (
      mode === 'allowance' &&
      (!b || b.entity !== source.entity || (b.oneTimeMonth && b.oneTimeMonth !== when.slice(0, 7)))
    )
      throw Error('Choose the category allowance to use.');
    changes.push({
      type: 'expense',
      id,
      name,
      when,
      amount,
      account,
      category: b?.name || 'One-time extra spending',
      bucket: mode === 'savings' ? bucket : undefined,
    });
    next = applyScenarioChanges(next, { id, name, asOf, end, changes });
  }
  const horizon = clampEnd(model, end || monthBounds(shiftMonth(asOf.slice(0, 7), 11)).last),
    base = planningSnapshot(model, asOf),
    trial = planningSnapshot(next, asOf),
    p = planningForecast(base, horizon),
    q = planningForecast(trial, horizon),
    a = model.accounts.find((a) => a.id === account),
    cashAccount =
      watchAccount ||
      (a?.type === 'cash'
        ? a.id
        : model.accounts.find((a) => a.type === 'cash' && a.entity === a?.entity)?.id);
  const before = horizonSummary(base, cashAccount, asOf, horizon, p),
    after = horizonSummary(trial, cashAccount, asOf, horizon, q),
    nearEnd = clampEnd(model, addDays(asOf, 90)),
    shortEnd = nearEnd < horizon ? nearEnd : horizon;
  let fund = null;
  if (mode === 'savings') {
    const b = model.savingsBuckets?.find((b) => b.id === bucket);
    if (!b || b.account !== account)
      throw Error('Choose the bank account for this savings purpose.');
    const day = q.days.find((d) => d.date === when);
    fund = {
      name: b.name,
      after: savingsSummary(
        next,
        when,
        [
          ...new Map(
            [...next.transactions, ...q.days.flatMap((d) => d.events)].map((t) => [t.id, t]),
          ).values(),
        ],
        day.closing,
      ).buckets.find((x) => x.id === b.id).balance,
    };
  }
  return {
    before,
    after,
    nearBefore: horizonSummary(base, cashAccount, asOf, shortEnd, p),
    nearAfter: horizonSummary(trial, cashAccount, asOf, shortEnd, q),
    fund,
    projection: q,
    next,
    changes,
    account: cashAccount,
  };
}
export function prepareYear(
  model,
  {
    sourceYear,
    targetYear,
    entity,
    amounts = {},
    overwrite = false,
    oneTimes = [],
    asOf,
    confirmGrowth = false,
    confirmOneTimes = false,
  },
) {
  if (
    !Number.isInteger(sourceYear) ||
    !Number.isInteger(targetYear) ||
    targetYear <= sourceYear ||
    targetYear + '-12' > forecastEnd(model.start).slice(0, 7)
  )
    throw Error('Choose a later calendar year within the forecast.');
  const next = structuredClone(model),
    changed = [],
    missing = [];
  for (const b of next.budgets || [])
    if (b.entity === entity && !b.seasonal && !b.oneTimeMonth)
      for (let month = 1; month <= 12; month++) {
        const suffix = '-' + String(month).padStart(2, '0'),
          from = sourceYear + suffix,
          to = targetYear + suffix,
          exists = b.overrides?.[to] ?? b.monthly?.[to];
        if (exists !== undefined && !overwrite) continue;
        const value = amounts[b.id]?.[to] ?? b.overrides?.[from] ?? b.monthly?.[from];
        if (value === undefined) {
          missing.push({ budget: b.id, month: to, name: b.name });
          continue;
        }
        if (!Number.isSafeInteger(value) || value < 0)
          throw Error('Year targets must be nonnegative cents.');
        b.monthly = { ...b.monthly, [to]: value };
        if (b.overrides) delete b.overrides[to];
        changed.push({ budget: b.id, month: to, amount: value });
      }
  for (const id of oneTimes) {
    const s = next.schedules.find(
      (s) => s.id === id && s.oneTime && s.anchor.startsWith(String(sourceYear)),
    );
    if (s) {
      const month = Number(s.anchor.slice(5, 7)),
        day = Math.min(
          Number(s.anchor.slice(-2)),
          new Date(Date.UTC(targetYear, month, 0)).getUTCDate(),
        ),
        when =
          targetYear + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
        newId = 'year-copy:' + id + ':' + targetYear;
      if (next.schedules.some((s) => s.id === newId)) continue;
      const copy = {
        ...s,
        id: newId,
        anchor: when,
        end: when,
        day,
        estimated: true,
        note: 'Copied from ' + sourceYear + ' for review; confirm its date and amount.',
      };
      delete copy.overrides;
      delete copy.skipped;
      delete copy.stoppedFrom;
      next.schedules.push(copy);
      continue;
    }
    const b = next.budgets.find(
      (b) => b.id === id && b.oneTimeMonth?.startsWith(String(sourceYear)),
    );
    if (b) {
      const month = targetYear + b.oneTimeMonth.slice(4),
        newId = 'year-copy:' + id + ':' + targetYear;
      if (!next.budgets.some((b) => b.id === newId))
        next.budgets.push({
          ...b,
          id: newId,
          oneTimeMonth: month,
          monthly: { [month]: b.overrides?.[b.oneTimeMonth] ?? b.monthly[b.oneTimeMonth] },
          overrides: {},
          timing: {},
        });
    }
  }
  next.annualReviews = [
    ...(next.annualReviews || []).filter((r) => r.year !== targetYear || r.entity !== entity),
    {
      year: targetYear,
      entity,
      asOf,
      reviewedGrowth: confirmGrowth,
      reviewedOneTimes: confirmOneTimes,
    },
  ];
  validateBudgets(validate(next));
  return { next, changed, missing };
}
