import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, balances, occurrences, spending } from '../js/money-engine.mjs';
import {
  validateBudgets,
  budgetMonth,
  applyBudgetTiming,
  categoryBudgetSummary,
  budgetTimingLabel,
} from '../js/money-budget.mjs';
import { planningSnapshot } from '../js/money-insights.mjs';
import { planningForecast } from '../js/money-planning.mjs';
import { cashCapacity, cashComponents, verifyBalance } from '../js/money-confidence.mjs';
import { monthFingerprint, assertMonthLocks } from '../js/money-month-close.mjs';
import { removeActual } from '../js/money-actions.mjs';
import {
  categoryPace,
  cashBridge,
  searchLedger,
  planFootprint,
  explainPlanChange,
  savingsRunway,
  renewals,
  overlapReview,
  monthlyLows,
  horizonSummary,
  debtRunway,
} from '../js/money-decisions.mjs';
import {
  affordability,
  compareScenario,
  applyScenarioChanges,
  prepareYear,
} from '../js/money-scenarios.mjs';
const fixture = () => {
  const monthly = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => ['2026-' + String(i + 1).padStart(2, '0'), 64000]),
  );
  return {
    version: 1,
    start: '2026-01-01',
    accounts: [
      {
        id: 'cash',
        name: 'Checking',
        type: 'cash',
        entity: 'household',
        opening: 500000,
        reserve: 50000,
      },
      {
        id: 'card',
        name: 'Card',
        type: 'card',
        entity: 'household',
        opening: 0,
        reserve: 0,
        credit: {
          purchaseApr: 0,
          promoBalance: 0,
          mode: 'full',
          scheduleId: 'payment',
          paymentStart: '2026-01-01',
          paymentAmount: 0,
          dueDay: 25,
        },
      },
    ],
    transactions: [],
    schedules: [
      {
        id: 'pay',
        name: 'Pay',
        frequency: 'biweekly',
        anchor: '2026-01-02',
        amount: 200000,
        account: 'cash',
      },
      {
        id: 'payment',
        name: 'Card payment',
        frequency: 'monthly',
        anchor: '2026-01-01',
        day: 25,
        amount: -1,
        account: 'cash',
        to: 'card',
      },
    ],
    budgets: [
      {
        id: 'food',
        name: 'Groceries',
        account: 'cash',
        entity: 'household',
        monthly: { ...monthly },
        timing: { '2026-01': { mode: 'daily' } },
      },
      {
        id: 'gas',
        name: 'Gas',
        account: 'cash',
        entity: 'household',
        monthly: Object.fromEntries(Object.keys(monthly).map((k) => [k, 39000])),
      },
    ],
    seasonalItems: [],
  };
};
test('one split card charge and partial checking reimbursement retain exact balances and net category costs', () => {
  const m = fixture();
  m.transactions = [
    {
      id: 'shop',
      date: '2026-01-05',
      description: 'Mixed checkout',
      kind: 'expense',
      category: 'Split purchase',
      status: 'cleared',
      entries: [{ account: 'card', amount: -15000 }],
      allocations: [
        { category: 'Groceries', amount: 10000 },
        { category: 'Gas', amount: 5000 },
      ],
    },
    {
      id: 'repay',
      date: '2026-01-06',
      description: 'Shared groceries repaid',
      kind: 'refund',
      category: 'Groceries',
      refundOf: 'shop',
      status: 'cleared',
      entries: [{ account: 'cash', amount: 4000 }],
    },
  ];
  validateBudgets(validate(m));
  assert.equal(balances(m, '2026-01-06').card, -15000);
  assert.equal(balances(m, '2026-01-06').cash, 504000);
  const b = budgetMonth(m, '2026-01', 'household', '2026-01-31');
  assert.equal(b.buckets[0].spent, 6000);
  assert.equal(b.buckets[1].spent, 5000);
  assert.equal(b.outside.length, 0);
  assert.equal(spending(m, '2026-01')['household: Groceries'], 6000);
  assert.equal(searchLedger(m, { query: 'gas' }).length, 1);
  assert.throws(() => removeActual(m, 'shop', 'delete'), /linked refunds/);
  const bad = structuredClone(m);
  bad.transactions[1].entries[0].amount = 10001;
  assert.throws(() => validate(bad), /cannot exceed/);
  bad.transactions[1].entries[0].amount = 4000;
  bad.transactions[0].allocations[0].amount = 9999;
  assert.throws(() => validate(bad), /add up/);
  const p = planningForecast(m, '2026-01-31'),
    cash = cashComponents(m, '2026-01', 'household', p.days);
  assert.equal(cash.income, 600000);
  assert.equal(
    cash.opening + cash.income - cash.spending + cash.transfers + cash.adjustments,
    cash.closing,
  );
  assert.equal(p.days.at(-1).closing.card, 0);
});
test('refund in a later month leaves a closed original month intact and split recategorization is protected', () => {
  const m = fixture();
  m.transactions = [
    {
      id: 'shop',
      date: '2026-01-05',
      description: 'Checkout',
      kind: 'expense',
      category: 'Groceries',
      status: 'cleared',
      entries: [{ account: 'card', amount: -10000 }],
    },
  ];
  m.monthClosures = [
    {
      month: '2026-01',
      entity: 'household',
      closedOn: '2026-02-01',
      cash: 500000,
      signature: monthFingerprint(m, '2026-01', 'household'),
    },
  ];
  const next = structuredClone(m);
  next.transactions.push({
    id: 'return',
    date: '2026-02-02',
    description: 'Return',
    kind: 'refund',
    category: 'Groceries',
    refundOf: 'shop',
    status: 'cleared',
    entries: [{ account: 'card', amount: 3000 }],
  });
  validate(next);
  assertMonthLocks(m, next);
  assert.equal(budgetMonth(next, '2026-02', 'household', '2026-02-28').buckets[0].spent, -3000);
  const changed = structuredClone(next);
  changed.transactions[0].allocations = [{ category: 'Gas', amount: 10000 }];
  assert.throws(() => assertMonthLocks(m, changed), /closed/);
});
test('extended recurrence keeps calendar anchors, clamped days, nominal matches and every-ten-week dates', () => {
  const m = fixture();
  m.schedules = [
    {
      id: 'quarter',
      name: 'Quarterly',
      account: 'cash',
      amount: -100,
      anchor: '2026-01-01',
      frequency: 'quarterly',
      day: 31,
    },
    {
      id: 'annual',
      name: 'Leap anniversary',
      account: 'cash',
      amount: -100,
      anchor: '2024-02-29',
      frequency: 'yearly',
      day: 29,
    },
    {
      id: 'ten',
      name: 'Ten weeks',
      account: 'cash',
      amount: -100,
      anchor: '2026-01-02',
      frequency: 'weeks',
      intervalWeeks: 10,
      overrides: { '2026-03-13': { amount: -101, date: '2026-04-01' } },
    },
  ];
  validate(m);
  const rows = occurrences(m, '2028-12-31');
  assert.deepEqual(
    rows
      .filter((t) => t.scheduleKey.startsWith('quarter:') && t.date.startsWith('2026'))
      .map((t) => t.date),
    ['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31'],
  );
  assert.deepEqual(
    rows.filter((t) => t.scheduleKey.startsWith('annual:')).map((t) => t.date),
    ['2026-02-28', '2027-02-28', '2028-02-29'],
  );
  assert.equal(rows.find((t) => t.scheduleKey === 'ten:2026-03-13').date, '2026-04-01');
  assert(rows.some((t) => t.scheduleKey === 'ten:2026-05-22'));
  m.transactions.push({
    ...rows.find((t) => t.scheduleKey === 'ten:2026-03-13'),
    id: 'actual',
    status: 'cleared',
  });
  assert(!occurrences(m, '2026-12-31').some((t) => t.scheduleKey === 'ten:2026-03-13'));
  m.schedules[2].intervalWeeks = 0;
  assert.throws(() => validate(m), /schedule/);
});
test('spending pace respects weekly charges and one-time timing while month totals stay exact', () => {
  const m = fixture();
  m.budgets = [
    {
      id: 'weekly',
      name: 'Weekly',
      account: 'cash',
      entity: 'household',
      monthly: { '2026-01': 10000 },
      timing: { '2026-01': { mode: 'weekly', weekday: 5 } },
    },
    {
      id: 'once',
      name: 'One time',
      account: 'cash',
      entity: 'household',
      oneTimeMonth: '2026-01',
      monthly: { '2026-01': 5000 },
    },
  ];
  let p = categoryPace(m, '2026-01', 'household', '2026-01-12');
  assert.equal(p[0].expectedByToday, 4000);
  assert.equal(p[1].expectedByToday, null);
  m.budgets[1].timing = { '2026-01': { mode: 'date', date: '2026-01-20' } };
  p = categoryPace(m, '2026-01', 'household', '2026-01-21');
  assert.equal(p[1].expectedByToday, 5000);
  assert.equal(categoryPace(m, '2026-01', 'household', '2026-01-31')[0].expectedByToday, 10000);
});
test('affordability replaces allowance spending, adds extras once and checks a savings purpose separately', () => {
  const m = fixture(),
    common = {
      when: '2026-01-20',
      amount: 5000,
      account: 'cash',
      asOf: '2026-01-10',
      end: '2026-01-31',
    };
  const extra = affordability(m, { ...common, mode: 'extra' }),
    within = affordability(m, { ...common, mode: 'allowance', budget: 'food' });
  assert.equal(extra.after.closing, extra.before.closing - 5000);
  assert.equal(within.after.closing, within.before.closing);
  assert.equal(m.schedules.length, 2);
  m.accounts.push({
    id: 'saving',
    name: 'Savings',
    type: 'cash',
    entity: 'household',
    opening: 20000,
    reserve: 0,
  });
  m.savingsBuckets = [{ id: 'fun', name: 'Fun', account: 'saving', start: m.start, opening: 3000 }];
  const fund = affordability(m, {
    ...common,
    mode: 'savings',
    bucket: 'fun',
    watchAccount: 'cash',
  });
  assert.equal(fund.after.closing, fund.before.closing);
  assert.equal(fund.fund.after, -2000);
});
test('saved scenarios apply budgets and expectations without applying hypothetical debt or double-adding expectations', () => {
  const m = fixture(),
    scenario = {
      id: 'test',
      name: 'Trial',
      asOf: '2026-01-10',
      end: '2026-03-31',
      account: 'cash',
      changes: [
        { type: 'budget', budget: 'food', month: '2026-02', through: '2026-03', amount: 60000 },
        {
          type: 'expense',
          id: 'trip',
          name: 'Trial trip',
          when: '2026-02-15',
          amount: 15000,
          account: 'cash',
        },
        { type: 'balance', account: 'card', amount: 100000 },
      ],
    },
    before = JSON.stringify(m),
    comparison = compareScenario(m, scenario);
  assert(comparison.after.closing < comparison.before.closing);
  const applied = applyScenarioChanges(m, scenario);
  assert.equal(applied.accounts[1].opening, 0);
  assert.equal(applied.budgets[0].overrides['2026-02'], 60000);
  assert.equal(applied.schedules.filter((s) => s.id.startsWith('scenario:')).length, 1);
  assert.equal(applyScenarioChanges(applied, scenario).schedules.length, applied.schedules.length);
  assert.equal(JSON.stringify(m), before);
  assert.equal(applied.transactions.length, 0);
});
test('annual preparation preserves explicit future targets and growth; only selected one-times repeat', () => {
  const m = fixture();
  m.budgets[0].monthly['2027-01'] = 77700;
  m.schedules[0].changes = [{ date: '2027-05-01', amount: 206000 }];
  m.schedules.push({
    id: 'trip',
    name: 'Optional trip',
    account: 'cash',
    amount: -10000,
    frequency: 'monthly',
    anchor: '2026-08-10',
    end: '2026-08-10',
    day: 10,
    oneTime: true,
  });
  const p = prepareYear(m, {
    sourceYear: 2026,
    targetYear: 2027,
    entity: 'household',
    asOf: '2026-01-10',
  });
  assert.equal(p.next.budgets[0].monthly['2027-01'], 77700);
  assert.equal(p.next.budgets[0].monthly['2027-02'], 64000);
  assert.equal(p.next.schedules.length, m.schedules.length);
  assert.deepEqual(p.next.schedules[0].changes, m.schedules[0].changes);
  const q = prepareYear(m, {
    sourceYear: 2026,
    targetYear: 2027,
    entity: 'household',
    asOf: '2026-01-10',
    oneTimes: ['trip'],
  });
  assert(q.next.schedules.some((s) => s.id === 'year-copy:trip:2027' && s.anchor === '2027-08-10'));
});
test('cash waterfall balances and savings goals, renewal costs and overlap hints use the same postings', () => {
  const m = fixture();
  m.accounts.push({
    id: 'saving',
    name: 'Savings',
    type: 'cash',
    entity: 'household',
    opening: 10000,
    reserve: 0,
  });
  m.schedules.push(
    {
      id: 'save',
      name: 'Savings transfer',
      account: 'cash',
      to: 'saving',
      amount: -1000,
      frequency: 'monthly',
      anchor: '2026-01-01',
      day: 1,
    },
    {
      id: 'renew',
      name: 'Annual membership',
      account: 'cash',
      amount: -12000,
      frequency: 'yearly',
      anchor: '2026-01-01',
      day: 15,
      category: 'Membership',
    },
  );
  m.savingsBuckets = [
    {
      id: 'goal',
      name: 'Goal',
      account: 'saving',
      start: m.start,
      opening: 10000,
      scheduleIds: ['save'],
      goalAmount: 20000,
      goalDate: '2026-12-31',
    },
  ];
  const p = planningForecast(m, '2026-12-31');
  assert(cashBridge(m, 'cash', '2026-01', '2026-01-10', p).balanced);
  const goal = savingsRunway(m, 'goal', '2026-01-01', '2026-12-31', p);
  assert.equal(goal.current, 10000);
  assert.equal(goal.reaches, '2026-10-01');
  assert.equal(renewals(m, 'household', '2026-01-01').find((r) => r.id === 'renew').annual, 12000);
  m.seasonalItems = [
    { id: 'duplicate', name: 'Annual membership', month: 1, entity: 'household', amount: 12000 },
  ];
  assert.equal(overlapReview(m, 'household', 2026).length, 1);
  m.schedules.find((s) => s.id === 'renew').to = 'saving';
  assert.equal(overlapReview(m, 'household', 2026).length, 0);
  assert.equal(monthlyLows(m, 'cash', '2026-01-10', p).length, 12);
});
test('capacity uses the nearest of alternating paychecks and changes explain actual versus projected balances', () => {
  const m = fixture();
  m.schedules.unshift({
    id: 'later',
    name: 'Later paycheck',
    account: 'cash',
    amount: 100000,
    frequency: 'biweekly',
    anchor: '2026-01-09',
  });
  assert.equal(cashCapacity(m, 'cash', '2026-01-01').nextPay, '2026-01-02');
  const next = structuredClone(m);
  next.transactions.push({
    id: 'shop',
    description: 'Groceries',
    kind: 'expense',
    category: 'Groceries',
    date: '2026-01-10',
    status: 'cleared',
    entries: [{ account: 'cash', amount: -1000 }],
  });
  const why = explainPlanChange(m, next, { asOf: '2026-01-10', account: 'cash', revision: 1 });
  assert.equal(why.effects[0].amount, -1000);
  assert.equal(why.forecast.before, why.forecast.after);
  assert.equal(why.changes[0].type, 'recorded');
});
test('multi-year ledgers remain exact and plan-size monitoring identifies the storage boundary', () => {
  const m = fixture();
  m.schedules = [];
  m.budgets = [];
  for (let i = 0; i < 14000; i++) {
    const year = 2026 + Math.floor(i / 2800),
      month = Math.floor((i % 2800) / 234) + 1,
      day = (i % 28) + 1;
    m.transactions.push({
      id: 't' + i,
      description: 'Synthetic historical purchase ' + i,
      date:
        year +
        '-' +
        String(Math.min(12, month)).padStart(2, '0') +
        '-' +
        String(day).padStart(2, '0'),
      kind: 'expense',
      category: 'Other',
      status: 'cleared',
      entries: [{ account: 'cash', amount: -1 }],
      note: 'Synthetic volume test: no private financial data.',
    });
  }
  validate(m);
  assert.equal(balances(m, '2030-12-31').cash, 486000);
  const size = planFootprint(m);
  assert(size.nearLimit);
  assert(size.bytes > size.limit);
  assert.equal(searchLedger(m, { query: 'purchase' }).length, 14000);
  assert.match(size.historyPolicy, /no automatic deletion/);
});

