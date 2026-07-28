#!/usr/bin/env node
// One request, no retry. Supply secrets at runtime; this script never prints them.
import process from 'node:process';

const required = name => {
  const value = process.env[name]?.trim();
  if(!value) throw new Error(`${name} is required at runtime.`);
  return value;
};

const projectUrl = required('SUPABASE_URL').replace(/\/$/, '');
const anonKey = required('SUPABASE_ANON_KEY');
const accessToken = required('SUPABASE_ACCESS_TOKEN');
const rawBody = process.env.PREACCEPTANCE_RPC_BODY;
if(!rawBody) throw new Error('PREACCEPTANCE_RPC_BODY is required as JSON.');
const body = JSON.parse(rawBody);
const expectedKeys = ['p_job_id','p_command','p_expected_updated_at','p_payload','p_correlation_id','p_causation_id'];
if(JSON.stringify(Object.keys(body).sort()) !== JSON.stringify([...expectedKeys].sort())){
  throw new Error(`PREACCEPTANCE_RPC_BODY must contain exactly: ${expectedKeys.join(', ')}`);
}
if(!String(body.p_correlation_id || '').startsWith('diagnostic:')){
  throw new Error('Use a fresh p_correlation_id beginning diagnostic: to activate safe stage tracing.');
}

const url = `${projectUrl}/rest/v1/rpc/preacceptance_production_command`;
const startedAt = performance.now();
const timeline = [{stage:'fetch_called', elapsedMs:0}];
const controller = new AbortController();
const timeoutMs = Number(process.env.TRACE_TIMEOUT_MS || 35000);
const timeout = setTimeout(() => {
  timeline.push({stage:'diagnostic_timeout_fired', elapsedMs:Math.round(performance.now()-startedAt)});
  controller.abort(new Error('Authenticated diagnostic transport timeout.'));
}, timeoutMs);
let response;
try{
  response = await fetch(url, {
    method:'POST',
    headers:{
      apikey:anonKey,
      Authorization:`Bearer ${accessToken}`,
      'Content-Type':'application/json',
      Prefer:'return=representation'
    },
    body:JSON.stringify(body),
    signal:controller.signal
  });
  timeline.push({stage:'response_headers_received', elapsedMs:Math.round(performance.now()-startedAt), httpStatus:response.status});
  timeline.push({stage:'response_body_read_started', elapsedMs:Math.round(performance.now()-startedAt)});
  const text = await response.text();
  timeline.push({stage:'response_body_read_completed', elapsedMs:Math.round(performance.now()-startedAt), bytes:new TextEncoder().encode(text).length});
  let parsed = null;
  try{ parsed = text ? JSON.parse(text) : null; }catch{ parsed = {message:'Non-JSON response body', bodyLength:text.length}; }
  console.log(JSON.stringify({
    requestUrl:url,
    correlationId:body.p_correlation_id,
    timeline,
    totalElapsedMs:Math.round(performance.now()-startedAt),
    httpStatus:response.status,
    ok:response.ok,
    postgresCode:parsed?.code || null,
    message:parsed?.message || null,
    details:parsed?.details || null,
    hint:parsed?.hint || null,
    result:response.ok ? parsed : null
  }, null, 2));
}catch(error){
  timeline.push({stage:'fetch_rejected', elapsedMs:Math.round(performance.now()-startedAt)});
  console.error(JSON.stringify({requestUrl:url, correlationId:body.p_correlation_id, timeline, errorName:error.name, message:error.message}, null, 2));
  process.exitCode=1;
}finally{
  clearTimeout(timeout);
}
