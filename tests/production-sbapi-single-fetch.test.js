const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('production-control.html', 'utf8');
const start = html.indexOf('async function sbApi(path, options = {})');
const end = html.indexOf('\n  function toast(msg)', start);
assert.ok(start > 0 && end > start, 'final Production sbApi implementation is present');
const sbApiSource = html.slice(start, end);

function harness(fetchImplementation){
  let fetches = 0;
  let refreshes = 0;
  const context = {
    window:{OliPolyAuth:{ensure:async()=>{}, refresh:async()=>{refreshes += 1;}, getToken:()=> 'token'}},
    localStorage:{getItem:()=> 'token'},
    fetch:async (...args) => { fetches += 1; return fetchImplementation(...args); },
    JSON, Error
  };
  vm.createContext(context);
  vm.runInContext(`(function(){
    const SUPABASE_URL='https://example.invalid';
    const SUPABASE_KEY='publishable-test-key';
    function token(){ return window.OliPolyAuth?.getToken?.() || null; }
    ${sbApiSource}
    window.testSbApi=sbApi;
  })()`, context);
  return {call:(options={}) => context.window.testSbApi('/rest/v1/rpc/preacceptance_production_command', {method:'POST', ...options}), counts:()=>({fetches,refreshes})};
}
const response = (status, body={}) => ({ok:status >= 200 && status < 300, status, text:async()=>JSON.stringify(body)});

(async()=>{
  for(const status of [400,401,403,409,422,504]){
    const h = harness(async()=>response(status,{message:`HTTP ${status}`}));
    await assert.rejects(h.call({retryAuth:false}));
    assert.deepEqual(h.counts(), {fetches:1,refreshes:0}, `${status} controlled lifecycle failure has one sbApi-to-fetch dispatch and no auth replay`);
  }
  const network = harness(async()=>{ throw Object.assign(new Error('network failure'), {name:'TypeError'}); });
  await assert.rejects(network.call({retryAuth:false}));
  assert.deepEqual(network.counts(), {fetches:1,refreshes:0}, 'network failure is not replayed');
  const aborted = harness(async()=>{ throw Object.assign(new Error('aborted'), {name:'AbortError'}); });
  await assert.rejects(aborted.call({retryAuth:false}));
  assert.deepEqual(aborted.counts(), {fetches:1,refreshes:0}, 'AbortError is not replayed');
  const success = harness(async()=>response(200,[{id:'job-1'}]));
  assert.equal((await success.call({retryAuth:false}))[0].id, 'job-1');
  assert.deepEqual(success.counts(), {fetches:1,refreshes:0}, 'confirmed success uses one fetch');
  const contention = harness(async()=>response(409,{code:'55P03',message:'database detail not for operator UI'}));
  await assert.rejects(contention.call({retryAuth:false}), error => error.code === '55P03' && error.postgresCode === '55P03' && error.status === 409 && error.httpStatus === 409);
  assert.deepEqual(contention.counts(), {fetches:1,refreshes:0}, 'SQLSTATE is preserved for one-request operator classification');
  for(const code of ['40001','22023','42501','23505']){
    const structured = harness(async()=>response(409,{code,message:`server ${code}`,details:'diagnostic details',hint:'diagnostic hint'}));
    await assert.rejects(structured.call({retryAuth:false}), error =>
      error.name !== 'AbortError' && error.postgresCode === code && error.details === 'diagnostic details' && error.hint === 'diagnostic hint');
    assert.deepEqual(structured.counts(), {fetches:1,refreshes:0}, `${code} remains structured and is not retried`);
  }
  const parseOrder = [];
  const ordered = harness(async()=>({ok:true,status:200,text:async()=>{parseOrder.push('body-parsed');return JSON.stringify([{id:'ordered'}]);}}));
  const orderedResult = await ordered.call({retryAuth:false,onResponseReceived:()=>parseOrder.push('response-received')});
  assert.equal(orderedResult[0].id, 'ordered');
  assert.deepEqual(parseOrder, ['response-received','body-parsed'], 'response arrival disarms timeout before body parsing and cleanup');
  console.log('Production controlled sbApi single-fetch assertions passed.');
})();
