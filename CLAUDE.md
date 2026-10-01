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
| `syntax-modifications.js` | Inline syntax: `/italics/`, `*strong*`, `==highlight==`, `__underline__`, sub/sup. `/italics/` has flanking rules, so slashes in words, paths and URLs stay literal (see "`/italics/` flanking") |
| `syntax-enhancements.js` | Further inline/block syntax |
| `smart-typography.js` | **Opt-in** (`Smart typography: true`, default off) typographic educator: straight quotes → curly, `---`/`--` → em/en dash, `...` → ellipsis. A `walkTokens` hook on both marked instances mutating only **leaf inline `text` tokens** (code/math/`:::TeX`/escapes never produce those, so protection is free); emits raw **Unicode** so one implementation serves both outputs. Reads the config key lazily at walk time — registration happens before the metadata header is parsed |
| `note-code.js` | `Run note code`: the one switch over every path by which a document makes the build run code, and the by-name refusal each path emits when it is off; also `noteCodeError`, the in-place marker for code that ran and threw (see below) |
| `script-blocks.js` | `<script type="jmarkdown">` and `jmarkdown-postprocess` blocks |
| `function-extensions.js` | Acorn-based inline JS expression parsing; `export_to_jmarkdown`. An exported name claims only a call or member expression rooted at it — anything else (`Save the Date. Bring wine.`) is declined and stays prose |
| `inline-function-extension.js` | `function(…) { … }` blocks (at a line start) and inline `func(…) { … }`: run an anonymous function in place. Claims only a complete function WITH A BODY (`functionSource`), so prose that mentions `func(x)` stays prose; a throw becomes a `noteCodeError` marker |
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
| `indexing.js` | Back-of-book index: inline `@index[entry]{name=…}` marks (raw-claimed; full makeindex grammar passes to LaTeX verbatim) + `@index{title name intoc}` placement (the `@bibliography` pattern; legacy aliases `:index[…]` / `::Index`). LaTeX → imakeidx (`\index`/`\makeindex`/`\printindex`); HTML → post-pass `buildIndexes` builds letter-grouped linked indexes with §-number locators (`Headings: numeric`) or ordinals. `resetIndexing`/`checkIndexPlacements` called from `processFile` |
| `begin-end-core.js` | Generic, publishable `@begin(name)…@end(name)` extension: tokenizer, block-environment registry (`registerBlockEnvironment`), and the `createBeginEnd(options)` factory. **No LaTeX, no JMarkdown coupling.** |
| `begin-end.js` | Thin JMarkdown layer over `begin-end-core.js`: injects the generic LaTeX fallback, the `Block elements` policy, and the parity environments (`abstract`/`feedback`/`TeX`/`HTML`) |
| `floats.js` | `@begin(figure|table|subfigure|listing)` — captioned, numbered, referenceable floats |
| `theorems.js` | `@begin(theorem|lemma|…|proof)` — thmtools, one shared sequential counter |
| `numbered-environments.js` | `defineEnvironment` honouring `numbered: true`: auto-numbered, cross-referenceable user environments (HTML via the `number_environments` post-processor pass over `.jmd-env` markers; LaTeX via an auto thmtools theorem-like). All env-registration routes funnel through here; `getNumberedSpecs()` feeds the post-processor |
| `equations.js` | `@begin(equation)` — numbered, referenceable display math |
| `alerts.js` | LaTeX rendering of GFM alerts (`> [!NOTE]`) as `tcolorbox` |
| `inline-footnotes.js` | `[^label: body]` / `[fn: body]` inline footnotes with multi-paragraph support, plus **grouped endnotes**: per-note `(group)` (`[fn(g): …]`), the ambient `@endnoteGroup(name)` directive, and `@endnotes` / `@endnotes(name)` placement. See "Grouped endnotes" |
| `tikz.js`, `mermaid.js`, `mathematica.js` | Diagram / computation directives (TikZ → native `tikzpicture` in LaTeX; Mermaid → cached PDF via mmdc). Each also registers a `@begin(name)` parity handler (byte-identical to its `:::` twin — see "graphics parity" under begin-end); the inline `⟦…⟧` Mathematica form is unchanged |
| `metapost.js` | `@begin(metapost)…@end(metapost)` block environment (registry-only, no `:::` form). Verbatim MetaPost source, compiled once and cached by content hash under a `MetaPost/` dir next to the source. HTML → `mpost` (`outputformat:="svg"`) → `<img src='MetaPost/<hash>-N.svg'>` (same `{scale/width/embed/empty-cache}` attrs as TiKZ); LaTeX → `mptopdf` → cached PDF via `\includegraphics[max width=\linewidth]` (mermaid's engine-agnostic model — works with the default pdflatex, no luamplib). Compile happens at RENDER time (not tokenize); failures → inline error box (HTML) / dropped + warning (LaTeX), and the error path deletes any partial figure so it never caches. No fixture (needs `mpost`/`mptopdf` + would write a cache dir into the tree) |
| `media.js` | `@image(path)[alt]{attrs}` / `@video(path)[alt]{attrs}` — images and video in both formats. One semantic attribute vocabulary (`width`/`height`/`scale`/`align`) translated per format, `tex-`/`web-` scoped overrides, everything else passed through as HTML attributes. Video degrades in LaTeX under `Video mode` (link · embed · attach · poster) |
| `strategic-form-games.js` | Game-theoretic payoff matrix directive |
| `marked-extended-tables-headerless.js` | Custom table tokenizer (auto-flips `tabular`→`longtable` past 20 rows; also the seed for the future `:::grid` directive) |
| `citations.js` | Compile-time citations (`Resolve citations`): parse-time `\cite`-family inline tokenizer + `@bibliography` block extension (legacy alias `::Bibliography`) |
| `pandoc-citations.js` | **Opt-in** (`Pandoc citations: true`) pandoc citation syntax — `[@key]` / `@key` / `[-@key]` — as a second front end: the tokenizer *translates* to the equivalent `\cite` command and reuses `renderCiteCommand`, so all three back-ends serve both syntaxes unchanged |
| `bib-attachments.js` | Reads the raw `.bib` for a reference's **attachments** (BibDesk `Bdsk-File-N` — base64 → binary plist → `relativePath` + macOS bookmark — and the JabRef/Zotero `file` field), resolving each to an absolute path. Consumed only by `\citefile`; includes a minimal `bplist00` reader (no new dependency) |
| `biblify-compile.js` | Compile-time citation resolver: cheerio post-pass (HTML only) porting the runtime Biblify client — indexes `.bib`, resolves placeholders via `citation-js` + CSL, assembles bibliographies |

## Processing pipeline (in order)

1. CLI parsing (Commander.js).
2. Configuration loaded by `configManager` (global `~/.jmarkdown/config.json` → project `./.jmarkdown/config.json` → file metadata header, highest priority).
3. Extension and directive registration on both `marked` and `marked_copy`.
4. YAML metadata header parsed and stripped; may trigger dynamic loading.
5. `processFileInclusions()` expands `<<include>>` directives.
6. `preprocessFootnotes()` resolves ambient endnote groups (`@endnoteGroup`) and extracts multi-paragraph inline footnotes.
7. (HTML, non-fragment only) source-position stamping for inverse search.
8. (LaTeX only) `marked.use({ renderer: latexRenderer })`.
9. `marked.parse()` — the main parse/render pass.
10. Output divergence:
   - **LaTeX:** write `.tex` directly, no post-processing.
   - **HTML:** cheerio post-processing → template wrapping → inverse-search script injection → js-beautify → write `.html`.

## Watch mode (`jmarkdown watch <file>`)

Live rebuild + browser reload for authoring, built on the one-shot CLI rather than
an in-process loop. Full architecture, design rationale and gotchas: the
**`jmarkdown-watch-mode`** skill (`.claude/skills/jmarkdown-watch-mode/`).

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

#### Successor syntax: `@name[…]` / `@name+[…]` (single-shot directives)
A migration is **in progress** to retire the colon framework in favour of the `@`
sigil, unifying directives and named environments onto **one registry** (the
begin-end `registerBlockEnvironment`). New single-shot forms parallel the colon
levels, decided by a trailing `+`:

- `@name[text]{attrs}` — **inline** (parity with `:name`; a marked inline
  extension → placed inside the enclosing `<p>`, default `<span>`).
- `@name+[text]{attrs}` — **block** (parity with `::name`; a *line-anchored* marked
  block extension → a top-level element, never in `<p>`, default `<div>`). The
  `+` is the only difference; a `+`-form mid-sentence is left literal (block
  placement only works at a line start — marked fixes paragraph boundaries before
  inline runs). `@begin(name)…@end` remains the container form.

A third call-shape adds a **mandatory argument slot**, opt-in per handler
(`arg: true` in its registry entry): `@name(arg)[text]{attrs}` and
`@name+(arg)[text]{attrs}`, reaching the handler as `ctx.arg` (raw, unparsed). It
is for the one operand a directive can't do without — `@image(path)`,
`@video(path)` — so the call reads as a call rather than as a `{src=…}` attribute
among optional ones, and it matches the `@endnotes(name)` / `@endnoteGroup(name)`
parenthesis already in the language. Opt-in because a parenthesis is ordinary
prose: an unregistered name, or a registered one that didn't ask, still leaves
`(an aside)` alone (`@begin(name)` has no arg slot — its parentheses name the
environment). The block `start()` checks the registry before reporting a `(`
opener, keeping the anti-shredding rule.

`createAtInline`/`createAtBlock` live in `begin-end-core.js` (generic, sharing the
registry); the JMarkdown layer (`begin-end.js`) registers the handlers. The
**block-level `::` distinction is dropped** — the `+` recovers block placement
per-call instead (the old block level was inline content + block placement, used
~4× in real content). `ctx.text` is the raw bracket (handlers like cross-refs use
it; others use parsed `ctx.inner`); `ctx.inline`/`ctx.block` flag the form.

**Disambiguation rules (inline form):**
- A **bracket form** (`@name[…]`/`@name{…}`) is a directive anywhere; a **bare**
  `@name` (no bracket) is a directive **only if the name is registered** — so
  prose `@`-words aren't eaten. (Block bare `@name+` needs no registry gate: the
  `+` and line-anchor already disambiguate.)
