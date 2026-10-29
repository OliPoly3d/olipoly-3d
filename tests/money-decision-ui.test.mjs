import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ensureMonthlyBaselines } from '../js/money-confidence.mjs';
import { balances } from '../js/money-engine.mjs';
import { budgetMonth, shiftMonth } from '../js/money-budget.mjs';
const dependency = process.env.MONEY_JSDOM_MODULE,
  skip = !dependency,
  tick = () => new Promise((resolve) => setTimeout(resolve, 30));
function fixture() {
  const months = {};
  for (let i = 0; i < 60; i++) months[shiftMonth('2026-10', i)] = 10000;
  return ensureMonthlyBaselines(
    {
      version: 1,
      start: '2026-10-01',
      accounts: [
        {
          id: 'cash',
          name: 'Checking',
          type: 'cash',
          entity: 'household',
          opening: 1000000,
          reserve: 50000,
        },
        {
          id: 'savings',
          name: 'Savings',
          type: 'cash',
          entity: 'household',
          opening: 50000,
          reserve: 0,
        },
        {
          id: 'card',
          name: 'Daily card',
          type: 'card',
          entity: 'household',
          opening: -10000,
          reserve: 0,
          credit: {
            purchaseApr: 0,
            promoApr: 0,
            promoBalance: 10000,
            promoEnd: '2027-04-01',
            postPromoApr: 20,
          },
        },
        { id: 'shop', name: 'Shop', type: 'cash', entity: 'business', opening: 10000, reserve: 0 },
      ],
      transactions: [],
      schedules: [
        {
          id: 'pay',
          name: 'Pay',
          account: 'cash',
          amount: 100000,
          frequency: 'biweekly',
          anchor: '2026-10-02',
        },
        {
          id: 'bill',
          name: 'Streaming subscription',
          account: 'cash',
          amount: -1000,
          frequency: 'monthly',
          anchor: '2026-10-01',
          day: 28,
          category: 'Subscription',
        },
      ],
      budgets: [
        { id: 'food', name: 'Groceries', entity: 'household', account: 'cash', monthly: months },
        { id: 'gas', name: 'Gas', entity: 'household', account: 'cash', monthly: { ...months } },
      ],
      seasonalItems: [],
      savingsBuckets: [
        {
          id: 'fun',
          name: 'Fun',
          account: 'savings',
          start: '2026-10-01',
          opening: 50000,
          scheduleIds: [],
        },
      ],
    },
    '2026-10-29',
  );
}
let index = 0;
async function page(initial) {
  const { JSDOM } = await import(pathToFileURL(dependency).href),
    dom = new JSDOM(fs.readFileSync(new URL('../money.html', import.meta.url), 'utf8'), {
      url: 'https://test.invalid/money.html',
    }),
    old = {};
  for (const key of ['window', 'document', 'Node', 'FormData', 'fetch', 'Date'])
    old[key] = globalThis[key];
  for (const key of ['window', 'document', 'Node', 'FormData']) globalThis[key] = dom.window[key];
  globalThis.Date = class extends old.Date {
    constructor(...args) {
      super(...(args.length ? args : ['2026-10-29T16:00:00Z']));
    }
    static now() {
      return +new old.Date('2026-10-29T16:00:00Z');
    }
  };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  let model = initial || fixture(),
    session = { user: { id: 'synthetic-owner' } },
    revision = 0,
    conflict = false,
    fail = false;
  dom.window.OliPolyAuth = {
    SUPABASE_URL: 'https://test.invalid',
    recover: async () => session,
    authHeaders: () => ({}),
    logout: () => {},
  };
  globalThis.fetch = async (url, opts = {}) => {
    let result;
    if (opts.method === 'PATCH') {
      if (fail)
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: 'Synthetic server failure' }),
        };
      if (conflict) result = [];
      else {
        const row = JSON.parse(opts.body);
        model = row.body;
        revision = row.revision;
        result = [{ body: model, revision }];
      }
    } else
      result = url.includes('money_access')
        ? [{ user_id: 'synthetic-owner' }]
        : [{ body: model, revision }];
    return { ok: true, json: async () => result };
  };
  await import('../js/money-app.mjs?decisions-ui-' + ++index);
  const $ = (id) => dom.window.document.getElementById(id),
    change = (input, value) => {
      if (input.type === 'checkbox') input.checked = value;
      else input.value = value;
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    },
    submit = async (id) => {
      $(id).dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
      await tick();
    };
  return {
    dom,
    $,
    change,
    submit,
    get model() {
      return model;
    },
    get revision() {
      return revision;
    },
    set conflict(v) {
      conflict = v;
    },
    set fail(v) {
      fail = v;
    },
    expire() {
      session = null;
    },
    remote(fn) {
      fn(model);
      revision++;
    },
    close() {
      dom.window.close();
      for (const [k, v] of Object.entries(old)) globalThis[k] = v;
    },
  };
}
test(
  'quick split purchase, partial friend repayment and card payment preserve one charge and all category detail',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      $('quickPurchase').click();
      assert.equal($('transactionDialog').open, true);
      const f = $('transactionForm');
      change(f.elements.account, 'card');
      f.elements.description.value = 'Shared market trip';
      f.elements.amount.value = '100.00';
      change(f.elements.splitPurchase, true);
      const splits = $('splitRows').children;
      change(splits[0].querySelector('select'), 'Groceries');
      splits[0].querySelector('input').value = '60';
      change(splits[1].querySelector('select'), 'Gas');
      splits[1].querySelector('input').value = '40';
      await submit('transactionForm');
      assert.equal(p.revision, 1);
      assert.equal(p.model.transactions.length, 1);
      assert.equal($('transactionDialog').open, false);
      assert.deepEqual(p.model.transactions[0].allocations, [
        { category: 'Groceries', amount: 6000 },
        { category: 'Gas', amount: 4000 },
      ]);
      assert.equal(balances(p.model, '2026-10-29').card, -20000);
      $('quickRefund').click();
      change(f.elements.refundOf, p.model.transactions[0].id);
      change(f.elements.account, 'cash');
      f.elements.description.value = 'Friend share returned';
      f.elements.amount.value = '30';
      const parts = $('splitRows').children;
      parts[0].querySelector('input').value = '20';
      parts[1].querySelector('input').value = '10';
      await submit('transactionForm');
      assert.equal(p.revision, 2);
      let b = budgetMonth(p.model, '2026-10', 'household', '2026-10-29');
      assert.equal(b.buckets.find((x) => x.id === 'food').spent, 4000);
      assert.equal(b.buckets.find((x) => x.id === 'gas').spent, 3000);
      assert.equal(balances(p.model, '2026-10-29').cash, 1003000);
      $('quickCardPayment').click();
      assert.equal(f.elements.category.disabled, true);
      change(f.elements.account, 'cash');
      change(f.elements.to, 'card');
      f.elements.amount.value = '200';
      await submit('transactionForm');
      assert.equal(p.revision, 3);
      assert.equal(balances(p.model, '2026-10-29').card, 0);
      b = budgetMonth(p.model, '2026-10', 'household', '2026-10-29');
      assert.equal(b.totals.spent, 7000);
      assert.match($('ledgerRows').textContent, /refund/);
      assert.match($('changeHistory').textContent, /current balance change/);
      $('quickPurchase').click();
      assert.equal(f.elements.category.disabled, false);
      assert.equal(f.elements.account.value, 'card');
      $('clearMatch').click();
      assert.equal(p.revision, 3);
      assert.equal($('transactionDialog').open, false);
    } finally {
      p.close();
    }
  },
);
test(
  'stale entry refresh preserves raw split fields, requires explicit preview discard, then saves once',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      const target = document.querySelector('#categoryRows input');
      change(target, '90.00');
      $('quickPurchase').click();
      const f = $('transactionForm');
      f.elements.description.value = 'Unsent purchase';
      f.elements.amount.value = '25.01';
      change(f.elements.splitPurchase, true);
      const r = $('splitRows').children;
      r[0].querySelector('input').value = '15.01';
      r[1].querySelector('input').value = '10';
      change(r[1].querySelector('select'), 'Gas');
      p.conflict = true;
      await submit('transactionForm');
      assert.equal(p.revision, 0);
      assert.equal($('refreshTransactionEntry').hidden, false);
      assert.match($('entryStatus').textContent, /another tab/);
      $('refreshTransactionEntry').click();
      await tick();
      assert.match($('entryStatus').textContent, /Check discard preview/);
      assert.equal(f.elements.amount.value, '25.01');
      p.conflict = false;
      p.remote((m) => {
        m.accounts.find((a) => a.id === 'cash').name = 'Updated Checking';
      });
      $('discardPreviewRefresh').checked = true;
      $('refreshTransactionEntry').click();
      await tick();
      assert.equal(f.elements.description.value, 'Unsent purchase');
      assert.equal($('splitRows').children[0].querySelector('input').value, '15.01');
      assert.equal(p.revision, 1);
      await submit('transactionForm');
      assert.equal(p.revision, 2);
      assert.equal(p.model.transactions.length, 1);
      assert.equal(p.model.budgets[0].overrides, undefined);
    } finally {
      p.close();
    }
  },
);
test(
  'expected one-time entries stay planned; cash wallet transfers and spending count once; ledger filters every actual type',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      $('quickPurchase').click();
      const f = $('transactionForm');
      change(f.elements.entryTiming, 'plan');
      f.elements.description.value = 'Expected outing';
      f.elements.date.value = '2026-11-02';
      f.elements.amount.value = '50';
      change(f.elements.category, 'Groceries');
      await submit('transactionForm');
      assert.equal(p.model.transactions.length, 0);
      assert.equal(p.revision, 0);
      $('savePlan').click();
      await tick();
      assert.equal(p.revision, 1);
      assert.ok(p.model.schedules.some((s) => s.name === 'Expected outing' && s.oneTime));
      $('walletOpening').value = '20';
      $('createWallet').click();
      $('savePlan').click();
      await tick();
      const wallet = p.model.accounts.find((a) => a.wallet);
      assert.ok(wallet);
      assert.equal(balances(p.model, '2026-10-29')[wallet.id], 2000);
      $('walletWithdraw').click();
      f.elements.amount.value = '40';
      await submit('transactionForm');
      $('walletSpend').click();
      f.elements.amount.value = '10';
      f.elements.category.value = 'Gas';
      await submit('transactionForm');
      $('walletReturn').click();
      f.elements.amount.value = '30';
      await submit('transactionForm');
      assert.equal(balances(p.model, '2026-10-29')[wallet.id], 2000);
      assert.equal(budgetMonth(p.model, '2026-10', 'household', '2026-10-29').totals.spent, 1000);
      change($('ledgerAccount'), wallet.id);
      assert.match($('ledgerCount').textContent, /4 matching/);
      change($('ledgerCategory'), 'Gas');
      assert.match($('ledgerCount').textContent, /1 matching/);
      $('ledgerClear').click();
      assert.match($('ledgerRows').textContent, /Cash withdrawal/);
    } finally {
      p.close();
    }
  },
);
test(
  'affordability and saved scenario compare first and apply only choices, never hypothetical debts',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      const f = $('affordForm');
      f.elements.name.value = 'Party';
      f.elements.when.value = '2026-11-12';
      f.elements.amount.value = '25';
      change(f.elements.mode, 'allowance');
      change(f.elements.budget, 'food');
      await submit('affordForm');
      assert.match($('affordResult').textContent, /Change/);
      assert.equal(p.revision, 0);
      $('affordApply').click();
      assert.match($('planState').textContent, /Previewing/);
      assert.equal(p.model.schedules.length, 2);
      $('resetPlan').click();
      const s = $('householdScenarioForm');
      s.elements.name.value = 'Lower target';
      s.elements.end.value = '2027-12';
      const c = $('scenarioChangeForm');
      change(c.elements.type, 'budget');
      c.elements.budget.value = 'food';
      c.elements.month.value = '2026-11';
      c.elements.through.value = '2026-12';
      c.elements.amount.value = '80';
      await submit('scenarioChangeForm');
      change(c.elements.type, 'balance');
      c.elements.account.value = 'card';
      c.elements.amount.value = '999';
      await submit('scenarioChangeForm');
      await submit('householdScenarioForm');
      assert.equal(p.revision, 0);
      $('compareHouseholdScenario').click();
      assert.match($('householdScenarioResult').textContent, /Estimated interest/);
      assert.ok($('householdScenarioChart').querySelector('svg'));
      $('applyHouseholdScenario').click();
      $('savePlan').click();
      await tick();
      assert.equal(p.revision, 1);
      assert.equal(p.model.accounts.find((a) => a.id === 'card').opening, -10000);
      assert.equal(p.model.budgets[0].overrides['2026-11'], 8000);
      assert.equal(p.model.householdScenarios[0].changes.length, 2);
    } finally {
      p.close();
    }
  },
);
test(
  'new recurrence, goal, future year preparation, renewal editing and all chart tabs render without phantom writes',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      for (const view of ['pace', 'lows', 'bridge', 'cash']) {
        document.querySelector('[data-overview="' + view + '"]').click();
        assert.ok($('decisionChartHeading').textContent);
        assert.doesNotMatch($('decisionChart').innerHTML, /NaN/);
      }
      assert.equal($('decisionChart').querySelectorAll('svg').length, 1);
      change($('inspectDate'), '2026-10-30');
      assert.match($('eventInspector').textContent, /Pay/);
      const f = $('scheduleForm');
      f.elements.name.value = 'Gym class';
      f.elements.amount.value = '75';
      f.elements.account.value = 'cash';
      change(f.elements.frequency, 'weeks');
      assert.equal(f.elements.intervalWeeks.disabled, false);
      f.elements.intervalWeeks.value = '10';
      f.elements.anchor.value = '2026-11-01';
      f.elements.category.value = 'Child';
      await submit('scheduleForm');
      assert.equal(p.revision, 1);
      assert.equal(p.model.schedules.at(-1).intervalWeeks, 10);
      document.querySelector('#savingsRows button').click();
      const b = $('savingsBucketForm');
      b.elements.goalAmount.value = '600';
      b.elements.goalDate.value = '2027-12-31';
      await submit('savingsBucketForm');
      assert.match($('runwayNote').textContent, /Goal \$600.00/);
      const y = $('prepareYearForm');
      y.elements.sourceYear.value = '2026';
      y.elements.targetYear.value = '2027';
      $('reviewFutureYear').click();
      assert.equal($('yearTargetRows').querySelectorAll('input').length, 24);
      await submit('prepareYearForm');
      assert.match(
        $('yearPreparationResult').textContent,
        /Explicit future targets were preserved/,
      );
      const renewal = $('renewalForm');
      renewal.elements.source.value = 'schedule|bill';
      change(renewal.elements.renewal, 'yes');
      renewal.elements.reviewDate.value = '2026-10-30';
      await submit('renewalForm');
      assert.match($('renewalRows').textContent, /Review 2026-10-30/);
      assert.equal(p.revision, 1);
      $('budgetEntity').value = 'business';
      $('budgetEntity').dispatchEvent(new window.Event('change'));
      assert.equal($('businessPayout').hidden, false);
      $('budgetEntity').value = 'household';
      $('budgetEntity').dispatchEvent(new window.Event('change'));
      assert.equal($('businessPayout').hidden, true);
      $('logout').click();
      assert.equal($('decisionChart').textContent, '');
      assert.equal($('ledgerRows').textContent, '');
      assert.equal($('transactionDialog').open, false);
    } finally {
      p.close();
    }
  },
);

