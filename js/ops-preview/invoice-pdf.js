(function (root) {
  'use strict';

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 46;
  const bottom = 730;
  const right = pageWidth - margin;
  const ink = '#242027';
  const muted = '#645d66';
  const brand = '#963d64';
  const money = new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'});

  function pagesFor(invoice) {
    const pages = [];
    let canvas, ctx, y;
    function text(value, x, baseline, {size=11, color=ink, bold=false, align='left'} = {}) {
      ctx.font = `${bold ? '700' : '400'} ${size}px Arial, sans-serif`;
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(String(value ?? ''), x, baseline);
    }
    function line(baseline) {
      ctx.fillStyle = '#ded7dd';
      ctx.fillRect(margin, baseline, right-margin, 0.7);
    }
    function newPage() {
      canvas = document.createElement('canvas');
      canvas.width = pageWidth * 2;
      canvas.height = pageHeight * 2;
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser could not render the invoice PDF.');
      ctx.scale(2,2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0,0,pageWidth,pageHeight);
      pages.push(canvas);
      text('OliPoly 3D LLC',margin,57,{size:22,bold:true,color:brand});
      text('INVOICE',right,57,{size:18,bold:true,align:'right'});
      text('990 Aurora Hudson Rd · Aurora, OH 44202',margin,78,{color:muted});
      text(invoice.number,right,78,{bold:true,align:'right'});
      text('olipoly3d.com',margin,95,{color:muted});
      text('ERP Test',right,95,{color:muted,align:'right'});
      line(112);
      y = 134;
    }
    function wrapped(value, width) {
      ctx.font = '400 11px Arial, sans-serif';
      const lines = [];
      for (const paragraph of String(value ?? '').split(/\r?\n/)) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (ctx.measureText(next).width <= width) { line = next; continue; }
          if (line) lines.push(line);
          line = '';
          for (const ch of word) {
            if (line && ctx.measureText(line + ch).width > width) { lines.push(line); line = ''; }
            line += ch;
          }
        }
        lines.push(line);
      }
      return lines;
    }
    function detail(label,value) {
      if (!value) return;
      const rows = wrapped(value,right-margin-110);
      rows.forEach((row,i) => {
        if (y > bottom) newPage();
        if (!i) text(label,margin,y,{bold:true});
        text(row,margin+110,y);
        y += 16;
      });
      y += 4;
    }
    function tableHeader() {
      ctx.fillStyle = '#f4ebf0';
      ctx.fillRect(margin,y-13,right-margin,22);
      text('Item',margin+8,y,{bold:true});
      text('Qty',right-142,y,{bold:true,align:'right'});
      text('Amount before tax',right-8,y,{bold:true,align:'right'});
      y += 26;
    }

    newPage();
    detail('Order',invoice.reference);
    detail('Purchase order',invoice.poNumber);
    detail('Invoice date',invoice.issueDate);
    detail('Payment due',invoice.dueDate);
    detail('Terms',invoice.terms);
    detail('Bill to',[invoice.customer,invoice.billTo].filter(Boolean).join('\n'));
    detail('Ship to',invoice.shipTo);
    detail('Project',invoice.title);
    y += 8;
    if (y > bottom-40) newPage();
    tableHeader();
    const totals = invoice.totals;
    for (const item of totals.lineItems) {
      const rows = wrapped(item.description,right-margin-170);
      if (y + rows.length * 15 > bottom) { newPage(); tableHeader(); }
      text(item.quantity,right-142,y,{align:'right'});
      text(money.format(item.line_total),right-8,y,{align:'right'});
      rows.forEach(row=>{text(row,margin+8,y); y+=15;});
      line(y-7);
      y+=7;
    }
    const amounts = [
      ['Item subtotal',totals.preDiscount],
      ['Discount',-totals.discount],
      ['Shipping or delivery charge',totals.customerShipping],
      ['Sales tax',totals.tax],
      ['Discount or adjustment',totals.roundingAdjustment],
      ['Invoice total',totals.total],
      ['Payments received at issuance',invoice.paid],
      ['Amount due at issuance',invoice.balance]
    ].filter(([label,value])=>!['Discount','Shipping or delivery charge','Discount or adjustment'].includes(label) || Math.round((value||0)*100));
    if (y + amounts.length*21 > bottom) newPage();
    y+=10;
    amounts.forEach(([label,value],i)=>{
      const isDue = i===amounts.length-1;
      if (isDue) line(y-14);
      text(label,right-118,y,{bold:isDue,align:'right',color:isDue?brand:ink});
      text(money.format(value),right-8,y,{bold:isDue,align:'right',color:isDue?brand:ink});
      y+=21;
    });

    return pages.map((page,index)=>{
      ctx=page.getContext('2d');
      text(`Page ${index+1} of ${pages.length}`,right,758,{size:9,color:muted,align:'right'});
      return {width:page.width,height:page.height,
        data:Uint8Array.from(root.atob(page.toDataURL('image/jpeg',0.94).split(',')[1]),ch=>ch.charCodeAt(0))};
    });
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

  root.OliPolyInvoicePdf = {create: invoice=>packPdf(pagesFor(invoice))};
})(globalThis);
