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
have_tikz=no
command -v lualatex >/dev/null 2>&1 && command -v dvisvgm >/dev/null 2>&1 && have_tikz=yes
have_ffmpeg=no
command -v ffmpeg >/dev/null 2>&1 && have_ffmpeg=yes

# srcs FILE — every <img src> in FILE that is a path, one per line.
srcs() { grep -o '<img[^>]* src="[^"]*"' "$1" | sed 's/.* src="//; s/"$//' | grep -v '^data:'; }
# resolves NAME FILE — every image FILE refers to is a file, from FILE's folder.
resolves() {
	list=$(srcs "$2")
	if [ -z "$list" ]; then fail "$1" "no <img src> in $(basename "$2")"; return; fi
	missing=$(printf '%s\n' "$list" | while read -r s; do [ -f "$(dirname "$2")/$s" ] || echo "$s"; done)
	if [ -z "$missing" ]; then pass "$1"; else fail "$1" "not found from $(basename "$(dirname "$2")")/: $missing"; fi
}

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

# Into a folder reached through a link to another depth (an output under
# os.tmpdir() is one), given absolute through the link: TeX climbs `..`
# physically, so the path is counted from the real folders, and it compiles there.
mkdir -p "$SCRATCH/out-real/x/y/z"
ln -s "$SCRATCH/out-real/x/y/z" "$SCRATCH/linked"
jmd "$D" process note.md --to latex -o "$SCRATCH/linked/note.tex" || fail "symlink/exit" "$(cat "$D/err.txt")"
if [ "$have_mp" = yes ]; then
	has "symlink/counted-from-real" "$SCRATCH/linked/note.tex" '{../../../../note/MetaPost/'
	if [ "$have_tex" = yes ]; then
		if (cd "$SCRATCH/linked" && pdflatex -interaction=nonstopmode -halt-on-error note.tex >/dev/null 2>&1); then
			pass "symlink/compiles-there"
		else
			fail "symlink/compiles-there" "$(grep -m3 '^!' "$SCRATCH/linked/note.log")"
		fi
	fi
else
	skip "symlink/counted-from-real" "no mpost/mptopdf"
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

# --- HTML: a cached figure is referred to from where the page is read -------------------------------

if [ "$have_mp" = yes ] && [ "$have_tikz" = yes ]; then
	H="$SCRATCH/html"
	mkdir -p "$H/xn"
	printf -- '---\nTitle: HTML figures\n---\n\n@begin(metapost)\ndraw fullcircle scaled 1cm;\n@end(metapost)\n\n:::TiKZ\n\\draw (0,0) -- (1,1);\n:::\n' >"$H/note.md"
	jmd "$H" process note.md --fragment -o note.html || fail "html/beside-exit" "$(cat "$H/err.txt")"
	# Beside the note, as they always were.
	has      "html/beside-metapost" "$H/note.html" '<img src="MetaPost/'
	has      "html/beside-tikz" "$H/note.html" '<img src="TiKZ/'
	# Written elsewhere: the page's own folder is where they are looked for (they
	# used to be `MetaPost/…` beside the PAGE, where nothing was).
	jmd "$H" process note.md --fragment -o xn/diagrams.html || fail "html/elsewhere-exit" "$(cat "$H/err.txt")"
	has      "html/elsewhere-metapost" "$H/xn/diagrams.html" '<img src="../MetaPost/'
	resolves "html/elsewhere-resolves" "$H/xn/diagrams.html"
	# A split book: master-relative before book-pages.js rebases them per page.
	S="$SCRATCH/split"
	mkdir -p "$S/chapters" "$S/site"
	printf -- '---\nTitle: Split\n---\n\n@chapter+(chapters/one.md)\n' >"$S/master.md"
	printf '# One\n\n@begin(metapost)\ndraw unitsquare scaled 1cm;\n@end(metapost)\n' >"$S/chapters/one.md"
	jmd "$S" process master.md -o site/book.html --html-layout split || fail "html/split-exit" "$(cat "$S/err.txt")"
	resolves "html/split-page-resolves" "$S/site/book/one.html"
