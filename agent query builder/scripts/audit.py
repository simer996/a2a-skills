"""Offline query label and evidence checks; agent cards are read only for roster and examples."""

import argparse
import json
import re
from pathlib import Path


def norm(value):
    return re.sub(r"\s+", " ", value).strip().casefold()


def cards_list(data):
    if isinstance(data, dict):
        data = [data]
    return [item.get("card", item) for item in data]


def audit_queries(queries, cards, evidence):
    agents = {c["name"] for c in cards_list(cards)}
    manifest = {e["evidence_id"]: e for e in evidence}
    seed = {norm(x) for c in cards_list(cards) for s in c.get("skills", [])
            for x in s.get("examples", [])}
    findings, ids, utterances = [], set(), set()
    required = ["query_id", "target_agent", "query", "routing_polarity",
                "answerability", "expected_route", "expected_behavior",
                "expected_answer", "evidence_ids", "origin", "split", "derivation"]
    for q in queries:
        qid = q.get("query_id", "<missing>")
        def flag(issue):
            findings.append({"query_id": qid, "issue": issue})
        if any(k not in q for k in required):
            flag("missing_required_fields")
        if qid in ids:
            flag("duplicate_query_id")
        ids.add(qid)
        key = norm(q.get("query", ""))
        if not key:
            flag("empty_query")
        if key in utterances:
            flag("duplicate_utterance")
        utterances.add(key)
        if q.get("target_agent") not in agents:
            flag("unknown_target_agent")
        route = q.get("expected_route")
        if route not in agents | {"none", "clarify"}:
            flag("unavailable_expected_route")
        polarity = q.get("routing_polarity")
        if polarity not in {"positive", "negative"}:
            flag("invalid_routing_polarity")
        elif polarity == "positive" and route != q.get("target_agent"):
            flag("positive_route_mismatch")
        elif polarity == "negative" and route == q.get("target_agent"):
            flag("negative_route_mismatch")
        status = q.get("answerability")
        if status not in {"supported", "partial", "missing_evidence", "conflict",
                          "unsupported_action", "not_applicable"}:
            flag("invalid_answerability")
        behavior = q.get("expected_behavior")
        if behavior not in {"answer", "qualified_answer", "abstain", "clarify",
                            "refuse_action", "delegate"}:
            flag("invalid_expected_behavior")
        if status == "supported" and not q.get("evidence_ids"):
            flag("supported_without_evidence")
        refs = q.get("evidence_ids", [])
        if not isinstance(refs, list):
            flag("evidence_ids_not_array")
            refs = []
        for ref in refs:
            if ref not in manifest:
                flag("unknown_evidence:" + str(ref))
            elif not manifest[ref].get("locator") or not manifest[ref].get("text"):
                flag("incomplete_evidence:" + ref)
        if status in {"missing_evidence", "conflict"} and behavior not in {
                "abstain", "clarify", "qualified_answer"}:
            flag("unsupported_answer_for_missing_or_conflicting_evidence")
        if status == "unsupported_action" and behavior != "refuse_action":
            flag("unsupported_action_not_refused")
        if q.get("split") == "evaluation" and key in seed:
            flag("card_example_leakage")
    return {"query_count": len(queries), "findings": findings,
            "limitation": "Checks labels and evidence references, not semantic entailment or runtime behavior."}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", type=Path, help="queries.json")
    p.add_argument("--cards", type=Path, required=True)
    p.add_argument("--evidence", type=Path, required=True)
    p.add_argument("--output", type=Path)
    args = p.parse_args()
    read = lambda path: json.loads(path.read_text(encoding="utf-8-sig"))
    result = audit_queries(read(args.input), read(args.cards), read(args.evidence))
    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    if result["findings"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
