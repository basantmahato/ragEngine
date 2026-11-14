export const GEMINI_VECTOR_SIZE = 768;

export interface PdfTextExtractor {
  extract(buffer: Buffer): Promise<string>;
}

export interface TextChunker {
  split(text: string): string[];
}

export interface EmbeddingProvider {
  embedDocument(text: string): Promise<number[]>;
}

export interface VectorChunk {
  id: string;
  vector: number[];
  text: string;
  source: string;
  chunkIndex: number;
}

export interface VectorRepository {
  ensureCollection(): Promise<void>;
  save(chunks: VectorChunk[]): Promise<void>;
}

export interface IngestionResultDto {
  source: string;
  chunkCount: number;
}

export interface IngestionUseCase {
  ingestPdf(source: string, buffer: Buffer): Promise<IngestionResultDto>;
}
