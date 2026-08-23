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

  async chat(system, messages) {
    const model = this.client.getGenerativeModel({ model: this.model });
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const chat = model.startChat({ history, systemInstruction: system });
    const last = messages[messages.length - 1];
    const result = await chat.sendMessage(last.content);
    return result.response.text();
  }
}
