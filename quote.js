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
    setTextAll("pdfHeroDue", money(v.deposit || v.final));

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


/* Professional PO PDF Workflow Layer V2
   Removes retail-style payment sections from business/PO quotes and
   shows corporate PO workflow messaging instead.
*/
(() => {
  const $ = (id) => document.getElementById(id);

  function get(id){
    return ($(id)?.value || "").trim();
  }

  function professionalMode(){
    const type = get("liteQuoteType") || document.body.dataset.liteQuoteType || "";
    return type === "business" || type === "po";
  }

  function applyProfessionalPdfWorkflow(){
    const professional = professionalMode();

    // Hide payment sections/buttons on PDF preview
    [
      "pdfPaymentSection",
      "pdfPaySection",
      "pdfPaymentLinks",
      "pdfPaymentButtons"
    ].forEach((id) => {
      const el = $(id);
      if (el) el.style.display = professional ? "none" : "";
    });

    document.querySelectorAll(".pdf-pay-panel").forEach((el) => {
      el.style.display = professional ? "none" : "";
    });

    const instructions = $("pdfProfessionalPoInstructions");
    if (instructions) {
      instructions.closest(".professional-po-instructions-panel").style.display = professional ? "" : "none";
    }

    const tracking = $("pdfTrackingInfo");
    if (tracking && professional) {
      tracking.innerHTML =
        "After purchase order acceptance, OliPoly 3D will generate an OP-order number for production tracking, shipment coordination, and fulfillment updates.";
    }
  }

  function patchRender(){
    if(typeof window.render !== "function" || window.render._professionalPdfWorkflowPatched) return false;

    const original = window.render;

    window.render = function patchedProfessionalWorkflowRender(...args){
      const result = original.apply(this,args);

      setTimeout(applyProfessionalPdfWorkflow,0);
      setTimeout(applyProfessionalPdfWorkflow,200);
      setTimeout(applyProfessionalPdfWorkflow,700);

      return result;
    };

    window.render._professionalPdfWorkflowPatched = true;
    return true;
  }

  function init(){
    const timer = setInterval(() => {
      patchRender();
      applyProfessionalPdfWorkflow();
    },250);

    setTimeout(() => clearInterval(timer),6000);

    patchRender();
    applyProfessionalPdfWorkflow();

    ["customerPdfBtn","invoicePdfBtn","printBtn","generateQuoteBtn","liteQuoteType"].forEach((id)=>{
      const el = $(id);
      if(!el || el._professionalWorkflowBound) return;

      el._professionalWorkflowBound = true;

      ["click","change","input"].forEach((eventName)=>{
        el.addEventListener(eventName,()=>{
          setTimeout(applyProfessionalPdfWorkflow,0);
          setTimeout(applyProfessionalPdfWorkflow,200);
          setTimeout(applyProfessionalPdfWorkflow,700);
        },{capture:true});
      });
    });

    window.addEventListener("beforeprint", applyProfessionalPdfWorkflow, {capture:true});
  }

  document.addEventListener("DOMContentLoaded", init);
})();


/* Professional Quote Cleanup Layer V1 */
(() => {
  const $ = (id) => document.getElementById(id);

  function quoteType(){
    return ($("liteQuoteType")?.value || document.body.dataset.liteQuoteType || "").trim();
  }

  function professional(){
    return quoteType() === "business" || quoteType() === "po";
  }

  function hideRetailSections(){
    const isPro = professional();

    const chips = Array.from(document.querySelectorAll(".doc-chip"));
    chips.forEach((chip)=>{
      const text = (chip.textContent || "").trim().toLowerCase();

      if(!isPro) return;

      if(text === "next steps" || text === "pay"){
        const panel = chip.closest(".pdf-panel") || chip.parentElement;
        if(panel) panel.style.display = "none";
      }
    });

    // Remove duplicated PO text if render injected twice
    const po = $("pdfProfessionalPoInstructions");
    if(po){
      let html = po.innerHTML;
      const duplicate = "To proceed with this order";
      const first = html.indexOf(duplicate);
      const second = html.indexOf(duplicate, first + 10);

      if(second !== -1){
        html = html.substring(0, second);
        po.innerHTML = html;
      }
    }

    const tracking = $("pdfTrackingInfo");
    if(tracking && isPro){
      tracking.innerHTML =
        "After purchase order acceptance, OliPoly 3D will generate an OP-order number for production tracking, shipment coordination, and fulfillment updates.";
    }
  }

  function patchRender(){
    if(typeof window.render !== "function" || window.render._professionalCleanupPatched) return false;

    const original = window.render;

    window.render = function patchedCleanup(...args){
      const result = original.apply(this,args);

      setTimeout(hideRetailSections,0);
      setTimeout(hideRetailSections,200);
      setTimeout(hideRetailSections,700);

      return result;
    };

    window.render._professionalCleanupPatched = true;
    return true;
  }

  function init(){
    const timer = setInterval(()=>{
      patchRender();
      hideRetailSections();
    },250);

    setTimeout(()=>clearInterval(timer),6000);

    patchRender();
    hideRetailSections();

    ["customerPdfBtn","invoicePdfBtn","printBtn","generateQuoteBtn","liteQuoteType"].forEach((id)=>{
      const el = $(id);
      if(!el || el._cleanupBound) return;

      el._cleanupBound = true;

      ["click","change","input"].forEach((eventName)=>{
        el.addEventListener(eventName,()=>{
          setTimeout(hideRetailSections,0);
          setTimeout(hideRetailSections,200);
          setTimeout(hideRetailSections,700);
        },{capture:true});
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

