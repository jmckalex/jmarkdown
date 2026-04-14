/*
	Inline footnotes extension for JMarkdown.

	Two syntax forms:

	  [fn: footnote body text]        — anonymous (auto-numbered label)
	  [^label: footnote body text]    — explicitly labelled

	The body can span multiple lines and paragraphs (continuation indicated
	by indentation), and may contain block-level content such as lists and
	definition lists.  Brackets inside math ($...$, $$...$$), code spans,
	and escaped characters are not counted.

	For LaTeX output:   \footnote{rendered body}
	For HTML output:    superscript reference + collected footnotes section

	Exports:
	  - preprocessFootnotes(src)  — call before marked.parse()
	  - inlineFootnote            — the marked inline extension object
	  - getFootnotesHTML()        — returns the HTML footnotes section
	  - resetFootnotes()          — reset state before processing a new file
*/

// ========================================================================
//  Context-aware bracket scanner
// ========================================================================

/**
 * Find the closing ] that matches an opening [ at position (start - 1).
 * Brackets inside math, code spans, and escaped characters are ignored.
 *
 * @param {string} src   — the full source text
 * @param {number} start — index immediately after the opening [
 * @returns {number} index one past the closing ], or -1 if unmatched
 */
function findClosingBracket(src, start) {
	let depth = 1;
	let i = start;

	while (i < src.length && depth > 0) {
		const ch = src[i];

		// Escaped character — skip the next character unconditionally
		if (ch === '\\' && i + 1 < src.length) {
			i += 2;
			continue;
		}

		// Display math $$...$$
		if (ch === '$' && i + 1 < src.length && src[i + 1] === '$') {
			i += 2;
			while (i < src.length - 1) {
				if (src[i] === '\\') { i += 2; continue; }
				if (src[i] === '$' && src[i + 1] === '$') { i += 2; break; }
				i++;
			}
			continue;
		}

		// Inline math $...$
		if (ch === '$') {
			i++;
			while (i < src.length) {
				if (src[i] === '\\') { i += 2; continue; }
				if (src[i] === '$') { i++; break; }
				i++;
			}
			continue;
		}

		// Code span — count opening backticks, then find matching close
		if (ch === '`') {
			let count = 0;
			let pos = i;
			while (pos < src.length && src[pos] === '`') { count++; pos++; }
			const closer = '`'.repeat(count);
			const closeIdx = src.indexOf(closer, pos);
			i = closeIdx !== -1 ? closeIdx + count : pos;
			continue;
		}

		// Normal bracket counting
		if (ch === '[') depth++;
		else if (ch === ']') depth--;

		i++;
	}

	return depth === 0 ? i : -1;
}

// ========================================================================
//  State
// ========================================================================

let footnoteCounter = 0;
let autoLabelCounter = 0;                // for anonymous [fn: ...] footnotes
const footnoteEntries = [];            // collected HTML footnotes
const footnoteStore = new Map();       // label → { body, indent }

// Marker used to replace extracted multi-paragraph footnotes.
// Uses Unicode noncharacters that will never appear in real content.
const FN_MARKER_PREFIX = '\uFDD0FN:';
const FN_MARKER_SUFFIX = '\uFDD1';

function makeFnMarker(label) {
	return FN_MARKER_PREFIX + label + FN_MARKER_SUFFIX;
}

const FN_MARKER_REGEX = new RegExp('^' + escapeForRegExp(FN_MARKER_PREFIX) + '(\\w+)' + escapeForRegExp(FN_MARKER_SUFFIX));

function escapeForRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reset all footnote state.  Call before processing each file.
 */
export function resetFootnotes() {
	footnoteCounter = 0;
	autoLabelCounter = 0;
	footnoteEntries.length = 0;
	footnoteStore.clear();
}

// ========================================================================
//  Preprocessing
// ========================================================================

/**
 * Preprocess the source to extract multi-paragraph inline footnotes.
 *
 * Multi-paragraph footnotes (those whose body contains blank lines)
 * are extracted, dedented, and stored in footnoteStore.  The original
 * construct is replaced with a short marker so that the surrounding
 * paragraph remains intact for marked's block tokenizer.
 *
 * Single-paragraph footnotes are left in place — the inline extension
 * handles them directly.
 *
 * Recognises two forms:
 *   [fn: body]          — anonymous footnote (auto-generated label)
 *   [^label: body]      — explicitly labelled footnote
 */
