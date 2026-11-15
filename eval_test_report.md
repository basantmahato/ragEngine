# RAG Engine Evaluation Benchmark Report

**Project**: RAG Engine Backend  
**Document Evaluated**: `testPDF.pdf` (Cedar & Spice Kitchen)  
**Vector Store**: Qdrant (`pdf_chunks_gemini_768` + `semantic_cache_gemini_768`)  
**Embedding Model**: Google Gemini (`gemini-embedding-001`, 768 dimensions)  
**Primary LLM**: `gemini-2.5-flash`  
**Fallback LLM**: `gemini-3.5-flash-lite`  
**Date Evaluated**: November 15, 2026  
**Overall Status**: **PASSED (5 / 5 - 100%)**

---

## 1. Executive Summary

An automated evaluation suite was executed against the live RAG retrieval and generation pipeline. The benchmark evaluated retrieval accuracy, anti-hallucination faithfulness, dual-mode fallback behavior, and semantic cache acceleration.

### Scorecard

| Metric | Score / Result | Target Benchmark | Status |
|---|---|---|---|
| **Pass Rate** | **100% (5 / 5)** | $\ge 80\%$ | **EXCEEDED** |
| **Average Faithfulness** | **1.00 / 1.00** | $\ge 0.85$ | **PERFECT** |
| **Retrieval Hit Rate** | **100%** | $\ge 90\%$ | **EXCEEDED** |
| **Semantic Cache Speedup** | **$3,424\text{ms} \rightarrow 486\text{ms}$ (86% faster)** | $\ge 50\%$ | **EXCEEDED** |
| **Off-Topic Noise Rejection** | **100% Clean (`sources: []`)** | $100\%$ | **VERIFIED** |

---

## 2. Detailed Test Results

### Test 1: Factual Retrieval & Pricing
* **Question**: *"What desserts are served at Cedar & Spice Kitchen and what are their prices?"*
* **Retrieved Sources**: `testPDF.pdf` (Chunk Index 1)
* **Status**: `PASS`
* **Faithfulness Score**: `1.00`
* **Latency**: `3,164ms` (Live generation)
* **Outcome**: The model correctly extracted and cited Gulab Jamun (89) and Chocolate Brownie (129) directly from the PDF context without hallucination.

---

### Test 2: Specific Entity & Review Extraction
* **Question**: *"What was Isha R.'s review and rating of the restaurant?"*
* **Retrieved Sources**: `testPDF.pdf` (Chunk Index 2)
* **Status**: `PASS`
* **Faithfulness Score**: `1.00`
* **Latency**: `2,472ms` (Live generation)
* **Outcome**: Extracted the specific reviewer name, date (22 Oct 2026), 4/5 rating, positive remarks on Cold Coffee and outdoor seating, and request for more desserts.

---

### Test 3: Anti-Hallucination / Negative Check
* **Question**: *"Does Cedar & Spice Kitchen serve sushi or Italian pasta on their menu?"*
* **Retrieved Sources**: `testPDF.pdf` (Chunks 0, 1)
* **Status**: `PASS`
* **Faithfulness Score**: `1.00`
* **Latency**: `3,581ms`
* **Outcome**: The LLM did **not** hallucinate or invent fake menu items. It explicitly stated that neither sushi nor Italian pasta are served on the menu based on the provided documents.

---

### Test 4: Out-of-Document / General Knowledge (Dual-Mode)
* **Question**: *"What is the capital of France?"*
* **Retrieved Sources**: `[]` (Empty)
* **Status**: `PASS`
* **Faithfulness Score**: `1.00`
* **Latency**: `2,418ms`
* **Outcome**:
  * **The Problem Solved**: Previously, Qdrant's $K$-nearest neighbor algorithm returned low-relevance restaurant chunks (`score ~0.32`), which confused the LLM.
  * **The Solution Applied**: With the `minScore: 0.50` filter, all low-score restaurant vectors were discarded before reaching the LLM prompt.
  * **The Result**: The API returned clean `sources: []` and answered *"Paris is the capital of France"* using its general knowledge.

---

### Test 5: Semantic Cache Acceleration Test
* **Query 1 (Cache Miss)**: *"What beverages and drinks are available on the menu?"*
  * Latency: `3,424ms`
  * Cached: `false`
* **Query 2 (Semantically Rephrased)**: *"Can you list the beverages and drinks available on the menu?"*
  * Latency: `486ms`
  * Cached: `true`
  * Model Used: `semantic-cache`
* **Status**: `PASS`
* **Speedup**: **86% faster execution ($3,424\text{ms} \rightarrow 486\text{ms}$)**
* **Outcome**: Demonstrates that repeated or paraphrased questions bypass both vector search and LLM generation, saving token costs and reducing user latency.

---

## 3. Key Architecture Learnings & Hardening

1. **Relevance Cutoff (`minScore: 0.50`)**:
   Standard vector search always returns $K$ items regardless of distance. Adding a relevance threshold of `0.50` successfully separates valid document queries from out-of-domain chit-chat.
2. **Qdrant Vector Semantic Cache**:
   Avoids external Redis dependencies by utilizing a dedicated Qdrant collection (`semantic_cache_gemini_768`) with cosine similarity $\ge 0.92$.
3. **Resilient LLM with Auto-Fallback**:
   Protects against Free Tier rate limits (`429`) and model deprecations by cascading from `gemini-2.5-flash` to `gemini-3.5-flash-lite`.

---

## 4. How to Re-Run This Benchmark

Ensure Docker is running, then run:

```bash
cd backend
npm run eval
```
