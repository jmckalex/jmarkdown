/*
	`jmarkdown watch <file>` — rebuild on every change and live-reload in the
	browser, with no per-build process-startup cost.

	Design (Option A + warm standby):
	  - Each build runs in a forked one-shot worker (watch-worker.js) that has
	    pre-imported the module graph. Fresh process ⇒ fresh interpreter state.
	  - We keep EXACTLY ONE warm standby ready. When a change is dispatched to
	    it, we immediately fork its replacement, which warms up while the build
	    runs and while the author keeps typing — so every build after the first
	    starts warm and the startup cost is never on the critical path.
	  - A generation counter means only the latest change's result triggers a
	    reload; superseded in-flight builds are ignored.

	Limitation (v1): files pulled in via the `Load directives/extensions/
	javascript` metadata keys (loaded with import(), which bypasses fs) are not
	auto-watched — edit one and restart the watcher. Everything an author edits
	while writing (source, [[includes]], config, templates, .bib, images) is
	tracked via fs reads (see dep-tracker.js).
*/
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import http from 'http';
import chokidar from 'chokidar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(__dirname, 'watch-worker.js');
const FS_PRELOAD = path.join(__dirname, 'watch-fs-preload.cjs');

const MIME = {
	'.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
	'.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
	'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
	'.pdf': 'application/pdf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
	'.map': 'application/json', '.ico': 'image/x-icon',
};

