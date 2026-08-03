import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider {
  constructor() {
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20241022';
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async analyze(prompt) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text;
    return JSON.parse(text);
  }
}
