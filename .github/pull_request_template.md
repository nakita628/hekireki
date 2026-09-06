<!--
Title: `type(scope): summary` — imperative mood, no trailing period. Write it for the
person reading the release notes, not for the diff.

  type   feat | fix | perf | refactor | docs | test | build | ci | chore
  scope  a generator (zod, valibot, drizzle, er, …) | studio | server | client | api | cli
         | sql | diagram | e2e | example | docs | ci

  fix(zod): keep the `@map` column name out of the generated object keys
  feat(studio): draw the execution plan of a statement on the SQL page
-->

## Why

<!-- The bug, the missing capability or the request behind this change. Link the issue: `Closes #123`. -->

## What

<!-- What changed, as someone running a generator or using Studio sees it. One to three sentences. -->

## Where

<!-- Scope: which generator, the Studio server or client, the API contract (`main.tsp`), the CLI, the SQL analyzer, the ER diagram. Name what is deliberately left out. -->

## Who

<!-- Who notices: every user, users of one generator or one database, contributors only. Breaking for anyone? -->

## When

<!-- Release impact: `none` | `next release` | `version bumped to x.y.z`. -->

## How

<!--
The approach in a sentence, then the evidence. For a generator change, the schema and the
output it now writes (example/generated is in the diff); for a Studio change, a screenshot
of the view; for a contract change, the regenerated files (routes, handlers, hooks,
docs/studio-api.md) are in the diff beside main.tsp. Tick only what you ran; paste the
output of anything that failed.
-->

- [ ] `pnpm check`
- [ ] `pnpm test`
- [ ] `pnpm example`, when a generator's output changed
- [ ] `pnpm lang`, when the generated code of a language changed
- [ ] `pnpm test:e2e` in `packages/hekireki`, when Studio (`src/studio/`) changed
