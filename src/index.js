#!/usr/bin/env node

import fs from 'fs';
import path, { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Command-line processing of options, so that extensions can be switched on or off, as desired.
import { Command } from 'commander';
const program = new Command();
program
	.option('-n --normal-syntax', 'Disable JMarkdown syntax for /italics/ and *boldface* and revert to normal Markdown syntax')
	.argument('<filename>', 'Markdown file to process');

program.parse(process.argv);
const options = program.opts();

// Get the markdown file we are supposed to process
const filename = program.args[0]; //process.argv[2];
if (!filename) {
	console.error('Please provide a filename');
	process.exit(1);
}
const markdownFile = filename;
const markdownFileDirectory = path.dirname(markdownFile);

import { runInThisContext, marked, marked_copy, registerExtensions } from './utils.js';
import { configManager } from './config-manager.js';

// Load the configuration at startup
configManager.load();
configManager.set("Markdown file directory", markdownFileDirectory);
configManager.set("Jmarkdown app directory", path.dirname(fileURLToPath(import.meta.url)) )

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
global.require = require;

import { execSync } from 'child_process';
const globalNodeModulesPath = execSync('npm root -g').toString().trim();

function requireGlobal(the_package) {
	//console.log(the_package);
	//console.log(path.join(globalNodeModulesPath, the_package));
	return require(path.join(globalNodeModulesPath, the_package));
}

global.requireGlobal = requireGlobal;

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



import * as jmarkdownSyntaxEnhancements from './syntax-enhancements.js';

registerExtensions([ 
	jmarkdownSyntaxEnhancements.latex,
	jmarkdownSyntaxEnhancements.moustache
]);


import * as jmarkdownSyntaxModifications from './syntax-modifications.js';

if (options.normalSyntax != true) {
	registerExtensions([
				jmarkdownSyntaxModifications.italics, 
				jmarkdownSyntaxModifications.strong, 
				jmarkdownSyntaxModifications.underline,
				jmarkdownSyntaxModifications.subscript,
				jmarkdownSyntaxModifications.superscript
			]);
}

import { mermaid } from './mermaid.js';
registerExtensions( [ mermaid ]);

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


import additionalDirectives from './additional-directives.js';
marked.use(createDirectives(additionalDirectives));

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


import markedAlert from 'marked-alert';
marked.use(markedAlert());
marked_copy.use(markedAlert());


import createMarkdownDemo from './markdown-demo.js';
const markdownDemos = [
  createMarkdownDemo(':::'),
  createMarkdownDemo('::::'),
  createMarkdownDemo(':::::'),
  createMarkdownDemo('::::::'),
  createMarkdownDemo(':::::::'),
  createMarkdownDemo(':::::::')
];
marked.use( createDirectives( markdownDemos ) );

import strategicFormGame from './strategic-form-games.js';
marked.use( createDirectives([ strategicFormGame ]) );
marked_copy.use( createDirectives([ strategicFormGame ]) );

registerExtensions([ 
	jmarkdownSyntaxEnhancements.descriptionLists 
]);

import createTiKZ from './tikz.js';
marked.use( createDirectives( [ createTiKZ(':::') ] ) );

import markedMoreLists from 'marked-more-lists';
marked.use(markedMoreLists());
marked_copy.use(markedMoreLists());

// This extension has to be registered after the directives in order for it to work.
registerExtensions([ 
	jmarkdownSyntaxEnhancements.emojis
]);


import { jmarkdownScriptExtensions, postprocessor_scripts } from './script-blocks.js';
marked.use({
	extensions: [
		jmarkdownScriptExtensions['javascript'],
		jmarkdownScriptExtensions['jmarkdown'],
	]
}) 

global.output = '';


global.marked = marked_copy;

// This function needs to be available to code executed in runInThisContext,
// in order to be able to create extensions which execute JavaScript code.
import export_to_jmarkdown from './function-extensions.js';
global.export_to_jmarkdown = export_to_jmarkdown;


// This is needed for a number of things, including the classAndId extension
import * as cheerio from 'cheerio';


registerExtensions([ 
	jmarkdownSyntaxEnhancements.classAndId 
]);

registerExtensions([ 
	jmarkdownSyntaxEnhancements.rightAlign, 
	jmarkdownSyntaxEnhancements.centerAlign 
]);


import { gfmHeadingId, getHeadingList } from "marked-gfm-heading-id";
import { createTOC } from './utils.js';

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


import { metadata, processYAMLheader } from './metadata-header.js';

import processFileInclusions from './file-inclusion.js';

marked.use({
	hooks: {
		preprocess(markdown) {
			let markdown_no_metadata = processYAMLheader(markdown);
			return processFileInclusions(markdown_no_metadata);
		}
	}
});


import { processTemplate } from './html-template.js';


function generateHTMLOutput(text) {
	let content = marked.parse(text);
	return processTemplate(content);
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
			"css": {
				"end_with_newline": false
			},
			"js": {
				"end_with_newline": false
			},
			indent_char: ' ',           // Character to use for indent (usually space)
			max_preserve_newlines: 1,   // Maximum number of line breaks to preserve
			preserve_newlines: true,    // Whether to keep existing line breaks
			indent_inner_html: true,    // Indent <head> and <body> sections
			wrap_line_length: 0,        // Maximum line length (0 = no wrapping)
			wrap_attributes: 'auto',    // 'auto', 'force', 'force-aligned', 'force-expand-multiline'
			wrap_attributes_indent_size: 2, // Indent size for wrapped attributes
			unformatted: ['code', 'pre'], // Tags that shouldn't be reformatted
			content_unformatted: ['pre'], // Tags whose content shouldn't be reformatted
			extra_liners: [], // Tags that should have extra line breaks before them
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



