#!/bin/sh
# Obsidian links and embeds (src/obsidian-links.js): what the feature fixtures
# cannot show — the host's resolvers (a library call, as Clew makes it), which
# switch wins, the CLI flag and the config key, a book's [[links]] between its
# chapters, and a full document with an embed and a link through LaTeX to a PDF.
# HOME is a scratch folder, so a global config plays no part.
#
# vault/ is a small vault: notes/Welcome.md and notes/Second.md, an image in
# images/ (where only a resolver finds it), book.md (a master over the two
# notes) and note.md (a single note).
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

echo "obsidian: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
