#!/bin/sh
# Book mode (src/book.js): a master and its chapters built as one document.
#
# A suite rather than feature fixtures because a book is several files in
# several folders, and because some checks need a library call (processFile's
# `chapters` option, the route a host like Clew takes). HOME points at an
# empty folder, so a global config plays no part.
#
# fixture/master.md names its chapters with `@chapter+(…)` lines; the
# chapters live in fixture/chapters/, so every relative path in them is
# relative to that folder, not the master's.
#
# Usage:  sh tests/book/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-book.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "book  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0
pass() { printf 'PASS  book/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  book/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
has()   { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected: $3"; fi; }
hasnt() { if grep -qF -- "$3" "$2"; then fail "$1" "unexpected: $(grep -F -- "$3" "$2" | head -2)"; else pass "$1"; fi; }
count() { n=$(grep -cF -- "$3" "$2"); if [ "$n" = "$4" ]; then pass "$1"; else fail "$1" "expected $4 of: $3 (found $n)"; fi; }

cp -R "$HERE/fixture" "$SCRATCH/book"
mkdir -p "$SCRATCH/home"
B="$SCRATCH/book"
build() {   # build NAME [args…] — fixture master → $B/NAME.out, stderr $B/NAME.err
	name=$1; shift
	(cd "$B" && HOME="$SCRATCH/home" node "$JMD" process master.md -o "$name.out" "$@" >/dev/null 2>"$name.err") \
		|| fail "$name/exit" "$(cat "$B/$name.err")"
}

# --- assembly -------------------------------------------------------------------------

build html --fragment
H="$B/html.out"
count "assembly/three-chapters" "$H" '<section class="jmd-chapter"' 3
has   "assembly/order" "$H" 'data-chapter="3" data-file="chapters/three.md"'
has   "assembly/prelude-outside" "$H" '<p>For my readers.</p>'
has   "assembly/between-text-kept" "$H" '<p>Between the chapters.</p>'
has   "assembly/missing-warned" "$B/html.err" 'book: chapter "chapters/missing.md" cannot be read — it is left out'

# --- front matter: stripped, whitelisted, engine keys warned -----------------------------

hasnt "front-matter/stripped" "$H" 'status: draft'
hasnt "front-matter/no-rule" "$H" '<hr'
has   "front-matter/engine-key-warned" "$B/html.err" 'chapters/one.md: book: this chapter sets `Bibliography style` — a book takes that from its master'
hasnt "front-matter/whitelist-quiet" "$B/html.err" '`Lang`'
hasnt "front-matter/own-data-quiet" "$B/html.err" '`status`'

# --- the title rule ----------------------------------------------------------------------

has   "title/from-front-matter" "$H" 'The First Chapter</h1>'
has   "title/from-file-name" "$H" 'three</h1>'
has   "title/text-before-warned" "$B/html.err" 'chapters/two.md:1: book: text before this chapter'
has   "title/second-h1-warned" "$B/html.err" 'chapters/two.md:11: book: 2 level-1 headings in this chapter; each starts a chapter'

# --- the line map: source lines are the chapter file's -------------------------------------

has   "lines/after-front-matter" "$H" 'data-source-line="8">No heading here'
has   "lines/plain-chapter" "$H" 'data-source-line="5">Its own note'

# --- per-chapter lexing: each chapter's notes are its own ------------------------------------

has   "footnotes/one-own" "$H" "chapter one's note."
has   "footnotes/two-own" "$H" "chapter two's note."
count "footnotes/a-list-per-chapter" "$H" '<section class="footnotes"' 2

# --- paths (G10) and links between chapters ----------------------------------------------------

has   "paths/image-rebased" "$H" 'src="chapters/img/f.png"'
has   "paths/at-image-rebased" "$H" '<img src="chapters/img/f.png" alt="fig" style="width: 20%">'
has   "paths/include-own-folder" "$H" 'Included from parts/'
has   "paths/included-image-rebased" "$H" 'src="chapters/img/f.png" alt="again"'
has   "links/to-chapter" "$H" '<a href="#jmd-chapter-2">link to two</a>'

# --- a host names the chapters (processFile's option), and the CLI flag ------------------------

(cd "$B" && HOME="$SCRATCH/home" node --input-type=module -e "
	const { processFile } = await import('$JMD');
	await processFile('master.md', { to: 'html', fragment: true, output: 'host.out', chapters: ['chapters/three.md', 'chapters/one.md'] });
" >/dev/null 2>"$B/host.err")
has   "host/order" "$B/host.out" 'id="jmd-chapter-1" data-chapter="1" data-file="chapters/three.md"'
count "host/only-those" "$B/host.out" '<section class="jmd-chapter"' 2
has   "host/master-lines-ignored" "$B/host.err" "book: the master's \`@chapter+\` lines are ignored"
build cli --fragment --chapter chapters/one.md
count "cli/chapter-flag" "$B/cli.out" '<section class="jmd-chapter"' 1

# --- LaTeX: the same book, compiled ---------------------------------------------------------------

build latex --to latex
L="$B/latex.out"
has   "latex/book-class" "$L" '\documentclass{book}'
count "latex/chapters" "$L" '\chapter{' 4
has   "latex/chapter-link" "$L" '\hyperref[jmd-chapter-2]{link to two}'
has   "latex/chapter-anchor" "$L" '\phantomsection\label{jmd-chapter-2}'
has   "latex/render-warning-located" "$B/latex.err" 'chapters/two.md:7: code: minted has no Pygments lexer for "nosuchlang"'
hasnt "latex/no-front-matter" "$L" 'status: draft'
if command -v pdflatex >/dev/null 2>&1; then
	(cd "$B" && cp latex.out book.tex && pdflatex -shell-escape -interaction=nonstopmode -halt-on-error book.tex >/dev/null 2>&1 \
		&& pdflatex -shell-escape -interaction=nonstopmode -halt-on-error book.tex >/dev/null 2>&1)
	if [ -f "$B/book.pdf" ]; then pass "latex/compiles"; else fail "latex/compiles" "$(grep -m3 '^!' "$B/book.log")"; fi
fi

# --- not a book: nothing changes ------------------------------------------------------------------

printf -- '---\nTitle: plain\n---\n\n# Plain\n\nNo chapters here.\n' >"$B/plain.md"
(cd "$B" && HOME="$SCRATCH/home" node "$JMD" process plain.md --fragment -o plain.out >/dev/null 2>"$B/plain.err")
hasnt "plain/no-section" "$B/plain.out" 'jmd-chapter'
hasnt "plain/no-source-lines" "$B/plain.out" 'data-source-line'

echo "book: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
