import { Router } from "express";
import multer from "multer";
import type { IngestionController } from "../controllers/ingestion.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const createIngestionRoutes = (controller: IngestionController): Router => {
  const router = Router();
  router.post("/upload", upload.single("file"), controller.upload);
  return router;
};
