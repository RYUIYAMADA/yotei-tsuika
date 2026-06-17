#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "${SCRIPT_DIR}"

CLASP_CMD="clasp"
if ! command -v clasp >/dev/null 2>&1; then
  CLASP_CMD="npx -y @google/clasp"
fi

echo "[1/3] Using clasp runner: ${CLASP_CMD}"
echo "      Working dir: ${SCRIPT_DIR}"
echo "[2/3] Pushing GAS source..."
if eval "${CLASP_CMD} push"; then
  echo "[3/3] Done: GAS source pushed successfully."
  exit 0
fi

echo "ERROR: GAS push failed. You may not be logged in."
echo "Run: ${CLASP_CMD} login"
exit 1
