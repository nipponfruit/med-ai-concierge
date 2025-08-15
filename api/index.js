'use strict'
const { createApp } = require('../src/app')

// Initialize the Express app once per cold start
const app = createApp()

// Directly export the Express request handler for Vercel Node functions
module.exports = (req, res) => app(req, res)
