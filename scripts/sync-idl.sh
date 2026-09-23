#!/usr/bin/env bash
# Copy the artefacts `anchor build` generates into packages/idl, where the web app and worker can
# import them.
#
# They are copied rather than imported straight out of target/ because target/ is a build
# directory outside every workspace package: a Next.js bundle cannot reach into it, and a
# TypeScript project reference cannot have its rootDir there. They are committed for the same
# reason a lockfile is — so a checkout typechecks without first needing a Rust toolchain.
#
# Run this after any `anchor build` that changed the program's interface.
set -euo pipefail
cd "$(dirname "$0")/.."

out=packages/idl/src/generated
mkdir -p "$out"

for f in target/idl/stock_arena.json target/types/stock_arena.ts; do
  if [ ! -f "$f" ]; then
    echo "missing $f — run 'anchor build' first" >&2
    exit 1
  fi
done

cp target/idl/stock_arena.json "$out/stock_arena.json"
cp target/types/stock_arena.ts "$out/stock_arena.ts"

# The program ID is declared in three places that must agree: `declare_id!` in the program,
# Anchor.toml, and the IDL. The IDL is generated from `declare_id!`, so checking it against
# Anchor.toml catches the case where the two Rust-side values have drifted.
idl_id=$(node -p "require('./$out/stock_arena.json').address")
toml_id=$(grep -E '^stock_arena' Anchor.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
if [ "$idl_id" != "$toml_id" ]; then
  echo "program id mismatch: IDL says $idl_id, Anchor.toml says $toml_id" >&2
  exit 1
fi

npx prettier --write "$out" > /dev/null
echo "synced IDL for $idl_id"
