#!/bin/sh
# The figure engine (src/figure-engine.js): TikZ and MetaPost drawn in-process
# by mp-tikz-wasm, from a release's dist/ — only when asked (--figure-engine
# auto|wasm with --mp-tikz-dist). Its builds run with PATH stripped to
# /usr/bin:/bin, so no lualatex, dvisvgm, mpost or mptopdf can be reached: what
# they draw, the library drew.
#
# Needs a release: MP_TIKZ_DIST=<…/mp-tikz-wasm-0.4.0/dist>. Without one the
# library cases are SKIPPED (not failed), as the diagrams suite skips missing
# tools; the strict-wasm cases, which need no library, run regardless.
# HOME is a scratch folder, so a global config plays no part.
#
# Usage:  MP_TIKZ_DIST=/path/to/dist sh tests/figure-engine/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"
NODE=$(command -v node)

echo "=========================================="
echo "figure-engine"
echo "=========================================="

SCRATCH=$(mktemp -d -t jmd-figure-engine.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM
mkdir -p "$SCRATCH/home"

passed=0
failed=0
pass() { printf 'PASS  figure-engine/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  figure-engine/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
has()   { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected: $3"; fi; }
hasnt() { if grep -qF -- "$3" "$2"; then fail "$1" "unexpected: $(grep -F -- "$3" "$2" | head -2)"; else pass "$1"; fi; }

# --- strict wasm never runs the installed tools, on any path (no release needed) ---------------------------
# Stand-ins for lualatex, dvisvgm, mpost and mptopdf come first on PATH and log
# every run; two fake dists cover the library failing to load and a library
# call that throws. Under wasm no stand-in may run, and each figure is refused
# by name; under auto the same failure reaches them (the control).
STANDINS="$SCRATCH/standins"
mkdir -p "$STANDINS"
for tool in lualatex dvisvgm mpost mptopdf; do
	printf '#!/bin/sh\necho "%s $*" >>"%s/ran.txt"\nexit 1\n' "$tool" "$SCRATCH" >"$STANDINS/$tool"
	chmod +x "$STANDINS/$tool"
done
mkdir -p "$SCRATCH/dist-broken" "$SCRATCH/dist-throws"
printf "throw new Error('will not load');\n" >"$SCRATCH/dist-broken/index.js"
cat >"$SCRATCH/dist-throws/index.js" <<'EOF'
export const DEFAULT_BUNDLES = [];
export const MetaPost = { async create() { return {
	async addFiles() {}, dispose() {},
	async latex() { throw new Error('latex throws'); },
	async run() { throw new Error('run throws'); },
}; } };
EOF
# guarded DIR ARGS… — a build whose only TeX tools are the stand-ins
guarded() {
	dir=$1; shift
	(cd "$dir" && env -i HOME="$SCRATCH/home" PATH="$STANDINS:/usr/bin:/bin" "$NODE" "$JMD" "$@" >/dev/null 2>err.txt; echo $? >exit.txt)
}
figures() { printf -- '---\nTitle: Strict\n---\n\n:::TiKZ\n\\draw (0,0) -- (1,1);\n:::\n\n@begin(metapost)\ndraw unitsquare scaled 1cm;\n@end(metapost)\n\nAfter them.\n' >"$1/note.md"; }
strict() {
	label=$1; shift
	W="$SCRATCH/strict-$label"
	mkdir -p "$W"
	figures "$W"
	rm -f "$SCRATCH/ran.txt"
	guarded "$W" process note.md --fragment -o note.html --figure-engine wasm "$@"
	has   "strict/$label/exit-0" "$W/exit.txt" '0'
	if [ -s "$SCRATCH/ran.txt" ]; then fail "strict/$label/no-tool-run" "$(cat "$SCRATCH/ran.txt")"; else pass "strict/$label/no-tool-run"; fi
	has   "strict/$label/tikz-refused" "$W/note.html" 'data-jmd-refused="TiKZ"'
	has   "strict/$label/metapost-refused" "$W/note.html" 'data-jmd-refused="metapost"'
	has   "strict/$label/rest-renders" "$W/note.html" 'After them.'
	has   "strict/$label/warned" "$W/err.txt" 'not drawn — `Figure engine: wasm` never runs the installed tools'
	hasnt "strict/$label/no-tools-claimed" "$W/err.txt" 'the installed tools are used'
}
strict no-dist
strict will-not-load --mp-tikz-dist "$SCRATCH/dist-broken"
strict throws --mp-tikz-dist "$SCRATCH/dist-throws"
# LaTeX: MetaPost's PDF is refused (TiKZ is written natively, no tool involved).
W="$SCRATCH/strict-latex"
mkdir -p "$W"
figures "$W"
rm -f "$SCRATCH/ran.txt"
guarded "$W" process note.md --to latex -o note.tex --figure-engine wasm --mp-tikz-dist "$SCRATCH/dist-broken"
has   "strict/latex/exit-0" "$W/exit.txt" '0'
if [ -s "$SCRATCH/ran.txt" ]; then fail "strict/latex/no-tool-run" "$(cat "$SCRATCH/ran.txt")"; else pass "strict/latex/no-tool-run"; fi
hasnt "strict/latex/no-metapost-pdf" "$W/note.tex" 'MetaPost/'
has   "strict/latex/tikz-native" "$W/note.tex" '\begin{tikzpicture}'
# A full page: the marker's words are for a reader (the reason is the warning's),
# and the page carries the marker's quiet style (html-template.js).
W="$SCRATCH/strict-page"
mkdir -p "$W"
figures "$W"
guarded "$W" process note.md -o note.html --figure-engine wasm
has   "strict/page/tikz-words" "$W/note.html" '[TiKZ figure not drawn]'
has   "strict/page/metapost-words" "$W/note.html" '[MetaPost figure not drawn]'
hasnt "strict/page/reason-not-on-page" "$W/note.html" 'never runs the installed tools'
has   "strict/page/refusal-style" "$W/note.html" '.jmd-refused {'
# The control: auto, the same library failure, and the stand-ins are reached.
W="$SCRATCH/strict-control"
mkdir -p "$W"
figures "$W"
rm -f "$SCRATCH/ran.txt"
guarded "$W" process note.md --fragment -o note.html --figure-engine auto --mp-tikz-dist "$SCRATCH/dist-broken"
if grep -q lualatex "$SCRATCH/ran.txt" 2>/dev/null && grep -q mpost "$SCRATCH/ran.txt"; then pass "strict/control/auto-runs-the-tools"; else fail "strict/control/auto-runs-the-tools" "the stand-ins were not reached"; fi

DIST=${MP_TIKZ_DIST:-}
if [ -z "$DIST" ] || [ ! -f "$DIST/index.js" ]; then
	echo "SKIP  figure-engine/* library cases  (no MP_TIKZ_DIST pointing at an mp-tikz-wasm release dist/)"
	echo "figure-engine: $passed passed, $failed failed, 1 skipped"
	[ "$failed" -eq 0 ]
	exit
fi

# wasm DIR ENGINE ARGS… — a build with no TeX tools reachable; stderr to DIR/err.txt, exit code to DIR/exit.txt
wasm() {
	dir=$1; engine=$2; shift 2
	(cd "$dir" && env -i HOME="$SCRATCH/home" PATH=/usr/bin:/bin "$NODE" "$JMD" "$@" --figure-engine "$engine" --mp-tikz-dist "$DIST" >/dev/null 2>err.txt; echo $? >exit.txt)
}
srcs() { grep -o '<img[^>]*src="[^"]*"' "$1" | sed 's/.* src="//; s/"$//' | grep -v '^data:'; }
resolves() {
	list=$(srcs "$2")
	if [ -z "$list" ]; then fail "$1" "no <img src>"; return; fi
	missing=$(printf '%s\n' "$list" | while read -r s; do [ -f "$(dirname "$2")/$s" ] || echo "$s"; done)
	if [ -z "$missing" ]; then pass "$1"; else fail "$1" "not found: $missing"; fi
}

D="$SCRATCH/note"
mkdir -p "$D"
cat >"$D/note.md" <<'EOF'
---
Title: Figures
---

:::TiKZ
\draw[->] (0,0) -- (2,1) node[right]{$x^2$};
:::

@begin(metapost)
draw fullcircle scaled 2cm;
label(btex $y$ etex, (0,0));
@end(metapost)
EOF

# --- HTML: both figures drawn by the library -------------------------------------------------------
wasm "$D" wasm process note.md -o note.html
has "html/exit-0" "$D/exit.txt" '0'
if ls "$D/TiKZ/"*.svg >/dev/null 2>&1 && ls "$D/MetaPost/"*-1.svg >/dev/null 2>&1; then pass "html/figures-drawn"; else fail "html/figures-drawn" "$(ls "$D")"; fi
resolves "html/images-resolve" "$D/note.html"
if [ ! -s "$D/err.txt" ]; then pass "html/no-warnings"; else fail "html/no-warnings" "$(cat "$D/err.txt")"; fi
hasnt "html/no-refusal-style" "$D/note.html" '.jmd-refused'

# --- LaTeX: MetaPost's figure a PDF, through the library's TeX -----------------------------------------
wasm "$D" wasm process note.md --to latex -o note.tex
has "latex/exit-0" "$D/exit.txt" '0'
has "latex/metapost-pdf" "$D/note.tex" '\includegraphics[max width=\linewidth]{MetaPost/'
if command -v pdflatex >/dev/null 2>&1; then
	if (cd "$D" && pdflatex -interaction=nonstopmode -halt-on-error note.tex >/dev/null 2>&1); then pass "latex/compiles"
	else fail "latex/compiles" "$(grep -m3 '^!' "$D/note.log")"; fi
fi

# --- a host's own library (setFigureLibrary): the iPad's worker has no dist/ to load or fingerprint. The
#     same library under the dist's fingerprint draws the same figures under the same keys; under a
#     fingerprint of its own, keys of its own; a malformed one is warned and ignored. ------------------
L="$SCRATCH/hostlib"
for route in path host host-default bad switch unset; do
	mkdir -p "$L/$route"
	cp "$D/note.md" "$L/$route/"
	(cd "$L/$route" && env -i HOME="$SCRATCH/home" PATH=/usr/bin:/bin "$NODE" "$HERE/host-library.mjs" "$REPO" "$route" "$DIST" note.md note.html html >/dev/null 2>err.txt; echo $? >exit.txt
	 env -i HOME="$SCRATCH/home" PATH=/usr/bin:/bin "$NODE" "$HERE/host-library.mjs" "$REPO" "$route" "$DIST" note.md note.tex latex >/dev/null 2>>err.txt; echo $? >>exit.txt)
done
if [ "$(cat "$L/host/exit.txt" "$L/path/exit.txt" | tr -d '\n')" = 0000 ] && [ ! -s "$L/host/err.txt" ] && [ ! -s "$L/path/err.txt" ]; then pass "host-library/builds"
else fail "host-library/builds" "$(cat "$L/path/err.txt" "$L/host/err.txt")"; fi
# (The page's inverse-search script names the note's own folder.)
sed "s#$L/path/#FOLDER/#g" "$L/path/note.html" >"$L/path.html"
sed "s#$L/host/#FOLDER/#g" "$L/host/note.html" >"$L/host.html"
if cmp -s "$L/path.html" "$L/host.html" && cmp -s "$L/path/note.tex" "$L/host/note.tex"; then pass "host-library/same-output"
else fail "host-library/same-output" "$(diff "$L/path.html" "$L/host.html" | head -4)" "$(diff "$L/path/note.tex" "$L/host/note.tex" | head -4)"; fi
if [ "$(cd "$L/path" && ls TiKZ MetaPost)" = "$(cd "$L/host" && ls TiKZ MetaPost)" ] && [ -n "$(ls "$L/host/TiKZ")" ]; then pass "host-library/same-keys"
else fail "host-library/same-keys" "path: $(cd "$L/path" && ls TiKZ MetaPost | tr '\n' ' ')" "host: $(cd "$L/host" && ls TiKZ MetaPost | tr '\n' ' ')"; fi
if diff -r "$L/path/TiKZ" "$L/host/TiKZ" >/dev/null && cmp -s "$L/path/MetaPost/$(cd "$L/path/MetaPost" && ls *.svg | head -1)" "$L/host/MetaPost/$(cd "$L/host/MetaPost" && ls *.svg | head -1)"; then pass "host-library/same-figures"
else fail "host-library/same-figures" "the SVGs differ"; fi
if [ "$(tr -d '\n' <"$L/host-default/exit.txt")" = 00 ] && [ ! -s "$L/host-default/err.txt" ] && ls "$L/host-default/TiKZ/"*.svg >/dev/null 2>&1; then pass "host-library/default-bundles"
else fail "host-library/default-bundles" "$(cat "$L/host-default/err.txt")"; fi
if [ "$(cd "$L/host-default" && ls TiKZ)" != "$(cd "$L/path" && ls TiKZ)" ]; then pass "host-library/own-fingerprint-own-keys"
else fail "host-library/own-fingerprint-own-keys" "the same keys under another fingerprint"; fi
has   "host-library/bad-warned" "$L/bad/err.txt" '`figureLibrary` is { load: a function, fingerprint: a string, bundles?: names } — ignored'
# The library set last is the build's (each call forgets the one before); null, the dist's.
for route in switch unset; do
	sed "s#$L/$route/#FOLDER/#g" "$L/$route/note.html" >"$L/$route.html"
	if [ "$(tr -d '\n' <"$L/$route/exit.txt")" = 00 ] && [ ! -s "$L/$route/err.txt" ] && cmp -s "$L/path.html" "$L/$route.html" \
		&& cmp -s "$L/path/note.tex" "$L/$route/note.tex" && [ "$(cd "$L/path" && ls TiKZ MetaPost)" = "$(cd "$L/$route" && ls TiKZ MetaPost)" ]; then
		pass "host-library/$route-last-set-wins"
	else fail "host-library/$route-last-set-wins" "$(cat "$L/$route/err.txt")" "$(cd "$L/$route" && ls TiKZ MetaPost | tr '\n' ' ')"; fi
done
has   "host-library/bad-refused" "$L/bad/note.html" 'data-jmd-refused="TiKZ"'

# --- the library's renders never mix with the tools': keyed by the library too ------------------------
ext=$(cd "$D" && ls TiKZ/*.svg | wc -l | tr -d ' ')
(cd "$D" && HOME="$SCRATCH/home" "$NODE" "$JMD" process note.md -o tools.html >/dev/null 2>&1)
if command -v lualatex >/dev/null 2>&1; then
	both=$(cd "$D" && ls TiKZ/*.svg | wc -l | tr -d ' ')
	if [ "$both" = $((ext + 1)) ]; then pass "cache/kept-apart"; else fail "cache/kept-apart" "$ext SVG(s) after the library, $both after the tools too"; fi
fi

# --- fonts: a preamble's family is handed over; all four of a .ttc's faces resolve ---------------------
if [ -f /System/Library/Fonts/Optima.ttc ]; then
	F="$SCRATCH/font"
	mkdir -p "$F/.jmarkdown"
	printf '{ "LaTeX preamble": ["\\\\usepackage{fontspec}", "\\\\setmainfont{Optima}"] }\n' >"$F/.jmarkdown/config.json"
	printf -- '---\nTitle: Fonts\n---\n\n:::TiKZ\n\\node {Regular \\textbf{Bold} \\textit{Italic}};\n:::\n' >"$F/note.md"
	wasm "$F" auto process note.md --fragment -o note.html
	has   "fonts/exit-0" "$F/exit.txt" '0'
	hasnt "fonts/all-faces-resolved" "$F/err.txt" 'could not resolve'
	if ls "$F/TiKZ/"*.svg >/dev/null 2>&1; then pass "fonts/drawn"; else fail "fonts/drawn" "no SVG"; fi
fi

# --- under wasm, a face the library cannot resolve is warned (bold and italic came out regular, unsaid) ----
# Times New Roman's faces are separate files; the folder search hands over the regular one alone.
if [ -f "/System/Library/Fonts/Supplemental/Times New Roman.ttf" ]; then
	R="$SCRATCH/face"
	mkdir -p "$R/.jmarkdown"
	printf '{ "LaTeX preamble": ["\\\\usepackage{fontspec}", "\\\\setmainfont{Times New Roman}"] }\n' >"$R/.jmarkdown/config.json"
	printf -- '---\nTitle: Face\n---\n\n:::TiKZ\n\\node {Regular \\textbf{Bold}};\n:::\n' >"$R/note.md"
	wasm "$R" wasm process note.md --fragment -o note.html
	has      "face-miss/exit-0" "$R/exit.txt" '0'
	has      "face-miss/warned" "$R/err.txt" 'a TiKZ figure names a font mp-tikz-wasm could not resolve (Times New Roman/'
	has      "face-miss/drawn-without" "$R/err.txt" '— drawn without it'
	resolves "face-miss/drawn" "$R/note.html"
fi

# --- the host's own font index (processFile's figureFonts): whole families, a face per file included ------
# The folder search hands over Times New Roman's regular file alone (face-miss,
# above); a host that gives the family's four files gets the real faces. One
# build per process (processFile's design), so one call each.
TNR="/System/Library/Fonts/Supplemental/Times New Roman"
if [ -f "$TNR.ttf" ] && [ -f "$TNR Bold.ttf" ] && [ -f "$TNR Italic.ttf" ] && [ -f "$TNR Bold Italic.ttf" ]; then
	O="$SCRATCH/host-fonts"
	mkdir -p "$O/.jmarkdown"
	printf '{ "LaTeX preamble": ["\\\\usepackage{fontspec}", "\\\\setmainfont{Times New Roman}"] }\n' >"$O/.jmarkdown/config.json"
	printf -- '---\nTitle: Host fonts\n---\n\n:::TiKZ\n\\node {Regular \\textbf{Bold} \\textit{Italic}};\n:::\n' >"$O/note.md"
	# host NAME PATH OPTIONS RESOLVER — one processFile call in $O; NAME.html, NAME.err, NAME.exit
	host() {
		(cd "${HOSTDIR:-$O}" && env -i HOME="$SCRATCH/home" PATH="$2" "$NODE" --input-type=module -e "
			import { processFile } from '$JMD';
			import fs from 'fs';
			const TNR = '$TNR';
			const FOUR = [TNR + '.ttf', TNR + ' Bold.ttf', TNR + ' Italic.ttf', TNR + ' Bold Italic.ttf'];
			$4
			await processFile('note.md', { to: 'html', fragment: true, output: '$1.html', $3 figureFonts });
		" >/dev/null 2>"$1.err"; echo $? >"$1.exit")
	}
	svg() { ls "${HOSTDIR:-$O}/cache-$1/TiKZ/"*.svg 2>/dev/null | head -1; }
	same() {   # same LABEL A B — the two builds drew the same SVG, under the same name
		a=$(svg "$2"); b=$(svg "$3")
		if [ -n "$a" ] && [ "$(basename "$a")" = "$(basename "${b:-none}")" ] && cmp -s "$a" "$b"; then pass "$1"
		else fail "$1" "$2: $(basename "${a:-none}"), $3: $(basename "${b:-none}")"; fi
	}
	WASM="figureEngine: 'wasm', mpTikzDist: '$DIST',"
	host none /usr/bin:/bin "$WASM cacheDir: 'cache-none'," "const figureFonts = undefined;"
	host fn   /usr/bin:/bin "$WASM cacheDir: 'cache-fn',"   "const figureFonts = (family) => family === 'Times New Roman' ? FOUR : [];"
	host obj  /usr/bin:/bin "$WASM cacheDir: 'cache-obj',"  "const figureFonts = { 'times new roman': FOUR };"
	host auto /usr/bin:/bin "figureEngine: 'auto', mpTikzDist: '$DIST', cacheDir: 'cache-auto'," "const figureFonts = async () => FOUR;"
	has "host-fonts/none/regular-only" "$O/none.err" 'could not resolve (Times New Roman/'
	has "host-fonts/function/exit-0" "$O/fn.exit" '0'
	if [ ! -s "$O/fn.err" ]; then pass "host-fonts/function/every-face-resolved"; else fail "host-fonts/function/every-face-resolved" "$(cat "$O/fn.err")"; fi
	if [ -n "$(svg fn)" ] && [ -n "$(svg none)" ] && ! cmp -s "$(svg fn)" "$(svg none)"; then pass "host-fonts/function/real-faces-drawn"
	else fail "host-fonts/function/real-faces-drawn" "the same drawing as the regular face alone"; fi
	if [ -n "$(svg obj)" ] && cmp -s "$(svg fn)" "$(svg obj)" && [ ! -s "$O/obj.err" ]; then pass "host-fonts/object-any-case"
	else fail "host-fonts/object-any-case" "$(cat "$O/obj.err")"; fi
	# auto with every face resolved: the library draws it (no tools are on PATH), unwarned
	if [ -n "$(svg auto)" ] && cmp -s "$(svg fn)" "$(svg auto)" && [ ! -s "$O/auto.err" ]; then pass "host-fonts/auto-library-draws"
	else fail "host-fonts/auto-library-draws" "$(cat "$O/auto.err")"; fi

	# A host that fails to answer: the folder search, as without the option, and a warning.
	host throws    /usr/bin:/bin "$WASM cacheDir: 'cache-throws',"    "const figureFonts = () => { throw new Error('index broke'); };"
	host nothing   /usr/bin:/bin "$WASM cacheDir: 'cache-nothing',"   "const figureFonts = () => undefined;"
	host malformed /usr/bin:/bin "$WASM cacheDir: 'cache-malformed'," "const figureFonts = 42;"
	for v in throws nothing malformed; do
		has  "host-fonts/$v/exit-0" "$O/$v.exit" '0'
		same "host-fonts/$v/as-without" none "$v"
		has  "host-fonts/$v/face-miss-still-warned" "$O/$v.err" 'could not resolve (Times New Roman/'
	done
	has "host-fonts/throws/warned" "$O/throws.err" "the host's \`figureFonts\` threw (index broke) for \`Times New Roman\` — the font folders' Times New Roman.ttf is used"
	has "host-fonts/nothing/warned" "$O/nothing.err" "the host's \`figureFonts\` gave no list of files for \`Times New Roman\`"
	has "host-fonts/malformed/warned" "$O/malformed.err" '`figureFonts` is a function or an object (family → files) — ignored'
	# An empty list is the host's answer — none — and stands (its size cap): nothing is handed over.
	host empty /usr/bin:/bin "$WASM cacheDir: 'cache-empty'," "const figureFonts = () => [];"
	has   "host-fonts/empty/exit-0" "$O/empty.exit" '0'
	hasnt "host-fonts/empty/no-folder-search" "$O/empty.err" "the host's"
	has   "host-fonts/empty/face-miss-warned" "$O/empty.err" 'could not resolve (Times New Roman/'
	# (no regular face either, which the folder search would have found)
	has   "host-fonts/empty/nothing-handed-over" "$O/empty.err" '— not drawn (see the error box)'
	# A file that cannot be read is left out, warned; the rest are handed over.
	host unreadable /usr/bin:/bin "$WASM cacheDir: 'cache-unreadable'," "const figureFonts = () => ['$SCRATCH/no-such-font.ttf', ...FOUR];"
	has "host-fonts/unreadable/exit-0" "$O/unreadable.exit" '0'
	has "host-fonts/unreadable/warned" "$O/unreadable.err" "gave \`$SCRATCH/no-such-font.ttf\` for \`Times New Roman\`, which cannot be read — left out"
	hasnt "host-fonts/unreadable/rest-given" "$O/unreadable.err" 'could not resolve'

	# The cache key: a render made with the regular face alone is not reused once
	# the host's fonts are given, and theirs is reused while they stay the same.
	host key-without /usr/bin:/bin "$WASM cacheDir: 'cache-key'," "const figureFonts = undefined;"
	host key-with    /usr/bin:/bin "$WASM cacheDir: 'cache-key'," "const figureFonts = () => FOUR;"
	host key-again   /usr/bin:/bin "$WASM cacheDir: 'cache-key'," "const figureFonts = () => FOUR;"
	count=$(ls "$O/cache-key/TiKZ/"*.svg 2>/dev/null | wc -l | tr -d ' ')
	if [ "$count" = 2 ]; then pass "host-fonts/key/own-render"; else fail "host-fonts/key/own-render" "$count SVG(s) in the cache, not 2"; fi
	if [ ! -s "$O/key-with.err" ] && [ "$(srcs "$O/key-with.html")" != "$(srcs "$O/key-without.html")" ]; then pass "host-fonts/key/not-the-regular-render"
	else fail "host-fonts/key/not-the-regular-render" "$(srcs "$O/key-with.html")"; fi
	if [ "$(srcs "$O/key-again.html")" = "$(srcs "$O/key-with.html")" ]; then pass "host-fonts/key/reused"; else fail "host-fonts/key/reused" "$(srcs "$O/key-again.html")"; fi
	# A figure that names no family keeps its key whatever the host gives.
	HOSTDIR="$SCRATCH/host-fonts-plain"
	mkdir -p "$HOSTDIR"
	printf -- '---\nTitle: Plain\n---\n\n:::TiKZ\n\\draw (0,0) -- (1,1);\n:::\n' >"$HOSTDIR/note.md"
	host plain-without /usr/bin:/bin "$WASM cacheDir: 'cache-plain-without'," "const figureFonts = undefined;"
	host plain-with    /usr/bin:/bin "$WASM cacheDir: 'cache-plain-with',"    "const figureFonts = () => FOUR;"
	same "host-fonts/key/no-family-unchanged" plain-without plain-with
	HOSTDIR=

	# Under external the option does nothing: never called, and the same page.
	if command -v lualatex >/dev/null 2>&1; then
		host ext-none "$PATH" "cacheDir: 'cache-ext-none'," "const figureFonts = undefined;"
		host ext-host "$PATH" "cacheDir: 'cache-ext-host'," "const figureFonts = () => { fs.writeFileSync('called.txt', 'called'); return FOUR; };"
		if [ ! -e "$O/called.txt" ]; then pass "host-fonts/external/never-called"; else fail "host-fonts/external/never-called" "the resolver ran"; fi
		same "host-fonts/external/same-figure" ext-none ext-host
		if [ "$(sed 's/cache-ext-[a-z]*/CACHE/g' "$O/ext-none.html")" = "$(sed 's/cache-ext-[a-z]*/CACHE/g' "$O/ext-host.html")" ]; then pass "host-fonts/external/same-page"
		else fail "host-fonts/external/same-page" "the pages differ"; fi
		# (dvisvgm prints its own timing: "1 of 1 page converted in 0.35 seconds")
		if [ "$(sed -E 's/ in [0-9.]+ seconds//' "$O/ext-none.err")" = "$(sed -E 's/ in [0-9.]+ seconds//' "$O/ext-host.err")" ]; then pass "host-fonts/external/same-stderr"
		else fail "host-fonts/external/same-stderr" "$(cat "$O/ext-host.err")"; fi
	fi

	# No route but processFile's option: a header, a folder's config and the global config of that name do nothing.
	Q="$SCRATCH/host-fonts-config"
	mkdir -p "$Q/.jmarkdown" "$Q/home/.jmarkdown"
	FONTS_JSON="{ \"Times New Roman\": [\"$TNR.ttf\", \"$TNR Bold.ttf\", \"$TNR Italic.ttf\", \"$TNR Bold Italic.ttf\"] }"
	printf '{ "LaTeX preamble": ["\\\\usepackage{fontspec}", "\\\\setmainfont{Times New Roman}"], "figureFonts": %s, "Figure fonts": %s }\n' "$FONTS_JSON" "$FONTS_JSON" >"$Q/.jmarkdown/config.json"
	printf '{ "figureFonts": %s, "Figure fonts": %s }\n' "$FONTS_JSON" "$FONTS_JSON" >"$Q/home/.jmarkdown/config.json"
	printf -- '---\nTitle: Not here\nfigureFonts: %s Bold.ttf\nFigure fonts: %s Bold.ttf\n---\n\n:::TiKZ\n\\node {Regular \\textbf{Bold}};\n:::\n' "$TNR" "$TNR" >"$Q/note.md"
	(cd "$Q" && env -i HOME="$Q/home" PATH=/usr/bin:/bin "$NODE" "$JMD" process note.md --fragment -o note.html --figure-engine wasm --mp-tikz-dist "$DIST" >/dev/null 2>err.txt; echo $? >exit.txt)
	has "host-fonts/config-and-header/exit-0" "$Q/exit.txt" '0'
	has "host-fonts/config-and-header/ignored" "$Q/err.txt" 'could not resolve (Times New Roman/'
fi

# --- a font no folder holds: under auto, that figure goes to the installed tools, with a warning ------
# No installed TeX has this family either, so the tools fail too: the warning says
# so (it used to say "drawn by the installed tools instead" above the error box).
if command -v lualatex >/dev/null 2>&1; then
	M="$SCRATCH/miss"
	mkdir -p "$M/.jmarkdown"
	printf '{ "LaTeX preamble": ["\\\\usepackage{fontspec}", "\\\\setmainfont{NoSuchFamilyAnywhere}"] }\n' >"$M/.jmarkdown/config.json"
	printf -- '---\nTitle: Miss\n---\n\n:::TiKZ\n\\node {text};\n:::\n' >"$M/note.md"
	(cd "$M" && HOME="$SCRATCH/home" "$NODE" "$JMD" process note.md --fragment -o note.html --figure-engine auto --mp-tikz-dist "$DIST" >/dev/null 2>err.txt; echo $? >exit.txt)
	has "font-miss/exit-0" "$M/exit.txt" '0'
	has "font-miss/warned" "$M/err.txt" 'a TiKZ figure names a font mp-tikz-wasm could not resolve — and the installed tools could not draw it either (see the error box)'
	has "font-miss/error-box" "$M/note.html" 'tikz-error'
fi

# --- the same with no tools on PATH: the warning says they are not there -------------------------------
T="$SCRATCH/notools"
mkdir -p "$T/.jmarkdown"
printf '{ "LaTeX preamble": ["\\\\usepackage{fontspec}", "\\\\setmainfont{NoSuchFamilyAnywhere}"] }\n' >"$T/.jmarkdown/config.json"
printf -- '---\nTitle: No tools\n---\n\n:::TiKZ\n\\node {text};\n:::\n' >"$T/note.md"
wasm "$T" auto process note.md --fragment -o note.html
has   "no-tools/exit-0" "$T/exit.txt" '0'
has   "no-tools/warned" "$T/err.txt" 'a TiKZ figure names a font mp-tikz-wasm could not resolve — and the installed tools are not available, so it is not drawn (see the error box)'
hasnt "no-tools/not-claimed-drawn" "$T/err.txt" 'drawn by the installed tools instead'

# --- a package the library's bundles leave out (siunitx): under auto, the installed tools draw it ---------
if command -v lualatex >/dev/null 2>&1 && kpsewhich siunitx.sty >/dev/null 2>&1; then
	P="$SCRATCH/package"
	mkdir -p "$P/.jmarkdown"
	printf '{ "LaTeX preamble": ["\\\\usepackage{siunitx}"] }\n' >"$P/.jmarkdown/config.json"
	printf -- '---\nTitle: Package\n---\n\n:::TiKZ\n\\node {\\SI{3}{\\metre}};\n:::\n' >"$P/note.md"
	(cd "$P" && HOME="$SCRATCH/home" "$NODE" "$JMD" process note.md --fragment -o note.html --figure-engine auto --mp-tikz-dist "$DIST" >/dev/null 2>err.txt; echo $? >exit.txt)
	has      "missing-file/exit-0" "$P/exit.txt" '0'
	has      "missing-file/warned" "$P/err.txt" 'a TiKZ figure needs `siunitx.sty`, which mp-tikz-wasm does not have — drawn by the installed tools instead'
	hasnt    "missing-file/no-error-box" "$P/note.html" 'tikz-error'
	resolves "missing-file/drawn" "$P/note.html"
fi

# --- a missing file whose name TeX's log wraps at 79 columns: named whole, on one line ---------------------
L="$SCRATCH/long-name"
mkdir -p "$L/.jmarkdown"
printf '{ "LaTeX preamble": ["\\\\usepackage{a-package-name-that-is-long-enough-to-wrap-past-the-seventy-nine-col}"] }\n' >"$L/.jmarkdown/config.json"
printf -- '---\nTitle: Long name\n---\n\n:::TiKZ\n\\node {x};\n:::\n' >"$L/note.md"
wasm "$L" auto process note.md --fragment -o note.html
has "long-name/exit-0" "$L/exit.txt" '0'
has "long-name/named-whole" "$L/err.txt" 'a TiKZ figure needs `a-package-name-that-is-long-enough-to-wrap-past-the-seventy-nine-col.sty`, which mp-tikz-wasm does not have'

# --- a TikZ error: the error box, a clean exit (process.exitCode untouched) ---------------------------
E="$SCRATCH/error"
mkdir -p "$E"
printf -- '---\nTitle: Error\n---\n\n:::TiKZ\n\\draw (0,0) -- \\undefinedcommand;\n:::\n\nAfter it.\n' >"$E/note.md"
wasm "$E" wasm process note.md --fragment -o note.html
has "error/exit-0" "$E/exit.txt" '0'
has "error/box" "$E/note.html" 'tikz-error'
has "error/rest-renders" "$E/note.html" 'After it.'

# --- MetaPost empty-cache: the folder emptied BEFORE any figure is filled, so all are drawn ------------
C="$SCRATCH/empty"
mkdir -p "$C"
printf -- '---\nTitle: Empty\n---\n\n@begin(metapost)\ndraw unitsquare scaled 1cm;\n@end(metapost)\n\n@begin(metapost){empty-cache}\ndraw unitsquare scaled 2cm;\n@end(metapost)\n' >"$C/note.md"
wasm "$C" wasm process note.md --fragment -o note.html
resolves "empty-cache/every-figure-drawn" "$C/note.html"

# --- a figure is named by its own beginfig(N), as the tools' outputtemplate "%j-%c" names theirs ----------
G="$SCRATCH/charcode"
mkdir -p "$G"
printf -- '---\nTitle: Numbered\n---\n\n@begin(metapost)\nbeginfig(7);\ndraw unitsquare scaled 1cm;\nendfig;\n@end(metapost)\n' >"$G/note.md"
wasm "$G" wasm process note.md --fragment -o note.html
if ls "$G/MetaPost/"*-7.svg >/dev/null 2>&1; then pass "metapost/named-by-beginfig"; else fail "metapost/named-by-beginfig" "$(ls "$G/MetaPost")"; fi
resolves "metapost/named-by-beginfig-resolves" "$G/note.html"

# --- a book through the async parse ---------------------------------------------------------------------
K="$SCRATCH/book"
mkdir -p "$K/chapters"
printf -- '---\nTitle: A Book\n---\n\n@chapter+(chapters/one.md)\n@chapter+(chapters/two.md)\n' >"$K/master.md"
printf '# One\n\n:::TiKZ\n\\draw (0,0) circle (1);\n:::\n\nSee @ref[eq:two].\n' >"$K/chapters/one.md"
printf '# Two\n\n@begin(equation){id=eq:two}\nx = 1\n@end(equation)\n\n@begin(metapost)\ndraw unitsquare scaled 1cm;\n@end(metapost)\n' >"$K/chapters/two.md"
wasm "$K" wasm process master.md --fragment -o book.html
has      "book/exit-0" "$K/exit.txt" '0'
has      "book/chapters" "$K/book.html" 'data-file="chapters/two.md"'
has      "book/cross-chapter-ref" "$K/book.html" 'href="#eq:two">2.1</a>'
resolves "book/figures" "$K/book.html"

# --- asked for without a dist: warned, and the installed tools draw (when there are any) ---------------
N="$SCRATCH/nodist"
mkdir -p "$N"
printf -- '---\nTitle: No dist\n---\n\nNo figures.\n' >"$N/note.md"
(cd "$N" && HOME="$SCRATCH/home" "$NODE" "$JMD" process note.md --fragment -o note.html --figure-engine auto >/dev/null 2>err.txt)
has "no-dist/warned" "$N/err.txt" 'Figure engine: auto needs `MP-TikZ dist`'

# --- a header cannot choose it ---------------------------------------------------------------------------
H="$SCRATCH/header"
mkdir -p "$H"
printf -- '---\nTitle: Header\nFigure engine: wasm\n---\n\nText.\n' >"$H/note.md"
(cd "$H" && HOME="$SCRATCH/home" "$NODE" "$JMD" process note.md --fragment -o note.html >/dev/null 2>err.txt)
has "header/ignored" "$H/err.txt" 'Figure engine: the figure engine is set in .jmarkdown/config.json or by the host'

echo "figure-engine: $passed passed, $failed failed, 0 skipped"
[ "$failed" -eq 0 ]
