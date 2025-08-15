const { getKB } = require('./kb')

let useEmbeddings = Boolean(process.env.OPENAI_API_KEY)
let docEmbeddings = new Map() // id -> number[]
let docTFIDF = new Map() // id -> { vec: Map(token->weight), norm: number }
let idf = new Map() // token -> idf

function normalize(text) {
  return (text || '').toString().toLowerCase().replace(/\s+/g, '')
}

function charNGrams(text, n = 2) {
  const s = normalize(text)
  const grams = []
  for (let i = 0; i <= Math.max(0, s.length - n); i++) grams.push(s.slice(i, i + n))
  return grams
}

function tf(tokens) {
  const m = new Map()
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1)
  return m
}

function buildTFIDF() {
  const docs = getKB()
  const N = Math.max(1, docs.length)
  const dfs = new Map()
  const tfs = new Map()

  for (const d of docs) {
    const id = d.id || d.title
    const tokens = charNGrams(`${d.title} ${d.content}`)
    const tfm = tf(tokens)
    tfs.set(id, tfm)
    for (const t of new Set(tokens)) dfs.set(t, (dfs.get(t) || 0) + 1)
  }

  idf = new Map()
  for (const [t, df] of dfs.entries()) idf.set(t, Math.log((N + 1) / (df + 1)) + 1)

  docTFIDF = new Map()
  for (const d of docs) {
    const id = d.id || d.title
    const tfm = tfs.get(id) || new Map()
    const vec = new Map()
    let norm = 0
    for (const [t, f] of tfm.entries()) {
      const w = (f / Math.max(1, tfm.size)) * (idf.get(t) || 0)
      vec.set(t, w)
      norm += w * w
    }
    docTFIDF.set(id, { vec, norm: Math.sqrt(norm) })
  }
}

async function openaiEmbed(text) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('no_openai_key')
  const fetchFn = globalThis.fetch || (await import('undici')).fetch
  const resp = await fetchFn('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) })
  })
  if (!resp.ok) throw new Error(`openai_embed_error_${resp.status}`)
  const data = await resp.json()
  return data.data[0].embedding
}

async function buildEmbeddings() {
  const docs = getKB()
  docEmbeddings = new Map()
  for (const d of docs) {
    const id = d.id || d.title
    try {
      const emb = await openaiEmbed(`${d.title}\n${d.content}`)
      docEmbeddings.set(id, emb)
    } catch (e) {
      useEmbeddings = false
      break
    }
  }
}

function cosine(a, b) {
  const len = Math.min(a.length, b.length)
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < len; i++) { const x = a[i] || 0, y = b[i] || 0; dot += x * y; na += x * x; nb += y * y }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom ? dot / denom : 0
}

function cosineSparse(qvec, qnorm, docEntry) {
  let dot = 0
  for (const [t, w] of qvec.entries()) { const v = docEntry.vec.get(t) || 0; dot += w * v }
  const dnorm = docEntry.norm || 1
  const denom = (qnorm || 1) * dnorm
  return denom ? dot / denom : 0
}

async function initRetriever() {
  if (useEmbeddings) {
    try { await buildEmbeddings(); if (useEmbeddings) return } catch (_) { useEmbeddings = false }
  }
  buildTFIDF()
}

async function resetRetriever() {
  docEmbeddings = new Map()
  docTFIDF = new Map()
  idf = new Map()
  useEmbeddings = Boolean(process.env.OPENAI_API_KEY)
}

async function retrieve(query, topK = 3) {
  const docs = getKB()
  if (docs.length === 0) return []

  if (useEmbeddings && docEmbeddings.size === docs.length) {
    try {
      const qemb = await openaiEmbed(query)
      const scored = docs.map(d => ({ doc: d, score: cosine(qemb, docEmbeddings.get(d.id || d.title) || []) }))
      scored.sort((a, b) => b.score - a.score)
      return scored.slice(0, topK).map(s => s.doc)
    } catch (_) {
      // fall through
      useEmbeddings = false
    }
  }

  if (docTFIDF.size === 0) buildTFIDF()
  const tokens = charNGrams(query)
  const tfm = tf(tokens)
  let qnorm = 0
  const qvec = new Map()
  for (const [t, f] of tfm.entries()) { const w = (f / Math.max(1, tfm.size)) * (idf.get(t) || 0); qvec.set(t, w); qnorm += w * w }
  qnorm = Math.sqrt(qnorm)

  const scored = docs.map(d => {
    const id = d.id || d.title
    const entry = docTFIDF.get(id) || { vec: new Map(), norm: 1 }
    return { doc: d, score: cosineSparse(qvec, qnorm, entry) }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map(s => s.doc)
}

module.exports = { initRetriever, retrieve, resetRetriever }
