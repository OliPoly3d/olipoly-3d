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
