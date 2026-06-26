# CLAUDE.md

Guidance for Claude Code working in the **JMarkdown** repository.

## Project at a glance

JMarkdown is a Node.js Markdown authoring system built on **marked.js v16**. A single `.md` source produces either polished **HTML** for the web or **LaTeX** for print. The flagship use case is the book *The Rise of Computational Philosophy* (Knuth-style literate authoring from one source of truth).

- **Language:** JavaScript (ES modules — `"type": "module"` in `package.json`).
- **Entry point:** `src/index.js`, exposed as the `jmarkdown` binary via the `bin` field.
- **CLI:** `jmarkdown process <file.md> [--to html|latex] [--fragment] [-n]`, plus `jmarkdown init`, `jmarkdown options`, and `jmarkdown watch <file.md>` (live rebuild + browser reload — see "Watch mode").
- **No build step.** Source runs directly under Node. No test suite at present (`npm test` is a placeholder).

## Repository layout

All source lives in `src/`. Key files:

| File | Role |
|---|---|
| `index.js` | Exports `processFile(filename, options)` (the whole per-file build); the CLI (commander: `process`/`init`/`options`/`watch`) is **guarded behind a main-module check** so importing index.js warms the module graph without building. Extension registration + pipeline orchestration live inside `processFile`. |
| `watch.js` | `jmarkdown watch`: the watcher — standby manager, generation-guarded dispatch, chokidar, static server + SSE live-reload. See "Watch mode". |
| `watch-worker.js` | One-shot warm build worker (forked): imports index.js (warm), reports `ready`, does exactly ONE `processFile` on a `build` message, then exits. |
| `watch-fs-preload.cjs` | CJS `-r` preload for the worker — patches `fs` reads before any ESM links `fs` (so even `import { readFileSync }` named imports are tracked) to record a build's file dependencies. |
| `dep-tracker.js` | `getDeps()`/`resetDeps()` over the global Set the preload fills. |
| `utils.js` | Shared `marked` / `marked_copy` instances, `registerExtension(s)`, `registerDirectives`, `runInThisContext` |
| `config-manager.js` | Configuration loading/merging; central state bus (`configManager.get/set`) |
| `metadata-header.js` | YAML-like metadata header parsing; dynamic loading of extensions/directives/JS |
| `file-inclusion.js` | Expands `[[name.md]]` inclusion directives before parsing (recursive; active-chain cycle detection; paths relative to the including file). Pipeline step 5. |
| `extended-directives.js` | The `createDirectives` factory (the canonical pattern for new directives) |
| `additional-directives.js` | Project directives, including `:TeX`, `:HTML`, `:::TeX`, `:::HTML` |
| `syntax-modifications.js` | Inline syntax: `/italics/`, `*strong*`, `==highlight==`, `__underline__`, sub/sup |
| `syntax-enhancements.js` | Further inline/block syntax |
| `smart-typography.js` | **Opt-in** (`Smart typography: true`, default off) typographic educator: straight quotes → curly, `---`/`--` → em/en dash, `...` → ellipsis. A `walkTokens` hook on both marked instances mutating only **leaf inline `text` tokens** (code/math/`:::TeX`/escapes never produce those, so protection is free); emits raw **Unicode** so one implementation serves both outputs. Reads the config key lazily at walk time — registration happens before the metadata header is parsed |
| `script-blocks.js` | `<script type="jmarkdown">` and `jmarkdown-postprocess` blocks |
| `function-extensions.js` | Acorn-based inline JS expression parsing; `export_to_jmarkdown` |
| `source-positions.js` | Stamps `data-source-line` attributes for Cmd+click inverse search to Sublime Text |
| `post-processor.js` | Cheerio DOM manipulation, cross-reference resolution, beautification |
| `latex-renderer.js` | LaTeX renderer for marked's built-in tokens (paragraphs, headings → class-aware sectioning, lists, code → minted, links, images → plain `\includegraphics`, …) |
| `latex-template.js` | Full-document assembly: `\documentclass` + preamble + frontmatter + body. Page setup (geometry/setspace/fancyhdr) + hyperref/PDF metadata from metadata keys. Peer of `html-template.js` |
| `html-template.js` | HTML full-document assembly (Mustache + config merge); peer of `latex-template.js` |
| `default-template.tex.mustache` | The `.tex` document skeleton (triple-brace; peer of `default-template.html.mustache`) |
| `preamble.js` | Usage-driven package manager: `requirePackage` / `addPreamble` / `addLatePreamble` / `crefName`; `assemblePreamble()` |
| `latex-escape.js` | Shared `&`/`#` prose escaping (`escapeLatexText`) |
| `sectioning.js` | Sectioning ladder + `Heading base`/`Document class` resolution (shared by the LaTeX heading renderer and the HTML cref word) |
| `crossref.js` | HTML cross-reference registry: per-run label table + `typedRefText` (the `:cref` wording) |
| `warnings.js` | Build-warning collector (reset per run from `processFile`): unresolved `:ref`/`:cref` and duplicate labels still render/overwrite as before, but are collected and summarised on stderr at end of build; watch mode shows them as an amber dismissible banner (`buildwarnings` SSE event, replayed to fresh connections) |
| `indexing.js` | Back-of-book index: inline `:index[entry]{name=…}` marks (raw-claimed; full makeindex grammar passes to LaTeX verbatim) + `::Index{title name intoc}` placement (the `::Bibliography` pattern). LaTeX → imakeidx (`\index`/`\makeindex`/`\printindex`); HTML → post-pass `buildIndexes` builds letter-grouped linked indexes with §-number locators (`Headings: numeric`) or ordinals. `resetIndexing`/`checkIndexPlacements` called from `processFile` |
| `begin-end-core.js` | Generic, publishable `@begin(name)…@end(name)` extension: tokenizer, block-environment registry (`registerBlockEnvironment`), and the `createBeginEnd(options)` factory. **No LaTeX, no JMarkdown coupling.** |
| `begin-end.js` | Thin JMarkdown layer over `begin-end-core.js`: injects the generic LaTeX fallback, the `Block elements` policy, and the parity environments (`abstract`/`feedback`/`TeX`/`HTML`) |
| `floats.js` | `@begin(figure|table|subfigure|listing)` — captioned, numbered, referenceable floats |
| `theorems.js` | `@begin(theorem|lemma|…|proof)` — thmtools, one shared sequential counter |
| `numbered-environments.js` | `defineEnvironment` honouring `numbered: true`: auto-numbered, cross-referenceable user environments (HTML via the `number_environments` post-processor pass over `.jmd-env` markers; LaTeX via an auto thmtools theorem-like). All env-registration routes funnel through here; `getNumberedSpecs()` feeds the post-processor |
| `equations.js` | `@begin(equation)` — numbered, referenceable display math |
| `alerts.js` | LaTeX rendering of GFM alerts (`> [!NOTE]`) as `tcolorbox` |
| `inline-footnotes.js` | `[^label: body]` syntax with multi-paragraph support |
| `tikz.js`, `mermaid.js`, `mathematica.js` | Diagram / computation directives (TikZ → native `tikzpicture` in LaTeX; Mermaid → cached PDF via mmdc) |
| `strategic-form-games.js` | Game-theoretic payoff matrix directive |
| `marked-extended-tables-headerless.js` | Custom table tokenizer (auto-flips `tabular`→`longtable` past 20 rows; also the seed for the future `:::grid` directive) |
| `citations.js` | Compile-time citations (`Resolve citations`): parse-time `\cite`-family inline tokenizer + `::Bibliography` block extension |
| `biblify-compile.js` | Compile-time citation resolver: cheerio post-pass (HTML only) porting the runtime Biblify client — indexes `.bib`, resolves placeholders via `citation-js` + CSL, assembles bibliographies |

