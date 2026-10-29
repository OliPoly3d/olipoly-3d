const NS = 'http://www.w3.org/2000/svg',
  bindings = new WeakMap();
export const formatMoney = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
export const shortDate = (d) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(d + 'T00:00:00Z'),
  );
function svgNode(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}
function responsive(target, draw) {
  let state = bindings.get(target);
  if (!state) {
    state = { draw };
    if (typeof ResizeObserver !== 'undefined') {
      state.observer = new ResizeObserver(() =>
        state.draw(Math.max(280, target.getBoundingClientRect().width || 640)),
      );
      state.observer.observe(target);
    }
    bindings.set(target, state);
  }
  state.draw = draw;
  draw(Math.max(280, target.getBoundingClientRect().width || 640));
}
export function clearChart(target) {
  const state = bindings.get(target);
  state?.observer?.disconnect();
  bindings.delete(target);
  target.replaceChildren();
}
function beginSvg(target, width, height, title) {
  target.replaceChildren();
  const svg = svgNode('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': title,
    class: 'money-chart',
  });
  svg.append(svgNode('title', {}, title));
  target.append(svg);
  return svg;
}
export function lineChart(
  target,
  series,
  { title = 'Projected balance', floor = null, onSelect, markers = [] } = {},
) {
  responsive(target, (width) => {
    const values = series.flatMap((s) => s.points.map((p) => p.value));
    if (!values.length) {
      target.textContent = 'No complete forecast points in this period.';
      return;
    }
    if (floor !== null) values.push(floor);
    if (!values.length) {
      target.textContent = 'No forecast points in this period.';
      return;
    }
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort(),
      first = +new Date(dates[0]),
      last = +new Date(dates.at(-1)),
      min = Math.min(0, ...values),
      max = Math.max(1, ...values),
      pad = Math.max(100, (max - min) * 0.08),
      low = min - pad,
      high = max + pad,
      left = 75,
      right = width - 14,
      top = 27,
      bottom = 210,
      height = 260,
      x = (d) =>
        left + ((+new Date(d) - first) / Math.max(86400000, last - first)) * (right - left),
      y = (v) => bottom - ((v - low) / (high - low)) * (bottom - top),
      svg = beginSvg(target, width, height, title);
    svg.append(
      svgNode('rect', {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        fill: 'none',
        stroke: 'var(--line)',
      }),
    );
    for (const v of [min, (min + max) / 2, max])
      svg.append(
        svgNode(
          'text',
          { x: left - 8, y: y(v) + 4, 'text-anchor': 'end' },
          formatMoney(Math.round(v)),
        ),
      );
    const count = width < 450 ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const index = Math.round((i * (dates.length - 1)) / (count - 1)),
        d = dates[index];
      svg.append(
        svgNode(
          'text',
          {
            x: x(d),
            y: bottom + 21,
            'text-anchor': i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle',
          },
          shortDate(d),
        ),
      );
    }
    svg.append(
      svgNode('text', { x: left, y: 14 }, 'Balance ($)'),
      svgNode('text', { x: (left + right) / 2, y: 252, 'text-anchor': 'middle' }, 'Forecast date'),
    );
    if (floor !== null) {
      svg.append(
        svgNode('line', {
          x1: left,
          x2: right,
          y1: y(floor),
          y2: y(floor),
          stroke: 'var(--warning)',
          'stroke-dasharray': '5 4',
        }),
        svgNode(
          'text',
          { x: right - 4, y: y(floor) - 7, 'text-anchor': 'end' },
          'Floor ' + formatMoney(floor),
        ),
      );
    }
    for (const [index, s] of series.entries()) {
      const color = s.color || ['var(--accent)', 'var(--warning)', '#b6c1cc', '#8ab7e0'][index % 4];
      const g = svgNode('g', s.debt ? { 'data-debt-private': '' } : {});
      g.append(
        svgNode('polyline', {
          points: s.points.map((p) => x(p.date) + ',' + y(p.value)).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': index ? 1.8 : 2.8,
          ...(s.dashed ? { 'stroke-dasharray': '4 3' } : {}),
        }),
      );
      svg.append(g);
    }
    const visibleMarkers = markers.filter((m) => dates.includes(m.date));
    for (const m of visibleMarkers) {
      const value = series[0].points.find((p) => p.date === m.date)?.value;
      if (value === undefined) continue;
      svg.append(
        svgNode('circle', {
          cx: x(m.date),
          cy: y(value),
          r: 3,
          fill: m.kind === 'income' ? 'var(--accent)' : 'var(--warning)',
        }),
      );
    }
    if (onSelect) {
      const hit = svgNode('rect', {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        fill: 'transparent',
      });
      hit.addEventListener('click', (event) => {
        const bounds = svg.getBoundingClientRect(),
          px = ((event.clientX - bounds.left) * width) / Math.max(1, bounds.width),
          instant =
            first +
            ((Math.max(left, Math.min(right, px)) - left) / (right - left)) * (last - first);
        onSelect(
          dates.reduce((a, d) =>
            Math.abs(+new Date(d) - instant) < Math.abs(+new Date(a) - instant) ? d : a,
          ),
        );
      });
      svg.append(hit);
    }
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    for (const s of series) {
      const span = document.createElement('span');
      span.textContent = s.label;
      if (s.debt) span.setAttribute('data-debt-private', '');
      legend.append(span);
    }
    target.append(legend);
  });
}
export function waterfallChart(target, bridge) {
  responsive(target, (width) => {
    const rows = bridge.rows,
      small = width < 500,
      stride = small ? 66 : 48,
      height = rows.length * stride + 24,
      left = small ? 10 : 190,
      right = width - 16,
      values = [0, bridge.opening, bridge.closing];
    let running = bridge.opening;
    for (const row of rows.slice(1, -1)) {
      values.push(running);
      running += row.amount;
      values.push(running);
    }
    const min = Math.min(...values),
      max = Math.max(1, ...values),
      x = (v) => left + ((v - min) / (max - min)) * (right - left),
      svg = beginSvg(target, width, height, 'Cash bridge from opening to closing balance');
    running = bridge.opening;
    rows.forEach((row, i) => {
      const total = i === 0 || i === rows.length - 1,
        start = total ? 0 : running,
        finish = total ? row.amount : running + row.amount;
      if (!total) running = finish;
      const y = 12 + i * stride,
        barY = small ? y + 21 : y;
      svg.append(
        svgNode('text', { x: 5, y: y + 13 }, row.label),
        svgNode('rect', {
          x: Math.min(x(start), x(finish)),
          y: barY,
          width: Math.max(1, Math.abs(x(finish) - x(start))),
          height: 16,
          fill: total ? 'var(--muted)' : row.amount >= 0 ? 'var(--accent)' : 'var(--warning)',
        }),
        svgNode('text', { x: right, y: barY + 31, 'text-anchor': 'end' }, formatMoney(row.amount)),
      );
    });
  });
}
export function timelineChart(target, items, { title = 'Upcoming milestones', start, end } = {}) {
  responsive(target, (width) => {
    if (!items.length) {
      target.textContent = 'No dated events in this period.';
      return;
    }
    const first = +new Date(start || items[0].date),
      last = +new Date(end || items.at(-1).date),
      left = 18,
      right = width - 18,
      rows = items.slice(0, 30),
      chars = Math.max(25, Math.floor((width - 36) / 6.5));
    let cursor = 48;
    const layouts = rows.map((item) => {
        const words = (item.shortName || item.name).split(' '),
          lines = [''];
        for (const word of words) {
          if ((lines.at(-1) + ' ' + word).length > chars) lines.push(word);
          else lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
        }
        const result = { item, lines, y: cursor };
        cursor += 28 + lines.length * 16;
        return result;
      }),
      svg = beginSvg(target, width, cursor + 10, title),
      x = (d) =>
        left + ((+new Date(d) - first) / Math.max(86400000, last - first)) * (right - left);
    svg.append(
      svgNode('line', { x1: left, x2: right, y1: 15, y2: 15, stroke: 'var(--line)' }),
      svgNode(
        'text',
        { x: left, y: 32 },
        shortDate(start || items[0].date) + ' ' + (start || items[0].date).slice(0, 4),
      ),
      svgNode(
        'text',
        { x: right, y: 32, 'text-anchor': 'end' },
        shortDate(end || items.at(-1).date) + ' ' + (end || items.at(-1).date).slice(0, 4),
      ),
    );
    for (const { item, lines, y } of layouts) {
      const g = svgNode('g', item.debt ? { 'data-debt-private': '' } : {});
      g.append(
        svgNode('title', {}, item.date + ' ' + item.name),
        svgNode('circle', { cx: x(item.date), cy: 15, r: 4, fill: 'var(--accent)' }),
        svgNode('text', { x: left, y }, shortDate(item.date) + ' ' + item.date.slice(0, 4)),
      );
      lines.forEach((line, i) => g.append(svgNode('text', { x: left, y: y + 17 + i * 16 }, line)));
      svg.append(g);
    }
  });
}

