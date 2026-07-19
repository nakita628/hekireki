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
pnpm test             # unit tests (vitest via vite-plus)
pnpm coverage         # tests with coverage
```

Building the generators and running the conformance harness happen **inside the package**:

```bash
cd packages/hekireki
pnpm build            # build dist/ (tsdown)
pnpm conformance      # build + compile generated code in real toolchains
```

The conformance run generates code from `packages/hekireki/conformance/schema.prisma` and verifies it against the **real** toolchains (currently Go, Rust, Python, Elixir, Ruby, PHP, and TypeScript). Toolchains you don't have installed are skipped locally with a note — CI runs the full matrix, so you don't need every language installed to contribute.

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
packages/hekireki/conformance/   # cross-language conformance harness
fixtures/                        # end-to-end fixture schemas used by src/bin tests
```

Dependencies flow one way: `utils → helper → generator → core/bin`.

## Coding rules

These are enforced in review, so following them up front saves a round-trip:

- **Pure functions by default.** Side effects (file writes) belong in `emit/`; a function that writes must say so in its name (`write*`, `emit*`).
- **No `as` casts** (tests are exempt), **no `any`**, **no `let` / reassignment** — use `const` with `map` / `reduce` / ternaries.
- **Let inference work.** Don't annotate return types; write argument types inline instead of declaring one-off named types.
- **`utils/` stays single-responsibility.** Don't add functions that merely compose or alias other exported utils — composition belongs in `helper/` or the call site. `utils/index.ts` must not import project-internal modules.
- **Descriptive names in generated code.** No new one-letter variables in emitted templates (`result`, not `r`).
- **Comments are rare.** Write one only when the _why_ is not obvious from the code; never restate the _what_, and never reference PR numbers, dates, or discussions.

### Codegen principles

- **The input Prisma schema is the single source of truth.** Generation is one-way; generators never re-parse their own emitted strings (parse the DMMF, not the output).
- **Carry structured data, stringify late.** Build `{ name, code }`-style entries and join them at the emit boundary.
- **Match the target's official conventions.** When in doubt about what a generator should emit, the primary sources win: the target ORM's official documentation and, for schema semantics, the Prisma docs. Cite them in the PR description for anything non-obvious.

## Testing rules

- **Codegen tests assert full equality**: `toBe` / `toStrictEqual` on the complete generated output. No `toContain` / `toMatch` partial matching — byte-for-byte output is the contract.
- Test files are `*.test.ts`, co-located next to what they test.
- **Every bug fix needs a regression test** that fails without the fix.
- Keep test logic inline — no shared extraction/transform helpers between tests (fixture setup and lifecycle hooks are fine). Tests are read as documentation.
- Coverage targets: 90% lines / 90% functions / 85% branches. Don't let a PR lower them.
- If your change affects generated foreign-language code, run `pnpm conformance` (inside `packages/hekireki`) for the languages you can, and rely on CI's `Lang Check` matrix for the rest. The unit tests own the byte-equality contract; conformance owns "does it actually compile and load against the real ORM API".

## Pull request process

1. Fork and create a topic branch from `main`.
2. Keep PRs focused — one bug fix or one feature per PR. Changes that alter generated output for existing users need an issue first.
3. Before pushing, make sure all of these pass locally:
   - `pnpm check` (clean, no diffs left behind)
   - `pnpm test`
   - regression / new tests included
4. Update user-facing docs in the same PR when behavior changes: README examples for new options, and note breaking changes explicitly.
5. Versioning follows [SemVer](https://semver.org/) and the changelog follows [Keep a Changelog](https://keepachangelog.com/) — maintainers handle releases, but stating "patch / minor / breaking" in your PR description helps triage.
6. CI must be green: `Test` (lint, unit tests, coverage) and, if you touched `src/` or `conformance/`, the per-language `Lang Check` matrix.

## Adding a new generator

New targets (a new ORM, validator, or language) are the biggest contributions we take — and the most design-sensitive. Please:

1. **Open an issue first** describing the target, its official docs, and a sketch of the generated output for a small schema.
2. Mirror the existing structure: `bin/<target>.ts` → `core/<target>.ts` → `generator/<target>.ts` → `helper/<target>.ts`, with unit tests at every layer and a `src/bin/<target>.test.ts` end-to-end test.
3. Cover the hard schema shapes — the conformance schema shows what every generator must survive: every scalar type, enum defaults, `@map`/`@@map`, self-relations, two relations to the same model, composite primary keys, implicit many-to-many join tables (Prisma's `A`/`B` columns), `uuid(7)`/`ulid()` defaults, and reserved-word field names.
4. Add a conformance harness leg (`conformance/harness/<target>/` + a case in `conformance/check.sh` + a `Lang Check` matrix entry) so the generated code is compiled against the real toolchain in CI.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
