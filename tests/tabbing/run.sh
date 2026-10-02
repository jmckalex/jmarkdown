#!/bin/sh
# Tabbing (src/tabbing.js) — the parser, LaTeX's layout replayed over widths,
# the LaTeX and HTML it writes, and that the module stays import-free. Unit
# tests (node:test) rather than goldens because the layout is a function of
# measured widths, which only a browser has; the rendered output is covered
# by tests/features/tabbing.
#
# Usage:  sh tests/tabbing/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)

echo "=========================================="
echo "tabbing"
echo "=========================================="

out=$(node --test --test-reporter=tap "$HERE/tabbing.test.js" 2>&1)
status=$?
printf '%s\n' "$out" | sed -n 's/^ok [0-9]* - /PASS  tabbing\//p; s/^not ok [0-9]* - /FAIL  tabbing\//p'
passed=$(printf '%s\n' "$out" | grep -c '^ok ')
failed=$(printf '%s\n' "$out" | grep -c '^not ok ')
if [ "$status" -ne 0 ] && [ "$failed" -eq 0 ]; then
	# A load error fails no test by name; show it.
	printf '%s\n' "$out" | sed 's/^/    | /'
	failed=1
fi

# The default template carries the page script on a page with a tabbing
# block, once, and on no other page.
SCRATCH=$(mktemp -d -t jmd-tabbing.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM
printf '# With\n\n```tabbing\nA |= B\nx |> y\n```\n\n```tabbing\nC |= D\n```\n' >"$SCRATCH/with.md"
printf '# Without\n\nNo tabbing here.\n' >"$SCRATCH/without.md"
for doc in with without; do
	node "$HERE/../../src/index.js" process "$SCRATCH/$doc.md" -o "$SCRATCH/$doc.html" >/dev/null 2>&1
done
count=$(grep -c 'function tabbingPage' "$SCRATCH/with.html")
if [ "$count" = 1 ]; then echo "PASS  tabbing/page-script/included-once"; passed=$((passed + 1))
else echo "FAIL  tabbing/page-script/included-once  (found $count)"; failed=$((failed + 1)); fi
if ! grep -q 'function tabbingPage' "$SCRATCH/without.html"; then echo "PASS  tabbing/page-script/absent-without-tabbing"; passed=$((passed + 1))
else echo "FAIL  tabbing/page-script/absent-without-tabbing"; failed=$((failed + 1)); fi
echo "tabbing: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
