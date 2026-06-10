# features — hand-crafted feature-level regression fixtures

Small isolated `.jmd` fixtures that exercise one feature each, with paired
goldens for HTML output (`*.expected.html`) and, where the LaTeX renderer
produces correct output, LaTeX output (`*.expected.tex`). A fixture may also
carry `*.expected.stderr` — a golden for the HTML run's stderr (the
build-warnings summary); it is checked only if present and never created by
`--bootstrap`, so warning-silent fixtures don't accumulate empty goldens.

Where the docs-snapshots suite gives broad coverage of real-world `.jmd`
documents, this suite gives surgical coverage: tiny inputs that pinpoint
exactly which renderer path failed when something breaks.

## Layout

```
tests/features/
├── code/           inline code, fenced with/without language
├── conditionals/   :TeX / :HTML inline and container forms
├── flags/          CLI flag variants (e.g. --normal-syntax)
├── footnotes/      single-, multi-paragraph, anonymous
├── games/          :::game directive — sgame LaTeX output
├── headings/       depth → \chapter/\section/... mapping
├── inline-syntax/  /italics/, *strong*, ==highlight==, **intense**,
│                   __underline__, sub/sup, nested
├── math/           $..$, $$..$$, \(..\), \[..\] passthrough
└── tables/         GFM tables, colspan/rowspan
```

## Run

```
sh tests/features/run.sh              # diff against goldens
sh tests/features/run.sh --update     # refresh existing goldens only
sh tests/features/run.sh --bootstrap  # create + refresh every golden
```

## Update vs bootstrap

The two write modes have different intent:

- **`--update`** refreshes existing goldens only. If `<name>.expected.tex` is
  not on disk, this mode does **not** create it. That makes the simple rule
  "absence = opt-out" stable across re-runs — deleted LaTeX goldens stay
  deleted.

- **`--bootstrap`** writes *both* goldens for every fixture, creating them
  if missing. Use this once after adding a new fixture, then prune any
  `*.expected.tex` whose LaTeX output is broken or misleading.

A typical workflow when adding a fixture:

1. Write `<category>/<name>.jmd`.
2. Run `sh tests/features/run.sh --bootstrap`.
3. Inspect the new goldens. Delete any `*.expected.tex` that looks broken.
4. Commit the fixture, the optional `*.flags` sidecar, and the goldens
   you chose to keep.

A typical workflow after a deliberate rendering change:

1. Run `npm test` — failures show the diff.
2. If the change is intentional, run `npm run test:update` (which calls
   `tests/run-all.sh --update`, which forwards `--update` to this suite).
3. Inspect the git diff under `tests/features/*/expected.*` and commit.

## Sidecar files

| File | Purpose |
|---|---|
| `<name>.jmd` | The fixture source. |
| `<name>.expected.html` | Golden for `--fragment` HTML output. |
| `<name>.expected.tex` | Golden for `--to latex` output. Optional; omit if LaTeX path is broken. |
| `<name>.flags` | One line of extra CLI flags appended to every render of this fixture (e.g. `--normal-syntax`). |

## LaTeX coverage

The LaTeX renderer is under active development (see project root
`CLAUDE.md`). The features suite snapshots only the LaTeX paths that
currently produce reasonable output. Where a LaTeX golden is absent, look
for the corresponding `*.jmd` to see what feature awaits LaTeX support.

Currently covered (with `.expected.tex`):
- All inline syntax (italics, strong, highlight, intense, underline, sub/sup, nested)
- `:TeX` / `:HTML` inline and container forms
- Footnotes (single-, multi-paragraph, anonymous)
- Code (inline `\mintinline`, fenced `minted`)
- Heading depth mapping (`\chapter` … `\subparagraph`)
- Math passthrough (`$..$`, `$$..$$`, `\(..\)` → `$..$`, `\[..\]` → `$$..$$`)
- Tables (GFM, colspan, rowspan via `\multicolumn` / `\multirow`)
- Strategic-form games (`:::game` → sgame `\begin{game}` environment)

Intentionally missing (current LaTeX path not yet meaningful):
- `flags/normal-syntax` — `--normal-syntax` is an HTML-author convenience.
