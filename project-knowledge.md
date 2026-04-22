# JMarkdown — Project Knowledge

## Overview

JMarkdown is a full-featured Markdown authoring system built on **marked.js** (v16). It extends standard Markdown with custom syntax, a generalised directive framework, inline JavaScript computation, script block execution, TiKZ diagram integration, MathJax, bibliography handling (Biblify), cross-references, file inclusions, Mermaid diagrams, game-theoretic payoff matrices, and multiple output modes.

Jason (J. McKenzie Alexander) is the sole developer. The current flagship use case is a book project called *The Rise of Computational Philosophy*, which uses JMarkdown as a single source of truth to generate both a print version (via LaTeX) and an interactive website — a Knuth-style literate authoring approach.

**Repository structure:** All source files live in a `src/` directory. The CLI entry point is `src/index.js`, invoked as `jmarkdown` via the `bin` field in `package.json`.

## Architecture and Pipeline

### Processing pipeline (in order)

1. **CLI parsing** — Commander.js processes options (`--normal-syntax`, `--fragment`, `--to <format>`)
2. **Configuration** — `configManager` loads `config.json` files (local and global), merges defaults
3. **Extension registration** — All extensions and directives registered on both `marked` and `marked_copy` instances
4. **YAML metadata header** — Parsed and stripped; may trigger loading of additional extensions/directives/JavaScript
5. **File inclusions** — `processFileInclusions()` expands include directives
6. **Footnote preprocessing** — `preprocessFootnotes()` extracts multi-paragraph inline footnotes
7. **Source position tracking** — (HTML only, non-fragment) Stamps `data-source-line` attributes for inverse search
8. **`{-}` heading stripping** — (HTML fragment mode) Strips `{-}` suffix and adds `unnumbered` class
9. **LaTeX renderer installation** — (LaTeX only) `marked.use({ renderer: latexRenderer })`
10. **`marked.parse()`** — The main parse/render pass
11. **Output divergence:**
    - **LaTeX:** write `.tex` directly (no post-processing)
    - **HTML:** append footnotes section → post-process with cheerio → template wrapping → inverse search script → beautify → write `.html`

### Dual marked instances

- **`marked`** — The primary instance, used for the main document parse. Has all extensions, directives, footnotes, source positions, etc.
- **`marked_copy`** — A secondary instance for parsing markdown from within `<script>` blocks or function extensions. Has most extensions but NOT footnotes, script blocks, or source positions (to avoid state contamination).

`registerExtension()` and `registerExtensions()` in `utils.js` install on both instances. Some extensions are deliberately installed only on `marked` (footnotes, script blocks, TiKZ, Mathematica, markdown-demo).

### Output format flag

`global.isLatex` is set at startup based on the `--to` CLI option. Extension renderers check this flag to decide between HTML and LaTeX output. The LaTeX renderer for built-in tokens is installed separately via `marked.use({ renderer: latexRenderer })`.

## CLI Options

```
jmarkdown process <filename>           # Process a .jmd file (default command)
  -n, --normal-syntax                  # Disable /italics/ and *bold* syntax modifications
  --fragment                           # Output HTML fragment (no template wrapper)
  --to <format>                        # Output format: html (default) or latex

jmarkdown init                         # Initialise a new project
  -f, --file <filename>                # Create skeleton file from template
  -t, --title [title]                  # Title for new file
  -m, --makefile [key]                 # Include Makefile template
  -p, --print                          # Copy puppeteer PDF export files

jmarkdown options                      # Show default configuration
```

## Module Reference

### Core

