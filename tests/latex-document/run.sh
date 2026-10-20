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

# --- citations.jmd: the \cite family loads natbib by itself; \fullcite (→
#     \bibentry) loads bibentry and reads the .bbl at \begin{document}. A full
#     document used to leave all three to the author, so it did not compile. ---
if render citations; then
	want "cite/natbib"          "$TEX" '\usepackage{natbib}'
	want "cite/bibentry"        "$TEX" '\usepackage{bibentry}'
	want "cite/nobibliography*" "$TEX" '\AtBeginDocument{\nobibliography*}'
	want "cite/citet"           "$TEX" '\citet{Quine:1948}'
	want "cite/bibentry entry"  "$TEX" '\bibentry{Quine:1948}'
	want "cite/bibliography"    "$TEX" '\bibliography{'
	# An author-year style (chicago) keeps natbib's default and plainnat.
	absent "cite/author-year: no numbers" "$TEX" '\usepackage[numbers'
	want   "cite/author-year: plainnat"   "$TEX" '\bibliographystyle{plainnat}'
fi

# --- citations-numeric.jmd: a numeric CSL style (vancouver — its own
#     citation-format says so) is numeric in print too: natbib's numbers
#     option, sorted and compressed like the HTML, and unsrtnat, numbered by
#     first citation as the HTML is. ---
if render citations-numeric; then
	want "numeric/natbib numbers" "$TEX" '\usepackage[numbers,sort&compress]{natbib}'
	want "numeric/unsrtnat"       "$TEX" '\bibliographystyle{unsrtnat}'
fi
# --- engine-lua.jmd: the engine tunes font/encoding defaults; class falls back ---
if render engine-lua; then
	want   "lua/fontspec"      "$TEX" '\usepackage{fontspec}'
	absent "lua/no inputenc"   "$TEX" '\usepackage[utf8]{inputenc}'
	want   "lua/default class" "$TEX" '\documentclass{article}'
	# A document with no citations loads neither citation package.
	absent "lua/no natbib"     "$TEX" '\usepackage{natbib}'
	absent "lua/no bibentry"   "$TEX" '\usepackage{bibentry}'
fi

# --- frontmatter-escape.jmd: plain-text Title/Author escape &/# before \title{} ---
if render frontmatter-escape; then
	want "escape/title"  "$TEX" '\title{Risk \& Reward \#1}'
	want "escape/author" "$TEX" '\author{A \& B}'
fi

# --- title-page-body.jmd: a Title header AND a title of the body's own
#     (@title+). The HTML shows the body's title alone (the header is the
#     page's <title>), so LaTeX leaves out \maketitle and prints one title;
#     \title, \author, \date and the PDF's metadata stay. ---
if render title-page-body; then
	want   "own-title/title"      "$TEX" '\title{Header Title}'
	want   "own-title/author"     "$TEX" '\author{Header Author}'
	want   "own-title/date"       "$TEX" '\date{October 2026}'
	want   "own-title/pdftitle"   "$TEX" 'pdftitle={Header Title}'
	want   "own-title/body title" "$TEX" '{\noindent\LARGE\bfseries Body Title\par}'
	absent "own-title/no maketitle" "$TEX" '\maketitle'
fi

# --- title-maketitle.jmd: `LaTeX maketitle: true` makes the body's first
#     title block LaTeX's own — \title, \author, \date, then \maketitle where
#     it stands — and the header's \maketitle is left out, as before. A
#     subtitle is a smaller line in \title, an institution goes under its
#     author, authors are set apart with \and, and a missing date is \date{}.
#     Inline code and a link's URL are set to survive being an argument, as in
#     a heading. A second block prints as lines. ---
if render title-maketitle; then
	want   "maketitle/title"       "$TEX" '\title{Body Title: \mintinline{text}{x = y}, \texttt{50\% off}, \texttt{\#1}, \texttt{a\{b}, \texttt{\textbackslash{}section} and $x^2_1$\\{\large A Subtitle at \href{https://example.com/a\%20b\#part}{https://example.com/a\%20b\#part}}}'
	want   "maketitle/author"      "$TEX" '\author{Body Author \& Co.\\A Department\\A University \and Second Author}'
	want   "maketitle/no date"     "$TEX" '\date{}'
	want   "maketitle/pdftitle"    "$TEX" 'pdftitle={Header Title}'
	want   "maketitle/second block" "$TEX" '{\noindent\LARGE\bfseries A Second Title\par}'
	absent "maketitle/no title line" "$TEX" '{\noindent\LARGE\bfseries Body'
	if [ "$(grep -c '^\\maketitle$' "$TEX")" = 1 ] && grep -A1 '^\\date{}$' "$TEX" | grep -q '^\\maketitle$'; then
		echo "PASS  maketitle/one, after the block"; pass=$((pass + 1))
	else
		echo "FAIL  maketitle/one, after the block"; fail=$((fail + 1))
	fi
