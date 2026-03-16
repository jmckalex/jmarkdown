export const italics = {
					name: 'italics',
					level: 'inline',
					start(src) { return src.match(/\//)?.index },
					tokenizer(src) {
						const rule = /^\/([^\/.?!]+[.?!]?)\//;
						//const rule = /^\/([^/]+?)\/(?!/)/;
						const match = rule.exec(src);
						if (match) {
							const token = {
								type: 'italics',
								raw: match[0],
								text: match[1],
								tokens: []
							};
							this.lexer.inline(token.text, token.tokens);
							return token;
						}
					},
					renderer(token) {
						return `<em>${this.parser.parseInline(token.tokens)}</em>`;
					}
				};

export const strong = {
				name: 'strong',
				level: 'inline',
				start(src) { return src.match(/\//)?.index },
				tokenizer(src) {
					const rule = /^\*([^\*]+)\*/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'strong',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					return `<strong>${this.parser.parseInline(token.tokens)}</strong>`;
				}
			};

export const highlight = {
	name: 'highlight',
	level: 'inline',
	start(src) { return src.match(/==/)?.index },
	tokenizer(src) {
		const rule = /^==([^=]+)==/;
		const match = rule.exec(src);
		if (match) {
			const token = {
				type: 'highlight',
				raw: match[0],
				text: match[1],
				tokens: []
			};
			this.lexer.inline(token.text, token.tokens);
			return token;
		}
	},
	renderer(token) {
		return `<span class='highlight'>${this.parser.parseInline(token.tokens)}</span>`;
	}
};

export const intense = {
	name: 'intense',
	level: 'inline',
	start(src) { return src.match(/\*\*/)?.index },
	tokenizer(src) {
		const rule = /^\*\*([^*]+)\*\*/;
		const match = rule.exec(src);
		if (match) {
			const token = {
				type: 'intense',
				raw: match[0],
				text: match[1],
				tokens: []
			};
			this.lexer.inline(token.text, token.tokens);
			return token;
		}
	},
	renderer(token) {
		return `<span class='intense'>${this.parser.parseInline(token.tokens)}</span>`;
	}
};

export const underline = {
				name: 'underline',
				level: 'inline',
				start(src) { return src.match(/__/)?.index },
				tokenizer(src) {
					const rule = /^__([^_]+)__/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'underline',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					return `<span class='underline'>${this.parser.parseInline(token.tokens)}</span>`;
				}
			};

export const subscript = {
				name: 'subscript',
				level: 'inline',
				start(src) { return src.match(/_/)?.index },
				tokenizer(src) {
					const rule = /^_([a-zA-Z0-9]|\{[^}]*\})/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'subscript',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					let contents = this.parser.parseInline(token.tokens).replace(/[{}]/g, '');
					return `<sub>${contents}</sub>`;
				}
			};		

export const superscript = {
				name: 'superscript',
				level: 'inline',
				start(src) { return src.match(/\^/)?.index },
				tokenizer(src) {
					const rule = /^\^([a-zA-Z0-9]|\{[^}]*\})/;
					const match = rule.exec(src);
					if (match) {
						const token = {
							type: 'superscript',
							raw: match[0],
							text: match[1],
							tokens: []
						};
						this.lexer.inline(token.text, token.tokens);
						return token;
					}
				},
				renderer(token) {
					let contents = this.parser.parseInline(token.tokens).replace(/[{}]/g, '');
					return `<sup>${contents}</sup>`;
				}
			};		