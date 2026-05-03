import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'

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
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY || ''
const YELP_API_KEY = process.env.YELP_API_KEY || ''
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || ''
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY || ''
const HERE_API_KEY = process.env.HERE_API_KEY || ''
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || ''
const TTS_SERVER_URL = (process.env.TTS_SERVER_URL || '').replace(/\/$/, '')
const TTS_VOICE = process.env.TTS_VOICE || 'pf_dora'
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const HOT_LEAD_SCORE = Number(process.env.HOT_LEAD_SCORE || 70)
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile'
const GROQ_COPY_REVIEW = process.env.GROQ_COPY_REVIEW !== 'false'
const LEAD_AGENT_MAX_SENDS_PER_DAY_SOFT = Number(process.env.LEAD_AGENT_MAX_SENDS_PER_DAY_SOFT || 20)

const ALLOWED_ORIGINS = new Set([
  process.env.CORS_ORIGIN || 'http://127.0.0.1:5173',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
])

function _sendJson(res, status, data, reqOrigin) {
  const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : (process.env.CORS_ORIGIN || 'http://127.0.0.1:5173')
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function detectListeningPid(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
      const line = out
        .split(/\r?\n/)
        .map(value => value.trim())
        .find(value => value && /LISTENING/i.test(value) && new RegExp(`:${port}\\s`).test(value))
      if (!line) return null
      const parts = line.split(/\s+/)
      const pid = Number(parts[parts.length - 1])
      return Number.isFinite(pid) ? pid : null
    }
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const pid = Number(out.split(/\r?\n/)[0])
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
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

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function normalizePhone(value) {
  const raw = String(value || '')
  const candidates = raw
    .split(/[;,/|]/)
    .map(part => part.replace(/\D/g, ''))
    .filter(part => /^\d{10,15}$/.test(part))
  if (candidates.length) return candidates[0]
  return raw.replace(/\D/g, '')
}

// Returns 'mobile', 'landline', or 'unknown' based on Brazilian DDD rules.
// Mobile: DDD (2) + 9XXXXXXXX (9 digits starting with 9) = 11 digits
// Landline: DDD (2) + 8 digits = 10 digits
function classifyBrazilianPhone(digits) {
  let d = String(digits || '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11 && d[2] === '9') return 'mobile'
  if (d.length === 10) return 'landline'
  if (d.length === 11) return 'landline'
  return 'unknown'
}

const SOURCE_PRIORITY = { cnpj: 6, guiamais: 5, apontador: 4, foursquare: 3, google_places: 3, overpass: 2, import: 1, manual: 1 }

function uniq(values) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeLeadSourceList(lead = {}) {
  return uniq([...(Array.isArray(lead.sources) ? lead.sources : []), lead.source])
}

function sourceRank(source) {
  return SOURCE_PRIORITY[source] || 0
}

function sourceListRank(sources = []) {
  return Math.max(0, ...sources.map(sourceRank))
}

function bestLeadSource(a, b) {
  return sourceRank(b) > sourceRank(a) ? b : a
}

function discoveryQuality(lead = {}) {
  const phoneType = classifyBrazilianPhone(lead.phone)
  return [
    phoneType === 'mobile' ? 50 : phoneType === 'landline' ? 20 : 0,
    lead.phone ? 25 : 0,
    lead.cnpj ? 20 : 0,
    lead.website ? 8 : 0,
    lead.email ? 5 : 0,
    sourceListRank(normalizeLeadSourceList(lead)),
  ].reduce((sum, n) => sum + n, 0)
}

function mergeLeadRecords(existing, incoming) {
  if (!existing) {
    const sources = normalizeLeadSourceList(incoming)
    return {
      ...incoming,
      phone: normalizePhone(incoming.phone) || null,
      cnpj: normalizePhone(incoming.cnpj) || incoming.cnpj || null,
      sources,
      source: incoming.source || sources[0] || 'import',
    }
  }

  const currentSources = normalizeLeadSourceList(existing)
  const incomingSources = normalizeLeadSourceList(incoming)
  const sources = uniq([...currentSources, ...incomingSources])
  const currentPhoneType = classifyBrazilianPhone(existing.phone)
  const incomingPhoneType = classifyBrazilianPhone(incoming.phone)
  const betterPhone =
    (!existing.phone && incoming.phone) ||
    (currentPhoneType !== 'mobile' && incomingPhoneType === 'mobile')

  return {
    ...existing,
    name: existing.name || incoming.name,
    phone: betterPhone ? normalizePhone(incoming.phone) : existing.phone,
    address: existing.address || incoming.address,
    website: existing.website || incoming.website,
    cnpj: existing.cnpj || incoming.cnpj || null,
    email: existing.email || incoming.email || null,
    lat: existing.lat || incoming.lat || null,
    lon: existing.lon || incoming.lon || null,
    city: existing.city || incoming.city,
    niche: existing.niche || incoming.niche,
    source: bestLeadSource(existing.source, incoming.source),
    sources,
  }
}

function discoveryKey(lead = {}) {
  const phone = normalizePhone(lead.phone)
  if (phone) return `phone:${phone}`
  const cnpj = normalizePhone(lead.cnpj)
  if (cnpj) return `cnpj:${cnpj}`
  const name = String(lead.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\W+/g, ' ').trim()
  const address = String(lead.address || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\W+/g, ' ').trim()
  return `name:${name}|${address}`
}

function sanitizeLike(value) {
  return String(value || '').replace(/[%*,]/g, '').trim()
}

function formatSupabaseDate(value) {
  if (!value) return null
  return new Date(value).toISOString()
}

function isMissingColumn(result) {
  return result?.data?.code === '42703'
}

function isMissingRelation(result) {
  return result?.data?.code === '42P01' || result?.data?.code === 'PGRST205'
}

function isCheckViolation(result) {
  return result?.data?.code === '23514'
}

function normalizeCampaignRecord(campaign = {}) {
  return {
    ...campaign,
    sent_count: Number(campaign.sent_count || 0),
    failed_count: Number(campaign.failed_count || 0),
    delay_min_s: Number(campaign.delay_min_s ?? campaign.delay_min_seconds ?? 30),
    delay_max_s: Number(campaign.delay_max_s ?? campaign.delay_max_seconds ?? 90),
  }
}

function campaignPatchPayload(payload = {}, compat = false) {
  const next = { ...payload }
  if (compat) {
    if ('sent_count' in next) delete next.sent_count
    if ('failed_count' in next) delete next.failed_count
    if ('neighborhood' in next) delete next.neighborhood
    if ('use_audio' in next) delete next.use_audio
    if ('delay_min_s' in next) {
      next.delay_min_seconds = next.delay_min_s
      delete next.delay_min_s
    }
    if ('delay_max_s' in next) {
      next.delay_max_seconds = next.delay_max_s
      delete next.delay_max_s
    }
  }
  return next
}

async function patchCampaign(campaignId, payload) {
  const path = `/campaigns?id=eq.${encodeURIComponent(campaignId)}`
  let result = await supabaseRequest(path, {
    method: 'PATCH',
    body: JSON.stringify(campaignPatchPayload(payload)),
  })

  if (!result.ok && isMissingColumn(result)) {
    result = await supabaseRequest(path, {
      method: 'PATCH',
      body: JSON.stringify(campaignPatchPayload(payload, true)),
    })
  }

  return result
}

async function insertLeadRecord(record) {
  const clean = {
    ...record,
    normalized_phone: normalizePhone(record.normalized_phone || record.phone) || null,
    cnpj: record.cnpj ? normalizePhone(record.cnpj) || String(record.cnpj) : null,
  }

  let result = await supabaseRequest('/leads', {
    method: 'POST',
    body: JSON.stringify(clean),
  })

  if (!result.ok && isMissingColumn(result)) {
    const compat = { ...clean }
    delete compat.cnpj
    delete compat.email
    delete compat.raw_payload
    result = await supabaseRequest('/leads', {
      method: 'POST',
      body: JSON.stringify(compat),
    })
  }

  if (!result.ok && isCheckViolation(result)) {
    const fallback = {
      ...clean,
      source: 'import',
      raw_payload: {
        ...(clean.raw_payload || {}),
        original_source: clean.source,
      },
    }
    result = await supabaseRequest('/leads', {
      method: 'POST',
      body: JSON.stringify(fallback),
    })
    if (!result.ok && isMissingColumn(result)) {
      delete fallback.cnpj
      delete fallback.email
      delete fallback.raw_payload
      result = await supabaseRequest('/leads', {
        method: 'POST',
        body: JSON.stringify(fallback),
      })
    }
  }

  return result
}

async function createCampaignLead(record) {
  const result = await supabaseRequest('/campaign_leads', {
    method: 'POST',
    body: JSON.stringify(record),
  })
  return isMissingRelation(result) ? { ok: true, status: 200, data: [] } : result
}

async function updateCampaignLead(id, payload) {
  if (!id) return null
  const result = await supabaseRequest(`/campaign_leads?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return isMissingRelation(result) ? null : result
}

async function findCampaignLead(campaignId, leadId) {
  if (!campaignId || !leadId) return null
  const result = await supabaseRequest(`/campaign_leads?campaign_id=eq.${encodeURIComponent(campaignId)}&lead_id=eq.${encodeURIComponent(leadId)}&select=id&limit=1`)
  return result.ok && Array.isArray(result.data) ? result.data[0] : null
}

async function campaignQueueRows(campaignId) {
  const queueRes = await supabaseRequest(`/campaign_leads?campaign_id=eq.${encodeURIComponent(campaignId)}&select=status`)
  if (queueRes.ok) return queueRes.data || []
  if (!isMissingRelation(queueRes)) return []

  const msgRes = await supabaseRequest(`/messages?campaign_id=eq.${encodeURIComponent(campaignId)}&select=status`)
  if (!msgRes.ok) return []
  return (msgRes.data || []).map(message => ({
    status: message.status === 'sent' ? 'sent' : message.status === 'failed' ? 'failed' : 'pending',
  }))
}

function instanceRecord(instance, overrides = {}) {
  const name = instance?.name || instance?.instanceName || instance?.instance?.instanceName || overrides.evolution_instance_name
  const record = {
    evolution_instance_name: name,
    evolution_instance_id: instance?.id || instance?.instanceId || instance?.instance?.instanceId || overrides.evolution_instance_id || null,
    display_name: instance?.profileName || instance?.displayName || overrides.display_name || null,
    phone: normalizePhone(instance?.number || instance?.ownerJid || overrides.phone || '').replace(/@.*/, '') || null,
    status: instance?.connectionStatus || instance?.status || instance?.instance?.status || overrides.status || 'created',
    integration: instance?.integration || instance?.instance?.integration || overrides.integration || 'WHATSAPP-BAILEYS',
    last_seen_at: new Date().toISOString(),
    settings: instance?.Setting || instance?.settings || overrides.settings || {},
  }
  if (record.status === 'open') record.last_connected_at = new Date().toISOString()
  return record
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

async function findLeadByPhone(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const result = await supabaseRequest(`/leads?normalized_phone=eq.${encodeURIComponent(normalized)}&select=id,name,normalized_phone,status&limit=1`)
  return result.ok && Array.isArray(result.data) ? result.data[0] : null
}

async function findDefaultOpenInstance() {
  const result = await supabaseRequest('/whatsapp_instances?status=eq.open&select=id,evolution_instance_name,sent_today&order=last_seen_at.desc&limit=1')
  return result.ok && Array.isArray(result.data) ? result.data[0] : null
}

async function listApprovedCampaignLeads(campaign) {
  // Busca mais do que o necessário para compensar os que serão filtrados
  const requested = Math.max(1, Number(campaign.quantity_requested || 20))
  const params = [
    'select=id,name,phone,normalized_phone,niche,city,address,website,status',
    'status=eq.qualified',
    `niche=eq.${encodeURIComponent(campaign.niche)}`,
    `city=eq.${encodeURIComponent(campaign.city)}`,
    'or=(phone.not.is.null,normalized_phone.not.is.null)',
    'order=created_at.asc',
    `limit=${Math.min(requested * 3, 300)}`,
  ]
  if (campaign.neighborhood) {
    params.push(`address=ilike.*${encodeURIComponent(campaign.neighborhood)}*`)
  }
  const result = await supabaseRequest(`/leads?${params.join('&')}`)
  if (!result.ok || !Array.isArray(result.data)) return []

  let leads = result.data
    .map(lead => ({ ...lead, phone: normalizePhone(lead.phone || lead.normalized_phone) }))
    .filter(lead => /^\d{10,15}$/.test(lead.phone))
    .filter(lead => classifyBrazilianPhone(lead.phone) === 'mobile')

  // Verificação de WhatsApp via Evolution (best-effort — se falhar, usa lista como está)
  const instance = await findDefaultOpenInstance()
  if (instance && leads.length > 0) {
    const phones = leads.map(l => l.phone)
    const waCheck = await checkWhatsAppNumbers(instance.evolution_instance_name, phones)
    if (waCheck && waCheck.length > 0) {
      const waSet = new Set(
        waCheck.filter(r => r.exists).map(r => String(r.number || r.jid || '').replace(/\D/g, ''))
      )
      if (waSet.size > 0) leads = leads.filter(l => waSet.has(l.phone))
    }
  }

  return leads.slice(0, requested)
}

async function saveInboundMessage(payload) {
  const instanceName =
    payload?.instance ||
    payload?.instanceName ||
    payload?.instance?.instanceName ||
    payload?.data?.instanceName ||
    null

  const message = payload?.data?.message || payload?.message || payload?.data || payload
  const key = payload?.data?.key || message?.key || {}
  const remoteJid = key?.remoteJid || payload?.data?.remoteJid || message?.remoteJid || ''
  const phone = normalizePhone(payload?.phone || payload?.data?.number || remoteJid.replace(/@.*/, ''))
  const body =
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    payload?.data?.text ||
    payload?.text ||
    ''

  if (!phone || !body) return null

  const lead = await findLeadByPhone(phone)
  const instance = instanceName ? await findWhatsappInstance(instanceName) : null
  const saved = await insertMessage({
    lead_id: lead?.id || null,
    whatsapp_instance_id: instance?.id || null,
    direction: 'inbound',
    kind: 'text',
    phone,
    body,
    provider_message_id: key?.id || payload?.id || null,
    status: 'received',
    raw_payload: payload,
    received_at: new Date().toISOString(),
  })

  if (lead?.id) {
    await supabaseRequest(`/leads?id=eq.${encodeURIComponent(lead.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'responded', last_interaction_at: new Date().toISOString() }),
    })
  }

  return saved
}

function interpolate(template, vars) {
  return template.replace(/\{([^}]+)\}/g, (_, key) => vars[key] || `{${key}}`)
}

function speechErrorMessage(error) {
  const message = String(error?.message || error || '')
  if (message.includes('aborted') || message.includes('timeout') || error?.name === 'TimeoutError') {
    return 'Tempo limite ao gerar audio no servidor TTS.'
  }
  return message || 'Falha desconhecida no servidor TTS.'
}

async function generateSpeechResult(text, engine = 'edge', speed = 0.85, voice = '', ttsExtra = {}) {
  // TTS self-hosted (VPS) — sem fallback: se o engine falhar, retorna erro direto
  if (TTS_SERVER_URL) {
    try {
      const response = await fetch(`${TTS_SERVER_URL}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, engine, speed, voice, language: 'pt-br', ...ttsExtra }),
        signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS || 60_000)),
      })
      const data = await readJsonResponse(response)
      if (response.ok && data.audio_base64) {
        return {
          audioBase64: data.audio_base64,
          format: data.format || 'wav',
          engine: data.engine || engine,
          requestedEngine: engine,
        }
      }
      return {
        audioBase64: null,
        format: null,
        engine,
        requestedEngine: engine,
        error: speechErrorMessage({ message: data.detail || data.message || data.raw || `Engine "${engine}" nao retornou audio.` }),
      }
    } catch (error) {
      return {
        audioBase64: null,
        format: null,
        engine,
        requestedEngine: engine,
        error: speechErrorMessage(error),
      }
    }
  }

  // ElevenLabs — apenas se nenhum TTS self-hosted estiver configurado
  if (ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID) {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.2 },
        }),
        signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS || 60_000)),
      })
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        return {
          audioBase64: Buffer.from(arrayBuffer).toString('base64'),
          format: 'mp3',
          engine: 'elevenlabs',
          requestedEngine: engine,
        }
      }
      const data = await readJsonResponse(response)
      return {
        audioBase64: null,
        format: null,
        engine,
        requestedEngine: engine,
        error: data.detail || data.message || data.raw || 'ElevenLabs nao retornou audio.',
      }
    } catch (error) {
      return { audioBase64: null, format: null, engine, requestedEngine: engine, error: speechErrorMessage(error) }
    }
  }

  return {
    audioBase64: null,
    format: null,
    engine,
    requestedEngine: engine,
    error: 'TTS_SERVER_URL ou ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID nao configurados.',
  }
}

async function generateSpeech(text, engine = 'edge', speed = 0.85, voice = '', ttsExtra = {}) {
  const result = await generateSpeechResult(text, engine, speed, voice, ttsExtra)
  return result.audioBase64
}

async function sendAudioPTT(instanceName, phone, audioBase64) {
  return evolutionRequest(`/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({ number: phone, audio: audioBase64, encoding: true }),
  })
}

async function runCampaignBackground(campaignId, campaign, leads, templateBody, instance) {
  let sent = 0
  let failed = 0

  for (const lead of leads) {
    if (sent + failed >= campaign.daily_limit) break

    let leadRecord = await findLeadByPhone(lead.phone)
    if (!leadRecord) {
      const saveRes = await insertLeadRecord({
        name: lead.name,
        phone: lead.phone,
        normalized_phone: lead.phone,
        niche: lead.niche,
        city: lead.city,
        address: lead.address || null,
        website: lead.website || null,
        source: 'overpass',
        status: 'new',
      })
      leadRecord = saveRes.data?.[0] || null
    }
    if (leadRecord?.status === 'opt_out' || leadRecord?.status === 'invalid') {
      failed += 1
      continue
    }

    const clExists = await supabaseRequest(`/campaign_leads?campaign_id=eq.${encodeURIComponent(campaignId)}&lead_id=eq.${encodeURIComponent(leadRecord?.id || '')}&select=id&limit=1`)
    if (clExists.ok && clExists.data?.length) continue

    const body = interpolate(templateBody, {
      nome_empresa: lead.name,
      cidade: lead.city,
      nicho: lead.niche,
      servico: lead.niche,
    })

    const clRes = await createCampaignLead({ campaign_id: campaignId, lead_id: leadRecord?.id || null, status: 'pending', scheduled_at: new Date().toISOString() })
    const clId = clRes.data?.[0]?.id

    const useAudio = campaign.use_audio && ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID
    const msgKind = useAudio ? 'audio' : 'text'

    const msgRecord = await insertMessage({
      lead_id: leadRecord?.id || null,
      whatsapp_instance_id: instance.id,
      campaign_id: campaignId,
      direction: 'outbound',
      kind: msgKind,
      phone: lead.phone,
      body,
      status: 'pending',
      raw_payload: { instanceName: instance.evolution_instance_name, source: 'campaign' },
    })

    let result
    if (useAudio) {
      const audioBase64 = await generateSpeech(body)
      if (audioBase64) {
        result = await sendAudioPTT(instance.evolution_instance_name, lead.phone, audioBase64)
      } else {
        // ElevenLabs falhou — fallback para texto
        result = await evolutionRequest(`/message/sendText/${encodeURIComponent(instance.evolution_instance_name)}`, {
          method: 'POST',
          body: JSON.stringify({ number: lead.phone, text: body }),
        })
      }
    } else {
      result = await evolutionRequest(`/message/sendText/${encodeURIComponent(instance.evolution_instance_name)}`, {
        method: 'POST',
        body: JSON.stringify({ number: lead.phone, text: body }),
      })
    }

    const ok = result.ok
    sent += ok ? 1 : 0
    failed += ok ? 0 : 1

    const patchMsg = ok
      ? { status: 'sent', provider_message_id: result.data?.key?.id || null, sent_at: new Date().toISOString() }
      : { status: 'failed', error_message: result.data?.message || 'Falha' }

    if (msgRecord?.id) await supabaseRequest(`/messages?id=eq.${encodeURIComponent(msgRecord.id)}`, { method: 'PATCH', body: JSON.stringify(patchMsg) })
    await updateCampaignLead(clId, { status: ok ? 'sent' : 'failed', message_id: msgRecord?.id || null, sent_at: new Date().toISOString(), error: ok ? null : result.data?.message })
    if (ok) {
      await incrementInstanceSentToday(instance.id, instance.sent_today + sent - 1)
      if (leadRecord?.id) {
        await supabaseRequest(`/leads?id=eq.${encodeURIComponent(leadRecord.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'sent', last_interaction_at: new Date().toISOString() }),
        })
      }
    }

    await patchCampaign(campaignId, { sent_count: sent, failed_count: failed })

    const delay = (campaign.delay_min_s + Math.random() * (campaign.delay_max_s - campaign.delay_min_s)) * 1000
    await new Promise(r => setTimeout(r, delay))
  }

  await patchCampaign(campaignId, { status: 'finished', finished_at: new Date().toISOString(), sent_count: sent, failed_count: failed })
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

const NICHE_TAGS = {
  restaurante:   [['amenity', 'restaurant'], ['amenity', 'fast_food'], ['amenity', 'cafe'], ['shop', 'deli'], ['amenity', 'food_court'], ['amenity', 'snack_bar']],
  odontologia:   [['amenity', 'dentist'], ['healthcare', 'dentist'], ['healthcare:speciality', 'dentistry'], ['amenity', 'clinic'], ['amenity', 'hospital']],
  academia:      [['leisure', 'fitness_centre'], ['amenity', 'gym'], ['leisure', 'sports_centre'], ['leisure', 'dance'], ['leisure', 'yoga']],
  advocacia:     [['office', 'lawyer'], ['office', 'law_firm'], ['office', 'yes']],
  contabilidade: [['office', 'accountant'], ['office', 'tax_advisor'], ['office', 'financial'], ['office', 'consulting']],
  estetica:      [['shop', 'beauty'], ['amenity', 'beauty_salon'], ['amenity', 'nail_salon'], ['shop', 'cosmetics'], ['shop', 'hairdresser'], ['amenity', 'hairdresser']],
  imobiliaria:   [['shop', 'estate_agent'], ['office', 'estate_agent'], ['office', 'real_estate']],
}

// CNAEs por nicho — mesmos códigos do scripts/import-cnpj.mjs
const CNAE_MAP = {
  restaurante:   ['5611201', '5611203', '5611204', '5611205', '5612100'],
  odontologia:   ['8630504'],
  academia:      ['9313100'],
  advocacia:     ['6911701'],
  contabilidade: ['6920601', '6920602'],
  estetica:      ['9602501', '9602502', '9602503'],
  imobiliaria:   ['6810201', '6810202', '6821801', '6821802', '6822600'],
}

// Normaliza nome de cidade para bater com o formato da Receita Federal (maiúsculas, sem acento)
function normalizeCity(city) {
  return String(city || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().trim()
}

// Termos de busca em português para Foursquare/scrapers
const NICHE_TERMS = {
  restaurante:   'restaurante',
  odontologia:   'dentista clinica odontologica',
  academia:      'academia fitness',
  advocacia:     'advogado escritorio advocacia',
  contabilidade: 'contabilidade contador',
  estetica:      'estetica beleza salao',
  imobiliaria:   'imobiliaria corretor imoveis',
}

const GOOGLE_QUERY_TERMS = {
  restaurante:   ['restaurante', 'restaurante delivery', 'lanchonete', 'pizzaria', 'bar restaurante'],
  odontologia:   ['dentista', 'clinica odontologica', 'odontologia', 'implante dentario', 'ortodontista'],
  academia:      ['academia', 'studio fitness', 'crossfit', 'pilates', 'personal trainer'],
  advocacia:     ['advogado', 'escritorio de advocacia', 'advocacia empresarial', 'advogado trabalhista'],
  contabilidade: ['contador', 'escritorio de contabilidade', 'contabilidade empresarial', 'consultoria contabil'],
  estetica:      ['clinica de estetica', 'salao de beleza', 'estetica facial', 'manicure', 'depilacao'],
  imobiliaria:   ['imobiliaria', 'corretor de imoveis', 'administradora de imoveis', 'imoveis'],
}

// Cache Nominatim → { areaId, lat, lon } (evita bater na API várias vezes para mesma cidade)
const nominatimCache = new Map()

async function resolveCity(city) {
  const key = city.toLowerCase().trim()
  if (nominatimCache.has(key)) return nominatimCache.get(key)

  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ' Brasil')}&format=json&limit=5&featuretype=city`,
      { headers: { 'User-Agent': 'undaia-prospect/1.0' }, signal: AbortSignal.timeout(10_000) },
    )
    if (!r.ok) return null
    const places = await r.json()
    const place = places.find(p => p.osm_type === 'relation') || places[0]
    if (!place) return null
    const areaId = place.osm_type === 'relation'
      ? 3600000000 + parseInt(place.osm_id)
      : parseInt(place.osm_id)
    const result = { areaId, lat: parseFloat(place.lat), lon: parseFloat(place.lon) }
    nominatimCache.set(key, result)
    return result
  } catch {
    return null
  }
}

async function fetchOverpassLeads(niche, city, limit) {
  const tags = NICHE_TAGS[niche] || [['name', niche]]
  const unionParts = tags.flatMap(([k, v]) => [
    `node["${k}"="${v}"](area.a);`,
    `way["${k}"="${v}"](area.a);`,
  ]).join('')

  // Capa o limit no Overpass (cidades grandes como SP travam sem isso)
  const overpassLimit = Math.min(limit, 50)
  let query
  const cityData = await resolveCity(city)
  if (cityData?.areaId) {
    // Resolve via Nominatim → garante nome com acento correto no OSM
    query = `[out:json][timeout:25][maxsize:64000000];area(${cityData.areaId})->.a;(${unionParts});out center tags ${overpassLimit};`
  } else {
    // Fallback: busca por nome direto com admin_level BR
    query = `[out:json][timeout:25][maxsize:64000000];(area["name"="${city}"]["admin_level"="8"];area["name"="${city}"]["admin_level"="7"];)->.a;(${unionParts});out center tags ${overpassLimit};`
  }

  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': '*/*', 'User-Agent': 'undaia-prospect/1.0' },
    body: 'data=' + encodeURIComponent(query),
    signal: AbortSignal.timeout(35_000),
  })
  if (!r.ok) return []
  const raw = await r.json()
  return (raw.elements || [])
    .filter(el => el.tags?.name)
    .map(el => {
      const t = el.tags || {}
      const phone = normalizePhone(t.phone || t['contact:phone'] || t['contact:mobile'] || '')
      return {
        name: t.name || '',
        phone: phone || null,
        address: [t['addr:street'], t['addr:housenumber'], t['addr:suburb']].filter(Boolean).join(', ') || null,
        website: t.website || t['contact:website'] || null,
        niche,
        city,
        lat: el.lat || el.center?.lat || null,
        lon: el.lon || el.center?.lon || null,
        osm_id: String(el.id),
        source: 'overpass',
      }
    })
}

// Extrai todos os blocos JSON-LD de uma página HTML
function extractJsonLd(html) {
  const out = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1])
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch { /* skip malformed block */ }
  }
  return out
}

function jsonLdToLead(item, niche, city, source) {
  if (!item?.name) return null
  const type = String(item['@type'] || '').toLowerCase()
  if (!type.includes('business') && !type.includes('organization') && !type.includes('place') && !type.includes('local')) return null
  const phone = normalizePhone(item.telephone || item.phone || '')
  return {
    name: item.name,
    phone: phone || null,
    address: typeof item.address === 'string'
      ? item.address
      : [item.address?.streetAddress, item.address?.addressLocality].filter(Boolean).join(', ') || null,
    website: item.url || item.sameAs || null,
    niche,
    city,
    source,
  }
}

const SCRAPER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
}

