#!/bin/sh
# Opt-in LaTeX compile check — a "security bumper" on top of the golden-file
# tests. The golden-file suite (tests/features) proves the emitted .tex still
# matches a committed snapshot; this script proves that snapshot is actually
# valid LaTeX that compiles.
#
# It is deliberately NOT part of `npm test`: that suite is toolchain-free by
# design. This one needs a TeX installation and assorted packages, so it runs
# only on demand (`npm run test:latex` or directly) and skips gracefully when
# something is missing.
#
# For every tests/features/**/*.expected.tex golden (and tests/callouts', whose
# custom-type golden needs a project config the feature harness cannot give
# it), this wraps the content in a minimal document with a per-category
# preamble and runs pdflatex — and, for callouts and tabbing, LuaLaTeX as
# well: callout icons are TikZ drawings and their boxes tcolorbox skins,
# tabbing's accents and Unicode differ by engine, and both engines are
# promised.
#
# Exit status: non-zero if any fixture FAILed to compile; zero otherwise
# (skips do not fail the run).

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)

echo "=========================================="
echo "latex-compile  (opt-in; not part of npm test)"
echo "=========================================="

if ! command -v pdflatex >/dev/null 2>&1; then
	echo "SKIP all: pdflatex not on PATH — install a TeX distribution to run this check."
	exit 0
fi

