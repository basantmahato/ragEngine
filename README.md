# RAG Engine Backend

A high-performance, layered **Retrieval-Augmented Generation (RAG)** engine built with **Express 5**, **TypeScript**, **Qdrant Vector DB**, and **Google Gemini**.

Features:
* **Clean Layered Architecture & Manual Dependency Injection** (Single Composition Root, zero IoC containers).
* **Single Application Entry Point** (`src/index.ts`).
* **Document Ingestion Pipeline**: In-memory PDF parsing, character-level text chunking, and Gemini 768-dim vector embeddings stored in Qdrant.
* **Retrieval & QA Pipeline**: Vector similarity search + contextual QA generation.
* **Vector Semantic Caching**: Qdrant-backed similarity cache ($\ge 0.92$ threshold) for sub-$20\text{ms}$ responses on repeated/rephrased queries with zero extra Redis containers.
* **Resilient LLM with Auto-Fallback**: Primary model (`gemini-2.5-flash`) with automatic, transparent fallback to `gemini-1.5-flash` on rate limits or service errors.

---

## Architecture Overview

```
HTTP Request
     │
     ▼
[index.ts]                 Single entry point (Express, config, startup verification)
     │
     ▼
[factories/]               Composition Root (Pure manual Dependency Injection)
  ├── ingestion.factory.ts
  └── retrieval.factory.ts
     │
     ▼
[routes/]                  Pure Express Routers (HTTP verb + path mapping only)
  ├── ingestion.routes.ts   (POST /ingestion/upload)
  └── retrieval.routes.ts   (POST /retrieval/query)
     │
     ▼
[controllers/]             HTTP Adapters (Validate input, delegate to service, return DTO)
  ├── ingestion.controller.ts
  └── retrieval.controller.ts
     │
     ▼
[services/]                Domain Logic & Pipeline Orchestration
  ├── ingestion/           (PDF Extractor, Text Chunker, Ingestion Service)
  ├── retrieval/           (Retrieval Service, Gemini LLM, Fallback Resilient LLM)
  └── shared/              (Gemini Embedding Service for Docs & Queries)
     │
     ▼
[repository/]              Data Access Layer (Only place SDK/DB calls live)
  ├── qdrant-vector.repository.ts          (Document Chunks Collection)
  └── qdrant-semantic-cache.repository.ts  (Semantic Cache Collection)
     │
     ▼
[External Infrastructure]
  ├── Qdrant Vector Engine (Docker on port 6333)
  └── Google Gemini API
```

---

## Prerequisites

