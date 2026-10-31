from __future__ import annotations

import json


def parse_analysis_text(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end < start:
        raise ValueError("No JSON object in model output")
    return json.loads(text[start:end + 1])


class AnalysisStreamParser:
    """Turns partial analysis JSON into summary text and completed assessments as chunks arrive."""

    def __init__(self):
        self._depth = 0
        self._in_string = False
        self._escaped = False
        self._key = ""
        self._key_chars: list[str] | None = None
        self._after_colon = False
        self._in_summary = False
        self._escape_chars: list[str] | None = None
        self._high_surrogate = ""
        self._assessment_chars: list[str] | None = None
        self._summary_chars: list[str] = []
        self._events: list[dict] = []

    def feed(self, chunk: str) -> list[dict]:
        for ch in chunk:
            self._consume(ch)
        self._flush_summary()
        events, self._events = self._events, []
        return events

    def _flush_summary(self) -> None:
        if self._summary_chars:
            self._events.append({"type": "summary", "text": "".join(self._summary_chars)})
            self._summary_chars = []

    def _consume(self, ch: str) -> None:
        if self._depth == 0 and ch != "{":
            return
        if self._assessment_chars is not None:
            self._assessment_chars.append(ch)
        if self._in_string:
            self._consume_string(ch)
        elif ch == '"':
            self._open_string()
        elif ch in "{[":
            self._depth += 1
            if ch == "{" and self._depth == 3 and self._key == "assessments":
                self._assessment_chars = [ch]
        elif ch in "}]":
            self._depth -= 1
            if ch == "}" and self._depth == 2 and self._assessment_chars is not None:
                self._finish_assessment()
        elif self._depth == 1 and ch == ":":
            self._after_colon = True
        elif self._depth == 1 and ch == ",":
            self._after_colon = False

    def _open_string(self) -> None:
        self._in_string = True
        if self._depth != 1:
            return
        if not self._after_colon:
            self._key_chars = []
        elif self._key == "summary":
            self._in_summary = True

    def _consume_string(self, ch: str) -> None:
        if self._in_summary:
            self._consume_summary(ch)
        elif self._escaped:
            self._escaped = False
        elif ch == "\\":
            self._escaped = True
        elif ch == '"':
            self._in_string = False
            if self._key_chars is not None:
                self._key = "".join(self._key_chars)
                self._key_chars = None
        elif self._key_chars is not None:
            self._key_chars.append(ch)

    def _consume_summary(self, ch: str) -> None:
        if self._escape_chars is not None:
            self._escape_chars.append(ch)
            is_unicode = self._escape_chars[1] == "u"
            if len(self._escape_chars) == (6 if is_unicode else 2):
                self._finish_escape()
        elif ch == "\\":
            self._escape_chars = [ch]
        elif ch == '"':
            self._in_string = False
            self._in_summary = False
            self._high_surrogate = ""
        else:
            self._summary_chars.append(ch)
            self._high_surrogate = ""

    def _finish_escape(self) -> None:
        raw = "".join(self._escape_chars)
        self._escape_chars = None
        high, self._high_surrogate = self._high_surrogate, ""
        # A bad escape only costs preview text; the full response is still validated before saving.
        try:
            if raw.startswith("\\u") and 0xD800 <= int(raw[2:], 16) <= 0xDBFF:
                self._high_surrogate = raw
                return
            self._summary_chars.append(json.loads(f'"{high}{raw}"'))
        except ValueError:
            pass

    def _finish_assessment(self) -> None:
        raw = "".join(self._assessment_chars)
        self._assessment_chars = None
        try:
            assessment = json.loads(raw)
        except json.JSONDecodeError:
            return
        if isinstance(assessment, dict) and assessment.get("domain"):
            self._events.append({"type": "assessment", "assessment": assessment})
