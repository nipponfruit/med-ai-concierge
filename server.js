'use strict'

require('dotenv').config()
const { createApp } = require('./src/app')

const app = createApp()
const port = parseInt(process.env.PORT || '3000', 10)
app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`)
})
