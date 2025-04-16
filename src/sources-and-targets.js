export const targets = {
	level: 'inline',
	label: 'target',
	marker: ':',
	renderer(token) {
		if (token.meta.name === "target") {
			console.log(token.text);
			return `<span id='${token.text}'></span>`;
		}
		return false;
	}
}

export const sources = {
	level: 'container',
	label: "source",
	// tokenizer: function(text, token) {
	// 	token.text = text.replace("\n", '');
	// 	return token;
	// },
	renderer(token) {
		if (token.meta.name === "source") {
			const target = token.attrs.target;
			return `<div data-target='${target}'>${this.parser.parse(token.tokens)}</div>`;
		}
		return false;
	}
};

export function replaceTargetsBySources($) {
	$('[data-target]').each(function () {
		const $sourceElement = $(this);
		const targetID = $sourceElement.attr('data-target');
		// Find the target element
		const $targetElement = $(`#${targetID}`);
		$sourceElement.removeAttr('data-target');
		$targetElement.replaceWith($sourceElement);
	})
}