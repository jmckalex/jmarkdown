#!/usr/bin/env node

import fs from 'fs';
import path, { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Load the configuration at startup.
// This needs to be done before the initialise() routine is called below, because that might use
// configuration data for the default jmarkdown template (i.e., {{Author}} info)
import { configManager } from './config-manager.js';
configManager.load();


// Command-line processing of options, so that extensions can be switched on or off, as desired.
import { Command } from 'commander';
const program = new Command();

// Main program setup
program
	.version('0.5')
	.description("A Markdown process with great customisation capabilities, plus JavaScript as a scripting language");

// Init subcommand
import { initialise } from './init.js';
program
	.command('init')
	.description('Initialise a new JMarkdown project')
	.option('-f, --file <filename>', 'Construct a skeleton file named "filename" from a template')
	.option('-t, --title [title]', 'Title for the newly created jmarkdown file (default: \'My title\')')
	.option('-m, --makefile [key]', 'Include a Makefile template (an optional key is required if adding to an existing Makefile, otherwise the first three letters of the filename will be used to differentiate the targets in the Makefile). This requires the -f option.')
	.action((options) => {
		if (options.title === true) {
			options.title = 'My title';
		}

		if (options.makefile !== undefined && options.file == undefined) {
			console.log('You need to specify a markdown file name for the Makefile template.');
			process.exit();
		}
		initialise(options, path.dirname(fileURLToPath(import.meta.url)));
		process.exit();
	});

// Show options
import { showOptions } from './init.js';
program
	.command('options')
	.description('Show the default configuration options')
	.action(() => {
		showOptions();
		process.exit();
	});


// Default command for processing files
program
	.command('process <filename>', { isDefault: true })
	.description('Process a JMarkdown file')
	.option('-n --normal-syntax', 'Disable JMarkdown syntax for /italics/ and *boldface*, etc., and revert to normal Markdown syntax')
	.action((filename, options) => {
		program.file_to_process = filename;
	});

program.parse(process.argv);
const options = program.opts();

// Get the markdown file we are supposed to process
const filename = program.file_to_process;
if (!filename) {
	console.error('Please provide a filename');
	process.exit(1);
}

const markdownFile = filename;
const markdownFileDirectory = path.dirname(path.resolve(process.cwd(), markdownFile));

import { runInThisContext, marked, marked_copy, registerExtension, registerExtensions } from './utils.js';

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

import { anchors } from './anchors.js';
registerExtension(anchors);

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

// There's a weird bug that I haven't yet figured out.
// If you install the titleBox directive here, you get an error whenever
// you try to use it in the markdown file.  However, if you install
// it later, after some other directives have been installed, it works.
import additionalDirectives, {titleBox} from './additional-directives.js';
marked.use(createDirectives(additionalDirectives));

import { createMermaid } from './mermaid.js';
marked.use(createDirectives( [ createMermaid(":::") ]));

import { createMultilevelOptionals } from './metadata-header.js';
createMultilevelOptionals('comment', false);

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
	marked_copy.use(createDirectives(directives));
}

import { targets, sources, inlineTarget } from './sources-and-targets.js';
createMultilevelDirectives(sources.renderer);
marked.use(createDirectives([targets]));
marked_copy.use(createDirectives([targets]));
registerExtension(inlineTarget);

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

registerExtensions([ 
	jmarkdownSyntaxEnhancements.classAndId 
]);

registerExtensions([ 
	jmarkdownSyntaxEnhancements.rightAlign, 
	jmarkdownSyntaxEnhancements.centerAlign 
]);

// Load extensions and directives from the configuration file(s).
// This should happen before the metadata header is processed.
await configManager.loadExtensions();
await configManager.loadDirectives();

// No await is needed because this doesn't read from a file.
configManager.loadOptionals();

// For some reason, this has to be installed here or it doesn't work
marked.use(createDirectives([titleBox]));

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
import { processTemplate } from './html-template.js';

const input = fs.readFileSync(filename, 'utf8');
const outFile = filename.replace(/\.([^.]+)$/, '.html');

const markdown_no_metadata = await processYAMLheader(input);
const text = processFileInclusions(markdown_no_metadata);
const content = marked.parse(text);
let html = processTemplate(content);

import * as PostProcessor from './post-processor.js';

html = PostProcessor.postProcessHTML(html);
html = PostProcessor.runPostprocessScripts(html);
html = PostProcessor.beautifyHTML(html);
fs.writeFileSync(outFile, html );



