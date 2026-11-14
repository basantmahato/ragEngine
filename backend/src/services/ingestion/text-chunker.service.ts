import type { TextChunker } from "../../types/ingestion.types.js";

export class CharacterTextChunker implements TextChunker {
  private readonly chunkSize: number;
  private readonly overlap: number;

  constructor(chunkSize = 3000, overlap = 300) {
    if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) {
      throw new Error(
        "Chunk size must be positive and overlap smaller than chunk size.",
      );
    }
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  split(text: string): string[] {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return [];

    const chunks: string[] = [];
    const step = this.chunkSize - this.overlap;

    for (let start = 0; start < normalized.length; start += step) {
      const chunk = normalized.slice(start, start + this.chunkSize).trim();
      if (chunk) chunks.push(chunk);
    }

    return chunks;
  }
}
