(function(){
 'use strict';
 const I=window.OliPolyImport,E=window.OliPolyLineItems.escape,cloud=window.OliPolyOpsCloud.create(window.OliPolyOpsTestConfig);
 const byId=id=>document.getElementById(id),message=byId('import-message');let bundle=null,manifest=null,loaded=null,busy=false,fileVersion=0;
 const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
 const notice=(text,error=false)=>{message.textContent=text;message.className=error?'alert':'status-line';};
 const table=(headers,rows)=>`<div class="finance-report-scroll" tabindex="0"><table class="receipt-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
 function enable(){byId('import-stage').disabled=busy||!bundle||!byId('import-confirm').checked;byId('import-file').disabled=busy;byId('import-confirm').disabled=busy;byId('import-refresh').disabled=busy;}
 async function refresh(){
  if(!cloud.signedIn()){byId('import-auth').hidden=false;return;}
  byId('import-controls').hidden=false;
  const list=await cloud.importList();if(!Array.isArray(list))throw Error('Could not read migration batches.');
  const el=byId('import-batches');el.hidden=false;el.innerHTML=`<h2>Saved staging batches</h2>${list.length?list.map(b=>`<article class="finance-entry"><strong>${E(b.captured_at)}</strong><p>${E(b.source_project)} · ${E(b.staged)} / ${E(b.expected)} records staged · ${Number(b.staged)===Number(b.expected)?'Capture complete; operational import still blocked':'Partial capture; resume with the same file'}</p><button data-import-batch="${E(b.batch_key)}">Review batch</button></article>`).join(''):'<p>No staged batches yet.</p>'}`;
  if(loaded)await open(loaded.batch_key);
 }
 function renderRows(){
  if(!loaded)return;const filter=byId('import-filter').value,search=byId('import-search').value.trim().toLowerCase();
  const rows=loaded.rows.filter(r=>{const kind=Number(r.source_versions)>1?'review':r.plan.disposition;return(filter==='all'||kind===filter)&&[r.table,JSON.stringify(r.source_pk),...(r.plan.reference_labels||[]),...(r.plan.flags||[])].join(' ').toLowerCase().includes(search);});
  byId('import-row-count').textContent=`${rows.length} staged records match this view`;
  byId('import-records').innerHTML=table(['Source table / original key','Original references','Disposition','Review notes'],rows.map(r=>`<tr><th scope="row">${E(r.table)}<br>${E(JSON.stringify(r.source_pk))}</th><td>${E((r.plan.reference_labels||[]).join(', '))}</td><td>${E(Number(r.source_versions)>1?'Changed source · review':r.plan.disposition)}</td><td>${E([...(r.plan.flags||[]),...(Number(r.source_versions)>1?['Multiple captured source versions; earlier evidence retained']:[])].join(' · '))}</td></tr>`));
 }
 async function open(key){
  const result=await cloud.importLoad(key);if(!result||!Array.isArray(result.rows))throw Error('Batch is unavailable to this account.');loaded=result;
  const m=result.manifest,el=byId('import-review');el.hidden=false;
  el.innerHTML=`<h2>Captured legacy evidence</h2><p><strong>${E(result.rows.length)} / ${E(m.record_count)} records staged</strong> · ${E(m.captured_at)}</p><p class="alert">Staging is not an operational import. No staged record appears in sales totals, the production queue or inventory balances. Review flags are unresolved; there is no promotion action on this screen.</p><p class="muted">Source ${E(m.source_project)} · original owner ${E(m.source_owner)}<br>Target ERP Test · ${E(m.target_owner)}<br>Batch ${E(result.batch_key)}</p>
   ${(m.owner_exceptions||[]).length?`<h3>Ownership exceptions · not moved</h3><p>These source rows require a separate ownership decision. They remain in the original source capture.</p>${table(['Table','Original key','Source owner','Reason'],m.owner_exceptions.map(r=>`<tr><th scope="row">${E(r.table)}</th><td>${E(r.pk_text)}</td><td>${E(r.owner)}</td><td>${E(r.reason)}</td></tr>`))}`:''}
   <h3>Captured source financial baseline</h3><p class="muted">Calculated from the source's authoritative effective Finance projection at capture time. It excludes target test samples. These are captured source totals, not imported/live totals or an independent certification of the export.</p>
   ${table(['Year','Transactions','Revenue before tax','Shipping in revenue','Recorded expenses','Sales tax'],(m.baseline?.years||[]).map(r=>`<tr><th scope="row">${E(r.year)}</th><td>${E(r.total.count)}</td><td>${money(r.total.revenue)}</td><td>${money(r.total.shippingRevenue)}</td><td>${money(r.total.expenses)}</td><td>${money(r.total.taxCollected)}</td></tr>`))}
   <h3>Source table counts</h3>${table(['Table','Expected source rows','Staged rows'],m.tables.map(t=>`<tr><th scope="row">${E(t.name)}</th><td>${E(t.count)}</td><td>${E(result.rows.filter(r=>r.table===t.name).length)}</td></tr>`))}
   <h3>Review source records</h3><div class="form-grid"><label>Disposition<select id="import-filter"><option value="all">All</option><option value="review">Needs review</option><option value="inventory_deferred">Inventory deferred</option><option value="historical_only">Historical only</option><option value="stage_only">Staging only</option></select></label><label>Search table, reference or original key<input id="import-search" type="search"></label></div><p id="import-row-count" role="status"></p><div id="import-records"></div>`;
  renderRows();
 }
 byId('import-file').addEventListener('change',async e=>{
  const version=++fileVersion;bundle=null;manifest=null;byId('import-confirm').checked=false;byId('import-file-preview').textContent='';enable();
  try{const file=e.target.files[0];if(!file)return;if(file.size>25000000)throw Error('Export is too large; prepare a reviewed smaller batch.');const candidate=JSON.parse(await file.text()),verified=await I.verify(candidate);if(version!==fileVersion)return;manifest=verified;bundle=candidate;byId('import-file-preview').textContent=`${manifest.record_count} original records · ${manifest.source_project} → ERP Test · ${manifest.captured_at}`;notice('Export checksums verified. Review the target account before staging.');}
  catch(error){if(version!==fileVersion)return;bundle=null;manifest=null;notice(error.message,true);}finally{enable();}
 });
 byId('import-confirm').addEventListener('change',enable);
 byId('import-stage').addEventListener('click',async()=>{
  if(busy||!bundle||!byId('import-confirm').checked)return;busy=true;enable();
  try{let staged=0;const parts=I.chunks(bundle.rows);if(!parts.length)parts.push([]);
   for(const rows of parts){const result=await cloud.importStage(bundle.manifest_text,rows);staged=result.staged;notice(`Stored ${staged} / ${manifest.record_count} records in private staging…`);}
   await refresh();await open(manifest.batch_key);notice('Capture staged. Review conflicts before any separately approved operational import.');
  }catch(error){notice(`${error.message} Completed chunks are retained. Re-select the same prepared file to resume without duplicates.`,true);try{await refresh();}catch{}}
  finally{busy=false;enable();}
 });
 byId('import-refresh').addEventListener('click',async()=>{if(busy)return;try{busy=true;enable();await refresh();notice('Saved staging batches refreshed.');}catch(e){notice(e.message,true);}finally{busy=false;enable();}});
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-import-batch]');if(!b||busy)return;try{await open(b.dataset.importBatch);}catch(error){notice(error.message,true);}});
 document.addEventListener('input',e=>{if(['import-search','import-filter'].includes(e.target.id))renderRows();});
 document.addEventListener('change',e=>{if(e.target.id==='import-filter')renderRows();});
 (async()=>{try{await refresh();}catch(error){notice(error.message,true);}enable();})();
})();
