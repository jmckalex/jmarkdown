import { runInThisContext } from './utils.js';
/*
	This file defines several extensions which look for blocks of the form

		<script [...]>
			// JavaScript code
		</script>

	in the jmarkdown file.  There are several different types of scripts it looks for:

	1. Normal javascript blocks to be passed through to the HTML file, verbatim.

	2. JavaScript which defines code to be executed during processing of the jmarkdown file.
		This code can (a) generate HTML code which will be inserted in place of the script
		element, in the HTML file.  Alternatively, it may (b) define a JavaScript function which will
		create a new extension that gives the impression of the JavaScript function
		being called from the jmarkdown file itself.
	
	3. JavaScript which defines code to be executed during post-processing.  This means that the
		jmarkdown file has been processed and the provisional HTML output generated.  However,
		during post-processing, a Cheerio object is initialised with that provisional HTML output,
		and the post-processing code is evaluated with $ defined as that cheerio object.  This allows
		the JavaScript code to do DOM manipulation prior to writing out the final HTML.
*/

/*
	This extension simply looks for <script> tags, which it then captures and
	passes through to the output HTML verbatim.  I needed to write this
	because the marked.js parser occassionally mis-identifies scripts
*/

const script_regexp = /<script(?:\s+(?:src="[^"]*"|type="[^"]*"|defer|async|integrity="[^"]*"|crossorigin(?:="[^"]*")?))*\s*>[\s\S]*?<\/script>/i;
const javascript_script = {
				name: 'javascript',
				level: 'block',
				start(src) {
					return src.match(script_regexp)?.index; 
				},
				tokenizer(src) {
					const rule = new RegExp( "^" + script_regexp.source);
					const match = rule.exec(src);

					if (match) {
						// Check to make sure it's jmarkdown script code!
						let script = match[1]
						const token = {
							type: 'javascript',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						return token;
					}
				},
				renderer(token) {
					return `${token.raw}`;
				}
			};

/*
	This extension finds and extracts scripts which should either be
	run during compile time (data-type='jmarkdown') or saved for execution once the final
	document has been assembled (data=type='jmarkdown-postprocess').
*/

export let postprocessor_scripts = []; // array of all the post-processor scripts - this will be exported to the main programme

const jmarkdown_script = {
				name: 'jmarkdownScript',
				level: 'block',
				start(src) {
					return src.match(/<script\s+data-type=(['"])jmarkdown\1/i)?.index; 
				},
				tokenizer(src) {
					const rule = /^<script[^>]*>(\s+[\s\S]*?)<\/script>/;
					const match = rule.exec(src);

					if (match) {
						// Check to make sure it's jmarkdown script code!
						if (match[0].search(/<script\s+data-type=(['"])(?:jmarkdown|jmarkdown-postprocess)\1/i) == -1) {
							return;
						}

						let script = match[1]
						let [tag, ...rest] = match[0].split('>');

						// Check if it's a postprocessor script
						if (tag.includes("jmarkdown-postprocess") == true) {
							global.output = '';
							postprocessor_scripts.push(script);
						}
						else {
							global.output = '';
							runInThisContext(script);
						}
						const token = {
							type: 'jmarkdownScript',
							raw: match[0],
							text: match[1],
							output: global.output,
							tokens: []
						};
						return token;
					}
				},
				renderer(token) {
					return `${token.output}`;
				}
			};



export const jmarkdownScriptExtensions = {
	'javascript': javascript_script,
	'jmarkdown': jmarkdown_script
};


