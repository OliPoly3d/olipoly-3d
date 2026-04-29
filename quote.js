/* OliPoly 3D Quote Tool Lite - Supabase Saved Quotes V6
   This file is a Lite-only helper layer.
   Load order in quote-tool-lite.html:
   <script src="quote-tool.js"></script>
   <script src="quote-tool-lite.js"></script>

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
        "This quote is based on the project details shared so far. Final color, finish, and small print details may vary slightly due to material, filament batch, and print settings. Local pickup is assumed unless otherwise noted.",
      notes:
        "Quote includes the printed item(s) described, standard print preparation, and basic finishing unless otherwise noted."
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
        "This quote includes collaborative design iteration, proofing, and review until the quoted design direction is mutually accepted. Standard finishing is included unless otherwise noted, and final printed color may vary slightly due to filament batch, material, and printer settings.",
      notes:
        "Quote includes custom design support based on the information provided. Please confirm size, use, color preference, and any required fit details before approval."
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
        "Quote is based on the listed quantity, materials, and expected production approach. Final schedule, delivery timing, packaging, labeling, and any business-specific requirements should be confirmed at approval. Material color and finish may vary slightly by filament brand and production batch.",
      notes:
        "Quote includes the listed quantity and production assumptions. Bulk pricing is based on the quantity shown and may change if the order quantity or requirements change.",
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
        "Quote is based on a prior or repeat-style item using current material, labor, and machine assumptions. Minor variation in color, finish, or packaging may occur depending on current stock and print settings.",
      notes:
        "Repeat-order quote based on the current requested quantity and available material/production assumptions."
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
        "Pricing is for pre-made inventory or event stock currently available or planned for a batch run. Final color appearance may vary slightly by filament brand and print settings. Quantities available may change as inventory sells.",
      notes:
        "Pricing is based on available or planned inventory. Pickup, event purchase, or shipping details can be confirmed separately."
    },
    po: {
      label: "Professional / PO Customer",
      chip: "Formal PO-ready quote",
      summary: "Most formal format. Shows company/contact/PO fields, professional PDF styling, and invoice-ready terms.",
      orderType: "business_bulk",
      professionalMode: "on",
      paymentTerms: "net_30",
      depositPercent: 0,
      invoiceType: "full",
      showBusinessFields: true,
      showPo: true,
      assumptions:
        "Quote is based on the listed scope, quantity, materials, and production assumptions. Any changes to specifications, required documentation, delivery requirements, packaging, or approval process may require an updated quote.",
      notes:
        "Formal quote prepared for business purchasing review. Please confirm company name, contact, PO requirements, delivery needs, and any vendor setup requirements before approval.",
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
      throw new Error("Supabase helper sbApi() was not found. Make sure quote-tool.js loads before quote-tool-lite.js.");
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
    if (typeof window.sbApi !== "function") throw new Error("Supabase helper sbApi() was not found.");
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

Thanks for reaching out! Your OliPoly 3D quote is ready to review.

Quote: ${getField("quoteNumber")}
Project: ${project}
Estimated total: ${total}
Estimated timing: ${turnaround}

${notes ? `Notes: ${notes}\n\n` : ""}${assumptions ? `Assumptions: ${assumptions}\n\n` : ""}Please use this secure link to review, accept, or decline the quote:

${link}

Once accepted, your order number will use the same number with OP- instead of Q-.

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

    return `<div style="font-family:Arial,sans-serif;color:#3f3146;line-height:1.6;background:#fff7fb;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #f2c4df;border-radius:22px;padding:24px;box-shadow:0 12px 30px rgba(222,111,184,.14);">
    <h1 style="font-family:Georgia,serif;color:#2a2132;margin:0 0 10px;">Your OliPoly 3D Quote</h1>
    <p style="margin:0 0 16px;">${customerName ? `Hi ${customerName},` : "Hi,"}</p>
    <p style="margin:0 0 16px;">Thanks for reaching out! Your quote is ready to review.</p>

    <div style="background:#fff7fb;border:1px solid #f2c4df;border-radius:16px;padding:16px;margin:16px 0;">
      <p style="margin:0 0 8px;"><strong>Quote:</strong> ${quoteNumber}</p>
      <p style="margin:0 0 8px;"><strong>Project:</strong> ${project}</p>
      <p style="margin:0 0 8px;"><strong>Estimated total:</strong> ${total}</p>
      <p style="margin:0;"><strong>Estimated timing:</strong> ${turnaround}</p>
    </div>

    ${notes ? `<p style="margin:0 0 10px;"><strong>Notes:</strong> ${notes}</p>` : ""}
    ${assumptions ? `<p style="margin:0 0 10px;"><strong>Assumptions:</strong> ${assumptions}</p>` : ""}

    <p style="margin:18px 0 8px;">Please use the button below to accept or decline the quote.</p>

    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#de6fb8,#9d7cff);color:#fff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:999px;">Review / Respond to Quote</a>
    </p>

    <p style="font-size:13px;color:#816c88;margin:18px 0 0;">If the button does not work, copy and paste this link:<br>${link}</p>
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
async function loadCustomerResponses() {
  const list = document.getElementById("responsesList");

  try {
    if (!list) return;

    if (typeof window.sbApi !== "function") {
      list.innerHTML = `<div style="color:#e45a7a;">Could not load customer responses. Supabase helper is not ready yet.</div>`;
      return;
    }

    const res = await window.sbApi(
  `/rest/v1/quotes?select=quote_number,quote_title,quote_status,customer_name,customer_email,customer_response,customer_response_message,converted_order_number,updated_at&customer_response=not.is.null&order=updated_at.desc&limit=10`,
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
  emailBtn.textContent = "Send Confirmation Email";
  emailBtn.className = "btn-ghost";
  emailBtn.type = "button";

  emailBtn.onclick = () => {
    const orderNumber = q.converted_order_number;
    const email = q.customer_email;

    if (!orderNumber || !email) {
      alert("Missing order number or customer email.");
      return;
    }

    const trackLink = `https://olipoly3d.com/track.html?order=${encodeURIComponent(orderNumber)}`;

    const subject = `Order Confirmed – OliPoly 3D (${orderNumber})`;

    const body = `Hi — your order has been created.

Order #: ${orderNumber}

Track your order and complete payment:
${trackLink}

If you have any questions, just reply.

Thanks!
OliPoly 3D`;

    const gmailUrl =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(email)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.open(gmailUrl, "_blank", "noopener,noreferrer");
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

