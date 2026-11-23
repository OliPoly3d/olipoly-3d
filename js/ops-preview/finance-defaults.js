(function (root) {
  'use strict';
  const verifiedOn = '2026-11-23';
  const headquarters = 'OliPoly 3D LLC — HQ, 990 Aurora Hudson Rd, Aurora, OH 44202';
  const mileageSource = 'https://www.irs.gov/tax-professionals/standard-mileage-rates';
  const taxSource = 'https://tax.ohio.gov/business/sales-and-use-tax/rate-tables/by-county-q4-2026';
  const finder = 'https://thefinder.tax.ohio.gov/';
  // Ohio's 2026 county table. Warren changed October 1; no Q1–Q3 changes.
  // Transit-area counties require address verification and never auto-select a rate.
  const counties = Object.freeze({
    Adams:7.25,Allen:6.85,Ashland:7,Ashtabula:6.75,Athens:7.25,Auglaize:7.25,Belmont:7.25,Brown:7,Butler:6.5,Carroll:6.75,
    Champaign:7.25,Clark:7.25,Clermont:6.75,Clinton:7.25,Columbiana:7.25,Coshocton:7.75,Crawford:7.25,Cuyahoga:8,Darke:7.25,Defiance:6.75,
    Delaware:7,Erie:6.75,Fairfield:6.75,Fayette:7.25,Franklin:8,Fulton:7.25,Gallia:7.25,Geauga:6.75,Greene:6.75,Guernsey:7.25,
    Hamilton:7.8,Hancock:6.75,Hardin:7.25,Harrison:7.25,Henry:7.25,Highland:7.25,Hocking:7.25,Holmes:7,Huron:7.25,Jackson:7.25,
    Jefferson:7.25,Knox:7.25,Lake:7.25,Lawrence:7.25,Licking:7.25,Logan:7.25,Lorain:6.5,Lucas:7.75,Madison:7,Mahoning:7.5,
    Marion:7.25,Medina:6.75,Meigs:7.25,Mercer:7.25,Miami:7,Monroe:7.25,Montgomery:7.5,Morgan:7.25,Morrow:7.25,Muskingum:7.25,
    Noble:7.25,Ottawa:7,Paulding:7.25,Perry:7.25,Pickaway:7.25,Pike:7.25,Portage:7,Preble:7.25,Putnam:7,Richland:7,
    Ross:7.25,Sandusky:7.25,Scioto:7.25,Seneca:7.25,Shelby:7.25,Stark:6.5,Summit:6.75,Trumbull:6.75,Tuscarawas:6.75,Union:7,
    'Van Wert':7.25,Vinton:7.25,Warren:7.25,Washington:7.25,Wayne:6.5,Williams:7.25,Wood:6.75,Wyandot:7.25
  });
  const transit = new Set(['Delaware','Fairfield','Licking','Union','Wood']);
  const milePeriods = [
    ['2022-01-01','2022-06-30',.585],['2022-07-01','2022-12-31',.625],['2023-01-01','2023-12-31',.655],
    ['2024-01-01','2024-12-31',.67],['2025-01-01','2025-12-31',.70],
    ['2026-01-01','2026-06-30',.725],['2026-07-01','2026-12-31',.76]
  ];
  function validDate(date) {
    return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
  }
  const today = () => new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  function mileage(date) {
    const period = validDate(date) && milePeriods.find(([start,end]) => date>=start && date<=end);
    return period ? {rate:period[2],start:period[0],end:period[1],source:mileageSource,label:`IRS business rate · ${period[0]}–${period[1]}`} : {rate:null,source:mileageSource,label:'No verified IRS business rate for this date. Verify and enter the appropriate rate.'};
  }
  function salesTax(county,date,exempt=false) {
    if (exempt) return {rate:0,source:finder,label:'Marked exempt. Confirm the exemption and supporting documentation.'};
    const name = String(county || '').trim().replace(/\s+county$/i,'').toLowerCase();
    const canonical = Object.keys(counties).find(key => key.toLowerCase() === name);
    if (!validDate(date) || date<'2026-01-01' || date>'2026-12-31') return {rate:null,source:finder,label:'No verified Ohio rate table for this date. Check The Finder and enter the rate.'};
    if (!canonical) return {rate:null,source:finder,label:'Select an Ohio tax reporting county, then confirm the sourcing location in The Finder.'};
    if (transit.has(canonical)) return {rate:null,source:finder,label:`${canonical} has a transit-area exception. Verify the exact tax location in The Finder and enter its combined rate.`};
    const rate = canonical === 'Warren' && date<'2026-10-01' ? 6.75 : counties[canonical];
    return {rate,source:taxSource,label:`Ohio combined sales-tax rate · ${canonical} · ${date}`,county:canonical};
  }
  const bound = new WeakSet();
  function bind(form,options) {
    if (!form || bound.has(form)) return;
    const rateInput = form.elements[options.rate];
    if (!rateInput) return;
    bound.add(form);
    if (options.county && form.elements[options.county]) {
      const list=form.ownerDocument.createElement('datalist');list.id=`rate-counties-${form.id || form.dataset.form || 'entry'}-${options.rate}`;
      for (const name of Object.keys(counties)) {const option=form.ownerDocument.createElement('option');option.value=name;list.append(option);}
      form.elements[options.county].setAttribute('list',list.id);form.append(list);
    }
    let overridden = false, internal = false, lastAuto = null;
    const panel = form.ownerDocument.createElement('div'); panel.className='muted full rate-guidance';
    const label = form.ownerDocument.createElement('p'), source = form.ownerDocument.createElement('a'), button = form.ownerDocument.createElement('button');
    source.target='_blank';source.rel='noopener noreferrer';source.textContent=options.kind==='mileage' ? 'IRS rate reference' : 'Ohio rate reference / The Finder';
    button.type='button';button.textContent=options.mileageMode==='custom'?'Use saved default':'Use standard rate';
    panel.append(label,source,form.ownerDocument.createTextNode(' '),button); rateInput.closest('label').after(panel);
    const active = () => options.kind!=='mileage' || form.elements.category?.value==='Vehicle / Delivery Mileage';
    const lookup = () => options.kind==='mileage' ? (options.mileageMode==='custom' ? {rate:options.customRate,source:mileageSource,label:'Your saved business mileage default'} : mileage(form.elements[options.date]?.value || '')) : salesTax(form.elements[options.county]?.value,options.date ? form.elements[options.date]?.value : options.asOf || today(),options.exemptValue === true || form.elements[options.exempt]?.checked);
    function apply(suggestion) {
      if (suggestion.rate==null) return;
      rateInput.value=String(suggestion.rate);lastAuto=rateInput.value;overridden=false;
      internal=true;rateInput.dispatchEvent(new root.Event('input',{bubbles:true}));internal=false;
    }
    function update(auto=false) {
      const suggestion=lookup(); panel.hidden=!active();source.href=suggestion.source;button.disabled=suggestion.rate==null;
      if (auto && active() && options.auto && !overridden && suggestion.rate!=null) apply(suggestion);
      if (auto && active() && options.auto && !overridden && suggestion.rate==null && lastAuto!==null) {
        rateInput.value='';lastAuto=null;internal=true;rateInput.dispatchEvent(new root.Event('input',{bubbles:true}));internal=false;
      }
      const matches=suggestion.rate!=null && rateInput.value!=='' && Number(rateInput.value)===suggestion.rate;
      const status=matches ? (options.mileageMode==='custom'?'Saved business default selected.':'Standard rate selected.') : rateInput.value!=='' ? 'Entered rate retained. Editable override.' : 'Enter a verified rate.';
      label.textContent=`${suggestion.label}${suggestion.rate==null ? '' : ` · ${options.kind==='mileage' ? '$'+suggestion.rate.toFixed(4)+'/mile' : suggestion.rate+'%'}`} ${status} Reference checked ${verifiedOn}.`;
    }
    form.addEventListener('input',event => {if (internal) return;if(event.target===rateInput){overridden=true;update();}});
    form.addEventListener('change',event => {
      if (internal) return;
      if(event.target===rateInput){overridden=true;update();return;}
      if([options.date,options.county,options.exempt,'category'].includes(event.target.name)) update(true);
    });
    form.addEventListener('reset',()=>root.queueMicrotask(()=>{overridden=false;lastAuto=null;update(true);}));
    button.addEventListener('click',()=>{apply(lookup());update();});
    const initial = lookup();
    if (options.auto && rateInput.value!=='' && initial.rate!=null) {
      overridden = Number(rateInput.value)!==initial.rate;
      if (!overridden) lastAuto=rateInput.value;
    }
    update(options.initial===true);
  }
  const api={verifiedOn,headquarters,counties,mileage,salesTax,bind};
  if(typeof module==='object' && module.exports)module.exports=api;
  root.OliPolyOpsFinanceDefaults=api;
})(typeof window!=='undefined' ? window : globalThis);
