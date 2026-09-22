# Working in this repository

[CONTRIBUTING.md](CONTRIBUTING.md) holds the rules; this file is what an agent needs in front of
it. Most of the conventions are enforced by the oxlint plugin in
`packages/hekireki/lint/custom.js`, so `vp lint` is the check, not a reviewer's memory.

## Naming

- **A schema is PascalCase.** A value that names a shape — zod, valibot, or Effect's `Schema.*` —
  is `PascalCase`: `SeedConfig`, `FieldRule`, `DatabaseUrl`. Rule: `custom/schema-pascal-case`.
- **Everything else in application logic is camelCase**, with `UPPER_SNAKE` for constants. The
  verbs of the `Schema` namespace make a function out of a schema rather than naming a shape, so
  `decodeConfig` stays camelCase. Rule: `custom/logic-camel-case`.
- **What `safeParse` returns is `result`.** Write `const result = SavedDecisions.safeParse(json)`,
  then `result.success` and `result.data`. Not `parsed`, `checked`, or the name of what it holds:
  the schema already says what it is. Name the value handed in by where it came from (`json` for
  what `JSON.parse` returned). Where a `result` is already in scope, as a callback inside one, let
  the outer schema read the inner value (a union that turns what does not fit into `null`, as
  `StoredLayoutSchema` does) rather than shadowing it.
- **The package validates with zod only.** valibot is a generator target (`hekireki-valibot`), not
  a dependency: Studio's client and the diagram read what they store with zod, as the server does.

## Functions

- **No pass-through functions.** Do not write a function whose body only returns its own argument,
  hands its arguments to another call unchanged, or renames a built-in check
  (`typeof value === 'function'`). Write it at the call sites. Rule: `custom/no-pass-through`.
- **Exempt, because they carry a type the call site cannot write:** a type guard
  (`value is Row`) and a generic identity (`defineSchema<S>(schema: S)`).
- **Keep a helper that holds logic** used in several places: escaping, quoting, pluralising,
  grouping. Inlining those would copy the logic around, which is the opposite of the rule's point.
- **Do not add an identity constructor to name an object's type.** Write the object literal and
  put the type inline on the variable or the call's type argument.
- **Do not lift a value into a function to save repeating it.** A handler's problem response, an
  options object, a header: write it where it is returned, however many times that is. A helper
  like `unavailable(path, detail)` reads as indirection at every call site and hides the shape the
  route actually answers with — the existing handlers write each response out, and so should a new
  one. A helper earns its place only by holding logic: escaping, quoting, pluralising, grouping.

- **No single-use helper that only names a few lines.** A predicate passed to one `filter`, a
  name built once, an object mapped in one place: write them where they are used, with a comment
  if the why is not obvious. Count the uses before extracting; one is not enough.

## Effect

- **An outcome is Effect's own type, not a hand-made one.** Not `{ errors, value: null }`, not
  `{ ok, value } | { ok, error }`: return `Result.succeed(value)` / `Result.fail(why)` and split
  a list of them with `Array.separate`, as `resolveTable` and `resolveMoves` do. In an Effect, use
  `Effect.result`, `Effect.match`, `Effect.mapError`. `Result`, `Option` and `Array` are values and
  are fine in `migrate/domain`; the `Effect` runtime is not.
- **The one exception is a shape someone else reads.** The Prisma schema engine takes
  `{ ok, value, map, flatMap }` from its adapter and dies on anything else, so
  `adapter/engine-adapter.ts` makes that from a `Result` at the last moment (`engineResult`) and
  nowhere holds it. What Studio's API answers with (`ok`, `failedAt`, `error: string | null`) is a
  contract of the same kind.

## Schemas in `src/migrate`

- **What crosses a boundary is read through a zod schema, and the function says so in its type**:
  `input: z.infer<typeof WriteDecisionsInput>`, or `z.input<...>` where the function is the one
  that parses. No hand-written twin of a schema's type: `z.infer<typeof Decision>` at the use.
- **Brand what has been read.** `Decision` is `.brand<'Decision'>()`: a decision reaches
  `makeDecisionModels` only through the schema, which holds its kind to a check there is and its
  choice to one that check offers. `checkOpened` and `writeDecisions` take them as the file or the
  wire has them and parse first. Keep a brand out of what a function returns to other packages:
  a declaration cannot name zod's `$brand` (TS4058), so the report lists plain fields.
- A refinement that narrows (`.refine(isKind, { abort: true })`) aborts, or the object-level
  refinement after it runs on a value the type says cannot be there.

## SQL

- **A function that builds SQL shows the SQL.** Its TSDoc carries an `@example` with a fenced
  `sql` block: what it writes for a small, named case (`"User"."name"`, `"Post"."authorId"`), per
  dialect where they differ, and for a fix both the plan's statement and the CTE the check reads.
- **Take the example from the function, not from memory**: run it (a throwaway test that prints)
  or quote a test's expectation. An example that is wrong is worse than none.

## Layout of `src/migrate`

- **`domain/` is pure**: the schema and the database's catalogue in; checks, fixes and SQL out. No
  Effect, no file, no connection, and `no-restricted-imports` in `vite.config.ts` holds it to that.
  `domain/fixes/` is one function, `resolveFixes`, in the parts it is made of: what the decisions
  ask (`resolve-table.ts`, `moves.ts`), the versions of a table the steps make (`versions.ts`),
  the steps (`steps.ts`) and what the database does on its own about them (`effects.ts`).
- **`adapter/` is everything that reaches outside**: the schema engine and the connection it is
  given, the catalogue queries, the decisions file, the migrations directory, backups, a rehearsal.
- **`check.ts` puts the two together** and `report.ts` prints what it found; `index.ts` is what the
  command line imports when `migrate check` or `plan` runs.
- Do not name a directory here `usecases` or `services`: the lint plugin reads those names as
  Studio's layers, where a usecase never imports another and takes no `Effect.map` in a pipe.

## Output

- **Generated SQL carries no comment of ours.** `hekireki migrate plan` writes statements and one
  marker line, `-- hekireki migrate plan`, which is what lets it refuse to rewrite its own output.
  Comments Prisma wrote stay where they were. What a person needs to know is `notes` from
  `planSql`, printed by the CLI.
- **Let the CLI library do its own job.** `effect/unstable/cli` renders help, parses flags and
  reports errors; do not reimplement any of that.

## Checks before handing work back

`vp lint` on a whole package gets killed here, so lint the directories you touched. In
`packages/hekireki`:

```bash
npx tsgo -p tsconfig.json --noEmit
npx vp lint src/<directory>   # per directory
npx vp test run
pnpm build
```

From the repository root: `npx vp fmt --check` and `pnpm lint` (markdown, prose, spelling,
workflows). The database-backed tests under `test/db/` need the servers named in
[CONTRIBUTING.md](CONTRIBUTING.md) and skip without them; `examples/migrate` runs the migration
flow end to end on SQLite with `pnpm demo`. A change to the Active Record generator is run in
`examples/active-record` (`pnpm run demo`: generate, `prisma db push`, `check.rb` against Active
Record 8.1 on SQLite, RuboCop), which needs Ruby 3.2 or newer. Where the Ruby on the machine is
older, a `ruby:4.0` container with the example directory mounted does it; the official image
points `BUNDLE_APP_CONFIG` elsewhere, so set it to the example's `.bundle` for the path to hold.
