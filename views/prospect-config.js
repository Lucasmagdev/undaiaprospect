import { toast } from '../toast.js'
import {
  DEFAULT_CONFIG, loadConfig, saveConfig, resetConfig, isCustomized,
  prospectScoreClient, prospectSignalsClient,
} from '../prospect.js'

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function scoreBar(score) {
  const cls   = score >= 65 ? 'var(--green-600)' : score >= 40 ? '#f59e0b' : 'var(--red-500)'
  const label = score >= 65 ? 'Alto' : score >= 40 ? 'Médio' : 'Baixo'
  return `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="flex:1;height:10px;border-radius:99px;background:var(--border);overflow:hidden">
        <div style="width:${score}%;height:100%;background:${cls};border-radius:99px;transition:width .3s"></div>
      </div>
      <strong style="font-size:1.15rem;color:${cls};min-width:36px">${score}</strong>
      <span style="font-size:.8rem;color:var(--text-2)">${label}</span>
    </div>
  `
}

function numberInput(id, label, value, min, max, hint = '') {
  return `
    <label style="display:flex;flex-direction:column;gap:4px">
      <span style="font-size:.78rem;font-weight:600;color:var(--text-2)">${label}</span>
      <input type="number" id="${id}" value="${value}" min="${min}" max="${max}"
        style="width:90px;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);font-size:.85rem;color:var(--text-1)">
      ${hint ? `<span style="font-size:.7rem;color:var(--text-3)">${hint}</span>` : ''}
    </label>
  `
}

function configRow(label, inputs) {
  return `
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;padding:12px 0;border-bottom:1px solid var(--border)">
      <span style="width:180px;font-size:.82rem;color:var(--text-1);font-weight:500;padding-top:20px">${label}</span>
      ${inputs}
    </div>
  `
}

/* ── Render ──────────────────────────────────────────────────────────────── */

