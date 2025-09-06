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
import Mustache from 'mustache';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LaTeX_template = String.raw`\documentclass[tikz,border=3mm,12pt]{standalone}
\usepackage{tikz}
\usetikzlibrary{arrows,arrows.meta,positioning,shapes,backgrounds,calc,fit,decorations,decorations.pathreplacing,decorations.markings,patterns,matrix,calligraphy,trees,graphs,intersections,through,shapes.geometric,datavisualization}
{{#LaTeX_preamble}}
{{{.}}}
{{/LaTeX_preamble}}
\begin{document}
{{{TiKZ}}}
\end{document}`


const LIBGS = "--libgs=" + configManager.get('TiKZ libgs'); ///opt/homebrew/Cellar/ghostscript/10.05.0_1/lib/libgs.10.05.dylib";
const OPTIMISE = "--optimize=" + configManager.get('TiKZ optimise'); //group-attributes,collapse-groups";

function ensureDirectoryExists(dirPath) {
	// Check if the directory exists
	if (!fs.existsSync(dirPath)) {
	    // If it doesn't exist, create it
		fs.mkdirSync(dirPath, { recursive: true });
		console.log(`Created directory: ${dirPath}`);
	} 
}

function generateHash(string) {
	return crypto.createHash('md5').update(string).digest('hex');
}

// Given an array of file names, delete them.
function deleteFiles(filesToDelete) {
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
}

function emptyCache(TiKZ_directory) {
	const files = fs.readdirSync(TiKZ_directory);

	for (const file of files) {
		const filePath = path.join(TiKZ_directory, file);
		if (fs.statSync(filePath).isFile()) {
			fs.unlinkSync(filePath);
			console.log(`Deleted: ${file}`);
		}
	}
}

function createTiKZ(marker) {
	return {
		level: 'container',
		marker: marker,
		label: "TiKZ",
		tokenizer: function(text, token) {
			if (text.includes('begin{tikzpicture}') == false) {
				text = "\\begin{tikzpicture}[>=latex]\n" + text + "\n\\end{tikzpicture}";
			}
			const opts = { 'TiKZ': text, 'LaTeX_preamble': configManager.get('LaTeX preamble') };
			const file_contents = Mustache.render(LaTeX_template, opts);

			const home_directory = configManager.get('Markdown file directory');
			const TiKZ_directory = path.join(home_directory, "TiKZ");
			const hash = generateHash(file_contents);
			const file_name = path.join(TiKZ_directory, `${hash}.tex`);
			const aux_name = file_name.replace('.tex', '.aux');
			const dvi_name = file_name.replace('.tex', '.dvi');
			const log_name = file_name.replace('.tex', '.log');
			const svg_name = file_name.replace('.tex', '.svg');
			//const hash_name = file_name.replace('.tex', '.hash');
			
			ensureDirectoryExists(TiKZ_directory);
			if (token?.attrs?.['empty-cache'] == 'true' || token?.attrs?.['empty-cache'] == 'empty-cache') {
				console.log("Removing all cached TiKZ files...");
				emptyCache(TiKZ_directory);
			}
			
			token['file name'] = file_name;
			token['has_error'] = false;
			token['error_log'] = '';

			if (fs.existsSync(svg_name) == false) {
				try {
					fs.writeFileSync(file_name, file_contents);
					const opts = { cwd: TiKZ_directory };
					let command = '';
					//console.log(`Trying to process the TiKZ file with options ${opts}`);
					command = `lualatex --output-format=dvi \"${file_name}\"`;
					console.log(`Executing: ${command}`);
					execSync(command, opts);
					command = `dvisvgm --bbox=min ${LIBGS} --no-fonts=1 ${OPTIMISE} \"${dvi_name}\"`;
					console.log(`Executing: ${command}`);
					execSync(command, opts);
					console.log("Cleaning up temporary files...")
					const filesToDelete = [file_name, aux_name, dvi_name, log_name];
					deleteFiles(filesToDelete);
				}
				catch (error) {
					token['has_error'] = true;
					// Try to read the log file
					try {
						if (fs.existsSync(log_name)) {
							token['error_log'] = fs.readFileSync(log_name, 'utf8');
						} else {
							token['error_log'] = error.message || 'Unknown error';
						}
					} catch (logError) {
						token['error_log'] = error.message || 'Unknown error, unable to read log file';
					}

					// Delete the generated files
					const filesToDelete = [file_name, dvi_name, svg_name];
					deleteFiles(filesToDelete);
					
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