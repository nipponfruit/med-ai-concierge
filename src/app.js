'use strict'

const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const pino = require('pino')
const pinoHttp = require('pino-http')

const { initKB, listKB, getKB } = require('./kb')
const { initRetriever, retrieve, resetRetriever } = require('./retriever')
const { detectRisk, detectForbidden, templates, POLICY_VERSION } = require('./policy')

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'res.headers["set-cookie"]'
    ],
    remove: true
  }
})

let ready = false
;(async () => {
  try {
    await initKB()
    await initRetriever()
    ready = true
    logger.info({ kbCount: getKB().length, retrieval: process.env.OPENAI_API_KEY ? 'openai_embeddings' : 'tfidf_ch2' }, 'Server initialized')
  } catch (e) {
    logger.error({ err: e }, 'Initialization failed')
  }
})()

function createApp() {
  const app = express()

  app.use(pinoHttp({
    logger,
    autoLogging: { ignorePaths: ['/health'] },
    serializers: {
      req(req) {
        return { method: req.method, url: req.url, id: req.id, headers: { 'user-agent': req.headers['user-agent'] } }
      },
      res(res) {
        return { statusCode: res.statusCode }
      }
    }
  }))

  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(express.static('public'))

  const corsOpts = process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : {}
  app.use(cors({ ...corsOpts, credentials: false }))

  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    standardHeaders: true,
    legacyHeaders: false
  })
  app.use('/api/ask', limiter)

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', ready, kbCount: getKB().length, policyVersion: POLICY_VERSION, time: new Date().toISOString() })
  })
  // Alias for Vercel rewrite: /health -> /api/health
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ready, kbCount: getKB().length, policyVersion: POLICY_VERSION, time: new Date().toISOString() })
  })

  app.get('/kb/list', (req, res) => {
    res.json(listKB())
  })
  // Alias for Vercel rewrite: /kb/* -> /api/kb/*
  app.get('/api/kb/list', (req, res) => {
    res.json(listKB())
  })

  app.post('/kb/reload', async (req, res) => {
    await initKB()
    await resetRetriever()
    await initRetriever()
    return res.json({ ok: true, kbCount: getKB().length })
  })
  app.post('/api/kb/reload', async (req, res) => {
    await initKB()
    await resetRetriever()
    await initRetriever()
    return res.json({ ok: true, kbCount: getKB().length })
  })

  app.post('/api/ask', async (req, res) => {
    const q = (req.body?.query || '').toString().trim()
    if (!q) return res.status(400).json({ error: 'query is required' })
    if (q.length > 1000) return res.status(400).json({ error: 'query too long' })

    let risk = detectRisk(q)
    const forbidden = detectForbidden(q)
    let docs = []
    try {
      docs = await retrieve(q, 3)
    } catch (e) {
      req.log?.error({ err: e }, 'retrieve_failed')
    }

    let citations = (docs || []).map(d => ({ title: d.title, url: d.url, source: d.source }))
    if (!citations || citations.length === 0) {
      citations = [{ title: 'no_citation', url: '', source: '' }]
    }

    let triage_hint = templates.careGuidance
    const answerParts = [templates.nonDiagnosticDisclaimer]
    if (risk.level === 'high') answerParts.push(templates.emergencyAdvice)

    if (forbidden.matched) {
      risk = { level: 'high', reasons: ['forbidden_terms', ...forbidden.terms] }
      triage_hint = templates.emergencyAdvice
      const answer = [templates.nonDiagnosticDisclaimer, templates.emergencyAdvice].join('\n\n')
      return res.json({ answer, citations, risk_level: risk.level, triage_hint })
    }

    if (!docs || docs.length === 0) {
      const info = templates.infoShortage(q)
      triage_hint = templates.careGuidance
      const answer = info.answer
      return res.json({ answer, citations, risk_level: 'low', triage_hint })
    }

    const bullets = []
    for (const d of docs) {
      const snippet = d.content.length > 400 ? d.content.slice(0, 400) + '…' : d.content
      bullets.push(`- ${d.title}: ${snippet}`)
    }
    answerParts.push('参考情報（出典の要点）：\n' + bullets.join('\n'))
    triage_hint = risk.level === 'high' ? templates.emergencyAdvice : templates.careGuidance

    const answer = answerParts.join('\n\n')
    return res.json({ answer, citations, risk_level: risk.level, triage_hint })
  })

  app.use((err, req, res, next) => {
    req.log?.error({ err }, 'Unhandled error')
    res.status(500).json({ error: 'internal_error' })
  })

  return app
}

module.exports = { createApp }
