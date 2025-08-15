'use strict'

const { createApp } = require('../src/app')

// Create Express app once per cold start
const app = createApp()

// Vercel Node serverless function handler
module.exports = (req, res) => app(req, res)
