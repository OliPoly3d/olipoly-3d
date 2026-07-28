const assert = require('node:assert/strict');

// Executable model of the migration's two independent transaction try-locks.
// The real PostgreSQL two-session acceptance procedure remains mandatory.
class CommandBoundary {
  constructor(jobs){ this.jobs = new Map(jobs.map(j => [j.id, {...j}])); this.receipts = new Map(); this.jobLocks = new Set(); this.commandLocks = new Set(); }
  async execute({jobId, commandId, command='mark_waiting_customer', expectedUpdatedAt, owner='owner-1', hold=Promise.resolve()}){
    if(this.jobLocks.has(jobId)) throw Object.assign(new Error('same-job contention'), {code:'55P03'});
    this.jobLocks.add(jobId);
    if(this.commandLocks.has(commandId)){ this.jobLocks.delete(jobId); throw Object.assign(new Error('identity contention'), {code:'55P03'}); }
    this.commandLocks.add(commandId);
    try{
      const receipt = this.receipts.get(commandId);
      if(receipt){
        if(receipt.owner !== owner || receipt.jobId !== jobId || receipt.command !== command) throw Object.assign(new Error('identity conflict'), {code:'23505'});
        return {...this.jobs.get(jobId), idempotent:true};
      }
      const before = this.jobs.get(jobId);
      if(!before || before.owner !== owner) throw Object.assign(new Error('ownership'), {code:'42501'});
      if(before.orderNumber) throw Object.assign(new Error('linked order'), {code:'22023'});
      if(!['estimate','waiting_customer'].includes(before.status) || before.actualEvidence) throw Object.assign(new Error('lifecycle/evidence'), {code:'22023'});
      if(before.updatedAt !== expectedUpdatedAt) throw Object.assign(new Error('optimistic conflict'), {code:'40001'});
      if(!['mark_waiting_customer','return_to_estimate'].includes(command)) throw Object.assign(new Error('invalid command'), {code:'22023'});
      await hold;
      const updated = {...before, status:command === 'mark_waiting_customer' ? 'waiting_customer' : 'estimate', updatedAt:`updated:${commandId}`};
      // The row and receipt become visible together, modeling one SQL transaction.
      this.jobs.set(jobId, updated);
      this.receipts.set(commandId, {owner,jobId,command,result:{...updated}});
      return {...updated, idempotent:false};
    } finally { this.commandLocks.delete(commandId); this.jobLocks.delete(jobId); }
  }
}
function deferred(){ let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; }

(async()=>{
  const boundary = new CommandBoundary([
    {id:'job-a',owner:'owner-1',status:'estimate',updatedAt:'t1',actualEvidence:false},
    {id:'job-b',owner:'owner-1',status:'estimate',updatedAt:'t1',actualEvidence:false},
    {id:'job-evidence',owner:'owner-1',status:'estimate',updatedAt:'t1',actualEvidence:true},
    {id:'job-order',owner:'owner-1',status:'estimate',updatedAt:'t1',actualEvidence:false,orderNumber:'OP-1'}
  ]);
  const gate = deferred();
  const commandA = boundary.execute({jobId:'job-a',commandId:'cmd-a',expectedUpdatedAt:'t1',hold:gate.promise});
  await Promise.resolve();
  const started = Date.now();
  await assert.rejects(boundary.execute({jobId:'job-a',commandId:'cmd-b',expectedUpdatedAt:'t1'}), error => error.code === '55P03');
  assert.ok(Date.now() - started < 100, 'same-job contention fails immediately rather than approaching client timeout');
  assert.equal(boundary.jobs.get('job-a').status, 'estimate', 'lock failure leaves row unchanged');
  assert.equal(boundary.receipts.has('cmd-b'), false, 'lock failure inserts no receipt');
  const differentJob = await boundary.execute({jobId:'job-b',commandId:'cmd-c',expectedUpdatedAt:'t1'});
  assert.equal(differentJob.status, 'waiting_customer', 'different jobs proceed while job A is held');
  gate.resolve();
  const success = await commandA;
  assert.equal(success.status, 'waiting_customer');
  assert.equal(boundary.receipts.size, 2, 'each successful update has exactly one atomic receipt');
  const replay = await boundary.execute({jobId:'job-a',commandId:'cmd-a',expectedUpdatedAt:'t1'});
  assert.equal(replay.idempotent, true, 'completed matching command replays deterministically');
  await assert.rejects(boundary.execute({jobId:'job-b',commandId:'cmd-a',expectedUpdatedAt:'updated:cmd-c'}), error => error.code === '23505');
  await assert.rejects(boundary.execute({jobId:'job-b',commandId:'stale',expectedUpdatedAt:'old'}), error => error.code === '40001');
  await assert.rejects(boundary.execute({jobId:'job-evidence',commandId:'evidence',expectedUpdatedAt:'t1'}), error => error.code === '22023');
  await assert.rejects(boundary.execute({jobId:'job-order',commandId:'order',expectedUpdatedAt:'t1'}), error => error.code === '22023');
  await assert.rejects(boundary.execute({jobId:'job-b',commandId:'owner',expectedUpdatedAt:'updated:cmd-c',owner:'owner-2'}), error => error.code === '42501');
  await assert.rejects(boundary.execute({jobId:'job-b',commandId:'invalid',command:'close',expectedUpdatedAt:'updated:cmd-c'}), error => error.code === '22023');
  console.log('Pre-acceptance job concurrency executable-model assertions passed.');
})();
