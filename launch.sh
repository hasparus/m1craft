#!/bin/bash
# ARM64 Minecraft launcher for Forge on Apple Silicon.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$SCRIPT_DIR/launch.py" "$@"
