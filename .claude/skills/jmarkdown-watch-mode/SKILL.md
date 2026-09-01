---
name: jmarkdown-watch-mode
description: >-
  Architecture, design rationale and gotchas for JMarkdown's watch mode (`jmarkdown watch <file>`) — the one-shot warm-worker model, the generation guard, fs-preload dependency tracking, the SSE preview server, morphdom live update, and the editor preview-sync bridge. Load before changing watch.js, watch-worker.js, watch-fs-preload.cjs, dep-tracker.js, or source-position stamping, and before touching live reload, inverse search, or anything in the preview bridge.
---

# Watch mode (`jmarkdown watch <file>`)

Live rebuild + browser reload for authoring. **Built on the one-shot CLI, not an
in-process loop** — because a JMarkdown build mutates global interpreter state
(additive `marked.use()` on the shared singleton, script blocks polluting the
real `global`/`String.prototype`, a populated ESM `import()` cache), so each
build must run in a fresh process. Architecture (Option A + a pre-warmed
standby):

- **Enabling refactor:** `index.js` exports `processFile(filename, options)` and
  guards its CLI behind `import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href`
  (realpath-resolved because the global `jmarkdown` bin is a symlink — `argv[1]` is the link path, `import.meta.url` the resolved target).
  So importing index.js (in the worker) **warms the heavy module graph without
  building**; the build runs only when `processFile` is called. The full test
  suite shells out to `node src/index.js process …`, so it gates this refactor.
