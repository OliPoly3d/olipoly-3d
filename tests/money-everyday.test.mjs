import test from 'node:test';
import assert from 'node:assert/strict';
import { balances, validate } from '../js/money-engine.mjs';
import { budgetMonth } from '../js/money-budget.mjs';
import { verifyBalance, validateConfidence } from '../js/money-confidence.mjs';
import { monthFingerprint } from '../js/money-month-close.mjs';
import {
  budgetMoveAvailability,
  moveCategoryBudget,
  transactionImpact,
  balanceFreshness,
  reviewFindings,
  saveWeeklyReview,
  undoLastSave,
  undoEligibility,
  saveReceipt,
} from '../js/money-everyday.mjs';
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
        opening: 100000,
        reserve: 10000,
      },
      { id: 'other', name: 'Savings', type: 'cash', entity: 'household', opening: 0, reserve: 0 },
      {
        id: 'card',
        name: 'Card',
        type: 'card',
        entity: 'household',
        opening: -10000,
        reserve: 0,
        credit: { purchaseApr: 0, minimum: 0, minimumAsOf: '2026-10-29', dueDay: 5 },
      },
    ],
    transactions: [],
    schedules: [],
    budgets: [
      {
        id: 'gas',
        name: 'Gas',
        account: 'cash',
        entity: 'household',
        monthly: { '2026-10': 40000, '2026-11': 40000, '2026-12': 40000 },
      },
      {
        id: 'food',
        name: 'Groceries',
        account: 'cash',
        entity: 'household',
        monthly: { '2026-10': 65000, '2026-11': 65000, '2026-12': 65000 },
      },
      {
        id: 'yoy',
        name: 'Extras',
        account: 'cash',
        entity: 'household',
        seasonal: true,
        monthly: { '2026-10': 0, '2026-11': 0, '2026-12': 0 },
      },
    ],
    seasonalItems: [],
  };
}
const expense = (id, amount, category = 'Gas', date = '2026-10-28', account = 'card') => ({
  id,
  date,
  description: id,
  kind: 'expense',
  status: 'cleared',
  category,
  entries: [{ account, amount: -amount }],
});
const move = (m, values = {}) =>
  moveCategoryBudget(m, {
    from: 'gas',
    to: 'food',
    amount: 10000,
    month: '2026-10',
    asOf: '2026-10-29',
    ...values,
  });