fi

# --- title-maketitle-header.jmd: under the key, a header Title with no Date
#     gets \date{} (LaTeX would print today's date; the HTML shows none). ---
if render title-maketitle-header; then
	want   "maketitle-header/date"      "$TEX" '\date{}'
	want   "maketitle-header/maketitle" "$TEX" '\maketitle'
fi

# --- title-maketitle-pdftitle.jmd: under the key, a header with no Title
#     takes the PDF's Title from the body's block — its title's text, without
#     formatting, the note or the subtitle (a header Title wins: title-maketitle
#     above). Off, there is none. ---
if render title-maketitle-pdftitle; then
	want   "maketitle-pdftitle/text" "$TEX" 'pdftitle={A Study of x \& \{y\} \& Links with x\^{}2, \_under}'
fi
sed 's/^LaTeX maketitle: true$/LaTeX maketitle: false/' "$HERE/title-maketitle-pdftitle.jmd" > "$SCRATCH/pdftitle-off.jmd"
if node "$JMD" process "$SCRATCH/pdftitle-off.jmd" --to latex -o "$SCRATCH/pdftitle-off.tex" >/dev/null 2>&1; then
	absent "maketitle-pdftitle/off" "$SCRATCH/pdftitle-off.tex" 'pdftitle='
else
	echo "FAIL  maketitle-pdftitle/off  (jmarkdown exited non-zero)"; fail=$((fail + 1))
fi

# --- title-percent.jmd: a `%` in a header's Title, Author or Date — not
#     markdown, so never jmarkdown's comment — is written `\%` in \title,
#     \author, \date, pdftitle and pdfauthor: raw, it was a comment that
#     swallowed the closing brace, and the build stopped. An author's `\%`
#     stays as written. ---
if render title-percent; then
	want   "title-percent/title"     "$TEX" '\title{Up 50\% and 25\% Today}'
	want   "title-percent/author"    "$TEX" '\author{Ann 50\% Bo}'
	want   "title-percent/date"      "$TEX" '\date{50\% May}'
	want   "title-percent/pdftitle"  "$TEX" 'pdftitle={Up 50\% and 25\% Today}'
	want   "title-percent/pdfauthor" "$TEX" 'pdfauthor={Ann 50\% Bo}'
	absent "title-percent/no doubled backslash" "$TEX" '\\%'
fi

# --- title-percent-block.jmd: no header, so no inline comment (metadata-header.js
#     installs it only with one) and its `%` is text, as the HTML shows it;
#     under `LaTeX maketitle`, from a project config as a host sets it, the
#     block's parts and the PDF's Title write it `\%`. ---
mkdir -p "$SCRATCH/pct/.jmarkdown"
printf '{ "LaTeX maketitle": true }\n' > "$SCRATCH/pct/.jmarkdown/config.json"
if (cd "$SCRATCH/pct" && node "$JMD" process "$HERE/title-percent-block.jmd" --to latex -o "$SCRATCH/pct/doc.tex" >/dev/null 2>&1); then
	want   "title-percent-block/title"    "$SCRATCH/pct/doc.tex" '\title{Up 50\% Today}'
	want   "title-percent-block/author"   "$SCRATCH/pct/doc.tex" '\author{Ann 50\% Bo}'
	want   "title-percent-block/date"     "$SCRATCH/pct/doc.tex" '\date{50\% May}'
	want   "title-percent-block/pdftitle" "$SCRATCH/pct/doc.tex" 'pdftitle={Up 50\% Today}'
else
	echo "FAIL  title-percent-block  (jmarkdown exited non-zero)"; fail=$((fail + 1))
fi

