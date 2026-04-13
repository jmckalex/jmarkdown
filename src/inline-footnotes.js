/*
	Inline footnotes extension for JMarkdown.

	Syntax:  [^label: footnote body text]

	The body text can span multiple lines and even multiple paragraphs,
	provided that continuation lines after a blank line are indented.

	For LaTeX output:   \footnote{rendered body}
	For HTML output:    superscript reference + collected footnotes section

	This module exports:
	  - preprocessFootnotes(src)  — call before marked.parse() to collapse
	    multi-paragraph footnotes into single-paragraph form
	  - inlineFootnote            — the marked inline extension object
	  - getFootnotesHTML()        — returns the HTML footnotes section (call after parse)
	  - resetFootnotes()          — reset state before processing a new file
*/

// Sentinel string used to mark paragraph breaks inside collapsed footnotes.
// Chosen to be unlikely to appear in real content.
const PARA_SENTINEL = '\x00FNPARA\x00';

// ---- State for HTML footnote collection ----
let footnoteCounter = 0;
const footnoteEntries = [];

/**
 * Reset footnote state.  Call before processing each file.
 */
export function resetFootnotes() {
	footnoteCounter = 0;
	footnoteEntries.length = 0;
}

// ---- Preprocessing ----

/**
 * Preprocess the source to collapse multi-paragraph inline footnotes.
 *
 * A multi-paragraph footnote looks like:
 *
 *   Text before [^1: First paragraph of footnote.
 *
 *     Second paragraph, indented to signal continuation.]
 *   Text after.
 *
 * The blank line(s) between footnote paragraphs would normally cause
 * marked's block tokenizer to split the text into separate paragraph
 * tokens before the inline extension sees it.  This function collapses
 * those blank lines into PARA_SENTINEL markers so that the entire
 * footnote remains within a single paragraph block.
 *
 * Single-paragraph footnotes are left unchanged — the inline extension
 * handles them directly.
 */