// GuiaMais era JS-rendered (SPA) — substituído por Yelp Fusion que tem cobertura BR + telefones
async function fetchYelpLeads(niche, city, limit) {
  if (!YELP_API_KEY) return []
  const term = encodeURIComponent(NICHE_TERMS[niche] || niche)
  const location = encodeURIComponent(`${city}, Brasil`)
  try {
    const r = await fetch(
      `https://api.yelp.com/v3/businesses/search?term=${term}&location=${location}&limit=${Math.min(limit, 50)}&locale=pt_BR`,
      {
        headers: { 'Authorization': `Bearer ${YELP_API_KEY}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!r.ok) return []
    const data = await r.json()
    if (!Array.isArray(data.businesses)) return []
    return data.businesses.map(b => ({
      name: b.name || '',
      phone: b.phone ? normalizePhone(b.phone) : null,
      address: [b.location?.address1, b.location?.city].filter(Boolean).join(', ') || null,
      website: b.url || null,
      niche,
      city,
      lat: b.coordinates?.latitude || null,
      lon: b.coordinates?.longitude || null,
      source: 'yelp',
    }))
  } catch {
    return []
  }
}

async function fetchGooglePlacesLeads(niche, city, limit) {
  if (!GOOGLE_PLACES_API_KEY) return []

  const terms = uniq([
    ...(GOOGLE_QUERY_TERMS[niche] || []),
    NICHE_TERMS[niche] || niche,
    niche,
  ]).slice(0, 5)

  const placeMap = new Map()
  try {
    for (const term of terms) {
      if (placeMap.size >= Math.min(limit * 2, 60)) break
      let pageToken = ''

      for (let page = 0; page < 2; page++) {
        if (pageToken) await new Promise(resolve => setTimeout(resolve, 1800))
        const params = new URLSearchParams({
          query: `${term} em ${city}`,
          language: 'pt-BR',
          region: 'br',
          key: GOOGLE_PLACES_API_KEY,
        })
        if (pageToken) params.set('pagetoken', pageToken)

        const r = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`,
          { signal: AbortSignal.timeout(15_000) },
        )
        if (!r.ok) break
        const data = await r.json()
        if (!Array.isArray(data.results)) break

        for (const place of data.results) {
          if (place.place_id && !placeMap.has(place.place_id)) {
            placeMap.set(place.place_id, { ...place, search_term: term })
          }
        }

        pageToken = data.next_page_token || ''
        if (!pageToken || placeMap.size >= Math.min(limit * 2, 60)) break
      }
    }

    const tops = [...placeMap.values()]
      .sort((a, b) => Number(b.user_ratings_total || 0) - Number(a.user_ratings_total || 0))
      .slice(0, Math.min(limit * 2, 35))

    const detailed = await Promise.allSettled(
      tops.map(async p => {
        try {
          const dr = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&fields=place_id,name,formatted_phone_number,international_phone_number,formatted_address,website,geometry,rating,user_ratings_total,business_status,types,url&language=pt-BR&key=${GOOGLE_PLACES_API_KEY}`,
            { signal: AbortSignal.timeout(8_000) },
          )
          const dd = await dr.json()
          const d = dd.result || {}
          return {
            name: d.name || p.name || '',
            phone: normalizePhone(d.formatted_phone_number || d.international_phone_number) || null,
            address: d.formatted_address || p.formatted_address || null,
            website: d.website || null,
            niche,
            city,
            lat: d.geometry?.location?.lat || p.geometry?.location?.lat || null,
            lon: d.geometry?.location?.lng || p.geometry?.location?.lng || null,
            source: 'google_places',
            raw_payload: {
              place_id: d.place_id || p.place_id,
              rating: d.rating || p.rating || null,
              user_ratings_total: d.user_ratings_total || p.user_ratings_total || null,
              business_status: d.business_status || p.business_status || null,
              maps_url: d.url || null,
              types: d.types || p.types || [],
              search_term: p.search_term || null,
            },
          }
        } catch {
          return {
            name: p.name || '',
            phone: null,
            address: p.formatted_address || null,
            website: null,
            niche,
            city,
            lat: p.geometry?.location?.lat || null,
            lon: p.geometry?.location?.lng || null,
            source: 'google_places',
            raw_payload: {
              place_id: p.place_id || null,
              rating: p.rating || null,
              user_ratings_total: p.user_ratings_total || null,
              business_status: p.business_status || null,
              types: p.types || [],
              search_term: p.search_term || null,
            },
          }
        }
      }),
    )
    return detailed
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(lead => lead.name)
      .slice(0, limit)
  } catch {
    return []
  }
}

async function fetchFoursquareLeads(niche, city, limit) {
  if (!FOURSQUARE_API_KEY) return []
  const term = encodeURIComponent(NICHE_TERMS[niche] || niche)
  const near = encodeURIComponent(`${city}, Brazil`)
  let data
  try {
    const r = await fetch(
      `https://api.foursquare.com/v3/places/search?query=${term}&near=${near}&limit=${Math.min(limit, 50)}&fields=fsq_id,name,location,tel,website,geocodes`,
      {
        headers: { 'Authorization': FOURSQUARE_API_KEY, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    )
    data = await r.json()
  } catch {
    return []
  }
  if (!Array.isArray(data.results)) return []
  return data.results.map(p => ({
    name: p.name || '',
    phone: p.tel ? normalizePhone(p.tel) : null,
    address: [p.location?.address, p.location?.locality].filter(Boolean).join(', ') || null,
    website: p.website || null,
    niche,
    city,
    lat: p.geocodes?.main?.latitude || null,
    lon: p.geocodes?.main?.longitude || null,
    source: 'foursquare',
  }))
}

// Geoapify Places — 3.000 req/dia grátis (geoapify.com)
// Categorias OSM compatíveis com os nichos
const GEOAPIFY_CATEGORIES = {
  restaurante:   'catering.restaurant,catering.fast_food,catering.cafe',
  odontologia:   'healthcare.dentist',
  academia:      'sport.fitness,sport.gym',
  advocacia:     'office.lawyer',
  contabilidade: 'office.accountant',
  estetica:      'commercial.beauty',
  imobiliaria:   'commercial.real_estate',
}

async function fetchGeoapifyLeads(niche, city, limit) {
  if (!GEOAPIFY_API_KEY) return []
  const cityData = await resolveCity(city)
  if (!cityData?.lat) return []
  const cats = GEOAPIFY_CATEGORIES[niche]
  if (!cats) return []
  try {
    const r = await fetch(
      `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(cats)}&filter=circle:${cityData.lon},${cityData.lat},15000&limit=${Math.min(limit, 100)}&apiKey=${GEOAPIFY_API_KEY}`,
      { signal: AbortSignal.timeout(15_000) },
    )
    if (!r.ok) return []
    const data = await r.json()
    if (!Array.isArray(data.features)) return []
    return data.features.map(f => {
      const p = f.properties || {}
      return {
        name: p.name || '',
        phone: p.contact?.phone ? normalizePhone(p.contact.phone) : null,
        address: [p.address_line1, p.city].filter(Boolean).join(', ') || p.formatted || null,
        website: p.website || null,
        niche,
        city,
        lat: f.geometry?.coordinates?.[1] || null,
        lon: f.geometry?.coordinates?.[0] || null,
        source: 'geoapify',
      }
    }).filter(l => l.name)
  } catch {
    return []
  }
}

// HERE Discover — 250.000 req/mês grátis (developer.here.com)
const HERE_CATEGORIES = {
  restaurante:   '100-1000-0000',
  odontologia:   '800-8200-0163',
  academia:      '400-4100-0046',
  advocacia:     '700-7000-0298',
  contabilidade: '700-7000-0107',
  estetica:      '600-6950-0000',
  imobiliaria:   '700-7000-0110',
}

async function fetchHERELeads(niche, city, limit) {
  if (!HERE_API_KEY) return []
  const cityData = await resolveCity(city)
  if (!cityData?.lat) return []
  const term = encodeURIComponent(NICHE_TERMS[niche] || niche)
  try {
    const r = await fetch(
      `https://discover.search.hereapi.com/v1/discover?at=${cityData.lat},${cityData.lon}&q=${term}&limit=${Math.min(limit, 100)}&lang=pt-BR&apiKey=${HERE_API_KEY}`,
      { signal: AbortSignal.timeout(15_000) },
    )
    if (!r.ok) return []
    const data = await r.json()
    if (!Array.isArray(data.items)) return []
    return data.items.map(item => ({
      name: item.title || '',
      phone: item.contacts?.[0]?.phone?.[0]?.value ? normalizePhone(item.contacts[0].phone[0].value) : null,
      address: item.address?.label || null,
      website: item.contacts?.[0]?.www?.[0]?.value || null,
      niche,
      city,
      lat: item.position?.lat || null,
      lon: item.position?.lng || null,
      source: 'here',
    })).filter(l => l.name)
  } catch {
    return []
  }
}

async function fetchCNPJLeads(niche, city, limit) {
  const cnaes = CNAE_MAP[niche]
  if (!cnaes?.length) return []

  const cityNorm = normalizeCity(city)
  // PostgREST: IN operator para múltiplos CNAEs
  const cnaeIn = cnaes.join(',')
  const params = [
    'select=cnpj,nome_fantasia,cnae_principal,municipio_nome,uf,ddd1,telefone1,ddd2,telefone2,email',
    `municipio_nome=eq.${encodeURIComponent(cityNorm)}`,
    `cnae_principal=in.(${cnaeIn})`,
    'telefone1=neq.',
    'order=cnpj.asc',
    `limit=${limit}`,
  ]

  const result = await supabaseRequest(`/cnpj_empresas?${params.join('&')}`)
  if (!result.ok) {
    // Tabela não existe → loga instrução clara e retorna []
    const errCode = result.data?.code || ''
    if (errCode === 'PGRST205' || errCode === '42P01') {
      console.warn('[CNPJ] Tabela cnpj_empresas não existe. Execute o SQL em scripts/cnpj-schema.sql no Supabase e depois: node scripts/import-cnpj.mjs --file 0')
    }
    return []
  }
  if (!Array.isArray(result.data)) return []

  return result.data.map(e => {
    const rawPhone = (e.ddd1 || '') + (e.telefone1 || '')
    const rawPhone2 = (e.ddd2 || e.ddd1 || '') + (e.telefone2 || '')
    const phone = normalizePhone(rawPhone) || normalizePhone(rawPhone2) || null
    return {
      name: e.nome_fantasia || e.cnpj || '',
      phone,
      cnpj: e.cnpj || null,
      address: e.uf ? `${e.municipio_nome}, ${e.uf}` : e.municipio_nome || null,
      website: null,
      email: e.email || null,
      niche,
      city: e.municipio_nome || city,
      source: 'cnpj',
      raw_payload: { cnae_principal: e.cnae_principal, uf: e.uf },
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// PILOTO AUTOMÁTICO — análise de site + personalização com IA
// ─────────────────────────────────────────────────────────────────────────────

// Estado em memória dos jobs (perdido ao reiniciar — proposital, é ephemeral)
const autopilotJobs = new Map()
const leadAutomationAgents = new Map()
const messageQualityAudits = []

const LEAD_AGENT_DEFAULTS = {
  niche: '',
  city: '',
  instance_id: '',
  sequence_id: '',
  interval_minutes: 180,
  limit_per_term: 30,
  max_terms: 8,
  max_new_leads_per_cycle: 20,
  min_score: 45,
  auto_approve_score: 70,
  auto_send: true,
  daily_send_limit: 12,
  delay_min_s: 45,
  delay_max_s: 90,
  enable_follow_up: true,
  follow_up_after_hours: 48,
  ai_personalize: false,
}

const LEAD_NICHE_SYNONYMS = {
  odontologia: ['dentista', 'clinica odontologica', 'consultorio odontologico', 'ortodontia', 'implante dentario'],
  dentista: ['odontologia', 'clinica odontologica', 'consultorio odontologico', 'ortodontia'],
  restaurante: ['restaurante delivery', 'comida caseira', 'bistro', 'lanchonete', 'self service'],
  advocacia: ['advogado', 'escritorio de advocacia', 'consultoria juridica'],
  contabilidade: ['contador', 'escritorio contabil', 'contabilidade empresarial'],
  academia: ['studio fitness', 'crossfit', 'pilates', 'musculacao'],
  estetica: ['clinica estetica', 'harmonizacao facial', 'depilacao a laser', 'spa'],
}

function normalizeLeadAgentConfig(body = {}, currentConfig = {}) {
  return {
    ...LEAD_AGENT_DEFAULTS,
    ...currentConfig,
    niche: String(body.niche || currentConfig.niche || '').trim().toLowerCase(),
    city: String(body.city || currentConfig.city || '').trim(),
    instance_id: String(body.instance_id || currentConfig.instance_id || '').trim(),
    sequence_id: String(body.sequence_id || currentConfig.sequence_id || '').trim(),
    interval_minutes: Math.max(15, Number(body.interval_minutes || currentConfig.interval_minutes || LEAD_AGENT_DEFAULTS.interval_minutes)),
    limit_per_term: Math.min(80, Math.max(5, Number(body.limit_per_term || currentConfig.limit_per_term || LEAD_AGENT_DEFAULTS.limit_per_term))),
    max_terms: Math.min(12, Math.max(2, Number(body.max_terms || currentConfig.max_terms || LEAD_AGENT_DEFAULTS.max_terms))),
    max_new_leads_per_cycle: Math.min(60, Math.max(1, Number(body.max_new_leads_per_cycle || currentConfig.max_new_leads_per_cycle || LEAD_AGENT_DEFAULTS.max_new_leads_per_cycle))),
    min_score: Math.min(100, Math.max(10, Number(body.min_score || currentConfig.min_score || LEAD_AGENT_DEFAULTS.min_score))),
    auto_approve_score: Math.min(100, Math.max(20, Number(body.auto_approve_score || currentConfig.auto_approve_score || LEAD_AGENT_DEFAULTS.auto_approve_score))),
    auto_send: body.auto_send !== false,
    daily_send_limit: Math.min(50, Math.max(1, Number(body.daily_send_limit || currentConfig.daily_send_limit || LEAD_AGENT_DEFAULTS.daily_send_limit))),
    delay_min_s: Math.max(10, Number(body.delay_min_s || currentConfig.delay_min_s || LEAD_AGENT_DEFAULTS.delay_min_s)),
    delay_max_s: Math.max(Number(body.delay_min_s || currentConfig.delay_min_s || LEAD_AGENT_DEFAULTS.delay_min_s), Number(body.delay_max_s || currentConfig.delay_max_s || LEAD_AGENT_DEFAULTS.delay_max_s)),
    ai_personalize: body.ai_personalize !== false,
  }
}

function trimArrayUnique(values = [], limit = 12) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
    if (result.length >= limit) break
  }
  return result
}

function splitNicheVariants(niche = '') {
  const base = String(niche || '').trim().toLowerCase()
  if (!base) return []
  const variants = [base]
  for (const token of base.split(/[\/,|-]+/).map(part => part.trim()).filter(Boolean)) {
    variants.push(token)
  }
  for (const [key, values] of Object.entries(LEAD_NICHE_SYNONYMS)) {
    if (base.includes(key) || key.includes(base)) variants.push(...values)
  }
  return trimArrayUnique(variants, 10)
}

async function suggestLeadSearchTerms(niche, city, maxTerms = 8) {
  const fallback = splitNicheVariants(niche)
  if (!GROQ_API_KEY) return fallback.slice(0, maxTerms)
  try {
    const completion = await groqChat([
      {
        role: 'system',
        content: 'Voce cria variacoes curtas de busca para prospeccao local no Brasil. Responda SOMENTE JSON valido no formato {"terms":["..."],"notes":"..."}.',
      },
      {
        role: 'user',
        content: `Nicho base: ${niche}\nCidade: ${city}\nGere ate ${maxTerms} variacoes curtas e comerciais para buscar empresas locais, incluindo sinonimos e formas que apareceriam em Google Places.`,
      },
    ], { temperature: 0.2, maxTokens: 220 })
    const parsed = JSON.parse(completion)
    return trimArrayUnique([niche, ...(parsed?.terms || []), ...fallback], maxTerms)
  } catch {
    return fallback.slice(0, maxTerms)
  }
}

function createLeadAutomationState(config = {}) {
  return {
    id: 'lead-agent',
    kind: 'lead-automation',
    active: false,
    running: false,
    status: 'idle',
    stage: 'Aguardando ativacao.',
    config: { ...LEAD_AGENT_DEFAULTS, ...config },
    stats: {
      cycles: 0,
      discovered: 0,
      imported: 0,
      auto_approved: 0,
      skipped_existing: 0,
      blocked: 0,
    },
    last_run_at: null,
    next_run_at: null,
    last_terms: [],
    last_cycle: null,
    recent_cycles: [],
    logs: [],
    timer: null,
    started_at: null,
    error: null,
  }
}

function appendLeadAgentLog(agent, message) {
  agent.logs.unshift(`${new Date().toLocaleString('pt-BR')} - ${message}`)
  agent.logs = agent.logs.slice(0, 60)
}

function serializeLeadAutomationState(agent) {
  return {
    id: agent.id,
    kind: agent.kind,
    active: agent.active,
    running: agent.running,
    status: agent.status,
    stage: agent.stage,
    config: agent.config,
    stats: agent.stats,
    last_run_at: agent.last_run_at,
    next_run_at: agent.next_run_at,
    last_terms: agent.last_terms,
    last_cycle: agent.last_cycle,
    recent_cycles: Array.isArray(agent.recent_cycles) ? agent.recent_cycles.slice(0, 20) : [],
    safety: {
      soft_limit_per_day: LEAD_AGENT_MAX_SENDS_PER_DAY_SOFT,
    },
    logs: agent.logs,
    started_at: agent.started_at,
    error: agent.error,
  }
}

function getLeadAutomationAgent() {
  if (!leadAutomationAgents.has('lead-agent')) {
    leadAutomationAgents.set('lead-agent', createLeadAutomationState())
  }
  return leadAutomationAgents.get('lead-agent')
}

async function loadLeadAutomationAgentFromDb(agentId = 'lead-agent') {
  const result = await supabaseRequest(`/automation_agents?id=eq.${encodeURIComponent(agentId)}&select=*&limit=1`)
  if (!result.ok) return isMissingRelation(result) ? null : null
  return Array.isArray(result.data) ? result.data[0] || null : null
}

async function persistLeadAutomationAgent(agent) {
  const payload = {
    id: agent.id,
    kind: agent.kind,
    active: Boolean(agent.active),
    config: agent.config,
    state: {
      status: agent.status,
      stage: agent.stage,
      stats: agent.stats,
      last_terms: agent.last_terms,
      last_cycle: agent.last_cycle,
      recent_cycles: Array.isArray(agent.recent_cycles) ? agent.recent_cycles.slice(0, 20) : [],
      logs: agent.logs,
      error: agent.error,
    },
    last_run_at: agent.last_run_at,
    next_run_at: agent.next_run_at,
    started_at: agent.started_at,
  }
  const result = await supabaseRequest('/automation_agents?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload),
  })
  return isMissingRelation(result) ? null : result.data?.[0] || null
}

async function restoreLeadAutomationAgents() {
  const record = await loadLeadAutomationAgentFromDb('lead-agent')
  if (!record) return
  const agent = getLeadAutomationAgent()
  agent.active = Boolean(record.active)
  agent.config = { ...LEAD_AGENT_DEFAULTS, ...(record.config || {}) }
  agent.status = record.state?.status || (agent.active ? 'active' : 'idle')
  agent.stage = record.state?.stage || (agent.active ? 'Retomado no boot.' : 'Aguardando ativacao.')
  agent.stats = { ...agent.stats, ...(record.state?.stats || {}) }
  agent.last_terms = Array.isArray(record.state?.last_terms) ? record.state.last_terms : []
  agent.last_cycle = record.state?.last_cycle || null
  agent.recent_cycles = Array.isArray(record.state?.recent_cycles) ? record.state.recent_cycles.slice(0, 20) : []
  agent.logs = Array.isArray(record.state?.logs) ? record.state.logs.slice(0, 60) : []
  agent.last_run_at = record.last_run_at || null
  agent.next_run_at = record.next_run_at || null
  agent.started_at = record.started_at || null
  agent.error = record.state?.error || null
  if (agent.active) {
    appendLeadAgentLog(agent, 'Agente retomado automaticamente no boot.')
    const nextRun = agent.next_run_at ? new Date(agent.next_run_at).getTime() : 0
    scheduleLeadAutomation(agent, { runImmediately: !nextRun || nextRun <= Date.now() })
  }
}

async function persistAndSerializeLeadAgent(agent) {
  await persistLeadAutomationAgent(agent)
  return serializeLeadAutomationState(agent)
}

async function persistAutomationCycleRun(agent, cycle = {}) {
  const payload = {
    agent_id: agent.id,
    cycle_id: cycle.id || null,
    started_at: cycle.started_at || null,
    finished_at: cycle.finished_at || new Date().toISOString(),
    niche: agent.config?.niche || null,
    city: agent.config?.city || null,
    discovered: Number(cycle.discovered || 0),
    imported: Number(cycle.imported || 0),
    auto_approved: Number(cycle.auto_approved || 0),
    skipped_existing: Number(cycle.skipped_existing || 0),
    blocked: Number(cycle.blocked || 0),
    below_score: Number(cycle.below_score || 0),
    dispatched: Number(cycle.dispatched || 0),
    dispatch_failed: Number(cycle.dispatch_failed || 0),
    followed_up: Number(cycle.followed_up || 0),
    terms: cycle.terms || [],
    imported_preview: cycle.imported_preview || [],
    meta: cycle.meta || {},
  }
  const result = await supabaseRequest('/automation_cycle_runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return result.ok ? (Array.isArray(result.data) ? result.data[0] : result.data) : null
}

async function loadRecentAutomationCycleRuns(agentId, limit = 20) {
  const result = await supabaseRequest(`/automation_cycle_runs?agent_id=eq.${encodeURIComponent(agentId)}&select=id,cycle_id,started_at,finished_at,niche,city,discovered,imported,auto_approved,skipped_existing,blocked,below_score,dispatched,dispatch_failed,followed_up,terms,imported_preview,meta&order=finished_at.desc&limit=${Math.max(1, Math.min(50, Number(limit || 20)))}`)
  if (!result.ok && isMissingRelation(result)) return []
  if (!result.ok || !Array.isArray(result.data)) return []
  return result.data
}

async function listOpenHotHandoffs(limit = 200) {
  const result = await supabaseRequest(`/hot_handoffs?status=eq.open&select=id,phone,conversation_id,lead_id,lead_name,score,reason,source,status,created_at,updated_at&order=created_at.desc&limit=${Math.max(1, Math.min(500, Number(limit || 200)))}`)
  if (!result.ok && isMissingRelation(result)) return []
  if (!result.ok || !Array.isArray(result.data)) return []
  return result.data
}

async function upsertHotHandoff(payload = {}) {
  const phone = normalizePhone(payload.phone)
  if (!phone) return null
  const result = await supabaseRequest('/hot_handoffs?on_conflict=phone,status', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      phone,
      conversation_id: payload.conversation_id || null,
      lead_id: payload.lead_id || null,
      lead_name: payload.lead_name || null,
      score: Number(payload.score || HOT_LEAD_SCORE),
      reason: payload.reason || 'Lead quente para atendimento humano.',
      source: payload.source || 'agent',
      status: 'open',
      resolved_at: null,
    }),
  })
  if (!result.ok && isMissingRelation(result)) return null
  return result.ok ? (Array.isArray(result.data) ? result.data[0] : result.data) : null
}

async function resolveHotHandoff(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  const result = await supabaseRequest(`/hot_handoffs?phone=eq.${encodeURIComponent(normalized)}&status=eq.open`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    }),
  })
  if (!result.ok && isMissingRelation(result)) return null
  return result.ok ? result.data : null
}

async function saveAutomationLead(item, { niche, city, targetStatus, agentId, cycleId, searchTerm }) {
  const phone = normalizePhone(item.phone)
  if (!phone) return { action: 'skipped', lead: null }

  const existing = await supabaseRequest(`/leads?normalized_phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`)
  const current = existing.ok && Array.isArray(existing.data) ? existing.data[0] : null
  const rawPatch = {
    ...(current?.raw_payload || {}),
    automation: {
      agent_id: agentId,
      cycle_id: cycleId,
      search_term: searchTerm,
      score: item.score,
      reasons: item.score_reasons || [],
      message: item.message || null,
      imported_at: new Date().toISOString(),
    },
    prospect_score: item.score,
    prospect_gate: item.score >= targetStatus.auto_approve_score
      ? { status: 'recommended', reason: 'Aprovado automaticamente pelo agente.' }
      : { status: 'review', reason: 'Importado automaticamente para triagem.' },
    sources: normalizeLeadSourceList(item),
    source_count: normalizeLeadSourceList(item).length,
  }

  if (current) {
    if (['sent', 'responded', 'qualified', 'opt_out', 'invalid'].includes(current.status)) {
      return { action: 'kept-existing', lead: current }
    }
    const nextStatus = targetStatus.status === 'qualified' ? 'qualified' : (current.status || 'new')
    const patch = await supabaseRequest(`/leads?id=eq.${encodeURIComponent(current.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: nextStatus,
        last_interaction_at: nextStatus === 'qualified' ? new Date().toISOString() : current.last_interaction_at || null,
        raw_payload: rawPatch,
      }),
    })
    return { action: patch.ok ? 'updated' : 'failed', lead: patch.data?.[0] || current }
  }

  const insert = await insertLeadRecord({
    id: randomUUID(),
    name: item.name || 'Lead sem nome',
    phone,
    normalized_phone: phone,
    niche: item.niche || niche,
    city: item.city || city,
    address: item.address || null,
    website: item.website || null,
    cnpj: item.cnpj || null,
    email: item.email || null,
    source: item.source || 'import',
    status: targetStatus.status,
    last_interaction_at: targetStatus.status === 'qualified' ? new Date().toISOString() : null,
    raw_payload: rawPatch,
  })
  return { action: insert.ok ? 'inserted' : 'failed', lead: insert.data?.[0] || null }
}

async function createAutomationCampaign(agent, leads = []) {
  if (!leads.length) return null
  const config = agent.config || {}
  const instance = config.instance_id
    ? await findWhatsappInstanceById(config.instance_id)
    : await findDefaultOpenInstance()
  if (!instance?.evolution_instance_name) {
    appendLeadAgentLog(agent, 'Nenhuma instancia aberta para disparo automatico.')
    return null
  }

  const payload = {
    id: randomUUID(),
    name: `Agente SDR - ${config.niche} - ${config.city} - ${new Date().toLocaleDateString('pt-BR')}`,
    niche: config.niche,
    city: config.city,
    template_id: null,
    status: 'running',
    quantity_requested: leads.length,
    daily_limit: Math.min(leads.length, Number(config.daily_send_limit || leads.length || 1)),
    delay_min_s: Number(config.delay_min_s || 45),
    delay_max_s: Number(config.delay_max_s || 90),
    use_audio: false,
    started_at: new Date().toISOString(),
  }

  let result = await supabaseRequest('/campaigns', { method: 'POST', body: JSON.stringify(payload) })
  if (!result.ok && isMissingColumn(result)) {
    const minimal = { ...payload }
    delete minimal.use_audio
    delete minimal.neighborhood
    result = await supabaseRequest('/campaigns', { method: 'POST', body: JSON.stringify(minimal) })
  }
  if (!result.ok && isMissingColumn(result)) {
    result = await supabaseRequest('/campaigns', { method: 'POST', body: JSON.stringify(campaignPatchPayload(payload, true)) })
  }
  if (!result.ok) {
    appendLeadAgentLog(agent, `Erro ao criar campanha automatica: ${result.data?.message || 'falha desconhecida'}`)
    return null
  }
  return { campaign: Array.isArray(result.data) ? result.data[0] : result.data, instance }
}

async function sendAutomationLeadBatch(agent, items = []) {
  if (!items.length) return { sent: 0, failed: 0, campaign_id: null }
  const ctx = await createAutomationCampaign(agent, items)
  if (!ctx?.campaign || !ctx?.instance) return { sent: 0, failed: items.length, campaign_id: null }

  let sent = 0
  let failed = 0
  for (const item of items.slice(0, Math.min(items.length, Number(agent.config.daily_send_limit || items.length)))) {
    const leadRecord = item.lead
    if (!leadRecord?.id || !item.message) { failed += 1; continue }
    const outboundText = await finalizeCommercialMessage(item.message, {
      stage: 'initial',
      lead: leadRecord,
      niche: leadRecord.niche || agent.config?.niche,
      city: leadRecord.city || agent.config?.city,
    })

    const clRes = await createCampaignLead({
      campaign_id: ctx.campaign.id,
      lead_id: leadRecord.id,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    })
    const clId = clRes?.data?.[0]?.id

    const pending = await insertMessage({
      lead_id: leadRecord.id,
      whatsapp_instance_id: ctx.instance.id,
      campaign_id: ctx.campaign.id,
      direction: 'outbound',
      kind: 'text',
      phone: normalizePhone(leadRecord.normalized_phone || leadRecord.phone),
      body: outboundText,
      status: 'pending',
      raw_payload: { source: 'automation-agent', automation_agent_id: agent.id, cycle_id: item.cycle_id },
    })

    let result
    try {
      result = await sendWhatsAppText(ctx.instance.evolution_instance_name, normalizePhone(leadRecord.normalized_phone || leadRecord.phone), outboundText)
    } catch (error) {
      result = { ok: false, data: { message: error.message } }
    }

    const ok = Boolean(result?.ok)
    sent += ok ? 1 : 0
    failed += ok ? 0 : 1

    if (pending?.id) {
      await supabaseRequest(`/messages?id=eq.${encodeURIComponent(pending.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(ok
          ? { status: 'sent', provider_message_id: result.data?.key?.id || null, sent_at: new Date().toISOString() }
          : { status: 'failed', error_message: result.data?.message || 'Falha no envio' }),
      })
    }
    await updateCampaignLead(clId, {
      status: ok ? 'sent' : 'failed',
      message_id: pending?.id || null,
      sent_at: new Date().toISOString(),
      error: ok ? null : result.data?.message || 'Falha no envio',
    })
    await supabaseRequest(`/leads?id=eq.${encodeURIComponent(leadRecord.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: ok ? 'sent' : 'qualified', last_interaction_at: new Date().toISOString() }),
    })
    await patchCampaign(ctx.campaign.id, { sent_count: sent, failed_count: failed })
    if (ok) await incrementInstanceSentToday(ctx.instance.id, ctx.instance.sent_today + sent - 1)

    const delay = (Number(agent.config.delay_min_s || 45) + Math.random() * (Number(agent.config.delay_max_s || 90) - Number(agent.config.delay_min_s || 45))) * 1000
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  await patchCampaign(ctx.campaign.id, {
    status: 'finished',
    finished_at: new Date().toISOString(),
    sent_count: sent,
    failed_count: failed,
  })
  return { sent, failed, campaign_id: ctx.campaign.id }
}

function normalizeSequenceStep(row = {}) {
  return {
    id: row.id,
    step_order: Number(row.step_order || 0),
    label: row.label || `D+${Math.floor(Number(row.delay_hours || 48) / 24)}`,
    condition: row.condition || 'Sem resposta',
    delay_hours: Number(row.delay_hours || 48),
    template_id: row.template_id || null,
    is_active: row.is_active !== false,
  }
}

async function getMessageSequenceById(sequenceId) {
  if (!sequenceId) return null
  const seqRes = await supabaseRequest(`/message_sequences?id=eq.${encodeURIComponent(sequenceId)}&select=id,name,niche,is_active,created_at,updated_at&limit=1`)
  if (!seqRes.ok && isMissingRelation(seqRes)) return null
  if (!seqRes.ok || !Array.isArray(seqRes.data) || !seqRes.data[0]) return null
  const sequence = seqRes.data[0]
  const stepsRes = await supabaseRequest(`/message_sequence_steps?sequence_id=eq.${encodeURIComponent(sequence.id)}&select=id,sequence_id,step_order,label,condition,delay_hours,template_id,is_active&order=step_order.asc`) 
  const steps = stepsRes.ok && Array.isArray(stepsRes.data) ? stepsRes.data.map(normalizeSequenceStep) : []
  return {
    id: sequence.id,
    name: sequence.name,
    niche: sequence.niche || 'Geral',
    is_active: sequence.is_active !== false,
    created_at: sequence.created_at,
    updated_at: sequence.updated_at,
    steps,
  }
}

async function listMessageSequences() {
  const seqRes = await supabaseRequest('/message_sequences?select=id,name,niche,is_active,created_at,updated_at&order=created_at.desc&limit=200')
  if (!seqRes.ok && isMissingRelation(seqRes)) return { ok: true, status: 200, data: [] }
  if (!seqRes.ok) return seqRes
  const sequences = []
  for (const row of seqRes.data || []) {
    const loaded = await getMessageSequenceById(row.id)
    if (loaded) sequences.push(loaded)
  }
  return { ok: true, status: 200, data: sequences }
}

async function createMessageSequence(payload = {}) {
  const name = String(payload.name || '').trim()
  const niche = String(payload.niche || 'Geral').trim()
  if (!name) return { ok: false, status: 400, data: { message: 'name obrigatorio.' } }

  const seqRes = await supabaseRequest('/message_sequences', {
    method: 'POST',
    body: JSON.stringify({ name, niche, is_active: true }),
  })
  if (!seqRes.ok && isMissingRelation(seqRes)) {
    return { ok: false, status: 400, data: { message: 'Tabela de sequencias nao existe. Rode a migration 20260501_add_message_sequences.sql.' } }
  }
  if (!seqRes.ok) return seqRes
  const sequence = Array.isArray(seqRes.data) ? seqRes.data[0] : seqRes.data

  const defaultSteps = [
    { step_order: 0, label: 'D+2', condition: 'Sem resposta', delay_hours: 48 },
    { step_order: 1, label: 'D+5', condition: 'Sem resposta', delay_hours: 120 },
    { step_order: 2, label: 'D+10', condition: 'Sem resposta', delay_hours: 240 },
  ]
  const stepsPayload = defaultSteps.map(step => ({
    sequence_id: sequence.id,
    ...step,
    template_id: null,
    is_active: true,
  }))
  await supabaseRequest('/message_sequence_steps', {
    method: 'POST',
    body: JSON.stringify(stepsPayload),
  })

  const full = await getMessageSequenceById(sequence.id)
  return { ok: true, status: 201, data: full }
}

async function updateMessageSequenceStep(sequenceId, stepIndex, patch = {}) {
  const stepOrder = Number(stepIndex)
  if (Number.isNaN(stepOrder) || stepOrder < 0) {
    return { ok: false, status: 400, data: { message: 'step_index invalido.' } }
  }
  const existing = await supabaseRequest(`/message_sequence_steps?sequence_id=eq.${encodeURIComponent(sequenceId)}&step_order=eq.${stepOrder}&select=id&limit=1`)
  if (!existing.ok && isMissingRelation(existing)) {
    return { ok: false, status: 400, data: { message: 'Tabela de sequencias nao existe. Rode a migration 20260501_add_message_sequences.sql.' } }
  }
  const body = {
    template_id: patch.template_id || null,
    label: patch.label || undefined,
    condition: patch.condition || undefined,
    delay_hours: patch.delay_hours !== undefined ? Number(patch.delay_hours) : undefined,
    is_active: patch.is_active !== undefined ? Boolean(patch.is_active) : undefined,
  }
  const cleanPatch = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))

  if (existing.ok && Array.isArray(existing.data) && existing.data[0]?.id) {
    await supabaseRequest(`/message_sequence_steps?id=eq.${encodeURIComponent(existing.data[0].id)}`, {
      method: 'PATCH',
      body: JSON.stringify(cleanPatch),
    })
  } else {
    await supabaseRequest('/message_sequence_steps', {
      method: 'POST',
      body: JSON.stringify({
        sequence_id: sequenceId,
        step_order: stepOrder,
        label: patch.label || `D+${Math.ceil((Number(patch.delay_hours || 48)) / 24)}`,
        condition: patch.condition || 'Sem resposta',
        delay_hours: Number(patch.delay_hours || 48),
        template_id: patch.template_id || null,
        is_active: patch.is_active !== false,
      }),
    })
  }
  const full = await getMessageSequenceById(sequenceId)
  return { ok: true, status: 200, data: full }
}

async function getAutomationSequence(config = {}) {
  if (config.sequence_id) {
    const explicit = await getMessageSequenceById(config.sequence_id)
    if (explicit?.steps?.length) return explicit
  }
  const niche = String(config.niche || '').trim()
  let seqRes = niche
    ? await supabaseRequest(`/message_sequences?niche=ilike.*${encodeURIComponent(niche)}*&is_active=eq.true&select=id&order=updated_at.desc&limit=1`)
    : { ok: false }
  if (!seqRes.ok && isMissingRelation(seqRes)) return null
  if (!seqRes.ok || !Array.isArray(seqRes.data) || !seqRes.data[0]) {
    seqRes = await supabaseRequest('/message_sequences?is_active=eq.true&select=id&order=updated_at.desc&limit=1')
  }
  if (!seqRes.ok || !Array.isArray(seqRes.data) || !seqRes.data[0]) return null
  return getMessageSequenceById(seqRes.data[0].id)
}

async function resolveTemplateText(templateId) {
  if (!templateId) return null
  const result = await supabaseRequest(`/message_templates?id=eq.${encodeURIComponent(templateId)}&select=body&is_active=eq.true&limit=1`)
  if (!result.ok || !Array.isArray(result.data) || !result.data[0]) return null
  return result.data[0].body || null
}

async function runLeadFollowUpPass(agent) {
  const config = agent.config || {}
  if (!config.enable_follow_up) return { followed_up: 0, failed: 0 }

  const instance = config.instance_id
    ? await findWhatsappInstanceById(config.instance_id)
    : await findDefaultOpenInstance()
  if (!instance?.evolution_instance_name) return { followed_up: 0, failed: 0 }

  const sequence = await getAutomationSequence(config)
  if (!sequence?.steps?.length) return { followed_up: 0, failed: 0 }
  const leadsRes = await supabaseRequest(`/leads?niche=ilike.*${encodeURIComponent(config.niche || '')}*&city=ilike.*${encodeURIComponent(config.city || '')}*&status=eq.sent&select=id,name,phone,normalized_phone,niche,city,last_interaction_at,raw_payload&limit=50`)
  if (!leadsRes.ok || !Array.isArray(leadsRes.data)) return { followed_up: 0, failed: 0 }

  let followedUp = 0
  let failed = 0
  for (const lead of leadsRes.data) {
    const lastAt = lead.last_interaction_at ? new Date(lead.last_interaction_at).getTime() : 0
    const followMeta = lead.raw_payload?.automation || {}
    const followUpCount = Number(followMeta.follow_up_count || 0)
    const step = sequence.steps[followUpCount]
    if (!step || !step.is_active) continue

    const thresholdMs = Math.max(1, Number(step.delay_hours || config.follow_up_after_hours || 48)) * 60 * 60 * 1000
    if (!lastAt || Date.now() - lastAt < thresholdMs) continue

    const template = await resolveTemplateText(step.template_id)
    if (!template) continue

    const textDraft = interpolateTemplate(template, {
      name: lead.name,
      niche: lead.niche,
      city: lead.city,
    }, lead.niche, lead.city)
    const text = await finalizeCommercialMessage(textDraft, {
      stage: 'follow_up',
      lead,
      niche: lead.niche,
      city: lead.city,
    })

    const pending = await insertMessage({
      lead_id: lead.id,
      whatsapp_instance_id: instance.id,
      direction: 'outbound',
      kind: 'text',
      phone: normalizePhone(lead.normalized_phone || lead.phone),
      body: text,
      status: 'pending',
      raw_payload: { source: 'automation-followup', automation_agent_id: agent.id },
    })
    const result = await sendWhatsAppText(instance.evolution_instance_name, normalizePhone(lead.normalized_phone || lead.phone), text)
    const ok = Boolean(result?.ok)
    if (pending?.id) {
      await supabaseRequest(`/messages?id=eq.${encodeURIComponent(pending.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(ok
          ? { status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.data?.key?.id || null }
          : { status: 'failed', error_message: result.data?.message || 'Falha no follow-up' }),
      })
    }
    if (ok) {
      followedUp += 1
      await patchLeadByPhone(lead.normalized_phone || lead.phone, {
        last_interaction_at: new Date().toISOString(),
        raw_payload: {
          ...(lead.raw_payload || {}),
          automation: {
            ...(followMeta || {}),
            sequence_id: sequence.id,
            follow_up_count: followUpCount + 1,
            follow_up_step_order: step.step_order,
            follow_up_sent_at: new Date().toISOString(),
          },
        },
      })
      await incrementInstanceSentToday(instance.id, instance.sent_today + followedUp - 1)
    } else {
      failed += 1
    }
  }
  return { followed_up: followedUp, failed }
}

async function runLeadAutomationCycle(agent, { manual = false } = {}) {
  if (agent.running) return serializeLeadAutomationState(agent)

  const config = { ...LEAD_AGENT_DEFAULTS, ...(agent.config || {}) }
  const cycleId = randomUUID()
  agent.running = true
  agent.active = true
  agent.error = null
  agent.status = 'running'
  agent.stage = manual ? 'Executando ciclo manual...' : 'Buscando novas oportunidades...'
  agent.last_run_at = new Date().toISOString()
  const cycleStartedAt = agent.last_run_at

  try {
    const terms = await suggestLeadSearchTerms(config.niche, config.city, config.max_terms)
    agent.last_terms = terms
    appendLeadAgentLog(agent, `Plano de busca: ${terms.join(', ')}`)

    const mergedMap = new Map()
    for (const term of terms) {
      const found = await discoverAutopilotLeads(term, config.city, config.limit_per_term)
      for (const lead of found) {
        const normalized = {
          ...lead,
          niche: lead.niche || config.niche,
          city: lead.city || config.city,
          search_term: term,
        }
        const key = discoveryKey(normalized)
        mergedMap.set(key, mergeLeadRecords(mergedMap.get(key), normalized))
      }
    }

    const merged = [...mergedMap.values()].filter(lead => normalizePhone(lead.phone))
    const phones = merged.map(lead => normalizePhone(lead.phone)).filter(Boolean)
    const flags = await getLeadContactFlags(phones)

    let imported = 0
    let autoApproved = 0
    let skippedExisting = 0
    let blocked = 0
    let belowScore = 0
    let dispatched = 0
    let dispatchFailed = 0
    let followedUp = 0
    const importedPreview = []
    const queueToSend = []

    for (const lead of merged.sort((a, b) => discoveryQuality(b) - discoveryQuality(a))) {
      if (imported >= config.max_new_leads_per_cycle) break

      const phone = normalizePhone(lead.phone)
      const flag = flags.get(phone) || {}
      if (flag.blocked || flag.already_contacted) {
        if (flag.blocked) blocked += 1
        else skippedExisting += 1
        continue
      }

      const local = localLeadScore(lead, false, 'unknown')
      let ai = { score_delta: 0, reason: 'Pontuacao local aplicada sem IA.', intent: 'medio', message: baseAutopilotMessage(lead, config.niche, config.city) }
      if (config.ai_personalize) {
        const siteContent = lead.website ? await analyzeWebsite(lead.website) : null
        ai = await enrichLeadWithAi(lead, siteContent, config.niche, config.city)
      }
      const score = Math.max(0, Math.min(100, local.score + Number(ai.score_delta || 0)))
      if (score < config.min_score) {
        belowScore += 1
        continue
      }

      const targetStatus = {
        status: score >= config.auto_approve_score ? 'qualified' : 'new',
        auto_approve_score: config.auto_approve_score,
      }
      const saved = await saveAutomationLead({
        ...lead,
        phone,
        score,
        score_reasons: [...local.reasons, ai.reason].filter(Boolean),
        message: ai.message || baseAutopilotMessage(lead, config.niche, config.city),
      }, {
        niche: config.niche,
        city: config.city,
        targetStatus,
        agentId: agent.id,
        cycleId,
        searchTerm: lead.search_term || config.niche,
      })

      if (saved.action === 'kept-existing') {
        skippedExisting += 1
        continue
      }
      if (saved.action === 'failed') continue

      imported += 1
      if (targetStatus.status === 'qualified') autoApproved += 1
      importedPreview.push({
        name: lead.name,
        city: lead.city || config.city,
        phone,
        score,
        status: targetStatus.status,
        term: lead.search_term || config.niche,
      })
      if (targetStatus.status === 'qualified' && config.auto_send && saved.lead) {
        queueToSend.push({ lead: saved.lead, message: ai.message || baseAutopilotMessage(lead, config.niche, config.city), cycle_id: cycleId })
      }
    }

    if (queueToSend.length) {
      const sendResult = await sendAutomationLeadBatch(agent, queueToSend)
      dispatched = sendResult.sent
      dispatchFailed = sendResult.failed
      appendLeadAgentLog(agent, `Disparo automatico: ${sendResult.sent} enviados, ${sendResult.failed} falhas.`)
    }

    const followUpResult = await runLeadFollowUpPass(agent)
    followedUp = followUpResult.followed_up
    if (followedUp || followUpResult.failed) {
      appendLeadAgentLog(agent, `Follow-up automatico: ${followedUp} enviados, ${followUpResult.failed} falhas.`)
    }

    agent.stats.cycles += 1
    agent.stats.discovered += merged.length
    agent.stats.imported += imported
    agent.stats.auto_approved += autoApproved
    agent.stats.skipped_existing += skippedExisting
    agent.stats.blocked += blocked
    agent.last_cycle = {
      id: cycleId,
      started_at: cycleStartedAt,
      discovered: merged.length,
      imported,
      auto_approved: autoApproved,
      skipped_existing: skippedExisting,
      blocked,
      below_score: belowScore,
      dispatched,
      dispatch_failed: dispatchFailed,
      followed_up: followedUp,
      terms,
      imported_preview: importedPreview.slice(0, 10),
      finished_at: new Date().toISOString(),
      meta: {
        discarded: {
          blocked,
          skipped_existing: skippedExisting,
          below_score: belowScore,
        },
      },
    }
    agent.recent_cycles = [agent.last_cycle, ...(Array.isArray(agent.recent_cycles) ? agent.recent_cycles : [])].slice(0, 20)
    await persistAutomationCycleRun(agent, agent.last_cycle)
    agent.status = 'active'
    agent.stage = imported
      ? `${imported} leads importados (${autoApproved} autoaprovados, ${dispatched} enviados, ${followedUp} follow-ups).`
      : `Ciclo concluido sem novos leads aproveitaveis${followedUp ? `, com ${followedUp} follow-ups` : ''}.`
    appendLeadAgentLog(agent, agent.stage)
  } catch (error) {
    agent.status = 'error'
    agent.error = error.message || 'Erro no agente de captacao.'
    agent.stage = agent.error
    appendLeadAgentLog(agent, `Erro: ${agent.error}`)
  } finally {
    agent.running = false
    await persistLeadAutomationAgent(agent)
  }

  return serializeLeadAutomationState(agent)
}

function scheduleLeadAutomation(agent, { runImmediately = false } = {}) {
  if (agent.timer) clearTimeout(agent.timer)
  if (!agent.active) {
    agent.next_run_at = null
    return
  }

  const delayMs = runImmediately ? 250 : Math.max(1, Number(agent.config.interval_minutes || LEAD_AGENT_DEFAULTS.interval_minutes)) * 60 * 1000
  agent.next_run_at = new Date(Date.now() + delayMs).toISOString()
  persistLeadAutomationAgent(agent).catch(() => null)
  agent.timer = setTimeout(async () => {
    await runLeadAutomationCycle(agent)
    if (agent.active) scheduleLeadAutomation(agent)
  }, delayMs)
}

function stopLeadAutomation(agent) {
  if (agent.timer) clearTimeout(agent.timer)
  agent.timer = null
  agent.active = false
  agent.running = false
  agent.status = 'idle'
  agent.stage = 'Agente pausado.'
  agent.next_run_at = null
  appendLeadAgentLog(agent, 'Agente pausado manualmente.')
  persistLeadAutomationAgent(agent).catch(() => null)
  return serializeLeadAutomationState(agent)
}

function extractTextFromHTML(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 700)
}

