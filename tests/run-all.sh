#!/bin/sh
# Top-level test orchestrator. Runs every suite under tests/ and exits non-zero
# if any regression suite reports a failure.
#
# Usage:
#   sh tests/run-all.sh             # run everything
#   sh tests/run-all.sh --update    # passed through to suites that support it

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/.." && pwd)

mode=${1:-}

echo "##########################################"
echo "# jmarkdown test suite"
echo "##########################################"
echo

# 1. file-inclusion — existing eyeball-only harness; informative, never gates CI.
echo "------ file-inclusion (informational; not gating) ------"
sh "$REPO/tests/file-inclusion/run.sh" >/dev/null 2>&1 && echo "(ran, output suppressed; use sh tests/file-inclusion/run.sh to inspect)" || echo "(ran with non-zero exit; not gating)"
echo

# 2. docs-snapshots — golden-file regression. Gates CI.
echo "------ docs-snapshots ------"
sh "$REPO/tests/docs-snapshots/run.sh" $mode
snapshot_status=$?
echo

# 3. features — hand-crafted feature fixtures (HTML + LaTeX). Gates CI.
echo "------ features ------"
sh "$REPO/tests/features/run.sh" $mode
features_status=$?
echo

# 4. latex-document — full-document LaTeX assembly (toolchain-free). Gates CI.
echo "------ latex-document ------"
sh "$REPO/tests/latex-document/run.sh"
latex_document_status=$?
echo

# 5. citefile — \citefile's resolved-path cases, which can't be goldens because
#    the absolute path depends on where the repo is checked out. Gates CI.
echo "------ citefile ------"
sh "$REPO/tests/citefile/run.sh"
citefile_status=$?
echo

# 6. note-code — `Run note code`: every path by which a document runs code is
#    refused by name with the switch off, and runs with it on. A suite because
#    it watches the build's stdout for code that ran. Gates CI.
echo "------ note-code ------"
sh "$REPO/tests/note-code/run.sh"
note_code_status=$?
echo

# 7. callouts — custom callout types from a project config (`Callouts`) and the
#    applyCustomCallouts() host hook, hostile definitions included. A suite
#    because the definitions need a .jmarkdown/config.json. Gates CI.
echo "------ callouts ------"
sh "$REPO/tests/callouts/run.sh"
callouts_status=$?
echo

# 8. tabbing — src/tabbing.js's parser, its replay of LaTeX's layout over
#    widths, the LaTeX and HTML it writes, and that it stays import-free.
#    Unit tests, since layout needs widths only a browser measures. Gates CI.
echo "------ tabbing ------"
sh "$REPO/tests/tabbing/run.sh"
tabbing_status=$?
echo

# 9. bibliographies — a note's Bibliography ADDS to the configured one (a
#    project config, which the feature harness cannot give a fixture), the
#    merged .bib written beside LaTeX/runtime output, and a real bibtex run
#    when TeX is installed. Gates CI.
echo "------ bibliographies ------"
sh "$REPO/tests/bibliographies/run.sh"
bibliographies_status=$?
echo

# 10. latex-lint — the LaTeX-export lint's warnings, each firing and each near
#     miss quiet, silencing, and a clean document. A suite because its fixtures
#     are LaTeX that must not compile, and the package check reads the config
#     (HOME isolated). Gates CI.
echo "------ latex-lint ------"
sh "$REPO/tests/latex-lint/run.sh"
latex_lint_status=$?
echo

if [ "$snapshot_status" -ne 0 ] || [ "$features_status" -ne 0 ] || [ "$latex_document_status" -ne 0 ] || [ "$citefile_status" -ne 0 ] || [ "$note_code_status" -ne 0 ] || [ "$callouts_status" -ne 0 ] || [ "$tabbing_status" -ne 0 ] || [ "$bibliographies_status" -ne 0 ] || [ "$latex_lint_status" -ne 0 ]; then
	echo "FAILED: at least one regression suite reported failure."
	exit 1
fi

echo "OK: all gating suites passed."
exit 0
