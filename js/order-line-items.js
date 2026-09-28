(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OliPolyLineItems = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function number(value, label, integer = false) {
    if (value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 || (integer && (!Number.isInteger(Number(value)) || Number(value) < 1))) {
      throw new Error(`${label} must be ${integer ? 'a positive whole number' : 'a nonnegative number'}.`);
    }
    return Number(value);
  }
  function normalize(items) {
    if (!Array.isArray(items) || items.length > 100) throw new Error('Use up to 100 order items.');
    const ids = new Set();
    return items.map((item, index) => {
      const id = String(item.id || `item-${index + 1}`);
      if (ids.has(id)) throw new Error('Each item must have a unique identity.');
      ids.add(id);
      const description = String(item.description || '').trim();
      if (!description || description.length > 500) throw new Error('Enter an item description (up to 500 characters).');
      const quantity = number(item.quantity, `${description} quantity`, true);
      const unit_price = number(item.unit_price, `${description} unit price`);
      const hours_each = number(item.hours_each ?? 0, `${description} print hours`);
      const materials = (item.materials || []).map(material => ({
        inventory_pick: String(material.inventory_pick || ''), material: String(material.material || ''),
        color: String(material.color || ''), filament: String(material.filament || ''),
        grams_each: number(material.grams_each, `${description} filament grams`)
      }));
      return {id, description, quantity, unit_price, line_total:money(quantity * unit_price), hours_each, materials};
    });
  }
  // Weighted per-unit values adapt a mixed-item job to the existing Production
  // recipe/reservation contract. The original per-item recipes remain intact.
  function productionSummary(items) {
    const lines = normalize(items);
    const quantity = lines.reduce((sum, item) => sum + item.quantity, 0);
    if (!quantity) throw new Error('Add at least one item.');
    const hours = lines.reduce((sum, item) => sum + item.quantity * item.hours_each, 0);
    const grouped = new Map();
    lines.forEach(item => item.materials.forEach(material => {
      const key = [material.material,material.color,material.filament].map(v => v.trim().toLowerCase()).join('|');
      const previous = grouped.get(key) || {...material, grams_each:0};
      previous.grams_each += material.grams_each * item.quantity / quantity;
      grouped.set(key, previous);
    }));
    const recipe = [...grouped.values()];
    const grams = lines.reduce((sum, item) => sum + item.materials.reduce((g, m) => g + m.grams_each * item.quantity, 0), 0);
    const subtotal = money(lines.reduce((sum, item) => sum + item.line_total, 0));
    return {items:lines, quantity, hours, grams, recipe, subtotal, hoursEach:hours / quantity, gramsEach:grams / quantity, priceEach:subtotal / quantity};
  }
  function commercial(items) {
    return normalize(items).map(({id, description, quantity, unit_price, line_total}) => ({id, description, quantity, unit_price, line_total}));
  }
  function tableRows(items, formatMoney) {
    // Documents display the saved line amount; only the pricing engine computes it.
    return items.map(item => `<tr><td>${escape(item.description)}</td><td style="text-align:center">${escape(item.quantity)}</td><td style="text-align:right">${escape(formatMoney(item.unit_price))}</td><td style="text-align:right">${escape(formatMoney(item.line_total))}</td></tr>`).join('');
  }
  function mount(container, {materials = false, inventoryOptions = () => '', minItems = 1, onChange = () => {}} = {}) {
    let rows = [];
    let disabled = false;
    const uid = () => globalThis.crypto.randomUUID();
    const field = (label, key, value, type = 'text', min = '0', step = 'any') => `<label>${label}<input data-field="${key}" type="${type}" value="${escape(value)}" ${type === 'number' ? `min="${min}" step="${step}"` : ''} ${disabled ? 'disabled' : ''}></label>`;
    function render() {
      container.innerHTML = rows.map((row, i) => `<fieldset data-item="${i}" style="margin:10px 0;padding:12px;border:1px solid var(--line,#ddd);border-radius:12px"><legend>Item ${i + 1}</legend><div class="form-grid">
        ${field('Description','description',row.description)}${field('Quantity','quantity',row.quantity,'number','1','1')}${field('Unit price ($)','unit_price',row.unit_price,'number')}
        ${materials ? field('Print hours / item','hours_each',row.hours_each,'number') : ''}
        <button type="button" class="btn-ghost" data-remove="${i}" ${disabled || rows.length <= minItems ? 'disabled' : ''}>Remove item</button></div>
        ${materials ? `<div>${(row.materials || []).map((m, n) => `<div class="form-grid" data-material="${n}"><label>Filament<select data-field="inventory_pick" ${disabled ? 'disabled' : ''}>${inventoryOptions(m.inventory_pick || [m.material,m.color,m.filament].join(' | '))}</select></label>${field('Grams / item','grams_each',m.grams_each,'number')}<button type="button" class="btn-ghost" data-remove-material="${n}" ${disabled ? 'disabled' : ''}>Remove filament</button></div>`).join('')}<button type="button" class="btn-ghost" data-add-material="${i}" ${disabled ? 'disabled' : ''}>+ Filament</button></div>` : ''}</fieldset>`).join('') + `<button type="button" class="btn-ghost" data-add ${disabled ? 'disabled' : ''}>+ Add item</button>`;
    }
    container.addEventListener('input', event => {
      const key = event.target.dataset.field;
      const item = event.target.closest('[data-item]');
      if (!key || !item || disabled) return;
      const row = rows[Number(item.dataset.item)];
      const material = event.target.closest('[data-material]');
      const target = material ? row.materials[Number(material.dataset.material)] : row;
      target[key] = event.target.value;
      if (key === 'inventory_pick') {
        const [materialName = '', color = '', filament = ''] = event.target.value.split(' | ');
        Object.assign(target, {material:materialName, color, filament});
      }
      onChange();
    });
    container.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || disabled) return;
      if ('add' in button.dataset) rows.push({id:uid(), description:'New item', quantity:1, unit_price:0, hours_each:0, materials:[]});
      else if ('remove' in button.dataset && rows.length > minItems) rows.splice(Number(button.dataset.remove),1);
      else if ('addMaterial' in button.dataset) rows[Number(button.dataset.addMaterial)].materials.push({grams_each:0});
      else if ('removeMaterial' in button.dataset) rows[Number(button.closest('[data-item]').dataset.item)].materials.splice(Number(button.dataset.removeMaterial),1);
      else return;
      render(); onChange();
    });
    render();
    return {
      get: () => normalize(rows),
      hasItems: () => rows.length > 0,
      set(items) { rows = normalize(items || []); render(); },
      setDisabled(value) { disabled = !!value; render(); }
    };
  }
  return Object.freeze({normalize, productionSummary, commercial, tableRows, mount, escape});
});
