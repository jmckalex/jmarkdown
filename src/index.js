#!/usr/bin/env node

import { marked, Marked } from 'marked';
import markedFootnote from 'marked-footnote';
import fs from 'fs';

import { JSDOM } from 'jsdom';


let marked_copy = new Marked({
	indentedCode: false
});

marked.setOptions({
	gfm: true
})

var my_footnotes = "";

// Import other extensions

marked.use(markedFootnote({
	rendererOptions: {
        containerTagName: 'section',
        containerClassName: 'footnotes'
    }
}));
// Configure other extensions

const latexTokenizer = {
					name: 'latex',
					level: 'inline',
					priority: 1,
					start(src) {
						const match = src.match(/\$\$|\$|\\\(|\\\[/);
						return match ? match.index : -1;
					},
					tokenizer(src, tokens) {
						// Match block LaTeX first (since it's more specific)
						const blockMatch = /^\$\$([^$]*?)\$\$|^\\\[(.*?)\\\]/s.exec(src);
						if (blockMatch && blockMatch.index === 0) {
							let math = blockMatch[1] ? blockMatch[1] : blockMatch[2];
							return {
								type: 'latex',
								raw: blockMatch[0],
								text: math,
								block: true
							};
						}

						// Match inline LaTeX
						const inlineMatch = /\$([^\$]+?)\$|\\\((.*)\\\)/.exec(src);
						if (inlineMatch && inlineMatch.index === 0) {
							let math = inlineMatch[1] ? inlineMatch[1] : inlineMatch[2];
							return {
								type: 'latex',
								raw: inlineMatch[0],
								text: math,
								block: false
							};
						}

						return false;
					},
					renderer(token) {
						let sanitised_text = token.text.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
						return token.block ? `$$${sanitised_text}$$` : `$${sanitised_text}$`;
					}		
				};

const italics = {
					name: 'italics',
					level: 'inline',
					start(src) { return src.match(/\//)?.index },
					tokenizer(src) {
						const rule = /^\/([^\/.?!]+[.?!]?)\//;
						//const rule = /^\/([^/]+?)\/(?!/)/;
						const match = rule.exec(src);
						if (match) {
							const token = {
								type: 'italics',
								raw: match[0],
								text: match[1],
								tokens: []
							};
							this.lexer.inline(token.text, token.tokens);
							return token;
						}
					},
					renderer(token) {
						return `<em>${this.parser.parseInline(token.tokens)}</em>`;
					}
				};

const strong = {
				name: 'strong',
				level: 'inline',
				start(src) { return src.match(/\//)?.index },
				tokenizer(src) {
					const rule = /^\*([^\*]+)\*/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'strong',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					return `<strong>${this.parser.parseInline(token.tokens)}</strong>`;
				}
			};

const underline = {
				name: 'underline',
				level: 'inline',
				start(src) { return src.match(/__/)?.index },
				tokenizer(src) {
					const rule = /^__([^_]+)__/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'underline',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					return `<span style='text-decoration: underline;'>${this.parser.parseInline(token.tokens)}</span>`;
				}
			};			

const fontawesome = {
				name: 'fontawesome',
				level: 'inline',
				start(src) { return src.match(/<</)?.index },
				tokenizer(src) {
					const rule = /^<<([^>]+)>>/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'fontawesome',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						//this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					const match = token.text.match(/\((.*?)\)/);
					const content = match ? match[1] : "";

					let classes = token.text.replace(/\((.*?)\)/, '').trim().split(" ");
					classes = classes.map( str => "fa-"+str ).join(" ");

					return `<i class='fa-solid ${classes}' style='${content}'></i>`;
				}
			};

const subscript = {
				name: 'subscript',
				level: 'inline',
				start(src) { return src.match(/_/)?.index },
				tokenizer(src) {
					const rule = /^_([a-zA-Z0-9]|\{[^}]*\})/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'subscript',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					let contents = this.parser.parseInline(token.tokens).replace(/[{}]/g, '');
					return `<sub>${contents}</sub>`;
				}
			};		

const superscript = {
				name: 'superscript',
				level: 'inline',
				start(src) { return src.match(/\^/)?.index },
				tokenizer(src) {
					const rule = /^\^([a-zA-Z0-9]|\{[^}]*\})/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'superscript',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					let contents = this.parser.parseInline(token.tokens).replace(/[{}]/g, '');
					return `<sup>${contents}</sup>`;
				}
			};		


/*
marked.use({
	extensions: [latexTokenizer, italics, strong, underline, fontawesome]
});

marked_copy.use({
	extensions: [latexTokenizer, italics, strong, underline, fontawesome]
});
*/

[marked, marked_copy].map(m => {
	m.use({
		extensions: [latexTokenizer, italics, strong, subscript, superscript, underline, fontawesome]
	});
});

// subscript, superscript,

const moustache = {
				name: 'moustache',
				level: 'inline',
				start(src) { return src.match(/{{/)?.index },
				tokenizer(src) {
					const rule = /^{{([^}]+)}}/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'moustache',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						//this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					if (token.text in metadata) {
						let contents = metadata[token.text];
						return contents.join('');
					}
					else {
						try {
							const result = runInThisContext(token.text);
							return result;
						}
						catch (error) {
							return `{{${token.text}}}`;
						}
					}
				}
			};

marked.use({
	extensions: [moustache]
});


const commentExtension = {
  name: 'comment',
  level: 'block',
  start(src) {
    return src.match(/@comment\b/)?.index;
  },
  tokenizer(src) {
    const rule = /^@comment\b([\s\S]*?)@endComment/;
    const match = rule.exec(src);
    if (match) {
      return {
        type: 'comment',
        raw: match[0],
        text: match[1]
      };
    }
  },
  renderer(token) {
    return '<!-- Text in markdown source commented out -->'; // Return empty string to effectively ignore the content
  }
};

// Use it with marked
//marked.use({ extensions: [commentExtension] });
//marked_copy.use({ extensions: [commentExtension] });
[marked, marked_copy].map(m => {
	m.use({ extensions: [commentExtension] });
});



const theoremExtension = {
  name: 'theorem',
  level: 'inline',
  start(src) {
    return src.match(/^Theorem[^:]*:/m)?.index;
  },
  tokenizer(src) {
    const rule = /^Theorem([^:]*:)([\s|\S]*)/;
    const match = rule.exec(src);
    if (match) {
      console.log(match);
      let token = {
        type: 'theorem',
        raw: match[0],
        text: match[1],
        tokens: [],
        start: [],
        rest: []
      };
      this.lexer.inlineTokens(match[1], token.start);
      this.lexer.inlineTokens(match[2], token.rest);
      return token;
    }
  },
  renderer(token) {
  	let start = this.parser.parseInline(token.start);
  	let rest = this.parser.parseInline(token.rest);
  	console.log(start);
  	console.log(rest);
    return `<span style='font-weight: bold'>Theorem${start}</span><span style='font-style: italic;'>${rest}</span>`;
  }
};

// marked.use({ extensions: [theoremExtension]});

import extendedTables from "marked-extended-tables";
//marked.use(extendedTables());
//marked_copy.use(extendedTables());
[marked, marked_copy].map(m => {
	m.use(extendedTables());
});

import { markedHighlight } from "marked-highlight";
import hljs from 'highlight.js';

[marked, marked_copy].map(m => {
	m.use(
		markedHighlight({
			emptyLangClass: 'hljs',
		    langPrefix: 'hljs language-',
		    highlight(code, lang, info) {
		      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
		      return hljs.highlight(code, {tabReplace: '  ', language }).value;
		    }
		})
	);
});

/*
marked.use(
	markedHighlight({
		emptyLangClass: 'hljs',
	    langPrefix: 'hljs language-',
	    highlight(code, lang, info) {
	      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
	      return hljs.highlight(code, {tabReplace: '  ', language }).value;
	    }
	})
);

marked_copy.use(
	markedHighlight({
		emptyLangClass: 'hljs',
	    langPrefix: 'hljs language-',
	    highlight(code, lang, info) {
	      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
	      return hljs.highlight(code, {tabReplace: '  ', language }).value;
	    }
	})
);
*/

/*
const markdown_demo_extension = {
  name: 'markdownDemo',
  level: 'block',                                     // Is this a block-level or inline-level tokenizer?
  start(src) { 
  	// if (src.match(/:::markdown-test/) != null) {
  	// 	console.log(src);
  	// 	console.log(src.match(/:::markdown-test/)?.index);
  	// }
    return src.match(/^:::markdown-test/)?.index; 
  }, 
  tokenizer(src, tokens) {
  	if (src.startsWith(":::")) {
  		console.log(src);
  	}

    const rule = /^:::markdown-test([\s\S]*?)\n:::/;
    const match = rule.exec(src);
    if (match != null) { 
		const token = {                                 // Token to generate
			type: 'markdownDemo',                      // Should match "name" above
			raw: match[0],                                // Text to consume from the source
			text: match[1],                        // Additional custom properties
			pairs: [],
			tokens: []                                    // Array where child inline tokens will be generated
		};
		return token;
    }
    else {
    	return false;
    }
  },
  renderer(token) {
    return "MARKDOWN DEMO WAS HERE";
  }
};

marked.use({
	extensions: [markdown_demo_extension]
});
*/



import { createDirectives, presetDirectiveConfigs } from 'marked-directive';

[marked, marked_copy].map(m => {
	m.use(createDirectives([
		...presetDirectiveConfigs,
		{ level: 'container', marker: '::::' },
		{ level: 'container', marker: ':::::' },
		{ level: 'container', marker: '::::::' },
		{ level: 'container', marker: ':::::::' },
		{ level: 'container', marker: '::::::::' }
	]));
});

/*
marked.use(createDirectives([
	...presetDirectiveConfigs,
	{ level: 'container', marker: '::::' },
	{ level: 'container', marker: ':::::' },
	{ level: 'container', marker: '::::::' },
	{ level: 'container', marker: ':::::::' },
	{ level: 'container', marker: '::::::::' }
]));

marked_copy.use(createDirectives([
	...presetDirectiveConfigs,
	{ level: 'container', marker: '::::' },
	{ level: 'container', marker: ':::::' },
	{ level: 'container', marker: '::::::' },
	{ level: 'container', marker: ':::::::' },
	{ level: 'container', marker: '::::::::' }
]));
*/


marked.use(createDirectives([
	{
		'level': 'block',
		'marker': "::",
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
		renderer(token) {
			if (token.meta.name === "subtitle") {
				let html = marked.parser(token.tokens);
				html = html.replace(/<\/?p>/g, '');
				return `<div class="subtitle"${html}</div>`;
			}
			return false;
		}
	},
	{
		'level': 'block',
		'marker': "::",
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
		'level': 'container',
		'marker': ":::",
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
		renderer(token) {
			if (token.meta.name === "title-box") {
				token.tokens.shift(); // Throw away the opening space token
				let title_token = token.tokens.shift();
				let title_html = marked.parser(title_token.tokens).replace(/<\/?p>/g, '');
				let body_html = marked.parser(token.tokens);
				return `<div class="title-box"><div class='title'>${title_html}</div><div class='body'>${body_html}</div></div>`;
			}
			return false;
		}
	}
]))

function createMultilevelOptionals(name) {
	const directives = [];
	[3,4,5,6,7,8].forEach(level => {
		directives.push(
			{
				'level': 'container',
				'marker': ':'.repeat(level),
				renderer(token) {
		      if (token.meta.name === name) {
		        // First check if attr exists and has include property
		        const shouldInclude = token.attrs?.include ?? false;
		        return shouldInclude 
		          ? marked.parser(token.tokens)
		          : '';
		      }
		      return false;
		    }
			}
		);
	});
	marked.use(createDirectives(directives));
}

createMultilevelOptionals("comment");
createMultilevelOptionals("answer");

function createMultilevelDirectives(rendering_function) {
	const directives = [];
	[3,4,5,6,7,8].forEach(level => {
		directives.push(
			{
				'level': 'container',
				'marker': ':'.repeat(level),
				'renderer': rendering_function
			}
		);
	});

	marked.use(createDirectives(directives));
}


marked.use({
  tokenizer: {
    code() {
      // return undefined to disable
    }
  }
});

let id = 0;
function get_unique_id() {
	return "${post-process-" + id++ + "}";
}

let markdown_for_postprocessing = [];

function register_for_postprocessing(markdown) {
	let id = get_unique_id();
	markdown_for_postprocessing.push({
		'id': id,
		'markdown': markdown
	});
	return id;
}

function rendering_function_for_markdown_demo(token, state) {
	if (token.meta.name === "markdown-demo") {
		let original_raw = token.raw.split("\n").slice(1,-1).join("\n");
		let raw = "```markdown\n" + original_raw + "\n```\n";
		let id = register_for_postprocessing(raw);
		let output = `<div class='markdown-demo-container'>
<div class='markdown-demo-code-label'>Markdown code</div>
<div class='markdown-demo-output-label'>Markdown output</div>
<div class='markdown-demo-markdown'>
${id}
</div>
<div class='markdown-demo-parsed'>
${marked.parser(token.tokens)}
</div>
</div>`;
		return output;
	}
	return false;
}


/*
	This is an attempt to create a version of the markdown-demo extension
	WITHOUT using marked-directives, because I can't control the
	tokenizer...
*/



createMultilevelDirectives(rendering_function_for_markdown_demo);

function extract_game_labels(text) {
    // First, normalize the keys we're looking for
    const validKeys = ['row', 'column', 'caption'];
    
    // Create regex that matches any of our keys (case insensitive) followed by colon
    const keyPattern = new RegExp(`^(${validKeys.join('|')}):\\s*(.*)`, 'i');
    
    // Split into lines
    const lines = text.split('\n');
    
    let result = {};
    let currentKey = null;
    let currentContent = [];
    
    for (const line of lines) {
        // Check if this line starts a new section
        const match = line.match(keyPattern);
        
        if (match) {
            // If we were building up content for a previous key, save it
            if (currentKey) {
                result[currentKey] = currentContent.join('\n').trim();
                currentContent = [];
            }
            
            // Start new section
            currentKey = match[1].toLowerCase();
            currentContent.push(match[2]);
        } else if (currentKey) {
            // Continue building current section
            currentContent.push(line);
        }
    }
    
    // Don't forget to save the last section
    if (currentKey) {
        result[currentKey] = currentContent.join('\n').trim();
    }
    
    return result;
}

function rendering_function_for_game(token) {
	if (token.meta.name === "game") {
		let column_label = token.attrs?.column;
		let row_label = token.attrs?.row;
		let caption_label = token.attrs?.caption;

		let output;
		let [dir1, ...rest] = token.raw.split("\n");
		rest.pop();
		let column_strategies;
		[column_strategies, ...rest] = rest;

		// Detect if an information section is included.
		// If so, this over-writes information from the attrs
		const index = rest.findIndex(str => /^\s*$/.test(str));
		let game_labels = {};
		let info_section = "";
		if (index != -1) {
			info_section = rest.slice(index+1);
			rest = rest.slice(0,index);
			game_labels = extract_game_labels(info_section.join('\n'));
			if (game_labels['row']) {
				row_label = game_labels['row'];
				row_label = register_for_postprocessing(row_label);
			}
			if (game_labels['column']) {
				column_label = game_labels['column'];
				column_label = register_for_postprocessing(column_label);
			}
			if (game_labels['caption']) {
				caption_label = game_labels['caption'];
				caption_label = register_for_postprocessing(caption_label);
			}
		}

		let maybe_extra_column = '';
		if (row_label) {
			maybe_extra_column = "<td></td>";
		}

		let number_of_columns = column_strategies.split('&').length;
		let number_of_rows = rest.length;

		// Handle the first row, which are the Column strategy labels
		column_strategies = column_strategies.replaceAll("&", "</td><td class='columnStrategies columnLabel strategyLabels'>");
		column_strategies = `<tr class='no-border'>${maybe_extra_column}<td></td><td class='columnStrategies columnLabel strategyLabels'>` + column_strategies + "</td></tr>";

		// The first column is handled differently, because the Row strategy label is to the left.
		rest = rest.map(str => str.replace("&", "</td><td class='payoffs'>\\("));
		// All other columns should be in math mode
		rest = rest.map(str => str.replaceAll("&", "\\)</td><td class='payoffs'>\\("));
		rest = rest.map(str => "<td class='rowLabel rowStrategies strategyLabels'>" + str + "\\)  </td></tr>");
		let first_row = rest.shift();
		if (row_label) {
			first_row = `<tr'><td class='rowLabel' rowspan=${number_of_rows}>${row_label}</td>` + first_row;
		}
		rest.map(row => "<tr>" + row);
		rest.unshift(first_row);

		let column_heading = '';
		if (column_label) {
			column_heading = `<tr class='no-border'>${maybe_extra_column}<td></td><td class='columnLabel' colspan='${number_of_columns}'>${column_label}</td></tr>\n`;
		}

		let caption = "";
		if (caption_label) {
				caption = `<tr class='no-border'>${maybe_extra_column}<td></td><td class='caption' colspan=${number_of_columns}>${caption_label}</td></tr>`;
		}

		output = "<table class='game'>" + column_heading + column_strategies + "\n" + rest.join("\n") + caption + "</table>";

		return output;
	}
	return false;
}

createMultilevelDirectives(rendering_function_for_game);

/*
	For description lists, we allow constructs of the following form:

	Description text:: And the description is here
		which can span multiple lines (provided they are indented).

		And may even include line breaks for additional paragraphs.
	Another description:: A short description.

	What causes it to end?  When we have (1) a line whose indent
	is *less* than the whitespace for the opening 'Description text::' indicator, OR
	(2) when we have a line of the *same* indent level of the opening indicator
	which does not match the 'Description text::' pattern.
*/
let to_log_on_exit;

const descriptionList = {
  name: 'descriptionList',
  level: 'block',                                     // Is this a block-level or inline-level tokenizer?
  start(src) { return src.match(/([ \t]*(?:[^:\n]|(?<!:):(?!:))+?)::(\s+(?:.*)|$)/)?.index; },
  //start(src) { return src.match(/([ \t]*[^:\n]+?)::(\s+(?:.*)|$)/)?.index; }, // Hint to Marked.js to stop and check for a match
  tokenizer(src, tokens) {
    const dt_rule = /^([ \t]*(?:[^:\n]|(?<!:):(?!:))+?)::(\s+(?:.*)|$)/;
    //const dt_rule = /^([ \t]*[^:\n]+?)::(\s+(?:.*)|$)/;
    const first_match = dt_rule.exec(src);
    if (first_match != null) { // Found the start of a description list.
    	let output = find_description_list(src);
		const token = {                                 // Token to generate
			type: 'descriptionList',                      // Should match "name" above
			raw: output['raw'],                                // Text to consume from the source
			text: "",                        // Additional custom properties
			pairs: [],
			tokens: [],                                    // Array where child inline tokens will be generated
			childTokens: []
		};

		for (let pair of output['pairs']) {
			let tok = {};
			tok['dt'] = [];
			this.lexer.inline(pair['dt'], tok['dt']);
			//this.lexer.inline(pair['dt'], token.tokens);
			tok['dd'] = [];
			this.lexer.blockTokens(pair['dd'], tok['dd']);
			//this.lexer.blockTokens(pair['dd'], token.tokens);
			token.tokens.push(...tok['dt'], ...tok['dd']);
			token.pairs.push(tok);
		}

		return token;
    }
    else {
    	return false;
    }
  },
  renderer(token) {
  	let html = '<dl>';
  	for (let t of token.pairs ) {
  		let dt_html = this.parser.parseInline(t['dt']);
  		let dd_html = marked.parser(t['dd']);
  		html += `<dt>${dt_html}</dt><dd>${dd_html}</dd>`;
  	}
  	html += '</dl>';
    return html;
  }
};

marked.use({extensions: [descriptionList]});

function get_indent_level(str) {
	return str.length - str.trimLeft().length;
}

// We know this is called at the start of a description list.
function find_description_list(src) {
    const dt_rule = /^([ \t]*(?:[^:\n]|(?<!:):(?!:))+?)::(\s+(?:.*)|$)/;
    //const dt_rule = /^([ \t]*[^:\n]+?)::(\s+(?:.*)|$)/;
    let lines = src.split('\n');
    let pairs = [];
    let raw = [];
    let base_indent = lines[0].length - lines[0].trimLeft().length;
    let dt_dd = null;

    let PARSE_FIRST_LINE = 1;
    let GOBBLE_LINE = 2;
    let ABORT = 3;
    let STATE = -1;

    for (let current_line of lines) {

        if (current_line.match(dt_rule) && get_indent_level(current_line) == base_indent) {
            // Start of another DT+DD pair
            STATE = PARSE_FIRST_LINE;
        }
        else if (current_line.match(dt_rule) && get_indent_level(current_line) > base_indent) {
            // In this case, we have a DL contained within the DD of the current DL
            STATE = GOBBLE_LINE;
        }
        else if (current_line.match(dt_rule) && get_indent_level(current_line) < base_indent) {
            // In this case, another DL follows the end of a nested DL.  Need to stop
            // and make sure this line is NOT included in raw so that the parser can start here.
            STATE = ABORT;
        }
        else if (current_line.match(dt_rule) == null && get_indent_level(current_line) > base_indent) {
            // Normal case of grabbing content for the current DD element.
            STATE = GOBBLE_LINE;
        }
        else if (current_line.trim() == '') {
            STATE = GOBBLE_LINE;
        }
        else if (current_line.match(dt_rule) == null && get_indent_level(current_line) <= base_indent) {
            // DL ends here. Stop parsing and make sure that this line is NOT included in raw so that the
            // parser can state here.
            STATE = ABORT;
        }



        switch(STATE) {
        case PARSE_FIRST_LINE:
            let match = current_line.match(dt_rule);
            dt_dd = {};
            dt_dd['dt'] = match[1];
            dt_dd['dd'] = match[2] + '\n';
            pairs.push(dt_dd);
            raw.push( current_line );
            break;

        case GOBBLE_LINE:
            dt_dd['dd'] += current_line.slice(base_indent) + '\n';
            raw.push( current_line );
            break;

        case ABORT:
            return {
                'raw': raw.join("\n"),
                'pairs': pairs
            };

        default:
            throw new Error("This shouldn't happen!");
        }
    }

    // If we got here, the file ended with the last dd element.
    return {
        'raw': raw.join('\n'),
        'pairs': pairs
    };
}

function writeToFile(filename, content) {
   fs.writeFileSync(filename, content);
}

import markedMoreLists from 'marked-more-lists';
marked.use(markedMoreLists());

function create_inline_comment_extension(character, include_in_comment) {
	const start_regexp = RegExp(`${character}`);
	const match_regexp = RegExp(`^${character}(.*?)(?:\\n|$)`);

	const inlineCommentExtension = {
	  name: 'inlineComment',
	  level: 'inline',
	  start(src) {
	    return src.match(start_regexp)?.index;
	  },
	  tokenizer(src) {
	    const match = match_regexp.exec(src);
	    if (match) {
	      return {
	        type: 'inlineComment',
	        raw: match[0],
	        text: match[1].trim(),
	        tokens: []
	      };
	    }
	  },
	  renderer(token) {
	  	if (include_in_comment) {
	  		return `<!-- ${token.text} -->`;	
	  	}
	  	else {
	  		return `<!-- Markdown source commented out -->`;
	  	}
	    
	  }
	};

	// Usage:
	marked.use({ extensions: [inlineCommentExtension] });	
}

//create_inline_comment_extension('%', true);


//import {markedEmoji} from "marked-emoji";

/*
	The following code downloads 180kb of URL data for the Octokit emojis.
	Easier to just save it as a datafile rather than downloading it all the time.
*/

//import {Octokit} from "@octokit/rest";
//const octokit = new Octokit();
//const res = await octokit.rest.emojis.get();
/*
 * {
 *   ...
 *   "heart": "https://...",
 *   ...
 *   "tada": "https://...",
 *   ...
 * }
 */
//const emojis = res.data;

//import emojis from './emoji-data.json' with { type: 'json'};


// The following was the code I used to save the data file.

/*
const jsonString = JSON.stringify(emojis, null, 2);
fs.writeFile('data.json', jsonString, (err) => {
  if (err) throw err;

});
// Async/await version
async function writeToFile() {
  try {
    await fs.promises.writeFile('data.json', jsonString);

  } catch (err) {
    console.error(err);
  }
}
*/

/*
	This function needs to detect whether we specified a FontAwesome icon or an
	Octokit icon.  We assume that the FontAwesome icons always have the 'fa-' prefix
	on the icon name (but not any of the other parameters which can modify the appearance).
*/

import emoji_data from './emoji-data.json' with { type: 'json'};

const emojiNames = Object.keys(emoji_data).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + "|fa-[^:]+";
const emojiRegex = new RegExp(`:(${emojiNames}):`);
const tokenizerRule = new RegExp(`^${emojiRegex.source}`);

function emoji_renderer(token) {
	let token_text = token.text;

	if (token_text.includes('fa-')) {
		let classes = token_text.split(" ").map(text => (text.includes("fa-")) ? text : "fa-" + text ).join(" ");
		return `<i class='fa-solid ${classes}'></i>`;
	}
	else {
		let url = emoji_data[token_text];
		return `<img alt="${token.name}" src="${url}" class="marked-emoji-img">`;
	}
}

const emojis = {
				name: 'emoji',
				level: 'inline',
				start(src) { return src.match(emojiRegex)?.index; },
				tokenizer(src) {
					//const rule = /^:([^:]+):/;
					const match = tokenizerRule.exec(src);
					if (match) {
						const token = {
							type: 'emoji',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						return token;
					}
				},
				renderer(token) {
					return emoji_renderer(token);
				}
			};

marked.use({
	extensions: [emojis]
});



const title = {
				name: 'title',
				level: 'block',
				start(src) { return src.match(/§title/)?.index; },
				tokenizer(src) {
					const rule = /^§title\[([^\]]*)\]/;
					const match = rule.exec(src);
					if (match) {
						console.log("Got here!");
						const token = {
							type: 'title',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.blockTokens(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					return `<div class='title'>${marked.parser(token.tokens)}</div>`;
				}
			};

marked.use({
	extensions: [title]
});

// const options = {
// 	emojis,
// 	renderer: (token) => `<img alt="${token.name}" src="${token.emoji}" class="marked-emoji-img">`
// };
// marked.use(markedEmoji(options));


import markedAlert from 'marked-alert';
marked.use(markedAlert());


import { gfmHeadingId, getHeadingList } from "marked-gfm-heading-id";

function createTOC(headings) {
	if (!headings.length) return '';

	let toc = "<div class='toc'>";
	let current_level = 0;

	for(const entry of headings) {
		if (entry['level'] == current_level) {
			toc += `</li>\n<li><a href='#${entry['id']}'>${entry['text']}</a>`;
		}
		else if (entry['level'] > current_level) {
			let diff = entry['level'] - current_level;
			toc += "<ul>".repeat(diff);
			toc += `<li><a href='#${entry['id']}'>${entry['text']}</a>`;
			current_level = entry['level'];
		}
		else {
			let diff = current_level - entry['level'];
			toc += "</li>\n" + "</ul>".repeat(diff) + "</li>";
			toc += `<li><a href='#${entry['id']}'>${entry['text']}</a>`;
			current_level = entry['level'];
		}
	}

	toc += "</li>\n</ul>\n</div>"
	return toc;
}

marked.use(gfmHeadingId({prefix: "toc-"}), {
	hooks: {
		postprocess(html) {
			const headings = getHeadingList();
			const toc = createTOC(headings);

			html = html.replace("{{TOC}}", toc);
			return html;
		}
	}
});

import {runInThisContext} from 'vm';

function processYAMLheader(markdown) {
	let has_header = /^[-a-zA-Z0-9 ]+:/.test(markdown);
	if (has_header) {
		//const [first, ...rest] = markdown.split(/\n\s*\n/);
		const [first, ...rest] = markdown.split(/\n^----.*$/m);
		const remainder = rest.join('\n\n');

		parseKeyedData(first);
		// Evaluate any moustache files
		if ("moustache files" in metadata) {
			for (let file of metadata['moustache files']) {
				try {
					const code = fs.readFileSync(file, 'utf8');
					runInThisContext(code);
				}
				catch (error) {
					console.error(`Error loading or evaluating file ${file}`, error);
				}
			}
		}

		const custom_elements_key = Object.keys(metadata).find(k => k.toLowerCase() === "Custom element".toLowerCase());
		if (custom_elements_key) {
			processCustomElements();
		}

		const extension_keys = Object.keys(metadata).filter(key => key.startsWith("extension"));
		for (let key of extension_keys) {
			let spec = metadata[key];
			addExtension(spec, key);
		}

		const inline_comment_key = Object.keys(metadata).filter(key => key.toLowerCase().startsWith("inline comment"));
		let comment_key = metadata[inline_comment_key]?.at(-1);
		if (comment_key != undefined) {
			let instructions = comment_key.split(' ');
			let character = instructions[0];
			if (instructions?.[1] !== undefined) {
				let boolean = JSON.parse(instructions[1]);
				create_inline_comment_extension(character, boolean);
			}
			else {
				create_inline_comment_extension(character, false);
			}
		}
		else {
			create_inline_comment_extension("%", false);
		}

		return remainder;
	}
	else {
		return markdown;
	}
}

let metadata = {};

function parseKeyedData(text) {
	const lines = text.split('\n');
	const data = {};
	let currentKey = null;
	let currentValue = [];

	data['HTML footer'] = [''];
	data['HTML header'] = [''];
	data['title'] = '';
	data['CSS'] = [''];


	for (const line of lines) {
		const keyMatch = line.match(/^([-a-zA-Z0-9 ]+):\s*(.*)$/);
		if (keyMatch) {
			// If we have a previous key, store its data
			if (currentKey) {
				if (!data[currentKey]) {
					data[currentKey] = [];
				}
				data[currentKey].push(currentValue.join('\n'));
				currentValue = [];
			}

			currentKey = keyMatch[1];
			if (keyMatch[2].trim()) {
				currentValue.push(keyMatch[2]);
			}
		}
		else if (currentKey && line.trim()) {
			currentValue.push(line);
		}
	}

	// Don't forget to store the last entry
	if (currentKey) {
		if (!data[currentKey]) {
			data[currentKey] = [];
		}
		data[currentKey].push(currentValue.join('\n'));
	}

	metadata = data;
	return data;
}

let custom_element_string = "";
function processCustomElements() {
	for (let k in metadata) {
    if (k.toLowerCase() === "Custom element".toLowerCase()) {
    	if (Array.isArray(metadata[k])) {
    		metadata[k].forEach(spec => {
    			let [name, ...definition] = spec.split("\n");
    			name = name.trim();

    			definition = definition.map(el => el.trim()).join("\n");

    			let script_contents = "<script type='module'>\n"
    				+ "\tclass custom_element extends HTMLElement { \n"
    				+ "\tconnectedCallback() {\n"
						+ "\t\tthis.innerHTML = `" + definition + "`;\n\t}}\n"
						+ `\tcustomElements.define('${name}', custom_element);\n`
						+ "</script>\n";
 					custom_element_string = custom_element_string + script_contents;
    		})
    	}
    }
  }
}


function addExtension(spec, name) {

	const extension_name = name.replace(' ', '');

	const index = spec[0].indexOf("\n");
	const firstLine = spec[0].slice(0, index);
	let definition = spec[0].slice(index+1);
	const delimiters = firstLine.trimLeft();

	if (delimiters.startsWith('/')) {
		return addComplexExtension(delimiters, definition, name);
	}

	//const separator = delimiters[0];
	const parts = delimiters.split(" ").filter(part => part.trim());
	const startPattern = parts[0];
	const endPattern = parts[1];
	
	let parse_contents = false;
	if (parts.length > 2) {
		if (parts[2].toLowerCase().trim() == "true") {
			parse_contents = true;
		}
		else if (parts[2].toLowerCase().trim() == "false") {
			parse_contents = false;
		}
		else if (parts[2].toLowerCase().trim().startsWith("[")) {
			parse_contents = JSON.parse(parts[2].toLowerCase().trim());
		}
	}

	let multiple_args = false;
	let how_many_args = 1;
	if (parts.length == 4) {
		multiple_args = true;
		how_many_args = parseInt(parts[3]);
	}

	// Escape special regex characters in both patterns
    const escapedStart = startPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedEnd = endPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create regex that matches anything between the patterns
    const arg_string = Array(how_many_args).fill('(.*?|"(?:[^"]*?|\\")*?)').join(",\\s*");
    const regex = new RegExp(escapedStart + arg_string + escapedEnd);
    const token_regex = new RegExp("^" + escapedStart + arg_string + escapedEnd);

    const extension = {
		name: extension_name,
		level: 'inline',
		start(src) { return src.match(regex)?.index; },
		tokenizer(src) {
			//const rule = /^:([^:]+):/;
			const match = token_regex.exec(src);
			if (match) {
				const token = {
					type: extension_name,
					raw: match[0],
					text: Array.from({ length: how_many_args }, (_, i) => match[i+1].trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"')), //match[1],
					tokens: []
				};
				if (parse_contents == true) {
					for (let i=0; i<how_many_args; i++) {
						token.tokens[i] = [];
						this.lexer.inline(token.text[i], token.tokens[i]);
					}
				}
				else if (Array.isArray(parse_contents)) {
					for (let i=0; i<how_many_args; i++) {
						token.tokens[i] = [];
						if (parse_contents[i] == true) {
							this.lexer.inline(token.text[i], token.tokens[i]);
						}
					}
				}
				return token;
			}
		},
		renderer(token) {
			if (parse_contents == true) {
				let text = definition;
				for (let i=0; i<how_many_args; i++) {
					text = text.replaceAll("$" + `{content${i+1}}`, this.parser.parseInline(token.tokens[i]));
				}
				return text; //.replaceAll("${content}", this.parser.parseInline(token.tokens));
			}
			else if (parse_contents == false) {
				let text = definition;
				for (let i=0; i<how_many_args; i++) {
					text = text.replaceAll("$" + `{content${i+1}}`, token.text[i]);
				}
				return text;//.replaceAll("${content}", token.text);
			}
			else {
				let text = definition;
				for (let i=0; i<how_many_args; i++) {
					if (parse_contents[i] == true) {
						text = text.replaceAll("$" + `{content${i+1}}`, this.parser.parseInline(token.tokens[i]));
					}
					else {
						text = text.replaceAll("$" + `{content${i+1}}`, token.text[i]);
					}
				}
				return text;//.replaceAll("${content}", token.text);
			}
		}
	};

	//marked.use({ extensions: [ extension ]});
	[marked, marked_copy].map(m => {
		m.use({ extensions: [ extension ]});
	});
}


function addComplexExtension(delimiters, definition, name) {
	// The following regexp matches a staticly defined regexp
	const start_regexp = /\/(?<start>(?:[^/]|\\[\/])+)\//;
	const tokenizer_regexp = /\/(?<tokens>(?:[^/]|\\[\/])+)\//;
	const parse_regexp = /(?<parseInfo>true|false|\[\s*(?:true|false)(?:\s*,?\s*(?:true|false))*\s*\])/;
	const num_arg_regexp = /(?<args>[0-9]*)/;
	let big_regexp = new RegExp(start_regexp.source + "\\s+" + tokenizer_regexp.source + "\\s+" + parse_regexp.source + "\\s+" + num_arg_regexp.source );
	let result = delimiters.match(big_regexp);

	const src_regexp = new RegExp(result.groups['start']);
	const token_regexp = new RegExp("^" + result.groups['tokens']);
	const parse_info = JSON.parse(result.groups['parseInfo']);
	const num_args = parseInt(result.groups['args']);

	const extension = {
		name: name,
		level: 'inline',
		start(src) { return src.match(src_regexp)?.index; },
		tokenizer(src) {
			const match = token_regexp.exec(src);
			if (match) {
				const token = {
					type: name,
					raw: match[0],
					text: Array.from({ length: num_args }, (_, i) => match[i+1]), 
					tokens: []
				};
				if (parse_info == true) {
					for (let i=0; i<num_args; i++) {
						token.tokens[i] = [];
						this.lexer.inline(token.text[i], token.tokens[i]);
					}
				}
				else if (Array.isArray(parse_info)) {
					for (let i=0; i<num_args; i++) {
						token.tokens[i] = [];
						if (parse_info[i] == true) {
							this.lexer.inline(token.text[i], token.tokens[i]);
						}
					}
				}
				return token;
			}
		},
		renderer(token) {
			if (parse_info == true) {
				let text = definition;
				for (let i=0; i<num_args; i++) {
					text = text.replaceAll("$" + `{content${i+1}}`, this.parser.parseInline(token.tokens[i]));
				}
				return text;
			}
			else if (parse_info == false) {
				let text = definition;
				for (let i=0; i<num_args; i++) {
					text = text.replaceAll("$" + `{content${i+1}}`, token.text[i]);
				}
				return text;
			}
			else {
				let text = definition;
				for (let i=0; i<num_args; i++) {
					if (parse_info[i] == true) {
						text = text.replaceAll("$" + `{content${i+1}}`, this.parser.parseInline(token.tokens[i]));
					}
					else {
						text = text.replaceAll("$" + `{content${i+1}}`, token.text[i]);
					}
				}
				return text;
			}
		}
	};

	//marked.use({ extensions: [ extension ]});
	[marked, marked_copy].map(m => {
		m.use({ extensions: [ extension ]});
	});
}


function insertOptionalCSS() {
	let optional_css = "";
	if ('CSS' in metadata) {
		for(const str of metadata['CSS']) {
			optional_css += `<link rel="stylesheet" href="${str}">\n`;
		}
	}
	return optional_css;
}

function insertOptionalScripts() {
	let optional_scripts = "";
	if ('Script' in metadata) {
		for(const str of metadata['Script']) {
			optional_scripts += `<script src="${str}"></script>\n`;
		}
	}
	return optional_scripts;
}



const rightAlignExtension = {
    name: 'rightAlign',
    level: 'block',
    start(src) {
        return src.match(/^>>/)?.index;
    },
    tokenizer(src) {
        const rule = /^(>> .*(?!<<\s*\n)(?:\n|$))+/;
        const match = rule.exec(src);
        if (match) {
            const raw = match[0];
            // Remove the >> markers and trim each line
            const text = raw.split('\n')
                .map(line => line.replace(/^>> ?/, ''))
                .filter(line => line.length > 0)
                .join('\n');

            return {
                type: 'rightAlign',
                raw: raw,
                text: text,
                tokens: this.lexer.inlineTokens(text)
            };
        }
        return false;
    },
    renderer(token) {
        return `<div style="text-align: right;">${this.parser.parseInline(token.tokens)}</div>`;
    }
};


const centerAlignExtension = {
    name: 'centerAlign',
    level: 'block',
    start(src) {
        return src.match(/^>> .* <</)?.index;
    },
    tokenizer(src) {
        const rule = /^(>> .*<<\s*(?:\n|$))+/;
        const match = rule.exec(src);
        if (match) {
            const raw = match[0];
            // Remove the >> markers and trim each line
            const text = raw.split('\n')
                .map(line => line.replace(/^>> ?/, ''))
                .map(line => line.replace(/<<\s*(?:\n|$)/, ''))
                .filter(line => line.length > 0)
                .join('\n');

            return {
                type: 'centerAlign',
                raw: raw,
                text: text,
                tokens: this.lexer.inlineTokens(text)
            };
        }
        return false;
    },
    renderer(token) {
        return `<div style="text-align: center;">${this.parser.parseInline(token.tokens)}</div>`;
    }
};

// Register the extension
marked.use({ extensions: [rightAlignExtension, centerAlignExtension] });



// <DL> extension
/*
marked.use({
  extensions: [{
    name: 'definition-list',
    level: 'block',
    start(src) {
      return src.match(/^.+[^ ]::/)?.index;
    },
    tokenizer(src) {
      // Match one or more definition entries
      const rule = /^(.+)[^ ]::[ \t]*([^\n]+(?:\n[ \t]+[^\n]+)*)\n*(?=\n*(?:.+[^ ]::|$))/gm;
      const matches = Array.from(src.matchAll(rule));
      
      if (matches.length > 0) {
        // Calculate total length of matched content
        const raw = matches.map(m => m[0]).join('\n');
        
        // Create array of term/definition pairs
        const items = matches.map(match => ({
          term: match[1].trim(),
          definition: match[2].replace(/\n[ \t]+/g, ' ').trim()
        }));

        return {
          type: 'definition-list',
          raw: raw,
          items: items
        };
      }
    },
    renderer(token) {
      const items = token.items
        .map(item => `  <dt>${item.term}</dt>\n  <dd>${item.definition}</dd>`)
        .join('\n');
      return `<dl>\n${items}\n</dl>\n`;
    }
  }]
});

marked.use({
  extensions: [{
    name: 'definition-list',
    level: 'block',
    start(src) {
      // Look for a line ending with :: followed by an indented line
      return src.match(/^[^\n]*::\n[ \t]+/)?.index;
    },
    tokenizer(src) {
      // Match a term ending with :: followed by indented definition paragraphs
      const rule = /^([^\n]*)::\n((?:[ \t]+[^\n]+\n(?:\n|(?=[ \t]))*)+)/;
      const matches = Array.from(src.matchAll(rule));
      
      if (matches.length > 0) {
        const raw = matches.map(m => m[0]).join('\n');
        
        const items = matches.map(match => ({
          term: match[1].trim(),
          // Split definition into paragraphs, trim whitespace
          definition: match[2]
            .split(/\n\n/)
            .map(para => para.replace(/^[ \t]+/gm, '').trim())
            .filter(para => para.length > 0)
        }));

        return {
          type: 'definition-list',
          raw: raw,
          items: items
        };
      }
    },
    renderer(token) {
      const items = token.items
        .map(item => {
          const defs = item.definition
            .map(para => `  <dd>${para}</dd>`)
            .join('\n');
          return `  <dt>${item.term}</dt>\n${defs}`;
        })
        .join('\n');
      return `<dl>\n${items}\n</dl>\n`;
    }
  }]
});
*/

function processFileInclusions(markdown) {
	const regex = /\[\[(.*?)\]\]/g;
	const matches = markdown.match(regex);

	if (!matches) return markdown;

	let cwd = process.cwd() + "/";

	// while(matches) {
	// 	match = matches[0];
	// 	const filepath = match.slice(2, -2);  // Remove [[ and ]]
	// 	try {
	// 	 	const fileContent = fs.readFileSync(filepath, 'utf8');
	// 	 	markdown = markdown.replace(match, fileContent);
	// 	} catch (err) {
	// 	 	console.error(`Error reading file ${filepath}:`, err);
	// 	}
	// }


	for (const match of matches) {
		const filepath = match.slice(2, -2);  // Remove [[ and ]]
		try {
		 	const fileContent = fs.readFileSync(filepath, 'utf8');
		 	markdown = markdown.replace(match, fileContent);
		} catch (err) {
		 	console.error(`Error reading file ${filepath}:`, err);
		}
	}

	return markdown;
}

/*
	This function runs during the preprocessing period.  It replaces all the {{moustache}}
	entries with their definition from the metadata header, or from JavaScript, if possible.
*/
function processMoustache(text) {
	let new_text = text.replace(/{{[^}]*}}/g, function(match) {
		const key = match.slice(2,-2);
		if (key in metadata) {
			let value = metadata[key];
			return value;
		}
		else {
			try {
				const result = runInThisContext(key);
				return result;
			}
			catch (error) {
				return `{{${key}}}`;
			}
		}
	});

	return new_text;
}




marked.use({
	hooks: {
		preprocess(markdown) {
			let markdown_no_metadata = processYAMLheader(markdown);

			return processFileInclusions(markdown_no_metadata);
		}
	}
});


if (!'highlight-theme' in metadata) {
	metadata['highlight_theme'] = "default";
}


function insert_HTML_header() {
	let str = "" + insertOptionalCSS() + insertOptionalScripts();
	for(let s of metadata['HTML header']) {
		str += s + '\n';
	}
	return str.slice(0,-1);
}

function insert_HTML_footer() {
	let str = "";

	for(let s of metadata['HTML footer']) {
		str += s + '\n';
	}
	return str.slice(0,-1);
}



// const originalParse = marked.parse;
    
// marked.parse = function(text, options) {
//     const content = originalParse.call(this, text, options);
//     return `<!DOCTYPE html>
// <html>
// <head>
//     <meta charset="utf-8">
//     <title>${metadata['title']}</title>
//     <script>
// 		MathJax = {
// 			tex: {
// 			    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
// 			    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
// 			}
// 		};
// 	</script>
// 	<script src="https://kit.fontawesome.com/161dcde163.js" crossorigin="anonymous"></script>
// 	<style>
// 		pre code.hljs {
// 		  tab-size: 2;
// 		  -moz-tab-size: 2;
// 		}

//     	.marked-emoji-img {
// 		  height: 1em;  /* Match line height */
// 		  vertical-align: -0.15em;  /* Fine-tune alignment */
// 		}

//     	.markdown-alert-title {
//     		margin-top: 0pt;
//     		margin-bottom: 3pt;
//     	}

//     	.markdown-alert svg.octicon {
//     		margin: 3pt;
//     		vertical-align: middle;
//     	}

// .markdown-alert {
//  padding: 0.5rem 0.5rem;
//  margin-bottom: 16px;
//  border-left: .25em solid;
// }

// .markdown-alert-note {
//  border-color: #0969DA;
//  background-color: #DAEEFF;
// }

// .markdown-alert-warning {
//  border-color: #9A6700;
//  background-color: #FFF8E5;
// }

// .markdown-alert-tip {
//  border-color: #1A7F37;
//  background-color: #DDFBE6;
// }

// .markdown-alert-important {
//  border-color: #CF222E;
//  background-color: #FFEBE9;
// }

// 	</style>
// 	<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
// 	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${metadata['highlight-theme']}.min.css">
//   <script src="https://code.jquery.com/jquery-3.7.1.min.js" 
// 	    integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=" 
// 	    crossorigin="anonymous"></script>
//     <script src="https://jmckalex.org/prez/libs/original2/js/citation.min.js"></script>	
// 	<script src="https://jmckalex.org/prez/libs/original2/js/biblify.js"></script>
// ${custom_element_string}
// ${insert_HTML_header()}
// </head>
// <body>
// ${content}
// ${insert_HTML_footer()}
// <script>
// const Cite = require('citation-js');
// Biblify.configure({
// 	bibfile: './bibliography.bib',
// 	template: 'philsci',
// 	defer: true,
// 	addTemplates: [{
// 		name: 'philsci',
// 		path: './philsci.csl'
// 	}]
// });
// /*
// document.addEventListener('bibliography-ready', function() {
// 	Biblify.processCitations('body');
// 	Biblify.insertBibliography('body');
// 	if (Biblify.numberOfCitations() > 0) {
// 		$('div.csl-bib-body').before('<h1 id="bib">Bibliography</h1>');
//     	if ($('div.toc').length > 0) {
//     		$('div.toc ul').first().append('<li><a href="#bib">Bibliography</a></li>');
//     	}
//     }
// });
// */
// </script>
// </body>
// </html>`;
// };

function post_process_markdown(content) {
	for (let md of markdown_for_postprocessing) {
		let id = md['id'];
		let html = marked.parse(md['markdown']);
		content = content.replace(id,html);
	}
	return content;
}


var content;
function generateHTMLOutput(text) {
	content = marked.parse(text);

	content += my_footnotes;

	content = post_process_markdown(content);

	let output = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${metadata['title']}</title>
    <script>
		MathJax = {
			tex: {
			    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
			    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
				tags: 'ams'
			}
		};
	</script>
	<script src="https://kit.fontawesome.com/161dcde163.js" crossorigin="anonymous"></script>
	<style>
		pre code.hljs {
		  tab-size: 2;
		  -moz-tab-size: 2;
		}

    .marked-emoji-img {
		  height: 1em;  /* Match line height */
		  vertical-align: -0.15em;  /* Fine-tune alignment */
		}

    .markdown-alert-title {
    	margin-top: 0pt;
    	margin-bottom: 3pt;
    }

    .markdown-alert svg.octicon {
    	margin: 3pt;
    	vertical-align: middle;
    }

		.markdown-demo-container {
			display: grid;
			grid-template-columns: 1fr 1fr;
			column-gap: 12pt;
		}

		.markdown-demo-container code {
			height: 100%;
			width: 100%;
			display: block;
			box-sizing: border-box;
		}

		.markdown-demo-container pre {
			height: 100%;
			width: 100%;
			margin: 0pt;
		}

table.game caption {
	caption-side: bottom;
	padding-top: 10px;
	text-align: center;
	color: inherit;
}

table.game {
	border-collapse: collapse;
}

table.game td {
	border: 1px solid black;
	border-collapse: collapse;
	text-align: center;
}

table.game tr:first-child td:first-child {
	border: none;
}

table.game td.columnLabel {
	border: none;
}

table.game .caption {
	padding: 6pt;
}

table.game td.rowLabel {
	border: none;
	vertical-align: middle;
	padding-right: 6pt;
}

table.game td.strategyLabels {
	border: none;
}

table.game tr.no-border td {
	border: none;
}

table.game td.rowStrategies {
	text-align: left;
	padding-right: 12px;
}

table.game td.columnStrategies {
	text-align: center;
	min-width: 4em;
}

table.game td.payoffs {
	padding-top: 6px;
	padding-bottom: 6px;
}

table.game.playerLabels td {
	border: 1px solid black !important;
	text-align: center !important;
}

table.game.playerLabels tr:first-child td {
	border: none !important;
}

table.game.playerLabels tr:nth-child(2) td {
	border: none !important;
}

table.game.playerLabels tr:nth-child(3) td:first-child {
	border: none !important;
	vertical-align: middle;
}

table.game.playerLabels tr:nth-child(3) td:nth-child(2) {
	border: none !important;
}

table.game td.caption p {
	margin: 0pt;
}

table.game td.rowLabel p {
	margin: 0pt;
}

table.game td.columnLabel p {
	margin: 0pt;
}


.markdown-alert {
 padding: 0.5rem 0.5rem;
 margin-bottom: 16px;
 border-left: .25em solid;
}

.markdown-alert-note {
 border-color: #0969DA;
 background-color: #DAEEFF;
}

.markdown-alert-warning {
 border-color: #9A6700;
 background-color: #FFF8E5;
}

.markdown-alert-tip {
 border-color: #1A7F37;
 background-color: #DDFBE6;
}

.markdown-alert-important {
 border-color: #CF222E;
 background-color: #FFEBE9;
}

	</style>
	<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${metadata['highlight-theme']}.min.css">
  <script src="https://code.jquery.com/jquery-3.7.1.min.js" 
	    integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=" 
	    crossorigin="anonymous"></script>
    <script src="https://jmckalex.org/prez/libs/original2/js/citation.min.js"></script>	
	<script src="https://jmckalex.org/prez/libs/original2/js/biblify.js"></script>
${custom_element_string}
${insert_HTML_header()}
</head>
<body>
${content}
${insert_HTML_footer()}
<script>
/*
const Cite = require('citation-js');
Biblify.configure({
	bibfile: './bibliography.bib',
	template: 'philsci',
	defer: true,
	addTemplates: [{
		name: 'philsci',
		path: './philsci.csl'
	}]
});

document.addEventListener('bibliography-ready', function() {
	Biblify.processCitations('body');
	Biblify.insertBibliography('body');
	if (Biblify.numberOfCitations() > 0) {
		$('div.csl-bib-body').before('<h1 id="bib">Bibliography</h1>');
    	if ($('div.toc').length > 0) {
    		$('div.toc ul').first().append('<li><a href="#bib">Bibliography</a></li>');
    	}
    }
});
*/
</script>
</body>
</html>`;
	return output;
}


const filename = process.argv[2];
if (!filename) {
 console.error('Please provide a filename');
 process.exit(1);
}

const input = fs.readFileSync(filename, 'utf8');


const outFile = filename.replace(/\.([^.]+)$/, '.html');
fs.writeFileSync(outFile, generateHTMLOutput(input));

writeToFile("test-output.html", content );