# --- The key from a project config, as a host sets it; a header's `false`
#     wins over it; off, nothing changes (title-page-body above). A header
#     with a Date keeps it. ---
mkdir -p "$SCRATCH/mt/.jmarkdown"
printf '{ "LaTeX maketitle": true }\n' > "$SCRATCH/mt/.jmarkdown/config.json"
sed 's/^Date: October 2026$/Date: October 2026\nLaTeX maketitle: false/' "$HERE/title-page-body.jmd" > "$SCRATCH/mt/header-off.jmd"
if (cd "$SCRATCH/mt" && node "$JMD" process "$HERE/title-page-body.jmd" --to latex -o "$SCRATCH/mt-on.tex" >/dev/null 2>&1 \
	&& node "$JMD" process header-off.jmd --to latex -o "$SCRATCH/mt-header-off.tex" >/dev/null 2>&1 \
	&& node "$JMD" process "$HERE/article.jmd" --to latex -o "$SCRATCH/mt-header-only.tex" >/dev/null 2>&1); then
	want   "maketitle-config/on"              "$SCRATCH/mt-on.tex" '\title{Body Title\\{\large A Subtitle}}'
	want   "maketitle-config/header off"      "$SCRATCH/mt-header-off.tex" '{\noindent\LARGE\bfseries Body Title\par}'
	absent "maketitle-config/header off, none" "$SCRATCH/mt-header-off.tex" '\maketitle'
	want   "maketitle-config/header date"     "$SCRATCH/mt-header-only.tex" '\date{June 2026}'
	absent "maketitle-config/no empty date"   "$SCRATCH/mt-header-only.tex" '\date{}'
else
	echo "FAIL  maketitle-config  (jmarkdown exited non-zero)"
	fail=$((fail + 1))
fi

# --- title-page-dropped.jmd: a body title that LaTeX never prints (inside
#     @begin(HTML)) is no title of the body's: \maketitle stays. ---
if render title-page-dropped; then
	want   "dropped-title/maketitle" "$TEX" '\maketitle'
	absent "dropped-title/not printed" "$TEX" 'Web Only Title'
fi

# --- cref-fullwords.jmd: a figure + :cref pulls cleveref AND the \crefname
#     overrides that make LaTeX spell floats out ("figure 1", not "fig. 1"),
#     matching the HTML cross-ref wording. ---
if render cref-fullwords; then
	want "cref/cleveref"       "$TEX" '\usepackage{cleveref}'
	want "cref/crefname fig"   "$TEX" '\crefname{figure}{figure}{figures}'
	want "cref/Crefname fig"   "$TEX" '\Crefname{figure}{Figure}{Figures}'
fi

# --- cref-unused.jmd: numbered things that nothing \cref's. A \crefname is a
#     cleveref command, and every full document loads hyperref — so overrides
#     gated on either package went out without cleveref and printed their
#     arguments as text ("equationequationequations"). Now each needs cleveref. ---
if render cref-unused; then
	absent "cref-unused/no cleveref"  "$TEX" '\usepackage{cleveref}'
	absent "cref-unused/no crefname"  "$TEX" '\crefname'
	absent "cref-unused/no Crefname"  "$TEX" '\Crefname'
	want   "cref-unused/hyperref"     "$TEX" '\usepackage{hyperref}'
	want   "cref-unused/hypersetup"   "$TEX" '\hypersetup{pdftitle='
fi

# --- cref-used.jmd: the same things, \cref'd — cleveref and its overrides. ---
if render cref-used; then
	want "cref-used/cleveref"         "$TEX" '\usepackage{cleveref}'
	want "cref-used/crefname eq"      "$TEX" '\crefname{equation}{equation}{equations}'
	want "cref-used/crefname table"   "$TEX" '\crefname{table}{table}{tables}'
fi

# --- style-block.jmd: a <style> is the page's CSS — none of it reaches the
#     .tex (it used to print in the PDF as text). ---
if render style-block; then
	absent "style/no-element"  "$TEX" '<style'
	absent "style/no-css"      "$TEX" 'color: red'
	want   "style/prose-kept"  "$TEX" 'The prose after it prints.'
fi

