const assert = require('node:assert/strict');
const fs = require('node:fs');
const handoff = require('../js/production-quote-handoff.js');

function storage(initial = {}){
  const data = new Map(Object.entries(initial));
  return {getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value), removeItem:key => data.delete(key), data};
}
function deferred(){ let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes; reject=no;}); return {promise,resolve,reject}; }
function fixture(push, jobId = 'job-1'){
  const listeners = [];
  const container = {
    contains:() => true,
    addEventListener:(type, fn) => { if(type === 'click') listeners.push(fn); }
  };
  const attributes = new Map();
  const button = {
    dataset:{pushQuote:jobId}, textContent:'Push to Quote', disabled:false,
    closest(selector){ return selector === '.quote-action[' + 'data-push-quote]' ? this : null; },
    setAttribute:(key,value) => attributes.set(key,value), removeAttribute:key => attributes.delete(key)
  };
  const notices = [];
  const controller = handoff.install({container, push, notify:message => notices.push(message)});
  const click = () => {
      const event = {target:button, prevented:false, stopped:false, immediate:false, preventDefault(){this.prevented=true;}, stopPropagation(){this.stopped=true;}, stopImmediatePropagation(){this.immediate=true;}};
    const result = listeners[0](event);
    return {event,result};
  };
  return {container,button,attributes,listeners,notices,controller,click};
}

