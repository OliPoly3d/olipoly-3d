(function(root){
  'use strict';
  const SUPABASE_URL='https://alffoktlwhpfothieude.supabase.co';
  const SUPABASE_KEY='sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';
  const SOURCE='generic_public_campaign';
  const STORAGE_KEY='olipoly_campaign_submission_attempt';
  const MAX_ITEMS=25;
  const LABELS={event_pickup:'Event pickup',local_pickup:'Local pickup',shipping:'Shipping',external_online:'External online payment',cash_at_event:'Cash at event',pay_later:'Pay later'};
  const state={campaign:null,lines:new Map(),attemptKey:null,attempted:false,inFlight:false};
  const $=id=>document.getElementById(id);
  const clean=value=>String(value??'').trim();
  const optionValue=option=>typeof option==='string'?option:clean(option?.value||option?.code);
  const options=value=>Array.isArray(value)?value.filter(optionValue):[];
  const uuid=()=>root.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=root.crypto.getRandomValues(new Uint8Array(1))[0]&15;return(c==='x'?r:(r&3|8)).toString(16)});
  const make=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!=null)element.textContent=String(text);return element};
  const safeHttps=value=>{try{const url=new URL(clean(value));return url.protocol==='https:'?url.href:''}catch{return ''}};
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);
  function status(message,kind=''){
    const region=$('submission-status');
    region.textContent=message;
    region.className=`status-region ${kind}`.trim();
    if(message) region.focus({preventScroll:true});
  }
  async function rpc(name,body){
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>null);
    if(!response.ok){const error=new Error('request_failed');error.httpStatus=response.status;error.serverCode=clean(data?.code);throw error}
    return data;
  }
  async function loadCampaign(slug){return rpc('get_public_campaign',{p_campaign_slug:slug})}
  function setCampaignMessage(heading,message,kind=''){
    const campaign=$('campaign');campaign.replaceChildren(make('h1','',heading),make('p','muted',message));campaign.setAttribute('aria-busy','false');
    if(kind){const notice=make('div','notice',message);notice.dataset.kind=kind;campaign.replaceChildren(make('h1','',heading),notice)}
  }
  function campaignHeader(c){
    const section=$('campaign');section.replaceChildren();section.append(make('h1','',c.name),make('h2','',c.organization_name));
    if(c.public_description)section.append(make('p','',c.public_description));
    const dates=[];if(c.starts_at)dates.push(`Starts ${new Date(c.starts_at).toLocaleDateString()}`);if(c.ends_at)dates.push(`Ends ${new Date(c.ends_at).toLocaleDateString()}`);
    if(dates.length)section.append(make('p','campaign-meta',dates.join(' · ')));
    (Array.isArray(c.public_config?.customer_disclosures)?c.public_config.customer_disclosures:[]).forEach(disclosure=>section.append(make('p','notice',typeof disclosure==='string'?disclosure:disclosure.text)));
    section.setAttribute('aria-busy','false');
  }
  function detailField(product,line){
    const detail=make('div','item-detail');detail.hidden=true;
    if(product.personalization_enabled){
      const toggle=make('label');const checkbox=make('input');checkbox.type='checkbox';checkbox.dataset.field='personalized';toggle.append(checkbox,document.createTextNode(` Personalized (${money(product.personalized_customer_price)} each)`));detail.append(toggle);
      if(product.personalization_instructions)detail.append(make('p','muted',product.personalization_instructions));
      const label=make('label','',`Personalization${product.personalization_limits?.required?' (required)':''}`);const input=make('textarea');input.dataset.field='personalization';input.maxLength=Math.min(Number(product.personalization_limits?.max_length)||200,500);input.rows=2;input.disabled=true;label.append(input);detail.append(label);
      checkbox.addEventListener('change',()=>{line.personalized=checkbox.checked;input.disabled=!checkbox.checked;if(!checkbox.checked)input.value='';renderSummary()});
      input.addEventListener('input',()=>{line.personalization=clean(input.value)});
    }
    const variants=options(product.variant_config?.options);
    if(variants.length){const label=make('label','',product.variant_config?.label||'Design / variant');const select=make('select');select.dataset.field='variant';select.append(new Option('Select…',''));variants.forEach(entry=>select.append(new Option(typeof entry==='string'?entry:(entry.label||optionValue(entry)),optionValue(entry))));select.addEventListener('change',()=>{line.variant=select.value});label.append(select);detail.append(label)}
    if(product.variant_config?.allow_item_notes===true){const label=make('label','',`Item notes (optional)`);const notes=make('textarea');notes.maxLength=500;notes.rows=2;notes.addEventListener('input',()=>{line.notes=clean(notes.value)});label.append(notes);detail.append(label)}
    return detail;
  }
  function renderProducts(){
    const grid=$('products');grid.replaceChildren();
    state.campaign.products.forEach(product=>{
      const line={product,quantity:0,personalized:false,personalization:'',variant:'',notes:''};state.lines.set(product.campaign_product_id,line);
      const card=make('article','product-card');
      if(product.image_url){const imageUrl=safeHttps(product.image_url);if(imageUrl){const image=make('img');image.src=imageUrl;image.alt=product.display_name;image.loading='lazy';card.append(image)}}
      card.append(make('h3','',`${product.campaign_sku} · ${product.display_name}`));if(product.public_description)card.append(make('p','',product.public_description));(Array.isArray(product.customer_disclosures)?product.customer_disclosures:[]).forEach(disclosure=>card.append(make('p','notice',typeof disclosure==='string'?disclosure:disclosure.text)));
      card.append(make('p','price',`Standard ${money(product.standard_customer_price)}${product.personalization_enabled&&product.personalized_customer_price!=null?` · Personalized ${money(product.personalized_customer_price)}`:''}`));
      const controls=make('div','item-controls');const row=make('div','quantity-row');const minus=make('button','','−');minus.type='button';minus.setAttribute('aria-label',`Remove one ${product.display_name}`);const input=make('input');input.type='number';input.min='0';input.max=String(product.max_quantity||1000);input.step='1';input.value='0';input.inputMode='numeric';input.setAttribute('aria-label',`${product.display_name} quantity`);const plus=make('button','','+');plus.type='button';plus.setAttribute('aria-label',`Add one ${product.display_name}`);row.append(minus,input,plus);controls.append(row);const detail=detailField(product,line);controls.append(detail);card.append(controls);grid.append(card);
      const update=value=>{line.quantity=Math.max(0,Math.min(Number(product.max_quantity)||1000,value));input.value=String(line.quantity);detail.hidden=line.quantity===0;renderSummary()};
      minus.addEventListener('click',()=>update(line.quantity-1));plus.addEventListener('click',()=>update(line.quantity+1));input.addEventListener('change',()=>{const value=Number(input.value);if(!Number.isInteger(value))input.value=String(line.quantity);else update(value)});
    });
  }
  function renderChoices(containerId,name,configured){
    const container=$(containerId);container.replaceChildren();options(configured).forEach((entry,index)=>{const value=optionValue(entry);const wrapper=make('div','choice');const input=make('input');input.type='radio';input.name=name;input.value=value;input.id=`${name}-${index}`;input.required=true;const label=make('label','',typeof entry==='string'?(LABELS[value]||value):(entry.label||LABELS[value]||value));label.htmlFor=input.id;wrapper.append(input,label);if(typeof entry==='object'&&entry.instructions)label.append(make('span','muted',` — ${entry.instructions}`));container.append(wrapper)});
  }
  function renderSummary(){
    const area=$('summary-items');area.replaceChildren();const selected=[...state.lines.values()].filter(line=>line.quantity>0);
    if(!selected.length){area.append(make('p','muted','Add at least one product above.'));return}
    selected.forEach(line=>{const row=make('div','summary-line');row.append(make('span','',`${line.quantity} × ${line.product.display_name}${line.personalized?' — personalized':''}`),make('span','muted','Price confirmed after submission'));area.append(row)});
  }
  function currentAttempt(){
    if(state.attemptKey)return state.attemptKey;
    try{const stored=JSON.parse(sessionStorage.getItem(STORAGE_KEY)||'null');if(stored?.campaign===state.campaign.campaign_slug&&stored?.key){state.attemptKey=stored.key;state.attempted=stored.attempted===true}}catch{}
    if(!state.attemptKey)state.attemptKey=uuid();
    sessionStorage.setItem(STORAGE_KEY,JSON.stringify({campaign:state.campaign.campaign_slug,key:state.attemptKey,attempted:state.attempted}));return state.attemptKey;
  }
  function selectedValue(name){return clean(document.querySelector(`input[name="${name}"]:checked`)?.value)}
  function validate(form){
    const selected=[...state.lines.values()].filter(line=>line.quantity>0);if(!selected.length)return 'Choose at least one campaign product.';if(selected.length>MAX_ITEMS)return `Choose no more than ${MAX_ITEMS} distinct products.`;
    for(const line of selected){if(!Number.isInteger(line.quantity)||line.quantity<1)return 'Every quantity must be a positive whole number.';if(line.personalized&&line.product.personalization_limits?.required&&!line.personalization)return `Enter the required personalization for ${line.product.display_name}.`;if(!line.product.personalization_enabled&&line.personalized)return 'A selected product does not allow personalization.';if(options(line.product.variant_config?.options).length&&!line.variant)return `Choose a design or variant for ${line.product.display_name}.`}
    if(!form.reportValidity())return 'Complete the required customer, fulfillment, payment, and consent fields.';if(selectedValue('fulfillment')==='shipping'&&!clean(form.shipping_street.value))return 'Enter the shipping address.';return '';
  }
  function buildPayload(form){
    const fulfillment=selectedValue('fulfillment');const shipping=fulfillment==='shipping'?{street:clean(form.shipping_street.value),city:clean(form.shipping_city.value),state:clean(form.shipping_state.value),postal_code:clean(form.shipping_postal_code.value)}:undefined;
    return {source:SOURCE,source_event_key:currentAttempt(),source_schema_version:'1',campaign_code:state.campaign.campaign_slug,customer:{name:clean(form.customer_name.value),email:clean(form.customer_email.value).toLowerCase(),phone:clean(form.customer_phone.value),organization:clean(form.customer_organization.value)},fulfillment_selection:fulfillment,fulfillment:shipping?{shipping_address:shipping}:{},payment_method_selection:selectedValue('payment'),items:[...state.lines.values()].filter(line=>line.quantity>0).map(line=>({campaign_product_id:line.product.campaign_product_id,quantity:line.quantity,personalization_requested:line.personalized,personalization:line.personalized?{text:line.personalization}:{},variant:line.variant?{selection:line.variant}:{},...(line.notes?{notes:line.notes}:{})})),customer_notes:clean(form.customer_notes.value),consent:{acknowledged:true,terms_version:clean(state.campaign.public_config?.terms_version)||'campaign-current'}};
  }
  function showSuccess(result,recovered){
    $('intake').hidden=true;$('confirmation').hidden=false;$('confirmation-reference').textContent=result.submission_reference;$('confirmation-campaign').textContent=state.campaign.name;
    const items=$('confirmation-items');items.replaceChildren();[...state.lines.values()].filter(line=>line.quantity>0).forEach(line=>items.append(make('p','',`${line.quantity} × ${line.product.display_name}${line.personalized?' — personalized':''}`)));
    $('confirmation-selections').textContent=`Fulfillment: ${LABELS[selectedValue('fulfillment')]||selectedValue('fulfillment')} · Payment instruction: ${LABELS[selectedValue('payment')]||selectedValue('payment')} (unverified)`;
    const next=$('confirmation-next');next.replaceChildren();if(recovered)next.append(make('p','muted','Your exact retry recovered the existing request; no duplicate was created.'));
    const link=safeHttps(state.campaign.public_config?.payment_link);if(selectedValue('payment')==='external_online'&&link){const anchor=make('a','',state.campaign.public_config?.payment_link_label||'Open approved payment instructions');anchor.href=link;anchor.target='_blank';anchor.rel='noopener noreferrer';next.append(anchor)}
    const support=clean(state.campaign.public_config?.support_contact);if(support)next.append(make('p','',`Support: ${support}`));$('confirmation').focus();sessionStorage.removeItem(STORAGE_KEY);state.attemptKey=null;state.attempted=false;
  }
  async function submit(event){
    event.preventDefault();if(state.inFlight)return;const form=event.currentTarget;const issue=validate(form);if(issue){status(issue,'error');return}
    state.inFlight=true;$('submit-button').disabled=true;status('Submitting your request…');const recoveredCandidate=state.attempted;state.attempted=true;currentAttempt();
    try{const result=await rpc('submit_campaign_submission',{p_request:buildPayload(form)});if(result?.status==='conflicting_replay'||result?.rejected){status('This retry does not match the original request. Start a genuinely new submission or contact support.','error');return}if(!result?.submission_reference)throw new Error('invalid_response');showSuccess(result,recoveredCandidate)}
    catch(error){status(error.httpStatus===400?'The campaign could not accept these details. Review the form and try again.':'The network response was not confirmed. Your retry will safely use the same attempt key.','error')}
    finally{state.inFlight=false;$('submit-button').disabled=false}
  }
  async function init(){
    const slug=clean(new URLSearchParams(location.search).get('campaign')).toLowerCase();if(!slug){setCampaignMessage('Campaign unavailable','Use a valid campaign link.');return}
    try{const campaign=await loadCampaign(slug);if(!campaign){setCampaignMessage('Campaign unavailable','This campaign is not available.');return}state.campaign=campaign;if(campaign.status!=='active'){setCampaignMessage('Campaign closed',campaign.status==='scheduled'?'This campaign is not accepting requests yet.':'This campaign is no longer accepting requests.','closed');return}if(!campaign.products?.length){setCampaignMessage(campaign.name,'No campaign products are currently available.');return}
      const fulfillment=options(campaign.public_config?.fulfillment_options),payment=options(campaign.public_config?.payment_options);if(!fulfillment.length||!payment.length){setCampaignMessage(campaign.name,'Submission is unavailable because campaign fulfillment or payment instructions are not configured.');return}
      campaignHeader(campaign);renderProducts();renderChoices('fulfillment-options','fulfillment',fulfillment);renderChoices('payment-options','payment',payment);$('intake').hidden=false;$('submission-form').addEventListener('submit',submit);document.querySelectorAll('input[name="fulfillment"]').forEach(input=>input.addEventListener('change',()=>{$('shipping-fields').hidden=input.value!=='shipping'||!input.checked}));
    }catch{setCampaignMessage('Campaign unavailable','Campaign information could not be loaded. Please try again later.')}
  }
  const api={buildPayload,validate,uuid,optionValue,SOURCE,MAX_ITEMS,state};if(typeof module!=='undefined')module.exports=api;if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',init);
})(typeof globalThis!=='undefined'?globalThis:this);
