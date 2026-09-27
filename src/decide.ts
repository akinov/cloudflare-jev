import type { Preset } from './presets/types'

export type Decision = {
  action: 'auto_route' | 'needs_review'
  reasons: string[]
  signals: {
    route: { choice: string; confidence: number } | null
    flags: Record<string, boolean | null>
    scores: Record<string, { score: number; label: string } | null>
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function answerFor(answers: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(answers)) return undefined
  const answer = answers[key]
  return isRecord(answer) ? answer : undefined
}

function legendLabel(score: number, legend: unknown): { label: string; missing: boolean } {
  if (!isRecord(legend)) return { label: '', missing: true }
  const indices = Object.keys(legend)
    .filter((key) => /^(0|[1-9]\d*)$/.test(key))
    .map((key) => Number(key))
  if (indices.length === 0) return { label: '', missing: true }

  let best = indices[0]!
  for (const index of indices) {
    const distance = Math.abs(score - index)
    const bestDistance = Math.abs(score - best)
    if (distance < bestDistance || (distance === bestDistance && index < best)) best = index
  }

  const text = legend[String(best)]
  return { label: typeof text === 'string' ? text : '', missing: false }
}

function numericProbabilities(probabilities: unknown): number[] | undefined {
  if (!isRecord(probabilities)) return undefined
  const values: number[] = []
  for (const value of Object.values(probabilities)) {
    if (isNumber(value)) values.push(value)
  }
  return values
}

export function decide(answers: unknown, preset: Preset): Decision {
  const reasons: string[] = []
  const add = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason)
  }

  for (const [key, question] of Object.entries(preset.questions)) {
    const answer = answerFor(answers, key)
    if (!answer || answer.type !== question.type) add('incomplete_answers')
  }

  const routeQuestion = preset.questions[preset.policy.routeOn.question]
  const routeAnswer = answerFor(answers, preset.policy.routeOn.question)
  const choice = routeAnswer?.choice
  const confidence = routeAnswer?.confidence
  let route: Decision['signals']['route'] = null

  if (typeof choice === 'string' && isNumber(confidence)) {
    route = { choice, confidence }
  } else {
    add('incomplete_answers')
  }

  if (isNumber(confidence) && confidence < preset.policy.routeOn.minConfidence) {
    add('low_confidence')
  }

  if (typeof choice === 'string') {
    const criteria = routeQuestion?.type === 'choice' ? routeQuestion.criteria : {}
    if (!Object.hasOwn(criteria, choice)) add('incomplete_answers')
  }

  const probabilities = numericProbabilities(routeAnswer?.probabilities)
  if (!probabilities) {
    add('incomplete_answers')
  } else if (probabilities.length >= 2) {
    const sorted = [...probabilities].sort((left, right) => right - left)
    const gap = sorted[0]! - sorted[1]!
    if (gap < preset.policy.routeOn.ambiguityMargin) add('ambiguous_choice')
  }

  const flags: Decision['signals']['flags'] = {}
  for (const flag of preset.policy.flags) {
    const noul = answerFor(answers, flag.question)?.noul
    flags[flag.signal] = isNumber(noul) ? noul >= flag.noulAtLeast : null
  }

  const scores: Decision['signals']['scores'] = {}
  for (const [key, question] of Object.entries(preset.questions)) {
    if (question.type !== 'score') continue
    const score = answerFor(answers, key)?.score
    if (!isNumber(score)) {
      scores[key] = null
      continue
    }
    const label = legendLabel(score, answerFor(answers, key)?.legend)
    if (label.missing) add('incomplete_answers')
    scores[key] = { score, label: label.label }
  }

  if (reasons.length === 0) reasons.push('choice_confident')

  return {
    action: reasons.includes('choice_confident') ? 'auto_route' : 'needs_review',
    reasons,
    signals: { route, flags, scores },
  }
}
