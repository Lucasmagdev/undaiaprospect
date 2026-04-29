import './style.css'
import { icons } from './icons.js'

/* ── TABS ── */

const tabs = [
  { id: 'dashboard',    label: 'Dashboard',    icon: 'dashboard' },
  { id: 'campaigns',   label: 'Campanhas',     icon: 'campaigns' },
  { id: 'leads',       label: 'Leads',         icon: 'leads' },
  { id: 'inbox',       label: 'Inbox',         icon: 'inbox' },
  { id: 'instances',   label: 'Instâncias',    icon: 'whatsapp' },
  { id: 'messages',    label: 'Mensagens',     icon: 'messages' },
  { id: 'automation',  label: 'Automações',    icon: 'automation' },
  { id: 'integrations',label: 'Integrações',   icon: 'integrations' },
  { id: 'reports',     label: 'Relatórios',    icon: 'reports' },
  { id: 'settings',    label: 'Configurações', icon: 'settings' },
]

const viewModules = {
  dashboard:    () => import('./views/dashboard.js'),
  campaigns:    () => import('./views/campaigns.js'),
  leads:        () => import('./views/leads.js'),
  inbox:        () => import('./views/inbox.js'),
  instances:    () => import('./views/instances.js'),
  messages:     () => import('./views/messages.js'),
  automation:   () => import('./views/automation.js'),
  integrations: () => import('./views/integrations.js'),
  reports:      () => import('./views/reports.js'),
  settings:     () => import('./views/settings.js'),
}

let activeTab = 'dashboard'
const app = document.querySelector('#app')

/* ── ROUTER ── */

async function navigate(tabId) {
  activeTab = tabId
  renderShell()

  const contentView = document.querySelector('.content-view')
  const mod = await viewModules[tabId]()

  contentView.innerHTML = mod.render()
  await mod.setup?.(contentView)
}

/* ── SHELL ── */

function renderShell() {
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon">${icons.whatsapp}</div>
        <div class="brand-text">
          <strong>Undaia Prospect</strong>
          <span>WhatsApp Sales OS</span>
        </div>
      </div>
      <nav>
        ${tabs.map(tab => `
          <button class="nav-item ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
            ${icons[tab.icon]}
            ${tab.label}
          </button>
        `).join('')}
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-status">
          <div class="live-dot"></div>
          <div class="sidebar-status-text">
          <strong>Evolution conectada</strong>
            <p>Fila pronta para envio</p>
          </div>
        </div>
      </div>
    </aside>
    <main class="content">
      <div class="content-view"></div>
    </main>
  `

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.tab))
  })
}

/* ── BOOT ── */

renderShell()

;(async () => {
  const mod = await viewModules[activeTab]()
  const view = document.querySelector('.content-view')
  view.innerHTML = mod.render()
  await mod.setup?.(view)
})()
