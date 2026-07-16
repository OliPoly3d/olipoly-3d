(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.OliPolyProductRecipes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const CUSTOMER_FIELDS = new Set([
    'customer_id','customer_name','customer_email','customer_phone','company_name','contact_name',
    'billing_address','shipping_address','po_number','customer_part_number','customer_notes'
  ]);
  const CLOSED = new Set(['closed','completed','production_closed','qc_complete']);
  const number = value => Number(value) || 0;
  const json = (value, fallback) => {
    if(Array.isArray(value) || (value && typeof value === 'object')) return value;
    try { return JSON.parse(value || '') || fallback; } catch { return fallback; }
  };
  const id = () => globalThis.crypto?.randomUUID?.() || `recipe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const revisionNumber = value => Math.max(1, parseInt(String(value || '').match(/\d+/)?.[0] || '1', 10));
  const revisionLabel = value => `Rev ${revisionNumber(value)}`;

  function isCompletedJob(job){
    return !!job && (CLOSED.has(String(job.production_status || job.status || '').toLowerCase()) || !!job.closed_at);
  }

  function estimateSnapshot(job){
    const quantity = Math.max(1, Math.round(number(job.quantity) || 1));
    const materialRecipe = json(job.filament_recipe, []);
    return Object.freeze({
      quantity,
      material_recipe: materialRecipe.map(row => ({
        inventory_pick: row.inventory_pick || '', material: row.material || '', filament: row.filament || '',
        color: row.color || '', grams_each: number(row.grams_each), notes: row.notes || ''
      })),
      estimated_grams_each: number(job.estimated_grams_each),
      estimated_total_grams: number(job.estimated_total_grams) || number(job.estimated_grams_each) * quantity,
      preferred_printer: job.machine_preference || job.actual_machine || 'either',
      estimated_hours_each: number(job.estimated_hours_each),
      estimated_total_hours: number(job.estimated_total_hours) || number(job.estimated_hours_each) * quantity,
      design_hours: number(job.design_hours), design_fee: number(job.design_fee), design_fee_mode: job.design_fee_mode || 'flat',
      post_processing_hours: number(job.post_processing_hours || job.post_hours),
      post_processing_fee: number(job.post_processing_fee), post_processing_fee_mode: job.post_processing_fee_mode || 'flat',
      packaging: job.packaging || job.packaging_notes || '', packaging_cost: number(job.packaging_cost),
      hardware_supplies: json(job.supply_usage, []), supply_cost: number(job.supply_cost),
      estimated_material_cost: number(job.estimated_material_cost),
      suggested_piece_price: number(job.estimated_price_each),
      suggested_selling_price: number(job.estimated_price_each) * quantity
    });
  }

  function createFromCompletedJob(job, options = {}){
    if(!isCompletedJob(job)) throw new Error('Only completed Production jobs can become recipes.');
    const now = options.now || new Date().toISOString();
    const snapshot = estimateSnapshot(job);
    const recipeId = options.id || id();
    const recipe = {
      id: recipeId, recipe_key: recipeId, name: options.name || job.job_title || 'Repeatable product',
      olipoly_part_number: options.olipoly_part_number || job.finished_sku || job.olipoly_part_number || null,
      revision: revisionLabel(options.revision || job.part_revision), revision_number: revisionNumber(options.revision || job.part_revision),
      category: options.category || job.job_type || 'uncategorized', active: true,
      default_quantity: snapshot.quantity,
      suggested_selling_price: snapshot.suggested_selling_price,
      suggested_piece_price: snapshot.suggested_piece_price,
      manufacturing_snapshot: snapshot,
      internal_notes: options.internal_notes || job.notes || null,
      customer_description: options.customer_description || job.customer_facing_description || job.job_title || null,
      source_production_job_id: job.id || null, source_order_number: job.order_number || null,
      created_at: now, updated_at: now
    };
    if(options.includeCustomer === true){
      CUSTOMER_FIELDS.forEach(field => { if(job[field] != null) recipe[field] = job[field]; });
    }
    return Object.freeze(recipe);
  }

  function createRevision(recipe, changes = {}, options = {}){
    const now = options.now || new Date().toISOString();
    const nextNumber = revisionNumber(recipe.revision_number || recipe.revision) + 1;
    const immutableHistory = [...json(recipe.revision_history, []), {
      revision: recipe.revision, revision_number: revisionNumber(recipe.revision_number || recipe.revision),
      manufacturing_snapshot: recipe.manufacturing_snapshot, archived_at: now
    }];
    return Object.freeze({...recipe, ...changes, id: options.id || id(), recipe_key: recipe.recipe_key || recipe.id,
      supersedes_recipe_id: recipe.id, revision:`Rev ${nextNumber}`, revision_number:nextNumber,
      revision_history:immutableHistory, created_at:now, updated_at:now});
  }

  function repeatJobPreload(recipe, quantity){
    const snapshot = json(recipe.manufacturing_snapshot, {});
    const qty = Math.max(1, Math.round(number(quantity) || number(recipe.default_quantity) || number(snapshot.quantity) || 1));
    return Object.freeze({
      source:'product-recipe-library', recipe_id:recipe.recipe_key || recipe.id, recipe_revision:recipe.revision,
      recipe_snapshot:JSON.parse(JSON.stringify(snapshot)), created_at:new Date().toISOString(),
      job_title:recipe.name, job_type:recipe.category || 'customer_custom', production_status:'estimate', quantity:qty,
      machine_preference:snapshot.preferred_printer || 'either', estimated_hours_each:number(snapshot.estimated_hours_each),
      estimated_grams_each:number(snapshot.estimated_grams_each), estimated_price_each:number(recipe.suggested_piece_price),
      filament_recipe:snapshot.material_recipe || [], supply_usage:snapshot.hardware_supplies || [],
      design_fee:number(snapshot.design_fee), design_fee_mode:snapshot.design_fee_mode || 'flat',
      post_processing_fee:number(snapshot.post_processing_fee), post_processing_fee_mode:snapshot.post_processing_fee_mode || 'flat',
      notes:recipe.internal_notes || ''
    });
  }

  function analyticsForRecipe(recipe, jobs){
    const related=(jobs || []).filter(job => isCompletedJob(job) && (job.recipe_id === (recipe.recipe_key || recipe.id) || job.id === recipe.source_production_job_id));
    const withGrams=related.filter(job => number(job.actual_grams_used));
    const withHours=related.filter(job => number(job.actual_print_hours));
    const average=(rows, field) => rows.length ? rows.reduce((sum,row)=>sum+number(row[field]),0)/rows.length : null;
    return {completed_runs:related.length,last_produced_at:related.map(j=>j.closed_at||j.updated_at||'').sort().at(-1)||null,
      average_actual_grams:average(withGrams,'actual_grams_used'),average_actual_hours:average(withHours,'actual_print_hours')};
  }

  function deepLink(recipe, workflow = 'production'){
    const page = workflow === 'quote' ? 'quote.html' : 'production-control.html';
    return `${page}?recipe=${encodeURIComponent(recipe.recipe_key || recipe.id || '')}`;
  }

  return Object.freeze({CUSTOMER_FIELDS,isCompletedJob,estimateSnapshot,createFromCompletedJob,createRevision,repeatJobPreload,analyticsForRecipe,deepLink});
});
