# Contributing to Hekireki

Thank you for considering a contribution! Hekireki generates validation schemas, ORM models, and ER diagrams from Prisma schemas across multiple languages, so contributions range from one-line bug fixes to entirely new generator targets. This guide explains how we'd like you to contribute.

## Ways to contribute

- **Bug reports** — use the [Bug Report template](https://github.com/nakita628/hekireki/issues/new?template=bug-report.md). A minimal `schema.prisma` that reproduces the problem plus the actual/expected generated output is the fastest path to a fix.
- **Feature requests** — use the [Feature Request template](https://github.com/nakita628/hekireki/issues/new?template=feature-request.md). For anything that changes generated output or adds a public option, please open an issue **before** writing code so we can agree on the design.
- **Bug-fix PRs** — small, focused fixes can go straight to a PR.
- **Docs** — README examples must work as-is when copy-pasted; fixes to stale examples are always welcome.
- **New generator targets** — see [Adding a new generator](#adding-a-new-generator) below. Always start with an issue.

## Development setup

Requirements: **Node.js 22+** and **pnpm 11** (`corepack enable` is the easiest way).

```bash
git clone https://github.com/nakita628/hekireki.git
cd hekireki
pnpm install
```

Lint, tests, and coverage always run **from the repo root**:

```bash
pnpm check            # lint + format (vp check --fix)
pnpm test             # unit tests (the `unit` project — vitest via vite-plus)
pnpm coverage         # unit tests with coverage
pnpm lang             # build + language checks (the `lang` project)
```

Building the generators happens **inside the package**:

```bash
cd packages/hekireki
pnpm build            # build dist/ (tsdown)
```

The test suite is split into two Vitest projects:

- **`unit`** — `packages/hekireki/src/**/*.test.ts`. Owns the byte-equality codegen contract (`toBe` / `toStrictEqual` exact matches). Needs no toolchain beyond Node.
- **`lang`** — `test/lang/*.test.ts`. Regenerates `test/harness/*` from `test/prisma/schema.prisma` and verifies the output against the **real** toolchains (currently Go, Rust, Python, Elixir, Ruby, PHP, and TypeScript). This is what a string comparison cannot see: recursive struct embedding, bad column attributes, malformed associations.

Toolchains you don't have installed are skipped locally with a note — CI runs the full matrix, so you don't need every language installed to contribute. Run a single language with `vp test --project lang test/lang/gorm.test.ts`.

Studio has a third suite on top of those, in Playwright:

```bash
cd packages/hekireki
pnpm test:e2e         # build dist/, then drive the built CLI in Chromium
```

`packages/hekireki/e2e/` runs the **built** Studio: `e2e/serve.ts` rebuilds a throwaway workspace (a copy of `e2e/fixtures/prisma` plus a `node:sqlite` database) and starts `dist/bin/hekireki.js studio` on it, so a run never touches a real project. Tests fail on any browser console error, page error, or 5xx from `/api`, not just on a failed assertion. It needs Node 24 (`node:sqlite`, and `serve.ts` is executed as TypeScript) and the Chromium Playwright pins: `pnpm exec playwright install chromium`.

The screenshot baselines in `e2e/__screenshots__` were taken in this repository's devcontainer. Fonts differ per machine, so regenerate them where the suite runs (`pnpm test:e2e --update-snapshots`) before trusting a pixel diff — and for the same reason CI runs the suite with `--ignore-snapshots`: the `E2E` workflow verifies behavior, and the visual baselines stay a local check.

## Project layout

```
packages/hekireki/src/
├── utils/       # single-responsibility pure functions (no project-internal imports)
├── helper/      # composition of utils — the per-target codegen logic lives here
├── generator/   # assembles helper output into files
├── core/        # Prisma generator entrypoints (options → generate → emit)
├── bin/         # CLI shims registered as prisma generator providers
├── emit/        # file-writing boundary (the only place with I/O side effects)
└── format/      # oxfmt formatting for TypeScript output
test/
├── prisma/          # the one schema every language check generates from
├── lang/            # per-language checks (setup.ts regenerates the harness)
└── harness/         # per-language host projects (go.mod, Cargo.toml, mix.exs, …)
```

Dependencies flow one way: `utils → helper → generator → core/bin`.

## Studio's UI

The Studio client is [HeroUI v3](https://heroui.com) (React Aria + Tailwind CSS v4) with
[react-icons](https://react-icons.github.io/react-icons/) for the marks — Lucide, imported as
`Lu*` from `react-icons/lu`. Nothing in `src/studio/client` draws its own buttons, tabs, chips,
key caps, toasts, dialogs or SVG paths: reach for the component before writing one.

`styles.css` keeps Studio's own palette (`--c-*`) and points HeroUI's variables at it, so both
draw from one set of colours — the same one the ER diagram's PNG/SVG exporter writes literally
(`diagram/svg.ts`). Change a colour there, in one place.

Two `overrides` in `pnpm-workspace.yaml` pin `@react-types/color` and `@react-types/slider` below
the versions HeroUI asks for: at those versions they depend on Adobe's Spectrum design system for
declarations that are erased at build time, which lands thousands of files in `node_modules`.

## Coding rules

These are enforced in review, so following them up front saves a round-trip:

- **Pure functions by default.** Side effects (file writes) belong in `emit/`; a function that writes must say so in its name (`write*`, `emit*`).
- **No `as` casts** (tests are exempt), **no `any`**, **no `let` / reassignment** — use `const` with `map` / `reduce` / ternaries.
- **Let inference work.** Don't annotate return types; write argument types inline instead of declaring one-off named types.
- **`utils/` stays single-responsibility.** Don't add functions that merely compose or alias other exported utils — composition belongs in `helper/` or the call site. `utils/index.ts` must not import project-internal modules.
- **Descriptive names in generated code.** No new one-letter variables in emitted templates (`result`, not `r`).
- **Comments are rare.** Write one only when the _why_ is not obvious from the code; never restate the _what_, and never reference PR numbers, dates, or discussions.
- **Doc comments are TSDoc.** `/** … */` blocks are linted by oxlint's `jsdoc` plugin: a `@param` carries a name and a description, `@returns` carries a description, and no tag carries a `{type}` — the type is the signature's job. TSDoc tags (`@remarks`, `@typeParam`, `@defaultValue`, …) are allowed; JSDoc-only ones are not.

### Codegen principles

- **The input Prisma schema is the single source of truth.** Generation is one-way; generators never re-parse their own emitted strings (parse the DMMF, not the output).
- **Carry structured data, stringify late.** Build `{ name, code }`-style entries and join them at the emit boundary.
- **Match the target's official conventions.** When in doubt about what a generator should emit, the primary sources win: the target ORM's official documentation and, for schema semantics, the Prisma docs. Cite them in the PR description for anything non-obvious.

## Testing rules

- **Codegen tests assert full equality**: `toBe` / `toStrictEqual` on the complete generated output. No `toContain` / `toMatch` partial matching — byte-for-byte output is the contract.
- Test files are `*.test.ts`. Unit tests are co-located next to what they test; the per-language toolchain checks live in `test/lang/`, generating from `test/prisma/schema.prisma`.
- **Every bug fix needs a regression test** that fails without the fix.
- Keep test logic inline — no shared extraction/transform helpers between tests (fixture setup and lifecycle hooks are fine). Tests are read as documentation.
- Coverage targets: 90% lines / 90% functions / 85% branches. Don't let a PR lower them.
- If your change affects generated foreign-language code, run `pnpm lang` for the languages you can, and rely on CI's `Lang Check` matrix for the rest. The `unit` project owns the byte-equality contract; `lang` owns "does it actually compile and load against the real ORM API".

## Pull request process

1. Fork and create a topic branch from `main`.
2. Keep PRs focused — one bug fix or one feature per PR. Changes that alter generated output for existing users need an issue first.
3. Before pushing, make sure all of these pass locally:
   - `pnpm check` (clean, no diffs left behind)
   - `pnpm test`
   - `cd packages/hekireki && pnpm test:e2e` if you touched Studio (`src/studio/`)
   - regression / new tests included
4. Update user-facing docs in the same PR when behavior changes: README examples for new options, and note breaking changes explicitly.
5. Versioning follows [SemVer](https://semver.org/) and the changelog follows [Keep a Changelog](https://keepachangelog.com/) — maintainers handle releases, but stating "patch / minor / breaking" in your PR description helps triage.
6. CI must be green: `Test` (lint, unit tests, coverage), `E2E` (the Studio suite in Chromium) and, if you touched `src/` or `test/`, the per-language `Lang Check` matrix.

## Adding a new generator

New targets (a new ORM, validator, or language) are the biggest contributions we take — and the most design-sensitive. Please:

1. **Open an issue first** describing the target, its official docs, and a sketch of the generated output for a small schema.
2. Mirror the existing structure: `bin/<target>.ts` → `core/<target>.ts` → `generator/<target>.ts` → `helper/<target>.ts`, with unit tests at every layer.
3. Cover the hard schema shapes — `test/prisma/schema.prisma` shows what every generator must survive: every scalar type, enum defaults, `@map`/`@@map`, self-relations, two relations to the same model, composite primary keys, implicit many-to-many join tables (Prisma's `A`/`B` columns), `uuid(7)`/`ulid()` defaults, and reserved-word field names.
4. Add a language check leg (a generator block in `test/prisma/schema.prisma` + `test/harness/<target>/` + `test/lang/<target>.test.ts` + a `Lang Check` matrix entry) so the generated code is compiled against the real toolchain in CI.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
