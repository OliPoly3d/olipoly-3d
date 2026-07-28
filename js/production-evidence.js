(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.OliPolyProductionEvidence = api;
})(typeof window !== 'undefined' ? window : globalThis, function(){
  'use strict';

  const NUMERIC_FIELDS = Object.freeze(['actual_grams_used','scrap_grams','actual_print_hours','actual_quantity']);
  const STRING_FIELDS = Object.freeze(['actual_machine','actual_filament_breakdown','print_started_at','completed_at']);
  const JSON_FIELDS = Object.freeze(['actual_filaments','actual_filament_usage']);
  const ALL_FIELDS = Object.freeze([...NUMERIC_FIELDS, ...STRING_FIELDS, ...JSON_FIELDS]);

  function nullableNumber(value, options = {}){
    if(value == null || (typeof value === 'string' && value.trim() === '')) return null;
    const parsed = typeof value === 'number' ? value : Number(String(value).trim());
    if(!Number.isFinite(parsed)){
      if(options.invalidAsNull) return null;
      throw new TypeError('Actual production value must be a finite number or blank.');
    }
    return parsed;
  }

  function nullableString(value){
    if(value == null) return null;
    const parsed = String(value).trim();
    return parsed || null;
  }

  function nullableJson(value){
    if(value == null || (typeof value === 'string' && value.trim() === '')) return null;
    let parsed = value;
    if(typeof value === 'string'){
      try{ parsed = JSON.parse(value); }
      catch{ throw new TypeError('Actual production detail must be valid JSON or blank.'); }
    }
    if(Array.isArray(parsed)) return parsed.length ? parsed : null;
    if(parsed && typeof parsed === 'object') return Object.keys(parsed).length ? parsed : null;
    throw new TypeError('Actual production detail must be an object, array, or blank.');
  }

  function normalizeActuals(source = {}){
    const result = {};
    NUMERIC_FIELDS.forEach(key=>{ result[key] = nullableNumber(source[key]); });
    STRING_FIELDS.forEach(key=>{ result[key] = nullableString(source[key]); });
    JSON_FIELDS.forEach(key=>{ result[key] = nullableJson(source[key]); });
    return result;
  }

  function actualPatch(source = {}){
    const patch = {};
    ALL_FIELDS.forEach(key=>{
      if(!Object.prototype.hasOwnProperty.call(source, key)) return;
      patch[key] = NUMERIC_FIELDS.includes(key) ? nullableNumber(source[key])
        : JSON_FIELDS.includes(key) ? nullableJson(source[key]) : nullableString(source[key]);
    });
    return patch;
  }

  function omitActualEvidence(source = {}){
    return Object.fromEntries(Object.entries(source).filter(([key])=>!ALL_FIELDS.includes(key)));
  }

  function hasActualEvidence(source = {}){
    return ALL_FIELDS.some(key=>source[key] !== null && source[key] !== undefined);
  }

  return Object.freeze({NUMERIC_FIELDS, STRING_FIELDS, JSON_FIELDS, ALL_FIELDS, nullableNumber, nullableString, nullableJson, normalizeActuals, actualPatch, omitActualEvidence, hasActualEvidence});
});
