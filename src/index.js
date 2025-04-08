#!/usr/bin/env node

import { Marked } from 'marked';
import fs from 'fs';
import { runInThisContext, marked, marked_copy, registerExtensions } from './utils.js';

import { JSDOM } from 'jsdom';


import { createRequire } from 'module';
const require = createRequire(import.meta.url);
global.require = require;

import { execSync } from 'child_process';
import path, { dirname, join } from 'path';
const globalNodeModulesPath = execSync('npm root -g').toString().trim();

function requireGlobal(the_package) {
	//console.log(the_package);
	//console.log(path.join(globalNodeModulesPath, the_package));
	return require(path.join(globalNodeModulesPath, the_package));
}

global.requireGlobal = requireGlobal;


var my_footnotes = "";

// Initialise the default footnote extension
import markedFootnote from 'marked-footnote';

// We create two versions of the marked interpreter, because if we want to 
// call the interpreter from a <script> block in the jmarkdown code, we cannot
// pass that markdown into the main interpreter as that can screw up the state.
// However, we initialise the footnote extension only for the main interpreter because
// there's no easy way to handle footnotes in markdown interpreted by the <script> interpreter
marked.use(markedFootnote({
	rendererOptions: {
        containerTagName: 'section',
        containerClassName: 'footnotes'
    } 
}));


// Command-line processing of options, so that extensions can be switched on or off, as desired.
import { Command } from 'commander';
const program = new Command();
program
	.option('-n --normal-syntax', 'Disable JMarkdown syntax for /italics/ and *boldface* and revert to normal Markdown syntax')
	.argument('<filename>', 'Markdown file to process');

program.parse(process.argv);
const options = program.opts();

import { jmarkdownSyntaxEnhancements } from './syntax-enhancements.js';

registerExtensions([ 
	jmarkdownSyntaxEnhancements['latex'],
	jmarkdownSyntaxEnhancements['moustache']
]);


import jmarkdownSyntaxModifications from './syntax-modifications.js';

if (options.normalSyntax != true) {
	registerExtensions([
				jmarkdownSyntaxModifications['italics'], 
				jmarkdownSyntaxModifications['strong'], 
				jmarkdownSyntaxModifications['underline'],
				jmarkdownSyntaxModifications['subscript'],
				jmarkdownSyntaxModifications['superscript']
			]);
}



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
    return `<span style='font-weight: bold'>Theorem${start}</span><span style='font-style: italic;'>${rest}</span>`;
  }
};

// marked.use({ extensions: [theoremExtension]});

