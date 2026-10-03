# Book mode — what the engine can offer

*Engine-side note for Clew-app's book/manuscript-mode design. Written
2026-10-03 against `at-migration` 455cb61 (+ the docs and test commits after
it). A note, not a plan of record: nothing here is built yet beyond §2.*

A book build takes an ordered list of chapter files and produces ONE book:
- numbering that runs across chapters (headings, figures, tables, equations,
  theorems, footnotes);
- `@label`/`@ref` that resolve from any chapter to any other;
- one contents list, one References, one Index;
- whole-book HTML, and LaTeX/PDF with `\chapter`s.

This note says:
- what the engine does for that today (§2);
- where it falls short, each gap checked against a probe build (§3);
- three ways to close the gaps, with trade-offs (§4);
- what I would do, in stages (§5), and an interface Clew could rely on (§6);
- the questions only the owner can answer (§7).

---

## 1. The requirements, as the engine sees them

| Need | Engine question |
|---|---|
| Chapter order | Who holds the list, and how does the engine receive it? |
| Cross-file numbering | Do the counters carry over from one file into the next? |
| Cross-file `@label`/`@ref` | Does a reference see labels from every file? |
| One References, one Index | Do citations and index marks from every file feed one list? |
| Whole-book export | One HTML page or one per chapter? One `.tex`, or a master plus `\include`s? |
| Living with it | Rebuild cost, warnings that name the right file, previews |

---

## 2. What exists today: a book is ONE document, assembled by inclusion

`[[chapter.md]]` on a line of its own splices that file into the source
before parsing (`src/file-inclusion.js`):
- recursively;
- with paths relative to the including file;
- with cycles rejected.

A *master file* holding the metadata header, the matter markers and one
`[[…]]` per chapter is therefore a book: by the time the parser runs it is a
single stream. This is documented and tested (`docs/book-structure.jmd`,
"Multi-file books").

What that gives for free, in BOTH outputs:

| | HTML | LaTeX |
|---|---|---|
| Heading numbers across chapters | post-processor (`Headings: numeric`) | native `\chapter` / `\section` (`Document class: book` or `report`) |
| Figures, tables, listings | continuous: one counter per kind | native counters |
| Theorems and numbered environments | one shared counter | thmtools `sibling=theorem`, also continuous |
| Equations | continuous | native |
| `@label` / `@ref` / `@cref` across files | resolved over the whole DOM (`crossref.js`); duplicate labels warn | native `\label`/`\cref` |
| Contents, LOF, LOT, LOL | `{{TOC}}` etc. built from the whole document | `\tableofcontents` etc. |
| Front/main/back matter, appendix | markers dropped | `\frontmatter` … `\appendix` |
| One References | `@bibliography` at the end (compile-time CSL; numeric styles number across the book) | `\bibliography{…}`, one bibtex run |
| One Index | `@index` placement with § locators | imakeidx `\printindex` |
| Per-chapter notes | grouped endnotes: `@endnoteGroup(ch3)` … `@endnotes(ch3)` | the same, as JMarkdown-built lists |
| Rebuild on change of any chapter | watch mode tracks every file read (the fs preload) | — |

Most of the numbering and reference resolution in HTML already happens in
ONE post-processing pass over the assembled DOM (`post-processor.js`):
- headings, floats, theorems, equations, numbered environments;
- cross-references;
- compile-time citations and bibliographies;
- index assembly.

That matters for the options in §4: the expensive, order-dependent work does
not happen while each piece of markdown is parsed.

---

## 3. Gaps

Each was checked with a probe build: a `book`-class master with two included
chapters, one of them carrying YAML front matter, footnotes and a
cross-chapter `@ref`.

**G1 — A chapter's front matter is rendered as content.** An included file is
not scanned for a metadata header, so a vault note's `---`-fenced YAML is
spliced in as prose:
- HTML: the YAML text and a horizontal rule;
- LaTeX: a one-cell `tabular` holding it.
Every Clew note can carry front matter, so this must be fixed before anything
else. Fix: strip a leading header from each included file. Optionally keep
named keys per chapter (its `title`, `aliases`), never config keys.

**G2 — `[[…]]` inclusion is OFF in Clew.** `"File inclusion": false` is a
host affordance because `[[…]]` is Clew's wikilink. So inclusion cannot be
how Clew assembles a book. The chapter list needs its own channel: a
processFile option and/or a header key in a master note. See §6.

