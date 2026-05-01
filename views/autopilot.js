import { WhatsAppInstanceService } from '../services.js'
import { toast } from '../toast.js'

const API = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001'

const NICHES = [
  { value: 'restaurante', label: 'Restaurante / Alimentacao' },
  { value: 'odontologia', label: 'Odontologia' },
  { value: 'academia', label: 'Academia / Fitness' },
  { value: 'advocacia', label: 'Advocacia' },
  { value: 'contabilidade', label: 'Contabilidade' },
  { value: 'estetica', label: 'Estetica / Beleza' },
  { value: 'imobiliaria', label: 'Imobiliaria' },
]

let preview = null
let sendJobId = null
let pollTimer = null

function instanceName(instance) {
  return instance?.name ||
    instance?.instanceName ||
    instance?.evolution_instance_name ||
    instance?.instance?.instanceName ||
    ''
}

function instanceStatus(instance) {
  return instance?.connectionStatus ||
    instance?.status ||
    instance?.instance?.state ||
    instance?.instance?.status ||
    'sem status'
}

function instanceValue(instance) {
  return instanceName(instance) || instance?.id || ''
}

export function render() {
  return `
<div class="autopilot-page">
  <header class="ap-header">
    <div>
      <h1>Piloto Automatico</h1>
      <p>Busca leads, prepara mensagens com IA e so envia depois da sua revisao.</p>
    </div>
    <div class="ap-mode">Preview primeiro</div>
  </header>

  <section class="ap-panel">
    <div class="ap-steps">
      <span class="active" data-step-dot="config">1 Configurar</span>
      <span data-step-dot="review">2 Revisar leads</span>
      <span data-step-dot="messages">3 Editar mensagens</span>
      <span data-step-dot="send">4 Enviar</span>
    </div>

    <form id="ap-form" class="ap-grid">
      <label>
        <span>Nicho</span>
        <select id="ap-niche">${NICHES.map(n => `<option value="${n.value}">${n.label}</option>`).join('')}</select>
      </label>
      <label>
        <span>Cidade</span>
        <input id="ap-city" placeholder="Ex: Jundiai, SP" required>
      </label>
      <label>
        <span>Instancia WhatsApp</span>
        <select id="ap-instance"><option value="">Carregando...</option></select>
      </label>
      <label>
        <span>Leads alvo</span>
        <input id="ap-limit" type="number" min="1" max="80" value="30">
      </label>
      <label>
        <span>Delay minimo (s)</span>
        <input id="ap-delay-min" type="number" min="10" value="30">
      </label>
      <label>
        <span>Delay maximo (s)</span>
        <input id="ap-delay-max" type="number" min="10" value="90">
      </label>
      <label class="ap-check">
        <input id="ap-ai" type="checkbox" checked>
        <span>Gerar mensagens e score com IA</span>
      </label>
      <label class="ap-check">
        <input id="ap-wa" type="checkbox" checked>
        <span>Validar WhatsApp quando possivel</span>
      </label>
      <button id="ap-preview-btn" class="ap-primary" type="submit">Gerar preview</button>
    </form>
  </section>

  <section id="ap-results" class="ap-results" hidden>
    <div class="ap-summary">
      <div><strong id="ap-m-found">0</strong><span>Encontrados</span></div>
      <div><strong id="ap-m-selected">0</strong><span>Selecionados</span></div>
      <div><strong id="ap-m-wa">0</strong><span>WhatsApp ok</span></div>
      <div><strong id="ap-m-visited">0</strong><span>Sites lidos</span></div>
      <div><strong id="ap-m-old">0</strong><span>Ja contatados</span></div>
    </div>

    <div class="ap-toolbar">
      <div>
        <h2>Revisao</h2>
        <p id="ap-stage">Aguardando preview.</p>
      </div>
      <div class="ap-actions">
        <button id="ap-select-best" type="button">Selecionar score alto</button>
        <button id="ap-clear" type="button">Limpar selecao</button>
      </div>
    </div>

    <div id="ap-leads" class="ap-leads"></div>

    <div class="ap-sendbar">
      <div>
        <strong id="ap-send-count">0 leads selecionados</strong>
        <span>Confira mensagens e historico antes de confirmar.</span>
      </div>
      <button id="ap-send" class="ap-primary" type="button">Enviar aprovados</button>
    </div>
  </section>

  <section id="ap-progress" class="ap-panel" hidden>
    <div class="ap-progress-head">
      <div class="ap-spinner"></div>
      <div>
        <h2 id="ap-send-status">Enviando...</h2>
        <p id="ap-send-stage"></p>
      </div>
    </div>
    <div class="ap-summary compact">
      <div><strong id="ap-sent">0</strong><span>Enviados</span></div>
      <div><strong id="ap-failed">0</strong><span>Falhas</span></div>
      <div><strong id="ap-skipped">0</strong><span>Ignorados</span></div>
    </div>
    <div id="ap-log" class="ap-log"></div>
  </section>
</div>

<style>
.autopilot-page { max-width: 1180px; margin: 0 auto; padding: 24px; color: var(--text-primary, #111827); }
.ap-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 18px; }
.ap-header h1 { margin: 0 0 4px; font-size: 1.55rem; line-height: 1.2; }
.ap-header p, .ap-toolbar p, .ap-sendbar span, .ap-progress-head p { margin: 0; color: var(--text-muted, #6b7280); font-size: .88rem; }
.ap-mode { border: 1px solid #bbf7d0; background: #f0fdf4; color: #15803d; border-radius: 999px; padding: 7px 12px; font-size: .78rem; font-weight: 700; white-space: nowrap; }
.ap-panel, .ap-results { background: var(--bg-card, #fff); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 18px; }
.ap-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 18px; }
.ap-steps span { border: 1px solid var(--border, #e5e7eb); border-radius: 8px; padding: 9px 10px; color: #6b7280; font-size: .8rem; font-weight: 700; text-align: center; }
.ap-steps span.active { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
.ap-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: end; }
.ap-grid label { display: flex; flex-direction: column; gap: 6px; font-size: .78rem; font-weight: 700; color: #4b5563; }
.ap-grid input, .ap-grid select, .lead-message { border: 1px solid var(--border, #d1d5db); border-radius: 8px; background: var(--bg-input, #f9fafb); color: var(--text-primary, #111827); font: inherit; }
.ap-grid input, .ap-grid select { height: 38px; padding: 0 10px; }
.ap-check { flex-direction: row !important; align-items: center; min-height: 38px; }
.ap-check input { width: 16px; height: 16px; }
.ap-primary { height: 40px; border: 0; border-radius: 8px; background: #4f46e5; color: white; font-weight: 800; cursor: pointer; padding: 0 16px; }
.ap-primary:disabled, .ap-toolbar button:disabled { opacity: .55; cursor: not-allowed; }
.ap-results { margin-top: 18px; }
.ap-summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 18px; }
.ap-summary.compact { grid-template-columns: repeat(3, 1fr); margin: 16px 0; }
.ap-summary div { border: 1px solid var(--border, #e5e7eb); background: var(--bg-subtle, #f9fafb); border-radius: 8px; padding: 12px; }
.ap-summary strong { display: block; font-size: 1.45rem; line-height: 1; }
.ap-summary span { display: block; color: #6b7280; font-size: .72rem; margin-top: 5px; }
.ap-toolbar, .ap-sendbar, .ap-progress-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
.ap-toolbar h2, .ap-progress-head h2 { margin: 0 0 4px; font-size: 1rem; }
.ap-actions { display: flex; gap: 8px; }
.ap-actions button, .ap-toolbar button { height: 34px; border-radius: 8px; border: 1px solid var(--border, #d1d5db); background: white; cursor: pointer; font-weight: 700; color: #374151; }
.ap-leads { display: grid; gap: 12px; margin-top: 14px; }
.lead-card { display: grid; grid-template-columns: 34px 1fr 310px; gap: 12px; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 14px; background: white; }
.lead-card.blocked { opacity: .62; }
.lead-check { display: flex; align-items: flex-start; justify-content: center; padding-top: 4px; }
.lead-check input { width: 18px; height: 18px; }
.lead-main h3 { margin: 0 0 5px; font-size: .98rem; }
.lead-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.pill { border-radius: 999px; padding: 4px 8px; font-size: .7rem; font-weight: 800; background: #f3f4f6; color: #374151; }
.pill.good { background: #dcfce7; color: #166534; }
.pill.warn { background: #fef3c7; color: #92400e; }
.pill.bad { background: #fee2e2; color: #991b1b; }
.lead-detail { color: #6b7280; font-size: .78rem; line-height: 1.45; }
.lead-detail a { color: #4f46e5; text-decoration: none; }
.lead-message { min-height: 118px; width: 100%; resize: vertical; padding: 10px; font-size: .82rem; line-height: 1.4; }
.ap-sendbar { position: sticky; bottom: 0; margin-top: 16px; border: 1px solid #c7d2fe; background: #eef2ff; border-radius: 10px; padding: 12px; }
.ap-progress-head { justify-content: flex-start; }
.ap-spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #e5e7eb; border-top-color: #4f46e5; animation: spin .8s linear infinite; flex: 0 0 auto; }
.ap-spinner.done { animation: none; border-color: #22c55e; }
@keyframes spin { to { transform: rotate(360deg); } }
.ap-log { min-height: 120px; max-height: 220px; overflow: auto; background: #111827; color: #cbd5e1; border-radius: 8px; padding: 12px; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.ap-log div { margin-bottom: 3px; }
@media (max-width: 900px) {
  .ap-grid, .ap-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lead-card { grid-template-columns: 30px 1fr; }
  .lead-message { grid-column: 2; }
}
@media (max-width: 620px) {
  .autopilot-page { padding: 16px; }
  .ap-header, .ap-toolbar, .ap-sendbar { align-items: stretch; flex-direction: column; }
  .ap-steps { grid-template-columns: 1fr 1fr; }
  .ap-grid, .ap-summary, .ap-summary.compact { grid-template-columns: 1fr; }
  .lead-card { grid-template-columns: 1fr; }
  .lead-check { justify-content: flex-start; }
  .lead-message { grid-column: auto; }
}
</style>
`
}

