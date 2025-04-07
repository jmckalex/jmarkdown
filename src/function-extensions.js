/*
	This file contains all the support code needed for defining 'function extensions'
	in jmarkdown.  That is, when the jmarkdown file contains a <script> element which defines
	a javascript function which is then exported to jmarkdown so it can be called from
	inline text being parsed.
*/

import { runInThisContext, marked } from './utils.js';

export default function export_to_jmarkdown(name, options = {}) {
	const {simple = true, tokenize = false} = options;

	if (simple == true) {
		construct_simple_function_extension(name, options);
		return;
	}
	else {
		construct_complex_function_extension(name);
		return;
	}

	let start_regexp = new RegExp(name + "\\(");
	let tokenizer_regexp = new RegExp("^" + name + "\\(([^)]*?)\\)");

	const new_function = {
		name: `${name}`,
		level: 'inline',
		start(src) {
			return src.match(start_regexp)?.index; 
		},
		tokenizer(src) {
			const match = tokenizer_regexp.exec(src);
			if (match) {
				const token = {
					type: `${name}`,
					raw: match[0],
					text: match[1],
					tokens: []
				};
				let script = `${token.type}("${token.text}")`;
				let output = runInThisContext(script);
				this.lexer.inlineTokens(output, token.tokens);
				return token;
			}
		},
		renderer(token) {
			return this.parser.parseInline(token.tokens);
		}
	};

	marked.use({
		extensions: [new_function]
	});
}


/*
	Here, we simply assume that the function syntax in markdown is
	of the form:

		function_name(...markdown text not containing ')'...)

	This allows a lot of transformations to be typed pretty simply
	in the text.
*/
function construct_simple_function_extension(name, options) {
	const {tokenize = false} = options;

	let start_regexp = new RegExp(name + "\\(");
	let tokenizer_regexp = new RegExp("^" + name + "\\(([^)]*?)\\)", 's');

	let extension_level = (tokenize != false)? tokenize : 'inline';

	const new_function = {
		name: `${name}`,
		level: extension_level,
		start(src) {
			return src.match(start_regexp)?.index; 
		},
		tokenizer(src) {
			const match = tokenizer_regexp.exec(src);
			if (match) {
				let script = `${name}("${match[1]}")`;
				script = script.replaceAll('\n', '\\n');
				let output = runInThisContext(script);

				const token = {
					type: `${name}`,
					raw: match[0],
					text: output,
					tokens: []
				};
				
				if (tokenize == "inline") {
					this.lexer.inlineTokens(output, token.tokens);
				}
				if (tokenize == "block") {
					this.lexer.blockTokens(output, token.tokens);
				}
				return token;
			}
		},
		renderer(token) {
			if (tokenize == "inline") {
				let html = this.parser.parseInline(token.tokens);
				return html;
			}
			else if (tokenize == 'block') {
				let html = this.parser.parse(token.tokens);
				return html;
			}
			else {
				return token.text;
			}
		}
	};

	marked.use({
		extensions: [new_function]
	});
}


/*
	Here, we assume that the function syntax in markdown is
	of the form:

		function_name(...any permissible JavaScript function arguments...)

	This requires a more complicated tokenizer, since we can have
	nested functions, objects, and strings containing unbalanced 
	parentheses, etc.  *However*, we assume that there is no need to
	specify information to the tokenizer about inline/block 
	lexing because that can be handled explicitly in the body of the function.

	The scanning rule we use is the following function.
*/
function captureFunction(input, name) {
	// First check if the string starts with the function name
	if (!input.startsWith(name)) {
		return null;
	}

	// Start after the function name, looking for opening parenthesis
	let pos = name.length;
	while (pos < input.length && input[pos] !== '(') {
		pos++;
	}
	if (pos >= input.length) return null;

	let openParens = 0;
	let inString = false;
	let stringChar = '';  // Could be ' or "
	let escaped = false;

	// Start with the function name
	let result = name;

	// Add everything from function name to opening parenthesis
	result += input.substring(name.length, pos + 1);

	// Start after the opening parenthesis
	pos++;

	while (pos < input.length) {
		const char = input[pos];
	  
		if (inString) {
	    	result += char;
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === stringChar) {
				inString = false;
			}
		} else {
			if (char === '"' || char === "'") {
				inString = true;
				stringChar = char;
				result += char;
			}
			else if (char === '(') {
				openParens++;
				result += char;
			} 
			else if (char === ')') {
				if (openParens === 0) {
				// We've found the matching closing parenthesis
				return result + char;
				}
				openParens--;
				result += char;
			} else {
				result += char;
			}
		}
		pos++;
	}

	// If we get here, we never found the matching closing parenthesis
	return null;
}


function construct_complex_function_extension(name, options) {
	let start_regexp = new RegExp(name + "\\(");

	const new_function = {
		name: `${name}`,
		level: 'inline',
		start(src) {
			return src.match(start_regexp)?.index; 
		},
		tokenizer(src) {
			let func = captureFunction(src, name);
			if (func == null) {
				return undefined;
			}

			//global.foobar = this;			
			let output = runInThisContext(func);

			const token = {
				type: `${name}`,
				raw: func,
				text: output,
				tokens: []
			};

			return token;
		},
		renderer(token) {
			return token.text;
		}
	};

	marked.use({
		extensions: [new_function]
	});
}




