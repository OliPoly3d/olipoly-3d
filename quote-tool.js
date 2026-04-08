// =========================
// CORE HELPERS
// =========================
const $ = id => document.getElementById(id);
const num = v => Number(v) || 0;
const money = v => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(num(v));
const today = () => new Date().toISOString().slice(0,10);

// =========================
// SUPABASE CONFIG
// =========================
const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';

function getSbToken(){ return localStorage.getItem('sb_token') || null; }

async function sbApi(path, options={}){
 const token = getSbToken();

 const res = await fetch(`${SUPABASE_URL}${path}`,{
   ...options,
   headers:{
     apikey: SUPABASE_KEY,
     'Content-Type':'application/json',
     ...(token ? {Authorization:`Bearer ${token}`} : {}),
     ...(options.headers||{})
   }
 });

 const data = await res.json().catch(()=>null);
 return {ok:res.ok,data,error:!res.ok?data:null};
}

async function getCurrentUser(){
 const token = getSbToken();
 if(!token) return null;

 const {data} = await sbApi('/auth/v1/user');
 return data;
}

// =========================
// ELEMENTS
// =========================
const els = {
 quoteNumber:$('quoteNumber'),
 quoteDate:$('quoteDate'),
 quoteTitle:$('quoteTitle'),
 customerName:$('customerName'),
 qty:$('qty'),
 quoteStatus:$('quoteStatus'),
 shippingMode:$('shippingMode'),
 outFinal:$('outFinal'),
 outDeposit:$('outDeposit'),
 outBalance:$('outBalance'),
 quoteNotes:$('quoteNotes'),
 assumptions:$('assumptions'),
 saveQuoteBtn:$('saveQuoteBtn')
};

// =========================
// ORDER BUILDERS
// =========================
function moneyTextToNumber(text){
 return Number(String(text||'').replace(/[^0-9.-]/g,''))||0;
}

function fulfillmentMap(mode){
 if(mode==='pickup') return 'pickup';
 if(mode==='delivery') return 'delivery';
 return 'shipping';
}

function buildOrder(userId){
 const total = moneyTextToNumber(els.outFinal.textContent);
 const deposit = moneyTextToNumber(els.outDeposit.textContent);
 const balance = moneyTextToNumber(els.outBalance.textContent);

 return {
   user_id:userId,
   order_number:els.quoteNumber.value.trim(),
   order_date:els.quoteDate.value || today(),
   customer_name:els.customerName.value.trim()||null,
   order_title:els.quoteTitle.value.trim()||'Quoted Project',
   quantity:num(els.qty.value)||1,
   order_total:total,
   deposit_amount:deposit,
   balance_amount:balance,
   status: deposit>0 ? 'awaiting_deposit':'in_design',
   payment_status: deposit>0 ? 'deposit_due':'unpaid',
   fulfillment:fulfillmentMap(els.shippingMode.value),
   internal_notes:`Created from quote ${els.quoteNumber.value}`,
   public_status_text:'Your order has been created.',
   public_next_step: deposit>0
     ? 'Submit deposit to begin.'
     : 'We are preparing your order.'
 };
}

// =========================
// SYNC FUNCTION
// =========================
async function syncToSupabase(){
 if(els.quoteStatus.value!=='accepted') return;

 const user = await getCurrentUser();
 if(!user) throw new Error('Login to orders-admin first');

 const order = buildOrder(user.id);

 const orderRes = await sbApi('/rest/v1/orders?on_conflict=order_number',{
   method:'POST',
   headers:{Prefer:'resolution=merge-duplicates'},
   body:JSON.stringify(order)
 });

 if(orderRes.error) throw new Error(orderRes.error.message);

 const publicRes = await sbApi('/rest/v1/order_tracking_public?on_conflict=order_number',{
   method:'POST',
   headers:{Prefer:'resolution=merge-duplicates'},
   body:JSON.stringify({
     order_number:order.order_number,
     user_id:order.user_id,
     order_title:order.order_title,
     status:order.status,
     payment_status:order.payment_status,
     public_status_text:order.public_status_text,
     public_next_step:order.public_next_step
   })
 });

 if(publicRes.error) throw new Error(publicRes.error.message);
}

// =========================
// SAVE QUOTE
// =========================
async function saveQuote(){

 try{
   if(els.quoteStatus.value==='accepted'){
     await syncToSupabase();
     els.saveQuoteBtn.textContent='Saved + Synced';
   } else {
     els.saveQuoteBtn.textContent='Saved';
   }
 }catch(err){
   console.error(err);
   alert(err.message);
   els.saveQuoteBtn.textContent='Saved / Sync Error';
 }

 setTimeout(()=>{
   els.saveQuoteBtn.textContent='Save Quote';
 },1500);
}

// =========================
// EVENTS
// =========================
els.saveQuoteBtn.onclick = saveQuote;

els.quoteStatus.addEventListener('change',()=>{
 if(els.quoteStatus.value==='accepted'){
   alert('Saving this will create an order automatically.');
 }
});
