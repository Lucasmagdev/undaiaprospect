import { metric, animateMetrics, progress } from '../components.js'

const funnel = [
  { label: 'Encontrado', pct: 100 },
  { label: 'Enviado',    pct: 76 },
  { label: 'Respondeu',  pct: 16 },
  { label: 'Reunião',    pct: 7 },
  { label: 'Fechado',    pct: 3 },
]

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Performance comercial</p>
        <h1>Relatórios</h1>
      </div>
    </section>
    <section class="metrics">
      ${metric('Taxa de resposta', '15.8%', '+3.1% vs semana passada')}
      ${metric('Melhor nicho', 'Restaurantes', '18.6% de resposta')}
      ${metric('Melhor cidade', 'Rio de Janeiro', '14 fechamentos')}
      ${metric('Custo / lead', 'R$ 0,42', 'Places + WhatsApp')}
    </section>
    <article class="panel">
      <div class="panel-head"><h2>Funil de vendas</h2></div>
      <div class="funnel">
        ${funnel.map(row => `
          <div class="funnel-row">
            <span>${row.label}</span>
            ${progress(row.pct)}
            <span class="funnel-pct">${row.pct}%</span>
          </div>
        `).join('')}
      </div>
    </article>
  `
}

export function setup(root) {
  // Funnel bars animate in
  root.querySelectorAll('.funnel-row .progress span').forEach((bar, i) => {
    const w = bar.style.width
    bar.style.width = '0'
    setTimeout(() => { bar.style.width = w }, 100 + i * 80)
  })
}
