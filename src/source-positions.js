/*
	Source position tracking for JMarkdown inverse search.

	This module provides a marked.js extension that annotates tokens with their
	source line number in the original .jmd file, enabling click-to-edit from
	the rendered HTML output.

	Unlike marked-token-position, this approach:
	  - Tracks top-level tokens via contiguous offset scanning
	  - Attempts to locate child tokens in the source text for precise line numbers
	  - Falls back to inheriting the parent's line for dynamically generated content
	  - Never throws on generated content

	Usage:
	    import { sourcePositions } from './source-positions.js';
	    marked.use(sourcePositions(text, headerLength));
*/

/**
 * Build a function that maps a character offset in `text` to a 0-based line number.
 */
function buildLineMap(text) {
	const lineStarts = [0];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			lineStarts.push(i + 1);
		}
	}
	return function offsetToLine(offset) {
		let lo = 0, hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	};
}

/**
 * Try to find a token's raw text in the source and assign its sourceLine.
 * Returns true if found, false otherwise.
 */
function tryLocateInSource(token, text, offsetToLine, headerLength, searchFrom) {
	if (!token.raw) return false;
	const idx = text.indexOf(token.raw, searchFrom);
	if (idx !== -1) {
		token.sourceLine = offsetToLine(idx) + headerLength + 1;
		return true;
	}
	return false;
}

/**
 * Walk a token tree, attempting to locate each token in the source text.
 * Tokens whose raw text can be found get a precise sourceLine.
 * Tokens that can't be found (dynamically generated) inherit parentLine.
 */
function resolveSourceLines(tokens, parentLine, text, offsetToLine, headerLength, searchFrom) {
	if (!tokens) return;
	for (const token of tokens) {
		if (token.sourceLine === undefined) {
			if (!tryLocateInSource(token, text, offsetToLine, headerLength, searchFrom)) {
				// Can't find it in source — dynamically generated content.
				if (parentLine !== undefined) {
					token.sourceLine = parentLine;
				}
			}
		}
		const line = token.sourceLine;

		// Standard child arrays
		if (token.tokens) {
			resolveSourceLines(token.tokens, line, text, offsetToLine, headerLength, searchFrom);
		}

		// List items
		if (token.type === 'list' && token.items) {
			resolveSourceLines(token.items, line, text, offsetToLine, headerLength, searchFrom);
		}

		// Table cells
		if (token.type === 'table') {
			if (token.header) {
				for (const cell of token.header) {
					if (cell.tokens) resolveSourceLines(cell.tokens, line, text, offsetToLine, headerLength, searchFrom);
				}
			}
			if (token.rows) {
				for (const row of token.rows) {
					for (const cell of row) {
						if (cell.tokens) resolveSourceLines(cell.tokens, line, text, offsetToLine, headerLength, searchFrom);
					}
				}
			}
		}

		// childTokens (used by some extensions like description lists)
		if (token.childTokens) {
			for (const childKey of token.childTokens) {
				if (token[childKey]) {
					resolveSourceLines(token[childKey], line, text, offsetToLine, headerLength, searchFrom);
				}
			}
		}
	}
}

/**
 * Returns a marked extension that annotates every token with a `sourceLine`
 * property indicating the 1-based line number in the original source file.
 *
 * @param {string} text - The processed markdown string passed to marked.parse()
 * @param {number} headerLength - Number of lines in the YAML header (to offset back to the original file)
 */
export function sourcePositions(text, headerLength = 0) {
	const offsetToLine = buildLineMap(text);

	return {
		hooks: {
			processAllTokens(tokens) {
				// Phase 1: Annotate top-level tokens by contiguous offset scanning.
				let offset = 0;
				for (const token of tokens) {
					if (!token.raw) continue;
					const idx = text.indexOf(token.raw, offset);
					if (idx !== -1) {
						token.sourceLine = offsetToLine(idx) + headerLength + 1;
						offset = idx + token.raw.length;
					}
				}

				// Phase 2: Resolve source lines for all children.
				// Children inside container directives will be found in the
				// source and get precise line numbers; dynamically generated
				// children will inherit their parent's line.
				resolveSourceLines(tokens, undefined, text, offsetToLine, headerLength, 0);

				return tokens;
			}
		}
	};
}