export function categoryBalanceChart(target,rows){
 responsive(target,width=>{if(!rows.length){target.textContent='Add everyday category targets to see their combined remainder.';return;}const known=rows.filter(r=>r.value!==null),extent=Math.max(1,...known.map(r=>Math.abs(r.value))),left=width<500?92:124,right=width-78,top=30,stride=42,bottom=top+rows.length*stride,height=bottom+48,zero=(left+right)/2,scale=(right-left)/2/extent,svg=beginSvg(target,width,height,'Everyday category allowance remaining in dollars; overages offset unused allowances');
  svg.append(svgNode('text',{x:left,y:15},'Over target'),svgNode('text',{x:right,y:15,'text-anchor':'end'},'Allowance left'),svgNode('line',{x1:zero,x2:zero,y1:top-9,y2:bottom-10,stroke:'var(--line)'}));
  rows.forEach((row,index)=>{const y=top+index*stride,g=svgNode('g');g.append(svgNode('title',{},row.name+': '+(row.value===null?'Target missing':formatMoney(row.value)+' left')),svgNode('text',{x:3,y:y+15},row.name.length>(width<500?13:19)?row.name.slice(0,width<500?12:18)+'…':row.name));if(row.value!==null){const span=Math.abs(row.value)*scale;g.append(svgNode('rect',{x:row.value<0?zero-span:zero,y:y+2,width:span,height:18,rx:2,fill:row.value<0?'var(--warning)':'var(--accent)'}));}g.append(svgNode('text',{x:width-3,y:y+15,'text-anchor':'end'},row.value===null?'Set target':formatMoney(row.value)));svg.append(g);});
  svg.append(svgNode('text',{x:zero,y:bottom+8,'text-anchor':'middle'},'$0'),svgNode('text',{x:(left+right)/2,y:bottom+32,'text-anchor':'middle'},'Monthly allowance remaining ($)'));
 });
}
