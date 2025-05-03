/*
	This file contains all the code for post-processing the HTML constructed
	by the call to marked.parse().  
*/

import * as cheerio from 'cheerio';
export { cheerio };
import { configManager } from './config-manager.js';
import { replaceTargetsBySources } from './sources-and-targets.js';

// Post-process HTML output using cheerio
export function postProcessHTML(html) {
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

	if (configManager.get("Headings") && configManager.get("Headings")[0] == "numeric") {
		add_labels_to_headers($);
	}
	process_crossrefs($);
	replaceTargetsBySources($);
	moveBodyStylesToHead($);
	return $.html();
}

// Add numeric headings, if requested.  (Right now, this is only supported if the
// metadata header has 'Headings: numeric')
function add_labels_to_headers($) {
	let [h1,h2,h3,h4,h5,h6] = [0,0,0,0,0,0];

	$('div.toc').addClass('numeric');

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
		// Now update the TOC, if it exists.
		let id = $elem.attr('id');
		let $toc = $(`[data-id='${id}']`);
		if ($toc.length > 0) {
			$toc.html($elem.html());
		}
		let html = $elem.html();
		html = `<a href='#toc'>${html}</a>`;
		$elem.html(html);
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

// When writing markdown, it's common to put <style> tags in the body.
// This moves all such tags to the <head> to be compliant with the HTML spec.
function moveBodyStylesToHead($) {
	const body_styles = $('body style');
	if (body_styles.length > 0) {
		const styles = [];
		body_styles.each(function () {
			styles.push($(this));
			$(this).remove();
		});
		styles.forEach(style => {
			$('head').append(style);
		})
	}
}


import beautify from 'js-beautify';

export function beautifyHTML(html) {
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

import fs from 'fs';
import { postprocessor_scripts } from './script-blocks.js';
import { runInThisContext } from './utils.js';

export function runPostprocessScripts(html) {
	global.fs = fs;
	global.html = html;
	global.cheerio = cheerio;
	global.console = console;
	let configuration = `const $ = cheerio.load(html);`
	runInThisContext(configuration);
	for (let script of postprocessor_scripts) {
		runInThisContext(script);
	}
	return global.html;
}

