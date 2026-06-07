#!/bin/sh
# Hand-crafted feature-level regression fixtures.
#
# Each *.jmd somewhere under tests/features/ may have any of:
#   <name>.expected.html  — golden for HTML --fragment output
#   <name>.expected.tex   — golden for LaTeX --fragment output (body only;
#                           the full-document wrapper is covered by the
#                           latex-document suite, and these fragments are what
#                           tests/latex-compile wraps and compiles)
#   <name>.flags          — single line of extra CLI args to pass to jmarkdown
#
# A fixture without a corresponding *.expected.{html,tex} is treated as
# silently absent for that output format. A fixture with NO goldens at all
# is reported as MISSING.
#
# Usage:
#   sh tests/features/run.sh              # diff against goldens
#   sh tests/features/run.sh --update     # refresh existing goldens only.
#                                         # Missing goldens stay missing — that's how
#                                         # we opt out of LaTeX testing for fixtures
#                                         # whose LaTeX path isn't correct yet.
#   sh tests/features/run.sh --bootstrap  # create + refresh every golden (use once when
#                                         # adding a fixture, then prune unwanted ones).

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"
LIB="$REPO/tests/lib/diff.sh"

. "$LIB"

mode=
bootstrap=0
case "${1:-}" in
	--update)    mode=--update ;;
	--bootstrap) mode=--update; bootstrap=1 ;;
esac

SCRATCH=$(mktemp -d -t jmd-features.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "features  (scratch=$SCRATCH)"
echo "=========================================="

counter_init

cd "$REPO"

# Find all .jmd fixtures, sorted for deterministic ordering. mindepth=2
# excludes any stray .jmd in the tests/features/ root itself; every fixture
# lives in a category subdirectory.
find tests/features -mindepth 2 -name '*.jmd' -type f 2>/dev/null | sort | while IFS= read -r src; do
	rel=${src#tests/features/}                  # e.g. inline-syntax/italics.jmd
	base=${rel%.jmd}                            # e.g. inline-syntax/italics
	stem=$(basename "$base")                    # e.g. italics
	dir=$(dirname "$src")                       # e.g. tests/features/inline-syntax

	expected_html="${dir}/${stem}.expected.html"
	expected_tex="${dir}/${stem}.expected.tex"
	flags_file="${dir}/${stem}.flags"

	extra_flags=
	if [ -f "$flags_file" ]; then
		extra_flags=$(cat "$flags_file")
	fi

	mkdir -p "$SCRATCH/$(dirname "$base")"

	# HTML render: run if the golden exists, or if we're bootstrapping
	if [ -f "$expected_html" ] || [ "$bootstrap" = "1" ]; then
		actual_html="$SCRATCH/${base}.html"
		stderr_log="$SCRATCH/${base}.html.stderr"
		# shellcheck disable=SC2086
		if ! node "$JMD" process "$src" --fragment $extra_flags -o "$actual_html" >/dev/null 2>"$stderr_log"; then
			printf 'FAIL  features/%s [html]  (jmarkdown exited non-zero)\n' "$base"
			sed 's/^/    | /' "$stderr_log"
			_counter_bump 2
		else
			assert_match "features/${base} [html]" "$actual_html" "$expected_html" "$mode"
		fi
	fi

	# LaTeX render: run if the golden exists, or if we're bootstrapping
	if [ -f "$expected_tex" ] || [ "$bootstrap" = "1" ]; then
		actual_tex="$SCRATCH/${base}.tex"
		stderr_log="$SCRATCH/${base}.tex.stderr"
		# shellcheck disable=SC2086
		if ! node "$JMD" process "$src" --to latex --fragment $extra_flags -o "$actual_tex" >/dev/null 2>"$stderr_log"; then
			printf 'FAIL  features/%s [tex]   (jmarkdown exited non-zero)\n' "$base"
			sed 's/^/    | /' "$stderr_log"
			_counter_bump 2
		else
			assert_match "features/${base} [tex] " "$actual_tex" "$expected_tex" "$mode"
		fi
	fi

	# Fixture with no goldens at all → MISSING (so we don't silently ship dead fixtures)
	if [ "$mode" != "--update" ] && [ ! -f "$expected_html" ] && [ ! -f "$expected_tex" ]; then
		printf 'MISSING features/%s  (no .expected.html or .expected.tex)\n' "$base"
		_counter_bump 3
	fi
done

counter_report "features: "
exit "$EXIT_CODE"
