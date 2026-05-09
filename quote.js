
/* === OliPoly Standalone Supabase Bridge ===
   quote-tool.js is archived, so quote.js provides sbApi/getCurrentSbUser directly.
*/
(() => {
  const SUPABASE_URL = 'https://alffoktlwhpfothieude.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_z7kdHOnVhLgBpn0uXwd4GA_tXwWQx_Y';

  function accessToken(){
    return localStorage.getItem('sb_token') || null;
  }

  window.sbApi = window.sbApi || async function sbApi(path, options = {}) {
    const token = accessToken();
    const headers = {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
    const data = await response.json().catch(() => null);
    return {
      ok: response.ok,
      data,
      error: response.ok ? null : data
    };
  };

  window.getCurrentSbUser = window.getCurrentSbUser || async function getCurrentSbUser(){
    const token = accessToken();
    if (!token) return null;

    const result = await window.sbApi('/auth/v1/user', { method: 'GET' });
    return result.ok ? result.data : null;
  };
})();



/* === OliPoly Quote Standalone Base ===
   quote-tool.js was archived, so quote.js now provides the base helpers itself.
*/
(() => {
  const $ = (id) => document.getElementById(id);

  const fmtMoney = (value) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);

  function num(id) {
    return Number(($(id)?.value || "").toString().replace(/[^0-9.-]/g, "")) || 0;
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function setVal(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value ?? "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function readQty() {
    return num("qty") || num("quantity") || 1;
  }

  function renderStandaloneQuote() {
    const qty = Math.max(1, readQty());

    const filament =
      (num("filament1Cost") * num("filament1Used") / 1000) +
      (num("filament2Cost") * num("filament2Used") / 1000) +
      (num("filament3Cost") * num("filament3Used") / 1000) +
      (num("filament4Cost") * num("filament4Used") / 1000);

    const materialCost = filament + num("materialCost") + num("packagingCost");
    const machineCost = (num("machineHours") || num("printHours")) * (num("machineRate") || 0);
    const designCost = num("designHours") * num("designRate");
    const laborCost = (num("postHours") * num("postRate")) + num("laborCost");
    const shipping = num("shipping") || num("shippingCost") || num("deliveryCost");
    const overridePiece = num("manualPiecePrice") || num("pricePerItem") || 0;

    const subtotal = overridePiece > 0
      ? overridePiece * qty
      : materialCost + machineCost + designCost + laborCost + shipping;

    const taxRate = num("salesTax") || num("taxPreset") || 0;
    const tax = subtotal * taxRate / 100;
    const total = subtotal + tax;

    setText("sumSubtotal", fmtMoney(subtotal));
    setText("sumTax", fmtMoney(tax));
    setText("sumQuote", fmtMoney(total));
    setText("outFinal", fmtMoney(total));
    setText("finalTotal", fmtMoney(total));
    setText("sumPerItem", fmtMoney(total / qty));
    setText("outPerItem", fmtMoney(total / qty));

    return { subtotal, tax, total, qty, perItem: total / qty };
  }

  async function ensureDocumentNumbersStandalone(force = false) {
    const quoteEl = $("quoteNumber");
    if (quoteEl && (force || !quoteEl.value.trim())) {
      const fallback = String(Math.floor(Date.now() / 1000)).slice(-6);
      quoteEl.value = `Q-${fallback}`;
    }

    const invEl = $("invoiceNumber");
    if (invEl && (force || !invEl.value.trim())) {
      const q = quoteEl?.value?.trim()?.replace(/^Q-/, "") || String(Math.floor(Date.now() / 1000)).slice(-6);
      invEl.value = `INV-${q}`;
    }

    const dateEl = $("quoteDate");
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

    renderStandaloneQuote();
  }

  function loadDemoStandalone() {
    const n = String(Math.floor(Date.now() / 1000)).slice(-6);
    const demo = {
      liteQuoteType: "po",
      customerName: "Demo Customer",
      customerEmail: "customer@example.com",
      quoteTitle: "Demo custom 3D printed parts",
      qty: "25",
      quantity: "25",
      filament1Cost: "23",
      filament1Used: "350",
      machineHours: "6",
      machineRate: "3.75",
      designHours: "1",
      designRate: "50",
      postHours: ".5",
      postRate: "35",
      salesTax: "7.25",
      taxPreset: "7.25",
      quoteNumber: `Q-${n}`,
      invoiceNumber: `INV-${n}`,
      quoteDate: new Date().toISOString().slice(0, 10),
      quoteStatus: "pending",
      customerNotes: "Demo quote for testing cloud save, PDF, and customer email workflow.",
      assumptions: "Demo pricing is for testing only.",
      turnaround: "To be confirmed at approval",
      paymentTerms: "customer_terms",
      professionalMode: "on"
    };

    Object.entries(demo).forEach(([id, value]) => setVal(id, value));
    renderStandaloneQuote();

    if (typeof window.quotePatchToast === "function") window.quotePatchToast("Demo loaded.");
    else {
      let el = $("liteStatusToast");
      if (el) {
        el.textContent = "Demo loaded.";
        el.classList.add("show");
        setTimeout(() => el.classList.remove("show"), 2400);
      }
    }
  }

  function copySummaryStandalone() {
    renderStandaloneQuote();
    const summary = [
      `Quote: ${$("quoteNumber")?.value || ""}`,
      `Customer: ${$("customerName")?.value || ""}`,
      `Project: ${$("quoteTitle")?.value || ""}`,
      `Total: ${$("sumQuote")?.textContent || $("outFinal")?.textContent || ""}`
    ].join("\n");

    navigator.clipboard?.writeText(summary).then(
      () => window.quotePatchToast?.("Summary copied."),
      () => prompt("Copy summary:", summary)
    );
  }

  window.render = window.render || renderStandaloneQuote;
  window.ensureDocumentNumbers = window.ensureDocumentNumbers || ensureDocumentNumbersStandalone;
  window.loadDemo = window.loadDemo || loadDemoStandalone;
  window.copySummary = window.copySummary || copySummaryStandalone;

  function bindStandaloneBaseButtons() {
    ["demoBtn", "loadDemoBtn"].forEach((id) => {
      const btn = $(id);
      if (btn && btn.dataset.standaloneDemoBound !== "true") {
        btn.dataset.standaloneDemoBound = "true";
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          window.loadDemo();
        });
      }
    });

    const copy = $("copySummaryBtn");
    if (copy && copy.dataset.standaloneCopyBound !== "true") {
      copy.dataset.standaloneCopyBound = "true";
      copy.addEventListener("click", (event) => {
        event.preventDefault();
        window.copySummary();
      });
    }

    document.querySelectorAll("input[id], select[id], textarea[id]").forEach((el) => {
      if (el.dataset.standaloneRenderBound === "true") return;
      el.dataset.standaloneRenderBound = "true";
      el.addEventListener("input", window.render);
      el.addEventListener("change", window.render);
    });

    window.ensureDocumentNumbers(false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindStandaloneBaseButtons);
  else bindStandaloneBaseButtons();

  setTimeout(bindStandaloneBaseButtons, 500);
  setTimeout(bindStandaloneBaseButtons, 1500);
})();


/* OliPoly 3D Quote Tool Lite - Supabase Saved Quotes V6
   This file is a Lite-only helper layer.
   Standalone quote.js build: quote-tool.js has been archived and is no longer required.

   What this adds:
   - Quote Format / Customer Type presets
   - Supabase-backed Saved Quotes using public.quotes
   - Browser localStorage fallback if not logged in / cloud unavailable
   - Keeps Q-###### / INV-###### / OP-###### logic in quote-tool.js
*/

