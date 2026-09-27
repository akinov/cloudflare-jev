import { bearerAuth } from 'hono/bearer-auth'
import { createMiddleware } from 'hono/factory'

const unauthorized = { error: 'unauthorized' }

export const bearer = createMiddleware<{ Bindings: CloudflareBindings }>(async (c, next) => {
  if (!c.env.TRIAGE_TOKEN) {
    return c.json(unauthorized, 401)
  }

  const auth = bearerAuth<{ Bindings: CloudflareBindings }>({
    token: c.env.TRIAGE_TOKEN,
    noAuthenticationHeader: { message: unauthorized },
    invalidToken: { message: unauthorized },
    invalidAuthenticationHeader: { message: unauthorized },
  })
  return auth(c, next)
})
