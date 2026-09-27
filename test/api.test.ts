import { describe, expect, it, vi } from 'vitest'
import { inquiryTriage } from '../src/presets/inquiry-triage'
import { presets } from '../src/presets/registry'
import app from '../src/index'

const token = 'test-token'

type ApiErrorBody = { error: string; details?: string }
type TriageOkBody = {
  decision: {
    action: string
    signals: { route: { choice: string } }
  }
}
type PresetsBody = {
  presets: Array<{
    id: string
    description?: string
    questions: Record<string, { type: string }>
    policy: { routeOn: { question: string } }
  }>
}

function modelAnswers(choice = 'support') {
  return {
    department: {
      type: 'choice',
      choice,
      confidence: 0.91,
      probabilities: { sales: 0.01, support: 0.91, billing: 0.04, recruit: 0.02, other: 0.02 },
    },
    is_urgent: { type: 'noul', noul: 0.85 },
    is_sales_pitch: { type: 'noul', noul: 0.1 },
    frustration: {
      type: 'score',
      score: 1.04,
      legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
    },
  }
}

function bindings(run: (...args: unknown[]) => Promise<unknown>, triageToken = token): CloudflareBindings {
  return {
    TRIAGE_TOKEN: triageToken,
    AI: { run },
  } as CloudflareBindings
}

function post(
  body: unknown,
  options: { token?: string; contentType?: string | null; raw?: string; run?: (...args: unknown[]) => Promise<unknown> } = {},
) {
  const headers = new Headers()
  if (options.token !== '') headers.set('Authorization', `Bearer ${options.token ?? token}`)
  if (options.contentType !== null) headers.set('Content-Type', options.contentType ?? 'application/json')
  return app.request(
    '/api/triage',
    {
      method: 'POST',
      headers,
      body: options.raw ?? JSON.stringify(body),
    },
    bindings(options.run ?? (async () => ({ model: 'jev-1.13.0', answers: modelAnswers(), usage: { input_tokens: 1, output_tokens: 1 } }))),
  )
}

describe('POST /api/triage', () => {
  it('returns the model output and decision', async () => {
    const run = vi.fn(async (_model: unknown, _payload: unknown) => ({
      model: 'jev-1.13.0',
      answers: modelAnswers(),
      usage: { input_tokens: 12, output_tokens: 3 },
    }))
    const response = await post(
      { body: '  本文です  ', subject: '  件名  ' },
      { run },
    )
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toMatchObject({
      preset: 'inquiry-triage',
      model: 'jev-1.13.0',
      usage: { input_tokens: 12, output_tokens: 3 },
      decision: { action: 'auto_route', reasons: ['choice_confident'] },
    })
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]?.[0]).toBe('typesafe/jev')
    expect(run.mock.calls[0]?.[1]).toMatchObject({ state: { subject: '件名', body: '本文です' } })
  })

  it('rejects a mismatched token and an empty token setting', async () => {
    const mismatch = await post({ body: '本文' }, { token: 'other-token' })
    expect(mismatch.status).toBe(401)
    expect(await mismatch.json()).toEqual({ error: 'unauthorized' })

    const missing = await app.request(
      '/api/triage',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '本文' }),
      },
      bindings(async () => ({}), ''),
    )
    expect(missing.status).toBe(401)
    expect(await missing.json()).toEqual({ error: 'unauthorized' })
  })

  it('rejects invalid JSON bodies', async () => {
    const extra = await post({ body: '本文', extra: true })
    expect(extra.status).toBe(400)
    const extraJson = (await extra.json()) as ApiErrorBody
    expect(extraJson).toMatchObject({ error: 'invalid_request' })
    expect(extraJson.details).toContain('extra')

    const blank = await post({ body: '   ' })
    expect(blank.status).toBe(400)
    expect(await blank.json()).toMatchObject({ error: 'invalid_request' })

    const wrongType = await post({ body: '本文', subject: 1 })
    expect(wrongType.status).toBe(400)
    expect(((await wrongType.json()) as ApiErrorBody).details).toContain('subject')

    const malformed = await post(undefined, { raw: '{' })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({
      error: 'invalid_request',
      details: 'Malformed JSON in request body',
    })

    const untyped = await post({ body: '本文' }, { contentType: null })
    expect(untyped.status).toBe(400)
    expect(((await untyped.json()) as ApiErrorBody).error).toBe('invalid_request')
  })

  it('returns 404 for an unknown preset', async () => {
    const run = vi.fn()
    const response = await post({ body: '本文', preset: 'missing' }, { run })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'unknown_preset' })
    expect(run).not.toHaveBeenCalled()
  })

  it('returns 502 when inference throws and does not retry', async () => {
    const run = vi.fn(async () => {
      throw new Error('upstream')
    })
    const response = await post({ body: '本文' }, { run })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'model_unavailable' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('returns 500 when the preset definition is invalid and does not call the model', async () => {
    presets.broken = {
      ...inquiryTriage,
      id: 'broken',
      policy: {
        ...inquiryTriage.policy,
        routeOn: { ...inquiryTriage.policy.routeOn, question: 'is_urgent' },
      },
    }
    const run = vi.fn()
    try {
      const response = await post({ body: '本文', preset: 'broken' }, { run })
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'internal_error' })
      expect(run).not.toHaveBeenCalled()
    } finally {
      delete presets.broken
    }
  })

  it('keeps an out-of-criteria choice on the route signal', async () => {
    const response = await post(
      { body: '本文' },
      { run: async () => ({ model: 'jev-1.13.0', answers: modelAnswers('warehouse'), usage: {} }) },
    )
    expect(response.status).toBe(200)
    const json = (await response.json()) as TriageOkBody
    expect(json.decision.action).toBe('needs_review')
    expect(json.decision.signals.route.choice).toBe('warehouse')
  })
})

describe('GET /api/presets', () => {
  it('lists a preset added to the registry without a new handler', async () => {
    presets.extra = {
      ...inquiryTriage,
      id: 'extra',
      description: 'extra preset',
    }
    try {
      const response = await app.request('/api/presets', { headers: { Authorization: `Bearer ${token}` } }, bindings(async () => ({})))
      expect(response.status).toBe(200)
      const json = (await response.json()) as PresetsBody
      const extra = json.presets.find((preset) => preset.id === 'extra')
      const initial = json.presets.find((preset) => preset.id === 'inquiry-triage')
      expect(extra).toMatchObject({ id: 'extra', description: 'extra preset' })
      expect(initial).toBeDefined()
      expect(initial!.questions.department.type).toBe('choice')
      expect(initial!.policy.routeOn.question).toBe('department')
    } finally {
      delete presets.extra
    }
  })
})

describe('unknown routes', () => {
  it('returns not_found for an unknown path and method', async () => {
    const path = await app.request('/api/missing', { headers: { Authorization: `Bearer ${token}` } }, bindings(async () => ({})))
    expect(path.status).toBe(404)
    expect(await path.json()).toEqual({ error: 'not_found' })

    const method = await app.request(
      '/api/presets',
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      bindings(async () => ({})),
    )
    expect(method.status).toBe(404)
    expect(await method.json()).toEqual({ error: 'not_found' })
  })
})
