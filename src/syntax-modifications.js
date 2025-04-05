const italics = {
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

const strong = {
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

const underline = {
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
					return `<span style='text-decoration: underline;'>${this.parser.parseInline(token.tokens)}</span>`;
				}
			};

const subscript = {
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

const superscript = {
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

const jmarkdownSyntaxModifications = {
	'italics': italics,
	'strong': strong,
	'underline': underline,
	'subscript': subscript,
	'superscript': superscript
}

export default jmarkdownSyntaxModifications;