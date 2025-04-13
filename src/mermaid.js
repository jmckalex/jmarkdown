// This is a simple extension which ensures that mermaid diagrams,
// enclosed in a code fence, are output in a way which mermaid recognises.

const mermaid = {
	name: 'mermaid',
	level: 'block',
	start(src) { return src.match(/```mermaid/)?.index },
	tokenizer(src) {
		const match = src.match(/^```mermaid([\s\S]*?)```/);
		if (match) {
			return {
				type: 'mermaid',
				raw: match[0],
				mermaid: true,
				text: match[1].trim()
			};
		}
	},
	renderer(token) {
		if (token.mermaid) {
			return `<div class='mermaid'>${token.text}</div>`;
		}
	}
};

export { mermaid };