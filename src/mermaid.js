// This is a simple extension which ensures that mermaid diagrams, enclosed in
// a directive container, are written to the HTML file in a way that mermaid
// can recognise.
export function createMermaid(marker) {
	return {
		level: 'container',
		marker: marker,
		label: "mermaid",
		tokenizer: function(text, token) {
			// Strip the leading newline between `:::mermaid` and the first
			// diagram line; preserve all internal newlines (mermaid is
			// line-based). Anchored regex makes the intent explicit — the
			// previous `text.replace("\n", '')` happened to do the same
			// thing only because string-arg `replace` is first-match-only.
			token.text = text.replace(/^\n/, '');
			return token;
		},
		renderer(token) {
			if (token.meta.name === "mermaid") {
				// Mermaid renders client-side; there is no LaTeX equivalent,
				// so emit nothing rather than leaking a <div> into the .tex.
				if (global.isLatex) return '';
				return `<div class="mermaid">${token.text}</div>`;
			}
			return false;
		}
	}
}
