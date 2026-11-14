import { randomUUID } from "node:crypto";
import type {
  EmbeddingProvider,
  IngestionResultDto,
  IngestionUseCase,
  PdfTextExtractor,
  TextChunker,
  VectorChunk,
  VectorRepository,
} from "../../types/ingestion.types.js";

export class IngestionService implements IngestionUseCase {
  constructor(
    private readonly pdfExtractor: PdfTextExtractor,
    private readonly chunker: TextChunker,
    private readonly embeddings: EmbeddingProvider,
    private readonly vectorRepository: VectorRepository,
  ) {}

  async ingestPdf(source: string, buffer: Buffer): Promise<IngestionResultDto> {
    const text = await this.pdfExtractor.extract(buffer);
    const chunks = this.chunker.split(text);

    if (chunks.length === 0) {
      throw new Error("The PDF contained no extractable text.");
    }

    const vectorChunks: VectorChunk[] = [];

    for (let index = 0; index < chunks.length; index++) {
      const chunkText = chunks[index];
      const vector = await this.embeddings.embedDocument(chunkText);

      vectorChunks.push({
        id: randomUUID(),
        vector,
        text: chunkText,
        source,
        chunkIndex: index,
      });
    }

    await this.vectorRepository.save(vectorChunks);

    return {
      source,
      chunkCount: vectorChunks.length,
    };
  }
}
