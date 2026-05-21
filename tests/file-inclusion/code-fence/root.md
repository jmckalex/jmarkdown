# code-fence test

Outside the fence, an inclusion would be expanded:

[[included.md]]

Inside a fenced block, the token must be left literal:

```
[[included.md]]
```

JMarkdown disables marked's 4-space-indent code tokenizer, so an indented
line on its own is ordinary text and SHOULD expand:

    [[included.md]]

And mid-paragraph, the token is not on its own line, so it stays literal: see [[included.md]] here.

Display math:

$$
[[included.md]]
$$
