#!/bin/sh
# The page's <title> from a header Title that holds HTML entities. A Title is
# written as markdown is, so `A &mdash; B` means the character; Mustache's
# {{Title}} escaped the `&`, and <title> showed `&mdash;`. A template that
# places the Title escaped now gets it with its entities decoded, and Mustache
# escapes what they give, so markup written as entities stays text; a template
# that places it raw ({{{Title}}}) gets it as written, as before
# (html-template.js). Full HTML builds: a fragment has no <title>.
#
# Usage:  sh tests/html-title/run.sh

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
JMD="$REPO/src/index.js"

SCRATCH=$(mktemp -d -t jmd-html-title.XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT INT TERM

echo "=========================================="
echo "html-title  (scratch=$SCRATCH)"
echo "=========================================="

passed=0
failed=0
pass() { printf 'PASS  html-title/%s\n' "$1"; passed=$((passed + 1)); }
fail() { printf 'FAIL  html-title/%s\n' "$1"; shift; for line in "$@"; do printf '    | %s\n' "$line"; done; failed=$((failed + 1)); }
has()   { if grep -qF -- "$3" "$2"; then pass "$1"; else fail "$1" "expected: $3" "found: $(grep -E '<title>|<h1' "$2" | head -2)"; fi; }
hasnt() { if grep -qF -- "$3" "$2"; then fail "$1" "unexpected: $(grep -F -- "$3" "$2" | head -2)"; else pass "$1"; fi; }

mkdir -p "$SCRATCH/home"
page() {   # page NAME TITLE [TEMPLATE] — build NAME.md, with that Title, to NAME.html
	{ printf -- '---\nTitle: %s\n' "$2"; [ -n "${3:-}" ] && printf 'Template: %s\n' "$3"; printf -- '---\n\nThe body.\n'; } >"$SCRATCH/$1.md"
	(cd "$SCRATCH" && HOME="$SCRATCH/home" node "$JMD" process "$1.md" -o "$1.html" >/dev/null 2>"$1.err") \
		|| fail "$1/exit" "$(cat "$SCRATCH/$1.err")"
}

# The default template: {{Title}}.
page mdash 'A &mdash; B'
has   "default/named-entity" "$SCRATCH/mdash.html" '<title>A — B</title>'
page specials 'Q &amp; A, x &lt; y'
has   "default/markup-entities" "$SCRATCH/specials.html" '<title>Q &amp; A, x &lt; y</title>'
page numeric "It&#39;s &#x2014; ok"
has   "default/numeric-entities" "$SCRATCH/numeric.html" "<title>It's — ok</title>"
page bogus 'A &bogus; B'
has   "default/unknown-entity-as-written" "$SCRATCH/bogus.html" '<title>A &amp;bogus; B</title>'
page plain 'Plain & simple <b>bold</b>'
has   "default/no-entity-unchanged" "$SCRATCH/plain.html" '<title>Plain &amp; simple &lt;b&gt;bold&lt;/b&gt;</title>'

# Markup stays text, typed or written as entities.
page typed '</title><script>alert(1)</script>'
has   "script/typed-is-text" "$SCRATCH/typed.html" '<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>'
hasnt "script/typed-no-element" "$SCRATCH/typed.html" '<script>alert(1)'
page entities 'x &lt;/title&gt;&lt;script&gt;alert(2)&lt;/script&gt;'
has   "script/entities-are-text" "$SCRATCH/entities.html" '<title>x &lt;/title&gt;&lt;script&gt;alert(2)&lt;/script&gt;</title>'
hasnt "script/entities-no-element" "$SCRATCH/entities.html" '<script>alert(2)'

# A custom template. Escaped, it is decoded as the default is; raw — {{{Title}}},
# or {{{.}}} in a {{#Title}} section — it is as written, as before, and an
# entity for `<` never becomes markup.
skeleton() { printf '<!DOCTYPE html>\n<html>\n<head>\n<title>%s</title>\n</head>\n<body>\n<h1 class="t">%s</h1>\n{{{Content}}}\n</body>\n</html>\n' "$2" "$3" >"$SCRATCH/$1.mustache"; }
skeleton esc '{{Title}}' '{{Title}}'
skeleton raw '{{{Title}}}' '{{{Title}}}'
skeleton sec '{{Title}}' '{{#Title}}{{{.}}}{{/Title}}'
page custom-esc 'x &lt;b&gt;y&lt;/b&gt; &mdash; z' esc.mustache
has   "custom/escaped-decoded" "$SCRATCH/custom-esc.html" '<h1 class="t">x &lt;b&gt;y&lt;/b&gt; — z</h1>'
page custom-raw 'x &lt;b&gt;y&lt;/b&gt; &mdash; z' raw.mustache
has   "custom/raw-as-written" "$SCRATCH/custom-raw.html" '<h1 class="t">x &lt;b&gt;y&lt;/b&gt; — z</h1>'
hasnt "custom/raw-no-element" "$SCRATCH/custom-raw.html" '<b>y</b>'
page custom-sec 'x &lt;b&gt;y&lt;/b&gt; &mdash; z' sec.mustache
hasnt "custom/raw-section-no-element" "$SCRATCH/custom-sec.html" '<b>y</b>'
has   "custom/raw-section-title-as-before" "$SCRATCH/custom-sec.html" '<title>x &amp;lt;b&amp;gt;y&amp;lt;/b&amp;gt; &amp;mdash; z</title>'

echo "html-title: $passed passed, $failed failed"
[ "$failed" -eq 0 ]
