import type {
  LlmGenerator,
  QueryEmbeddingProvider,
  QueryRequestDto,
  QueryResponseDto,
  RetrievalUseCase,
  SemanticCacheRepository,
  VectorSearchRepository,
} from "../../types/retrieval.types.js";

export class RetrievalService implements RetrievalUseCase {
  private readonly defaultSimilarityThreshold = 0.92;
  private readonly defaultTopK = 5;
  private readonly defaultMinScore = 0.50;

  constructor(
    private readonly embeddings: QueryEmbeddingProvider,
    private readonly vectorRepository: VectorSearchRepository,
    private readonly cacheRepository: SemanticCacheRepository,
    private readonly llm: LlmGenerator,
  ) {}

  async query(dto: QueryRequestDto): Promise<QueryResponseDto> {
    const question = dto.question?.trim();
    if (!question) {
      throw new Error("Question must not be empty.");
    }

    const topK = dto.topK && dto.topK > 0 ? dto.topK : this.defaultTopK;
    const threshold =
      dto.threshold && dto.threshold > 0 && dto.threshold <= 1
        ? dto.threshold
        : this.defaultSimilarityThreshold;
    const minScore =
      dto.minScore !== undefined && dto.minScore >= 0 && dto.minScore <= 1
        ? dto.minScore
        : this.defaultMinScore;

    // 1. Embed query (using RETRIEVAL_QUERY optimization)
    const queryVector = await this.embeddings.embedQuery(question);

    // 2. Check Semantic Cache for semantically similar questions (>= threshold)
    const cached = await this.cacheRepository.findSimilar(queryVector, threshold);

    if (cached) {
      return {
        question,
        answer: cached.answer,
        sources: cached.sources,
        cached: true,
        modelUsed: "semantic-cache",
      };
    }

    // 3. Cache Miss: Retrieve top-K relevant chunks from vector store and filter low-score noise
    const rawChunks = await this.vectorRepository.search(queryVector, topK);
    const retrievedChunks = rawChunks.filter((chunk) => chunk.score >= minScore);
    const context = retrievedChunks.map((chunk) => chunk.text);

    // 4. Generate Answer with Resilient LLM (with automatic fallback)
    const answer = await this.llm.generateAnswer(question, context);

    // 5. Asynchronous, non-blocking write to Semantic Cache
    void this.cacheRepository
      .save(question, queryVector, answer, retrievedChunks)
      .catch((error: unknown) => {
        console.error("[RetrievalService] Async semantic cache write error:", error);
      });

    return {
      question,
      answer,
      sources: retrievedChunks,
      cached: false,
      modelUsed: this.llm.modelName,
    };
  }
}