## Processing pipeline (in order)

1. CLI parsing (Commander.js).
2. Configuration loaded by `configManager` (global `~/.jmarkdown/config.json` → project `./.jmarkdown/config.json` → file metadata header, highest priority).
3. Extension and directive registration on both `marked` and `marked_copy`.
4. YAML metadata header parsed and stripped; may trigger dynamic loading.
5. `processFileInclusions()` expands `<<include>>` directives.
6. `preprocessFootnotes()` extracts multi-paragraph inline footnotes.
7. (HTML, non-fragment only) source-position stamping for inverse search.
8. (LaTeX only) `marked.use({ renderer: latexRenderer })`.
9. `marked.parse()` — the main parse/render pass.
10. Output divergence:
   - **LaTeX:** write `.tex` directly, no post-processing.
   - **HTML:** cheerio post-processing → template wrapping → inverse-search script injection → js-beautify → write `.html`.

## Watch mode (`jmarkdown watch <file>`)

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
- New deps: `chokidar`, `morphdom`. The four watch files are import-isolated from
  the build path, so they only load on the `watch` command.
- Author-facing docs: `docs/watch-mode.jmd` (in the docs-snapshot suite and the
  `index.html` nav). Port collisions auto-walk upward (up to 20 attempts); the
  printed URL is authoritative.

