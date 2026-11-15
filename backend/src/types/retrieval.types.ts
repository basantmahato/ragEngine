export interface QueryRequestDto {
  question: string;
  topK?: number;
  threshold?: number;
  minScore?: number;
}

export interface RetrievedChunk {
  id: string;
  text: string;
  source: string;
  score: number;
  chunkIndex: number;
}

export interface CachedQuery {
  question: string;
  answer: string;
  sources: RetrievedChunk[];
  score: number;
}

export interface QueryResponseDto {
  question: string;
  answer: string;
  sources: RetrievedChunk[];
  cached: boolean;
  modelUsed: string;
}

export interface VectorSearchRepository {
  search(queryVector: number[], limit?: number): Promise<RetrievedChunk[]>;
}

export interface SemanticCacheRepository {
  ensureCollection(): Promise<void>;
  clear(): Promise<void>;
  findSimilar(
    queryVector: number[],
    similarityThreshold?: number,
  ): Promise<CachedQuery | null>;
  save(
    question: string,
    vector: number[],
    answer: string,
    sources: RetrievedChunk[],
  ): Promise<void>;
}

export interface LlmGenerator {
  readonly modelName: string;
  generateAnswer(question: string, context: string[]): Promise<string>;
}

export interface QueryEmbeddingProvider {
  embedQuery(text: string): Promise<number[]>;
}

export interface RetrievalUseCase {
  query(dto: QueryRequestDto): Promise<QueryResponseDto>;
}
