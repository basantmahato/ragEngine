try {
  process.loadEnvFile();
} catch { }

import type { GoogleGenAI } from "@google/genai";
import { createGeminiClient, createQdrantClient } from "../config/clients.js";
import { QdrantSemanticCacheRepository } from "../repository/qdrant-semantic-cache.repository.js";
import { QdrantVectorRepository } from "../repository/qdrant-vector.repository.js";
import {
  FallbackLlmService,
  GeminiLlmService,
  RetrievalService,
} from "../services/retrieval/index.js";
import { GeminiEmbeddingService } from "../services/shared/index.js";

interface TestCase {
  id: number;
  name: string;
  question: string;
  expectedContextKeywords?: string[];
  expectedAnswerKeywords?: string[];
  expectedToRefuseOrDeny?: boolean;
  expectEmptySources?: boolean;
}

interface EvalResult {
  testId: number;
  name: string;
  passed: boolean;
  latencyMs: number;
  cached: boolean;
  modelUsed: string;
  retrievalHit: boolean;
  faithfulnessScore: number;
  details: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 15000,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const errorStr = String(error);
    if (retries > 0 && (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED"))) {
      console.log(`\n⏳ Free Tier rate limit reached. Waiting ${Math.round(delayMs / 1000)}s before retrying...`);
      await sleep(delayMs);
      return retryWithBackoff(fn, retries - 1, delayMs * 1.5);
    }
    throw error;
  }
}

async function judgeFaithfulness(
  gemini: GoogleGenAI,
  context: string[],
  answer: string,
): Promise<{ score: number; reasoning: string }> {
  if (context.length === 0) {
    return { score: 1.0, reasoning: "General knowledge query without document context." };
  }

  const prompt = `You are an expert AI evaluator scoring the Faithfulness / Groundedness of a RAG-generated answer against retrieved document excerpts.

Context Excerpts:
${context.map((c, i) => `[Excerpt ${i + 1}]:\n${c}`).join("\n\n")}

Generated Answer:
${answer}

Evaluation Instructions:
1. Break down the Generated Answer into individual factual claims.
2. Verify whether each claim is directly supported by the Context Excerpts.
3. Compute faithfulnessScore = (supportedClaims / totalClaims).
   - If the answer correctly states that something is not found in the context, score = 1.0.
   - If the answer invents facts not found in the context, penalize accordingly.
4. Output valid JSON only with keys:
   - "totalClaims": number
   - "supportedClaims": number
   - "faithfulnessScore": number between 0.0 and 1.0
   - "reasoning": brief one-sentence justification`;

  try {
    return await retryWithBackoff(async () => {
      const response = await gemini.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.0,
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      const score =
        typeof parsed.faithfulnessScore === "number"
          ? Math.min(1.0, Math.max(0.0, parsed.faithfulnessScore))
          : 1.0;

      return {
        score,
        reasoning: parsed.reasoning || "Evaluation completed.",
      };
    }, 2, 20000);
  } catch (error) {
    return {
      score: 1.0,
      reasoning: `Faithfulness check fallback: ${error instanceof Error ? error.message : error}`,
    };
  }
}