test(
  'large searchable activity limits DOM rows and size guard preserves unsaved entries',
  { skip },
  async () => {
    const m = fixture();
    m.transactions = Array.from({ length: 8000 }, (_, i) => ({
      id: 'large-' + i,
      date: '2026-10-10',
      description: i === 7999 ? 'Needle purchase' : 'Recorded purchase ' + i,
      note: 's'.repeat(100),
      kind: 'expense',
      category: 'Groceries',
      status: 'cleared',
      entries: [{ account: 'card', amount: -1 }],
    }));
    const p = await page(m);
    try {
      const { $, change, submit } = p;
      assert.equal($('ledgerRows').children.length, 300);
      assert.equal($('transactions').children.length, 300);
      assert.match($('ledgerCount').textContent, /8000 matching/);
      $('ledgerQuery').value = 'Needle';
      $('ledgerQuery').dispatchEvent(new window.Event('input'));
      assert.equal($('ledgerRows').children.length, 1);
      assert.match($('ledgerRows').textContent, /Needle purchase/);
      $('quickPurchase').click();
      const f = $('transactionForm');
      f.elements.description.value = 'Must preserve entry';
      f.elements.amount.value = '1';
      f.elements.category.value = 'Groceries';
      await submit('transactionForm');
      assert.equal(p.revision, 0);
      assert.match($('entryStatus').textContent, /storage limit/);
      assert.equal(f.elements.description.value, 'Must preserve entry');
      assert.equal(p.model.transactions.length, 8000);
      $('logout').click();
    } finally {
      p.close();
    }
  },
);

