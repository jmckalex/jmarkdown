// config-manager.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { marked } from './utils.js';

// Default configuration values
const DEFAULT_CONFIG = {
	'highlight-theme': 'default',
	'body-classes': '',
	'custom-directives': [],
	'automatic-footnote-labels': true,
	'syntax': {
		'use-modified-syntax': true,
		'enable-emojis': true,
		'enable-math': true
	}
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
	  // Application default (in app directory)
			this._getAppConfigPath(),
	  // User config in home directory
			path.join(os.homedir(), '.jmarkdown', 'config.json'),
	  // Project config (current directory)
			path.join(process.cwd(), '.jmarkdown.json')
		];
		
	// Load from each location if it exists
		for (const location of configLocations) {
			if (fs.existsSync(location)) {
				try {
					const fileConfig = JSON.parse(fs.readFileSync(location, 'utf8'));
					this.config = this._mergeConfigs(this.config, fileConfig);
				} catch (error) {
					console.warn(`Error loading config from ${location}: ${error.message}`);
				}
			}
		}
		
		this.loaded = true;
		return this.config;
	}
	
  // Get configuration value
	get(key, defaultValue) {
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
			const formattedKey = key.toLowerCase().replace(/\s+/g, '-');
			formattedMetadata[formattedKey] = value;
		}
		
		return this._mergeConfigs(this.config, formattedMetadata);
	}
	
  // Helper method to get app config path
	_getAppConfigPath() {
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = path.dirname(__filename);
		return path.join(__dirname, 'default-config.json');
	}
	
  // Helper method to merge configs
	_mergeConfigs(target, source) {
		const result = { ...target };
		
		for (const [key, value] of Object.entries(source)) {
	  // If property exists and both are objects, merge recursively
			if (key in result && typeof result[key] === 'object' && typeof value === 'object' && value !== null) {
				result[key] = this._mergeConfigs(result[key], value);
			} else {
				result[key] = value;
			}
		}
		
		return result;
	}
}

export const configManager = new ConfigManager();