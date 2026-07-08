/* OliPoly ERP Core Hardening Layer
   Adds shared toast, safe storage helpers, lightweight cloud/error telemetry, and a mobile dock helper.
   It is intentionally defensive and does not depend on page-specific code. */
(function(){
  'use strict';
  if (window.OliPolyERP) return;

  const ERP = {
    version: '2026.07.08-workflow-pass3-activity',
    page: (location.pathname.split('/').pop() || 'index.html').toLowerCase(),
    startedAt: new Date().toISOString(),
    memory: new Map()
  };

  function ensureToastStack(){
    let stack = document.querySelector('.erp-toast-stack');
    if (!stack){
      stack = document.createElement('div');
      stack.className = 'erp-toast-stack';
      stack.setAttribute('aria-live','polite');
      stack.setAttribute('aria-relevant','additions');
      document.body.appendChild(stack);
    }
    return stack;
  }

  ERP.toast = function(message, options){
    options = options || {};
    const type = options.type || 'info';
    const title = options.title || (type === 'error' ? 'Needs attention' : type === 'success' ? 'Done' : type === 'warning' ? 'Check this' : 'OliPoly ERP');
    const timeout = Number.isFinite(options.timeout) ? options.timeout : (type === 'error' ? 9000 : 4200);
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = 'erp-toast';
    toast.dataset.type = type;
    toast.innerHTML = '<div><strong></strong><span></span></div><button type="button" aria-label="Dismiss">×</button>';
    toast.querySelector('strong').textContent = title;
    toast.querySelector('span').textContent = String(message || '');
    const remove = () => toast.remove();
    toast.querySelector('button').addEventListener('click', remove);
    stack.appendChild(toast);
    if (timeout > 0) setTimeout(remove, timeout);
    return toast;
  };

  ERP.storage = {
    get(key, fallback){
      try{
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      }catch(err){
        console.warn('[OliPolyERP] localStorage get failed', key, err);
        return fallback;
      }
    },
    set(key, value){
      try{
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      }catch(err){
        console.warn('[OliPolyERP] localStorage set failed', key, err);
        ERP.memory.set(key, value);
        ERP.toast('Browser storage is full or blocked. This page will keep a temporary copy until refresh.', {type:'warning', timeout:7000});
        return false;
      }
    },
    remove(key){
      try{ localStorage.removeItem(key); }catch(err){ console.warn('[OliPolyERP] localStorage remove failed', key, err); }
      ERP.memory.delete(key);
    }
  };

  ERP.safeJson = function(value, fallback){
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try{return JSON.parse(value);}catch{return fallback;}
  };

  ERP.money = function(value){
    const n = Number(value || 0);
    return n.toLocaleString(undefined,{style:'currency', currency:'USD'});
  };

  ERP.dateAgeDays = function(value){
    if(!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  };

  ERP.showCloudStatus = function(message, type){
    let box = document.querySelector('.erp-cloud-status');
    if (!box){
      box = document.createElement('div');
      box.className = 'erp-cloud-status';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.dataset.type = type || 'info';
    box.classList.add('show');
    clearTimeout(box._erpTimer);
    box._erpTimer = setTimeout(()=>box.classList.remove('show'), 6500);
  };

  ERP.installMobileDock = function(items){
    if (!Array.isArray(items) || !items.length || document.querySelector('.erp-mobile-dock')) return;
    const dock = document.createElement('nav');
    dock.className = 'erp-mobile-dock';
    dock.setAttribute('aria-label','ERP mobile shortcuts');
    items.slice(0,5).forEach(item => {
      const a = document.createElement(item.onClick ? 'button' : 'a');
      if (item.href) a.href = item.href;
      if (item.onClick) a.addEventListener('click', item.onClick);
      a.innerHTML = '<span class="ico"></span><span></span>';
      a.querySelector('.ico').textContent = item.icon || '•';
      a.querySelector('span:last-child').textContent = item.label || 'Open';
      dock.appendChild(a);
    });
    document.body.classList.add('erp-has-mobile-dock');
    document.body.appendChild(dock);
  };

  ERP.installDefaultInternalDock = function(){
    const internalPages = ['hub.html','production-control.html','inventory-control.html','orders-admin.html','quote.html','finance-pro.html'];
    if (!internalPages.includes(ERP.page)) return;
    ERP.installMobileDock([
      {label:'Hub', icon:'⌂', href:'hub.html'},
      {label:'Prod', icon:'▦', href:'production-control.html'},
      {label:'Inv', icon:'◈', href:'inventory-control.html'},
      {label:'Orders', icon:'✓', href:'orders-admin.html'},
      {label:'Quote', icon:'$', href:'quote.html'}
    ]);
  };



  /* === ERP Foundation Sprint Pass 1: shared statuses, material matching, and local event log === */
  ERP.status = {
    production: {
      idea:'Idea / Intake',
      awaiting_approval:'Awaiting Approval',
      ready_to_print:'Ready to Print',
      queued:'Queued',
      printing:'Printing',
      post_processing:'Post-Processing',
      packaging:'Packaging',
      ready:'Ready',
      awaiting_pickup:'Awaiting Pickup',
      delivery_scheduled:'Delivery Scheduled',
      shipped:'Shipped',
      delivered:'Delivered',
      completed:'Completed',
      failed_scrap:'Failed / Scrap',
      canceled:'Canceled',
      archived:'Archived',
      on_hold:'On Hold'
    },
    productionClosed: ['completed','failed_scrap','canceled','archived'],
    productionReservesInventory: [
      'idea','awaiting_approval','ready_to_print','queued','printing','post_processing',
      'packaging','ready','awaiting_pickup','delivery_scheduled','shipped','delivered','on_hold'
    ],
    order: {
      quote_sent:'Quote Sent', awaiting_approval:'Awaiting Approval', awaiting_deposit:'Awaiting Deposit',
      in_design:'In Design', in_production:'In Production', post_processing:'Post-Processing',
      ready_for_pickup:'Ready for Pickup', shipped:'Shipped', completed:'Completed'
    },
    payment: {
      not_needed:'Not Needed', deposit_due:'Deposit Due', deposit_paid:'Deposit Paid',
      balance_due:'Balance Due', paid:'Paid', refunded:'Refunded'
    }
  };

  ERP.norm = function(value){ return String(value == null ? '' : value).trim().toLowerCase(); };
  ERP.num = function(value){ const n = Number(value); return Number.isFinite(n) ? n : 0; };
  ERP.materialKey = function(parts){
    parts = parts || {};
    return [parts.material_type || parts.material, parts.color, parts.brand || parts.filament]
      .map(ERP.norm).join('|');
  };
  ERP.parseInventoryPick = function(value){
    const raw = String(value || '').trim();
    if(!raw) return {material:'', color:'', filament:''};
    const pieces = raw.split('|').map(x=>x.trim());
    return {material:pieces[0] || '', color:pieces[1] || '', filament:pieces[2] || ''};
  };
  ERP.materialMatches = function(raw, need){
    raw = raw || {}; need = need || {};
    const rawMaterial = ERP.norm(raw.material_type || raw.material);
    const rawColor = ERP.norm(raw.color);
    const rawBrand = ERP.norm(raw.brand || raw.filament);
    const needMaterial = ERP.norm(need.material_type || need.material);
    const needColor = ERP.norm(need.color);
    const needBrand = ERP.norm(need.brand || need.filament);
    const materialOk = !needMaterial || rawMaterial === needMaterial;
    const colorOk = !needColor || rawColor === needColor;
    const brandOk = !needBrand || !rawBrand || rawBrand === needBrand || rawBrand.includes(needBrand) || needBrand.includes(rawBrand);
    return materialOk && colorOk && brandOk;
  };
  ERP.productionStatusReservesInventory = function(status){
    const s = ERP.norm(status || 'idea');
    return ERP.status.productionReservesInventory.includes(s) && !ERP.status.productionClosed.includes(s);
  };
  ERP.readProductionJobs = function(){ return ERP.storage.get('olipoly_production_jobs_v3', []); };
  ERP.readRawInventory = function(){ return ERP.storage.get('olipoly_raw_material_inventory_v3', []); };
  ERP.writeRawInventory = function(rows){ return ERP.storage.set('olipoly_raw_material_inventory_v3', rows || []); };
  ERP.recipeRowsForJob = function(job){
    const rows = ERP.safeJson(job && job.filament_recipe, []);
    if(Array.isArray(rows) && rows.length) return rows;
    return [{
      material: job && (job.primary_material || job.material) || '',
      color: job && (job.primary_color || job.color) || '',
      filament: job && (job.primary_filament || job.filament || '') || '',
      grams_each: ERP.num(job && (job.estimated_grams_each || job.actual_grams_used || job.grams_each))
    }];
  };
  ERP.jobShouldReserveInventory = function(job){
    if(!job || job.exclude_inventory_reduction) return false;
    return ERP.productionStatusReservesInventory(job.production_status || 'idea');
  };
  ERP.reservationDemandByRoll = function(jobs){
    const demand = {};
    (jobs || []).filter(ERP.jobShouldReserveInventory).forEach(job => {
      if(Array.isArray(job.material_reservations) && job.material_reservations.length){
        job.material_reservations.forEach(r => {
          if(r && r.raw_material_roll_id && !r.shortage){
            demand[r.raw_material_roll_id] = ERP.num(demand[r.raw_material_roll_id]) + ERP.num(r.grams_reserved);
          }
        });
      }
    });
    return demand;
  };
  ERP.logEvent = function(type, detail){
    detail = detail || {};
    const event = {
      id:'evt-'+Date.now()+'-'+Math.random().toString(16).slice(2),
      type:type || 'event',
      category: detail.category || ERP.eventCategory(type),
      detail:detail,
      at:new Date().toISOString(),
      page:ERP.page
    };
    const events = ERP.storage.get('olipoly_erp_event_log_v1', []);
    events.unshift(event);
    ERP.storage.set('olipoly_erp_event_log_v1', events.slice(0,750));
    window.dispatchEvent(new CustomEvent('olipoly:erp-event', {detail:event}));
    return event;
  };

  ERP.eventCategory = function(type){
    const t = ERP.norm(type || 'event');
    if(t.includes('inventory') || t.includes('material') || t.includes('reservation') || t.includes('roll')) return 'inventory';
    if(t.includes('printer') || t.includes('pm') || t.includes('maintenance') || t.includes('nozzle') || t.includes('extruder')) return 'maintenance';
    if(t.includes('production') || t.includes('job')) return 'production';
    if(t.includes('quote')) return 'quotes';
    if(t.includes('order')) return 'orders';
    if(t.includes('finance') || t.includes('invoice') || t.includes('paid') || t.includes('payment')) return 'finance';
    return 'system';
  };

  ERP.events = ERP.events || {};
  ERP.events.read = function(limit){
    const events = ERP.storage.get('olipoly_erp_event_log_v1', []);
    return (Array.isArray(events) ? events : []).slice(0, limit || 100);
  };
  ERP.events.clear = function(){
    ERP.storage.set('olipoly_erp_event_log_v1', []);
    window.dispatchEvent(new CustomEvent('olipoly:erp-events-cleared'));
  };
  ERP.events.icon = function(category){
    return {orders:'📦',quotes:'◈',production:'🖨️',inventory:'⬢',finance:'💰',maintenance:'🛠️',system:'•'}[category || 'system'] || '•';
  };
  ERP.events.title = function(event){
    event = event || {}; const d = event.detail || {}; const type = ERP.norm(event.type || 'event');
    if(type === 'production_job_saved') return 'Production job saved';
    if(type === 'production_status_changed') return 'Production status changed';
    if(type === 'production_job_canceled') return 'Production job canceled';
    if(type.includes('maintenance') || type.includes('printer_pm')) return 'Printer maintenance recorded';
    if(type.includes('inventory') && type.includes('saved')) return 'Inventory updated';
    if(type.includes('reservation')) return 'Material reservation updated';
    if(type.includes('quote')) return 'Quote activity';
    if(type.includes('order')) return 'Order activity';
    return ERP.ui?.titleCase ? ERP.ui.titleCase(event.type || 'ERP activity') : String(event.type || 'ERP activity');
  };
  ERP.events.subtitle = function(event){
    event = event || {}; const d = event.detail || {};
    const bits = [];
    if(d.title || d.job_title || d.order_title) bits.push(d.title || d.job_title || d.order_title);
    if(d.job_id || d.order_id || d.quote_id) bits.push(d.job_id || d.order_id || d.quote_id);
    if(d.from || d.to) bits.push([d.from,d.to].filter(Boolean).join(' → '));
    if(d.reserved_grams) bits.push((ERP.ui?.grams ? ERP.ui.grams(d.reserved_grams) : d.reserved_grams+'g') + ' reserved');
    if(d.printer || d.machine) bits.push(d.printer || d.machine);
    if(d.note || d.reason) bits.push(d.note || d.reason);
    return bits.filter(Boolean).join(' · ') || (event.page ? 'From ' + event.page : 'ERP event logged');
  };



  /* === ERP Foundation Sprint Pass 3: schema-safe payloads and reusable summaries === */
  ERP.schema = ERP.schema || {};
  ERP.schema.generatedFields = {
    raw_material_inventory: [
      'cost_per_gram','cost_per_g','unit_cost_per_gram','unit_cost_g','price_per_gram','price_per_g',
      'remaining_value','reserved_value','used_grams','used_value','available_grams','available_value'
    ],
    production_jobs: ['reserved_value','material_cost_auto','labor_cost_auto','total_cost_auto'],
    finance_transactions: ['net_total_auto','tax_total_auto','profit_auto']
  };
  ERP.schema.stripGeneratedFields = function(table, row){
    const out = {...(row || {})};
    (ERP.schema.generatedFields[table] || []).forEach(k => delete out[k]);
    return out;
  };
  ERP.schema.rawMaterialPayload = function(row, userId, options){
    row = row || {}; options = options || {};
    const payload = {
      id: row.id,
      user_id: userId || row.user_id,
      material_type: row.material_type || row.material || '',
      color: row.color || row.color_name || '',
      color_name: row.color_name || row.color || '',
      brand: row.brand || row.filament || '',
      location: row.location || '',
      roll_label: row.roll_label || row.label || '',
      roll_type: row.roll_type || 'spool',
      is_mounted: !!row.is_mounted,
      reusable_spool: !!row.reusable_spool,
      roll_status: row.roll_status || row.status || 'active',
      starting_grams: ERP.num(row.starting_grams),
      remaining_grams: ERP.num(row.remaining_grams || row.remaining),
      reserved_grams: ERP.num(row.reserved_grams),
      reorder_threshold_grams: ERP.num(row.reorder_threshold_grams),
      spool_cost: ERP.num(row.spool_cost),
      supplier: row.supplier || '',
      reorder_link: row.reorder_link || '',
      reorder_quantity: ERP.num(row.reorder_quantity),
      reorder_policy: row.reorder_policy || 'auto',
      snooze_until: row.snooze_until || null,
      notes: row.notes || '',
      updated_at: row.updated_at || new Date().toISOString()
    };
    if(options.minimal){
      return ERP.schema.stripGeneratedFields('raw_material_inventory', {
        id: payload.id,
        user_id: payload.user_id,
        reserved_grams: payload.reserved_grams,
        remaining_grams: payload.remaining_grams,
        updated_at: payload.updated_at
      });
    }
    return ERP.schema.stripGeneratedFields('raw_material_inventory', payload);
  };
  ERP.summarizeReservationRows = function(rows){
    const list = Array.isArray(rows) ? rows : [];
    return {
      reserved_grams: Math.round(list.filter(r=>!r.shortage).reduce((s,r)=>s+ERP.num(r.grams_reserved),0)*10)/10,
      shortage_grams: Math.round(list.filter(r=>r.shortage).reduce((s,r)=>s+ERP.num(r.grams_reserved),0)*10)/10,
      roll_count: new Set(list.filter(r=>r.raw_material_roll_id).map(r=>r.raw_material_roll_id)).size
    };
  };
  ERP.capacitySummary = function(jobs){
    const open = (jobs || []).filter(j => !ERP.status.productionClosed.includes(ERP.norm(j.production_status)));
    const totalHours = open.reduce((s,j)=>s+ERP.num(j.estimated_total_hours || j.total_hours || j.print_hours),0);
    const unassignedHours = open.filter(j=>!j.machine || ERP.norm(j.machine)==='either').reduce((s,j)=>s+ERP.num(j.estimated_total_hours || j.total_hours || j.print_hours),0);
    return {open_jobs:open.length,total_hours:Math.round(totalHours*10)/10,assigned_hours:Math.round((totalHours-unassignedHours)*10)/10,unassigned_hours:Math.round(unassignedHours*10)/10};
  };


  /* === ERP Foundation Sprint Pass 4: shared UI formatters, status pills, and compact render helpers === */
  ERP.ui = ERP.ui || {};
  ERP.ui.escapeHtml = function(value){
    return String(value == null ? '' : value)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  };
  ERP.ui.titleCase = function(value){
    return String(value || '')
      .replace(/[_-]+/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .replace(/\b\w/g, m => m.toUpperCase());
  };
  ERP.ui.statusLabel = function(status, group){
    const raw = ERP.norm(status || '');
    const map = group && ERP.status && ERP.status[group] ? ERP.status[group] : null;
    if(map && map[raw]) return map[raw];
    if(raw === 'deposit_due') return 'Deposit Due';
    if(raw === 'deposit_paid') return 'Deposit Paid';
    if(raw === 'not_needed') return 'Not Needed';
    return ERP.ui.titleCase(status || 'Open');
  };
  ERP.ui.statusTone = function(status){
    const s = ERP.norm(status || '');
    if(['completed','closed','paid','delivered','done','ready','ready_for_pickup'].includes(s)) return 'success';
    if(['printing','in_production','scheduled','queued','post_processing','packaging'].includes(s)) return 'active';
    if(['awaiting_approval','awaiting_deposit','deposit_due','balance_due','quote_sent','on_hold'].includes(s)) return 'warning';
    if(['failed_scrap','canceled','cancelled','refunded','overdue','shortage'].includes(s)) return 'danger';
    return 'neutral';
  };
  ERP.ui.statusPill = function(status, group, options){
    options = options || {};
    const label = options.label || ERP.ui.statusLabel(status, group);
    const tone = options.tone || ERP.ui.statusTone(status);
    return '<span class="erp-status-pill" data-tone="'+ERP.ui.escapeHtml(tone)+'">'+ERP.ui.escapeHtml(label)+'</span>';
  };
  ERP.ui.money = ERP.money;
  ERP.ui.grams = function(value){
    const n = ERP.num(value);
    if(Math.abs(n) >= 1000) return (Math.round((n/1000)*10)/10).toLocaleString() + ' kg';
    return Math.round(n * 10) / 10 + 'g';
  };
  ERP.ui.hours = function(value){
    const n = ERP.num(value);
    return (Math.round(n * 10) / 10).toLocaleString() + 'h';
  };
  ERP.ui.percent = function(value){
    const n = ERP.num(value);
    return Math.round(n * 10) / 10 + '%';
  };
  ERP.ui.date = function(value){
    if(!value) return '—';
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined,{month:'short', day:'numeric', year:'numeric'});
  };
  ERP.ui.dateTime = function(value){
    if(!value) return '—';
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined,{month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
  };
  ERP.ui.metricCard = function(label, value, note){
    return '<div class="erp-metric-card"><span>'+ERP.ui.escapeHtml(label)+'</span><strong>'+ERP.ui.escapeHtml(value)+'</strong>'+(note?'<small>'+ERP.ui.escapeHtml(note)+'</small>':'')+'</div>';
  };
  ERP.ui.emptyState = function(title, body){
    return '<div class="erp-empty-state"><strong>'+ERP.ui.escapeHtml(title || 'Nothing here yet')+'</strong><span>'+ERP.ui.escapeHtml(body || '')+'</span></div>';
  };
  ERP.ui.applyStatusPill = function(element, status, group){
    if(!element) return;
    element.classList.add('erp-status-pill');
    element.dataset.tone = ERP.ui.statusTone(status);
    element.textContent = ERP.ui.statusLabel(status, group);
  };
  ERP.ui.installPageBadge = function(label){
    if(!label || document.querySelector('.erp-foundation-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'erp-foundation-badge';
    badge.textContent = label;
    document.body.appendChild(badge);
  };



  /* === ERP Workflow Pass 1: inventory intelligence helpers === */
  ERP.inventory = ERP.inventory || {};
  ERP.inventory.policySuppressesPrompt = function(policy){
    const p = ERP.norm(policy || 'auto');
    return ['specialty','discontinued'].includes(p);
  };
  ERP.inventory.policyLabel = function(policy){
    const p = ERP.norm(policy || 'auto');
    return {auto:'Auto reorder', watch:'Watch only', specialty:'Do not reorder', seasonal:'Seasonal', discontinued:'Discontinued'}[p] || ERP.ui.titleCase(policy || 'Auto reorder');
  };
  ERP.inventory.groupRaw = function(rawRows, options){
    options = options || {};
    const reservedByRoll = options.reservedByRoll || {};
    const map = new Map();
    (rawRows || []).filter(r => ERP.norm(r.roll_status) !== 'retired').forEach(r => {
      const key = [r.material_type || r.material, r.color, r.brand || r.filament].map(x=>String(x||'').trim()).join('|');
      if(!map.has(key)){
        map.set(key,{key,material_type:r.material_type||r.material||'',color:r.color||'',brand:r.brand||r.filament||'',on_hand:0,available:0,reserved:0,threshold:0,reorder_quantity:0,policies:new Set(),links:[],suppliers:new Set(),rolls:0,mounted:0,items:[]});
      }
      const g = map.get(key);
      const onHand = ERP.num(r.remaining_grams || r.remaining);
      const reserved = ERP.num(reservedByRoll[r.id] ?? r.reserved_grams);
      g.on_hand += onHand;
      g.reserved += reserved;
      g.available += Math.max(0, onHand - reserved);
      g.threshold = Math.max(g.threshold, ERP.num(r.reorder_threshold_grams || r.reorder_threshold || r.threshold));
      g.reorder_quantity = Math.max(g.reorder_quantity, ERP.num(r.reorder_quantity || r.reorder_qty));
      g.policies.add(r.reorder_policy || 'auto');
      if(r.reorder_link) g.links.push(r.reorder_link);
      if(r.supplier) g.suppliers.add(r.supplier);
      if(ERP.norm(r.roll_status)!=='empty') g.rolls += 1;
      if(r.is_mounted && ERP.norm(r.roll_status)!=='empty') g.mounted += 1;
      g.items.push(r);
    });
    return [...map.values()].map(g => {
      const policies = [...g.policies];
      const policy = policies.includes('auto') ? 'auto' : (policies[0] || 'auto');
      const shortage = Math.max(0, ERP.num(g.reserved) - ERP.num(g.on_hand));
      const belowThreshold = g.threshold && ERP.num(g.available) <= g.threshold;
      const status = shortage > 0 ? 'shortage' : ERP.num(g.on_hand) <= 0 ? 'out' : belowThreshold ? 'low' : 'ok';
      const recommended = shortage > 0 ? Math.max(shortage, 1000) : belowThreshold ? Math.max(g.threshold - g.available + Math.max(g.reserved,0), 1000) : 0;
      return {...g, policies, policy, status, shortage_grams:Math.round(shortage*10)/10, recommended_buy_grams:Math.round(recommended*10)/10, link:g.links[0] || '', supplier:[...g.suppliers][0] || ''};
    }).sort((a,b)=>{
      const score = {shortage:0,out:1,low:2,ok:3};
      return (score[a.status]??3)-(score[b.status]??3) || b.reserved-a.reserved || a.available-b.available;
    });
  };
  ERP.inventory.demandByMaterial = function(jobs){
    const demand = new Map();
    (jobs || []).filter(ERP.jobShouldReserveInventory).forEach(job => {
      const qty = Math.max(1, ERP.num(job.quantity) || 1);
      ERP.recipeRowsForJob(job).forEach(row => {
        const grams = ERP.num(row.grams_each || row.grams || row.estimated_grams) * qty;
        if(!grams) return;
        const key = ERP.materialKey(row);
        if(!demand.has(key)) demand.set(key,{key,material:row.material||row.material_type||'',color:row.color||'',brand:row.filament||row.brand||'',grams:0,jobs:0});
        const d = demand.get(key);
        d.grams += grams;
        d.jobs += 1;
      });
    });
    return [...demand.values()].sort((a,b)=>b.grams-a.grams);
  };
  ERP.inventory.purchasePlan = function(rawRows, jobs, options){
    options = options || {};
    const groups = ERP.inventory.groupRaw(rawRows, options);
    const rows = groups.map(g => {
      const suppressed = ERP.inventory.policySuppressesPrompt(g.policy);
      let recommendation = 'Enough stock';
      let tone = 'success';
      if(g.status === 'shortage') { recommendation = 'Shortage — order before starting'; tone = 'danger'; }
      else if(g.status === 'out') { recommendation = suppressed ? 'Out — do not auto reorder' : 'Out — reorder'; tone = suppressed ? 'neutral' : 'danger'; }
      else if(g.status === 'low') { recommendation = suppressed ? 'Low — watch only' : 'Buy soon'; tone = suppressed ? 'warning' : 'warning'; }
      else if(g.reserved > 0 && g.available < Math.max(250, g.threshold || 0)) { recommendation = 'Watch after queued work'; tone = 'warning'; }
      return {...g, suppressed, recommendation, tone};
    });
    const demand = ERP.inventory.demandByMaterial(jobs || []);
    const critical = rows.filter(r=>['shortage','out'].includes(r.status) && !r.suppressed).length;
    const buySoon = rows.filter(r=>r.recommendation === 'Buy soon' || r.recommendation.includes('order')).length;
    const specialty = rows.filter(r=>r.suppressed).length;
    const reserved = rows.reduce((s,r)=>s+ERP.num(r.reserved),0);
    const shortage = rows.reduce((s,r)=>s+ERP.num(r.shortage_grams),0);
    return {rows,demand,summary:{critical,buySoon,specialty,reserved_grams:Math.round(reserved*10)/10,shortage_grams:Math.round(shortage*10)/10}};
  };


  ERP.authReady = async function(){
    if(window.OliPolyAuth?.ensure) return await window.OliPolyAuth.ensure();
    return null;
  };

  ERP.currentUser = async function(){
    if(window.OliPolyAuth?.getUser) return await window.OliPolyAuth.getUser();
    return null;
  };

  ERP.markReady = function(){
    document.documentElement.dataset.erpCoreReady = 'true';
    window.dispatchEvent(new CustomEvent('olipoly:erp-ready', {detail:{version:ERP.version, page:ERP.page}}));
  };

  window.addEventListener('error', function(event){
    const msg = event && event.message ? event.message : 'Unknown script error';
    if (/ResizeObserver loop|Script error/i.test(msg)) return;
    console.warn('[OliPolyERP] captured error:', msg);
    ERP.showCloudStatus('ERP noticed a page error. Check Console if something looks stuck.', 'error');
  });

  window.addEventListener('unhandledrejection', function(event){
    const reason = event && event.reason ? (event.reason.message || String(event.reason)) : 'Promise failed';
    console.warn('[OliPolyERP] captured promise rejection:', reason);
    if (/fetch|supabase|network|Failed to fetch|JWT|auth/i.test(reason)){
      ERP.showCloudStatus('Cloud/auth request failed. Refresh or sign in again if data does not load.', 'warning');
    }
  });

  document.addEventListener('DOMContentLoaded', function(){
    ERP.installDefaultInternalDock();
    ERP.markReady();
  });

  window.OliPolyERP = ERP;
})();
