import {
  addDays,
  balances,
  date,
  forecastEnd,
  occurrences,
  balanceUnknownAt,
} from './money-engine.mjs';
import {
  budgetMonth,
  monthBounds,
  shiftMonth,
  weeklyDates,
  seasonalMonth,
  budgetTiming,
} from './money-budget.mjs';
import { planningForecast } from './money-planning.mjs';
import { planningSnapshot } from './money-insights.mjs';
import { spendingParts, transactionOwner } from './money-categories.mjs';
import { savingsSummary } from './money-savings.mjs';

const normalized = (x) =>
  String(x || '')
    .trim()
    .toLowerCase();
const owner = (m, t) => transactionOwner(m, t);
export const clampEnd = (m, end) => (end < forecastEnd(m.start) ? end : forecastEnd(m.start));
export function horizonSummary(model, account, asOf, end, projection) {
  const a = model.accounts.find((a) => a.id === account);
  if (!a) throw Error('Choose an account.');
  const finish = clampEnd(model, end),
    p = projection || planningForecast(planningSnapshot(model, asOf), finish),
    days = p.days.filter((d) => d.date >= asOf && d.date <= finish);
  if (!days.length)
    return { complete: false, end: finish, reason: 'Outside the available forecast' };
  const low = days.reduce((a, d) => (d.low[account] < a.low[account] ? d : a)),
    floor = a.reserve || 0;
  let headroom = Math.min(...days.map((d) => d.low[account] - floor));
  for (const d of days)
    for (const r of a.cashRules || [])
      if (
        Number(d.date.slice(-2)) === Math.min(r.day, monthBounds(d.date.slice(0, 7)).days) &&
        (!r.month || r.month === Number(d.date.slice(5, 7)))
      )
        headroom = Math.min(headroom, d[r.point][account] - Math.max(floor, r.amount));
  const unknownBills = (model.unscheduledBills || []).some((b) => b.entity === a.entity),
    uncertainPayoff = p.creditWarnings.some((w) =>
      model.accounts.some(
        (debt) =>
          w.startsWith(debt.name + ':') &&
          ((debt.credit?.mode === 'full' &&
            model.schedules.find((s) => s.id === debt.credit.scheduleId)?.account === account) ||
            model.planning?.cardPayoffs?.some(
              (x) => x.card === debt.id && x.from === account && x.enabled !== false,
            )),
      ),
    );
  const overdue = model.snapshotUnresolved
    ? model.snapshotUnresolved.some((t) => t.account === account)
    : occurrences(model, p.days[0].date).some(
        (t) =>
          t.date < p.days[0].date && t.entries.some((e) => e.account === account && e.amount < 0),
      );
  const complete =
    !overdue &&
    !unknownBills &&
    !uncertainPayoff &&
    !(p.incompleteFrom[a.entity] && p.incompleteFrom[a.entity] <= finish.slice(0, 7)) &&
    !days.some((d) => d.credit?.[account]?.missingFrom) &&
    !balanceUnknownAt(a, asOf);
  return {
    end: finish,
    low: low.low[account],
    date: low.date,
    floor,
    headroom,
    closing: days.at(-1).closing[account],
    complete,
    reason: complete
      ? ''
      : overdue
        ? 'Resolve overdue expectations first'
        : unknownBills
          ? 'Unknown bills need scheduling'
          : uncertainPayoff
            ? 'A card payoff depends on missing debt terms'
            : 'Missing targets, principal or rates',
  };
}
export function monthlyLows(model, account, asOf, projection) {
  const end = clampEnd(model, monthBounds(shiftMonth(asOf.slice(0, 7), 11)).last),
    p = projection || planningForecast(planningSnapshot(model, asOf), end),
    rows = [];
  for (let month = asOf.slice(0, 7); month <= end.slice(0, 7); month = shiftMonth(month, 1))
    rows.push({
      month,
      ...horizonSummary(
        model,
        account,
        month === asOf.slice(0, 7) ? asOf : month + '-01',
        monthBounds(month).last,
        p,
      ),
    });
  return rows;
}
export function categoryPace(model, month, entity, asOf) {
  const { first, last } = monthBounds(month),
    start = model.start > first ? model.start : first,
    until = asOf < last ? asOf : last,
    result = budgetMonth(model, month, entity, asOf);
  const expected = occurrences({ ...model, transactions: [] }, last).filter(
    (t) => t.kind === 'expense' && t.date >= start && owner(model, t) === entity,
  );
  return result.buckets.map((b) => {
    const names = new Set([b.name, ...(b.aliases || [])].map(normalized)),
      scheduled = expected.map((t) => ({
        date: t.date,
        amount: spendingParts(t)
          .filter((p) => names.has(normalized(p.category)))
          .reduce((n, p) => n + p.amount, 0),
      })),
      totalScheduled = scheduled.reduce((n, t) => n + t.amount, 0),
      due = scheduled.filter((t) => t.date <= until).reduce((n, t) => n + t.amount, 0);
    const explicit = b.timing?.[month],
      t = budgetTiming(model, b, month);
    if (b.allowance === null || (!explicit && (b.seasonal || b.oneTimeMonth) && until < last))
      return { ...b, expectedByToday: null, pace: null, reason: 'Choose timing to compare pace' };
    let dates = [];
    if (t.mode === 'daily') for (let d = start; d <= last; d = addDays(d, 1)) dates.push(d);
    else if (t.mode === 'weekly') dates = weeklyDates(month, t.weekday ?? 5, start);
    else dates = [t.mode === 'date' ? t.date : last];
    if (!dates.length) dates = [last];
    const rest = Math.max(0, (b.allowance || 0) - totalScheduled),
      share = Math.floor(rest / dates.length),
      extra = rest % dates.length,
      byToday =
        due + dates.reduce((n, d, i) => n + (d <= until ? share + (i < extra ? 1 : 0) : 0), 0);
    return {
      ...b,
      expectedByToday: byToday,
      pace: b.spent - byToday,
      scheduledOverTarget: Math.max(0, totalScheduled - (b.allowance || 0)),
    };
  });
}
export function cashBridge(model, account, month, asOf, projection) {
  const p = projection || planningForecast(model, monthBounds(month).last),
    days = p.days.filter((d) => d.date.startsWith(month)),
    groups = {
      income: 0,
      refunds: 0,
      bills: 0,
      categories: 0,
      debtPayments: 0,
      savings: 0,
      transfers: 0,
      adjustments: 0,
    };
  for (const d of days)
    for (const t of d.events) {
      const amount = t.entries
        .filter((e) => e.account === account)
        .reduce((n, e) => n + e.amount, 0);
      if (!amount) continue;
      const other = t.entries.find((e) => e.account !== account),
        debt = other && model.accounts.find((a) => a.id === other.account)?.type !== 'cash',
        saving =
          t.savingsBucket ||
          (model.savingsBuckets || []).some((b) =>
            b.scheduleIds?.includes(t.scheduleKey?.slice(0, -11)),
          );
      const key =
        t.kind === 'income'
          ? 'income'
          : t.kind === 'refund'
            ? 'refunds'
            : t.kind === 'transfer'
              ? debt
                ? 'debtPayments'
                : saving
                  ? 'savings'
                  : 'transfers'
              : t.kind === 'expense'
                ? t.budgetReserve
                  ? 'categories'
                  : 'bills'
                : 'adjustments';
      groups[key] += amount;
    }
  const opening = days[0]?.opening[account] || 0,
    closing = days.at(-1)?.closing[account] || 0;
  return {
    opening,
    closing,
    groups,
    rows: [
      { label: 'Opening', amount: opening },
      ...Object.entries(groups)
        .filter(([, amount]) => amount)
        .map(([key, amount]) => ({
          key,
          label: {
            income: 'Income',
            refunds: 'Refunds / repayments',
            bills: 'Bills / recorded expenses',
            categories: 'Remaining category plan',
            debtPayments: 'Debt payments',
            savings: 'Savings transfers',
            transfers: 'Other transfers',
            adjustments: 'Adjustments',
          }[key],
          amount,
        })),
      ...[{ label: 'Closing', amount: closing }],
    ],
    balanced: opening + Object.values(groups).reduce((n, v) => n + v, 0) === closing,
  };
}
export function savingsRunway(model, bucketId, asOf, end, projection) {
  const b = model.savingsBuckets?.find((b) => b.id === bucketId);
  if (!b) throw Error('Choose a savings bucket.');
  const p = projection || planningForecast(model, clampEnd(model, end)),
    events = [
      ...new Map(
        [...model.transactions, ...p.days.flatMap((d) => d.events)].map((t) => [t.id, t]),
      ).values(),
    ],
    current = savingsSummary(model, asOf).buckets.find((x) => x.id === b.id),
    points = [];
  for (let month = asOf.slice(0, 7); month <= end.slice(0, 7); month = shiftMonth(month, 1)) {
    const when = monthBounds(month).last,
      d = p.days.find((d) => d.date === when);
    if (!d) break;
    points.push({
      date: when,
      balance: savingsSummary(model, when, events, d.closing).buckets.find((x) => x.id === b.id)
        .balance,
    });
  }
  let reaches = null;
  if (b.goalAmount != null) {
    if (current.balance >= b.goalAmount) reaches = asOf;
    else
      for (const d of p.days.filter((d) => d.date >= asOf)) {
        if (
          savingsSummary(model, d.date, events, d.closing).buckets.find((x) => x.id === b.id)
            .balance >= b.goalAmount
        ) {
          reaches = d.date;
          break;
        }
      }
  }
  return {
    bucket: b,
    current: current.balance,
    points,
    reaches,
    goal: b.goalAmount ?? null,
    targetDate: b.goalDate || null,
  };
}
export function searchLedger(
  model,
  { query = '', account = '', category = '', status = '', from = '', to = '', entity = '' } = {},
) {
  const needle = normalized(query);
  return [...model.transactions]
    .filter(
      (t) =>
        (!entity ||
          owner(model, t) === entity ||
          t.entries.some(
            (e) => model.accounts.find((a) => a.id === e.account)?.entity === entity,
          )) &&
        (!from || t.date >= from) &&
        (!to || t.date <= to) &&
        (!status || t.status === status) &&
        (!account || t.entries.some((e) => e.account === account)) &&
        (!category ||
          spendingParts(t).some((p) => p.category === category) ||
          t.category === category) &&
        (!needle ||
          normalized(
            [
              t.description,
              t.note,
              t.category,
              ...spendingParts(t).map((p) => p.category),
              ...t.entries.map((e) => model.accounts.find((a) => a.id === e.account)?.name),
            ].join(' '),
          ).includes(needle)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function milestones(model, entity, asOf, end) {
  const out = [];
  for (const s of model.schedules.filter(
    (s) => model.accounts.find((a) => a.id === s.account)?.entity === entity,
  )) {
    for (const change of [...(s.changes || [])].sort((a, b) => a.date.localeCompare(b.date))) {
      if (change.date < asOf || change.date > end) continue;
      const previous =
        [...(s.changes || [])]
          .filter((c) => c.date < change.date)
          .sort((a, b) => a.date.localeCompare(b.date))
          .at(-1)?.amount ?? s.amount;
      out.push({
        date: change.date,
        name: s.name + ' changes',
        amount: change.amount - previous,
        frequency: s.frequency,
        account: s.account,
        kind: 'amount',
        source: s.id,
        debt: !!s.to && model.accounts.find((a) => a.id === s.to)?.type !== 'cash',
      });
    }
    if (s.end && s.end >= asOf && s.end <= end && !s.oneTime)
      out.push({
        date: s.end,
        name: s.name + ' final planned payment',
        amount: s.amount,
        account: s.account,
        kind: 'end',
        source: s.id,
        debt: !!s.to && model.accounts.find((a) => a.id === s.to)?.type !== 'cash',
      });
    if (s.anchor > asOf && s.anchor <= end && !s.oneTime)
      out.push({
        date: s.anchor,
        name: s.name + ' starts',
        amount: s.amount,
        account: s.account,
        kind: 'start',
        source: s.id,
        debt: !!s.to && model.accounts.find((a) => a.id === s.to)?.type !== 'cash',
      });
  }
  for (const a of model.accounts.filter((a) => a.entity === entity))
    for (const key of ['promoEnd', 'purchasePromoEnd'])
      if (a.credit?.[key] && a.credit[key] >= asOf && a.credit[key] <= end)
        out.push({
          date: a.credit[key],
          name:
            a.name + (key === 'promoEnd' ? ' balance promotion ends' : ' purchase promotion ends'),
          account: a.id,
          kind: 'promo',
          source: a.id,
          debt: true,
        });
  for (const b of model.savingsBuckets || [])
    if (
      b.goalDate &&
      b.goalDate >= asOf &&
      b.goalDate <= end &&
      model.accounts.find((a) => a.id === b.account)?.entity === entity
    )
      out.push({
        date: b.goalDate,
        name: b.name + ' goal',
        amount: b.goalAmount,
        account: b.account,
        kind: 'goal',
        source: b.id,
      });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
const renewalWords =
  /subscription|netflix|disney|spotify|britbox|prime|renew|insurance|registration|tags|domain|web hosting|chatgpt|mesh(y|i)|ring camera/i;
export function renewals(model, entity, asOf) {
  const end = addDays(asOf, 365),
    events = occurrences({ ...model, transactions: [] }, end),
    rows = [];
  for (const s of model.schedules.filter(
    (s) =>
      s.enabled !== false &&
      (!s.stoppedFrom || s.stoppedFrom > asOf) &&
      model.accounts.find((a) => a.id === s.account)?.entity === entity &&
      !s.to &&
      s.amount < 0 &&
      (s.renewal === true ||
        (s.renewal !== false &&
          (renewalWords.test(s.name) ||
            ['yearly', 'semiannual', 'quarterly'].includes(s.frequency)))),
  )) {
    const due = events.filter(
      (t) => t.scheduleKey.startsWith(s.id + ':') && t.date >= asOf && !t.skipped,
    );
    if (!due.length) continue;
    rows.push({
      id: s.id,
      source: 'schedule',
      name: s.name,
      next: due[0].date,
      key: due[0].scheduleKey,
      amount: -due[0].entries[0].amount,
      annual: due.reduce((n, t) => n - t.entries[0].amount, 0),
      account: s.account,
      review: s.reviewDate || addDays(due[0].date, -30),
    });
  }
  for (const item of model.seasonalItems || [])
    if (
      item.entity === entity &&
      (item.renewal === true || (item.renewal !== false && renewalWords.test(item.name)))
    ) {
      let annual = 0,
        next = null,
        amount = 0;
      for (let month = asOf.slice(0, 7); month <= end.slice(0, 7); month = shiftMonth(month, 1)) {
        if (Number(month.slice(-2)) !== item.month) continue;
        const when = monthBounds(month).last;
        if (when < asOf || when > end) continue;
        const value = seasonalMonth(model, month, entity).items.find(
          (i) => i.id === item.id,
        ).expected;
        if (value <= 0) continue;
        annual += value;
        if (!next) {
          next = when;
          amount = value;
        }
      }
      if (next)
        rows.push({
          id: item.id,
          source: 'seasonal',
          name: item.name,
          next,
          amount,
          annual,
          account: model.budgets.find((b) => b.entity === entity && b.seasonal)?.account,
          review: item.reviewDate || addDays(next, -30),
          estimatedDate: true,
        });
    }
  return rows.sort((a, b) => a.next.localeCompare(b.next));
}
export function overlapReview(model, entity, year) {
  const result = [],
    normal = (s) =>
      normalized(s)
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
  for (let i = 1; i <= 12; i++) {
    const month = year + '-' + String(i).padStart(2, '0'),
      items = seasonalMonth(model, month, entity).items.filter((i) => i.expected > 0),
      b = model.budgets.find((b) => b.entity === entity && b.seasonal),
      aliases = new Set([b?.name, ...(b?.aliases || [])].map(normalized));
    for (const t of occurrences({ ...model, transactions: [] }, monthBounds(month).last).filter(
      (t) =>
        t.kind === 'expense' &&
        t.date.startsWith(month) &&
        owner(model, t) === entity &&
        !aliases.has(normalized(t.category)),
    ))
      for (const item of items) {
        const left = normal(item.name),
          right = normal(t.description),
          similar =
            left === right ||
            (left.length >= 5 &&
              right.length >= 5 &&
              (left.includes(right) || right.includes(left)) &&
              Math.abs(item.expected + t.entries[0].amount) <= Math.max(500, item.expected * 0.1));
        if (similar) {
          const id = item.id + '|' + t.scheduleKey;
          if (!model.overlapDecisions?.some((d) => d.id === id && d.resolution === 'separate'))
            result.push({
              id,
              name: item.name,
              month,
              amount: item.expected,
              seasonal: item.id,
              schedule: t.scheduleKey,
            });
        }
      }
  }
  return result;
}
export function planFootprint(model) {
  const json = JSON.stringify(model),
    bytes = new TextEncoder().encode(json).length;
  let quoted = false,
    escaped = false,
    separators = 0;
  for (const c of json) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ':') separators++;
  }
  const storedEstimate = bytes + separators;
  return {
    bytes,
    storedEstimate,
    limit: 2000000,
    ratio: storedEstimate / 2000000,
    transactions: model.transactions.length,
    historyPolicy: 'Every saved revision is archived; no automatic deletion.',
    nearLimit: storedEstimate >= 1500000,
  };
}
export function explainPlanChange(before, after, { asOf, account, revision } = {}) {
  const changes = [],
    old = new Map(before.transactions.map((t) => [t.id, t]));
  for (const t of after.transactions) {
    if (!old.has(t.id)) changes.push({ type: 'recorded', name: t.description, id: t.id });
    else if (JSON.stringify(old.get(t.id)) !== JSON.stringify(t))
      changes.push({ type: 'edited', name: t.description, id: t.id });
    old.delete(t.id);
  }
  for (const t of old.values()) changes.push({ type: 'removed', name: t.description, id: t.id });
  for (const s of after.schedules) {
    const old = before.schedules.find((x) => x.id === s.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(s))
      changes.push({ type: 'schedule', name: s.name, id: s.id });
  }
  for (const b of after.budgets || []) {
    const old = before.budgets?.find((x) => x.id === b.id);
    if (!old || JSON.stringify(old) !== JSON.stringify(b))
      changes.push({ type: 'budget', name: b.name, id: b.id });
  }
  const now = balances(after, asOf),
    was = balances(before, asOf),
    effects = after.accounts
      .map((a) => ({ account: a.id, amount: now[a.id] - (was[a.id] ?? 0) }))
      .filter((e) => e.amount),
    end = monthBounds(asOf.slice(0, 7)).last;
  let forecast = null;
  try {
    const a =
        after.accounts.find((a) => a.id === account) ||
        after.accounts.find((a) => a.type === 'cash'),
      p = planningForecast(before, end),
      q = planningForecast(after, end);
    if (!p.incompleteFrom[a.entity] && !q.incompleteFrom[a.entity])
      forecast = {
        account: a.id,
        month: end.slice(0, 7),
        before: p.days.at(-1).closing[a.id],
        after: q.days.at(-1).closing[a.id],
      };
  } catch {}
  const categories = [];
  for (const entity of ['household', 'business', 'custodial']) {
    const old = budgetMonth(before, asOf.slice(0, 7), entity, asOf),
      current = budgetMonth(after, asOf.slice(0, 7), entity, asOf);
    for (const b of current.buckets) {
      const prior = old.buckets.find((x) => x.id === b.id),
        amount = b.spent - (prior?.spent || 0);
      if (amount) categories.push({ name: b.name, entity, amount, remaining: b.remaining });
    }
  }
  return {
    asOf,
    previousRevision: revision,
    categories,
    changes: changes.slice(0, 20),
    effects,
    forecast,
  };
}

export function debtRunway(model, account, asOf, end, projection) {
  const a = model.accounts.find((a) => a.id === account && a.type !== 'cash');
  if (!a) throw Error('Choose a debt account.');
  const p = projection || planningForecast(planningSnapshot(model, asOf), clampEnd(model, end)),
    days = p.days.filter((d) => d.date >= asOf && d.date <= end),
    points = days.map((d) => ({ date: d.date, value: Math.max(0, -d.closing[account]) })),
    rows = [];
  for (let month = asOf.slice(0, 7); month <= end.slice(0, 7); month = shiftMonth(month, 1)) {
    const selected = days.filter((d) => d.date.startsWith(month));
    if (!selected.length) continue;
    let payments = 0,
      interest = 0;
    for (const d of selected)
      for (const t of d.events) {
        const amount = t.entries
          .filter((e) => e.account === account)
          .reduce((n, e) => n + e.amount, 0);
        if (t.kind === 'transfer' && amount > 0) payments += amount;
        if (t.creditInterest || (t.kind === 'expense' && normalized(t.category) === 'interest'))
          interest -= amount;
      }
    rows.push({
      month,
      payments,
      interest,
      netReduction:
        Math.max(0, -selected[0].opening[account]) - Math.max(0, -selected.at(-1).closing[account]),
      debt: Math.max(0, -selected.at(-1).closing[account]),
    });
  }
  const paid = points.find(
    (point, index) => point.value === 0 && points.slice(0, index).some((p) => p.value > 0),
  );
  return {
    points,
    rows,
    payoff: paid?.date || null,
    complete: !balanceUnknownAt(a, asOf) && !days.some((d) => d.credit?.[account]?.missingFrom),
  };
}
