#!/usr/bin/env python3
"""growth_tree_audit.py — scan every growth/<slug>/growth_tree.json in this
repo and produce a compact candidate-issue report for 예나 (content-quality
persona) to review, instead of her re-reading every tree from scratch.

See docs/growth_tree_audit_runbook.md (23AppdeveloperReleaser repo,
docs/growth_tree_audit_runbook.md) for what to do with each finding category,
and docs/growth_tree_schema.md for the field definitions this checks against.

Detects (pure stdlib, no external libraries, no network calls):
  1. Duplicate / near-duplicate sections — whySimple/action/successEffect/
     failureCost/journeyContext text that is very similar across two nodes
     (within the same tree or across different trees).
  2. Over-split candidates — two nodes bound to each other by a mutual-only
     `requires` edge (A requires only B, B requires only A) where both have
     small weight — "should this just be one node?"
  3. Glossary/terminology gaps — a term defined in one node's `glossary` but
     the same term-looking phrase appears (unexplained) in another node's
     text without being in *its* glossary.
  4. Schema gaps — nodes missing near-required fields (sourceSection,
     whySimple, journeyContext) i.e. empty string / missing key.
  5. Cross-tree structural echoes — same as #1 but explicitly flagged as
     cross-tree (folded into #1's tree-pair labeling; kept as a distinct
     summary count since today there's only one tree and this needs to stay
     meaningful once more trees exist).

Usage:
  scripts/growth_tree_audit.py [--out <file>] [--sim-threshold 0.72]

Exit code is always 0 (this is a report generator, not a CI gate) unless a
tree fails to parse as JSON, in which case it prints the parse error to
stderr and exits 1 for that discovery pass (other trees still get scanned).
"""
import argparse
import difflib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GROWTH_DIR = REPO_ROOT / "growth"

# Fields checked for duplicate / near-duplicate text between nodes.
TEXT_FIELDS = ["whySimple", "action", "successEffect", "failureCost", "journeyContext"]

# Fields treated as "near-required" per docs/growth_tree_schema.md §3.
REQUIRED_TEXT_FIELDS = ["sourceSection", "whySimple", "journeyContext"]

DEFAULT_SIM_THRESHOLD = 0.72
MIN_TEXT_LEN_FOR_SIM = 12  # skip trivially short strings, they inflate similarity noise
OVER_SPLIT_WEIGHT_CAP = 15  # "small weight" cutoff for over-split candidates
SNIPPET_LEN = 80


def load_trees():
    """Returns list of (slug, tree_dict) for every growth/<slug>/growth_tree.json.
    Parse errors are printed to stderr and that tree is skipped (others continue)."""
    trees = []
    if not GROWTH_DIR.is_dir():
        return trees
    for slug_dir in sorted(GROWTH_DIR.iterdir()):
        tree_path = slug_dir / "growth_tree.json"
        if not tree_path.is_file():
            continue
        try:
            with open(tree_path, "r", encoding="utf-8") as f:
                tree = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error: failed to parse {tree_path}: {e}", file=sys.stderr)
            continue
        trees.append((slug_dir.name, tree))
    return trees


def text_similarity(a, b):
    """Pure-stdlib similarity: average of difflib.SequenceMatcher ratio and
    token-set Jaccard, so both near-identical phrasing and reordered/
    paraphrased-but-same-token-bag text get caught."""
    if not a or not b:
        return 0.0
    seq_ratio = difflib.SequenceMatcher(None, a, b).ratio()
    tokens_a = set(a.replace(",", " ").replace(".", " ").split())
    tokens_b = set(b.replace(",", " ").replace(".", " ").split())
    if not tokens_a or not tokens_b:
        jaccard = 0.0
    else:
        jaccard = len(tokens_a & tokens_b) / len(tokens_a | tokens_b)
    return (seq_ratio + jaccard) / 2


def snippet(text, n=SNIPPET_LEN):
    text = (text or "").strip().replace("\n", " ")
    if len(text) <= n:
        return text
    return text[:n] + "…"


