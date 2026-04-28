// Mock async service layer — swap fetch() for real API calls when ready.
// Each fn returns a Promise so the UI already handles async correctly.

const delay = ms => new Promise(r => setTimeout(r, ms))

/* ── SEED DATA ── */

let _campaigns = [
  { id: 1, name: 'Advogados BH',    niche: 'Advocacia',              city: 'Belo Horizonte', status: 'Rodando',    progress: 68,  found: 84,  sent: 57, replies: 9 },
  { id: 2, name: 'Clínicas SP',     niche: 'Clínicas odontológicas', city: 'São Paulo',       status: 'Pausada',    progress: 42,  found: 120, sent: 50, replies: 6 },
  { id: 3, name: 'Restaurantes RJ', niche: 'Restaurantes',           city: 'Rio de Janeiro',  status: 'Finalizada', progress: 100, found: 75,  sent: 75, replies: 14 },
]

let _leads = [
  { id: 1, name: 'Almeida & Costa Advocacia', phone: '+55 31 98822-1044', city: 'Belo Horizonte', niche: 'Advocacia',   website: 'sem site',           status: 'respondeu', last: 'Hoje, 10:42' },
  { id: 2, name: 'Moura Direito Empresarial', phone: '+55 31 99731-8820', city: 'Belo Horizonte', niche: 'Advocacia',   website: 'mouradireito.com.br', status: 'enviado',   last: 'Hoje, 09:58' },
  { id: 3, name: 'Clínica Sorriso Vivo',      phone: '+55 11 95512-8011', city: 'São Paulo',       niche: 'Odontologia', website: 'sorrisovivo.com',     status: 'novo',      last: 'Ontem, 17:20' },
  { id: 4, name: 'Bistrô Jardim',             phone: '+55 21 98801-4432', city: 'Rio de Janeiro',  niche: 'Restaurante', website: 'sem site',            status: 'fechado',   last: '22/04, 15:11' },
]

let _conversations = [
  {
    id: 1, lead: 'Almeida & Costa Advocacia', mood: 'Quente', time: '10:42',
    messages: [
      { dir: 'out', text: 'Oi, vi a Almeida & Costa em Belo Horizonte e queria te mostrar uma ideia rápida para gerar mais contatos pelo site.', time: '10:38' },
      { dir: 'in',  text: 'Pode me mandar uma proposta para site institucional?', time: '10:42' },
    ],
  },
  {
    id: 2, lead: 'Bistrô Jardim', mood: 'Fechado', time: 'Ontem',
    messages: [
      { dir: 'out', text: 'Olá! Vi o Bistrô Jardim no Google e queria apresentar uma solução de presença digital.', time: 'Ontem, 14:00' },
      { dir: 'in',  text: 'Vamos fechar o pacote com landing page e tráfego.', time: 'Ontem, 15:30' },
    ],
  },
  {
    id: 3, lead: 'Moura Direito Empresarial', mood: 'Aguardando', time: '09:58',
    messages: [
      { dir: 'out', text: 'Mensagem inicial entregue. Follow-up em 2 dias.', time: '09:58' },
    ],
  },
]

let _templates = [
  { id: 1, name: 'Primeiro contato — site',      use: 'Mensagem inicial', conversion: '14.8%', body: 'Oi, vi a {nome_empresa} em {cidade} e queria te mostrar uma ideia rápida para gerar mais contatos pelo site.' },
  { id: 2, name: 'Follow-up D+2',               use: 'Sem resposta',      conversion: '8.1%',  body: 'Oi {nome_empresa}! Só passando pra ver se você recebeu minha mensagem de anteontem sobre {nicho}.' },
  { id: 3, name: 'Oferta diagnóstico gratuito', use: 'Lead respondeu',    conversion: '21.4%', body: 'Posso fazer um diagnóstico gratuito da presença digital da {nome_empresa} — sem compromisso. Tem 15 minutos?' },
]

/* ── NICHE BANK ── */

