/*
	Book mode — phase 1 of docs/dev/book-mode-engine.md (option A): an ordered
	list of chapter files built as ONE document, so numbering, cross-
	references, the contents, the References and the Index run across the
	whole book in both outputs, with what a book needs on top.

	A build is a book when its chapters are named:
	  - by a host, through processFile's `chapters` option (Clew reads its
	    master note's `chapters:` list and passes the paths); or
	  - in the master's body, one `@chapter+(path)` line per chapter, in order.
	    Text between them (matter markers, an epigraph) stays where it is, in
	    the book's flow but in no chapter.
	Neither: not a book, and nothing here runs — a single document renders as
	it always has.

	The master's header is the book's configuration. Each chapter is read,
	and:
	  - its front matter is stripped (it used to be rendered as content). Its
	    whitelisted keys (§7 of the note: Bibliography, Packages, LaTeX
	    preamble, Lang, Math macros) are kept for that chapter; any other
	    ENGINE key is warned, naming the chapter. Keys that are the chapter's
	    own data (title, status, aliases, tags, and anything the engine does
	    not know) are left alone;
	  - its title follows the rule: the first `#` heading; failing that its
	    front-matter `title`; failing that its file name — inserted as the
	    chapter's `#` heading. Text before the first `#` heading, and a second
	    `#` heading (each starts a chapter), are warned;
	  - its own [[file]] inclusions resolve against ITS folder.

	The chapters are then joined into one stream between marker lines, and
	the parse is a single marked.parse, with three hooks that only act on a
	stream carrying markers:
	  - provideLexer lexes each chapter ON ITS OWN (BookLexer). marked-
	    footnote keys its notes by label per lexer, so a `[^1]` in two chapters
	    no longer collides (the second chapter used to get the first's note),
	    and each chapter's notes form their own list at its end. Its state —
	    a flag, a running counter, one reused token — is reset between
	    chapters (resetFootnoteState);
	  - a walkTokens hook carries the chapter context: warnings get their
	    place, and an image or link path relative to the chapter is rebased
	    onto the master's folder (G10 — it used to keep pointing at the
	    master's folder); a link to another chapter's file becomes a link to
	    that chapter;
	  - provideParser renders one top-level block at a time, so a warning
	    raised while rendering knows its chapter and line.
	Each chapter renders inside `<section class="jmd-chapter" id="jmd-chapter-N"
	data-chapter data-file>` in HTML (the post-processor and the split read
	it); in LaTeX its `#` heading is the \chapter.

	Warnings in a book name `chapter-file:line` (warnings.js). The line is the
	chapter file's: the line map adds back the stripped front matter and
	takes away an inserted title.
*/

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { configManager, DEFAULT_CONFIG } from './config-manager.js';
import { addWarning, setWarningLocation, getWarningLocation } from './warnings.js';
import processFileInclusions from './file-inclusion.js';
import { requirePackage } from './preamble.js';

/* --- the current build's book ----------------------------------------------------- */

let book = null;

/** The current build's book plan, or null when the build is not a book. */
export function getBook() { return book; }

export function resetBook() { book = null; }

const START = (n) => `<!-- jmd:chapter ${n} -->`;
const END = '<!-- jmd:end-chapter -->';
const MARKERS = /^<!-- jmd:(chapter \d+|end-chapter) -->$/m;
const MARKERS_SPLIT = /^<!-- jmd:(chapter \d+|end-chapter) -->$/gm;

/* --- a chapter's header ------------------------------------------------------------- */

const norm = (key) => String(key).trim().toLowerCase().replace(/[\s_-]+/g, ' ');

