/*
	Cross-reference registry — the HTML side.

	The LaTeX path emits native \label/\ref (see the :label/:ref directives) and
	lets the engine number and resolve everything, so it never uses this module.
	HTML has no such machinery, so the post-processor builds this table during its
	pass: each :label records the number / anchor of the thing it marks, and each
	:ref is resolved against it. Forward references work because the whole document
	is already in the DOM before resolution runs.

	State is module-level but is RESET per document build via resetCrossrefs()
	(called at the top of postProcessHTML), which closes the long-standing
	"crossrefs never resets between runs" bug — important once a single process
	builds more than one document (library use, multi-file books).
*/

let labels = {};

// Discard all recorded labels. Call once at the start of each document build.
export function resetCrossrefs() {
	labels = {};
}

// Record a labelled target.
//   key     the label name (e.g. 'sec:intro')
//   info    { number, anchor, type? }
//             number  resolved number text (e.g. '3' or '2.1')
//             anchor  the element id a :ref should link to
//             type    the kind of target ('section', 'figure', …) — used by the
//                     typed :cref/:Cref form; optional here
export function recordLabel(key, info) {
	labels[key] = info;
}

// Look up a recorded target, or undefined if the key is unknown.
export function lookupLabel(key) {
	return labels[key];
}