const _nicheBank = {
  Advocacia: [
    { id: 'adv-0',  day: 0,  label: 'D+0',  body: 'Oi {nome_empresa}! Vi o escritório no Google Maps em {cidade}. Tenho uma ideia rápida pra trazer mais clientes pelo WhatsApp — posso mostrar em 2 min?' },
    { id: 'adv-2',  day: 2,  label: 'D+2',  body: '{nome_empresa}, escritórios de advocacia que aparecem bem no Google recebem em média 3x mais contatos orgânicos. Posso mostrar como tá a presença de vocês hoje?' },
    { id: 'adv-5',  day: 5,  label: 'D+5',  body: 'Fiz um diagnóstico rápido da {nome_empresa} online. Encontrei 2 pontos que custam clientes todo mês. Posso te mandar?' },
    { id: 'adv-10', day: 10, label: 'D+10', body: 'Tudo bem! Fico por aqui se precisar. Se quiser ver o diagnóstico da {nome_empresa} em outro momento, é só chamar.' },
  ],
  Odontologia: [
    { id: 'odo-0',  day: 0,  label: 'D+0',  body: 'Oi! Vi a {nome_empresa} em {cidade} e queria mostrar como clínicas odontológicas estão agendando pelo WhatsApp sem secretária. Tem 1 minuto?' },
    { id: 'odo-2',  day: 2,  label: 'D+2',  body: '{nome_empresa}, uma clínica odontológica em SP começou a usar agendamento automático e reduziu faltas em 40%. Curioso como funciona?' },
    { id: 'odo-5',  day: 5,  label: 'D+5',  body: 'Olhei a presença digital da {nome_empresa} e notei que vocês não aparecem nas buscas de "dentista em {cidade}". Isso representa clientes indo pra concorrência. Posso mostrar?' },
    { id: 'odo-10', day: 10, label: 'D+10', body: 'Sem problemas! Se um dia quiserem melhorar o agendamento online, estou à disposição.' },
  ],
  Restaurante: [
    { id: 'rst-0',  day: 0,  label: 'D+0',  body: 'Oi {nome_empresa}! Vi o restaurante no Google e queria mostrar como aumentar a mesa cheia nas noites de semana via WhatsApp. Funciona?' },
    { id: 'rst-2',  day: 2,  label: 'D+2',  body: '{nome_empresa}, restaurantes que respondem rápido no WhatsApp convertem 5x mais reservas. Posso te mostrar uma automação simples?' },
    { id: 'rst-5',  day: 5,  label: 'D+5',  body: 'Fiz uma análise rápida: a {nome_empresa} não aparece nas buscas de "restaurante em {cidade}" no Google. Isso custa mesas todo fim de semana.' },
    { id: 'rst-10', day: 10, label: 'D+10', body: 'Tranquilo! Fico por aqui. Qualquer hora que quiser aumentar as reservas, é só chamar.' },
  ],
  'Clínica Estética': [
    { id: 'est-0',  day: 0,  label: 'D+0',  body: 'Oi {nome_empresa}! Vi a clínica em {cidade}. Clientes que somem sem reagendar custam caro — tenho uma solução via WhatsApp que traz eles de volta. Posso mostrar?' },
    { id: 'est-2',  day: 2,  label: 'D+2',  body: '{nome_empresa}, clínicas estéticas com agendamento online recebem em média 2x mais clientes novos por mês. Vale uma conversa rápida?' },
    { id: 'est-5',  day: 5,  label: 'D+5',  body: 'Pesquisei "{nicho} em {cidade}" no Google e a {nome_empresa} não aparece na primeira página. São clientes que chegam na concorrência todo dia.' },
    { id: 'est-10', day: 10, label: 'D+10', body: 'Tudo bem! Quando quiser melhorar a captação online da {nome_empresa}, é só me chamar.' },
  ],
  Academia: [
    { id: 'aca-0',  day: 0,  label: 'D+0',  body: 'Oi {nome_empresa}! Vi a academia em {cidade}. A maioria das academias perde alunos no 2º mês por falta de follow-up. Tenho uma automação no WhatsApp que resolve isso — quer ver?' },
    { id: 'aca-2',  day: 2,  label: 'D+2',  body: '{nome_empresa}, academias que fazem follow-up ativo retêm 3x mais alunos nos primeiros 90 dias. Posso te mostrar como montar isso em 1 semana?' },
    { id: 'aca-5',  day: 5,  label: 'D+5',  body: 'Pesquisei "academia em {cidade}" e a {nome_empresa} não aparece entre os primeiros resultados. Isso representa matrículas indo embora toda semana.' },
    { id: 'aca-10', day: 10, label: 'D+10', body: 'Sem problema! Se precisar de ajuda com retenção de alunos ou presença digital, estou por aqui.' },
  ],
  Imobiliária: [
    { id: 'imo-0',  day: 0,  label: 'D+0',  body: 'Oi {nome_empresa}! Quem busca imóvel em {cidade} contata até 5 imobiliárias — quem responde primeiro fecha. Tenho uma automação de WhatsApp que garante o primeiro contato. Posso mostrar?' },
    { id: 'imo-2',  day: 2,  label: 'D+2',  body: '{nome_empresa}, imobiliárias com landing page por bairro/tipo de imóvel geram 4x mais leads qualificados. Vale 10 minutos pra eu mostrar um exemplo?' },
    { id: 'imo-5',  day: 5,  label: 'D+5',  body: 'Olhei o digital da {nome_empresa}: não encontrei página dedicada para captação de leads em {cidade}. Isso é receita deixada na mesa todo mês.' },
    { id: 'imo-10', day: 10, label: 'D+10', body: 'Tudo bem! Quando quiser explorar captação digital de compradores e locatários, estou à disposição.' },
  ],
  Contabilidade: [
    { id: 'con-0',  day: 0,  label: 'D+0',  body: 'Oi {nome_empresa}! Vi o escritório em {cidade}. Clientes de contabilidade trocam de contador quando a comunicação é lenta — tenho uma automação via WhatsApp que resolve isso. Tem 2 min?' },
    { id: 'con-2',  day: 2,  label: 'D+2',  body: '{nome_empresa}, escritórios de contabilidade que se comunicam pelo WhatsApp de forma organizada retêm 30% mais clientes em período de declaração. Posso mostrar como?' },
    { id: 'con-5',  day: 5,  label: 'D+5',  body: 'Pesquisei "{nicho} em {cidade}" e a {nome_empresa} praticamente não aparece online. Novos clientes buscando contador na sua região não te encontram.' },
    { id: 'con-10', day: 10, label: 'D+10', body: 'Sem problemas! Qualquer hora que quiser melhorar a comunicação com clientes ou a captação digital, é só chamar.' },
  ],
}

