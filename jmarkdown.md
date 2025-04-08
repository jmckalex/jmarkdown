title: Demonstration of jmarkdown
date: 24 January 2025
author: J. McKenzie Alexander
CSS: test.css
highlight-theme: atom-one-light
moustache files: test.js
script: <code>&lt;script&gt;</code>
HTML header: <!-- This is comment 1 -->
HTML header: <!-- This is comment 2
	which is a multiline comment
	and ends here -->
	<link href="https://fonts.googleapis.com/css2?family=Fira+Code&display=swap" rel="stylesheet">
HTML footer: <!-- This is comment 3 -->
HTML footer: <!-- This is comment 4
	which is a multiline comment
	and ends here -->
extension 1: [: :] true
	<span class='test' style='background: red'>${content1}</span>
	<span class='test' style='background: green'>${content1}</span>
	<span class='test' style='background: blue'>${content1}</span>
extension 2: @mark( ) true 
	<span class='mark' 
		style='border: 1pt solid black; padding: 6pt; border-radius: 6pt;'>${content1}</span>
extension 3: "" ""
	<span class="verbatim">${content1}</span>
extension 4: @explain( ) [false,true] 2
	<span class="texbook" style="font-family: 'Fira Code';">${content1}</span>
	gets interpreted as
	<span>${content2}</span>
extension 5: ⌜ ⌝ false
	<span class="texbook" style="font-family: 'Fira Code';">${content1}</span>	
homepage: <a href='https://jmckalex.org/home/'>https://jmckalex.org/home/</a>
extension 6: ↑ ↑ false
	<span style="font-variant-caps: small-caps;">${content1}</span>
extension 7: /[a-z]+-->/ 	/([a-z]+)-->([a-z]+)/		false		2
	<span>\(${content1}\rightarrow ${content2}\)</span>
extension 8: @dothis( ) true
	<span>Here is the content: ${content1}</span>
extension 9: /x[0-9]+/ 	/x([0-9]+)/		false		1
	$x_{${content1}}$
extension linebreak: /↵/   /(↵)/   false 1
   <br>
extension Q1: /Q1\./   /(Q1\.)/   false 1
   <p class='question'><em>This is the text of the first question.</em></p>
extension Q2: /Q2\./   /(Q2\.)/   false 1
   <p class='question'><em>This is the text of the second question.</em></p>
extension mark: /\[\d\d\]/   /\[(\d\d)\]/   false 1
   <span class='mark' style='float: right; padding: 3pt; border: 1pt solid black'>${content1}</span>
extension candidate: /Candidate:\s*[0-9]+/ 	/Candidate:\s*([0-9]+)/		false		1
	<span>Candidate: <strong class='candidate'>${content1}</strong></span><br>
------------------------------------


<style>
	div.foo p {
		background: red;
	}

	div.bar p {
		font-size: 24pt;
	}

	.right {
		float: right;
	}

	.red {
		background-color: red;
	}

	.goldenrod {
		background-color: goldenrod;
	}

	body{
		width: auto;
	}

	div.markdown-demo-markdown code.hljs {
		font-size: 10.5pt;
		background-color: white;
	}

	div.markdown-demo-parsed  { 
		padding: 14px;
	}

	td, th {
    vertical-align: top;
	}

	.markdown-demo-code-label, .markdown-demo-output-label {
		font-weight: bold;
	}

	.big {
		font-size: 24pt;
	}

	.left {
		text-align: left;
	}

	.markdown-demo-parsed ol, .markdown-demo-parsed ul, .markdown-demo-parsed p  {
		margin: 0pt;
	}

	code {
		font-size: 14px;
	}

	.lightgreen {
		background-color: lightgreen;
	}

	div.feedback {
		margin-top: 12pt;
	}

	div.feedback > p:first-child {
		margin-bottom: 6pt;
	}

	div.feedback .question {
		margin-bottom: 6pt;
		margin-top: 6pt;
	}

	div.feedback .mark {
		background-color: lightgrey;
	}

	sup, sub {
		line-height: 0pt;
	}

	.jmarkdown-right p {
		text-align: right;
	}

	.jmarkdown-right p:not(:first-of-type) {
		margin-top: 12pt;
	}

	.jmarkdown-center p {
		text-align: center;
	}

	.jmarkdown-center p:not(:first-of-type) {
		margin-top: 12pt;
	}
</style>
 

:div[*JMarkdown: JavaScript empowered markdown with dynamic syntax extensions*]{.big .left}
 
Created by [J. McKenzie Alexander](mailto:jalex@lse.ac.uk)<br>
16 February 2025

>> “Let’s go crazy” {.class1 .class2} ↵
>> /* &mdash; Prince*/ 

[View the `jmarkdown` source which generated this page!](jmarkdown.md)

*Table of Contents*

{{TOC}} 

This is a test.  More test.

# Motivation

This project started out small, and then grew in its ambition.  
The beginning was this: I’ve always found the default syntax of markdown to be a little
annoying.  Why aren't italics defined `/like this/` rather than `*like this*`?
It also seemed like boldface was better indicated `*like this*` rather than
`**like this**`.  And, finally, shouldn’t underlining be indicated `__like
this__`?  That just seems more&hellip; /rational/, you know.
 
From that initial goal &mdash; to create a custom markdown interpreter which catered to my own peculiar syntax
preferences &mdash; this project has since grown into a full-featured markdown interpreter which
allows you to define /custom syntax extensions/ in the markdown file itself! :fa-party-horn:
There’s also a lot more.

