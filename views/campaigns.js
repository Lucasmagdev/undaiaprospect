import { badge, progress, skeletonTable, emptyState } from '../components.js'
import { openModal } from '../modal.js'
import { toast } from '../toast.js'
import { CampaignService, TemplateService } from '../services.js'

const NICHOS = ['restaurante', 'odontologia', 'academia', 'advocacia', 'contabilidade', 'estetica', 'imobiliaria']

let pollingTimers = {}

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Centro de controle</p>
        <h1>Campanhas</h1>
      </div>
      <button class="primary" id="new-campaign-btn">${plusIcon} Nova campanha</button>
    </section>
    <section class="table-card" id="campaigns-table">
      ${skeletonTable(3, 7)}
    </section>
  `
}

export async function setup(root) {
  root.querySelector('#new-campaign-btn').addEventListener('click', () => openNewCampaignModal(root))
  await loadTable(root)
}

async function loadTable(root) {
  const table = root.querySelector('#campaigns-table')

  let campaigns
  try {
    campaigns = await CampaignService.list()
  } catch {
    table.innerHTML = `<div style="padding:24px">${emptyState('Erro ao carregar campanhas', 'Tente novamente.')}</div>`
    return
  }

  if (campaigns.length === 0) {
    table.innerHTML = `<div style="padding:32px">${emptyState('Nenhuma campanha criada', 'Crie sua primeira campanha para começar a prospectar.', '<button class="primary" id="empty-new-btn" style="margin-top:12px">Nova campanha</button>')}</div>`
    root.querySelector('#empty-new-btn')?.addEventListener('click', () => openNewCampaignModal(root))
    return
  }

  table.innerHTML = `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Campanha</th><th>Nicho</th><th>Cidade</th><th>Status</th>
            <th>Enviados</th><th>Falhas</th><th>Progresso</th><th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${campaigns.map(c => `
            <tr data-campaign-id="${c.id}">
              <td><strong>${c.name}</strong></td>
              <td>${c.niche}</td>
              <td>${c.city}</td>
              <td class="camp-status-cell">${badge(c.status)}</td>
              <td class="camp-sent-cell">${c.sent_count ?? 0}</td>
              <td class="camp-failed-cell">${c.failed_count ?? 0}</td>
              <td style="min-width:120px" class="camp-progress-cell">${progress(calcProgress(c))}</td>
              <td>
                ${c.status === 'draft' || c.status === 'error' ? `<button class="primary run-btn" data-id="${c.id}" style="padding:5px 12px;font-size:12px">▶ Disparar</button>` : ''}
                ${c.status === 'running' ? `<span class="muted" style="font-size:12px">Enviando...</span>` : ''}
                ${c.status === 'finished' ? `<span class="muted" style="font-size:12px">Concluída</span>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  root.querySelectorAll('.run-btn').forEach(btn => {
    btn.addEventListener('click', () => runCampaign(btn.dataset.id, root))
  })

  campaigns.filter(c => c.status === 'running').forEach(c => startPolling(c.id, root))
}

function calcProgress(c) {
  if (c.status === 'finished') return 100
  if (!c.quantity_requested || !c.sent_count) return 0
  return Math.round((c.sent_count / c.quantity_requested) * 100)
}

async function runCampaign(id, root) {
  const btn = root.querySelector(`.run-btn[data-id="${id}"]`)
  if (btn) { btn.disabled = true; btn.textContent = 'Iniciando...' }
  try {
    const res = await CampaignService.run(id)
    toast(`Campanha iniciada — ${res.total} leads encontrados. Instância: ${res.instance}`, 'success')
    await loadTable(root)
    startPolling(id, root)
  } catch (err) {
    toast(err.message, 'error')
    if (btn) { btn.disabled = false; btn.textContent = '▶ Disparar' }
  }
}

function startPolling(id, root) {
  if (pollingTimers[id]) return
  pollingTimers[id] = setInterval(async () => {
    try {
      const s = await CampaignService.status(id)
      const row = root.querySelector(`tr[data-campaign-id="${id}"]`)
      if (!row) return
      row.querySelector('.camp-status-cell').innerHTML = badge(s.status)
      row.querySelector('.camp-sent-cell').textContent = s.sent ?? 0
      row.querySelector('.camp-failed-cell').textContent = s.failed ?? 0
      row.querySelector('.camp-progress-cell').innerHTML = progress(s.total ? Math.round(((s.sent + s.failed) / s.total) * 100) : 0)
      if (s.status !== 'running') {
        clearInterval(pollingTimers[id])
        delete pollingTimers[id]
        await loadTable(root)
        toast(`Campanha concluída — ${s.sent} enviados, ${s.failed} falhas.`, s.failed > s.sent ? 'warning' : 'success')
      }
    } catch { /* silencia erros de polling */ }
  }, 5000)
}

async function openNewCampaignModal(root) {
  let templates = []
  try { templates = await TemplateService.list() } catch { /* sem templates ainda */ }

  const templateOptions = templates.length
    ? templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')
    : '<option value="">Nenhum template cadastrado</option>'

  openModal({
    title: 'Nova campanha',
    submitLabel: 'Criar campanha',
    body: `
      <div style="display:grid;gap:12px">
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Nome da campanha
          <input id="m-name" placeholder="ex: Advogados BH" />
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Nicho
          <select id="m-niche">
            ${NICHOS.map(n => `<option value="${n}">${n.charAt(0).toUpperCase() + n.slice(1)}</option>`).join('')}
          </select>
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Cidade
          <input id="m-city" placeholder="ex: Belo Horizonte" value="Belo Horizonte" />
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Template de mensagem (D+0)
          <select id="m-template">${templateOptions}</select>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Leads alvo
            <input id="m-qty" type="number" value="50" min="5" max="500" />
          </label>
          <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Delay mín (s)
            <input id="m-dmin" type="number" value="30" min="10" />
          </label>
          <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Delay máx (s)
            <input id="m-dmax" type="number" value="90" min="10" />
          </label>
        </div>
        ${!templates.length ? '<p style="font-size:11px;color:var(--text-3);margin:0">Crie um template em <strong>Mensagens → Templates</strong> antes de disparar.</p>' : ''}
      </div>
    `,
    onSubmit: async (body) => {
      const name  = body.querySelector('#m-name').value.trim()
      const niche = body.querySelector('#m-niche').value
      const city  = body.querySelector('#m-city').value.trim()
      const template_id = body.querySelector('#m-template').value || null
      const quantity_requested = Number(body.querySelector('#m-qty').value || 50)
      const delay_min_s = Number(body.querySelector('#m-dmin').value || 30)
      const delay_max_s = Number(body.querySelector('#m-dmax').value || 90)

      if (!name || !city) { toast('Nome e cidade obrigatórios.', 'warning'); throw new Error('validation') }
      if (!template_id) { toast('Selecione um template.', 'warning'); throw new Error('validation') }

      await CampaignService.create({ name, niche, city, template_id, quantity_requested, delay_min_s, delay_max_s })
      toast(`Campanha "${name}" criada. Clique em Disparar para iniciar.`, 'success')
      await loadTable(root)
    },
  })
}

const plusIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
