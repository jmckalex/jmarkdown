// A callout broken across pages must draw its accent strip and tint on EVERY
// page — not tcolorbox's default grey, as it did when each part's skin
// replaced the box's interior code. Renders the PDF with pdftoppm and counts,
// per page, pixels of the accent, the tint, and the default grey.
//
// usage: node callout-pages.mjs <doc.pdf> <accent hex> <tint hex>
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const [pdf, accentHex, tintHex] = process.argv.slice(2);
const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (p, q, tolerance) => Math.abs(p[0] - q[0]) <= tolerance && Math.abs(p[1] - q[1]) <= tolerance && Math.abs(p[2] - q[2]) <= tolerance;
const accent = rgb(accentHex), tint = rgb(tintHex), grey = rgb('F2F2F2');   // tcolorbox's default colback

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'callout-pages-'));
execFileSync('pdftoppm', ['-r', '72', pdf, path.join(dir, 'p')]);
const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.ppm')).sort();
let ok = pages.length > 1;   // the fixture must actually break
for (const file of pages) {
	const buf = fs.readFileSync(path.join(dir, file));
	// P6 header: "P6\n<w> <h>\n<max>\n", then RGB triples.
	const header = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
	const [, w, h] = header.map(Number);
	const data = buf.subarray(header[0].length);
	let a = 0, t = 0, g = 0;
	for (let i = 0; i < w * h * 3; i += 3) {
		const p = [data[i], data[i + 1], data[i + 2]];
		if (near(p, accent, 20)) a++;
		else if (near(p, tint, 3)) t++;
		else if (near(p, grey, 3)) g++;
	}
	const pageOk = a > 100 && t > 1000 && g < t / 100;
	ok &&= pageOk;
	console.log(`${file}: accent ${a}, tint ${t}, default grey ${g} — ${pageOk ? 'ok' : 'WRONG'}`);
}
fs.rmSync(dir, { recursive: true, force: true });
if (pages.length < 2) console.log('the document did not break across pages');
process.exit(ok ? 0 : 1);
