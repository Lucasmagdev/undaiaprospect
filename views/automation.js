import { AutomationService, TemplateService, WhatsAppInstanceService } from '../services.js'
import { toast } from '../toast.js'

let pollTimer = null
let instances = []
let sequences = []
let hasLocalEdits = false

const SOURCE_MULTIPLIER = 7
const OPEN_INSTANCE_STATES = new Set(['open', 'connected', 'online'])
const AGENT_PRESETS = {
  economico: {
    label: 'Economico',
    interval_minutes: 360,
    limit_per_term: 10,
    max_terms: 3,
    max_new_leads_per_cycle: 5,
    min_score: 62,
    auto_approve_score: 80,
    daily_send_limit: 3,
    delay_min_s: 120,
    delay_max_s: 240,
    auto_send: true,
    ai_personalize: false,
  },
  padrao: {
    label: 'Padrao',
    interval_minutes: 180,
    limit_per_term: 20,
    max_terms: 5,
    max_new_leads_per_cycle: 12,
    min_score: 55,
    auto_approve_score: 75,
    daily_send_limit: 6,
    delay_min_s: 75,
    delay_max_s: 150,
    auto_send: true,
    ai_personalize: false,
  },
  escala: {
    label: 'Escala',
    interval_minutes: 120,
    limit_per_term: 35,
    max_terms: 8,
    max_new_leads_per_cycle: 25,
    min_score: 48,
    auto_approve_score: 70,
    daily_send_limit: 12,
    delay_min_s: 45,
    delay_max_s: 90,
    auto_send: true,
    ai_personalize: true,
  },
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

function renderImportedPreview(items = []) {
  if (!items.length) return '<p class="muted">Nenhum lead importado no ultimo ciclo.</p>'
  return `
    <div class="aa-list">
      ${items.map(item => `
        <article class="aa-list-item">
          <strong>${item.name}</strong>
          <span>${item.city || '—'} · ${item.term || 'termo base'}</span>
          <span>Score ${item.score} · ${item.status === 'qualified' ? 'autoaprovado' : 'novo'}</span>
        </article>
      `).join('')}
    </div>
  `
}

function renderCycleHistory(items = []) {
  if (!items.length) return '<p class="muted">Sem histórico de ciclos salvo ainda.</p>'
  return `
    <div class="aa-list">
      ${items.slice(0, 8).map(item => `
        <article class="aa-list-item">
          <strong>${formatDateTime(item.finished_at)}</strong>
          <span>importados ${Number(item.imported || 0)} · aprovados ${Number(item.auto_approved || 0)} · enviados ${Number(item.dispatched || 0)} · follow-up ${Number(item.followed_up || 0)}</span>
          <span>descartes: bloqueados ${Number(item.blocked || 0)}, existentes ${Number(item.skipped_existing || 0)}, abaixo score ${Number(item.below_score || 0)}</span>
        </article>
      `).join('')}
    </div>
  `
}

function renderMessageQuality(data = {}) {
  const summary = data.summary || {}
  const items = Array.isArray(data.items) ? data.items : []
  const stageEntries = Object.entries(summary.by_stage || {})
  const stageTags = stageEntries.length
    ? stageEntries.map(([stage, total]) => `<span>${stage}: ${total}</span>`).join('')
    : '<span class="muted">Sem dados por etapa.</span>'

  const rows = items.length
    ? items.slice(0, 10).map(item => `
      <article class="aa-list-item">
        <strong>${formatDateTime(item.created_at)} · ${item.stage || 'unknown'} · ${item.source || 'local'}</strong>
        <span>${item.company || 'empresa n/d'} · ${item.niche || 'nicho n/d'} · ${item.city || 'cidade n/d'}</span>
        <span>${item.reviewed ? 'revisado por IA' : 'fallback local'} · ${item.changed ? 'ajustado' : 'mantido'} · ${item.final_chars || 0} chars · ${item.question_count || 0} pergunta(s)</span>
      </article>
    `).join('')
    : '<p class="muted">Sem mensagens auditadas ainda.</p>'

  return `
    <section class="cards-grid aa-metrics" style="margin-bottom:12px">
      <article class="panel"><span class="muted">Mensagens auditadas</span><strong>${summary.total || 0}</strong><span class="muted">janela atual</span></article>
      <article class="panel"><span class="muted">Revisadas por IA</span><strong>${summary.reviewed || 0}</strong><span class="muted">alteradas: ${summary.changed || 0}</span></article>
      <article class="panel"><span class="muted">Média de tamanho</span><strong>${summary.avg_chars || 0}</strong><span class="muted">caracteres</span></article>
      <article class="panel"><span class="muted">Taxa com pergunta</span><strong>${summary.question_rate || 0}%</strong><span class="muted">mensagens com ?</span></article>
    </section>
    <div class="aa-tags" style="margin-bottom:12px">${stageTags}</div>
    <div class="aa-list">${rows}</div>
  `
}

function estimateOps(payload = {}) {
  const interval = Math.max(15, Number(payload.interval_minutes || 180))
  const cyclesPerDay = Math.max(1, Math.floor((24 * 60) / interval))
  const sendPerCycle = payload.auto_send ? Math.max(0, Number(payload.daily_send_limit || 0)) : 0
  const sendPerDay = sendPerCycle * cyclesPerDay
  const discoverCallsPerDay = Math.max(1, Number(payload.max_terms || 0)) * cyclesPerDay * SOURCE_MULTIPLIER
  const aiCallsPerDay = payload.ai_personalize
    ? Math.max(1, Number(payload.max_new_leads_per_cycle || 0)) * cyclesPerDay
    : 0
  return { cyclesPerDay, sendPerDay, discoverCallsPerDay, aiCallsPerDay }
}

function evaluateRisk(payload = {}, softLimitPerDay = 20) {
  const warnings = []
  const estimate = estimateOps(payload)
  if (Number(payload.delay_min_s || 0) < 45) warnings.push('Delay minimo abaixo de 45s aumenta risco operacional.')
  if (estimate.sendPerDay > softLimitPerDay) warnings.push(`Projecao de ${estimate.sendPerDay}/dia acima do limite recomendado (${softLimitPerDay}/dia).`)
  if (payload.ai_personalize && Number(payload.max_terms || 0) > 6) warnings.push('IA ligada com muitos termos tende a elevar custo de API.')
  if (Number(payload.min_score || 0) < 45) warnings.push('Score minimo baixo pode trazer leads mais frios.')
  return warnings
}

function getInstanceStatus(instance = {}) {
  return String(
    instance.connectionStatus ||
    instance.status ||
    instance.instance?.state ||
    instance.instance?.status ||
    ''
  ).toLowerCase()
}

function isOpenInstance(instance = {}) {
  return OPEN_INSTANCE_STATES.has(getInstanceStatus(instance))
}

function getInstanceName(instance = {}) {
  return instance.display_name || instance.evolution_instance_name || instance.name || instance.instanceName || instance.instance?.instanceName || 'instancia_sem_nome'
}

function getInstanceId(instance = {}) {
  return instance.id || instance.evolution_instance_name || instance.name || instance.instanceName || instance.instance?.instanceName || ''
}

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Captação autônoma</p>
        <h1>Automações</h1>
        <p class="muted">Configure o mínimo. O agente pensa em variações de busca, procura leads novos, deduplica, importa e autoaprova os melhores.</p>
      </div>
    </section>

    <section class="panel" style="display:grid;gap:18px">
      <div class="panel-head">
        <div>
          <h2>Agente de Leads 24/7</h2>
          <p class="panel-copy muted">Entrada mínima: nicho, cidade e cadência. O restante fica automatizado.</p>
        </div>
        <div id="aa-badge" class="badge-neutral">carregando...</div>
      </div>

      <div class="aa-presets" id="aa-presets">
        <span class="muted">Perfis:</span>
        <button type="button" class="secondary" data-aa-preset="economico">Economico</button>
        <button type="button" class="secondary" data-aa-preset="padrao">Padrao</button>
        <button type="button" class="secondary" data-aa-preset="escala">Escala</button>
      </div>

      <form id="aa-form" class="aa-grid" autocomplete="off">
        <label>
          Nicho
          <input name="niche" placeholder="odontologia" required />
        </label>
        <label>
          Cidade
          <input name="city" placeholder="Belo Horizonte" required />
        </label>
        <label>
          Instância WhatsApp
          <select name="instance_id" id="aa-instance"><option value="">Instância aberta padrão</option></select>
        </label>
        <label>
          Sequência Follow-up
          <select name="sequence_id" id="aa-sequence"><option value="">Automática por nicho</option></select>
        </label>
        <label>
          Rodar a cada
          <input name="interval_minutes" type="number" min="15" value="180" />
        </label>
        <label>
          Leads por termo
          <input name="limit_per_term" type="number" min="5" max="80" value="30" />
        </label>
        <label>
          Limite de termos IA
          <input name="max_terms" type="number" min="2" max="12" value="8" />
        </label>
        <label>
          Novos leads por ciclo
          <input name="max_new_leads_per_cycle" type="number" min="1" max="60" value="20" />
        </label>
        <label>
          Score mínimo
          <input name="min_score" type="number" min="10" max="100" value="45" />
        </label>
        <label>
          Autoaprovar acima de
          <input name="auto_approve_score" type="number" min="20" max="100" value="70" />
        </label>
        <label>
          Enviar por ciclo
          <input name="daily_send_limit" type="number" min="1" max="50" value="12" />
        </label>
        <label>
          Delay mínimo (s)
          <input name="delay_min_s" type="number" min="10" max="600" value="45" />
        </label>
        <label>
          Delay máximo (s)
          <input name="delay_max_s" type="number" min="10" max="900" value="90" />
        </label>
        <label class="aa-checkbox">
          <input name="auto_send" type="checkbox" checked />
          <span>Disparar automaticamente para aprovados</span>
        </label>
        <label class="aa-checkbox">
          <input name="ai_personalize" type="checkbox" />
          <span>Usar IA para refinar score e mensagem</span>
        </label>
      </form>

      <div class="aa-actions">
        <span id="aa-soft-limit-badge" class="aa-soft-badge">Limite recomendado: 20/dia</span>
        <button id="aa-save" class="secondary" type="button">Salvar configuracao</button>
        <button id="aa-start" class="primary" type="button">Ativar 24/7</button>
        <button id="aa-run" class="secondary" type="button">Rodar agora</button>
        <button id="aa-stop" class="secondary" type="button">Pausar</button>
      </div>

      <section class="cards-grid aa-metrics" id="aa-estimates">
        <article class="panel"><span class="muted">Ciclos por dia</span><strong id="aa-est-cycles">0</strong><span class="muted">estimativa atual</span></article>
        <article class="panel"><span class="muted">Envios por dia</span><strong id="aa-est-sends">0</strong><span class="muted">com auto envio atual</span></article>
        <article class="panel"><span class="muted">Chamadas descoberta/dia</span><strong id="aa-est-discovery">0</strong><span class="muted">fontes x termos x ciclos</span></article>
        <article class="panel"><span class="muted">Chamadas IA/dia</span><strong id="aa-est-ai">0</strong><span class="muted">estimado por novos leads</span></article>
      </section>

      <div class="aa-checks" id="aa-precheck"><span class="muted">Pre-check pendente.</span></div>
      <div class="aa-warnings" id="aa-risk-warnings"><span class="muted">Sem alertas de risco para essa configuracao.</span></div>
    </section>

    <section class="cards-grid aa-metrics">
      <article class="panel"><span class="muted">Status</span><strong id="aa-status">—</strong><span id="aa-stage" class="muted">—</span></article>
      <article class="panel"><span class="muted">Próximo ciclo</span><strong id="aa-next-run">—</strong><span class="muted">última execução: <span id="aa-last-run">—</span></span></article>
      <article class="panel"><span class="muted">Ciclos</span><strong id="aa-cycles">0</strong><span class="muted">rodadas acumuladas</span></article>
      <article class="panel"><span class="muted">Importados</span><strong id="aa-imported">0</strong><span class="muted">autoaprovados: <span id="aa-auto-approved">0</span></span></article>
      <article class="panel"><span class="muted">Descartados no último ciclo</span><strong id="aa-discarded">0</strong><span class="muted">bloqueados/existentes/abaixo score</span></article>
      <article class="panel"><span class="muted">Disparo automático</span><strong id="aa-dispatched">0</strong><span class="muted">falhas: <span id="aa-dispatch-failed">0</span> · follow-ups: <span id="aa-followed-up">0</span></span></article>
    </section>

    <section class="panel aa-two-col">
      <div>
        <h2>Termos pensados pela IA</h2>
        <div id="aa-terms" class="aa-tags"><span class="muted">Sem ciclo ainda.</span></div>
      </div>
      <div>
        <h2>Últimos leads trazidos</h2>
        <div id="aa-import-preview"><span class="muted">Sem ciclo ainda.</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Auditoria de ciclos</h2>
          <p class="panel-copy muted">Últimas execuções com motivo dos descartes.</p>
        </div>
      </div>
      <div id="aa-cycle-history"><span class="muted">carregando...</span></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Qualidade das mensagens</h2>
          <p class="panel-copy muted">Auditoria de copy comercial por etapa do funil.</p>
        </div>
      </div>
      <div id="aa-message-quality"><span class="muted">carregando...</span></div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Logs do agente</h2>
          <p class="panel-copy muted">Use isso para entender o que ele está fazendo enquanto você cuida só dos leads ativos.</p>
        </div>
      </div>
      <pre id="aa-logs" class="aa-log">carregando...</pre>
    </section>

    <style>
      .aa-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
      .aa-grid label { display:flex; flex-direction:column; gap:6px; font-size:.85rem; color:var(--text-2); }
      .aa-grid input, .aa-grid select { border:1px solid var(--border); border-radius:10px; padding:10px 12px; background:var(--surface); color:var(--text-1); font:inherit; }
      .aa-checkbox { justify-content:flex-end; padding-top:22px; }
      .aa-checkbox span { color:var(--text-1); }
      .aa-presets { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .aa-actions { display:flex; gap:10px; flex-wrap:wrap; }
      .aa-soft-badge { display:inline-flex; align-items:center; padding:6px 10px; border-radius:999px; background:#fff4ce; border:1px solid #f1c21b; color:#7a5d00; font-size:.8rem; font-weight:600; }
      .aa-metrics strong { display:block; font-size:1.3rem; margin:6px 0; }
      .aa-two-col { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
      .aa-tags { display:flex; flex-wrap:wrap; gap:8px; }
      .aa-tags span { border:1px solid var(--border); background:var(--surface); padding:6px 10px; border-radius:999px; font-size:.8rem; }
      .aa-checks, .aa-warnings { border:1px solid var(--border); border-radius:12px; padding:10px 12px; background:var(--surface); display:grid; gap:6px; }
      .aa-check-ok { color:#0f8a4b; font-size:.85rem; }
      .aa-check-bad { color:#c0392b; font-size:.85rem; }
      .aa-warnings strong { font-size:.9rem; color:#9a6700; }
      .aa-log { margin:0; min-height:180px; max-height:320px; overflow:auto; background:#101826; color:#dbe4f0; border-radius:14px; padding:14px; font:12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .aa-list { display:grid; gap:8px; }
      .aa-list-item { display:flex; flex-direction:column; gap:2px; padding:10px 12px; border:1px solid var(--border); border-radius:12px; background:var(--surface); }
      @media (max-width: 900px) { .aa-two-col { grid-template-columns:1fr; } }
    </style>
  `
}

export async function setup(root) {
  if (pollTimer) clearInterval(pollTimer)

  const form = root.querySelector('#aa-form')
  let backendOnline = false
  let softSendLimitPerDay = 20

  const buildPayload = () => ({
    niche: form.niche.value,
    city: form.city.value,
    instance_id: form.instance_id.value,
    sequence_id: form.sequence_id.value,
    interval_minutes: Number(form.interval_minutes.value),
    limit_per_term: Number(form.limit_per_term.value),
    max_terms: Number(form.max_terms.value),
    max_new_leads_per_cycle: Number(form.max_new_leads_per_cycle.value),
    min_score: Number(form.min_score.value),
    auto_approve_score: Number(form.auto_approve_score.value),
    daily_send_limit: Number(form.daily_send_limit.value),
    delay_min_s: Number(form.delay_min_s.value),
    delay_max_s: Number(form.delay_max_s.value),
    auto_send: form.auto_send.checked,
    ai_personalize: form.ai_personalize.checked,
  })

  const applyPayloadToForm = payload => {
    form.interval_minutes.value = payload.interval_minutes
    form.limit_per_term.value = payload.limit_per_term
    form.max_terms.value = payload.max_terms
    form.max_new_leads_per_cycle.value = payload.max_new_leads_per_cycle
    form.min_score.value = payload.min_score
    form.auto_approve_score.value = payload.auto_approve_score
    form.daily_send_limit.value = payload.daily_send_limit
    form.delay_min_s.value = payload.delay_min_s
    form.delay_max_s.value = payload.delay_max_s
    form.auto_send.checked = payload.auto_send !== false
    form.ai_personalize.checked = Boolean(payload.ai_personalize)
  }

  const renderDerived = () => {
    const payload = buildPayload()
    const estimate = estimateOps(payload)
    const warnings = evaluateRisk(payload, softSendLimitPerDay)
    const softBadge = root.querySelector('#aa-soft-limit-badge')
    if (softBadge) softBadge.textContent = `Limite recomendado: ${softSendLimitPerDay}/dia`

    root.querySelector('#aa-est-cycles').textContent = estimate.cyclesPerDay
    root.querySelector('#aa-est-sends').textContent = estimate.sendPerDay
    root.querySelector('#aa-est-discovery').textContent = estimate.discoverCallsPerDay
    root.querySelector('#aa-est-ai').textContent = estimate.aiCallsPerDay

    const warningsEl = root.querySelector('#aa-risk-warnings')
    warningsEl.innerHTML = warnings.length
      ? `<strong>Alertas de risco</strong><span class="muted">limite recomendado atual: <strong id="aa-soft-limit">${softSendLimitPerDay}</strong>/dia</span>${warnings.map(item => `<span class="aa-check-bad">• ${item}</span>`).join('')}`
      : `<span class="muted">Sem alertas de risco para essa configuracao. Limite recomendado atual: <strong id="aa-soft-limit">${softSendLimitPerDay}</strong>/dia.</span>`

    const checks = []
    const hasOpenInstance = instances.some(item => isOpenInstance(item))
    const selectedInstance = payload.instance_id
      ? instances.find(item => String(getInstanceId(item)) === String(payload.instance_id))
      : null
    const instanceOk = payload.instance_id ? isOpenInstance(selectedInstance) : hasOpenInstance
    checks.push({ ok: instanceOk, label: instanceOk ? 'Instancia WhatsApp pronta.' : 'Sem instancia WhatsApp aberta.' })

    const selectedSequence = payload.sequence_id ? sequences.find(item => String(item.id) === String(payload.sequence_id)) : null
    const sequenceOk = !payload.sequence_id || ((selectedSequence?.steps || []).length > 0)
    checks.push({ ok: sequenceOk, label: sequenceOk ? 'Sequencia de follow-up valida.' : 'Sequencia selecionada sem etapas ativas.' })

    checks.push({ ok: backendOnline, label: backendOnline ? 'Backend conectado.' : 'Backend/API indisponivel no momento.' })

    const checkEl = root.querySelector('#aa-precheck')
    checkEl.innerHTML = checks.map(item => `<span class="${item.ok ? 'aa-check-ok' : 'aa-check-bad'}">${item.ok ? '✓' : '✕'} ${item.label}</span>`).join('')
    return checks
  }

  const renderInstances = selectedId => {
    const select = root.querySelector('#aa-instance')
    if (!select) return
    select.innerHTML = `<option value="">Instância aberta padrão</option>${instances.map(instance => {
      const status = getInstanceStatus(instance) || 'desconhecido'
      const instanceId = getInstanceId(instance)
      return `<option value="${instanceId}" ${String(selectedId || '') === String(instanceId) ? 'selected' : ''}>${getInstanceName(instance)} · ${status}</option>`
    }).join('')}`
  }

  const renderSequences = selectedId => {
    const select = root.querySelector('#aa-sequence')
    if (!select) return
    select.innerHTML = `<option value="">Automática por nicho</option>${sequences.map(sequence => `<option value="${sequence.id}" ${String(selectedId || '') === String(sequence.id) ? 'selected' : ''}>${sequence.name} · ${sequence.niche || 'Geral'} · ${sequence.steps?.length || 0} etapas</option>`).join('')}`
  }

  const syncForm = (state, { force = false } = {}) => {
    if (!state?.config) return
    if (hasLocalEdits && !force) return
    form.niche.value = state.config.niche || ''
    form.city.value = state.config.city || ''
    renderInstances(state.config.instance_id || '')
    renderSequences(state.config.sequence_id || '')
    form.interval_minutes.value = state.config.interval_minutes || 180
    form.limit_per_term.value = state.config.limit_per_term || 30
    form.max_terms.value = state.config.max_terms || 8
    form.max_new_leads_per_cycle.value = state.config.max_new_leads_per_cycle || 20
    form.min_score.value = state.config.min_score || 45
    form.auto_approve_score.value = state.config.auto_approve_score || 70
    form.daily_send_limit.value = state.config.daily_send_limit || 12
    form.delay_min_s.value = state.config.delay_min_s || 45
    form.delay_max_s.value = state.config.delay_max_s || 90
    form.auto_send.checked = state.config.auto_send !== false
    form.ai_personalize.checked = Boolean(state.config.ai_personalize)
  }

  const renderState = (state, options = {}) => {
    const badge = root.querySelector('#aa-badge')
    const badgeClass = state.active ? 'badge-success' : state.status === 'error' ? 'bad' : 'badge-neutral'
    badge.className = badgeClass
    badge.textContent = state.active ? 'ativo' : state.status === 'error' ? 'erro' : 'pausado'

    root.querySelector('#aa-status').textContent = state.status || 'idle'
    root.querySelector('#aa-stage').textContent = state.stage || '—'
    root.querySelector('#aa-next-run').textContent = formatDateTime(state.next_run_at)
    root.querySelector('#aa-last-run').textContent = formatDateTime(state.last_run_at)
    root.querySelector('#aa-cycles').textContent = state.stats?.cycles || 0
    root.querySelector('#aa-imported').textContent = state.stats?.imported || 0
    root.querySelector('#aa-auto-approved').textContent = state.stats?.auto_approved || 0
    root.querySelector('#aa-discarded').textContent = Number(state.last_cycle?.blocked || 0) + Number(state.last_cycle?.skipped_existing || 0) + Number(state.last_cycle?.below_score || 0)
    root.querySelector('#aa-dispatched').textContent = state.last_cycle?.dispatched || 0
    root.querySelector('#aa-dispatch-failed').textContent = state.last_cycle?.dispatch_failed || 0
    root.querySelector('#aa-followed-up').textContent = state.last_cycle?.followed_up || 0

    const terms = state.last_terms?.length
      ? state.last_terms.map(term => `<span>${term}</span>`).join('')
      : '<span class="muted">Sem ciclo ainda.</span>'
    root.querySelector('#aa-terms').innerHTML = terms
    root.querySelector('#aa-import-preview').innerHTML = renderImportedPreview(state.last_cycle?.imported_preview || [])
    root.querySelector('#aa-cycle-history').innerHTML = renderCycleHistory(state.recent_cycles || [])
    root.querySelector('#aa-logs').textContent = (state.logs || []).join('\n') || 'Sem logs ainda.'
    syncForm(state, options)
  }

  const markDirty = () => { hasLocalEdits = true }
  form.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => { markDirty(); renderDerived() })
    el.addEventListener('change', () => { markDirty(); renderDerived() })
  })

  root.querySelectorAll('[data-aa-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = AGENT_PRESETS[btn.dataset.aaPreset]
      if (!preset) return
      applyPayloadToForm(preset)
      hasLocalEdits = true
      renderDerived()
      toast(`Preset ${preset.label} aplicado.`, 'info')
    })
  })

  const refresh = async () => {
    try {
      const [state, quality] = await Promise.all([
        AutomationService.leadAgentStatus(),
        AutomationService.messageQuality(80),
      ])
      backendOnline = true
      softSendLimitPerDay = Number(state?.safety?.soft_limit_per_day || softSendLimitPerDay || 20)
      renderState(state)
      root.querySelector('#aa-message-quality').innerHTML = renderMessageQuality(quality)
      renderDerived()
    } catch {
      backendOnline = false
      root.querySelector('#aa-logs').textContent = 'Falha ao carregar o status do agente.'
      const qualityEl = root.querySelector('#aa-message-quality')
      if (qualityEl) qualityEl.innerHTML = '<span class="muted">Falha ao carregar auditoria de mensagens.</span>'
      renderDerived()
    }
  }

  root.querySelector('#aa-save').addEventListener('click', async () => {
    const btn = root.querySelector('#aa-save')
    btn.disabled = true
    btn.textContent = 'Salvando...'
    try {
      const state = await AutomationService.saveLeadAgentConfig(buildPayload())
      hasLocalEdits = false
      renderState(state, { force: true })
      renderDerived()
      toast('Configuracao salva sem ativar o agente.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel salvar a configuracao.', 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Salvar configuracao'
    }
  })

  root.querySelector('#aa-start').addEventListener('click', async () => {
    const btn = root.querySelector('#aa-start')
    btn.disabled = true
    btn.textContent = 'Ativando...'
    try {
      const checks = renderDerived()
      if (checks.some(item => !item.ok)) {
        throw new Error('Pre-check reprovado. Ajuste os itens em vermelho antes de ativar.')
      }
      const payload = buildPayload()
      let state
      try {
        state = await AutomationService.startLeadAgent(payload)
      } catch (error) {
        if (error?.data?.requires_confirmation) {
          const projected = Number(error.data.projected_send_per_day || 0)
          const softLimit = Number(error.data.soft_limit_per_day || 0)
          const confirmed = window.confirm(`Esta configuracao projeta ${projected} envios/dia (limite recomendado: ${softLimit}/dia). Deseja ativar mesmo assim?`)
          if (!confirmed) throw new Error('Ativacao cancelada para ajustar volume.')
          state = await AutomationService.startLeadAgent({ ...payload, force_high_volume: true })
        } else {
          throw error
        }
      }
      hasLocalEdits = false
      renderState(state, { force: true })
      renderDerived()
      toast('Agente de leads ativado.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel ativar o agente.', 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Ativar 24/7'
    }
  })

  root.querySelector('#aa-run').addEventListener('click', async () => {
    const btn = root.querySelector('#aa-run')
    btn.disabled = true
    btn.textContent = 'Rodando...'
    try {
      renderState(await AutomationService.runLeadAgentNow())
      toast('Ciclo manual concluido.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel rodar o agente.', 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Rodar agora'
    }
  })

  root.querySelector('#aa-stop').addEventListener('click', async () => {
    try {
      hasLocalEdits = false
      renderState(await AutomationService.stopLeadAgent(), { force: true })
      toast('Agente pausado.', 'success')
    } catch (error) {
      toast(error.message || 'Nao foi possivel pausar o agente.', 'error')
    }
  })

  try {
    const data = await WhatsAppInstanceService.list()
    instances = Array.isArray(data) ? data : data.instances || data.data || []
  } catch {
    instances = []
  }
  try {
    sequences = await TemplateService.listSequences()
  } catch {
    sequences = []
  }
  renderInstances('')
  renderSequences('')
  renderDerived()
  await refresh()
  pollTimer = setInterval(refresh, 15000)
}
