/*
	Float environments — currently @begin(figure); table to follow.

	A captioned, numbered, cross-referenceable float:

	    @begin(figure)[A caption]{id=fig:demo}
	    ![alt](diagram.png)
	    @end(figure)

	LaTeX emits the native float and lets the engine number it (so \ref/\cref
	resolve); HTML emits a <figure> that the post-processor numbers in document
	order and records for :ref/:cref (see number_figures in post-processor.js).

	A BARE markdown image (![alt](src)) is just a graphic, not a float — reach for
	a figure environment when you want a caption + number + reference. The label
	key goes in {id=…} (the {#…} shorthand can't carry a colon, so {id=fig:x} is
	the colon-safe form).
*/

import { registerBlockEnvironment } from './begin-end-core.js';
import { requirePackage } from './preamble.js';
import { escapeLatexText } from './latex-escape.js';

function htmlEscape(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

// A {width=0.45} fraction → an HTML percentage ("45%"). attributes-parser coerces
// the number, so width arrives as 0.45.
function pct(width) {
	const n = Number(width);
	if (!Number.isFinite(n)) return '';
	return `${Math.round(n * 100)}%`;
}

registerBlockEnvironment('figure', {
	mode: 'markdown',

	// The "Figure N:" prefix and the cross-ref record are added later by the
	// post-processor, so numbering follows document order and forward refs work.
	html: (ctx) => {
		const id = ctx.attrs?.id ? ` id="${ctx.attrs.id}"` : '';
		const caption = ctx.text ? htmlEscape(ctx.text) : '';
		return `<figure class="figure"${id}>\n${ctx.inner}\n<figcaption class="figure-caption">${caption}</figcaption>\n</figure>\n`;
	},

	// The native float; the engine numbers it. \label after \caption so it
	// captures the figure counter. A blank line before \caption keeps it below
	// the contents (and below a row of subfigures).
	latex: (ctx) => {
		requirePackage('graphicx');
		const caption = ctx.text ? `\\caption{${escapeLatexText(ctx.text)}}\n` : '';
		const label = ctx.attrs?.id ? `\\label{${ctx.attrs.id}}\n` : '';
		return `\\begin{figure}[htbp]\n\\centering\n${ctx.inner}\n\n${caption}${label}\\end{figure}\n\n`;
	}
});

// @begin(subfigure) — a sub-panel inside an @begin(figure). Each gets its own
// caption, its own label, and a sub-letter ((a), (b), …) so a reference reads
// "1a"/"figure 1a". Width is {width=0.45} (a fraction of \textwidth / of the
// row); panels sit side by side. LaTeX uses the subcaption package.
registerBlockEnvironment('subfigure', {
	mode: 'markdown',

	// The "(a)" sub-letter and the cross-ref record are added by the
	// post-processor (number_figures), which knows the parent figure's number.
	html: (ctx) => {
		const id = ctx.attrs?.id ? ` id="${ctx.attrs.id}"` : '';
		const caption = ctx.text ? htmlEscape(ctx.text) : '';
		const w = ctx.attrs?.width != null ? pct(ctx.attrs.width) : '';
		const style = w ? ` style="width:${w}"` : '';
		return `<figure class="subfigure"${id}${style}>\n${ctx.inner}\n<figcaption class="subfigure-caption">${caption}</figcaption>\n</figure>\n`;
	},

	// subcaption's subfigure environment; the engine sub-numbers it and \ref/\cref
	// resolve to "1a". \hfill lets adjacent panels share a row.
	latex: (ctx) => {
		requirePackage('subcaption');
		const w = ctx.attrs?.width != null ? ctx.attrs.width : 0.45;
		const caption = ctx.text ? `\\caption{${escapeLatexText(ctx.text)}}\n` : '';
		const label = ctx.attrs?.id ? `\\label{${ctx.attrs.id}}\n` : '';
		return `\\begin{subfigure}[b]{${w}\\textwidth}\n\\centering\n${ctx.inner}\n${caption}${label}\\end{subfigure}\n\\hfill\n`;
	}
});
