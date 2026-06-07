#!/bin/sh
# Full-document LaTeX assembly checks (toolchain-free; gates CI).
#
# tests/features exercises the --fragment body rendering of each construct.
# This suite exercises the DEFAULT (non-fragment) LaTeX path and asserts the
# document WRAPPER that index.js now produces:
#   - \documentclass with user class + options
#   - the assembled preamble: engine font/encoding defaults + usage-driven
#     feature packages (minted, hyperref, soul…) + user `Packages`
#   - frontmatter (\title/\maketitle from metadata)
#   - \begin{document} … \end{document}
#
# It does NOT compile anything — that is the opt-in tests/latex-compile suite.

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-latex-document.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "latex-document  (scratch=$SCRATCH)"
echo "=========================================="

pass=0
fail=0
TEX=

# render <name>: produce the FULL document for <name>.jmd into $TEX.
render() {
	TEX="$SCRATCH/$1.tex"
	if ! node "$JMD" process "$HERE/$1.jmd" --to latex -o "$TEX" >/dev/null 2>"$SCRATCH/$1.stderr"; then
		echo "FAIL  $1  (jmarkdown exited non-zero)"
		sed 's/^/    | /' "$SCRATCH/$1.stderr"
		fail=$((fail + 1))
		return 1
	fi
	return 0
}

# want <label> <file> <fixed-string> — assert the string is present.
want() {
	if grep -Fq "$3" "$2"; then
		echo "PASS  $1"
		pass=$((pass + 1))
	else
		echo "FAIL  $1  (missing: $3)"
		fail=$((fail + 1))
	fi
}

# absent <label> <file> <fixed-string> — assert the string is NOT present.
absent() {
	if grep -Fq "$3" "$2"; then
		echo "FAIL  $1  (should be absent: $3)"
		fail=$((fail + 1))
	else
		echo "PASS  $1"
		pass=$((pass + 1))
	fi
}

# --- article.jmd: the main path (class options, all preamble sources, frontmatter) ---
if render article; then
	want "article/documentclass"  "$TEX" '\documentclass[11pt]{article}'
	want "article/inputenc"       "$TEX" '\usepackage[utf8]{inputenc}'
	want "article/fontenc"        "$TEX" '\usepackage[T1]{fontenc}'
	want "article/minted (code)"  "$TEX" '\usepackage{minted}'
	want "article/soul (==hl==)"  "$TEX" '\usepackage{soul}'
	want "article/amsmath (user)" "$TEX" '\usepackage{amsmath}'
	want "article/hyperref (link)" "$TEX" '\usepackage{hyperref}'
	want "article/title"          "$TEX" '\title{A Test Document}'
	want "article/maketitle"      "$TEX" '\maketitle'
	want "article/begin document" "$TEX" '\begin{document}'
	want "article/end document"   "$TEX" '\end{document}'
fi

# --- engine-lua.jmd: the engine tunes font/encoding defaults; class falls back ---
if render engine-lua; then
	want   "lua/fontspec"      "$TEX" '\usepackage{fontspec}'
	absent "lua/no inputenc"   "$TEX" '\usepackage[utf8]{inputenc}'
	want   "lua/default class" "$TEX" '\documentclass{article}'
fi

# --- frontmatter-escape.jmd: plain-text Title/Author escape &/# before \title{} ---
if render frontmatter-escape; then
	want "escape/title"  "$TEX" '\title{Risk \& Reward \#1}'
	want "escape/author" "$TEX" '\author{A \& B}'
fi

# --- cref-fullwords.jmd: a figure + :cref pulls cleveref AND the \crefname
#     overrides that make LaTeX spell floats out ("figure 1", not "fig. 1"),
#     matching the HTML cross-ref wording. ---
if render cref-fullwords; then
	want "cref/cleveref"       "$TEX" '\usepackage{cleveref}'
	want "cref/crefname fig"   "$TEX" '\crefname{figure}{figure}{figures}'
	want "cref/Crefname fig"   "$TEX" '\Crefname{figure}{Figure}{Figures}'
fi

echo
echo "latex-document: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
