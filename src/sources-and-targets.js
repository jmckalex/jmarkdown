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
			if (global.isLatex) return latexTarget(this.parser, token.text);
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
		if (global.isLatex) return latexTarget(this.parser, token.text);
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
	latex: (ctx) => latexTarget(ctx.parser, ctx.text)
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
*/
const latexSources = new Map();
const latexRendering = new Set();

function sourceName(token) {
	const isSource = (token.type === 'beginEnd' && token.name === 'source')
		|| (token.meta?.level === 'container' && token.meta?.name === 'source');
	const target = isSource ? token.attrs?.target : undefined;
	return target === undefined || target === null ? null : String(target).trim();
}

function recordLatexSource(token) {
	if (!global.isLatex) return;
	const name = sourceName(token);
	if (name !== null && !latexSources.has(name)) latexSources.set(name, token.tokens || []);
}

function latexTarget(parser, name) {
	const key = String(name).trim();
	const tokens = latexSources.get(key);
	if (!tokens || latexRendering.has(key)) return '';
	latexRendering.add(key);
	try {
		return parser.parse(tokens).trim();
	} finally {
		latexRendering.delete(key);
	}
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


