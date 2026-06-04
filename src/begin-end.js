/*
	Named-scope block environments for JMarkdown.

	Adds `@begin(name) … @end(name)` as an alternative to the colon-counted
	`:::name … :::` container directives.  Because the closer *names* what it
	closes, blocks nest by name instead of by colon count — so you can wrap a
	block in a new one, or drop a block into the middle of another, without
	renumbering any neighbours.  The existing `:::name … :::` syntax is left
	completely untouched; this is purely additive.

	The `@` opener follows the texinfo `@example … @end example` convention; it is
	otherwise an unused sigil in JMarkdown, so it never collides with prose or the
	`:::` directives.

	Arguments reuse the directive convention, with one bracket type per job:

		@begin(name)[label]{class="foo" id="bar"}
		       ^^^^  ^^^^^  ^^^^^^^^^^^^^^^^^^^^^^
		       name  text   attributes

	Rendering — the whole feature, for *any* name the author invents:

		HTML   → <div class="name" …attrs>…markdown content…</div>
		LaTeX  → \begin{name}[label] …content… \end{name}

	The author supplies the matching CSS (HTML) or `\newenvironment` (LaTeX);
	JMarkdown does not invent meaning for the name.  The only names with bespoke
	output are the four existing directives, so that `@begin(x)` renders
	identically to `:::x`: `abstract`, `feedback`, `TeX` (verbatim, LaTeX-only)
	and `HTML` (markdown, HTML-only).  Those share their render bodies with the
	directives in additional-directives.js, so the two routes can never drift.

	Nesting: differently-named blocks nest for free (the inner block is just part
	of the outer block's markdown content and is re-lexed normally).  Only
	*same-name* nesting needs care, so the tokenizer depth-counts `@begin(name)`
	against `@end(name)` to find the right closer.  An opener with no matching
	closer is left literal (with a warning) rather than swallowing the rest of the
	document or throwing.

	Indentation: a top-level block's opener/closer sit at column 0.  A *nested*
	block may be indented for readability, as long as its own opener and closer
	share the same indentation and its body is indented consistently.  Each block
	strips the common leading whitespace from its body (dedent) before processing,
	so the body — and any nested blocks within it — are handled as if at column 0.
	Relative indentation (e.g. inside a fenced code block) is preserved.
*/

import attributesParser from 'attributes-parser';
import { renderAbstract, renderFeedback, renderTeXEnv, renderHTMLEnv } from './additional-directives.js';

// Names that must mirror an existing directive exactly (parity).  ctx carries
// the already-rendered inner content (`inner`, HTML or LaTeX depending on
// global.isLatex) and the verbatim text (`rawText`).
const SPECIAL = {
	abstract: (ctx) => renderAbstract(ctx.inner),
	feedback: (ctx) => renderFeedback(ctx.inner),
	TeX:      (ctx) => renderTeXEnv(ctx.rawText),
	HTML:     (ctx) => renderHTMLEnv(ctx.inner)
};

// TeX content is passed through verbatim (exactly like :::TeX, so $, _, \ etc.
// survive); every other environment processes its content as markdown.
function contentModeFor(name) {
	return name === 'TeX' ? 'verbatim' : 'markdown';
}

function regexEscape(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Strip the common leading-whitespace prefix shared by all non-blank lines, so a
// nested block's body can be indented for readability and still be processed as
// if it were at column 0.  Works on the actual whitespace prefix (not a count),
// so it's correct for tabs or spaces; relative indentation within the body
// (e.g. inside a code fence) is preserved.  Top-level bodies are unindented, so
// this is a no-op there.
function dedent(text) {
	const lines = text.split('\n');
	let prefix = null;
	for (const line of lines) {
		if (line.trim() === '') continue;                 // ignore blank lines
		const ws = line.match(/^[ \t]*/)[0];
		if (prefix === null) { prefix = ws; continue; }
		let i = 0;
		while (i < prefix.length && i < ws.length && prefix[i] === ws[i]) i++;
		prefix = prefix.slice(0, i);
		if (prefix === '') break;
	}
	if (!prefix) return text;
	return lines.map(l => l.startsWith(prefix) ? l.slice(prefix.length) : l).join('\n');
}

// Build the opening `<div …>` for a generic environment.  The environment name
// becomes a class; if the author also supplied a class we merge into it rather
// than emit two class attributes (the browser would otherwise drop one).
function genericHtmlOpen(name, attrs, text) {
	let attrStr = attrs ? String(attrs).trim() : '';
	const classRe = /class\s*=\s*"([^"]*)"/;
	let out;
	if (classRe.test(attrStr)) {
		attrStr = attrStr.replace(classRe, (_m, c) => `class="${name} ${c}"`);
		out = `<div ${attrStr}`;
	} else {
		out = `<div class="${name}"${attrStr ? ' ' + attrStr : ''}`;
	}
	// The optional [text] is exposed as a data attribute in HTML (no visual
	// opinion); CSS/JS can pick it up. In LaTeX it becomes the env's optional arg.
	if (text) out += ` data-label="${String(text).replace(/"/g, '&quot;')}"`;
	return out + '>';
}