**G3 — Numbering differs between outputs in `book` and `report`.**

| Counter | LaTeX `book` / `report` | HTML today |
|---|---|---|
| Figures, tables, equations | per chapter (Figure 2.3, (2.4)) | continuous (Figure 7, (12)) |
| Footnotes | restart each chapter, and print per page | one list for the whole book |
| Theorems | continuous (thmtools, no `numberwithin`) | continuous |
| Headings | "Chapter 2", sections 2.1 | "2.", "2.1." |

A book needs one policy, applied to both outputs. Either:
- **per chapter**: HTML prefixes the chapter number, and theorems gain
  `numberwithin=chapter` in LaTeX; or
- **continuous**: LaTeX gets `\counterwithout{figure}{chapter}` and the like.
One key, `Numbering: per chapter | continuous`, would do it. The work in HTML
is in the post-processor's counters (prefix from the enclosing h1); in LaTeX,
it is preamble lines.

**G4 — Warnings and positions don't know which file they come from.** Build
warnings have no file (or line) at all, so a book's warnings can't point to
the chapter. The `data-source-line` stamps used for inverse search are lines
of the spliced stream, so Cmd-click and Clew's banner land in the master, not
the chapter. Inclusion would need to keep a line map: each spliced range →
(file, first line).

**G5 — One output file.**
- HTML is one page. For a book that is heavy, and a reader has no per-chapter
  URL.
- LaTeX is one `.tex`, with no `\include`, so `\includeonly` partial builds
  aren't possible. bibtex and cross-references are fine either way: LaTeX
  resolves across `\include`d files through the `.aux` natively.

**G6 — Whole-book rebuild.** Any chapter's change re-parses the whole book.
Fine for a paper; noticeable at book length in watch mode and in Clew's
preview.

**G7 — Classic footnotes collect at the very end in HTML.** marked-footnote
keeps one list for the document. Inline notes can be grouped per chapter
today (grouped endnotes, §2), but `[^a]` notes cannot. A book wants a per-chapter
note list or page-bottom notes.

**G8 — Per-chapter settings.** Only the master's header is read, so a chapter
can't set its own options: a chapter-only `Bibliography`, `Bibliography
style`, or its own math macros. Usually that's right for a book (one
configuration), but it should be a decision, not an accident.

**G9 — Cross-chapter links in the host's own syntax.** Clew's `[[Note]]`
wikilinks between chapter notes must become in-book links (`#chapter-anchor`,
or `chapter-3.html#…` when split). That is host-side, but it needs the engine
to give each chapter a stable anchor and to say where each chapter landed.

---

## 4. Options

### A. Keep the single assembled document, and give it a proper front door

Extend what exists:
- an ordered `chapters` list (processFile option, CLI flag, or a header key
  in a master note) does the splicing that `[[…]]` does now, with no
  wikilink conflict;
- each chapter's front matter is stripped (G1);
- a line map gives warnings and source lines their file (G4);
- `Numbering:` chooses one policy for both outputs (G3);
- an optional LaTeX layout of a master `.tex` plus `\include{chapter-N}`
  (G5): chapter boundaries are known, so the engine can write each chapter's
  body to its own file.

*For:*
- smallest change;
- everything in §2 keeps working unchanged;
- one numbering and reference pass, so no drift between chapters;
- PDF/LaTeX/HTML export of the whole book is available almost at once.

