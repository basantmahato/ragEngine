import { randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { GEMINI_VECTOR_SIZE } from "../types/ingestion.types.js";
import type {
  CachedQuery,
  RetrievedChunk,
  SemanticCacheRepository,
} from "../types/retrieval.types.js";

export class QdrantSemanticCacheRepository implements SemanticCacheRepository {
  constructor(
    private readonly client: QdrantClient,
    private readonly collectionName: string = "semantic_cache_gemini_768",
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

  async findSimilar(
    queryVector: number[],
    similarityThreshold = 0.92,
  ): Promise<CachedQuery | null> {
    const response = await this.client.query(this.collectionName, {
      query: queryVector,
      limit: 1,
      with_payload: true,
      score_threshold: similarityThreshold,
    });

    const bestMatch = response.points?.[0];
    if (!bestMatch || !bestMatch.payload) {
      return null;
    }

    const payload = bestMatch.payload as {
      question?: string;
      answer?: string;
      sources?: RetrievedChunk[];
    };

    if (!payload.answer) {
      return null;
    }

    return {
      question: payload.question ?? "",
      answer: payload.answer,
      sources: payload.sources ?? [],
      score: bestMatch.score ?? 0,
    };
  }

  async save(
    question: string,
    vector: number[],
    answer: string,
    sources: RetrievedChunk[],
  ): Promise<void> {
    await this.client.upsert(this.collectionName, {
      wait: true,
      points: [
        {
          id: randomUUID(),
          vector,
          payload: {
            question,
            answer,
            sources,
            createdAt: new Date().toISOString(),
          },
        },
      ],
    });
  }
}
