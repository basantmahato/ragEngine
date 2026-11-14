import { GoogleGenAI } from "@google/genai";
import { QdrantClient } from "@qdrant/js-client-rest";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const createGeminiClient = (): GoogleGenAI => {
  const apiKey = getRequiredEnv("GEMINI_API_KEY");
  return new GoogleGenAI({ apiKey });
};

export const createQdrantClient = (): QdrantClient => {
  const url = getRequiredEnv("QDRANT_URL");
  const options: {
    url: string;
    apiKey?: string;
    checkCompatibility?: boolean;
  } = {
    url,
    checkCompatibility: false,
  };

  if (process.env.QDRANT_API_KEY) {
    options.apiKey = process.env.QDRANT_API_KEY;
  }

  return new QdrantClient(options);
};
