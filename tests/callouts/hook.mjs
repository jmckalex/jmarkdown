// The host hook: a caller (Clew) hands the engine a RESOLVED table with
// applyCustomCallouts() and builds. One build per process: processFile
// registers its extensions as it runs.
//
// usage: node hook.mjs <repo> <file.md> <out.html>
const [repo, file, output] = process.argv.slice(2);
// Imported from the TABLE module, as Clew imports it: the table installed
// there must be the one the extension (loaded by index.js) renders with.
const { applyCustomCallouts } = await import(`${repo}/src/callout-table.js`);
const { processFile } = await import(`${repo}/src/index.js`);
applyCustomCallouts({
	hosted: { label: 'From the host', color: 'teal', icon: [448, 512, 'M0 0L448 0L448 512L0 512Z'], aliases: ['viahost'] },
});
await processFile(file, { fragment: true, output });
