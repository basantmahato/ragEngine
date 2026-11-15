import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  CachedQuery,
  LlmGenerator,
  QueryEmbeddingProvider,
  RetrievedChunk,
  SemanticCacheRepository,
  VectorSearchRepository,
} from "../../types/retrieval.types.js";
import { RetrievalService } from "./retrieval.service.js";

describe("RetrievalService", () => {
  it("should return cached answer on semantic cache hit without calling LLM or vector search", async () => {
    const mockEmbeddings: QueryEmbeddingProvider = {
      embedQuery: async () => [0.1, 0.2, 0.3],
    };

    let vectorSearchCalled = false;
    const mockVectorRepo: VectorSearchRepository = {
      search: async () => {
        vectorSearchCalled = true;
        return [];
      },
    };

    const cachedEntry: CachedQuery = {
      question: "What is sick leave?",
      answer: "Employees get 10 days sick leave.",
      sources: [
        {
          id: "1",
          text: "10 days sick leave",
          source: "handbook.pdf",
          score: 0.95,
          chunkIndex: 0,
        },
      ],
      score: 0.96,
    };

    const mockCacheRepo: SemanticCacheRepository = {
      ensureCollection: async () => {},
      clear: async () => {},
      findSimilar: async () => cachedEntry,
      save: async () => {},
    };

    let llmCalled = false;
    const mockLlm: LlmGenerator = {
      modelName: "gemini-2.5-flash",
      generateAnswer: async () => {
        llmCalled = true;
        return "New answer";
      },
    };

    const service = new RetrievalService(
      mockEmbeddings,
      mockVectorRepo,
      mockCacheRepo,
      mockLlm,
    );

    const result = await service.query({
      question: "Tell me about sick leave rules",
    });

    assert.equal(result.cached, true);
    assert.equal(result.answer, "Employees get 10 days sick leave.");
    assert.equal(result.sources.length, 1);
    assert.equal(result.modelUsed, "semantic-cache");
    assert.equal(vectorSearchCalled, false);
    assert.equal(llmCalled, false);
  });

  it("should retrieve chunks, call LLM, and trigger async cache save on cache miss", async () => {
    const mockEmbeddings: QueryEmbeddingProvider = {
      embedQuery: async () => [0.1, 0.2, 0.3],
    };

    const mockChunks: RetrievedChunk[] = [
      {
        id: "chunk-1",
        text: "Remote work is permitted on Fridays.",
        source: "policy.pdf",
        score: 0.88,
        chunkIndex: 2,
      },
    ];

    const mockVectorRepo: VectorSearchRepository = {
      search: async () => mockChunks,
    };

    let savedQuestion = "";
    let savedAnswer = "";
    const mockCacheRepo: SemanticCacheRepository = {
      ensureCollection: async () => {},
      clear: async () => {},
      findSimilar: async () => null, // Cache miss!
      save: async (q, _v, a, _s) => {
        savedQuestion = q;
        savedAnswer = a;
      },
    };

    const mockLlm: LlmGenerator = {
      modelName: "gemini-2.5-flash",
      generateAnswer: async (_q, context) =>
        `Answer based on: ${context.join(", ")}`,
    };

    const service = new RetrievalService(
      mockEmbeddings,
      mockVectorRepo,
      mockCacheRepo,
      mockLlm,
    );

    const result = await service.query({
      question: "Can I work remotely?",
    });

    assert.equal(result.cached, false);
    assert.ok(result.answer.includes("Remote work is permitted on Fridays."));
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].source, "policy.pdf");

    // Wait a tick for async background cache save to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(savedQuestion, "Can I work remotely?");
    assert.ok(savedAnswer.includes("Remote work is permitted"));
  });

  it("should reject empty questions with a descriptive error", async () => {
    const service = new RetrievalService(
      { embedQuery: async () => [] },
      { search: async () => [] },
      {
        ensureCollection: async () => {},
        clear: async () => {},
        findSimilar: async () => null,
        save: async () => {},
      },
      { modelName: "test", generateAnswer: async () => "" },
    );

    await assert.rejects(
      async () => service.query({ question: "   " }),
      /Question must not be empty/,
    );
  });
});
