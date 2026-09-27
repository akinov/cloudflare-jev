import { bearerAuth } from 'hono/bearer-auth'
import { factory, type AppEnv } from '../factory'

const unauthorized = { error: 'unauthorized' }

export const bearer = factory.createMiddleware(async (c, next) => {
  if (!c.env.TRIAGE_TOKEN) {
    return c.json(unauthorized, 401)
  }

  const auth = bearerAuth<AppEnv>({
    token: c.env.TRIAGE_TOKEN,
    noAuthenticationHeader: { message: unauthorized },
    invalidToken: { message: unauthorized },
    invalidAuthenticationHeader: { message: unauthorized },
  })
  return auth(c, next)
})
