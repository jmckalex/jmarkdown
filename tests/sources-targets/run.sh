#!/bin/sh
# Sources and targets in LaTeX (src/sources-and-targets.js): each parse's
# targets are linked to that parse's own sources, so nothing carries from one
# build to the next. Unit tests on token trees; no engine run (one build per
# process is the engine's design, so no test builds twice).
cd "$(dirname "$0")/../.." || exit 1
node tests/sources-targets/test.mjs