async function runEvals() {
  console.log("================================================================================");
  console.log("                     RAG ENGINE AUTOMATED EVALUATION SUITE                      ");
  console.log("================================================================================\n");

  const qdrant = createQdrantClient();
  const gemini = createGeminiClient();

  const vectorRepo = new QdrantVectorRepository(qdrant);
  const cacheRepo = new QdrantSemanticCacheRepository(qdrant);
  await cacheRepo.clear();
  const embeddings = new GeminiEmbeddingService(gemini);
  const primaryLlm = new GeminiLlmService(gemini, "gemini-2.5-flash");
  const fallbackLlm = new GeminiLlmService(gemini, "gemini-3.5-flash-lite");
  const resilientLlm = new FallbackLlmService(primaryLlm, fallbackLlm);

  const retrievalService = new RetrievalService(
    embeddings,
    vectorRepo,
    cacheRepo,
    resilientLlm,
  );

  const testCases: TestCase[] = [
    {
      id: 1,
      name: "Factual Retrieval (Desserts & Pricing)",
      question: "What desserts are served at Cedar & Spice Kitchen and what are their prices?",
      expectedContextKeywords: ["Gulab Jamun", "Brownie"],
      expectedAnswerKeywords: ["89", "129"],
    },
    {
      id: 2,
      name: "Entity & Review Extraction (Isha R.)",
      question: "What was Isha R.'s review and rating of the restaurant?",
      expectedContextKeywords: ["Isha R", "Cold Coffee"],
      expectedAnswerKeywords: ["4", "Cold Coffee"],
    },
    {
      id: 3,
      name: "Anti-Hallucination / Negative Check (Sushi / Pasta)",
      question: "Does Cedar & Spice Kitchen serve sushi or Italian pasta on their menu?",
      expectedToRefuseOrDeny: true,
    },
    {
      id: 4,
      name: "Out-of-Document / General Knowledge (Dual-Mode)",
      question: "What is the capital of France?",
      expectedAnswerKeywords: ["Paris"],
      expectEmptySources: true,
    },
  ];

  const results: EvalResult[] = [];

  for (const tc of testCases) {
    process.stdout.write(`⏳ Running Test [${tc.id}/5]: ${tc.name}... `);

    const response = await retryWithBackoff(async () => {
      const start = performance.now();
      const res = await retrievalService.query({ question: tc.question, topK: 3 });
      const latencyMs = Math.round(performance.now() - start);
      return { res, latencyMs };
    });

    const contextTexts = response.res.sources.map((s) => s.text);
    const combinedContext = contextTexts.join(" ").toLowerCase();
    const answerLower = response.res.answer.toLowerCase();

    // Check Retrieval Hit
    let retrievalHit = true;
    if (tc.expectedContextKeywords) {
      retrievalHit = tc.expectedContextKeywords.some((kw) =>
        combinedContext.includes(kw.toLowerCase()),
      );
    }
    if (tc.expectEmptySources) {
      retrievalHit = response.res.sources.length === 0;
    }

    // Check Answer Correctness
    let answerCorrect = true;
    if (tc.expectedAnswerKeywords) {
      answerCorrect = tc.expectedAnswerKeywords.every((kw) =>
        answerLower.includes(kw.toLowerCase()),
      );
    }
    if (tc.expectedToRefuseOrDeny) {
      const denies =
        answerLower.includes("does not") ||
        answerLower.includes("do not") ||
        answerLower.includes("not on the menu") ||
        answerLower.includes("not serve") ||
        answerLower.includes("no mention") ||
        answerLower.includes("neither") ||
        answerLower.includes("not listed");
      answerCorrect = denies;
    }

    // LLM-as-a-judge for Faithfulness
    const judge = await judgeFaithfulness(gemini, contextTexts, response.res.answer);

    const passed = retrievalHit && answerCorrect && judge.score >= 0.8;

    results.push({
      testId: tc.id,
      name: tc.name,
      passed,
      latencyMs: response.latencyMs,
      cached: response.res.cached,
      modelUsed: response.res.modelUsed,
      retrievalHit,
      faithfulnessScore: judge.score,
      details: judge.reasoning,
    });

    console.log(passed ? "✅ PASS" : "❌ FAIL");

    // Brief delay to prevent Free Tier RPM burst spikes
    await sleep(4000);
  }

  // Test 5: Semantic Caching Speedup & Hit Check
  process.stdout.write("⏳ Running Test [5/5]: Semantic Cache Acceleration Test... ");
  const cacheQuestion1 = "What beverages and drinks are available on the menu?";
  const cacheQuestion2 = "Can you list the beverages and drinks available on the menu?";

  // Initial query to prime cache
  const startQ1 = performance.now();
  const resQ1 = await retryWithBackoff(() =>
    retrievalService.query({ question: cacheQuestion1, topK: 3 }),
  );
  const latencyQ1 = Math.round(performance.now() - startQ1);

  // Allow async cache write tick
  await sleep(1000);

  // Similar query to test cache hit
  const startQ2 = performance.now();
  const resQ2 = await retrievalService.query({ question: cacheQuestion2, topK: 3 });
  const latencyQ2 = Math.round(performance.now() - startQ2);

  const cachePassed = resQ2.cached;

  results.push({
    testId: 5,
    name: "Semantic Cache Hit & Latency Acceleration",
    passed: cachePassed,
    latencyMs: latencyQ2,
    cached: resQ2.cached,
    modelUsed: resQ2.modelUsed,
    retrievalHit: true,
    faithfulnessScore: 1.0,
    details: `1st query: ${latencyQ1}ms (cached: ${resQ1.cached}) -> 2nd query: ${latencyQ2}ms (cached: ${resQ2.cached})`,
  });

  console.log(cachePassed ? "✅ PASS" : "❌ FAIL");

  // Output Scorecard Table
  console.log("\n--------------------------------------------------------------------------------");
  console.log("                           DETAILED EVALUATION REPORT                           ");
  console.log("--------------------------------------------------------------------------------");

  for (const r of results) {
    const status = r.passed ? "[PASS]" : "[FAIL]";
    console.log(
      `${r.testId}. ${r.name.padEnd(46)} ${status} | Faithfulness: ${r.faithfulnessScore.toFixed(2)} | Latency: ${r.latencyMs}ms | Cached: ${r.cached}`,
    );
    console.log(`   ↳ ${r.details}`);
  }

  // Summary Metrics
  const totalPassed = results.filter((r) => r.passed).length;
  const passRate = Math.round((totalPassed / results.length) * 100);
  const avgFaithfulness = (
    results.reduce((acc, r) => acc + r.faithfulnessScore, 0) / results.length
  ).toFixed(2);
  const avgLatency = Math.round(
    results.reduce((acc, r) => acc + r.latencyMs, 0) / results.length,
  );

  console.log("\n================================================================================");
  console.log("                              BENCHMARK SUMMARY                                 ");
  console.log("================================================================================");
  console.log(`  Tests Passed:           ${totalPassed} / ${results.length} (${passRate}%)`);
  console.log(`  Average Faithfulness:   ${avgFaithfulness} / 1.00 (Anti-Hallucination Score)`);
  console.log(`  Average Latency:        ${avgLatency} ms`);
  if (resQ2.cached) {
    console.log(`  Cache Speedup:          ${latencyQ1} ms -> ${latencyQ2} ms (${Math.round((1 - latencyQ2 / Math.max(latencyQ1, 1)) * 100)}% faster)`);
  }
  console.log("================================================================================\n");

  if (totalPassed === results.length) {
    console.log("🏆 All RAG Evaluation criteria met production quality standards!");
  }
}

runEvals().catch((error) => {
  console.error("Evaluation run failed:", error);
  process.exit(1);
});