export function render() {
  return `
    <section class="section-head">
      <div style="display:flex;align-items:center;gap:12px">
        <button id="pc-back" class="secondary" style="padding:6px 14px;font-size:.82rem">← Leads</button>
        <div>
          <p class="eyebrow">Qualificação de prospecção</p>
          <h1 style="margin:0">Configurar Scoring</h1>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="secondary" id="pc-reset">Restaurar padrão</button>
        <button class="primary"   id="pc-save">Salvar configuração</button>
      </div>
    </section>

    <div style="display:grid;grid-template-columns:1fr 380px;gap:20px;align-items:start">

      <!-- COLUNA ESQUERDA: formulário -->
      <div style="display:flex;flex-direction:column;gap:16px">

        <!-- Seção: Faixas de avaliações -->
        <article class="panel" style="padding:20px 24px">
          <h3 style="margin:0 0 4px">Avaliações no Google</h3>
          <p style="font-size:.78rem;color:var(--text-2);margin:0 0 12px">
            Quantas avaliações separa um PME ideal de uma marca grande demais.
          </p>
          ${configRow('Faixa ideal',
            numberInput('reviews_ideal_min', 'Mínimo', 10, 0, 100, 'abaixo = recém aberto') +
            numberInput('reviews_ideal_max', 'Máximo', 50, 10, 500, 'ponto de virada') +
            numberInput('reviews_ideal_bonus', 'Bônus', 25, 0, 60, 'pts adicionados')
          )}
          ${configRow('Faixa média',
            numberInput('reviews_medium_max', 'Até', 200, 50, 1000, 'ainda aceitável') +
            numberInput('reviews_medium_bonus', 'Bônus', 15, 0, 60, 'pts adicionados')
          )}
          ${configRow('Penalidade grande',
            numberInput('reviews_large_threshold', 'Acima de', 500, 100, 5000, 'começa a penalizar') +
            numberInput('reviews_large_penalty', 'Penalidade', 20, 0, 80, 'pts removidos')
          )}
          ${configRow('Penalidade enorme',
            numberInput('reviews_huge_threshold', 'Acima de', 1000, 200, 50000, 'penalidade forte') +
            numberInput('reviews_huge_penalty', 'Penalidade', 40, 0, 100, 'pts removidos')
          )}
        </article>

        <!-- Seção: Sinais de porte -->
        <article class="panel" style="padding:20px 24px">
          <h3 style="margin:0 0 4px">Sinais de porte e acesso</h3>
          <p style="font-size:.78rem;color:var(--text-2);margin:0 0 12px">
            Indicadores de que é um pequeno negócio com dono acessível.
          </p>
          ${configRow('Presença digital',
            numberInput('no_website_bonus',    'Sem site (bônus)', 20, 0, 50) +
            numberInput('has_website_penalty', 'Com site (penalidade)', 5, 0, 30)
          )}
          ${configRow('Tipo de telefone',
            numberInput('mobile_bonus',      'Celular (bônus)', 15, 0, 50) +
            numberInput('landline_penalty',  'Fixo (penalidade)', 5, 0, 30)
          )}
          ${configRow('Rating no Google',
            numberInput('rating_medium_bonus',   '3.0–4.3 (bônus)', 10, 0, 30, 'aberto a melhorias') +
            numberInput('rating_great_penalty',  '4.5+ com 300+ (penalidade)', 15, 0, 50, 'marca consolidada')
          )}
        </article>

        <!-- Seção: Penalidades -->
        <article class="panel" style="padding:20px 24px">
          <h3 style="margin:0 0 4px">Penalidades de porte</h3>
          <p style="font-size:.78rem;color:var(--text-2);margin:0 0 12px">
            Quanto descontar quando o lead claramente não é o perfil.
          </p>
          ${configRow('Rede / franquia',
            numberInput('chain_penalty', 'Penalidade', 80, 0, 100, 'detectado pelo nome')
          )}
          ${configRow('Tipo corporativo',
            numberInput('corporate_type_penalty', 'Penalidade', 40, 0, 100, 'detectado pelo tipo Google')
          )}
        </article>

        <!-- Seção: Lista negra de nomes -->
        <article class="panel" style="padding:20px 24px">
          <h3 style="margin:0 0 4px">Lista negra — nomes</h3>
          <p style="font-size:.78rem;color:var(--text-2);margin:0 0 10px">
            Um por linha. Qualquer lead cujo nome contenha uma dessas palavras recebe a penalidade de rede/franquia.
          </p>
          <textarea id="chain_keywords" rows="8"
            style="width:100%;font-size:.8rem;font-family:monospace;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);resize:vertical;box-sizing:border-box;color:var(--text-1)"></textarea>
        </article>

        <!-- Seção: Tipos bloqueados -->
        <article class="panel" style="padding:20px 24px">
          <h3 style="margin:0 0 4px">Tipos de negócio bloqueados</h3>
          <p style="font-size:.78rem;color:var(--text-2);margin:0 0 10px">
            Um por linha. Usa os tipos retornados pelo Google Places (ex: <code>hospital</code>, <code>bank</code>, <code>lodging</code>).
            Leads com qualquer desses tipos recebem a penalidade de tipo corporativo.
          </p>
          <textarea id="blocked_types" rows="6"
            style="width:100%;font-size:.8rem;font-family:monospace;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);resize:vertical;box-sizing:border-box;color:var(--text-1)"></textarea>
        </article>

      </div>

      <!-- COLUNA DIREITA: painel de teste -->
      <div style="position:sticky;top:20px;display:flex;flex-direction:column;gap:12px">
        <article class="panel" style="padding:20px 24px">
          <h3 style="margin:0 0 4px">Testar scoring</h3>
          <p style="font-size:.78rem;color:var(--text-2);margin:0 0 14px">
            Simule um lead e veja o score com a configuração atual.
          </p>

          <div style="display:flex;flex-direction:column;gap:10px">
            <label style="font-size:.8rem;font-weight:600">
              Nome do negócio
              <input id="t-name" type="text" value="Clínica Odonto Sorriso" placeholder="ex: Padaria do João"
                style="display:block;width:100%;margin-top:3px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface);font-size:.85rem;box-sizing:border-box;color:var(--text-1)">
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label style="font-size:.8rem;font-weight:600">
                Avaliações Google
                <input id="t-reviews" type="number" value="45" min="0"
                  style="display:block;width:100%;margin-top:3px;padding:7px;border-radius:7px;border:1px solid var(--border);background:var(--surface);font-size:.85rem;box-sizing:border-box;color:var(--text-1)">
              </label>
              <label style="font-size:.8rem;font-weight:600">
                Rating (0–5)
                <input id="t-rating" type="number" value="4.1" min="0" max="5" step="0.1"
                  style="display:block;width:100%;margin-top:3px;padding:7px;border-radius:7px;border:1px solid var(--border);background:var(--surface);font-size:.85rem;box-sizing:border-box;color:var(--text-1)">
              </label>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label style="font-size:.8rem;font-weight:600">
                Tem site?
                <select id="t-website"
                  style="display:block;width:100%;margin-top:3px;padding:7px;border-radius:7px;border:1px solid var(--border);background:var(--surface);font-size:.85rem;box-sizing:border-box;color:var(--text-1)">
                  <option value="no" selected>Não tem</option>
                  <option value="yes">Tem site</option>
                </select>
              </label>
              <label style="font-size:.8rem;font-weight:600">
                Telefone
                <select id="t-phone"
                  style="display:block;width:100%;margin-top:3px;padding:7px;border-radius:7px;border:1px solid var(--border);background:var(--surface);font-size:.85rem;box-sizing:border-box;color:var(--text-1)">
                  <option value="mobile" selected>Celular</option>
                  <option value="landline">Fixo</option>
                  <option value="unknown">Sem telefone</option>
                </select>
              </label>
            </div>

            <label style="font-size:.8rem;font-weight:600">
              Tipos Google
              <input id="t-types" type="text" value="dentist, health" placeholder="restaurant, food, ...  (vírgula)"
                style="display:block;width:100%;margin-top:3px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface);font-size:.85rem;box-sizing:border-box;color:var(--text-1)">
            </label>
          </div>

          <!-- Resultado -->
          <div id="test-result" style="margin-top:16px;padding:14px;border-radius:10px;background:var(--surface);border:1px solid var(--border)">
            <p style="font-size:.75rem;color:var(--text-3);margin:0">Preencha os campos acima para ver o score.</p>
          </div>
        </article>

        <!-- Card info: o que cada faixa significa -->
        <article class="panel" style="padding:16px 20px;font-size:.78rem;color:var(--text-2)">
          <strong style="color:var(--text-1);display:block;margin-bottom:8px">Faixas de potencial</strong>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:10px;height:10px;border-radius:50%;background:var(--green-600);flex-shrink:0"></span>
              <span><strong>65–100</strong> — Alto: PME ideal, vale priorizar</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;flex-shrink:0"></span>
              <span><strong>40–64</strong> — Médio: possível, avaliar sinais</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:10px;height:10px;border-radius:50%;background:var(--red-500);flex-shrink:0"></span>
              <span><strong>0–39</strong> — Baixo: provavelmente grande demais</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  `
}