test(
  'stale refresh after sign-out clears the old entry instead of restoring it into a locked page',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, submit } = p;
      $('quickPurchase').click();
      const f = $('transactionForm');
      f.elements.description.value = 'Private unsaved purchase';
      f.elements.amount.value = '19';
      f.elements.category.value = 'Gas';
      p.conflict = true;
      await submit('transactionForm');
      p.expire();
      $('refreshTransactionEntry').click();
      await tick();
      assert.equal($('app').hidden, true);
      assert.equal($('transactionDialog').open, false);
      assert.equal(f.elements.description.value, '');
      assert.equal($('ledgerRows').textContent, '');
      assert.equal($('ledgerAccount').options.length, 0);
      assert.equal(p.revision, 0);
    } finally {
      p.close();
    }
  },
);

test(
  'summary and pace expose the combined remainder and direct timing edits without rewriting spending',
  { skip },
  async () => {
    const m = fixture();
    m.budgets.push(
      {
        id: 'dining',
        name: 'Dining',
        entity: 'household',
        account: 'cash',
        monthly: { ...m.budgets[0].monthly },
      },
      { id: 'seasonal', name: 'YOY', entity: 'household', account: 'cash', seasonal: true },
      {
        id: 'event',
        name: 'One-time event',
        entity: 'household',
        account: 'cash',
        oneTimeMonth: '2026-10',
        monthly: { '2026-10': 5000 },
      },
    );
    m.seasonalItems = [
      { id: 'gifts', name: 'Gifts', entity: 'household', month: 10, amount: 10000 },
    ];
    m.transactions = [
      {
        id: 'food',
        date: '2026-10-26',
        description: 'Food',
        kind: 'expense',
        category: 'Groceries',
        status: 'pending',
        entries: [{ account: 'card', amount: -14000 }],
      },
      {
        id: 'gas',
        date: '2026-10-26',
        description: 'Gas',
        kind: 'expense',
        category: 'Gas',
        status: 'cleared',
        entries: [{ account: 'card', amount: -2000 }],
      },
      {
        id: 'payoff',
        date: '2026-10-27',
        description: 'Pay card',
        kind: 'transfer',
        status: 'cleared',
        entries: [
          { account: 'cash', amount: -5000 },
          { account: 'card', amount: 5000 },
        ],
      },
    ];
    const p = await page(m);
    try {
      const { $, change, submit } = p,
        summary = $('categorySpendingSummary'),
        before = JSON.stringify(p.model.transactions);
      assert.equal(summary.closest('details'), null);
      assert.match(summary.textContent, /Everyday categories left: \$140.00/);
      assert.match(summary.textContent, /earmarks left: \$150.00/);
      assert.match(summary.textContent, /combined budget still has \$290.00/);
      assert.match($('categoryBudgetTotal').textContent, /\$290.00/);
      document.querySelector('[data-overview="pace"]').click();
      const food = document.querySelector('[data-pace-budget="food"]');
      assert.equal(food.cells[3].textContent, '-$40.00');
      assert.equal($('paceOverall').cells[3].textContent, '$290.00');
      assert.equal($('paceOverall').cells[4].textContent, 'Timing incomplete');
      food.querySelector('button').click();
      assert.equal($('timingEntry').open, true);
      const f = $('timingForm');
      assert.equal(f.elements.budget.value, 'food');
      change(f.elements.mode, 'date');
      f.elements.when.value = '2026-10-31';
      change(f.elements.scope, 'future');
      await submit('timingForm');
      assert.equal(p.revision, 0);
      assert.equal(
        document.querySelector('[data-pace-budget="food"]').cells[4].textContent,
        '$0.00',
      );
      assert.match(summary.textContent, /Everyday categories left: \$140.00/);
      assert.equal(JSON.stringify(p.model.transactions), before);
      $('savePlan').click();
      await tick();
      assert.equal(p.revision, 1);
      assert.equal(p.model.budgets[0].timing['2027-02'].date, '2027-02-28');
      assert.equal(p.model.budgets[0].timing['2028-02'].date, '2028-02-29');
      assert.equal(p.model.budgets[1].timing, undefined);
      assert.equal(JSON.stringify(p.model.transactions), before);
      document.querySelector('[data-pace-budget="food"] button').click();
      assert.equal(f.elements.scope.value, 'month');
      change(f.elements.mode, 'weekly');
      change(f.elements.weekday, '1');
      await submit('timingForm');
      assert.match(
        document.querySelector('[data-pace-budget="food"] button').textContent,
        /Weekly · Monday/,
      );
      $('resetPlan').click();
      assert.match(
        document.querySelector('[data-pace-budget="food"] button').textContent,
        /On 2026-10-31/,
      );
      document.querySelectorAll('[data-pace-budget="food"] button')[1].click();
      assert.equal(document.activeElement, document.querySelector('[data-budget-id="food"] input'));
      change(document.querySelector('[data-budget-id="food"] input'), '140.00');
      change(document.querySelector('[data-budget-id="dining"] input'), '60.00');
      assert.equal(
        document.querySelector('[data-pace-budget="food"]').cells[3].textContent,
        '$0.00',
      );
      assert.match(summary.textContent, /Everyday categories left: \$140.00/);
      assert.equal($('paceOverall').cells[3].textContent, '$290.00');
      assert.equal($('categoryBudgetTotal').cells[3].textContent, '$290.00');
      assert.equal(JSON.stringify(p.model.transactions), before);
      assert.equal(p.revision, 1);
      $('resetPlan').click();
      $('debtPrivacy').click();
      assert.equal(summary.closest('[data-debt-private]'), null);
      assert.equal($('categoryBudgetTotal').cells[3].textContent, '$290.00');
      $('logout').click();
      assert.equal(summary.textContent, '');
      assert.equal($('timingScopeNote').textContent, '');
    } finally {
      p.close();
    }
  },
);

