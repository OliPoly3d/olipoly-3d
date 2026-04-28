/* OliPoly 3D Quote Tool Lite
   Lite-only helper layer. This file does NOT replace quote-tool.js.
   Load order:
   <script src="quote-tool.js"></script>
   <script src="quote-tool-lite.js"></script>
*/

(() => {
  const $ = (id) => document.getElementById(id);
  const setVal = (id, value, fire = true) => {
    const el = $(id);
    if (!el) return;
    el.value = value;
    if (fire) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const AUTO_FLAG = "liteAutoFilled";

  const setAutoText = (id, value) => {
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
  };

  const clearAutoFlagOnUserEdit = () => {
    ["customerNotes", "assumptions", "invoiceNotes", "turnaround"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => {
        if (document.activeElement === el) el.dataset[AUTO_FLAG] = "false";
      });
    });
  };

  const nearestFieldWrap = (id) => {
    const el = $(id);
    if (!el) return null;
    return el.closest(".full") || el.closest(".form-grid > div") || el.parentElement;
  };

  const showField = (id, show) => {
    const wrap = nearestFieldWrap(id);
    if (wrap) wrap.classList.toggle("lite-field-hidden", !show);
  };

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

  function applyQuoteType(type) {
    const cfg = CONFIGS[type] || CONFIGS.retail;
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

    setAutoText("assumptions", cfg.assumptions);
    setAutoText("customerNotes", cfg.notes);
    if (cfg.invoiceNotes) setAutoText("invoiceNotes", cfg.invoiceNotes);

    const summary = $("liteFormatSummary");
    if (summary) {
      summary.innerHTML = `<strong>${cfg.label}</strong><br>${cfg.summary}<br><span class="lite-format-chip">${cfg.chip}</span>`;
    }

    const modeHint = $("modeHint");
    if (modeHint) modeHint.textContent = cfg.summary;

    relabelReadyButton();

    if (typeof window.render === "function") window.render();
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

  function relabelReadyButton() {
    const btn = $("readySendBtn");
    if (!btn) return;
    const on = document.body.classList.contains("ready-send");
    btn.textContent = on ? "Customer Preview: On" : "Preview Customer View";
  }

  function patchReadyButtonLabel() {
    const btn = $("readySendBtn");
    if (!btn) return;
    btn.addEventListener("click", () => setTimeout(relabelReadyButton, 0));
    relabelReadyButton();
  }

  function init() {
    clearAutoFlagOnUserEdit();

    const selector = $("liteQuoteType");
    if (selector) {
      selector.addEventListener("change", () => applyQuoteType(selector.value));
      applyQuoteType(selector.value || "retail");
    }

    patchPdfButtons();
    patchReadyButtonLabel();
  }

  document.addEventListener("DOMContentLoaded", init);
})();


/* Lite UX patch: saved-quote feedback + clearer review behavior */
(() => {
  const $ = (id) => document.getElementById(id);

  function toast(message) {
    const el = $("liteStatusToast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._liteTimer);
    el._liteTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function relabelButtons() {
    const review = $("generateQuoteBtn");
    if (review) review.textContent = "Check Missing Inputs";

    const save = $("saveQuoteBtn");
    if (save) save.textContent = "Save / Update Quote";

    const load = $("loadQuoteBtn");
    if (load) load.textContent = "Load Selected Quote";

    const del = $("deleteQuoteBtn");
    if (del) del.textContent = "Delete Selected Quote";
  }

  function selectedQuoteLabel() {
    const select = $("savedQuotesSelect");
    if (!select || !select.value) return "";
    const opt = select.options[select.selectedIndex];
    return opt ? opt.textContent.trim() : "";
  }

  function patchSaveLoadFeedback() {
    const save = $("saveQuoteBtn");
    const load = $("loadQuoteBtn");
    const del = $("deleteQuoteBtn");
    const review = $("generateQuoteBtn");

    if (save && !save.dataset.litePatched) {
      save.dataset.litePatched = "true";
      save.addEventListener("click", () => {
        setTimeout(() => {
          const q = $("quoteNumber")?.value || "Quote";
          toast(`${q} saved. Use Saved Quotes to load it later.`);
        }, 250);
      });
    }

    if (load && !load.dataset.litePatched) {
      load.dataset.litePatched = "true";
      load.addEventListener("click", () => {
        setTimeout(() => {
          const label = selectedQuoteLabel();
          toast(label ? `Loaded ${label}` : "Choose a saved quote first.");
        }, 250);
      });
    }

    if (del && !del.dataset.litePatched) {
      del.dataset.litePatched = "true";
      del.addEventListener("click", () => {
        setTimeout(() => toast("Saved quote list updated."), 250);
      });
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

  document.addEventListener("DOMContentLoaded", () => {
    relabelButtons();
    patchSaveLoadFeedback();
    setTimeout(() => {
      relabelButtons();
      patchSaveLoadFeedback();
    }, 600);
  });
})();

