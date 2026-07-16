const assert = require('node:assert/strict');
const Recipes = require('../js/product-recipe-model.js');

const completed = {id:'job-1',job_title:'Widget',job_type:'business_po',production_status:'closed',closed_at:'2026-07-10T00:00:00Z',
  customer_name:'Private Person',customer_email:'private@example.com',shipping_address:'Private address',order_number:'OP-10',finished_sku:'OPART-10',
  quantity:10,estimated_price_each:4,estimated_hours_each:0.5,estimated_grams_each:12,machine_preference:'P1S',
  filament_recipe:JSON.stringify([{material:'PETG',color:'Black',grams_each:12}]),supply_usage:JSON.stringify([{name:'Magnet',quantity_each:1}]),
  notes:'Use textured plate',actual_grams_used:125,actual_print_hours:5.5};

assert.throws(()=>Recipes.createFromCompletedJob({...completed,production_status:'printing',closed_at:null}),/completed/);
const recipe=Recipes.createFromCompletedJob(completed,{id:'recipe-1',now:'2026-07-11T00:00:00Z'});
assert.equal(recipe.name,'Widget');
assert.equal(recipe.manufacturing_snapshot.material_recipe[0].grams_each,12);
assert.equal(recipe.manufacturing_snapshot.preferred_printer,'P1S');
assert.equal(recipe.customer_name,undefined,'customer data must be excluded by default');
assert.equal(recipe.customer_email,undefined);
assert.equal(recipe.shipping_address,undefined);

const revision=Recipes.createRevision(recipe,{suggested_piece_price:5},{id:'recipe-2',now:'2026-07-12T00:00:00Z'});
assert.equal(revision.revision,'Rev 2');
assert.equal(revision.revision_history[0].manufacturing_snapshot.estimated_grams_each,12);
assert.equal(recipe.suggested_piece_price,4,'prior revision remains unchanged');

const preload=Recipes.repeatJobPreload(revision,25);
assert.equal(preload.production_status,'estimate');
assert.equal(preload.quantity,25);
assert.equal(preload.recipe_revision,'Rev 2');
assert.equal(preload.order_number,undefined,'repeat preload must not create an order');
assert.deepEqual(preload.filament_recipe,[{inventory_pick:'',material:'PETG',filament:'',color:'Black',grams_each:12,notes:''}]);
preload.recipe_snapshot.material_recipe[0].grams_each=99;
assert.equal(revision.manufacturing_snapshot.material_recipe[0].grams_each,12,'historical snapshot remains isolated');

const analytics=Recipes.analyticsForRecipe(recipe,[completed,{...completed,id:'job-2',recipe_id:'recipe-1',actual_grams_used:135,actual_print_hours:6,closed_at:'2026-07-12T00:00:00Z'}]);
assert.equal(analytics.completed_runs,2);
assert.equal(analytics.average_actual_grams,130);
assert.equal(analytics.last_produced_at,'2026-07-12T00:00:00Z');
assert.equal(Recipes.deepLink(recipe),'production-control.html?recipe=recipe-1');
assert.equal(Recipes.deepLink(recipe,'quote'),'quote.html?recipe=recipe-1');
console.log('product recipe model assertions passed');
