import { DatabaseSync } from 'node:sqlite'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { redisStorage } from '@better-auth/redis-storage'
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { Redis } from 'ioredis'

test('better auth with redis', async (t) => {
  const id = crypto.randomUUID()
  const redisClient = new Redis(
    'redis://localhost:6379'
  )
  t.beforeEach(() => {
    redisClient.flushall()
  })
  t.after(() => {
    redisClient.disconnect()
  })

  await t.test('check session data', async (t: TestContext) => {
    const auth = betterAuth({
      database: new DatabaseSync(':memory:'),
      emailAndPassword: {
        enabled: true
      },
      secondaryStorage: redisStorage({
        client: redisClient,
        keyPrefix: `${id}|`
      })
    })

    const { runMigrations } = await getMigrations(auth.options)
    await runMigrations()

    const { token } = await auth.api.signUpEmail({
      body: {
        email: 'himself65@outlook.com',
        password: '123456789',
        name: 'Alex Yang'
      }
    })

    t.assert.ok(token)

    const storage = auth.options.secondaryStorage
    const keys = await storage.listKeys()
    // console.log(keys)
    t.assert.equal(keys.length, 2)
    const key = keys.find(key => !key.startsWith('active-sessions'))!
    const sessionDataString = await storage.get(key)
    t.assert.ok(sessionDataString)
    const sessionData = JSON.parse(sessionDataString)
    t.assert.ok(sessionData.user.id)
    t.assert.ok(sessionData.session.id)
  })

  await t.test('check session data with stateless', async (t: TestContext) => {
    const auth = betterAuth({
      session: {
        cookieCache: {
          enabled: true,
          maxAge: 7 * 24 * 60 * 60, // 7 days
          strategy: 'jwe',
          refreshCache: true
        }
      },
      account: {
        storeStateStrategy: 'cookie',
        storeAccountCookie: true
      },
      socialProviders: {
        google: {
          clientId: 'demo',
          clientSecret: 'demo-secret'
        }
      },
      secondaryStorage: redisStorage({
        client: redisClient,
        keyPrefix: `${id}|`
      })
    })

    // replace undici to proxy network



    const storage = auth.options.secondaryStorage
    const keys = await storage.listKeys()
    // console.log(keys)
    t.assert.equal(keys.length, 2)
    const key = keys.find(key => !key.startsWith('active-sessions'))!
    const sessionDataString = await storage.get(key)
    t.assert.ok(sessionDataString)
    const sessionData = JSON.parse(sessionDataString)
    t.assert.ok(sessionData.user.id)
    t.assert.ok(sessionData.session.id)
  })
})
