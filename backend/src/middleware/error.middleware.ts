import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  console.error("Request error:", error);

  if (res.headersSent) {
    next(error);
    return;
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";

  res.status(500).json({
    error: "Internal Server Error",
    message,
  });
};
