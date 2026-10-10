#!/usr/bin/env node
/*
	scripts/convert-colons.mjs — rewrite documents' colon directives in the @
	forms, with src/colon-to-at.js.

		node scripts/convert-colons.mjs [--write] [--fenced] [--quiet] <file or folder>…

	A dry run by default: it says what it would change, file by file, and writes
	nothing. With --write it rewrites each file that changes, first copying the
	original beside it as `<file>.colon-backup` (never overwriting an existing
	backup). A folder is searched for .md, .jmd and .markdown files, skipping
	node_modules, .git, .clew and .obsidian.

	--fenced   only a `---`-fenced header counts (as `Header style: fenced`)
	--quiet    print only the summary and the changes that need a person

	Exit status: 0 if nothing needs a person, 1 if something does.
*/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { convert } from '../src/colon-to-at.js';

const args = process.argv.slice(2);
const write = args.includes('--write');
const quiet = args.includes('--quiet');
const headerStyle = args.includes('--fenced') ? 'fenced' : undefined;
const targets = args.filter(a => !a.startsWith('--'));
if (!targets.length) {
	console.error(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*([\s\S]*?)\*\//)[1].replace(/^\t/gm, ''));
	process.exit(2);
}

const SKIP = new Set(['node_modules', '.git', '.clew', '.obsidian']);
function files(p) {
	const st = fs.statSync(p);
	if (st.isFile()) return [p];
	const out = [];
	for (const e of fs.readdirSync(p, { withFileTypes: true })) {
		if (e.isDirectory()) { if (!SKIP.has(e.name)) out.push(...files(path.join(p, e.name))); }
		else if (/\.(md|jmd|markdown)$/i.test(e.name)) out.push(path.join(p, e.name));
	}
	return out;
}

const totals = { files: 0, changed: 0, same: 0, 'changes-output': 0, 'needs-you': 0, prose: 0 };
for (const file of targets.flatMap(files)) {
	totals.files++;
	const source = fs.readFileSync(file, 'utf8');
	const { text, changes } = convert(source, { headerStyle });
	if (!changes.length) continue;
	for (const c of changes) totals[c.kind]++;
	if (text !== source) totals.changed++;
	const shown = quiet ? changes.filter(c => c.kind === 'needs-you') : changes;
	if (shown.length) {
		console.log(`\n${file}`);
		for (const c of shown) {
			const what = c.to !== undefined ? `${c.from.split('\n')[0]}  →  ${c.to.split('\n')[0]}` : c.from.split('\n')[0];
			console.log(`  ${String(c.line).padStart(5)}  ${c.kind.padEnd(14)} ${what}${c.why ? `\n${' '.repeat(23)}${c.why}` : ''}`);
		}
	}
	if (write && text !== source) {
		const backup = `${file}.colon-backup`;
		if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
		fs.writeFileSync(file, text);
	}
}
console.log(`\n${totals.files} files read, ${totals.changed} ${write ? 'rewritten' : 'would change'}: ` +
	`${totals.same} respelled, ${totals['changes-output']} change their output, ` +
	`${totals['needs-you']} need you, ${totals.prose} prose colons left as written.`);
process.exit(totals['needs-you'] ? 1 : 0);
