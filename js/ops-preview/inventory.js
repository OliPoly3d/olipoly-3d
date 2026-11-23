(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyOpsInventory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = {
    materials: ['PLA', 'PLA Basic', 'PLA Matte', 'PLA Silk', 'PETG', 'PETG-CF', 'ABS', 'ASA', 'TPU'],
    brands: ['Bambu Lab', 'Polymaker', 'eSUN', 'Overture'],
    colors: ['Black', 'White', 'Gray', 'Red', 'Blue', 'Green', 'Yellow'],
    units: ['each', 'g', 'kg', 'oz', 'lb', 'ft', 'sq.ft.', 'in', 'sq.in.', 'ml', 'L'],
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const number = value => new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(Number(value || 0));
  const dollars = value => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(Number(value || 0));
  const date = value => value ? new Date(value).toLocaleString() : 'Not recorded';
  const input = (label, name, value, type = 'text', attrs = '') => `<label>${escape(label)}<input name="${name}" type="${type}" value="${escape(value)}" ${attrs}></label>`;
  function numeric(label, name, value, attrs = '') {
    const minimum = attrs.includes('min=') ? '' : 'min="0"';
    const step = attrs.includes('step=') ? '' : 'step=".01"';
    return input(label, name, value, 'number', `${minimum} ${step} required ${attrs}`);
  }
  const textarea = (label, name, value = '', attrs = '') => `<label class="full">${escape(label)}<textarea name="${name}" ${attrs}>${escape(value)}</textarea></label>`;
  const checkbox = (label, name, checked = false) => `<label class="inventory-check"><input name="${name}" type="checkbox" ${checked ? 'checked' : ''}>${escape(label)}</label>`;
  const button = (label, action, id = '') => `<button type="button" data-inv-action="${action}" data-inv-id="${escape(id)}">${escape(label)}</button>`;
  const select = (label, name, options, selected) => `<label>${escape(label)}<select name="${name}">${options.map(([value, text]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  function choices(snapshot, name) {
    const saved = snapshot.options?.[name];
    return [...new Set(saved || defaults[name])];
  }
  function summary(snapshot) {
    const rolls = (snapshot.rolls || []).filter(roll => roll.active !== false && roll.status !== 'retired');
    return {
      mounted: rolls.filter(r => r.is_mounted && r.remaining_grams > 0).length,
      mountedGrams: rolls.filter(r => r.is_mounted).reduce((n, r) => n + Number(r.remaining_grams), 0),
      refills: rolls.filter(r => !r.is_mounted && r.remaining_grams > 0).length,
      refillGrams: rolls.filter(r => !r.is_mounted).reduce((n, r) => n + Number(r.remaining_grams), 0),
      empty: snapshot.pool?.available_empty ?? null,
    };
  }
  function supplyWarnings(snapshot, today = new Date().toISOString().slice(0, 10)) {
    return (snapshot.supplies || []).filter(s => (!s.reorder_policy || s.reorder_policy === 'auto') &&
      (!s.snooze_until || s.snooze_until < today) && Number(s.quantity_on_hand) <= Number(s.reorder_threshold));
  }
  function create({snapshot, stocks, save, warnings}) {
    let data = snapshot;
    let inventory = stocks;
    let section = 'filament';
    let search = '';
    let editor = null;
    function update(next, nextStocks) { data = next; inventory = nextStocks; }
    function listField(label, name, value, list) {
      return input(label, name, value, 'text', `list="inventory-${list}" required maxlength="100"`);
    }
    function datalists() {
      return Object.keys(defaults).map(name => `<datalist id="inventory-${name}">${choices(data, name).map(value => `<option value="${escape(value)}"></option>`).join('')}</datalist>`).join('');
    }
    function form(type, id, content, submit) {
      return `<form class="card inventory-editor" data-inv-form="${type}" data-inv-id="${escape(id || '')}"><div class="form-grid">${content}${textarea('Reason / audit note', 'reason', '', 'required maxlength="2000"')}</div><div class="actions" style="margin-top:18px"><button class="primary" type="submit">${submit}</button>${button('Cancel', 'cancel')}</div></form>`;
    }
    function rollEditor(id) {
      const r = id ? data.rolls.find(row => row.id === id) : {
        material_type:'PETG', color_name:'Black', brand:'', roll_label:'', starting_grams:1000,
        remaining_grams:1000, cost_per_spool:0, reorder_threshold_grams:250, roll_type:'refill', reusable_spool:true,
      };
      const content = `<h2 class="full">${id ? 'Edit roll details' : 'Add a roll or refill'}</h2>
        ${input('Unique roll label', 'roll_label', r.roll_label, 'text', 'required maxlength="200"')}
        ${listField('Material type', 'material_type', r.material_type, 'materials')}
        ${listField('Color', 'color_name', r.color_name, 'colors')}
        ${input('Brand', 'brand', r.brand, 'text', 'list="inventory-brands" maxlength="100"')}
        ${input('Storage location', 'location', r.location)}
        ${numeric('Initial net filament (g)', 'starting_grams', r.starting_grams, 'min=".01"')}
        ${id ? '' : numeric('Net filament currently remaining (g)', 'remaining_grams', r.remaining_grams)}
        ${numeric('Cost of this roll / refill ($)', 'cost_per_spool', r.cost_per_spool)}
        ${numeric('Reorder level for material / color (g)', 'reorder_threshold_grams', r.reorder_threshold_grams)}
        ${id ? `<p class="muted full">${r.is_mounted ? 'On a spool' : 'Unmounted refill'} · ${number(r.remaining_grams)} g remaining. Use Adjust / weigh to change the recorded quantity.</p><input name="roll_type" type="hidden" value="${escape(r.roll_type)}"><input name="reusable_spool" type="hidden" value="${r.reusable_spool}">` : `${select('Purchased as', 'roll_type', [['refill','Unmounted refill'],['spool','Filament on its own spool']], r.roll_type)}${checkbox('Spool can be reused after emptying', 'reusable_spool', r.reusable_spool)}`}
        ${input('Supplier', 'supplier', r.supplier)}${input('Reorder link', 'reorder_url', r.reorder_url, 'url')}${textarea('Roll notes', 'notes', r.notes)}
        <p class="muted full">Adding filament on its own spool adds that physical spool. Mounting a refill uses one of your recorded empty reusable spools.</p>`;
      return form('save_roll', id, content, id ? 'Save roll details' : 'Add roll');
    }
    function adjustmentEditor(type, id) {
      const roll = type === 'adjust_roll';
      const r = (roll ? data.rolls : data.supplies).find(row => row.id === id);
      return form(type, id, `<h2 class="full">${roll ? 'Adjust / weigh' : 'Record usage or counted stock'} · ${escape(roll ? r.roll_label : r.item_name)}</h2>
        <p class="muted full">Recorded ${number(roll ? r.remaining_grams : r.quantity_on_hand)} ${roll ? 'g' : escape(r.unit_type)}${roll ? ` · ${number(r.reserved_grams)} g reserved` : ''}.</p>
        ${select('Entry method', 'mode', roll ? [['set','Set counted net grams'], ...r.is_mounted ? [['weigh','Weigh mounted spool (gross minus tare)']] : []] : [['set','Set counted stock'],['receive','Receive additional stock'],['consume','Record quantity used']], 'set')}
        ${numeric(roll ? 'Counted net filament (g)' : `Quantity (${r.unit_type})`, 'quantity', roll ? r.remaining_grams : r.quantity_on_hand)}
        ${roll ? `${numeric('Gross spool weight (g)', 'gross_grams', r.last_gross_grams || 0, 'disabled')}${numeric('Empty spool / tare weight (g)', 'tare_grams', r.tare_grams || 0, 'disabled')}<p class="full" data-inv-weight-preview hidden><output data-inv-net>Calculated net filament = ${number((r.last_gross_grams || 0) - (r.tare_grams || 0))} g</output></p><p class="muted full">For a weigh-in, use gross and tare from the same physical spool, including any adapters. Confirm your scale accuracy and units. Net grams = gross − tare.</p>` : ''}`, 'Save inventory adjustment');
    }
    function supplyEditor(id) {
      const s = id ? data.supplies.find(row => row.id === id) : {quantity_on_hand:0, cost_per_unit:0, reorder_threshold:0, unit_type:'each'};
      return form('save_supply', id, `<h2 class="full">${id ? 'Edit supply' : 'Add non-filament supply'}</h2>
        ${input('Item name', 'item_name', s.item_name, 'text', 'required maxlength="200"')}${input('Category', 'category', s.category)}
        ${listField('Measurement unit', 'unit_type', s.unit_type, 'units')}
        ${id ? `<p class="muted full">${number(s.quantity_on_hand)} ${escape(s.unit_type)} on hand. Use Record usage / count for quantity changes.</p>` : numeric('Opening quantity', 'quantity_on_hand', s.quantity_on_hand)}
        ${numeric('Cost per measurement unit ($)', 'cost_per_unit', s.cost_per_unit)}${numeric('Low-stock level', 'reorder_threshold', s.reorder_threshold)}
        ${checkbox('Exclude from low-stock warnings', 'exclude_warning', s.reorder_policy && s.reorder_policy !== 'auto')}
        ${input('Supplier', 'supplier', s.supplier)}${input('Reorder link', 'reorder_link', s.reorder_link, 'url')}${textarea('Supply notes', 'notes', s.notes)}`, id ? 'Save supply details' : 'Add supply');
    }
    function renderEditor() {
      if (!editor) return '';
      const {type, id} = editor;
      if (type === 'save_roll') return rollEditor(id);
      if (type === 'save_supply') return supplyEditor(id);
      if (type === 'adjust_roll' || type === 'adjust_supply') return adjustmentEditor(type, id);
      if (type === 'spool_count') return form(type, '', `<h2 class="full">Count empty reusable spools</h2>${numeric('Empty spools available', 'available_empty', data.pool?.available_empty ?? 0, 'step="1"')}${numeric('Retired / unusable spools', 'retired', data.pool?.retired ?? 0, 'step="1"')}${textarea('Spool notes', 'notes', data.pool?.notes)}<p class="muted full">Count physically empty spools. Filament already on a spool is shown separately. Saving this count records an audit adjustment.</p>`, 'Save spool count');
      if (type === 'mount_roll' || type === 'unmount_roll') {
        const r = data.rolls.find(row => row.id === id);
        return form(type, id, `<h2 class="full">${type === 'mount_roll' ? 'Mount refill' : 'Free reusable spool'} · ${escape(r.roll_label)}</h2><p class="muted full">${type === 'mount_roll' ? 'This uses one recorded empty spool. Confirm the refill is physically installed on it.' : 'This adds one empty spool. Physically remove or transfer any remaining filament first. Its net grams stay recorded as an unmounted refill.'}</p>${checkbox('I have completed the physical spool change', 'confirm')}`, 'Record spool change');
      }
      return '';
    }
    function filamentTable() {
      const terms = search.toLowerCase().trim().split(/\s+/);
      const rolls = data.rolls.filter(r => terms.every(term => [r.material_type,r.color_name,r.brand,r.roll_label,r.location].join(' ').toLowerCase().includes(term)));
      const keys = [...new Set(rolls.map(r => `${r.material_type} / ${r.color_name}`))];
      const groups = keys.map(key => {
        const stock = inventory.find(s => s.key === key);
        const group = rolls.filter(r => `${r.material_type} / ${r.color_name}` === key);
        const active = group.filter(roll => roll.active !== false && roll.status !== 'retired');
        const onHand = stock?.grams ?? active.reduce((sum, r) => sum + Number(r.remaining_grams), 0);
        const reserved = stock?.reserved ?? active.reduce((sum, r) => sum + Number(r.reserved_grams || 0), 0);
        return `<tbody><tr class="inventory-group"><th colspan="4">${escape(key)} · ${number(onHand)} g on hand · ${number(reserved)} g reserved · ${number(onHand-reserved)} g available <label class="inventory-check"><input type="checkbox" data-inventory-warning="${escape(key)}" ${warnings?.()?.excluded?.includes(key) ? 'checked' : ''} ${warnings?.() ? '' : 'disabled'}>Exclude from low-stock warnings</label></th></tr>${group.map(r=>`<tr><th scope="row">${escape(r.roll_label || r.spool_label || r.id)}<small>${escape(r.brand || 'Brand not recorded')} · ${escape(r.location || 'Location not recorded')}</small><small>${escape(r.id)}</small></th><td>${number(r.remaining_grams)} g<small>${number(r.reserved_grams)} g reserved</small></td><td>${r.status === 'retired' || r.active === false ? 'Retired · ' : ''}${r.is_mounted ? 'On spool' : 'Unmounted refill'}<small>${dollars(r.cost_per_gram * 1000)} / kg</small></td><td><div class="actions">${button('Edit', 'save_roll', r.id)}${button('Adjust / weigh', 'adjust_roll', r.id)}${!r.is_mounted && r.remaining_grams>0 ? button('Mount refill', 'mount_roll', r.id) : r.is_mounted && r.reusable_spool ? button('Free spool', 'unmount_roll', r.id) : ''}</div></td></tr>`).join('')}</tbody>`;
      }).join('');
      return `<section class="card"><div class="section-head"><h2>Filament rolls & refills</h2>${button('+ Add roll', 'save_roll')}</div><label>Search material, brand, color, label or location<input id="inv-search" type="search" value="${escape(search)}" placeholder="Try PETG black or shelf"></label><p class="muted">${rolls.length} of ${data.rolls.length} rolls · Net filament excludes spool weight.</p><div class="inventory-scroll"><table class="inventory-table"><thead><tr><th>Roll / brand</th><th>Filament</th><th>Physical state</th><th>Actions</th></tr></thead>${groups || '<tbody><tr><td colspan="4">No rolls match. Add a roll to record opening stock or a purchase.</td></tr></tbody>'}</table></div></section>`;
    }
    function suppliesTable() {
      return `<section class="card"><div class="section-head"><h2>Non-filament supplies</h2>${button('+ Add supply', 'save_supply')}</div><p class="muted">Purchased components, packaging, labels and consumables. Cost is per recorded measurement unit.</p><div class="inventory-scroll"><table class="inventory-table"><thead><tr><th>Supply</th><th>On hand</th><th>Cost / unit</th><th>Low-stock level</th><th>Actions</th></tr></thead><tbody>${data.supplies.map(s=>`<tr><th>${escape(s.item_name)}<small>${escape(s.category)}</small></th><td>${number(s.quantity_on_hand)} ${escape(s.unit_type)}</td><td>${dollars(s.cost_per_unit)}</td><td>${s.reorder_policy && s.reorder_policy!=='auto' ? 'Warning excluded' : `${number(s.reorder_threshold)} ${escape(s.unit_type)}`}</td><td><div class="actions">${button('Edit', 'save_supply', s.id)}${button('Record usage / count', 'adjust_supply', s.id)}</div></td></tr>`).join('') || '<tr><td colspan="5">Add your first supply.</td></tr>'}</tbody></table></div></section>`;
    }
    function history() {
      return `<section class="card"><h2>Inventory adjustment history</h2><p class="muted">Latest 100 changes. Production usage remains linked to its production attempt in the existing movement ledger.</p>${data.events.map(e=>`<details class="inventory-event"><summary>${escape(date(e.created_at))} · ${escape(e.after_data?.roll_label || e.after_data?.item_name || e.kind.replaceAll('_',' '))} · ${escape(e.reason)}</summary><p>${escape(e.kind)} · ${escape(e.item_id || 'Inventory settings')}</p><div class="two-col"><div><h3>Before</h3><pre>${escape(JSON.stringify(e.before_data,null,2))}</pre></div><div><h3>After</h3><pre>${escape(JSON.stringify(e.after_data,null,2))}</pre></div></div></details>`).join('') || '<p>No adjustments recorded yet.</p>'}</section>`;
    }
    function settings() {
      return form('options', '', `<h2 class="full">Edit dropdown choices</h2><p class="muted full">One choice per line. Existing roll and supply records keep their saved values. You can also type a new value directly when adding or editing stock.</p>${Object.keys(defaults).map(name=>textarea(name[0].toUpperCase()+name.slice(1),name,choices(data,name).join('\n'),'required')).join('')}`, 'Save dropdown choices');
    }
    function render() {
      const counts=summary(data);
      return `<div data-inventory-root>${datalists()}<div class="grid metrics inventory-metrics"><section class="card metric"><small>FILAMENT ON SPOOLS</small><strong>${counts.mounted}</strong><small>${number(counts.mountedGrams)} g net filament</small></section><section class="card metric"><small>UNMOUNTED REFILLS</small><strong>${counts.refills}</strong><small>${number(counts.refillGrams)} g net filament</small></section><section class="card metric"><small>EMPTY REUSABLE SPOOLS</small><strong>${counts.empty === null ? 'Count needed' : number(counts.empty)}</strong><small>${number(data.pool?.retired)} retired · ${escape(date(data.pool?.updated_at))}</small>${button('Count / audit spools', 'spool_count')}</section></div><nav class="tabs inventory-tabs" aria-label="Inventory sections">${[['filament','Filament'],['supplies','Supplies'],['history','Adjustment history'],['settings','Dropdown choices']].map(([id,label])=>`<button type="button" data-inv-section="${id}" ${section===id?'class="active" aria-current="page"':''}>${label}</button>`).join('')}</nav>${renderEditor()}${section==='filament'?filamentTable():section==='supplies'?suppliesTable():section==='history'?history():settings()}</div>`;
    }
    function click(target) {
      if (target.dataset.invSection) { section=target.dataset.invSection; editor=null; return true; }
      if (!target.dataset.invAction) return false;
      editor=target.dataset.invAction==='cancel'?null:{type:target.dataset.invAction,id:target.dataset.invId || null};
      return true;
    }
    async function submit(formNode) {
      const type=formNode.dataset.invForm;
      const values=Object.fromEntries(new FormData(formNode));
      const reason=String(values.reason || '').trim();
      const id=formNode.dataset.invId || null;
      const fields={...values};delete fields.reason;
      let action={type,id,reason,data:fields};
      if (['save_roll','save_supply'].includes(type)) {
        for (const name of type==='save_roll'?['starting_grams','cost_per_spool','reorder_threshold_grams',...id?[]:['remaining_grams']]:['cost_per_unit','reorder_threshold',...id?[]:['quantity_on_hand']]) fields[name]=Number(fields[name]);
        fields.reusable_spool=values.reusable_spool==='on'||values.reusable_spool==='true';
        fields.exclude_warning=values.exclude_warning==='on';
      } else if (type==='adjust_roll'||type==='adjust_supply') {
        for (const name of ['quantity','gross_grams','tare_grams']) if (fields[name]!==undefined) fields[name]=Number(fields[name]);
      } else if (type==='spool_count') { fields.available_empty=Number(fields.available_empty);fields.retired=Number(fields.retired); }
      else if (type==='options') action.data=Object.fromEntries(Object.keys(defaults).map(name=>[name,[...new Set(String(values[name]).split('\n').map(v=>v.trim()).filter(Boolean))]]));
      else if (type==='mount_roll'||type==='unmount_roll') {
        if (values.confirm!=='on') throw new Error('Confirm you completed the physical spool change.');
        fields.confirm=true;
      }
      await save(action);
      editor=null;
    }
    return {render,update,click,submit,search:value=>{search=value;},summary:()=>summary(data)};
  }
  return {create,summary,supplyWarnings,choices};
});
