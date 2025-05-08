/*
	This file contains all the support code needed for defining 'function extensions'
	in jmarkdown.  That is, when the jmarkdown file contains a <script> element which defines
	a javascript function which is then exported to jmarkdown so it can be called from
	inline text being parsed.
*/

import { runInThisContext, marked, registerExtension } from './utils.js';

export default function export_to_jmarkdown(name, options = {}) {
	const defaultOptions ={
		simple: true,
		tokenize: false,
		type: 'Function'
	};

	const mergedOptions = { ...defaultOptions, ...options};

	//const {simple = true, tokenize = false, type = 'function'} = options;

	if (mergedOptions['simple'] == true) {
		construct_simple_function_extension(name, mergedOptions);
		return;
	}
	else {
		construct_complex_function_extension(name, mergedOptions);
		return;
	}

	/*
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
	*/
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

	// marked.use({
	// 	extensions: [new_function]
	// });
	registerExtension(new_function);
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

import * as acorn from 'acorn';

class AcornParseError extends Error {
	constructor(error) {
		super(error.message);
		this.name = 'AcornParseError';
		this.pos = error.pos;
		this.raisedAt = error.raisedAt;

		// This captures the proper stack trace in modern engines
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}	
}

class VMEvaluationError extends Error {
	constructor(error) {
		super(error.message);
		this.name = 'VMEvaluationError';
		this.token = error.token;
		this.error = error;

		// This captures the proper stack trace in modern engines
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}	
}


function construct_complex_function_extension(name, options) {
	let delimiter;
	// There are two types, 'function' or 'object'. The default is 'function'.
	if (options['type'] == 'Function') {
		delimiter = "\\(";
	}
	else {
		delimiter = "(\\.|\\[)";
	}

	let start_regexp = new RegExp(name + delimiter);

	const new_function = {
		name: `${name}`,
		level: 'inline',
		start(src) {
			return src.match(start_regexp)?.index; 
		},
		tokenizer(src) {
			const regexp = new RegExp("^" + name + delimiter)
			if (src.match(regexp)) {
				console.log(`Match found for name ${name} at ${src.slice(0,20)}`);
				try {
					let exp;
					try {
						exp = acorn.parseExpressionAt(src, 0, { ecmaVersion: 2022 });
					}
					catch (error) {
						throw new AcornParseError(error);
					}

					if (exp.type == "CallExpression") {
						// Since we have a valid JavaScript function call, pass it
						// to runInThisContext and collect the output for insertion
						const start = exp.start;
						const end = exp.end;
						const func = src.slice(start, end);
						let output;
						try {
							output = runInThisContext(func);
						}
						catch (error) {
							const token = {
								type: `${name}`,
								raw: func,
								success: false,
								error: error
							}
							error.token = token;
							throw new VMEvaluationError(error)
						}
				
						const token = {
							type: `${name}`,
							raw: func,
							success: true,
							text: output,
							tokens: []
						};
						return token;
					}
					else {
						console.log(exp);
					}
				}
				catch (error) {
					if (error instanceof AcornParseError) {
						//console.log(error);
						//console.log(`ERROR: ${error.message}, starting at ${error.pos} and raised at ${error.raisedAt}`);
						const token = {
							type: `${name}`,
							raw: src.slice(0, error.raisedAt),
							success: false,
							errorType: 'AcornParseError',
							error: error.message,
							pos: error.pos,
							raisedAt: error.raisedAt
						};
						return token;
					}
					else if (error instanceof VMEvaluationError) {
						// console.log("We have a VMEvaluationError");
						// console.log(error.message);
						// console.log(error.error);
						return error.token;
					}
				}
			}
		},
		renderer(token) {
			if (token.success) {
				return token.text;	
			}
			else {
				if (token.errorType == 'AcornParseError') {
					let error = "<span class='jmarkdown-error-string'>" + token.raw.slice(0, token.pos);
					error += "<span class='jmarkdown-error-bad'>" + token.raw.slice(token.pos, token.raisedAt) + "</span></span>";
					return `<span class='jmarkdown-inline-error'>Parse error</span><span class='jmarkdown-error'>${token.error}: ${error}</span>`;
				}
				else {
					let error = "<span class='jmarkdown-inline-error'>Evaluation error</span>";
					error += `<span class='jmarkdown-error'>${token.error}. </span>`;
					error += "<span class='jmarkdown-error-string'>" + token.raw + "</span>";
					return error + createErrorPopupButton(token.error);
				}
			}
		}
	};

	// marked.use({
	// 	extensions: [new_function]
	// });
	registerExtension(new_function);
}


function createErrorPopupButton(error) {
  // Get the full error stack
  const errorStack = error.stack || error.toString();
  // Escape HTML characters to prevent XSS
  const escapedErrorStack = errorStack
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    // Convert line breaks to <br> tags
    .replace(/\n/g, '<br>')
    // Add extra styling to file paths
    .replace(/(file:\/\/[^)]+)/g, '<span style="color:#0066cc;">$1</span>')
    // Highlight error type
    .replace(/^([A-Za-z]+Error:)/g, '<strong style="color:#d32f2f;">$1</strong>');

  // Generate a unique ID for this error popup
  const popupId = 'error-popup-' + Math.random().toString(36).substr(2, 9);

  // Create the HTML for the button and a separate popup script
  const html = `
    <span class="error-popup-container" style="display: inline-block;">
      <button class="error-popup-button" onclick="showErrorPopup('${popupId}')">
        Show Error Details
      </button>
    </span>

    <script>
      // Create the popup function
      function showErrorPopup(popupId) {
        // Create the modal popup dynamically
        const modal = document.createElement('div');
        modal.id = popupId;
        modal.className = 'error-popup';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.zIndex = '1000';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        
        // Create the content container
        const content = document.createElement('div');
        content.className = 'error-popup-content';
        content.style.backgroundColor = 'white';
        content.style.width = '80%';
        content.style.maxWidth = '800px';
        content.style.maxHeight = '80%';
        content.style.borderRadius = '6px';
        content.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        content.style.display = 'flex';
        content.style.flexDirection = 'column';
        content.style.overflow = 'hidden';
        
        // Create the header
        const header = document.createElement('div');
        header.className = 'error-popup-header';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.padding = '12px 16px';
        header.style.backgroundColor = '#f5f5f5';
        header.style.borderBottom = '1px solid #ddd';
        
        // Add the title
        const title = document.createElement('h3');
        title.style.margin = '0';
        title.style.color = '#333';
        title.textContent = 'Error Stack Trace';
        
        // Add the close button
        const closeBtn = document.createElement('span');
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.color = '#666';
        closeBtn.textContent = '×';
        closeBtn.onclick = function() {
          document.body.removeChild(modal);
          document.body.style.overflow = '';
        };
        
        // Add the body with error stack
        const body = document.createElement('div');
        body.className = 'error-popup-body';
        body.style.padding = '16px';
        body.style.overflowY = 'auto';
        body.style.flexGrow = '1';
        
        // Add the pre element with stack trace
        const pre = document.createElement('pre');
        pre.style.margin = '0';
        pre.style.fontFamily = 'Consolas, Monaco, Courier New, monospace';
        pre.style.fontSize = '14px';
        pre.style.lineHeight = '1.5';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.color = '#333';
        pre.style.textAlign = 'left';
        pre.innerHTML = \`${escapedErrorStack}\`;
        
        // Assemble the modal
        header.appendChild(title);
        header.appendChild(closeBtn);
        body.appendChild(pre);
        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);
        
        // Add the modal to the document and prevent background scrolling
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // Add click event to close when clicking outside
        modal.addEventListener('click', function(event) {
          if (event.target === modal) {
            document.body.removeChild(modal);
            document.body.style.overflow = '';
          }
        });
      }
    </script>
    
    <style>
      .error-popup-container {
        display: inline-block;
      }
      
      .error-popup-button {
        background-color: #f44336;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      
      .error-popup-button:hover {
        background-color: #d32f2f;
      }
    </style>
  `;
  
  return html;
}
 
export_to_jmarkdown("Math", {simple: false, type: "Object"});
export_to_jmarkdown("Date", {simple: false, type: "Object"});
export_to_jmarkdown("String", {simple: false});
