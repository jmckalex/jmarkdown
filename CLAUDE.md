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
An alternative to the colon-counted container directives, in `src/begin-end.js`. Because the closer *names* what it closes, blocks nest by name — no colon counting, and no renumbering when you wrap or insert a block. Purely **additive**: the `:::name … :::` directives are unchanged. The `@` sigil follows texinfo's `@example … @end example` convention and is otherwise unused in JMarkdown.

- **Syntax:** `@begin(name)[label]{attrs}` — `()` = name, `[]` = optional text/label, `{}` = attributes (parsed with `attributes-parser`, same as directives). Closer is bare `@end(name)` (name required, no args).
- **Generic rendering, any name:** LaTeX is always `\begin{name}[label]…\end{name}`. HTML renders the name as either `<div class="name">` or a custom element `<name>`: a name **without** a hyphen → `div.class`, **with** a hyphen → custom element (matching the HTML spec, where a valid custom-element name must contain a hyphen). Override per block — `@begin(.name)` forces a class, `@begin(<name>)` forces an element — or document-wide via the `Block elements` metadata/config key (`hyphenated` default · `all` · `none`; per-block sigils win). In div mode the name merges into any author `class`. The author supplies the matching CSS / `\newenvironment`; JMarkdown invents no meaning for the name.
- **Parity:** four names mirror existing directives exactly, so `@begin(x)` ≡ `:::x`: `abstract`, `feedback`, `TeX` (verbatim, LaTeX-only), `HTML` (markdown, HTML-only). Their render bodies are exported from `additional-directives.js` and shared by both routes (no drift).
- **Nesting:** arbitrarily deep. Same-name nesting is depth-counted in the tokenizer; differently-named nesting is free (inner block is re-lexed as markdown). **Nested blocks may be indented** for readability in any style, or not at all — `@begin`/`@end` are matched at any leading whitespace (no consistent-indent requirement), and each block dedents its own body before processing (relative indentation, e.g. inside a code fence, is preserved). An orphan opener (no `@end`) is emitted literally with a stderr warning — it never swallows the document or throws.
- **Registration:** a block extension registered in `index.js`. Because `@` is an unused sigil, nothing competes for `@begin(...)`, so — unlike the `:::` directives — its registration order doesn't matter.
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