test('future recorded refund retains its category basis across a planning snapshot', () => {
  const m = fixture();
  m.transactions = [
    {
      id: 'shop',
      date: '2026-01-05',
      description: 'Purchase',
      kind: 'expense',
      category: 'Groceries',
      status: 'cleared',
      entries: [{ account: 'cash', amount: -10000 }],
    },
    {
      id: 'first',
      date: '2026-01-06',
      description: 'Partial return',
      kind: 'refund',
      category: 'Groceries',
      refundOf: 'shop',
      status: 'cleared',
      entries: [{ account: 'cash', amount: 3000 }],
    },
    {
      id: 'later',
      date: '2026-02-05',
      description: 'Later return',
      kind: 'refund',
      category: 'Groceries',
      refundOf: 'shop',
      status: 'pending',
      entries: [{ account: 'cash', amount: 4000 }],
    },
  ];
  const s = planningSnapshot(m, '2026-01-10');
  validate(s);
  assert.equal(s.refundContext[0].allocations[0].amount, 7000);
  assert.equal(budgetMonth(s, '2026-02', 'household', '2026-02-28').buckets[0].spent, -4000);
  assert.doesNotThrow(() => planningForecast(s, '2026-02-28'));
  assert.equal(m.transactions.length, 3);
});
test('savings runway preserves recorded contributions when the cash forecast starts today', () => {
  const m = fixture();
  m.accounts.push({
    id: 'save',
    name: 'Savings',
    entity: 'household',
    type: 'cash',
    opening: 10000,
    reserve: 0,
  });
  m.savingsBuckets = [
    {
      id: 'fun',
      name: 'Fun',
      account: 'save',
      start: m.start,
      opening: 10000,
      scheduleIds: ['contribution'],
      goalAmount: 15000,
    },
  ];
  m.schedules.push({
    id: 'contribution',
    name: 'Contribution',
    account: 'cash',
    to: 'save',
    amount: -5000,
    frequency: 'monthly',
    anchor: '2026-01-01',
    day: 8,
  });
  m.transactions.push({
    id: 'deposit',
    date: '2026-01-08',
    description: 'Contribution',
    kind: 'transfer',
    status: 'cleared',
    scheduleKey: 'contribution:2026-01-08',
    entries: [
      { account: 'cash', amount: -5000 },
      { account: 'save', amount: 5000 },
    ],
  });
  const p = planningForecast(planningSnapshot(m, '2026-01-10'), '2026-03-31'),
    r = savingsRunway(m, 'fun', '2026-01-10', '2026-03-31', p);
  assert.equal(r.current, 15000);
  assert.equal(r.points[0].balance, 15000);
  assert.equal(r.reaches, '2026-01-10');
});
test('stale one-time scenarios and out-of-horizon or cross-owner affordability choices fail clearly', () => {
  const m = fixture(),
    s = {
      id: 'old',
      name: 'Old trip',
      account: 'cash',
      asOf: '2026-02-01',
      end: '2026-03-31',
      changes: [
        {
          type: 'expense',
          id: 'trip',
          name: 'Old trip',
          when: '2026-01-15',
          account: 'cash',
          amount: 10000,
        },
      ],
    };
  assert.throws(() => compareScenario(m, s), /now in the past/);
  assert.throws(
    () =>
      affordability(m, {
        when: '2026-04-01',
        amount: 10000,
        account: 'cash',
        asOf: '2026-01-01',
        end: '2026-03-31',
      }),
    /comparison horizon/,
  );
  m.accounts.push({
    id: 'shop',
    name: 'Business',
    type: 'cash',
    entity: 'business',
    opening: 0,
    reserve: 0,
  });
  assert.throws(
    () =>
      affordability(m, {
        when: '2026-02-01',
        amount: 10000,
        account: 'cash',
        watchAccount: 'shop',
        asOf: '2026-01-01',
        end: '2026-03-31',
      }),
    /funding owner/,
  );
});

