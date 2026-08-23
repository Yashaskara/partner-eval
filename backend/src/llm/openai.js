import OpenAI from 'openai';

export class OpenAIProvider {
  constructor() {
    this.model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async analyze(prompt) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const text = response.choices[0].message.content;
    return JSON.parse(text);
  }

  async chat(system, messages) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'system', content: system }, ...messages],
    });
    return response.choices[0].message.content;
  }
}
