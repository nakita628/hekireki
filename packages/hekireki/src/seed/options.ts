import type { CommonOptions, SeedConfig } from './config.js'

/** A date window as written, as dates; a missing edge is a year before the run, or the run itself. */
function window(dates: CommonOptions['dates']) {
  if (dates === undefined || (dates.from === undefined && dates.to === undefined)) return null
  const to = dates.to === undefined ? new Date() : new Date(dates.to)
  const from =
    dates.from === undefined
      ? new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000)
      : new Date(dates.from)
  return { from, to }
}

/**
 * The config as the seeder reads it: what the user wrote, and null for what they did not. No
 * option has a value of its own; each one takes effect the first time it is set.
 */
export function resolveSeedConfig(config: SeedConfig) {
  return {
    schema: config.schema ?? null,
    seed: config.seed ?? null,
    locale:
      config.locale === undefined
        ? null
        : typeof config.locale === 'string'
          ? [config.locale]
          : config.locale,
    count: config.count ?? null,
    nullRate: config.nullRate ?? null,
    dates: window(config.dates),
    output: config.output ?? null,
    url: config.url ?? null,
    reset: config.reset ?? false,
    client: config.client ?? null,
    models: config.models ?? {},
  }
}

export type ResolvedSeedConfig = ReturnType<typeof resolveSeedConfig>
