import type { GoogleGenAI } from "@google/genai";
import type { QdrantClient } from "@qdrant/js-client-rest";
import { RetrievalController } from "../controllers/retrieval.controller.js";
import { QdrantSemanticCacheRepository } from "../repository/qdrant-semantic-cache.repository.js";
import { QdrantVectorRepository } from "../repository/qdrant-vector.repository.js";
import { createRetrievalRoutes as setupRetrievalRoutes } from "../routes/retrieval.routes.js";
import {
  FallbackLlmService,
  GeminiLlmService,
  RetrievalService,
} from "../services/retrieval/index.js";
import { GeminiEmbeddingService } from "../services/shared/index.js";

export const createRetrievalRoutes = (
  qdrant: QdrantClient,
  gemini: GoogleGenAI,
) => {
  const vectorRepo = new QdrantVectorRepository(qdrant);
  const cacheRepo = new QdrantSemanticCacheRepository(qdrant);
  const embeddings = new GeminiEmbeddingService(gemini);
  const primaryLlm = new GeminiLlmService(gemini, "gemini-2.5-flash");
  const fallbackLlm = new GeminiLlmService(gemini, "gemini-1.5-flash");
  const resilientLlm = new FallbackLlmService(primaryLlm, fallbackLlm);
  const service = new RetrievalService(
    embeddings,
    vectorRepo,
    cacheRepo,
    resilientLlm,
  );
  const controller = new RetrievalController(service);
  return setupRetrievalRoutes(controller);
};
