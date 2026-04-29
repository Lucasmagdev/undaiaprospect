export function openModal({ title, body, submitLabel = 'Confirmar', onSubmit, onCancel, onMount } = {}) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="modal-close" aria-label="Fechar">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer">
        <button class="secondary modal-cancel">Cancelar</button>
        <button class="primary modal-submit">${submitLabel}</button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('modal-visible')
      onMount?.(overlay.querySelector('.modal-body'))
    })
  })

  const close = () => {
    overlay.classList.remove('modal-visible')
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true })
  }

  overlay.querySelector('.modal-close').addEventListener('click', close)
  overlay.querySelector('.modal-cancel').addEventListener('click', () => { onCancel?.(); close() })
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })

  const submitBtn = overlay.querySelector('.modal-submit')
  submitBtn.addEventListener('click', async () => {
    if (!onSubmit) return close()
    submitBtn.disabled = true
    submitBtn.textContent = 'Salvando...'
    try {
      await onSubmit(overlay.querySelector('.modal-body'))
      close()
    } catch (err) {
      submitBtn.disabled = false
      submitBtn.textContent = submitLabel
    }
  })

  // Focus trap
  overlay.querySelector('.modal-submit').focus()

  return { close }
}
