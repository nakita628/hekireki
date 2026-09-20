import type { InferResponseType } from 'hono/client'

import type { client } from '../../lib/index.js'
import { useMessages } from './language.js'
import { CHANGES, CHECKS, STEPS } from './messages.js'

type Plan = InferResponseType<typeof client.migrate.plan.$post, 200>
type Check = Plan['checks'][number]
type Step = Plan['steps'][number]

/** The check said in a sentence, in the language of the page. */
export function useCheckText() {
  const checks: Readonly<
    Record<string, ((facts: Check['facts'], count: number) => string) | undefined>
  > = useMessages(CHECKS)
  return (check: Pick<Check, 'kind' | 'facts' | 'count'>) =>
    (checks[check.kind] ?? checks.other ?? (() => ''))(check.facts, check.count ?? 0)
}

/** What a step does, one line per change, in the language of the page. */
export function useStepLines() {
  const t = useMessages(STEPS)
  const changes: Readonly<
    Record<string, ((table: string, columns: string, target: string) => string) | undefined>
  > = useMessages(CHANGES)
  return (step: Step) =>
    step.kind === 'fix'
      ? [(step.fixKind === 'move' ? t.move : t.fix)(step.subject ?? step.title)]
      : step.changes.map((change) =>
          (changes[change.kind] ?? ((table: string) => table))(
            change.table,
            change.columns.join(', '),
            change.target ?? '',
          ),
        )
}
