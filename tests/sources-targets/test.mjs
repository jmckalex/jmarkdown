// tests/sources-targets/test.mjs — linkSourcesAndTargets (src/sources-and-targets.js),
// the processAllTokens hook that moves a source to its targets in LaTeX. It links
// each target token to the first source with its name in the SAME token tree,
// so a second parse in a process can never see the first one's sources (the
// state used to be a module-level Map, and a second LaTeX build printed the
// first build's content). The trees here have the shapes the engine's
// tokenizers give.
import { linkSourcesAndTargets } from '../../src/sources-and-targets.js';

let failed = 0, passed = 0;
function check(name, ok, detail = '') {
	if (ok) passed++;
	else { failed++; console.log(`FAIL ${name}${detail ? ': ' + detail : ''}`); }
}

const text = (t) => ({ type: 'text', raw: t, text: t });
const atSource = (name, words) => ({ type: 'beginEnd', name: 'source', attrs: { target: name }, tokens: [{ type: 'paragraph', tokens: [text(words)] }] });
const colonSource = (name, words) => ({ type: 'directiveContainer', meta: { level: 'container', name: 'source' }, attrs: { target: name }, tokens: [{ type: 'paragraph', tokens: [text(words)] }] });
const atTarget = (name) => ({ type: 'atInline', name: 'target', text: name });
const para = (...tokens) => ({ type: 'paragraph', tokens });
const words = (target) => target.jmdSource?.[0]?.tokens?.[0]?.text;

global.isLatex = true;

// Two parses, one after the other: each target finds its own tree's source.
{
	const first = atTarget('x'), second = atTarget('x');
	linkSourcesAndTargets([para(first), atSource('x', 'FIRST')]);
	linkSourcesAndTargets([para(second), atSource('x', 'SECOND')]);
	check('the first parse links its own source', words(first) === 'FIRST', words(first));
	check('a second parse links ITS source, not the first parse\'s', words(second) === 'SECOND', words(second));
}
{
	const later = atTarget('y');
	linkSourcesAndTargets([atSource('x', 'FIRST')]);
	linkSourcesAndTargets([para(later)]);
	check('a name the parse has no source for links nothing, whatever an earlier parse had', later.jmdSource === null);
}

// Within one parse: document order, first source wins, every spelling.
{
	const before = atTarget('x'), after = atTarget('x');
	linkSourcesAndTargets([para(before), atSource('x', 'one'), atSource('x', 'two'), para(after)]);
	check('a target before its source is linked', words(before) === 'one', words(before));
	check('the first source with a name wins', words(after) === 'one', words(after));
}
{
	const spellings = [
		atTarget('x'),
		{ type: 'atBlock', name: 'target', text: 'x' },
		{ type: 'directiveInline', meta: { level: 'inline', name: 'target' }, text: ' x ' },
		{ type: 'inlineTarget', text: 'x' },
	];
	linkSourcesAndTargets([para(...spellings), colonSource('x', 'colon')]);
	check('@target, @target+, :target and 🎯 are all linked, to a colon source too',
		spellings.every((t) => words(t) === 'colon'), spellings.map(words).join(','));
}
{
	const prose = { type: 'directiveInline', meta: { level: 'inline', name: 'target' } };
	linkSourcesAndTargets([para(prose), atSource('x', 'one')]);
	check('a :target with no [text] is prose, not linked', !('jmdSource' in prose));
}
{
	const nested = atTarget('x');
	const source = atSource('x', 'outer');
	source.tokens.push(para(nested));
	linkSourcesAndTargets([source]);
	check('a target inside its own source is linked (the renderer stops the recursion)', words(nested) === 'outer');
}

// Table cells: the column count, for the minipage the renderer sets block content in.
{
	const inCell = atTarget('x'), outside = atTarget('x');
	const table = { type: 'table', align: [null, null, null], header: [{ tokens: [text('A')] }, { tokens: [text('B')] }, { tokens: [text('C')] }], rows: [[{ tokens: [inCell] }, { tokens: [] }, { tokens: [] }]] };
	const spanCell = atTarget('x');
	const spanTable = { type: 'spanTable', align: [null, null], rows: [[{ text: '', tokens: [spanCell] }, { text: '', tokens: [] }]] };
	linkSourcesAndTargets([table, spanTable, para(outside), atSource('x', 'one')]);
	check('a target in a table cell gets the table\'s column count', inCell.jmdCellColumns === 3, String(inCell.jmdCellColumns));
	check('a spanTable cell too', spanCell.jmdCellColumns === 2, String(spanCell.jmdCellColumns));
	check('a target outside a table gets none', outside.jmdCellColumns === undefined);
	check('a target in a cell is still linked', words(inCell) === 'one');
}

// HTML builds: the DOM pass moves sources there; the hook touches nothing.
{
	global.isLatex = false;
	const target = atTarget('x');
	linkSourcesAndTargets([para(target), atSource('x', 'one')]);
	check('an HTML build is left alone', !('jmdSource' in target));
	global.isLatex = true;
}

console.log(`sources-targets: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
