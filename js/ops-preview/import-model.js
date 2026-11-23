(function(root){
  'use strict';
  const SOURCE='alffoktlwhpfothieude',TARGET='llscjdyiiatmuqhilube';
  const tables=Object.freeze(['active_projects','asset_links','asset_records','campaign_order_conversion_snapshots','campaign_products','campaign_submission_items','campaign_submissions','campaigns','catalog_parts','customers','document_counters','finance_correction_receipts','financial_entries','finished_goods_inventory','hub_notes','hub_reminders','inventory_settings','inventory_spool_pool','inventory_transactions','non_filament_materials','order_payment_command_receipts','order_pricing_revisions','order_tracking_public','orders','parts_catalog','printer_pm','product_recipes','production_attempt_consumption_receipts','production_job_roll_usage','production_jobs','production_linkage_audit','production_material_reservations','project_events','quote_accepted_commercial_snapshots','quotes','raw_material_inventory','reusable_spool_pool','workflow_command_receipts']);
  const inventory=new Set(['raw_material_inventory','non_filament_materials','inventory_transactions','inventory_settings','inventory_spool_pool','reusable_spool_pool','finished_goods_inventory','production_material_reservations','production_job_roll_usage']);
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  const stable=value=>JSON.stringify(canonical(value));
  async function hash(text){return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  const key=row=>row.table+':'+stable(JSON.parse(row.pk_text));
  const normalize=ref=>ref.toUpperCase().replace(/-0+(?=\d)/,'-');
  function references(value){
    const found=new Set();
    function visit(v){if(typeof v==='string'&&/^(OP|Q|INV|I)-\d{1,19}$/i.test(v.trim()))found.add(v.trim());else if(v&&typeof v==='object')Object.values(v).forEach(visit);}
    visit(value);return [...found].sort();
  }
  function classify(row,target={}){
    const data=JSON.parse(row.row_text),flags=[];
    const refs=references(data),targetRefs=target.references||[];
    const collisions=refs.filter(ref=>targetRefs.some(t=>normalize(typeof t==='string'?t:t.reference)===normalize(ref)));
    if(collisions.length)flags.push('Reference overlaps target: '+collisions.join(', '));
    if((target.keys||[]).some(k=>k.table===row.table&&stable(k.pk)===stable(JSON.parse(row.pk_text))))flags.push('Target primary key already exists; never overwrite');
    if(/\btest\b|\be2e\b|rehearsal|fixture/i.test([data.job_title,data.project_title,data.quote_title,data.title].filter(Boolean).join(' ')))flags.push('Test-like description in source; preserve until owner review');
    if(row.table==='document_counters')flags.push('Counter reconciliation required; no allocator calls');
    if(row.table==='quotes'&&data.quote_status==='draft'&&(data.converted_to_order||data.customer_response==='accepted'))flags.push('Draft status conflicts with acceptance/conversion evidence');
    if(row.table==='order_tracking_public'&&!String(data.order_number||'').trim())flags.push('Blank tracking reference; never publish');
    if(row.table==='active_projects')flags.push('Older project card needs status/linkage review');
    if(row.table==='production_jobs'&&data.production_status==='estimate')flags.push('Estimate needs review before joining active queue');
    const archived=(target.archiveKeys||[]).find(k=>k===`legacy:${row.table}:${data.id}`);
    if(archived)flags.push('Existing archive summary retained: '+archived);
    let disposition=inventory.has(row.table)?'inventory_deferred':flags.length?'review':['orders','production_jobs'].includes(row.table)?'historical_only':'stage_only';
    if(row.table==='orders'&&data.status!=='closed')disposition='review';
    return {table:row.table,pk_text:row.pk_text,source_hash:row.source_hash,disposition,flags,reference_labels:refs};
  }
  function jsonObject(text,label){let data;try{data=JSON.parse(text);}catch{throw Error(`Invalid ${label} JSON.`);}if(!data||Array.isArray(data)||typeof data!=='object')throw Error(`Invalid ${label}.`);return data;}
  async function validateRows(rows){
    if(!Array.isArray(rows)||rows.length>20000)throw Error('Invalid export record list.');
    const seen=new Set();
    for(const row of rows){
      if(!tables.includes(row.table)||typeof row.row_text!=='string'||new TextEncoder().encode(row.row_text).length>1000000)throw Error('Unsupported table or oversized source record.');
      const data=jsonObject(row.row_text,'source record'),pk=jsonObject(row.pk_text,'primary key');
      if(!Object.keys(pk).length||row.pk_text.length>1000||Object.entries(pk).some(([k,v])=>v===null||!Object.hasOwn(data,k)||stable(data[k])!==stable(v)))throw Error('Primary key does not match the source record.');
      if(seen.has(key(row)))throw Error('Duplicate source primary key in export.');seen.add(key(row));
      if(!/^[a-f0-9]{64}$/.test(row.source_hash)||await hash(row.row_text)!==row.source_hash)throw Error('Source checksum mismatch.');
    }
  }
  async function prepare(snapshot,target,baseline){
    if(snapshot.format!=='olipoly-legacy-export-v1'||snapshot.source_project!==SOURCE||target.project!==TARGET||!snapshot.source_owner||!target.owner||!Number.isFinite(Date.parse(snapshot.captured_at)))throw Error('Choose the verified live source and separate ERP Test target.');
    await validateRows(snapshot.rows);
    if(!Array.isArray(snapshot.tables)||snapshot.tables.length!==tables.length||new Set(snapshot.tables.map(t=>t.name)).size!==tables.length||snapshot.tables.some(t=>!tables.includes(t.name)||!Number.isInteger(t.count)||t.count<0||snapshot.rows.filter(r=>r.table===t.name).length!==t.count))throw Error('Incomplete table counts. Capture all supported business tables, including empty tables.');
    for(const row of snapshot.rows){const d=JSON.parse(row.row_text);for(const f of ['user_id','owner_id'])if(d[f]&&d[f]!==snapshot.source_owner)throw Error('Export contains a different source owner.');}
    const sorted=[...snapshot.rows].sort((a,b)=>key(a).localeCompare(key(b)));
    const manifest={version:1,source_project:SOURCE,source_owner:snapshot.source_owner,target_project:TARGET,target_owner:target.owner,captured_at:snapshot.captured_at,record_count:sorted.length,tables:snapshot.tables,records:sorted.map(r=>classify(r,target)),baseline:baseline||{},owner_exceptions:snapshot.owner_exceptions||[],preview_target_at:target.captured_at||'',scope:'quarantine_only'};
    return {format:'olipoly-staged-import-v1',manifest_text:stable(manifest),rows:sorted};
  }
  async function verify(bundle){
    if(bundle?.format!=='olipoly-staged-import-v1'||typeof bundle.manifest_text!=='string'||bundle.manifest_text.length>4000000)throw Error('Choose a prepared OliPoly staging bundle.');
    const m=jsonObject(bundle.manifest_text,'manifest');
    if(m.version!==1||m.source_project!==SOURCE||m.target_project!==TARGET||m.scope!=='quarantine_only'||m.record_count!==bundle.rows?.length)throw Error('Staging manifest does not match this workflow.');
    if(!Array.isArray(m.owner_exceptions)||m.owner_exceptions.some(r=>!r||['table','pk_text','owner','reason'].some(k=>typeof r[k]!=='string')))throw Error('Invalid ownership exception list.');
    if(!m.baseline||typeof m.baseline!=='object'||!Array.isArray(m.baseline.years)||m.baseline.years.some(r=>!r.total||!Number.isFinite(r.year)||['count','revenue','shippingRevenue','expenses','taxCollected'].some(k=>!Number.isFinite(r.total[k]))))throw Error('Invalid captured financial baseline.');
    await validateRows(bundle.rows);
    if(!Array.isArray(m.records)||m.records.length!==bundle.rows.length||new Set(m.records.map(key)).size!==m.records.length||m.records.some(d=>!['review','inventory_deferred','historical_only','stage_only'].includes(d.disposition)||!Array.isArray(d.flags)||!Array.isArray(d.reference_labels)||[...d.flags,...d.reference_labels].some(v=>typeof v!=='string'||v.length>4000)||!bundle.rows.some(r=>key(r)===key(d)&&r.source_hash===d.source_hash)))throw Error('Manifest does not match the source records.');
    return {...m,batch_key:await hash(bundle.manifest_text)};
  }
  function chunks(rows,maximumBytes=400000){
    const result=[];let current=[],bytes=2;
    for(const row of rows){const size=new TextEncoder().encode(JSON.stringify(row)).length+1;if(size>maximumBytes)throw Error('A source record exceeds the staging chunk limit; review it without truncation.');if(current.length&&(current.length>=25||bytes+size>maximumBytes)){result.push(current);current=[];bytes=2;}current.push(row);bytes+=size;}
    if(current.length)result.push(current);return result;
  }
  const api={SOURCE,TARGET,tables,stable,hash,prepare,verify,classify,references,chunks};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.OliPolyImport=api;
})(typeof globalThis!=='undefined'?globalThis:this);