SCRATCH=$(mktemp -d -t jmd-latex-compile.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

pass=0
fail=0
skip=0

# Is a LaTeX package/style file installed?
has_pkg() { kpsewhich "$1" >/dev/null 2>&1; }

for tex in $(find "$REPO/tests/features" "$REPO/tests/callouts" -name '*.expected.tex' | sort); do
	category=$(basename "$(dirname "$tex")")
	name=$(basename "$tex" .expected.tex)
	label="$category/$name"

	# Per-category preamble and the package(s) it requires. Each fixture is
	# compiled standalone, so there is never a cross-package conflict (e.g.
	# sgame and multirow are only ever loaded in separate documents).
	extra=''
	needs=''
	case "$category" in
		games)             extra='\usepackage{sgame}';                   needs='sgame.sty' ;;
		tables)            extra='\usepackage{multirow}\usepackage{longtable}\usepackage{caption}\usepackage{booktabs}'; needs='multirow.sty longtable.sty booktabs.sty' ;;
		# inline-syntax: the italics fixtures carry links (bare URLs are
		# autolinked) and a booktabs table.
		inline-syntax)     extra='\usepackage{color}\usepackage{soul}\usepackage{booktabs}\usepackage{hyperref}'; needs='soul.sty booktabs.sty hyperref.sty' ;;
		# scripting: func's heading holds inline code (\mintinline); script-in-code
		# has a table (booktabs).
		scripting)         extra='\usepackage{minted}\usepackage{booktabs}'; needs='minted.sty booktabs.sty' ;;
		# headings: inline-code puts inline code in headings (a moving argument).
		headings)          extra='\usepackage{minted}\usepackage{hyperref}'; needs='minted.sty hyperref.sty' ;;
		# code: minted, and booktabs for html-specials' table of code spans.
		code)              extra='\usepackage{minted}\usepackage{booktabs}'; needs='minted.sty booktabs.sty' ;;
		# code-highlightjs: `LaTeX highlighter: highlight.js` — what a full
		# document then loads in minted's place (fvextra, xcolor, and minted's
		# listing float through the float package), T1 as a full pdfLaTeX
		# document has it; compiled with NO shell escape, by both engines.
		code-highlightjs)  extra='\usepackage[T1]{fontenc}\usepackage{xcolor}\usepackage{fvextra}\usepackage{float}\newfloat{listing}{tbp}{lol}\newcommand{\listingscaption}{Listing}\floatname{listing}{\listingscaption}\newcommand{\listoflistingscaption}{List of Listings}\providecommand{\listoflistings}{\listof{listing}{\listoflistingscaption}}\usepackage{hyperref}\usepackage{cleveref}'; needs='fvextra.sty xcolor.sty float.sty cleveref.sty' ;;
		math|conditionals) extra='\usepackage{amsmath}';                  needs='amsmath.sty' ;;
		# crossref: label-in-env labels theorem-like environments, so the
		# wrapper declares the two kinds that fixture uses (shared counter,
		# as theorems.js declares them); label-in-endnote's \cref names the
		# endnote counter, as a full document's late preamble does.
		crossref)          extra='\usepackage{amsthm}\usepackage{thmtools}\declaretheorem{theorem}\declaretheorem[style=definition,sibling=theorem]{definition}\usepackage{cleveref}\crefname{jmdendnote}{footnote}{footnotes}'; needs='thmtools.sty cleveref.sty' ;;
		floats)            extra='\usepackage[draft]{graphicx}\usepackage{subcaption}\usepackage{booktabs}\usepackage{cleveref}'; needs='subcaption.sty cleveref.sty booktabs.sty' ;;
		# theorems: minted for proof-ends' proof that ends in a code block.
		theorems)          extra='\usepackage{amsthm}\usepackage{thmtools}\declaretheorem{theorem}\declaretheorem[sibling=theorem]{lemma}\declaretheorem[sibling=theorem]{corollary}\declaretheorem[sibling=theorem]{proposition}\declaretheorem[style=definition,sibling=theorem]{definition}\declaretheorem[style=definition,sibling=theorem]{example}\declaretheorem[style=remark,sibling=theorem]{remark}\usepackage{cleveref}\usepackage{minted}'; needs='thmtools.sty cleveref.sty minted.sty' ;;
		equations)         extra='\usepackage{amsmath}\usepackage{cleveref}'; needs='cleveref.sty' ;;
		listings)          extra='\usepackage{minted}\usepackage{cleveref}'; needs='minted.sty cleveref.sty' ;;
		contents)          extra='\usepackage[draft]{graphicx}\usepackage{booktabs}\usepackage{minted}'; needs='booktabs.sty minted.sty' ;;
		tikz-diagrams)     extra='\usepackage{tikz}\usetikzlibrary{arrows.meta,positioning,shapes,calc}'; needs='tikz.sty' ;;
		# alerts: a GFM alert is rendered by callouts.js now, so it needs the
		# callout preamble (see callouts, below).
		alerts)            extra='\usepackage{tcolorbox}\tcbuselibrary{skins,breakable}\usepackage{graphicx}\usepackage{tikz}\usetikzlibrary{svg.path}'; needs='tcolorbox.sty tikz.sty' ;;
		# callouts: what callout-latex.js requires in a full document; the
		# code and inline code inside them render as minted.
		callouts)          extra='\usepackage{tcolorbox}\tcbuselibrary{skins,breakable}\usepackage{graphicx}\usepackage{tikz}\usetikzlibrary{svg.path}\usepackage{minted}\usepackage{amsmath}'; needs='tcolorbox.sty tikz.sty minted.sty' ;;
		typography)        extra='\usepackage{minted}'; needs='minted.sty' ;;
		# tabbing: LaTeX's own environment, no package; minted for the inline
		# code in the fixtures' prose.
		tabbing)           extra='\usepackage{minted}'; needs='minted.sty' ;;
		# description-lists: the codespan-double-colon fixture has inline code
		# spans, which render as \mintinline.
		description-lists) extra='\usepackage{minted}'; needs='minted.sty' ;;
		# math-macros: the definitions live in the (absent) preamble of a
		# fragment, so the wrapper supplies what a full document auto-provides.
		math-macros)       extra='\usepackage{amsmath}\usepackage{amssymb}\newcommand{\RR}{\mathbb{R}}\newcommand{\E}[1]{\mathbb{E}\!\left[#1\right]}\DeclareMathOperator{\argmax}{arg\,max}'; needs='amsmath.sty amssymb.sty' ;;
		# numbered-environments: a numbered user env is a thmtools theorem-like;
		# the \declaretheorem lines live in the (absent) preamble, so the wrapper
		# supplies what a full document auto-provides (exercise + sibling solution).
		numbered-environments) extra='\usepackage{amsthm}\usepackage{thmtools}\declaretheorem[name=Exercise, refname={exercise,exercises}, Refname={Exercise,Exercises}]{exercise}\declaretheorem[name=Solution, refname={solution,solutions}, Refname={Solution,Solutions}, sibling=exercise]{solution}\usepackage{cleveref}'; needs='thmtools.sty cleveref.sty' ;;
		# indexing: fragments carry \index + \printindex; the \makeindex
		# declarations live in the (absent) preamble, so the wrapper supplies
		# them. Without a makeindex run \printindex just warns (no .ind file)
		# — the compile still proves the emitted commands are valid.
		indexing)          extra='\usepackage{imakeidx}\makeindex\makeindex[name=authors, title={Author Index}]\usepackage{minted}'; needs='imakeidx.sty minted.sty' ;;
		# at-directives: inline code (\mintinline), links, a cross-reference,
		# images (draft: their files are not in the tree), title-box's
		# tcolorbox, the tables sources fill (booktabs), and the generic
		# environments the fixtures name, given the no-op definitions a full
		# document auto-provides.
		at-directives)     extra='\usepackage[draft]{graphicx}\usepackage{minted}\usepackage{hyperref}\usepackage{cleveref}\usepackage{tcolorbox}\tcbuselibrary{skins,breakable}\usepackage{booktabs}\newenvironment{note}{}{}\newenvironment{thing}{}{}\newenvironment{myblock}{}{}\newenvironment{my-block}{}{}'; needs='minted.sty cleveref.sty tcolorbox.sty booktabs.sty' ;;
		# media: images in draft (figs/*.png are not in the tree), links,
		# inline code, and video's embed (media9) and attach (attachfile2);
		# tiny.mp4 and frame.png ARE in the tree, found through TEXINPUTS.
		media)             extra='\usepackage[draft]{graphicx}\usepackage{hyperref}\usepackage{minted}\usepackage{media9}\usepackage{attachfile2}'; needs='minted.sty media9.sty attachfile2.sty' ;;
		# generated-headings: its fragment carries an index (\printindex), whose
		# declaration lives in the (absent) preamble, and retitles the
		# bibliography with \refname — article's macro, the fixture's default
		# class; this wrapper's report class calls it \bibname.
		generated-headings) extra='\usepackage{imakeidx}\makeindex\providecommand\refname{References}'; needs='imakeidx.sty' ;;
		# begin-end: the fixtures' generic environments get the same no-op
		# definitions a full-document build auto-provides (fragments carry no
		# preamble, so the wrapper supplies them); game → sgame, callout takes
		# {mandatory}[optional] (hence \NewDocumentEnvironment), theorem is a
		# real \newtheorem, \custom is a macro used inside a TeX block.
		begin-end)         extra='\usepackage{sgame}\usepackage{minted}\newcommand{\custom}[1]{}\newtheorem{theorem}{Theorem}\NewDocumentEnvironment{callout}{m o}{}{}\newenvironment{warning}{}{}\newenvironment{sidebar}[1][]{}{}\newenvironment{aside}{}{}\newenvironment{note}{}{}\newenvironment{subnote}{}{}\newenvironment{panel}{}{}\newenvironment{pull-quote}{}{}\newenvironment{side-bar}{}{}\newenvironment{outerblock}{}{}\newenvironment{middleblock}{}{}\newenvironment{innerblock}{}{}'; needs='sgame.sty minted.sty' ;;
		# obsidian: ![[embeds]] are real images (frame.png beside the fixture).
		obsidian)          extra='\usepackage{graphicx}\usepackage{minted}'; needs='graphicx.sty minted.sty' ;;
		# entities: each prose path an entity takes — a theorem note, a callout's
		# title (tcolorbox, TikZ), a table (booktabs), links, inline code and a
		# block (minted). No fontenc, so pdfLaTeX's is OT1: an entity's
		# character must print without T1 (latex-escape.js); LuaLaTeX too.
		entities)          extra='\usepackage{amsthm}\usepackage{thmtools}\declaretheorem{theorem}\usepackage{tcolorbox}\tcbuselibrary{skins,breakable}\usepackage{graphicx}\usepackage{tikz}\usetikzlibrary{svg.path}\usepackage{booktabs}\usepackage{minted}\usepackage{hyperref}'; needs='thmtools.sty tcolorbox.sty tikz.sty booktabs.sty minted.sty' ;;
		# images: what LaTeX cannot read is a link (hyperref); what it can is
		# \includegraphics, in draft, since the fixture's files are not in the
		# tree — draft still stops on an extension it cannot read, which the
		# links replace. Both engines.
		images)            extra='\usepackage[draft]{graphicx}\usepackage{hyperref}'; needs='hyperref.sty' ;;
		# percent: a `%` on each prose path in a document with no header — a
		# heading, emphasis, a link, both kinds of note, a list, a table, a
		# quote, a callout, a caption, a theorem's note — and the paths a
		# header's comment does not reach. Both engines; the PDF's text is read
		# against <name>.pdf-text, since a `%` TeX took as its comment still
		# compiled where it lost the rest of its line.
		percent)           extra='\usepackage{amsthm}\usepackage{thmtools}\declaretheorem{theorem}\usepackage{tcolorbox}\tcbuselibrary{skins,breakable}\usepackage{graphicx}\usepackage{tikz}\usetikzlibrary{svg.path}\usepackage{booktabs}\usepackage{hyperref}'; needs='thmtools.sty tcolorbox.sty tikz.sty booktabs.sty hyperref.sty' ;;
		# footnotes: in-code's fenced block and markdown-demo are minted.
		footnotes)         extra='\usepackage{minted}'; needs='minted.sty' ;;
		*)                 extra='';                                      needs='' ;;
	esac

	# Skip a fixture whose required package is not installed.
	missing=''
	for pkg in $needs; do
		has_pkg "$pkg" || missing="$pkg"
	done
	if [ -n "$missing" ]; then
		echo "SKIP  $label  ($missing not installed)"
		skip=$((skip + 1))
		continue
	fi

	# minted additionally needs Pygments and -shell-escape.
	shellesc=''
	if [ "$category" = "obsidian" ] || [ "$category" = "code" ] || [ "$category" = "listings" ] || [ "$category" = "typography" ] || [ "$category" = "begin-end" ] || [ "$category" = "contents" ] || [ "$category" = "description-lists" ] || [ "$category" = "callouts" ] || [ "$category" = "scripting" ] || [ "$category" = "headings" ] || [ "$category" = "citations" ] || [ "$category" = "tabbing" ] || [ "$category" = "at-directives" ] || [ "$category" = "indexing" ] || [ "$category" = "media" ] || [ "$category" = "entities" ] || [ "$category" = "footnotes" ]; then
		if ! command -v pygmentize >/dev/null 2>&1; then
			echo "SKIP  $label  (Pygments/pygmentize not installed)"
			skip=$((skip + 1))
			continue
		fi
		shellesc='-shell-escape'
	fi
	[ "$category" = code-highlightjs ] && shellesc='-no-shell-escape'

	work="$SCRATCH/$category-$name"
	mkdir -p "$work"
	engines='pdflatex'
	if [ "$category" = "citations" ]; then
		# Citations compile as the FULL document jmarkdown writes — its own
		# preamble, not this script's — since what is under test is that an
		# export loads natbib/bibentry by itself. The engine is the one that
		# document targets (fontspec → LuaLaTeX).
		src="${tex%.expected.tex}.jmd"
		if ! (cd "$(dirname "$src")" && node "$REPO/src/index.js" process "$(basename "$src")" --to latex -o "$work/doc.tex" >/dev/null 2>"$work/build.log"); then
			echo "FAIL  $label  (jmarkdown exited non-zero)"
			sed 's/^/    | /' "$work/build.log"
			fail=$((fail + 1))
			continue
		fi
		grep -q '{fontspec}' "$work/doc.tex" && engines='lualatex'
	else
		# Build a minimal document. report class so headings/ fixtures, which
		# emit \chapter, have a class that defines it.
		{
			printf '\\documentclass{report}\n'
			printf '%s\n' "$extra"
			printf '\\begin{document}\n'
			cat "$tex"
			printf '\n\\end{document}\n'
		} >"$work/doc.tex"
	fi

	if { [ "$category" = "callouts" ] || [ "$category" = "alerts" ] || [ "$category" = "tabbing" ] || [ "$category" = "code-highlightjs" ] || [ "$category" = "entities" ] || [ "$category" = "images" ] || [ "$category" = "percent" ] || [ "$label" = "code/end-minted" ]; } && command -v lualatex >/dev/null 2>&1; then
		engines='pdflatex lualatex'
	fi
	for engine in $engines; do
		suffix=''
		[ "$engine" = pdflatex ] || suffix=" [$engine]"
		[ "$category" = citations ] && suffix=" [full document, $engine]"
		# The fixture's own folder is on TEXINPUTS, so files it names relative
		# to itself (media's tiny.mp4 and frame.png) are found from $work.
		if (cd "$work" && TEXINPUTS="$(dirname "$tex")//:${TEXINPUTS:-}" $engine $shellesc -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1); then
			echo "PASS  $label$suffix"
			pass=$((pass + 1))
			# A callout broken across pages: check the RENDERED pages, since a
			# part that lost its colours still compiles (callout-pages.mjs).
			if [ "$label" = "callouts/page-break" ]; then
				if ! command -v pdftoppm >/dev/null 2>&1; then
					echo "SKIP  $label$suffix [pages]  (pdftoppm not installed)"
				elif node "$HERE/callout-pages.mjs" "$work/doc.pdf" E08C3C FBF1E8 >"$work/pages.log" 2>&1; then
					echo "PASS  $label$suffix [pages]"
					pass=$((pass + 1))
				else
					echo "FAIL  $label$suffix [pages]"
					sed 's/^/    | /' "$work/pages.log"
					fail=$((fail + 1))
				fi
			fi
			# percent: the PDF shows what the HTML shows. Each line of
			# <name>.pdf-text must be in its text; a line starting `!` must not.
			if [ "$category" = "percent" ]; then
				if ! command -v pdftotext >/dev/null 2>&1; then
					echo "SKIP  $label$suffix [text]  (pdftotext not installed)"
				else
					pdftotext -q "$work/doc.pdf" "$work/doc.txt"
					text=$(tr '\n' ' ' <"$work/doc.txt" | tr -s ' ')
					problems=''
					while IFS= read -r want; do
						case "$want" in
							'!'*) case "$text" in *"${want#!}"*) problems="$problems [shown: ${want#!}]" ;; esac ;;
							*) case "$text" in *"$want"*) ;; *) problems="$problems [missing: $want]" ;; esac ;;
						esac
					done <"${tex%.expected.tex}.pdf-text"
					if [ -z "$problems" ]; then
						echo "PASS  $label$suffix [text]"
						pass=$((pass + 1))
					else
						echo "FAIL  $label$suffix [text]$problems"
						fail=$((fail + 1))
					fi
				fi
			fi
		else
			echo "FAIL  $label$suffix"
			grep -E '^!|^l\.[0-9]' "$work/compile.log" | head -10 | sed 's/^/    | /'
			fail=$((fail + 1))
		fi
	done
