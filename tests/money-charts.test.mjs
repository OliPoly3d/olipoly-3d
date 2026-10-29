import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { lineChart, clearChart } from '../js/money-charts.mjs';
const dependency = process.env.MONEY_JSDOM_MODULE,
  skip = !dependency;
async function chart(fn) {
  const { JSDOM } = await import(pathToFileURL(dependency).href),
    dom = new JSDOM('<div id="chart"></div>'),
    before = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    await fn(dom.window.document.getElementById('chart'), dom.window);
  } finally {
    dom.window.close();
    globalThis.document = before;
  }
}
test(
  'one-day chart centers visible points and prints a single date, including identical low and closing values',
  { skip },
  () =>
    chart((target) => {
      lineChart(
        target,
        [
          { label: 'Closing', points: [{ date: '2026-10-29', value: 551938 }] },
          { label: 'Low', points: [{ date: '2026-10-29', value: 551938 }], dashed: true },
        ],
        { floor: 50000 },
      );
      const svg = target.querySelector('svg'),
        labels = [...svg.querySelectorAll('text')].map((n) => n.textContent);
      assert.equal(labels.filter((s) => s === 'Oct 29').length, 1);
      const dots = [...svg.querySelectorAll('[data-series-point]')];
      assert.equal(dots.length, 2);
      assert.equal(dots[0].getAttribute('cx'), dots[1].getAttribute('cx'));
      assert.ok(+dots[0].getAttribute('cx') > 75);
      assert.match(dots[0].textContent, /\$5,519.38/);
      assert.doesNotMatch(svg.outerHTML, /NaN|Infinity/);
      clearChart(target);
    }),
);
test(
  'short line charts use unique date ticks and preserve their actual dated values',
  { skip },
  () =>
    chart((target) => {
      lineChart(target, [
        {
          label: 'Cash',
          points: [
            { date: '2026-10-29', value: 100000 },
            { date: '2026-10-30', value: 200000 },
          ],
        },
      ]);
      const labels = [...target.querySelectorAll('svg text')].map((n) => n.textContent);
      assert.equal(labels.filter((s) => s === 'Oct 29').length, 1);
      assert.equal(labels.filter((s) => s === 'Oct 30').length, 1);
      assert.equal(target.querySelectorAll('[data-series-point]').length, 0);
      assert.doesNotMatch(target.innerHTML, /NaN|Infinity/);
    }),
);
test(
  'an empty projection explains missing points rather than drawing only a cash-floor line',
  { skip },
  () =>
    chart((target) => {
      lineChart(target, [{ label: 'Cash', points: [] }], { floor: 50000 });
      assert.equal(target.querySelector('svg'), null);
      assert.match(target.textContent, /No complete forecast points/);
    }),
);
