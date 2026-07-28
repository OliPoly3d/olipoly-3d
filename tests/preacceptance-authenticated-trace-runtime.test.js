const assert = require('node:assert/strict');
const http = require('node:http');
const {spawn} = require('node:child_process');

function runTrace(url, body){
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/preacceptance-authenticated-trace.mjs'], {
      env:{...process.env, SUPABASE_URL:url, SUPABASE_ANON_KEY:'public-test-key', SUPABASE_ACCESS_TOKEN:'secret-test-token', PREACCEPTANCE_RPC_BODY:JSON.stringify(body), TRACE_TIMEOUT_MS:'2000'}
    });
    let stdout='', stderr='';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('close', code => resolve({code,stdout,stderr}));
  });
}

(async()=>{
  let requests = 0;
  let received;
  const server = http.createServer((request,response)=>{
    requests++;
    let raw='';
    request.on('data', chunk => raw += chunk);
    request.on('end', ()=>{
      received={url:request.url, authorization:request.headers.authorization, apikey:request.headers.apikey, body:JSON.parse(raw)};
      response.writeHead(200, {'content-type':'application/json'});
      response.end(JSON.stringify([{id:'authoritative-job',production_status:'waiting_customer'}]));
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  const body={p_job_id:'job-id',p_command:'mark_waiting_customer',p_expected_updated_at:'2026-07-28T00:00:00Z',p_payload:{},p_correlation_id:'diagnostic:runtime-test',p_causation_id:'test'};
  const result=await runTrace(`http://127.0.0.1:${address.port}`,body);
  server.close();

  assert.equal(result.code,0);
  assert.equal(requests,1,'diagnostic performs one HTTP request');
  assert.equal(received.url,'/rest/v1/rpc/preacceptance_production_command');
  assert.equal(received.authorization,'Bearer secret-test-token');
  assert.equal(received.apikey,'public-test-key');
  assert.deepEqual(received.body,body);
  assert.doesNotMatch(result.stdout + result.stderr,/secret-test-token|public-test-key/,'credentials are never emitted');
  const output=JSON.parse(result.stdout);
  assert.equal(output.httpStatus,200);
  assert.equal(output.result[0].id,'authoritative-job');
  assert.deepEqual(output.timeline.map(entry=>entry.stage),['fetch_called','response_headers_received','response_body_read_started','response_body_read_completed']);
  console.log('Authenticated trace runtime HTTP assertions passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
