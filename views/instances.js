import QRCode from 'qrcode'
import { badge, emptyState, skeletonCards } from '../components.js'
import { WhatsAppInstanceService } from '../services.js'
import { toast } from '../toast.js'

let instances = []
let selectedInstance = ''
let qrData = null
let qrImage = null
let connectionState = null
let statusTimer = null
let qrExpiresAt = null
let recentMessages = []

function instanceName(instance) {
  return instance?.name || instance?.instanceName || instance?.instance?.instanceName || ''
}

function statusLabel(instance) {
  return instance?.connectionStatus || instance?.status || instance?.instance?.state || instance?.instance?.status || 'desconhecido'
}

function selectedName() {
  return selectedInstance || instanceName(instances[0]) || 'whatsapp_01'
}

function slugName(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_ -]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function qrPayload(data) {
  return data?.qrcode?.code || data?.code || data?.qr?.code || data?.pairingCode || data?.qr || null
}

async function prepareQrImage(data) {
  qrImage = data?.qrImage || data?.qrcode?.base64 || data?.base64 || null
  const payload = qrPayload(data)

  if (!qrImage && payload && typeof payload === 'string') {
    qrImage = await QRCode.toDataURL(payload, {
      width: 320,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
  }

  qrExpiresAt = qrImage ? Date.now() + 45_000 : null
}

function renderInstancesList() {
  if (!instances.length) {
    return emptyState(
      'Nenhuma instancia encontrada',
      'Crie uma conexao WhatsApp e gere o QR Code por aqui.',
    )
  }

  return instances.map(instance => {
    const name = instanceName(instance)
    const active = name === selectedName() ? 'active' : ''
    return `
      <button class="instance-row ${active}" type="button" data-instance="${name}">
        <div>
          <strong>${name}</strong>
          <span>${instance?.number || instance?.owner || instance?.profileName || 'Aguardando conexao'}</span>
        </div>
        ${badge(statusLabel(instance))}
      </button>
    `
  }).join('')
}

function renderQrPanel() {
  if (connectionState === 'open') {
    return `
      <div class="qr-placeholder connected-state">
        <strong>WhatsApp conectado</strong>
        <p>A instancia ${selectedName()} esta pronta para envio e recebimento.</p>
      </div>
    `
  }

  if (!qrData) {
    return `
      <div class="qr-placeholder">
        <strong>QR Code ainda nao carregado</strong>
        <p>Selecione uma instancia e clique em Gerar QR Code.</p>
      </div>
    `
  }

  if (qrImage) {
    const remaining = qrExpiresAt ? Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000)) : 0
    return `
      <div class="qr-box">
        <img src="${qrImage}" alt="QR Code para conectar WhatsApp" />
        <p>Abra o WhatsApp no celular, va em Aparelhos conectados e escaneie este QR Code.</p>
        <small class="qr-timer">Expira em aproximadamente ${remaining}s</small>
      </div>
    `
  }

  if (qrData.count === 0) {
    return `
      <div class="qr-placeholder">
        <strong>A Evolution ainda nao gerou o QR Code</strong>
        <p>Use Recriar limpa ou crie uma nova instancia com outro nome.</p>
      </div>
    `
  }

  return `
    <div class="qr-code-text">
      <strong>Retorno da Evolution</strong>
      <pre>${JSON.stringify(qrData, null, 2)}</pre>
    </div>
  `
}

function renderRecentMessages() {
  if (!recentMessages.length) {
    return `
      <div class="empty-state compact-empty">
        <strong>Nenhum envio registrado</strong>
        <p>Envie uma mensagem de teste para criar o primeiro registro real no Supabase.</p>
      </div>
    `
  }

  return `
    <div class="message-history">
      ${recentMessages.map(message => `
        <div class="message-history-item">
          <div>
            <strong>${message.phone || 'sem telefone'}</strong>
            <span>${message.status}</span>
          </div>
          <p>${message.body || ''}</p>
          <small>${new Date(message.sent_at || message.created_at).toLocaleString('pt-BR')}</small>
        </div>
      `).join('')}
    </div>
  `
}

function renderState(root) {
  selectedInstance = selectedName()
  root.querySelector('.instances-list').innerHTML = renderInstancesList()
  root.querySelector('.qr-panel').innerHTML = renderQrPanel()
  root.querySelector('.message-history-wrap').innerHTML = renderRecentMessages()
  root.querySelector('.selected-instance').textContent = selectedInstance
  root.querySelector('.connection-state').textContent = connectionState || 'nao consultado'
  bindActions(root)
}

async function loadMessages(root) {
  try {
    const data = await WhatsAppInstanceService.listMessages()
    recentMessages = Array.isArray(data) ? data : []
    root.querySelector('.message-history-wrap').innerHTML = renderRecentMessages()
  } catch (error) {
    toast(error.message, 'error')
  }
}

