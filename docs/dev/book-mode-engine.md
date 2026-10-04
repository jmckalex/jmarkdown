# Book mode — what the engine can offer

*Engine-side note for Clew-app's book/manuscript-mode design. Written
2026-10-03 against `at-migration` 455cb61; updated 2026-10-04 with the owner's
decisions (§7), which §5 and §6 now follow. Phase 1 was built 2026-10-04/05;
§8 says what was built and where it differs from §5 and §6.*

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
- the plan, in phases (§5), and the interface Clew can design against (§6);
- the owner's decisions (§7, 2026-10-04).

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

**G10 — An included chapter's relative paths are not rebased.** A chapter in
`chapters/one.md` that writes `![a figure](fig.png)` means `chapters/fig.png`.
Spliced into a master one folder up, it still says `fig.png`, in HTML
(`src="fig.png"`) and LaTeX (`\includegraphics{fig.png}`). So it points at the
master's folder, not the chapter's (checked 2026-10-04). Assembly must rewrite
each chapter's relative image, link and media paths against the chapter's own
folder. With per-chapter pages it must then rewrite them again, relative to the
page's output location.

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

## 5. The plan

**Can option A plus a split at chapter boundaries give per-chapter pages in
phase 1? Yes, and option C need not come sooner.**

In A the whole book is one DOM after the post-processor. One pass has already
done every number, every cross-reference, the citations, the References list
and the index. Splitting that finished DOM into pages is one more pass at the
end. It needs four things, none of them C's:
- **chapter boundaries:** the assembler wraps each chapter as it splices it,
  e.g. `<section class="jmd-chapter" data-chapter="2" data-file="…" lang="…">`;
- **an id → page map**, read off the DOM;
- **rewritten links:** every `#id` whose target is on another page becomes
  `page.html#id`. That covers cross-references, the contents, citation links
  into the References page, and index locators. Footnote refs and backrefs
  stay on their own page, since notes are per chapter (below);
- **a head for each page:** the book's template, plus that chapter's
  whitelisted `<style>` and maths macros.

C is about rebuild speed, not about pages. It makes one chapter's change cheap
by caching the other chapters' renders. A book export is a one-off action, and
Clew's everyday preview is a single note, so the whole-book rebuild A costs is
acceptable in phase 1. C becomes worth it only if a live whole-book preview is
wanted.

**Phase 1 — option A, with pages** (each item small and testable alone; a
single-note build is untouched):
1. **The master note and assembly:** the chapter list from the master note
   (§6). Each chapter is wrapped, its front matter stripped (G1), and its
   relative paths rebased (G10). The title is the first `#` heading, else the
   front matter's `title`, else the file name (§7).
2. **Per-chapter settings** (G8), from the whitelist in §7; anything else in a
   chapter's header warns, naming the chapter.
3. **Numbering per chapter by default**, `continuous` on request, in both
   outputs (G3):
   - HTML: the post-processor's counters reset at each chapter and prefix its
     number (Figure 2.3, Theorem 2.1, (2.4), footnote 2 restarts);
   - LaTeX: `book`/`report` already number figures, tables, equations and
     footnotes per chapter, and theorems gain `numberwithin=chapter`;
   - `continuous`: today's HTML, plus `\counterwithout{…}{chapter}` and no
     `numberwithin` in LaTeX.
4. **Footnotes at the end of each chapter in HTML** (G7). The post-pass moves
   each chapter's notes, classic and inline alike, into a list closing that
   chapter, numbered from 1. LaTeX's footnotes stay at the foot of the page,
   numbered per chapter by the class.
5. **One References list at the end:** the master's `@bibliography`. A
   chapter's own `@bibliography` warns and is ignored.
6. **Warnings name the chapter and line** (G4), through a line map kept by
   the assembler.
7. **The HTML split:** a contents page, one page per chapter, a References
   page and an Index page, with links rewritten across them (above).
   Citations must be resolved at compile time (`Resolve citations`, as Clew
   already sets): the runtime Biblify client sees one page and cannot build a
   book-wide list.