## Critical conventions and gotchas

### Output format is dispatched via `global.isLatex`
Set once in `index.js` from `--to latex`. Renderers branch on `global.isLatex` to emit either HTML or LaTeX. New extensions with visible output should handle **both** branches; if a directive should suppress output in LaTeX, return `''` (don't leak HTML markup — see how `classAndId` does it).

### Two marked instances
`marked` is the main parser. `marked_copy` is for parsing markdown produced inside `<script>` blocks or function extensions, to avoid state contamination. `registerExtension(s)` in `utils.js` installs on **both**. Some extensions (footnotes, script blocks, TiKZ, Mathematica, markdown-demo, source positions) are deliberately installed only on `marked`.

### Directive framework
New directives go through `createDirectives()` in `extended-directives.js`. Three levels: container `:::`, block `::`, inline `:`. Multi-level forms (3–8 colons) are registered for nesting.

- **Naming:** Proper-noun capitalisation — `:TeX`, `:HTML`, not `:tex` / `:html`. Stay consistent.
- **Custom tokenizers** suppress marked's lexer on the directive's content. Use this only when needed — e.g. `:::TeX` uses an empty custom tokenizer so raw LaTeX (with `$`, `_`, `\`) is preserved verbatim. `:::HTML` deliberately omits one so markdown prose gets processed.
- The asymmetry between `:::TeX` (no markdown processing) and `:::HTML` (markdown processing) is **intentional**. Don't try to unify it.

### Named block environments (`@begin(name) … @end(name)`)
An alternative to the colon-counted container directives. Because the closer *names* what it closes, blocks nest by name — no colon counting, and no renumbering when you wrap or insert a block. Purely **additive**: the `:::name … :::` directives are unchanged. The `@` sigil follows texinfo's `@example … @end example` convention and is otherwise unused in JMarkdown.

**Two-file architecture (rip-out boundary):** `src/begin-end-core.js` is the generic, publishable extension — the tokenizer, the **block-environment registry**, generic `div`/element HTML, and the `createBeginEnd(options)` factory. It contains **no LaTeX and no JMarkdown coupling** (the word `latex` appears only in comments); `createBeginEnd()` with no options is a complete standalone marked extension. `src/begin-end.js` is the thin JMarkdown layer that injects all the project/format specifics — so the core can be published to npm by dropping `begin-end.js`. (The older hand-stripped `marked-named-blocks/` copy predates this split; converge it onto `begin-end-core.js` when publishing.)

- **Syntax:** `@begin(name)[label]{attrs}` — `()` = name, `[]` = optional text/label, `{}` = attributes (parsed with `attributes-parser`, same as directives). Closer is bare `@end(name)` (name required, no args).
- **Generic rendering, any name:** LaTeX is always `\begin{name}[label]…\end{name}`. HTML renders the name as either `<div class="name">` or a custom element `<name>`: a name **without** a hyphen → `div.class`, **with** a hyphen → custom element (matching the HTML spec, where a valid custom-element name must contain a hyphen). Override per block — `@begin(.name)` forces a class, `@begin(<name>)` forces an element — or document-wide via the `Block elements` metadata/config key (`hyphenated` default · `all` · `none`; per-block sigils win). In div mode the name merges into any author `class`. The author supplies the matching CSS / `\newenvironment`; JMarkdown invents no meaning for the name.
- **Registry:** `registerBlockEnvironment(name, handler)` (from `begin-end-core.js`) maps a name to a handler the renderer consults before the generic fallback. A handler is `{ mode?, tokenize?, html, latex?, render? }` — `mode` is `'markdown'` (default) · `'verbatim'` · `'custom'` (gets a `tokenize(body, token)` hook with lexer access); `html` is the one required renderer, `latex` (or any other format key) is optional and additive, `render` is a format-independent alternative. Output dispatch is one latex-free line: `handler[format] || handler.html || handler.render`, with `format` from the injected `getFormat()` (default `'html'`). A handler with only `html` therefore renders its HTML in LaTeX mode too — which is exactly the legacy feedback behaviour (the `abstract` body now branches internally; see Parity). The handler-level `mode` answers the old "content modes" question; `ctx.attrs` is an `attributes-parser` result in both routes, so `attrs?.include` works identically. The registry is module-level, so any module registers independently of where the extension is built.
- **Parity:** four names mirror existing directives exactly, so `@begin(x)` ≡ `:::x`: `abstract`, `feedback`, `TeX` (verbatim, LaTeX-only), `HTML` (markdown, HTML-only). They are **registered from `begin-end.js`** (the JMarkdown layer); `abstract`/`feedback` reuse the render bodies exported from `additional-directives.js` (no drift). `renderAbstract` branches to LaTeX's standard `abstract` environment (HTML keeps the labelled div); `renderFeedback` still emits HTML in both formats (no standard LaTeX env — deferred). `TeX`/`HTML` are expressed as split `html`/`latex` renderers.
- **comment / optionals parity:** `createMultilevelOptionals` (`metadata-header.js`) registers each optional name (including `comment`) into the registry alongside its `:::` directive, so `@begin(comment)` honours the same include/exclude rule and **hides by default** — closing the footgun where it would otherwise fall through to the generic renderer and *show* a private note. HTML is a bare passthrough of the parsed body; LaTeX restores a trailing block separator (the core trims `ctx.inner`, fine for wrapped envs but not for this passthrough).
- **game parity:** `strategic-form-games.js` registers `@begin(game)` as a `mode:'custom'` handler that **reuses the `:::game` directive's own tokenizer and renderer verbatim** (same functions, the strongest no-drift form). The `tokenize` hook normalises the body to container shape (`'\n' + body.replace(/\n+$/, '')`) so the tokenizer sees byte-identical input to `:::game`, and sets `token.meta.name`; the renderer is called with the active parser as `this` and already branches on `global.isLatex`, so one format-independent `render` covers both outputs. `@begin(game)` output is byte-identical to `:::game` (verified for labels and `{math=all}`).
- **User-defined environments (script blocks):** `global.defineEnvironment` (= `defineEnvironment` from `numbered-environments.js`, which honours `numbered` and otherwise delegates to the core's `registerBlockEnvironment`; exposed in `index.js` like `export_to_jmarkdown`) lets an author define an environment from a `<script data-type="jmarkdown">` block: `defineEnvironment('callout', { html: (ctx) => …, latex: (ctx) => … })`. The callback receives the full `ctx`, so `ctx.text` (the `[label]`) and `ctx.attrs` (the `{attributes}`, an ergonomic `attributes-parser` object — `ctx.attrs?.kind`, numbers coerced) are available alongside `ctx.inner`. **Define before use** (script above the `@begin`), since the tokenizer reads `mode` while lexing. Handlers can declare LaTeX preamble needs the same way built-ins do: `global.requirePackage` / `global.addPreamble` / `global.addLatePreamble` are exposed alongside `defineEnvironment`, usage-driven (call inside the `latex` renderer). Fixture: `script-env.jmd`.
- **Numbered user environments (`numbered-environments.js`):** a handler with `numbered: true` is auto-numbered and cross-referenceable, like the built-in theorems — `defineEnvironment('exercise', { numbered: true, counter?, refname?, title?, html, latex? })`. `defineEnvironment` wraps the author's `html` in a `<div class="jmd-env …" data-jmd-counter/-kind/-name id>` marker that the post-processor's `number_environments` pass (after the `number_theorems`/`number_equations` passes) numbers in document order **per counter group** (so envs sharing a `counter` interleave), prepends a `Title N.` label, stamps `data-xref-number`/`-type` (so a body `:label` adopts the number, and `:cref`'s word comes from `typedRefText`'s raw-type fallback), and `recordLabel`s the `{id=…}`. With no author `latex`, the env renders as a **thmtools theorem-like** (`\declaretheorem[name, refname, Refname{, sibling=counter}]{name}`; the engine numbers, cleveref names) — a synthetic base counter is declared once for a shared group whose name isn't itself an env. The `specs` Map is the only added registry; numbering coupling lives entirely here + the one post-processor pass (core stays generic). All registration routes (script block, `Load environments`, `Environments` config) funnel through this `defineEnvironment`. **Author owns the `id`** on a numbered env (in `{id=…}`, not their `html`). Sharing with a *built-in* theorem counter is not yet supported (separate HTML passes) — a follow-up would unify the five hand-written numbering passes onto this registry. Fixtures: `features/numbered-environments/`, `latex-document/numbered-env.jmd`.
- **User-defined environments (from a file):** the metadata key `Load environments:` mirrors `Load directives` / `Load extensions` — `Load environments: warning, theorem from envs.js` (named exports are handlers, registered under their export name) or `Load environments: envs.js` (the default export is a `{ name: handler }` map). Resolves against the markdown file's directory. Config-level parity: an `Environments` config key (default `[]`) consumed by `configManager.loadEnvironments()` from `index.js`, taking absolute paths. Both routes call `registerBlockEnvironment` via `loadEnvironments` / `loadEnvironmentsFromSpec` in `metadata-header.js`. Fixtures: `file-env.jmd` + `file-env-defs.js`.
- **Nesting:** arbitrarily deep. Same-name nesting is depth-counted in the tokenizer; differently-named nesting is free (inner block is re-lexed as markdown). **Nested blocks may be indented** for readability in any style, or not at all — `@begin`/`@end` are matched at any leading whitespace (no consistent-indent requirement), and each block dedents its own body before processing (relative indentation, e.g. inside a code fence, is preserved). An orphan opener (no `@end`) is emitted literally with a stderr warning — it never swallows the document or throws.
- **Registration:** `index.js` imports the configured `beginEnd` from `begin-end.js` and does `marked.use({ extensions: [beginEnd] })`. Because `@` is an unused sigil, nothing competes for `@begin(...)`, so — unlike the `:::` directives — its registration order doesn't matter.
- **Generic LaTeX & orphans:** the JMarkdown layer supplies the generic `\begin{name}[label]…\end{name}` fallback and the LaTeX form of an orphan opener via `createBeginEnd`'s `fallback`/`orphan` options (merged over the core's HTML defaults). The `Block elements` policy is injected via the `blockElements` option reading `configManager`. The fallback also **auto-provides a guarded no-op definition** per generic name via `addPreamble` — `\AtBeginDocument{\ifcsname name\endcsname\else\newenvironment{name}{}{}\fi}` — so full documents compile before the author defines the environment (graceful degradation = the print twin of an unstyled div; `\AtBeginDocument` defers past the whole preamble so an author definition always wins). Caveat: names that are already TeX commands (`box`, `outer`, `middle`, `frame`, …) can't work as LaTeX environments at all — the guard sees them "defined" and `\begin{name}` runs the primitive; avoid such names in dual-output fixtures/docs.
- Fixtures: `tests/features/begin-end/`.

### Extension registration order matters
Inline extensions registered **later** are checked first in marked.js. The inline footnote extension is registered after `marked-footnote` for this reason. Document any ordering dependencies you introduce.

### Block extension `start()` must only report positions its tokenizer can match
marked truncates the paragraph being built at the smallest index any block
`start()` returns, then retries tokenizers there — so a `start` that matches
where its own tokenizer can't (mid-line `::` in a code span, say) shreds the
paragraph one character at a time and hands the remainder to whichever
tokenizer mis-claims it (the old `` `::Note` ``-in-prose bug, fixed 2026-06).
Anchor block/container starts to line starts (`(?:^|\n)…`, returning the
post-newline index) and pre-check the tokenizer's real shape (see
`description-lists.js` and the directive `start` in `extended-directives.js`).
Inline starts may match anywhere — that's correct for them.

### `runInThisContext`
Script blocks, function extensions, and post-processor scripts share a single VM context (`runInThisContext` from Node's `vm` module, re-exported via `utils.js`). Anything assigned to `global.*` is visible everywhere downstream.

### Fragment mode
`--fragment` outputs headerless HTML with no `data-source-line` injection; cheerio runs with `isDocument: false`. Note: `moveBodyStylesToHead` has a special case here to avoid silently dropping `<style>` tags.

### File inclusion
`[[name.md]]` on a line by itself splices the contents of `name.md` into the source before parsing. Relative paths resolve against the directory of the **including** file (not cwd), so includes work regardless of where `jmarkdown` is invoked from. Includes are recursive; cycle detection rejects only active-chain cycles (A→B→A), so the same file may be reused at multiple independent sites. Tokens inside fenced code blocks and `$$…$$` math are left literal. (4-space-indent code blocks are disabled in JMarkdown — see the `code(){}` override at `src/index.js:327` — so an indented include directive still expands.) Included files are not re-parsed for metadata.

### Citations (Biblify): runtime vs compile-time
Two independent paths share the `\cite`-family syntax (`\cite`, `\citet`, `\citep`, `\citeauthor[*]`, `\fullcite`, `\nocite`, optional `[prenote][postnote]` args, comma-separated keys — the natbib grammar):

- **Runtime** (default — i.e. `Resolve citations` off): the HTML template loads the browser Biblify client (`citation.min.js` + `biblify.js`) which resolves `\cite` commands in the page. Source lives in `../biblify/src/biblify.js`.
- **Compile-time** (`Resolve citations: true`): citations are resolved during the build. Two pieces, both in `src/`:
  - `citations.js` — the parse-time extensions. The inline `\cite`-family tokenizer claims each raw command **before** marked's inline rules can mangle the `[...]` args / `*` / keys (and never fires inside code spans, so literal examples are safe). The `::Bibliography` block extension marks where a bibliography goes (`::Bibliography{style="apa" scope="#sec" all}`); it's a dedicated block extension, not a labelled directive, because the directive framework requires trailing content so bare `::Bibliography` wouldn't tokenize.
  - `biblify-compile.js` — a cheerio post-pass (HTML only, called from `post-processor.js`) that is a faithful port of the runtime client: it indexes the `.bib`, resolves the placeholders with `citation-js` + CSL, and assembles bibliographies. The inline formatters (`generic_paren_processor`, `bjps_processor`) and Vancouver range-collapsing are ported from Biblify so output matches.

Output split: **LaTeX emits native natbib** — the `\cite` commands pass through verbatim (`\fullcite`→`\bibentry`) and `::Bibliography` emits `\bibliographystyle`+`\bibliography`; real bibtex/biber does the work (author supplies `\usepackage{natbib}`, and `bibentry` if using `\fullcite`, in their surrounding document — LaTeX output is body-only). **HTML uses the CSL engine.** When `Resolve citations` is on, the runtime client scripts are suppressed (`{{^Biblify.resolve}}` in `default-template.html.mustache`).

Metadata keys (all `Capitalised Words With Spaces`): `Bibliography` (path), `Bibliography style` (apa/harvard1/vancouver/bjps/chicago/ajp/econometrica/ergo, or a custom `foo.csl`), `Resolve citations`, `Citation tooltips`, `Minimal bibliography` (writes `<out>.cited.bib`), `LaTeX bib style` (natbib `.bst`). Bundled CSL files live in `src/csl/`. `citation-js` is a dependency, loaded via `createRequire` (it's CJS; `require('citation-js')` returns the `Cite` constructor with `Cite.plugins` static). Vancouver is a whole-document mode; per-section style switching and scoped/sectional bibliographies are HTML-only.

## Style

- ES modules, `import`/`export`. No CommonJS in new code.
- Tabs for indentation in existing files; match the surrounding file's style when editing.
- Single quotes for strings; backticks for template literals.
- Comments are valued — directives in `additional-directives.js` carry block comments explaining *why*, not just *what*. Keep that habit.
- The codebase favours readable verbosity over clever density.

## Working with Jason

- **The handover document** at the top of a session lists open items, but treat it as a reference, not a queue. Jason often redirects to a more pressing issue immediately.
- **Match solution complexity to actual use frequency.** Don't over-engineer infrequent cases (e.g. a registry + post-processing for a problem solved by `if (global.isLatex) return ''`).
- **Architecture is strong; documentation and packaging are the remaining barriers to open-source release.** Don't propose large refactors unless asked.
- Jason actively catches inconsistencies (casing bugs, wrong file versions, misdiagnoses) mid-session. Update without defensiveness — no apology spirals.

## Known bugs (deferred, but don't reintroduce or rely on)

- Dead code after returns in the Mathematica renderer.

(The old `crossrefs`-never-resets bug is **fixed**: the cross-ref table lives in
`crossref.js`, reset per run via `resetCrossrefs()` at the top of
`postProcessHTML`. The codespan-breaks-on-`}` bug is **fixed**: `codespan` picks
a `\mintinline` delimiter the code doesn't contain.)

## LaTeX document-preparation system

`--to latex` emits a **complete, compilable document** (`--fragment` = body only,
which is also what the feature/compile test harnesses consume). The architecture:
**LaTeX emits native commands and lets the engine number/resolve; HTML resolves
everything itself in the post-processor** (which never runs for LaTeX). The
post-processor (`post-processor.js`) numbers floats/theorems/equations and
records them in `crossref.js`; the parse hook in `index.js` handles the
`{{…}}` document markers.

- **Assembly** (`latex-template.js` + `default-template.tex.mustache`): wraps the
  body in `\documentclass` + assembled preamble + frontmatter + `\end{document}`.
  All user-overridable, nothing baked in. Metadata keys (`Capitalised Words`):
  `Document class` (default `article`), `Class options`, `LaTeX engine` (default
  `pdflatex` — tunes `inputenc`/`fontenc` vs `fontspec`), `Packages`,
  `LaTeX preamble`, `Geometry`, `Line spacing` (single/onehalf/double/n),
  `Header`, `Footer` (fancyhdr), `Heading base`. `hyperref` is auto-loaded for
  every full document (clickable refs/ToC + PDF bookmarks) with
  `\hypersetup{pdftitle,pdfauthor}` from `Title`/`Author`; `\maketitle` from
  `Title`/`Author`/`Date`.
- **Preamble manager** (`preamble.js`): usage-driven. Features call
  `requirePackage(name, opts)` as they render, so the preamble contains only
  what's used. `addPreamble` (raw lines, e.g. `\newtheorem`/`\usetikzlibrary`),
  `addLatePreamble` (after the load-order-sensitive hyperref/cleveref, e.g.
  `\crefname`/`\hypersetup`), `crefName(type,sing,plur)` (force cleveref to spell
  types out in full to match HTML). Order: engine defaults → feature/user
  packages (hyperref/cleveref forced last) → raw lines → late lines → user
  preamble.
- **Cross-references** (`additional-directives.js` + `crossref.js` + `post-processor.js`):
  `:label[k]`/`:ref[k]` (bare number) and `:cref[k]`/`:Cref[k]` (typed, e.g.
  "section 3"/"Section 3"). LaTeX → native `\label`/`\ref`/`\cref`/`\Cref`; HTML →
  anchored marker + hyperlink, resolved over the complete DOM (forward refs work
  **single-pass**). Wording is identical in both outputs (full words via
  `crefName`; equations parenthesised, "(2)"). Counters: sections (native /
  heading numbering), figures, tables, listings (own counters), theorems (one
  shared sequential counter), equations. A `:label` INSIDE a numbered
  construct adopts its number/kind via the `data-xref-number`/`-type` stamps
  the numbering passes leave on the DOM (the HTML twin of `\label` inside an
  environment, which LaTeX supports natively) — equivalent to `{id=…}`;
  floats should still prefer `{id=…}` (a body `\label` lands before
  `\caption` in the .tex and binds the wrong counter). An unresolvable
  `:ref`/`:cref` still
  renders `??` and a duplicate label still lets the later definition win, but
  both now also record a build warning (`warnings.js`) — stderr summary +
  watch-mode banner; the LaTeX path leaves this to the engine's native nags.
- **Sectioning** (`sectioning.js`): heading depth → command from a base derived
  from the class (`article`→`\section`, `book`/`report`→`\chapter`) or explicit
  `Heading base`. The default `article` is why `#`→`\section` (article has no
  `\chapter`).
