#!/usr/bin/env bash
# QA suite runner: run named scripts in parallel, capture logs+exit codes
set -u
cd /c/Users/GuSheng/Downloads/HKS
OUT=tools/reports/_runner
mkdir -p "$OUT"
declare -a PIDS=() NAMES=()
run() {
  local name="$1"; shift
  ( timeout 240 "$@" > "$OUT/$name.log" 2>&1; echo "$?" > "$OUT/$name.exit" ) &
  PIDS+=($!); NAMES+=("$name")
}
