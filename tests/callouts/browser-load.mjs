// callout-table.js must load where there is no Node: Clew bundles it for the
// browser. This evaluates its whole import graph in a bare VM context — no
// `process`, `require`, `Buffer` or filesystem — refusing any import that is
// not a local module, then checks the table works there.
//
// usage: node --experimental-vm-modules browser-load.mjs <repo>/src
import vm from 'vm';
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
const context = vm.createContext({});
const modules = new Map();

function load(file) {
	if (!modules.has(file)) {
		modules.set(file, new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }));
	}
	return modules.get(file);
}

const root = load(path.join(dir, 'callout-table.js'));
await root.link((specifier, referrer) => {
	if (!specifier.startsWith('./')) throw new Error(`${path.basename(referrer.identifier)} imports ${specifier}`);
	return load(path.resolve(path.dirname(referrer.identifier), specifier));
});
await root.evaluate();

const t = root.namespace;
const checks = {
	'resolveType(caution) = warning': t.resolveType('caution') === 'warning',
	'calloutIcon(note) is inline SVG': t.calloutIcon('note').startsWith('<svg class="callout-icon"'),
	'CALLOUT_TYPES lists 15 types': Object.keys(t.CALLOUT_TYPES).length === 15,
	'graph is callout-table + callout-definitions only': [...modules.keys()].map((f) => path.basename(f)).sort().join(',') === 'callout-definitions.js,callout-table.js',
};
const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
	console.error(failed.join('\n'));
	process.exit(1);
}
