/*
	This is a directive designed for typesetting side-by-side displays
	of markdown (or HTML) code on the left, and the compiled / formatted
	version on the right. 
*/
import hljs from 'highlight.js';

function createMarkdownDemo(marker) {
	return {
		level: 'container',
		marker: marker,
		label: "markdown-demo",
		tokenizer: function(text, token) {
			let lang = token?.attrs?.type ?? "markdown";
			let raw = "```" + lang + "\n" + text + "\n```";

			token['output'] = [];

			this.lexer.blockTokens(text, token['output']);
			return token;
		},
		renderer(token) {
			if (token.meta.name === "markdown-demo") {
				// There is always a spurious "\n" at the start, so throw it away to avoid
				// introducing unnecessary whitespace.
				let t = token.text.split("\n");
				t.shift();
				const code = t.join('\n');
				const lang = token?.attrs?.type ?? "markdown";
				const highlightedCode = hljs.highlight(code, {language: lang}).value;

				let output = this.parser.parse(token['output']);
				let display = `<div class='markdown-demo-container'>
	<div class='markdown-demo-code-label'>Markdown code</div>
	<div class='markdown-demo-output-label'>Markdown output</div>
	<div class='markdown-demo-markdown'>
	<pre><code class='hljs language-${lang}'>${highlightedCode}</code></pre>
	</div>
	<div class='markdown-demo-parsed'>
	${output}
	</div>
	</div>`;
				return display;
			}
		return false;
		}
	}
}

export default createMarkdownDemo;