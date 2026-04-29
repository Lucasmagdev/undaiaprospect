import { badge, progress, skeletonTable, emptyState } from '../components.js'
import { openModal } from '../modal.js'
import { toast } from '../toast.js'
import { CampaignService, TemplateService, WhatsAppInstanceService } from '../services.js'

const NICHOS = ['restaurante', 'odontologia', 'academia', 'advocacia', 'contabilidade', 'estetica', 'imobiliaria']

let pollingTimers = {}

function statusLabel(status) {
  return {
    draft: 'Pausada',
    running: 'Rodando',
    paused: 'Pausada',
    finished: 'Finalizada',
    error: 'Erro',
  }[status] || status
}

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Centro de controle</p>
        <h1>Campanhas</h1>
      </div>
      <div style="display:flex;gap:8px">
        <button class="secondary" id="send-direct-btn" style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:8px 16px;cursor:pointer;font-size:.85rem;color:var(--text-1);display:flex;align-items:center;gap:6px">${micIcon} Enviar para número(s)</button>
        <button class="primary" id="new-campaign-btn">${plusIcon} Nova campanha</button>
      </div>
    </section>
    <section class="table-card" id="campaigns-table">
      ${skeletonTable(3, 7)}
    </section>
  `
}

export async function setup(root) {
  root.querySelector('#new-campaign-btn').addEventListener('click', () => openNewCampaignModal(root))
  root.querySelector('#send-direct-btn').addEventListener('click', () => openSendDirectModal())
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
              <td class="camp-status-cell">${badge(c.status_label || statusLabel(c.status))}</td>
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
  if (!c.quantity_requested) return 0
  return Math.round(((Number(c.sent_count || 0) + Number(c.failed_count || 0)) / c.quantity_requested) * 100)
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
      row.querySelector('.camp-status-cell').innerHTML = badge(statusLabel(s.status))
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
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Bairro <span style="font-weight:400;color:var(--text-3)">(opcional)</span>
          <input id="m-neighborhood" placeholder="ex: Savassi, Centro, Lourdes" />
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Template de mensagem (D+0)
          <select id="m-template">${templateOptions}</select>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--text-2);cursor:pointer">
          <input id="m-use-audio" type="checkbox" style="width:15px;height:15px" />
          Enviar como áudio de voz (Kokoro TTS)
          <span style="font-weight:400;color:var(--text-3)">— usa TTS_SERVER_URL do .env</span>
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
      const neighborhood = body.querySelector('#m-neighborhood').value.trim() || null
      const use_audio = body.querySelector('#m-use-audio').checked
      const template_id = body.querySelector('#m-template').value || null
      const quantity_requested = Number(body.querySelector('#m-qty').value || 50)
      const delay_min_s = Number(body.querySelector('#m-dmin').value || 30)
      const delay_max_s = Number(body.querySelector('#m-dmax').value || 90)

      if (!name || !city) { toast('Nome e cidade obrigatórios.', 'warning'); throw new Error('validation') }
      if (!template_id) { toast('Selecione um template.', 'warning'); throw new Error('validation') }

      await CampaignService.create({ name, niche, city, neighborhood, use_audio, template_id, quantity_requested, delay_min_s, delay_max_s })
      toast(`Campanha "${name}" criada. Clique em Disparar para iniciar.`, 'success')
      await loadTable(root)
    },
  })
}

function openSendDirectModal() {
  openModal({
    title: 'Enviar para número(s)',
    submitLabel: 'Enviar',
    body: `
      <div style="display:grid;gap:14px">
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Números WhatsApp
          <textarea id="d-numbers" rows="3" placeholder="Um por linha ou separados por vírgula&#10;5531988887777&#10;5511999998888" style="resize:vertical;font-family:monospace;font-size:.85rem"></textarea>
          <span style="font-size:11px;color:var(--text-3)">Formato: DDI+DDD+número (ex: 5531988887777)</span>
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Mensagem
          <textarea id="d-text" rows="4" placeholder="Digite a mensagem de voz..." style="resize:vertical"></textarea>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--text-2);cursor:pointer">
          <input id="d-audio" type="checkbox" checked style="width:15px;height:15px" />
          Enviar como áudio de voz
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)" id="d-speed-wrap">Velocidade da voz
          <div style="display:flex;align-items:center;gap:10px">
            <input id="d-speed" type="range" min="0.6" max="1.2" step="0.05" value="0.85" style="flex:1" />
            <span id="d-speed-label" style="min-width:50px;font-size:.85rem;color:var(--text-1)">0.85×</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-3)"><span>Lento</span><span>Normal</span><span>Rápido</span></div>
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)" id="d-engine-wrap">Motor de voz
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:2px solid var(--primary);border-radius:8px;cursor:pointer;font-weight:500" id="d-opt-piper">
              <input type="radio" name="d-engine" value="piper" checked style="accent-color:var(--primary)" />
              <span>🎙 Piper TTS<br><small style="font-weight:400;color:var(--text-3)">Voz natural pt-BR</small></span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-weight:500" id="d-opt-kokoro">
              <input type="radio" name="d-engine" value="kokoro" style="accent-color:var(--primary)" />
              <span>🤖 Kokoro TTS<br><small style="font-weight:400;color:var(--text-3)">Leve e rápido</small></span>
            </label>
          </div>
        </label>
      </div>
      <script>
        (function(){
          const cb = document.getElementById('d-audio');
          const engineWrap = document.getElementById('d-engine-wrap');
          const speedWrap  = document.getElementById('d-speed-wrap');
          const slider     = document.getElementById('d-speed');
          const speedLabel = document.getElementById('d-speed-label');
          slider.addEventListener('input', () => { speedLabel.textContent = parseFloat(slider.value).toFixed(2) + '×'; });
          const toggle = () => {
            const on = cb.checked;
            [engineWrap, speedWrap].forEach(w => { w.style.opacity = on ? '1' : '0.4'; w.style.pointerEvents = on ? '' : 'none'; });
          };
          cb.addEventListener('change', toggle); toggle();
          document.querySelectorAll('input[name="d-engine"]').forEach(r => {
            r.addEventListener('change', () => {
              document.getElementById('d-opt-piper').style.borderColor  = r.value === 'piper'  ? 'var(--primary)' : 'var(--border)';
              document.getElementById('d-opt-kokoro').style.borderColor = r.value === 'kokoro' ? 'var(--primary)' : 'var(--border)';
            });
          });
        })();
      </script>
    `,
    onSubmit: async (body) => {
      const raw     = body.querySelector('#d-numbers').value
      const text    = body.querySelector('#d-text').value.trim()
      const audio   = body.querySelector('#d-audio').checked
      const engine  = body.querySelector('input[name="d-engine"]:checked')?.value || 'piper'
      const speed   = parseFloat(body.querySelector('#d-speed')?.value || '0.85')
      const numbers = raw.split(/[\n,;]+/).map(n => n.replace(/\D/g, '').trim()).filter(n => n.length >= 10)

      if (!numbers.length) { toast('Informe ao menos um número válido.', 'warning'); throw new Error('validation') }
      if (!text) { toast('Mensagem obrigatória.', 'warning'); throw new Error('validation') }

      const data = await WhatsAppInstanceService.sendDirect({ numbers, text, use_audio: audio, engine, speed })
      toast(`Enviado para ${data.sent} número(s)${data.failed ? ` · ${data.failed} falha(s)` : ''} ✓`, data.failed ? 'warning' : 'success')
    },
  })
}

const plusIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
const micIcon  = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>`
