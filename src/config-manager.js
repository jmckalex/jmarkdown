// config-manager.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { marked } from './utils.js';

// Default configuration values
export const DEFAULT_CONFIG = {
	'Lang': 'en',
	'Highlight theme': 'default',
	'Body classes': '',
	"Biblify activate": false,
	"Biblify": {
		"add helper function": true,
		"add section heading": true,
		"add toc entry": true,
		"bibliography": "",
		"bibliography style": "",
		"defer": false
	},
	'Custom directives': [],
	'Fontawesome': 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/js/all.min.js',
	'Mermaid': 'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js',
	'Highlight src': 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/{{Highlight_theme}}.min.css',
	"Highlight theme": "atom-one-light",
	'HTML header': [],
	'HTML footer': [],
	"LaTeX preamble": [],
	'MathJax': {
		'configuration': String.raw`MathJax = {
			tex: {
			    inlineMath: [['$', '$'], ['\\(', '\\)']],
			    displayMath: [['$$', '$$'], ['\\[', '\\]']],
				tags: 'ams'
			}
		}`,
		'src': 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js' 
	},
	'Template': 'default',
	'TiKZ libgs': '/opt/homebrew/Cellar/ghostscript/10.05.0_1/lib/libgs.10.05.dylib',
	'TiKZ optimise': 'group-attributes,collapse-groups'
};

class ConfigManager {
	constructor() {
		this.config = { ...DEFAULT_CONFIG };
		this.loaded = false;
	}

	// Load configuration from files
	load() {
		if (this.loaded) return this.config;

		// Define config file locations in order of precedence (highest last)
		const configLocations = [
			// User config in home directory
			path.join(os.homedir(), '.jmarkdown', 'config.json'),
			// Project config (current directory)
			path.join(process.cwd(), '.jmarkdown', 'config.json')
		];

		// Load from each location if it exists
		for (const location of configLocations) {
			console.log(`Merging information from ${location}`);
			if (fs.existsSync(location)) {
				try {
					const fileConfig = JSON.parse(fs.readFileSync(location, 'utf8'));
					this.config = this._mergeConfigs(this.config, fileConfig, location);
				} catch (error) {
					console.warn(`Error loading config from ${location}: ${error.message}`);
				}
			}
		}

		this.loaded = true;

		return this.config;
	}

	// Get full configuration
	getConfig() {
		return this.config;
	}

	// Get configuration value
	get(key, defaultValue = null) {
		if (!this.loaded) this.load();

		if (key.includes('.')) {
			// Handle nested properties
			const parts = key.split('.');
			let value = this.config;
			for (const part of parts) {
				if (value === undefined || value === null) return defaultValue;
				value = value[part];
			}
			return value !== undefined ? value : defaultValue;
		}

		return this.config[key] !== undefined ? this.config[key] : defaultValue;
	}

	_replaceSpacesInKeys(obj) {
		// Base case: if not an object or is null, return as is
		if (typeof obj !== 'object' || obj === null) {
			return obj;
		}

		// If it's an array, process each element
		if (Array.isArray(obj)) {
			return obj.map(item => this._replaceSpacesInKeys(item));
		}

		// Create a new object with transformed keys
		const newObj = {};

		Object.keys(obj).forEach(key => {
			// Replace spaces with underscores in the key
			const newKey = key.replace(/\s+/g, '_');

			// Recursively process the value
			newObj[newKey] = this._replaceSpacesInKeys(obj[key]);
		});

		return newObj;
	}

	getConfigForMustache() {
		return this._replaceSpacesInKeys(this.config);
	}

	// Set configuration value
	set(key, value) {
		if (!this.loaded) this.load();

		if (key.includes('.')) {
			// Handle nested properties
			const parts = key.split('.');
			let target = this.config;
			for (let i = 0; i < parts.length - 1; i++) {
				const part = parts[i];
				if (!(part in target)) target[part] = {};
				target = target[part];
			}
			target[parts[parts.length - 1]] = value;
		} else {
			this.config[key] = value;
		}
	}

	// Merge metadata with configuration (metadata takes precedence)
	mergeMetadata(metadata) {
		if (!this.loaded) this.load();

		// Convert metadata to proper format
		const formattedMetadata = {};
		for (const [key, value] of Object.entries(metadata)) {
			const formattedKey = key.replace(/\s+/g, '_');

			// Clean up a few special cases from the metadata header
			let str = '';
			switch (formattedKey) {
			case 'Biblify_activate':
				str = value[0].trim().toLowerCase();
				if (str == "true") {
					formattedMetadata[formattedKey] = true;
				}
				else {
					formattedMetadata[formattedKey] = false;
				}
				break;
			case "Biblify_defer":
				str = value[0].trim().toLowerCase();
				if (str == "true") {
					this.config["Biblify"]["defer"] = true;
					this.config["Biblify"]["add helper function"] = false;
				}
				else {
					this.config["Biblify"]["defer"] = false;
				}
				break;
			case "Bibliography":
				str = value[0].trim();
				this.config["Biblify"]["bibliography"] = str;
				break;
			case "Bibliography_style":
				str = value[0].trim();
				if ( ["apa", "harvard1", "vancouver", "bjps", "chicago"].includes(str) ) {
					this.config["Biblify"]["bibliography style"] = str;
				}
				else {
					const template_name = path.basename(str, ".csl");
					this.config["Biblify"]["bibliography style"] = template_name;
					this.config["Biblify"]["template"]["name"] = template_name;
					this.config["Biblify"]["template"]["file"] = str;
				}
				break;
			case "Body_classes":
				str = value.join(" ").trim();
				formattedMetadata[formattedKey] = str;
				break;
			default:
				formattedMetadata[formattedKey] = value;
			}
		}

		this.config = this._mergeConfigs(this.config, formattedMetadata);
	}


	// Helper method to get app config path
	_getAppConfigPath() {
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = path.dirname(__filename);
		return path.join(__dirname, 'default-config.json');
	}

	// Helper method to merge configs
	_mergeConfigs(target, source, location = '') {
	    const result = { ...target };
	    
	    for (const [key, value] of Object.entries(source)) {
	        // Special case: if the source value is an array, replace target value completely
	        if (Array.isArray(value)) {
	            result[key] = [...value]; // Create a new array (shallow copy)
	        }
	        // If property exists and both are objects (but not arrays), merge recursively
	        else if (
	            key in result && 
	            typeof result[key] === 'object' && typeof value === 'object' &&
	            !Array.isArray(result[key]) && value !== null
	        ) {
	            result[key] = this._mergeConfigs(result[key], value);
	        } 
	        // Otherwise, simply overwrite with the source value
	        else {
	            result[key] = value;
	        }
	    }
	    
	    //console.log(`after merging: with ${location}`, result);
	    return result;
	}

/*
	// Helper method to merge configs
	_mergeConfigs(target, source, location = '') {
		const result = { ...target };

		for (const [key, value] of Object.entries(source)) {
			// If property exists and both are objects, merge recursively
			if (key in result && typeof result[key] === 'object' && typeof value === 'object' && value !== null) {
				result[key] = this._mergeConfigs(result[key], value);
			} else {
				result[key] = value;
			}
		}

		//console.log(`after merging: with ${location}`, result);
		return result;
	}
*/
}

export const configManager = new ConfigManager();