test('headroom stays provisional until overdue cash expectations are resolved', () => {
  const m = fixture();
  m.schedules.push({
    id: 'missed',
    name: 'Unrecorded bill',
    frequency: 'monthly',
    anchor: '2026-01-01',
    day: 5,
    amount: -10000,
    account: 'cash',
    category: 'Other',
  });
  const s = planningSnapshot(m, '2026-01-10'),
    p = planningForecast(s, '2026-03-31');
  assert.equal(horizonSummary(s, 'cash', '2026-01-10', '2026-03-31', p).complete, false);
  assert.match(horizonSummary(m, 'cash', '2026-01-10', '2026-03-31').reason, /overdue/);
  m.schedules.at(-1).skipped = ['2026-01-05'];
  assert.equal(
    horizonSummary(planningSnapshot(m, '2026-01-10'), 'cash', '2026-01-10', '2026-03-31').complete,
    true,
  );
});

test('debt runway separates estimated interest, payments and net debt reduction', () => {
  const m = fixture();
  m.accounts[1].opening = -20000;
  const r = debtRunway(m, 'card', '2026-01-01', '2026-03-31');
  assert.equal(r.payoff, '2026-01-25');
  assert.equal(r.rows[0].payments, 20000);
  assert.equal(r.rows[0].interest, 0);
  assert.equal(r.rows[0].netReduction, 20000);
  assert.equal(r.complete, true);
  assert.throws(
    () =>
      compareScenario(m, {
        id: 'bad',
        name: 'Bad watch account',
        asOf: '2026-01-01',
        end: '2026-03-31',
        account: 'card',
        changes: [],
      }),
    /cash account/,
  );
  assert.throws(
    () =>
      applyScenarioChanges(
        m,
        {
          id: 'bad',
          name: 'Wrong debt account',
          asOf: '2026-01-01',
          end: '2026-03-31',
          changes: [{ type: 'balance', account: 'cash', amount: 100 }],
        },
        { hypotheticalBalances: true },
      ),
    /debt account/,
  );
});

