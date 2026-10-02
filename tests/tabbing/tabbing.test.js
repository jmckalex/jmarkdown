// Tabbing (src/tabbing.js): the parser, LaTeX's layout replayed over widths
// (expectations worked by hand from latex.ltx, 10 units a character,
// \tabbingsep 5), and the LaTeX it writes back. Ported from Clew-app's
// tests/tabbing.test.js (@03bb33a); the port's own cases are at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTabbing, layoutTabbing, tabbingLatex, tabbingHtml } from '../../src/tabbing.js';
import { tabbingPageScript, docsTabbingLayout } from '../../src/tabbing-page.js';
import fs from 'node:fs';

const ops = (row) => row.items.map((it) => (it.op === 'text' ? JSON.stringify(it.text) : it.op)).join(' ');
/** Lay out with 10 units a character; returns each row's text lefts in order. */
function lay(body, opts = {}) {
	const rows = parseTabbing(body);
	const out = layoutTabbing(rows, (r, i) => rows[r].items[i].text.length * 10, { sep: 5, ...opts });
	return out.map(({ lefts }) => [...lefts.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x));
}

test('marks and LaTeX commands parse to the same rows', () => {
	const marks = parseTabbing('Name: |= Street: |= Phone\nAlice |> 12 Oak |> 555');
	const latex = parseTabbing('Name: \\= Street: \\= Phone \\\\ Alice \\> 12 Oak \\> 555');
	assert.deepEqual(marks, latex);
	assert.equal(ops(marks[0]), '"Name: " set "Street: " set "Phone"');
	assert.equal(ops(marks[1]), '"Alice" next "12 Oak" next "555"');
});

test('whitespace: one space kept before a stop, none elsewhere; aligned source sets nothing wider', () => {
	const [row] = parseTabbing('Name:        |= Street:    |> x   ');
	assert.equal(ops(row), '"Name: " set "Street:" next "x"');
});

test('kill rows, silent push/pop rows, \\\\[len], every mark', () => {
	const rows = parseTabbing('Mon: |= 9–10 |= Room |kill\n|[\nA |< B |+ C |- D |\' E |` F\n|]\nx \\kill\ny \\\\[2pt] z');
	assert.equal(rows[0].kill, true);
	assert.equal(ops(rows[0]), '"Mon: " set "9–10 " set "Room"');
	assert.equal(rows[1].silent, true);
	assert.equal(ops(rows[2]), '"A" back "B" plus "C" minus "D" lab "E" rj "F"');
	assert.equal(rows[3].silent, true);
	assert.equal(rows[4].kill, true);
	assert.equal(ops(rows[5]), '"y"');
	assert.equal(ops(rows[6]), '"z"');
});

test('marks are text inside maths and code, and \\| is a bar', () => {
	const [row] = parseTabbing('$|x|=1$ |> `a|>b` |> a\\|b');
	assert.equal(ops(row), '"$|x|=1$" next "`a|>b`" next "a|b"');
});

test('\\a= \\a\' \\a` are the accents', () => {
	const [row] = parseTabbing("\\a=o \\a'e \\a`{a}");
	assert.equal(row.items[0].text, 'o\u0304 e\u0301 a\u0300');
	assert.equal(row.items[0].text.normalize('NFC'), 'ō é à');
});

test('layout: stops at the text before them; \\> jumps back and overprints, as TeX does', () => {
	// "Name: " = 60 → stop 1; "Street: " = 80 → stop 2 at 140.
	// Row 2: Alice at 0; \> to 60; "12 Oak Street" (130) runs to 190; \> to stop 2
	// at 140 — a NEGATIVE skip, so "555" overprints the overrun.
	assert.deepEqual(lay('Name: |= Street: |= Phone\nAlice |> 12 Oak Street |> 555'), [[0, 60, 140], [0, 60, 140]]);
});

test('layout: a \\kill ruler sets the stops and the rows below use them', () => {
	assert.deepEqual(lay('Monday: |= 10:00-11:00 |= |kill\nTue |> 9 |> Room'), [[0, 80], [0, 80, 200]]);
});

test('layout: \\+ and \\- move the margin for the FOLLOWING rows; \\< steps back at a row start', () => {
	// Stops: "A " 20, "B " 40. `x |+`: margin 1 from the next row. `y` at 20;
	// `|< w` at 0 (this row only); `y2 |-` at 20, margin back to 0; `z` at 0.
	assert.deepEqual(lay('A |= B |= C\nx |+\ny\n|< w\ny2 |-\nz'), [[0, 20, 40], [0], [20], [0], [20], [0]]);
});