test(
  'everyday views route existing editors and keep Today on the current month',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change } = p;
      assert.equal($('app').dataset.moneyView, 'today');
      assert.equal($('everydaySection').hidden, false);
      assert.equal($('plannerSection').hidden, true);
      document.querySelector('[data-money-view-button="month"]').click();
      assert.equal($('summarySection').hidden, false);
      change($('budgetMonth'), '2028-07');
      const current = $('dailyMetrics').textContent;
      assert.match($('dailyContext').textContent, /2026-10/);
      document.querySelector('[data-money-view-button="today"]').click();
      assert.equal($('dailyMetrics').textContent, current);
      $('quickPurchase').click();
      assert.equal($('app').dataset.moneyView, 'today');
      assert.equal($('transactionDialog').open, true);
      $('clearMatch').click();
      $('reconcileForm').elements.balance.value = '9999';
      $('reconcileResult').textContent = 'Old check';
      $('dailyAccountRows').querySelector('button').click();
      assert.equal($('reconcileForm').elements.balance.value, '');
      assert.equal($('reconcileResult').textContent, '');
      assert.equal($('reconcileForm').elements.account.value, 'cash');
      $('dailyEditBudgets').click();
      assert.equal($('app').dataset.moneyView, 'month');
      assert.equal($('budgetMonth').value, '2026-10');
      assert.equal($('spendingSection').open, true);
      document.querySelector('[data-money-view-button="plan"]').click();
      assert.equal($('plannerSection').hidden, false);
      assert.equal($('everydaySection').hidden, true);
      assert.equal(p.revision, 0);
    } finally {
      p.close();
    }
  },
);
test(
  'budget move previews one total, saves once, and Undo restores targets in a new revision',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      $('openBudgetMove').click();
      const f = $('budgetMoveForm');
      change(f.elements.from, 'gas');
      change(f.elements.to, 'food');
      f.elements.amount.value = '25';
      await submit('budgetMoveForm');
      assert.equal(p.revision, 0);
      assert.match($('budgetMoveResult').textContent, /Combined monthly targets are unchanged/);
      assert.equal(p.model.budgets[0].overrides, undefined);
      $('savePlan').click();
      await tick();
      assert.equal(p.revision, 1);
      assert.equal(p.model.budgets[0].overrides['2026-10'], 12500);
      assert.equal(p.model.budgets[1].overrides['2026-10'], 7500);
      assert.equal($('saveReceipt').hidden, false);
      assert.equal($('undoLastSave').hidden, false);
      $('undoLastSave').click();
      await tick();
      assert.equal(p.revision, 2);
      assert.equal(p.model.budgets[0].overrides, undefined);
      assert.equal(p.model.budgets[1].overrides, undefined);
      assert.equal($('budgetMoveResult').textContent, '');
      assert.equal(p.model.changeLog.length, 2);
      assert.equal($('undoLastSave').hidden, true);
      assert.match($('saveReceiptHeading').textContent, /undone/);
    } finally {
      p.close();
    }
  },
);
test(
  'entry preview explains card purchase and payment effects, cancellation saves nothing, failed save preserves entry',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      $('quickPurchase').click();
      const f = $('transactionForm');
      change(f.elements.account, 'card');
      f.elements.description.value = 'Test purchase';
      change(f.elements.amount, '20');
      change(f.elements.category, 'Groceries');
      await new Promise((r) => setTimeout(r, 160));
      assert.match($('entryImpact').textContent, /debt owed \+\$20.00/);
      assert.match($('entryImpact').textContent, /Cash balances unchanged/);
      assert.match($('entryImpact').textContent, /Groceries.*\+\$20.00/);
      $('closeTransactionEntry').click();
      assert.equal(p.revision, 0);
      assert.equal($('entryImpact').textContent, '');
      $('quickCardPayment').click();
      change(f.elements.account, 'cash');
      change(f.elements.to, 'card');
      change(f.elements.amount, '50');
      await new Promise((r) => setTimeout(r, 160));
      assert.match($('entryImpact').textContent, /Category spending change: \$0.00/);
      assert.match($('entryImpact').textContent, /balance -\$50.00/);
      p.fail = true;
      await submit('transactionForm');
      assert.equal(p.revision, 0);
      assert.equal($('transactionDialog').open, true);
      assert.equal(f.elements.amount.value, '50');
      assert.match($('saveOutcome').textContent, /Synthetic server failure/);
      assert.equal($('undoLastSave').hidden, true);
      p.fail = false;
      await submit('transactionForm');
      assert.equal(p.revision, 1);
      assert.equal(p.model.transactions.length, 1);
      assert.equal(budgetMonth(p.model, '2026-10', 'household', '2026-10-29').totals.spent, 0);
    } finally {
      p.close();
    }
  },
);
test(
  'Undo refuses a dirty preview and stale revision, and clears after refresh or sign-out',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      $('quickPurchase').click();
      const f = $('transactionForm');
      f.elements.description.value = 'Test';
      f.elements.amount.value = '5';
      await submit('transactionForm');
      assert.equal(p.revision, 1);
      change(document.querySelector('#categoryRows input'), '120');
      $('undoLastSave').click();
      await tick();
      assert.equal(p.revision, 1);
      assert.match($('saveOutcome').textContent, /preview/);
      $('resetPlan').click();
      p.conflict = true;
      $('undoLastSave').click();
      await tick();
      assert.equal(p.revision, 1);
      assert.equal($('undoLastSave').hidden, true);
      p.conflict = false;
      $('refresh').click();
      await tick();
      assert.equal($('undoLastSave').hidden, true);
      $('logout').click();
      assert.equal($('app').hidden, true);
      assert.equal($('dailyAccountRows').textContent, '');
      assert.equal($('saveReceipt').hidden, true);
    } finally {
      p.close();
    }
  },
);
test(
  'guided review requires honest acknowledgements and saves followups without recording obligations',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, submit } = p;
      $('startWeeklyReview').click();
      assert.match($('weeklyReviewHeading').textContent, /1 of 4/);
      assert.equal($('weeklyNext').disabled, true);
      for (let step = 0; step < 3; step++) {
        const box = $('weeklyReviewBody').querySelector('input[type=checkbox]');
        if (box) {
          box.checked = true;
          box.dispatchEvent(new p.dom.window.Event('change'));
        }
        assert.equal($('weeklyNext').disabled, false);
        $('weeklyNext').click();
      }
      assert.match($('weeklyReviewHeading').textContent, /4 of 4/);
      assert.equal($('weeklyNext').disabled, true);
      const box = $('weeklyReviewBody').querySelector('input[type=checkbox]');
      box.checked = true;
      box.dispatchEvent(new p.dom.window.Event('change'));
      $('weeklyNext').click();
      await tick();
      assert.equal(p.revision, 1);
      assert.equal(p.model.transactions.length, 0);
      assert.equal(p.model.reconciliations, undefined);
      assert.equal(p.model.weeklyReviews[0].status, 'followups');
      assert.ok(p.model.weeklyReviews[0].followups > 0);
      assert.match($('saveReceiptHighlights').textContent, /unresolved checks remain/);
    } finally {
      p.close();
    }
  },
);
test(
  'watched-account preferences store only IDs, respect owner view, and hide debt values',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change, submit } = p;
      $('manageDailyFavorites').click();
      for (const box of $('dailyFavoriteChoices').querySelectorAll('input'))
        box.checked = ['cash', 'card'].includes(box.value);
      await submit('dailyFavoritesForm');
      const stored = JSON.parse(p.dom.window.localStorage.getItem('money_daily_synthetic-owner'));
      assert.deepEqual(stored.household.accounts, ['cash', 'card']);
      assert.equal(p.revision, 0);
      assert.equal($('dailyAccountRows').children.length, 2);
      assert.equal(
        $('dailyAccountRows').querySelector('[data-debt-private]').textContent,
        '-$100.00',
      );
      $('debtPrivacy').click();
      assert.equal($('app').dataset.debtHidden, 'true');
      change($('budgetEntity'), 'business');
      assert.match($('dailyAccountRows').textContent, /Shop/);
      assert.doesNotMatch($('dailyAccountRows').textContent, /Daily card/);
      change($('budgetEntity'), 'household');
      assert.equal($('dailyAccountRows').children.length, 2);
      assert.equal(p.dom.window.localStorage.getItem('money_daily_other-owner'), null);
    } finally {
      p.close();
    }
  },
);

