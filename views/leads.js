import { leadStatus, skeletonTable, emptyState, skeletonCards } from '../components.js'
import { toast } from '../toast.js'
import { LeadService } from '../services.js'
import { rescoreLeads, isCustomized } from '../prospect.js'

let filters = { hasWebsite: null, status: null, search: '' }
let discoveryResults = []
let discoveryMinProspect = 40

const PILOT_IMPORT_LIMIT = 20
const RECOMMENDED_MIN_SCORE = 40

const NICHES = [
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'academia', label: 'Academia' },
  { value: 'advocacia', label: 'Advocacia' },
  { value: 'contabilidade', label: 'Contabilidade' },
  { value: 'estetica', label: 'Clinica Estetica' },
  { value: 'imobiliaria', label: 'Imobiliaria' },
]

function websiteHref(value) {
  if (!value || value === 'sem site') return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function safetyStatus(status) {
  return {
    new: 'Pendente',
    qualified: 'Aprovado',
    invalid: 'Rejeitado',
    opt_out: 'Opt-out',
    sent: 'Enviado',
    responded: 'Respondeu',
    closed: 'Fechado',
  }[status] || status
}

function phoneTypeBadge(type) {
  if (type === 'mobile') return '<span class="badge-success" title="Celular — potencial WhatsApp">Celular</span>'
  if (type === 'landline') return '<span class="badge-warning" title="Fixo — improvavel WhatsApp">Fixo</span>'
  return '<span class="badge-neutral" title="Tipo desconhecido">?</span>'
}

function formatCnpj(value) {
  const d = String(value || '').replace(/\D/g, '')
  if (d.length !== 14) return value || ''
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function prospectBadge(score) {
  if (score == null) return ''
  const cls   = score >= 65 ? 'badge-success' : score >= 40 ? 'badge-warning' : 'bad'
  const label = score >= 65 ? `⭐ Potencial ${score}` : score >= 40 ? `Potencial ${score}` : `Baixo ${score}`
  return `<span class="${cls}" title="Score de potencial comercial (PME)" style="font-size:10px;font-weight:600">${label}</span>`
}

function gateBadge(gate) {
  if (!gate) return ''
  const cls = gate.status === 'recommended' ? 'badge-success' : gate.status === 'blocked' ? 'bad' : 'badge-warning'
  const label = gate.status === 'recommended' ? 'Recomendado' : gate.status === 'blocked' ? 'Bloqueado' : 'Revisar'
  return `<span class="${cls}" title="${gate.reason || ''}" style="font-size:10px;font-weight:600">${label}</span>`
}

function sourceBadge(source) {
  if (Array.isArray(source)) {
    return source.slice(0, 3).map(s => sourceBadge(s)).join('')
  }
  const map = {
    overpass:      'OSM',
    foursquare:    '4sq',
    guiamais:      'GuiaMais',
    apontador:     'Apontador',
    cnpj:          'Receita Federal',
    google_places: 'Google',
  }
  return `<span class="badge-neutral" style="font-size:10px">${map[source] || source}</span>`
}

function isCampaignCandidate(lead) {
  const gate = lead.prospect_gate || {}
  return gate.status === 'recommended' && Boolean(lead.phone) && (lead.prospect_score ?? 0) >= RECOMMENDED_MIN_SCORE
}

function visibleDiscoveryResults() {
  return discoveryResults.filter(l => !l.already_contacted && (l.prospect_score ?? 0) >= discoveryMinProspect)
}

function recommendedDiscoveryResults() {
  return discoveryResults.filter(l => !l.already_contacted && isCampaignCandidate(l)).slice(0, PILOT_IMPORT_LIMIT)
}

function leadSummary(leads = []) {
  return {
    total: leads.length,
    pending: leads.filter(l => l.status === 'new').length,
    approved: leads.filter(l => l.status === 'qualified').length,
    ready: leads.filter(l => l.status === 'qualified' && l.phone && l.phone !== '—').length,
  }
}

function renderDiscoveryResults() {
  if (!discoveryResults.length) return ''

  const visible = visibleDiscoveryResults()
  const recommended = recommendedDiscoveryResults()
  const mobile  = visible.filter(l => l.phone_type === 'mobile').length
  const blocked = discoveryResults.filter(l => l.prospect_gate?.status === 'blocked').length
  const review = discoveryResults.filter(l => l.prospect_gate?.status === 'review').length
  const highPotential = discoveryResults.filter(l => (l.prospect_score ?? 0) >= 65).length
  const alreadyImported = discoveryResults.filter(l => l.already_contacted).length

  return `
    <div class="discovery-results">
      <div class="discovery-results-head">
        <div>
          <strong>${visible.length} leads novos exibidos</strong>
          <span class="muted" style="font-size:12px;margin-left:8px">${recommended.length} recomendados · ${review} revisar · ${blocked} bloqueados · ${mobile} celulares · ${highPotential} alto potencial${alreadyImported ? ` · ${alreadyImported} já importados (ocultos)` : ''}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;font-size:.82rem;font-weight:500">
            Potencial minimo
            <select id="prospect-filter" style="padding:4px 8px;font-size:.8rem;border-radius:6px;border:1px solid var(--border);background:var(--surface)">
              <option value="0"   ${discoveryMinProspect === 0  ? 'selected' : ''}>Todos</option>
              <option value="40"  ${discoveryMinProspect === 40 ? 'selected' : ''}>Medio (40+)</option>
              <option value="65"  ${discoveryMinProspect === 65 ? 'selected' : ''}>Alto (65+)</option>
              <option value="75"  ${discoveryMinProspect === 75 ? 'selected' : ''}>Muito alto (75+)</option>
            </select>
          </label>
          <button class="primary import-recommended-btn" type="button" ${recommended.length ? '' : 'disabled'}>Importar recomendados (${recommended.length})</button>
          <button class="secondary approve-recommended-btn" type="button" ${recommended.length ? '' : 'disabled'}>Aprovar recomendados (${recommended.length})</button>
          <button class="secondary import-visible-btn" type="button" ${visible.length ? '' : 'disabled'}>Importar exibidos (${visible.length})</button>
        </div>
      </div>
      <div class="discovery-cards">
        ${visible.map((lead, _i) => {
          const origIdx = discoveryResults.indexOf(lead)
          const sig = lead.prospect_signals || { pos: [], neg: [] }
          const gate = lead.prospect_gate || { status: 'review', reason: 'Revisar manualmente' }
          const gateClass = gate.status === 'recommended' ? 'badge-success' : gate.status === 'blocked' ? 'bad' : 'badge-warning'
          const gateLabel = gate.status === 'recommended' ? 'Recomendado' : gate.status === 'blocked' ? 'Bloqueado' : 'Revisar'
          const allSigs = [...(sig.pos || []).map(s => `<span style="color:var(--green-600)">✓ ${s}</span>`), ...(sig.neg || []).map(s => `<span style="color:var(--red-500)">✗ ${s}</span>`)]
          return `
          <div class="discovery-card" data-idx="${origIdx}">
            <div class="discovery-card-head">
              <strong>${lead.name}</strong>
              <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
                ${prospectBadge(lead.prospect_score)}
                <span class="${gateClass}" title="${gate.reason}" style="font-size:10px;font-weight:600">${gateLabel}</span>
                ${sourceBadge(lead.sources?.length ? lead.sources : lead.source)}
                ${lead.phone ? phoneTypeBadge(lead.phone_type) : ''}
              </div>
            </div>
            ${allSigs.length ? `<div style="display:flex;flex-direction:column;gap:2px;font-size:.72rem;margin:4px 0;line-height:1.4">${allSigs.join('')}</div>` : ''}
            ${lead.already_contacted ? '<span class="badge-neutral" style="font-size:10px">Já importado</span>' : ''}
            ${lead.phone ? `<span class="discovery-phone">${lead.phone}</span>` : '<span class="muted">sem telefone</span>'}
            ${lead.cnpj ? `<span class="muted" style="font-size:11px">CNPJ ${formatCnpj(lead.cnpj)}</span>` : ''}
            ${lead.email ? `<span class="muted" style="font-size:11px">${lead.email}</span>` : ''}
            ${lead.address ? `<p class="discovery-addr">${lead.address}</p>` : ''}
            ${lead.website ? `<a href="${websiteHref(lead.website)}" target="_blank" rel="noopener" class="discovery-site">${lead.website}</a>` : ''}
            ${lead.already_contacted ? '' : `<button class="secondary import-one-btn" type="button" data-idx="${origIdx}">Importar</button>`}
          </div>
        `}).join('')}
      </div>
    </div>
  `
}

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">CRM comercial</p>
        <h1>Leads</h1>
      </div>
      <button class="secondary" id="scoring-config-btn" style="gap:6px">Scoring${isCustomized() ? ' ajustado' : ''}</button>
    </section>

    <article class="panel prospect-panel">
      <div class="panel-head">
        <h2>Prospectar leads</h2>
        <span class="badge-neutral">Google · Foursquare · Geoapify · HERE · Receita · OSM</span>
      </div>
      <div class="pilot-strip">
        <div>
          <span>Busca sugerida</span>
          <strong>50 leads</strong>
        </div>
        <div>
          <span>Importar</span>
          <strong>ate 20</strong>
        </div>
        <div>
          <span>Disparar</span>
          <strong>15-20 aprovados</strong>
        </div>
      </div>
      <form class="prospect-form" autocomplete="off">
        <label>Nicho
          <select name="niche">
            ${NICHES.map(n => `<option value="${n.value}">${n.label}</option>`).join('')}
          </select>
        </label>
        <label>Cidade
          <input name="city" value="Belo Horizonte" placeholder="Ex: Sao Paulo" />
        </label>
        <label>Limite
          <input name="limit" type="number" value="50" min="5" max="100" />
        </label>
        <button class="primary prospect-btn" type="submit">Buscar leads</button>
      </form>
      <p class="muted" style="margin-top:10px;font-size:12px">
        Para campo: busque 50, importe os recomendados e aprove manualmente 15-20 antes da campanha.
      </p>
      <div class="prospect-results"></div>
    </article>

    <div class="table-toolbar">
      <div class="search-wrap">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="lead-search" class="search-input" placeholder="Buscar por nome, nicho ou cidade..." />
      </div>
      <div class="filters">
        <button class="secondary filter-btn" data-filter="all">Todos</button>
        <button class="secondary status-filter-btn" data-status="new">Pendentes</button>
        <button class="secondary status-filter-btn" data-status="qualified">Aprovados</button>
        <button class="secondary status-filter-btn" data-status="invalid">Rejeitados</button>
        <button class="secondary filter-btn" data-filter="website">Com site</button>
        <button class="secondary filter-btn" data-filter="no-website">Sem site</button>
        <button class="secondary" id="dedup-btn" title="Remove duplicatas do banco por telefone, preservando o de maior status">
          Limpar duplicatas
        </button>
        <button class="secondary" id="export-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
          Exportar CSV
        </button>
      </div>
    </div>

    <section class="table-card" id="leads-table">
      ${skeletonTable(4, 9)}
    </section>
  `
}

async function importLead(lead, root) {
  return importLeadWithStatus(lead, root, 'new')
}

async function importLeadWithStatus(lead, root, status = 'new') {
  try {
    await LeadService.create({
      name: lead.name,
      phone: lead.phone || null,
      address: lead.address || null,
      website: lead.website || null,
      cnpj: lead.cnpj || null,
      email: lead.email || null,
      niche: lead.niche,
      city: lead.city,
      source: lead.source || 'overpass',
        raw_payload: {
          sources:        lead.sources         || [lead.source || 'overpass'],
          quality_score:  lead.quality_score   || null,
          prospect_score: lead.prospect_score  ?? null,
          prospect_gate:  lead.prospect_gate   || null,
          source_count:   lead.source_count    || null,
        },
      status,
    })
    toast(status === 'qualified' ? `${lead.name} importado e aprovado.` : `${lead.name} importado para revisao.`, 'success')
    await loadTable(root)
  } catch (err) {
    toast(err.message, 'error')
  }
}

async function importLeadBatch(root, leads, label = 'leads', status = 'new') {
  const btn = root.querySelector('.import-recommended-btn, .approve-recommended-btn, .import-visible-btn')
  if (btn) { btn.disabled = true; btn.textContent = 'Importando...' }
  let ok = 0
  for (const lead of leads) {
    try {
      await LeadService.create({
        name: lead.name,
        phone: lead.phone || null,
        address: lead.address || null,
        website: lead.website || null,
        cnpj: lead.cnpj || null,
        email: lead.email || null,
        niche: lead.niche,
        city: lead.city,
        source: lead.source || 'overpass',
        raw_payload: {
          sources:         lead.sources          || [lead.source || 'overpass'],
          quality_score:   lead.quality_score    || null,
          prospect_score:  lead.prospect_score   ?? null,
          prospect_gate:   lead.prospect_gate    || null,
          source_count:    lead.source_count     || null,
        },
        status,
      })
      ok++
    } catch { /* skip duplicates */ }
  }
  toast(status === 'qualified' ? `${ok} ${label} importados e aprovados.` : `${ok} ${label} importados para revisao.`, 'success')
  discoveryResults = []
  root.querySelector('.prospect-results').innerHTML = ''
  await loadTable(root)
}

export async function setup(root) {
  filters = { hasWebsite: null, status: null, search: '' }
  discoveryResults = []
  discoveryMinProspect = 40

  root.querySelector('#scoring-config-btn').addEventListener('click', () => {
    window.__navigate?.('leads', { view: 'prospect-config' })
  })

  root.querySelector('.prospect-form').addEventListener('submit', async event => {
    event.preventDefault()
    const btn = root.querySelector('.prospect-btn')
    const data = new FormData(event.currentTarget)
    const niche = data.get('niche')
    const city = String(data.get('city') || '').trim()
    const limit = Number(data.get('limit') || 50)
    if (!city) { toast('Informe a cidade.', 'warning'); return }
    btn.disabled = true
    btn.textContent = 'Buscando...'
    root.querySelector('.prospect-results').innerHTML = `<div class="skeleton-wrap">${skeletonCards(3)}</div>`
    try {
      discoveryResults = rescoreLeads(await LeadService.discover(niche, city, limit))
      root.querySelector('.prospect-results').innerHTML = renderDiscoveryResults()
      bindDiscoveryActions(root)
      if (!discoveryResults.length) toast('Nenhum lead encontrado para esse nicho/cidade.', 'warning')
    } catch (err) {
      root.querySelector('.prospect-results').innerHTML = ''
      toast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Buscar leads'
    }
  })

  let debounce = null
  root.querySelector('#lead-search').addEventListener('input', e => {
    clearTimeout(debounce)
    filters.search = e.target.value
    debounce = setTimeout(() => loadTable(root), 280)
  })

  root.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
      root.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const f = btn.dataset.filter
      filters.hasWebsite = f === 'website' ? true : f === 'no-website' ? false : null
      filters.status = null
      loadTable(root)
    })
  })

  root.querySelectorAll('.status-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
      root.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      filters.hasWebsite = null
      filters.status = btn.dataset.status
      loadTable(root)
    })
  })
  root.querySelector('[data-filter="all"]').classList.add('active')

  root.querySelector('#dedup-btn').addEventListener('click', async () => {
    const btn = root.querySelector('#dedup-btn')
    if (!confirm('Remover duplicatas do banco? O lead com maior status será mantido.')) return
    btn.disabled = true
    btn.textContent = 'Limpando...'
    try {
      const res = await fetch('http://localhost:3001/api/leads/dedup', { method: 'POST' })
      const data = await res.json()
      toast(data.message || 'Pronto.', res.ok ? 'success' : 'error')
      if (res.ok && data.deleted > 0) await loadTable(root)
    } catch {
      toast('Erro ao limpar duplicatas.', 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Limpar duplicatas'
    }
  })

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

function bindDiscoveryActions(root) {
  root.querySelector('#prospect-filter')?.addEventListener('change', e => {
    discoveryMinProspect = Number(e.target.value)
    root.querySelector('.prospect-results').innerHTML = renderDiscoveryResults()
    bindDiscoveryActions(root)
  })

  root.querySelector('.import-recommended-btn')?.addEventListener('click', () => {
    importLeadBatch(root, recommendedDiscoveryResults(), 'recomendados')
  })

  root.querySelector('.approve-recommended-btn')?.addEventListener('click', () => {
    importLeadBatch(root, recommendedDiscoveryResults(), 'recomendados', 'qualified')
  })

  root.querySelector('.import-visible-btn')?.addEventListener('click', () => {
    importLeadBatch(root, visibleDiscoveryResults(), 'exibidos')
  })

  root.querySelectorAll('.import-one-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.idx)
      const lead = discoveryResults[idx]
      if (!lead) return
      btn.disabled = true
      btn.textContent = 'Importando...'
      await importLead(lead, root)
      btn.textContent = 'Importado'
    })
  })
}

async function updateLeadStatus(id, status, root) {
  try {
    await LeadService.updateStatus(id, status)
    toast(`Lead marcado como ${safetyStatus(status).toLowerCase()}.`, 'success')
    await loadTable(root)
  } catch (err) {
    toast(err.message, 'error')
  }
}

async function loadTable(root) {
  const table = root.querySelector('#leads-table')
  table.innerHTML = skeletonTable(4, 8)

  let leads
  try {
    leads = await LeadService.list(filters)
  } catch {
    table.innerHTML = `<div style="padding:24px">${emptyState('Erro ao carregar leads', 'Verifique a conexao e tente novamente.')}</div>`
    return
  }

  if (leads.length === 0) {
    table.innerHTML = `<div style="padding:32px">${emptyState('Nenhum lead encontrado', filters.search ? `Nenhum resultado para "${filters.search}".` : 'Tente ajustar os filtros.')}</div>`
    return
  }

  const summary = leadSummary(leads)
  table.innerHTML = `
    <div class="lead-summary-grid">
      <div><span>Total</span><strong>${summary.total}</strong></div>
      <div><span>Pendentes</span><strong>${summary.pending}</strong></div>
      <div><span>Aprovados</span><strong>${summary.approved}</strong></div>
      <div><span>Prontos</span><strong>${summary.ready}</strong></div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Empresa</th><th>Telefone</th><th>CNPJ</th><th>Cidade</th>
            <th>Nicho</th><th>Website</th><th>Fonte</th><th>Score</th><th>Revisao</th><th>Acoes</th>
          </tr>
        </thead>
        <tbody>
          ${leads.map(l => `
            <tr data-lead-id="${l.id}">
              <td><strong>${l.name}</strong></td>
              <td>${l.phone}</td>
              <td>${l.cnpj ? formatCnpj(l.cnpj) : '<span class="muted">sem CNPJ</span>'}</td>
              <td>${l.city}</td>
              <td>${l.niche}</td>
              <td>${l.website === 'sem site' ? `<span class="muted">sem site</span>` : `<a href="${websiteHref(l.website)}" target="_blank" rel="noopener" style="color:var(--green-600)">${l.website}</a>`}</td>
              <td><div style="display:flex;gap:4px;flex-wrap:wrap">${sourceBadge(l.sources?.length ? l.sources : l.source)}</div></td>
              <td>${prospectBadge(l.prospect_score) || '<span class="muted">—</span>'}${gateBadge(l.prospect_gate)}</td>
              <td>${leadStatus(l.status)}<br><span class="muted" style="font-size:11px">${safetyStatus(l.status)}</span></td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${l.status !== 'qualified' ? `<button class="secondary lead-status-action" data-id="${l.id}" data-status="qualified" style="padding:5px 9px;font-size:12px">Aprovar</button>` : ''}
                  ${l.status !== 'invalid' ? `<button class="secondary lead-status-action" data-id="${l.id}" data-status="invalid" style="padding:5px 9px;font-size:12px">Rejeitar</button>` : ''}
                  ${l.status !== 'opt_out' ? `<button class="secondary lead-status-action" data-id="${l.id}" data-status="opt_out" style="padding:5px 9px;font-size:12px">Opt-out</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  table.querySelectorAll('.lead-status-action').forEach(btn => {
    btn.addEventListener('click', () => updateLeadStatus(btn.dataset.id, btn.dataset.status, root))
  })
}
