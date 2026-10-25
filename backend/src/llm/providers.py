from __future__ import annotations

import json

import anthropic
import openai
import google.generativeai as genai

from .. import config


class AnthropicProvider:
    def __init__(self):
        self.model = config.ANTHROPIC_MODEL
        self.client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)

    def analyze(self, prompt: str) -> dict:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        return {
            "result": json.loads(text),
            "usage": {
                "input_tokens": response.usage.input_tokens or 0,
                "output_tokens": response.usage.output_tokens or 0,
            },
        }

    def chat(self, system: str, messages: list[dict]) -> dict:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=system,
            messages=messages,
        )
        return {
            "result": response.content[0].text,
            "usage": {
                "input_tokens": response.usage.input_tokens or 0,
                "output_tokens": response.usage.output_tokens or 0,
            },
        }


class OpenAIProvider:
    def __init__(self):
        self.model = config.OPENAI_MODEL
        self.client = openai.OpenAI(api_key=config.OPENAI_API_KEY)

    def analyze(self, prompt: str) -> dict:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content
        return {
            "result": json.loads(text),
            "usage": {
                "input_tokens": response.usage.prompt_tokens or 0,
                "output_tokens": response.usage.completion_tokens or 0,
            },
        }

    def chat(self, system: str, messages: list[dict]) -> dict:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, *messages],
        )
        return {
            "result": response.choices[0].message.content,
            "usage": {
                "input_tokens": response.usage.prompt_tokens or 0,
                "output_tokens": response.usage.completion_tokens or 0,
            },
        }


class GeminiProvider:
    def __init__(self):
        self.model = config.GOOGLE_MODEL
        genai.configure(api_key=config.GOOGLE_API_KEY)

    def analyze(self, prompt: str) -> dict:
        model = genai.GenerativeModel(
            self.model,
            generation_config={"response_mime_type": "application/json"},
        )
        result = model.generate_content(prompt)
        meta = result.usage_metadata
        return {
            "result": json.loads(result.text),
            "usage": {
                "input_tokens": getattr(meta, "prompt_token_count", 0),
                "output_tokens": getattr(meta, "candidates_token_count", 0),
            },
        }

    def chat(self, system: str, messages: list[dict]) -> dict:
        model = genai.GenerativeModel(self.model)
        history = [
            {
                "role": "model" if m["role"] == "assistant" else "user",
                "parts": [{"text": m["content"]}],
            }
            for m in messages[:-1]
        ]
        chat = model.start_chat(history=history)
        chat._model._system_instruction = system
        last = messages[-1]
        result = chat.send_message(last["content"])
        meta = result.usage_metadata
        return {
            "result": result.text,
            "usage": {
                "input_tokens": getattr(meta, "prompt_token_count", 0),
                "output_tokens": getattr(meta, "candidates_token_count", 0),
            },
        }


_providers = {
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "google": GeminiProvider,
}


def get_provider(name: str):
    cls = _providers.get(name)
    if cls is None:
        raise ValueError(f"Unknown provider: {name}")
    return cls()