done

# --- Full documents: the preamble jmarkdown writes itself --------------------------
# The goldens above compile inside this script's own wrapper, so the engine's
# preamble is never compiled there. These build FULL documents and read the
# PDF's text. A \crefname that went out without cleveref — any numbered thing
# plus hyperref, which every full document loads — printed its arguments at
# the top of page 1 ("equationequationequations"); with -halt-on-error, it
# stopped the build. A <style> block printed its CSS; a list item's `&`
# stopped the build too, and its inline `#` printed as `\#`; so did a `&` in
# the paragraphs after an inline tag left open, and in a block nested in a
# list item. A document with a Title header and a title of its own in the body
# printed both, \maketitle above the body's; under `LaTeX maketitle` the
# body's block is the title page, once, and with no Title header its title
# is the PDF's (pdfinfo, where installed). A bare address with a `%`
# commented out the rest of its line, one with `_` stopped the build and a
# `~` printed as a space; a link's `%` in a note or heading lost the line. The fixtures are
# tests/latex-document's.
if command -v pdftotext >/dev/null 2>&1; then
	for name in cref-unused cref-used style-block list-specials unclosed-tag list-nested title-page-body title-maketitle title-maketitle-header title-maketitle-pdftitle url-percent url-specials; do
		label="full-document/$name"
		work="$SCRATCH/full-$name"
		mkdir -p "$work"
		# HOME is the scratch folder, so no global config changes the preamble.
		if ! HOME="$work" node "$REPO/src/index.js" process "$REPO/tests/latex-document/$name.jmd" --to latex -o "$work/doc.tex" >/dev/null 2>"$work/build.log"; then
			echo "FAIL  $label  (jmarkdown exited non-zero)"
			sed 's/^/    | /' "$work/build.log"
			fail=$((fail + 1))
			continue
		fi
		# -shell-escape: list-specials' inline code is minted.
		if ! (cd "$work" && pdflatex -shell-escape -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1 \
			&& pdflatex -shell-escape -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1); then
			echo "FAIL  $label"
			grep -E '^!|^l\.[0-9]' "$work/compile.log" | head -10 | sed 's/^/    | /'
			fail=$((fail + 1))
			continue
		fi
		pdftotext "$work/doc.pdf" "$work/doc.txt"
		problems=''
		for doubled in equationequation EquationEquation tabletable TableTable footnotefootnote FootnoteFootnote; do
			grep -q "$doubled" "$work/doc.txt" && problems="$problems $doubled"
		done
		[ "$name" = cref-used ] && ! grep -q 'See equation (1) and table 1' "$work/doc.txt" && problems="$problems no-full-words"
		# A <style> block prints nothing (it used to print its CSS).
		[ "$name" = style-block ] && grep -q 'color\|margin\|font-style' "$work/doc.txt" && problems="$problems css-printed"
		[ "$name" = style-block ] && ! grep -q 'The prose after it prints.' "$work/doc.txt" && problems="$problems prose-missing"
		# `&`, `#` and code in list items print as written, once escaped.
		if [ "$name" = list-specials ]; then
			grep -q 'Prose with an ampersand & and a hash # in it.' "$work/doc.txt" || problems="$problems list-prose"
			grep -q 'A hash in code #, and #project/clew.' "$work/doc.txt" || problems="$problems list-code"
			grep -q 'Loose code #.' "$work/doc.txt" || problems="$problems list-loose"
			grep -q '#include & more' "$work/doc.txt" || problems="$problems raw-html"
			grep -qF '\#' "$work/doc.txt" && problems="$problems backslash-printed"
		fi
		# Blocks nested in list items print their `&` and `#` as written.
		if [ "$name" = list-nested ]; then
			grep -q 'Callout prose & a hash # and code #tag.' "$work/doc.txt" || problems="$problems nested-callout"
			grep -q 'Theorem prose & a hash #.' "$work/doc.txt" || problems="$problems nested-theorem"
			grep -q 'Aside prose & a hash #.' "$work/doc.txt" || problems="$problems nested-generic"
			grep -qF '\#' "$work/doc.txt" && problems="$problems backslash-printed"
		fi
		# One title on the page, the body's: no \maketitle above it.
		if [ "$name" = title-page-body ]; then
			grep -q 'Body Title' "$work/doc.txt" || problems="$problems body-title-missing"
			grep -q 'Header Title' "$work/doc.txt" && problems="$problems maketitle-printed"
		fi
		# Under `LaTeX maketitle` the body's block is the title page, printed once;
		# the second block is lines, and a missing date prints no date.
		if [ "$name" = title-maketitle ]; then
			grep -q 'Body Title: x = y, 50% off, #1, a{b, \\section' "$work/doc.txt" || problems="$problems title"
			grep -q 'A Subtitle at https://example.com/a%20b#part' "$work/doc.txt" || problems="$problems subtitle"
			grep -q 'Body Author & Co.' "$work/doc.txt" || problems="$problems author"
			grep -q 'A Second Title' "$work/doc.txt" || problems="$problems second-block"
			grep -q 'Header Title' "$work/doc.txt" && problems="$problems header-title-printed"
			grep -q 'October 2026' "$work/doc.txt" && problems="$problems date-printed"
		fi
		if [ "$name" = title-maketitle-header ]; then
			grep -q 'Header Title' "$work/doc.txt" || problems="$problems title"
			grep -q '20[0-9][0-9]' "$work/doc.txt" && problems="$problems date-printed"
		fi
		# With no header Title, the PDF's Title is the body block's title, as text.
		if [ "$name" = title-maketitle-pdftitle ]; then
			grep -q 'A Study of x & {y} & Links with x2, _under' "$work/doc.txt" || problems="$problems title"
			if command -v pdfinfo >/dev/null 2>&1; then
				pdfinfo "$work/doc.pdf" | grep -qx 'Title: *A Study of x & {y} & Links with x^2, _under' || problems="$problems pdfinfo-title"
			fi
		fi
		# A bare address with a `%` prints whole, and the text after it too.
		if [ "$name" = url-percent ]; then
			grep -q 'See https://example.com/a%20b for more' "$work/doc.txt" || problems="$problems plain"
			grep -q 'https://example.com/c%2Fd#part' "$work/doc.txt" || problems="$problems angle"
			grep -q 'at https://example.com/g%20h in a note.' "$work/doc.txt" || problems="$problems footnote"
			grep -q 'Heading https://example.com/m%20n' "$work/doc.txt" || problems="$problems heading"
			grep -q 'The paragraph after them prints.' "$work/doc.txt" || problems="$problems after"
			grep -qF '\%' "$work/doc.txt" && problems="$problems backslash-printed"
		fi
		# A bare address prints its `_` and `~`; a link's `%` in a note and a heading
		# keeps the line.
		if [ "$name" = url-specials ]; then
			grep -q 'See https://example.com/a_b_c and https://example.com/~me/page here' "$work/doc.txt" || problems="$problems bare"
			grep -q 'In the note, the page and https://example.com/n_o~p.' "$work/doc.txt" || problems="$problems note"
			grep -q 'Heading linked' "$work/doc.txt" || problems="$problems heading"
			grep -q 'The paragraph after them prints.' "$work/doc.txt" || problems="$problems after"
		fi
		# Text after an inline tag left open is escaped like any other.
		if [ "$name" = unclosed-tag ]; then
			grep -q 'Next paragraph & with # specials.' "$work/doc.txt" || problems="$problems after-unclosed"
			grep -q 'A list item & # after it.' "$work/doc.txt" || problems="$problems list-after-unclosed"
		fi
		if [ -z "$problems" ]; then
			echo "PASS  $label [pdf text]"
			pass=$((pass + 1))
		else
			echo "FAIL  $label [pdf text]  (found:$problems)"
			fail=$((fail + 1))
		fi
	done