(() => {
  const $ = (id) => document.getElementById(id);
  const AUTO_FLAG = "liteAutoFilled";
  const LOCAL_KEY = "olipoly_quote_history_v3";

  const fieldSelector = "input[id], select[id], textarea[id]";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function safeMoneyNumber(text) {
    return Number(String(text || "").replace(/[^0-9.-]/g, "")) || 0;
  }

  function toast(message) {
    let el = $("liteStatusToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "liteStatusToast";
      el.className = "lite-status-toast";
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._liteTimer);
    el._liteTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function setVal(id, value, fire = true) {
    const el = $(id);
    if (!el) return;
    el.value = value ?? "";
    if (fire) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function setAutoText(id, value) {
    const el = $(id);
    if (!el) return;
    const current = (el.value || "").trim();
    const wasAuto = el.dataset[AUTO_FLAG] === "true";
    if (!current || wasAuto) {
      el.value = value;
      el.dataset[AUTO_FLAG] = "true";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function clearAutoFlagOnUserEdit() {
    ["customerNotes", "assumptions", "invoiceNotes", "turnaround"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => {
        if (document.activeElement === el) el.dataset[AUTO_FLAG] = "false";
      });
    });
  }

  function nearestFieldWrap(id) {
    const el = $(id);
    if (!el) return null;
    return el.closest(".full") || el.closest(".form-grid > div") || el.parentElement;
  }

  function showField(id, show) {
    const wrap = nearestFieldWrap(id);
    if (wrap) wrap.classList.toggle("lite-field-hidden", !show);
  }

  const CONFIGS = {
    retail: {
      label: "Retail / Individual Customer",
      chip: "Friendly customer quote",
      summary: "Friendly customer quote with simple payment terms and minimal business fields.",
      orderType: "custom",
      professionalMode: "off",
      paymentTerms: "deposit_to_start",
      depositPercent: 50,
      invoiceType: "deposit",
      showBusinessFields: false,
      showPo: false,
      assumptions:
        "Quote is based on the details shared so far. Final color, finish, and small print details may vary slightly.",
      notes:
        "Includes the printed item(s) described and standard print preparation."
    },
    custom: {
      label: "Custom Design Project",
      chip: "Design-focused quote",
      summary: "Best for projects that need design work, proofing, measurements, or back-and-forth review.",
      orderType: "custom",
      professionalMode: "off",
      paymentTerms: "deposit_to_start",
      depositPercent: 60,
      invoiceType: "deposit",
      showBusinessFields: false,
      showPo: false,
      assumptions:
        "Includes standard design iteration and print setup. Final output may vary slightly.",
      notes:
        "Includes custom design support based on the information provided. Please confirm fit, color, and use before approval."
    },
    business: {
      label: "Business / Bulk Order",
      chip: "Bulk/company quote",
      summary: "Turns on professional formatting, company/contact fields, and bulk-friendly payment wording.",
      orderType: "business_bulk",
      professionalMode: "on",
      paymentTerms: "deposit_to_start",
      depositPercent: 50,
      invoiceType: "deposit",
      showBusinessFields: true,
      showPo: false,
      assumptions:
        "Quote is based on the listed quantity, materials, and production approach. Final requirements should be confirmed at approval.",
      notes:
        "Bulk pricing is based on the quantity shown and may change if requirements change.",
      invoiceNotes:
        "Please reference the invoice number with payment or internal approval."
    },
    repeat: {
      label: "Repeat Customer",
      chip: "Repeat/reorder quote",
      summary: "Fast reorder format using lighter deposit defaults and repeat-order wording.",
      orderType: "repeat",
      professionalMode: "off",
      paymentTerms: "deposit_to_start",
      depositPercent: 25,
      invoiceType: "deposit",
      showBusinessFields: false,
      showPo: false,
      assumptions:
        "Repeat quote based on current material, labor, and machine assumptions.",
      notes:
        "Repeat-order quote based on requested quantity and available materials."
    },
    craft: {
      label: "Craft Show / Pre-Made",
      chip: "Event/inventory style",
      summary: "Best for pre-made inventory, craft show items, or simple event-stock pricing.",
      orderType: "craft_show",
      professionalMode: "off",
      paymentTerms: "due_on_receipt",
      depositPercent: 0,
      invoiceType: "full",
      showBusinessFields: false,
      showPo: false,
      assumptions:
        "Pricing is for available or planned event inventory. Quantities may change as inventory sells.",
      notes:
        "Pickup, event purchase, or shipping details can be confirmed separately."
    },
    po: {
      label: "Professional / PO Customer",
      chip: "Formal PO-ready quote",
      summary: "Most formal format. Shows company/contact/PO fields, professional PDF styling, and invoice-ready terms.",
      orderType: "business_bulk",
      professionalMode: "on",
      paymentTerms: "customer_terms",
      depositPercent: 0,
      invoiceType: "full",
      showBusinessFields: true,
      showPo: true,
      assumptions:
        "Quote is based on the listed scope, quantity, materials, and production assumptions. Scope changes may require an updated quote.",
      notes:
        "Prepared for business purchasing review. Please confirm PO, delivery, and vendor setup requirements before approval.",
      invoiceNotes:
        "Please reference the invoice number and PO number with payment or internal approval."
    }
  };

  function relabelButtons() {
    const review = $("generateQuoteBtn");
    if (review) review.textContent = "Check Missing Inputs";

    const save = $("saveQuoteBtn");
    if (save) save.textContent = "Save / Update Quote";

    const load = $("loadQuoteBtn");
    if (load) load.textContent = "Load Selected";

    const del = $("deleteQuoteBtn");
    if (del) del.textContent = "Delete Selected";
  }

  function applyQuoteType(type, options = {}) {
    const cfg = CONFIGS[type] || CONFIGS.retail;
    const allowAutofill = options.allowAutofill !== false;

    document.body.dataset.liteQuoteType = type;

    setVal("orderType", cfg.orderType);
    setVal("professionalMode", cfg.professionalMode);
    setVal("paymentTerms", cfg.paymentTerms);
    setVal("depositPercent", cfg.depositPercent);
    setVal("invoiceType", cfg.invoiceType);

    if (type === "craft") setVal("quoteStatus", "accepted", false);

    showField("companyName", cfg.showBusinessFields);
    showField("contactName", cfg.showBusinessFields);
    showField("poNumber", cfg.showPo);

    if (allowAutofill) {
      setAutoText("assumptions", cfg.assumptions);
      setAutoText("customerNotes", cfg.notes);
      if (cfg.invoiceNotes) setAutoText("invoiceNotes", cfg.invoiceNotes);
    }

    const summary = $("liteFormatSummary");
    if (summary) {
      summary.innerHTML = `<strong>${cfg.label}</strong><br>${cfg.summary}<br><span class="lite-format-chip">${cfg.chip}</span>`;
    }

    const modeHint = $("modeHint");
    if (modeHint) modeHint.textContent = cfg.summary;

    if (typeof window.render === "function") window.render();
  }

  function collectFields() {
    const fields = {};
    document.querySelectorAll(fieldSelector).forEach((el) => {
      if (!el.id) return;
      if (["savedQuotesSelect"].includes(el.id)) return;
      if (el.type === "button" || el.type === "submit") return;
      if (el.type === "checkbox") fields[el.id] = !!el.checked;
      else fields[el.id] = el.value ?? "";
    });
    return fields;
  }

  function populateFields(fields = {}) {
    Object.entries(fields).forEach(([id, value]) => {
      const el = $(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value ?? "";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const liteType = fields.liteQuoteType || $("liteQuoteType")?.value || "retail";
    if ($("liteQuoteType")) $("liteQuoteType").value = liteType;
    applyQuoteType(liteType, { allowAutofill: false });

    if (typeof window.render === "function") window.render();
  }

  function buildQuoteData() {
    const fields = collectFields();
    const liteQuoteType = $("liteQuoteType")?.value || "retail";
    fields.liteQuoteType = liteQuoteType;

    return {
      version: "quote-tool-lite-v6",
      saved_at: new Date().toISOString(),
      source: "quote-tool-lite",
      lite_quote_type: liteQuoteType,
      fields
    };
  }

  function readLocalHistory() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function writeLocalHistory(list) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  }

  function localSaveFallback() {
    const data = buildQuoteData();
    const quoteNumber = $("quoteNumber")?.value?.trim();
    if (!quoteNumber) return;

    const list = readLocalHistory();
    const idx = list.findIndex((q) => q.quoteNumber === quoteNumber);

    const record = {
      quoteNumber,
      invoiceNumber: $("invoiceNumber")?.value?.trim() || "",
      quoteStatus: $("quoteStatus")?.value || "pending",
      customerName: $("customerName")?.value?.trim() || $("companyName")?.value?.trim() || "",
      customerEmail: $("customerEmail")?.value?.trim() || "",
      quoteTitle: $("quoteTitle")?.value?.trim() || "",
      quoteTotal: safeMoneyNumber($("sumQuote")?.textContent || $("outFinal")?.textContent),
      quoteData: data,
      updatedAt: new Date().toISOString()
    };

    if (idx >= 0) list[idx] = { ...list[idx], ...record };
    else list.unshift(record);

    writeLocalHistory(list);
  }

  async function ensureNumbersBeforeSave() {
    if (typeof window.ensureDocumentNumbers === "function") {
      await window.ensureDocumentNumbers(false);
      await sleep(50);
    }
  }

  async function currentUser() {
    if (typeof window.getCurrentSbUser === "function") {
      return await window.getCurrentSbUser();
    }
    return null;
  }

  async function api(path, options = {}) {
    if (typeof window.sbApi !== "function") {
      throw new Error("Supabase helper sbApi() was not initialized.");
    }
    const res = await window.sbApi(path, options);
    if (!res.ok || res.error) {
      const msg = res.error?.message || res.error?.error_description || JSON.stringify(res.error || res.data || {});
      throw new Error(msg || "Supabase request failed");
    }
    return res.data;
  }

  function quoteLabel(q, source) {
    const parts = [
      q.quote_number || q.quoteNumber || "Quote",
      q.quote_title || q.quoteTitle || "",
      q.customer_name || q.customerName || "",
      q.quote_status || q.quoteStatus || ""
    ].filter(Boolean);
    const suffix = source === "cloud" ? "☁️" : "Browser";
    return `${parts.join(" • ")} — ${suffix}`;
  }

  async function fetchCloudQuotes() {
    await currentUser(); // returns null if not logged in; RLS/api will also protect
    const rows = await api("/rest/v1/quotes?select=id,quote_number,invoice_number,quote_status,customer_name,customer_email,quote_title,quote_total,updated_at&order=updated_at.desc", {
      method: "GET"
    });
    return Array.isArray(rows) ? rows : [];
  }

  async function fetchCloudQuoteByNumber(quoteNumber) {
    const q = encodeURIComponent(quoteNumber);
    const rows = await api(`/rest/v1/quotes?select=*&quote_number=eq.${q}&limit=1`, { method: "GET" });
    if (!Array.isArray(rows) || !rows[0]) throw new Error("Quote not found in Supabase.");
    return rows[0];
  }

  async function saveCloudQuote() {
    await ensureNumbersBeforeSave();
    if (typeof window.render === "function") window.render();

    const user = await currentUser();
    if (!user?.id) {
      throw new Error("Not logged in. Log into orders-admin.html in this browser first to save cloud quotes.");
    }

    const quoteNumber = $("quoteNumber")?.value?.trim();
    if (!quoteNumber) throw new Error("Quote number is missing.");

    const data = buildQuoteData();
    const payload = {
      user_id: user.id,
      quote_number: quoteNumber,
      invoice_number: $("invoiceNumber")?.value?.trim() || null,
      quote_status: $("quoteStatus")?.value || "pending",
      customer_name: ($("customerName")?.value?.trim() || $("companyName")?.value?.trim() || null),
      customer_email: $("customerEmail")?.value?.trim() || null,
      quote_title: $("quoteTitle")?.value?.trim() || null,
      quote_total: safeMoneyNumber($("sumQuote")?.textContent || $("outFinal")?.textContent),
      quote_data: data,
      updated_at: new Date().toISOString()
    };

    const saved = await api("/rest/v1/quotes?on_conflict=quote_number", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload)
    });

    localSaveFallback();
    return saved;
  }

  async function deleteCloudQuote(quoteNumber) {
    const q = encodeURIComponent(quoteNumber);
    await api(`/rest/v1/quotes?quote_number=eq.${q}`, { method: "DELETE" });
  }

  function populateDropdown(cloudRows = [], localRows = [], source = "cloud") {
    const select = $("savedQuotesSelect");
    const summary = $("historySummary");
    if (!select) return;

    const current = select.value;
    select.innerHTML = `<option value="">Select a saved quote</option>`;

    cloudRows.forEach((q) => {
      const opt = document.createElement("option");
      opt.value = `cloud:${q.quote_number}`;
      opt.textContent = quoteLabel(q, "cloud");
      select.appendChild(opt);
    });

    localRows.forEach((q) => {
      if (cloudRows.some((c) => c.quote_number === q.quoteNumber)) return;
      const opt = document.createElement("option");
      opt.value = `local:${q.quoteNumber}`;
      opt.textContent = quoteLabel(q, "local");
      select.appendChild(opt);
    });

    if ([...select.options].some((o) => o.value === current)) select.value = current;

    if (summary) {
      const cloudCount = cloudRows.length;
      const localCount = localRows.length;
      const status = cloudCount
        ? `<span class="saved-source-pill">Cloud active</span>`
        : `<span class="saved-source-pill local">Browser fallback</span>`;
      summary.innerHTML = `${status}<div class="saved-cloud-status">${cloudCount} cloud quote${cloudCount === 1 ? "" : "s"} loaded. ${localCount} browser backup${localCount === 1 ? "" : "s"} available.</div>`;
    }
  }

  async function refreshSavedQuotes() {
    const localRows = readLocalHistory();
    try {
      const cloudRows = await fetchCloudQuotes();
      populateDropdown(cloudRows, localRows, "cloud");
      return { source: "cloud", cloudRows, localRows };
    } catch (err) {
      console.warn("Cloud quote load failed; using browser fallback:", err);
      populateDropdown([], localRows, "local");
      return { source: "local", cloudRows: [], localRows, error: err };
    }
  }

  async function loadSelectedQuote() {
    const select = $("savedQuotesSelect");
    if (!select?.value) {
      toast("Choose a saved quote first.");
      return;
    }

    const [source, quoteNumber] = select.value.split(":");
    try {
      let data;
      if (source === "cloud") {
        const row = await fetchCloudQuoteByNumber(quoteNumber);
        data = row.quote_data;
      } else {
        const local = readLocalHistory().find((q) => q.quoteNumber === quoteNumber);
        data = local?.quoteData || local?.quote_data;
      }

      if (!data?.fields) throw new Error("Saved quote data is missing fields.");

      populateFields(data.fields);
      toast(`Loaded ${quoteNumber}`);
    } catch (err) {
      alert(`Could not load quote:\n\n${err.message || err}`);
    }
  }

  async function deleteSelectedQuote() {
    const select = $("savedQuotesSelect");
    if (!select?.value) {
      toast("Choose a saved quote first.");
      return;
    }

    const [source, quoteNumber] = select.value.split(":");
    const ok = confirm(`Delete saved quote ${quoteNumber}?`);
    if (!ok) return;

    try {
      if (source === "cloud") {
        await deleteCloudQuote(quoteNumber);
      }

      const local = readLocalHistory().filter((q) => q.quoteNumber !== quoteNumber);
      writeLocalHistory(local);

      await refreshSavedQuotes();
      toast(`Deleted ${quoteNumber}`);
    } catch (err) {
      alert(`Could not delete quote:\n\n${err.message || err}`);
    }
  }

  function beforePdf() {
    const type = $("liteQuoteType")?.value || "retail";
    applyQuoteType(type);

    if (!$("turnaround")?.value.trim()) {
      setAutoText("turnaround", type === "po" || type === "business" ? "To be confirmed at approval" : "Usually 5–7 business days");
    }
  }

  function patchPdfButtons() {
    ["customerPdfBtn", "invoicePdfBtn", "printBtn"].forEach((id) => {
      const btn = $(id);
      if (!btn) return;
      btn.addEventListener("click", beforePdf, { capture: true });
    });
  }

  function patchButtons() {
    const save = $("saveQuoteBtn");
    const load = $("loadQuoteBtn");
    const del = $("deleteQuoteBtn");
    const review = $("generateQuoteBtn");

    if (save) {
      save.onclick = async (e) => {
        e.preventDefault();
        try {
          await saveCloudQuote();
          await refreshSavedQuotes();
          const q = $("quoteNumber")?.value || "Quote";
          toast(`${q} saved to cloud.`);
        } catch (err) {
          console.warn("Cloud save failed; saving browser fallback:", err);
          localSaveFallback();
          await refreshSavedQuotes();
          toast("Saved browser backup. Log into orders-admin for cloud save.");
        }
      };
    }

    if (load) {
      load.onclick = (e) => {
        e.preventDefault();
        loadSelectedQuote();
      };
    }

    if (del) {
      del.onclick = (e) => {
        e.preventDefault();
        deleteSelectedQuote();
      };
    }

    if (review && !review.dataset.litePatched) {
      review.dataset.litePatched = "true";
      review.addEventListener("click", () => {
        setTimeout(() => {
          const notice = $("missingInputsNotice");
          const hasIssues = notice && !notice.classList.contains("hidden") && notice.textContent.trim();
          toast(hasIssues ? "Missing inputs highlighted." : "Quote check complete.");
        }, 250);
      });
    }
  }

  function initQuoteType() {
    const selector = $("liteQuoteType");
    if (selector) {
      selector.addEventListener("change", () => applyQuoteType(selector.value));
      applyQuoteType(selector.value || "retail");
    }
  }

  async function init() {
    clearAutoFlagOnUserEdit();
    relabelButtons();
    initQuoteType();
    patchPdfButtons();
    patchButtons();

    // Give quote-tool.js a moment to finish its own local-history UI, then replace with cloud-aware UI.
    setTimeout(async () => {
      relabelButtons();
      patchButtons();
      await refreshSavedQuotes();
    }, 650);
  }

  document.addEventListener("DOMContentLoaded", init);
})();


/* Customer quote-response Gmail email/link layer V2 */
(() => {
  const $ = (id) => document.getElementById(id);
  const getField = (id) => ($(id)?.value || "").trim();
  const quoteTotalText = () => ($("sumQuote")?.textContent || $("outFinal")?.textContent || $("finalTotal")?.textContent || "").trim();

  function makeToken() {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
  }

  async function liteApi(path, options = {}) {
    if (typeof window.sbApi !== "function") throw new Error("Supabase helper sbApi() was not initialized.");
    const res = await window.sbApi(path, options);
    if (!res.ok || res.error) throw new Error(res.error?.message || JSON.stringify(res.error || res.data || {}));
    return res.data;
  }

  async function ensureCloudQuoteForCustomerLink() {
    const saveBtn = $("saveQuoteBtn");
    if (saveBtn) {
      saveBtn.click();
      await new Promise(resolve => setTimeout(resolve, 900));
    }

    const quoteNumber = getField("quoteNumber");
    if (!quoteNumber) throw new Error("Quote number is missing. Save the quote first.");

    const encoded = encodeURIComponent(quoteNumber);
    let rows = [];
    try {
      rows = await liteApi(`/rest/v1/quotes?select=public_token&quote_number=eq.${encoded}&limit=1`, { method: "GET" });
    } catch (_) {}

    const publicToken = (Array.isArray(rows) && rows[0]?.public_token) ? rows[0].public_token : makeToken();

    await liteApi(`/rest/v1/quotes?quote_number=eq.${encoded}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        public_token: publicToken,
        quote_status: getField("quoteStatus") || "pending",
        updated_at: new Date().toISOString()
      })
    });

    return { quoteNumber, publicToken };
  }

  function buildPlainEmail(link) {
    const customerName = getField("customerName") || getField("contactName") || "";
    const project = getField("quoteTitle") || getField("projectTitle") || "your custom 3D print";
    const total = quoteTotalText() || "See quote";
    const turnaround = getField("turnaround") || "to be confirmed based on approval timing";
    const notes = getField("customerNotes");
    const assumptions = getField("assumptions");

    return `${customerName ? `Hi ${customerName},` : "Hi,"}

Thanks for reaching out! Your OliPoly project quote is ready to review.

Quote: ${getField("quoteNumber")}
Project: ${project}\n${getField("olipolyPartNumber") ? `OliPoly Part #: ${getField("olipolyPartNumber")}\n` : ""}${getField("customerPartNumber") ? `Customer Part #: ${getField("customerPartNumber")}\n` : ""}Estimated total: ${total}
Estimated timing: ${turnaround}

${notes ? `Notes: ${notes}\n\n` : ""}${assumptions ? `Assumptions: ${assumptions}\n\n` : ""}Please use this secure link to review the details, approve the quote, or request changes:

${link}

After approval, your project becomes an OP- order and you can track progress anytime through the OliPoly tracker.

Thank you!
OliPoly 3D`;
  }

  function buildHtmlEmail(link) {
    const customerName = getField("customerName") || getField("contactName") || "";
    const project = getField("quoteTitle") || getField("projectTitle") || "your custom 3D print";
    const total = quoteTotalText() || "See quote";
    const turnaround = getField("turnaround") || "to be confirmed based on approval timing";
    const notes = getField("customerNotes");
    const assumptions = getField("assumptions");
    const quoteNumber = getField("quoteNumber");

    return `<div style="margin:0;background:#fff7fb;padding:24px;font-family:Arial,sans-serif;color:#3f3146;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #f2c4df;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(222,111,184,.14);">
    <div style="height:10px;background:linear-gradient(135deg,#de6fb8,#9d7cff);"></div>

    <div style="padding:26px 26px 10px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;letter-spacing:-.03em;color:#241b2b;">
        Oli<span style="color:#b86be8;">Poly</span> 3D
      </div>
      <div style="margin-top:4px;color:#866a86;font-size:14px;">
        Creative 3D printing brought to life in Ohio
      </div>
    </div>

    <div style="padding:12px 26px 26px;">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.05;margin:8px 0 14px;color:#241b2b;">
        Your OliPoly project quote is ready
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        ${customerName ? `Hi ${customerName},` : "Hi,"}
      </p>

      <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
        Thanks for reaching out! Your custom project quote has been prepared and is ready to review.
      </p>

      <div style="background:#fff7fb;border:1px solid #f2c4df;border-radius:18px;padding:16px 18px;margin:18px 0;">
        <p style="margin:0 0 8px;"><strong>Quote #:</strong> ${quoteNumber}</p>
        <p style="margin:0 0 8px;"><strong>Project:</strong> ${project}</p>
        ${getField("olipolyPartNumber") ? `<p style="margin:0 0 8px;"><strong>OliPoly Part #:</strong> ${getField("olipolyPartNumber")}</p>` : ""}
        ${getField("customerPartNumber") ? `<p style="margin:0 0 8px;"><strong>Customer Part #:</strong> ${getField("customerPartNumber")}</p>` : ""}
        <p style="margin:0 0 8px;"><strong>Estimated total:</strong> ${total}</p>
        <p style="margin:0;"><strong>Estimated timing:</strong> ${turnaround}</p>
      </div>

      ${notes ? `<p style="font-size:15px;line-height:1.55;margin:0 0 10px;"><strong>Notes:</strong> ${notes}</p>` : ""}
      ${assumptions ? `<p style="font-size:15px;line-height:1.55;margin:0 0 10px;"><strong>Assumptions:</strong> ${assumptions}</p>` : ""}

      <div style="background:#fffafc;border:1px solid #f2c4df;border-radius:18px;padding:16px 18px;margin:18px 0;">
        <p style="margin:0 0 8px;font-weight:800;color:#3f3146;">What happens after approval?</p>
        <p style="margin:0 0 6px;color:#604d68;line-height:1.5;">• Your project becomes an OP- order.</p>
        <p style="margin:0 0 6px;color:#604d68;line-height:1.5;">• Scheduling and final production prep begin.</p>
        <p style="margin:0;color:#604d68;line-height:1.5;">• Tracking and payment options are available from the order page.</p>
      </div>

      <p style="font-size:16px;line-height:1.6;margin:18px 0 20px;">
        Use the button below to review the details, approve the quote, or request changes before moving forward.
      </p>

      <div style="text-align:center;margin:26px 0;">
        <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#de6fb8,#9d7cff);color:#ffffff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:999px;">
          Review Quote
        </a>
      </div>

      <p style="font-size:14px;line-height:1.55;color:#816c88;margin:0;">
        If the button does not work, copy and paste this link:<br>${link}
      </p>
    </div>

    <div style="background:#fff7fb;border-top:1px solid #f2c4df;padding:16px 26px;color:#866a86;font-size:13px;line-height:1.5;">
      OliPoly 3D • Custom 3D printing<br>
      OliPoly3D@gmail.com • olipoly3d.com
    </div>
  </div>
</div>`;
  }

  function openGmailCompose(to, subject, body) {
    const gmailUrl =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(to || "")}` +
      `&su=${encodeURIComponent(subject || "")}` +
      `&body=${encodeURIComponent(body || "")}`;
    window.open(gmailUrl, "_blank", "noopener,noreferrer");
  }

  async function prepareCustomerEmail() {
    const btn = $("prepareCustomerEmailBtn");
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Preparing..."; }

      const { quoteNumber, publicToken } = await ensureCloudQuoteForCustomerLink();
      const origin = window.location.origin || "https://olipoly3d.com";
      const link = `${origin}/quote-response.html?q=${encodeURIComponent(quoteNumber)}&token=${encodeURIComponent(publicToken)}`;

      const plainEmail = buildPlainEmail(link);
      const htmlEmail = buildHtmlEmail(link);
      const customerEmail = getField("customerEmail");
      const subject = `OliPoly 3D Quote ${quoteNumber}`;

      await navigator.clipboard.writeText(htmlEmail);
      alert("Styled email HTML copied to your clipboard. Gmail will open with a plain prefilled draft for review. Send from OliPoly3D@gmail.com.");
      openGmailCompose(customerEmail, subject, plainEmail);
    } catch (err) {
      alert(`Could not prepare customer email:\n\n${err.message || err}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Prepare Customer Email"; }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("prepareCustomerEmailBtn")?.addEventListener("click", prepareCustomerEmail);
  });
})();


/* === Customer Responses Panel === */

function buildConfirmationHtmlEmail({ customerName, orderNumber, project, trackLink }) {
  return `<div style="margin:0;background:#fff7fb;padding:24px;font-family:Arial,sans-serif;color:#3f3146;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #f2c4df;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(222,111,184,.14);">
    <div style="height:10px;background:linear-gradient(135deg,#de6fb8,#9d7cff);"></div>

    <div style="padding:26px 26px 10px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;letter-spacing:-.03em;color:#241b2b;">
        Oli<span style="color:#b86be8;">Poly</span> 3D
      </div>
      <div style="margin-top:4px;color:#866a86;font-size:14px;">
        Creative 3D printing brought to life in Ohio
      </div>
    </div>

    <div style="padding:12px 26px 26px;">
      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.05;margin:8px 0 14px;color:#241b2b;">
        Your OliPoly order is confirmed
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        ${customerName ? `Hi ${customerName},` : "Hi,"}
      </p>

      <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
        Thank you — your quote has been approved and your OliPoly order has been created.
      </p>

      <div style="background:#fff7fb;border:1px solid #f2c4df;border-radius:18px;padding:16px 18px;margin:18px 0;">
        <p style="margin:0 0 8px;"><strong>Order #:</strong> ${orderNumber}</p>
        ${project ? `<p style="margin:0;"><strong>Project:</strong> ${project}</p>` : ""}
      </div>

      <p style="font-size:16px;line-height:1.6;margin:18px 0 20px;">
        Your project is now live in the OliPoly tracker. Use the button below to track progress and view payment options.
      </p>

      <div style="text-align:center;margin:26px 0;">
        <a href="${trackLink}" style="display:inline-block;background:linear-gradient(135deg,#de6fb8,#9d7cff);color:#ffffff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:999px;">
          Track Order / View Payment
        </a>
      </div>

      <p style="font-size:14px;line-height:1.55;color:#816c88;margin:0;">
        If you have questions or need to make changes, just reply to this email.
      </p>
    </div>

    <div style="background:#fff7fb;border-top:1px solid #f2c4df;padding:16px 26px;color:#866a86;font-size:13px;line-height:1.5;">
      OliPoly 3D • Custom 3D printing<br>
      OliPoly3D@gmail.com • olipoly3d.com
    </div>
  </div>
</div>`;
}

async function loadCustomerResponses() {
  const list = document.getElementById("responsesList");

  try {
    if (!list) return;

    if (typeof window.sbApi !== "function") {
      list.innerHTML = `<div style="color:#e45a7a;">Could not load customer responses. Supabase helper is not ready yet.</div>`;
      return;
    }

    const res = await window.sbApi(
      `/rest/v1/quotes?select=quote_number,quote_title,quote_status,customer_name,customer_email,quote_data,customer_response,customer_response_message,converted_order_number,confirmation_email_sent,confirmation_email_sent_at,updated_at&customer_response=not.is.null&order=updated_at.desc&limit=10`,
      { method: "GET" }
    );

    if (!res.ok || res.error) {
      throw new Error(res.error?.message || JSON.stringify(res.error || res.data || {}) || "Could not load responses.");
    }

    const rows = Array.isArray(res.data) ? res.data : [];

    if (rows.length === 0) {
      list.innerHTML = `<div style="color:#866a86;">No recent responses yet.</div>`;
      return;
    }

    list.innerHTML = "";

    rows.forEach((q) => {
      const row = document.createElement("div");
      row.style.cssText = `
        padding:12px 14px;
        border-radius:16px;
        background:rgba(255,255,255,0.76);
        border:1px solid rgba(216,107,179,.2);
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        flex-wrap:wrap;
      `;

      const response = q.customer_response || "response";
      const responseColor = response === "accepted" ? "#16a34a" : "#e45a7a";

      const left = document.createElement("div");
      left.style.cssText = "min-width:240px;line-height:1.45;";
      left.innerHTML = `
        <strong>${q.quote_number || "Quote"}</strong> – ${q.quote_title || "Untitled"}<br>
        <span style="color:${responseColor};font-weight:800;">
          ${response.toUpperCase()}
        </span>
        ${q.converted_order_number ? ` → <strong>${q.converted_order_number}</strong>` : ""}
        ${q.customer_response_message ? `<br><em style="color:#6f5d76;">${q.customer_response_message}</em>` : ""}
      `;

      const right = document.createElement("div");
      right.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;";
// ✅ SEND CONFIRMATION EMAIL BUTTON
if (q.customer_response === "accepted" && q.converted_order_number) {
  const emailBtn = document.createElement("button");
  emailBtn.textContent = q.confirmation_email_sent ? "Confirmation Sent ✅" : "Send Confirmation Email";
  emailBtn.className = "btn-ghost";
  emailBtn.type = "button";
  emailBtn.disabled = !!q.confirmation_email_sent;

  if (q.confirmation_email_sent) {
    emailBtn.title = q.confirmation_email_sent_at
      ? `Confirmation email marked sent ${new Date(q.confirmation_email_sent_at).toLocaleString()}`
      : "Confirmation email already marked sent.";
    emailBtn.style.opacity = "0.68";
    emailBtn.style.cursor = "not-allowed";
  }

  emailBtn.onclick = async () => {
    if (q.confirmation_email_sent) return;

    const orderNumber = q.converted_order_number;
    const email =
      q.customer_email ||
      q.quote_data?.fields?.customerEmail ||
      q.quote_data?.fields?.email ||
      q.quote_data?.fields?.contactEmail ||
      "";
    const customerName = q.customer_name || q.quote_data?.fields?.customerName || q.quote_data?.fields?.contactName || "";
    const project = q.quote_title || q.quote_data?.fields?.quoteTitle || q.quote_data?.fields?.projectTitle || "";

    if (!orderNumber || !email) {
      alert("Missing order number or customer email.");
      return;
    }

    const trackLink = `https://olipoly3d.com/track.html?order=${encodeURIComponent(orderNumber)}`;
    const subject = `Order Confirmed – OliPoly 3D (${orderNumber})`;

    const plainBody = `Hi${customerName ? ` ${customerName}` : ""} — your order has been created.

Order #: ${orderNumber}
${project ? `Project: ${project}\n` : ""}
Track your order and complete payment:
${trackLink}

If you have any questions, just reply.

Thanks!
OliPoly 3D`;

    const htmlEmail = buildConfirmationHtmlEmail({ customerName, orderNumber, project, trackLink });

    try {
      await navigator.clipboard.writeText(htmlEmail);
      alert("Styled confirmation email copied to your clipboard. Gmail will open with a plain prefilled draft for review. After Gmail opens, this quote will be marked as confirmation sent.");
    } catch (_) {
      alert("Gmail will open with a plain prefilled draft. Styled copy was not available from this browser. After Gmail opens, this quote will be marked as confirmation sent.");
    }

    const gmailUrl =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(email)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(plainBody)}`;

    window.open(gmailUrl, "_blank", "noopener,noreferrer");

    try {
      const encoded = encodeURIComponent(q.quote_number);
      const markRes = await window.sbApi(`/rest/v1/quotes?quote_number=eq.${encoded}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          confirmation_email_sent: true,
          confirmation_email_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });

      if (!markRes.ok || markRes.error) {
        throw new Error(markRes.error?.message || "Could not mark confirmation sent.");
      }

      emailBtn.textContent = "Confirmation Sent ✅";
      emailBtn.disabled = true;
      emailBtn.style.opacity = "0.68";
      emailBtn.style.cursor = "not-allowed";
      await loadCustomerResponses();
    } catch (err) {
      alert(`Gmail opened, but the sent status could not be saved:\n\n${err.message || err}`);
    }
  };

  right.appendChild(emailBtn);
}
      const loadBtn = document.createElement("button");
      loadBtn.textContent = "Load Quote";
      loadBtn.className = "btn-ghost";
      loadBtn.type = "button";
      loadBtn.onclick = () => {
        const select = document.getElementById("savedQuotesSelect");
        if (select && q.quote_number) {
          select.value = `cloud:${q.quote_number}`;
          document.getElementById("loadQuoteBtn")?.click();
        } else if (q.quote_number) {
          const quoteInput = document.getElementById("quoteNumber");
          if (quoteInput) quoteInput.value = q.quote_number;
        }
      };
      right.appendChild(loadBtn);
const reviseBtn = document.createElement("button");
reviseBtn.textContent = "Mark Revised";
reviseBtn.className = "btn-ghost";
reviseBtn.type = "button";
reviseBtn.onclick = async () => {
  if (!q.quote_number) return;

  const ok = confirm(`Mark ${q.quote_number} as revised and clear the customer response?`);
  if (!ok) return;

  try {
    const encoded = encodeURIComponent(q.quote_number);
    const res = await window.sbApi(`/rest/v1/quotes?quote_number=eq.${encoded}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        quote_status: "revised",
        customer_response: null,
        customer_response_message: null,
        responded_at: null,
        converted_order_number: null,
        confirmation_email_sent: false,
        confirmation_email_sent_at: null,
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok || res.error) {
      throw new Error(res.error?.message || "Could not mark revised.");
    }

    await loadCustomerResponses();
    alert(`${q.quote_number} marked revised. You can now update it and resend the same quote link.`);
  } catch (err) {
    alert(`Could not mark revised:\n\n${err.message || err}`);
  }
};
right.appendChild(reviseBtn);
      if (q.converted_order_number) {
        const orderBtn = document.createElement("button");
        orderBtn.textContent = "Open Orders";
        orderBtn.className = "btn-ghost";
        orderBtn.type = "button";
        orderBtn.onclick = () => {
          window.open("orders-admin.html", "_blank", "noopener,noreferrer");
        };
        right.appendChild(orderBtn);
      }

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });
  } catch (err) {
    console.error("Failed to load customer responses:", err);
    if (list) {
      list.innerHTML = `<div style="color:#e45a7a;">Could not load customer responses. Make sure you are logged in.</div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(loadCustomerResponses, 1200);
});


/* === PDF FORMAT UPGRADE V1: Hero Summary + CTA === */
(() => {
  const $ = (id) => document.getElementById(id);
  let lastPdfMode = "quote";

  const moneyText = (idList, fallback = "$0.00") => {
    for (const id of idList) {
      const el = $(id);
      const text = (el?.textContent || el?.value || "").trim();
      if (text) return text;
    }
    return fallback;
  };

  const fieldText = (idList, fallback = "—") => {
    for (const id of idList) {
      const el = $(id);
      const text = (el?.value || el?.textContent || "").trim();
      if (text) return text;
    }
    return fallback;
  };

  const labelForPaymentTerms = (value) => ({
    due_on_receipt: "Due on receipt",
    deposit_to_start: "Deposit required to start",
    due_on_completion: "Due at completion",
    net_15: "Net 15",
    net_30: "Net 30"
  })[value] || value || "To be confirmed";

  const quoteToOrderNumber = (quoteNumber) => {
    const q = (quoteNumber || "").trim();
    if (!q) return "";
    return q.replace(/^Q-/i, "OP-");
  };

  const isProfessionalMode = () => {
    const type = fieldText(["liteQuoteType"], "").toLowerCase();
    const mode = fieldText(["professionalMode"], "").toLowerCase();
    return mode === "on" || ["business", "po"].includes(type);
  };

  function buildTrackLink(orderNumber) {
    return orderNumber
      ? `https://olipoly3d.com/track.html?order=${encodeURIComponent(orderNumber)}`
      : "https://olipoly3d.com/track.html";
  }

  function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function populatePdfEnhancements() {
    const professional = isProfessionalMode();
    const invoiceMode =
      lastPdfMode === "invoice" ||
      /invoice/i.test($("pdfDocType")?.textContent || "") ||
      /invoice/i.test($("pdfTitle")?.textContent || "");

    const quoteNumber = fieldText(["quoteNumber", "pdfQuoteNumber"], "");
    const orderNumber = quoteToOrderNumber(quoteNumber);
    const trackLink = buildTrackLink(orderNumber);
    const payLink = "https://olipoly3d.com/pay.html";
    const paymentTerms = labelForPaymentTerms(fieldText(["paymentTerms"], ""));
    const turnaround = fieldText(["turnaround", "pdfTurnaround"], "To be confirmed");

    const total = moneyText(["sumQuote", "outFinal", "pdfTotal"], "$0.00");
    const deposit = moneyText(["sumDeposit", "outDeposit", "pdfDeposit"], "$0.00");
    const balance = moneyText(["sumBalance", "outBalance", "pdfBalance"], "$0.00");
    const invoiceAmount = moneyText(["pdfInvoiceAmount", "sumBalance", "outBalance", "outFinal"], total);

    if (invoiceMode) {
      setText("pdfHeroTotalLabel", professional ? "Invoice Amount" : "Amount Due");
      setText("pdfHeroTotal", invoiceAmount);
      setText("pdfHeroDueLabel", "Payment Terms");
      setText("pdfHeroDue", paymentTerms);
      setText("pdfHeroTimeLabel", "Order / Invoice");
      setText("pdfHeroTime", fieldText(["pdfInvoiceNumber", "invoiceNumber"], orderNumber || quoteNumber || "—"));
    } else if (professional) {
      setText("pdfHeroTotalLabel", "Total Contract Value");
      setText("pdfHeroTotal", total);
      setText("pdfHeroDueLabel", "Payment Terms");
      setText("pdfHeroDue", paymentTerms);
      setText("pdfHeroTimeLabel", "Lead Time");
      setText("pdfHeroTime", turnaround);
    } else {
      setText("pdfHeroTotalLabel", "Total Quote");
      setText("pdfHeroTotal", total);
      setText("pdfHeroDueLabel", deposit && deposit !== "$0.00" ? "Due to Start" : "Due at Approval / Pickup");
      setText("pdfHeroDue", deposit && deposit !== "$0.00" ? deposit : balance || total);
      setText("pdfHeroTimeLabel", "Turnaround");
      setText("pdfHeroTime", turnaround);
    }

    const nextCopy = invoiceMode
      ? `Complete payment using the available option, or reply to coordinate fulfillment.`
      : professional
        ? `Approve internally and reference quote ${quoteNumber || "shown above"}. Once accepted, track as ${orderNumber || "the OP- order number"}.`
        : `Review and approve via your email link. After approval, track and pay using your order number.`;

    setHTML("pdfNextSteps", `
      <strong>Next</strong><br>
      ${nextCopy}
    `);

    const paymentCopy = professional
      ? `Pay via tracker/payment page when available. PO customers should reference the quote/order number.`
      : `Pay via tracker after approval, or use the payment page for in-person/craft show payments.`;

    setHTML("pdfPaymentCta", `
      <strong>Pay / Track</strong><br>
      ${paymentCopy}
      <div class="pdf-action-links">
        <a class="pdf-action-link" href="${trackLink}">Track Order</a>
        <a class="pdf-action-link" href="${payLink}">Payment Page</a>
      </div>
    `);

    const tracking = $("pdfTrackingInfo");
    if (tracking && !invoiceMode) {
      tracking.innerHTML = `<strong>Order Tracking</strong><br>After acceptance, track this project using order number <strong>${orderNumber || "OP-######"}</strong> at olipoly3d.com/track.html.`;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("customerPdfBtn")?.addEventListener("click", () => {
      lastPdfMode = "quote";
      setTimeout(populatePdfEnhancements, 50);
    }, { capture: true });

    $("invoicePdfBtn")?.addEventListener("click", () => {
      lastPdfMode = "invoice";
      setTimeout(populatePdfEnhancements, 50);
    }, { capture: true });

    window.addEventListener("beforeprint", populatePdfEnhancements);
  });
})();


/* === PDF CLEANUP FIX V3: hide empty sections + concise notes + visible CTA === */
(() => {
  const $ = (id) => document.getElementById(id);

  const genericNotePhrases = [
    "Includes the printed item(s) described and standard print preparation.",
    "Includes standard design iteration and print setup. Final output may vary slightly.",
    "Quote includes the printed item",
    "standard print preparation",
    "basic finishing"
  ];

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function isGenericOrEmpty(el) {
    const txt = textOf(el);
    if (!txt) return true;
    if (txt.length < 3) return true;
    return genericNotePhrases.some((phrase) => txt.toLowerCase().includes(phrase.toLowerCase()));
  }

  function setEmptyState(id, shouldHide) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("pdf-empty", !!shouldHide);
  }

  function simplifyPdfNotes() {
    const notes = $("pdfCustomerNotes");
    const assumptions = $("pdfAssumptions");
    const tracking = $("pdfTrackingInfo");
    const quoteTerms = $("pdfQuoteTerms");
    const invoiceTerms = $("pdfInvoiceTerms");
    const next = $("pdfNextSteps");
    const pay = $("pdfPaymentCta");

    setEmptyState("pdfCustomerNotes", isGenericOrEmpty(notes));

    if (assumptions && !isGenericOrEmpty(assumptions)) {
      let txt = textOf(assumptions);
      txt = txt
        .replace(/This quote includes collaborative design iteration, proofing, and review until the quoted design direction is mutually accepted\./gi, "Includes standard design iteration and print setup.")
        .replace(/Standard finishing is included unless otherwise noted, and final printed color may vary slightly due to filament batch, material, and printer settings\./gi, "Final output may vary slightly due to material and process characteristics.")
        .replace(/Production timing is scheduled to begin within 24 hours after the quote is confirmed accepted in writing with OliPoly 3D\./gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (txt.length > 210) txt = txt.slice(0, 205).trim() + "…";
      assumptions.innerHTML = `<strong>Quote Notes</strong><br>${txt}`;
    }

    setEmptyState("pdfAssumptions", isGenericOrEmpty(assumptions));
    setEmptyState("pdfTrackingInfo", !textOf(tracking));
    setEmptyState("pdfQuoteTerms", !textOf(quoteTerms));
    setEmptyState("pdfInvoiceTerms", invoiceTerms?.classList.contains("hidden") || !textOf(invoiceTerms));
    setEmptyState("pdfNextSteps", !textOf(next));
    setEmptyState("pdfPaymentCta", !textOf(pay));

    if (pay && !pay.classList.contains("pdf-empty")) {
      const links = pay.querySelector(".pdf-action-links");
      if (links) {
        links.style.display = "flex";
        links.style.flexWrap = "nowrap";
        links.style.gap = "5px";
        links.style.marginTop = "4px";
      }
      pay.querySelectorAll(".pdf-action-link").forEach((a) => {
        a.style.display = "inline-flex";
        a.style.whiteSpace = "nowrap";
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["customerPdfBtn", "invoicePdfBtn"].forEach((id) => {
      $(id)?.addEventListener("click", () => {
        setTimeout(simplifyPdfNotes, 80);
        setTimeout(simplifyPdfNotes, 250);
      }, { capture: true });
    });

    window.addEventListener("beforeprint", simplifyPdfNotes);
  });
})();


/* === PDF CLEANUP FIX V4: note de-dupe + tracking/payment layout === */
(() => {
  const $ = (id) => document.getElementById(id);

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function setHidden(el, hide) {
    if (!el) return;
    el.classList.toggle("pdf-empty", !!hide);
    el.classList.toggle("force-hide", !!hide);
  }

  function getVal(id) {
    return ($(id)?.value || $(id)?.textContent || "").trim();
  }

  function orderFromQuote() {
    const q = getVal("quoteNumber") || getVal("pdfQuoteNumber");
    return q ? q.replace(/^Q-/i, "OP-") : "";
  }

  function compactGenericText(txt) {
    return txt
      .replace(/Quote includes the printed item\(s\) described, standard print preparation, and basic finishing unless otherwise noted\./gi, "")
      .replace(/Includes the printed item\(s\) described and standard print preparation\./gi, "")
      .replace(/This quote includes collaborative design iteration, proofing, and review until the quoted design direction is mutually accepted\./gi, "Includes standard design iteration and print setup.")
      .replace(/Standard finishing is included unless otherwise noted, and final printed color may vary slightly due to filament batch, material, and printer settings\./gi, "Final output may vary slightly.")
      .replace(/Production timing is scheduled to begin within 24 hours after the quote is confirmed accepted in writing with OliPoly 3D\./gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanupPdfV4() {
    const customerNotes = $("pdfCustomerNotes");
    const assumptions = $("pdfAssumptions");
    const tracking = $("pdfTrackingInfo");
    const quoteTerms = $("pdfQuoteTerms");
    const invoiceTerms = $("pdfInvoiceTerms");
    const next = $("pdfNextSteps");
    const pay = $("pdfPaymentCta");

    const rawCustomer = textOf(customerNotes);
    const rawAssumptions = textOf(assumptions);

    const customerLooksGeneric =
      !rawCustomer ||
      /quote includes|printed item|standard print preparation|basic finishing/i.test(rawCustomer);

    setHidden(customerNotes, customerLooksGeneric);

    if (assumptions) {
      let txt = compactGenericText(rawAssumptions);
      if (!txt) {
        txt = "Includes standard print preparation. Final output may vary slightly.";
      }
      if (txt.length > 155) txt = txt.slice(0, 150).trim() + "…";
      assumptions.innerHTML = `<strong>Quote Notes</strong><br>${txt}`;
      setHidden(assumptions, !textOf(assumptions));
    }

    [quoteTerms, invoiceTerms, next, pay, tracking].forEach((el) => {
      if (!el) return;
      const isInvoiceHidden = el.id === "pdfInvoiceTerms" && el.classList.contains("hidden");
      setHidden(el, isInvoiceHidden || !textOf(el));
    });

    const orderNumber = orderFromQuote() || "OP-######";
    const trackHref = `https://olipoly3d.com/track.html${orderNumber !== "OP-######" ? `?order=${encodeURIComponent(orderNumber)}` : ""}`;
    const payHref = "https://olipoly3d.com/pay.html";

    if (tracking && !tracking.classList.contains("force-hide")) {
      tracking.innerHTML = `
        <strong>Order Tracking</strong><br>
        After acceptance, track this project using order number <strong>${orderNumber}</strong>.
        <div class="pdf-action-links only-one">
          <a class="pdf-action-link" href="${trackHref}">Track Order</a>
        </div>
      `;
      setHidden(tracking, false);
    }

    if (next && !next.classList.contains("force-hide")) {
      next.innerHTML = `
        <strong>Next Steps</strong><br>
        Review and approve via your email link. After approval, use your order number to track progress and payment status.
      `;
      setHidden(next, false);
    }

    if (pay && !pay.classList.contains("force-hide")) {
      pay.innerHTML = `
        <strong>Pay</strong><br>
        Pay through the tracker after approval, or use the payment page for in-person/craft show payments.
        <div class="pdf-action-links only-one">
          <a class="pdf-action-link" href="${payHref}">Payment Page</a>
        </div>
      `;
      setHidden(pay, false);
    }

    document.querySelectorAll(".pdf-note").forEach((el) => {
      const txt = textOf(el);
      if (!txt) setHidden(el, true);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["customerPdfBtn", "invoicePdfBtn"].forEach((id) => {
      $(id)?.addEventListener("click", () => {
        setTimeout(cleanupPdfV4, 60);
        setTimeout(cleanupPdfV4, 180);
        setTimeout(cleanupPdfV4, 360);
      }, { capture: true });
    });

    window.addEventListener("beforeprint", cleanupPdfV4);
  });
})();


/* === PDF CLEANUP FIX V5: quote notes and order-only pay wording === */
(() => {
  const $ = (id) => document.getElementById(id);

  function val(id) {
    return ($(id)?.value || $(id)?.textContent || "").trim();
  }

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function setHidden(el, hide) {
    if (!el) return;
    el.classList.toggle("pdf-empty", !!hide);
    el.classList.toggle("force-hide", !!hide);
  }

  function isProfessionalMode() {
    const type = val("liteQuoteType").toLowerCase();
    const mode = val("professionalMode").toLowerCase();
    return mode === "on" || type === "business" || type === "po";
  }

  function orderFromQuote() {
    const q = val("quoteNumber") || val("pdfQuoteNumber");
    return q ? q.replace(/^Q-/i, "OP-") : "OP-######";
  }

  function buildQuoteNoteText() {
    const customNotes = val("customerNotes");
    const assumptions = val("assumptions");
    const professional = isProfessionalMode();

    const genericPattern = /quote includes|printed item|standard print preparation|basic finishing|final output may vary|final color|material and process|production timing/i;

    if (customNotes && !genericPattern.test(customNotes)) {
      return customNotes.length > 185 ? customNotes.slice(0, 180).trim() + "…" : customNotes;
    }

    if (professional) {
      return "Quote is based on the listed scope, quantity, materials, and production approach. Scope or requirement changes may require an updated quote.";
    }

    if (assumptions && !genericPattern.test(assumptions)) {
      return assumptions.length > 170 ? assumptions.slice(0, 165).trim() + "…" : assumptions;
    }

    return "Includes standard print preparation. Final color, finish, and fit may vary slightly due to material and process characteristics.";
  }

  function cleanupPdfV5() {
    const customerNotes = $("pdfCustomerNotes");
    const assumptions = $("pdfAssumptions");
    const tracking = $("pdfTrackingInfo");
    const quoteTerms = $("pdfQuoteTerms");
    const invoiceTerms = $("pdfInvoiceTerms");
    const next = $("pdfNextSteps");
    const pay = $("pdfPaymentCta");

    setHidden(customerNotes, true);

    if (assumptions) {
      assumptions.innerHTML = `<strong>Quote Notes</strong>${buildQuoteNoteText()}`;
      setHidden(assumptions, false);
    }

    const orderNumber = orderFromQuote();
    const trackHref = `https://olipoly3d.com/track.html${orderNumber !== "OP-######" ? `?order=${encodeURIComponent(orderNumber)}` : ""}`;
    const payHref = "https://olipoly3d.com/pay.html";

    if (tracking) {
      tracking.innerHTML = `
        <strong>Order Tracking</strong>
        After acceptance, track this project using order number <strong>${orderNumber}</strong>.
        <div class="pdf-action-links only-one">
          <a class="pdf-action-link" href="${trackHref}">Track Order</a>
        </div>
      `;
      setHidden(tracking, false);
    }

    if (next) {
      next.innerHTML = `
        <strong>Next Steps</strong>
        Review and approve via your email link. After approval, use your order number to track progress and payment status.
      `;
      setHidden(next, false);
    }

    if (pay) {
      pay.innerHTML = `
        <strong>Pay</strong>
        After the quote is accepted, payment options are available from the order tracker.
        <div class="pdf-action-links only-one">
          <a class="pdf-action-link" href="${payHref}">Payment Page</a>
        </div>
      `;
      setHidden(pay, false);
    }

    [quoteTerms, invoiceTerms].forEach((el) => {
      if (!el) return;
      const hiddenInvoice = el.id === "pdfInvoiceTerms" && el.classList.contains("hidden");
      setHidden(el, hiddenInvoice || !textOf(el));
    });

    document.querySelectorAll(".pdf-note").forEach((el) => {
      if (!textOf(el)) setHidden(el, true);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["customerPdfBtn", "invoicePdfBtn"].forEach((id) => {
      $(id)?.addEventListener("click", () => {
        setTimeout(cleanupPdfV5, 80);
        setTimeout(cleanupPdfV5, 250);
        setTimeout(cleanupPdfV5, 500);
      }, { capture: true });
    });
    window.addEventListener("beforeprint", cleanupPdfV5);
  });
})();


/* === PDF CLEANUP FIX V6: concise complete quote notes === */
(() => {
  const $ = (id) => document.getElementById(id);

  function val(id) {
    return ($(id)?.value || $(id)?.textContent || "").trim();
  }

  function setHidden(el, hide) {
    if (!el) return;
    el.classList.toggle("pdf-empty", !!hide);
    el.classList.toggle("force-hide", !!hide);
  }

  function isProfessionalMode() {
    const type = val("liteQuoteType").toLowerCase();
    const mode = val("professionalMode").toLowerCase();
    return mode === "on" || type === "business" || type === "po";
  }

  function buildFinalQuoteNoteText() {
    const customNotes = val("customerNotes");
    const type = val("liteQuoteType").toLowerCase();
    const professional = isProfessionalMode();

    const genericPattern = /quote includes|printed item|standard print preparation|basic finishing|final output may vary|final color|material and process|production timing|listed quantity|production approach|packaging|labeling requirements/i;

    if (customNotes && !genericPattern.test(customNotes)) {
      return customNotes.length > 135 ? customNotes.slice(0, 132).trim() + "…" : customNotes;
    }

    if (professional) {
      return "Quote is based on the listed scope, quantity, materials, and production approach. Scope changes may require an updated quote.";
    }

    if (type === "custom") {
      return "Includes standard design iteration and print setup. Final color, finish, and fit may vary slightly.";
    }

    return "Includes standard print preparation. Final color, finish, and fit may vary slightly.";
  }

  function cleanupPdfV6() {
    const customerNotes = $("pdfCustomerNotes");
    const assumptions = $("pdfAssumptions");

    setHidden(customerNotes, true);

    if (assumptions) {
      assumptions.innerHTML = `<strong>Quote Notes</strong>${buildFinalQuoteNoteText()}`;
      assumptions.style.maxHeight = "none";
      assumptions.style.overflow = "visible";
      setHidden(assumptions, false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    ["customerPdfBtn", "invoicePdfBtn"].forEach((id) => {
      $(id)?.addEventListener("click", () => {
        setTimeout(cleanupPdfV6, 120);
        setTimeout(cleanupPdfV6, 320);
        setTimeout(cleanupPdfV6, 650);
      }, { capture: true });
    });
    window.addEventListener("beforeprint", cleanupPdfV6);
  });
})();


/* Professional Part Number Layer V1
   Adds OliPoly internal part number and customer part number support for
   business/professional quotes and future reorder workflows.
*/
(() => {
  const $ = (id) => document.getElementById(id);

  function get(id) {
    return ($(id)?.value || "").trim();
  }

  function setText(id, value) {
    document.querySelectorAll(`#${id}`).forEach((el) => {
      el.textContent = value || "—";
      const row = el.closest(".professional-part-line");
      if (row) row.classList.toggle("part-empty", !value);
    });
  }

  function quoteType() {
    return $("liteQuoteType")?.value || document.body.dataset.liteQuoteType || "retail";
  }

  function syncPartFields() {
    const type = quoteType();
    const isProfessional = type === "business" || type === "po";

    document.querySelectorAll(".professional-part-field").forEach((wrap) => {
      wrap.classList.toggle("lite-field-hidden", !isProfessional);
    });

    setText("pdfOliPolyPartNumber", get("olipolyPartNumber"));
    setText("pdfCustomerPartNumber", get("customerPartNumber"));

    // If both are blank, hide the PDF rows. If either is present, only show populated rows.
    const hasAny = !!(get("olipolyPartNumber") || get("customerPartNumber"));
    document.querySelectorAll(".professional-part-line").forEach((row) => {
      if (!hasAny) row.classList.add("part-empty");
    });
  }

  function patchRender() {
    if (typeof window.render !== "function" || window.render._partNumbersPatched) return false;
    const original = window.render;
    window.render = function patchedPartNumberRender(...args) {
      const result = original.apply(this, args);
      setTimeout(syncPartFields, 0);
      setTimeout(syncPartFields, 250);
      return result;
    };
    window.render._partNumbersPatched = true;
    return true;
  }

  function initPartNumbers() {
    ["olipolyPartNumber", "customerPartNumber", "liteQuoteType"].forEach((id) => {
      const el = $(id);
      if (!el || el._partNumberBound) return;
      el._partNumberBound = true;
      ["input", "change"].forEach((eventName) => el.addEventListener(eventName, syncPartFields));
    });

    const timer = setInterval(() => {
      patchRender();
      syncPartFields();
    }, 250);
    setTimeout(() => clearInterval(timer), 5000);

    patchRender();
    syncPartFields();
  }

  document.addEventListener("DOMContentLoaded", initPartNumbers);
})();


/* Manual Piece Price Override Layer V3
   Blank override = normal quote-tool.js calculation.

   Active override:
   - pieces = qty x manual price
   - add packaging and shipping/delivery
   - subtract discount
   - rounding, tax, deposit/balance
   - print/PDF preview includes a transparent pricing breakdown
*/
(() => {
  const $ = (id) => document.getElementById(id);

  function num(id) {
    const el = $(id);
    return Number(String(el?.value || "").replace(/[^0-9.-]/g, "")) || 0;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
  }

  function setTextAll(id, value) {
    document.querySelectorAll(`#${id}`).forEach((el) => {
      el.textContent = value;
    });
  }

  function roundTo(value, increment) {
    const inc = Number(increment) || 0;
    if (!inc) return value;
    return Math.round(value / inc) * inc;
  }

  function isActive() {
    return num("manualPiecePriceOverride") > 0;
  }

  function values() {
    const qty = Math.max(1, Math.round(num("qty") || 1));
    const overridePiece = num("manualPiecePriceOverride");
    const packaging = num("simplePackaging");
    const shipping = num("simpleShipping");
    const discount = num("discount");
    const taxRate = num("salesTax");
    const rounding = num("roundingMode");
    const depositPercent = Math.min(100, Math.max(0, num("depositPercent")));

    const itemSubtotal = overridePiece * qty;
    const extras = packaging + shipping;
    const beforeDiscount = itemSubtotal + extras;
    const beforeTax = Math.max(0, beforeDiscount - discount);
    const roundedBeforeTax = Math.max(0, roundTo(beforeTax, rounding));
    const roundingGain = roundedBeforeTax - beforeTax;
    const tax = roundedBeforeTax * (taxRate / 100);
    const final = roundedBeforeTax + tax;
    const deposit = final * (depositPercent / 100);
    const balance = Math.max(0, final - deposit);

    return {
      qty, overridePiece, packaging, shipping, extras, discount,
      taxRate, rounding, itemSubtotal, beforeDiscount, beforeTax,
      roundedBeforeTax, roundingGain, tax, final, deposit, balance,
      reason: ($("manualPiecePriceReason")?.value || "").trim()
    };
  }

  function overrideNoticeHtml(v) {
    return `<strong>Manual piece price override applied:</strong> ${money(v.overridePiece)} × ${v.qty} piece${v.qty === 1 ? "" : "s"}` +
      `<br><strong>Pieces subtotal:</strong> ${money(v.itemSubtotal)}` +
      `${v.packaging ? `<br><strong>Packaging:</strong> ${money(v.packaging)}` : ""}` +
      `${v.shipping ? `<br><strong>Shipping / delivery:</strong> ${money(v.shipping)}` : ""}` +
      `${v.discount ? `<br><strong>Discount:</strong> −${money(v.discount)}` : ""}` +
      `${v.roundingGain ? `<br><strong>Rounding adjustment:</strong> ${money(v.roundingGain)}` : ""}` +
      `${v.taxRate ? `<br><strong>Sales tax:</strong> ${v.taxRate}% = ${money(v.tax)}` : ""}` +
      `${v.reason ? `<br><strong>Reason:</strong> ${v.reason}` : ""}`;
  }

  function pdfPricingBreakdownHtml(v) {
    return `<strong>Pricing Method</strong><br>` +
      `Manual piece price override applied for transparent per-piece quoting.<br><br>` +
      `<strong>Pieces:</strong> ${money(v.overridePiece)} × ${v.qty} = ${money(v.itemSubtotal)}<br>` +
      `<strong>Packaging:</strong> ${money(v.packaging)}<br>` +
      `<strong>Shipping / Delivery:</strong> ${money(v.shipping)}<br>` +
      `${v.discount ? `<strong>Discount:</strong> −${money(v.discount)}<br>` : ""}` +
      `${v.roundingGain ? `<strong>Rounding Adjustment:</strong> ${money(v.roundingGain)}<br>` : ""}` +
      `<strong>Taxable Subtotal:</strong> ${money(v.roundedBeforeTax)}<br>` +
      `<strong>Sales Tax${v.taxRate ? ` (${v.taxRate}%)` : ""}:</strong> ${money(v.tax)}<br>` +
      `<strong>Total Quote:</strong> ${money(v.final)}` +
      `${v.reason ? `<br><strong>Override Note:</strong> ${v.reason}` : ""}`;
  }

  function setPdfAssumptions(v) {
    const pdfAssumptions = $("pdfAssumptions");
    if (!pdfAssumptions) return;

    if (!pdfAssumptions.dataset.manualOriginalHtml) {
      pdfAssumptions.dataset.manualOriginalHtml = pdfAssumptions.innerHTML || "";
    }

    const original = pdfAssumptions.dataset.manualOriginalHtml || "";
    const breakdown = pdfPricingBreakdownHtml(v);
    pdfAssumptions.innerHTML = original
      ? `${breakdown}<br><br>${original}`
      : breakdown;
  }

  function restorePdfAssumptionsIfInactive() {
    if (isActive()) return;
    const pdfAssumptions = $("pdfAssumptions");
    if (pdfAssumptions?.dataset.manualOriginalHtml) {
      pdfAssumptions.innerHTML = pdfAssumptions.dataset.manualOriginalHtml || "";
      delete pdfAssumptions.dataset.manualOriginalHtml;
    }
  }

  function applyManualPiecePriceOverride() {
    const notice = $("manualPiecePriceNotice");

    if (!isActive()) {
      document.body.classList.remove("manual-piece-price-active");
      restorePdfAssumptionsIfInactive();
      if (notice) {
        notice.classList.add("hidden");
        notice.classList.remove("manual-override-active");
        notice.innerHTML = "";
      }
      return;
    }

    const v = values();
    document.body.classList.add("manual-piece-price-active");

    setTextAll("sumQuote", money(v.final));
    setTextAll("sumPerItem", money(v.overridePiece));
    setTextAll("sumDirect", money(v.extras));
    setTextAll("sumOverhead", money(0));
    setTextAll("sumProfit", "Manual");
    setTextAll("sumDeposit", money(v.deposit));
    setTextAll("sumBalance", money(v.balance));
    setTextAll("sumMargin", "Manual");
    setTextAll("sumBreakEven", money(v.itemSubtotal));
    setTextAll("batchUnitCost", money(v.overridePiece));

    const guardrail = $("profitGuardrail");
    if (guardrail) guardrail.textContent = "Manual Price";

    const confidence = $("quoteConfidence");
    if (confidence) {
      confidence.textContent = "Manual Override";
      confidence.className = "confidence-ok";
    }

    setTextAll("outDirect", money(v.extras));
    setTextAll("outOverhead", money(0));
    setTextAll("outBase", money(v.itemSubtotal));
    setTextAll("outProfit", "Manual");
    setTextAll("outPerItem", money(v.overridePiece));
    setTextAll("outBreakEven", money(v.itemSubtotal));
    setTextAll("outMargin", "Manual");
    setTextAll("outPreDiscount", money(v.beforeDiscount));
    setTextAll("outDiscount", money(v.discount));
    setTextAll("outBeforeTax", money(v.beforeTax));
    setTextAll("outRoundedBeforeTax", money(v.roundedBeforeTax));
    setTextAll("outRoundingGain", money(v.roundingGain));
    setTextAll("outTax", money(v.tax));
    setTextAll("outDeposit", money(v.deposit));
    setTextAll("outBalance", money(v.balance));
    setTextAll("outFinal", money(v.final));

    setTextAll("pdfQty", String(v.qty));
    setTextAll("pdfPerItem", money(v.overridePiece));
    setTextAll("pdfSubtotal", money(v.roundedBeforeTax));
    setTextAll("pdfTax", money(v.tax));
    setTextAll("pdfTotal", money(v.final));
    setTextAll("pdfDeposit", money(v.deposit));
    setTextAll("pdfBalance", money(v.balance));
    setTextAll("pdfInvoiceAmount", money(v.final));
    setTextAll("pdfHeroTotal", money(v.final));
    if ((document.getElementById("pdfHeroDueLabel")?.textContent || "").trim().toLowerCase() === "payment terms") {
      const select = document.getElementById("paymentTerms");
      const selectedTerms = (select?.options?.[select.selectedIndex]?.textContent || select?.value || "").trim();
      setTextAll("pdfHeroDue", selectedTerms || "Customer Standard Terms / PO Terms");
    } else {
      setTextAll("pdfHeroDue", money(v.deposit || v.final));
    }

    setPdfAssumptions(v);

    if (notice) {
      notice.classList.remove("hidden");
      notice.classList.add("manual-override-active");
      notice.innerHTML = overrideNoticeHtml(v);
    }
  }

  function applySoon(times = [0, 50, 150, 350, 700]) {
    times.forEach((ms) => setTimeout(() => {
      if (isActive()) applyManualPiecePriceOverride();
      else restorePdfAssumptionsIfInactive();
    }, ms));
  }

  function patchRender() {
    if (typeof window.render !== "function" || window.render._manualPieceOverridePatchedV3) return false;

    const originalRender = window.render;
    window.render = function patchedManualPieceOverrideRender(...args) {
      const result = originalRender.apply(this, args);
      applySoon();
      return result;
    };

    window.render._manualPieceOverridePatchedV3 = true;
    return true;
  }

  function patchPdfButtons() {
    ["customerPdfBtn", "invoicePdfBtn", "printBtn", "generateQuoteBtn"].forEach((id) => {
      const btn = $(id);
      if (!btn || btn._manualOverridePdfBoundV3) return;
      btn._manualOverridePdfBoundV3 = true;
      btn.addEventListener("click", () => applySoon([0, 60, 180, 420, 900, 1400]), { capture: true });
      btn.addEventListener("click", () => applySoon([20, 120, 300, 650, 1100, 1800]));
    });

    window.addEventListener("beforeprint", () => applyManualPiecePriceOverride(), { capture: true });
    window.addEventListener("afterprint", () => applySoon([0, 150, 400]), { capture: true });
  }

  function bindInputs() {
    [
      "manualPiecePriceOverride", "manualPiecePriceReason", "qty",
      "simplePackaging", "simpleShipping", "discount",
      "salesTax", "roundingMode", "depositPercent"
    ].forEach((id) => {
      const el = $(id);
      if (!el || el._manualOverrideBoundV3) return;
      el._manualOverrideBoundV3 = true;
      ["input", "change"].forEach((eventName) => {
        el.addEventListener(eventName, () => {
          if (typeof window.render === "function") window.render();
          applySoon();
        });
      });
    });
  }

  function init() {
    bindInputs();
    patchPdfButtons();

    const timer = setInterval(() => {
      bindInputs();
      patchPdfButtons();
      patchRender();
      if (isActive()) applyManualPiecePriceOverride();
      else restorePdfAssumptionsIfInactive();
    }, 250);

    setTimeout(() => clearInterval(timer), 7000);

    if (patchRender() && typeof window.render === "function") {
      window.render();
    } else {
      applySoon();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();


/* Professional Customer Terms / PO Workflow Layer V1
   Adds a Customer Standard Terms / PO Terms payment option and adjusts
   professional PDF next-step language for corporate purchasing workflows.
*/
(() => {
  const $ = (id) => document.getElementById(id);

  function get(id) {
    return ($(id)?.value || "").trim();
  }

  function isProfessionalQuote() {
    const type = get("liteQuoteType") || document.body.dataset.liteQuoteType || "";
    const mode = get("professionalMode");
    return type === "business" || type === "po" || mode === "on";
  }

  function ensureCustomerTermsOption() {
    const select = $("paymentTerms");
    if (!select || select.querySelector('option[value="customer_terms"]')) return;

    const opt = document.createElement("option");
    opt.value = "customer_terms";
    opt.textContent = "Customer Standard Terms / PO Terms";

    const net30 = select.querySelector('option[value="net_30"]');
    if (net30?.nextSibling) select.insertBefore(opt, net30.nextSibling);
    else select.appendChild(opt);
  }

  function customerTermsText() {
    const po = get("poNumber");
    const customerPart = get("customerPartNumber");
    const oliPart = get("olipolyPartNumber");

    let parts = [
      "This quote is prepared for customer purchasing review.",
      "To approve, please reply by email or issue a purchase order for the items, quantities, and pricing listed above."
    ];

    if (po) parts.push(`Reference PO: ${po}.`);
    if (customerPart || oliPart) {
      parts.push(
        `Part references: ${customerPart ? `Customer Part # ${customerPart}` : ""}${customerPart && oliPart ? " / " : ""}${oliPart ? `OliPoly Part # ${oliPart}` : ""}.`
      );
    }

    parts.push("Payment will follow the customer’s approved standard terms unless otherwise agreed in writing.");

    return parts.join(" ");
  }

  function professionalNextStepsText() {
    return "Review this quote and approve by replying via email or issuing a purchase order for the items, quantities, and pricing listed above. Once accepted, OliPoly 3D will create an OP- order number for production tracking and fulfillment coordination.";
  }

  function applyCustomerTermsWorkflow() {
    ensureCustomerTermsOption();

    const terms = get("paymentTerms");
    const professional = isProfessionalQuote();

    const pdfQuoteTerms = $("pdfQuoteTerms");
    const pdfInvoiceTerms = $("pdfInvoiceTerms");
    const pdfTrackingInfo = $("pdfTrackingInfo");
    const pdfNextActions = $("pdfNextActions");
    const pdfCustomerNotes = $("pdfCustomerNotes");

    if (terms === "customer_terms") {
      const text = customerTermsText();

      if (pdfQuoteTerms) pdfQuoteTerms.textContent = text;
      if (pdfInvoiceTerms) pdfInvoiceTerms.textContent = text;

      // Avoid payment-button style wording for corporate terms.
      if (pdfTrackingInfo && professional) {
        pdfTrackingInfo.textContent = professionalNextStepsText();
      }

      // Some quote templates use customer notes / next action sections instead of tracking info.
      if (pdfNextActions && professional) {
        pdfNextActions.textContent = professionalNextStepsText();
      }

      return;
    }

    // Even if terms are Net 30, PO professional quotes should still use realistic workflow language.
    if (professional && (terms === "net_30" || terms === "due_on_receipt" || terms === "invoice")) {
      if (pdfTrackingInfo) pdfTrackingInfo.textContent = professionalNextStepsText();
      if (pdfNextActions) pdfNextActions.textContent = professionalNextStepsText();
    }
  }

  function patchRender() {
    if (typeof window.render !== "function" || window.render._customerTermsPatched) return false;
    const original = window.render;
    window.render = function patchedCustomerTermsRender(...args) {
      const result = original.apply(this, args);
      setTimeout(applyCustomerTermsWorkflow, 0);
      setTimeout(applyCustomerTermsWorkflow, 250);
      setTimeout(applyCustomerTermsWorkflow, 700);
      return result;
    };
    window.render._customerTermsPatched = true;
    return true;
  }

  function bind() {
    ["paymentTerms", "liteQuoteType", "professionalMode", "poNumber", "customerPartNumber", "olipolyPartNumber"].forEach((id) => {
      const el = $(id);
      if (!el || el._customerTermsBound) return;
      el._customerTermsBound = true;
      ["input", "change"].forEach((eventName) => {
        el.addEventListener(eventName, () => {
          if (typeof window.render === "function") window.render();
          setTimeout(applyCustomerTermsWorkflow, 80);
        });
      });
    });

    ["customerPdfBtn", "invoicePdfBtn", "printBtn", "generateQuoteBtn"].forEach((id) => {
      const btn = $(id);
      if (!btn || btn._customerTermsPrintBound) return;
      btn._customerTermsPrintBound = true;
      btn.addEventListener("click", () => {
        setTimeout(applyCustomerTermsWorkflow, 0);
        setTimeout(applyCustomerTermsWorkflow, 200);
        setTimeout(applyCustomerTermsWorkflow, 800);
      }, { capture: true });
    });

    window.addEventListener("beforeprint", applyCustomerTermsWorkflow, { capture: true });
  }

  function init() {
    ensureCustomerTermsOption();
    bind();

    const timer = setInterval(() => {
      ensureCustomerTermsOption();
      bind();
      patchRender();
      applyCustomerTermsWorkflow();
    }, 250);

    setTimeout(() => clearInterval(timer), 6000);

    patchRender();
    applyCustomerTermsWorkflow();
  }

  document.addEventListener("DOMContentLoaded", init);
})();


/* Professional PO PDF Workflow Layer V12
   Directly controls the top hero cards and professional PO sections.
*/
(() => {
  const $ = (id) => document.getElementById(id);

  function get(id){
    return ($(id)?.value || "").trim();
  }

  function text(id){
    return ($(id)?.textContent || "").trim();
  }

  function selectedPaymentTermsText(){
    const select = $("paymentTerms");
    if (!select) return "Customer Standard Terms / PO Terms";
    const option = select.options?.[select.selectedIndex];
    return (option?.textContent || select.value || "Customer Standard Terms / PO Terms").trim();
  }

  function selectedLeadTimeText(){
    return get("turnaround") || text("pdfTurnaround") || "To be confirmed";
  }

  function isProfessional(){
    const type = get("liteQuoteType") || document.body.dataset.liteQuoteType || "";
    const mode = get("professionalMode");
    const terms = get("paymentTerms");
    return type === "business" || type === "po" || mode === "on" || terms === "customer_terms";
  }

  function findFutureOrderNumber(){
    const candidates = [
      get("orderNumber"),
      text("pdfOrderNumber"),
      text("pdfAcceptedOrderNumber"),
      text("pdfConvertedOrderNumber"),
      text("pdfOpOrderNumber")
    ].filter(Boolean);

    for(const value of candidates){
      const match = String(value).match(/OP-\d{3,}/i);
      if(match) return match[0].toUpperCase();
    }

    const allText = (document.querySelector(".pdf-sheet") || document).textContent || "";
    const match = allText.match(/OP-\d{3,}/i);
    return match ? match[0].toUpperCase() : "";
  }

  function fixHeroCards(){
    const pro = isProfessional();
    if(!pro) return;

    const terms = selectedPaymentTermsText();
    const lead = selectedLeadTimeText();

    const dueLabel = $("pdfHeroDueLabel");
    const dueValue = $("pdfHeroDue");
    const timeLabel = $("pdfHeroTimeLabel");
    const timeValue = $("pdfHeroTime");

    if(dueLabel) dueLabel.textContent = "Payment Terms";
    if(dueValue) dueValue.textContent = terms;

    if(timeLabel) timeLabel.textContent = "Lead Time";
    if(timeValue) timeValue.textContent = lead;
  }

  function applyProfessionalWorkflow(){
    const pro = isProfessional();
    document.body.classList.toggle("professional-pdf-mode", pro);

    fixHeroCards();

    const po = $("pdfProfessionalPoInstructions");
    const tracking = $("pdfTrackingInfo");
    const opNumber = findFutureOrderNumber();

    if(po){
      po.classList.toggle("hidden", !pro);
      po.style.display = pro ? "block" : "none";
      if(pro){
        po.innerHTML =
          `<strong>Purchase Order &amp; Order Processing</strong><br>` +
          `To proceed with this order, please issue a purchase order referencing the quoted items, quantities, and pricing above.<br><br>` +
          `Please include: billing address; shipping address; purchasing contact information; required customer part numbers or references; and any required packaging labels, receiving instructions, or routing information.<br><br>` +
          `Once received, OliPoly 3D will begin scheduling manufacturing and fulfillment.`;
      }
    }

    if(tracking && pro){
      tracking.style.display = "block";
      tracking.classList.remove("hidden");
      tracking.innerHTML =
        `<strong>Order Tracking</strong><br>` +
        `Track this project using order number <strong>${opNumber || "the OP-order number shown above"}</strong>.<br>` +
        `Tracking Portal: <a href="https://olipoly3d.com/track.html" target="_blank">https://olipoly3d.com/track.html</a>`;
    }

    ["pdfNextSteps","pdfPaymentCta","pdfQuoteTerms","pdfInvoiceTerms"].forEach((id)=>{
      const el = $(id);
      if(!el) return;
      if(pro){
        el.style.display = "none";
        el.classList.add("hidden");
      } else {
        el.style.display = "";
      }
    });
  }

  function patchRender(){
    if(typeof window.render !== "function" || window.render._professionalPoPdfWorkflowV12) return false;
    const original = window.render;

    window.render = function patchedProfessionalPoWorkflowV12(...args){
      const result = original.apply(this,args);
      [0,25,75,150,300,700,1400,2500,4000].forEach((ms)=>setTimeout(applyProfessionalWorkflow,ms));
      return result;
    };

    window.render._professionalPoPdfWorkflowV12 = true;
    return true;
  }

  function bind(){
    ["liteQuoteType","professionalMode","paymentTerms","turnaround","customerPdfBtn","invoicePdfBtn","printBtn","generateQuoteBtn"].forEach((id)=>{
      const el = $(id);
      if(!el || el._professionalPoPdfWorkflowV12Bound) return;
      el._professionalPoPdfWorkflowV12Bound = true;
      ["input","change","click"].forEach((eventName)=>{
        el.addEventListener(eventName,()=>{
          [0,25,75,150,300,700,1400,2500,4000].forEach((ms)=>setTimeout(applyProfessionalWorkflow,ms));
        },{capture:true});
      });
    });

    window.addEventListener("beforeprint", applyProfessionalWorkflow, {capture:true});
  }

  function init(){
    bind();
    patchRender();

    const timer = setInterval(()=>{
      bind();
      patchRender();
      applyProfessionalWorkflow();
    },100);

    setTimeout(()=>clearInterval(timer),15000);
    applyProfessionalWorkflow();
  }

  document.addEventListener("DOMContentLoaded", init);
})();


/* Professional Prepare Customer Email Layer V3
   Keeps consumer email behavior intact.
   For professional/PO/customer-terms quotes, opens a branded email preview modal.
*/
(() => {
  const $ = (id) => document.getElementById(id);

  let lastProfessionalEmail = {
    html: "",
    plain: "",
    subject: "",
    to: ""
  };

  function getField(id) {
    return ($(id)?.value || "").trim();
  }

  function textFrom(id) {
    return ($(id)?.textContent || "").trim();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function quoteType() {
    return getField("liteQuoteType") || document.body.dataset.liteQuoteType || "";
  }

  function isProfessionalQuote() {
    const type = quoteType();
    const terms = getField("paymentTerms");
    const professionalMode = getField("professionalMode");
    return type === "business" || type === "po" || terms === "customer_terms" || professionalMode === "on";
  }

  function emailNum(id) {
    return Number(String(getField(id) || "").replace(/[^0-9.-]/g, "")) || 0;
  }

  function emailMoney(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
  }

  function emailRoundTo(value, increment) {
    const inc = Number(increment) || 0;
    if (!inc) return value;
    return Math.round(value / inc) * inc;
  }

  function manualOverrideEmailTotal() {
    const overridePiece = emailNum("manualPiecePriceOverride");
    if (!overridePiece) return "";

    const qty = Math.max(1, Math.round(emailNum("qty") || 1));
    const packaging = emailNum("simplePackaging");
    const shipping = emailNum("simpleShipping");
    const discount = emailNum("discount");
    const taxRate = emailNum("salesTax");
    const rounding = emailNum("roundingMode");

    const itemSubtotal = overridePiece * qty;
    const beforeTax = Math.max(0, itemSubtotal + packaging + shipping - discount);
    const roundedBeforeTax = Math.max(0, emailRoundTo(beforeTax, rounding));
    const tax = roundedBeforeTax * (taxRate / 100);
    const final = roundedBeforeTax + tax;

    return emailMoney(final);
  }

  function quoteTotalText() {
    return manualOverrideEmailTotal() || textFrom("sumQuote") || textFrom("outFinal") || textFrom("pdfTotal") || "See attached quote";
  }

  function selectedPaymentTermsText() {
    const select = $("paymentTerms");
    if (!select) return "";
    const option = select.options?.[select.selectedIndex];
    return (option?.textContent || select.value || "").trim();
  }

  function makeSubject() {
    const quoteNumber = getField("quoteNumber") || "Quote";
    const project = getField("quoteTitle") || getField("projectTitle") || "";
    return project ? `OliPoly 3D Quote ${quoteNumber} - ${project}` : `OliPoly 3D Quote ${quoteNumber}`;
  }

  function professionalData() {
    const rawContact = getField("contactName") || getField("customerName") || "";
    const companyName = getField("companyName") || "";
    const quoteNumber = getField("quoteNumber") || "";
    const project = getField("quoteTitle") || getField("projectTitle") || "the requested items";
    const total = quoteTotalText();
    const leadTime = getField("turnaround") || "as noted in the attached quote";
    const terms = selectedPaymentTermsText() || "Customer Standard Terms / PO Terms";
    const poNumber = getField("poNumber");
    const oliPart = getField("olipolyPartNumber");
    const customerPart = getField("customerPartNumber");
    const customerEmail = getField("customerEmail");
    const manualOverridePiece = emailNum("manualPiecePriceOverride");
    const manualOverrideQty = Math.max(1, Math.round(emailNum("qty") || 1));
    const manualOverridePricingNote = manualOverridePiece
      ? `${emailMoney(manualOverridePiece)} × ${manualOverrideQty} pcs`
      : "";

    return {
      manualOverridePricingNote,
      rawContact,
      greetingName: rawContact || "",
      companyName,
      quoteNumber,
      project,
      total,
      leadTime,
      terms,
      poNumber,
      oliPart,
      customerPart,
      customerEmail
    };
  }

  function buildProfessionalPlainEmail() {
    const d = professionalData();
    const refs = [
      d.quoteNumber ? `Quote: ${d.quoteNumber}` : "",
      d.companyName ? `Company: ${d.companyName}` : "",
      d.project ? `Project: ${d.project}` : "",
      d.total ? `Quoted total: ${d.total}` : "",
      d.manualOverridePricingNote ? `Pricing method: ${d.manualOverridePricingNote}` : "",
      d.terms ? `Payment terms: ${d.terms}` : "",
      d.leadTime ? `Lead time: ${d.leadTime}` : "",
      d.poNumber ? `PO reference: ${d.poNumber}` : "",
      d.oliPart ? `OliPoly Part #: ${d.oliPart}` : "",
      d.customerPart ? `Customer Part #: ${d.customerPart}` : ""
    ].filter(Boolean).join("\n");

    return `${d.greetingName ? `Hello ${d.greetingName},` : "Hello,"}

Attached is the requested quotation from OliPoly 3D for purchasing review.

${refs}

To proceed, please issue a purchase order referencing the quoted items, quantities, and pricing included in the attached quote.

Please include:
- Billing address
- Shipping address
- Purchasing contact information
- Required customer part references
- Any required packaging labels, routing instructions, or receiving requirements

Current lead time is estimated at ${d.leadTime} unless otherwise noted.

Please let me know if any revisions or additional documentation are needed.

Thank you,

OliPoly 3D LLC
Custom 3D Printing • Creative Builds • Prototypes
OliPoly3D@gmail.com
https://olipoly3d.com`;
  }

  function detailRow(label, value) {
    if (!value) return "";
    return `
      <tr>
        <td style="padding:8px 0;color:#826889;font-size:13px;font-weight:700;width:38%;border-bottom:1px solid #f5dcea;">${escapeHtml(label)}</td>
        <td style="padding:8px 0;color:#2f2336;font-size:13px;font-weight:800;border-bottom:1px solid #f5dcea;">${escapeHtml(value)}</td>
      </tr>`;
  }

  function buildProfessionalHtmlEmail() {
    const d = professionalData();

    return `<div style="margin:0;background:#fff7fb;padding:28px 18px;font-family:Arial,Helvetica,sans-serif;color:#3f3146;">
  <div style="max-width:700px;margin:0 auto;background:#ffffff;border:1px solid #f0c8df;border-radius:26px;overflow:hidden;box-shadow:0 14px 36px rgba(222,111,184,.16);">

    <div style="height:12px;background:linear-gradient(135deg,#de6fb8,#9d7cff,#65d6c4);"></div>

    <div style="padding:26px 28px 18px;background:linear-gradient(180deg,#fff7fb 0%,#ffffff 100%);border-bottom:1px solid #f6ddec;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:31px;font-weight:700;letter-spacing:-.03em;line-height:1;color:#241b2b;">
              Oli<span style="color:#b86be8;">Poly</span> 3D
            </div>
            <div style="margin-top:7px;color:#826889;font-size:13px;letter-spacing:.01em;">
              Custom 3D Printing • Creative Builds • Prototypes
            </div>
          </td>
          <td style="width:74px;text-align:right;vertical-align:middle;">
            <div style="display:inline-block;width:52px;height:52px;border-radius:17px;background:linear-gradient(135deg,#de6fb8,#9d7cff);text-align:center;line-height:52px;color:#ffffff;font-size:22px;font-weight:800;box-shadow:0 8px 18px rgba(157,124,255,.22);">
              OP
            </div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding:28px;">
      <div style="display:inline-block;margin-bottom:14px;padding:7px 11px;border-radius:999px;background:#f9ecf5;border:1px solid #f2c4df;color:#7c4a82;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">
        Professional Quotation
      </div>

      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.1;margin:0 0 16px;color:#241b2b;font-weight:700;">
        Quotation for purchasing review
      </h1>

      <p style="font-size:15px;line-height:1.65;margin:0 0 16px;color:#4f4057;">
        ${d.greetingName ? `Hello ${escapeHtml(d.greetingName)},` : "Hello,"}
      </p>

      <p style="font-size:15px;line-height:1.65;margin:0 0 20px;color:#4f4057;">
        Attached is the requested quotation from <strong>OliPoly 3D</strong> for purchasing review.
      </p>

      <div style="background:linear-gradient(180deg,#fff8fc,#ffffff);border:1px solid #f2c4df;border-radius:20px;padding:18px 20px;margin:20px 0;box-shadow:0 8px 22px rgba(222,111,184,.08);">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#2f2336;margin-bottom:8px;">
          Quote Summary
        </div>
        <table role="presentation" style="width:100%;border-collapse:collapse;">
          ${detailRow("Quote #", d.quoteNumber)}
          ${detailRow("Company", d.companyName)}
          ${detailRow("Project", d.project)}
          ${detailRow("Quoted Total", d.total)}
          ${detailRow("Pricing Method", d.manualOverridePricingNote)}
          ${detailRow("Payment Terms", d.terms)}
          ${detailRow("Lead Time", d.leadTime)}
          ${detailRow("PO Reference", d.poNumber)}
          ${detailRow("OliPoly Part #", d.oliPart)}
          ${detailRow("Customer Part #", d.customerPart)}
        </table>
      </div>

      <div style="background:#fbf6ff;border:1px solid #dfcff5;border-radius:20px;padding:18px 20px;margin:20px 0;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#2f2336;margin-bottom:10px;">
          Purchase Order &amp; Order Processing
        </div>

        <p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:#4f4057;">
          To proceed, please issue a purchase order referencing the quoted items, quantities, and pricing included in the attached quote.
        </p>

        <p style="font-size:14px;line-height:1.55;margin:0 0 8px;color:#4f4057;font-weight:800;">
          Please include:
        </p>

        <ul style="margin:0;padding-left:20px;color:#604d68;font-size:14px;line-height:1.58;">
          <li>Billing address</li>
          <li>Shipping address</li>
          <li>Purchasing contact information</li>
          <li>Required customer part references</li>
          <li>Any required packaging labels, routing instructions, or receiving requirements</li>
        </ul>
      </div>

      <div style="border-left:4px solid #de6fb8;background:#fffafd;padding:14px 16px;border-radius:14px;margin:20px 0;color:#604d68;font-size:14px;line-height:1.6;">
        Current lead time is estimated at <strong style="color:#2f2336;">${escapeHtml(d.leadTime)}</strong> unless otherwise noted.
        Please let me know if any revisions or additional documentation are needed.
      </div>

      <p style="font-size:15px;line-height:1.6;margin:22px 0 0;color:#4f4057;">
        Thank you,
      </p>

      <p style="font-size:15px;line-height:1.6;margin:8px 0 0;color:#4f4057;">
        <strong>OliPoly 3D LLC</strong><br>
        Custom 3D Printing • Creative Builds • Prototypes
      </p>
    </div>

    <div style="background:#fff7fb;border-top:1px solid #f2c4df;padding:18px 28px;color:#826889;font-size:13px;line-height:1.55;">
      <strong style="color:#4f4057;">OliPoly 3D</strong><br>
      <a href="mailto:OliPoly3D@gmail.com" style="color:#9d4edd;text-decoration:none;font-weight:700;">OliPoly3D@gmail.com</a>
      <span style="color:#c59db9;"> • </span>
      <a href="https://olipoly3d.com" style="color:#9d4edd;text-decoration:none;font-weight:700;">olipoly3d.com</a>
    </div>
  </div>
</div>`;
  }

  function openGmailCompose(to, subject, body) {
    const gmailUrl =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(to || "")}` +
      `&su=${encodeURIComponent(subject || "")}` +
      `&body=${encodeURIComponent(body || "")}`;
    window.open(gmailUrl, "_blank", "noopener,noreferrer");
  }

  function writePreviewFrame(html) {
    const frame = $("professionalEmailPreviewFrame");
    if (!frame) return;

    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff7fb;">${html}</body></html>`);
    doc.close();
  }

  function openModal() {
    const modal = $("professionalEmailModal");
    if (!modal) return;

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = $("professionalEmailModal");
    if (!modal) return;

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function copyRichEmail() {
    if (!lastProfessionalEmail.html) return;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const htmlBlob = new Blob([lastProfessionalEmail.html], { type: "text/html" });
        const textBlob = new Blob([lastProfessionalEmail.plain], { type: "text/plain" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": htmlBlob,
            "text/plain": textBlob
          })
        ]);
      } else {
        await navigator.clipboard.writeText(lastProfessionalEmail.html);
      }

      const msg = $("professionalEmailModalMessage");
      if (msg) msg.innerHTML = "Copied. In Gmail, select the plain draft text and paste to replace it with the branded version.";
    } catch (err) {
      const msg = $("professionalEmailModalMessage");
      if (msg) msg.textContent = "Could not copy rich HTML automatically. Try Download HTML instead.";
    }
  }

  function downloadHtmlEmail() {
    if (!lastProfessionalEmail.html) return;

    const blob = new Blob([lastProfessionalEmail.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeQuote = (getField("quoteNumber") || "quote").replace(/[^a-z0-9_-]/gi, "-");

    a.href = url;
    a.download = `olipoly-professional-email-${safeQuote}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 600);
  }

  function openProfessionalGmailDraft() {
    openGmailCompose(lastProfessionalEmail.to, lastProfessionalEmail.subject, lastProfessionalEmail.plain);
  }

  function prepareProfessionalCustomerEmail(event) {
    if (!isProfessionalQuote()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      if (typeof window.render === "function") window.render();

      const plain = buildProfessionalPlainEmail();
      const html = buildProfessionalHtmlEmail();
      const d = professionalData();

      lastProfessionalEmail = {
        html,
        plain,
        subject: makeSubject(),
        to: d.customerEmail
      };

      writePreviewFrame(html);
      openModal();
    } catch (err) {
      alert(`Could not prepare professional customer email:\n\n${err.message || err}`);
    }
  }

  function bindModalButtons() {
    const close = $("professionalEmailCloseBtn");
    const backdrop = $("professionalEmailBackdrop");
    const copy = $("copyProfessionalEmailRichBtn");
    const open = $("openProfessionalGmailBtn");
    const download = $("downloadProfessionalEmailHtmlBtn");

    if (close && !close._emailModalBound) {
      close._emailModalBound = true;
      close.addEventListener("click", closeModal);
    }

    if (backdrop && !backdrop._emailModalBound) {
      backdrop._emailModalBound = true;
      backdrop.addEventListener("click", closeModal);
    }

    if (copy && !copy._emailModalBound) {
      copy._emailModalBound = true;
      copy.addEventListener("click", copyRichEmail);
    }

    if (open && !open._emailModalBound) {
      open._emailModalBound = true;
      open.addEventListener("click", openProfessionalGmailDraft);
    }

    if (download && !download._emailModalBound) {
      download._emailModalBound = true;
      download.addEventListener("click", downloadHtmlEmail);
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function initProfessionalEmailLayer() {
    bindModalButtons();

    const btn = $("prepareCustomerEmailBtn");
    if (!btn || btn._professionalEmailLayerBoundV3) return;
    btn._professionalEmailLayerBoundV3 = true;

    btn.addEventListener("click", prepareProfessionalCustomerEmail, true);
  }

  document.addEventListener("DOMContentLoaded", initProfessionalEmailLayer);
})();

/* Quote-only cleanup layer
   Invoice PDF/email generation now belongs in Orders Admin.
   Legacy invoiceType/invoiceNotes/invoiceNumber fields remain hidden only for calculator compatibility.
*/
(() => {
  function ensureQuoteEngineCompatibilityFields() {
    const holderId = "quoteEngineCompatFields";
    let holder = document.getElementById(holderId);

    if (!holder) {
      holder = document.createElement("div");
      holder.id = holderId;
      holder.className = "quote-engine-compat";
      holder.setAttribute("aria-hidden", "true");
      holder.style.cssText = "display:none!important;";
      document.body.appendChild(holder);
    }

    if (!document.getElementById("invoiceNumber")) {
      const input = document.createElement("input");
      input.id = "invoiceNumber";
      input.type = "hidden";
      input.value = "";
      holder.appendChild(input);
    }

    if (!document.getElementById("invoiceType")) {
      const select = document.createElement("select");
      select.id = "invoiceType";
      select.innerHTML = `<option value="deposit">deposit</option><option value="full">full</option>`;
      select.value = "deposit";
      holder.appendChild(select);
    }

    if (!document.getElementById("invoiceNotes")) {
      const notes = document.createElement("textarea");
      notes.id = "invoiceNotes";
      notes.value = "";
      holder.appendChild(notes);
    }

    const invoiceType = document.getElementById("invoiceType");
    if (invoiceType && !invoiceType.value) invoiceType.value = "deposit";
  }

  function removeInvoiceButtonsOnly() {
    ["invoicePdfBtn", "downloadInvoiceBtn", "prepareInvoiceEmailBtn"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = "none";
      el.classList.add("lite-hidden-action");
    });

    document.querySelectorAll("button").forEach((btn) => {
      const text = (btn.textContent || "").trim().toLowerCase();
      if (text.includes("invoice")) {
        btn.style.display = "none";
        btn.classList.add("lite-hidden-action");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureQuoteEngineCompatibilityFields();
    removeInvoiceButtonsOnly();
    setTimeout(ensureQuoteEngineCompatibilityFields, 50);
    setTimeout(removeInvoiceButtonsOnly, 250);
    setTimeout(ensureQuoteEngineCompatibilityFields, 750);
  });
})();

/* Hidden invoiceType compatibility sync */
(() => {
  function syncHiddenInvoiceType() {
    const type = document.getElementById("liteQuoteType")?.value || document.body.dataset.liteQuoteType || "";
    const invoiceType = document.getElementById("invoiceType");
    if (!invoiceType) return;
    invoiceType.value = (type === "po" || type === "craft") ? "full" : "deposit";
  }

  document.addEventListener("DOMContentLoaded", () => {
    syncHiddenInvoiceType();
    document.getElementById("liteQuoteType")?.addEventListener("change", syncHiddenInvoiceType);
    setTimeout(syncHiddenInvoiceType, 100);
    setTimeout(syncHiddenInvoiceType, 500);
  });
})();



/* === OliPoly Quote PDF Direct Print Fix === */
(() => {
  const $ = (id) => document.getElementById(id);

  function val(id, fallback = ""){
    return ($(id)?.value || fallback || "").trim();
  }

  function text(id, fallback = ""){
    return ($(id)?.textContent || fallback || "").trim();
  }

  function esc(value){
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[ch]));
  }

  function moneyNum(textValue){
    return Number(String(textValue || "").replace(/[^0-9.-]/g, "")) || 0;
  }

  function toast(message, ms = 2600){
    let el = $("liteStatusToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "liteStatusToast";
      el.className = "lite-status-toast";
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._quotePdfTimer);
    el._quotePdfTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  function ensureRender(){
    if (typeof window.ensureDocumentNumbers === "function") window.ensureDocumentNumbers(false);
    if (typeof window.render === "function") window.render();
  }

  function quoteTotalText(){
    return text("sumQuote") || text("outFinal") || text("finalTotal") || "$0.00";
  }

  function quotePerItemText(){
    return text("sumPerItem") || text("outPerItem") || "";
  }

  function termsLabel(){
    const raw = val("paymentTerms");
    const labels = {
      deposit_to_start: "Deposit to Start",
      due_on_receipt: "Due on Receipt",
      customer_terms: "Customer Standard Terms / PO Terms",
      net_15: "Net 15",
      net_30: "Net 30",
      net_45: "Net 45"
    };
    return labels[raw] || raw || "To be confirmed";
  }

  function pdfCss(){
    return `
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff;color:#2f2336;font-family:Arial,Helvetica,sans-serif}
      .sheet{width:7.75in;min-height:10in;padding:.32in;background:#fff;position:relative;overflow:hidden}
      .topbar{height:14px;margin:-.32in -.32in .22in;background:linear-gradient(135deg,#de6fb8,#9d7cff,#65d6c4)}
      .header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #f0c8df;margin-bottom:12px}
      .brand{font-family:Georgia,'Times New Roman',serif;font-size:31px;font-weight:800;letter-spacing:-.04em;line-height:.95;color:#241b2b}
      .brand span{color:#b86be8}
      .tagline{margin-top:7px;color:#826889;font-size:11px}
      .title{text-align:right;font-size:28px;font-weight:900;letter-spacing:.12em;color:#241b2b}
      .docnum{margin-top:7px;padding:6px 9px;border-radius:999px;background:#fff7fb;border:1px solid #f0c8df;display:inline-block;font-size:12px;color:#7c4a82;font-weight:900}
      .kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
      .box{border-radius:12px;padding:10px;background:#fffafd;border:1px solid #f0c8df}
      .box small{display:block;font-size:8.5px;margin-bottom:4px;color:#826889;text-transform:uppercase;letter-spacing:.08em;font-weight:800}
      .box strong{display:block;font-size:13px;color:#2f2336;line-height:1.22;overflow-wrap:anywhere}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
      .panel{border-radius:13px;padding:11px 12px;font-size:11.5px;line-height:1.42;min-height:.72in;background:#fff;border:1px solid #f0c8df}
      .chip{display:inline-block;margin-bottom:7px;padding:4px 8px;border-radius:999px;background:linear-gradient(135deg,#de6fb8,#9d7cff);color:#fff;font-size:8.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      table{width:100%;border-collapse:collapse;margin-top:8px;border:1px solid #f0c8df;border-radius:12px;overflow:hidden}
      th{background:#fff7fb;padding:8px 9px;font-size:8.5px;color:#826889;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #f0c8df;text-align:left}
      td{padding:11px 9px;font-size:11px;line-height:1.35;color:#2f2336;vertical-align:top;border-bottom:1px solid #f8e4ef}
      th:nth-child(2),td:nth-child(2){text-align:center;width:65px}
      th:nth-child(3),td:nth-child(3){text-align:right;width:110px}
      .totalbox{margin-top:12px;display:grid;grid-template-columns:1.2fr .8fr;gap:10px}
      .note{border-radius:13px;padding:10px 12px;background:linear-gradient(135deg,#fff7fb,#fbf6ff);border:1px solid #f0c8df;font-size:10.5px;line-height:1.42;color:#604d68}
      .totals{border-radius:13px;padding:10px 12px;background:#fffafd;border:1px solid #f0c8df}
      .totals div{display:flex;justify-content:space-between;gap:10px;padding:6px 0;font-size:11px;border-bottom:1px solid #f6ddec}
      .totals .grand{border-top:2px solid #f0c8df;border-bottom:0;margin-top:4px;padding-top:9px}
      .totals .grand strong,.totals .grand span{font-size:16px;color:#241b2b;font-weight:900}
      .footer{margin-top:10px;padding-top:9px;border-top:1px solid #f0c8df;font-size:9.5px;text-align:center;color:#826889}
      @page{size:letter portrait;margin:.25in}
      @media print{body{margin:0}.sheet{width:7.75in;min-height:auto}}
    `;
  }

  function buildQuotePdfHtml(){
    ensureRender();

    const quoteNumber = val("quoteNumber", "Quote");
    const quoteDate = val("quoteDate", new Date().toISOString().slice(0,10));
    const customerName = val("customerName") || val("companyName") || "Customer";
    const customerEmail = val("customerEmail");
    const contactName = val("contactName");
    const project = val("quoteTitle") || val("projectTitle") || "Custom 3D printed items";
    const qty = val("qty") || val("quantity") || "1";
    const total = quoteTotalText();
    const perItem = quotePerItemText();
    const notes = val("customerNotes") || "Quote is based on the information provided and may be updated if scope, quantity, materials, or requirements change.";
    const assumptions = val("assumptions") || "Final print orientation, finish, delivery timing, and packaging details may be confirmed before production.";
    const turnaround = val("turnaround") || "To be confirmed at approval";

    const company = val("companyName");
    const po = val("poNumber");
    const oliPart = val("olipolyPartNumber");
    const custPart = val("customerPartNumber");

    const totalNumber = moneyNum(total);
    const qtyNumber = Number(qty) || 1;
    const unit = perItem || (totalNumber ? new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(totalNumber / qtyNumber) : "—");

    return `
      <div class="sheet">
        <div class="topbar"></div>

        <div class="header">
          <div>
            <div class="brand">Oli<span>Poly</span> 3D</div>
            <div class="tagline">Custom 3D Printing • Creative Builds • Prototypes</div>
          </div>
          <div>
            <div class="title">QUOTE</div>
            <div class="docnum">${esc(quoteNumber)}</div>
          </div>
        </div>

        <div class="kpi">
          <div class="box"><small>Total Quote</small><strong>${esc(total)}</strong></div>
          <div class="box"><small>Payment Terms</small><strong>${esc(termsLabel())}</strong></div>
          <div class="box"><small>Lead Time</small><strong>${esc(turnaround)}</strong></div>
        </div>

        <div class="grid">
          <div class="panel">
            <span class="chip">Customer</span><br>
            <strong>${esc(customerName)}</strong><br>
            ${company && company !== customerName ? `${esc(company)}<br>` : ""}
            ${contactName ? `Contact: ${esc(contactName)}<br>` : ""}
            ${customerEmail ? `${esc(customerEmail)}<br>` : ""}
          </div>

          <div class="panel">
            <span class="chip">Quote Details</span><br>
            Quote Date: ${esc(quoteDate)}<br>
            Status: ${esc(val("quoteStatus","Pending"))}<br>
            ${po ? `PO Reference: ${esc(po)}<br>` : ""}
            ${oliPart ? `OliPoly Part #: ${esc(oliPart)}<br>` : ""}
            ${custPart ? `Customer Part #: ${esc(custPart)}<br>` : ""}
          </div>
        </div>

        <table>
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Estimated Total</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>${esc(project)}</strong><br>${oliPart ? `OliPoly Part #: ${esc(oliPart)}<br>` : ""}${custPart ? `Customer Part #: ${esc(custPart)}<br>` : ""}</td>
              <td>${esc(qty)}</td>
              <td>${esc(total)}</td>
            </tr>
          </tbody>
        </table>

        <div class="totalbox">
          <div>
            <div class="note"><strong>Quote Notes</strong><br>${esc(notes).replace(/\n/g,"<br>")}</div>
            <div class="note" style="margin-top:10px;"><strong>Assumptions</strong><br>${esc(assumptions).replace(/\n/g,"<br>")}</div>
          </div>
          <div class="totals">
            <div><strong>Quantity</strong><span>${esc(qty)}</span></div>
            <div><strong>Estimated Unit</strong><span>${esc(unit)}</span></div>
            <div class="grand"><strong>Total</strong><span>${esc(total)}</span></div>
          </div>
        </div>

        <div class="note" style="margin-top:10px;">
          <strong>Order Tracking</strong><br>
          Once approved and scheduled, tracking details will be available through the OliPoly order tracker.
        </div>

        <div class="footer">OliPoly 3D LLC • OliPoly3D@gmail.com • olipoly3d.com</div>
      </div>
    `;
  }

  function openQuotePdf(){
    try {
      const html = buildQuotePdfHtml();
      const win = window.open("", "_blank");
      if (!win) {
        toast("Pop-up blocked. Allow pop-ups for this site and try again.", 6000);
        return;
      }

      win.document.open();
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(val("quoteNumber","Quote"))}</title><style>${pdfCss()}</style></head><body>${html}</body></html>`);
      win.document.close();

      toast("Opening quote PDF print window...");
      setTimeout(() => {
        win.focus();
        win.print();
      }, 350);
    } catch (error) {
      console.error("Quote PDF failed:", error);
      toast(`Quote PDF failed: ${error?.message || error}`, 7000);
    }
  }

  function bindQuotePdfButton(){
    const btn = $("customerPdfBtn");
    if (!btn || btn.dataset.quotePdfDirectBound === "true") return;
    btn.dataset.quotePdfDirectBound = "true";
    btn.onclick = (event) => {
      event.preventDefault();
      openQuotePdf();
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindQuotePdfButton);
  else bindQuotePdfButton();

  setTimeout(bindQuotePdfButton, 500);
  setTimeout(bindQuotePdfButton, 1500);

  window.openQuotePdf = openQuotePdf;
})();



/* === OliPoly Quote Styled Email Preview Modal Fix === */
(() => {
  const $ = (id) => document.getElementById(id);

  function val(id, fallback = ""){
    return ($(id)?.value || fallback || "").trim();
  }

  function text(id, fallback = ""){
    return ($(id)?.textContent || fallback || "").trim();
  }

  function esc(value){
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[ch]));
  }

  function toast(message, ms = 2800){
    let el = $("liteStatusToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "liteStatusToast";
      el.className = "lite-status-toast";
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._emailPreviewTimer);
    el._emailPreviewTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  function ensureRender(){
    if (typeof window.ensureDocumentNumbers === "function") window.ensureDocumentNumbers(false);
    if (typeof window.render === "function") window.render();
  }

  function totalText(){
    return text("sumQuote") || text("outFinal") || text("finalTotal") || "$0.00";
  }

  function termsLabel(){
    const raw = val("paymentTerms");
    const labels = {
      deposit_to_start: "Deposit to Start",
      due_on_receipt: "Due on Receipt",
      customer_terms: "Customer Standard Terms / PO Terms",
      net_15: "Net 15",
      net_30: "Net 30",
      net_45: "Net 45"
    };
    return labels[raw] || raw || "To be confirmed";
  }

  function quoteLink(){
    const quoteNumber = val("quoteNumber");
    // If public token generation succeeds elsewhere later, this can become quote-response.html.
    // For now this preview remains safe and uses the quote number reference.
    return `${window.location.origin || "https://olipoly3d.com"}/quote`;
  }

  function buildPlainEmail(){
    ensureRender();

    const customer = val("customerName") || val("contactName");
    const project = val("quoteTitle") || val("projectTitle") || "your custom 3D print";
    const quoteNumber = val("quoteNumber") || "Quote";
    const total = totalText();
    const turnaround = val("turnaround") || "to be confirmed based on approval timing";
    const notes = val("customerNotes");
    const assumptions = val("assumptions");

    return `${customer ? `Hello ${customer},` : "Hello,"}

Attached/prepared is the requested OliPoly 3D quote for review.

Quote: ${quoteNumber}
Project: ${project}
Estimated total: ${total}
Payment terms: ${termsLabel()}
Estimated timing: ${turnaround}

${notes ? `Notes: ${notes}\n\n` : ""}${assumptions ? `Assumptions: ${assumptions}\n\n` : ""}Please review the quote details and reply with any questions, revisions, or approval to move forward.

Thank you,

OliPoly 3D LLC
Custom 3D Printing • Creative Builds • Prototypes
OliPoly3D@gmail.com
https://olipoly3d.com`;
  }

  function buildStyledEmail(){
    ensureRender();

    const customer = val("customerName") || val("contactName");
    const company = val("companyName");
    const project = val("quoteTitle") || val("projectTitle") || "Custom 3D printed items";
    const quoteNumber = val("quoteNumber") || "Quote";
    const total = totalText();
    const turnaround = val("turnaround") || "To be confirmed";
    const notes = val("customerNotes");
    const assumptions = val("assumptions");
    const oliPart = val("olipolyPartNumber");
    const custPart = val("customerPartNumber");
    const po = val("poNumber");

    const businessRows = [
      company ? `<p style="margin:0 0 8px;"><strong>Company:</strong> ${esc(company)}</p>` : "",
      po ? `<p style="margin:0 0 8px;"><strong>PO Reference:</strong> ${esc(po)}</p>` : "",
      oliPart ? `<p style="margin:0 0 8px;"><strong>OliPoly Part #:</strong> ${esc(oliPart)}</p>` : "",
      custPart ? `<p style="margin:0 0 8px;"><strong>Customer Part #:</strong> ${esc(custPart)}</p>` : ""
    ].join("");

    return `<div style="margin:0;background:#fff7fb;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#3f3146;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #f2c4df;border-radius:24px;overflow:hidden;box-shadow:0 12px 30px rgba(222,111,184,.14);">
    <div style="height:10px;background:linear-gradient(135deg,#de6fb8,#9d7cff,#65d6c4);"></div>

    <div style="padding:26px 26px 10px;background:linear-gradient(180deg,#fff7fb,#ffffff);">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:31px;font-weight:700;letter-spacing:-.03em;color:#241b2b;">
        Oli<span style="color:#b86be8;">Poly</span> 3D
      </div>
      <div style="margin-top:5px;color:#866a86;font-size:14px;">
        Custom 3D Printing • Creative Builds • Prototypes
      </div>
    </div>

    <div style="padding:12px 26px 28px;">
      <div style="display:inline-block;margin:8px 0 12px;padding:7px 11px;border-radius:999px;background:#fff0f8;border:1px solid #f2c4df;color:#8f4f7b;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;">
        Quote Ready
      </div>

      <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.05;margin:0 0 14px;color:#241b2b;">
        Your OliPoly quote is ready for review
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        ${customer ? `Hello ${esc(customer)},` : "Hello,"}
      </p>

      <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
        Attached/prepared is the requested OliPoly 3D quote for review. Please look it over and reply with any questions, revisions, or approval to move forward.
      </p>

      <div style="background:#fff7fb;border:1px solid #f2c4df;border-radius:18px;padding:16px 18px;margin:18px 0;">
        <p style="margin:0 0 8px;"><strong>Quote #:</strong> ${esc(quoteNumber)}</p>
        ${businessRows}
        <p style="margin:0 0 8px;"><strong>Project:</strong> ${esc(project)}</p>
        <p style="margin:0 0 8px;"><strong>Estimated total:</strong> ${esc(total)}</p>
        <p style="margin:0 0 8px;"><strong>Payment terms:</strong> ${esc(termsLabel())}</p>
        <p style="margin:0;"><strong>Estimated timing:</strong> ${esc(turnaround)}</p>
      </div>

      ${notes ? `<div style="background:#fffafc;border:1px solid #f2c4df;border-radius:16px;padding:14px 16px;margin:14px 0;color:#604d68;font-size:15px;line-height:1.55;"><strong style="color:#3f3146;">Notes</strong><br>${esc(notes).replace(/\n/g,"<br>")}</div>` : ""}
      ${assumptions ? `<div style="background:#fbf6ff;border:1px solid #dfcff5;border-radius:16px;padding:14px 16px;margin:14px 0;color:#604d68;font-size:15px;line-height:1.55;"><strong style="color:#3f3146;">Assumptions</strong><br>${esc(assumptions).replace(/\n/g,"<br>")}</div>` : ""}

      <div style="background:#fffafc;border:1px solid #f2c4df;border-radius:18px;padding:16px 18px;margin:18px 0;">
        <p style="margin:0 0 8px;font-weight:800;color:#3f3146;">Next step</p>
        <p style="margin:0;color:#604d68;line-height:1.5;">
          Reply with approval or requested changes. Once approved, OliPoly 3D will schedule the project and provide tracking/payment details as applicable.
        </p>
      </div>

      <p style="font-size:15px;line-height:1.6;margin:20px 0 0;color:#4f4057;">
        Thank you,<br>
        <strong>OliPoly 3D LLC</strong><br>
        Custom 3D Printing • Creative Builds • Prototypes
      </p>
    </div>

    <div style="background:#fff7fb;border-top:1px solid #f2c4df;padding:16px 26px;color:#866a86;font-size:13px;line-height:1.5;">
      <strong style="color:#4f4057;">OliPoly 3D</strong><br>
      <a href="mailto:OliPoly3D@gmail.com" style="color:#9d4edd;text-decoration:none;font-weight:700;">OliPoly3D@gmail.com</a>
      <span style="color:#c59db9;"> • </span>
      <a href="https://olipoly3d.com" style="color:#9d4edd;text-decoration:none;font-weight:700;">olipoly3d.com</a>
    </div>
  </div>
</div>`;
  }

  let lastEmail = null;

  function openGmailFallback(){
    if (!lastEmail) buildAndShowEmailPreview();

    const url =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(lastEmail.to || "")}` +
      `&su=${encodeURIComponent(lastEmail.subject || "")}` +
      `&body=${encodeURIComponent(lastEmail.plain || "")}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyStyledHtml(){
    if (!lastEmail) buildAndShowEmailPreview();
    try {
      await navigator.clipboard.writeText(lastEmail.html);
      toast("Styled email HTML copied.");
    } catch {
      const blob = new Blob([lastEmail.html], { type:"text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast("Clipboard blocked — opened HTML preview.");
    }
  }

  function downloadHtml(){
    if (!lastEmail) buildAndShowEmailPreview();
    const blob = new Blob([lastEmail.html], { type:"text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(val("quoteNumber") || "olipoly-quote-email").replace(/[^a-z0-9_-]+/gi,"-")}-email.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function closeModal(){
    const modal = $("quoteEmailPreviewModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function buildAndShowEmailPreview(){
    ensureRender();

    const quoteNumber = val("quoteNumber") || "Quote";
    const to = val("customerEmail");
    const subject = `OliPoly 3D Quote ${quoteNumber}`;
    const html = buildStyledEmail();
    const plain = buildPlainEmail();

    lastEmail = { to, subject, html, plain };

    const modal = $("quoteEmailPreviewModal");
    const frame = $("quoteEmailPreviewFrame");
    if (!modal || !frame) {
      // Fallback if modal HTML was not uploaded.
      navigator.clipboard?.writeText(html);
      openGmailFallback();
      return;
    }

    $("quoteEmailPreviewTo").value = to || "";
    $("quoteEmailPreviewSubject").value = subject;

    frame.srcdoc = html;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function bindEmailPreview(){
    const btn = $("prepareCustomerEmailBtn");
    if (btn && btn.dataset.emailPreviewBound !== "true") {
      btn.dataset.emailPreviewBound = "true";
      btn.onclick = (event) => {
        event.preventDefault();
        buildAndShowEmailPreview();
      };
    }

    $("quoteEmailPreviewClose")?.addEventListener("click", closeModal);
    $("quoteEmailPreviewBackdrop")?.addEventListener("click", closeModal);
    $("quoteEmailCopyStyledBtn")?.addEventListener("click", copyStyledHtml);
    $("quoteEmailOpenGmailBtn")?.addEventListener("click", openGmailFallback);
    $("quoteEmailDownloadHtmlBtn")?.addEventListener("click", downloadHtml);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindEmailPreview);
  else bindEmailPreview();

  setTimeout(bindEmailPreview, 500);
  setTimeout(bindEmailPreview, 1500);

  window.buildAndShowQuoteEmailPreview = buildAndShowEmailPreview;
})();



/* === OliPoly Retail Email Preview Routing Guard === */
(() => {
  const $ = (id) => document.getElementById(id);

  function val(id){
    return ($(id)?.value || "").trim();
  }

  function isBusinessOrPoQuote(){
    const type = val("liteQuoteType") || document.body.dataset.liteQuoteType || "retail";
    return ["po","business","business_bulk"].includes(type) ||
      val("professionalMode") === "on" ||
      !!val("poNumber");
  }

  function bindRetailEmailPreviewOnly(){
    const btn = $("prepareCustomerEmailBtn");
    if (!btn || btn.dataset.retailEmailPreviewGuard === "true") return;
    btn.dataset.retailEmailPreviewGuard = "true";

    const existing = btn.onclick;

    btn.onclick = (event) => {
      if (!isBusinessOrPoQuote() && typeof window.buildAndShowQuoteEmailPreview === "function") {
        event.preventDefault();
        window.buildAndShowQuoteEmailPreview();
        return;
      }

      if (typeof existing === "function") {
        return existing.call(btn, event);
      }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindRetailEmailPreviewOnly);
  else bindRetailEmailPreviewOnly();

  setTimeout(bindRetailEmailPreviewOnly, 500);
  setTimeout(bindRetailEmailPreviewOnly, 1500);
})();
