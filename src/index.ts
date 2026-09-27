import { HTTPException } from 'hono/http-exception'
import { factory } from './factory'
import { api } from './routes/api'

const app = factory.createApp()

app.route('/api', api)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    if (error.status === 400 && !error.res) {
      return c.json({ error: 'invalid_request', details: error.message }, 400)
    }
    return error.getResponse()
  }

  console.error(error)
  return c.json({ error: 'internal_error' }, 500)
})

export default app
