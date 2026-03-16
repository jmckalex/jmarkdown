export const editors = {
	name: 'editors',
	level: 'inline',
	start(src) { return src.match(/✍️/)?.index },
	tokenizer(src) {
		const match = src.match(/^✍️/);
		if (match) {
			console.log(match);
			const token = {
				type: 'editors',
				raw: match[0],
				text: "foo",
				tokens: []
			};
			return token;
		}
	},
	renderer(token) {
		return `<span id='${token.text}'>✍️</span>`;
	}
};



