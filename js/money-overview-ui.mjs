import { addDays, forecast, forecastEnd, balances } from './money-engine.mjs';
import { monthBounds, shiftMonth } from './money-budget.mjs';
import { planningForecast } from './money-planning.mjs';
import { planningSnapshot } from './money-insights.mjs';
import { cashCapacity } from './money-confidence.mjs';
import {
  horizonSummary,
  monthlyLows,
  categoryPace,
  cashBridge,
  savingsRunway,
  debtRunway,
  milestones,
  planFootprint,
} from './money-decisions.mjs';
import {
  lineChart,
  clearChart,
  waterfallChart,
  timelineChart,
  formatMoney as money,
} from './money-charts.mjs';
const $ = (id) => document.getElementById(id),
  el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
function button(text, fn) {
  const n = el('button', text);
  n.type = 'button';
  n.onclick = fn;
  return n;
}
function options(select, items) {
  const value = select.value;
  select.replaceChildren();
  for (const [id, name] of items) {
    const o = el('option', name);
    o.value = id;
    select.append(o);
  }
  if (items.some(([id]) => id === value)) select.value = value;
}
export function setupOverview({ getDraft, today, record, selectCredit, message }) {
  let view = 'cash',
    projection = null;
  const run = (fn) => {
    try {
      fn();
    } catch (e) {
      message(e.message);
    }
  };
  const now = (m) => (today() < m.start ? m.start : today());
  function eventDay(date) {
    const m = getDraft(),
      d = projection?.days.find((d) => d.date === date),
      account = $('chartAccount').value,
      target = $('eventInspector');
    target.replaceChildren();
    target.hidden = !d;
    if (!d) return;
    $('inspectDate').value = date;
    target.append(
      el(
        'strong',
        date + ' · Closing ' + money(d.closing[account]) + ' · Daily low ' + money(d.low[account]),
      ),
    );
    for (const t of d.events.filter((t) => t.entries.some((e) => e.account === account))) {
      const amount = t.entries
          .filter((e) => e.account === account)
          .reduce((n, e) => n + e.amount, 0),
        p = el(
          'p',
          t.description +
            ' · ' +
            money(amount) +
            ' · ' +
            (t.status === 'plan'
              ? 'Planning allowance'
              : t.status === 'forecast'
                ? 'Expected'
                : t.status),
        );
      p.toggleAttribute(
        'data-debt-private',
        t.kind === 'transfer' &&
          t.entries.some((e) => m.accounts.find((a) => a.id === e.account)?.type !== 'cash'),
      );
      if (t.status !== 'plan' && !t.id?.startsWith('interest:') && t.kind !== 'interest')
        p.append(button(t.status === 'forecast' ? 'Record' : 'Edit', () => record(t)));
      target.append(p);
    }
    if (!target.querySelector('p'))
      target.append(el('p', 'No entries for this account on this date.'));
  }
  function chart(m, p, asOf, end) {
    const month = $('budgetMonth').value,
      a = m.accounts.find((a) => a.id === $('chartAccount').value),
      target = $('decisionChart'),
      rows = $('decisionRows');
    rows.replaceChildren();
    clearChart(target);
    $('eventInspector').hidden = true;
    $('cashHorizonLabel').hidden = view !== 'cash';
    $('inspectDateLabel').hidden = view !== 'cash';
    const past = month < asOf.slice(0, 7);
    let start = month > asOf.slice(0, 7) ? month + '-01' : asOf;
    if (view === 'cash') {
      $('decisionChartHeading').textContent = past ? 'Recorded cash history' : 'Cash outlook';
      const length = Number($('cashHorizon').value),
        finish = past ? monthBounds(month).last : [addDays(start, length - 1), end].sort()[0];
      projection = past ? forecast({ ...m, schedules: [] }, finish) : p;
      if (past) start = month + '-01';
      const days = projection.days.filter((d) => d.date >= start && d.date <= finish);
      const incomplete = !past && p.incompleteFrom[a.entity];
      const points = days.filter((d) => !incomplete || d.date.slice(0, 7) < incomplete);
      lineChart(
        target,
        [
          {
            label: 'Daily closing cash',
            points: points.map((d) => ({ date: d.date, value: d.closing[a.id] })),
          },
          {
            label: 'Daily low (debits first)',
            dashed: true,
            points: points.map((d) => ({ date: d.date, value: d.low[a.id] })),
          },
        ],
        {
          floor: a.reserve || 0,
          onSelect: eventDay,
          markers: points
            .filter((d) =>
              d.events.some(
                (t) =>
                  t.entries.some((e) => e.account === a.id) &&
                  ['income', 'expense', 'transfer'].includes(t.kind),
              ),
            )
            .map((d) => ({
              date: d.date,
              kind: d.events.some(
                (t) => t.kind === 'income' && t.entries.some((e) => e.account === a.id),
              )
                ? 'income'
                : 'bill',
            })),
        },
      );
      $('inspectDate').min = start;
      $('inspectDate').max = finish;
      $('decisionChartNote').textContent = past
        ? 'Recorded entries only, including pending. Use the date picker or tap the chart to inspect activity.'
        : 'Modelled cash: resolve overdue expectations and verify balances before treating headroom as spendable. Tap a date or use the date picker. Teal dots mark income and gold dots mark bills / transfers; the dashed line is the daily low and the horizontal line is your floor. Includes remaining category and YOY budgets. ' +
          (incomplete ? 'Forecast stops before missing budgets in ' + incomplete + '. ' : '') +
          (p.creditWarnings.length
            ? 'Debt interest includes estimates or missing terms; review Debt planner.'
            : '');
    } else if (view === 'pace') {
      $('decisionChartHeading').textContent = 'Spending pace · ' + month;
      $('decisionChartNote').textContent =
        'Recorded net spending versus the allowance expected by today, using dated bills and category timing. A negative difference means less spent than expected. Undated one-time / YOY allowances need a date before pace can be judged.';
      const pace = categoryPace(m, month, $('budgetEntity').value, today());
      const table = el('table'),
        head = el('tr');
      for (const name of ['Category', 'Expected by today', 'Recorded', 'Difference'])
        head.append(el('th', name));
      table.append(head);
      for (const b of pace) {
        const tr = el('tr');
        for (const value of [
          b.name,
          b.expectedByToday === null ? 'Timing not set' : money(b.expectedByToday),
          money(b.spent),
          b.pace === null ? '—' : money(b.pace),
        ])
          tr.append(el('td', value));
        if (b.pace > 0) tr.classList.add('pace-over');
        const td = tr.firstChild,
          track = el('div');
        track.className = 'pace-track';
        const bar = el('span');
        bar.style.width =
          Math.min(100, Math.max(0, b.allowance ? (b.spent / b.allowance) * 100 : 0)) + '%';
        track.append(bar);
        td.append(track);
        table.append(tr);
      }
      const scroll = el('div');
      scroll.className = 'scroll';
      scroll.append(table);
      rows.append(scroll);
    } else if (view === 'lows') {
      $('decisionChartHeading').textContent = 'Next 12 months · daily lows';
      $('decisionChartNote').textContent =
        'Each tile uses the lowest point of any day, including same-day bills before deposits. Room also respects dated cash buffers. This is more conservative than month-end balances.';
      const grid = el('div');
      grid.className = 'low-heatmap';
      for (const r of monthlyLows(m, a.id, asOf, p)) {
        const b = button(r.month, () => {
          $('budgetMonth').value = r.month;
          $('budgetMonth').dispatchEvent(new window.Event('change'));
          view = 'cash';
          render(getDraft());
        });
        b.className = !r.complete
          ? 'unknown'
          : r.headroom < 0
            ? 'risk'
            : r.headroom < 50000
              ? 'tight'
              : 'safe';
        b.append(
          el('strong', r.complete ? money(r.low) : 'Incomplete'),
          el('small', r.complete ? r.date + ' · Room ' + money(r.headroom) : r.reason),
        );
        grid.append(b);
      }
      target.append(grid);
    } else {
      $('decisionChartHeading').textContent = 'Cash bridge · ' + month;
      $('decisionChartNote').textContent =
        'Changes in the selected bank account from opening to closing. Card payments and savings transfers move cash; card purchases retain their original categories and do not hit checking twice.';
      const q = past ? forecast({ ...m, schedules: [] }, monthBounds(month).last) : p;
      if (p.incompleteFrom[a.entity] && month >= p.incompleteFrom[a.entity] && !past) {
        target.textContent = 'Complete the missing budgets before using this bridge.';
        return;
      }
      const bridge = cashBridge(m, a.id, month, asOf, q);
      const privateContainer = el('div');
      privateContainer.setAttribute('data-debt-private', '');
      target.append(privateContainer);
      waterfallChart(privateContainer, bridge);
      const publicNote = el(
        'p',
        'Cash bridge includes debt payments. Use Show debt to view its breakdown.',
      );
      publicNote.className = 'privacy-only help';
      target.append(publicNote);
    }
  }
  function runways(m, p, asOf, end) {
    const entity = $('budgetEntity').value;
    options(
      $('runwayBucket'),
      (m.savingsBuckets || [])
        .filter((b) => m.accounts.find((a) => a.id === b.account)?.entity === entity)
        .map((b) => [b.id, b.name]),
    );
    $('runwayNote').textContent = '';
    clearChart($('runwayChart'));
    if (!$('runwayBucket').value) return;
    const r = savingsRunway(m, $('runwayBucket').value, asOf, end, p);
    $('runwayNote').textContent =
      'Recorded now ' +
      money(r.current) +
      (r.goal === null
        ? ' · Set an optional goal in Edit bucket.'
        : ' · Goal ' +
          money(r.goal) +
          (r.targetDate ? ' by ' + r.targetDate : '') +
          ' · ' +
          (r.reaches ? 'First reached ' + r.reaches : 'Not reached in this forecast')) +
      '. Planned spending and transfers are included; saving for a purpose does not create new cash.';
    const account = m.accounts.find((a) => a.id === r.bucket.account);
    if (p.incompleteFrom[account.entity])
      $('runwayNote').textContent += ' Missing budgets can make later points incomplete.';
    lineChart(
      $('runwayChart'),
      [
        {
          label: r.bucket.name,
          points: r.points
            .filter(
              (x) =>
                !p.incompleteFrom[account.entity] ||
                x.date.slice(0, 7) < p.incompleteFrom[account.entity],
            )
            .map((x) => ({ date: x.date, value: x.balance })),
        },
      ],
      { title: 'Savings purpose runway', floor: r.goal },
    );
  }
  function history(m) {
    const size = planFootprint(m);
    $('storageHealth').textContent =
      (size.storedEstimate / 1000).toFixed(0) +
      ' KB estimated stored size of 2,000 KB plan limit · ' +
      size.transactions +
      ' recorded entries. ' +
      (size.nearLimit ? 'Export a backup and review storage soon. ' : '') +
      size.historyPolicy;
    $('changeHistory').replaceChildren();
    for (const item of [...(m.changeLog || [])].reverse().slice(0, 10)) {
      const detail = el('details'),
        title = el(
          'summary',
          item.asOf +
            ' · ' +
            item.changes
              .map((c) => c.type + ' ' + c.name)
              .slice(0, 3)
              .join(' · '),
        );
      detail.append(title);
      for (const e of item.effects) {
        const a = m.accounts.find((a) => a.id === e.account),
          p = el('p', (a?.name || 'Account') + ' current balance change ' + money(e.amount));
        p.toggleAttribute('data-debt-private', a?.type !== 'cash');
        detail.append(p);
      }
      if (item.forecast) {
        const a = m.accounts.find((a) => a.id === item.forecast.account);
        detail.append(
          el(
            'p',
            (a?.name || 'Account') +
              ' ' +
              item.forecast.month +
              ' projected ending: ' +
              money(item.forecast.before) +
              ' → ' +
              money(item.forecast.after) +
              '. Recording an already expected item can leave this unchanged.',
          ),
        );
      }
      for (const c of item.categories || [])
        detail.append(
          el(
            'p',
            c.name +
              ' net spending change ' +
              money(c.amount) +
              ' · Remaining ' +
              (c.remaining === null ? 'Incomplete' : money(c.remaining)),
          ),
        );
      for (const c of item.changes) detail.append(el('p', c.type + ' · ' + c.name));
      $('changeHistory').append(detail);
    }
    if (!m.changeLog?.length)
      $('changeHistory').append(el('p', 'Future saves will explain what changed here.'));
  }
  function render(m) {
    if (!m?.accounts.length) return;
    const asOf = now(m),
      a = m.accounts.find((a) => a.id === $('chartAccount').value),
      end = forecastEnd(m.start);
    if (!a) return;
    const snap = planningSnapshot(m, asOf),
      p = planningForecast(snap, end),
      near = horizonSummary(snap, a.id, asOf, [addDays(asOf, 90), end].sort()[0], p),
      year = horizonSummary(
        snap,
        a.id,
        asOf,
        [monthBounds(shiftMonth(asOf.slice(0, 7), 11)).last, end].sort()[0],
        p,
      ),
      month = $('budgetMonth').value,
      monthResult = horizonSummary(snap, a.id, asOf, monthBounds(month).last, p),
      pay = cashCapacity(m, a.id, asOf);
    $('decisionMetrics').replaceChildren();
    for (const [label, value, note, risk] of [
      [
        month < asOf.slice(0, 7) ? 'Recorded month-end' : 'Projected month-end',
        month < asOf.slice(0, 7)
          ? money(balances(m, monthBounds(month).last)[a.id])
          : monthResult.complete
            ? money(monthResult.closing)
            : 'Incomplete',
        month + ' · ' + a.name,
        false,
      ],
      [
        'Next 90-day low',
        near.complete ? money(near.low) : 'Incomplete',
        near.complete ? near.date : near.reason,
        near.headroom < 0,
      ],
      [
        '12-month room above floor',
        year.complete ? money(year.headroom) : 'Incomplete',
        year.complete ? 'Tightest cash after floor / buffers' : year.reason,
        year.headroom < 0,
      ],
      [
        'Until next paycheck',
        pay.complete ? money(pay.available) : 'Needs review',
        pay.nextPay || pay.end,
        pay.headroom < 0,
      ],
    ]) {
      const card = el('div');
      card.className = 'metric';
      if (risk) card.classList.add('low');
      card.append(el('span', label), el('strong', value), el('small', note));
      $('decisionMetrics').append(card);
    }
    for (const b of document.querySelectorAll('[data-overview]'))
      b.setAttribute('aria-pressed', String(b.dataset.overview === view));
    chart(m, p, asOf, end);
    runways(m, p, asOf, end);
    history(m);
    const selected = $('creditSelect').value;
    if (selected) {
      const r = debtRunway(snap, selected, asOf, end, p);
      $('debtRunwayNote').textContent =
        (r.complete
          ? 'Estimated first zero balance: ' + (r.payoff || 'Not within this forecast')
          : 'Complete principal / APR details to estimate payoff') +
        '. Interest uses entered assumptions. Net debt reduction also reflects new purchases or refunds; it is not the principal portion of an individual statement payment.';
      lineChart(
        $('debtRunwayChart'),
        [{ label: 'Selected debt', points: r.complete ? r.points : [] }],
        {
          title: 'Selected debt balance',
        },
      );
      const table = el('table'),
        head = el('tr');
      for (const v of [
        'Month',
        'Payments',
        'Estimated interest',
        'Net debt reduction',
        'Ending debt',
      ])
        head.append(el('th', v));
      table.append(head);
      for (const row of r.rows.slice(0, 12)) {
        const tr = el('tr');
        for (const v of [
          row.month,
          money(row.payments),
          r.complete ? money(row.interest) : 'Incomplete',
          r.complete ? money(row.netReduction) : 'Incomplete',
          r.complete ? money(row.debt) : 'Incomplete',
        ])
          tr.append(el('td', v));
        table.append(tr);
      }
      const scroll = el('div');
      scroll.className = 'scroll';
      scroll.append(table);
      $('debtPrincipalRows').replaceChildren(scroll);
    }
    const entity = $('budgetEntity').value,
      debtEvents = milestones(m, entity, asOf, end).filter(
        (x) => x.debt || m.accounts.find((a) => a.id === x.account)?.type !== 'cash',
      );
    timelineChart(
      $('debtTimeline'),
      debtEvents.map((x) => ({
        ...x,
        shortName: x.name + ' · ' + (m.accounts.find((a) => a.id === x.account)?.name || ''),
      })),
      { title: 'Debt milestones', start: asOf, end },
    );
    $('debtCostRows').replaceChildren();
    const last = p.days.at(-1);
    for (const a of m.accounts.filter((a) => a.type !== 'cash' && a.entity === entity)) {
      const c = last.credit?.[a.id];
      if (!c) continue;
      const row = el(
        'p',
        a.name +
          ' · Estimated interest through ' +
          end +
          ': ' +
          (c.missingFrom ? 'Incomplete' : money(c.interest || 0)) +
          ' · Ending debt ' +
          money(Math.max(0, -last.closing[a.id])),
      );
      row.append(button('Terms / payments', () => selectCredit(a.id)));
      $('debtCostRows').append(row);
    }
  }
  for (const b of document.querySelectorAll('[data-overview]'))
    b.onclick = () =>
      run(() => {
        view = b.dataset.overview;
        render(getDraft());
      });
  $('cashHorizon').onchange = () => run(() => render(getDraft()));
  $('inspectDate').onchange = () => run(() => eventDay($('inspectDate').value));
  $('creditSelect').addEventListener('change', () => run(() => render(getDraft())));
  $('runwayBucket').onchange = () => run(() => render(getDraft()));
  function clear() {
    projection = null;
    for (const id of [
      'decisionMetrics',
      'decisionChart',
      'decisionRows',
      'eventInspector',
      'runwayChart',
      'runwayNote',
      'debtTimeline',
      'debtRunwayChart',
      'debtRunwayNote',
      'debtPrincipalRows',
      'debtCostRows',
      'storageHealth',
      'changeHistory',
    ])
      clearChart($(id));
    $('runwayBucket').replaceChildren();
    $('eventInspector').hidden = true;
  }
  return { render, clear };
}