- **One-shot warm workers:** the watcher (`watch.js`) keeps **exactly one warm
  standby** worker (`watch-worker.js`, forked) that has imported index.js and
  reported `ready`. On a change it dispatches the build to the standby and
  **immediately forks the replacement** (which warms during the build + the
  author's think-time). A worker does ONE build then exits — never reused, so no
  state bleed. Net: only the first build is cold (~600ms); later builds are warm
  (~150–250ms).
- **Generation guard:** a counter means only the latest change's result triggers
  a reload; superseded in-flight builds are ignored. Debounce 150ms + coalesce.
- **Dependency tracking:** the worker is forked with `-r watch-fs-preload.cjs`,
  which patches `fs` reads **before any ESM links `fs`** (so named imports like
  `import { readFileSync } from 'fs'` in `file-inclusion.js` are caught too) and
  records every path read into a global Set. `dep-tracker.js` exposes
  `getDeps()`/`resetDeps()`; the watcher watches exactly that set (source +
  `[[includes]]` + config + templates + `.bib` + images). **v1 limitation:**
  files pulled in via `Load directives/extensions/javascript` use `import()`
  (bypasses `fs`), so editing one needs a watcher restart.
- **Preview server + SSE:** a tiny `http` server rooted at the output dir, with a
  `/__livereload` SSE endpoint; the live-reload client is **injected into served
  HTML on the fly** (so the on-disk output stays a clean build). Build errors show
  a red browser overlay; build warnings (from `warnings.js` — unresolved refs,
  duplicate labels) an amber click-to-dismiss banner, replayed to fresh SSE
  connections so it survives full reloads. `--no-serve` for rebuild-only;
  `--open` to launch the browser. HTML-only in v1 (`--to latex` PDF-refresh is a
  documented follow-on).
- **morphdom live update (default):** on rebuild the client fetches the raw build
  (`/__jmd/src`) and **morphdom-diffs it onto the live DOM**, so only changed
  blocks update — no full reload, no flicker, scroll preserved, and **rendered
  MathJax/Mermaid in unchanged blocks are kept**. The trick: each leaf content
  block is tagged `data-jmdsrc = hash(rawInnerHTML)` BEFORE MathJax/Mermaid run;
  the morph skips blocks whose hash is unchanged (the live DOM is post-render but
  the hash is of source, so they always match) and re-typesets / `mermaid.run`s
  only the changed ones. `onBeforeNodeDiscarded` protects scripts and MathJax
  globals. **Any morph error → automatic `location.reload()` fallback**;
  `--full-reload` forces the old whole-page reload. Bundle served at
  `/__jmd/morphdom.js`. (Browser-side morph/re-render is verified by design +
  fallback, not by an automated test — there's no headless browser in the suite.)
  **Re-render dedupe (morphdom recursion gotcha):** the changed-block list handed
  to `MathJax.typesetPromise`/`mermaid.run` is built from two morphdom callbacks —
  `onBeforeElUpdated` (blocks morphed in place) and `onNodeAdded` (blocks in a
  newly-added subtree). `onNodeAdded` pushes the node **and** sweeps its tagged
  descendants, but morphdom's `handleNodeAdded` is **recursive** (fires
  `onNodeAdded` on the subtree root AND every descendant), so each tagged block in
  an added subtree was pushed **twice** — and MathJax's `findMath` over a list
  containing the same element twice inserts **two** rendered copies (duplicated
  math; Mermaid double-renders the same way). `reRender` therefore **dedupes the
  node list first** (identity, `indexOf`); only leaf blocks are tagged so there are
  no ancestor/descendant pairs to fold. Don't "simplify" by trusting either
  callback to be hit once. Symptom was intermittent — an in-place edit
  (`onBeforeElUpdated`) is single-push and fine; doubling needed morphdom to treat
  the surrounding subtree as added (e.g. adding/removing a list item).
  **Inline `<style>` sync:** morphdom diffs only `<body>`, but a body `<style>`
  block is relocated to `<head>` at build time (`moveBodyStylesToHead`), so an
  edited inline style would otherwise never reach the live page (the CSS-asset
  swap only covers *linked* `CSS:` sheets). The morph therefore also
  reconciles the head's inline `<style>`s (`syncStyles`): the client snapshots
  the build's head styles at init — during body parse, **before**
  MathJax/Mermaid/the sync bridge inject their own runtime `<style>`s — so the
  tracked list is build styles only; on each morph it patches changed ones in
  place (node reused → scroll/MathJax preserved, like the `<link>` swap), and
  adds/removes to match the new build by index (final DOM order = build order, so
  cascade is preserved). Runtime styles are never in the tracked list (MathJax's
  `MJX`-id style is also filtered as belt-and-braces) and never touched. Verified
  by a fake-DOM unit test over the shipped `syncStyles` + a live `/__jmd/src`
  rebuild check (no headless browser in the suite).
- **CSS/JS asset live-tracking:** local files referenced by the `CSS:` and
  `Script:` metadata keys (plus a `Watch:` list for extras that aren't directly
  linked — an `@import`ed partial, a module a linked script imports) are
  watched. Because the build only *references* these files (never reads them),
  they're invisible to the fs dep-tracker and a change to one **never alters the
  built HTML** — so the watcher **skips the rebuild entirely**: a CSS change is
  injected (browser-sync style — clone the matching `<link>` with a cache-busting
  query, swap on load, no reload, scroll/MathJax preserved) via a `cssupdate` SSE
  event; a JS change triggers a full reload via `jsreload`. The worker reports the
  local assets in its `done` message (read from the merged config post-build);
  the watcher classifies a changed path as css-asset / js-asset / build-input and
  only the last rebuilds. A non-linked `Watch:` `.css` refreshes **all** local
  sheets (we can't know which sheet imports it); a non-`.css` `Watch:` entry full-
  reloads. `--css` / `--js` gate which **asset kinds** are tracked (**neither flag
  → both**; `--css` alone watches CSS only, `--js` only JS) — they do **not** touch
  the source-document path: a source/`[[include]]`/config/template edit always
  rebuilds + morphs regardless of the flags. Served assets get
  `Cache-Control: no-store` so a JS reload re-fetches. Only assets under the
  output dir (the server's root) get live treatment; CDN/out-of-tree refs are
  skipped.
- **Editor preview-sync bridge (`/__jmd/sync.js`):** a small script injected into
  the served page (alongside the live-reload client) that enables **forward
  search** (editor cursor → scroll+flash the matching preview block) and **inverse
  search** (⌘/Ctrl-click in the preview → move the editor cursor) when the preview
  is embedded in an editor's `<iframe>`. Because the editor (e.g. Godot, served
  from `app://`) is a different origin, all sync goes over `window.postMessage`
  with a fixed envelope (`{ source:'jmarkdown-sync', version:1, type, …}`); the
  preview side owns the line↔element mapping using the page's `data-source-line`
  stamps (floor-match for forward, nearest-ancestor-then-Y-fallback for inverse).
  The bridge is **inert unless embedded** (returns early when
  `window.parent === window.self`), so standalone browser preview is unaffected
  and it needs no flag; `--no-sync` opts out of injection. It survives morphdom
  live updates via document-level event delegation + fresh DOM queries (and the
  injected `<script>` is kept by `onBeforeNodeDiscarded`; its flash `<style>` lands
  in `<head>`, never morphed). When embedded it **fully claims** the modifier-click
  (`preventDefault` + `stopImmediatePropagation` in the capture phase) so the
  page's own `kmtrigger://` edit-link handler (the legacy Sublime inverse-search,
  injected by `index.js`) never runs — that navigation is CSP-blocked in Godot and
  blanks the preview. The flash is reserved for an
  **explicit** forward-search (`scroll-to-line` with `flash:true`); auto-follow
  sends `flash:false` and scrolls silently, and a save-driven morphdom reload never
  re-flashes (else every save would flash the editing spot). The body is the
  verbatim reference impl from the `JMARKDOWN-PREVIEW-SYNC` spec (kept byte-faithful
  so the separately-built editor side stays in step), held as the `SYNC_CLIENT`
  constant in `watch.js`. **Stamp
  convention:** `data-source-line` is **1-based for files with a YAML/metadata
  header** (the common case — `header_length` shifts the 0-based offset back to the
  original file's coordinates) but **0-based for a headerless file** (`header_length`
  stays 0); the bridge uses the raw value, identical to the existing Sublime
  inverse-search handler in `index.js`, so any fix belongs at the stamp
  (`source-positions.js`), not per-consumer. Verified by design + the fallbacks
  (no headless browser in the suite). **Stamp coverage:** built-in block tokens
  (paragraph/heading/list-item/table/blockquote/code) and inline JMarkdown
  extensions were always stamped; the `@begin(name)…@end` **environment wrappers**
  (theorems, floats, equations, generic + parity envs — all via the one wrapped
  `beginEnd` renderer) and the `@name+` **block wrappers** (`atBlock`) are now
  stamped too, so inverse search resolves a click on an env's chrome, not just its
  inner prose. `addSourceLineAttr`'s tag regex allows hyphens so custom-element
  wrappers (`@begin(call-out)` → `<call-out>`) aren't split mid-name. Inline
  `@name` (`atInline`) is deliberately left unstamped — it already sits inside a
  stamped `<p>`, and stamping the cross-ref markers would diverge from their
  byte-identical `:ref`/`:cref` colon twins. Stamping is full-HTML only
  (fragment/LaTeX skip it), so the `--fragment`-only feature suite can't exercise
  it — verified with full-HTML builds.
- New deps: `chokidar`, `morphdom`. The four watch files are import-isolated from
  the build path, so they only load on the `watch` command.
- Author-facing docs: `docs/watch-mode.jmd` (in the docs-snapshot suite and the
  `index.html` nav). Port collisions auto-walk upward (up to 20 attempts); the
  printed URL is authoritative.
