/*
	LaTeX renderer for marked.js built-in tokens.

	This module exports a renderer object suitable for passing to
	marked.use({ renderer: latexRenderer }).  It covers the core
	structural tokens: paragraphs, headings, emphasis, bold, code,
	links, images, lists, blockquotes, horizontal rules, and line breaks.

	Tokens produced by custom extensions (e.g. /italics/, ==highlight==)
	are handled in their own extension renderers, not here.
*/

// Default heading-depth → LaTeX command mapping.
// depth 1 is \chapter by default (appropriate for book-class documents).
// This can be shifted later via a heading-base metadata field.
const headingCommands = {
	1: 'chapter',
	2: 'section',
	3: 'subsection',
	4: 'subsubsection',
	5: 'paragraph',
	6: 'subparagraph'
};

const latexRenderer = {

	paragraph(token) {
		return `${this.parser.parseInline(token.tokens)}\n\n`;
	},

	heading(token) {
		const content = this.parser.parseInline(token.tokens);
		const command = headingCommands[token.depth] || 'subparagraph';
		return `\\${command}{${content}}\n\n`;
	},

	strong(token) {
		return `\\textbf{${this.parser.parseInline(token.tokens)}}`;
	},

	em(token) {
		return `\\emph{${this.parser.parseInline(token.tokens)}}`;
	},

	codespan(token) {
		return `\\texttt{${token.text}}`;
	},

	code(token) {
		// Use verbatim for now; can switch to lstlisting or minted later.
		return `\\begin{verbatim}\n${token.text}\n\\end{verbatim}\n\n`;
	},

	link(token) {
		const text = this.parser.parseInline(token.tokens);
		return `\\href{${token.href}}{${text}}`;
	},

	image(token) {
		// A simple default; width and placement can be refined later.
		return `\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=\\textwidth]{${token.href}}\n\\caption{${token.text || ''}}\n\\end{figure}\n\n`;
	},

	blockquote(token) {
		const body = this.parser.parse(token.tokens);
		return `\\begin{quote}\n${body}\\end{quote}\n\n`;
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
		// Build a basic tabular environment.
		const ncols = token.header.length;
		const aligns = token.align.map(a => {
			if (a === 'center') return 'c';
			if (a === 'right') return 'r';
			return 'l';
		});
		const colspec = aligns.join(' ');

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
		return token.text;
	}
};

export default latexRenderer;
