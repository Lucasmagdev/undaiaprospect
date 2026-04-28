import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { URL } from 'node:url'

function loadEnvFile(file) {
  if (!existsSync(file)) return

  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...valueParts] = trimmed.split('=')
    if (!process.env[key]) process.env[key] = valueParts.join('=')
  }
}

loadEnvFile('.env')
loadEnvFile('.env.local')

const PORT = Number(process.env.PORT || 3001)
const EVOLUTION_URL = process.env.EVOLUTION_URL || 'https://evolution.botcruzeiro.space'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || ''
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://127.0.0.1:5173',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => {
      body += chunk
      if (body.length > 1_000_000) {
        req.destroy()
        reject(new Error('Payload muito grande'))
      }
    })
    req.on('end', () => {
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('JSON invalido'))
      }
    })
    req.on('error', reject)
  })
}

async function evolutionRequest(path, options = {}) {
  if (!EVOLUTION_API_KEY) {
    return {
      ok: false,
      status: 500,
      data: { message: 'EVOLUTION_API_KEY nao configurada no backend.' },
    }
  }

  const response = await fetch(`${EVOLUTION_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let data = text
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }

  return { ok: response.ok, status: response.status, data }
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      status: 500,
      data: { message: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurada no backend.' },
    }
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let data = text
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { raw: text }
  }

  return { ok: response.ok, status: response.status, data }
}

function normalizePhone(value) {
  return String(value || '').replace(/[\s+\-().]/g, '')
}

function instanceRecord(instance, overrides = {}) {
  const name = instance?.name || instance?.instanceName || instance?.instance?.instanceName || overrides.evolution_instance_name
  return {
    evolution_instance_name: name,
    evolution_instance_id: instance?.id || instance?.instanceId || instance?.instance?.instanceId || overrides.evolution_instance_id || null,
    display_name: instance?.profileName || instance?.displayName || overrides.display_name || null,
    phone: normalizePhone(instance?.number || instance?.ownerJid || overrides.phone || '').replace(/@.*/, '') || null,
    status: instance?.connectionStatus || instance?.status || instance?.instance?.status || overrides.status || 'created',
    integration: instance?.integration || instance?.instance?.integration || overrides.integration || 'WHATSAPP-BAILEYS',
    last_connected_at: (instance?.connectionStatus === 'open' || overrides.status === 'open') ? new Date().toISOString() : null,
    last_seen_at: new Date().toISOString(),
    settings: instance?.Setting || instance?.settings || overrides.settings || {},
  }
}

async function upsertWhatsappInstance(instance, overrides = {}) {
  const record = instanceRecord(instance, overrides)
  if (!record.evolution_instance_name) return null

  const result = await supabaseRequest('/whatsapp_instances?on_conflict=evolution_instance_name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(record),
  })

  return result.ok ? result.data?.[0] : null
}

async function findWhatsappInstance(instanceName) {
  const result = await supabaseRequest(`/whatsapp_instances?evolution_instance_name=eq.${encodeURIComponent(instanceName)}&select=id,evolution_instance_name,sent_today&limit=1`)
  return result.ok && Array.isArray(result.data) ? result.data[0] : null
}

async function insertMessage(record) {
  const result = await supabaseRequest('/messages', {
    method: 'POST',
    body: JSON.stringify(record),
  })
  return result.ok ? result.data?.[0] : null
}

async function incrementInstanceSentToday(instanceId, currentValue = 0) {
  if (!instanceId) return null
  return supabaseRequest(`/whatsapp_instances?id=eq.${encodeURIComponent(instanceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sent_today: Number(currentValue || 0) + 1, last_seen_at: new Date().toISOString() }),
  })
}

