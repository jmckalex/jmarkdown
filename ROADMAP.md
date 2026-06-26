# JMarkdown → Full Document-Preparation System: Feature Roadmap

*Drafted 2026-06-07. A plan for the features that would take JMarkdown from "a
very capable dual-output Markdown system" to "a genuine LaTeX replacement for the
core of scholarly document preparation." Scope is the **document-preparation
system** — the things `article`/`report`/`book` + a handful of canonical packages
(amsthm, hyperref, cleveref, graphicx, caption, geometry, makeidx, glossaries)
give every serious author — **not** CTAN breadth.*

---

## Status (updated 2026-06-26; `main` = `origin/main` = `8bc03db`)

**Tiers 0, 1, 2, and 4 are complete; Tier 3 is all but finished** — four items
remain (listed below). Every feature is verified by a real `pdflatex`/`xelatex`
compile and dual HTML/LaTeX goldens. Suite: 34 docs + 132 features + 53
latex-document, green (opt-in latex-compile suite reported 63/0).

- **Tier 0 — Foundations:** ✅ compilable document assembly · preamble/package
  manager · LaTeX escaping (codespan `}` fix + frontmatter) · frontmatter /
  `\maketitle` · abstract→`abstract` env. (0.5 state-reset folded into Tier 1.)
- **Tier 1 — Cross-reference & numbering:** ✅ `crossref.js` registry · `:label`/
  `:ref` in both outputs (linked HTML / native `\label`/`\ref`) · typed
  `:cref`/`:Cref` ("section 3"/"Section 3") · class-aware sectioning (`sectioning.js`).
- **Tier 2 — Scholarly structures:** ✅ figure floats + **subfigures** · table
  floats · **theorem family** (theorem/lemma/…/proof, one **sequential** counter
  via thmtools, correct cref words) · numbered **equations** · code-**listing**
  captions. All captioned, numbered, cross-referenceable; full-words cref parity
  enforced via `\crefname`.
- **Tier 3 — Book structure:** 🔶 nearly complete. ✅ `{{TOC}}`/`{{LOF}}`/`{{LOT}}`/`{{LOL}}`
  (both outputs) · front/main/back **matter** + **appendix** placeholders ·
  **multi-file cross-references** (3.3 — done **single-pass in-memory**, better
  than the planned two-pass `crossrefs.json`: parse all chapters → number across
  them → resolve, one PDF / one HTML page with continuous numbering) ·
  **back-of-book index** (3.4 — **shipped despite the deferral decision**;
  `src/indexing.js`, imakeidx for LaTeX, letter-grouped §-linked HTML nav). ⬜
  remaining (four items): HTML appendix lettering · `secnumdepth`/`tocdepth` ·
  **multi-PAGE HTML** (separate `chapterN.html`; the last piece of 3.3) ·
  glossary/acronyms (3.5, still **deferred** by decision).
- **Tier 4 — Layout & breadth:** ✅ complete (planned scope). `:::print`/`:::web`
  conditional content (block/inline/`@begin`) · **long tables** (auto-flip
  tabular→longtable past 20 rows, no syntax) · **native TikZ** in LaTeX ·
  callouts→`tcolorbox` · description lists → `description` env · page
  geometry/headers/line-spacing (`Geometry`/`Header`/`Footer`/`Line spacing`) ·
  hyperref **PDF bookmarks + metadata** · **Mermaid→PDF** via mmdc (optional;
  skipped with a hint if absent).

**Remaining across the roadmap (the four open items):**
1. **multi-PAGE HTML** — separate `chapterN.html`, single-pass in-memory. (One PDF
   / one HTML page already works via `[[…]]` with cross-file refs + continuous
   numbering; only the per-chapter *page split* is missing.)
2. **HTML appendix lettering** — headings A, B… after `{{appendix}}` (LaTeX has
   it natively; HTML strips the marker — `post-processor.js:163`).
3. **`secnumdepth` / `tocdepth`** — sectioning-depth + ToC-depth control via
   metadata (no handling in `src/` yet).
4. **glossary / acronyms** (3.5) — still **deferred** by decision.

The index (3.4) is **no longer outstanding** — it shipped. The
document-preparation core is otherwise complete.

The tables below are the original plan; the items above mark what's landed.

---

## North star — what "full replacement" means

A scholar should be able to write **one `.md` source** and get either:

- a **complete, compilable `.tex`** that `pdflatex`/`lualatex` turns into a
  publication-grade PDF, with no hand-editing of the LaTeX; **or**
- a **self-contained HTML** document with the same structure, numbering, and
  cross-references.

"Done" = the book *The Rise of Computational Philosophy* compiles to PDF and
renders to web from the same tree, with working ToC, figures/tables/theorems,
numbered & referenced equations, an index, and a bibliography — no `:::TeX`
escape hatches needed for structural features.

