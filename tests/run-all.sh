#!/bin/sh
# Top-level test orchestrator. Runs every suite under tests/ and exits non-zero
# if any regression suite reports a failure.
#
# Usage:
#   sh tests/run-all.sh             # run everything
#   sh tests/run-all.sh --update    # passed through to suites that support it

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)

mode=${1:-}

echo "##########################################"
echo "# jmarkdown test suite"
echo "##########################################"
echo

# 1. file-inclusion — existing eyeball-only harness; informative, never gates CI.
echo "------ file-inclusion (informational; not gating) ------"
sh "$REPO/tests/file-inclusion/run.sh" >/dev/null 2>&1 && echo "(ran, output suppressed; use sh tests/file-inclusion/run.sh to inspect)" || echo "(ran with non-zero exit; not gating)"
echo

# 2. docs-snapshots — golden-file regression. Gates CI.
echo "------ docs-snapshots ------"
sh "$REPO/tests/docs-snapshots/run.sh" $mode
snapshot_status=$?
echo

# 3. features — hand-crafted feature fixtures (HTML + LaTeX). Gates CI.
echo "------ features ------"
sh "$REPO/tests/features/run.sh" $mode
features_status=$?
echo

if [ "$snapshot_status" -ne 0 ] || [ "$features_status" -ne 0 ]; then
	echo "FAILED: at least one regression suite reported failure."
	exit 1
fi

echo "OK: all gating suites passed."
exit 0
