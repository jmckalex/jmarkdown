// This minimal file ensures that the metadata header object can be accessed
// by different modules.

export const metadata = {};

import { runInThisContext, registerExtension } from './utils.js';
import fs from 'fs';
import { configManager } from './config-manager.js';

export function processYAMLheader(markdown) {
	let has_header = /^[-a-zA-Z0-9 ]+:/.test(markdown);
	if (has_header) {
		//const [first, ...rest] = markdown.split(/\n\s*\n/);
		const [first, ...rest] = markdown.split(/\n^----.*$/m);
		const remainder = rest.join('\n\n');

		parseKeyedData(first);
		// Merge the metadata with the config but keep metadata for this file
	    configManager.mergeMetadata(metadata);

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



function parseKeyedData(text) {
	const lines = text.split('\n');
	//const data = {};
	let currentKey = null;
	let currentValue = [];

	for (const line of lines) {
		const keyMatch = line.match(/^([-a-zA-Z0-9 ]+):\s*(.*)$/);
		if (keyMatch) {
			// If we have a previous key, store its data
			if (currentKey) {
				if (!metadata[currentKey]) {
					metadata[currentKey] = [];
				}
				metadata[currentKey].push(currentValue.join('\n'));
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
		if (!metadata[currentKey]) {
			metadata[currentKey] = [];
		}
		metadata[currentKey].push(currentValue.join('\n'));
	}

	//metadata = data;
	//initialiseMetadata(metadata);
	return metadata;
}



export let custom_element_string = "";
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

	registerExtension(extension);
}



function addComplexExtension(delimiters, definition, name) {
	// The following regexp matches a staticly defined regexp
	const start_regexp = /\/(?<start>(?:[^/]|\\[\/])+)\//;
	const tokenizer_regexp = /\/(?<tokens>(?:[^/]|\\[\/])+)\//;
	const parse_regexp = /(?<parseInfo>true|false|block|inline|\[\s*(?:true|false)(?:\s*,?\s*(?:true|false))*\s*\])/;
	const num_arg_regexp = /(?<args>[0-9]*)/;
	let big_regexp = new RegExp(start_regexp.source + "\\s+" + tokenizer_regexp.source + "\\s+" + parse_regexp.source + "\\s+" + num_arg_regexp.source );
	let result = delimiters.match(big_regexp);

	const src_regexp = new RegExp(result.groups['start']);
	const token_regexp = new RegExp("^" + result.groups['tokens']);
	//const parse_info = JSON.parse(result.groups['parseInfo']);
	let parse_info;
	if (result.groups['parseInfo'] == 'inline' || result.groups['parseInfo'] == 'block') {
		parse_info = result.groups['parseInfo'];
	}
	else {
		parse_info = JSON.parse(result.groups['parseInfo']);
	}
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
				else if (parse_info == 'inline' || parse_info == 'block') {
					let text = definition;
					for (let i=0; i<num_args; i++) { 
						//console.log(`num_args: ${num_args}`);
						//console.log(`match: ${match}`);
						text = text.replaceAll("$" + `{content${i+1}}`, match[i+1] );
					}
					if (parse_info == 'inline') {
						this.lexer.inline(text, token.tokens);
					}
					else {
						this.lexer.blockTokens(text, token.tokens); // HERE
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
			else if (parse_info == 'inline') {
				return this.parser.parseInline(token.tokens);
			}
			else if (parse_info == 'block') {
				return this.parser.parse(token.tokens);
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

	registerExtension(extension);
}



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

	registerExtension(inlineCommentExtension);
}