export function preprocessFootnotes(src) {
	const result = [];
	let i = 0;

	while (i < src.length) {
		// Find the earliest of the two trigger sequences
		const idxCaret = src.indexOf('[^', i);
		const idxFn    = src.indexOf('[fn:', i);

		// Pick the earlier match; if neither, flush and break
		let idx;
		if (idxCaret === -1 && idxFn === -1) {
			result.push(src.slice(i));
			break;
		} else if (idxCaret === -1) {
			idx = idxFn;
		} else if (idxFn === -1) {
			idx = idxCaret;
		} else {
			idx = Math.min(idxCaret, idxFn);
		}

		const afterBracket = src.slice(idx);

		// Try both patterns: [fn: ...] (anonymous) and [^label: ...] (labelled)
		const anonMatch    = /^\[fn:\s*/.exec(afterBracket);
		const labelMatch   = /^\[\^(\w+):\s*/.exec(afterBracket);

		const match = anonMatch || labelMatch;
		if (!match) {
			// Not a footnote — skip past the trigger characters
			const skip = (idx === idxFn) ? 4 : 2;
			result.push(src.slice(i, idx + skip));
			i = idx + skip;
			continue;
		}

		const label = labelMatch ? labelMatch[1] : '_auto' + (++autoLabelCounter);

		// Use context-aware scanner to find the closing ]
		const closingPos = findClosingBracket(src, idx + 1);
		if (closingPos === -1) {
			// Unmatched bracket — skip past trigger
			const skip = match[0].length;
			result.push(src.slice(i, idx + skip));
			i = idx + skip;
			continue;
		}

		// Check for blank lines within the footnote
		const footnoteSlice = src.slice(idx, closingPos);
		const hasBlankLines = /\n[ \t]*\n/.test(footnoteSlice);

		if (!hasBlankLines) {
			// Single-paragraph footnote — leave for the inline extension
			result.push(src.slice(i, closingPos));
			i = closingPos;
			continue;
		}

		// ---- Multi-paragraph footnote: extract, dedent, store ----

		// Body is everything between the opening pattern and the final "]"
		const bodyRaw = src.slice(idx + match[0].length, closingPos - 1);

		// Detect indent from the first continuation line in the raw source
		let indent = '';
		const firstNewline = footnoteSlice.indexOf('\n');
		if (firstNewline !== -1) {
			const indentMatch = /^([ \t]+)/.exec(footnoteSlice.slice(firstNewline + 1));
			if (indentMatch) indent = indentMatch[1];
		}

		// Dedent: strip one level of indent from each line so that
		// the body is valid top-level markdown.  Lines indented deeper
		// than the base level keep their extra indentation (important
		// for nested constructs like definition list continuations).
		const indentLen = indent.length;
		const dedented = bodyRaw.split('\n').map(line => {
			// Only strip if the line begins with the detected indent
			// (or is a blank/whitespace-only line)
			if (line.length >= indentLen && line.slice(0, indentLen).trim() === '') {
				return line.slice(indentLen);
			}
			return line.trimStart();
		}).join('\n').trim();

		footnoteStore.set(label, { body: dedented, indent });

		// Replace the whole [...] with a marker
		result.push(src.slice(i, idx) + makeFnMarker(label));
		i = closingPos;
	}

	return result.join('');
}

// ========================================================================
//  Inline extension
// ========================================================================

export const inlineFootnote = {
	name: 'inlineFootnote',
	level: 'inline',

	start(src) {
		// Check for preprocessed marker
		const markerIdx = src.indexOf(FN_MARKER_PREFIX);

		// Check for anonymous inline footnote [fn:
		let fnIdx = -1;
		const fnBracketIdx = src.indexOf('[fn:');
		if (fnBracketIdx !== -1) {
			fnIdx = fnBracketIdx;
		}

		// Check for labelled inline footnote [^label:
		let labelIdx = -1;
		const caretIdx = src.indexOf('[^');
		if (caretIdx !== -1 && /^\[\^\w+:/.test(src.slice(caretIdx))) {
			labelIdx = caretIdx;
		}

		// Return the earliest match, or undefined if none found
		const candidates = [markerIdx, fnIdx, labelIdx].filter(x => x !== -1);
		return candidates.length > 0 ? Math.min(...candidates) : undefined;
	},

	tokenizer(src) {
		// ---- Case 1: preprocessed marker for a multi-paragraph footnote ----
		const markerMatch = FN_MARKER_REGEX.exec(src);
		if (markerMatch) {
			const label = markerMatch[1];
			const stored = footnoteStore.get(label);
			if (!stored) return;

			const token = {
				type: 'inlineFootnote',
				raw: markerMatch[0],
				label,
				indent: stored.indent,
				isBlock: true,
				tokens: []
			};
			this.lexer.blockTokens(stored.body, token.tokens);
			return token;
		}

		// ---- Case 2: inline single-paragraph footnote ----
		// Matches [fn: body] (anonymous) or [^label: body] (labelled)
		const anonOpening  = /^\[fn:\s*/.exec(src);
		const labelOpening = /^\[\^(\w+):\s*/.exec(src);
		const opening = anonOpening || labelOpening;
		if (!opening) return;

		const closingPos = findClosingBracket(src, 1);
		if (closingPos === -1) return;

		const raw = src.slice(0, closingPos);
		const label = labelOpening ? labelOpening[1] : '_auto' + (++autoLabelCounter);
		const body = src.slice(opening[0].length, closingPos - 1).trim();

		// Detect indent from first continuation line
		let indent = '';
		const firstNewline = raw.indexOf('\n');
		if (firstNewline !== -1) {
			const indentMatch = /^([ \t]+)/.exec(raw.slice(firstNewline + 1));
			if (indentMatch) indent = indentMatch[1];
		}

		const token = {
			type: 'inlineFootnote',
			raw,
			label,
			indent,
			isBlock: false,
			tokens: []
		};
		this.lexer.inline(body, token.tokens);
		return token;
	},

	renderer(token) {
		if (token.isBlock) {
			// Multi-paragraph / block-content footnote
			let content = this.parser.parse(token.tokens).trim();

			if (global.isLatex) {
				// Re-indent for AUCTeX-style formatting
				if (token.indent) {
					content = content.replace(/\n/g, '\n' + token.indent);
				}
				return `\\footnote{${content}}`;
			}

			// HTML: stash the already-rendered block content
			footnoteCounter++;
			const n = footnoteCounter;
			footnoteEntries.push({ n, label: token.label, content });
			return `<sup class="footnote-ref"><a href="#fn-${token.label}" id="fnref-${token.label}">${n}</a></sup>`;
		}

		// Single-paragraph (inline) footnote
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

// ========================================================================
//  HTML footnotes section
// ========================================================================

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
