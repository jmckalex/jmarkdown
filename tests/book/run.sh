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

# --- numbering: per chapter by default, `continuous` on request, the same in both outputs -------------

cp -R "$HERE/numbering" "$SCRATCH/numbers"
N="$SCRATCH/numbers"
nbuild() {   # nbuild NAME MASTER [args…]
	name=$1; master=$2; shift 2
	(cd "$N" && HOME="$SCRATCH/home" node "$JMD" process "$master" -o "$name.out" "$@" >/dev/null 2>"$name.err") \
		|| fail "numbers/$name/exit" "$(cat "$N/$name.err")"
}
nbuild per master.md --fragment
for want in 'Figure 1.1:' 'Figure 2.1:' 'Figure 2.2:' 'Theorem 1.1' 'Lemma 2.1' '(1.1)' '(2.1)' 'Listing 2.1:' 'Exercise 2.1' \
	'href="#fig:a">1.1' 'href="#fig:c">figure&nbsp;2.2' 'href="#thm:b">lemma&nbsp;2.1' 'href="#lst:a">2.1' 'href="#ex:a">2.1'; do
	has "numbers/per-chapter/html/$want" "$N/per.out" "$want"
done
nbuild perlatex master.md --to latex
has   "numbers/per-chapter/latex/theorems-within" "$N/perlatex.out" '\declaretheorem[numberwithin=chapter]{theorem}'
has   "numbers/per-chapter/latex/exercise-within" "$N/perlatex.out" 'numberwithin=chapter]{exercise}'
has   "numbers/per-chapter/latex/listings-within" "$N/perlatex.out" '\counterwithin{listing}{chapter}'
sed 's/^Headings: numeric$/Headings: numeric\nNumbering: continuous/' "$N/master.md" >"$N/continuous.md"
nbuild cont continuous.md --fragment
for want in 'Figure 1:' 'Figure 3:' 'Theorem 1' 'Lemma 2' '(2)' 'Listing 1:' 'Exercise 1' 'href="#fig:c">figure&nbsp;3'; do
	has "numbers/continuous/html/$want" "$N/cont.out" "$want"