# --- list-specials.jmd: `&`, `#` and code in list items, escaped ONCE. A list
#     item's rendered text was escaped again (prose `&` → `\\&`, which stops
#     pdfLaTeX; `#` in inline code printed as `\#`). ---
if render list-specials; then
	want   "list/prose"        "$TEX" '\item Prose with an ampersand \& and a hash \# in it.'
	want   "list/code-hash"    "$TEX" '\item A hash in code \mintinline{text}|#|, and \mintinline{text}|#project/clew|.'
	want   "list/code-specials" "$TEX" '\mintinline{text}|a#b & c_d|'
	want   "list/href"         "$TEX" '\href{https://example.org/page\#part}{link with a fragment}'
	want   "list/loose"        "$TEX" '\item Loose prose \& more \#.'
	absent "list/no-double"    "$TEX" '\\&'
	# marked flags the text inside inline <code> `escaped` too, but it is not
	# yet LaTeX: it must still be escaped (only the list item's wrap is not).
	want   "list/raw-html"     "$TEX" '<code>\#include \& more</code>'
fi

# --- unclosed-tag.jmd: marked flags the text after an inline <code> left open
#     `escaped`, in every later paragraph too. That text is not yet LaTeX and
#     must still be escaped (list-specials' fix once trusted the flag, which
#     left a bare `&` and `#` here). ---
if render unclosed-tag; then
	want   "unclosed/inside"   "$TEX" 'Use <code>a \& b in an unclosed tag.'
	want   "unclosed/after"    "$TEX" 'Next paragraph \& with \# specials.'
	want   "unclosed/list"     "$TEX" '\item A list item \& \# after it.'
fi

# --- list-nested.jmd: a block nested in a list item (a callout, a theorem, a
#     generic environment) is lexed as the item is, its text as `text`
#     tokens, which marked rendered and then escaped again. Once, now. ---
if render list-nested; then
	want   "nested/callout"    "$TEX" 'Callout prose \& a hash \# and code \mintinline{text}|#tag|.'
	want   "nested/theorem"    "$TEX" 'Theorem prose \& a hash \#.'
	want   "nested/generic"    "$TEX" 'Aside prose \& a hash \#.'
	want   "nested/tight"      "$TEX" '\item A tight item \& \#'
	want   "nested/sublist"    "$TEX" '\item nested \& \# too'
	absent "nested/no-double"  "$TEX" '\\&'
fi

# --- url-percent.jmd: a bare address prints itself, so its `%` (a
#     percent-encoding) reached the .tex raw and commented out the rest of
#     the line, the link's closing brace with it. Escaped in both arguments. ---
if render url-percent; then
	want   "url-percent/plain"    "$TEX" '\href{https://example.com/a\%20b}{https://example.com/a\%20b}'
	want   "url-percent/angle"    "$TEX" '\href{https://example.com/c\%2Fd\#part}{https://example.com/c\%2Fd\#part}'
	want   "url-percent/footnote" "$TEX" '\footnote{at \href{https://example.com/g\%20h}{https://example.com/g\%20h} in a note.}'
	want   "url-percent/heading"  "$TEX" '\subsection{Heading \href{https://example.com/m\%20n}{https://example.com/m\%20n}}'
	absent "url-percent/no-raw"   "$TEX" 'a%20b'
fi

# --- url-specials.jmd: a bare address prints `_` and `~` as written (`_`
#     stopped the build, "Missing $"; `~` printed as a space), and a link
#     written out keeps its URL's `%` inside another command's argument (a
#     footnote, a heading), where a raw `%` was a comment. ---
if render url-specials; then
	want   "url-specials/underscore" "$TEX" '\href{https://example.com/a_b_c}{https://example.com/a\_b\_c}'
	want   "url-specials/tilde"      "$TEX" '\href{https://example.com/~me/page}{https://example.com/\textasciitilde{}me/page}'
	want   "url-specials/note link"  "$TEX" '\href{https://example.com/q\%20r}{the page}'
	want   "url-specials/note bare"  "$TEX" '\href{https://example.com/n_o~p}{https://example.com/n\_o\textasciitilde{}p}'
	want   "url-specials/heading"    "$TEX" '\subsection{Heading \href{https://example.com/h\%20i}{linked}}'
	absent "url-specials/no raw %"   "$TEX" 'q%20r'
fi

# --- page-setup.jmd: geometry / line spacing / header / hyperref + PDF meta ---
if render page-setup; then
	want "page/geometry"   "$TEX" '\usepackage[margin=1in]{geometry}'
	want "page/setspace"   "$TEX" '\usepackage{setspace}'
	want "page/double"     "$TEX" '\doublespacing'
	want "page/fancyhdr"   "$TEX" '\usepackage{fancyhdr}'
	want "page/header"     "$TEX" '\fancyhead[C]{My Header}'
	want "page/hyperref"   "$TEX" '\usepackage{hyperref}'
	want "page/pdf meta"   "$TEX" '\hypersetup{pdftitle={Styled}, pdfauthor={Someone}}'
