/* OliPoly 3D Shared Document Theme
   Step 1 of the Professional PDF Ecosystem.

   Purpose:
   - Provides one shared visual language for invoices, packing slips,
     manufacturing travelers, reorder sheets, quote PDFs, and branded emails.
   - Safe to load on existing pages. It does not auto-run, mutate forms,
     attach event listeners, or change current PDF behavior by itself.
*/

(function () {
  const THEME = {
    brandName: "OliPoly 3D",
    tagline: "Custom 3D Printing • Creative Builds • Prototypes",
    email: "OliPoly3D@gmail.com",
    website: "olipoly3d.com",
    colors: {
      ink: "#241b2b",
      text: "#2f2336",
      muted: "#826889",
      softMuted: "#a0839c",
      pink: "#de6fb8",
      violet: "#9d7cff",
      teal: "#65d6c4",
      border: "#f0c8df",
      softBorder: "#f6ddec",
      wash: "#fff7fb",
      panel: "#fffafd",
      success: "#16a34a",
      warning: "#b45309",
      danger: "#be123c"
    }
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safe(value, fallback = "—") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(Number(value) || 0);
  }

  function formatDate(value, fallback = "—") {
    if (!value) return fallback;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return safe(value, fallback);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function basePrintCss(options = {}) {
    const compact = !!options.compact;

    return `
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff;color:${THEME.colors.text};font-family:Arial,Helvetica,sans-serif}
      body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .op-doc{
        width:8.5in;
        min-height:10.5in;
        margin:0 auto;
        padding:${compact ? ".34in" : ".42in"};
        background:#fff;
        color:${THEME.colors.text};
        position:relative;
        overflow:hidden;
        font-family:Arial,Helvetica,sans-serif;
      }
      .op-doc::before{
        content:"";
        position:absolute;
        inset:0;
        background:
          radial-gradient(circle at top left,rgba(222,111,184,.08),transparent 32%),
          radial-gradient(circle at top right,rgba(157,124,255,.07),transparent 28%);
        pointer-events:none;
      }
      .op-doc>*{position:relative;z-index:1}
      .op-topbar{
        height:14px;
        margin:${compact ? "-.34in -.34in .24in" : "-.42in -.42in .28in"};
        background:linear-gradient(135deg,${THEME.colors.pink},${THEME.colors.violet},${THEME.colors.teal});
      }
      .op-header{
        display:flex;
        justify-content:space-between;
        gap:18px;
        align-items:flex-start;
        padding-bottom:14px;
        border-bottom:1px solid ${THEME.colors.border};
        margin-bottom:14px;
      }
      .op-brand{
        font-family:Georgia,'Times New Roman',serif;
        font-size:34px;
        font-weight:800;
        letter-spacing:-.045em;
        line-height:.95;
        color:${THEME.colors.ink};
      }
      .op-brand span{color:#b86be8}
      .op-tagline{
        margin-top:7px;
        color:${THEME.colors.muted};
        font-size:11.5px;
        letter-spacing:.01em;
      }
      .op-title{
        text-align:right;
        font-size:28px;
        font-weight:900;
        letter-spacing:.11em;
        color:${THEME.colors.ink};
        text-transform:uppercase;
      }
      .op-number{
        margin-top:7px;
        padding:6px 9px;
        border-radius:999px;
        background:${THEME.colors.wash};
        border:1px solid ${THEME.colors.border};
        display:inline-block;
        font-size:12px;
        color:#7c4a82;
        font-weight:900;
      }
      .op-chip{
        display:inline-block;
        margin-bottom:8px;
        padding:5px 9px;
        border-radius:999px;
        background:linear-gradient(135deg,${THEME.colors.pink},${THEME.colors.violet});
        color:#fff;
        font-size:9.5px;
        font-weight:900;
        letter-spacing:.08em;
        text-transform:uppercase;
      }
      .op-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .op-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .op-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .op-card,.op-panel,.op-total-card,.op-note{
        border:1px solid ${THEME.colors.border};
        background:linear-gradient(180deg,${THEME.colors.panel},#fff);
        border-radius:14px;
        padding:11px 12px;
      }
      .op-card small{
        display:block;
        margin-bottom:5px;
        color:${THEME.colors.muted};
        font-size:9.5px;
        text-transform:uppercase;
        letter-spacing:.08em;
        font-weight:800;
      }
      .op-card strong{
        display:block;
        font-size:12.5px;
        color:${THEME.colors.text};
        line-height:1.25;
        overflow-wrap:anywhere;
      }
      .op-panel{
        min-height:.92in;
        font-size:12px;
        line-height:1.42;
      }
      .op-table{
        width:100%;
        border-collapse:collapse;
        border:1px solid ${THEME.colors.border};
        border-radius:14px;
        overflow:hidden;
        margin-top:10px;
      }
      .op-table th{
        background:${THEME.colors.wash};
        color:${THEME.colors.muted};
        font-size:9.5px;
        text-transform:uppercase;
        letter-spacing:.08em;
        text-align:left;
        padding:9px 10px;
        border-bottom:1px solid ${THEME.colors.border};
      }
      .op-table td{
        padding:12px 10px;
        font-size:12px;
        line-height:1.42;
        color:${THEME.colors.text};
        border-bottom:1px solid ${THEME.colors.softBorder};
        vertical-align:top;
      }
      .op-table tr:last-child td{border-bottom:none}
      .op-checklist{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:7px 12px;
        margin-top:10px;
        font-size:11.5px;
      }
      .op-check{
        min-height:22px;
        display:flex;
        align-items:center;
        gap:7px;
      }
      .op-box{
        width:13px;
        height:13px;
        border:1.6px solid ${THEME.colors.muted};
        border-radius:3px;
        flex:0 0 auto;
      }
      .op-note{
        margin-top:12px;
        font-size:11.5px;
        line-height:1.45;
        color:#604d68;
      }
      .op-footer{
        margin-top:14px;
        padding-top:10px;
        border-top:1px solid ${THEME.colors.border};
        color:${THEME.colors.muted};
        font-size:10.5px;
        text-align:center;
        line-height:1.45;
      }
      .op-muted{color:${THEME.colors.muted}}
      .op-amount-due{
        border-radius:16px;
        padding:14px;
        background:linear-gradient(135deg,rgba(222,111,184,.12),rgba(157,124,255,.10));
        border:1px solid ${THEME.colors.border};
      }
      .op-amount-due small{
        display:block;
        color:${THEME.colors.muted};
        font-size:10px;
        text-transform:uppercase;
        letter-spacing:.08em;
        margin-bottom:4px;
        font-weight:900;
      }
      .op-amount-due strong{
        display:block;
        color:${THEME.colors.ink};
        font-size:24px;
        font-weight:950;
      }
      @page{size:letter portrait;margin:.25in}
      @media print{
        .op-doc{width:100%;min-height:auto}
        .op-card,.op-panel,.op-total-card,.op-note{break-inside:avoid}
      }
    `;
  }

  function header(title, number) {
    return `
      <div class="op-topbar"></div>
      <div class="op-header">
        <div>
          <div class="op-brand">Oli<span>Poly</span> 3D</div>
          <div class="op-tagline">${esc(THEME.tagline)}</div>
        </div>
        <div>
          <div class="op-title">${esc(title)}</div>
          ${number ? `<div class="op-number">${esc(number)}</div>` : ""}
        </div>
      </div>
    `;
  }

  function footer(extra = "") {
    return `
      <div class="op-footer">
        ${extra ? `${esc(extra)}<br>` : ""}
        OliPoly 3D LLC • ${esc(THEME.email)} • ${esc(THEME.website)}
      </div>
    `;
  }

  function card(label, value) {
    return `<div class="op-card"><small>${esc(label)}</small><strong>${esc(safe(value))}</strong></div>`;
  }

  function panel(label, content) {
    return `<div class="op-panel"><div class="op-chip">${esc(label)}</div><div>${String(content || "—")}</div></div>`;
  }

  function checklist(items = []) {
    return `
      <div class="op-checklist">
        ${items.map(item => `<div class="op-check"><span class="op-box"></span><span>${esc(item)}</span></div>`).join("")}
      </div>
    `;
  }

  function openPrintWindow(title, bodyHtml, cssText) {
    const win = window.open("", "_blank");
    if (!win) return false;

    win.document.open();
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${cssText}</style></head><body>${bodyHtml}</body></html>`);
    win.document.close();

    setTimeout(() => {
      win.focus();
      win.print();
    }, 350);

    return true;
  }

  window.OliPolyDocumentTheme = {
    THEME,
    esc,
    safe,
    money,
    formatDate,
    basePrintCss,
    header,
    footer,
    card,
    panel,
    checklist,
    openPrintWindow
  };
})();