else
	echo "SKIP  full-document/*  (pdftotext not installed)"
	skip=$((skip + 1))
fi

# A `%` in what jmarkdown writes into \title, \author, \date, pdftitle and
# pdfauthor — from a header (title-percent) or, under `LaTeX maketitle`, from
# the body's block in a document with no header (title-percent-block; the key
# from a project config, as a host sets it) — was a comment that swallowed the
# closing brace, and the build stopped. Both engines; the PDF's text, and its
# Title and Author (pdfinfo, where installed). The fixtures are
# tests/latex-document's.
if command -v pdftotext >/dev/null 2>&1; then
	for name in title-percent title-percent-block; do
		for engine in pdflatex lualatex; do
			label="full-document/$name [$engine]"
			if ! command -v "$engine" >/dev/null 2>&1; then
				echo "SKIP  $label  ($engine not installed)"
				skip=$((skip + 1))
				continue
			fi
			work="$SCRATCH/full-$name-$engine"
			mkdir -p "$work/.jmarkdown"
			[ "$name" = title-percent-block ] && printf '{ "LaTeX maketitle": true }\n' > "$work/.jmarkdown/config.json"
			if ! (cd "$work" && HOME="$work" node "$REPO/src/index.js" process "$REPO/tests/latex-document/$name.jmd" --to latex -o doc.tex >/dev/null 2>build.log); then
				echo "FAIL  $label  (jmarkdown exited non-zero)"
				sed 's/^/    | /' "$work/build.log"
				fail=$((fail + 1))
				continue
			fi
			if ! (cd "$work" && $engine -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1); then
				echo "FAIL  $label"
				grep -E '^!|^l\.[0-9]' "$work/compile.log" | head -10 | sed 's/^/    | /'
				fail=$((fail + 1))
				continue
			fi
			pdftotext "$work/doc.pdf" "$work/doc.txt"
			problems=''
			if [ "$name" = title-percent ]; then
				grep -q 'Up 50% and 25% Today' "$work/doc.txt" || problems="$problems title"
				want_title='Up 50% and 25% Today'
			else
				grep -q 'Up 50% Today' "$work/doc.txt" || problems="$problems title"
				want_title='Up 50% Today'
			fi
			grep -q 'Ann 50% Bo' "$work/doc.txt" || problems="$problems author"
			grep -q '50% May' "$work/doc.txt" || problems="$problems date"
			grep -q 'The prose after the title.' "$work/doc.txt" || problems="$problems prose"
			if command -v pdfinfo >/dev/null 2>&1; then
				pdfinfo "$work/doc.pdf" | grep -qx "Title: *$want_title" || problems="$problems pdfinfo-title"
				[ "$name" = title-percent ] && ! pdfinfo "$work/doc.pdf" | grep -qx 'Author: *Ann 50% Bo' && problems="$problems pdfinfo-author"
			fi
			if [ -z "$problems" ]; then
				echo "PASS  $label [pdf text]"
				pass=$((pass + 1))
			else
				echo "FAIL  $label [pdf text]  (found:$problems)"
				fail=$((fail + 1))
			fi
		done
	done
