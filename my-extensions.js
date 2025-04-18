// This is a simple file showing two silly extensions that are dynamically loaded.

export const reverseText = {
	name: 'reverseText',
	level: 'block',
	start(src) { return src.match(/@Reverse/)?.index },
	tokenizer(src) {
		const match = src.match(/^@Reverse([\s\S]*?)@endReverse/);
		if (match) {
			console.log("HERE!")
			console.log(match[0], match[1]);
			const token = {
				type: 'reverseText',
				raw: match[0],
				text: match[1].trim(),
				tokens: []
			};

			const reversed = token.text.split('').reverse().join('');
			this.lexer.blockTokens(reversed, token.tokens);
			return token;
		}
	},
	renderer(token) {
		return `<div class='reverse'>${this.parser.parse(token.tokens)}</div>`;
	}
};

export const jmckalex = {
	name: 'jmckalex',
	level: 'inline',
	start(src) { return src.match(/jmckalex/)?.index },
	tokenizer(src) {
		const match = src.match(/^jmckalex/);
		if (match) {
			console.log(match);
			const token = {
				type: 'jmckalex',
				raw: match[0],
				mermaid: true,
				text: match[0],
				tokens: []
			};
			return token;
		}
	},
	renderer(token) {
		return `J. McKenzie Alexander`;
	}
};

export default [reverseText, jmckalex];