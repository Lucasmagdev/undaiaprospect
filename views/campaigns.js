import { badge, progress, skeletonTable, emptyState } from '../components.js'
import { openModal } from '../modal.js'
import { toast } from '../toast.js'
import { CampaignService } from '../services.js'

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
  root.querySelector('#new-campaign-btn').addEventListener('click', openNewCampaignModal)
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
    root.querySelector('#empty-new-btn')?.addEventListener('click', openNewCampaignModal)
    return
  }

  table.innerHTML = `
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Campanha</th><th>Nicho</th><th>Cidade</th><th>Status</th>
            <th>Leads</th><th>Envios</th><th>Progresso</th>
          </tr>
        </thead>
        <tbody>
          ${campaigns.map(c => `
            <tr>
              <td><strong>${c.name}</strong></td>
              <td>${c.niche}</td>
              <td>${c.city}</td>
              <td>${badge(c.status)}</td>
              <td>${c.found}</td>
              <td>${c.sent}</td>
              <td style="min-width:120px">${progress(c.progress)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function openNewCampaignModal() {
  openModal({
    title: 'Nova campanha',
    submitLabel: 'Criar campanha',
    body: `
      <div style="display:grid;gap:12px">
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">
          Nome da campanha
          <input id="m-name" placeholder="ex: Advogados BH" />
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">
          Nicho
          <input id="m-niche" placeholder="ex: Advocacia" />
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">
          Cidade
          <input id="m-city" placeholder="ex: Belo Horizonte" />
        </label>
      </div>
    `,
    onSubmit: async (body) => {
      const name  = body.querySelector('#m-name').value.trim()
      const niche = body.querySelector('#m-niche').value.trim()
      const city  = body.querySelector('#m-city').value.trim()

      if (!name || !niche || !city) {
        toast('Preencha todos os campos.', 'warning')
        throw new Error('validation')
      }

      await CampaignService.create({ name, niche, city })
      toast(`Campanha "${name}" criada com sucesso.`, 'success')

      // Reload table
      const root = document.querySelector('.content-view')
      if (root) await loadTable(root)
    },
  })
}

const plusIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