- **Floats** (`floats.js`): `@begin(figure)[caption]{id=fig:x}`, `@begin(subfigure)
  [caption]{id=… width=0.45}` (subcaption, "(a)" → ref "1a"), `@begin(table)`
  (caption above), `@begin(listing)` (minted `listing` float). Captioned,
  numbered, referenceable. A **bare** `![](…)` is now plain `\includegraphics`,
  not a float. Label keys go in `{id=…}` (the `{#…}` shorthand can't carry a
  colon).
- **Theorems** (`theorems.js`): `@begin(theorem|lemma|corollary|proposition|
  definition|example|remark)` + `@begin(proof)`. thmtools `\declaretheorem[sibling=
  theorem]` → ONE shared sequential counter (Theorem 1, Lemma 2, …) while
  cleveref still names each kind correctly (a plain shared `\newtheorem` counter
  would wrongly print "theorem 2" for a lemma). proof is unnumbered + QED.
- **Equations** (`equations.js`): `@begin(equation){id=eq:x}` (verbatim math body,
  no `$$`). JMarkdown numbers them itself (document order), so `:ref`/`:cref`
  resolve at build time. `:cref` → "equation (2)".
- **Conditional content**: `:::print`/`:::web` (+ inline `:print[…]`/`:web[…]` and
  `@begin(print)`/`@begin(web)`) — markdown emitted in one output only.
