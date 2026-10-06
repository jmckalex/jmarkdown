/*
	The files the engine makes for a document — mermaid's PDFs, MetaPost's and
	TiKZ's SVGs and PDFs, Mathematica's output — are kept in a cache folder per
	kind, `MetaPost/`, `TiKZ/`, … beside the note (a book's: beside the master),
	and an output refers to them by a relative path. This module says what that
	path is, from wherever the output is read.

	  - LaTeX (texCachePath): relative to the .tex's folder, counted from REAL
	    paths at both ends. TeX climbs `..` physically, from where the .tex
	    really is, so a lexical count missed whenever a symlink stood on either
	    side (an output under os.tmpdir(): /var/folders/… is /private/var/…). On
	    stdout there is no folder: the absolute path, with a warning.
	  - HTML (htmlCachePath): relative to the output's folder AS GIVEN. A
	    browser resolves `..` on the page's URL, lexically, so here the lexical
	    count is the right one. A split book's are the master's, since
	    book-pages.js rebases every relative URL onto each page's folder from
	    the master's; on stdout, the note's, as they always were.

	With the output beside the note both give `<kind>/<file>`, as before. Written
	elsewhere, an HTML page used to point at `<kind>/<file>` beside ITSELF, where
	nothing was: its images were broken.
*/

import fs from 'fs';
import path from 'path';
import { configManager } from './config-manager.js';
import { addWarning } from './warnings.js';
import { getBook, bookLayout } from './book.js';

// The note's folder (a book's: the master's).
function noteDir() {
	return configManager.get('Markdown file directory') || process.cwd();
}

// A path's real location. One that does not exist (yet) keeps its missing tail
// on the real path of the part that does.
function realPath(p) {
	try { return fs.realpathSync(p); } catch { /* not there yet */ }
	const parent = path.dirname(p);
	return parent === p ? p : path.join(realPath(parent), path.basename(p));
}

const slashes = (p) => p.split(path.sep).join('/');

/** `target` as found from the folder of the .tex at `out`, counted from real paths. */
export function texRelative(out, target) {
	return slashes(path.relative(realPath(path.dirname(out)), realPath(target))) || '.';
}

/**
 * A cached file, by its absolute path, as the .tex prints it: relative to the
 * output's folder. On stdout the absolute path stays, with a warning.
 */
export function texCachePath(abs) {
	const out = configManager.get('Output file');
	if (!out) {
		addWarning('the LaTeX goes to stdout, so its cached diagrams are included by absolute path (which names your folders) — give an output file to make them relative');
		return abs;
	}
	return texRelative(out, abs);
}

// A relative path as a URL in an attribute: encoded as a URL (a space, a
// non-ASCII letter), with `#`, `?`, `'` and `&` escaped too, which would end
// the path or the attribute.
function urlPath(p) {
	return encodeURI(p).replace(/[#?'&]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** A cached file, by its absolute path, as an HTML page refers to it (see above). */
export function htmlCachePath(abs) {
	const out = configManager.get('Output file');
	const split = getBook() && bookLayout() === 'split';
	const from = out && !split ? path.dirname(out) : noteDir();
	return urlPath(slashes(path.relative(from, abs)));
}

/**
 * Compile a figure in a folder of its own. `work(run)` runs with `run`, a
 * fresh folder inside the cache folder `dir`, as its working folder, and
 * returns the names of the files it made there that the cache keeps (or
 * nothing). Those that exist are renamed into `dir` — one atomic step, on the one
 * filesystem — and then the run folder goes, with everything else in it:
 * whatever the document's own code wrote (MetaPost's `write`, TeX's
 * `\openout`), the tools' working files, and anything a failed run left
 * half-written. So a document can plant nothing in the cache, two builds
 * rendering the same figure at once never read a partial file, and a failed
 * run caches nothing.
 */
export function compileInRunDir(dir, work) {
	fs.mkdirSync(dir, { recursive: true });
	const run = fs.mkdtempSync(path.join(dir, '.run-'));
	try {
		const keep = (work(run) || []).filter((name) => fs.existsSync(path.join(run, name)));
		for (const name of keep) fs.renameSync(path.join(run, name), path.join(dir, name));
		return keep;
	} finally {
		fs.rmSync(run, { recursive: true, force: true });
	}
}
