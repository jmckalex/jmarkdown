import { readFileSync } from 'fs';
import { dirname, join, resolve, isAbsolute } from 'path';

/**
 * Process file inclusions recursively, maintaining correct path resolution
 * @param {string} markdown - The markdown content to process
 * @param {string} basePath - The base path for resolving relative file paths
 * @param {Set} includedFiles - Set to track files already included (prevents circular references)
 * @param {number} depth - Current recursion depth to prevent excessive nesting
 * @returns {string} Processed markdown with file inclusions
 */
function processFileInclusions(markdown, basePath = process.cwd(), includedFiles = new Set(), depth = 0) {
	// Set a reasonable recursion limit to prevent infinite loops
	const MAX_RECURSION_DEPTH = 20;
	if (depth > MAX_RECURSION_DEPTH) {
		console.warn(`Maximum inclusion depth (${MAX_RECURSION_DEPTH}) exceeded. Some inclusions may be skipped.`);
		return markdown;
	}

	// This should only capture the names of markdown files, to avoid false positives.
	const regex = /\[\[(.*?)\.md\]\]/g;
	let lastIndex = 0;
	let result = '';
	let match;

	// Use exec with regex to process matches sequentially
	while ((match = regex.exec(markdown)) !== null) {
	    // Add the text between the previous match and this match
		result += markdown.substring(lastIndex, match.index);
		lastIndex = regex.lastIndex;
		
		const relativePath = match[1].trim();
		
	    // Determine the full path of the file to include
		const filePath = isAbsolute(relativePath) 
		? relativePath 
		: resolve(basePath, relativePath);
		
	    // Prevent circular inclusions
		if (includedFiles.has(filePath)) {
			console.warn(`Circular file inclusion detected: ${filePath}. Skipping.`);
			continue;
		}
		
		try {
			// Add this file to the set of included files
			includedFiles.add(filePath);
			
			// Read the file content
			let fileContent = readFileSync(filePath, 'utf8');
			
			// Process inclusions in the included file, using its directory as base path
			const fileDir = dirname(filePath);
			fileContent = processFileInclusions(fileContent, fileDir, includedFiles, depth + 1);
			
			// Add the processed file content to the result
			result += fileContent;
		} catch (err) {
			console.error(`Error reading file ${filePath}:`, err);
			// Keep the original inclusion tag to indicate an error occurred
			result += match[0];
		}
	}

	// Add the remaining text after the last match
	result += markdown.substring(lastIndex);
	return result;
}

export default processFileInclusions;