export async function setup(root) {
  preview = null
  sendJobId = null
  if (pollTimer) clearInterval(pollTimer)

  const instanceSelect = root.querySelector('#ap-instance')
  try {
    const instances = await WhatsAppInstanceService.list()
    const rows = Array.isArray(instances) ? instances : instances.instances || instances.data || []
    const usable = rows.filter(instance => instanceValue(instance))
    instanceSelect.innerHTML = usable.length
      ? usable.map(instance => {
          const name = instanceName(instance) || 'Instancia'
          const status = instanceStatus(instance)
          return `<option value="${escapeHtml(instanceValue(instance))}">${escapeHtml(name)} - ${escapeHtml(status)}</option>`
        }).join('')
      : '<option value="">Nenhuma instancia encontrada</option>'
  } catch {
    instanceSelect.innerHTML = '<option value="">Erro ao carregar instancias</option>'
  }

  root.querySelector('#ap-form').addEventListener('submit', event => submitPreview(event, root))
  root.querySelector('#ap-select-best').addEventListener('click', () => {
    preview.leads.forEach(lead => { lead.selected = !lead.blocked && !lead.already_contacted && lead.whatsapp_status !== 'invalid' && lead.score >= 60 })
    renderLeads(root)
  })
  root.querySelector('#ap-clear').addEventListener('click', () => {
    preview.leads.forEach(lead => { lead.selected = false })
    renderLeads(root)
  })
  root.querySelector('#ap-send').addEventListener('click', () => sendApproved(root))
}