test('category totals offset overspending and keep earmarks distinct without counting transfers twice', () => {
  const m = fixture();
  m.budgets[0].monthly['2026-01'] = 10000;
  m.budgets[1].monthly['2026-01'] = 10000;
  m.budgets.push(
    {
      id: 'dining',
      name: 'Dining',
      entity: 'household',
      account: 'cash',
      monthly: { '2026-01': 10000 },
    },
    {
      id: 'event',
      name: 'Birthday event',
      entity: 'household',
      account: 'cash',
      oneTimeMonth: '2026-01',
      monthly: { '2026-01': 5000 },
    },
  );
  m.transactions = [
    {
      id: 'food',
      date: '2026-01-08',
      description: 'Food',
      kind: 'expense',
      category: 'Groceries',
      status: 'pending',
      entries: [{ account: 'card', amount: -14000 }],
    },
    {
      id: 'gas',
      date: '2026-01-08',
      description: 'Fuel',
      kind: 'expense',
      category: 'Gas',
      status: 'cleared',
      entries: [{ account: 'card', amount: -2000 }],
    },
    {
      id: 'payoff',
      date: '2026-01-09',
      description: 'Pay card',
      kind: 'transfer',
      status: 'cleared',
      entries: [
        { account: 'cash', amount: -5000 },
        { account: 'card', amount: 5000 },
      ],
    },
  ];
  let b = budgetMonth(m, '2026-01', 'household', '2026-01-10'),
    s = categoryBudgetSummary(b.buckets, b.outside);
  assert.equal(b.buckets[0].remaining, -4000);
  assert.equal(s.everyday.remaining, 14000);
  assert.equal(s.earmarked.remaining, 5000);
  assert.equal(s.all.remaining, 19000);
  assert.equal(s.all.spent, 16000);
  m.transactions.push({
    id: 'return',
    date: '2026-01-10',
    description: 'Returned food',
    kind: 'refund',
    refundOf: 'food',
    category: 'Groceries',
    status: 'cleared',
    entries: [{ account: 'card', amount: 1000 }],
  });
  b = budgetMonth(m, '2026-01', 'household', '2026-01-10');
  s = categoryBudgetSummary(b.buckets, b.outside);
  assert.equal(s.everyday.remaining, 15000);
  assert.equal(s.all.spent, 15000);
  delete m.budgets[0].monthly['2026-01'];
  assert.equal(
    categoryBudgetSummary(budgetMonth(m, '2026-01', 'household', '2026-01-10').buckets).all.missing,
    true,
  );
});
test('category timing updates pace and daily reserves while preserving monthly targets, recorded spending and other categories', () => {
  const m = fixture(),
    before = JSON.stringify(m),
    old = planningForecast(m, '2026-02-28');
  const next = applyBudgetTiming(m, {
      budget: 'food',
      month: '2026-01',
      mode: 'date',
      when: '2026-01-25',
    }),
    p = planningForecast(next, '2026-02-28');
  assert.equal(JSON.stringify(m), before);
  assert.equal(p.days.at(-1).closing.cash, old.days.at(-1).closing.cash);
  assert.equal(budgetMonth(next, '2026-01', 'household', '2026-01-10').buckets[0].allowance, 64000);
  assert.equal(categoryPace(next, '2026-01', 'household', '2026-01-10')[0].expectedByToday, 0);
  assert.equal(next.budgets[1].timing, undefined);
  assert.equal(next.budgets[0].timing['2026-02'], undefined);
  assert.deepEqual(next.transactions, m.transactions);
  assert.equal(budgetTimingLabel(next, next.budgets[0], '2026-01'), 'On 2026-01-25');
});
test('forward timing changes clamp dates, preserve earlier months and protect closed / one-time budgets', () => {
  const m = fixture();
  m.budgets[0].timing = { '2026-01': { mode: 'daily' }, '2026-02': { mode: 'weekly', weekday: 2 } };
  const next = applyBudgetTiming(m, {
    budget: 'food',
    month: '2026-03',
    mode: 'date',
    when: '2026-03-31',
    scope: 'future',
  });
  assert.deepEqual(next.budgets[0].timing['2026-02'], { mode: 'weekly', weekday: 2 });
  assert.equal(next.budgets[0].timing['2027-02'].date, '2027-02-28');
  assert.equal(next.budgets[0].timing['2028-02'].date, '2028-02-29');
  assert.equal(next.budgets[0].timing['2026-04'].date, '2026-04-30');
  assert.equal(next.budgets[0].monthly['2026-03'], 64000);
  m.monthClosures = [{ month: '2026-03', entity: 'household' }];
  assert.throws(
    () =>
      applyBudgetTiming(m, { budget: 'food', month: '2026-02', mode: 'daily', scope: 'future' }),
    /closed month/,
  );
  m.budgets.push({
    id: 'event',
    name: 'One event',
    entity: 'household',
    account: 'cash',
    oneTimeMonth: '2026-01',
    monthly: { '2026-01': 1000 },
  });
  assert.throws(
    () =>
      applyBudgetTiming(m, { budget: 'event', month: '2026-01', mode: 'daily', scope: 'future' }),
    /one-time budget/,
  );
  assert.throws(
    () =>
      applyBudgetTiming(m, { budget: 'gas', month: '2026-01', mode: 'date', when: '2026-02-01' }),
    /selected month/,
  );
  assert.throws(
    () => applyBudgetTiming(m, { budget: 'gas', month: '2026-01', mode: 'weekly', weekday: 7 }),
    /weekday/,
  );
});
