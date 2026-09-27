import { describe, expect, it } from 'vitest'
import { decide } from '../src/decide'
import { inquiryTriage } from '../src/presets/inquiry-triage'

const legend = {
  '0': 'Calm',
  '1': 'Frustrated',
  '2': 'Very angry',
}

function answers() {
  return {
    department: {
      type: 'choice',
      choice: 'support',
      confidence: 0.91,
      probabilities: {
        sales: 0.01,
        support: 0.91,
        billing: 0.04,
        recruit: 0.02,
        other: 0.02,
      },
    },
    is_urgent: { type: 'noul', noul: 0.1 },
    is_sales_pitch: { type: 'noul', noul: 0.1 },
    frustration: { type: 'score', score: 0.2, legend: { ...legend } },
  }
}

describe('decide', () => {
  it('auto-routes a confident choice', () => {
    const decision = decide(answers(), inquiryTriage)
    expect(decision.action).toBe('auto_route')
    expect(decision.reasons).toEqual(['choice_confident'])
    expect(decision.signals.route).toEqual({ choice: 'support', confidence: 0.91 })
    expect(decision.signals.flags).toEqual({ urgent: false, salesPitch: false })
    expect(decision.signals.scores.frustration).toEqual({ score: 0.2, label: 'Calm' })
  })

  it('does not treat confidence equal to the minimum as low', () => {
    const input = answers()
    input.department.confidence = 0.6
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('auto_route')
    expect(decision.reasons).toEqual(['choice_confident'])
  })

  it('asks for review when confidence is below the minimum', () => {
    const input = answers()
    input.department.confidence = 0.59
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('needs_review')
    expect(decision.reasons).toEqual(['low_confidence'])
    expect(decision.signals.route).toEqual({ choice: 'support', confidence: 0.59 })
  })

  it('does not treat a probability gap equal to the margin as ambiguous', () => {
    const input = answers()
    input.department.probabilities = {
      sales: 0,
      support: 0.15,
      billing: 0,
      recruit: 0,
      other: 0,
    }
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('auto_route')
    expect(decision.reasons).toEqual(['choice_confident'])
  })

  it('asks for review when the top two probabilities are closer than the margin', () => {
    const input = answers()
    input.department.probabilities = {
      sales: 0,
      support: 0.574,
      billing: 0.426,
      recruit: 0,
      other: 0,
    }
    const decision = decide(input, inquiryTriage)
    expect(decision.reasons).toEqual(['ambiguous_choice'])
    expect(decision.signals.route?.choice).toBe('support')
  })

  it('keeps the returned choice when another probability is larger', () => {
    const input = answers()
    input.department.choice = 'support'
    input.department.probabilities = {
      sales: 0.8,
      support: 0.2,
      billing: 0,
      recruit: 0,
      other: 0,
    }
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('auto_route')
    expect(decision.reasons).toEqual(['choice_confident'])
    expect(decision.signals.route).toEqual({ choice: 'support', confidence: 0.91 })
  })

  it('does not renormalize probabilities before comparing the gap', () => {
    const input = answers()
    input.department.probabilities = {
      sales: 0,
      support: 1,
      billing: 0.8,
      recruit: 0,
      other: 0,
    }
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('auto_route')
    expect(decision.reasons).toEqual(['choice_confident'])
  })

  it('skips the ambiguity check when fewer than two probabilities are numbers', () => {
    const input = answers()
    input.department.probabilities = {
      sales: Number.NaN,
      support: 0.9,
      billing: Number.NaN,
      recruit: Number.NaN,
      other: Number.NaN,
    }
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('auto_route')
    expect(decision.reasons).toEqual(['choice_confident'])
  })

  it('marks a non-object probabilities value as incomplete and skips ambiguity', () => {
    const input = answers()
    input.department.probabilities = [0.5, 0.5] as unknown as typeof input.department.probabilities
    const decision = decide(input, inquiryTriage)
    expect(decision.reasons).toEqual(['incomplete_answers'])
    expect(decision.signals.route?.choice).toBe('support')
  })

  it('marks a missing routing answer as incomplete and clears the route', () => {
    const input = answers()
    delete (input as Partial<typeof input>).department
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('needs_review')
    expect(decision.reasons).toEqual(['incomplete_answers'])
    expect(decision.signals.route).toBeNull()
  })

  it('keeps an out-of-criteria choice and asks for review', () => {
    const input = answers()
    input.department.choice = 'warehouse'
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('needs_review')
    expect(decision.reasons).toEqual(['incomplete_answers'])
    expect(decision.signals.route).toEqual({ choice: 'warehouse', confidence: 0.91 })
  })

  it('sets a noul flag when the value equals the threshold', () => {
    const input = answers()
    input.is_urgent.noul = 0.8
    input.is_sales_pitch.noul = 0.9
    const decision = decide(input, inquiryTriage)
    expect(decision.signals.flags).toEqual({ urgent: true, salesPitch: true })
    expect(decision.action).toBe('auto_route')
  })

  it('leaves a noul flag false just below the threshold and null when it is not a number', () => {
    const input = answers()
    input.is_urgent.noul = 0.79
    input.is_sales_pitch = { type: 'noul' } as typeof input.is_sales_pitch
    const decision = decide(input, inquiryTriage)
    expect(decision.signals.flags).toEqual({ urgent: false, salesPitch: null })
    expect(decision.reasons).toEqual(['choice_confident'])
  })

  it('labels a score by the nearest legend index', () => {
    const input = answers()
    input.frustration.score = 1.04
    const decision = decide(input, inquiryTriage)
    expect(decision.signals.scores.frustration).toEqual({ score: 1.04, label: 'Frustrated' })
  })

  it('breaks a legend tie toward the smaller index', () => {
    const input = answers()
    input.frustration.score = 1.5
    const decision = decide(input, inquiryTriage)
    expect(decision.signals.scores.frustration?.label).toBe('Frustrated')
  })

  it('uses an empty label and incomplete_answers when legend is missing', () => {
    const input = answers()
    input.frustration = { type: 'score', score: 1.04 } as typeof input.frustration
    const decision = decide(input, inquiryTriage)
    expect(decision.signals.scores.frustration).toEqual({ score: 1.04, label: '' })
    expect(decision.reasons).toEqual(['incomplete_answers'])
  })

  it('records a null score when score is not a number', () => {
    const input = answers()
    input.frustration = { type: 'score', legend } as typeof input.frustration
    const decision = decide(input, inquiryTriage)
    expect(decision.signals.scores.frustration).toBeNull()
    expect(decision.action).toBe('auto_route')
  })

  it('keeps readable signals when an answer type does not match', () => {
    const input = answers()
    input.is_urgent = { type: 'choice', noul: 0.95 } as unknown as typeof input.is_urgent
    const decision = decide(input, inquiryTriage)
    expect(decision.reasons).toContain('incomplete_answers')
    expect(decision.reasons).not.toContain('choice_confident')
    expect(decision.signals.flags.urgent).toBe(true)
  })

  it('lists low confidence before an ambiguous choice and omits choice_confident', () => {
    const input = answers()
    input.department.confidence = 0.2
    input.department.probabilities = {
      sales: 0,
      support: 0.5,
      billing: 0.5,
      recruit: 0,
      other: 0,
    }
    const decision = decide(input, inquiryTriage)
    expect(decision.action).toBe('needs_review')
    expect(decision.reasons).toEqual(['low_confidence', 'ambiguous_choice'])
  })
})