async function analyzeWebsite(url) {
  if (!url) return null
  try {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`
    const r = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    })
    if (!r.ok) return null
    return extractTextFromHTML(await r.text()) || null
  } catch {
    return null
  }
}

async function generatePersonalizedMessage(lead, siteContent, baseTemplate) {
  if (!GROQ_API_KEY) return null
  const ctx = buildCommercialContext(lead, lead.niche, lead.city)
  const siteInfo = siteContent ? `\nInformações do site deles: ${siteContent.substring(0, 350)}` : ''
  const prompt = `Você é um especialista em prospecção B2B via WhatsApp no Brasil.
Gere uma mensagem personalizada e direta para prospectar a empresa abaixo.

Empresa: ${ctx.companyName || 'nao informado'}
Segmento: ${ctx.nicheRef}
Cidade: ${ctx.cityRef}${siteInfo}

Mensagem base do vendedor (adapte e personalize):
"${baseTemplate}"

REGRAS OBRIGATÓRIAS:
- Máximo 4 linhas curtas
- Mencione algo específico do negócio SE tiver info do site
- Tom profissional e próximo, como uma pessoa real
- Termine com uma pergunta simples de qualificação
- NÃO invente informações
- Português impecável, sem erro de concordância
- Nome da empresa é opcional: só use quando soar natural e houver alta confiança
- Quando não usar nome, prefira "vocês" ou "a empresa"
- Responda SOMENTE com o texto da mensagem`

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    const data = await r.json()
    return finalizeCommercialMessage(data.choices?.[0]?.message?.content?.trim() || '', {
      stage: 'initial',
      lead,
      niche: lead.niche,
      city: lead.city,
      originalMessage: baseTemplate,
    })
  } catch {
    return null
  }
}

function interpolateTemplate(template, lead, niche, city) {
  return (template || '')
    .replace(/{nome_empresa}/g, lead.name || '')
    .replace(/{cidade}/g, lead.city || city || '')
    .replace(/{nicho}/g, lead.niche || niche || '')
    .replace(/{servico}/g, lead.niche || niche || '')
}

async function checkWhatsAppNumbers(instanceName, phones) {
  try {
    const result = await evolutionRequest(
      `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
      { method: 'POST', body: JSON.stringify({ numbers: phones }), signal: AbortSignal.timeout(8_000) },
    )
    if (!result.ok || !Array.isArray(result.data)) return null
    return result.data
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GROQ — LLM para agente SDR
// ─────────────────────────────────────────────────────────────────────────────

function parseJsonLoose(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function cleanBusinessName(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^['"`]+|['"`]+$/g, '')
    .trim()
}

function neutralBusinessReference(lead = {}) {
  const name = cleanBusinessName(lead.name || lead.lead_name || '')
  return name ? `a empresa ${name}` : 'a empresa'
}

function cleanShortText(value, fallback = '') {
  const clean = String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  return clean || fallback
}

function buildCommercialContext(lead = {}, niche = '', city = '') {
  const companyName = cleanBusinessName(lead.name || lead.lead_name || '')
  const nicheRef = cleanShortText(lead.niche || niche, 'negocio local')
  const cityRef = cleanShortText(lead.city || city, 'cidade nao informada')
  return {
    companyName,
    nicheRef,
    cityRef,
    objective: 'Descobrir dor operacional real e qualificar para atendimento humano sem parecer robo.',
    guardrails: [
      'Nao inventar fatos',
      'Nao prometer resultado garantido',
      'Nao pressionar o lead',
      'Tom comercial profissional e natural',
    ],
  }
}

function polishCommercialMessage(text, lead = {}, niche = '', city = '') {
  let out = String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^['"`]+|['"`]+$/g, '')
    .trim()

  if (!out) return baseAutopilotMessage(lead, niche, city)
  return out.slice(0, 700)
}

function sentenceSplit(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean)
}

function getCommercialStylePolicy(stage = 'initial') {
  const map = {
    initial: { maxSentences: 3, maxChars: 420, askQuestion: true, tone: 'abordagem inicial, leve e profissional' },
    follow_up: { maxSentences: 3, maxChars: 420, askQuestion: true, tone: 'retomada elegante sem insistencia' },
    sdr_reply: { maxSentences: 2, maxChars: 320, askQuestion: true, tone: 'descoberta de dor com clareza' },
    opt_out_ack: { maxSentences: 1, maxChars: 180, askQuestion: false, tone: 'encerramento educado' },
  }
  return map[stage] || map.initial
}

function applyCommercialHardLimits(text, policy) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  const sentences = sentenceSplit(normalized).slice(0, Math.max(1, Number(policy.maxSentences || 2)))
  let limited = sentences.join(' ').trim()
  if (limited.length > Number(policy.maxChars || 320)) {
    limited = limited.slice(0, Number(policy.maxChars || 320)).trim()
    limited = limited.replace(/[,:;\-–—\s]+$/g, '').trim()
  }
  return limited
}

function countQuestions(text) {
  return (String(text || '').match(/\?/g) || []).length
}

async function persistMessageQualityAudit(item = {}) {
  const payload = {
    agent_id: item.agent_id || item.agentId || null,
    stage: String(item.stage || 'unknown'),
    reviewed: Boolean(item.reviewed),
    changed: Boolean(item.changed),
    source: String(item.source || 'local'),
    company: item.company || null,
    niche: item.niche || null,
    city: item.city || null,
    final_chars: Number(item.final_chars || 0),
    question_count: Number(item.question_count || 0),
    meta: item.meta || {},
  }
  const result = await supabaseRequest('/message_quality_audits', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!result.ok && isMissingRelation(result)) return null
  return result.ok ? (Array.isArray(result.data) ? result.data[0] : result.data) : null
}

async function listMessageQualityAudits(limit = 80) {
  const safeLimit = Math.max(1, Math.min(300, Number(limit || 80)))
  const result = await supabaseRequest(`/message_quality_audits?select=id,created_at,agent_id,stage,reviewed,changed,source,company,niche,city,final_chars,question_count,meta&order=created_at.desc&limit=${safeLimit}`)
  if (!result.ok && isMissingRelation(result)) return null
  if (!result.ok || !Array.isArray(result.data)) return null
  return result.data
}

function pushMessageQualityAudit(item = {}) {
  const row = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    ...item,
  }
  messageQualityAudits.unshift(row)
  if (messageQualityAudits.length > 600) messageQualityAudits.length = 600
  persistMessageQualityAudit(row).catch(() => null)
}

function summarizeMessageQuality(items = []) {
  const summary = {
    total: items.length,
    reviewed: 0,
    changed: 0,
    avg_chars: 0,
    question_rate: 0,
    by_stage: {},
  }
  if (!items.length) return summary

  let charTotal = 0
  let withQuestion = 0
  for (const item of items) {
    const stage = item.stage || 'unknown'
    summary.by_stage[stage] = (summary.by_stage[stage] || 0) + 1
    if (item.reviewed) summary.reviewed += 1
    if (item.changed) summary.changed += 1
    charTotal += Number(item.final_chars || 0)
    if (Number(item.question_count || 0) > 0) withQuestion += 1
  }
  summary.avg_chars = Math.round(charTotal / items.length)
  summary.question_rate = Math.round((withQuestion / items.length) * 100)
  return summary
}

function getMessageQualityAuditPayload(limit = 80, sourceItems = null) {
  const safeLimit = Math.max(1, Math.min(300, Number(limit || 80)))
  const base = Array.isArray(sourceItems) ? sourceItems : messageQualityAudits
  const items = base.slice(0, safeLimit)
  return {
    summary: summarizeMessageQuality(items),
    items,
  }
}

async function finalizeCommercialMessage(text, {
  stage = 'initial',
  lead = {},
  niche = '',
  city = '',
  originalMessage = '',
} = {}) {
  const policy = getCommercialStylePolicy(stage)
  const ctx = buildCommercialContext(lead, niche, city)
  const base = polishCommercialMessage(text, lead, niche, city)
  const local = applyCommercialHardLimits(base, policy)
  if (!GROQ_API_KEY || !GROQ_COPY_REVIEW) {
    pushMessageQualityAudit({
      stage,
      reviewed: false,
      changed: local !== base,
      source: 'local',
      company: ctx.companyName || null,
      niche: ctx.nicheRef,
      city: ctx.cityRef,
      final_chars: local.length,
      question_count: countQuestions(local),
    })
    return local
  }

  const prompt = `Voce e um revisor de copy comercial para WhatsApp B2B.
Reescreva somente se necessario para melhorar clareza, concordancia e profissionalismo sem perder intencao.

Contexto:
- Empresa: ${ctx.companyName || 'nao informado'}
- Nicho: ${ctx.nicheRef}
- Cidade: ${ctx.cityRef}
- Etapa: ${stage}
- Tom esperado: ${policy.tone}
- Objetivo: ${ctx.objective}
- Mensagem anterior do fluxo: ${(originalMessage || '').slice(0, 250)}

Regras obrigatorias:
- Portugues impecavel.
- Nome da empresa e opcional; so use quando natural.
- Se nao usar nome, use "voces" ou "a empresa".
- Nao inventar fatos.
- Nao falar de preco.
- Limite de ${policy.maxSentences} frases e ${policy.maxChars} caracteres.
${policy.askQuestion ? '- Termine com pergunta de qualificacao quando fizer sentido.' : '- Nao faca pergunta.'}

Texto base:
"${local}"

Responda somente com a mensagem final.`

  try {
    const revised = await groqChat([{ role: 'user', content: prompt }], { temperature: 0.2, maxTokens: 220 })
    const polished = polishCommercialMessage(revised || local, lead, niche, city)
    const finalText = applyCommercialHardLimits(polished, policy)
    pushMessageQualityAudit({
      stage,
      reviewed: true,
      changed: finalText !== local,
      source: 'groq-review',
      company: ctx.companyName || null,
      niche: ctx.nicheRef,
      city: ctx.cityRef,
      final_chars: finalText.length,
      question_count: countQuestions(finalText),
    })
    return finalText
  } catch {
    pushMessageQualityAudit({
      stage,
      reviewed: false,
      changed: false,
      source: 'fallback-error',
      company: ctx.companyName || null,
      niche: ctx.nicheRef,
      city: ctx.cityRef,
      final_chars: local.length,
      question_count: countQuestions(local),
    })
    return local
  }
}

function baseAutopilotMessage(lead, niche, city) {
  const companyRef = neutralBusinessReference(lead)
  const cityRef = cleanShortText(lead.city || city, 'sua cidade')
  const nicheRef = cleanShortText(lead.niche || niche, 'sua operacao')
  const intro = lead?.name
    ? `Oi, tudo bem? Vi ${companyRef} em ${cityRef}`
    : `Oi, tudo bem? Vi o negocio de voces em ${cityRef}`
  return `${intro} e queria entender como voces organizam hoje a rotina de ${nicheRef}. Se fizer sentido, posso te fazer uma pergunta rapida. Se nao quiser receber contato, e so me avisar.`
}

function localLeadScore(lead = {}, alreadyContacted = false, whatsappStatus = 'unknown') {
  let score = 0
  const reasons = []
  const phoneType = classifyBrazilianPhone(lead.phone)

  if (phoneType === 'mobile') { score += 30; reasons.push('telefone movel') }
  else if (phoneType === 'landline') { score += 8; reasons.push('telefone fixo') }
  if (whatsappStatus === 'valid') { score += 25; reasons.push('WhatsApp confirmado') }
  if (lead.website) { score += 14; reasons.push('site encontrado') }
  if (lead.cnpj) { score += 10; reasons.push('CNPJ encontrado') }
  if (lead.email) { score += 4; reasons.push('email encontrado') }
  const sourceCount = normalizeLeadSourceList(lead).length
  if (sourceCount > 1) { score += Math.min(12, sourceCount * 4); reasons.push(`${sourceCount} fontes`) }
  score += Math.min(10, sourceListRank(normalizeLeadSourceList(lead)))
  if (alreadyContacted) { score -= 50; reasons.push('ja contatado') }
  if (whatsappStatus === 'invalid') { score -= 60; reasons.push('sem WhatsApp confirmado') }

  return { score: Math.max(0, Math.min(100, score)), reasons }
}

async function enrichLeadWithAi(lead, siteContent, niche, city) {
  const ctx = buildCommercialContext(lead, niche, city)
  const fallback = {
    score_delta: 0,
    intent: 'medio',
    reason: siteContent ? 'Site analisado, mas IA indisponivel.' : 'Sem site para analise profunda.',
    message: baseAutopilotMessage(lead, niche, city),
  }
  if (!GROQ_API_KEY) return fallback

  const prompt = `Voce prepara prospeccao B2B responsavel por WhatsApp para negocios locais no Brasil.
Analise o lead e retorne SOMENTE JSON valido.

Lead:
- Empresa: ${ctx.companyName || ''}
- Nicho: ${ctx.nicheRef}
- Cidade: ${ctx.cityRef}
- Fontes: ${normalizeLeadSourceList(lead).join(', ') || 'nao informado'}
- Site/texto: ${(siteContent || 'sem site analisavel').slice(0, 1200)}

Objetivo comercial da ferramenta:
- ${ctx.objective}

JSON obrigatorio:
{
  "score_delta": numero inteiro de -15 a 20,
  "intent": "alto" | "medio" | "baixo",
  "reason": "motivo curto do score, sem inventar fatos",
  "message": "mensagem curta, educada, maximo 4 linhas, sem prometer resultado, com uma pergunta simples e opcao de parar contato"
}

Regras:
- Nao invente informacoes.
- Nao use tom agressivo.
- Identifique claramente que e uma abordagem comercial leve.
- Nao mencione automacao de envio.
- Portugues impecavel, sem erro de concordancia, virgula e acentos.
- Nome da empresa e opcional: use apenas quando natural.
- Quando nao citar nome, use "voces" ou "a empresa".`

  try {
    const content = await groqChat([{ role: 'user', content: prompt }], { temperature: 0.45, maxTokens: 320 })
    const parsed = parseJsonLoose(content)
    if (!parsed || !parsed.message) return fallback
    return {
      score_delta: Math.max(-15, Math.min(20, Number(parsed.score_delta || 0))),
      intent: ['alto', 'medio', 'baixo'].includes(parsed.intent) ? parsed.intent : 'medio',
      reason: String(parsed.reason || fallback.reason).slice(0, 180),
      message: polishCommercialMessage(parsed.message || fallback.message, lead, niche, city),
    }
  } catch {
    return fallback
  }
}

async function discoverAutopilotLeads(niche, city, limit) {
  const sources = await Promise.allSettled([
    fetchOverpassLeads(niche, city, limit),
    fetchFoursquareLeads(niche, city, limit),
    fetchYelpLeads(niche, city, limit),
    fetchGooglePlacesLeads(niche, city, limit),
    fetchGeoapifyLeads(niche, city, limit),
    fetchHERELeads(niche, city, limit),
    fetchCNPJLeads(niche, city, limit),
  ])

  const raw = sources.flatMap(source => source.status === 'fulfilled' ? source.value : [])
  const leadMap = new Map()
  for (const lead of raw) {
    const normalized = {
      ...lead,
      phone: normalizePhone(lead.phone) || null,
      cnpj: lead.cnpj ? normalizePhone(lead.cnpj) || String(lead.cnpj) : null,
      niche: lead.niche || niche,
      city: lead.city || city,
    }
    const key = discoveryKey(normalized)
    leadMap.set(key, mergeLeadRecords(leadMap.get(key), normalized))
  }

  return [...leadMap.values()]
    .map(lead => ({
      ...lead,
      phone: normalizePhone(lead.phone) || null,
      phone_type: lead.phone ? classifyBrazilianPhone(lead.phone) : 'unknown',
      quality_score: discoveryQuality(lead),
      source_count: normalizeLeadSourceList(lead).length,
    }))
    .filter(lead => lead.phone)
    .sort((a, b) => b.quality_score - a.quality_score || sourceListRank(b.sources) - sourceListRank(a.sources))
    .slice(0, limit)
}

async function getLeadContactFlags(phones) {
  const flags = new Map()
  for (const phone of phones) {
    const normalized = normalizePhone(phone)
    if (!normalized) continue
    const leadRes = await supabaseRequest(`/leads?normalized_phone=eq.${encodeURIComponent(normalized)}&select=id,status,last_interaction_at&limit=1`)
    const lead = leadRes.ok && Array.isArray(leadRes.data) ? leadRes.data[0] : null
    const msgRes = await supabaseRequest(`/messages?phone=eq.${encodeURIComponent(normalized)}&direction=eq.outbound&select=id,status,sent_at,created_at&limit=1`)
    const message = msgRes.ok && Array.isArray(msgRes.data) ? msgRes.data[0] : null
    flags.set(normalized, {
      lead_id: lead?.id || null,
      lead_status: lead?.status || null,
      already_contacted: Boolean(message || ['sent', 'responded', 'opt_out', 'invalid'].includes(lead?.status)),
      blocked: ['opt_out', 'invalid'].includes(lead?.status),
    })
  }
  return flags
}

async function findWhatsappInstanceById(instanceId) {
  if (!instanceId) return null
  let result = await supabaseRequest(`/whatsapp_instances?id=eq.${encodeURIComponent(instanceId)}&select=*&limit=1`)
  if (result.ok && Array.isArray(result.data) && result.data[0]) return result.data[0]

  result = await supabaseRequest(`/whatsapp_instances?evolution_instance_name=eq.${encodeURIComponent(instanceId)}&select=*&limit=1`)
  if (result.ok && Array.isArray(result.data) && result.data[0]) return result.data[0]

  result = await supabaseRequest(`/whatsapp_instances?evolution_instance_id=eq.${encodeURIComponent(instanceId)}&select=*&limit=1`)
  if (result.ok && Array.isArray(result.data) && result.data[0]) return result.data[0]

  return null
}

async function ensureLeadRecordFromPreview(item, niche, city) {
  const phone = normalizePhone(item.phone)
  if (!phone) return null
  const existing = await supabaseRequest(`/leads?normalized_phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`)
  if (existing.ok && Array.isArray(existing.data) && existing.data[0]) return existing.data[0]

  const insert = await insertLeadRecord({
    id: randomUUID(),
    name: item.name || 'Lead sem nome',
    phone,
    normalized_phone: phone,
    niche: item.niche || niche,
    city: item.city || city,
    address: item.address || null,
    website: item.website || null,
    cnpj: item.cnpj || null,
    email: item.email || null,
    source: item.source || 'import',
    status: 'new',
    raw_payload: {
      ...(item.raw_payload || {}),
      autopilot_preview_id: item.preview_id || null,
      autopilot_score: item.score || null,
      autopilot_reasons: item.score_reasons || [],
      autopilot_message: item.message || null,
    },
  })
  return insert.ok ? insert.data?.[0] || null : null
}

async function groqChat(messages, { temperature = 0.7, maxTokens = 300 } = {}) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada.')
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await readJsonResponse(response)
  if (!response.ok) throw new Error(data?.error?.message || 'Groq retornou erro.')
  return data.choices?.[0]?.message?.content?.trim() || ''
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt do agente SDR por nicho
// ─────────────────────────────────────────────────────────────────────────────

const NICHE_CONTEXT = {
  restaurante:   'restaurantes e bares — dores comuns: controle de comanda, estoque, pedidos delivery, gestão de mesas',
  odontologia:   'clínicas odontológicas — dores comuns: agendamento manual, prontuário em papel, controle de retornos',
  academia:      'academias e estúdios fitness — dores comuns: controle de mensalidades, check-in manual, gestão de alunos',
  advocacia:     'escritórios de advocacia — dores comuns: controle de prazos, gestão de documentos, cobrança de honorários',
  contabilidade: 'escritórios de contabilidade — dores comuns: entrega de documentos por WhatsApp, controle de obrigações fiscais',
  estetica:      'salões e clínicas de estética — dores comuns: agendamento manual, controle de retorno de clientes, estoque de produtos',
  imobiliaria:   'imobiliárias e corretores — dores comuns: gestão de visitas, follow-up de clientes, controle de documentação',
}

function buildSdrSystemPrompt(lead, originalMessage = '') {
  const ctx = buildCommercialContext(lead, lead.niche, lead.city)
  const nicheCtx = NICHE_CONTEXT[lead.niche] || `negócios de ${lead.niche || 'varejo'}`
  const ctxMsg = originalMessage ? `\nMensagem que enviamos antes para esse lead:\n"${originalMessage}"\n` : ''
  return `Você é um assistente de pré-vendas de uma empresa de tecnologia que desenvolve sistemas e automações sob medida para pequenos e médios negócios. Entregamos em até 1 semana.${ctxMsg}

Contexto do lead:
- Empresa: ${ctx.companyName || 'nao informado'}
- Nicho: ${ctx.nicheRef} (${nicheCtx})
- Cidade: ${ctx.cityRef}

Contexto operacional da ferramenta:
- Objetivo: ${ctx.objective}
- Guardrails: ${ctx.guardrails.join(' | ')}

SEU ÚNICO OBJETIVO: descobrir o maior problema operacional desse negócio hoje. Nada de vender ainda — só entender.

REGRAS:
- Frases curtas, tom de WhatsApp, profissional e humano
- Máximo 2 frases por resposta
- Uma pergunta por vez
- Português brasileiro impecável, sem erro de concordância
- Nome da empresa é opcional: só use quando fizer sentido no contexto
- Quando não usar nome, prefira "vocês" ou "a empresa"
- Nunca mencione preço, valor, plano ou prazo
- Nunca diga que é uma IA ou bot

COMO AGIR EM CADA SITUAÇÃO:

[SITUAÇÃO 1 — Lead responde com curiosidade: "quem é você?", "como me achou?", "o que você faz?"]
→ Seja direto e leve. Ex: "Oi! A gente desenvolve sistemas pra negócios como o seu aqui em ${lead.city || 'sua cidade'} 😊 Posso te fazer uma pergunta rápida?"

[SITUAÇÃO 2 — Lead demonstra abertura: "pode falar", "o que você tem?", "me conta"]
→ Faça a pergunta de descoberta de dor. Ex: "Que parte do dia a dia do ${lead.lead_name || 'negócio'} mais consome o seu tempo hoje?"

[SITUAÇÃO 3 — Lead revela um problema claro]
→ Valide a dor com empatia, diga que provavelmente tem solução e pergunte se pode mostrar. Ex: "Cara, isso é bem comum e tem como automatizar isso sim. Posso te mostrar como funciona numa conversa rápida?"

[SITUAÇÃO 4 — Lead pergunta o preço antes de revelar o problema]
→ Desvie gentilmente. Ex: "Depende muito do que você precisa — cada caso é diferente. Me conta primeiro qual é o maior problema que você tem hoje?"

[SITUAÇÃO 5 — Lead diz que não é o decisor: "fala com meu sócio", "sou funcionário"]
→ Peça o contato do decisor. Ex: "Sem problema! Como eu falo com a pessoa responsável? Posso mandar uma mensagem direta pra ela?"

[SITUAÇÃO 6 — Lead demonstra urgência: "preciso disso logo", "tô com problema agora"]
→ Acelere. Ex: "Entendi, isso a gente consegue resolver rápido. Me conta o que tá acontecendo?"

[SITUAÇÃO 7 — Lead não tem interesse: "não quero", "não preciso", "para de me mandar"]
→ Encerre sem insistir. Ex: "Tudo bem, desculpa o incômodo! Se um dia precisar, é só chamar 😊"

[SITUAÇÃO 8 — Lead faz pergunta técnica: "que sistema é esse?", "é um app?", "funciona em celular?"]
→ Responda de forma simples e redirecione para a dor. Ex: "A gente faz sob medida — pode ser app, sistema web, automação, depende do que você precisa. Mas antes me fala: qual é o maior gargalo que você tem hoje?"

[SITUAÇÃO 9 — Lead está em dúvida, responde mas sem comprometimento]
→ Faça uma pergunta mais específica sobre o nicho. Use o contexto: ${nicheCtx}

[SITUAÇÃO 10 — Conversa travou ou lead parou de responder no meio]
→ Envie uma mensagem leve de retomada: "Oi! Vi que a gente ficou no meio da conversa 😅 Ainda faz sentido eu te mostrar como funciona?"

Responda APENAS com o texto da mensagem WhatsApp, sem explicações, sem colchetes, sem metadados.`
}

async function classifyResponseDetailed(messages = [], lead = {}) {
  const transcript = (messages || [])
    .slice(-8)
    .map(message => `${message.role === 'assistant' ? 'Agente' : 'Lead'}: ${message.content || ''}`)
    .join('\n')

  const fallbackText = transcript.toLowerCase()
  const fallback = {
    response_type: /parar|nao quero|não quero|remova|descadastre|opt.?out/.test(fallbackText)
      ? 'opt_out'
      : /numero errado|número errado|engano|nao sou eu|não sou eu/.test(fallbackText)
        ? 'numero_errado'
        : /tenho interesse|me chama|quero ver|podemos falar|manda mais|me explica/.test(fallbackText)
          ? 'curioso_positivo'
          : /sem interesse|agora nao|agora não|depois vejo/.test(fallbackText)
            ? 'objecao'
            : 'indeterminado',
    summary: 'Classificacao heuristica aplicada.',
    next_action: 'Revisar manualmente a conversa.',
    escalation: false,
    handle_automatic: false,
  }

  if (fallback.response_type === 'opt_out') {
    fallback.next_action = 'Marcar opt-out e encerrar a conversa.'
    fallback.handle_automatic = true
  }
  if (fallback.response_type === 'numero_errado') {
    fallback.next_action = 'Marcar numero invalido e encerrar a conversa.'
    fallback.handle_automatic = true
  }
  if (fallback.response_type === 'curioso_positivo') {
    fallback.next_action = 'Escalar para humano se a dor estiver clara.'
    fallback.escalation = true
  }

  if (!GROQ_API_KEY) return fallback

  const prompt = `Classifique a resposta de um lead de WhatsApp para prospeccao B2B.
Responda SOMENTE JSON valido com este formato:
{
  "response_type": "curioso_positivo|objecao|numero_errado|opt_out|nao_responden|indeterminado",
  "summary": "resumo curto",
  "next_action": "proxima acao operacional",
  "escalation": true,
  "handle_automatic": false
}

Lead: ${lead.lead_name || lead.name || 'empresa'} | Nicho: ${lead.niche || 'nao informado'} | Cidade: ${lead.city || 'nao informada'}
Conversa:
${transcript}`

  try {
    const raw = await groqChat([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 220 })
    const parsed = parseJsonLoose(raw)
    if (!parsed) return fallback
    return {
      response_type: ['curioso_positivo', 'objecao', 'numero_errado', 'opt_out', 'nao_responden', 'indeterminado'].includes(parsed.response_type)
        ? parsed.response_type
        : fallback.response_type,
      summary: String(parsed.summary || fallback.summary).slice(0, 220),
      next_action: String(parsed.next_action || fallback.next_action).slice(0, 220),
      escalation: Boolean(parsed.escalation),
      handle_automatic: Boolean(parsed.handle_automatic),
    }
  } catch {
    return fallback
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Histórico de conversa — Supabase
// ─────────────────────────────────────────────────────────────────────────────

async function getConversation(phone) {
  const result = await supabaseRequest(
    `/conversations?phone=eq.${encodeURIComponent(phone)}&order=created_at.desc&limit=1`
  )
  if (result.ok && Array.isArray(result.data) && result.data.length) return result.data[0]
  return null
}

async function getConversationById(id) {
  const result = await supabaseRequest(`/conversations?id=eq.${encodeURIComponent(id)}&limit=1`)
  if (result.ok && Array.isArray(result.data) && result.data.length) return result.data[0]
  return null
}

async function createConversation(phone, lead = {}) {
  const result = await supabaseRequest('/conversations', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      lead_id:   lead.id   || null,
      lead_name: lead.name || null,
      niche:     lead.niche || null,
      city:      lead.city  || null,
      messages:  [],
      score:     0,
      status:    'active',
      agent_active: true,
      exchanges: 0,
    }),
  })
  return result.ok ? result.data?.[0] : null
}

