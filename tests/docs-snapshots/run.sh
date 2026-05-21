#!/bin/sh
# Snapshot-style regression suite: renders every fixture listed in
# fixtures.txt with --fragment mode and diffs against a committed golden.
#
# Usage:
#   sh tests/docs-snapshots/run.sh            # run, fail on any diff/missing
#   sh tests/docs-snapshots/run.sh --update   # regenerate goldens from actual output

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"
LIB="$REPO/tests/lib/diff.sh"
FIXTURES="$HERE/fixtures.txt"
EXPECTED_DIR="$HERE/expected"

. "$LIB"

mode=
if [ "${1:-}" = "--update" ]; then
	mode=--update
fi

SCRATCH=$(mktemp -d -t jmd-snapshots.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "docs-snapshots  (scratch=$SCRATCH)"
echo "=========================================="

counter_init

# Run from the repo root so docs/*.jmd's relative dependencies resolve as they
# do during normal documentation builds.
cd "$REPO"

while IFS= read -r line || [ -n "$line" ]; do
	# strip leading/trailing whitespace
	name=$(printf '%s' "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
	# skip blanks and comments
	case "$name" in
		''|\#*) continue ;;
	esac

	src="docs/${name}.jmd"
	if [ ! -f "$src" ]; then
		printf 'FAIL  docs-snapshots:%s  (source missing: %s)\n' "$name" "$src"
		_counter_bump 2
		continue
	fi

	actual="$SCRATCH/${name}.html"
	expected="$EXPECTED_DIR/${name}.expected.html"

	# Run jmarkdown. Capture stderr separately so we can surface warnings on
	# failure without polluting the actual HTML.
	stderr_log="$SCRATCH/${name}.stderr"
	if ! node "$JMD" process "$src" --fragment -o "$actual" >/dev/null 2>"$stderr_log"; then
		printf 'FAIL  docs-snapshots:%s  (jmarkdown exited non-zero)\n' "$name"
		sed 's/^/    | /' "$stderr_log"
		_counter_bump 2
		continue
	fi

	assert_match "docs-snapshots:${name}" "$actual" "$expected" "$mode"
done <"$FIXTURES"

counter_report "docs-snapshots: "
exit "$EXIT_CODE"
