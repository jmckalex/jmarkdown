// tests/colon-to-at/test.mjs — the colon → @ converter (src/colon-to-at.js).
// Each case: the source, the text it must become, and the kinds of change it
// must report. Every case is also run twice: a second pass changes nothing.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convert, convertColonDirectives } from '../../src/colon-to-at.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const fail = (name, msg) => { failed++; console.log(`FAIL ${name}: ${msg}`); };

function check(name, input, expected, kinds) {
	const { text, changes } = convert(input);
	if (text !== expected) return fail(name, `\n--- got ---\n${text}\n--- expected ---\n${expected}`);
	const got = changes.map(c => c.kind).join(',');
	if (kinds !== undefined && got !== kinds) return fail(name, `kinds ${got}, expected ${kinds}`);
	if (convert(text).text !== text) return fail(name, 'a second pass changed the text');
	passed++;
}

// Containers.
check('generic name keeps its element', ':::note\nBody.\n:::', '@begin(<note>)\nBody.\n@end(note)', 'same');
check('hyphenated name needs no sigil', ':::essay-feedback{id=f1}\nGood.\n:::', '@begin(essay-feedback){id=f1}\nGood.\n@end(essay-feedback)', 'same');
check('HTML container name needs no sigil', ':::aside\nx\n:::', '@begin(aside)\nx\n@end(aside)', 'same');
check('a document with its own Block elements keeps the sigil',
	'Block elements: none\n---\n:::essay-feedback\nx\n:::', 'Block elements: none\n---\n@begin(<essay-feedback>)\nx\n@end(essay-feedback)', 'same');
check('nesting by colon count', '::::outer\n:::inner\nx\n:::\n::::', '@begin(<outer>)\n@begin(<inner>)\nx\n@end(inner)\n@end(outer)', 'same,same');
check('special container', ':::abstract\nWe show.\n:::', '@begin(abstract)\nWe show.\n@end(abstract)', 'same');
check('verbatim body untouched', ':::TeX\n\\foo :ref[x] a:b[1]\n:::', '@begin(TeX)\n\\foo :ref[x] a:b[1]\n@end(TeX)', 'same');
check('TiKZ body untouched', ':::TiKZ{scale=2}\n\\draw (0,0) -- (1,1);\n:::', '@begin(TiKZ){scale=2}\n\\draw (0,0) -- (1,1);\n@end(TiKZ)', 'same');
check('known name becomes the real environment', ':::theorem[Pythagoras]{#t}\nx\n:::', '@begin(theorem)[Pythagoras]{#t}\nx\n@end(theorem)', 'changes-output');
check('a generic label is kept, and said', ':::note[A title]\nx\n:::', '@begin(<note>)[A title]\nx\n@end(note)', 'changes-output');
check('nameless container with a class', '::::{.no-colon #n}\nx\n::::', '@begin(.no-colon){#n}\nx\n@end(no-colon)', 'same');
check('nameless container without one is left', ':::\nx\n:::', ':::\nx\n:::', 'needs-you');
check('no closing line is left', ':::note\nx', ':::note\nx', 'needs-you');
check('four-colon TeX is generic in the colon syntax', '::::TeX\nx\n::::', '@begin(TeX)\nx\n@end(TeX)', 'changes-output');
check('comment at any count', '::::comment\nprivate\n::::', '@begin(comment)\nprivate\n@end(comment)', 'same');
check('Optionals from the header', 'Optionals: draft\n---\n:::draft{include=true}\nx\n:::', 'Optionals: draft\n---\n@begin(draft){include=true}\nx\n@end(draft)', 'same');
check('Optionals are space-separated', 'Optionals: answers directions[true]\n---\n:::answers\nx\n:::\n\n:::directions\ny\n:::',
	'Optionals: answers directions[true]\n---\n@begin(answers)\nx\n@end(answers)\n\n@begin(directions)\ny\n@end(directions)', 'same,same');
check('Load directives names are left', 'Load directives: box from defs.js\n---\n:::box\nx\n:::', 'Load directives: box from defs.js\n---\n:::box\nx\n:::', 'needs-you');
check('in a blockquote', '> :::note\n> x\n> :::', '> @begin(<note>)\n> x\n> @end(note)', 'same');
check('in a list item', '- item\n\n    :::note\n    x\n    :::', '- item\n\n    @begin(<note>)\n    x\n    @end(note)', 'changes-output');
check('a demo shows its new source', ':::markdown-demo\nToday is :today.\n:::', '@begin(markdown-demo)\nToday is @today.\n@end(markdown-demo)', 'changes-output,same');
check('multi-line attributes joined', ':::note{a=1\n  b=2}\nx\n:::', '@begin(<note>){a=1 b=2}\nx\n@end(note)', 'same');

