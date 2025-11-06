import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTestInstance } from '../../../test-utils'
import { oidcProvider } from '../index'
import { jwt } from '../../jwt'
import * as client from 'openid-client'
import https from 'node:https'
import { toNodeHandler } from '../../../integrations/node'
import fs from 'node:fs/promises'

describe('OIDC Provider - getOpenIdConfig', async () => {
  const {
    auth
  } = await getTestInstance({
    plugins: [
      oidcProvider({
        loginPage: '/login',
        consentPage: '/oauth2/authorize'
      }),
      jwt()
    ]
  })

  let server: https.Server
  let url: string

  beforeAll(async () => {
    const options = {
      key: await fs.readFile('test/fixtures/keys/agent2-key.pem'),
      cert: await fs.readFile('test/fixtures/keys/agent2-cert.cert')
    }

    server = https.createServer(options, toNodeHandler(auth)).listen()
  })

  afterAll(async () => {
    server.close()
  })

  it('should get default config', async () => {
    // client.discovery()
    const config = await auth.api.getOpenIdConfig()
    expect(config).toMatchSnapshot()
  })
})
