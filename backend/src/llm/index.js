import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';

const providers = {
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAIProvider(),
  google: () => new GeminiProvider(),
};

export function getProvider(name) {
  const factory = providers[name];
  if (!factory) throw new Error(`Unknown provider: ${name}`);
  return factory();
}