export function preprocessFootnotes(src) {
	const result = [];
	let i = 0;

	while (i < src.length) {
		// Look for [^ pattern
		const idx = src.indexOf('[^', i);
		if (idx === -1) {
			result.push(src.slice(i));
			break;
		}

		// Check if it's followed by label: (i.e., an inline footnote definition)
		const afterBracket = src.slice(idx);
		const labelMatch = /^\[\^(\w+):\s*/.exec(afterBracket);
		if (!labelMatch) {
			// Not an inline footnote — push up to and including [^ and continue
			result.push(src.slice(i, idx + 2));
			i = idx + 2;
			continue;
		}

		// Found a potential inline footnote.  Bracket-count to find the closing ].
		let depth = 1;
		let j = idx + 1; // position after the opening [
		let hasBlankLines = false;

		while (j < src.length && depth > 0) {
			const ch = src[j];
			if (ch === '\\' && j + 1 < src.length) {
				j += 2; // skip escaped character
				continue;
			}
			if (ch === '[') depth++;
			else if (ch === ']') depth--;

			// Detect blank lines within the footnote body
			if (depth > 0 && ch === '\n') {
				// Check for a blank line: the next line is empty or whitespace-only
				const nextNewline = src.indexOf('\n', j + 1);
				const lineContent = nextNewline === -1
					? src.slice(j + 1)
					: src.slice(j + 1, nextNewline);
				if (/^\s*$/.test(lineContent)) {
					hasBlankLines = true;
				}
			}
			j++;
		}

		if (depth !== 0) {
			// Unmatched bracket — not a valid footnote, skip past [^
			result.push(src.slice(i, idx + 2));
			i = idx + 2;
			continue;
		}

		// j now points to one past the closing ]
		if (!hasBlankLines) {
			// Single-paragraph footnote — pass through unchanged
			result.push(src.slice(i, j));
			i = j;
			continue;
		}

		// Multi-paragraph footnote: collapse blank lines within the footnote body.
		// Replace sequences of (newline, blank line(s), optional indentation) with
		// the paragraph sentinel.
		const before = src.slice(i, idx);
		const footnoteRaw = src.slice(idx, j);
		const collapsed = footnoteRaw.replace(/\n[ \t]*\n[ \t]*/g, PARA_SENTINEL);

		result.push(before + collapsed);
		i = j;
	}

	return result.join('');
}

// ---- Inline extension ----

export const inlineFootnote = {
	name: 'inlineFootnote',
	level: 'inline',

	start(src) {
		// Quick check: is there a [^ anywhere?
		const idx = src.indexOf('[^');
		if (idx === -1) return undefined;
		// Only trigger if it looks like an inline footnote definition (has a colon)
		// This avoids interfering with standard [^label] footnote references.
		const after = src.slice(idx);
		if (/^\[\^\w+:/.test(after)) return idx;
		return undefined;
	},

	tokenizer(src) {
		// Match the opening: [^label:
		const opening = /^\[\^(\w+):\s*/.exec(src);
		if (!opening) return;

		// Bracket-count from after [ to find the matching ]
		let depth = 1;
		let j = 1; // start after the [
		while (j < src.length && depth > 0) {
			const ch = src[j];
			if (ch === '\\' && j + 1 < src.length) {
				j += 2;
				continue;
			}
			if (ch === '[') depth++;
			else if (ch === ']') depth--;
			j++;
		}

		if (depth !== 0) return; // unmatched bracket

		const raw = src.slice(0, j);
		const label = opening[1];
		// Body is everything between the ": " and the closing ]
		const body = src.slice(opening[0].length, j - 1).trim();

		const token = {
			type: 'inlineFootnote',
			raw,
			label,
			tokens: []
		};

		if (body.includes(PARA_SENTINEL)) {
			// Multi-paragraph: tokenize each paragraph separately.
			token.paragraphs = body.split(PARA_SENTINEL).map(part => {
				const partTokens = [];
				this.lexer.inline(part.trim(), partTokens);
				return partTokens;
			});
		} else {
			// Single paragraph: tokenize the body as one inline sequence.
			this.lexer.inline(body, token.tokens);
		}

		return token;
	},

	renderer(token) {
		if (token.paragraphs) {
			// Multi-paragraph footnote
			const rendered = token.paragraphs.map(
				tokens => this.parser.parseInline(tokens)
			);

			if (global.isLatex) {
				return `\\footnote{${rendered.join('\n\n')}}`;
			}

			// HTML: stash with <p> wrappers
			footnoteCounter++;
			const n = footnoteCounter;
			const content = rendered.map(p => `<p>${p}</p>`).join('\n');
			footnoteEntries.push({ n, label: token.label, content });
			return `<sup class="footnote-ref"><a href="#fn-${token.label}" id="fnref-${token.label}">${n}</a></sup>`;
		}

		// Single-paragraph footnote
		const content = this.parser.parseInline(token.tokens);

		if (global.isLatex) {
			return `\\footnote{${content}}`;
		}

		footnoteCounter++;
		const n = footnoteCounter;
		footnoteEntries.push({ n, label: token.label, content: `<p>${content}</p>` });
		return `<sup class="footnote-ref"><a href="#fn-${token.label}" id="fnref-${token.label}">${n}</a></sup>`;
	}
};

// ---- HTML footnotes section ----

/**
 * Generate the HTML for the collected footnotes section.
 * Call after marked.parse() has completed.
 * Returns an empty string if there are no footnotes.
 */
export function getFootnotesHTML() {
	if (footnoteEntries.length === 0) return '';

	let html = '\n<section class="footnotes">\n<ol>\n';
	for (const { n, label, content } of footnoteEntries) {
		html += `<li id="fn-${label}">\n`;
		html += content + '\n';
		html += `<a href="#fnref-${label}" class="footnote-backref">\u21a9</a>\n`;
		html += `</li>\n`;
	}
	html += '</ol>\n</section>\n';
	return html;
}

