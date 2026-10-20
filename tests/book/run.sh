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

# --- LaTeX written to another folder: LaTeX runs beside the .tex, so a book's paths are given from
#     there (latex-graphics.js texPath). Beside the master they are as before. -----------------------

has   "latex/paths-beside-master" "$L" '\includegraphics[width=\textwidth]{chapters/img/f.png}'
mkdir -p "$B/build"
build build/latex --to latex
BL="$B/build/latex.out"
has   "latex-elsewhere/image" "$BL" 'a figure \includegraphics[width=\textwidth]{../chapters/img/f.png}, another'
has   "latex-elsewhere/at-image" "$BL" 'another \includegraphics[width=0.2\linewidth]{../chapters/img/f.png}'
has   "latex-elsewhere/included-image" "$BL" "the including chapter's: \\includegraphics[width=\\textwidth]{../chapters/img/f.png}"
hasnt "latex-elsewhere/none-master-relative" "$BL" '{chapters/img/f.png}'
if command -v pdflatex >/dev/null 2>&1; then
	(cd "$B/build" && cp latex.out book.tex && pdflatex -shell-escape -interaction=nonstopmode -halt-on-error book.tex >/dev/null 2>&1)
	if [ -f "$B/build/book.pdf" ]; then pass "latex-elsewhere/compiles-in-build"; else fail "latex-elsewhere/compiles-in-build" "$(grep -m3 '^!' "$B/build/book.log")"; fi
fi
# @video's file too (link mode: a launch action, read from the PDF beside the .tex).
mkdir -p "$SCRATCH/media/notes" "$SCRATCH/media/build"
printf -- '---\nTitle: Media\nVideo poster: none\n---\n\n@chapter+(notes/clip.md)\n' >"$SCRATCH/media/master.md"
printf '# Clip\n\n@video+(clip.mp4)[A clip]\n' >"$SCRATCH/media/notes/clip.md"
(cd "$SCRATCH/media" && HOME="$SCRATCH/home" node "$JMD" process master.md --to latex -o build/media.tex >/dev/null 2>&1)
has   "latex-elsewhere/video" "$SCRATCH/media/build/media.tex" '\href{run:../notes/clip.mp4}{A clip}'

# --- the LaTeX include layout (book-latex.js): a master .tex and a file per chapter; \includeonly -----
#     Off by default: the single .tex carries no trace of it. A full run gives the same words as the
#     single .tex (pagination aside: \include starts each chapter file on a fresh page, so the master's
#     text between chapters sits on a page of its own). --include-only proofs the named chapters.

hasnt "include/single-untouched" "$L" 'jmd:include'
mkdir -p "$B/incl"
build incl/master --to latex --latex-layout include
IL="$B/incl/master.out"
for n in 1 2 3; do
	if [ -f "$B/incl/master-ch-$n.tex" ]; then pass "include/chapter-file-$n"; else fail "include/chapter-file-$n" "$(ls "$B/incl")"; fi
	has "include/master-includes-$n" "$IL" "\\include{master-ch-$n}"
	has "include/chapter-$n-anchor" "$B/incl/master-ch-$n.tex" "\\phantomsection\\label{jmd-chapter-$n}"