/* ── SEQUENCES ── */

let _sequences = [
  {
    id: 1,
    name: 'Padrão 4 etapas',
    niche: 'Geral',
    steps: [
      { day: 0,  label: 'D+0',  templateId: 1,    condition: 'Primeiro envio' },
      { day: 2,  label: 'D+2',  templateId: 2,    condition: 'Sem resposta' },
      { day: 5,  label: 'D+5',  templateId: 3,    condition: 'Sem resposta' },
      { day: 10, label: 'D+10', templateId: null,  condition: 'Sem resposta' },
    ],
  },
  {
    id: 2,
    name: 'Advocacia — 4 etapas',
    niche: 'Advocacia',
    steps: [
      { day: 0,  label: 'D+0',  templateId: 'adv-0',  condition: 'Primeiro envio' },
      { day: 2,  label: 'D+2',  templateId: 'adv-2',  condition: 'Sem resposta' },
      { day: 5,  label: 'D+5',  templateId: 'adv-5',  condition: 'Sem resposta' },
      { day: 10, label: 'D+10', templateId: 'adv-10', condition: 'Sem resposta' },
    ],
  },
  {
    id: 3,
    name: 'Odontologia — 4 etapas',
    niche: 'Odontologia',
    steps: [
      { day: 0,  label: 'D+0',  templateId: 'odo-0',  condition: 'Primeiro envio' },
      { day: 2,  label: 'D+2',  templateId: 'odo-2',  condition: 'Sem resposta' },
      { day: 5,  label: 'D+5',  templateId: 'odo-5',  condition: 'Sem resposta' },
      { day: 10, label: 'D+10', templateId: 'odo-10', condition: 'Sem resposta' },
    ],
  },
]

