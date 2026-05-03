import { badge, leadStatus, metric, animateMetrics, skeletonTable, skeletonCards, emptyState } from '../components.js'
import { toast } from '../toast.js'
import { CampaignService } from '../services.js'

export let _currentCampaignId = null
export function setCampaignId(id) { _currentCampaignId = id }

const STATUS_LABEL = {
  draft: 'Pausada', running: 'Rodando', paused: 'Pausada', finished: 'Finalizada', error: 'Erro',
}

function statusBadgeClass(status) {
  return { draft: 'Pausada', running: 'Rodando', paused: 'Pausada', finished: 'Finalizada', error: 'Erro' }[status] || status
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function typeColor(responseType) {
  const colors = {
    'curioso_positivo': '#10b981',
    'objecao': '#f59e0b',
    'numero_errado': '#ef4444',
    'opt_out': '#ef4444',
    'nao_responden': '#6b7280',
    'indeterminado': '#9ca3af',
  }
  return colors[responseType] || '#9ca3af'
}

function typeLabel(responseType) {
  const labels = {
    'curioso_positivo': '✓ Curioso / Positivo',
    'objecao': '⚡ Objeção',
    'numero_errado': '✕ Número Errado',
    'opt_out': '✕ Opt-out',
    'nao_responden': '… Silêncio',
    'indeterminado': '? Indeterminado',
  }
  return labels[responseType] || responseType
}

export function render() {
  return `
    <section class="section-head">
      <div style="display:flex;align-items:center;gap:12px">
        <button id="cd-back" class="secondary" style="padding:6px 14px;font-size:.82rem">← Campanhas</button>
        <div>
          <p class="eyebrow" id="cd-eyebrow">Carregando...</p>
          <h1 id="cd-title" style="margin:0">—</h1>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center" id="cd-actions">
        <button class="secondary" id="cd-export-btn">Exportar CSV</button>
      </div>
    </section>

    <div id="cd-metrics" style="margin-bottom:24px">
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
        ${skeletonCards(5)}
      </div>
    </div>

    <section class="table-card" id="cd-table">
      ${skeletonTable(5, 7)}
    </section>

    <!-- Lead Detail Modal -->
    <div id="lead-detail-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:999;padding:20px">
      <div style="background:var(--surface);border-radius:16px;max-width:600px;max-height:90vh;margin:auto;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
        <div style="padding:24px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <h3 id="ld-name" style="margin:0">—</h3>
            <p class="muted" style="margin:4px 0 0;font-size:12px" id="ld-phone">—</p>
          </div>
          <button id="ld-close" class="secondary" style="padding:6px 10px;font-size:.8rem">Fechar</button>
        </div>
        <div id="ld-content" style="padding:24px"></div>
      </div>
    </div>
  `
}

export async function setup(root) {
  const id = _currentCampaignId
  if (!id) return

  root.querySelector('#cd-back').addEventListener('click', () => {
    window.__navigate?.('campaigns')
  })

  let data
  try {
    data = await CampaignService.get(id)
  } catch (err) {
    root.querySelector('#cd-metrics').innerHTML =
      `<div style="padding:24px">${emptyState('Erro ao carregar campanha', err.message)}</div>`
    root.querySelector('#cd-table').innerHTML = ''
    return
  }

  const { campaign, stats, leads } = data

  // Header
  root.querySelector('#cd-eyebrow').textContent = `${campaign.niche} · ${campaign.city}`
  root.querySelector('#cd-title').textContent = campaign.name
  document.title = campaign.name

  // Botão disparar
  const statusLabel = statusBadgeClass(campaign.status)
  const actionsEl = root.querySelector('#cd-actions')
  actionsEl.insertAdjacentHTML('afterbegin',
    `<span style="margin-right:8px">${badge(statusLabel)}</span>`
  )
  if (campaign.status === 'draft' || campaign.status === 'error') {
    actionsEl.insertAdjacentHTML('afterbegin',
      `<button class="primary" id="cd-run-btn" style="padding:8px 16px;font-size:.85rem">▶ Disparar</button>`
    )
    root.querySelector('#cd-run-btn').addEventListener('click', async () => {
      const btn = root.querySelector('#cd-run-btn')
      btn.disabled = true; btn.textContent = 'Iniciando...'
      try {
        await CampaignService.run(campaign.id)
        toast('Campanha iniciada.', 'success')
        await setup(root)
      } catch (e) {
        toast(e.message, 'error')
        btn.disabled = false; btn.textContent = '▶ Disparar'
      }
    })
  }

  // Métricas
  root.querySelector('#cd-metrics').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px">
      ${metric('Total', stats.total, 'leads na campanha')}
      ${metric('Enviados', stats.sent, 'mensagens entregues')}
      ${metric('Falhas', stats.failed, 'não entregues')}
      ${metric('Respondidos', stats.responded, 'leads quentes')}
      ${metric('Opt-out', stats.opt_out, 'pediram parar')}
    </div>
    <div style="margin-top:8px;font-size:.78rem;color:var(--text-3)">
      ${campaign.started_at ? `Iniciada ${fmtDate(campaign.started_at)}` : 'Não iniciada'}
      ${campaign.finished_at ? ` · Concluída ${fmtDate(campaign.finished_at)}` : ''}
    </div>
  `
  animateMetrics(root)

  // Tabela de leads
  if (!leads || leads.length === 0) {
    root.querySelector('#cd-table').innerHTML =
      `<div style="padding:32px">${emptyState('Nenhum lead nesta campanha', 'Os leads aparecerão aqui após o disparo.')}</div>`
  } else {
    root.querySelector('#cd-table').innerHTML = `
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Empresa</th><th>Telefone</th><th>Cidade</th>
              <th>Última mensagem</th><th>Status lead</th><th>Status envio</th><th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${leads.map(l => `
              <tr>
                <td>
                  <strong>${l.name}</strong>
                  ${l.website ? `<br><a href="${l.website}" target="_blank" rel="noopener" style="font-size:.75rem;color:var(--text-3)">${l.website.replace(/^https?:\/\//, '').slice(0, 40)}</a>` : ''}
                </td>
                <td style="font-family:monospace;font-size:.82rem">${l.phone}</td>
                <td>${l.city}</td>
                <td style="max-width:200px">
                  ${l.last_message_body
                    ? `<span style="font-size:.8rem;color:var(--text-2);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.last_message_body.replace(/"/g, '&quot;')}">${l.last_message_body.slice(0, 55)}${l.last_message_body.length > 55 ? '…' : ''}</span>
                       <span style="font-size:.72rem;color:var(--text-3)">${fmtDate(l.last_message_at)}</span>`
                    : '<span style="color:var(--text-3);font-size:.8rem">—</span>'}
                </td>
                <td>${leadStatus(l.lead_status)}</td>
                <td>${badge(l.campaign_lead_status)}</td>
                <td>
                  <button class="secondary cd-detail-btn" data-id="${l.id}" data-lead="${JSON.stringify(l)}"
                    style="padding:4px 10px;font-size:.78rem;white-space:nowrap">
                    Detalhes
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `

    // Event listeners para abrir o modal de detalhe
    const modal = root.querySelector('#lead-detail-modal')
    const closeBtn = root.querySelector('#ld-close')

    root.querySelectorAll('.cd-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lead = JSON.parse(btn.dataset.lead)
        openLeadDetail(root, lead, campaign)
      })
    })

    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none'
    })

    modal.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none'
    })
  }

  // Exportar CSV
  root.querySelector('#cd-export-btn').addEventListener('click', () => {
    if (!leads || leads.length === 0) { toast('Nenhum lead para exportar.', 'warning'); return }
    const headers = ['Empresa', 'Telefone', 'Cidade', 'Status lead', 'Status envio', 'Última mensagem', 'Enviado em']
    const rows = (leads || []).map(l => [
      l.name, l.phone, l.city, l.lead_status, l.campaign_lead_status,
      (l.last_message_body || '').replace(/"/g, '""'),
      l.sent_at || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv, { type: 'text/csv;charset=utf-8;' }])
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `campanha-${campaign.name.replace(/\s+/g, '-').slice(0, 40)}.csv`
    a.click()
  })
}

async function openLeadDetail(root, lead, campaign) {
  const modal = root.querySelector('#lead-detail-modal')
  const nameEl = root.querySelector('#ld-name')
  const phoneEl = root.querySelector('#ld-phone')
  const contentEl = root.querySelector('#ld-content')

  nameEl.textContent = lead.name
  phoneEl.textContent = lead.phone

  contentEl.innerHTML = `
    <div style="display:grid;gap:16px">
      <div style="padding:12px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Info do Lead</div>
        <div style="display:grid;gap:6px;font-size:13px;line-height:1.6">
          <div><strong>Empresa:</strong> ${lead.name}</div>
          <div><strong>Telefone:</strong> ${lead.phone}</div>
          <div><strong>Cidade:</strong> ${lead.city}</div>
          <div><strong>Status:</strong> ${badge(lead.lead_status)}</div>
          ${lead.website ? `<div><strong>Website:</strong> <a href="${lead.website}" target="_blank" rel="noopener" style="color:var(--primary)">${lead.website.slice(0, 50)}</a></div>` : ''}
        </div>
      </div>

      <div id="ld-classification" style="padding:12px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);text-align:center">
        <div style="padding:12px"><div class="skeleton" style="height:16px;width:50%;margin:0 auto;animation-delay:0ms"></div></div>
      </div>

      ${lead.last_message_body ? `
        <div style="padding:12px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Última Mensagem</div>
          <div style="font-size:12px;line-height:1.6;color:var(--text-2)">${lead.last_message_body}</div>
          <div style="font-size:10px;color:var(--text-3);margin-top:6px">${fmtDate(lead.last_message_at)}</div>
        </div>
      ` : ''}

      <div style="display:flex;gap:8px">
        <button class="secondary" id="ld-inbox-btn" style="flex:1;padding:8px 12px;font-size:.8rem">
          💬 Ver no Inbox
        </button>
        <button class="primary" id="ld-campaign-btn" style="flex:1;padding:8px 12px;font-size:.8rem">
          📊 Ir pra Campanha
        </button>
      </div>
    </div>
  `

  // Carregar classificação
  loadLeadClassification(contentEl, lead)

  // Event listeners
  root.querySelector('#ld-inbox-btn').addEventListener('click', () => {
    window.__inboxFilterPhone = lead.phone
    window.__navigate?.('inbox')
    modal.style.display = 'none'
  })

  root.querySelector('#ld-campaign-btn').addEventListener('click', () => {
    modal.style.display = 'none'
  })

  modal.style.display = 'flex'
}

async function loadLeadClassification(contentEl, lead) {
  const classPanel = contentEl.querySelector('#ld-classification')
  if (!classPanel) return

  try {
    // Buscar mensagens da conversa
    const convResp = await fetch(`http://localhost:3001/api/conversations?phone=eq.${encodeURIComponent(lead.phone)}&order=created_at.desc&limit=1`, {
      headers: { 'accept': 'application/json' }
    })
    if (!convResp.ok) throw new Error('Conversa não encontrada')
    const conversations = await convResp.json()
    const conv = conversations[0]

    if (!conv || !conv.messages || conv.messages.length === 0) {
      classPanel.innerHTML = `<div style="color:var(--text-3);font-size:11px">Nenhuma conversa iniciada</div>`
      return
    }

    // Classificar resposta
    const resp = await fetch('http://localhost:3001/api/classify-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: (conv.messages || []).map(m => ({
          role: m.dir === 'out' ? 'assistant' : 'user',
          content: m.text || m.content || '',
        })),
        lead: { name: lead.name, phone: lead.phone },
      }),
    })

    if (!resp.ok) throw new Error('Classificação falhou')
    const classification = await resp.json()

    const color = typeColor(classification.response_type)
    const label = typeLabel(classification.response_type)

    classPanel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;justify-content:center">
        <div style="width:28px;height:28px;border-radius:50%;background-color:${color};opacity:0.2"></div>
        <strong style="color:${color};font-size:13px">${label}</strong>
      </div>
      <div style="color:var(--text-2);font-size:12px;margin-bottom:8px">${classification.summary}</div>
      <div style="color:var(--text-3);font-size:11px;display:flex;align-items:center;gap:4px;justify-content:center">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>\n        ${classification.next_action}\n      </div>\n      ${classification.escalation ? `<div style="margin-top:8px;font-size:11px;color:${color}">⚠️ Escalação recomendada</div>` : ''}\n    `
  } catch (e) {
    console.error('[Lead Classification] Error:', e.message)
    classPanel.innerHTML = `<div style="color:var(--text-3);font-size:11px">Classificação indisponível</div>`
  }
}