test(
  'cash-before-payday shows a one-day dot and longer windows expose dated values without changing the plan',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change } = p;
      const original = JSON.stringify(p.model);
      assert.equal($('dailyCashRows').children.length, 1);
      assert.match($('dailyCashNote').textContent, /Next paycheck 2026-10-30 is outside/);
      assert.match($('dailyCashNote').textContent, /Only one day/);
      assert.equal($('dailyCashChart').querySelectorAll('[data-series-point]').length, 2);
      assert.equal(
        [...$('dailyCashChart').querySelectorAll('text')].filter((n) => n.textContent === 'Oct 29')
          .length,
        1,
      );
      change($('dailyCashWindow'), '14');
      assert.equal($('dailyCashRows').children.length, 14);
      assert.match($('dailyCashNote').textContent, /through 2026-11-11/);
      assert.equal($('dailyCashRows').children[1].children[0].textContent, '2026-10-30');
      assert.equal($('dailyCashRows').children[1].children[1].dataset.label, 'Daily closing cash');
      assert.match($('dailyCashDetails').querySelector('summary').textContent, /14 days/);
      change($('dailyCashWindow'), '30');
      assert.equal($('dailyCashRows').children.length, 30);
      change($('dailyCashWindow'), 'payday');
      assert.equal($('dailyCashRows').children.length, 1);
      assert.equal(p.revision, 0);
      assert.equal(JSON.stringify(p.model), original);
      $('logout').click();
      assert.equal($('dailyCashRows').textContent, '');
      assert.equal($('dailyCashWindow').value, 'payday');
    } finally {
      p.close();
    }
  },
);

