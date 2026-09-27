import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { api } from './routes/api'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.route('/api', api)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    if (error.message === 'Malformed JSON in request body') {
      return c.json(
        { error: 'invalid_request', details: 'Malformed JSON in request body' },
        400,
      )
    }
    return error.getResponse()
  }

  const message = error instanceof Error ? error.message.slice(0, 200) : 'internal_error'
  console.error(JSON.stringify({ status: 500, message }))
  return c.json({ error: 'internal_error' }, 500)
})

export default app
