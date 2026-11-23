const I=require('../../js/ops-preview/import-model.js');
const sourceOwner='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
const baseline={years:[{year:2026,total:{count:1,revenue:10,shippingRevenue:0,expenses:0,taxCollected:.7}}]};
async function row(table,data,pk={id:data.id}){const row_text=JSON.stringify(data);return{table,pk_text:JSON.stringify(pk),row_text,source_hash:await I.hash(row_text)};}
async function fixture(n=2){
 const rows=await Promise.all(Array.from({length:n},(_,i)=>row('financial_entries',{id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,user_id:sourceOwner,type:'income',amount:10,entry_date:'2026-06-01',sales_tax_collected:.7,sales_tax_rate:7,order_number:'OP-000008',customer_email:'private-customer@example.test'})));
 const snapshot={format:'olipoly-legacy-export-v1',source_project:I.SOURCE,source_owner:sourceOwner,captured_at:'2026-11-23T12:00:00Z',rows,tables:I.tables.map(name=>({name,count:rows.filter(r=>r.table===name).length}))};
 const target={project:I.TARGET,owner,references:['OP-0000008'],keys:[],archiveKeys:[]};return{snapshot,target,bundle:await I.prepare(snapshot,target,baseline)};
}
module.exports={row,fixture,owner,sourceOwner,baseline};