fi

# `LaTeX highlighter: highlight.js`: a full document of code — blocks, inline
# code in a heading and a note, a listing float and {{LOL}}, code in a callout
# — compiles with NO shell escape (a TeX with no Python, as on the iPad), by
# pdfLaTeX, by LuaLaTeX, and by LuaLaTeX under `LaTeX engine: lualatex`
# (fontspec); it loads no minted and runs no Pygments. The fixture is
# tests/latex-document's.
if command -v pdftotext >/dev/null 2>&1; then
	for variant in pdflatex lualatex fontspec; do
		engine=$variant
		[ "$variant" = fontspec ] && engine=lualatex
		if ! command -v "$engine" >/dev/null 2>&1; then
			echo "SKIP  full-document/code-highlightjs [$variant]  ($engine not installed)"
			skip=$((skip + 1))
			continue
		fi
		label="full-document/code-highlightjs [$variant]"
		work="$SCRATCH/full-code-highlightjs-$variant"
		mkdir -p "$work"
		src="$REPO/tests/latex-document/code-highlightjs.jmd"
		if [ "$variant" = fontspec ]; then
			{ head -n 1 "$src"; echo 'LaTeX engine: lualatex'; tail -n +2 "$src"; } >"$work/doc.jmd"
		else
			cp "$src" "$work/doc.jmd"
		fi
		if ! HOME="$work" node "$REPO/src/index.js" process "$work/doc.jmd" --to latex -o "$work/doc.tex" >/dev/null 2>"$work/build.log"; then
			echo "FAIL  $label  (jmarkdown exited non-zero)"
			sed 's/^/    | /' "$work/build.log"
			fail=$((fail + 1))
			continue
		fi
		if ! (cd "$work" && $engine -no-shell-escape -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1 \
			&& $engine -no-shell-escape -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1); then
			echo "FAIL  $label"
			grep -E '^!|^l\.[0-9]' "$work/compile.log" | head -10 | sed 's/^/    | /'
			fail=$((fail + 1))
			continue
		fi
		pdftotext "$work/doc.pdf" "$work/doc.txt"
		problems=''
		grep -q 'minted' "$work/doc.tex" && problems="$problems minted-in-tex"
		grep -qi 'minted\|pygments' "$work/doc.log" && problems="$problems minted-in-log"
		grep -q 'def greet(name):' "$work/doc.txt" || problems="$problems block"
		# (pdftotext breaks lines where the colour changes.)
		grep -q 'return f"Hello, {name}!"' "$work/doc.txt" || problems="$problems block-string"
		grep -q '# 100% friendly' "$work/doc.txt" || problems="$problems block-comment"
		grep -q 'Code with x = {a} in a heading' "$work/doc.txt" || problems="$problems heading"
		grep -q 'A note with a_b' "$work/doc.txt" || problems="$problems note"
		grep -q '^& c.$' "$work/doc.txt" || problems="$problems note-ampersand"
		grep -q 'Listing 1: A listing' "$work/doc.txt" || problems="$problems listing"
		grep -q 'See listing 1.' "$work/doc.txt" || problems="$problems cref"
		grep -q 'echo "$HOME" | grep -v x' "$work/doc.txt" || problems="$problems callout"
		grep -q 'The paragraph after them prints.' "$work/doc.txt" || problems="$problems after"
		if [ -z "$problems" ]; then
			echo "PASS  $label [no shell escape]"
			pass=$((pass + 1))
		else
			echo "FAIL  $label [no shell escape]  (found:$problems)"
			fail=$((fail + 1))
		fi
	done
