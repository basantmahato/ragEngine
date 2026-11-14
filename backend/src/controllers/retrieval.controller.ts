import type { NextFunction, Request, Response } from "express";
import type { RetrievalUseCase } from "../types/retrieval.types.js";

export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalUseCase) {}

  query = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { question, topK, threshold } = req.body ?? {};

      if (!question || typeof question !== "string" || !question.trim()) {
        res.status(400).json({
          error: "Validation Error",
          message: "A non-empty 'question' string is required.",
        });
        return;
      }

      const parsedTopK = topK !== undefined ? Number(topK) : undefined;
      const parsedThreshold =
        threshold !== undefined ? Number(threshold) : undefined;

      const result = await this.retrievalService.query({
        question: question.trim(),
        topK: parsedTopK,
        threshold: parsedThreshold,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