// Block directives.
check('title page', '::title[A *bold* title]\n::author[J. Doe]', '@title+[A *bold* title]\n@author+[J. Doe]', 'same,same');
check('a directive inside the text', '::date[:today]', '@date+[@today]', 'same,same');
check('generic block wraps its text', '::ul[Item text]', '@begin(<ul>)\nItem text\n@end(ul)', 'same');
check('nameless block with a class', '::[Table of contents]{.toc}', '@begin(.toc)\nTable of contents\n@end(toc)', 'same');
check('a div with a class keeps its tag', '::div[J. Doe]{.larger}\n\n:::div{.remove .title-block}\nx\n:::',
	'@begin(.larger)\nJ. Doe\n@end(larger)\n\n@begin(.remove){.title-block}\nx\n@end(remove)', 'same,same');
check('div gains a class', '::div[x]{style="a"}', '@begin(div){style="a"}\nx\n@end(div)', 'changes-output');
check('legacy placements', '::Bibliography{title="Works"}\n\n::Index', '@bibliography{title="Works"}\n\n@index', 'same,same');
check('multi-line text', '::institution[LSE\nLondon]', '@institution+[LSE\nLondon]', 'same');

// Inline.
check('inline forms', '\nSee :ref[fig:a], :span[x]{.c}, :today, :TeX[\\alpha].',
	'\nSee @ref[fig:a], @span[x]{.c}, @today, @TeX[\\alpha].', 'same,same,same,same');
check('generic inline keeps its element', '\nA :note[hi]{.big} b.', '\nA @<note>[hi]{.big} b.', 'same');
check('attrs before text are reordered', '\nA :note{.big}[hi].', '\nA @<note>[hi]{.big}.', 'same');
check('index marks stay glued', '\nrecursion:index[recursion] and :index[Church, A.]{name=authors}',
	'\nrecursion@index[recursion] and @index[Church, A.]{name=authors}', 'same,same');
check('emoji and times are not directives', ':heart: and :fa-thumbs-up lg: at 10:30.', ':heart: and :fa-thumbs-up lg: at 10:30.', '');
check('prose colons are reported, not changed', '\nratio a:b, and Note:[x].', '\nratio a:b, and Note:[x].', 'prose,prose');
check('a glued directive is left', '\nsee:x[1]', '\nsee:x[1]', 'needs-you');
check('URLs are not directives', '\nGo to https://a.b/c:d[1] or <http://x:y>.', '\nGo to https://a.b/c:d[1] or <http://x:y>.', '');

// What is left alone.
check('header', 'Title: a :ref[x]\n---\n:ref[y]', 'Title: a :ref[x]\n---\n@ref[y]', 'same');
check('fenced code', '```\n:::note\n:ref[x]\n```\n:ref[y]', '```\n:::note\n:ref[x]\n```\n@ref[y]', 'same');
check('inline code and maths', '`:ref[x]` and $a:b[1]$ and \\(f:x[1]\\) and :ref[y]', '`:ref[x]` and $a:b[1]$ and \\(f:x[1]\\) and @ref[y]', 'same');
check('HTML comments and tags', '<!-- :ref[x] -->\n<span style="a:b[1]">:ref[y]</span>', '<!-- :ref[x] -->\n<span style="a:b[1]">@ref[y]</span>', 'same');
check('the inline comment', '\nSee :ref[a]. % a note :ref[b] and Meta:x\nThen :ref[c] %% kanban:settings %%',
	'\nSee @ref[a]. % a note :ref[b] and Meta:x\nThen @ref[c] %% kanban:settings %%', 'same,same');
check('a header sets the comment marker', 'Inline comment: ## true\n---\nA :ref[a] ## :ref[b]\n50% :ref[c]',
	'Inline comment: ## true\n---\nA @ref[a] ## :ref[b]\n50% @ref[c]', 'same,same');
check('a multi-line comment', '<!--\n:::note\nx\n:::\n-->', '<!--\n:::note\nx\n:::\n-->', '');
check('display maths', '$$\na:b[1]\n$$', '$$\na:b[1]\n$$', '');
check('a verbatim @begin body', '@begin(TeX)\n:ref[x]\n@end(TeX)', '@begin(TeX)\n:ref[x]\n@end(TeX)', '');
check('keys in @ forms and LaTeX are not prose', '@ref[fig:a] \\cref{fig:b} @begin(equation){id=eq:c}', '@ref[fig:a] \\cref{fig:b} @begin(equation){id=eq:c}', '');
check('CRLF', ':::note\r\nx\r\n:::\r\n', '@begin(<note>)\nx\n@end(note)\n', 'same');