fi

# --- matter.jmd: book-class matter divisions + appendix + contents commands ---
if render matter; then
	want "matter/class"           "$TEX" '\documentclass{book}'
	want "matter/frontmatter"     "$TEX" '\frontmatter'
	want "matter/tableofcontents" "$TEX" '\tableofcontents'
	want "matter/mainmatter"      "$TEX" '\mainmatter'
	want "matter/appendix"        "$TEX" '\appendix'
	want "matter/backmatter"      "$TEX" '\backmatter'
fi

# --- numbered-env.jmd: a script-defined numbered environment becomes a thmtools
#     theorem-like (own counter) and a second env shares it via sibling=. ---
if render numbered-env; then
	want "numenv/thmtools"   "$TEX" '\usepackage{thmtools}'
	want "numenv/declare"    "$TEX" '\declaretheorem[name=Exercise, refname={exercise,exercises}, Refname={Exercise,Exercises}]{exercise}'
	want "numenv/sibling"    "$TEX" 'sibling=exercise]{solution}'
	want "numenv/begin"      "$TEX" '\begin{exercise}[Warm-up]\label{ex:one}'
	want "numenv/cref"       "$TEX" '\cref{ex:one}'
fi

# --- math-macros.jmd: the `Math macros` lines become preamble definitions,
#     with the amsmath+amssymb vocabulary MathJax's `ams` provides on the web
#     side (so identical definitions compile in both outputs). ---
if render math-macros; then
	want "macros/newcommand" "$TEX" '\newcommand{\RR}{\mathbb{R}}'
	want "macros/operator"   "$TEX" '\DeclareMathOperator{\argmax}{arg\,max}'
	want "macros/amsmath"    "$TEX" '\usepackage{amsmath}'
	want "macros/amssymb"    "$TEX" '\usepackage{amssymb}'
fi

# --- index-doc.jmd: :index marks pass through; ::Index pulls in imakeidx and
#     registers the \makeindex declarations (default + named) in the preamble. ---
if render index-doc; then
	want "index/imakeidx"        "$TEX" '\usepackage{imakeidx}'
	want "index/makeindex"       "$TEX" '\makeindex[intoc]'
	want "index/makeindex named" "$TEX" '\makeindex[name=authors, title={Author Index}]'
	want "index/mark"            "$TEX" '\index{recursion}'
	want "index/mark named"      "$TEX" '\index[authors]{Church, Alonzo}'
	want "index/printindex"      "$TEX" '\printindex'
	want "index/printindex named" "$TEX" '\printindex[authors]'
fi

# --- contents-lol.jmd: {{LOL}} expands to minted's \listoflistings and pulls
#     in minted even when the document has no listing floats. ---
if render contents-lol; then
	want "lol/listoflistings" "$TEX" '\listoflistings'
	want "lol/minted"         "$TEX" '\usepackage{minted}'
fi

# --- generic-env.jmd: an unregistered @begin(name) auto-provides a guarded
#     no-op \newenvironment via \AtBeginDocument (so the author's own
#     definition, wherever it appears, always wins); registered names don't. ---
if render generic-env; then
	want   "generic-env/guard"    "$TEX" '\AtBeginDocument{\ifcsname warning\endcsname\else\newenvironment{warning}{}{}\fi}'
	want   "generic-env/body"     "$TEX" '\begin{warning}[Careful]'
	absent "generic-env/no guard for registered" "$TEX" '\ifcsname print'
fi

# --- code-highlightjs.jmd: `LaTeX highlighter: highlight.js` sets code with
#     fvextra, coloured by the build, and loads no minted: the listing float
#     and \listoflistings are minted's own definitions, through the float
#     package. Default (minted): as always. An unknown value is minted, warned.
#     The key from a project config, as a host sets it. ---
if render code-highlightjs; then
	want   "highlightjs/fvextra"     "$TEX" '\usepackage{fvextra}'
	want   "highlightjs/xcolor"      "$TEX" '\usepackage{xcolor}'
	want   "highlightjs/float"       "$TEX" '\usepackage{float}'
	want   "highlightjs/newfloat"    "$TEX" '\newfloat{listing}{tbp}{lol}'
	want   "highlightjs/listof"      "$TEX" '\providecommand{\listoflistings}{\listof{listing}{\listoflistingscaption}}'
	want   "highlightjs/block"       "$TEX" '\begin{Verbatim}[commandchars=\\\{\}]'
	want   "highlightjs/keyword"     "$TEX" '\textcolor[HTML]{008000}{\textbf{def}}'
	want   "highlightjs/heading"     "$TEX" '\section{Code with \texttt{x = \{a\}} in a heading}'
	absent "highlightjs/no minted"   "$TEX" 'minted'
	absent "highlightjs/no warning"  "$SCRATCH/code-highlightjs.stderr" 'LaTeX highlighter'