export async function startWatch(file, options) {
	const source = path.resolve(file);
	if (!fs.existsSync(source)) {
		console.error(`watch: file not found: ${source}`);
		process.exit(1);
	}
	const isLatex = (options.to || 'html') === 'latex';
	const outFile = path.resolve(options.output || source.replace(/\.([^.]+)$/, isLatex ? '.tex' : '.html'));
	const outDir = path.dirname(outFile);
	const serve = options.serve !== false && !isLatex; // live preview is HTML-only in v1
	const buildOptions = { ...options, to: options.to || 'html', output: outFile };

	// ----- standby manager: keep exactly one warm worker ready -----
	let standby = null;          // { child, ready: Promise, isReady: bool }
	let replacementPending = false;

	function spawnStandby() {
		if (replacementPending || standby) return;
		replacementPending = true;
		const child = fork(WORKER, [], {
			execArgv: ['--require', FS_PRELOAD],   // patch fs before any ESM links it, to track read deps
			stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
		});
		let resolveReady;
		const ready = new Promise((r) => { resolveReady = r; });
		const rec = { child, ready, isReady: false };
		child.once('message', (m) => {
			if (m && m.type === 'ready') { rec.isReady = true; replacementPending = false; resolveReady(); }
		});
		child.on('exit', () => {
			if (!rec.isReady) {            // died before it was ever ready → try again
				if (standby === rec) standby = null;
				replacementPending = false;
				setTimeout(spawnStandby, 250);
			}
		});
		standby = rec;
	}

	async function takeStandby() {
		if (!standby) spawnStandby();
		const rec = standby;
		standby = null;                 // consumed; caller must spawn a replacement
		await rec.ready;
		return rec.child;
	}

	// ----- live-reload clients (SSE) -----
	const sseClients = new Set();
	let lastError = null;
	function broadcast(event, data = '') {
		for (const res of sseClients) {
			try { res.write(`event: ${event}\ndata: ${data}\n\n`); } catch { /* client gone */ }
		}
	}

	// ----- file watcher -----
	const watcher = chokidar.watch(source, { ignoreInitial: true });
	const watched = new Set([source]);
	function updateWatchSet(deps) {
		if (!Array.isArray(deps)) return;
		for (const d of deps) {
			if (watched.has(d)) continue;
			if (d === outFile) continue;
			if (d.includes(`${path.sep}node_modules${path.sep}`)) continue;
			if (d.startsWith(__dirname)) continue;       // don't watch jmarkdown's own source
			watcher.add(d);
			watched.add(d);
		}
	}

	// ----- build dispatch (generation-guarded) -----
	let gen = 0;
	async function build(reason) {
		const myGen = ++gen;
		const t0 = Date.now();
		const child = await takeStandby();
		spawnStandby();                  // warm the replacement immediately (dispatch-time)
		let settled = false;
		child.send({ type: 'build', file: source, options: buildOptions });
		child.once('message', (m) => {
			settled = true;
			if (myGen !== gen) return;     // a newer change superseded this build
			if (m.type === 'done') {
				lastError = null;
				updateWatchSet(m.deps);
				console.log(`  ✓ ${path.relative(process.cwd(), outFile)}  (${Date.now() - t0}ms)${reason ? '  · ' + reason : ''}`);
				broadcast('reload');
			} else if (m.type === 'error') {
				lastError = m.message;
				console.error(`  ✗ build failed: ${m.message}`);
				broadcast('builderror', JSON.stringify(m.message));
			}
		});
		child.once('exit', (code) => {
			if (!settled && myGen === gen) {
				lastError = `worker exited (code ${code}) without producing output`;
				console.error('  ✗ ' + lastError);
				broadcast('builderror', JSON.stringify(lastError));
			}
		});
	}

	// debounce + coalesce: editors fire several events per save
	let timer = null, pendingReason = null;
	watcher.on('all', (ev, p) => {
		if (path.resolve(p) === outFile) return; // ignore our own output (no feedback loop)
		pendingReason = `${ev} ${path.basename(p)}`;
		clearTimeout(timer);
		timer = setTimeout(() => { const r = pendingReason; pendingReason = null; build(r); }, 150);
	});

	// ----- preview server + SSE injection -----
	let serverPort = null;
	if (serve) {
		serverPort = await startServer(outDir, outFile, parseInt(options.port, 10) || 3000, sseClients, () => lastError);
	}

	// ----- run -----
	console.log(`jmarkdown watch: ${path.relative(process.cwd(), source)} → ${path.relative(process.cwd(), outFile)}`);
	await build('initial');
	if (serve && serverPort) {
		const url = `http://localhost:${serverPort}/`;
		console.log(`  live preview at ${url}  (Ctrl-C to stop)`);
		if (options.open) {
			import('child_process').then(({ exec }) => {
				const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
				exec(`${cmd} ${url}`);
			});
		}
	} else {
		console.log('  watching for changes (Ctrl-C to stop)');
	}

	// ----- shutdown -----
	const shutdown = () => {
		try { standby?.child.kill(); } catch {}
		try { watcher.close(); } catch {}
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

// A tiny static server rooted at the output directory, with an SSE endpoint and
// on-the-fly injection of the live-reload client into served HTML (so the file
// on disk stays a clean, normal build — no watch cruft baked in).
function startServer(outDir, outFile, port, sseClients, getError) {
	const client = liveReloadClient();
	const server = http.createServer((req, res) => {
		const u = new URL(req.url, 'http://localhost');

		if (u.pathname === '/__livereload') {
			res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
			res.write(': connected\n\n');
			sseClients.add(res);
			const err = getError();
			if (err) res.write(`event: builderror\ndata: ${JSON.stringify(err)}\n\n`);
			req.on('close', () => sseClients.delete(res));
			return;
		}

		let rel = decodeURIComponent(u.pathname);
		if (rel === '/') rel = '/' + path.basename(outFile);
		const filePath = path.resolve(path.join(outDir, rel));
		if (filePath !== outDir && !filePath.startsWith(outDir + path.sep)) {
			res.writeHead(403); res.end('Forbidden'); return;
		}
		fs.readFile(filePath, (err, data) => {
			if (err) { res.writeHead(404); res.end('Not found'); return; }
			const ext = path.extname(filePath).toLowerCase();
			if (ext === '.html') {
				let html = data.toString('utf8');
				html = html.includes('</body>') ? html.replace('</body>', client + '</body>') : html + client;
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(html);
			} else {
				res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
				res.end(data);
			}
		});
	});

	return new Promise((resolve) => {
		const tryListen = (p, attempts) => {
			server.once('error', (e) => {
				if (e.code === 'EADDRINUSE' && attempts > 0) { tryListen(p + 1, attempts - 1); }
				else { console.error(`watch server error: ${e.message}`); resolve(null); }
			});
			server.listen(p, () => resolve(p));
		};
		tryListen(port, 20);
	});
}

function liveReloadClient() {
	return `<script>(function(){
  if (window.__jmdLive) return; window.__jmdLive = true;
  var es = new EventSource('/__livereload');
  es.addEventListener('reload', function(){
    try { sessionStorage.setItem('__jmd_scroll', String(window.scrollY)); } catch(e){}
    location.reload();
  });
  es.addEventListener('builderror', function(ev){ try { showErr(JSON.parse(ev.data)); } catch(e){} });
  window.addEventListener('load', function(){
    try { var y = sessionStorage.getItem('__jmd_scroll'); if (y !== null){ window.scrollTo(0, +y); sessionStorage.removeItem('__jmd_scroll'); } } catch(e){}
  });
  function showErr(msg){
    var d = document.getElementById('__jmd_err') || document.createElement('div');
    d.id = '__jmd_err';
    d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#b00020;color:#fff;font:13px/1.45 ui-monospace,Menlo,monospace;padding:10px 14px;white-space:pre-wrap;box-shadow:0 -2px 8px rgba(0,0,0,.3)';
    d.textContent = 'JMarkdown build error:\\n' + msg;
    document.body.appendChild(d);
  }
})();</script>`;
}
