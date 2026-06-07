/*
	LaTeX renderer for marked.js built-in tokens.

	This module exports a renderer object suitable for passing to
	marked.use({ renderer: latexRenderer }).  It covers the core
	structural tokens: paragraphs, headings, emphasis, bold, code,
	links, images, lists, blockquotes, horizontal rules, and line breaks.

	Tokens produced by custom extensions (e.g. /italics/, ==highlight==)
	are handled in their own extension renderers, not here.
*/

import { configManager } from './config-manager.js';
import { requirePackage } from './preamble.js';

// LaTeX prose escaping. Only `&` and `#` need escaping at this layer:
// `_` and `%` are JMarkdown source-level syntax (subscript / comment), so
// any surviving instance has already been escaped by the author. `$` is
// reserved for math, which the HTML pipeline validates via MathJax and
// is passed through verbatim to LaTeX.
function escapeLatex(text) {
	if (text == null) return '';
	return String(text).replace(/&/g, '\\&').replace(/#/g, '\\#');
}

// The LaTeX sectioning ladder, deepest-up. Heading depth N maps to the command
// `base + (N - 1)` rungs down this ladder, clamped at the bottom.
const SECTIONING = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];

// Coerce a metadata/config value (string, or single-element array from the
// metadata-header parser) to a trimmed lower-case string.
function metaWord(key) {
	const v = configManager.getMeta(key);
	if (v == null) return '';
	return (Array.isArray(v) ? v.join(' ') : String(v)).trim().toLowerCase();
}

// Which sectioning command a depth-1 heading (`#`) maps to. An explicit
// `Heading base` wins; otherwise it is derived from the document class —
// chapter-bearing classes (book/report/memoir…) start at \chapter, everything
// else (article, the default) starts at \section. This keeps the DEFAULT output
// (\documentclass{article}, which has no \chapter) compilable.
function headingBaseIndex() {
	const explicit = metaWord('Heading base');
	if (explicit && SECTIONING.includes(explicit)) return SECTIONING.indexOf(explicit);

	const cls = metaWord('Document class') || 'article';
	const chapterClasses = ['book', 'report', 'memoir', 'scrbook', 'scrreprt', 'extbook', 'extreport'];
	return SECTIONING.indexOf(chapterClasses.includes(cls) ? 'chapter' : 'section');
}

const latexRenderer = {

	paragraph(token) {
		return `${this.parser.parseInline(token.tokens)}\n\n`;
	},

	heading(token) {
		let content = this.parser.parseInline(token.tokens);
		const idx = Math.min(headingBaseIndex() + (token.depth - 1), SECTIONING.length - 1);
		const command = SECTIONING[idx];

		// Check for {-} suffix, which signals an unnumbered heading.
		let starred = '';
		if (/\s*\{-\}\s*$/.test(content)) {
			content = content.replace(/\s*\{-\}\s*$/, '');
			starred = '*';
		}

		return `\\${command}${starred}{${content}}\n\n`;
	},

	strong(token) {
		return `\\textbf{${this.parser.parseInline(token.tokens)}}`;
	},

	em(token) {
		return `\\emph{${this.parser.parseInline(token.tokens)}}`;
	},

	codespan(token) {
		requirePackage('minted');
		const lang = configManager.get('Code language') || 'text';
		return `\\mintinline{${lang}}{${token.text}}`;
	},

	code(token) {
		// Prefer the fence's named language (```javascript) over the
		// document-wide default. Requires \usepackage{minted} in the
		// preamble (declared here) and pdflatex -shell-escape at compile time.
		requirePackage('minted');
		const lang = token.lang || configManager.get('Code language') || 'text';
		return `\\begin{minted}{${lang}}\n${token.text}\n\\end{minted}\n\n`;
	},

	link(token) {
		requirePackage('hyperref');
		const text = this.parser.parseInline(token.tokens);
		return `\\href{${escapeLatex(token.href)}}{${text}}`;
	},

	image(token) {
		// A simple default; width and placement can be refined later.
		requirePackage('graphicx');
		return `\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=\\textwidth]{${escapeLatex(token.href)}}\n\\caption{${escapeLatex(token.text || '')}}\n\\end{figure}\n\n`;
	},

	blockquote(token) {
		const body = this.parser.parse(token.tokens).trimEnd();
		return `\\begin{quote}\n${body}\n\\end{quote}\n\n`;
	},

	list(token) {
		const env = token.ordered ? 'enumerate' : 'itemize';
		let body = '';
		for (const item of token.items) {
			body += this.listitem(item);
		}
		return `\\begin{${env}}\n${body}\\end{${env}}\n\n`;
	},

	listitem(token) {
		const content = this.parser.parse(token.tokens);
		return `\\item ${content.trim()}\n`;
	},

	table(token) {
		// Fallback for marked's built-in `table` token. The two table
		// extensions in `marked-extended-tables-headerless.js` intercept
		// most tables and render directly to LaTeX, but marked's GFM
		// tokenizer is more permissive (e.g. accepts rows without trailing
		// pipes) and falls through to this renderer for those edge cases.
		const ncols = token.header.length;
		const aligns = token.align.map(a => {
			if (a === 'center') return 'c';
			if (a === 'right') return 'r';
			return 'l';
		});
		const colspec = aligns.join('');

		let tex = `\\begin{tabular}{${colspec}}\n\\hline\n`;

		// Header row
		const headerCells = token.header.map(cell =>
			this.parser.parseInline(cell.tokens)
		);
		tex += headerCells.join(' & ') + ' \\\\\n\\hline\n';

		// Body rows
		for (const row of token.rows) {
			const cells = row.map(cell =>
				this.parser.parseInline(cell.tokens)
			);
			tex += cells.join(' & ') + ' \\\\\n';
		}

		tex += '\\hline\n\\end{tabular}\n\n';
		return tex;
	},

	hr(token) {
		return '\\bigskip\\noindent\\rule{\\textwidth}{0.4pt}\\bigskip\n\n';
	},

	br(token) {
		return '\\\\\n';
	},

	text(token) {
		// A text token may contain inline sub-tokens (e.g. when it appears
		// inside a paragraph that has been partially parsed).
		if (token.tokens) {
			return this.parser.parseInline(token.tokens);
		}
		return escapeLatex(token.text);
	}
};

export default latexRenderer;
