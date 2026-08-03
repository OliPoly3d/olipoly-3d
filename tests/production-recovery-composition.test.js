const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('production-control.html', 'utf8');
const recoverySource = fs.readFileSync('js/production-recovery-storage.js', 'utf8');
const orders = fs.readFileSync('orders-admin.html', 'utf8');

// Compile every final inline script, not merely the extracted JavaScript files.
for(const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()){
  assert.doesNotThrow(() => new vm.Script(match[1], {filename:`production-control:inline-${index + 1}.js`}));
}

const loadedScripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(match => match[1].split('?')[0]);
for(const script of loadedScripts){
  if(!/^https?:/.test(script)) assert(fs.existsSync(script), `Production Control script is missing: ${script}`);
}
assert(loadedScripts.indexOf('js/production-recovery-storage.js') < loadedScripts.indexOf('js/printer-dashboard.js'), 'recovery API must load before the main Production runtime');
assert.match(html, /OliPolyProductionRecoveryStorage\.read\(LINKED_WORKFLOW_RECOVERY_KEY, \{\}\)/, 'linked recovery must use the canonical API, not a dangling readJson global');
assert.doesNotMatch(html.slice(html.indexOf('function linkedWorkflowRecovery'), html.indexOf('async function saveJob')), /\breadJson\b|\bwriteJson\b/, 'linked recovery has no inaccessible JSON helper references');

function storage(initial = {}){
  const values = new Map(Object.entries(initial));
  return {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key, value) => values.set(key, value),
    value:key => values.get(key)
  };
}
const sandbox = {module:{exports:{}}, globalThis:{}};
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.createContext(sandbox);
vm.runInContext(recoverySource, sandbox);
const recovery = sandbox.module.exports;

assert.strictEqual(recovery.read('missing', 'fallback', storage()), 'fallback');
for(const value of [null, false, 0]){
  assert.strictEqual(recovery.read('key', 'fallback', storage({key:JSON.stringify(value)})), value, `preserves ${value}`);
}
assert.deepStrictEqual(JSON.parse(JSON.stringify(recovery.read('key', {}, storage({key:'{"job":{"status":"printing"}}'})))), {job:{status:'printing'}});
const malformed = recovery.inspect('key', storage({key:'{broken'}));
assert.strictEqual(malformed.status, 'malformed');
assert.throws(() => recovery.read('key', {}, storage({key:'{broken'})), error => error.name === 'ProductionRecoveryReadError' && error.recoveryStatus === 'malformed');

const setStatusSource = html.slice(html.indexOf('async function setStatus'), html.indexOf('async function moveBackJob'));
const linkedSetStatus = setStatusSource.slice(0, setStatusSource.indexOf("    const now = new Date();", setStatusSource.indexOf('      return;')));
assert(linkedSetStatus.indexOf('linkedWorkflowInFlight.add(inFlightKey)') < linkedSetStatus.indexOf('pendingLinkedWorkflowRecovery(j, status)'), 'operation lock is acquired before recovery');
assert(linkedSetStatus.indexOf('pendingLinkedWorkflowRecovery(j, status)') < linkedSetStatus.indexOf('syncProductionStatusToOrder(j, status)'), 'recovery resolves before the authoritative request');
assert.strictEqual((linkedSetStatus.match(/syncProductionStatusToOrder\(j, status\)/g) || []).length, 1, 'linked setStatus has one authoritative request site');
assert.match(linkedSetStatus, /finally\{ linkedWorkflowInFlight\.delete\(inFlightKey\); \}/, 'all outcomes release the pending lock');
assert(linkedSetStatus.indexOf('const authoritative = await syncProductionStatusToOrder(j, status)') < linkedSetStatus.indexOf('state.jobs = state.jobs.map'), 'local state changes only after confirmed success');
assert.match(linkedSetStatus, /stage:'linked_workflow_recovery'/);
assert.match(linkedSetStatus, /Production recovery data could not be read\. No lifecycle change was made\./);
assert.doesNotMatch(linkedSetStatus, /(?:setStatus|syncProductionStatusToOrder)\([^)]*\)[^;]*setTimeout/, 'recovery never automatically replays lifecycle commands');

const delegatedHandler = html.slice(html.indexOf("document.addEventListener('click'"), html.indexOf("document.addEventListener('change'"));
assert.strictEqual((delegatedHandler.match(/if\(st\)\{ const \[id,status\] = st\.split\('\|'\); setStatus\(id,status\); \}/g) || []).length, 1, 'one delegated status handler enters setStatus once');
for(const status of ['printing', 'ready_for_fulfillment', 'ready_to_print']) assert(html.includes(`|${status}`) || html.includes(`,'${status}'`), `${status} action remains wired`);

const ordinaryAllowlist = orders.match(/ORDERS_ADMIN_ORDINARY_EDIT_COLUMNS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
assert(ordinaryAllowlist && !/'status'|'production_status'/.test(ordinaryAllowlist), 'Orders Admin ordinary Save cannot mutate Production lifecycle');

console.log('Production recovery final-composition assertions passed');
