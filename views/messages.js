import { skeletonCards, emptyState } from '../components.js'
import { openModal } from '../modal.js'
import { toast } from '../toast.js'
import { TemplateService } from '../services.js'

let _activeTab = 'bank'
let _activeNiche = 'Todas'
let _nicheBank = {}
let _sequences = []
let _templates = []
let _activeSeqId = null

const NICHES = ['Advocacia', 'Odontologia', 'Restaurante', 'Clínica Estética', 'Academia', 'Imobiliária', 'Contabilidade']

function highlightVars(text) {
  return text.replace(/\{([^}]+)\}/g, '<mark class="tpl-var">{$1}</mark>')
}

/* ── RENDER ── */

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Templates e sequências de prospecção</p>
        <h1>Mensagens</h1>
      </div>
      <div class="tab-actions" id="tab-actions"></div>
    </section>

    <div class="tab-bar" id="msg-tabs">
      <button class="tab-btn ${_activeTab === 'bank' ? 'active' : ''}" data-tab="bank">Banco por Nicho</button>
      <button class="tab-btn ${_activeTab === 'sequences' ? 'active' : ''}" data-tab="sequences">Sequências</button>
      <button class="tab-btn ${_activeTab === 'templates' ? 'active' : ''}" data-tab="templates">Templates</button>
    </div>

    <div id="msg-content">
      ${skeletonCards(3)}
    </div>
  `
}

/* ── SETUP ── */

export async function setup(root) {
  try {
    [_nicheBank, _sequences, _templates] = await Promise.all([
      TemplateService.listNicheBank(),
      TemplateService.listSequences(),
      TemplateService.list(),
    ])
  } catch {
    root.querySelector('#msg-content').innerHTML = emptyState('Erro ao carregar dados')
    return
  }

  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === _activeTab))
      renderTab(root)
    })
  })

  renderTab(root)
}

function renderTab(root) {
  updateTabActions(root)
  if (_activeTab === 'bank')      renderBank(root)
  else if (_activeTab === 'sequences') renderSequences(root)
  else renderTemplates(root)
}

/* ── TAB ACTIONS ── */

function updateTabActions(root) {
  const el = root.querySelector('#tab-actions')
  if (_activeTab === 'sequences') {
    el.innerHTML = `<button class="primary" id="new-seq-btn">+ Nova sequência</button>`
    el.querySelector('#new-seq-btn').addEventListener('click', () => openNewSequenceModal(root))
  } else if (_activeTab === 'templates') {
    el.innerHTML = `<button class="primary" id="new-tpl-btn">+ Novo template</button>`
    el.querySelector('#new-tpl-btn').addEventListener('click', () => openNewTemplateModal(root))
  } else {
    el.innerHTML = ''
  }
}

/* ── BANK TAB ── */

function renderBank(root) {
  const content = root.querySelector('#msg-content')

  const allNiches = ['Todas', ...NICHES]
  const active = _activeNiche

  const filtered = active === 'Todas'
    ? Object.entries(_nicheBank)
    : Object.entries(_nicheBank).filter(([n]) => n === active)

  content.innerHTML = `
    <div class="niche-pills">
      ${allNiches.map(n => `
        <button class="pill ${n === active ? 'active' : ''}" data-niche="${n}">${n}</button>
      `).join('')}
    </div>
    <div class="niche-bank-grid" id="bank-grid">
      ${filtered.length === 0
        ? emptyState('Nenhum nicho encontrado')
        : filtered.map(([niche, msgs]) => `
          <div class="niche-group">
            <h3 class="niche-group-title">${niche}</h3>
            <div class="bank-cards">
              ${msgs.map(m => `
                <article class="panel bank-card" data-id="${m.id}">
                  <div class="bank-card-head">
                    <span class="tag">${m.label}</span>
                    <span class="tag tag-niche">${niche}</span>
                  </div>
                  <p class="bank-body">${highlightVars(m.body)}</p>
                  <button class="secondary use-btn" data-id="${m.id}" data-niche="${niche}">Usar em sequência</button>
                </article>
              `).join('')}
            </div>
          </div>
        `).join('')
      }
    </div>
  `

  content.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      _activeNiche = pill.dataset.niche
      renderBank(root)
    })
  })

  content.querySelectorAll('.use-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = 'sequences'
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'sequences'))
      renderSequences(root)
      toast(`Vá em Sequências e atribua a mensagem ${btn.dataset.id} a uma etapa.`, 'info')
    })
  })
}

/* ── SEQUENCES TAB ── */

function renderSequences(root) {
  const content = root.querySelector('#msg-content')
  updateTabActions(root)

  if (_sequences.length === 0) {
    content.innerHTML = emptyState('Nenhuma sequência criada', 'Crie uma sequência e atribua templates a cada etapa.')
    return
  }

  const active = _activeSeqId ?? _sequences[0].id
  _activeSeqId = active
  const seq = _sequences.find(s => s.id === active)

  const allTemplateOptions = [
    ...(_templates.map(t => ({ id: t.id, label: `[Template] ${t.name}` }))),
    ...Object.entries(_nicheBank).flatMap(([niche, msgs]) =>
      msgs.map(m => ({ id: m.id, label: `[${niche}] ${m.label}` }))
    ),
  ]

  content.innerHTML = `
    <div class="seq-layout">
      <aside class="seq-list">
        ${_sequences.map(s => `
          <button class="seq-item ${s.id === active ? 'active' : ''}" data-seq="${s.id}">
            <strong>${s.name}</strong>
            <span>${s.niche}</span>
          </button>
        `).join('')}
      </aside>

      <div class="seq-editor">
        <div class="seq-editor-head">
          <h2>${seq.name} <span class="tag">${seq.niche}</span></h2>
          <p class="muted">Atribua um template ou mensagem do banco a cada etapa da cadência.</p>
        </div>
        <div class="seq-steps">
          ${seq.steps.map((step, i) => {
            const body = TemplateService.resolveBody(step.templateId)
            return `
              <article class="panel seq-step" data-step="${i}">
                <div class="step-head">
                  <span class="step-label">${step.label}</span>
                  <span class="muted step-condition">${step.condition}</span>
                </div>
                <label class="step-select-label">
                  Mensagem
                  <select class="step-select" data-step="${i}" data-seq="${seq.id}">
                    <option value="">— nenhuma —</option>
                    ${allTemplateOptions.map(o => `
                      <option value="${o.id}" ${String(step.templateId) === String(o.id) ? 'selected' : ''}>${o.label}</option>
                    `).join('')}
                  </select>
                </label>
                <div class="step-preview ${body ? '' : 'empty'}">
                  ${body ? highlightVars(body) : '<span class="muted">Selecione uma mensagem para ver o preview.</span>'}
                </div>
              </article>
            `
          }).join('')}
        </div>
      </div>
    </div>
  `

  content.querySelectorAll('.seq-item').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeSeqId = Number(btn.dataset.seq)
      renderSequences(root)
    })
  })

  content.querySelectorAll('.step-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const seqId = Number(sel.dataset.seq)
      const stepIndex = Number(sel.dataset.step)
      const val = sel.value === '' ? null : (isNaN(Number(sel.value)) ? sel.value : Number(sel.value))
      try {
        const updated = await TemplateService.updateSequenceStep(seqId, stepIndex, val)
        _sequences = _sequences.map(s => s.id === seqId ? updated : s)
        const preview = sel.closest('.seq-step').querySelector('.step-preview')
        const body = TemplateService.resolveBody(val)
        preview.className = `step-preview ${body ? '' : 'empty'}`
        preview.innerHTML = body ? highlightVars(body) : '<span class="muted">Selecione uma mensagem para ver o preview.</span>'
        toast('Etapa atualizada.', 'success')
      } catch (e) {
        toast(e.message, 'error')
      }
    })
  })
}

/* ── TEMPLATES TAB ── */

async function renderTemplates(root) {
  const content = root.querySelector('#msg-content')
  updateTabActions(root)

  if (_templates.length === 0) {
    content.innerHTML = emptyState('Nenhum template criado', 'Crie templates para agilizar seus envios.')
    return
  }

  content.innerHTML = `
    <div class="cards-grid">
      ${_templates.map(t => `
        <article class="panel template">
          <span class="tag">${t.use}</span>
          <h2>${t.name}</h2>
          <p class="template-body">${highlightVars(t.body)}</p>
          <strong>${t.conversion} de conversão</strong>
        </article>
      `).join('')}
    </div>
  `
}

/* ── MODALS ── */

function openNewSequenceModal(root) {
  openModal({
    title: 'Nova sequência',
    submitLabel: 'Criar sequência',
    body: `
      <div style="display:grid;gap:12px">
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">
          Nome
          <input id="s-name" placeholder="ex: Restaurantes SP" />
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">
          Nicho alvo
          <select id="s-niche" style="border:1px solid var(--border-strong);border-radius:10px;padding:10px 12px;font:inherit;font-size:.875rem;outline:none;background:var(--surface-2);color:var(--text-1)">
            <option value="Geral">Geral</option>
            ${NICHES.map(n => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </label>
      </div>
    `,
    onSubmit: async (body) => {
      const name  = body.querySelector('#s-name').value.trim()
      const niche = body.querySelector('#s-niche').value
      if (!name) { toast('Informe o nome da sequência.', 'warning'); throw new Error('validation') }
      const seq = await TemplateService.createSequence({ name, niche })
      _sequences.push(seq)
      _activeSeqId = seq.id
      _activeTab = 'sequences'
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'sequences'))
      toast(`Sequência "${name}" criada.`, 'success')
      renderSequences(root)
    },
  })
}

const TEMPLATE_SUGESTOES = [
  {
    label: 'Primeiro contato (permissao)',
    text: 'Oi, tudo bem?\n\nVi que voces trabalham com {nicho} aqui em {cidade} e queria bater um papo rapido.\n\nTenho algo que pode ajudar no dia a dia do negocio. Posso te contar em dois minutinhos?',
  },
  {
    label: 'Abordagem direta',
    text: 'Ola! Como vai?\n\nEntrei em contato porque trabalho com solucoes para {nicho} e vi que voces sao de {cidade}.\n\nPosso compartilhar algo rapido com voce?',
  },
  {
    label: 'Tom curioso',
    text: 'Oi! Passei pelo perfil de voces e fiquei curioso.\n\nVoces sao da area de {nicho} em {cidade}, certo? Tenho algo que acho que vai fazer sentido pro negocio de voces.\n\nPosso mandar mais detalhes?',
  },
]

function openNewTemplateModal(root) {
  const sugestoesHtml = TEMPLATE_SUGESTOES.map((s, i) =>
    `<button type="button" class="secondary" style="font-size:11px;padding:4px 8px" data-sug="${i}">${s.label}</button>`
  ).join(' ')

  openModal({
    title: 'Novo template',
    submitLabel: 'Salvar template',
    body: `
      <div style="display:grid;gap:12px">
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">
          Nome
          <input id="t-name" placeholder="ex: Primeiro contato — {nicho}" />
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">
          Uso
          <input id="t-use" placeholder="ex: Primeiro contato frio" />
        </label>
        <label style="display:grid;gap:5px;font-size:.78rem;font-weight:600;color:var(--text-2)">
          Mensagem
          <p style="font-size:11px;color:var(--text-3);margin:0 0 4px">
            Variaveis: <code>{cidade}</code> <code>{nicho}</code> — evite usar o nome da empresa no inicio, soa robotico.
          </p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${sugestoesHtml}</div>
          <textarea id="t-body" rows="5" style="width:100%;border:1px solid var(--border-strong);border-radius:10px;padding:10px 12px;font:inherit;font-size:.875rem;outline:none;resize:vertical" placeholder="Escreva sua mensagem aqui..."></textarea>
        </label>
      </div>
    `,
    onMount: (bodyEl) => {
      bodyEl.querySelectorAll('[data-sug]').forEach(btn => {
        btn.addEventListener('click', () => {
          const sug = TEMPLATE_SUGESTOES[Number(btn.dataset.sug)]
          if (sug) bodyEl.querySelector('#t-body').value = sug.text
        })
      })
    },
    onSubmit: async (bodyEl) => {
      const name = bodyEl.querySelector('#t-name').value.trim()
      const use  = bodyEl.querySelector('#t-use').value.trim()
      const text = bodyEl.querySelector('#t-body').value.trim()
      if (!name || !use || !text) { toast('Preencha todos os campos.', 'warning'); throw new Error('validation') }
      const t = await TemplateService.create({ name, use, body: text, conversion: '—' })
      _templates.push(t)
      toast(`Template "${name}" salvo.`, 'success')
      renderTemplates(root)
    },
  })
}
