import json
import unittest

import anthropic
import httpx
import httpx2
import openai

from backend.src.llm.providers import AnthropicProvider, GeminiProvider, OpenAIProvider


def sse_client(body: str, http=httpx):
    def handler(request):
        return http.Response(200, headers={"content-type": "text/event-stream"}, content=body.encode())

    return http.Client(transport=http.MockTransport(handler))


def openai_chunk(**fields) -> str:
    base = {"id": "c1", "object": "chat.completion.chunk", "created": 1, "model": "m", "choices": []}
    return f"data: {json.dumps({**base, **fields})}\n\n"


def text_chunk(text: str) -> str:
    return openai_chunk(choices=[{"index": 0, "delta": {"content": text}, "finish_reason": None}])


def anthropic_event(name: str, data: dict) -> str:
    return f"event: {name}\ndata: {json.dumps({'type': name, **data})}\n\n"


class ProviderStreamingTest(unittest.TestCase):
    def test_openai_yields_text_and_usage(self):
        body = (
            text_chunk('{"sum')
            + text_chunk('mary": "x"}')
            + openai_chunk(usage={"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7})
            + "data: [DONE]\n\n"
        )
        provider = OpenAIProvider.__new__(OpenAIProvider)
        provider.model = "m"
        provider.client = openai.OpenAI(api_key="test", http_client=sse_client(body))

        items = list(provider.stream_analyze("p"))

        self.assertEqual("".join(i["text"] for i in items if "text" in i), '{"summary": "x"}')
        self.assertEqual(items[-1], {"usage": {"input_tokens": 3, "output_tokens": 4}})

    def test_anthropic_yields_text_and_usage(self):
        message = {
            "id": "m1", "type": "message", "role": "assistant", "model": "m", "content": [],
            "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 3, "output_tokens": 1},
        }
        body = (
            anthropic_event("message_start", {"message": message})
            + anthropic_event("content_block_start", {"index": 0, "content_block": {"type": "text", "text": ""}})
            + anthropic_event("content_block_delta", {"index": 0, "delta": {"type": "text_delta", "text": '{"sum'}})
            + anthropic_event("content_block_delta", {"index": 0, "delta": {"type": "text_delta", "text": 'mary": "x"}'}})
            + anthropic_event("content_block_stop", {"index": 0})
            + anthropic_event("message_delta", {
                "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 4},
            })
            + anthropic_event("message_stop", {})
        )
        provider = AnthropicProvider.__new__(AnthropicProvider)
        provider.model = "m"
        provider.client = anthropic.Anthropic(api_key="test", http_client=sse_client(body, httpx2))

        items = list(provider.stream_analyze("p"))

        self.assertEqual("".join(i["text"] for i in items if "text" in i), '{"summary": "x"}')
        self.assertEqual(items[-1], {"usage": {"input_tokens": 3, "output_tokens": 4}})

    def test_gemini_stays_on_the_non_streaming_fallback(self):
        self.assertFalse(hasattr(GeminiProvider, "stream_analyze"))


if __name__ == "__main__":
    unittest.main()
