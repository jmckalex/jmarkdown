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

function registerExtension(extension_definition) {
	[marked, marked_copy].map(m => {
		m.use({ extensions: [ extension_definition ]});
	});
}



export { runInThisContext, marked, marked_copy, registerExtension };
