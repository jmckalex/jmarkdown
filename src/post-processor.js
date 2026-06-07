/*
	This file contains all the code for post-processing the HTML constructed
	by the call to marked.parse().  
*/

import * as cheerio from 'cheerio';
export { cheerio };
import { configManager } from './config-manager.js';
import { replaceTargetsBySources } from './sources-and-targets.js';
import { resolveCitations } from './biblify-compile.js';
import { resetCrossrefs, recordLabel, lookupLabel, typedRefText } from './crossref.js';
import { commandForDepth } from './sectioning.js';

// Post-process HTML output using cheerio
export function postProcessHTML(html, options = {}) {
	// Load into cheerio — in fragment mode, pass isDocument=false to prevent
	// cheerio wrapping the content in <html><head><body> tags.
	const $ = cheerio.load(html, null, !options.fragment);

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

	resetCrossrefs();
	if (configManager.get("Headings") && configManager.get("Headings")[0] == "numeric") {
		add_labels_to_headers($);
	}
	number_figures($);
	process_crossrefs($);
	replaceTargetsBySources($);

	// Resolve compile-time citations (\cite-family commands + ::Bibliography),
	// when enabled. HTML only — LaTeX output is handled natively by natbib and
	// never reaches the post-processor.
	if (configManager.get('Biblify.resolve') && !global.isLatex) {
		resolveCitations($, { fragment: !!options.fragment, outBase: options.outBase });
	}

	// Only hoist styles to <head> in full-document mode; in fragment mode there's no <head>.
	if (!options.fragment) {
		moveBodyStylesToHead($);
	}
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

// Number figure floats (@begin(figure), see floats.js) in document order: prefix
// each caption with "Figure N:" and record the figure's id in the cross-ref
// registry so :ref/:cref resolve. LaTeX numbers figures natively, so this is
// HTML-only (the post-processor never runs for LaTeX). Always on — a float is
// numbered by definition, independent of the Headings: numeric heading option.
function number_figures($) {
	let n = 0;
	$('figure.figure').each((i, elem) => {
		const $fig = $(elem);
		n++;
		const id = $fig.attr('id');
		const $cap = $fig.find('figcaption').first();
		$cap.prepend(`<span class="figure-label xref">Figure ${n}:</span> `);
		if (id) {
			recordLabel(id, { number: `${n}`, type: 'figure', anchor: id });
		}
	});
}

function process_crossrefs($) {
	// First pass: record every :label's number + anchor in the registry.
	$(".xref-label").each((i, elem) => {
		let $elem = $(elem);
		let key = $elem.attr('data-key');
		let anchor = $elem.attr('id');
		let number;
		let in_footnote = $elem.closest('[id^="footnote-"]').length > 0 ? true : false;
		if (in_footnote) {
			let $footnote = $elem.closest('[id^="footnote-"]');
			const $ol = $footnote.closest("ol");
			const $allItems = $ol.children('li');
			const currentIndex = $allItems.index($footnote);
			number = `${currentIndex+1}`;
		}
		else {
			// The nearest preceding .xref is the number span a numbered heading
			// prepends (see add_labels_to_headers). Needs Headings: numeric.
			let $xref = $elem.prevAll(".xref").first();
			number = $xref.text();
		}
		if (number != undefined && number.endsWith('.')) {
			number = number.slice(0, -1);
		}
		// Type word for the typed :cref/:Cref form: footnotes are 'footnote';
		// a heading-anchored label takes the sectioning word for its depth
		// (section/subsection/chapter…), honouring Heading base / Document class.
		let type;
		if (in_footnote) {
			type = 'footnote';
		} else {
			const $heading = $elem.closest(':header');
			if ($heading.length) {
				const level = parseInt($heading.prop('tagName').slice(1), 10);
				type = commandForDepth(level);
			}
		}
		recordLabel(key, { number, anchor, type });
	});

	// Second pass: turn each :ref into a hyperlink carrying the number. An
	// unknown key renders as '??', mirroring LaTeX's own undefined-reference mark.
	$(".xref-ref").each((i, elem) => {
		let $elem = $(elem);
		let key = $elem.attr('data-key');
		let info = lookupLabel(key);
		if (info && info.number !== undefined && info.number !== '') {
			$elem.replaceWith(`<a class="xref-ref" href="#${info.anchor}">${info.number}</a>`);
		}
		else {
			$elem.text('??');
		}
	});

	// Typed (cleveref-style) references: :cref -> "section 3", :Cref -> "Section 3".
	$(".xref-cref").each((i, elem) => {
		let $elem = $(elem);
		let key = $elem.attr('data-key');
		let cap = $elem.attr('data-cap') === '1';
		let info = lookupLabel(key);
		if (info && info.number !== undefined && info.number !== '') {
			$elem.replaceWith(`<a class="xref-cref" href="#${info.anchor}">${typedRefText(info.type, info.number, cap)}</a>`);
		}
		else {
			$elem.text('??');
		}
	});
}

// When writing markdown, it's common to put <style> tags in the body.
// This moves all such tags to the <head> to be compliant with the HTML spec.
function moveBodyStylesToHead($) {
	const body_styles = $('body style').not('body svg style');
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
			content_unformatted: ['pre', 'code-display'], // Tags whose content shouldn't be reformatted
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

