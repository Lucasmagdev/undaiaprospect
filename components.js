/* Shared UI helpers used by all views */

export function badge(status) {
  return `<span class="badge ${status.toLowerCase()}">${status}</span>`
}

export function leadStatus(status) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return `<span class="lead-status ${status}">${label}</span>`
}

export function progress(value) {
  return `<div class="progress"><span style="width:${value}%"></span></div>`
}

export function metric(label, value, hint) {
  const isNum = typeof value === 'number'
  return `
    <article class="metric">
      <span class="metric-label">${label}</span>
      <strong class="metric-value"${isNum ? ` data-target="${value}"` : ''}>${isNum ? 0 : value}</strong>
      <small class="metric-hint">${hint}</small>
    </article>
  `
}

export function animateMetrics(root = document) {
  root.querySelectorAll('.metric-value[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target, 10)
    const duration = 900
    const start = performance.now()
    const tick = now => {
      const p = Math.min((now - start) / duration, 1)
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export function skeletonLine(w = '100%') {
  return `<div class="skeleton" style="height:14px;width:${w};border-radius:6px"></div>`
}

export function skeletonTable(rows = 4, cols = 5) {
  const widths = ['60%', '40%', '50%', '30%', '45%']
  const headerCells = Array.from({ length: cols }, (_, i) =>
    `<th><div class="skeleton" style="height:10px;width:${widths[i % widths.length]}"></div></th>`
  ).join('')
  const bodyCells = (row) => Array.from({ length: cols }, (_, i) =>
    `<td><div class="skeleton" style="height:13px;width:${widths[(i + row) % widths.length]};animation-delay:${(row * cols + i) * 60}ms"></div></td>`
  ).join('')
  const bodyRows = Array.from({ length: rows }, (_, i) =>
    `<tr>${bodyCells(i)}</tr>`
  ).join('')
  return `
    <div class="table-scroll">
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `
}

export function skeletonCards(count = 3) {
  return Array.from({ length: count }, (_, i) => `
    <article class="panel" style="min-height:160px;display:flex;flex-direction:column;gap:12px">
      <div class="skeleton" style="height:10px;width:30%;animation-delay:${i * 80}ms"></div>
      <div class="skeleton" style="height:16px;width:70%;animation-delay:${i * 80 + 40}ms"></div>
      <div class="skeleton" style="height:12px;width:90%;animation-delay:${i * 80 + 80}ms"></div>
      <div class="skeleton" style="height:12px;width:55%;animation-delay:${i * 80 + 120}ms;margin-top:auto"></div>
    </article>
  `).join('')
}

export function emptyState(title, subtitle = '', action = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>
      <strong>${title}</strong>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
      ${action}
    </div>
  `
}