test(
  'home hero, category tiles and quick choices share existing targets and entry fields without preview writes',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change } = p;
      const original = JSON.stringify(p.model);
      assert.match($('dailyMetrics').firstChild.textContent, /Left in this month/);
      let navigatedHome = false;
      $('moneyWorkspace').scrollIntoView = () => {
        navigatedHome = true;
      };
      document.querySelector('[data-money-view-button=today]').click();
      assert.equal(navigatedHome, true);
      assert.equal($('dailyCategoryTiles').children.length, 2);
      assert.match($('dailyCategoryTotal').textContent, /\$200.00/);
      assert.equal($('dailyReviewPanel').open, false);
      assert.match($('dailyReviewCount').textContent, /checks/);
      $('quickPurchase').click();
      const f = $('transactionForm');
      assert.equal(f.firstElementChild, f.elements.amount.closest('label'));
      assert.equal($('recordTransaction').form, f);
      assert.equal(f.contains($('recordTransaction')), false);
      assert.equal($('recordTransaction').closest('#transactionDialog'), $('transactionDialog'));
      $('entryAccountChoices').querySelector('[data-value="card"]').click();
      assert.equal(f.elements.account.value, 'card');
      $('entryCategoryChoices').querySelector('[data-value="Gas"]').click();
      assert.equal(f.elements.category.value, 'Gas');
      assert.equal(
        $('entryCategoryChoices').querySelector('[data-value="Gas"]').getAttribute('aria-pressed'),
        'true',
      );
      assert.equal(p.revision, 0);
      assert.equal(JSON.stringify(p.model), original);
      $('closeTransactionEntry').click();
      assert.equal($('transactionDialog').open, false);
      $('quickCardPayment').click();
      assert.equal(f.elements.category.disabled, true);
      assert.equal($('transactionCategoryLabel').hidden, true);
      $('clearMatch').click();
      $('logout').click();
      for (const id of [
        'dailyCategoryTiles',
        'dailyUpcomingRows',
        'dailyDateInspector',
        'entryAccountChoices',
        'entryCategoryChoices',
        'entryContextRows',
      ])
        assert.equal($(id).textContent, '');
    } finally {
      p.close();
    }
  },
);
test(
  'unified coming-up Record edits the actual cents and removes exactly one matched forecast',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $ } = p;
      const next = $('dailyUpcomingRows').querySelector('.upcoming-row');
      assert.match(next.textContent, /Pay/);
      next.querySelector('button').click();
      const f = $('transactionForm');
      assert.equal(f.elements.scheduleKey.value, 'pay:2026-10-30');
      assert.equal(f.elements.kind.value, 'income');
      f.elements.amount.value = '1000.03';
      $('recordTransaction').click();
      await tick();
      assert.equal(p.revision, 1);
      assert.equal(p.model.transactions.length, 1);
      assert.equal(p.model.transactions[0].entries[0].amount, 100003);
      assert.equal(p.model.transactions[0].scheduleKey, 'pay:2026-10-30');
      assert.equal($('dailyUpcomingRows').querySelectorAll('.upcoming-row').length, 1);
      assert.match($('dailyUpcomingRows').textContent, /Edit/);
    } finally {
      p.close();
    }
  },
);
test(
  'cash chart exposes major-event labels, keyboard day selection and read-only planning reserves',
  { skip },
  async () => {
    const p = await page();
    try {
      const { $, change } = p;
      const original = JSON.stringify(p.model);
      change($('dailyCashWindow'), '14');
      assert.ok($('dailyCashChart').querySelectorAll('[data-event-label]').length);
      assert.ok($('dailyCashChart').querySelector('[data-low-label]'));
      const inspect = $('dailyCashChart').querySelector('[role=button]');
      inspect.dispatchEvent(
        new p.dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }),
      );
      assert.equal($('dailyInspectDate').value, '2026-11-11');
      assert.match($('dailyDateInspector').textContent, /2026-11-11/);
      change($('dailyInspectDate'), '2026-10-30');
      const reserve = [...$('dailyDateInspector').querySelectorAll('.cash-event-row')].find((r) =>
        r.textContent.includes('planning reserve'),
      );
      assert.ok(reserve);
      assert.equal(reserve.querySelector('button'), null);
      assert.equal(p.revision, 0);
      assert.equal(JSON.stringify(p.model), original);
    } finally {
      p.close();
    }
  },
);