(async () => {
  // Idle installation, rerenders, storage recovery, and browser lifecycle events do not dispatch.
  let calls = 0;
  const idle = fixture(async () => { calls += 1; });
  assert.equal(calls, 0, 'opening Production Control idle issues no lifecycle command');
  handoff.install({container:idle.container, push:async()=>{calls += 1;}, notify:()=>{}});
  assert.equal(idle.listeners.length, 1, 'a stable container receives exactly one delegated listener');
  for(const type of ['online','visibilitychange','DOMContentLoaded','beforeunload']) assert.equal(idle.container[`on${type}`], undefined);
  assert.equal(calls, 0, 'rerender and lifecycle events cannot replay handoff');

  const flight = deferred();
  const one = fixture(async () => { calls += 1; return flight.promise; });
  const first = one.click();
  const second = one.click();
  assert.equal(first.event.prevented, true);
  assert.equal(first.event.stopped, true);
  assert.equal(first.event.immediate, true);
  assert.equal(calls, 1, 'button.click delegated path and double click produce one command');
  assert.equal(one.button.disabled, true);
  assert.equal(one.attributes.get('aria-busy'), 'true');
  assert.equal(one.controller.pendingJobs.has('job-1'), true);
  flight.resolve();
  await Promise.all([first.result, second.result]);
  assert.equal(one.controller.pendingJobs.size, 0, 'success releases pending lock');
  assert.equal(one.button.disabled, false, 'success restores button');
  assert.equal(one.button.textContent, 'Push to Quote');

  let outcomeIndex = 0;
  for(const outcome of [
    {name:'55P03 contention', error:Object.assign(new Error('lock'), {handoffOutcome:'in_progress'})},
    {name:'40001 stale row', error:Object.assign(new Error('stale'), {handoffOutcome:'stale'})},
    {name:'400 rejection', error:Object.assign(new Error('Rejected'), {handoffOutcome:'validation'})},
    {name:'403 rejection', error:Object.assign(new Error('Forbidden'), {handoffOutcome:'auth'})},
    {name:'504 timeout', error:Object.assign(new Error('upstream request timeout'), {handoffOutcome:'ambiguous'})},
    {name:'network failure', error:new Error('Network unavailable')}
  ]){
    let attempts = 0;
    const failed = fixture(async () => { attempts += 1; throw outcome.error; }, `failed-${++outcomeIndex}`);
    await failed.click().result;
    await Promise.resolve();
    assert.equal(attempts, 1, `${outcome.name} is never retried`);
    assert.equal(failed.controller.pendingJobs.size, 0, `${outcome.name} releases lock`);
    assert.equal(failed.button.disabled, false, `${outcome.name} restores button`);
    if(outcome.name === '504 timeout') assert.equal(failed.notices.at(-1), 'Quote handoff could not be confirmed. Refresh the record before retrying.');
    if(outcome.name === '55P03 contention') assert.equal(failed.notices.at(-1), 'Another Quote handoff is already in progress. Refresh the estimate before retrying.');
    if(outcome.name === '40001 stale row') assert.equal(failed.notices.at(-1), 'This estimate changed since it was loaded. Refresh before retrying.');
  }

  const legacy = storage({[handoff.LEGACY_RECOVERY_KEY]:JSON.stringify({id:'job-1', pending:true, retry_count:4, command_id:'execute-me', linked_quote_draft:{quote_number:'Q-1', queued:true}})});
  handoff.neutralizeLegacyRecovery(legacy);
  const recovered = JSON.parse(legacy.getItem(handoff.LEGACY_RECOVERY_KEY));
  assert.equal(recovered.id, 'job-1', 'recovery data remains');
  assert.equal(recovered.recovery_draft_only, true);
  assert.equal(recovered.pending, undefined);
  assert.equal(recovered.retry_count, undefined);
  assert.equal(recovered.command_id, undefined);
  assert.equal(recovered.linked_quote_draft.queued, undefined, 'nested executable markers are neutralized');
  handoff.neutralizeLegacyRecovery(legacy);
  assert.equal(calls, 1, 'refresh/recovery migration does not dispatch a command');

  const html = fs.readFileSync('production-control.html', 'utf8');
  const sync = html.slice(html.indexOf('async function syncPreAcceptanceProductionStatus'), html.indexOf('function preAcceptanceErrorMessage'));
  assert.match(sync, /retryAuth:false/, 'controlled lifecycle RPC opts out of auth replay');
  assert.match(sync, /clearTimeout\(timeout\)/, 'request timeout timer is always cleared');
  assert.doesNotMatch(sync, /clearCommandIdentity|commandIdentity\(/, 'lower layers neither create nor persist another command identity');
  assert.doesNotMatch(sync, /while|setInterval|retry\(/, 'controlled lifecycle command has no retry loop');
  assert.match(html, /result\.res\.status === 401 && options\.retryAuth !== false/, 'generic auth recovery can be explicitly excluded and never retries 403');
  const patch = html.slice(html.indexOf('async function patchProductionJobHandoff'), html.indexOf('async function pushProductionJobToQuote'));
  assert.doesNotMatch(patch, /transition\(job, 'waiting_customer'/, 'recovery draft does not change local lifecycle');
  assert.doesNotMatch(patch, /quote_handoff_status/, 'recovery draft contains no pending handoff marker');

  const scriptRefs = [...html.matchAll(/<script[^>]+src="([^"]*production-quote-handoff\.js[^"]*)"/g)];
  assert.equal(scriptRefs.length, 1, 'final HTML loads the canonical handoff module once');
  assert.match(scriptRefs[0][1], /\?v=/, 'canonical handoff asset is cache-busted');
  assert.equal((html.match(/document\.addEventListener\('click',[\s\S]{0,180}pushProductionJobToQuote/g) || []).length, 0, 'obsolete inline quote dispatcher is absent');
  assert.match(html, /class="mini-btn quote-action" data-push-quote="\$\{j\.id\}" type="button"/, 'rendered action has canonical class/data hook and non-submit type');

  const layers = {handler:0,push:0,patch:0,sync:0,sbApi:0,fetch:0,rpc:0};
  const identities = [];
  const fullChain = fixture(async (_id, commandContext) => {
    layers.push++; identities.push(commandContext.correlationId);
    layers.patch++;
    layers.sync++;
    layers.sbApi++;
    layers.fetch++;
    layers.rpc++;
  }, 'composed-job');
  layers.handler++;
  await fullChain.click().result;
  assert.deepEqual(layers, {handler:1,push:1,patch:1,sync:1,sbApi:1,fetch:1,rpc:1}, 'final delegated composition is one-to-one at every dispatch layer');
  assert.equal(identities.length, 1, 'one click creates one correlation identity');
  assert.match(identities[0], /^production-quote:composed-job:[0-9a-f-]{36}$/i);
  const otherIdentities = [];
  await fixture(async (_id, context) => otherIdentities.push(context.correlationId), 'unrelated-job').click().result;
  assert.notEqual(otherIdentities[0], identities[0], 'unrelated jobs receive distinct cryptographic identities');

  console.log('Production quote handoff runtime regression assertions passed.');
})();
