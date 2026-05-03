/* ── Prospect scoring — client-side ─────────────────────────────────────────
 * Espelha a lógica do server.js mas aceita config customizável.
 * Config é salva em localStorage e aplicada após receber leads do backend.
 * ───────────────────────────────────────────────────────────────────────── */

const CONFIG_KEY = 'prospect_config_v1'

export const DEFAULT_CONFIG = {
  base_score: 50,

  // Faixas de avaliações no Google
  reviews_ideal_min:        10,   // abaixo = recém aberto
  reviews_ideal_max:        50,   // faixa ideal (PMEs pequenos)
  reviews_ideal_bonus:      25,   // bônus para faixa ideal
  reviews_medium_max:      200,   // ainda ok
  reviews_medium_bonus:     15,   // bônus para faixa média
  reviews_large_threshold: 500,   // acima = neutro → penalidade leve
  reviews_huge_threshold: 1000,   // acima = penalidade forte
  reviews_tiny_penalty:      5,   // < reviews_ideal_min
  reviews_large_penalty:    20,   // entre large e huge
  reviews_huge_penalty:     40,   // acima de huge

  // Presença digital
  no_website_bonus:   20,
  has_website_penalty: 5,

  // Tipo de telefone
  mobile_bonus:      15,
  landline_penalty:   5,

  // Rating
  rating_medium_bonus:    10,   // 3.0–4.3 (aberto a melhorias)
  rating_great_penalty:   15,   // 4.5+ com 300+ reviews

  // Penalidades de porte
  chain_penalty:          80,
  corporate_type_penalty: 40,

  // Listas (editáveis pelo usuário)
  chain_keywords: [
    'odontocompany', 'odonto company', 'orthopride', 'sorridents', 'oral sin',
    'oral unic', 'implantes prime', 'amor saude', 'clinica sim',
    'mcdonald', 'mcdonalds', 'mc donalds',
    'burger king', 'subway', 'pizza hut', 'dominos', 'papa john',
    'starbucks', 'dunkin', 'outback', 'applebee',
    "bob's", 'giraffas', "habib's", 'spoleto', 'china in box', 'madero', 'frango assado',
    'o boticario', 'natura cosmeticos', 'avon', 'mary kay',
    'casas bahia', 'magazine luiza', 'magalu', 'americanas', 'shoptime',
    'centauro', 'decathlon', 'leroy merlin', 'tok&stok',
    'cacau show', 'kopenhagen', 'haagen-dazs',
    'unimed', 'amil', 'bradesco saude', 'notredame',
    'localiza', 'movida', 'unidas', 'hertz', 'avis',
  ],
  blocked_types: [
    'lodging', 'hospital', 'bank', 'insurance_agency', 'department_store',
    'shopping_mall', 'university', 'airport', 'gas_station', 'car_dealer',
    'pharmacy', 'supermarket', 'convenience_store', 'home_goods_store',
    'furniture_store', 'clothing_store', 'jewelry_store',
  ],
}

/* ── Config storage ─────────────────────────────────────────────────────── */

export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return structuredClone(DEFAULT_CONFIG)
    const saved = JSON.parse(raw)
    return { ...structuredClone(DEFAULT_CONFIG), ...saved }
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

export function resetConfig() {
  localStorage.removeItem(CONFIG_KEY)
  return structuredClone(DEFAULT_CONFIG)
}

export function isCustomized() {
  return !!localStorage.getItem(CONFIG_KEY)
}

/* ── Phone classifier (duplicado do backend para rodar no browser) ───────── */