/* ── CAMPAIGN SERVICE ── */

function compactDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function campaignStatus(status) {
  return {
    draft: 'Pausada',
    running: 'Rodando',
    paused: 'Pausada',
    finished: 'Finalizada',
    error: 'Erro',
  }[status] || status
}

function templateUse(purpose) {
  return {
    initial: 'Mensagem inicial',
    follow_up: 'Sem resposta',
    manual_reply: 'Lead respondeu',
    proposal: 'Proposta',
    other: 'Outro',
  }[purpose] || purpose
}
export const CampaignService = {
  async list() {
    const campaigns = await apiFetch('/api/campaigns')
    return campaigns.map(c => ({
      id: c.id,
      name: c.name,
      niche: c.niche,
      city: c.city,
      status: campaignStatus(c.status),
      progress: c.status === 'finished' ? 100 : c.status === 'running' ? 35 : 0,
      found: c.quantity_requested || 0,
      sent: 0,
      replies: 0,
    }))
  },

  async create(data) {
    const campaign = await apiFetch('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return {
      ...campaign,
      status: campaignStatus(campaign.status),
      progress: 0,
      found: campaign.quantity_requested || 0,
      sent: 0,
      replies: 0,
    }
  },

  async run(id) {
    return apiFetch(`/api/campaigns/${id}/run`, { method: 'POST' })
  },

  async status(id) {
    return apiFetch(`/api/campaigns/${id}/status`)
  },
}
/* ── LEAD SERVICE ── */

export const LeadService = {
  async list(filters = {}) {
    const params = new URLSearchParams()
    if (filters.search) params.set('search', filters.search)
    if (filters.hasWebsite !== null && filters.hasWebsite !== undefined) {
      params.set('hasWebsite', String(filters.hasWebsite))
    }
    const leads = await apiFetch(`/api/leads${params.toString() ? `?${params}` : ''}`)
    return leads.map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone || l.normalized_phone || '—',
      city: l.city || '—',
      niche: l.niche || '—',
      website: l.website || 'sem site',
      status: l.status || 'new',
      last: compactDate(l.last_interaction_at || l.created_at),
    }))
  },

  async discover(niche, city, limit = 30) {
    const params = new URLSearchParams({ niche, city, limit: String(limit) })
    return apiFetch(`/api/search/leads?${params}`)
  },

  async create(lead) {
    return apiFetch('/api/leads', {
      method: 'POST',
      body: JSON.stringify(lead),
    })
  },

  async exportCSV() {
    const leads = await this.list({})
    const headers = ['Empresa', 'Telefone', 'Cidade', 'Nicho', 'Website', 'Status', 'Ultima interacao']
    const rows = leads.map(l => [l.name, l.phone, l.city, l.niche, l.website, l.status, l.last])
    return [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  },
}
/* ── CONVERSATION SERVICE ── */

