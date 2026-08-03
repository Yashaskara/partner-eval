import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiProvider {
  constructor() {
    this.model = process.env.GOOGLE_MODEL || 'gemini-1.5-pro';
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }

  async analyze(prompt) {
    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text);
  }
}
