import type { Preset } from './types'

export const inquiryTriage = {
  id: 'inquiry-triage',
  description: '日本語の問い合わせを部署へ振り分ける',
  questions: {
    department: {
      type: 'choice',
      instructions: 'Which team should handle the inquiry in body? Use subject as context.',
      criteria: {
        sales: 'The writer wants to buy, ask about pricing, or start using a product.',
        support: 'The writer has a problem with an existing order, delivery, or how to use a product.',
        billing: 'The writer is asking about an invoice, a charge, a payment, or a refund.',
        recruit: 'The writer is asking about a job or submitting an application.',
        other: 'None of the other teams should handle this inquiry.',
      },
    },
    is_urgent: {
      type: 'noul',
      instructions: 'Does this request need an immediate reply?',
      criteria: {
        true: 'There is time pressure, such as a deadline or an explicit request to hurry.',
        false: 'There is no expression of urgency.',
      },
    },
    is_sales_pitch: {
      type: 'noul',
      instructions: 'Is this a sales pitch to us, rather than an inquiry from a customer?',
      criteria: {
        true: 'The writer is trying to sell a product or service to us.',
        false: 'The writer is a customer or applicant asking us for help.',
      },
    },
    frustration: {
      type: 'score',
      instructions: 'How frustrated is the person who wrote the inquiry?',
      criteria: ['Calm', 'Frustrated', 'Very angry'],
    },
  },
  policy: {
    routeOn: {
      question: 'department',
      minConfidence: 0.6,
      ambiguityMargin: 0.15,
    },
    flags: [
      { question: 'is_urgent', noulAtLeast: 0.8, signal: 'urgent' },
      { question: 'is_sales_pitch', noulAtLeast: 0.9, signal: 'salesPitch' },
    ],
  },
  buildState: (input) => ({
    subject: input.subject,
    body: input.body,
  }),
} satisfies Preset
