import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit import audit_queries


def card(name):
    return {"name": name, "description": "Reviews documented exceptions.",
            "version": "1.0.0", "url": "https://example.invalid/a2a",
            "capabilities": {}, "defaultInputModes": ["text/plain"],
            "defaultOutputModes": ["text/plain"],
            "skills": [{"id": "review", "name": "Review", "description": "Read evidence.",
                        "tags": ["invoice", " Invoice ", "exception"],
                        "examples": ["Review REV-204.", "Review REV-204."]}]}


class AuditTests(unittest.TestCase):
    def query(self):
        return {"query_id": "Q1", "target_agent": "alpha", "query": "What is missing in REV-204?",
                "routing_polarity": "positive", "answerability": "supported",
                "expected_route": "alpha", "expected_behavior": "answer",
                "expected_answer": "Acceptance note.", "evidence_ids": ["R1"],
                "origin": "generated", "split": "evaluation", "derivation": "Lookup."}

    def test_references_and_route_and_leakage(self):
        q = self.query()
        evidence = [{"evidence_id": "R1", "locator": "records:L1", "text": "Missing acceptance."}]
        self.assertEqual(audit_queries([q], [card("alpha")], evidence)["findings"], [])
        q.update(query="Review REV-204.", expected_route="unavailable", evidence_ids=["absent"])
        issues = [x["issue"] for x in audit_queries([q], [card("alpha")], evidence)["findings"]]
        self.assertIn("unavailable_expected_route", issues)
        self.assertIn("card_example_leakage", issues)
        self.assertIn("unknown_evidence:absent", issues)

    def test_missing_data_still_routes_positive_but_requires_abstention(self):
        q = self.query()
        q.update(answerability="missing_evidence", expected_behavior="abstain", evidence_ids=[])
        self.assertEqual(audit_queries([q], [card("alpha")], [])["findings"], [])
        q["expected_behavior"] = "answer"
        self.assertTrue(audit_queries([q], [card("alpha")], [])["findings"])

    def test_wrong_polarity_and_unsupported_write_fail(self):
        q = self.query()
        q.update(routing_polarity="negative", answerability="unsupported_action")
        issues = [x["issue"] for x in audit_queries([q], [card("alpha")], [])["findings"]]
        self.assertIn("negative_route_mismatch", issues)
        self.assertIn("unsupported_action_not_refused", issues)


if __name__ == "__main__":
    unittest.main()