function normalizeQrCode(data) {
  const qr = data?.qrcode || data?.base64 || data?.code || data?.pairingCode || null
  const base64 =
    data?.qrcode?.base64 ||
    data?.qrcode?.image ||
    data?.base64 ||
    data?.qrCode ||
    null

  return {
    ...data,
    qr,
    qrImage: base64 && String(base64).startsWith('data:')
      ? base64
      : base64
        ? `data:image/png;base64,${base64}`
        : null,
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {})

  if (url.pathname === '/api/health') {
    const result = await evolutionRequest('/')
    return sendJson(res, result.status, result.data)
  }

  if (url.pathname === '/api/db/health' && req.method === 'GET') {
    const result = await supabaseRequest('/whatsapp_instances?select=id&limit=1')
    if (!result.ok) {
      return sendJson(res, result.status, {
        status: 'error',
        table: 'whatsapp_instances',
        details: result.data,
      })
    }

    return sendJson(res, 200, {
      status: 'ok',
      supabaseUrl: SUPABASE_URL,
      table: 'whatsapp_instances',
      rowsChecked: Array.isArray(result.data) ? result.data.length : 0,
    })
  }

  if (url.pathname === '/api/whatsapp/instances' && req.method === 'GET') {
    const result = await evolutionRequest('/instance/fetchInstances')
    if (result.ok && Array.isArray(result.data)) {
      await Promise.all(result.data.map(instance => upsertWhatsappInstance(instance)))
    }
    return sendJson(res, result.status, result.data)
  }

  if (url.pathname === '/api/whatsapp/instances' && req.method === 'POST') {
    const body = await readBody(req)
    const instanceName = body.instanceName || 'whatsapp_01'
    const result = await evolutionRequest('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        groupsIgnore: Boolean(body.groupsIgnore),
        readMessages: Boolean(body.readMessages),
        readStatus: Boolean(body.readStatus),
        syncFullHistory: Boolean(body.syncFullHistory),
        alwaysOnline: Boolean(body.alwaysOnline),
        rejectCall: Boolean(body.rejectCall),
        msgCall: body.msgCall || '',
      }),
    })
    if (result.ok) {
      await upsertWhatsappInstance(result.data, {
        evolution_instance_name: instanceName,
        status: result.data?.instance?.status || 'connecting',
        settings: result.data?.settings || {},
      })
    }
    return sendJson(res, result.status, result.data)
  }

  const connectMatch = url.pathname.match(/^\/api\/whatsapp\/instances\/([^/]+)\/connect$/)
  if (connectMatch && req.method === 'GET') {
    const instanceName = encodeURIComponent(connectMatch[1])
    const result = await evolutionRequest(`/instance/connect/${instanceName}`)
    return sendJson(res, result.status, normalizeQrCode(result.data))
  }

  const stateMatch = url.pathname.match(/^\/api\/whatsapp\/instances\/([^/]+)\/state$/)
  if (stateMatch && req.method === 'GET') {
    const instanceName = stateMatch[1]
    const result = await evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceName)}`)
    if (result.ok) {
      const state = result.data?.instance?.state || result.data?.state || 'created'
      await upsertWhatsappInstance(null, { evolution_instance_name: instanceName, status: state })
    }
    return sendJson(res, result.status, result.data)
  }

  if (url.pathname === '/api/whatsapp/messages' && req.method === 'GET') {
    const result = await supabaseRequest('/messages?select=id,direction,phone,body,status,error_message,sent_at,received_at,created_at&order=created_at.desc&limit=25')
    return sendJson(res, result.status, result.data)
  }

  const restartMatch = url.pathname.match(/^\/api\/whatsapp\/instances\/([^/]+)\/restart$/)
  if (restartMatch && req.method === 'POST') {
    const instanceName = encodeURIComponent(restartMatch[1])
    const result = await evolutionRequest(`/instance/restart/${instanceName}`, { method: 'PUT' })
    return sendJson(res, result.status, result.data)
  }

  const logoutMatch = url.pathname.match(/^\/api\/whatsapp\/instances\/([^/]+)\/logout$/)
  if (logoutMatch && req.method === 'POST') {
    const instanceName = encodeURIComponent(logoutMatch[1])
    const result = await evolutionRequest(`/instance/logout/${instanceName}`, { method: 'DELETE' })
    return sendJson(res, result.status, result.data)
  }

  const sendTextMatch = url.pathname.match(/^\/api\/whatsapp\/instances\/([^/]+)\/send-text$/)
  if (sendTextMatch && req.method === 'POST') {
    const instanceName = sendTextMatch[1]
    if (!instanceName) return sendJson(res, 400, { message: 'instanceName obrigatorio.' })
    const body = await readBody(req)
    if (!body.number) return sendJson(res, 400, { message: 'number obrigatorio.' })
    if (!body.text)   return sendJson(res, 400, { message: 'text obrigatorio.' })
    const number = normalizePhone(body.number)
    if (!/^\d{10,15}$/.test(number)) {
      return sendJson(res, 400, { message: 'Numero invalido. Use DDI + DDD + numero, exemplo: 5531999999999.' })
    }

    const stateResult = await evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceName)}`)
    const state = stateResult.data?.instance?.state || stateResult.data?.state
    if (state !== 'open') {
      return sendJson(res, 409, {
        message: `Instancia ${instanceName} nao esta conectada. Estado atual: ${state || 'desconhecido'}.`,
        state,
        details: stateResult.data,
      })
    }

    const instanceRecord = await findWhatsappInstance(instanceName)
    const pendingMessage = await insertMessage({
      whatsapp_instance_id: instanceRecord?.id || null,
      direction: 'outbound',
      kind: 'text',
      phone: number,
      body: body.text,
      status: 'pending',
      raw_payload: { instanceName },
    })

    const result = await evolutionRequest(`/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({ number, text: body.text }),
    })

    const providerMessageId =
      result.data?.key?.id ||
      result.data?.message?.key?.id ||
      result.data?.id ||
      null

    if (result.ok) {
      await supabaseRequest(`/messages?id=eq.${encodeURIComponent(pendingMessage?.id || '')}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'sent',
          provider_message_id: providerMessageId,
          raw_payload: result.data || {},
          sent_at: new Date().toISOString(),
        }),
      })
      await incrementInstanceSentToday(instanceRecord?.id, instanceRecord?.sent_today)
    } else {
      await supabaseRequest(`/messages?id=eq.${encodeURIComponent(pendingMessage?.id || '')}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'failed',
          error_message: result.data?.message || result.data?.error || 'Falha no envio',
          raw_payload: result.data || {},
        }),
      })
    }

    return sendJson(res, result.status, result.data)
  }

  const deleteMatch = url.pathname.match(/^\/api\/whatsapp\/instances\/([^/]+)$/)
  if (deleteMatch && req.method === 'DELETE') {
    const instanceName = encodeURIComponent(deleteMatch[1])
    const result = await evolutionRequest(`/instance/delete/${instanceName}`, { method: 'DELETE' })
    return sendJson(res, result.status, result.data)
  }

  return sendJson(res, 404, { message: 'Rota nao encontrada.' })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (!url.pathname.startsWith('/api/')) {
      return sendJson(res, 404, { message: 'Use as rotas /api.' })
    }
    await handleApi(req, res, url)
  } catch (error) {
    sendJson(res, 500, { message: error.message || 'Erro interno.' })
  }
})

server.listen(PORT, () => {
  console.log(`API proxy rodando em http://127.0.0.1:${PORT}`)
})