else
	skip "html/elsewhere-resolves" "no mpost/mptopdf or no lualatex/dvisvgm"
fi

# --- each figure compiles in a run folder of its own (figure-cache.js compileInRunDir) --------------
#     Only the figure is kept: what a document's own code writes (MetaPost's `write`, TeX's
#     \openout) goes with the folder, as does a failed run; no run folder outlives the build.

if [ "$have_mp" = yes ] && [ "$have_tikz" = yes ]; then
	R="$SCRATCH/runs"
	mkdir -p "$R"
	cat >"$R/plant.md" <<'EOF2'
---
Title: Side writes
---

@begin(metapost)
write "planted" to "planted-mp.txt";
write EOF to "planted-mp.txt";
draw fullcircle scaled 1cm;
@end(metapost)

:::TiKZ
\newwrite\jmdplant
\immediate\openout\jmdplant=planted-tikz.txt
\immediate\write\jmdplant{planted}
\immediate\closeout\jmdplant
\draw (0,0) -- (1,1);
:::
EOF2
	jmd "$R" process plant.md --fragment -o plant.html || fail "runs/exit" "$(cat "$R/err.txt")"
	jmd "$R" process plant.md --to latex -o plant.tex || fail "runs/latex-exit" "$(cat "$R/err.txt")"
	resolves "runs/figures-kept" "$R/plant.html"
	planted=$(find "$R" -name 'planted-*' | sed "s|$R/||")
	if [ -z "$planted" ]; then pass "runs/side-writes-discarded"; else fail "runs/side-writes-discarded" "$planted"; fi
	leftover=$(find "$R" -name '.run-*' | sed "s|$R/||")
	if [ -z "$leftover" ]; then pass "runs/no-run-folder-left"; else fail "runs/no-run-folder-left" "$leftover"; fi
	extra=$(ls "$R/MetaPost" "$R/TiKZ" | grep -v -e '-[0-9]*\.svg$' -e '-[0-9]*\.pdf$' -e '^[0-9a-f]*\.svg$' -e ':$' -e '^$')
	if [ -z "$extra" ]; then pass "runs/only-figures-cached"; else fail "runs/only-figures-cached" "$extra"; fi

	# A failed compile caches nothing.
	printf -- '---\nTitle: Broken\n---\n\n@begin(metapost)\ndraw fullcircle scaled;\n@end(metapost)\n' >"$R/broken.md"
	before=$(ls "$R/MetaPost" | wc -l | tr -d ' ')
	jmd "$R" process broken.md --fragment -o broken.html || fail "runs/broken-exit" "$(cat "$R/err.txt")"
	has "runs/failure-reported" "$R/broken.html" 'metapost-error'
	after=$(ls "$R/MetaPost" | wc -l | tr -d ' ')
	if [ "$before" = "$after" ]; then pass "runs/failure-caches-nothing"; else fail "runs/failure-caches-nothing" "$before files before, $after after"; fi

else
	skip "runs/side-writes-discarded" "no mpost/mptopdf or no lualatex/dvisvgm"
fi

# --- `Cache directory` (config only): the cache kept outside the note's folder ---------------------
#     A project config names it; nothing is written beside the note, the HTML's images and the
#     .tex's \includegraphics reach into it, and the .tex still compiles where it is written.

