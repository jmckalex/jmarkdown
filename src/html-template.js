import Mustache from 'mustache';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { configManager } from './config-manager.js';
import { custom_elements } from './metadata-header.js';

export function processTemplate(content) {
	const default_template = fs.readFileSync(path.join(configManager.get('Jmarkdown app directory'), 'default-template.html'), 'utf8');
	const jmarkdown_css = fs.readFileSync( path.join(configManager.get('Jmarkdown app directory'), 'jmarkdown.css'), 'utf8');

	let config = { ...configManager.getConfig() };
	config = replaceSpacesInKeys(config);
	config['Highlight_src'] = Mustache.render(config['Highlight_src'], config);
	config['Jmarkdown_css'] = jmarkdown_css;
	config['Custom_elements'] = custom_elements;
	config['Content'] = content;
	
	let html = '';
	// If the template is set in the metadata header, then config['Template'] will be an array.
	// However, if it is set in a config.json file, it will be a string. So deal with this.
	let template_name = '';
	if ('Template' in config) {
		if (Array.isArray(config['Template'])) {
			template_name = config['Template'][0].trim();
		}
		else {
			template_name = config['Template'].trim();
		}
	}

	if (template_name == 'default') {
		html = Mustache.render(default_template, config);
	}
	else {
		let markdown_directory = configManager.get("Markdown file directory");
		const template = fs.readFileSync( path.join(markdown_directory, template_name), 'utf8');
		html = Mustache.render(template, config);
	}
	// These are temporary files so that I can inspect how the templating
	// engine is working.  The should be removed later.
	fs.writeFileSync("foo.html", html);
	fs.writeFileSync("config.json", JSON.stringify(config, null, 4));
	return html;
}

function replaceSpacesInKeys(obj) {
	// Create a new object to store modified keys
	const result = {};

	// Iterate through all keys in the object
	for (const key in obj) {
		if (Object.hasOwnProperty.call(obj, key)) {
			// Check if the key contains spaces
			if (key.includes(' ')) {
	        // Create new key with spaces replaced by underscores
				const newKey = key.replace(/ /g, '_');
	        // Add to result with the new key
				result[newKey] = obj[key];
			} else {
	        // Keep the original key if it doesn't have spaces
				result[key] = obj[key];
			}
		}
	}

	return result;
}

