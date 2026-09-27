import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { bearer } from '../middleware/bearer'
import { presets } from '../presets/registry'
import { runTriage } from '../triage'

const triageRequestSchema = z.strictObject({
  body: z
    .string({ error: 'body must be a string' })
    .trim()
    .min(1, { error: 'body must contain at least 1 character' })
    .max(8000, { error: 'body must be at most 8000 characters' }),
  subject: z
    .string({ error: 'subject must be a string' })
    .trim()
    .max(200, { error: 'subject must be at most 200 characters' })
    .optional()
    .default(''),
  preset: z.string({ error: 'preset must be a string' }).trim().optional().default('inquiry-triage'),
})

function formatZodError(error: z.core.$ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.') || '(root)'
      const keys = 'keys' in issue && Array.isArray(issue.keys) ? ` (${issue.keys.join(', ')})` : ''
      return `${path}: ${issue.message}${keys}`
    })
    .join('; ')
}

export const api = new Hono<{ Bindings: CloudflareBindings }>()
  .use('*', bearer)
  .get('/presets', (c) => {
    return c.json({
      presets: Object.values(presets).map((preset) => ({
        id: preset.id,
        description: preset.description,
        questions: preset.questions,
        policy: preset.policy,
      })),
    })
  })
  .post(
    '/triage',
    zValidator('json', triageRequestSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: 'invalid_request', details: formatZodError(result.error) }, 400)
      }
    }),
    async (c) => {
      const input = c.req.valid('json')
      const result = await runTriage(
        { subject: input.subject, body: input.body, presetId: input.preset },
        (model, payload) => c.env.AI.run(model, payload),
      )
      return c.json(result)
    },
  )

export type ApiType = typeof api