/* ── Setup ───────────────────────────────────────────────────────────────── */

export async function setup(root) {
  const cfg = loadConfig()

  // Preenche inputs numéricos com config salva
  const NUMERIC_FIELDS = [
    'reviews_ideal_min','reviews_ideal_max','reviews_ideal_bonus',
    'reviews_medium_max','reviews_medium_bonus',
    'reviews_large_threshold','reviews_large_penalty',
    'reviews_huge_threshold','reviews_huge_penalty',
    'no_website_bonus','has_website_penalty',
    'mobile_bonus','landline_penalty',
    'rating_medium_bonus','rating_great_penalty',
    'chain_penalty','corporate_type_penalty',
  ]
  NUMERIC_FIELDS.forEach(field => {
    const el = root.querySelector(`#${field}`)
    if (el) el.value = cfg[field] ?? DEFAULT_CONFIG[field]
  })

  // Preenche textareas
  root.querySelector('#chain_keywords').value = (cfg.chain_keywords || []).join('\n')
  root.querySelector('#blocked_types').value  = (cfg.blocked_types  || []).join('\n')

  // Back
  root.querySelector('#pc-back').addEventListener('click', () => {
    window.__navigate?.('leads')
  })

  // Restaurar padrão
  root.querySelector('#pc-reset').addEventListener('click', () => {
    if (!confirm('Restaurar todos os parâmetros para o padrão? Esta ação não pode ser desfeita.')) return
    const def = resetConfig()
    NUMERIC_FIELDS.forEach(f => {
      const el = root.querySelector(`#${f}`)
      if (el) el.value = def[f]
    })
    root.querySelector('#chain_keywords').value = def.chain_keywords.join('\n')
    root.querySelector('#blocked_types').value  = def.blocked_types.join('\n')
    runTest(root)
    toast('Configuração restaurada para o padrão.', 'success')
  })

  // Salvar
  root.querySelector('#pc-save').addEventListener('click', () => {
    const newCfg = readForm(root)
    saveConfig(newCfg)
    toast('Configuração salva! Será aplicada na próxima busca.', 'success')
  })

  // Teste ao vivo — recalcula sempre que qualquer input muda
  root.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('input', () => runTest(root))
  })

  // Resultado inicial
  runTest(root)
}

