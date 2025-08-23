const nodeVersion = +process.versions.node.split('.')[0]
if (nodeVersion < 22) {
  console.log('Skipping on node < 22')
  process.exit(0)
}

const assert = require('node:assert')
const express = require('express-4')
const { betterAuth } = require('better-auth')
const { toNodeHandler } = require('better-auth/node')
const { DatabaseSync } = require('node:sqlite')

const db = new DatabaseSync(':memory:')
const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true
  }
})
const app = express()

app.all('/api/auth/*', toNodeHandler(auth))

const server = app.listen(0, () => {
  console.log(`Listening on port ${server.address().port}`)
})
