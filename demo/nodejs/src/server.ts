import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { betterAuth } from 'better-auth'
import Database from 'better-sqlite3'
import { Hono } from 'hono'

export const auth = betterAuth({
  database: new Database(':memory:'),
  emailAndPassword: {
    enabled: true
  },
  trustedOrigins: [
    'http://localhost:5173'
  ]
})

const app = new Hono()

app.use(
  '/api/auth/*',
  cors({
    origin: x => x,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true
  })
)

app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

serve(app)
