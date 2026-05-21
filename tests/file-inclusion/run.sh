#!/bin/sh
# Manual verification harness for the file-inclusion extension.
# Run from any directory; cwd is intentionally varied to exercise basePath.
#
# Each scenario prints its name, runs jmarkdown in --fragment mode, and dumps
# the resulting HTML so behaviour can be eyeballed.

set -u
HERE=$(cd "$(dirname "$0")" && pwd)
JMD=$(cd "$HERE/../.." && pwd)/src/index.js

run() {
	name=$1
	src=$2
	echo "=========================================="
	echo "=== $name"
	echo "=== cwd=$(pwd)  src=$src"
	echo "=========================================="
	node "$JMD" process "$src" --fragment 2>&1
	out=${src%.md}.html
	if [ -f "$out" ]; then
		echo "--- HTML output: ---"
		cat "$out"
		rm "$out"
		echo
	fi
	echo
}

cd /tmp
run "basepath (cwd!=source dir)"          "$HERE/basepath/root.md"
run "nested (subdir resolution)"          "$HERE/nested/root.md"
run "cycle A->B->A"                       "$HERE/cycle/a.md"
run "cycle-symlink (self via symlink)"    "$HERE/cycle-symlink/root.md"
run "double (same file, two sites)"       "$HERE/double/root.md"
run "code-fence (token in fence/inline)"  "$HERE/code-fence/root.md"
run "inline (mid-paragraph stays literal)" "$HERE/inline/root.md"
run "missing (telltale + stderr)"         "$HERE/missing/root.md"