8. **LaTeX:** one `.tex` (as now), or a master plus `\include` per chapter.
   Either compiles to the same PDF; `\include` allows `\includeonly`.

**Phase 2 — option C, if needed:** cache each chapter's render and rerun only
the global post-pass. Phase 1's assembly, wrappers, split and outputs all stay.
A *book map* saved by that pass (chapter → counter offsets, label →
page/number) would let a single-note preview show book numbers. That is the
one thing option B was for, so **B is not needed.**

---

## 6. The interface, for Clew to design against

**The master note** holds the book's configuration (its header) and its
order. It is the order's home (§7):

```
---
Title: A Short Book
Document class: book
Numbering: per chapter          # or: continuous
Resolve citations: true
Bibliography: book.bib
---

{{frontmatter}}
{{TOC}}
{{mainmatter}}

@chapter+(chapters/intro.md)
@chapter+(chapters/methods.md)

{{appendix}}
@chapter+(chapters/proofs.md)

{{backmatter}}
@bibliography{title="References"}
@index{title="Index"}
```

`@chapter+(path)` is the engine's chapter line. It uses the `@name+(arg)`
block form, so it never collides with Clew's `[[…]]` wikilinks, and the
matter markers interleave naturally. A host that resolves its own syntax (say,
wikilinks to notes) can hand the engine the paths instead:

```js
processFile(master, {
  chapters: ['chapters/intro.md', …],   // instead of @chapter+ lines (one or the other)
  numbering: 'per chapter',              // overrides the header's Numbering
  htmlLayout: 'pages',                   // book default; 'single' = one long page
  latexLayout: 'single',                 // or 'include'
  bibliography: [vaultBib],              // exists since 455cb61
})
```

- **A chapter's header:** its front matter is stripped from the text. Only
  these keys are honoured (§7), and every other key warns, naming the chapter:

  | Key | Effect |
  |---|---|
  | `Bibliography` | adds its files to the book's set for its citations; one References list |
  | `Packages`, `LaTeX preamble` | joined into the book's one preamble (deduplicated; a clash warns) |
  | `Language` | `lang` on its section and page; `otherlanguage` around the chapter in LaTeX |
  | `Math macros` | added to its page's MathJax macros; in LaTeX, defined at the chapter's start |
  | `<style>` elements | kept for its page's head; nothing in LaTeX |

  Two details of the table:
  - **Bibliography:** the book's own files come weakest, then each chapter's in
    book order. Since there is one list, two chapters whose files disagree on
    a key get a warning naming both chapters.
  - **Math macros in LaTeX:** LaTeX has one macro namespace, so a macro two
    chapters define differently warns: in print the later definition would
    carry on into the chapters after it.
- **Chapter titles:** the first `#` heading; else the front matter's `title`,
  inserted as the chapter heading; else the file name without its extension.
- **Outputs, `pages`:**
  - `book/index.html`: the title page and contents;
  - one `book/<chapter>.html` per chapter, named from its file name;
  - `book/references.html` and `book/index-terms.html`;
  - each page has previous, next and contents links;
  - relative assets are rebased onto the output folder (G10).
- **Outputs, `single`:** one `.html`, as today, but with chapter wrappers,
  per-chapter footnotes and per-chapter numbering.
- **Outputs, LaTeX:** `single` is one `.tex`; `include` is `book.tex` plus
  `book-<chapter>.tex`.
- **Warnings:** read `chapter.md:12: …`, for watch mode's and Clew's banners.
- **Unchanged:** a single-note build ignores all of this.

---

## 7. Decisions (the owner, 2026-10-04)

| Question | Decision | Where |
|---|---|---|
| Numbering | **Per chapter** (Figure 2.3), theorems included; `continuous` available | G3; §5 item 3 |
| Chapter title | The first `#` heading, else the front matter's `title`, else the file name | §5 item 1; §6 |
| Per-chapter settings | A short whitelist: its own `Bibliography` (added, for its citations), LaTeX packages and preamble, `Language`, `Math macros`, `<style>` elements. Anything else warns, naming the chapter | G8; §6 |
| HTML shape | **Per-chapter pages from the start**: option A plus a split at chapter boundaries, in phase 1. Option C is not needed for it | G5; §5 |
| Footnotes in HTML | At the end of each chapter | G7; §5 item 4 |
| Where the order lives | A master note, as Clew-app proposed | §6 |
| References | One list, at the end of the book | §5 item 5 |