function classifyPhone(digits) {
  let d = String(digits || '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11 && d[2] === '9') return 'mobile'
  if (d.length === 10 || d.length === 11) return 'landline'
  return 'unknown'
}

function normalizeLookupText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isDentalNiche(value) {
  const normalized = normalizeLookupText(value)
  return normalized.includes('odonto') || normalized.includes('dentista')
}

function leadBlockReasonClient(lead = {}, cfg = DEFAULT_CONFIG) {
  const rp         = lead.raw_payload || {}
  const reviews    = Number(rp.user_ratings_total || lead.reviews) || 0
  const rating     = Number(rp.rating || lead.rating) || 0
  const types      = Array.isArray(rp.types) ? rp.types : (Array.isArray(lead.types) ? lead.types : [])
  const nameLow    = String(lead.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const pt         = classifyPhone(lead.phone)
  const blockedSet = new Set(cfg.blocked_types || [])
  const keywords   = (cfg.chain_keywords || []).map(k => k.toLowerCase())
  const hasProfessionalSite = Boolean(lead.website && lead.website !== 'sem site') && reviews >= 500 && rating >= 4.4
  const dental = isDentalNiche(lead.niche)

  if (keywords.some(kw => nameLow.includes(kw))) return 'Rede/franquia bloqueada'
  if (types.some(t => blockedSet.has(t))) return 'Tipo de negocio corporativo'
  if (reviews >= (dental ? 1800 : 1000)) return 'Operacao grande demais'
  if (hasProfessionalSite && !dental) return 'Site forte e operacao grande'
  if (rp.business_status === 'CLOSED_PERMANENTLY') return 'Negocio fechado'
  if (pt === 'unknown') return 'Telefone ausente ou invalido'
  return ''
}

function leadReviewReasonClient(lead = {}, cfg = DEFAULT_CONFIG) {
  const rp      = lead.raw_payload || {}
  const reviews = Number(rp.user_ratings_total || lead.reviews) || 0
  const pt      = classifyPhone(lead.phone)
  const rating  = Number(rp.rating || lead.rating) || 0
  const hasProfessionalSite = Boolean(lead.website && lead.website !== 'sem site') && reviews >= 500 && rating >= 4.4
  const dental = isDentalNiche(lead.niche)
  if (pt === 'landline') return 'Telefone fixo: revise antes de disparar'
  if (reviews >= (dental ? 500 : 300)) return 'Operacao possivelmente grande'
  if (lead.website && lead.website !== 'sem site' && reviews >= (dental ? 350 : 200)) return 'Site + muitas avaliacoes'
  if (dental && hasProfessionalSite) return 'Clinica estruturada: revisar antes de disparar'
  return ''
}

export function leadGateClient(lead = {}, cfg = DEFAULT_CONFIG) {
  const blocked = leadBlockReasonClient(lead, cfg)
  if (blocked) return { status: 'blocked', reason: blocked }
  const review = leadReviewReasonClient(lead, cfg)
  if (review) return { status: 'review', reason: review }
  return { status: 'recommended', reason: 'Perfil bom para piloto' }
}

/* ── Scoring ─────────────────────────────────────────────────────────────── */

export function prospectScoreClient(lead = {}, cfg = DEFAULT_CONFIG) {
  const rp         = lead.raw_payload || {}
  const reviews    = Number(rp.user_ratings_total || lead.reviews) || 0
  const rating     = Number(rp.rating   || lead.rating) || 0
  const types      = Array.isArray(rp.types) ? rp.types : (Array.isArray(lead.types) ? lead.types : [])
  const nameLow    = String(lead.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const pt         = classifyPhone(lead.phone)
  const blockedSet = new Set(cfg.blocked_types || [])
  const keywords   = (cfg.chain_keywords || []).map(k => k.toLowerCase())
  const website    = lead.website && lead.website !== 'sem site' ? lead.website : null
  const dental = isDentalNiche(lead.niche)
  const largeThreshold = dental ? Math.max(cfg.reviews_large_threshold, 700) : cfg.reviews_large_threshold
  const hugeThreshold = dental ? Math.max(cfg.reviews_huge_threshold, 1400) : cfg.reviews_huge_threshold
  const largePenalty = dental ? 10 : cfg.reviews_large_penalty
  const hugePenalty = dental ? 25 : cfg.reviews_huge_penalty
  const websitePenalty = dental ? 0 : cfg.has_website_penalty
  const ratingPenalty = dental ? 8 : cfg.rating_great_penalty
  const reviewPenalty = dental ? 10 : 25

  let score = cfg.base_score
  const gate = leadGateClient(lead, cfg)
  if (gate.status === 'blocked') return 0

  // Avaliações
  if (reviews === 0)                                          score += 0
  else if (reviews < cfg.reviews_ideal_min)                  score -= cfg.reviews_tiny_penalty
  else if (reviews <= cfg.reviews_ideal_max)                 score += cfg.reviews_ideal_bonus
  else if (reviews <= cfg.reviews_medium_max)                score += cfg.reviews_medium_bonus
  else if (reviews <= largeThreshold)                        score += 0
  else if (reviews <= hugeThreshold)                         score -= largePenalty
  else                                                       score -= hugePenalty

  // Presença digital
  if (!website) score += cfg.no_website_bonus
  else          score -= websitePenalty

  // Telefone
  if (pt === 'mobile')   score += cfg.mobile_bonus
  else if (pt === 'landline') score -= cfg.landline_penalty

  // Rating
  if (rating >= 3.0 && rating <= 4.3)        score += cfg.rating_medium_bonus
  else if (rating > 4.5 && reviews > 300)    score -= ratingPenalty

  // Tipos corporativos
  if (types.some(t => blockedSet.has(t)))    score -= cfg.corporate_type_penalty

  // Franquia / rede
  if (keywords.some(kw => nameLow.includes(kw))) score -= cfg.chain_penalty

  // Status
  if (rp.business_status === 'CLOSED_PERMANENTLY') score -= 100
  if (rp.business_status === 'CLOSED_TEMPORARILY') score -= 20
  if (gate.status === 'review') score -= reviewPenalty

  return Math.max(0, Math.min(100, score))
}

export function prospectSignalsClient(lead = {}, cfg = DEFAULT_CONFIG) {
  const rp         = lead.raw_payload || {}
  const reviews    = Number(rp.user_ratings_total || lead.reviews) || 0
  const rating     = Number(rp.rating || lead.rating) || 0
  const types      = Array.isArray(rp.types) ? rp.types : (Array.isArray(lead.types) ? lead.types : [])
  const nameLow    = String(lead.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const pt         = classifyPhone(lead.phone)
  const blockedSet = new Set(cfg.blocked_types || [])
  const keywords   = (cfg.chain_keywords || []).map(k => k.toLowerCase())
  const website    = lead.website && lead.website !== 'sem site' ? lead.website : null

  const pos = []
  const neg = []

  if (!website)                                               pos.push('Sem site — precisa de presença digital')
  if (pt === 'mobile')                                        pos.push('Celular — acesso direto ao dono')
  if (reviews >= cfg.reviews_ideal_min && reviews <= cfg.reviews_medium_max)
                                                              pos.push(`${reviews} avaliações — porte ideal`)
  if (rating >= 3.0 && rating <= 4.3)                         pos.push('Nota mediana — aberto a melhorias')
  if (reviews === 0 && !rp.rating && !lead.rating)            pos.push('Pouca presença online — oportunidade')

  if (reviews > cfg.reviews_large_threshold)                  neg.push(`${reviews} avaliações — grande demais`)
  if (website)                                                neg.push('Já tem site')
  if (pt === 'landline')                                      neg.push('Fixo — pode não ser o dono')
  if (types.some(t => blockedSet.has(t)))                     neg.push('Tipo de negócio corporativo')
  if (keywords.some(kw => nameLow.includes(kw)))              neg.push('Possível rede/franquia')
  if (rp.business_status === 'CLOSED_TEMPORARILY')            neg.push('Fechado temporariamente')
  const gate = leadGateClient(lead, cfg)
  if (gate.status === 'blocked')                              neg.push(gate.reason)
  if (gate.status === 'review')                               neg.push(gate.reason)

  return { pos, neg }
}

/* ── Re-score batch ──────────────────────────────────────────────────────── */

export function rescoreLeads(leads) {
  const cfg = loadConfig()
  return leads
    .map(l => ({
      ...l,
      prospect_score:   prospectScoreClient(l, cfg),
      prospect_signals: prospectSignalsClient(l, cfg),
      prospect_gate:    leadGateClient(l, cfg),
    }))
    .sort((a, b) => b.prospect_score - a.prospect_score || (b.quality_score || 0) - (a.quality_score || 0))
}
