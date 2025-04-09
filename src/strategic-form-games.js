/*
	This is a complicated directive designed for handling strategic-form games.
	One main contributor for the complication is that the strategy labels
	as well as the row, column and caption labels can be tokenised, allowing for
	typesetting (and even footnotes!) to be included.
*/

const strategicFormGame = {
	level: 'container',
	marker: ':::',
	label: "game",
	tokenizer: function(text, token) {
		// Check to see if any labels were specified in the attributes
		let column_label = token.attrs?.column;
		let row_label = token.attrs?.row;
		let caption_label = token.attrs?.caption;
		// Are we supposed to wrap the strategy names in MathJax math delimiters?
		let math_option = token.attrs?.math;

		// Convert the contents of the environment into a format we can
		// process more easily.  Throw away the first line because the
		// contents of a container directive always being with a '\n' so
		// the first array element is always an empty line.
		let rest = text.split("\n");
		rest.shift();

		// Detect if an information section is included, with row/column/caption labels.
		// If so, this over-writes information from the attrs
		const index = rest.findIndex(str => /^\s*$/.test(str));
		let game_labels = {};
		let info_section = "";
		if (index != -1) {
			// Save the payoff matrix for processing in the renderer funciton.
			token['matrix'] = rest.slice(0, index).join("\n");

			// Now extract the contents from the information section
			info_section = rest.slice(index+1);
			rest = rest.slice(0,index);
			game_labels = extract_game_labels(info_section.join('\n'));
			if (game_labels['row']) {
				row_label = game_labels['row'];
				token['row'] = [];
				this.lexer.inline(row_label, token['row']);
			}
			if (game_labels['column']) {
				column_label = game_labels['column'];
				token['column'] = [];
				this.lexer.inline(column_label, token['column']);
			}
			if (game_labels['caption']) {
				caption_label = game_labels['caption'];
				token['caption'] = [];
				this.lexer.inline(caption_label, token['caption']);
			}
		}
		else {
			if (row_label) {
				token['row'] = [];
				this.lexer.inline(row_label, token['row']);
			}
			if (column_label) {
				token['column'] = [];
				this.lexer.inline(column_label, token['column']);
			}
			if (caption_label) {
				token['caption'] = [];
				this.lexer.inline(caption_label, token['caption']);
			}
			token['matrix'] = rest.join("\n");
		}

		// If we *aren't* wrapping the strategy names in MathJax math delimiters,
		// then run each of the strategy names through the tokenizer.
		if (math_option == undefined || math_option.toLowerCase() == "default") {
			let column_strategies = get_column_strategies( token['matrix'] );
			let row_strategies = get_row_strategies( token['matrix'] );
			token['column strategies'] = column_strategies.map(() => []);
			column_strategies.map( (label, i) => this.lexer.inline(label, token['column strategies'][i]) );
			token['row strategies'] = row_strategies.map(() => []);
			row_strategies.map( (label, i) => this.lexer.inline(label, token['row strategies'][i]) );
		}
	},
	renderer(token) {
		if (token.meta.name === "game") {
			let row_label = false;
			if (token['row'] != undefined) {
				row_label = this.parser.parseInline(token['row']);
			}

			let column_label = false;
			if (token['column'] != undefined) {
				column_label = this.parser.parseInline(token['column']);
			}

			let caption_label = false;
			if (token['caption'] != undefined) {
				caption_label = this.parser.parseInline(token['caption']);
			}

			// If a row label is provided, we need to add an extra column to
			// the table row containing the column strategies in order to have them
			// properly aligned.
			let maybe_extra_column = '';
			if (row_label) {
				maybe_extra_column = "<td></td>";
			}

			let rest = token['matrix'].split("\n");
			rest = rest.map(str => str.trim());
			rest.shift();
			
			let number_of_columns = get_column_strategies( token['matrix'] ).length;
			let number_of_rows = get_row_strategies( token['matrix'] ).length;

			// Process the table role containing the column strategies, taking into account whether
			// they should be surrounded by math delimiters or were run through the tokenizer.
			let math_option = token.attrs?.math;
			let column_strategies = '';
			if (math_option == undefined || math_option.toLowerCase() == "default") {
				let cs = token['column strategies'].map( toks => this.parser.parseInline(toks));
				let pre = "<td class='columnStrategies columnLabel strategyLabels'>";
				let post = "</td>";
				cs = cs.map( s => pre + s + post);
				column_strategies = cs.join('');
			}
			else if (math_option.toLowerCase() == "all") {
				let cs = get_column_strategies( token['matrix'] );
				let pre = "<td class='columnStrategies columnLabel strategyLabels'>\\(";
				let post = "\\)</td>";
				column_strategies = cs.map( s => pre + s + post).join('');
			}
			column_strategies = `<tr class='no-border'>${maybe_extra_column}<td></td>` + column_strategies + "</tr>";

			// Now wrap the cells of the payoff matrix in math symbols, and then optionally do that
			// for the row strategies, as needed.
			rest = rest.map( (row, i) => {
				row = row.split("&").map(el => el.trim());
				let strategy = row.shift();
				if (math_option == undefined || math_option.toLowerCase() == "default") {
					strategy = this.parser.parseInline( token['row strategies'][i] );
				}
				else {
					strategy = "\\(" + strategy + "\\)";
				}
				strategy = "<td class='rowLabel rowStrategies strategyLabels'>" + strategy + "</td>";
				let pre = "<td class='payoffs'>\\(";
				let post = "\\)</td>";
				row = row.map(el => pre + el + post).join('');
				row = strategy + row;
				return row;
			});

			let first_row = rest.shift();
			if (row_label) {
				first_row = `<td class='rowLabel' rowspan=${number_of_rows}>${row_label}</td>` + first_row;
			}
			rest.unshift(first_row);
			rest = rest.map( r => "<tr>" + r + "</tr>");

			rest.unshift(column_strategies);

			let column_heading = '';
			if (column_label) {
				column_heading = `<tr class='no-border'>${maybe_extra_column}<td></td><td class='columnLabel' colspan='${number_of_columns}'>${column_label}</td></tr>`;
			}
			rest.unshift(column_heading);

			let caption = "";
			if (caption_label) {
				caption = `<tr class='no-border'>${maybe_extra_column}<td></td><td class='caption' colspan=${number_of_columns}>${caption_label}</td></tr>`;
			}
			rest.push(caption)

			output = "<table class='game'>" + rest.join('\n') + "</table>";

			return output;

		}
		return false;
	}
}


