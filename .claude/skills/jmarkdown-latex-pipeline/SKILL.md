---
name: jmarkdown-latex-pipeline
description: >-
  Architecture and reference for JMarkdown's LaTeX document-preparation system (`--to latex`) — full-document assembly and metadata keys, the usage-driven preamble manager, cross-references and counters, and remaining pipeline work. Load before changing latex-renderer.js, latex-template.js, preamble.js, latex-escape.js, sectioning.js, crossref.js or default-template.tex.mustache, and before touching LaTeX output, numbering, or cross-reference wording.
---

# LaTeX document-preparation system

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
- **Back-of-book index** (`indexing.js`): `@index[entry]` invisible marks (the
  full makeindex grammar — `!` subentries, `sort@display`, `|see{…}`/`|seealso`,
  `|(`/`|)` ranges, `|textbf`, `"`-escapes — passes through verbatim) +
  `@index{title="…" intoc name=…}` placement. **Mark and placement share the
  name**, told apart by the bracket: `@index[…]` marks, a line-start bare
  `@index` places. The block `start()` therefore carries a `(?!\[)` so it can't
  report a position its tokenizer would refuse (the paragraph-shredding rule).
  Legacy `:index[…]` / `::Index` stay accepted as silent aliases.
  **Registration order is load-bearing:** `indexMark` must be registered AFTER
  `atInline` (`index.js`), because `atInline` claims ANY `@name[…]` bracket form
  and marked tries the last-registered extension first — registered earlier,
  `@index[Turing|see{…}]` renders as a visible `<span class="index">` instead of
  an invisible mark. It must win rather than be ported onto the registry because
  it claims its bracket RAW with a **balanced** scan; `atInline`'s `[^\]]*`
  truncates a display form like `[$f[x]$]` at the first `]`. It is also the one
  `@` form that deliberately **skips** the "an `@` glued to a word char is never
  a directive" rule — a mark is attached to the word it indexes
  (`recursion@index[recursion]`), so gluing is the primary idiom; the risk that
  rule guards doesn't carry over, since this tokenizer only claims the literal
  7-char prefix `@index[`. LaTeX → `imakeidx` (auto-loaded,
  before hyperref by insertion order) with `\makeindex[…]` per index and
  `\printindex[…]`; multiple named indexes via `{name=…}`. HTML → post-pass
  builds a letter-grouped `<nav class="index">`; locators are linked §-numbers
  (needs `Headings: numeric`; ordinal fallback), duplicates collapse, see-refs
  hyperlink to their target entry. Warnings: marks without a placement
  (`checkIndexPlacements`, both formats), missing see-targets, unbalanced
  ranges, >3 levels. Docs: `docs/indexing.jmd` (live demo index on the page).
  Fixtures: `features/indexing/` (`at-forms` covers the `@` spellings + the
  nested-bracket display form; `marks` is the legacy spelling, so it now doubles
  as the alias regression).
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
