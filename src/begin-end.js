/*
	JMarkdown's layer over the generic @begin/@end core (begin-end-core.js).

	This file is the rip-out boundary.  Everything LaTeX- and JMarkdown-specific
	lives here, so the core can be lifted out and published as a standalone,
	HTML-only marked extension simply by dropping this file.  Here we:

	  • detect the output format from JMarkdown's global.isLatex switch,
	  • read the `Block elements` policy from the JMarkdown config,
	  • supply the generic LaTeX fallback (\begin{name}…\end{name}) and the LaTeX
	    form of an orphan opener,
	  • register the four parity environments (abstract / feedback / TeX / HTML)
	    so that @begin(x) renders identically to :::x.

	Other modules register their own environments into the same registry — see
	metadata-header.js (comment / optionals) and strategic-form-games.js (game).

	Parity notes:
	  • abstract / feedback share their render bodies with the directives in
	    additional-directives.js (no drift), and have *no* LaTeX branch — like the
	    directives, they emit their HTML in both output formats, by design.  With
	    only an `html` renderer they fall back to HTML in LaTeX mode, which is
	    exactly that behaviour.
	  • TeX (verbatim, LaTeX-only) and HTML (markdown, HTML-only) are output-format
	    gated; here that is expressed directly as separate html/latex renderers —
	    the dual-output design the core was built for.  Their one-line bodies
	    mirror renderTeXEnv / renderHTMLEnv in additional-directives.js.
*/

import { createBeginEnd, registerBlockEnvironment } from './begin-end-core.js';
import { renderAbstract, renderFeedback } from './additional-directives.js';
import { configManager } from './config-manager.js';

const format = () => (global.isLatex ? 'latex' : 'html');

// Parity with the existing directives: @begin(x) ≡ :::x for these four names.
registerBlockEnvironment('abstract', {
	mode: 'markdown',
	html: (ctx) => renderAbstract(ctx.inner)
});
registerBlockEnvironment('feedback', {
	mode: 'markdown',
	html: (ctx) => renderFeedback(ctx.inner)
});
registerBlockEnvironment('TeX', {
	mode: 'verbatim',          // raw LaTeX: $, _, \ etc. survive untouched
	html: () => '',
	latex: (ctx) => ctx.rawText
});
registerBlockEnvironment('HTML', {
	mode: 'markdown',          // markdown prose, emitted only in HTML output
	html: (ctx) => ctx.inner,
	latex: () => ''
});
// Conditional content (the @begin parity of :::print / :::web): markdown prose
// emitted in one output only — e.g. a static figure for print vs. an interactive
// widget for the web, from a single source.
registerBlockEnvironment('print', {
	mode: 'markdown',
	html: () => '',
	latex: (ctx) => ctx.inner
});
registerBlockEnvironment('web', {
	mode: 'markdown',
	html: (ctx) => ctx.inner,
	latex: () => ''
});

export const beginEnd = createBeginEnd({
	getFormat: format,
	blockElements: () => configManager.get('Block elements', 'hyphenated'),

	// The generic LaTeX environment for any unregistered name: \begin{name}…\end.
	// (The core supplies the matching generic HTML; this is the LaTeX half.)
	fallback: {
		latex: (ctx) => {
			const opt = ctx.text ? `[${ctx.text}]` : '';
			return `\\begin{${ctx.name}}${opt}\n${ctx.inner}\n\\end{${ctx.name}}\n\n`;
		}
	},

	// An orphan opener in LaTeX is emitted as the verbatim line.
	orphan: {
		latex: (literal) => literal + '\n'
	}
});

export default beginEnd;
