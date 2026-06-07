/*
	LaTeX document assembly — the peer of html-template.js.

	processLatexTemplate() wraps the rendered body in a complete, compilable
	document: \documentclass + an assembled preamble + frontmatter (\maketitle
	from Title/Author/Date) + the body + \end{document}. The --fragment path in
	index.js bypasses this and emits the body alone.

	All substitutions in the .tex template use TRIPLE braces ({{{ }}}): Mustache
	HTML-escapes single-brace tags, which would corrupt LaTeX backslashes and
	ampersands. To sidestep brace-nesting entirely, structural lines like
	\documentclass[...]{...} are precomputed here and passed as single variables.
*/

import Mustache from 'mustache';
import fs from 'fs';
import path from 'path';
import { configManager } from './config-manager.js';
import { assemblePreamble } from './preamble.js';
import { escapeLatexText } from './latex-escape.js';

// Metadata values arrive as single-element arrays (from the metadata-header
// parser) or as strings (from config files / DEFAULT_CONFIG). Coerce to a
// trimmed string.
function asString(v) {
	if (v == null) return '';
	if (Array.isArray(v)) return v.join(' ').trim();
	return String(v).trim();
}

function asList(v) {
	if (v == null) return [];
	if (Array.isArray(v)) return v;
	return [v];
}

export function processLatexTemplate(content) {
	const meta = (key) => configManager.getMeta(key);

	const docClass = asString(meta('Document class')) || 'article';
	const classOptions = asString(meta('Class options'));
	const engine = (asString(meta('LaTeX engine')) || 'pdflatex').toLowerCase();
	const userPackages = asList(meta('Packages'));
	const userPreamble = asList(meta('LaTeX preamble'));

	const documentclass = classOptions
		? `\\documentclass[${classOptions}]{${docClass}}`
		: `\\documentclass{${docClass}}`;

	const preamble = assemblePreamble({ engine, userPackages, userPreamble });

	// Frontmatter from Title / Author / Date metadata. No Title → no \maketitle.
	// These are plain-text metadata values (not markdown-parsed), so escape the
	// prose specials &/# before they hit \title{}/\author{}.
	const title = escapeLatexText(asString(meta('Title')));
	const author = escapeLatexText(asString(meta('Author')));
	const date = escapeLatexText(asString(meta('Date')));
	let frontmatter = '';
	if (title) {
		frontmatter += `\\title{${title}}\n`;
		if (author) frontmatter += `\\author{${author}}\n`;
		if (date) frontmatter += `\\date{${date}}\n`;
		frontmatter += '\\maketitle\n\n';
	}

	const view = {
		Documentclass: documentclass,
		Preamble: preamble,
		Frontmatter: frontmatter,
		Content: content
	};

	const templatePath = path.join(
		configManager.get('Jmarkdown app directory'),
		'default-template.tex.mustache'
	);
	const template = fs.readFileSync(templatePath, 'utf8');
	return Mustache.render(template, view);
}
