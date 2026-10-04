---
Title: Split
Resolve citations: true
Bibliography: refs.bib
Bibliography style: apa
HTML layout: split
Math macros:
  \newcommand{\R}{\mathbb{R}}
---

Before the chapters.

@chapter+(parts/a.md)
@chapter+(b.md)

@bibliography{title="References"}

@index{title="Index"}
