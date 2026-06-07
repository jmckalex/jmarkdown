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
	// captures the figure counter.
	latex: (ctx) => {
		requirePackage('graphicx');
		const caption = ctx.text ? `\\caption{${escapeLatexText(ctx.text)}}\n` : '';
		const label = ctx.attrs?.id ? `\\label{${ctx.attrs.id}}\n` : '';
		return `\\begin{figure}[htbp]\n\\centering\n${ctx.inner}\n${caption}${label}\\end{figure}\n\n`;
	}
});
