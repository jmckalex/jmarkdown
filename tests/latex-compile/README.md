# latex-compile — opt-in LaTeX compile check

A "security bumper" on top of the `tests/features` golden-file suite.

The golden-file suite proves the emitted `.tex` still matches a committed
snapshot. It does **not** prove that snapshot is valid LaTeX — the golden was
generated from the implementation itself, so on its own it is circular. This
script closes that gap: it wraps every `tests/features/**/*.expected.tex`
golden in a minimal document and runs `pdflatex` on it.

## Run

```
sh tests/latex-compile/run.sh
```

or

```
npm run test:latex
```

Exit status is non-zero if any fixture fails to compile.

## Why it is not part of `npm test`

`npm test` is deliberately toolchain-free — it needs only Node, so it runs
anywhere. This check needs a TeX installation plus packages (`sgame`,
`multirow`, `soul`, `minted`, …). Rather than make the whole suite depend on
TeX, this check is opt-in and **skips gracefully** when something is missing:

- No `pdflatex` on `PATH` → skips everything, exits 0.
- A category's required package not installed → skips that category's
  fixtures.
- `minted` fixtures also need Pygments (`pygmentize`) and `-shell-escape`;
  skipped if Pygments is absent.

A skip never fails the run — only a genuine compile error does.

## Per-category preamble

Each golden is compiled standalone in a `report`-class document (so the
`headings/` fixtures, which emit `\chapter`, have a class that defines it).
The extra packages loaded depend on the fixture's category:

| Category | Extra packages | Notes |
|---|---|---|
| `games/` | `sgame` | strategic-form game environment |
| `tables/` | `multirow` | `\multirow` for rowspan |
| `inline-syntax/` | `color`, `soul` | `\hl` for `==highlight==` |
| `code/` | `minted` | also needs Pygments + `-shell-escape` |
| `math/`, `conditionals/` | `amsmath` | |
| others | — | kernel macros only |

The preamble here is a reasonable stand-in, not necessarily byte-identical to
the `LaTeX preamble` a real book project configures. The point is to confirm
the emitted structure compiles — that every macro is defined and every
environment balances — not to reproduce a specific document's styling.
