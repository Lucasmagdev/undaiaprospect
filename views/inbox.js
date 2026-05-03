import { badge, emptyState } from '../components.js'
import { ConversationService } from '../services.js'
import { toast } from '../toast.js'

let activeConvId = null
const API_BASE = (import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001').replace(/\/$/, '')

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

async function loadClassification(root, conv) {
  const classPanel = root.querySelector('#classification-panel')
  if (!classPanel) return

  try {
    const resp = await fetch(`${API_BASE}/api/classify-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: (conv.messages || []).map(m => ({
          role: m.dir === 'out' ? 'assistant' : 'user',
          content: m.text || m.content || '',
        })),
        lead: { name: conv.lead, phone: conv.phone },
      }),
    })
    if (!resp.ok) throw new Error('Classificação falhou')
    const classification = await resp.json()

    const color = typeColor(classification.response_type)
    const label = typeLabel(classification.response_type)

    let actionButtons = ''
    if (classification.escalation) {
      actionButtons = `<button class="primary" style="padding:6px 12px;font-size:.8rem;margin-top:8px;width:100%">🚀 Assumir no humano agora</button>`
    }
    if (classification.handle_automatic) {
      const action = classification.response_type === 'opt_out' ? 'Marcar opt-out' : 'Validar número'
      actionButtons = `<button class="secondary" style="padding:6px 12px;font-size:.8rem;margin-top:8px;width:100%;border-color:${color}">${action} (automático)</button>`
    }

    classPanel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:24px;height:24px;border-radius:50%;background-color:${color};opacity:0.2"></div>
        <strong style="color:${color}">${label}</strong>
      </div>
      <div style="color:var(--text-2)">${classification.summary}</div>
      <div style="color:var(--text-3);font-size:11px;display:flex;align-items:center;gap:4px">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        ${classification.next_action}
      </div>
      ${actionButtons}
    `
  } catch (e) {
    console.error('[Classification] Error:', e.message)
    classPanel.innerHTML = `<div style="color:var(--text-3);font-size:11px">Classificação indisponível</div>`
  }
}

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Respostas do WhatsApp</p>
        <h1>Inbox</h1>
      </div>
    </section>
    <section class="inbox">
      <div class="conversation-list" id="conv-list">
        ${[1,2,3].map(i => `
          <div style="padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface)">
            <div class="skeleton" style="height:13px;width:60%;margin-bottom:6px;animation-delay:${i*80}ms"></div>
            <div class="skeleton" style="height:10px;width:40%;animation-delay:${i*80+40}ms"></div>
          </div>
        `).join('')}
      </div>
      <article class="panel chat" id="chat-panel">
        <div class="chat-empty">
          <div class="empty-state">
            <div class="empty-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>
            </div>
            <strong>Selecione uma conversa</strong>
            <p>Escolha um lead à esquerda para ver as mensagens.</p>
          </div>
        </div>
      </article>
    </section>
  `
}

export async function setup(root) {
  let conversations
  let hotQueue = []
  try {
    conversations = await ConversationService.list()
    hotQueue = await ConversationService.hotQueue()
  } catch {
    root.querySelector('#conv-list').innerHTML = `<div style="padding:16px">${emptyState('Erro ao carregar conversas')}</div>`
    return
  }

  const list = root.querySelector('#conv-list')

  if (conversations.length === 0) {
    list.innerHTML = `<div style="padding:16px">${emptyState('Nenhuma resposta ainda', 'Inicie uma campanha para começar.')}</div>`
    return
  }

  const normalizePhone = value => String(value || '').replace(/\D/g, '')
  const hotPhones = new Set((hotQueue || []).map(item => normalizePhone(item.phone)))

  const hotSection = (hotQueue || []).length
    ? `
      <div style="padding:10px 12px;border:1px solid #f59e0b33;background:#f59e0b10;border-radius:12px;margin-bottom:10px">
        <strong style="font-size:12px;color:#b45309">Fila quente (${hotQueue.length})</strong>
        <div style="margin-top:6px;display:grid;gap:6px">
          ${hotQueue.slice(0, 5).map(item => `
            <div style="font-size:11px;color:var(--text-2)">
              <strong>${item.lead_name || item.phone}</strong>
              <span style="color:var(--text-3)"> · score ${Number(item.score || 0)}${item.reason ? ` · ${item.reason}` : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : ''

  list.innerHTML = `${hotSection}${conversations.map(c => {
    const isHotQueue = Boolean(c.is_hot_queue || hotPhones.has(normalizePhone(c.phone)))
    return `
    <button class="conversation${c.id === activeConvId ? ' active' : ''}" data-id="${c.id}">
      <strong>${c.lead}</strong>
      <span>${c.mood}${c.score ? ` · score ${c.score}` : ''}${isHotQueue ? ' · fila quente' : ''} · ${c.time}</span>
      <span style="font-size:11px;color:var(--text-3)">${c.agent_active === false ? 'Humano' : 'Agente ativo'}${c.score_reason ? ` · ${c.score_reason}` : ''}</span>
    </button>
  `
  }).join('')}`

  list.querySelectorAll('.conversation').forEach(btn => {
    btn.addEventListener('click', () => {
      list.querySelectorAll('.conversation').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      activeConvId = btn.dataset.id
      const conv = conversations.find(c => String(c.id) === String(activeConvId))
      renderChat(root, conv, conversations)
    })
  })

  // Se vier filtro de telefone da tela de detalhe da campanha, tenta abrir essa conversa
  const filterPhone = window.__inboxFilterPhone || null
  window.__inboxFilterPhone = null
  if (filterPhone) {
    const normalize = p => String(p || '').replace(/\D/g, '').slice(-11)
    const target = conversations.find(c =>
      normalize(c.phone) === normalize(filterPhone) ||
      normalize(c.lead)  === normalize(filterPhone),
    )
    if (target) {
      const targetBtn = list.querySelector(`.conversation[data-id="${target.id}"]`)
      if (targetBtn) { targetBtn.click(); return }
    }
  }

  // Auto-open active or first conversation
  if (conversations.length > 0) {
    const preferred = conversations.find(c => String(c.id) === String(activeConvId)) || conversations[0]
    activeConvId = preferred.id
    const selectedBtn = list.querySelector(`.conversation[data-id="${preferred.id}"]`) || list.querySelector('.conversation')
    if (selectedBtn) selectedBtn.classList.add('active')
    renderChat(root, preferred, conversations)
  }
}

function renderChat(root, conv, conversations) {
  const panel = root.querySelector('#chat-panel')

  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>${conv.lead}</h2>
        <p class="muted" style="margin:4px 0 0;font-size:12px">${conv.phone || ''}</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${badge(conv.mood)}
        <span style="font-size:11px;color:var(--text-3)">score ${conv.score || 0}</span>
        <span class="badge-neutral" style="font-size:10px">${conv.agent_active === false ? 'handoff humano' : 'agente ativo'}</span>
        ${conv.is_hot_queue ? '<span class="badge-warning" style="font-size:10px">fila quente</span>' : ''}
      </div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px">
      <button class="secondary" id="assume-human-btn" style="font-size:11px;padding:6px 10px">Assumir humano</button>
      <button class="secondary" id="reactivate-agent-btn" style="font-size:11px;padding:6px 10px">Reativar agente</button>
      <button class="secondary" id="resolve-hot-btn" style="font-size:11px;padding:6px 10px">Resolver quente</button>
    </div>
    
    <div class="panel" style="margin:0 0 12px;background:var(--surface-2);border:1px solid var(--border);padding:12px">
      <div id="classification-panel" style="display:grid;gap:8px;font-size:12px">
        <div style="text-align:center;padding:16px"><div class="skeleton" style="height:20px;width:40%;margin:0 auto;animation-delay:0ms"></div></div>
      </div>
    </div>
    
    <div class="chat-messages" id="chat-messages">
      ${conv.messages.map(m => `
        <div class="bubble ${m.dir === 'out' ? 'outbound' : 'inbound'}">
          ${m.text}
          <span class="bubble-time">${m.time}</span>
        </div>
      `).join('')}
    </div>
    <div class="reply-area">
      <textarea id="reply-input" class="reply-textarea" placeholder="Digite sua resposta..." rows="2"></textarea>
      <div class="reply-actions">
        <button class="secondary" id="template-btn">Usar template</button>
        <button class="primary" id="send-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          Enviar
        </button>
      </div>
    </div>
  `

  // Scroll to bottom
  const msgs = panel.querySelector('#chat-messages')
  msgs.scrollTop = msgs.scrollHeight

  // Classificação de resposta
  loadClassification(root, conv)

  const controlRef = conv.conversation_id || conv.phone || conv.id
  const bindControl = (id, mode, message) => {
    const btn = panel.querySelector(id)
    if (!btn) return
    btn.addEventListener('click', async () => {
      btn.disabled = true
      try {
        await ConversationService.setAgentMode(controlRef, mode)
        toast(message, 'success')
        await setup(root)
      } catch {
        toast('Falha ao atualizar modo da conversa.', 'error')
      } finally {
        btn.disabled = false
      }
    })
  }
  bindControl('#assume-human-btn', 'human', 'Conversa passada para atendimento humano.')
  bindControl('#reactivate-agent-btn', 'agent', 'Agente reativado na conversa.')
  bindControl('#resolve-hot-btn', 'resolved', 'Conversa removida da fila quente.')

  // Send message
  const input = panel.querySelector('#reply-input')
  const sendBtn = panel.querySelector('#send-btn')

  const sendMessage = async () => {
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    sendBtn.disabled = true

    try {
      const msg = await ConversationService.send(conv.id, text)
      // Update local conversation
      conv.messages.push(msg)
      // Re-render messages
      msgs.innerHTML = conv.messages.map(m => `
        <div class="bubble ${m.dir === 'out' ? 'outbound' : 'inbound'}">
          ${m.text}
          <span class="bubble-time">${m.time}</span>
        </div>
      `).join('')
      msgs.scrollTop = msgs.scrollHeight
    } catch {
      toast('Falha ao enviar mensagem.', 'error')
    } finally {
      sendBtn.disabled = false
      input.focus()
    }
  }

  sendBtn.addEventListener('click', sendMessage)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMessage()
  })

  // Template button
  panel.querySelector('#template-btn').addEventListener('click', () => {
    input.value = 'Posso fazer um diagnóstico gratuito da presença digital — sem compromisso. Tem 15 minutos?'
    input.focus()
  })
}
