title: Demonstration of jmarkdown
date: 24 January 2025
author: J. McKenzie Alexander
CSS: test.css
highlight-theme: atom-one-light
moustache files: test.js
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
</style>
 

:div[*JMarkdown: a markdown variant with dynamic syntax extensions*]{.big .left}
 
Created by [J. McKenzie Alexander](mailto:jalex@lse.ac.uk)<br>
25 January 2025

>> “Let’s go crazy” ↵
>> /* &mdash; Prince*/

:::comment
[Get the markdown source!](jmarkdown.md)

Here is ⌜Some \verbatim{text}⌝
 
Here is ↑Small caps↑

Here is a quick math demo x-->y, a-->q, and longer-->words.  Isn't that neat? x0, x1, x2, and so on
are all variables, as is x10 and fox11. H_2O is water.

@dothis( Here /is/ *some* text_{10} )
:::

*Table of Contents*

{{TOC}}


# Motivation

This project started out small, and then grew in its ambition.  The beginning
was this: I’ve always found the default syntax of markdown to be a little
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
* Syntax for right-aligned and center-aligned text.
* Emojis (all [octocat supported](https://gist.github.com/rxaviers/7360908) emojis) :beers: :smile: I :heart: marked! :tada: 
* [FontAwesome](fontawesome.com) icons :fa-thumbs-up:
* GFM tables
* GFM alerts
* Footnotes[^a]
* [Directives syntax](https://talk.commonmark.org/t/generic-directives-plugins-syntax/444).  If you don’t
  know what this is, it’s an incredibly useful extension.  This enables 
	* The ability to comment out parts of the markdown file.
	* The ability to define “optionals” for including/excluding portions of the file (e.g., answers to a quiz)
* Support for math via MathJax
* Support for alphabetical and roman numeral lists.
* Code highlighting using `highlight.js`
* In-browser bibliographies generated via [Biblify](https://jmckalex.org/software/bibtex-in-webpages.html). 
  This are handled via JavaScript and are processed entirely within the browser, so there is no need to
  use `pandoc` as part of the workflow.
* Auto-generated table of contents.
* Typesetting strategic-form games.
* A useful environment for showing markdown code in its raw form, and processed form,
  side-by-side.
* A syntax extension for definition lists.
* A metadata header whose content is used for configuring jmarkdown and also for defining
  variables/parameters to be inserted into the document by a pre-processor.
  Given the header for this file, by simply typing this `{{homepage}}` I get this: {{homepage}}
* *The ability to define new markdown syntax*, simply, in the metadata header.
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


Here is the 

:::markdown-demo
>> This text is right aligned.
>> Multiple lines can be included as
>> line breaks are not assumed 
>> to be significant.
:::


:::markdown-demo
>> This text is center aligned.		 <<
>> Multiple lines can be included as <<
>> line breaks are not assumed       <<
>> to be significant.                <<
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

# Definition lists

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

Normal markdown, by default, doesn’t include syntax for creating definition lists.
The syntax used by `jmarkdown` for definition lists is shown below.  It also
allows definition lists to be nested.  For some reason, this doesn’t play well
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

```markdown
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
`⌜Text *like* /this/⌝` ends up appearing like this: ⌜Text *like* /this/⌝.  I also define `↑ ↑` to function as 
delimiters which convert the enclosed text to small caps,
so `↑Small caps↑` becomes ↑Small caps↑.

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