// What a chapter may set for itself (the owner's whitelist, §7).
const WHITELIST = new Map([
	['bibliography', 'bibliography'],
	['packages', 'packages'],
	['latex preamble', 'preamble'],
	['lang', 'lang'],
	['language', 'lang'],
	['math macros', 'mathMacros'],
]);
// The chapter's own data — never a setting, never warned.
const CHAPTER_DATA = new Set(['title', 'status', 'aliases', 'tags', 'cssclasses', 'cssclass']);
// Keys the engine reads from a header beyond its config defaults.
const HEADER_KEYS = [
	'Author', 'Date', 'Bibliography style', 'Bibliography mode', 'Resolve citations',
	'Citation tooltips', 'Minimal bibliography', 'LaTeX bib style', 'Biblify activate',
	'Biblify defer', 'Headings', 'Numbering', 'Load extensions', 'Load directives',
	'Load javascript', 'Load environments', 'Optionals', 'Inline comment', 'Custom element',
	'Smart typography', 'Pandoc citations', 'Block elements', 'Silence warnings',
	'Document class', 'Class options', 'Heading base', 'Chapters', 'Book',
];
const ENGINE_KEYS = new Set([...Object.keys(DEFAULT_CONFIG), ...HEADER_KEYS].map(norm));
const isEngineKey = (key) => ENGINE_KEYS.has(norm(key)) || /^extension\b/i.test(String(key).trim());

/**
 * A chapter's leading header — a `---`-fenced block, or JMarkdown's bare
 * `Key: value` lines up to a `---` rule — as { data, body, lines }: `data`
 * maps each key (as written) to its value lines joined, `lines` is how many
 * lines it took. The same detection as the master's (processYAMLheader),
 * without merging anything into the configuration.
 */
export function splitChapterHeader(text) {
	const opener = text.match(/^---[ \t]*\r?\n/);
	const rest = opener ? text.slice(opener[0].length) : text;
	const fencedOnly = configManager.get('Header style') === 'fenced';
	if (!/^[-a-zA-Z0-9 ]+:/.test(rest) || (fencedOnly && !opener)) return { data: {}, body: text, lines: 0 };
	const term = rest.match(/\n^---.*$/m);
	const head = term ? rest.slice(0, term.index) : rest;
	const body = term ? rest.slice(term.index + term[0].length).replace(/^\r?\n/, '') : '';
	const data = {};
	let key = null;
	for (const line of head.split('\n')) {
		const m = line.match(/^([-a-zA-Z0-9 ]+):\s*(.*)$/);
		if (m) {
			key = m[1].trim();
			data[key] = m[2].trim() ? [m[2]] : [];
		} else if (key && line.trim()) {
			data[key].push(line);
		}
	}
	for (const k of Object.keys(data)) data[k] = data[k].join('\n');
	// The opening fence, the header's own lines, and the closing rule: the
	// body's first line is the file's next one.
	const lines = (opener ? 1 : 0) + head.split('\n').length + (term ? 1 : 0);
	return { data, body, lines };
}