if [ "$have_mp" = yes ] && [ "$have_tikz" = yes ]; then
	C="$SCRATCH/cachedir"
	mkdir -p "$C/vault/.jmarkdown" "$C/vault/build" "$C/store"
	printf '{ "Cache directory": "%s" }\n' "$C/store" >"$C/vault/.jmarkdown/config.json"
	cp "$SCRATCH/html/note.md" "$C/vault/note.md"
	[ -f "$REPO/tests/features/media/tiny.mp4" ] && cp "$REPO/tests/features/media/tiny.mp4" "$C/vault/tiny.mp4"
	printf '\n@video+(tiny.mp4)[A clip]{tex-mode=poster}\n' >>"$C/vault/note.md"
	jmd "$C/vault" process note.md --fragment -o note.html || fail "cache-dir/html-exit" "$(cat "$C/vault/err.txt")"
	jmd "$C/vault" process note.md --to latex -o build/note.tex || fail "cache-dir/latex-exit" "$(cat "$C/vault/err.txt")"
	beside=$(ls -d "$C/vault/MetaPost" "$C/vault/TiKZ" "$C/vault/Video" "$C/vault/mermaid" 2>/dev/null)
	if [ -z "$beside" ]; then pass "cache-dir/nothing-beside-the-note"; else fail "cache-dir/nothing-beside-the-note" "$beside"; fi
	if [ -d "$C/store/MetaPost" ] && [ -d "$C/store/TiKZ" ]; then pass "cache-dir/kept-there"; else fail "cache-dir/kept-there" "$(ls "$C/store")"; fi
	has      "cache-dir/html-src" "$C/vault/note.html" '<img src="../store/MetaPost/'
	resolves "cache-dir/html-resolves" "$C/vault/note.html"
	has      "cache-dir/tex-relative" "$C/vault/build/note.tex" '{../../store/MetaPost/'
	hasnt    "cache-dir/tex-no-absolute" "$C/vault/build/note.tex" "$REAL"
	if [ "$have_ffmpeg" = yes ]; then
		has "cache-dir/poster-in-cache" "$C/vault/build/note.tex" '{../../store/Video/'
	fi
	if [ "$have_tex" = yes ]; then
		if (cd "$C/vault/build" && pdflatex -interaction=nonstopmode -halt-on-error note.tex >/dev/null 2>&1); then
			pass "cache-dir/compiles-where-written"
		else
			fail "cache-dir/compiles-where-written" "$(grep -m3 '^!' "$C/vault/build/note.log")"
		fi
	fi
	# A relative Cache directory is the working directory's.
	mkdir -p "$C/rel/.jmarkdown"
	printf '{ "Cache directory": "kept" }\n' >"$C/rel/.jmarkdown/config.json"
	printf -- '---\nTitle: Relative\n---\n\n@begin(metapost)\ndraw unitsquare scaled 4cm;\n@end(metapost)\n' >"$C/rel/note.md"
	jmd "$C/rel" process note.md --fragment -o note.html || fail "cache-dir/relative-exit" "$(cat "$C/rel/err.txt")"
	if [ -d "$C/rel/kept/MetaPost" ]; then pass "cache-dir/relative-to-cwd"; else fail "cache-dir/relative-to-cwd" "$(ls "$C/rel")"; fi
	# A header cannot move it: ignored, with a warning.
	mkdir -p "$C/hdr"
	printf -- '---\nTitle: Header\nCache directory: %s\n---\n\n@begin(metapost)\ndraw unitsquare scaled 5cm;\n@end(metapost)\n' "$C/elsewhere" >"$C/hdr/note.md"
	jmd "$C/hdr" process note.md --fragment -o note.html || fail "cache-dir/header-exit" "$(cat "$C/hdr/err.txt")"
	has "cache-dir/header-warned" "$C/hdr/err.txt" 'Cache directory: where the engine keeps the figures it makes is set in .jmarkdown/config.json or by the host'
	if [ -d "$C/hdr/MetaPost" ] && [ ! -e "$C/elsewhere" ]; then pass "cache-dir/header-ignored"; else fail "cache-dir/header-ignored" "$(ls "$C/hdr") / elsewhere: $(ls "$C/elsewhere" 2>&1)"; fi
else
	skip "cache-dir/nothing-beside-the-note" "no mpost/mptopdf or no lualatex/dvisvgm"
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
