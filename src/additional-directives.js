/*
	These are some additional directives I've defined which seem useful.
	It's an experiment to see whether this capability can be used to give
	jmarkdown additional commands like LaTeX.
*/

const additionalDirectives = [
	{
		'level': 'block',
		'marker': "::",
		label: "title",
		renderer(token) {
			if (token.meta.name === "title") {
				let html = marked.parser(token.tokens);
				html = html.replace(/<\/?p>/g, '');
				return `<div class="title">${html}</div>`;
			}
			return false;
		}
	},
	{
		'level': 'block',
		'marker': "::",
		label: "subtitle",
		renderer(token) {
			if (token.meta.name === "subtitle") {
				let html = marked.parser(token.tokens);
				html = html.replace(/<\/?p>/g, '');
				return `<div class="subtitle">${html}</div>`;
			}
			return false;
		}
	},
	{
		'level': 'block',
		'marker': "::",
		label: "author",
		renderer(token) {
			if (token.meta.name === "author") {
				return `<div class="author">${token.text}</div>`;
			}
			return false;
		}
	},
	{
		'level': 'block',
		'marker': "::",
		label: "institution",
		tokenizer(text, token) {
			text = text.trim();
			text = text.replaceAll("\n", "<br>");
			token.tokens = this.lexer.inlineTokens(text);
		},
		renderer(token) {
			if (token.meta.name === "institution") {
				let html = marked.parser(token.tokens);
				html = html.replace(/<\/?p>/g, '');
				return `<div class="institution">${html}</div>`;
			}
			return false;
		}
	},
	{
		'level': 'block',
		'marker': "::",
		label: "date",
		renderer(token) {
			if (token.meta.name === "date") {
				const content = this.parser.parseInline(token.tokens);
				return `<div class="date">${content}</div>`;
				// return `<div class="date">${token.text}</div>`;
			}
			return false;
		}
	},
	{
		'level': 'inline',
		'marker': ":",
		label: "today",
		renderer(token) {
			if (token.meta.name === "today") {
			    const months = ["January", "February", "March", "April", "May", "June", 
			                   "July", "August", "September", "October", "November", "December"];
			    const today = new Date();
			    const day = String(today.getDate());
			    const month = months[today.getMonth()];
			    const year = today.getFullYear();
			    const date = `${day} ${month} ${year}`;
				return `<span class="date">${date}</span>`;
			}
			return false;
		}
	},
	{
		'level': 'inline',
		'marker': ":",
		label: "label",
		renderer(token) {
			if (token.meta.name === "label") {
				return `<span class='xref-label' data-key='${token.text}'></span>`;
			}
			return false;
		}
	},
	{
		'level': 'inline',
		'marker': ":",
		label: "ref",
		renderer(token) {
			if (token.meta.name === "ref") {
				return `<span class='xref-ref' data-key='${token.text}'></span>`;
			}
			return false;
		}
	},
	/*
		:TeX[...] — emit the bracketed content verbatim in LaTeX output,
		emit nothing in HTML output.  Use for output-format-specific LaTeX
		commands (e.g. :TeX[\noindent] before a paragraph that should not
		be indented in the print version).
	*/
	{
		'level': 'inline',
		'marker': ":",
		label: "TeX",
		renderer(token) {
			if (token.meta.name === "TeX") {
				return global.isLatex ? token.text : '';
			}
			return false;
		}
	},
	/*
		:HTML[...] — inverse of :TeX.  Emit the bracketed content in HTML
		output (with markdown inline syntax processed normally), emit
		nothing in LaTeX output.  Use for HTML-specific inline markup in
		dual-output documents, e.g. an inline link to a web-only resource
		that should be rendered with any markdown formatting inside it.
	*/
	{
		'level': 'inline',
		'marker': ":",
		label: "HTML",
		renderer(token) {
			if (token.meta.name === "HTML") {
				return global.isLatex ? '' : this.parser.parseInline(token.tokens);
			}
			return false;
		}
	},
	/*
		:::TeX ... ::: — container form of :TeX[...].  Emit the block
		content verbatim in LaTeX output, emit nothing in HTML output.
		Use for block-level LaTeX that has no inline equivalent, e.g.
		a full \begin{figure}...\end{figure} block, a tabular environment,
		or a TiKZ picture that should only appear in the print version.

		The empty custom tokenizer is deliberate: its presence causes
		createToken() to skip marked's default block lexer for the
		container's content, so raw LaTeX (backslashes, dollar signs,
		braces) is preserved verbatim on token.text.  Running markdown
		processing on LaTeX source would actively corrupt it (e.g. $...$
		math would be eaten by the latex extension, _x_ would become
		italics).
	*/
	{
		'level': 'container',
		'marker': ":::",
		label: "TeX",
		tokenizer(text, token) {
			// Intentionally empty: token.text has already been set by
			// createToken(), and we don't want marked's lexer to run on
			// the raw LaTeX content.
		},
		renderer(token) {
			if (token.meta.name === "TeX") {
				return global.isLatex ? token.text : '';
			}
			return false;
		}
	},
	/*
		:::HTML ... ::: — inverse of :::TeX.  Emit the block content in
		HTML output (with markdown syntax processed normally), emit
		nothing in LaTeX output.  Use for block-level content that
		should only appear in the web version.

		Unlike :::TeX, markdown processing is enabled inside :::HTML —
		content here is typically prose, and writing raw <p> tags around
		every paragraph would defeat the point of a markdown authoring
		system.  Raw HTML (iframes, <details>, custom elements) still
		passes through since marked supports inline HTML by default.
	*/
	{
		'level': 'container',
		'marker': ":::",
		label: "HTML",
		renderer(token) {
			if (token.meta.name === "HTML") {
				return global.isLatex ? '' : marked.parser(token.tokens);
			}
			return false;
		}
	},
	{
		'level': 'container',
		'marker': ":::",
		label: "abstract",
		renderer(token) {
			if (token.meta.name === "abstract") {
				let html = marked.parser(token.tokens);
				return `<div class="abstract"><div class='label'>Abstract</div>${html}</div>`;
			}
			return false;
		}
	},
	{
		'level': 'container',
		'marker': ":::",
		label: "feedback",
		renderer(token) {
			if (token.meta.name === "feedback") {
				let html = marked.parser(token.tokens);
				return `<p class='feedback'>Feedback</p><section class="feedback">${html}</section>`;
			}
			return false;
		}
	}
];

