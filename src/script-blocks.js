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

export const jmarkdownScriptExtensions = {
	'scripts': javascript_script
};


