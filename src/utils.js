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



export { runInThisContext, marked, marked_copy, registerExtension, registerExtensions };
