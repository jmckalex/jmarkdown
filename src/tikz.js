/*
	This is a directive designed for typesetting side-by-side displays
	of markdown (or HTML) code on the left, and the compiled / formatted
	version on the right. 
*/
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
//import { config } from './utils.js';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { configManager } from './config-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LaTeX_container = `\\documentclass[tikz,border=3mm,12pt]{standalone}
\\usepackage{tikz}
\\usetikzlibrary{arrows,arrows.meta,positioning,shapes,backgrounds,calc,fit,decorations,decorations.pathreplacing,decorations.markings,patterns,matrix,calligraphy,trees,graphs,intersections,through,shapes.geometric,datavisualization}
\\usepackage{fontspec}
\\setmainfont{Optima}
\\begin{document}
\\begin{tikzpicture}[>=latex]
%TikZ code will be inserted here
\\end{tikzpicture}
\\end{document}`

const LIBGS = "--libgs=" + configManager.get('TiKZ libgs'); ///opt/homebrew/Cellar/ghostscript/10.05.0_1/lib/libgs.10.05.dylib";
const OPTIMISE = "--optimize=" + configManager.get('TiKZ optimise'); //group-attributes,collapse-groups";

let file_index = 1;

function ensureDirectoryExists(dirPath) {
	// Check if the directory exists
	if (!fs.existsSync(dirPath)) {
    // If it doesn't exist, create it
		fs.mkdirSync(dirPath, { recursive: true });
		console.log(`Created directory: ${dirPath}`);
	} else {
		console.log(`Directory already exists: ${dirPath}`);
	}
}

function processWithCaching(text, file_name) {
	// Generate a hash of the TikZ code
	const hash = crypto.createHash('md5').update(text).digest('hex');

	// Construct the hash file path
	const hashFilePath = file_name.replace('.tex', '.hash');

	// Check if the file already exists
	let shouldProcess = true;
	if (fs.existsSync(file_name) && fs.existsSync(hashFilePath)) {
		try {
		    // Read the stored hash
			const storedHash = fs.readFileSync(hashFilePath, 'utf8');

		    // Compare the hashes
			if (storedHash === hash) {
	        // Hashes match, no need to reprocess
				shouldProcess = false;
				console.log(`TikZ code unchanged for ${path.basename(file_name)}, using cached version`);
			}
		} catch (error) {
			console.error(`Error reading hash file: ${error.message}`);
		    // If there's an error reading the hash, process the file anyway
			shouldProcess = true;
		}
	}

	if (shouldProcess) {
		// Write the TeX file
		fs.writeFileSync(file_name, text);

		// Save the hash
		fs.writeFileSync(hashFilePath, hash);

	    return true; // Signal that processing is needed
	}

  return false; // Signal that no processing is needed
}


function createTiKZ(marker) {
	return {
		level: 'container',
		marker: marker,
		label: "TiKZ",
		tokenizer: function(text, token) {
			text = text.replace("\n", '');
			const file_contents = LaTeX_container.replace('%TikZ code will be inserted here', text);
			const home_directory = configManager.get('Markdown file directory');
			const TiKZ_directory = path.join(home_directory, "TiKZ");
			const file_name = path.join(TiKZ_directory, `figure-${file_index++}.tex`);
			const dvi_name = file_name.replace('.tex', '.dvi');
			const log_name = file_name.replace('.tex', '.log');
			const svg_name = file_name.replace('.tex', '.svg');
			const hash_name = file_name.replace('.tex', '.hash');
			
			ensureDirectoryExists(TiKZ_directory);
			
			// Check if processing is needed
			const needsProcessing = processWithCaching(file_contents, file_name);

			token['file name'] = file_name;
			token['has_error'] = false;
			token['error_log'] = '';

			if (needsProcessing) {
				try {
					const opts = { cwd: TiKZ_directory }; 
					execSync(`lualatex --output-format=dvi ${file_name}`, opts);
					execSync(`dvisvgm --bbox=min ${LIBGS} --no-fonts=1 ${OPTIMISE} ${dvi_name}`, opts);
				}
				catch (error) {
					token['has_error'] = true;
					// Try to read the log file
					try {
						const log_name = file_name.replace('.tex', '.log');
						if (fs.existsSync(log_name)) {
							token['error_log'] = fs.readFileSync(log_name, 'utf8');
						} else {
							token['error_log'] = error.message || 'Unknown error';
						}
					} catch (logError) {
						token['error_log'] = error.message || 'Unknown error, unable to read log file';
					}

					// Delete the generated files
					const filesToDelete = [file_name, dvi_name, hash_name, svg_name];

					filesToDelete.forEach(file => {
						try {
							if (fs.existsSync(file)) {
								fs.unlinkSync(file);
								console.log(`Deleted: ${file}`);
							}
						} catch (deleteError) {
							console.error(`Error deleting ${file}: ${deleteError.message}`);
						}
					});

					console.error(`Error processing TikZ: ${error.message}`);
				}
			}

			return token;
		},
		renderer(token) {
			if (token.meta.name === "TiKZ") {
				if (token['has_error']) {
					// Create a button that opens the error log
					const errorLogBase64 = Buffer.from(token['error_log']).toString('base64');
					const errorLogId = `tikz-error-${Math.random().toString(36).substring(2, 9)}`;

					return `<div class="tikz-error">
				        <p class="tikz-error-message">Error processing TikZ diagram</p>
				        <button onclick="showTikzError('${errorLogId}')">Show Error Log</button>
				        <script>
				            if (!window.tikzErrorHandlerAdded) {
				            window.tikzErrorHandlerAdded = true;
				            window.showTikzError = function(id) {
				                const logData = document.getElementById(id).dataset.log;
				                const logContent = atob(logData);
				                const errorWindow = window.open('', 'TikZ Error Log', 'width=800,height=600');
				                errorWindow.document.write('<html><head><title>TikZ Error Log</title>');
				                errorWindow.document.write('<style>body { font-family: monospace; white-space: pre; }</style>');
				                errorWindow.document.write('</head><body>');
				                errorWindow.document.write(logContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
				                errorWindow.document.write('</body></html>');
				                errorWindow.document.close();
				              };
				            }
				          </script>
				          <div id="${errorLogId}" data-log="${errorLogBase64}" style="display:none;"></div>
				        </div>`;
				}
				else {
					const home_directory = configManager.get('Markdown file directory');
					const TiKZ_directory = path.join(home_directory, "TiKZ");
					const svg_file_name = path.basename(token['file name']).replace('.tex', '.svg');
					const svg_full_path = path.join(TiKZ_directory, svg_file_name);

					// Check if scale was provided in the directive attributes
					let scaleStyle = '';
					if (token.attrs?.scale) {
						scaleStyle = ` style="transform: scale(${token.attrs.scale}); transform-origin: left top;"`;
					} else if (token.attrs?.width) {
						scaleStyle = ` style="width: ${token.attrs.width};"`;
					}

					// Check if the embed attribute was specified
					if (token.attrs?.embed) {
						try {
							// Read the SVG file
							const svgContent = fs.readFileSync(svg_full_path, 'base64');

							// Create a data URL
							return `<img src="data:image/svg+xml;base64,${svgContent}"${scaleStyle}>`;
						} catch (error) {
							console.error(`Error embedding SVG: ${error.message}`);
							// Fall back to normal image reference
							return `<img src='TiKZ/${svg_file_name}'${scaleStyle}>`;
						}
					} else {
						return `<img src='TiKZ/${svg_file_name}'${scaleStyle}>`;
					}
				}
			}
			return false;
		}
	}
}


export default createTiKZ;