function extract_game_labels(text) {
    // First, normalize the keys we're looking for
    const validKeys = ['row', 'column', 'caption'];
    
    // Create regex that matches any of our keys (case insensitive) followed by colon
    const keyPattern = new RegExp(`^(${validKeys.join('|')}):\\s*(.*)`, 'i');
    
    // Split into lines
    const lines = text.split('\n');
    
    let result = {};
    let currentKey = null;
    let currentContent = [];
    
    for (const line of lines) {
        // Check if this line starts a new section
        const match = line.match(keyPattern);
        
        if (match) {
            // If we were building up content for a previous key, save it
            if (currentKey) {
                result[currentKey] = currentContent.join('\n').trim();
                currentContent = [];
            }
            
            // Start new section
            currentKey = match[1].toLowerCase();
            currentContent.push(match[2]);
        } else if (currentKey) {
            // Continue building current section
            currentContent.push(line);
        }
    }
    
    // Don't forget to save the last section
    if (currentKey) {
        result[currentKey] = currentContent.join('\n').trim();
    }
    
    return result;
}


function get_column_strategies(matrix) {
	let column_strategies = matrix.split("\n").shift().split("&").map(str => str.trim());
	return column_strategies;
}


function get_row_strategies(matrix) {
	let [first, ...row_strategies] = matrix.split("\n");
	row_strategies = row_strategies.map(str => str.split("&").shift().trim());
	return row_strategies;
}

export default strategicFormGame;