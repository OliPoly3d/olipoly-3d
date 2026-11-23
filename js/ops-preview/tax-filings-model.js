(function(root){
  'use strict';
  const Reports=typeof module==='object'&&module.exports ? require('./finance-reports.js') : root.OliPolyOpsFinanceReports;
  const cents=value=>Math.round((Number(value)+Number.EPSILON)*100);
  const fields=['id','entry_date','type','amount','shipping_charged','sales_tax_collected','sales_county','destination_county','sales_tax_rate','tax_exempt_sale','accepted_commercial_snapshot'];
  function date(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
  function today(){return new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});}
  function period(year,selection){
    year=Number(year);if(!Number.isInteger(year)||year<2000||year>9998)throw Error('Choose a valid filing year.');
    const half=['H1','H2'].includes(selection);
    const month=half ? (selection==='H1'?1:7) : Number(selection);
    if(!Number.isInteger(month)||month<1||month>12)throw Error('Choose a filing period.');
    const endMonth=half?month+5:month;
    const endDay=new Date(Date.UTC(year,endMonth,0)).getUTCDate();
    const nextMonth=endMonth===12?1:endMonth+1,nextYear=endMonth===12?year+1:year;
    let due=new Date(Date.UTC(nextYear,nextMonth-1,23));
    while([0,6].includes(due.getUTCDay()))due.setUTCDate(due.getUTCDate()+1);
    return {start:`${year}-${String(month).padStart(2,'0')}-01`,end:`${year}-${String(endMonth).padStart(2,'0')}-${endDay}`,due:due.toISOString().slice(0,10)};
  }
  function defaultPeriod(value=today()){
    const year=Number(value.slice(0,4));return value.slice(5,7)>='07'?{year,selection:'H1'}:{year:year-1,selection:'H2'};
  }
  function source(entries,start,end){
    return entries.filter(e=>e.type==='income'&&Number(e.report_transaction_count??1)===1&&date(e.entry_date)&&e.entry_date>=start&&e.entry_date<=end).map(e=>Object.fromEntries(fields.map(key=>[key,e[key]??null]))).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  }
  function canonical(value){return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
  function fingerprint(entries,start,end){return JSON.stringify(canonical(source(entries,start,end)));}
  function summarize(events,entries,start,end,asOf=today()){
    const rows=events.filter(e=>e.period_start===start&&e.period_end===end).sort((a,b)=>Number(a.event_no)-Number(b.event_no));
    const returns=rows.filter(e=>['return','void_return'].includes(e.kind)),latest=returns.at(-1);
    const filed=latest?.kind==='return'?latest:null;
    const voids=new Set(rows.filter(e=>e.kind==='void_payment').map(e=>e.payload.target_id));
    const payments=rows.filter(e=>['payment','refund'].includes(e.kind)&&!voids.has(e.id));
    const paidCents=payments.reduce((sum,e)=>sum+(e.kind==='refund'?-1:1)*cents(e.payload.amount),0);
    const p=filed?.payload;
    const dueCents=p?cents(p.reported_tax)-cents(p.discount)+cents(p.charges)-cents(p.credits):0;
    const current=Reports.summarizeRange(entries,start,end);
    const frozen=filed?Reports.summarizeRange(filed.source,start,end):null;
    const changed=!!filed&&fingerprint(filed.source,start,end)!==fingerprint(entries,start,end);
    const balance=(dueCents-paidCents)/100;
    return {rows,filed,payments,voids,lastId:rows.at(-1)?.id||null,current,frozen,changed,paid:paidCents/100,due:dueCents/100,balance,
      status:!filed?'Not recorded as filed':balance>0?'Filed · payment outstanding':balance<0?'Filed · overpayment / credit':'Filed · paid',
      overdue:!!filed&&balance>0&&p.due_on<asOf};
  }
  function prepare(values,context){
    const {start,end}=context;Reports.summarizeRange([],start,end);
    const kind=values.kind;
    if(!['return','payment','refund','void_payment','void_return'].includes(kind))throw Error('Choose a valid filing action.');
    const text=(key,max=500,required=false)=>{const value=String(values[key]||'').trim();if(value.length>max||(required&&value.length<3))throw Error(`Enter ${key.replaceAll('_',' ')}${required?' (at least 3 characters)':''}.`);return value;};
    const day=key=>{const value=String(values[key]||'');if(!date(value)||value>today())throw Error('Enter a valid date that is not in the future.');return value;};
    const amount=(key,positive=false)=>{const n=Number(values[key]);if(values[key]==null||values[key]===''||!Number.isFinite(n)||n<0||n>999999999||Math.abs(n*100-cents(n))>1e-6||(positive&&n===0))throw Error(`Check ${key.replaceAll('_',' ')}.`);return n;};
    const payload={reason:text('reason',500,true)};
    if(kind==='return'){
      if(!['original','amendment','record_correction'].includes(values.return_type))throw Error('Choose original return, amendment or record correction.');
      Object.assign(payload,{return_type:values.return_type,filed_on:day('filed_on'),due_on:String(values.due_on||''),confirmation:text('confirmation',200,true),document_link:text('document_link',1000),review_note:text('review_note',2000),confirmed:values.confirmed===true||values.confirmed==='yes'});
      if(!date(payload.due_on)||payload.due_on<end||payload.filed_on<end)throw Error('Check the filing and due dates against the period end.');
      if(payload.document_link&&!/^https:\/\/[^\s]+$/i.test(payload.document_link))throw Error('Use an HTTPS document link.');
      for(const key of ['reported_tax','discount','charges','credits'])payload[key]=amount(key);
      if(cents(payload.reported_tax)-cents(payload.discount)+cents(payload.charges)-cents(payload.credits)<0)throw Error('Net return amount cannot be negative.');
      if(!payload.confirmed)throw Error('Confirm the return was filed externally.');
      if((cents(payload.reported_tax)!==cents(context.current.total.taxCollected)||context.current.warnings.length||payload.discount||payload.charges||payload.credits)&&payload.review_note.length<3)throw Error('Explain the reconciliation or adjustments and any reporting warnings.');
    }else if(['payment','refund'].includes(kind)){
      Object.assign(payload,{amount:amount('amount',true),paid_on:day('paid_on'),confirmation:text('confirmation',200,true),document_link:text('document_link',1000)});
      if(payload.paid_on<start)throw Error('Payment date precedes this filing period.');
      if(payload.document_link&&!/^https:\/\/[^\s]+$/i.test(payload.document_link))throw Error('Use an HTTPS document link.');
      if(values.confirmed!==true&&values.confirmed!=='yes')throw Error('Confirm the payment or refund occurred externally.');
      payload.confirmed=true;
    }else if(kind==='void_payment')payload.target_id=String(values.target_id||'');
    return {p_start:start,p_end:end,p_kind:kind,p_payload:payload,p_expected_event_id:context.lastId,p_expected_source:kind==='return'?source(context.entries,start,end):[]};
  }
  const api={date,today,period,defaultPeriod,source,fingerprint,summarize,prepare};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.OliPolyTaxFilings=api;
})(typeof globalThis!=='undefined'?globalThis:this);
