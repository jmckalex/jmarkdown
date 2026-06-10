/*
	One-shot warm build worker for `jmarkdown watch` (see watch.js).

	Forked by the watcher. On start it imports index.js — which loads the heavy
	module graph (marked, cheerio, citation-js, mathjs, …) and registers nothing
	until processFile() is called — then reports `ready` and waits. On the first
	`build` message it runs EXACTLY ONE build, reports the output path and the
	files it read, and exits.

	Why one-shot: a process that has built a file is "dirty" — it has accumulated
	additive marked.use() registrations on the shared singleton, polluted the
	real `global` (and String.prototype) via script blocks, and populated the ESM
	import cache. Reusing it would reintroduce exactly the cross-document state
	bleed JMarkdown's one-shot CLI design avoids. So the watcher keeps a fresh,
	pre-warmed standby instead of ever reusing a worker.
*/
import { getDeps, resetDeps } from './dep-tracker.js';
import { getWarnings } from './warnings.js';

// File reads are recorded by the CJS preload (watch-fs-preload.cjs, applied via
// -r when this worker is forked); resetDeps() before the build clears the
// warm-up reads so the reported set is just the build's.

// WARM UP: importing index.js runs only its (file-independent) module-load —
// the guard in index.js keeps it from parsing argv or building anything.
const { processFile } = await import('./index.js');

if (process.send) process.send({ type: 'ready' });

process.once('message', async (msg) => {
	if (!msg || msg.type !== 'build') return;
	resetDeps();
	try {
		const { outFile } = await processFile(msg.file, msg.options);
		// warnings: build-quality nags (unresolved refs, duplicate labels) the
		// watcher shows in the browser as an amber banner.
		if (process.send) process.send({ type: 'done', output: outFile, deps: getDeps(), warnings: getWarnings() });
	} catch (err) {
		if (process.send) process.send({
			type: 'error',
			message: String((err && err.message) || err),
			stack: err && err.stack,
			deps: getDeps(),
		});
	} finally {
		process.exit(0); // one-shot: die so accumulated state can't bleed into a reuse
	}
});
