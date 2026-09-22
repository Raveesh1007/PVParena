#!/usr/bin/env bash
# Full Rust + program verification. Run from WSL: bash scripts/verify.sh
#
# Reports PASS/FAIL explicitly rather than relying on exit codes, because two things lie here:
# `anchor test` exits 0 even when the suite crashes without running a test, and `$?` does not
# survive a `wsl.exe -- bash -lc '...'` invocation. A missing test summary counts as a failure.
#
# Logs go under target/ rather than /tmp: WSL does not keep /tmp across separate wsl.exe calls,
# so /tmp logs disappear before they can be read.
export PATH="$HOME/.avm/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
LOGS=target/verify-logs
mkdir -p "$LOGS"
failed=0

run() {
  local label="$1"; shift
  if "$@" > "$LOGS/$label.log" 2>&1; then
    echo "PASS  $label"
  else
    echo "FAIL  $label  ($LOGS/$label.log)"
    failed=1
  fi
}

run anchor_build anchor build
run cargo_fmt cargo fmt --all -- --check
run cargo_clippy cargo clippy --workspace --all-targets -- -D warnings
run cargo_test cargo test -p stock_arena --lib
run program_tests npx vitest run tests

echo "--- rust unit tests ---"
if ! grep -E "test result: ok.*[1-9][0-9]* passed" "$LOGS/cargo_test.log"; then
  echo "NO RUST SUMMARY -> FAIL"
  failed=1
fi
echo "--- program tests ---"
if ! grep -E "Tests[[:space:]]+[1-9][0-9]* passed" "$LOGS/program_tests.log"; then
  echo "NO PROGRAM SUMMARY -> FAIL"
  failed=1
fi
exit "$failed"