---

## 8. Phase 1 as built (2026-10-04/05)

One commit per piece on `at-migration`, each with its own tests
(`tests/book/run.sh`, gating; 207 assertions at the end). Single files are
unchanged throughout: every hook is reached only in a book, and
docs-snapshots and features stayed byte-for-byte.

| Piece | Commit | What |
|---|---|---|
| 1 | 0372f23 | Assembly: `chapters` option, `--chapter`, `@chapter+(path)`; front matter stripped, whitelist kept, other engine keys warned; the title rule; per-chapter lexing; `chapter:line` warnings; G10 paths; chapter links |
| 2 | 8b5a1db | `Numbering: per chapter` (default) / `continuous`, both outputs |
| — | e407bc6 | Bug fix, single files too: a `\crefname` only with cleveref |
| — | 4339171 | A chapter's key is silent when the book uses the same value (the owner); the master's `Numbering` matched loosely |
| 3 | 8356598 | Footnotes close their chapter (HTML); ids scoped per chapter |
| 4 | 1fdb256 | A chapter's `Bibliography` joins the book's one set; cross-chapter citations and disagreeing files warned |
| 5a | ea003ec | `Packages`, `LaTeX preamble` joined into one preamble; clashing definitions warned and left out |
| 5b | 48f4e29 | `Math macros` defined at each chapter's start |
| 5c | d3d3eb3 | `Lang`: section `lang`, babel + `otherlanguage*`, the language's quotation marks (books only) |
| 5d | 9220cf6 | A chapter's `<style>` scoped to its section; dropped in LaTeX |
| 6 | 2ac7048 | `htmlLayout: 'split'`: index, chapter pages, references, index-terms |
| 7a | 53e0ade | The post-pass's warnings at `chapter:line`; a line-count slip from piece 1 |

Where it differs from §5 and §6, or goes beyond them:

- **The layout's name** is `split` (Clew-app's), with `pages` accepted, and
  the default is `single`: a book is one page unless asked, so the option is
  additive. Set by `HTML layout:` in the master, processFile's `htmlLayout`,
  or `--html-layout`. The pages go in a folder named after the output file
  (`build/Book.html` → `build/Book/`), and processFile returns `pages`.
- **`otherlanguage*`, not `otherlanguage`:** the star switches hyphenation
  but keeps the headings in the book's language ("Chapter 2", not
  "Kapitel 2"). A master whose own `Lang` is not English loads babel for the
  whole book.
- **Bibliography clashes:** one set for the whole book, a later file winning
  a key everywhere, and the disagreement warned with both chapters named
  (§6). Clew-app's note has a chapter's own entry winning *in that chapter*;
  not built.
- **No References list is added** when the master places none, as a single
  file gets none. A chapter's own `@bibliography` is warned and ignored.
- **Footnotes:** a chapter that mixes `[^1]` and `[fn: …]` notes gets two
  lists in HTML, each from 1, where the PDF numbers one sequence — as a
  single file does. A book that uses endnote groups or `@endnotes` keeps the
  author's placements, as one document would.
- **Math macros in LaTeX** go in as `\providecommand{\X}{}\renewcommand{\X}…`
  at the chapter's start, so a name defined already cannot stop the build.
- **`Packages` carry no options**, so packages cannot clash; only one-line
  `LaTeX preamble` definitions are checked.
- **Citations are not links** in jmarkdown's HTML, in a single file either,
  so nothing links a citation to the References page.

Not built in phase 1: the LaTeX `include` layout (G5), option C (G6), and
paths inside a file that a chapter *includes* from another folder (they
resolve against the chapter's folder, as any inclusion's against its
includer).

