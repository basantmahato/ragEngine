import { QdrantClient } from "@qdrant/js-client-rest";
import {
  GEMINI_VECTOR_SIZE,
  type VectorChunk,
  type VectorRepository,
} from "../types/ingestion.types.js";
import type {
  RetrievedChunk,
  VectorSearchRepository,
} from "../types/retrieval.types.js";

export class QdrantVectorRepository
  implements VectorRepository, VectorSearchRepository
{
  constructor(
    private readonly client: QdrantClient,
    private readonly collectionName: string = "pdf_chunks_gemini_768",
    private readonly vectorSize: number = GEMINI_VECTOR_SIZE,
  ) {}

  async ensureCollection(): Promise<void> {
    const { collections } = await this.client.getCollections();

    if (collections.some((collection) => collection.name === this.collectionName)) {
      return;
    }

    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: this.vectorSize,
        distance: "Cosine",
      },
    });
  }

  async save(chunks: VectorChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    await this.client.upsert(this.collectionName, {
      wait: true,
      points: chunks.map((chunk) => ({
        id: chunk.id,
        vector: chunk.vector,
        payload: {
          text: chunk.text,
          source: chunk.source,
          chunkIndex: chunk.chunkIndex,
        },
      })),
    });
  }

  async search(queryVector: number[], limit = 5): Promise<RetrievedChunk[]> {
    const response = await this.client.query(this.collectionName, {
      query: queryVector,
      limit,
      with_payload: true,
    });

    const points = response.points ?? [];

    return points.map((point) => {
      const payload = point.payload ?? {};
      return {
        id: String(point.id),
        text: String(payload.text ?? ""),
        source: String(payload.source ?? "unknown"),
        chunkIndex: Number(payload.chunkIndex ?? 0),
        score: point.score ?? 0,
      };
    });
  }
}
