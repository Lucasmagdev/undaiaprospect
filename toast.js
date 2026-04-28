let container = null

function getContainer() {
  if (!container || !document.body.contains(container)) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  return container
}

export function toast(message, type = 'success', duration = 3500) {
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'i' }
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.innerHTML = `<span class="toast-icon">${icons[type] ?? icons.info}</span><span>${message}</span>`

  const c = getContainer()
  c.prepend(el)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('toast-visible'))
  })

  const dismiss = () => {
    el.classList.remove('toast-visible')
    el.addEventListener('transitionend', () => el.remove(), { once: true })
  }

  el.addEventListener('click', dismiss)
  setTimeout(dismiss, duration)
}
