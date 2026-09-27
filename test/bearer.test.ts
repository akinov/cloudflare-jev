import { describe, expect, it } from 'vitest'
import { factory } from '../src/factory'
import { bearer } from '../src/middleware/bearer'

function app() {
  return factory.createApp().use('*', bearer).get('/secret', (c) => c.json({ ok: true }))
}

function bindings(token: string): CloudflareBindings {
  return {
    TRIAGE_TOKEN: token,
    AI: {} as CloudflareBindings['AI'],
  }
}

describe('bearer', () => {
  it('rejects an empty token setting even when a header is present', async () => {
    const response = await app().request(
      '/secret',
      { headers: { Authorization: 'Bearer test-token' } },
      bindings(''),
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects a missing Authorization header', async () => {
    const response = await app().request('/secret', {}, bindings('test-token'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects a token that does not match', async () => {
    const response = await app().request(
      '/secret',
      { headers: { Authorization: 'Bearer other-token' } },
      bindings('test-token'),
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects a token outside the allowed characters', async () => {
    const response = await app().request(
      '/secret',
      { headers: { Authorization: 'Bearer bad token' } },
      bindings('test-token'),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
  })

  it('accepts a matching token', async () => {
    const response = await app().request(
      '/secret',
      { headers: { Authorization: 'Bearer test-token' } },
      bindings('test-token'),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})
