# CLAUDE.md

Guidance for Claude Code working in the **JMarkdown** repository.

## Project at a glance

JMarkdown is a Node.js Markdown authoring system built on **marked.js v16**. A single `.md` source produces either polished **HTML** for the web or **LaTeX** for print. The flagship use case is the book *The Rise of Computational Philosophy* (Knuth-style literate authoring from one source of truth).

- **Language:** JavaScript (ES modules — `"type": "module"` in `package.json`).
- **Entry point:** `src/index.js`, exposed as the `jmarkdown` binary via the `bin` field.
- **CLI:** `jmarkdown process <file.md> [--to html|latex] [--fragment] [-n]`, plus `jmarkdown init` and `jmarkdown options`.
- **No build step.** Source runs directly under Node. No test suite at present (`npm test` is a placeholder).

## Repository layout

All source lives in `src/`. Key files:

| File | Role |
|---|---|
| `index.js` | CLI entry, extension registration, pipeline orchestration |
| `utils.js` | Shared `marked` / `marked_copy` instances, `registerExtension(s)`, `registerDirectives`, `runInThisContext` |
| `config-manager.js` | Configuration loading/merging; central state bus (`configManager.get/set`) |
| `metadata-header.js` | YAML-like metadata header parsing; dynamic loading of extensions/directives/JS |
| `extended-directives.js` | The `createDirectives` factory (the canonical pattern for new directives) |
| `additional-directives.js` | Project directives, including `:TeX`, `:HTML`, `:::TeX`, `:::HTML` |
| `syntax-modifications.js` | Inline syntax: `/italics/`, `*strong*`, `==highlight==`, `__underline__`, sub/sup |
| `syntax-enhancements.js` | Further inline/block syntax |
| `script-blocks.js` | `<script type="jmarkdown">` and `jmarkdown-postprocess` blocks |
| `function-extensions.js` | Acorn-based inline JS expression parsing; `export_to_jmarkdown` |
| `source-positions.js` | Stamps `data-source-line` attributes for Cmd+click inverse search to Sublime Text |
| `post-processor.js` | Cheerio DOM manipulation, cross-reference resolution, beautification |
| `latex-renderer.js` | LaTeX renderer for marked's built-in tokens (active development) |
| `inline-footnotes.js` | `[^label: body]` syntax with multi-paragraph support |
| `tikz.js`, `mermaid.js`, `mathematica.js` | Diagram / computation directives |
| `strategic-form-games.js` | Game-theoretic payoff matrix directive |
| `marked-extended-tables-headerless.js` | Custom table tokenizer (also the seed for the future `:::grid` directive) |

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
- **Registry:** `registerBlockEnvironment(name, handler)` (from `begin-end-core.js`) maps a name to a handler the renderer consults before the generic fallback. A handler is `{ mode?, tokenize?, html, latex?, render? }` — `mode` is `'markdown'` (default) · `'verbatim'` · `'custom'` (gets a `tokenize(body, token)` hook with lexer access); `html` is the one required renderer, `latex` (or any other format key) is optional and additive, `render` is a format-independent alternative. Output dispatch is one latex-free line: `handler[format] || handler.html || handler.render`, with `format` from the injected `getFormat()` (default `'html'`). A handler with only `html` therefore renders its HTML in LaTeX mode too — which is exactly the legacy abstract/feedback behaviour. The handler-level `mode` answers the old "content modes" question; `ctx.attrs` is an `attributes-parser` result in both routes, so `attrs?.include` works identically. The registry is module-level, so any module registers independently of where the extension is built.
- **Parity:** four names mirror existing directives exactly, so `@begin(x)` ≡ `:::x`: `abstract`, `feedback`, `TeX` (verbatim, LaTeX-only), `HTML` (markdown, HTML-only). They are **registered from `begin-end.js`** (the JMarkdown layer); `abstract`/`feedback` reuse the render bodies exported from `additional-directives.js` (no drift) and have no `latex` (so they emit HTML in both formats, as before); `TeX`/`HTML` are expressed as split `html`/`latex` renderers.
- **comment / optionals parity:** `createMultilevelOptionals` (`metadata-header.js`) registers each optional name (including `comment`) into the registry alongside its `:::` directive, so `@begin(comment)` honours the same include/exclude rule and **hides by default** — closing the footgun where it would otherwise fall through to the generic renderer and *show* a private note. HTML is a bare passthrough of the parsed body; LaTeX restores a trailing block separator (the core trims `ctx.inner`, fine for wrapped envs but not for this passthrough).
- **game parity:** `strategic-form-games.js` registers `@begin(game)` as a `mode:'custom'` handler that **reuses the `:::game` directive's own tokenizer and renderer verbatim** (same functions, the strongest no-drift form). The `tokenize` hook normalises the body to container shape (`'\n' + body.replace(/\n+$/, '')`) so the tokenizer sees byte-identical input to `:::game`, and sets `token.meta.name`; the renderer is called with the active parser as `this` and already branches on `global.isLatex`, so one format-independent `render` covers both outputs. `@begin(game)` output is byte-identical to `:::game` (verified for labels and `{math=all}`).
- **User-defined environments (script blocks):** `global.defineEnvironment` (= the core's `registerBlockEnvironment`, exposed in `index.js` like `export_to_jmarkdown`) lets an author define an environment from a `<script data-type="jmarkdown">` block: `defineEnvironment('callout', { html: (ctx) => …, latex: (ctx) => … })`. The callback receives the full `ctx`, so `ctx.text` (the `[label]`) and `ctx.attrs` (the `{attributes}`, an ergonomic `attributes-parser` object — `ctx.attrs?.kind`, numbers coerced) are available alongside `ctx.inner`. **Define before use** (script above the `@begin`), since the tokenizer reads `mode` while lexing. Fixture: `script-env.jmd`.
- **User-defined environments (from a file):** the metadata key `Load environments:` mirrors `Load directives` / `Load extensions` — `Load environments: warning, theorem from envs.js` (named exports are handlers, registered under their export name) or `Load environments: envs.js` (the default export is a `{ name: handler }` map). Resolves against the markdown file's directory. Config-level parity: an `Environments` config key (default `[]`) consumed by `configManager.loadEnvironments()` from `index.js`, taking absolute paths. Both routes call `registerBlockEnvironment` via `loadEnvironments` / `loadEnvironmentsFromSpec` in `metadata-header.js`. Fixtures: `file-env.jmd` + `file-env-defs.js`.
- **Nesting:** arbitrarily deep. Same-name nesting is depth-counted in the tokenizer; differently-named nesting is free (inner block is re-lexed as markdown). **Nested blocks may be indented** for readability in any style, or not at all — `@begin`/`@end` are matched at any leading whitespace (no consistent-indent requirement), and each block dedents its own body before processing (relative indentation, e.g. inside a code fence, is preserved). An orphan opener (no `@end`) is emitted literally with a stderr warning — it never swallows the document or throws.
- **Registration:** `index.js` imports the configured `beginEnd` from `begin-end.js` and does `marked.use({ extensions: [beginEnd] })`. Because `@` is an unused sigil, nothing competes for `@begin(...)`, so — unlike the `:::` directives — its registration order doesn't matter.
- **Generic LaTeX & orphans:** the JMarkdown layer supplies the generic `\begin{name}[label]…\end{name}` fallback and the LaTeX form of an orphan opener via `createBeginEnd`'s `fallback`/`orphan` options (merged over the core's HTML defaults). The `Block elements` policy is injected via the `blockElements` option reading `configManager`.
- Fixtures: `tests/features/begin-end/`.

