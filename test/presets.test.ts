import { describe, expect, it } from 'vitest'
import { inquiryTriage } from '../src/presets/inquiry-triage'
import { presets } from '../src/presets/registry'
import type { Preset } from '../src/presets/types'
import { presetViolations } from '../src/presets/validate'

const initialPolicy = {
  routeOn: {
    question: 'department',
    minConfidence: 0.6,
    ambiguityMargin: 0.15,
  },
  flags: [
    { question: 'is_urgent', noulAtLeast: 0.8, signal: 'urgent' },
    { question: 'is_sales_pitch', noulAtLeast: 0.9, signal: 'salesPitch' },
  ],
}

function broken(change: (preset: Preset) => void): Preset {
  const preset: Preset = {
    ...inquiryTriage,
    questions: structuredClone(inquiryTriage.questions),
    policy: structuredClone(inquiryTriage.policy),
    buildState: inquiryTriage.buildState,
  }
  change(preset)
  return preset
}

describe('inquiry-triage', () => {
  it('is registered under its own id', () => {
    expect(presets['inquiry-triage']).toBe(inquiryTriage)
    expect(inquiryTriage.id).toBe('inquiry-triage')
    expect(inquiryTriage.description).toBe('日本語の問い合わせを部署へ振り分ける')
  })

  it('uses the initial policy', () => {
    expect(inquiryTriage.policy).toEqual(initialPolicy)
  })

  it('asks for department, urgency, a sales pitch, and frustration in English', () => {
    expect(inquiryTriage.questions.department).toEqual({
      type: 'choice',
      instructions: 'Which team should handle the inquiry in body? Use subject as context.',
      criteria: {
        sales: 'The writer wants to buy, ask about pricing, or start using a product.',
        support: 'The writer has a problem with an existing order, delivery, or how to use a product.',
        billing: 'The writer is asking about an invoice, a charge, a payment, or a refund.',
        recruit: 'The writer is asking about a job or submitting an application.',
        other: 'None of the other teams should handle this inquiry.',
      },
    })
    expect(inquiryTriage.questions.is_urgent).toEqual({
      type: 'noul',
      instructions: 'Does this request need an immediate reply?',
      criteria: {
        true: 'There is time pressure, such as a deadline or an explicit request to hurry.',
        false: 'There is no expression of urgency.',
      },
    })
    expect(inquiryTriage.questions.is_sales_pitch).toEqual({
      type: 'noul',
      instructions: 'Is this a sales pitch to us, rather than an inquiry from a customer?',
      criteria: {
        true: 'The writer is trying to sell a product or service to us.',
        false: 'The writer is a customer or applicant asking us for help.',
      },
    })
    expect(inquiryTriage.questions.frustration).toEqual({
      type: 'score',
      instructions: 'How frustrated is the person who wrote the inquiry?',
      criteria: ['Calm', 'Frustrated', 'Very angry'],
    })
  })

  it('returns an empty subject as an empty string', () => {
    expect(inquiryTriage.buildState({ subject: '', body: '本文' })).toEqual({
      subject: '',
      body: '本文',
    })
  })
})

describe('presetViolations', () => {
  it('accepts every registered preset', () => {
    for (const [id, preset] of Object.entries(presets)) {
      expect(presetViolations(preset, id)).toEqual([])
    }
  })

  it('rejects a route question that is not a choice', () => {
    const preset = broken((item) => {
      item.policy.routeOn.question = 'is_urgent'
    })
    expect(presetViolations(preset, preset.id)).toContain('route_not_choice')
  })

  it('rejects a flag question that is not a noul', () => {
    const preset = broken((item) => {
      item.policy.flags[0]!.question = 'department'
    })
    expect(presetViolations(preset, preset.id)).toContain('flag_not_noul')
  })

  it('rejects a duplicated signal', () => {
    const preset = broken((item) => {
      item.policy.flags[1]!.signal = item.policy.flags[0]!.signal
    })
    expect(presetViolations(preset, preset.id)).toContain('duplicate_signal')
  })

  it('rejects thresholds outside 0 to 1', () => {
    const highConfidence = broken((item) => {
      item.policy.routeOn.minConfidence = 1.1
    })
    const negativeMargin = broken((item) => {
      item.policy.routeOn.ambiguityMargin = -0.01
    })
    const highNoul = broken((item) => {
      item.policy.flags[0]!.noulAtLeast = 1.01
    })
    expect(presetViolations(highConfidence, highConfidence.id)).toContain('threshold_out_of_range')
    expect(presetViolations(negativeMargin, negativeMargin.id)).toContain('threshold_out_of_range')
    expect(presetViolations(highNoul, highNoul.id)).toContain('threshold_out_of_range')
  })

  it('accepts thresholds at 0 and 1', () => {
    const preset = broken((item) => {
      item.policy.routeOn.minConfidence = 0
      item.policy.routeOn.ambiguityMargin = 1
      item.policy.flags[0]!.noulAtLeast = 0
      item.policy.flags[1]!.noulAtLeast = 1
    })
    expect(presetViolations(preset, preset.id)).toEqual([])
  })

  it('rejects a route question that is missing', () => {
    const preset = broken((item) => {
      item.policy.routeOn.question = 'missing'
    })
    expect(presetViolations(preset, preset.id)).toContain('route_not_choice')
  })

  it('rejects a registry key that does not match the preset id', () => {
    expect(presetViolations(inquiryTriage, 'other-id')).toContain('id_mismatch')
  })
})