fi

# Every HTML entity escapeLatexText writes as its character (PROSE_ENTITIES,
# src/latex-escape.js), in a header's Title and Author, a heading, a note, a
# caption and a list: a full document under pdfLaTeX (T1), LuaLaTeX and
# LuaLaTeX with fontspec, and the --fragment in a plain document, whose
# pdfLaTeX font encoding is OT1. The PDF's text prints each one as the browser
# shows it (entities-check.mjs), and its Title holds them. The fixture is
# tests/latex-document's.
if command -v pdftotext >/dev/null 2>&1; then
	src="$REPO/tests/latex-document/entities-all.jmd"
	for variant in pdflatex lualatex fontspec fragment; do
		engine=$variant
		[ "$variant" = fontspec ] && engine=lualatex
		[ "$variant" = fragment ] && engine=pdflatex
		label="full-document/entities-all [$variant]"
		[ "$variant" = fragment ] && label="entities-all [fragment, OT1]"
		if ! command -v "$engine" >/dev/null 2>&1; then
			echo "SKIP  $label  ($engine not installed)"
			skip=$((skip + 1))
			continue
		fi
		work="$SCRATCH/entities-all-$variant"
		mkdir -p "$work"
		if [ "$variant" = fontspec ]; then
			{ head -n 1 "$src"; echo 'LaTeX engine: lualatex'; tail -n +2 "$src"; } >"$work/doc.jmd"
		else
			cp "$src" "$work/doc.jmd"
		fi
		frag=''
		[ "$variant" = fragment ] && frag='--fragment'
		if ! HOME="$work" node "$REPO/src/index.js" process "$work/doc.jmd" --to latex $frag -o "$work/body.tex" >/dev/null 2>"$work/build.log"; then
			echo "FAIL  $label  (jmarkdown exited non-zero)"
			sed 's/^/    | /' "$work/build.log"
			fail=$((fail + 1))
			continue
		fi
		if [ "$variant" = fragment ]; then
			{
				printf '\\documentclass{report}\n\\begin{document}\n'
				cat "$work/body.tex"
				printf '\n\\end{document}\n'
			} >"$work/doc.tex"
		else
			mv "$work/body.tex" "$work/doc.tex"
		fi
		if ! (cd "$work" && $engine -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1); then
			echo "FAIL  $label"
			grep -E '^!|^l\.[0-9]' "$work/compile.log" | head -10 | sed 's/^/    | /'
			fail=$((fail + 1))
			continue
		fi
		pdftotext -enc UTF-8 "$work/doc.pdf" "$work/doc.txt"
		problems=''
		missing=$(node "$REPO/tests/latex-document/entities-check.mjs" pdf "$src" "$work/doc.txt" 2>&1) || problems="$problems text($missing)"
		grep -q 'Missing character' "$work/doc.log" && problems="$problems missing-glyph"
		grep -q 'The paragraph after them prints.' "$work/doc.txt" || problems="$problems after"
		if [ "$variant" != fragment ] && command -v pdfinfo >/dev/null 2>&1; then
			pdfinfo "$work/doc.pdf" | grep -q '^Title: *Every entity: & < > # / \* ' || problems="$problems pdfinfo-title"
			pdfinfo "$work/doc.pdf" | grep -q '^Title:.*– — … ‘ ’ “ ”' || problems="$problems pdfinfo-title-dashes"
			pdfinfo "$work/doc.pdf" | grep -q '^Author: *Ann & Bo — ' || problems="$problems pdfinfo-author"
		fi
		if [ -z "$problems" ]; then
			echo "PASS  $label [pdf text]"
			pass=$((pass + 1))
		else
			echo "FAIL  $label [pdf text]  (found:$problems)"
			fail=$((fail + 1))
		fi
	done
