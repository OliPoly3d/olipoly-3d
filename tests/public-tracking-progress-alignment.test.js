const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('track.html', 'utf8');
const canonicalSource = html.match(/function canonicalStatus\(v\)\{[^\n]+\}/)[0];
const progressSource = html.match(/function progressStep\(status\)\{[^\n]+\}/)[0];
const context = {
  window: {
    OliPolyWorkflow: {
      normalizeOrderStatus(value) { return String(value || 'ready_to_print'); }
    }
  }
};
vm.runInNewContext(`${canonicalSource};${progressSource};this.progressStep=progressStep`, context);

assert.equal(context.progressStep('ready_to_print'), 2, 'accepted work starts at Scheduled');
assert.equal(context.progressStep('printing'), 3, 'Printing highlights In Production');
assert.equal(context.progressStep('qc'), 4, 'QC highlights Finishing / QC');
assert.equal(context.progressStep('ready_for_fulfillment'), 5, 'Ready highlights Ready / Shipped');
assert.equal(context.progressStep('closed'), 5, 'Closed remains at the final fulfillment step');
assert.match(html, /timelineFill\.style\.width=\`\$\{\(step-1\)\*25\}%\`/);
assert.match(html, /classList\.toggle\('active',Number\(s\.dataset\.step\)<=step\)/);
assert.match(html, /classList\.toggle\('is-complete', canonicalStatus\(o\.status\) === 'closed'\)/);
console.log('public tracking progress alignment assertions passed');
