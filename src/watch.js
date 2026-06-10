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
const MORPHDOM = path.join(__dirname, '..', 'node_modules', 'morphdom', 'dist', 'morphdom-umd.min.js');

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
	let lastWarnings = [];   // build-quality warnings from the last successful build
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
				lastWarnings = Array.isArray(m.warnings) ? m.warnings : [];
				updateWatchSet(m.deps);
				console.log(`  ✓ ${path.relative(process.cwd(), outFile)}  (${Date.now() - t0}ms)${reason ? '  · ' + reason : ''}`);
				for (const w of lastWarnings) console.warn(`  ⚠ ${w}`);
				// reload first, warnings second: the client clears the old banner
				// on 'reload' and repaints it from this event if warnings persist.
				broadcast('reload');
				if (lastWarnings.length) broadcast('buildwarnings', JSON.stringify(lastWarnings));
			} else if (m.type === 'error') {
				lastError = m.message;
				lastWarnings = [];           // the red overlay supersedes stale warnings
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
		serverPort = await startServer(outDir, outFile, parseInt(options.port, 10) || 3000, sseClients, () => lastError, () => lastWarnings, !!options.fullReload);
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

// A tiny static server rooted at the output directory. Serves the build with an
// injected live-reload client (the on-disk file stays a clean build — injection
// is on the fly), plus three control endpoints under /__jmd/:
//   /__livereload   — SSE stream (reload / builderror / buildwarnings events)
//   /__jmd/src      — the raw built HTML (no injection): the morph target
//   /__jmd/morphdom.js — the morphdom UMD bundle
// Live updates use morphdom to patch only changed blocks (preserving rendered
// MathJax/Mermaid in unchanged ones); --full-reload (or a missing morphdom)
// falls back to a plain location.reload().
function startServer(outDir, outFile, port, sseClients, getError, getWarnings, fullReload) {
	const morphAvailable = !fullReload && fs.existsSync(MORPHDOM);
	const client = liveReloadClient(!morphAvailable);

	const server = http.createServer((req, res) => {
		const u = new URL(req.url, 'http://localhost');

		if (u.pathname === '/__livereload') {
			res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
			res.write(': connected\n\n');
			sseClients.add(res);
			// Replay current state to a fresh connection, so the overlay/banner
			// survives a full page reload (the events were broadcast pre-reload).
			const err = getError();
			if (err) res.write(`event: builderror\ndata: ${JSON.stringify(err)}\n\n`);
			const warns = getWarnings();
			if (warns && warns.length) res.write(`event: buildwarnings\ndata: ${JSON.stringify(warns)}\n\n`);
			req.on('close', () => sseClients.delete(res));
			return;
		}

		// The raw build (no injected client) — what the morph diffs against.
		if (u.pathname === '/__jmd/src') {
			fs.readFile(outFile, (err, data) => {
				if (err) { res.writeHead(404); res.end('Not found'); return; }
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
				res.end(data);
			});
			return;
		}

		if (u.pathname === '/__jmd/morphdom.js') {
			fs.readFile(MORPHDOM, (err, data) => {
				if (err) { res.writeHead(404); res.end('//'); return; }
				res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
				res.end(data);
			});
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

// Shared helpers for both client variants: scroll restore across a full reload,
// and the build-error overlay.
const CLIENT_COMMON = `
  function saveScroll(){ try{ sessionStorage.setItem('__jmd_scroll', String(window.scrollY)); }catch(e){} }
  window.addEventListener('load', function(){ try{ var y=sessionStorage.getItem('__jmd_scroll'); if(y!==null){ window.scrollTo(0,+y); sessionStorage.removeItem('__jmd_scroll'); } }catch(e){} });
  function fullReload(){ saveScroll(); location.reload(); }
  function clearErr(){ var d=document.getElementById('__jmd_err'); if(d) d.remove(); }
  function showErr(msg){ var d=document.getElementById('__jmd_err')||document.createElement('div'); d.id='__jmd_err'; d.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#b00020;color:#fff;font:13px/1.45 ui-monospace,Menlo,monospace;padding:10px 14px;white-space:pre-wrap;box-shadow:0 -2px 8px rgba(0,0,0,.3)'; d.textContent='JMarkdown build error:\\n'+msg; document.body.appendChild(d); }
  function clearWarn(){ var d=document.getElementById('__jmd_warn'); if(d) d.remove(); }
  function showWarn(msgs){ var d=document.getElementById('__jmd_warn')||document.createElement('div'); d.id='__jmd_warn'; d.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483646;background:#9a6b00;color:#fff;font:13px/1.45 ui-monospace,Menlo,monospace;padding:10px 14px;white-space:pre-wrap;box-shadow:0 -2px 8px rgba(0,0,0,.3);cursor:pointer'; d.title='Click to dismiss'; d.onclick=function(){ d.remove(); }; d.textContent='JMarkdown build warnings (click to dismiss):\\n'+msgs.join('\\n'); document.body.appendChild(d); }`;

function liveReloadClient(useFullReload) {
	if (useFullReload) {
		return `<script>(function(){
  if (window.__jmdLive) return; window.__jmdLive = true;${CLIENT_COMMON}
  var es = new EventSource('/__livereload');
  es.addEventListener('reload', function(){ fullReload(); });
  es.addEventListener('builderror', function(ev){ try{ showErr(JSON.parse(ev.data)); }catch(e){} });
  es.addEventListener('buildwarnings', function(ev){ try{ showWarn(JSON.parse(ev.data)); }catch(e){} });
})();</script>`;
	}

	// morphdom client: diff at the block level by source hash, preserving rendered
	// MathJax/Mermaid in unchanged blocks and re-rendering only changed ones.
	return `<script src="/__jmd/morphdom.js"></script>
<script>(function(){
  if (window.__jmdLive) return; window.__jmdLive = true;${CLIENT_COMMON}
  var BLOCK='p,li,h1,h2,h3,h4,h5,h6,td,th,dt,dd,figcaption,caption,pre,blockquote,div,section,article,aside,details,summary';
  function hash(s){ var h=0,i=0,l=s.length; for(;i<l;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return (h>>>0).toString(36); }
  // A "leaf" content block: no nested block element (mermaid divs always count).
  function isLeaf(el){ if(el.classList&&el.classList.contains('mermaid')) return true; return !el.querySelector(BLOCK); }
  // Tag every leaf block with a hash of its RAW innerHTML. At load this runs
  // before MathJax/Mermaid touch the DOM, so the hash is of the source — the
  // invariant we keep (updates copy the new raw hash; we never re-hash rendered
  // output), so unchanged blocks always compare equal and keep their rendering.
  function tag(root){
    var els=root.querySelectorAll(BLOCK), i, el;
    for(i=0;i<els.length;i++){ el=els[i]; if(el.closest('[id^="__jmd"]')) continue; if(isLeaf(el)) el.setAttribute('data-jmdsrc', hash(el.innerHTML)); }
    var mers=root.querySelectorAll('.mermaid'); for(i=0;i<mers.length;i++){ if(!mers[i].hasAttribute('data-jmdsrc')) mers[i].setAttribute('data-jmdsrc', hash(mers[i].textContent)); }
  }
  try{ tag(document.body); }catch(e){}

  function reRender(nodes){
    if(!nodes.length) return;
    if(window.MathJax && MathJax.typesetPromise){ try{ if(MathJax.typesetClear) MathJax.typesetClear(nodes); }catch(e){} MathJax.typesetPromise(nodes).catch(function(){}); }
    if(window.mermaid){ var mer=[],i,j; for(i=0;i<nodes.length;i++){ var n=nodes[i]; if(n.classList&&n.classList.contains('mermaid')) mer.push(n); if(n.querySelectorAll){ var inner=n.querySelectorAll('.mermaid'); for(j=0;j<inner.length;j++) mer.push(inner[j]); } } if(mer.length){ for(i=0;i<mer.length;i++){ mer[i].removeAttribute('data-processed'); } try{ mermaid.run({nodes:mer}); }catch(e){ try{ mermaid.init(undefined,mer); }catch(_){} } } }
  }

  function morph(){
    return fetch('/__jmd/src',{cache:'no-store'}).then(function(r){return r.text();}).then(function(html){
      var doc=new DOMParser().parseFromString(html,'text/html');
      tag(doc.body);
      var changed=[];
      window.morphdom(document.body, doc.body, {
        childrenOnly:true,
        getNodeKey:function(node){ return (node.id)||undefined; },
        onBeforeNodeDiscarded:function(node){
          if(node.nodeType!==1) return true;
          var tn=node.tagName;
          if(tn==='SCRIPT'||tn==='STYLE'||tn==='LINK') return false;          // keep scripts/styles
          if(node.id&&node.id.indexOf('__jmd')===0) return false;             // keep our nodes
          if(node.parentNode===document.body && ((tn&&tn.indexOf('MJX-')===0)||(node.id&&/^MJX/.test(node.id))||(typeof node.className==='string'&&/MathJax|mjx/.test(node.className)))) return false; // keep MathJax globals
          return true;
        },
        onBeforeElUpdated:function(fromEl,toEl){
          var fsrc=fromEl.getAttribute&&fromEl.getAttribute('data-jmdsrc');
          if(fsrc!=null){
            if(fsrc===(toEl.getAttribute&&toEl.getAttribute('data-jmdsrc'))) return false; // unchanged → keep rendered
            changed.push(fromEl);                                              // changed → re-render after morph
          }
          return true;
        },
        onNodeAdded:function(node){
          if(node.nodeType===1){
            if(node.getAttribute&&node.getAttribute('data-jmdsrc')!=null) changed.push(node);
            if(node.querySelectorAll){ var ls=node.querySelectorAll('[data-jmdsrc]'); for(var i=0;i<ls.length;i++) changed.push(ls[i]); }
          }
          return node;
        }
      });
      clearErr();
      reRender(changed);
    });
  }

  var es=new EventSource('/__livereload');
  es.addEventListener('reload', function(){
    clearWarn();  // a fresh 'buildwarnings' event follows immediately if warnings persist
    if(!window.morphdom){ fullReload(); return; }
    morph().catch(function(err){ try{ console.warn('[jmarkdown] morph failed; falling back to full reload', err); }catch(e){} fullReload(); });
  });
  es.addEventListener('builderror', function(ev){ try{ showErr(JSON.parse(ev.data)); }catch(e){} });
  es.addEventListener('buildwarnings', function(ev){ try{ showWarn(JSON.parse(ev.data)); }catch(e){} });
})();</script>`;
}
