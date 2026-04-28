// ==============================
// OliPoly Quote Tool Lite (v2)
// ==============================

(function () {

  const $ = (id) => document.getElementById(id);

  const AUTO_FLAG = "liteAutoFilled";

  function setVal(id, value, fire = true) {
    const el = $(id);
    if (!el) return;
    el.value = value;

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
        if (document.activeElement === el) {
          el.dataset[AUTO_FLAG] = "false";
        }
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
    if (wrap) {
      wrap.classList.toggle("lite-field-hidden", !show);
    }
  }

  // ==============================
  // CONFIGS
  // ==============================

  const CONFIGS = {

    retail: {
      label: "Retail / Individual Customer",
      summary: "Simple customer-friendly quote",
      orderType: "custom",
      professionalMode: "off",
      paymentTerms: "deposit_to_start",
      depositPercent: 50,
      showBusinessFields: false,
      showPo: false,
      assumptions: "Final print may vary slightly due to materials and settings.",
      notes: "Includes printing and basic finishing."
    },

    custom: {
      label: "Custom Design Project",
      summary: "Includes design iteration and collaboration",
      orderType: "custom",
      professionalMode: "off",
      paymentTerms: "deposit_to_start",
      depositPercent: 60,
      showBusinessFields: false,
      showPo: false,
      assumptions: "Includes design iteration and proofing.",
      notes: "Custom design support included."
    },

    business: {
      label: "Business / Bulk Order",
      summary: "Bulk pricing and structured production",
      orderType: "business_bulk",
      professionalMode: "on",
      paymentTerms: "deposit_to_start",
      depositPercent: 50,
      showBusinessFields: true,
      showPo: false,
      assumptions: "Based on quantity and production assumptions.",
      notes: "Bulk pricing applied."
    },

    po: {
      label: "PO / Professional Customer",
      summary: "Formal quote for business purchasing",
      orderType: "business_bulk",
      professionalMode: "on",
      paymentTerms: "net_30",
      depositPercent: 0,
      showBusinessFields: true,
      showPo: true,
      assumptions: "Formal quote for business purchasing workflows.",
      notes: "Includes PO processing requirements."
    }

  };

  // ==============================
  // APPLY LOGIC
  // ==============================

  function applyQuoteType(type) {

    const cfg = CONFIGS[type] || CONFIGS.retail;

    // Map to existing system fields
    setVal("orderType", cfg.orderType);
    setVal("professionalMode", cfg.professionalMode);
    setVal("paymentTerms", cfg.paymentTerms);
    setVal("depositPercent", cfg.depositPercent);

    // Show/hide fields
    showField("companyName", cfg.showBusinessFields);
    showField("contactName", cfg.showBusinessFields);
    showField("poNumber", cfg.showPo);

    // Autofill text
    setAutoText("assumptions", cfg.assumptions);
    setAutoText("customerNotes", cfg.notes);

    // Update summary UI
    const summary = $("liteSummary");
    if (summary) {
      summary.textContent = cfg.summary;
    }

    // Re-render pricing if your main tool supports it
    if (typeof window.render === "function") {
      window.render();
    }

  }

  // ==============================
  // INIT
  // ==============================

  function init() {

    clearAutoFlagOnUserEdit();

    const selector = $("liteQuoteType");

    if (!selector) return;

    selector.addEventListener("change", () => {
      applyQuoteType(selector.value);
    });

    // Run on load
    applyQuoteType(selector.value || "retail");

  }

  document.addEventListener("DOMContentLoaded", init);

})();