| File | Role |
|---|---|
| `index.js` | CLI entry point, extension registration, pipeline orchestration, output format branching |
| `utils.js` | Shared utilities: `marked`/`marked_copy` instances, `registerExtension()`, `registerExtensions()`, `registerDirectives()`, `createTOC()`, `runInThisContext` |
| `config-manager.js` | Configuration loading/merging from `config.json` files and metadata headers. Central state bus (`configManager.get()`/`.set()`) |
| `metadata-header.js` | YAML-like metadata header parsing. Triggers dynamic loading of extensions/directives/JavaScript. Exports `metadata`, `header_length`, `processYAMLheader()`, `createMultilevelOptionals()` |
| `html-template.js` | Mustache template rendering for HTML output. Handles default and custom templates, Biblify configuration injection |
| `post-processor.js` | Cheerio-based HTML post-processing: marker span removal, numeric headings, cross-reference resolution, source-target replacement, style hoisting |

### Syntax Modifications (custom inline syntax)

File: `syntax-modifications.js`

These REPLACE standard Markdown syntax (disabled with `--normal-syntax`):

| Extension | Syntax | HTML | LaTeX |
|---|---|---|---|
| italics | `/text/` | `<em>` | `\emph{}` |
| strong | `*text*` | `<strong>` | `\textbf{}` |
| highlight | `==text==` | `<span class='highlight'>` | `\hl{}` |
| intense | `**text**` | `<span class='intense'>` | `\textbf{\emph{}}` |
| underline | `__text__` | `<span class='underline'>` | `\underline{}` |
| subscript | `_x` or `_{text}` | `<sub>` | `\textsubscript{}` |
| superscript | `^x` or `^{text}` | `<sup>` | `\textsuperscript{}` |

**Important:** Extension registration order matters in marked.js — later-registered extensions are tested first. The `wrapRendererWithSourceLine()` wrapper is applied to these extensions for inverse search (skipped in fragment mode and LaTeX output).

**Known bug:** The `strong` extension's `start()` checks for `/` instead of `*`.

### Syntax Enhancements (additive, don't replace standard syntax)

File: `syntax-enhancements.js`