async function saveConversation(id, patch) {
  await supabaseRequest(`/conversations?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring de lead via Groq
// ─────────────────────────────────────────────────────────────────────────────

async function scoreLead(conversation) {
  if (!GROQ_API_KEY) return { score: conversation.score || 0, reason: 'Groq não configurado' }
  const history = (conversation.messages || [])
    .map(m => `${m.role === 'user' ? 'Lead' : 'Agente'}: ${m.content}`)
    .join('\n')

  const prompt = `Analise essa conversa de prospecção e retorne APENAS um JSON válido, sem markdown, sem explicação:
{"score": 0-100, "reason": "motivo em uma frase curta", "status": "active|hot|cold|opt_out"}

Critérios de score:
- 80-100: revelou problema específico E demonstrou interesse em ver solução
- 60-79: revelou problema mas ainda não pediu solução
- 40-59: respondeu mas sem revelar problema claro ainda
- 20-39: respostas vagas ou frias
- 0-19: não tem interesse ou pediu para parar

Conversa:
${history}`

  try {
    const raw = await groqChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, maxTokens: 80 }
    )
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return {
      score:  Math.min(100, Math.max(0, Number(json.score) || 0)),
      reason: String(json.reason || ''),
      status: ['active', 'hot', 'cold', 'opt_out', 'finished'].includes(json.status) ? json.status : 'active',
    }
  } catch {
    return { score: conversation.score || 0, reason: '', status: 'active' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor principal do agente SDR
// ─────────────────────────────────────────────────────────────────────────────

async function findOutboundMessage(phone) {
  const result = await supabaseRequest(
    `/messages?phone=eq.${encodeURIComponent(phone)}&direction=eq.outbound&order=created_at.desc&limit=1`
  )
  return result.ok && Array.isArray(result.data) && result.data.length ? result.data[0] : null
}

function isCampaignOutboundMessage(message = {}) {
  const source = message.raw_payload?.source
  return Boolean(message.campaign_id) || source === 'campaign' || source === 'campaign-test'
}

async function sendWhatsAppText(instanceName, phone, text) {
  return evolutionRequest(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({ number: phone, text }),
  })
}

async function patchLeadByPhone(phone, payload) {
  const lead = await findLeadByPhone(phone)
  if (!lead?.id) return null
  return supabaseRequest(`/leads?id=eq.${encodeURIComponent(lead.id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

async function runSdrAgent(phone, incomingText) {
  if (!GROQ_API_KEY) return

  const instance = await findDefaultOpenInstance()
  if (!instance?.evolution_instance_name) return

  // So ativa o agente quando a ultima saida foi disparada por campanha.
  const outboundMsg = await findOutboundMessage(phone)
  if (!outboundMsg || !isCampaignOutboundMessage(outboundMsg)) {
    // Nao envia fallback aqui: inbox/manual deve ficar silencioso.
    console.log(`[SDR] Ignorado ${phone}: sem mensagem de campanha anterior.`)
    return
  }

  // Busca ou cria a conversa com contexto do lead
  let conv = await getConversation(phone)
  if (!conv) {
    const lead = await findLeadByPhone(phone)
    conv = await createConversation(phone, lead || {})
  }
  if (!conv) return
  if (!conv.agent_active) return

  // Encerra automaticamente após 6 trocas
  if (conv.exchanges >= 6) {
    await saveConversation(conv.id, { agent_active: false, status: 'finished' })
    return
  }

  const messages = Array.isArray(conv.messages) ? conv.messages : []
  const ts = new Date().toISOString()

  const classified = await classifyResponseDetailed([
    ...messages,
    { role: 'user', content: incomingText, ts },
  ], conv)

  if (classified.handle_automatic) {
    const nextLeadStatus = classified.response_type === 'opt_out' ? 'opt_out' : 'invalid'
    await patchLeadByPhone(phone, { status: nextLeadStatus, last_interaction_at: ts })
    await saveConversation(conv.id, {
      messages: [...messages, { role: 'user', content: incomingText, ts }],
      exchanges: conv.exchanges + 1,
      score: 0,
      score_reason: classified.summary,
      status: classified.response_type === 'opt_out' ? 'opt_out' : 'finished',
      agent_active: false,
      last_message_at: ts,
    })
    if (classified.response_type === 'numero_errado') {
      await sendWhatsAppText(instance.evolution_instance_name, phone, 'Perfeito, obrigado pelo aviso. Vou encerrar por aqui.')
    }
    return
  }

  if (classified.escalation) {
    await patchLeadByPhone(phone, { status: 'responded', last_interaction_at: ts })
    await saveConversation(conv.id, {
      messages: [...messages, { role: 'user', content: incomingText, ts }],
      exchanges: conv.exchanges + 1,
      score: Math.max(HOT_LEAD_SCORE, Number(conv.score || 0)),
      score_reason: classified.summary,
      status: 'hot',
      agent_active: false,
      last_message_at: ts,
    })
    await upsertHotHandoff({
      phone,
      conversation_id: conv.id,
      lead_id: conv.lead_id || null,
      lead_name: conv.lead_name || null,
      score: Math.max(HOT_LEAD_SCORE, Number(conv.score || 0)),
      reason: classified.summary || 'Classificacao marcou conversa como quente.',
      source: 'classification',
    })
    console.log(`[SDR] ${phone} escalado para humano | ${classified.summary}`)
    return
  }

  // Monta system prompt com contexto da mensagem enviada
  const systemPrompt = buildSdrSystemPrompt(conv, outboundMsg.body)

  // Adiciona mensagem do lead ao histórico
  messages.push({ role: 'user', content: incomingText, ts })

  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ]

  let reply = ''
  try {
    reply = await groqChat(groqMessages, { temperature: 0.75, maxTokens: 200 })
  } catch (e) {
    console.error('[SDR] Groq error:', e.message)
    return
  }

  reply = await finalizeCommercialMessage(reply, {
    stage: 'sdr_reply',
    lead: {
      name: conv.lead_name,
      niche: conv.niche,
      city: conv.city,
    },
    niche: conv.niche,
    city: conv.city,
    originalMessage: outboundMsg.body,
  })

  messages.push({ role: 'assistant', content: reply, ts: new Date().toISOString() })

  const scoreResult = await scoreLead({ ...conv, messages })
  const isHot = scoreResult.score >= HOT_LEAD_SCORE

  await saveConversation(conv.id, {
    messages,
    exchanges:       conv.exchanges + 1,
    score:           scoreResult.score,
    score_reason:    scoreResult.reason,
    status:          isHot ? 'hot' : scoreResult.status,
    agent_active:    !isHot && scoreResult.status !== 'opt_out' && scoreResult.status !== 'finished',
    last_message_at: ts,
  })

  if (isHot) {
    await patchLeadByPhone(phone, { status: 'responded', last_interaction_at: ts })
    await upsertHotHandoff({
      phone,
      conversation_id: conv.id,
      lead_id: conv.lead_id || null,
      lead_name: conv.lead_name || null,
      score: Number(scoreResult.score || HOT_LEAD_SCORE),
      reason: scoreResult.reason || 'Score de conversa acima do limiar de lead quente.',
      source: 'score',
    })
  }

  console.log(`[SDR] ${phone} | score:${scoreResult.score} | status:${scoreResult.status} | "${reply.slice(0, 60)}..."`)

  await sendWhatsAppText(instance.evolution_instance_name, phone, reply)
}

async function handleApi(req, res, url) {
  const reqOrigin = req.headers.origin || ''
  const sendJson = (r, s, d) => _sendJson(r, s, d, reqOrigin)
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

  if (url.pathname === '/api/classify-response' && req.method === 'POST') {
    const body = await readBody(req)
    const messages = Array.isArray(body.messages) ? body.messages : []
    const lead = body.lead || {}

    const classification = await classifyResponseDetailed(messages, lead)
    return sendJson(res, 200, classification)
  }

  if (url.pathname === '/api/dashboard/stats' && req.method === 'GET') {
    const safeData = result => (result.ok && Array.isArray(result.data) ? result.data : [])
    const safeLen = result => safeData(result).length

    const leadsRes = await supabaseRequest('/leads?select=id,status&limit=5000')
    const outboundRes = await supabaseRequest('/messages?select=id&direction=eq.outbound&status=eq.sent&limit=5000')
    const inboundRes = await supabaseRequest('/messages?select=id&direction=eq.inbound&limit=5000')
    const hotConvRes = await supabaseRequest('/conversations?select=id&status=eq.hot&limit=5000')
    const respondedLeadsRes = await supabaseRequest('/leads?select=id&status=eq.responded&limit=5000')

    const leadsFound = safeLen(leadsRes)
    const messagesSent = safeLen(outboundRes)
    const repliesReceived = safeLen(inboundRes)
    const hotLeads = Math.max(safeLen(hotConvRes), safeLen(respondedLeadsRes))

    return sendJson(res, 200, {
      leads_found: leadsFound,
      messages_sent: messagesSent,
      replies_received: repliesReceived,
      hot_leads: hotLeads,
      hints: {
        leads_found: 'total de leads no CRM',
        messages_sent: 'mensagens outbound com status sent',
        replies_received: 'mensagens inbound registradas',
        hot_leads: 'status hot/responded para priorizar humano',
      },
    })
  }


    if (url.pathname === '/api/campaigns' && req.method === 'GET') {
    let result = await supabaseRequest('/campaigns?select=id,name,niche,city,neighborhood,use_audio,template_id,status,quantity_requested,daily_limit,sent_count,failed_count,delay_min_s,delay_max_s,started_at,finished_at,created_at&order=created_at.desc')
    if (!result.ok && isMissingColumn(result)) {
      result = await supabaseRequest('/campaigns?select=id,name,niche,city,template_id,status,quantity_requested,daily_limit,delay_min_seconds,delay_max_seconds,started_at,finished_at,created_at&order=created_at.desc')
    }
    return sendJson(res, result.status, result.ok && Array.isArray(result.data) ? result.data.map(normalizeCampaignRecord) : result.data)
  }

  if (url.pathname === '/api/campaigns' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body.name || !body.niche || !body.city) {
      return sendJson(res, 400, { message: 'name, niche e city sao obrigatorios.' })
    }
    const payload = {
      name: body.name,
      niche: body.niche,
      city: body.city,
      neighborhood: body.neighborhood || null,
      use_audio: Boolean(body.use_audio),
      template_id: body.template_id || null,
      quantity_requested: Number(body.quantity_requested || body.quantity || 50),
      daily_limit: Number(body.daily_limit || 50),
      delay_min_s: Number(body.delay_min_s || 30),
      delay_max_s: Number(body.delay_max_s || 90),
      status: 'draft',
    }

    let result = await supabaseRequest('/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!result.ok && isMissingColumn(result)) {
      result = await supabaseRequest('/campaigns', {
        method: 'POST',
        body: JSON.stringify(campaignPatchPayload(payload, true)),
      })
    }
    const campaign = result.data?.[0] || result.data
    return sendJson(res, result.status, result.ok ? normalizeCampaignRecord(campaign) : campaign)
  }

  if (url.pathname === '/api/leads' && req.method === 'GET') {
    const search = sanitizeLike(url.searchParams.get('search'))
    const hasWebsite = url.searchParams.get('hasWebsite')
    const status = sanitizeLike(url.searchParams.get('status'))
    const params = [
      'select=id,name,phone,normalized_phone,niche,city,address,website,cnpj,email,source,status,raw_payload,last_interaction_at,created_at',
      'order=created_at.desc',
      'limit=200',
    ]
    if (search) params.push(`or=(name.ilike.*${encodeURIComponent(search)}*,niche.ilike.*${encodeURIComponent(search)}*,city.ilike.*${encodeURIComponent(search)}*)`)
    if (hasWebsite === 'true') params.push('website=not.is.null')
    if (hasWebsite === 'false') params.push('website=is.null')
    if (status) params.push(`status=eq.${encodeURIComponent(status)}`)
    let result = await supabaseRequest(`/leads?${params.join('&')}`)
    if (!result.ok && isMissingColumn(result)) {
      params[0] = 'select=id,name,phone,normalized_phone,niche,city,address,website,source,status,last_interaction_at,created_at'
      result = await supabaseRequest(`/leads?${params.join('&')}`)
    }
    return sendJson(res, result.status, result.data)
  }

  if (url.pathname === '/api/leads' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body.name) return sendJson(res, 400, { message: 'name obrigatorio.' })
    const phone = normalizePhone(body.phone)
    const result = await insertLeadRecord({
      name: body.name,
      phone: body.phone || null,
      normalized_phone: phone || null,
      niche: body.niche || null,
      city: body.city || null,
      address: body.address || null,
      website: body.website || null,
      cnpj: body.cnpj || null,
      email: body.email || null,
      source: body.source || 'manual',
      status: body.status || 'new',
      raw_payload: body.raw_payload || null,
    })
    return sendJson(res, result.status, result.data?.[0] || result.data)
  }

  if (url.pathname === '/api/leads/dedup' && req.method === 'POST') {
    // Busca todos os leads agrupados por normalized_phone, mantém o de status mais valioso e apaga os demais
    const allRes = await supabaseRequest('/leads?select=id,normalized_phone,status,created_at&order=created_at.asc&limit=5000')
    if (!allRes.ok) return sendJson(res, allRes.status, { message: 'Erro ao buscar leads.' })
    const leads = allRes.data || []
    const STATUS_PRIORITY = { qualified: 4, responded: 3, sent: 2, new: 1, invalid: 0, opt_out: 0 }
    const byPhone = new Map()
    for (const lead of leads) {
      const phone = lead.normalized_phone
      if (!phone) continue
      if (!byPhone.has(phone)) { byPhone.set(phone, []); }
      byPhone.get(phone).push(lead)
    }
    const toDelete = []
    for (const [, group] of byPhone) {
      if (group.length < 2) continue
      group.sort((a, b) => (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0))
      for (let i = 1; i < group.length; i++) toDelete.push(group[i].id)
    }
    if (!toDelete.length) return sendJson(res, 200, { deleted: 0, message: 'Nenhuma duplicata encontrada.' })
    // Deleta em lotes de 50
    let deleted = 0
    for (let i = 0; i < toDelete.length; i += 50) {
      const batch = toDelete.slice(i, i + 50)
      const ids = batch.map(id => `"${id}"`).join(',')
      const del = await supabaseRequest(`/leads?id=in.(${ids})`, { method: 'DELETE' })
      if (del.ok) deleted += batch.length
    }
    return sendJson(res, 200, { deleted, message: `${deleted} duplicata(s) removida(s).` })
  }

  const leadStatusMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/status$/)
  if (leadStatusMatch && req.method === 'PATCH') {
    const leadId = leadStatusMatch[1]
    const body = await readBody(req)
    const allowed = new Set(['new', 'qualified', 'invalid', 'opt_out'])
    if (!allowed.has(body.status)) return sendJson(res, 400, { message: 'Status de lead invalido.' })
    const patch = {
      status: body.status,
      last_interaction_at: ['qualified', 'invalid', 'opt_out'].includes(body.status) ? new Date().toISOString() : null,
    }
    const result = await supabaseRequest(`/leads?id=eq.${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return sendJson(res, result.status, result.data?.[0] || result.data)
  }

  if (url.pathname === '/api/templates' && req.method === 'GET') {
    const result = await supabaseRequest('/message_templates?select=id,name,purpose,body,variables,is_active,created_at&is_active=eq.true&order=created_at.desc')
    return sendJson(res, result.status, result.data)
  }

  if (url.pathname === '/api/templates' && req.method === 'POST') {
    const body = await readBody(req)
    if (!body.name || !body.body) return sendJson(res, 400, { message: 'name e body sao obrigatorios.' })
    const purposeMap = {
      'Mensagem inicial': 'initial',
      'Sem resposta': 'follow_up',
      'Lead respondeu': 'manual_reply',
    }
    const result = await supabaseRequest('/message_templates', {
      method: 'POST',
      body: JSON.stringify({
        name: body.name,
        purpose: body.purpose || purposeMap[body.use] || 'other',
        body: body.body,
        variables: body.variables || [],
        is_active: true,
      }),
    })
    return sendJson(res, result.status, result.data?.[0] || result.data)
  }

  if (url.pathname === '/api/sequences' && req.method === 'GET') {
    const result = await listMessageSequences()
    return sendJson(res, result.status || 200, result.data)
  }

  if (url.pathname === '/api/sequences' && req.method === 'POST') {
    const body = await readBody(req)
    const result = await createMessageSequence(body)
    return sendJson(res, result.status || 200, result.data)
  }

  const seqStepMatch = url.pathname.match(/^\/api\/sequences\/([^/]+)\/steps\/([^/]+)$/)
  if (seqStepMatch && req.method === 'PATCH') {
    const sequenceId = decodeURIComponent(seqStepMatch[1])
    const stepIndex = Number(seqStepMatch[2])
    const body = await readBody(req)
    const result = await updateMessageSequenceStep(sequenceId, stepIndex, {
      template_id: body.template_id || null,
      label: body.label,
      condition: body.condition,
      delay_hours: body.delay_hours,
      is_active: body.is_active,
    })
    return sendJson(res, result.status || 200, result.data)
  }

  if (url.pathname === '/api/inbox/conversations' && req.method === 'GET') {
    const result = await supabaseRequest('/messages?select=id,lead_id,direction,phone,body,status,sent_at,received_at,created_at,leads(name,status)&order=created_at.asc&limit=500')
    if (!result.ok) return sendJson(res, result.status, result.data)

    const convResult = await supabaseRequest('/conversations?select=id,phone,score,score_reason,status,agent_active,last_message_at&limit=500')
    const convMap = new Map(
      convResult.ok && Array.isArray(convResult.data)
        ? convResult.data.map(item => [normalizePhone(item.phone), item])
        : []
    )
    const hotRows = await listOpenHotHandoffs(500)
    const hotMap = new Map(hotRows.map(item => [normalizePhone(item.phone), item]))

    const grouped = new Map()
    for (const message of result.data || []) {
      const phone = message.phone || 'sem-telefone'
      const normalizedPhone = normalizePhone(phone)
      const convState = convMap.get(normalizedPhone)
      if (!grouped.has(phone)) {
        grouped.set(phone, {
          id: phone,
          conversation_id: convState?.id || null,
          phone,
          lead: message.leads?.name || phone,
          mood: convState?.status === 'hot'
            ? 'Quente'
            : message.leads?.status === 'responded'
              ? 'Respondeu'
              : message.direction === 'inbound'
                ? 'Respondeu'
                : 'Aguardando',
          status: convState?.status || 'active',
          score: Number(convState?.score || 0),
          score_reason: convState?.score_reason || '',
          agent_active: convState?.agent_active !== false,
          is_hot_queue: Boolean(hotMap.get(normalizedPhone)),
          hot_reason: hotMap.get(normalizedPhone)?.reason || '',
          time: '',
          messages: [],
        })
      }
      const conv = grouped.get(phone)
      const date = message.received_at || message.sent_at || message.created_at
      conv.time = date ? new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
      conv.messages.push({
        id: message.id,
        dir: message.direction === 'outbound' ? 'out' : 'in',
        text: message.body || '',
        status: message.status,
        time: date ? new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
      })
    }
    return sendJson(res, 200, Array.from(grouped.values()).sort((a, b) => String(b.time).localeCompare(String(a.time))))
  }

  if (url.pathname === '/api/inbox/hot-queue' && req.method === 'GET') {
    const rows = await listOpenHotHandoffs(200)
    return sendJson(res, 200, rows)
  }

  const inboxAgentControlMatch = url.pathname.match(/^\/api\/inbox\/conversations\/([^/]+)\/agent$/)
  if (inboxAgentControlMatch && req.method === 'PATCH') {
    const conversationRef = decodeURIComponent(inboxAgentControlMatch[1])
    const body = await readBody(req)
    const mode = String(body.mode || '').trim().toLowerCase()
    if (!['human', 'agent', 'resolved'].includes(mode)) {
      return sendJson(res, 400, { message: 'mode invalido. Use human, agent ou resolved.' })
    }

    let conv = conversationRef.includes('-')
      ? await getConversationById(conversationRef)
      : await getConversation(normalizePhone(conversationRef))
    if (!conv) {
      const phoneRef = normalizePhone(conversationRef)
      conv = phoneRef ? await getConversation(phoneRef) : null
    }
    if (!conv?.id) return sendJson(res, 404, { message: 'Conversa nao encontrada.' })

    const patchByMode = {
      human: { agent_active: false, status: 'hot' },
      agent: { agent_active: true, status: 'active' },
      resolved: { agent_active: false, status: 'finished' },
    }
    const patch = {
      ...patchByMode[mode],
      last_message_at: new Date().toISOString(),
    }

    await saveConversation(conv.id, patch)

    if (mode === 'human') {
      await upsertHotHandoff({
        phone: conv.phone,
        conversation_id: conv.id,
        lead_id: conv.lead_id || null,
        lead_name: conv.lead_name || null,
        score: Number(conv.score || HOT_LEAD_SCORE),
        reason: body.reason || 'Conversa assumida manualmente por humano.',
        source: 'manual',
      })
    } else {
      await resolveHotHandoff(conv.phone)
    }

    const updated = await getConversationById(conv.id)
    return sendJson(res, 200, updated || { id: conv.id, ...patch })
  }

  const inboxSendMatch = url.pathname.match(/^\/api\/inbox\/conversations\/([^/]+)\/send$/)
  if (inboxSendMatch && req.method === 'POST') {
    const phone = normalizePhone(decodeURIComponent(inboxSendMatch[1]))
    const body = await readBody(req)
    if (!phone) return sendJson(res, 400, { message: 'Telefone obrigatorio.' })
    if (!body.text) return sendJson(res, 400, { message: 'text obrigatorio.' })

    const instance = body.instanceName
      ? await findWhatsappInstance(body.instanceName)
      : await findDefaultOpenInstance()
    if (!instance?.evolution_instance_name) {
      return sendJson(res, 409, { message: 'Nenhuma instancia WhatsApp aberta encontrada.' })
    }

    const lead = await findLeadByPhone(phone)
    const pendingMessage = await insertMessage({
      lead_id: lead?.id || null,
      whatsapp_instance_id: instance.id,
      direction: 'outbound',
      kind: 'text',
      phone,
      body: body.text,
      status: 'pending',
      raw_payload: { instanceName: instance.evolution_instance_name, source: 'inbox' },
    })

    const result = await evolutionRequest(`/message/sendText/${encodeURIComponent(instance.evolution_instance_name)}`, {
      method: 'POST',
      body: JSON.stringify({ number: phone, text: body.text }),
    })

    if (pendingMessage?.id) {
      await supabaseRequest(`/messages?id=eq.${encodeURIComponent(pendingMessage.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: result.ok ? 'sent' : 'failed',
          provider_message_id: result.data?.key?.id || result.data?.message?.key?.id || result.data?.id || null,
          error_message: result.ok ? null : result.data?.message || result.data?.error || 'Falha no envio',
          raw_payload: result.data || {},
          sent_at: result.ok ? new Date().toISOString() : null,
        }),
      })
    }
    if (result.ok) await incrementInstanceSentToday(instance.id, instance.sent_today)
    if (!result.ok) return sendJson(res, result.status, result.data)

    return sendJson(res, 200, {
      dir: 'out',
      text: body.text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    })
  }

  if (url.pathname === '/api/webhooks/evolution' && req.method === 'POST') {
    const body = await readBody(req)
    const event = body?.event || body?.type || ''
    const isMessage = event.includes('messages') || event.includes('MESSAGES') || body?.data?.message || body?.message

    if (isMessage) {
      await saveInboundMessage(body)

      // Aciona o agente SDR apenas para mensagens recebidas de leads (não de nós mesmos)
      const key = body?.data?.key || body?.message?.key || {}
      const isFromMe = key?.fromMe === true
      const remoteJid = key?.remoteJid || body?.data?.remoteJid || ''
      const isGroup = remoteJid.includes('@g.us')

      if (!isFromMe && !isGroup) {
        const phone = normalizePhone(remoteJid.replace(/@.*/, ''))
        const text =
          body?.data?.message?.conversation ||
          body?.data?.message?.extendedTextMessage?.text ||
          body?.message?.conversation ||
          body?.text || ''

        if (phone && text) {
          // Roda o agente em background — não bloqueia o webhook
          runSdrAgent(phone, text).catch(e => console.error('[SDR] Agent error:', e.message))
        }
      }
    }

    return sendJson(res, 200, { ok: true })
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
      if (pendingMessage?.id) {
        await supabaseRequest(`/messages?id=eq.${encodeURIComponent(pendingMessage.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'sent',
            provider_message_id: providerMessageId,
            raw_payload: result.data || {},
            sent_at: new Date().toISOString(),
          }),
        })
      }
      await incrementInstanceSentToday(instanceRecord?.id, instanceRecord?.sent_today)
    } else {
      if (pendingMessage?.id) {
        await supabaseRequest(`/messages?id=eq.${encodeURIComponent(pendingMessage.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'failed',
            error_message: result.data?.message || result.data?.error || 'Falha no envio',
            raw_payload: result.data || {},
          }),
        })
      }
    }

    return sendJson(res, result.status, result.data)
  }

  const deleteMatch = url.pathname.match(/^\/api\/whatsapp\/instances\/([^/]+)$/)
  if (deleteMatch && req.method === 'DELETE') {
    const instanceName = encodeURIComponent(deleteMatch[1])
    const result = await evolutionRequest(`/instance/delete/${instanceName}`, { method: 'DELETE' })
    return sendJson(res, result.status, result.data)
  }

  const campaignStatusMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/status$/)
  if (campaignStatusMatch && req.method === 'GET') {
    const campaignId = campaignStatusMatch[1]
    let campRes = await supabaseRequest(`/campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,name,status,sent_count,failed_count,quantity_requested&limit=1`)
    if (!campRes.ok && isMissingColumn(campRes)) {
      campRes = await supabaseRequest(`/campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,name,status,quantity_requested&limit=1`)
    }
    const rows = await campaignQueueRows(campaignId)
    if (!campRes.ok) return sendJson(res, campRes.status, campRes.data)
    const campaignRow = campRes.data?.[0]
    if (!campaignRow) return sendJson(res, 404, { message: 'Campanha nao encontrada.' })
    const campaign = normalizeCampaignRecord(campaignRow)
    const sent = rows.filter(r => r.status === 'sent').length || campaign.sent_count
    const failed = rows.filter(r => r.status === 'failed').length || campaign.failed_count
    return sendJson(res, 200, {
      ...campaign,
      total: rows.length,
      pending: rows.filter(r => r.status === 'pending').length,
      sent,
      failed,
    })
  }

  const campaignRunMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/run$/)
  if (campaignRunMatch && req.method === 'POST') {
    const campaignId = campaignRunMatch[1]

    let campRes = await supabaseRequest(`/campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,name,niche,city,template_id,status,quantity_requested,daily_limit,delay_min_s,delay_max_s&limit=1`)
    if (!campRes.ok && isMissingColumn(campRes)) {
      campRes = await supabaseRequest(`/campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,name,niche,city,template_id,status,quantity_requested,daily_limit,delay_min_seconds,delay_max_seconds&limit=1`)
    }
    if (!campRes.ok) return sendJson(res, campRes.status, campRes.data)
    const campaignRow = campRes.data?.[0]
    if (!campaignRow) return sendJson(res, 404, { message: 'Campanha nao encontrada.' })
    const campaign = normalizeCampaignRecord(campaignRow)
    if (campaign.status === 'running') return sendJson(res, 409, { message: 'Campanha ja esta rodando.' })

    const instance = await findDefaultOpenInstance()
    if (!instance) return sendJson(res, 409, { message: 'Nenhuma instancia WhatsApp aberta. Conecte uma instancia primeiro.' })

    let templateBody = null
    if (campaign.template_id) {
      const tplRes = await supabaseRequest(`/message_templates?id=eq.${encodeURIComponent(campaign.template_id)}&select=body&limit=1`)
      templateBody = tplRes.data?.[0]?.body || null
    }
    if (!templateBody) return sendJson(res, 400, { message: 'Template nao configurado na campanha.' })

    const approvedLeads = await listApprovedCampaignLeads(campaign)
    if (!approvedLeads.length) {
      return sendJson(res, 409, {
        message: 'Nenhum lead aprovado para esta campanha. Importe leads e aprove manualmente antes de disparar.',
        safety: 'campaign_requires_qualified_leads',
      })
    }

    await patchCampaign(campaignId, { status: 'running', started_at: new Date().toISOString(), sent_count: 0, failed_count: 0 })

    sendJson(res, 202, { message: 'Campanha iniciada com leads aprovados.', total: approvedLeads.length, instance: instance.evolution_instance_name })

    runCampaignBackground(campaignId, campaign, approvedLeads, templateBody, instance).catch(() => {
      patchCampaign(campaignId, { status: 'error' })
    })
    return
  }

  const campaignTestSendMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/send-test$/)
  if (campaignTestSendMatch && req.method === 'POST') {
    const campaignId = campaignTestSendMatch[1]
    const body = await readBody(req)
    const number = normalizePhone(body.number)
    if (!number) return sendJson(res, 400, { message: 'number obrigatorio.' })
    if (!/^\d{10,15}$/.test(number)) {
      return sendJson(res, 400, { message: 'Numero invalido. Use DDI + DDD + numero, exemplo: 5531999999999.' })
    }

    let campRes = await supabaseRequest(`/campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,name,niche,city,template_id,status,quantity_requested,daily_limit,delay_min_s,delay_max_s&limit=1`)
    if (!campRes.ok && isMissingColumn(campRes)) {
      campRes = await supabaseRequest(`/campaigns?id=eq.${encodeURIComponent(campaignId)}&select=id,name,niche,city,template_id,status,quantity_requested,daily_limit,delay_min_seconds,delay_max_seconds&limit=1`)
    }
    if (!campRes.ok) return sendJson(res, campRes.status, campRes.data)
    const campaignRow = campRes.data?.[0]
    if (!campaignRow) return sendJson(res, 404, { message: 'Campanha nao encontrada.' })
    const campaign = normalizeCampaignRecord(campaignRow)

    const instance = body.instanceName
      ? await findWhatsappInstance(body.instanceName)
      : await findDefaultOpenInstance()
    if (!instance?.evolution_instance_name) {
      return sendJson(res, 409, { message: 'Nenhuma instancia WhatsApp aberta encontrada.' })
    }

    let templateBody = body.text || null
    if (!templateBody && campaign.template_id) {
      const tplRes = await supabaseRequest(`/message_templates?id=eq.${encodeURIComponent(campaign.template_id)}&select=body&limit=1`)
      templateBody = tplRes.data?.[0]?.body || null
    }
    if (!templateBody) return sendJson(res, 400, { message: 'Template nao configurado na campanha.' })

    const leadName = body.name || 'Usuario teste'
    let lead = await findLeadByPhone(number)
    if (!lead) {
      const leadRes = await insertLeadRecord({
        name: leadName,
        phone: number,
        normalized_phone: number,
        niche: campaign.niche,
        city: campaign.city,
        source: 'manual',
        status: 'new',
      })
      if (!leadRes.ok) return sendJson(res, leadRes.status, leadRes.data)
      lead = leadRes.data?.[0] || null
    }

    const text = interpolate(templateBody, {
      nome_empresa: leadName,
      cidade: campaign.city,
      nicho: campaign.niche,
      servico: campaign.niche,
    })

    let clId = null
    const clRes = await createCampaignLead({
      campaign_id: campaignId,
      lead_id: lead?.id || null,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    })
    if (clRes.ok) clId = clRes.data?.[0]?.id || null
    if (!clId) clId = (await findCampaignLead(campaignId, lead?.id))?.id || null

    await patchCampaign(campaignId, { status: 'running', started_at: new Date().toISOString(), sent_count: 0, failed_count: 0 })

    const pendingMessage = await insertMessage({
      lead_id: lead?.id || null,
      whatsapp_instance_id: instance.id,
      campaign_id: campaignId,
      direction: 'outbound',
      kind: 'text',
      phone: number,
      body: text,
      status: 'pending',
      raw_payload: { instanceName: instance.evolution_instance_name, source: 'campaign-test' },
    })

    const result = await evolutionRequest(`/message/sendText/${encodeURIComponent(instance.evolution_instance_name)}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    })

    const ok = result.ok
    const providerMessageId =
      result.data?.key?.id ||
      result.data?.message?.key?.id ||
      result.data?.id ||
      null

    if (pendingMessage?.id) {
      await supabaseRequest(`/messages?id=eq.${encodeURIComponent(pendingMessage.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: ok ? 'sent' : 'failed',
          provider_message_id: providerMessageId,
          error_message: ok ? null : result.data?.message || result.data?.error || 'Falha no envio',
          raw_payload: result.data || {},
          sent_at: ok ? new Date().toISOString() : null,
        }),
      })
    }

    await updateCampaignLead(clId, {
      status: ok ? 'sent' : 'failed',
      message_id: pendingMessage?.id || null,
      sent_at: new Date().toISOString(),
      error: ok ? null : result.data?.message || result.data?.error || 'Falha no envio',
    })

    await patchCampaign(campaignId, {
      status: ok ? 'finished' : 'error',
      finished_at: new Date().toISOString(),
      sent_count: ok ? 1 : 0,
      failed_count: ok ? 0 : 1,
    })
    if (ok) {
      await incrementInstanceSentToday(instance.id, instance.sent_today)
      if (lead?.id) {
        await supabaseRequest(`/leads?id=eq.${encodeURIComponent(lead.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'sent', last_interaction_at: new Date().toISOString() }),
        })
      }
    }

    if (!ok) return sendJson(res, result.status, result.data)
    return sendJson(res, 200, {
      message: 'Mensagem de teste enviada.',
      campaignId,
      leadId: lead?.id || null,
      messageId: pendingMessage?.id || null,
      instance: instance.evolution_instance_name,
      number,
      text,
    })
  }

  if (url.pathname === '/api/search/sources' && req.method === 'GET') {
    // Verifica se a tabela CNPJ existe no Supabase
    const cnpjCheck = await supabaseRequest('/cnpj_empresas?select=cnpj&limit=1')
    const cnpjReady = cnpjCheck.ok && !cnpjCheck.data?.code
    const cnpjCount = cnpjReady ? 'OK' : 0

    return sendJson(res, 200, {
      overpass:      { active: true,                      description: 'OpenStreetMap — gratuito, sem chave. Funciona mas tem poucos telefones BR.' },
      cnpj:          { active: cnpjReady,                 description: cnpjReady ? `Receita Federal BR — dados importados.` : 'Receita Federal BR — tabela não criada. Rode: scripts/cnpj-schema.sql no Supabase + node scripts/import-cnpj.mjs --file 0', setup_required: !cnpjReady },
      yelp:          { active: !!YELP_API_KEY,            description: 'Yelp Fusion — 500 req/dia grátis • yelp.com/developers (var: YELP_API_KEY)' },
      geoapify:      { active: !!GEOAPIFY_API_KEY,        description: 'Geoapify Places — 3.000 req/dia grátis • geoapify.com (var: GEOAPIFY_API_KEY)' },
      here:          { active: !!HERE_API_KEY,            description: 'HERE Discover — 250k req/mês grátis • developer.here.com (var: HERE_API_KEY)' },
      foursquare:    { active: !!FOURSQUARE_API_KEY,      description: 'Foursquare Places — chave gratuita • developer.foursquare.com (var: FOURSQUARE_API_KEY)' },
      google_places: { active: !!GOOGLE_PLACES_API_KEY,   description: 'Google Places — melhor cobertura + telefones • console.cloud.google.com (var: GOOGLE_PLACES_API_KEY)' },
    })
  }

  if (url.pathname === '/api/search/leads' && req.method === 'GET') {
    const niche = (url.searchParams.get('niche') || '').toLowerCase().trim()
    const city = (url.searchParams.get('city') || '').trim()
    const limit = Math.min(Number(url.searchParams.get('limit') || 30), 100)

    if (!niche || !city) return sendJson(res, 400, { message: 'niche e city sao obrigatorios.' })

    const [overpassSettled, fsqSettled, yelpSettled, googleSettled, geoapifySettled, hereSettled, cnpjSettled] = await Promise.allSettled([
      fetchOverpassLeads(niche, city, limit),
      fetchFoursquareLeads(niche, city, limit),
      fetchYelpLeads(niche, city, limit),
      fetchGooglePlacesLeads(niche, city, limit),
      fetchGeoapifyLeads(niche, city, limit),
      fetchHERELeads(niche, city, limit),
      fetchCNPJLeads(niche, city, limit),
    ])

    const overpassLeads  = overpassSettled.status  === 'fulfilled' ? overpassSettled.value  : []
    const fsqLeads       = fsqSettled.status       === 'fulfilled' ? fsqSettled.value       : []
    const yelpLeads      = yelpSettled.status      === 'fulfilled' ? yelpSettled.value      : []
    const googleLeads    = googleSettled.status    === 'fulfilled' ? googleSettled.value    : []
    const geoapifyLeads  = geoapifySettled.status  === 'fulfilled' ? geoapifySettled.value  : []
    const hereLeads      = hereSettled.status      === 'fulfilled' ? hereSettled.value      : []
    const cnpjLeads      = cnpjSettled.status      === 'fulfilled' ? cnpjSettled.value      : []

    const sourceStats = {
      overpass:      { count: overpassLeads.length,  active: true },
      foursquare:    { count: fsqLeads.length,       active: !!FOURSQUARE_API_KEY },
      yelp:          { count: yelpLeads.length,      active: !!YELP_API_KEY },
      google_places: { count: googleLeads.length,    active: !!GOOGLE_PLACES_API_KEY },
      geoapify:      { count: geoapifyLeads.length,  active: !!GEOAPIFY_API_KEY },
      here:          { count: hereLeads.length,      active: !!HERE_API_KEY },
      cnpj:          { count: cnpjLeads.length,      active: true },
    }
    console.log('[search/leads]', niche, city, JSON.stringify(sourceStats))

    const all = [...overpassLeads, ...fsqLeads, ...yelpLeads, ...googleLeads, ...geoapifyLeads, ...hereLeads, ...cnpjLeads]
    if (!all.length) {
      return sendJson(res, 502, {
        message: 'Nenhuma fonte retornou resultados. Tente novamente em instantes.',
        sources: sourceStats,
      })
    }

    // Merge: deduplica por telefone, CNPJ ou nome/endereco e preserva todas as fontes.
    const leadMap = new Map()
    for (const lead of all) {
      const normalized = {
        ...lead,
        phone: normalizePhone(lead.phone) || null,
        cnpj: lead.cnpj ? normalizePhone(lead.cnpj) || String(lead.cnpj) : null,
      }
      const key = discoveryKey(normalized)
      leadMap.set(key, mergeLeadRecords(leadMap.get(key), normalized))
    }

    const results = [...leadMap.values()]
      .map(lead => ({
        ...lead,
        phone_type: lead.phone ? classifyBrazilianPhone(lead.phone) : 'unknown',
        quality_score: discoveryQuality(lead),
        source_count: normalizeLeadSourceList(lead).length,
      }))
      .sort((a, b) => b.quality_score - a.quality_score || sourceListRank(b.sources) - sourceListRank(a.sources))
      .slice(0, limit)

    return sendJson(res, 200, results)
  }

  if (url.pathname.replace(/\/+$/, '') === '/api/tts/preview' && req.method === 'POST') {
    const body    = await readBody(req)
    const text    = String(body.text || '').trim()
    const engine  = ['piper', 'kokoro', 'edge', 'xtts'].includes(body.engine) ? body.engine : 'edge'
    const speed   = Math.min(Math.max(Number(body.speed) || 1.0, 0.5), 1.5)
    const voice   = engine === 'edge' ? String(body.voice || '') : ''
    const extra   = {
      style:       String(body.style       || 'chat'),
      styledegree: Math.min(Math.max(Number(body.styledegree) || 1.5, 0.01), 2.0),
      pitch_pct:   Math.min(Math.max(Number(body.pitch_pct)   || -3,  -50),  50),
      character:   String(body.character   || 'casual'),
      prefix:      String(body.prefix      || ''),
      suffix:      String(body.suffix      || ''),
      humanize_audio: Boolean(body.humanize_audio),
    }
    if (!text) return sendJson(res, 400, { message: 'text obrigatorio.' })
    try {
      const speech = await generateSpeechResult(text, engine, speed, voice, extra)
      if (!speech.audioBase64) {
        return sendJson(res, 502, { message: speech.error || 'TTS nao retornou audio para o preview.' })
      }
      return sendJson(res, 200, {
        audio_base64: speech.audioBase64,
        format: speech.format,
        engine: speech.engine,
        requested_engine: speech.requestedEngine || engine,
      })
    } catch (e) {
      return sendJson(res, 500, { message: String(e.message || e) })
    }
  }

  if (url.pathname === '/api/whatsapp/send-direct' && req.method === 'POST') {
    const body = await readBody(req)
    const numbers = (body.numbers || []).map(n => String(n).replace(/\D/g, '')).filter(n => /^\d{10,15}$/.test(n))
    const text = String(body.text || '').trim()
    const useAudio = Boolean(body.use_audio)
    const dryRun = Boolean(body.dry_run)
    const engine = ['piper', 'kokoro', 'edge', 'xtts'].includes(body.engine) ? body.engine : 'edge'
    const speed  = Math.min(Math.max(Number(body.speed) || 0.85, 0.5), 1.5)
    const voice  = engine === 'edge' ? String(body.voice || '') : ''
    const extra  = {
      style:       String(body.style       || 'chat'),
      styledegree: Math.min(Math.max(Number(body.styledegree) || 1.5, 0.01), 2.0),
      pitch_pct:   Math.min(Math.max(Number(body.pitch_pct)   || -3,  -50),  50),
      character:   String(body.character   || 'casual'),
      prefix:      String(body.prefix      || ''),
      suffix:      String(body.suffix      || ''),
      humanize_audio: Boolean(body.humanize_audio),
    }

    if (!numbers.length) return sendJson(res, 400, { message: 'Nenhum numero valido informado.' })
    if (!text) return sendJson(res, 400, { message: 'text obrigatorio.' })

    let audioBase64 = null
    let speech = null
    if (useAudio) {
      speech = await generateSpeechResult(text, engine, speed, voice, extra)
      audioBase64 = speech.audioBase64
      if (!audioBase64) {
        return sendJson(res, 502, {
          message: `Nao foi possivel gerar o audio. Nada foi enviado. ${speech.error || ''}`.trim(),
          sent: 0,
          failed: numbers.length,
          total: numbers.length,
        })
      }
    }

    if (dryRun) {
      return sendJson(res, 200, {
        dry_run: true,
        sent: 0,
        failed: 0,
        total: numbers.length,
        audio_generated: Boolean(audioBase64),
        audio_format: speech?.format || null,
        engine: speech?.engine || engine,
        requested_engine: speech?.requestedEngine || engine,
      })
    }

    const instance = await findDefaultOpenInstance()
    if (!instance?.evolution_instance_name) {
      return sendJson(res, 409, { message: 'Nenhuma instancia WhatsApp aberta encontrada.' })
    }

    let sent = 0, failed = 0
    for (const number of numbers) {
      let result
      if (audioBase64) {
        result = await sendAudioPTT(instance.evolution_instance_name, number, audioBase64)
      } else {
        result = await evolutionRequest(`/message/sendText/${encodeURIComponent(instance.evolution_instance_name)}`, {
          method: 'POST',
          body: JSON.stringify({ number, text }),
        })
      }
      if (result.ok) { sent++; await incrementInstanceSentToday(instance.id, instance.sent_today + sent - 1) }
      else failed++
    }

    return sendJson(res, 200, {
      sent,
      failed,
      total: numbers.length,
      engine: speech?.engine || null,
      requested_engine: speech?.requestedEngine || null,
    })
  }

  // ── PILOTO AUTOMÁTICO ────────────────────────────────────────────────────

  if (url.pathname === '/api/autopilot/preview' && req.method === 'POST') {
    const body = await readBody(req)
    const niche = String(body.niche || '').toLowerCase().trim()
    const city = String(body.city || '').trim()
    const instanceId = String(body.instance_id || '').trim()
    const limit = Math.min(Math.max(Number(body.limit || 30), 1), 80)
    const aiPersonalize = body.ai_personalize !== false
    const validateWhatsapp = body.validate_whatsapp !== false

    if (!niche || !city) return sendJson(res, 400, { message: 'niche e city sao obrigatorios.' })
    if (!instanceId) return sendJson(res, 400, { message: 'instance_id obrigatorio.' })

    const instance = await findWhatsappInstanceById(instanceId)
    if (!instance) return sendJson(res, 404, { message: 'Instancia WhatsApp nao encontrada.' })

    const previewId = randomUUID()
    const state = {
      id: previewId,
      kind: 'preview',
      status: 'discovering',
      stage: `Buscando leads em ${city}...`,
      discovered: 0,
      analyzed: 0,
      messages_generated: 0,
      whatsapp_valid: 0,
      already_contacted: 0,
      blocked: 0,
      logs: [],
      leads: [],
      request: { niche, city, instance_id: instanceId, limit, ai_personalize: aiPersonalize },
      started_at: new Date().toISOString(),
    }
    autopilotJobs.set(previewId, state)

    try {
      const log = msg => state.logs.push(msg)
      log(`Buscando ${niche} em ${city}`)

      const discovered = await discoverAutopilotLeads(niche, city, limit)
      state.discovered = discovered.length
      if (!discovered.length) {
        state.status = 'error'
        state.error = 'Nenhum lead com telefone encontrado.'
        return sendJson(res, 404, state)
      }

      state.status = 'validating'
      state.stage = 'Validando historico e WhatsApp...'
      const phones = discovered.map(lead => lead.phone).filter(Boolean)
      const contactFlags = await getLeadContactFlags(phones)
      const whatsappMap = new Map()
      if (validateWhatsapp && instance.evolution_instance_name) {
        const waCheck = await checkWhatsAppNumbers(instance.evolution_instance_name, phones)
        if (waCheck) {
          for (const row of waCheck) {
            const number = normalizePhone(row.number || row.jid || row.phone)
            if (number) whatsappMap.set(number, row.exists === true ? 'valid' : 'invalid')
          }
        }
      }

      const enriched = []
      state.status = aiPersonalize ? 'analyzing' : 'ready'
      state.stage = aiPersonalize ? 'Analisando sites e gerando mensagens...' : 'Montando preview...'

      for (const lead of discovered) {
        const phone = normalizePhone(lead.phone)
        const flags = contactFlags.get(phone) || {}
        const whatsappStatus = whatsappMap.get(phone) || 'unknown'
        const local = localLeadScore(lead, flags.already_contacted, whatsappStatus)
        let siteContent = null
        if (aiPersonalize && lead.website) {
          siteContent = await analyzeWebsite(lead.website)
          if (siteContent) state.analyzed += 1
        }
        const ai = aiPersonalize ? await enrichLeadWithAi(lead, siteContent, niche, city) : {
          score_delta: 0,
          intent: 'medio',
          reason: 'Mensagem base gerada sem IA.',
          message: baseAutopilotMessage(lead, niche, city),
        }

        const score = Math.max(0, Math.min(100, local.score + Number(ai.score_delta || 0)))
        if (ai.message) state.messages_generated += 1
        if (whatsappStatus === 'valid') state.whatsapp_valid += 1
        if (flags.already_contacted) state.already_contacted += 1
        if (flags.blocked) state.blocked += 1

        enriched.push({
          id: randomUUID(),
          name: lead.name,
          phone,
          phone_type: lead.phone_type,
          niche: lead.niche || niche,
          city: lead.city || city,
          address: lead.address || null,
          website: lead.website || null,
          cnpj: lead.cnpj || null,
          email: lead.email || null,
          source: lead.source || 'import',
          sources: normalizeLeadSourceList(lead),
          source_count: normalizeLeadSourceList(lead).length,
          whatsapp_status: whatsappStatus,
          already_contacted: Boolean(flags.already_contacted),
          blocked: Boolean(flags.blocked),
          lead_status: flags.lead_status || null,
          score,
          intent: ai.intent,
          score_reasons: [...local.reasons, ai.reason].filter(Boolean),
          message: ai.message || baseAutopilotMessage(lead, niche, city),
          selected: !flags.blocked && !flags.already_contacted && whatsappStatus !== 'invalid' && score >= 35,
          raw_payload: lead,
        })
      }

      state.status = 'ready'
      state.stage = `${enriched.filter(lead => lead.selected).length} leads prontos para revisao`
      state.leads = enriched.sort((a, b) => b.score - a.score)
      log('Preview pronto para revisao manual')
      return sendJson(res, 200, state)
    } catch (err) {
      state.status = 'error'
      state.error = err.message || 'Erro ao gerar preview.'
      return sendJson(res, 500, state)
    }
  }

  if (url.pathname === '/api/autopilot/send' && req.method === 'POST') {
    const body = await readBody(req)
    const previewId = String(body.preview_id || '').trim()
    const approved = Array.isArray(body.approved_leads) ? body.approved_leads : []
    const delayMin = Math.max(10, Number(body.delay_min_s || 30))
    const delayMax = Math.max(delayMin, Number(body.delay_max_s || 90))
    const dailyLimit = Math.min(Math.max(Number(body.daily_limit || approved.length || 1), 1), 50)

    const preview = autopilotJobs.get(previewId)
    if (!preview || preview.kind !== 'preview') return sendJson(res, 404, { message: 'Preview nao encontrado.' })
    if (preview.status !== 'ready') return sendJson(res, 409, { message: 'Preview ainda nao esta pronto.' })
    if (!approved.length) return sendJson(res, 400, { message: 'Nenhum lead aprovado para envio.' })

    const instance = await findWhatsappInstanceById(preview.request.instance_id)
    if (!instance) return sendJson(res, 404, { message: 'Instancia WhatsApp nao encontrada.' })

    const approvedById = new Map(approved.map(item => [item.id, item]))
    const selected = preview.leads
      .filter(lead => approvedById.has(lead.id))
      .map(lead => ({ ...lead, message: String(approvedById.get(lead.id)?.message || lead.message || '').trim() }))
      .filter(lead => lead.message && !lead.blocked && !lead.already_contacted && lead.whatsapp_status !== 'invalid')
      .slice(0, dailyLimit)

    if (!selected.length) return sendJson(res, 400, { message: 'Nenhum lead aprovado passou pelas regras de seguranca.' })

    const sendJobId = randomUUID()
    const sendState = {
      id: sendJobId,
      preview_id: previewId,
      kind: 'send',
      status: 'creating',
      stage: 'Criando campanha...',
      total: selected.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      campaign_id: null,
      logs: [],
      started_at: new Date().toISOString(),
    }
    autopilotJobs.set(sendJobId, sendState)

    ;(async () => {
      const log = msg => { sendState.logs.push(msg); console.log('[autopilot-send]', msg) }
      try {
        const { niche, city } = preview.request
        const campaignPayload = {
          id: randomUUID(),
          name: `Piloto revisado - ${niche} - ${city} - ${new Date().toLocaleDateString('pt-BR')}`,
          niche,
          city,
          template_id: null,
          status: 'running',
          quantity_requested: selected.length,
          daily_limit: selected.length,
          delay_min_s: delayMin,
          delay_max_s: delayMax,
          use_audio: false,
          started_at: new Date().toISOString(),
        }
        let campR = await supabaseRequest('/campaigns', { method: 'POST', body: JSON.stringify(campaignPayload) })
        if (!campR.ok && isMissingColumn(campR)) {
          const minimalPayload = { ...campaignPayload }
          delete minimalPayload.use_audio
          delete minimalPayload.neighborhood
          campR = await supabaseRequest('/campaigns', { method: 'POST', body: JSON.stringify(minimalPayload) })
        }
        if (!campR.ok && isMissingColumn(campR)) {
          campR = await supabaseRequest('/campaigns', { method: 'POST', body: JSON.stringify(campaignPatchPayload(campaignPayload, true)) })
        }
        if (!campR.ok) throw new Error(campR.data?.message || 'Erro ao criar campanha.')
        const campaign = Array.isArray(campR.data) ? campR.data[0] : campR.data
        sendState.campaign_id = campaign.id
        sendState.status = 'sending'
        sendState.stage = `Enviando 0/${selected.length}`

        for (const item of selected) {
          const phone = normalizePhone(item.phone)
          const flags = await getLeadContactFlags([phone])
          const flag = flags.get(phone)
          if (flag?.blocked || flag?.already_contacted) {
            sendState.skipped += 1
            log(`Ignorado por historico: ${item.name}`)
            continue
          }

          const leadRecord = await ensureLeadRecordFromPreview({ ...item, preview_id: previewId }, niche, city)
          if (!leadRecord?.id) {
            sendState.failed += 1
            log(`Falha ao salvar lead: ${item.name}`)
            continue
          }

          const clRes = await createCampaignLead({
            campaign_id: campaign.id,
            lead_id: leadRecord.id,
            status: 'pending',
            scheduled_at: new Date().toISOString(),
          })
          const clId = clRes.data?.[0]?.id

          const msgRecord = await insertMessage({
            lead_id: leadRecord.id,
            whatsapp_instance_id: instance.id,
            campaign_id: campaign.id,
            direction: 'outbound',
            kind: 'text',
            phone,
            body: item.message,
            status: 'pending',
            raw_payload: { source: 'autopilot_reviewed', preview_id: previewId, score: item.score },
          })

          let result
          try {
            result = await evolutionRequest(`/message/sendText/${encodeURIComponent(instance.evolution_instance_name)}`, {
              method: 'POST',
              body: JSON.stringify({ number: phone, text: item.message }),
            })
          } catch (err) {
            result = { ok: false, data: { message: err.message } }
          }

          const ok = Boolean(result.ok)
          sendState.sent += ok ? 1 : 0
          sendState.failed += ok ? 0 : 1

          if (msgRecord?.id) {
            await supabaseRequest(`/messages?id=eq.${encodeURIComponent(msgRecord.id)}`, {
              method: 'PATCH',
              body: JSON.stringify(ok
                ? { status: 'sent', provider_message_id: result.data?.key?.id || null, sent_at: new Date().toISOString() }
                : { status: 'failed', error_message: result.data?.message || 'Falha no envio' }),
            })
          }
          await updateCampaignLead(clId, {
            status: ok ? 'sent' : 'failed',
            message_id: msgRecord?.id || null,
            sent_at: new Date().toISOString(),
            error: ok ? null : result.data?.message || 'Falha no envio',
          })
          if (ok) {
            await incrementInstanceSentToday(instance.id, Number(instance.sent_today || 0) + sendState.sent - 1)
            await supabaseRequest(`/leads?id=eq.${encodeURIComponent(leadRecord.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'sent', last_interaction_at: new Date().toISOString() }),
            })
          }
          await patchCampaign(campaign.id, { sent_count: sendState.sent, failed_count: sendState.failed })
          sendState.stage = `Enviando ${sendState.sent + sendState.failed + sendState.skipped}/${selected.length}`
          log(`${ok ? 'Enviado' : 'Falhou'}: ${item.name} | ${phone}`)

          const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        sendState.status = 'done'
        sendState.stage = `Concluido: ${sendState.sent} enviados, ${sendState.failed} falhas, ${sendState.skipped} ignorados`
        await patchCampaign(campaign.id, {
          status: 'finished',
          finished_at: new Date().toISOString(),
          sent_count: sendState.sent,
          failed_count: sendState.failed,
        })
        log('Envio revisado concluido')
      } catch (err) {
        sendState.status = 'error'
        sendState.error = err.message || 'Erro no envio.'
        log(`Erro: ${sendState.error}`)
      }
    })()

    return sendJson(res, 202, { autopilot_id: sendJobId, status: 'running', total: selected.length })
  }

  if (url.pathname === '/api/autopilot/start' && req.method === 'POST') {
    return sendJson(res, 410, { message: 'O disparo direto foi desativado. Use /api/autopilot/preview e depois /api/autopilot/send.' })
    const body = await readBody(req)
    const niche       = (body.niche || '').toLowerCase().trim()
    const city        = (body.city || '').trim()
    const instanceId  = body.instance_id || ''
    const templateId  = body.template_id || null
    const limit       = Math.min(Number(body.limit || 30), 100)
    const aiPersonalize = body.ai_personalize !== false
    const useAudio    = !!body.use_audio
    const delayMin    = Number(body.delay_min_s || 30)
    const delayMax    = Number(body.delay_max_s || 90)

    if (!niche || !city)  return sendJson(res, 400, { message: 'niche e city obrigatórios.' })
    if (!instanceId)      return sendJson(res, 400, { message: 'instance_id obrigatório.' })

    const jobId = randomUUID()
    const state = {
      id: jobId, status: 'discovering',
      stage: `Buscando empresas em ${city}...`,
      discovered: 0, imported: 0, analyzed: 0,
      messages_generated: 0, sent: 0, failed: 0,
      campaign_id: null, error: null, logs: [],
      started_at: new Date().toISOString(),
    }
    autopilotJobs.set(jobId, state)

    // Roda em background — responde imediatamente com o job ID
    ;(async () => {
      const log = msg => { state.logs.push(msg); console.log('[autopilot]', msg) }
      try {
        // ── 1. Descobrir leads ───────────────────────────────────────────
        log(`🔍 Buscando ${niche} em ${city}...`)
        const sources = await Promise.allSettled([
          fetchOverpassLeads(niche, city, limit),
          fetchFoursquareLeads(niche, city, limit),
          fetchYelpLeads(niche, city, limit),
          fetchGooglePlacesLeads(niche, city, limit),
          fetchGeoapifyLeads(niche, city, limit),
          fetchHERELeads(niche, city, limit),
          fetchCNPJLeads(niche, city, limit),
        ])
        const raw = sources.flatMap(s => s.status === 'fulfilled' ? s.value : [])

        // Deduplica e filtra só leads com telefone
        const leadMap = new Map()
        for (const l of raw) {
          const norm = { ...l, phone: normalizePhone(l.phone) || null }
          const key  = discoveryKey(norm)
          leadMap.set(key, mergeLeadRecords(leadMap.get(key), norm))
        }
        const discovered = [...leadMap.values()]
          .map(l => ({ ...l, quality_score: discoveryQuality(l) }))
          .sort((a, b) => b.quality_score - a.quality_score)
          .filter(l => l.phone)
          .slice(0, limit)

        state.discovered = discovered.length
        log(`✅ ${discovered.length} leads encontrados com telefone`)
        if (!discovered.length) {
          state.status = 'error'; state.error = 'Nenhum lead com telefone encontrado.'; return
        }

        // ── 2. Importar leads para o banco ───────────────────────────────
        state.status = 'importing'; state.stage = 'Importando leads...'
        const leads = []
        for (const l of discovered) {
          await supabaseRequest('/leads', {
            method: 'POST',
            headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
            body: JSON.stringify({
              id: randomUUID(), name: l.name, phone: l.phone, normalized_phone: l.phone,
              niche: l.niche || niche, city: l.city || city, address: l.address || null,
              website: l.website || null, cnpj: l.cnpj || null, email: l.email || null,
              source: l.source || 'overpass', status: 'new', raw_payload: l,
            }),
          })
          // Busca o registro real (novo ou já existente)
          const q = await supabaseRequest(`/leads?normalized_phone=eq.${encodeURIComponent(l.phone)}&select=id,website,status&limit=1`)
          if (q.ok && Array.isArray(q.data) && q.data[0]) {
            const db = q.data[0]
            if (!['opt_out', 'invalid'].includes(db.status)) {
              leads.push({ ...l, id: db.id, website: l.website || db.website })
            }
          }
        }
        state.imported = leads.length
        log(`📥 ${leads.length} leads importados`)

        // ── 3. Buscar template base ──────────────────────────────────────
        let baseTemplate = 'Olá {nome_empresa}! Vi que vocês atuam com {nicho} em {cidade} e gostaria de apresentar uma solução que pode ajudar no crescimento do negócio. Podemos conversar?'
        if (templateId) {
          const tR = await supabaseRequest(`/message_templates?id=eq.${templateId}&select=body&limit=1`)
          if (tR.ok && Array.isArray(tR.data) && tR.data[0]) baseTemplate = tR.data[0].body
        }

        // ── 4. Análise de site + personalização com IA ───────────────────
        if (aiPersonalize && GROQ_API_KEY) {
          state.status = 'analyzing'; state.stage = 'Analisando sites com IA...'
          for (const lead of leads) {
            if (lead.website) {
              const content = await analyzeWebsite(lead.website)
              if (content) state.analyzed++
              const base = interpolateTemplate(baseTemplate, lead, niche, city)
              const aiMsg = await generatePersonalizedMessage(lead, content, base)
              if (aiMsg) {
                lead.ai_message = aiMsg
                state.messages_generated++
                await supabaseRequest(`/leads?id=eq.${lead.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ raw_payload: { ...(lead.raw_payload || {}), ai_message: aiMsg } }),
                })
                log(`🤖 Mensagem gerada: ${lead.name}`)
              }
            }
          }
        } else if (aiPersonalize && !GROQ_API_KEY) {
          log('⚠️  GROQ_API_KEY não configurada — usando template padrão')
        }

        // ── 5. Criar campanha ────────────────────────────────────────────
        state.status = 'creating'; state.stage = 'Criando campanha...'
        const campName = `Piloto Auto · ${niche} · ${city} · ${new Date().toLocaleDateString('pt-BR')}`
        const campR = await supabaseRequest('/campaigns', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            id: randomUUID(), name: campName, niche, city,
            template_id: templateId || null, status: 'running',
            quantity_requested: leads.length, daily_limit: leads.length,
            delay_min_s: delayMin, delay_max_s: delayMax,
            use_audio: useAudio, started_at: new Date().toISOString(),
          }),
        })
        if (!campR.ok) { state.status = 'error'; state.error = 'Erro ao criar campanha.'; return }
        const campaign = Array.isArray(campR.data) ? campR.data[0] : campR.data
        state.campaign_id = campaign.id

        // ── 6. Buscar instância WhatsApp ─────────────────────────────────
        const instR = await supabaseRequest(`/whatsapp_instances?id=eq.${instanceId}&select=*&limit=1`)
        if (!instR.ok || !instR.data?.[0]) { state.status = 'error'; state.error = 'Instância WhatsApp não encontrada.'; return }
        const instance = instR.data[0]

        // ── 7. Disparar mensagens gradativamente ─────────────────────────
        state.status = 'sending'; state.stage = 'Enviando mensagens...'
        for (const lead of leads) {
          if (!lead.phone) continue
          const msgBody = lead.ai_message || interpolateTemplate(baseTemplate, lead, niche, city)

          const msgR = await supabaseRequest('/messages', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              id: randomUUID(), lead_id: lead.id, whatsapp_instance_id: instanceId,
              campaign_id: campaign.id, direction: 'outbound', kind: 'text',
              phone: lead.phone, body: msgBody, status: 'pending',
            }),
          })
          const msg = msgR.ok ? (Array.isArray(msgR.data) ? msgR.data[0] : msgR.data) : null

          let ok = false
          try {
            const sr = await evolutionRequest(
              `/message/sendText/${encodeURIComponent(instance.evolution_instance_name)}`,
              { method: 'POST', body: JSON.stringify({ number: lead.phone, text: msgBody }) },
            )
            ok = sr.ok
          } catch { /* ignora erro de envio individual */ }

          if (ok) {
            state.sent++
            await supabaseRequest(`/leads?id=eq.${lead.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'sent', last_interaction_at: new Date().toISOString() }),
            })
          } else {
            state.failed++
          }
          if (msg?.id) {
            await supabaseRequest(`/messages?id=eq.${msg.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: ok ? 'sent' : 'failed', sent_at: ok ? new Date().toISOString() : null }),
            })
          }
          await supabaseRequest(`/campaigns?id=eq.${campaign.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ sent_count: state.sent, failed_count: state.failed }),
          })
          log(`${ok ? '✅' : '❌'} ${lead.name} | ${lead.phone}`)
          state.stage = `Enviando... ${state.sent + state.failed}/${leads.length}`

          const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
          await new Promise(r => setTimeout(r, delay))
        }

        // ── 8. Finalizar ─────────────────────────────────────────────────
        state.status = 'done'
        state.stage  = `Concluído! ${state.sent} enviados · ${state.failed} falhas`
        await supabaseRequest(`/campaigns?id=eq.${campaign.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'finished', finished_at: new Date().toISOString(), sent_count: state.sent, failed_count: state.failed }),
        })
        log('🎉 Piloto automático concluído!')

      } catch (err) {
        state.status = 'error'; state.error = err.message
        log('💥 Erro fatal: ' + err.message)
      }
    })()

    return sendJson(res, 200, { autopilot_id: jobId, status: 'running' })
  }

  if (url.pathname === '/api/automation/lead-agent/status' && req.method === 'GET') {
    const agent = getLeadAutomationAgent()
    agent.recent_cycles = await loadRecentAutomationCycleRuns(agent.id, 20)
    return sendJson(res, 200, await persistAndSerializeLeadAgent(agent))
  }

  if (url.pathname === '/api/automation/message-quality' && req.method === 'GET') {
    const limit = Number(url.searchParams.get('limit') || 80)
    const dbItems = await listMessageQualityAudits(limit)
    const payload = getMessageQualityAuditPayload(limit, dbItems)
    return sendJson(res, 200, {
      ...payload,
      storage: Array.isArray(dbItems) ? 'database' : 'memory',
    })
  }

  if (url.pathname === '/api/automation/lead-agent/start' && req.method === 'POST') {
    const body = await readBody(req)
    const agent = getLeadAutomationAgent()
    agent.config = normalizeLeadAgentConfig(body, agent.config)
    if (!agent.config.niche || !agent.config.city) {
      return sendJson(res, 400, { message: 'niche e city sao obrigatorios para ativar o agente.' })
    }
    const intervalMinutes = Math.max(15, Number(agent.config.interval_minutes || LEAD_AGENT_DEFAULTS.interval_minutes))
    const cyclesPerDay = Math.max(1, Math.floor((24 * 60) / intervalMinutes))
    const projectedSendPerDay = agent.config.auto_send
      ? Math.max(0, Number(agent.config.daily_send_limit || 0)) * cyclesPerDay
      : 0
    const requiresConfirmation = projectedSendPerDay > LEAD_AGENT_MAX_SENDS_PER_DAY_SOFT
    if (requiresConfirmation && body.force_high_volume !== true) {
      return sendJson(res, 409, {
        message: `Configuracao projeta ${projectedSendPerDay} envios/dia e ultrapassa o limite recomendado (${LEAD_AGENT_MAX_SENDS_PER_DAY_SOFT}/dia). Confirme para continuar.`,
        requires_confirmation: true,
        projected_send_per_day: projectedSendPerDay,
        soft_limit_per_day: LEAD_AGENT_MAX_SENDS_PER_DAY_SOFT,
      })
    }
    agent.active = true
    agent.status = 'active'
    agent.stage = 'Agente ativado. Primeiro ciclo em andamento...'
    agent.started_at = agent.started_at || new Date().toISOString()
    appendLeadAgentLog(agent, `Agente ativado para ${agent.config.niche} em ${agent.config.city}.`)
    scheduleLeadAutomation(agent, { runImmediately: true })
    return sendJson(res, 202, await persistAndSerializeLeadAgent(agent))
  }

  if (url.pathname === '/api/automation/lead-agent/config' && req.method === 'POST') {
    const body = await readBody(req)
    const agent = getLeadAutomationAgent()
    agent.config = normalizeLeadAgentConfig(body, agent.config)
    if (!agent.config.niche || !agent.config.city) {
      return sendJson(res, 400, { message: 'niche e city sao obrigatorios para salvar a configuracao.' })
    }
    agent.stage = agent.active ? agent.stage : 'Configuracao salva. Agente aguardando ativacao.'
    appendLeadAgentLog(agent, `Configuracao salva para ${agent.config.niche} em ${agent.config.city}.`)
    return sendJson(res, 200, await persistAndSerializeLeadAgent(agent))
  }

  if (url.pathname === '/api/automation/lead-agent/run' && req.method === 'POST') {
    const agent = getLeadAutomationAgent()
    if (!agent.config.niche || !agent.config.city) {
      return sendJson(res, 400, { message: 'Configure niche e city antes de rodar o agente.' })
    }
    const state = await runLeadAutomationCycle(agent, { manual: true })
    if (agent.active) scheduleLeadAutomation(agent)
    return sendJson(res, 200, state)
  }

  if (url.pathname === '/api/automation/lead-agent/stop' && req.method === 'POST') {
    return sendJson(res, 200, await persistAndSerializeLeadAgent(stopLeadAutomation(getLeadAutomationAgent())))
  }

  if (url.pathname.startsWith('/api/autopilot/') && url.pathname.endsWith('/status') && req.method === 'GET') {
    const jobId = url.pathname.split('/')[3]
    const state = autopilotJobs.get(jobId)
    if (!state) return sendJson(res, 404, { message: 'Job não encontrado.' })
    return sendJson(res, 200, state)
  }

  return sendJson(res, 404, { message: 'Rota nao encontrada.' })
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const origin = req.headers.origin || ''
    if (!url.pathname.startsWith('/api/')) {
      return _sendJson(res, 404, { message: 'Use as rotas /api.' }, origin)
    }
    await handleApi(req, res, url)
  } catch (error) {
    _sendJson(res, 500, { message: error.message || 'Erro interno.' }, req.headers.origin || '')
  }
})

server.listen(PORT, () => {
  console.log(`API proxy rodando em http://127.0.0.1:${PORT}`)
})

server.on('error', error => {
  if (error?.code === 'EADDRINUSE') {
    const pid = detectListeningPid(PORT)
    if (pid) {
      if (process.platform === 'win32') {
        console.error(`[boot] Porta ${PORT} em uso por PID ${pid}. Mate com: taskkill /PID ${pid} /F`)
      } else {
        console.error(`[boot] Porta ${PORT} em uso por PID ${pid}. Mate com: kill -9 ${pid}`)
      }
    } else {
      console.error(`[boot] Porta ${PORT} em uso. Finalize o processo atual e rode novamente.`)
    }
    return
  }
  console.error('[boot] Erro ao iniciar API:', error.message || error)
})

restoreLeadAutomationAgents().catch(error => {
  console.error('[automation] restore error:', error.message)
})