const unquote = (v) => String(v).trim().replace(/^(["'])(.*)\1$/, '$2');

// The whitelisted keys a chapter sets, by setting name; every other engine key
// warned, naming the chapter.
function chapterSettings(data, name) {
	const settings = {};
	for (const [key, value] of Object.entries(data)) {
		const n = norm(key);
		if (WHITELIST.has(n)) settings[WHITELIST.get(n)] = value;
		else if (!CHAPTER_DATA.has(n) && isEngineKey(key)) {
			addWarning(`book: this chapter sets \`${key}\` — a book takes that from its master, so it is not applied`);
		}
	}
	return settings;
}

/* --- a chapter's title ----------------------------------------------------------------- */

// Level-1 ATX headings outside fenced code and display maths, and the index
// of the first line of real content.
function scanHeadings(lines) {
	const h1 = [];
	let firstContent = -1;
	let fence = null;
	let math = false;
	lines.forEach((line, i) => {
		const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
		if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return; }
		if (f) { fence = f[1]; if (firstContent < 0) firstContent = i; return; }
		if (math) { if (/\$\$/.test(line)) math = false; return; }
		if (/^\s*\$\$/.test(line) && !/\$\$.*\$\$/.test(line)) { math = true; if (firstContent < 0) firstContent = i; return; }
		if (/^ {0,3}#(?!#)\s+\S/.test(line)) h1.push(i);
		if (firstContent < 0 && line.trim() && !/^\s*<!--.*-->\s*$/.test(line)) firstContent = i;
	});
	return { h1, firstContent };
}

/* --- assembly --------------------------------------------------------------------------- */

const CHAPTER_LINE = /^[ \t]*@chapter\+\(([^)\n]+)\)[ \t]*$/;

// The `@chapter+(path)` lines of a master's body (outside fenced code), with
// the text around them: [{ text }, { chapter: path }, { text }, …].
function chapterLines(body) {
	const pieces = [];
	let text = [];
	let fence = null;
	for (const line of body.split('\n')) {
		const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
		if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; text.push(line); continue; }
		if (f) { fence = f[1]; text.push(line); continue; }
		const m = line.match(CHAPTER_LINE);
		if (m) {
			pieces.push({ text: text.join('\n') });
			text = [];
			pieces.push({ chapter: m[1].trim() });
		} else {
			text.push(line);
		}
	}
	pieces.push({ text: text.join('\n') });
	return pieces;
}

/**
 * Make the master's body (its header already read) a book, if it is one:
 * returns the assembled stream, or null for an ordinary document. `chapters`
 * is processFile's option (a host's list); otherwise the body's
 * `@chapter+(path)` lines name them.
 */
export function prepareBook(body, { chapters: hostChapters = null, masterDir, isLatex = false } = {}) {
	book = null;
	const fromHost = Array.isArray(hostChapters) && hostChapters.length > 0;
	let pieces = chapterLines(body);
	const named = pieces.filter((p) => p.chapter);
	if (fromHost) {
		if (named.length) addWarning('book: the master\'s `@chapter+` lines are ignored — the chapters were given by the host');
		pieces = [{ text: pieces.filter((p) => p.text != null).map((p) => p.text).join('\n') },
			...hostChapters.map((c) => ({ chapter: String(c) }))];
	} else if (named.length === 0) {
		return null;
	}

	book = { masterDir, chapters: [], isLatex };
	const out = [];
	for (const piece of pieces) {
		if (piece.text != null) { out.push(piece.text); continue; }
		const chapter = readChapter(piece.chapter, book.chapters.length + 1, masterDir);
		if (!chapter) continue;
		book.chapters.push(chapter);
		out.push(`\n\n${START(chapter.index)}\n${chapter.text}\n\n${END}\n\n`);
	}
	return out.join('\n');
}

function readChapter(name, index, masterDir) {
	const abs = path.resolve(masterDir, name);
	let source;
	try { source = fs.readFileSync(abs, 'utf8'); } catch {
		addWarning(`book: chapter "${name}" cannot be read — it is left out`);
		return null;
	}
	const dir = path.dirname(abs);
	setWarningLocation({ file: name });
	const { data, body, lines: headerLines } = splitChapterHeader(source);
	const settings = chapterSettings(data, name);

	// The title rule.
	const bodyLines = body.split('\n');
	const { h1, firstContent } = scanHeadings(bodyLines);
	let text = body;
	let inserted = 0;
	let title;
	if (h1.length === 0) {
		const fromHeader = Object.entries(data).find(([k]) => norm(k) === 'title');
		title = fromHeader && unquote(fromHeader[1]) ? unquote(fromHeader[1]) : path.basename(name, path.extname(name));
		text = `# ${title}\n\n${body}`;
		inserted = 2;
	} else {
		title = bodyLines[h1[0]].replace(/^ {0,3}#\s+/, '').replace(/\s+#*\s*$/, '');
		if (firstContent >= 0 && firstContent < h1[0]) {
			setWarningLocation({ file: name, line: firstContent + 1 + headerLines });
			addWarning('book: text before this chapter\'s first # heading — in print it falls at the end of the previous chapter');
		}
		if (h1.length > 1) {
			setWarningLocation({ file: name, line: h1[1] + 1 + headerLines });
			addWarning(`book: ${h1.length} level-1 headings in this chapter; each starts a chapter`);
		}
	}
	setWarningLocation(null);

	// A chapter's own [[file]] inclusions are its own: against its folder.
	if (configManager.get('File inclusion') !== false) text = processFileInclusions(text, dir);

	return {
		index, name, abs, dir, title, settings, text,
		// Segment line k (1-based) is file line k + offset.
		offset: headerLines - inserted,
	};
}

/* --- per-chapter lexing ------------------------------------------------------------------- */

// marked-footnote's state is per extension instance — a flag that it has put
// its footnotes token in, a running reference counter, and one footnotes
// token it reuses. Between chapters: reset the flag (its walkTokens does),
// and the counter (its footnoteRef renderer does), so the next chapter starts
// clean and numbers its notes from 1.
function resetFootnoteState() {
	const walk = marked.defaults.walkTokens;
	if (walk) walk.call(marked, { type: 'space', raw: '' });
	const ref = marked.defaults.extensions?.renderers?.footnoteRef;
	if (ref) ref.call({ parser: null }, { id: '', label: '' });
}

// A chapter's (or master piece's) own footnotes token goes to its own end —
// a COPY, since marked-footnote reuses one token object and the next
// chapter's lexing empties it.
function settleFootnotes(tokens) {
	const first = tokens[0];
	if (!first || first.type !== 'footnotes') return;
	tokens[0] = { type: 'space', raw: '' };
	if (first.items && first.items.length) {
		// Generated, so it has no line of its own (lex() gave index 0's).
		const { _jmdLoc, ...copy } = first;
		tokens.push({ ...copy, rawItems: first.rawItems.slice(), items: first.items.slice() });
	}
}

// Every token array inside a top-level token, mapped to its line.
function mapArrays(value, line, map) {
	if (Array.isArray(value)) {
		map.set(value, line);
		for (const v of value) mapArrays(v, line, map);
	} else if (value && typeof value === 'object') {
		for (const [k, v] of Object.entries(value)) {
			if (k !== 'raw' && k !== 'text' && (Array.isArray(v) || (v && typeof v === 'object'))) mapArrays(v, line, map);
		}
	}
}

class BookLexer extends marked.Lexer {
	constructor(options, chapter) {
		super(options);
		this.chapter = chapter;
	}

	// marked's own lex(), with the chapter's place set for each step: its
	// blocks (chapter only — a block tokenizer is not told where it is), then
	// each block's inline content at that block's line.
	lex(src) {
		src = src.replace(/\r\n|\r/g, '\n');
		const where = this.chapter ? { file: this.chapter.name } : null;
		setWarningLocation(where);
		this.blockTokens(src, this.tokens);
		const lineOf = new Map();
		if (this.chapter) {
			let line = 1;
			for (const token of this.tokens) {
				const at = line + this.chapter.offset;
				token._jmdLoc = { file: this.chapter.name, line: at };
				mapArrays(token, at, lineOf);
				line += (String(token.raw || '').match(/\n/g) || []).length;
			}
		}
		for (const item of this.inlineQueue) {
			if (this.chapter) setWarningLocation({ file: this.chapter.name, line: lineOf.get(item.tokens) });
			this.inlineTokens(item.src, item.tokens);
		}
		this.inlineQueue = [];
		setWarningLocation(null);
		return this.tokens;
	}
}

function lexBook(src, options) {
	const parts = src.split(MARKERS_SPLIT);
	const tokens = [];
	let chapter = null;
	parts.forEach((part, i) => {
		if (i % 2 === 1) {
			if (part.startsWith('chapter')) {
				chapter = book.chapters.find((c) => c.index === Number(part.slice(8))) || null;
				tokens.push({ type: 'jmdChapter', edge: 'start', chapter, raw: '' });
			} else {
				tokens.push({ type: 'jmdChapter', edge: 'end', chapter, raw: '' });
				chapter = null;
			}
			return;
		}
		if (!part.trim()) return;
		// The marker line's own newline is not the chapter's: drop it, so the
		// chapter's first line is line 1.
		if (chapter) part = part.replace(/^\n/, '');
		resetFootnoteState();
		const lexed = new BookLexer(options, chapter).lex(part);
		settleFootnotes(lexed);
		for (const t of lexed) tokens.push(t);
	});
	resetFootnoteState();
	tokens.links = {};
	return tokens;
}

/* --- rendering --------------------------------------------------------------------------- */

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// One top-level block at a time, with its place set; in HTML each block's
// first tag carries its chapter line (data-source-line), which the post-pass
// reads to place its own warnings, and a host can use to jump to the source.
function parseBook(tokens, options) {
	let out = '';
	for (const token of tokens) {
		if (token._jmdLoc) setWarningLocation(token._jmdLoc);
		else if (token.type === 'jmdChapter') setWarningLocation(token.edge === 'start' && token.chapter ? { file: token.chapter.name } : null);
		let html = marked.Parser.parse([token], options);
		if (token._jmdLoc && !book.isLatex && !/^\s*<[a-zA-Z][^>]*\bdata-source-line=/.test(html)) {
			html = html.replace(/^(\s*<[a-zA-Z][a-zA-Z0-9-]*)/, `$1 data-source-line="${token._jmdLoc.line}"`);
		}
		out += html;
	}
	setWarningLocation(null);
	return out;
}

// A link to another chapter. In HTML an ordinary link to the chapter's anchor;
// in LaTeX \hyperref to its label — an \href to `#…` goes nowhere in a PDF.
const chapterLink = {
	name: 'jmdChapterLink',
	renderer(token) {
		const inner = this.parser.parseInline(token.tokens || []);
		if (global.isLatex) return `\\hyperref[jmd-chapter-${token.chapterIndex}]{${inner}}`;
		return `<a href="${escapeAttr(token.href)}">${inner}</a>`;
	},
};

const chapterToken = {
	name: 'jmdChapter',
	renderer(token) {
		const c = token.chapter;
		if (!c) return '';
		if (global.isLatex) {
			// An anchor at the chapter's start, for links to it (jmdChapterLink).
			if (token.edge === 'end') return '';
			requirePackage('hyperref');
			return `\\phantomsection\\label{jmd-chapter-${c.index}}\n`;
		}
		if (token.edge === 'end') return '</section>\n';
		return `<section class="jmd-chapter" id="jmd-chapter-${c.index}" data-chapter="${c.index}" data-file="${escapeAttr(c.name)}">\n`;
	},
};

/* --- the walk: chapter context and paths ---------------------------------------------------- */

let walkChapter = null;
const SCHEME = /^[a-z][a-z0-9+.-]*:|^\/|^#|^\?/i;

// A path the chapter wrote relative to its own folder, made relative to the
// master's; a path to another chapter's file becomes that chapter's anchor.
function rebase(href, chapter) {
	if (!href || SCHEME.test(href)) return href;
	const m = /^([^#?]*)(.*)$/.exec(href);
	const target = path.resolve(chapter.dir, m[1]);
	const other = book.chapters.find((c) => c.abs === target);
	if (other) return { href: m[2] && m[2].startsWith('#') ? m[2] : `#jmd-chapter-${other.index}`, chapter: other };
	const rel = path.relative(book.masterDir, target).split(path.sep).join('/');
	return (rel || '.') + m[2];
}

function bookWalk(token) {
	if (!book) return;
	if (token.type === 'jmdChapter') {
		walkChapter = token.edge === 'start' ? token.chapter : null;
		setWarningLocation(walkChapter ? { file: walkChapter.name } : null);
		return;
	}
	if (token._jmdLoc) setWarningLocation(token._jmdLoc);
	if (!walkChapter) return;
	if ((token.type === 'link' || token.type === 'image') && token.href) {
		const to = rebase(token.href, walkChapter);
		if (typeof to === 'string') token.href = to;
		else if (token.type === 'link') {
			token.type = 'jmdChapterLink';
			token.href = to.href;
			token.chapterIndex = to.chapter.index;
		}
	}
	if ((token.type === 'atInline' || token.type === 'atBlock') && (token.name === 'image' || token.name === 'video') && token.arg) {
		const to = rebase(token.arg.trim(), walkChapter);
		if (typeof to === 'string') token.arg = to;
	}
}

/** The chapter a walkTokens hook is in, as it runs (smart typography's quotes). */
export function currentWalkChapter() { return walkChapter; }

/**
 * Registered by index.js AFTER the walkTokens hooks whose warnings it places
 * (marked runs the last-registered hook first, so the place is set before
 * theirs run). Every hook declines when the build is not a book.
 */
export const bookExtension = {
	extensions: [chapterToken, chapterLink],
	walkTokens: bookWalk,
	hooks: {
		provideLexer() {
			if (!book || !this.block) return false;
			return (src, options) => (MARKERS.test(src) ? lexBook(src, options) : marked.Lexer.lex(src, options));
		},
		provideParser() {
			if (!book || !this.block) return false;
			return (tokens, options) => (tokens.some((t) => t.type === 'jmdChapter')
				? parseBook(tokens, options)
				: marked.Parser.parse(tokens, options));
		},
	},
};

/** For a test or a host: where the current warning location is. */
export { getWarningLocation };
