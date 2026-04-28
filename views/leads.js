import { leadStatus, skeletonTable, emptyState } from '../components.js'
import { toast } from '../toast.js'
import { LeadService } from '../services.js'

let filters = { hasWebsite: null, search: '' }

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">CRM comercial</p>
        <h1>Leads</h1>
      </div>
    </section>

    <div class="table-toolbar">
      <div class="search-wrap">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="lead-search" class="search-input" placeholder="Buscar por nome, nicho ou cidade..." />
      </div>
      <div class="filters">
        <button class="secondary filter-btn" data-filter="all">Todos</button>
        <button class="secondary filter-btn" data-filter="website">Com site</button>
        <button class="secondary filter-btn" data-filter="no-website">Sem site</button>
        <button class="secondary" id="export-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          Exportar CSV
        </button>
      </div>
    </div>

    <section class="table-card" id="leads-table">
      ${skeletonTable(4, 7)}
    </section>
  `
}

export async function setup(root) {
  // Reset filters on each mount
  filters = { hasWebsite: null, search: '' }

  // Search — debounced
  let debounce = null
  root.querySelector('#lead-search').addEventListener('input', e => {
    clearTimeout(debounce)
    filters.search = e.target.value
    debounce = setTimeout(() => loadTable(root), 280)
  })

  // Filter buttons
  root.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const f = btn.dataset.filter
      filters.hasWebsite = f === 'website' ? true : f === 'no-website' ? false : null
      loadTable(root)
    })
  })
  root.querySelector('[data-filter="all"]').classList.add('active')

  // Export
  root.querySelector('#export-btn').addEventListener('click', async () => {
    const btn = root.querySelector('#export-btn')
    btn.disabled = true
    btn.textContent = 'Exportando...'
    try {
      const csv = await LeadService.exportCSV()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'leads.csv'; a.click()
      URL.revokeObjectURL(url)
      toast('CSV exportado com sucesso.', 'success')
    } catch {
      toast('Erro ao exportar CSV.', 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg> Exportar CSV`
    }
  })

  await loadTable(root)
}

async function loadTable(root) {
  const table = root.querySelector('#leads-table')
  table.innerHTML = skeletonTable(4, 7)

  let leads
  try {
    leads = await LeadService.list(filters)
  } catch {
    table.innerHTML = `<div style="padding:24px">${emptyState('Erro ao carregar leads', 'Verifique a conexão e tente novamente.')}</div>`
    return
  }

  if (leads.length === 0) {
    table.innerHTML = `<div style="padding:32px">${emptyState('Nenhum lead encontrado', filters.search ? `Nenhum resultado para "${filters.search}".` : 'Tente ajustar os filtros.')}</div>`
    return
  }

  table.innerHTML = `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Empresa</th><th>Telefone</th><th>Cidade</th>
            <th>Nicho</th><th>Website</th><th>Status</th><th>Última interação</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map(l => `
            <tr>
              <td><strong>${l.name}</strong></td>
              <td>${l.phone}</td>
              <td>${l.city}</td>
              <td>${l.niche}</td>
              <td>${l.website === 'sem site' ? `<span class="muted">sem site</span>` : `<a href="https://${l.website}" target="_blank" rel="noopener" style="color:var(--green-600)">${l.website}</a>`}</td>
              <td>${leadStatus(l.status)}</td>
              <td>${l.last}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}
