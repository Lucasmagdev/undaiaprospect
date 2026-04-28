import { toast } from '../toast.js'
import { SettingsService } from '../services.js'

export function render() {
  return `
    <section class="section-head">
      <div>
        <p class="eyebrow">Preferências gerais</p>
        <h1>Configurações</h1>
      </div>
    </section>
    <section class="settings-grid" id="settings-form">
      <div style="display:flex;flex-direction:column;gap:14px;background:var(--bg);border-radius:14px;padding:24px;border:1px solid var(--border)">
        ${[1,2].map(i => `<div class="skeleton" style="height:40px;animation-delay:${i*80}ms"></div>`).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;background:var(--bg);border-radius:14px;padding:24px;border:1px solid var(--border)">
        ${[1,2].map(i => `<div class="skeleton" style="height:40px;animation-delay:${i*80 + 200}ms"></div>`).join('')}
      </div>
    </section>
  `
}

export async function setup(root) {
  const formSection = root.querySelector('#settings-form')

  let settings
  try {
    settings = await SettingsService.get()
  } catch {
    toast('Erro ao carregar configurações.', 'error')
    return
  }

  formSection.innerHTML = `
    <article class="panel">
      <h2 style="margin-bottom:14px">Empresa</h2>
      <div style="display:grid;gap:12px">
        <label>Nome da agência <input id="s-name" value="${settings.agencyName}" /></label>
        <label>Assinatura padrão <input id="s-sig" value="${settings.signature}" /></label>
      </div>
    </article>
    <article class="panel">
      <h2 style="margin-bottom:14px">Compliance</h2>
      <div style="display:grid;gap:12px">
        <label>Mensagem de opt-out <input id="s-optout" value="${settings.optOut}" /></label>
        <label>Blacklist <input id="s-blacklist" value="${settings.blacklist}" /></label>
      </div>
    </article>
    <div style="grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px">
      <button class="secondary" id="reset-btn">Descartar</button>
      <button class="primary" id="save-btn">Salvar configurações</button>
    </div>
  `

  const getValues = () => ({
    agencyName: root.querySelector('#s-name').value,
    signature:  root.querySelector('#s-sig').value,
    optOut:     root.querySelector('#s-optout').value,
    blacklist:  root.querySelector('#s-blacklist').value,
  })

  root.querySelector('#save-btn').addEventListener('click', async () => {
    const btn = root.querySelector('#save-btn')
    btn.disabled = true
    btn.textContent = 'Salvando...'
    try {
      await SettingsService.save(getValues())
      toast('Configurações salvas com sucesso.', 'success')
    } catch {
      toast('Erro ao salvar configurações.', 'error')
    } finally {
      btn.disabled = false
      btn.textContent = 'Salvar configurações'
    }
  })

  root.querySelector('#reset-btn').addEventListener('click', () => {
    root.querySelector('#s-name').value    = settings.agencyName
    root.querySelector('#s-sig').value     = settings.signature
    root.querySelector('#s-optout').value  = settings.optOut
    root.querySelector('#s-blacklist').value = settings.blacklist
    toast('Alterações descartadas.', 'info')
  })
}
