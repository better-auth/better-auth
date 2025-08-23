import { createAuthClient } from 'better-auth/client'

export const client = createAuthClient({
  baseURL: 'http://localhost:3000'
})
