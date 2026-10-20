// host-library.mjs <repo> <route> <dist> <in> <out> <html|latex> — one build under
// `Figure engine: wasm`, as a host with its own copy of mp-tikz-wasm makes it
// (the iPad's browser worker): setFigureLibrary, then processFile. Routes:
//   path          the dist, as --mp-tikz-dist gives it (the control)
//   host          load() of the same dist, its fingerprint and its bundles
//   host-default  load() under a fingerprint of the host's, default bundles
//   bad           a figureLibrary that is no library
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const [, , repo, route, dist, file, output, to] = process.argv;
const { processFile } = await import(path.join(repo, 'src/index.js'));
const { setFigureLibrary, distFingerprint } = await import(path.join(repo, 'src/figure-engine.js'));
const load = () => import(pathToFileURL(path.join(dist, 'index.js')).href);
if (route === 'host') {
	const lib = await load();
	const bundles = [...lib.DEFAULT_BUNDLES, 'opentype'];
	if (fs.existsSync(path.join(dist, 'ghostscript', 'gs.wasm'))) bundles.push('ghostscript');
	setFigureLibrary({ load, fingerprint: distFingerprint(dist), bundles });
} else if (route === 'host-default') {
	setFigureLibrary({ load, fingerprint: 'a host build' });
} else if (route === 'bad') {
	setFigureLibrary({ load: 'not a function', fingerprint: 'x' });
}
await processFile(file, { to, output, figureEngine: 'wasm', ...(route === 'path' ? { mpTikzDist: dist } : {}) });
