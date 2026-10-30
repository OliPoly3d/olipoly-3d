import { addDays, forecastEnd, occurrences, balanceUnknownAt } from './money-engine.mjs';
import { planningForecast } from './money-planning.mjs';
import { planningSnapshot } from './money-insights.mjs';
import { transactionOwner } from './money-categories.mjs';
const palette = [
  '#86c9ac',
  '#e2ba75',
  '#8ab7e0',
  '#bba5da',
  '#e49e91',
  '#7fc8cd',
  '#b8c99a',
  '#c4b8a6',
];
export function categoryAccent(name) {
  const s = String(name).toLowerCase();
  const known = [
    [/grocer|food/, 0],
    [/gas|fuel/, 2],
    [/child|school/, 3],
    [/hobb/, 6],
    [/dining|restaurant/, 1],
    [/misc/, 5],
    [/pet/, 4],
  ];
  const hit = known.find(([re]) => re.test(s));
  if (hit) return palette[hit[1]];
  return palette[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % palette.length];
}
export function upcomingActivity(model, { asOf, entity, days = 14 }) {
  const last = forecastEnd(model.start),
    requested = addDays(asOf, days - 1),
    end = requested > last ? last : requested,
    projection = planningForecast(planningSnapshot(model, asOf), end),
    payments = new Map(
      projection.planned.filter((t) => t.creditPayment).map((t) => [t.scheduleKey, t]),
    ),
    relevant = (t) =>
      transactionOwner(model, t) === entity ||
      t.entries.some((e) => model.accounts.find((a) => a.id === e.account)?.entity === entity);
  const expected = occurrences(model, end)
      .filter((t) => t.date >= asOf && relevant(t))
      .map((t) => payments.get(t.scheduleKey) || t),
    recorded = model.transactions.filter(
      (t) =>
        (t.date > asOf || (t.date === asOf && t.status === 'pending')) &&
        t.date <= end &&
        relevant(t),
    );
  return [
    ...expected.map((t) => ({ ...t, actual: false })),
    ...recorded.map((t) => ({ ...t, actual: true })),
  ]
    .map((t) => ({
      ...t,
      unknown: t.entries.some((e) =>
        balanceUnknownAt(
          model.accounts.find((a) => a.id === e.account),
          t.date,
        ),
      ),
      debt:
        !['expense', 'refund'].includes(t.kind) &&
        t.entries.some((e) => model.accounts.find((a) => a.id === e.account)?.type !== 'cash'),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
}
export function cashHighlights(days, account) {
  if (!days.length) return { lowest: null, markers: [] };
  const lowest = days.reduce((a, b) => (b.low[account] < a.low[account] ? b : a)),
    byDate = new Map();
  for (const d of days)
    for (const t of d.events) {
      if (t.budgetReserve || t.creditInterest) continue;
      const amount = t.entries
        .filter((e) => e.account === account)
        .reduce((n, e) => n + e.amount, 0);
      if (!amount) continue;
      const kind = t.kind === 'income' ? 'income' : t.kind === 'transfer' ? 'transfer' : 'expense',
        label =
          kind === 'income'
            ? /pay|salary/i.test(t.description)
              ? 'Payday'
              : 'Income'
            : t.description;
      if (!byDate.has(d.date) || Math.abs(amount) > Math.abs(byDate.get(d.date).amount))
        byDate.set(d.date, { date: d.date, kind, label, amount });
    }
  return {
    lowest,
    markers: [...byDate.values()]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 3)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
