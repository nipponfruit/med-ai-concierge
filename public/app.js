document.addEventListener('DOMContentLoaded', async () => {
  const qEl = document.getElementById('question')
  const btn = document.getElementById('askBtn')
  const statusEl = document.getElementById('status')
  const answerEl = document.getElementById('answer')
  const triageEl = document.getElementById('triage')
  const citeEl = document.getElementById('citations')
  const policyVerEl = document.getElementById('policyVer')

  try {
    const h = await fetch('/health').then(r => r.json())
    if (h && h.policyVersion) policyVerEl.textContent = h.policyVersion
  } catch (_) { /* ignore */ }

  async function ask() {
    const query = (qEl.value || '').trim()
    if (!query) {
      statusEl.textContent = '質問を入力してください'
      return
    }
    btn.disabled = true
    statusEl.textContent = '照会中…'
    answerEl.textContent = ''
    triageEl.textContent = ''
    citeEl.innerHTML = ''

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'request_failed')

      answerEl.textContent = data.answer || ''
      triageEl.textContent = data.triage_hint || ''
      const risk = data.risk_level || 'low'

      const cites = Array.isArray(data.citations) ? data.citations : []
      for (const c of cites) {
        const a = document.createElement('a')
        a.className = 'badge' + (risk === 'high' ? ' danger' : '')
        a.textContent = c.title || c.source || 'no_citation'
        if (c.url) { a.href = c.url; a.target = '_blank'; a.rel = 'noopener noreferrer' } else { a.href = '#' }
        citeEl.appendChild(a)
      }
      if (cites.length === 0) {
        const span = document.createElement('span')
        span.className = 'badge'
        span.textContent = 'no_citation'
        citeEl.appendChild(span)
      }
      statusEl.textContent = 'OK'
    } catch (e) {
      statusEl.textContent = 'エラーが発生しました'
      answerEl.textContent = ''
      triageEl.textContent = ''
      citeEl.innerHTML = ''
    } finally {
      btn.disabled = false
    }
  }

  btn.addEventListener('click', ask)
  qEl.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') ask()
  })
})