- **Back-of-book index** (`indexing.js`): `:index[entry]` invisible marks (the
  full makeindex grammar — `!` subentries, `sort@display`, `|see{…}`/`|seealso`,
  `|(`/`|)` ranges, `|textbf`, `"`-escapes — passes through verbatim) +
  `::Index{title="…" intoc name=…}` placement. LaTeX → `imakeidx` (auto-loaded,
  before hyperref by insertion order) with `\makeindex[…]` per index and
  `\printindex[…]`; multiple named indexes via `{name=…}`. HTML → post-pass
  builds a letter-grouped `<nav class="index">`; locators are linked §-numbers
  (needs `Headings: numeric`; ordinal fallback), duplicates collapse, see-refs
  hyperlink to their target entry. Warnings: marks without a placement
  (`checkIndexPlacements`, both formats), missing see-targets, unbalanced
  ranges, >3 levels. Docs: `docs/indexing.jmd` (live demo index on the page).
- **Contents & matter** (parse hook in `index.js`): `{{TOC}}`/`{{LOF}}`/`{{LOT}}`/
  `{{LOL}}` (LaTeX `\tableofcontents`/`\listoffigures`/`\listoftables`/
  `\listoflistings` — the last requires minted, which the marker pulls in even
  with no listings present; HTML generated lists) and
  `{{frontmatter}}`/`{{mainmatter}}`/`{{backmatter}}`/`{{appendix}}`
  (LaTeX commands; HTML strips them — HTML appendix lettering not yet done).