Anyway, `jmarkdown` uses [marked.js](https://marked.js.org/) to adjust and
extend the syntax of markdown in a number of ways.  It also preloads several
additional extensions from the marked.js extension library to make it behave more like multimarkdown, with some
additional features multimarkdown doesn’t have.  Here’s a list, in no particular order,
of all the features `jmarkdown` offers:

* Better syntax for italics, boldface, and underline as per above
* Better syntax for inline subscripts and superscripts, so that `H_2O` yields H_2O
  and `E=mc^2` yields E=mc^2.
* A syntax extension for right-aligned and center-aligned text.
* A syntax extension for adding classes and an id to the parent element.
* A syntax extension for inline comments.  This defaults to the `%` character,
	as in $\TeX$, but it can be changed.
* A syntax extension for description lists.	
* Emojis (all [octocat supported](https://gist.github.com/rxaviers/7360908) emojis) :beers: :smile: I :heart: marked! :tada: 
* [FontAwesome](fontawesome.com) icons :fa-thumbs-up:
* GFM tables
* GFM alerts
* Footnotes[^a] via `marked-footnotes`
* [Directives syntax](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444).  If you don’t
  know what this is, it’s an incredibly useful extension.  I use this to provide: 
	* The ability to comment out parts of the markdown file, i.e., multiline comments
		providing the functionality of C's `/*...*/` syntax.
	* The ability to define “optionals” for including/excluding portions of the file (e.g., answers to a quiz)
* Support for math via MathJax
* Support for alphabetical and roman numeral lists via `marked-more-lists`.
* Code highlighting using `highlight.js` via `marked-highlight`.
* In-browser bibliographies generated via [Biblify](https://jmckalex.org/software/bibtex-in-webpages.html). 
  These are handled via JavaScript and are processed entirely within the browser, so there is no need to
  use `pandoc` as part of the workflow.
* Auto-generated table of contents.
* Typesetting strategic-form games.
* A useful environment for showing markdown code in its raw form, and processed form,
  side-by-side.
* A metadata header whose content is used for configuring jmarkdown and also for defining
  variables/parameters to be inserted into the document by a pre-processor.
  Given the header for this file, by simply typing this `{{homepage}}` I get this: {{homepage}}
* *The ability to define new markdown syntax*, simply, in the metadata header.
* *The ability to insert arbitrary JavaScript code in `<script>` code blocks, defining and
	exporting functions to make then available in the markdown source*.  Think of this
	as being able to write your own JavaScript functions which generate HTML output,
	and calling them, with arguments, in the markdown source.
* Limited file inclusion capabilities. 

[^a]: Like this!

# Syntax adjustments

As noted above, here are the main “ordinary” changes for `jmarkdown`:

* Writing `/italics/` gives /italics/.
* Writing `*boldface*` gives *boldface*.
* These can be nested, so that `/*italic bold*/` is functionally equivalent to `*/bold italic*/` 
  which looks like this: /*italic bold*/ or */bold italic/*.
* Writing `__underline__` gives __underline__.
* And these can all be nested for phrases, so that `__underline with *bold* and /italic/ is possible__` gives
  __underline with *bold* and /italic/ is possible__.


Two new syntax extensions are introduced for flush-right and centered text.
Some more new text. 

:::markdown-demo
>> This text is right aligned.
>> Multiple lines can be included as
>> line breaks are not assumed 
>> to be significant.
>> 
>> And multiple paragraphs can be included
>> as well!
:::


:::markdown-demo
>> This text is center aligned.      <<
>> Multiple lines can be included as <<
>> line breaks are not assumed       <<
>> to be significant.                <<
>>                                   <<
>> Multiple paragraphs are           <<
>> supported, too!                   <<
:::
 

What about emojis?  For the octocat emojis, you put the name of the emoji between colons, so that
writing `:heart:` gives :heart:.  Consult the 
[list of octocat emojis](https://gist.github.com/rxaviers/7360908) for the full list&hellip; there are a lot.

For FontAwesome, you’ll need to link to the appropriate javascript package in the header but, once you do, then
you enter a FontAwesome icon by including the relevant class name.
So `:fa-thumbs-up:` yields :fa-thumbs-up:.  If you want to add additional styling class, you don’t
need to add the `fa-` prefix to them (they will be attached automatically).
Thus,  `:fa-thumbs-up lg rotate-90:` yields :fa-thumbs-up lg rotate-90:.  *N.B.* you need to
have the `fa-` part of the icon name /immediately/ following the opening colon.

Normal markdown doesn’t provide any easy way of adding classes or an id to elements.
`jmarkdown` uses the directive syntax (see below) to specify that classes or an id should
be added to the parent element.  So, for example, if `.red` and `.lightgreen` are classes with
the appropriate CSS definitions, then we can do the following: 

:::markdown-demo
1. This is a list item {.red}
2. This is another item {.lightgreen #foo}
3. This is yet another.
:::

# Disabled syntax

/Most/ of normal markdown syntax is supported, but there are two which are disabled.
These are:

1. The rule that two enpty spaces at the end of a line turn into a line break.
2. The rule that an indent of four spaces creates a code block.

The rule that two empty spaces indicates a line break is disabled because it is
a /really bad markup/ rule.  It's problematic enough to have semantically significant white
space at the /start/ of a line, but we've figured out how to deal with that after years
of working with Makefiles and Python.  But semantically significant whitespace at the
end of a line is deeply problematic because there's simply nothing in the source
file to reveal that you have two spaces at the end of a line, unless you have a
syntax highlighting scheme in your editor to flag that.  Anyway, `jmarkdown` provides
a better way of explicitly indicating line breaks via syntax extensions.

As for why I disabled indented code blocks&hellip; basically, that rule creates 
havoc with using indents to indicate hierarchical list structures.  If you want
to allow nested description lists or nest numeric lists, it's all-too-easy for
indented code blocks to be created when you don't want them.  Anyway,
fenced code blocks are far superior, so just use them.

# Tables and alerts

I’m not going to say much about tables, but here are some quick demonstrations.

## Example 1

:::markdown-demo
| H1      | H2      | H3      |
|---------|---------|---------|
| This cell spans 3 columns |||
:::


## Example 2

:::markdown-demo
| This header spans two        || Header A |
| columns<br> /AND/ two rows  ^|| Header B |
|-------------|-----------:|----------|
| Cell A      | Cell B     | Cell C   |
:::


## Alerts

A detailed description for these can be found [here](https://github.com/bent10/marked-extensions/tree/main/packages/alert).
The formatting below isn’t perfect, but that just requires some CSS tweaks.

:::markdown-demo
> [!NOTE]
> Highlights information that users 
> should take into account, even 
> when skimming.
:::

:::markdown-demo
> [!TIP]
> Optional information to help a 
> user be more successful.
:::

:::markdown-demo
> [!IMPORTANT]
> Crucial information necessary for 
> users to succeed.
:::

:::markdown-demo
> [!WARNING]
> Critical content demanding immediate 
> user attention due to potential risks.
:::

:::markdown-demo
> [!CAUTION]
> Negative potential consequences of 
> an action.
:::

# Description lists

<style>
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
	}
	dl dt {
		font-weight: bold;
	}

	dl dt:after {
		content: ":";
	}

	dl dd p {
		margin-bottom: 6pt !important;
	}

	dl dd p:not(:first-of-type) {
				margin-top: 6pt !important;
	}
</style>

Normal markdown, by default, doesn’t include syntax for creating description lists.
The syntax used by `jmarkdown` for description lists is shown below.  It also
allows description lists to be nested.  For some reason, this doesn’t play well
with the footnotes extension, so if anyone would like to help debug it, that
would be awesome.

::::markdown-demo
A defined term:: This is a term.

Another term:: Define this term.

A length term::  This definition needs
   to span multiple lines. And it is
   quite lengthy as well.  So
   very lengthy.

   Another term:: Definition lists can
      also be nested, if you want.

   And more terms:: As you can see.

   And paragraph breaks can also
   be included. And nested lists can
   also be included.

   1. Item one.
   2. Item two.
      a. Subitem one
      b. Subitem two
   3. Item three.

   Back to the definition.
::::

Here's the CSS used to format the above:

```html
<style>
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
	}
	dl dt {
		font-weight: bold;
	}

	dl dt:after {
		content: ":";
	}

	dl dd p {
		margin-bottom: 6pt !important;
	}

	dl dd p:not(:first-of-type) {
				margin-top: 6pt !important;
	}
</style>
```

# Math support

MathJax integration is enabled out of the box, with the default being including the math as SVG.
All forms of LaTeX syntax are supported (`$...$, $$...$$, \(...\), \[...\]`), with whatever text appears
between the math delimiters being fully protected from the markdown interpreter.  This means that
`$\alpha^*$` yields $\alpha^*$ rather than starting a boldface element.

# Enhanced lists

`jmarkdown` includes the `marked-more-lists` extension, which provides support for alphabetical and roman numeral 
lists.  

:::markdown-demo
1. item 1
2. item 2
    a. item 2a
        I.  sub item I
        II. sub item II
    b. item 2b
3. item 3
:::

Does this version support checkbox lists? Yes it does!

<style>
li:has(input[type="checkbox"]:first-child) {
    list-style: none;
    margin-left: -18pt;
}
</style>

:::markdown-demo
- [X] Done
- [ ] Still to do
:::

# Code highlighting

jmarkdown supports standard fenced code blocks with syntax highlighting.  E.g., here is some HTML:

```html
<p id='id' class='class1 class2'>
	This is some text in a paragraph with <em>emphasis</em> and <strong>boldface</strong>.
</p>
```

And here is some JavaScript:

```javascript
marked.use(
	markedHighlight({
		emptyLangClass: 'hljs',
		langPrefix: 'hljs language-',
		highlight(code, lang, info) {
			const language = hljs.getLanguage(lang) ? lang : 'plaintext';
			return hljs.highlight(code, { language }).value;
		}
	})
);
```

The syntax highlighting theme is set in the metadata header.

# Bibliographic support

`jmarkdown` generates an HTML file which is configured to use Biblify, a
Javascript-based “implementation” (so to speak) of a subset of BibTeX commands
which is processed entirely within the browser.  I initially wrote this to
provide bibliographic support for [reveal.js](https://revealjs.com/)
presentations, but that code proved useful to include here, too.  You can
specify the bibliographic style and the bibliography database file which is
used.  (At the moment, this is hard-coded into the jmarkdown source, so I need
to fix this in the future.)

If you add any bibliographic citations they will be parsed. So, for example,
writing `\`&shy;`cite{Alexander:2024}` will be processed and appear like this: \cite{Alexander:2024}, with
the bibliography being appending to the end of the document after any footnotes.  If you have
requested a table of contents, an entry for that will be automatically included. 

# Directives syntax

The `marked-directives` extension provides support for directives.  This is a particular form
of markdown which allows you to include inline elements, block elements, or higher-level containers.
For example, an inline element, like a span, is created like this: `:span[contents]{#id .class1 .class2 key=value}`.
So, if the class `.red` sets the background of an element to red, then you insert a 
red span like this:

:::markdown-demo
:span[This is a red span]{.red}
:::

Block-level directives are prefixed with `::`.  To insert an empty unordered list with a specific
id (say, to target with JavaScript later), just type `:`&shy;`:ul{#my-id}`.  If you inspect the elements
after this paragraph, you should find just such an empty element.

::ul{#my-id}

Where directives become particularly interesting is when we use them as containers.  Here’s how to
enclose part of your markdown file in a `<section>` tag:  

```markdown
:::section{#my-section .goldenrod}
This will appear wrapped in a 'section' tag in the output HTML, 
with the indicated id and classes applied.

1. A list.
2. Another list item.
:li[The third list item]{.red}
4. A fourth list item.

Here is some math: $E=mc^2$.
:::
```

Did you see the use of the inline directive in the list?  That behaves as you think it should, i.e.,

:::section{#my-section .goldenrod}
This will appear wrapped in a 'section' tag in the output HTML.
(Use 'Inspect Elements' under Developer Tools to confirm...)

1. A list.
2. Another list item.
:li[The third list item]{.red}
4. A fourth list item.

Here is some math: $E=mc^2$.
:::

The tag name which appears after the `:`&shy;`:`&shy;`:` can be a predefined HTML tag, or it
can be a custom web element you’ve defined yourself.  For example, when I'm marking exams
I define a minimal custom web element named `exam-feedback` so I can write

```markdown
:::exam-feedback
Exam feedback goes here...
:::
```

and that custom element will add some additional HTML decorations around the text.  It also means
that you can target that particular set of feedback for inserting local bibliographies with Biblify. 
(See the [Biblify](https://jmckalex.org/software/bibtex-in-webpages.html) website for details.)

## Comments and optionally included text

It’s possible to define new directives which provide additional functionality.  Since most markdown
flavours don’t provide a way to comment out text, in the markdown source, `jmarkdown` provides a container
directive which does that.  So writing the following:

```markdown
:::comment
All of this text will be ignored.

And the comment can span multiple blocks.
:::
```

will cause everything from the start to the end of the directive to be omitted from the output.
What if you decide, later, that you want to include it?  Simply pass a setting which says to do that:

```markdown
:::comment{include=true}
All of this text will now be included in the output.

And the comment can span multiple blocks.
:::
```

The `comment` directive is intended for commenting out parts of the markdown source.  Sometimes,
though, you might want to mark parts of the text for optional inclusion, for reasons that
have nothing to do with it being a comment.  Like answers for a question set.  To handle 
these cases, `jmarkdown` supports the following line in the metadata header:

```yaml
Optionals: answers directions[true] ...other names...
```

The line after `Optionals` should be a space-separate list of names, for the custom directives.
All optionals will default to being /not included/.  If you would like them to default to
/being included/, simply put `[true]` after the name.  If you want to be pedantic, there’s
no harm in adding `false` between the square brackets syntax (e.g., `answers[false]`).

In addition, directives can include more than three `:`, to indicate higher levels of nesting.
So, in our hypothetical quiz case, you could write the following:

```markdown
::::my-quiz
1. What is the answer to this question?
   :::answer
   *Answer.* I don't know.
   :::

2. What is the answer to this harder question?
   :::answer
   *Answer.* I still don’t know!

   Why are you asking me?
   :::

3. Write your thoughts about this exam.
::::
```

And that would appear as follows:

::::my-quiz
1. What is the answer to this question?
   :::answer
   *Answer.* I don't know.
   :::

2. What is the answer to this harder question?
   :::answer
   *Answer.* I still don’t know!

   Why are you asking me?
   :::

3. Write your thoughts about this exam.
::::

If you want to generate the answers, simply change the declaration in the header to

```yaml
Optionals: answers[true] directions[true] ...other names...
```

and you’ll get 

::::my-quiz
1. What is the answer to this question?
   :::answer{include=true}
   *Answer.* I don't know.
   :::

2. What is the answer to this harder question?
   :::answer{include=true}
   *Answer.* I still don’t know!

   Why are you asking me?
   ::: 

3. Write your thoughts about this exam.
::::
 
> [!TIP] If you were going to be doing this a lot, I would suggest defining
> your own custom directive for `answer` rather than using the simple method
> provided by the `Optionals` header line.  Why?  Because defining your 
> own custom directive would allow the “*Answer.*” text to be automatically
> generated, so you wouldn’t have to write that on every line.

## Strategic-form games 

`jmarkdown` defines a couple of extra directives which I find useful.
The first is for showing strategic-form games.  The syntax is pretty
straighforward and is virtually the same as the notation used for typesetting
strategic-form games in LaTeX.  The only difference is that no `\\` is
needed at the end of the line, and there is no `&` character before the first
column strategy label.  Here’s what it looks like:

::::markdown-demo
:::game 
		     Rock   & Paper  & Scissors
Rock     & (0,0)  & (-1,1) & (1,-1)
Paper    & (1,-1) & (0,0)  & (-1,1)  
Scissors & (-1,1) & (1,-1) & (0,0)

row: Player 1  
column: Player 2
caption: The game of Rock-Paper-Scissors
:::
::::

The extension parses the input and generates a `<table>` having the right
form.  All of the grid lines are drawn by CSS and can be customized.
`jmarkdown` throws in some CSS at the start of the HTML output so that the
games look more-or-less right out of the box.

One cool thing is that the text give to the `row`, `column` and `caption`
options can (a) span multiple lines (if you have a /really/ long name
for the game) and (b) are passed through the markdown interpreter so
you can do some tricksy things with it. E.g.,

::::markdown-demo
:::game 
		     Rock   & Paper  & Scissors
Rock     & (0,0)  & (-1,1) & (1,-1)
Paper    & (1,-1) & (0,0)  & (-1,1)  
Scissors & (-1,1) & (1,-1) & (0,0)

row: /Player 1/
column: *Player A_1 $\alpha$*
caption: The game of 
	:span[Rock-Paper-Scissors]{.goldenrod}<br>
	has a caption<br>
	with math $\int_{-1}^{+1}f(x)\,dx$
:::
::::
 
## Demonstrating markdown code

You’ll have noticed that this web page has a lot of side-by-side
demonstrations of markdown code and the formatted output.
That, too, was generated using a special `jmarkdown` extension.
A special directive named `markdown-demo` takes its content
and creates two `<div>` containers, with the left showing
the markdown code and the right showing the formatted output. So,
for example, the following:

```markdown
:::markdown-demo
:span[This is a coloured span.]{.goldenrod}

1. This is a list *containing markdown code*
2. Isn’t that /cool/?
   a. A sublist item with math $\alpha + \beta$.
   b. Another sublist item.
   c. And another.
3. So there you are.
::: 
```

generates the following:

:::markdown-demo
:span[This is a coloured span.]{.goldenrod}

1. This is a list *containing markdown code*
2. Isn’t that /cool/?
   a. A sublist item with math $\alpha + \beta$.
   b. Another sublist item.
   c. And another.
3. So there you are.
:::

That’s very useful because you only have to write the markdown
code once, which guarantees that the demo and the output
will never be out of sync.


# Table of contents

If you want a table of contents included, simply add `{{TOC}}` to the relevant point of the markdown file.  Easy.

# Metadata header

When `jmarkdown` starts processing the file, it checks to see if the first line of the file contains a
line of the following form:

```yaml
key description: value assigned to the key
```

If it finds something like that, it assumes that the document contains a metadata header.  It then 
reads the header until it encounters an empty line.  It strips off the header, processes it, and then
pushes the rest of the file through the markdown interpreter.  When processing the header, the values
assigned to keys can span multiple lines, and the same key can appear multiple times.  Here is an
example of the header for this file:

```yaml
title: Demonstration of jmarkdown
date: 24 January 2025
author: J. McKenzie Alexander
CSS: test.css
highlight-theme: atom-one-dark
HTML header: <!-- This is comment 1 -->
HTML header: <!-- This is comment 2
	which is a multiline comment
	and ends here -->
HTML footer: <!-- This is comment 3 -->
HTML footer: <!-- This is comment 4
	which is a multiline comment
	and ends here -->
```

Files specified as `CSS` will be added to `<link>` tags in the `<head>` of the document.  Anything
given to `HTML header` will be appended, in order, to the /very end/ of the `<head>`.  This allows you to
specify more complicated script tags, meta tags, etc.  The same happens for `HTML footer` except
those are appended to the very end of the `<body>` after everything else, useful for scripts
which need to appear at the end.

## Defining new markdown syntax (simple)

In the metadata header, you can define new markdown syntax by simply specifying the starting delimiter,
the ending delimiter, and the replacement text as HTML.  (With an optional argument, you can also indicated
whether the contents of the new delimiter should be parsed as markdown text.)  Anything between the 
delimiters is then inserted into the defined replacement text every place that `${content}` appears.  Here
are three examples.  Suppose the metadata header includes the following:

```yaml
extension 1: [: :] true
	<span class='test' style='background: red'>${content}</span>
	<span class='test' style='background: green'>${content}</span>
	<span class='test' style='background: blue'>${content}</span>
extension 2: @mark( ) 
	<span class='mark' 
		style='border: 1pt solid black; padding: 6pt; border-radius: 6pt'>${content}</span>
extension 3: "" ""
	<span class="verbatim">${contents}</span>
```

Each new defined extension must begin with the keyword `extension` and then a following unique identifier.
In the normal case, we specify the opening and closing delimiters.  These can be any normal text
characters, in sequence, provided that there are no spaces in the delimiters.  (More complex cases will
be considered in a moment.)  The third argument is optional, but if it is `true` then the contents surrounded
by the delimiter will be parsed as markdown input, otherwise it will be assumed to be `false` and the
contents surrounded will not be processed as markdown input.

There is an optional fourth argument.  If it is an integer, it specifies how many /arguments/ are given to
the extension.  The arguments are comma delimited.  If you need to specify an argument that contains a comma,
you can give it as a "string", where quotes can be included using the normal escape syntax of \\".
If more than one argument is given, then the replacement should 
not just reference `${content}` but rather `${content1}` or `${content2}` or so on, where the integer
refers to the number of the argument.

If more than one argument is specified, then the third argument can take a special form.
Instead of just /true/ or /false/, it can be an array of values indicating whether the 
i^{th} argument should be pushed through the markdown processor.  If the i^{th} entry in 
the array is true, that argument will be processed as markdown text.  If the i^{th} entry
is false, that argument will be treated as verbatim text.

The first defined extension converts `[:Some H_2O *text* /ASDF/:]` into [:Some H_2O *text* /ASDF/:] (The 
spaces between the `<span>` elements appears because the definition text contains a tab before each span.)

The second defined extension converts `@mark(68)` into @mark(68) 

The third defined extension treats double-double quotes as verbatim indicators.  (It also illustrates using a different
nonspace character as the separator.)  So `""/italic/""` becomes ""/italic/"".  

Since `jmarkdown` supports Unicode, custom extensions give you the ability to define a lot of
extensions which provide functionality while remaining readable.  For example, in this file I define ""⌜⌝"" to
serve as delimiters for verbatim text, allowing me to type arbitary markdown code.  But I also enclose the code
in a `<span class="texbook">` element, and then target it with a little bit of JavaScript, allowing the verbatim
code to be typeset like in Knuth’s TeXBook, where spaces are indicated with little square caps.  The result?
`⌜Text *like* /this/⌝` ends up transformed into ⌜Text *like* /this/⌝.  I also define `↑ ↑` to function as 
delimiters which convert the enclosed text to small caps,
so `↑Small caps↑` becomes ↑Small caps↑.

# Scripting capabilities

One addition feature of `jmarkdown` is the ability to define JavaScript functions which
can be embedded in the markdown code and invoked on pieces of markdown to perform additional
transformations.  The JavaScript functions can either return raw HTML, to be inserted into
the output, or markdown code, to be processed in either inline- or block- mode.

## Inline scripts (text generation and manipulation)

Here's a simple example (we’ll see more complicated examples below).  Suppose the markdown code contains the following:

```html
<script data-type='jmarkdown'>
	function reverser(str) {
    	return str.split('').reverse().join('');
	}

	export_to_jmarkdown("reverser"); 
</script>
```

The `data-type='jmarkdown'` tells `jmarkdown` that the script code should actually be processed
rather than simply passed through quietly to the output HTML file.  What `jmarkdown` does behind-the-scenes
is to extract the code contained in the {{script}}  tag and evaluate it in a Node virtual machine.  The
context of that virtual machine is shared across all jmarkdown script environments, so variables and
functions defined in one script block are accessible in all the others.  Normally, the script
block containing the jmarkdown code is simply removed from the output.  (We will later see
how to put arbitrary HTML code in place of the script block.)
The `export_to_markdown()` function
takes, as its first argument, the name of the function to “export” to the `jmarkdown` interpreter.

What happens when a function is exported is the following:

1. A new inline extension is created and registered with the markdown interpreter.
	By default, the extension scans the markdown code looking for text of the form
	`functionName(...text not containing a left parenthesis...)`.  So, in this case,
	the markdown interpreter will look for text of the form `reverser(...)`.

2. When such a construct is found, the defined function will be evaluated with the text
	enclosed in parentheses passed as a string.  So, in this example,
	jmarkdown code `reverser(Text to reverse)` will be evaluated in the Node virtual
	machine as `reverser("Text to reverse")`.  Notice that in the simple, default use
	case that you don’t need to quote the argument.

3. If the function returns a string, that string will be inserted into the HTML output
	replacing the the original text, as shown below.  You can basically think of this
	as though you’ve embedded a JavaScript function in markdown source code, where the return
	value of the function replaces the function call.

:::markdown-demo{type=html}
<script data-type='jmarkdown'>
	function reverser(str) {
     return str.split('').reverse().join('');
	}

	export_to_jmarkdown("reverser"); 
</script>

And here is how it is used: reverser(Text to reverse).
:::


What happens if you attempt to include markdown text in the argument to the function?  Unless
you specifically request that the text should be interpreted, it will simply be passed through
as uninterpreted text.  For example:

:::markdown-demo
reverser(Text /containing/ *markdown* code.)
:::

In order to request that the text be interpreted, you need to pass a second argument to
`export_to_jmarkdown()`, telling it what to do.  For example:


:::markdown-demo{type=html}
<script data-type='jmarkdown'>
	function reverser2(str) {
     return str.split('').reverse().join('');
	}

	export_to_jmarkdown("reverser2", {tokenize: "inline"}); 
</script>

reverser2(Text /containing/ *markdown* code.).
:::


The default way of handling embedded JavaScript functions works as long as the function
arguments aren’t too complicated.  You could, for example, interpret the string passed
to the function as containing multiple arguments, as follows:

:::markdown-demo{type=html}
<script data-type='jmarkdown'>
	function repeater(str) {
		let [text, n] = str.split(",");
		text = text.trim();
		n = parseInt(n);
		return text.repeat(n);
	}

	export_to_jmarkdown("repeater", {tokenize: "inline"}); 
</script>

repeater(I :heart: /Jmarkdown/ <br>, 3)
:::

Since everything between the opening and closing parentheses is interpreted as a single
string, this means that you have the freedom to create your own syntax for passing
data to a function.  For example, here’s a function which creates a button with
an attached function using something akin to javascript’s `=>` notation:

:::markdown-demo{type=html}
<script data-type='jmarkdown'>
	function button(str) {
		let [label, f] = str.split("=>");
		return `<button onclick='${f}()'>${label}</button>`;
	}

	export_to_jmarkdown("button");
</script>

<script>
	function hello() {
		alert("Hello there!");
	}
</script>

Press here for a secret message: button(Click me => hello)
:::

However, if you need nested function calls, that won’t work because of the requirement
that the argument text cannot contain a `)`.  If you need more complicated arguments,
you need to tell `export_to_jmarkdown` to not assume that the argument structure is simple.
When you export a function in this way, you are promising `jmarkdown` that you will properly
handled quoted strings, etc., so that the tokenizer can just scan the source text
looking for balanced parentheses `(...)` where the start and end paretheses do not appear
in strings.  This allows us to handle situations like the following:

:::markdown-demo{type=html}
<script data-type='jmarkdown'>
	// Perform ROT13 encoding on a string 
    function rot13(str) {
        return str.replace(/[a-zA-Z]/g, function(char) {
            // Get the ASCII code
            const code = char.charCodeAt(0);
            // Determine the base (97 for lowercase, 65 for uppercase)
            const base = code >= 97 ? 97 : 65;
            // Apply ROT13 transformation
            return String.fromCharCode(base + (code - base + 13) % 26); 
        });
    }
	export_to_jmarkdown("rot13", {simple: false}); 
</script>

Original string: Hello world! <br>
ROT-13 encoded: rot13("Hello world!") <br>
ROT-13 twice: rot13(rot13("Hello world!"))
:::

Complex functions should only return HTML to be inserted as replacement text, because
attempted anything too complicated while requesting the output be parsed can confuse
the markdown interpreter.  If you /really/ need to, though, you can use `marked.parse()`
as follows: 

:::markdown-demo{type=html}
<script data-type='jmarkdown'>
    function colorize(color) {
    	let text = `Text before the list.
1. A list item
2. Another list item
3. A third list item

Text after the list`;
		let html = marked.parse(text);
		console.log(html);
		return `<div style='background-color: ${color}'>${html}</div>`;
    }

	export_to_jmarkdown("colorize", {simple: false}); 
</script>

colorize("lightblue")
:::

What if you want to replace the jmarkdown {{script}} tag with some HTML, in addition 
to evaluating all the JavaScript inside it?  A global variable named `output` is defined
which allows you to specify the html which should be inserted in place of the {{script}}
element.  The value of `output` is set to the empty string before each jmarkdown
script element is processed.  Here is an example which also shows how variables and
function definitions declared in one script element are available to another:


:::markdown-demo{type=html}
<script data-type='jmarkdown'>
	let cheer = "Hip, hip, hooray!";
	let boo = "Hiss...";
	function doSomething(str) {
		return "Here is a string: " + str;
	}
	output = "<!-- This comment will be inserted but not visible -->";
</script>

<script data-type='jmarkdown'>
	output = `Let's have a cheer: '${cheer}'!<br>`;
	output += `And let's have a boo: '${boo}'<br>`;
	output += "And here's something else... " + doSomething('text');
</script>
:::


Here’s a fun example showing what you can do with this.  Here’s
a function which, when given the name of an image file, embeds
a base64 encoded version of the image into the HTML output from `jmarkdown`.

```html
<script data-type='jmarkdown'>
	const fs = require('fs');
	const path = require('path');
 
	function imageToBase64(imagePath) {
	   try { 
	        // Read the image file
	        const imageBuffer = fs.readFileSync(imagePath); 
	        
	        // Convert buffer to base64
	        const base64String = imageBuffer.toString('base64'); 
	        
	        // Get the mime type based on file extension
	        const mimeType = getMimeType(imagePath); 
	        
	        // Return the complete base64 string with data URI scheme
	        return `data:${mimeType};base64,${base64String}`;
	    } catch (error) {
	        throw new Error(`Error converting image to base64: ${error.message}`);
	    }
	}
	
	function getMimeType(filePath) {
	    const extension = path.extname(filePath).toLowerCase();
	    const mimeTypes = { 
	        '.png': 'image/png',
	        '.jpg': 'image/jpeg',
	        '.jpeg': 'image/jpeg',
	        '.gif': 'image/gif',
	        '.webp': 'image/webp',
	        '.svg': 'image/svg+xml',
	        '.bmp': 'image/bmp'
	    };
	    
	    return mimeTypes[extension] || 'application/octet-stream';
	}

	function embedImage(path, style) {
		let img = imageToBase64(path);
		return `<img style='${style}' src='${img}'>`;
	}
	
	export_to_jmarkdown("embedImage", {simple: false});
</script>
```

<script data-type='jmarkdown'>
	const fs = require('fs');
	const path = require('path');
 
	function imageToBase64(imagePath) {
	   try { 
	        // Read the image file
	        const imageBuffer = fs.readFileSync(imagePath); 
	        
	        // Convert buffer to base64
	        const base64String = imageBuffer.toString('base64'); 
	        
	        // Get the mime type based on file extension
	        const mimeType = getMimeType(imagePath); 
	        
	        // Return the complete base64 string with data URI scheme
	        return `data:${mimeType};base64,${base64String}`;
	    } catch (error) {
	        throw new Error(`Error converting image to base64: ${error.message}`);
	    }
	}
	
	function getMimeType(filePath) {
	    const extension = path.extname(filePath).toLowerCase();
	    const mimeTypes = { 
	        '.png': 'image/png',
	        '.jpg': 'image/jpeg',
	        '.jpeg': 'image/jpeg',
	        '.gif': 'image/gif',
	        '.webp': 'image/webp',
	        '.svg': 'image/svg+xml',
	        '.bmp': 'image/bmp'
	    };
	    
	    return mimeTypes[extension] || 'application/octet-stream'; 
	}

	function embedImage(path, style) {
		let img = imageToBase64(path);
		return `<img style='${style}' src='${img}'>`;
	}
	
	export_to_jmarkdown("embedImage", {simple: false});
</script>


:::markdown-demo
Here is a paragraph containing some
math $\alpha+\beta$ and an embedded
image: embedImage('./nature.jpg', "width: 100px;")
More text after it.

:::


## Post-processing scripts

In addition, `jmarkdown` supports the inclusion of JavaScript which
should be invoked once the final document has been assembled.  In this case,
once `jmarkdown` has finished constructing the HTML for the entire document,
it will parse the document using [cheerio](https://cheerio.js.org/), which provides jQuery-like
functionality for manipulating the DOM.  (Note that cheerio provides a lightweight DOM
implementation and only supports a subset of the jQuery syntax.)  The cheerio
object can be accessed via `$`, and access to the filesystem (using the `fs` module provided
by Node) is via the variable `fs`.

The HTML generated by `jmarkdown` is already loaded into cheerio.  If you want to inspect
the raw HTML source, that is available in the global variable `html`.  If you make changes
to the DOM that you want to be reflected in the HTML file exported by `jmarkdown`, you
will need set `html` to the new content.  More than one `jmarkdown-postprocess` script tag
can be included in the markdown file: `jmarkdown` will simply collect the contents of each
of those script tags and will evaluate them in order.

For example, the following script will open a file named `output.txt` in the same
directory as the markdown file being processed, then it will convert each of the 
`<h1>` headings to upper-case, writing each new heading to `output.txt`.  Once 
that’s done, the HTML contents to be exported by `jmarkdown` are set to the new state
of the DOM and the file `output.txt` is closed.

```html
<script data-type='jmarkdown-postprocess'>
	const writeStream = fs.createWriteStream('output.txt');
	$('h1').each((index, element) => {
		let t = $(element).text().toUpperCase();
		writeStream.write(t + '\n');
		$(element).text(t); 
	});
	html = $.html();
	writeStream.end();
</script>
```


Because all of the markdown-magic has already been performed by the post-processing
state, the above changes will not, of course, be reflected in the table of contents.

While post-processing scripts don’t do anything which couldn’t already be done by
including normal {{script}} tags to be evaluated in a browser, there are several things which
are nice about them:

1. Post-processing scripts can permanently change the HTML source which is exported,
	whereas a script tag evaluated in the browser will leave the original source state visible
	to anyone who checks.

2. A post-processing script has access to the file system, so it becomes possible to
	extract information from the document and create auxiliary files based on the structured
	content.

## A detailed example

I use `jmarkdown` for writing feedback on exam questions and storing the marks.  The
markdown file is structured as follows (ignoring the metadata header), with each
student’s feedback and grade noted.

::::markdown-demo
Candidate: 43786
File: ⌜student exam file name.pdf⌝

:::feedback
Q1.

...text containing feedback on question 1... [68]

Q2.

...text containing feedback on question 2... [75]
::: 
:::: 

In the metadata header, I've written several extensions which use regular expressions
to do pattern matching on the candidate number, file name, question indicators, and
the mark on each question.  For example, here are the extensions which format the
candidate number, the question text, and the mark for each question:

```markdown
extension candidate: /Candidate:\s*[0-9]+/ 	/Candidate:\s*([0-9]+)/		false		1
	 <span>Candidate: <strong class='candidate'>${content1}</strong></span><br>
extension Q1: /Q1\./   /(Q1\.)/   false 1
	 <p class='question'><em>This is the text of the first question.</em></p>
extension Q2: /Q2\./   /(Q2\.)/   false 1
	 <p class='question'><em>This is the text of the second question.</em></p>
extension mark: /\[\d\d\]/   /\[(\d\d)\]/   false 1
	 <span class='mark' style='float: right; padding: 3pt; border: 1pt solid black'>${content1}</span>
```

I’ve defined the `feedback` container to add text and wrap the content in a `<div class='feedback'>` element.

With this amount of markup automatically generated, it then becomes trivial to define a 
post-processing script which does the following:

1. Move any footnotes mentioned in the feedback text from the end of the HTML page,
	which is where `marked-footnotes` automatically puts them, to the bottom of the
	`div.feedback` container.  (The footnote indicators in the text are already in
	the right place.)

2. Process any bibliographic citations used in the feedback for each student, and append
	an auto-generated bibliography to the end of each `div.feedback` containiner.
	This uses [Biblify](https://jmckalex.org/software/bibtex-in-webpages.html) to do the
	heavy lifting.

3. Loop through the entire document and, for each student, calculate the grade for
	the entire exam by extracting the marks from each `span.mark` and calculating the
	correct weighted average.  Then append an HTML span element containing the final grade
	for the exam to the end of the `div.feedback` container for that student.

4. Once /that's/ done, loop through the DOM and do the following:
	a. Save the feedback for each student in a separate file named '`Candidate NNNNN.html`', where
		`NNNNN` is that student’s candidate number.  If desired, `cheerio` can be used to
		put the same `<head>` at the start of each file so that the feedback will be pretty-printed
		using the right CSS, etc.
	b. Create a CSV file which contains, on each line, a student’s candidate number,
		followed by their mark on each individual question, and the aggregate mark
		for the exam.  This file can then be imported straight into Excel.

Those tasks would, admittedly, be a little easier to do if I /either/ used
another container which wrapped the candidate number, file information, and
feedback container /or/ if I simply put the feedback container around all of
the student information.  But that would make the text a little less “natural”
in how it was read.  The important thing to note, though, is how much can be
done by taking advantage of naturally occuring textual patterns, using regular
expressions to find them, then automatically add structuring information
(classes, etc.) which can then be used to compile/extract information during
the post-processing phase.

 
# File inclusion 

<script>
$(".texbook").each(function() {
	let text = $(this).html().replace(/ /g, '␣');
	console.log(text);
	$(this).html(text);
});
</script>

Any markdown or html file specified between `[`&shy;`[...]]` will be inserted at that point in the 
document.  Markdown will be inserted /before/ processing, and HTML will be inserted /after/ processing.
At the moment, file inclusion isn’t recursive.

# Footnotes






