// These are syntax enhancements for jMarkdown.  That is, they don't
// modify the standard markdown syntax but they provide additional functionality.

// Scan the text for LaTeX code between the standard MathJax delimiters,
// and make sure the raw text is passed straight through to the output HTML.  The one exception
// is that '<' and '>' symbols need to be transformed to '&lt;' or '&gt;' as they
// can cause errors when the HTML is interpreted.
const latexTokenizer = {
                    name: 'latex',
                    level: 'inline',
                    priority: 1,
                    start(src) {
                        const match = src.match(/\$\$|\$|\\\(|\\\[/);
                        return match ? match.index : -1;
                    },
                    tokenizer(src, tokens) {
                        // Match block LaTeX first (since it's more specific)
                        const blockMatch = /^\$\$([^$]*?)\$\$|^\\\[(.*?)\\\]/s.exec(src);
                        if (blockMatch && blockMatch.index === 0) {
                            let math = blockMatch[1] ? blockMatch[1] : blockMatch[2];
                            return {
                                type: 'latex',
                                raw: blockMatch[0],
                                text: math,
                                block: true
                            };
                        }

                        // Match inline LaTeX
                        const inlineMatch = /\$([^\$]+?)\$|\\\((.*)\\\)/.exec(src);
                        if (inlineMatch && inlineMatch.index === 0) {
                            let math = inlineMatch[1] ? inlineMatch[1] : inlineMatch[2];
                            return {
                                type: 'latex',
                                raw: inlineMatch[0],
                                text: math,
                                block: false
                            };
                        }

                        return false;
                    },
                    renderer(token) {
                        let sanitised_text = token.text.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
                        return token.block ? `$$${sanitised_text}$$` : `$${sanitised_text}$`;
                    }       
                };

import metadata from './metadata-header.js';

// Look for text of the form {{variable_name}} which will be defined either in a file
// or in the metadata header, for inclusion in the output HTML
const moustache = {
                name: 'moustache',
                level: 'inline',
                start(src) { return src.match(/{{/)?.index },
                tokenizer(src) {
                    const rule = /^{{([^}]+)}}/;
                    const match = rule.exec(src);
                    if (match) {
                        const token = {
                            type: 'moustache',
                            raw: match[0],
                            text: match[1],
                            tokens: []
                        };
                        //this.lexer.inline(token.text, token.tokens);
                        return token;
                    }
                },
                renderer(token) {
                    if (token.text in metadata) {
                        let contents = metadata[token.text];
                        return contents.join('');
                    }
                    else {
                        try {
                            const result = runInThisContext(token.text);
                            return result;
                        }
                        catch (error) {
                            return `{{${token.text}}}`;
                        }
                    }
                }
            };

// Emojis!
// This code is mostly taken from the marked-emojis package, but I've tweaked it to provide
// support for FontAwesome as well.

import emoji_data from './emoji-data.json' with { type: 'json'};

const emojiNames = Object.keys(emoji_data).map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + "|fa-[^:]+";
const emojiRegex = new RegExp(`:(${emojiNames}):`);
const tokenizerRule = new RegExp(`^${emojiRegex.source}`);

function emoji_renderer(token) {
    let token_text = token.text;

    if (token_text.includes('fa-')) {
        let classes = token_text.split(" ").map(text => (text.includes("fa-")) ? text : "fa-" + text ).join(" ");
        return `<i class='fa-solid ${classes}'></i>`;
    }
    else {
        let url = emoji_data[token_text];
        return `<img alt="${token.name}" src="${url}" class="marked-emoji-img">`;
    }
}

const emojis = {
                name: 'emoji',
                level: 'inline',
                start(src) { return src.match(emojiRegex)?.index; },
                tokenizer(src) {
                    //const rule = /^:([^:]+):/;
                    const match = tokenizerRule.exec(src);
                    if (match) {
                        const token = {
                            type: 'emoji',
                            raw: match[0],
                            text: match[1],
                            tokens: []
                        };
                        return token;
                    }
                },
                renderer(token) {
                    return emoji_renderer(token);
                }
            };


export const jmarkdownSyntaxEnhancements = {
    'latex': latexTokenizer,
    'moustache': moustache,
    'emojis': emojis
};