done
nbuild contlatex continuous.md --to latex
has   "numbers/continuous/latex/plain-theorem" "$N/contlatex.out" '\declaretheorem{theorem}'
has   "numbers/continuous/latex/counterwithout" "$N/contlatex.out" '\counterwithout{figure}{chapter}'
(cd "$N" && HOME="$SCRATCH/home" node --input-type=module -e "
	const { processFile } = await import('$JMD');
	await processFile('master.md', { to: 'html', fragment: true, output: 'opt.out', numbering: 'continuous' });
" >/dev/null 2>"$N/opt.err")
has   "numbers/option/continuous" "$N/opt.out" 'Figure 3:'
# The PDF reads the same numbers as the HTML, in both modes.
if command -v pdflatex >/dev/null 2>&1 && command -v pygmentize >/dev/null 2>&1; then
	for pair in 'perlatex:Figure 2.2:Lemma 2.1:Listing 2.1:Exercise 2.1:See 1.1, figure 2.2, lemma 2.1 and 2.1' \
		'contlatex:Figure 3:Lemma 2:Listing 1:Exercise 1:See 1, figure 3, lemma 2 and 2'; do
		name=${pair%%:*}
		# Its own jobname: with hyperref, pdflatex writes <jobname>.out, which
		# must not be the build's own $name.out.
		(cd "$N" && sed -e '/fontspec/d' -e '/setmainfont/d' "$name.out" >"$name-pdf.tex" \
			&& pdflatex -shell-escape -interaction=nonstopmode -halt-on-error "$name-pdf.tex" >/dev/null 2>&1 \
			&& pdflatex -shell-escape -interaction=nonstopmode -halt-on-error "$name-pdf.tex" >/dev/null 2>&1 \
			&& pdftotext "$name-pdf.pdf" "$name.txt")
		if [ ! -f "$N/$name.txt" ]; then fail "numbers/$name/pdf" "$(grep -m3 '^!' "$N/$name-pdf.log")"; continue; fi
		rest=${pair#*:}
		old_ifs=$IFS; IFS=':'
		for want in $rest; do IFS=$old_ifs; has "numbers/$name/pdf/$want" "$N/$name.txt" "$want"; IFS=':'; done
		IFS=$old_ifs
	done
fi

# --- a chapter's engine keys: silent when the book uses the same value (the owner, 2026-10-04) -----
# settings/master.md sets `Resolve citations: true`, `Bibliography style: apa`
# and a lowercase `numbering: continuous`. same.md repeats them (`True`);
# differ.md sets `yes` (false, as the engine reads it), chicago and per chapter;
# defaults.md sets keys the master leaves unset, at their defaults (one in
# lowercase); off-default.md sets one that is not.

cp -R "$HERE/settings" "$SCRATCH/settings"
T="$SCRATCH/settings"
(cd "$T" && HOME="$SCRATCH/home" node "$JMD" process master.md --fragment -o settings.out >/dev/null 2>settings.err) \
	|| fail "settings/exit" "$(cat "$T/settings.err")"
hasnt "settings/equal-silent" "$T/settings.err" 'same.md:'
has   "settings/different-resolve" "$T/settings.err" 'differ.md: book: this chapter sets `Resolve citations`'
has   "settings/different-style" "$T/settings.err" 'differ.md: book: this chapter sets `Bibliography style`'
has   "settings/different-numbering" "$T/settings.err" 'differ.md: book: this chapter sets `Numbering`'
hasnt "settings/unset-default-silent" "$T/settings.err" 'defaults.md:'
has   "settings/unset-off-default" "$T/settings.err" 'off-default.md: book: this chapter sets `Citation tooltips`'
# The master's lowercase `numbering:` is the book's Numbering: continuous.
has   "settings/master-lowercase-numbering" "$T/settings.out" '<span class="eqn-number">(2)</span>'
hasnt "settings/not-per-chapter" "$T/settings.out" '(2.1)'

# --- footnotes: each chapter's close it (HTML), ids unique per chapter ---------------------------------
# notes/master.md: two chapters, each with classic [^1]/[^x] notes and inline
# [fn: …]/[^q: …] ones (the same labels in both), a multi-paragraph note, an
# author's own #footnote-1 link, and an inline note in the master's own text.
# notes/grouped.md: g.md sets an ambient @endnoteGroup, and the master places
# the groups — the author's own layout, kept as in one document.

cp -R "$HERE/notes" "$SCRATCH/notes"
F="$SCRATCH/notes"
fbuild() {   # fbuild NAME MASTER [args…]
	name=$1; master=$2; shift 2
	(cd "$F" && HOME="$SCRATCH/home" node "$JMD" process "$master" -o "$name.out" "$@" >/dev/null 2>"$name.err") \
		|| fail "notes/$name/exit" "$(cat "$F/$name.err")"
}
dupes() {    # dupes LABEL FILE — no id appears twice, but for marked-footnote's
	# own: a note referred to twice gives both references one id, in any document.
	d=$(grep -o ' id="[^"]*"' "$2" | grep -v 'footnote-ref-' | sort | uniq -d | head -3)
	if [ -z "$d" ]; then pass "$1"; else fail "$1" "repeated: $d"; fi
}

fbuild html master.md --fragment
H="$F/html.out"
sed -n '/id="jmd-chapter-1"/,/id="jmd-chapter-2"/p' "$H" >"$F/one.part"
sed -n '/id="jmd-chapter-2"/,$p' "$H" >"$F/two.part"
dupes "notes/ids-unique" "$H"
count "notes/a-list-per-chapter" "$H" '<h2 class="endnotes-heading">Endnotes</h2>' 2
has   "notes/one/inline-listed" "$F/one.part" 'alpha inline two'
has   "notes/one/long-listed" "$F/one.part" 'first paragraph'
hasnt "notes/one/not-two's" "$F/one.part" 'beta inline one'
has   "notes/one/numbered" "$F/one.part" 'href="#ch1-fn-q" id="ch1-fnref-q">3</a>'
has   "notes/two/restarts" "$F/two.part" 'href="#ch2-fn-q" id="ch2-fnref-q">2</a>'
has   "notes/two/classic-scoped" "$F/two.part" '<li id="ch2-footnote-1">'
has   "notes/two/backref" "$F/two.part" 'href="#ch2-footnote-ref-1" data-footnote-backref'
has   "notes/two/aria" "$F/two.part" 'aria-describedby="ch2-footnote-label"'
has   "notes/two/author-link" "$F/two.part" '<a href="#ch2-footnote-1">the note</a>'
hasnt "notes/no-placeholder" "$H" 'jmd-chapter-notes'
# The master's own note is in no chapter: listed at the end, as in one document.
count "notes/master-note-at-end" "$H" '<h1 class="endnotes-heading">Endnotes</h1>' 1
has   "notes/master-note-unscoped" "$H" '<li id="fn-_auto'

# LaTeX: \footnote, which the book class numbers per chapter; a note
# referred to twice keys its \label by chapter.
fbuild latex master.md --to latex
has   "notes/latex/label-scoped" "$F/latex.out" '\footnote{\label{jmdfn:ch1-1}alpha classic one.}'
has   "notes/latex/ref-scoped" "$F/latex.out" '\textsuperscript{\ref{jmdfn:ch1-1}}'
if command -v pdflatex >/dev/null 2>&1 && command -v pdftotext >/dev/null 2>&1; then
	(cd "$F" && sed -e '/fontspec/d' -e '/setmainfont/d' latex.out >notes-pdf.tex \
		&& pdflatex -interaction=nonstopmode -halt-on-error notes-pdf.tex >/dev/null 2>&1 \
		&& pdflatex -interaction=nonstopmode -halt-on-error notes-pdf.tex >/dev/null 2>&1 \
		&& pdftotext notes-pdf.pdf notes.txt)
	if [ -f "$F/notes.txt" ]; then
		has "notes/pdf/one" "$F/notes.txt" 'Classic1 , again1 , and labelled2 . Inline3 and4 , labelled5 .'
		has "notes/pdf/two-restarts" "$F/notes.txt" 'Classic1 and labelled2 . Inline3 , labelled4 .'
	else
		fail "notes/pdf" "$(grep -m3 '^!' "$F/notes-pdf.log")"
	fi
fi

# Grouped: the author's placements hold; an ambient group ends with its chapter.
fbuild grouped grouped.md --fragment
G="$F/grouped.out"
sed -n '/endnotes-heading">Sources/,/endnotes-heading">Notes/p' "$G" >"$F/sources.part"
has   "notes/grouped/source-placed" "$F/sources.part" 'a source'
hasnt "notes/grouped/ambient-ends" "$F/sources.part" 'beta inline one'
has   "notes/grouped/ref-keeps-id" "$G" 'href="#fn-q" id="fnref-q"'
has   "notes/grouped/note-keeps-id" "$G" '<li id="fn-q">'
dupes "notes/grouped/ids-unique" "$G"
fbuild glatex grouped.md --to latex
if command -v pdflatex >/dev/null 2>&1; then
	if (cd "$F" && sed -e '/fontspec/d' -e '/setmainfont/d' glatex.out >grouped-pdf.tex \
		&& pdflatex -interaction=nonstopmode -halt-on-error grouped-pdf.tex >/dev/null 2>&1); then
		pass "notes/grouped/pdf-compiles"
	else
		fail "notes/grouped/pdf-compiles" "$(grep -m3 '^!' "$F/grouped-pdf.log")"
	fi
fi

# --- bibliographies: the chapters' files join the book's one set, for one References list ---------------
# bib/master.md names book.bib and places the one @bibliography. c1.md adds
# c1.bib and also cites `beta`, which only sub/c2.md's c2.bib holds; the two
# chapters' files define `clash` differently; sub/c2.md has its own
# @bibliography. Compile-time HTML, pinned to apa.

cp -R "$HERE/bib" "$SCRATCH/bib"
C="$SCRATCH/bib"
bbuild() {   # bbuild NAME [args…]
	name=$1; shift
	(cd "$C" && HOME="$SCRATCH/home" node "$JMD" process master.md -o "$name.out" "$@" >/dev/null 2>"$name.err") \
		|| fail "bib/$name/exit" "$(cat "$C/$name.err")"
}
bbuild html --fragment
has   "bib/cross-chapter-warned" "$C/html.err" "c1.md:9: book: this chapter cites \`beta\`, which only sub/c2.md's bibliography holds"
count "bib/own-key-quiet" "$C/html.err" 'this chapter cites' 1
has   "bib/clash-names-both" "$C/html.err" "bibliography: c2.bib (sub/c2.md's) and c1.bib (c1.md's) disagree on an entry; c2.bib's used: clash"
has   "bib/chapter-list-ignored" "$C/html.err" "sub/c2.md:10: book: this chapter's \`@bibliography\` is ignored"
count "bib/one-list" "$C/html.out" 'bibliography-title">References' 1
has   "bib/master-entry" "$C/html.out" 'The Shared Book'
has   "bib/chapter-one-entry" "$C/html.out" 'The Alpha Article'
count "bib/chapter-two-entry" "$C/html.out" 'The Beta Article' 1
has   "bib/later-wins" "$C/html.out" 'Clash, the Second'
hasnt "bib/earlier-loses" "$C/html.out" 'Clash, the First'

# LaTeX: the chapters' files sit off bibtex's search path, so the book's set
# goes in as one merged file beside the output; the chapter's list is dropped.
bbuild latex --to latex
count "bib/latex/one-bibliography" "$C/latex.out" '\bibliography{' 1
has   "bib/latex/merged" "$C/latex.out" '\bibliography{latex-bibliography}'
has   "bib/latex/merged-has-chapter-two" "$C/latex-bibliography.bib" 'The Beta Article'
hasnt "bib/latex/merged-one-clash" "$C/latex-bibliography.bib" 'Clash, the First'
if command -v pdflatex >/dev/null 2>&1 && command -v bibtex >/dev/null 2>&1 && command -v pdftotext >/dev/null 2>&1; then
	(cd "$C" && sed -e '/fontspec/d' -e '/setmainfont/d' latex.out >bib-pdf.tex \
		&& pdflatex -interaction=nonstopmode -halt-on-error bib-pdf.tex >/dev/null 2>&1 \
		&& bibtex bib-pdf >/dev/null 2>&1 \
		&& pdflatex -interaction=nonstopmode -halt-on-error bib-pdf.tex >/dev/null 2>&1 \
		&& pdflatex -interaction=nonstopmode -halt-on-error bib-pdf.tex >/dev/null 2>&1 \
		&& pdftotext bib-pdf.pdf bib.txt)
	if [ -f "$C/bib.txt" ]; then
		has "bib/pdf/cited" "$C/bib.txt" 'It cites Ta (2004) and Ash (2003).'
		has "bib/pdf/listed" "$C/bib.txt" 'Ta, B. (2004). The beta article. Journal.'
		has "bib/pdf/clash" "$C/bib.txt" 'Clash, the second.'
	else
		fail "bib/pdf" "$(grep -m3 '^!' "$C/bib-pdf.log")"
	fi
fi

# --- one preamble: the chapters' Packages and LaTeX preamble join the master's --------------------------
# preamble/master.md loads amsmath and defines \R; a.md adds amssymb and
# tikz-cd, repeats \R and defines \N and \argmax; b.md (a YAML list) repeats
# amssymb, adds mathtools and \Z, and redefines \N and \R — clashes, left out.

cp -R "$HERE/preamble" "$SCRATCH/preamble"
P="$SCRATCH/preamble"
(cd "$P" && HOME="$SCRATCH/home" node "$JMD" process master.md --to latex -o latex.out >/dev/null 2>latex.err) \
	|| fail "preamble/exit" "$(cat "$P/latex.err")"
count "preamble/package-once" "$P/latex.out" '\usepackage{amssymb}' 1
has   "preamble/chapter-package" "$P/latex.out" '\usepackage{tikz-cd}'
has   "preamble/yaml-list-package" "$P/latex.out" '\usepackage{mathtools}'
count "preamble/line-once" "$P/latex.out" '\newcommand{\R}' 1
has   "preamble/chapter-line" "$P/latex.out" '\DeclareMathOperator{\argmax}{arg\,max}'
has   "preamble/yaml-list-line" "$P/latex.out" '\newcommand{\Z}{\mathbb{Z}}'
hasnt "preamble/clash-left-out" "$P/latex.out" '\mathbf{N}'
hasnt "preamble/master-wins" "$P/latex.out" '\mathcal{R}'
has   "preamble/clash-chapter" "$P/latex.err" "b.md: book: this chapter's \`LaTeX preamble\` defines \\N differently from a.md — a book has one preamble, so a.md's is used"
has   "preamble/clash-master" "$P/latex.err" "b.md: book: this chapter's \`LaTeX preamble\` defines \\R differently from the master"
if command -v pdflatex >/dev/null 2>&1; then
	if (cd "$P" && sed -e '/fontspec/d' -e '/setmainfont/d' latex.out >pre-pdf.tex \
		&& pdflatex -interaction=nonstopmode -halt-on-error pre-pdf.tex >/dev/null 2>&1); then
		pass "preamble/pdf-compiles"
	else
		fail "preamble/pdf-compiles" "$(grep -m3 '^!' "$P/pre-pdf.log")"
	fi
fi
# The LaTeX-export lint counts what the chapters load.
(cd "$P" && HOME="$SCRATCH/home" node "$JMD" process master.md --fragment -o html.out >/dev/null 2>html.err)
hasnt "preamble/lint-counts-chapters" "$P/html.err" 'needs the amssymb package'

# --- math macros: each chapter's defined at its start -----------------------------------------------------
# macros/master.md defines \R; a.md repeats it and adds \N and \argmax; b.md
# (a YAML list) redefines \N — warned, since it carries on — and adds \Z.

cp -R "$HERE/macros" "$SCRATCH/macros"
M="$SCRATCH/macros"
(cd "$M" && HOME="$SCRATCH/home" node "$JMD" process master.md --to latex -o latex.out >/dev/null 2>latex.err) \
	|| fail "macros/exit" "$(cat "$M/latex.err")"
(cd "$M" && HOME="$SCRATCH/home" node "$JMD" process master.md --fragment -o html.out >/dev/null 2>html.err) \
	|| fail "macros/html-exit" "$(cat "$M/html.err")"
has   "macros/redefined-warned" "$M/latex.err" "b.md: book: this chapter's \`Math macros\` define \\N differently from a.md's"
count "macros/one-warning" "$M/latex.err" 'Math macros' 1
has   "macros/latex/chapter" "$M/latex.out" '\providecommand{\N}{}\renewcommand{\N}{\mathbb{N}}'
has   "macros/latex/operator" "$M/latex.out" '\providecommand{\argmax}{}\renewcommand{\argmax}{\operatorname*{arg\,max}}'
has   "macros/latex/redefinition" "$M/latex.out" '\providecommand{\N}{}\renewcommand{\N}{\mathbf{N}}'
hasnt "macros/latex/master-not-repeated" "$M/latex.out" '\providecommand{\R}'
sed -n '/renewcommand{\\Z}/,/label{jmd-chapter-2}/p' "$M/latex.out" >"$M/order.part"
has   "macros/latex/before-chapter" "$M/order.part" '\phantomsection\label{jmd-chapter-2}'
count "macros/html/blocks" "$M/html.out" 'class="math-macros"' 3
count "macros/html/master-once" "$M/html.out" '\newcommand{\R}' 1
sed -n '/id="jmd-chapter-2"/,$p' "$M/html.out" >"$M/two.part"
has   "macros/html/in-chapter" "$M/two.part" '\renewcommand{\N}{\mathbf{N}}'
if command -v pdflatex >/dev/null 2>&1; then
	if (cd "$M" && sed -e '/fontspec/d' -e '/setmainfont/d' latex.out >mac-pdf.tex \
		&& pdflatex -interaction=nonstopmode -halt-on-error mac-pdf.tex >/dev/null 2>&1); then
		pass "macros/pdf-compiles"
	else
		fail "macros/pdf-compiles" "$(grep -m3 '^!' "$M/mac-pdf.log")"
	fi
fi

# --- not a book: nothing changes ------------------------------------------------------------------

printf -- '---\nTitle: plain\n---\n\n# Plain\n\nNo chapters here.\n' >"$B/plain.md"
(cd "$B" && HOME="$SCRATCH/home" node "$JMD" process plain.md --fragment -o plain.out >/dev/null 2>"$B/plain.err")
hasnt "plain/no-section" "$B/plain.out" 'jmd-chapter'
hasnt "plain/no-source-lines" "$B/plain.out" 'data-source-line'

echo "book: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
