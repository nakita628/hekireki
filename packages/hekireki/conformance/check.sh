#!/usr/bin/env bash
# Conformance check for hekireki's foreign-language generators.
#
# Regenerates harness/* from schema.prisma with the built generators
# (dist/bin), then verifies each language in its own real toolchain: syntax
# first, then a type check against the actual GORM / sea-orm / SQLAlchemy /
# Ecto API. This is what a string-equality test cannot see: recursive struct
# embedding, bad column attributes, malformed associations.
#
#   bash conformance/check.sh                  # all languages; a missing local
#                                              # toolchain is skipped with a note
#   bash conformance/check.sh gorm sqlalchemy  # only these; a missing toolchain
#                                              # is a hard error (CI mode)
#
# Requires dist/ to be built first (`pnpm build`); the `pnpm conformance`
# script chains the two.
set -euo pipefail

cd "$(dirname "$0")/.."
harness="conformance/harness"

if [ ! -f dist/bin/gorm.js ]; then
  echo "error: dist/bin/gorm.js not found — run 'pnpm build' first" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  langs=("$@")
  strict=1
else
  langs=(gorm sea-orm sqlalchemy ecto)
  strict=0
fi

for lang in "${langs[@]}"; do
  case "$lang" in
    gorm | sea-orm | sqlalchemy | ecto) ;;
    *)
      echo "error: unknown language '$lang' (expected gorm | sea-orm | sqlalchemy | ecto)" >&2
      exit 1
      ;;
  esac
done

# A language runs only when its toolchain is present; in strict (CI) mode a
# missing toolchain fails instead.
toolchain_of() {
  case "$1" in
    gorm) echo go ;;
    sea-orm) echo cargo ;;
    sqlalchemy) echo python3 ;;
    ecto) echo mix ;;
  esac
}

runnable=()
for lang in "${langs[@]}"; do
  tool="$(toolchain_of "$lang")"
  if command -v "$tool" > /dev/null 2>&1; then
    runnable+=("$lang")
  elif [ "$strict" = 1 ]; then
    echo "error: $lang needs '$tool' on PATH" >&2
    exit 1
  else
    echo "skip: $lang ('$tool' not on PATH)"
  fi
done

if [ "${#runnable[@]}" = 0 ]; then
  echo "error: no requested language has its toolchain installed" >&2
  exit 1
fi

# prisma resolves `provider = "hekireki-gorm"` by name on PATH: link the built
# bins, drop stale output, regenerate everything from the conformance schema.
mkdir -p node_modules/.bin
for g in gorm sea-orm sqlalchemy ecto; do
  ln -sf "../../dist/bin/$g.js" "node_modules/.bin/hekireki-$g"
done
rm -rf "$harness/gorm/model/models.go" \
  "$harness/sea-orm/src/entities" \
  "$harness/sqlalchemy/models.py" \
  "$harness/ecto/lib"
PATH="$PWD/node_modules/.bin:$PATH" DATABASE_URL=postgresql://localhost/conformance \
  npx prisma generate --schema conformance/schema.prisma

for lang in "${runnable[@]}"; do
  echo "=== $lang ==="
  case "$lang" in
    gorm)
      (
        cd "$harness/gorm"
        gofmt -e model/models.go > /dev/null # syntax
        CGO_ENABLED=0 go build -mod=readonly ./model/ # type: real GORM API
        CGO_ENABLED=0 go vet -mod=readonly ./model/
      )
      ;;
    sea-orm)
      (
        cd "$harness/sea-orm"
        rustfmt --edition 2021 --emit=stdout src/entities/*.rs > /dev/null # syntax
        cargo check --locked --quiet                                       # type: real sea-orm API
      )
      ;;
    sqlalchemy)
      (
        cd "$harness/sqlalchemy"
        python3 -m py_compile models.py # syntax
        if [ ! -d .venv ]; then python3 -m venv .venv; fi
        .venv/bin/pip install --quiet -r requirements.txt
        .venv/bin/mypy --config-file mypy.ini models.py smoke.py # type: real SQLAlchemy API + invariants
      )
      ;;
    ecto)
      (
        cd "$harness/ecto"
        elixir -e 'for f <- Path.wildcard("lib/*.ex"), do: Code.string_to_quoted!(File.read!(f), file: f)' # syntax
        mix local.hex --force --if-missing
        # telemetry is an Erlang dep; without rebar3 mix blocks on an install
        # prompt. CI pre-installs a pinned rebar3 (setup-beam rebar3-version),
        # so this only fetches on a first local run.
        mix local.rebar --force --if-missing
        mix deps.get
        # Informational only — surfaces advisories on pinned deps without
        # gating the check (the known decimal 2.x advisory is accepted:
        # compile-only harness, no untrusted input, not shipped to npm).
        mix hex.audit || true
        mix compile --force # type: real Ecto API
      )
      ;;
  esac
  echo "ok: $lang"
done
