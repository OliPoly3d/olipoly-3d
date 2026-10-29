import {
  addDays,
  balances,
  balanceUnknownAt,
  date,
  forecastEnd,
  occurrences,
  validate,
} from './money-engine.mjs';
import { budgetMonth, monthBounds, shiftMonth, validateBudgets } from './money-budget.mjs';
import { checkpointValid, cashCapacity } from './money-confidence.mjs';
import { planningForecast } from './money-planning.mjs';
import {
  spendingParts,
  transactionOwner,
  validateAllocations,
  validateRefunds,
} from './money-categories.mjs';
import { explainPlanChange } from './money-decisions.mjs';
import { assertMonthLocks } from './money-month-close.mjs';
const normalized = (s) =>
  String(s || '')
    .trim()
    .toLowerCase();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function budgetMoveAvailability(model, month, entity) {
  const end = monthBounds(month).last,
    b = budgetMonth(model, month, entity, end),
    expected = occurrences(model, end).filter(
      (t) =>
        t.kind === 'expense' && t.date.startsWith(month) && transactionOwner(model, t) === entity,
    );
  return b.buckets
    .filter((b) => !b.seasonal && !b.oneTimeMonth)
    .map((b) => {
      const names = new Set([b.name, ...(b.aliases || [])].map(normalized)),
        committed = expected.reduce(
          (n, t) =>
            n +
            spendingParts(t)
              .filter((p) => names.has(normalized(p.category)))
              .reduce((sum, p) => sum + p.amount, 0),
          0,
        );
      return {
        ...b,
        committed,
        account: b.funding?.[month] || b.account,
        movable:
          b.allowance === null ? null : Math.max(0, Math.min(b.allowance, b.remaining - committed)),
      };
    });
}
export function moveCategoryBudget(model, { from, to, amount, month, through = month, asOf, id }) {
  date(asOf);
  monthBounds(month);
  monthBounds(through);
  if (from === to || !Number.isSafeInteger(amount) || amount <= 0)
    throw Error('Choose two different categories and a positive amount.');
  if (
    month < model.start.slice(0, 7) ||
    through < month ||
    through > forecastEnd(model.start).slice(0, 7)
  )
    throw Error('Choose months within the forecast.');
  const source = model.budgets.find((b) => b.id === from),
    destination = model.budgets.find((b) => b.id === to);
  if (
    !source ||
    !destination ||
    source.entity !== destination.entity ||
    source.seasonal ||
    source.oneTimeMonth ||
    destination.seasonal ||
    destination.oneTimeMonth
  )
    throw Error(
      'Move between everyday categories in the same owner view. YOY and one-time earmarks keep their own editors.',
    );
  if (
    model.monthClosures?.some(
      (c) => c.entity === source.entity && c.month >= month && c.month <= through,
    )
  )
    throw Error('Reopen affected closed months before moving their budgets.');
  const next = structuredClone(model),
    first = next.budgets.find((b) => b.id === from),
    second = next.budgets.find((b) => b.id === to);
  for (let key = month; key <= through; key = shiftMonth(key, 1)) {
    const rows = budgetMoveAvailability(model, key, source.entity),
      a = rows.find((b) => b.id === from),
      b = rows.find((b) => b.id === to);
    if (a.allowance === null || b.allowance === null)
      throw Error('Set both category targets for ' + key + ' before moving money.');
    if (a.account !== b.account)
      throw Error(
        'These categories use different funding accounts in ' +
          key +
          '. Review their funding first.',
      );
    if (amount > a.movable)
      throw Error(
        key + ': this move exceeds the source category’s unspent, uncommitted allowance.',
      );
    first.overrides = { ...first.overrides, [key]: a.allowance - amount };
    second.overrides = { ...second.overrides, [key]: b.allowance + amount };
  }
  next.budgetMoves = [
    ...(next.budgetMoves || []),
    {
      id: id || 'move:' + asOf + ':' + from + ':' + to + ':' + month,
      asOf,
      from,
      to,
      amount,
      month,
      through,
      entity: source.entity,
    },
  ].slice(-40);
  validateBudgets(validate(next));
  assertMonthLocks(model, next);
  return next;
}
export function defaultWatchedAccounts(model, entity) {
  const accounts = model.accounts.filter((a) => a.entity === entity),
    cash = accounts.filter((a) => a.type === 'cash'),
    checking = cash.filter((a) => /check/i.test(a.name)),
    cards = accounts
      .filter((a) => a.type === 'card')
      .sort((a, b) => (a.summaryPriority ?? 100) - (b.summaryPriority ?? 100));
  return [...(checking.length ? checking : cash.slice(0, 1)), ...cards.slice(0, 2)].map(
    (a) => a.id,
  );
}
export function balanceFreshness(model, account, asOf) {
  const a = model.accounts.find((a) => a.id === account);
  if (!a) throw Error('Choose an account.');
  date(asOf);
  const checkpoint = model.reconciliations?.find((r) => r.account === account),
    unknown = balanceUnknownAt(a, asOf),
    valid = !!checkpoint && checkpoint.asOf <= asOf && checkpointValid(model, checkpoint),
    newActivity =
      valid &&
      model.transactions.some(
        (t) =>
          t.date > checkpoint.asOf &&
          t.date <= asOf &&
          (checkpoint.basis === 'pending' || t.status !== 'pending') &&
          t.entries.some((e) => e.account === account),
      ),
    stale = valid && checkpoint.asOf < addDays(asOf, -7),
    verified = valid && !newActivity && !stale && !unknown;
  return {
    account,
    lastChecked: checkpoint?.asOf || null,
    basis: checkpoint?.basis || null,
    verified,
    unknown,
    reason: unknown
      ? 'Principal not confirmed'
      : !checkpoint
        ? 'Not checked yet'
        : !valid
          ? 'Entries changed since this check'
          : newActivity
            ? 'New activity since this check'
            : stale
              ? 'Check is more than a week old'
              : 'Checked ' +
                checkpoint.asOf +
                (checkpoint.basis === 'posted' ? ' · posted' : ' · including pending'),
  };
}
export function reviewFindings(
  model,
  { entity, asOf, accountIds = defaultWatchedAccounts(model, entity), cashAccount } = {},
) {
  date(asOf);
  const owner = (t) =>
      transactionOwner(model, t) === entity ||
      t.entries.some((e) => model.accounts.find((a) => a.id === e.account)?.entity === entity),
    projection = planningForecast(model, asOf),
    payments = new Map(
      projection.planned.filter((t) => t.creditPayment).map((t) => [t.scheduleKey, t]),
    ),
    expected = occurrences(model, asOf)
      .filter((t) => t.date <= asOf && owner(t))
      .map((t) => payments.get(t.scheduleKey) || t),
    pending = model.transactions.filter(
      (t) => t.date <= asOf && t.status === 'pending' && owner(t),
    ),
    accounts = accountIds
      .filter((id) => model.accounts.some((a) => a.id === id && a.entity === entity))
      .map((id) => balanceFreshness(model, id, asOf)),
    categories = budgetMonth(model, asOf.slice(0, 7), entity, asOf),
    unknownBills = (model.unscheduledBills || []).filter((b) => b.entity === entity),
    account =
      model.accounts.find(
        (a) => a.id === cashAccount && a.entity === entity && a.type === 'cash',
      ) || model.accounts.find((a) => a.type === 'cash' && a.entity === entity),
    cash = account
      ? cashCapacity(model, account.id, asOf, { business: entity === 'business' })
      : null;
  if (cash && !balanceFreshness(model, account.id, asOf).verified) {
    cash.reasons = [...new Set([...cash.reasons, 'Verify the current bank balance'])];
    cash.complete = false;
  }
  const missing = categories.buckets.filter(
      (b) => b.allowance === null || !(b.funding?.[asOf.slice(0, 7)] || b.account),
    ),
    unverified = accounts.filter((a) => !a.verified),
    followups =
      expected.length +
      pending.length +
      unverified.length +
      missing.length +
      unknownBills.length +
      (cash
        ? cash.reasons.filter(
            (reason) =>
              !{
                'Missing category targets or funding': missing.length,
                'Unscheduled obligations': unknownBills.length,
                'Overdue expectations need recording or removing': expected.length,
                'Verify the current bank balance': unverified.some((r) => r.account === account.id),
              }[reason],
          ).length
        : 1) +
      Number(!!cash && cash.headroom < 0);
  return {
    expected,
    pending,
    accounts,
    missing,
    unknownBills,
    cash,
    followups,
    entity,
    asOf,
    account: account?.id,
  };
}
export function saveWeeklyReview(model, values) {
  const findings = reviewFindings(model, values);
  if (findings.followups && !values.acceptFollowups)
    throw Error('Review the unresolved items and acknowledge followups before saving this review.');
  const next = structuredClone(model);
  next.weeklyReviews = [
    ...(next.weeklyReviews || []),
    {
      id: values.id || 'review:' + values.entity + ':' + values.asOf,
      asOf: values.asOf,
      entity: values.entity,
      status: findings.followups ? 'followups' : 'reviewed',
      followups: findings.followups,
      checked: findings.accounts.filter((a) => a.verified).length,
      accounts: findings.accounts.length,
      expected: findings.expected.length,
      pending: findings.pending.length,
      missingTargets: findings.missing.length,
    },
  ].slice(-52);
  return next;
}
export function transactionImpact(model, transaction, asOf) {
  const old = transaction.id && model.transactions.find((t) => t.id === transaction.id),
    postings = new Map(),
    current = new Map(),
    categories = new Map();
  if (
    !transaction.entries?.length ||
    transaction.entries.some(
      (e) => !Number.isSafeInteger(e.amount) || !model.accounts.some((a) => a.id === e.account),
    )
  )
    throw Error('Complete the amount and accounts to review the entry.');
  validateAllocations(transaction);
  if (transaction.kind === 'refund')
    validateRefunds({
      ...model,
      transactions: [...model.transactions.filter((t) => t.id !== transaction.id), transaction],
    });
  const collect = (t, sign) => {
    if (!t) return;
    for (const e of t.entries) {
      postings.set(e.account, (postings.get(e.account) || 0) + sign * e.amount);
      if (t.date <= asOf) current.set(e.account, (current.get(e.account) || 0) + sign * e.amount);
    }
    for (const p of spendingParts(t)) {
      const key = transactionOwner(model, t) + '|' + t.date.slice(0, 7) + '|' + p.category;
      categories.set(key, (categories.get(key) || 0) + sign * p.amount);
    }
  };
  collect(old, -1);
  collect(transaction, 1);
  const was = balances(model, asOf),
    trial = {
      ...model,
      transactions: [...model.transactions.filter((t) => t.id !== transaction.id), transaction],
    },
    now = balances(trial, asOf);
  current.clear();
  for (const a of model.accounts)
    if (now[a.id] !== was[a.id]) current.set(a.id, now[a.id] - was[a.id]);
  const effects = (map) =>
    [...map]
      .filter(([, amount]) => amount)
      .map(([account, amount]) => ({
        account,
        amount,
        debt: model.accounts.find((a) => a.id === account).type !== 'cash',
      }));
  return {
    postings: effects(postings),
    current: effects(current),
    categories: [...categories]
      .filter(([, amount]) => amount)
      .map(([key, amount]) => {
        const [entity, month, category] = key.split('|');
        return { entity, month, category, amount };
      }),
    cashUnchanged: effects(current).every((e) => e.debt),
    future: transaction.date > asOf,
  };
}
export function saveReceipt(before, after, options) {
  const detail = explainPlanChange(before, after, options),
    old = new Map(before.transactions.map((t) => [t.id, t])),
    categoryEffects = new Map();
  let recorded = 0,
    edited = 0,
    removed = 0;
  const collect = (t, sign) => {
    for (const part of spendingParts(t)) {
      const key = transactionOwner(after, t) + '|' + t.date.slice(0, 7) + '|' + part.category;
      categoryEffects.set(key, (categoryEffects.get(key) || 0) + sign * part.amount);
    }
  };
  for (const t of after.transactions) {
    const prior = old.get(t.id);
    if (!prior) {
      recorded++;
      collect(t, 1);
    } else if (!same(prior, t)) {
      edited++;
      collect(prior, -1);
      collect(t, 1);
    }
    old.delete(t.id);
  }
  for (const t of old.values()) {
    removed++;
    collect(t, -1);
  }
  return {
    ...detail,
    recorded,
    edited,
    removed,
    categoryEffects: [...categoryEffects]
      .filter(([, amount]) => amount)
      .map(([key, amount]) => {
        const [entity, month, category] = key.split('|');
        return { entity, month, category, amount };
      }),
    moves: (after.budgetMoves || []).filter(
      (move) => !(before.budgetMoves || []).some((old) => same(old, move)),
    ),
    reviews: (after.weeklyReviews || []).filter(
      (review) => !(before.weeklyReviews || []).some((old) => same(old, review)),
    ),
  };
}
export function undoEligibility(before, after) {
  if (
    before.start !== after.start ||
    !same(before.monthClosures, after.monthClosures) ||
    !same(before.monthReopenHistory, after.monthReopenHistory) ||
    !same(before.recoveryHistory, after.recoveryHistory)
  )
    return {
      allowed: false,
      reason: 'Use the month reopening or recovery workflow for this change.',
    };
  for (const a of after.accounts) {
    const old = before.accounts.find((x) => x.id === a.id);
    if (old && (old.opening !== a.opening || !same(old.principalSnapshots, a.principalSnapshots)))
      return {
        allowed: false,
        reason: 'Use the account correction / recovery workflow for a balance reset.',
      };
  }
  return { allowed: true, reason: '' };
}
export function undoLastSave({
  previous,
  current,
  revision,
  expectedRevision,
  hasPreview = false,
}) {
  if (hasPreview) throw Error('Save or reset the current preview before undoing the last save.');
  if (revision !== expectedRevision)
    throw Error(
      'The plan changed after this save. Use Edit or a current-month correction instead.',
    );
  const permission = undoEligibility(previous, current);
  if (!permission.allowed) throw Error(permission.reason);
  const next = structuredClone(previous);
  next.changeLog = structuredClone(current.changeLog || []);
  validateBudgets(validate(next));
  assertMonthLocks(current, next);
  return next;
}
