import { HTTPException } from 'hono/http-exception'
import { describe, expect, it, vi } from 'vitest'
import { presets } from '../src/presets/registry'
import type { Preset } from '../src/presets/types'
import { runTriage } from '../src/triage'

const subject = 'SUBJECT_SENTINEL'
const body = 'BODY_SENTINEL'

function modelAnswers() {
  return {
    department: {
      type: 'choice',
      choice: 'support',
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

async function expectHttpError(promise: Promise<unknown>, status: number, error: string) {
  try {
    await promise
    expect.unreachable()
  } catch (caught) {
    expect(caught).toBeInstanceOf(HTTPException)
    const response = (caught as HTTPException).getResponse()
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
  }
}

describe('runTriage', () => {
  it('returns the model payload and decision from one call', async () => {
    const runModel = vi.fn(async () => ({
      model: 'jev-1.13.0',
      answers: modelAnswers(),
      usage: { input_tokens: 12, output_tokens: 3 },
    }))
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line))
    })

    try {
      const result = await runTriage({ subject, body, presetId: 'inquiry-triage' }, runModel)

      expect(runModel).toHaveBeenCalledTimes(1)
      expect(runModel).toHaveBeenCalledWith('typesafe/jev', {
        state: { subject, body },
        questions: presets['inquiry-triage']?.questions,
      })
      expect(result.model).toBe('jev-1.13.0')
      expect(result.answers).toEqual(modelAnswers())
      expect(result.usage).toEqual({ input_tokens: 12, output_tokens: 3 })
      expect(result.decision.action).toBe('auto_route')
      expect(result.decision.signals.flags.urgent).toBe(true)
      expect(result.decision.signals.scores.frustration).toEqual({ score: 1.04, label: 'Frustrated' })
      expect(logs).toEqual([
        JSON.stringify({
          preset: 'inquiry-triage',
          model: 'jev-1.13.0',
          action: 'auto_route',
          reasons: ['choice_confident'],
          input_tokens: 12,
          output_tokens: 3,
          body_chars: body.length,
        }),
      ])
      expect(logs.join('\n')).not.toContain(subject)
      expect(logs.join('\n')).not.toContain(body)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('does not retry when the model throws', async () => {
    const error = new Error('rate limited') as Error & { status: number }
    error.status = 429
    const runModel = vi.fn(async () => {
      throw error
    })
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errors.push(String(line))
    })

    try {
      await expectHttpError(runTriage({ subject, body, presetId: 'inquiry-triage' }, runModel), 502, 'model_unavailable')
      expect(runModel).toHaveBeenCalledTimes(1)
      expect(errors).toEqual([JSON.stringify({ status: 429, message: 'model request failed' })])
      expect(errors.join('\n')).not.toContain(subject)
      expect(errors.join('\n')).not.toContain(body)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('does not log subject or body when the model error message echoes them', async () => {
    const error = new Error(`upstream failed for ${subject}: ${body}`) as Error & { status: number }
    error.status = 503
    const runModel = vi.fn(async () => {
      throw error
    })
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errors.push(String(line))
    })

    try {
      await expectHttpError(runTriage({ subject, body, presetId: 'inquiry-triage' }, runModel), 502, 'model_unavailable')
      expect(runModel).toHaveBeenCalledTimes(1)
      expect(errors).toEqual([JSON.stringify({ status: 503, message: 'model request failed' })])
      expect(errors.join('\n')).not.toContain(subject)
      expect(errors.join('\n')).not.toContain(body)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('treats a non-object model response as unavailable and does not retry', async () => {
    const runModel = vi.fn(async () => null)
    await expectHttpError(runTriage({ subject, body, presetId: 'inquiry-triage' }, runModel), 502, 'model_unavailable')
    expect(runModel).toHaveBeenCalledTimes(1)
  })

  it('does not call the model for an unknown preset', async () => {
    const runModel = vi.fn()
    await expectHttpError(runTriage({ subject, body, presetId: 'missing' }, runModel), 404, 'unknown_preset')
    expect(runModel).not.toHaveBeenCalled()
  })

  it('does not call the model when the preset definition is invalid', async () => {
    const broken: Preset = {
      ...presets['inquiry-triage']!,
      id: 'broken',
      policy: {
        ...presets['inquiry-triage']!.policy,
        routeOn: { ...presets['inquiry-triage']!.policy.routeOn, question: 'is_urgent' },
      },
    }
    presets.broken = broken
    const runModel = vi.fn()
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errors.push(String(line))
    })
    try {
      await expectHttpError(runTriage({ subject, body, presetId: 'broken' }, runModel), 500, 'internal_error')
      expect(runModel).not.toHaveBeenCalled()
      expect(errors.join('\n')).not.toContain(subject)
      expect(errors.join('\n')).not.toContain(body)
    } finally {
      delete presets.broken
      vi.restoreAllMocks()
    }
  })

  it('returns 500 when registry key and preset.id mismatch', async () => {
    const mismatched: Preset = {
      ...presets['inquiry-triage']!,
      id: 'other-id',
    }
    presets['key-mismatch'] = mismatched
    const runModel = vi.fn()
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      errors.push(String(line))
    })
    try {
      await expectHttpError(runTriage({ subject, body, presetId: 'key-mismatch' }, runModel), 500, 'internal_error')
      expect(runModel).not.toHaveBeenCalled()
      expect(errors.join('\n')).not.toContain(subject)
      expect(errors.join('\n')).not.toContain(body)
    } finally {
      delete presets['key-mismatch']
      vi.restoreAllMocks()
    }
  })
})