---

## The current foundation (what's already strong)

- **Dual-output architecture** is clean: one `global.isLatex` flag, format-aware
  renderers throughout. The `@begin` registry, directive framework, and
  feature→format dispatch are solid extension points.
- **Prose & inline**: paragraphs, all heading levels (→ `\chapter`…`\subparagraph`),
  lists (incl. alpha/roman emulation), blockquotes, emphasis (both Markdown and
  the custom `/…/ *…* ==…== __…__` syntax), links, footnotes, hr, line breaks —
  all render to LaTeX. (`latex-renderer.js`, `syntax-modifications.js`)
- **Tables**: `tabular` with alignment, percentage widths, `\multicolumn`,
  `\multirow`. (`marked-extended-tables-headerless.js`)
- **Code**: `minted` block + `\mintinline`, language from the fence.
- **Math**: inline/display passthrough (author writes real LaTeX math).
- **Citations/bibliography**: compile-time BibTeX → native `natbib` for LaTeX,
  CSL for HTML. *This is effectively done* — the model the rest of the roadmap
  should imitate. (`citations.js`, `biblify-compile.js`)
- **Strategic-form games** → `sgame`. **File inclusion** `[[…]]` (recursive,
  cycle-safe). **Script blocks / inline functions / `defineEnvironment`** for
  extensibility.

### The two structural facts everything below builds on

1. **LaTeX output is a body-only fragment today.** No `\documentclass`, no
   preamble, no `\begin{document}`/`\maketitle`/`\end{document}`. The
   `LaTeX preamble` config key exists but is consumed *only* by the TikZ
   standalone compiler, never the main pipeline. (`index.js:639–642`,
   `config-manager.js:36`, `tikz.js:80`)
2. **LaTeX skips post-processing entirely.** All numbering, cross-ref resolution,
   `<figure>` wrapping, and source/target splicing live in the HTML-only
   `post-processor.js`. (`index.js:639–642`)

→ **Design rule for the whole roadmap:** for each feature, **LaTeX emits native
commands and lets the engine do the work** (counters, `\label`/`\cref`,
`\maketitle`, `\listoffigures`); **HTML resolves everything itself** in the
post-processor. The citations feature already works exactly this way.

---

## Two pieces of new core infrastructure

Most of the roadmap depends on building these two shared subsystems first.
Building them well makes every dependent feature small.

### I. Counter & cross-reference registry (`src/crossref.js`)
A single instance-based module owning:
- **Typed counters**: `section`, `figure`, `table`, `equation`, `theorem`
  (and friends), `listing` — with configurable reset-on-parent (e.g. figures
  reset per chapter) and format (`1`, `1.2`, `2.1a`).
- **Label table**: `label → { type, number, text, anchor }`.
- **Ref resolution**: cleveref-style typed output ("Figure 2.1", "Section 3").
- **Dual strategy**: HTML numbers & resolves in the post-processor; LaTeX emits
  `\label{…}`/`\cref{…}` and lets the engine number.
- **Fixes the known `crossrefs`-never-resets bug** by being per-run, not
  module-global. (CLAUDE.md "Known bugs")

### II. Preamble / package manager (`src/preamble.js`)
- Features **declare** their LaTeX requirements (`\usepackage{minted}`,
  `\usepackage{cleveref}`, theorem definitions, `sgame`, …) instead of relying on
  the author to assemble a preamble by hand.
- An assembler dedupes, orders, and emits a complete preamble, merged with a
  user-supplied `LaTeX preamble` / `Packages` metadata key.
- Mirror on the HTML side already exists (CSS/`HTML header`); this brings LaTeX to
  parity and is the precondition for compilable output.

---

## Roadmap by tier

Effort key: **S** ≈ hours · **M** ≈ a day · **L** ≈ multi-day · **XL** ≈ week+ /
multi-session.

### Tier 0 — Foundations (unblocks "is actually a LaTeX replacement")