done
hasnt "include/no-brackets-left" "$IL" 'jmd:include'
hasnt "include/master-has-no-chapter" "$IL" '\phantomsection\label{jmd-chapter-1}'
if command -v pdflatex >/dev/null 2>&1 && command -v pdftotext >/dev/null 2>&1; then
	# The words of a PDF's text, sorted, less page furniture: page numbers, and
	# running heads (CHAPTER 1. THE FIRST CHAPTER), which the extra pages carry.
	words() { tr '\f' '\n' <"$1" | grep -v -E '^CHAPTER [0-9]+\. ' | tr -s ' \n' '\n' | grep -v -E '^[0-9ivx]*$' | sort; }
	# Typeset under another job name: hyperref writes its outline to <job>.out.
	(cd "$B/incl" && cp master.out typeset.tex && pdflatex -shell-escape -interaction=nonstopmode -halt-on-error typeset.tex >/dev/null 2>&1 \
		&& pdflatex -shell-escape -interaction=nonstopmode -halt-on-error typeset.tex >/dev/null 2>&1 && pdftotext typeset.pdf book.txt)
	if [ -f "$B/incl/book.txt" ] && [ -f "$B/book.pdf" ]; then
		(cd "$B" && pdftotext book.pdf single.txt)
		words "$B/single.txt" >"$B/incl/single.words"; words "$B/incl/book.txt" >"$B/incl/include.words"
		if cmp -s "$B/incl/single.words" "$B/incl/include.words"; then pass "include/same-words-as-single"
		else fail "include/same-words-as-single" "$(diff "$B/incl/single.words" "$B/incl/include.words" | head -8)"; fi
		# A proof of chapter two alone: its text, numbered 2 from the .aux; none of chapter one's.
		build incl/master --to latex --latex-layout include --include-only chapters/two.md
		has "include/includeonly-written" "$IL" '\includeonly{master-ch-2}'
		(cd "$B/incl" && cp master.out typeset.tex && pdflatex -shell-escape -interaction=nonstopmode -halt-on-error typeset.tex >/dev/null 2>&1 && pdftotext typeset.pdf proof.txt)
		has   "include/proof-has-chapter-two" "$B/incl/proof.txt" 'Its own note'
		has   "include/proof-keeps-its-number" "$B/incl/proof.txt" 'CHAPTER 2. TWO'
		hasnt "include/proof-leaves-out-chapter-one" "$B/incl/proof.txt" 'No heading here'
	else
		fail "include/compiles" "$(grep -m3 '^!' "$B/incl/typeset.log" 2>/dev/null)"
	fi