async function loadInstances(root) {
  root.querySelector('.instances-list').innerHTML = skeletonCards(2)
  try {
    const data = await WhatsAppInstanceService.list()
    instances = Array.isArray(data) ? data : data.instances || data.data || []
    selectedInstance = selectedName()
    renderState(root)
  } catch (error) {
    root.querySelector('.instances-list').innerHTML = emptyState(
      'Nao foi possivel listar instancias',
      error.message,
      '<button class="secondary refresh-btn" type="button">Tentar novamente</button>',
    )
    toast(error.message, 'error')
    bindActions(root)
  }
}

async function refreshStatus(root, silent = false) {
  if (!selectedName()) return
  try {
    const data = await WhatsAppInstanceService.state(selectedName())
    connectionState = data?.instance?.state || data?.state || 'desconhecido'
    if (!silent) toast(`Estado: ${connectionState}`, 'info')
    renderState(root)
    if (connectionState === 'open') stopPolling()
  } catch (error) {
    if (!silent) toast(error.message, 'error')
  }
}

function startPolling(root) {
  stopPolling()
  statusTimer = window.setInterval(() => {
    refreshStatus(root, true)
    if (qrExpiresAt && Date.now() > qrExpiresAt) {
      stopPolling()
      renderState(root)
      toast('QR Code expirou. Gere um novo.', 'warning')
    }
  }, 5000)
}

function stopPolling() {
  if (statusTimer) window.clearInterval(statusTimer)
  statusTimer = null
}

function creationPayload(root) {
  const form = root.querySelector('.instance-form')
  const data = new FormData(form)
  return {
    instanceName: slugName(String(data.get('instanceName') || '')) || 'whatsapp_01',
    groupsIgnore: data.get('groupsIgnore') === 'on',
    readMessages: data.get('readMessages') === 'on',
    readStatus: data.get('readStatus') === 'on',
    syncFullHistory: data.get('syncFullHistory') === 'on',
    alwaysOnline: data.get('alwaysOnline') === 'on',
    rejectCall: data.get('rejectCall') === 'on',
  }
}

async function createInstance(root, payload) {
  await WhatsAppInstanceService.create(payload)
  selectedInstance = payload.instanceName
  qrData = null
  qrImage = null
  connectionState = 'connecting'
  await loadInstances(root)
}