fi
sed '/^LaTeX highlighter: highlight.js$/d' "$HERE/code-highlightjs.jmd" > "$SCRATCH/hl-off.jmd"
sed 's/^LaTeX highlighter: highlight.js$/LaTeX highlighter: pygments/' "$HERE/code-highlightjs.jmd" > "$SCRATCH/hl-bad.jmd"
mkdir -p "$SCRATCH/hl/.jmarkdown"
printf '{ "LaTeX highlighter": "highlight.js" }\n' > "$SCRATCH/hl/.jmarkdown/config.json"
cp "$SCRATCH/hl-off.jmd" "$SCRATCH/hl/doc.jmd"
if node "$JMD" process "$SCRATCH/hl-off.jmd" --to latex -o "$SCRATCH/hl-off.tex" >/dev/null 2>&1 \
	&& node "$JMD" process "$SCRATCH/hl-bad.jmd" --to latex -o "$SCRATCH/hl-bad.tex" >/dev/null 2>"$SCRATCH/hl-bad.stderr" \
	&& (cd "$SCRATCH/hl" && node "$JMD" process doc.jmd --to latex -o doc.tex >/dev/null 2>&1); then
	want   "highlightjs-off/minted"     "$SCRATCH/hl-off.tex" '\usepackage{minted}'
	want   "highlightjs-off/block"      "$SCRATCH/hl-off.tex" '\begin{minted}{python}'
	absent "highlightjs-off/no fvextra" "$SCRATCH/hl-off.tex" 'fvextra'
	want   "highlightjs-bad/minted"     "$SCRATCH/hl-bad.tex" '\usepackage{minted}'
	want   "highlightjs-bad/warning"    "$SCRATCH/hl-bad.stderr" 'LaTeX highlighter: "pygments" is not one of minted, highlight.js'
	want   "highlightjs-config/fvextra" "$SCRATCH/hl/doc.tex" '\usepackage{fvextra}'
	absent "highlightjs-config/no minted" "$SCRATCH/hl/doc.tex" 'minted'
else
	echo "FAIL  highlightjs-off/bad/config  (jmarkdown exited non-zero)"; fail=$((fail + 1))
fi

# --- entities-all.jmd: every HTML entity escapeLatexText writes as its
#     character (PROSE_ENTITIES, src/latex-escape.js) — a header's Title and
#     Author, a heading, a note, a caption, and one to an item — is written as
#     the list writes it, none left as `\&name;`; and the fixture names every
#     entity on the list (entities-check.mjs). latex-compile compiles it. ---
if render entities-all; then
	if out=$(node "$HERE/entities-check.mjs" tex "$HERE/entities-all.jmd" "$TEX" 2>&1); then
		echo "PASS  entities-all/every entity"; pass=$((pass + 1))
	else
		echo "FAIL  entities-all/every entity  ($out)"; fail=$((fail + 1))
	fi
	want   "entities-all/title"     "$TEX" '\title{Every entity: \& \textless{} \textgreater{} \# / * \textquotesingle{} \nobreakspace{} \- \, \textendash{} \textemdash{} \textellipsis{}'
	want   "entities-all/pdftitle"  "$TEX" 'pdftitle={Every entity: \& \textless{} \textgreater{} \# / *'
	want   "entities-all/author"    "$TEX" '\author{Ann \& Bo \textemdash{} \& \textless{}'
	want   "entities-all/date"      "$TEX" '\date{Spring \textendash{} 2026}'
	want   "entities-all/heading"   "$TEX" '\section{Heading \& \textless{}'
	want   "entities-all/note"      "$TEX" '\footnote{Note \& \textless{}'
	want   "entities-all/caption"   "$TEX" '\caption{Caption \& \textless{}'
fi

echo
echo "latex-document: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
