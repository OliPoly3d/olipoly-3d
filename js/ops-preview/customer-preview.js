(function(){
  'use strict';
  const V=window.OliPolyCustomerView,M=window.OliPolyOpsPreview,E=window.OliPolyLineItems.escape;
  const app=document.getElementById('customer-app'),message=document.getElementById('customer-message');
  const ownerReturn=document.getElementById('owner-return');
  const returnLink=ownerReturn.querySelector('a');
  const allWork=returnLink.getAttribute('href');
  const params=new URLSearchParams(location.search);
  const cloud=window.OliPolyOpsCloud.create(window.OliPolyOpsTestConfig);
  let state,order,view=params.get('view')||'quote',busy=false;
  async function copyText(value){
    if(navigator.clipboard?.writeText){
      try{await navigator.clipboard.writeText(value);return;}catch{/* Try the user-gesture fallback. */}
    }
    const input=document.createElement('textarea');
    input.value=value;input.readOnly=true;input.style.position='fixed';input.style.left='-9999px';
    document.body.appendChild(input);input.select();
    const copied=document.execCommand('copy');input.remove();
    if(!copied)throw new Error(`Automatic copy is unavailable. Select and copy this value: ${value}`);
  }
  function notice(text,error=false){message.className=error?'alert':'status-line';message.textContent=text;}
  function render(){
    returnLink.href=`ops-order-preview.html?${new URLSearchParams({database:'test',order:order.id,section:M.nextStep(order)[1]})}`;
    const safe=V.project(order);
    app.innerHTML=V.render(safe,view);
    app.inert=busy;
  }
  async function load(){
    ownerReturn.hidden=true;
    returnLink.href=allWork;
    if(!cloud.signedIn()){
      app.innerHTML='<section class="card"><h1>Owner preview sign-in required.</h1><p>Sign in to the existing private OliPoly test workspace, then return to this page. This review route is not a customer link.</p><button data-action="reload">Reload preview</button></section>';
      return;
    }
    ownerReturn.hidden=false;
    state=await cloud.load();
    const id=params.get('order');
    order=id?state.orders.find(o=>o.id===id):state.orders[0];
    if(!order)throw new Error('That project is not available in this test account.');
    if(cloud.pending()){
      app.innerHTML='<section class="card"><h1>A save needs to be resolved.</h1><p>Resolve the earlier test-workspace command before continuing.</p><button data-action="retry">Resolve pending save</button></section>';return;
    }
    render();
  }
  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||busy)return;
    try{
      if(b.dataset.view){view=b.dataset.view;const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);render();return;}
      if(b.dataset.action==='reload'){await load();return;}
      if(b.dataset.action==='retry'){busy=true;try{await cloud.retry();await load();notice('The pending test save is resolved.');}finally{busy=false;app.inert=false;}return;}
      const v=order&&V.project(order);if(!v)return;
      if(b.dataset.action==='print'){window.print();return;}
      if(b.dataset.action==='copy-amount'||b.dataset.action==='copy-reference'){
        const value=b.dataset.action==='copy-amount'?v.balance.toFixed(2):v.reference;
        await copyText(value);notice(`${b.dataset.action==='copy-amount'?'Amount':'Order reference'} copied: ${value}`);return;
      }
      if(b.dataset.method&&v.accepted&&v.balance>0&&!v.business){
        const method={card:'Card / Apple Pay',paypal:'PayPal',venmo:'Venmo'}[b.dataset.method];
        if(!method)return;
        document.getElementById('method-instructions').innerHTML=`<div class="customer-status"><strong>${E(method)}</strong><br>Enter ${V.money(v.balance)} and reference ${E(v.reference)} when the provider allows it. This test preview does not open a provider or collect payment.</div>`;
      }
    }catch(error){notice(error.message,true);}
  });
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='customer-accept')return;event.preventDefault();if(busy)return;
    const data=new FormData(event.target),name=String(data.get('name')||'').trim();
    if(!name||!data.get('confirm')){notice('Enter your name and confirm the quote details.',true);return;}
    if(!order?.quoteOffer||order.snapshot){notice('Reload the current shared quote before accepting.',true);return;}
    busy=true;app.inert=true;
    try{
      const action={type:'approve',method:`Customer quote link — owner test by ${name}; revision ${order.quoteOffer.revision}; scope, price, timing and terms confirmed`};
      const next=M.command(state,order.id,action);
      state=await cloud.save(next.orders.find(o=>o.id===order.id),action,state.revision);
      order=state.orders.find(o=>o.id===order.id);view='track';
      const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url);render();
      notice('Test approval saved to OliPoly ERP Test. The same OP number now appears in the shared production queue awaiting release.');
    }catch(error){notice(error.message,true);if(cloud.pending())app.innerHTML='<section class="card"><h2>Confirm whether your test approval saved.</h2><p>The connection was interrupted. Resolve the same save before trying anything else.</p><button data-action="retry">Resolve pending save</button></section>';}
    finally{busy=false;app.inert=false;}
  });
  load().catch(error=>{app.innerHTML='<section class="card"><h1>Project preview unavailable.</h1><button data-action="reload">Reload preview</button></section>';notice(error.message,true);});
})();