test('layout: \\\' ends the text so far tabbingsep before its column', () => {
	// \> to stop 1 (60); "Label" (50) → ends 5 before 60: left = 60 - 50 - 5 = 5;
	// "Text" starts at the column, 60.
	assert.deepEqual(lay('Name: |= x\n|> Label |\' Text'), [[0, 60], [5, 60]]);
});

test('layout: \\` puts the rest of the row flush against the right margin', () => {
	assert.deepEqual(lay('Left |` Right', { lineWidth: 300 }), [[0, 250]]);
});

test('layout: \\pushtabs / \\poptabs save and restore the stops', () => {
	// Stops 20, 40; pushed; a ruler redefines stop 1 at 120; a row uses it;
	// popped; the next row is back at 20.
	// (The push and pop rows show nothing: empty.)
	assert.deepEqual(lay('A |= B |= C\n|[\nlonger text |= |kill\n|> q\n|]\n|> r'),
		[[0, 20, 40], [], [0], [120], [], [20]]);
});

test('layout: \\= on a later row redefines a stop and keeps the ones after it', () => {
	// Stops 20, 40. Row 2: \> to 20, "xx " (30), \= sets stop 2 at 50 (not a
	// third stop: \@hightab stays 2). Row 3: \>\> reaches stop 2 — now 50.
	assert.deepEqual(lay('A |= B |= C\n|> xx |=\n|>|> q'), [[0, 20, 40], [20], [50]]);
});

test('LaTeX: the environment itself, every mark its command, kill rows killed', () => {
	const rows = parseTabbing('Mon: |= 9–10 |= Room |kill\nTue |> 9 |> R101\n|[\n|> |\' x\n|]');
	const tex = tabbingLatex(rows, (item) => item.text.trim());
	assert.equal(tex, [
		'\\begin{tabbing}',
		'Mon: \\= 9–10 \\= Room \\kill',
		'Tue \\> 9 \\> R101 \\\\',
		'\\pushtabs',                 // a push is no line of its own
		'\\> \\\' x',                // the last shown row: no \\\\
		'\\poptabs',
		'\\end{tabbing}',
		'',                           // a blank line after: the engine's
		'',                           // blocks all end so (not in Clew's)
	].join('\n'));
});

test('HTML: rows, pieces and command markers; ruler rows marked', () => {
	const html = tabbingHtml(parseTabbing('A |= B |kill\nx |> y'), (item) => item.text, 'k1');
	assert.match(html, /^<div class="clew-tabbing" data-tabbing-key="k1">/);
	assert.match(html, /<div class="tb-row tb-kill"><span class="tb-t">A <\/span><span class="tb-op" data-op="set"><\/span><span class="tb-t">B<\/span><\/div>/);
	assert.match(html, /<div class="tb-row"><span class="tb-t">x<\/span><span class="tb-op" data-op="next"><\/span><span class="tb-t">y<\/span><\/div>/);
});

// ---- the port's own -------------------------------------------------------

test('LaTeX: \\a= \\a\' \\a` go back to the accent commands (pdfLaTeX has no combining marks)', () => {
	const rows = parseTabbing("Caf\\a'e \\> m\\a=ean \\> \\a`{a}");
	assert.equal(tabbingLatex(rows, (item) => item.text), "\\begin{tabbing}\nCaf\\a'{e} \\> m\\a={e}an \\> \\a`{a}\n\\end{tabbing}\n\n");
	// The HTML keeps the marks.
	assert.match(tabbingHtml(rows, (item) => item.text), /Caf\u0065\u0301/);
});

test('tabbing.js imports nothing (Clew\'s browser bundle imports it)', () => {
	const source = fs.readFileSync(new URL('../../src/tabbing.js', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /^\s*import\b|\brequire\(|\bimport\(/m);
});

test('the page script is self-contained source', () => {
	const script = tabbingPageScript();
	assert.doesNotThrow(() => new Function(script));
	assert.match(script, /function layoutTabbing\(/);
});

test('docs/tabbing-layout.js is the current page script (scripts/docs-tabbing-layout.mjs)', () => {
	const docs = fs.readFileSync(new URL('../../docs/tabbing-layout.js', import.meta.url), 'utf8');
	assert.equal(docs, docsTabbingLayout());
});
