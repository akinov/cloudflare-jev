import { inquiryTriage } from './inquiry-triage'
import type { Preset } from './types'

export const presets: Record<string, Preset> = {
  'inquiry-triage': inquiryTriage,
}