def all_nodes(trees):
    """Flat list of (slug, tree, node) across all trees, for cross-tree scans."""
    out = []
    for slug, tree in trees:
        for node in tree.get("nodes", []):
            out.append((slug, tree, node))
    return out


def find_duplicates(trees, threshold):
    """Rule 1 + 5: near-duplicate text between any two nodes, same tree or
    different trees, across the 5 narrative text fields."""
    findings = []
    nodes = all_nodes(trees)
    n = len(nodes)
    for i in range(n):
        slug_a, _, node_a = nodes[i]
        for j in range(i + 1, n):
            slug_b, _, node_b = nodes[j]
            if slug_a == slug_b and node_a.get("id") == node_b.get("id"):
                continue
            for field in TEXT_FIELDS:
                text_a = node_a.get(field, "") or ""
                text_b = node_b.get(field, "") or ""
                if len(text_a) < MIN_TEXT_LEN_FOR_SIM or len(text_b) < MIN_TEXT_LEN_FOR_SIM:
                    continue
                sim = text_similarity(text_a, text_b)
                if sim >= threshold:
                    findings.append({
                        "cross_tree": slug_a != slug_b,
                        "slug_a": slug_a, "id_a": node_a.get("id"),
                        "slug_b": slug_b, "id_b": node_b.get("id"),
                        "field": field,
                        "similarity": round(sim, 2),
                        "snippet_a": snippet(text_a),
                        "snippet_b": snippet(text_b),
                    })
    findings.sort(key=lambda f: -f["similarity"])
    return findings


def find_over_split_candidates(trees):
    """Rule 2: node pairs bound by a mutual-only requires edge, both small
    weight — candidates for merging into a single node."""
    findings = []
    for slug, tree in trees:
        nodes = {n.get("id"): n for n in tree.get("nodes", [])}
        seen_pairs = set()
        for node_id, node in nodes.items():
            requires = node.get("requires", []) or []
            if len(requires) != 1:
                continue
            other_id = requires[0]
            other = nodes.get(other_id)
            if other is None:
                continue
            other_requires = other.get("requires", []) or []
            if other_requires != [node_id]:
                continue  # not a mutual-only pair
            weight_a = node.get("weight", 0)
            weight_b = other.get("weight", 0)
            if weight_a > OVER_SPLIT_WEIGHT_CAP or weight_b > OVER_SPLIT_WEIGHT_CAP:
                continue
            pair_key = tuple(sorted([node_id, other_id]))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            findings.append({
                "slug": slug,
                "id_a": pair_key[0], "id_b": pair_key[1],
                "weight_a": nodes[pair_key[0]].get("weight", 0),
                "weight_b": nodes[pair_key[1]].get("weight", 0),
                "title_a": nodes[pair_key[0]].get("title", ""),
                "title_b": nodes[pair_key[1]].get("title", ""),
            })
    return findings


def find_glossary_gaps(trees):
    """Rule 3: a term defined in some node's glossary in this tree, but the
    same term also appears in another node's text fields without that node
    (or its own glossary) explaining it."""
    findings = []
    for slug, tree in trees:
        nodes = tree.get("nodes", [])
        all_terms = {}  # term -> set of node ids where it's defined
        for node in nodes:
            for term in (node.get("glossary") or {}).keys():
                all_terms.setdefault(term, set()).add(node.get("id"))
        if not all_terms:
            continue
        for node in nodes:
            node_glossary_terms = set((node.get("glossary") or {}).keys())
            combined_text = " ".join(node.get(f, "") or "" for f in TEXT_FIELDS)
            for term, defined_in in all_terms.items():
                if node.get("id") in defined_in:
                    continue  # this node defines it itself, fine
                if term in node_glossary_terms:
                    continue
                if term and term in combined_text:
                    findings.append({
                        "slug": slug,
                        "term": term,
                        "used_in_node": node.get("id"),
                        "defined_in_nodes": sorted(defined_in),
                    })
    return findings


def find_schema_gaps(trees):
    """Rule 4: nodes missing near-required fields (empty string or absent)."""
    findings = []
    for slug, tree in trees:
        for node in tree.get("nodes", []):
            missing = [f for f in REQUIRED_TEXT_FIELDS if not (node.get(f) or "").strip()]
            if missing:
                findings.append({
                    "slug": slug,
                    "id": node.get("id"),
                    "missing_fields": missing,
                })
    return findings


