import { transactionImpact } from './money-everyday.mjs';
import { formatMoney as money } from './money-charts.mjs';
const $ = (id) => document.getElementById(id),
  el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
function accountLine(model, e, prefix = '') {
  const a = model.accounts.find((a) => a.id === e.account),
    debt = a?.type !== 'cash',
    amount = debt ? -e.amount : e.amount,
    p = el(
      'p',
      prefix +
        (a?.name || 'Account') +
        (debt ? ' · debt owed ' : ' · balance ') +
        (amount > 0 ? '+' : '') +
        money(amount),
    );
  p.toggleAttribute('data-debt-private', debt);
  return p;
}
export function setupReceipts({ getDraft, today }) {
  function proposal(t, { planned = false } = {}) {
    const target = $('entryImpact');
    target.replaceChildren();
    if (!t) return;
    try {
      const m = getDraft(),
        impact = transactionImpact(m, t, today());
      target.append(
        el(
          'strong',
          planned
            ? 'Expected item · no actual posting yet'
            : 'Review this ' +
                (t.id && m.transactions.some((x) => x.id === t.id) ? 'correction' : 'entry'),
        ),
      );
      if (planned) {
        target.append(
          el(
            'p',
            'Adds an expectation on ' +
              t.date +
              '. Account balances update only when you record the actual.',
          ),
        );
        for (const e of impact.postings) target.append(accountLine(m, e, 'Expected: '));
      } else {
        if (impact.future)
          target.append(
            el(
              'p',
              'Future-dated actual on ' +
                t.date +
                '. Use Expected one-time item if this has not happened yet.',
            ),
          );
        for (const e of impact.current) target.append(accountLine(m, e));
        if (impact.cashUnchanged) target.append(el('p', 'Cash balances unchanged today.'));
        if (impact.future)
          for (const e of impact.postings) target.append(accountLine(m, e, 'Dated posting: '));
        for (const c of impact.categories)
          target.append(
            el(
              'p',
              c.category +
                ' · ' +
                c.month +
                ' net spending ' +
                (c.amount > 0 ? '+' : '') +
                money(c.amount),
            ),
          );
        if (t.kind === 'transfer') target.append(el('p', 'Category spending change: ' + money(0)));
      }
      if (t.status === 'pending' && !planned)
        target.append(
          el(
            'p',
            'Pending entries are included in Money’s current balances; posted-only bank checks exclude them.',
          ),
        );
    } catch (e) {
      target.append(el('p', e.message));
    }
  }
  function saved(model, receipt, { canUndo = false, undoReason = '', undone = false } = {}) {
    $('saveReceipt').hidden = false;
    $('saveReceiptHeading').textContent = undone
      ? 'Last save undone'
      : receipt.reviews?.length
        ? 'Weekly review saved'
        : 'Saved · ' +
          (receipt.changes.length
            ? receipt.changes
                .slice(0, 2)
                .map((c) => c.name)
                .join(' · ')
            : 'Plan updated');
    const highlights = $('saveReceiptHighlights'),
      details = $('saveReceiptDetails');
    highlights.replaceChildren();
    details.replaceChildren();
    for (const effect of receipt.effects) highlights.append(accountLine(model, effect));
    if (
      (receipt.recorded || receipt.edited || receipt.removed) &&
      !receipt.effects.some((e) => model.accounts.find((a) => a.id === e.account)?.type === 'cash')
    )
      highlights.append(el('p', 'Cash balances unchanged today.'));
    for (const c of receipt.categoryEffects || [])
      details.append(
        el(
          'p',
          c.category +
            ' · ' +
            c.month +
            ' net spending ' +
            (c.amount > 0 ? '+' : '') +
            money(c.amount),
        ),
      );
    if (receipt.forecast) {
      const f = receipt.forecast,
        a = model.accounts.find((a) => a.id === f.account),
        p = el(
          'p',
          (a?.name || 'Account') +
            ' · ' +
            f.month +
            ' projected ending: ' +
            money(f.before) +
            ' → ' +
            money(f.after),
        );
      p.toggleAttribute('data-debt-private', a?.type !== 'cash');
      highlights.append(p);
    } else if (receipt.changes.length)
      details.append(
        el(
          'p',
          'Month-end impact is incomplete or outside this forecast. Review missing inputs before relying on it.',
        ),
      );
    for (const move of receipt.moves || []) {
      const from = model.budgets.find((b) => b.id === move.from),
        to = model.budgets.find((b) => b.id === move.to);
      highlights.append(
        el(
          'p',
          'Budget moved ' +
            money(move.amount) +
            ' per month: ' +
            (from?.name || 'Source') +
            ' → ' +
            (to?.name || 'Destination') +
            ' · ' +
            move.month +
            (move.through !== move.month ? ' through ' + move.through : ''),
        ),
      );
    }
    for (const review of receipt.reviews || [])
      highlights.append(
        el(
          'p',
          review.followups
            ? review.followups +
                ' unresolved checks remain; this review does not mark them paid or verified.'
            : 'No unresolved checks in this weekly review.',
        ),
      );
    if (!details.childNodes.length)
      details.append(
        el(
          'p',
          receipt.recorded +
            ' recorded · ' +
            receipt.edited +
            ' edited · ' +
            receipt.removed +
            ' removed.',
        ),
      );
    for (const c of receipt.changes.slice(0, 20)) details.append(el('p', c.type + ' · ' + c.name));
    $('undoLastSave').hidden = !canUndo;
    $('undoLastSave').dataset.disabled = String(!canUndo);
    $('undoLastSave').disabled = !canUndo;
    $('undoState').textContent = canUndo
      ? 'Undo last save is available until another save or refresh. It reverts this whole save.'
      : undoReason || 'The earlier saved version remains in recovery history.';
  }
  function undoUnavailable(reason = 'Undo is cleared after refresh or another saved change.') {
    $('undoLastSave').hidden = true;
    $('undoLastSave').dataset.disabled = 'true';
    $('undoState').textContent = reason;
  }
  $('dismissSaveReceipt').onclick = () => {
    $('saveReceipt').hidden = true;
  };
  function clear() {
    for (const id of [
      'entryImpact',
      'saveReceiptHeading',
      'saveReceiptHighlights',
      'saveReceiptDetails',
      'undoState',
    ])
      $(id).replaceChildren();
    $('saveReceipt').hidden = true;
    undoUnavailable('');
  }
  return { proposal, saved, undoUnavailable, clear };
}
