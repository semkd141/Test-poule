import type { RequestHandler } from "express";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.path });
};
