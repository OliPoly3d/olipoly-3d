import { addDays, balances, cents, forecastEnd } from './money-engine.mjs';
import { budgetMonth, categoryBudgetSummary, monthBounds } from './money-budget.mjs';
import {
  budgetMoveAvailability,
  moveCategoryBudget,
  defaultWatchedAccounts,
  balanceFreshness,
  reviewFindings,
  saveWeeklyReview,
} from './money-everyday.mjs';
import { planningSnapshot } from './money-insights.mjs';
import { planningForecast } from './money-planning.mjs';
import { savingsSummary } from './money-savings.mjs';
import {
  lineChart,
  categoryBalanceChart,
  clearChart,
  formatMoney as money,
} from './money-charts.mjs';
import { revealSection } from './money-sections.mjs';
const $ = (id) => document.getElementById(id),
  el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
function button(text, fn) {
  const b = el('button', text);
  b.type = 'button';
  b.onclick = fn;
  return b;
}
function options(select, items, value = select.value) {
  select.replaceChildren();
  for (const [id, label] of items) {
    const o = el('option', label);
    o.value = id;
    select.append(o);
  }
  if (items.some(([id]) => id === value)) select.value = value;
}
const debtEntry = (m, t) =>
  !['expense', 'refund'].includes(t.kind) &&
  t.entries.some((e) => m.accounts.find((a) => a.id === e.account)?.type !== 'cash');
