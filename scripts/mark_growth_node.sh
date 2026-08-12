#!/usr/bin/env bash
# mark_growth_node.sh — flip a growth-tree node's status in
# growth/<slug>/growth_tree.json (see docs/growth_tree_schema.md in the
# 23AppdeveloperReleaser repo for the full schema this operates on).
#
# Usage:
#   scripts/mark_growth_node.sh <slug> <node_id> <done|todo>
#
# Example:
#   scripts/mark_growth_node.sh geunhoo positioning_bio_rewrite done
#
# - Only touches the single node's "status" field — does not rewrite
#   why/action/successEffect/failureCost (those stay as quoted from the
#   source report, per docs/growth_tree_schema.md §4).
# - Does NOT commit or push — that's a separate step, same pattern as
#   add_photo.sh.
#
# Requires: python3.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <slug> <node_id> <done|todo>" >&2
  exit 1
fi

SLUG="$1"
NODE_ID="$2"
STATUS="$3"

TREE_JSON="$REPO_ROOT/growth/$SLUG/growth_tree.json"

if [[ ! -f "$TREE_JSON" ]]; then
  echo "Error: no growth tree found at growth/$SLUG/growth_tree.json" >&2
  exit 1
fi

python3 "$SCRIPT_DIR/_mark_growth_node.py" "$TREE_JSON" "$NODE_ID" "$STATUS"
