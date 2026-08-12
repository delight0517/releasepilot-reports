#!/usr/bin/env python3
"""Helper invoked by mark_growth_node.sh — flips a single node's status field
in growth/<slug>/growth_tree.json. Not meant to be run directly; see
mark_growth_node.sh for the user-facing CLI.
"""
import json
import sys


def main():
    if len(sys.argv) != 4:
        print("internal error: expected tree_json, node_id, status", file=sys.stderr)
        sys.exit(2)

    tree_path, node_id, status = sys.argv[1], sys.argv[2], sys.argv[3]

    if status not in ("done", "todo"):
        print(f"Error: status must be 'done' or 'todo', got '{status}'", file=sys.stderr)
        sys.exit(1)

    with open(tree_path, "r", encoding="utf-8") as f:
        tree = json.load(f)

    nodes = tree.get("nodes", [])
    match = next((n for n in nodes if n.get("id") == node_id), None)
    if match is None:
        known = ", ".join(n.get("id", "?") for n in nodes)
        print(f"Error: node id '{node_id}' not found. Known ids: {known}", file=sys.stderr)
        sys.exit(1)

    old_status = match.get("status")
    match["status"] = status

    # weight-sum sanity check — never silently write a tree that no longer
    # sums to 100 (that's the schema's one hard invariant, docs/growth_tree_schema.md §3).
    total_weight = sum(n.get("weight", 0) for n in nodes)
    if total_weight != 100:
        print(
            f"Warning: node weights sum to {total_weight}, not 100 — "
            f"this was already broken before this edit, not caused by it. "
            f"Fix growth_tree.json's weight values.",
            file=sys.stderr,
        )

    with open(tree_path, "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"{node_id}: {old_status} -> {status}")
    print(f"Updated {tree_path}")
    print("Note: not committed/pushed — run git add/commit/push yourself when ready.")


if __name__ == "__main__":
    main()
