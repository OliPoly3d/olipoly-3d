(function(root){
  'use strict';
  function create({cloud,host,getEntries,ledgerError,refresh,notice}){
    const T=root.OliPolyTaxFilings,M=root.OliPolyOpsFinance,E=root.OliPolyLineItems.escape;
    const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value||0));
    const initial=T.defaultPeriod();let range=T.period(initial.year,initial.selection),selection=initial.selection,events=[],error='',busy=false,loaded=false,action='return';
    const panel=()=>host.querySelector('#tax-filings');
    const context=()=>({...range,...T.summarize(events,getEntries(),range.start,range.end),entries:getEntries()});
    const input=(label,name,value='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${E(value)}" ${extra}></label>`;
    const option=(value,label,selected)=>`<option value="${E(value)}" ${value===selected?'selected':''}>${E(label)}</option>`;
    const evidence=link=>/^https:\/\/[^\s]+$/i.test(link||'')?`<a href="${E(link)}" target="_blank" rel="noopener noreferrer">Open document</a>`:'No document link';
    const table=(headers,rows)=>`<div class="finance-report-scroll" tabindex="0"><table class="receipt-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    async function load(){
      try{if(!cloud.taxLoad)throw Error('Tax filing history is unavailable in this build.');const result=await cloud.taxLoad();if(!Array.isArray(result))throw Error('Could not read tax filing history.');events=result;error='';loaded=true;}
      catch(e){error=e.message;loaded=false;}
      render();
    }
    function form(c){
      const p=c.filed?.payload||{},returnAction=action==='return',payment=['payment','refund'].includes(action);
      return `<form id="tax-history-form" class="form-grid"><label>Action<select name="kind">${[['return','Record filed return / amendment'],['payment','Record tax payment'],['refund','Record refund received'],['void_payment','Void incorrect payment record'],['void_return','Void incorrect return record']].map(([v,l])=>option(v,l,action)).join('')}</select></label>
        ${returnAction?`<label>Return record type<select name="return_type">${(c.filed?[['amendment','Filed amendment · complete revised amounts'],['record_correction','Correct this ERP record · preserve history']]:[['original','Original filed return']]).map(([v,l])=>option(v,l,c.filed?'amendment':'original')).join('')}</select></label>
        ${input('Date filed externally','filed_on',p.filed_on||T.today(),'date','required')}
        ${input('Return/payment due date · editable','due_on',p.due_on||range.due||'','date','required')}
        ${input('Tax reported before discount / credits','reported_tax',p.reported_tax??c.current.total.taxCollected,'number','min="0" step="0.01" required')}
        ${input('Timely-filing discount actually claimed','discount',p.discount||0,'number','min="0" step="0.01" required')}
        ${input('Additional charges / interest / penalties','charges',p.charges||0,'number','min="0" step="0.01" required')}
        ${input('Other credits applied','credits',p.credits||0,'number','min="0" step="0.01" required')}
        <div class="full"><p id="tax-return-preview" class="status-line"></p></div>
        <label class="full">Reconciliation / adjustment explanation<textarea name="review_note" maxlength="2000">${E(p.review_note||'')}</textarea></label>`:''}
        ${payment?`${input(action==='refund'?'Refund received':'Payment amount','amount',action==='payment'&&c.balance>0?c.balance:'','number','min="0.01" step="0.01" required')}${input(action==='refund'?'Refund received date':'Payment date','paid_on',T.today(),'date','required')}`:''}
        ${returnAction||payment?`${input('External confirmation / reference','confirmation','','text','maxlength="200" required')}${input('Return, payment or receipt document link','document_link','','url','placeholder="https://…" maxlength="1000"')}<label class="full"><input type="checkbox" name="confirmed" value="yes" required> I confirm this ${returnAction?'return was filed':action==='refund'?'refund was received':'payment was made'} externally.</label>`:''}
        ${action==='void_payment'?`<label class="full">Payment/refund record to void<select name="target_id" required>${c.payments.map(row=>option(row.id,`${row.payload.paid_on} · ${row.kind} · ${money(row.payload.amount)} · ${row.payload.confirmation}`,'')).join('')}</select></label>`:''}
        ${action==='void_return'?'<p class="full">This only voids an incorrect ERP record. It does not cancel a filed state return. Net recorded payments must be zero.</p>':''}
        <label class="full">Reason / notes<textarea name="reason" required minlength="3" maxlength="500"></textarea></label>
        <button class="primary" type="submit" ${cloud.taxPending?.()?'disabled':''}>Save tax history record</button>
        <p class="muted full">Record completed actions here; nothing is filed or paid through this app. Sales-tax remittances are tracked separately from business expenses and do not reduce sales revenue. Review discounts, credits and additional charges separately during bookkeeping reconciliation; no income or expense entry is automatically posted.</p></form>`;
    }
    function preview(){
      const f=panel()?.querySelector('#tax-history-form'),out=panel()?.querySelector('#tax-return-preview');if(!f||!out)return;
      const n=key=>Number(f.elements[key]?.value||0);
      out.textContent=`Net return amount: ${money((Math.round(n('reported_tax')*100)-Math.round(n('discount')*100)+Math.round(n('charges')*100)-Math.round(n('credits')*100))/100)} · Reported tax minus current recorded tax: ${money((Math.round(n('reported_tax')*100)-Math.round(context().current.total.taxCollected*100))/100)}`;
    }
    function render(){
      const el=panel();if(!el)return;
      const opened=el.querySelector('details')?.open;
      if(error||ledgerError()){el.innerHTML=`<h2>Sales-tax filing &amp; payments</h2><p class="alert">${E(error||ledgerError())}</p><button data-tax-action="reload">Refresh filing history</button>`;return;}
      if(!loaded){el.innerHTML='<h2>Sales-tax filing &amp; payments</h2><p>Load financial records to review filing history.</p>';return;}
      let c;try{c=context();}catch(e){el.innerHTML=`<p class="alert">${E(e.message)}</p>`;return;}
      const p=c.filed?.payload;
      el.innerHTML=`<details ${opened?'open':''}><summary>Sales-tax filing &amp; payments</summary>
        <p>Ohio sales tax · semiannual suggested. Use the filing schedule assigned to your vendor account. <a href="https://tax.ohio.gov/business/sales-and-use-tax/sales-and-use-tax" target="_blank" rel="noopener noreferrer">Ohio filing guidance</a></p>
        <div class="form-grid">${input('Filing year','tax_year',range.start.slice(0,4),'number','min="2000" max="9998"')}
        <label>Suggested period<select name="tax_period">${[['H1','January–June'],['H2','July–December'],...Array.from({length:12},(_,i)=>[String(i+1),new Date(2026,i,1).toLocaleString('en-US',{month:'long'})])].map(([v,l])=>option(v,l,selection)).join('')}</select></label>
        <button type="button" data-tax-action="preset">Use selected period</button>
        ${input('Period start','tax_start',range.start,'date')}${input('Period end','tax_end',range.end,'date')}<button type="button" data-tax-action="period">Review dates</button></div>
        <p class="muted">Due-date suggestions use the 23rd of the following month and move weekends to Monday. Verify holidays, extensions and the actual portal due date before saving. Discounts and credits default to zero; enter amounts actually claimed.</p>
        <p><strong>${E(c.status)}</strong>${p?` · due ${E(p.due_on)}`:''}</p>
        ${c.overdue?'<p class="alert">Payment is outstanding after the recorded due date. Review the state account.</p>':''}
        ${!c.filed&&range.due&&range.due<T.today()?'<p class="alert">No filed return is recorded for this period and its suggested due date has passed. Review filing status, including zero-sales periods.</p>':''}
        ${c.changed?'<p class="alert">Finance records changed after this return snapshot, possibly including county allocation. Review whether an amendment is needed. Saved filed amounts remain unchanged.</p>':''}
        <div class="grid finance-report-metrics">${[['Current tax recorded',c.current.total.taxCollected],['Tax reported',p?.reported_tax||0],['Net return amount',c.due],['Payments less refunds',c.paid],['Outstanding / (overpayment)',c.balance]].map(([l,v])=>`<div class="metric"><span>${l}</span><strong>${money(v)}</strong></div>`).join('')}</div>
        ${c.current.warnings.length?`<div class="alert"><ul>${c.current.warnings.map(w=>`<li>${E(w)}</li>`).join('')}</ul></div>`:''}
        <h3>Current county worksheet</h3>${table(['County / rate','Gross sales','Exempt sales','Tax recorded'],c.current.counties.map(row=>`<tr><th scope="row">${E(row.name)} · ${E(row.rate)}%</th><td>${money(row.grossSales)}</td><td>${money(row.exemptSales)}</td><td>${money(row.taxCollected)}</td></tr>`))}
        ${c.frozen?`<details><summary>Saved filing worksheet · ${E(p.filed_on)}</summary><p>Tax recorded at capture: ${money(c.frozen.total.taxCollected)} · Tax reported: ${money(p.reported_tax)} · ${E(p.review_note)}</p>${table(['County / rate','Gross sales','Exempt sales','Tax recorded at capture'],c.frozen.counties.map(row=>`<tr><th scope="row">${E(row.name)} · ${E(row.rate)}%</th><td>${money(row.grossSales)}</td><td>${money(row.exemptSales)}</td><td>${money(row.taxCollected)}</td></tr>`))}</details>`:''}
        ${cloud.taxPending?.()?'<p class="alert">A tax history save is awaiting confirmation. Check the same command before entering anything again.</p><button data-tax-action="retry">Check pending tax save</button>':form(c)}
        <div class="actions"><button data-tax-action="reload">Refresh history</button><button data-tax-action="export">Export selected history</button></div>
        <details><summary>Period history · ${c.rows.length}</summary>${c.rows.map(row=>`<article class="finance-entry"><strong>${E(row.kind==='return'?row.payload.return_type:row.kind)} · ${E(row.payload.filed_on||row.payload.paid_on||row.created_at)}</strong><p>${E(row.payload.confirmation||'')} · ${E(row.payload.reason)}</p>${row.kind==='return'?`<p>Tax reported ${money(row.payload.reported_tax)} · Discount ${money(row.payload.discount)} · Charges ${money(row.payload.charges)} · Credits ${money(row.payload.credits)}</p><p>${E(row.payload.review_note)}</p><button data-tax-action="source" data-event-id="${E(row.id)}">Export saved source worksheet</button>`:row.payload.amount?`<p>${money(row.payload.amount)}${c.voids.has(row.id)?' · voided record':''}</p>`:''}<p>${evidence(row.payload.document_link)}</p><p class="muted">Event ${E(row.id)} · ${E(row.created_at)}</p></article>`).join('')||'<p>No saved events for this period.</p>'}</details>
        <h3>Other recorded periods</h3>${[...new Map(events.map(e=>[`${e.period_start}|${e.period_end}`,e])).values()].sort((a,b)=>b.period_start.localeCompare(a.period_start)).map(e=>{const status=T.summarize(events,getEntries(),e.period_start,e.period_end);return `<p><button data-tax-action="open" data-start="${E(e.period_start)}" data-end="${E(e.period_end)}">${E(e.period_start)} – ${E(e.period_end)}</button> ${E(status.status)} · ${money(status.balance)}${status.overdue?" · overdue payment":""}${status.changed?" · source changed":""}</p>`;}).join(' ')||'<p>No recorded periods.</p>'}</details>`;
      preview();
    }
    function download(rows,fields,name){const url=URL.createObjectURL(new Blob([M.csv(rows,fields)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    host.addEventListener('change',e=>{if(e.target.closest('#tax-history-form')&&e.target.name==='kind'){action=e.target.value;render();} });
    host.addEventListener('input',e=>{if(e.target.closest('#tax-history-form'))preview();});
    host.addEventListener('submit',async e=>{
      if(e.target.id!=='tax-history-form')return;e.preventDefault();if(busy)return;
      let saved=false;
      try{if(error||ledgerError()||!loaded)throw Error('Refresh financial records and filing history first.');const params=T.prepare(Object.fromEntries(new FormData(e.target)),context());busy=true;e.target.inert=true;await cloud.taxSave(params);saved=true;await refresh();render();notice('Tax history saved. No external filing or payment was submitted.');}
      catch(err){notice(saved?'Tax record saved. Refresh before recording another action.':err.message,true);if(cloud.taxPending?.())render();}
      finally{busy=false;const f=panel()?.querySelector('form');if(f)f.inert=false;}
    });
    host.addEventListener('click',async e=>{
      const button=e.target.closest('[data-tax-action]');if(!button||busy)return;
      const type=button.dataset.taxAction;
      try{
        if(type==='preset'){selection=panel().querySelector('[name="tax_period"]').value;range=T.period(panel().querySelector('[name="tax_year"]').value,selection);render();}
        if(type==='period'){const start=panel().querySelector('[name="tax_start"]').value,end=panel().querySelector('[name="tax_end"]').value;root.OliPolyOpsFinanceReports.summarizeRange([],start,end);range={start,end,due:''};render();}
        if(type==='open'){range={start:button.dataset.start,end:button.dataset.end,due:''};render();}
        if(type==='reload'){busy=true;await refresh();render();}
        if(type==='retry'){busy=true;await cloud.taxRetry();await refresh();render();notice('Pending tax command confirmed.');}
        if(['export','source'].includes(type)){
          if(error||ledgerError()||!loaded)throw Error('Refresh successfully before exporting.');
          const c=context();
          if(type==='export')download(c.rows.map(row=>({...row,...row.payload,source_tax:row.kind==='return'?root.OliPolyOpsFinanceReports.summarizeRange(row.source,range.start,range.end).total.taxCollected:'',voided:c.voids.has(row.id)})),['id','event_no','period_start','period_end','kind','return_type','filed_on','paid_on','due_on','reported_tax','source_tax','discount','charges','credits','amount','confirmation','document_link','reason','review_note','target_id','voided','command_id','created_at'],`OliPoly-Test-Tax-History-${range.start}-${range.end}.csv`);
          else{const row=c.rows.find(row=>row.id===button.dataset.eventId&&row.kind==='return');if(!row)throw Error('Saved filing source not found.');const source=row.source.map(entry=>{const t=root.OliPolyOpsFinanceReports.summarizeRange([entry],range.start,range.end).total;return{...entry,product_revenue:t.productRevenue,shipping_revenue:t.shippingRevenue,gross_sales:t.grossSales,exempt_sales:t.exemptSales,tax_recorded:t.taxCollected};});download(source,['id','entry_date','type','amount','shipping_charged','sales_tax_collected','sales_county','destination_county','sales_tax_rate','tax_exempt_sale','product_revenue','shipping_revenue','gross_sales','exempt_sales','tax_recorded'],`OliPoly-Test-Tax-Source-${row.id}.csv`);}
        }
      }catch(err){notice(err.message,true);if(cloud.taxPending?.())render();}
      finally{busy=false;}
    });
    return {load,render};
  }
  root.OliPolyTaxFilingsUI={create};
})(typeof globalThis!=='undefined'?globalThis:this);