export const ConversationService = {
  async list() {
    return apiFetch('/api/inbox/conversations')
  },

  async send(conversationId, text) {
    return apiFetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/send`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  },
}
/* ── TEMPLATE SERVICE ── */

function resolveTemplateBody(id) {
  if (id === null || id === undefined) return null
  if (typeof id === 'string') {
    for (const msgs of Object.values(_nicheBank)) {
      const found = msgs.find(m => m.id === id)
      if (found) return found.body
    }
    return null
  }
  return _templates.find(t => t.id === id)?.body ?? null
}

export const TemplateService = {
  async list() {
    const templates = await apiFetch('/api/templates')
    return templates.map(t => ({
      id: t.id,
      name: t.name,
      use: templateUse(t.purpose),
      conversion: '—',
      body: t.body,
    }))
  },

  async create(data) {
    const template = await apiFetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return {
      id: template.id,
      name: template.name,
      use: templateUse(template.purpose),
      conversion: '—',
      body: template.body,
    }
  },

  async listNicheBank() {
    await delay(200)
    return { ..._nicheBank }
  },

  async listSequences() {
    await delay(200)
    return _sequences.map(s => ({ ...s, steps: s.steps.map(st => ({ ...st })) }))
  },

  async createSequence(data) {
    await delay(400)
    const seq = {
      id: Date.now(),
      name: data.name,
      niche: data.niche || 'Geral',
      steps: [
        { day: 0,  label: 'D+0',  templateId: null, condition: 'Primeiro envio' },
        { day: 2,  label: 'D+2',  templateId: null, condition: 'Sem resposta' },
        { day: 5,  label: 'D+5',  templateId: null, condition: 'Sem resposta' },
        { day: 10, label: 'D+10', templateId: null, condition: 'Sem resposta' },
      ],
    }
    _sequences.push(seq)
    return seq
  },

  async updateSequenceStep(seqId, stepIndex, templateId) {
    await delay(150)
    const seq = _sequences.find(s => s.id === seqId)
    if (!seq || !seq.steps[stepIndex]) throw new Error('Sequencia ou etapa nao encontrada')
    seq.steps[stepIndex].templateId = templateId
    seq.steps[stepIndex].preview = resolveTemplateBody(templateId)
    return { ...seq, steps: seq.steps.map(st => ({ ...st })) }
  },

  resolveBody: resolveTemplateBody,
}
/* ── SETTINGS SERVICE ── */

let _settings = {
  agencyName: 'Undaia Digital',
  signature: 'Equipe Undaia',
  optOut: 'Se preferir, não envio novas mensagens.',
  blacklist: '12 números bloqueados',
}

export const SettingsService = {
  async get() {
    await delay(150)
    return { ..._settings }
  },

  async save(data) {
    await delay(400)
    _settings = { ..._settings, ...data }
    return _settings
  },
}

/* ── WHATSAPP INSTANCE SERVICE ── */

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:3001'

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Erro ao chamar API.')
  }
  return data
}

export const WhatsAppInstanceService = {
  async health() {
    return apiFetch('/api/health')
  },

  async list() {
    return apiFetch('/api/whatsapp/instances')
  },

  async create(data) {
    const payload = typeof data === 'string' ? { instanceName: data } : data
    return apiFetch('/api/whatsapp/instances', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async connect(instanceName) {
    return apiFetch(`/api/whatsapp/instances/${encodeURIComponent(instanceName)}/connect`)
  },

  async state(instanceName) {
    return apiFetch(`/api/whatsapp/instances/${encodeURIComponent(instanceName)}/state`)
  },

  async restart(instanceName) {
    return apiFetch(`/api/whatsapp/instances/${encodeURIComponent(instanceName)}/restart`, {
      method: 'POST',
    })
  },

  async logout(instanceName) {
    return apiFetch(`/api/whatsapp/instances/${encodeURIComponent(instanceName)}/logout`, {
      method: 'POST',
    })
  },

  async delete(instanceName) {
    return apiFetch(`/api/whatsapp/instances/${encodeURIComponent(instanceName)}`, {
      method: 'DELETE',
    })
  },

  async sendText(instanceName, { number, text }) {
    return apiFetch(`/api/whatsapp/instances/${encodeURIComponent(instanceName)}/send-text`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    })
  },

  async listMessages() {
    return apiFetch('/api/whatsapp/messages')
  },
}