// `generic` marks the names with no handler of their own.
{
	const { changes } = convert('\n:::note\nx\n:::\n\n:::abstract\ny\n:::\n\nA :my-tag[z].');
	const got = changes.map(c => `${c.name}:${c.generic ? 'g' : '-'}`).join(' ');
	if (got !== 'note:g abstract:- my-tag:g') fail('generic flag', got); else passed++;
}
// A host's own directive names come back needs-you, built-in names included.
{
	const src = '\n:::box\nx\n:::\n\n:::theorem\ny\n:::';
	const { text, changes } = convert(src, { customDirectives: ['box', 'theorem'] });
	if (text !== src || changes.map(c => c.kind).join(',') !== 'needs-you,needs-you') fail('customDirectives', JSON.stringify(changes)); else passed++;
}

// keep: [line, …] leaves those openers as written; their bodies still convert.
{
	const src = '\n:::note\nA :ref[x] here.\n:::\n\n::title[T]\n\nSee :today and :span[y].\n\n:::theorem\nz\n:::';
	const full = convert(src);
	// keep: [] is today's output.
	if (convert(src, { keep: [] }).text !== full.text) fail('keep []', 'differs from no keep');
	else passed++;
	// Keeping every converted opener leaves the input as written, except the
	// note's body (line 3), which is converted inside the kept block.
	const lines = [...new Set(full.changes.filter(c => c.to !== undefined && c.line !== 3).map(c => c.line))];
	const k = convert(src, { keep: lines });
	const expected = src.replace('A :ref[x] here.', 'A @ref[x] here.');
	if (k.text !== expected) fail('keep all', `\n${k.text}`);
	else if (k.changes.filter(c => c.kind === 'kept').length !== 5) fail('keep all', `kept ${k.changes.filter(c => c.kind === 'kept').length}`);
	else passed++;
	// Keeping one block converts the rest.
	const one = convert(src, { keep: [10] });
	if (!one.text.includes('\n:::theorem\nz\n:::') || !one.text.includes('@begin(<note>)')) fail('keep one', one.text);
	else passed++;
	// Composes with customDirectives, and is idempotent.
	const both = convert(src, { keep: [2], customDirectives: ['theorem'] });
	if (!both.text.startsWith('\n:::note\nA @ref[x] here.\n:::') || !both.text.includes(':::theorem') || both.changes.find(c => c.line === 10).kind !== 'needs-you') fail('keep + customDirectives', both.text);
	else if (convert(both.text, { keep: [2], customDirectives: ['theorem'] }).text !== both.text) fail('keep idempotent', 'second pass changed it');
	else passed++;
}

// Line numbers count from the first line of the source, header included.
{
	const { changes } = convert('Title: t\n---\n\nA :ref[x].\n\n:::note\ny\n:::');
	const lines = changes.map(c => c.line).join(',');
	if (lines !== '4,6') fail('line numbers', `got ${lines}`); else passed++;
}

// The two names are one function.
if (convert !== convertColonDirectives) fail('aliases', 'convert !== convertColonDirectives'); else passed++;

// Import-free, as Clew's browser bundle needs (callout-table.js's rule).
{
	const src = fs.readFileSync(path.join(here, '../../src/colon-to-at.js'), 'utf8');
	const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
	if (/^\s*import\s/m.test(code) || /\brequire\(|\bprocess\.|\bBuffer\b/.test(code)) fail('import-free', 'colon-to-at.js imports something or uses a Node global');
	else passed++;
}

// In step with the engine: every name the converter calls special has an @
// handler, and its HTML containers are begin-end-core's (less div).
{
	const core = fs.readFileSync(path.join(here, '../../src/begin-end-core.js'), 'utf8');
	const list = core.match(/BLOCK_CONTAINER_ELEMENTS = new Set\(\[([\s\S]*?)\]\)/)[1].match(/'[a-z]+'/g).map(s => s.slice(1, -1)).filter(n => n !== 'div').sort().join(' ');
	const ours = fs.readFileSync(path.join(here, '../../src/colon-to-at.js'), 'utf8').match(/HTML_CONTAINERS = new Set\(\[([\s\S]*?)\]\)/)[1].match(/'[a-z]+'/g).map(s => s.slice(1, -1)).sort().join(' ');
	if (list !== ours) fail('HTML containers', `begin-end-core: ${list}\ncolon-to-at:    ${ours}`); else passed++;
}

console.log(`colon-to-at: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