async function submitPreview(event, root) {
  event.preventDefault()
  const btn = root.querySelector('#ap-preview-btn')
  const payload = {
    niche: root.querySelector('#ap-niche').value,
    city: root.querySelector('#ap-city').value.trim(),
    instance_id: root.querySelector('#ap-instance').value,
    limit: Number(root.querySelector('#ap-limit').value || 30),
    delay_min_s: Number(root.querySelector('#ap-delay-min').value || 30),
    delay_max_s: Number(root.querySelector('#ap-delay-max').value || 90),
    ai_personalize: root.querySelector('#ap-ai').checked,
    validate_whatsapp: root.querySelector('#ap-wa').checked,
  }
  if (!payload.city) return toast('Informe a cidade.', 'error')
  if (!payload.instance_id) return toast('Selecione uma instancia conectada.', 'error')

  btn.disabled = true
  btn.textContent = 'Gerando preview...'
  root.querySelector('#ap-results').hidden = true
  setStep(root, 'config')

  try {
    const response = await fetch(`${API}/api/autopilot/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || data.error || 'Erro ao gerar preview.')
    preview = data
    preview.delay_min_s = payload.delay_min_s
    preview.delay_max_s = payload.delay_max_s
    root.querySelector('#ap-results').hidden = false
    setStep(root, 'review')
    renderLeads(root)
    toast('Preview pronto para revisao.', 'success')
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    btn.disabled = false
    btn.textContent = 'Gerar preview'
  }
}

function renderLeads(root) {
  if (!preview) return
  const leads = preview.leads || []
  const selected = leads.filter(lead => lead.selected)

  root.querySelector('#ap-m-found').textContent = leads.length
  root.querySelector('#ap-m-selected').textContent = selected.length
  root.querySelector('#ap-m-wa').textContent = leads.filter(lead => lead.whatsapp_status === 'valid').length
  root.querySelector('#ap-m-visited').textContent = preview.analyzed || 0
  root.querySelector('#ap-m-old').textContent = leads.filter(lead => lead.already_contacted).length
  root.querySelector('#ap-stage').textContent = preview.stage || 'Revise os leads encontrados.'
  root.querySelector('#ap-send-count').textContent = `${selected.length} leads selecionados`
  root.querySelector('#ap-send').disabled = selected.length === 0

  root.querySelector('#ap-leads').innerHTML = leads.map(lead => leadCard(lead)).join('')
  root.querySelectorAll('[data-lead-check]').forEach(input => {
    input.addEventListener('change', () => {
      const lead = leads.find(item => item.id === input.dataset.leadCheck)
      if (lead) lead.selected = input.checked
      renderLeads(root)
    })
  })
  root.querySelectorAll('[data-lead-message]').forEach(textarea => {
    textarea.addEventListener('input', () => {
      const lead = leads.find(item => item.id === textarea.dataset.leadMessage)
      if (lead) lead.message = textarea.value
      root.querySelector('#ap-send-count').textContent = `${leads.filter(item => item.selected).length} leads selecionados`
    })
  })
}

function leadCard(lead) {
  const waClass = lead.whatsapp_status === 'valid' ? 'good' : lead.whatsapp_status === 'invalid' ? 'bad' : 'warn'
  const waText = lead.whatsapp_status === 'valid' ? 'WhatsApp ok' : lead.whatsapp_status === 'invalid' ? 'Sem WhatsApp' : 'WhatsApp incerto'
  const oldClass = lead.already_contacted ? 'bad' : 'good'
  const oldText = lead.already_contacted ? 'Ja contatado' : 'Sem historico'
  const scoreClass = lead.score >= 70 ? 'good' : lead.score >= 45 ? 'warn' : 'bad'
  const disabled = lead.blocked || lead.already_contacted || lead.whatsapp_status === 'invalid'

  return `
    <article class="lead-card ${disabled ? 'blocked' : ''}">
      <label class="lead-check">
        <input type="checkbox" data-lead-check="${lead.id}" ${lead.selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      </label>
      <div class="lead-main">
        <h3>${escapeHtml(lead.name || 'Lead sem nome')}</h3>
        <div class="lead-meta">
          <span class="pill ${scoreClass}">Score ${lead.score}</span>
          <span class="pill ${waClass}">${waText}</span>
          <span class="pill ${oldClass}">${oldText}</span>
          <span class="pill">${escapeHtml(lead.intent || 'medio')}</span>
          <span class="pill">${escapeHtml((lead.sources || [lead.source]).filter(Boolean).join(' + ') || 'fonte')}</span>
        </div>
        <div class="lead-detail">
          <div>${escapeHtml(lead.phone || '')} ${lead.address ? ' - ' + escapeHtml(lead.address) : ''}</div>
          ${lead.website ? `<div><a href="${escapeAttr(formatUrl(lead.website))}" target="_blank" rel="noreferrer">${escapeHtml(lead.website)}</a></div>` : ''}
          <div>${escapeHtml((lead.score_reasons || []).join(' | '))}</div>
        </div>
      </div>
      <textarea class="lead-message" data-lead-message="${lead.id}">${escapeHtml(lead.message || '')}</textarea>
    </article>
  `
}

async function sendApproved(root) {
  if (!preview) return
  const approved = preview.leads
    .filter(lead => lead.selected)
    .map(lead => ({ id: lead.id, message: lead.message }))
  if (!approved.length) return toast('Selecione pelo menos um lead.', 'error')

  const btn = root.querySelector('#ap-send')
  btn.disabled = true
  btn.textContent = 'Iniciando...'
  setStep(root, 'send')

  try {
    const response = await fetch(`${API}/api/autopilot/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preview_id: preview.id,
        approved_leads: approved,
        delay_min_s: preview.delay_min_s || 30,
        delay_max_s: preview.delay_max_s || 90,
        daily_limit: approved.length,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || data.error || 'Erro ao iniciar envio.')
    sendJobId = data.autopilot_id
    root.querySelector('#ap-progress').hidden = false
    pollTimer = setInterval(() => pollSend(root), 1500)
    await pollSend(root)
  } catch (error) {
    toast(error.message, 'error')
    btn.disabled = false
    btn.textContent = 'Enviar aprovados'
  }
}

async function pollSend(root) {
  if (!sendJobId) return
  const response = await fetch(`${API}/api/autopilot/${sendJobId}/status`)
  const state = await response.json()
  if (!response.ok) return

  root.querySelector('#ap-send-status').textContent = statusLabel(state.status)
  root.querySelector('#ap-send-stage').textContent = state.stage || ''
  root.querySelector('#ap-sent').textContent = state.sent || 0
  root.querySelector('#ap-failed').textContent = state.failed || 0
  root.querySelector('#ap-skipped').textContent = state.skipped || 0
  root.querySelector('#ap-log').innerHTML = (state.logs || []).map(line => `<div>${escapeHtml(line)}</div>`).join('')
  root.querySelector('#ap-log').scrollTop = root.querySelector('#ap-log').scrollHeight

  if (state.status === 'done' || state.status === 'error') {
    clearInterval(pollTimer)
    root.querySelector('.ap-spinner')?.classList.add('done')
    root.querySelector('#ap-send').textContent = state.status === 'done' ? 'Envio concluido' : 'Erro no envio'
    toast(state.status === 'done' ? 'Envio concluido.' : (state.error || 'Erro no envio.'), state.status === 'done' ? 'success' : 'error')
  }
}

function setStep(root, step) {
  const order = ['config', 'review', 'messages', 'send']
  const activeIndex = order.indexOf(step)
  root.querySelectorAll('[data-step-dot]').forEach(dot => {
    dot.classList.toggle('active', order.indexOf(dot.dataset.stepDot) <= activeIndex)
  })
}

function statusLabel(status) {
  return {
    creating: 'Criando campanha',
    sending: 'Enviando',
    done: 'Concluido',
    error: 'Erro',
  }[status] || status || 'Processando'
}

function formatUrl(url) {
  if (!url) return '#'
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}
