#!/bin/sh
# The LaTeX-export lint (src/latex-lint.js): every warning fires on what it is
# for and stays quiet on the near miss beside it, codes silence it, and a clean
# document says nothing — in an HTML build (where an author sees it) and a full
# LaTeX one.
#
# A suite rather than feature fixtures because the fixtures are LaTeX that does
# not compile (latex-compile would try), and because the package check reads
# the config: HOME points at an empty folder, so a global `Math macros` or
# `Packages` cannot hide a warning.
#
# Usage:  sh tests/latex-lint/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-latex-lint.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "latex-lint  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0
pass() { printf 'PASS  latex-lint/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  latex-lint/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
has()  { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected: $3" "got: $(grep 'latex-export' "$2" | head -5)"; fi; }
hasnt() { if grep -qF -- "$3" "$2"; then fail "$1" "unexpected: $(grep -F -- "$3" "$2" | head -3)"; else pass "$1"; fi; }
count() { n=$(grep -c 'latex-export' "$2"); if [ "$n" = "$3" ]; then pass "$1"; else fail "$1" "expected $3 lint warnings, got $n:" "$(grep 'latex-export' "$2")"; fi; }

mkdir -p "$SCRATCH/home"
cd "$SCRATCH" || exit 1
# doc NAME — the document from stdin; html NAME / latex NAME — build it, stderr in NAME.{html,latex}.err
doc() { cat >"$1.md"; }
html()  { HOME="$SCRATCH/home" node "$JMD" process "$1.md" --fragment -o "$1.html" >/dev/null 2>"$1.html.err"; }
latex() { HOME="$SCRATCH/home" node "$JMD" process "$1.md" --to latex -o "$1.tex" >/dev/null 2>"$1.latex.err"; }

# --- a clean document says nothing ----------------------------------------------

doc clean <<'EOF'
---
Title: clean
---

It costs \$5 and \$10, and $x^2 + y_1$ is maths, as is $$\frac{a}{b}$$ and \(\sqrt{2}\).
A set {a, b} with matched braces, a path in code: `C:\Users\me`, and the price `$5` in code.

\begin{equation}
E = mc^2
\end{equation}

```python
cost = "$5"   # a } in code, a C:\path
```
EOF
html clean
count "clean/html" clean.html.err 0
latex clean
count "clean/latex" clean.latex.err 0
if command -v pdflatex >/dev/null 2>&1; then
	sed -e '/fontspec/d' -e '/setmainfont/d' clean.tex >clean-pdf.tex
	if pdflatex -interaction=nonstopmode -halt-on-error clean-pdf.tex >/dev/null 2>&1; then pass "clean/compiles"; else fail "clean/compiles" "$(grep -m3 '^!' clean-pdf.log)"; fi
fi

# --- dollars -------------------------------------------------------------------------

doc dollars <<'EOF'
---
Title: dollars
---

It costs $5 and $10 today.

A single $ sign here.

Escaped, \$5 and \$10 are fine; so is $3x = 6$.
EOF
html dollars
has   "dollars/amounts" dollars.html.err 'latex-export [dollars]: "$5 and $10" is read as maths'
has   "dollars/lone" dollars.html.err 'latex-export [dollars]: a lone "$"'
count "dollars/only-those" dollars.html.err 2

# --- display-math --------------------------------------------------------------------

doc display <<'EOF'
---
Title: display
Packages: amsmath
---

$$\begin{align*} a &= b \\ c &= d \end{align*}$$

Inline: \[ \begin{gather} x \end{gather} \]

@begin(equation)
\begin{align} y \end{align}
@end(equation)

\begin{align*}
a &= b
\end{align*}

$$\begin{aligned} a &= b \end{aligned}$$
EOF
html display
has   "display-math/dollars" display.html.err 'latex-export [display-math]: \begin{align*} inside $$ … $$'
has   "display-math/brackets" display.html.err 'latex-export [display-math]: \begin{gather} inside \[ … \]'
has   "display-math/equation" display.html.err 'latex-export [display-math]: \begin{align} inside @begin(equation)'
count "display-math/bare-and-aligned-are-fine" display.html.err 3

# --- mathjax-only --------------------------------------------------------------------

doc mathjax <<'EOF'
---
Title: mathjax
Packages: cancel
---

$\require{cancel}\cancel{x}$, $\bbox[yellow]{y}$ and $\class{hi}{z}$.
EOF
html mathjax
has   "mathjax-only/require" mathjax.html.err 'latex-export [mathjax-only]: \require is'
has   "mathjax-only/bbox" mathjax.html.err 'latex-export [mathjax-only]: \bbox is'
has   "mathjax-only/class" mathjax.html.err 'latex-export [mathjax-only]: \class is'
hasnt "mathjax-only/cancel-loaded" mathjax.html.err '[package]'

# --- package -------------------------------------------------------------------------

doc packages <<'EOF'
---
Title: packages
---

$\mathbb{R}$, $\Box$, $\blacksquare$, $\text{if}$, $\cancel{x}$, $\mathscr{L}$, and
$\begin{cases} 1 & x \\ 0 & y \end{cases}$; core $\mathcal{C}$, $\frac{1}{2}$, $\sqrt{x}$ need nothing.
EOF
html packages
has   "package/amssymb" packages.html.err 'latex-export [package]: \mathbb, \Box, \blacksquare need the amssymb package'
has   "package/amsmath" packages.html.err 'latex-export [package]: \text, \begin{cases} need the amsmath package'
has   "package/cancel" packages.html.err 'latex-export [package]: \cancel needs the cancel package'
has   "package/mathrsfs" packages.html.err 'latex-export [package]: \mathscr needs the mathrsfs package'
count "package/core-is-fine" packages.html.err 4
latex packages
has   "package/latex-full-document" packages.latex.err 'latex-export [package]: \mathbb, \Box, \blacksquare need the amssymb package'
HOME="$SCRATCH/home" node "$JMD" process packages.md --to latex --fragment -o packages-frag.tex >/dev/null 2>packages-frag.err
hasnt "package/latex-fragment-unchecked" packages-frag.err '[package]'

# What provides them: `Packages`, a \usepackage in `LaTeX preamble`, a maths
# font, the class, `Math macros`, an equation (equations.js loads amsmath), and
# a command the document defines itself.
MATHS='$\mathbb{R}$, $\text{if}$.'
provider() {   # provider NAME HEADER-LINE [MATHS]
	printf -- '---\nTitle: %s\n%s\n---\n\n%s\n' "$1" "$2" "${3:-$MATHS}" >"$1.md"
	html "$1"
}
provider by-packages 'Packages: amssymb, amsmath'
count "provided/Packages" by-packages.html.err 0
provider by-preamble 'LaTeX preamble: \usepackage[intlimits]{amsmath}\usepackage{newtxmath}'
count "provided/LaTeX-preamble-and-maths-font" by-preamble.html.err 0
# amsart loads amsmath and amsfonts (so \mathbb), not amssymb (\blacksquare).
provider by-class 'Document class: amsart' '$\mathbb{R}$, $\text{if}$, $\blacksquare$.'
hasnt "provided/amsart-amsmath" by-class.html.err 'amsmath package'
has   "provided/amsart-amsfonts-not-amssymb" by-class.html.err 'latex-export [package]: \blacksquare needs the amssymb package'
provider by-macros 'Math macros: \newcommand{\R}{\mathbb{R}}' '$\R$ and $\text{if}$.'
count "provided/Math-macros" by-macros.html.err 0
printf -- '---\nTitle: eq\n---\n\n$\\text{if}$\n\n@begin(equation)\nx\n@end(equation)\n' >by-equation.md
html by-equation
count "provided/equation-loads-amsmath" by-equation.html.err 0
provider by-own 'Title2: x' '$\newcommand{\text}[1]{#1}\text{mine}$.'
count "provided/defined-by-the-document" by-own.html.err 0

# --- backslash -----------------------------------------------------------------------

doc backslash <<'EOF'
---
Title: backslash
---

Saved to C:\Users\me\notes, and a share at server\share\dir.

A \LaTeX logo, a \newpage, and `C:\in\code` are not paths.
EOF
html backslash
has   "backslash/drive" backslash.html.err 'latex-export [backslash]: "C:\Users\me\notes,"'
count "backslash/only-paths" backslash.html.err 1

# --- braces --------------------------------------------------------------------------

doc braces <<'EOF'
---
Title: braces
---

A lone } here.

A set {a, b}, an escaped \} and \{, all fine.
EOF
html braces
has   "braces/unmatched" braces.html.err 'latex-export [braces]: an unmatched "}" in "A lone } here."'
count "braces/only-that" braces.html.err 1

# --- silencing -----------------------------------------------------------------------

{ printf -- '---\nTitle: quiet\nSilence warnings: dollars\n---\n\nIt costs $5 and $10, and $\\require{x}$.\n'; } >quiet.md
html quiet
hasnt "silence/code" quiet.html.err '[dollars]'
has   "silence/others-remain" quiet.html.err '[mathjax-only]'
{ printf -- '---\nTitle: hush\nSilence warnings: latex-export\n---\n\nIt costs $5 and $10, and $\\require{x}$ and a } brace.\n'; } >hush.md
html hush
count "silence/all" hush.html.err 0
mkdir -p configured/.jmarkdown
printf '{ "Silence warnings": ["braces"] }\n' >configured/.jmarkdown/config.json
cp braces.md configured/braces.md
(cd configured && HOME="$SCRATCH/home" node "$JMD" process braces.md --fragment -o braces.html >/dev/null 2>braces.err)
count "silence/config" configured/braces.err 0

echo "latex-lint: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