fi
build incl/x --to latex --latex-layout include --include-only nosuch
has   "include/unknown-chapter-warned" "$B/incl/x.err" '--include-only names "nosuch", which is no chapter of this book'
build incl/frag --to latex --fragment --latex-layout include
has   "include/fragment-warned" "$B/incl/frag.err" '`LaTeX layout: include` needs an output file and a full document'
hasnt "include/fragment-no-brackets" "$B/incl/frag.out" 'jmd:include'
build incl/single-only --to latex --include-only chapters/two.md
has   "include/includeonly-needs-layout" "$B/incl/single-only.err" '--include-only needs `LaTeX layout: include`'
(cd "$B" && HOME="$SCRATCH/home" node --input-type=module -e "
	const { processFile } = await import('$JMD');
	const r = await processFile('master.md', { to: 'latex', output: 'incl/lib.tex', latexLayout: 'include' });
	console.log(r.latexFiles && r.latexFiles.length === 3 ? 'returned' : 'NOT RETURNED ' + JSON.stringify(r.latexFiles));
" >"$B/incl/lib.txt" 2>&1)
has   "include/returned-by-processFile" "$B/incl/lib.txt" 'returned'

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

# --- the book map (book-map.js): every label's number, as the references print it ------------------
#     Clew's shape: numbering + labels.<label>{number|null, type, kind, file, line, id}. Asked for
#     only (--book-map / bookMap); never computed or written otherwise.

# mapcheck NAME FILE.json FILE.html — the map's fields for the fixture's labels, and every number an
# @ref / @cref prints in the HTML equal to the map's number for the label it links to.
mapcheck() {
	node -e "
		const fs = require('fs');
		const m = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
		const html = fs.readFileSync(process.argv[2], 'utf8');
		const byId = Object.fromEntries(Object.values(m.labels).map((e) => [e.id, e]));
		const bad = [];
		for (const [, id, text] of html.matchAll(/<a class=\"xref-c?ref\" href=\"#([^\"]+)\">([^<]*)<\/a>/g)) {
			const e = byId[id];
			const printed = text.replace(/^[A-Za-z]+(&#160;|&nbsp;|\\u00a0)/, '').replace(/^\((.*)\)$/, '\$1');
			if (!e || e.number !== printed) bad.push(id + ': printed ' + printed + ', map ' + (e && e.number));
		}
		console.log(bad.length ? 'MISMATCH ' + bad.join('; ') : 'refs-match');
	" "$2" "$3" >"$N/$1-check.txt" 2>&1
}
nbuild map master.md --fragment --book-map
has   "book-map/written" "$N/map-bookmap.json" '"numbering": "per chapter"'
node -e "
	const m = require(process.argv[1]);
	const want = { 'fig:a': ['1.1', 'figure', 'figure', 'one.md', 3], 'thm:a': ['1.1', 'theorem', 'theorem', 'one.md', 7],
		'eq:a': ['1.1', 'equation', 'equation', 'one.md', 11], 'fig:c': ['2.2', 'figure', 'figure', 'two.md', 7],
		'thm:b': ['2.1', 'lemma', 'lemma', 'two.md', 11], 'lst:a': ['2.1', 'listing', 'listing', 'two.md', 21],
		'ex:a': ['2.1', 'exercise', 'exercise', 'two.md', 31] };
	const bad = Object.entries(want).filter(([k, [n, t, kd, f, l]]) => {
		const e = m.labels[k]; return !e || e.number !== n || e.type !== t || e.kind !== kd || e.file !== f || e.line !== l || e.id !== k; });
	console.log(bad.length ? 'BAD ' + bad.map((b) => b[0]).join(' ') : 'fields-ok');
" "$N/map-bookmap.json" >"$N/map-fields.txt" 2>&1
has   "book-map/fields" "$N/map-fields.txt" 'fields-ok'
mapcheck map "$N/map-bookmap.json" "$N/map.out"
has   "book-map/refs-match-per-chapter" "$N/map-check.txt" 'refs-match'
nbuild contmap continuous.md --fragment --book-map
has   "book-map/continuous" "$N/contmap-bookmap.json" '"numbering": "continuous"'
mapcheck contmap "$N/contmap-bookmap.json" "$N/contmap.out"
has   "book-map/refs-match-continuous" "$N/contmap-check.txt" 'refs-match'
if [ ! -e "$N/per-bookmap.json" ]; then pass "book-map/off-by-default"; else fail "book-map/off-by-default" "per-bookmap.json was written"; fi
# A label in plain prose prints ?? and maps to null; a note's label takes its reference's line.
mkdir -p "$SCRATCH/map"
printf -- '---\nTitle: Edge\nHeadings: numeric\n---\n\n@chapter+(a.md)\n' >"$SCRATCH/map/master.md"
printf '# Alpha\n\n## A section @label[sec:two]\n\nPlain words @label[plain:one] here.\n\nA note[fn: with a label @label[fn:one] inside].\n\nSee @ref[sec:two] and @ref[fn:one].\n' >"$SCRATCH/map/a.md"
(cd "$SCRATCH/map" && HOME="$SCRATCH/home" node "$JMD" process master.md --fragment -o edge.html --book-map >/dev/null 2>edge.err) || fail "book-map/edge-exit" "$(cat "$SCRATCH/map/edge.err")"
node -e "
	const l = require(process.argv[1]).labels;
	const ok = l['plain:one'].number === null && l['plain:one'].kind === 'plain'
		&& l['sec:two'].number === '1.1' && l['sec:two'].kind === 'heading' && l['sec:two'].type === 'section'
		&& l['fn:one'].kind === 'footnote' && l['fn:one'].line === 7;
	console.log(ok ? 'edge-ok' : 'BAD ' + JSON.stringify(l));
" "$SCRATCH/map/edge-bookmap.json" >"$SCRATCH/map/edge-check.txt" 2>&1
has   "book-map/plain-null-heading-footnote" "$SCRATCH/map/edge-check.txt" 'edge-ok'
# The library returns it; a LaTeX build writes none, and says why.
(cd "$N" && HOME="$SCRATCH/home" node --input-type=module -e "
	const { processFile } = await import('$JMD');
	const r = await processFile('master.md', { to: 'html', fragment: true, output: 'lib.out', bookMap: true });
	console.log(r.bookMap && r.bookMap.labels['fig:c'].number === '2.2' ? 'returned' : 'NOT RETURNED');
" >"$N/lib-map.txt" 2>&1)
has   "book-map/returned-by-processFile" "$N/lib-map.txt" 'returned'
nbuild latexmap master.md --to latex --book-map
has   "book-map/latex-says-none" "$N/latexmap.err" 'book map: a LaTeX build writes none'
if [ ! -e "$N/latexmap-bookmap.json" ]; then pass "book-map/latex-writes-none"; else fail "book-map/latex-writes-none" "written"; fi

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
has   "bib/chapter-list-ignored" "$C/html.err" "sub/c2.md:9: book: this chapter's \`@bibliography\` is ignored"
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

# --- back matter: the master's @bibliography and @index follow the last chapter (D11) -------------------
# bib/host.md is a master whose chapters a HOST gives (processFile `chapters`),
# so its whole text used to come before chapter 1, and its closing
# @bibliography with it — in print, the References on page 1 and every
# citation "?". Its fenced `@bibliography` is code and stays. bib/early.md
# places its @bibliography above its @chapter+ lines.

hostbuild() {   # hostbuild NAME FORMAT OUTPUT [extra js options]
	(cd "$C" && HOME="$SCRATCH/home" node --input-type=module -e "
		import { processFile } from '$JMD';
		const r = await processFile('host.md', { to: '$2', output: '$3', chapters: ['c1.md', 'sub/c2.md'] ${4:-} });
		if (r.pages) console.log(r.pages.map((p) => p.split('/').pop()).join(' '));
	" >"$1.log" 2>&1) || fail "back/$1/exit" "$(cat "$C/$1.log")"
}
line_of() { grep -nF -- "$2" "$1" | head -1 | cut -d: -f1; }
after() {   # after LABEL FILE FIRST SECOND — SECOND's first line is below FIRST's last
	a=$(grep -nF -- "$3" "$2" | tail -1 | cut -d: -f1); b=$(line_of "$2" "$4")
	if [ -n "$a" ] && [ -n "$b" ] && [ "$b" -gt "$a" ]; then pass "$1"; else fail "$1" "\`$4\` (line ${b:-none}) is not after \`$3\` (line ${a:-none})"; fi
}
hostbuild hostlatex latex host.tex
after "back/latex/bibliography-last" "$C/host.tex" '\chapter{' '\bibliography{'
after "back/latex/index-last" "$C/host.tex" '\chapter{' '\printindex'
after "back/latex/preface-first" "$C/host.tex" 'The preface' '\chapter{One}'
has   "back/latex/fenced-stays" "$C/host.tex" '\begin{minted}{text}'
if command -v pdflatex >/dev/null 2>&1 && command -v bibtex >/dev/null 2>&1 && command -v pdftotext >/dev/null 2>&1; then
	(cd "$C" && sed -e '/fontspec/d' -e '/setmainfont/d' host.tex >host-pdf.tex \
		&& pdflatex -shell-escape -interaction=nonstopmode -halt-on-error host-pdf.tex >/dev/null 2>&1 \
		&& bibtex host-pdf >/dev/null 2>&1 \
		&& pdflatex -shell-escape -interaction=nonstopmode -halt-on-error host-pdf.tex >/dev/null 2>&1 \
		&& pdflatex -shell-escape -interaction=nonstopmode -halt-on-error host-pdf.tex >/dev/null 2>&1 \
		&& pdftotext host-pdf.pdf host.txt)
	if [ -f "$C/host.txt" ]; then
		has   "back/pdf/citations-resolve" "$C/host.txt" 'It cites Author (2001) and Pha (2002).'
		after "back/pdf/references-after-chapters" "$C/host.txt" 'It cites Ta (2004)' 'Author, A. (2001). The Shared Book. Press.'
	else
		fail "back/pdf" "$(grep -m3 '^!' "$C/host-pdf.log")"
	fi
fi
hostbuild hostsplit html out/Host.html ", htmlLayout: 'split'"
has   "back/split/pages" "$C/hostsplit.log" 'index.html c1.html c2.html references.html index-terms.html'
has   "back/split/contents" "$C/out/Host/index.html" '<li><a href="references.html">References</a></li>'
has   "back/split/references" "$C/out/Host/references.html" 'The Shared Book'
has   "back/split/preface" "$C/out/Host/index.html" 'The preface, with a term'
(cd "$C" && HOME="$SCRATCH/home" node "$JMD" process early.md --to latex -o early.tex >/dev/null 2>&1)
after "back/early/moved-after" "$C/early.tex" '\chapter{' '\bibliography{'
after "back/early/closing-text-kept" "$C/early.tex" '\chapter{Two}' 'The closing words.'

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

# --- languages: a chapter's Lang — section lang, babel, quotation marks (book builds only) ---------------
# lang/master.md (English, Smart typography) has chapters in English, German
# (de), French (fr), Russian (ru: babel needs a Unicode engine) and an unknown
# tag (xx). german.md is a German master whose one chapter sets no Lang;
# single.md is not a book, so its `Lang: de` changes no quotation mark.

cp -R "$HERE/lang" "$SCRATCH/lang"
L="$SCRATCH/lang"
lbuild() {   # lbuild NAME MASTER [args…]
	name=$1; master=$2; shift 2
	(cd "$L" && HOME="$SCRATCH/home" node "$JMD" process "$master" -o "$name.out" "$@" >/dev/null 2>"$name.err") \
		|| fail "lang/$name/exit" "$(cat "$L/$name.err")"
}
lbuild html master.md --fragment
has   "lang/master-english" "$L/html.out" '“Before,” the master says.'
has   "lang/english" "$L/html.out" '“Hello,” she said. ‘No’, he said. Don’t.'
has   "lang/german" "$L/html.out" '„Hallo,“ sagte sie. ‚Nein‘, sagte er. Geht’s?'
# The post-processor writes the no-break space as an entity.
has   "lang/french" "$L/html.out" '«&nbsp;Bonjour,&nbsp;» dit-elle. L’homme répond.'
has   "lang/russian" "$L/html.out" '«Privet,» she said.'
has   "lang/unknown-english" "$L/html.out" '“Quoted,” as English.'
has   "lang/section-de" "$L/html.out" 'data-file="de.md" lang="de">'
has   "lang/section-fr" "$L/html.out" 'data-file="fr.md" lang="fr">'
hasnt "lang/section-en-none" "$L/html.out" 'data-file="en.md" lang='
lbuild latex master.md --to latex
has   "lang/latex/babel" "$L/latex.out" '\usepackage[ngerman,french,english]{babel}'
has   "lang/latex/otherlanguage" "$L/latex.out" '\begin{otherlanguage*}{ngerman}'
count "lang/latex/closed" "$L/latex.out" '\end{otherlanguage*}' 2
has   "lang/latex/russian-warned" "$L/latex.err" "ru.md: book: babel's russian needs a Unicode engine"
has   "lang/latex/unknown-warned" "$L/latex.err" 'xx.md: book: `Lang: xx` is not a language babel knows'
if command -v pdflatex >/dev/null 2>&1 && command -v pdftotext >/dev/null 2>&1; then
	(cd "$L" && sed -e '/fontspec/d' -e '/setmainfont/d' latex.out >lang-pdf.tex \
		&& pdflatex -interaction=nonstopmode -halt-on-error lang-pdf.tex >/dev/null 2>&1 \
		&& pdftotext lang-pdf.pdf lang.txt)
	if [ -f "$L/lang.txt" ]; then
		has   "lang/pdf/german" "$L/lang.txt" '„Hallo,“ sagte sie.'
		hasnt "lang/pdf/headings-english" "$L/lang.txt" 'Kapitel'
	else
		fail "lang/pdf" "$(grep -m3 '^!' "$L/lang-pdf.log")"
	fi
fi
# A German master: its chapters are German unless they say otherwise.
lbuild german german.md --fragment
has   "lang/german-master/chapter" "$L/german.out" '„Hello,“ she said.'
lbuild germanlatex german.md --to latex
has   "lang/german-master/babel" "$L/germanlatex.out" '\usepackage[ngerman]{babel}'
hasnt "lang/german-master/no-otherlanguage" "$L/germanlatex.out" 'otherlanguage'
# Not a book: Lang changes no quotation mark, and loads no babel.
lbuild single single.md --fragment
has   "lang/single/english-quotes" "$L/single.out" '“Hallo,” sagte sie. ‘Nein’, sagte er.'
lbuild singlelatex single.md --to latex
hasnt "lang/single/no-babel" "$L/singlelatex.out" 'babel'

# --- a chapter's <style>: confined to its section (HTML), dropped in LaTeX -------------------------------
# style/a.md styles h1 and body and declares a @font-face; b.md has none; the
# master's own <style> stays the whole page's.

cp -R "$HERE/style" "$SCRATCH/style"
Y="$SCRATCH/style"
(cd "$Y" && HOME="$SCRATCH/home" node "$JMD" process master.md -o page.out >/dev/null 2>page.err) \
	|| fail "style/exit" "$(cat "$Y/page.err")"
sed -n '/<head>/,/<\/head>/p' "$Y/page.out" >"$Y/head.part"
sed -n '/<body/,$p' "$Y/page.out" >"$Y/body.part"
has   "style/scoped" "$Y/head.part" '#jmd-chapter-1 {'
has   "style/page-rule-to-section" "$Y/head.part" '& {'
count "style/one-scope" "$Y/head.part" '#jmd-chapter-' 1
sed -n '/@font-face/,/#jmd-chapter-1 {/p' "$Y/head.part" >"$Y/order.part"
has   "style/font-face-outside" "$Y/order.part" '#jmd-chapter-1 {'
has   "style/master-unscoped" "$Y/head.part" '.master-rule {'
hasnt "style/hoisted" "$Y/body.part" '<style'
(cd "$Y" && HOME="$SCRATCH/home" node "$JMD" process master.md --fragment -o fragment.out >/dev/null 2>&1)
sed -n '/id="jmd-chapter-1"/,/id="jmd-chapter-2"/p' "$Y/fragment.out" >"$Y/one.part"
has   "style/fragment-in-section" "$Y/one.part" '#jmd-chapter-1 {'
(cd "$Y" && HOME="$SCRATCH/home" node "$JMD" process master.md --to latex -o latex.out >/dev/null 2>&1)
hasnt "style/latex-dropped" "$Y/latex.out" 'color: red'

# --- split: a page per chapter, cut from the one document (htmlLayout 'split') ----------------------------
# split/master.md (`HTML layout: split`) has math macros, parts/a.md (a figure,
# a <style>, a citation, an index mark) and b.md (an @ref to a's figure, a link
# to a's file), then the master's @bibliography and @index. Written to
# out/Split.html, so the pages go in out/Split/.

cp -R "$HERE/split" "$SCRATCH/split"
X="$SCRATCH/split"
(cd "$X" && HOME="$SCRATCH/home" node "$JMD" process master.md -o out/Split.html >/dev/null 2>split.err) \
	|| fail "split/exit" "$(cat "$X/split.err")"
O="$X/out/Split"
for page in index a b references index-terms; do
	if [ -f "$O/$page.html" ]; then pass "split/page/$page"; else fail "split/page/$page" "no $page.html"; fi
done
if [ -f "$X/out/Split.html" ]; then fail "split/no-single-page" "Split.html was written too"; else pass "split/no-single-page"; fi
has   "split/index/master-text" "$O/index.html" '<p>Before the chapters.</p>'
has   "split/index/contents" "$O/index.html" '<li><a href="a.html">Alpha</a></li>'
has   "split/index/contents-references" "$O/index.html" '<li><a href="references.html">References</a></li>'
hasnt "split/index/no-chapter" "$O/index.html" 'class="jmd-chapter"'
has   "split/a/chapter" "$O/a.html" 'id="jmd-chapter-1"'
hasnt "split/a/only-its-own" "$O/a.html" 'id="jmd-chapter-2"'
has   "split/a/title" "$O/a.html" '<title>Alpha — Split</title>'
has   "split/a/nav" "$O/a.html" '<a class="prev" rel="prev" href="index.html">← Split</a><a class="contents" href="index.html">Contents</a><a class="next" rel="next" href="b.html">Beta →</a>'
has   "split/a/own-style" "$O/a.html" 'data-jmd-chapter="1"'
hasnt "split/b/not-a's-style" "$O/b.html" 'data-jmd-chapter'
has   "split/a/asset-rebased" "$O/a.html" '<img src="../../parts/f.png"'
has   "split/b/ref-across" "$O/b.html" 'href="a.html#fig:a">1.1</a>'
has   "split/b/chapter-link" "$O/b.html" '<a href="a.html#jmd-chapter-1">alpha</a>'
has   "split/b/macros" "$O/b.html" '\newcommand{\R}{\mathbb{R}}'
has   "split/references/list" "$O/references.html" 'The Shared Book'
has   "split/references/next" "$O/references.html" 'href="index-terms.html">Index →</a>'
has   "split/terms/locator" "$O/index-terms.html" 'href="a.html#idx-1"'
# The option, from the CLI and the library, beats the header; the library
# returns the pages.
(cd "$X" && HOME="$SCRATCH/home" node "$JMD" process master.md -o out/One.html --html-layout single >/dev/null 2>&1)
if [ -f "$X/out/One.html" ] && [ ! -d "$X/out/One" ]; then pass "split/cli-single"; else fail "split/cli-single" "no single page"; fi
(cd "$X" && HOME="$SCRATCH/home" node --input-type=module -e "
	import { processFile } from '$JMD';
	const r = await processFile('master.md', { to: 'html', output: 'out/Lib.html', htmlLayout: 'split' });
	console.log(r.pages.map((p) => p.split('/').pop()).join(' '));
" >lib.out 2>/dev/null)
has   "split/library-pages" "$X/lib.out" 'index.html a.html b.html references.html index-terms.html'
(cd "$X" && HOME="$SCRATCH/home" node "$JMD" process master.md --fragment -o out/frag.html >/dev/null 2>frag.err)
has   "split/fragment-one-page" "$X/frag.err" 'needs an output file and a full page — written as one page'
(cd "$X" && HOME="$SCRATCH/home" node "$JMD" process runtime.md -o out/Runtime.html >/dev/null 2>runtime.err)
has   "split/runtime-citations-warned" "$X/runtime.err" 'need `Resolve citations: true`'

# --- the post-pass's warnings, at chapter:line ------------------------------------------------------------
# warn/a.md (front matter, then a blank line) labels eq:x and cites a key no
# bibliography holds; b.md, after it, labels eq:x again and refers to a label
# that does not exist. b.md's lines also pin a fixed slip: a chapter opening
# with a blank line left it in marked-footnote's reused token, and every later
# chapter's lines came out one too many.

cp -R "$HERE/warn" "$SCRATCH/warn"
W="$SCRATCH/warn"
(cd "$W" && HOME="$SCRATCH/home" node "$JMD" process master.md --fragment -o html.out >/dev/null 2>html.err) \
	|| fail "warn/exit" "$(cat "$W/html.err")"
has   "warn/duplicate-label" "$W/html.err" "b.md:7: duplicate label 'eq:x'"
has   "warn/unresolved-ref" "$W/html.err" "b.md:11: unresolved reference 'eq:missing'"
has   "warn/missing-citation" "$W/html.err" 'a.md:13: citation: no bibliography entry for "nowhere"'
sed -n '/data-file="b.md"/,$p' "$W/html.out" >"$W/b.part"
has   "warn/later-chapter-lines" "$W/b.part" '<h1 data-source-line="1"'

# --- `LaTeX maketitle`: the master's title block is the book's title page; a chapter's title lines
#     stay lines (a book has one title page), in the single .tex and the include layout alike. ------

T="$SCRATCH/maketitle"
mkdir -p "$T"
printf -- '---\nTitle: The Book\nLaTeX maketitle: true\n---\n\n@title+[The Book Title]\n@author+[Book Author]\n\nThe master'"'"'s text.\n\n@chapter+(one.md)\n@chapter+(two.md)\n' >"$T/master.md"
printf -- '# Chapter One\n\n@title+[A Title Line in Chapter One]\n@author+[Chapter Author]\n\nChapter one'"'"'s text.\n' >"$T/one.md"
printf -- '# Chapter Two\n\nChapter two'"'"'s text.\n' >"$T/two.md"
(cd "$T" && HOME="$SCRATCH/home" node "$JMD" process master.md --to latex -o single.tex >/dev/null 2>single.err \
	&& HOME="$SCRATCH/home" node "$JMD" process master.md --to latex --latex-layout include -o incl.tex >/dev/null 2>incl.err) \
	|| fail "maketitle/exit" "$(cat "$T/single.err" "$T/incl.err" 2>/dev/null)"
has   "maketitle/title" "$T/single.tex" '\title{The Book Title}'
has   "maketitle/author" "$T/single.tex" '\author{Book Author}'
count "maketitle/once" "$T/single.tex" '\maketitle' 1
has   "maketitle/chapter-line" "$T/single.tex" '{\noindent\LARGE\bfseries A Title Line in Chapter One\par}'
has   "maketitle/chapter-author-line" "$T/single.tex" '{\noindent\large Chapter Author\par}'
count "maketitle/include-master" "$T/incl.tex" '\maketitle' 1
has   "maketitle/include-chapter-line" "$T/incl-ch-1.tex" '{\noindent\LARGE\bfseries A Title Line in Chapter One\par}'
hasnt "maketitle/include-chapter-none" "$T/incl-ch-1.tex" '\maketitle'
# A master with no block of its own: the first block is a chapter's, which stays lines. (Its title
# line also counts as the body's own title, so the header's \maketitle is left out — as with the key
# off, today.)
printf -- '---\nTitle: The Book\nLaTeX maketitle: true\n---\n\nThe master'"'"'s text.\n\n@chapter+(one.md)\n@chapter+(two.md)\n' >"$T/header-only.md"
(cd "$T" && HOME="$SCRATCH/home" node "$JMD" process header-only.md --to latex -o header-only.tex >/dev/null 2>header-only.err) \
	|| fail "maketitle/header-only-exit" "$(cat "$T/header-only.err")"
has   "maketitle/chapter-block-stays-lines" "$T/header-only.tex" '{\noindent\LARGE\bfseries A Title Line in Chapter One\par}'
hasnt "maketitle/chapter-block-no-title" "$T/header-only.tex" '\title{A Title Line'
hasnt "maketitle/chapter-block-no-author" "$T/header-only.tex" '\author{Chapter Author}'

# --- not a book: nothing changes ------------------------------------------------------------------

printf -- '---\nTitle: plain\n---\n\n# Plain\n\nNo chapters here.\n' >"$B/plain.md"
(cd "$B" && HOME="$SCRATCH/home" node "$JMD" process plain.md --fragment -o plain.out >/dev/null 2>"$B/plain.err")
hasnt "plain/no-section" "$B/plain.out" 'jmd-chapter'
hasnt "plain/no-source-lines" "$B/plain.out" 'data-source-line'

echo "book: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