- A `@` **glued to a word char** (`user@host`, `me@x.com`) is never a directive.
  Enforced in the tokenizer by reading the previous token's trailing char (the
  `start()` regex is restrictive — `(?<!\w)@` — to avoid splitting a valid email
  and starving marked's autolinker, but that gate alone is insufficient because
  other extensions break the text at the `@`; the prev-token check is the
  backstop).
- A `@name+[…]` block form that reaches the **inline** pass was not at a line
  start, so it is **misplaced** → a build warning + a visible `jmd-error` marker
  (HTML) / nothing (LaTeX). This is detectable precisely because the block pass
  runs first and would have claimed a correctly-placed one (the inline pass can
  do the context-sensitive check the block pass can't).

**Additive migration — status.** The `@` forms are now a **complete superset** of
the colon framework; `:`/`::`/`:::` stay fully live alongside. Shipped, all verified
byte-identical to their colon twins where one exists:
- Cross-refs `@span`, `@ref`/`@label`/`@cref`/`@Cref` (reuse the EXACT post-processor
  markers / native LaTeX commands).
- All container parity envs (`@begin(TeX|HTML|abstract|feedback|print|web)`), graphics
  (`@begin(TiKZ|mermaid|Mathematica|metapost)`), floats/theorems/equations/numbered
  envs, comment/optionals; the inline `@TeX/@HTML/@print/@web` forms.
- **Slice A (this pass):** the `.name`/`<name>` **override sigils** now work on the
  single-shot forms too — `@.name[…]`/`@<name>[…]` (inline) and `@.name+[…]`/
  `@<name>+[…]` (block), parity with `@begin(.name)`/`@begin(<name>)` (only the
  `createAtInline`/`createAtBlock` tokenizers changed; `renderGeneric*HTML` already
  honoured `override`). Ported the last colon-only directives:
  `@begin(markdown-demo)` (reuses the demo tokenizer/renderer verbatim, `'\n'`+body
  shim so the renderer's leading-blank `shift()` lands right), `@begin(source)` +
  inline `@target[…]` (HTML-only, like their colon twins), `@begin(title-box)` (reuses
  its tokenizer/renderer verbatim), and the six title-page directives —
  `@title+/@subtitle+/@author+/@institution+/@date+` (block `<div>`s) and inline
  `@today` (`institution` does `\n`→`<br>` on the raw bracket; the others match the
  colon output). All registered at module scope in their existing files, so **no
  `index.js` edit** and — being `@`-dispatched — order-independent.

  **Still to do:** the `:`→`@` **content codemod** + converting docs/fixtures (Slice B);
  **deleting `extended-directives.js`** and all colon wiring (Slice C — needs the book
  converted first; also drops the dead, uninstalled `plaintext`/`pass_through`).
  `classAndId` is not a colon directive and stays.

Fixtures: `tests/features/at-directives/` (`at-forms`, `at-disambiguation`,
`at-sigils`, `at-markdown-demo`, `at-sources-targets`, `at-title-box`, `at-title-page`).

### Named block environments (`@begin(name) … @end(name)`)
An alternative to the colon-counted container directives. Because the closer *names* what it closes, blocks nest by name — no colon counting, and no renumbering when you wrap or insert a block. Purely **additive**: the `:::name … :::` directives are unchanged. The `@` sigil follows texinfo's `@example … @end example` convention and is otherwise unused in JMarkdown.

**Two-file architecture (rip-out boundary):** `src/begin-end-core.js` is the generic, publishable extension — the tokenizer, the **block-environment registry**, generic `div`/element HTML, and the `createBeginEnd(options)` factory. It contains **no LaTeX and no JMarkdown coupling** (the word `latex` appears only in comments); `createBeginEnd()` with no options is a complete standalone marked extension. `src/begin-end.js` is the thin JMarkdown layer that injects all the project/format specifics — so the core can be published to npm by dropping `begin-end.js`. (The older hand-stripped `marked-named-blocks/` copy predates this split; converge it onto `begin-end-core.js` when publishing.)

- **Syntax:** `@begin(name)[label]{attrs}` — `()` = name, `[]` = optional text/label, `{}` = attributes (parsed with `attributes-parser`, same as directives). Closer is bare `@end(name)` (name required, no args).
- **Generic rendering, any name:** LaTeX is always `\begin{name}[label]…\end{name}`. HTML renders the name as either `<div class="name">` or an element `<name>`. Under the default policy the choice is: a name that is a **known HTML block-container element** (`aside`/`section`/`article`/`nav`/`header`/`footer`/`main`/`figure`/`blockquote`/`details`/`summary`/`dialog`/`address`/`form`/`fieldset`/`hgroup`/`search`/`figcaption`/`div`) → that element (so authors don't annotate the semantic containers); else a **hyphenated** name → custom element (matching the HTML spec, where a valid custom-element name must contain a hyphen); else → `div.class`. The known-element set (`BLOCK_CONTAINER_ELEMENTS` in `begin-end-core.js`, matched case-insensitively) is consulted **only for the block forms** — an inline `@name[…]` keeps the plain hyphen rule since a block element can't sit inside its `<p>`. Override per block — `@begin(.name)` forces a class, `@begin(<name>)` forces an element — or document-wide via the `Block elements` metadata/config key (`hyphenated` default · `all` always-element · `none` always-div; `all`/`none` bypass the known-element list, and per-block sigils win over everything). In div mode the name merges into any author `class`. The author supplies the matching CSS / `\newenvironment`; JMarkdown invents no meaning for the name. **LaTeX is unaffected** by any of this — the div/element distinction is HTML-only. Caveat: a known-element name that is also a TeX command (`section`) can't compile as a LaTeX environment (the `\begin{name}` guard sees it "defined"), so dual-output fixtures should avoid those names (or opt out of the `.tex` golden — `tests/features/begin-end/html-elements.jmd` is HTML-only for this reason).
- **Registry:** `registerBlockEnvironment(name, handler)` (from `begin-end-core.js`) maps a name to a handler the renderer consults before the generic fallback. A handler is `{ mode?, tokenize?, html, latex?, render? }` — `mode` is `'markdown'` (default) · `'verbatim'` · `'custom'` (gets a `tokenize(body, token)` hook with lexer access); `html` is the one required renderer, `latex` (or any other format key) is optional and additive, `render` is a format-independent alternative. Output dispatch is one latex-free line: `handler[format] || handler.html || handler.render`, with `format` from the injected `getFormat()` (default `'html'`). A handler with only `html` therefore renders its HTML in LaTeX mode too — which is exactly the legacy feedback behaviour (the `abstract` body now branches internally; see Parity). The handler-level `mode` answers the old "content modes" question; `ctx.attrs` is an `attributes-parser` result in both routes, so `attrs?.include` works identically. The registry is module-level, so any module registers independently of where the extension is built.
- **Parity:** four names mirror existing directives exactly, so `@begin(x)` ≡ `:::x`: `abstract`, `feedback`, `TeX` (verbatim, LaTeX-only), `HTML` (markdown, HTML-only). They are **registered from `begin-end.js`** (the JMarkdown layer); `abstract`/`feedback` reuse the render bodies exported from `additional-directives.js` (no drift). `renderAbstract` branches to LaTeX's standard `abstract` environment (HTML keeps the labelled div); `renderFeedback` still emits HTML in both formats (no standard LaTeX env — deferred). `TeX`/`HTML` are expressed as split `html`/`latex` renderers.
- **comment / optionals parity:** `createMultilevelOptionals` (`metadata-header.js`) registers each optional name (including `comment`) into the registry alongside its `:::` directive, so `@begin(comment)` honours the same include/exclude rule and **hides by default** — closing the footgun where it would otherwise fall through to the generic renderer and *show* a private note. HTML is a bare passthrough of the parsed body; LaTeX restores a trailing block separator (the core trims `ctx.inner`, fine for wrapped envs but not for this passthrough).
- **game parity:** `strategic-form-games.js` registers `@begin(game)` as a `mode:'custom'` handler that **reuses the `:::game` directive's own tokenizer and renderer verbatim** (same functions, the strongest no-drift form). The `tokenize` hook normalises the body to container shape (`'\n' + body.replace(/\n+$/, '')`) so the tokenizer sees byte-identical input to `:::game`, and sets `token.meta.name`; the renderer is called with the active parser as `this` and already branches on `global.isLatex`, so one format-independent `render` covers both outputs. `@begin(game)` output is byte-identical to `:::game` (verified for labels and `{math=all}`).
- **graphics parity:** `tikz.js` / `mermaid.js` / `mathematica.js` each register `@begin(TiKZ)` / `@begin(mermaid)` / `@begin(Mathematica)` the same way — a `mode:'custom'` handler reusing the directive's own tokenizer + renderer verbatim (each builds a marker-less instance, e.g. `createTiKZ()`, at module scope; imported already by `index.js`, so registration fires with no `index.js` edit and, being `@begin`-dispatched, order-independent). `token.attrs` (from `{…}`) is the same `attributes-parser` object the `:::` path uses, so `scale`/`width`/`embed`/`output`/`empty-cache` flow through unchanged. Body-normalisation shims: TiKZ + Mathematica use the game shim (`'\n' + body.replace(/\n+$/, '')`); **mermaid uses `'\n\n' + …`** because `:::mermaid` never actually invokes its tokenizer (`createToken` files a container body as a `text` token → only `header text`), so its `token.text` keeps a leading `\n`, and the `@begin` path (which *does* call the tokenizer, stripping one `\n`) must pre-pad two to land on the same text — a beautify-visible difference inside `<div class="mermaid">`. Verified byte-identical: TiKZ LaTeX + HTML (same SVG cache hash), mermaid HTML, Mathematica HTML incl. attrs + `DisplayMath` `$$`-wrap. `beginEnd` is registered on `marked` only, matching the `:::` originals' `marked`-only registration (so `marked_copy`/script-generated markdown is unaffected, as before). Fixtures: `features/tikz-diagrams/at-diagram` (`.tex`), `features/mermaid/at-diagram` (`.html`); Mathematica has no fixture (every path needs `wolframscript`). The inline `⟦…⟧` Mathematica form is deliberately out of scope (not a colon directive).
- **metapost (`metapost.js`):** a NEW `@begin(metapost)` env with no `:::` twin — so it's written natively (not a port): a `mode:'verbatim'` handler whose `html`/`latex` renderers compile at RENDER time (there is no tokenize-time compile like TiKZ; the verbatim body reaches the renderer as `ctx.rawText`). HTML `mpost`→SVG, LaTeX `mptopdf`→PDF (user-chosen over native luamplib so it works with the default pdflatex), both cached by content hash under `MetaPost/`. Registered via a side-effect `import './metapost.js'` in `index.js` (the module has no other export index.js needs). Same graceful-degradation contract as TiKZ/mermaid; the error path additionally sweeps partial `<hash>-N.{svg,pdf}` outputs (mpost nonstopmode can emit a broken figure AND exit non-zero) so a failure never caches. No fixture (external tools + would write a cache dir into the test tree — same rationale as Mathematica).
- **User-defined environments (script blocks):** `global.defineEnvironment` (= `defineEnvironment` from `numbered-environments.js`, which honours `numbered` and otherwise delegates to the core's `registerBlockEnvironment`; exposed in `index.js` like `export_to_jmarkdown`) lets an author define an environment from a `<script data-type="jmarkdown">` block: `defineEnvironment('callout', { html: (ctx) => …, latex: (ctx) => … })`. The callback receives the full `ctx`, so `ctx.text` (the `[label]`) and `ctx.attrs` (the `{attributes}`, an ergonomic `attributes-parser` object — `ctx.attrs?.kind`, numbers coerced) are available alongside `ctx.inner`. **Define before use** (script above the `@begin`), since the tokenizer reads `mode` while lexing. Handlers can declare LaTeX preamble needs the same way built-ins do: `global.requirePackage` / `global.addPreamble` / `global.addLatePreamble` are exposed alongside `defineEnvironment`, usage-driven (call inside the `latex` renderer). Fixture: `script-env.jmd`.
- **Numbered user environments (`numbered-environments.js`):** a handler with `numbered: true` is auto-numbered and cross-referenceable, like the built-in theorems — `defineEnvironment('exercise', { numbered: true, counter?, refname?, title?, html, latex? })`. `defineEnvironment` wraps the author's `html` in a `<div class="jmd-env …" data-jmd-counter/-kind/-name id>` marker that the post-processor's `number_environments` pass (after the `number_theorems`/`number_equations` passes) numbers in document order **per counter group** (so envs sharing a `counter` interleave), prepends a `Title N.` label, stamps `data-xref-number`/`-type` (so a body `:label` adopts the number, and `:cref`'s word comes from `typedRefText`'s raw-type fallback), and `recordLabel`s the `{id=…}`. With no author `latex`, the env renders as a **thmtools theorem-like** (`\declaretheorem[name, refname, Refname{, sibling=counter}]{name}`; the engine numbers, cleveref names) — a synthetic base counter is declared once for a shared group whose name isn't itself an env. The `specs` Map is the only added registry; numbering coupling lives entirely here + the one post-processor pass (core stays generic). All registration routes (script block, `Load environments`, `Environments` config) funnel through this `defineEnvironment`. **Author owns the `id`** on a numbered env (in `{id=…}`, not their `html`). Sharing with a *built-in* theorem counter is not yet supported (separate HTML passes) — a follow-up would unify the five hand-written numbering passes onto this registry. Fixtures: `features/numbered-environments/`, `latex-document/numbered-env.jmd`.
- **User-defined environments (from a file):** the metadata key `Load environments:` mirrors `Load directives` / `Load extensions` — `Load environments: warning, theorem from envs.js` (named exports are handlers, registered under their export name) or `Load environments: envs.js` (the default export is a `{ name: handler }` map). Resolves against the markdown file's directory. Config-level parity: an `Environments` config key (default `[]`) consumed by `configManager.loadEnvironments()` from `index.js`, taking absolute paths. Both routes call `registerBlockEnvironment` via `loadEnvironments` / `loadEnvironmentsFromSpec` in `metadata-header.js`. Fixtures: `file-env.jmd` + `file-env-defs.js`.
- **Nesting:** arbitrarily deep. Same-name nesting is depth-counted in the tokenizer; differently-named nesting is free (inner block is re-lexed as markdown). **Nested blocks may be indented** for readability in any style, or not at all — `@begin`/`@end` are matched at any leading whitespace (no consistent-indent requirement), and each block dedents its own body before processing (relative indentation, e.g. inside a code fence, is preserved). An orphan opener (no `@end`) is emitted literally with a stderr warning — it never swallows the document or throws.
- **Registration:** `index.js` imports the configured `beginEnd` from `begin-end.js` and does `marked.use({ extensions: [beginEnd] })`. Because `@` is an unused sigil, nothing competes for `@begin(...)`, so — unlike the `:::` directives — its registration order doesn't matter.
- **Generic LaTeX & orphans:** the JMarkdown layer supplies the generic `\begin{name}[label]…\end{name}` fallback and the LaTeX form of an orphan opener via `createBeginEnd`'s `fallback`/`orphan` options (merged over the core's HTML defaults). The `Block elements` policy is injected via the `blockElements` option reading `configManager`. The fallback also **auto-provides a guarded no-op definition** per generic name via `addPreamble` — `\AtBeginDocument{\ifcsname name\endcsname\else\newenvironment{name}{}{}\fi}` — so full documents compile before the author defines the environment (graceful degradation = the print twin of an unstyled div; `\AtBeginDocument` defers past the whole preamble so an author definition always wins). Caveat: names that are already TeX commands (`box`, `outer`, `middle`, `frame`, …) can't work as LaTeX environments at all — the guard sees them "defined" and `\begin{name}` runs the primitive; avoid such names in dual-output fixtures/docs.
- Fixtures: `tests/features/begin-end/`.

### Images and video (`media.js`)

`@image(path)[alt]{attrs}` and `@video(path)[alt]{attrs}`, in both the inline and
block (`+`) forms, on the shared registry. The path takes the argument slot above;
the bracket is alt text (`mode: 'verbatim'` — alt is plain text by definition); the
braces are HTML attributes, with two additions that let one source serve both
outputs. A bare `![alt](src)` is unchanged; `@begin(figure)` still owns captions
and numbering, and the two compose.

- **Four translated keys** — `width`, `height`, `scale`, `align` — are interpreted
  by both renderers: a fraction `0.6` or a percentage `"60%"` → `0.6\linewidth` /
  `60%`; a physical unit (`8cm`, `3in`, `24pt`) → **verbatim in both** (CSS and
  LaTeX share those units); `400px` → `300bp` (96→72 dpi) / `400px`; a bare number
  > 1 is pixels. Height fractions are relative to `\textheight`, widths to
  `\linewidth` (so they behave inside a minipage/subfigure). `align` is a
  block-form notion — an inline image sits in the text flow — and becomes
  margins (HTML) / `center`/`flushleft`/`flushright` (LaTeX).
- **`tex-` / `web-` prefixes** scope a key to one output and beat the unprefixed
  key there (`{width=0.5 tex-width=0.8 web-loading=lazy}`). `tex-options` is the
  raw-`\includegraphics`-keys hatch (`tex-options="trim=0 0 0 1cm, clip"`).
- **Everything else** passes through verbatim as an HTML attribute and is ignored
  by LaTeX. `alt=""` is preserved (it means *decorative*); `<video>` gets
  `controls` unless the author passes `autoplay` or `controls=false`, and its
  fallback content is a link carrying the alt text (`<video>` has no `alt`).
- **`{…}` cannot contain a backslash.** attributes-parser rejects the whole string
  and the entire attribute set is lost — which is why widths are semantic keys and
  not raw LaTeX. That failure is now a **build warning** rather than silence: the
  core takes an `onAttrsError` hook (`begin-end-core.js`), wired to `warnings.js`
  in `begin-end.js` for all three call-shapes. For arbitrary LaTeX, use
  `@begin(TeX)`.
- **Units are re-joined from the token stream.** attributes-parser reads
  `width=8cm` as `width=8` plus a bare attribute `cm` (and `50%` as `50` + `%`), so
  `normaliseUnits` walks `getTokens()` and re-attaches a unit that starts exactly
  where the numeric value ended. It must come from the tokens, not the parsed
  object: `width=8cm height=5cm` collide on the one `cm` key and the second is
  lost. Quoted (`width="8cm"`) works too.
- **Video in LaTeX degrades rather than translates**, under `Video mode`
  (per-video `{tex-mode=…}`): `link` (default — the poster hyperlinked, `run:` for
  a local file; works in every viewer) · `embed` (media9 RichMedia; **only Acrobat
  plays it**, ~480KB of player per document, not per video) · `attach`
  (attachfile2) · `poster` (the still alone). `embed`/`attach` need a local file
  that exists — a remote or missing one falls back to `link` with a warning.
  Verified empirically against TeX Live 2025: media9 v1.30 compiles under **both**
  pdflatex and xelatex and emits `/Subtype/RichMedia` with `/Subtype/Video` assets;
  beamer's `multimedia` `\movie` **fails under xelatex** (`\ifpdf` guard) and emits
  the obsolete PDF 1.2 `/Movie` annotation, so it is not used. media9 picks the
  asset subtype from the **basename of its last argument** — `VPlayer.swf` is what
  makes it `Video` rather than `Flash`, so passing a bare `.mp4` there compiles but
  declares the video as Flash content.
- **Posters** are auto-extracted from frame 1 with ffmpeg where one is needed and
  none was given, cached by a source stamp (path+size+mtime — video files are too
  big to hash per build) under `Video/` next to the source; `Video poster: none`
  turns it off, and a missing ffmpeg degrades with a warning. `ffprobe` supplies
  the aspect ratio when `embed` needs a height it wasn't given (16:9 fallback).
- **Remote images in LaTeX** can't be fetched at build time, so they become
  `\href{url}{alt}` with a warning rather than vanishing; an `.svg` prefers a
  sibling `.pdf`/`.png` if one exists (warning if not — `\includegraphics` can't
  read SVG).
- Fixtures: `tests/features/media/` (`image`, `video` — with a 1.5KB `tiny.mp4` and
  a 98-byte `frame.png` so the `embed`/`attach` paths are really exercised; the
  video fixture pins `Video poster: none` and explicit dimensions so no external
  tool runs during the suite) and `tests/features/at-directives/at-arg-slot`.

### Grouped endnotes (`inline-footnotes.js`)
Footnotes can be collected into named **groups** and each group **placed** at a
chosen spot, on top of the existing `[fn: …]` / `[^label: …]` inline footnotes.
Additive — a document that uses none of this behaves exactly as before (the
docs `footnotes` snapshot and the three `footnotes` fixtures are byte-identical).

- **Assign a group** (most-specific wins): a per-note `(group)` —
  `[fn(g): …]` / `[^label(g): …]`; or the ambient `@endnoteGroup(name)` directive
  on its own line, which groups every following note until the next
  `@endnoteGroup` (`@endnoteGroup()` resets to the default/unnamed group); else the
  default group.
- **Place a list:** `@endnotes(name)` renders that group here; bare `@endnotes`
  renders every group **not** claimed by a specific `@endnotes(name)`;
  `{title="…"}` adds a heading (none otherwise). A group with a placement but no
  notes, or notes in a group never placed, both warn (`warnings.js`) — unplaced
  notes are appended at the end rather than dropped.
- **Numbering is per-group, restarting at 1.** So a bare `@endnotes` renders one
  sub-list **per** group (the default group first, unlabelled; named groups under
  an `<h2 class="endnote-group-heading">`), because a single merged list would
  repeat "1". A single-group `@endnotes(name)` gets no such label.
- **Architecture — why the split.** marked tokenises **all** block tokens before
  **any** inline tokenising, so an ambient `@endnoteGroup` handled as a block
  extension would always read as the *last* group by the time footnotes lex.
  Ambient resolution therefore lives in the **preprocess** pass
  (`resolveAmbientGroups`, the only place with true document order): it injects the
  ambient `(group)` into each note opener and blanks `@endnoteGroup` lines (keeping
  the newline, so inverse-search line numbers don't shift). `@endnotes` is a block
  extension that emits a **placeholder**; `fillEndnotes(content, format)` (called
  from `index.js` after parse, for HTML and LaTeX alike) replaces the placeholders
  and appends any unplaced notes — so a placement marker may appear *before* the
  notes it gathers (the `@bibliography` pattern). This replaces the old
  end-of-document `getFootnotesHTML()` append (now a deprecated no-op shim).
- **LaTeX.** With no grouping/placement anywhere, each note is a plain inline
  `\footnote{…}` (unchanged). The moment any grouping/placement is used
  (`endnotesMode`), notes become endnotes: a `\textsuperscript{n}` mark inline and
  JMarkdown-built per-group lists at the placements (JMarkdown owns the numbering,
  so this leans on no `endnotes`/`enotez` package semantics).
- Fixtures: `tests/features/endnotes/` (`grouped`, `ambient`).

### `Run note code` — a document's code, and a host that did not write it (`note-code.js`)

A document can make the BUILD run code: `<script data-type="jmarkdown">` and
`jmarkdown-postprocess` blocks, the exported function calls in prose (`Math.…`,
`Date.…`, `String.…`, `MathJS.…`, `Algebra.…`, `calc(…)`, and anything a script
exports with `export_to_jmarkdown`), `function(…) { … }` blocks, `func(…)`,
`math.…(` expressions, Mathematica (`:::Mathematica`, `@begin(Mathematica)`,
`⟦…⟧` — Wolfram Language is code), and the header keys that load files beside
it (`Load javascript`, `Load extensions`, `Load directives`, `Load
environments`) or define tokenizers from its own text (`Extension …`). For an
author that is the point; for a host rendering documents someone else wrote
(Clew opening a shared vault) it means a note runs with the host's rights the
first time it renders.

- **One config switch, `Run note code`, default `true`** — today's behaviour, so
  the CLI and the book builds are unchanged. A host sets it `false` and every
  path above refuses **by name, in place**: `<span|div class="jmd-error
  jmd-refused" data-jmd-refused="NAME">` in HTML (NAME as written — the header
  key, `Math`, `math.sqrt`, `jmarkdown script`, `Mathematica`, …, so a host can
  say what was held back and offer to trust the document), nothing in LaTeX, and
  a build warning in both. Header keys have no place in the body, so their
  markers stand at its top (`headerRefusalsHTML()`, placed in index.js beside
  `Math macros`). Expressions are claimed by parsing them with acorn and never
  evaluating them; text that is no expression stays text.
- **Config only.** `mergeMetadata` drops a header's `Run note code` key: a
  document that could set it would switch its own code back on.
- **Not covered, by design:** external programs the engine runs over a
  document's content (lualatex for TiKZ, mpost, mmdc, ffmpeg) — TeX is a
  language too, but restricting it is those programs' business (their flags)
  and a separate question; and `<script>` passed through to the page, which runs
  wherever the page is shown.
- **No shell strings.** Every external program the engine runs with a
  document-influenced argument is called through `execFileSync` with an
  argument array (tikz, metapost, mermaid, media, mathematica): cache paths sit
  under the document's own folder, and a folder name holding `$(…)` or a
  backtick ran as a command inside a double-quoted shell string. Two calls stay
  shell strings on purpose: `mptopdf` (a Perl script with no `#!` line that
  starts only through the shell's fallback; its one argument is a hex hash), and
  mmdc on Windows (an npm `.cmd` shim; cmd.exe's quotes make `& | < >` literal
  and a Windows file name cannot hold `"`). Mathematica's
  `> file` redirects became a descriptor handed to the child as its stdout, so
  the file is created and filled exactly as before. Its `-c` argument keeps the
  string the shell used to hand over, `SetOptions[, PageWidth->100]` — the old
  double quotes let the shell expand `$Output` to nothing, and restoring it
  would change cached output (the owner's call, not a security fix's).
- **Code that throws doesn't take the build down.** `noteCodeError(name, error)`
  (beside `refuseNoteCode`) is the failure twin of a refusal: `<span|div
  class="jmd-error" data-jmd-error="NAME">[NAME failed: message]` in HTML,
  nothing in LaTeX, a build warning in both. A note's broken function is the
  note's problem; the rest of the document still renders. Used by
  `function(…)`/`func(…)` (below), simple `export_to_jmarkdown` functions (whose
  argument is spliced into a string literal as written, so a `"` in it is a
  SyntaxError), and `<script data-type="jmarkdown">` blocks that throw as they
  run (their *parse* errors already rendered in place). A post-process script
  that throws is skipped with a warning (no place in the body for a marker).
  The older `{simple: false}` path keeps its own error UI
  (`jmarkdown-inline-error` + popup) — which still leaks HTML into LaTeX.
  **Not yet covered:** the header loaders (`Load javascript`, `Load
  extensions`, …) still abort the build when a file throws or is missing.
- **Prose that merely looks like code stays prose.** The always-on exported
  names (`Math`, `Date`, `String`, `MathJS`, `Algebra`, `calc`) decline
  anything that isn't a call or member expression rooted at the name, rather
  than building a token with no `raw` (which crashed the build: `Save the Date.
  Bring wine.`, `Math.PI + 1, and more.`) or running a bare name (`I saved the
  Date.` printed `Date`'s source). A comma-sequence uses its FIRST expression,
  so `calc("2+2"), four, which is nice.` runs `calc` however many commas follow.
  The sentence-final retry (`handlePossibleIrrelevantEndCharacter`) now
  dispatches through the same handlers, and its throws are caught — it runs
  inside the tokenizer's `catch`, so `The value is Math.foo().` ending a
  paragraph used to end the build. `math.…(` expressions (`mathjs-extension.js`)
  decline on any failure; note that with the switch on that extension runs its
  expression but never returns its token, so it renders nothing either way.
  Fixtures: `tests/features/scripting/` (`prose-safety` — with an empty stderr
  golden, so a warning on prose fails it — and `script-errors`).
- **`function(…)` / `func(…)` claim only a whole function with a body**
  (`inline-function-extension.js`): the SHORTEST prefix ending in `}` that
  acorn accepts as a `FunctionExpression` (`functionSource`). So `the func(x)
  notation` and a line-initial `function(x) is our notation` stay prose — the
  block `start()` runs the same check, so it never cuts a paragraph at such a
  line — and trailing prose never attaches (`… } (see above)` is not a call).
  `func` is parsed as the `function` it stands for: as written, `func(x)` is
  already a complete call, which is why the inline form used to abort the build
  with a SyntaxError on any `func(` in prose, and had never run at all. With the
  switch off, the refusal claims the whole function, body included. Return
  values follow the exported-function convention: a string or number as it
  stands, `{inline}`/`{block}` lexed as markdown, null/undefined → nothing.
  Fixtures: `tests/features/scripting/` (`func`, `function-block`).
- Suite: `tests/note-code/run.sh` (gating; in run-all.sh) — every construct
  prints a sentinel when it runs; off, none may appear and each is refused by
  name (HTML and LaTeX); on, every one must appear.

### Extension registration order matters
Inline extensions registered **later** are checked first in marked.js. The inline footnote extension is registered after `marked-footnote` for this reason. Document any ordering dependencies you introduce. The `@endnotes` placement extension is a **block** extension on the main parser only (like the footnote extensions), line-anchored so it never competes with the `@name`/`@begin` sigil forms.

### Block extension `start()` must only report positions its tokenizer can match
marked truncates the paragraph being built at the smallest index any block
`start()` returns, then retries tokenizers there — so a `start` that matches
where its own tokenizer can't (mid-line `::` in a code span, say) shreds the
paragraph one character at a time and hands the remainder to whichever
tokenizer mis-claims it (the old `` `::Note` ``-in-prose bug, fixed 2026-06).
Anchor block/container starts to line starts (`(?:^|\n)…`, returning the
post-newline index) and pre-check the tokenizer's real shape (see
`description-lists.js` and the directive `start` in `extended-directives.js`).
Inline starts may match anywhere — inline code spans are claimed before text is
cut — but an inline `start()` that reports a position its tokenizer then
declines still CUTS THE TEXT TOKEN there, and that matters wherever a
built-in tokenizer needs to see a run of text whole. GFM's url autolinker is
the one that bit: marked's text rule stops before `https?://` only if the cut
text still contains it, so a start at the `:` or a `/` of `http://` left the
URL as plain text. Two starts did exactly that (fixed 2026-10): `/italics/`
(every `/`) and the label-less inline `:` directive (every `:`). So for inline
starts too, report only positions where the tokenizer can match.

### `/italics/` flanking (`syntax-modifications.js`)
A slash inside a word, a path or a URL never opens or closes italics. The
rule, which Clew's live-edit scanner (`jmarkdown-scan.js`) mirrors:

- the **opening** `/` is not preceded by a letter, a digit, or any of
  `:` `/` `.` `~` (no preceding character — the start of a paragraph, link
  text, table cell or footnote — is a boundary, so it may open there);
- the **content** is one or more characters, none of them `/` `.` `?` `!`,
  except that the last may be `.` `?` or `!` (unchanged from before);
- the **closing** `/` is not followed by a letter, a digit or `/`.

"Letter" and "digit" are Unicode (`\p{L}`, `\p{N}`). As one pattern:
`(?<![\p{L}\p{N}:\/.~])\/([^\/.?!]+[.?!]?)\/(?![\p{L}\p{N}\/])` with the `u`
flag. `start()` searches for exactly that; the tokenizer matches it anchored and
reads the preceding character from the previous token's `raw` (its second
argument), which also backstops another extension's cut just before a `/`. So
`and/or`, `1/2/3`, `/usr/local/bin/`, `~/notes/`, `./src/`, `C:/Users/x/` and
every bare `http(s)://`/`ftp://` URL stay literal (the URLs now autolinked, as
plain GFM does — they never were before), while `/a phrase/`, `(/word/)`,
`/word/.`, `"/quoted/"`, `/a *b* c/` and italics in links, lists, table cells
and footnotes are unchanged. **Inherent limit:** a lone one-segment path with a
trailing slash (`see /tmp/ here`) is indistinguishable from `/italic/` and still
italicises. Fixtures: `tests/features/inline-syntax/` (`italics-flanking`,
`italics-contexts`, both with empty stderr goldens).

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
  - `citations.js` — the parse-time extensions. The inline `\cite`-family tokenizer claims each raw command **before** marked's inline rules can mangle the `[...]` args / `*` / keys (and never fires inside code spans, so literal examples are safe). The `@bibliography` block extension marks where a bibliography goes (`@bibliography{title="References" style="apa" scope="#sec" all}`); it's a dedicated block extension, not a labelled directive, because the directive framework requires trailing content so a bare marker wouldn't tokenize. It is deliberately shaped like `@endnotes` (line-anchored `@name` + optional `{title="…"}`) — the two placement markers should stay in step. `::Bibliography` remains accepted as a **silent legacy alias** (one branch in the opener regex, no warning, no `title`); it is no longer documented. `title` → `<h2 class="bibliography-title">` in HTML and `\renewcommand{\refname|\bibname}` in LaTeX (the class split comes from `isChapterClass()` in `sectioning.js` — the one place the class list lives); an empty bibliography drops its heading with it, and on the **runtime** path the marker emits nothing at all, so `title` is compile-time/LaTeX only.
  - `biblify-compile.js` — a cheerio post-pass (HTML only, called from `post-processor.js`) that is a faithful port of the runtime client: it indexes the `.bib`, resolves the placeholders with `citation-js` + CSL, and assembles bibliographies. The inline formatters (`generic_paren_processor`, `bjps_processor`) and Vancouver range-collapsing are ported from Biblify so output matches.

#### `\fullcite` renders inline (`span.fullcite`)
An inline `\fullcite{key}` lands wherever the author wrote it — usually
mid-paragraph — so on the compile-time HTML path its rendered entry is emitted as
**`<span class="csl-bib-body fullcite …">` wrapping `<span class="csl-entry">`**,
not citation-js's native `<div>`s (`retagAsSpans` in `biblify-compile.js` re-tags
the subtree in place; classes are untouched, so `.fullcite` / `.csl-entry` style
it). This is not cosmetic: an HTML parser closes an open `<p>` the moment it meets
a `<div>`, so the div form tore the paragraph in two and orphaned any prose after
the citation — no CSS could recover it, because the damage was done at parse time.
The **bibliography proper** (`renderBibliography`) keeps its `<div>`s, being a
block by nature, and so keeps the bundled `div.csl-bib-body` styling; the inline
form deliberately matches none of those rules. The `fullcite` class is the CSS
handle for the inline form. LaTeX is unaffected (`\bibentry` is already inline).
Fixture: `tests/features/citations/fullcite`. **The runtime Biblify client
(`../biblify/src/biblify.js`) still emits the div form** and has no `fullcite`
class — a matching change in that repo if the runtime path matters.

Output split: **LaTeX emits native natbib** — the `\cite` commands pass through verbatim (`\fullcite`→`\bibentry`) and `@bibliography` emits `\bibliographystyle`+`\bibliography`; real bibtex/biber does the work (author supplies `\usepackage{natbib}`, and `bibentry` if using `\fullcite`, in their surrounding document — LaTeX output is body-only). **HTML uses the CSL engine.** When `Resolve citations` is on, the runtime client scripts are suppressed (`{{^Biblify.resolve}}` in `default-template.html.mustache`).

#### Pandoc citation syntax (`pandoc-citations.js`)
A second notation for the same machinery, **off by default** (`Pandoc citations:
true`). The tokenizer resolves nothing: it **translates** to the natbib command and
hands it to `renderCiteCommand` (exported from `citations.js`), so LaTeX output,
the compile-time CSL pass and the runtime Biblify client all serve it with no
further work, and the two notations mix freely in one document.

| pandoc | → | command |
|---|---|---|
| `@key` | | `\citet{key}` |
| `@key [p. 33]` | | `\citet[p. 33]{key}` |
| `-@key` | | `\citeyear{key}` |
| `[@key]` | | `\citep{key}` |
| `[@key, p. 33]` | | `\citep[p. 33]{key}` |
| `[see @key, p. 33]` | | `\citep[see][p. 33]{key}` |
| `[-@key]` | | `\citeyearpar{key}` |
| `[@a; @b]` | | `\citep{a,b}` |
| `[see @a; @b, p. 33]` | | `\citep[see][p. 33]{a,b}` |
| `@{key}` | | braced key, either form |

- **Why opt-in:** `@` is the directive sigil. With this on, a bare `@word` that
  isn't a registered directive is read as a citation key — a real change to how an
  existing document reads. Same rationale (and same lazy config read at tokenize
  time) as `Smart typography`.
- **Directives always win.** `pandoc-citations` is registered *before* `atBlock`/
  `atInline`, and marked offers the most recently registered inline extension
  first, so a registered name is claimed as a directive; the tokenizer also
  declines any name in the block-environment registry (plus `begin`/`end`). The
  glued-`@` (email) and preceding-backslash guards mirror the directive tokenizer's.
- **`CITE_RE` gained `\citeyear`/`\citeyearpar`** (group 4 = `year`, group 5 =
  `t|par|p`; the indices in `biblify-compile.js` shifted accordingly). natbib has
  both natively, so LaTeX is free; the compile-time pass renders the year from the
  entry data (`issued`), as natbib does, rather than through the CSL template. Note
  the **runtime** Biblify client (`../biblify/src/parsing.js`) has its own copy of
  the grammar and does *not* know `\citeyear` — so `[-@key]` needs
  `Resolve citations: true` (or a matching update to Biblify) to render in HTML.
- **What doesn't translate:** natbib gives a group ONE prenote and ONE postnote,
  pandoc gives every item its own. A group with per-item locators
  (`[see @a, p. 1; also @b, p. 2]`) or a suppressed author mixed into a group is
  **claimed as literal text and warned about** — claimed, not declined, because
  declining would let the in-text form pick the keys out of it one at a time.
- Fixture: `tests/features/citations/pandoc-citations` (compile-time resolved, so
  the golden shows the real rendered citations).

#### `\citefile[…]{key}` — link to a reference's file on disk
An inline command (registered in `citations.js`, backed by `bib-attachments.js`)
that emits a link to the attachment recorded in the `.bib` entry — and **nothing
at all** when the entry has none, so it is safe to drop into prose. Unlike the
`\cite` family it is resolved at **build time in both formats**, whether or not
`Resolve citations` is on: a file path is a static fact with no CSL in it, so the
runtime Biblify client never sees it.

- **Syntax:** `\citefile{key}` · `\citefile[file=2]{key}` ·
  `\citefile[text="the preprint"]{key}` · `\citefile[file=2, text="…"]{key}` ·
  `\citefile[2]{key}` (bare-number shorthand for `file=`). The optional argument is
  **LaTeX keyval** — comma-separated, values optionally quoted with straight *or
  curly* quotes — not the `{…}` attribute syntax used elsewhere. Default link text
  is the file's basename.
- **BibDesk numbering is sparse.** It doesn't renumber when an attachment is
  removed, so an entry's only attachment is routinely `Bdsk-File-2` with no
  `-1` (true of every attachment in the author's own bibliography). Attachments
  are collapsed to a **dense list in ascending field order**, and `file=n` indexes
  that — `file=1` is the first attachment present, whatever it is numbered.
- **Path resolution**, first hit wins: the plist's `relativePath` against the
  `.bib`'s own directory (right when `Bibliography` points at the live BibDesk
  file), then the bookmark's path components — which is what rescues a `.bib` that
  has been *copied* away from the tree its relative paths were written against.
  The bookmark records the volume's components after the file's own, so the
  candidates are tried longest-first with `fs.existsSync` as the oracle rather than
  reverse-engineering its table of contents.
- **A recorded-but-missing file still emits its link**, plus a build warning — a
  visible broken link beats a silent omission. An unknown key, an out-of-range
  index, or no `Bibliography` at all emit nothing and warn.
- **The two formats encode the path differently, deliberately.** HTML gets a
  percent-encoded `file://` URL (what a browser needs). LaTeX must NOT: hyperref
  turns a `file:`/`run:` target into a PDF *file action* whose `/F` is a **path**,
  where `%20` would be taken literally — raw spaces are correct and compile
  cleanly. A `.pdf` uses `file://` (hyperref emits `/GoToR`, so the viewer opens it
  as a document); anything else uses `run:` (`/Launch`, handing the file to its
  application). Only `%` and `#` are escaped, for TeX itself.
- Fixtures: `tests/features/citations/citefile` covers the deterministic
  emits-nothing cases; the resolved-path cases can't be goldens (the absolute path
  depends on the checkout location), so they live in **`tests/citefile/run.sh`** — a
  self-checking suite that builds in a temp directory and asserts against paths it
  computes at run time. It is wired into `tests/run-all.sh` as a gating suite.

Metadata keys (all `Capitalised Words With Spaces`): `Bibliography` (path), `Bibliography style` (apa/harvard1/vancouver/bjps/chicago/ajp/econometrica/ergo, or a custom `foo.csl`), `Resolve citations`, `Citation tooltips`, `Minimal bibliography` (writes `<out>.cited.bib`), `LaTeX bib style` (natbib `.bst`). Bundled CSL files live in `src/csl/`. `citation-js` is a dependency, loaded via `createRequire` (it's CJS; `require('citation-js')` returns the `Cite` constructor with `Cite.plugins` static). Vancouver is a whole-document mode; per-section style switching and scoped/sectional bibliographies are HTML-only. Fixtures: `tests/features/citations/` (`bibliography`, `legacy-alias`) — they **must** pin `Bibliography style` in the header, since a global `~/.jmarkdown/config.json` can otherwise supply a machine-specific default and make the goldens non-reproducible. `docs/bibliographic-support.jmd` is deliberately **excluded** from docs-snapshots (external BibTeX), so those fixtures are the only automated cover.

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

`--to latex` emits a complete, compilable document. Document assembly and metadata
keys, the usage-driven preamble manager, cross-references and counters, and the
remaining pipeline work: the **`jmarkdown-latex-pipeline`** skill
(`.claude/skills/jmarkdown-latex-pipeline/`).

## Future feature: `:::grid`

Reuse the headerless-table tokenizer to parse pipe-delimited cells (`||` = column span, `^` = row span), but emit CSS grid `<div>`s instead of `<table>`. Container attributes like `{columns="..." gap="..."}` feed `grid-template-columns` and `gap`.