export const beginEnd = {
	name: 'beginEnd',
	level: 'block',

	start(src) {
		const m = src.match(/(?:^|\n)@begin\(/);
		if (!m) return undefined;
		return m.index + (src[m.index] === '\n' ? 1 : 0);
	},

	tokenizer(src) {
		// Opener line: @begin(name) optionally followed by [text] and/or {attrs}.
		const open = /^@begin\(\s*([A-Za-z][\w-]*)\s*\)([^\n]*)(?:\n|$)/.exec(src);
		if (!open) return;
		const name = open[1];
		const argStr = open[2] || '';
		const openLen = open[0].length;

		const text = (argStr.match(/\[([^\]]*)\]/) || [])[1];
		const attrsMatch = argStr.match(/\{([^}]*)\}/);
		let attrs;
		if (attrsMatch) {
			try { attrs = attributesParser(attrsMatch[1]); } catch { attrs = undefined; }
		}

		// Find the matching @end(name), depth-counting same-name @begin(name).
		// A begin line may carry trailing [text]{attrs}; an end line may not.
		const nameEsc = regexEscape(name);
		const scanRe = new RegExp(
			`^@(?:(begin)\\(\\s*${nameEsc}\\s*\\)[^\\n]*|(end)\\(\\s*${nameEsc}\\s*\\)[ \\t]*)$`,
			'gm'
		);
		scanRe.lastIndex = openLen;
		let depth = 0, closeStart = -1, closeEnd = -1, m;
		while ((m = scanRe.exec(src)) !== null) {
			if (m[1]) {                                   // nested @begin(name)
				depth++;
			} else if (depth === 0) {                     // our matching @end(name)
				closeStart = m.index;
				closeEnd = scanRe.lastIndex;
				break;
			} else {                                      // a nested @end(name)
				depth--;
			}
		}
		if (closeStart === -1) {
			// No matching closer. Consume *only* the opener line and emit it
			// literally, so the orphan stands as its own paragraph (rather than
			// merging into the following prose) instead of swallowing the rest of
			// the document.
			console.error(`@begin(${name}) has no matching @end(${name}); leaving it literal.`);
			return { type: 'beginEnd', raw: open[0], literal: open[0].replace(/\n$/, '') };
		}

		// Dedent the body so an indented nested block is processed as if at
		// column 0 (recursively, at each level).
		const inner = dedent(src.slice(openLen, closeStart));
		let consumed = closeEnd;
		if (src[consumed] === '\n') consumed++;
		const mode = contentModeFor(name);

		return {
			type: 'beginEnd',
			raw: src.slice(0, consumed),
			name,
			text,
			attrs,
			mode,
			rawText: inner,
			// Re-lex markdown content so nested blocks / prose render normally;
			// verbatim content is kept raw.
			tokens: mode === 'markdown' ? this.lexer.blockTokens(inner) : []
		};
	},

	renderer(token) {
		// Orphan opener (no matching @end) — emit the line verbatim.
		if (token.literal !== undefined) {
			if (global.isLatex) return token.literal + '\n';
			const esc = token.literal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
			return `<p>${esc}</p>\n`;
		}

		const inner = token.mode === 'markdown'
			? this.parser.parse(token.tokens).trim()
			: token.rawText;

		const special = SPECIAL[token.name];
		if (special) {
			return special({ inner, rawText: token.rawText, name: token.name });
		}

		if (global.isLatex) {
			const opt = token.text ? `[${token.text}]` : '';
			return `\\begin{${token.name}}${opt}\n${inner}\n\\end{${token.name}}\n\n`;
		}
		return `${genericHtmlOpen(token.name, token.attrs, token.text)}\n${inner}\n</div>\n`;
	}
};

export default beginEnd;
