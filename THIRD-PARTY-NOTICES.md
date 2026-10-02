# Third-party notices

JMarkdown itself is © J. McKenzie Alexander, under the MIT License (see
`LICENSE`). Its npm dependencies are installed by npm, not shipped in this
repository, and each carries its own licence in its own package under
`node_modules/`. What follows is the third-party material that JMarkdown
**carries in its own source** or **writes into the documents it produces**,
and the obligations that come with it.

## Font Awesome Free — icons, `CC BY 4.0`

Font Awesome Free by @fontawesome — <https://fontawesome.com>. Copyright ©
Fonticons, Inc. The icons are licensed under the
[Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/);
the package as a whole is `(CC-BY-4.0 AND OFL-1.1 AND MIT)` — CC BY 4.0 for
the icons as SVG and JS, SIL OFL 1.1 for the fonts, MIT for the code. Full
terms: <https://fontawesome.com/license/free>.

JMarkdown uses the icons for Obsidian callouts (`src/callouts.js`), in two
ways.

### Embedded in the source

The path data of fifteen icons is copied into `src/callout-table.js`, one per
built-in callout type, and is written into every document that contains a
callout: as inline SVG in HTML, and as a TikZ drawing of the same outline in
LaTeX (`src/callout-latex.js` re-expresses the path's arcs as Bézier curves
without changing the glyph). All fifteen are exact copies from **one
published release, Font Awesome Free 6.7.2** — checked path-for-path against
the package (2026-10-02):

| Callout type | Icon | Source |
|---|---|---|
| note | `pencil` | Font Awesome Free 6.7.2, solid — exact |
| abstract | `clipboard` | Font Awesome Free 6.7.2, **regular** — exact |
| info | `circle-info` | Font Awesome Free 6.7.2, solid — exact |
| todo | `circle-check` | Font Awesome Free 6.7.2, solid — exact |
| tip | `fire` | Font Awesome Free 6.7.2, solid — exact |
| success | `check` | Font Awesome Free 6.7.2, solid — exact |
| question | `circle-question` | Font Awesome Free 6.7.2, solid — exact |
| warning | `triangle-exclamation` | Font Awesome Free 6.7.2, solid — exact |
| failure | `xmark` | Font Awesome Free 6.7.2, solid — exact |
| danger | `bolt` | Font Awesome Free 6.7.2, solid — exact |
| quote | `quote-left` | Font Awesome Free 6.7.2, solid — exact |
| suggestion | `lightbulb` | Font Awesome Free 6.7.2, solid — exact |
| bug | `bug` | Font Awesome Free 6.7.2, solid — exact |
| example | `list-ol` | Font Awesome Free 6.7.2, solid — exact |
| compatibility | `list-check` | Font Awesome Free 6.7.2, solid — exact |

The table came to JMarkdown from Clew (below). Three of its paths — `bug`,
`list-ol` and `list-check` — were not exact Font Awesome Free paths (the first
two drifted slightly from 6.7.2; the third matched no Free release from 6.0.0
to 7.3.1); on 2026-10-02 they were replaced with the exact 6.7.2 ones, so the
whole table now comes from that one release.
A document that redistributes JMarkdown output containing callouts carries
these icons with it.

### Read at run time

`@fortawesome/fontawesome-free` (7.3.1) is a dependency of JMarkdown since
2026-10. When a custom callout type in the `Callouts` configuration names an
icon, that icon is read from the package's own `svgs/` directory and written
into the output in the same two forms. Only the named icons are read.

## Data and constants adapted from other work

These are facts or published formulae rather than code, recorded here for
credit:

- **CSS named colours** (`src/callout-latex.js`) — the 148 names and values
  of CSS Color Module Level 4, as published in the
  [`color-name`](https://github.com/colorjs/color-name) package (MIT,
  © 2015 Dmitry Ivanov).
- **OKLab colour space** (`src/callout-latex.js`) — the sRGB ⇄ OKLab matrices
  of Björn Ottosson, [“A perceptual color space for image processing”](https://bottosson.github.io/posts/oklab/)
  (2020), used to keep custom callout colours legible in print.

## Shared with Clew

`src/callouts.js`, `src/callout-definitions.js` and the callout styles in
`src/jmarkdown.css` are ported from Clew, the author's own note-taking
application built on JMarkdown, so that both render callouts with one
implementation.
