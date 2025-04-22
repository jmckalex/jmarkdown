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
				let html = marked.parser(token.tokens);
				return `<div class="date">${html}</div>`;
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
	        // Check if we can split by asterisks
	        if (!text.includes('***')) {
	            // If no separator, use default processing
	            this.lexer.blockTokens(text, token.tokens);
	            //return token;
	        }        
	        const [title, body] = text.split(/\*{3,}/);
	        token['title'] = [];
	        this.lexer.blockTokens(title, token['title']);
	        token['body'] = [];
	        this.lexer.blockTokens(body, token['body']);
	    },
		renderer(token) {
			if (token.meta.name === "title-box") {
				const title = this.parser.parse(token['title']);
				const body = this.parser.parse(token['body']);
				return `<div class="title-box"><div class='title'>${title}</div><div class='body'>${body}</div></div>`;
				token.tokens.shift(); // Throw away the opening space token
				let title_token = token.tokens.shift();
				let title_html = marked.parser(title_token.tokens).replace(/<\/?p>/g, '');
				let body_html = marked.parser(token.tokens);
				return `<div class="title-box"><div class='title'>${title_html}</div><div class='body'>${body_html}</div></div>`;
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