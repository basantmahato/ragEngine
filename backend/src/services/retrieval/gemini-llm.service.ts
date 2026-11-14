import { GoogleGenAI } from "@google/genai";
import type { LlmGenerator } from "../../types/retrieval.types.js";

export class GeminiLlmService implements LlmGenerator {
  constructor(
    private readonly client: GoogleGenAI,
    readonly modelName: string = "gemini-2.5-flash",
  ) { }

  async generateAnswer(question: string, context: string[]): Promise<string> {
    const hasContext = context.length > 0;

    const prompt = hasContext
      ? `You are an AI assistant answering questions using retrieved documents.

Context:
${context.map((c, i) => `[Document Excerpt ${i + 1}]:\n${c}`).join("\n\n")}

Question: ${question}

Instructions:
1. Answer the question primarily using the facts provided in the Context above.
2. Be accurate, clear, and cite relevant details from the excerpts.
3. If the context only partially answers the question, state what the documents cover and answer helpfully.`
      : `You are a helpful and intelligent AI assistant.

Question: ${question}

Instructions:
No specific document excerpts matched this question in the document database.
Answer the user's question directly, politely, and helpfully using your general knowledge.`;

    const response = await this.client.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        temperature: 0.3,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error(`Model ${this.modelName} returned an empty response.`);
    }

    return text;
  }
}
