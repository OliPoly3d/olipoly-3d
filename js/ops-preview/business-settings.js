(function () {
  'use strict';
  const M=window.OliPolyBusinessSettings,E=window.OliPolyLineItems.escape,cloud=window.OliPolyOpsCloud.create(window.OliPolyOpsTestConfig);
  const app=document.querySelector('[data-settings-app]'),message=document.getElementById('message');
  let workspace=null,busy=false;
  const names={laborRate:'Hands-on labor ($/hour)',planningRate:'Planning printer cost ($/hour)',p1sRate:'P1S operating cost ($/hour)',p2sRate:'P2S operating cost ($/hour)',targetMargin:'Target margin (%)',headquarters:'Default mileage starting location',mileageRate:'Custom mileage default ($/mile)',officeSqft:'Office area (sq. ft.)',homeSqft:'Home area (sq. ft.)',consumerTerms:'Consumer payment terms',businessTerms:'Business / PO payment terms'};
  function notice(text,error=false) { message.textContent=text;message.className=error?'alert error-live':'status-line error-live'; }
  function field(key,value,type='number') {
    const max=key==='targetMargin'?99.99:key==='mileageRate'?100:['homeSqft','officeSqft'].includes(key)?1000000:100000;
    return `<label>${names[key]}<input name="${key}" type="${type}" value="${E(value)}" ${type==='text'?'maxlength="120"':`min="0" max="${max}" step="${key==='mileageRate'?'.0001':'.01'}"`} required></label>`;
  }
  function history() {
    return (workspace.settingsHistory||[]).map(item=>`<details><summary>${E(item.at)} · ${E(item.reason)}</summary>${Object.keys(item.after).filter(key=>JSON.stringify(item.before[key])!==JSON.stringify(item.after[key])).map(key=>`<div class="row"><span>${E(names[key]||key)}</span><span>${E(item.before[key]??'Not set')} → ${E(item.after[key])}</span></div>`).join('')}<p class="muted">${E(item.command)}</p></details>`).join('')||'<p>No shared settings have been saved.</p>';
  }
  function render() {
    if (!cloud.signedIn()) { app.innerHTML='<section class="card"><h1>Business settings</h1><p>Sign in to your ERP Test workspace first.</p><a class="button" href="ops-preview.html?database=test">Open ERP sign-in</a></section>';return; }
    if (!workspace) { app.innerHTML='<section class="card"><h1>Business settings unavailable</h1><button data-action="reload">Reload shared settings</button></section>';return; }
    const s=workspace.settings||M.defaults;
    app.innerHTML=`<header class="page-head"><div><div class="eyebrow">Your working studio</div><h1>Business settings</h1><p class="muted">Shared defaults for new work. Existing quotes, agreed prices and recorded expenses keep their saved values.</p></div><button data-action="reload">Reload settings</button></header>
      ${cloud.pending()?'<section class="alert"><p>A save is awaiting confirmation.</p><button data-action="retry">Retry the same pending save</button></section>':''}
      <section class="card"><form id="business-settings-form" class="form-grid">
      <h2 class="full">Cost and pricing assumptions</h2>${['laborRate','planningRate','p1sRate','p2sRate','targetMargin'].map(key=>field(key,s[key])).join('')}
      <p class="muted full">Printer rates include your chosen electricity, maintenance and equipment reserve. Labor is your internal cost assumption. Target margin suggests revenue before tax; it does not change selling prices automatically.</p>
      <h2 class="full">Mileage</h2><div class="full">${field('headquarters',s.headquarters,'text')}</div>
      <label>Mileage default<select name="mileageMode"><option value="irs" ${s.mileageMode==='irs'?'selected':''}>IRS business rate by trip date</option><option value="custom" ${s.mileageMode==='custom'?'selected':''}>Custom business default</option></select></label>${field('mileageRate',s.mileageRate)}
      <p class="muted full">The rate and starting location remain editable on each new trip. Existing mileage records retain their original rate and origin.</p>
      <h2 class="full">Home-office reference</h2>${field('officeSqft',s.officeSqft)}${field('homeSqft',s.homeSqft)}<p id="office-percent" class="full" role="status"></p><p class="muted full">Floor-area reference only. Saving these values does not create a deduction or expense entry.</p>
      <h2 class="full">Payment terms</h2>${field('consumerTerms',s.consumerTerms,'text')}${field('businessTerms',s.businessTerms,'text')}
      <label class="full">Reason for changing shared defaults<textarea name="reason" required minlength="3" maxlength="500"></textarea></label>
      <div class="actions full"><button class="primary" type="submit" ${cloud.pending()?'disabled':''}>Save shared defaults</button><button type="button" data-action="import">Import legacy settings from this device</button></div>
      <p class="muted full">Legacy import fills this form for review. Save to make it shared. The original Finance Pro settings are preserved.</p></form></section>
      <section class="card"><h2>Recent settings history</h2><p class="muted">Last 20 changes shown. Every saved change retains its command receipt.</p>${history()}</section>`;
    preview();
  }
  function preview() {
    const f=document.getElementById('business-settings-form');if(!f)return;
    f.elements.mileageRate.readOnly=f.elements.mileageMode.value!=='custom';
    const o=Number(f.elements.officeSqft.value),h=Number(f.elements.homeSqft.value);
    document.getElementById('office-percent').textContent=h>0&&o<=h?`Office share by floor area · ${M.officePercent({officeSqft:o,homeSqft:h})}%`:'Enter both floor areas, or leave both zero if unused.';
  }
  async function load() { workspace=await cloud.load(); }
  app.addEventListener('input',preview);app.addEventListener('change',preview);
  app.addEventListener('submit',async event=>{
    if(event.target.id!=='business-settings-form')return;event.preventDefault();if(busy)return;
    try {
      const values=Object.fromEntries(new FormData(event.target)),settings=M.validate(values),reason=String(values.reason||'').trim();
      if(reason.length<3)throw Error('Enter a reason for this settings change.');
      busy=true;app.inert=true;workspace=await cloud.settingsSave(settings,workspace.revision,reason);render();notice('Shared business defaults saved. New work uses these values.');
    } catch(error) { notice(error.message,true);if(cloud.pending())render(); }
    finally { busy=false;app.inert=false; }
  });
  app.addEventListener('click',async event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;if(!action||busy)return;
    try {
      if(action==='import') {
        const raw=localStorage.getItem('olipoly_finance_settings_v1');
        if(!raw)throw Error('No Finance Pro defaults were found on this device. Import from the browser where they were saved, or enter them here.');
        const s=M.legacy(raw),f=document.getElementById('business-settings-form');
        for(const key of ['mileageMode','mileageRate','officeSqft','homeSqft'])f.elements[key].value=s[key];
        f.elements.reason.value='Import legacy Finance Pro defaults';preview();notice('Legacy mileage and office defaults loaded for review. Save to share them.');return;
      }
      busy=true;app.inert=true;if(action==='retry')workspace=await cloud.retry();else await load();render();notice('Shared workspace refreshed.');
    } catch(error) { notice(error.message,true); } finally { busy=false;app.inert=false; }
  });
  (async()=>{if(cloud.signedIn())try{await load();}catch(error){notice(error.message,true);}render();})();
})();
