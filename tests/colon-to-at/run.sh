#!/bin/sh
# The colon → @ converter (src/colon-to-at.js): cases, idempotence, import
# freedom, and agreement with begin-end-core's element list. No engine run.
cd "$(dirname "$0")/../.." || exit 1
node tests/colon-to-at/test.mjs