| # | Feature | Current | What's needed | Effort |
|---|---|---|---|---|
| 0.1 | **Compilable document assembly** | Fragment only (`index.js:639–642`) | A `.tex` template (peer of the HTML mustache template): `\documentclass` + assembled preamble + `\begin{document}` + frontmatter + body + `\end{document}`. Keep `--fragment` for body-only. **All user-specifiable** metadata (nothing baked in): `Document class` (**default `article`**; any class name passed through verbatim), `Class options` (paper, font size, twoside…), `LaTeX engine` (**default `pdflatex`**). | M–L |
| 0.2 | **Preamble/package manager (infra II)** | `LaTeX preamble` unused in pipeline | Build `preamble.js`; have existing features register their packages (minted, hyperref, multirow, soul, sgame). Honour `LaTeX preamble`/`Packages` metadata. | M |
| 0.3 | **Robust LaTeX escaping** | Only `&`,`#` escaped; codespan breaks on `}` (Known bugs) | Shared `escape.js` handling `% ~ ^ \ { } _` correctly in prose vs. verbatim vs. math contexts; fix the codespan-on-`}` bug. Pure correctness; everything downstream depends on it. | S–M |
| 0.4 | **Frontmatter / `\maketitle`** | `::title/::author/::date` emit HTML in both modes | Real LaTeX `\title/\author/\date/\maketitle`; abstract → `abstract` env in LaTeX; capture metadata so the template can build a title page. | S–M |
| 0.5 | **State-reset fixes** | `crossrefs` & footnote module state never reset (Known bugs) | Roll into infra I; make per-run. Precondition for multi-file. | S |

### Tier 1 — The cross-reference & numbering system (the heart of a DPS)

| # | Feature | Current | What's needed | Effort |
|---|---|---|---|---|
| 1.1 | **Counter & cross-ref registry (infra I)** | HTML-only `:label`/`:ref`, raw-text resolution, no counters (`post-processor.js`, `additional-directives.js`) | Build `crossref.js` per above. | L |
| 1.2 | **Unified label/ref, both outputs** | `:ref` is a plain span, not a link; no LaTeX | LaTeX: `\label`/`\cref`. HTML: `:label`→anchor, `:ref`→`<a href="#…">`. ~20 lines for the LaTeX branch once infra exists (per handover). | S–M |
| 1.3 | **Typed, auto-numbered counters** | Section numbering only, in post-processor | figure/table/equation/theorem/listing counters seeded from headings; reset-by-chapter; the `{-}` unnumbered marker already exists. | M (on top of 1.1) |
| 1.4 | **Cleveref-style typed references** | none | "Figure 2.1"/"Section 3" text from type+number; `\cref`/`\Cref` in LaTeX, generated text in HTML. | S |

### Tier 2 — Scholarly content structures (depend on Tier 1)

| # | Feature | Current | What's needed | Effort |
|---|---|---|---|---|
| 2.1 | **Figure floats w/ caption + number** | Image → bare `<img>` (HTML) / fixed-width `figure` w/ no number (LaTeX) | `@begin(figure)[caption]{#label}`; HTML `<figure><figcaption>Figure N: …`; LaTeX `figure`+`\caption`+`\label`; placement attr; ref-able via Tier 1. | M |
| 2.2 | **Table floats w/ caption + number** | `tabular`, no float/caption/number | Wrap tables in numbered `table` float + caption; HTML equivalent; ref-able. | M |
| 2.3 | **Theorem-like environments** | Generic `@begin(name)` only; registry exists, no counters | Built-in theorem/lemma/proof/definition/corollary/remark; `amsthm` (LaTeX) + styled boxes (HTML); shared vs. independent counters; optional `[name]`; ref-able. Natural fit for the `@begin` registry. High value for philosophy/math. | M–L |
| 2.4 | **Numbered & referenceable equations** | Display math passthrough, unnumbered | `equation`/`align` with `\label`/`\eqref`; HTML via MathJax tagging + ref resolution; auto-number unless starred. | M |
| 2.5 | **Code-listing captions + numbering** | `minted`, no caption/number | Optional caption/label on fenced blocks → "Listing N"; `minted`'s caption (LaTeX) + `<figure>` (HTML); ref-able. | S–M |

### Tier 3 — Book / document structure & navigation

| # | Feature | Current | What's needed | Effort |
|---|---|---|---|---|
| 3.1 | **Front/main/back matter + ToC/LoF/LoT pages** | `{{TOC}}` (HTML only); no LoF/LoT; no LaTeX ToC | LaTeX `\tableofcontents`/`\listoffigures`/`\listoftables`; `{{LOF}}`/`{{LOT}}` for HTML (consume Tier 1 counters); `\frontmatter`/`\mainmatter`/`\backmatter` for book class. | M |
| 3.2 | **Appendices & sectioning control** | `{-}` unnumbered only | `\appendix`; `secnumdepth`/`tocdepth` via metadata; `part`/`chapter`; `Heading base` metadata (the hardcoded `#`→`\chapter` map, `latex-renderer.js:25–35`). | S–M |
| 3.3 | **Multi-file book cross-refs** | 🔶 cross-file refs **DONE** — single-pass **in-memory** (no `crossrefs.json`); one PDF / one HTML page, continuous numbering. ⬜ **multi-PAGE HTML** (`chapterN.html`) remains | Done better than planned: the in-memory single pass supersedes the two-pass `crossrefs.json` design. **Remaining:** split the HTML output into per-chapter pages (still single-pass). | XL |
| 3.4 | **Index** ✅ **SHIPPED** (deferral reversed) | `src/indexing.js` | `:index[entry]{name=…}` marks + `::Index{…}` placement → `imakeidx` `\makeindex`/`\printindex` (LaTeX; multiple named indexes) and a letter-grouped, §-number-linked `<nav>` index (HTML). Full makeindex grammar passes through verbatim. | M–L |
| 3.5 | **Glossary / acronyms** *(DEFERRED)* | none | term definitions + `\gls`-style refs → `glossaries` (LaTeX) / collected list (HTML). **Deferred** with index. | M |