function bindActions(root) {
  root.querySelectorAll('.instance-row').forEach(button => {
    button.addEventListener('click', () => {
      selectedInstance = button.dataset.instance
      qrData = null
      qrImage = null
      connectionState = null
      stopPolling()
      renderState(root)
      refreshStatus(root, true)
    })
  })

  root.querySelectorAll('.refresh-btn').forEach(button => {
    button.addEventListener('click', () => loadInstances(root))
  })

  root.querySelector('.instance-form')?.addEventListener('submit', async event => {
    event.preventDefault()
    const submit = event.submitter
    submit.disabled = true
    submit.textContent = 'Criando...'
    try {
      const payload = creationPayload(root)
      await createInstance(root, payload)
      toast(`Instancia ${payload.instanceName} criada.`)
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      submit.disabled = false
      submit.textContent = 'Criar instancia'
    }
  })

  const connect = root.querySelector('.connect-btn')
  connect?.addEventListener('click', async () => {
    connect.disabled = true
    connect.textContent = 'Gerando...'
    try {
      qrData = await WhatsAppInstanceService.connect(selectedName())
      await prepareQrImage(qrData)
      connectionState = 'connecting'
      renderState(root)
      startPolling(root)
      toast(qrImage ? 'QR Code gerado. Vou acompanhar o status automaticamente.' : 'Evolution respondeu sem imagem de QR.', qrImage ? 'success' : 'warning')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      connect.disabled = false
      connect.textContent = 'Gerar QR Code'
    }
  })

  root.querySelector('.state-btn')?.addEventListener('click', () => refreshStatus(root))

  root.querySelector('.restart-btn')?.addEventListener('click', async event => {
    const button = event.currentTarget
    button.disabled = true
    button.textContent = 'Reiniciando...'
    try {
      await WhatsAppInstanceService.restart(selectedName())
      qrData = null
      qrImage = null
      connectionState = 'reiniciando'
      renderState(root)
      startPolling(root)
      toast('Instancia reiniciada.', 'info')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      button.disabled = false
      button.textContent = 'Reiniciar'
    }
  })

  root.querySelector('.logout-btn')?.addEventListener('click', async event => {
    if (!window.confirm(`Desconectar ${selectedName()} do WhatsApp?`)) return
    const button = event.currentTarget
    button.disabled = true
    try {
      await WhatsAppInstanceService.logout(selectedName())
      qrData = null
      qrImage = null
      connectionState = 'close'
      renderState(root)
      toast('Logout enviado para a instancia.', 'info')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      button.disabled = false
    }
  })

  root.querySelector('.delete-btn')?.addEventListener('click', async event => {
    if (!window.confirm(`Deletar a instancia ${selectedName()}?`)) return
    const button = event.currentTarget
    button.disabled = true
    try {
      await WhatsAppInstanceService.delete(selectedName())
      qrData = null
      qrImage = null
      connectionState = null
      selectedInstance = ''
      stopPolling()
      await loadInstances(root)
      toast('Instancia deletada.')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      button.disabled = false
    }
  })

  root.querySelector('.recreate-btn')?.addEventListener('click', async event => {
    if (!window.confirm(`Recriar ${selectedName()} do zero?`)) return
    const button = event.currentTarget
    button.disabled = true
    button.textContent = 'Recriando...'
    try {
      const payload = creationPayload(root)
      payload.instanceName = selectedName()
      await WhatsAppInstanceService.delete(selectedName()).catch(() => null)
      await createInstance(root, payload)
      qrData = await WhatsAppInstanceService.connect(selectedName())
      await prepareQrImage(qrData)
      renderState(root)
      startPolling(root)
      toast('Instancia recriada limpa.')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      button.disabled = false
      button.textContent = 'Recriar limpa'
    }
  })

  root.querySelector('.send-test-form')?.addEventListener('submit', async event => {
    event.preventDefault()
    const btn = event.currentTarget.querySelector('.send-test-btn')
    const number = event.currentTarget.querySelector('[name="send-number"]').value.trim()
    const text   = event.currentTarget.querySelector('[name="send-text"]').value.trim()
    if (!number) { toast('Informe o numero destino.', 'warning'); return }
    if (!text)   { toast('Informe a mensagem.', 'warning'); return }
    btn.disabled = true
    btn.textContent = 'Enviando...'
    try {
      await WhatsAppInstanceService.sendText(selectedName(), { number, text })
      toast('Mensagem enviada com sucesso.', 'success')
      event.currentTarget.querySelector('[name="send-text"]').value = ''
      await loadMessages(root)
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Enviar mensagem'
    }
  })
}

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Evolution API</p>
        <h1>Instancias WhatsApp</h1>
      </div>
      <button class="secondary refresh-btn" type="button">Atualizar</button>
    </section>

    <section class="instances-layout">
      <article class="panel">
        <div class="panel-head">
          <h2>Nova instancia</h2>
          ${badge('Baileys')}
        </div>
        <form class="instance-form">
          <label>Nome da instancia
            <input name="instanceName" value="whatsapp_02" autocomplete="off" />
          </label>
          <div class="checkbox-grid">
            <label><input type="checkbox" name="groupsIgnore" checked /> Ignorar grupos</label>
            <label><input type="checkbox" name="rejectCall" checked /> Rejeitar chamadas</label>
            <label><input type="checkbox" name="readMessages" /> Marcar mensagens como lidas</label>
            <label><input type="checkbox" name="readStatus" /> Ler status</label>
            <label><input type="checkbox" name="syncFullHistory" /> Sincronizar historico</label>
            <label><input type="checkbox" name="alwaysOnline" /> Sempre online</label>
          </div>
          <button class="primary" type="submit">Criar instancia</button>
        </form>

        <div class="panel-head compact-head">
          <h2>Conexoes</h2>
        </div>
        <div class="instances-list">
          ${skeletonCards(2)}
        </div>
      </article>

      <article class="panel">
        <div class="panel-head">
          <div>
            <h2>Gerenciar <span class="selected-instance">${selectedName()}</span></h2>
            <p class="panel-copy">Estado: <strong class="connection-state">${connectionState || 'nao consultado'}</strong></p>
          </div>
          <div class="filters">
            <button class="secondary state-btn" type="button">Ver status</button>
            <button class="secondary restart-btn" type="button">Reiniciar</button>
            <button class="secondary logout-btn" type="button">Logout</button>
            <button class="secondary recreate-btn" type="button">Recriar limpa</button>
            <button class="secondary delete-btn" type="button">Deletar</button>
            <button class="primary connect-btn" type="button">Gerar QR Code</button>
          </div>
        </div>
        <div class="qr-panel">
          ${renderQrPanel()}
        </div>

        <div class="panel-head compact-head">
          <h2>Teste de envio</h2>
        </div>
        <form class="send-test-form" autocomplete="off">
          <label>Número destino
            <input name="send-number" placeholder="55 31 99999-9999" />
          </label>
          <label>Mensagem
            <textarea name="send-text" rows="3" placeholder="Digite a mensagem de teste..."></textarea>
          </label>
          <button class="primary send-test-btn" type="submit">Enviar mensagem</button>
        </form>

        <div class="panel-head compact-head">
          <h2>Historico real</h2>
          <button class="secondary refresh-messages-btn" type="button">Atualizar</button>
        </div>
        <div class="message-history-wrap">
          ${renderRecentMessages()}
        </div>
      </article>
    </section>
  `
}

export async function setup(root) {
  bindActions(root)
  await loadInstances(root)
  await refreshStatus(root, true)
  await loadMessages(root)
  root.querySelector('.refresh-messages-btn')?.addEventListener('click', () => loadMessages(root))
}
