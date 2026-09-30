#!/bin/sh
# `Run note code` (src/note-code.js) — every path by which a DOCUMENT makes the
# build run code, with the switch off and on.
#
# Off (a project .jmarkdown/config.json saying so): each construct is refused
# BY NAME in place — a `data-jmd-refused` marker in HTML, nothing in LaTeX, a
# build warning in both — and nothing runs: every construct below prints a
# SENTINEL when it runs, and the build's output must hold none. The document's
# own header says `Run note code: true`, which must change nothing.
#
# On (the default): the same constructs run — every sentinel appears — so a
# refusal above can't be passing because the fixture never ran anything.
# Mathematica is left out of this half: it needs wolframscript.
#
# A suite rather than golden fixtures because it has to watch stdout for code
# that ran, and needs a project config beside the document.
#
# Usage:  sh tests/note-code/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-note-code.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "note-code  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0

pass() { printf 'PASS  note-code/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  note-code/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }

assert_contains() {
	if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected to find: $3"; fi
}
assert_absent() {
	if grep -qF -- "$3" "$2"; then fail "$1" "expected NOT to find: $3"; else pass "$1"; fi
}
assert_count() {
	n=$(grep -oF -- "$3" "$2" | wc -l | tr -d ' ')
	if [ "$n" -eq "$4" ]; then pass "$1"; else fail "$1" "expected $4 of: $3" "found $n"; fi
}

# --- the constructs --------------------------------------------------------

make_fixture() {
	dir=$1
	mkdir -p "$dir"
	printf "console.log('SENTINEL-LOADJS');\n" > "$dir/load.js"
	printf "console.log('SENTINEL-LOADEXT');\nexport default [];\n" > "$dir/ext.mjs"
	printf "console.log('SENTINEL-LOADDIR');\nexport default [];\n" > "$dir/dir.mjs"
	printf "console.log('SENTINEL-LOADENV');\nexport default {};\n" > "$dir/env.mjs"
	cat > "$dir/doc.md" <<'EOF'
---
Title: note code
Load javascript: load.js
Load extensions: ext.mjs
Load directives: dir.mjs
Load environments: env.mjs
Extension shout: << >>
<b class="shout">${content1}</b>
Run note code: true
---

<script data-type="jmarkdown">
console.log('SENTINEL-SCRIPT');
global.output = 'SCRIPT-OUTPUT';
</script>

<script data-type="jmarkdown-postprocess">
console.log('SENTINEL-POSTPROCESS');
</script>

Prose with Math.max(1, (() => { console.log('SENTINEL-MATH'); return 2; })()) inline.

A calc("1+1") call.

function() { console.log('SENTINEL-FUNCBLOCK'); return 'FUNCBLOCK-OUTPUT'; }

Inline func() { console.log('SENTINEL-FUNC'); return 'FUNC-OUTPUT'; } here.

A mathjs math.sqrt((() => { console.log('SENTINEL-MATHJS'); return 4; })()) call.

Shouting <<loud>> here.
EOF
}

# --- off -------------------------------------------------------------------

OFF="$SCRATCH/off"
make_fixture "$OFF"
cat >> "$OFF/doc.md" <<'EOF'

:::Mathematica
Print["SENTINEL-MMA-BLOCK"]
:::

@begin(Mathematica)
Print["SENTINEL-MMA-ENV"]
@end(Mathematica)

Inline ⟦Print["SENTINEL-MMA-INLINE"]⟧ maths.
EOF
mkdir -p "$OFF/.jmarkdown"
echo '{ "Run note code": false }' > "$OFF/.jmarkdown/config.json"

cd "$OFF" || exit 1
node "$JMD" process doc.md --fragment -o out.html >html.log 2>&1 || {
	echo "FAIL  note-code: jmarkdown exited non-zero (off, html)"; sed 's/^/    | /' html.log; exit 1
}
node "$JMD" process doc.md --to latex --fragment -o out.tex >tex.log 2>&1 || {
	echo "FAIL  note-code: jmarkdown exited non-zero (off, tex)"; sed 's/^/    | /' tex.log; exit 1
}

for name in "Load javascript" "Load extensions" "Load directives" "Load environments" \
	"Extension shout" "jmarkdown script" "jmarkdown-postprocess script" \
	"Math" "calc" "func(…)" "function(…) block" "math.sqrt"; do
	assert_count "off/html/refused: $name" out.html "data-jmd-refused=\"$name\"" 1
done
assert_count "off/html/refused: Mathematica (block, @begin, inline)" out.html 'data-jmd-refused="Mathematica"' 3
assert_absent "off/html/nothing-ran" html.log "SENTINEL"
assert_absent "off/html/no-script-output" out.html "SCRIPT-OUTPUT"
assert_absent "off/html/no-function-output" out.html "FUNCBLOCK-OUTPUT"
# A refused func(…) takes its body with it: none of the source is left as prose.
assert_absent "off/html/func-body-claimed" out.html "SENTINEL-FUNC"
assert_absent "off/html/no-func-output" out.html "FUNC-OUTPUT"
assert_absent "off/html/no-extension" out.html 'class="shout"'
assert_contains "off/html/warns" html.log 'not run — "Run note code" is off'
if [ -d "$OFF/Mathematica" ]; then fail "off/no-wolframscript-cache" "a Mathematica/ cache folder was written"; else pass "off/no-wolframscript-cache"; fi
assert_count "off/header-cannot-enable" out.html 'class="jmd-error jmd-refused"' 15

assert_absent "off/tex/nothing-ran" tex.log "SENTINEL"
assert_absent "off/tex/no-marker" out.tex "jmd-refused"
assert_absent "off/tex/no-script-output" out.tex "SCRIPT-OUTPUT"
assert_contains "off/tex/warns" tex.log 'Load javascript not run — "Run note code" is off'

# --- on (the default) --------------------------------------------------------

ON="$SCRATCH/on"
make_fixture "$ON"
# Code that throws as it runs leaves an error in place; the build completes.
# Sentence-final, this call is found by the parser's retry, which runs it
# inside its own catch — where a throw used to escape and end the build.
cat >> "$ON/doc.md" <<'EOF'

The value is Math.nonesuch().
EOF
cd "$ON" || exit 1
node "$JMD" process doc.md --fragment -o out.html >html.log 2>&1 || {
	echo "FAIL  note-code: jmarkdown exited non-zero (on, html)"; sed 's/^/    | /' html.log; exit 1
}
for s in LOADJS LOADEXT LOADDIR LOADENV SCRIPT POSTPROCESS MATH FUNCBLOCK FUNC MATHJS; do
	assert_contains "on/ran: $s" html.log "SENTINEL-$s"
done
assert_contains "on/script-output" out.html "SCRIPT-OUTPUT"
assert_contains "on/function-output" out.html "FUNCBLOCK-OUTPUT"
assert_contains "on/func-output" out.html "Inline FUNC-OUTPUT here."
assert_contains "on/extension" out.html 'class="shout"'
assert_absent "on/no-marker" out.html "jmd-refused"
assert_contains "on/throw-shown-in-place" out.html "Math.nonesuch is not a function"

echo "note-code: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
