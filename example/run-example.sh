#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit

__dirname="$(CDPATH= cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$__dirname/.."

git checkout -- example
ts-node ./src/bin.ts