test('guided budget move preserves totals, actuals, YOY and months outside chosen scope', () => {
  const m = fixture();
  m.transactions.push(expense('fuel', 10000));
  const n = move(m);
  assert.equal(n.budgets[0].overrides['2026-10'], 30000);
  assert.equal(n.budgets[1].overrides['2026-10'], 75000);
  assert.equal(
    budgetMonth(n, '2026-10', 'household', '2026-10-29').totals.budget,
    budgetMonth(m, '2026-10', 'household', '2026-10-29').totals.budget,
  );
  assert.deepEqual(n.transactions, m.transactions);
  assert.deepEqual(n.budgets[2], m.budgets[2]);
  assert.equal(n.budgets[0].overrides['2026-11'], undefined);
  assert.equal(m.budgets[0].overrides, undefined);
  assert.equal(n.budgetMoves.length, 1);
  assert.doesNotThrow(() => validateConfidence(validate(n)));
});
test('budget moves protect future booked purchases and known unmatched category commitments', () => {
  const m = fixture();
  m.transactions.push(expense('future', 10000, 'Gas', '2026-10-31'));
  m.schedules.push({
    id: 'trip',
    name: 'Fuel trip',
    account: 'cash',
    amount: -15000,
    frequency: 'monthly',
    anchor: '2026-10-01',
    day: 31,
    category: 'Gas',
  });
  const gas = budgetMoveAvailability(m, '2026-10', 'household').find((b) => b.id === 'gas');
  assert.equal(gas.committed, 15000);
  assert.equal(gas.movable, 15000);
  assert.throws(() => move(m, { amount: 15001 }), /unspent, uncommitted/);
  assert.doesNotThrow(() => move(m, { amount: 15000 }));
});
test('budget move range rejects owner, earmark, funding, missing-target and closed-month conflicts atomically', () => {
  const m = fixture();
  assert.throws(() => move(m, { to: 'yoy' }), /earmarks/);
  const cross = structuredClone(m);
  cross.budgets[1].entity = 'business';
  assert.throws(() => move(cross), /same owner/);
  const funding = structuredClone(m);
  funding.budgets[1].funding = { '2026-11': 'other' };
  assert.throws(() => move(funding, { through: '2026-11' }), /different funding/);
  assert.equal(funding.budgets[0].overrides, undefined);
  const missing = structuredClone(m);
  delete missing.budgets[1].monthly['2026-11'];
  assert.throws(() => move(missing, { through: '2026-11' }), /Set both/);
  const closed = structuredClone(m);
  closed.monthClosures = [{ entity: 'household', month: '2026-11' }];
  assert.throws(() => move(closed, { through: '2026-11' }), /closed months/);
  const n = move(m, { through: '2026-12' });
  assert.deepEqual(Object.keys(n.budgets[0].overrides), ['2026-10', '2026-11', '2026-12']);
});
test('entry impact uses account postings once while card payment has zero category impact', () => {
  const m = fixture(),
    purchase = expense('shop', 10000, 'Groceries');
  let impact = transactionImpact(m, purchase, '2026-10-29');
  assert.deepEqual(impact.current, [{ account: 'card', amount: -10000, debt: true }]);
  assert.equal(impact.cashUnchanged, true);
  assert.equal(impact.categories[0].amount, 10000);
  m.transactions.push(purchase);
  const payment = {
    id: 'payment',
    date: '2026-10-29',
    kind: 'transfer',
    status: 'cleared',
    category: 'Dining',
    entries: [
      { account: 'cash', amount: -20000 },
      { account: 'card', amount: 20000 },
    ],
  };
  impact = transactionImpact(m, payment, '2026-10-29');
  assert.deepEqual(impact.categories, []);
  assert.equal(impact.current.length, 2);
  assert.equal(impact.cashUnchanged, false);
  assert.equal(
    budgetMonth({ ...m, transactions: [purchase, payment] }, '2026-10', 'household', '2026-10-29')
      .totals.spent,
    10000,
  );
});
test('entry impact handles edited splits, partial refunds, future dates and dated loan principal correctly', () => {
  const m = fixture(),
    purchase = {
      ...expense('shop', 10000, 'Groceries'),
      allocations: [
        { category: 'Groceries', amount: 6000 },
        { category: 'Gas', amount: 4000 },
      ],
    };
  m.transactions.push(purchase);
  const edited = {
    ...purchase,
    allocations: [
      { category: 'Groceries', amount: 7000 },
      { category: 'Gas', amount: 3000 },
    ],
  };
  const i = transactionImpact(m, edited, '2026-10-29');
  assert.deepEqual(i.current, []);
  assert.deepEqual(
    i.categories.map((c) => c.amount),
    [1000, -1000],
  );
  const refund = {
    id: 'return',
    date: '2026-10-29',
    kind: 'refund',
    status: 'cleared',
    category: 'Groceries',
    refundOf: 'shop',
    entries: [{ account: 'card', amount: 2000 }],
    allocations: [{ category: 'Groceries', amount: 2000 }],
  };
  assert.equal(transactionImpact(m, refund, '2026-10-29').categories[0].amount, -2000);
  assert.deepEqual(
    transactionImpact(m, expense('later', 500, 'Gas', '2026-11-01'), '2026-10-29').current,
    [],
  );
  m.accounts.push({
    id: 'loan',
    name: 'Loan',
    type: 'loan',
    entity: 'household',
    opening: -50000,
    reserve: 0,
    principalSnapshots: [{ date: '2026-10-20', balance: -30000 }],
  });
  const old = {
    id: 'loan-pay',
    date: '2026-10-15',
    kind: 'transfer',
    status: 'cleared',
    entries: [
      { account: 'cash', amount: -1000 },
      { account: 'loan', amount: 1000 },
    ],
  };
  m.transactions.push(old);
  const changed = {
    ...old,
    entries: [
      { account: 'cash', amount: -2000 },
      { account: 'loan', amount: 2000 },
    ],
  };
  assert.deepEqual(transactionImpact(m, changed, '2026-10-29').current, [
    { account: 'cash', amount: -1000, debt: false },
  ]);
});
test('freshness requires a valid recent checkpoint, recognizes new activity and does not invent verification', () => {
  let m = fixture();
  assert.equal(balanceFreshness(m, 'cash', '2026-10-29').verified, false);
  m = verifyBalance(m, {
    account: 'cash',
    asOf: '2026-10-25',
    basis: 'posted',
    bankBalance: 100000,
  });
  assert.equal(balanceFreshness(m, 'cash', '2026-10-29').verified, true);
  assert.equal(balanceFreshness(m, 'cash', '2026-11-02').verified, false);
  m.transactions.push(expense('new', 100, 'Gas', '2026-10-28', 'cash'));
  assert.match(balanceFreshness(m, 'cash', '2026-10-29').reason, /New activity/);
  m.transactions.push(expense('backdated', 100, 'Gas', '2026-10-24', 'cash'));
  assert.match(balanceFreshness(m, 'cash', '2026-10-29').reason, /Entries changed/);
});
test('weekly review saves honest followups without paying expectations or verifying accounts', () => {
  const m = fixture();
  m.schedules.push({
    id: 'bill',
    name: 'Bill',
    account: 'cash',
    amount: -1000,
    frequency: 'monthly',
    anchor: '2026-10-01',
    day: 27,
  });
  m.transactions.push({ ...expense('pending', 100), status: 'pending' });
  const values = {
      entity: 'household',
      asOf: '2026-10-29',
      cashAccount: 'cash',
      accountIds: ['cash', 'card'],
    },
    f = reviewFindings(m, values);
  assert.equal(f.expected.length, 1);
  assert.equal(f.pending.length, 1);
  assert.equal(f.accounts.filter((a) => a.verified).length, 0);
  assert.ok(f.followups >= 4);
  assert.throws(() => saveWeeklyReview(m, values), /acknowledge/);
  const n = saveWeeklyReview(m, { ...values, acceptFollowups: true });
  assert.equal(n.weeklyReviews[0].status, 'followups');
  assert.equal(n.weeklyReviews[0].followups, f.followups);
  assert.equal(n.weeklyReviews[0].checked, 0);
  assert.deepEqual(n.transactions, m.transactions);
  assert.deepEqual(n.schedules, m.schedules);
  assert.equal(n.reconciliations, undefined);
  assert.doesNotThrow(() => validateConfidence(n));
});
test('undo restores the preceding save at the exact revision and keeps newer audit history', () => {
  const before = fixture(),
    after = move(before);
  after.transactions.push(expense('new', 500));
  after.changeLog = [{ id: 'audit' }];
  const n = undoLastSave({ previous: before, current: after, revision: 5, expectedRevision: 5 });
  assert.deepEqual(n.budgets, before.budgets);
  assert.deepEqual(n.transactions, before.transactions);
  assert.deepEqual(n.changeLog, after.changeLog);
  assert.throws(
    () => undoLastSave({ previous: before, current: after, revision: 6, expectedRevision: 5 }),
    /plan changed/,
  );
  assert.throws(
    () =>
      undoLastSave({
        previous: before,
        current: after,
        revision: 5,
        expectedRevision: 5,
        hasPreview: true,
      }),
    /preview/,
  );
});
test('undo rejects reset, principal and month-close changes; retained closed history remains protected', () => {
  const m = fixture(),
    reset = structuredClone(m);
  reset.accounts[0].opening++;
  assert.equal(undoEligibility(m, reset).allowed, false);
  reset.accounts[0].opening--;
  reset.start = '2026-10-02';
  assert.equal(undoEligibility(m, reset).allowed, false);
  const closed = structuredClone(m);
  closed.monthClosures = [
    {
      month: '2026-10',
      entity: 'household',
      closedOn: '2026-11-01',
      cash: 100000,
      signature: monthFingerprint(m, '2026-10', 'household'),
    },
  ];
  assert.equal(undoEligibility(m, closed).allowed, false);
  assert.throws(
    () => undoLastSave({ previous: m, current: closed, revision: 1, expectedRevision: 1 }),
    /reopening/,
  );
});
test('save receipt shows net category change and selected month forecast without changing either plan', () => {
  const m = fixture(),
    n = { ...m, transactions: [expense('shop', 1000, 'Groceries')] },
    copy = JSON.stringify([m, n]);
  const r = saveReceipt(m, n, {
    asOf: '2026-10-29',
    account: 'cash',
    revision: 0,
    month: '2026-11',
  });
  assert.equal(r.recorded, 1);
  assert.equal(r.categoryEffects[0].amount, 1000);
  assert.equal(r.forecast?.month, '2026-11');
  assert.equal(JSON.stringify([m, n]), copy);
  assert.equal(balances(m, '2026-10-29').cash, 100000);
});

test('weekly review retains cash uncertainty outside watched accounts and catches missing funding', () => {
  const m = fixture();
  delete m.budgets[0].account;
  const f = reviewFindings(m, {
    entity: 'household',
    asOf: '2026-10-29',
    accountIds: [],
    cashAccount: 'cash',
  });
  assert.equal(f.missing.length, 1);
  assert.ok(f.followups >= 2);
  assert.equal(f.cash.complete, false);
  const business = fixture();
  business.accounts[0].entity = 'business';
  business.budgets = [];
  const b = reviewFindings(business, {
    entity: 'business',
    asOf: '2026-10-29',
    accountIds: [],
    cashAccount: 'cash',
  });
  assert.ok(b.cash.reasons.includes('Confirm additional tax / working-cash reserve'));
  assert.ok(b.followups >= 2);
});
