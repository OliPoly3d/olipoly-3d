import { cents, forecastEnd, occurrences } from './money-engine.mjs';
import { monthBounds, shiftMonth, budgetMonth, seasonalMonth } from './money-budget.mjs';
import {
  compareScenario,
  applyScenarioChanges,
  affordability,
  prepareYear,
} from './money-scenarios.mjs';
import { milestones, renewals, overlapReview } from './money-decisions.mjs';
import { lineChart, clearChart, timelineChart, formatMoney as money } from './money-charts.mjs';
import { sectionPreview, revealSection } from './money-sections.mjs';
const $ = (id) => document.getElementById(id),
  el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
function button(text, fn) {
  const b = el('button', text);
  b.type = 'button';
  b.onclick = fn;
  return b;
}
function options(select, items) {
  const old = select.value;
  select.replaceChildren();
  for (const [id, name] of items) {
    const o = el('option', name);
    o.value = id;
    select.append(o);
  }
  if (items.some(([id]) => id === old)) select.value = old;
}
export function setupPlanner({
  getDraft,
  updateDraft,
  today,
  message,
  editSchedule,
  selectCredit,
}) {
  let scenario = { id: crypto.randomUUID(), changes: [] },
    compared = null,
    afford = null,
    affordBase = null,
    yearReview = null;
  const run = (fn) => {
    try {
      return fn();
    } catch (e) {
      message(e.message);
      return null;
    }
  };
  const asOf = () => (today() < getDraft().start ? getDraft().start : today()),
    entity = () => $('budgetEntity').value,
    account = () => $('chartAccount').value;
  function summary(target, result) {
    target.replaceChildren();
    const table = el('table'),
      head = el('tr');
    for (const v of ['Measure', 'Current plan', 'With choice', 'Change']) head.append(el('th', v));
    table.append(head);
    for (const [label, key, debt] of [
      ['Lowest cash', 'low', false],
      ['Tightest room above floor', 'headroom', false],
      ['Ending cash', 'closing', false],
      ['Ending debt', 'debt', true],
      ['Estimated interest', 'interest', true],
    ]) {
      if (result.before[key] === undefined) continue;
      const tr = el('tr');
      if (debt) tr.setAttribute('data-debt-private', '');
      const complete = debt
        ? result.before.debtComplete && result.after.debtComplete
        : result.before.complete && result.after.complete;
      for (const v of [
        label,
        complete ? money(result.before[key]) : 'Incomplete',
        complete ? money(result.after[key]) : 'Incomplete',
        complete ? money(result.after[key] - result.before[key]) : '—',
      ])
        tr.append(el('td', v));
      table.append(tr);
    }
    const scroll = el('div');
    scroll.className = 'scroll';
    scroll.append(table);
    target.append(
      scroll,
      el(
        'p',
        'Low date ' +
          (result.before.date || '—') +
          ' → ' +
          (result.after.date || '—') +
          ' · Projection through ' +
          result.after.end +
          '. ' +
          (!result.after.complete
            ? 'Complete missing inputs before relying on this comparison. '
            : ''),
      ),
    );
  }
  function affordControls() {
    const f = $('affordForm'),
      mode = f.elements.mode.value;
    $('affordBudgetLabel').hidden = mode !== 'allowance';
    $('affordBucketLabel').hidden = mode !== 'savings';
    $('affordExpectedLabel').hidden = mode !== 'existing';
    for (const [key, selected] of [
      ['budget', mode === 'allowance'],
      ['bucket', mode === 'savings'],
      ['scheduleKey', mode === 'existing'],
    ])
      f.elements[key].disabled = !selected;
  }
  $('affordForm').elements.mode.onchange = affordControls;
  $('affordForm').addEventListener('input', () => {
    afford = null;
    $('affordApply').disabled = true;
    $('affordApply').dataset.disabled = 'true';
  });
  $('affordForm').addEventListener('change', () => {
    afford = null;
    $('affordApply').disabled = true;
    $('affordApply').dataset.disabled = 'true';
  });
  $('affordForm').onsubmit = (e) => {
    e.preventDefault();
    run(() => {
      const f = e.target,
        m = getDraft(),
        bucket =
          f.elements.mode.value === 'savings' &&
          m.savingsBuckets?.find((b) => b.id === f.elements.bucket.value),
        source = bucket?.account || f.elements.account.value;
      if (bucket) f.elements.account.value = source;
      afford = affordability(m, {
        id: crypto.randomUUID(),
        name: f.elements.name.value.trim(),
        when: f.elements.when.value,
        amount: cents(f.elements.amount.value),
        account: source,
        watchAccount: f.elements.watchAccount.value,
        mode: f.elements.mode.value,
        budget: f.elements.budget.value,
        bucket: f.elements.bucket.value,
        scheduleKey: f.elements.scheduleKey.value,
        asOf: asOf(),
        end: forecastEnd(m.start),
      });
      affordBase = JSON.stringify(m);
      summary($('affordResult'), { before: afford.nearBefore, after: afford.nearAfter });
      const p = el(
        'p',
        'Full horizon tightest room: ' +
          (afford.after.complete ? money(afford.after.headroom) : 'Incomplete') +
          ' through ' +
          afford.after.end +
          (afford.fund
            ? ' · ' + afford.fund.name + ' after spending: ' + money(afford.fund.after)
            : ''),
      );
      if (afford.fund?.after < 0) p.className = 'low';
      $('affordResult').append(p);
      $('affordApply').disabled = false;
      $('affordApply').dataset.disabled = 'false';
    });
  };
  $('affordApply').onclick = () =>
    run(() => {
      if (!afford || JSON.stringify(getDraft()) !== affordBase)
        throw Error('The preview changed. Compare this spending again before applying it.');
      const next = afford.next;
      afford = null;
      updateDraft(() => next);
      $('affordApply').disabled = true;
      $('affordApply').dataset.disabled = 'true';
      message(
        'Choice added to budget preview. Save changes keeps it; no actual purchase was recorded.',
      );
    });
  function readScenario() {
    const f = $('householdScenarioForm'),
      end = f.elements.end.value;
    return {
      ...scenario,
      name: f.elements.name.value.trim(),
      asOf: asOf(),
      end: monthBounds(end).last,
      account: f.elements.account.value,
    };
  }
  function changeControls() {
    const f = $('scenarioChangeForm'),
      type = f.elements.type.value;
    f.toggleAttribute('data-debt-private', ['debt', 'balance'].includes(type));
    for (const label of f.querySelectorAll('[data-change]')) {
      const show = label.dataset.change.split(' ').includes(type);
      label.hidden = !show;
      for (const input of label.querySelectorAll('input,select')) input.disabled = !show;
    }
    const m = getDraft(),
      visible = m.accounts.filter(
        (a) =>
          a.entity === entity() && (['debt', 'balance'].includes(type) ? a.type !== 'cash' : true),
      );
    options(
      f.elements.account,
      visible.map((a) => [a.id, a.name]),
    );
  }
  function describe(c, m) {
    const get = (key, id) => m[key]?.find((x) => x.id === id)?.name || id || '';
    return c.type === 'budget'
      ? get('budgets', c.budget) +
          ' ' +
          c.month +
          '–' +
          (c.through || c.month) +
          ' → ' +
          money(c.amount)
      : c.type === 'schedule'
        ? get('schedules', c.schedule) +
          ' ' +
          (c.stop ? 'stops' : '→ ' + money(c.amount)) +
          ' from ' +
          c.when
        : c.type === 'balance'
          ? get('accounts', c.account) + ' hypothetical debt ' + money(c.amount)
          : c.type === 'debt'
            ? get('accounts', c.account) +
              ' pay ' +
              money(c.amount) +
              ' on day ' +
              c.day +
              ' from ' +
              c.when
            : (c.name || c.type) + ' · ' + c.when + ' · ' + money(c.amount);
  }
  function changes() {
    const target = $('householdChangeRows');
    target.replaceChildren();
    const m = getDraft();
    for (const c of scenario.changes) {
      const row = el('p', describe(c, m) + ' ');
      if (
        ['debt', 'balance'].includes(c.type) ||
        ([c.account, c.to]
          .filter(Boolean)
          .some((id) => m.accounts.find((a) => a.id === id)?.type !== 'cash') &&
          c.type === 'transfer')
      )
        row.setAttribute('data-debt-private', '');
      row.append(
        button('Edit', () => {
          const f = $('scenarioChangeForm');
          f.reset();
          f.elements.type.value = c.type;
          changeControls();
          for (const [key, value] of Object.entries(c)) {
            const input = f.elements[key];
            if (input) {
              if (input.type === 'checkbox') input.checked = !!value;
              else input.value = key === 'amount' ? (value / 100).toFixed(2) : value;
            }
          }
          f.elements.changeId.value = c.id;
          f.elements.amount.focus();
        }),
        button('Remove', () => {
          scenario.changes = scenario.changes.filter((x) => x.id !== c.id);
          invalidate();
          changes();
        }),
      );
      target.append(row);
    }
    if (!scenario.changes.length)
      target.append(el('p', 'Add a change to compare. The current plan stays untouched.'));
  }
  function invalidate() {
    compared = null;
    $('applyHouseholdScenario').disabled = true;
    $('applyHouseholdScenario').dataset.disabled = 'true';
  }
  function newScenario() {
    scenario = { id: crypto.randomUUID(), changes: [] };
    $('householdScenarioForm').reset();
    $('householdScenarioForm').elements.end.value =
      Math.min(Number(asOf().slice(0, 4)) + 1, Number(forecastEnd(getDraft().start).slice(0, 4))) +
      '-12';
    options(
      $('householdScenarioForm').elements.account,
      getDraft()
        .accounts.filter((a) => a.type === 'cash' && a.entity === entity())
        .map((a) => [a.id, a.name]),
    );
    $('scenarioChangeForm').reset();
    $('scenarioChangeForm').elements.when.value = asOf();
    $('scenarioChangeForm').elements.month.value = asOf().slice(0, 7);
    $('scenarioChangeForm').elements.through.value = asOf().slice(0, 7);
    changeControls();
    invalidate();
    changes();
    $('householdScenarioResult').replaceChildren();
    clearChart($('householdScenarioChart'));
  }
  $('scenarioChangeForm').elements.type.onchange = changeControls;
  $('cancelScenarioChange').onclick = () => {
    $('scenarioChangeForm').reset();
    $('scenarioChangeForm').elements.when.value = asOf();
    changeControls();
  };
  $('scenarioChangeForm').onsubmit = (e) => {
    e.preventDefault();
    run(() => {
      const f = e.target,
        c = {
          id: f.elements.changeId.value || crypto.randomUUID(),
          type: f.elements.type.value,
          amount: cents(f.elements.amount.value || '0'),
        };
      for (const key of [
        'budget',
        'schedule',
        'name',
        'account',
        'to',
        'from',
        'category',
        'when',
        'month',
        'through',
      ])
        if (!f.elements[key].disabled) c[key] = f.elements[key].value;
      if (c.type === 'debt') c.day = Number(f.elements.day.value);
      if (c.type === 'schedule') {
        c.stop = f.elements.stop.checked;
        c.replaceFuture = f.elements.replaceFuture.checked;
      }
      const trial = {
        ...readScenario(),
        changes: [...scenario.changes.filter((x) => x.id !== c.id), c],
      };
      if (!trial.name) trial.name = 'Unsaved scenario';
      applyScenarioChanges(getDraft(), trial, { hypotheticalBalances: true });
      scenario.changes = trial.changes;
      f.elements.changeId.value = '';
      invalidate();
      changes();
      message('Scenario change added locally. Compare it or save the scenario in preview.');
    });
  };
  $('householdScenarioForm').addEventListener('input', invalidate);
  $('householdScenarioForm').addEventListener('change', invalidate);
  $('householdScenarioForm').onsubmit = (e) => {
    e.preventDefault();
    run(() => {
      const s = readScenario();
      if (!s.name) throw Error('Name this scenario.');
      compareScenario(getDraft(), s);
      scenario = s;
      updateDraft((next) => {
        next.householdScenarios = [
          ...(next.householdScenarios || []).filter((x) => x.id !== s.id),
          s,
        ];
        return next;
      });
      message('Scenario saved in preview as a list of changes. Save changes stores it.');
    });
  };
  $('newHouseholdScenario').onclick = () => run(newScenario);
  $('loadHouseholdScenario').onclick = () =>
    run(() => {
      const s = getDraft().householdScenarios?.find((s) => s.id === $('householdScenario').value);
      if (!s) throw Error('Choose a saved scenario.');
      scenario = structuredClone(s);
      const f = $('householdScenarioForm');
      f.elements.name.value = s.name;
      f.elements.end.value = s.end.slice(0, 7);
      f.elements.account.value = s.account;
      invalidate();
      changes();
      message(
        'Scenario loaded. Effective dates are kept; review any dates that are now in the past.',
      );
    });
  $('deleteHouseholdScenario').onclick = () =>
    run(() => {
      const id = $('householdScenario').value;
      updateDraft((next) => {
        next.householdScenarios = next.householdScenarios.filter((s) => s.id !== id);
        return next;
      });
      if (scenario.id === id) newScenario();
      message('Saved scenario removed in preview. Applied budget choices are unchanged.');
    });
  $('compareHouseholdScenario').onclick = () =>
    run(() => {
      const s = readScenario();
      if (!s.name) s.name = 'Unsaved scenario';
      const result = compareScenario(getDraft(), s);
      compared = { s, base: getDraft() };
      summary($('householdScenarioResult'), result);
      lineChart(
        $('householdScenarioChart'),
        [
          {
            label: 'Current plan',
            points: result.beforeProjection.days
              .filter(
                (d) =>
                  d.date >= s.asOf &&
                  (!result.beforeProjection.incompleteFrom[entity()] ||
                    d.date.slice(0, 7) < result.beforeProjection.incompleteFrom[entity()]),
              )
              .map((d) => ({ date: d.date, value: d.closing[s.account] })),
          },
          {
            label: s.name,
            color: 'var(--warning)',
            points: result.afterProjection.days
              .filter(
                (d) =>
                  d.date >= s.asOf &&
                  (!result.afterProjection.incompleteFrom[entity()] ||
                    d.date.slice(0, 7) < result.afterProjection.incompleteFrom[entity()]),
              )
              .map((d) => ({ date: d.date, value: d.closing[s.account] })),
          },
        ],
        {
          title: 'Scenario cash comparison',
          floor: getDraft().accounts.find((a) => a.id === s.account)?.reserve || 0,
        },
      );
      $('applyHouseholdScenario').disabled = false;
      $('applyHouseholdScenario').dataset.disabled = 'false';
    });
  $('applyHouseholdScenario').onclick = () =>
    run(() => {
      if (!compared || compared.base !== getDraft())
        throw Error('Compare again after the preview changes.');
      const next = applyScenarioChanges(getDraft(), compared.s);
      invalidate();
      updateDraft(() => next);
      message(
        'Scenario choices applied to preview. Hypothetical debt balances were excluded. Review and Save changes.',
      );
    });
  $('compareSavedScenarios').onclick = () =>
    run(() => {
      const target = $('savedScenarioComparisons');
      target.replaceChildren();
      for (const s of (getDraft().householdScenarios || [])
        .filter((s) => getDraft().accounts.find((a) => a.id === s.account)?.entity === entity())
        .slice(0, 5)) {
        const block = el('div');
        block.append(el('h4', s.name));
        try {
          summary(block, compareScenario(getDraft(), { ...s, asOf: asOf() }));
          block.prepend(el('h4', s.name));
        } catch (e) {
          block.append(el('p', e.message));
        }
        target.append(block);
      }
      if (!target.children.length)
        target.textContent = 'Save scenarios to compare up to five cases.';
    });
  function renewalCalendar(m) {
    const target = $('renewalRows');
    target.replaceChildren();
    for (const r of renewals(m, entity(), asOf())) {
      const detail = el('div');
      detail.className = 'calendar-row';
      detail.append(
        el('strong', r.name),
        el(
          'p',
          'Next ' +
            r.next +
            (r.estimatedDate ? ' (month estimate)' : '') +
            ' · ' +
            money(r.amount) +
            ' · Next 12 months ' +
            money(r.annual) +
            ' · Review ' +
            r.review +
            ' · ' +
            (m.accounts.find((a) => a.id === r.account)?.name || 'Choose funding account'),
        ),
      );
      detail.append(
        button('Edit source', () => sourceEditor(r)),
        button('Preview stopping', () =>
          run(() => {
            const when = r.next;
            updateDraft((next) => {
              if (r.source === 'schedule') {
                next.schedules.find((s) => s.id === r.id).stoppedFrom = r.key?.slice(-10) || when;
              } else {
                const item = next.seasonalItems.find((i) => i.id === r.id),
                  year = Number(when.slice(0, 4));
                item.changes = [
                  ...(item.changes || []).filter((c) => c.year < year),
                  { year, amount: 0 },
                ];
                for (const key of Object.keys(item.overrides || {}))
                  if (key >= when.slice(0, 7)) delete item.overrides[key];
                const budget = next.budgets.find((b) => b.seasonal && b.entity === entity());
                for (const key of Object.keys(budget?.overrides || {}))
                  if (key >= when.slice(0, 7) && Number(key.slice(-2)) === item.month)
                    delete budget.overrides[key];
              }
              return next;
            });
            message(
              'Stopping previewed. Check cash outlook, then Save changes if this cancellation is intended. You must cancel with the provider separately.',
            );
          }),
        ),
      );
      target.append(detail);
    }
    if (!target.children.length)
      target.textContent = 'No detected renewals. Mark a schedule or YOY item below.';
    options($('renewalForm').elements.source, [
      ...m.schedules
        .filter(
          (s) =>
            m.accounts.find((a) => a.id === s.account)?.entity === entity() &&
            !s.to &&
            s.amount < 0,
        )
        .map((s) => ['schedule|' + s.id, s.name]),
      ...(m.seasonalItems || [])
        .filter((i) => i.entity === entity())
        .map((i) => ['seasonal|' + i.id, 'YOY · ' + i.name]),
    ]);
    fillRenewal();
  }
  function sourceEditor(r) {
    if (r.source === 'schedule') editSchedule(r.id);
    else {
      const item = getDraft().seasonalItems.find((i) => i.id === r.id);
      $('budgetMonth').value = asOf().slice(0, 4) + '-' + String(item.month).padStart(2, '0');
      $('budgetMonth').dispatchEvent(new Event('change'));
      revealSection($('seasonalSection'));
      $('seasonalSection').scrollIntoView({ behavior: 'smooth' });
    }
  }
  function fillRenewal() {
    const f = $('renewalForm'),
      [type, id] = f.elements.source.value.split('|'),
      source = (type === 'schedule' ? getDraft()?.schedules : getDraft()?.seasonalItems)?.find(
        (s) => s.id === id,
      );
    f.elements.renewal.value =
      source?.renewal === true ? 'yes' : source?.renewal === false ? 'no' : 'auto';
    f.elements.reviewDate.value = source?.reviewDate || '';
  }
  $('renewalForm').elements.source.onchange = fillRenewal;
  $('renewalForm').onsubmit = (e) => {
    e.preventDefault();
    run(() => {
      const f = e.target,
        [type, id] = f.elements.source.value.split('|');
      updateDraft((next) => {
        const item = (type === 'schedule' ? next.schedules : next.seasonalItems).find(
          (s) => s.id === id,
        );
        if (!item) throw Error('Choose a renewal source.');
        if (f.elements.renewal.value === 'auto') delete item.renewal;
        else item.renewal = f.elements.renewal.value === 'yes';
        if (f.elements.reviewDate.value) item.reviewDate = f.elements.reviewDate.value;
        else delete item.reviewDate;
        return next;
      });
      message('Review calendar updated in preview.');
    });
  };
  function reviewYear() {
    const f = $('prepareYearForm'),
      m = getDraft(),
      source = Number(f.elements.sourceYear.value),
      target = Number(f.elements.targetYear.value);
    if (target <= source || target + '-12' > forecastEnd(m.start).slice(0, 7))
      throw Error('Choose a later year within the forecast.');
    yearReview = { source, target, entity: entity(), base: JSON.stringify(m) };
    $('yearTargetRows').replaceChildren();
    const table = el('table'),
      head = el('tr');
    for (const v of ['Category', ...Array.from({ length: 12 }, (_, i) => String(i + 1))])
      head.append(el('th', v));
    table.append(head);
    for (const b of m.budgets.filter(
      (b) => b.entity === entity() && !b.seasonal && !b.oneTimeMonth,
    )) {
      const tr = el('tr');
      tr.append(el('th', b.name));
      for (let i = 1; i <= 12; i++) {
        const suffix = '-' + String(i).padStart(2, '0'),
          to = target + suffix,
          from = source + suffix,
          value = b.overrides?.[to] ?? b.monthly?.[to] ?? b.overrides?.[from] ?? b.monthly?.[from],
          input = el('input');
        input.type = 'number';
        input.min = '0';
        input.step = '0.01';
        input.value = value === undefined ? '' : (value / 100).toFixed(2);
        input.dataset.budget = b.id;
        input.dataset.month = to;
        input.setAttribute('aria-label', b.name + ' ' + to);
        const td = el('td');
        td.append(input);
        if (b.overrides?.[to] !== undefined || b.monthly?.[to] !== undefined)
          td.append(el('small', 'Existing'));
        tr.append(td);
      }
      table.append(tr);
    }
    $('yearTargetRows').append(table);
    $('yearGrowthRows').replaceChildren(el('strong', 'Already modeled changes in ' + target));
    for (const item of milestones(m, entity(), target + '-01-01', target + '-12-31')) {
      const p = el('p', item.date + ' · ' + item.name);
      p.toggleAttribute('data-debt-private', !!item.debt);
      $('yearGrowthRows').append(p);
    }
    $('yearOneTimes').replaceChildren(
      el('strong', 'Choose only one-time items that should repeat'),
    );
    for (const item of [
      ...m.schedules
        .filter(
          (s) =>
            s.oneTime &&
            s.anchor.startsWith(String(source)) &&
            m.accounts.find((a) => a.id === s.account)?.entity === entity(),
        )
        .map((s) => ({ id: s.id, name: s.name + ' · ' + s.anchor })),
      ...m.budgets
        .filter((b) => b.oneTimeMonth?.startsWith(String(source)) && b.entity === entity())
        .map((b) => ({ id: b.id, name: b.name + ' · ' + b.oneTimeMonth })),
    ]) {
      const label = el('label');
      label.className = 'check-label';
      const check = el('input');
      check.type = 'checkbox';
      check.dataset.oneTime = item.id;
      label.append(check, document.createTextNode(item.name));
      $('yearOneTimes').append(label);
    }
    renderOverlaps(m, target);
  }
  $('reviewFutureYear').onclick = () => run(reviewYear);
  $('prepareYearForm').onsubmit = (e) => {
    e.preventDefault();
    run(() => {
      const f = e.target;
      if (
        !yearReview ||
        yearReview.source !== Number(f.elements.sourceYear.value) ||
        yearReview.target !== Number(f.elements.targetYear.value) ||
        yearReview.entity !== entity() ||
        yearReview.base !== JSON.stringify(getDraft())
      )
        throw Error('Review year inputs again after changing the year or plan.');
      const amounts = {};
      for (const input of $('yearTargetRows').querySelectorAll('input'))
        if (input.value !== '') {
          amounts[input.dataset.budget] ??= {};
          amounts[input.dataset.budget][input.dataset.month] = cents(input.value);
        }
      const result = prepareYear(getDraft(), {
        sourceYear: yearReview.source,
        targetYear: yearReview.target,
        entity: entity(),
        amounts,
        overwrite: f.elements.overwrite.checked,
        oneTimes: [...$('yearOneTimes').querySelectorAll('input:checked')].map(
          (x) => x.dataset.oneTime,
        ),
        asOf: asOf(),
        confirmGrowth: f.elements.confirmGrowth.checked,
        confirmOneTimes: f.elements.confirmOneTimes.checked,
      });
      updateDraft(() => result.next);
      $('yearPreparationResult').textContent =
        result.changed.length +
        ' month targets prepared. ' +
        result.missing.length +
        ' still missing. Explicit future targets were ' +
        (f.elements.overwrite.checked ? 'replaced with your reviewed values.' : 'preserved.');
      yearReview = null;
      message('Year prepared in preview. Review cash outlook and Save changes.');
    });
  };
  function renderOverlaps(m, year) {
    $('overlapRows').replaceChildren();
    for (const r of overlapReview(m, entity(), year)) {
      const p = el(
        'p',
        r.month + ' · ' + r.name + ' · ' + money(r.amount) + ' in YOY plus a similar bill. ',
      );
      p.append(
        button('Review bill', () => editSchedule(r.schedule.slice(0, -11))),
        button('Review YOY', () => sourceEditor({ source: 'seasonal', id: r.seasonal })),
        button('These are separate', () =>
          run(() =>
            updateDraft((next) => {
              next.overlapDecisions = [
                ...(next.overlapDecisions || []).filter((x) => x.id !== r.id),
                { id: r.id, resolution: 'separate', asOf: asOf() },
              ];
              return next;
            }),
          ),
        ),
      );
      $('overlapRows').append(p);
    }
    if (!$('overlapRows').children.length)
      $('overlapRows').textContent =
        'No similar bill / YOY pairs detected. This name-and-amount check cannot prove that the plan has no duplicates.';
  }
  function render(m) {
    if (!m) return;
    if (afford && affordBase !== JSON.stringify(m)) {
      afford = null;
      $('affordApply').disabled = true;
      $('affordApply').dataset.disabled = 'true';
    }
    if (yearReview && yearReview.base !== JSON.stringify(m)) yearReview = null;
    const cash = m.accounts
        .filter((a) => a.entity === entity() && a.type === 'cash')
        .map((a) => [a.id, a.name]),
      all = m.accounts.filter((a) => a.entity === entity()).map((a) => [a.id, a.name]),
      categories = (m.budgets || [])
        .filter((b) => b.entity === entity())
        .map((b) => [b.id, b.name]),
      f = $('affordForm');
    options(f.elements.account, all);
    options(f.elements.watchAccount, cash);
    options(f.elements.budget, categories);
    options(
      f.elements.bucket,
      (m.savingsBuckets || [])
        .filter((b) => m.accounts.find((a) => a.id === b.account)?.entity === entity())
        .map((b) => [b.id, b.name]),
    );
    options(
      f.elements.scheduleKey,
      occurrences(m, forecastEnd(m.start))
        .filter(
          (t) =>
            t.date >= asOf() &&
            t.kind === 'expense' &&
            m.accounts.find((a) => a.id === t.entries[0].account)?.entity === entity(),
        )
        .map((t) => [t.scheduleKey, t.date + ' · ' + t.description]),
    );
    if (!f.elements.when.value) f.elements.when.value = asOf();
    f.elements.when.min = asOf();
    f.elements.when.max = forecastEnd(m.start);
    affordControls();
    options(
      $('householdScenario'),
      (m.householdScenarios || [])
        .filter((s) => m.accounts.find((a) => a.id === s.account)?.entity === entity())
        .map((s) => [s.id, s.name]),
    );
    options($('householdScenarioForm').elements.account, cash);
    if (!$('householdScenarioForm').elements.end.value)
      $('householdScenarioForm').elements.end.value =
        Math.min(Number(asOf().slice(0, 4)) + 1, Number(forecastEnd(m.start).slice(0, 4))) + '-12';
    const c = $('scenarioChangeForm');
    options(c.elements.budget, categories);
    options(
      c.elements.schedule,
      m.schedules
        .filter(
          (s) => !s.oneTime && m.accounts.find((a) => a.id === s.account)?.entity === entity(),
        )
        .map((s) => [s.id, s.name]),
    );
    options(c.elements.to, all);
    options(c.elements.from, cash);
    if (!c.elements.when.value) c.elements.when.value = asOf();
    if (!c.elements.month.value) c.elements.month.value = asOf().slice(0, 7);
    if (!c.elements.through.value) c.elements.through.value = asOf().slice(0, 7);
    changeControls();
    changes();
    invalidate();
    const end = forecastEnd(m.start),
      events = milestones(m, entity(), asOf(), end);
    timelineChart(
      $('milestoneChart'),
      events.map((x) => ({ ...x, shortName: x.name })),
      { title: 'Financial milestones', start: asOf(), end },
    );
    $('milestoneRows').replaceChildren();
    for (const item of events) {
      const a = m.accounts.find((a) => a.id === item.account),
        p = el(
          'p',
          item.date +
            ' · ' +
            item.name +
            ' · ' +
            (a?.name || 'Account') +
            (item.amount != null
              ? ' · ' + money(item.amount) + ' / ' + (item.frequency || 'event')
              : ''),
        );
      p.toggleAttribute('data-debt-private', !!item.debt || a?.type !== 'cash');
      if (item.kind === 'promo')
        p.append(button('Terms / payments', () => selectCredit(item.source)));
      else if (m.schedules.some((s) => s.id === item.source))
        p.append(button('Edit schedule', () => editSchedule(item.source)));
      $('milestoneRows').append(p);
    }
    renewalCalendar(m);
    const y = $('prepareYearForm');
    if (!y.elements.sourceYear.value) y.elements.sourceYear.value = asOf().slice(0, 4);
    if (!y.elements.targetYear.value) y.elements.targetYear.value = Number(asOf().slice(0, 4)) + 1;
    renderOverlaps(m, Number(y.elements.targetYear.value));
    sectionPreview(
      'plannerSection',
      'Try spending, compare changes, review renewals and prepare a year',
    );
  }
  function clear() {
    scenario = { id: crypto.randomUUID(), changes: [] };
    compared = null;
    afford = null;
    yearReview = null;
    for (const id of [
      'affordResult',
      'householdChangeRows',
      'householdScenarioResult',
      'householdScenarioChart',
      'savedScenarioComparisons',
      'milestoneChart',
      'milestoneRows',
      'renewalRows',
      'yearTargetRows',
      'yearGrowthRows',
      'yearOneTimes',
      'overlapRows',
      'yearPreparationResult',
    ])
      clearChart($(id));
    for (const id of [
      'affordForm',
      'householdScenarioForm',
      'scenarioChangeForm',
      'renewalForm',
      'prepareYearForm',
    ]) {
      $(id).reset();
      for (const s of $(id).querySelectorAll('select'))
        if (!['mode', 'type', 'renewal'].includes(s.name)) s.replaceChildren();
    }
    $('householdScenario').replaceChildren();
    sectionPreview('plannerSection', '');
  }
  return { render, clear };
}
