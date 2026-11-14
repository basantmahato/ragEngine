import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LlmGenerator } from "../../types/retrieval.types.js";
import { FallbackLlmService } from "./fallback-llm.service.js";

describe("FallbackLlmService", () => {
  it("should return primary model output when primary succeeds", async () => {
    const primary: LlmGenerator = {
      modelName: "primary-model",
      generateAnswer: async (_q, _ctx) => "Primary answer",
    };

    let fallbackCalled = false;
    const fallback: LlmGenerator = {
      modelName: "fallback-model",
      generateAnswer: async () => {
        fallbackCalled = true;
        return "Fallback answer";
      },
    };

    const service = new FallbackLlmService(primary, fallback);
    const answer = await service.generateAnswer("Test question?", ["Context 1"]);

    assert.equal(answer, "Primary answer");
    assert.equal(fallbackCalled, false);
  });

  it("should fallback to secondary model when primary fails", async () => {
    const primary: LlmGenerator = {
      modelName: "primary-model",
      generateAnswer: async () => {
        throw new Error("429 Resource Exhausted / Rate limit exceeded");
      },
    };

    let fallbackCalled = false;
    const fallback: LlmGenerator = {
      modelName: "fallback-model",
      generateAnswer: async () => {
        fallbackCalled = true;
        return "Fallback answer after recovery";
      },
    };

    const service = new FallbackLlmService(primary, fallback);
    const answer = await service.generateAnswer("Test question?", ["Context 1"]);

    assert.equal(answer, "Fallback answer after recovery");
    assert.equal(fallbackCalled, true);
  });
});
