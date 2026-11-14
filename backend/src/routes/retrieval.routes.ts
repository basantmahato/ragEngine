import { Router } from "express";
import type { RetrievalController } from "../controllers/retrieval.controller.js";

export const createRetrievalRoutes = (
  controller: RetrievalController,
): Router => {
  const router = Router();
  router.post("/query", controller.query);
  return router;
};
