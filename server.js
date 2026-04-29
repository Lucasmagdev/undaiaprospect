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
const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY || ''
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ''
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || ''
const TTS_SERVER_URL = (process.env.TTS_SERVER_URL || '').replace(/\/$/, '')
const TTS_VOICE = process.env.TTS_VOICE || 'pf_dora'

const ALLOWED_ORIGINS = new Set([
  process.env.CORS_ORIGIN || 'http://127.0.0.1:5173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
])

function _sendJson(res, status, data, reqOrigin) {
  const origin = ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : (process.env.CORS_ORIGIN || 'http://127.0.0.1:5173')
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
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
  return result?.data?.code === '42P01'
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
  }

  let result = await supabaseRequest('/leads', {
    method: 'POST',
    body: JSON.stringify(clean),
  })

  if (!result.ok && isCheckViolation(result) && clean.source === 'overpass') {
    result = await supabaseRequest('/leads', {
      method: 'POST',
      body: JSON.stringify({ ...clean, source: 'import' }),
    })
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

async function generateSpeech(text) {
  // Kokoro TTS (self-hosted) — prioridade
  if (TTS_SERVER_URL) {
    try {
      const response = await fetch(`${TTS_SERVER_URL}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: TTS_VOICE, language: 'pt-br' }),
        signal: AbortSignal.timeout(30_000),
      })
      if (response.ok) {
        const data = await response.json()
        if (data.audio_base64) return data.audio_base64
      }
    } catch { /* fallback para ElevenLabs */ }
  }

  // ElevenLabs fallback
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) return null
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
  })
  if (!response.ok) return null
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer).toString('base64')
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
  restaurante:   [['amenity', 'restaurant'], ['amenity', 'fast_food'], ['amenity', 'cafe'], ['shop', 'deli']],
  odontologia:   [['amenity', 'dentist'], ['healthcare', 'dentist'], ['healthcare:speciality', 'dentistry']],
  academia:      [['leisure', 'fitness_centre'], ['amenity', 'gym'], ['leisure', 'sports_centre']],
  advocacia:     [['office', 'lawyer'], ['office', 'law_firm']],
  contabilidade: [['office', 'accountant'], ['office', 'tax_advisor'], ['office', 'financial']],
  estetica:      [['shop', 'beauty'], ['amenity', 'beauty_salon'], ['amenity', 'nail_salon'], ['shop', 'cosmetics']],
  imobiliaria:   [['shop', 'estate_agent'], ['office', 'estate_agent']],
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

async function fetchOverpassLeads(niche, city, limit) {
  const tags = NICHE_TAGS[niche] || [['name', niche]]
  const unionParts = tags.flatMap(([k, v]) => [
    `node["${k}"="${v}"](area.a);`,
    `way["${k}"="${v}"](area.a);`,
  ]).join('')
  // Removido ["boundary"="administrative"] — era muito restritivo para cidades BR no OSM.
  // admin_level 8 cobre municípios brasileiros; fallback para 7 cobre alguns casos especiais.
  const query = `[out:json][timeout:30];(area["name"="${city}"]["admin_level"="8"];area["name"="${city}"]["admin_level"="7"];)->.a;(${unionParts});out center tags ${limit};`

  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': '*/*', 'User-Agent': 'undaia-prospect/1.0' },
    body: new URLSearchParams({ data: query }),
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

async function fetchGuiaMaisLeads(niche, city, limit) {
  const term = encodeURIComponent(NICHE_TERMS[niche] || niche)
  const where = encodeURIComponent(city)
  let html
  try {
    const r = await fetch(
      `https://www.guiamais.com.br/busca?searchedTerm=${term}&where=${where}`,
      { headers: SCRAPER_HEADERS, signal: AbortSignal.timeout(15_000) },
    )
    if (!r.ok) return []
    html = await r.text()
  } catch {
    return []
  }
  return extractJsonLd(html)
    .map(item => jsonLdToLead(item, niche, city, 'guiamais'))
    .filter(Boolean)
    .slice(0, limit)
}

async function fetchApontadorLeads(niche, city, limit) {
  const what = encodeURIComponent(NICHE_TERMS[niche] || niche)
  const where = encodeURIComponent(city)
  let html
  try {
    const r = await fetch(
      `https://www.apontador.com.br/local/search/result/page/1?what=${what}&where=${where}`,
      { headers: SCRAPER_HEADERS, signal: AbortSignal.timeout(15_000) },
    )
    if (!r.ok) return []
    html = await r.text()
  } catch {
    return []
  }
  return extractJsonLd(html)
    .map(item => jsonLdToLead(item, niche, city, 'apontador'))
    .filter(Boolean)
    .slice(0, limit)
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
  if (!result.ok || !Array.isArray(result.data)) return []

  return result.data.map(e => {
    const rawPhone = (e.ddd1 || '') + (e.telefone1 || '')
    const rawPhone2 = (e.ddd2 || e.ddd1 || '') + (e.telefone2 || '')
    const phone = normalizePhone(rawPhone) || normalizePhone(rawPhone2) || null
    return {
      name: e.nome_fantasia || e.cnpj || '',
      phone,
      address: e.uf ? `${e.municipio_nome}, ${e.uf}` : e.municipio_nome || null,
      website: null,
      email: e.email || null,
      niche,
      city: e.municipio_nome || city,
      source: 'cnpj',
    }
  })
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
      'select=id,name,phone,normalized_phone,niche,city,address,website,source,status,last_interaction_at,created_at',
      'order=created_at.desc',
      'limit=200',
    ]
    if (search) params.push(`or=(name.ilike.*${encodeURIComponent(search)}*,niche.ilike.*${encodeURIComponent(search)}*,city.ilike.*${encodeURIComponent(search)}*)`)
    if (hasWebsite === 'true') params.push('website=not.is.null')
    if (hasWebsite === 'false') params.push('website=is.null')
    if (status) params.push(`status=eq.${encodeURIComponent(status)}`)
    const result = await supabaseRequest(`/leads?${params.join('&')}`)
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
      source: body.source || 'manual',
      status: body.status || 'new',
    })
    return sendJson(res, result.status, result.data?.[0] || result.data)
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

  if (url.pathname === '/api/inbox/conversations' && req.method === 'GET') {
    const result = await supabaseRequest('/messages?select=id,lead_id,direction,phone,body,status,sent_at,received_at,created_at,leads(name,status)&order=created_at.asc&limit=500')
    if (!result.ok) return sendJson(res, result.status, result.data)

    const grouped = new Map()
    for (const message of result.data || []) {
      const phone = message.phone || 'sem-telefone'
      if (!grouped.has(phone)) {
        grouped.set(phone, {
          id: phone,
          phone,
          lead: message.leads?.name || phone,
          mood: message.leads?.status === 'responded' ? 'Quente' : message.direction === 'inbound' ? 'Respondeu' : 'Aguardando',
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
    if (event.includes('messages') || event.includes('MESSAGES') || body?.data?.message || body?.message) {
      await saveInboundMessage(body)
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

  if (url.pathname === '/api/search/leads' && req.method === 'GET') {
    const niche = (url.searchParams.get('niche') || '').toLowerCase().trim()
    const city = (url.searchParams.get('city') || '').trim()
    const limit = Math.min(Number(url.searchParams.get('limit') || 30), 100)

    if (!niche || !city) return sendJson(res, 400, { message: 'niche e city sao obrigatorios.' })

    const [overpassSettled, fsqSettled, guiamaisSettled, apontadorSettled, cnpjSettled] = await Promise.allSettled([
      fetchOverpassLeads(niche, city, limit),
      fetchFoursquareLeads(niche, city, limit),
      fetchGuiaMaisLeads(niche, city, limit),
      fetchApontadorLeads(niche, city, limit),
      fetchCNPJLeads(niche, city, limit),
    ])

    const overpassLeads  = overpassSettled.status  === 'fulfilled' ? overpassSettled.value  : []
    const fsqLeads       = fsqSettled.status       === 'fulfilled' ? fsqSettled.value       : []
    const guiamaisLeads  = guiamaisSettled.status  === 'fulfilled' ? guiamaisSettled.value  : []
    const apontadorLeads = apontadorSettled.status === 'fulfilled' ? apontadorSettled.value : []
    const cnpjLeads      = cnpjSettled.status      === 'fulfilled' ? cnpjSettled.value      : []

    const all = [...overpassLeads, ...fsqLeads, ...guiamaisLeads, ...apontadorLeads, ...cnpjLeads]
    if (!all.length) {
      return sendJson(res, 502, { message: 'Nenhuma fonte retornou resultados. Tente novamente em instantes.' })
    }

    // Merge: deduplica por telefone normalizado.
    // Prioridade (quem sobrescreve): cnpj > guiamais > apontador > foursquare > overpass
    const PRIORITY = { cnpj: 5, guiamais: 4, apontador: 3, foursquare: 2, overpass: 1 }
    const phoneMap = new Map()
    const noPhoneLeads = []
    for (const lead of all) {
      if (!lead.phone) { noPhoneLeads.push(lead); continue }
      const existing = phoneMap.get(lead.phone)
      if (!existing || (PRIORITY[lead.source] || 0) > (PRIORITY[existing.source] || 0)) {
        phoneMap.set(lead.phone, lead)
      }
    }

    const results = [...phoneMap.values(), ...noPhoneLeads]
      .map(lead => ({
        ...lead,
        phone_type: lead.phone ? classifyBrazilianPhone(lead.phone) : 'unknown',
      }))
      .slice(0, limit)

    return sendJson(res, 200, results)
  }

  if (url.pathname === '/api/whatsapp/send-direct' && req.method === 'POST') {
    const body = await readBody(req)
    const numbers = (body.numbers || []).map(n => String(n).replace(/\D/g, '')).filter(n => /^\d{10,15}$/.test(n))
    const text = String(body.text || '').trim()
    const useAudio = Boolean(body.use_audio)

    if (!numbers.length) return sendJson(res, 400, { message: 'Nenhum numero valido informado.' })
    if (!text) return sendJson(res, 400, { message: 'text obrigatorio.' })

    const instance = await findDefaultOpenInstance()
    if (!instance?.evolution_instance_name) {
      return sendJson(res, 409, { message: 'Nenhuma instancia WhatsApp aberta encontrada.' })
    }

    let audioBase64 = null
    if (useAudio) audioBase64 = await generateSpeech(text)

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

    return sendJson(res, 200, { sent, failed, total: numbers.length })
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
