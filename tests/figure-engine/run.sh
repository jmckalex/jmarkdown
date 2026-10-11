#!/bin/sh
# The figure engine (src/figure-engine.js): TikZ and MetaPost drawn in-process
# by mp-tikz-wasm, from a release's dist/ — only when asked (--figure-engine
# auto|wasm with --mp-tikz-dist). Its builds run with PATH stripped to
# /usr/bin:/bin, so no lualatex, dvisvgm, mpost or mptopdf can be reached: what
# they draw, the library drew.
#
# Needs a release: MP_TIKZ_DIST=<…/mp-tikz-wasm-0.4.0/dist>. Without one every
# case is SKIPPED (not failed), as the diagrams suite skips missing tools.
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

DIST=${MP_TIKZ_DIST:-}
if [ -z "$DIST" ] || [ ! -f "$DIST/index.js" ]; then
	echo "SKIP  figure-engine/*  (no MP_TIKZ_DIST pointing at an mp-tikz-wasm release dist/)"
	echo "figure-engine: 0 passed, 0 failed, 1 skipped"
	exit 0
fi

SCRATCH=$(mktemp -d -t jmd-figure-engine.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM
mkdir -p "$SCRATCH/home"

passed=0
failed=0
pass() { printf 'PASS  figure-engine/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  figure-engine/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
has()   { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected: $3"; fi; }
hasnt() { if grep -qF -- "$3" "$2"; then fail "$1" "unexpected: $(grep -F -- "$3" "$2" | head -2)"; else pass "$1"; fi; }

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

# --- LaTeX: MetaPost's figure a PDF, through the library's TeX -----------------------------------------
wasm "$D" wasm process note.md --to latex -o note.tex
has "latex/exit-0" "$D/exit.txt" '0'
has "latex/metapost-pdf" "$D/note.tex" '\includegraphics[max width=\linewidth]{MetaPost/'
if command -v pdflatex >/dev/null 2>&1; then
	if (cd "$D" && pdflatex -interaction=nonstopmode -halt-on-error note.tex >/dev/null 2>&1); then pass "latex/compiles"
	else fail "latex/compiles" "$(grep -m3 '^!' "$D/note.log")"; fi
fi

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

# --- a font no folder holds: under auto, that figure goes to the installed tools, with a warning ------
if command -v lualatex >/dev/null 2>&1; then
	M="$SCRATCH/miss"
	mkdir -p "$M/.jmarkdown"
	printf '{ "LaTeX preamble": ["\\\\usepackage{fontspec}", "\\\\setmainfont{NoSuchFamilyAnywhere}"] }\n' >"$M/.jmarkdown/config.json"
	printf -- '---\nTitle: Miss\n---\n\n:::TiKZ\n\\node {text};\n:::\n' >"$M/note.md"
	(cd "$M" && HOME="$SCRATCH/home" "$NODE" "$JMD" process note.md --fragment -o note.html --figure-engine auto --mp-tikz-dist "$DIST" >/dev/null 2>err.txt; echo $? >exit.txt)
	has "font-miss/exit-0" "$M/exit.txt" '0'
	has "font-miss/warned" "$M/err.txt" 'a TiKZ figure names a font mp-tikz-wasm could not resolve — drawn by the installed tools instead'
fi

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
