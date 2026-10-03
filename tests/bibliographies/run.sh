#!/bin/sh
# Several bibliographies (src/bibliographies.js): a note's `Bibliography:`
# ADDS to the configured one, a later file wins a key, and
# `Bibliography mode: replace` uses the note's alone.
#
# A suite rather than feature fixtures because the configured bibliography
# lives in a project config (.jmarkdown/config.json, read from the working
# directory), as Clew writes the vault's, which the feature harness cannot give
# a fixture; and because the LaTeX side writes a merged .bib beside its output.
# HOME is pointed at an empty folder, so the owner's global config plays no
# part.
#
# vault/vault.bib is the configured file; notes/refs.bib disagrees with it on
# `shared`, agrees on `same`, and adds `noteonly`; notes/extra.bib adds
# `extraonly`. vault.bib also carries an @string, used by `macro`.
#
# Usage:  sh tests/bibliographies/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-bibliographies.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "bibliographies  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0
pass() { printf 'PASS  bibliographies/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  bibliographies/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
assert_contains() { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected to find: $3"; fi; }
assert_absent()   { if grep -qF -- "$3" "$2"; then fail "$1" "expected NOT to find: $3"; else pass "$1"; fi; }
assert_count()    { n=$(grep -cF -- "$3" "$2"); if [ "$n" = "$4" ]; then pass "$1"; else fail "$1" "expected $4 of: $3 (found $n)"; fi; }

cp -R "$HERE/vault" "$HERE/notes" "$SCRATCH/"
mkdir -p "$SCRATCH/home" "$SCRATCH/project/.jmarkdown" "$SCRATCH/out"
VAULT="$SCRATCH/vault/vault.bib"
NOTES="$SCRATCH/notes"
OUT="$SCRATCH/out"

# The configured bibliography, as Clew writes the vault's: an absolute path.
config() {
	printf '{ "Biblify": { "bibliography": %s, "resolve": %s, "bibliography style": "%s" } }\n' "$1" "$2" "$3" \
		>"$SCRATCH/project/.jmarkdown/config.json"
}
# build NAME FORMAT [extra args…] — notes/NAME.md → out/NAME.{html,tex}, stderr in out/NAME.FORMAT.err
build() {
	name=$1; format=$2; shift 2
	ext=html; [ "$format" = latex ] && ext=tex
	(cd "$SCRATCH/project" && HOME="$SCRATCH/home" node "$JMD" process "$NOTES/$name.md" --to "$format" -o "$OUT/$name.$ext" "$@" >/dev/null 2>"$OUT/$name.$format.err") \
		|| fail "$name/$format/exit" "$(cat "$OUT/$name.$format.err")"
}
EXTRA=''   # more prose for the next note's body, before its @bibliography
note() {   # note NAME HEADER-LINES…
	name=$1; shift
	{
		printf -- '---\nTitle: %s\n' "$name"
		for line in "$@"; do printf '%s\n' "$line"; done
		printf -- '---\n\n%s%s\n\n@bibliography\n' "Cites \\citet{shared}, \\citet{vaultonly}, \\citet{noteonly} and \\citet{same}." "$EXTRA"
	} >"$NOTES/$name.md"
}

# --- the note's file is ADDED to the configured one ----------------------------

config "\"$VAULT\"" true apa
note add 'Bibliography: refs.bib'
build add html --fragment
assert_contains "add/note-wins" "$OUT/add.html" "The Note Version"
assert_absent   "add/configured-loses" "$OUT/add.html" "The Vault Version"
assert_contains "add/configured-entry" "$OUT/add.html" "Only in the Vault"
assert_contains "add/note-entry" "$OUT/add.html" "Only in the Note"
assert_count    "add/one-list" "$OUT/add.html" 'class="csl-bib-body' 1
assert_contains "add/warns-on-differing" "$OUT/add.html.err" "refs.bib (this note's) and vault.bib (configured) disagree on an entry; refs.bib's used: shared"
assert_absent   "add/identical-is-silent" "$OUT/add.html.err" "same"
assert_absent   "add/no-unresolved" "$OUT/add.html.err" "no bibliography entry"

# --- `Bibliography mode: replace`: the note's alone ----------------------------

note replace 'Bibliography: refs.bib' 'Bibliography mode: replace'
build replace html --fragment
assert_contains "replace/note-entry" "$OUT/replace.html" "The Note Version"
assert_absent   "replace/configured-gone" "$OUT/replace.html" "Only in the Vault"
assert_contains "replace/configured-key-unresolved" "$OUT/replace.html.err" 'no bibliography entry for "vaultonly"'
assert_absent   "replace/nothing-to-disagree" "$OUT/replace.html.err" "disagree"

note badmode 'Bibliography: refs.bib' 'Bibliography mode: merge'
build badmode html --fragment
assert_contains "mode/unknown-warns" "$OUT/badmode.html.err" "Bibliography mode: merge"
assert_contains "mode/unknown-adds" "$OUT/badmode.html" "Only in the Vault"

# --- no note bibliography: the configured one alone ----------------------------

note confonly
build confonly html --fragment
assert_contains "configured-only/resolves" "$OUT/confonly.html" "The Vault Version"
assert_absent   "configured-only/no-warning" "$OUT/confonly.html.err" "bibliography:"

# --- a list of files, in every form a header can hold one -----------------------

EXTRA=' And \citet{extraonly}.'
note comma 'Bibliography: refs.bib, extra.bib'
note flow 'Bibliography: [refs.bib, extra.bib]'
note block 'Bibliography:' '  - refs.bib' '  - extra.bib'
note continued 'Bibliography: refs.bib,' '  extra.bib'
for form in comma flow block continued; do
	build "$form" html --fragment
	assert_contains "list/$form/extra" "$OUT/$form.html" "Only in the Extra File"
	assert_contains "list/$form/refs" "$OUT/$form.html" "The Note Version"
	assert_contains "list/$form/configured" "$OUT/$form.html" "Only in the Vault"
done

# --- a configured LIST (an array in the config) ----------------------------------

config "[\"$VAULT\", \"$NOTES/extra.bib\"]" true apa
note arrayconf
EXTRA=''
build arrayconf html --fragment
assert_contains "config-array/first" "$OUT/arrayconf.html" "Only in the Vault"
assert_contains "config-array/second" "$OUT/arrayconf.html" "Only in the Extra File"

# --- numeric styles number across files, in citation order -----------------------

config "\"$VAULT\"" true vancouver
note numeric 'Bibliography: refs.bib'
build numeric html --fragment
# shared (note's) 1, vaultonly 2, noteonly 3, same 4.
for pair in 'shared:1' 'vaultonly:2' 'noteonly:3' 'same:4'; do
	key=${pair%%:*}; n=${pair#*:}
	assert_contains "numeric/$key-is-$n" "$OUT/numeric.html" "data-bibtex=\"$key\">[$n]<"
done
assert_contains "numeric/note-wins" "$OUT/numeric.html" "The Note Version"

# --- \fullcite and \citefile find a configured entry ----------------------------

config "\"$VAULT\"" true apa
printf -- '---\nTitle: fullcite\nBibliography: refs.bib\n---\n\nIn full: \\fullcite{vaultonly}. Note: \\fullcite{shared}.\n' >"$NOTES/fullcite.md"
build fullcite html --fragment
assert_contains "fullcite/configured" "$OUT/fullcite.html" "Only in the Vault"
assert_contains "fullcite/note-wins" "$OUT/fullcite.html" "The Note Version"

printf -- '---\nTitle: citefile\nBibliography: refs.bib\n---\n\nThe paper: \\citefile{vaultonly}.\n' >"$NOTES/citefile.md"
build citefile html --fragment
# Its file field is relative to vault.bib's folder, not the note's.
assert_contains "citefile/against-its-own-bib" "$OUT/citefile.html" "vault/docs/paper.pdf"
assert_absent   "citefile/no-warning" "$OUT/citefile.html.err" "citefile"

# --- LaTeX: one file, several apart, several overlapping -------------------------

note onefile 'Bibliography: refs.bib' 'Bibliography mode: replace'
build onefile latex --fragment
assert_contains "latex/one-file" "$OUT/onefile.tex" '\bibliography{refs}'

printf -- '---\nTitle: apart\nBibliography: extra.bib\n---\n\nCites \\citet{vaultonly} and \\citet{extraonly}.\n\n@bibliography\n' >"$NOTES/apart.md"
build apart latex --fragment
assert_contains "latex/disjoint-lists-note-first" "$OUT/apart.tex" '\bibliography{extra,vault}'
if [ -e "$OUT/apart-bibliography.bib" ]; then fail "latex/disjoint-writes-nothing" "apart-bibliography.bib was written"; else pass "latex/disjoint-writes-nothing"; fi

printf -- '---\nTitle: overlap\nBibliography: refs.bib\n---\n\nCites \\citet{shared}, \\citet{vaultonly}, \\citet{noteonly} and \\citet{same}; \\nocite{macro}in full, \\fullcite{vaultonly}.\n\n@bibliography\n' >"$NOTES/overlap.md"
build overlap latex
assert_contains "latex/overlap-names-the-merge" "$OUT/overlap.tex" '\bibliography{overlap-bibliography}'
MERGED="$OUT/overlap-bibliography.bib"
assert_contains "latex/merge/marked" "$MERGED" "% Generated by jmarkdown"
assert_contains "latex/merge/note-wins" "$MERGED" "The Note Version"
assert_absent   "latex/merge/configured-loses" "$MERGED" "The Vault Version"
assert_contains "latex/merge/configured-entry" "$MERGED" "Only in the Vault"
assert_contains "latex/merge/keeps-string" "$MERGED" "@string{vp"
assert_count    "latex/merge/same-once" "$MERGED" "@book{same," 1
assert_contains "latex/merge/warns" "$OUT/overlap.latex.err" "disagree on an entry; refs.bib's used: shared"

# The merged file really works: bibtex reads it without a repeated-entry error
# (which would stop latexmk), and the PDF has the note's entry, the
# configured ones, the @string's expansion and the \fullcite.
if command -v pdflatex >/dev/null 2>&1 && command -v bibtex >/dev/null 2>&1; then
	(cd "$OUT" && sed -e '/fontspec/d' -e '/setmainfont/d' overlap.tex >overlap-pdf.tex; \
		pdflatex -interaction=nonstopmode overlap-pdf.tex >/dev/null 2>&1; \
		bibtex overlap-pdf >bibtex.out 2>&1; echo $? >bibtex.status; \
		pdflatex -interaction=nonstopmode overlap-pdf.tex >/dev/null 2>&1; \
		pdflatex -interaction=nonstopmode overlap-pdf.tex >/dev/null 2>&1; \
		pdftotext overlap-pdf.pdf overlap.txt 2>/dev/null)
	if [ "$(cat "$OUT/bibtex.status")" = 0 ]; then pass "latex/bibtex/clean"; else fail "latex/bibtex/clean" "$(cat "$OUT/bibtex.out")"; fi
	if [ -f "$OUT/overlap.txt" ]; then
		assert_contains "latex/pdf/note-wins" "$OUT/overlap.txt" "The note version"
		assert_contains "latex/pdf/configured" "$OUT/overlap.txt" "Only in the Vault"
		assert_contains "latex/pdf/string-expanded" "$OUT/overlap.txt" "A Publisher by Macro. Vault Press"
		assert_absent   "latex/pdf/no-undefined" "$OUT/overlap.txt" "?"
	else
		echo "SKIP  bibliographies/latex/pdf  (pdftotext not installed)"
	fi
else
	echo "SKIP  bibliographies/latex/bibtex  (pdflatex or bibtex not installed)"
fi

# A file of that name jmarkdown did not write is never overwritten.
printf '@book{mine, title = {Mine}}\n' >"$OUT/guard-bibliography.bib"
cp "$NOTES/overlap.md" "$NOTES/guard.md"
build guard latex --fragment
assert_contains "guard/kept" "$OUT/guard-bibliography.bib" "@book{mine"
assert_contains "guard/warns" "$OUT/guard.latex.err" "will not overwrite guard-bibliography.bib"
assert_contains "guard/lists-the-files" "$OUT/guard.tex" '\bibliography{refs,vault}'

# On stdout there is nowhere to write the merge: the files are listed, with a
# warning. (A note on stdin has no folder, so its file is named absolutely.)
sed "s|^Bibliography: refs.bib|Bibliography: $NOTES/refs.bib|" "$NOTES/overlap.md" >"$NOTES/stdin.md"
(cd "$SCRATCH/project" && HOME="$SCRATCH/home" node "$JMD" process - --to latex --fragment <"$NOTES/stdin.md" >"$OUT/stdin.tex" 2>"$OUT/stdin.err")
assert_contains "stdout/lists-the-files" "$OUT/stdin.tex" '\bibliography{refs,vault}'
assert_contains "stdout/warns" "$OUT/stdin.err" "no output file to write their merge beside"

# --- a configured RELATIVE path is the config's: relative to the working
# directory (where the project config is read), not to each note's folder ------

printf '@book{localonly,\n  author = {Local, Lou},\n  title = {Found From the Project Folder},\n  publisher = {Local Press},\n  year = {2018}\n}\n' >"$SCRATCH/project/local.bib"
config '"local.bib"' true apa
printf -- '---\nTitle: relative\nBibliography: refs.bib\n---\n\nCites \\citet{localonly} and \\citet{noteonly}.\n\n@bibliography\n' >"$NOTES/relative.md"
build relative html --fragment
assert_contains "relative/configured-from-project" "$OUT/relative.html" "Found From the Project Folder"
assert_contains "relative/note-from-note" "$OUT/relative.html" "Only in the Note"
assert_absent   "relative/no-warning" "$OUT/relative.html.err" "cannot read"

# --- a file that cannot be read is left out of a LaTeX list (bibtex stops on a
# database it cannot open), with a warning ----------------------------------------

config "[\"missing.bib\", \"$VAULT\"]" true apa
build apart latex --fragment
assert_contains "unreadable/left-out" "$OUT/apart.tex" '\bibliography{extra,vault}'
assert_contains "unreadable/warns" "$OUT/apart.latex.err" 'cannot read "missing.bib" — no such file, so it is left out'

# --- a bibliography a HOST names for one build (--bibliography): a configured
# one in every respect. Clew's exports pass the vault's this way ----------------

config '""' true apa
printf -- '---\nTitle: hostonly\n---\n\nCites \\citet{vaultonly}.\n\n@bibliography\n' >"$NOTES/hostonly.md"
build hostonly html --fragment --bibliography "$VAULT"
assert_contains "host/resolves" "$OUT/hostonly.html" "Only in the Vault"
assert_absent   "host/no-unresolved" "$OUT/hostonly.html.err" "no bibliography entry"
build hostonly latex --bibliography "$VAULT"
assert_contains "host/latex-names-it" "$OUT/hostonly.tex" '\bibliography{vault}'
if command -v pdflatex >/dev/null 2>&1 && command -v bibtex >/dev/null 2>&1; then
	# bibtex finds a bibliography by its basename on BIBINPUTS, which a host
	# sets to the file's folder.
	(cd "$OUT" && sed -e '/fontspec/d' -e '/setmainfont/d' hostonly.tex >hostonly-pdf.tex; \
		pdflatex -interaction=nonstopmode hostonly-pdf.tex >/dev/null 2>&1; \
		BIBINPUTS="$SCRATCH/vault:" bibtex hostonly-pdf >hostbib.out 2>&1; echo $? >hostbib.status; \
		pdflatex -interaction=nonstopmode hostonly-pdf.tex >/dev/null 2>&1; \
		pdflatex -interaction=nonstopmode hostonly-pdf.tex >/dev/null 2>&1; \
		pdftotext hostonly-pdf.pdf hostonly.txt 2>/dev/null)
	if [ "$(cat "$OUT/hostbib.status")" = 0 ]; then pass "host/bibtex/clean"; else fail "host/bibtex/clean" "$(cat "$OUT/hostbib.out")"; fi
	[ -f "$OUT/hostonly.txt" ] && assert_contains "host/pdf/resolved" "$OUT/hostonly.txt" "Only in the Vault"
	[ -f "$OUT/hostonly.txt" ] && assert_absent   "host/pdf/no-undefined" "$OUT/hostonly.txt" "?"
fi

build add html --fragment --bibliography "$VAULT"
assert_contains "host/note-adds/note-wins" "$OUT/add.html" "The Note Version"
assert_contains "host/note-adds/host-entry" "$OUT/add.html" "Only in the Vault"
assert_contains "host/note-adds/warns" "$OUT/add.html.err" "refs.bib (this note's) and vault.bib (configured) disagree on an entry"

build replace html --fragment --bibliography "$VAULT"
assert_absent   "host/replace-drops" "$OUT/replace.html" "Only in the Vault"
assert_contains "host/replace-unresolved" "$OUT/replace.html.err" 'no bibliography entry for "vaultonly"'

build hostonly html --fragment --bibliography ../vault/vault.bib
assert_contains "host/relative-to-cwd" "$OUT/hostonly.html" "Only in the Vault"

# The library route Clew's export worker takes: processFile's `bibliography`
# option (a string here; a list works the same).
config '""' true apa
(cd "$SCRATCH/project" && HOME="$SCRATCH/home" node --input-type=module -e "
	const { processFile } = await import('$JMD');
	await processFile('$NOTES/hostonly.md', { to: 'html', fragment: true, output: '$OUT/library.html', bibliography: '$VAULT' });
" >/dev/null 2>"$OUT/library.err")
assert_contains "host/processFile-option" "$OUT/library.html" "Only in the Vault"

# After the config files': a host's file wins a key over the config's.
printf '@book{vaultonly,\n  author = {Vault, Vera},\n  title = {The Host Version},\n  publisher = {Host Press},\n  year = {2002}\n}\n' >"$SCRATCH/host.bib"
config "\"$VAULT\"" true apa
build hostonly html --fragment --bibliography "$SCRATCH/host.bib"
assert_contains "host/after-config" "$OUT/hostonly.html" "The Host Version"

# --- the runtime Biblify client, which reads one file -----------------------------

config "\"$VAULT\"" false apa
printf -- '---\nTitle: runtime\nBiblify activate: true\nBibliography: refs.bib\n---\n\nCites \\citet{shared}.\n' >"$NOTES/runtime.md"
build runtime html
assert_contains "runtime/merged" "$OUT/runtime.html" "bibfile: 'runtime-bibliography.bib'"
assert_contains "runtime/written" "$OUT/runtime-bibliography.bib" "The Note Version"

printf -- '---\nTitle: runtime1\nBiblify activate: true\nBibliography: refs.bib\nBibliography mode: replace\n---\n\nCites \\citet{shared}.\n' >"$NOTES/runtime1.md"
build runtime1 html
assert_contains "runtime/one-file-as-written" "$OUT/runtime1.html" "bibfile: 'refs.bib'"
if [ -e "$OUT/runtime1-bibliography.bib" ]; then fail "runtime/one-file-writes-nothing" "written"; else pass "runtime/one-file-writes-nothing"; fi

echo "bibliographies: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