| Extension | Purpose |
|---|---|
| `latex` | Passes MathJax delimiters (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`) through untouched, escaping `<`/`>` for HTML |
| `moustache` | Preserves `{{...}}` Mustache template syntax from being parsed as markdown |
| `descriptionLists` | Definition list syntax (`term:: definition`) — imported from `description-lists.js` |
| `emojis` | `:emoji_name:` syntax, data from `emoji-data.json` |
| `classAndId` | `{.class #id}` attribute syntax for elements. Regex requires `{.` or `{#` opening — does NOT match `{-}` |
| `rightAlign` / `centerAlign` | `->text<-` and `>>text<<` alignment syntax |

### Directive Framework

File: `extended-directives.js`

The `createDirectives()` factory creates marked extensions from directive configuration objects. Three levels:

- **Container** (`:::`): Block-level, can contain other markdown. Pattern: `:::content\n:::`
- **Block** (`::`): Block-level, single element
- **Inline** (`:`): Inline-level

Directives support labels, custom tags, custom tokenizers, and custom renderers. The framework uses `seedrandom/lib/alea.js` to generate unique type IDs from marker strings.

Multi-level directives (3–8 colons) are registered for nesting support.

### Directives Registered

| Directive | File | Purpose |
|---|---|---|
| Standard (`:::`, `::`, `:`) | `extended-directives.js` | Generic div/span wrappers with attributes |
| Additional directives | `additional-directives.js` | Custom directives including `titleBox` |
| Mermaid | `mermaid.js` | `:::mermaid` diagrams |
| TiKZ | `tikz.js` | `:::tikz` LaTeX diagrams with content-addressed caching |
| Mathematica | `mathematica.js` | `:::mathematica` computation (Wolfram Engine) |
| Sources/Targets | `sources-and-targets.js` | Content reuse system |
| Markdown Demo | `markdown-demo.js` | Side-by-side source/rendered display |
| Strategic Form Games | `strategic-form-games.js` | Game-theoretic payoff matrices |
| Comments | Created via `createMultilevelOptionals('comment', false)` | Content suppression |

### Script System

| File | Purpose |
|---|---|
| `script-blocks.js` | `<script type="text/javascript">` and `<script type="text/jmarkdown">` blocks. JavaScript blocks execute in shared `runInThisContext` context. JMarkdown blocks are parsed by `marked_copy` |
| `function-extensions.js` | Acorn-based expression boundary detection for inline JavaScript. `export_to_jmarkdown` creates marked extensions from JavaScript functions |
| `inline-function-extension.js` | Block and inline function call syntax |

### Cross-references and Navigation

| File | Purpose |
|---|---|
| `anchors.js` | Anchor/target syntax (`⚓️key` → `<span id='key'>`) |
| `sources-and-targets.js` | Content reuse: define content once (`:::target`), reference it elsewhere (`:::source`). Post-processor replaces targets with sources. Also `🎯key` inline target syntax |
| `post-processor.js` | Cross-reference resolution (`process_crossrefs`): `xref-label` elements define reference points with `data-key`, `xref-ref` elements get filled with corresponding numbers. Uses `crossrefs.json` and `chapter-slug:key` syntax for multi-file cross-references. Entirely HTML DOM-based (cheerio). For LaTeX, would need `\label{key}`/`\ref{key}` instead |

### File Handling

| File | Purpose |
|---|---|
| `file-inclusion.js` | `processFileInclusions()` — expands file include directives before parsing |
| `source-positions.js` | Two-phase token annotation system for inverse search. Stamps `data-source-line` attributes. Custom replacement for `marked-token-position` (which doesn't work with dynamically generated tokens). The `searchFrom` constraint in Phase 2 prevents dynamic content from falsely matching its definition site |

### LaTeX Output (on feature branch)

| File | Purpose |
|---|---|
| `latex-renderer.js` | Renderer object for built-in marked tokens. Installed via `marked.use({ renderer })` when `--to latex`. Handles `{-}` suffix for unnumbered headings (`\chapter*` etc.) |
| `inline-footnotes.js` | Complete inline footnote system: context-aware bracket scanner, preprocessing with body extraction/dedenting, block-level tokenization for multi-paragraph footnotes, HTML collection |

#### `latex-renderer.js` token coverage

| Token | LaTeX output |
|---|---|
| paragraph | `content\n\n` |
| heading | `\chapter` / `\section` / `\subsection` etc. (depth 1–6). `{-}` suffix → starred form |
| strong / em | `\textbf` / `\emph` |
| codespan | `\texttt` (planned: switch to `\mintinline`) |
| code (block) | `verbatim` environment (planned: switch to `minted`) |
| link | `\href{url}{text}` |
| image | `figure` + `\includegraphics` + `\caption` |
| blockquote | `quote` environment (body trimmed to avoid trailing blank line) |
| list / listitem | `itemize` / `enumerate` + `\item` |
| table | `tabular` with `\hline` (note: only catches standard marked table tokens, NOT custom tables extension) |
| hr | `\rule{\textwidth}{0.4pt}` with `\bigskip` |
| br | `\\` |
| text | passthrough (with recursive `parseInline` for sub-tokens) |
| html | **NOT YET HANDLED** — raw HTML leaks into `.tex` |

#### What's NOT yet converted to LaTeX

These extensions still emit HTML into `.tex` output:

- Raw HTML blocks (`<style>`, `<script>`, `<div>`)
- Custom tables (`marked-extended-tables-headerless.js` — has own renderer)
- Math passthrough (`latex` extension escapes `<`/`>` for HTML, should pass through untouched for LaTeX)
- Footnotes via `marked-footnote` (the old split-definition syntax)
- All directives (`:::web`, `:::print`, mermaid, TiKZ, markdown-demo, titleBox, etc.)
- Anchors, editor tags, alerts, emojis, script blocks, function extensions
- Description lists, `classAndId`, `rightAlign`/`centerAlign`
- Strategic form games, Mathematica, Biblify, cross-references, TOC

### Other

| File | Purpose |
|---|---|
| `init.js` | Project initialisation (`jmarkdown init`), file/Makefile template generation |
| `print.js` | Puppeteer-based HTML→PDF conversion (separate `package-print.json`) |
| `editor-tag.js` | Editor tag handling |
| `mathjs-extension.js` | Math.js integration for computation |
| `marked-extended-tables-headerless.js` | Custom tables extension (ESM export). Has own HTML renderer — does NOT produce standard marked table tokens. Supports colspan, rowspan, alignment, column widths, headerless tables. Also serves as base tokenizer for future `:::grid` directive |
| `jmarkdown.css` | Default stylesheet |
| `default-template.html.mustache` | Default HTML template |
| `Biblify_js.mustache` | Biblify JavaScript configuration template |
| `custom-element_html.mustache` | Custom element template |
| `Makefile.mustache` | Makefile template for project init |
| `default-config.json` | Default configuration values |
| `emoji-data.json` | Emoji name→character mapping |

## Inline Footnotes System

### Syntax

```markdown
Single paragraph:
Text with a footnote.[^1: The footnote body goes here.] And continues.

Multi-paragraph (indentation signals continuation):
Text with a footnote.[^1: First paragraph of the footnote.

  Second paragraph, indented to match the first continuation line.

  Third paragraph.] And continues.

With block content (lists, definition lists, etc.):
Text.[^1: A footnote with a list:

  - item one
  - item two
  - item three

  And a concluding paragraph.]
```

### Architecture

**Context-aware bracket scanner** (`findClosingBracket`):
- Finds the matching `]` for an opening `[`
- Ignores brackets inside: `$...$` (inline math), `$$...$$` (display math), `` `...` `` (code spans), `\[`/`\]` (escaped)
- Shared by preprocessor and tokenizer
- Successfully handles adversarial cases like `$a[[120]]] + b[[[130]$`

**Preprocessor** (`preprocessFootnotes`):
- Runs after `processFileInclusions()`, before `marked.parse()`
- Multi-paragraph footnotes (containing blank lines) are extracted:
  - Body dedented by the footnote's base indent level (preserving deeper indentation for nested constructs)
  - Stored in `footnoteStore` Map keyed by label
  - Original `[^label: ...]` replaced with Unicode marker (`\uFDD0FN:label\uFDD1`)
- Single-paragraph footnotes left in place for the inline extension

**Inline extension** (`inlineFootnote`):
- Two tokenizer paths:
  - Marker match → looks up stored body, calls `this.lexer.blockTokens()` (block-level: lists, definition lists, paragraphs)
  - Inline `[^label: body]` → bracket-scans for `]`, calls `this.lexer.inline()` (inline-level)
- Coexists with `marked-footnote` (different syntax: colon inside vs outside brackets)
- Important: all tokenization happens in the tokenizer (where `this.lexer.inline()` / `this.lexer.blockTokens()` are available), NOT the renderer (where they aren't — `this.parser.lexer.lexInline()` doesn't exist in marked v16)

**Rendering:**
- LaTeX: `\footnote{content}` with AUCTeX-style indent preservation (indent detected from first continuation line, stored on token, used when joining multi-paragraph output)
- HTML: superscript references + collected `<section class="footnotes">` appended after `marked.parse()`

## Unnumbered Headings

Syntax: `# Preface {-}` — the `{-}` suffix signals an unnumbered heading.

- **LaTeX:** stripped from content, heading emitted with starred form (`\chapter*{Preface}`)
- **HTML (full mode):** stripped from rendered text, `unnumbered` class added to the `<h1>` tag
- **HTML (fragment mode):** same stripping and class addition via separate renderer installation

The `classAndId` extension does NOT interfere because its regex requires `{.` or `{#` as opening characters. `{-}` passes through as literal text.

Future: the `add_labels_to_headers` post-processor should check for `.unnumbered` class and skip numbering those headings.

## Configuration System

`configManager` loads configuration from multiple sources (in priority order):
1. `~/.config/jmarkdown/config.json` (global)
2. `./config.json` (project-level)
3. Metadata header in the `.jmd` file (highest priority)

Key configuration fields: `Template`, `CSS`, `Biblify activate`, `Bibliography`, `Bibliography style`, `HTML header`, `HTML footer`, `LaTeX preamble`, `Highlight theme`, `Headings`, `MathJax`, `Fontawesome`, `Mermaid`, `Load directives`, `Load extensions`, `Load javascript`, `Optionals`, `Custom element`.

## The Book Project: *The Rise of Computational Philosophy*

- Single source of truth: `.jmd` files generate both HTML (interactive website) and LaTeX (print book)
- Uses `:::web`/`:::print` conditional directives for format-specific content
- `heading-base` metadata field maps `#` to `\chapter`/`\section` etc. depending on whether a file is a chapter or a section
- Multi-file cross-reference system using `crossrefs.json` and `chapter-slug:key` syntax
- Biblify handles citations natively via `\cite{}` syntax (works in browser with no special handling)
- Documentation site uses `wa-page` shell with `<wa-include>` and `<wa-tree>` sidebar (Web Awesome components)

### Target typography

- **HTML:** Crimson Pro (text), monospace code font
- **LaTeX (XeLaTeX):** Crimson Pro (text, via fontspec), Garamond Math (math, via unicode-math), JetBrains Mono with ligatures (code, via fontspec with `Contextuals=Alternate`)
- **Code highlighting:** minted (Pygments-based, requires `-shell-escape`)

## Known Bugs (not yet fixed)

1. `crossrefs` module-level state never resets between runs
2. `strong` extension `start()` checks `/` instead of `*`
3. `mermaid.js` only removes the first newline
4. `Biblify.template` TypeError on custom CSL styles
5. `mathjs` tokenizer never returns its token (dead feature)
6. Duplicate `Highlight theme` key in `DEFAULT_CONFIG`
7. `script-blocks.js` captures wrong regex group
8. `init.js` calls `.toUpperCase()` on an array (crash on short filenames)
9. Duplicate markdown-demo marker levels (6 and 7 colon both map to `:::::::`)
10. `split("from")` word boundary bug in directive/extension loading
11. Typo `"Extention"` in `loadExtensions`
12. Dead code after return statements in Mathematica renderer

## Key Design Decisions and Rationale

**Approach A for LaTeX output (format-aware renderers):** Each extension's renderer checks a global flag and returns the appropriate output. Chosen over walking the token tree separately (Approach B) because the tokenizer/lexer side is shared — only rendering diverges. Marked's architecture supports late-binding renderer overrides via `marked.use()`.

**Option 1 for extension renderers (inline dispatch):** Each renderer has an `if (global.isLatex)` branch. Chosen over a centralised renderer map (Option 2) because at the current scale (~7 inline extensions + built-in overrides), the inline branch is perfectly readable and keeps both renderings visible side by side. Refactor to Option 2 if a third output format ever materialises.

**`@begin`/`@end` block syntax rejected:** Nesting promotion/demotion solved via a Sublime Text plugin instead, keeping document syntax lightweight.

**`marked-token-position` abandoned:** JMarkdown's dynamically generated tokens lack the `raw` property it requires. Replaced with custom two-phase token annotation in `source-positions.js`.

**Inline footnotes over split-definition:** `[^label: body]` syntax (colon inside brackets) maps directly to `\footnote{}` for LaTeX. Multi-paragraph bodies use indentation as continuation signal. Context-aware bracket scanner handles math/code with brackets inside footnotes. Block-level tokenization enables lists and definition lists inside footnotes.

**Preprocessing for multi-paragraph footnotes:** Necessary because marked's block tokenizer splits on blank lines before inline extensions see the text. Preprocessor extracts body, dedents (preserving deeper indentation for nested constructs), stores in map, replaces with Unicode marker. The extract-and-dedent approach was chosen over a sentinel-collapsing approach because it enables block-level tokenization of the footnote body.

**Unnumbered headings via `{-}` suffix:** Pandoc convention adopted because the `classAndId` extension's regex naturally doesn't match `{-}`, so it passes through as literal text. The heading renderer strips it and emits `\command*{}`. Simpler than extending `classAndId` to recognise new syntax.

**Minted over lstlistings:** Minted uses Pygments for far superior syntax highlighting — more languages, better tokenisation, professional themes. The `-shell-escape` requirement is acceptable since the Mathematica extension already requires external tool invocations.

**Garamond Math for XeLaTeX:** Best `unicode-math` pairing for Crimson Pro because both fonts share garalde/oldstyle DNA. Cochineal + newtxmath is more harmonious (math letters derived from Crimson glyphs) but only works with pdfLaTeX, not XeLaTeX.

## LaTeX Package Dependencies

Packages the generated `.tex` fragments assume are loaded in the master document's preamble:

| Package | Required by | Purpose |
|---|---|---|
| `fontspec` | Font configuration | XeLaTeX font loading (Crimson Pro, JetBrains Mono) |
| `unicode-math` | Math font | OpenType math font support (Garamond Math) |
| `hyperref` | Links | `\href{url}{text}` |
| `graphicx` | Images | `\includegraphics` |
| `soul` | `==highlight==` | `\hl{}` |
| `multirow` | Tables (rowspan) | `\multirow{n}{*}{text}` |
| `minted` | Code blocks, inline code | `\begin{minted}`, `\mintinline` |
| `amsmath` | Math (display) | Already assumed by MathJax config |
| `xcolor` | Minted, highlight | Colour support |
| `booktabs` | Tables (optional) | `\toprule`, `\midrule`, `\bottomrule` — professional table rules |

## Dependencies

**Core:** Node.js, marked (v16.2.1), Acorn, cheerio, Commander.js, Mustache, seedrandom, js-beautify

**Integrations:** MathJax (CDN), Mermaid (CDN), highlight.js, marked-footnote, marked-alert, marked-gfm-heading-id, marked-highlight, marked-more-lists, marked-extended-tables, mathjs, sync-request

**Editor/workflow:** Sublime Text, Keyboard Maestro (`kmtrigger://` URL scheme for inverse search)

**UI components:** Web Awesome (`wa-page`, `wa-tree`, `wa-include`)

**PDF export:** Puppeteer, browser-sync (separate `package-print.json`)

**Mathematica:** Wolfram Engine Community Edition / `wolframscript` (freely available)

## On the Horizon

### Immediate (LaTeX output completion)
- `:::print`/`:::web` conditional directives
- Raw HTML suppression for LaTeX output
- Math passthrough for LaTeX (stop escaping `<`/`>`)
- Table conversion in custom tables extension
- Switch code blocks to minted
- Figures/captions syntax and rendering
- heading-base metadata field
- Biblify/citations (suppress JS injection for LaTeX)
- Cross-references via `\label`/`\ref`
- LaTeX escaping utility
- TiKZ passthrough

### Medium-term
- Fix the known bug backlog and remove dead code
- `add_labels_to_headers` should respect `.unnumbered` class
- Drop `marked-footnote` dependency once confirmed unused
- Watch mode (recommended: `child_process` fork to avoid state contamination)
- `:::grid` directive (CSS grid layout from pipe-delimited cells, reusing the headerless tables tokenizer)

### Long-term
- Open-source release: npm packaging, quick-start docs, live demo, "why not Pandoc?" positioning
- Consider extracting `extended-directives.js` and `function-extensions.js` as standalone packages
- Announce on Hacker News, r/LaTeX, or r/academicwriting
