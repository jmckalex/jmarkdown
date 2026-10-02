// Writes docs/tabbing-layout.js: the page script that lays out tabbing blocks
// (src/tabbing-page.js), for the docs site, whose pages are --fragment builds
// and so carry no template's copy of it. Rerun after changing
// src/tabbing-page.js or layoutTabbing in src/tabbing.js; tests/tabbing fails
// while the two differ.
//
//   node scripts/docs-tabbing-layout.mjs

import fs from 'node:fs';
import { docsTabbingLayout } from '../src/tabbing-page.js';

const out = new URL('../docs/tabbing-layout.js', import.meta.url);
fs.writeFileSync(out, docsTabbingLayout());
console.log(`wrote ${out.pathname}`);
