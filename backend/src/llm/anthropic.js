import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider {
  constructor() {
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250514';
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async analyze(prompt) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    return {
      result: JSON.parse(text),
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0,
      },
    };
  }

  async chat(system, messages) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages,
    });
    return {
      result: response.content[0].text,
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0,
      },
    };
  }
}
