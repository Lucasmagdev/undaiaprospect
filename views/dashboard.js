import { metric, animateMetrics, progress, badge } from '../components.js'

export const state = {
  realtime: { found: 0, sent: 0, replies: 0, hot: 0 },
  timer: null,
  paused: false,
}

function dashboardMetric(label, value, hint, action) {
  const isNum = typeof value === 'number'
  return `
    <button class="metric metric-action" type="button" data-dashboard-action="${action}">
      <span class="metric-label">${label}</span>
      <strong class="metric-value"${isNum ? ` data-target="${value}"` : ''}>${isNum ? 0 : value}</strong>
      <small class="metric-hint">${hint}</small>
    </button>
  `
}

export function render() {
  return `
    <section class="hero-panel">
      <div>
        <p class="eyebrow">Operação de prospecção</p>
        <h1>Máquina de leads para vender sites via WhatsApp.</h1>
        <p>Controle busca, mensagens, respostas e follow-ups em uma única esteira comercial.</p>
      </div>
      <form class="quick-start" id="quick-start">
        <label>Nicho <input id="niche" value="advogado" /></label>
        <label>Cidade <input id="city" value="Belo Horizonte" /></label>
        <label>Leads <input id="quantity" type="number" min="1" max="250" value="25" /></label>
        <div class="button-row">
          <button class="primary" type="submit" id="start-btn">Iniciar Prospecção</button>
          <button class="secondary" id="pause-btn" type="button" disabled>Pausar</button>
        </div>
      </form>
    </section>

    <section class="metrics" id="dash-metrics">
      ${dashboardMetric('Leads encontrados', state.realtime.found, 'carregando...', 'leads')}
      ${dashboardMetric('Mensagens enviadas', state.realtime.sent, 'carregando...', 'sent')}
      ${dashboardMetric('Respostas recebidas', state.realtime.replies, 'carregando...', 'replies')}
      ${dashboardMetric('Leads quentes', state.realtime.hot, 'carregando...', 'hot')}
    </section>

    <section class="split">
      <article class="panel" id="campaigns-panel">
        <div class="panel-head">
          <h2>Campanhas ativas</h2>
          <span class="muted">carregando...</span>
        </div>
        <div id="campaigns-list">
          ${[1,2,3].map(i => `
            <div style="padding:12px 0;border-bottom:1px solid var(--border)">
              <div class="skeleton" style="height:13px;width:55%;margin-bottom:6px;animation-delay:${i*80}ms"></div>
              <div class="skeleton" style="height:10px;width:35%;animation-delay:${i*80+40}ms"></div>
            </div>
          `).join('')}
        </div>
      </article>
      <article class="panel">
        <div class="panel-head">
          <h2>Log em tempo real</h2>
          <div class="live-dot"></div>
        </div>
        <ol class="activity" id="activity">
          <li><time>agora</time><span>Webhook da Evolution recebeu respostas do WhatsApp.</span></li>
          <li><time>agora</time><span>Overpass retornou empresas para Advocacia em Belo Horizonte.</span></li>
          <li><time>agora</time><span>Fila respeitando delay dinâmico entre 30 e 60 segundos.</span></li>
          <li><time>agora</time><span>Campanha pausada salva para retomada automática.</span></li>
        </ol>
      </article>
    </section>
  `
}

export async function setup(root) {
  animateMetrics(root)

  // Load dashboard metrics and campaigns
  const { CampaignService, DashboardService } = await import('../services.js')
  await loadDashboardMetrics(root, DashboardService)
  bindMetricActions(root)

  let campaigns = []
  try {
    campaigns = await CampaignService.list()
  } catch {
    campaigns = []
  }
  const list = root.querySelector('#campaigns-list')
  const head = root.querySelector('#campaigns-panel .muted')
  if (head) head.textContent = `${campaigns.length} no total`
  if (list) {
    list.innerHTML = campaigns.map(c => `
      <div class="campaign-line">
        <div>
          <strong>${c.name}</strong>
          <span>${c.niche} · ${c.city}</span>
        </div>
        ${badge(c.status_label || c.status)}
        <div class="campaign-progress">${progress(c.progress)}</div>
      </div>
    `).join('')
  }

  // Quick-start form
  const form = root.querySelector('#quick-start')
  const pause = root.querySelector('#pause-btn')
  const activity = root.querySelector('#activity')
  if (!form) return

  form.addEventListener('submit', e => {
    e.preventDefault()
    clearInterval(state.timer)
    state.paused = false
    pause.disabled = false
    pause.textContent = 'Pausar'
    addLog(activity, 'Use Campanhas ou Piloto Auto para buscar leads e disparar mensagens reais.')

    state.timer = setInterval(() => {
      if (state.paused) return
      loadDashboardMetrics(root, DashboardService, false)
      addLog(activity, 'Dashboard atualizado com os dados reais da operação.')
    }, 5000)
  })

  pause.addEventListener('click', () => {
    state.paused = !state.paused
    pause.textContent = state.paused ? 'Retomar' : 'Pausar'
    addLog(activity, state.paused ? 'Campanha pausada com progresso salvo.' : 'Campanha retomada.')
  })
}

async function loadDashboardMetrics(root, DashboardService, animate = true) {
  const metrics = root.querySelector('#dash-metrics')
  if (!metrics) return

  try {
    const stats = await DashboardService.stats()
    state.realtime = {
      found: Number(stats.leads_found || 0),
      sent: Number(stats.messages_sent || 0),
      replies: Number(stats.replies_received || 0),
      hot: Number(stats.hot_leads || 0),
    }
    const hints = stats.hints || {}
    metrics.innerHTML = `
      ${dashboardMetric('Leads encontrados', state.realtime.found, hints.leads_found || 'total importado no CRM', 'leads')}
      ${dashboardMetric('Mensagens enviadas', state.realtime.sent, hints.messages_sent || 'mensagens com status enviado', 'sent')}
      ${dashboardMetric('Respostas recebidas', state.realtime.replies, hints.replies_received || 'mensagens recebidas no WhatsApp', 'replies')}
      ${dashboardMetric('Leads quentes', state.realtime.hot, hints.hot_leads || 'respondidos, hot ou fechados', 'hot')}
    `
    bindMetricActions(root)
    if (animate) animateMetrics(metrics)
    else {
      metrics.querySelectorAll('.metric-value[data-target]').forEach(el => {
        el.textContent = el.dataset.target
      })
    }
  } catch (err) {
    metrics.innerHTML = `
      ${dashboardMetric('Leads encontrados', 0, 'API indisponível', 'leads')}
      ${dashboardMetric('Mensagens enviadas', 0, 'API indisponível', 'sent')}
      ${dashboardMetric('Respostas recebidas', 0, 'API indisponível', 'replies')}
      ${dashboardMetric('Leads quentes', 0, 'API indisponível', 'hot')}
    `
    bindMetricActions(root)
  }
}

function bindMetricActions(root) {
  root.querySelectorAll('[data-dashboard-action]').forEach(card => {
    card.addEventListener('click', () => {
      const action = card.dataset.dashboardAction
      if (action === 'leads') window.__navigate?.('leads')
      if (action === 'sent') window.__navigate?.('instances')
      if (action === 'replies') window.__navigate?.('inbox')
      if (action === 'hot') window.__navigate?.('inbox')
    })
  })
}

function addLog(activity, text) {
  if (!activity) return
  const li = document.createElement('li')
  li.innerHTML = `<time>agora</time><span>${text}</span>`
  activity.prepend(li)
}