export function setupDaily({
  getDraft,
  getOwner,
  updateDraft,
  today,
  message,
  action,
  save,
  record,
  removeExpected,
  reconcile,
  selectCredit,
  workspace,
}) {
  let owner = null,
    preferences = {},
    lastEntity = null,
    step = 0,
    reviewOpen = false,
    acks = {},
    signatures = {},
    findings = null;
  const entity = () => $('budgetEntity').value,
    asOf = () => (today() < getDraft().start ? getDraft().start : today()),
    key = () => 'money_daily_' + getOwner();
  const run = (fn) => {
    try {
      return fn();
    } catch (e) {
      message(e.message);
      $('weeklyReviewMessage').textContent = e.message;
      return null;
    }
  };
  function readPreferences() {
    if (owner === getOwner()) return;
    owner = getOwner();
    try {
      preferences = JSON.parse(window.localStorage.getItem(key()) || '{}');
    } catch {
      preferences = {};
    }
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences))
      preferences = {};
    step = 0;
    reviewOpen = false;
    acks = {};
    signatures = {};
  }
  function viewPreferences() {
    return preferences[entity()] || {};
  }
  function watched(m) {
    const selected = viewPreferences().accounts;
    return (Array.isArray(selected) ? selected : defaultWatchedAccounts(m, entity())).filter((id) =>
      m.accounts.some((a) => a.id === id && a.entity === entity()),
    );
  }
  function go(id, { currentMonth = false } = {}) {
    if (currentMonth && $('budgetMonth').value !== asOf().slice(0, 7)) {
      $('budgetMonth').value = asOf().slice(0, 7);
      $('budgetMonth').dispatchEvent(new window.Event('change'));
    }
    const target = $(id);
    revealSection(target);
    target.scrollIntoView({ behavior: 'smooth' });
  }
  function funds(m) {
    const summary = savingsSummary(m, asOf()),
      buckets = summary.buckets.filter(
        (b) => m.accounts.find((a) => a.id === b.account)?.entity === entity(),
      ),
      chosen =
        buckets.find((b) => b.id === viewPreferences().bucket) ||
        buckets.find((b) => /fun/i.test(b.name)) ||
        buckets[0];
    return { summary, buckets, chosen };
  }
  function metric(label, value, note, extra) {
    const card = el('div');
    card.className = 'metric';
    card.append(el('span', label), el('strong', value), el('small', note));
    if (extra) card.append(extra);
    return card;
  }
  function renderFavorites(m) {
    const pref = viewPreferences(),
      ids = watched(m),
      bank = balances(m, asOf()),
      posted = balances(m, asOf(), true);
    $('dailyAccountRows').replaceChildren();
    for (const id of ids) {
      const a = m.accounts.find((a) => a.id === id),
        r = balanceFreshness(m, id, asOf()),
        row = el('div');
      row.className = 'daily-account-row';
      const name = el('div');
      name.append(el('strong', a.name), el('small', r.reason));
      const value = el('strong', r.unknown ? 'Unknown' : money(bank[id]));
      value.className = bank[id] < 0 ? 'negative' : '';
      value.toggleAttribute('data-debt-private', a.type !== 'cash');
      row.append(name, value);
      if (a.type !== 'cash') row.append(el('span', 'Hidden'));
      if (a.type !== 'cash') row.lastChild.className = 'privacy-only';
      if (bank[id] !== posted[id]) {
        const pending = el('small', 'Includes pending · posted ' + money(posted[id]));
        pending.toggleAttribute('data-debt-private', a.type !== 'cash');
        name.append(pending);
      }
      row.append(button('Check', () => (r.unknown ? selectCredit(id) : reconcile(id))));
      $('dailyAccountRows').append(row);
    }
    if (!ids.length)
      $('dailyAccountRows').append(el('p', 'Choose the accounts you want to watch.'));
    $('dailyFavoriteChoices').replaceChildren();
    for (const a of m.accounts.filter((a) => a.entity === entity())) {
      const label = el('label');
      label.className = 'check-label';
      const input = el('input');
      input.type = 'checkbox';
      input.name = 'accounts';
      input.value = a.id;
      input.checked = ids.includes(a.id);
      label.append(input, document.createTextNode(a.name));
      $('dailyFavoriteChoices').append(label);
    }
    const { buckets, chosen } = funds(m);
    options(
      $('dailyFavoritesForm').elements.bucket,
      [['', 'Choose automatically'], ...buckets.map((b) => [b.id, b.name])],
      pref.bucket || '',
    );
    return { buckets, chosen };
  }
  function renderGoals(m, buckets) {
    $('dailyGoalRows').replaceChildren();
    for (const b of buckets) {
      const row = el('div');
      row.className = 'daily-goal-row';
      row.append(el('strong', b.name + ' · ' + money(b.balance)));
      if (b.goalAmount != null) {
        const progress = el('progress');
        progress.max = Math.max(1, b.goalAmount);
        progress.value = Math.max(0, Math.min(b.goalAmount, b.balance));
        progress.setAttribute('aria-label', b.name + ' goal progress');
        row.append(
          progress,
          el('small', 'Goal ' + money(b.goalAmount) + (b.goalDate ? ' by ' + b.goalDate : '')),
        );
      } else row.append(el('small', 'Optional goal can be set in Edit bucket.'));
      if (b.balance < 0) row.append(el('p', 'This purpose is overdrawn. Review its withdrawals.'));
      $('dailyGoalRows').append(row);
    }
    if (!buckets.length)
      $('dailyGoalRows').append(
        el(
          'p',
          'Add savings purposes in This month to earmark money already in a savings account.',
        ),
      );
  }
  function renderAttention(m, state) {
    const target = $('dailyAttention');
    target.replaceChildren();
    const items = [
      ...state.expected.map((t) => ({
        text: t.description + ' · ' + t.date,
        action: () => record(t),
        debt: debtEntry(m, t),
      })),
      ...state.pending.map((t) => ({
        text: 'Pending: ' + t.description,
        action: () => record(t),
        debt: debtEntry(m, t),
      })),
      ...state.accounts
        .filter((a) => !a.verified)
        .map((r) => ({
          text: (m.accounts.find((a) => a.id === r.account)?.name || 'Account') + ' · ' + r.reason,
          action: () => (r.unknown ? selectCredit(r.account) : reconcile(r.account)),
          debt: m.accounts.find((a) => a.id === r.account)?.type !== 'cash',
        })),
      ...state.missing.map((b) => ({
        text: b.name + ' · target missing',
        action: () => go('spendingSection', { currentMonth: true }),
      })),
      ...state.unknownBills.map((b) => ({
        text: b.name + ' · needs a bill plan',
        action: () => go('billReviewEntry'),
      })),
    ];
    for (const item of items.slice(0, 3)) {
      const row = el('div');
      row.className = 'daily-attention-row';
      row.toggleAttribute('data-debt-private', !!item.debt);
      row.append(el('span', item.text), button('Review', item.action));
      target.append(row);
    }
    if (!items.length)
      target.append(
        el(
          'p',
          state.cash?.complete && state.cash.headroom >= 0
            ? 'No unresolved entry or watched-account checks. Review cash before extra spending.'
            : 'Review the cash estimate before extra spending.',
        ),
      );
    $('dailyReviewCount').textContent = state.followups
      ? state.followups + ' unresolved checks'
      : 'Up to date';
    const reviews = (m.weeklyReviews || []).filter((r) => r.entity === entity()),
      last = reviews.at(-1);
    if (last)
      target.append(
        el(
          'p',
          'Last weekly review: ' +
            last.asOf +
            (last.status === 'followups' ? ' · followups were left open' : ''),
        ),
      );
  }
  function acknowledgement(target, key, text, signature) {
    if (signatures[key] !== signature) {
      acks[key] = false;
      signatures[key] = signature;
    }
    const label = el('label');
    label.className = 'check-label';
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!acks[key];
    input.onchange = () => {
      acks[key] = input.checked;
      reviewNavigation();
    };
    label.append(input, document.createTextNode(text));
    target.append(label);
  }
  function reviewNavigation() {
    const needed =
      step === 0
        ? findings.expected.length || findings.pending.length
          ? !!acks.entries
          : true
        : step === 1
          ? findings.accounts.some((a) => !a.verified)
            ? !!acks.balances
            : true
          : step === 2
            ? !!acks.budgets
            : findings.followups
              ? !!acks.cash
              : true;
    $('weeklyPrevious').disabled = step === 0;
    $('weeklyPrevious').dataset.disabled = String(step === 0);
    $('weeklyNext').disabled = !needed;
    $('weeklyNext').dataset.disabled = String(!needed);
    $('weeklyNext').textContent = step === 3 ? 'Save review and current preview' : 'Next';
  }
  function renderReview(m) {
    $('weeklyReview').hidden = !reviewOpen;
    if (!reviewOpen) return;
    const names = ['Entries', 'Balances', 'Budget', 'Cash'],
      target = $('weeklyReviewBody');
    $('weeklyReviewHeading').textContent = step + 1 + ' of 4 · ' + names[step];
    $('weeklyReviewSteps').replaceChildren();
    names.forEach((name, index) => {
      const span = el('span', index + 1 + ' ' + name);
      span.className = index === step ? 'current-review-step' : '';
      $('weeklyReviewSteps').append(span);
    });
    target.replaceChildren();
    if (step === 0) {
      target.append(
        el(
          'p',
          findings.expected.length +
            ' expectations through today are unrecorded · ' +
            findings.pending.length +
            ' actual entries remain pending.',
        ),
      );
      for (const t of findings.expected.slice(0, 12)) {
        const row = el('div');
        row.className = 'daily-attention-row';
        row.toggleAttribute('data-debt-private', debtEntry(m, t));
        row.append(
          el('span', t.date + ' · ' + t.description),
          button('Record', () => record(t)),
          button('Skip / stop', () => removeExpected(t)),
        );
        target.append(row);
      }
      for (const t of findings.pending.slice(0, 12)) {
        const row = el('div');
        row.className = 'daily-attention-row';
        row.toggleAttribute('data-debt-private', debtEntry(m, t));
        row.append(
          el('span', t.date + ' · ' + t.description + ' (pending)'),
          button('Edit / settle', () => record(t)),
        );
        target.append(row);
      }
      if (findings.pending.length + findings.expected.length > 24)
        target.append(button('Search all activity', () => go('activitySection')));
      if (findings.expected.length || findings.pending.length)
        acknowledgement(
          target,
          'entries',
          'I reviewed these entries; unresolved items stay open for later.',
          JSON.stringify([findings.expected, findings.pending]),
        );
    }
    if (step === 1) {
      target.append(
        el(
          'p',
          'Check the same posted / pending basis as your bank. Opening an editor does not mark a balance verified.',
        ),
      );
      for (const r of findings.accounts) {
        const a = m.accounts.find((a) => a.id === r.account),
          row = el('div');
        row.className = 'daily-attention-row';
        row.toggleAttribute('data-debt-private', a.type !== 'cash');
        row.append(
          el('span', a.name + ' · ' + r.reason),
          button(r.verified ? 'Check again' : 'Check balance', () =>
            r.unknown ? selectCredit(a.id) : reconcile(a.id),
          ),
        );
        target.append(row);
      }
      if (!findings.accounts.length)
        target.append(button('Choose watched accounts', () => go('dailyFavorites')));
      if (findings.accounts.some((a) => !a.verified))
        acknowledgement(
          target,
          'balances',
          'I understand unchecked or stale balances remain unverified.',
          JSON.stringify(findings.accounts),
        );
    }
    if (step === 2) {
      const b = budgetMonth(m, asOf().slice(0, 7), entity(), asOf()),
        summary = categoryBudgetSummary(b.buckets, b.outside);
      target.append(
        el(
          'p',
          summary.all.missing
            ? 'Complete missing category targets before relying on the combined remainder.'
            : 'Combined category allowance left: ' +
                money(summary.all.remaining) +
                '. This still covers the rest of the month.',
        ),
      );
      target.append(
        button('Review targets and timing', () => go('spendingSection', { currentMonth: true })),
        button('Review YOY / one-time plans', () => go('seasonalSection', { currentMonth: true })),
        button('Move budget', () => openMove()),
      );
      acknowledgement(
        target,
        'budgets',
        'I reviewed this month’s targets, timing and upcoming one-time plans.',
        JSON.stringify([m.budgets, m.seasonalItems, b.totals]),
      );
    }
    if (step === 3) {
      const c = findings.cash;
      target.append(
        el(
          'p',
          c
            ? c.complete
              ? 'Lowest projected cash ' +
                money(c.low) +
                ' through ' +
                c.end +
                ' · room after floor / buffers ' +
                money(c.headroom)
              : 'Cash estimate needs review through ' + c.end
            : 'Choose a cash account before relying on a cash estimate.',
        ),
      );
      if (c) for (const reason of c.reasons) target.append(el('p', reason));
      if (c?.headroom < 0)
        target.append(el('p', 'Possible cash-floor shortfall: ' + money(-c.headroom), 'notice'));
      target.append(
        el(
          'p',
          'Saving keeps this review and your current plan preview. It does not mark unresolved transactions paid or unchecked accounts verified.',
        ),
      );
      if (findings.followups)
        acknowledgement(
          target,
          'cash',
          'I understand ' +
            findings.followups +
            ' unresolved checks remain and will return to them.',
          JSON.stringify([
            findings.followups,
            findings.accounts,
            findings.missing.map((b) => b.id),
            c?.reasons,
            c?.headroom,
          ]),
        );
    }
    reviewNavigation();
  }
  function startReview() {
    workspace.select('today');
    reviewOpen = true;
    render(getDraft());
    $('weeklyReview').scrollIntoView({ behavior: 'smooth' });
  }
  $('startWeeklyReview').onclick = startReview;
  $('continueWeeklyReview').onclick = startReview;
  $('closeWeeklyReview').onclick = () => {
    reviewOpen = false;
    $('weeklyReview').hidden = true;
  };
  $('weeklyPrevious').onclick = () => {
    if (step > 0) step--;
    renderReview(getDraft());
  };
  $('weeklyNext').onclick = () => {
    if (step < 3) {
      step++;
      renderReview(getDraft());
      return;
    }
    action(async () => {
      const next = saveWeeklyReview(getDraft(), {
        entity: entity(),
        asOf: asOf(),
        accountIds: watched(getDraft()),
        cashAccount: $('chartAccount').value,
        acceptFollowups: !!acks.cash,
        id: crypto.randomUUID(),
      });
      await save(next);
      const last = next.weeklyReviews.at(-1);
      $('weeklyReviewMessage').textContent = last.followups
        ? 'Review saved with ' + last.followups + ' unresolved checks. They remain open.'
        : 'Review saved. No unresolved checks in the reviewed scope.';
      reviewOpen = false;
      $('weeklyReview').hidden = true;
      step = 0;
      acks = {};
    });
  };
  function moveControls() {
    const f = $('budgetMoveForm'),
      range = f.elements.scope.value === 'range';
    $('budgetMoveThroughLabel').hidden = !range;
    f.elements.through.disabled = !range;
    f.elements.through.required = range;
  }
  function moveChoices({ reset = false } = {}) {
    const m = getDraft();
    if (!m) return;
    const f = $('budgetMoveForm'),
      month =
        f.elements.month.value ||
        ($('app').dataset.moneyView === 'today' ? asOf().slice(0, 7) : $('budgetMonth').value);
    f.elements.month.value = month;
    f.elements.month.min = m.start.slice(0, 7);
    f.elements.month.max = forecastEnd(m.start).slice(0, 7);
    f.elements.through.min = month;
    f.elements.through.max = f.elements.month.max;
    if (!f.elements.through.value || f.elements.through.value < month)
      f.elements.through.value = month;
    const choices = budgetMoveAvailability(m, month, entity());
    let to = reset ? choices.find((b) => b.remaining < 0)?.id : f.elements.to.value,
      from = reset
        ? choices.filter((b) => b.id !== to).sort((a, b) => (b.movable || 0) - (a.movable || 0))[0]
            ?.id
        : f.elements.from.value;
    options(
      f.elements.from,
      choices.map((b) => [
        b.id,
        b.name + ' · ' + (b.movable === null ? 'target missing' : money(b.movable) + ' can move'),
      ]),
      from,
    );
    options(
      f.elements.to,
      choices.map((b) => [b.id, b.name]),
      to,
    );
    if (f.elements.to.value === f.elements.from.value && choices.length > 1)
      f.elements.to.value = choices.find((b) => b.id !== f.elements.from.value).id;
    const source = choices.find((b) => b.id === f.elements.from.value),
      destination = choices.find((b) => b.id === f.elements.to.value);
    if (reset && destination?.remaining < 0 && source?.movable > 0)
      f.elements.amount.value = (Math.min(-destination.remaining, source.movable) / 100).toFixed(2);
    $('budgetMoveInfo').textContent = source
      ? source.name +
        ' · Unspent ' +
        money(source.remaining || 0) +
        ' · Known upcoming category expenses ' +
        money(source.committed) +
        ' · Available to reassign ' +
        (source.movable === null ? 'Incomplete' : money(source.movable)) +
        '. Both categories must use the same funding account.'
      : 'Add two everyday category targets to use a guided budget move.';
    moveControls();
  }
  function openMove() {
    const f = $('budgetMoveForm');
    f.reset();
    f.elements.month.value =
      $('app').dataset.moneyView === 'today' ? asOf().slice(0, 7) : $('budgetMonth').value;
    moveChoices({ reset: true });
    $('budgetMoveResult').replaceChildren();
    revealSection($('budgetMoveEntry'));
    $('budgetMoveEntry').scrollIntoView({ behavior: 'smooth' });
    f.elements.amount.focus();
  }
  $('openBudgetMove').onclick = () => run(openMove);
  for (const name of ['from', 'to', 'month'])
    $('budgetMoveForm').elements[name].onchange = () => run(() => moveChoices());
  $('budgetMoveForm').elements.scope.onchange = moveControls;
  $('cancelBudgetMove').onclick = () => {
    $('budgetMoveEntry').open = false;
    $('budgetMoveForm').reset();
    $('budgetMoveResult').replaceChildren();
    message('Budget move cancelled. Existing preview changes remain.');
  };
  $('budgetMoveForm').onsubmit = (e) => {
    e.preventDefault();
    run(() => {
      const f = new FormData(e.target),
        month = f.get('month'),
        through = f.get('scope') === 'range' ? f.get('through') : month,
        amount = cents(f.get('amount')),
        moveId = crypto.randomUUID();
      updateDraft((next) =>
        moveCategoryBudget(next, {
          from: f.get('from'),
          to: f.get('to'),
          amount,
          month,
          through,
          asOf: asOf(),
          id: moveId,
        }),
      );
      $('budgetMoveResult').dataset.moveId = moveId;
      $('budgetMoveResult').replaceChildren(
        el(
          'p',
          'Reassigned ' +
            money(amount) +
            ' per month · ' +
            month +
            (through !== month ? ' through ' + through : '') +
            '. Combined monthly targets are unchanged. No transaction or bank transfer was created.',
        ),
        el(
          'p',
          'Different timing patterns can change daily cash lows. The status bar shows whether these changes are saved or still in preview.',
        ),
      );
      moveChoices();
      message('Budget moved in preview. The combined target is unchanged. Save changes keeps it.');
    });
  };
  $('manageDailyFavorites').onclick = () => go('dailyFavorites');
  $('dailyFavoritesForm').onsubmit = (e) => {
    e.preventDefault();
    run(() => {
      const f = new FormData(e.target);
      preferences[entity()] = { accounts: f.getAll('accounts'), bucket: f.get('bucket') || '' };
      try {
        window.localStorage.setItem(key(), JSON.stringify(preferences));
      } catch {
        message('View updated for this visit; browser storage is unavailable.');
      }
      render(getDraft());
      $('dailyFavorites').open = false;
      message('Watched accounts and savings purpose updated. No financial data changed.');
    });
  };
  $('allAccountBalances').onclick = () => go('accountSummary');
  $('dailyEditBudgets').onclick = () => go('spendingSection', { currentMonth: true });
  $('dailyManageSavings').onclick = () => go('savingsSection');
  function render(m) {
    if (!m) return;
    readPreferences();
    const result = $('budgetMoveResult');
    if (
      result.dataset.moveId &&
      !(m.budgetMoves || []).some((move) => move.id === result.dataset.moveId)
    ) {
      result.replaceChildren();
      delete result.dataset.moveId;
    }
    if (lastEntity !== entity()) {
      lastEntity = entity();
      step = 0;
      reviewOpen = false;
      acks = {};
      signatures = {};
      $('budgetMoveEntry').open = false;
      $('budgetMoveForm').reset();
    }
    $('dailyHeading').textContent = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(asOf() + 'T00:00:00Z'));
    $('dailyContext').textContent =
      'Current recorded balances and ' +
      asOf().slice(0, 7) +
      ' spending · pending entries included. Future-month planning stays in This month / Plan ahead.';
    const { buckets, chosen } = renderFavorites(m),
      budget = budgetMonth(m, asOf().slice(0, 7), entity(), asOf()),
      summary = categoryBudgetSummary(budget.buckets, budget.outside);
    findings = reviewFindings(m, {
      entity: entity(),
      asOf: asOf(),
      accountIds: watched(m),
      cashAccount: $('chartAccount').value,
    });
    const c = findings.cash,
      bankInfo = chosen && savingsSummary(m, asOf()).accounts.find((a) => a.id === chosen.account),
      incompletePurpose = bankInfo?.unallocated < 0;
    $('dailyMetrics').replaceChildren(
      metric(
        'Everyday category allowance left',
        summary.everyday.missing ? 'Incomplete' : money(summary.everyday.remaining),
        'This must cover the rest of the month. YOY / event earmarks: ' +
          (summary.earmarked.missing ? 'Incomplete' : money(summary.earmarked.remaining)),
      ),
      metric(
        c?.nextPay ? 'Lowest cash before next paycheck' : 'Lowest cash over the next 30 days',
        c?.complete ? money(c.low) : 'Needs review',
        c
          ? 'Through ' +
              c.end +
              ' · ' +
              (c.complete
                ? 'Room after floor / buffers ' + money(c.headroom)
                : c.reasons.slice(0, 2).join(' · '))
          : 'Choose a cash account',
        button('See cash timeline', () => go('dailyCashDetails')),
      ),
      metric(
        chosen ? chosen.name + ' · saved purpose' : 'Savings purpose',
        chosen ? money(chosen.balance) : 'Not set',
        chosen
          ? incompletePurpose
            ? 'Earmarks exceed the bank balance; review allocation.'
            : 'Recorded savings only; ' +
              (chosen.goalAmount != null
                ? 'goal ' + money(chosen.goalAmount)
                : 'set an optional goal')
          : 'Add a purpose or choose one below.',
        button('See savings goals', () => go('dailySavingsDetails')),
      ),
    );
    const everyday = budget.buckets.filter((b) => !b.seasonal && !b.oneTimeMonth);
    categoryBalanceChart(
      $('dailyCategoryChart'),
      everyday.map((b) => ({ name: b.shortName || b.name, value: b.remaining })),
    );
    $('dailyCategoryTotal').textContent = summary.everyday.missing
      ? 'Complete missing targets before using the combined remainder.'
      : 'Combined everyday allowance left: ' + money(summary.everyday.remaining);
    $('dailyCategoryNote').textContent =
      'Category overages offset unused allowances elsewhere. Known upcoming category expenses stay reserved by the budget-move tool.';
    const notices = [];
    if (summary.outside)
      notices.push(
        'Other recorded spending outside these categories: ' +
          money(summary.outside) +
          '. Review Activity before relying on category totals.',
      );
    if (c && !c.complete) notices.push('Cash estimate is provisional. ' + c.reasons.join(' · '));
    if (c?.headroom < 0) notices.push('Potential cash-floor shortfall ' + money(-c.headroom) + '.');
    if (incompletePurpose) notices.push('Savings purposes exceed their bank balance.');
    $('dailyPlanNotice').hidden = !notices.length;
    $('dailyPlanNotice').textContent = notices.join(' ');
    renderCash(m);
    renderGoals(m, buckets);
    renderAttention(m, findings);
    renderReview(m);
    if ($('budgetMoveEntry').open) run(() => moveChoices());
  }
  function renderCash(m) {
    const c = findings?.cash,
      account = findings?.account,
      when = asOf(),
      window = $('dailyCashWindow').value;
    $('dailyCashRows').replaceChildren();
    $('dailyCashAssumptions').replaceChildren();
    const heading =
      window === 'payday'
        ? c?.nextPay
          ? 'Cash until the next paycheck'
          : 'Cash over the next 30 days'
        : 'Cash over the next ' + window + ' days';
    $('dailyCashDetails').querySelector('summary').textContent = heading;
    if (!c || !account) {
      clearChart($('dailyCashChart'));
      $('dailyCashNote').textContent = 'Choose a cash account.';
      return;
    }
    const requested = window === 'payday' ? c.end : addDays(when, Number(window) - 1),
      horizon = forecastEnd(m.start),
      end = requested > horizon ? horizon : requested,
      p = planningForecast(planningSnapshot(m, when), end),
      a = m.accounts.find((a) => a.id === account),
      incomplete = p.incompleteFrom[entity()],
      days = p.days.filter(
        (d) => d.date >= when && (!incomplete || d.date.slice(0, 7) < incomplete),
      );
    lineChart(
      $('dailyCashChart'),
      [
        {
          label: 'Daily closing cash',
          points: days.map((d) => ({ date: d.date, value: d.closing[account] })),
        },
        {
          label: 'Daily low',
          dashed: true,
          points: days.map((d) => ({ date: d.date, value: d.low[account] })),
        },
      ],
      { title: heading, floor: c.floor },
    );
    for (const d of days) {
      const row = el('tr');
      for (const [label, value] of [
        ['Date', d.date],
        ['Daily closing cash', money(d.closing[account])],
        ['Daily low', money(d.low[account])],
      ]) {
        const cell = el('td', value);
        cell.dataset.label = label;
        row.append(cell);
      }
      $('dailyCashRows').append(row);
    }
    const notes = [a.name + ' · ' + when + ' through ' + end + '.'];
    if (window === 'payday' && c.nextPay)
      notes.push('Next paycheck ' + c.nextPay + ' is outside this window.');
    if (days.length === 1)
      notes.push(
        'Only one day is shown. The dots show closing cash and the day’s low; choose 14 or 30 days to see a longer outlook.',
      );
    const assumptions = [
      'Debits count before deposits on the same day. Includes remaining category allowances.',
    ];
    const creditWarnings = p.creditWarnings.filter((w) =>
        m.accounts.some((a) => a.entity === entity() && w.startsWith(a.name + ':')),
      ),
      reasons = [...new Set([...c.reasons, ...creditWarnings])];
    if (reasons.length) {
      notes.push('Working estimate — see review notes below.');
      assumptions.push('Estimate needs review: ' + reasons.join(' · ') + '.');
    }
    if (incomplete && incomplete <= end.slice(0, 7))
      assumptions.push(
        'Missing category targets or funding from ' + incomplete + '; later dates are omitted.',
      );
    if (requested > horizon) assumptions.push('Limited to the end of the plan.');
    $('dailyCashNote').textContent = notes.join(' ');
    $('dailyCashAssumptions').textContent = assumptions.join(' ');
  }
  $('dailyCashWindow').onchange = () => run(() => renderCash(getDraft()));
  function clear() {
    owner = null;
    preferences = {};
    lastEntity = null;
    step = 0;
    reviewOpen = false;
    acks = {};
    signatures = {};
    findings = null;
    for (const id of [
      'dailyMetrics',
      'dailyContext',
      'dailyAttention',
      'dailyAccountRows',
      'dailyFavoriteChoices',
      'dailyCategoryTotal',
      'dailyCategoryNote',
      'dailyCashNote',
      'dailyCashRows',
      'dailyCashAssumptions',
      'dailyGoalRows',
      'dailyReviewCount',
      'dailyPlanNotice',
      'weeklyReviewHeading',
      'weeklyReviewSteps',
      'weeklyReviewBody',
      'weeklyReviewMessage',
      'budgetMoveResult',
      'budgetMoveInfo',
    ])
      $(id).replaceChildren();
    clearChart($('dailyCategoryChart'));
    clearChart($('dailyCashChart'));
    $('weeklyReview').hidden = true;
    $('dailyCashWindow').value = 'payday';
    $('dailyFavoritesForm').reset();
    $('dailyFavoritesForm').elements.bucket.replaceChildren();
    $('budgetMoveForm').reset();
    for (const select of $('budgetMoveForm').querySelectorAll('select[name=from],select[name=to]'))
      select.replaceChildren();
  }
  return { render, clear, openMove, startReview };
}