fi

# `LaTeX T1 fonts: lmodern` (config or host only): a pdfLaTeX document — roman,
# bold, italic, typewriter (`LaTeX highlighter: highlight.js`), maths, a note —
# is set in Latin Modern's Type 1 fonts alone: no Type 3 bitmaps, which a TeX
# without cm-super makes of the EC fonts, and no cm-super (SF…). Off, it
# compiles as always (latex-document checks its .tex is byte-identical). The
# fixture is tests/latex-document's.
if command -v pdffonts >/dev/null 2>&1; then
	for variant in on off; do
		label="full-document/t1-fonts [$variant]"
		work="$SCRATCH/t1-fonts-$variant"
		mkdir -p "$work/.jmarkdown"
		[ "$variant" = on ] && printf '{ "LaTeX T1 fonts": "lmodern" }\n' > "$work/.jmarkdown/config.json"
		if ! (cd "$work" && HOME="$work" node "$REPO/src/index.js" process "$REPO/tests/latex-document/t1-fonts.jmd" --to latex -o doc.tex >/dev/null 2>build.log); then
			echo "FAIL  $label  (jmarkdown exited non-zero)"
			sed 's/^/    | /' "$work/build.log"
			fail=$((fail + 1))
			continue
		fi
		if ! (cd "$work" && pdflatex -no-shell-escape -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1); then
			echo "FAIL  $label"
			grep -E '^!|^l\.[0-9]' "$work/compile.log" | head -10 | sed 's/^/    | /'
			fail=$((fail + 1))
			continue
		fi
		problems=''
		if [ "$variant" = on ]; then
			pdffonts "$work/doc.pdf" | tail -n +3 > "$work/fonts.txt"
			[ -s "$work/fonts.txt" ] || problems="$problems no-fonts"
			grep -q 'Type 3' "$work/fonts.txt" && problems="$problems type3"
			grep -q '+SF' "$work/fonts.txt" && problems="$problems cm-super"
			grep -v '+LM' "$work/fonts.txt" | grep -q . && problems="$problems not-lm"
		fi
		pdftotext "$work/doc.pdf" - | grep -q 'The paragraph after them prints.' || problems="$problems text"
		if [ -z "$problems" ]; then
			echo "PASS  $label [fonts]"
			pass=$((pass + 1))
		else
			echo "FAIL  $label [fonts]  (found:$problems)"
			sed 's/^/    | /' "$work/fonts.txt" 2>/dev/null
			fail=$((fail + 1))
		fi
	done
else
	echo "SKIP  full-document/t1-fonts  (pdffonts not installed)"
	skip=$((skip + 1))
fi

echo
echo "latex-compile: $pass passed, $fail failed, $skip skipped"
[ "$fail" -eq 0 ]
