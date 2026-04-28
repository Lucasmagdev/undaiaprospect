import { badge } from '../components.js'
import { toast } from '../toast.js'

const integrations = [
  {
    name: 'Google Places API',
    desc: 'Busca empresas, endereço, website e telefone quando disponível.',
    status: 'Planejada',
    docs: 'https://developers.google.com/maps/documentation/places',
  },
  {
    name: 'Supabase',
    desc: 'Banco de leads, campanhas, logs e templates.',
    status: 'Planejada',
    docs: 'https://supabase.com/docs',
  },
  {
    name: 'Z-API WhatsApp',
    desc: 'Envio controlado e webhook de respostas.',
    status: 'Planejada',
    docs: 'https://developer.z-api.io',
  },
  {
    name: 'OpenAI',
    desc: 'Geração e melhoria de mensagens por nicho.',
    status: 'Futuro',
    docs: 'https://platform.openai.com/docs',
  },
]

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Conexões externas</p>
        <h1>Integrações</h1>
      </div>
    </section>
    <section class="cards-grid">
      ${integrations.map((intg, i) => `
        <article class="panel integration">
          <div class="panel-head">
            <h2>${intg.name}</h2>
            ${badge(intg.status)}
          </div>
          <p>${intg.desc}</p>
          <div style="display:flex;gap:8px;margin-top:auto;flex-wrap:wrap">
            <button class="secondary test-btn" data-index="${i}">Testar conexão</button>
            <a class="secondary" href="${intg.docs}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;min-height:38px;padding:0 16px;font-size:.845rem;font-weight:600;text-decoration:none;border-radius:10px;border:1px solid var(--border-strong);color:var(--text-2)">Docs</a>
          </div>
        </article>
      `).join('')}
    </section>
  `
}

export function setup(root) {
  root.querySelectorAll('.test-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const intg = integrations[parseInt(btn.dataset.index)]
      btn.disabled = true
      btn.textContent = 'Testando...'
      await new Promise(r => setTimeout(r, 1200))
      btn.disabled = false
      btn.textContent = 'Testar conexão'
      // Mock: not configured yet
      toast(`${intg.name} não configurada. Adicione as credenciais nas variáveis de ambiente.`, 'warning')
    })
  })
}
