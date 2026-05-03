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
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                  <button class="secondary detail-btn" data-id="${c.id}" style="padding:4px 10px;font-size:.78rem">Detalhes</button>
                  ${c.status === 'draft' || c.status === 'error' ? `<button class="primary run-btn" data-id="${c.id}" style="padding:5px 12px;font-size:12px">▶ Disparar</button>` : ''}
                  ${c.status === 'running' ? `<span class="muted" style="font-size:12px">Enviando...</span>` : ''}
                  ${c.status === 'finished' ? `<span class="muted" style="font-size:12px">Concluída</span>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  root.querySelectorAll('.detail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.__navigate?.('campaigns', { view: 'campaign-detail', params: { id: btn.dataset.id } })
    })
  })

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

function readDirectTtsPayload(bodyEl) {
  const q = id => bodyEl.querySelector('#' + id)
  const engine = bodyEl.querySelector('input[name="d-engine"]:checked')?.value || 'edge'
  return {
    text: q('d-text').value.trim(),
    engine,
    voice: engine === 'edge' ? bodyEl.querySelector('input[name="d-voice"]:checked')?.value || '' : '',
    speed: parseFloat(q('d-speed').value),
    style: q('d-style').value,
    styledegree: parseFloat(q('d-styledeg').value),
    pitch_pct: parseFloat(q('d-pitch').value),
    character: bodyEl.querySelector('input[name="d-char"]:checked')?.value || 'casual',
    prefix: q('d-prefix').value,
    suffix: q('d-suffix').value,
    humanize_audio: Boolean(q('d-humanize')?.checked),
  }
}

function ttsPreviewUrl(data) {
  if (!data?.audio_base64) throw new Error(data?.message || 'Preview sem audio retornado.')
  const mime = data.format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
  const bytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

function ttsEngineLabel(engine) {
  return {
    edge: 'Edge TTS',
    kokoro: 'Kokoro',
    piper: 'Piper',
    xtts: 'XTTS v2',
    elevenlabs: 'ElevenLabs',
  }[engine] || engine || 'TTS'
}

function ttsPreviewMeta(data, requestedEngine) {
  const used = data?.engine || requestedEngine
  const usedLabel = ttsEngineLabel(used)
  const requestedLabel = ttsEngineLabel(requestedEngine)
  const format = data?.format ? ` · ${String(data.format).toUpperCase()}` : ''
  if (used && requestedEngine && used !== requestedEngine) {
    return `Gerado com ${usedLabel} · fallback de ${requestedLabel}${format}`
  }
  return `Gerado com ${usedLabel}${format}`
}

function openSendDirectModal() {
  openModal({
    title: 'Enviar para número(s)',
    submitLabel: 'Enviar',
    body: `
      <div class="direct-send-form">

        <!-- Preset selector -->
        <div class="direct-preset-row">
          <select id="d-preset" style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-2);color:var(--text-1)">
            <option value="">── Selecionar preset ──</option>
            <optgroup label="Presets prontos"></optgroup>
            <optgroup label="Meus presets" id="d-preset-user-group"></optgroup>
          </select>
          <button id="d-preset-del" type="button" title="Apagar preset selecionado" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text-3);cursor:pointer;font-size:.9rem">🗑</button>
        </div>

        <!-- Números -->
        <label style="display:grid;gap:4px;font-size:.78rem;font-weight:600;color:var(--text-2)">Números WhatsApp
          <textarea id="d-numbers" rows="2" placeholder="Um por linha  —  5531988887777" style="resize:vertical;font-family:monospace;font-size:.82rem"></textarea>
          <span style="font-size:11px;color:var(--text-3)">Formato: DDI+DDD+número (ex: 5531988887777)</span>
        </label>

        <!-- Mensagem + preview -->
        <label style="display:grid;gap:4px;font-size:.78rem;font-weight:600;color:var(--text-2)">Mensagem
          <textarea id="d-text" rows="4" placeholder="Digite a mensagem de voz..." style="resize:vertical"></textarea>
        </label>

        <!-- Checkbox áudio -->
        <label style="display:flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--text-2);cursor:pointer">
          <input id="d-audio" type="checkbox" checked style="width:15px;height:15px" />
          Enviar como áudio de voz
        </label>

        <label style="display:flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--text-2);cursor:pointer">
          <input id="d-humanize" type="checkbox" checked style="width:15px;height:15px" />
          Humanizar texto para audio de WhatsApp
        </label>

        <div id="d-audio-controls" style="display:grid;gap:10px">

          <!-- Velocidade -->
          <label style="display:grid;gap:4px;font-size:.78rem;font-weight:600;color:var(--text-2)">Velocidade
            <div style="display:flex;align-items:center;gap:10px">
              <input id="d-speed" type="range" min="0.7" max="1.4" step="0.05" value="1.05" style="flex:1" />
              <span id="d-speed-label" style="min-width:46px;font-size:.85rem;color:var(--text-1)">1.05×</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-3)"><span>Lento</span><span>Normal</span><span>Rápido</span></div>
          </label>

          <!-- Motor -->
          <div style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">Motor de voz
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <label style="display:flex;align-items:center;gap:7px;padding:9px 11px;border:2px solid var(--primary);border-radius:7px;cursor:pointer;font-weight:500" id="d-opt-edge">
                <input type="radio" name="d-engine" value="edge" checked style="accent-color:var(--primary)" />
                <span>🌐 Edge TTS<br><small style="font-weight:400;color:var(--text-3)">Microsoft Neural ★★★★★</small></span>
              </label>
              <label style="display:flex;align-items:center;gap:7px;padding:9px 11px;border:1px solid var(--border);border-radius:7px;cursor:pointer;font-weight:500" id="d-opt-kokoro">
                <input type="radio" name="d-engine" value="kokoro" style="accent-color:var(--primary)" />
                <span>🤖 Kokoro<br><small style="font-weight:400;color:var(--text-3)">Leve e rápido</small></span>
              </label>
              <label style="display:flex;align-items:center;gap:7px;padding:9px 11px;border:1px solid var(--border);border-radius:7px;cursor:pointer;font-weight:500" id="d-opt-piper">
                <input type="radio" name="d-engine" value="piper" style="accent-color:var(--primary)" />
                <span>🎙 Piper TTS<br><small style="font-weight:400;color:var(--text-3)">Voz pt-BR</small></span>
              </label>
              <label style="display:flex;align-items:center;gap:7px;padding:9px 11px;border:1px solid var(--border);border-radius:7px;cursor:pointer;font-weight:500" id="d-opt-xtts">
                <input type="radio" name="d-engine" value="xtts" style="accent-color:var(--primary)" />
                <span>✨ XTTS v2<br><small style="font-weight:400;color:var(--text-3)">Máx. realismo</small></span>
              </label>
            </div>
          </div>

          <!-- Voz (Edge) -->
          <div id="d-voice-wrap" style="display:grid;gap:4px;font-size:.78rem;font-weight:600;color:var(--text-2)">Voz
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
              <label style="display:flex;align-items:center;gap:6px;padding:7px 9px;border:2px solid var(--primary);border-radius:6px;cursor:pointer;font-size:.77rem;font-weight:500" id="d-v-francisca">
                <input type="radio" name="d-voice" value="pt-BR-FranciscaNeural" checked style="accent-color:var(--primary)" />
                👩 Francisca
              </label>
              <label style="display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.77rem;font-weight:500" id="d-v-thalita">
                <input type="radio" name="d-voice" value="pt-BR-ThalitaNeural" style="accent-color:var(--primary)" />
                👩 Thalita
              </label>
              <label style="display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.77rem;font-weight:500" id="d-v-antonio">
                <input type="radio" name="d-voice" value="pt-BR-AntonioNeural" style="accent-color:var(--primary)" />
                👨 Antonio
              </label>
            </div>
          </div>

          <!-- Avançado (colapsável) -->
          <details id="d-advanced" style="border:1px solid var(--border);border-radius:8px;padding:0">
            <summary style="padding:9px 13px;font-size:.78rem;font-weight:600;color:var(--text-2);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px">🎛 Configurações avançadas</summary>
            <div style="padding:12px;display:grid;gap:11px">

              <!-- Estilo + intensidade -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <label style="display:grid;gap:4px;font-size:.77rem;font-weight:600;color:var(--text-2)">Estilo da fala
                  <select id="d-style" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--bg-2);color:var(--text-1)">
                    <option value="chat">💬 Chat (casual)</option>
                    <option value="friendly">😊 Friendly (amigável)</option>
                    <option value="calm">😌 Calm (calmo)</option>
                    <option value="excited">🔥 Excited (animado)</option>
                    <option value="hopeful">🌟 Hopeful (esperançoso)</option>
                    <option value="customerservice">🎯 Customer service</option>
                  </select>
                </label>
                <label style="display:grid;gap:4px;font-size:.77rem;font-weight:600;color:var(--text-2)">Intensidade
                  <div style="display:flex;align-items:center;gap:8px">
                    <input id="d-styledeg" type="range" min="0.5" max="2" step="0.1" value="1.5" style="flex:1" />
                    <span id="d-styledeg-label" style="min-width:34px;font-size:.82rem;color:var(--text-1)">1.5×</span>
                  </div>
                </label>
              </div>

              <!-- Tom (pitch) -->
              <label style="display:grid;gap:4px;font-size:.77rem;font-weight:600;color:var(--text-2)">Tom (pitch)
                <div style="display:flex;align-items:center;gap:10px">
                  <input id="d-pitch" type="range" min="-20" max="20" step="1" value="-3" style="flex:1" />
                  <span id="d-pitch-label" style="min-width:44px;font-size:.82rem;color:var(--text-1)">-3%</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-3)"><span>Grave</span><span>Normal</span><span>Agudo</span></div>
              </label>

              <!-- Personagem -->
              <div style="display:grid;gap:5px;font-size:.77rem;font-weight:600;color:var(--text-2)">Personagem (pré-processamento do texto)
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                  <label style="display:flex;align-items:center;gap:6px;padding:7px 10px;border:2px solid var(--primary);border-radius:6px;cursor:pointer;font-size:.77rem" id="d-char-casual">
                    <input type="radio" name="d-char" value="casual" checked style="accent-color:var(--primary)" /> 🗣 Casual (WhatsApp)
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.77rem" id="d-char-enthusiastic">
                    <input type="radio" name="d-char" value="enthusiastic" style="accent-color:var(--primary)" /> 🚀 Animado
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.77rem" id="d-char-professional">
                    <input type="radio" name="d-char" value="professional" style="accent-color:var(--primary)" /> 👔 Profissional
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:.77rem" id="d-char-custom">
                    <input type="radio" name="d-char" value="custom" style="accent-color:var(--primary)" /> ✏️ Personalizado
                  </label>
                </div>
              </div>

              <!-- Prefixo / Sufixo -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <label style="display:grid;gap:3px;font-size:.77rem;font-weight:600;color:var(--text-2)">Prefixo (antes da mensagem)
                  <input id="d-prefix" type="text" placeholder='ex: "Oi, tudo bem?"' style="padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:.8rem" />
                </label>
                <label style="display:grid;gap:3px;font-size:.77rem;font-weight:600;color:var(--text-2)">Sufixo (depois da mensagem)
                  <input id="d-suffix" type="text" placeholder='ex: "Pode me chamar!"' style="padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:.8rem" />
                </label>
              </div>

            </div>
          </details>

          <!-- Salvar preset -->
          <div style="display:flex;gap:8px;align-items:center">
            <input id="d-preset-name" type="text" placeholder="Nome do preset..." style="flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:.8rem" />
            <button id="d-preset-save" type="button" style="padding:6px 14px;font-size:.78rem;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;white-space:nowrap">💾 Salvar</button>
          </div>

          <!-- Preview panel -->
          <div style="display:grid;gap:8px">
            <div style="display:flex;gap:8px;align-items:center">
              <span id="d-preview-meta" style="font-size:11px;color:var(--text-3);flex:1">Clique em Gerar para ouvir com as configurações atuais.</span>
              <button id="d-preview" type="button" class="tts-preview-btn">🔊 Gerar preview</button>
            </div>
            <!-- Mini player (oculto até gerar áudio) -->
            <div id="d-player" style="display:none;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
              <div style="display:flex;align-items:center;gap:10px">
                <button id="d-play-pause" type="button" style="width:32px;height:32px;border-radius:50%;background:var(--primary);color:#fff;border:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0">▶</button>
                <div style="flex:1;display:grid;gap:4px">
                  <input id="d-seek" type="range" min="0" max="100" value="0" step="0.1" style="width:100%;accent-color:var(--primary)" />
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-3)">
                    <span id="d-time-cur">0:00</span>
                    <span id="d-time-dur">0:00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div><!-- /d-audio-controls -->
      </div>
    `,
    onMount: (bodyEl) => {
      const q  = id  => bodyEl.querySelector('#' + id)
      const qa = sel => bodyEl.querySelectorAll(sel)

      // ── Presets prontos ──────────────────────────────────────────────────
      const BUILTIN = [
        { name:'Audio WhatsApp curto', engine:'edge', voice:'pt-BR-FranciscaNeural', speed:1.12, style:'chat',            styledegree:2.0, pitch_pct:-2,  character:'casual',       prefix:'', suffix:'', humanize_audio:true },
        { name:'Vendedora leve',       engine:'edge', voice:'pt-BR-FranciscaNeural', speed:1.08, style:'friendly',        styledegree:1.8, pitch_pct:1,   character:'casual',       prefix:'', suffix:'', humanize_audio:true },
        { name:'Consultor premium',    engine:'edge', voice:'pt-BR-AntonioNeural',   speed:0.96, style:'customerservice', styledegree:1.6, pitch_pct:-10, character:'professional', prefix:'', suffix:'', humanize_audio:true },
        { name:'Urgente simpatico',    engine:'edge', voice:'pt-BR-FranciscaNeural', speed:1.18, style:'excited',         styledegree:2.0, pitch_pct:4,   character:'enthusiastic', prefix:'', suffix:'', humanize_audio:true },
        { name:'Calmo confiavel',      engine:'edge', voice:'pt-BR-AntonioNeural',   speed:0.90, style:'calm',            styledegree:1.8, pitch_pct:-14, character:'professional', prefix:'', suffix:'', humanize_audio:true },
        { name:'👩 Amiga do Bairro',         engine:'edge', voice:'pt-BR-FranciscaNeural', speed:1.05, style:'chat',            styledegree:1.5, pitch_pct:-3,  character:'casual',       prefix:'', suffix:'' },
        { name:'🚀 Empreendedora Animada',    engine:'edge', voice:'pt-BR-FranciscaNeural', speed:1.10, style:'excited',         styledegree:1.3, pitch_pct:2,   character:'enthusiastic', prefix:'', suffix:'' },
        { name:'👔 Consultor Confiante',      engine:'edge', voice:'pt-BR-AntonioNeural',   speed:1.05, style:'customerservice', styledegree:1.0, pitch_pct:-5,  character:'professional', prefix:'', suffix:'' },
      ]
      const LS_KEY = 'tts_presets_v2'
      const getUser  = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] } }
      const saveUser = a => localStorage.setItem(LS_KEY, JSON.stringify(a))

      function buildPresetSelect() {
        const sel  = q('d-preset')
        const grpB = sel.querySelector('optgroup:nth-of-type(1)')
        const grpU = sel.querySelector('optgroup:nth-of-type(2)')
        grpB.innerHTML = BUILTIN.map((p, i) => `<option value="b:${i}">${p.name}</option>`).join('')
        grpU.innerHTML = getUser().map((p, i) => `<option value="u:${i}">${p.name}</option>`).join('')
      }
      buildPresetSelect()

      function applyPreset(p) {
        if (!p) return
        const set = (id, v) => { const el = q(id); if (el) el.value = v }
        const chk = (name, v) => {
          const r = bodyEl.querySelector('input[name="' + name + '"][value="' + v + '"]')
          if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })) }
        }
        chk('d-engine', p.engine || 'edge')
        chk('d-voice',  p.voice  || 'pt-BR-FranciscaNeural')
        chk('d-char',   p.character || 'casual')
        set('d-speed',    p.speed       || 1.05);  q('d-speed-label').textContent    = parseFloat(p.speed    || 1.05).toFixed(2) + '×'
        set('d-style',    p.style       || 'chat')
        set('d-styledeg', p.styledegree || 1.5);   q('d-styledeg-label').textContent = parseFloat(p.styledegree || 1.5).toFixed(1) + '×'
        set('d-pitch',    p.pitch_pct   || -3);    q('d-pitch-label').textContent    = ((p.pitch_pct || 0) >= 0 ? '+' : '') + Math.round(p.pitch_pct || 0) + '%'
        set('d-prefix',   p.prefix || '')
        set('d-suffix',   p.suffix || '')
        if (q('d-humanize')) q('d-humanize').checked = p.humanize_audio !== false
      }

      q('d-preset').addEventListener('change', e => {
        const v = e.target.value
        if (!v) return
        const [type, idx] = v.split(':')
        applyPreset(type === 'b' ? BUILTIN[+idx] : getUser()[+idx])
      })

      q('d-preset-del').addEventListener('click', () => {
        const v = q('d-preset').value
        if (!v) return
        const [type, idx] = v.split(':')
        if (type !== 'u') { alert('Só é possível apagar presets personalizados.'); return }
        const list = getUser(); list.splice(+idx, 1); saveUser(list)
        buildPresetSelect()
        q('d-preset').value = ''
      })

      q('d-preset-save').addEventListener('click', () => {
        const name = q('d-preset-name').value.trim()
        if (!name) { q('d-preset-name').focus(); return }
        const preset = {
          name,
          engine:      bodyEl.querySelector('input[name="d-engine"]:checked')?.value || 'edge',
          voice:       bodyEl.querySelector('input[name="d-voice"]:checked')?.value  || 'pt-BR-FranciscaNeural',
          speed:       parseFloat(q('d-speed').value),
          style:       q('d-style').value,
          styledegree: parseFloat(q('d-styledeg').value),
          pitch_pct:   parseFloat(q('d-pitch').value),
          character:   bodyEl.querySelector('input[name="d-char"]:checked')?.value   || 'casual',
          prefix:      q('d-prefix').value,
          suffix:      q('d-suffix').value,
          humanize_audio: Boolean(q('d-humanize')?.checked),
        }
        const list = getUser(); list.push(preset); saveUser(list)
        buildPresetSelect()
        q('d-preset-name').value = ''
        q('d-preset').value = 'u:' + (list.length - 1)
      })

      // ── Checkbox áudio ───────────────────────────────────────────────────
      const cb = q('d-audio')
      const ac = q('d-audio-controls')
      const togAudio = () => { ac.style.opacity = cb.checked ? '1' : '0.4'; ac.style.pointerEvents = cb.checked ? '' : 'none' }
      cb.addEventListener('change', togAudio); togAudio()

      // ── Sliders ──────────────────────────────────────────────────────────
      q('d-speed').addEventListener('input',    e => { q('d-speed-label').textContent    = parseFloat(e.target.value).toFixed(2) + '×' })
      q('d-styledeg').addEventListener('input', e => { q('d-styledeg-label').textContent = parseFloat(e.target.value).toFixed(1) + '×' })
      q('d-pitch').addEventListener('input',    e => { const v = +e.target.value; q('d-pitch-label').textContent = (v >= 0 ? '+' : '') + v + '%' })

      // ── Engine → highlight + mostrar/esconder voz ────────────────────────
      function hlOpt(name, val, ids) {
        ids.forEach(id => {
          const el = bodyEl.querySelector('#' + id)
          if (!el) return
          const active = el.querySelector('input[type=radio]')?.value === val
          el.style.borderColor = active ? 'var(--primary)' : 'var(--border)'
          el.style.borderWidth  = active ? '2px' : '1px'
        })
      }
      qa('input[name="d-engine"]').forEach(r => r.addEventListener('change', () => {
        hlOpt('d-engine', r.value, ['d-opt-edge', 'd-opt-kokoro', 'd-opt-piper', 'd-opt-xtts'])
        q('d-voice-wrap').style.display = r.value === 'edge' ? 'grid' : 'none'
      }))
      qa('input[name="d-voice"]').forEach(r => r.addEventListener('change', () =>
        hlOpt('d-voice', r.value, ['d-v-francisca', 'd-v-thalita', 'd-v-antonio'])))
      qa('input[name="d-char"]').forEach(r => r.addEventListener('change', () =>
        hlOpt('d-char', r.value, ['d-char-casual', 'd-char-enthusiastic', 'd-char-professional', 'd-char-custom'])))

      // ── Preview player ───────────────────────────────────────────────────
      let currentAudio = null
      let currentUrl   = null
      let isSeeking    = false

      const player      = q('d-player')
      const playPauseBtn = q('d-play-pause')
      const seekBar     = q('d-seek')
      const timeCur     = q('d-time-cur')
      const timeDur     = q('d-time-dur')

      const fmtTime = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00'

      function attachPlayerListeners(audio) {
        audio.addEventListener('timeupdate', () => {
          if (!isSeeking && audio.duration) {
            seekBar.value = (audio.currentTime / audio.duration) * 100
            timeCur.textContent = fmtTime(audio.currentTime)
          }
        })
        audio.addEventListener('loadedmetadata', () => { timeDur.textContent = fmtTime(audio.duration) })
        audio.addEventListener('ended',  () => { playPauseBtn.textContent = '▶'; seekBar.value = 0; timeCur.textContent = '0:00' })
        audio.addEventListener('play',   () => { playPauseBtn.textContent = '⏸' })
        audio.addEventListener('pause',  () => { playPauseBtn.textContent = '▶' })
      }

      playPauseBtn.addEventListener('click', () => {
        if (!currentAudio) return
        currentAudio.paused ? currentAudio.play() : currentAudio.pause()
      })

      seekBar.addEventListener('mousedown',  () => { isSeeking = true })
      seekBar.addEventListener('touchstart', () => { isSeeking = true })
      seekBar.addEventListener('input', () => {
        if (currentAudio && currentAudio.duration) {
          currentAudio.currentTime = (seekBar.value / 100) * currentAudio.duration
          timeCur.textContent = fmtTime(currentAudio.currentTime)
        }
      })
      seekBar.addEventListener('mouseup',  () => { isSeeking = false })
      seekBar.addEventListener('touchend', () => { isSeeking = false })

      q('d-preview').addEventListener('click', async () => {
        const btn  = q('d-preview')
        const meta = q('d-preview-meta')
        const payload = readDirectTtsPayload(bodyEl)
        if (!payload.text) { btn.style.borderColor = 'red'; setTimeout(() => btn.style.borderColor = '', 1500); return }

        if (currentAudio) { currentAudio.pause(); currentAudio = null }
        if (currentUrl)   { URL.revokeObjectURL(currentUrl); currentUrl = null }

        btn.textContent = 'Gerando...'; btn.disabled = true
        if (meta) meta.textContent = 'Gerando áudio...'

        try {
          const data = await WhatsAppInstanceService.previewTTS(payload)
          if (meta) meta.textContent = ttsPreviewMeta(data, payload.engine)
          currentUrl   = ttsPreviewUrl(data)
          currentAudio = new Audio(currentUrl)
          attachPlayerListeners(currentAudio)

          player.style.display = 'block'
          seekBar.value = 0; timeCur.textContent = '0:00'; timeDur.textContent = '0:00'

          await currentAudio.play()
          btn.textContent = '🔊 Gerar preview'; btn.disabled = false
        } catch (e) {
          if (currentUrl) { URL.revokeObjectURL(currentUrl); currentUrl = null }
          currentAudio = null
          btn.textContent = '🔊 Gerar preview'; btn.disabled = false
          if (meta) meta.textContent = 'Não foi possível gerar o preview.'
          toast(e.message, 'error')
        }
      })
    },
    onSubmit: async (body) => {
      const raw     = body.querySelector('#d-numbers').value
      const text    = body.querySelector('#d-text').value.trim()
      const audio   = body.querySelector('#d-audio').checked
      const engine  = body.querySelector('input[name="d-engine"]:checked')?.value || 'edge'
      const voice   = engine === 'edge' ? body.querySelector('input[name="d-voice"]:checked')?.value || '' : ''
      const speed   = parseFloat(body.querySelector('#d-speed')?.value   || '1.05')
      const numbers = raw.split(/[\n,;]+/).map(n => n.replace(/\D/g,'').trim()).filter(n => n.length >= 10)
      if (!numbers.length) { toast('Informe ao menos um número válido.', 'warning'); throw new Error('validation') }
      if (!text)           { toast('Mensagem obrigatória.',              'warning'); throw new Error('validation') }
      const extra = {
        style:       body.querySelector('#d-style')?.value                               || 'chat',
        styledegree: parseFloat(body.querySelector('#d-styledeg')?.value                 || '1.5'),
        pitch_pct:   parseFloat(body.querySelector('#d-pitch')?.value                    || '-3'),
        character:   body.querySelector('input[name="d-char"]:checked')?.value           || 'casual',
        prefix:      body.querySelector('#d-prefix')?.value                              || '',
        suffix:      body.querySelector('#d-suffix')?.value                              || '',
        humanize_audio: Boolean(body.querySelector('#d-humanize')?.checked),
      }
      try {
        const data = await WhatsAppInstanceService.sendDirect({ numbers, text, use_audio: audio, engine, speed, voice, ...extra })
        const engineNote = data.engine ? ` · ${ttsEngineLabel(data.engine)}` : ''
        toast(`Enviado para ${data.sent} número(s)${data.failed ? ` · ${data.failed} falha(s)` : ''}${engineNote} ✓`, data.failed ? 'warning' : 'success')
      } catch (error) {
        toast(error.message, 'error')
        throw error
      }
    },
  })
}

const plusIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
const micIcon  = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>`
