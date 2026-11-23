(function (root) {
  'use strict';
  const defaults = Object.freeze({version:1,laborRate:30,planningRate:.53,p1sRate:.53,p2sRate:.53,targetMargin:45,
    headquarters:'OliPoly 3D LLC — HQ, 990 Aurora Hudson Rd, Aurora, OH 44202',mileageMode:'irs',mileageRate:0,
    officeSqft:0,homeSqft:0,consumerTerms:'Payment at pickup or completion',businessTerms:'Net 30 from invoice date'});
  const limits = {laborRate:100000,planningRate:100000,p1sRate:100000,p2sRate:100000,targetMargin:99.99,mileageRate:100,officeSqft:1000000,homeSqft:1000000};
  function validate(values) {
    const result = {version:1};
    for (const [key,max] of Object.entries(limits)) {
      const n = Number(values[key]);
      if (values[key]==null || values[key]==='' || !Number.isFinite(n) || n<0 || n>max) throw Error(`Check ${key.replace(/([A-Z])/g,' $1').toLowerCase()}.`);
      const precision = key==='mileageRate' ? 10000 : 100;
      result[key] = Math.round((n+Number.EPSILON)*precision)/precision;
    }
    for (const key of ['headquarters','consumerTerms','businessTerms']) {
      result[key] = String(values[key]||'').trim();
      if (!result[key] || result[key].length>120) throw Error(`Enter ${key} within 120 characters.`);
    }
    if (!['irs','custom'].includes(values.mileageMode)) throw Error('Choose dated IRS rates or a custom mileage default.');
    result.mileageMode = values.mileageMode;
    if (result.mileageMode==='custom' && !result.mileageRate) throw Error('Enter a positive custom mileage rate.');
    if ((result.officeSqft===0)!==(result.homeSqft===0) || result.officeSqft>result.homeSqft) throw Error('Enter both floor areas, with office area no greater than home area, or leave both at zero.');
    return result;
  }
  function officePercent(values) { return values.homeSqft>0 ? Math.round(values.officeSqft/values.homeSqft*10000)/100 : 0; }
  function apply(order,settings) {
    if (order.snapshot || order.quoteStage==='sent') throw Error('Start a quote revision before applying defaults to shared or approved work.');
    const value = validate(settings), result = JSON.parse(JSON.stringify(order));
    Object.assign(result,{laborRate:value.laborRate,targetMargin:value.targetMargin,terms:result.preset==='business'?value.businessTerms:value.consumerTerms,
      costRates:{planning:value.planningRate,P1S:value.p1sRate,P2S:value.p2sRate}});
    return result;
  }
  function legacy(raw) {
    const data = JSON.parse(raw);
    if (!data || typeof data!=='object' || Array.isArray(data)) throw Error('Legacy defaults could not be read.');
    return validate({...defaults,mileageMode:Number(data.defaultMileageRate)>0?'custom':'irs',mileageRate:data.defaultMileageRate??0,officeSqft:data.officeSqft??0,homeSqft:data.homeSqft??0});
  }
  const api = {defaults,validate,officePercent,apply,legacy};
  if (typeof module==='object' && module.exports) module.exports=api;
  root.OliPolyBusinessSettings=api;
})(typeof window!=='undefined'?window:globalThis);
