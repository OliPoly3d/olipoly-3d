const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadModule(){
  const path = require.resolve('../js/production-workflow-dispatcher.js');
  delete require.cache[path];
  let n=0;
  global.crypto={randomUUID:()=>`uuid-${++n}`};
  global.setTimeout=setTimeout;
  return require(path);
}
class Container {
  constructor(){this.listeners={};}
  addEventListener(type,fn){(this.listeners[type] ||= []).push(fn);}
  contains(){return true;}
  fire(type,button){
    const event={type,target:button,submitter:button,preventDefault(){this.prevented=true;},stopPropagation(){},stopImmediatePropagation(){}};
    return Promise.all((this.listeners[type]||[]).map(fn=>fn(event)));
  }
}
function button(){
  return {tagName:'BUTTON',disabled:false,dataset:{productionWorkflowJob:'job-1',orderNumber:'OP-000189',workflowStatus:'printing',workflowCommand:'start_print'},closest(){return this;},setAttribute(){},removeAttribute(){}};
}
async function settle(){await new Promise(resolve=>setTimeout(resolve,2));}

(async()=>{
  const dispatcher=loadModule();
  const container=new Container();
  let fetches=0, calls=0, contexts=[];
  const fetch=async()=>{fetches++; return {ok:true};};
  const dispatch=async(_job,_status,context)=>{calls++;contexts.push(context);await fetch('/rest/v1/rpc/production_workflow_command');};
  const first=dispatcher.install({container,dispatch,logger:{info(){}}});
  const second=dispatcher.install({container,dispatch,logger:{info(){}}});
  assert.equal(first,second,'initializing twice returns one installation');
  assert.equal(container.listeners.click.length,1,'one global click listener');
  assert.equal(container.listeners.submit.length,1,'one global submit listener');

  await container.fire('click',button());
  assert.equal(calls,1);assert.equal(fetches,1,'one pointer click creates one actual fetch');
  assert.equal(contexts.length,1);assert.ok(contexts[0].operatorActionId);assert.ok(contexts[0].correlationId);
  await settle();

  await container.fire('click',button()); // keyboard button activation is a click event
  assert.equal(fetches,2,'keyboard activation creates one fetch');
  await settle();
  await container.fire('submit',button());
  assert.equal(fetches,3,'canonical form submission creates one fetch');
  await settle();

  const dual=button();
  await Promise.all([container.fire('click',dual),container.fire('submit',dual)]);
  assert.equal(fetches,4,'click plus submit bubbling creates one fetch');
  await settle();

  let release;
  const slowContainer=new Container();
  let slowFetches=0;
  dispatcher.install({container:slowContainer,logger:{info(){}},dispatch:async()=>{slowFetches++;await new Promise(resolve=>{release=resolve;});}});
  const rapid=button();
  const one=slowContainer.fire('click',rapid);
  await slowContainer.fire('click',rapid);
  assert.equal(slowFetches,1,'rapid double click creates one fetch');
  release();await one;await settle();
  assert.equal(rapid.disabled,false,'button state cleans up');
  assert.equal(dispatcher.pending.size,0,'pending lock cleans up');

  for(const outcome of [400,401,403,409,422,500,504,'network','timeout']){
    const c=new Container();let count=0;
    dispatcher.install({container:c,logger:{info(){}},dispatch:async()=>{count++;throw new Error(String(outcome));}});
    await c.fire('click',button()).catch(()=>{});
    assert.equal(count,1,`${outcome} does not replay the mutation`);
    await settle();
  }
  const html=fs.readFileSync('production-control.html','utf8');
  const migration=fs.readFileSync('supabase/migrations/202608030002_production_workflow_fast_contention.sql','utf8');
  assert.doesNotMatch(html,/data-start-print/,'legacy Start Print route is removed');
  assert.match(html,/retryAuth:false, requestKind:'authoritative-mutation'/,'lifecycle mutation opts out of auth replay');
  assert.match(html,/const replaySafe = \['GET','HEAD'\]/,'generic auth refresh only replays reads');
  assert.doesNotMatch(html,/pendingLinkedWorkflowRecovery[\s\S]{0,500}production_workflow_command/,'recovery has no direct mutation dispatcher');
  assert.match(migration,/set_config\('lock_timeout','2000ms',true\)/);
  assert.match(migration,/pg_advisory_xact_lock[\s\S]*lockScope=command/);
  assert.match(migration,/for update nowait[\s\S]*lockScope=order[\s\S]*for update nowait[\s\S]*lockScope=job/);
  console.log('Production workflow single-dispatch runtime assertions passed (one fetch per operator action)');
})().catch(error=>{console.error(error);process.exitCode=1;});