- **Other**: GFM alerts → `tcolorbox` (`alerts.js`); description lists →
  `description` env; tables rule with booktabs (`\toprule`/`\midrule`/
  `\bottomrule`, auto-`requirePackage('booktabs')` — both the extension path
  and the `table()` fallback; headerless tables get top/bottom only); long
  tables auto-flip `tabular`→`longtable` past 20 rows;
  TikZ emits native `tikzpicture` (preamble auto-loads tikz + libraries); Mermaid
  rasterises to a cached PDF via `mmdc` (optional — skipped with a hint if absent).
- **Math passthrough**: inline/display `$…$`/`$$…$$` pass through verbatim; escaping
  touches only `&`/`#` (see `latex-escape.js` + the reserved-chars memory). The
  inline `latex` extension protects inline `$…$`/`\(…\)`; a **block-level**
  `mathBlock` extension (`syntax-enhancements.js`, registered after the list
  extensions so marked tries it first) claims whole display blocks — `$$…$$`,
  `\[…\]`, and bare `\begin{env}…\end{env}` — BEFORE the list/paragraph tokenizers,
  so math whose lines start with `+ `/`- `/`* ` (aligned-equation operators) isn't
  sliced into `<ul>/<li>`, and bare `\begin{align}` works without a `$$` wrapper.
  `\[…\]` is now preserved (not rewritten to `$$`).
