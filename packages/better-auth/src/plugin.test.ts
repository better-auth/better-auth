import { it } from 'vitest'
import { declarePlugin } from './plugin'

it('should declare plugin', () => {
  declarePlugin(
    'my-plugin',
    'myNamespace',
    {
      '/example/:id': { path: '/example/:id', options: { method: 'GET' } },
      '/test/*': { path: '/test/*', options: { method: 'POST' } }
    }
  )
})