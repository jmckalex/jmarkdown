import { registerBlockEnvironment } from './begin-end-core.js';
import { marked, marked_copy } from './utils.js';

export const targets = {
	level: 'inline',
	label: 'target',
	marker: ':',
	renderer(token) {
		if (token.meta.name === "target") {
			// `:target` with no `[…]` (prose such as Meta Bind's
			// `INPUT[number:target]`, or `:target{…}`) names no target: its text
			// prints as it stands, exactly as a text token would, as if the rule
			// had not matched. It used to throw (`token.text` undefined) and stop
			// the build.
			if (typeof token.text !== 'string') {
				return this.parser.renderer.text({ type: 'text', raw: token.raw, text: token.raw });
			}
			if (global.isLatex) return latexTarget(this.parser, token.text, token.jmdCellColumns);
			return `<span data-target-id='${token.text.trim()}'></span>`;
		}
		return false;
	}
}

export const sources = {
	level: 'container',
	label: "source",
	// tokenizer: function(text, token) {
	// 	token.text = text.replace("\n", '');
	// 	return token;
	// },
	renderer(token) {
		if (token.meta.name === "source") {
			// LaTeX: the content goes to its targets (latexTarget); here, nothing.
			if (global.isLatex) return '';
			const target = token.attrs.target.trim();
			return `<div data-target='${target}'>${this.parser.parse(token.tokens)}</div>`;
		}
		return false;
	}
};


export const inlineTarget = {
	name: 'inlineTarget',
	level: 'inline',
	start(src) { return src.match(/🎯/)?.index },
	tokenizer(src) {
		const match = src.match(/^🎯([a-zA-Z0-9_-]+)/);
		if (match) {
			const token = {
				type: 'inlineTarget',
				raw: match[0],
				text: match[1].trim(),
				tokens: []
			};
			return token;
		}
	},
	renderer(token) {
		if (global.isLatex) return latexTarget(this.parser, token.text, token.jmdCellColumns);
		return `<span data-target-id='${token.text}'></span>`;
	}
};


/*
	@-sigil ports of the colon forms, sharing the begin-end registry (the ':::source'
	container and ':target' inline stay live alongside). The emoji `🎯` inlineTarget is
	not a colon directive; it is a third spelling of a target.

	  @begin(source){target=X} … @end(source)   ≡  :::source{target=X} … :::
	  @target[X]                                 ≡  :target[X]  ≡  🎯X
*/
registerBlockEnvironment('source', {
	mode: 'markdown',
	html: (ctx) => `<div data-target='${(ctx.attrs?.target ?? '').trim()}'>${ctx.inner}</div>`,
	latex: () => ''
});
registerBlockEnvironment('target', {
	mode: 'verbatim',
	html: (ctx) => `<span data-target-id='${ctx.text.trim()}'></span>`,
	latex: (ctx) => latexTarget(ctx.parser, ctx.text, ctx.token.jmdCellColumns)
});


/*
	LaTeX. The HTML moves each source to its targets once the page is built
	(replaceTargetsBySources, below, over the DOM), and the LaTeX output has no
	such pass — so a LaTeX build used to print the markers themselves
	(`<div data-target='X'>…</div>`, `<span data-target-id='X'></span>`), with the
	source's content where it was written. The move is made in the tokens instead:
	every token is lexed before any is rendered, so a walkTokens hook records the
	FIRST source for each target name, in document order, and each target then
	renders that source's content where it stands, while a source renders nothing
	where it was written. That is what the HTML shows: the first source with a name
	fills each of its targets, and a source with no target — or a second source with
	the same name — is gone. A target with no source is nothing in both.

	LaTeX builds only (the HTML path is untouched). A target inside its own source
	would render the source inside itself forever, so a source being rendered gives
	nothing to a target within it.

	A table cell is where a source matters most — a Markdown table cannot hold a
	code block or two paragraphs, and a target puts them there — and LaTeX cannot
	set a listing or a paragraph break in a tabular cell either. So the hook also
	marks every target in a table's cells with the table's column count, and block
	content (a blank line, or an environment) for such a target is set in a top-
	aligned minipage, an equal share of the line wide: \linewidth over the columns,
	less the cell's padding. (varwidth would fit the box to its content, but a
	listing is always \linewidth wide, which pushes the next column off the page.)
*/
const latexSources = new Map();
const latexRendering = new Set();

function sourceName(token) {
	const isSource = (token.type === 'beginEnd' && token.name === 'source')
		|| (token.meta?.level === 'container' && token.meta?.name === 'source');
	const target = isSource ? token.attrs?.target : undefined;
	return target === undefined || target === null ? null : String(target).trim();
}

const TABLES = new Set(['table', 'spanTable', 'headerlessTable']);

const isTarget = (token) => token.type === 'inlineTarget'
	|| (token.type === 'atInline' && token.name === 'target')
	|| (token.meta?.level === 'inline' && token.meta?.name === 'target');

// Every target anywhere inside a table token (its header and rows hold cells,
// each with its inline tokens), marked with the table's column count.
function markCellTargets(value, columns, seen = new Set()) {
	if (!value || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	if (!Array.isArray(value) && isTarget(value)) value.jmdCellColumns = columns;
	for (const child of Array.isArray(value) ? value : Object.values(value)) {
		markCellTargets(child, columns, seen);
	}
}

function recordLatexSource(token) {
	if (!global.isLatex) return;
	if (TABLES.has(token.type)) markCellTargets(token, token.align?.length || 1);
	const name = sourceName(token);
	if (name !== null && !latexSources.has(name)) latexSources.set(name, token.tokens || []);
}

function latexTarget(parser, name, cellColumns) {
	const key = String(name).trim();
	const tokens = latexSources.get(key);
	if (!tokens || latexRendering.has(key)) return '';
	latexRendering.add(key);
	let content;
	try {
		content = parser.parse(tokens).trim();
	} finally {
		latexRendering.delete(key);
	}
	if (cellColumns && /\n[ \t]*\n|\\begin\{/.test(content)) {
		return `\\begin{minipage}[t]{\\dimexpr\\linewidth/${cellColumns}-2\\tabcolsep\\relax}\n${content}\n\\end{minipage}`;
	}
	return content;
}

marked.use({ walkTokens: recordLatexSource });
marked_copy.use({ walkTokens: recordLatexSource });


export function replaceTargetsBySources($) {
	$('[data-target]').each(function () {
		const $sourceElement = $(this);
		const targetID = $sourceElement.attr('data-target');
		// Find all target elements
		$(`[data-target-id='${targetID}']`).each(function() {
			const $targetElement = $(this);
			$sourceElement.removeAttr('data-target');
			$targetElement.replaceWith($sourceElement.clone());
		});
		$sourceElement.remove();
	})
}


