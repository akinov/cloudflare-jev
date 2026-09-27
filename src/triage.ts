import { HTTPException } from 'hono/http-exception'
import { decide } from './decide'
import { presets } from './presets/registry'
import type { Preset } from './presets/types'
import { presetViolations } from './presets/validate'

export type TriageResult = {
  preset: string
  model: unknown
  decision: ReturnType<typeof decide>
  answers: unknown
  usage: unknown
}

type ModelInput = {
  state: { subject: string; body: string }
  questions: Preset['questions']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function httpError(status: 404 | 500 | 502, error: string): HTTPException {
  return new HTTPException(status, {
    res: Response.json({ error }),
  })
}

function modelFailureLog(error: unknown): { status: number | null; message: string } {
  const status = isRecord(error) && isNumber(error.status) ? error.status : null
  return { status, message: 'model request failed' }
}

export async function runTriage(
  input: { subject: string; body: string; presetId: string },
  runModel: (model: 'typesafe/jev', payload: ModelInput) => Promise<unknown>,
): Promise<TriageResult> {
  const preset = presets[input.presetId]
  if (!preset) {
    throw httpError(404, 'unknown_preset')
  }

  const violations = presetViolations(preset, input.presetId)
  if (violations.length > 0) {
    console.error(JSON.stringify({ status: 500, message: violations.join(',') }))
    throw httpError(500, 'internal_error')
  }

  const state = preset.buildState({ subject: input.subject, body: input.body })
  let response: unknown
  try {
    response = await runModel('typesafe/jev', { state, questions: preset.questions })
  } catch (error) {
    console.error(JSON.stringify(modelFailureLog(error)))
    throw httpError(502, 'model_unavailable')
  }

  if (!isRecord(response)) {
    console.error(JSON.stringify({ status: null, message: 'model response was not an object' }))
    throw httpError(502, 'model_unavailable')
  }

  const decision = decide(response.answers, preset)
  const usage = isRecord(response.usage) ? response.usage : undefined
  console.log(
    JSON.stringify({
      preset: preset.id,
      model: response.model,
      action: decision.action,
      reasons: decision.reasons,
      input_tokens: isNumber(usage?.input_tokens) ? usage.input_tokens : null,
      output_tokens: isNumber(usage?.output_tokens) ? usage.output_tokens : null,
      body_chars: input.body.length,
    }),
  )

  return {
    preset: preset.id,
    model: response.model,
    decision,
    answers: response.answers,
    usage: response.usage,
  }
}
