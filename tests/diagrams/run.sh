#!/bin/sh
# Cached diagrams in LaTeX (src/mermaid.js, src/metapost.js): the PDFs the
# engine caches beside the note are included by a path relative to the .tex's
# folder (latex-graphics.js texCachePath), never by an absolute one, which put
# the user's folders into the .tex and, under pdfLaTeX, into the PDF
# (/PTEX.FileName). On stdout the absolute path stays, with a warning. A
# mermaid diagram mmdc cannot render is left out with a build warning naming
# it, and leaves no partial PDF in the cache. And the output compiles: `max
# width` needs adjustbox's `export` option.
#
# A suite rather than feature fixtures: each case writes a cache folder beside
# its document, and the paths are the scratch folder's. A part whose tools are
# missing (mmdc; mpost and mptopdf; pdflatex) is skipped, not failed. HOME is
# a scratch folder, so a global config plays no part; mmdc's headless browser
# is found through PUPPETEER_CACHE_DIR, taken from the real HOME first.
#
# Usage:  sh tests/diagrams/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"
NODE=$(command -v node)
export PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-$HOME/.cache/puppeteer}"

SCRATCH=$(mktemp -d -t jmd-diagrams.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM
# Node reports the folder by its real path (/private/var/… on macOS).
REAL=$(cd "$SCRATCH" && pwd -P)

echo "=========================================="
echo "diagrams  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0
skipped=0
pass() { printf 'PASS  diagrams/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  diagrams/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
skip() { printf 'SKIP  diagrams/%s (%s)\n' "$1" "$2"; skipped=$((skipped + 1)); }
has()   { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected: $3"; fi; }
hasnt() { if grep -qF -- "$3" "$2"; then fail "$1" "unexpected: $(grep -F -- "$3" "$2" | head -2)"; else pass "$1"; fi; }
count() { n=$(grep -cF -- "$3" "$2"); if [ "$n" = "$4" ]; then pass "$1"; else fail "$1" "expected $4 of: $3 (found $n)"; fi; }

mkdir -p "$SCRATCH/home"
jmd() {   # jmd DIR ARGS… — run jmarkdown in DIR; stderr to DIR/err.txt
	dir=$1; shift
	(cd "$dir" && HOME="$SCRATCH/home" "$NODE" "$JMD" "$@" >/dev/null 2>"$dir/err.txt")
}

# Does mmdc render here? (It needs its headless browser.) mpost and mptopdf?
have_mmdc=no
if command -v mmdc >/dev/null 2>&1; then
	printf 'graph TD\n  A --> B\n' >"$SCRATCH/probe.mmd"
	HOME="$SCRATCH/home" mmdc -i "$SCRATCH/probe.mmd" -o "$SCRATCH/probe.pdf" >/dev/null 2>&1 && have_mmdc=yes
fi
have_mp=no
command -v mpost >/dev/null 2>&1 && command -v mptopdf >/dev/null 2>&1 && have_mp=yes
have_tex=no
command -v pdflatex >/dev/null 2>&1 && have_tex=yes

# --- a single file, its .tex written into build/ -------------------------------------------------

D="$SCRATCH/note"
mkdir -p "$D/build"
cat >"$D/note.md" <<'EOF'
---
Title: Diagrams
---

@begin(mermaid)
graph TD
  A --> B
@end(mermaid)

:::mermaid
graph LR
  C --> D
:::

@begin(metapost)
draw fullcircle scaled 2cm;
@end(metapost)

@begin(mermaid)
this is not mermaid
@end(mermaid)
EOF
jmd "$D" process note.md --to latex -o build/note.tex || fail "single/exit" "$(cat "$D/err.txt")"
T="$D/build/note.tex"
hasnt "single/no-absolute-path" "$T" "$REAL"
if [ "$have_mmdc" = yes ]; then
	count "single/mermaid-from-build" "$T" '\includegraphics[max width=\linewidth]{../mermaid/' 2
	has   "mmdc-failure/warned" "$D/err.txt" 'mermaid: "this is not mermaid" left out of the LaTeX — mmdc failed: '
	n=$(ls "$D/mermaid" | grep -c '\.pdf$')
	if [ "$n" = 2 ]; then pass "mmdc-failure/no-partial-pdf"; else fail "mmdc-failure/no-partial-pdf" "$n PDFs cached, 2 expected"; fi
else
	skip "single/mermaid-from-build" "mmdc cannot render here"
fi
if [ "$have_mp" = yes ]; then
	has   "single/metapost-from-build" "$T" '\includegraphics[max width=\linewidth]{../MetaPost/'
else
	skip "single/metapost-from-build" "no mpost/mptopdf"
fi
has   "single/adjustbox-export" "$T" '\usepackage[export]{adjustbox}'

# Compiled where it stands, with object streams off so /PTEX.FileName can be
# read: every included file is named relatively.
if [ "$have_tex" = yes ] && { [ "$have_mmdc" = yes ] || [ "$have_mp" = yes ]; }; then
	if (cd "$D/build" && pdflatex -interaction=nonstopmode -halt-on-error '\pdfobjcompresslevel=0 \input{note}' >/dev/null 2>&1); then
		pass "single/compiles-in-build"
		names=$(grep -a -o '/PTEX.FileName ([^)]*)' "$D/build/note.pdf")
		if [ -z "$names" ]; then fail "single/pdf-names-relative" "no /PTEX.FileName in the PDF"
		elif printf '%s\n' "$names" | grep -q '(/'; then fail "single/pdf-names-relative" "$names"
		else pass "single/pdf-names-relative"; fi
	else
		fail "single/compiles-in-build" "$(grep -m3 '^!' "$D/build/note.log")"
	fi
else
	skip "single/compiles-in-build" "no pdflatex or no diagram tools"
fi

# Beside the note, the paths are the cache folders' own (cached: nothing re-renders).
jmd "$D" process note.md --to latex -o note.tex || fail "beside/exit" "$(cat "$D/err.txt")"
[ "$have_mmdc" = yes ] && has "beside/mermaid" "$D/note.tex" '{mermaid/'
[ "$have_mp" = yes ] && has "beside/metapost" "$D/note.tex" '{MetaPost/'
hasnt "beside/no-absolute-path" "$D/note.tex" "$REAL"

# On stdout there is no folder to be relative to: the absolute path, and a warning.
(cd "$D" && HOME="$SCRATCH/home" "$NODE" "$JMD" process - --to latex <note.md >stdout.tex 2>stdout.err) \
	|| fail "stdout/exit" "$(cat "$D/stdout.err")"
if [ "$have_mp" = yes ]; then
	has "stdout/absolute" "$D/stdout.tex" "{$REAL/note/MetaPost/"
	has "stdout/warned" "$D/stdout.err" 'cached diagrams are included by absolute path'
fi

# --- a book: the cache is the master's folder's; the chapter is in a subfolder ---------------------

if [ "$have_mp" = yes ]; then
	B="$SCRATCH/book"
	mkdir -p "$B/chapters" "$B/build"
	printf -- '---\nTitle: A Book\n---\n\n@chapter+(chapters/one.md)\n' >"$B/master.md"
	printf '# One\n\n@begin(metapost)\ndraw unitsquare scaled 1cm;\n@end(metapost)\n' >"$B/chapters/one.md"
	jmd "$B" process master.md --to latex -o build/Book.tex || fail "book/exit" "$(cat "$B/err.txt")"
	has   "book/metapost-from-build" "$B/build/Book.tex" '\includegraphics[max width=\linewidth]{../MetaPost/'
	hasnt "book/no-absolute-path" "$B/build/Book.tex" "$REAL"
else
	skip "book/metapost-from-build" "no mpost/mptopdf"
fi

# --- mmdc missing: the diagram is left out, with a build warning naming it -------------------------

M="$SCRATCH/nommdc"
mkdir -p "$M"
printf -- '---\nTitle: No mmdc\n---\n\n@begin(mermaid)\ngraph TD\n  A --> B\n@end(mermaid)\n' >"$M/note.md"
(cd "$M" && HOME="$SCRATCH/home" PATH=/usr/bin:/bin "$NODE" "$JMD" process note.md --to latex -o note.tex >/dev/null 2>err.txt) \
	|| fail "no-mmdc/exit" "$(cat "$M/err.txt")"
has   "no-mmdc/warned" "$M/err.txt" 'mermaid: "graph TD" left out of the LaTeX — mermaid-cli (mmdc) was not found'
hasnt "no-mmdc/left-out" "$M/note.tex" 'includegraphics'

echo "diagrams: $passed passed, $failed failed, $skipped skipped"
[ "$failed" -eq 0 ]
