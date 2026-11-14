import express, { type Express } from "express";

try {
  process.loadEnvFile();
} catch {
  // Gracefully ignore if .env file is missing or loaded via environment
}

import { createGeminiClient, createQdrantClient } from "./config/clients.js";
import {
  createIngestionRoutes,
  createRetrievalRoutes,
} from "./factories/index.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { QdrantSemanticCacheRepository } from "./repository/qdrant-semantic-cache.repository.js";
import { QdrantVectorRepository } from "./repository/qdrant-vector.repository.js";

const PORT = Number(process.env.PORT || 3000);

export const createApp = (): Express => {
  const app = express();

  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({ message: "RAG Engine API is active" });
  });

  const qdrantClient = createQdrantClient();
  const geminiClient = createGeminiClient();

  app.use("/ingestion", createIngestionRoutes(qdrantClient, geminiClient));
  app.use("/retrieval", createRetrievalRoutes(qdrantClient, geminiClient));
  app.use(errorHandler);

  return app;
};

const startServer = async (): Promise<void> => {
  try {
    const qdrantClient = createQdrantClient();

    const vectorRepo = new QdrantVectorRepository(qdrantClient);
    await vectorRepo.ensureCollection();

    const cacheRepo = new QdrantSemanticCacheRepository(qdrantClient);
    await cacheRepo.ensureCollection();

    console.log(
      "Vector collections (pdf_chunks & semantic_cache) verified successfully.",
    );

    const app = createApp();

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const hasConnRefused =
      errorMessage.includes("ECONNREFUSED") ||
      (error && typeof error === "object" && "cause" in error && String((error as { cause: unknown }).cause).includes("ECONNREFUSED"));

    if (hasConnRefused) {
      console.error(
        "\n❌ Connection Error: Unable to connect to Qdrant at " +
          (process.env.QDRANT_URL || "http://localhost:6333") +
          "\n👉 Solution: Open Docker Desktop and run 'docker compose up -d' in the project root.\n",
      );
    } else {
      console.error("Failed to start server:", error);
    }
    process.exitCode = 1;
  }
};

if (process.env.NODE_ENV !== "test") {
  void startServer();
}
