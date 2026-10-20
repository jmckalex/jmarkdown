// entities-check.mjs tex <fixture.jmd> <doc.tex> — every entity on the list
// (PROSE_ENTITIES, src/latex-escape.js) is in the fixture, as an item of its own,
// and the .tex writes it as the list does: the fixture cannot fall behind the list.
// entities-check.mjs pdf <fixture.jmd> <doc.txt> — and the PDF's text (pdftotext)
// prints each as an HTML parser reads it (cheerio, as the post-processor does).
import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { PROSE_ENTITIES } from '../../src/latex-escape.js';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// How pdftotext reads what the character prints as, where that is not the
// character: a no-break or thin space as a space or nothing, a soft hyphen as
// nothing, LaTeX's ellipsis as spaced points, a superscript digit (LuaLaTeX in
// T1) as the digit.
const READS = {
	nbsp: '[\\s\\u00a0]?', shy: '', thinsp: '[\\s\\u2009]?', hellip: '(…|\\. \\. \\. ?)',
	sup1: '[¹1]', sup2: '[²2]', sup3: '[³3]',
};

const [, , mode, fixture, output] = process.argv;
const source = readFileSync(fixture, 'utf8');
// OT1 accents a dotless i, and pdftotext gives the accent as a combining mark.
const text = readFileSync(output, 'utf8').replace(/ı(?=[̀-ͯ])/g, 'i').normalize('NFC');
const bad = [];
for (const [name, latex] of Object.entries(PROSE_ENTITIES)) {
	if (!source.includes(`- ${name} [&${name};]`)) { bad.push(`${name} (not in the fixture)`); continue; }
	if (mode === 'tex') {
		if (!text.includes(`\\item ${name} [${latex}]`)) bad.push(name);
		if (text.includes(`\\&${name};`)) bad.push(`${name} (left as \\&${name};)`);
	} else {
		const shown = cheerio.load(`<p>&${name};</p>`)('p').text();
		const reads = Object.hasOwn(READS, name) ? READS[name] : escape(shown);
		if (!new RegExp(`(^|\\s)${escape(name)} \\[${reads}\\]`, 'm').test(text)) bad.push(`${name} (${shown})`);
	}
}
if (bad.length) {
	console.log(bad.join(', '));
	process.exit(1);
}
