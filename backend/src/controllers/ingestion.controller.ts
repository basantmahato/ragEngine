import type { NextFunction, Request, Response } from "express";
import type { IngestionUseCase } from "../types/ingestion.types.js";

export class IngestionController {
  constructor(private readonly ingestionService: IngestionUseCase) {}

  upload = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ message: "Upload a PDF in the 'file' field." });
        return;
      }

      if (req.file.mimetype !== "application/pdf") {
        res.status(400).json({ message: "Only PDF files are accepted." });
        return;
      }

      const result = await this.ingestionService.ingestPdf(
        req.file.originalname,
        req.file.buffer,
      );

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };
}
