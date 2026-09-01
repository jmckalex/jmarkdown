#!/bin/sh
# \citefile — the cases whose output contains a RESOLVED ABSOLUTE PATH.
#
# Those can't be golden files: the path depends on where the repository happens
# to be checked out. So this suite copies the fixture bibliography and its
# attachments into a temp directory, builds there, and asserts against paths it
# computes at run time. The deterministic cases (no attachment, unknown key,
# index out of range — all of which emit nothing) are golden fixtures instead,
# in tests/features/citations/citefile.jmd.
#
# Usage:  sh tests/citefile/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-citefile.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "citefile  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0

# assert NAME HAYSTACK_FILE NEEDLE — the needle must appear in the file
assert_contains() {
	name=$1; file=$2; needle=$3
	if grep -qF -- "$needle" "$file"; then
		printf 'PASS  citefile/%s\n' "$name"
		passed=$((passed + 1))
	else
		printf 'FAIL  citefile/%s\n' "$name"
		printf '    | expected to find: %s\n' "$needle"
		printf '    | in:\n'
		sed 's/^/    | /' "$file"
		failed=$((failed + 1))
	fi
}

assert_absent() {
	name=$1; file=$2; needle=$3
	if grep -qF -- "$needle" "$file"; then
		printf 'FAIL  citefile/%s\n' "$name"
		printf '    | expected NOT to find: %s\n' "$needle"
		failed=$((failed + 1))
	else
		printf 'PASS  citefile/%s\n' "$name"
		passed=$((passed + 1))
	fi
}

cp "$HERE/attachments.bib" "$HERE/attachment.pdf" "$HERE/a space in the name.pdf" "$HERE/data.csv" "$SCRATCH/"

cat > "$SCRATCH/doc.md" <<'EOF'
---
Title: citefile
Bibliography: attachments.bib
---

default \citefile{One:2020}
second \citefile[file=2]{Two:2021}
custom \citefile[text="the preprint"]{One:2020}
curly \citefile[text=“curly quoted”]{One:2020}
both \citefile[file=2, text="both keys"]{Two:2021}
shorthand \citefile[1]{Two:2021}
jabref \citefile{Jabref:2023}
nonpdf \citefile{Other:2024}
missing \citefile{Gone:2022}
EOF

cd "$SCRATCH" || exit 1
node "$JMD" process doc.md --fragment -o out.html 2>html.err || {
	echo "FAIL  citefile: jmarkdown exited non-zero (html)"; sed 's/^/    | /' html.err; exit 1
}
node "$JMD" process doc.md --to latex --fragment -o out.tex 2>tex.err || {
	echo "FAIL  citefile: jmarkdown exited non-zero (tex)"; sed 's/^/    | /' tex.err; exit 1
}

# The resolver returns real paths, so compare against the temp dir's real path
# (macOS puts mktemp dirs under a symlinked /var → /private/var).
REAL=$(cd "$SCRATCH" && pwd -P)

# --- HTML: file:// URLs, percent-encoded for a browser ------------------------
assert_contains "html/default-label" out.html "href=\"file://$REAL/attachment.pdf\" title=\"$REAL/attachment.pdf\">attachment.pdf</a>"
assert_contains "html/sparse-second" out.html "file://$REAL/a%20space%20in%20the%20name.pdf"
assert_contains "html/custom-text" out.html ">the preprint</a>"
assert_contains "html/curly-quoted-text" out.html ">curly quoted</a>"
assert_contains "html/both-keys" out.html ">both keys</a>"
assert_contains "html/bare-number" out.html "file://$REAL/attachment.pdf"
assert_contains "html/jabref-file-field" out.html "file://$REAL/attachment.pdf"
assert_contains "html/non-pdf" out.html "file://$REAL/data.csv"
assert_contains "html/missing-still-links" out.html "file://$REAL/vanished.pdf"
assert_contains "html/missing-warns" html.err "was not found on disk"

# --- LaTeX: a PDF file action, whose /F is a PATH — no percent-encoding -------
assert_contains "tex/default-label" out.tex "\\href{file://$REAL/attachment.pdf}{attachment.pdf}"
assert_contains "tex/spaces-not-encoded" out.tex "\\href{file://$REAL/a space in the name.pdf}"
assert_absent   "tex/no-percent-encoding" out.tex "%20"
assert_contains "tex/non-pdf-uses-run" out.tex "\\href{run:$REAL/data.csv}"
assert_contains "tex/custom-text" out.tex "}{the preprint}"

echo "citefile: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