Before starting, ensure you have:
1. **Node.js** (v20.0.0 or higher, v22+ recommended).
2. **Docker Desktop** (or a free account on [Qdrant Cloud](https://cloud.qdrant.io/)).
3. **Google Gemini API Key** (Get a free key from [Google AI Studio](https://aistudio.google.com/app/apikey)).

---

## Step-by-Step Installation Guide

### Step 1: Install Dependencies

From the repository root, enter the `backend` folder and install dependencies:

```bash
cd backend
npm install
```

---

### Step 2: Configure Environment Variables

Create your `.env` file in the `backend/` directory:

```bash
cp .env.example .env
```

Open `backend/.env` and fill in your values:

```env
PORT=3000
QDRANT_URL=http://localhost:6333
# QDRANT_API_KEY=optional_if_using_cloud_qdrant

# Paste your Gemini API key from Google AI Studio:
GEMINI_API_KEY=your_gemini_api_key_here
```

---

### Step 3: Start the Qdrant Vector Database

Start Qdrant locally using Docker Compose from the project root:

```bash
# Make sure Docker Desktop is open and running first
docker compose up -d
```

To verify Qdrant is running, open [http://localhost:6333/dashboard](http://localhost:6333/dashboard) in your browser. You should see Qdrant's built-in visual web dashboard.

> **Alternative (No Docker)**: If you prefer not to run Docker locally, create a free 1GB cluster on [Qdrant Cloud](https://cloud.qdrant.io/), and set `QDRANT_URL` and `QDRANT_API_KEY` in `backend/.env`.

---

### Step 4: Run the Backend Server

```bash
cd backend
npm run dev
```

You should see:
```
Vector collections (pdf_chunks & semantic_cache) verified successfully.
Server is running on http://localhost:3000
```

---

## API Endpoints & Request Formats

### 1. Ingestion: Upload & Index PDF
Extracts text from a PDF, splits it into chunks (3,000 chars, 300 overlap), computes Gemini embeddings, and stores them in Qdrant.

* **URL**: `POST http://localhost:3000/ingestion/upload`
* **Content-Type**: `multipart/form-data`
* **Form Field**: `file` (Binary PDF file, max 10MB)

**cURL Example**:
```bash
curl -X POST http://localhost:3000/ingestion/upload \
  -F "file=@sample.pdf"
```

**Success Response (`201 Created`)**:
```json
{
  "source": "sample.pdf",
  "chunkCount": 8
}
```

---

### 2. Retrieval: Ask Questions (RAG + Semantic Cache)
Embeds the query, checks the Qdrant semantic cache for similar previous questions ($\ge 0.92$), searches document chunks on cache miss, and generates an answer using Gemini with automatic fallback.

* **URL**: `POST http://localhost:3000/retrieval/query`
* **Content-Type**: `application/json`

**Request Body**:
```json
{
  "question": "What is the policy for sick leave?",
  "topK": 5,        // (Optional, default: 5) Number of chunks to retrieve
  "threshold": 0.92 // (Optional, default: 0.92) Semantic cache similarity cutoff
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/retrieval/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the policy for sick leave?"}'
```

**Response — Cache Miss (`200 OK`, ~1.5s)**:
```json
{
  "question": "What is the policy for sick leave?",
  "answer": "According to the handbook, employees are entitled to 10 paid sick days per year.",
  "sources": [
    {
      "id": "7b3b4f62-...",
      "text": "Sick leave policy: Employees receive 10 days...",
      "source": "handbook.pdf",
      "score": 0.892,
      "chunkIndex": 3
    }
  ],
  "cached": false,
  "modelUsed": "gemini-2.5-flash"
}
```

**Response — Semantic Cache Hit (`200 OK`, ~15ms)**:
*(When asking the same or semantically reworded question)*
```json
{
  "question": "Tell me about sick days policy",
  "answer": "According to the handbook, employees are entitled to 10 paid sick days per year.",
  "sources": [
    {
      "id": "7b3b4f62-...",
      "text": "Sick leave policy: Employees receive 10 days...",
      "source": "handbook.pdf",
      "score": 0.954,
      "chunkIndex": 3
    }
  ],
  "cached": true,
  "modelUsed": "semantic-cache"
}
```

---

### 3. Health Check
* **URL**: `GET http://localhost:3000/`
* **Response (`200 OK`)**:
```json
{
  "message": "RAG Engine API is active"
}
```

---

## Scripts & Testing

Inside `backend/`:

| Command | Purpose |
|---|---|
| `npm run dev` | Starts server with live auto-reload using `tsx watch` |
| `npm start` | Starts server with `tsx` |
| `npm run typecheck` | Runs TypeScript compiler checks without emitting files (`tsc --noEmit`) |
| `npm test` | Runs the automated unit test suite with Node's native test runner (`tsx --test`) |

---

## Directory Structure

```
RagEngine/
├── docker-compose.yml                 # Qdrant Docker configuration
├── .gitignore
├── README.md
└── backend/
    ├── .env                           # Environment variables (secret)
    ├── .env.example                   # Template environment file
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts                   # Single application entry point
        ├── config/
        │   └── clients.ts             # Qdrant & Gemini client factories
        ├── controllers/
        │   ├── ingestion.controller.ts
        │   └── retrieval.controller.ts
        ├── factories/
        │   ├── index.ts               # Barrel export for feature factories
        │   ├── ingestion.factory.ts   # Composition root for Ingestion
        │   └── retrieval.factory.ts   # Composition root for Retrieval
        ├── middleware/
        │   └── error.middleware.ts    # Global centralized error handler
        ├── repository/
        │   ├── qdrant-vector.repository.ts          # Document vectors
        │   └── qdrant-semantic-cache.repository.ts  # Semantic cache vectors
        ├── routes/
        │   ├── ingestion.routes.ts    # Ingestion Express router
        │   └── retrieval.routes.ts    # Retrieval Express router
        ├── services/
        │   ├── ingestion/             # Ingestion domain services
        │   │   ├── ingestion.service.ts
        │   │   ├── pdf-text-extractor.service.ts
        │   │   ├── text-chunker.service.ts
        │   │   └── index.ts
        │   ├── retrieval/             # Retrieval domain services
        │   │   ├── retrieval.service.ts
        │   │   ├── gemini-llm.service.ts
        │   │   ├── fallback-llm.service.ts
        │   │   ├── retrieval.service.test.ts
        │   │   ├── fallback-llm.service.test.ts
        │   │   └── index.ts
        │   └── shared/                # Cross-pipeline services
        │       ├── gemini-embedding.service.ts
        │       └── index.ts
        └── types/
            ├── ingestion.types.ts     # DTOs & Port interfaces
            └── retrieval.types.ts     # DTOs & Port interfaces
```

---

## Troubleshooting

### Error: `ECONNREFUSED` on port 6333
* **Cause**: Qdrant is not running.
* **Solution**: Launch Docker Desktop and run `docker compose up -d` in the root folder, or check your Qdrant Cloud URL/API key in `.env`.

### Error: `Missing required environment variable: GEMINI_API_KEY`
* **Cause**: The `GEMINI_API_KEY` is missing from `backend/.env`.
* **Solution**: Generate a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey) and add it to `backend/.env`.
