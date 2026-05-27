import express from "express";
import { scanAll } from "../helpers.js";
import { authorsTable } from "../helpers.js";

const router = express.Router();

/**
 * GET /api/authors
 * Gibt alle Autoren zurück (für Dropdowns und Filterauswahl).
 */
router.get("/", async (_req, res) => {
  try {
    const authors = await scanAll(authorsTable);
    return res.json(authors);
  } catch (error) {
    return res.status(500).json({ message: "Autoren konnten nicht geladen werden." });
  }
});

export default router;