def format_report(trees, dup_findings, split_findings, glossary_findings, schema_findings, threshold):
    lines = []
    lines.append("# growth_tree_audit report")
    lines.append("")
    tree_summary = ", ".join(f"{slug} ({len(t.get('nodes', []))} nodes)" for slug, t in trees)
    lines.append(f"Trees scanned: {len(trees)} — {tree_summary or '(none found)'}")
    lines.append(f"Similarity threshold: {threshold}")
    lines.append("")

    any_findings = dup_findings or split_findings or glossary_findings or schema_findings

    if not any_findings:
        lines.append("이상 없음 — 4가지 규칙 모두 후보 없음.")
        return "\n".join(lines) + "\n"

    cross_tree_count = sum(1 for f in dup_findings if f["cross_tree"])
    same_tree_count = len(dup_findings) - cross_tree_count

    lines.append(f"## 1. 중복/근접 중복 후보 ({len(dup_findings)}건 — 같은 트리 {same_tree_count} / 트리 간 {cross_tree_count})")
    lines.append("")
    if not dup_findings:
        lines.append("없음")
    for f in dup_findings:
        scope = "트리 간" if f["cross_tree"] else "같은 트리"
        lines.append(
            f"- [{scope}] {f['slug_a']}/{f['id_a']} vs {f['slug_b']}/{f['id_b']} "
            f"— 필드 `{f['field']}` 유사도 {f['similarity']}"
        )
        lines.append(f"    A: \"{f['snippet_a']}\"")
        lines.append(f"    B: \"{f['snippet_b']}\"")
    lines.append("")

    lines.append(f"## 2. 과잉 분할 후보 ({len(split_findings)}건)")
    lines.append("")
    if not split_findings:
        lines.append("없음")
    for f in split_findings:
        lines.append(
            f"- {f['slug']}: {f['id_a']}(weight {f['weight_a']}, \"{f['title_a']}\") "
            f"<-> {f['id_b']}(weight {f['weight_b']}, \"{f['title_b']}\") — 서로만 requires로 묶임"
        )
    lines.append("")

    lines.append(f"## 3. 용어 불일치(설명 누락) 후보 ({len(glossary_findings)}건)")
    lines.append("")
    if not glossary_findings:
        lines.append("없음")
    for f in glossary_findings:
        defined_str = ", ".join(f["defined_in_nodes"])
        lines.append(
            f"- {f['slug']}: 용어 \"{f['term']}\" — 노드 `{f['used_in_node']}`에서 사용되지만 "
            f"glossary 없음 (정의된 곳: {defined_str})"
        )
    lines.append("")

    lines.append(f"## 4. 스키마 결손(필수급 필드 비어있음) 후보 ({len(schema_findings)}건)")
    lines.append("")
    if not schema_findings:
        lines.append("없음")
    for f in schema_findings:
        fields_str = ", ".join(f["missing_fields"])
        lines.append(f"- {f['slug']}/{f['id']} — 빈 필드: {fields_str}")
    lines.append("")

    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=str, default=None, help="write report to this file instead of stdout")
    parser.add_argument("--sim-threshold", type=float, default=DEFAULT_SIM_THRESHOLD,
                         help=f"similarity threshold for duplicate detection (default {DEFAULT_SIM_THRESHOLD})")
    args = parser.parse_args()

    trees = load_trees()

    dup_findings = find_duplicates(trees, args.sim_threshold)
    split_findings = find_over_split_candidates(trees)
    glossary_findings = find_glossary_gaps(trees)
    schema_findings = find_schema_gaps(trees)

    report = format_report(trees, dup_findings, split_findings, glossary_findings, schema_findings, args.sim_threshold)

    if args.out:
        out_path = Path(args.out)
        out_path.write_text(report, encoding="utf-8")
        print(f"Wrote report to {out_path}")
    else:
        print(report, end="")


if __name__ == "__main__":
    main()
