import json
import random
import unittest

from backend.src.llm.stream_parser import AnalysisStreamParser, parse_analysis_text

ANALYSIS = {
    "summary": 'Line one\nwith "quotes", a \\ slash, é and 🌿 emoji, {braces} and [brackets].',
    "assessments": [
        {"domain": "lifestyle", "tag": "green", "score": 8, "reasoning": 'Says "yes", uses {} too.'},
        {"domain": "career", "tag": "amber", "score": 5, "reasoning": "Not clear."},
    ],
}


def collect(chunks):
    parser = AnalysisStreamParser()
    events = [event for chunk in chunks for event in parser.feed(chunk)]
    summary = "".join(e["text"] for e in events if e["type"] == "summary")
    assessments = [e["assessment"] for e in events if e["type"] == "assessment"]
    return summary, assessments, events


class AnalysisStreamParserTest(unittest.TestCase):
    def test_whole_document(self):
        summary, assessments, _ = collect([json.dumps(ANALYSIS)])
        self.assertEqual(summary, ANALYSIS["summary"])
        self.assertEqual(assessments, ANALYSIS["assessments"])

    def test_one_character_at_a_time(self):
        for ensure_ascii in (True, False):
            text = json.dumps(ANALYSIS, ensure_ascii=ensure_ascii)
            summary, assessments, _ = collect(list(text))
            self.assertEqual(summary, ANALYSIS["summary"])
            self.assertEqual(assessments, ANALYSIS["assessments"])

    def test_random_chunk_boundaries(self):
        text = json.dumps(ANALYSIS, indent=2)
        rng = random.Random(7)
        for _ in range(200):
            chunks, i = [], 0
            while i < len(text):
                size = rng.randint(1, 12)
                chunks.append(text[i:i + size])
                i += size
            summary, assessments, _ = collect(chunks)
            self.assertEqual(summary, ANALYSIS["summary"])
            self.assertEqual(assessments, ANALYSIS["assessments"])

    def test_summary_is_emitted_before_the_document_ends(self):
        parser = AnalysisStreamParser()
        events = parser.feed('{"summary": "Hello wor')
        self.assertEqual(events, [{"type": "summary", "text": "Hello wor"}])

    def test_ignores_text_around_the_json(self):
        summary, assessments, _ = collect(["```json\n", json.dumps(ANALYSIS), "\n```"])
        self.assertEqual(summary, ANALYSIS["summary"])
        self.assertEqual(len(assessments), 2)

    def test_assessments_before_summary(self):
        text = json.dumps({"assessments": ANALYSIS["assessments"], "summary": "Later"})
        summary, assessments, _ = collect([text])
        self.assertEqual(summary, "Later")
        self.assertEqual(len(assessments), 2)

    def test_other_string_values_are_not_treated_as_summary(self):
        summary, _, _ = collect(['{"note": "summary", "summary": "real"}'])
        self.assertEqual(summary, "real")

    def test_bad_escape_does_not_raise(self):
        summary, _, _ = collect(['{"summary": "a\\uZZZZb"}'])
        self.assertEqual(summary, "ab")

    def test_truncated_output_keeps_what_was_complete(self):
        text = json.dumps(ANALYSIS)
        _, assessments, _ = collect([text[:text.index('"career"') + 3]])
        self.assertEqual(len(assessments), 1)


class ParseAnalysisTextTest(unittest.TestCase):
    def test_strips_fences(self):
        self.assertEqual(parse_analysis_text('```json\n{"a": 1}\n```'), {"a": 1})

    def test_rejects_output_without_json(self):
        with self.assertRaises(ValueError):
            parse_analysis_text("sorry, no")


if __name__ == "__main__":
    unittest.main()