- **Math macros** (`Math macros` metadata/config key): raw LaTeX definitions,
  one per line, shared VERBATIM by both outputs — LaTeX gets preamble lines
  (before user `LaTeX preamble`; amsmath+amssymb auto-required to match
  MathJax's default `ams` vocabulary), HTML gets a hidden inline-math block at
  the top of the body (`div.math-macros`; inline math is never numbered, so
  `tags:'ams'` can't number it). Macros only — `\newenvironment` stays in
  `LaTeX preamble` (MathJax parity too partial). Fragment LaTeX output omits
  them (body-only contract); fragment HTML includes the block.
- **`:::game`** (`strategic-form-games.js`) → `sgame`'s `game` environment.
  Positional optional args: lone `[...]` = caption; `[...][...]` = player labels;
  `[row][col][caption]` = all three (empty `[]` fills a missing player label).
  Payoffs wrapped in `$…$`. `sgame` is incompatible with `memoir`, `tabularx`,
  `array.sty` (and `colortbl`/`jurabib`); use `sgamevar` for `beamer`.

### Remaining LaTeX-pipeline work

- **Multi-file books**: master-file `[[…]]` inclusion already yields one PDF /
  one HTML page with cross-file refs + continuous numbering (verified). The only
  gap is **multi-PAGE HTML** (separate `chapterN.html`), which JMarkdown can do
  in a **single pass** — parse all chapters into memory, number across them,
  resolve, emit pages (no `crossrefs.json`, no rerun; the in-memory model
  sidesteps TeX's streaming two-pass). HTML appendix lettering (A, B…) also TODO.
- Raw-HTML suppression in LaTeX — remaining edge cases.
- Consider disabling marked's built-in GFM table tokenizer so the
  `marked-extended-tables-headerless` extensions are the sole table path (one
  canonical syntax; lets us delete the `table()` fallback in `latex-renderer.js`).
  Pre-flight: grep the book + `docs/` for looser tables (rows without trailing
  pipes) first.

## Future feature: `:::grid`

Reuse the headerless-table tokenizer to parse pipe-delimited cells (`||` = column span, `^` = row span), but emit CSS grid `<div>`s instead of `<table>`. Container attributes like `{columns="..." gap="..."}` feed `grid-template-columns` and `gap`.