### Extension registration order matters
Inline extensions registered **later** are checked first in marked.js. The inline footnote extension is registered after `marked-footnote` for this reason. Document any ordering dependencies you introduce.

### `runInThisContext`
Script blocks, function extensions, and post-processor scripts share a single VM context (`runInThisContext` from Node's `vm` module, re-exported via `utils.js`). Anything assigned to `global.*` is visible everywhere downstream.

### Fragment mode
`--fragment` outputs headerless HTML with no `data-source-line` injection; cheerio runs with `isDocument: false`. Note: `moveBodyStylesToHead` has a special case here to avoid silently dropping `<style>` tags.

### File inclusion
`[[name.md]]` on a line by itself splices the contents of `name.md` into the source before parsing. Relative paths resolve against the directory of the **including** file (not cwd), so includes work regardless of where `jmarkdown` is invoked from. Includes are recursive; cycle detection rejects only active-chain cycles (A→B→A), so the same file may be reused at multiple independent sites. Tokens inside fenced code blocks and `$$…$$` math are left literal. (4-space-indent code blocks are disabled in JMarkdown — see `src/index.js:312` — so an indented include directive still expands.) Included files are not re-parsed for metadata.

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

- `crossrefs` module-level state never resets between runs.
- Dead code after returns in the Mathematica renderer.

## Active LaTeX-pipeline work

- `:::print` / `:::web` conditional directives.
- Raw HTML suppression in LaTeX mode.
- Math passthrough in LaTeX mode.
- Tables now emit LaTeX `tabular` via `marked-extended-tables-headerless`'s renderers (both `spanTable` and `headerlessTable` branch on `global.isLatex`). Supports alignment, percentage widths (mapped to `p{X\textwidth}`), `\multicolumn` for colspan and `\multirow` for rowspan. Requires `\usepackage{multirow}` in the preamble. The `table()` method on `latex-renderer.js` is a real fallback path — marked's built-in GFM table tokenizer accepts some malformed tables (e.g. rows without trailing pipes) that the extensions reject.
- Tables don't break across pages: `tabular` is fixed-height in LaTeX. Long tables in book chapters will need `longtable` or `tabularx`; defer until a real chapter forces the requirement.
- The `:::game` directive (`strategic-form-games.js`) emits the `sgame` package's `game` environment in LaTeX mode (`renderGameLatex` branches on `global.isLatex`). The jmarkdown game syntax was designed to mirror sgame, so translation is mechanical. Requires `\usepackage{sgame}` in the preamble. sgame's optional arguments are positional: a lone `[...]` is the game label/caption, a `[...][...]` pair is the two player labels, and all three are `[row][column][caption]` — so a caption alongside player labels fills all three slots with an empty `[]` for any missing player label. Payoffs are wrapped in `$…$` (sgame's default is `\gamemathfalse`). Note `sgame` is incompatible with the `memoir` class, `tabularx`, `array.sty` (and anything loading it, e.g. `colortbl`, `jurabib`); use `sgamevar` for `beamer`.
- Consider disabling marked's built-in GFM table tokenizer so the `marked-extended-tables-headerless` extensions are the sole table path. This would enforce one canonical jmarkdown table syntax (rows must have leading and trailing `|`) instead of also accepting GFM's looser leading-pipe-only form, and would let us delete the `table()` fallback in `latex-renderer.js` entirely. Pre-flight check before flipping: grep the book and `docs/` for tables that use the looser form (rows without trailing pipes) so existing authors aren't broken.
- Multi-file cross-refs: two-pass with `crossrefs.json` and `chapter-slug:key` syntax; `heading-base` metadata to map `#` → `\chapter` / `\section` / etc.

## Future feature: `:::grid`

Reuse the headerless-table tokenizer to parse pipe-delimited cells (`||` = column span, `^` = row span), but emit CSS grid `<div>`s instead of `<table>`. Container attributes like `{columns="..." gap="..."}` feed `grid-template-columns` and `gap`.
