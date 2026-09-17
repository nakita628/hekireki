/** What running a step ended in, kept per step so the page shows how far the migration got. */
export type StepOutcome = {
  readonly ran: boolean
  readonly affected: number | null
  readonly error: string | null
}

/** Whether the step has run, and whether the database took it when it did. */
export function outcomeOf(outcome: StepOutcome | undefined) {
  return { ran: outcome?.ran ?? false, failed: (outcome?.error ?? null) !== null }
}
