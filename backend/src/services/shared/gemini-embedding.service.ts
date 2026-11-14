import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_VECTOR_SIZE,
  type EmbeddingProvider,
} from "../../types/ingestion.types.js";
import type { QueryEmbeddingProvider } from "../../types/retrieval.types.js";

export class GeminiEmbeddingService
  implements EmbeddingProvider, QueryEmbeddingProvider
{
  private readonly modelName = "gemini-embedding-001";
  private readonly vectorSize = GEMINI_VECTOR_SIZE;

  constructor(private readonly client: GoogleGenAI) {}

  async embedDocument(text: string): Promise<number[]> {
    return this.createEmbedding(text, "RETRIEVAL_DOCUMENT");
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.createEmbedding(text, "RETRIEVAL_QUERY");
  }

  private async createEmbedding(
    text: string,
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  ): Promise<number[]> {
    const result = await this.client.models.embedContent({
      model: this.modelName,
      contents: text,
      config: {
        taskType,
        outputDimensionality: this.vectorSize,
      },
    });

    const vector = result.embeddings?.[0]?.values;
    if (!vector || vector.length !== this.vectorSize) {
      throw new Error(
        `Gemini returned an invalid embedding; expected ${this.vectorSize} dimensions.`,
      );
    }

    return vector;
  }
}
