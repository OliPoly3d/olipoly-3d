const assert = require('node:assert/strict');
const fs = require('node:fs');
const handoff = require('../js/production-quote-handoff.js');

function storage(initial = {}){
  const data = new Map(Object.entries(initial));
  return {getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value), removeItem:key => data.delete(key), data};
}
function deferred(){ let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes; reject=no;}); return {promise,resolve,reject}; }
function fixture(push){
  const listeners = [];
  const container = {
    contains:() => true,
    addEventListener:(type, fn) => { if(type === 'click') listeners.push(fn); }
  };
  const attributes = new Map();
  const button = {
    dataset:{pushQuote:'job-1'}, textContent:'Push to Quote', disabled:false,
    closest(selector){ return selector === '.quote-action[' + 'data-push-quote]' ? this : null; },
    setAttribute:(key,value) => attributes.set(key,value), removeAttribute:key => attributes.delete(key)
  };
  const notices = [];
  const controller = handoff.install({container, push, notify:message => notices.push(message)});
  const click = () => {
    const event = {target:button, prevented:false, stopped:false, preventDefault(){this.prevented=true;}, stopPropagation(){this.stopped=true;}};
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
  assert.equal(calls, 1, 'button.click delegated path and double click produce one command');
  assert.equal(one.button.disabled, true);
  assert.equal(one.attributes.get('aria-busy'), 'true');
  assert.equal(one.controller.pendingJobs.has('job-1'), true);
  flight.resolve();
  await Promise.all([first.result, second.result]);
  assert.equal(one.controller.pendingJobs.size, 0, 'success releases pending lock');
  assert.equal(one.button.disabled, false, 'success restores button');
  assert.equal(one.button.textContent, 'Push to Quote');

  for(const outcome of [
    {name:'400 rejection', error:Object.assign(new Error('Rejected'), {handoffOutcome:'validation'})},
    {name:'403 rejection', error:Object.assign(new Error('Forbidden'), {handoffOutcome:'auth'})},
    {name:'504 timeout', error:Object.assign(new Error('upstream request timeout'), {handoffOutcome:'ambiguous'})},
    {name:'network failure', error:new Error('Network unavailable')}
  ]){
    let attempts = 0;
    const failed = fixture(async () => { attempts += 1; throw outcome.error; });
    await failed.click().result;
    await Promise.resolve();
    assert.equal(attempts, 1, `${outcome.name} is never retried`);
    assert.equal(failed.controller.pendingJobs.size, 0, `${outcome.name} releases lock`);
    assert.equal(failed.button.disabled, false, `${outcome.name} restores button`);
    if(outcome.name === '504 timeout') assert.equal(failed.notices.at(-1), 'Quote handoff could not be confirmed. Refresh the record before retrying.');
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
  assert.match(sync, /clearCommandIdentity[\s\S]*await sbApi[\s\S]*finally[\s\S]*clearCommandIdentity/, 'command identity is not retained as retry state');
  assert.doesNotMatch(sync, /while|setInterval|retry\(/, 'controlled lifecycle command has no retry loop');
  assert.match(html, /result\.res\.status === 401 && options\.retryAuth !== false/, 'generic auth recovery can be explicitly excluded and never retries 403');
  const patch = html.slice(html.indexOf('async function patchProductionJobHandoff'), html.indexOf('async function pushProductionJobToQuote'));
  assert.doesNotMatch(patch, /transition\(job, 'waiting_customer'/, 'recovery draft does not change local lifecycle');
  assert.doesNotMatch(patch, /quote_handoff_status/, 'recovery draft contains no pending handoff marker');

  console.log('Production quote handoff runtime regression assertions passed.');
})();
