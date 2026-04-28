import { TemplateService } from '../services.js'
import { toast } from '../toast.js'

let _sequences = []
let _activeSeqId = null

const STATIC_RULES = [
  { name: 'Delay entre envios',  value: '30–60 segundos',        active: true },
  { name: 'Limite diário',       value: '120 mensagens',          active: true },
  { name: 'Horário permitido',   value: '09:00 às 18:00',         active: true },
  { name: 'Parar ao responder',  value: 'remove da fila',         active: true },
  { name: 'Deduplicação',        value: 'telefone + place_id',    active: true },
]

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Regras operacionais</p>
        <h1>Automações</h1>
      </div>
    </section>

    <section class="cards-grid" id="rules-grid">
      ${STATIC_RULES.map((r, i) => `
        <article class="panel rule" data-index="${i}">
          <div class="rule-head">
            <h2>${r.name}</h2>
            <div class="toggle${r.active ? '' : ' off'}" data-rule="${i}" title="${r.active ? 'Ativo — clique para desativar' : 'Inativo — clique para ativar'}"></div>
          </div>
          <p>${r.value}</p>
          <span class="rule-status-label" data-rule-label="${i}">${r.active ? 'Ativo' : 'Inativo'}</span>
        </article>
      `).join('')}
    </section>

    <section class="panel seq-active-panel" id="seq-active-section">
      <div class="panel-head">
        <div>
          <h2>Sequência ativa</h2>
          <p class="panel-copy muted">Sequência usada nas próximas campanhas criadas.</p>
        </div>
        <div id="seq-selector-wrap"></div>
      </div>
      <div id="seq-timeline" class="seq-timeline-loading">carregando...</div>
    </section>
  `
}

export async function setup(root) {
  root.querySelectorAll('.toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const isOff = toggle.classList.toggle('off')
      const label = root.querySelector(`[data-rule-label="${toggle.dataset.rule}"]`)
      if (label) label.textContent = isOff ? 'Inativo' : 'Ativo'
    })
  })

  try {
    _sequences = await TemplateService.listSequences()
  } catch {
    root.querySelector('#seq-timeline').textContent = 'Erro ao carregar sequências.'
    return
  }

  if (_sequences.length === 0) {
    root.querySelector('#seq-selector-wrap').innerHTML = ''
    root.querySelector('#seq-timeline').innerHTML = '<span class="muted">Nenhuma sequência criada. Vá em Mensagens → Sequências.</span>'
    return
  }

  _activeSeqId = _sequences[0].id
  renderSelectorAndTimeline(root)
}

function renderSelectorAndTimeline(root) {
  const wrap = root.querySelector('#seq-selector-wrap')
  wrap.innerHTML = `
    <select id="seq-picker" style="border:1px solid var(--border-strong);border-radius:10px;padding:8px 14px;font:inherit;font-size:.875rem;outline:none;background:var(--surface-2);color:var(--text-1)">
      ${_sequences.map(s => `<option value="${s.id}" ${s.id === _activeSeqId ? 'selected' : ''}>${s.name} (${s.niche})</option>`).join('')}
    </select>
  `

  wrap.querySelector('#seq-picker').addEventListener('change', e => {
    _activeSeqId = Number(e.target.value)
    renderTimeline(root)
    toast('Sequência ativa atualizada.', 'success')
  })

  renderTimeline(root)
}

function renderTimeline(root) {
  const seq = _sequences.find(s => s.id === _activeSeqId)
  const el = root.querySelector('#seq-timeline')
  if (!seq) { el.innerHTML = '<span class="muted">Sequência não encontrada.</span>'; return }

  el.innerHTML = `
    <div class="timeline">
      ${seq.steps.map((step, i) => {
        const body = TemplateService.resolveBody(step.templateId)
        const hasMsg = !!body
        return `
          <div class="timeline-step ${hasMsg ? '' : 'empty-step'}">
            <div class="timeline-node">
              <span class="timeline-day">${step.label}</span>
              ${i < seq.steps.length - 1 ? '<div class="timeline-connector"></div>' : ''}
            </div>
            <div class="timeline-content">
              <span class="muted timeline-condition">${step.condition}</span>
              ${hasMsg
                ? `<p class="timeline-msg">"${body.length > 100 ? body.slice(0, 97) + '…' : body}"</p>`
                : `<p class="timeline-msg muted">Sem mensagem atribuída</p>`
              }
            </div>
          </div>
        `
      }).join('')}
    </div>
  `
}
