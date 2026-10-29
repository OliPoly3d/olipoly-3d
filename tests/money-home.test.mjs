import test from 'node:test';
import assert from 'node:assert/strict';
import { upcomingActivity, cashHighlights, categoryAccent } from '../js/money-home.mjs';
import { installPaymentPlan } from '../js/money-credit.mjs';
import { belowFloorAreas } from '../js/money-charts.mjs';
function fixture() {
  return {
    version: 1,
    start: '2026-10-01',
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
        name: 'Daily card',
        type: 'card',
        entity: 'household',
        opening: -10000,
        reserve: 0,
        credit: { purchaseApr: 0, minimum: 2000, minimumAsOf: '2026-10-29', dueDay: 4 },
      },
      { id: 'shop', name: 'Shop', type: 'cash', entity: 'business', opening: 10000, reserve: 0 },
    ],
    transactions: [],
    schedules: [
      {
        id: 'pay',
        name: 'Paycheck',
        account: 'cash',
        amount: 100000,
        frequency: 'biweekly',
        anchor: '2026-10-02',
      },
      {
        id: 'bill',
        name: 'Electric',
        account: 'cash',
        amount: -10000,
        frequency: 'monthly',
        anchor: '2026-10-01',
        day: 2,
      },
      {
        id: 'business',
        name: 'Shop cost',
        account: 'shop',
        amount: -1000,
        frequency: 'monthly',
        anchor: '2026-10-01',
        day: 3,
      },
    ],
    budgets: [],
    seasonalItems: [],
  };
}
test('upcoming feed combines dates and kinds across month-end and replaces a matched expectation with one actual', () => {
  const m = fixture(),
    before = JSON.stringify(m),
    rows = upcomingActivity(m, { asOf: '2026-10-29', entity: 'household' });
  assert.deepEqual(
    rows.map((t) => t.date),
    ['2026-10-30', '2026-11-02'],
  );
  assert.equal(rows[0].kind, 'income');
  assert.equal(JSON.stringify(m), before);
  m.transactions.push({
    id: 'paid',
    description: 'Actual electric',
    date: '2026-11-02',
    kind: 'expense',
    category: 'Electric',
    status: 'pending',
    scheduleKey: 'bill:2026-11-02',
    entries: [{ account: 'cash', amount: -9901 }],
  });
  const next = upcomingActivity(m, { asOf: '2026-10-29', entity: 'household' });
  assert.equal(next.filter((t) => t.scheduleKey === 'bill:2026-11-02').length, 1);
  assert.equal(next.find((t) => t.id === 'paid').actual, true);
  assert.equal(next.find((t) => t.id === 'paid').entries[0].amount, -9901);
  assert.ok(next.every((t) => t.date <= '2026-11-11'));
});
test('feed uses the managed full card payoff instead of a placeholder and keeps transfer classification', () => {
  const m = installPaymentPlan(fixture(), 'card', {
    mode: 'full',
    amount: 1,
    day: 4,
    from: 'cash',
    asOf: '2026-10-01',
  });
  const rows = upcomingActivity(m, { asOf: '2026-10-29', entity: 'household' }),
    payment = rows.find((t) => t.creditPayment);
  assert.ok(payment);
  assert.equal(payment.kind, 'transfer');
  assert.equal(payment.entries[0].amount, -10000);
  assert.equal(payment.debt, true);
  assert.equal(rows.filter((t) => t.scheduleKey === payment.scheduleKey).length, 1);
  assert.ok(
    upcomingActivity(m, { asOf: '2026-10-29', entity: 'business' }).every((t) =>
      t.entries.some((e) => e.account === 'shop'),
    ),
  );
});
test('cash highlights select the daily low and major real events without treating category reserves as bills', () => {
  const days = [
    {
      date: '2026-10-29',
      low: { cash: 7000 },
      events: [
        {
          description: 'Gas reserve',
          kind: 'expense',
          budgetReserve: true,
          entries: [{ account: 'cash', amount: -2000 }],
        },
      ],
    },
    {
      date: '2026-10-30',
      low: { cash: 3000 },
      events: [
        { description: 'Paycheck', kind: 'income', entries: [{ account: 'cash', amount: 100000 }] },
      ],
    },
    {
      date: '2026-10-31',
      low: { cash: 9000 },
      events: [
        {
          description: 'Electric',
          kind: 'expense',
          entries: [{ account: 'cash', amount: -10000 }],
        },
      ],
    },
  ];
  const h = cashHighlights(days, 'cash');
  assert.equal(h.lowest.date, '2026-10-30');
  assert.equal(h.markers.length, 2);
  assert.equal(h.markers[0].label, 'Payday');
  assert.ok(!h.markers.some((m) => /reserve/.test(m.label)));
  assert.deepEqual(cashHighlights([], 'cash'), { lowest: null, markers: [] });
});
test('floor shading interpolates crossings and shades only the below-floor portions', () => {
  const points = [
      { date: '2026-10-29', value: 10000 },
      { date: '2026-10-30', value: 4000 },
      { date: '2026-10-31', value: 8000 },
    ],
    areas = belowFloorAreas(points, 5000);
  assert.equal(areas.length, 2);
  assert.ok(areas.flat().every((p) => p.value <= 5000));
  assert.equal(areas[0][0].value, 5000);
  assert.ok(+new Date(areas[0][0].date) > +new Date('2026-10-29'));
  assert.deepEqual(belowFloorAreas(points, 0), []);
  assert.deepEqual(belowFloorAreas(points, null), []);
  assert.equal(categoryAccent('Groceries'), categoryAccent('Groceries'));
  assert.notEqual(categoryAccent('Groceries'), categoryAccent('Gas'));
});
