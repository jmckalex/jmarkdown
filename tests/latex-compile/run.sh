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
		tables)            extra='\usepackage{multirow}';                 needs='multirow.sty' ;;
		inline-syntax)     extra='\usepackage{color}\usepackage{soul}';   needs='soul.sty' ;;
		code)              extra='\usepackage{minted}';                   needs='minted.sty' ;;
		math|conditionals) extra='\usepackage{amsmath}';                  needs='amsmath.sty' ;;
		crossref)          extra='\usepackage{cleveref}';                 needs='cleveref.sty' ;;
		floats)            extra='\usepackage[draft]{graphicx}\usepackage{subcaption}\usepackage{cleveref}'; needs='subcaption.sty cleveref.sty' ;;
		theorems)          extra='\usepackage{amsthm}\usepackage{thmtools}\declaretheorem{theorem}\declaretheorem[sibling=theorem]{lemma}\declaretheorem[sibling=theorem]{corollary}\declaretheorem[sibling=theorem]{proposition}\declaretheorem[style=definition,sibling=theorem]{definition}\declaretheorem[style=definition,sibling=theorem]{example}\declaretheorem[style=remark,sibling=theorem]{remark}\usepackage{cleveref}'; needs='thmtools.sty cleveref.sty' ;;
		equations)         extra='\usepackage{amsmath}\usepackage{cleveref}'; needs='cleveref.sty' ;;
		listings)          extra='\usepackage{minted}\usepackage{cleveref}'; needs='minted.sty cleveref.sty' ;;
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
	if [ "$category" = "code" ] || [ "$category" = "listings" ]; then
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
