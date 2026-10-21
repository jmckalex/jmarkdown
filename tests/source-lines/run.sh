#!/bin/sh
# Source lines (data-source-line, for inverse search and Clew's scroll sync)
# after a multi-paragraph inline note. Its preprocess (inline-footnotes.js)
# lifts such a note out of the source before the parse and leaves a one-line
# marker, and source positions (source-positions.js) counted lines in what was
# left, so everything after the note was stamped early by the note's lines.
# The lifts are recorded (line-shifts.js) and added back, and the note's own
# paragraphs carry their lines. Full HTML only: fragments, LaTeX and stdin are
# not stamped. A book's chapter lines are tests/book's.
#
# notes.md labels each block with its line: a note at the top level, in a
# blockquote's first line and in a list item.
#
# Usage:  sh tests/source-lines/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-source-lines.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "source-lines  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0
pass() { printf 'PASS  source-lines/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  source-lines/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
has()   { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected: $3" "found: $(grep -o "data-source-line=\"[0-9]*\"[^>]*>$4" "$2" | head -1)"; fi; }

mkdir -p "$SCRATCH/home"
cp "$HERE/notes.md" "$SCRATCH/notes.md"
(cd "$SCRATCH" && HOME="$SCRATCH/home" node "$JMD" process notes.md -o notes.html >/dev/null 2>err.txt) \
	|| fail "exit" "$(cat "$SCRATCH/err.txt")"
H="$SCRATCH/notes.html"

# After each note, the blocks carry their own lines.
has "top-level/before"          "$H" 'data-source-line="1">A top-level claim.' 'A top'
has "top-level/after"           "$H" 'data-source-line="6">Line 6: the paragraph after the top-level note.' 'Line 6'
has "blockquote/its-line"       "$H" 'data-source-line="8">Line 8: a quoted claim' 'Line 8'
has "blockquote/after"          "$H" 'data-source-line="13">Line 13: the paragraph after the blockquote.' 'Line 13'
has "list/item"                 "$H" 'data-source-line="15">Line 15: an item' 'Line 15'
has "list/next-item"            "$H" 'data-source-line="19">Line 19: the next item.' 'Line 19'
has "list/after"                "$H" 'data-source-line="21">Line 21: the paragraph after the list.' 'Line 21'
has "heading/after-all-three"   "$H" 'data-source-line="23" id="toc-line-23-a-heading">Line 23: a heading' 'Line 23'

# Each note's own paragraphs: their lines in the source, not the marker's.
has "note/top-level-first"      "$H" 'data-source-line="1">Its first paragraph.' 'Its first'
has "note/top-level-second"     "$H" 'data-source-line="3"> Its second paragraph.' ' Its second'
has "note/blockquote-first"     "$H" 'data-source-line="8">Quote note one.' 'Quote note one'
has "note/blockquote-second"    "$H" 'data-source-line="10"> Quote note two.' ' Quote note two'
has "note/list-first"           "$H" 'data-source-line="15">Item note one.' 'Item note one'
has "note/list-second"          "$H" 'data-source-line="17"> Item note two.' ' Item note two'

# A document with a header: lines count from the file's first line.
{ printf -- '---\nTitle: With a header\n---\n\n'; cat "$HERE/notes.md"; } > "$SCRATCH/header.md"
(cd "$SCRATCH" && HOME="$SCRATCH/home" node "$JMD" process header.md -o header.html >/dev/null 2>err.txt) \
	|| fail "header/exit" "$(cat "$SCRATCH/err.txt")"
has "header/after-note"         "$SCRATCH/header.html" 'data-source-line="10">Line 6: the paragraph after the top-level note.' 'Line 6'
has "header/note-second"        "$SCRATCH/header.html" 'data-source-line="7"> Its second paragraph.' ' Its second'

echo "source-lines: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
