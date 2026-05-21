#!/bin/sh
# POSIX helpers for snapshot-style regression tests.
#
# Usage:
#   . tests/lib/diff.sh               # source it
#   counter_init                       # initialise pass/fail counters in a tempfile
#   assert_match LABEL ACTUAL EXPECTED [--update]
#   counter_report                     # prints "N passed, M failed, K missing" + sets EXIT_CODE
#
# Counter state lives in a tempfile because POSIX subshells in for-loops
# would otherwise lose mutations. The path is exported as TEST_COUNTER_FILE.

counter_init() {
	TEST_COUNTER_FILE=$(mktemp -t jmd-tests.XXXXXX)
	export TEST_COUNTER_FILE
	printf '0 0 0\n' >"$TEST_COUNTER_FILE"
}

_counter_bump() {
	# $1 = field index (1=pass, 2=fail, 3=missing)
	read -r p f m <"$TEST_COUNTER_FILE"
	case "$1" in
		1) p=$((p + 1)) ;;
		2) f=$((f + 1)) ;;
		3) m=$((m + 1)) ;;
	esac
	printf '%s %s %s\n' "$p" "$f" "$m" >"$TEST_COUNTER_FILE"
}

# assert_match LABEL ACTUAL_FILE EXPECTED_FILE [--update]
#
# Compares ACTUAL_FILE to EXPECTED_FILE. With --update, writes ACTUAL_FILE
# over EXPECTED_FILE (creating it if needed) and prints UPDATE.
assert_match() {
	label=$1
	actual=$2
	expected=$3
	mode=${4:-}

	if [ ! -f "$actual" ]; then
		printf 'FAIL  %s  (no output produced at %s)\n' "$label" "$actual"
		_counter_bump 2
		return 1
	fi

	if [ "$mode" = "--update" ]; then
		mkdir -p "$(dirname "$expected")"
		cp "$actual" "$expected"
		printf 'UPDATE %s\n' "$label"
		_counter_bump 1
		return 0
	fi

	if [ ! -f "$expected" ]; then
		printf 'MISSING %s  (no golden at %s — run with --update to create)\n' "$label" "$expected"
		_counter_bump 3
		return 1
	fi

	if cmp -s "$actual" "$expected"; then
		printf 'PASS  %s\n' "$label"
		_counter_bump 1
		return 0
	fi

	printf 'FAIL  %s\n' "$label"
	diff -u "$expected" "$actual" || true
	_counter_bump 2
	return 1
}

# counter_report PREFIX
# Prints a summary line. Sets global EXIT_CODE to 0 if all green, else 1.
counter_report() {
	prefix=${1:-}
	read -r p f m <"$TEST_COUNTER_FILE"
	if [ "$f" -eq 0 ] && [ "$m" -eq 0 ]; then
		EXIT_CODE=0
	else
		EXIT_CODE=1
	fi
	printf '%s%s passed, %s failed, %s missing\n' "$prefix" "$p" "$f" "$m"
}
