import type { Preset } from './types'

function inUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

export function presetViolations(preset: Preset, registryKey: string): string[] {
  const violations: string[] = []
  const add = (code: string) => {
    if (!violations.includes(code)) violations.push(code)
  }

  if (preset.id !== registryKey) add('id_mismatch')

  const routeQuestion = preset.questions[preset.policy.routeOn.question]
  if (routeQuestion?.type !== 'choice') add('route_not_choice')
  if (
    !inUnitInterval(preset.policy.routeOn.minConfidence) ||
    !inUnitInterval(preset.policy.routeOn.ambiguityMargin)
  ) {
    add('threshold_out_of_range')
  }

  const signals = new Set<string>()
  for (const flag of preset.policy.flags) {
    if (preset.questions[flag.question]?.type !== 'noul') add('flag_not_noul')
    if (signals.has(flag.signal)) add('duplicate_signal')
    signals.add(flag.signal)
    if (!inUnitInterval(flag.noulAtLeast)) add('threshold_out_of_range')
  }

  return violations
}