*Against:*
- G6 remains (whole rebuild);
- HTML is still one page unless split afterwards (see C);
- a chapter previewed on its own (Clew's normal view) still numbers from 1
  and can't resolve labels in other chapters.

### B. Separate builds with a shared book context (two passes)

Pass 1 walks every chapter cheaply, collecting labels, headings and how many
of each counter it uses. Pass 2 renders each chapter on its own, given
counter start values and the global label table (label → chapter, number,
anchor), so a reference to another chapter becomes `chapter-3.html#fig:x`.
References and Index are assembled in a third step from every chapter's
citations and index marks.

*For:*
- per-chapter output and per-chapter rebuilds;
- a chapter previewed in Clew can show book numbers.

*Against:*
- the largest change: every numbering site needs an injectable start, and
  some live outside the post-processor (marked-footnote's numbers, endnote
  groups, numbered environments' groups, the heading list `{{TOC}}` reads);
- labels, bibliography and index have to be serialized between passes;
- two passes mean two chances to disagree, so it needs checks that pass 1
  and pass 2 see the same things;
- usage-driven LaTeX preambles must be unioned across chapters.

### C. Render chapters separately, number them together (cached fragments + one post-pass)

Render each chapter to an un-post-processed HTML fragment, cached by
content hash. Concatenate the fragments in order, and run the existing
post-processor once over the whole book. That one pass already numbers
everything and resolves references, citations and the index. Split the
result into one page per chapter afterwards, if wanted, rewriting
cross-page `href`s from the label table the pass already built.

In LaTeX, render each chapter body separately, cached, and write a master
`.tex` that `\include`s them. The preamble is the union of the chapters'
usage-driven packages, which the preamble registry can merge.

*For:*
- incremental: one chapter's change re-renders one chapter, and only the
  cheap DOM pass reruns;
- numbering and references stay exact, because they still happen once over
  everything;
- reuses the architecture that exists;
- multi-page HTML falls out of the split.

*Against:*
- what is decided at tokenize or render time rather than in the post-pass
  must move into the post-pass or a book step: classic-footnote numbering,
  endnote-group numbering, `{{TOC}}` (built from marked's heading list),
  Vancouver's citation-order numbering (it is in the post-pass, so fine);
- the cache must key on everything that affects a chapter's render (its
  text, the book's config, included assets).

---

## 5. What I would do

1. **Option A first.** It makes a real book exportable now:
   - the `chapters` input;
   - strip chapter front matter (G1, needed whatever else happens);
   - a line map, so warnings and inverse search name the chapter (G4);
   - `Numbering: per chapter | continuous` in both outputs (G3);
   - per-chapter footnote lists in HTML (G7): the existing endnote groups,
     keyed to chapters automatically;
   - optionally, LaTeX as master + `\include` (G5).
   Each piece is small, testable on its own, and none breaks single-note
   builds.
2. **Option C when size bites:** incremental rebuilds and one page per
   chapter. It builds on A's inputs and outputs, and doesn't replace them.
3. **Option B only if Clew needs book numbers inside a single-chapter
   preview** while the book isn't being built. Even then, a cheaper route is
   for C's whole-book pass to save a small *book map* (chapter → counter
   offsets, label → chapter/number/anchor) that a lone-chapter render reads
   to number from the right place and to link out.

---

## 6. A possible interface, for Clew to design against

```js
processFile(master, {
  chapters: ['01-intro.md', '02-methods.md', …],  // order = book order; replaces [[…]] for hosts
  numbering: 'per chapter',                        // or 'continuous' (a header key too)
  latexLayout: 'include',                          // or 'single' (today's one .tex)
  htmlLayout: 'single',                            // or 'split' (later: option C)
  bibliography: [vaultBib],                        // already exists (455cb61)
})
```

- **`chapters`:** paths are relative to the master, or absolute. Each file's
  front matter is stripped; its `title` (if any) is available as the chapter
  title when the file starts with no heading (the owner's call, §7).
- **Warnings** gain a location, as `file:line`, which watch mode's and Clew's
  banners can show.
- **Outputs:**
  - `single`: one `.html` / `.tex`, as today;
  - `include`: `book.tex` plus `book-ch1.tex`, … beside it;
  - `split`, later: `book.html` (contents) plus one page per chapter.
- **A book map**, later: written beside the output (JSON) for a host's
  previews.
- **What stays the same:**
  - the master's header is the book's configuration;
  - per-note `Bibliography:` in a chapter is not read (G8);
  - a single-note build ignores all of this.

---

## 7. Questions for the owner

1. **Numbering policy:** per chapter (Figure 2.3, the LaTeX book default) or
   continuous (Figure 7, today's HTML)? Should theorems follow it?
2. **Chapter title source:** the chapter's first `#` heading (as now), its
   front-matter `title`, or its file name?
3. **Per-chapter settings (G8):** none (one book configuration), or a short
   whitelist (e.g. a chapter's own `Bibliography` only)?
4. **HTML shape:** one long page first, or per-chapter pages from the start?
5. **Footnotes in HTML:** a list at the end of each chapter, or at the end of
   the book?
6. **Where the order lives:** a Clew-side manifest handed to the engine (my
   assumption), or a master note the author edits?