export const titleBox = {
		'level': 'container',
		'marker': ":::",
		label: "title-box",
		tokenizer(text, token) {
			// Title and body are separated by a line of three or more asterisks.
			// When the author omits the separator, render the whole content as
			// the body with an empty title rather than crashing on an undefined
			// half of the split.
			token['title'] = [];
			token['body'] = [];
			if (text.includes('***')) {
				const [title, body] = text.split(/\*{3,}/);
				this.lexer.blockTokens(title, token['title']);
				this.lexer.blockTokens(body, token['body']);
			} else {
				this.lexer.blockTokens(text, token['body']);
			}
		},
		renderer(token) {
			if (token.meta.name === "title-box") {
				const title = this.parser.parse(token['title']);
				const body = this.parser.parse(token['body']);
				return `<div class="title-box"><div class='title'>${title}</div><div class='body'>${body}</div></div>`;
			}
			return false;
		}
	};

// This directive is just a minimal template to show how extended-directives.js
// allow you to specify a custom tokenizer, as well.  (The default marked-directives package
// doesn't provide that capability.)
const pass_through = {
	level: 'container',
	marker: ':::',
	label: "plaintext",
	tokenizer: function(text, token) {
	    console.log("Called by the plaintext tokenizer");
	  	console.log(token);
	},
	renderer(token) {
		if (token.meta.name == "plaintext") {
			console.log("Called by the plaintext renderer");
			console.log(token);
			return "Consumed plaintext";
		}
		return false;
	}
};

// And here's how you would install it.
//marked.use( createDirectives([pass_through]) );


export default additionalDirectives;