import extendedTables from "marked-extended-tables";

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
const markdown_demo_extension = {
  name: 'markdownDemo',
  level: 'block',                                     // Is this a block-level or inline-level tokenizer?
  start(src) { 
  	// if (src.match(/:::markdown-test/) != null) {
  	// }
    return src.match(/^:::markdown-test/)?.index; 
  }, 
  tokenizer(src, tokens) {
  	if (src.startsWith(":::")) {
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



//import { createDirectives, presetDirectiveConfigs } from 'marked-directive';
import { createDirectives, presetDirectiveConfigs } from './extended-directives.js';


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



marked.use(createDirectives([
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
				return `<section class="feedback">${html}</section>`;
			}
			return false;
		}
	},
	{
		'level': 'container',
		'marker': ":::",
		label: "title-box",
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
				label: name,
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

marked.use({
  tokenizer: {
    br() {
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
		let lang = token?.attrs?.type ?? "markdown"; 
		let original_raw = token.raw.split("\n").slice(1,-1).join("\n");
		let raw = "```" + `${lang}\n` + original_raw + "\n```\n";
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

createMultilevelDirectives(rendering_function_for_markdown_demo);

/*
	This is an attempt to create a version of the markdown-demo extension
	WITHOUT using marked-directives, because I can't control the
	tokenizer...
*/




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
			first_row = `<tr><td class='rowLabel' rowspan=${number_of_rows}>${row_label}</td>` + first_row;
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


marked.use({
	extensions: [ jmarkdownSyntaxEnhancements['descriptionLists'] ]
});


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


// This extension has to be registered after the directives in order for it to work.
registerExtensions([ 
	jmarkdownSyntaxEnhancements['emojis']
]);


import { jmarkdownScriptExtensions, postprocessor_scripts } from './script-blocks.js';
marked.use({
	extensions: [
		jmarkdownScriptExtensions['javascript'],
		jmarkdownScriptExtensions['jmarkdown'],
	]
}) 

global.output = '';


global.marked = marked;
//global.foobar = null;


import export_to_jmarkdown from './function-extensions.js';
global.export_to_jmarkdown = export_to_jmarkdown;


// This is needed for a number of things, including the classAndId extension
import * as cheerio from 'cheerio';


marked.use({ 
	extensions: [ jmarkdownSyntaxEnhancements['classAndId'] ]
});




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


import { metadata, custom_element_string, processYAMLheader } from './metadata-header.js';


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


marked.use({ 
	extensions: [ 
		jmarkdownSyntaxEnhancements['rightAlign'], 
		jmarkdownSyntaxEnhancements['centerAlign'] 
	]
});


function processFileInclusions(markdown) {
	const regex = /\[\[(.*?)\]\]/g;
	const matches = markdown.match(regex);

	if (!matches) return markdown;

	let cwd = process.cwd() + "/";


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


function post_process_markdown(content) {
	for (let md of markdown_for_postprocessing) {
		let id = md['id'];
		let html = marked.parse(md['markdown']);
		content = content.replace(id,html);
	}
	return content;
}



const pass_through = {
  level: 'container',
  marker: ':::',
  label: "plaintext",
  tokenizer: function(text, token) {
    //console.log("Called by the plaintext tokenizer");
  	//console.log(token);
  },
  renderer(token) {
  	if (token.meta.name == "plaintext") {
	  	//console.log("Called by the plaintext renderer");
	  	//console.log(token);
	  	return "Consumed plaintext";
	  }
	  return false;
  }
};

marked.use( createDirectives([pass_through]) );


const pass_through2 = {
  level: 'container',
  marker: ':::',
  label: "doThis",
  tokenizer: function(text, token) {
    //console.log("Called by the doThis tokenizer");
    //console.log(token);
  },
  renderer(token) {
  	if (token.meta.name == "doThis") {
	  	//console.log("Called by the doThis renderer");
	  	//console.log(token);
	  	return "I was told to do this";
	  }
	  return false;
  }
};

marked.use( createDirectives([pass_through2]) );

import { fileURLToPath } from 'url';

var content;
function generateHTMLOutput(text) {
	content = marked.parse(text);

	content += my_footnotes;

	content = post_process_markdown(content);

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	const jmarkdown_css = fs.readFileSync( join(__dirname, 'jmarkdown.css'), 'utf8');
	
	let body_classes = '';
	if ('Body classes' in metadata) {
		body_classes = metadata['Body classes'];
	}

	let output = `<!DOCTYPE html>
<html lang='en'>
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
	${jmarkdown_css}
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
<body class='${body_classes}'>
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


const filename = program.args[0]; //process.argv[2];
if (!filename) {
 console.error('Please provide a filename');
 process.exit(1);
}

const input = fs.readFileSync(filename, 'utf8');


const outFile = filename.replace(/\.([^.]+)$/, '.html');


let html = generateHTMLOutput(input);


// Post-process HTML output using cheerio

function processHTML(html) {
  // Load into cheerio
  const $ = cheerio.load(html);
  
  // Find all our marker spans
  $('span.marker-to-remove').each((i, elem) => {
    const $elem = $(elem);
    const classes = $elem.attr('data-add-classes');
    const id = $elem.attr('data-add-id');
    
    // Add classes and id to parent
    const $parent = $elem.parent();
    if (classes) {
      $parent.addClass(classes);
    }
    if (id) {
      $parent.attr('id', id);
    }
    
    // Remove the marker span
    $elem.remove();
  });
  
  add_labels_to_headers($);
  process_crossrefs($);

  return $.html();
}

function add_labels_to_headers($) {
	let [h1,h2,h3,h4,h5,h6] = [0,0,0,0,0,0];

	$(":header").each((i, elem) => {
		let $elem = $(elem);
		switch($elem.prop('tagName')) {
		case "H1":
			$(elem).prepend(`<span class='header-label h1-label xref'>${++h1}.</span> `);
			h2 = 0;
			break;
		case "H2":
			$(elem).prepend(`<span class='header-label h2-label xref'>${h1}.${++h2}.</span> `);
			h3 = 0;
			break;
		case "H3":
			$(elem).prepend(`<span class='header-label h3-label xref'>${h1}.${h2}.${++h3}.</span> `);
			h4 = 0;
			break;
		case "H4":
			$(elem).prepend(`<span class='header-label h4-label xref'>${h1}.${h2}.${h3}.${++h4}.</span> `);
			h5 = 0;
			break;
		case "H5":
			$(elem).prepend(`<span class='header-label h5-label xref'>${h1}.${h2}.${h3}.${h4}.${++h5}.</span> `);
			h6 = 0;
			break;
		case "H6":
			$(elem).prepend(`<span class='header-label h6-label xref'>${h1}.${h2}.${h3}.${h4}.${h5}.${++h6}.</span> `);
			break;
		}	
	})
}

let crossrefs = {};
function process_crossrefs($) {
	$(".xref-label").each((i, elem) => {
		let $elem = $(elem);
		let key = $elem.attr('data-key');
		let in_footnote = $elem.closest('[id^="footnote-"]').length > 0 ? true : false;
		if (in_footnote) {
			let $footnote = $elem.closest('[id^="footnote-"]');
			const $ol = $footnote.closest("ol");
			const $allItems = $ol.children('li');
			const currentIndex = $allItems.index($footnote);
			crossrefs[key] = `${currentIndex+1}`;
		}
		else {
			let $xref =  $elem.prevAll(".xref").first();
			crossrefs[key] = $xref.text();
		}
	});

	$(".xref-ref").each((i, elem) => {
		let key = $(elem).attr('data-key');
		let str = crossrefs[key];
		if (str != undefined && str.endsWith('.')) {
		    str = str.slice(0, -1);
		}
		$(elem).text(str);
	});
}


// Handle any cases of adding classes/ids to elements.
html = processHTML(html);

import beautify from 'js-beautify';

function beautify_html(html) {
	return beautify.html(html,
		{
			indent_size: 2,             // Number of spaces for indentation
			indent_char: ' ',           // Character to use for indent (usually space)
			max_preserve_newlines: 1,   // Maximum number of line breaks to preserve
			preserve_newlines: true,    // Whether to keep existing line breaks
			indent_inner_html: true,    // Indent <head> and <body> sections
			wrap_line_length: 0,        // Maximum line length (0 = no wrapping)
			wrap_attributes: 'auto',    // 'auto', 'force', 'force-aligned', 'force-expand-multiline'
			wrap_attributes_indent_size: 2, // Indent size for wrapped attributes
			unformatted: ['code', 'pre'], // Tags that shouldn't be reformatted
			content_unformatted: ['pre'], // Tags whose content shouldn't be reformatted
			extra_liners: ['head', 'body', '/html'], // Tags that should have extra line breaks before them
			end_with_newline: true,     // End output with newline
			editorconfig: false,        // Use .editorconfig if present
			eol: '\n',                  // End of line character
			indent_scripts: 'normal'    // 'normal', 'keep', 'separate'
		});
}

let beautified = beautify_html(html);

global.fs = fs;

function runPostprocessScripts() {
	global.html = beautified;
	global.cheerio = cheerio;
	global.console = console;
	let configuration = `const $ = cheerio.load(html);`
	runInThisContext(configuration);
	for (let script of postprocessor_scripts) {
		runInThisContext(script);
	}
}

runPostprocessScripts();

fs.writeFileSync(outFile, beautify_html(global.html) );



