export type NoulQuestion = {
  type: 'noul'
  instructions: string
  criteria?: { true: string; false: string }
}

export type ChoiceQuestion = {
  type: 'choice'
  instructions: string
  criteria: Record<string, string>
}

export type ScoreQuestion = {
  type: 'score'
  instructions: string
  criteria: string[]
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion

export type Questions = Record<string, Question>

export type InquiryInput = {
  subject: string
  body: string
}

export type Policy = {
  routeOn: {
    question: string
    minConfidence: number
    ambiguityMargin: number
  }
  flags: Array<{
    question: string
    noulAtLeast: number
    signal: string
  }>
}

export type Preset = {
  id: string
  description: string
  questions: Questions
  policy: Policy
  buildState: (input: InquiryInput) => { subject: string; body: string }
}
