const fs = require('fs/promises')
const path = require('path')

let KB = []
const KB_DIR = path.join(__dirname, '..', 'data', 'kb')
const KB_DIR_MD = path.join(__dirname, '..', 'kb')

function parseFrontMatter(txt) {
  const res = { meta: {}, body: txt }
  const lines = txt.split(/\r?\n/)
  if (lines[0] && lines[0].trim() === '---') {
    let i = 1
    const meta = {}
    for (; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '---') { i++; break }
      const m = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/)
      if (m) meta[m[1]] = m[2].trim()
    }
    res.meta = meta
    res.body = lines.slice(i).join('\n')
  }
  return res
}

function mdToDoc(filename, txt) {
  const { meta, body } = parseFrontMatter(txt)
  let title = meta.title || ''
  if (!title) {
    const m = body.match(/^\s*#\s+(.+)$/m)
    if (m) title = m[1].trim()
  }
  const id = meta.id || path.parse(filename).name
  return {
    id,
    title: title || id,
    url: meta.url || '',
    source: meta.source || '',
    updated_at: meta.updated_at || '',
    content: body.trim()
  }
}

async function initKB() {
  const byId = new Map()
  // 1) Load Markdown KB (/kb/*.md)
  try {
    const files = await fs.readdir(KB_DIR_MD)
    for (const f of files) {
      if (!f.endsWith('.md')) continue
      const p = path.join(KB_DIR_MD, f)
      try {
        const txt = await fs.readFile(p, 'utf-8')
        const doc = mdToDoc(f, txt)
        byId.set(doc.id, doc)
      } catch (_) { /* ignore broken file */ }
    }
  } catch (_) { /* ignore if no dir */ }

  // 2) Fallback/merge JSON KB (/data/kb/*.json)
  try {
    const files = await fs.readdir(KB_DIR)
    for (const f of files) {
      if (!f.endsWith('.json')) continue
      const p = path.join(KB_DIR, f)
      try {
        const txt = await fs.readFile(p, 'utf-8')
        const doc = JSON.parse(txt)
        if (doc && (doc.title || doc.id) && doc.content) {
          const id = doc.id || path.parse(f).name
          byId.set(id, {
            id,
            title: doc.title || id,
            url: doc.url || '',
            source: doc.source || '',
            updated_at: doc.updated_at || '',
            content: doc.content
          })
        }
      } catch (_) { /* ignore broken file */ }
    }
  } catch (_) { /* ignore if no dir */ }

  KB = Array.from(byId.values())
  return KB
}

function listKB() {
  return KB.map(({ id, title, url, source, updated_at }) => ({ id, title, url, source, updated_at }))
}

function getKB() { return KB }

module.exports = { initKB, listKB, getKB }
