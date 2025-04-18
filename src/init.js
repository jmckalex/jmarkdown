/* 
	Code for initialising a new JMarkdown project.

	If called for the first time in a folder *without* a .jmarkdown/ directory:
 	
 	1. Create the .jmarkdown/ directory
 	2. Create a config-template.json file inside that directory
 	3. [Optional] If the filename is specified, create a new file according to
 		jmarkdown-template.md in the directory, with the specified filename.
*/
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG } from './config-manager.js';

const file_template = `Title: New jmarkdown file
Date: ${getCurrentDate()}
Author:
---

# Heading

`;

export function initialise(filename = null) {
	console.log('Initalising a new JMarkdown project');
	const local_jmarkdown_dir = path.resolve(process.cwd(), '.jmarkdown/');
	const local_jmarkdown_config = path.resolve(process.cwd(), '.jmarkdown/', 'config.json');
	
	try {
		// Check if .jmarkdown/ exists
		console.log(`Checking to see if ${local_jmarkdown_dir} exists...`);
		fs.accessSync(local_jmarkdown_dir);
		console.log(`${local_jmarkdown_dir} exists!`);
	}
	catch (error) {
		console.log(`${local_jmarkdown_dir} does not exist - creating directory...`);
		fs.mkdirSync('.jmarkdown');
		console.log(`${local_jmarkdown_dir} created.`);
	}

	try {
		// Check if .jmarkdown/config.json exists
		console.log(`Checking to see if ${local_jmarkdown_config} exists...`);
		fs.accessSync(local_jmarkdown_config);
		console.log(`${local_jmarkdown_config} exists!`);
	}
	catch (error) {
		console.log(`${local_jmarkdown_config} does not exist - creating config-template.json...`);
		fs.writeFileSync('.jmarkdown/config-template.json', JSON.stringify(DEFAULT_CONFIG, null, 4), { encoding: 'utf8' });
		console.log(`config-template.json created.`);
	}

	if (filename != null) {
		fs.writeFileSync(filename, file_template, { encoding: 'utf8' });
	}
}


function getCurrentDate() {
	const now = new Date();

	// Get day, month, and year
	const day = String(now.getDate()); // DD format with leading zero
	const monthNames = [
		'January', 'February', 'March', 'April', 'May', 'June', 
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	const month = monthNames[now.getMonth()]; // Full month name
	const year = now.getFullYear(); // YYYY format

	// Combine into desired format
	return `${day} ${month} ${year}`;
}
