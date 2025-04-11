/*
	Several of the jmarkdown extensions need to evaluate code in a shared
	instance of runInThisContext.  This utility module makes that possible.
*/
import { runInThisContext } from 'vm';
import { marked, Marked } from 'marked';


let marked_copy = new Marked({
	indentedCode: false
});

marked.setOptions({
	gfm: true
})

// This function takes a single extension, not in an array.
function registerExtension(extension_definition) {
	[marked, marked_copy].map(m => {
		m.use({ extensions: [ extension_definition ]});
	});
}

// This function takes multiple extensions, in an array.
function registerExtensions(extensions) {
	[marked, marked_copy].map(m => {
		m.use({ extensions: extensions });
	});
}

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

export const config = {
	'home directory': null
};

export { runInThisContext, marked, marked_copy, registerExtension, registerExtensions, createTOC };
