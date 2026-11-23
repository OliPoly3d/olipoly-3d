// Offline preparation only. No network, database write, credentials or promotion command.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),I=require('../js/ops-preview/import-model.js'),R=require('../js/ops-preview/finance-reports.js');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--source','--target','--output'].includes(args[i])||!args[i+1])throw Error('Use --source export.json --target index.json --output bundle.json');options[args[i]]=args[i+1];}
if(Object.keys(options).length!==3)throw Error('Source, target and output paths are required.');
const snapshot=JSON.parse(fs.readFileSync(options['--source'],'utf8')),target=JSON.parse(fs.readFileSync(options['--target'],'utf8'));
if(!Array.isArray(snapshot.finance_effective))throw Error('Include the authoritative effective Finance projection from the source capture.');
const years=[...new Set(snapshot.finance_effective.map(e=>Number(String(e.entry_date||'').slice(0,4))))].sort();
const baseline={projection:'get_effective_financial_entries',years:years.map(year=>{const r=R.summarize(snapshot.finance_effective,year);return{year,total:r.total,counties:r.counties,warnings:r.warnings};}),effective_finance_count:snapshot.finance_effective.length,physical_finance_rows:snapshot.tables.find(t=>t.name==='financial_entries')?.count||0,correction_receipts:snapshot.tables.find(t=>t.name==='finance_correction_receipts')?.count||0,receipt_links:snapshot.finance_effective.filter(e=>e.receipt_link).length,scope:'Captured source reports; target samples are excluded'};
const bundle=await I.prepare(snapshot,target,baseline),manifest=await I.verify(bundle);
const output=path.resolve(options['--output']),existing=fs.existsSync(output)?fs.realpathSync(output):output;
if([options['--source'],options['--target']].some(input=>fs.realpathSync(input)===existing))throw Error('Output must not replace source evidence or target index.');
const bytes=JSON.stringify(bundle,null,2)+'\n';
if(fs.existsSync(output)){if(fs.readFileSync(output,'utf8')!==bytes)throw Error('Output already exists with different content; choose a new reviewed filename.');}
else fs.writeFileSync(output,bytes,{mode:0o600,flag:'wx'});
console.log(JSON.stringify({output:options['--output'],batch_key:manifest.batch_key,records:manifest.record_count,scope:manifest.scope,chunks:I.chunks(bundle.rows).length}));
