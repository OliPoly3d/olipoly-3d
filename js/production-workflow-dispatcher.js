(function(root, factory){
  const key = typeof Symbol === 'function' ? Symbol.for('olipoly.productionWorkflowDispatcher') : '__olipolyProductionWorkflowDispatcher';
  const api = root?.[key] || factory(root);
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root){ root[key] = api; root.OliPolyProductionWorkflowDispatcher = api; }
})(typeof window !== 'undefined' ? window : globalThis, function(root){
  'use strict';
  const installationKey = typeof Symbol === 'function' ? Symbol.for('olipoly.productionWorkflowDispatcher.installation') : '__olipolyProductionWorkflowDispatcherInstallation';
  const pending = new Set();
  const recent = new Set();

  function uuid(){
    if(typeof root?.crypto?.randomUUID !== 'function') throw new Error('Secure workflow action identity generation is unavailable.');
    return root.crypto.randomUUID();
  }
  function details(event, button, identities, dispatcherName){
    return {
      operatorActionId:identities.operatorActionId,
      eventType:event.type,
      eventTarget:event.target?.tagName || event.target?.nodeName || 'unknown',
      handlerInstallationIdentity:identities.handlerInstallationIdentity,
      jobId:button.dataset.productionWorkflowJob,
      orderNumber:button.dataset.orderNumber || null,
      command:button.dataset.workflowCommand,
      correlationId:identities.correlationId,
      causationId:identities.causationId,
      dispatcherName,
      callStack:new Error('Production workflow dispatch trace').stack,
      timestamp:new Date().toISOString(),
      fetchOrdinal:0
    };
  }
  function install({container=root?.document, dispatch, notify=()=>{}, logger=root?.console}){
    if(!container?.addEventListener) throw new Error('A workflow event container is required.');
    if(typeof dispatch !== 'function') throw new Error('The authoritative workflow function is required.');
    if(container[installationKey]) return container[installationKey];
    const handlerInstallationIdentity = `production-workflow-listener:${uuid()}`;
    const dispatcherName = 'OliPolyProductionWorkflowDispatcher.dispatchOnce';
    async function handle(event){
      const eventTarget = event.type === 'submit' ? event.submitter : event.target;
      const button = eventTarget?.closest?.('[data-production-workflow-job]');
      if(!button || (container.contains && !container.contains(button))) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      const jobId = String(button.dataset.productionWorkflowJob || '').trim();
      const status = String(button.dataset.workflowStatus || '').trim();
      const command = String(button.dataset.workflowCommand || '').trim();
      const lockKey = `${jobId}:${command}`;
      if(!jobId || !status || !command){ notify('Workflow action identity is incomplete.'); return; }
      if(pending.has(lockKey) || recent.has(lockKey)){ notify('Workflow command already in progress.'); return; }
      pending.add(lockKey); // Lock before creating any action/correlation identity.
      recent.add(lockKey);
      button.disabled = true;
      button.setAttribute?.('aria-busy','true');
      const operatorActionId = uuid();
      const correlationId = `production-workflow:${operatorActionId}`;
      const causationId = `operator-action:${operatorActionId}`;
      const identities = {operatorActionId,correlationId,causationId,handlerInstallationIdentity};
      const trace = details(event,button,identities,dispatcherName);
      let fetchCount = 0;
      identities.claimFetchOrdinal = () => {
        fetchCount += 1;
        if(fetchCount !== 1) throw new Error('Duplicate Production workflow fetch blocked.');
        return fetchCount;
      };
      logger?.info?.('[OliPolyERP] Production workflow dispatch',trace);
      try{
        await dispatch(jobId,status,{...identities,command,trace}); // Exactly one supplied mutation invocation.
      } finally {
        pending.delete(lockKey);
        root.setTimeout?.(()=>recent.delete(lockKey),0);
        button.disabled = false;
        button.removeAttribute?.('aria-busy');
      }
    }
    container.addEventListener('click',handle);
    container.addEventListener('submit',handle);
    const installation = Object.freeze({handlerInstallationIdentity,dispatcherName,handle,pending});
    Object.defineProperty(container,installationKey,{value:installation,configurable:false});
    return installation;
  }
  return Object.freeze({install,pending});
});
