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
# For every tests/features/**/*.expected.tex golden, this wraps the content in
# a minimal document with a per-category preamble and runs pdflatex.
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

for tex in $(find "$REPO/tests/features" -name '*.expected.tex' | sort); do
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
		inline-syntax)     extra='\usepackage{color}\usepackage{soul}';   needs='soul.sty' ;;
		code)              extra='\usepackage{minted}';                   needs='minted.sty' ;;
		math|conditionals) extra='\usepackage{amsmath}';                  needs='amsmath.sty' ;;
		# crossref: label-in-env labels theorem-like environments, so the
		# wrapper declares the two kinds that fixture uses (shared counter,
		# as theorems.js declares them).
		crossref)          extra='\usepackage{amsthm}\usepackage{thmtools}\declaretheorem{theorem}\declaretheorem[style=definition,sibling=theorem]{definition}\usepackage{cleveref}'; needs='thmtools.sty cleveref.sty' ;;
		floats)            extra='\usepackage[draft]{graphicx}\usepackage{subcaption}\usepackage{booktabs}\usepackage{cleveref}'; needs='subcaption.sty cleveref.sty booktabs.sty' ;;
		theorems)          extra='\usepackage{amsthm}\usepackage{thmtools}\declaretheorem{theorem}\declaretheorem[sibling=theorem]{lemma}\declaretheorem[sibling=theorem]{corollary}\declaretheorem[sibling=theorem]{proposition}\declaretheorem[style=definition,sibling=theorem]{definition}\declaretheorem[style=definition,sibling=theorem]{example}\declaretheorem[style=remark,sibling=theorem]{remark}\usepackage{cleveref}'; needs='thmtools.sty cleveref.sty' ;;
		equations)         extra='\usepackage{amsmath}\usepackage{cleveref}'; needs='cleveref.sty' ;;
		listings)          extra='\usepackage{minted}\usepackage{cleveref}'; needs='minted.sty cleveref.sty' ;;
		contents)          extra='\usepackage[draft]{graphicx}\usepackage{booktabs}\usepackage{minted}'; needs='booktabs.sty minted.sty' ;;
		tikz-diagrams)     extra='\usepackage{tikz}\usetikzlibrary{arrows.meta,positioning,shapes,calc}'; needs='tikz.sty' ;;
		alerts)            extra='\usepackage{tcolorbox}'; needs='tcolorbox.sty' ;;
		typography)        extra='\usepackage{minted}'; needs='minted.sty' ;;
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
		indexing)          extra='\usepackage{imakeidx}\makeindex\makeindex[name=authors, title={Author Index}]'; needs='imakeidx.sty' ;;
		# begin-end: the fixtures' generic environments get the same no-op
		# definitions a full-document build auto-provides (fragments carry no
		# preamble, so the wrapper supplies them); game → sgame, callout takes
		# {mandatory}[optional] (hence \NewDocumentEnvironment), theorem is a
		# real \newtheorem, \custom is a macro used inside a TeX block.
		begin-end)         extra='\usepackage{sgame}\usepackage{minted}\newcommand{\custom}[1]{}\newtheorem{theorem}{Theorem}\NewDocumentEnvironment{callout}{m o}{}{}\newenvironment{warning}{}{}\newenvironment{aside}{}{}\newenvironment{note}{}{}\newenvironment{subnote}{}{}\newenvironment{panel}{}{}\newenvironment{pull-quote}{}{}\newenvironment{side-bar}{}{}\newenvironment{outerblock}{}{}\newenvironment{middleblock}{}{}\newenvironment{innerblock}{}{}'; needs='sgame.sty minted.sty' ;;
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
	if [ "$category" = "code" ] || [ "$category" = "listings" ] || [ "$category" = "typography" ] || [ "$category" = "begin-end" ] || [ "$category" = "contents" ] || [ "$category" = "description-lists" ]; then
		if ! command -v pygmentize >/dev/null 2>&1; then
			echo "SKIP  $label  (Pygments/pygmentize not installed)"
			skip=$((skip + 1))
			continue
		fi
		shellesc='-shell-escape'
	fi

	# Build a minimal document. report class so headings/ fixtures, which
	# emit \chapter, have a class that defines it.
	work="$SCRATCH/$category-$name"
	mkdir -p "$work"
	{
		printf '\\documentclass{report}\n'
		printf '%s\n' "$extra"
		printf '\\begin{document}\n'
		cat "$tex"
		printf '\n\\end{document}\n'
	} >"$work/doc.tex"

	if (cd "$work" && pdflatex $shellesc -interaction=nonstopmode -halt-on-error doc.tex >compile.log 2>&1); then
		echo "PASS  $label"
		pass=$((pass + 1))
	else
		echo "FAIL  $label"
		grep -E '^!|^l\.[0-9]' "$work/compile.log" | head -10 | sed 's/^/    | /'
		fail=$((fail + 1))
	fi
done

echo
echo "latex-compile: $pass passed, $fail failed, $skip skipped"
[ "$fail" -eq 0 ]
