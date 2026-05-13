/* OliPoly 3D Active Projects / Print Queue
   Supabase cloud storage + Push to Quote Tool draft creation.
*/
(() => {
  const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';

  const $ = (id) => document.getElementById(id);
  const PROJECTS_TABLE = 'active_projects';
  const LS_KEY = 'olipoly_active_projects_local_v1';

  const state = {
    user: null,
    projects: [],
    editingId: null,
    filterStatus: 'all',
    filterType: 'all',
    search: '',
    sort: 'smart'
  };

  const TYPE_LABELS = {
    customer_request: 'Customer Request',
    needs_quote: 'Needs Quote',
    active_quote: 'Active Quote',
    po_order: 'PO / Large Order',
    craft_stock: 'Craft Show Stock',
    internal_idea: 'Internal Idea',
    reorder_candidate: 'Reorder Candidate'
  };

  const STATUS_LABELS = {
    idea: 'Idea / Requested',
    need_details: 'Need Details',
    ready_to_quote: 'Ready to Quote',
    pushed_to_quote: 'Pushed to Quote',
    quoted: 'Quoted',
    approved: 'Approved',
    printing: 'Printing',
    post_processing: 'Post-Processing',
    ready: 'Ready',
    delivered: 'Delivered',
    on_hold: 'On Hold',
    declined: 'Declined / Cancelled'
  };

  const PRIORITY_WEIGHT = { urgent: 0, high: 1, normal: 2, low: 3 };
  const STATUS_WEIGHT = {
    printing: 0,
    approved: 1,
    ready_to_quote: 2,
    need_details: 3,
    pushed_to_quote: 4,
    quoted: 5,
    idea: 6,
    post_processing: 7,
    ready: 8,
    on_hold: 9,
    delivered: 10,
    declined: 11
  };

  function token(){ return localStorage.getItem('sb_token') || null; }

  async function sbApi(path, options = {}){
    const headers = {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(options.headers || {})
    };
    const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.message || data?.error_description || data?.hint || JSON.stringify(data || {});
      throw new Error(msg || `Supabase request failed (${res.status})`);
    }
    return data;
  }

  function toast(message){
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function money(n){
    return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(n) || 0);
  }

  function hours(n){
    const v = Number(n) || 0;
    return v ? `${v.toFixed(v >= 10 ? 1 : 2).replace(/\.0+$/,'')} hr` : '—';
  }

  function todayISO(){ return new Date().toISOString().slice(0,10); }

  function dueBucket(due){
    if (!due) return 'No date';
    const today = new Date(todayISO() + 'T00:00:00');
    const d = new Date(due + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
    if (diff === 0) return 'Due today';
    if (diff <= 7) return `Due in ${diff}d`;
    return due;
  }

  function localRead(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  }

  function localWrite(list){ localStorage.setItem(LS_KEY, JSON.stringify(list)); }

  async function getUser(){
    if (!token()) return null;
    try { return await sbApi('/auth/v1/user', { method:'GET' }); }
    catch { return null; }
  }

  async function signIn(){
    const email = $('email')?.value.trim();
    const password = $('password')?.value;
    if (!email || !password) return toast('Enter email and password.');
    try {
      const data = await sbApi('/auth/v1/token?grant_type=password', {
        method:'POST',
        body: JSON.stringify({ email, password })
      });
      if (data?.access_token) localStorage.setItem('sb_token', data.access_token);
      state.user = await getUser();
      updateAuthUI();
      await loadProjects();
      toast('Signed in. Projects synced.');
    } catch (err) {
      alert(`Login failed:\n\n${err.message || err}`);
    }
  }

  async function signUp(){
    const email = $('email')?.value.trim();
    const password = $('password')?.value;
    if (!email || !password) return toast('Enter email and password.');
    try {
      const data = await sbApi('/auth/v1/signup', {
        method:'POST',
        body: JSON.stringify({ email, password })
      });
      if (data?.access_token) localStorage.setItem('sb_token', data.access_token);
      state.user = await getUser();
      updateAuthUI();
      await loadProjects();
      toast('Account created or confirmation sent.');
    } catch (err) {
      alert(`Create account failed:\n\n${err.message || err}`);
    }
  }

  function signOut(){
    localStorage.removeItem('sb_token');
    state.user = null;
    updateAuthUI();
    loadProjects();
  }

  function updateAuthUI(){
    const signed = !!state.user?.id;
    $('authStatus').textContent = signed
      ? `Cloud sync active: ${state.user.email || 'signed in'}`
      : 'Not signed in. You can use browser fallback, but cloud push-to-quote needs Supabase login.';
    $('logoutBtn')?.classList.toggle('hidden', !signed);
    $('loginBtn')?.classList.toggle('hidden', signed);
    $('signupBtn')?.classList.toggle('hidden', signed);
  }

  async function loadProjects(){
    try {
      state.user = state.user || await getUser();
      if (!state.user?.id) {
        state.projects = localRead();
        render();
        return;
      }
      const rows = await sbApi(`/rest/v1/${PROJECTS_TABLE}?select=*&user_id=eq.${encodeURIComponent(state.user.id)}&order=updated_at.desc`, { method:'GET' });
      state.projects = Array.isArray(rows) ? rows : [];
      render();
    } catch (err) {
      console.warn(err);
      state.projects = localRead();
      render();
      toast('Cloud load failed. Showing browser fallback.');
    }
  }

  function projectFromForm(){
    const id = state.editingId || (crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}`);
    const now = new Date().toISOString();
    return {
      id,
      user_id: state.user?.id || null,
      project_title: $('projectTitle').value.trim(),
      project_type: $('projectType').value,
      project_status: $('projectStatus').value,
      priority: $('priority').value,
      customer_name: $('customerName').value.trim() || null,
      customer_email: $('customerEmail').value.trim() || null,
      customer_phone: $('customerPhone').value.trim() || null,
      source: $('source').value.trim() || null,
      quantity: Number($('quantity').value) || 1,
      material: $('material').value.trim() || null,
      color: $('color').value.trim() || null,
      estimated_print_hours: Number($('estimatedPrintHours').value) || 0,
      estimated_price: Number($('estimatedPrice').value) || 0,
      machine_preference: $('machinePreference').value,
      due_date: $('dueDate').value || null,
      event_name: $('eventName').value.trim() || null,
      quote_number: $('quoteNumber').value.trim() || null,
      order_number: $('orderNumber').value.trim() || null,
      notes: $('notes').value.trim() || null,
      updated_at: now,
      created_at: state.projects.find(p => p.id === id)?.created_at || now
    };
  }

  function validateProject(p){
    if (!p.project_title) throw new Error('Project title is required.');
    if (!p.project_type) throw new Error('Project type is required.');
    if (!p.project_status) throw new Error('Status is required.');
  }

  async function saveProject(e){
    e?.preventDefault();
    try {
      const p = projectFromForm();
      validateProject(p);
      if (state.user?.id) {
        await sbApi(`/rest/v1/${PROJECTS_TABLE}?on_conflict=id`, {
          method:'POST',
          headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(p)
        });
      }
      const list = state.projects.filter(x => x.id !== p.id);
      list.unshift(p);
      state.projects = list;
      localWrite(list);
      resetForm();
      render();
      toast('Project saved.');
    } catch (err) {
      alert(`Could not save project:\n\n${err.message || err}`);
    }
  }

  async function deleteProject(id){
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Delete project "${p.project_title}"?`)) return;
    try {
      if (state.user?.id && !String(id).startsWith('local-')) {
        await sbApi(`/rest/v1/${PROJECTS_TABLE}?id=eq.${encodeURIComponent(id)}`, { method:'DELETE' });
      }
      state.projects = state.projects.filter(x => x.id !== id);
      localWrite(state.projects);
      render();
      toast('Project deleted.');
    } catch (err) {
      alert(`Could not delete project:\n\n${err.message || err}`);
    }
  }

  function editProject(id){
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    state.editingId = id;
    const map = {
      projectTitle: p.project_title,
      projectType: p.project_type,
      projectStatus: p.project_status,
      priority: p.priority,
      customerName: p.customer_name,
      customerEmail: p.customer_email,
      customerPhone: p.customer_phone,
      source: p.source,
      quantity: p.quantity,
      material: p.material,
      color: p.color,
      estimatedPrintHours: p.estimated_print_hours,
      estimatedPrice: p.estimated_price,
      machinePreference: p.machine_preference,
      dueDate: p.due_date,
      eventName: p.event_name,
      quoteNumber: p.quote_number,
      orderNumber: p.order_number,
      notes: p.notes
    };
    Object.entries(map).forEach(([id, value]) => { const el = $(id); if (el) el.value = value ?? ''; });
    $('saveBtn').textContent = 'Update Project';
    $('cancelEditBtn').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm(){
    state.editingId = null;
    $('projectForm').reset();
    $('quantity').value = '1';
    $('priority').value = 'normal';
    $('projectStatus').value = 'idea';
    $('machinePreference').value = 'either';
    $('saveBtn').textContent = 'Save Project';
    $('cancelEditBtn').classList.add('hidden');
  }

  async function nextQuoteNumber(){
    try {
      const res = await sbApi('/rest/v1/rpc/next_quote_invoice_number', { method:'POST', body: JSON.stringify({}) });
      const raw = Array.isArray(res) ? res[0] : res;
      const n = typeof raw === 'object' ? (raw.next_quote_invoice_number || raw.next_number || raw.number || raw.value) : raw;
      const digits = String(n || '').replace(/\D/g,'').padStart(6,'0').slice(-6);
      if (digits && digits !== '000000') return `Q-${digits}`;
    } catch (_) {}
    return `Q-${String(Math.floor(Date.now() / 1000)).slice(-6)}`;
  }

  function quoteTypeForProject(p){
    if (p.project_type === 'po_order') return 'po';
    if (p.project_type === 'craft_stock') return 'craft';
    if (p.project_type === 'reorder_candidate') return 'repeat';
    if (p.project_type === 'customer_request' || p.project_type === 'needs_quote') return 'custom';
    return 'retail';
  }

  function buildQuoteFields(p, quoteNumber){
    const liteType = quoteTypeForProject(p);
    const qty = String(p.quantity || 1);
    const notes = [
      p.notes ? `Project notes: ${p.notes}` : '',
      p.color ? `Requested color: ${p.color}` : '',
      p.event_name ? `Event/show: ${p.event_name}` : '',
      p.source ? `Source: ${p.source}` : '',
      p.due_date ? `Needed by: ${p.due_date}` : ''
    ].filter(Boolean).join('\n');

    return {
      liteQuoteType: liteType,
      customerName: p.customer_name || '',
      customerEmail: p.customer_email || '',
      quoteTitle: p.project_title || '',
      qty,
      quantity: qty,
      materialType: p.material || '',
      filament1Color: p.color || '',
      machineHours: p.estimated_print_hours ? String(p.estimated_print_hours) : '0',
      printHours: p.estimated_print_hours ? String(p.estimated_print_hours) : '0',
      manualPiecePrice: p.estimated_price && p.quantity ? String((Number(p.estimated_price) / Number(p.quantity)).toFixed(2)) : '',
      quoteNumber,
      invoiceNumber: `INV-${quoteNumber.replace(/^Q-/, '')}`,
      quoteDate: todayISO(),
      quoteStatus: 'pending',
      customerNotes: notes,
      assumptions: 'Draft quote created from Active Projects. Confirm model, material, color, print time, and final pricing before sending to customer.',
      turnaround: p.due_date ? `Target date: ${p.due_date}` : 'To be confirmed at approval',
      paymentTerms: liteType === 'po' ? 'customer_terms' : 'deposit_to_start',
      professionalMode: liteType === 'po' ? 'on' : 'off',
      sourceProjectId: p.id,
      sourceProjectType: p.project_type || ''
    };
  }

  async function pushToQuote(id){
    const p = state.projects.find(x => x.id === id);
    if (!p) return;
    if (!state.user?.id) return alert('Sign in first. Push to Quote creates a cloud quote record in Supabase.');
    if (p.quote_number && !confirm(`${p.project_title} already has ${p.quote_number}. Create another draft quote anyway?`)) return;

    try {
      const quoteNumber = await nextQuoteNumber();
      const fields = buildQuoteFields(p, quoteNumber);
      const quoteTotal = Number(p.estimated_price) || 0;
      const payload = {
        user_id: state.user.id,
        quote_number: quoteNumber,
        invoice_number: fields.invoiceNumber,
        quote_status: 'pending',
        customer_name: p.customer_name || null,
        customer_email: p.customer_email || null,
        quote_title: p.project_title || null,
        quote_total: quoteTotal,
        quote_data: {
          version: 'active-project-push-v1',
          saved_at: new Date().toISOString(),
          source: 'active-projects',
          source_project_id: p.id,
          lite_quote_type: fields.liteQuoteType,
          fields
        },
        source_project_id: p.id,
        updated_at: new Date().toISOString()
      };

      await sbApi('/rest/v1/quotes?on_conflict=quote_number', {
        method:'POST',
        headers:{ Prefer:'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload)
      });

      const updated = { ...p, project_status: 'pushed_to_quote', quote_number: quoteNumber, updated_at: new Date().toISOString() };
      if (state.user?.id) {
        await sbApi(`/rest/v1/${PROJECTS_TABLE}?id=eq.${encodeURIComponent(p.id)}`, {
          method:'PATCH',
          headers:{ Prefer:'return=representation' },
          body: JSON.stringify({ project_status: updated.project_status, quote_number: quoteNumber, updated_at: updated.updated_at })
        });
      }
      state.projects = state.projects.map(x => x.id === id ? updated : x);
      localWrite(state.projects);
      render();
      toast(`${quoteNumber} draft created.`);
      const open = confirm(`${quoteNumber} was created. Open it in Quote Tool now?`);
      if (open) window.location.href = `quote.html?quote=${encodeURIComponent(quoteNumber)}&project=${encodeURIComponent(p.id)}`;
    } catch (err) {
      alert(`Could not push to Quote Tool:\n\n${err.message || err}\n\nIf the error mentions source_project_id or active_projects, run projects-supabase.sql in Supabase first.`);
    }
  }

  function filteredProjects(){
    const q = state.search.toLowerCase();
    let list = [...state.projects].filter(p => {
      if (state.filterStatus !== 'all' && p.project_status !== state.filterStatus) return false;
      if (state.filterType !== 'all' && p.project_type !== state.filterType) return false;
      if (!q) return true;
      return [p.project_title, p.customer_name, p.customer_email, p.source, p.material, p.color, p.event_name, p.quote_number, p.order_number, p.notes]
        .some(v => String(v || '').toLowerCase().includes(q));
    });
    list.sort((a,b) => {
      if (state.sort === 'updated') return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
      if (state.sort === 'due') return String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31'));
      if (state.sort === 'hours') return (Number(b.estimated_print_hours)||0) - (Number(a.estimated_print_hours)||0);
      return (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2)
        || String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31'))
        || (STATUS_WEIGHT[a.project_status] ?? 6) - (STATUS_WEIGHT[b.project_status] ?? 6);
    });
    return list;
  }

  function renderMetrics(list){
    const active = state.projects.filter(p => !['delivered','declined'].includes(p.project_status)).length;
    const readyQuote = state.projects.filter(p => p.project_status === 'ready_to_quote').length;
    const printHours = state.projects.filter(p => !['delivered','declined','on_hold'].includes(p.project_status)).reduce((s,p) => s + (Number(p.estimated_print_hours) || 0), 0);
    const showStock = state.projects.filter(p => p.project_type === 'craft_stock' && !['delivered','declined'].includes(p.project_status)).length;
    $('metricActive').textContent = active;
    $('metricQuote').textContent = readyQuote;
    $('metricHours').textContent = printHours.toFixed(printHours >= 10 ? 1 : 2).replace(/\.0+$/,'');
    $('metricShow').textContent = showStock;
    const next = list[0];
    $('nextPrint').innerHTML = next ? `<strong>${escapeHtml(next.project_title)}</strong><span>${STATUS_LABELS[next.project_status] || next.project_status} • ${dueBucket(next.due_date)} • ${hours(next.estimated_print_hours)}</span>` : '<strong>No active queue items</strong><span>Add a project to start planning.</span>';
  }

  function escapeHtml(s){ return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  function projectCard(p){
    const canQuote = !['delivered','declined'].includes(p.project_status);
    const quoteBtn = canQuote ? `<button type="button" class="btn small" data-action="push" data-id="${p.id}">Push to Quote</button>` : '';
    return `<article class="project-card priority-${escapeHtml(p.priority || 'normal')}">
      <div class="card-head">
        <div>
          <div class="chips">
            <span class="chip type">${escapeHtml(TYPE_LABELS[p.project_type] || p.project_type)}</span>
            <span class="chip status">${escapeHtml(STATUS_LABELS[p.project_status] || p.project_status)}</span>
            <span class="chip priority">${escapeHtml((p.priority || 'normal').toUpperCase())}</span>
          </div>
          <h3>${escapeHtml(p.project_title || 'Untitled Project')}</h3>
          <p>${escapeHtml([p.customer_name, p.source, p.event_name].filter(Boolean).join(' • ') || 'No customer/source yet')}</p>
        </div>
        <div class="due-pill">${escapeHtml(dueBucket(p.due_date))}</div>
      </div>
      <div class="info-grid">
        <div><span>Qty</span><strong>${escapeHtml(p.quantity || 1)}</strong></div>
        <div><span>Material</span><strong>${escapeHtml(p.material || '—')}</strong></div>
        <div><span>Color</span><strong>${escapeHtml(p.color || '—')}</strong></div>
        <div><span>Print Time</span><strong>${escapeHtml(hours(p.estimated_print_hours))}</strong></div>
        <div><span>Machine</span><strong>${escapeHtml(p.machine_preference || 'either')}</strong></div>
        <div><span>Est. Price</span><strong>${p.estimated_price ? money(p.estimated_price) : '—'}</strong></div>
      </div>
      ${p.notes ? `<div class="notes-preview">${escapeHtml(p.notes)}</div>` : ''}
      <div class="card-links">
        ${p.quote_number ? `<a href="quote.html?quote=${encodeURIComponent(p.quote_number)}">${escapeHtml(p.quote_number)}</a>` : '<span>No quote yet</span>'}
        ${p.order_number ? `<span>${escapeHtml(p.order_number)}</span>` : ''}
      </div>
      <div class="card-actions">
        ${quoteBtn}
        <button type="button" class="ghost small" data-action="edit" data-id="${p.id}">Edit</button>
        <button type="button" class="ghost small danger" data-action="delete" data-id="${p.id}">Delete</button>
      </div>
    </article>`;
  }

  function render(){
    const list = filteredProjects();
    renderMetrics(list);
    const wrap = $('projectsList');
    if (!wrap) return;
    wrap.innerHTML = list.length ? list.map(projectCard).join('') : `<div class="empty">No projects match this view. Add a project or clear filters.</div>`;
    $('countLabel').textContent = `${list.length} shown / ${state.projects.length} total`;
  }

  function bind(){
    $('projectForm')?.addEventListener('submit', saveProject);
    $('cancelEditBtn')?.addEventListener('click', resetForm);
    $('loginBtn')?.addEventListener('click', signIn);
    $('signupBtn')?.addEventListener('click', signUp);
    $('logoutBtn')?.addEventListener('click', signOut);
    $('refreshBtn')?.addEventListener('click', loadProjects);
    $('filterStatus')?.addEventListener('change', e => { state.filterStatus = e.target.value; render(); });
    $('filterType')?.addEventListener('change', e => { state.filterType = e.target.value; render(); });
    $('sortMode')?.addEventListener('change', e => { state.sort = e.target.value; render(); });
    $('searchBox')?.addEventListener('input', e => { state.search = e.target.value; render(); });
    $('projectsList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit') editProject(id);
      if (btn.dataset.action === 'delete') deleteProject(id);
      if (btn.dataset.action === 'push') pushToQuote(id);
    });
  }

  async function init(){
    bind();
    state.user = await getUser();
    updateAuthUI();
    await loadProjects();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