/* ── Leitura do formulário ───────────────────────────────────────────────── */

function readForm(root) {
  const n = id => Number(root.querySelector(`#${id}`)?.value) || 0
  return {
    base_score:               DEFAULT_CONFIG.base_score,
    reviews_ideal_min:        n('reviews_ideal_min'),
    reviews_ideal_max:        n('reviews_ideal_max'),
    reviews_ideal_bonus:      n('reviews_ideal_bonus'),
    reviews_medium_max:       n('reviews_medium_max'),
    reviews_medium_bonus:     n('reviews_medium_bonus'),
    reviews_large_threshold:  n('reviews_large_threshold'),
    reviews_large_penalty:    n('reviews_large_penalty'),
    reviews_huge_threshold:   n('reviews_huge_threshold'),
    reviews_huge_penalty:     n('reviews_huge_penalty'),
    reviews_tiny_penalty:     DEFAULT_CONFIG.reviews_tiny_penalty,
    no_website_bonus:         n('no_website_bonus'),
    has_website_penalty:      n('has_website_penalty'),
    mobile_bonus:             n('mobile_bonus'),
    landline_penalty:         n('landline_penalty'),
    rating_medium_bonus:      n('rating_medium_bonus'),
    rating_great_penalty:     n('rating_great_penalty'),
    chain_penalty:            n('chain_penalty'),
    corporate_type_penalty:   n('corporate_type_penalty'),
    chain_keywords: root.querySelector('#chain_keywords').value
      .split('\n').map(s => s.trim().toLowerCase()).filter(Boolean),
    blocked_types: root.querySelector('#blocked_types').value
      .split('\n').map(s => s.trim().toLowerCase()).filter(Boolean),
  }
}

/* ── Teste ao vivo ───────────────────────────────────────────────────────── */

function runTest(root) {
  const cfg = readForm(root)

  const name    = root.querySelector('#t-name')?.value || ''
  const reviews = Number(root.querySelector('#t-reviews')?.value) || 0
  const rating  = Number(root.querySelector('#t-rating')?.value)  || 0
  const website = root.querySelector('#t-website')?.value === 'yes' ? 'https://exemplo.com' : null
  const phoneType = root.querySelector('#t-phone')?.value || 'unknown'
  const typesRaw  = root.querySelector('#t-types')?.value || ''
  const types     = typesRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

  // Monta um lead sintético compatível com prospectScoreClient
  const phone = phoneType === 'mobile'   ? '31991234567'
              : phoneType === 'landline' ? '3133334444'
              : null
  const lead = {
    name,
    phone,
    website,
    raw_payload: { user_ratings_total: reviews, rating, types },
  }

  const score   = prospectScoreClient(lead, cfg)
  const signals = prospectSignalsClient(lead, cfg)

  const posHtml = signals.pos.map(s =>
    `<div style="color:var(--green-600);font-size:.78rem">✓ ${s}</div>`).join('')
  const negHtml = signals.neg.map(s =>
    `<div style="color:var(--red-500);font-size:.78rem">✗ ${s}</div>`).join('')

  root.querySelector('#test-result').innerHTML = `
    <div style="margin-bottom:10px">${scoreBar(score)}</div>
    ${posHtml || negHtml
      ? `<div style="display:flex;flex-direction:column;gap:3px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">${posHtml}${negHtml}</div>`
      : '<div style="font-size:.75rem;color:var(--text-3)">Sem sinais detectados com esses dados.</div>'
    }
  `
}
