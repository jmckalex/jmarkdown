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

# --- `Copy figures` (config only): what the output refers to, copied into `<output>-figures/` ----------
#     A kept .tex or .html then stands on its own: the cache can go and it still compiles / loads.

if [ "$have_mp" = yes ] && [ "$have_tikz" = yes ]; then
	F="$SCRATCH/copy"
	mkdir -p "$F/vault/.jmarkdown" "$F/vault/build" "$F/store"
	printf '{ "Cache directory": "%s", "Copy figures": true }\n' "$F/store" >"$F/vault/.jmarkdown/config.json"
	cp "$C/vault/note.md" "$F/vault/note.md"
	[ -f "$C/vault/tiny.mp4" ] && cp "$C/vault/tiny.mp4" "$F/vault/tiny.mp4"
	jmd "$F/vault" process note.md --to latex -o build/note.tex || fail "copy/latex-exit" "$(cat "$F/vault/err.txt")"
	jmd "$F/vault" process note.md -o build/note.html || fail "copy/html-exit" "$(cat "$F/vault/err.txt")"
	B2="$F/vault/build"
	has "copy/tex-refers-to-copy" "$B2/note.tex" '{note-figures/MetaPost/'
	[ "$have_ffmpeg" = yes ] && has "copy/poster-copied" "$B2/note.tex" '{note-figures/Video/'
	has "copy/html-refers-to-copy" "$B2/note.html" '<img src="note-figures/TiKZ/'
	if [ -f "$B2/note-figures/.jmarkdown-figures" ]; then pass "copy/marked-as-jmarkdowns"; else fail "copy/marked-as-jmarkdowns" "$(ls -a "$B2/note-figures")"; fi
	hasnt "copy/tex-not-into-cache" "$B2/note.tex" 'store/'
	# The cache can go: the kept outputs still stand.
	rm -rf "${F:?}/store"
	resolves "copy/html-stands-alone" "$B2/note.html"
	if [ "$have_tex" = yes ]; then
		if (cd "$B2" && pdflatex -interaction=nonstopmode -halt-on-error note.tex >/dev/null 2>&1); then
			pass "copy/tex-stands-alone"
		else
			fail "copy/tex-stands-alone" "$(grep -m3 '^!' "$B2/note.log")"
		fi
	fi
	# Copied only when missing or different: rebuilding (into a fresh cache,
	# with the same figures) rewrites none of them.
	touch "$F/stamp"
	sleep 1
	jmd "$F/vault" process note.md -o build/note.html || fail "copy/rebuild-exit" "$(cat "$F/vault/err.txt")"
	rewritten=$(find "$B2/note-figures" -type f -newer "$F/stamp" | sed "s|$B2/||")
	if [ -z "$rewritten" ]; then pass "copy/unchanged-not-rewritten"; else fail "copy/unchanged-not-rewritten" "$rewritten"; fi
	# A folder of that name the engine did not make is left alone.
	mkdir -p "$B2/mine-figures"
	jmd "$F/vault" process note.md --to latex -o build/mine.tex || fail "copy/foreign-exit" "$(cat "$F/vault/err.txt")"
	has "copy/foreign-folder-warned" "$F/vault/err.txt" 'Copy figures: mine-figures/ was not made by jmarkdown'
	n=$(find "$B2/mine-figures" -type f | wc -l | tr -d ' ')
	if [ "$n" = 0 ]; then pass "copy/foreign-folder-untouched"; else fail "copy/foreign-folder-untouched" "$n files written into it"; fi
	has "copy/foreign-refers-to-cache" "$B2/mine.tex" '{../../store/MetaPost/'
	# A split book's pages refer to the book's figures folder, beside the pages' folder.
	S2="$F/split"
	mkdir -p "$S2/chapters" "$S2/site" "$S2/.jmarkdown"
	printf '{ "Copy figures": true }\n' >"$S2/.jmarkdown/config.json"
	printf -- '---\nTitle: Split\n---\n\n@chapter+(chapters/one.md)\n' >"$S2/master.md"
	printf '# One\n\n@begin(metapost)\ndraw unitsquare scaled 6cm;\n@end(metapost)\n' >"$S2/chapters/one.md"
	jmd "$S2" process master.md -o site/book.html --html-layout split || fail "copy/split-exit" "$(cat "$S2/err.txt")"
	has      "copy/split-page-refers-to-copy" "$S2/site/book/one.html" ' src="../book-figures/MetaPost/'
	resolves "copy/split-page-resolves" "$S2/site/book/one.html"
	# A header cannot turn it on.
	mkdir -p "$F/hdr"
	printf -- '---\nTitle: Header\nCopy figures: true\n---\n\n@begin(metapost)\ndraw unitsquare scaled 7cm;\n@end(metapost)\n' >"$F/hdr/note.md"
	jmd "$F/hdr" process note.md --fragment -o out.html || fail "copy/header-exit" "$(cat "$F/hdr/err.txt")"
	has "copy/header-warned" "$F/hdr/err.txt" 'Copy figures: copying the figures beside the output is set in .jmarkdown/config.json'
	if [ ! -e "$F/hdr/out-figures" ]; then pass "copy/header-ignored"; else fail "copy/header-ignored" "out-figures/ was made"; fi
