import { badge, emptyState } from '../components.js'
import { ConversationService } from '../services.js'
import { toast } from '../toast.js'

let activeConvId = null

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
  try {
    conversations = await ConversationService.list()
  } catch {
    root.querySelector('#conv-list').innerHTML = `<div style="padding:16px">${emptyState('Erro ao carregar conversas')}</div>`
    return
  }

  const list = root.querySelector('#conv-list')

  if (conversations.length === 0) {
    list.innerHTML = `<div style="padding:16px">${emptyState('Nenhuma resposta ainda', 'Inicie uma campanha para começar.')}</div>`
    return
  }

  list.innerHTML = conversations.map(c => `
    <button class="conversation${c.id === activeConvId ? ' active' : ''}" data-id="${c.id}">
      <strong>${c.lead}</strong>
      <span>${c.mood} · ${c.time}</span>
    </button>
  `).join('')

  list.querySelectorAll('.conversation').forEach(btn => {
    btn.addEventListener('click', () => {
      list.querySelectorAll('.conversation').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      activeConvId = parseInt(btn.dataset.id)
      const conv = conversations.find(c => c.id === activeConvId)
      renderChat(root, conv, conversations)
    })
  })

  // Auto-open first conversation
  if (conversations.length > 0) {
    activeConvId = conversations[0].id
    list.querySelector('.conversation').classList.add('active')
    renderChat(root, conversations[0], conversations)
  }
}

function renderChat(root, conv, conversations) {
  const panel = root.querySelector('#chat-panel')

  panel.innerHTML = `
    <div class="panel-head">
      <h2>${conv.lead}</h2>
      ${badge(conv.mood)}
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

  // Template button — quick-insert first template text
  panel.querySelector('#template-btn').addEventListener('click', () => {
    input.value = 'Posso fazer um diagnóstico gratuito da presença digital — sem compromisso. Tem 15 minutos?'
    input.focus()
  })
}
