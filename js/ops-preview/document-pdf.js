(function (root) {
  'use strict';

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 44;
  const contentTop = 153;
  const bottom = 733;
  const tableHeaderHeight = 29;
  const right = pageWidth - margin;
  const width = right - margin;
  const paper = '#f5f2ed';
  const surface = '#fffdf9';
  const ink = '#19171a';
  const muted = '#625b64';
  const rule = '#d8d0cc';
  const rose = '#ce4f87';
  const sans = '"OliPoly Document Sans", Arial, sans-serif';
  const serif = '"OliPoly Document Serif", Georgia, serif';
  const money = new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'});
  const dateFormat = new Intl.DateTimeFormat('en-US', {dateStyle:'long',timeZone:'America/New_York'});
  function dateLabel(value) {
    if (!value) return '';
    const date = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
    return Number.isFinite(date.getTime()) ? dateFormat.format(date) : value;
  }

  const script = root.document?.currentScript?.src;
  const ready = script && root.FontFace && root.document.fonts ? Promise.allSettled([
    ['OliPoly Document Sans', 'dm-sans.woff2', '100 1000'],
    ['OliPoly Document Serif', 'playfair-display.woff2', '400 900']
  ].map(async ([family, file, weight]) => {
    const url = new URL('../../assets/fonts/olipoly-document/' + file, script);
    const face = new root.FontFace(family, `url("${url.href}")`, {weight});
    root.document.fonts.add(await face.load());
  })) : Promise.resolve();

  function pagesFor(doc) {
    const pages = [];
    let ctx, y;
    let heading = doc.heading;

    function font(size, weight, family) {
      ctx.font = `${weight} ${size}px ${family}`;
    }
    function text(value, x, baseline, {size=10, color=ink, weight=400, align='left', family=sans, maxWidth} = {}) {
      font(size, weight, family);
      ctx.textAlign = align;
      ctx.fillStyle = color;
      const label = String(value ?? '');
      if (maxWidth) ctx.fillText(label, x, baseline, maxWidth);
      else ctx.fillText(label, x, baseline);
    }
    function fill(color, x, top, w, h) {
      ctx.fillStyle = color;
      ctx.fillRect(x, top, w, h);
    }
    function line(at, color=rule) {
      fill(color, margin, at, width, 0.7);
    }
    function newPage() {
      const canvas = document.createElement('canvas');
      canvas.width = pageWidth * 2;
      canvas.height = pageHeight * 2;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser could not render the PDF.');
      ctx.scale(2, 2);
      fill(paper, 0, 0, pageWidth, pageHeight);
      pages.push(canvas);

      text('Oli', margin, 46, {size:29, weight:600, family:serif});
      const markWidth = ctx.measureText('Oli').width;
      text('Poly', margin + markWidth, 46, {size:29, weight:600, family:serif, color:rose});
      text('THOUGHTFUL DESIGN FOR REAL LIFE.', margin, 63, {size:7.5, weight:700, color:muted});
      text('OLIPOLY 3D LLC', right, 43, {size:8.5, weight:700, align:'right'});
      text('olipoly3d.com', right, 58, {size:9, align:'right', color:muted});
      line(77, rose);
      text(heading, margin, 113, {size:heading === doc.heading ? 30 : 24, weight:500, family:serif, maxWidth:width - 150});
      text(doc.number, right, 96, {size:11, weight:700, align:'right', maxWidth:240});
      doc.header.forEach((value, i) => text(value, right, 112 + i * 14, {
        align:'right', color:muted, maxWidth:244
      }));
      y = contentTop;
    }
    function wrapped(value, available, size=10, weight=400) {
      font(size, weight, sans);
      const lines = [];
      for (const paragraph of String(value ?? '').split(/\r?\n/)) {
        let current = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          const candidate = current ? `${current} ${word}` : word;
          if (ctx.measureText(candidate).width <= available) {
            current = candidate;
            continue;
          }
          if (current) lines.push(current);
          current = '';
          for (const ch of word) {
            if (current && ctx.measureText(current + ch).width > available) {
              lines.push(current);
              current = '';
            }
            current += ch;
          }
        }
        lines.push(current);
      }
      return lines;
    }
    function block(label, value, {size=10, weight=400, leading=15} = {}) {
      if (!value) return;
      if (y + 29 > bottom) newPage();
      text(label.toUpperCase(), margin, y, {size:8, weight:700, color:muted});
      y += 16;
      for (const entry of wrapped(value, width, size, weight)) {
        if (y > bottom) newPage();
        text(entry, margin, y, {size, weight});
        y += leading;
      }
      y += 9;
    }
    function parties() {
      const x = margin + width / 2 + 10;
      text('FROM', margin, y, {size:8, weight:700, color:muted});
      text(doc.partyLabel, x, y, {size:8, weight:700, color:muted});
      y += 17;
      ['OliPoly 3D LLC', '990 Aurora Hudson Road', 'Aurora, OH 44202', 'OliPoly3D@gmail.com'].forEach((value, i) => {
        text(value, margin, y + i * 14, {weight:i ? 400 : 700});
      });
      const customer = wrapped(doc.customer, right - x, 10, 700);
      const address = doc.billingAddress ? wrapped(doc.billingAddress, right - x) : [];
      for (const [i, entry] of [...customer, ...address].entries()) {
        if (y > bottom) newPage();
        text(entry, x, y, {weight:i < customer.length ? 700 : 400});
        y += 14;
      }
      y += Math.max(0, 4 - customer.length - address.length) * 14 + 9;
      line(y - 4);
      y += 13;
    }
    function tableHeader() {
      fill(surface, margin, y - 12, width, 23);
      text('DESCRIPTION', margin + 9, y + 2, {size:8, weight:700, color:muted});
      text('QTY', right - (doc.showUnit ? 160 : 118), y + 2, {size:8, weight:700, align:'right', color:muted});
      if (doc.showUnit) text('UNIT PRICE', right - 80, y + 2, {size:8, weight:700, align:'right', color:muted});
      text('AMOUNT', right - 9, y + 2, {size:8, weight:700, align:'right', color:muted});
      line(y + 11);
      y += tableHeaderHeight;
    }

    newPage();
    parties();
    doc.beforeItems.forEach(([label,value]) => block(label, value));
    if (y + 45 > bottom) newPage();
    tableHeader();
    for (const item of doc.items) {
      const description = wrapped(item.description, width - (doc.showUnit ? 195 : 155));
      const rowHeight = description.length * 15 + 7;
      const maxRowHeight = bottom - contentTop - tableHeaderHeight;
      if (y + Math.min(rowHeight, maxRowHeight) > bottom) { newPage(); tableHeader(); }
      text(item.quantity, right - (doc.showUnit ? 160 : 118), y, {align:'right'});
      if (doc.showUnit) text(money.format(item.unit_price), right - 80, y, {align:'right'});
      text(money.format(item.line_total), right - 9, y, {align:'right'});
      for (const entry of description) {
        if (y + 6 > bottom) { newPage(); tableHeader(); }
        text(entry, margin + 9, y);
        y += 15;
      }
      line(y - 4);
      y += 7;
    }

    if (y + doc.summary.length * 21 + 44 > bottom) newPage();
    y += 8;
    for (const [label, value] of doc.summary) {
      text(label, margin + 9, y);
      text(money.format(value), right - 9, y, {align:'right', weight:700});
      line(y + 6);
      y += 21;
    }
    fill(ink, margin, y - 13, width, 33);
    fill(rose, margin, y - 13, 3, 33);
    text(doc.totalLabel.toUpperCase(), margin + 9, y + 7, {weight:700, color:'#fff'});
    text(money.format(doc.total), right - 9, y + 8, {size:16, weight:700, align:'right', color:'#fff'});
    y += 41;
    doc.afterTotal.forEach(([label,value]) => block(label, value));
    if (doc.appendix?.length) {
      heading = 'Consumer Custom Order Terms';
      newPage();
      doc.appendix.forEach(([label,value]) => block(label,value,{size:9.5,leading:12}));
    }

    return pages.map((page,index)=>{
      ctx = page.getContext('2d');
      line(748);
      text('OliPoly 3D LLC / Aurora, Ohio', margin, 762, {size:7.5,color:muted});
      text(`${index+1} / ${pages.length}`, pageWidth / 2, 762, {size:7.5,color:muted,align:'center'});
      text('olipoly3d.com | OliPoly3D@gmail.com', right, 762, {size:7.5,color:muted,align:'right'});
      text('ERP TEST COPY', margin, 775, {size:7,weight:700,color:muted});
      return {width:page.width,height:page.height,
        data:Uint8Array.from(root.atob(page.toDataURL('image/jpeg',0.94).split(',')[1]),ch=>ch.charCodeAt(0))};
    });
  }

  function invoiceDocument(invoice) {
    const totals = invoice.totals;
    return {
      heading:'Invoice', number:invoice.number, partyLabel:'BILL TO', customer:invoice.customer, billingAddress:invoice.billTo,
      header:[`Issued ${dateLabel(invoice.issueDate)}`, `Due ${dateLabel(invoice.dueDate)} · ${money.format(invoice.balance)}`],
      beforeItems:[
        ['Order / PO', [invoice.reference, invoice.poNumber ? `PO ${invoice.poNumber}` : ''].filter(Boolean).join('  /  ')],
        ['Ship to', invoice.shipTo],
        ['Project', invoice.title]
      ],
      items:totals.lineItems, showUnit:false,
      summary:[
        ['Item subtotal', totals.preDiscount],
        ...(totals.discount ? [['Discount', -totals.discount]] : []),
        ...(totals.customerShipping ? [['Shipping or delivery charge', totals.customerShipping]] : []),
        ['Sales tax', totals.tax],
        ...(Math.round((totals.roundingAdjustment || 0) * 100) ? [['Discount or adjustment', totals.roundingAdjustment]] : []),
        ['Invoice total', totals.total], ['Payments received at issuance', invoice.paid]
      ],
      totalLabel:'Amount due at issuance', total:invoice.balance,
      afterTotal:[['Payment terms', invoice.terms]]
    };
  }

  function quoteDocument(quote) {
    const totals = quote.totals;
    return {
      heading:'Quotation', number:quote.displayNumber, partyLabel:'PREPARED FOR', customer:quote.customer,
      header:[quote.sentAt ? `Issued ${dateLabel(quote.sentAt)}` : '',
        quote.validUntil ? `Valid through ${dateLabel(quote.validUntil)}` : '',
        quote.consumerTerms ? 'Includes Consumer Custom Order Terms' : ''].filter(Boolean),
      beforeItems:[['Project', quote.title]],
      items:totals.grossLineItems || totals.lineItems, showUnit:true,
      summary:[
        ['Before tax', totals.beforeTax],
        [totals.taxIncluded ? 'Sales tax included in item prices' : 'Sales tax', totals.tax],
        ...(Math.round((totals.roundingAdjustment || 0) * 100) ? [['Discount or adjustment', totals.roundingAdjustment]] : [])
      ],
      totalLabel:'Quoted total', total:totals.total, appendix:quote.consumerTerms,
      afterTotal:[['Payment terms', quote.terms], ['Turnaround', quote.turnaround],
        ['Quote notes', quote.customerNotes], ['Fulfillment', quote.fulfillmentNote], ['Acceptance', quote.acceptance]]
    };
  }

  function receiptDocument(receipt) {
    const totals = receipt.totals;
    return {
      heading:'Payment Receipt', number:receipt.number, partyLabel:'RECEIPT FOR', customer:receipt.customer,
      header:[dateLabel(receipt.date), receipt.status],
      beforeItems:[['Order',receipt.reference],['Project',receipt.title],['Payment method',receipt.method]],
      items:totals.lineItems, showUnit:false,
      summary:[
        ['Item subtotal',totals.preDiscount],
        ...(totals.discount ? [['Discount',-totals.discount]] : []),
        ...(totals.customerShipping ? [['Shipping or delivery',totals.customerShipping]] : []),
        ['Sales tax',totals.tax],
        ...(Math.round((totals.roundingAdjustment || 0) * 100) ? [['Discount or adjustment',totals.roundingAdjustment]] : []),
        ['Order total',totals.total],['Previous payments',receipt.priorPaid],['Remaining balance',receipt.balance]
      ],
      totalLabel:'Payment received',total:receipt.amount,
      afterTotal:[['Order questions',receipt.note]]
    };
  }

  // Wrap browser-rendered pages in a PDF. Keeping binary image data separate
  // from syntax ensures cross-reference offsets count actual bytes.
  function packPdf(pages) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;
    function append(value) {
      const bytes = typeof value === 'string' ? encoder.encode(value) : value;
      chunks.push(bytes);
      length += bytes.byteLength;
    }
    function object(...parts) {
      const id = offsets.length;
      offsets.push(length);
      append(`${id} 0 obj\n`);
      parts.forEach(append);
      append('\nendobj\n');
    }
    append('%PDF-1.4\n');
    append(new Uint8Array([37,226,227,207,211,10]));
    object('<< /Type /Catalog /Pages 2 0 R >>');
    object(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
    pages.forEach(({width,height,data},i)=>{
      const image = 4+i*3;
      const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
      object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${image+1} 0 R >>`);
      object(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.byteLength} >>\nstream\n`,data,'\nendstream');
      object(`<< /Length ${content.length} >>\nstream\n`,content,'endstream');
    });
    const start = length;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach(offset=>append(`${String(offset).padStart(10,'0')} 00000 n \n`));
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
    return new Blob(chunks,{type:'application/pdf'});
  }

  root.OliPolyDocumentPdf = {
    ready,
    invoice: invoice => packPdf(pagesFor(invoiceDocument(invoice))),
    quote: quote => packPdf(pagesFor(quoteDocument(quote))),
    receipt: receipt => packPdf(pagesFor(receiptDocument(receipt)))
  };
})(globalThis);
