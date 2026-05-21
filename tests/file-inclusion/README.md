# File-inclusion verification fixtures

Hand-run fixtures for `src/file-inclusion.js`. Each subdirectory exercises one
scenario; `run.sh` runs them all from `/tmp` (so `cwd != source dir`, which is
what surfaced audit finding #16).

## Run

```
sh tests/file-inclusion/run.sh
```

## What each scenario checks

| Dir | Expected behaviour |
|---|---|
| `basepath/` | Relative include resolves against the source file's directory, not the cwd. |
| `nested/` | Nested includes resolve against each file's own directory. |
| `cycle/` | A→B→A is rejected; warning names the trail; cycle token left literal. |
| `cycle-symlink/` | Self-reference via a symlink is canonicalised and caught. |
| `double/` | Same file included at two independent sites: both expansions appear (no warning). |
| `code-fence/` | Tokens inside fenced blocks and `$$…$$` math stay literal. Mid-paragraph tokens stay literal (block-only syntax). 4-space-indented lines DO expand, because JMarkdown disables the indented-code tokenizer. |
| `inline/` | Mid-sentence `[[file.md]]` is not expanded. |
| `missing/` | stderr warning naming the parent; `[[name.md]]` left in the output as a telltale. |
