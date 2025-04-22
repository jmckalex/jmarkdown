# JMarkdown

**JavaScript-empowered Markdown with dynamic syntax extensions**

Created by [J. McKenzie Alexander](mailto:jalex@lse.ac.uk)  
📅 15 April 2025

## What is JMarkdown?

`jmarkdown` is a powerful markdown interpreter that allows you to define new syntax extensions *within* the markdown file. These can be:

- **Simple**: Custom delimiters using any Unicode symbol.
- **Complex**: Regex-based extensions for matching patterned text in the file.
- **JavaScript functions**: Define a JavaScript function in special `<script>` code blocks and then call
	it directly from the markdown text, as the markdown file is processed.

It also allows post-processing of the HTML to manipulate output or modify the generated HTML with [Cheerio](https://cheerio.js.org/).

[🔗 View the detailed documentation!](https://jmckalex.org/software/jmarkdown/jmarkdown.html)

## Installation

Download the source and then type

```bash
npm install
```

and then

```bash
npm link
```

to make the `jmarkdown` executable available from the command line.

## Features

- Custom syntax (which can be disabled, if you prefer default Markdown syntax) for:
	- *Italics* (`/italics/`)
	- **Boldface** (`*boldface*`)
	- __Underline__ (`__underline__`)
- Subscript/Superscript: `H_2O`, `E=mc^2`
- Alignment blocks: right (`>> text`) and center (`>> text <<`)
- Add `.class` and `#id` to elements with directive syntax: `{.class #id}`
- Description lists with support for nested description lists.
- Support for emojis (:heart:), FontAwesome icons 
- GitHub-style tables and alerts
- Footnotes via `marked-footnotes`
- [Directives syntax](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444) for:
	- Commenting out content
	- Including/excluding sections (`Optionals:` in metadata)
	- Creating advanced containers for custom processing (strategic-form games, 
	  TiKZ diagrams, Mermaid diagrams, demonstrating markdown code, etc.)
- Math with MathJax
- Mermaid diagrams 
- TiKZ support via LaTeX and `dvisvgm` (SVG export)
- Extended list styles: alphabetical, Roman numerals, checklists
- Syntax highlighting via `highlight.js`
- Bibliographic references using [Biblify](https://jmckalex.org/software/bibtex-in-webpages.html)
- Auto-generated Table of Contents
- Strategic-form game
- Demo environments showing raw/parsed markdown (`:::markdown-demo`)
- File inclusion
- Metadata header for:
	- Configuration
	- Parameter variables (`{{myvar}}`)
	- Defining new markdown syntax
- Inline and post-processing scripts

## Example Syntax

**Italic + Bold + Underline Nesting:**

```markdown
__underline with *bold* and /italic/ is possible__
```

**Custom Directives:**

```markdown
:::comment
This content is hidden unless `{include=true}` is written 
after the `:::comment` opening tag above.
:::
```

**Strategic-form game:**

```markdown
:::game
           Rock   &  Paper & Scissors 
Rock     & (0,0)  & (-1,1) & (1,-1)
Paper    & (1,-1) & (0,0)  & (-1,1)  
Scissors & (-1,1) & (1,-1) & (0,0)

row: Player 1
column: Player 2
caption: Rock-Paper-Scissors
:::
```

**Mermaid Diagram:**

```markdown
:::mermaid
graph LR
  A --> B
  B --> C
:::
```

## License

MIT

## Author

&shy;J. McKenzie Alexander — [https://jmckalex.org](https://jmckalex.org)

