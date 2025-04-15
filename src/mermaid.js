// This is a simple extension which ensures that mermaid diagrams, enclosed in
// a directive container, are written to the HTML file in a way that mermaid
// can recognise.
export function createMermaid(marker) {
	return {
		level: 'container',
		marker: marker,
		label: "mermaid",
		tokenizer: function(text, token) {
			token.text = text.replace("\n", '');
			return token;
		},
		renderer(token) {
			if (token.meta.name === "mermaid") {
				return `<div class="mermaid">${token.text}</div>`;
			}
			return false;
		}
	}
}
