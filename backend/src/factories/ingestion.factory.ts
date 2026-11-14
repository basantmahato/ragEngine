import type { GoogleGenAI } from "@google/genai";
import type { QdrantClient } from "@qdrant/js-client-rest";
import { IngestionController } from "../controllers/ingestion.controller.js";
import { QdrantVectorRepository } from "../repository/qdrant-vector.repository.js";
import { createIngestionRoutes as setupIngestionRoutes } from "../routes/ingestion.routes.js";
import {
  CharacterTextChunker,
  IngestionService,
  UnpdfTextExtractor,
} from "../services/ingestion/index.js";
import { GeminiEmbeddingService } from "../services/shared/index.js";

export const createIngestionRoutes = (
  qdrant: QdrantClient,
  gemini: GoogleGenAI,
) => {
  const pdfExtractor = new UnpdfTextExtractor();
  const chunker = new CharacterTextChunker();
  const embeddings = new GeminiEmbeddingService(gemini);
  const vectorRepo = new QdrantVectorRepository(qdrant);
  const service = new IngestionService(
    pdfExtractor,
    chunker,
    embeddings,
    vectorRepo,
  );
  const controller = new IngestionController(service);
  return setupIngestionRoutes(controller);
};