### Tier 4 — Layout, conditionals, and fidelity breadth

| # | Feature | Current | What's needed | Effort |
|---|---|---|---|---|
| 4.1 | **`:::print` / `:::web` conditional content** | none (on the standing roadmap) | Emit a block only in the matching format. Essential for single-source fidelity (interactive widget on web ↔ static figure in print). | S |
| 4.2 | **Admonitions/callouts in LaTeX** | `> [!NOTE]` HTML-only | Map alerts to `tcolorbox`/`mdframed` (LaTeX). | S–M |
| 4.3 | **Description lists in LaTeX** | HTML `<dl>` only | `description` environment. | S |
| 4.4 | **Page layout & typography via metadata** | none for LaTeX | `geometry` (margins/paper), line spacing, `fancyhdr` headers/footers, page-number style, multi-column — metadata keys → preamble (LaTeX) / CSS (HTML). | M |
| 4.5 | **Long tables across pages** | fixed-height `tabular` (CLAUDE.md) | `longtable`/`tabularx` when a table is tall; opt-in attribute. | M |
| 4.6 | **Native TikZ + Mermaid-for-print** | TikZ = cached SVG; Mermaid HTML-only | Emit native `tikzpicture` in LaTeX; render Mermaid to an image at build for print. | M–L |
| 4.7 | **PDF metadata & bookmarks** | none | `hyperref` PDF title/author/bookmarks from metadata. | S |
| 4.8 | **Color & box theming parity** | ad hoc | `xcolor`/`tcolorbox` mapping for callouts, highlights, themed blocks. | M |

---

## Sequencing & dependencies

```
Tier 0 (assembly, preamble, escaping, frontmatter, state reset)
        │  ← makes output compilable & correct; nothing real ships without it
        ▼
Tier 1 (counter + cross-ref registry)         ← the spine
        │
        ▼
Tier 2 (figures, tables, theorems, equations, listings)  ← all consume Tier 1 counters
        │
        ▼
Tier 3 (matter/ToC/LoF/LoT, appendices, MULTI-FILE, index, glossary)
        │     multi-file (3.3) also needs 0.5 (state reset)
        ▼
Tier 4 (conditionals, layout, long tables, native diagrams, PDF meta) ← mostly independent; pull forward any item on demand
```

Tier 4 items are loosely coupled and can be cherry-picked early whenever the book
needs one (e.g. `:::print`/`:::web` (4.1) is cheap and independently useful).

---

## Suggested first milestone ("compilable single chapter")

A tight, demonstrable slice that proves the whole model end-to-end:

1. **0.1 + 0.2 + 0.4** — produce a complete, compilable `.tex` with an
   auto-assembled preamble and a real title.
2. **0.3** — escaping correct enough that real prose round-trips.
3. **1.1 + 1.2 + 1.3 (figures only) + 2.1** — one numbered, captioned, *referenced*
   figure working in **both** PDF and HTML from one source.

Hitting that means the architecture is proven; Tiers 2–3 then become "more of the
same shape." Recommend doing it as one chapter of the actual book so the test is
real.

## Decisions (locked 2026-06-07)

- **Document class is user-specifiable, never baked in.** `Document class`
  metadata key, **default `article`** (Markdown is rarely used for books); any
  class the author names is passed through verbatim. `Class options` for
  paper/font size/`twoside`/etc.
- **Engine is user-specifiable.** `LaTeX engine` metadata key, **default
  `pdflatex`** (the gold standard). The engine only tunes preamble defaults —
  JMarkdown emits `.tex`, it does not compile: `pdflatex` ⇒ `inputenc`/`fontenc`
  (and `-shell-escape` documented for minted); `lualatex`/`xelatex` ⇒ `fontspec`,
  no `inputenc`.
- **Index & glossary deferred** (3.4 / 3.5) — niche; a real index is a
  professional craft, not a build-time artifact. *(Update 2026-06-26: the index
  (3.4) was un-deferred and **shipped** — `src/indexing.js`. The glossary (3.5)
  remains deferred.)*
- **Build the general system, tier-by-tier** (not chapter-driven). The
  "compilable single chapter" milestone below still serves as the end-to-end
  proof, but the work then proceeds systematically through the tiers.
