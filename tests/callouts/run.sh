#!/bin/sh
# Custom callout types (src/callouts.js): the `Callouts` config key and the
# applyCustomCallouts() host hook, with definitions good and hostile.
#
# A suite rather than feature fixtures because the definitions live in a
# project config (.jmarkdown/config.json, read from the working directory),
# which the feature harness cannot give a fixture. definitions.json holds
# them; custom.md uses them; custom.expected.{html,tex,stderr} are the
# goldens (`--update` rewrites them). Every hostile definition must be
# SKIPPED with a warning and leave no trace in either output.
#
# Usage:  sh tests/callouts/run.sh [--update]

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"
mode=${1:-}

SCRATCH=$(mktemp -d -t jmd-callouts.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "callouts  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0
pass() { printf 'PASS  callouts/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  callouts/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }

assert_contains() { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected to find: $3"; fi; }
assert_absent()   { if grep -qF -- "$3" "$2"; then fail "$1" "expected NOT to find: $3"; else pass "$1"; fi; }
assert_golden() {
	if [ "$mode" = "--update" ]; then cp "$2" "$3"; pass "$1 (updated)"; return; fi
	if diff -u "$3" "$2" >"$SCRATCH/diff" 2>&1; then pass "$1"; else fail "$1" "$(head -20 "$SCRATCH/diff")"; fi
}

# --- the `Callouts` config key ------------------------------------------------

WORK="$SCRATCH/config"
mkdir -p "$WORK/.jmarkdown"
cp "$HERE/definitions.json" "$WORK/.jmarkdown/config.json"
cp "$HERE/custom.md" "$WORK/custom.md"
cd "$WORK" || exit 1
node "$JMD" process custom.md --fragment -o out.html >/dev/null 2>html.stderr || {
	echo "FAIL  callouts: jmarkdown exited non-zero (html)"; sed 's/^/    | /' html.stderr; exit 1
}
node "$JMD" process custom.md --to latex --fragment -o out.tex >/dev/null 2>tex.stderr || {
	echo "FAIL  callouts: jmarkdown exited non-zero (tex)"; sed 's/^/    | /' tex.stderr; exit 1
}

assert_golden "config/html" out.html "$HERE/custom.expected.html"
assert_golden "config/tex" out.tex "$HERE/custom.expected.tex"
assert_golden "config/stderr" html.stderr "$HERE/custom.expected.stderr"

# Nothing from a refused or hostile definition reaches markup.
assert_absent "config/html/no-raw-script" out.html "<script"
assert_absent "config/html/no-raw-img" out.html "<img"
assert_absent "config/html/no-css-injection" out.html "url("
assert_absent "config/html/no-traversal" out.html "passwd\"/>"
assert_contains "config/html/title-escaped" out.html '&lt;img src=x onerror=alert(1)&gt;'
assert_absent "config/tex/no-raw-input" out.tex '\input{'
assert_contains "config/tex/title-escaped" out.tex '\textbackslash{}input\{/etc/passwd\}'
# Each skipped entry is reported, by place and reason.
for n in 8 9 10 11 12 13 14; do
	assert_contains "config/warns/entry-$n" html.stderr "Callouts: entry $n"
done
assert_contains "config/warns/alias-hijack" html.stderr 'the alias “note” is a callout type of its own — ignored'

# --- the host hook: applyCustomCallouts() --------------------------------------

WORK="$SCRATCH/hook"
mkdir -p "$WORK"
printf -- '---\nTitle: hook\n---\n\n> [!hosted]\n> Installed by the host.\n\n> [!viahost]\n> Its alias.\n' >"$WORK/hook.md"
cd "$WORK" || exit 1
node "$HERE/hook.mjs" "$REPO" hook.md out.html >/dev/null 2>hook.stderr || {
	echo "FAIL  callouts: hook build exited non-zero"; sed 's/^/    | /' hook.stderr; exit 1
}
n=$(grep -c 'data-callout="hosted" style="--clew-callout-color: teal"' out.html)
if [ "$n" -eq 2 ]; then pass "hook/type-and-alias"; else fail "hook/type-and-alias" "expected 2 hosted callouts, found $n"; fi
assert_contains "hook/label" out.html '<span class="callout-title-inner">From the host</span>'
assert_contains "hook/icon" out.html 'viewBox="0 0 448 512"'

# --- the table module loads with no Node at all ---------------------------------
# Clew bundles src/callout-table.js for the browser: its import graph must be
# itself and callout-definitions.js, evaluated in a context with no process,
# require or filesystem.

if node --experimental-vm-modules "$HERE/browser-load.mjs" "$REPO/src" >"$SCRATCH/browser.out" 2>&1; then
	pass "table/loads-without-node"
else
	fail "table/loads-without-node" "$(grep -v -e ExperimentalWarning -e trace-warnings "$SCRATCH/browser.out")"
fi

# --- the LaTeX palette agrees with the stylesheet -------------------------------

if node --input-type=module -e "
import fs from 'fs';
const css = fs.readFileSync('$REPO/src/jmarkdown.css', 'utf8');
const js = fs.readFileSync('$REPO/src/callout-table.js', 'utf8');
const fromCss = Object.fromEntries([...css.matchAll(/\.callout\[data-callout='([a-z]+)'\]\s*\{\s*--callout:\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
const block = /export const PALETTE = \{([^}]*)\}/.exec(js)[1];
const fromJs = Object.fromEntries([...block.matchAll(/([a-z]+): '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]));
const base = /\.callout\[data-callout\] \{[^}]*--callout: (#[0-9a-f]{6});/.exec(css)[1];
const ok = JSON.stringify(fromCss) === JSON.stringify(fromJs) && Object.keys(fromJs).length === 15 && base === fromJs.note;
if (!ok) { console.error(JSON.stringify({ fromCss, fromJs, base })); process.exit(1); }
" 2>"$SCRATCH/palette.err"; then pass "palette/css-matches-latex"; else fail "palette/css-matches-latex" "$(cat "$SCRATCH/palette.err")"; fi

echo "callouts: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
