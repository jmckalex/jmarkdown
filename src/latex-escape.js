/*
	Shared LaTeX escaping.

	By JMarkdown's design, prose reaching the LaTeX renderer needs only `&` and
	`#` escaped. The other LaTeX specials are JMarkdown source-level syntax —
	`_` (subscript), `^` (superscript), `%` (comment), `$` (math) — so any that
	survive to render time are intentional (inside math, which is passed through
	verbatim and validated by MathJax on the HTML side). Over-escaping them here
	would corrupt that source model and break round-tripping. A character the
	author ESCAPED (`\$`, `\_`) arrives as marked's `escape` token, not as text,
	and gets escapeTexText (escapes.js).

	Verbatim contexts (code) do NOT use this — minted takes its content literally;
	see the codespan/code renderers, which pick a delimiter instead of escaping.

	Text that is NOT markdown — a callout type's label from its definition, code
	that minted cannot take in a heading — uses escapeTexText instead, which
	escapes everything.
*/

// Escape the two characters that appear in ordinary prose and must be escaped
// for LaTeX: `&` (alignment) and `#` (parameter). Everything else is left as-is.
export function escapeLatexText(text) {
	if (text == null) return '';
	return String(text).replace(/&/g, '\\&').replace(/#/g, '\\#');
}

/*
	A `%` no backslash escapes, written `\%`: for what jmarkdown writes into a
	macro's argument — \title, \author, \date, hyperref's pdftitle and
	pdfauthor. There TeX reads a raw `%` as a comment, which swallows the
	argument's closing brace, and the build stops ("Paragraph ended before
	\title was complete", "File ended while scanning use of \kvsetkeys"). A
	`%` reaches these as text: a header's value is not markdown, so jmarkdown's
	inline comment never reads it, and in the body that comment is installed
	only in a document with a header (metadata-header.js) — where it is, it has
	taken the `%` and the rest of the line before anything renders. Either way
	the HTML shows the `%`. An author's `\%` is left as it is; `\\%` (a line
	break, then a percent) gets its `%` escaped.
*/
export function escapeArgumentPercent(text) {
	return String(text ?? '').replace(/(?<!\\)((?:\\\\)*)%/g, '$1\\%');
}

/**
 * Plain text for TeX — every special character escaped. For text that is NOT
 * markdown, where the prose rules above (which leave `_ % $` alone) do not
 * apply. `< > |` too: without T1 encoding they print as ¡ ¿ —.
 */
export function escapeTexText(text) {
	return String(text ?? '').replace(/[\\{}$&#^_%~<>|]/g, (c) => ({
		'\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&',
		'#': '\\#', '^': '\\^{}', '_': '\\_', '%': '\\%', '~': '\\~{}',
		'<': '\\textless{}', '>': '\\textgreater{}', '|': '\\textbar{}',
	})[c]);
}