else
	skip "copy/tex-stands-alone" "no mpost/mptopdf or no lualatex/dvisvgm"
fi

# --- the same two settings from a host: processFile's cacheDir / copyFigures, and the CLI's flags ------

if [ "$have_mp" = yes ]; then
	O="$SCRATCH/options"
	mkdir -p "$O/vault/build"
	printf -- '---\nTitle: Options\n---\n\n@begin(metapost)\ndraw unitsquare scaled 8cm;\n@end(metapost)\n' >"$O/vault/note.md"
	(cd "$O/vault" && HOME="$SCRATCH/home" "$NODE" --input-type=module -e "
		import { processFile } from '$JMD';
		await processFile('note.md', { to: 'latex', output: 'build/lib.tex', cacheDir: '$O/libcache', copyFigures: true });
	" >"$O/lib.log" 2>&1) || fail "options/library-exit" "$(cat "$O/lib.log")"
	if [ -d "$O/libcache/MetaPost" ] && [ ! -e "$O/vault/MetaPost" ]; then pass "options/library-cache-dir"; else fail "options/library-cache-dir" "$(ls "$O" "$O/vault")"; fi
	has "options/library-copy-figures" "$O/vault/build/lib.tex" '{lib-figures/MetaPost/'
	jmd "$O/vault" process note.md --to latex -o build/cli.tex --cache-dir ../clicache --copy-figures || fail "options/cli-exit" "$(cat "$O/vault/err.txt")"
	if [ -d "$O/clicache/MetaPost" ]; then pass "options/cli-cache-dir"; else fail "options/cli-cache-dir" "$(ls "$O")"; fi
	has "options/cli-copy-figures" "$O/vault/build/cli.tex" '{cli-figures/MetaPost/'
else
	skip "options/library-cache-dir" "no mpost/mptopdf"
fi

# --- mmdc missing: the diagram is left out, with a build warning naming it -------------------------

M="$SCRATCH/nommdc"
mkdir -p "$M"
printf -- '---\nTitle: No mmdc\n---\n\n@begin(mermaid)\ngraph TD\n  A --> B\n@end(mermaid)\n' >"$M/note.md"
(cd "$M" && HOME="$SCRATCH/home" PATH=/usr/bin:/bin "$NODE" "$JMD" process note.md --to latex -o note.tex >/dev/null 2>err.txt) \
	|| fail "no-mmdc/exit" "$(cat "$M/err.txt")"
has   "no-mmdc/warned" "$M/err.txt" 'mermaid: "graph TD" left out of the LaTeX — mermaid-cli (mmdc) was not found'
hasnt "no-mmdc/left-out" "$M/note.tex" 'includegraphics'

# --- Mathematica: a run that fails caches nothing ------------------------------------------------
# wolframscript writes its result straight into the cache (Mathematica/<hash>.txt),
# so a run that failed — a licence refused under load exits 255 or 40, with
# nothing or a fragment on stdout — left that behind, and every later build took
# it for the result, empty, and never asked again. A stand-in wolframscript on
# PATH fails like that, then answers: the failed build shows its error and
# caches nothing; the next asks again and caches the answer; the one after uses
# the cache. Block (:::Mathematica) and inline (⟦…⟧) forms.

W="$SCRATCH/wolfram"
mkdir -p "$W/bin"
cat >"$W/bin/wolframscript" <<'STANDIN'
#!/bin/sh
echo "$*" >>"$WL_LOG"
# fail: every call; fail-second: from the second call on (the inline form asks
# twice — what the result is, then for it into the cache).
if [ "${WL_MODE:-ok}" = fail ] || { [ "${WL_MODE:-ok}" = fail-second ] && [ "$(wc -l <"$WL_LOG")" -ge 2 ]; }; then
	printf 'Connection closed by Wolf'
	echo 'Your Wolfram product is not activated or is experiencing a license-related problem.' >&2
	exit 255
fi
echo 2
STANDIN
chmod +x "$W/bin/wolframscript"
wl() {   # wl MODE NAME — build W/NAME/note.md to HTML with the stand-in in MODE
	(cd "$W/$2" && HOME="$SCRATCH/home" PATH="$W/bin:$PATH" WL_MODE=$1 WL_LOG="$W/$2/calls.log" "$NODE" "$JMD" process note.md -o note.html >/dev/null 2>err.txt)
}
cached() { ls "$W/$1/Mathematica" 2>/dev/null | grep -E '\.(txt|svg)$'; }
calls() { wc -l <"$W/$1/calls.log" 2>/dev/null | tr -d ' '; }

mkdir -p "$W/block"
printf ':::Mathematica\n1 + 1\n:::\n\nThe paragraph after it.\n' >"$W/block/note.md"
wl fail block
has   "mathematica/block-failed-shows-error" "$W/block/note.html" 'class="tikz-error-message"'
if [ -z "$(cached block)" ]; then pass "mathematica/block-failed-caches-nothing"; else fail "mathematica/block-failed-caches-nothing" "cached: $(cached block)"; fi
wl ok block || fail "mathematica/block-retry-exit" "$(cat "$W/block/err.txt")"
if [ "$(calls block)" = 2 ]; then pass "mathematica/block-retry-asks-again"; else fail "mathematica/block-retry-asks-again" "calls: $(calls block)"; fi
has   "mathematica/block-retry-result" "$W/block/note.html" 'class="mathematica txt ">2'
hasnt "mathematica/block-retry-no-error" "$W/block/note.html" 'class="tikz-error-message"'
wl ok block || fail "mathematica/block-cached-exit" "$(cat "$W/block/err.txt")"
if [ "$(calls block)" = 2 ]; then pass "mathematica/block-then-cached"; else fail "mathematica/block-then-cached" "calls: $(calls block)"; fi

mkdir -p "$W/inline"
printf 'Inline ⟦1 + 1⟧ here.\n' >"$W/inline/note.md"
wl fail-second inline
if [ -z "$(cached inline)" ]; then pass "mathematica/inline-failed-caches-nothing"; else fail "mathematica/inline-failed-caches-nothing" "cached: $(cached inline)"; fi
n=$(calls inline)
wl ok inline || fail "mathematica/inline-retry-exit" "$(cat "$W/inline/err.txt")"
if [ "$(calls inline)" -gt "$n" ] && [ -n "$(cached inline)" ]; then pass "mathematica/inline-retry-asks-again"; else fail "mathematica/inline-retry-asks-again" "calls $n → $(calls inline); cached: $(cached inline)"; fi

# --- Mathematica: a folder named with `.m` ----------------------------------------------------------
# The cache's files are named from <hash>.m by changing the extension at the
# end. Replacing the FIRST `.m` instead changed a folder on the way — `my.math
# notes` became `my.txtath notes`, which does not exist: the block form showed
# its error box on every build and the inline form stopped the build. (mktemp's
# scratch name does it too, now and then: jmd-diagrams.XXXXXX.m….)
mkdir -p "$W/my.math notes"
printf ':::Mathematica\n1 + 1\n:::\n\nInline ⟦2 + 0⟧ here.\n' >"$W/my.math notes/note.md"
wl ok "my.math notes" || fail "mathematica/dot-m-folder-exit" "$(cat "$W/my.math notes/err.txt")"
has   "mathematica/dot-m-folder-block-result" "$W/my.math notes/note.html" 'class="mathematica txt ">2'
hasnt "mathematica/dot-m-folder-no-error" "$W/my.math notes/note.html" 'class="tikz-error-message"'
if [ "$(cached "my.math notes" | grep -c '\.txt$')" = 2 ]; then pass "mathematica/dot-m-folder-cached"; else fail "mathematica/dot-m-folder-cached" "cached: $(cached "my.math notes")"; fi
n=$(calls "my.math notes")
wl ok "my.math notes" || fail "mathematica/dot-m-folder-cached-exit" "$(cat "$W/my.math notes/err.txt")"
if [ "$(calls "my.math notes")" = "$n" ]; then pass "mathematica/dot-m-folder-then-cached"; else fail "mathematica/dot-m-folder-then-cached" "calls $n → $(calls "my.math notes")"; fi

echo "diagrams: $passed passed, $failed failed, $skipped skipped"
[ "$failed" -eq 0 ]
