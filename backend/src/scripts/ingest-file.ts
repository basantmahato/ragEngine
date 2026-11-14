import fs from "node:fs/promises";
import path from "node:path";

try {
  process.loadEnvFile();
} catch {}

import { createGeminiClient, createQdrantClient } from "../config/clients.js";
import { QdrantVectorRepository } from "../repository/qdrant-vector.repository.js";
import {
  CharacterTextChunker,
  IngestionService,
  UnpdfTextExtractor,
} from "../services/ingestion/index.js";
import { GeminiEmbeddingService } from "../services/shared/index.js";

async function main() {
  const targetFile = process.argv[2] || "../testPDF.pdf";
  const resolvedPath = path.resolve(process.cwd(), targetFile);

  console.log(`📄 Target file: ${resolvedPath}`);

  const buffer = await fs.readFile(resolvedPath);
  const qdrant = createQdrantClient();
  const gemini = createGeminiClient();

  const vectorRepo = new QdrantVectorRepository(qdrant);
  await vectorRepo.ensureCollection();

  const pdfExtractor = new UnpdfTextExtractor();
  const chunker = new CharacterTextChunker();
  const embeddings = new GeminiEmbeddingService(gemini);

  const ingestionService = new IngestionService(
    pdfExtractor,
    chunker,
    embeddings,
    vectorRepo,
  );

  console.log("⚙️  Running ingestion pipeline (extracting -> chunking -> embedding -> storing)...");
  const result = await ingestionService.ingestPdf(
    path.basename(resolvedPath),
    buffer,
  );

  console.log("✅ Ingestion completed successfully!");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("❌ Ingestion error:", error);
  process.exit(1);
});
