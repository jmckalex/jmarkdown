# docs-snapshots — golden-file regression suite

Renders every `.jmd` file listed in `fixtures.txt` (using `docs/<name>.jmd` as
the source) with `--fragment` mode, and diffs the output against a committed
golden at `expected/<name>.expected.html`.

`--fragment` strips the document chrome (CDN URLs for MathJax/FontAwesome/
Mermaid/hljs, the inverse-search injector, body classes set by config) so the
goldens capture *only* the rendered body — a true rendering test that does
not break when a CDN URL or theme changes.

## Run

```
sh tests/docs-snapshots/run.sh
```

Exits non-zero on any diff or missing golden.

## Update goldens

After an intentional rendering change, regenerate goldens and inspect the git
diff before committing:

```
sh tests/docs-snapshots/run.sh --update
git diff tests/docs-snapshots/expected/
```

`npm run test:update` does the same thing.

## Add a fixture

1. Add a line with the bare basename (no `.jmd`, no path) to `fixtures.txt`.
2. Run `sh tests/docs-snapshots/run.sh --update` to populate the golden.
3. Inspect `tests/docs-snapshots/expected/<name>.expected.html` to verify the
   output is what you expect.
4. Commit both the fixture entry and the golden.

## Why some `docs/*.jmd` files are excluded

See the comments at the top of `fixtures.txt`. The short list:

| Excluded | Reason |
|---|---|
| `introduction.jmd` | Uses the `:today` directive (date-dependent). |
| `bibliographic-support.jmd` | Requires external BibTeX + network fetches. |
| `tikz-diagrams.jmd` | Requires the lualatex + dvisvgm toolchain. |
| `inline-scripts.jmd` | Embeds `./nature.jpg` resolved relative to cwd; brittle. |

If we later need coverage for these features, hand-crafted minimal fixtures
will live under `tests/features/` (Phase 2).
