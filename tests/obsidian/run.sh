#!/bin/sh
# Obsidian links and embeds (src/obsidian-links.js): what the feature fixtures
# cannot show — the host's resolvers (a library call, as Clew makes it), which
# switch wins, the CLI flag and the config key, a book's [[links]] between its
# chapters, and a full document with an embed and a link through LaTeX to a PDF.
# HOME is a scratch folder, so a global config plays no part.
#
# vault/ is a small vault: notes/Welcome.md and notes/Second.md, an image in
# images/ (where only a resolver finds it), book.md (a master over the two
# notes) and note.md (a single note). pictures.md is a master with an image
# of its own over notes/Pictures.md, which embeds one image through the
# resolver and links another as a Markdown image, for a book's paths.
#
# Usage:  sh tests/obsidian/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-obsidian.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "obsidian  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0
pass() { printf 'PASS  obsidian/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  obsidian/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
has()   { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected: $3"; fi; }
hasnt() { if grep -qF -- "$3" "$2"; then fail "$1" "unexpected: $(grep -F -- "$3" "$2" | head -2)"; else pass "$1"; fi; }

cp -R "$HERE/vault" "$SCRATCH/vault"
V="$SCRATCH/vault"
# Node reports the folder by its real path (/private/var/… on macOS).
VREAL=$(cd "$V" && pwd -P)
mkdir -p "$SCRATCH/home"
lib() {   # lib NAME SCRIPT — run a processFile call in the vault; stdout to NAME.out
	(cd "$V" && HOME="$SCRATCH/home" node --input-type=module -e "
		import { processFile } from '$JMD';
		import path from 'path';
		$2
	" >"$1.log" 2>&1) || fail "$1/exit" "$(cat "$V/$1.log" 2>/dev/null)"
}

# --- the host's resolvers: a link where it gives an href, an image where it finds it --------------------
RESOLVERS="const obsidianLinks = {
	resolveLink: (name, { heading }) => name === 'Missing' ? null
		: name.toLowerCase() + '.html' + (heading ? '#' + heading.toLowerCase().replace(/ /g, '-') : ''),
	resolveEmbed: (name) => path.resolve('images', name),
};"
lib resolved "$RESOLVERS
	await processFile('note.md', { to: 'html', fragment: true, output: 'resolved.html', obsidianLinks });
	await processFile('note.md', { to: 'latex', fragment: true, output: 'resolved.tex', obsidianLinks });"
has   "resolver/link" "$V/resolved.html" '<a class="internal-link" data-href="Welcome" href="welcome.html#the-guide">Welcome &gt; The guide</a>'
has   "resolver/declined-is-text" "$V/resolved.html" 'and Missing.'
has   "resolver/embed" "$V/resolved.html" "src=\"$VREAL/images/frame.png\""
has   "resolver/latex-link-is-text" "$V/resolved.tex" 'See Welcome \textgreater{} The guide and Missing.'
has   "resolver/latex-embed" "$V/resolved.tex" "\\includegraphics[width=90bp]{$VREAL/images/frame.png}"

# --- the file an embed is written in: the note, or in a book the chapter (absolute) ----------------------
FILES="import fs from 'fs';
const seen = [];
const obsidianLinks = {
	resolveEmbed: (name, { file }) => { seen.push(file); return path.relative(path.dirname(file), path.resolve('images', name)); },
};"
lib file-note "$FILES
	await processFile('note.md', { to: 'html', fragment: true, output: 'file-note.html', obsidianLinks });
	fs.writeFileSync('file-note.txt', seen.join('\\n') + '\\n');"
has   "file/note" "$V/file-note.txt" "$VREAL/note.md"
# A relative answer is the note's, as a Markdown image's path written there.
has   "file/note-relative" "$V/file-note.html" 'src="images/frame.png"'

# --- a book's paths (pictures.md). The resolver answers relative to the chapter, and every image (the
#     master's own, the chapter's embed, its Markdown image) reaches the right file from where each
#     output is read: from build/, where a host writes and compiles the .tex, and from each split
#     page. No absolute path in either. Each build in a process of its own (see CLAUDE.md). ----------
mkdir -p "$V/build" "$V/site"
lib paths-tex "$FILES
	await processFile('pictures.md', { to: 'latex', output: 'build/Book.tex', obsidianLinks });
	fs.writeFileSync('file-book.txt', seen.join('\\n') + '\\n');"
has   "file/chapter" "$V/file-book.txt" "$VREAL/notes/Pictures.md"
has   "paths/tex-master-image" "$V/build/Book.tex" 'The cover: \includegraphics[width=\textwidth]{../images/cover.png}'
has   "paths/tex-embed" "$V/build/Book.tex" 'Embedded: \includegraphics[width=225bp]{../images/frame.png}'
has   "paths/tex-image" "$V/build/Book.tex" 'Linked: \includegraphics[width=\textwidth]{../images/shot.png}'
hasnt "paths/tex-no-absolute" "$V/build/Book.tex" "$VREAL"
lib paths-split "$FILES
	await processFile('pictures.md', { to: 'html', output: 'site/pictures.html', htmlLayout: 'split', obsidianLinks });"
has   "paths/split-master-image" "$V/site/pictures/index.html" '<img src="../../images/cover.png" alt="The cover">'
has   "paths/split-embed" "$V/site/pictures/Pictures.html" '<img src="../../images/frame.png" alt="frame.png" width="300">'
has   "paths/split-image" "$V/site/pictures/Pictures.html" '<img src="../../images/shot.png" alt="A shot">'
hasnt "paths/split-no-absolute" "$V/site/pictures/Pictures.html" "$VREAL"
# A book's LaTeX on stdout has no folder to rebase onto: the master's paths, and a warning saying so.
(cd "$V" && HOME="$SCRATCH/home" node "$JMD" process - --to latex --obsidian-links <pictures.md >stdout.tex 2>stdout.err) \
	|| fail "paths/stdout-exit" "$(cat "$V/stdout.err")"
has   "paths/stdout-master-relative" "$V/stdout.tex" 'Linked: \includegraphics[width=\textwidth]{images/shot.png}'
has   "paths/stdout-warned" "$V/stdout.err" 'the LaTeX goes to stdout'
# A single file's LaTeX writes its paths as given, wherever it is written.
(cd "$V" && HOME="$SCRATCH/home" node "$JMD" process note.md --to latex --fragment --obsidian-links -o build/note.tex >/dev/null 2>&1)
has   "paths/single-file-as-given" "$V/build/note.tex" '\includegraphics[width=90bp]{frame.png}'

# --- which switch wins: the option, then the header or config --------------------------------------------
lib off "await processFile('book.md', { to: 'html', fragment: true, output: 'off.html', obsidianLinks: false });"
has   "switch/option-false-beats-header" "$V/off.html" 'Start with [[Welcome]].'
(cd "$V" && HOME="$SCRATCH/home" node "$JMD" process note.md --fragment -o plain.html >/dev/null 2>&1)
has   "switch/off-by-default" "$V/plain.html" '[[Welcome#The guide]]'
(cd "$V" && HOME="$SCRATCH/home" node "$JMD" process note.md --fragment --obsidian-links -o flag.html >/dev/null 2>&1)
has   "switch/cli-flag" "$V/flag.html" 'See Welcome &gt; The guide and Missing.'
mkdir -p "$SCRATCH/project/.jmarkdown"
cp "$V/note.md" "$SCRATCH/project/note.md"
printf '{ "Obsidian links": true }\n' >"$SCRATCH/project/.jmarkdown/config.json"
(cd "$SCRATCH/project" && HOME="$SCRATCH/home" node "$JMD" process note.md --fragment -o config.html >/dev/null 2>&1)
has   "switch/config-key" "$SCRATCH/project/config.html" 'See Welcome &gt; The guide and Missing.'

# --- a book: a [[link]] to a chapter is a chapter link, in both outputs -----------------------------------
(cd "$V" && HOME="$SCRATCH/home" node "$JMD" process book.md --fragment -o book.html >/dev/null 2>book.err) \
	|| fail "book/exit" "$(cat "$V/book.err")"
has   "book/link-to-chapter" "$V/book.html" '<a href="#jmd-chapter-1">Welcome &gt; The guide</a>'
has   "book/alias" "$V/book.html" '<a href="#jmd-chapter-1">the start</a>'
has   "book/from-the-master" "$V/book.html" 'Start with <a href="#jmd-chapter-1">Welcome</a>.'
(cd "$V" && HOME="$SCRATCH/home" node "$JMD" process book.md --to latex -o book.tex >/dev/null 2>book-latex.err) \
	|| fail "book/latex-exit" "$(cat "$V/book-latex.err")"
has   "book/latex-chapter-link" "$V/book.tex" '\hyperref[jmd-chapter-1]{Welcome \textgreater{} The guide}'

# --- a full document through LaTeX: the embed (found by its resolver) and the links compile ---------------
if command -v pdflatex >/dev/null 2>&1 && command -v pdftotext >/dev/null 2>&1; then
	lib pdf "$RESOLVERS
		await processFile('book.md', { to: 'latex', output: 'pdf-book.tex', obsidianLinks });"
	if (cd "$V" && sed -e '/fontspec/d' -e '/setmainfont/d' pdf-book.tex >pdf.tex \
		&& pdflatex -interaction=nonstopmode -halt-on-error pdf.tex >/dev/null 2>&1 \
		&& pdflatex -interaction=nonstopmode -halt-on-error pdf.tex >/dev/null 2>&1 \
		&& pdftotext pdf.pdf pdf.txt); then
		pass "pdf/compiles"
		has "pdf/link-text" "$V/pdf.txt" 'Back to Welcome > The guide, and to the start.'
		images=$(pdfimages -list "$V/pdf.pdf" 2>/dev/null | tail -n +3 | wc -l | tr -d ' ')
		if [ "${images:-0}" -ge 1 ]; then pass "pdf/image-included"; else fail "pdf/image-included" "no image in the PDF"; fi
	else
		fail "pdf/compiles" "$(grep -m3 '^!' "$V/pdf.log")"
	fi
fi

# --- the book compiled where its .tex is: build/. All three images are found and included -------------
if command -v pdflatex >/dev/null 2>&1 && command -v pdfimages >/dev/null 2>&1; then
	if (cd "$V/build" && sed -e '/fontspec/d' -e '/setmainfont/d' Book.tex >book-pdf.tex \
		&& pdflatex -interaction=nonstopmode -halt-on-error book-pdf.tex >/dev/null 2>&1); then
		pass "paths/pdf-compiles-in-build"
		images=$(pdfimages -list "$V/build/book-pdf.pdf" 2>/dev/null | tail -n +3 | wc -l | tr -d ' ')
		if [ "${images:-0}" -ge 3 ]; then pass "paths/pdf-all-images"; else fail "paths/pdf-all-images" "$images image(s) in the PDF, 3 expected"; fi
	else
		fail "paths/pdf-compiles-in-build" "$(grep -m3 '^!' "$V/build/book-pdf.log")"
	fi
fi

echo "obsidian: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
