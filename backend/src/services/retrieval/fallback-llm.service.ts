import type { LlmGenerator } from "../../types/retrieval.types.js";

export class FallbackLlmService implements LlmGenerator {
  constructor(
    private readonly primary: LlmGenerator,
    private readonly fallback: LlmGenerator,
  ) {}

  get modelName(): string {
    return `${this.primary.modelName} (fallback: ${this.fallback.modelName})`;
  }

  async generateAnswer(question: string, context: string[]): Promise<string> {
    try {
      return await this.primary.generateAnswer(question, context);
    } catch (primaryError) {
      const errorMessage =
        primaryError instanceof Error ? primaryError.message : String(primaryError);

      console.warn(
        `[FallbackLlmService] Primary model "${this.primary.modelName}" failed: "${errorMessage}". Switching to fallback model "${this.fallback.modelName}"...`,
      );

      return await this.fallback.generateAnswer(question, context);
    }
  }
}
