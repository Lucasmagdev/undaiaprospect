import { metric, animateMetrics, progress, badge } from '../components.js'

export const state = { realtime: { found: 84, sent: 57, replies: 9 }, timer: null, paused: false }

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
      ${metric('Leads encontrados', state.realtime.found, '+18 nas últimas 2h')}
      ${metric('Mensagens enviadas', state.realtime.sent, 'limite diário: 120')}
      ${metric('Respostas recebidas', state.realtime.replies, '15.8% de resposta')}
      ${metric('Leads quentes', 6, '2 aguardando proposta')}
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

  // Load campaigns
  const { CampaignService } = await import('../services.js')
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
    addLog(activity, 'Campanha simulada no painel. Para envio real, use a tela Campanhas.')

    state.timer = setInterval(() => {
      if (state.paused) return
      state.realtime.found += 1
      if (state.realtime.found % 2 === 0) state.realtime.sent += 1
      if (state.realtime.sent % 9 === 0) state.realtime.replies += 1
      updateMetrics(root)
      addLog(activity, `Lead processado. ${state.realtime.sent} mensagens enviadas hoje.`)
    }, 1600)
  })

  pause.addEventListener('click', () => {
    state.paused = !state.paused
    pause.textContent = state.paused ? 'Retomar' : 'Pausar'
    addLog(activity, state.paused ? 'Campanha pausada com progresso salvo.' : 'Campanha retomada.')
  })
}

function updateMetrics(root) {
  const vals = root.querySelectorAll('.metric-value[data-target]')
  if (vals[0]) { vals[0].textContent = state.realtime.found; vals[0].dataset.target = state.realtime.found }
  if (vals[1]) { vals[1].textContent = state.realtime.sent;  vals[1].dataset.target = state.realtime.sent }
  if (vals[2]) { vals[2].textContent = state.realtime.replies; vals[2].dataset.target = state.realtime.replies }
}

function addLog(activity, text) {
  if (!activity) return
  const li = document.createElement('li')
  li.innerHTML = `<time>agora</time><span>${text}</span>`
  activity.prepend(li)
}
